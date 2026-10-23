import { describe, expect, it } from 'vitest'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { checkChoiceRequirement } from '../../src/utils/choiceRequirements'
import { wrapAsBoundaryEvent } from '../../src/data/boundaryEventCompiler'
import { gateLabel } from '../../src/data/flagBiography'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'
import type { EventChoice, GameEvent } from '../../src/types/event'

/**
 * `conditions.flags.since` —— 「这段经历满多久了」这一类门。
 *
 * 第五十四轮的起因是《名帖》：正文第一句写「孩子到了入塾的年纪」，
 * 而它的门是 `year.min: 1638`。实测旧门版本里 15 次开口全落在 1638 年，
 * 开口时孩子 28～102 个月（2.3 岁到 8.5 岁）都有 ——
 * 年窗量的是"天下何时"，玩家读到的却是"你家孩子几岁"，两句对不上。
 * 修法是让门直接读后者：`has_children` 落笔之后满 72 个月才开。
 *
 * 于是多了一条与属性/状态/经历并列的门类，它读的是**落笔月份**，
 * 月份存在 `Character.flagTurns`（由引擎在每一处 flag 写入时同步维护）。
 * 这一文件钉三件事：
 *   1. 两个求值器（事件池 + 选项门）对 `since` 同义 —— 与 `conditions.turn` 一条规矩；
 *   2. 老存档容错：只有 flags、没有 flagTurns 的存档**放行**。
 *      判死等于把玩家已经攒出来的回响事件凭空收走，
 *      与 `eventConditions` 里"遗留的 gameState.turn 跳过而不按 0 判死"同一条理由；
 *   3. 边界/结局求值器**读不到**它（`BoundaryEventCheckParams` 只有 flag 名字、没有落笔月份），
 *      所以这一类门只许写在事件池与选项门上 —— 写错位置由 `audit-event-shape` 报 NOOP。
 */

const sinceEvent = (
  since: Record<string, { min?: number; max?: number }>,
  over: Partial<GameEvent> = {}
): GameEvent => ({
  id: 'test_since_gate',
  title: '测试经历时长门',
  description: '',
  type: 'transition',
  conditions: { flags: { has: ['has_children'], since } },
  choices: [],
  ...over
})

/** 孩子在第 `bornAt` 月落地；要"满 n 个月"就把状态推到 `bornAt + n` */
const kidBornAt = (bornAt: number) =>
  makeCharacter({ flags: ['has_children'], flagTurns: { has_children: bornAt } })

describe('conditions.flags.since 在事件池里的判定', () => {
  it('不满 min 不开：孩子 71 个月，门仍关着', () => {
    const ev = sinceEvent({ has_children: { min: 72 } })
    expect(checkEventConditions(ev, kidBornAt(30), makeGameState({ turn: 101 }))).toBe(false)
  })

  it('满 min 即开：72 个月整（六岁入塾）就放行', () => {
    const ev = sinceEvent({ has_children: { min: 72 } })
    expect(checkEventConditions(ev, kidBornAt(30), makeGameState({ turn: 102 }))).toBe(true)
  })

  it('超过 max 也关：这类门可以是一段窗口，不只是"至少多久"', () => {
    const ev = sinceEvent({ has_children: { min: 72, max: 84 } })
    expect(checkEventConditions(ev, kidBornAt(30), makeGameState({ turn: 114 }))).toBe(true)
    expect(checkEventConditions(ev, kidBornAt(30), makeGameState({ turn: 115 }))).toBe(false)
  })

  it('经历不在身上就直接关，不去读月份', () => {
    const ev = sinceEvent({ has_children: { min: 1 } })
    const noKid = makeCharacter({ flags: [], flagTurns: { has_children: 0 } })
    expect(checkEventConditions(ev, noKid, makeGameState({ turn: 500 }))).toBe(false)
  })

  it('门读的是另一段经历：那一段没写过，就不算数', () => {
    const ev = sinceEvent({ protect_childless_wife: { min: 36 } })
    const char = makeCharacter({ flags: ['has_children'], flagTurns: { protect_childless_wife: 0 } })
    expect(checkEventConditions(ev, char, makeGameState({ turn: 200 }))).toBe(false)
  })

  it('老存档容错：完全没有 flagTurns 时放行，不把已经攒出的回响收走', () => {
    const ev = sinceEvent({ has_children: { min: 72 } })
    const legacy = makeCharacter({ flags: ['has_children'] })
    expect((legacy as any).flagTurns).toBeUndefined()
    expect(checkEventConditions(ev, legacy, makeGameState({ turn: 40 }))).toBe(true)
  })

  it('容错只放"缺这一段记录"的，不放过"月份真不够"的', () => {
    const ev = sinceEvent({ has_children: { min: 72 } })
    const partial = makeCharacter({ flags: ['has_children'], flagTurns: { 地方官任职: 0 } })
    expect(checkEventConditions(ev, partial, makeGameState({ turn: 40 }))).toBe(true)
    expect(checkEventConditions(ev, kidBornAt(38), makeGameState({ turn: 40 }))).toBe(false)
  })
})

