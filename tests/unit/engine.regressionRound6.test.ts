import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { initialEvents } from '../../src/data/events'
import { factionEvents } from '../../src/data/events/faction/faction_events'
import { wrapBatchAsBoundaryEvents } from '../../src/data/boundaryEventCompiler'
import { BOUNDARY_EVENTS } from '../../src/data/boundaryEvents'
import { origins } from '../../src/data/origins'
import { RANKS } from '../../src/hooks/useGameEngine'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'
import type { EventChoice, GameEvent } from '../../src/types/event'

/**
 * 第六轮回归测试：这一轮的缺陷全部是「代码写了、但整条路径其实没生效」的类型。
 *
 * 共同点是**都不会报错**：
 *  - 量纲不匹配的判定恒真 / 恒假
 *  - 声明的字段从没被读进判定
 *  - 数据文件存在但没注册进事件池
 *  - 结算链路提前 return，把已经算好的新状态整份丢掉
 *  - 同一 tick 内的重入把一个月的推进叠加成两个月
 * 所以静态类型检查、构建、以及原有 71 例用例在修复前全都是绿的。
 * 这一节的任务就是给每一条补一个「修复前必然失败」的断言。
 */

/* ------------------------------------------------------------------ 一 */
/* conditions.random 的量纲                                              */

function eventWithRandom(random: number): GameEvent {
  return {
    id: 'test_random_gate',
    title: '测试概率门',
    description: '',
    conditions: { random },
    type: 'random',
    choices: []
  }
}

describe('缺陷：conditions.random 量纲不一致（数据用百分数，判定用小数）', () => {
  it('写 25 表示 25%：随机数 0.5 不触发、0.1 触发', () => {
    const event = eventWithRandom(25)
    const character = makeCharacter()
    const state = makeGameState()

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(checkEventConditions(event, character, state)).toBe(false)

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    expect(checkEventConditions(event, character, state)).toBe(true)
  })

  it('写 0.25 同样按 25% 判定（历史遗留的小数写法不能反被当成 100%）', () => {
    const event = eventWithRandom(0.25)

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(checkEventConditions(event, makeCharacter(), makeGameState())).toBe(false)

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    expect(checkEventConditions(event, makeCharacter(), makeGameState())).toBe(true)
  })

  it('写 100 表示必定触发', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(checkEventConditions(eventWithRandom(100), makeCharacter(), makeGameState())).toBe(true)
  })
})

/* ------------------------------------------------------------------ 二 */
/* 死内容：chain 主线事件与 faction 党争事件                              */

/**
 * `historical_013_aftermath` 是一个 `type: 'chain'` 事件，条件为
 * 1642–1643 年 / 9–12 月 / flags.any 命中「死守开封」等其一。
 * 改造前 tier-1 只挑 `historical`，chain 事件在候选池里被静默丢掉，
 * 15 个主线后续事件（整条松山—锦州—开封—孙传庭的主线）永远不可能出现。
 */
describe('缺陷：type 为 chain 的主线事件不在任何挑选层级里（15 个事件是死内容）', () => {
  it('候选池里只有 chain 事件时，它仍必须被选中', () => {
    // tier-1 每轮只挑 1 个大事件，所以这里把所有 historical 事件都记为「已触发」，
    // 让候选池里只剩 chain —— 这样断言的才正是「chain 有没有被这一层认出来」。
    const allHistoricalIds = initialEvents.filter(e => e.type === 'historical').map(e => e.id)
    expect(allHistoricalIds.length).toBeGreaterThan(0)

    const save = makeSaveData({
      character: makeCharacter({ flags: ['死守开封'] }),
      gameState: makeGameState({ currentYear: 1641, currentMonth: 11, turn: 160 }),
      eventHistory: allHistoricalIds
    })

    const { result, unmount } = renderGameEngine({ loadSaveData: save })
    act(() => {
      const pool = result.current.findAllEventsForState(
        makeGameState({ currentYear: 1642, currentMonth: 9, turn: 161, 国势: 40 })
      )
      const chains = pool.filter(e => e.type === 'chain')
      expect(chains.length).toBeGreaterThan(0)
      expect(chains.map(e => e.id)).toContain('historical_013_aftermath')
    })
    unmount()
  })
})

describe('缺陷：faction/faction_events.ts 从未被 import 进事件池', () => {
  it('4 个党争事件全部登记进 initialEvents', () => {
    expect(factionEvents.length).toBeGreaterThan(0)
    const registryIds = new Set(initialEvents.map(e => e.id))
    for (const event of factionEvents) {
      expect(registryIds.has(event.id), `党争事件 ${event.id} 未登记进事件池`).toBe(true)
    }
  })
})

