import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeProps,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import type { GameEvent } from '../../src/types/event'

/**
 * 缺陷 K-4：升迁/贬官判定的 effect 依赖数组不完整。
 *
 * 判定 effect（`checkPromotion` / `checkDemotion` 那一段）读取了
 * `character.attributes.体质`、`character.hidden.野心值`、`character.degree`，
 * 但依赖数组里一个都没有。后果是：这些字段变化时判定不会重跑，
 * 「体弱多病」「结党营私」这类贬官理由实际上永远触发不了，
 * 除非玩家同时改动了别的**在依赖数组里**的字段来"顺带"触发一次。
 *
 * 这两个用例故意只改「缺失的依赖」本身，其他字段一律不动，
 * 因此它们在没有修好依赖数组之前必然失败。
 */

/**
 * 官阶必须与政绩分自洽。
 *
 * `checkDemotion` 的**第一条**理由就是「政绩分 < 当前官阶所需分」，所以如果随手给一个
 * 高官阶，挂载瞬间就会被贬——那样测的就不是依赖数组，而是这条规则。
 * 下面这组属性算出的政绩分是 452（280 基础 + 60 进士 + 理政/文韬/武略加成），
 * 而「正六品·同知」的门槛是 390、下一档「从五品·知州」是 460，
 * 因此 452 恰好落在同知这一档：不触发官阶不匹配，但 severity-2 的贬官仍会真的降级
 * （rankIndexForScore(452) = 7，降 2 级 → 下标 5 = 正七品·知县，5 < 7 成立）。
 */
const CONSISTENT_RANK = '正六品·同知'

/** 高官阶 + 高政绩的存档：保证 any severity-2 的贬官理由一旦成立就真的会降级 */
function makeHighRankSave(overrides: Parameters<typeof makeCharacter>[0] = {}) {
  return makeSaveData({
    character: makeCharacter({
      rank: CONSISTENT_RANK,
      degree: '进士',
      attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: 50 },
      hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
      ...overrides
    }),
    gameState: makeGameState({ turn: AFTER_GRACE, 圣眷: 50, 民望: 50, 士绅: 50, 清议: 50 })
  })
}

/** 取最近一条贬官记录（没有则返回 undefined） */
function lastDemotion(result: { current: { lifeRecords: Array<{ type: string; title: string; description: string }> } }) {
  return [...result.current.lifeRecords].reverse().find(r => r.type === 'demotion')
}

/**
 * 贬官判定有 12 个月的宽限期（`DEMOTION_GRACE_TURNS`，与阈值结局同一原则：
 * 先让人真正上任，再让考核杀人）。本文件的用例测的是**依赖数组**，
 * 所以存档必须落在宽限期之后，否则判定的第一条分支就 return 了，用例会红得毫无信息量。
 */
const AFTER_GRACE = 12

