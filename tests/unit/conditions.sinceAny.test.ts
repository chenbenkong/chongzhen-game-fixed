import { describe, expect, it } from 'vitest'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { checkChoiceRequirement } from '../../src/utils/choiceRequirements'
import { wrapAsBoundaryEvent } from '../../src/data/boundaryEventCompiler'
import { explainUnmet } from '../../src/utils/routeTrail'
import type { BoundaryEventCheckParams } from '../../src/types/boundaryEvent'
import type { EventChoice, EventConditions, GameEvent } from '../../src/types/event'

/**
 * `conditions.flags.sinceAny` —— 时长门的**列表形状**。
 *
 * 第六十九轮装过一版单票时长门（`since: { 边关任职: { min: 36 } }`），实测把《边关大将》
 * 从 98 局结案打成 0 局；更糟的是同一种写法落在 `any` 网里时，它不是"把门关严"，
 * 而是**把整张网收窄成一条票**（`{ any: [A, B], since: { A } }` 引擎读作"A 必须有且 A 满三年"，
 * B 那条路整条消失，且没有一行日志）。于是 `audit-event-shape` 现在把那种写法按「窄化」报掉，
 * 作者想表达"这几段经历里最老的一段满 N 月"就没有原语可用了 —— 只能不写，或者退回公元年窗，
 * 而年窗管天下、不管这个人做了多久。
 *
 * `sinceAny` 就是那个原语：**至少有一段所列经历，落笔已满 min（且不超过 max）**。
 * 它是 `or`，所以永远不收窄；它读的是落笔月份，所以量的是"做了多久"而不是"哪一年"。
 *
 * 三个求值器（事件池 / 选项门 / 边界编译器）必须同义，面板缺口也得说同一句人话 ——
 * 这一文件钉的就是这五处，外加两条体检脚本对新键的认账。
 */

const NET = ['习医', '行医', '开馆行医', '赈灾行医', '仁心仁术']

const sinceAnyEvent = (spec: { flags: string[]; min?: number; max?: number }): GameEvent => ({
  id: 'test_since_any_gate',
  title: '测试时长门列表形状',
  description: '',
  type: 'transition',
  conditions: {
    flags: { any: NET, sinceAny: spec }
  } as unknown as EventConditions,
  choices: []
})

/** 身上带 `held`，其中每一段的落笔月份查 `turns` */
const holder = (held: string[], turns: Record<string, number>): ReturnType<typeof makeCharacter> =>
  makeCharacter({ flags: held, flagTurns: turns })

describe('sinceAny 在事件池里的判定', () => {
  it('网里任意一张满 min 就开：最老的那段已经两年', () => {
    const ev = sinceAnyEvent({ flags: NET, min: 24 })
    // 习医 第 0 月落笔 → 第 30 月已满 30 个月
    expect(checkEventConditions(ev, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 30 }))).toBe(true)
  })

  it('一张都不满就关：票都齐了，但全是上个月刚落的笔', () => {
    const ev = sinceAnyEvent({ flags: NET, min: 24 })
    const fresh = holder(NET, Object.fromEntries(NET.map((f, i) => [f, 20 - i])))
    expect(checkEventConditions(ev, fresh, makeGameState({ turn: 21 }))).toBe(false)
  })

  it('不收窄：只走网里最晚那条支路的人，满了时长一样放进来', () => {
    // 这一条是 sinceAny 与"把 since 写在 any 网里"的**全部**区别：
    // 后者会把没持 习医 的人整批挡死（第六十九轮的错法），前者只看"身上有的这几段里最老的"。
    const ev = sinceAnyEvent({ flags: NET, min: 24 })
    expect(checkEventConditions(ev, holder(['仁心仁术'], { 仁心仁术: 0 }), makeGameState({ turn: 30 }))).toBe(true)
  })

  it('一张都不在身上就关，不许被"没有落笔记录"的容错放走', () => {
    const ev = sinceAnyEvent({ flags: NET, min: 1 })
    expect(checkEventConditions(ev, makeCharacter({ flags: ['地方官任职'] }), makeGameState({ turn: 500 }))).toBe(false)
  })

  it('老存档容错与 since 一致：身上有票但整张月份表缺失 → 放行', () => {
    const ev = sinceAnyEvent({ flags: NET, min: 72 })
    const legacy = makeCharacter({ flags: ['行医'] })
    expect((legacy as any).flagTurns).toBeUndefined()
    expect(checkEventConditions(ev, legacy, makeGameState({ turn: 10 }))).toBe(true)
  })

  it('容错只放"缺记录"的，不放过"月份真不够"的', () => {
    const ev = sinceAnyEvent({ flags: NET, min: 24 })
    // 身上两张：一张没落笔记录（放行），一张刚写 2 个月（不够）—— 前者就该把门开
    expect(checkEventConditions(ev, holder(['习医', '行医'], { 行医: 22 }), makeGameState({ turn: 24 }))).toBe(true)
    // 反过来，两张都有记录且都不满，就不许开
    expect(checkEventConditions(ev, holder(['习医', '行医'], { 习医: 22, 行医: 23 }), makeGameState({ turn: 24 }))).toBe(false)
  })

  it('max 是"至少有一段还新鲜"，不是"最老那段必须新鲜"', () => {
    const ev = sinceAnyEvent({ flags: NET, max: 12 })
    // 习医 60 个月前、仁心仁术 5 个月前 → 有够新的那段，开
    expect(checkEventConditions(ev, holder(['习医', '仁心仁术'], { 习医: 0, 仁心仁术: 25 }), makeGameState({ turn: 30 }))).toBe(true)
    // 只剩 60 个月前那段 → 全过期，关
    expect(checkEventConditions(ev, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 60 }))).toBe(false)
  })

  it('min 与 max 同时给就是一扇窗口：有一段落在这扇窗里就开', () => {
    const ev = sinceAnyEvent({ flags: NET, min: 24, max: 36 })
    expect(checkEventConditions(ev, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 23 }))).toBe(false)
    expect(checkEventConditions(ev, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 24 }))).toBe(true)
    expect(checkEventConditions(ev, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 36 }))).toBe(true)
    expect(checkEventConditions(ev, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 37 }))).toBe(false)
  })
})

