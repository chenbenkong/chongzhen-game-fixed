import { beforeEach, describe, expect, it } from 'vitest'
import {
  LEGACY_PERKS,
  applyLegacyPerk,
  canUnlockPerk,
  computeLegacyGain,
  emptyLegacyState,
  legacyGoalStatus,
  loadLegacyState,
  recordLegacyRun,
  unlockPerk
} from '../../src/data/legacy'
import { makeCharacter, makeGameState, renderGameEngine, flush } from './helpers/gameEngine'

const STORAGE_KEY = 'chongzhen-legacy-v1'

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe('P1 家训与传承', () => {
  it('三条家训都是整数小加成，不做数值碾压', () => {
    expect(LEGACY_PERKS).toHaveLength(3)
    for (const perk of LEGACY_PERKS) {
      expect(perk.cost).toBeGreaterThan(0)
      const values = [
        ...Object.values(perk.effect.attributes ?? {}),
        ...Object.values(perk.effect.hidden ?? {})
      ]
      expect(values.length).toBeGreaterThan(0)
      for (const value of values) {
        expect(Number.isInteger(value)).toBe(true)
        expect(Math.abs(value)).toBeLessThanOrEqual(3)
      }
    }
  })

  it('结算点数按整数发，且不因为属性超上限而溢出', () => {
    const gain = computeLegacyGain({
      score: 100,
      character: makeCharacter({
        flags: ['门生故吏', '著书立说', 'harmonious_family', 'wife_respected'],
        attributes: { 财帛: 50, 文韬: 100, 理政: 50, 武略: 50, 体质: 50 },
        hidden: { 道德值: 100, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
      }),
      gameState: makeGameState({ 士绅: 100, 民望: 100, 清议: 100, 国势: 50 })
    })
    expect(gain.门生).toBe(13)
    expect(gain.著作).toBe(13)
    expect(gain.家训).toBe(12)
    for (const value of Object.values(gain)) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeLessThanOrEqual(14)
    }
  })

  it('同一局只发一次点，刷新结局页不重复结算', () => {
    const gain = { 门生: 8, 著作: 9, 家训: 7 }
    const first = recordLegacyRun({ runKey: 'ending_x|沈青崖|崇祯十七年三月|80', gain })
    expect(first.duplicate).toBe(false)
    expect(first.state.points).toEqual(gain)

    const second = recordLegacyRun({ runKey: 'ending_x|沈青崖|崇祯十七年三月|80', gain })
    expect(second.duplicate).toBe(true)
    expect(second.state.points).toEqual(gain)
    expect(loadLegacyState().totalRuns).toBe(1)
  })

  it('点数够才能解锁，解锁后扣对应池，不混用其他池', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...emptyLegacyState(),
      points: { 门生: 12, 著作: 3, 家训: 0 }
    }))
    const state = loadLegacyState()
    expect(canUnlockPerk(state, 'mentor')).toBe(true)
    expect(canUnlockPerk(state, 'author')).toBe(false)

    const next = unlockPerk(state, 'mentor')
    expect(next.points.门生).toBe(0)
    expect(next.points.著作).toBe(3)
    expect(next.unlocked).toEqual(['mentor'])
  })

  it('开局加成是整数，且夹在 0–100', () => {
    const author = LEGACY_PERKS.find((p) => p.id === 'author')!
    const character = makeCharacter({ attributes: { 财帛: 50, 文韬: 99, 理政: 50, 武略: 50, 体质: 50 } })
    applyLegacyPerk(character, author.id)
    expect(character.attributes.文韬).toBe(100)
    expect(character.flags).toContain('著书立说')

    const precept = LEGACY_PERKS.find((p) => p.id === 'precept')!
    const low = makeCharacter({ hidden: { 道德值: 1, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 } })
    applyLegacyPerk(low, precept.id)
    expect(low.hidden.道德值).toBe(4)
    expect(low.flags).toContain('家训在身')
  })

  it('下一局小目标按角色和国势判定，不写死在结局文案里', () => {
    const reached = legacyGoalStatus(
      'reach_1644',
      makeCharacter(),
      makeGameState({ currentYear: 1644, currentMonth: 1 })
    )
    expect(reached?.achieved).toBe(true)

    const missed = legacyGoalStatus(
      'reach_1644',
      makeCharacter(),
      makeGameState({ currentYear: 1643, currentMonth: 12 })
    )
    expect(missed?.achieved).toBe(false)

    const promoted = legacyGoalStatus(
      'three_promotions',
      makeCharacter({ promotionCount: 3 }),
      makeGameState()
    )
    expect(promoted?.achieved).toBe(true)
  })

  it('真引擎开局：带家训才写旗，不带就不写', async () => {
    const withPerk = renderGameEngine({ legacyPerkId: 'author' })
    await flush()
    expect(withPerk.result.current.character.flags).toContain('著书立说')
    expect(Number.isInteger(withPerk.result.current.character.attributes.文韬)).toBe(true)

    const without = renderGameEngine()
    await flush()
    expect(without.result.current.character.flags).not.toContain('著书立说')
  })
})
