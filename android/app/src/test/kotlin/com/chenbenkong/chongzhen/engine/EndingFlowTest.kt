package com.chenbenkong.chongzhen.engine

import com.chenbenkong.chongzhen.TestFixture
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// 定向结局引擎级测试：构造满足结局条件的局（不改任何玩法门槛），
// 断言命中结局 id 且结局事件数据齐全；可搁笔结局只摆牌不结算。
// ============================================================================
class EndingFlowTest {

    private val data = TestFixture.data

    @Test fun `定向命中非搁笔结局：gameOver 置位且结局事件数据齐全`() {
        val engine = GameEngine(data, seed = 1L)
        engine.newGame("结局测试", "寒门", "进士", "normal")

        // 定向满足 ending_old_age：年龄≥70、年≥1635、turn≥36
        engine.state.character.age = 72.0
        engine.state.court.currentYear = 1640
        engine.state.court.turn = 40

        engine.advanceMonth()

        val hit = engine.activeEnding
        assertNotNull("应当命中某条结局", hit)
        assertTrue("非搁笔结局应当结算并置 gameOver", engine.state.gameOver)
        assertTrue("命中结局 id 应在结局登记表内", data.endings.endingIds.contains(hit!!.eventId))

        val event = hit.event
        assertNotNull("结局事件应能从事件表解析", event)
        assertTrue("结局标题非空", event!!.title.isNotBlank())
        assertTrue("结局正文非空", event.description.isNotBlank())
        assertTrue("结局至少带一个抉择/搁笔选项", event.choices.isNotEmpty())
    }

    @Test fun `可搁笔结局只摆牌不结算，gameOver 不置位`() {
        val engine = GameEngine(data, seed = 1L)
        engine.newGame("搁笔测试", "寒门", "进士", "normal")

        // 定向满足 ending_pure_stream（declinable）：文韬≥75、道德≥70、清议≥65、言官票
        val c = engine.state.character
        c.attributes["文韬"] = 80.0
        c.hidden["道德值"] = 75.0
        c.flags.add("言官")
        val court = engine.state.court
        court.currentYear = 1642
        court.turn = 40
        court.清议 = 70.0

        engine.advanceMonth()

        val hit = engine.activeEnding
        assertNotNull("应当命中可搁笔结局", hit)
        assertTrue("命中条目必须标记 declinable", hit!!.declinable)
        assertFalse("可搁笔结局不得结算置 gameOver", engine.state.gameOver)
    }
}
