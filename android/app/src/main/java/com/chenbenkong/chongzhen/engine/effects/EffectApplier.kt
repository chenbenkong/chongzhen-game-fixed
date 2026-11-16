package com.chenbenkong.chongzhen.engine.effects

import com.chenbenkong.chongzhen.data.EventEffects
import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// ============================================================================
// 抉择效果结算：与 Web handleChoice 的写入口径对齐。
// - 属性：难度倍率只放大「获得」，出身修正后四舍五入，再按上下限裁剪；
// - 五方态度：出身修正后裁剪到 0..100；带「潜逃」票时正面圣眷不再上涨；
// - 隐藏属性：只认已知键，裁剪 0..100；
// - flags：增票去重、退票连带删除 flagTurns；阵营好感随票同步；
// - meritScore：累计政绩加成；special.ending 标记触发结局。
// ============================================================================

/** 结算后实际落账的差值（供结算面板 / 履历 / 单测断言）。 */
data class AppliedEffects(
    val attributes: Map<String, Double> = emptyMap(),
    val gameState: Map<String, Double> = emptyMap(),
    val hidden: Map<String, Double> = emptyMap(),
    val addedFlags: List<String> = emptyList(),
    val removedFlags: List<String> = emptyList(),
    val meritBonus: Double = 0.0,
    val endingTriggered: Boolean = false
)

object EffectApplier {

    // 旧属性名 → 新属性名（与 Web ATTR_MAP 同表）
    private val ATTR_MAP = mapOf(
        "文辩" to "文韬", "朝政" to "理政", "权势" to "理政", "机敏" to "文韬",
        "道德" to "文韬", "财帛" to "财帛", "武略" to "武略", "体质" to "体质",
        "文韬" to "文韬", "理政" to "理政"
    )

    // 旧状态名 → 新状态名（与 Web STATE_MAP 同表）
    private val STATE_MAP = mapOf(
        "帝心" to "圣眷", "国势" to "国势", "派系立场" to "清议", "百姓口碑" to "民望",
        "商贾" to "士绅", "安全" to "中官", "军事" to "国势", "道德" to "清议",
        "文化" to "清议", "军心" to "国势", "圣眷" to "圣眷", "中官" to "中官",
        "清议" to "清议", "士绅" to "士绅", "民望" to "民望"
    )

    private val ATTR_BOUNDS: Map<String, Pair<Double, Double>> = mapOf(
        "财帛" to (0.0 to 100.0), "文韬" to (0.0 to 100.0), "理政" to (0.0 to 100.0),
        "武略" to (0.0 to 100.0), "体质" to (0.0 to 100.0)
    )

    private val HIDDEN_KEYS = setOf("道德值", "欲望值", "野心值")

