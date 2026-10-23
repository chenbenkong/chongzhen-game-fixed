import { describe, expect, it } from 'vitest'
import { scanLabelTextAgreements } from '../../scripts/audit-label-text-agreement'

/**
 * 标签—正文棘轮：写着「拒绝 / 守礼 / 君子」的选项，正文不许实录性事。
 *
 * 第五十轮修掉 19 处（§1.4 ㉙ 的 18 处 + 同一把尺子扫出的 `gray_debauchery_012` c2），
 * 全部只动文本、不动数值。口径与两条修法写在脚本头部，改口径先改那里。
 */
describe('选项标签与正文一致（守礼标签不许配实录性事）', () => {
  const report = scanLabelTextAgreements()

  it('体检覆盖到的选项数量不为 0（防止 import 退化成空数组）', () => {
    expect(report.events).toBeGreaterThanOrEqual(400)
    expect(report.choices).toBeGreaterThanOrEqual(1200)
    expect(report.labeled).toBeGreaterThanOrEqual(20)
  })

  it('守礼标签配实录性事正文的冲突为 0', () => {
    expect(
      report.conflicts.map(
        x =>
          `${x.eventId} ${x.choiceId}「${x.eventTitle}」标签「${x.label.slice(0, 24)}」正文命中 ${x.bodyMarkers.join('/')}`
      )
    ).toEqual([])
  })
})
