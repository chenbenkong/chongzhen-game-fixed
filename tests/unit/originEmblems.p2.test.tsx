import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import OriginSelect from '../../src/components/OriginSelect'
import MobileOriginSetup from '../../src/mobile/MobileOriginSetup'

/**
 * P2.3 的 UI 合约：八副出身都必须有卡头印记，且卡根带 data-origin，
 * 供 CSS 按出身换图。图片本身由浏览器验截图负责，这里只锁结构。
 */
describe('P2.3 出身印记', () => {
  it('桌面八张卡各有一枚印记和 data-origin', () => {
    const { container } = render(<OriginSelect onSelect={() => {}} />)
    const cards = container.querySelectorAll('.origin-card')

    expect(cards).toHaveLength(8)
    expect(container.querySelectorAll('.origin-emblem')).toHaveLength(8)
    expect(Array.from(cards).every(card => !!card.getAttribute('data-origin'))).toBe(true)
  })

  it('手机八张卡各有一枚印记和 data-origin', () => {
    const { container } = render(<MobileOriginSetup onSelect={() => {}} onBack={() => {}} />)
    const cards = container.querySelectorAll('.mobile-origin-card')

    expect(cards).toHaveLength(8)
    expect(container.querySelectorAll('.origin-emblem')).toHaveLength(8)
    expect(Array.from(cards).every(card => !!card.getAttribute('data-origin'))).toBe(true)
  })
})
