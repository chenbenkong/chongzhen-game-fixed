package com.chenbenkong.chongzhen.engine.conditions

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.data.EventChoice
import com.chenbenkong.chongzhen.data.EventConditions
import com.chenbenkong.chongzhen.data.FlagsCond
import com.chenbenkong.chongzhen.data.RangeCond
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

// ============================================================================
// 结构化选项可用性单测：至少 3 种 reasonCode 正反例，钉住原因码 / 差距 / 难度 /
// 不可勉力一试的门（出身 / 经历）不给 difficulty。
// ============================================================================
class ChoiceAvailabilityTest {

    private fun check(
        cond: EventConditions?,
        attributes: Map<String, Double> = emptyMap(),
        hidden: Map<String, Double> = emptyMap(),
        gameState: Map<String, Double> = emptyMap(),
        flags: List<String> = emptyList(),
        origin: String = "寒门",
        rank: String = "正七品·知县"
    ): ChoiceAvailability {
        val court = TestFixture.defaultCourt().copy().let {
            gameState.forEach { (k, v) ->
                when (k) {
                    "圣眷" -> it.圣眷 = v
                    "中官" -> it.中官 = v
                    "清议" -> it.清议 = v
                    "士绅" -> it.士绅 = v
                    "民望" -> it.民望 = v
                    "国势" -> it.国势 = v
                }
            }
            it
        }
        val char = TestFixture.defaultCharacter(
            origin = origin, rank = rank, attributes = attributes, hidden = hidden, flags = flags
        )
        val choice = EventChoice(id = "c", text = "选项", showConditions = cond)
        return ConditionEvaluator.evaluateChoiceDetailed(choice, TestFixture.ctx(court, char), Random(1))
    }

    @Test fun `属性不足给 attr_insufficient，带差距与投骰难度；达标放行`() {
        val cond = EventConditions(attributes = mapOf("文韬" to RangeCond(min = 70.0)))
        val locked = check(cond, attributes = mapOf("文韬" to 50.0))
        assertEquals(false, locked.available)
        assertEquals(ChoiceAvailability.CODE_ATTR_INSUFFICIENT, locked.reasonCode)
        assertEquals(20.0, locked.gap)
        assertTrue(locked.difficulty != null)
        assertTrue(locked.reasonText.contains("文韬不足"))

        val open = check(cond, attributes = mapOf("文韬" to 70.0))
        assertTrue(open.available)
        assertEquals(ChoiceAvailability.CODE_OK, open.reasonCode)
    }

    @Test fun `态度不足给 state_insufficient；经历缺失给 flag_missing 且不可投骰`() {
        val stateCond = EventConditions(gameState = mapOf("圣眷" to RangeCond(min = 80.0)))
        val stateLocked = check(stateCond, gameState = mapOf("圣眷" to 50.0))
        assertEquals(ChoiceAvailability.CODE_STATE_INSUFFICIENT, stateLocked.reasonCode)
        assertEquals(30.0, stateLocked.gap)
        assertTrue(stateLocked.difficulty != null)

        val flagCond = EventConditions(flags = FlagsCond(has = listOf("勤王有功")))
        val flagLocked = check(flagCond, flags = emptyList())
        assertEquals(ChoiceAvailability.CODE_FLAG_MISSING, flagLocked.reasonCode)
        assertNull(flagLocked.difficulty)

        val flagOpen = check(flagCond, flags = listOf("勤王有功"))
        assertTrue(flagOpen.available)
    }

    @Test fun `隐藏不足给 hidden_insufficient；出身不符给 origin_denied 且不可投骰`() {
        val hiddenCond = EventConditions(hidden = mapOf("道德值" to RangeCond(min = 70.0)))
        val hiddenLocked = check(hiddenCond, hidden = mapOf("道德值" to 50.0))
        assertEquals(ChoiceAvailability.CODE_HIDDEN_INSUFFICIENT, hiddenLocked.reasonCode)
        assertTrue(hiddenLocked.difficulty != null)

        val originCond = EventConditions(origin = kotlinx.serialization.json.JsonPrimitive("缙绅"))
        val originLocked = check(originCond, origin = "寒门")
        assertEquals(ChoiceAvailability.CODE_ORIGIN_DENIED, originLocked.reasonCode)
        assertNull(originLocked.difficulty)
    }

    @Test fun `硬门与软门同时失败时硬门优先，difficulty 为 null`() {
        // 出身（硬门）不符 + 文韬（软门）也不足；必须先判出身，不给骰子。
        val cond = EventConditions(
            origin = kotlinx.serialization.json.JsonPrimitive("缙绅"),
            attributes = mapOf("文韬" to RangeCond(min = 70.0))
        )
        val locked = check(cond, origin = "寒门", attributes = mapOf("文韬" to 50.0))
        assertEquals(false, locked.available)
        assertEquals(ChoiceAvailability.CODE_ORIGIN_DENIED, locked.reasonCode)
        assertNull(locked.difficulty)
    }

    @Test fun `硬门通过后属性不足才给投骰难度`() {
        val cond = EventConditions(
            origin = kotlinx.serialization.json.JsonPrimitive("寒门"),
            attributes = mapOf("理政" to RangeCond(min = 65.0))
        )
        val softLocked = check(cond, origin = "寒门", attributes = mapOf("理政" to 50.0))
        assertEquals(false, softLocked.available)
        assertEquals(ChoiceAvailability.CODE_ATTR_INSUFFICIENT, softLocked.reasonCode)
        assertTrue(softLocked.difficulty != null)
    }

    @Test fun `无条件选项直接放行`() {
        val open = check(null)
        assertTrue(open.available)
        assertEquals(ChoiceAvailability.CODE_OK, open.reasonCode)
        assertNull(open.difficulty)
    }
}
