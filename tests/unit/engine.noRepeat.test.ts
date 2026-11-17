import { describe, expect, it } from 'vitest'
import { simulateRun } from './helpers/simulate'

/**
 * 本局一次性：任何事件 id 只要已经发到过玩家手里，这一局就不能再发第二次。
 *
 * 这条口径覆盖 historical / chain / transition / random / emotion / gray /
 * character / national / faction，也覆盖 crisis 边界事件；判重依据是 `eventHistory`，
 * 不是 lastTurnById，所以读档后仍然生效。
 *
 * 以前这里钉的是「可重复池至少隔 6 个月」，现在按玩家要求改成直接不重演；
 * 同一组用例顺带检查发牌记录，防止某张卡只是换了个月份又被塞回队列。
 */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dup: string[] = []
  for (const id of ids) {
    if (seen.has(id)) dup.push(id)
    seen.add(id)
  }
  return dup
}

describe('本局经历过的事件不再出现', () => {
  it('8 局取样里，播放记录与发牌记录都没有重复 id', async () => {
    const allRuns = []
    for (const seed of SEEDS) {
      allRuns.push(await simulateRun({ seed, policy: 'random', maxMonths: 200 }))
    }

    let totalFired = 0
    for (const r of allRuns) {
      expect(r.firedTurns, `seed=${r.seed} 平行表长度必须与 firedEventIds 一致`).toHaveLength(
        r.firedEventIds.length
      )
      expect(duplicates(r.firedEventIds), `seed=${r.seed} 播放了重复事件`).toEqual([])
      expect(duplicates(r.dealtEventIds), `seed=${r.seed} 发牌记录里有重复事件`).toEqual([])
      totalFired += r.firedEventIds.length
    }

    // 反空跑：8 局至少要有足够多的实际播放，不能因为池子被一次性耗尽就变成空局。
    expect(totalFired, '8 局取样里几乎没有事件播放，规则等于没测').toBeGreaterThan(80)
  }, 180_000)
})
