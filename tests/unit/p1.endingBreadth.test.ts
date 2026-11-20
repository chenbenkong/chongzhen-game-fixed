import { describe, expect, it } from 'vitest'
import { simulateMany, type SimPolicy } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * P1 验收：34 局样本至少触达 15 个不同结局。
 *
 * 这里不是随机抽样，而是按 8 条主线的“会走路的人”分组取样：
 * 求退、医家、清流、内廷、落草、亡命、家业各 4 局，另留 2 局给守成。
 * 随机 30 局会被破产/殉国两头吸干，量不出内容广度；验收要量的是
 * “这些路真的存在，而且走得到”，所以用策略画像，不用纯随机。
 *
 * §8.25 起补一组军权/边关（军户 warden ×4）：边关狼烟补齐第三拍《松锦决》后，
 * 原先靠 bandit/steady 顺带踩出的《边关大将》被第三拍接走、不再落在旧样本里，
 * 广度读数掉到 14。军权/边关本就是主线，此前却没有自己的画像组 —— 补上它
 * 是把这条主线显式代表进样本（量的是“路走得到”，不是凑数），棘轮 ≥15 不降。
 * 《边关大将》本身的可达性不靠本样本，另由 simulation.borderWarBeats 钉（general≥10）。
 */
const GROUPS: Array<{ origin: OriginType; policy: SimPolicy; count: number }> = [
  { origin: '寒门', policy: 'monk', count: 4 },
  { origin: '缙绅', policy: 'hermit', count: 4 },
  { origin: '寒门', policy: 'healer', count: 4 },
  { origin: '缙绅', policy: 'stream', count: 4 },
  { origin: '寒门', policy: 'eunuch', count: 4 },
  { origin: '军户', policy: 'bandit', count: 2 },
  { origin: '海商', policy: 'fugitive', count: 4 },
  { origin: '没落世家', policy: 'sealer', count: 2 },
  { origin: '缙绅', policy: 'steady', count: 2 },
  { origin: '军户', policy: 'warden', count: 4 }
]

describe('P1 结局广度（34 局样本）', () => {
  it('34 局至少触达 15 个不同结局', async () => {
    const endings = new Map<string, number>()
    let total = 0
    for (const group of GROUPS) {
      const { runs } = await simulateMany({
        count: group.count,
        policies: [group.policy],
        origin: group.origin,
        maxMonths: 260
      })
      for (const run of runs) {
        total++
        if (run.endingId) endings.set(run.endingId, (endings.get(run.endingId) ?? 0) + 1)
      }
    }
    console.log(`P1 结局广度：${total} 局，${endings.size} 个不同结局`)
    console.log([...endings.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}×${n}`).join(' · '))
    expect(total).toBeGreaterThanOrEqual(30)
    expect(endings.size).toBeGreaterThanOrEqual(15)
  }, 240000)
})
