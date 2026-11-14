import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import TitleScreen from '../../src/components/TitleScreen'

vi.mock('../../src/components/BGM', () => ({
  BGMFixedButton: () => null,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

/**
 * 难度 radiogroup 的键盘契约（缺陷 5）。
 *
 * 实测：Tab 到「普通」后按 ArrowRight/ArrowDown/ArrowLeft/ArrowUp/Home/End/Enter/Space，
 * 八个键合计改变选中项 0 次 —— 组件只挂了 onClick，却声明了 role=radiogroup，
 * 键盘玩家永远只能玩「普通」难度（鼠标点则立刻生效）。
 */

function renderTitle(onDifficultyChange = vi.fn()) {
  render(
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
  return onDifficultyChange
}

const radio = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.title-difficulty__option')]
    .find(b => (b.textContent || '').trim() === label) as HTMLButtonElement

describe('难度单选组键盘操作', () => {
  it('右/下键切到下一档并把焦点带过去', () => {
    const onDifficultyChange = renderTitle()

    fireEvent.keyDown(radio('普通'), { key: 'ArrowRight' })

    expect(onDifficultyChange).toHaveBeenLastCalledWith('hard')
    expect(document.activeElement).toBe(radio('困难'))
  })

  it('左/上键循环到首档', () => {
    const onDifficultyChange = renderTitle()

    fireEvent.keyDown(radio('普通'), { key: 'ArrowLeft' })

    expect(onDifficultyChange).toHaveBeenLastCalledWith('easy')
    expect(document.activeElement).toBe(radio('简单'))
  })

  it('Home / End 直达首尾', () => {
    const onDifficultyChange = renderTitle()

    fireEvent.keyDown(radio('普通'), { key: 'End' })
    expect(onDifficultyChange).toHaveBeenLastCalledWith('hard')

    fireEvent.keyDown(radio('困难'), { key: 'Home' })
    expect(onDifficultyChange).toHaveBeenLastCalledWith('easy')
  })

  it('其它按键不改难度（Enter/Space 留给按钮自身激活）', () => {
    const onDifficultyChange = renderTitle()
    const normal = radio('普通')

    fireEvent.keyDown(normal, { key: 'Enter' })
    fireEvent.keyDown(normal, { key: ' ' })
    fireEvent.keyDown(normal, { key: 'a' })

    expect(onDifficultyChange).not.toHaveBeenCalled()
  })

  it('任何时刻都只有一个 Tab 停靠点（roving tabindex 不被破坏）', () => {
    renderTitle()
    const radios = [...document.querySelectorAll('.title-difficulty__option')]

    expect(radios.filter(r => r.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(radio('普通').getAttribute('aria-checked')).toBe('true')
  })
})
