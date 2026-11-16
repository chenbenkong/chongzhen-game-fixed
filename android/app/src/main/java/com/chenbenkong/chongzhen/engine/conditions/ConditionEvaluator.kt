package com.chenbenkong.chongzhen.engine.conditions

import com.chenbenkong.chongzhen.data.EventChoice
import com.chenbenkong.chongzhen.data.EventConditions
import com.chenbenkong.chongzhen.data.FlagsCond
import com.chenbenkong.chongzhen.data.RangeCond
import kotlin.math.ceil
import kotlin.random.Random
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

// ============================================================================
// 原生条件求值器。
// 键覆盖以 game-data.json 中实际出现过的条件键为准（见 docs/native-engine.md
// 键覆盖表）；JSON 未出现的键（faction/degree/identity/wealth/tags 等）在此
// 不实现。事件级与选项级共用同一套 flags / 区间口径，缺省值差异见各自入口。
// 选项级同时提供结构化结果 [evaluateChoiceDetailed]，供 UI 展示锁定原因 / 差距 /
// 投骰难度；布尔 [evaluateChoice] 是其 `available` 字段的简写。
// ============================================================================

object ConditionEvaluator {

    /** 本求值器认识的顶层条件键（审计用）。 */
    val recognizedTopKeys: Set<String> = setOf(
        "year", "month", "turn", "age", "rank", "origin",
        "attributes", "hidden", "gameState", "flags", "random"
    )

    /** 事件级条件求值；conditions 为空 / 全 null 视为无门槛，放行。 */
    fun evaluate(cond: EventConditions?, ctx: ConditionContext, random: Random = Random.Default): Boolean {
        if (cond == null) return true

        cond.year?.let { if (!inRange(ctx.year.toDouble(), it)) return false }
        cond.month?.let { if (!inRange(ctx.month.toDouble(), it)) return false }
        cond.turn?.let { if (!inRange(ctx.turn.toDouble(), it)) return false }
        cond.age?.let { if (!inRange(ctx.age, it)) return false }

        cond.rank?.let { required ->
            val list = coerceList(required)
            if (list.isNotEmpty() && ctx.rank !in list) return false
        }
        cond.origin?.let { required ->
            val list = coerceList(required)
            if (list.isNotEmpty() && ctx.origin !in list) return false
        }

        // 事件级：属性缺键按 0；隐藏属性缺键判假（与 Web checkEventConditions 同口径）。
        cond.attributes?.forEach { (key, range) ->
            if (!inRange(ctx.attributes[key] ?: 0.0, range)) return false
        }
        for ((key, range) in cond.hidden ?: emptyMap()) {
            val v = ctx.hidden[key] ?: return false
            if (!inRange(v, range)) return false
        }
        cond.gameState?.forEach { (key, range) ->
            if (key == "currentYear" || key == "currentMonth" || key == "turn") return@forEach
            if (!inRange(ctx.gameState[key] ?: 0.0, range)) return false
        }

        cond.flags?.let { if (!evalFlags(it, ctx, missingFlagBlocks = false)) return false }
        cond.random?.let { if (!rollRandom(it, random)) return false }
        return true
    }

    /** 选项级布尔可用性（checkChoiceRequirement 同口径）。 */
    fun evaluateChoice(choice: EventChoice, ctx: ConditionContext, random: Random = Random.Default): Boolean =
        evaluateChoiceDetailed(choice, ctx, random).available

