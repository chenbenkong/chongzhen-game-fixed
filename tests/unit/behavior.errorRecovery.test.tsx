import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import ErrorBoundary from '../../src/components/ErrorBoundary'

/**
 * 「继续游戏」不能是死按钮（缺陷 4）的钉子。
 *
 * 实测：主包加载失败后连点 3 次，网络面板零新请求、页面纹丝不动 ——
 * 因为 React.lazy 缓存了失败的那个 promise，只清 state 的重渲染会同步再抛回来。
 * 修法是把「换一个全新 lazy 实例」的重试通道交给 main.tsx，这里钉住它被调用。
 */

function Boom(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

const primaryBtn = () => document.querySelector('.error-btn.primary') as HTMLButtonElement

describe('错误页的恢复动作', () => {
  it('点「继续游戏」必须请求重建 lazy 实例，而不是只清 state', () => {
    const spy = vi.fn()
    render(<ErrorBoundary onRetryChunk={spy}><Boom /></ErrorBoundary>)
    expect(document.querySelector('.error-boundary')).toBeTruthy()
    fireEvent.click(primaryBtn())
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('重试再次失败后仍能继续重试（每次都是新发起，不被节流掉）', () => {
    const spy = vi.fn()
    render(<ErrorBoundary onRetryChunk={spy}><Boom /></ErrorBoundary>)

    // 每轮重新查询：上一次点击已让组件重渲染，旧节点引用会失效
    for (let i = 1; i <= 3; i++) {
      fireEvent.click(primaryBtn())
      expect(spy).toHaveBeenCalledTimes(i)
      expect(document.querySelector('.error-boundary'), `第 ${i} 次重试后应重新给出错误页`).toBeTruthy()
    }
  })

  it('没有重试通道时点击不抛异常（退化为原来的清 state）', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(() => fireEvent.click(primaryBtn())).not.toThrow()
  })

  it('「清除存档」必须先打开确认框，而不是直接删', () => {
    localStorage.setItem('chongzhen_save_slot_1', '{"marker":"PRECIOUS"}')
    render(<ErrorBoundary onRetryChunk={vi.fn()}><Boom /></ErrorBoundary>)
    const danger = [...document.querySelectorAll('.error-btn')]
      .find(b => /清除存档/.test(b.textContent || '')) as HTMLButtonElement
    expect(danger).toBeTruthy()

    fireEvent.click(danger)

    expect(document.querySelector('.cd-overlay'), '确认框必须真的出现在 DOM 里').toBeTruthy()
    expect(localStorage.getItem('chongzhen_save_slot_1'), '未确认前不得删档').toBe('{"marker":"PRECIOUS"}')
  })

  it('确认框里按 ESC = 取消，存档保留', () => {
    localStorage.setItem('chongzhen_save_slot_1', '{"marker":"PRECIOUS"}')
    render(<ErrorBoundary onRetryChunk={vi.fn()}><Boom /></ErrorBoundary>)
    const danger = [...document.querySelectorAll('.error-btn')]
      .find(b => /清除存档/.test(b.textContent || '')) as HTMLButtonElement
    fireEvent.click(danger)
    expect(document.querySelector('.cd-overlay')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(document.querySelector('.cd-overlay'), 'ESC 应关掉确认框').toBeNull()
    expect(localStorage.getItem('chongzhen_save_slot_1')).toBe('{"marker":"PRECIOUS"}')
  })
})
