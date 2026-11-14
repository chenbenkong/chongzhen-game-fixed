/**
 * 「开局只装一年」这条切分的守门人（第七十九轮之后）。
 *
 * 背景：点【开始仕途】那一刻要下 3.83 MB，其中 2.4 MB 是 1629–1644 的事件 ——
 * 而那一年只可能播到 1628 那一片。于是事件池被切成两批：
 *   · 首批：1628 的历史 + 过渡，以及 gray / emotion / faction / origin / echo（它们的年窗跨全期或根本没有年窗）
 *   · 第二批：1629 以后的全部（`src/data/events/future.ts`），主界面出来之后在后台补
 *
 * 这个切分能成立，靠的是三条**数据层面的**事实。这个脚本就是来钉这三条的：
 *  1. 第二批里**不许有"任意年份可播"的事件**（没有 `conditions.year`）——
 *     有的话，它在 1628 年就该出现，而那时它还没下载。
 *  2. 第二批里**不许有年窗从 1628 或更早开始的事件** —— 同上。
 *  3. 两批拼起来的**顺序**必须与 `data/events/index.ts` 的 `initialEvents` 逐项相同。
 *     这不是洁癖：`pickEvent` / `weightedPick` 按数组顺序抽样，顺序一换，
 *     同一颗种子的整局路径就换了，四十多个跑局用例会集体漂移。
 *
 * 任何一条破了，这个脚本先红，别去改断言。
 */
import { initialEvents, allGrayChoiceEvents } from '../src/data/events/index'
import { futureHistoricalEvents, futureTransitionEvents } from '../src/data/events/future'
import { events1628 as historical1628 } from '../src/data/events/historical/1628'
import { events1628 as transition1628 } from '../src/data/events/transition/1628'
import { allEmotionEvents } from '../src/data/events/emotion'
import { factionEvents } from '../src/data/events/faction/faction_events'
import { originEvents } from '../src/data/events/origin'
import { allEchoEvents } from '../src/data/events/echo'

const GAME_START_YEAR = 1628

export interface SplitReport {
  total: number
  firstBatch: number
  future: number
  /** 第二批里没有 year 条件的事件（必须为空） */
  futureWithoutYear: string[]
  /** 第二批里年窗早于开局年的事件（必须为空） */
  futureTouchingStartYear: string[]
  /** 两批拼起来的顺序与 barrel 不一致的第一个位置（null = 一致） */
  orderDrift: { index: number; expected: string; actual: string } | null
  /** 两批之间重复的 id（必须为空） */
  duplicated: string[]
  /** barrel 里有、两批都没有的 id（必须为空） */
  missing: string[]
}

/** 按 store.ts 的合并顺序拼一遍 —— 这两处必须一致 */
export function assembleFromBatches(): any[] {
  return [
    ...historical1628,
    ...futureHistoricalEvents,
    ...transition1628,
    ...futureTransitionEvents,
    ...allEmotionEvents,
    ...factionEvents,
    ...originEvents,
    ...allEchoEvents,
    ...allGrayChoiceEvents
  ]
}

export function scanEventSplit(): SplitReport {
  const assembled = assembleFromBatches() as any[]
  const barrel = [...(initialEvents as any[]), ...(allGrayChoiceEvents as any[])]

  const future = [...(futureHistoricalEvents as any[]), ...(futureTransitionEvents as any[])]
  const firstBatch = assembled.length - future.length

  const futureWithoutYear = future.filter(e => !e.conditions?.year).map(e => e.id)
  const futureTouchingStartYear = future
    .filter(e => {
      const y = e.conditions?.year
      if (!y) return true
      return (y.min ?? GAME_START_YEAR) <= GAME_START_YEAR
    })
    .map(e => e.id)

  let orderDrift: SplitReport['orderDrift'] = null
  const len = Math.max(assembled.length, barrel.length)
  for (let i = 0; i < len; i++) {
    const expected = barrel[i]?.id ?? '(缺)'
    const actual = assembled[i]?.id ?? '(缺)'
    if (expected !== actual) {
      orderDrift = { index: i, expected, actual }
      break
    }
  }

  const seen = new Set<string>()
  const duplicated: string[] = []
  for (const e of assembled) {
    const id = e.id
    if (seen.has(id)) duplicated.push(id)
    seen.add(id)
  }

  const missing = barrel.filter(e => !seen.has(e.id)).map(e => e.id)

  return {
    total: barrel.length,
    firstBatch,
    future: future.length,
    futureWithoutYear,
    futureTouchingStartYear,
    orderDrift,
    duplicated,
    missing
  }
}

if (!process.env.VITEST) {
  const r = scanEventSplit()
  console.log('=== 事件分批（开局只装 1628，其余后台补）===')
  console.log(`全池 ${r.total} 条：首批 ${r.firstBatch} 条 / 第二批 ${r.future} 条`)
  const bad = (label: string, list: string[]) => {
    const ok = list.length === 0
    console.log(`\n=== ${label}：${list.length} 处 ${ok ? '' : '❌'} ===`)
    if (!ok) console.log('  ' + list.slice(0, 40).join(', '))
    return ok
  }
  let ok = true
  ok = bad('第二批里没有 year 条件的事件', r.futureWithoutYear) && ok
  ok = bad('第二批里年窗触及 1628 的事件', r.futureTouchingStartYear) && ok
  ok = bad('两批之间重复的 id', r.duplicated) && ok
  ok = bad('barrel 里有、两批都没有的 id', r.missing) && ok

  console.log(`\n=== 合并顺序与 barrel 一致：${r.orderDrift ? '❌ 不一致' : '✓'} ===`)
  if (r.orderDrift) {
    const d = r.orderDrift
    console.log(`  第 ${d.index} 项：barrel=${d.expected} / 拼出来=${d.actual}`)
    ok = false
  }

  if (ok) console.log('\n✓ 切分成立：第二批全是 1629 以后的事件，顺序与 barrel 逐项相同。')
  else process.exitCode = 1
}
