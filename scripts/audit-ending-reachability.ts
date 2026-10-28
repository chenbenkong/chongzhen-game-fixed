import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
import { boundaryEventManager } from '../src/services/BoundaryEventManager'
import { THRESHOLD_ENDING_BY_KEY } from '../src/data/boundaryEvents'
import { DEMOTION_ENDING_ID, EXILE_ENDING_ID } from '../src/data/events/ending/endingsDemotion'
import { ZERO_THRESHOLDS, zeroWarnFlag, type ZeroKey } from '../src/data/zeroWarningEvents'
import type { BoundaryEventCheckParams } from '../src/types/boundaryEvent'
import type { FactionState } from '../src/types/game'
import type { GameEvent } from '../src/types/event'
import { scanFlagReachability } from './audit-flag-reachability'

/**
 * 结局可达性矩阵：**图鉴上每一格，都得真能走到。**
 *
 * 为什么要有这个脚本（第二十一轮，2026-10-19）：
 * 玩家报的不是某个 bug，是一句底线 ——「要确保所有的结局都能跑通」。
 * 而在此之前，这个问题只有两种回答方式，两种都不成立：
 *   - 跑局模拟（`tests/unit/helpers/simulate.ts`）：它只能说明**这六种策略**走没走到。
 *     善终要的是"道德≥80 ∧ 清议≥70 ∧ 致仕经历"这种**定向**状态，
 *     而 warden 的判据是"八维最小值最大"，它永远不会主动把某一维推到极端去撞门。
 *     于是 400 局里 ×0 的格子，分不清是"走不到"还是"没人朝它走"（§1.4 ⑮ 就卡在这一句上）。
 *   - 读条件：`conditions` 里写的键**由边界求值器解释**，而边界求值器拿到的 params
 *     只有引擎那一个对象字面量里的键（见 `buildParams` 下面那段）。
 *     数据里写 `帝心 ≥ 70`、`名望 ≥ 80` 这类**别名键**，边界路径读到的是 `undefined ?? 0`，
 *     于是门槛恒假 —— 而它长得跟"玩家没达到"一模一样。
 *
 * 所以这里做的是第三件事：**用引擎自己的 params 构造器 + 引擎自己注册的 check 函数**，
 * 给每一格反推一份"刚好够得着"的存档，然后问注册表：这份存档里命中的是哪一格。
 * 判定逻辑一行都不重写 —— 全部走 `boundaryEventManager`，它响什么这里就报什么。
 */

/** 与 `useGameEngine.ts` 的 checkBoundary / 挂载路径同构的 params（那两处各写了一遍，这里取并集） */
export function buildParams(s: DerivedState): BoundaryEventCheckParams {
  return {
    attributes: { ...s.attributes },
    gameState: {
      圣眷: s.states.圣眷,
      中官: s.states.中官,
      清议: s.states.清议,
      士绅: s.states.士绅,
      民望: s.states.民望,
      国势: s.states.国势,
      turn: s.turn
    },
    hidden: { ...s.hidden },
    faction: s.faction,
    flags: s.flags,
    currentYear: s.year,
    currentMonth: s.month,
    characterAge: s.age,
    // 时长门（conditions.flags.since）的入参。反推存档**不给**这张表 = 缺项放行，
    // 与老存档同一条容错；矩阵本来就只问"这格有没有可能被命中"，它发 flag 时
    // 从来不问那个 flag 要玩到哪一年才写得出来，所以时长在这里同样不是矩阵要回答的问题。
    // 跑局器那侧相反：derivedOf 会带上真实的落笔月份，矩阵与跑局对账时才各说各的话。
    flagTurns: s.flagTurns
  }
}

const BASE_ATTRIBUTES = ['财帛', '文韬', '理政', '武略', '体质'] as const
const BASE_HIDDEN = ['道德值', '欲望值', '野心值', '机敏值', '忠诚值'] as const
const BASE_STATES = ['圣眷', '中官', '清议', '士绅', '民望', '国势'] as const

/** 游戏的时间跨度：turn 0 = 1628-01，甲申之变 = 1644-03（turn 193），此后没有月份可推进 */
const LAST_YEAR = 1644
/**
 * 反推存档的年岁钟：1628 年开局时最常见的岁数。
 * 进士 22 / 举人 24 / 其余 16–21（`useGameEngine.ts` 的 defaultAge），取出现频率最高的 22；
 * 名字输入框允许 16–60，所以这只用于把 `conditions.age` 换算成年月，不是判据。
 */
