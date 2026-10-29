import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EventDisplay from '../../src/components/EventDisplay'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * 第七十三轮：结算面板必须显示**真正落账**的增量。
 *
 * 引擎在写属性时会先乘难度系数、再乘出身修正、最后夹上下限；
 * 结算面板此前直接渲染 `choice.effects`（作者声明的原始值），
 * 于是「简单模式 +3」实际 +5、面板却写 +3，玩家读到的账是假的。
 * `onChoice` 现在回传实际增量，面板优先用它。
 *
 * 同一轮还钉住：辞官类结局的确认弹窗打开时，`onChoice` 返回 null，
 * 面板不能抢先把结算画出来 —— 玩家点「取消」后不该看到一次没有发生的抉择。
 */

function makeEvent(choice: EventChoice): GameEvent {
  return {
    id: 'ev-applied-effects',
    title: '测试事件',
    description: '一段用于测试的事件描述。',
    conditions: {},
    type: 'normal',
    choices: [choice]
  }
}

function baseProps(event: GameEvent) {
  return {
    event,
    character: makeCharacter(),
    gameState: makeGameState(),
    onContinue: () => {},
    onUndo: () => {},
    canUndo: false,
    isProcessing: false,
    pendingCount: 0
  }
}

describe('第七十三轮：结算面板显示实际落账值', () => {
  it('优先渲染 onChoice 回传的实际增量，而不是声明值', () => {
    const choice: EventChoice = {
      id: 'c1',
      text: '慷慨解囊',
      effects: { attributes: { 财帛: 3 } },
      result: { title: '解囊', tags: [], echo: '你散了些钱。' }
    }
    const onChoice = vi.fn(() => ({
      attributes: { 财帛: 4 },
      gameState: {},
      hidden: {}
    }))

    render(<EventDisplay {...baseProps(makeEvent(choice))} onChoice={onChoice} />)
    fireEvent.click(screen.getByRole('button', { name: /慷慨解囊/ }))

    expect(screen.getByText('财帛+4')).toBeTruthy()
    expect(screen.queryByText('财帛+3')).toBeNull()
  })

  it('国势增量必须显示成「国势」，不能显示成「中官」', () => {
    const choice: EventChoice = {
      id: 'c1',
      text: '整饬边防',
      effects: { gameState: { 国势: 5 } },
      result: { title: '边防稍固', tags: [], echo: '' }
    }
    const onChoice = vi.fn(() => ({
      attributes: {},
      gameState: { 国势: 5 },
      hidden: {}
    }))

    render(<EventDisplay {...baseProps(makeEvent(choice))} onChoice={onChoice} />)
    fireEvent.click(screen.getByRole('button', { name: /整饬边防/ }))

    expect(screen.getByText('国势+5')).toBeTruthy()
    expect(screen.queryByText('中官+5')).toBeNull()
  })

  it('onChoice 返回 null（等待二次确认）时不画结算', () => {
    const choice: EventChoice = {
      id: 'c1',
      text: '挂冠求去，辞官归里',
      effects: { gameState: { 清议: 10 }, special: { type: 'ending' } },
      result: { title: '归去来兮', tags: [], echo: '' }
    }
    const onChoice = vi.fn(() => null)

    render(<EventDisplay {...baseProps(makeEvent(choice))} onChoice={onChoice} />)
    fireEvent.click(screen.getByRole('button', { name: /挂冠求去/ }))

    expect(onChoice).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.result-section')).toBeNull()
    expect(screen.queryByText('归去来兮')).toBeNull()
    // 选项仍然在，玩家可以重新做抉择（取消确认后不该被困在结果页）
    expect(screen.getByRole('button', { name: /挂冠求去/ })).toBeTruthy()
  })
})
