import { describe, expect, it } from 'vitest'
import { scanRouteGates } from '../../scripts/audit-route-gates'
import { ROUTE_FAMILIES } from '../../src/utils/routeTrail'
import { allEndingEvents } from '../../src/data/events/ending'

/**
 * 路线 / 结局门禁的看门狗（第四十五轮 A）。
 *
 * 这一轮要回答的问题不是"结局能不能触发"，而是"玩家凭什么知道自己走到了这条路上"。
 * 第四十五轮开局实测（见 KNOWN_ISSUES §1.4 ㉔）：
 *   · 21 条 route_* 入口事件**没有一条**带事件级 flag 门，全部靠数值/隐藏值放行；
 *   · 23 个命途落点里 20 个仍读 hidden（道德值/野心值/欲望值），15 个还要求上界；
 *   · 文本已经写明"被构陷 / 下狱 / 失势"的 6 条入口，条件里没有对应经历。
 *
 * 这里的常量是**天花板**，不是目标值：改一条路线就把对应数字往下调一格，
 * 不许往上调。想加新路线事件而没有经历门，先读 `scripts/audit-route-gates.ts`
 * 顶部那三条判定，再决定是补门票还是把这段剧情删掉。
 */

/** 第四十五轮 A 实测基线（减少后必须同步下调，否则棘轮会松） */
const CEILING = {
  routeNumericOnly: 21,
  routeHidden: 17,
  routeUpperBound: 6,
  routePremiseWithoutFlag: 6,
  routeScopeIssues: 23
} as const

/** 路线事件里写出命途门票的条数，只许上升 */
const ROUTE_FEEDING_FLOOR = 16

const report = scanRouteGates()
const s = report.summary

describe('路线 / 结局门禁（可见行为优先）', () => {

  it('命途落点的门票全部写得出来，且每格至少一张', () => {
    expect(
      s.destinationDeadTicket,
      '有命途落点的门票全库没人写得出来 —— 玩家集齐了面板也不会亮'
    ).toBe(0)
    for (const d of report.destinations) {
      expect(d.ticketCount, `${d.route} · ${d.endingId} 没有任何门票`).toBeGreaterThan(0)
    }
  })

  it('结局门票没有死票', () => {
    expect(s.endingDeadTicket).toBe(0)
    expect(report.endings.flatMap(r => r.deadTickets)).toEqual([])
  })

  it('命途落点不能退回纯数值判定', () => {
    expect(
      s.byScope.route.numericOnly,
      '某格命途落点丢了全部 flag 门，只剩数值'
    ).toBe(0)
  })

  it('新增的路线事件不许写死门票', () => {
    expect(
      report.routes.flatMap(r => r.deadTickets),
      '路线事件的门里引用了没人写得出的经历，这道门永久关着'
    ).toEqual([])
  })

  it('纯数值入口不超过基线（棘轮）', () => {
    expect(
      s.routeNumericOnly,
      `没有经历门的路线入口：${s.routeNumericOnly} > ${CEILING.routeNumericOnly}。` +
        '新路线必须先有一张玩家看得见的门票（经历/选择/状态），数值只能当附加下界。'
    ).toBeLessThanOrEqual(CEILING.routeNumericOnly)
  })

  it('隐藏数值门不超过基线（棘轮）', () => {
    expect(
      s.routeHidden,
      `路线入口读了玩家界面上看不到的 hidden：${s.routeHidden} > ${CEILING.routeHidden}`
    ).toBeLessThanOrEqual(CEILING.routeHidden)
  })

  it('数值上界不超过基线（棘轮）', () => {
    expect(
      s.routeUpperBound,
      `路线入口用上界把玩家关在门外：${s.routeUpperBound} > ${CEILING.routeUpperBound}`
    ).toBeLessThanOrEqual(CEILING.routeUpperBound)
  })

  it('文本前提没有经历门不超过基线（棘轮）', () => {
    expect(
      s.routePremiseWithoutFlag,
      `正文写了被构陷/下狱/失势，条件里却没有这段经历：${s.routePremiseWithoutFlag} > ${CEILING.routePremiseWithoutFlag}`
    ).toBeLessThanOrEqual(CEILING.routePremiseWithoutFlag)
  })

  it('命途落点待改写数不超过基线（棘轮）', () => {
    expect(
      s.routeScopeIssues,
      `仍靠纯数值/隐藏值/上界判定的命途落点：${s.routeScopeIssues} > ${CEILING.routeScopeIssues}`
    ).toBeLessThanOrEqual(CEILING.routeScopeIssues)
  })

  it('写出命途门票的路线事件不能变少', () => {
    expect(
      s.routeFeedingTrail,
      '有路线事件不再产出命途面板认得的门票 —— 玩家做了选择，面板却不动'
    ).toBeGreaterThanOrEqual(ROUTE_FEEDING_FLOOR)
  })

  it('归属分类覆盖全部结局，命途数与面板一致', () => {
    const sum = Object.values(s.byScope).reduce((n, b) => n + b.count, 0)
    expect(sum).toBe(s.endingCount)
    expect(s.endingCount).toBe(allEndingEvents.length)
    const routeIds = new Set(ROUTE_FAMILIES.flatMap(f => f.destinations.map(d => d.endingId)))
    expect(s.byScope.route.count).toBe(routeIds.size)
    expect(s.destinationCount).toBe(
      ROUTE_FAMILIES.reduce((n, f) => n + f.destinations.length, 0)
    )
    expect(report.endings.filter(r => r.inRouteTrail).map(r => r.id).sort())
      .toEqual([...routeIds].sort())
  })
})
