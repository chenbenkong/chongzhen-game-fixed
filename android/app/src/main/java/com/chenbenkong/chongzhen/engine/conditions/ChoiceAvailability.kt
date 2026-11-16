package com.chenbenkong.chongzhen.engine.conditions

// ============================================================================
// 选项可用性结构化结果：供 UI 渲染「为什么点不了 / 差多少 / 能不能勉力一试」。
// 与 Web choiceRequirements.ts 的 ChoiceCheckResult 同口径；布尔可用性由
// [available] 给出，其余字段只在锁定时填充。
// ============================================================================

/**
 * @param available 是否可点
 * @param reasonCode 锁定原因机读码（可用时为 [CODE_OK]）
 * @param reasonText 中文可读原因，直接给 UI 展示
 * @param conditionType 条件大类：stamina / attribute / gameState / hidden / flag / origin / rank / random
 * @param conditionKey 条件命中的具体键（如 文韬 / 圣眷 / 票名）
 * @param difficulty 投骰难度 1..6；出身 / 官阶 / 经历类不可勉力一试，为 null
 * @param gap 还差多少（数值门）；不可量化时为 null
 */
data class ChoiceAvailability(
    val available: Boolean,
    val reasonCode: String,
    val reasonText: String,
    val conditionType: String? = null,
    val conditionKey: String? = null,
    val difficulty: Int? = null,
    val gap: Double? = null
) {
    companion object {
        const val CODE_OK = "ok"
        const val CODE_STAMINA_INSUFFICIENT = "stamina_insufficient"
        const val CODE_ATTR_INSUFFICIENT = "attr_insufficient"
        const val CODE_ATTR_EXCESSIVE = "attr_excessive"
        const val CODE_STATE_INSUFFICIENT = "state_insufficient"
        const val CODE_STATE_EXCESSIVE = "state_excessive"
        const val CODE_HIDDEN_INSUFFICIENT = "hidden_insufficient"
        const val CODE_HIDDEN_EXCESSIVE = "hidden_excessive"
        const val CODE_FLAG_MISSING = "flag_missing"
        const val CODE_FLAG_FORBIDDEN = "flag_forbidden"
        const val CODE_FLAG_TOO_NEW = "flag_too_new"
        const val CODE_ORIGIN_DENIED = "origin_denied"
        const val CODE_RANK_DENIED = "rank_denied"
        const val CODE_RANDOM_ROLL = "random_roll"

        fun ok() = ChoiceAvailability(true, CODE_OK, "")
    }
}
