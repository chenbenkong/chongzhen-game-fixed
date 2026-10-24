import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import NameInput from '../../src/components/NameInput'

/**
 * 起名屏的两颗「随机」按钮。
 *
 * 【随 机 取 名】是玩家第一眼看到的动词（第五十五轮线上实测，§1.4 ㊱）：
 * 点完只写回姓/名/字/年岁，籍贯留空，于是【定 此 名 字】停在 disabled，
 * 屏幕上没有一句"还缺籍贯"。一键随机就该把这张表填满。
 *
 * 【随机抽】是籍贯那一格自己的按钮，只管籍贯，不许顺手改名字。
 */

function getInput(view: ReturnType<typeof render>, label: string) {
  return view.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement
}

function getButton(view: ReturnType<typeof render>, text: string) {
  return view.getByRole('button', { name: text }) as HTMLButtonElement
}

describe('起名屏 · 随机取名', () => {
  it('【随 机 取 名】把籍贯一起填上，主按钮立刻可点', () => {
    const view = render(<NameInput onConfirm={vi.fn()} />)

    expect(getButton(view, '定 此 名 字').disabled, '一进来就不该可点').toBe(true)
    fireEvent.click(getButton(view, '随 机 取 名'))

    const hometown = getInput(view, '籍贯')
    expect(hometown.value).not.toBe('')
    expect(hometown.value).toMatch(/[府县卫]/)
    expect(getInput(view, '姓').value).not.toBe('')
    expect(getInput(view, '名').value).not.toBe('')
    expect(getInput(view, '字').value).not.toBe('')
    expect(getButton(view, '定 此 名 字').disabled).toBe(false)
    view.unmount()
  })

  it('【随 机 取 名】之后能直接交名字，籍贯随结果一起交出去', () => {
    const onConfirm = vi.fn()
    const view = render(<NameInput onConfirm={onConfirm} />)

    fireEvent.click(getButton(view, '随 机 取 名'))
    fireEvent.click(getButton(view, '定 此 名 字'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const result = onConfirm.mock.calls[0][0]
    expect(result.hometown).toBe(getInput(view, '籍贯').value)
    expect(result.name.length).toBeGreaterThanOrEqual(2)
    expect(result.courtesyName.length).toBeGreaterThan(0)
    view.unmount()
  })

  it('主按钮按不动时，屏幕上写清楚还缺哪一格', () => {
    const view = render(<NameInput onConfirm={vi.fn()} />)

    const hint = view.getByRole('status')
    expect(hint.textContent).toContain('籍贯')
    expect(hint.textContent).toContain('姓')

    fireEvent.input(getInput(view, '姓'), { target: { value: '陈' } })
    fireEvent.input(getInput(view, '名'), { target: { value: '承业' } })
    fireEvent.input(getInput(view, '字'), { target: { value: '伯承' } })
    expect(view.getByRole('status').textContent, '姓名齐了只剩籍贯').toBe('还缺：籍贯')

    fireEvent.click(getButton(view, '随机抽'))
    expect(view.queryByRole('status'), '填齐之后不该再挂一行提示').toBeNull()
    view.unmount()
  })

  it('【随机抽】只补籍贯，不动已经填好的姓名', () => {
    const view = render(<NameInput onConfirm={vi.fn()} />)
    fireEvent.click(getButton(view, '随 机 取 名'))
    const surname = getInput(view, '姓').value
    const givenName = getInput(view, '名').value

    fireEvent.click(getButton(view, '随机抽'))

    expect(getInput(view, '姓').value).toBe(surname)
    expect(getInput(view, '名').value).toBe(givenName)
    expect(getInput(view, '籍贯').value).not.toBe('')
    view.unmount()
  })
})
