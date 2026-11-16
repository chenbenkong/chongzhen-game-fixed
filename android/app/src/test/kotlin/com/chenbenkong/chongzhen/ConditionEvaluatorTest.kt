package com.chenbenkong.chongzhen

import com.chenbenkong.chongzhen.data.EventConditions
import com.chenbenkong.chongzhen.data.FlagsCond
import com.chenbenkong.chongzhen.data.RangeCond
import com.chenbenkong.chongzhen.data.SinceAnyCond
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

// ============================================================================
// 条件求值器单测：year/month/turn/age/flags(has/notHas/since/sinceAny/minCount/any)/random
// 正反例成对覆盖；事件级缺键口径（属性 0、隐藏判假）一并钉住。
// ============================================================================
class ConditionEvaluatorTest {

    private fun eval(cond: EventConditions, year: Int = 1628, month: Int = 1, turn: Int = 0,
                     age: Double = 22.0, flags: List<String> = emptyList(),
                     flagTurns: Map<String, Int> = emptyMap(),
                     attributes: Map<String, Double> = emptyMap(),
                     hidden: Map<String, Double> = emptyMap(),
                     gameState: Map<String, Double> = emptyMap()): Boolean {
        val court = TestFixture.defaultCourt(year, month, turn)
        val char = TestFixture.defaultCharacter(
            age = age, flags = flags, flagTurns = flagTurns,
            attributes = attributes, hidden = hidden
        )
        val ctx = TestFixture.ctx(court, char).copy(gameState = gameState)
        return ConditionEvaluator.evaluate(cond, ctx, Random(42))
    }

    @Test fun `year 区间内放行，区间外关闭`() {
        val cond = EventConditions(year = RangeCond(min = 1630.0, max = 1640.0))
        assertTrue(eval(cond, year = 1635))
        assertFalse(eval(cond, year = 1629))
        assertFalse(eval(cond, year = 1641))
    }

    @Test fun `month 区间内放行，区间外关闭`() {
        val cond = EventConditions(month = RangeCond(min = 6.0, max = 9.0))
        assertTrue(eval(cond, month = 7))
        assertFalse(eval(cond, month = 3))
        assertFalse(eval(cond, month = 11))
    }

    @Test fun `turn 门槛内放行，门槛外关闭`() {
        val cond = EventConditions(turn = RangeCond(min = 12.0))
        assertTrue(eval(cond, turn = 13))
        assertFalse(eval(cond, turn = 11))
    }

    @Test fun `age 门槛内放行，门槛外关闭`() {
        val cond = EventConditions(age = RangeCond(min = 30.0))
        assertTrue(eval(cond, age = 31.0))
        assertFalse(eval(cond, age = 29.0))
    }

    @Test fun `flags has 全持有放行，缺一张关闭`() {
        val cond = EventConditions(flags = FlagsCond(has = listOf("A", "B")))
        assertTrue(eval(cond, flags = listOf("A", "B", "C")))
        assertFalse(eval(cond, flags = listOf("A")))
    }

    @Test fun `flags notHas 全禁通过，持禁票关闭`() {
        val cond = EventConditions(flags = FlagsCond(notHas = listOf("X", "Y")))
        assertTrue(eval(cond, flags = listOf("A")))
        assertFalse(eval(cond, flags = listOf("X")))
    }

    @Test fun `flags any 任一命中放行，全缺关闭`() {
        val cond = EventConditions(flags = FlagsCond(any = listOf("P", "Q")))
        assertTrue(eval(cond, flags = listOf("Q")))
        assertFalse(eval(cond, flags = listOf("R")))
    }

    @Test fun `flags since 持有且时长达标放行，时长不足关闭`() {
        val cond = EventConditions(flags = FlagsCond(since = mapOf("A" to RangeCond(min = 3.0))))
        assertTrue(eval(cond, turn = 5, flags = listOf("A"), flagTurns = mapOf("A" to 0)))
        assertFalse(eval(cond, turn = 1, flags = listOf("A"), flagTurns = mapOf("A" to 0)))
        // 缺票直接关闭
        assertFalse(eval(cond, turn = 5, flags = emptyList()))
    }

    @Test fun `flags sinceAny 任一达标放行，全缺关闭`() {
        val cond = EventConditions(flags = FlagsCond(
            sinceAny = SinceAnyCond(flags = listOf("A", "B"), min = 3.0)
        ))
        assertTrue(eval(cond, turn = 5, flags = listOf("B"), flagTurns = mapOf("B" to 1)))
        assertFalse(eval(cond, turn = 1, flags = listOf("B"), flagTurns = mapOf("B" to 0)))
        assertFalse(eval(cond, turn = 5, flags = emptyList()))
    }

    @Test fun `flags minCount 命中数达标放行，不足关闭`() {
        val cond = EventConditions(flags = FlagsCond(
            minCount = com.chenbenkong.chongzhen.data.MinCountCond(
                flags = listOf("A", "B", "C"), min = 2.0
            )
        ))
        assertTrue(eval(cond, flags = listOf("A", "B")))
        assertFalse(eval(cond, flags = listOf("A")))
    }

    @Test fun `random 概率门：0 必关，1 必开`() {
        assertFalse(eval(EventConditions(random = 0.0)))
        assertTrue(eval(EventConditions(random = 1.0)))
        // >1 按百分数：100 必开
        assertTrue(eval(EventConditions(random = 100.0)))
    }

    @Test fun `事件级属性缺键按 0，隐藏属性缺键判假`() {
        val bareChar = com.chenbenkong.chongzhen.engine.state.CharacterState(
            attributes = mutableMapOf(), hidden = mutableMapOf()
        )
        val court = TestFixture.defaultCourt()
        val attrCond = EventConditions(attributes = mapOf("财帛" to RangeCond(min = 10.0)))
        assertFalse(ConditionEvaluator.evaluate(attrCond, TestFixture.ctx(court, bareChar)))
        val hiddenCond = EventConditions(hidden = mapOf("道德值" to RangeCond(min = 10.0)))
        assertFalse(ConditionEvaluator.evaluate(hiddenCond, TestFixture.ctx(court, bareChar)))
    }
}
