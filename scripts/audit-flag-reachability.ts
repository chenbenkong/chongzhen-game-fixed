import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
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
      ...(e.conditions?.flags?.some ?? [])
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

  return {
    eventCount: events.length,
    granted,
    readBy,
    writeOnly,
    unsatisfiable,
    inertNegative,
    orphanRemove: [...removed].filter(f => !granted.has(f)),
    readbackRate: granted.size === 0 ? 0 : readCount / granted.size
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
    `记忆回读率：${r.granted.size - r.writeOnly.length}/${r.granted.size} = ` +
      `${(r.readbackRate * 100).toFixed(1)}%` +
      `（口径：事件级 conditions.flags ∪ 选项级 showConditions.flags，六个子句全算）`
  )
  console.log(r.writeOnly.join(', ') || '（无）')
}
