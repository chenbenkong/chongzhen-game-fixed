import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAnnualChronicle } from '../../src/hooks/useAnnualChronicle'
import { careerGoalStatus } from '../../src/data/careerGoals'
import { makeCharacter, makeGameState, makeLifeRecord } from './helpers/gameEngine'

interface Props {
  year: number
  month: number
}

describe('P3.2 年度史载触发', () => {
  it('只在跨进正月时生成一次上一年的史载；初始正月不弹', async () => {
    const character = makeCharacter({ rank: '户部主事', careerGoal: 'reputation' })
    const career = careerGoalStatus('reputation', character, makeGameState({ 清议: 66 }))
    const lifeRecords = [
      makeLifeRecord({ id: 'r1', year: 1628, month: 4, title: '阉党覆灭' }),
      makeLifeRecord({ id: 'r2', year: 1628, month: 9, title: '官升一级', type: 'promotion' }),
      makeLifeRecord({ id: 'r3', year: 1629, month: 1, title: '新岁支俸' })
    ]

    const { result, rerender } = renderHook(
      ({ year, month }: Props) => useAnnualChronicle({
        gameState: makeGameState({ currentYear: year, currentMonth: month }),
        character,
        lifeRecords,
        career,
        meritScore: 412,
        currentStorylineKey: 'power'
      }),
      { initialProps: { year: 1628, month: 1 } }
    )

    expect(result.current.chronicle).toBeNull()

    rerender({ year: 1628, month: 12 })
    expect(result.current.chronicle).toBeNull()

    rerender({ year: 1629, month: 1 })
    await waitFor(() => expect(result.current.chronicle?.year).toBe(1628))
    expect(result.current.chronicle?.headline).toBe('魏忠贤伏诛，崇祯新政初启')
    expect(result.current.chronicle?.rank).toBe('户部主事')
    expect(result.current.chronicle?.meritScore).toBe(412)
    expect(result.current.chronicle?.records.map((record) => record.id)).toEqual(['r1', 'r2'])
    expect(result.current.chronicle?.storylineName).toBe('权谋之术')
    expect(result.current.chronicle?.career?.completed).toBe(2)

    act(() => result.current.dismiss())
    expect(result.current.chronicle).toBeNull()

    rerender({ year: 1629, month: 2 })
    expect(result.current.chronicle).toBeNull()
  })

  it('年份没变时不会重复生成，跨两年也只结算刚走完的那一年', async () => {
    const character = makeCharacter({ rank: '户部主事' })
    const lifeRecords = [
      makeLifeRecord({ id: 'r1628', year: 1628, month: 11, title: '己巳之变' }),
      makeLifeRecord({ id: 'r1629', year: 1629, month: 12, title: '袁崇焕之死' })
    ]

    const { result, rerender } = renderHook(
      ({ year, month }: Props) => useAnnualChronicle({
        gameState: makeGameState({ currentYear: year, currentMonth: month }),
        character,
        lifeRecords,
        career: null,
        meritScore: 300,
        currentStorylineKey: undefined
      }),
      { initialProps: { year: 1628, month: 12 } }
    )

    rerender({ year: 1629, month: 1 })
    await waitFor(() => expect(result.current.chronicle?.year).toBe(1628))

    rerender({ year: 1630, month: 1 })
    await waitFor(() => expect(result.current.chronicle?.year).toBe(1629))
    expect(result.current.chronicle?.headline).toBe('后金破塞，己巳之变')
    expect(result.current.chronicle?.records.map((record) => record.id)).toEqual(['r1629'])
    expect(result.current.chronicle?.storylineName).toBe('未启程')
    expect(result.current.chronicle?.career).toBeNull()
  })
})
