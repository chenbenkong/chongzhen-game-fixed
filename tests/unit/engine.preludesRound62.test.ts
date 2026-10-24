import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'

/**
 * 第六十二轮：三条 0/256 未触达的终局前奏，各自补上「最后一问」的因果链。
 *
 * 上一轮把前奏从历史卡的 else 分支里救出来之后，仍有 6 张前奏 0 次登场。
 * 其中三张不是排期问题，而是门本身不可能成立：
 *  - 《中兴前夜》要 1643-12 的 国势≥60，而国势从 1636 起每月衰减，实测每一局都是 0；
 *  - 《权欲之巅》的隐藏 野心/道德 + 中官 只是巧合门，选【黄袍加身】也不会导向篡位结局；
 *  - 《抄家在即》钉死 1644 正月 + 圣眷≤10，而能同时满足 财帛/道德 的人圣眷都在 11–25。
 *
 * 修法不是降门槛，而是让前奏写一张**正门票**，结局仍在下个月走原来的边界门：
 *  - 《中兴前夜》【鞠躬尽瘁】→ 中兴功成 → 《中兴成功》
 *  - 《权欲之巅》【黄袍加身】→ 黄袍加身 → 《篡位自立》
 *  - 《抄家在即》【拼死一搏】→ 抄家问罪 → 《抄家灭族》（【铤而走险】写 潜逃，去隔壁《亡命江湖》）
 *
 * 每条测试都走真引擎：推进一个月撞见前奏，点下选项，再推进一个月看结局。
 * 反面的守卫同样重要：票不够时前奏不许凭空出现；选了别的路时结局不许硬凑。
 *
 * 为什么结局在**下个月**才结：`handleChoice` 里那次边界检查传的是抉择前的
 * `character.flags`（见 useGameEngine 的注释），这一轮没有改动那条既有语义 ——
 * 改了会让全库所有 flag 型结局提前一个月命中。因果因此是"这个月答，下个月收"。
 */

const ZX_PRELUDE = 'prelude_zhongxing_1643_12'
const US_PRELUDE = 'prelude_usurper_1643_12'
const CLAN_PRELUDE = 'prelude_clan_exterminate'

const ZX_ENDING = 'ending_zhongxing_success'
const US_ENDING = 'ending_usurper_throne'
const CLAN_ENDING = 'ending_clan_exterminate'
const FUGITIVE_ENDING = 'ending_fugitive'

/** 中兴线的四张参朝门票；任意三张即可，不必全要。 */
const ZX_TICKETS = ['阻止孙传庭出战', '持续保袁', '坚持招抚', '先见之明']

const FULL_HIDDEN = { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }

function makeZhongxingSave(tickets: string[] = ZX_TICKETS.slice(0, 3)) {
  return makeSaveData({
    character: makeCharacter({
      attributes: { 财帛: 60, 文韬: 60, 理政: 60, 武略: 60, 体质: 60 },
      hidden: { ...FULL_HIDDEN },
      flags: ['地方官任职', ...tickets]
    }),
    gameState: makeGameState({
      currentYear: 1643,
      currentMonth: 11,
      turn: 190,
      圣眷: 50,
      中官: 50,
      清议: 60,
      士绅: 50,
      民望: 50,
      国势: 50
    })
  })
}

function makeUsurperSave(tickets: string[] = ['掌军权', '拥兵自重', '问鼎之约']) {
  return makeSaveData({
    character: makeCharacter({
      attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 },
      hidden: { ...FULL_HIDDEN },
      flags: ['地方官任职', ...tickets]
    }),
    gameState: makeGameState({
      currentYear: 1643,
      currentMonth: 11,
      turn: 190,
      圣眷: 50,
      中官: 50,
      清议: 50,
      士绅: 50,
      民望: 50,
      国势: 0
    })
  })
}

function makeClanSave(overrides: { 圣眷?: number; 财帛?: number } = {}) {
  return makeSaveData({
    character: makeCharacter({
      attributes: { 财帛: overrides.财帛 ?? 80, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 },
      hidden: { ...FULL_HIDDEN, 道德值: 10 },
      flags: ['地方官任职']
    }),
    gameState: makeGameState({
      currentYear: 1637,
      currentMonth: 4,
      turn: 110,
      圣眷: overrides.圣眷 ?? 18,
      中官: 50,
      清议: 50,
      士绅: 50,
      民望: 50,
      国势: 0
    })
  })
}

