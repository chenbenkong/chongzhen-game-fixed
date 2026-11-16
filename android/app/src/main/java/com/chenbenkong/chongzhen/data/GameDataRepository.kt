package com.chenbenkong.chongzhen.data

import kotlinx.serialization.json.Json

// ============================================================================
// 数据仓库：game-data.json 只在启动时解析一次并缓存，引擎每次发牌 / 判定直接读内存。
// 不允许在发牌热路径上重复 parse 3.9MB 的 JSON。
// ============================================================================
object GameDataRepository {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    @Volatile
    private var cached: GameData? = null

    /** 解析原始 JSON 文本（不缓存），供 Application 启动时与单测直接调用。 */
    fun parse(jsonText: String): GameData = json.decodeFromString(GameData.serializer(), jsonText)

    /** 注册解析结果；后续 [get] 直接命中缓存。 */
    fun prime(data: GameData) {
        cached = data
    }

    fun isLoaded(): Boolean = cached != null

    fun get(): GameData = cached ?: error("GameData 尚未初始化：请先在 Application 启动时 prime(...)")

    /** 测试专用：清空缓存。 */
    fun reset() {
        cached = null
    }
}