const START_AGE = 22

/**
 * 反推出来的那份存档的形状 —— 也就是边界注册表**唯一看得见的世界**。
 *
 * 第二十五轮把它导出：`tests/unit/simulation.fugitive.test.ts` 要拿逐月的真实存档
 * 去问同一个注册表"这个月结的是哪一格"，两边必须用同一个 params 构造器，
 * 否则矩阵说"能走到"、跑局说"走不到"，永远各说各话。
 */
export type DerivedState = {
  attributes: Record<string, number>
  hidden: Record<string, number>
  states: Record<string, number>
  turn: number
  year: number
  month: number
  /** 年岁 —— `conditions.age` 读它，必须与 turn/年份同一把钟，否则矩阵与跑局各说各话 */
  age: number
  flags: string[]
  /**
   * 各段经历的落笔月份（`character.flagTurns`）—— `conditions.flags.since` 读它。
   * 反推存档可以不带（缺项按放行）；跑局器逐月抄的那一份一定带，否则矩阵与引擎对不上账。
   */
  flagTurns?: Record<string, number>
  faction: FactionState
}

function neutral(): DerivedState {
  const attributes: Record<string, number> = {}
  const hidden: Record<string, number> = {}
  const states: Record<string, number> = {}
  for (const k of BASE_ATTRIBUTES) attributes[k] = 50
  for (const k of BASE_HIDDEN) hidden[k] = 50
  for (const k of BASE_STATES) states[k] = 50
  states.国势 = 75
  return {
    attributes,
    hidden,
    states,
    turn: 120,
    year: 1638,
    month: 1,
    // 与上面那把钟对齐：1628 年开局最常见的 22 岁，玩到 turn 120（1638）就是 32 岁。
    // 取 32 而不是 70，是为了不让中性存档顺手把年龄格撞开 —— 中性就该什么都不撞。
    age: 32,
    flags: [],
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }
  }
}

export type VerdictKind =
  | 'ok'
  | 'shadowed'
  | 'custom-blocked'
  | 'no-writer'
  | 'dead-key'
  | 'window-conflict'
  | 'unregistered'
  | 'engine-driven'
  | 'ceiling-blocked'

export interface TileVerdict {
  id: string
  title: string
  /** 注册表里的优先级；未注册为 ending 边界事件的格子是 null */
  priority: number | null
  declinable: boolean
  kind: VerdictKind
  /** 反推出来的那份存档，交给排查用（也钉进测试当驱动器） */
  derived: DerivedState
  /** 命中的不是自己时，抢走它的那一格 */
  blockedBy?: string
  blockedByPriority?: number
  /** 判定用的说明：卡住的 flag / 卡住的键 / custom 的返回 */
  notes: string[]
}

/** 条件里出现、但边界的 params 根本不带的那个键（`?? 0` 之后 min 恒假） */
function deadKeysIn(e: GameEvent): string[] {
  const c = e.conditions || {}
  const out: string[] = []
  const walk = (obj: Record<string, { min?: number } | undefined> | undefined, allowed: readonly string[]) => {
    for (const [k, range] of Object.entries(obj || {})) {
      if (!allowed.includes(k) && (range?.min ?? 0) > 0) out.push(k)
    }
  }
  walk(c.attributes as Record<string, { min?: number } | undefined>, BASE_ATTRIBUTES)
  walk(c.hidden as Record<string, { min?: number } | undefined>, BASE_HIDDEN)
  walk(c.gameState as Record<string, { min?: number } | undefined>, [...BASE_STATES, 'turn'])
  return out
}

/**
 * 反推一份"刚好够得着这一格"的存档。
 *
 * 只动这一格自己要求的键，其余保持中性 —— 少动一个键，就少一格被顺带撞开的可能。
 * `min` 取 min 本身（`val < min` 才假，等于 min 就过），`max` 取 max 本身。
 */
