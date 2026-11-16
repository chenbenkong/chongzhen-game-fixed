package com.chenbenkong.chongzhen

import com.chenbenkong.chongzhen.data.GameData
import com.chenbenkong.chongzhen.data.GameDataRepository
import com.chenbenkong.chongzhen.engine.conditions.ConditionContext
import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import java.io.File

// ============================================================================
// 单测共享夹具：从 assets/game-data.json 一次性加载真实数据（不臆造 schema）。
// 单元测试工作目录为 app 模块目录；向上逐级查找 assets 路径兜底。
// ============================================================================
object TestFixture {

    val data: GameData by lazy {
        val file = locateAsset()
        GameDataRepository.parse(file.readText(Charsets.UTF_8))
    }

    private fun locateAsset(): File {
        var dir = File(".").absoluteFile
        repeat(8) {
            listOf("app/src/main/assets/game-data.json", "src/main/assets/game-data.json")
                .map { File(dir, it) }
                .firstOrNull { it.exists() }
                ?.let { return it }
            dir = dir.parentFile ?: error("game-data.json 未找到")
        }
        error("game-data.json 未找到")
    }

    /** 构造一个默认角色 / 朝堂状态，测试内按需覆写。 */
    fun defaultCharacter(
        age: Double = 22.0,
        origin: String = "寒门",
        rank: String = "正七品·知县",
        degree: String = "进士",
        attributes: Map<String, Double> = emptyMap(),
        hidden: Map<String, Double> = emptyMap(),
        flags: List<String> = emptyList(),
        flagTurns: Map<String, Int> = emptyMap()
    ): CharacterState = CharacterState(
        name = "测试",
        age = age,
        origin = origin,
        rank = rank,
        degree = degree,
        attributes = mutableMapOf(
            "文韬" to 50.0, "理政" to 50.0, "武略" to 50.0, "体质" to 50.0, "财帛" to 50.0
        ).apply { putAll(attributes) },
        hidden = mutableMapOf("道德值" to 50.0, "欲望值" to 50.0, "野心值" to 50.0).apply { putAll(hidden) },
        flags = flags.toMutableList(),
        flagTurns = flagTurns.toMutableMap()
    )

    fun defaultCourt(
        year: Int = 1628,
        month: Int = 1,
        turn: Int = 0,
        圣眷: Double = 50.0,
        中官: Double = 50.0,
        清议: Double = 50.0,
        士绅: Double = 50.0,
        民望: Double = 50.0,
        国势: Double = 75.0
    ): GameStateValues = GameStateValues(
        currentYear = year, currentMonth = month, turn = turn,
        圣眷 = 圣眷, 中官 = 中官, 清议 = 清议, 士绅 = 士绅, 民望 = 民望, 国势 = 国势
    )

    fun ctx(court: GameStateValues, character: CharacterState): ConditionContext =
        ConditionContext.from(court, character)
}
