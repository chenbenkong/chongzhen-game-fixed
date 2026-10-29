import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useGameEngine, type UseGameEngineProps } from '../../src/hooks/useGameEngine'
import type { EventChoice, GameEvent } from '../../src/types/event'
import type { GameStateValues } from '../../src/types/game'
import { AUTOSAVE_KEY } from '../../src/types/save'
import { flush, makeProps, makeSaveData, renderGameEngine } from './helpers/gameEngine'

/**
 * 第七十三轮：全面体检里量到的四类引擎缺陷。
 *
 *  1. 难度系数把「损失」也一起放大 —— 简单模式扣得更多、困难模式扣得更少，
 *     与设置页写的「属性获得更容易 / 更难」正好相反；顺带把倍率产生的小数落进属性。
 *  2. 结算面板拿不到实际增量（见 eventDisplay.appliedEffects.test.tsx），这里钉住引擎回传值。
 *  3. 读档首帧的旧键迁移与读档 effect 不是同一张映射表：`百姓口碑` 被错接给士绅、
 *     `安全` 整条丢失，首帧读出来的是错误局势。
 *  4. 自动存档的指纹漏了隐藏属性：只改隐藏属性的抉择（14 条）不会触发保存，
 *     刷新后这次抉择凭空消失。
 */

const EVENT: GameEvent = {
  id: 'round73_event',
  title: '体检事件',
  description: '',
  conditions: {},
  type: 'normal',
  choices: []
}

function saveWith(choice: EventChoice, overrides: Parameters<typeof makeSaveData>[0] = {}) {
  return makeSaveData({
    currentEvent: { ...EVENT, choices: [choice] },
    currentEventId: EVENT.id,
    ...overrides
  })
}

describe('第七十三轮：难度系数只作用于「获得」', () => {
  const choice: EventChoice = {
    id: 'c1',
    text: '一手进一手出',
    effects: { attributes: { 财帛: 10, 武略: -10 } }
  }

  it('简单模式：+10 变成 +15，−10 仍是 −10', async () => {
    const { result, unmount } = renderGameEngine({
      loadSaveData: saveWith(choice),
      difficulty: 'easy'
    })
    await flush()

    let applied: unknown
    await act(async () => {
      applied = result.current.handleChoice(choice)
    })

    expect(result.current.character.attributes.财帛).toBe(65)
    expect(result.current.character.attributes.武略).toBe(40)
    expect(applied).toEqual({
      attributes: { 财帛: 15, 武略: -10 },
      gameState: {},
      hidden: {}
    })
    unmount()
  })

  it('困难模式：+10 变成 +7，−10 仍是 −10', async () => {
    const { result, unmount } = renderGameEngine({
      loadSaveData: saveWith(choice),
      difficulty: 'hard'
    })
    await flush()

    await act(async () => {
      result.current.handleChoice(choice)
    })

    expect(result.current.character.attributes.财帛).toBe(57)
    expect(result.current.character.attributes.武略).toBe(40)
    unmount()
  })

  it('倍率产生的小数落账前取整（简单模式 +3 → +5，而不是 +4.5）', async () => {
    const fractional: EventChoice = {
      id: 'c2',
      text: '小有进项',
      effects: { attributes: { 财帛: 3 } }
    }
    const { result, unmount } = renderGameEngine({
      loadSaveData: saveWith(fractional),
      difficulty: 'easy'
    })
    await flush()

    await act(async () => {
      result.current.handleChoice(fractional)
    })

    expect(result.current.character.attributes.财帛).toBe(55)
    unmount()
  })
})

describe('第七十三轮：辞官确认期间不产生结算', () => {
  const resign: EventChoice = {
    id: 'resign',
    text: '挂冠求去，辞官归里',
    effects: { gameState: { 清议: 10 }, special: { type: 'ending' } }
  }

  it('handleChoice 返回 null，且没有任何写入', async () => {
    const { result, unmount } = renderGameEngine({ loadSaveData: saveWith(resign) })
    await flush()

    const before = result.current.gameState.清议
    let applied: unknown = 'unset'
    await act(async () => {
      applied = result.current.handleChoice(resign)
    })

    expect(applied).toBeNull()
    expect(result.current.resignConfirmModal.isOpen).toBe(true)
    expect(result.current.gameState.清议).toBe(before)
    expect(result.current.lifeRecords).toHaveLength(0)
    unmount()
  })
})

describe('第七十三轮：读档首帧就使用正确的旧键映射', () => {
  it('百姓口碑→民望、商贾→士绅、安全→中官，首帧不得出现错位', async () => {
    const legacyState = {
      currentYear: 1628,
      currentMonth: 3,
      turn: 12,
      帝心: 60,
      安全: 70,
      派系立场: 55,
      商贾: 45,
      百姓口碑: 65,
      国势: 40
    } as unknown as GameStateValues

    const save = makeSaveData({ gameState: legacyState })
    const renders: GameStateValues[] = []
    const { unmount } = renderHook(
      (props: UseGameEngineProps) => {
        const engine = useGameEngine(props)
        renders.push(engine.gameState)
        return engine
      },
      { initialProps: makeProps({ loadSaveData: save }) }
    )
    await flush()

    expect(renders.length).toBeGreaterThan(0)
    for (const state of renders) {
      expect(state.士绅).toBe(45)
      expect(state.民望).toBe(65)
      expect(state.中官).toBe(70)
      expect(state.圣眷).toBe(60)
      expect(state.清议).toBe(55)
      expect(state.国势).toBe(40)
    }
    unmount()
  })
})

describe('第七十三轮：只改隐藏属性的抉择也会自动存档', () => {
  it('隐藏属性变化后的 400ms 内写盘，读回来的就是新值', async () => {
    const hiddenChoice: EventChoice = {
      id: 'c1',
      text: '暗中周旋',
      effects: { hidden: { 道德值: -7 } }
    }
    const { result, unmount } = renderGameEngine({ loadSaveData: saveWith(hiddenChoice) })
    await flush(500)

    const before = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}')
    expect(before.character?.hidden?.道德值).toBe(50)

    await act(async () => {
      result.current.handleChoice(hiddenChoice)
    })
    await flush(600)

    const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}')
    expect(result.current.character.hidden.道德值).toBe(43)
    expect(saved.character?.hidden?.道德值).toBe(43)
    unmount()
  })
})
