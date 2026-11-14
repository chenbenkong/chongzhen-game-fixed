import { describe, expect, it } from 'vitest'
import { scanEventSplit, assembleFromBatches } from '../../scripts/audit-event-split'

/**
 * 「开局只装一年，其余后台补」的看门狗。
 *
 * 这一刀切得动，全靠三条数据事实（见 `scripts/audit-event-split.ts` 文件头）：
 * 第二批里没有"任意年份可播"的事件、没有年窗触及 1628 的事件、
 * 两批拼起来顺序与 barrel 逐项相同。任何一条破了，
 * 线上会出现"1628 年读到一张本该在 1632 年才开的卡"，或者
 * 四十多个跑局用例因为数组顺序变了而集体漂移。
 *
 * 所以这里不写"约等于"，只写恒等。
 */
describe('事件分批（2027 时代的第一刀）', () => {
  const r = scanEventSplit()

  it('第二批不含任何「没有 year 条件」的事件', () => {
    expect(r.futureWithoutYear).toEqual([])
  })

  it('第二批不含任何年窗触及 1628 的事件', () => {
    expect(r.futureTouchingStartYear).toEqual([])
  })

  it('两批拼起来与 barrel 逐项同序（id 序列完全一致）', () => {
    expect(r.orderDrift).toBeNull()
  })

  it('既不重复也不漏', () => {
    expect(r.duplicated).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('两批加起来就是全池，且首批明显小于全池（否则这刀没切到东西）', () => {
    expect(r.firstBatch + r.future).toBe(r.total)
    expect(r.total).toBeGreaterThan(400)
    expect(r.firstBatch).toBeLessThan(r.total * 0.45)
    expect(assembleFromBatches().length).toBe(r.total)
  })
})
