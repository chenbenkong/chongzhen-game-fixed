import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { initialEvents } from '../../src/data/events'
import { allEndingEvents } from '../../src/data/events/ending'
import type { OriginType } from '../../src/types/game'

/**
 * 甲申终局分支：那一票**当场定论**，不等月份推进的边界判定。
 *
 * 为什么需要这条用例：1644 的四个立场（死守九门 / 守节不仕 / 开城投降 / 诈降反戈）
 * 排在《闯军围京》《煤山殉国》这些卡上，而同一批玩家身上往往还挂着前奏写下的
 * `殉国报君`。若只落 flag、等五月边界判定，《殉国死节》(priority 更小) 会先把人收走 ——
 * 玩家明明选了"降顺"或"守节"，图鉴上亮的却是"殉国"。`p1.1644stance` 探针量到的
 * 孤儿立场就是这个形状。修法是给这四票加 `special.endingId`，引擎在 handleChoice 里
 * 当场把 currentEvent 换成目标格并结案（useGameEngine 的 special-ending 分支）。
 *
 * 探针是固定网格（八出身 × 五画像 × 3 种子），它的策略不会主动去点这些窄门选项，
 * 所以探针里这四类仍是 0 命中 —— 那不代表接线坏了， broader 模拟里
 * 降顺仕贼 / 遗民守节 / 南渡续祚 都已经真结过案。这里不靠随机碰运气：
 * 直接把存档的 currentEvent 设成那张历史卡（引擎读档原样恢复 currentEvent），
 * 喂满选项门槛，点下去，断言**立刻**结进指定的那一格。
 *
 * 四票共用同一段引擎分支，所以这条用例同时是那段分支的回归钉：
 * 谁把 endingId 解析删了、或把清队列那两行挪走，这里就会红。
 */

const card = (id: string) => initialEvents.find(e => e.id === id)!
const choiceOf = (cardId: string, choiceId: string) =>
  card(cardId).choices!.find(c => c.id === choiceId)!

/** 每一票：卡 / 选项 / 出身 / 要喂满的门槛 / 应当当场收进的那一格 / 落下的立场票 */
const CASES = [
  {
    label: '死守九门 → 城破殉城',
    cardId: 'historical_037', choiceId: 'c1', origin: '缙绅' as OriginType,
    attrs: { 体质: 75, 武略: 65 }, hidden: {},
    endingId: 'ending_city_fall', stanceFlag: '守城殉国'
  },
  {
    label: '守节不仕 → 遗民守节',
    cardId: 'historical_038', choiceId: 'c2', origin: '缙绅' as OriginType,
    attrs: {}, hidden: { 道德值: 60 },
    endingId: 'ending_ming_loyalist', stanceFlag: '遗民'
  },
  {
    label: '开城投降 → 降顺仕贼',
    cardId: 'historical_017', choiceId: 'c3', origin: '寒门' as OriginType,
    attrs: {}, hidden: { 道德值: 20 },
    endingId: 'ending_shun_collaborator', stanceFlag: '投降大顺'
  },
  {
    label: '诈降反戈 → 南渡续祚',
    cardId: 'historical_016', choiceId: 'c2', origin: '缙绅' as OriginType,
    attrs: { 武略: 80, 理政: 75 }, hidden: {},
    endingId: 'ending_southern_ming', stanceFlag: '南渡长江'
  }
]

describe('甲申终局：四个立场各有一格，且那一票当场收笔', () => {
  it('四个 endingId 都落在引擎能收笔的结局表里（写错 id 会静默回落成用当前卡收笔）', () => {
    const ids = new Set(allEndingEvents.map(e => e.id))
    const dangling = CASES.filter(c => !ids.has(c.endingId)).map(c => `${c.label}: ${c.endingId}`)
    expect(dangling, '这些 endingId 不在 endings_all 里 —— 引擎 find 不到会回落成当前卡，玩家这一票定不了论').toEqual([])
  })

  it('四票都不该被《殉国死节》吸收 —— 它们各有自己的格子', () => {
    expect(CASES.every(c => c.endingId !== 'ending_martyr_nation')).toBe(true)
  })

  for (const c of CASES) {
    it(`${c.label}：点下去立刻结案，currentEvent 就是那一格`, async () => {
      const save = makeSaveData({
        character: makeCharacter({
          origin: c.origin,
          age: 40,
          attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 50, ...c.attrs },
          hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50, ...c.hidden },
          // 身上先挂着前奏写下的 殉国报君 —— 正是会被《殉国死节》抢先收走的那种状态。
          // 当场收笔必须盖过它：若引擎仍走边界判定，这一票会被 p 更小的殉国格抢走。
          flags: ['地方官任职', '殉国报君']
        }),
        gameState: makeGameState({
          currentYear: 1644, currentMonth: 3, turn: 182,
          圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 40
        }),
        eventHistory: [],
        currentEvent: card(c.cardId),
        pendingEvents: []
      })

      const { result } = renderGameEngine({ loadSaveData: save })
      await flush()
      expect(result.current.currentEvent?.id, '读档没有把这张历史卡恢复成 currentEvent').toBe(c.cardId)
      expect(result.current.isGameOver, '还没点选就不该结案').toBe(false)

      await act(async () => {
        result.current.handleChoice(choiceOf(c.cardId, c.choiceId))
      })
      await flush()

      expect(result.current.isGameOver, '这一票没有当场结案 —— 又落回等边界判定的老路').toBe(true)
      expect(
        result.current.currentEvent?.id,
        `结进的格子不对：应当是《${c.endingId}》，而不是被殉国报君引去别格`
      ).toBe(c.endingId)
      expect(
        result.current.character.flags,
        '立场票没落账 —— 结案读到的 flags 里应当有这一票写下的那段经历'
      ).toContain(c.stanceFlag)
      // 清掉了本月待处理队列：否则「继续」会拿普通卡盖掉结局屏（与降临型结局对齐）。
      expect(result.current.pendingEvents, '结案后本月队列必须清空').toEqual([])
    })
  }
})