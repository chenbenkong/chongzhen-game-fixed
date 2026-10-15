import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCurrentAchievementData,
  getReachedEndings,
  loadAchievements,
  recordEndingReached,
  saveAchievements,
  setAchievementData,
  unlockAchievement,
  checkAndUnlockAchievements,
  ALL_ACHIEVEMENTS
} from '../../src/types/achievement'
import { makeAchievementContext } from './helpers/gameEngine'

/**
 * K-6：成就数据是模块级共享状态，读写必须收口。
 *
 * 完整重构（把成就数据并入 SaveData、去掉模块级变量）代价偏大、收益偏投机，
 * 因此这一步先解决其中**可落地且有实际风险**的一部分：引用别名。
 *
 * 原来 `setAchievementData` 直接按引用保存调用方的对象、`loadAchievements` 也按引用
 * 返回内部对象 —— 任何调用方的一次就地修改都会污染全局成就状态，而且不会有任何报错。
 * 现在读写边界上都做防御性拷贝，并用下面这些用例把契约钉住。
 */

const EMPTY = { unlocked: [], unlockTimes: {} }

beforeEach(() => {
  setAchievementData(EMPTY)
})

describe('K-6：成就存储的读写边界', () => {
  it('setAchievementData 之后修改调用方传入的对象，不应影响内部状态', () => {
    const mine = { unlocked: ['first_official'], unlockTimes: { first_official: 't1' } }
    setAchievementData(mine)

    // 调用方随后就地修改自己的对象
    mine.unlocked.push('collector')
    mine.unlockTimes.first_official = '被改掉了'

    const stored = loadAchievements()
    expect(stored.unlocked).toEqual(['first_official'])
    expect(stored.unlockTimes.first_official).toBe('t1')
  })

  it('loadAchievements 返回的是副本，改它不应影响内部状态', () => {
    setAchievementData({ unlocked: ['first_official'], unlockTimes: { first_official: 't1' } })

    const got = loadAchievements()
    got.unlocked.push('伪造的成就')
    got.unlockTimes['伪造的成就'] = 'now'

    expect(loadAchievements().unlocked).toEqual(['first_official'])
    expect(getCurrentAchievementData().unlocked).toEqual(['first_official'])
  })

  it('saveAchievements 也存副本', () => {
    const mine = { unlocked: ['a'], unlockTimes: { a: 't' } }
    saveAchievements(mine)
    mine.unlocked.push('b')
    expect(loadAchievements().unlocked).toEqual(['a'])
  })

  it('unlockAchievement 是幂等的，且拒绝未知 id', () => {
    setAchievementData(EMPTY)

    expect(unlockAchievement('这个成就不存在')).toBeNull()
    expect(loadAchievements().unlocked).toEqual([])

    const first = unlockAchievement('first_official')
    expect(first?.id).toBe('first_official')
    expect(loadAchievements().unlocked).toEqual(['first_official'])

    // 再解一次应返回 null，且不产生重复条目
    expect(unlockAchievement('first_official')).toBeNull()
    expect(loadAchievements().unlocked).toEqual(['first_official'])
  })

  it('checkAndUnlockAchievements 对已解锁的成就不重复返回', () => {
    setAchievementData(EMPTY)

    const ctx = makeAchievementContext({ characterRank: '正七品·知县' })
    const firstRun = checkAndUnlockAchievements(ctx).map(a => a.id)
    const secondRun = checkAndUnlockAchievements(ctx).map(a => a.id)

    // 第二次不应再解锁任何东西
    expect(secondRun).toEqual([])
    // 且首次的解锁确实落进了存储
    for (const id of firstRun) {
      expect(loadAchievements().unlocked).toContain(id)
    }
  })

  it('每个成就 id 唯一（重复 id 会让收集链计数失真）', () => {
    const ids = ALL_ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * 第十三轮新增的 `reachedEndings`（结局图鉴的第二个数据源：本存档达成过的结局格子）。
   * 它和 unlocked / unlockTimes 走同一个收口，所以同样要过"边界拷贝"这一关。
   */
  it('reachedEndings 在边界上同样拷贝，且不被 retired 名单当成成就 id 清掉', () => {
    const reached: Record<string, string> = { ending_demotion: 't1' }
    const mine = { unlocked: [], unlockTimes: {}, reachedEndings: reached }
    setAchievementData(mine)

    reached.ending_demotion = '被改掉了'
    reached['伪造的'] = 'now'

    expect(getReachedEndings()).toEqual({ ending_demotion: 't1' })

    // 与成就 id 不同：已退役的成就 id 会被清掉，达成记录不会（存的本来就是格子 id）
    setAchievementData({ unlocked: ['saver'], unlockTimes: {}, reachedEndings: { saver: 't' } })
    expect(loadAchievements().unlocked).toEqual([])
    expect(getReachedEndings()).toEqual({ saver: 't' })
  })

  it('老存档没有 reachedEndings 字段时按空处理，已点亮的结局成就不倒退', () => {
    setAchievementData({ unlocked: ['ending_bankrupt_done'], unlockTimes: { ending_bankrupt_done: 't' } })

    expect(getReachedEndings()).toEqual({})
    expect(loadAchievements().reachedEndings).toBeUndefined()

    recordEndingReached('triggerable_bankrupt')
    expect(getReachedEndings()).toEqual({ triggerable_bankrupt: expect.any(String) })
    // 写记录不应碰到成就表
    expect(loadAchievements().unlocked).toEqual(['ending_bankrupt_done'])
  })

  it('recordEndingReached 只记首次，空名字直接忽略', () => {
    setAchievementData({ unlocked: [], unlockTimes: {}, reachedEndings: { triggerable_eunuch: '很久以前' } })

    recordEndingReached('triggerable_eunuch')
    recordEndingReached('')
    recordEndingReached('triggerable_emperor_hate')

    const reached = getReachedEndings()
    expect(reached.triggerable_eunuch).toBe('很久以前')
    expect(Object.keys(reached).sort()).toEqual(['triggerable_emperor_hate', 'triggerable_eunuch'])
  })
})
