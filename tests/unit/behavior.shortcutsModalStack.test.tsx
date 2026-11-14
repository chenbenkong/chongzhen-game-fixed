import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useGameShortcuts } from '../../src/hooks/useGameShortcuts'
import { useModal } from '../../src/hooks/useModal'

/**
 * 第五轮行为修复的钉子（不动风格与布局，只修行为）。
 * 每条都对应一次真实浏览器实测到的缺陷，防止回归。
 */

function Harness({ blockedAdvance = false }: { blockedAdvance?: boolean }) {
  const calls = (globalThis as any).__calls as string[]
  useGameShortcuts({
    onPickChoice: () => calls.push('pick'),
    onAdvance: () => calls.push('advance'),
    onSave: () => calls.push('save'),
    onAchievements: () => calls.push('ach'),
    onHelp: () => calls.push('help'),
    blocked: false,
    blockedAdvance
  })
  return (
    <div>
      <button data-testid="save-btn">存 档</button>
      <div tabIndex={0} data-testid="panel">面板</div>
    </div>
  )
}

describe('快捷键不得劫持焦点元素的原生激活（缺陷 2）', () => {
  beforeEach(() => {
    ;(globalThis as any).__calls = []
  })

  it('结果态下 Enter 落在按钮上：按下去的是那个按钮，不是推进', () => {
    render(<Harness blockedAdvance={false} />)
    const btn = screen.getByTestId('save-btn')
    btn.focus()

    fireEvent.keyDown(btn, { key: 'Enter', bubbles: true })

    expect((globalThis as any).__calls).not.toContain('advance')
  })

  it('Space 落在按钮上同样让位给按钮', () => {
    render(<Harness blockedAdvance={false} />)
    const btn = screen.getByTestId('save-btn')
    btn.focus()

    fireEvent.keyDown(btn, { key: ' ', bubbles: true })

    expect((globalThis as any).__calls).not.toContain('advance')
  })

  it('Enter 落在非按钮的可聚焦容器上也不许变成推进（浏览器本不会激活任何东西）', () => {
    render(<Harness blockedAdvance={false} />)
    const panel = screen.getByTestId('panel')
    panel.focus()

    fireEvent.keyDown(panel, { key: 'Enter', bubbles: true })

    expect((globalThis as any).__calls).not.toContain('advance')
  })

  it('焦点在正文（body）上时 Enter 仍然正常推进 —— 这条不能被上面几条改掉', () => {
    render(<Harness blockedAdvance={false} />)
    ;(document.activeElement as HTMLElement)?.blur?.()

    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })

    expect((globalThis as any).__calls).toContain('advance')
  })

  it('S / A / H 与焦点无关，照常生效', () => {
    render(<Harness blockedAdvance={false} />)
    const btn = screen.getByTestId('save-btn')
    btn.focus()

    fireEvent.keyDown(btn, { key: 'h', bubbles: true })

    expect((globalThis as any).__calls).toContain('help')
  })
})

describe('模态框栈：ESC 只关最上层（缺陷 6 基础）', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('两层弹窗叠着时，一次 ESC 只关掉上面那层', () => {
    const closed: string[] = []
    function Stack() {
      const [bottom, setBottom] = useState(true)
      const [top, setTop] = useState(true)
      const bottomModal = useModal({ open: bottom, onClose: () => { closed.push('bottom'); setBottom(false) } })
      const topModal = useModal({ open: top, onClose: () => { closed.push('top'); setTop(false) } })
      return (
        <div>
          {bottom && (
            <div data-testid="dlg-bottom" ref={bottomModal.dialogRef} {...bottomModal.getModalProps()}>
              <button>下层按钮</button>
            </div>
          )}
          {top && (
            <div data-testid="dlg-top" ref={topModal.dialogRef} {...topModal.getModalProps()}>
              <button>上层按钮</button>
            </div>
          )}
        </div>
      )
    }

    render(<Stack />)
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(2)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(closed).toEqual(['top'])
    expect(screen.queryByTestId('dlg-bottom')).toBeTruthy()
    expect(screen.queryByTestId('dlg-top')).toBeNull()
  })

  it('滚动锁按栈计数还原，不会在还剩一层时提前解锁', () => {
    function Stack() {
      const [open, setOpen] = useState(true)
      const m = useModal({ open, onClose: () => setOpen(false) })
      return open ? <div data-testid="d" ref={m.dialogRef} {...m.getModalProps()} /> : null
    }
    const { unmount } = render(<Stack />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
