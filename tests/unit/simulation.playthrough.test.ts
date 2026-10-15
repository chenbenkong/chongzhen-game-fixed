import { describe, expect, it } from 'vitest'
import { simulateMany, type SimPolicy } from './helpers/simulate'
import { allEvents, labelOfPool } from '../../scripts/event-pools'
import { THRESHOLD_ENDING_BY_KEY } from '../../src/data/boundaryEvents'
import { zeroWarnFlag } from '../../src/data/zeroWarningEvents'

/**
 * 整局模拟用例。
 *
 * 这一类断言的形状和别的用例不一样：它不是「这个函数返回什么」，而是
 * 「拿真引擎跑够多局，不该出现的几件事一件都没出现」。分别是
 * 跑着跑着抛异常、算出 NaN/Infinity、既没结束也没推进、
 * 以及（第十一轮起）违反「归零两次才要命」这条新规则。
 *
 * 局数默认压到 CI 能接受的程度，深跑用环境变量：
 *   SIM_GAMES=400 npm run test:unit -- simulation.playthrough
 * 12 局 × 至多 260 个月实测约 1.4 秒（假定时器），可以放心留在 CI 里。
 */
const GAMES = Number(process.env.SIM_GAMES ?? 12)
const MAX_MONTHS = Number(process.env.SIM_MONTHS ?? 260)
const POLICIES = (process.env.SIM_POLICIES ?? 'steady').split(',') as SimPolicy[]

describe(`整局模拟（${GAMES} 局 × 至多 ${MAX_MONTHS} 个月）`, () => {
  it(
    '不抛异常、不算出 NaN、每局都落到结局，且死于归零前必然先见过警告',
    async () => {
      const { report, runs } = await simulateMany({ count: GAMES, policies: POLICIES, maxMonths: MAX_MONTHS })

      for (const line of reportLines(report)) console.log(line)
      if (process.env.SIM_VERBOSE) {
        for (const r of runs) {
          console.log(
            `  seed=${r.seed} policy=${r.policy} 月=${r.months} 抉择=${r.choices} ended=${r.ended} ` +
              `ending=${r.endingId ?? '-'} 终事件=${r.endEventId ?? '-'} 末年=${r.finalYear} 末阶=${r.finalRank} ` +
              `八维=${Object.entries(r.finalThresholds).map(([k, v]) => `${k}${v}`).join(' ')} ` +
              `声明/实变=${Object.keys(r.finalThresholds).map(k => `${k}:${r.declaredDelta[k] ?? 0}/${r.actualDelta[k] ?? 0}`).join(' ')} ` +
              `末三事件=${r.firedEventIds.slice(-3).join(',')} NaN=${r.badNumbers.join(',') || '-'} err=${r.error ?? '-'}`
          )
        }
      }

      const crashed = runs.filter(r => r.error)
      expect(crashed.map(r => `seed=${r.seed} ${r.error}`), '模拟中途抛异常').toEqual([])

      const nans = runs.filter(r => r.badNumbers.length)
      expect(nans.map(r => `seed=${r.seed} ${r.badNumbers.length}`), '终局存在非有限数值').toEqual([])

      expect(report.endedCount, '每一局都应当在时限内结束').toBe(report.games)

      const lost = runs.filter(r => r.ended && !r.endingId)
      expect(
        lost.map(r => `seed=${r.seed} 月${r.months} 终事件=${r.endEventId ?? '无'}`),
        '结束的局必须落在已注册的结局上'
      ).toEqual([])

      /**
       * 第十一轮规则的承重断言：**同一个维度归零两次才要命** ——
       * 第一次由 `boundary_warn_X` 当面告知（并写下 `归零警告·X`），
       * 八条阈值结局的 check 都要求那个 flag 已经存在。
       * 这一条查的是"有没有人绕过警告直接收尾"：只要有一个 check 漏改了 flag 判定，
       * 或者有人新加一条 `<= 0` 就判死的边界结局，这里就会红。
       * 反过来它也是那条警告的存在性证明 —— 警告事件若永远触发不了，
       * 阈值结局会全部消失，下面那行 `zeroWarningsFired` 的断言同样会红。
       */
      const unwarned = runs
        .filter(r => r.endingId)
        .flatMap(r =>
          Object.entries(THRESHOLD_ENDING_BY_KEY)
            .filter(([, endingId]) => endingId === r.endingId)
            .filter(([key]) => !r.finalFlags.includes(zeroWarnFlag(key)))
            .map(([key]) => `seed=${r.seed} 死于${key}归零，却没有 ${zeroWarnFlag(key)}`)
        )
      expect(unwarned, '阈值结局必须在警告之后才允许收尾').toEqual([])

      expect(report.zeroWarningsFired.length, '警告事件应当真的被触发过（种子固定，结果可复现）').toBeGreaterThan(0)
    },
    300_000
  )

  it('触达率有实际意义：跑出来的事件与结局都不是零头', () => {
    // 这条是给上一行的"跑局本身有没有在跑"兜底的：如果 import 退化成空数组，
    // 所有用例都会以"0 局都结束了"的姿态假绿。
    const distinctIds = new Set(allEvents.map((e: any) => e?.id).filter(Boolean))
    expect(distinctIds.size).toBeGreaterThanOrEqual(400)
    expect(labelOfPool('historical_1643_sunchuanting')).toBe('historical')
    // 八条死线与八个阈值结局必须一一对上；漏一个就是"那个结局永远不需要警告"
    expect(Object.keys(THRESHOLD_ENDING_BY_KEY)).toHaveLength(8)
    expect(new Set(Object.values(THRESHOLD_ENDING_BY_KEY)).size).toBe(8)
  })
})

function reportLines(report: Awaited<ReturnType<typeof simulateMany>>['report']): string[] {
  const totalEvents = new Set(allEvents.map((e: any) => e?.id).filter(Boolean)).size
  const zeroed = Object.entries(report.zeroedAtEnd).sort((a, b) => b[1] - a[1])
  return [
    `---- 整局模拟 ----`,
    `局数 ${report.games}，正常结束 ${report.endedCount}`,
    `局长（月） min=${report.monthStats.min} max=${report.monthStats.max} avg=${report.monthStats.avg}`,
    `触达结局 ${report.distinctEndings} 个；触达事件 ${report.distinctEventsFired}/${totalEvents}`,
    `触达归零警告：${report.zeroWarningsFired.length}/8 ${report.zeroWarningsFired.map(id => id.replace('boundary_warn_', '')).join('、') || '（无）'}`,
    `结局分布：${report.endingsReached.slice(0, 12).map(e => `${e.title || e.id}×${e.count}`).join('、') || '（无）'}`,
    `终局归零维度：${zeroed.map(([k, n]) => `${k}×${n}`).join('、') || '（无）'}`,
    ...(report.endedWithoutRegistry.length
      ? [
          `未落注册结局却结束 ${report.endedWithoutRegistry.length} 局：` +
            report
              .endedWithoutRegistry.slice(0, 8)
              .map(x => `seed=${x.seed}/${x.policy} 月${x.months} 事件=${x.endEventId ?? '-'} 归零=${x.zeroed.join('+') || '无'}`)
              .join('；')
        ]
      : [])
  ]
}
