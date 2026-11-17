import { describe, expect, it } from 'vitest'
import { allGrayChoiceEvents } from '../../src/data/events'
import { simulateRun } from './helpers/simulate'

/**
 * 换皮事件互斥。
 *
 * “下属献妻”曾经有两张 ID：`gray_debauchery_001`（主簿周文德）和
 * `gray_debauchery_020`（县丞王德明）。两张的标题、妻子姓名、四选项结构
 * 几乎一样，旧引擎按 id 各自判重，于是同一局能先后撞到两遍。
 * 现在用 `exclusiveGroup` 把它们绑成一组，一局只允许出现其中一张。
 *
 * 这里用真引擎跑固定种子，钉两件事：
 * 1. 同组两张不会出现在同一局（连发牌记录也不能同时有）；
 * 2. 取样不是空跑 —— 至少有一局真的发到了这组事件。
 */
describe('换皮事件同组互斥', () => {
  const GROUP = 'subordinate_wife_offer'
  const PAIR = ['gray_debauchery_001', 'gray_debauchery_020']

  it('同组事件的数据标记齐全，标题不再撞车', () => {
    const members = allGrayChoiceEvents.filter(e => e.exclusiveGroup === GROUP)
    expect(members.map(e => e.id).sort()).toEqual([...PAIR].sort())
    expect(members[0].title).not.toBe(members[1].title)
  })

  it('同一局里不会同时出现同组两张卡', async () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1)
    const outcomes = []
    for (const seed of seeds) {
      outcomes.push(await simulateRun({ seed, policy: 'random', maxMonths: 200 }))
    }

    let appeared = 0
    for (const r of outcomes) {
      const dealt = new Set(r.dealtEventIds)
      const hit = PAIR.filter(id => dealt.has(id))
      expect(hit, `seed=${r.seed} 同组两张同时发牌：${hit.join(' / ')}`).not.toEqual(PAIR)
      if (hit.length === 1) appeared++
    }

    expect(appeared, '20 局里一次也没发到“下属献妻”组 —— 这条互斥检查等于没测').toBeGreaterThan(0)
  }, 180_000)
})
