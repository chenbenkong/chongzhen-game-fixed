/**
 * 路线 / 结局门禁体检（第四十五轮）。
 *
 * 目的：把"这条路靠什么开门、这格结局靠什么判"从数据里摊出来，
 * 找出三类违背「可见行为优先」的写法：
 *   1. 纯数值入口：route_* 事件没有任何 flag 门，只靠属性/隐藏值/状态；
 *   2. 隐藏数值入口：门里读了玩家在界面上看不到的 hidden 值（野心/欲望/道德值）；
 *   3. 文本前提无经历门：正文写了"被构陷/下狱/失势"，条件里却没有对应经历。
 *
 * 同时给 44 格结局做同一张账：哪些格有门票、哪些格是纯数值、
 * 哪些格还留着玩家退不回去的上界、哪些门票全库没人写得出来。
 *
 * 输出既是 CLI 报告，也是 `tests/unit/audit.routeGates.test.ts` 的基线棘轮。
 * 口径一改，测试先红 —— 不要只改文档。
 */
import { allEndingEvents } from '../src/data/events/ending'
import { eventsRouteGuide } from '../src/data/events/transition/route_guide'
import { ROUTE_FAMILIES } from '../src/utils/routeTrail'
import { THRESHOLD_ENDING_BY_KEY } from '../src/data/boundaryEvents'
import { EventConditions, GameEvent } from '../src/types/event'
import { scanFlagReachability } from './audit-flag-reachability'

const FLAG_CLAUSES = ['has', 'all', 'some', 'any', 'notHas', 'none'] as const

const PREMISE_KEYWORDS = [
  '被构陷',
  '构陷',
  '下狱',
  '失势',
  '罢官',
  '革职',
  '被贬',
  '朝廷负你',
  '削职',
  '谪戍'
]

export type GateScope = 'route' | 'threshold' | 'national' | 'debauchery' | 'other'

export interface GateRow {
  id: string
  title: string
  kind: 'ending' | 'route'
  /** 结局的归属：命途落点 / 归零阈值 / 国运 / 纵欲 / 其他 */
  scope: GateScope
  inRouteTrail: boolean
  /** 事件级 flag 门的摘要，`—` = 没有可见行为门 */
  flags: string
  ticketCount: number
  deadTickets: string[]
  /** 属性 / 隐藏值 / 状态里的数值门，已带上下界 */
  numeric: string[]
  /** 其中玩家界面上看不到的 hidden 门 */
  hidden: string[]
  /** 玩家看不见、也退不回去的上界 */
  upperBounds: string[]
  year: string
  choices: number
  declinable: boolean
  /** route 事件写出的、被某格结局当门票的 flag */
  routeTickets: string[]
  verdicts: string[]
}

export interface RouteGateFinding {
  kind: string
  where: string
  scope: GateScope
  detail: string
}

export interface ScopeSummary {
  count: number
  withFlags: number
  numericOnly: number
  hidden: number
  upperBound: number
  deadTicket: number
}

export interface RouteGateReport {
  endings: GateRow[]
  routes: GateRow[]
  destinations: Array<{
    route: string
    endingId: string
    title: string
    mode: 'any' | 'all'
    ticketCount: number
    deadTickets: string[]
  }>
  findings: RouteGateFinding[]
  summary: {
    endingCount: number
    endingWithFlags: number
    endingNumericOnly: number
    endingHidden: number
    endingUpperBound: number
    endingDeadTicket: number
    /** 按归属拆开：阈值/国运的数值上界是语义，命途落点的上界才是设计债 */
    byScope: Record<GateScope, ScopeSummary>
    /** 命途落点里同时带「纯数值 / 隐藏门 / 上界」的行数，本轮棘轮主指标 */
    routeScopeIssues: number
    routeCount: number
    routeWithFlags: number
    routeNumericOnly: number
    routeHidden: number
    routeUpperBound: number
    routePremiseWithoutFlag: number
    /** 写出了命途面板认得的门票的路线事件数 */
    routeFeedingTrail: number
    destinationCount: number
    destinationDeadTicket: number
  }
}

