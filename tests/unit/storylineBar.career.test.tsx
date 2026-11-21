import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import StorylineBar from '../../src/components/StorylineBar'
import { careerGoalStatus } from '../../src/data/careerGoals'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

describe('P3.1 牌桌抬头 · 本局志业', () => {
  it('桌面剧情线把志业并入同一行，显示 2/3 与三枚进度点', () => {
    const character = makeCharacter({ careerGoal: 'reputation' })
    const career = careerGoalStatus('reputation', character, makeGameState({ 清议: 66 }))
    const { container } = render(
      <StorylineBar currentStorylineKey="border_war" eventCount={7} career={career} />
    )

    expect(container.querySelector('.storyline-bar__career-caption')?.textContent).toBe('志业')
    expect(container.querySelector('.storyline-bar__career-name')?.textContent).toBe('清名')
    expect(container.querySelector('.storyline-bar__career-count')?.textContent).toBe('2/3')
    expect(container.querySelector('.storyline-bar__name')?.textContent).toBe('边关狼烟')
    expect(container.querySelector('.storyline-bar__count')?.textContent).toBe('7 事件')
    const pips = container.querySelectorAll('.storyline-bar__career-pip')
    expect(pips.length).toBe(3)
    expect(pips[0].classList.contains('is-done')).toBe(true)
    expect(pips[1].classList.contains('is-done')).toBe(true)
    expect(pips[2].classList.contains('is-done')).toBe(false)
  })

  it('没立志业时不渲染志业段，史线仍正常显示', () => {
    const { container } = render(
      <StorylineBar currentStorylineKey="power" eventCount={2} career={null} />
    )
    expect(container.querySelector('.storyline-bar__career')).toBeNull()
    expect(container.querySelector('.storyline-bar__name')?.textContent).toBe('权谋之术')
  })

  it('史线未启程时，志业仍然可见', () => {
    const character = makeCharacter({ careerGoal: 'promotion' })
    const career = careerGoalStatus('promotion', character, makeGameState())
    const { container } = render(
      <StorylineBar currentStorylineKey={undefined} eventCount={0} career={career} />
    )
    expect(container.querySelector('.storyline-bar__career-name')?.textContent).toBe('升迁')
    expect(container.querySelector('.storyline-bar__name')?.textContent).toBe('未启程')
  })
})
