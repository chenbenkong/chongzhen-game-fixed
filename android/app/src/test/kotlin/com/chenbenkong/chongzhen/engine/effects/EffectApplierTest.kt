package com.chenbenkong.chongzhen.engine.effects

import com.chenbenkong.chongzhen.data.EventEffects
import com.chenbenkong.chongzhen.data.FlagsEffect
import com.chenbenkong.chongzhen.TestFixture
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// ============================================================================
// 效果结算单测：属性上下限裁剪、隐藏属性裁剪、flags 增删与 flagTurns 连带、
// 潜逃票正面圣眷封锁。
// ============================================================================
class EffectApplierTest {

    @Test fun `属性正向超上限裁剪到 100`() {
        val char = TestFixture.defaultCharacter(attributes = mapOf("体质" to 90.0))
        val court = TestFixture.defaultCourt()
        EffectApplier.apply(
            EventEffects(attributes = mapOf("体质" to 20.0)),
            char, court, 0, 1.0, "潜逃"
        )
        assertEquals(100.0, char.attributes["体质"]!!, 1e-6)
    }

    @Test fun `属性负向跌破下限裁剪到 0`() {
        val char = TestFixture.defaultCharacter(attributes = mapOf("财帛" to 5.0))
        val court = TestFixture.defaultCourt()
        EffectApplier.apply(
            EventEffects(attributes = mapOf("财帛" to -20.0)),
            char, court, 0, 1.0, "潜逃"
        )
        assertEquals(0.0, char.attributes["财帛"]!!, 1e-6)
    }

    @Test fun `隐藏属性裁剪到 0 到 100，未知键忽略`() {
        val char = TestFixture.defaultCharacter(hidden = mapOf("道德值" to 90.0))
        val court = TestFixture.defaultCourt()
        EffectApplier.apply(
            EventEffects(hidden = mapOf("道德值" to 30.0, "不存在的键" to 50.0)),
            char, court, 0, 1.0, "潜逃"
        )
        assertEquals(100.0, char.hidden["道德值"]!!, 1e-6)
        assertFalse(char.hidden.containsKey("不存在的键"))
    }

    @Test fun `flags 增票去重并记 flagTurns，退票连带删记录`() {
        val char = TestFixture.defaultCharacter(flags = listOf("旧票"))
        val court = TestFixture.defaultCourt()
        val applied = EffectApplier.apply(
            EventEffects(flags = FlagsEffect(add = listOf("新票", "新票"), remove = listOf("旧票"))),
            char, court, 7, 1.0, "潜逃"
        )
        assertTrue(char.flags.contains("新票"))
        assertFalse(char.flags.contains("旧票"))
        assertEquals(7, char.flagTurns["新票"])
        assertFalse(char.flagTurns.containsKey("旧票"))
        assertEquals(listOf("新票"), applied.addedFlags)
        assertEquals(listOf("旧票"), applied.removedFlags)
    }

    @Test fun `持潜逃票时正面圣眷不涨，负面仍落账`() {
        val char = TestFixture.defaultCharacter(flags = listOf("潜逃"))
        val court = TestFixture.defaultCourt(圣眷 = 50.0)
        EffectApplier.apply(
            EventEffects(gameState = mapOf("圣眷" to 20.0)),
            char, court, 0, 1.0, "潜逃"
        )
        assertEquals(50.0, court.圣眷, 1e-6)

        val char2 = TestFixture.defaultCharacter(flags = listOf("潜逃"))
        val court2 = TestFixture.defaultCourt(圣眷 = 50.0)
        EffectApplier.apply(
            EventEffects(gameState = mapOf("圣眷" to -20.0)),
            char2, court2, 0, 1.0, "潜逃"
        )
        assertEquals(30.0, court2.圣眷, 1e-6)
    }
}