describe('showConditions.flags.sinceAny 在选项门里的判定与文案', () => {
  const choice = (spec: { flags: string[]; min?: number; max?: number }): EventChoice => ({
    id: 'c1',
    text: '【以医会友】',
    effects: {},
    showConditions: { flags: { sinceAny: spec } } as unknown as EventChoice['showConditions']
  })

  it('与事件池同一口径：不满锁、满开', () => {
    const gate = choice({ flags: NET, min: 24 })
    expect(checkChoiceRequirement(gate, holder(['习医'], { 习医: 0 }), makeGameState({ turn: 30 })).available).toBe(true)
    expect(checkChoiceRequirement(gate, holder(['习医'], { 习医: 20 }), makeGameState({ turn: 30 })).available).toBe(false)
  })

  it('锁住时说的是人话：按最老那张算还差多久，且一个机器 id 都不印', () => {
    const res = checkChoiceRequirement(choice({ flags: NET, min: 24 }), holder(['习医'], { 习医: 10 }), makeGameState({ turn: 16 }))
    expect(res.available).toBe(false)
    expect(res.reason).toContain('还得再等')
    // 身上最老的是 习医（落笔第 10 月，现在第 16 月 = 6 个月）→ 还差 18 个月 = 1 年 6 个月
    expect(res.reason).toContain('1 年 6 个月')
    expect(res.reason).not.toMatch(/[a-z_]{4,}/)
  })

  it('一张都没有时说的是"须有过其中一段经历"，不是"再等多久"', () => {
    const res = checkChoiceRequirement(choice({ flags: NET, min: 12 }), makeCharacter({ flags: [] }), makeGameState({ turn: 100 }))
    expect(res.available).toBe(false)
    expect(res.reason).toContain('须有过其中一段经历')
  })

  it('老存档容错与事件池一致', () => {
    const legacy = makeCharacter({ flags: ['行医'] })
    const res = checkChoiceRequirement(choice({ flags: NET, min: 72 }), legacy, makeGameState({ turn: 10 }))
    expect(res.available).toBe(true)
  })
})