    /**
     * 选项级结构化判定：开 / 锁 + 原因码 + 中文文案 + 投骰难度 + 差距。
     * @param gateLabels 经历票人话标签（data.flagGateLabels 拍平成 flag→line）；缺省只给泛指。
     */
    fun evaluateChoiceDetailed(
        choice: EventChoice,
        ctx: ConditionContext,
        random: Random = Random.Default,
        gateLabels: Map<String, String> = emptyMap()
    ): ChoiceAvailability {
        val cond = choice.showConditions

        // —— 硬门（不可勉力一试）：任一失败立即返回，difficulty 必须为 null。
        // 出身 / 官阶 / 经历票属于身份与履历门槛，骰子不能绕过；必须先于软门判定，
        // 否则软门先命中会给出 difficulty，把硬门漏判成「可勉力一试」。

        // 1. 经历票（has / notHas / any / none / all / minCount / since / sinceAny）
        cond?.flags?.let { f ->
            flagCheck(f, ctx, gateLabels)?.let { return it }
        }

        // 2. 出身
        cond?.origin?.let { required ->
            val list = coerceList(required)
            if (list.isNotEmpty() && ctx.origin !in list) {
                return ChoiceAvailability(
                    available = false,
                    reasonCode = ChoiceAvailability.CODE_ORIGIN_DENIED,
                    reasonText = "需要出身：${list.joinToString("、")}",
                    conditionType = "origin",
                    conditionKey = "出身",
                    difficulty = null,
                    gap = 0.0
                )
            }
        }

        // 3. 官阶
        cond?.rank?.let { required ->
            val list = coerceList(required)
            if (list.isNotEmpty() && ctx.rank !in list) {
                return ChoiceAvailability(
                    available = false,
                    reasonCode = ChoiceAvailability.CODE_RANK_DENIED,
                    reasonText = "须任此官阶：${list.joinToString("、")}",
                    conditionType = "rank",
                    conditionKey = "官阶",
                    difficulty = null,
                    gap = 0.0
                )
            }
        }

        // —— 软门（可勉力一试）：体质 / 属性 / 态度 / 隐藏，按差距给投骰难度。

        // 4. 体质门（staminaRequired）
        val staminaRequired = choice.staminaRequired ?: 0.0
        if (staminaRequired > 0) {
            val current = ctx.attributes["体质"] ?: 0.0
            if (current < staminaRequired) {
                val gap = staminaRequired - current
                return ChoiceAvailability(
                    available = false,
                    reasonCode = ChoiceAvailability.CODE_STAMINA_INSUFFICIENT,
                    reasonText = "体质不足（需≥${staminaRequired.toInt()}，当前${current.toInt()}）",
                    conditionType = "stamina",
                    conditionKey = "体质",
                    difficulty = diceDifficulty(gap, 15),
                    gap = gap
                )
            }
        }

        // 5. 显性属性（缺键按 50，与 Web 选项级口径一致）
        cond?.attributes?.forEach { (key, range) ->
            val value = ctx.attributes[key] ?: 50.0
            range.max?.let { max ->
                if (value > max) {
                    val gap = value - max
                    return locked(
                        ChoiceAvailability.CODE_ATTR_EXCESSIVE, "attribute", key,
                        "${key}过高（需≤${max.toInt()}，当前${value.toInt()}）", gap, 15
                    )
                }
            }
            range.min?.let { min ->
                if (value < min) {
                    val gap = min - value
                    return locked(
                        ChoiceAvailability.CODE_ATTR_INSUFFICIENT, "attribute", key,
                        "${key}不足（需≥${min.toInt()}，当前${value.toInt()}）", gap, 15
                    )
                }
            }
        }

        // 6. 五方态度
        cond?.gameState?.forEach { (key, range) ->
            if (key == "currentYear" || key == "currentMonth" || key == "turn") return@forEach
            val value = ctx.gameState[key] ?: 50.0
            range.max?.let { max ->
                if (value > max) {
                    val gap = value - max
                    return locked(
                        ChoiceAvailability.CODE_STATE_EXCESSIVE, "gameState", key,
                        "${key}过高（需≤${max.toInt()}，当前${value.toInt()}）", gap, 10
                    )
                }
            }
            range.min?.let { min ->
                if (value < min) {
                    val gap = min - value
                    return locked(
                        ChoiceAvailability.CODE_STATE_INSUFFICIENT, "gameState", key,
                        "${key}不足（需≥${min.toInt()}，当前${value.toInt()}）", gap, 10
                    )
                }
            }
        }

        // 7. 隐藏属性
        cond?.hidden?.forEach { (key, range) ->
            val value = ctx.hidden[key] ?: 50.0
            range.max?.let { max ->
                if (value > max) {
                    val gap = value - max
                    return locked(
                        ChoiceAvailability.CODE_HIDDEN_EXCESSIVE, "hidden", key,
                        "${key}过高（需≤${max.toInt()}）", gap, 10
                    )
                }
            }
            range.min?.let { min ->
                if (value < min) {
                    val gap = min - value
                    return locked(
                        ChoiceAvailability.CODE_HIDDEN_INSUFFICIENT, "hidden", key,
                        "${key}不足（需≥${min.toInt()}）", gap, 10
                    )
                }
            }
        }

        // 8. 概率门（不可勉力一试）
        cond?.random?.let { threshold ->
            if (!rollRandom(threshold, random)) {
                return ChoiceAvailability(
                    available = false,
                    reasonCode = ChoiceAvailability.CODE_RANDOM_ROLL,
                    reasonText = "机缘未到",
                    conditionType = "random",
                    conditionKey = "random",
                    difficulty = null,
                    gap = null
                )
            }
        }

        return ChoiceAvailability.ok()
    }

