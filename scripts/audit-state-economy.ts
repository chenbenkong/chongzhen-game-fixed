/**
 * 归零死线的「回升渠道」体检：八条判死维度里，每一维在每一段年份到底有没有地方可以救。
 *
 * 为什么要量这个。`src/data/boundaryEvents.ts` 有八条 `pastGrace()` 死线
 * （turn≥12 之后 财帛/体质/圣眷/中官/清议/士绅/民望/道德值 任一为 0 立刻收尾），
 * 而引擎里**没有任何被动回升**：`handleNextMonth` 只衰减 国势，
 * 这八维只由选项 effects 改变。也就是说一维能不能救回来，完全取决于
 * 「接下来那些事件里有没有正增量可选」—— 这是数据问题，不是代码问题，
 * 所以它正好落在四道既有体检的盲区里：类型收紧、键名体检、值域体检、flag 可达性
 * 查的都是「写错了没有」，没有一个查「写得通不通」。
 *
 * 触发本脚本的实测事实（`tests/unit/simulation.playthrough.test.ts`）：
 * 守成玩法（随机避开「能直接收尾」的选项）在 1629 年 3 月死于中官归零，
 * 一整局只碰得到 15/402 个事件。玩家以为自己在玩崇祯朝，实际上玩的是十二个月。
 *
 * 口径（避免把「存在渠道」读成「必然可选」）：
 *   · 只统计选项 effects 里显式写了该键增量的项；投骰分支与 penaltyEffect 不在这一层。
 *   · 一个事件里只要**存在**一个正增量选项，就算它提供了回升渠道 ——
 *     这是乐观口径（玩家还可能因为 showConditions 选不到那个选项）。
 *     乐观口径都判死刑的时间窗，就是真的没有活路。
 *   · 没写 `conditions.year` 的事件按「全程可用」计入每个窗口（口径同样偏宽）。
 *
 * 判定阈值刻意保守，只用来把「需要人看一眼」的格子挑出来：
 *   noSource     —— 该窗口一个正增量选项都没有：归零即等死。
 *   netNegative  —— 正增量总量 < |负增量总量|：整体在往下走，本窗口内回不来。
 *   thinRecovery —— 提供正渠道的事件占比 < 1/8：渠道稀薄，撞上连续负面事件就救不回来。
 */
import { allEvents, labelOfPool } from './event-pools'

type Group = 'attributes' | 'gameState' | 'hidden'

export interface Threshold {
  key: string
  group: Group
}

/**
 * 八条死线。出处是 boundaryEvents 里 `pastGrace()` 那批 check ——
 * 那些 check 是闭包而不是数据，机器读不出键名，所以这里手抄。
 * 抄漏/抄错的后果由 tests/unit/simulation.playthrough.test.ts 兜住：
 * 那条用例要求模拟器实测到的归零维度必须落在这份清单里。
 */
export const THRESHOLDS: Threshold[] = [
  { key: '财帛', group: 'attributes' },
  { key: '体质', group: 'attributes' },
  { key: '圣眷', group: 'gameState' },
  { key: '中官', group: 'gameState' },
  { key: '清议', group: 'gameState' },
  { key: '士绅', group: 'gameState' },
  { key: '民望', group: 'gameState' },
  { key: '道德值', group: 'hidden' }
]

type Kind = 'ok' | 'noSource' | 'netNegative' | 'thinRecovery'

export interface EconomyRow {
  key: string
  bucket: string
  posChoices: number
  posTotal: number
  negChoices: number
  negTotal: number
  eventsWithPos: number
  eventsTotal: number
  kind: Kind
}

/** 四个观察窗口。1628 是开局年，1644 是甲申 —— 最后一段只有两年是有意的。 */
export const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '1628-1632', min: 1628, max: 1632 },
  { label: '1633-1637', min: 1633, max: 1637 },
  { label: '1638-1642', min: 1638, max: 1642 },
  { label: '1643-1644', min: 1643, max: 1644 }
]

