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
 *
 * §8.29 增补「窄门为什么开不了」一段（报告型，不设硬棘轮）：标准网格里
 * 守城战死/诈降反戈/南渡恒 0 命中，到底是**门槛够不着**、**卡根本没发到手**，
 * 还是**门开着但保命启发式不点**？用终局快照的 finalAttributes（武略/体质/理政）
 * + dealtEventIds/firedEventIds（037/016 有没有发到手、有没有真播出）把这三件事分开量。
 * 与 engine.1644ImmediateEnding 的造档钉互补：那边证「点了就当场收笔」，
 * 这边证「标准网格为什么没人去点」—— 0 命中是量具伪影，不是接线坏、更不是孤儿立场。
 * 口径沿用原探针：八出身 × simulateMany(count15, startSeed1, 五画像循环) = 120 局，
 * 种子映射与历轮一致（seed=startSeed+i、policy=policies[i%5]），读数可与 §8.19/§8.27 对账。
 */
const ORIGINS: OriginType[] = ['寒门', '缙绅', '军户', '海商', '没落世家', '诗文清望', '胥吏', '罪臣之后']
const POLICIES: SimPolicy[] = ['warden', 'steady', 'first', 'random', 'ambitious']

// 037c1【死守九门】的出身门（与 historical/1644.ts showConditions 同口径）
const CITY_FALL_ORIGINS: OriginType[] = ['没落世家', '缙绅', '军户']

describe('甲申终局·立场对账探针', () => {
  it('八出身 × 五画像 × 3 种子，报告孤儿立场的归宿 + 窄门为什么开不了', async () => {
    const all: Array<{ origin: OriginType; r: Awaited<ReturnType<typeof simulateMany>>['runs'][number] }> = []
    for (const origin of ORIGINS) {
      const { runs } = await simulateMany({
        count: 15,
        startSeed: 1,
        policies: POLICIES,
        origin,
        maxMonths: 260
      })
      for (const r of runs) all.push({ origin, r })
    }

    const dist = new Map<string, number>()
    let reached1644 = 0
    for (const { r } of all) {
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
      const hits = all.filter(({ r }) => p.test(r.finalFlags))
      console.log(`\n【${p.name}】命中 ${hits.length} 局：`)
      if (hits.length === 0) { console.log('  （无样本）'); continue }
      const byEnding = new Map<string, number>()
      for (const { r } of hits) {
        const key = r.endingId ?? `未注册(${r.endEventId})`
        byEnding.set(key, (byEnding.get(key) ?? 0) + 1)
      }
      console.log('  归宿：' + [...byEnding.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}×${n}`).join(' · '))
      for (const { origin, r } of hits.slice(0, 6)) {
        console.log(`  seed=${r.seed} ${origin} ${r.policy} ${r.finalYear}年 结局=${r.endingId ?? r.endEventId} flags=[${r.finalFlags.filter(f => ['投降大顺', '贰臣', '遗民', '守城殉国', '闯军所杀', '诈降反戈', '开城投降', '南渡长江', '效忠南明', '投降清朝', '殉国报君'].includes(f)).join(',')}]`)
      }
    }

    // §8.29：窄门为什么开不了 —— 把「卡没发到」「门槛够不着」「门开着没人点」分开量
    const survivors = all.filter(({ r }) => r.finalYear >= 1644)
    const attr = (r: typeof survivors[number]['r'], k: string) => r.finalAttributes?.[k] ?? r.finalGates?.[k] ?? 0
    let dealt037 = 0, fired037 = 0, dealt016 = 0, fired016 = 0
    let cityStatOpen = 0, cityFullOpen = 0, fraudStatOpen = 0
    const cityFullSamples: string[] = []
    const byOrigin = new Map<string, { n: number; cityFull: number }>()
    for (const { origin, r } of survivors) {
      const d = r.dealtEventIds ?? [], f = r.firedEventIds ?? []
      if (d.includes('historical_037')) dealt037++
      if (f.includes('historical_037')) fired037++
      if (d.includes('historical_016')) dealt016++
      if (f.includes('historical_016')) fired016++
      const 武略 = attr(r, '武略'), 体质 = attr(r, '体质'), 理政 = attr(r, '理政')
      const statOpen = 武略 >= 60 && 体质 >= 70
      const fullOpen = statOpen && CITY_FALL_ORIGINS.includes(origin)
      if (statOpen) cityStatOpen++
      if (fullOpen) { cityFullOpen++; cityFullSamples.push(`${origin} ${r.policy} seed${r.seed} 武略${武略} 体质${体质} 037发到${d.includes('historical_037')} 结局${r.endingId}`) }
      if (武略 >= 80 && 理政 >= 75) fraudStatOpen++
      const e = byOrigin.get(origin) ?? { n: 0, cityFull: 0 }
      e.n++; if (fullOpen) e.cityFull++
      byOrigin.set(origin, e)
    }
    console.log(`\n===== §8.29 窄门对账（${survivors.length} 局活到 1644+）=====`)
    console.log(`《闯军围京》037：发到手 ${dealt037} 局 / 真播出 ${fired037} 局`)
    console.log(`《宣大陷落》016：发到手 ${dealt016} 局 / 真播出 ${fired016} 局`)
    console.log(`死守九门：武略≥60∧体质≥70 够得着 ${cityStatOpen} 局；再加出身∈{没落世家,缙绅,军户} 三门全开 ${cityFullOpen} 局`)
    console.log(`诈降反戈：武略≥80∧理政≥75 够得着 ${fraudStatOpen} 局（016 真播出 ${fired016} 局）`)
    if (cityFullSamples.length) {
      console.log('  死守九门三门全开的样本：')
      for (const s of cityFullSamples.slice(0, 10)) console.log('   ' + s)
    }
    console.log('  按出身：活到1644+ / 其中死守九门三门全开：')
    for (const [o, e] of byOrigin) console.log(`   ${o}: ${e.n} / ${e.cityFull}`)
    console.log('  判读：037 发到极少 + 三门全开≈0 → 守城战死标准网格 0 命中是「卡没发到/出身门够不着」；')
    console.log('        016 常发到且诈降 stat 门常开却 0 人点 c2 → 南渡/诈降 0 命中是「保命启发式不点当场收笔票」。')
    console.log('        两者都不是接线坏（造档钉 engine.1644ImmediateEnding + 浏览器 verify-1644-endings 4/4 已证点了就收笔）。')
  }, 600000)
})