import { describe, expect, it } from 'vitest'
import { BOUNDARY_EVENTS } from '../../src/data/boundaryEvents'
import { zeroWarnFlag, refreshZeroWarningCountdown } from '../../src/data/zeroWarningEvents'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'

function params(turn: number, warnedAt?: number, grace = 30): BoundaryEventCheckParams {
  return {
    attributes: { 财帛: 50, 体质: 50 },
    gameState: { 圣眷: 50, 中官: 50, 清议: 0, 士绅: 50, 民望: 50, 国势: 50, turn },
    hidden: { 道德值: 50 },
    flags: [zeroWarnFlag('清议')],
    currentYear: 1628,
    currentMonth: 1,
    thresholdGraceTurns: grace,
    flagTurns: warnedAt == undefined ? undefined : { [zeroWarnFlag('清议')]: warnedAt }
  }
}

describe('归零宽限：逐维倒计时，而不是全局处决月', () => {
  const scholar = BOUNDARY_EVENTS.find(e => e.id === 'scholar_ostracism')!

  it('第 10 月写下警告票，宽限 30 个月：第 39 月还在倒计时内', () => {
    expect(scholar.check(params(39, 10))).toBe(false)
  })

  it('第 10 月写下警告票，宽限 30 个月：第 40 月才判死', () => {
    expect(scholar.check(params(40, 10))).toBe(true)
  })

  it('第 40 月才写下警告票，同一个月绝不判死', () => {
    expect(scholar.check(params(40, 40))).toBe(false)
    expect(scholar.check(params(69, 40))).toBe(false)
    expect(scholar.check(params(70, 40))).toBe(true)
  })

  it('两维不同月份：清议晚警告，不能被另一维的旧票提前处决', () => {
    const p = params(45, 10)
    p.flags = [zeroWarnFlag('清议')]
    p.flagTurns = { [zeroWarnFlag('清议')]: 40 }
    expect(scholar.check(p)).toBe(false)
  })

  it('旧存档只有 flag、没有 flagTurns：退回绝对回合，不凭空收走已有局面', () => {
    expect(scholar.check(params(29, undefined))).toBe(false)
    expect(scholar.check(params(30, undefined))).toBe(true)
  })
})

describe('归零宽限：只累计仍在警告带内的月份', () => {
  const scholar = BOUNDARY_EVENTS.find(e => e.id === 'scholar_ostracism')!
  const flag = zeroWarnFlag('清议')

  it('清议回到 16（>15）时把警告计时推到本月，旧票不再按 10 月处决', () => {
    const p = params(39, 10)
    p.gameState!.清议 = 16
    p.flagTurns = refreshZeroWarningCountdown([flag], p.flagTurns, { 清议: 16 }, 39)
    expect(scholar.check(p)).toBe(false)
    expect(scholar.check({ ...p, gameState: { ...p.gameState!, 清议: 0, turn: 70 } })).toBe(true)
  })

  it('清议停在 15（未超过警告带）时不重置，仍在第 40 月满期', () => {
    const p = params(40, 10)
    p.gameState!.清议 = 15
    const before = p.flagTurns
    expect(refreshZeroWarningCountdown([flag], before, { 清议: 15 }, 40)).toBe(before)
    p.gameState!.清议 = 0
    expect(scholar.check(p)).toBe(true)
  })

  it('财帛的恢复线是 20：21 重置，20 不重置', () => {
    const wealth = zeroWarnFlag('财帛')
    expect(refreshZeroWarningCountdown([wealth], { [wealth]: 5 }, { 财帛: 21 }, 30)).toEqual({ [wealth]: 30 })
    const atLine = { [wealth]: 5 }
    expect(refreshZeroWarningCountdown([wealth], atLine, { 财帛: 20 }, 30)).toBe(atLine)
  })
})
