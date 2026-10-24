import { describe, expect, it } from 'vitest'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { checkChoiceRequirement } from '../../src/utils/choiceRequirements'
import { wrapAsBoundaryEvent } from '../../src/data/boundaryEventCompiler'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'
import type { EventChoice, GameEvent } from '../../src/types/event'

/**
 * `conditions.flags.minCount` —— 「这几段经历里至少凑够 N 段」。
 *
 * 第六十二轮加的这条原语，只为一件事：中兴线的「四张参朝门票凑三张」
 * 原先写在结局的 `custom` 函数里，而事件池的 `checkEventConditions` 读不到
 * `custom` —— 于是《中兴前夜》与《中兴成功》没法共用同一把尺子。
 *
 * 它是 `all`（全都要）与 `any`（一段就够）中间的那一档，
 * 三个求值器都必须认：事件池、选项门、结局边界池。
 * 任何一个漏读，结果都不是报错，而是那道门在该路径上**静默地永远开着**。
 */

const TICKETS = ['阻止孙传庭出战', '持续保袁', '坚持招抚', '先见之明']

const gatedEvent = (min: number, flags: string[] = TICKETS): GameEvent => ({
  id: 'test_min_count_gate',
  title: '测试基数门',
  description: '',
  type: 'transition',
  conditions: { flags: { minCount: { flags, min } } },
  choices: []
})

const holder = (own: string[]) => makeCharacter({ flags: own })

describe('第六十二轮：flags.minCount 在三个求值器里同一把尺子', () => {
  describe('事件池（checkEventConditions）', () => {
    it('四张票只有两张时不开，三张才开', () => {
      const ev = gatedEvent(3)
      expect(checkEventConditions(ev, holder(TICKETS.slice(0, 2)), makeGameState())).toBe(false)
      expect(checkEventConditions(ev, holder(TICKETS.slice(0, 3)), makeGameState())).toBe(true)
    })

    it('门票要看名字对得上：四段别的经历凑不出这三张', () => {
      const ev = gatedEvent(3)
      expect(checkEventConditions(ev, holder(['归隐', '出家', '潜逃', '贰臣']), makeGameState())).toBe(false)
    })

    it('min 写成 0 等于没这门 —— 与 all/any 的空数组同一个口径', () => {
      const ev = gatedEvent(0)
      expect(checkEventConditions(ev, holder([]), makeGameState())).toBe(true)
    })
  })

  describe('选项门（checkChoiceRequirement）', () => {
    const choice = (min: number): EventChoice => ({
      id: 'c1',
      text: '【联名上疏】',
      effects: {},
      showConditions: { flags: { minCount: { flags: TICKETS, min } } }
    })

    it('同一份经历：两张锁着、三张点得动', () => {
      expect(checkChoiceRequirement(choice(3), holder(TICKETS.slice(0, 2)), makeGameState()).available).toBe(false)
      expect(checkChoiceRequirement(choice(3), holder(TICKETS.slice(0, 3)), makeGameState()).available).toBe(true)
    })

    it('锁住时按经历门处理：不给骰子，理由不印机器 id', () => {
      const res = checkChoiceRequirement(choice(3), holder(TICKETS.slice(0, 2)), makeGameState())
      expect(res.conditionType).toBe('flag')
      expect(res.difficulty, '经历不是努力能换的，不能开「勉力一试」').toBeUndefined()
      expect(res.reason).toBeTruthy()
      expect(res.reason).not.toMatch(/[a-z_]{4,}/)
      expect(res.reason).toContain('3 段')
    })
  })

  describe('结局边界池（wrapAsBoundaryEvent）', () => {
    const params = (own: string[]): BoundaryEventCheckParams => ({
      attributes: {},
      gameState: { turn: 200 },
      hidden: {},
      flags: own
    })

    it('边界池也认这张门：两张判死、三张放行', () => {
      const boundary = wrapAsBoundaryEvent(gatedEvent(3), 107)
      expect(boundary.check(params(TICKETS.slice(0, 2)))).toBe(false)
      expect(boundary.check(params(TICKETS.slice(0, 3)))).toBe(true)
    })

    it('「四张凑三张」不是「四张全要」：缺一张仍然放行', () => {
      const boundary = wrapAsBoundaryEvent(gatedEvent(3), 107)
      expect(boundary.check(params(TICKETS.slice(1)))).toBe(true)
    })
  })

  describe('真实数据：《中兴前夜》与《中兴成功》用同一组票、同一个 N', () => {
    it('两边都写 3 of 4，且名单一字不差', async () => {
      const { preludeEvents } = await import('../../src/data/events/transition/preludes')
      const { allEndingEvents } = await import('../../src/data/events/ending')
      const prelude = preludeEvents.find(e => e.id === 'prelude_zhongxing_1643_12')!
      const ending = allEndingEvents.find(e => e.id === 'ending_zhongxing_success')!
      expect(prelude.conditions?.flags?.minCount).toEqual({ flags: TICKETS, min: 3 })
      expect(ending.conditions?.flags?.minCount).toEqual({ flags: TICKETS, min: 3 })
    })

    it('结局侧不再靠 custom 判基数 —— 事件池与边界池都能独立复算', async () => {
      const { allEndingEvents } = await import('../../src/data/events/ending')
      const ending = allEndingEvents.find(e => e.id === 'ending_zhongxing_success')!
      expect(ending.conditions?.custom, '又把基数判定塞回 custom，事件池就再也读不到它了').toBeUndefined()
    })
  })
})
