package com.chenbenkong.chongzhen.engine.save

// ============================================================================
// 存档槽位登记：1 个自动槽 + 3 个手动槽，同目录不同文件名。
// 撤销悔棋栈不持久化：读档后清空（见 GameEngine.restore）。
// ============================================================================

object SaveSlots {
    const val AUTO = "auto"
    const val MANUAL_1 = "manual1"
    const val MANUAL_2 = "manual2"
    const val MANUAL_3 = "manual3"

    /** 全部槽位 id（顺序即 UI 展示顺序）。 */
    val all: List<String> = listOf(AUTO, MANUAL_1, MANUAL_2, MANUAL_3)

    /** 槽位对应的私有目录文件名。 */
    fun fileName(slot: String): String = "save-$slot.json"
}
