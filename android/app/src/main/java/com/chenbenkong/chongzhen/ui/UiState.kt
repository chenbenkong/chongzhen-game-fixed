package com.chenbenkong.chongzhen.ui

import com.chenbenkong.chongzhen.data.EventChoice
import com.chenbenkong.chongzhen.data.GameEvent
import com.chenbenkong.chongzhen.engine.ChoiceOutcome

// ============================================================================
// UI 层不可变状态模型。Controller 在每次引擎变更后拍快照写入；
// Compose 只读这些快照，不直接持有引擎可变对象。
// ============================================================================

/** 界面阶段。 */
enum class Screen {
    /** 等待 Application 解析 JSON。 */
    Loading,

    /** 标题屏。 */
    Title,

    /** 取名屏。 */
    NameForm,

    /** 出身屏。 */
    Origin,

    /** 牌桌。 */
    Board,

    /** 结局屏。 */
    Ending,

    /** 可读错误页。 */
    FatalError
}

/** 错误分类（展示用中文文案）。 */
sealed class UiError(open val message: String) {
    /** 案卷数据缺失 / 解析失败。 */
    data object DataMissing : UiError("案卷未能展开：本地数据缺失或解析失败。")

    /** 本月无可发事件。 */
    data object NoEvent : UiError("本月案卷已空，无事件可发。")

    /** 存档损坏。 */
    data object SaveCorrupt : UiError("存档已损坏，无法读取。")

    /** 其余运行时异常。 */
    data class Fatal(override val message: String) : UiError(message)
}

/** 标题屏自动存档预览（只取展示需要的字段）。 */
data class SavePreview(
    val playerName: String,
    val year: Int,
    val month: Int,
    val rank: String,
    val age: Int,
    val degree: String,
    val originName: String
)

/** 单个抉择的展示视图。 */
data class ChoiceView(
    val choice: EventChoice,
    /** 条件是否满足（引擎求值结果）。 */
    val open: Boolean,
    /** 不可选时的展示原因；引擎未暴露具体门槛，统一给通用提示。 */
    val disabledReason: String?
)

/** 结算结果展示视图。 */
data class OutcomeView(
    val outcome: ChoiceOutcome,
    /** 玩家刚点的选项文本；结算页只露这个，不重播事件正文。 */
    val choiceText: String?,
    /** 选项说明，可为空。 */
    val choiceDescription: String?,
    val attrDeltas: Map<String, Double>,
    val stateDeltas: Map<String, Double>,
    val hiddenDeltas: Map<String, Double>,
    val addedFlags: List<String>,
    val removedFlags: List<String>
)

/** 升降 / 危机顶部提示条。 */
data class BannerView(
    val text: String,
    val kind: BannerKind
)

enum class BannerKind { Promotion, Demotion, Crisis, Info }

/** 图鉴条目。 */
data class CodexEntry(
    val id: String,
    val title: String?,
    val unlocked: Boolean
)

/** 结局屏展示数据。 */
data class EndingView(
    val event: GameEvent,
    val tierLabel: String,
    val categoryLabel: String,
    val death: Boolean,
    /** 可搁笔结局：只摆牌不结算。 */
    val declinable: Boolean,
    val resultTitle: String?,
    val echo: String?,
    val tags: List<String>?,
    /** 传记 / 回顾正文。 */
    val biography: String,
    val history: List<String>
)

/** 取名草稿。 */
data class NameDraft(
    val surname: String = "",
    val givenName: String = "",
    val courtesyName: String = "",
    val ageText: String = "22",
    val hometown: String = "",
    /** 玩家是否手动改过「字」；未改则随名自动生成。 */
    val autoCourtesy: Boolean = true
) {
    val fullName: String get() = (surname + givenName).trim()
    val age: Int get() = ageText.trim().toIntOrNull() ?: 0
}

/** 牌桌一侧的状态快照。 */
data class BoardSnapshot(
    val year: Int,
    val month: Int,
    val turn: Int,
    val name: String,
    val courtesyName: String,
    val hometown: String,
    val age: Int,
    val rank: String,
    val degree: String,
    val originType: String,
    val originName: String,
    val identityType: String,
    val attributes: Map<String, Double>,
    val hidden: Map<String, Double>,
    val court: Map<String, Double>,
    val meritScore: Double,
    val flags: List<String>,
    val history: List<String>,
    val pendingCount: Int
)

/** 手机牌桌的临时面板：默认收起，点顶部「面板」再打开。 */
enum class BoardPanel { Attributes, Status, Records }

/** 全局 UI 状态。 */
data class UiState(
    val screen: Screen = Screen.Loading,
    val error: UiError? = null,
    val fatalMessage: String = "",

    // ---- 标题屏 ----
    val difficultyId: String = "normal",
    val savePreview: SavePreview? = null,
    val unlockedEndingCount: Int = 0,
    val endingTotal: Int = 0,

    // ---- 取名草稿 ----
    val draft: NameDraft = NameDraft(),

    // ---- 牌桌 ----
    val board: BoardSnapshot? = null,
    val event: GameEvent? = null,
    val choices: List<ChoiceView> = emptyList(),
    val outcome: OutcomeView? = null,
    val outcomeVisible: Boolean = false,
    val banner: BannerView? = null,
    /** null = 面板收起；手机默认单栏，避免左右栏白占宽度。 */
    val boardPanel: BoardPanel? = null,
    /** 底部操作条：手机默认收起，不常驻占高度。 */
    val actionBarOpen: Boolean = false,
    val drawerOpen: Boolean = false,
    val codex: List<CodexEntry> = emptyList(),
    val ending: EndingView? = null,

    /** 操作条是否禁用及原因（如「请先抉择」）。 */
    val advanceBlockedReason: String? = null,
    /** 轻提示（存档成功 / 已回退等）。 */
    val toast: String? = null
)
