package com.chenbenkong.chongzhen.ui

import com.chenbenkong.chongzhen.data.GameData
import com.chenbenkong.chongzhen.data.GameEvent
import com.chenbenkong.chongzhen.engine.GameEngine
import com.chenbenkong.chongzhen.engine.conditions.ConditionContext
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import com.chenbenkong.chongzhen.engine.save.SaveData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlin.random.Random

// ============================================================================
// 牌桌控制器：纯 JVM 层，不触碰 Android UI / 系统 API。
// 持有 GameEngine，把引擎每次变更拍快照成不可变 UiState；Compose 与单测都读这一层。
// 存档读写 / 图鉴持久化通过接口注入，正式端接 filesDir 与 SharedPreferences，测试用内存实现。
// ============================================================================
class GameController(
    val data: GameData,
    private val codex: CodexStore,
    private val seed: Long = Random.nextLong(),
    private val loadSave: () -> SaveData?,
    private val writeSave: (SaveData) -> Boolean,
    private val deleteSave: () -> Unit
) {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var engine: GameEngine? = null
    private var undoSnapshot: SaveData? = null

    private val eventsById: Map<String, GameEvent> = data.events.associateBy { it.id }

    // ------------------------------------------------------------------ 进入

    /** 数据就绪后进入标题屏：读自动存档预览，刷新图鉴。 */
    fun enterTitle() {
        val preview = loadSave()?.toPreview()
        _state.update {
            it.copy(
                screen = Screen.Title,
                savePreview = preview,
                unlockedEndingCount = codex.unlocked().count { id -> data.endings.endingIds.contains(id) },
                endingTotal = data.endings.endingIds.size,
                codex = buildCodex(),
                error = null,
                ending = null,
                event = null,
                choices = emptyList(),
                outcome = null,
                outcomeVisible = false,
                banner = null,
                board = null,
                advanceBlockedReason = null
            )
        }
    }

    fun setDifficulty(id: String) {
        _state.update { it.copy(difficultyId = id) }
    }

    /** 开始新局 → 取名屏。 */
    fun beginNewGame() {
        engine = null
        undoSnapshot = null
        _state.update {
            it.copy(
                screen = Screen.NameForm,
                draft = NameDraft(),
                error = null,
                ending = null
            )
        }
    }

    // ------------------------------------------------------------------ 取名

    fun updateDraft(transform: (NameDraft) -> NameDraft) {
        _state.update { s ->
            var draft = transform(s.draft)
            // 未手动改过「字」时，随名自动生成；名清空则字清空。
            if (draft.autoCourtesy) {
                draft = if (draft.givenName.isBlank()) {
                    draft.copy(courtesyName = "")
                } else {
                    draft.copy(courtesyName = generateCourtesyName(draft.givenName, random))
                }
            }
            s.copy(draft = draft)
        }
    }

    fun randomizeName() {
        val surname = SUGGESTED_SURNAMES[random.nextInt(SUGGESTED_SURNAMES.size)]
        val given = SUGGESTED_NAMES[random.nextInt(SUGGESTED_NAMES.size)]
        _state.update { s ->
            val draft = s.draft.copy(
                surname = surname,
                givenName = given,
                autoCourtesy = true,
                courtesyName = generateCourtesyName(given, random),
                hometown = s.draft.hometown.ifBlank { randomHometown(random) }
            )
            s.copy(draft = draft)
        }
    }

    fun randomizeHometown() {
        updateDraft { it.copy(hometown = randomHometown(random)) }
    }

    /** 校验通过 → 出身屏；不通过返回缺失字段提示。 */
    fun confirmName(): String? {
        val d = _state.value.draft
        val missing = mutableListOf<String>()
        if (d.fullName.isBlank()) missing += "姓/名"
        if (d.courtesyName.isBlank()) missing += "字"
        if (d.hometown.isBlank()) missing += "籍贯"
        if (d.age !in 16..60) missing += "年岁（16-60）"
        if (missing.isNotEmpty()) return "还缺：${missing.joinToString("、")}"
        _state.update { it.copy(screen = Screen.Origin, error = null) }
        return null
    }

    // ------------------------------------------------------------------ 开局 / 读档

    /** 选定出身并开局。 */
    fun selectOrigin(originType: String) {
        val origin = data.origins.firstOrNull { it.type == originType }
            ?: data.origins.firstOrNull()
            ?: error("出身表为空")
        val d = _state.value.draft

        val eng = GameEngine(data, seed = seed)
        eng.newGame(
            playerName = d.fullName,
            originType = origin.type,
            degree = origin.initialDegree,
            difficultyId = _state.value.difficultyId
        )
        // 引擎门面未接收字 / 籍贯 / 自定义年龄；CharacterState 字段为可变，开局后回填。
        eng.state.character.courtesyName = d.courtesyName.trim()
        eng.state.character.hometown = d.hometown.trim()
        eng.state.character.age = d.age.toDouble()

        engine = eng
        undoSnapshot = null
        afterStart()
    }

    /** 继续上次：读自动存档恢复。 */
    fun continueGame() {
        val save = try {
            loadSave()
        } catch (e: Exception) {
            null
        }
        if (save == null) {
            _state.update { it.copy(screen = Screen.FatalError, error = UiError.SaveCorrupt) }
            return
        }
        val eng = GameEngine(data, seed = seed)
        try {
            eng.restore(save)
        } catch (e: Exception) {
            _state.update { it.copy(screen = Screen.FatalError, error = UiError.SaveCorrupt) }
            return
        }
        engine = eng
        undoSnapshot = null
        // 老存档补登图鉴（历史事件 ∩ 结局登记表）。
        save.eventHistory.forEach { id -> if (data.endings.endingIds.contains(id)) codex.unlock(id) }
        afterStart()
    }

    /** 测试专用挂接缝：挂接一个已构造好的引擎并走 afterStart 路由，覆盖结局 / 牌桌 / 错误三分支。 */
    internal fun attachEngineForTest(eng: GameEngine) {
        engine = eng
        undoSnapshot = null
        afterStart()
    }

    private fun afterStart() {
        val eng = engine ?: return
        refresh()
        when {
            eng.state.gameOver -> showEnding()
            eng.currentEvent == null -> _state.update { it.copy(screen = Screen.FatalError, error = UiError.NoEvent) }
            else -> _state.update { it.copy(screen = Screen.Board) }
        }
    }

    // ------------------------------------------------------------------ 抉择

    fun choose(choiceId: String) {
        val eng = engine ?: return
        if (_state.value.outcomeVisible) return
        val event = eng.currentEvent ?: return
        val choice = event.choices.firstOrNull { it.id == choiceId } ?: return

        val ctx = ConditionContext.from(eng.state.court, eng.state.character)
        if (!ConditionEvaluator.evaluateChoice(choice, ctx, eng.random)) {
            _state.update { it.copy(toast = "条件未满足，暂不可选") }
            return
        }

        val beforeRank = eng.state.character.rank
        val beforeIdentity = eng.state.identityType
        undoSnapshot = eng.toSaveData()

        val outcome = eng.chooseChoice(choiceId)
        if (outcome == null) {
            _state.update { it.copy(toast = "此路不通") }
            return
        }

        // 图鉴登记
        eng.activeEnding?.let { codex.unlock(it.eventId) }

        refresh(beforeRank = beforeRank, beforeIdentity = beforeIdentity)

        when {
            eng.state.gameOver -> showEnding()
            else -> {
                persistAutosave()
                _state.update { it.copy(outcomeVisible = true) }
            }
        }
    }

    /** 结算面板「继续」：同月队列有牌就收下一张，否则进下月。 */
    fun proceedAfterOutcome() {
        val eng = engine ?: return
        _state.update { it.copy(outcomeVisible = false, outcome = null) }
        if (eng.currentEvent == null) {
            advanceMonthInternal()
        } else {
            refresh()
        }
    }

    // ------------------------------------------------------------------ 推进 / 撤销 / 存档

    /** 进下月；未抉择时给禁用原因。 */
    fun advanceMonth() {
        val eng = engine ?: return
        val blocked = advanceBlockedReason()
        if (blocked != null) {
            _state.update { it.copy(advanceBlockedReason = blocked, toast = blocked) }
            return
        }
        advanceMonthInternal()
    }

    private fun advanceMonthInternal() {
        val eng = engine ?: return
        undoSnapshot = eng.toSaveData()
        val beforeRank = eng.state.character.rank
        val beforeIdentity = eng.state.identityType
        eng.advanceMonth()
        eng.activeEnding?.let { codex.unlock(it.eventId) }
        refresh(beforeRank = beforeRank, beforeIdentity = beforeIdentity)
        when {
            eng.state.gameOver -> showEnding()
            eng.currentEvent == null -> {
                _state.update { it.copy(screen = Screen.FatalError, error = UiError.NoEvent) }
            }
            else -> persistAutosave()
        }
    }

    /** 撤销：回退到抉择前快照（基于引擎 toSaveData / restore 公开接口）。 */
    fun undo() {
        val eng = engine ?: return
        val snapshot = undoSnapshot
        if (snapshot == null) {
            _state.update { it.copy(toast = "本回合无可回退") }
            return
        }
        try {
            eng.restore(snapshot)
            undoSnapshot = null
            refresh()
            _state.update { it.copy(outcomeVisible = false, outcome = null, toast = "已回退至上一回合") }
        } catch (e: Exception) {
            _state.update { it.copy(toast = "回退失败：${e.message ?: "存档损坏"}") }
        }
    }

    fun saveNow() {
        val eng = engine ?: return
        val ok = persistAutosave()
        _state.update { it.copy(toast = if (ok) "案卷已存档" else "存档失败，请重试") }
    }

    private fun persistAutosave(): Boolean {
        val eng = engine ?: return false
        return runCatching { writeSave(eng.toSaveData()) }.getOrDefault(false)
    }

    // ------------------------------------------------------------------ 导航 / 抽屉

    fun toggleDrawer(open: Boolean) {
        _state.update { it.copy(drawerOpen = open) }
    }

    /** 打开手机牌桌面板（能力 / 态度 / 卷宗）。 */
    fun openBoardPanel(panel: BoardPanel) {
        _state.update { it.copy(boardPanel = panel) }
    }

    /** 关闭手机牌桌面板。 */
    fun closeBoardPanel() {
        _state.update { it.copy(boardPanel = null) }
    }

    /** 返回标题（保留自动存档）。 */
    fun backToTitle() {
        engine = null
        undoSnapshot = null
        enterTitle()
    }

    /** 重新开始：作废自动存档，回标题屏。 */
    fun restartFresh() {
        runCatching { deleteSave() }
        engine = null
        undoSnapshot = null
        enterTitle()
    }

    /** 错误页重试：无事件则再推一月；其余回到标题。 */
    fun retryFromError() {
        when (_state.value.error) {
            UiError.NoEvent -> advanceMonthInternal()
            else -> enterTitle()
        }
    }

    fun consumeToast() {
        _state.update { it.copy(toast = null) }
    }

    // ------------------------------------------------------------------ 内部快照

    private val random: Random get() = engine?.random ?: Random(seed)

    private fun advanceBlockedReason(): String? {
        val eng = engine ?: return null
        if (eng.state.gameOver) return null
        if (eng.currentEvent != null && !_state.value.outcomeVisible) {
            return "请先对当前事件作出抉择，再进下月"
        }
        return null
    }

    private fun refresh(beforeRank: String? = null, beforeIdentity: String? = null) {
        val eng = engine ?: return
        val s = eng.state
        val ctx = ConditionContext.from(s.court, s.character)
        val event = eng.currentEvent

        val choices = event?.choices.orEmpty().map { choice ->
            val availability = ConditionEvaluator.evaluateChoiceDetailed(choice, ctx, eng.random)
            ChoiceView(
                choice = choice,
                open = availability.available,
                disabledReason = if (availability.available) null else availability.reasonText
            )
        }

        val outcomeView = eng.lastOutcome?.let { outcome ->
            OutcomeView(
                outcome = outcome,
                attrDeltas = outcome.applied.attributes,
                stateDeltas = outcome.applied.gameState,
                hiddenDeltas = outcome.applied.hidden,
                addedFlags = outcome.applied.addedFlags,
                removedFlags = outcome.applied.removedFlags
            )
        }

        val originName = data.origins.firstOrNull { it.type == s.character.origin }?.name
            ?: s.character.origin

        val snapshot = BoardSnapshot(
            year = s.court.currentYear,
            month = s.court.currentMonth,
            turn = s.court.turn,
            name = s.character.name,
            courtesyName = s.character.courtesyName,
            hometown = s.character.hometown,
            age = s.character.age.toInt(),
            rank = s.character.rank,
            degree = s.character.degree,
            originType = s.character.origin,
            originName = originName,
            identityType = s.identityType,
            attributes = s.character.attributes.toMap(),
            hidden = s.character.hidden.toMap(),
            court = mapOf(
                "圣眷" to s.court.圣眷,
                "中官" to s.court.中官,
                "清议" to s.court.清议,
                "士绅" to s.court.士绅,
                "民望" to s.court.民望,
                "国势" to s.court.国势
            ),
            meritScore = s.meritScore,
            flags = s.character.flags.toList(),
            history = s.character.history.toList(),
            pendingCount = s.pendingEventIds.size
        )

        val banner = buildBanner(eng, beforeRank, beforeIdentity)

        _state.update {
            it.copy(
                board = snapshot,
                event = event,
                choices = choices,
                outcome = outcomeView,
                outcomeVisible = it.outcomeVisible && outcomeView != null,
                banner = banner,
                codex = buildCodex(),
                unlockedEndingCount = codex.unlocked().count { id -> data.endings.endingIds.contains(id) },
                advanceBlockedReason = advanceBlockedReason()
            )
        }
    }

    private fun buildBanner(
        eng: GameEngine,
        beforeRank: String?,
        beforeIdentity: String?
    ): BannerView? {
        val afterRank = eng.state.character.rank
        val afterIdentity = eng.state.identityType

        if (beforeIdentity != afterIdentity) {
            val text = when (afterIdentity) {
                "exiled" -> "【革职】你被革职查办，贬为庶民！"
                "civilian" -> "【罢官】你已被削去功名，沦为庶民。"
                else -> "身份变迁：${beforeIdentity ?: "official"} → $afterIdentity"
            }
            return BannerView(text, BannerKind.Demotion)
        }

        if (beforeRank != null && beforeRank != afterRank) {
            val beforeIdx = data.ranks.indexOfFirst { it.name == beforeRank }
            val afterIdx = data.ranks.indexOfFirst { it.name == afterRank }
            val kind = if (afterIdx > beforeIdx) BannerKind.Promotion else BannerKind.Demotion
            val verb = if (kind == BannerKind.Promotion) "擢升" else "贬谪"
            return BannerView("【$verb】$beforeRank → $afterRank", kind)
        }

        eng.lastCrisis?.let { crisis ->
            crisis.event?.title?.let { title ->
                return BannerView("急报：$title", BannerKind.Crisis)
            }
        }
        return null
    }

    private fun showEnding() {
        val eng = engine ?: return
        val hit = eng.activeEnding
        val event = hit?.event ?: eng.currentEvent ?: eventsById[eng.state.activeEndingId]
        if (event == null) {
            _state.update { it.copy(screen = Screen.FatalError, error = UiError.Fatal("结局事件数据缺失")) }
            return
        }
        codex.unlock(event.id)

        val outcome = eng.lastOutcome
        val chosenChoice = outcome?.choiceId?.let { cid -> event.choices.firstOrNull { it.id == cid } }
        val biography = buildBiography(event)
        val view = EndingView(
            event = event,
            tierLabel = tierLabel(event.endingConfig?.tier),
            categoryLabel = categoryLabel(event.endingConfig?.category),
            death = isDeathEnding(event.id),
            declinable = hit?.declinable == true,
            resultTitle = outcome?.resultTitle,
            echo = outcome?.resultEcho ?: event.narrative?.background,
            tags = chosenChoice?.result?.tags ?: chosenChoice?.failResult?.tags,
            biography = biography,
            history = eng.state.character.history.toList().reversed()
        )
        _state.update {
            it.copy(
                screen = Screen.Ending,
                ending = view,
                outcomeVisible = false,
                outcome = null,
                codex = buildCodex(),
                unlockedEndingCount = codex.unlocked().count { id -> data.endings.endingIds.contains(id) }
            )
        }
    }

    private fun buildBiography(event: GameEvent): String {
        val parts = mutableListOf<String>()
        if (event.description.isNotBlank()) parts += event.description
        event.narrative?.background?.takeIf { it.isNotBlank() }?.let { parts += it }
        event.narrative?.quote?.takeIf { it.isNotBlank() }?.let { parts += "「$it」" }
        return parts.joinToString("\n\n")
    }

    private fun buildCodex(): List<CodexEntry> {
        val unlocked = codex.unlocked()
        return data.endings.endingIds.map { id ->
            CodexEntry(
                id = id,
                title = eventsById[id]?.title,
                unlocked = id in unlocked
            )
        }
    }

    private fun SaveData.toPreview(): SavePreview {
        val originName = data.origins.firstOrNull { it.type == origin }?.name ?: origin
        return SavePreview(
            playerName = playerName,
            year = gameState.currentYear,
            month = gameState.currentMonth,
            rank = character.rank,
            age = character.age.toInt(),
            degree = degree,
            originName = originName
        )
    }
}
