import { describe, expect, it } from 'vitest'
import { simulateRun } from './helpers/simulate'

/**
 * 可重复事件的冷却期必须**按月份**生效，而不是按事件历史的条目数。
 *
 * `useGameEngine` 里的 `cooldowns` 表头写的是「冷却期（月）」：
 * random 8、gray / character / national / faction 6、emotion 12。
 * 但第十四轮之前它只拿 `eventHistory` 的**条目距离**判定，
 * 而一个月会往历史里追加 1~3 条（一条大事件 + 最多两个支线）——
 * 于是「6 个月」实际只有 2~3 个月，玩家会在三个月里把同一场病治两回、
 * 同一次节礼打点两遍。第十四轮补的回升通道（patronage / regimen / localline）
 * 恰好把这件事放大到肉眼可见：`engine.strictMode.test.ts` 的
 * 「历史里不该有重复 id」因此开始报错。
 *
 * 这里用真引擎 + 固定种子，把「两次之间至少隔 6 个月」钉成不变量。
 * 假时钟跑一局约 0.1 秒，所以取样放大到 8 个种子；
 * 第八个断言保证这组用例不是空跑 —— 取样里必须**真的出现过**重演事件，
 * 否则「重演要隔够月份」这条规则一次也没被检验到。
 */

/** `cooldowns` 表里最短的一档；比它更长的档位自动满足 */
const MIN_COOLDOWN_MONTHS = 6

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

describe('可重复事件的冷却按月生效（不是按历史条目）', () => {
  it('每一局的每一次重演，都至少隔了 6 个月', async () => {
    const allRuns = []
    for (const seed of SEEDS) {
      allRuns.push(await simulateRun({ seed, policy: 'random', maxMonths: 200 }))
    }

    let repeatCount = 0
    for (const r of allRuns) {
      expect(r.firedTurns, `seed=${r.seed} 平行表长度必须与 firedEventIds 一致`).toHaveLength(
        r.firedEventIds.length
      )

      const lastTurnById = new Map<string, number>()
      const violations: string[] = []
      r.firedEventIds.forEach((id, i) => {
        const turn = r.firedTurns[i]
        const prev = lastTurnById.get(id)
        if (prev !== undefined) {
          repeatCount++
          const gap = turn - prev
          if (gap < MIN_COOLDOWN_MONTHS) {
            violations.push(`seed=${r.seed} ${id}：第 ${prev} 月 → 第 ${turn} 月，只隔了 ${gap} 个月`)
          }
        }
        lastTurnById.set(id, turn)
      })

      expect(violations, `seed=${r.seed}`).toEqual([])
    }

    // 反空跑：这一组取样里必须真的重放过事件
    expect(repeatCount, '8 局取样里一次也没有重演过事件 —— 这条不变量等于没测').toBeGreaterThan(0)
  }, 180_000)
})
