import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LifeReview from '../../src/components/LifeReview'
import type { LifeSummary } from '../../src/types/game'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * 「这一生」这一页到底有没有把玩家做过的事说出来。
 *
 * 数据层的对账在 `flagMemoirs.data.test.ts`；这里钉的是**界面**：
 * 有文案的要显示出来，没文案的（机器 id）一条都不许漏出来。
 * 后者比前者重要 —— `wife_wangshi` 印在结算页上，比这页是空的更糟。
 */

const SUMMARY: LifeSummary = {
  totalRecords: 0,
  keyEvents: [],
  finalTitle: '文林郎',
  finalRank: '七品',
  reputation: '正直',
  legacy: '无子嗣',
  lifespan: { start: 1628, end: 1644 },
  achievements: [],
  controversies: []
}

function openMemoirs(flags: string[]) {
  render(
    <LifeReview
      isOpen
      lifeRecords={[]}
      lifeSummary={SUMMARY}
      character={makeCharacter({ flags })}
      finalGameState={makeGameState()}
      onClose={vi.fn()}
      onRestart={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: '这一生' }))
}

describe('生平回顾 ·「这一生」', () => {
  it('有履历文案的经历，结算页上读得出来', () => {
    openMemoirs(['忠臣', '地方官任职', '红袖的下落', 'wife_wangshi'])
    expect(screen.getByText('先帝宾天，于众目之前尽臣子哀礼')).toBeTruthy()
    expect(screen.getByText('在地方上实任过一职')).toBeTruthy()
    expect(screen.getByText('出钱问明红袖如今在何处')).toBeTruthy()
    expect(screen.getByText('娶了王氏，这段姻缘认下了')).toBeTruthy()
    expect(screen.getByText('朝局')).toBeTruthy()
    expect(screen.getByText('人情')).toBeTruthy()
  })

  it('没登记文案的 flag 一条都不显示', () => {
    openMemoirs(['忠臣', 'xianv_unknown_id', 'liushi_dead', 'pending_zhanggui'])
    expect(document.querySelectorAll('.memoirs-item')).toHaveLength(1)
    for (const raw of ['xianv_unknown_id', 'liushi_dead', 'pending_zhanggui']) {
      expect(document.body.textContent).not.toContain(raw)
    }
  })

  it('身上一个可考的经历都没有时，给的是空话而不是一片空白', () => {
    openMemoirs([])
    expect(screen.getByText('这一生没留下可考的事。')).toBeTruthy()
    expect(document.querySelectorAll('.memoirs-item')).toHaveLength(0)
  })

  it('条数与列表一致，重复的经历不重复记', () => {
    openMemoirs(['忠臣', '忠臣', '直笔', '丁忧在籍'])
    expect(Number(document.querySelector('.memoirs-lede-count')!.textContent)).toBe(
      document.querySelectorAll('.memoirs-item').length
    )
    expect(document.querySelectorAll('.memoirs-item')).toHaveLength(3)
  })
})
