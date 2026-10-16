import { describe, expect, it } from 'vitest'
import { aftermathEchoEvents } from '../../src/data/events/echo'
import { allEvents } from '../../scripts/event-pools'
import { scanFlagReachability } from '../../scripts/audit-flag-reachability'
import { FLAG_MEMOIRS } from '../../src/data/flagBiography'
import { simulateMany } from './helpers/simulate'

/**
 * 第二波回响（`src/data/events/echo/aftermath.ts`）的数据契约。
 *
 * 这一池只干一件事：**读**第一波与旧事件写下的经历。它自己刻意不造新词，
 * 所以它比第一波更容易被写坏 —— 一不留神就是把开关名拼错、把门槛指向没人写得出来的经历、
 * 写出一条玩家根本看不见的经历，或者把年窗开得比经历本身还晚。这里钉的全是这四种。
 *
 * `@ts-nocheck` 覆盖着 `src/data/events/**`，tsc 对这些错误完全失明，
 * 所以这三条只能由测试来兜。
 */

const report = scanFlagReachability()
const readers = new Set(report.readBy.keys())
const aftermathIds = new Set(aftermathEchoEvents.map(e => e.id))

/** 全游戏能写出来的 flag */
const writable = new Set<string>()
for (const e of allEvents) {
  for (const c of e.choices ?? []) {
    for (const f of c.effects?.flags?.add ?? []) writable.add(f)
  }
}

const positiveChoiceClauses = (eventId: string): string[] => {
  const e = allEvents.find(x => x.id === eventId)!
  const out: string[] = []
  for (const c of e.choices ?? []) {
    const f = c.showConditions?.flags
    out.push(...(f?.has ?? []), ...(f?.all ?? []), ...(f?.some ?? []), ...(f?.any ?? []))
  }
  return out
}

describe('第二波回响的数据契约', () => {
  it('确实注册进了引擎看到的事件池', () => {
    const inPool = allEvents.filter(e => aftermathIds.has(e.id))
    expect(
      inPool.length,
      `写了 ${aftermathEchoEvents.length} 条却只在池里找到 ${inPool.length} 条 —— 忘了接线`
    ).toBe(aftermathEchoEvents.length)
  })

  it('这一池写的每一条经历，玩家都得看得见（被门槛读 ∪ 上履历表）', () => {
    const unseen: string[] = []
    for (const e of aftermathEchoEvents) {
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) {
          if (f.endsWith('_done')) continue
          if (!readers.has(f) && !FLAG_MEMOIRS[f]) unseen.push(`${e.id}/${c.id}：「${f}」`)
        }
      }
    }
    expect(
      unseen,
      '第二波是来还"只写不读"这笔账的，不许自己再写出看不见的新账'
    ).toEqual([])
  })

  it('选项级门槛引用的经历，全游戏必须有人写得出来', () => {
    const dead: string[] = []
    for (const e of aftermathEchoEvents) {
      for (const f of positiveChoiceClauses(e.id)) {
        if (!writable.has(f)) dead.push(`${e.id}：门槛要求「${f}」，没有任何选项写得出它`)
      }
    }
    expect(dead, '这样的选项永远显不出来，等于白写一段文案').toEqual([])
  })

  it('每个事件都留一条无条件可选的路（不许整场锁死）', () => {
    const noOpenChoice = aftermathEchoEvents
      .filter(e => (e.choices ?? []).every(c => c.showConditions))
      .map(e => e.id)
    expect(noOpenChoice, '四个选项全部门槛化，会撞出"整场无可选项"的死局').toEqual([])

    const gated = aftermathEchoEvents.reduce(
      (n, e) => n + (e.choices ?? []).filter(c => c.showConditions).length,
      0
    )
    expect(gated, '这一池一个选项级门槛都没有，说明"按经历分流"没做').toBeGreaterThanOrEqual(15)
  })

  it('年代窗口落在游戏可玩区间内，且都带一次性开关', () => {
    const bad: string[] = []
    for (const e of aftermathEchoEvents) {
      const min = e.conditions?.year?.min
      const max = e.conditions?.year?.max
      if (min === undefined || max === undefined || min < 1628 || max > 1644 || min > max) {
        bad.push(`${e.id}：年窗口 ${JSON.stringify(e.conditions?.year)}`)
      }
      const notHas = e.conditions?.flags?.notHas ?? []
      if (!notHas.some(f => f.endsWith('_done'))) {
        bad.push(`${e.id}：没有 _done 开关，同一局会反复触发`)
      }
      if (!e.choices?.every(c => c.effects?.flags?.add?.includes(`${e.id}_done`))) {
        bad.push(`${e.id}：某个选项没写自己的 _done 开关，触发后会卡死`)
      }
    }
    expect(bad).toEqual([])
  })
})

