import { describe, it } from 'vitest'
import { simulateMany, type SimPolicy } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 甲申终局·立场对账探针。
 *
 * 量的是「玩家在 1644 年表过的态，最后有没有被一格结局接住」：
 * 降顺（投降大顺且非贰臣）、遗民、守城战死（守城殉国/闯军所杀）、
 * 诈降反戈、开城投降 —— 这几段经历若没有任何结局正面读它，
 * 玩家就会掉进《甲申国变》见证格甚至《寿终正寝》，与他这一生怎么活过来无关。
 *
 * 先跑一遍拿改动前的分布（§9 铁律），实现后再跑同一批对照。
 */
const ORIGINS: OriginType[] = ['寒门', '缙绅', '军户', '海商', '没落世家', '诗文清望', '胥吏', '罪臣之后']
const POLICIES: SimPolicy[] = ['warden', 'steady', 'first', 'random', 'ambitious']

describe('甲申终局·立场对账探针', () => {
  it('八出身 × 五画像 × 3 种子，报告孤儿立场的归宿', async () => {
    const all = []
    for (const origin of ORIGINS) {
      const { runs } = await simulateMany({
        count: 15,
        startSeed: 1,
        policies: POLICIES,
        origin,
        maxMonths: 260
      })
      all.push(...runs)
    }

    const dist = new Map<string, number>()
    let reached1644 = 0
    for (const r of all) {
      if (r.endingId) dist.set(r.endingId, (dist.get(r.endingId) ?? 0) + 1)
      if (r.finalYear >= 1644) reached1644++
    }
    console.log(`\n===== 甲申立场探针：${all.length} 局，活到 1644+ 的 ${reached1644} 局 =====`)
    console.log('结局分布：')
    console.log([...dist.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}×${n}`).join(' · '))

    const probes: Array<{ name: string; test: (f: string[]) => boolean }> = [
      { name: '纯降顺(投降大顺∧非贰臣)', test: f => f.includes('投降大顺') && !f.includes('贰臣') },
      { name: '遗民', test: f => f.includes('遗民') },
      { name: '守城战死(守城殉国/闯军所杀)', test: f => f.includes('守城殉国') || f.includes('闯军所杀') },
      { name: '诈降反戈', test: f => f.includes('诈降反戈') },
      { name: '开城投降', test: f => f.includes('开城投降') }
    ]
    for (const p of probes) {
      const hits = all.filter(r => p.test(r.finalFlags))
      console.log(`\n【${p.name}】命中 ${hits.length} 局：`)
      if (hits.length === 0) { console.log('  （无样本）'); continue }
      const byEnding = new Map<string, number>()
      for (const r of hits) {
        const key = r.endingId ?? `未注册(${r.endEventId})`
        byEnding.set(key, (byEnding.get(key) ?? 0) + 1)
      }
      console.log('  归宿：' + [...byEnding.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}×${n}`).join(' · '))
      for (const r of hits.slice(0, 6)) {
        console.log(`  seed=${r.seed} ${r.policy} ${r.finalYear}年 结局=${r.endingId ?? r.endEventId} flags=[${r.finalFlags.filter(f => ['投降大顺', '贰臣', '遗民', '守城殉国', '闯军所杀', '诈降反戈', '开城投降', '南渡长江', '效忠南明', '投降清朝', '殉国报君'].includes(f)).join(',')}]`)
      }
    }
  }, 600000)
})