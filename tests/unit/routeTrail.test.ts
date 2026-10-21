import { describe, expect, it } from 'vitest'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { ROUTE_FAMILIES, buildRouteTrail, previewEnding } from '../../src/utils/routeTrail'
import { allEndingEvents } from '../../src/data/events/ending'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { THRESHOLD_ENDING_BY_KEY } from '../../src/data/boundaryEvents'
import { NARRATIVE_MIN_YEAR } from '../../src/data/boundaryEventCompiler'
import { ZERO_THRESHOLDS, zeroWarnFlag } from '../../src/data/zeroWarningEvents'
import type { Attributes, Character, GameStateValues } from '../../src/types/game'

const endingById = new Map(allEndingEvents.map(e => [e.id, e]))
const registeredEndings = () =>
  new Map(
    Object.values(boundaryEventManager.getAll())
      .filter(b => b.type === 'ending')
      .map(b => [b.event.id, b])
  )

const routeEndingIds = new Set(
  ROUTE_FAMILIES.flatMap(f => f.destinations.map(d => d.endingId))
)

describe('命途元数据', () => {
  it('每张票、每个年窗、每个优先级都与结局数据和注册表一致', () => {
    const registered = registeredEndings()
    for (const family of ROUTE_FAMILIES) {
      expect(family.destinations.length, `${family.name} 没有落点`).toBeGreaterThan(0)
      for (const dest of family.destinations) {
        const ending = endingById.get(dest.endingId)
        expect(ending, `${family.name} 的落点 ${dest.endingId} 不在结局数据里`).toBeTruthy()
        expect(dest.title, `${dest.endingId} 标题对不上`).toBe(ending!.title)

        const flags = ending!.conditions?.flags
        const source = dest.mode === 'all' ? flags?.has : flags?.any
        expect(source, `${dest.endingId} 没有 ${dest.mode === 'all' ? 'has' : 'any'} 门票`).toBeTruthy()
        expect(new Set(dest.tickets), `${dest.endingId} 门票与数据不一致`).toEqual(new Set(source))
        expect(dest.tickets.length, `${dest.endingId} 门票重复`).toBe(new Set(dest.tickets).size)

        const expectedMin = Math.max(NARRATIVE_MIN_YEAR, ending!.conditions?.year?.min ?? NARRATIVE_MIN_YEAR)
        const expectedMax = ending!.conditions?.year?.max
        expect(dest.window.min, `${dest.endingId} 年窗下沿对不上`).toBe(expectedMin)
        expect(dest.window.max, `${dest.endingId} 年窗上沿对不上`).toBe(expectedMax)

        const boundary = registered.get(dest.endingId)
        expect(boundary, `${dest.endingId} 没有注册为边界结局`).toBeTruthy()
        expect(dest.priority, `${dest.endingId} 优先级与注册表不一致`).toBe(boundary!.priority)
      }
    }
  })

  it('每个命途 key 唯一，每个落点只归一个命途', () => {
    const keys = ROUTE_FAMILIES.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)

    const seen = new Set<string>()
    for (const dest of ROUTE_FAMILIES.flatMap(f => f.destinations)) {
      expect(seen.has(dest.endingId), `${dest.endingId} 被两个命途重复登记`).toBe(false)
      seen.add(dest.endingId)
    }
  })
})