/** flag → 写出它的 (事件 id, 该事件年窗下界) */
const writerYears = new Map<string, { id: string; min: number }[]>()
for (const e of allEvents) {
  for (const c of e.choices ?? []) {
    for (const f of c.effects?.flags?.add ?? []) {
      if (!writerYears.has(f)) writerYears.set(f, [])
      writerYears.get(f)!.push({ id: e.id, min: e.conditions?.year?.min ?? 1628 })
    }
  }
}

/** 这段经历最早能在哪一年被写出来（不算回响池自己写的那一份） */
const earliestWritable = (flag: string, exceptId: string): number => {
  const ws = (writerYears.get(flag) ?? []).filter(w => w.id !== exceptId)
  return ws.length ? Math.min(...ws.map(w => w.min)) : 9999
}

const eventPositiveClauses = (e: (typeof aftermathEchoEvents)[number]): string[] => {
  const f = e.conditions?.flags
  return [...(f?.has ?? []), ...(f?.all ?? []), ...(f?.some ?? []), ...(f?.any ?? [])]
}

describe('第二波回响真的打得到玩家', () => {
  /**
   * 这一条是本轮自己踩出来的坑，不是推想：五个事件刚写完时，模拟里**三个一次都没播出来**，
   * 而它们的开门经历有 92/100 的局都随身带着。拦住它们的不是因果网，是年窗下界 ——
   * `扇价` 当初写的是"1638 年起"，而 warden 组平均只活到 85 个月（约崇祯八九年）。
   *
   * 这里钉的是静态代理：回响不许比"这段经历最早能被写出的年份"晚四年。
   * 真判据是下面那条模拟播出率；这条存在的原因是它便宜、确定，且不依赖策略组的抽样。
   */
  it('年窗下界不许晚于开门经历最早可写年份 + 4', () => {
    const late: string[] = []
    for (const e of aftermathEchoEvents) {
      const floors = eventPositiveClauses(e).map(f => earliestWritable(f, e.id) + 4)
      const min = e.conditions?.year?.min ?? 1628
      const limit = Math.min(...floors)
      if (min > limit) {
        late.push(`${e.id}：年窗下界 ${min}，而开门经历最早 ${limit - 4} 年就能写出（上限 ${limit}）`)
      }
    }
    expect(late, '年窗开得比经历本身还晚 —— 这一段内容对绝大多数玩家不存在').toEqual([])
  })

  it('warden 组 100 局：每个事件至少真的播出来过 3 次', async () => {
    const { runs } = await simulateMany({ count: 100, policies: ['warden'] })
    const silent: string[] = []
    for (const e of aftermathEchoEvents) {
      const fired = runs.filter(r => r.firedEventIds.includes(e.id)).length
      if (fired < 3) silent.push(`${e.id}《${e.title}》100 局只播出 ${fired} 次`)
    }
    expect(
      silent,
      '写了却打不着 = 没有内容。要么放宽年窗，要么把开门经历写得更早/更常见'
    ).toEqual([])
  }, 300000)
})