describe('showConditions.flags.since 在选项门里的判定与文案', () => {
  const choice = (since: Record<string, { min?: number; max?: number }>): EventChoice => ({
    id: 'c1',
    text: '【等孩子长大些再说】',
    effects: {},
    showConditions: { flags: { since } }
  })

  it('与事件池同一个口径：71 个月锁、72 个月开', () => {
    const gate = choice({ has_children: { min: 72 } })
    expect(checkChoiceRequirement(gate, kidBornAt(30), makeGameState({ turn: 102 })).available).toBe(true)
    expect(checkChoiceRequirement(gate, kidBornAt(31), makeGameState({ turn: 102 })).available).toBe(false)
  })

  it('锁住时说的是人话，不印机器 id', () => {
    const res = checkChoiceRequirement(choice({ has_children: { min: 72 } }), kidBornAt(30), makeGameState({ turn: 60 }))
    expect(res.available).toBe(false)
    expect(res.reason).toBeTruthy()
    expect(res.reason).not.toMatch(/[a-z_]{4,}/)
    expect(res.reason).toContain('还得再等')
    // 还差 42 个月 = 3 年 6 个月
    expect(res.reason).toContain('3 年 6 个月')
  })

  it('差月不足一年时只报月数，不写"0 年"', () => {
    const res = checkChoiceRequirement(choice({ has_children: { min: 72 } }), kidBornAt(30), makeGameState({ turn: 96 }))
    expect(res.reason).toBe('这段旧事还得再等 6 个月')
  })

  it('过了上界另说一句，不把"等得不够"当成理由', () => {
    const res = checkChoiceRequirement(
      choice({ has_children: { min: 72, max: 84 } }),
      kidBornAt(30),
      makeGameState({ turn: 120 })
    )
    expect(res.available).toBe(false)
    expect(res.reason).toContain('隔得太久')
  })

  it('老存档容错与事件池一致', () => {
    const legacy = makeCharacter({ flags: ['has_children'] })
    const res = checkChoiceRequirement(choice({ has_children: { min: 72 } }), legacy, makeGameState({ turn: 10 }))
    expect(res.available).toBe(true)
  })

  it('经历不在身上，说的还是"须有这段经历"而不是"再等多久"', () => {
    const none = makeCharacter({ flags: [], flagTurns: {} })
    const res = checkChoiceRequirement(choice({ has_children: { min: 12 } }), none, makeGameState({ turn: 100 }))
    expect(res.available).toBe(false)
    expect(res.reason).toContain('须有这段经历')
  })

  it('查得到人话的经历，锁住时把主语带上', () => {
    const named = gateLabel('concubine_killed')
    expect(named).toBeTruthy()
    const char = makeCharacter({ flags: ['concubine_killed'], flagTurns: { concubine_killed: 0 } })
    const res = checkChoiceRequirement(choice({ concubine_killed: { min: 72 } }), char, makeGameState({ turn: 12 }))
    expect(res.reason).toContain(named!)
  })
})

describe('边界/结局求值器读不到 since（所以这一类门只许写在池与选项上）', () => {
  const params = (turn: number): BoundaryEventCheckParams => ({
    attributes: {},
    gameState: { turn },
    hidden: {},
    flags: ['has_children']
  })

  it('同一个 since 门：池判定关着，边界判定开着 —— 这是已知分歧，不是 bug', () => {
    const ev = sinceEvent({ has_children: { min: 72 } })
    expect(checkEventConditions(ev, kidBornAt(30), makeGameState({ turn: 40 }))).toBe(false)
    expect(wrapAsBoundaryEvent(ev, 100).check(params(40))).toBe(true)
  })

  it('体检脚本把"结局池上的 since"报成死门（这条规则有证人）', async () => {
    const { scanEventShape } = await import('../../scripts/audit-event-shape')
    const findings = scanEventShape(
      [sinceEvent({ has_children: { min: 72 } }, { type: 'ending' })],
      undefined,
      () => 'ending'
    )
    const noop = findings.filter(f => f.kind === 'NOOP' && f.detail.includes('since'))
    expect(noop.length, '往结局池写 since 没人报警 —— 那是一道看不见的门').toBeGreaterThan(0)
    expect(noop[0].detail).toContain('落笔月份')
  })
})
