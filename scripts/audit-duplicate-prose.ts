import { allEvents } from './event-pools'
import type { GameEvent } from '../src/types/event'

/**
 * 玩家可见正文的跨位置重复体检（重复段落看门狗）。
 *
 * 口径与只读审计 `duplicate-groups` 报告一致：
 *  - 归一：NFKC 折叠全半角 → 转小写 → 去全部空白 → 去中英文标点；
 *  - 切分：段落按换行，句子按 。！？；…；归一后长度 < 6 字不聚类；
 *  - 判定：同一归一文本出现在 ≥2 个不同位置（eventId / choiceIndex / field）即算一组；
 *  - 字段：事件 title/description；narrative.speaker.name/title/quote/background/situation；
 *    choice.text/quote/description/resultDescription；result.title/echo；
 *    failResultDescription/failResult.title/echo；tags[] 单列，不并入散文聚类。
 *
 * 标签字段（result.title / choice.text / 话者 name/title）是同类事件按设计复用的
 * 短标题/称谓，单独统计、不参与失败判定；看门狗只拦散文正文的大面积复制。
 */

const MIN_NORM_LEN = 6

const PUNCT_RE = /[\s，。！？；：、“”‘’《》（）()【】「」『』〈〉—…·～～.,!?;:"'`~@#$%^&*\-_=+|\\/[\]{}<>…·]/g

/** 标签类字段：按设计在同类事件间复用，单独成组、不进失败判定 */
const LABEL_FIELDS = new Set([
  'result.title',
  'choice.text',
  'narrative.speaker.name',
  'narrative.speaker.title'
])

const EVENT_FIELDS = ['title', 'description'] as const
const CHOICE_FIELDS = ['text', 'quote', 'description', 'resultDescription'] as const

export interface DupOccurrence {
  eventId: string
  choiceIndex: number | null
  field: string
  where: string
}

export interface DupGroup {
  text: string
  count: number
  norm: string
  distinctEvents: number
  label: boolean
  occurrences: DupOccurrence[]
}

export interface DupTotals {
  groups: number
  occurrences: number
  occChars: number
  surplusChars: number
  rateOcc: number
  rateSurplus: number
  proseGroups: number
  proseOccurrences: number
  proseRateOcc: number
  proseRateSurplus: number
  maxCount: number
  proseMaxCount: number
  groupsGe8: number
  proseGroupsGe8: number
}

export interface DupReport {
  eventsScanned: number
  proseStrings: number
  proseCharsTotal: number
  allCharsTotal: number
  groups: DupGroup[]
  proseGroups: DupGroup[]
  labelGroups: DupGroup[]
  totals: DupTotals
}

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(PUNCT_RE, '')
}

function splitParagraphs(text: string): string[] {
  return text.split(/\r?\n+/).map(s => s.trim()).filter(Boolean)
}

interface RawOcc {
  eventId: string
  choiceIndex: number | null
  field: string
  raw: string
  label: boolean
}

function collectOccurrences(events: GameEvent[]): RawOcc[] {
  const occs: RawOcc[] = []
  const push = (eventId: string, choiceIndex: number | null, field: string, raw: unknown) => {
    if (typeof raw !== 'string') return
    const t = raw.trim()
    if (!t) return
    occs.push({ eventId, choiceIndex, field, raw: t, label: LABEL_FIELDS.has(field) })
  }

  for (const e of events) {
    if (!e || typeof e.id !== 'string') continue
    for (const f of EVENT_FIELDS) push(e.id, null, f, (e as any)[f])
    const n = e.narrative
    if (n && typeof n === 'object') {
      push(e.id, null, 'narrative.speaker.name', n.speaker?.name)
      push(e.id, null, 'narrative.speaker.title', n.speaker?.title)
      push(e.id, null, 'narrative.quote', n.quote)
      push(e.id, null, 'narrative.background', n.background)
      push(e.id, null, 'narrative.situation', n.situation)
    }
    ;(e.choices ?? []).forEach((c, i) => {
      if (!c || typeof c !== 'object') return
      for (const f of CHOICE_FIELDS) push(e.id, i, `choice.${f}`, (c as any)[f])
      if (c.result && typeof c.result === 'object') {
        push(e.id, i, 'result.title', c.result.title)
        push(e.id, i, 'result.echo', c.result.echo)
      }
      push(e.id, i, 'choice.failResultDescription', c.failResultDescription)
      if (c.failResult && typeof c.failResult === 'object') {
        push(e.id, i, 'failResult.title', c.failResult.title)
        push(e.id, i, 'failResult.echo', c.failResult.echo)
      }
    })
  }
  return occs
}