function derive(e: GameEvent, writable: Set<string>): { state: DerivedState; notes: string[] } {
  const s = neutral()
  const notes: string[] = []
  const c = e.conditions || {}

  // 时间：落在自己的年窗里，turn 与年份保持一致（turn 0 = 1628-01）
  const yearMin = Math.max(1635, c.year?.min ?? 1635) // 编译器给叙事结局抬的地板
  const yearMax = c.year?.max
  if (yearMax !== undefined && yearMax < yearMin) {
    notes.push(`年窗自相矛盾：数据写 year.max=${yearMax}，而编译器把地板抬到 year>=1635`)
  }
  s.year = Math.min(yearMax ?? yearMin, yearMin)
  if (s.year > LAST_YEAR) notes.push(`年窗 year.min=${c.year?.min} 已超出游戏终点 ${LAST_YEAR}`)
  s.month = c.month?.min ?? 1
  s.turn = (s.year - 1628) * 12 + (s.month - 1)
  if (c.turn?.min !== undefined && s.turn < c.turn.min) s.turn = c.turn.min
  if (c.turn?.max !== undefined && s.turn > c.turn.max) {
    s.turn = c.turn.max
    s.year = 1628 + Math.floor(s.turn / 12)
    s.month = (s.turn % 12) + 1
  }

  // 年岁与年月是同一把钟：过了 START_AGE 之后每 12 个月长一岁。
  // 满足 age 门必须把整条时间线一起拨过去 —— 只改 age 不改 year，矩阵里就会出现
  // 「70 岁却还停在 1635 年」这种跑局复现不出来的存档（第二十八轮 ⑲ 的同类错位）。
  s.age = START_AGE + Math.floor(s.turn / 12)
  if (c.age?.min !== undefined && s.age < c.age.min) {
    s.turn = (c.age.min - START_AGE) * 12
    s.year = 1628 + Math.floor(s.turn / 12)
    s.month = 1
    s.age = c.age.min
    if (c.year?.max !== undefined && s.year > c.year.max) {
      notes.push(`年岁门与年窗互斥：要 ${c.age.min} 岁得活到 ${s.year} 年，而本格年窗最晚 ${c.year.max} —— 这一格没人走得到`)
    }
    if (c.turn?.max !== undefined && s.turn > c.turn.max) {
      notes.push(`年岁门要 ${c.age.min} 岁（第 ${s.turn} 月），已超出本格 turn.max=${c.turn.max}`)
    }
  }
  if (c.age?.max !== undefined && s.age > c.age.max) {
    s.turn = Math.max(0, (c.age.max - START_AGE) * 12)
    s.year = 1628 + Math.floor(s.turn / 12)
    s.month = 1
    s.age = c.age.max
    if (c.age.min !== undefined && s.age < c.age.min) {
      notes.push(`年岁区间自相矛盾：min=${c.age.min} > max=${c.age.max}（按本格的钟算不出来）`)
    }
  }

  const apply = (
    target: Record<string, number>,
    cond: Record<string, { min?: number; max?: number }> | undefined,
    allowed: readonly string[],
    label: string
  ) => {
    for (const [k, range] of Object.entries(cond || {})) {
      if (!range) continue
      if (!allowed.includes(k)) {
        notes.push(`${label}.${k} 这个键边界的 params 里没有（读成 0），min=${range.min ?? '-'} 恒假`)
        continue
      }
      if (range.min !== undefined) target[k] = Math.max(target[k], range.min)
      if (range.max !== undefined) target[k] = Math.min(target[k], range.max)
      if (target[k] < (range.min ?? 0)) {
        notes.push(`${label}.${k} 的 min=${range.min} 与 max=${range.max} 撞了`)
      }
    }
  }
  apply(s.attributes, c.attributes as never, BASE_ATTRIBUTES, 'attributes')
  apply(s.hidden, c.hidden as never, BASE_HIDDEN, 'hidden')
  apply(s.states, c.gameState as never, BASE_STATES, 'gameState')

  const f = c.flags || {}
  const negatives = new Set([...(f.notHas || []), ...(f.none || [])])
  const wanted: string[] = [...(f.has || []), ...(f.all || [])]
  const anyList = f.any || f.some || []
  if (anyList.length) {
    const pick = anyList.find(flag => writable.has(flag) && !negatives.has(flag))
    if (!pick) {
      notes.push(`门票 flag 全游戏没人写得出来：${anyList.join(' / ')}`)
    } else {
      wanted.push(pick)
    }
  }
  // minCount：凑够 N 段就过，反推只取其中写得出来的前 N 段。
  // 它与 custom 的基数判定同义，但 custom 是一个函数、反推看不见；
  // 第 62 轮把它换成 minCount 之后，这一格不再需要手写驱动器。
  const mc = f.minCount
  if (mc && mc.min > 0) {
    const pool = mc.flags.filter(flag => writable.has(flag) && !negatives.has(flag))
    if (pool.length < mc.min) {
      notes.push(`flags.minCount 要 ${mc.min} 段，写得出来的只有 ${pool.length} 段：${mc.flags.join(' / ')}`)
    } else {
      wanted.push(...pool.slice(0, mc.min))
    }
  }
  // sinceAny：这张网里最老的一段满 min 才开。反推只需把"其中一段写得出来的票"塞进存档；
  // **不**给它编落笔月份 —— 矩阵靠的是与老存档同一条容错（有票没月份 = 放行）。
  // "玩家到底攒不攒得出那么多年"不是这一层能回答的：它要的是逐月推进的真实存档，
  // 由 `simulation.*` 跑局 A/B 回答（第六十九轮的负结果就是这么撞出来的：矩阵说能走到，
  // 跑局说走不到，差的正是这份月份）。
  const sa = f.sinceAny
  if (sa) {
    const pool = (sa.flags || []).filter(flag => writable.has(flag) && !negatives.has(flag))
    if (!pool.length) {
      notes.push(`flags.sinceAny 里没有任何一段经历写得出来：${(sa.flags || []).join(' / ')}`)
    } else {
      wanted.push(pool[0])
    }
  }
  s.flags = wanted.filter(flag => !negatives.has(flag))
  return { state: s, notes }
}

