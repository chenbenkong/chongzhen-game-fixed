package com.chenbenkong.chongzhen.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RiskHudModelTest {

    private val safeAttributes = mapOf("财帛" to 80.0, "体质" to 80.0)
    private val safeHidden = mapOf("道德值" to 80.0)
    private val safeCourt = mapOf(
        "圣眷" to 80.0, "中官" to 80.0, "清议" to 80.0,
        "士绅" to 80.0, "民望" to 80.0
    )

    @Test
    fun `全维安全时不占版面`() {
        assertTrue(collectRiskItems(safeAttributes, safeHidden, safeCourt, emptyList()).isEmpty())
    }

    @Test
    fun `归零无警告与归零有警告是两档`() {
        val items = collectRiskItems(
            safeAttributes + ("财帛" to 0.0),
            safeHidden + ("道德值" to 0.0),
            safeCourt,
            listOf("归零警告·财帛")
        )

        assertEquals(2, items.size)
        assertEquals("财帛", items[0].key)
        assertEquals(RiskLevel.Cliff, items[0].level)
        assertEquals("已在崖边", items[0].label)
        assertEquals("倾家荡产", items[0].endingTitle)

        assertEquals("道德值", items[1].key)
        assertEquals(RiskLevel.Zero, items[1].level)
        assertEquals("归零·尚有警告", items[1].label)
        assertEquals("众叛亲离", items[1].endingTitle)
    }

    @Test
    fun `显示取整但预警线按真实值判定`() {
        val items = collectRiskItems(
            safeAttributes + ("财帛" to 20.4) + ("体质" to 20.0),
            safeHidden,
            safeCourt,
            emptyList()
        )

        // 20.4 已越过 20 的预警线；20.0 仍在带内。
        assertEquals(listOf("体质"), items.map { it.key })
        assertEquals(20, items[0].value)
    }

    @Test
    fun `小数只影响显示，不把 7_6 显示成 7`() {
        val items = collectRiskItems(
            safeAttributes + ("体质" to 7.6),
            safeHidden,
            safeCourt,
            emptyList()
        )

        assertEquals(1, items.size)
        assertEquals(8, items[0].value)
        assertEquals(RiskLevel.Near, items[0].level)
    }
}
