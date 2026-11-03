import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAndUnlockAchievements } from '../../src/types/achievement'
import { renderGameEngine } from './helpers/gameEngine'

/**
 * 第七十七轮：卸载后的悬挂定时器。
 *
 * `handleNextMonth` 的推进真正发生在 300ms 之后的定时器里。这个定时器没有登记，
 * 也没有在卸载时清理 —— 玩家点「进 下 月」后立刻返回主菜单（或切到别的存档），
 * 300ms 后它照旧执行 `checkAchievements()`。成就是**模块级单例**，
 * 这次调用会把弃局的状态写进下一个存档的成就里。
 *
 * 这里把成就判定的入口换成可观测的 spy：卸载后只要它还被调用一次，就是红的。
 */

vi.mock('../../src/types/achievement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/types/achievement')>()
  return {
    ...actual,
    checkAndUnlockAchievements: vi.fn(actual.checkAndUnlockAchievements)
  }
})

const mockedUnlock = vi.mocked(checkAndUnlockAchievements)

afterEach(() => {
  vi.useRealTimers()
  mockedUnlock.mockClear()
})

describe('引擎卸载后的悬挂定时器（第七十七轮）', () => {
  it('「进 下 月」排下的 300ms 定时器在卸载后不得再执行', async () => {
    vi.useFakeTimers()
    const hook = renderGameEngine({ origin: '寒门' })
    // 等挂载初始化（engineReady + 首月发牌）落定
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    mockedUnlock.mockClear()

    act(() => {
      hook.result.current.handleNextMonth()
    })
    hook.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(mockedUnlock).not.toHaveBeenCalled()
  })
})
