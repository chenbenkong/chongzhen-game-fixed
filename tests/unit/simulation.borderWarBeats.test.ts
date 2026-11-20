import { describe, expect, it } from 'vitest'
import { ALL_ORIGINS } from '../../src/types/game'
import { simulateMany } from './helpers/simulate'

/**
 * 边关狼烟三拍收口（§8.25）的 A/B 量具。
 *
 * 8 出身 × 3 策略 × 4 种子 = 96 局一侧。改门/加拍前后各跑一遍对照：
 * 生存月数、结局分布、三拍触达率（firedEventIds 只记玩家真点过的拍）。
 * 基线读数留档在路线图 §8.25，负结果按 KNOWN_ISSUES ㉓ 的规矩回滚留档。
 */
const BEATS = ['route_military', 'route_border_volunteer', 'route_songjin_decision']
const BORDER_ENDINGS = ['ending_border_general', 'ending_died_battlefield']

describe('边关狼烟：三拍触达与结局分布 sweep', () => {
  it(
    '96 局：三拍触达 / 边关两结局 / 生存月数',
    async () => {
      const perOrigin: string[] = []
      let games = 0
      let monthSum = 0
      const reach: Record<string, number> = {}
      const endings: Record<string, number> = {}
      const errors: Array<{ origin: string; seed: number; error: string }> = []
      const relayBreaks: number[] = []
      for (let o = 0; o < ALL_ORIGINS.length; o++) {
        const origin = ALL_ORIGINS[o]
        const { runs, report } = await simulateMany({
          count: 12,
          startSeed: 9000 + o * 100,
          policies: ['random', 'first', 'ambitious'],
          origin
        })
        games += runs.length
        monthSum += report.monthStats.avg * runs.length
        for (const id of BEATS) reach[id] = (reach[id] || 0) + runs.filter(r => r.firedEventIds.includes(id)).length
        for (const id of BORDER_ENDINGS) endings[id] = (endings[id] || 0) + runs.filter(r => r.endingId === id).length
        for (const r of runs) {
          if (r.error) errors.push({ origin, seed: r.seed, error: r.error })
          // 接力自检：点过第三拍的局必须点过第二拍（gate 读第二拍票）
          if (r.firedEventIds.includes(BEATS[2]) && !r.firedEventIds.includes(BEATS[1])) relayBreaks.push(r.seed)
        }
        perOrigin.push(
          `${origin}: avg=${report.monthStats.avg} ended=${report.endedCount}/12 distinct=${report.distinctEndings} ` +
            BEATS.map(id => `${id}=${runs.filter(r => r.firedEventIds.includes(id)).length}`).join(' ') +
            ' ' + BORDER_ENDINGS.map(id => `${id}=${runs.filter(r => r.endingId === id).length}`).join(' ')
        )
      }
      console.log('=== SWEEP BORDER ===')
      perOrigin.forEach(line => console.log(line))
      console.log(
        `TOTAL games=${games} avgMonths=${Math.round(monthSum / games)} reach=${JSON.stringify(reach)} endings=${JSON.stringify(endings)} relayBreaks=${relayBreaks.length} errors=${errors.length}`
      )
      if (errors.length) console.log(JSON.stringify(errors.slice(0, 5)))
      // A/B 收口（§8.25）：基线第三拍 reach=0 —— 链上玩家先被 1638《边关大将》年窗坝
      // 截走（12/13 局），按住大将坝后又在 1640 正月被《医圣》《名臣》第二道坝墙收走。
      // 改成前奏 + 「松锦未决」临时坝 + 1639 空档后：第三拍 reach=13、大将仍 13
      // （c1 拆坝后大将随即在 1639/9 结算，只比原来晚一年），生存月数 91→93。
      // 钉下界而非精确值：以后加事件会挪动随机流，精确计数会假报警（KNOWN_ISSUES ㉓）。
      expect(reach['route_songjin_decision'], '第三拍必须真的演得到（基线 0 → 修后 13）').toBeGreaterThanOrEqual(10)
      expect(endings['ending_border_general'], '临时坝不能把大将结算整条按住（基线 13 → 修后 13）').toBeGreaterThanOrEqual(10)
      expect(errors.length, '模拟本身必须跑干净').toBe(0)
      expect(relayBreaks.length, '第三拍必须以第二拍为前置').toBe(0)
    },
    300000
  )
})