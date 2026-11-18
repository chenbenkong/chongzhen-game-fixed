package com.chenbenkong.chongzhen.ui

import kotlin.math.roundToInt

/**
 * Android 端常驻风险条的纯计算模型。
 *
 * 与 Web `src/utils/routeTrail.ts` 的 `collectDangers` 同口径：
 * - 财帛/体质预警线 20，其余六维 15；
 * - 值 <= 0 且身上有 `归零警告·X` => `cliff`（已在崖边，再归零收局）；
 * - 值 <= 0 但还没有警告票 => `zero`（下一次归零先开警告卡）；
 * - 其余进入预警区 => `near`（将尽）。
 *
 * 这层不读 UI，不依赖 Compose，单测可以直接钉排序、整数显示与档位。
 */
data class RiskItem(
    val key: String,
    val value: Int,
    val level: RiskLevel,
    val label: String,
    val endingTitle: String
)

enum class RiskLevel(val css: String) {
    Cliff("cliff"),
    Zero("zero"),
    Near("near")
}

private data class RiskSpec(
    val key: String,
    val group: RiskGroup,
    val warnAt: Int,
    val endingTitle: String
)

private enum class RiskGroup { Attributes, Hidden, Court }

private val RISK_SPECS = listOf(
    RiskSpec("财帛", RiskGroup.Attributes, 20, "倾家荡产"),
    RiskSpec("体质", RiskGroup.Attributes, 20, "病逝任上"),
    RiskSpec("圣眷", RiskGroup.Court, 15, "龙颜震怒"),
    RiskSpec("中官", RiskGroup.Court, 15, "宦官构陷"),
    RiskSpec("清议", RiskGroup.Court, 15, "士林唾弃"),
    RiskSpec("士绅", RiskGroup.Court, 15, "乡绅反目"),
    RiskSpec("民望", RiskGroup.Court, 15, "民怨沸腾"),
    RiskSpec("道德值", RiskGroup.Hidden, 15, "众叛亲离")
)

private data class Candidate(
    val order: Int,
    val spec: RiskSpec,
    val raw: Double,
    val item: RiskItem
)

private fun valueOf(
    spec: RiskSpec,
    attributes: Map<String, Double>,
    hidden: Map<String, Double>,
    court: Map<String, Double>
): Double = when (spec.group) {
    RiskGroup.Attributes -> attributes[spec.key] ?: 0.0
    RiskGroup.Hidden -> hidden[spec.key] ?: 0.0
    RiskGroup.Court -> court[spec.key] ?: 0.0
}

/**
 * 取最危险的三维，主 HUD 再截前两条。排序按真实值升序，同值时按
 * `RISK_SPECS` 顺序，避免“两个 0 谁先显示”随 Map 遍历顺序抖动。
 */
fun collectRiskItems(
    attributes: Map<String, Double>,
    hidden: Map<String, Double>,
    court: Map<String, Double>,
    flags: List<String>
): List<RiskItem> {
    val held = flags.toSet()
    return RISK_SPECS.mapIndexed { order, spec ->
        val raw = valueOf(spec, attributes, hidden, court)
        val warned = held.contains("归零警告·${spec.key}")
        val level = when {
            raw <= 0.0 && warned -> RiskLevel.Cliff
            raw <= 0.0 -> RiskLevel.Zero
            else -> RiskLevel.Near
        }
        Candidate(
            order = order,
            spec = spec,
            raw = raw,
            item = RiskItem(
                key = spec.key,
                value = raw.roundToInt(),
                level = level,
                label = when (level) {
                    RiskLevel.Cliff -> "已在崖边"
                    RiskLevel.Zero -> "归零·尚有警告"
                    RiskLevel.Near -> "将尽"
                },
                endingTitle = spec.endingTitle
            )
        )
    }
        .filter { it.raw <= it.spec.warnAt.toDouble() }
        .sortedWith(compareBy({ it.raw }, { it.order }))
        .take(3)
        .map { it.item }
}
