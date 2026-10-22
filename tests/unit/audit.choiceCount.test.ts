import { describe, expect, it } from 'vitest'
import { scanChoiceCounts } from '../../scripts/audit-choice-count'

/**
 * 选项数棘轮：可玩事件 3–4 条（锁定的也算）。
 *
 * 结局卡不受下限 3 约束 —— `GameOverScreen` 把结局卡作为终局场景整卡渲染，
 * `choices` 不进入事件面板的选项列表。上限 4 仍照管。口径写在脚本头部，改口径先改那里。
 */
describe('事件选项数（3–4，含锁定卡）', () => {
  const report = scanChoiceCounts()

  it('体检覆盖到的事件数量不为 0（防止 import 退化成空数组）', () => {
    expect(report.total).toBeGreaterThanOrEqual(400)
    expect(report.playable).toBeGreaterThanOrEqual(400)
    expect(report.endingCards).toBeGreaterThanOrEqual(44)
  })

  it('少于 3 项的可玩事件为 0', () => {
    expect(
      report.below.map(e => `${e.id}「${e.title}」只有 ${e.count} 项`)
    ).toEqual([])
  })

  it('多于 4 项的可玩事件为 0', () => {
    expect(
      report.above.map(e => `${e.id}「${e.title}」有 ${e.count} 项`)
    ).toEqual([])
  })

  it('结局卡同样不许超过 4 项（下限 3 不适用）', () => {
    expect(
      report.endingAbove.map(e => `${e.id}「${e.title}」有 ${e.count} 项`)
    ).toEqual([])
  })
})
