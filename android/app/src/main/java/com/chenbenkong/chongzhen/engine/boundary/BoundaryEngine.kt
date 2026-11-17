package com.chenbenkong.chongzhen.engine.boundary

import com.chenbenkong.chongzhen.data.BoundaryEntry
import com.chenbenkong.chongzhen.data.GameData
import com.chenbenkong.chongzhen.data.GameEvent
import com.chenbenkong.chongzhen.engine.conditions.ConditionContext
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import kotlin.random.Random

// ============================================================================
// 边界引擎：结局 / 危机事件判定。
// - compiledConditions：条件烘在事件自身 conditions 上，标准条件区间模型求值；
// - 手写规则：22 条全部在 Kotlin 显式移植（8 归零死线 + 2 低位危机 + 3 党派结局
//   + 8 归零警告 + 1 贪墨预警）；未移植清单为空；
// - 自定义规则 ending_famous_minister：票计数 OR 任一额外票。
// ============================================================================

/** 一次边界命中。 */
data class BoundaryHit(
    val registryId: String,
    val eventId: String,
    val event: GameEvent?,
    val ported: Boolean,
    /** 可搁笔结局：只摆牌不结算。 */
    val declinable: Boolean,
    val unportedReason: String? = null
)

class BoundaryEngine(
    private val data: GameData,
    private val random: Random
) {
    private val eventsById: Map<String, GameEvent> = data.events.associateBy { it.id }

    /** 已在 Kotlin 移植的手写规则 registryId（22 条全部移植）。 */
    val portedIds: Set<String> = setOf(
        // 八条归零死线结局
        "bankrupt", "death_illness", "emperor_hate", "eunuch_conspiracy",
        "scholar_ostracism", "gentry_rebellion", "popular_uproar", "moral_degeneracy",
        // 两条低位危机
        "serious_illness", "inner_court_channel",
        // 三条党派结局
        "faction_donglin_martyr", "faction_tyrant_fall", "faction_sacrifice",
        // 八条归零警告（warning 卡，一生一次，flag 由事件选项自身写入）
        "warn_zero_财帛", "warn_zero_体质", "warn_zero_圣眷", "warn_zero_中官",
        "warn_zero_清议", "warn_zero_士绅", "warn_zero_民望", "warn_zero_道德值",
        // 一条贪墨预警
        "warn_corruption"
    )

    /** 未移植规则清单（来自 unportableRules 登记，且不在已移植集合内）。 */
    val unportedRules: List<UnportedRule> = data.unportableRules
        .filter { it.registryId !in portedIds }
        .map { UnportedRule(it.registryId, it.eventId, it.description, it.reason) }

    val unportedCount: Int get() = unportedRules.size

    fun checkEnding(ctx: ConditionContext, character: CharacterState, court: GameStateValues): BoundaryHit? =
        checkByType("ending", ctx, character, court, emptyMap(), emptySet())

    fun checkCrisis(
        ctx: ConditionContext,
        character: CharacterState,
        court: GameStateValues,
        lastTurnById: Map<String, Int>,
        seenEventIds: Set<String> = emptySet()
    ): BoundaryHit? = checkByType("crisis", ctx, character, court, lastTurnById, seenEventIds)

    // ------------------------------------------------------------------ 内部

    private fun checkByType(
        type: String,
        ctx: ConditionContext,
        character: CharacterState,
        court: GameStateValues,
        lastTurnById: Map<String, Int>,
        seenEventIds: Set<String>
    ): BoundaryHit? {
        val sorted = data.boundaryEvents.filter { it.type == type }.sortedBy { it.priority }
        for (entry in sorted) {
            // 本局已经播过的危机卡不再发；读档后 eventHistory 仍在，照样生效。
            if (type == "crisis" && entry.eventId in seenEventIds) continue
            when (val verdict = evaluateEntry(entry, ctx, character, court, lastTurnById)) {
                is EntryVerdict.Matched -> return hit(entry, matched = true)
                is EntryVerdict.Unported -> return BoundaryHit(
                    registryId = entry.registryId,
                    eventId = entry.eventId,
                    event = eventsById[entry.eventId],
                    ported = false,
                    declinable = isDeclinable(entry.eventId),
                    unportedReason = verdict.reason
                )
                EntryVerdict.Miss -> continue
            }
        }
        return null
    }

    private fun hit(entry: BoundaryEntry, matched: Boolean): BoundaryHit = BoundaryHit(
        registryId = entry.registryId,
        eventId = entry.eventId,
        event = eventsById[entry.eventId],
        ported = entry.registryId in portedIds || entry.rule.kind == "compiledConditions",
        declinable = isDeclinable(entry.eventId)
    )

    private fun isDeclinable(eventId: String): Boolean {
        val event = eventsById[eventId]
        if (event?.declinable == true) return true
        return eventId in data.endings.declinableEndingIds
    }

    private fun evaluateEntry(
        entry: BoundaryEntry,
        ctx: ConditionContext,
        character: CharacterState,
        court: GameStateValues,
        lastTurnById: Map<String, Int>
    ): EntryVerdict = when (entry.rule.kind) {
        // compiledConditions：条件烘在事件自身 conditions 上（年/月兜底地板导出时已烘入）。
        "compiledConditions" -> {
            val event = eventsById[entry.eventId]
            if (event != null &&
                ConditionEvaluator.evaluate(event.conditions, ctx, random) &&
                customRulePasses(entry.registryId, character)
            ) EntryVerdict.Matched else EntryVerdict.Miss
        }
        "handwrittenCheck" -> {
            if (entry.registryId in portedIds) {
                if (handwrittenPasses(entry.registryId, ctx, character, court, lastTurnById)) {
                    EntryVerdict.Matched
                } else EntryVerdict.Miss
            } else {
                EntryVerdict.Unported("手写闭包未移植：${entry.rule.note ?: entry.registryId}")
            }
        }
        else -> EntryVerdict.Unported("未知规则种类：${entry.rule.kind}")
    }

    /** 自定义规则：ending_famous_minister 票计数 OR 任一额外票。 */
    private fun customRulePasses(registryId: String, character: CharacterState): Boolean {
        val rule = data.customRules.firstOrNull { it.eventId == registryId } ?: return true
        if (rule.kind != "ticketCountOrAny") return true
        val cleanTickets = rule.params["cleanTickets"]?.let { jsonArray ->
            (jsonArray as? kotlinx.serialization.json.JsonArray)?.map { (it as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "" }
        }.orEmpty()
        val extraTickets = rule.params["extraTickets"]?.let { jsonArray ->
            (jsonArray as? kotlinx.serialization.json.JsonArray)?.map { (it as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "" }
        }.orEmpty()
        val cleanMin = (rule.params["cleanMin"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull() ?: 1.0
        val cleanHeld = cleanTickets.count { character.flags.contains(it) }
        val extraHeld = extraTickets.any { character.flags.contains(it) }
        return cleanHeld >= cleanMin || extraHeld
    }

    private fun handwrittenPasses(
        registryId: String,
        ctx: ConditionContext,
        character: CharacterState,
        court: GameStateValues,
        lastTurnById: Map<String, Int>
    ): Boolean {
        val grace = data.constants.thresholdGraceTurns
        return when {
            // ---- 八条归零死线：宽限期 + 归零 + 已警告 ----
            registryId == "bankrupt" -> doomedBy("attributes", "财帛", grace, ctx, character)
            registryId == "death_illness" -> doomedBy("attributes", "体质", grace, ctx, character)
            registryId == "emperor_hate" -> doomedBy("gameState", "圣眷", grace, ctx, character) &&
                !character.flags.contains(data.constants.fugitiveFlag)
            registryId == "eunuch_conspiracy" -> doomedBy("gameState", "中官", grace, ctx, character)
            registryId == "scholar_ostracism" -> doomedBy("gameState", "清议", grace, ctx, character)
            registryId == "gentry_rebellion" -> doomedBy("gameState", "士绅", grace, ctx, character)
            registryId == "popular_uproar" -> doomedBy("gameState", "民望", grace, ctx, character)
            registryId == "moral_degeneracy" -> doomedBy("hidden", "道德值", grace, ctx, character)

            // ---- 低位危机（概率门 0.3 + 冷却 8 个月）----
            registryId == "serious_illness" -> crisisGated(registryId, lastTurnById, court.turn) &&
                (ctx.attributes["体质"] ?: 0.0) in 1.0..19.0
            registryId == "inner_court_channel" -> crisisGated(registryId, lastTurnById, court.turn) &&
                !character.flags.contains(data.constants.fugitiveFlag) &&
                (ctx.gameState["中官"] ?: 0.0) in 1.0..30.0

            // ---- 八条归零警告（确定性触发，不走概率门；flag 由警告卡选项写入）----
            registryId.startsWith("warn_zero_") -> warnZeroPasses(registryId, ctx, character)
            registryId == "warn_corruption" -> corruptionPasses(ctx, character, court)

            // ---- 党派结局（年下限逐条对照 unportableRules）----
            registryId == "faction_donglin_martyr" -> settledIn(court, 1644) &&
                ctx.factionDonglin >= 80 && ctx.factionEunuch <= 20 &&
                (character.flags.contains("东林死忠") || character.flags.contains("复社成员")) &&
                (ctx.gameState["清议"] ?: 0.0) >= 60
            registryId == "faction_tyrant_fall" -> settledIn(court, 1637) &&
                ctx.factionEunuch >= 70 && ctx.factionDonglin <= 15 &&
                !character.flags.contains("阉党路线") &&
                character.flags.contains("叛徒") &&
                (ctx.hidden["道德值"] ?: 50.0) <= 30
            registryId == "faction_sacrifice" -> settledIn(court, 1635) &&
                ctx.factionStrife >= 90 &&
                kotlin.math.abs(ctx.factionDonglin - ctx.factionEunuch) < 20 &&
                ctx.factionDonglin < 40 && ctx.factionEunuch < 40

            else -> false
        }
    }

    /**
     * 归零警告：对应维度 ≤0 且身上还没有「归零警告·key」票 → 发警告卡。
     * 不在判定里手动 add flag；flag 由警告事件自身选项结算写入。
     */
    private fun warnZeroPasses(registryId: String, ctx: ConditionContext, character: CharacterState): Boolean {
        val key = registryId.removePrefix("warn_zero_")
        val spec = data.constants.zeroThresholds.firstOrNull { it.key == key } ?: return false
        val value = when (spec.group) {
            "attributes" -> ctx.attributes[key] ?: 0.0
            "hidden" -> ctx.hidden[key] ?: 50.0
            else -> ctx.gameState[key] ?: 0.0
        }
        if (value > 0) return false
        return !character.flags.contains("${data.constants.zeroWarnFlagPrefix}$key")
    }

    /** 贪墨预警：过宽限期、未持预警票；财帛>70、欲望>75、道德<30（道德缺省 100）。 */
    private fun corruptionPasses(ctx: ConditionContext, character: CharacterState, court: GameStateValues): Boolean {
        if (court.turn < data.constants.thresholdGraceTurns) return false
        if (character.flags.contains(data.constants.corruptionWarningFlag)) return false
        val 财帛 = ctx.attributes["财帛"] ?: 0.0
        val 欲望值 = ctx.hidden["欲望值"] ?: 50.0
        val 道德值 = ctx.hidden["道德值"] ?: 100.0
        return 财帛 > 70 && 欲望值 > 75 && 道德值 < 30
    }

    /** 归零死线统一判据：过宽限期 + 维度归零 + 已警告。 */
    private fun doomedBy(
        group: String,
        key: String,
        grace: Int,
        ctx: ConditionContext,
        character: CharacterState
    ): Boolean {
        if (ctx.turn < grace) return false
        val value = when (group) {
            "attributes" -> ctx.attributes[key]
            "hidden" -> ctx.hidden[key]
            else -> ctx.gameState[key]
        } ?: return false
        if (value > 0) return false
        return character.flags.contains("${data.constants.zeroWarnFlagPrefix}$key")
    }

    /** 党派结局时间下限：turn≥36 且 year≥max(叙事最早年, 绑定年)。 */
    private fun settledIn(court: GameStateValues, minYear: Int): Boolean {
        return court.turn >= data.constants.narrativeMinTurn &&
            court.currentYear >= maxOf(data.constants.narrativeMinYear, minYear)
    }

    /** 危机概率门 0.3 + 8 个月冷却（警告类不走概率/冷却，未移植在此不涉及）。 */
    private fun crisisGated(registryId: String, lastTurnById: Map<String, Int>, turn: Int): Boolean {
        val last = lastTurnById[registryId] ?: return random.nextDouble() < CRISIS_PROBABILITY
        if (last > turn) return random.nextDouble() < CRISIS_PROBABILITY
        if (turn - last < CRISIS_COOLDOWN_MONTHS) return false
        return random.nextDouble() < CRISIS_PROBABILITY
    }

    private sealed class EntryVerdict {
        object Matched : EntryVerdict()
        object Miss : EntryVerdict()
        data class Unported(val reason: String) : EntryVerdict()
    }

    data class UnportedRule(
        val registryId: String,
        val eventId: String,
        val description: String,
        val reason: String
    )

    private companion object {
        const val CRISIS_PROBABILITY = 0.3
        const val CRISIS_COOLDOWN_MONTHS = 8
    }
}
