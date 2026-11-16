package com.chenbenkong.chongzhen.engine

import com.chenbenkong.chongzhen.data.EventEffects
import com.chenbenkong.chongzhen.data.GameData
import com.chenbenkong.chongzhen.data.GameEvent
import com.chenbenkong.chongzhen.data.OriginConfig
import com.chenbenkong.chongzhen.engine.boundary.BoundaryEngine
import com.chenbenkong.chongzhen.engine.boundary.BoundaryHit
import com.chenbenkong.chongzhen.engine.conditions.ConditionContext
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import com.chenbenkong.chongzhen.engine.effects.AppliedEffects
import com.chenbenkong.chongzhen.engine.effects.EffectApplier
import com.chenbenkong.chongzhen.engine.effects.FailFallback
import com.chenbenkong.chongzhen.engine.pools.EventPool
import com.chenbenkong.chongzhen.engine.ranks.RankService
import com.chenbenkong.chongzhen.engine.save.SaveData
import com.chenbenkong.chongzhen.engine.save.SaveSerializer
import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

// ============================================================================
// 引擎门面：把数据层 / 条件 / 效果 / 官阶 / 事件池 / 边界 / 存档串成一局流程。
// 本类不接触 Android UI；JVM 单测与后续 Compose 界面共用同一套接口。
// ============================================================================

/** 一次抉择的结算结果。 */
data class ChoiceOutcome(
    val choiceId: String,
    val applied: AppliedEffects,
    val resultTitle: String?,
    val resultEcho: String?,
    val endingHit: BoundaryHit?,
    /** 本次投骰点数（未走投骰为 null）。 */
    val diceRoll: Int? = null,
    /** 投骰成败（未走投骰为 null）。 */
    val diceSuccess: Boolean? = null,
    /** 本次是否走了失败分支（failEffects 或反推失败效果）。 */
    val usedFailEffects: Boolean = false
)

