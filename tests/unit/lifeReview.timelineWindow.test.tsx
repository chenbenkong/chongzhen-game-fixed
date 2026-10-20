import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LifeReview from '../../src/components/LifeReview'
import type { LifeRecord, LifeSummary } from '../../src/types/game'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * 第三十四轮新增：把「生平回顾·时间线到底渲染多少行」钉住。
 *
 * §1.2 那句"长周目性能只做了推理、未做实测"本轮补测时，帧率/堆/存档体积都过了
 * （见 `tests/mem-check.mjs` 第二段），真正没上限的是这一页：`keyEvents` 为空的一生
 * 直接渲染整份 `lifeRecords`。真浏览器里灌 481 条履历抄到 **481 行、面板内 7230 个节点**
 * （全页 7734，主界面才 349 个），每行还各带一枚 Icon。jsdom 不算 flexbox，但**数节点**它是准的，
 * 所以这一半用静态断言钉在 CI，另一半（帧率、体积、结算页行数）留在需要浏览器的量具里。
 */

const WINDOW = 60

const makeRecords = (n: number, withKey: boolean): LifeRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `lr_${i}`,
    year: 1628 + Math.floor(i / 12),
    month: (i % 12) + 1,
    type: withKey && i % 60 === 0 ? 'promotion' : 'event',
    impact: withKey && i % 60 === 0 ? '升迁' : undefined,
    title: `履历条目 ${i}`,
    description: '这是一条履历的文字'
  }))

const summaryWith = (keyEvents: LifeRecord[]): LifeSummary => ({
  totalRecords: 0,
  keyEvents,
  finalTitle: '文林郎',
  finalRank: '七品',
  reputation: '正直',
  legacy: '无子嗣',
  lifespan: { start: 1628, end: 1644 },
  achievements: [],
  controversies: []
})

function openReview(lifeRecords: LifeRecord[], keyEvents: LifeRecord[]) {
  render(
    <LifeReview
      isOpen
      lifeRecords={lifeRecords}
      lifeSummary={summaryWith(keyEvents)}
      character={makeCharacter()}
      finalGameState={makeGameState()}
      onClose={vi.fn()}
      onRestart={vi.fn()}
    />
  )
}

const rows = () => document.querySelectorAll('.timeline-row')

describe('生平回顾 · 时间线的渲染上限（第三十四轮）', () => {
  it('一生没有关键条目时，兜底不整份渲染 480 条', () => {
    openReview(makeRecords(480, false), [])
    expect(rows()).toHaveLength(WINDOW)
    // 少一句"此前 N 条未列出"，玩家就会以为这一生只活了 60 件事
    expect(screen.getByText(/只抄最近 60 条；此前 420 条未列出/)).toBeTruthy()
  })

  it('折叠掉的记录点一下就全出来 —— 收起来的是玩家的一生，不是可以丢的数据', () => {
    openReview(makeRecords(480, false), [])
    fireEvent.click(screen.getByRole('button', { name: '全部展开' }))
    expect(rows()).toHaveLength(480)
    expect(screen.getByText(/已展开全部 480 条/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '全部展开' })).toBeNull()
  })

  it('被留下的是最近的 60 条，不是最老的 60 条', () => {
    openReview(makeRecords(480, false), [])
    expect(rows()[0].textContent).toContain('履历条目 420')
    expect(rows()[rows().length - 1].textContent).toContain('履历条目 479')
  })

  it('关键条目本来就 ≤10 条：一条不少，也不多塞提示', () => {
    const all = makeRecords(480, true)
    const key = all.filter(r => r.type === 'promotion').slice(-10)
    openReview(all, key)
    expect(rows()).toHaveLength(key.length)
    expect(document.querySelector('.timeline-window-note')).toBeNull()
  })

  it('短局（不足 60 条）渲染全部，也不显示提示', () => {
    openReview(makeRecords(24, false), [])
    expect(rows()).toHaveLength(24)
    expect(document.querySelector('.timeline-window-note')).toBeNull()
  })
})
