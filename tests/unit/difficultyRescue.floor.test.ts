import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { flush, makeCharacter, makeSaveData, renderGameEngine } from './helpers/gameEngine'

const WARNING: GameEvent = {
  id: 'boundary_warn_财帛',
  title: '囊橐萧然',
  description: '归零警告',
  conditions: {},
  type: 'normal',
  choices: []
}

function saveWith(choice: EventChoice) {
  return makeSaveData({
    character: makeCharacter({ attributes: { 财帛: 0, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 } }),
    currentEvent: { ...WARNING, choices: [choice] },
    currentEventId: WARNING.id
  })
}

describe('P0：归零警告结算后的保命下限', () => {
  const choiceByDifficulty: Record<string, EventChoice> = {
    easy: { id: 'crash', text: '把最后的家底也押出去', effects: { attributes: { 财帛: -100 } } },
    normal: { id: 'crash', text: '把最后的家底也押出去', effects: { attributes: { 财帛: -60 } } },
    hard: { id: 'crash', text: '把最后的家底也押出去', effects: { attributes: { 财帛: -60 } } }
  }

  for (const [difficulty, floor] of [['easy', 5], ['normal', 5], ['hard', 5]] as const) {
    it(`${difficulty}：财帛归零警告后不会低于 ${floor}`, async () => {
      const { result, unmount } = renderGameEngine({ loadSaveData: saveWith(choiceByDifficulty[difficulty]), difficulty })
      await flush()

      await act(async () => {
        result.current.handleChoice(choiceByDifficulty[difficulty])
      })

      expect(result.current.character.attributes.财帛).toBe(floor)
      unmount()
    })
  }
})
