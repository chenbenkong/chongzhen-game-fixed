// 事件条件检查工具
// 消除 GameScreen.tsx 中 findAvailableEvent / findAvailableEventWithState / findAllEventsForState 的重复条件检查代码

import { GameEvent } from '../types/event'
import { GameStateValues, Attributes, HiddenAttributes, OriginType } from '../types/game'
import { ATTR_MAP, STATE_MAP } from './constants'

type Range = { min?: number; max?: number }

/**
 * 检查单个事件的所有条件是否满足
 * @param event 事件对象
 * @param character 角色（提供 attributes / hidden / flags / origin）
 * @param state 状态（提供 currentYear / currentMonth 以及 gameState.* 字段）
 */
export function checkEventConditions(
  event: GameEvent,
  character: {
    attributes: Attributes
    hidden: HiddenAttributes
    flags: string[]
    origin: OriginType
    /** 当前官阶，用于 conditions.rank 判定 */
    rank?: string
  },
  state: GameStateValues
): boolean {
  const cond = event.conditions || {}
  if (!cond) return true

  // 年份
  if (cond.year) {
    if (cond.year.min !== undefined && state.currentYear < cond.year.min) return false
    if (cond.year.max !== undefined && state.currentYear > cond.year.max) return false
  }

  // 月份
  if (cond.month) {
    if (cond.month.min !== undefined && state.currentMonth < cond.month.min) return false
    if (cond.month.max !== undefined && state.currentMonth > cond.month.max) return false
  }

  // 游戏月数（开局多久）
  if (cond.turn) {
    if (cond.turn.min !== undefined && state.turn < cond.turn.min) return false
    if (cond.turn.max !== undefined && state.turn > cond.turn.max) return false
  }

  // 公开属性
  if (cond.attributes) {
    for (const [key, range] of Object.entries(cond.attributes)) {
      const mappedKey = ATTR_MAP[key] || key
      const attrKey = mappedKey as keyof Attributes
      const value = character.attributes[attrKey] || 0
      const r = range as Range
      if (r.min !== undefined && value < r.min) return false
      if (r.max !== undefined && value > r.max) return false
    }
  }

  // 隐藏属性
  if (cond.hidden) {
    for (const [key, range] of Object.entries(cond.hidden)) {
      const hiddenKey = key as keyof HiddenAttributes
      const value = character.hidden[hiddenKey]
      if (value === undefined) return false
      const r = range as Range
      if (r.min !== undefined && value < r.min) return false
      if (r.max !== undefined && value > r.max) return false
    }
  }

  // 五方态度。时间键不在这里判：类型上 StateKey 已经不含 currentYear/currentMonth/turn，
  // 年份/月份/月数走 cond.year / cond.month / cond.turn。
  // 下面这行 continue 只为一件事：旧存档里可能还留着把 turn 塞进 gameState 的写法，
  // 那时**跳过**比"按 0 判定、把事件永久否决"要安全（boundaryEventCompiler 那边才真的读它）。
  if (cond.gameState) {
    for (const [key, range] of Object.entries(cond.gameState)) {
      const mappedKey = STATE_MAP[key] || key
      if (mappedKey === 'currentYear' || mappedKey === 'currentMonth' || mappedKey === 'turn') continue
      const stateKey = mappedKey as keyof GameStateValues
      const value = state[stateKey] as number
      const r = range as Range
      if (r.min !== undefined && value < r.min) return false
      if (r.max !== undefined && value > r.max) return false
    }
  }

  // 出身限制
  if (cond.origin) {
    const allowed = Array.isArray(cond.origin) ? cond.origin : [cond.origin]
    if (!allowed.includes(character.origin)) return false
  }

  // 官阶限制
  // cond.rank 一直在 EventConditions 里声明，但此前从未被检查 —— 所有
  // 「限定某官阶才触发」的事件实际上对任何官阶都开放。
  if (cond.rank) {
    const allowedRanks = Array.isArray(cond.rank) ? cond.rank : [cond.rank]
    const currentRank = character.rank
    if (!currentRank || !allowedRanks.includes(currentRank)) return false
  }

  // 标志位
  // 注意：数据里实际在用的有 has / notHas / any 三种（any 被 30 处引用，
  // 另有 2 处写成了大写 ALL）。此前只实现了 has / notHas，
  // 于是所有 any 条件被静默忽略 —— 事件的触发前提形同虚设。
  if (cond.flags) {
    const own = character.flags
    if (cond.flags.has?.some((f: string) => !own.includes(f))) return false
    if (cond.flags.notHas?.some((f: string) => own.includes(f))) return false

    // any / some：至少命中一个（两个键等价，some 是历史别名）
    const anyList = cond.flags.any ?? cond.flags.some
    if (anyList && anyList.length > 0 && !anyList.some((f: string) => own.includes(f))) return false

    // none：一个都不能有
    if (cond.flags.none && cond.flags.none.some((f: string) => own.includes(f))) return false

    // all：必须全部具备
    if (cond.flags.all && cond.flags.all.some((f: string) => !own.includes(f))) return false

    // 容错：数据里存在大写 ALL 的写法（2 处），按 all 语义处理
    const upperAll = (cond.flags as { ALL?: string[] }).ALL
    if (upperAll && upperAll.some((f: string) => !own.includes(f))) return false
  }

  // 概率门。
  //
  // 这里原来写的是 `cond.random < 1` 才生效，把值当成 0-1 的小数；
  // 而数据侧（以及 boundaryEventCompiler 的同一条判定）用的是**百分数**，
  // 例如 transition/1638.ts 的 `random: 25` 配注释「每月 25% 概率触发」。
  // 25 不满足 `< 1`，于是这道门被整个跳过 —— 该事件在满足其余条件的每个月都必然触发，
  // 频率是设计值的 4 倍。两种写法都支持：>1 按百分数，<=1 按小数。
  if (typeof cond.random === 'number' && Number.isFinite(cond.random)) {
    const probability = cond.random > 1 ? cond.random / 100 : cond.random
    if (probability < 1 && Math.random() >= probability) return false
  }

  return true
}

