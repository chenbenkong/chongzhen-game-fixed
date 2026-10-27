import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'path'
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
 *   3. 边界/结局求值器**也**读它 —— 第六十九轮才补上 `BoundaryEventCheckParams.flagTurns`
 *      这个入参。在此之前写在结局格上等于没写（体检脚本按 NOOP 报出），
 *      作者只能改用公元年窗间接表达"这段经历满几年"，而年窗管天下、不管这个人做了多久
 *      （§1.4 ㊸）。这一家三口现在必须同义，最后一条 describe 钉的就是这件事。
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

describe('边界/结局求值器与事件池对 since 同义（第六十九轮补的入参）', () => {
  const params = (
    turn: number,
    opts: { flags?: string[]; flagTurns?: Record<string, number> } = {}
  ): BoundaryEventCheckParams => ({
    attributes: {},
    gameState: { turn },
    hidden: {},
    flags: opts.flags ?? ['has_children'],
    flagTurns: opts.flagTurns
  })
  const check = (since: Record<string, { min?: number; max?: number }>, p: BoundaryEventCheckParams) =>
    wrapAsBoundaryEvent(sinceEvent(since), 100).check(p)

  it('不满 min：池关，边界也关 —— 过去边界这里是开着的，等于一道没装的门', () => {
    expect(checkEventConditions(sinceEvent({ has_children: { min: 72 } }), kidBornAt(30), makeGameState({ turn: 40 }))).toBe(false)
    expect(check({ has_children: { min: 72 } }, params(40, { flagTurns: { has_children: 30 } }))).toBe(false)
  })

  it('满 min：两边在同一个月放人', () => {
    // 落笔第 30 月 → 第 101 月差一个月，第 102 月正好满 72
    expect(check({ has_children: { min: 72 } }, params(101, { flagTurns: { has_children: 30 } }))).toBe(false)
    expect(check({ has_children: { min: 72 } }, params(102, { flagTurns: { has_children: 30 } }))).toBe(true)
    expect(checkEventConditions(sinceEvent({ has_children: { min: 72 } }), kidBornAt(30), makeGameState({ turn: 102 }))).toBe(true)
  })

  it('上界同样同义：过了窗口就关', () => {
    expect(check({ has_children: { min: 72, max: 84 } }, params(114, { flagTurns: { has_children: 30 } }))).toBe(true)
    expect(check({ has_children: { min: 72, max: 84 } }, params(115, { flagTurns: { has_children: 30 } }))).toBe(false)
  })

  it('经历不在身上就关，不许被"没有落笔记录"的容错放走', () => {
    expect(check({ has_children: { min: 1 } }, params(500, { flags: [], flagTurns: { has_children: 0 } }))).toBe(false)
  })

  it('老存档容错与事件池一致：整张表缺失、或缺这一段记录，都放行', () => {
    const legacy = makeCharacter({ flags: ['has_children'] })
    expect((legacy as any).flagTurns).toBeUndefined()
    expect(checkEventConditions(sinceEvent({ has_children: { min: 72 } }), legacy, makeGameState({ turn: 40 }))).toBe(true)
    expect(check({ has_children: { min: 72 } }, params(40))).toBe(true)
    expect(check({ has_children: { min: 72 } }, params(40, { flagTurns: { 地方官任职: 0 } }))).toBe(true)
  })

  it('结局池上的 since 不再是死门（体检脚本不许再报 NOOP）', async () => {
    const { scanEventShape } = await import('../../scripts/audit-event-shape')
    const findings = scanEventShape(
      [sinceEvent({ has_children: { min: 72 } }, { type: 'ending' })],
      undefined,
      () => 'ending'
    )
    expect(findings.filter(f => f.kind === 'NOOP' && f.detail.includes('since'))).toEqual([])
  })

  it('把时长门写在 any 网里的任意一张票上，体检脚本要说它把网收窄了', async () => {
    // 第六十九轮实验 A 的错法：`{ any: [A, B], since: { A } }` 读起来像"任一条路满三年"，
    // 引擎看到的是"A 必须有且 A 满三年"，B 那条路整条消失 —— 且没有一行日志。
    const { scanEventShape } = await import('../../scripts/audit-event-shape')
    const narrowed = scanEventShape(
      [{ ...sinceEvent({ 随军出征: { min: 36 } }), conditions: {
        flags: { any: ['随军出征', '边关任职'], since: { 随军出征: { min: 36 } } }
      } } as unknown as GameEvent],
      undefined,
      () => 'ending'
    )
    expect(narrowed.filter(f => f.kind === '窄化').map(f => f.detail).join()).toContain('随军出征')

    // 写在前提经历（has 里那张）上就是正当用法，不许一起报掉
    const onPremise = scanEventShape(
      [{ ...sinceEvent({ 边关任职: { min: 36 } }), conditions: {
        flags: { has: ['边关任职'], any: ['随军出征', '边关任职'], since: { 边关任职: { min: 36 } } }
      } } as unknown as GameEvent],
      undefined,
      () => 'ending'
    )
    expect(onPremise.filter(f => f.kind === '窄化')).toEqual([])
  })
})

/**
 * 入参必须成对喂到。`conditions.age` 那条（第 56 轮 ㉟）的教训就是"引擎三处调用点漏了一处"：
 * 漏掉键的求值器不是报错，是安静地按 0/放行判定，于是同一条门在不同路径上说不同的话。
 */
describe('每一处边界入参都带上落笔月份', () => {
  const SOURCES = [
    'src/hooks/useGameEngine.ts',
    'src/utils/routeTrail.ts',
    'scripts/audit-ending-reachability.ts'
  ]

  it('凡是喂了 characterAge 的 params 字面量，都同时喂了 flagTurns', () => {
    for (const rel of SOURCES) {
      const src = readFileSync(join(__dirname, '../..', rel), 'utf8')
      const sites = src.split('characterAge:').slice(1)
      expect(sites.length, `${rel} 里一处边界入参都找不到 —— 构造式改了，这条钉子要跟着改`).toBeGreaterThan(0)
      for (const site of sites) {
        expect(
          site.slice(0, 400),
          `${rel} 有一处边界入参只带了年岁、没带 flagTurns —— 那条路径上的时长门等于没装`
        ).toContain('flagTurns')
      }
    }
  })

  it('跑局器逐月抄的边界入参也带上落笔月份（矩阵与跑局对账用的是同一份）', () => {
    const src = readFileSync(join(__dirname, 'helpers/simulate.ts'), 'utf8')
    const derived = src.split('function derivedOf')[1] ?? ''
    expect(derived.slice(0, 900), 'derivedOf 里没有 flagTurns').toContain('flagTurns')
  })
})