export interface EndingReachabilityReport {
  tiles: TileVerdict[]
  counts: Record<VerdictKind, number>
  /** flag → 写得出它的事件（排查用；驱动表里每个 flag 都要有写手） */
  writers: Map<string, string[]>
  /** 党派数值的可达上界 —— 三条党派结局的数字门槛拿它对着量 */
  factionCeiling: FactionCeiling
}

/**
 * 手写驱动器：这一格的门槛**不在 `conditions` 里**，反推拿不到它。
 *
 * 三类，各有原因：
 *   1. 八条归零零和三条党派结局在 `boundaryEvents.ts` 里是**手写的 `check` 函数**
 *      （`conditions` 是空对象 `{}`），编译器的反推对它们无从下手。
 *   2. `ending_famous_minister` 除范围条件外还挂了一个 `custom`，
 *      要的是"八张清流门票里至少凑齐 2 张，或者手握一张宰辅/外任票"——
 *      前者是集合基数、后者是函数体里的名单，都不是 `conditions` 里的阈值。
 *      名单在 `FAMOUS_MINISTER_EXTRA_TICKETS`（第七十二轮）。
 *      （`ending_zhongxing_success` 第 62 轮已把同类基数判定换成 `flags.minCount`，
 *      反推能自己凑票，不再需要驱动器。）
 *   3. `ending_demotion` 由引擎的 `checkDemotion` 自造卡片，根本不进边界注册表。
 *
 * 驱动表写在这里而不是散在测试里，是因为它同时是**这一格의说明书**：
 * 谁改了门槛、改了门票的名字，这里就会红 —— 而不是等玩家发现图鉴上多了一格灰的。
 */
