package com.chenbenkong.chongzhen.engine.pools

import com.chenbenkong.chongzhen.data.GameData
import com.chenbenkong.chongzhen.data.GameEvent
import com.chenbenkong.chongzhen.engine.conditions.ConditionContext
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import kotlin.random.Random

// ============================================================================
// 事件池：与 Web findAllEventsForState 同口径的月度发牌分层。
// 次序：prelude 前奏 → historical/chain 一次性 → 普通过渡补位 → 末班车过渡 →
//       random 冷却填充 → 支线（emotion 一次性 + gray/character/national/faction 冷却），
//       支线无放回最多 2 张；同剧情线加权。
// 随机源为可注入的 seeded Random，同种子结果可复现。
// ============================================================================
class EventPool(
    private val data: GameData,
    private val random: Random
) {

    private val cooldownMonths: Map<String, Int> = mapOf(
        "random" to 8, "gray" to 6, "character" to 6,
        "national" to 6, "faction" to 6, "emotion" to 12
    )

    /**
     * 本月发牌。
     * @param history 已播出事件 id 序列（一次性判重 + 剧情线回溯）
     * @param lastTurnById 事件 id → 最后播出月份（冷却尺子；缺记录视为未冷却）
     * @return 本月事件序列（第一张为当前事件，其余进 pending 队列）
     */
    fun drawMonth(
        court: GameStateValues,
        character: CharacterState,
        history: List<String>,
        lastTurnById: MutableMap<String, Int>
    ): List<GameEvent> {
        val ctx = ConditionContext.from(court, character)
        val available = data.events.filter { ConditionEvaluator.evaluate(it.conditions, ctx, random) }
            .filter { ConditionEvaluator.hasOpenChoice(it.choices, ctx, random) }

        if (available.isEmpty()) return emptyList()

        val seen = history.toSet()
        val activeStoryline = resolveStoryline(history)
        val results = mutableListOf<GameEvent>()

        // 1. 结局前奏先演（transition + isPreEnding，一次性）
        val prelude = available.firstOrNull {
            it.type == "transition" && it.isPreEnding == true && !seen.contains(it.id)
        }
        if (prelude != null) results.add(prelude)

        // 2. 历史大事件 / chain（一次性）
        val historical = available.filter {
            (it.type == "historical" || it.type == "chain") && !seen.contains(it.id)
        }
        val pickedHistorical = weightedPick(historical, activeStoryline, mainTierWeights)
        if (pickedHistorical != null) {
            results.add(pickedHistorical)
        } else if (prelude == null) {
            // 3. 没有历史卡也没有前奏时，普通过渡补位
            val transition = available.filter { it.type == "transition" && !seen.contains(it.id) }
            weightedPick(transition, activeStoryline, mainTierWeights)?.let { results.add(it) }
        }

        // 2.5 末班车过渡卡（同月追加，不占主槽位）
        val lastChance = available.filter {
            it.type == "transition" && !seen.contains(it.id) && lastChanceThisMonth(it, court)
        }
        results.addAll(lastChance)

        // 4. 本月无主戏时，random 冷却填充
        if (results.isEmpty()) {
            val randomPool = withCooldown(available.filter { it.type == "random" }, "random", court.turn, lastTurnById)
            weightedPick(randomPool, activeStoryline, mainTierWeights)?.let { results.add(it) }
        }

        // 5. 支线：emotion 一次性；gray/character/national/faction 可重复带冷却
        val branchEmotion = available.filter { it.type == "emotion" && !seen.contains(it.id) }
        val branchRepeatable = listOf("gray", "character", "national", "faction").flatMap { type ->
            withCooldown(available.filter { it.type == type }, type, court.turn, lastTurnById)
        }
        val branchPool = branchEmotion + branchRepeatable
        results.addAll(weightedBranch(branchPool, activeStoryline, max = 2))

        // 去重
        val picked = results.distinctBy { it.id }
        picked.forEach { lastTurnById[it.id] = court.turn }
        return picked
    }

    // ------------------------------------------------------------------ 内部

    private val mainTierWeights: (GameEvent, String?) -> Int = { e, line ->
        when {
            line == null -> 1
            e.storyline == line -> 6
            e.storyline != null && e.storyline.startsWith(line) -> 3
            else -> 1
        }
    }

    private fun weightedPick(
        pool: List<GameEvent>,
        activeStoryline: String?,
        weightOf: (GameEvent, String?) -> Int
    ): GameEvent? {
        if (pool.isEmpty()) return null
        if (pool.size == 1) return pool[0]
        val weights = pool.map { weightOf(it, activeStoryline) }
        val total = weights.sum()
        var r = random.nextDouble() * total
        for (i in pool.indices) {
            r -= weights[i]
            if (r <= 0) return pool[i]
        }
        return pool.last()
    }

    /** 支线无放回抽样，最多 [max] 张；同剧情线权重 4。 */
    private fun weightedBranch(pool: List<GameEvent>, activeStoryline: String?, max: Int): List<GameEvent> {
        if (pool.isEmpty()) return emptyList()
        val remaining = pool.map { it to if (activeStoryline != null && it.storyline == activeStoryline) 4 else 1 }.toMutableList()
        val selected = mutableListOf<GameEvent>()
        while (selected.size < max && remaining.isNotEmpty()) {
            val total = remaining.sumOf { it.second }
            var r = random.nextDouble() * total
            var index = -1
            for (i in remaining.indices) {
                r -= remaining[i].second
                if (r <= 0) { index = i; break }
            }
            if (index < 0) index = remaining.lastIndex
            selected.add(remaining[index].first)
            remaining.removeAt(index)
        }
        return selected
    }

    private fun withCooldown(
        pool: List<GameEvent>,
        type: String,
        turn: Int,
        lastTurnById: Map<String, Int>
    ): List<GameEvent> {
        val minGap = cooldownMonths[type] ?: return pool
        return pool.filter { e ->
            val last = lastTurnById[e.id]
            if (last == null || last > turn) return@filter true
            turn - last >= minGap
        }
    }

    /** 末班车判定：只读时间键，下个月年窗 / 月窗就关上。 */
    private fun lastChanceThisMonth(event: GameEvent, court: GameStateValues): Boolean {
        val cond = event.conditions
        val wrapsYear = court.currentMonth >= 12
        val nextMonth = if (wrapsYear) 1 else court.currentMonth + 1
        val nextYear = if (wrapsYear) court.currentYear + 1 else court.currentYear
        cond.turn?.max?.let { if (court.turn + 1 > it) return true }
        cond.year?.max?.let { yearMax ->
            if (nextYear > yearMax) return true
            if (nextYear.toDouble() == yearMax && cond.month?.max != null && nextMonth.toDouble() > cond.month.max!!) return true
        }
        return false
    }

    /** 回溯最近 8 条历史，取最近一条带 storyline 的事件线。 */
    private fun resolveStoryline(history: List<String>): String? {
        val recent = history.takeLast(8)
        for (i in recent.indices.reversed()) {
            data.events.firstOrNull { it.id == recent[i] }?.storyline?.let { return it }
        }
        return null
    }
}
