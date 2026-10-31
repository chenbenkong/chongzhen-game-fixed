import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { lastChanceThisMonth } from '../../src/utils/eventConditions'
import { simulateRun, type SimPolicy } from './helpers/simulate'
import { allEvents } from '../../scripts/event-pools'
import { DECLINABLE_ENDING_IDS } from '../../src/data/endingDecline'
import type { GameEvent } from '../../src/types/event'

/**
 * 第七十五轮：单月过渡卡被历史卡整类饿死（§1.4 52）。
 *
 * 选择器按 historical → transition 分层，一年十几张历史卡几乎月月不断档，
 * 于是「只开一个月」的过渡卡从来轮不到自己那一月。240 局实测 483 张事件里
 * 129 张从未播出，过渡卡独占 75 张 —— 其中 50 张的月窗只有一格。
 * 1628-11 就是最干净的样本：历史卡《阉党覆灭》开 11–12 月，
 * 《冬至祭天》只开 11 月，后者的唯一机会被前者整月占死，240 局 0 次。
 *
 * 修法与第五十七轮的前奏同一条：过了这个月就再也见不到的卡，
 * 当月**额外**占一个发牌位，历史卡照发 —— 不是拆门槛，也不是改动分层顺序。
 */

const LAST_CHANCE = 'transition_007' // 冬至祭天：1628-11
const NEXT_LAST_CHANCE = 'transition_008' // 年终总结：1628-12
// 1628-11 的历史卡是《阉党覆灭》（1628 年 11–12 月）。weightedPick 按 type 层挑，
// 断言按 type 判，不钉死具体 id —— 以后再加同月历史卡也不会把这条钉弄倒。
const isHistoricalCard = (e: { type: string; id: string } | null | undefined) =>
  e?.type === 'historical' || e?.type === 'chain'

function makeAutumnSave(year: number, month: number, turn: number, eventHistory: string[] = []) {
  return makeSaveData({
    character: makeCharacter(),
    gameState: makeGameState({
      currentYear: year,
      currentMonth: month,
      turn,
      圣眷: 50,
      中官: 50,
      清议: 50,
      士绅: 50,
      民望: 50,
      国势: 75
    }),
    eventHistory
  })
}

async function advanceOneMonth(save: ReturnType<typeof makeAutumnSave>) {
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
  const { result } = renderGameEngine({ loadSaveData: save })
  await flush()
  await act(async () => {
    result.current.handleNextMonth()
  })
  await flush(600)
  return { result, randomSpy }
}

