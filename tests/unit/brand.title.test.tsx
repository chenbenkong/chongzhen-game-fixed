import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TitleScreen from '../../src/components/TitleScreen'
import MobileTitle from '../../src/mobile/MobileTitle'

vi.mock('../../src/components/BGMContext', () => ({
  BGMProvider: ({ children }: { children: unknown }) => children,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

// 品牌统一（8.24）：index.html / manifest / boot 早已是「崇祯·宦海浮沉」，
// 但桌面与手机标题 h1 还留着旧名「崇祯直聘」。这里钉住两处 h1 与副标题 descriptor。
const callbacks = {
  onStart: vi.fn(),
  onContinueAutosave: vi.fn(),
  onOpenLoad: vi.fn(),
  onOpenAchievements: vi.fn(),
  onOpenCodex: vi.fn(),
  onOpenTutorial: vi.fn(),
  onDifficultyChange: vi.fn()
}

describe('品牌统一 · 标题屏', () => {
  it('桌面标题 h1 为新名，副标题仍是玩法 descriptor', () => {
    render(<TitleScreen {...callbacks} difficulty="normal" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('崇祯·宦海浮沉')
    expect(document.querySelector('.title-sub')?.textContent).toBe('明末官场沉浮模拟器')
  })

  it('手机标题 h1 为新名', () => {
    render(<MobileTitle {...callbacks} difficulty="normal" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('崇祯·宦海浮沉')
  })
})