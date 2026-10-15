import { describe, expect, it } from 'vitest'
import { makeGameState, makeCharacter } from './helpers/gameEngine'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { wrapAsBoundaryEvent, wrapBatchAsBoundaryEvents } from '../../src/data/boundaryEventCompiler'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'
import type { GameEvent } from '../../src/types/event'

/**
 * `conditions.turn`（开局第几个月）在两个条件求值器里的语义必须一致。
 *
 * 为什么要单独钉这一条：这个仓库有**两套**判定实现 ——
 *   src/utils/eventConditions.ts       普通事件池（每月的可选事件）
 *   src/data/boundaryEventCompiler.ts  边界/结局事件（BoundaryEventManager）
 * 过去它们对 turn 的态度是**相反**的：前者把 gameState.turn 直接 continue 跳过，
 * 后者却老老实实读它。同一个条件，一套当它不存在、另一套当硬门槛，
 * 而数据里两种写法都有 —— 这类不一致只会表现为"这个结局莫名其妙不出现"。
 *
 * 第八轮的收法是：把 turn 提为一等键 `conditions.turn`（类型上 gameState 已不含 turn），
 * 两边都读同一个键。这里锁住这个约定。
 */

function eventWithTurn(min: number, max?: number): GameEvent {
  return {
    id: 'test_turn_gate',
    title: '测试月数门',
    description: '',
    type: 'historical',
    conditions: { turn: { min, max } },
    choices: []
  }
}

const paramsAt = (turn: number): BoundaryEventCheckParams => ({
  attributes: {},
  gameState: { turn },
  hidden: {},
  flags: []
})

describe('conditions.turn 在两个求值器里同义', () => {
  it('池判定：turn 未到 min 时事件不可选', () => {
    expect(checkEventConditions(eventWithTurn(36), makeCharacter(), makeGameState({ turn: 35 }))).toBe(false)
  })

  it('池判定：turn 达到 min 时事件可选', () => {
    expect(checkEventConditions(eventWithTurn(36), makeCharacter(), makeGameState({ turn: 36 }))).toBe(true)
  })

  it('池判定：turn 超过 max 时事件不可选', () => {
    expect(checkEventConditions(eventWithTurn(0, 12), makeCharacter(), makeGameState({ turn: 13 }))).toBe(false)
  })

  it('边界判定：turn 未到 min 时结局不触发', () => {
    expect(wrapAsBoundaryEvent(eventWithTurn(36), 100).check(paramsAt(35))).toBe(false)
  })

  it('边界判定：turn 达到 min 时结局触发', () => {
    expect(wrapAsBoundaryEvent(eventWithTurn(36), 100).check(paramsAt(36))).toBe(true)
  })

  it('边界判定：turn 超过 max 时结局不触发', () => {
    expect(wrapAsBoundaryEvent(eventWithTurn(0, 12), 100).check(paramsAt(13))).toBe(false)
  })

  it('同一个事件、同一个 turn，两个求值器给出同一个答案', () => {
    const ev = eventWithTurn(24, 60)
    for (const turn of [12, 23, 24, 59, 60, 61]) {
      const pool = checkEventConditions(ev, makeCharacter(), makeGameState({ turn }))
      const boundary = wrapAsBoundaryEvent(ev, 100).check(paramsAt(turn))
      expect(boundary, `turn=${turn}：池判定 ${pool} vs 边界判定 ${boundary}`).toBe(pool)
    }
  })

  it('边界包装的叙事兜底仍然要求 turn ≥ 36，且写在新键上', () => {
    // 数据没写 turn 时，编译器补的是 conditions.turn 而不是 gameState.turn ——
    // 后者会被池判定 continue 跳过，等于两个求值器又各读各的。
    const bare: GameEvent = {
      id: 'test_bare_ending',
      title: '无条件的叙事结局',
      description: '',
      type: 'ending',
      conditions: {},
      choices: []
    }
    const [wrapped] = wrapBatchAsBoundaryEvents([bare], 100)
    const at = (turn: number) => ({
      ...paramsAt(turn),
      currentYear: 1640,
      currentMonth: 5
    })
    expect(wrapped.check(at(20))).toBe(false)
    expect(wrapped.check(at(40))).toBe(true)
    expect((bare.conditions as any)?.gameState?.turn).toBeUndefined()
    expect(wrapped.event.conditions?.turn).toEqual({ min: 36 })
  })
})