describe('缺陷 K-4：升迁/贬官判定必须响应 体质 / 野心值 的变化', () => {
  it('体质跌破 15 时应触发「体弱多病」贬官（该字段此前不在依赖数组里）', async () => {
    const healthy = makeHighRankSave({ attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: 50 } })
    const frail = makeHighRankSave({ attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: 10 } })

    const { result, rerender } = renderGameEngine({ loadSaveData: healthy })
    await flush()

    // 前提：健康状态下不该已经贬官，否则后面的对比说明不了问题
    expect(result.current.character.demotionCount).toBe(0)
    expect(lastDemotion(result)).toBeUndefined()

    // 引擎不卸载，只把体质改到阈值以下
    rerender(makeProps({ loadSaveData: frail }))
    await flush()

    expect(result.current.character.demotionCount).toBe(1)
    const record = lastDemotion(result)
    expect(record).toBeDefined()
    expect(record?.description).toContain('体弱多病')
  })

  it('野心值冲破 70 且圣眷低于 40 时应触发「结党营私」贬官（该字段此前不在依赖数组里）', async () => {
    // 圣眷 35（< 40）且不满足其他任何贬官理由：
    //   圣眷 < 30 不成立 → 「办事不力」不会误触发
    //   圣眷 < 10 不成立 → 「帝心尽失」不会误触发
    //   士绅 50 不 > 75 → 「得罪权贵」不会误触发
    //   民望 50 不 < 20 → 「言辞失当」不会误触发
    //   国势 75 不 < 25  → 「失职渎职」不会误触发
    // 圣眷 35 时政绩分为 438（452 - 15×0.9），仍 ≥ 390，因此官阶不匹配也不会触发
    const loyal = makeSaveData({
      character: makeCharacter({
        rank: CONSISTENT_RANK,
        degree: '进士',
        attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: 50 },
        hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
      }),
      gameState: makeGameState({ turn: AFTER_GRACE, 圣眷: 35, 民望: 50, 士绅: 50, 清议: 50 })
    })
    const ambitious = makeSaveData({
      character: makeCharacter({
        rank: CONSISTENT_RANK,
        degree: '进士',
        attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: 50 },
        hidden: { 道德值: 50, 欲望值: 50, 野心值: 80, 机敏值: 50, 忠诚值: 50 }
      }),
      gameState: makeGameState({ turn: AFTER_GRACE, 圣眷: 35, 民望: 50, 士绅: 50, 清议: 50 })
    })

    const { result, rerender } = renderGameEngine({ loadSaveData: loyal })
    await flush()

    expect(result.current.character.demotionCount).toBe(0)
    expect(lastDemotion(result)).toBeUndefined()

    rerender(makeProps({ loadSaveData: ambitious }))
    await flush()

    expect(result.current.character.demotionCount).toBe(1)
    const record = lastDemotion(result)
    expect(record).toBeDefined()
    expect(record?.description).toContain('结党营私')
  })

  it('官阶已落到目标档位后，再次判定不应重复记为一次贬官', async () => {
    // 写 K-4 测试时顺带发现的缺陷：
    // checkDemotion 用「政绩分推导出的档位」当基准算目标官阶，而目标官阶只取决于分数。
    // 于是当某条理由持续成立（体质长期低于 15）时，每次判定都算出同一个目标官阶；
    // 官阶其实并没有再降，但 demotionCount 会一次次 +1、「贬官一级」的生平记录一条条堆积。
    // 现实里依赖项（圣眷/民望/国势…）几乎每月都在变，所以这个级联是会真的发生的。
    //
    // 触发器的选择说明：这个场景只能在同一局内复现——读档会把官阶强制归一化到与
    // 政绩分一致的档位，所以换存档构造不出来。这里改为让玩家对一个合成事件做一次选择，
    // 只改 gameState.中官：它在依赖数组里，却**不参与** calculateMeritScore，
    // 因此只会精确触发一次重判定，不会顺带改变政绩分或官阶。
    const choice = {
      id: 'c1',
      text: '去打点一下宫里',
      effects: { gameState: { 中官: 10 } },
      result: { echo: '' }
    }
    const syntheticEvent: GameEvent = {
      id: 'test_choice_event',
      title: '测试事件',
      description: '',
      conditions: {},
      type: 'normal',
      choices: [choice]
    }

    const save = makeSaveData({
      character: makeCharacter({
        rank: CONSISTENT_RANK,
        degree: '进士',
        attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: 10 },
        hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
      }),
      gameState: makeGameState({ turn: AFTER_GRACE, 圣眷: 50, 民望: 50, 士绅: 50, 清议: 50 }),
      currentEvent: syntheticEvent,
      currentEventId: syntheticEvent.id
    })

    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()

    // 第一次贬官成立：下标 7（正六品·同知）→ 7-2 = 5（正七品·知县）
    expect(result.current.character.demotionCount).toBe(1)
    expect(result.current.character.rank).toBe('正七品·知县')

    // 玩家做一次选择，改变了一个依赖项（中官 50 → 60），判定因此重跑。
    // 此时官阶已在下标 5，本次算出的目标档位同样是下标 5，不构成降级。
    await act(async () => {
      result.current.handleChoice(choice)
    })
    await flush(30)

    expect(result.current.character.demotionCount).toBe(1)
    expect(result.current.character.rank).toBe('正七品·知县')
    expect(result.current.lifeRecords.filter(r => r.type === 'demotion')).toHaveLength(1)
  })
})
