package com.chenbenkong.chongzhen.engine

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.conditions.ConditionEvaluator
import com.chenbenkong.chongzhen.engine.save.SaveSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// 引擎级集成测试（不挂 UI，直接调 GameEngine）：
// 新局 → 第一张 1628 事件 → 选一个开放选项 → 断言属性/flag 改前改后 →
// 进下月 → 第二张事件 id 变化 → 存档 → 读档 → 关键字段逐项相等。
// ============================================================================
class GameEngineFlowTest {

    private val data = TestFixture.data

    @Test fun `新局到抉择到下月到存档读档全链路`() {
        val engine = GameEngine(data, seed = 20261116L)
        engine.newGame(playerName = "链路测试", originType = "寒门", degree = "进士", difficultyId = "normal")

        // 1. 开局第一张事件（1628 年正月）
        val first = engine.currentEvent
        assertNotNull("开局应当发出第一张事件卡", first)
        assertEquals(1628, engine.state.court.currentYear)
        assertEquals(1, engine.state.court.currentMonth)

        val ctx = com.chenbenkong.chongzhen.engine.conditions.ConditionContext
            .from(engine.state.court, engine.state.character)
        val openChoice = first!!.choices.firstOrNull {
            ConditionEvaluator.evaluateChoice(it, ctx, engine.random)
        }
        assertNotNull("第一张事件至少有一个可点选项", openChoice)

        // 2. 抉择前快照
        val beforeAttr = engine.state.character.attributes.toMap()
        val beforeHidden = engine.state.character.hidden.toMap()
        val beforeFlags = engine.state.character.flags.toList()

        val outcome = engine.chooseChoice(openChoice!!.id)
        assertNotNull("抉择应当返回结算结果", outcome)

        // 3. 断言属性 / 隐藏 / flag 至少有一项发生变化（改前改后值）
        val afterAttr = engine.state.character.attributes.toMap()
        val afterHidden = engine.state.character.hidden.toMap()
        val afterFlags = engine.state.character.flags.toList()
        val attrChanged = beforeAttr != afterAttr
        val hiddenChanged = beforeHidden != afterHidden
        val flagChanged = beforeFlags != afterFlags
        assertTrue("抉择后属性/隐藏/flag 至少一项应变化", attrChanged || hiddenChanged || flagChanged)

        // 4. 进下月，第二张事件 id 必须与第一张不同
        val firstId = first.id
        engine.advanceMonth()
        assertNotNull("下月应当发出第二张事件卡", engine.currentEvent)
        assertNotEquals("第二张事件不应与第一张重复", firstId, engine.currentEvent!!.id)

        // 5. 存档 → 序列化 → 反序列化 → 引擎恢复，关键字段逐项相等
        val save = engine.toSaveData()
        val json = SaveSerializer.toJson(save)
        val restored = SaveSerializer.fromJson(json)

        val engine2 = GameEngine(data, seed = 20261116L)
        engine2.restore(restored)

        assertEquals(save.playerName, engine2.state.character.name)
        assertEquals(save.origin, engine2.state.character.origin)
        assertEquals(save.degree, engine2.state.character.degree)
        assertEquals(save.gameState.currentYear, engine2.state.court.currentYear)
        assertEquals(save.gameState.currentMonth, engine2.state.court.currentMonth)
        assertEquals(save.gameState.turn, engine2.state.court.turn)
        assertEquals(save.character.attributes, engine2.state.character.attributes)
        assertEquals(save.character.hidden, engine2.state.character.hidden)
        assertEquals(save.character.flags, engine2.state.character.flags)
        assertEquals(save.character.flagTurns, engine2.state.character.flagTurns)
        assertEquals(save.eventHistory, engine2.state.seenEventIds)
        assertEquals(save.currentEventId, engine2.currentEvent?.id)
    }
}
