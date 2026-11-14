import { describe, expect, it, beforeEach } from 'vitest'
import {
  AUTOSAVE_KEY,
  saveAutosaveDetailed,
  loadAutosave,
  deleteAutosave,
  type SaveData
} from '../../src/types/save'
import { resetAutosaveSeqGuardForTest } from '../../src/types/save'

/**
 * 多标签页互相覆盖（缺陷 3）的钉子。
 *
 * 原状：两个 tab 玩同一局，后落盘的直接把前者覆盖，
 * 被覆盖那一边这一整月的抉择与属性变化静默归零，两边屏幕上都显示"存档正常"。
 * 现在：写入前比对全局序号，落后的一方拒绝覆盖并回报原因。
 */

function makeSave(turn: number, 圣眷: number): SaveData {
  return {
    character: {
      name: '甲', courtesyName: '字', hometown: '苏州', age: 30, origin: '寒门',
      rank: '正七品·知县', degree: '进士',
      attributes: { 财帛: 40, 文韬: 40, 理政: 40, 武略: 40, 体质: 40 },
      hidden: { 道德值: 50, 欲望值: 50, 野心值: 50 },
      flags: [], flagTurns: {}, history: [], wives: [], lovers: [], examHistory: [],
      promotionCount: 0, demotionCount: 0
    },
    gameState: {
      currentYear: 1630, currentMonth: 3, turn,
      圣眷, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 60
    },
    eventHistory: [], currentEvent: null, currentEventId: null, pendingEvents: [],
    origin: '寒门', degree: '进士', playerName: '甲', identityType: 'official',
    lifeRecords: [], savedAt: new Date().toISOString(), playTime: 0,
    achievements: { unlocked: [], unlockTimes: {} }, difficulty: 'normal', meritBonus: 0
  } as unknown as SaveData
}

/** 模拟"另一个标签页"：直接按同一套约定写盘并推进序号 */
function otherTabWrites(turn: number, 圣眷: number): void {
  const seq = Number(localStorage.getItem('chongzhen_autosave_seq') || '0')
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(makeSave(turn, 圣眷)))
  localStorage.setItem('chongzhen_autosave_seq', String(seq + 1))
}

describe('自动存档的跨标签页守卫', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAutosaveSeqGuardForTest()
  })

  it('单标签页连续写入：一切照常，序号递增', () => {
    expect(saveAutosaveDetailed(makeSave(1, 50)).ok).toBe(true)
    expect(saveAutosaveDetailed(makeSave(2, 55)).ok).toBe(true)
    expect(Number(localStorage.getItem('chongzhen_autosave_seq'))).toBe(2)
  })

  it('另一个标签页写过之后，本页再写会被判为落后并拒绝覆盖', () => {
    saveAutosaveDetailed(makeSave(8, 36))     // 本页先写
    otherTabWrites(5, 58)                     // B 页写了

    const r = saveAutosaveDetailed(makeSave(9, 48))
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('stale')

    // 关键：B 的存档没有被 A 覆盖掉
    const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}')
    expect(saved.gameState.圣眷).toBe(58)
  })

  it('本页读档 = 接管这一局，此后写入不再被误判为落后', () => {
    otherTabWrites(5, 58)
    expect(loadAutosave()).toBeTruthy()       // 读档建立基线

    const r = saveAutosaveDetailed(makeSave(6, 60))
    expect(r.ok).toBe(true)
  })

  it('deleteAutosave 之后守卫归零，新游戏第一次写入不会被误判', () => {
    saveAutosaveDetailed(makeSave(1, 50))
    deleteAutosave()
    expect(saveAutosaveDetailed(makeSave(1, 50)).ok).toBe(true)
  })

  it('空存档首次写入不算落后（lastWrittenSeq 尚未建立）', () => {
    otherTabWrites(3, 40)
    expect(saveAutosaveDetailed(makeSave(1, 50)).ok).toBe(true)
  })
})