class GameEngine(
    val data: GameData,
    seed: Long = 0L
) {
    val random: Random = Random(seed)
    private val pool = EventPool(data, random)
    private val boundary = BoundaryEngine(data, random)

    lateinit var state: GameState
        private set

    var currentEvent: GameEvent? = null
        private set
    private val pendingEvents: MutableList<GameEvent> = mutableListOf()

    /** 悔棋栈：每次抉择前压一份深拷贝快照；不持久化进存档，读档后清空。 */
    private val undoStack: MutableList<SaveData> = mutableListOf()

    var lastOutcome: ChoiceOutcome? = null
        private set
    var activeEnding: BoundaryHit? = null
        private set
    var lastCrisis: BoundaryHit? = null
        private set

    /** 可撤销步数。 */
    fun canUndo(): Boolean = undoStack.isNotEmpty()

    // ------------------------------------------------------------------ 开局

    fun newGame(
        playerName: String,
        originType: String,
        degree: String,
        difficultyId: String,
        bonusAttributes: Map<String, Double> = emptyMap()
    ) {
        val origin: OriginConfig = data.origins.firstOrNull { it.type == originType }
            ?: data.origins.first()

        val attrs = mutableMapOf<String, Double>()
        attrs.putAll(data.defaults.attributes)
        attrs.putAll(origin.initialAttributes)
        attrs.putAll(bonusAttributes)

        val hidden = mutableMapOf<String, Double>()
        HIDDEN_KEYS.forEach { hidden[it] = 50.0 }
        hidden.putAll(origin.initialHidden)

        val court = GameStateValues(
            currentYear = data.constants.gameStartYear,
            currentMonth = 1,
            turn = 0,
            圣眷 = origin.initialGameState["圣眷"] ?: 50.0,
            中官 = origin.initialGameState["中官"] ?: 50.0,
            清议 = origin.initialGameState["清议"] ?: 50.0,
            士绅 = origin.initialGameState["士绅"] ?: 50.0,
            民望 = origin.initialGameState["民望"] ?: 0.0,
            国势 = 75.0
        )

        val age = when (degree) {
            "进士" -> 22.0
            "举人" -> 24.0
            else -> 16.0 + random.nextInt(6)
        }

        val character = CharacterState(
            name = playerName,
            age = age,
            origin = origin.type,
            rank = "正七品·知县",
            degree = degree,
            attributes = attrs,
            hidden = hidden,
            flags = mutableListOf("地方官任职"),
            flagTurns = mutableMapOf("地方官任职" to 0)
        )

        state = GameState(
            character = character,
            court = court,
            difficultyId = difficultyId
        )
        activeEnding = null
        lastCrisis = null
        lastOutcome = null
        pendingEvents.clear()
        undoStack.clear()
        drawInitial()
    }

    /** 开局第一张牌。 */
    fun drawInitial() {
        val picked = pool.drawMonth(state.court, state.character, state.seenEventIds, state.lastTurnById)
        currentEvent = picked.firstOrNull()
        pendingEvents.clear()
        pendingEvents.addAll(picked.drop(1))
    }

    // ------------------------------------------------------------------ 抉择

    /**
     * 选择当前事件的某个选项；返回结算结果，结局命中挂在 outcome.endingHit。
     *
     * 门控口径：
     * - 选项开放 → 直接走原 effects / result；
     * - 锁定但可勉力一试（难度门：属性 / 态度 / 隐藏 / 体质）→ 投 1..6，
     *   点数 ≥ difficulty 走成功分支，否则优先 failEffects，缺失则按成功效果反推；
     * - 出身 / 官阶 / 经历类锁定（difficulty=null）→ 路线封闭，返回 null。
     *
     * @param diceRoll 测试可显式指定点数；缺省由引擎随机源投掷。
     */
    fun chooseChoice(choiceId: String, diceRoll: Int? = null): ChoiceOutcome? {
        if (state.gameOver) return null
        val event = currentEvent ?: return null
        val choice = event.choices.firstOrNull { it.id == choiceId } ?: return null

        val ctx = ConditionContext.from(state.court, state.character)
        val availability = ConditionEvaluator.evaluateChoiceDetailed(
            choice, ctx, random, gateLabels()
        )

        var roll: Int? = null
        var diceSuccess: Boolean? = null
        var usedFailEffects = false
        val effectsToApply: EventEffects
        val resultTitle: String?
        val resultEcho: String?

        if (!availability.available) {
            // 路线封闭：出身 / 官阶 / 经历 / 概率未中，不可勉力一试。
            if (availability.difficulty == null) return null

            roll = diceRoll ?: random.nextInt(6) + 1
            val difficulty = availability.difficulty ?: 3
            diceSuccess = roll >= difficulty

            if (diceSuccess) {
                effectsToApply = choice.effects
                resultTitle = choice.result?.title ?: choice.failResult?.title
                resultEcho = choice.result?.echo ?: choice.failResult?.echo
            } else {
                usedFailEffects = true
                effectsToApply = choice.failEffects ?: FailFallback.deriveFailEffects(choice)
                val generated = FailFallback.generateFailEcho(
                    choice, availability.reasonText, availability.conditionKey,
                    availability.gap, event
                )
                resultTitle = choice.failResult?.title ?: generated.title
                resultEcho = choice.failResult?.echo ?: generated.echo
            }
        } else {
            effectsToApply = choice.effects
            resultTitle = choice.result?.title ?: choice.failResult?.title
            resultEcho = choice.result?.echo ?: choice.failResult?.echo
        }

        // 抉择前深拷贝快照（悔棋用），必须在任何写入之前取。
        val snapshot = snapshotUndo()

        // 体力代价（先扣）与体力加成（后加），与 Web handleChoice 同序。
        choice.staminaCost?.let { cost ->
            if (cost > 0) {
                val next = (state.character.attributes["体质"] ?: 0.0) - cost
                state.character.attributes["体质"] = clamp0_100(next)
            }
        }

        val difficulty = difficultyConfig()
        val applied = EffectApplier.apply(
            effects = effectsToApply,
            character = state.character,
            court = state.court,
            turn = state.court.turn,
            attributeMultiplier = difficulty.attributeMultiplier,
            fugitiveFlag = data.constants.fugitiveFlag
        )

        choice.staminaBonus?.let { bonus ->
            if (bonus > 0) {
                val next = (state.character.attributes["体质"] ?: 0.0) + bonus
                state.character.attributes["体质"] = clamp0_100(next)
            }
        }

        state.character.history.add(
            "${state.court.currentYear}年${state.court.currentMonth}月：${event.title} - ${choice.text}"
        )
        state.meritBonus += applied.meritBonus
        state.stats.eventCount += 1

        // 政绩分与升降官
        recomputeMeritAndRank(event.type)

        // 事件入已播集合，记录冷却月份
        state.seenEventIds.add(event.id)
        state.lastTurnById[event.id] = state.court.turn

        // 抉择后结局判定
        val endingHit = boundary.checkEnding(ctxAfter(), state.character, state.court)
        var ending: BoundaryHit? = endingHit
        if (endingHit != null) {
            // 可搁笔结局：只摆牌不结算
            if (!endingHit.declinable) {
                state.gameOver = true
                state.activeEndingId = endingHit.eventId
            }
            activeEnding = endingHit
        }

        val outcome = ChoiceOutcome(
            choiceId = choiceId,
            applied = applied,
            resultTitle = resultTitle,
            resultEcho = resultEcho,
            endingHit = ending,
            diceRoll = roll,
            diceSuccess = diceSuccess,
            usedFailEffects = usedFailEffects
        )
        lastOutcome = outcome

        // 同月队列出列
        currentEvent = pendingEvents.removeFirstOrNull()

        // 压悔棋栈，封顶 20 步（至少满足连续 3 步撤销）。
        undoStack.add(snapshot)
        while (undoStack.size > MAX_UNDO_STEPS) undoStack.removeFirst()

        return outcome
    }

    /** 撤销上一步抉择：恢复到抉择前快照；栈空返回 false。 */
    fun undo(): Boolean {
        if (undoStack.isEmpty()) return false
        val snapshot = undoStack.removeLast()
        applySave(snapshot)
        return true
    }

    // ------------------------------------------------------------------ 推进月份

    /** 进入下个月：推进日历 → 危机判定 → 结局判定 → 发牌。 */
    fun advanceMonth() {
        if (state.gameOver) return

        state.court.currentMonth += 1
        if (state.court.currentMonth > 12) {
            state.court.currentMonth = 1
            state.court.currentYear += 1
        }
        state.court.turn += 1
        state.character.age += 1.0 / 12.0

        val ctx = ctxAfter()

        // 危机事件（低位救济类）
        val crisis = boundary.checkCrisis(ctx, state.character, state.court, state.lastTurnById)
        lastCrisis = crisis
        if (crisis != null && crisis.event != null) {
            pendingEvents.add(0, crisis.event)
            state.lastTurnById[crisis.registryId] = state.court.turn
        }

        // 结局判定
        val endingHit = boundary.checkEnding(ctx, state.character, state.court)
        if (endingHit != null) {
            if (!endingHit.declinable) {
                state.gameOver = true
                state.activeEndingId = endingHit.eventId
            }
            activeEnding = endingHit
            currentEvent = endingHit.event ?: currentEvent
            return
        }

        if (currentEvent == null) {
            val picked = pool.drawMonth(state.court, state.character, state.seenEventIds, state.lastTurnById)
            currentEvent = picked.firstOrNull()
            pendingEvents.clear()
            pendingEvents.addAll(picked.drop(1))
        }
    }

    // ------------------------------------------------------------------ 存档

    fun toSaveData(): SaveData = SaveData(
        savedAt = java.time.Instant.now().toString(),
        playerName = state.character.name,
        origin = state.character.origin,
        degree = state.character.degree,
        identityType = state.identityType,
        difficulty = state.difficultyId,
        character = state.character,
        gameState = state.court,
        eventHistory = state.seenEventIds.toList(),
        currentEventId = currentEvent?.id,
        pendingEventIds = pendingEvents.map { it.id },
        lastTurnById = state.lastTurnById.toMap(),
        meritBonus = state.meritBonus,
        meritScore = state.meritScore,
        previousMeritScore = state.previousMeritScore
    )

    fun restore(save: SaveData) {
        applySave(save)
        // 悔棋栈不持久化：读档后清空。
        undoStack.clear()
    }

    /** 把存档状态写回内存（撤销与读档共用）。 */
    private fun applySave(save: SaveData) {
        state = GameState(
            character = save.character,
            court = save.gameState,
            difficultyId = save.difficulty,
            currentEventId = save.currentEventId,
            pendingEventIds = save.pendingEventIds.toMutableList(),
            seenEventIds = save.eventHistory.toMutableList(),
            lastTurnById = save.lastTurnById.toMutableMap(),
            meritBonus = save.meritBonus,
            meritScore = save.meritScore,
            previousMeritScore = save.previousMeritScore,
            identityType = save.identityType
        )
        currentEvent = data.events.firstOrNull { it.id == save.currentEventId }
        pendingEvents.clear()
        pendingEvents.addAll(save.pendingEventIds.mapNotNull { id -> data.events.firstOrNull { it.id == id } })
        activeEnding = null
        lastCrisis = null
        lastOutcome = null
    }

    /** 抉择前深拷贝快照（序列化往返保证互不引用）。 */
    private fun snapshotUndo(): SaveData {
        val save = toSaveData()
        return SaveSerializer.fromJson(SaveSerializer.toJson(save))
    }

    /** 经历票人话标签表（flag → line），供选项锁闭原因展示。 */
    fun gateLabels(): Map<String, String> =
        data.flagGateLabels.associate { it.flag to it.line }

    private fun clamp0_100(v: Double): Double = max(0.0, min(100.0, v))

    // ------------------------------------------------------------------ 内部

    private fun difficultyConfig() =
        data.difficulties.firstOrNull { it.id == state.difficultyId }
            ?: data.difficulties.firstOrNull { it.id == data.defaultDifficulty }
            ?: com.chenbenkong.chongzhen.data.DifficultyConfig(id = "normal")

    private fun ctxAfter() = ConditionContext.from(state.court, state.character)

    private fun recomputeMeritAndRank(eventType: String?) {
        val difficulty = difficultyConfig()
        val baseScore = RankService.calculateMeritScore(state.character, state.court, eventType) +
            kotlin.math.round(state.meritBonus)
        val adjustedScore = baseScore / difficulty.promotionThresholdMultiplier
        state.meritScore = baseScore

        if (state.identityType == "official") {
            val promotion = RankService.checkPromotion(adjustedScore, state.previousMeritScore, data.ranks)
            if (promotion.promoted) {
                state.character.rank = promotion.newRank ?: state.character.rank
                state.character.promotionCount += 1
                state.previousMeritScore = adjustedScore + promotion.scoreBonus
                return
            }
            val demotion = RankService.checkDemotion(
                adjustedScore, state.previousMeritScore, state.character, state.court, data.ranks,
                data.constants.fugitiveFlag, data.constants.corruptionWarningFlag,
                data.constants.zeroWarnFlagPrefix
            )
            if (demotion.demoted) {
                if (demotion.newIdentity == "exiled" || demotion.newIdentity == "civilian") {
                    state.identityType = demotion.newIdentity ?: "civilian"
                } else {
                    state.character.rank = demotion.newRank ?: state.character.rank
                    state.character.demotionCount += 1
                }
            }
        }
        state.previousMeritScore = adjustedScore
    }

    private companion object {
        val HIDDEN_KEYS = setOf("道德值", "欲望值", "野心值")
        const val MAX_UNDO_STEPS = 20
    }
}
