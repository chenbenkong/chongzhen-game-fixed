import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadAchievements,
  setAchievementData,
  saveAchievements,
  getAllAchievements,
  unlockAchievement,
  RETIRED_ACHIEVEMENT_IDS,
  COLLECTOR_CHAIN_ACHIEVEMENT_IDS,
  ALL_ACHIEVEMENTS
} from '../../src/types/achievement'
import { ENDING_TILE_IDS } from '../../src/data/endingRegistry'

/**
 * 成就数量裁剪 + 已删除 id 的存档迁移。
 *
 * 背景：Steam 对单个 App 的成就数量有上限（100），而本项目原本定义了 110 个，
 * 且 desktop/steam.cjs 的映射表只登记了 105 个 —— 缺的 5 个永远不会同步到 Steam。
 * 为此删掉了 10 个成就（详见 achievement.ts 里 RETIRED_ACHIEVEMENT_IDS 的注释），
 * 把游戏内与 Steam 映射表都对齐到 100。
 *
 * 删掉成就会带来一个容易漏掉的问题：**老存档里仍然留着这些 id**。
 * 如果不清理，"已解锁 N 个"的计数会虚高，而 collector(30) 与 legendary_master(全部)
 * 的判据都依赖这个计数 —— 玩家会莫名提前拿到"成就收藏家"，甚至白拿"传奇大师"。
 * 所以这里既钉住数量，也钉住迁移行为。
 *
 * 第五十二轮改了"数量"这一半的口径：本作暂不上 Steam，于是把 45 格结局一次补齐
 * （10 条边界结局成就 + 革职拆支 1 条），总数 100 → 111。
 * 上限从"倒推裁剪的理由"降级成"上线前的待办"，见 desktop/steam.cjs 头部。
 */
describe('成就数量与 Steam 上限', () => {
  it('成就总数是数过的 111 条（第五十二轮补齐 45 格结局成就之后）', () => {
    // 这条不是"凑数上限"，而是**增删必须是有意识地**：改了这里，
    // desktop/steam.cjs 的映射表与 INTERNAL_ACHIEVEMENT_COUNT 必须同步改，
    // 否则 `node desktop/smoke-test.cjs`（CI 里跑）会逐条对拍失败。
    expect(ALL_ACHIEVEMENTS).toHaveLength(111)
  })

  it('45 格结局都有 `ending_*_done` 成就，可收集数够得着最高档', () => {
    const doneIds = ALL_ACHIEVEMENTS
      .filter(a => a.id.startsWith('ending_') && a.id.endsWith('_done'))
      .map(a => a.id)
    // 34 条叙事/内联结局 + 10 条边界结局 + 革职拆出来的流放 = 45
    expect(doneIds).toHaveLength(ENDING_TILE_IDS.length)
    expect(doneIds).toHaveLength(45)
  })

  it('成就 id 无重复', () => {
    const ids = ALL_ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('已删除的 id 不再出现在成就定义里', () => {
    const ids = new Set(ALL_ACHIEVEMENTS.map(a => a.id))
    for (const retired of RETIRED_ACHIEVEMENT_IDS) {
      expect(ids.has(retired), `${retired} 应已从定义中删除`).toBe(false)
    }
  })

  it('收集链 id 全部仍在定义里（否则判据会指向不存在的成就）', () => {
    const ids = new Set(ALL_ACHIEVEMENTS.map(a => a.id))
    for (const id of COLLECTOR_CHAIN_ACHIEVEMENT_IDS) {
      expect(ids.has(id), `${id} 应仍在定义里`).toBe(true)
    }
  })
})

describe('已删除成就的存档迁移', () => {
  beforeEach(() => {
    setAchievementData({ unlocked: [], unlockTimes: {} })
  })

  it('写入含已删除 id 的旧数据后，读回时自动剔除', () => {
    // 模拟一个"删除之前"的老存档
    setAchievementData({
      unlocked: ['first_official', 'wealthy', 'master_collector', 'first_choice', 'saver'],
      unlockTimes: {
        first_official: '2026-01-01T00:00:00.000Z',
        wealthy: '2026-01-02T00:00:00.000Z',
        master_collector: '2026-01-03T00:00:00.000Z',
        first_choice: '2026-01-04T00:00:00.000Z',
        saver: '2026-01-05T00:00:00.000Z'
      }
    })

    const data = loadAchievements()
    // 只剩下仍然存在的 first_official
    expect(data.unlocked).toEqual(['first_official'])
    expect(data.unlockTimes).toEqual({
      first_official: '2026-01-01T00:00:00.000Z'
    })
  })

  it('迁移后成就面板不会渲染出幽灵条目', () => {
    setAchievementData({
      unlocked: ['wealthy', 'scholar', 'popular'],
      unlockTimes: { wealthy: '2026-01-01T00:00:00.000Z' }
    })

    const all = getAllAchievements()
    const ids = all.map(a => a.id)
    for (const retired of RETIRED_ACHIEVEMENT_IDS) {
      expect(ids).not.toContain(retired)
    }
  })

  it('迁移不会影响正常解锁流程', () => {
    // 剔除逻辑在 cloneAchievementData 上，不能误伤新解锁的成就
    unlockAchievement('first_official')
    unlockAchievement('never_demoted')
    const data = loadAchievements()
    expect(data.unlocked).toContain('first_official')
    expect(data.unlocked).toContain('never_demoted')
  })

  it('saveAchievements 同样会剔除（防止内存态被重新污染）', () => {
    saveAchievements({
      unlocked: ['saver', 'first_official'],
      unlockTimes: { saver: '2026-01-01T00:00:00.000Z' }
    })
    const data = loadAchievements()
    expect(data.unlocked).toEqual(['first_official'])
  })
})