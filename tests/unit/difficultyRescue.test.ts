import { describe, expect, it } from 'vitest'
import { BOUNDARY_EVENTS } from '../../src/data/boundaryEvents'
import { DIFFICULTY_CONFIGS } from '../../src/types/difficulty'
import { zeroWarnFlag } from '../../src/data/zeroWarningEvents'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'

function params(turn: number, grace: number): BoundaryEventCheckParams {
  return {
    attributes: { 财帛: 50, 体质: 50 },
    gameState: { 圣眷: 50, 中官: 50, 清议: 0, 士绅: 50, 民望: 50, 国势: 50, turn },
    hidden: { 道德值: 50 },
    flags: [zeroWarnFlag('清议')],
    currentYear: 1628,
    currentMonth: 1,
    thresholdGraceTurns: grace
  }
}

describe('P0：难度化归零宽限与损失倍率', () => {
  it('三档宽限依次为 36 / 30 / 12 个月', () => {
    expect(DIFFICULTY_CONFIGS.easy.zeroGraceTurns).toBe(36)
    expect(DIFFICULTY_CONFIGS.normal.zeroGraceTurns).toBe(30)
    expect(DIFFICULTY_CONFIGS.hard.zeroGraceTurns).toBe(12)
  })

  it('史话损失 0.8 倍，标准 1.0，铁人 1.2', () => {
    expect(DIFFICULTY_CONFIGS.easy.lossMultiplier).toBe(0.8)
    expect(DIFFICULTY_CONFIGS.normal.lossMultiplier).toBe(1.0)
    expect(DIFFICULTY_CONFIGS.hard.lossMultiplier).toBe(1.2)
  })

  it('同样在清议归零且已警告，第 30 个月：史话不判死，标准判死', () => {
    const scholar = BOUNDARY_EVENTS.find(e => e.id === 'scholar_ostracism')!
    expect(scholar.check(params(30, DIFFICULTY_CONFIGS.easy.zeroGraceTurns))).toBe(false)
    expect(scholar.check(params(30, DIFFICULTY_CONFIGS.normal.zeroGraceTurns))).toBe(true)
    expect(scholar.check(params(30, DIFFICULTY_CONFIGS.hard.zeroGraceTurns))).toBe(true)
  })

  it('史话第 36 个月才判死，铁人第 12 个月就判死', () => {
    const scholar = BOUNDARY_EVENTS.find(e => e.id === 'scholar_ostracism')!
    expect(scholar.check(params(35, DIFFICULTY_CONFIGS.easy.zeroGraceTurns))).toBe(false)
    expect(scholar.check(params(36, DIFFICULTY_CONFIGS.easy.zeroGraceTurns))).toBe(true)
    expect(scholar.check(params(11, DIFFICULTY_CONFIGS.hard.zeroGraceTurns))).toBe(false)
    expect(scholar.check(params(12, DIFFICULTY_CONFIGS.hard.zeroGraceTurns))).toBe(true)
  })
})