describe('第七十五轮：最后一次开窗的过渡卡不许被历史卡挤掉', () => {
  it('1628-11：《阉党覆灭》仍排第一，《冬至祭天》在同一个月的队列里', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeAutumnSave(1628, 10, 9))
    try {
      expect(result.current.gameState.currentMonth, '这一步没落到 1628-11 —— 月窗无从判起').toBe(11)
      expect(
        isHistoricalCard(result.current.currentEvent),
        '主戏被末班车顶掉了 —— 这条规则只许追加，不许换人'
      ).toBe(true)
      expect(
        [result.current.currentEvent, ...result.current.pendingEvents].map(e => e?.id),
        '《冬至祭天》这辈子只有这一个月，却没进当月队列'
      ).toContain(LAST_CHANCE)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('翻页翻得到《冬至祭天》，且它排在当月历史卡之后', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeAutumnSave(1628, 10, 9))
    try {
      const queued = [result.current.currentEvent, ...result.current.pendingEvents].map(e => e?.id)
      expect(isHistoricalCard(result.current.currentEvent), '历史卡应该先演').toBe(true)
      expect(
        queued.indexOf(LAST_CHANCE),
        '《冬至祭天》要排在历史卡之后 —— 它是补票，不是主戏'
      ).toBeGreaterThan(0)

      let reached = false
      for (let i = 0; i < 5 && result.current.currentEvent; i++) {
        if (result.current.currentEvent.id === LAST_CHANCE) {
          reached = true
          break
        }
        await act(async () => {
          result.current.handleContinue()
        })
        await flush()
      }
      expect(reached, '连续「继续」也翻不到《冬至祭天》—— 队列里的卡没被演到').toBe(true)
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('1628-12：《年终总结》同样拿到自己的位子，且已经过期的《冬至祭天》不许复活', async () => {
    const { result, randomSpy } = await advanceOneMonth(makeAutumnSave(1628, 11, 10))
    try {
      expect(result.current.gameState.currentMonth).toBe(12)
      const queued = [result.current.currentEvent, ...result.current.pendingEvents].map(e => e?.id)
      expect(queued, '12 月的单月卡同样没有第二年').toContain(NEXT_LAST_CHANCE)
      expect(queued, '《冬至祭天》的月窗已经关了，不许被这条规则捞回来').not.toContain(LAST_CHANCE)
    } finally {
      randomSpy.mockRestore()
    }
  })

  /**
   * 机制棘轮：不数"播了多少张"，而是逐局复算「这一格它到底开没开」。
   *
   * 只看条件里**只有时间键（和出身）**的过渡卡 —— 它们的开窗与玩家数值无关，
   * 走到那一格就必然可用；带属性/flags 门的卡不在这里量（状态月中会变，轨迹不是月初快照）。
   * 再排除 22 张「四个选项全带门槛」的卡：那种卡本来就可能因为全锁而整张不发，
   * 是另一条规则（`hasOpenChoice`）在管，不归这一条。
   *
   * 判据：某局活过了这张卡的最后窗口月 → 这张卡必须**发到过手里**（`dealtEventIds`）。
   *
   * 这里钉的是发牌，不是播放：`handleChoice` 触发边界结局时会把当月剩下的
   * `pendingEvents` 整批清空（§1.4 ㉛），所以"没播"分不清是规则截胡还是没发。
   * 发牌记录里没有它，才是这张卡真的没拿到位子。
   *
   * 唯一保留的豁免是「那个月整月被边界卡截走」——`handleNextMonth` 的
   * `checkBoundary()` 命中即 return，本月普通事件根本不下发；那是引擎的另一条既有规则。
   *
   * 第七十六轮把这层豁免收窄：只有**降临型**结局（结了就不再有下个月）与危机警告
   * 能整批吃掉当月发牌。带【搁笔】的请笔卡不算 —— 玩家拒绝之后照样继续做官，
   * 下个月不是白捡的，凭什么把这一月的历史卡和末班车一起吞掉。
   * 实测 1640-02/03/04 三格就是被这串请笔卡整月吃掉：144 局里有 24 局活过第 140 格，
   * 而 139–142 四张卡的**发牌**记录是 27/0/0/0 —— 后三张不是没走到，是被请笔卡整月吞了。
   */
  it('样本里真的走到了最后窗口的过渡卡，一局都不许漏', async () => {
    const POLICIES: SimPolicy[] = ['warden', 'steady', 'ordinary', 'first', 'ambitious', 'random']
    const RUNS = 24
    const TIME_KEYS = new Set(['year', 'month', 'turn', 'origin'])
    const hasUngatedChoice = (e: GameEvent) =>
      (e.choices ?? []).some(c => !c.showConditions || Object.keys(c.showConditions).length === 0)

    const uniq = new Map<string, GameEvent>()
    for (const e of allEvents as GameEvent[]) if (e?.id && !uniq.has(e.id)) uniq.set(e.id, e)
    const ENDING_IDS = new Set(
      [...uniq.values()]
        .filter(e => e.type === 'ending' && !DECLINABLE_ENDING_IDS.includes(e.id))
        .map(e => e.id)
    )
    const cards = [...uniq.values()].filter(e => {
      if (e.type !== 'transition' || !hasUngatedChoice(e)) return false
      const keys = Object.keys(e.conditions ?? {})
      if (keys.length === 0 || !keys.every(k => TIME_KEYS.has(k))) return false
      if (e.conditions?.year?.max === undefined) return false
      const origin = e.conditions?.origin
      return !origin || (Array.isArray(origin) ? origin : [origin]).includes('寒门')
    })

    const lastTurnOf = (e: GameEvent) => {
      const c = e.conditions!
      const calendar = (c.year!.max! - 1628) * 12 + ((c.month?.max ?? 12) - 1)
      return c.turn?.max !== undefined ? Math.min(calendar, c.turn.max) : calendar
    }

    const runs = []
    for (let i = 0; i < RUNS; i++) {
      runs.push(await simulateRun({ seed: 9700 + i, policy: POLICIES[i % POLICIES.length], maxMonths: 300 }))
    }

    const violations: string[] = []
    let checkedPairs = 0
    for (const card of cards) {
      const lastTurn = lastTurnOf(card)
      for (const run of runs) {
        if (run.error || run.months <= lastTurn) continue
        // 整月被边界卡截走（handleNextMonth 的 checkBoundary 命中即 return）：
        // 只有降临型结局（`ending_*` 里去掉请笔那一批）和危机警告有资格整月截走发牌。
        const cutByBoundary = run.firedTurns.some(
          (t, i) =>
            t === lastTurn &&
            (run.firedEventIds[i].startsWith('boundary_') || ENDING_IDS.has(run.firedEventIds[i]))
        )
        if (cutByBoundary) continue
        checkedPairs++
        if (!run.dealtEventIds.includes(card.id)) {
          const ate = run.firedEventIds
            .filter((_, i) => run.firedTurns[i] === lastTurn)
            .join(',')
          violations.push(
            `${card.id}「${card.title}」最后窗口第 ${lastTurn} 格：seed=${run.seed}/${run.policy} 活到了 ${run.months} 格，却没发到手（当月已演：${ate || '空'}）`
          )
        }
      }
    }

    expect(checkedPairs, '一张卡都没走到，这条棘轮等于空转').toBeGreaterThan(40)
    expect(violations, `共 ${violations.length} 处：\n${violations.slice(0, 10).join('\n')}`).toEqual([])
  }, 300000)

  it('这条规则只认「年窗也在今年关上」—— 每年重来的节令卡不算最后机会', async () => {
    const state = (year: number, month: number, turn: number) =>
      makeGameState({ currentYear: year, currentMonth: month, turn })
    const ev = (conditions: GameEvent['conditions']) => ({ id: 'probe', conditions }) as GameEvent

    // 年窗 + 月窗同在今年关上
    expect(lastChanceThisMonth(ev({ year: { min: 1628, max: 1628 }, month: { min: 11, max: 11 } }), state(1628, 11, 10))).toBe(true)
    // 同一个月窗，但明年还会再来 —— 不是最后机会
    expect(lastChanceThisMonth(ev({ month: { min: 11, max: 11 } }), state(1640, 11, 150))).toBe(false)
    // 只写年窗：12 月才是它的最后一次（跨年那一步出窗）
    const yearOnly = ev({ year: { min: 1628, max: 1632 } })
    expect(lastChanceThisMonth(yearOnly, state(1632, 11, 59))).toBe(false)
    expect(lastChanceThisMonth(yearOnly, state(1632, 12, 60))).toBe(true)
    // 月窗跨年回绕：年窗最后一年、月窗只到 12 月，12 月这一格要算
    expect(lastChanceThisMonth(ev({ year: { min: 1628, max: 1631 }, month: { min: 12, max: 12 } }), state(1631, 12, 47))).toBe(true)
    // turn 窗
    expect(lastChanceThisMonth(ev({ turn: { max: 20 } }), state(1630, 1, 20))).toBe(true)
    expect(lastChanceThisMonth(ev({ turn: { max: 20 } }), state(1630, 1, 19))).toBe(false)
  })
})