function flagsOf(f: EventConditions['flags']): string[] {
  if (!f) return []
  return [
    ...(f.has ?? []),
    ...(f.all ?? []),
    ...(f.some ?? []),
    ...(f.any ?? [])
  ]
}

function describeFlags(f: EventConditions['flags']): string {
  if (!f) return '—'
  const parts: string[] = []
  for (const clause of FLAG_CLAUSES) {
    const list = f[clause]
    if (list?.length) parts.push(`${clause}(${list.length})`)
  }
  return parts.length ? parts.join(' ') : '—'
}

function hasVisibleFlagGate(f: EventConditions['flags']): boolean {
  if (!f) return false
  return FLAG_CLAUSES.some(clause => (f[clause]?.length ?? 0) > 0)
}

function numericGates(c: EventConditions): {
  numeric: string[]
  hidden: string[]
  upperBounds: string[]
} {
  const numeric: string[] = []
  const hidden: string[] = []
  const upperBounds: string[] = []
  const groups: Array<[string, Record<string, { min?: number; max?: number }> | undefined]> = [
    ['attr', c.attributes as any],
    ['hidden', c.hidden as any],
    ['state', c.gameState as any]
  ]
  for (const [group, obj] of groups) {
    for (const [key, range] of Object.entries(obj ?? {})) {
      if (!range) continue
      const bits: string[] = []
      if (typeof range.min === 'number') bits.push(`≥${range.min}`)
      if (typeof range.max === 'number') {
        bits.push(`≤${range.max}`)
        upperBounds.push(`${key}≤${range.max}`)
      }
      const label = `${key}${bits.join('')}`
      numeric.push(label)
      if (group === 'hidden') hidden.push(label)
    }
  }
  return { numeric, hidden, upperBounds }
}

function yearLabel(c: EventConditions): string {
  const y = c.year
  if (!y || (y.min == null && y.max == null)) return '—'
  return `${y.min ?? '?'}–${y.max ?? '?'}`
}

function eventText(e: GameEvent): string {
  return [
    e.title,
    e.description,
    e.narrative?.background,
    e.narrative?.situation,
    e.narrative?.quote
  ].filter(Boolean).join('\n')
}

function inspectEvent(
  e: GameEvent,
  kind: 'ending' | 'route',
  scope: GateScope,
  granted: Set<string>,
  endingTickets: Set<string>,
  destinationTickets: Set<string>
): GateRow {
  const { numeric, hidden, upperBounds } = numericGates(e.conditions)
  const flags = describeFlags(e.conditions.flags)
  const tickets = flagsOf(e.conditions.flags)
  const deadTickets = tickets.filter(t => !granted.has(t))
  const added = (e.choices ?? []).flatMap(c => c.effects?.flags?.add ?? [])
  const routeTickets = [...new Set(
    added.filter(f => (kind === 'route' ? destinationTickets : endingTickets).has(f))
  )]

  const verdicts: string[] = []
  if (!hasVisibleFlagGate(e.conditions.flags) && numeric.length > 0) {
    verdicts.push(kind === 'ending' ? '纯数值结局' : '纯数值入口')
  }
  if (hidden.length > 0) verdicts.push('隐藏数值门')
  if (upperBounds.length > 0) verdicts.push('有上界')
  if (deadTickets.length > 0) verdicts.push('死门票')
  if ((e.conditions.flags?.has?.length ?? 0) >= 2) verdicts.push('互斥 has 待查')
  if (kind === 'route') {
    const text = eventText(e)
    const hit = PREMISE_KEYWORDS.filter(k => text.includes(k))
    if (hit.length && !hasVisibleFlagGate(e.conditions.flags)) {
      verdicts.push(`文本前提无经历门(${hit.join('/')})`)
    }
  }

  return {
    id: e.id,
    title: e.title,
    kind,
    scope,
    inRouteTrail: kind === 'ending' ? scope === 'route' : routeTickets.length > 0,
    flags,
    ticketCount: tickets.length,
    deadTickets,
    numeric,
    hidden,
    upperBounds,
    year: yearLabel(e.conditions),
    choices: e.choices?.length ?? 0,
    declinable: e.declinable === true,
    routeTickets,
    verdicts
  }
}