describe('边界/结局求值器与事件池对 sinceAny 同义', () => {
  const params = (
    turn: number,
    opts: { flags?: string[]; flagTurns?: Record<string, number> } = {}
  ): BoundaryEventCheckParams => ({
    attributes: {},
    gameState: { turn },
    hidden: {},
    flags: opts.flags ?? ['习医'],
    flagTurns: opts.flagTurns
  })
  const check = (spec: { flags: string[]; min?: number; max?: number }, p: BoundaryEventCheckParams) =>
    wrapAsBoundaryEvent(sinceAnyEvent(spec), 100).check(p)

  it('不满 min：池关，边界也关', () => {
    expect(check({ flags: NET, min: 24 }, params(30, { flags: ['习医'], flagTurns: { 习医: 10 } }))).toBe(false)
    expect(checkEventConditions(sinceAnyEvent({ flags: NET, min: 24 }), holder(['习医'], { 习医: 10 }), makeGameState({ turn: 30 }))).toBe(false)
  })

  it('满 min：两边在同一个月放人', () => {
    expect(check({ flags: NET, min: 24 }, params(33, { flags: ['习医'], flagTurns: { 习医: 10 } }))).toBe(false)
    expect(check({ flags: NET, min: 24 }, params(34, { flags: ['习医'], flagTurns: { 习医: 10 } }))).toBe(true)
  })

  it('一张都不在身上就关', () => {
    expect(check({ flags: NET, min: 1 }, params(500, { flags: ['地方官任职'], flagTurns: {} }))).toBe(false)
  })

  it('老存档容错：整张表缺失或缺这段记录都放行', () => {
    expect(check({ flags: NET, min: 72 }, params(40, { flags: ['行医'] }))).toBe(true)
    expect(check({ flags: NET, min: 72 }, params(40, { flags: ['行医'], flagTurns: { 习医: 0 } }))).toBe(true)
  })
})

describe('命途面板把 sinceAny 的缺口说成人话', () => {
  const conditions = (spec: { flags: string[]; min?: number; max?: number }): EventConditions =>
    ({ flags: { any: NET, sinceAny: spec } } as unknown as EventConditions)
  const params = (
    turn: number,
    flags: string[],
    flagTurns: Record<string, number>
  ): BoundaryEventCheckParams => ({ attributes: {}, gameState: { turn }, hidden: {}, flags, flagTurns })

  it('不满时长时报的是"还得再等"，不是"还缺某段经历"', () => {
    const p = params(30, ['习医'], { 习医: 20 })
    const ex = explainUnmet(conditions({ flags: NET, min: 24 }), p)
    expect(ex.gaps.join()).toContain('还得再等')
    expect(ex.gaps.join()).not.toMatch(/[a-z_]{4,}/)
  })

  it('一张都没有时报缺其一', () => {
    const ex = explainUnmet(conditions({ flags: NET, min: 24 }), params(30, [], {}))
    expect(ex.gaps.join()).toContain('还缺其一')
  })

  it('满了就不报缺口', () => {
    const ex = explainUnmet(conditions({ flags: NET, min: 24 }), params(30, ['习医'], { 习医: 0 }))
    expect(ex.gaps).toEqual([])
  })
})

describe('体检脚本认账 sinceAny', () => {
  it('写在结局格上不是死门（不许报 NOOP）', async () => {
    const { scanEventShape } = await import('../../scripts/audit-event-shape')
    const findings = scanEventShape(
      [{ ...sinceAnyEvent({ flags: NET, min: 24 }), type: 'ending' } as unknown as GameEvent],
      undefined,
      () => 'ending'
    )
    expect(findings.filter(f => f.detail.includes('sinceAny'))).toEqual([])
  })

  it('它是 or，永远不算窄化', async () => {
    const { scanEventShape } = await import('../../scripts/audit-event-shape')
    const findings = scanEventShape(
      [{ ...sinceAnyEvent({ flags: NET, min: 24 }), type: 'ending' } as unknown as GameEvent],
      undefined,
      () => 'ending'
    )
    expect(findings.filter(f => f.kind === '窄化')).toEqual([])
  })

  it('空名单 / 区间倒置 / 负数都要报', async () => {
    const { scanEventShape } = await import('../../scripts/audit-event-shape')
    const bad = (spec: any, n: number): GameEvent =>
      ({ ...sinceAnyEvent({ flags: NET }), id: `test_since_any_bad_${n}`, conditions: { flags: { sinceAny: spec } } } as unknown as GameEvent)
    const findings = scanEventShape(
      [bad({ flags: [], min: 24 }, 1), bad({ flags: NET, min: 36, max: 12 }, 2), bad({ flags: NET, min: 0 }, 3)],
      undefined,
      () => 'transition'
    )
    const hits = findings.filter(f => f.detail.includes('sinceAny')).map(f => f.kind)
    expect(hits).toContain('结构')
    expect(hits).toContain('DEAD')
    expect(hits).toContain('NOOP')
  })

  it('网里的票只被 sinceAny 读着时，可达性体检不许报"没人读"', async () => {
    const { scanFlagReachability } = await import('../../scripts/audit-flag-reachability')
    const ev = {
      ...sinceAnyEvent({ flags: ['习医', '行医'], min: 24 }),
      conditions: { flags: { sinceAny: { flags: ['习医', '行医'], min: 24 } } }
    } as unknown as GameEvent
    const report = scanFlagReachability([ev])
    expect([...report.readBy.keys()]).toEqual(expect.arrayContaining(['习医', '行医']))
  })
})
