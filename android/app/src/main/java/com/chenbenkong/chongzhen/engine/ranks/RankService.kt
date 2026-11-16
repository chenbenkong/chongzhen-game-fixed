package com.chenbenkong.chongzhen.engine.ranks

import com.chenbenkong.chongzhen.data.RankConfig
import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import kotlin.math.floor

// ============================================================================
// 官阶 / 政绩分服务。口径对齐 Web useGameEngine.ts：
// - 政绩分 = 基础分 280 + 功名加成 + 属性/态度权重，向下取整；
// - 升迁：按分数档位上升一级，奖励基准分 +20；
// - 贬官：宽限期 12 个月内不判；「潜逃」票持有者不进考功名册；
//   15 条判据取最高 severity；severity≥3 当场革职（exiled），其余按档降级。
// ============================================================================

const val BASE_MERIT_SCORE = 280
const val PROMOTION_SCORE_BONUS = 20
const val DEMOTION_GRACE_TURNS = 12
private val IMPORTANT_EVENT_TYPES = setOf("historical", "ending")

/** 贬官判定结果。 */
data class DemotionResult(
    val demoted: Boolean,
    val newRank: String? = null,
    val message: String? = null,
    val reason: String? = null,
    val newIdentity: String? = null
)

/** 升迁判定结果。 */
data class PromotionResult(
    val promoted: Boolean,
    val newRank: String? = null,
    val message: String? = null,
    val scoreBonus: Double = 0.0
)

object RankService {

    /** 政绩分（与 Web calculateMeritScore 同公式）。 */
    fun calculateMeritScore(
        character: CharacterState,
        court: GameStateValues,
        eventType: String? = null,
        isImportant: Boolean = false
    ): Double {
        var score = BASE_MERIT_SCORE.toDouble()
        when (character.degree) {
            "进士" -> score += 60
            "举人" -> score += 30
        }
        score += ((character.attributes["理政"] ?: 50.0) - 50) * 1.2
        score += ((character.attributes["文韬"] ?: 50.0) - 50) * 0.9
        score += ((character.attributes["武略"] ?: 50.0) - 50) * 0.7
        score += (court.圣眷 - 50) * 0.9
        score += (court.民望 - 50) * 0.8
        if (isImportant || eventType in IMPORTANT_EVENT_TYPES) score += 80
        return floor(score)
    }

    /** 分数对应的官阶升序下标（0 = 最低，越大官越高）。 */
    fun rankIndexForScore(score: Double, ranks: List<RankConfig>): Int {
        var index = 0
        for (i in ranks.indices) {
            if (score >= ranks[i].minScore) index = i
        }
        return index
    }

    /** 升迁判定：档位上升才记一次升迁。 */
    fun checkPromotion(
        currentScore: Double,
        previousScore: Double,
        ranks: List<RankConfig>
    ): PromotionResult {
        val currentIndex = rankIndexForScore(currentScore, ranks)
        val previousIndex = rankIndexForScore(previousScore, ranks)
        if (currentIndex > previousIndex) {
            val newRank = ranks[currentIndex]
            return PromotionResult(
                promoted = true,
                newRank = newRank.name,
                message = "恭喜！你因政绩卓著，被擢升为${newRank.name}！",
                scoreBonus = PROMOTION_SCORE_BONUS.toDouble()
            )
        }
        return PromotionResult(promoted = false)
    }

