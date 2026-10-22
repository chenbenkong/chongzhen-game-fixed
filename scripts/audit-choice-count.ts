/**
 * 选项数体检（第四十五轮）。
 *
 * 口径：**可玩事件**的 `choices` 必须为 3–4 条，锁定卡也算在内 —— 玩家打开事件面板时
 * 看到的就是这几行，少于 3 行没有取舍，多于 4 行读不完。
 *
 * 结局卡不受**下限 3** 约束：它们由 `GameOverScreen` 作为终局场景整卡渲染，`choices`
 * 不进入事件面板（`EventDisplay` 那套"可点 / 灰掉 / 锁"的列表只服务可玩事件），
 * 1 项的结局卡是终局场景，不是"只有一个选项的事件"。上限 4 仍照管 ——
 * 结局卡要是长出第 5 行，同样该有人看一眼。
 *
 * 输出既是 CLI 报告，也是 `tests/unit/audit.choiceCount.test.ts` 的棘轮。
 */
import { allEvents } from './event-pools'
import { allEndingEvents } from '../src/data/events/ending'

export interface ChoiceCountRow {
  id: string
  title: string
  type: string
  count: number
}

export interface ChoiceCountReport {
  total: number
  playable: number
  endingCards: number
  below: ChoiceCountRow[]
  above: ChoiceCountRow[]
  endingAbove: ChoiceCountRow[]
  endingCounts: Array<{ count: number; n: number }>
}

const ENDING_IDS = new Set(allEndingEvents.map(e => e.id))

export const isEndingCard = (e: { id: string; type?: string }) =>
  ENDING_IDS.has(e.id) || e.type === 'ending'

export function scanChoiceCounts(): ChoiceCountReport {
  const seen = new Map<string, any>()
  for (const e of allEvents) if (e?.id && !seen.has(e.id)) seen.set(e.id, e)

  const rows = [...seen.values()].map(e => ({
    e,
    count: e.choices?.length ?? 0
  }))
  const playable = rows.filter(r => !isEndingCard(r.e))
  const ending = rows.filter(r => isEndingCard(r.e))

  const toRow = (r: { e: any; count: number }): ChoiceCountRow => ({
    id: r.e.id,
    title: r.e.title,
    type: r.e.type,
    count: r.count
  })

  const counts = new Map<number, number>()
  for (const r of ending) counts.set(r.count, (counts.get(r.count) ?? 0) + 1)

  return {
    total: rows.length,
    playable: playable.length,
    endingCards: ending.length,
    below: playable.filter(r => r.count < 3).map(toRow),
    above: playable.filter(r => r.count > 4).map(toRow),
    endingAbove: ending.filter(r => r.count > 4).map(toRow),
    endingCounts: [...counts].sort((a, b) => a[0] - b[0]).map(([count, n]) => ({ count, n }))
  }
}

if (!process.env.VITEST) {
  const r = scanChoiceCounts()
  console.log('=== 选项数体检（3–4，含锁定卡）===')
  console.log(
    `去重事件 ${r.total} 条：可玩 ${r.playable} · 结局卡 ${r.endingCards}（终局整卡渲染，不在口径内）`
  )
  console.log(
    `结局卡选项分布：${r.endingCounts.map(x => `${x.count}项×${x.n}`).join(' · ')}`
  )
  console.log(`少于 3 项：${r.below.length}`)
  for (const x of r.below) console.log(`  ${x.count}  ${x.type.padEnd(10)} ${x.id.padEnd(38)} 「${x.title}」`)
  console.log(`多于 4 项：${r.above.length}`)
  for (const x of r.above) console.log(`  ${x.count}  ${x.type.padEnd(10)} ${x.id.padEnd(38)} 「${x.title}」`)
  console.log(`结局卡多于 4 项：${r.endingAbove.length}`)
  for (const x of r.endingAbove) console.log(`  ${x.count}  ${x.type.padEnd(10)} ${x.id.padEnd(38)} 「${x.title}」`)
}
