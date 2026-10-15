import { allEvents } from './event-pools'
import { branchRepeatableEventTypes } from '../src/data/branchPools'

/**
 * 「买不起的 offer」体检：可重复事件的条件里，`财帛.min` 不得低于该事件最贵那个选项的实付金额。
 *
 * 为什么只管**可重复**池（gray / character / national / faction）：
 * 一次性的历史事件写「你捐出五十两劳军」是剧情，钱不够也得给，那是设计者要的代价；
 * 而可重复事件是**每 6 个月重新找上门的一桩买卖**。门槛低于售价，就意味着
 * 一个已经囊空如洗的人还会不断被邀请去花他付不起的钱 —— 效果夹到 0，
 * 于是这条通道本身成了压垮财帛的那只手。第十四轮实测的就是这个：
 * 中官／体质／士绅三条回升通道加上奢靡线，共 23 条事件在卖玩家买不起的东西，
 * random 玩法下财帛平均 −26／前 18 月，破产占比从基线 14% 冲到 35%。
 *
 * 换句话说：**回升通道要收钱是对的（白拿的康复没有代价就没有意义），
 * 但它不该向付不起的人开张。**
 *
 * 同一条规则不适用于一次性事件，实测规模也支持这个边界：
 * 全池 174 条违例里 151 条在 historical / chain / transition / emotion，
 * 那些是史实节点上必须付的钱。
 */
export interface AffordabilityFinding {
  id: string
  type: string
  maxCost: number
  floor: number
}

interface MaybeEvent {
  id: string
  type?: string
  conditions?: { attributes?: Record<string, { min?: number }> }
  choices?: Array<{ effects?: { attributes?: Record<string, number> } }>
}

function isRepeatable(type?: string): boolean {
  return !!type && branchRepeatableEventTypes.includes(type as never)
}

function scanBy(pool: MaybeEvent[], take: (type?: string) => boolean): AffordabilityFinding[] {
  const findings: AffordabilityFinding[] = []
  for (const e of pool) {
    if (!take(e.type)) continue
    const costs = (e.choices ?? [])
      .map(c => -(c.effects?.attributes?.财帛 ?? 0))
      .filter(v => v > 0)
    if (costs.length === 0) continue
    const maxCost = Math.max(...costs)
    const floor = e.conditions?.attributes?.财帛?.min ?? 0
    if (floor < maxCost) findings.push({ id: e.id, type: e.type ?? '?', maxCost, floor })
  }
  return findings.sort((a, b) => b.maxCost - b.floor - (a.maxCost - a.floor))
}

export function scanAffordability(pool: MaybeEvent[] = allEvents as MaybeEvent[]): AffordabilityFinding[] {
  return scanBy(pool, isRepeatable)
}

/** 一次性事件里同样"卖贵东西"的条数 —— 只用于把上面那条边界写进报告，不作断言。 */
export function countNonRepeatableViolations(pool: MaybeEvent[] = allEvents as MaybeEvent[]): number {
  return scanBy(pool, t => !isRepeatable(t)).length
}

if (!process.env.VITEST) {
  const findings = scanAffordability()
  const repeatable = (allEvents as MaybeEvent[]).filter(e =>
    e.type && branchRepeatableEventTypes.includes(e.type as never)
  ).length
  console.log(
    `财帛可负担性体检：可重复池 ${repeatable} 条（全池 ${(allEvents as MaybeEvent[]).length}），问题 ${findings.length}`
  )
  console.log(`  一次性事件里同类"卖贵东西"共 ${countNonRepeatableViolations()} 条 —— 那些是史实上必须付的钱，不在本规则管辖范围内`)
  for (const f of findings) {
    console.log(`  [afford] ${f.id}（type:${f.type}）：最贵选项付 ${f.maxCost}，条件只要求财帛 ≥ ${f.floor}`)
  }
  if (findings.length > 0) process.exitCode = 1
}
