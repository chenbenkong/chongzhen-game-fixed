import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
import { FAMOUS_MINISTER_EXTRA_TICKETS } from '../src/data/events/ending/endings_all'
import { FLAG_MEMOIRS } from '../src/data/flagBiography'
import { GameEvent } from '../src/types/event'

/**
 * flag（经历）的**读写对账**：哪些经历写进玩家身上之后再没人读，
 * 哪些门槛要求一段全游戏根本没人写得出的经历。
 *
 * 导出 `scanFlagReachability()`，CLI 与测试同一口径（`if (!process.env.VITEST)`）。
 * 「记忆回读率」这个数第十五轮起被钉进 CI（`tests/unit/audit.flagReachability.test.ts`），
 * 所以口径必须写在代码里而不是记在文档里 —— 换口径要改这里，改这里测试会响。
 */

const pools: Array<[string, GameEvent[]]> = [
  ['initialEvents', initialEvents],
  ['historical', historicalEvents],
  ['transition', transitionEvents],
  ['gray', allGrayChoiceEvents],
  ['ending', allEndingEvents],
  ['emotion', emotionEvents]
]

/** 六个 flag 子句，与 `checkEventConditions` / `checkChoiceRequirement` 的读法一一对应 */
const FLAG_CLAUSES = ['has', 'all', 'some', 'notHas', 'none', 'any'] as const

/** 引擎在 `handlePromotion` 里硬写的一个 flag，不在任何 effects 里 */
const ENGINE_WRITTEN_FLAGS = ['地方官任职']

export interface FlagReachabilityReport {
  eventCount: number
  /** 全游戏写得出（某个选项 `effects.flags.add`）的经历 */
  granted: Set<string>
  /** 被某处门槛引用过的经历 → 引用点（最多记 3 处，仅供排查） */
  readBy: Map<string, string[]>
  /** 写得出来、但全游戏没有一处门槛引用（只写不读 = 玩家那次抉择等于没发生） */
  writeOnly: string[]
  /** 要求一段写不出来的经历，因此永远选不中的事件 */
  unsatisfiable: string[]
  /** 被某处 `flags.remove` 清掉、却从没有人写过的经历 */
  orphanRemove: string[]
  /**
   * 「假门槛」：负面子句（`notHas` / `none`）引用了一段全游戏没人写得出来的经历。
   *
   * 它不会让事件消失（正面子句那一半由 `unsatisfiable` 管），它只是**恒真**：
   * 「只要你没被抄过家就走这条路」，而抄家这件事在这游戏里根本不会发生。
   * 对一款讲后果的游戏，这种门槛是装饰 —— 要么给它一个写入口，要么删掉它。
   */
  inertNegative: string[]
  /** 写得出来**且**被读过的那部分占全部可写经历的比例，0..1 */
  readbackRate: number
  /**
   * 第十六轮加的**第二把尺子**，不要和上面那把混起来：
   *
   * `writeOnly` 只算门槛读者，量的是"这段经历有没有改变玩法"；
   * 履历表（`src/data/flagBiography.ts`）让一部分只写不读的经历**至少被玩家看见**，
   * 那是可见性，不是因果。所以 `writeOnly` 的口径一个字都没动 ——
   * 想给"看得见"记功，记在下面这两个数上，别去改上面那把尺子。
   */
  /** 上了履历表的经历（玩家结算时看得见） */
  memoirized: string[]
  /** 履历表里写了、但全游戏没人写得出来的 flag —— 那段文案永远显不出来 */
  deadMemoirs: string[]
  /** 既没有门槛读、又没上履历：对玩家等于没发生 */
  invisible: string[]
  /** 玩家看得见（被门槛读 ∪ 上履历）占全部可写经历的比例，0..1 */
  visibilityRate: number
}

