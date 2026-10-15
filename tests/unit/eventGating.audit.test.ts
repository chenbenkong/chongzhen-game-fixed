import { describe, expect, it } from 'vitest'
import { scanRepeatableGating } from '../../scripts/audit-repeatable-gating'
import { allEvents } from '../../scripts/event-pools'
import { branchRepeatableEventTypes } from '../../src/data/branchPools'

/**
 * 第十四轮：可重复支线池的年代门槛体检。
 *
 * 守的是实测出来的那条结构性缺陷 —— 52 条灰色支线里有 37 条被写成
 * `year: { min: 1633, max: 1633 }` 这种"只在本县崇祯六年出现一次"，
 * 而引擎恰恰把这批 type 当作**可重复**池抽。一局平均二十来个月，
 * 于是钉在 1633 年之后的进钱线（走私、盐引、算命）每局触发次数实测为 **0.00**。
 * 玩家看不见内容，内容再多等于零 —— 这条不变量必须静态钉住。
 */
describe('可重复支线的年代门槛（audit:gating）', () => {
  it('全池没有任何可重复支线钉死单年或要求三年以后的年份', () => {
    const findings = scanRepeatableGating(allEvents)
    expect(findings.map(f => `[${f.kind}] ${f.where} —— ${f.detail}`)).toEqual([])
  })

  /**
   * 反空转：上一条用例在"扫描函数本身失效"时也会绿，所以这里直接喂一份必然违规的池子。
   * 少这一条，将来有人把 `scanRepeatableGating` 的过滤条件写错（比如把 type 名单拼错），
   * 全池那一条会安静地永远通过。
   */
  it('体检真的认得这两种写法', () => {
    const synthetic = [
      { id: 'fake_pin', type: 'gray', conditions: { year: { min: 1635, max: 1635 } } },
      { id: 'fake_late', type: 'faction', conditions: { year: { min: 1640 } } },
      // 合规的两条：只有节令门槛 / 只有年份上限（崇祯九年之前的谶语那一类）
      { id: 'fake_ok_month', type: 'gray', conditions: { month: { min: 2, max: 4 } } },
      { id: 'fake_ok_maxyear', type: 'gray', conditions: { year: { max: 1636 } } },
      // 不在可重复池里的类型不受这条规则约束：过渡事件本来就该钉在具体年份上
      { id: 'fake_transition', type: 'transition', conditions: { year: { min: 1629, max: 1629 } } }
    ]
    const found = scanRepeatableGating(synthetic)
    expect(found.map(f => f.where)).toEqual(['fake_pin（type:gray）', 'fake_late（type:faction）'])
  })

  it('规则管的池子确实非空 —— 名单拼错时不要假装检查过了', () => {
    const repeatable = allEvents.filter(e => (branchRepeatableEventTypes as readonly string[]).includes(e.type))
    expect(repeatable.length).toBeGreaterThanOrEqual(50)
    // 灰色支线里"完全没有年门槛"的比例，就是这条规则修出来的密度
    const yearless = repeatable.filter(e => !(e.conditions as any)?.year)
    expect(yearless.length / repeatable.length).toBeGreaterThan(0.8)
  })
})