const DRIVERS: Record<string, (base: DerivedState) => DerivedState> = {
  // 八条"归零两次才要命"：过宽限期 + 该维归零 + 见过那一条警告
  ...Object.fromEntries(
    ZERO_THRESHOLDS.map(t => [
      THRESHOLD_ENDING_BY_KEY[t.key as ZeroKey],
      (base: DerivedState) => {
        const s: DerivedState = { ...base, flags: [...base.flags, zeroWarnFlag(t.key)], turn: 60, year: 1633, month: 1 }
        const target = t.group === 'gameState' ? s.states : t.group === 'hidden' ? s.hidden : s.attributes
        target[t.key] = 0
        return s
      }
    ])
  ),
  // 《东林烈士》：文本绑定甲申之变，所以年窗闸在 1644
  triggerable_faction_martyr: base => ({
    ...base,
    year: 1644,
    month: 3,
    turn: (1644 - 1628) * 12 + 2,
    flags: [...base.flags, '东林死忠'],
    states: { ...base.states, 清议: 60 },
    faction: { 东林好感: 80, 阉党好感: 0, 立场: '东林', 党争烈度: 60 }
  }),
  // 《权奸末路》：投过阉党又卖了它 —— 门票是 叛徒，而 阉党路线 必须已经摘掉
  triggerable_faction_tyrant_fall: base => ({
    ...base,
    year: 1637,
    month: 6,
    turn: (1637 - 1628) * 12 + 5,
    flags: [...base.flags.filter(f => f !== '阉党路线'), '叛徒'],
    hidden: { ...base.hidden, 道德值: 30 },
    faction: { 东林好感: 0, 阉党好感: 70, 立场: '中间', 党争烈度: 60 }
  }),
  // 《党争牺牲品》：两边都不站、两边都容不下
  triggerable_faction_sacrifice: base => ({
    ...base,
    year: 1636,
    turn: (1636 - 1628) * 12,
    faction: { 东林好感: 30, 阉党好感: 30, 立场: '未定', 党争烈度: 90 }
  }),
  // 名臣垂范：custom 要那八张清流门票里至少两张（这里走的是老口径；
  // 第七十二轮补的宰辅/外任支路由 tests/unit/ending.ticketWiring.test.ts 钉住）
  ending_famous_minister: base => ({ ...base, flags: [...base.flags, '东林党核心', '清算阉党'] })
}

/** 革职两支由引擎的降官判定自造卡片，不走边界注册表（见 endingsDemotion.ts 的注释） */
const ENGINE_DRIVEN_ENDING_IDS = new Set([DEMOTION_ENDING_ID, EXILE_ENDING_ID])

/** flag → 谁写得出它（含结局池自己），用来核对驱动表里的门票不是凭空的 */
function buildWriterIndex(): Map<string, string[]> {
  const m = new Map<string, string[]>()
  const pools: Array<[string, GameEvent[]]> = [
    ['initial', initialEvents],
    ['historical', historicalEvents],
    ['transition', transitionEvents],
    ['gray', allGrayChoiceEvents],
    ['emotion', emotionEvents],
    ['ending', allEndingEvents]
  ]
  for (const [pool, list] of pools) {
    for (const e of list) {
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) {
          const where = `${pool}:${e.id}/${c.id}`
          const cur = m.get(f)
          if (!cur) m.set(f, [where])
          else if (cur.length < 4) cur.push(where)
        }
      }
    }
  }
  return m
}

/** `归零警告·X` 由警告事件写，驱动表里的这一类门票不需要额外写手 */
const ZERO_WARN_PREFIX = '归零警告·'

/**
 * 党派数值天花板：把引擎的 faction 增量（`useGameEngine.ts` 的 handleChoice）
 * 按**全游戏能刷出这些 flag 的次数**累加一遍，看三条党派结局的数字门槛够不够得着。
 *
 * 为什么非要这一段：`DRIVERS` 里的存档是**我手填的** `党争烈度: 90`。
 * 它能证明"门槛在这个数值下会命中"，却不能证明"玩家能把烈度刷到 90"。
 * 上一轮就是栽在这句话上 —— 引擎的 faction 只认五张 flag
 * （阉党路线 / 复社成员 / 东林死忠 / 叛徒 / 两面三刀），
 * 其中四张全游戏没有写手，于是烈度只能从初值 30 涨到 38，
 * 而《党争牺牲品》要 90。格子看起来"条件齐了"，实际是一扇没有把手的门。
 *
 * 每个事件能刷几次 = 年窗月数 ÷ 该 type 的冷却 + 1；不在冷却表里的 type
 * 走 `eventHistory` 的一次性过滤，只算 1 次。这是**上界**：它不排除事件之间的竞争，
 * 所以它只能说"够不着"是死局，不能说"够得着"就一定会发生。
 */
const FACTION_DELTA: Record<string, { 东林: number; 阉党: number; 烈度: number }> = {
  阉党路线: { 东林: -15, 阉党: 20, 烈度: 10 },
  复社成员: { 东林: 20, 阉党: -15, 烈度: 8 },
  东林死忠: { 东林: 20, 阉党: -15, 烈度: 8 },
  两面三刀: { 东林: 0, 阉党: 0, 烈度: 5 },
  主和派: { 东林: -10, 阉党: 10, 烈度: 0 }
}

/** 与 `useGameEngine.ts` 的 `EVENT_COOLDOWN_MONTHS` 同一张表（引擎那份是模块私有的，改这里要同步改那里） */
const COOLDOWN: Record<string, number> = {
  random: 8,
  gray: 6,
  character: 6,
  national: 6,
  faction: 6,
  emotion: 12
}

