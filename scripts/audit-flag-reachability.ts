import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
import { GameEvent } from '../src/types/event'

const pools: Array<[string, GameEvent[]]> = [
  ['initialEvents', initialEvents],
  ['historical', historicalEvents],
  ['transition', transitionEvents],
  ['gray', allGrayChoiceEvents],
  ['ending', allEndingEvents],
  ['emotion', emotionEvents]
]

const all = new Map<string, GameEvent>()
for (const [, list] of pools) for (const e of list) if (!all.has(e.id)) all.set(e.id, e)

const granted = new Set<string>()
const removed = new Set<string>()
for (const e of all.values()) {
  for (const c of e.choices ?? []) {
    for (const f of c.effects?.flags?.add ?? []) granted.add(f)
    for (const f of c.effects?.flags?.remove ?? []) removed.add(f)
  }
}

// 引擎/数据侧硬编码写入的 flag
granted.add('地方官任职')

console.log(`事件总数（去重）: ${all.size}`)
console.log(`可获得的 flag: ${granted.size}`)
console.log(`被引用的 flag: ${removed.size}\n`)

const dead: string[] = []
for (const e of all.values()) {
  const need = [
    ...(e.conditions?.flags?.has ?? []),
    ...(e.conditions?.flags?.all ?? []),
    ...(e.conditions?.flags?.some ?? [])
  ]
  const missing = need.filter(f => !granted.has(f))
  if (missing.length) {
    dead.push(`${e.type.padEnd(10)} ${e.id.padEnd(34)} 「${(e.title || '').slice(0, 18)}」  需要永不存在的 flag: ${missing.join(', ')}`)
  }
}
console.log(`=== 因 flag 前置条件永不可满足而永远选不中的事件：${dead.length} 个 ===`)
dead.slice(0, 60).forEach(l => console.log(l))

const orphanRemove = [...removed].filter(f => !granted.has(f))
console.log(`\n=== 被 remove 但从未被 add 的 flag：${orphanRemove.length} 个 ===`)
console.log(orphanRemove.join(', ') || '（无）')

const unusedGrant = [...granted].filter(f => ![...all.values()].some(e => {
  const c = e.conditions?.flags
  return c && ([...(c.has ?? []), ...(c.all ?? []), ...(c.some ?? []), ...(c.notHas ?? []), ...(c.none ?? []), ...(c.any ?? [])].includes(f))
}))
console.log(`\n=== 被 add 但没有任何事件条件引用的 flag（白存）：${unusedGrant.length} 个 ===`)
console.log(unusedGrant.join(', ') || '（无）')
