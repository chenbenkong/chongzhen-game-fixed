import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { renderGameEngine } from './gameEngine'
import { checkChoiceRequirement } from '../../../src/utils/choiceRequirements'
import { allEndingEvents } from '../../../src/data/events/ending'
import { resolveEndingTileId } from '../../../src/data/endingRegistry'
import { ZERO_WARNING_EVENT_ID } from '../../../src/data/zeroWarningEvents'
import type { Character, GameStateValues, OriginType } from '../../../src/types/game'
import type { EventChoice, GameEvent } from '../../../src/types/event'

/**
 * 整局模拟：驱动**真的** `useGameEngine`，一路从 1628 年玩到游戏结束。
 *
 * 为什么要有这个东西。本文「需要人工验收的项」里那条「事件覆盖率 / 结局分布 —— 需要大量游玩」
 * 一直没被自动验收过，因为没人能拿手玩几百局。而这类"手玩才知道"的项，恰恰是静默失效的
 * 藏身处：一个永远不会被选中的结局、一个推进不动的年份、一处算成 NaN 的加成，
 * 单测里各点都过得住，只有真跑一整局才露出来。
 *
 * 三条设计决定：
 *  1. 用 `Math.random` 的种子替身，而不是让引擎接收 seed —— 引擎里的随机散在十几处
 *    （挑事件、投骰、随机后果），改签名要动的地方比这个替身多得多，而且改完之后
 *    "线上玩家的实际路径"就不再是被测的那条路径了。
 *  2. 选项能不能选，走 `EventDisplay.checkChoiceRequirement` —— 和玩家看到的是同一个判断。
 *    自己另写一遍就等于用第二套规则跑模拟，跑出来的覆盖率是假的。
 *  3. 假定时器推进那 340ms 调度窗口（引擎 `handleNextMonth` 里的去抖），
 *    一个月一次真实 340ms 的话，一局 200 个月要跑 70 秒，几百局无从谈起。
 */

export type SimPolicy = 'random' | 'first' | 'ambitious' | 'steady' | 'warden' | 'sealer'

export interface SimOutcome {
  seed: number
  policy: SimPolicy
  /** 推进过的月份数 */
  months: number
  /** 做出过的抉择数 */
  choices: number
  ended: boolean
  /**
   * 结局事件 id —— **只有它落在已注册结局表里才非空**。
   * 非空即"这一局真的走到了一个有名字的结局"；为空但 ended=true 就是异常，
   * 具体结束了什么事件看 `endEventId`。
   */
  endingId: string | null
  endingTitle: string | null
  /**
   * 与 `firedEventIds` 一一对应的**月份格**（`gameState.turn`，从 0 起算）。
   * 事件历史里只有 id，看不出「同一场病是不是三个月内治了两回」，
   * 而可重复支线的冷却期恰恰是按月份定义的 —— 这张平行表就是给那条不变量用的。
   */
  firedTurns: number[]
  /** 这一局里真正播出来的事件 id（按播放顺序） */
  firedEventIds: string[]
  /** 终局时算出 NaN / Infinity 的字段，正常应当恒空 */
  badNumbers: string[]
  finalYear: number
  finalRank: string
  /**
   * 结束时屏幕上那个事件的 id。
   * 比「从 eventHistory 反查结局 id」可靠：`handleGameOver` 写历史时带
   * `prev.includes(event.id) ? prev : ...` 的去重，而事件 id 早在月初就被整批推进过，
   * 所以结局事件未必是历史最后一条 —— 反查会认错。
   */
  endEventId: string | null
  /** 终局那一刻八条归零死线上的数值，用来把「为什么结束」归因到具体某一维 */
  finalThresholds: Record<string, number>
  /** 终局时角色身上的 flag 全集 —— 「死于归零必然先见过警告」这条不变量读它 */
  finalFlags: string[]
  /**
   * 终局时的党派四项（东林／阉党好感、立场、党争烈度）。
   *
   * 第二十一轮加它，是因为可达性矩阵能证明"门票发得出来、门槛够得着"，
   * 却证明不了"玩家真刷得到那个数"。`党争烈度` 只有一个来源
   * （五张门票 flag 在 `useGameEngine` 的 faction 段里各推一把），
   * 上界算法给的 100 是不考虑事件竞争的天花板；实测值才是真话。
   */
  finalFaction: { 东林好感: number; 阉党好感: number; 立场: string; 党争烈度: number } | null
  /**
   * 本局所有已选选项**声明**的增量之和（属性/态度/隐藏三组一起加，未乘难度与出身系数）。
   * 与 `actualDelta` 对照用来把「这维掉了」归因到两种完全不同的原因：
   *   声明就是一片负 → 内容在扣，去看数据；
   *   声明接近 0 而实际大跌 → 引擎里有没写在 effects 里的暗扣，去看代码。
   * 因为没乘系数、也拿不到 0..100 的裁剪，两者只比方向与量级，不比尾数。
   */
  declaredDelta: Record<string, number>
  /** 八维的实际变化（终值 − 开局值），与 `declaredDelta` 同键对照 */
  actualDelta: Record<string, number>
  /** 模拟过程中抛出的异常（应当恒为 null；非空就是逮到 bug 了） */
  error: string | null
}

