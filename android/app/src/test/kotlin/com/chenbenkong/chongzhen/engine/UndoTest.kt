package com.chenbenkong.chongzhen.engine

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import com.chenbenkong.chongzhen.engine.conditions.ConditionContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// 悔棋单测：抉择前压栈，撤销后属性 / flag / 回合 / 履历 / 当前事件逐项回到抉择前；
// 支持连续多步撤销；读档后撤销栈清空。
// ============================================================================
class UndoTest {

    private val data = TestFixture.data

    private fun firstOpenChoice(engine: GameEngine): String {
        val event = engine.currentEvent!!
        val ctx = ConditionContext.from(engine.state.court, engine.state.character)
        return event.choices.first { ConditionEvaluator.evaluateChoice(it, ctx, engine.random) }.id
    }

    @Test fun `抉择后撤销：属性 flag 回合履历当前事件回到抉择前`() {
        val engine = GameEngine(data, seed = 7L)
        engine.newGame("悔棋测试", "寒门", "进士", "normal")

        val beforeAttr = engine.state.character.attributes.toMap()
        val beforeFlags = engine.state.character.flags.toList()
        val beforeTurn = engine.state.court.turn
        val beforeHistory = engine.state.character.history.size
        val beforeEventId = engine.currentEvent!!.id

        val choiceId = firstOpenChoice(engine)
        val outcome = engine.chooseChoice(choiceId)
        assertNotNull(outcome)
        assertTrue(engine.canUndo())

        // 抉择后确有变化
        assertFalse(beforeAttr == engine.state.character.attributes.toMap())

        assertTrue(engine.undo())
        assertFalse(engine.canUndo())

        assertEquals(beforeAttr, engine.state.character.attributes.toMap())
        assertEquals(beforeFlags, engine.state.character.flags.toList())
        assertEquals(beforeTurn, engine.state.court.turn)
        assertEquals(beforeHistory, engine.state.character.history.size)
        assertEquals(beforeEventId, engine.currentEvent?.id)
    }

    @Test fun `连续两步撤销回到第一次抉择之前`() {
        val engine = GameEngine(data, seed = 11L)
        engine.newGame("连悔测试", "寒门", "进士", "normal")

        val attr0 = engine.state.character.attributes.toMap()
        val flags0 = engine.state.character.flags.toList()
        val turn0 = engine.state.court.turn

        engine.chooseChoice(firstOpenChoice(engine))
        engine.advanceMonth()
        engine.chooseChoice(firstOpenChoice(engine))

        assertTrue(engine.canUndo())
        engine.undo()
        assertTrue(engine.canUndo())
        engine.undo()

        assertEquals(attr0, engine.state.character.attributes.toMap())
        assertEquals(flags0, engine.state.character.flags.toList())
        assertEquals(turn0, engine.state.court.turn)
    }

    @Test fun `读档后撤销栈清空`() {
        val engine = GameEngine(data, seed = 5L)
        engine.newGame("档后测试", "寒门", "进士", "normal")
        engine.chooseChoice(firstOpenChoice(engine))
        assertTrue(engine.canUndo())

        val save = engine.toSaveData()
        val engine2 = GameEngine(data, seed = 5L)
        engine2.restore(save)
        assertFalse(engine2.canUndo())
    }
}
