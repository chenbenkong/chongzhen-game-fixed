package com.chenbenkong.chongzhen.ui

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.GameEngine
import com.chenbenkong.chongzhen.engine.save.SaveSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// UI 接线层集成测试（不挂 Android UI，直接驱动 GameController）：
// 标题 → 取名 → 选出身 → 第一张事件 → 点开放选项 → 断言属性 / 隐藏 / flag 变化 →
// 继续 / 进下月 → 事件 id 变化 → 存档 → 新 Controller 读档 → 关键字段逐项相等。
// 本类为 UI agent 自建测试，不改动 engine/ 与 data/ 下既有用例。
// ============================================================================
class BoardControllerTest {

    private val data = TestFixture.data
    private var savedJson: String? = null

    private fun newController() = GameController(
        data = data,
        codex = InMemoryCodexStore(),
        seed = 20261116L,
        loadSave = { savedJson?.let { SaveSerializer.fromJson(it) } },
        writeSave = { saved -> savedJson = SaveSerializer.toJson(saved); true },
        deleteSave = { savedJson = null }
    )

    @Test
    fun `开局到第一张事件到结算到进下月到存档读档全链路`() {
        val controller = newController()

        // 1. 标题屏：图鉴总数来自结局登记表
        controller.enterTitle()
        var state = controller.state.value
        assertEquals(Screen.Title, state.screen)
        assertEquals(data.endings.endingIds.size, state.endingTotal)

        // 2. 取名 → 出身屏
        controller.beginNewGame()
        controller.updateDraft {
            it.copy(
                surname = "张",
                givenName = "明远",
                courtesyName = "伯远",
                ageText = "22",
                hometown = "南直隶苏州府吴县",
                autoCourtesy = false
            )
        }
        assertNull("取名校验应通过", controller.confirmName())
        assertEquals(Screen.Origin, controller.state.value.screen)

        // 3. 选出身开局，第一张事件必须发出
        controller.selectOrigin("寒门")
        state = controller.state.value
        assertEquals(Screen.Board, state.screen)
        assertNotNull("开局应当发出第一张事件卡", state.event)
        assertTrue("第一张事件至少有一个可点选项", state.choices.any { it.open })

        val firstEventId = state.event!!.id
        val openChoice = state.choices.first { it.open }.choice

        // 4. 抉择前快照
        val beforeAttr = state.board!!.attributes.toMap()
        val beforeHidden = state.board!!.hidden.toMap()
        val beforeFlags = state.board!!.flags.toList()

        controller.choose(openChoice.id)
        state = controller.state.value
        assertTrue("抉择后应展示结算面板", state.outcomeVisible)
        assertNotNull("结算结果非空", state.outcome)

        val afterAttr = state.board!!.attributes.toMap()
        val afterHidden = state.board!!.hidden.toMap()
        val afterFlags = state.board!!.flags.toList()
        assertTrue(
            "抉择后属性 / 隐藏 / flag 至少一项应变化",
            beforeAttr != afterAttr || beforeHidden != afterHidden || beforeFlags != afterFlags
        )

        // 5. 结算面板「继续」；同月队列空则进下月，第二张事件 id 必须不同
        controller.proceedAfterOutcome()
        state = controller.state.value
        if (state.event == null) {
            controller.advanceMonth()
            state = controller.state.value
        }
        assertNotNull("推进后应当有事件卡", state.event)
        assertNotEquals("第二张事件不应与第一张重复", firstEventId, state.event!!.id)

        // 6. 存档
        controller.saveNow()
        assertNotNull("存档应落盘为 JSON", savedJson)

        // 7. 新 Controller 读档，关键字段逐项相等
        val restored = newController()
        restored.continueGame()
        val state2 = restored.state.value
        assertEquals(Screen.Board, state2.screen)
        val b1 = state.board!!
        val b2 = state2.board!!
        assertEquals(b1.name, b2.name)
        assertEquals(b1.courtesyName, b2.courtesyName)
        assertEquals(b1.hometown, b2.hometown)
        assertEquals(b1.age, b2.age)
        assertEquals(b1.year, b2.year)
        assertEquals(b1.month, b2.month)
        assertEquals(b1.attributes, b2.attributes)
        assertEquals(b1.hidden, b2.hidden)
        assertEquals(b1.flags, b2.flags)
        assertEquals(b1.rank, b2.rank)
    }

    @Test
    fun `未抉择时进下月被禁用并给出原因`() {
        val controller = newController()
        controller.beginNewGame()
        controller.updateDraft {
            it.copy(surname = "李", givenName = "若虚", courtesyName = "子静", ageText = "22", hometown = "浙江杭州府钱塘县")
        }
        controller.confirmName()
        controller.selectOrigin("缙绅")

        val state = controller.state.value
        assertEquals(Screen.Board, state.screen)
        assertNotNull(state.event)
        assertNotNull("未抉择时进下月应被拦截并给原因", state.advanceBlockedReason)
    }

    @Test
    fun `存档损坏进入可读错误页而不是白屏`() {
        savedJson = "{ broken json"
        val controller = newController()
        controller.continueGame()
        assertEquals(Screen.FatalError, controller.state.value.screen)
        assertTrue(controller.state.value.error is UiError.SaveCorrupt)
    }

    @Test
    fun `gameOver 状态进入结局屏而不被 else 抢到牌桌`() {
        // 定向满足 ending_old_age（与引擎 EndingFlowTest 同口径），先在引擎侧置 gameOver。
        val eng = GameEngine(data, seed = 1L)
        eng.newGame("结局测试", "寒门", "进士", "normal")
        eng.state.character.age = 72.0
        eng.state.court.currentYear = 1640
        eng.state.court.turn = 40
        eng.advanceMonth()
        assertTrue("前置条件：应当已 gameOver", eng.state.gameOver)

        val controller = newController()
        controller.attachEngineForTest(eng)

        assertEquals(Screen.Ending, controller.state.value.screen)
        assertNotNull("结局视图应当已组装", controller.state.value.ending)
    }
}