function cluster(occs: RawOcc[]): DupGroup[] {
  const map = new Map<string, DupGroup & { label: boolean }>()
  for (const o of occs) {
    for (const unit of splitParagraphs(o.raw)) {
      const n = norm(unit)
      if (n.length < MIN_NORM_LEN) continue
      let g = map.get(n)
      if (!g) {
        g = { text: unit, count: 0, norm: n, distinctEvents: 0, label: o.label, occurrences: [] }
        map.set(n, g)
      }
      g.occurrences.push({
        eventId: o.eventId,
        choiceIndex: o.choiceIndex,
        field: o.field,
        where: `${o.eventId}${o.choiceIndex == null ? '' : `.choices[${o.choiceIndex}]`}.${o.field}`
      })
      g.count++
    }
  }
  const groups = [...map.values()].map(g => {
    const seen = new Set<string>()
    g.occurrences = g.occurrences.filter(o => {
      const k = [o.eventId, o.choiceIndex, o.field, g.norm].join('|')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    g.count = g.occurrences.length
    g.distinctEvents = new Set(g.occurrences.map(o => o.eventId)).size
    return g
  })
  return groups.filter(g => g.count >= 2).sort((a, b) => b.count - a.count || b.norm.length - a.norm.length)
}

/**
 * 扫描事件池，返回段落级重复分组与读数。
 * 传入合成事件数组即可在测试里做阳性/阴性夹具。
 */
export function scanDuplicateProse(events: GameEvent[]): DupReport {
  // 同一 eventId 被二次挂载时只留首份，避免虚增（与 event-pools 既有对账口径一致）
  const seenIds = new Set<string>()
  const deduped: GameEvent[] = []
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || seenIds.has(e.id)) continue
    seenIds.add(e.id)
    deduped.push(e)
  }

  const occs = collectOccurrences(deduped)
  const groups = cluster(occs)
  const proseGroups = groups.filter(g => !g.label)
  const labelGroups = groups.filter(g => g.label)

  const stripWs = (s: string) => s.normalize('NFKC').replace(/\s+/g, '')
  const proseCharsTotal = occs.filter(o => !o.label).reduce((acc, o) => acc + stripWs(o.raw).length, 0)
  const allCharsTotal = occs.reduce((acc, o) => acc + stripWs(o.raw).length, 0)

  const sum = (gs: DupGroup[], pick: (g: DupGroup) => number) => gs.reduce((a, g) => a + pick(g), 0)
  const occChars = (gs: DupGroup[]) => sum(gs, g => g.norm.length * g.count)
  const surplusChars = (gs: DupGroup[]) => sum(gs, g => g.norm.length * (g.count - 1))

  const totals: DupTotals = {
    groups: groups.length,
    occurrences: sum(groups, g => g.count),
    occChars: occChars(groups),
    surplusChars: surplusChars(groups),
    rateOcc: allCharsTotal ? occChars(groups) / allCharsTotal : 0,
    rateSurplus: allCharsTotal ? surplusChars(groups) / allCharsTotal : 0,
    proseGroups: proseGroups.length,
    proseOccurrences: sum(proseGroups, g => g.count),
    proseRateOcc: proseCharsTotal ? occChars(proseGroups) / proseCharsTotal : 0,
    proseRateSurplus: proseCharsTotal ? surplusChars(proseGroups) / proseCharsTotal : 0,
    maxCount: groups[0]?.count ?? 0,
    proseMaxCount: proseGroups[0]?.count ?? 0,
    groupsGe8: groups.filter(g => g.count >= 8).length,
    proseGroupsGe8: proseGroups.filter(g => g.count >= 8).length
  }

  return {
    eventsScanned: deduped.length,
    proseStrings: occs.filter(o => !o.label).length,
    proseCharsTotal,
    allCharsTotal,
    groups,
    proseGroups,
    labelGroups,
    totals
  }
}

