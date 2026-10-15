/**
 * 可重复支线的「年代门槛」体检。
 *
 * 第十四轮整局模拟（N=100，随机玩法，跨四个出身）实测到的一条结构性缺陷：
 * **灰色支线池里有 37 条事件（共 52 条）被钉死在某一个具体年份上**
 * （`conditions.year = { min: 1633, max: 1633 }` 这种写法），钉点散布在 1628–1642。
 *
 * 这不是史实约束，是复制粘贴的产物 —— 引擎在 `useGameEngine.ts` 里把
 * `['gray','character','national','faction']` 当成**可重复**支线池抽（冷却 6 个月），
 * 而"可重复"和"只在本县崇祯六年出现一次"在数学上是互相取消的：
 * 一局平均二十来个月（崇祯元年到三年），于是钉在 1633 年之后的全部灰色事件 ——
 * 包括所有进钱的走私、盐引、算命线 —— **在绝大多数局里一次都碰不到**。
 * 实测数字：那六条进钱线每局触发 **0.00 次**；玩家只能看见新加的回升通道，
 * 于是账面单向漏钱，破产率从 14% 涨到 77%。
 *
 * 所以规则要写成静态可查的一句话：
 *   **可重复支线不得钉死单年；要设年份下限，就得在崇祯三年（第 36 个月）之前开门。**
 * 节令感留给 `month`，数值门槛留给 `attributes/hidden` —— 那些才是这条池子该有的门槛。
 */
import { branchRepeatableEventTypes } from '../src/data/branchPools'
import { allEvents } from './event-pools'

export interface Finding {
  kind: 'singleYearPin' | 'lateYearFloor'
  where: string
  detail: string
}

/** 开局年份（崇祯元年）。可重复支线最晚只能在崇祯三年开门 —— 也就是第 36 个月之前。 */
const START_YEAR = 1628
const LATEST_ALLOWED_FLOOR = START_YEAR + 2

export function scanRepeatableGating(pool: any[]): Finding[] {
  const findings: Finding[] = []
  for (const e of pool) {
    if (!e?.type || !(branchRepeatableEventTypes as readonly string[]).includes(e.type)) continue
    const year = (e.conditions as any)?.year
    if (!year || typeof year !== 'object') continue

    const min = typeof year.min === 'number' ? year.min : null
    const max = typeof year.max === 'number' ? year.max : null
    if (min !== null && max !== null && min === max) {
      findings.push({
        kind: 'singleYearPin',
        where: `${e.id}（type:${e.type}）`,
        detail: `钉死在 ${min} 年这一年 —— 可重复支线池里这样写等于"绝大多数短局永远看不见这条"`
      })
    } else if (min !== null && min > LATEST_ALLOWED_FLOOR) {
      findings.push({
        kind: 'lateYearFloor',
        where: `${e.id}（type:${e.type}）`,
        detail: `要求 year ≥ ${min}，晚于允许的最晚开门年 ${LATEST_ALLOWED_FLOOR}`
      })
    }
  }
  return findings
}

// 与其余体检脚本同一口径：被测试 import 时不打印
if (!process.env.VITEST) {
  const repeatable = allEvents.filter(e => (branchRepeatableEventTypes as readonly string[]).includes(e.type))
  const findings = scanRepeatableGating(allEvents)
  console.log(`可重复支线门槛体检：池内 ${repeatable.length} 条（全池 ${allEvents.length}），问题 ${findings.length}`)
  if (findings.length) {
    for (const f of findings) console.log(`  [${f.kind}] ${f.where} —— ${f.detail}`)
    process.exitCode = 1
  } else {
    console.log('  全部可重复支线在开局两年内都可能开门（节令门槛不计）。')
  }
}
