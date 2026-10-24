import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import { transitionEvents } from '../../src/data/events'
import type { GameStateValues } from '../../src/types/game'

/**
 * 第六十一轮：§1.4 ㉞《不知所踪》。
 *
 * 量到的三件事：
 *  1. 格子的年窗写 1638，注释却说"下沿改成产地的下沿" —— 产地《乱世浮沉》是 1637。
 *     差这一年把 seed6412 挡在外面：它在 1637 带着两张票、国势6/圣眷15/清议14，
 *     三门全中，只因年窗未开，被《亡命江湖》先接走。
 *  2. 圣眷≤15 / 清议≤20 是产地之后**第二道更窄的窗**：产地自己只要求 圣眷≤25 ∧ 国势≤25，
 *     票到手之后这两维只要回一点，格子就悄悄关上。80 局里 17 个带票月份，
 *     清议≤20 只有 2 个月 —— 它才是把这一格按死的第三维。
 *  3. 清议不是"消失"这件事的度量，而且消失这个选择本身不会改变它：
 *     玩家读完【获得标记：下落不明、隐姓埋名 — 此标记将直接解锁结局】，
 *     却可能永远等不到结局，因为没有哪条路告诉他"还得先把清议压到 20"。
 *
 * 修法：判据回到**可见行为**（两张票）+ 世界状态（国势≤25，与产地同档）+ 年窗对齐 1637。
 * 圣眷与清议两道上界删除 —— 产地已经在更宽松的值上问过一次，不再问第二遍。
 * 一张票都没降：两张票仍然是全库唯一书写这一格的路。
 */

const EVENT = transitionEvents.find(e => e.id === 'route_unknown_fate')!
const HIDE = EVENT.choices!.find(c => c.id === 'c1')!

const BASE_STATE: GameStateValues = makeGameState({
  currentYear: 1637,
  currentMonth: 6,
  turn: 113,
  圣眷: 15,
  中官: 20,
  清议: 47,
  士绅: 30,
  民望: 30,
  国势: 10
})

function official() {
  return makeCharacter({
    age: 45,
    rank: '正四品·知府',
    attributes: { 财帛: 40, 文韬: 60, 理政: 60, 武略: 30, 体质: 50 },
    hidden: { 道德值: 45, 欲望值: 30, 野心值: 30, 机敏值: 50, 忠诚值: 50 }
  })
}

async function playHideAndWait(state: GameStateValues) {
  const save = makeSaveData({
    character: official(),
    gameState: state,
    currentEvent: EVENT,
    currentEventId: EVENT.id,
    eventHistory: [EVENT.id]
  })
  const { result } = renderGameEngine({ loadSaveData: save })
  await flush()

  await act(async () => {
    result.current.handleChoice(HIDE, { skipResignConfirm: true })
  })
  await flush(200)
  expect(result.current.character.flags, '【隐姓埋名】没写上门票').toEqual(
    expect.arrayContaining(['下落不明', '隐姓埋名'])
  )

  for (let i = 0; i < 3 && !result.current.isGameOver; i++) {
    await act(async () => {
      result.current.handleContinue()
    })
    await flush(300)
  }
  return result.current
}

function endingIds(eventHistory: string[]): string[] {
  return eventHistory.filter(id => id.startsWith('ending_'))
}

describe('第六十一轮：《不知所踪》的判据回到两张票 + 世界状态', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('1637 年选【隐姓埋名】：年窗与产地下沿对齐，下一个月就收在《不知所踪》', async () => {
    const state = { ...BASE_STATE, 清议: 14 }
    const engine = await playHideAndWait(state)

    expect(engine.isGameOver, '1637 年消失的人等不到 1638 的年窗，被别的结局接走了').toBe(true)
    expect(endingIds(engine.eventHistory), '没有收在《不知所踪》').toContain('ending_unknown_fate')
  }, 30_000)

  it('清议高的人也能消失——清议不是"下落不明"的度量', async () => {
    const engine = await playHideAndWait({ ...BASE_STATE, 清议: 65 })

    expect(engine.isGameOver).toBe(true)
    expect(endingIds(engine.eventHistory)).toContain('ending_unknown_fate')
  }, 30_000)

  it('守卫：国势尚在的人不会因为一张消失票就草草收场', async () => {
    const engine = await playHideAndWait({ ...BASE_STATE, 国势: 40, 清议: 10 })

    expect(endingIds(engine.eventHistory), '国势 40 不该结在《不知所踪》').not.toContain(
      'ending_unknown_fate'
    )
  }, 30_000)
})
