import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GameScreen from '../../src/components/GameScreen'
import type { GameEvent } from '../../src/types/event'
import { makeProps, makeSaveData } from './helpers/gameEngine'

// 剧情线顶栏曾经把 getCurrentStoryline 包在只依赖函数引用的 useMemo 里，
// 于是首次渲染算出 undefined 后永远不更新。本用例走真实引擎：
// 从一个没有剧情线的事件里选到「→ 边关狼烟」，顶栏必须当场换成该线路。

vi.mock('../../src/hooks/useGameShortcuts', () => ({
  useGameShortcuts: () => {}
}))

vi.mock('../../src/components/BGMContext', () => ({
  BGMProvider: ({ children }: { children: unknown }) => children,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

const storylineEvent: GameEvent = {
  id: 'test_storyline_switch',
  title: '出关',
  description: '辽东告急，朝廷正在点将。',
  conditions: {},
  type: 'normal',
  choices: [
    {
      id: 'go_border',
      text: '【请缨出关】去辽东试一试。',
      storyline: 'border_war',
      effects: {}
    },
    {
      id: 'stay',
      text: '【留在京中】不趟这趟浑水。',
      effects: {}
    }
  ]
}

describe('剧情线顶栏随抉择刷新', () => {
  it('选到带剧情线的选项后，顶栏不再停在未启程', async () => {
    const { container } = render(
      <GameScreen
        {...makeProps({
          loadSaveData: makeSaveData({
            currentEvent: storylineEvent,
            currentEventId: storylineEvent.id
          })
        })}
      />
    )

    expect(container.querySelector('.storyline-bar__name')?.textContent).toBe('未启程')

    // 桌面端选项收在「本月抉择」面板里，先展开目录再点选项。
    fireEvent.click(screen.getByRole('button', { name: /打开选项/ }))
    fireEvent.click(screen.getByRole('button', { name: /请缨出关/ }))

    await waitFor(() => {
      expect(container.querySelector('.storyline-bar__name')?.textContent).toBe('边关狼烟')
    })
  })
})
