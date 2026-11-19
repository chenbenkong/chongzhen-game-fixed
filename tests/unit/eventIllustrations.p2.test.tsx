import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameOverScreen from '../../src/components/GameOverScreen'
import EventDisplay from '../../src/components/EventDisplay'
import { historicalEvents } from '../../src/data/events'
import { EVENT_ILLUSTRATIONS, eventIllustration } from '../../src/data/eventIllustrations'
import type { GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

const endingEvent: GameEvent = {
  id: 'ending_hermit_event_illustration_test',
  title: '【结局】归园田居',
  description: '你辞了官，回到江南旧宅。',
  conditions: {},
  choices: [],
  type: 'ending',
  endingConfig: { category: 'hermit', tier: 'bittersweet' }
}

function renderEnding() {
  return render(
    <GameOverScreen
      endingEvent={endingEvent}
      character={makeCharacter({ name: '沈砚' })}
      gameState={makeGameState({ currentYear: 1644, currentMonth: 3 })}
      biography="【明史列传·沈砚传】"
      onRestart={() => {}}
      onReturnToMenu={() => {}}
    />
  )
}

describe('P2.5 事件插图与结局印章', () => {
  it('20 张事件插图都有资产，且全部对应当前事件池中的事件', () => {
    const ids = Object.keys(EVENT_ILLUSTRATIONS)
    expect(ids).toHaveLength(20)
    expect(ids.every((id) => Boolean(EVENT_ILLUSTRATIONS[id]))).toBe(true)
    const eventIds = new Set(historicalEvents.map((event) => event.id))
    expect(ids.every((id) => eventIds.has(id))).toBe(true)
  })

  it('已配图事件在事件卡渲染插图，普通事件不留空位', () => {
    const event = historicalEvents.find((entry) => entry.id === 'historical_001')
    expect(event).toBeTruthy()
    const { container, rerender } = render(
      <EventDisplay
        event={event!}
        character={makeCharacter()}
        gameState={makeGameState()}
        onContinue={() => {}}
        onUndo={() => {}}
        canUndo={false}
        isProcessing={false}
        pendingCount={0}
      />
    )
    const image = container.querySelector('.event-illustration img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toContain('event-xinjun-dengji')

    rerender(
      <EventDisplay
        event={{ ...event!, id: 'historical_001_plain', title: '寻常事件' }}
        character={makeCharacter()}
        gameState={makeGameState()}
        onContinue={() => {}}
        onUndo={() => {}}
        canUndo={false}
        isProcessing={false}
        pendingCount={0}
      />
    )
    expect(container.querySelector('.event-illustration')).toBeNull()
    expect(eventIllustration('historical_001_plain')).toBeUndefined()
  })

  it('结局页渲染透明国祚印章', () => {
    const { container } = renderEnding()
    const seal = container.querySelector('.ending-seal')
    expect(seal).not.toBeNull()
    expect(seal?.getAttribute('src')).toContain('ending-seal')
  })
})