/** 一个事件的生效年份区间；没写 year 就当全程可用 */
function yearSpan(event: any): { min: number; max: number } {
  const y = event?.conditions?.year
  if (!y || typeof y !== 'object') return { min: -Infinity, max: Infinity }
  return { min: typeof y.min === 'number' ? y.min : -Infinity, max: typeof y.max === 'number' ? y.max : Infinity }
}

function deltaOf(choice: any, t: Threshold): number | undefined {
  const raw = choice?.effects?.[t.group]?.[t.key]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

export function scanStateEconomy(events: any[] = allEvents, buckets = BUCKETS): EconomyRow[] {
  const rows: EconomyRow[] = []
  for (const t of THRESHOLDS) {
    for (const bucket of buckets) {
      let posChoices = 0
      let posTotal = 0
      let negChoices = 0
      let negTotal = 0
      let eventsWithPos = 0
      let eventsTotal = 0

      for (const event of events as any[]) {
        if (!event?.choices?.length) continue
        const span = yearSpan(event)
        if (span.max < bucket.min || span.min > bucket.max) continue
        eventsTotal++
        let hasPosHere = false
        for (const choice of event.choices) {
          const d = deltaOf(choice, t)
          if (d === undefined || d === 0) continue
          if (d > 0) {
            posChoices++
            posTotal += d
            hasPosHere = true
          } else {
            negChoices++
            negTotal += d
          }
        }
        if (hasPosHere) eventsWithPos++
      }

      let kind: Kind = 'ok'
      if (posChoices === 0) kind = 'noSource'
      else if (posTotal < -negTotal) kind = 'netNegative'
      else if (eventsTotal > 0 && eventsWithPos * 8 < eventsTotal) kind = 'thinRecovery'

      rows.push({
        key: t.key,
        bucket: bucket.label,
        posChoices,
        posTotal,
        negChoices,
        negTotal,
        eventsWithPos,
        eventsTotal,
        kind
      })
    }
  }
  return rows
}

const FLAG: Record<Kind, string> = {
  ok: '○ 正常',
  noSource: '★ 该窗口没有任何回升来源',
  netNegative: '▲ 正增量补不上负增量',
  thinRecovery: '△ 回升渠道稀薄'
}

if (!process.env.VITEST) {
  const rows = scanStateEconomy()
  console.log('归零死线回升渠道体检（只统计选项 effects 里显式写了该键的增量）\n')
  console.log('维度  窗口         正选项  正总量   负选项   负总量   有渠道事件/总数   判定')
  for (const r of rows) {
    console.log(
      `${r.key.padEnd(3)} ${r.bucket.padEnd(11)} ${String(r.posChoices).padStart(7)}` +
        ` ${String(r.posTotal).padStart(8)} ${String(r.negChoices).padStart(8)}` +
        ` ${String(r.negTotal).padStart(8)} ${(`${r.eventsWithPos}/${r.eventsTotal}`).padStart(16)}   ${FLAG[r.kind]}`
    )
  }

  const dead = rows.filter(r => r.kind !== 'ok')
  console.log(`\n需要人工看一眼的格子：${dead.length}/${rows.length}`)
  console.log('\n每一维正增量总量最大的一些事件（想知道"救它"具体靠什么）：')
  for (const t of THRESHOLDS) {
    const scored: Array<{ id: string; total: number }> = []
    for (const event of allEvents as any[]) {
      let total = 0
      for (const choice of event.choices || []) {
        const d = deltaOf(choice, t)
        if (d && d > 0) total += d
      }
      if (total > 0) scored.push({ id: event.id, total })
    }
    scored.sort((a, b) => b.total - a.total)
    console.log(
      `  ${t.key}：${scored.slice(0, 4).map(s => `${s.id}[${labelOfPool(s.id)}](+${s.total})`).join('、') || '（无）'}`
    )
  }
}
