import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EventDisplay from '../../src/components/EventDisplay'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

function makeEvent(choice: EventChoice): GameEvent {
  return {
    id: 'ev-choice-panel',
    title: '本月抉择面板',
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

const choice: EventChoice = {
  id: 'c1',
  text: '上疏新政',
  description: '陈述治国方略。',
  effects: { attributes: { 文韬: 2 } },
  result: { title: '新政', tags: [], echo: '' }
}

describe('桌面端「本月抉择」面板', () => {
  it('不把选项铺在正文底部，点击入口后才打开目录面板', async () => {
    const { container } = render(
      <EventDisplay {...baseProps(makeEvent(choice))} choicesPresentation="panel" />
    )

    expect(container.querySelector('.choices-section')).toBeNull()
    const fab = container.querySelector('.desktop-choices-fab') as HTMLButtonElement
    expect(fab).toBeTruthy()
    expect(container.querySelector('.desktop-choices-prompt')).toBeTruthy()

    fireEvent.click(fab)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).toContain('desktop-choices-panel')
    expect(within(dialog).getByRole('heading', { name: '本月抉择' })).toBeTruthy()
    expect(within(dialog).getByText('1 项')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /上疏新政/ })).toBeTruthy()
  })

  it('面板开合上报给外层，避免 S / A / H 在目录上再叠面板', async () => {
    const onChoicePanelOpenChange = vi.fn()
    const { container } = render(
      <EventDisplay
        {...baseProps(makeEvent(choice))}
        choicesPresentation="panel"
        onChoicePanelOpenChange={onChoicePanelOpenChange}
      />
    )

    await waitFor(() => expect(onChoicePanelOpenChange).toHaveBeenLastCalledWith(false))

    fireEvent.click(container.querySelector('.desktop-choices-fab') as HTMLButtonElement)
    await screen.findByRole('dialog')
    await waitFor(() => expect(onChoicePanelOpenChange).toHaveBeenLastCalledWith(true))

    fireEvent.click(screen.getByRole('button', { name: '收起选项目录' }))
    await waitFor(() => expect(onChoicePanelOpenChange).toHaveBeenLastCalledWith(false))
  })

  it('面板未打开时数字键不会选中不可见的选项，打开后才生效', async () => {
    const onChoice = vi.fn(() => ({ attributes: {}, gameState: {}, hidden: {} }))
    const { container } = render(
      <EventDisplay
        {...baseProps(makeEvent(choice))}
        choicesPresentation="panel"
        onChoice={onChoice}
      />
    )

    fireEvent.keyDown(window, { key: '1' })
    expect(onChoice).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.desktop-choices-fab') as HTMLButtonElement)
    await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: '1' })
    expect(onChoice).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(container.querySelector('.settlement-title')?.textContent).toBe('新政')
    })
  })
})
