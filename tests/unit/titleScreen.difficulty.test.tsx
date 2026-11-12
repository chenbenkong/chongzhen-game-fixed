import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TitleScreen from '../../src/components/TitleScreen'

vi.mock('../../src/components/BGM', () => ({
  BGMFixedButton: () => <button type="button">音乐</button>
}))

function renderTitle(onDifficultyChange = vi.fn()) {
  const view = render(
    <TitleScreen
      onStart={vi.fn()}
      onContinueAutosave={vi.fn()}
      onOpenLoad={vi.fn()}
      onOpenAchievements={vi.fn()}
      onOpenCodex={vi.fn()}
      onOpenTutorial={vi.fn()}
      difficulty="normal"
      onDifficultyChange={onDifficultyChange}
    />
  )
  return { view, onDifficultyChange }
}

describe('TitleScreen · 难度单选组键盘交互', () => {
  it('方向键按顺序切换并把焦点移到目标项', () => {
    const { onDifficultyChange } = renderTitle()
    const normal = screen.getByRole('radio', { name: '普通' })
    const hard = screen.getByRole('radio', { name: '困难' })

    fireEvent.keyDown(normal, { key: 'ArrowRight' })

    expect(onDifficultyChange).toHaveBeenCalledWith('hard')
    expect(document.activeElement).toBe(hard)
  })

  it('向左可循环到最后一项，Home / End 直达首尾', () => {
    const { onDifficultyChange } = renderTitle()
    const normal = screen.getByRole('radio', { name: '普通' })
    const easy = screen.getByRole('radio', { name: '简单' })
    const hard = screen.getByRole('radio', { name: '困难' })

    fireEvent.keyDown(normal, { key: 'ArrowLeft' })
    expect(onDifficultyChange).toHaveBeenLastCalledWith('easy')
    expect(document.activeElement).toBe(easy)

    fireEvent.keyDown(easy, { key: 'ArrowLeft' })
    expect(onDifficultyChange).toHaveBeenLastCalledWith('hard')
    expect(document.activeElement).toBe(hard)

    fireEvent.keyDown(hard, { key: 'Home' })
    expect(onDifficultyChange).toHaveBeenLastCalledWith('easy')
    fireEvent.keyDown(easy, { key: 'End' })
    expect(onDifficultyChange).toHaveBeenLastCalledWith('hard')
  })

  it('其他按键不篡改难度，当前项保持唯一的 Tab 停靠点', () => {
    const { onDifficultyChange } = renderTitle()
    fireEvent.keyDown(screen.getByRole('radio', { name: '普通' }), { key: 'Enter' })

    expect(onDifficultyChange).not.toHaveBeenCalled()
    const options = screen.getAllByRole('radio')
    expect(options.filter(option => option.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: '普通' }).getAttribute('aria-checked')).toBe('true')
  })
})
