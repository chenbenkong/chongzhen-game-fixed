import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import TitleScreen from '../../src/components/TitleScreen'

vi.mock('../../src/components/BGM', () => ({
  BGMFixedButton: () => null,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

describe('标题屏存档备份入口', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('本机没有任何存档时，仍然保留「读取存档」入口，能进入导入备份', () => {
    const onOpenLoad = vi.fn()
    render(
      <TitleScreen
        onStart={vi.fn()}
        onContinueAutosave={vi.fn()}
        onOpenLoad={onOpenLoad}
        onOpenAchievements={vi.fn()}
        onOpenCodex={vi.fn()}
        onOpenTutorial={vi.fn()}
        difficulty="normal"
        onDifficultyChange={vi.fn()}
      />
    )

    const loadButton = [...document.querySelectorAll<HTMLButtonElement>('.title-btn')]
      .find(button => (button.textContent || '').replace(/\s/g, '') === '读取存档')

    expect(loadButton).toBeTruthy()
    fireEvent.click(loadButton as HTMLButtonElement)
    expect(onOpenLoad).toHaveBeenCalledTimes(1)
  })
})
