package com.chenbenkong.chongzhen.ui

// ============================================================================
// 结局图鉴跨局持久化接口。引擎未提供成就 / 图鉴存储，UI 层自行记录已达成结局 id；
// 测试用内存实现，正式端用 SharedPreferences 实现。
// ============================================================================
interface CodexStore {
    /** 已解锁结局 id 集合（只读快照）。 */
    fun unlocked(): Set<String>

    /** 登记一个已达成结局 id。 */
    fun unlock(id: String)
}

/** 测试 / 兜底用内存实现。 */
class InMemoryCodexStore : CodexStore {
    private val set = mutableSetOf<String>()
    override fun unlocked(): Set<String> = set.toSet()
    override fun unlock(id: String) { set.add(id) }
}
