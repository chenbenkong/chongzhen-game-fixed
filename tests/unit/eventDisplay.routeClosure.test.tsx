import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import EventDisplay from '../../src/components/EventDisplay'
import { initialEvents } from '../../src/data/events'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import type { GameEvent } from '../../src/types/event'
import type { Attributes, Character, GameStateValues } from '../../src/types/game'

/**
 * 「此择将断了」—— 第四十三轮。
 *
 * 生产口径 108 局：结局卡之外，54 次选项真的关掉了玩家正在追的命途（41 局，38.0%），
 * 其中 36 次发生在年窗开启前（玩家要到几年后看「经历相冲」才知道），每一次都不可逆。
 * 这里只钉 UI 契约：该报的报、可退赃的不报、摘票也要报、结局卡不报。
 */

function baseProps(event: GameEvent, character: Character, gameState: GameStateValues) {
  return {
    event,
    character,
    gameState,
    onChoice: () => {},
    onContinue: () => {},
    onUndo: () => {},
    canUndo: false,
    isProcessing: false,
    pendingCount: 0
  }
}

const eventOf = (id: string) => initialEvents.find(e => e.id === id)!

describe('选项断途提醒', () => {
  it('追着清流殉道的人选「力保袁崇焕」，卡片上先写断在哪', () => {
    const event = eventOf('historical_003')
    render(
      <EventDisplay
        {...baseProps(
          event,
          makeCharacter({
            flags: ['东林党人'],
            attributes: { ...makeCharacter().attributes, 文韬: 80 } as Attributes
          }),
          makeGameState({ currentYear: 1629, turn: 20 })
        )}
      />
    )
    expect(
      within(screen.getByRole('button', { name: /力保袁崇焕/ })).getByText(/此择将断了：清流殉道/)
    ).toBeTruthy()
  })

  it('可退赃的敛财不写成断途', () => {
    const event = eventOf('historical_021')
    render(
      <EventDisplay
        {...baseProps(
          event,
          makeCharacter({
            flags: ['与世无争'],
            hidden: { 道德值: 20, 欲望值: 50, 野心值: 30, 机敏值: 50, 忠诚值: 50 }
          }),
          makeGameState({ currentYear: 1634, turn: 70 })
        )}
      />
    )
    const embezzle = screen.getByRole('button', { name: /借机敛财/ })
    expect(within(embezzle).queryByText(/此择将断了/)).toBeNull()
  })

  it('退赃摘掉最后一张海票，也在卡片上写明断了海盗之王', () => {
    const event = eventOf('historical_020_crisis')
    render(
      <EventDisplay
        {...baseProps(
          event,
          makeCharacter({ flags: ['皮岛敛财'] }),
          makeGameState({ currentYear: 1632, turn: 60 })
        )}
      />
    )
    expect(
      within(screen.getByRole('button', { name: /主动认罪/ })).getByText(/此择将断了：海盗之王/)
    ).toBeTruthy()
  })

  it('结局卡不提示断途：那一步本来就是收笔', () => {
    const ending: GameEvent = {
      id: 'ending_test_closure',
      title: '测试结局',
      description: '收笔。',
      conditions: {},
      type: 'ending',
      choices: [
        {
          id: 'c1',
          text: '【就此收笔】',
          effects: { flags: { add: ['袁党'] } }
        }
      ]
    }
    render(
      <EventDisplay
        {...baseProps(
          ending,
          makeCharacter({ flags: ['东林党人'] }),
          makeGameState({ currentYear: 1629, turn: 20 })
        )}
      />
    )
    expect(screen.queryByText(/此择将断了/)).toBeNull()
  })
})
