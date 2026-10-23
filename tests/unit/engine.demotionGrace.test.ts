import { describe, expect, it } from 'vitest'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { zeroWarnFlag } from '../../src/data/zeroWarningEvents'
import { EXILE_ENDING_ID } from '../../src/data/events/ending/endingsDemotion'
import { ENDING_TILE_IDS } from '../../src/data/endingRegistry'

/**
 * 第十四轮实测到的两个「考核杀人太急」的缺陷，以及各自的护栏。
 *
 * 背景：整局模拟（N=100，随机玩法）跑出 `ending_demotion` 占 49%、平均局长 10.2 个月，
 * 终局道德值均值 13 —— 一半的玩家在没看清规则之前就被考核收尾了。查下来是两条：
 *
 *   K-14a **贬官判定没有宽限期。**
 *     阈值结局那条线早就有 `THRESHOLD_ENDING_GRACE_TURNS = 12`（归零在前 12 个月不判死），
 *     但 `checkDemotion` 直接读当前数值，于是"开局就满足判据"这件事是真实存在的：
 *     「办事不力」= `圣眷<30 且 理政<40`，而四个出身里有三个（寒门 20/30、
 *     没落世家 20/25、诗文清望 25/28）**上任第一天就同时成立**。
 *
 *   K-14b **道德归零有两条判死通路，其中一条绕过警告。**
 *     `boundaryEvents` 的 moral_degeneracy 要求身上已有 `归零警告·道德值`（同一维度
 *     归零两次才要命），而 `checkDemotion` 里 severity 3 的「道德败坏」只看 `<= 0`，
 *     当场革职。于是那条精心做过的"先警告、再给回天之路"的规则，在同一维度上被
 *     另一条通路作废了 —— 玩家死在自己没见过的判据上。
 *
 * 这两条用例是成对写的：各自先把"应当不死"的情形钉住，再钉"仍然会死"的情形，
 * 所以把宽限期删掉、或者把道德那条重新改成不问警告，都会红其中一条。
 */

/** 与政绩分自洽的官阶：452 分落在「正六品·同知」档，不会因官阶不匹配被贬 */
const CONSISTENT_RANK = '正六品·同知'

function saveFor(opts: {
  turn: number
  体质?: number
  道德值?: number
  flags?: string[]
  圣眷?: number
}) {
  return makeSaveData({
    character: makeCharacter({
      rank: CONSISTENT_RANK,
      degree: '进士',
      attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: opts.体质 ?? 50 },
      hidden: { 道德值: opts.道德值 ?? 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
      flags: opts.flags ?? ['地方官任职']
    }),
    gameState: makeGameState({ turn: opts.turn, 圣眷: opts.圣眷 ?? 50, 民望: 50, 士绅: 50, 清议: 50 })
  })
}

describe('K-14a：贬官判定必须有 12 个月宽限期', () => {
  it('宽限期内即便「体弱多病」成立也不记贬官 —— 上任头一年不该就被考核收尾', async () => {
    const { result } = renderGameEngine({ loadSaveData: saveFor({ turn: 6, 体质: 10 }) })
    await flush()

    expect(result.current.character.demotionCount).toBe(0)
    expect(result.current.character.rank).toBe(CONSISTENT_RANK)
  })

  it('同一个人格过期满 12 个月后照旧被贬 —— 宽限期不是免死金牌', async () => {
    const { result } = renderGameEngine({ loadSaveData: saveFor({ turn: 12, 体质: 10 }) })
    await flush()

    expect(result.current.character.demotionCount).toBe(1)
    expect(result.current.character.rank).toBe('正七品·知县')
  })
})

describe('K-14b：道德归零的两条判死通路必须同进同退', () => {
  it('道德归零但从未收到警告 → 不革职（与 boundaryEvents 的「归零两次才要命」一致）', async () => {
    const { result } = renderGameEngine({
      loadSaveData: saveFor({ turn: 20, 道德值: 0, 圣眷: 50 })
    })
    await flush()

    expect(
      result.current.character.flags,
      '前提：这一份存档身上没有归零警告 flag'
    ).not.toContain(zeroWarnFlag('道德值'))
    expect(result.current.isGameOver).toBe(false)
    expect(result.current.identityType).toBe('official')
  })

  it('已经被警告过又归零 → severity 3 革职，走 handleGameOver 落到已注册的结局格子上', async () => {
    const { result } = renderGameEngine({
      loadSaveData: saveFor({ turn: 20, 道德值: -5, 圣眷: 50, flags: [zeroWarnFlag('道德值')] })
    })
    await flush()

    expect(result.current.isGameOver).toBe(true)
    expect(result.current.identityType).toBe('exiled')
    /**
     * 革职在第十五轮之前两支共用 `ending_demotion` 一个 id（图鉴只有一格、Steam 成就上限已满）。
     * 第五十二轮上限解除后拆成两格：`newIdentity === 'exiled'` 的 severity 3 走押解宁古塔那支，
     * 所以这里钉的是 `ending_exile`，同时钉它真在图鉴注册表里 ——
     * 这一格从前只内联在引擎里，成就判据永远够不着。
     */
    expect(result.current.eventHistory).toContain(EXILE_ENDING_ID)
    expect(ENDING_TILE_IDS, '引擎写的流放 id 必须在图鉴里有一格').toContain(EXILE_ENDING_ID)
  })
})
