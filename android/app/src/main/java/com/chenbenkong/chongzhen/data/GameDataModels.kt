package com.chenbenkong.chongzhen.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ============================================================================
// 数据层模型：字段名与 assets/game-data.json 严格对应。
// 未知字段由 JsonBuilder.ignoreUnknownKeys 忽略；本文件只声明引擎需要的键，
// 其余原始字段（头像、配乐等）不参与原生引擎计算。
// ============================================================================

/** 区间条件 { min?, max? }，兼容缺项。 */
@Serializable
data class RangeCond(
    val min: Double? = null,
    val max: Double? = null
)

/** flags.sinceAny：列表形状的时长门。 */
@Serializable
data class SinceAnyCond(
    val flags: List<String> = emptyList(),
    val min: Double? = null,
    val max: Double? = null
)

/** flags.minCount：所列经历至少持有 N 段。 */
@Serializable
data class MinCountCond(
    val flags: List<String> = emptyList(),
    val min: Double = 1.0
)

/** flags 条件组。has/all 为全要，any/some 为任一，notHas/none 为全禁。 */
@Serializable
data class FlagsCond(
    val has: List<String>? = null,
    val notHas: List<String>? = null,
    val all: List<String>? = null,
    val any: List<String>? = null,
    val some: List<String>? = null,
    val none: List<String>? = null,
    val since: Map<String, RangeCond>? = null,
    val sinceAny: SinceAnyCond? = null,
    val minCount: MinCountCond? = null
)

/** 事件 / 选项级条件集合（与 Web EventConditions 同形）。 */
@Serializable
data class EventConditions(
    val year: RangeCond? = null,
    val month: RangeCond? = null,
    val turn: RangeCond? = null,
    val age: RangeCond? = null,
    /** 字符串或字符串数组，求值时统一展开成列表。 */
    val rank: JsonElement? = null,
    val origin: JsonElement? = null,
    val attributes: Map<String, RangeCond>? = null,
    val hidden: Map<String, RangeCond>? = null,
    val gameState: Map<String, RangeCond>? = null,
    val flags: FlagsCond? = null,
    val random: Double? = null
)

/** flags 效果：add 增票、remove 退票。 */
@Serializable
data class FlagsEffect(
    val add: List<String>? = null,
    val remove: List<String>? = null
)

/** special 效果：原生引擎目前只认 type=ending。 */
@Serializable
data class SpecialEffect(
    val type: String? = null
)

/** 选项效果集（与 Web EventEffects 同形）。 */
@Serializable
data class EventEffects(
    val attributes: Map<String, Double>? = null,
    val hidden: Map<String, Double>? = null,
    val gameState: Map<String, Double>? = null,
    val flags: FlagsEffect? = null,
    val special: SpecialEffect? = null,
    val meritScore: Double? = null
)

/** 结算文案：标题 / 标签 / 回声正文。 */
@Serializable
data class ChoiceResult(
    val title: String? = null,
    val tags: List<String>? = null,
    val echo: String = ""
)

/** 话者两行文案。 */
@Serializable
data class NarrativeSpeaker(
    val name: String = "",
    val title: String = ""
)

/** 事件叙事段。 */
@Serializable
data class EventNarrative(
    val speaker: NarrativeSpeaker? = null,
    val quote: String? = null,
    val background: String = "",
    val situation: String = ""
)

/** 单个抉择。 */
@Serializable
data class EventChoice(
    val id: String,
    val text: String,
    val quote: String? = null,
    val description: String? = null,
    val storyline: String? = null,
    val showConditions: EventConditions? = null,
    val effects: EventEffects = EventEffects(),
    val resultDescription: String? = null,
    val result: ChoiceResult? = null,
    val failEffects: EventEffects? = null,
    val failResultDescription: String? = null,
    val failResult: ChoiceResult? = null,
    val staminaCost: Double? = null,
    val staminaRequired: Double? = null,
    val staminaBonus: Double? = null
)

/** 结局配置：大类 / 品级 / 前奏事件。 */
@Serializable
data class EndingConfig(
    val category: String? = null,
    val tier: String? = null,
    val preludeEventId: String? = null
)

/** 一条游戏事件（与 Web GameEvent 同形）。 */
@Serializable
data class GameEvent(
    val id: String,
    val title: String,
    val description: String,
    val narrative: EventNarrative? = null,
    val conditions: EventConditions = EventConditions(),
    val choices: List<EventChoice> = emptyList(),
    val type: String = "normal",
    val endingConfig: EndingConfig? = null,
    val isPreEnding: Boolean? = null,
    val linksToEndingId: String? = null,
    val declinable: Boolean? = null,
    val storyline: String? = null,
    /** 同组换皮事件互斥；同一局里发过任意一张，本组其它卡不再进池。 */
    val exclusiveGroup: String? = null
)

