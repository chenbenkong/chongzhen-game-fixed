package com.chenbenkong.chongzhen.engine.conditions

import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues

/**
 * 条件求值上下文：把一局状态裁成求值器需要的只读视图。
 * 取值口径与 Web BoundaryEventCheckParams / checkEventConditions 一致：
 * 缺键视为 null，按对应分支的容错规则处理。
 */
data class ConditionContext(
    val year: Int,
    val month: Int,
    val turn: Int,
    val age: Double,
    val rank: String,
    val origin: String,
    val attributes: Map<String, Double>,
    val hidden: Map<String, Double>,
    val gameState: Map<String, Double>,
    val factionDonglin: Double,
    val factionEunuch: Double,
    val factionAlignment: String,
    val factionStrife: Double,
    val flags: List<String>,
    val flagTurns: Map<String, Int>
) {
    companion object {
        fun from(court: GameStateValues, character: CharacterState): ConditionContext =
            ConditionContext(
                year = court.currentYear,
                month = court.currentMonth,
                turn = court.turn,
                age = character.age,
                rank = character.rank,
                origin = character.origin,
                attributes = character.attributes,
                hidden = character.hidden,
                gameState = mapOf(
                    "圣眷" to court.圣眷,
                    "中官" to court.中官,
                    "清议" to court.清议,
                    "士绅" to court.士绅,
                    "民望" to court.民望,
                    "国势" to court.国势
                ),
                factionDonglin = character.faction.东林好感,
                factionEunuch = character.faction.阉党好感,
                factionAlignment = character.faction.立场,
                factionStrife = character.faction.党争烈度,
                flags = character.flags,
                flagTurns = character.flagTurns
            )
    }
}
