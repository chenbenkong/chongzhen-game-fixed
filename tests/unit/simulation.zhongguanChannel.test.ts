import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 第三十九轮：§1.4 ② 的验收 —— 中官低位时那条「内廷门路」。
 *
 * §1.4 ⑭ 留下一句话：「真要动 ②，就从这张表验收」。这张表的口径是
 * `random` + `ambitious` × 四种出身，其中 寒门 / 诗文清望 的头号死因都是中官归零
 * （200 局里 57 局，36 局来自开局中官 22 的诗文清望）。
 *
 * 这个文件就是那句话的测试版本，只取最刺眼的两个出身。它**不是**
 * `simulation.originLongevity.test.ts` 那条出身棘轮：这里不量出身差距，
 * 也不把 random 组塞进"局长/触达"那四条阈值里 —— 只量一条渠道有没有真的接上、
 * 接上之后中官归零的死法有没有少。
 *
 * 阈值是 50 局 × 双策略（100 局/出身）实测出来的：
 *   修复前 寒门 44/100、诗文 78/100（合计 122/200 = 61%）
 *   修复后 寒门 26/100、诗文 65/100（合计  91/200 = 46%）
 * 这里用 30 局 × 双策略（60 局/出身，合计 120 局）跑同一个口径，
 * 阈值取 64（53%）—— 离实测 46% 留 7 个点，离修复前 61% 留 8 个点。
 * 采样更小会有波动，但这个差值不是一两个种子能翻过去的。
 */
const ORIGINS: OriginType[] = ['寒门', '诗文清望']
const POLICIES = ['random', 'ambitious'] as const
const SEEDS = 30
const CHANNEL_EVENT_ID = 'boundary_inner_court_channel'

const runs: SimOutcome[] = []

const fmt = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(1)

beforeAll(async () => {
  for (const origin of ORIGINS) {
    for (const policy of POLICIES) {
      const group: SimOutcome[] = []
      for (let seed = 1; seed <= SEEDS; seed++) {
        const run = await simulateRun({ seed, policy, origin, maxMonths: 260 })
        group.push(run)
        runs.push(run)
      }
      const zeroed = group.filter(r => (r.finalThresholds['中官'] ?? 99) <= 0)
      const fired = group.filter(r => r.firedEventIds.includes(CHANNEL_EVENT_ID))
      console.log(
        `  ${origin} × ${policy}（${group.length} 局）：中官归零 ${zeroed.length}，` +
          `门路 ${fired.length} 局，平均 ${fmt(group.map(r => r.months))} 月`
      )
    }
  }
  const allFired = runs.filter(r => r.firedEventIds.includes(CHANNEL_EVENT_ID))
  const allZero = runs.filter(r => (r.finalThresholds['中官'] ?? 99) <= 0)
  console.log(
    `  合计 ${runs.length} 局：中官归零 ${allZero.length}，门路触达 ${allFired.length} 局，` +
      `平均 ${fmt(runs.map(r => r.months))} 月`
  )
  // 未加渠道时同一批 50 种子的实测均值是 26.9 月；这里只打印，不拿它当阈值 ——
  // 寿命会被太多东西影响，这条渠道的验收只看中官归零与触达。
}, 300_000)

describe('第三十九轮：中官低位渠道的验收（§1.4 ② × ⑭）', () => {
  it('模拟本身跑得干净（否则下面的读数不成立）', () => {
    expect(runs.filter(r => r.error).map(r => `${r.seed} ${r.error}`), '模拟中途抛异常').toEqual([])
    expect(runs.filter(r => r.badNumbers.length).map(r => String(r.seed)), '终局存在非有限数值').toEqual([])
    expect(runs.filter(r => !r.ended).length, '每局都该在时限内结束').toBe(0)
  })

  it('门路真的被播出过 —— 不是注册了却永远够不着', () => {
    const fired = runs.filter(r => r.firedEventIds.includes(CHANNEL_EVENT_ID))
    console.log(`  门路触达 ${fired.length}/${runs.length} 局`)
    expect(
      fired.length,
      '中官一路掉到 0 都没有一次「内廷门路」 —— 触发条件或挂载路径断了，' +
        '§1.4 ② 又回到"只有下降通道"'
    ).toBeGreaterThanOrEqual(40)
  })

  it('中官归零的死法比 ② 之前少了一截', () => {
    const zeroed = runs.filter(r => (r.finalThresholds['中官'] ?? 99) <= 0)
    console.log(`  中官归零 ${zeroed.length}/${runs.length}`)
    expect(
      zeroed.length,
      `${runs.length} 局里仍有 ${zeroed.length} 局死在「宦官构陷」—— ` +
        `渠道没接上之前这个口径是 61%（122/200）；阈值 64/120 是给采样波动留的余量`
    ).toBeLessThanOrEqual(64)
  })
})