export function scanRouteGates(): RouteGateReport {
  const reach = scanFlagReachability()
  const granted = reach.granted
  const endingTickets = new Set(
    (allEndingEvents as GameEvent[]).flatMap(e => flagsOf(e.conditions.flags))
  )
  const routeIds = new Set(
    ROUTE_FAMILIES.flatMap(f => f.destinations.map(d => d.endingId))
  )
  const thresholdIds = new Set(Object.values(THRESHOLD_ENDING_BY_KEY))
  const destinationTickets = new Set(
    ROUTE_FAMILIES.flatMap(f => f.destinations.flatMap(d => d.tickets))
  )
  const scopeOf = (id: string, category?: string): GateScope => {
    if (routeIds.has(id)) return 'route'
    if (thresholdIds.has(id) || id.startsWith('triggerable_')) return 'threshold'
    if (category === 'ming_fate') return 'national'
    if (id.includes('debauch') || id.includes('pimp')) return 'debauchery'
    return 'other'
  }

  const endings = (allEndingEvents as GameEvent[])
    .map(e => inspectEvent(
      e,
      'ending',
      scopeOf(e.id, e.endingConfig?.category),
      granted,
      endingTickets,
      destinationTickets
    ))
  const routes = (eventsRouteGuide as GameEvent[])
    .map(e => inspectEvent(e, 'route', 'route', granted, endingTickets, destinationTickets))

  const destinations = ROUTE_FAMILIES.flatMap(family =>
    family.destinations.map(dest => {
      const dead = dest.tickets.filter(t => !granted.has(t))
      return {
        route: family.name,
        endingId: dest.endingId,
        title: dest.title,
        mode: dest.mode,
        ticketCount: dest.tickets.length,
        deadTickets: dead
      }
    })
  )

  const findings: RouteGateFinding[] = []
  const add = (kind: string, where: string, scope: GateScope, detail: string) =>
    findings.push({ kind, where, scope, detail })

  for (const row of endings) {
    for (const v of row.verdicts) {
      if (v === '有上界') add('endingUpperBound', row.id, row.scope, `「${row.title}」 上界: ${row.upperBounds.join(' · ')}`)
      else if (v === '隐藏数值门') add('endingHidden', row.id, row.scope, `「${row.title}」 hidden 门: ${row.hidden.join(' · ')}`)
      else if (v === '纯数值结局') add('endingNumericOnly', row.id, row.scope, `「${row.title}」 没有任何 flag 门，数值门: ${row.numeric.join(' · ') || '无'}`)
      else if (v === '死门票') add('endingDeadTicket', row.id, row.scope, `「${row.title}」 门票没人写: ${row.deadTickets.join(', ')}`)
      else if (v === '互斥 has 待查') add('endingMultiHas', row.id, row.scope, `「${row.title}」 has(${row.ticketCount}) 是否要求互斥经历，需要人工确认`)
    }
  }
  for (const row of routes) {
    for (const v of row.verdicts) {
      if (v === '纯数值入口') add('routeNumericOnly', row.id, 'route', `「${row.title}」 没有 flag 门，数值门: ${row.numeric.join(' · ') || '无'}`)
      else if (v === '隐藏数值门') add('routeHidden', row.id, 'route', `「${row.title}」 hidden 门: ${row.hidden.join(' · ')}`)
      else if (v === '有上界') add('routeUpperBound', row.id, 'route', `「${row.title}」 上界: ${row.upperBounds.join(' · ')}`)
      else if (v.startsWith('文本前提无经历门')) add('routePremiseWithoutFlag', row.id, 'route', `「${row.title}」 ${v}`)
    }
  }
  for (const d of destinations) {
    if (d.deadTickets.length) add('destinationDeadTicket', d.endingId, 'route', `「${d.route} · ${d.title}」 门票没人写: ${d.deadTickets.join(', ')}`)
  }

  const countVerdict = (rows: GateRow[], verdict: string) =>
    rows.filter(r => r.verdicts.includes(verdict)).length

  const scopes: GateScope[] = ['route', 'threshold', 'national', 'debauchery', 'other']
  const byScope = Object.fromEntries(scopes.map(scope => {
    const rows = endings.filter(r => r.scope === scope)
    return [scope, {
      count: rows.length,
      withFlags: rows.filter(r => r.ticketCount > 0).length,
      numericOnly: countVerdict(rows, '纯数值结局'),
      hidden: countVerdict(rows, '隐藏数值门'),
      upperBound: countVerdict(rows, '有上界'),
      deadTicket: countVerdict(rows, '死门票')
    }]
  })) as Record<GateScope, ScopeSummary>

  return {
    endings,
    routes,
    destinations,
    findings,
    summary: {
      endingCount: endings.length,
      endingWithFlags: endings.filter(r => r.ticketCount > 0).length,
      endingNumericOnly: countVerdict(endings, '纯数值结局'),
      endingHidden: countVerdict(endings, '隐藏数值门'),
      endingUpperBound: countVerdict(endings, '有上界'),
      endingDeadTicket: countVerdict(endings, '死门票'),
      byScope,
      routeScopeIssues: endings.filter(r =>
        r.scope === 'route' &&
        (r.verdicts.includes('纯数值结局') || r.verdicts.includes('隐藏数值门') || r.verdicts.includes('有上界'))
      ).length,
      routeCount: routes.length,
      routeWithFlags: routes.filter(r => r.ticketCount > 0).length,
      routeNumericOnly: countVerdict(routes, '纯数值入口'),
      routeHidden: countVerdict(routes, '隐藏数值门'),
      routeUpperBound: countVerdict(routes, '有上界'),
      routePremiseWithoutFlag: routes.filter(r => r.verdicts.some(v => v.startsWith('文本前提无经历门'))).length,
      routeFeedingTrail: routes.filter(r => r.inRouteTrail).length,
      destinationCount: destinations.length,
      destinationDeadTicket: destinations.filter(d => d.deadTickets.length > 0).length
    }
  }
}