export function scanFlagReachability(
  events: GameEvent[] = (() => {
    const m = new Map<string, GameEvent>()
    for (const [, list] of pools) for (const e of list) if (!m.has(e.id)) m.set(e.id, e)
    return [...m.values()]
  })()
): FlagReachabilityReport {
  const granted = new Set<string>()
  const removed = new Set<string>()
  for (const e of events) {
    for (const c of e.choices ?? []) {
      for (const f of c.effects?.flags?.add ?? []) granted.add(f)
      for (const f of c.effects?.flags?.remove ?? []) removed.add(f)
    }
  }
  for (const f of ENGINE_WRITTEN_FLAGS) granted.add(f)

  /**
   * 「读过这个 flag」的判据 —— 事件级 `conditions.flags` 与选项级 `showConditions.flags`
   * 两处都要算，缺一个就会把第十五轮接的因果全看成死的。
   *
   * 这一轮之前只能看事件级：选项上那六个子句全是死字，`checkChoiceRequirement`
   * 里只有一行「简化处理，假设所有 flag 都满足」的桩，所以"有人读了它"这件事
   * 只可能发生在事件级。现在两处都是真门槛，两处都算读。
   *
   * 六个子句全算，包括 `notHas` / `none` —— 「因为你没有它才放出这条路」同样是读，
   * 而且这一轮真用了它（`faction_events.ts` 的 notHas 门与 echo_imperial_004）。
   */
  const readBy = new Map<string, string[]>()
  const noteRead = (flag: string, where: string): void => {
    const list = readBy.get(flag)
    if (!list) readBy.set(flag, [where])
    else if (list.length < 3) list.push(where)
  }
  for (const e of events) {
    const groups: Array<[string, any]> = [
      [`${e.id} 事件级`, e.conditions?.flags],
      ...(e.choices ?? []).map(
        c => [`${e.id}/${c.id} 选项级`, c.showConditions?.flags] as [string, any]
      )
    ]
    for (const [where, f] of groups) {
      if (!f) continue
      for (const clause of FLAG_CLAUSES) {
        for (const flag of f[clause] ?? []) noteRead(flag, where)
      }
      // minCount 的经历名在对象里，不在数组槽上 —— 与 since 同理，上面的循环扫不到。
      for (const flag of f.minCount?.flags ?? []) noteRead(flag, where)
      // `since` 的经历名是**键**而不是数组元素，上面那个循环扫不到它。
      // 第五十四轮起它是一道真门（checkEventConditions / checkChoiceRequirement 都读），
      // 不扫就会把"只靠孩子几岁开门"的经历错报成没人读。
      for (const flag of Object.keys(f.since ?? {})) noteRead(flag, where)
      // `sinceAny` 的经历名同样在对象里（flags 数组），上面两个循环都扫不到。
      for (const flag of f.sinceAny?.flags ?? []) noteRead(flag, where)
    }
  }

  // 《名臣垂范》的第二支凭据写在 `custom` 函数体里，上面那圈条件扫描看不见（第七十二轮）。
  // 名单由数据文件导出，这里按"被这一格读到"记一笔 —— 与 custom 读的是同一份常量，
  // 不会出现"体检说有读者、函数其实没读"的漂移。只在这份事件集里真有那一格时才记，
  // 免得夹具事件集把这三张票误算成"被读过"。
  if (events.some(e => e.id === 'ending_famous_minister')) {
    for (const flag of FAMOUS_MINISTER_EXTRA_TICKETS) {
      noteRead(flag, 'ending_famous_minister/custom')
    }
  }

  // 「要求一段全游戏写不出来的经历」只看事件级：选项级那一半是
  // `audit-choice-lockout.ts` 的 DEAD_OPTION（同一件事，两处规则会漂移，故不重复）。
  const unsatisfiable: string[] = []
  const inertNegative: string[] = []
  for (const e of events) {
    const need = [
      ...(e.conditions?.flags?.has ?? []),
      ...(e.conditions?.flags?.all ?? []),
      ...(e.conditions?.flags?.some ?? []),
      // since 的语义是"有这段经历、且它落笔已满 N 月"——经历本身写不出来，门同样永不开。
      ...Object.keys(e.conditions?.flags?.since ?? {})
    ]
    const missing = need.filter(f => !granted.has(f))
    const anyList = e.conditions?.flags?.any ?? []
    const anyDead = anyList.length > 0 && !anyList.some(f => granted.has(f))
    if (anyDead) {
      unsatisfiable.push(
        `${e.type.padEnd(10)} ${e.id.padEnd(34)} 「${(e.title || '').slice(0, 18)}」  any 里没有任何一段经历写得出来: ${anyList.join(', ')}`
      )
    }
    if (missing.length) {
      unsatisfiable.push(
        `${e.type.padEnd(10)} ${e.id.padEnd(34)} 「${(e.title || '').slice(0, 18)}」  需要永不存在的 flag: ${missing.join(', ')}`
      )
    }
    // minCount 是"正门"，但只要求其中 N 段：全库写得出来的段数都凑不够 N 时，
    // 这道门与"需要一段永不存在的经历"一样恒假。不能把整张名单塞进 need（那会误报）。
    const mc = e.conditions?.flags?.minCount
    if (mc && mc.min > 0) {
      const reachable = mc.flags.filter(f => granted.has(f)).length
      if (reachable < mc.min) {
        unsatisfiable.push(
          `${e.type.padEnd(10)} ${e.id.padEnd(34)} 「${(e.title || '').slice(0, 18)}」  minCount 要 ${mc.min} 段，全库写得出来的只有 ${reachable} 段: ${mc.flags.join(', ')}`
        )
      }
    }
    // sinceAny 也是"正门"，且只要一段：名单里一段都写不出来时，这道门与
    // "需要一段永不存在的经历"一样恒假（它读的是落笔月份，票本身写不出来就永远没有月份）。
    const sa = e.conditions?.flags?.sinceAny
    if (sa && sa.flags?.length && !sa.flags.some(f => granted.has(f))) {
      unsatisfiable.push(
        `${e.type.padEnd(10)} ${e.id.padEnd(34)} 「${(e.title || '').slice(0, 18)}」  sinceAny 里没有任何一段经历写得出来: ${sa.flags.join(', ')}`
      )
    }
    for (const clause of ['notHas', 'none'] as const) {
      for (const f of e.conditions?.flags?.[clause] ?? []) {
        if (!granted.has(f)) inertNegative.push(`${e.id} 事件级.${clause} 「${f}」`)
      }
      for (const c of e.choices ?? []) {
        for (const f of c.showConditions?.flags?.[clause] ?? []) {
          if (!granted.has(f)) inertNegative.push(`${e.id}/${c.id} 选项级.${clause} 「${f}」`)
        }
      }
    }
  }

  const writeOnly = [...granted].filter(f => !readBy.has(f))
  const readCount = granted.size - writeOnly.length

  const memoirKeys = Object.keys(FLAG_MEMOIRS)
  const memoirSet = new Set(memoirKeys)
  const invisible = writeOnly.filter(f => !memoirSet.has(f))

  return {
    eventCount: events.length,
    granted,
    readBy,
    writeOnly,
    unsatisfiable,
    inertNegative,
    orphanRemove: [...removed].filter(f => !granted.has(f)),
    readbackRate: granted.size === 0 ? 0 : readCount / granted.size,
    memoirized: memoirKeys.filter(f => granted.has(f)),
    deadMemoirs: memoirKeys.filter(f => !granted.has(f)),
    invisible,
    visibilityRate: granted.size === 0 ? 0 : (granted.size - invisible.length) / granted.size
  }
}

