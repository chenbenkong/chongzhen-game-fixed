import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { crisisEventMayShow } from '../../src/hooks/useGameEngine'
import { BOUNDARY_EVENTS } from '../../src/data/boundaryEvents'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { zeroWarningEvents } from '../../src/data/zeroWarningEvents'
import { corruptionWarningEvents } from '../../src/data/demotionWarningEvents'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { FUGITIVE_FLAG } from '../../src/data/demotionWarningEvents'
import { simulateRun } from './helpers/simulate'

/**
 * 缺陷 K-2：`crisis` 类临界事件只在引擎挂载时检查过一次。
 *
 * `boundaryEventManager` 里注册了 'ending' 与 'crisis' 两类临界事件。
 * 挂载 effect 两类都查（各带 0.3 的概率门），但它有一次性 ref 守卫、只跑一次；
 * 而会被反复调用的 `checkBoundary()` 只查了 'ending'。
 * 结果是：所有 crisis 事件（例如「重病缠身」）只有在玩家**开局瞬间**就已经满足条件时
 * 才可能出现，游戏中途永远触发不了 —— 成了死内容。
 *
 * 测试要点：必须把挂载阶段的随机数压到概率门之外，只在推进月份时放开。
 * 否则挂载 effect 自己就会触发 crisis，测到的还是那条本来就正常的路径。
 */

/** 政绩分 452 → 官阶「正六品·同知」自洽；体质 18 满足 crisis 条件（< 20）但不触发「体弱多病」（< 15） */
function makeSaveWithConstitution(constitution: number) {
  return makeSaveData({
    character: makeCharacter({
      rank: '正六品·同知',
      degree: '进士',
      attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: constitution },
      hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
    }),
    gameState: makeGameState({ 圣眷: 50, 民望: 50, 士绅: 50, 清议: 50 })
  })
}

const CRISIS_EVENT_ID = 'boundary_serious_illness'

describe('缺陷 K-2：游戏中途应能触发 crisis 类临界事件', () => {
  it('体质低于 20 时，推进月份应有机会触发「重病缠身」', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    const { result } = renderGameEngine({ loadSaveData: makeSaveWithConstitution(18) })
    await flush()

    // 前提：挂载阶段因为随机数在概率门之外，没有触发 crisis
    expect(result.current.currentEvent?.id).not.toBe(CRISIS_EVENT_ID)

    // 放开概率门，然后推进一个月
    randomSpy.mockReturnValue(0.1)
    await act(async () => {
      result.current.handleNextMonth()
    })
    // checkBoundary 是在 300ms 的 setTimeout 里调用的，要等它落地
    await flush(600)

    expect(result.current.currentEvent?.id).toBe(CRISIS_EVENT_ID)
  })

  it('体质正常时，推进月份不应凭空触发 crisis', async () => {
    // 反向守卫：确认修复没有变成"无条件触发危机事件"
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1)

    const { result } = renderGameEngine({ loadSaveData: makeSaveWithConstitution(60) })
    await flush()

    randomSpy.mockReturnValue(0.1)
    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    expect(result.current.currentEvent?.id).not.toBe(CRISIS_EVENT_ID)
  })
})

/**
 * 第十八轮：手写党派结局的三条 check 过去**读都不读年代**，于是文本写的是 1644 年甲申之变的
 * 《东林烈士》，实测在开局第 13 个月就把一局打死了（200 局里 12 局如此，全部出自
 * `诗文清望` —— 它开局清议 60、又带「党争漩涡」强制卷入东林线，最快踩齐门槛）。
 * 玩家 1629 年读到「三天后，李自成攻入北京。又四十多天，清军入关」，
 * 不是难度高，是这句话在讲一件还没发生的事。
 *
 * 这一格断言的是**因果的顺序**，不是数值：状态条件全部摆平，只动年代这一个变量。
 * 阈值结局那套 `pastGrace`（宽限期 + 归零两次才要命）与叙事结局那套
 * `NARRATIVE_MIN_YEAR / NARRATIVE_MIN_TURN` 早就存在，这三条只是没接进去。
 */