function maxFires(e: GameEvent): number {
  const gap = COOLDOWN[e.type ?? ''] ?? 0
  if (gap <= 0) return 1
  const lo = e.conditions?.year?.min ?? 1628
  const hi = Math.min(e.conditions?.year?.max ?? LAST_YEAR, LAST_YEAR)
  const months = Math.max(0, (hi - lo + 1) * 12)
  return Math.floor(months / gap) + 1
}

export interface FactionCeiling {
  烈度上限: number
  东林上限: number
  阉党上限: number
  /** 每张门票 flag → 全游戏累计能刷的次数与出处（排查用） */
  perFlag: Array<{ flag: string; fires: number; sources: string[] }>
}

export function factionCeiling(pools: GameEvent[]): FactionCeiling {
  let 东林 = 50
  let 阉党 = 50
  let 烈度 = 30
  const byFlag = new Map<string, { fires: number; sources: string[] }>()

  for (const e of pools) {
    const fires = maxFires(e)
    for (const c of e.choices ?? []) {
      for (const flag of c.effects?.flags?.add ?? []) {
        const d = FACTION_DELTA[flag]
        if (!d) continue
        东林 = Math.min(100, Math.max(0, 东林 + d.东林 * fires))
        阉党 = Math.min(100, Math.max(0, 阉党 + d.阉党 * fires))
        烈度 = Math.min(100, 烈度 + d.烈度 * fires)
        const cur = byFlag.get(flag) ?? { fires: 0, sources: [] }
        cur.fires += fires
        if (cur.sources.length < 3) cur.sources.push(`${e.id}/${c.id}×${fires}`)
        byFlag.set(flag, cur)
      }
    }
  }
  return {
    烈度上限: 烈度,
    东林上限: 东林,
    阉党上限: 阉党,
    perFlag: [...byFlag.entries()]
      .map(([flag, v]) => ({ flag, fires: v.fires, sources: v.sources }))
      .sort((a, b) => b.fires - a.fires)
  }
}

