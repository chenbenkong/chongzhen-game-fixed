/**
 * audit-date-claims —— 事件正文首句写死的「崇祯X年」，必须落在该事件的年份窗里。
 *
 * 为什么单开这一张网：年窗、门票、标签、正文处分都各有脚本盯着，但**没有人比对
 * "正文说自己发生在哪一年" 与 "conditions.year 允许它在哪一年出现"**。
 * 于是出现了一类读起来像穿越的缺陷：
 *   historical_020《皮岛惊变》年窗 1632，正文却写「崇祯五年六月，袁崇焕斩毛文龙」
 *   ——袁崇焕 1630 年八月已经死了，真正斩毛文龙是 1629 年六月；
 *   historical_020_aftermath《吴桥兵变》年窗 1632-1633，正文写「崇祯四年冬」（1631）；
 *   historical_006《登莱兵变》年窗 1631-12，正文写「崇祯四年十二月…兵变一触即发」，
 *   而吴桥兵变 1631 年十一月已经爆发。
 * 这一轮的处理不是把事件整体挪年（那会打散全部模拟取样），而是**年窗不动、正文改成
 * 追论/余波**：皮岛写成「崇祯二年那一刀，三年后再被翻出来」；吴桥写成「崇祯五年九月，
 * 兵变已过半年、孔有德据登州」；登莱写成「崇祯四年十二月，吴桥已反、登州军心浮动」。
 * 年窗不变，随机流与模拟基线不动；正文里的"现在"与年窗对齐。
 *
 * 口径：
 *  - 只取 `narrative.background` 的**前 80 字**（正文第一句就是"现在是什么时候"）。
 *  - 只比对**年份**，不比对月份：月窗常跨季（3-8 月），而正文写"正月"多半是在
 *    回溯前情；月份只作日志输出，不判失败。
 *  - 正文里的年份**晚于**年窗上限，一定是穿越；早于下限，多半是回溯（如
 *    "崇祯十三年，松锦大战开始"出现在 1642 年的事件里）。所以严格判失败的是
 *    "晚于上限"，"早于下限"进入 EXEMPT 复核表，逐条写明是回溯还是错。
 *
 * 复核表（早于下限、确认是回溯/人物小传的）：
 *  - historical_021 三晋大旱：开篇「崇祯六年至七年」跨两年，事件落在 1634（七年）春。
 *  - historical_021_crisis 流寇清算：开篇回顾崇祯七年（1634）的赈灾旧账。
 *  - historical_008_aftermath 中原烽火：开篇回叙崇祯十四年正月洛阳陷落，事件在 3-8 月。
 *  - historical_007 宁远孤守：开篇回叙崇祯十三年松锦开战，事件在 1642 年 2-3 月。
 *  - historical_023 开封之战：开篇回叙「十四年至十五年」三打开封，事件在 1642 年 9 月。
 *  - figure_sun_chuanting：人物小传，开篇崇祯九年（1636）出任陕西巡抚。
 *  - echo_family_003 / echo_faction_002：回响事件，开篇回叙崇祯元年/二年的旧事。
 */
import { allEvents, poolOf } from './event-pools'

const EXEMPT: Record<string, string> = {
  historical_021: '开篇跨崇祯六至七年，事件落在七年春',
  historical_021_crisis: '开篇回叙崇祯七年的赈灾旧账',
  historical_008_aftermath: '开篇回叙崇祯十四年正月洛阳陷落，事件在三月以后',
  historical_007: '开篇回叙崇祯十三年松锦开战，事件在 1642 年',
  historical_023: '开篇回叙崇祯十四至十五年三打开封，事件在 1642 年九月',
  figure_sun_chuanting: '人物小传，开篇崇祯九年出任陕西巡抚',
  echo_family_003: '回响事件，开篇回叙崇祯元年的旧债',
  echo_faction_002: '回响事件，开篇回叙崇祯二年的旧文',
  historical_010: '崇祯十一年十二月 = 公元 1639 年 1 月，农历跨年，年窗取公历'
}

const DIGIT: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function chineseYear(s: string): number {
  if (s === '元') return 1
  if (s === '十') return 10
  if (s.startsWith('十')) return 10 + (DIGIT[s[1]] ?? 0)
  return DIGIT[s] ?? 0
}

export interface DateClaim {
  id: string
  title: string
  min: number
  max: number
  /** 正文首句写下的崇祯年份（公元） */
  claimed: number
  /** 命中原文 */
  raw: string
  /** after = 晚于上限（一定是穿越）；before = 早于下限（需复核是否回溯） */
  kind: 'after' | 'before'
}

/** 从一段正文里取出首句写死的崇祯年份（公元）。取不到返回 null。 */
export function findDateClaim(text: string): { claimed: number; raw: string } | null {
  const head = (text ?? '').replace(/\s+/g, '').slice(0, 80)
  const m = head.match(/崇祯([元一二三四五六七八九十]+)年/)
  if (!m) return null
  const n = chineseYear(m[1])
  if (!n) return null
  return { claimed: 1627 + n, raw: m[0] }
}

/** 返回所有"正文首句年份落在年窗外"的事件（after 一定是错；before 需人工复核）。 */
export function scanDateClaims(events: any[] = allEvents): DateClaim[] {
  const out: DateClaim[] = []
  for (const e of events) {
    const pool = poolOf.get(e?.id) ?? 'pool'
    if (pool === 'ending' || pool === 'triggerable') continue
    const min = e?.conditions?.year?.min
    const max = e?.conditions?.year?.max
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue
    const claim = findDateClaim(e?.narrative?.background ?? '')
    if (!claim) continue
    if (claim.claimed >= min && claim.claimed <= max) continue
    const kind: 'after' | 'before' = claim.claimed > max ? 'after' : 'before'
    if (kind === 'before' && EXEMPT[e.id]) continue
    out.push({ id: e.id, title: e.title, min, max, claimed: claim.claimed, raw: claim.raw, kind })
  }
  return out
}

if (!process.env.VITEST) {
  const bad = scanDateClaims()
  if (!bad.length) {
    console.log('正文首句年份：0 处落在年窗外（回溯段落已在复核表内注明）')
    process.exit(0)
  }
  console.error(`正文首句年份：${bad.length} 处与年窗不符 ——`)
  for (const b of bad) {
    console.error(`  [${b.kind}] ${b.id} 《${b.title}》 年窗 ${b.min}-${b.max}，正文首句「${b.raw}」=> ${b.claimed}`)
  }
  process.exit(1)
}
