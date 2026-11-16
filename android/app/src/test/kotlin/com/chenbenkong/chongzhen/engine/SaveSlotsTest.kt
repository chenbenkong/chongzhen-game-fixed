package com.chenbenkong.chongzhen.engine

import com.chenbenkong.chongzhen.TestFixture
import com.chenbenkong.chongzhen.engine.save.SaveSerializer
import com.chenbenkong.chongzhen.engine.save.SaveSlots
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

// ============================================================================
// 多槽位存档 round-trip：1 自动槽 + 3 手动槽，同目录不同文件名；
// 逐槽读回，关键字段逐项相等。
// ============================================================================
class SaveSlotsTest {

    private val data = TestFixture.data

    @Test fun `四个槽位写入后逐槽读回字段相等`() {
        val engine = GameEngine(data, seed = 21L)
        engine.newGame("槽位测试", "缙绅", "进士", "normal")
        engine.chooseChoice(engine.currentEvent!!.choices.first().id)

        val dir = Files.createTempDirectory("chongzhen-save-test")
        try {
            SaveSlots.all.forEach { slot ->
                val target = dir.resolve(SaveSlots.fileName(slot))
                assertTrue(SaveSerializer.writeAtomic(target, engine.toSaveData()))
            }

            SaveSlots.all.forEach { slot ->
                val target = dir.resolve(SaveSlots.fileName(slot))
                val loaded = SaveSerializer.read(target)
                assertNotNull("槽位 $slot 应能读回", loaded)
                assertEquals("槽位 $slot 姓名相等", "槽位测试", loaded!!.playerName)
                assertEquals("槽位 $slot 出身相等", "缙绅", loaded.origin)
                assertEquals("槽位 $slot 回合相等", engine.state.court.turn, loaded.gameState.turn)
                assertEquals("槽位 $slot 属性相等", engine.state.character.attributes, loaded.character.attributes)
                assertEquals("槽位 $slot flags 相等", engine.state.character.flags, loaded.character.flags)
                assertEquals("槽位 $slot 履历条数相等", engine.state.character.history.size, loaded.character.history.size)
            }
        } finally {
            dir.toFile().deleteRecursively()
        }
    }
}
