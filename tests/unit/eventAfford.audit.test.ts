import { describe, expect, it } from 'vitest'
import { scanAffordability, countNonRepeatableViolations } from '../../scripts/audit-affordability'

/**
 * 「买不起的 offer」体检的三条用例，规则本身写在 `scripts/audit-affordability.ts` 里。
 *
 * 老规矩：CI 跑的不是"脚本没报错"，而是**断言扫描结果为空**；
 * 再加一条合成数据用例证明这个扫描真的会红 —— 否则一条恒真的断言和没有断言等价。
 */
interface Ev {
  id: string
  type?: string
  conditions?: { attributes?: Record<string, { min?: number }> }
  choices?: Array<{ effects?: { attributes?: Record<string, number> } }>
}

const buy = (id: string, type: string, price: number, floor?: number): Ev => ({
  id,
  type,
  ...(floor === undefined ? {} : { conditions: { attributes: { 财帛: { min: floor } } } }),
  choices: [{ effects: { attributes: { 财帛: -price } } }]
})

describe('财帛可负担性体检', () => {
  it('可重复池里没有任何一条事件在卖玩家买不起的东西', () => {
    const findings = scanAffordability()
    expect(
      findings.map(f => `${f.id}（最贵 ${f.maxCost}，门槛 ${f.floor}）`),
      '可重复事件每 6 个月就会重新上门，门槛低于售价等于持续抽干财帛'
    ).toEqual([])
  })

  it('合成一条卖贵东西的可重复事件，扫描必须逮住它', () => {
    const pool: Ev[] = [
      buy('cheap_ok', 'gray', 20, 20),
      buy('too_cheap', 'gray', 30, 10),
      buy('no_floor_at_all', 'faction', 12),
      buy('income_only', 'character', 0),
      // 归零警告的档位与冷却都写在表外，这条不参与
      buy('emotion_unaffected', 'emotion', 99)
    ]
    expect(scanAffordability(pool).map(f => f.id)).toEqual(['too_cheap', 'no_floor_at_all'])
  })

  it('一次性事件不在管辖内：史实节点上必须付的钱不会被判成缺陷', () => {
    const pool: Ev[] = [buy('historical_owes', 'historical', 80), buy('transition_owes', 'transition', 50)]
    expect(scanAffordability(pool)).toEqual([])
    // 反过来也得证明这个豁免**有实际内容**：真池子里确实存在大量这类一次性高消费
    expect(countNonRepeatableViolations()).toBeGreaterThan(100)
  })
})
