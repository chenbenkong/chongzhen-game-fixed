import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AppliedChoiceEffects, EventChoice, GameEvent } from '../../src/types/event'
import { capDamage } from '../../src/utils/damageCap'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'

const EVENT: GameEvent = {
  id: 'damage_cap_probe',
  title: '一次豪赌',
  description: '把全部身家押上去',
  conditions: {},
  type: 'normal',
  choices: []
}

function probe(choice: EventChoice, character = makeCharacter(), gameState = makeGameState()) {
  return makeSaveData({
    character,
    gameState,
    currentEvent: { ...EVENT, choices: [choice] },
    currentEventId: EVENT.id
  })
}

describe('handleChoice：负向尖峰夹在引擎落账处', () => {
  it('财帛 50 遇 -100：单次只掉 25，结算面板也报 -25', async () => {
    const choice: EventChoice = { id: 'all_in', text: '全押', effects: { attributes: { 财帛: -100 } } }
    const { result, unmount } = renderGameEngine({ loadSaveData: probe(choice) })
    await flush()

    let applied: AppliedChoiceEffects | null = null
    await act(async () => {
      applied = result.current.handleChoice(choice)
    })

    expect(result.current.character.attributes.财帛).toBe(25)
    expect((applied as AppliedChoiceEffects | null)?.attributes.财帛).toBe(-25)
    unmount()
  })

  it('圣眷 50 遇 -100：单次只掉 25，不能一卡从受宠打到归零', async () => {
    const choice: EventChoice = { id: 'offend', text: '当面顶撞', effects: { gameState: { 圣眷: -100 } } }
    const { result, unmount } = renderGameEngine({ loadSaveData: probe(choice) })
    await flush()

    await act(async () => {
      result.current.handleChoice(choice)
    })

    expect(result.current.gameState.圣眷).toBe(25)
    unmount()
  })

  it('道德值 50 遇 -100：单次只掉 25', async () => {
    const choice: EventChoice = { id: 'betray', text: '卖友求荣', effects: { hidden: { 道德值: -100 } } }
    const { result, unmount } = renderGameEngine({ loadSaveData: probe(choice) })
    await flush()

    await act(async () => {
      result.current.handleChoice(choice)
    })

    expect(result.current.character.hidden.道德值).toBe(25)
    unmount()
  })

  it('当前 20 遇 -100：按绝对下限 10 掉，剩 10', async () => {
    const choice: EventChoice = { id: 'all_in', text: '全押', effects: { attributes: { 财帛: -100 } } }
    const character = makeCharacter({ attributes: { 财帛: 20, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 } })
    const { result, unmount } = renderGameEngine({ loadSaveData: probe(choice, character) })
    await flush()

    await act(async () => {
      result.current.handleChoice(choice)
    })

    expect(result.current.character.attributes.财帛).toBe(10)
    unmount()
  })

  it('圣眷 65 遇 -100：单次掉 32，落账为整数 33，不出现 32.5', async () => {
    const choice: EventChoice = { id: 'offend', text: '当面顶撞', effects: { gameState: { 圣眷: -100 } } }
    const gameState = makeGameState({ 圣眷: 65 })
    const { result, unmount } = renderGameEngine({ loadSaveData: probe(choice, makeCharacter(), gameState) })
    await flush()

    let applied: AppliedChoiceEffects | null = null
    await act(async () => {
      applied = result.current.handleChoice(choice)
    })

    expect(result.current.gameState.圣眷).toBe(33)
    expect((applied as AppliedChoiceEffects | null)?.gameState.圣眷).toBe(-32)
    unmount()
  })

  it('正增量仍然按难度倍率放大，不被夹', async () => {
    const choice: EventChoice = { id: 'reward', text: '领赏', effects: { attributes: { 财帛: 20 } } }
    const { result, unmount } = renderGameEngine({ loadSaveData: probe(choice), difficulty: 'easy' })
    await flush()

    await act(async () => {
      result.current.handleChoice(choice)
    })

    expect(result.current.character.attributes.财帛).toBe(80) // 50 + 20 × 1.5
    unmount()
  })

  it('纯函数口径与引擎一致', () => {
    expect(capDamage(50, -100)).toBe(-25)
    expect(capDamage(20, -100)).toBe(-10)
    expect(capDamage(65, -100)).toBe(-32)
  })
})