function factionParams(turn: number, currentYear: number, over: Partial<BoundaryEventCheckParams> = {}): BoundaryEventCheckParams {
  return {
    attributes: { 财帛: 50, 文韬: 80, 理政: 60, 武略: 70, 体质: 60 },
    gameState: { 圣眷: 50, 中官: 40, 清议: 80, 士绅: 50, 民望: 60, 国势: 40, turn },
    hidden: { 道德值: 80, 欲望值: 30, 野心值: 30, 机敏值: 50, 忠诚值: 60 },
    faction: { 东林好感: 90, 阉党好感: 10, 立场: '东林', 党争烈度: 60 },
    flags: ['东林死忠'],
    currentYear,
    ...over
  }
}

const M = (id: string) => BOUNDARY_EVENTS.find(r => r.id === id)!.check

describe('第十八轮：党派结局不许讲一件还没发生的事', () => {
  it('《东林烈士》文本绑定甲申之变，1644 年前必不触发', () => {
    const check = M('faction_donglin_martyr')
    // 状态全满足，但还在崇祯early / 宽限期之内 —— 三条都该挡住
    expect(check(factionParams(24, 1630)), '开局两年就发甲申之变').toBe(false)
    expect(check(factionParams(120, 1637)), '崇祯十年还没有李自成').toBe(false)
    expect(check(factionParams(200, 1643)), '1643 年正月京城还没破').toBe(false)
    // 年代到位才放行
    expect(check(factionParams(200, 1644))).toBe(true)
    // 拿不到年代时按"不触发"处理（fail-closed）—— 与 boundaryEventCompiler 对 conditions.year 的处理一致
    expect(check({ ...factionParams(200, 1644), currentYear: undefined })).toBe(false)
  })

  it('《权奸末路》写着「温体仁倒台后」，倒台（1637）之前必不触发', () => {
    const check = M('faction_tyrant_fall')
    const tyrant = factionParams(200, 1636, {
      faction: { 东林好感: 10, 阉党好感: 90, 立场: '中间', 党争烈度: 80 },
      flags: ['叛徒'],
      hidden: { 道德值: 10, 欲望值: 60, 野心值: 70, 机敏值: 50, 忠诚值: 20 }
    })
    expect(check(tyrant), '温体仁还没倒台').toBe(false)
    expect(check({ ...tyrant, currentYear: 1637 })).toBe(true)
  })

  it('《党争牺牲品》文本没有年代锚点，但同样要过了叙事结局的时间下限才算"沉浮多年"', () => {
    const check = M('faction_sacrifice')
    const caught = {
      faction: { 东林好感: 20, 阉党好感: 25, 立场: '未定' as const, 党争烈度: 95 }
    }
    expect(check(factionParams(30, 1630, caught)), 'turn 30 还在宽限期内').toBe(false)
    expect(check(factionParams(40, 1630, caught)), '1630 年连国势都还没开始崩').toBe(false)
    expect(check(factionParams(40, 1635, caught))).toBe(true)
  })
})

/**
 * 第二十八轮：年窗打开的那一个月，引擎必须当月接住。
 *
 * 起因是整局模拟器里读到的两局（seed 6405、6429）：它们的人在第 84 个月（=1635 年正月，
 * 也就是《亡命江湖》年窗的**头一个月**）门已经开了，抄表按那个月的入参把所有 ending 排一遍，
 * 赢的正是 p127《亡命江湖》自己，不是 p1《倾家荡产》—— 局却结在了破产上。
 * 两种解释要分清：要么引擎在跨年月漏判（真 bug，且会吞掉每一个"卡在窗口边界上"的人），
 * 要么差在量具的时序（假 bug）。
 *
 * 这里用反推存档直接喂引擎，绕开跑局循环：`1634-12 → 推进一月 → 1635-1`，当月就结案。
 * 于是漏判解释被排除，⑳ 记的是量具那一侧。下面第二条是反向守卫 —— 别把这条修成"窗外也放行"。
 */
