package com.chenbenkong.chongzhen.engine.state

import kotlinx.serialization.Serializable

// ============================================================================
// 运行时一局状态：与 Web GameState / CharacterState 同形。
// 中文键名与 JSON、Web 取值口径保持一致；属性上下限在 EffectApplier 内裁剪。
// ============================================================================

/** 阵营立场状态。 */
@Serializable
data class FactionState(
    var 东林好感: Double = 50.0,
    var 阉党好感: Double = 50.0,
    var 立场: String = "未定",
    var 党争烈度: Double = 30.0
)

/** 角色（履历 + 能力 + 经历票）。 */
@Serializable
data class CharacterState(
    var name: String = "",
    var courtesyName: String = "",
    var hometown: String = "",
    var age: Double = 22.0,
    var origin: String = "",
    var rank: String = "正七品·知县",
    var degree: String = "进士",
    val attributes: MutableMap<String, Double> = mutableMapOf(),
    val hidden: MutableMap<String, Double> = mutableMapOf(),
    val flags: MutableList<String> = mutableListOf(),
    val flagTurns: MutableMap<String, Int> = mutableMapOf(),
    val history: MutableList<String> = mutableListOf(),
    var promotionCount: Int = 0,
    var demotionCount: Int = 0,
    val faction: FactionState = FactionState()
)

/** 朝堂 / 国势状态。 */
@Serializable
data class GameStateValues(
    var currentYear: Int = 1628,
    var currentMonth: Int = 1,
    var turn: Int = 0,
    var 圣眷: Double = 50.0,
    var 中官: Double = 50.0,
    var 清议: Double = 50.0,
    var 士绅: Double = 50.0,
    var 民望: Double = 0.0,
    var 国势: Double = 75.0
)

/** 玩家统计（履历条数、结局解锁等，存档随附）。 */
@Serializable
data class PlayerStats(
    var eventCount: Int = 0,
    var endingCount: Int = 0,
    var totalTurns: Int = 0
)

/** 一局完整运行态（内存态；存档序列化见 engine/save）。 */
@Serializable
data class GameState(
    val character: CharacterState = CharacterState(),
    val court: GameStateValues = GameStateValues(),
    val stats: PlayerStats = PlayerStats(),
    var difficultyId: String = "normal",
    var currentEventId: String? = null,
    var lastChoiceId: String? = null,
    var pendingEventIds: MutableList<String> = mutableListOf(),
    var seenEventIds: MutableList<String> = mutableListOf(),
    var lastTurnById: MutableMap<String, Int> = mutableMapOf(),
    var activeEndingId: String? = null,
    var gameOver: Boolean = false,
    var meritScore: Double = 0.0,
    var previousMeritScore: Double = 0.0,
    var identityType: String = "official",
    var meritBonus: Double = 0.0
)
