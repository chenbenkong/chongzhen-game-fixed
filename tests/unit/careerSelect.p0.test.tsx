import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CareerSelect from '../../src/components/CareerSelect'

describe('P0.2 志业选择屏', () => {
  it('不选志业也能直接开局，回调 null', () => {
    const onConfirm = vi.fn()
    render(<CareerSelect onConfirm={onConfirm} onBack={vi.fn()} />)

    fireEvent.click(screen.getByText('不立志业，直接开局'))
    expect(onConfirm).toHaveBeenCalledWith(null)
  })

  it('选中升迁后，确认按钮把 promotion 传给引擎', () => {
    const onConfirm = vi.fn()
    render(<CareerSelect onConfirm={onConfirm} onBack={vi.fn()} />)

    fireEvent.click(screen.getByText('升迁'))
    fireEvent.click(screen.getByText('以「升迁」开局'))
    expect(onConfirm).toHaveBeenCalledWith('promotion')
  })
})
