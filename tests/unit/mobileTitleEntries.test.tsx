import { render, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MobileTitle from '../../src/mobile/MobileTitle'

vi.mock('../../src/components/BGMContext', () => ({
  BGMProvider: ({ children }: { children: unknown }) => children,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

// 手机横屏标题屏此前只留了开始 / 继续 / 读档；成就、结局图鉴、帮助三个入口
// 在代码注释里写着“待后续补充”。这里把三个入口钉住：存在、可点、各自回调。
describe('手机标题屏档案与帮助入口', () => {
  it('成就 / 局鉴 / 帮助三个入口都在，且分别触发对应弹窗', () => {
    const onOpenAchievements = vi.fn()
    const onOpenCodex = vi.fn()
    const onOpenTutorial = vi.fn()

    render(
      <MobileTitle
        onStart={vi.fn()}
        onContinueAutosave={vi.fn()}
        onOpenLoad={vi.fn()}
        onOpenAchievements={onOpenAchievements}
        onOpenCodex={onOpenCodex}
        onOpenTutorial={onOpenTutorial}
        difficulty="normal"
        onDifficultyChange={vi.fn()}
      />
    )

    const extras = screen.getByRole('navigation', { name: '档案与帮助' })
    expect(extras.querySelectorAll('button')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: '成 就' }))
    fireEvent.click(screen.getByRole('button', { name: '局 鉴' }))
    fireEvent.click(screen.getByRole('button', { name: '帮 助' }))

    expect(onOpenAchievements).toHaveBeenCalledTimes(1)
    expect(onOpenCodex).toHaveBeenCalledTimes(1)
    expect(onOpenTutorial).toHaveBeenCalledTimes(1)
  })
})
