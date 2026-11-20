import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { initialEvents } from '../../src/data/events'
import { allEndingEvents } from '../../src/data/events/ending'
import type { OriginType } from '../../src/types/game'
import type { SaveData } from '../../src/types/save'

/**
 * 边关狼烟第三拍《松锦决》(route_songjin_decision) 的收笔回归钉。
 *
 * 为什么需要这条用例：自由模拟（simulation.borderWarBeats）里第三拍 reach=13，
 * 但《战死沙场》(ending_died_battlefield) 命中是 0 —— c2「死守松山」是道 道德值≥60
 * 的窄门选项，固定画像的 random/first/ambitious 策略不会主动去点它。0 命中不代表
 * 接线坏了，只代表探针够不到（口径同 §8.19 甲申四立场：城破殉城由钉卡单测覆盖）。
 * 这里不靠随机碰运气：直接把存档 currentEvent 设成这张前奏卡（引擎读档原样恢复），
 * 喂满门槛，点下去，断言三票各自的去向。
 *
 * c2 走的是 special.endingId 当场收笔分支（useGameEngine:1847）——它**绕过目标格的
 * 全部条件**：《战死沙场》要 体质≤8，而 c2 只 体质-20（70→50），远不够；若没有这条
 * 绕过、改等月份边界判定，这一守根本结不进战死沙场。所以本用例同时是那段绕过的钉子：
 * 断言结案时 体质 仍 >8，证明它是被 endingId 直接收走，而非条件命中。
 *
 * c1/c3 不结案：边界判定读的是**抉择前**的 flags（松锦未决 仍在），《边关大将》的
 * notHas 松锦未决 把它按住；且 武略 50<70 也够不到大将门槛。故 currentEvent 仍停在
 * 本拍，isGameOver=false。c1 落「增援松锦」并释放临时坝，c3 再交还「边关任职」退出本链。
 */

const BEAT = 'route_songjin_decision'
const card = (id: string) => initialEvents.find(e => e.id === id)!
const choiceOf = (cardId: string, choiceId: string) =>
  card(cardId).choices!.find(c => c.id === choiceId)!

/** 1639/8 的边关链玩家：身上挂着第二拍写下的临时坝 松锦未决 + 一张军票 随军出征。 */
function makeBorderSave(overrides: Partial<SaveData> = {}): SaveData {
  return makeSaveData({
    character: makeCharacter({
      origin: '军户' as OriginType,
      age: 40,
      // 体质 70：c2 后 50，仍远高于《战死沙场》的 ≤8 门 —— 用来证明绕过生效。
      // 武略 50：c1 后 60，仍低于《边关大将》的 ≥70 门 —— c1/c3 不该被大将吸收。
      attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 70 },
      hidden: { 道德值: 65, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
      flags: ['地方官任职', '边关任职', '松锦未决', '随军出征']
    }),
    gameState: makeGameState({
      currentYear: 1639, currentMonth: 8, turn: 139,
      圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 40
    }),
    eventHistory: [],
    currentEvent: card(BEAT),
    pendingEvents: [],
    ...overrides
  })
}

describe('松锦决：第三拍三票各有去向，c2 当场收笔《战死沙场》', () => {
  it('c2 的 endingId 落在引擎能收笔的结局表里（写错 id 会静默回落成用当前卡收笔）', () => {
    const ids = new Set(allEndingEvents.map(e => e.id))
    expect(ids.has('ending_died_battlefield'), 'ending_died_battlefield 不在结局表里').toBe(true)
    expect(ids.has('ending_border_general'), 'ending_border_general 不在结局表里').toBe(true)
    expect(choiceOf(BEAT, 'c2').effects.special?.endingId).toBe('ending_died_battlefield')
  })

  it('c2 死守松山：点下去立刻结进《战死沙场》，且是绕过条件收的（体质仍 >8）', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeBorderSave() })
    await flush()
    expect(result.current.currentEvent?.id, '读档没有把这张前奏卡恢复成 currentEvent').toBe(BEAT)
    expect(result.current.isGameOver, '还没点选就不该结案').toBe(false)

    await act(async () => {
      result.current.handleChoice(choiceOf(BEAT, 'c2'))
    })
    await flush()

    expect(result.current.isGameOver, 'c2 没有当场结案 —— 又落回等边界判定的老路').toBe(true)
    expect(
      result.current.currentEvent?.id,
      '结进的格子不对：应当是《战死沙场》ending_died_battlefield'
    ).toBe('ending_died_battlefield')
    expect(
      result.current.character.attributes.体质,
      '体质 70-20=50 仍 >8：证明这一格是被 special.endingId 直接收走，而非命中《战死沙场》的 体质≤8 门'
    ).toBeGreaterThan(8)
    expect(
      result.current.character.flags,
      '临时坝没释放 —— c2 应当 remove 松锦未决'
    ).not.toContain('松锦未决')
    expect(result.current.pendingEvents, '结案后本月队列必须清空（否则「继续」会拿普通卡盖掉结局屏）').toEqual([])
  })

  it('c1 增援松锦：不结案，落「增援松锦」并释放临时坝，仍停在本拍', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeBorderSave() })
    await flush()

    await act(async () => {
      result.current.handleChoice(choiceOf(BEAT, 'c1'))
    })
    await flush()

    expect(result.current.isGameOver, 'c1 不该结案 —— 它是续链票，不是收笔票').toBe(false)
    expect(result.current.currentEvent?.id, 'c1 后应当仍停在本拍，而不是被某格结局吸收').toBe(BEAT)
    expect(result.current.character.flags, 'c1 应当 add 增援松锦（《边关大将》any 票之一）').toContain('增援松锦')
    expect(result.current.character.flags, 'c1 应当 remove 松锦未决（释放临时坝）').not.toContain('松锦未决')
  })

  it('c3 撤守入关：不结案，释放临时坝并交还「边关任职」退出本链', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeBorderSave() })
    await flush()

    await act(async () => {
      result.current.handleChoice(choiceOf(BEAT, 'c3'))
    })
    await flush()

    expect(result.current.isGameOver, 'c3 不该结案 —— 它是退出票').toBe(false)
    expect(result.current.currentEvent?.id, 'c3 后应当仍停在本拍').toBe(BEAT)
    expect(result.current.character.flags, 'c3 应当 remove 松锦未决').not.toContain('松锦未决')
    expect(result.current.character.flags, 'c3 应当 remove 边关任职（交还军职，松锦链到此退出）').not.toContain('边关任职')
  })
})