    /** 事件是否至少有一个点得动的选项。 */
    fun hasOpenChoice(choices: List<EventChoice>, ctx: ConditionContext, random: Random = Random.Default): Boolean =
        choices.any { evaluateChoice(it, ctx, random) }

    // ------------------------------------------------------------------ 内部

    private fun locked(
        code: String, type: String, key: String, text: String, gap: Double, divisor: Int
    ): ChoiceAvailability = ChoiceAvailability(
        available = false,
        reasonCode = code,
        reasonText = text,
        conditionType = type,
        conditionKey = key,
        difficulty = diceDifficulty(gap, divisor),
        gap = gap
    )

    /** 投骰难度：差距越大骰子要求越高，封顶 6；与 Web checkChoiceRequirement 同表。 */
    private fun diceDifficulty(gap: Double, divisor: Int): Int =
        minOf(6, ceil(gap / divisor).toInt() + 2)

    private fun flagCheck(
        f: FlagsCond, ctx: ConditionContext, labels: Map<String, String>
    ): ChoiceAvailability? {
        val own = ctx.flags

        val missingAll = (f.has.orEmpty() + f.all.orEmpty()).filter { !own.contains(it) }
        if (missingAll.isNotEmpty()) {
            return flagLocked("须有这段经历：${sayFlags(missingAll, labels)}", missingAll.first(), labels)
        }

        val anyList = f.any ?: f.some
        if (anyList != null && anyList.isNotEmpty() && anyList.none { own.contains(it) }) {
            return flagLocked("须有过其中一段经历：${sayFlags(anyList, labels)}", anyList.first(), labels)
        }

        f.minCount?.let { spec ->
            val held = spec.flags.count { own.contains(it) }
            if (spec.min > 0 && held < spec.min) {
                val missing = spec.flags.filter { !own.contains(it) }
                return flagLocked(
                    "须有过其中 ${spec.min.toInt()} 段经历：${sayFlags(missing, labels)}",
                    missing.firstOrNull() ?: spec.flags.firstOrNull() ?: "经历", labels
                )
            }
        }

        val forbidden = (f.notHas.orEmpty() + f.none.orEmpty()).filter { own.contains(it) }
        if (forbidden.isNotEmpty()) {
            return flagLocked("与你的另一段经历相冲：${sayFlags(forbidden, labels)}", forbidden.first(), labels)
        }

        f.since?.forEach { (flag, range) ->
            if (!own.contains(flag)) {
                return flagLocked("须有这段经历：${sayFlags(listOf(flag), labels)}", flag, labels)
            }
            val at = ctx.flagTurns[flag] ?: return@forEach
            val elapsed = ctx.turn - at
            range.min?.let { min ->
                if (elapsed < min) {
                    return ChoiceAvailability(
                        available = false,
                        reasonCode = ChoiceAvailability.CODE_FLAG_TOO_NEW,
                        reasonText = agoTooYoung(flag, (min - elapsed).toInt(), labels),
                        conditionType = "flag",
                        conditionKey = flag,
                        difficulty = null,
                        gap = null
                    )
                }
            }
            range.max?.let { max ->
                if (elapsed > max) {
                    return flagLocked("这段旧事隔得太久，这一回赶不上了", flag, labels)
                }
            }
        }

        f.sinceAny?.let { spec ->
            if (!evalSinceAnyOpen(spec.flags, spec.min, spec.max, own, ctx.flagTurns, ctx.turn)) {
                return flagLocked(
                    "须有过其中一段经历：${sayFlags(spec.flags, labels)}",
                    spec.flags.firstOrNull() ?: "经历", labels
                )
            }
        }

        return null
    }