describe('第二十八轮：年窗首月的边界判定用的是今年的时钟', () => {
  /** 《亡命江湖》的四条门都满足，只差年代：p127 要 1635≤年≤1650 · 体质≥25 · 道德≤30 · 圣眷≤15 */
  const makeFugitiveSave = (year: number, month: number, turn: number) =>
    makeSaveData({
      character: makeCharacter({
        rank: '正七品·知县',
        degree: '进士',
        attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 },
        hidden: { 道德值: 20, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
        flags: [FUGITIVE_FLAG]
      }),
      gameState: makeGameState({ currentYear: year, currentMonth: month, turn, 圣眷: 10 })
    })

  it('站在 1635-1 的门口的这一步，当月就结案 —— 不许拖到下个月', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { result } = renderGameEngine({ loadSaveData: makeFugitiveSave(1634, 12, 83) })
    await flush()
    expect(result.current.gameState.currentYear).toBe(1634)

    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    expect(result.current.gameState.currentYear, '这一步没跨到 1635 —— 上面那句结案就无从判起').toBe(1635)
    expect(result.current.isGameOver, '已经跨进年窗头一个月，引擎却没接住这一格').toBe(true)
    expect(result.current.currentEvent?.id).toBe('ending_fugitive')
    randomSpy.mockRestore()
  })

  it('差一个月还在窗外时不许放行 —— 这条钉子不是"无条件结案"', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { result } = renderGameEngine({ loadSaveData: makeFugitiveSave(1634, 11, 82) })
    await flush()

    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    expect(result.current.gameState.currentYear).toBe(1634)
    expect(result.current.isGameOver, '1634 年就把《亡命江湖》结了 —— 年窗这道门形同没有').toBe(false)
    randomSpy.mockRestore()
  })

  /**
   * 上面两条排除了"引擎漏判"，这一条把另一支解释钉成读数：**跑局模拟器晚一个月**。
   *
   * `helpers/simulate.ts` 的月度推进写的是
   * `await act(async () => { handleNextMonth(); await vi.advanceTimersByTimeAsync(340) })` ——
   * 引擎里那 300ms 定时器在 act **之内**落地，此时 `characterRef` / `gameStateRef` 还停在上一轮
   * flush 的值（`useGameEngine.ts:865-867` 那批 useEffect 同步 ref），于是 `checkBoundary()` 拿
   * 的是**上个月**的状态。下面这两段用的是同一份档案、同一个跨年月，只换定时器跑在 act 里还是 act 外：
   * 里面不结案、外面结案。
   *
   * 所以整局模拟里读到的"门开在 T 月、结案在 T+1 月"、以及"seed 6405/6429 门开着却死在破产"，
   * 都是这一拍的偏置，不是游戏行为。**别去改跑局器**：改了这一拍，第十一轮到第二十七轮之间
   * 所有以月为单位的基线（结案数、门开月数、遮蔽读数）要全部重抄。钉在这里的作用只有一个：
   * 哪天有人动了推进时序，这两句断言会当场报错，提醒他基线该重抄了。
   */
  it('同一个跨年月：定时器跑在 act 内不结案，跑在 act 外结案 —— 差的是量具的一拍', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    vi.useFakeTimers()
    try {
      const inside = renderGameEngine({ loadSaveData: makeFugitiveSave(1634, 12, 83) })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      await act(async () => {
        inside.result.current.handleNextMonth()
        await vi.advanceTimersByTimeAsync(340)
      })
      expect(inside.result.current.gameState.currentYear).toBe(1635)
      expect(
        inside.result.current.isGameOver,
        '跑局器推进月份的时序改了 —— checkBoundary 不再晚一拍，第 11~27 轮所有按月读数要重抄'
      ).toBe(false)

      const outside = renderGameEngine({ loadSaveData: makeFugitiveSave(1634, 12, 83) })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      await act(async () => {
        outside.result.current.handleNextMonth()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(outside.result.current.isGameOver, '同一份档案在 act 外也不结案 —— 那引擎真漏判了').toBe(true)
      expect(outside.result.current.currentEvent?.id).toBe('ending_fugitive')
    } finally {
      vi.useRealTimers()
      randomSpy.mockRestore()
    }
  })
})

/**
 * 缺陷 K-14c：crisis 类临界事件**完全不吃冷却**。
 *
 * `EVENT_COOLDOWN_MONTHS` 的表头写的是「冷却期（月）」，但第十四轮之前这张表只管支线池。
 * crisis 路径不一样：它的条件判的是**状态**（`0 < 体质 < 20`）而不是历史，
 * 只要玩家一直病着就恒真，于是同一个「重病缠身」能在三个月里发作两遍 ——
 * 太医前一个月刚说"需静养数月"，下个月又是同一张方子。
 *
 * 曾经的实测对照（真引擎 + 假时钟 + 固定种子）：修复前 seed=8 的发作月份是
 * **[12, 15]**（隔 3 个月，而 random 档位写的是 8）；修复后同样这局是 **[12, 24]**。
 *
 * 但第十五轮之后这个载体没了：第十四轮给体质补了回升通道（告假静养 +20 那一类），
 * `0 < 体质 < 20` 的窗口被压得很短，random / steady / warden 各 60 局共 180 局里
 * 「重病缠身」**一次也没有重发**。断言还在、取样抓不到 —— 所以载体换成构造：
 * 直接问判定函数"上月刚发作，这个月能不能再发"。整局取样留着当不变量扫子，
 * 哪天抽样路径又挪回来了，它仍会当场报出间隔不足的那一局。
 */