/** mulberry32：够小、够快、可复现的 32 位种子随机 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 图鉴格子 id → 标题。
 *
 * 只从 `allEndingEvents` 取 —— 它就是图鉴的那 44 格。
 * 终局事件 id 换成格子 id 一律走 `resolveEndingTileId`（同一张对账表），
 * 这里不再自己硬记别名：此前 `ending_bankrupt` 是手抄的一条，
 * 于是模拟报告和图鉴各说各话。
 */
const ENDING_TITLES = new Map<string, string>()
for (const e of allEndingEvents as any[]) {
  if (e?.id) ENDING_TITLES.set(e.id, e.title)
}

/** 终局事件 id（注册 id / 改名后的 id / 引擎内联卡片的 id）→ 图鉴格子 id */
export const endingTileOf = (id: string | null | undefined): string | null =>
  id ? resolveEndingTileId(id) : null

/** 贪心策略的打分：把可见收益粗略加总（属性 + 州府态度 + 隐藏属性） */
function scoreChoice(choice: EventChoice): number {
  const eff = choice.effects || ({} as any)
  let sum = 0
  for (const group of [eff.attributes, eff.gameState, eff.hidden]) {
    for (const v of Object.values(group || {}) as any[]) if (typeof v === 'number') sum += v
  }
  if (typeof eff.meritScore === 'number') sum += eff.meritScore
  return sum
}

/**
 * 「守成」策略的估值：做完这个选择之后，八条归零判死线里最紧的那一条还剩多少。
 *
 * 这八条就是 boundaryEvents.ts 里 `pastGrace()` 那批 check —— turn≥12 之后
 * 财帛/体质/圣眷/中官/清议/士绅/民望/道德值 任一为 0 就立刻收尾。
 * 一个想把游戏玩下去的玩家，做的就是这个判断。
 */
function weakestThreshold(character: Character, gameState: GameStateValues, choice: EventChoice): number {
  const e = (choice.effects || {}) as any
  const a = e.attributes || {}
  const g = e.gameState || {}
  const h = e.hidden || {}
  const vals = [
    character.attributes.财帛 + (a.财帛 || 0),
    character.attributes.体质 + (a.体质 || 0),
    gameState.圣眷 + (g.圣眷 || 0),
    gameState.中官 + (g.中官 || 0),
    gameState.清议 + (g.清议 || 0),
    gameState.士绅 + (g.士绅 || 0),
    gameState.民望 + (g.民望 || 0),
    character.hidden.道德值 + (h.道德值 || 0)
  ]
  return Math.min(...vals)
}

/**
 * 「史馆请笔」卡上那条干净的【搁笔】（src/data/endingDecline.ts）。
 *
 * warden / steady 两组都必须优先点它，而不是点【反事实】或【后续】：
 * 那两条是"另一条活法"的推演，各自带增量（名臣那张要先扣 40 点道德值、加 25 点欲望），
 * 把它们当成"想继续玩"的原型动作，等于给每一个拒了笔的玩家凭空加一次惩罚 ——
 * 而我接下来要量的恰恰是"拒了笔能不能走到 1644"。
 */
const sealRefusal = (event: GameEvent) => (event.choices || []).find(c => c.id === 'c_decline')

/** warden 的保命启发式：在不收尾的选项里挑"最弱那条死线离归零最远"的一个 */
function pickSafest(
  pool: EventChoice[],
  character: Character,
  gameState: GameStateValues
): EventChoice {
  const safe = pool.filter(c => c.effects?.special?.type !== 'ending')
  const candidates = safe.length ? safe : pool
  let best = candidates[0]
  let bestWeak = -Infinity
  for (const c of candidates) {
    const weak = weakestThreshold(character, gameState, c)
    if (weak > bestWeak) {
      bestWeak = weak
      best = c
    }
  }
  return best
}

