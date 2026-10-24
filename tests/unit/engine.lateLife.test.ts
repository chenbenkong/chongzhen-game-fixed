import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import { initialEvents, allGrayChoiceEvents } from '../../src/data/events'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { checkChoiceRequirement, hasOpenChoice } from '../../src/utils/choiceRequirements'
import { endingAchievementIdOf, resolveEndingTileId } from '../../src/data/endingRegistry'
import type { Character, GameStateValues } from '../../src/types/game'

/**
 * 第五十九轮：中晚年的空跑。
 *
 * 实测（seed 6 / warden / 寒门，1644 年 46.7 岁收笔前唯一活过 1644 的一局）：
 * 1644-05 到 1645-08 播了 18 张卡，之后 **276 个月一张也没有**，
 * 直到 1669 年年满七十被《寿终正寝》收走。
 *
 * 两处成因，分别钉在下面：
 *  1. `withCooldown` 的**条目距离**闸。空月里 `eventHistory` 不再增长，
 *     条目距离永远停在 1~6，而月份距离已经 36~48 ——
 *     1649-08 那一个月 `available` 25 条、`findAllEventsForState` 返回 0。
 *     这是一台"越安静越锁死"的机器，不是内容不够。
 *  2. 内容侧没有一张写给中晚年的卡：年窗全部在 1645 之前关完，
 *     没有年窗的 56 条灰卡又全被上面的闸锁住，玩家在 1645 之后看不到任何"人老了"的故事。
 *
 * 钉法：
 *  · 第一组用**读档**复现冻结尾巴 —— 历史最后五条就是当时开得出来的全部灰卡，
 *    月份记录为空（读档本来就没有 `lastTurnById`）。
 *  · 第二组钉内容：中晚年必须存在按**年岁**开门（不是按公元年）的灰卡。
 *  · 第三组钉致仕的收笔解析：新卡走 `special.type='ending'`，
 *    但结局格子必须还是图鉴里的《致仕善终》，成就名不能被别名改掉。
 *  · 第四组钉玩家看得见的结果：同一个存档推进十步，历史必须继续增长。
 */

const ALL_EVENTS = [...initialEvents, ...allGrayChoiceEvents]

/** 1649-08 —— 空跑段的正中间 */
const LATE_STATE: GameStateValues = makeGameState({
  currentYear: 1649,
  currentMonth: 8,
  turn: 259,
  圣眷: 50,
  中官: 50,
  清议: 50,
  士绅: 50,
  民望: 50,
  国势: 40
})

/** 穷而且平庸的中晚年官员：当时开得出来的灰卡只有一小把，正好能全塞进冻结尾巴 */
function poorLateCharacter(): Character {
  return makeCharacter({
    age: 40,
    rank: '正四品·知府',
    attributes: { 财帛: 5, 文韬: 20, 理政: 22, 武略: 10, 体质: 40 }
  })
}

function eligibleGrayIds(character: Character, state: GameStateValues): string[] {
  return ALL_EVENTS.filter(e => e.type === 'gray')
    .filter(e => checkEventConditions(e, character, state))
    .filter(e => hasOpenChoice(e, character, state))
    .map(e => e.id)
}

/** 灰卡里开门靠「年岁」而不是公元年的那一批 —— 中晚年内容的唯一正确写法 */
function ageGatedGray(character: Character, state: GameStateValues) {
  return ALL_EVENTS.filter(e => e.type === 'gray')
    .filter(e => typeof e.conditions?.age?.min === 'number' && (e.conditions!.age!.min as number) >= 46)
    .filter(e => checkEventConditions(e, character, state))
    .filter(e => hasOpenChoice(e, character, state))
}

const RETIRE_EVENT_ID = 'gray_late_retire'

