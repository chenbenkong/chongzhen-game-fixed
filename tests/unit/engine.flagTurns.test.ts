import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import {
  advanceMonths,
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import type { EventChoice } from '../../src/types/event'

/**
 * `Character.flagTurns` —— 「这段经历写在哪一个月」。
 *
 * 第五十四轮给 `conditions.flags.since` 供数据：《名帖》的门要读"孩子满六岁"，
 * 而引擎原先只存一个 `flags: string[]`，经历是**没有时间**的。
 * 这里钉的是那本时间账本身：
 *   · 每一次 flag 写入都记当月（全游戏只有 `handleChoice` 一处写 flag，见 useGameEngine.ts:1408）；
 *   · 第一次写入的月份不被覆写 —— flag 本身也是去重的，同一件事不算两次；
 *   · 移除时必须一起删。留着上一段的时间戳，"复婚"那类第二次发生的 `since`
 *     算的会是上一次那份年纪；
 *   · 老存档读进来不补时间（缺记录时 `since` 走容错放行），
 *     但引擎自己补的那一条例外：进士出身读档时补 `地方官任职`，补的那一刻就是它的落笔月份。
 */

const NORMAL_EVENT = {
  id: 'test_flagturns_event',
  title: '测试经历记账',
  description: '',
  conditions: {},
  type: 'normal',
  choices: []
} as any

/** 举人出身：不触发读档时补 `地方官任职` 那一段，时间账从空白开始 */
const saveAt = (turn: number) =>
  makeSaveData({
    character: makeCharacter({ degree: '举人', flags: [], flagTurns: {} }),
    currentEvent: NORMAL_EVENT,
    currentEventId: NORMAL_EVENT.id,
    gameState: makeGameState({ turn, currentYear: 1628 + Math.floor(turn / 12), currentMonth: (turn % 12) + 1 })
  })

const pick = (add: string[], remove?: string[]): EventChoice => ({
  id: 'c_flag',
  text: '把这一笔记进履历',
  effects: { flags: remove ? { add, remove } : { add } }
})

async function engineAt(turn: number) {
  const view = renderGameEngine({ loadSaveData: saveAt(turn) })
  await flush()
  return view
}

const take = async (view: { result: { current: any } }, choice: EventChoice) => {
  await act(async () => {
    view.result.current.handleChoice(choice)
  })
}

describe('flagTurns 与 flags 同步', () => {
  it('写下经历的那一刻，月份一起入账', async () => {
    const view = await engineAt(40)
    expect(view.result.current.gameState.turn).toBe(40)

    await take(view, pick(['has_children']))
    expect(view.result.current.character.flags).toContain('has_children')
    expect(view.result.current.character.flagTurns).toEqual({ has_children: 40 })
    view.unmount()
  })

  it('两次写入各记各自那个月，不是共用开局那个月', async () => {
    const view = await engineAt(40)
    await take(view, pick(['has_children']))

    await advanceMonths(view.result, 1)
    const later = view.result.current.gameState.turn
    expect(later, '推进一个月没走表 —— 这条断言就退化成上一条的复述').toBeGreaterThan(40)

    await take(view, pick(['concubine_killed']))
    expect(view.result.current.character.flagTurns).toEqual({ has_children: 40, concubine_killed: later })
    view.unmount()
  })

  it('同一段经历不会被第二次写入覆写时间', async () => {
    const view = await engineAt(40)
    await take(view, pick(['has_children']))
    await advanceMonths(view.result, 1)
    await take(view, pick(['has_children']))

    const flags = view.result.current.character.flags as string[]
    expect(flags.filter(f => f === 'has_children')).toHaveLength(1)
    expect(view.result.current.character.flagTurns).toEqual({ has_children: 40 })
    view.unmount()
  })

  it('移除经历时把时间戳一起删掉，同批写入的新经历照样入账', async () => {
    const view = await engineAt(40)
    await take(view, pick(['wife_broken']))
    expect(view.result.current.character.flagTurns?.wife_broken).toBe(40)

    await advanceMonths(view.result, 1)
    const later = view.result.current.gameState.turn
    await take(view, pick(['harmonious_family'], ['wife_broken']))

    expect(view.result.current.character.flags).not.toContain('wife_broken')
    expect(view.result.current.character.flagTurns?.wife_broken).toBeUndefined()
    expect(view.result.current.character.flagTurns?.harmonious_family).toBe(later)
    view.unmount()
  })

  it('删掉之后再写回来，记的是这一次', async () => {
    const view = await engineAt(10)
    await take(view, pick(['wife_broken']))
    await advanceMonths(view.result, 1)
    await take(view, pick([], ['wife_broken']))

    await advanceMonths(view.result, 1)
    const again = view.result.current.gameState.turn
    expect(again).toBeGreaterThan(10)
    await take(view, pick(['wife_broken']))
    expect(view.result.current.character.flagTurns?.wife_broken).toBe(again)
    view.unmount()
  })

  it('不动经历的抉择不改这本账', async () => {
    const view = await engineAt(40)
    await take(view, pick(['has_children']))
    await take(view, { id: 'c_noop', text: '什么都不做', effects: { attributes: { 文韬: 3 } } })

    expect(view.result.current.character.flagTurns).toEqual({ has_children: 40 })
    view.unmount()
  })
})

describe('老存档读入', () => {
  it('存档自带的 flagTurns 原样带过来', async () => {
    const view = renderGameEngine({
      loadSaveData: makeSaveData({
        character: makeCharacter({ degree: '举人', flags: ['has_children'], flagTurns: { has_children: 17 } }),
        gameState: makeGameState({ turn: 90, currentYear: 1635 })
      })
    })
    await flush()
    expect(view.result.current.character.flagTurns).toEqual({ has_children: 17 })
    view.unmount()
  })

  it('缺 flagTurns 的老存档照样能跑（since 门对它放行，不是把回响收走）', async () => {
    const view = renderGameEngine({
      loadSaveData: makeSaveData({
        character: makeCharacter({ degree: '举人', flags: ['has_children'] }),
        gameState: makeGameState({ turn: 90, currentYear: 1635 })
      })
    })
    await flush()
    expect(view.result.current.character.flagTurns).toBeUndefined()
    await advanceMonths(view.result, 1)
    expect(view.result.current.isGameOver).toBe(false)
    view.unmount()
  })

  it('引擎自己补的那条经历（进士 → 地方官任职），补的就是当前月份', async () => {
    const view = renderGameEngine({
      loadSaveData: makeSaveData({
        character: makeCharacter({ degree: '进士', flags: ['has_children'], flagTurns: { has_children: 12 } }),
        gameState: makeGameState({ turn: 90, currentYear: 1635 })
      })
    })
    await flush()
    expect(view.result.current.character.flags).toContain('地方官任职')
    expect(view.result.current.character.flagTurns).toEqual({ has_children: 12, 地方官任职: 90 })
    view.unmount()
  })

  it('新开一局也带这本账：进士开局第 0 月就在任上', async () => {
    const view = renderGameEngine({ degree: '进士' })
    await flush()
    expect(view.result.current.character.flags).toContain('地方官任职')
    expect(view.result.current.character.flagTurns).toEqual({ 地方官任职: 0 })
    view.unmount()
  })
})