    /**
     * 贬官判定：15 条判据逐条求值，取最高 severity。
     * @param fugitiveFlag 「潜逃」票名；持有则整台考功机器停摆。
     * @param corruptionWarningFlag 「革职预警·贪墨」票名。
     * @param zeroWarnPrefix 归零警告票前缀。
     */
    fun checkDemotion(
        currentScore: Double,
        previousScore: Double,
        character: CharacterState,
        court: GameStateValues,
        ranks: List<RankConfig>,
        fugitiveFlag: String,
        corruptionWarningFlag: String,
        zeroWarnPrefix: String
    ): DemotionResult {
        if (court.turn < DEMOTION_GRACE_TURNS) return DemotionResult(demoted = false)
        if (character.flags.contains(fugitiveFlag)) return DemotionResult(demoted = false)

        val currentRankBaseScore = ranks.find { it.name == character.rank }?.minScore ?: 500.0

        val reasons = listOf(
            DemotionReason(
                condition = currentScore < currentRankBaseScore,
                reason = "政绩不佳",
                severity = 1,
                message = "政绩分低于${currentRankBaseScore.toInt()}分，不足以胜任${character.rank}，考核不合格"
            ),
            DemotionReason(
                condition = (character.hidden["道德值"] ?: 0.0) <= 0 &&
                    character.flags.contains("${zeroWarnPrefix}道德值"),
                reason = "道德败坏",
                severity = 3,
                message = "道德败坏，丧尽天良，天人共愤"
            ),
            DemotionReason(
                condition = court.圣眷 < 10,
                reason = "帝心尽失",
                severity = 2,
                message = "圣上震怒，龙颜不悦，失宠于上"
            ),
            DemotionReason(
                condition = (character.attributes["理政"] ?: 0.0) < 15,
                reason = "政绩不佳",
                severity = 1,
                message = "政绩平庸，碌碌无为，不堪其任"
            ),
            DemotionReason(
                condition = isCorruptExposed(character) && character.flags.contains(corruptionWarningFlag),
                reason = "贪墨被查",
                severity = 3,
                message = "贪墨受贿，中饱私囊，东窗事发"
            ),
            DemotionReason(
                condition = court.国势 < 25 &&
                    (character.attributes["武略"] ?: 0.0) < 30 &&
                    (character.attributes["理政"] ?: 0.0) < 40,
                reason = "失职渎职",
                severity = 2,
                message = "国势衰微，武备废弛，政务弛懈，失职渎职"
            ),
            DemotionReason(
                condition = (character.attributes["文韬"] ?: 0.0) < 25,
                reason = "才疏学浅",
                severity = 1,
                message = "才疏学浅，文章不通，难堪大任"
            ),
            DemotionReason(
                condition = (character.hidden["野心值"] ?: 0.0) > 70 && court.圣眷 < 40,
                reason = "结党营私",
                severity = 2,
                message = "结党营私，图谋不轨，圣心猜忌"
            ),
            DemotionReason(
                condition = court.士绅 > 75 && court.圣眷 < 25,
                reason = "得罪权贵",
                severity = 2,
                message = "功高震主，树大招风，遭人构陷"
            ),
            DemotionReason(
                condition = (character.attributes["体质"] ?: 0.0) < 15,
                reason = "体弱多病",
                severity = 2,
                message = "体弱多病，难以视事，被责令养病"
            ),
            DemotionReason(
                condition = (character.attributes["财帛"] ?: 0.0) < 15 &&
                    (character.hidden["欲望值"] ?: 0.0) > 60 &&
                    (character.hidden["道德值"] ?: 0.0) < 35,
                reason = "财政亏空",
                severity = 1,
                message = "家资匮乏而贪欲不减，行止不检，被御史参劾"
            ),
            DemotionReason(
                condition = court.圣眷 < 30 && (character.attributes["理政"] ?: 0.0) < 40,
                reason = "办事不力",
                severity = 1,
                message = "办事不力，屡出差错，上峰不满"
            ),
            DemotionReason(
                condition = (character.hidden["道德值"] ?: 0.0) < 0 && court.清议 > 50,
                reason = "清议不容",
                severity = 1,
                message = "清议攻讦，士林非议，被迫请辞"
            ),
            DemotionReason(
                condition = court.民望 < 20 && court.圣眷 < 40,
                reason = "言辞失当",
                severity = 1,
                message = "言辞失当，触怒龙颜，被贬外放"
            ),
            DemotionReason(
                condition = previousScore - currentScore > 80,
                reason = "政绩下滑",
                severity = 1,
                message = "政绩大幅下滑，考核不合格，降级留用"
            )
        )

        val triggered = reasons.filter { it.condition }
        if (triggered.isEmpty()) return DemotionResult(demoted = false)

        val worst = triggered.maxBy { it.severity }
        val previousRankIndex = rankIndexForScore(previousScore, ranks)

        if (worst.severity >= 3) {
            return DemotionResult(
                demoted = true,
                newRank = "革职查办",
                message = "【革职】${worst.message}，你被革职查办，贬为庶民！",
                reason = worst.reason,
                newIdentity = "exiled"
            )
        }

        val newRankIndex = maxOf(0, previousRankIndex - worst.severity)
        val newRank = ranks[newRankIndex]
        val actualRankIndex = ranks.indexOfFirst { it.name == character.rank }
        val isRealDemotion = if (actualRankIndex >= 0) {
            newRankIndex < actualRankIndex
        } else {
            newRankIndex < previousRankIndex
        }

        return if (isRealDemotion) {
            DemotionResult(
                demoted = true,
                newRank = newRank.name,
                message = "【贬官】${worst.message}，你被贬为${newRank.name}！",
                reason = worst.reason,
                newIdentity = "official"
            )
        } else {
            DemotionResult(demoted = false)
        }
    }

    /** 贪墨暴露合取（与 Web isCorruptExposed 同阈值）。 */
    private fun isCorruptExposed(character: CharacterState): Boolean {
        val 财帛 = character.attributes["财帛"] ?: 0.0
        val 欲望值 = character.hidden["欲望值"] ?: 0.0
        val 道德值 = character.hidden["道德值"] ?: 100.0
        return 财帛 > 70 && 欲望值 > 75 && 道德值 < 30
    }

    private data class DemotionReason(
        val condition: Boolean,
        val reason: String,
        val severity: Int,
        val message: String
    )
}