/** 结局登记表：别名映射 / 可搁笔结局 / 全部结局 id。 */
@Serializable
data class EndingsBlock(
    val aliasMap: Map<String, String> = emptyMap(),
    val declinableEndingIds: List<String> = emptyList(),
    val endingIds: List<String> = emptyList()
)

/** 官阶配置：level 越小官越低，minScore 为升迁门槛。 */
@Serializable
data class RankConfig(
    val level: Int,
    val name: String,
    val minScore: Double,
    val type: String = "official"
)

/** 出身配置。 */
@Serializable
data class OriginConfig(
    val type: String,
    val name: String,
    val tags: List<String> = emptyList(),
    val initialRank: String = "知县",
    val initialDegree: String = "进士",
    val background: String = "",
    val initialAttributes: Map<String, Double> = emptyMap(),
    val initialHidden: Map<String, Double> = emptyMap(),
    val initialGameState: Map<String, Double> = emptyMap(),
    val features: List<String> = emptyList(),
    val playStyle: String = "",
    val examBonus: Map<String, Double> = emptyMap()
)

/** 难度配置。 */
@Serializable
data class DifficultyConfig(
    val id: String,
    val name: String = "",
    val description: String = "",
    val attributeMultiplier: Double = 1.0,
    val meritScoreMultiplier: Double = 1.0,
    val promotionThresholdMultiplier: Double = 1.0,
    val eventDifficulty: Double = 1.0,
    val countryPowerDecay: Double = 1.0
)

/** 初始属性 / 隐藏属性默认值。 */
@Serializable
data class DefaultsBlock(
    val attributes: Map<String, Double> = emptyMap(),
    val hidden: Map<String, Double> = emptyMap()
)

/** 边界阈值条目（归零维度表）。 */
@Serializable
data class ThresholdSpec(
    val key: String,
    val group: String
)

/** 常量块。 */
@Serializable
data class GameConstants(
    val gameStartYear: Int = 1628,
    val narrativeMinYear: Int = 1635,
    val narrativeMinTurn: Int = 36,
    val thresholdGraceTurns: Int = 12,
    val demotionGraceTurns: Int = 12,
    val fugitiveAnnualIncome: Double = 8.0,
    val fugitiveFlag: String = "潜逃",
    val corruptionWarningFlag: String = "革职预警·贪墨",
    val zeroWarnFlagPrefix: String = "归零警告·",
    val corruptionExposure: Map<String, Double> = emptyMap(),
    val ordinaryLifeExcludedFlags: List<String> = emptyList(),
    val zeroThresholds: List<ThresholdSpec> = emptyList()
)

/** 边界事件登记条目（导出侧已把手写闭包摘成 kotlinSpecial 标记）。 */
@Serializable
data class BoundaryEntry(
    val registryId: String,
    val priority: Int,
    val type: String,
    val eventId: String,
    val rule: BoundaryRule,
    val kotlinSpecial: Boolean = false,
    val source: String = ""
)

@Serializable
data class BoundaryRule(
    val kind: String = "",
    val note: String? = null,
    val conditions: EventConditions? = null
)

/** 自定义规则（JSON 侧保留参数，Kotlin 侧按 kind 专用实现）。 */
@Serializable
data class CustomRuleEntry(
    val eventId: String,
    val kind: String,
    val description: String = "",
    val params: Map<String, JsonElement> = emptyMap(),
    val source: String = ""
)

/** 未移植规则登记：引擎侧必须显式计数，禁止静默 false。 */
@Serializable
data class UnportableRuleEntry(
    val registryId: String,
    val eventId: String,
    val description: String = "",
    val fields: List<String> = emptyList(),
    val reason: String = "",
    val source: String = ""
)

/** 剧情线条目。 */
@Serializable
data class StorylineEntry(
    val key: String,
    val name: String = "",
    val intro: String = "",
    val iconName: String? = null,
    val tone: String? = null
)

/** 经历名展示标签（flagGateLabels，数组形态）。 */
@Serializable
data class GateLabelEntry(
    val flag: String,
    val line: String = "",
    val group: String = ""
)

/** game-data.json 根对象。 */
@Serializable
data class GameData(
    val schemaVersion: Int = 1,
    val events: List<GameEvent> = emptyList(),
    val endings: EndingsBlock = EndingsBlock(),
    val ranks: List<RankConfig> = emptyList(),
    val origins: List<OriginConfig> = emptyList(),
    val difficulties: List<DifficultyConfig> = emptyList(),
    val defaults: DefaultsBlock = DefaultsBlock(),
    val boundaryEvents: List<BoundaryEntry> = emptyList(),
    val customRules: List<CustomRuleEntry> = emptyList(),
    val unportableRules: List<UnportableRuleEntry> = emptyList(),
    val storylines: List<StorylineEntry> = emptyList(),
    val flagGateLabels: List<GateLabelEntry> = emptyList(),
    val flagMemoirs: List<GateLabelEntry> = emptyList(),
    val constants: GameConstants = GameConstants(),
    val defaultDifficulty: String = "normal"
)
