/**
 * 正文里的处分声称必须和存档对得上（见 `scripts/audit-narrative-claims.ts` 的口径）。
 *
 * 这一条钉的是一个**只有在玩家眼里才算 bug** 的类别：数据形状全绿，
 * 玩家却读到自己"革职下狱、家产抄没"，下个月照常上朝。
 * 本轮清掉的五处：
 *   gray_informer_002/c1「你被革职下狱」→ 改成条件句（东厂拿到口供才会发生）
 *   historical_004/c1「贬为庶民」→ 只保留廷杖（体伤不作持久状态）
 *   route_loyal_minister/c1「贬了一级」→ 改成弹章留中、考语添字
 *   route_impeach_ministers/c2「贬到岭南」→ 改成留中 + 送匾
 *   route_faction_imprisoned/c1「着即下锦衣卫诏狱勘问」→ 改成停职待勘（下一道才是诏狱）
 */
import { describe, it, expect } from 'vitest'
import { scanNarrativeClaims, findHardClaims } from '../../scripts/audit-narrative-claims'
import { allEvents } from '../../scripts/event-pools'

describe('正文处分声称 vs 存档', () => {
  it('阳性对照：修复前的原句必须能被这张网捞到（否则它只是摆设）', () => {
    const wasLies = [
      '你被革职下狱，家产抄没。',
      '你被连降三级，贬为庶民。',
      '你作为"同谋"被革职查办。',
      '你以"协从"论，降一级调用，不许升转。',
      '你被切责、罚俸、降一级留任。',
      '圣旨下来：着即下锦衣卫诏狱勘问。'
    ]
    for (const s of wasLies) expect(findHardClaims(s).length, s).toBeGreaterThan(0)
  })

  it('阴性对照：体伤 / 罚俸 / 留任 / 别人被贬 不算身份变更', () => {
    const notLies = [
      '你被廷杖三十，抬回寓所。',
      '你被切责、罚俸一年，留任原职。',
      '你上疏为被下狱的言官辩护。',
      '被你弹劾的阉党余孽被革职查办。',
      '在你的运作下，这几位大臣被革职查办。',
      '对于无力缴纳的百姓，你毫不留情，抄家封门。',
      '东厂一纸弹章递上去，"包庇反贼"四个字就能钉死你；抄家的旨意当天就能拟好。'
    ]
    for (const s of notLies) expect(findHardClaims(s), s).toEqual([])
  })

  it('没有任何一处正文写了处分、数据却没留痕', () => {
    const bad = scanNarrativeClaims(allEvents)
    if (bad.length) {
      const head = bad
        .slice(0, 8)
        .map(b => `${b.id}/${b.choiceId}「${b.sentence}」flags=${b.flags.join('、') || '无'}`)
        .join('\n')
      expect.fail(
        `有 ${bad.length} 处正文声称了身份变更（革职/下狱/抄家/流放/贬），但这一选没有写任何状态 flag：\n${head}` +
          (bad.length > 8 ? `\n…还有 ${bad.length - 8} 处` : '')
      )
    }
    expect(bad).toHaveLength(0)
  })
})