const COOLDOWN_RANDOM_MONTHS = 8

const ILLNESS_SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)

describe('缺陷 K-14c：crisis 临界事件发作后要隔满冷却才能再发', () => {
  it('刚发作过的第 1..7 个月必挡、第 8 个月必放（概率门之内）', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const rule = BOUNDARY_EVENTS.find(r => r.id === 'serious_illness')!
    const event = rule.event
    // 冷却档位取自事件自己的 `type`（不是注册表那条的 'crisis'）—— 钉住这个取值来源，
    // 否则哪天有人把事件的 type 删掉，`EVENT_COOLDOWN_MONTHS[undefined]` 恒 0，冷却静默消失。
    expect(event.type).toBe('random')

    const justFiredAt = new Map([[event.id, 0]])
    for (let turn = 1; turn <= COOLDOWN_RANDOM_MONTHS - 1; turn++) {
      expect(crisisEventMayShow(rule.id, event, turn, justFiredAt), `第 ${turn} 月仍在冷却期内`).toBe(false)
    }
    expect(crisisEventMayShow(rule.id, event, COOLDOWN_RANDOM_MONTHS, justFiredAt)).toBe(true)

    // 反向两格：没发作过 ⇒ 不挡；发作过但早已出冷却 ⇒ 只受概率门管
    expect(crisisEventMayShow(rule.id, event, 1, new Map())).toBe(true)
    randomSpy.mockReturnValue(0.99)
    expect(crisisEventMayShow(rule.id, event, 20, new Map())).toBe(false)
    randomSpy.mockRestore()
  })

  it('取样里只要重发过，两次之间就至少隔 8 个月', async () => {
    const runs = []
    for (const seed of ILLNESS_SEEDS) {
      runs.push(await simulateRun({ seed, policy: 'random', maxMonths: 200 }))
    }

    for (const r of runs) {
      const turns = r.firedEventIds
        .map((id, i) => (id === CRISIS_EVENT_ID ? r.firedTurns[i] : -1))
        .filter(t => t >= 0)

      for (let i = 1; i < turns.length; i++) {
        expect(
          turns[i] - turns[i - 1],
          `seed=${r.seed}：第 ${turns[i - 1]} 月 → 第 ${turns[i]} 月，同一场病隔了 ${turns[i] - turns[i - 1]} 个月`
        ).toBeGreaterThanOrEqual(COOLDOWN_RANDOM_MONTHS)
      }
    }
    // 这里刻意**不**断言"取样里必须重发过一次"：载体已经换成上面那条构造函数
    // （见本段说明），180 局抓不到一次重发是体质回升通道生效的结果，不是冷却坏了。
  }, 240_000)
})

/**
 * 第三十九轮：§1.4 ② —— 中官的低位回升渠道。
 *
 * 在这之前，中官只有下降通道：`诗文清望` 开局 22 点、正增量还打七折，
 * aggressive 组 100 局里 78 局死在它归零上。归零警告给的三条路一生只发一次，
 * 发过之后就没有下一次了 —— 玩家能做的只剩下"别让它掉到 0"，没有一次主动的补救。
 *
 * 「内廷门路」不是被动回血，而是一条**只在低位开**的玩法：中官 1~30 时宫里递话，
 * 三条路分别拿财帛 / 圣眷 / 士绅换。拉到 30 以上就再也刷不到 —— 中官不能存起来兑现。
 * 判据刻意不含 0：0 点由归零警告管，那一次通知必须由警告来播。
 */
const CHANNEL_RULE = BOUNDARY_EVENTS.find(r => r.id === 'inner_court_channel')!
const CHANNEL_EVENT_ID = 'boundary_inner_court_channel'

function channelParams(zhongguan: number): BoundaryEventCheckParams {
  return {
    attributes: { 财帛: 60, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 },
    gameState: { 圣眷: 50, 中官: zhongguan, 清议: 50, 士绅: 50, 民望: 50 },
    hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
    flags: []
  }
}