/* ------------------------------------------------------------------ 三 */
/* 选项声明的政绩分                                                      */

/** 取当前分数与下一个升迁档位之间的安全增量，确保用例不会顺带触发升迁 */
function headroomToNextRank(score: number): number {
  const next = RANKS.find(r => r.minScore > score)
  const upper = next ? next.minScore - score - 1 : 50
  return Math.min(40, upper)
}

/** 一个 type='normal' 的合成当前事件：它不触发任何事件系数，结算路径与真实事件一致 */
const NORMAL_EVENT: GameEvent = {
  id: 'test_normal_event',
  title: '测试事件',
  description: '',
  conditions: {},
  type: 'normal',
  choices: []
}

describe('缺陷：choice.effects.meritScore 记在 previousMeritScore 上，随即被升迁判定覆写', () => {
  it('选项声明的政绩分真的并入 meritScore', async () => {
    // 用 type='normal' 的事件作当前事件：historical / ending 会另乘 2 倍事件系数，
    // 那样断言的就不是「有没有入账」而是系数了。
    const { result, unmount } = renderGameEngine({
      loadSaveData: makeSaveData({ currentEvent: NORMAL_EVENT, currentEventId: NORMAL_EVENT.id })
    })
    await flush()

    const before = result.current.meritScore
    const bonus = headroomToNextRank(before)
    const choice: EventChoice = {
      id: 'c_merit',
      text: '疏浚漕运',
      effects: { meritScore: bonus }
    }

    await act(async () => {
      result.current.handleChoice(choice)
    })
    await flush(30)

    expect(result.current.meritScore).toBe(before + bonus)
    expect(result.current.promotionMessage).toContain('政绩分变化')
    unmount()
  })

  it('政绩分增量会写进存档，读档后不会凭空缩水', async () => {
    const { result, unmount } = renderGameEngine({
      loadSaveData: makeSaveData({ currentEvent: NORMAL_EVENT, currentEventId: NORMAL_EVENT.id })
    })
    await flush()

    const before = result.current.meritScore
    const bonus = headroomToNextRank(before)
    const choice: EventChoice = {
      id: 'c_merit_save',
      text: '疏浚漕运',
      effects: { meritScore: bonus }
    }

    await act(async () => {
      result.current.handleChoice(choice)
    })
    await flush(30)

    await act(async () => {
      result.current.handleSaveToSlot(1)
    })
    const raw = localStorage.getItem('chongzhen_save_slot_1')
    expect(raw).toBeTruthy()
    const saved = JSON.parse(raw as string)
    expect(saved.meritBonus).toBe(bonus)

    // 用这份存档重开引擎：分数必须仍是「基础分 + 增量」，不能退回基础分
    const { result: reloaded, unmount: unmountReloaded } = renderGameEngine({
      loadSaveData: saved
    })
    await flush()
    expect(reloaded.current.meritScore).toBe(before + bonus)
    unmount()
    unmountReloaded()
  })
})

/* ------------------------------------------------------------------ 四 */
/* 辞官结局的二次确认                                                    */

const RESIGN_EVENT: GameEvent = {
  id: 'test_resign_event',
  title: '暮年之思',
  description: '你望着案头的印信，忽然倦了。',
  conditions: {},
  type: 'normal',
  choices: []
}

const RESIGN_CHOICE: EventChoice = {
  id: 'resign',
  text: '挂冠求去，辞官归里',
  effects: {
    gameState: { 清议: 10 },
    special: { type: 'ending', value: 'ending_hermit' }
  }
}

