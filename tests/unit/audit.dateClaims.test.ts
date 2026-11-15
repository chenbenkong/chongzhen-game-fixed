/**
 * 事件正文首句的「崇祯X年」必须落在该事件年窗内（口径见 `scripts/audit-date-claims.ts`）。
 *
 * 这一条钉的是"读起来像穿越"的一类：年窗 1632，正文却写崇祯五年六月袁崇焕斩毛文龙
 * ——而袁崇焕 1630 年八月已被处死。本轮把整条 1629-1632 辽东链按史实重排后，
 * 这张网负责防止以后再有人只改正文、不改年窗。
 */
import { describe, it, expect } from 'vitest'
import { findDateClaim, scanDateClaims } from '../../scripts/audit-date-claims'
import { allEvents } from '../../scripts/event-pools'

describe('正文首句年份 vs 事件年窗', () => {
  it('阴性对照：年窗内、没有年份、非崇祯年号都不算', () => {
    const cases: [string, string | null][] = [
      ['崇祯五年六月，袁崇焕斩毛文龙。', '崇祯五年'],
      ['崇祯十七年三月十九日，煤山。', '崇祯十七年'],
      ['万历四十四年，福建南安。', null],
      ['这一年的冬天格外冷。', null]
    ]
    for (const [text, raw] of cases) {
      const hit = findDateClaim(text)
      expect(hit?.raw ?? null, text).toBe(raw)
    }
  })

  it('阳性对照：修复前的原句必须能被这张网捞到', () => {
    // 皮岛惊变（修复前）：年窗 1632，正文写崇祯五年
    expect(findDateClaim('崇祯五年六月，蓟辽督师袁崇焕以"十二条罪状"在双岛斩杀毛文龙。')?.claimed).toBe(1632)
    // 吴桥兵变（修复前）：年窗 1632-1633，正文写崇祯四年冬
    expect(findDateClaim('崇祯四年冬，皮岛事件余波未平。')?.claimed).toBe(1631)
    // 松锦溃败（修复前）：年窗 1640-1641，正文写崇祯十三年
    expect(findDateClaim('崇祯十三年，明清两军在锦州、松山一带展开决战。')?.claimed).toBe(1640)
  })

  it('没有任何一处正文首句年份落在年窗外', () => {
    const bad = scanDateClaims(allEvents)
    if (bad.length) {
      const head = bad
        .slice(0, 8)
        .map(b => `${b.id}《${b.title}》年窗 ${b.min}-${b.max} 正文「${b.raw}」=> ${b.claimed}（${b.kind}）`)
        .join('\n')
      expect.fail(
        `有 ${bad.length} 处正文首句年份落在年窗外：\n${head}` + (bad.length > 8 ? `\n…还有 ${bad.length - 8} 处` : '')
      )
    }
    expect(bad).toHaveLength(0)
  })
})
