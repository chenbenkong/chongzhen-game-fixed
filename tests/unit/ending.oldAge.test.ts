import { describe, expect, it } from 'vitest'
import { allEndingEvents } from '../../src/data/events/ending'
import { OLD_AGE_ENDING_TILE } from '../../src/data/events/ending/endings_all'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { buildParams, type DerivedState } from '../../scripts/audit-ending-reachability'
import { checkEventConditions } from '../../src/utils/eventConditions'
import type { GameStateValues, OriginType } from '../../src/types/game'

/**
 * §1.4 ㉟ 的兜底格《寿终正寝》：**玩到七十岁的人必须被收走。**
 *
 * 第五十五轮量到的形状：44 格的年窗最晚止于 1660，没有一格读年岁；
 * 1644 那一档的七个落点里，四格读国势（甲申 ≤15 / 城破 ≤20 / 篡位 ≤25 / 中兴 ≥55），
 * 三格读票（南渡长江＋效忠南明 / 殉国报君 / 贰臣）。于是「先举义、后降清」的人撞上
 * 《称臣纳贡》`notHas` 里那条自相矛盾的 `组织义军`：门票已经是 贰臣，却禁止他抗过。
 * 四格全不接他，日历一路翻到公元 3193 年（18789 月）才被步数预算截停。
 *
 * 这一格钉四件事：
 *   1. 门只读年岁：69 岁不开、70 岁开，且不看年窗（历年历月都得开）；
 *   2. 两个求值器（边界路径与事件池路径）读到的是同一个 `age`；
 *   3. 它排在全部结局格的**最后** —— 优先级数字最大 = 最晚被问，
 *      否则它会在每个七十岁玩家的月份上抢走甲申国变、南渡续祚这些正局；
 *   4. 「先举义、后降清」的那份反推存档现在落进《称臣纳贡》，而不是落空。
 */

const tile = allEndingEvents.find(e => e.id === 'ending_old_age')!
const endings = Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending')
const boundary = endings.find(e => e.event.id === 'ending_old_age')!

function stateOf(over: Partial<DerivedState> = {}): DerivedState {
  const attributes: Record<string, number> = { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 }
  const hidden: Record<string, number> = { 道德值: 50, 欲望值: 50, 野心值: 40, 机敏值: 50, 忠诚值: 50 }
  const states: Record<string, number> = { 圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 50 }
  return {
    attributes,
    hidden,
    states,
    turn: 600,
    year: 1678,
    month: 6,
    age: 70,
    flags: [],
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 },
    ...over
  }
}

const at = (age: number, over: Partial<DerivedState> = {}) =>
  boundary.check(buildParams(stateOf({ ...over, age })))

function characterOf(age: number) {
  return {
    attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 },
    hidden: { 道德值: 50, 欲望值: 50, 野心值: 40, 机敏值: 50, 忠诚值: 50 },
    flags: [] as string[],
    origin: '寒门' as OriginType,
    age
  } as any
}

const STATE: GameStateValues = {
  currentYear: 1678,
  currentMonth: 6,
  turn: 600,
  圣眷: 50,
  中官: 50,
  清议: 50,
  士绅: 50,
  民望: 50,
  国势: 50
}

describe('《寿终正寝》：年岁是上界，不是门槛', () => {
  it('69 岁不开、70 岁开，与年份月份无关', () => {
    expect(tile, '图鉴导出的那一格必须就是注册表里这一格').toBe(OLD_AGE_ENDING_TILE)
    expect(at(69), '差一岁就收人 = 门槛写错了').toBe(false)
    expect(at(70)).toBe(true)
    expect(at(91), '上界不存在，越老越该收').toBe(true)
    // 这一格是兜底，不是历史事件：它不许有年窗。真有年窗的话，
    // "熬过了年窗的七十岁"又会变回不朽 —— 那正是 §1.4 ㉟ 的原形。
    expect(tile.conditions?.year).toBeUndefined()
    expect(tile.conditions?.turn).toBeUndefined()
    expect(at(70, { year: 1700, month: 12, turn: 900 }), '把时钟推远，门必须还开着').toBe(true)
    expect(at(70, { year: 1644, month: 1, turn: 193 }), '1644 的正月也不许被它抢').toBe(true)
  })

  it('边界路径与事件池路径读同一个 age', () => {
    expect(checkEventConditions(tile, characterOf(69), STATE)).toBe(false)
    expect(checkEventConditions(tile, characterOf(70), STATE)).toBe(true)
  })

  it('排在全部结局格的最后：优先级数字唯一最大', () => {
    const max = Math.max(...endings.map(e => e.priority))
    expect(boundary.priority, '它一旦排到前面，就会抢掉七十岁玩家那年该走的正局').toBe(max)
    expect(endings.filter(e => e.priority === max), '最末一格只能有一个').toHaveLength(1)
    // 更低优先级的对照：正戏那几格全都排在它前面（数字更小）
    for (const id of ['ending_jiashen_nationfall', 'ending_southern_ming', 'ending_qing_tributary']) {
      const other = endings.find(e => e.event.id === id)
      if (other) expect(other.priority).toBeLessThan(boundary.priority)
    }
  })

  it('不可拒笔，且每一条选项都真的收尾', () => {
    expect((tile as any).declinable, '可拒 = 玩家还能把它推回去继续不朽').not.toBe(true)
    expect(tile.choices.length).toBeGreaterThanOrEqual(3)
    expect(tile.choices.length).toBeLessThanOrEqual(4)
    expect(
      tile.choices.filter(c => c.effects?.special?.type !== 'ending').map(c => c.id),
      '结局卡上有点了不收尾的选项，等于让玩家把这一格点掉'
    ).toEqual([])
  })

  it('「先举义、后降清」的人落进《称臣纳贡》，不再落空', () => {
    const qing = boundaryEventManager.get('ending_qing_tributary')!
    expect(qing, '《称臣纳贡》没注册进边界表').toBeDefined()
    expect(
      qing.event.conditions?.flags?.notHas,
      '组织义军 与门票 贰臣 自相矛盾：人已经降了清，没有理由再禁止他抗过'
    ).not.toContain('组织义军')
    // 种子 6 那一局的形状：国势 50（四格窄窗都不接）、举过义、降了清。
    // 修复前这里命中 null —— 注册表里没有任何一格接他。
    const params = buildParams(stateOf({ year: 1644, month: 5, turn: 197, age: 32, flags: ['组织义军', '贰臣'] }))
    expect(boundaryEventManager.checkByType(params, 'ending')?.event.id).toBe('ending_qing_tributary')
  })
})