describe('第三十九轮：中官低位时才开的那扇内廷门（§1.4 ②）', () => {
  it('只在中官 1~30 之间开门，0 点交给归零警告，31 点以上不许存着刷', () => {
    expect(CHANNEL_RULE.check(channelParams(1))).toBe(true)
    expect(CHANNEL_RULE.check(channelParams(30))).toBe(true)
    expect(CHANNEL_RULE.check(channelParams(0)), '0 点该由「归零警告·中官」来播').toBe(false)
    expect(CHANNEL_RULE.check(channelParams(31)), '31 点以上还能刷，等于把中官存起来反复兑现').toBe(false)
    expect(CHANNEL_RULE.check(channelParams(80))).toBe(false)
    // 已经潜逃的人不再有内廷门路 —— 也不该在年窗里被这扇门换走最后的盘缠
    expect(
      CHANNEL_RULE.check({ ...channelParams(10), flags: ['潜逃'] }),
      '通缉在案的人还收到宫里递话'
    ).toBe(false)
    // 参数缺失按不触发处理（与 boundaryEventCompiler 的 fail-closed 一致）
    expect(CHANNEL_RULE.check({ attributes: {}, gameState: {}, hidden: {} })).toBe(false)
  })

  it('priority 排在全部"必达警告"之后：同月命中时，先播警告', () => {
    // 不只是八条归零警告 ——「革职预警·贪墨」同样是必达的（severity 3 之前最后一次通知），
    // 而它的 priority 也是 19。新事件若停在 19，同月命中就会把它顶掉。
    const warningPriorities = [...zeroWarningEvents, ...corruptionWarningEvents].map(e => e.priority)
    const maxWarningPriority = Math.max(...warningPriorities)
    expect(CHANNEL_RULE.priority).toBeGreaterThan(maxWarningPriority)

    // 财帛归零 + 中官低位同时成立：管理器必须把第一条归零通知递出来
    const broke = channelParams(10)
    broke.attributes = { ...broke.attributes, 财帛: 0 }
    expect(boundaryEventManager.checkByType(broke, 'crisis')?.id).toBe('warn_zero_财帛')
    // 财帛正常时，才轮到门路
    expect(boundaryEventManager.checkByType(channelParams(10), 'crisis')?.id).toBe('inner_court_channel')
  })

  it('三条出路都付代价，没有一条是白拿中官', () => {
    const choices = CHANNEL_RULE.event.choices
    expect(choices).toHaveLength(3)
    for (const choice of choices) {
      const gain = choice.effects.gameState?.['中官'] ?? 0
      expect(gain, `${choice.id} 没给中官，回天之路等于没有`).toBeGreaterThan(0)
      const costs = [
        choice.effects.attributes?.['财帛'] ?? 0,
        choice.effects.gameState?.['圣眷'] ?? 0,
        choice.effects.gameState?.['士绅'] ?? 0,
        choice.effects.gameState?.['清议'] ?? 0,
        choice.effects.hidden?.['道德值'] ?? 0
      ]
      expect(costs.some(v => v < 0), `${choice.id} 只涨中官、没有代价`).toBe(true)
    }
  })

  it('真引擎里中官 20 时推进一个月能撞见它，点【封一份礼】中官涨、财帛减', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { result } = renderGameEngine({
      loadSaveData: makeSaveData({
        character: makeCharacter({
          attributes: { 财帛: 60, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 }
        }),
        gameState: makeGameState({ 中官: 20 })
      })
    })
    await flush()
    expect(result.current.currentEvent?.id).not.toBe(CHANNEL_EVENT_ID)

    randomSpy.mockReturnValue(0.1)
    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)
    expect(result.current.currentEvent?.id, '中官已经低到 20，宫里的门却没开').toBe(CHANNEL_EVENT_ID)

    const zhongguanBefore = result.current.gameState.中官
    const moneyBefore = result.current.character.attributes.财帛
    const c1 = CHANNEL_RULE.event.choices.find(c => c.id === 'c1')!
    await act(async () => {
      result.current.handleChoice(c1)
    })
    await flush(30)
    expect(result.current.gameState.中官).toBe(zhongguanBefore + 26)
    expect(result.current.character.attributes.财帛).toBe(moneyBefore - 22)
    randomSpy.mockRestore()
  })
})
