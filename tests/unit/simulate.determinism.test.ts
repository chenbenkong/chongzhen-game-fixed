/**
 * 跑局器的复现性钉子（§1.4 ㉗ 的收口）。
 *
 * 这条为什么值得单独钉：第 11~54 轮里所有"按种子钉死的反推存档"都建立在一个假设上 ——
 * 同一个 seed 跑出来的是同一条人生。第五十五轮实测把它推翻了一次：
 * 同一进程里同种子连跑三次，第一次结《烟花之主》@109 月，第二、三次结《不知所踪》@163 月。
 * 归因（`Error().stack` 逐次抄皮）量到的是：第一次挂载消耗 3 次 `Math.random`、
 * 之后每次挂载 2 次，多出来的那一次是 `react.development.js` 框架自己的，
 * 而挂载结束时的**状态**三局相同 —— 它只是把后续取值顺序推开了一格。
 * 修法见 `helpers/simulate.ts` 里挂载后的 `rand = mulberry32(seed)` 重新起头。
 *
 * 下面两条断言就是那台量具本身：它会在改动把复现性弄丢时立刻变红
 * （例如有人把重新起头删掉、或让引擎之外的代码在循环里消耗这串随机数）。
 */
import { describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'

/** 一条人生的指纹：结局 + 局长 + 抉择数 + 逐月事件序列。 */
function fingerprint(r: SimOutcome): string {
  return [
    r.endingId ?? '（未结案）',
    r.endingTitle ?? '（未结案）',
    r.months,
    r.choices,
    r.firedEventIds.join('>')
  ].join('|')
}

describe('跑局器的随机流复现性（§1.4 ㉗）', () => {
  const SEED = 6536
  const CASES = [
    { policy: 'vanish' as const, origin: '缙绅' as const },
    { policy: 'fugitive' as const, origin: '寒门' as const }
  ]

  for (const c of CASES) {
    it(`${c.policy}/${c.origin}：同种子在同进程连跑两次，必须是同一条人生`, async () => {
      const run = () =>
        simulateRun({ seed: SEED, policy: c.policy, origin: c.origin, maxMonths: 220 })
      const a = await run()
      const b = await run()
      console.log(
        `  ${c.policy}/${c.origin}：${a.endingTitle ?? '（未结案）'}@${a.months}月/抉择${a.choices} —— ` +
          `${b.endingTitle ?? '（未结案）'}@${b.months}月/抉择${b.choices}`
      )
      expect(a.error, `第一局跑挂了：${a.error}`).toBeNull()
      expect(b.error, `第二局跑挂了：${b.error}`).toBeNull()
      // 连跑两次必然落在不同的挂载位置（第二次是"后续挂载"），
      // 这正是改前会漂的那一处 —— 改前这里读到的是两条不同的人生。
      expect(fingerprint(b), '同种子连跑两次读出两条不同的人生 —— 随机流又被挂载顺序污染了').toBe(
        fingerprint(a)
      )
    }, 120_000)
  }

  it('换个种子仍是另一条人生 —— 重新起头不能把随机流拧成常数', async () => {
    const a = await simulateRun({ seed: 6536, policy: 'vanish', origin: '缙绅', maxMonths: 220 })
    const b = await simulateRun({ seed: 6537, policy: 'vanish', origin: '缙绅', maxMonths: 220 })
    console.log(
      `  seed6536 ${a.endingTitle ?? '（未结案）'}@${a.months}月 · seed6537 ${b.endingTitle ?? '（未结案）'}@${b.months}月`
    )
    expect(
      fingerprint(b) === fingerprint(a),
      `两个相邻种子跑出完全相同的人生（都结 ${a.endingTitle}）—— 那说明随机流没被真的接上`
    ).toBe(false)
  }, 120_000)
})
