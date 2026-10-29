import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameScreen from '../../src/components/GameScreen'
import type { GameEvent } from '../../src/types/event'
import { makeProps, makeSaveData } from './helpers/gameEngine'

// 死亡结局覆盖层是 portal 到 body 的全屏遮罩。它开着的时候，牌桌还在下面，
// 键盘快捷键也会照常触发 —— 于是 Space 能在「你已身死」的画面上推进一个月。
// 这里把 useGameShortcuts 换成一个记录参数的桩，直接钉住门控。

vi.mock('../../src/hooks/useGameShortcuts', () => ({
  useGameShortcuts: (handlers: Record<string, unknown>) => {
    ;(globalThis as Record<string, unknown>).__shortcutHandlers = handlers
  }
}))

// 状态栏里有个 BGM 开关，真实实现要求包在 BGMProvider 里；这个用例不测音频
vi.mock('../../src/components/BGMContext', () => ({
  BGMProvider: ({ children }: { children: unknown }) => children,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

const deathEvent: GameEvent = {
  id: 'round73_death_overlay',
  title: '体检：绝境',
  description: '四面楚歌，退无可退。',
  conditions: {},
  type: 'normal',
  choices: [
    { id: 'die', text: '【自缢】了此残生', effects: {} },
    { id: 'live', text: '【硬撑】再撑一撑', effects: {} }
  ]
}

function shortcutBlocked(): boolean {
  return (globalThis as Record<string, any>).__shortcutHandlers.blocked as boolean
}

describe('第七十三轮：死亡结局遮罩必须挡住游戏快捷键', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__shortcutHandlers
  })

  it('遮罩弹开后 blocked 变为 true，底下的事件不再吃键盘', () => {
    render(
      <GameScreen
        {...makeProps({
          loadSaveData: makeSaveData({
            currentEvent: deathEvent,
            currentEventId: deathEvent.id
          })
        })}
      />
    )

    // 遮罩没开时快捷键是可用的
    expect(shortcutBlocked()).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /自缢/ }))

    // 死亡遮罩已经盖住整屏
    expect(screen.getByText('自缢身亡')).toBeTruthy()
    expect(shortcutBlocked()).toBe(true)
  })
})