describe('缺陷：辞官确认弹窗排在一切写入之后，「取消」会留下半应用的抉择', () => {
  it('取消后这次抉择等同于从未发生', async () => {
    const save = makeSaveData({
      currentEvent: RESIGN_EVENT,
      currentEventId: RESIGN_EVENT.id
    })
    const { result, unmount } = renderGameEngine({ loadSaveData: save })
    await flush()

    const beforeQingyi = result.current.gameState.清议
    const beforeRecords = result.current.lifeRecords.length
    const beforeStats = result.current.playerStats

    await act(async () => {
      result.current.handleChoice(RESIGN_CHOICE)
    })
    expect(result.current.resignConfirmModal.isOpen).toBe(true)

    await act(async () => {
      result.current.cancelResign()
    })

    expect(result.current.resignConfirmModal.isOpen).toBe(false)
    expect(result.current.isGameOver).toBe(false)
    expect(result.current.gameState.清议).toBe(beforeQingyi)
    expect(result.current.lifeRecords).toHaveLength(beforeRecords)
    expect(result.current.playerStats.luckyStreak).toBe(beforeStats.luckyStreak)
    expect(result.current.playerStats.unluckyStreak).toBe(beforeStats.unluckyStreak)
    expect(result.current.eventHistory).not.toContain(RESIGN_EVENT.id)
    unmount()
  })

  it('确认后走完整条结算链路：五方态度、生平记录、结局登记与传略都生效', async () => {
    const save = makeSaveData({
      currentEvent: RESIGN_EVENT,
      currentEventId: RESIGN_EVENT.id
    })
    const { result, unmount } = renderGameEngine({ loadSaveData: save })
    await flush()

    const beforeQingyi = result.current.gameState.清议

    await act(async () => {
      result.current.handleChoice(RESIGN_CHOICE)
    })
    await act(async () => {
      result.current.confirmResign()
    })
    await flush(30)

    expect(result.current.resignConfirmModal.isOpen).toBe(false)
    expect(result.current.isGameOver).toBe(true)
    // 此前 confirmResign 只有一句 setIsGameOver(true)，而结局分支又排在 setGameState
    // 之后 return —— 五方态度被整份丢弃，结局屏读到的是「改了一半」的局势
    expect(result.current.gameState.清议).toBeGreaterThan(beforeQingyi)
    expect(result.current.eventHistory).toContain(RESIGN_EVENT.id)
    expect(result.current.lifeRecords.length).toBeGreaterThan(0)
    unmount()
  })
})

/* ------------------------------------------------------------------ 五 */
/* 撤销                                                                */

describe('缺陷：撤销只回滚角色与局势，统计/生平/剧情线/政绩分增量留在原地', () => {
  it('撤销会把生平记录、局内统计与政绩分增量一起还原', async () => {
    const save = makeSaveData({
      currentEvent: RESIGN_EVENT,
      currentEventId: RESIGN_EVENT.id
    })
    const { result, unmount } = renderGameEngine({ loadSaveData: save })
    await flush()

    const before = {
      merit: result.current.meritScore,
      records: result.current.lifeRecords.length,
      lucky: result.current.playerStats.luckyStreak,
      unlucky: result.current.playerStats.unluckyStreak,
      qingyi: result.current.gameState.清议
    }

    const choice: EventChoice = {
      id: 'c_undo',
      text: '赈济灾民',
      effects: { gameState: { 清议: 7 }, meritScore: 20 }
    }

    await act(async () => {
      result.current.handleChoice(choice)
    })
    await flush(30)

    expect(result.current.lifeRecords.length).toBeGreaterThan(before.records)
    // 出身修正会改变实际生效的增量（寒门的清议类增减另有倍率），所以只断言方向
    expect(result.current.gameState.清议).toBeGreaterThan(before.qingyi)

    await act(async () => {
      result.current.handleUndo()
    })
    await flush(30)

    expect(result.current.gameState.清议).toBe(before.qingyi)
    expect(result.current.lifeRecords).toHaveLength(before.records)
    // 快照必须取自「统计计数之前」，否则撤销回来的是本次抉择的事后值
    expect(result.current.playerStats.luckyStreak).toBe(before.lucky)
    expect(result.current.playerStats.unluckyStreak).toBe(before.unlucky)
    expect(result.current.meritScore).toBe(before.merit)
    unmount()
  })

  it('撤销自身会被计数（「反复无常」成就的唯一计数来源）', async () => {
    const { result, unmount } = renderGameEngine({
      loadSaveData: makeSaveData({ currentEvent: RESIGN_EVENT, currentEventId: RESIGN_EVENT.id })
    })
    await flush()

    const before = result.current.playerStats.undoCount
    await act(async () => {
      result.current.handleChoice({ id: 'c1', text: '查看账册', effects: {} })
    })
    await flush(30)
    await act(async () => {
      result.current.handleUndo()
    })

    expect(result.current.playerStats.undoCount).toBe(before + 1)
    unmount()
  })
})

/* ------------------------------------------------------------------ 六 */
/* 推进月份的重入                                                        */

describe('缺陷：同一 tick 内连点两次会把一个月过成两个月', () => {
  it('300ms 调度窗口内的第二次调用不会重复推进', async () => {
    // 守卫此前依赖 isProcessing（state），它要等渲染后才回写进 ref，
    // 而真正的推进排在 300ms 定时器里 —— 两次调用都落在同一次 flush 之前。
    const single = renderGameEngine({ loadSaveData: makeSaveData() })
    await flush()
    await act(async () => {
      single.result.current.handleNextMonth()
    })
    await flush(350)
    const singleTurn = single.result.current.gameState.turn
    const singleHistory = single.result.current.eventHistory.length
    single.unmount()

    const double = renderGameEngine({ loadSaveData: makeSaveData() })
    await flush()
    await act(async () => {
      double.result.current.handleNextMonth()
      double.result.current.handleNextMonth()
    })
    await flush(350)

    expect(double.result.current.gameState.turn).toBe(singleTurn)
    expect(double.result.current.eventHistory.length).toBe(singleHistory)
    double.unmount()
  })
})