/**
 * 阈值（改后现状 + 合理余量）。
 *
 * 设定理由（2026-11-15 改后实测，barrel 全量事件池）：
 *  - 散文侧存量大头是 count 2~7 的低计数近义残句与 1 组引擎注入的搁笔合成句；
 *    阈值留出余量，不因这些存量误红；
 *  - 一旦出现新的大面积整段复制（某段被 ≥8 个事件照抄、或重复率/冗余率明显抬升），
 *    对应闸门先红。标签类短标题/称谓是设计复用，不在失败判定内。
 */
export const THRESHOLDS = {
  /** 散文重复组数上限（存量低计数残句 + 余量） */
  proseGroupsMax: 900,
  /** 散文重复出现次数上限 */
  proseOccurrencesMax: 2400,
  /** 散文覆盖重复率上限（占散文去空白字符数） */
  proseRateOccMax: 0.13,
  /** 散文冗余率上限（去首份副本占比） */
  proseRateSurplusMax: 0.09,
  /** 单组最大次数上限（挡住新出现的整段照抄大队列） */
  proseMaxCountMax: 18,
  /** ≥8 次散文组数上限（存量仅 1 组引擎注入合成句，余量给到 4） */
  proseGroupsGe8Max: 4
} as const

export interface ThresholdViolation {
  metric: string
  actual: number
  limit: number
  detail: string
}

/** 按阈值判定；返回越界项（空数组即通过）。只判散文侧，标签复用不计。 */
export function checkThresholds(report: DupReport): ThresholdViolation[] {
  const t = THRESHOLDS
  const v = report.totals
  const violations: ThresholdViolation[] = []
  const push = (metric: keyof typeof t, actual: number, limit: number, detail: string) => {
    if (actual > limit) violations.push({ metric, actual, limit, detail })
  }
  push('proseGroupsMax', v.proseGroups, t.proseGroupsMax, '散文重复组数超过存量余量')
  push('proseOccurrencesMax', v.proseOccurrences, t.proseOccurrencesMax, '散文重复出现次数超过存量余量')
  push('proseRateOccMax', v.proseRateOcc, t.proseRateOccMax, '散文覆盖重复率超过阈值')
  push('proseRateSurplusMax', v.proseRateSurplus, t.proseRateSurplusMax, '散文冗余率超过阈值')
  push('proseMaxCountMax', v.proseMaxCount, t.proseMaxCountMax, '出现单组过大的整段照抄')
  push('proseGroupsGe8Max', v.proseGroupsGe8, t.proseGroupsGe8Max, '≥8 次的散文重复组数超过余量')
  return violations
}

function formatPct(x: number): string {
  return (x * 100).toFixed(2) + '%'
}

// 与其余体检脚本同一口径：被测试 import 时不打印
if (!process.env.VITEST) {
  const report = scanDuplicateProse(allEvents as unknown as GameEvent[])
  const t = report.totals
  console.log(`重复段落体检：事件 ${report.eventsScanned} 个，散文条目 ${report.proseStrings}，散文字符(去空白) ${report.proseCharsTotal}`)
  console.log(`段落重复：${t.groups} 组 / ${t.occurrences} 次（其中散文 ${t.proseGroups} 组 / ${t.proseOccurrences} 次，标签复用 ${report.labelGroups.length} 组）`)
  console.log(`覆盖重复率 ${formatPct(t.rateOcc)}，冗余率 ${formatPct(t.rateSurplus)}；散文覆盖 ${formatPct(t.proseRateOcc)}，散文冗余 ${formatPct(t.proseRateSurplus)}`)
  console.log(`单组最大次数 ${t.maxCount}（散文 ${t.proseMaxCount}）；≥8 次 ${t.groupsGe8} 组（散文 ${t.proseGroupsGe8} 组）`)

  const violations = checkThresholds(report)
  const top = report.proseGroups.slice(0, 20)
  console.log(`\n=== 散文 Top ${top.length} ===`)
  top.forEach((g, i) => console.log(`  ${String(i + 1).padStart(2)}. x${g.count}  ${g.text.replace(/\s+/g, ' ').slice(0, 60)}`))

  const isCheck = process.argv.includes('--check')
  if (isCheck) {
    if (violations.length) {
      console.log(`\n✗ --check 未通过：${violations.length} 项越界`)
      for (const v of violations) console.log(`  [${v.metric}] 实测 ${v.actual} > 上限 ${v.limit}（${v.detail}）`)
      process.exitCode = 1
    } else {
      console.log('\n✓ --check 通过：散文重复量在阈值余量内')
    }
  }
}
