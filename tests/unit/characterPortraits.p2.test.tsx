import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameOverScreen from '../../src/components/GameOverScreen'
import EventDisplay from '../../src/components/EventDisplay'
import { figuresEvents } from '../../src/data/events/historical/figures'
import { CHARACTER_PORTRAITS, figureEventPortrait } from '../../src/data/characterPortraits'
import { relationshipsOf } from '../../src/data/characters'
import type { GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

const endingEvent: GameEvent = {
  id: 'ending_hermit_portrait_test',
  title: '【结局】归园田居',
  description: '你辞了官，回到江南旧宅。',
  conditions: {},
  choices: [],
  type: 'ending',
  endingConfig: { category: 'hermit', tier: 'bittersweet' }
}

function endingProps(flags: string[]) {
  return {
    endingEvent,
    character: makeCharacter({ name: '沈砚', flags }),
    gameState: makeGameState({ currentYear: 1640, currentMonth: 7 }),
    biography: '【明史列传·沈砚传】',
    onRestart: () => {},
    onReturnToMenu: () => {}
  }
}

describe('P2.4 人物立绘', () => {
  it('12 个常驻人物都有立绘，四个专属事件都能取到人物图', () => {
    const ids = [
      'chongzhen', 'sunchuanting', 'yuanchonghuan', 'hongchengchou',
      'yang_sichang', 'wen_tiren', 'wu_sangui', 'li_zicheng',
      'huang_taiji', 'wei_zhongxian', 'lu_xiangsheng', 'furen'
    ]
    expect(Object.keys(CHARACTER_PORTRAITS).sort()).toEqual([...ids].sort())
    expect(ids.every((id) => Boolean(CHARACTER_PORTRAITS[id]))).toBe(true)

    const figureIds = [
      'figure_chongzhen_audience',
      'figure_hong_chengchou',
      'figure_sun_chuanting',
      'figure_wu_sangui'
    ]
    for (const eventId of figureIds) {
      const figure = figureEventPortrait(eventId)
      expect(figure).toBeTruthy()
      expect(figure?.portrait).toBe(CHARACTER_PORTRAITS[figure!.character.id])
    }
    expect(figureEventPortrait('normal_event')).toBeUndefined()
  })

  it('结局“故人”最多三张人物卡，并带对应人物立绘', () => {
    const flags = ['崇祯赏识', '崇祯近臣', '固守潼关', '袁党']
    const { container } = render(<GameOverScreen {...endingProps(flags)} />)

    const cards = container.querySelectorAll('.ending-relationship-card')
    expect(cards).toHaveLength(3)
    const top = relationshipsOf(flags).slice(0, 3).map((entry) => entry.character.id)
    expect(Array.from(cards).map((card) => card.querySelector('.ending-relationship-portrait')?.getAttribute('data-character-id')))
      .toEqual(top)
    for (const card of cards) {
      expect((card.querySelector('.ending-relationship-portrait') as HTMLElement).style.backgroundImage)
        .toContain('portrait-')
    }
  })

  it('专属人物事件显示“本事件人物”签，普通事件不显示', () => {
    const figureEvent = figuresEvents[0]
    const { container, rerender } = render(
      <EventDisplay
        event={figureEvent}
        character={makeCharacter()}
        gameState={makeGameState()}
        onContinue={() => {}}
        onUndo={() => {}}
        canUndo={false}
        isProcessing={false}
        pendingCount={0}
      />
    )
    expect(container.querySelector('.event-figure-strip')).not.toBeNull()
    expect(screen.getByText('崇祯帝')).not.toBeNull()
    expect(container.querySelector('.event-figure-portrait')?.getAttribute('data-character-id')).toBe('chongzhen')

    rerender(
      <EventDisplay
        event={{ ...figureEvent, id: 'normal_event', title: '寻常事件' }}
        character={makeCharacter()}
        gameState={makeGameState()}
        onContinue={() => {}}
        onUndo={() => {}}
        canUndo={false}
        isProcessing={false}
        pendingCount={0}
      />
    )
    expect(container.querySelector('.event-figure-strip')).toBeNull()
  })
})