/** 挂载引擎、等首个事件发下来；不推进月份。 */
async function openFirstMonth(save: ReturnType<typeof makeZhongxingSave>) {
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
  const { result } = renderGameEngine({ loadSaveData: save })
  await flush()
  return { result, randomSpy }
}

/** 推进一个月，返回引擎与还原随机源的收尾函数。 */
async function advanceOneMonth(save: ReturnType<typeof makeZhongxingSave>) {
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
  const { result } = renderGameEngine({ loadSaveData: save })
  await flush()
  await act(async () => {
    result.current.handleNextMonth()
  })
  await flush(600)
  return { result, randomSpy }
}

async function pickChoice(
  result: { current: ReturnType<typeof renderGameEngine>['result']['current'] },
  id: string
) {
  const choice = result.current.currentEvent?.choices.find(c => c.id === id)
  expect(choice, `当前事件里没有 ${id} 这个选项`).toBeTruthy()
  await act(async () => {
    result.current.handleChoice(choice!)
  })
  await flush(30)
}

async function advanceAgain(result: { current: ReturnType<typeof renderGameEngine>['result']['current'] }) {
  await act(async () => {
    result.current.handleNextMonth()
  })
  await flush(600)
}

describe('第六十二轮：终局前奏的最后一问——问了就该有一张票', () => {
  describe('《中兴前夜》→《中兴成功》（1643-12 → 1644）', () => {
    it('三张票 + 清议≥55：先撞见前奏，【鞠躬尽瘁】写下中兴功成，下月结案', async () => {
      const { result, randomSpy } = await advanceOneMonth(makeZhongxingSave())
      try {
        expect(result.current.gameState.currentYear).toBe(1643)
        expect(result.current.gameState.currentMonth, '这一步没落到 1643-12 —— 前奏的月窗无从判起').toBe(12)
        expect(result.current.currentEvent?.id, '《中兴前夜》没有排在当月第一格').toBe(ZX_PRELUDE)
        expect(result.current.isGameOver, '结局不该在前奏之前抢先结案').toBe(false)

        await pickChoice(result, 'c1')
        expect(
          result.current.character.flags,
          '【鞠躬尽瘁】没写下 中兴功成 —— 下个月的门就没有钥匙'
        ).toContain('中兴功成')

        await advanceAgain(result)
        expect(result.current.gameState.currentYear).toBe(1644)
        expect(result.current.isGameOver, '前奏已经答完，边界门却没接住《中兴成功》').toBe(true)
        expect(result.current.currentEvent?.id).toBe(ZX_ENDING)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('只有两张票时前奏不许出现 —— 修法不是把 3 of 4 拆掉', async () => {
      const { result, randomSpy } = await advanceOneMonth(makeZhongxingSave(ZX_TICKETS.slice(0, 2)))
      try {
        expect(result.current.gameState.currentMonth).toBe(12)
        expect(result.current.currentEvent?.id, '两张票却开了《中兴前夜》').not.toBe(ZX_PRELUDE)
        expect(result.current.pendingEvents.map(e => e.id)).not.toContain(ZX_PRELUDE)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('选【激流勇退】不写 中兴功成：下月不结中兴结局，人继续走', async () => {
      const { result, randomSpy } = await advanceOneMonth(makeZhongxingSave())
      try {
        await pickChoice(result, 'c2')
        expect(result.current.character.flags).not.toContain('中兴功成')
        await advanceAgain(result)
        expect(result.current.currentEvent?.id, '没答最后那一问却结了《中兴成功》').not.toBe(ZX_ENDING)
        expect(result.current.isGameOver).toBe(false)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('选【密谋大事】写下 暗蓄异志：中兴结局的 notHas 把它挡在门外', async () => {
      const { result, randomSpy } = await advanceOneMonth(makeZhongxingSave())
      try {
        await pickChoice(result, 'c3')
        expect(result.current.character.flags).toContain('暗蓄异志')
        await advanceAgain(result)
        expect(result.current.currentEvent?.id, '嘴上密谋大事，转头还是中兴功臣').not.toBe(ZX_ENDING)
        expect(result.current.isGameOver).toBe(false)
      } finally {
        randomSpy.mockRestore()
      }
    })
  })

  describe('《权欲之巅》→《篡位自立》（1643-12 → 1644）', () => {
    it('三张兵权票 + 国势≤25：先撞见前奏，【黄袍加身】写下票，下月结案', async () => {
      const { result, randomSpy } = await advanceOneMonth(makeUsurperSave())
      try {
        expect(result.current.gameState.currentMonth).toBe(12)
        expect(result.current.currentEvent?.id, '《权欲之巅》没有排在当月第一格').toBe(US_PRELUDE)

        await pickChoice(result, 'c1')
        expect(result.current.character.flags, '【黄袍加身】没写下对应经历').toContain('黄袍加身')

        await advanceAgain(result)
        expect(result.current.gameState.currentYear).toBe(1644)
        expect(result.current.isGameOver, '前奏已经答完，边界门却没接住《篡位自立》').toBe(true)
        expect(result.current.currentEvent?.id).toBe(US_ENDING)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('只有两张兵权票时前奏不许出现 —— 手里有兵不等于已经问鼎', async () => {
      const { result, randomSpy } = await advanceOneMonth(makeUsurperSave(['掌军权', '拥兵自重']))
      try {
        expect(result.current.gameState.currentMonth).toBe(12)
        expect(result.current.currentEvent?.id).not.toBe(US_PRELUDE)
        expect(result.current.pendingEvents.map(e => e.id)).not.toContain(US_PRELUDE)
      } finally {
        randomSpy.mockRestore()
      }
    })
  })

  describe('《抄家在即》→《抄家灭族》/《亡命江湖》（1637）', () => {
    // 这一张与前两张不同：它没有钉死的月窗（1635–1650 都可能发），
    // 所以读档当月就该撞见它。测试因此不先推月 —— 一推月，引擎在挂载时
    // 已经把前奏写进 eventHistory 了，第二个月自然会跳过它。
    it('【拼死一搏】写下 抄家问罪，下月结《抄家灭族》', async () => {
      const { result, randomSpy } = await openFirstMonth(makeClanSave())
      try {
        expect(result.current.gameState.currentYear).toBe(1637)
        expect(result.current.gameState.currentMonth, '读档当月就该发 —— 这张前奏没有月窗').toBe(4)
        expect(result.current.currentEvent?.id, '《抄家在即》没有排在当月第一格').toBe(CLAN_PRELUDE)

        await pickChoice(result, 'c3')
        expect(result.current.character.flags, '【拼死一搏】没写下 抄家问罪').toContain('抄家问罪')

        await advanceAgain(result)
        expect(result.current.gameState.currentMonth).toBe(5)
        expect(result.current.isGameOver, '前奏已经答完，边界门却没接住《抄家灭族》').toBe(true)
        expect(result.current.currentEvent?.id).toBe(CLAN_ENDING)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('【铤而走险】写 潜逃：不结抄家，改由下月的《亡命江湖》接手', async () => {
      const { result, randomSpy } = await openFirstMonth(makeClanSave())
      try {
        expect(result.current.currentEvent?.id).toBe(CLAN_PRELUDE)
        await pickChoice(result, 'c2')
        expect(result.current.character.flags).toContain('潜逃')
        await advanceAgain(result)
        expect(result.current.currentEvent?.id, '人都逃了，朝廷还把他全家抄了').not.toBe(CLAN_ENDING)
        expect(result.current.currentEvent?.id, '潜逃这张票没把《亡命江湖》的门打开').toBe(FUGITIVE_ENDING)
        expect(result.current.isGameOver).toBe(true)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('圣眷还在 30 时前奏不许出现 —— 皇上还护着你，不是抄家前夜', async () => {
      const { result, randomSpy } = await openFirstMonth(makeClanSave({ 圣眷: 30 }))
      try {
        expect(result.current.currentEvent?.id).not.toBe(CLAN_PRELUDE)
        expect(result.current.pendingEvents.map(e => e.id)).not.toContain(CLAN_PRELUDE)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('财帛只有 50 时前奏不许出现 —— 没钱可抄，就没有这一夜', async () => {
      const { result, randomSpy } = await openFirstMonth(makeClanSave({ 财帛: 50 }))
      try {
        expect(result.current.currentEvent?.id).not.toBe(CLAN_PRELUDE)
        expect(result.current.pendingEvents.map(e => e.id)).not.toContain(CLAN_PRELUDE)
      } finally {
        randomSpy.mockRestore()
      }
    })
  })
})