if (!process.env.VITEST) {
  const r = scanFlagReachability()
  console.log(`事件总数（去重）: ${r.eventCount}`)
  console.log(`可获得的 flag: ${r.granted.size}`)
  console.log(`被门槛引用的 flag: ${r.granted.size - r.writeOnly.length}\n`)

  console.log(`=== 因 flag 前置条件永不可满足而永远选不中的事件：${r.unsatisfiable.length} 个 ===`)
  r.unsatisfiable.slice(0, 60).forEach(l => console.log(l))

  console.log(`\n=== 被 remove 但从未被 add 的 flag：${r.orphanRemove.length} 个 ===`)
  console.log(r.orphanRemove.join(', ') || '（无）')

  console.log(`\n=== 假门槛（负面子句引用了全游戏没人写得出的经历）：${r.inertNegative.length} 处 ===`)
  r.inertNegative.forEach(l => console.log(`  ${l}`))

  console.log(`\n=== 被 add 但没有任何门槛引用的 flag（白存）：${r.writeOnly.length} 个 ===`)
  console.log(
    `玩法回读率：${r.granted.size - r.writeOnly.length}/${r.granted.size} = ` +
      `${(r.readbackRate * 100).toFixed(1)}%` +
      `（口径：事件级 conditions.flags ∪ 选项级 showConditions.flags，六个子句全算）`
  )
  console.log(`\n=== 玩家可见性（第十六轮的第二把尺子）===`)
  console.log(
    `  上了履历表：${r.memoirized.length} 条；玩家看得见（门槛读 ∪ 履历）= ` +
      `${(r.visibilityRate * 100).toFixed(1)}%`
  )
  console.log(
    `  既没门槛读、又没上履历（对玩家等于没发生）：${r.invisible.length} 个` +
      (r.deadMemoirs.length
        ? `\n  履历表里的死文案（全游戏写不出这段经历）：${r.deadMemoirs.join(', ')}`
        : `\n  履历表没有死文案`)
  )
  console.log(r.invisible.join(', ') || '（无）')
}
