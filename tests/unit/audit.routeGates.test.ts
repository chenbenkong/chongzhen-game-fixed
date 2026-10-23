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

/**
 * 实测基线，减少后必须同步下调，否则棘轮会松。
 * 第四十六轮：《铤而走险》换上可见失势票、《落草为寇》撤掉四道隐藏上下界，
 * 纯数值入口 21→20、隐藏门 17→16、上界 6→5、文本前提无经历门 6→5、待改写落点 23→22。
 * 第四十七/四十八轮：医家路补《疫起》、篡位补《诸将劝进》、南明补「效忠南明」第二张票，
 * 《称臣纳贡》撤掉隐藏道德与国势上界，纯数值入口 20→19、隐藏门 16→15、待改写落点 22→20；
 * 写出命途门票的事件 16→17。上界与文本前提两项本轮没有变化，保持 5。
 * 第四十九轮：三格纯数值结局（中兴 / 纵欲而亡 / 烟花之主）全部改读经历票，
 * 《卖国求荣》撤掉隐藏道德/野心；结局纯数值 3→0、隐藏门 24→19。
 * 路线侧本轮没有变化，四项保持 19/15/5/5。
 */
const CEILING = {
  routeNumericOnly: 19,
  routeHidden: 15,
  routeUpperBound: 5,
  routePremiseWithoutFlag: 5,
  routeScopeIssues: 20
} as const

/** 路线事件里写出命途门票的条数，只许上升 */
const ROUTE_FEEDING_FLOOR = 17

/**
 * 结局侧的棘轮（第四十九轮第一次收口）：
 * 44 格结局里不许再出现"没有任何经历门、只靠数值"的格子；
 * 隐藏数值门 24→19 之后也不许回涨。上界另有 19 格，语义上多是"国破/体弱/名声坏"，
 * 不属于本轮的清理对象，先不设天花板。
 */
const ENDING_NUMERIC_CEILING = 0
const ENDING_HIDDEN_CEILING = 19

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

  it('结局格不许靠纯数值判定（棘轮：0）', () => {
    expect(
      s.endingNumericOnly,
      `没有经历门的结局格：${s.endingNumericOnly} > ${ENDING_NUMERIC_CEILING}。` +
        '结局至少要读一张玩家看得见的经历票；属性/状态只能当附加下界。'
    ).toBeLessThanOrEqual(ENDING_NUMERIC_CEILING)
  })

  it('结局格的隐藏数值门不超过基线', () => {
    expect(
      s.endingHidden,
      `还在读玩家界面上看不到的 hidden 的结局格：${s.endingHidden} > ${ENDING_HIDDEN_CEILING}`
    ).toBeLessThanOrEqual(ENDING_HIDDEN_CEILING)
  })

  it('归属分类覆盖全部结局，命途数与面板一致', () => {
    const sum = Object.values(s.byScope).reduce((n, b) => n + b.count, 0)
    expect(sum).toBe(s.endingCount)
    expect(s.endingCount).toBe(allEndingEvents.length)
    const routeIds = new Set(ROUTE_FAMILIES.flatMap(f => f.destinations.map(d => d.endingId)))
    // 秦淮风月那一族第四十九轮也上了命途面板（玩家得看得见自己手里那张风月票通向哪儿），
    // 但它的归属仍是「纵欲」：那三格的 体质≤30／≤10 就是"身体被掏空"本身，不是命途债。
    // 详见 `scripts/audit-route-gates.ts` 的 `scopeOf`。
    const windIds = [...routeIds].filter(id => id.includes('debauch') || id.includes('pimp')).sort()
    expect(s.byScope.route.count).toBe(routeIds.size - windIds.length)
    expect(report.endings.filter(r => r.scope === 'debauchery').map(r => r.id).sort()).toEqual(windIds)
    expect(s.destinationCount).toBe(
      ROUTE_FAMILIES.reduce((n, f) => n + f.destinations.length, 0)
    )
    expect(report.endings.filter(r => r.inRouteTrail).map(r => r.id).sort())
      .toEqual([...routeIds].sort())
  })
})