describe('命途判定', () => {
  it('开局只有官职 flag 时不虚构命途，也不虚构危局', () => {
    const trail = buildRouteTrail(makeCharacter(), makeGameState())
    expect(trail.routes).toEqual([])
    expect(trail.dangers).toEqual([])
  })

  it('持有一张边关票就入道，并列出同途的落点', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['随军出征'] }),
      makeGameState({ currentYear: 1638, turn: 40 })
    )
    const border = trail.routes.find(r => r.key === 'border')
    expect(border).toBeTruthy()
    expect(border!.heldTickets).toEqual(['随军出征'])
    expect(border!.destinations.map(d => d.title)).toEqual(['战死沙场', '边关大将'])
    expect(border!.destinations.every(d => d.matchedTickets.includes('随军出征'))).toBe(true)
  })

  it('has 型结局必须全部票齐才出现；单票只进同途的 any 落点', () => {
    const oneTicket = buildRouteTrail(
      makeCharacter({ flags: ['下落不明'] }),
      makeGameState({ currentYear: 1638, turn: 40 })
    )
    const oneTitles = oneTicket.routes.find(r => r.key === 'outlaw')!.destinations.map(d => d.endingId)
    expect(oneTitles).toContain('ending_fugitive')
    expect(oneTitles).not.toContain('ending_unknown_fate')

    const bothTickets = buildRouteTrail(
      makeCharacter({ flags: ['下落不明', '隐姓埋名'] }),
      makeGameState({ currentYear: 1638, turn: 40 })
    )
    expect(bothTickets.routes.find(r => r.key === 'outlaw')!.destinations.map(d => d.endingId))
      .toContain('ending_unknown_fate')
  })

  it('历练未足、年窗未开、年窗已过都写在落点旁边', () => {
    const early = buildRouteTrail(
      makeCharacter({ flags: ['与世无争'] }),
      makeGameState({ currentYear: 1628, turn: 10 })
    )
    expect(early.routes[0].destinations[0].status).toBe('training')
    expect(early.routes[0].destinations[0].statusLabel).toBe('尚需 26 月')

    const beforeWindow = buildRouteTrail(
      makeCharacter({ flags: ['与世无争'] }),
      makeGameState({ currentYear: 1633, turn: 60 })
    )
    expect(beforeWindow.routes[0].destinations[0].status).toBe('before')
    expect(beforeWindow.routes[0].destinations[0].statusLabel).toBe('1635 年后')

    const passed = buildRouteTrail(
      makeCharacter({ flags: ['与世无争'] }),
      makeGameState({ currentYear: 1644, turn: 192 })
    )
    expect(passed.routes[0].destinations[0].status).toBe('passed')
    expect(passed.routes[0].destinations[0].statusLabel).toBe('年窗已过')
  })

  it('年窗开着但数值门槛没到，写尚缺条件而不是条件已足', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['随军出征'] }),
      makeGameState({ currentYear: 1640, turn: 60 })
    )
    const general = trail.routes
      .find(r => r.key === 'border')!
      .destinations.find(d => d.endingId === 'ending_border_general')!
    expect(general.status).toBe('open')
    expect(general.ready).toBe(false)
    expect(general.statusLabel).toBe('尚缺条件')
  })

  it('条件真成立时由注册表说是，而不是 UI 另算一套', () => {
    const character = makeCharacter({ flags: ['与世无争'] })
    const state = makeGameState({ currentYear: 1636, turn: 60 })
    const trail = buildRouteTrail(character, state)
    const ordinary = trail.routes[0].destinations[0]
    expect(ordinary.endingId).toBe('ending_ordinary_life')
    expect(ordinary.ready).toBe(true)
    expect(ordinary.statusLabel).toBe('条件已足')
  })
})