/* ------------------------------------------------------------------ 七 */
/* 边界事件的判定参数                                                     */

function endingFixture(id: string): GameEvent {
  return {
    id,
    title: '结局夹具',
    description: '',
    conditions: {},
    type: 'ending',
    choices: []
  }
}

/** 引擎实际传给 check 的参数形状：年份在顶层、turn 在 gameState 里 */
function paramsAt(year: number, turn: number): BoundaryEventCheckParams {
  const params = {
    attributes: {},
    gameState: { 圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 40, turn },
    hidden: {},
    flags: [],
    currentYear: year,
    currentMonth: 6
  }
  return params as unknown as BoundaryEventCheckParams
}

describe('缺陷：checkBoundary 传给结局判定的参数缺 turn / currentYear', () => {
  it('玩满 36 个月且过 1635 年后，无条件结局可以触发', () => {
    const [event] = wrapBatchAsBoundaryEvents([endingFixture('test_ending_ok')], 900)
    expect(event.check(paramsAt(1636, 40))).toBe(true)
  })

  it('不足 36 个月时仍被兜底门挡住（不许开局秒结束）', () => {
    const [event] = wrapBatchAsBoundaryEvents([endingFixture('test_ending_early')], 900)
    expect(event.check(paramsAt(1636, 12))).toBe(false)
  })

  it('判定参数若不带 turn，结局会被永久判死 —— 这正是修复前的形态', () => {
    const [event] = wrapBatchAsBoundaryEvents([endingFixture('test_ending_noturn')], 900)
    const noTurn = { ...paramsAt(1636, 40), gameState: { 圣眷: 50, 国势: 40 } } as BoundaryEventCheckParams
    expect(event.check(noTurn)).toBe(false)
  })
})

/* ------------------------------------------------------------------ 八 */
/* 阈值类结局的宽限期                                                     */

/** 只关心某几个数值 + turn 的判定参数 */
function thresholdParams(values: Record<string, number>, turn: number): BoundaryEventCheckParams {
  return {
    attributes: { 财帛: 50, 体质: 50, ...values },
    gameState: { 圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 50, turn },
    hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
  } as unknown as BoundaryEventCheckParams
}

function boundaryById(id: string) {
  const found = BOUNDARY_EVENTS.find(e => e.id === id)
  expect(found, `边界事件 ${id} 不存在`).toBeDefined()
  return found!
}

/**
 * 某个出身的开局第一个事件，其**第一个选项**会把财帛改成多少。
 * 返回 null 表示这个出身不存在「开局首选项就能把财帛打空」的情况。
 */
function originFirstChoiceCost(origin: '寒门'): { start: number; cost: number } | null {
  const start = origins[origin].initialAttributes?.财帛 ?? 0
  const opener = initialEvents.find(e => e.conditions?.origin === origin && e.type === 'transition')
  const cost = (opener?.choices?.[0]?.effects?.attributes as { 财帛?: number } | undefined)?.财帛
  if (typeof cost !== 'number') return null
  return { start, cost }
}

describe('缺陷：开局第一个选项就能把人当场判死（阈值类结局没有宽限期）', () => {
  it('寒门开局财帛 15，首选项 财帛 -20 会直接归零 —— 这是缺陷的前提', () => {
    const drain = originFirstChoiceCost('寒门')
    expect(drain).not.toBeNull()
    expect(drain!.start + drain!.cost).toBeLessThanOrEqual(0)
  })

  it('宽限期内归零不判死', () => {
    expect(boundaryById('bankrupt').check(thresholdParams({ 财帛: 0 }, 1))).toBe(false)
    expect(boundaryById('death_illness').check(thresholdParams({ 体质: 0 }, 1))).toBe(false)
    expect(boundaryById('emperor_hate').check(thresholdParams({}, 1))).toBe(false)
  })

  it('宽限期满后仍归零，结局照常触发', () => {
    expect(boundaryById('bankrupt').check(thresholdParams({ 财帛: 0 }, 12))).toBe(true)
    expect(boundaryById('death_illness').check(thresholdParams({ 体质: 0 }, 36))).toBe(true)
  })

  it('非归零状态任何时候都不该误判', () => {
    expect(boundaryById('bankrupt').check(thresholdParams({ 财帛: 1 }, 60))).toBe(false)
    expect(boundaryById('emperor_hate').check(thresholdParams({}, 60))).toBe(false)
  })
})