    /**
     * 把一组效果写入角色 / 朝堂状态。
     * @param attributeMultiplier 难度属性倍率（只作用于正增量）
     * @param fugitiveFlag 「潜逃」票标记名（来自 constants）
     */
    fun apply(
        effects: EventEffects,
        character: CharacterState,
        court: GameStateValues,
        turn: Int,
        attributeMultiplier: Double,
        fugitiveFlag: String
    ): AppliedEffects {
        val attrBefore = character.attributes.toMap()
        val stateBefore = mapOf(
            "圣眷" to court.圣眷, "中官" to court.中官, "清议" to court.清议,
            "士绅" to court.士绅, "民望" to court.民望, "国势" to court.国势
        )
        val hiddenBefore = character.hidden.toMap()

        // ---- 属性 ----
        effects.attributes?.forEach { (rawKey, value) ->
            val key = ATTR_MAP[rawKey] ?: rawKey
            val bounds = ATTR_BOUNDS[key] ?: (0.0 to 150.0)
            val difficultyAdjusted = if (value > 0) value * attributeMultiplier else value
            val adjusted = applyOriginModifier(character.origin, key, difficultyAdjusted).roundToInt()
            val next = (character.attributes[key] ?: 0.0) + adjusted
            character.attributes[key] = clamp(next, bounds.first, bounds.second)
        }

        // ---- 五方态度 ----
        val isFugitive = character.flags.contains(fugitiveFlag)
        effects.gameState?.forEach { (rawKey, value) ->
            val key = STATE_MAP[rawKey] ?: rawKey
            if (key == "currentYear" || key == "currentMonth" || key == "turn") return@forEach
            if (isFugitive && key == "圣眷" && value > 0) return@forEach
            val adjusted = applyOriginStateModifier(character.origin, key, value)
            val current = stateValue(court, key)
            stateValue(court, key, clamp(current + adjusted, 0.0, 100.0))
        }

        // ---- 隐藏属性（未知键跳过，不写 NaN）----
        effects.hidden?.forEach { (key, value) ->
            if (key !in HIDDEN_KEYS) return@forEach
            val next = clamp((character.hidden[key] ?: 0.0) + value, 0.0, 100.0)
            character.hidden[key] = next
        }

        // ---- flags 增删 + flagTurns ----
        val added = effects.flags?.add.orEmpty().distinct().filter { !character.flags.contains(it) }
        val removed = effects.flags?.remove.orEmpty().filter { character.flags.contains(it) }
        added.forEach { flag ->
            character.flags.add(flag)
            character.flagTurns.putIfAbsent(flag, turn)
        }
        removed.forEach { flag ->
            character.flags.remove(flag)
            character.flagTurns.remove(flag)
        }

        // ---- 阵营好感随票同步 ----
        if (added.isNotEmpty() || removed.isNotEmpty()) {
            syncFaction(character, added, removed, effects.gameState)
        }

        val attrDelta = character.attributes.mapValues { (k, v) -> v - (attrBefore[k] ?: 0.0) }
            .filterValues { it != 0.0 }
        val stateAfter = mapOf(
            "圣眷" to court.圣眷, "中官" to court.中官, "清议" to court.清议,
            "士绅" to court.士绅, "民望" to court.民望, "国势" to court.国势
        )
        val stateDelta = stateAfter.mapValues { (k, v) -> v - (stateBefore[k] ?: 0.0) }
            .filterValues { it != 0.0 }
        val hiddenDelta = character.hidden.mapValues { (k, v) -> v - (hiddenBefore[k] ?: 0.0) }
            .filterValues { it != 0.0 }

        return AppliedEffects(
            attributes = attrDelta,
            gameState = stateDelta,
            hidden = hiddenDelta,
            addedFlags = added,
            removedFlags = removed,
            meritBonus = effects.meritScore ?: 0.0,
            endingTriggered = effects.special?.type == "ending"
        )
    }

    // ------------------------------------------------------------------ 内部

    private fun stateValue(court: GameStateValues, key: String): Double = when (key) {
        "圣眷" -> court.圣眷
        "中官" -> court.中官
        "清议" -> court.清议
        "士绅" -> court.士绅
        "民望" -> court.民望
        "国势" -> court.国势
        else -> 0.0
    }

    private fun stateValue(court: GameStateValues, key: String, value: Double) {
        when (key) {
            "圣眷" -> court.圣眷 = value
            "中官" -> court.中官 = value
            "清议" -> court.清议 = value
            "士绅" -> court.士绅 = value
            "民望" -> court.民望 = value
            "国势" -> court.国势 = value
        }
    }

    private fun clamp(v: Double, min: Double, max: Double): Double = max(min, min(max, v))

    /** 出身属性修正（与 Web applyOriginModifier 同表，仅正增量生效）。 */
    private fun applyOriginModifier(origin: String, attrKey: String, value: Double): Double {
        if (value <= 0) return value
        val factor: Double? = when (origin) {
            "寒门" -> if (attrKey == "文韬") 1.15 else null
            "缙绅" -> if (attrKey == "财帛") 1.1 else if (attrKey == "理政") 1.1 else null
            "没落世家" -> if (attrKey == "武略") 1.2 else if (attrKey == "文韬") 0.8 else null
            "诗文清望" -> if (attrKey == "文韬") 1.25 else if (attrKey == "武略") 0.7 else null
            "胥吏" -> if (attrKey == "理政") 1.15 else if (attrKey == "文韬") 0.9 else null
            "海商" -> if (attrKey == "财帛") 1.2 else null
            "罪臣之后" -> if (attrKey == "文韬") 1.1 else null
            "军户" -> if (attrKey == "武略") 1.15 else if (attrKey == "体质") 1.1 else null
            else -> null
        }
        return factor?.let { value * it } ?: value
    }

