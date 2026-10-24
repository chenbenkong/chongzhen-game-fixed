import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'

/**
 * 第五十七轮：结局前奏被历史卡永久遮蔽（§1.4 ㉖）。
 *
 * 选择器改造前把 `isPreEnding` 前奏放在 `historical` 的 else 分支里：只有当月
 * **没有**历史卡时才轮得到它。而 7 张前奏的年月全都排着历史卡 —— 1643-09 有
 * 《孙传庭殉国》、1644-03 有《煤山遗恨》—— 于是 256 局模拟里 6 张前奏 0 次登场，
 * 玩家从历史卡直接跳进结局，专门写的过渡戏成了死内容。
 *
 * 引擎本来就支持一个月多张卡（`results[0]` 进 `currentEvent`、其余进 `pendingEvents`，
 * 界面用「进下一件」翻页）。这里钉的就是同月两件的顺序：先 1643-09 的《决战前夜》，
 * 「继续」之后才是同月的《孙传庭殉国》。三条断言各管一半：
 * ① 前奏真的排到了当月第一张；② 历史卡在同月队列里没被挤掉；
 * ③ 武略不够时前奏不许凭空出现 —— 修法不是拆门槛。
 */

const PRELUDE = 'prelude_died_battlefield_1643_9'
// 1643-09 有两张历史卡同时满足条件：《孙传庭出关》（人物卡 figures.ts）与《孙传庭殉国》。
// weightedPick 只会挑其中一张，所以断言按 type 判，不钉具体 id。
const isHistoricalCard = (e: { type: string; id: string } | null | undefined) =>
  e?.type === 'historical' || e?.type === 'chain'

/** 站在 1643 年八月末，推一月正好落进九月 —— 前奏与历史卡同月的那一格。 */
function makeSave1943Aug(martial: number, eventHistory: string[] = []) {
  return makeSaveData({
    character: makeCharacter({
      attributes: { 财帛: 60, 文韬: 60, 理政: 60, 武略: martial, 体质: 60 }
    }),
    gameState: makeGameState({
      currentYear: 1643,
      currentMonth: 8,
      turn: 187,
      圣眷: 50,
      中官: 50,
      清议: 50,
      士绅: 50,
      民望: 50,
      国势: 50
    }),
    eventHistory
  })
}

async function advanceOneMonth(save: ReturnType<typeof makeSave1943Aug>) {
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
  const { result } = renderGameEngine({ loadSaveData: save })
  await flush()
  await act(async () => {
    result.current.handleNextMonth()
  })
  await flush(600)
  return { result, randomSpy }
}

describe('第五十七轮：结局前奏与同月历史卡一起发，前奏先演', () => {
  it('1643-09：武略达标时先播《决战前夜》，历史卡排在同一个月的队列里', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeSave1943Aug(60))
    try {
      expect(result.current.gameState.currentYear).toBe(1643)
      expect(result.current.gameState.currentMonth, '这一步没落到 1643-09 —— 前奏的月窗无从判起').toBe(9)
      expect(result.current.currentEvent?.id, '当月第一张卡不是《决战前夜》').toBe(PRELUDE)
      expect(
        isHistoricalCard(result.current.pendingEvents[0]),
        '当月的历史卡被前奏挤掉了 —— 同月两件都要发'
      ).toBe(true)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('「继续」之后才轮到同月的《孙传庭殉国》', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeSave1943Aug(60))
    try {
      expect(result.current.currentEvent?.id).toBe(PRELUDE)
      await act(async () => {
        result.current.handleContinue()
      })
      await flush()
      expect(result.current.currentEvent?.id, '顺序反了：历史卡应该在《决战前夜》之后').not.toBe(PRELUDE)
      expect(isHistoricalCard(result.current.currentEvent), '历史卡应该接在《决战前夜》之后').toBe(true)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('武略 20 时前奏不许出现 —— 这一格的门槛仍然算数', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeSave1943Aug(20))
    try {
      expect(result.current.gameState.currentMonth).toBe(9)
      expect(result.current.currentEvent?.id, '武略不足却播了《决战前夜》').not.toBe(PRELUDE)
      expect(result.current.pendingEvents.map(e => e.id)).not.toContain(PRELUDE)
      expect(isHistoricalCard(result.current.currentEvent), '历史卡不该跟着一起消失').toBe(true)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('前奏播过一次后不再重播 —— 队列改动没有把它变成可重复事件', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeSave1943Aug(60, [PRELUDE]))
    try {
      expect(result.current.gameState.currentMonth).toBe(9)
      expect(result.current.currentEvent?.id).not.toBe(PRELUDE)
      expect(result.current.pendingEvents.map(e => e.id)).not.toContain(PRELUDE)
      expect(isHistoricalCard(result.current.currentEvent), '前奏不重播时历史卡照常发').toBe(true)
    } finally {
      randomSpy.mockRestore()
    }
  })
})
