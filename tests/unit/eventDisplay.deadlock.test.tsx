import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventDisplay from '../../src/components/EventDisplay'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * 「所有选项都关死」时的事件面板不能成为终点。
 *
 * 引擎在发牌前会用 `hasOpenChoice` 筛掉整张全锁的卡，但同月队列是按**月初**状态排好的：
 * 前一张卡的抉择可以把后一张卡的门一扇扇关上。UI 里没有可点的选项时，
 * 底部「进 下 月」因为 eventResolved=false 是禁用的 —— 玩家就卡死在这张卡上。
 * 投骰（勉力一试）是另一条路，但它只对属性/状态类门开放，而且一个事件只能投一次；
 * 投失败之后同样无路可走。
 *
 * 这里钉的是最后一道兜底：只要「没有可点的选项，也没有还能投的骰子」，
 * 面板就必须自己给出向前走的路，而不是把玩家留在一屏灰按钮前。
 */

function lockedChoice(id: string, text: string): EventChoice {
  return {
    id,
    text,
    description: `${text}的说明`,
    // 经历门：checkChoiceRequirement 对 flag 类不给 difficulty，因此没有「勉力一试」
    showConditions: { flags: { has: ['never_happened_flag'] } },
    effects: {},
    result: { title: text, tags: [], echo: '回音' }
  }
}

function deadEvent(id: string): GameEvent {
  return {
    id,
    title: '死局',
    description: '这一段里所有能做的事都已关死。',
    conditions: {},
    type: 'normal',
    choices: [lockedChoice('c1', '上疏'), lockedChoice('c2', '辞官'), lockedChoice('c3', '称病')]
  }
}

function openEvent(id: string): GameEvent {
  return {
    id,
    title: '活局',
    description: '还有一条路可以走。',
    conditions: {},
    type: 'normal',
    choices: [
      lockedChoice('c1', '上疏'),
      { id: 'c2', text: '暂且按下', description: '', effects: {}, result: { title: '暂且按下', tags: [], echo: '回音' } }
    ]
  }
}

function baseProps(event: GameEvent | null) {
  return {
    event,
    character: makeCharacter(),
    gameState: makeGameState(),
    onChoice: () => {},
    onContinue: () => {},
    onUndo: () => {},
    canUndo: false,
    isProcessing: false,
    pendingCount: 0
  }
}

describe('EventDisplay 全锁事件的兜底出口（第七十七轮）', () => {
  it('没有可点选项、也没有骰子可投时，面板仍给出一条向前的路', () => {
    const onContinue = vi.fn()
    render(<EventDisplay {...baseProps(deadEvent('ev-dead'))} onContinue={onContinue} />)

    expect(document.querySelectorAll('.choice-card').length).toBe(3)
    expect(screen.queryByLabelText('勉力一试：上疏')).toBeNull()

    const escape = screen.getByRole('button', { name: /事已至此/ })
    fireEvent.click(escape)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('只要还有一条路可选，就不出现这个出口', () => {
    render(<EventDisplay {...baseProps(openEvent('ev-open'))} />)
    expect(screen.queryByRole('button', { name: /事已至此/ })).toBeNull()
  })
})