/**
 * 从可用事件池中按"主优先"策略随机挑选 1 个事件
 * 策略：
 *  1. 30% 概率命中支线（emotion / gray），避免支线永远不出现
 *  2. 否则优先 historical（每个只触发一次）
 *  3. 然后 transition（每个只触发一次）
 *  4. 然后 random（可重复）
 *  5. 最后 normal（每个只触发一次）
 *
 * 剧情线加权（v3 新增）：
 *  - 如果传入了 currentStoryline，则在每个 tier 内对同 storyline 的事件加权 4 倍
 *  - 如果上一事件的 nextEvents 列表里有当前可用事件，则 100% 命中第一个匹配项
 */
export function pickEvent(
  availableEvents: GameEvent[],
  eventHistory: string[],
  currentStoryline?: string
): GameEvent | null {
  if (availableEvents.length === 0) return null

  // 已触发事件集合。
  //
  // 改造前每个 tier 都用 `eventHistory.includes(e.id)` 判重。eventHistory 一局下来
  // 能涨到 200+ 项，availableEvents 常有上千项，于是这一步是 O(n×m) 的字符串比较 ——
  // 单次推进月份要做几万到几十万次比较，而这正是玩家感知到的"卡"，
  // 且随存档变老**越来越卡**（历史越长越慢）。
  // 换成 Set 后是 O(n+m)，与历史长度基本无关。
  // 语义完全一致（Array#includes 用 SameValueZero，Set#has 亦然）。
  const seen = new Set(eventHistory)

  // 加权抽样：构造一个 weight 数组，按 storyline 命中次数加权
  const weightedPick = (pool: GameEvent[]): GameEvent => {
    if (pool.length === 1) return pool[0]
    const weights = pool.map(e => {
      if (!currentStoryline) return 1
      // 同 storyline 加权 4 倍
      if (e.storyline && e.storyline === currentStoryline) return 4
      // 同 key 前缀 storyline 加权 2 倍（兼容子线）
      return 1
    })
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) return pool[i]
    }
    return pool[pool.length - 1]
  }

  // 1) 支线触发窗口
  const branchEvents = availableEvents.filter(e => e.type === 'emotion' || e.type === 'gray')
  if (branchEvents.length > 0 && Math.random() < 0.3) {
    // 注意语义：这里排除的是「最近 5 条历史里出现过的」，不是「历史上出现过的一切」。
    // 支线事件是可重复的（玩家会反复遇到同一段感情/权色事件），
    // 所以不能用上面的 seen 集合，否则支线会被永久耗尽。
    const recent = new Set(eventHistory.slice(-5))
    const notRecent = branchEvents.filter(e => !recent.has(e.id))
    const pool = notRecent.length > 0 ? notRecent : branchEvents
    return weightedPick(pool)
  }

  // 2) historical
  const historical = availableEvents.filter(e => e.type === 'historical' && !seen.has(e.id))
  if (historical.length > 0) {
    return weightedPick(historical)
  }

  // 3) transition
  const transition = availableEvents.filter(e => e.type === 'transition' && !seen.has(e.id))
  if (transition.length > 0) {
    return weightedPick(transition)
  }

  // 4) random（包含 emotion/gray 兜底）
  const random = availableEvents.filter(e => e.type === 'random' || e.type === 'emotion' || e.type === 'gray')
  if (random.length > 0) {
    // 同上：只看最近 5 条，random 类事件设计上就是可重复的
    const recent = new Set(eventHistory.slice(-5))
    const notRecent = random.filter(e => !recent.has(e.id))
    const pool = notRecent.length > 0 ? notRecent : random
    return weightedPick(pool)
  }

  // 5) normal
  const normal = availableEvents.filter(e => e.type === 'normal' && !seen.has(e.id))
  if (normal.length > 0) {
    return weightedPick(normal)
  }

  return null
}
