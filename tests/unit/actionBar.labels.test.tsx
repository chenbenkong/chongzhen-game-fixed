import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ActionBar from '../../src/components/ActionBar'

/**
 * 底栏每个按钮是「单字徽标 + 标签」两段文本（`.btn-icon` 是**可见文字**，不是 SVG 图标），
 * 拼起来才是玩家实际读到的一行字。
 *
 * 这条规则曾经被破：主按钮标签写成「进 下 月」，于是屏幕上显示「进进下月」，
 * 存按钮「存 档」显示「存存档」—— 玩家当成 bug 报了（2026-10-19）。
 * 标签跟着状态分支变，光看代码看不出来，所以在渲染结果上守。
 */

function renderBar(overrides: Partial<ComponentProps<typeof ActionBar>> = {}) {
  const view = render(
    <ActionBar
      onNextMonth={vi.fn()}
      onSave={vi.fn()}
      turn={12}
      canProceed
      {...overrides}
    />
  )
  const buttons = [...view.container.querySelectorAll<HTMLElement>('.action-bar .action-btn')].map(btn => {
    const badge = btn.querySelector('.btn-icon')?.textContent?.trim() ?? ''
    return { badge, text: (btn.textContent ?? '').replace(/\s+/g, ''), cls: btn.className }
  })
  view.unmount()
  return buttons
}

describe('ActionBar · 徽标与标签拼出来的字', () => {
  it('没有任何一个按钮把徽标那个字重复一遍', () => {
    for (const state of [
      { canProceed: true },
      { canProceed: true, pendingCount: 2 },
      { canProceed: false },
      { canProceed: true, onOpenAIAdvisor: vi.fn(), onOpenImageGenerator: vi.fn() }
    ]) {
      for (const btn of renderBar(state)) {
        expect(btn.text.startsWith(btn.badge.repeat(2)), `${btn.text}（徽标「${btn.badge}」重复）`).toBe(false)
      }
    }
  })

  it('主按钮读作「进下月」，有待办时读作「进下一件」', () => {
    expect(renderBar()[0].text).toBe('进下月')
    expect(renderBar({ pendingCount: 2 })[0].text).toBe('进下一件')
  })

  it('存按钮读作「存档」', () => {
    const save = renderBar().find(btn => btn.badge === '存')
    expect(save?.text).toBe('存档')
  })

  it('丹青按钮紧挨「谋士」，读作「绘丹青」', () => {
    const btns = renderBar({ onOpenAIAdvisor: vi.fn(), onOpenImageGenerator: vi.fn() })
    const image = btns.findIndex(b => b.cls.includes('image-generator-btn'))
    const advisor = btns.findIndex(b => b.cls.includes('ai-advisor-btn'))
    expect(image, '底栏没有丹青按钮').toBeGreaterThanOrEqual(0)
    expect(Math.abs(image - advisor), '丹青必须与谋士相邻').toBe(1)
    expect(btns[image].text).toBe('绘丹青')
  })
})
