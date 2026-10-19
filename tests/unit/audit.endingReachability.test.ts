import { describe, expect, it } from 'vitest'
import { factionCeiling, scanEndingReachability } from '../../scripts/audit-ending-reachability'
import { allEndingEvents } from '../../src/data/events/ending'
import { ENDING_TILE_IDS } from '../../src/data/endingRegistry'
import { NARRATIVE_MIN_TURN, NARRATIVE_MIN_YEAR } from '../../src/data/boundaryEventCompiler'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'

/**
 * 结局可达性矩阵（第二十一轮）。
 *
 * 玩家提的不是某个 bug，是一句底线：**「要确保所有的结局都能跑通」**。
 * 在这之前这句话只有两种回答方式，两种都不成立：
 *   - 跑局模拟：它只说明**那六种策略**走没走到。善终要的是"道德≥80 ∧ 清议≥70 ∧ 致仕经历"
 *     这种**定向**状态，而 warden 的判据是"八维最小值最大"，永远不会主动把某一维推到极端去撞门。
 *     于是 ×0 的格子分不清是"走不到"还是"没人朝它走"。
 *   - 读条件：`conditions` 里的键由边界求值器解释，而它拿到的 params 只有引擎那一个
 *     对象字面量里的键。数据里写 `帝心 ≥ 70` 这类别名键，边界读到的是 `undefined ?? 0`，
 *     门槛恒假 —— 而它长得跟"玩家没达到"一模一样。
 *
 * 所以这里量的是第三件事：**用引擎自己注册的 check 函数**，给每一格反推一份
 * "刚好够得着"的存档，再问注册表这份存档命中的是哪一格。判定一行都不重写。
 *
 * 本轮实测抓出来的两处死局（都已修）：
 *   1. 《东林烈士》《权奸末路》的门票是 `东林死忠` / `叛徒`，而**全游戏没有任何一处
 *      写得出这两段经历**。手写 check 放开了一扇门，门后没有把手。
 *   2. 引擎的 faction 只认五张 flag（阉党路线 / 复社成员 / 东林死忠 / 叛徒 / 两面三刀），
 *      其中四张没有写手 —— 于是 `党争烈度` 只能从初值 30 涨到 38，
 *      而《党争牺牲品》要 90。四条党派支线因此是整块死的，不是某一格。
 */

/** 边界注册表判给每一格的结论，只允许这两种 */
const PASSING = new Set(['ok', 'engine-driven'])

const report = scanEndingReachability()