// 与其余体检脚本同一口径：被测试 import 时不打印
if (!process.env.VITEST) {
  const report = scanRouteGates()
  const s = report.summary
  const scopeLabel: Record<GateScope, string> = {
    route: '命途',
    threshold: '归零阈值',
    national: '国运',
    debauchery: '纵欲',
    other: '其他'
  }
  console.log('=== 路线 / 结局门禁体检 ===')
  console.log(`结局 ${s.endingCount} 格：有门票 ${s.endingWithFlags} · 纯数值 ${s.endingNumericOnly} · 隐藏数值门 ${s.endingHidden} · 有上界 ${s.endingUpperBound} · 死门票 ${s.endingDeadTicket}`)
  console.log('  按归属：' + (Object.keys(scopeLabel) as GateScope[]).map(scope => {
    const b = s.byScope[scope]
    return `${scopeLabel[scope]} ${b.count}（纯数值 ${b.numericOnly} / 隐藏 ${b.hidden} / 上界 ${b.upperBound}）`
  }).join(' · '))
  console.log(`路线事件 ${s.routeCount} 条：有 flag 门 ${s.routeWithFlags} · 纯数值入口 ${s.routeNumericOnly} · 隐藏数值门 ${s.routeHidden} · 有上界 ${s.routeUpperBound} · 文本前提无经历门 ${s.routePremiseWithoutFlag} · 写出命途门票 ${s.routeFeedingTrail}`)
  console.log(`命途落点 ${s.destinationCount} 个：死门票 ${s.destinationDeadTicket} · 仍需改写的落点 ${s.routeScopeIssues}`)
  if (report.findings.length) {
    console.log('')
    for (const f of report.findings) {
      console.log(`  [${scopeLabel[f.scope]}/${f.kind}] ${f.where} —— ${f.detail}`)
    }
  } else {
    console.log('  没有需要人工看的门禁。')
  }
}
