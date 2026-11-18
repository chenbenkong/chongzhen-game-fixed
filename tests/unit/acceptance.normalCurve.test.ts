import { describe, expect, it } from 'vitest'
import { simulateRun } from './helpers/simulate'

/**
 * P0.1 验收：标准难度窄样本（寒门 / steady / seed 1..20）的中位局长必须落在 60–90 个月。
 *
 * 这不是“跑一批游戏看看”，而是 P0.1 那三个杠杆的回归：
 * 1. 单次负向跌幅封顶（`capDamage`）——防一记 -100 把中年局直接打穿；
 * 2. 逐维归零倒计时——警告从“绝对回合”改成“该维写下警告票的月份起算”；
 * 3. 考功层的道德/贪墨分支——宽限满期才结案，贪墨从即时革职降为降两级并消费警告票。
 *
 * 中位数低于 60 说明前期仍在被单次尖峰或考功层截断；高于 90 说明救援给得太宽，
 * 普通玩家不再需要为低数值付出代价。两种都要在下一轮重新校准，而不是把上界当摆设。
 */
describe('P0.1 标准难度验收：中位局长 60–90 个月', () => {
  it('20 局窄样本中位落在 60–90，且至少 10 局活过 60 个月', async () => {
    const months: number[] = []
    for (let seed = 1; seed <= 20; seed++) {
      const r = await simulateRun({ seed, policy: 'steady', difficulty: 'normal', origin: '寒门', maxMonths: 260 })
      months.push(r.months)
    }

    const sorted = [...months].sort((a, b) => a - b)
    const median = sorted[Math.floor((sorted.length - 1) / 2)]
    expect(median, `20 局月数=${months.join(',')}`).toBeGreaterThanOrEqual(60)
    expect(median, `20 局月数=${months.join(',')}`).toBeLessThanOrEqual(90)
    expect(months.filter(m => m >= 60).length).toBeGreaterThanOrEqual(10)
  }, 120_000)

  it('整局落账后属性、八条归零线与门控值都是整数（不再出现 32.5）', async () => {
    const runs = []
    for (let seed = 1; seed <= 6; seed++) {
      runs.push(await simulateRun({ seed, policy: 'steady', difficulty: 'normal', origin: '寒门' }))
    }

    for (const r of runs) {
      for (const [group, values] of Object.entries({
        attributes: r.finalAttributes,
        thresholds: r.finalThresholds,
        gates: r.finalGates
      })) {
        for (const [key, value] of Object.entries(values)) {
          expect(Number.isInteger(value), `seed=${r.seed} ${group}.${key}=${value}`).toBe(true)
        }
      }
    }
  }, 120_000)
})