    /** 出身态度修正（与 Web applyOriginStateModifier 同表）。 */
    private fun applyOriginStateModifier(origin: String, stateKey: String, value: Double): Double {
        val factor: Double? = when (origin) {
            "寒门" -> if (stateKey == "清议") 1.5 else if (stateKey == "士绅" && value > 0) 0.7 else null
            "缙绅" -> if (stateKey == "士绅" && value > 0) 1.2 else if (stateKey == "圣眷" && value > 0) 0.9 else null
            "没落世家" -> if (stateKey == "中官" && value > 0) 1.15 else if (stateKey == "清议" && value > 0) 0.8 else null
            "诗文清望" -> if (stateKey == "清议" && value > 0) 1.25 else if (stateKey == "中官" && value > 0) 0.7 else null
            "胥吏" -> if (stateKey == "中官" && value > 0) 1.15 else if (stateKey == "清议" && value > 0) 0.8 else null
            "海商" -> if (stateKey == "士绅" && value > 0) 1.15 else if (stateKey == "圣眷" && value > 0) 0.9 else if (stateKey == "清议" && value > 0) 0.8 else null
            "罪臣之后" -> if (stateKey == "圣眷" && value > 0) 0.8 else if (stateKey == "清议" && value > 0) 1.15 else if (stateKey == "士绅" && value > 0) 0.9 else null
            "军户" -> if (stateKey == "清议" && value > 0) 0.85 else null
            else -> null
        }
        return factor?.let { value * it } ?: value
    }

    /** 阵营好感随经历票与态度涨跌同步（与 Web 1561-1611 同口径）。 */
    private fun syncFaction(
        character: CharacterState,
        added: List<String>,
        removed: List<String>,
        gameState: Map<String, Double>?
    ) {
        var donglin = character.faction.东林好感
        var eunuch = character.faction.阉党好感
        var alignment = character.faction.立场
        var strife = character.faction.党争烈度

        for (flag in added) {
            when (flag) {
                "阉党路线" -> {
                    eunuch = min(100.0, eunuch + 20)
                    donglin = max(0.0, donglin - 15)
                    alignment = "阉党"
                    strife = min(100.0, strife + 10)
                }
                "复社成员", "东林死忠" -> {
                    donglin = min(100.0, donglin + 20)
                    eunuch = max(0.0, eunuch - 15)
                    alignment = "东林"
                    strife = min(100.0, strife + 8)
                }
                "叛徒" -> if (alignment == "阉党") {
                    donglin = min(100.0, donglin + 25)
                    eunuch = max(0.0, eunuch - 30)
                    alignment = "中间"
                }
                "两面三刀" -> strife = min(100.0, strife + 5)
                "主和派" -> {
                    eunuch = min(100.0, eunuch + 10)
                    donglin = max(0.0, donglin - 10)
                }
            }
        }

        for (flag in removed) {
            if (flag == "阉党路线") {
                eunuch = max(0.0, eunuch - 25)
                alignment = "中间"
            }
        }

        gameState?.let { state ->
            state["清议"]?.let { v ->
                donglin = if (v > 0) min(100.0, donglin + floor(v / 2).toDouble())
                else max(0.0, donglin + floor(v / 2).toDouble())
            }
            state["中官"]?.let { v ->
                eunuch = if (v > 0) min(100.0, eunuch + floor(v / 2).toDouble())
                else max(0.0, eunuch + floor(v / 2).toDouble())
            }
        }

        character.faction.东林好感 = donglin
        character.faction.阉党好感 = eunuch
        character.faction.立场 = alignment
        character.faction.党争烈度 = strife
    }
}