function pickChoice(
  event: GameEvent,
  character: Character,
  gameState: GameStateValues,
  policy: SimPolicy,
  rand: () => number
): EventChoice | null {
  const all = event.choices || []
  if (all.length === 0) return null
  const open = all.filter(c => checkChoiceRequirement(c, character, gameState).available)
  // 全部锁住时按「勉力一试且成功」处理：玩家此时还有投骰这条路，
  // 而投骰的失败分支在 EventDisplay 里、不在引擎里，模拟层拿不到。
  // 这是本模拟器唯一的失真处，它只会让进度比真人略快，不会影响"能不能播出来"。
  const pool = open.length ? open : all
  const refusal = sealRefusal(event)
  if (policy === 'sealer') {
    // 「愿意收笔」的玩家：请笔卡一摆出来就点【青史留名】，其余一律按 warden 保命。
    //
    // 这一组是第十九轮加的量具：steady/warden 两组都会拒笔，于是善终结局在模拟里
    // 一次也不发生，"图鉴那十一格还亮不亮、善终之间谁先接走（§1.4 ⑮）"就没法量。
    // 而它必须建在 warden 上而不是 steady 上 —— 实测过：非结局选项随机挑的话，
    // 200 局里 148 局死在 1629 年（平均 20 个月），根本走不到年窗开放的那一年。
    const seal = (event.choices || []).find(c => c.effects?.special?.type === 'ending')
    if (event.declinable && seal && pool.includes(seal)) return seal
    return pickSafest(pool, character, gameState)
  }
  if (policy === 'warden') {
    if (refusal && pool.includes(refusal)) return refusal
    return pickSafest(pool, character, gameState)
  }
  if (policy === 'steady') {
    // 「想继续玩下去」的玩家：看见能直接收尾的选项（辞官、赐死、兵败自裁……）就绕开。
    // 没有这一层，模拟出来的局长是"玩家一看到退出就点"的局长，
    // 1630 年以后的那些事件与结局就永远统计不到 —— 那正是我们要量的东西。
    if (refusal && pool.includes(refusal)) return refusal
    const keepsPlaying = pool.filter(c => c.effects?.special?.type !== 'ending')
    if (keepsPlaying.length) return keepsPlaying[Math.floor(rand() * keepsPlaying.length) % keepsPlaying.length]
    return pool[Math.floor(rand() * pool.length) % pool.length]
  }
  if (policy === 'first') return pool[0]
  if (policy === 'ambitious') {
    let best = pool[0]
    let bestScore = -Infinity
    for (const c of pool) {
      const s = scoreChoice(c)
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    return best
  }
  return pool[Math.floor(rand() * pool.length) % pool.length]
}

/** 把一个选项声明的全部增量累加进账（属性/态度/隐藏三组，键名不重叠） */
function accumulateDeclared(into: Record<string, number>, choice: EventChoice): void {
  const eff = (choice.effects || {}) as any
  for (const group of [eff.attributes, eff.gameState, eff.hidden]) {
    for (const [k, v] of Object.entries(group || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) into[k] = (into[k] || 0) + v
    }
  }
}

function findBadNumbers(character: Character, gameState: GameStateValues): string[] {
  const bad: string[] = []
  const walk = (obj: any, prefix: string) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${prefix}.${k}`)
    }
  }
  walk(character.attributes, 'attributes')
  walk(character.hidden, 'hidden')
  walk(gameState, 'gameState')
  return bad
}

/** boundaryEvents 里 `pastGrace()` 那批判死线，逐项取当前值 */
function thresholdSnapshot(character: Character, gameState: GameStateValues): Record<string, number> {
  return {
    财帛: character.attributes.财帛,
    体质: character.attributes.体质,
    圣眷: gameState.圣眷,
    中官: gameState.中官,
    清议: gameState.清议,
    士绅: gameState.士绅,
    民望: gameState.民望,
    道德值: character.hidden.道德值
  }
}

/**
 * 跑一局。`maxMonths` 默认 260（1628 起算约等于玩到 1649 年，早已越过甲申之变）。
 * 到点还没结束就返回 ended=false —— 那本身就是一个结论，不是失败。
 *
 * `origin` 默认 '寒门'。这个参数是第十四轮加上去的：**在此之前所有模拟跑的都只是寒门一个出身**，
 * 于是"出身之间的平衡"这件事从来没被测过 —— 而出身恰恰决定了你开局踩在哪几条死线旁边
 * （旧数据里 寒门 财帛15/士绅15、诗文清望 中官15），也决定了你头几个月看得见哪几条支线
 * （纵欲线的门槛是 欲望值 25~35）。跨出身取样才有资格说"平均局长"。
 */
export async function simulateRun(opts: {
  seed: number
  policy?: SimPolicy
  maxMonths?: number
  origin?: OriginType
}): Promise<SimOutcome> {
  const { seed, policy = 'random', maxMonths = 260, origin = '寒门' } = opts
  const rand = mulberry32(seed)
  const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => rand())
  vi.useFakeTimers()

  const fired: string[] = []
  const firedTurns: number[] = []
  let badNumbers: string[] = []
  let outcomeMonths = 0
  let choices = 0
  let ended = false
  let endingId: string | null = null
  let endingTitle: string | null = null
  let error: string | null = null
  let finalYear = 1628
  let finalRank = ''

  const hook = renderGameEngine({ origin })
  let endEventId: string | null = null
  let finalThresholds: Record<string, number> = {}
  let finalFlags: string[] = []
  let finalFaction: SimOutcome['finalFaction'] = null
  const declaredDelta: Record<string, number> = {}
  const actualDelta: Record<string, number> = {}
  let startThresholds: Record<string, number> = {}
  try {
    await actFlush(400)
    startThresholds = thresholdSnapshot(hook.result.current.character, hook.result.current.gameState)
    let months = 0
    // 一个月最多几个事件，乘一个安全系数就是整局的最大步数；
    // 触到上限说明时钟推不动了，那是引擎 bug，不是局长。
    const maxSteps = maxMonths * 8
    let steps = 0
    while (steps++ < maxSteps && !hook.result.current.isGameOver) {
      const event = hook.result.current.currentEvent
      if (event) {
        const choice = pickChoice(
          event,
          hook.result.current.character,
          hook.result.current.gameState,
          policy,
          rand
        )
        if (choice) {
          accumulateDeclared(declaredDelta, choice)
          await act(async () => {
            hook.result.current.handleChoice(choice, { skipResignConfirm: true })
            await vi.advanceTimersByTimeAsync(60)
          })
          choices++
          fired.push(event.id)
          firedTurns.push(hook.result.current.gameState.turn)
          if (hook.result.current.isGameOver) {
            endEventId = hook.result.current.currentEvent?.id ?? event.id
            break
          }
        }
        // 玩家点「继 续」：先把当月剩下的待处理事件取出来，队列空了才进下月。
        // 这一步不能省 —— handleChoice **不会**清空 currentEvent，
        // 少了它就是对同一个事件连点，效果被重复计入（第一版就踩了这里，
        // 于是模拟里出现「同一个月点 8 次金榜题名」的假异常）。
        await act(async () => {
          hook.result.current.handleContinue()
          await vi.advanceTimersByTimeAsync(340)
        })
      } else {
        await act(async () => {
          hook.result.current.handleNextMonth()
          await vi.advanceTimersByTimeAsync(340)
        })
        if (hook.result.current.isGameOver) {
          endEventId = hook.result.current.currentEvent?.id ?? null
          break
        }
      }
      months = hook.result.current.gameState.turn
    }

    ended = hook.result.current.isGameOver
    finalYear = hook.result.current.gameState.currentYear
    finalRank = hook.result.current.character.rank
    finalThresholds = thresholdSnapshot(hook.result.current.character, hook.result.current.gameState)
    finalFlags = [...(hook.result.current.character.flags || [])]
    finalFaction = hook.result.current.character.faction
      ? { ...hook.result.current.character.faction }
      : null
    for (const [k, v] of Object.entries(finalThresholds)) {
      actualDelta[k] = Math.round(((v ?? 0) - (startThresholds[k] ?? 0)) * 100) / 100
    }
    badNumbers = findBadNumbers(hook.result.current.character, hook.result.current.gameState)
    if (ended && !endEventId) {
      const history = hook.result.current.eventHistory
      for (let i = history.length - 1; i >= 0; i--) {
        if (endingTileOf(history[i])) {
          endEventId = history[i]
          break
        }
      }
    }
    // endingId 存的是**图鉴格子 id**（注册 id 可能被引擎改过名），
    // endEventId 保留原始事件 id 供排查。
    const endingTile = endingTileOf(endEventId)
    if (endingTile) {
      endingId = endingTile
      endingTitle = ENDING_TITLES.get(endingTile) ?? null
    }
    outcomeMonths = months
  } catch (e) {
    error = e instanceof Error ? `${e.message}\n${e.stack?.split('\n')[1] || ''}` : String(e)
  } finally {
    hook.unmount()
    randomSpy.mockRestore()
    vi.useRealTimers()
  }

  return {
    seed,
    policy,
    months: outcomeMonths,
    choices,
    ended,
    endingId,
    endingTitle,
    firedEventIds: fired,
    firedTurns,
    badNumbers,
    finalYear,
    finalRank,
    endEventId,
    finalThresholds,
    finalFlags,
    finalFaction,
    declaredDelta,
    actualDelta,
    error
  }
}

async function actFlush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

export interface SimReport {
  games: number
  endedCount: number
  monthStats: { min: number; max: number; avg: number }
  endingsReached: Array<{ id: string; title: string | null; count: number }>
  distinctEndings: number
  distinctEventsFired: number
  /**
   * 触达过的「归零警告」危机事件（`boundary_warn_*`）。
   * 单列出来是因为这批 id 不属于 402 条内容池，混进 `distinctEventsFired`
   * 会让覆盖率虚高；而它们本身恰恰是本次要量的东西——警告到底有没有真的发生。
   */
  zeroWarningsFired: string[]
  errors: Array<{ seed: number; error: string }>
  badNumberRuns: number[]
  /**
   * ended=true 却没落在任何已注册结局上 —— 每条附终局事件、月份与八维数值。
   * 这类局要么是引擎在别处（危机、革职、油尽灯枯）提前收尾，要么是模拟器的漏洞；
   * 不做归因就只能靠猜，而本文已经为"靠猜"付过一次代价。
   */
  endedWithoutRegistry: Array<{
    seed: number
    policy: SimPolicy
    endEventId: string | null
    months: number
    year: number
    zeroed: string[]
  }>
  /** 终局那一刻恰好为 0 的维度计数，用来看「死法」的分布 */
  zeroedAtEnd: Record<string, number>
}

/** 跑一批，并把「触达率」这类只有跨局才看得出来的数字汇总出来 */
export async function simulateMany(opts: {
  count: number
  startSeed?: number
  policies?: SimPolicy[]
  maxMonths?: number
}): Promise<{ report: SimReport; runs: SimOutcome[] }> {
  const policies = opts.policies ?? ['random', 'first', 'ambitious']
  const runs: SimOutcome[] = []
  for (let i = 0; i < opts.count; i++) {
    runs.push(
      await simulateRun({
        seed: (opts.startSeed ?? 1) + i,
        policy: policies[i % policies.length],
        maxMonths: opts.maxMonths
      })
    )
  }

  const endingCounts = new Map<string, number>()
  const eventsFired = new Set<string>()
  const months: number[] = []
  const errors: SimReport['errors'] = []
  let endedCount = 0
  const badNumberRuns: number[] = []
  const endedWithoutRegistry: SimReport['endedWithoutRegistry'] = []
  const zeroedAtEnd: Record<string, number> = {}
  const zeroWarnings = new Set<string>()

  for (const r of runs) {
    if (r.error) errors.push({ seed: r.seed, error: r.error })
    if (r.badNumbers.length) badNumberRuns.push(r.seed)
    if (r.ended) endedCount++
    months.push(r.months)
    if (r.endingId) endingCounts.set(r.endingId, (endingCounts.get(r.endingId) || 0) + 1)
    for (const id of r.firedEventIds) {
      if (id.startsWith(ZERO_WARNING_EVENT_ID)) zeroWarnings.add(id)
      else eventsFired.add(id)
    }

    const zeroed = Object.entries(r.finalThresholds)
      .filter(([, v]) => v <= 0)
      .map(([k]) => k)
    for (const k of zeroed) zeroedAtEnd[k] = (zeroedAtEnd[k] || 0) + 1
    if (r.ended && !r.endingId) {
      endedWithoutRegistry.push({
        seed: r.seed,
        policy: r.policy,
        endEventId: r.endEventId,
        months: r.months,
        year: r.finalYear,
        zeroed
      })
    }
  }

  return {
    runs,
    report: {
      games: runs.length,
      endedCount,
      monthStats: {
        min: Math.min(...months),
        max: Math.max(...months),
        avg: Math.round(months.reduce((a, b) => a + b, 0) / months.length)
      },
      endingsReached: [...endingCounts.entries()]
        .map(([id, count]) => ({ id, title: ENDING_TITLES.get(id) ?? null, count }))
        .sort((a, b) => b.count - a.count),
      distinctEndings: endingCounts.size,
      distinctEventsFired: eventsFired.size,
      zeroWarningsFired: [...zeroWarnings].sort(),
      errors,
      badNumberRuns,
      endedWithoutRegistry,
      zeroedAtEnd
    }
  }
}

/** 供用例与报告脚本共用：所有已注册结局的 id */
export const allEndingIds = () => [...ENDING_TITLES.keys()]