describe('结局可达性矩阵：图鉴每一格都得真能走到', () => {

  it('格子总数与图鉴登记表一致', () => {
    expect(report.tiles.length).toBe(allEndingEvents.length)
    expect(new Set(report.tiles.map(t => t.id))).toEqual(new Set(ENDING_TILE_IDS))
  })

  it('没有任何一格走不到（本轮的主断言）', () => {
    const bad = report.tiles.filter(t => !PASSING.has(t.kind))
    expect(
      bad.map(t => `[${t.kind}] ${t.id}《${t.title}》—— ${t.notes.join('；')}`),
      '图鉴上出现了一格玩家无论如何走不到的结局。改数据（补门票写手 / 调门槛），不要改这条断言。'
    ).toEqual([])
  })

  it('没有任何一格被别的结局遮蔽（同一次存档里先被抢走）', () => {
    const shadowed = report.tiles.filter(t => t.kind === 'shadowed')
    expect(
      shadowed.map(t => `${t.id} ← ${t.blockedBy}(p${t.blockedByPriority})`),
      '这一格自己的门槛成立，却有 priority 更小的一格先命中 —— 玩家永远看不到它'
    ).toEqual([])
  })

  it('每一条门票 flag 都有写手（含驱动表手填的那些）', () => {
    const noWriter = report.tiles.filter(t => t.kind === 'no-writer')
    expect(noWriter.map(t => `${t.id}: ${t.notes[t.notes.length - 1]}`)).toEqual([])
  })

  it('条件里不许出现边界 params 不带的键（`?? 0` 之后 min 恒假）', () => {
    const dead = report.tiles.filter(t => t.kind === 'dead-key')
    expect(dead.map(t => `${t.id}: ${t.notes[t.notes.length - 1]}`)).toEqual([])
  })

  it('年窗不许自相矛盾，也不许开到游戏终点之后', () => {
    const bad = report.tiles.filter(t => t.kind === 'window-conflict')
    expect(bad.map(t => `${t.id}: ${t.notes[t.notes.length - 1]}`)).toEqual([])
  })

  it('数据里写的年窗/月数下限，必须等于注册表里真正生效的那一个', () => {
    // 第二十五轮的教训，做成棘轮：《亡命江湖》上一轮把 year.min 从 1635 改到 1630，
    // 理由（"票源最早 1629 年发得出来"）成立，改动却**一点没生效** ——
    // `wrapBatchAsBoundaryEvents` 对每一格都做 `minYear = Math.max(兜底, 声明值)`，
    // 低于兜底的声明被静默抬上去。于是数据里那个数成了装饰：读它的人以为门早开五年，
    // 而这一格真正卡住的地方在别处（朝廷机器仍在按在任官员办一个已经把印信留在案上的人）。
    // 这条用例不许"改回去"：要么删掉低于兜底的声明（等于承认兜底），要么把兜底本身降下来。
    const registered = Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending')
    const byId = new Map(registered.map(r => [r.event.id, r]))
    const decorative: string[] = []
    for (const tile of allEndingEvents) {
      const entry = byId.get(tile.id)
      if (!entry) continue // 引擎驱动的格子（《罢黜归田》）不进注册表，没有"生效值"可对
      const declaredYear = tile.conditions?.year?.min
      const declaredTurn = tile.conditions?.turn?.min
      if (declaredYear !== undefined && declaredYear !== entry.event.conditions?.year?.min) {
        decorative.push(
          `${tile.id}《${tile.title}》声明年窗 ≥${declaredYear}，实际生效 ${entry.event.conditions?.year?.min}` +
            `（兜底 NARRATIVE_MIN_YEAR=${NARRATIVE_MIN_YEAR}）`
        )
      }
      if (declaredTurn !== undefined && declaredTurn !== entry.event.conditions?.turn?.min) {
        decorative.push(
          `${tile.id}《${tile.title}》声明 ≥${declaredTurn} 月，实际生效 ${entry.event.conditions?.turn?.min} 月` +
            `（兜底 NARRATIVE_MIN_TURN=${NARRATIVE_MIN_TURN}）`
        )
      }
    }
    expect(
      decorative,
      '这些格子的年窗/月数写的是永远不会生效的数字。要么照实写生效值，要么改兜底常量本身 —— ' +
        '不许留着"看起来改了其实没改"的声明'
    ).toEqual([])
  })

  it('低于兜底的年窗声明，一条都不许存在（对账用的反向表述）', () => {
    const under = allEndingEvents
      .filter(t => (t.conditions?.year?.min ?? Infinity) < NARRATIVE_MIN_YEAR)
      .map(t => `${t.id}《${t.title}》min=${t.conditions?.year?.min}`)
    expect(under, `这些格子声明的年窗低于 ${NARRATIVE_MIN_YEAR}，会被编译器静默抬上去`).toEqual([])
  })

  it('手写 check 的那十四格仍由驱动表提供存档（防止驱动表漏格）', () => {
    const driven = report.tiles.filter(t => t.notes.some(n => n.includes('驱动表')))
    expect(
      driven.map(t => t.id).sort(),
      '驱动表覆盖的是"门槛不在 conditions 里"的那些格：八条归零 + 三条党派 + 两条 custom。' +
        '少一格说明有人把门槛搬回了 conditions（那很好，同步删掉驱动），或者搬走了却没人接。'
    ).toEqual(
      [
        'ending_famous_minister',
        'ending_zhongxing_success',
        'triggerable_bankrupt',
        'triggerable_death_illness',
        'triggerable_emperor_hate',
        'triggerable_eunuch',
        'triggerable_faction_martyr',
        'triggerable_faction_sacrifice',
        'triggerable_faction_tyrant_fall',
        'triggerable_gentry_rebellion',
        'triggerable_moral_degeneracy',
        'triggerable_popular_uproar',
        'triggerable_scholar_ostracism'
      ].sort()
    )
  })
})

describe('党争数值上界：门槛不许高过玩法能给的东西', () => {

  it('烈度上界够得着《党争牺牲品》的门槛', () => {
    expect(
      report.factionCeiling.烈度上限,
      `党争烈度按全游戏门票 flag 最多刷到 ${report.factionCeiling.烈度上限}，` +
        '而《党争牺牲品》要 90 —— 要么给 flag 找写手，要么把门槛降到玩法够得着的地方'
    ).toBeGreaterThanOrEqual(90)
  })

  it('四条党派门票 flag 各有各的写手', () => {
    const flags = new Set(report.factionCeiling.perFlag.map(p => p.flag))
    expect([...flags].sort()).toEqual(['主和派', '东林死忠', '两面三刀', '复社成员', '阉党路线'].sort())
  })

  /**
   * 反空转：上面那条"≥90"在 `factionCeiling` 本身失效时也会绿
   * （比如有人把 `FACTION_DELTA` 的 flag 名改错，一张票也算不进上界）。
   * 这里直接喂一份**只有复社成员一张票**的池子 —— 那正是本轮修掉之前的真实状态，
   * 上界必须是 38，而不是 100。
   */
  it('扫描真的认得这些票，删掉写手就会掉回去', () => {
    const onlyFushe = [
      {
        id: 'syn',
        type: 'origin',
        title: 't',
        conditions: {},
        choices: [{ id: 'c1', text: 'x', effects: { flags: { add: ['复社成员'] } } }]
      }
    ] as any
    const r = factionCeiling(onlyFushe)
    // 复社成员 = 一次 +8，初值 30 —— 第二十一轮改造前，《党争牺牲品》就卡在这个数上
    expect(r.烈度上限).toBe(38)
    expect(r.perFlag.map(p => p.flag)).toEqual(['复社成员'])

    const none = factionCeiling([] as any)
    expect(none.烈度上限).toBe(30)
  })
})
