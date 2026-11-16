package com.chenbenkong.chongzhen.engine.save

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.GameEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// 存档单测：写 → 读 round-trip 后关键字段逐项相等；schemaVersion 落盘。
// ============================================================================
class SaveFormatTest {

    @Test fun `存档 round-trip 关键字段逐项相等`() {
        val engine = GameEngine(TestFixture.data, seed = 99L)
        engine.newGame(playerName = "崇祯测试", originType = "寒门", degree = "进士", difficultyId = "normal")

        // 推两个月，让日历 / 履历有变化
        engine.advanceMonth()
        engine.advanceMonth()

        val before = engine.toSaveData()
        val json = SaveSerializer.toJson(before)
        val after = SaveSerializer.fromJson(json)

        assertEquals(SAVE_SCHEMA_VERSION, after.schemaVersion)
        assertEquals(before.playerName, after.playerName)
        assertEquals(before.origin, after.origin)
        assertEquals(before.degree, after.degree)
        assertEquals(before.difficulty, after.difficulty)
        assertEquals(before.identityType, after.identityType)

        assertEquals(before.gameState.currentYear, after.gameState.currentYear)
        assertEquals(before.gameState.currentMonth, after.gameState.currentMonth)
        assertEquals(before.gameState.turn, after.gameState.turn)
        assertEquals(before.gameState.圣眷, after.gameState.圣眷, 1e-6)
        assertEquals(before.gameState.国势, after.gameState.国势, 1e-6)

        assertEquals(before.character.age, after.character.age, 1e-6)
        assertEquals(before.character.rank, after.character.rank)
        assertEquals(before.character.attributes, after.character.attributes)
        assertEquals(before.character.hidden, after.character.hidden)
        assertEquals(before.character.flags, after.character.flags)
        assertEquals(before.character.flagTurns, after.character.flagTurns)

        assertEquals(before.meritBonus, after.meritBonus, 1e-6)
        assertEquals(before.meritScore, after.meritScore, 1e-6)
        assertEquals(before.previousMeritScore, after.previousMeritScore, 1e-6)
        assertEquals(before.eventHistory, after.eventHistory)
    }

    @Test fun `存档可由引擎恢复并续上同一状态`() {
        val engine = GameEngine(TestFixture.data, seed = 7L)
        engine.newGame("续档", "军户", "举人", "hard")
        engine.advanceMonth()
        val save = engine.toSaveData()

        val restored = GameEngine(TestFixture.data, seed = 7L)
        restored.restore(save)

        assertEquals(save.gameState.turn, restored.state.court.turn)
        assertEquals(save.character.flags, restored.state.character.flags)
        assertEquals(save.character.attributes, restored.state.character.attributes)
        assertEquals(save.currentEventId, restored.currentEvent?.id)
        assertEquals(save.eventHistory, restored.state.seenEventIds)
    }
}
