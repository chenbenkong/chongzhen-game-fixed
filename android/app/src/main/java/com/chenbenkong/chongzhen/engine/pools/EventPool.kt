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
//       random 一次性填充 → 支线（全部本局一次性），支线无放回最多 2 张；同剧情线加权。
// 随机源为可注入的 seeded Random，同种子结果可复现。
// ============================================================================
class EventPool(
    private val data: GameData,
    private val random: Random
) {

    /**
     * 本月发牌。
     * @param history 已播出事件 id 序列（本局一次性判重 + 剧情线回溯）
     * @param lastTurnById 事件 id → 最后播出月份（仍写存档，供边界危机等旧数据读取）
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
        // 换皮事件互斥：eventId → exclusiveGroup，再用历史 id 反查已发过的组。
        // 历史不随读档丢失，所以读档后同组换皮卡也不会立刻再撞一次。
        val exclusiveGroupByEventId = data.events.mapNotNull { event ->
            event.exclusiveGroup?.let { event.id to it }
        }.toMap()
        val seenExclusiveGroups = history.mapNotNull { exclusiveGroupByEventId[it] }.toSet()
        val isGroupBlocked: (GameEvent) -> Boolean = { event ->
            event.exclusiveGroup?.let { it in seenExclusiveGroups } == true
        }
        // 本局经历过的事件不再发第二次：random / gray / character / national / faction
        // 与 historical / transition 用同一把尺子，读档后 eventHistory 仍在，不会重发。
        val isUnseen: (GameEvent) -> Boolean = { event ->
            !seen.contains(event.id) && !isGroupBlocked(event)
        }
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

        // 4. 本月无主戏时，random 一次性填充
        if (results.isEmpty()) {
            val randomPool = available.filter { it.type == "random" && isUnseen(it) }
            weightedPick(randomPool, activeStoryline, mainTierWeights)?.let { results.add(it) }
        }

        // 5. 支线：全部本局一次性；抽过的不再回池
        val branchEmotion = available.filter {
            it.type == "emotion" && isUnseen(it)
        }
        val branchOnce = listOf("gray", "character", "national", "faction").flatMap { type ->
            available.filter { it.type == type && isUnseen(it) }
        }
        val branchPool = branchEmotion + branchOnce
        results.addAll(weightedBranch(branchPool, activeStoryline, max = 2, seenExclusiveGroups = seenExclusiveGroups))

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

    /** 支线无放回抽样，最多 [max] 张；同剧情线权重 4，同组换皮卡只取一张。 */
    private fun weightedBranch(
        pool: List<GameEvent>,
        activeStoryline: String?,
        max: Int,
        seenExclusiveGroups: Set<String>
    ): List<GameEvent> {
        if (pool.isEmpty()) return emptyList()
        val remaining = pool.map { it to if (activeStoryline != null && it.storyline == activeStoryline) 4 else 1 }.toMutableList()
        val selected = mutableListOf<GameEvent>()
        val selectedExclusiveGroups = mutableSetOf<String>()
        while (selected.size < max && remaining.isNotEmpty()) {
            val total = remaining.sumOf { it.second }
            var r = random.nextDouble() * total
            var index = -1
            for (i in remaining.indices) {
                r -= remaining[i].second
                if (r <= 0) { index = i; break }
            }
            if (index < 0) index = remaining.lastIndex
            val candidate = remaining[index].first
            val group = candidate.exclusiveGroup
            if (group != null && (group in seenExclusiveGroups || group in selectedExclusiveGroups)) {
                remaining.removeAt(index)
                continue
            }
            selected.add(candidate)
            if (group != null) selectedExclusiveGroups.add(group)
            remaining.removeAt(index)
        }
        return selected
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