describe('缺口解释', () => {
  const destOf = (
    trail: ReturnType<typeof buildRouteTrail>,
    familyKey: string,
    endingId: string
  ) => trail.routes.find(r => r.key === familyKey)!.destinations.find(d => d.endingId === endingId)!

  it('可补的数值缺口写成还差多少，而不是一句尚缺条件', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['随军出征'] }),
      makeGameState({ currentYear: 1640, turn: 60 })
    )
    const general = destOf(trail, 'border', 'ending_border_general')
    expect(general.statusLabel).toBe('尚缺条件')
    expect(general.gaps).toEqual(['武略 50/70'])
    expect(general.blockedBy).toEqual([])
    expect(general.detail).toBe('还缺：武略 50/70')
  })

  it('上界不足写清"需≤"，不把太高也说成还差', () => {
    const trail = buildRouteTrail(
      makeCharacter({
        flags: ['随军出征'],
        attributes: { ...makeCharacter().attributes, 体质: 80 } as Attributes
      }),
      makeGameState({ currentYear: 1638, turn: 60, 国势: 50 })
    )
    const battle = destOf(trail, 'border', 'ending_died_battlefield')
    expect(battle.gaps).toEqual(['体质 80（需≤8）'])
    expect(battle.detail).toBe('还缺：体质 80（需≤8）')
  })

  it('互斥经历不是缺口，是已经断掉的路', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['随军出征', '出家'] }),
      makeGameState({ currentYear: 1640, turn: 60 })
    )
    const general = destOf(trail, 'border', 'ending_border_general')
    expect(general.blockedBy).toEqual(['出家'])
    expect(general.statusLabel).toBe('经历相冲')
    expect(general.detail).toBe('相冲：出家；还缺：武略 50/70')
  })

  it('自己辞过的笔单独说，语气不是还差一点', () => {
    const trail = buildRouteTrail(
      makeCharacter({
        flags: ['归隐', '搁笔·归隐田园'],
        hidden: { 道德值: 80, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
      }),
      makeGameState({ currentYear: 1640, turn: 60, 清议: 60, 圣眷: 40 })
    )
    const hermit = destOf(trail, 'hermit', 'ending_hermit_taoist')
    expect(hermit.blockedBy).toEqual(['搁笔·归隐田园'])
    expect(hermit.statusLabel).toBe('已搁笔')
    expect(hermit.detail).toBe('已搁笔：归隐田园')
  })

  it('门还没开，但路已经断了，也要提前说', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['随军出征', '出家'] }),
      makeGameState({ currentYear: 1635, turn: 60 })
    )
    const general = destOf(trail, 'border', 'ending_border_general')
    expect(general.status).toBe('before')
    expect(general.statusLabel).toBe('经历相冲')
    expect(general.detail).toBe('相冲：出家')
  })

  it('年窗已过就不再拿门槛和互斥烦人', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['随军出征', '出家'] }),
      makeGameState({ currentYear: 1651, turn: 276 })
    )
    const general = destOf(trail, 'border', 'ending_border_general')
    expect(general.status).toBe('passed')
    expect(general.statusLabel).toBe('年窗已过')
    expect(general.detail).toBe('')
  })

  it('条件已足时不留第二行', () => {
    const trail = buildRouteTrail(
      makeCharacter({ flags: ['与世无争'] }),
      makeGameState({ currentYear: 1636, turn: 60 })
    )
    const ordinary = destOf(trail, 'homestead', 'ending_ordinary_life')
    expect(ordinary.ready).toBe(true)
    expect(ordinary.detail).toBe('')
  })

  it('实跑：开放窗未足必有第二行，已搁笔与相冲都真的出现过', async () => {
    const counts = { open: 0, declined: 0, conflicted: 0 }
    for (const policy of ['hermit', 'bandit', 'ordinary'] as const) {
      for (const origin of ['寒门', '诗文清望'] as const) {
        const run = await simulateRun({
          seed: 9000,
          policy,
          origin,
          maxMonths: 260,
          traceMonths: true
        })
        for (const row of run.trace) {
          const d = row.derived
          const trail = buildRouteTrail(
            {
              attributes: { ...d.attributes },
              hidden: { ...d.hidden },
              flags: [...d.flags],
              faction: { ...d.faction }
            } as unknown as Character,
            {
              ...d.states,
              turn: d.turn,
              currentYear: d.year,
              currentMonth: d.month
            } as unknown as GameStateValues
          )
          for (const route of trail.routes) {
            for (const dest of route.destinations) {
              if (dest.ready || dest.status !== 'open') continue
              counts.open++
              if (dest.blockedBy.some(x => x.startsWith('搁笔·'))) counts.declined++
              if (dest.blockedBy.some(x => !x.startsWith('搁笔·'))) counts.conflicted++
              expect(
                dest.gaps.length + dest.blockedBy.length,
                `${dest.endingId} 开放窗里没解释`
              ).toBeGreaterThan(0)
              expect(dest.detail, `${dest.endingId} 第二行为空`).not.toBe('')
            }
          }
        }
      }
    }
    expect(counts.open).toBeGreaterThan(0)
    expect(counts.declined).toBeGreaterThan(0)
    expect(counts.conflicted).toBeGreaterThan(0)
  }, 600_000)
})

describe('此刻史笔', () => {
  it('与 BoundaryEventManager 的结算结果完全同口径', () => {
    const samples = [
      { character: makeCharacter({ flags: ['与世无争'] }), state: makeGameState({ currentYear: 1636, turn: 60 }) },
      { character: makeCharacter({ flags: ['随军出征'] }), state: makeGameState({ currentYear: 1640, turn: 60 }) },
      { character: makeCharacter(), state: makeGameState({ currentYear: 1630, turn: 5 }) }
    ]
    for (const { character, state } of samples) {
      const direct = boundaryEventManager.checkByType({
        attributes: { ...character.attributes } as unknown as Record<string, number>,
        gameState: {
          圣眷: state.圣眷, 中官: state.中官, 清议: state.清议,
          士绅: state.士绅, 民望: state.民望, 国势: state.国势, turn: state.turn
        },
        hidden: { ...character.hidden } as unknown as Record<string, number>,
        faction: character.faction,
        flags: character.flags,
        currentYear: state.currentYear,
        currentMonth: state.currentMonth
      }, 'ending')
      expect(previewEnding(character, state)?.endingId ?? null).toBe(direct?.event.id ?? null)
    }
  })

  it('归零且已警告时预览到具体死局，并标红', () => {
    const character = makeCharacter({
      flags: ['地方官任职', zeroWarnFlag('财帛')],
      attributes: { 财帛: 0, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 }
    })
    const preview = previewEnding(character, makeGameState({ currentYear: 1630, turn: 20 }))
    expect(preview?.endingId).toBe('triggerable_bankrupt')
    expect(preview?.isThreshold).toBe(true)
  })

  it('历练/年窗未开时不落笔', () => {
    expect(previewEnding(makeCharacter({ flags: ['与世无争'] }), makeGameState({ turn: 10 }))).toBeNull()
    expect(previewEnding(makeCharacter(), makeGameState({ currentYear: 1628, turn: 0 }))).toBeNull()
  })
})

