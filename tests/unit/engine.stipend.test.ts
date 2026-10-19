import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import { RANKS, FUGITIVE_ANNUAL_INCOME, annualIncomeFor, annualStipend } from '../../src/hooks/useGameEngine'
import { FUGITIVE_FLAG } from '../../src/data/demotionWarningEvents'

/**
 * 第十二轮：岁俸 + 归零警告的概率门豁免。
 *
 * 两条都来自整局模拟器的实测，而不是读代码读出来的：
 *  · 16 局守成玩法里 `财帛` 声明净增量 **−0.77/月**，8/16 局最终归零死于「倾家荡产」。
 *    全游戏 700+ 条选项在扣钱，而"当官有俸禄"这条进钱管道在引擎里根本不存在。
 *  · 归零警告走 crisis，于是吃 `CRISIS_EVENT_PROBABILITY = 0.3` 的月度概率门。
 *    但八条死线现在要求"先见过警告才允许判死"，警告一旦漏发就没人补 ——
 *    那一维会卡在「归零但没警告」上，既不判死也不给救，整局悬空。
 *    通知这种东西应当是必到的，所以它不该吃概率。
 */

const WARN_CAI = 'boundary_warn_财帛'
const CRISIS_ILLNESS = 'boundary_serious_illness'

/** 八维全正的存档，只把要测的那一维挑出来改 */
function makeCleanSave(overrides: { 财帛?: number; 体质?: number } = {}, month = 1) {
  return makeSaveData({
    character: makeCharacter({
      rank: '正七品·知县',
      degree: '进士',
      attributes: { 财帛: overrides.财帛 ?? 50, 文韬: 50, 理政: 50, 武略: 50, 体质: overrides.体质 ?? 60 },
      hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
      flags: []
    }),
    gameState: makeGameState({
      currentMonth: month,
      圣眷: 50,
      中官: 50,
      清议: 50,
      士绅: 50,
      民望: 50
    })
  })
}

describe('岁俸：引擎里第一次有了进项', () => {
  it('每一级官职都查得到俸银，且非官员身份拿 0', () => {
    for (const rank of RANKS) {
      expect(annualStipend(rank.name), `${rank.name} 应当有岁俸`).toBe(rank.level)
    }
    // 白身、致仕、从商这些身份不在 RANKS 里，没有俸禄可言
    expect(annualStipend('白身')).toBe(0)
    expect(annualStipend('')).toBe(0)
    expect(annualStipend('正七品·知县（加衔）')).toBe(0)
  })

  it('跨年那一次推进按品级发一笔俸银', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { result } = renderGameEngine({ loadSaveData: makeCleanSave({}, 12) })
    await flush()

    // 起点：十二月、财帛 50。注意读档时引擎会按政绩分校正官职
    // （`fixedCharacter.rank = correctRank.name`），所以这里从引擎自己嘴里拿等级，
    // 而不是假设存档里写的那一级还在。
    expect(result.current.gameState.currentMonth).toBe(12)
    expect(result.current.character.attributes.财帛).toBe(50)
    const stipend = annualStipend(result.current.character.rank)
    expect(stipend).toBeGreaterThan(0)

    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    // 只可能跨一次年（一次推进最多连跳 12 个月）
    expect(result.current.gameState.currentYear).toBe(1629)
    expect(result.current.character.attributes.财帛).toBe(50 + stipend)

    // 进项必须留痕：史馆《生平》里查得到是哪一年领了多少
    const records = result.current.lifeRecords.filter(r => r.title === '支领岁俸')
    expect(records).toHaveLength(1)
    expect(records[0].year).toBe(1629)
    expect(records[0].month).toBe(1)
    expect(records[0].attributesChange?.财帛).toBe(stipend)

    randomSpy.mockRestore()
  })

  it('不跨年就不发 —— 发俸次数恒等于跨过的年数', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { result } = renderGameEngine({ loadSaveData: makeCleanSave({}, 6) })
    await flush()

    const yearBefore = result.current.gameState.currentYear
    const moneyBefore = result.current.character.attributes.财帛
    const level = annualStipend(result.current.character.rank)

    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    const crossed = result.current.gameState.currentYear - yearBefore
    expect(crossed).toBeLessThanOrEqual(1)
    expect(result.current.character.attributes.财帛).toBe(moneyBefore + level * crossed)
    // 留痕与入账必须同源：没跨年就不能多出一条"支领岁俸"
    expect(result.current.lifeRecords.filter(r => r.title === '支领岁俸')).toHaveLength(crossed)

    randomSpy.mockRestore()
  })

  it('俸银同样受 0..100 裁剪，不会把财帛顶到上限之外', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const save = makeCleanSave({ 财帛: 98 }, 12)
    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()

    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)

    expect(result.current.gameState.currentYear).toBe(1629)
    expect(result.current.character.attributes.财帛).toBe(100)

    randomSpy.mockRestore()
  })
})

