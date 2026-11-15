import { describe, expect, it } from 'vitest'
import { scanDuplicateProse, checkThresholds, THRESHOLDS } from '../../scripts/audit-duplicate-prose'
import { allEvents } from '../../scripts/event-pools'
import type { GameEvent } from '../../src/types/event'

/**
 * 重复段落看门狗（audit-duplicate-prose）的钉死用例。
 *
 * 阈值不是随便填的，理由如下：
 *  - 2026-11-15 按本脚本口径（barrel 全量、归一长度 ≥6、段落级、≥2 个不同位置）实测：
 *    散文 801 组 / 2,187 次，覆盖重复率 10.99%，冗余率 7.02%，单组最大 15 次，≥8 次仅 1 组
 *    （那 1 组是 `endingDecline.ts` 引擎注入 15 张搁笔卡的共享 resultDescription，
 *    不改那个文件拆不开，属已知存量）。
 *  - 阈值 = 上述存量 + 余量：组数/次数/两个率各留约一成到两成 headroom，
 *    低计数（2~7 次）的近义残句不会误红；新出现的整段照抄大队列（单组 ≥19 次、
 *    或 ≥8 次组数突破 4）才会被拦下。
 *  - 标签字段（result.title / choice.text / 话者称谓）是同类事件按设计复用的短标题，
 *    单独统计、不进失败判定；所以下面有专门用例证明标题复用不会触发越界。
 */

const ev = (over: Partial<GameEvent>): GameEvent =>
  ({ id: 'synthetic_dup_ev', title: '合成事件', type: 'transition', conditions: {}, choices: [], ...over }) as unknown as GameEvent

const withEcho = (id: string, echo: string) =>
  ev({ id, choices: [{ id: 'c1', text: '选它', effects: {}, result: { title: '结果', echo, tags: [] } }] as any })

const echoOf = (events: GameEvent[]) => scanDuplicateProse(events).proseGroups[0]

describe('重复段落体检：真实数据存量在阈值余量内', () => {
  it('扫描面不空转：事件与散文条目都在量级以上', () => {
    const report = scanDuplicateProse(allEvents as unknown as GameEvent[])
    expect(report.eventsScanned, '事件池不许空转').toBeGreaterThan(400)
    expect(report.proseStrings, '散文条目不许空转').toBeGreaterThan(5000)
  })

  it('真实数据不越界：checkThresholds 返回空数组', () => {
    const report = scanDuplicateProse(allEvents as unknown as GameEvent[])
    expect(checkThresholds(report), '存量低计数残句与搁笔合成句都在余量内，不应判红').toEqual([])
  })

  it('钉住当前存量量级，防止阈值被悄悄放宽到失去拦截力', () => {
    const t = scanDuplicateProse(allEvents as unknown as GameEvent[]).totals
    // 这些是改后实测值；若未来整段复制被清掉，数值只许往下走，不许在没改阈值说明的情况下抬上来
    expect(t.proseGroups).toBeLessThanOrEqual(THRESHOLDS.proseGroupsMax)
    expect(t.proseOccurrences).toBeLessThanOrEqual(THRESHOLDS.proseOccurrencesMax)
    expect(t.proseRateOcc).toBeLessThanOrEqual(THRESHOLDS.proseRateOccMax)
    expect(t.proseRateSurplus).toBeLessThanOrEqual(THRESHOLDS.proseRateSurplusMax)
    expect(t.proseMaxCount).toBeLessThanOrEqual(THRESHOLDS.proseMaxCountMax)
    expect(t.proseGroupsGe8).toBeLessThanOrEqual(THRESHOLDS.proseGroupsGe8Max)
  })
})

describe('重复检测阳性/阴性夹具', () => {
  it('阳性：两段完全相同的 echo 必须聚成一组、次数为 2', () => {
    const dup = '你把难处顶了回去，百姓得了实惠，御前却落了个替民要价的印象。'
    const events = [withEcho('syn_dup_a', dup), withEcho('syn_dup_b', dup)]
    const report = scanDuplicateProse(events)
    expect(report.proseGroups).toHaveLength(1)
    expect(report.proseGroups[0].count).toBe(2)
    expect(report.proseGroups[0].occurrences.map(o => o.eventId).sort()).toEqual(['syn_dup_a', 'syn_dup_b'])
  })

  it('阴性：两段语义相近但文字不同，不该被归一硬并成一组', () => {
    const events = [
      withEcho('syn_clean_a', '你替地方求来接济，民间念你的情，上头却觉得你多事。'),
      withEcho('syn_clean_b', '民生因你稍得安顿，百姓记你的好，只是上面看在眼里颇有微词。')
    ]
    expect(scanDuplicateProse(events).proseGroups).toEqual([])
  })

  it('短于归一长度下限的句子不聚类（反空转：别拿碎词凑重复组）', () => {
    const events = [withEcho('syn_short_a', '甚好。'), withEcho('syn_short_b', '甚好。')]
    expect(scanDuplicateProse(events).proseGroups).toEqual([])
  })

  it('标签复用不进散文判定：相同 result.title 只进 labelGroups，checkThresholds 仍通过', () => {
    const title = '静观其变，避过风波'
    const events = [
      ev({ id: 'syn_label_a', choices: [{ id: 'c1', text: '选它', effects: {}, result: { title, echo: '回音甲', tags: [] } }] as any }),
      ev({ id: 'syn_label_b', choices: [{ id: 'c1', text: '选它', effects: {}, result: { title, echo: '回音乙', tags: [] } }] as any })
    ]
    const report = scanDuplicateProse(events)
    expect(report.labelGroups).toHaveLength(1)
    expect(report.proseGroups).toEqual([])
    expect(checkThresholds(report)).toEqual([])
  })
})

describe('阈值闸门真的会拦', () => {
  it('阳性闸门：19 个事件照抄同一段 echo，单组次数破上限，checkThresholds 报越界', () => {
    const copied = '你坐在金银堆中，听着外面百姓的哀嚎，心中是否有一丝不安。'
    const events = Array.from({ length: 19 }, (_, i) => withEcho(`syn_flood_${i}`, copied))
    const report = scanDuplicateProse(events)
    expect(report.totals.proseMaxCount).toBe(19)
    const violations = checkThresholds(report)
    expect(violations.some(v => v.metric === 'proseMaxCountMax')).toBe(true)
  })

  it('阴性闸门：足量语料里零星两处重复不触发任何越界项', () => {
    // 比率闸门是相对整库字符数算的；合成夹具若只放两段，分母过小会把比率抬上去，
    // 所以先铺一批互不相同的干净回音稀释分母，再放那一处两处重复。
    const clean = Array.from({ length: 18 }, (_, i) =>
      withEcho(`syn_clean_${i}`, `这是第 ${i + 1} 桩互不相同的寻常回音，各自交代本桩差事的来龙去脉。`))
    const dup = '一段干净利落、只出现两次的寻常回音。'
    const events = [...clean, withEcho('syn_ok_a', dup), withEcho('syn_ok_b', dup)]
    expect(checkThresholds(scanDuplicateProse(events))).toEqual([])
  })
})
