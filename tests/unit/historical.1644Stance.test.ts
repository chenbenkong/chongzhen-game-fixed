import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { initialEvents } from '../../src/data/events'
import { hasOpenChoice } from '../../src/utils/choiceRequirements'
import type { OriginType } from '../../src/types/game'

/**
 * 第五十八轮：1644 正月/二月的两张历史卡，对一整个玩家群体整张消失。
 *
 * 第五十七轮量到 `warden/寒门/seed1` 在 1644 正月、二月的 `historical` 池是空的，
 * 当时记成「四选项全锁被 `hasOpenChoice` 滤掉」，留作本轮的数据题。
 * 根因不是门槛高低，而是**出身的分配**：
 *   《大顺建国》c1/c4 只给没落世家（c4 另加诗文清望）、c2 只给缙绅，唯一不限出身的是
 *   c3【暗中投降】，而它又只认隐藏值（道德≤30 且 野心≥30）；
 *   《宣大陷落》三选项全只给没落世家，同样只剩 c3【投降保命】的 道德≤40。
 * 于是一个高道德、低野心、属性平平的官员 —— 恰恰是「清流」玩法最常长成的样子 ——
 * 在正月读不到大顺建国，二月读不到宣大陷落：1644 的序幕在他屏幕上直接没了。
 * 存档实测（1644-01 寒门 · 六维 40 · 道德 90 · 野心 10）：两张卡 `hasOpenChoice` 全 false。
 *
 * 修法与第五十七轮《城破前夜》同一条：立场是那一夜任何人都能做的选择，不是哪个出身的内容；
 * 同时把「唯一常开门」从隐藏值上摘下来 —— 投降这扇门本来就对所有人开着。
 *
 * 两条钉子各管一半：① 引擎真的把《大顺建国》发给这个寒士；② 两张卡对**所有出身 ×
 * 三种道德/野心组合**都至少有一个可点选项（不再依赖某个隐藏值的窄窗）。
 */

const CARD_IDS = ['historical_015', 'historical_016'] as const
const ORIGINS: OriginType[] = ['寒门', '缙绅', '没落世家', '诗文清望']

const PROFILES = [
  { label: '高道德·低野心', 道德值: 90, 野心值: 10 },
  { label: '低道德·高野心', 道德值: 10, 野心值: 90 },
  { label: '中庸', 道德值: 50, 野心值: 50 }
]

const card = (id: string) => initialEvents.find(e => e.id === id)!

function ordinaryOfficial(origin: OriginType, 道德值: number, 野心值: number) {
  return makeCharacter({
    origin,
    age: 40,
    attributes: { 财帛: 40, 文韬: 40, 理政: 40, 武略: 40, 体质: 40 },
    hidden: { 道德值, 欲望值: 40, 野心值, 机敏值: 40, 忠诚值: 60 },
    flags: ['地方官任职']
  })
}

describe('第五十八轮：1644 序幕不许对整类玩家无声消失', () => {
  it('1644 正月：高道德的寒门官员读得到《大顺建国》', async () => {
    const save = makeSaveData({
      character: ordinaryOfficial('寒门', 90, 10),
      gameState: makeGameState({
        currentYear: 1643,
        currentMonth: 12,
        turn: 179,
        圣眷: 50,
        中官: 50,
        清议: 50,
        士绅: 50,
        民望: 50,
        国势: 40
      }),
      eventHistory: []
    })

    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()
    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    expect(result.current.gameState.currentMonth, '没推进到 1644 正月').toBe(1)
    expect(
      result.current.currentEvent?.id,
      '《大顺建国》被整张滤掉了 —— 这个寒士的 1644 从一张日常卡开始'
    ).toBe('historical_015')
  })

  it('两张 1644 序幕卡：所有出身 × 三种道德/野心组合，都至少有一个可点选项', () => {
    const state = { 'historical_015': [1644, 1], 'historical_016': [1644, 2] } as const
    const broken: string[] = []

    for (const id of CARD_IDS) {
      const [year, month] = state[id]
      for (const origin of ORIGINS) {
        for (const p of PROFILES) {
          const ok = hasOpenChoice(
            card(id),
            ordinaryOfficial(origin, p.道德值, p.野心值),
            makeGameState({ currentYear: year, currentMonth: month, turn: 190 })
          )
          if (!ok) broken.push(`${id}「${card(id).title}」· ${origin} · ${p.label}`)
        }
      }
    }

    expect(broken, '这些组合下整张卡会被 hasOpenChoice 永久过滤').toEqual([])
  })
})
