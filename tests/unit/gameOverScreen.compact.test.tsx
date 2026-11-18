import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameOverScreen from '../../src/components/GameOverScreen'
import type { GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

const endingEvent: GameEvent = {
  id: 'ending_hermit_test',
  title: '【结局】归园田居',
  description: '你辞了官，回到江南旧宅，从此不问朝堂。',
  conditions: {},
  choices: [],
  type: 'ending',
  endingConfig: { category: 'hermit', tier: 'bittersweet' }
}

describe('结局结算界面', () => {
  it('首屏只显示结局概要，详细史传默认收起', () => {
    const { container } = render(
      <GameOverScreen
        endingEvent={endingEvent}
        character={makeCharacter({
          name: '沈砚',
          rank: '正七品·知县',
          history: []
        })}
        gameState={makeGameState({
          currentYear: 1640,
          currentMonth: 7,
          圣眷: 42,
          清议: 76,
          民望: 71,
          士绅: 64
        })}
        biography={'【明史列传·沈砚传】\n\n    沈砚，字子明，南直隶苏州府吴县人。'}
        onRestart={() => {}}
        onReturnToMenu={() => {}}
      />
    )

    expect(container.querySelector('.ending-container--compact')).not.toBeNull()
    expect(container.querySelector('.ending-middle')).toBeNull()
    expect(container.querySelector('.ending-hero-title')?.textContent).toBe('归园田居')
    expect(screen.getByText('你辞了官，回到江南旧宅，从此不问朝堂。')).not.toBeNull()
    expect(container.querySelectorAll('.ending-fact')).toHaveLength(4)
    expect(container.querySelector('.ending-details')?.hasAttribute('open')).toBe(false)
    expect(container.querySelector('.attr-cell')).not.toBeNull()
  })

  it('展开完整结算后才显示史馆传略与属性', () => {
    const { container } = render(
      <GameOverScreen
        endingEvent={endingEvent}
        character={makeCharacter({ name: '沈砚' })}
        gameState={makeGameState()}
        biography={'【明史列传·沈砚传】\n\n    沈砚，字子明。'}
        onRestart={() => {}}
        onReturnToMenu={() => {}}
      />
    )

    const details = container.querySelector('.ending-details') as HTMLDetailsElement
    fireEvent.click(container.querySelector('summary') as HTMLElement)

    expect(details.open).toBe(true)
    expect(screen.getByText('史 馆 传 略')).not.toBeNull()
    expect(screen.getByText('属 性 与 成 就')).not.toBeNull()
  })

  it('有志向时，结局首屏按志业给整数评价', () => {
    const { container } = render(
      <GameOverScreen
        endingEvent={endingEvent}
        character={makeCharacter({ name: '沈砚', promotionCount: 3 })}
        gameState={makeGameState({ currentYear: 1640, currentMonth: 7 })}
        careerGoalId="promotion"
        onRestart={() => {}}
        onReturnToMenu={() => {}}
      />
    )

    const career = container.querySelector('.ending-career-goal')
    expect(career).not.toBeNull()
    expect(career?.textContent).toContain('升迁')
    expect(career?.textContent).toContain('近志 · 2/3')
  })

  it('同一事件重选失败后「重走人生」锁定，不能再点', () => {
    const { container } = render(
      <GameOverScreen
        endingEvent={endingEvent}
        character={makeCharacter({ name: '沈砚' })}
        gameState={makeGameState()}
        onRestart={() => {}}
        canRestart={false}
        restartLocked
        onReturnToMenu={() => {}}
      />
    )

    const restart = Array.from(container.querySelectorAll('.end-btn')).find(
      node => node.textContent?.includes('重走人生')
    ) as HTMLButtonElement
    expect(restart).not.toBeNull()
    expect(restart.disabled).toBe(true)
    expect(restart.textContent).toContain('已锁')
  })
})
