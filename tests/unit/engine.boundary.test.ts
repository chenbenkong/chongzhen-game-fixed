import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import { simulateRun } from './helpers/simulate'

/**
 * 缺陷 K-2：`crisis` 类临界事件只在引擎挂载时检查过一次。
 *
 * `boundaryEventManager` 里注册了 'ending' 与 'crisis' 两类临界事件。
 * 挂载 effect 两类都查（各带 0.3 的概率门），但它有一次性 ref 守卫、只跑一次；
 * 而会被反复调用的 `checkBoundary()` 只查了 'ending'。
 * 结果是：所有 crisis 事件（例如「重病缠身」）只有在玩家**开局瞬间**就已经满足条件时
 * 才可能出现，游戏中途永远触发不了 —— 成了死内容。
 *
 * 测试要点：必须把挂载阶段的随机数压到概率门之外，只在推进月份时放开。
 * 否则挂载 effect 自己就会触发 crisis，测到的还是那条本来就正常的路径。
 */

/** 政绩分 452 → 官阶「正六品·同知」自洽；体质 18 满足 crisis 条件（< 20）但不触发「体弱多病」（< 15） */
function makeSaveWithConstitution(constitution: number) {
  return makeSaveData({
    character: makeCharacter({
      rank: '正六品·同知',
      degree: '进士',
      attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 90, 体质: constitution },
      hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
    }),
    gameState: makeGameState({ 圣眷: 50, 民望: 50, 士绅: 50, 清议: 50 })
  })
}

const CRISIS_EVENT_ID = 'boundary_serious_illness'

describe('缺陷 K-2：游戏中途应能触发 crisis 类临界事件', () => {
  it('体质低于 20 时，推进月份应有机会触发「重病缠身」', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    const { result } = renderGameEngine({ loadSaveData: makeSaveWithConstitution(18) })
    await flush()

    // 前提：挂载阶段因为随机数在概率门之外，没有触发 crisis
    expect(result.current.currentEvent?.id).not.toBe(CRISIS_EVENT_ID)

    // 放开概率门，然后推进一个月
    randomSpy.mockReturnValue(0.1)
    await act(async () => {
      result.current.handleNextMonth()
    })
    // checkBoundary 是在 300ms 的 setTimeout 里调用的，要等它落地
    await flush(600)

    expect(result.current.currentEvent?.id).toBe(CRISIS_EVENT_ID)
  })

  it('体质正常时，推进月份不应凭空触发 crisis', async () => {
    // 反向守卫：确认修复没有变成"无条件触发危机事件"
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1)

    const { result } = renderGameEngine({ loadSaveData: makeSaveWithConstitution(60) })
    await flush()

    randomSpy.mockReturnValue(0.1)
    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    expect(result.current.currentEvent?.id).not.toBe(CRISIS_EVENT_ID)
  })
})

/**
 * 缺陷 K-14c：crisis 类临界事件**完全不吃冷却**。
 *
 * `EVENT_COOLDOWN_MONTHS` 的表头写的是「冷却期（月）」，但第十四轮之前这张表只管支线池。
 * crisis 路径不一样：它的条件判的是**状态**（`0 < 体质 < 20`）而不是历史，
 * 只要玩家一直病着就恒真，于是同一个「重病缠身」能在三个月里发作两遍 ——
 * 太医前一个月刚说"需静养数月"，下个月又是同一张方子。
 *
 * 实测对照（真引擎 + 假时钟 + 固定种子，见 `helpers/simulate.ts`）：
 * 修复前 seed=8 的发作月份是 **[12, 15]**（隔 3 个月，而 random 档位写的是 8）；
 * 修复后同样这局是 **[12, 24]**。
 * 24 个种子里只有 seed=8 会重发，所以它既是唯一的载体、也是反空跑的依据。
 */
const COOLDOWN_RANDOM_MONTHS = 8

const ILLNESS_SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)

describe('缺陷 K-14c：crisis 临界事件发作后要隔满冷却才能再发', () => {
  it('「重病缠身」两次发作之间至少隔 8 个月，且取样里确实重发过', async () => {
    const runs = []
    for (const seed of ILLNESS_SEEDS) {
      runs.push(await simulateRun({ seed, policy: 'random', maxMonths: 200 }))
    }

    let repeats = 0
    for (const r of runs) {
      const turns = r.firedEventIds
        .map((id, i) => (id === CRISIS_EVENT_ID ? r.firedTurns[i] : -1))
        .filter(t => t >= 0)

      for (let i = 1; i < turns.length; i++) {
        repeats++
        expect(
          turns[i] - turns[i - 1],
          `seed=${r.seed}：第 ${turns[i - 1]} 月 → 第 ${turns[i]} 月，同一场病隔了 ${turns[i] - turns[i - 1]} 个月`
        ).toBeGreaterThanOrEqual(COOLDOWN_RANDOM_MONTHS)
      }
    }

    // 反空跑：取样里必须真的重发过一次，否则上面那个断言等于没跑
    expect(repeats, `${ILLNESS_SEEDS.length} 局里「重病缠身」一次也没重发 —— 冷却这条没被检验`).toBeGreaterThan(0)
  }, 240_000)
})
