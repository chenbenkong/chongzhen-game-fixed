package com.chenbenkong.chongzhen.engine

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.save.SaveSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// 投骰分支单测：锁定但可勉力一试的选项，1..6 对比难度。
// 失败优先 failEffects（本数据未配）→ 反推失败效果；成功走原 effects。
// 用显式 diceRoll 钉死成败，不改任何玩法门槛。
// ============================================================================
class DiceBranchTest {

    private val data = TestFixture.data

    /** 把当前事件换成 historical_009 的 c2（理政≥65，默认 50，可勉力一试）。 */
    private fun engineOnHistorical009(): GameEngine {
        val engine = GameEngine(data, seed = 3L)
        engine.newGame("投骰测试", "寒门", "进士", "normal")
        val save = engine.toSaveData().copy(currentEventId = "historical_009", pendingEventIds = emptyList())
        engine.restore(save)
        return engine
    }

    @Test fun `投骰失败走反推失败效果，不再凭空扣道德或加野心`() {
        val engine = engineOnHistorical009()
        val before = engine.state.character.hidden.toMap()

        // c2 理政门槛 65，默认 50，难度 3；掷 1 必败。
        val outcome = engine.chooseChoice("c2", diceRoll = 1)
        assertNotNull(outcome)
        assertEquals(false, outcome!!.diceSuccess)
        assertTrue(outcome.usedFailEffects)
        assertEquals(1, outcome.diceRoll)

        // 成功效果没有正向道德增量 → 失败不再凭空道德 -2、野心 +2。
        val after = engine.state.character.hidden
        assertEquals(0.0, (after["道德值"] ?: 0.0) - (before["道德值"] ?: 0.0), 0.001)
        assertEquals(0.0, (after["野心值"] ?: 0.0) - (before["野心值"] ?: 0.0), 0.001)
        assertTrue(outcome.resultTitle!!.isNotBlank())
        assertTrue(outcome.resultEcho!!.isNotBlank())
    }

    @Test fun `投骰成功走原 effects，理政获得正向增量`() {
        val engine = engineOnHistorical009()
        val before = engine.state.character.attributes["理政"] ?: 0.0

        // 掷 6 ≥ 难度 3，成功。
        val outcome = engine.chooseChoice("c2", diceRoll = 6)
        assertNotNull(outcome)
        assertEquals(true, outcome!!.diceSuccess)
        assertFalse(outcome.usedFailEffects)

        val after = engine.state.character.attributes["理政"] ?: 0.0
        assertTrue("成功后理政应上涨", after > before)
        assertEquals("建议议和，朝野哗然", outcome.resultTitle)
    }

    @Test fun `路线封闭选项出身经历不可投骰直接拒绝`() {
        // historical_009 c1 要求出身「没落世家」；本局寒门不符 → 出身硬门，不可勉力一试。
        val engine = engineOnHistorical009()
        val choice = engine.currentEvent!!.choices.first { it.id == "c1" }
        val avail = com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
            .evaluateChoiceDetailed(
                choice,
                com.chenbenkong.chongzhen.engine.conditions.ConditionContext.from(
                    engine.state.court, engine.state.character
                ),
                engine.random
            )
        assertEquals(false, avail.available)
        assertEquals(
            com.chenbenkong.chongzhen.engine.conditions.ChoiceAvailability.CODE_ORIGIN_DENIED,
            avail.reasonCode
        )
        assertNull(avail.difficulty)

        // 即便掷出最大点 6，硬门也不许骰子绕过。
        val outcome = engine.chooseChoice("c1", diceRoll = 6)
        assertEquals(null, outcome)
    }

    @Test fun `反推失败效果隐藏属性裁剪在 0 到 100`() {
        val engine = engineOnHistorical009()
        engine.chooseChoice("c2", diceRoll = 1)
        engine.state.character.hidden.values.forEach { v ->
            assertTrue("隐藏属性应在 0..100", v in 0.0..100.0)
        }
    }

    @Test fun `存档往返保留 lastTurnById`() {
        val engine = GameEngine(data, seed = 9L)
        engine.newGame("存档测试", "寒门", "进士", "normal")
        engine.chooseChoice(engine.currentEvent!!.choices.first().id)

        val save = engine.toSaveData()
        val json = SaveSerializer.toJson(save)
        val restored = SaveSerializer.fromJson(json)
        assertEquals(save.lastTurnById, restored.lastTurnById)
    }
}