describe('危局', () => {
  it('八条死线逐条与死亡结局对照表、标题一致', () => {
    for (const t of ZERO_THRESHOLDS) {
      const character = t.group === 'attributes'
        ? makeCharacter({
            flags: [zeroWarnFlag(t.key)],
            attributes: { ...makeCharacter().attributes, [t.key]: 0 } as Attributes
          })
        : t.group === 'hidden'
          ? makeCharacter({
              flags: [zeroWarnFlag(t.key)],
              hidden: { ...makeCharacter().hidden, [t.key]: 0 }
            })
          : makeCharacter({ flags: [zeroWarnFlag(t.key)] })
      const state = t.group === 'gameState'
        ? makeGameState({ turn: 20, [t.key]: 0 })
        : makeGameState({ turn: 20 })

      const danger = buildRouteTrail(character, state).dangers.find(d => d.key === t.key)
      expect(danger, `${t.key} 没进危局`).toBeTruthy()
      expect(danger!.level).toBe('cliff')
      const ending = endingById.get(THRESHOLD_ENDING_BY_KEY[t.key])
      expect(ending, `${t.key} 的死局没有登记`).toBeTruthy()
      expect(danger!.endingTitle).toBe(ending!.title)
    }
  })

  it('归零未警告与已警告分开提示', () => {
    const attributes = { 财帛: 0, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 }
    const notWarned = buildRouteTrail(
      makeCharacter({ flags: [], attributes }),
      makeGameState({ turn: 20 })
    ).dangers.find(d => d.key === '财帛')!
    expect(notWarned.level).toBe('zero')
    expect(notWarned.label).toBe('归零·尚有警告')

    const warned = buildRouteTrail(
      makeCharacter({ flags: [zeroWarnFlag('财帛')], attributes }),
      makeGameState({ turn: 20 })
    ).dangers.find(d => d.key === '财帛')!
    expect(warned.level).toBe('cliff')
    expect(warned.label).toBe('已在崖边')
  })

  it('只列最接近归零的三维，且按数值升序', () => {
    const trail = buildRouteTrail(
      makeCharacter({
        attributes: { 财帛: 5, 文韬: 50, 理政: 50, 武略: 50, 体质: 10 }
      }),
      makeGameState({ turn: 20, 圣眷: 3, 中官: 4, 清议: 12, 士绅: 50, 民望: 50, 国势: 50 })
    )
    expect(trail.dangers.map(d => d.key)).toEqual(['圣眷', '中官', '财帛'])
    expect(trail.dangers.map(d => d.value)).toEqual([3, 4, 5])
  })
})

describe('实跑对账', () => {
  it('实跑得到的路线结局，都能在命途里看见落点', async () => {
    const policies = ['hermit', 'bandit', 'ordinary', 'stream', 'fugitive'] as const
    const hits: SimOutcome[] = []
    for (const policy of policies) {
      for (const seed of [1, 2, 3]) {
        const run = await simulateRun({ seed, policy, origin: '寒门', maxMonths: 260 })
        if (run.ended && run.endingId && routeEndingIds.has(run.endingId)) hits.push(run)
      }
    }

    expect(hits.length, '这组样本一个路线结局都没跑到，测试失效').toBeGreaterThan(0)
    for (const run of hits) {
      const trail = buildRouteTrail(
        makeCharacter({ flags: run.finalFlags }),
        makeGameState({ currentYear: run.finalYear, turn: run.months })
      )
      const family = ROUTE_FAMILIES.find(f =>
        f.destinations.some(d => d.endingId === run.endingId)
      )!
      const active = trail.routes.find(r => r.key === family.key)
      expect(active, `${run.endingId} 跑到了，但命途 ${family.name} 没亮`).toBeTruthy()
      const dest = active!.destinations.find(d => d.endingId === run.endingId)
      expect(dest, `${run.endingId} 在命途里没有对应落点`).toBeTruthy()
      expect(dest!.matchedTickets.length, `${run.endingId} 的落点没有任何门票`).toBeGreaterThan(0)
    }
  }, 300_000)
})
