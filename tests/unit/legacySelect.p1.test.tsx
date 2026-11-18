import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LegacySelect from '../../src/components/LegacySelect'
import { emptyLegacyState } from '../../src/data/legacy'

const STORAGE_KEY = 'chongzhen-legacy-v1'

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe('P1 家训选择屏', () => {
  it('第一次玩没有点数，三条都锁着，但仍可直接开局', () => {
    const onConfirm = vi.fn()
    render(<LegacySelect onConfirm={onConfirm} onBack={vi.fn()} />)
    expect(screen.getByText('家 训')).toBeTruthy()
    expect(screen.getByText(/还没有留下什么/)).toBeTruthy()
    expect(screen.getAllByRole('radio').every((el) => (el as HTMLButtonElement).disabled)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '直接开局' }))
    expect(onConfirm).toHaveBeenCalledWith(null)
  })

  it('点数够时选一条，确认后才扣点并开局', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...emptyLegacyState(),
      points: { 门生: 12, 著作: 3, 家训: 0 }
    }))
    const onConfirm = vi.fn()
    render(<LegacySelect onConfirm={onConfirm} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /故吏满门/ }))
    fireEvent.click(screen.getByRole('button', { name: '带此家训开局' }))
    expect(onConfirm).toHaveBeenCalledWith('mentor')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).points.门生).toBe(0)
  })
})
