import { describe, expect, it } from 'vitest'
import { checkEventConditions, pickEvent } from '../../src/utils/eventConditions'
import { initialEvents } from '../../src/data/events'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import type { GameEvent } from '../../src/types/event'

/**
 * 第八轮：15 个「写了却永远播不出来」的历史事件重新上线。
 *
 * 它们缺的不是内容，是 `type` —— 事件选择严格按 `e.type` 分层
 * （`pickEvent` 五层 filter、`useGameEngine` 另四层），
 * 没有 `type` 的事件在任何存档里都排不进任何一层，而 `@ts-nocheck` 让这件事
 * 在类型系统里完全隐形（`GameEvent.type` 本来是必填的）。
 *
 * 这里既钉住这 15 个具体 id（它们曾经真的死过），也钉住整条规则：
 * **池子里任何事件都必须在某个可满足的时间点上被选择器认领**。
 */

const RESURRECTED = [
  'historical_025', 'historical_026', 'historical_027', 'historical_028',
  'historical_029', 'historical_030', 'historical_031', 'historical_032',
  'historical_036', 'historical_037', 'historical_038',
  'figure_chongzhen_audience', 'figure_hong_chengchou', 'figure_sun_chuanting', 'figure_wu_sangui'
]

/** 把 year/month 门调到事件要求的窗口内，其余条件用当前角色去撞 */
function stateFor(ev: GameEvent) {
  const y = ev.conditions?.year?.min ?? 1628
  const m = ev.conditions?.month?.min ?? 1
  return makeGameState({ currentYear: y, currentMonth: m })
}

describe('第八轮复活的 15 个历史事件', () => {
  it('全部仍然在事件池里（不是被删掉了事）', () => {
    const pool = new Set(initialEvents.map(e => e.id))
    for (const id of RESURRECTED) expect(pool.has(id), `${id} 不在池子里`).toBe(true)
  })

  it.each(RESURRECTED)('%s 有 type，且落在选择器认领的类型集合里', id => {
    const ev = initialEvents.find(e => e.id === id) as GameEvent
    expect(['historical', 'chain', 'transition', 'random', 'normal', 'emotion', 'gray', 'character', 'national', 'faction'])
      .toContain(ev.type)
  })

  it.each(RESURRECTED)('%s 在满足自身条件的月份里能被 pickEvent 选中', id => {
    const ev = initialEvents.find(e => e.id === id) as GameEvent
    // pickEvent 只按 type 分层，不做条件过滤（条件过滤在 findAvailableEvent）。
    // 所以这一步问的是纯粹的那个问题：这一层认不认它。
    expect(pickEvent([ev], [], undefined)?.id, `type=${ev.type} 进不了任何一层`).toBe(id)
  })

  it('这 15 个事件的条件至少有一个可满足的月份（不是补了 type 就万事大吉）', () => {
    // 复活一个事件只需要一行 type；但它是否真的能播出来，还取决于条件窗口。
    // 这里逐个用"事件自己要求的 year/month 起点 + 默认角色"撞一次，
    // 撞不过的必须逐个说明为什么撞不过 —— 否则就是另一个方向的死内容。
    const unsatisfiable: string[] = []
    for (const id of RESURRECTED) {
      const ev = initialEvents.find(e => e.id === id) as GameEvent
      if (!checkEventConditions(ev, makeCharacter(), stateFor(ev))) unsatisfiable.push(id)
    }
    expect(
      unsatisfiable,
      `这些事件补上了 type，但默认角色在它们的起始月份仍过不了条件门：\n${unsatisfiable.join('\n')}`
    ).toEqual([])
  })
})

describe('整条规则：池子里不允许再有选不中的 type', () => {
  it('initialEvents 与灰色/情感池里每个事件的 type 都在选择器集合里', () => {
    const selectable = new Set([
      'historical', 'chain', 'transition', 'random', 'normal',
      'emotion', 'gray', 'character', 'national', 'faction'
    ])
    const bad = initialEvents.filter(e => !selectable.has(String(e.type)))
    expect(bad.map(e => `${e.id}:${String(e.type)}`), '这些事件的 type 进不了任何一层').toEqual([])
  })

  it('type 缺失在类型上就不可能写出来（GameEvent.type 是必填）', () => {
    // 这一条编译期成立即可：如果有人把 type 改回可选，下面这行会报错
    const noType = { id: 'x', title: 'x', description: '', conditions: {}, choices: [] }
    // @ts-expect-error GameEvent.type 必填 —— 第七轮的 15 个死事件就是这么来的
    const _probe: GameEvent = noType
    expect(_probe).toBeTruthy()
  })
})
