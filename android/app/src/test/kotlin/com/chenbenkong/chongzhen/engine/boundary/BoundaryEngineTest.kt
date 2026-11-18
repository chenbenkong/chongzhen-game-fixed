package com.chenbenkong.chongzhen.engine.boundary

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

// ============================================================================
// 边界引擎单测：3 条结局条件正反例；可搁笔结局只摆牌不结算；
// 未移植规则显式计数（禁止静默 false）。
// ============================================================================
class BoundaryEngineTest {

    private val engine = BoundaryEngine(TestFixture.data, Random(1))
    private val eventsById = TestFixture.data.events.associateBy { it.id }

    @Test fun `结局 old_age 条件：高龄放行，年轻关闭`() {
        val event = eventsById.getValue("ending_old_age")
        val ok = TestFixture.defaultCharacter(age = 72.0)
        val okCourt = TestFixture.defaultCourt(year = 1640, turn = 40)
        assertTrue(ConditionEvaluator.evaluate(event.conditions, TestFixture.ctx(okCourt, ok)))

        val young = TestFixture.defaultCharacter(age = 22.0)
        val youngCourt = TestFixture.defaultCourt(year = 1628, turn = 0)
        assertFalse(ConditionEvaluator.evaluate(event.conditions, TestFixture.ctx(youngCourt, young)))
    }

    @Test fun `结局 unknown_fate 条件：下落不明且国势衰微放行，缺票关闭`() {
        val event = eventsById.getValue("ending_unknown_fate")
        val okChar = TestFixture.defaultCharacter(flags = listOf("下落不明", "隐姓埋名"))
        val okCourt = TestFixture.defaultCourt(year = 1640, turn = 40, 国势 = 10.0)
        assertTrue(ConditionEvaluator.evaluate(event.conditions, TestFixture.ctx(okCourt, okChar)))

        val noTicket = TestFixture.defaultCharacter(flags = emptyList())
        assertFalse(ConditionEvaluator.evaluate(event.conditions, TestFixture.ctx(okCourt, noTicket)))
    }

    @Test fun `结局 pure_stream 条件：清流票+高文韬道德放行，文韬不足关闭`() {
        val event = eventsById.getValue("ending_pure_stream")
        val okChar = TestFixture.defaultCharacter(
            attributes = mapOf("文韬" to 80.0),
            hidden = mapOf("道德值" to 75.0),
            flags = listOf("言官")
        )
        val okCourt = TestFixture.defaultCourt(year = 1642, turn = 40, 清议 = 70.0)
        assertTrue(ConditionEvaluator.evaluate(event.conditions, TestFixture.ctx(okCourt, okChar)))

        val weak = TestFixture.defaultCharacter(
            attributes = mapOf("文韬" to 30.0),
            hidden = mapOf("道德值" to 75.0),
            flags = listOf("言官")
        )
        assertFalse(ConditionEvaluator.evaluate(event.conditions, TestFixture.ctx(okCourt, weak)))
    }

    @Test fun `边界引擎：高龄结局命中，开局年轻无结局`() {
        val oldChar = TestFixture.defaultCharacter(age = 72.0)
        val oldCourt = TestFixture.defaultCourt(year = 1640, turn = 40)
        val hit = engine.checkEnding(TestFixture.ctx(oldCourt, oldChar), oldChar, oldCourt)
        assertNotNull("高龄状态应当命中某条结局", hit)

        val youngChar = TestFixture.defaultCharacter(age = 22.0)
        val youngCourt = TestFixture.defaultCourt(year = 1628, turn = 0)
        val miss = engine.checkEnding(TestFixture.ctx(youngCourt, youngChar), youngChar, youngCourt)
        assertNull("开局状态不应命中结局", miss)
    }

    @Test fun `可搁笔结局登记在 declinable 清单内`() {
        assertTrue(TestFixture.data.endings.declinableEndingIds.contains("ending_pure_stream"))
        val hit = engine.checkEnding(
            TestFixture.ctx(
                TestFixture.defaultCourt(year = 1642, turn = 40, 清议 = 70.0),
                TestFixture.defaultCharacter(
                    attributes = mapOf("文韬" to 80.0), hidden = mapOf("道德值" to 75.0), flags = listOf("言官")
                )
            ),
            TestFixture.defaultCharacter(
                attributes = mapOf("文韬" to 80.0), hidden = mapOf("道德值" to 75.0), flags = listOf("言官")
            ),
            TestFixture.defaultCourt(year = 1642, turn = 40, 清议 = 70.0)
        )
        if (hit != null) assertTrue("命中的可搁笔结局必须标记 declinable", hit.declinable)
    }

    @Test fun `22 条手写规则全部移植，未移植计数为 0`() {
        assertEquals(0, engine.unportedCount)
        assertEquals(22, engine.portedIds.size)
    }

    @Test fun `属性归零先出警告卡，持警告票后才出死线结局，不许跳过 warning 直接死`() {
        // 阶段 A：财帛归零、身上还没有警告票 → 先出归零警告卡，且不死线结局
        val charA = TestFixture.defaultCharacter(
            attributes = mapOf("财帛" to 0.0), flags = emptyList()
        )
        val courtA = TestFixture.defaultCourt(turn = 12)
        val crisisA = engine.checkCrisis(TestFixture.ctx(courtA, charA), charA, courtA, emptyMap())
        assertNotNull("归零状态应当先发警告卡", crisisA)
        assertEquals("warn_zero_财帛", crisisA!!.registryId)
        val endingA = engine.checkEnding(TestFixture.ctx(courtA, charA), charA, courtA)
        assertFalse("未持警告票时不得直接判破产结局", endingA?.registryId == "bankrupt")

        // 阶段 B：警告卡选项已写入警告票 → 警告不再重复，死线结局 bankrupt 命中
        val charB = TestFixture.defaultCharacter(
            attributes = mapOf("财帛" to 0.0), flags = listOf("归零警告·财帛")
        )
        val crisisB = engine.checkCrisis(TestFixture.ctx(courtA, charB), charB, courtA, emptyMap())
        assertFalse("已持警告票后警告卡不得重复", crisisB?.registryId == "warn_zero_财帛")
        val courtB = TestFixture.defaultCourt(turn = 30)
        val endingB = engine.checkEnding(TestFixture.ctx(courtB, charB), charB, courtB)
        assertNotNull("持警告票且仍归零时应判死线结局", endingB)
        assertEquals("bankrupt", endingB!!.registryId)
    }

    @Test fun `faction_sacrifice 年下限 1635：1634 不触发，1635 触发`() {
        fun sacrificeState(year: Int) {
            val char = TestFixture.defaultCharacter(flags = emptyList())
            char.faction.东林好感 = 30.0
            char.faction.阉党好感 = 30.0
            char.faction.党争烈度 = 90.0
            val court = TestFixture.defaultCourt(year = year, turn = 36)
            val hit = engine.checkEnding(TestFixture.ctx(court, char), char, court)
            if (year == 1634) {
                assertFalse("1634 年不得判党争牺牲品", hit?.registryId == "faction_sacrifice")
            } else {
                assertEquals("1635 年应判党争牺牲品", "faction_sacrifice", hit?.registryId)
            }
        }
        sacrificeState(1634)
        sacrificeState(1635)
    }
}