    private fun flagLocked(text: String, key: String, labels: Map<String, String>) = ChoiceAvailability(
        available = false,
        reasonCode = ChoiceAvailability.CODE_FLAG_MISSING,
        reasonText = text,
        conditionType = "flag",
        conditionKey = key,
        difficulty = null,
        gap = 0.0
    )

    private fun sayFlags(flags: List<String>, labels: Map<String, String>): String {
        val named = flags.mapNotNull { labels[it] }
        return if (named.isNotEmpty()) named.joinToString("、") else "前头有一段没走到的旧事"
    }

    private fun agoTooYoung(flag: String, months: Int, labels: Map<String, String>): String {
        val named = labels[flag]
        val years = months / 12
        val rest = months % 12
        val wait = if (years > 0) "${years} 年${if (rest > 0) " ${rest} 个月" else ""}" else "${months} 个月"
        return if (named != null) "${named}之后，还得再等 $wait" else "这段旧事还得再等 $wait"
    }

    private fun inRange(value: Double, range: RangeCond): Boolean {
        range.min?.let { if (value < it) return false }
        range.max?.let { if (value > it) return false }
        return true
    }

    private fun coerceList(element: kotlinx.serialization.json.JsonElement): List<String> =
        when (element) {
            is JsonPrimitive -> listOfNotNull(element.contentOrNull)
            is JsonArray -> element.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            else -> emptyList()
        }

    /** 概率门：>1 按百分数，≤1 按小数；probability<1 时未掷中则关。 */
    private fun rollRandom(threshold: Double, random: Random): Boolean {
        val probability = if (threshold > 1) threshold / 100.0 else threshold
        if (probability >= 1) return true
        return random.nextDouble() < probability
    }

    private fun evalFlags(flags: FlagsCond, ctx: ConditionContext, missingFlagBlocks: Boolean): Boolean {
        val own = ctx.flags

        flags.has?.let { required -> if (required.any { !own.contains(it) }) return false }
        flags.all?.let { required -> if (required.any { !own.contains(it) }) return false }

        flags.notHas?.let { banned -> if (banned.any { own.contains(it) }) return false }
        flags.none?.let { banned -> if (banned.any { own.contains(it) }) return false }

        flags.any?.let { wanted -> if (wanted.none { own.contains(it) }) return false }
        flags.some?.let { wanted -> if (wanted.none { own.contains(it) }) return false }

        flags.minCount?.let { spec ->
            if (spec.min > 0 && spec.flags.count { own.contains(it) } < spec.min) return false
        }

        // since（AND 形状）：票必须持有；缺落笔记录容错放行。
        flags.since?.forEach { (flag, range) ->
            if (!own.contains(flag)) return false
            val at = ctx.flagTurns[flag] ?: return@forEach
            if (!inRange((ctx.turn - at).toDouble(), range)) return false
        }

        flags.sinceAny?.let { spec ->
            if (!evalSinceAnyOpen(spec.flags, spec.min, spec.max, own, ctx.flagTurns, ctx.turn)) return false
        }

        return true
    }

    /** 与 Web evalSinceAny 同口径：一张都没有 → 关；有票但缺 flagTurns → 放行。 */
    private fun evalSinceAnyOpen(
        list: List<String>,
        min: Double?,
        max: Double?,
        own: List<String>,
        flagTurns: Map<String, Int>,
        turn: Int
    ): Boolean {
        var held = false
        for (flag in list) {
            if (!own.contains(flag)) continue
            held = true
            val at = flagTurns[flag] ?: return true
            val elapsed = turn - at
            if (min != null && elapsed < min) continue
            if (max != null && elapsed > max) continue
            return true
        }
        return false
    }
}