export function scanEndingReachability(): EndingReachabilityReport {
  // 写手表要连结局池一起扫：门票若"只有某个结局事件自己会写"，那它就不是玩家走得出来的路。
  const flagReport = scanFlagReachability()
  const writable = flagReport.granted
  const ceiling = factionCeiling([
    ...initialEvents,
    ...allGrayChoiceEvents,
    ...allEndingEvents
  ])
  const registered = Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending')
  const byId = new Map(registered.map(r => [r.event.id, r]))

  const tiles: TileVerdict[] = allEndingEvents.map(tile => {
    const entry = byId.get(tile.id) ?? null
    const derived = derive(tile, writable)
    // `DRIVERS` 是稀疏表：绝大多数格子靠数据自己的条件反推，只有手写 check / custom
    // 那十四格需要本文件递一份存档。`Record<string, fn>` 的索引类型里没有 undefined
    // （本仓库没开 noUncheckedIndexedAccess），运行时却真的是 undefined，所以这里断言一次，
    // 让下面两处 `drive ?` / `!drive` 判的是同一件事。
    const drive = DRIVERS[tile.id] as ((base: DerivedState) => DerivedState) | undefined
    const state = drive ? drive(derived.state) : derived.state
    const notes = drive ? [...derived.notes, '门槛是手写 check / custom，由本文件的驱动表提供存档'] : derived.notes
    const base = {
      id: tile.id,
      title: tile.title,
      priority: entry?.priority ?? null,
      declinable: !!tile.declinable,
      derived: state,
      notes
    }

    if (ENGINE_DRIVEN_ENDING_IDS.has(tile.id)) {
      return { ...base, kind: 'engine-driven', notes: [...notes, '不进边界注册表：由 useGameEngine 的降官判定自造卡片'] }
    }
    if (!entry) {
      return { ...base, kind: 'unregistered', notes: [...notes, '不在 BoundaryEventManager 的 ending 注册表里'] }
    }
    /**
     * 门票必须有写手 —— **对驱动表里的格子更要查**。
     *
     * 手写 `check` 放开了一扇门，而门后面那段经历全游戏没人发得出来的话，
     * 这一格照样是死的；`derive` 只认 `conditions.flags`，看不到驱动表塞进去的 flag。
     * 所以这里不加 `&& !drive`：谁提供的存档都不重要，重要的是玩家能不能把它带上身。
     */
    const unwritable = state.flags.filter(f => !writable.has(f) && !f.startsWith(ZERO_WARN_PREFIX))
    if (unwritable.length) {
      return { ...base, kind: 'no-writer', notes: [...notes, `门票 flag 全游戏没人写得出来：${unwritable.join(' / ')}`] }
    }
    const dead = deadKeysIn(tile)
    if (dead.length) {
      return { ...base, kind: 'dead-key', notes: [...notes, `条件用了边界不带的键：${dead.join(' / ')}`] }
    }
    if (notes.some(n => n.startsWith('年窗'))) {
      return { ...base, kind: 'window-conflict', notes }
    }
    /**
     * 数字门槛也要能被**玩法**满足，不只是能被驱动表手填出来。
     *
     * `党争烈度` 是这里唯一一把纯 flag 的尺（引擎里除五张门票flag没有第二个写入口），
     * 所以拿它的上界去卡驱动表填的数：手填 90 而全游戏最多刷到 38，这一格就是死的。
     * 好感两维还另有 清议／中官 通道，本函数量不到，故不在此处设卡。
     */
    if (state.faction.党争烈度 > ceiling.烈度上限) {
      return {
        ...base,
        kind: 'ceiling-blocked',
        notes: [
          ...notes,
          `驱动表要 党争烈度=${state.faction.党争烈度}，而全游戏按门票 flag 最多刷到 ${ceiling.烈度上限}` +
            `（门票写手：${ceiling.perFlag.map(p => `${p.flag}${p.fires}次`).join(' / ') || '无'}）`
        ]
      }
    }

    const params = buildParams(state)
    if (!entry.check(params)) {
      if (typeof tile.conditions?.custom !== 'function' && !drive) {
        return { ...base, kind: 'custom-blocked', notes: [...notes, 'compiled check 判假，而它没有 custom —— 反推的存档没凑齐条件'] }
      }
      return { ...base, kind: 'custom-blocked', notes: [...notes, '驱动器给出的存档仍没让门槛成立 —— 门槛被改过，驱动表要跟着改'] }
    }

    const winner = boundaryEventManager.checkByType(params, 'ending')
    if (winner && winner.event.id !== tile.id) {
      return {
        ...base,
        kind: 'shadowed',
        blockedBy: winner.event.id,
        blockedByPriority: winner.priority,
        notes: [...notes, `这一格自己成立，但 priority ${winner.priority} 的《${winner.event.title}》先命中`]
      }
    }
    return { ...base, kind: 'ok', notes }
  })

  const counts = tiles.reduce<Record<string, number>>((acc, t) => {
    acc[t.kind] = (acc[t.kind] || 0) + 1
    return acc
  }, {})
  return {
    tiles,
    counts: counts as Record<VerdictKind, number>,
    writers: buildWriterIndex(),
    factionCeiling: ceiling
  }
}

if (!process.env.VITEST) {
  const r = scanEndingReachability()
  const order: VerdictKind[] = [
    'ok',
    'engine-driven',
    'shadowed',
    'no-writer',
    'ceiling-blocked',
    'dead-key',
    'window-conflict',
    'custom-blocked',
    'unregistered'
  ]
  console.log(`图鉴格子 ${r.tiles.length} 个：` + order.map(k => `${k} ${r.counts[k] ?? 0}`).join(' · '))
  console.log(
    `\n党争烈度上限 ${r.factionCeiling.烈度上限}（初值 30）· ` +
      `门票 flag 写手：` +
      (r.factionCeiling.perFlag.map(p => `${p.flag}×${p.fires} [${p.sources.join(', ')}]`).join('\n  ') || '无')
  )
  for (const kind of order) {
    const list = r.tiles.filter(t => t.kind === kind)
    if (!list.length) continue
    console.log(`\n=== ${kind}（${list.length}）===`)
    for (const t of list) {
      console.log(
        `  [${String(t.priority).padStart(4)}] ${t.id} 《${t.title}》${t.declinable ? ' 请笔' : ''}` +
          (t.blockedBy ? ` ← 被 ${t.blockedBy}(p${t.blockedByPriority}) 抢走` : '')
      )
      for (const n of t.notes) console.log(`        · ${n}`)
    }
  }
}
