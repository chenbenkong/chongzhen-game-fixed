/**
 * P1 手机横屏版：家训屏必须在「出身」与「牌桌」之间。
 *
 * 这里不重复测家训规则（legacy.p1.test.ts 已经覆盖），只钉两件事：
 *   1. 手机入口真的会经过 legacy 屏，不能像桌面第一版那样漏掉；
 *   2. 选中的家训 id 真的传给 MobileBoard，读档时则必须清空，防止叠第二条。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const boardProps: Array<Record<string, unknown>> = []

vi.mock('../../src/mobile/MobileShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('../../src/mobile/MobileTitle', () => ({
  default: ({ onStart }: { onStart: () => void }) => (
    <button className="mock-start" onClick={onStart}>开始</button>
  )
}))

vi.mock('../../src/mobile/MobileNameSetup', () => ({
  default: ({ onConfirm }: { onConfirm: (value: unknown) => void }) => (
    <button
      className="mock-name"
      onClick={() => onConfirm({ name: '张三', courtesyName: '字明', hometown: '苏州府', age: 24 })}
    >
      确认姓名
    </button>
  )
}))

vi.mock('../../src/mobile/MobileOriginSetup', () => ({
  default: ({ onSelect }: { onSelect: (value: string) => void }) => (
    <button className="mock-origin" onClick={() => onSelect('寒门')}>选寒门</button>
  )
}))

vi.mock('../../src/components/LegacySelect', () => ({
  default: ({ onConfirm }: { onConfirm: (value: string | null) => void }) => (
    <div>
      <button className="mock-legacy-skip" onClick={() => onConfirm(null)}>跳过家训</button>
      <button className="mock-legacy-take" onClick={() => onConfirm('mentor')}>带故吏满门</button>
    </div>
  )
}))

vi.mock('../../src/mobile/MobileBoard', () => ({
  default: (props: Record<string, unknown>) => {
    boardProps.push(props)
    return <div data-testid="mock-board">牌桌</div>
  }
}))

import MobileApp from '../../src/mobile/MobileApp'

beforeEach(() => {
  boardProps.length = 0
})

function reachLegacy() {
  render(<MobileApp />)
  fireEvent.click(screen.getByText('开始'))
  fireEvent.click(screen.getByText('确认姓名'))
  fireEvent.click(screen.getByText('选寒门'))
}

describe('P1 手机横屏版：家训入口', () => {
  it('出身之后必经家训屏，跳过也才进牌桌', async () => {
    reachLegacy()
    expect(screen.getByText('跳过家训')).toBeTruthy()
    fireEvent.click(screen.getByText('跳过家训'))
    await waitFor(() => expect(screen.getByTestId('mock-board')).toBeTruthy())
    expect(boardProps[boardProps.length - 1]?.legacyPerkId).toBeNull()
  })

  it('选中的家训会传给牌桌', async () => {
    reachLegacy()
    fireEvent.click(screen.getByText('带故吏满门'))
    await waitFor(() => expect(screen.getByTestId('mock-board')).toBeTruthy())
    expect(boardProps[boardProps.length - 1]?.legacyPerkId).toBe('mentor')
  })
})