describe('第五十九轮：中晚年不许再空跑', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('读档时历史里有卡、月份记录为空，条目距离不得把它永久锁死', async () => {
    const character = poorLateCharacter()
    const frozen = eligibleGrayIds(character, LATE_STATE)

    // 前提：这个画像在 1649-08 开得出来的灰卡少到能全部塞进「最近六条」里。
    // 若某天这条前提不再成立，说明引擎已经不再靠条目距离判冷却 —— 那时该重写这一组。
    expect(frozen.length).toBeGreaterThan(0)
    expect(frozen.length, '冻结尾巴的前提：全部开得出来的灰卡必须不超过 6 条').toBeLessThanOrEqual(6)

    const save = makeSaveData({
      character,
      gameState: LATE_STATE,
      eventHistory: frozen
    })

    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()

    const picked = result.current.findAllEventsForState(LATE_STATE)
    expect(
      picked.map(e => e.id),
      '1649-08：开得出来的灰卡全在历史尾巴上，条目距离把它们锁死了'
    ).not.toEqual([])
    expect(picked.some(e => e.type === 'gray')).toBe(true)
  })

  it('中晚年要有按年岁开门的灰卡（不是按公元年）', async () => {
    const survivor: Character = makeCharacter({
      age: 52,
      rank: '正三品·按察使',
      attributes: { 财帛: 60, 文韬: 80, 理政: 100, 武略: 60, 体质: 60 },
      hidden: { 道德值: 70, 欲望值: 40, 野心值: 40, 机敏值: 60, 忠诚值: 70 }
    })

    const late = ageGatedGray(survivor, LATE_STATE)
    expect(late.map(e => e.id)).toContain(RETIRE_EVENT_ID)
  })

  it('中晚年的致仕收笔仍然结在《致仕善终》这一格上，成就名不被别名改掉', () => {
    // 新卡自己的 id 不是图鉴格子 —— 必须登记别名
    expect(resolveEndingTileId(RETIRE_EVENT_ID)).toBe('ending_honorable_retirement')
    expect(endingAchievementIdOf(RETIRE_EVENT_ID)).toBe('ending_honorable_retirement_done')
    // 反向保护：别名不许把这一格原本的成就名挤掉
    expect(endingAchievementIdOf('ending_honorable_retirement')).toBe(
      'ending_honorable_retirement_done'
    )
  })

  it('读档到 1649 年的老臣，两年之内会收到中晚年的请归卡', async () => {
    const survivor: Character = makeCharacter({
      age: 52,
      rank: '正三品·按察使',
      attributes: { 财帛: 25, 文韬: 70, 理政: 100, 武略: 50, 体质: 55 },
      hidden: { 道德值: 55, 欲望值: 30, 野心值: 30, 机敏值: 55, 忠诚值: 60 }
    })
    const save = makeSaveData({ character: survivor, gameState: LATE_STATE, eventHistory: [] })

    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()

    const fired: string[] = []
    // 每次「进下月」在没有事件时会连跳十二个月，所以这几十步足够覆盖一百多个月
    for (let step = 0; step < 60 && !result.current.isGameOver; step++) {
      const event = result.current.currentEvent
      if (event) {
        const choice = (event.choices || []).find(
          c => checkChoiceRequirement(c, result.current.character, result.current.gameState).available
        )
        if (choice) {
          await act(async () => {
            result.current.handleChoice(choice, { skipResignConfirm: true })
          })
          fired.push(event.id)
        }
        await act(async () => {
          result.current.handleContinue()
        })
        await flush(400)
      } else {
        const before = result.current.gameState.turn
        await act(async () => {
          result.current.handleNextMonth()
        })
        await flush(400)
        if (result.current.gameState.turn === before) break
      }
      if (result.current.gameState.turn >= LATE_STATE.turn + 24) break
    }

    expect(
      fired,
      '1649-08 起两年之内没有出现任何一张中晚年的卡 —— 这段路还是空的'
    ).toContain(RETIRE_EVENT_ID)
    // 这张卡上的第一条就是【上书乞骸骨】：选了它必须真收笔，而不是又一条普通支线
    expect(result.current.isGameOver, '选了乞骸骨却没有收笔').toBe(true)
  }, 60_000)
})
