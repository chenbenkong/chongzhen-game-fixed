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
import { BOUNDARY_EVENTS, THRESHOLD_ENDING_BY_KEY } from '../../src/data/boundaryEvents'
import { ZERO_THRESHOLDS, zeroWarnFlag } from '../../src/data/zeroWarningEvents'
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
  // special 只认 type: 'ending'。原先这里还写着 value: 'ending_hermit'，
  // 但引擎从不读 value（走的是 isResignEndingChoice 对选项文案的判断），
  // 第九轮把 value 从类型里删掉，这个测试跟着收紧。
  effects: {
    gameState: { 清议: 10 },
    special: { type: 'ending' }
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
function thresholdParams(values: Record<string, number>, turn: number, flags: string[] = []): BoundaryEventCheckParams {
  return {
    attributes: { 财帛: 50, 体质: 50, ...values },
    gameState: { 圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 50, turn },
    hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
    flags
  } as unknown as BoundaryEventCheckParams
}

function boundaryById(id: string) {
  const found = BOUNDARY_EVENTS.find(e => e.id === id)
  expect(found, `边界事件 ${id} 不存在`).toBeDefined()
  return found!
}

/**
 * 按归零维度找回它对应的那条阈值结局边界事件。
 * 查的是注册 id（'bankrupt'）而不是事件 id（'triggerable_bankrupt'），
 * 所以这一步顺带对账了 `THRESHOLD_ENDING_BY_KEY`：
 * 表里指的事件若没有被注册成边界事件，这里就红。
 */
function thresholdBoundaryOf(key: keyof typeof THRESHOLD_ENDING_BY_KEY) {
  const endingId = THRESHOLD_ENDING_BY_KEY[key]
  const found = BOUNDARY_EVENTS.find(e => e.event.id === endingId)
  expect(found, `维度 ${key} 的结局 ${endingId} 没有注册成边界事件`).toBeDefined()
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
  /**
   * 这一条原本是**缺陷的前提**：寒门 财帛15，开局首选项 −20 ⇒ 当场归零。
   * 第十四轮把出身的最低一档抬到 25（见 `origins.ts` 顶部那段实测说明），
   * 前提本身不再成立，于是断言改成反向的护栏：
   * **任何出身的开局首选项，都不许在第一个月就把该维打到零。**
   * 若有人为了"更有压迫感"把 财帛 调回 15，这里会红 —— 那正是要拦的改动。
   */
  it('寒门开局的第一个选项不再能把财帛当场打空', () => {
    const drain = originFirstChoiceCost('寒门')
    expect(drain).not.toBeNull()
    expect(drain!.cost, '这条首选项仍然是一笔真金白银的重罚，护栏不是因为把代价删了才通过的').toBeLessThanOrEqual(-20)
    expect(drain!.start + drain!.cost).toBeGreaterThan(0)
  })

  it('宽限期内归零不判死', () => {
    expect(boundaryById('bankrupt').check(thresholdParams({ 财帛: 0 }, 1))).toBe(false)
    expect(boundaryById('death_illness').check(thresholdParams({ 体质: 0 }, 1))).toBe(false)
    expect(boundaryById('emperor_hate').check(thresholdParams({}, 1))).toBe(false)
  })

  /**
   * 第十一轮把这条改成了两段式：**同一维度归零两次才要命**。
   * 原用例断言「期满仍归零 → 结局照常触发」，测的是一段静默的雷 ——
   * 整局模拟实测 3/4 局恰好死在第 13 个月，因为宽限期只是把死期推迟、
   * 却没有在那十二个月里给玩家任何提示或出路。
   * 现在判死必须同时满足：过了宽限期、该维归零、且 `归零警告·X` 这个 flag 已在身上。
   */
  it('宽限期满后归零，但没被警告过 —— 不判死（第一次归零给活路）', () => {
    expect(boundaryById('bankrupt').check(thresholdParams({ 财帛: 0 }, 12))).toBe(false)
    expect(boundaryById('death_illness').check(thresholdParams({ 体质: 0 }, 36))).toBe(false)
    expect(boundaryById('eunuch_conspiracy').check(thresholdParams({ 中官: 0 }, 40))).toBe(false)
  })

  it('警告过之后再次归零，结局照常触发（第二次没人救）', () => {
    expect(
      boundaryById('bankrupt').check(thresholdParams({ 财帛: 0 }, 12, [zeroWarnFlag('财帛')]))
    ).toBe(true)
    expect(
      boundaryById('death_illness').check(thresholdParams({ 体质: 0 }, 36, [zeroWarnFlag('体质')]))
    ).toBe(true)
    // 别的维度的警告不作数：警告与死线必须同一键
    expect(
      boundaryById('bankrupt').check(thresholdParams({ 财帛: 0 }, 12, [zeroWarnFlag('圣眷')]))
    ).toBe(false)
  })

  /**
   * 八条死线都要有对应的警告事件，且这一对必须**互斥地**覆盖同一个状态：
   * 归零而未警告 → 只出警告；归零且已警告 → 只出结局。
   * 少了这条对账，将来加第九条死线时很容易只写结局不写警告，
   * 而那种缺口在实机上要等到玩家恰好把那一维打到 0 才看得见。
   */
  it('每一维的警告事件都存在，且与死线交替接管', () => {
    for (const t of ZERO_THRESHOLDS) {
      const warn = BOUNDARY_EVENTS.find(e => e.id === `warn_zero_${t.key}`)
      expect(warn, `维度 ${t.key} 缺少对应的归零警告事件`).toBeDefined()
      expect(warn!.type, `维度 ${t.key} 的警告不应同时被登记成结局`).toBe('crisis')
      expect(warn!.event.choices.length).toBeGreaterThanOrEqual(2)
      for (const choice of warn!.event.choices) {
        expect(
          choice.effects.flags?.add,
          `维度 ${t.key} 的选项 ${choice.id} 没有写下警告 flag —— 玩家救回来了，可死线永远等不到第二次归零的判据`
        ).toContain(zeroWarnFlag(t.key))
      }

      const params = (flags: string[]) => {
        const p = thresholdParams({}, 20, flags) as any
        p[t.group][t.key] = 0
        return p as BoundaryEventCheckParams
      }
      expect(warn!.check(params([])), `维度 ${t.key} 归零时应给出警告`).toBe(true)
      expect(warn!.check(params([zeroWarnFlag(t.key)])), `维度 ${t.key} 已警告过就不该重复警告`).toBe(false)
      const ending = thresholdBoundaryOf(t.key)
      expect(ending.check(params([zeroWarnFlag(t.key)])), `维度 ${t.key} 第二次归零必须判死`).toBe(true)
      expect(ending.check(params([])), `维度 ${t.key} 第一次归零不该判死`).toBe(false)
    }
  })

  it('非归零状态任何时候都不该误判', () => {
    expect(boundaryById('bankrupt').check(thresholdParams({ 财帛: 1 }, 60))).toBe(false)
    expect(boundaryById('emperor_hate').check(thresholdParams({}, 60))).toBe(false)
  })
})
