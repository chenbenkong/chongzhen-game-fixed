import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import AnnualChronicle from '../../src/components/AnnualChronicle'
import type { AnnualChronicleSnapshot } from '../../src/hooks/useAnnualChronicle'
import { careerGoalStatus } from '../../src/data/careerGoals'
import { makeCharacter, makeGameState, makeLifeRecord } from './helpers/gameEngine'

function makeSnapshot(overrides: Partial<AnnualChronicleSnapshot> = {}): AnnualChronicleSnapshot {
  const character = makeCharacter({ rank: '户部主事', careerGoal: 'reputation' })
  const career = careerGoalStatus('reputation', character, makeGameState({ 清议: 66 }))
  return {
    year: 1628,
    rank: '户部主事',
    meritScore: 412,
    records: [
      makeLifeRecord({ id: 'r1', month: 1, title: '新君登基' }),
      makeLifeRecord({ id: 'r2', month: 4, title: '阉党覆灭' }),
      makeLifeRecord({ id: 'r3', month: 7, title: '清丈田亩' }),
      makeLifeRecord({ id: 'r4', month: 9, title: '官升一级', type: 'promotion' }),
      makeLifeRecord({ id: 'r5', month: 11, title: '秉公结案' })
    ],
    career,
    storylineName: '权谋之术',
    headline: '魏忠贤伏诛，崇祯新政初启',
    detail: '阉党覆灭，东林起复；新君锐意治边、理财，朝局一时有振作之象。',
    ...overrides
  }
}

describe('P3.2 年度史载卡', () => {
  it('把上一年朝局、年末落点、最近四笔履历和志业进度放进同一页', () => {
    const { baseElement } = render(
      <AnnualChronicle snapshot={makeSnapshot()} nextYear={1629} onClose={() => {}} />
    )

    expect(baseElement.querySelector('.annual-chronicle__era')?.textContent).toBe('崇祯元年 · 岁末史载')
    expect(baseElement.querySelector('.annual-chronicle__headline')?.textContent).toBe('魏忠贤伏诛，崇祯新政初启')
    expect(baseElement.querySelector('.annual-chronicle__stat-value')?.textContent).toBe('户部主事')
    expect(baseElement.querySelectorAll('.annual-chronicle__stat-value')[1].textContent).toBe('412')
    expect(baseElement.querySelectorAll('.annual-chronicle__stat-value')[2].textContent).toBe('5 事')
    expect(baseElement.querySelector('.annual-chronicle__career')?.textContent).toContain('清名 2/3')
    expect(baseElement.querySelectorAll('.annual-chronicle__stat-value')[4].textContent).toBe('权谋之术')
    expect(baseElement.querySelector('.annual-chronicle__continue')?.textContent).toBe('展卷 · 入正月')
    expect(baseElement.querySelector('.annual-chronicle__next')?.textContent).toBe('崇祯二年 · 正月已至')

    const recordTitles = Array.from(baseElement.querySelectorAll('.annual-chronicle__record-title'))
      .map((node) => node.textContent)
    expect(recordTitles).toEqual(['阉党覆灭', '清丈田亩', '官升一级', '秉公结案'])
    expect(recordTitles).not.toContain('新君登基')
  })

  it('无志业时显示未立，不渲染进度点', () => {
    const { baseElement } = render(
      <AnnualChronicle snapshot={makeSnapshot({ career: null })} nextYear={1629} onClose={() => {}} />
    )
    expect(baseElement.querySelector('.annual-chronicle__stat-value--none')?.textContent).toBe('未立')
    expect(baseElement.querySelectorAll('.annual-chronicle__pip').length).toBe(0)
  })

  it('没有快照时不渲染任何东西', () => {
    render(<AnnualChronicle snapshot={null} nextYear={1629} onClose={() => {}} />)
    expect(document.body.querySelector('.annual-chronicle')).toBeNull()
  })
})