describe('弃官南还的人不再领原职的俸（第二十八轮）', () => {
  /**
   * 这一处是第廿五轮那处豁免的**另一半**：那一年让 `checkDemotion` 对 潜逃 直接 return，
   * 于是"办他"的那台机器停了，可"给他发钱"的那台还在按 `rank` 每年正月照发 ——
   * 印信留在案上、隐姓埋名的人，史馆里年年写着「新岁任职正三品·大理寺卿，照例支领俸银」。
   *
   * 五档同种子 40 局的读数抄在 `useGameEngine.ts` 的 `FUGITIVE_ANNUAL_INCOME` 注释里（一进程一档），
   * 结论是**换成与官职无关的一笔**而不是切断：切断会把《亡命江湖》的结案从 8 局打到 3 局
   * （负结果，不 ship），而 八两/岁 这一档读到 结案 8 → 10、门开 11 → 14 月、
   * 倾家荡产 17 → 16、活到 1635 22 → 26 局、控制组 `vanish` 结案 4 → 4。
   * 逐局读数钉在 `simulation.fugitiveIncome.test.ts`。
   */
  it('纯函数一侧：逃与不逃是两条分支，且南还那笔与品级无关', () => {
    for (const rank of RANKS) {
      expect(annualIncomeFor(rank.name, false), `${rank.name} 在任仍按品级领俸`).toBe(rank.level)
      expect(
        annualIncomeFor(rank.name, true),
        `${rank.name} 的人已经弃官，进项不该还跟着品级走`
      ).toBe(FUGITIVE_ANNUAL_INCOME)
    }
    // 白身（不在 RANKS 里）在任拿 0；但 潜逃 那笔是祖产·幕馆，与官职无关
    expect(annualIncomeFor('白身', false)).toBe(0)
    expect(annualIncomeFor('白身', true)).toBe(FUGITIVE_ANNUAL_INCOME)
    expect(FUGITIVE_ANNUAL_INCOME, '八两 这个数是 A/B 里挑出来的，改它=重做那三档读数').toBe(8)
  })

  it('同一份存档只差一条 潜逃 flag：正月的进项与史馆措辞都必须换', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const draw = (flags: string[]) => {
      const save = makeCleanSave({}, 12)
      save.character.flags = flags
      return renderGameEngine({ loadSaveData: save })
    }
    const staying = draw([])
    const fleeing = draw([FUGITIVE_FLAG])
    await flush()

    const rank = staying.result.current.character.rank
    expect(fleeing.result.current.character.rank, '两版必须同一个起点，否则下面的差额读不出东西').toBe(rank)
    expect(staying.result.current.character.attributes.财帛).toBe(50)
    expect(fleeing.result.current.character.attributes.财帛).toBe(50)

    await act(async () => {
      staying.result.current.handleNextMonth()
    })
    await act(async () => {
      fleeing.result.current.handleNextMonth()
    })
    await flush(600)

    expect(staying.result.current.gameState.currentYear).toBe(1629)
    expect(fleeing.result.current.gameState.currentYear).toBe(1629)
    const level = annualStipend(rank)
    expect(level, '在任那一版没跨到年、或这一级根本没俸银 —— 反空转失败').toBeGreaterThan(0)
    expect(
      staying.result.current.character.attributes.财帛,
      `在任的应当拿品级俸 ${level}`
    ).toBe(50 + level)
    expect(
      fleeing.result.current.character.attributes.财帛,
      '带 潜逃 的还在按原职领俸 —— 这台发钱的机器没跟着停'
    ).toBe(50 + FUGITIVE_ANNUAL_INCOME)

    // 措辞也要跟着换：史馆里不该再出现"任职某某"
    const stayRec = staying.result.current.lifeRecords.filter(r => r.title === '支领岁俸')
    const fleeRec = fleeing.result.current.lifeRecords.filter(r => r.title === '祖产·幕馆')
    expect(stayRec).toHaveLength(1)
    expect(fleeRec, '南还那一版没留下进项记录 —— 数值变了而史馆里查不到，正是第十一轮记过的暗账').toHaveLength(1)
    expect(fleeing.result.current.lifeRecords.some(r => r.description.includes(`任职${rank}`)), '史馆还在按在任措辞写他的新岁').toBe(false)
    expect(fleeRec[0].attributesChange?.财帛).toBe(FUGITIVE_ANNUAL_INCOME)

    randomSpy.mockRestore()
  })
})

describe('归零警告不吃 crisis 概率门', () => {
  it('随机数落在概率门之外，归零的那一维仍然会弹出警告', async () => {
    // 0.99 > CRISIS_EVENT_PROBABILITY：普通 crisis 一律不出
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { result } = renderGameEngine({ loadSaveData: makeCleanSave({ 财帛: 0 }) })
    await flush()

    expect(result.current.currentEvent?.id).toBe(WARN_CAI)
    // 警告只是危机事件，不是结局 —— 第一次归零不许收尾
    expect(result.current.isGameOver).toBe(false)

    randomSpy.mockRestore()
  })

  it('同一条随机数下，重病缠身照旧被概率门挡住（豁免没有变成"无条件触发"）', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { result } = renderGameEngine({ loadSaveData: makeCleanSave({ 体质: 10 }) })
    await flush()

    expect(result.current.currentEvent?.id).not.toBe(CRISIS_ILLNESS)

    // 放开概率门，同一条事件就该出现 —— 证明上一句是概率挡的，不是条件写错了
    randomSpy.mockReturnValue(0.1)
    await act(async () => {
      result.current.handleNextMonth()
    })
    await flush(600)
    expect(result.current.currentEvent?.id).toBe(CRISIS_ILLNESS)

    randomSpy.mockRestore()
  })

  it('已经警告过的那一维不会再被重复警告（豁免只作用于"第一次归零"）', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const save = makeCleanSave({ 财帛: 0 })
    save.character.flags = ['归零警告·财帛']
    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()

    expect(result.current.currentEvent?.id).not.toBe(WARN_CAI)

    randomSpy.mockRestore()
  })
})
