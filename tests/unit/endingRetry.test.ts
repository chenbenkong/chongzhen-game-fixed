import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { flush, makeSaveData, renderGameEngine } from './helpers/gameEngine'

/**
 * 「重走人生」只回滚到触发结局的那张卡，不整局重开。
 *
 * 用户的要求是：
 *   - 点重走 → 回到触发结局的事件，玩家可以再选一次；
 *   - 同一个事件只能重选一次；
 *   - 重选后仍触发结局，按钮锁定。
 */
const ENDING_CHOICE: EventChoice = {
  id: 'retry_die',
  text: '硬着头皮顶上去',
  effects: { special: { type: 'ending' }, attributes: { 财帛: -5 } }
}

const SAFE_CHOICE: EventChoice = {
  id: 'retry_live',
  text: '退一步，先保命',
  effects: { attributes: { 文韬: 3 } }
}

const RETRY_EVENT: GameEvent = {
  id: 'retry_event_test',
  title: '同一张卡的重选测试',
  description: '桌上只剩两张牌，选错就收笔。',
  conditions: {},
  type: 'normal',
  choices: [ENDING_CHOICE, SAFE_CHOICE]
}

function retrySave() {
  return makeSaveData({
    currentEvent: RETRY_EVENT,
    currentEventId: RETRY_EVENT.id,
    eventHistory: [RETRY_EVENT.id]
  })
}

describe('结局后的「重走人生」', () => {
  it('回到同一事件并允许重选一次；第二次再触发结局后按钮锁定', async () => {
    const { result, unmount } = renderGameEngine({ loadSaveData: retrySave() })
    await flush()

    expect(result.current.currentEvent?.id).toBe(RETRY_EVENT.id)
    expect(result.current.character.attributes.财帛).toBe(50)

    await act(async () => {
      result.current.handleChoice(ENDING_CHOICE)
    })
    expect(result.current.isGameOver).toBe(true)
    expect(result.current.canRetryEnding).toBe(true)
    expect(result.current.retryEndingLocked).toBe(false)
    expect(result.current.character.attributes.财帛).toBe(45)

    // 结局把属性改掉了；重走必须回到「选之前」，不能把这次结局的增量留下。
    await act(async () => {
      expect(result.current.handleRetryEnding()).toBe(true)
    })
    expect(result.current.isGameOver).toBe(false)
    expect(result.current.currentEvent?.id).toBe(RETRY_EVENT.id)
    expect(result.current.character.attributes.财帛).toBe(50)
    expect(result.current.gameState.圣眷).toBe(50)

    // 第二次仍走死路：同一事件已经用掉唯一一次重选，按钮必须锁定。
    await act(async () => {
      result.current.handleChoice(ENDING_CHOICE)
    })
    expect(result.current.isGameOver).toBe(true)
    expect(result.current.canRetryEnding).toBe(false)
    expect(result.current.retryEndingLocked).toBe(true)

    unmount()
  })

  it('重走后可以换一条活路，且不会再触发结局', async () => {
    const { result, unmount } = renderGameEngine({ loadSaveData: retrySave() })
    await flush()

    await act(async () => {
      result.current.handleChoice(ENDING_CHOICE)
    })
    expect(result.current.isGameOver).toBe(true)

    await act(async () => {
      expect(result.current.handleRetryEnding()).toBe(true)
    })
    expect(result.current.isGameOver).toBe(false)

    await act(async () => {
      result.current.handleChoice(SAFE_CHOICE)
    })

    expect(result.current.isGameOver).toBe(false)
    expect(result.current.character.attributes.文韬).toBe(53)
    unmount()
  })
})
