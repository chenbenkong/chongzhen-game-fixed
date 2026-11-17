package com.chenbenkong.chongzhen.engine.pools

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

// ============================================================================
// 事件池单测：同种子连抽可复现；一次性事件不重复；prelude 前奏优先出牌。
// ============================================================================
class EventPoolTest {

    private fun drawSequence(seed: Long, months: Int): List<String> {
        val pool = EventPool(TestFixture.data, Random(seed))
        val court = TestFixture.defaultCourt()
        val char = TestFixture.defaultCharacter()
        val history = mutableListOf<String>()
        val lastTurn = mutableMapOf<String, Int>()
        val out = mutableListOf<String>()
        repeat(months) {
            val picked = pool.drawMonth(court, char, history, lastTurn)
            picked.firstOrNull()?.let {
                out.add(it.id)
                history.add(it.id)
            }
            court.currentMonth += 1
            if (court.currentMonth > 12) { court.currentMonth = 1; court.currentYear += 1 }
            court.turn += 1
        }
        return out
    }

    @Test fun `同种子连抽 20 次结果完全可复现`() {
        val a = drawSequence(20261116L, 20)
        val b = drawSequence(20261116L, 20)
        assertEquals(a, b)
        assertTrue("20 个月内应当发得出事件", a.isNotEmpty())
    }

    @Test fun `不同种子序列不同`() {
        val a = drawSequence(1L, 20)
        val b = drawSequence(2L, 20)
        assertTrue(a.isNotEmpty())
        // 两序列不必完全不同，但不应逐张相同
        assertTrue("不同种子应当产生分歧序列", a != b)
    }

    @Test fun `一次性事件不重复出现`() {
        val seq = drawSequence(7L, 30)
        val oneShotTypes = setOf("historical", "chain", "transition", "emotion")
        val eventsById = TestFixture.data.events.associateBy { it.id }
        val seen = mutableSetOf<String>()
        for (id in seq) {
            val type = eventsById[id]?.type ?: continue
            if (type in oneShotTypes) {
                assertTrue("一次性事件 $id 重复出现", seen.add(id))
            }
        }
    }

    @Test fun `全池同局一次性：任何已发出的卡不会再发第二次`() {
        val pool = EventPool(TestFixture.data, Random(11))
        val court = TestFixture.defaultCourt()
        val char = TestFixture.defaultCharacter()
        val history = mutableListOf<String>()
        val lastTurn = mutableMapOf<String, Int>()
        val seen = mutableSetOf<String>()

        repeat(40) { month ->
            val picked = pool.drawMonth(court, char, history, lastTurn)
            for (event in picked) {
                assertTrue("第 $month 月重复发出了已发出的卡 ${event.id}", seen.add(event.id))
            }
            // 发出的第一张会真正播放；pending 卡也视为已发，不能重新抽一遍。
            history.addAll(picked.map { it.id })
            court.turn += 1
        }
    }

    @Test fun `prelude 前奏在可用时排本月第一张`() {
        val pool = EventPool(TestFixture.data, Random(5))
        val court = TestFixture.defaultCourt()
        val char = TestFixture.defaultCharacter()
        val history = mutableListOf<String>()
        val lastTurn = mutableMapOf<String, Int>()

        val prelude = TestFixture.data.events.firstOrNull {
            it.type == "transition" && it.isPreEnding == true
        } ?: return // 数据中无前奏事件时本用例跳过断言

        val picked = pool.drawMonth(court, char, history, lastTurn)
        val preludeAvailable = picked.any { it.id == prelude.id }
        if (preludeAvailable) {
            assertEquals(prelude.id, picked.first().id)
        }
    }
}
