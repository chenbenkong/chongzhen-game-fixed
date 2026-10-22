import { describe, expect, it } from 'vitest'
import { allEvents } from '../../scripts/event-pools'
import { allEndingEvents } from '../../src/data/events/ending'
import { simulateRun } from './helpers/simulate'

/**
 * 三条单终点命途的「第二拍 / 第三拍」（第四十七、四十八轮）。
 *
 * 第四十一轮把命途面板做出来之后，面板上最难看的三行是：
 *   篡位自立 —— 只有一张 问鼎之约，产地是柳如是那一条感情线；
 *   南渡续祚 —— 只有一张 南渡长江，过了江就自动结案，玩家在南京什么也没做；
 *   悬壶济世 —— 门是一道隐藏的 道德值≥60，界面上看不见。
 *
 * 本轮给每条路补了一拍"代价 / 考验"，并把判定从单点改成**看得见的两三步**：
 *   篡位：天命所归（掌军权 + 拥兵自重）→ 诸将劝进（问鼎之约）→ 篡位自立；
 *   南明：城破前备船 / 城破后南渡（南渡长江）→ 在南京入朝（效忠南明）→ 南渡续祚；
 *   医家：悬壶之念（习医 / 行医）→ 疫起（赈灾行医 / 仁心仁术，带代价）→ 悬壶济世。
 *
 * 下面钉三件事：
 *   1. 数据层：每条路的门票确实由前面那一拍写出来，且结局读的是这些票；
 *   2. 时序：甲申/城破两张边界卡不再在 1644 正月截断春戏，南渡的人也不会死在城墙上；
 *   3. 引擎层：三个反推存档各自真的能走到那三格（不是"数据看起来能走"）。
 */

const event = (id: string) => allEvents.find(e => e.id === id)
const ending = (id: string) => (allEndingEvents as any[]).find(e => e.id === id)
const choice = (eventId: string, choiceId: string) =>
  event(eventId)?.choices?.find((c: any) => c.id === choiceId)
const addedFlags = (eventId: string, choiceId: string) =>
  choice(eventId, choiceId)?.effects?.flags?.add ?? []

describe('篡位：掌军 → 劝进 → 问鼎', () => {
  it('结局读的是三张军权票，不是单一隐藏数值', () => {
    const flags = ending('ending_usurper_throne')?.conditions?.flags ?? {}
    expect(flags.has, '篡位格必须同时读掌军权/拥兵自重/问鼎之约三张票').toEqual(
      expect.arrayContaining(['掌军权', '拥兵自重', '问鼎之约'])
    )
  })

  it('第一拍写两张军权票，第二拍（劝进或柳如是）写问鼎之约', () => {
    expect(addedFlags('transition_1643_ambition', 'c1')).toEqual(
      expect.arrayContaining(['掌军权', '拥兵自重'])
    )
    expect(addedFlags('transition_1643_crown_offer', 'c1')).toContain('问鼎之约')
    // 第二条产地问鼎之约的支线，保证这条路不是单线程
    const soulmateWriters = allEvents.filter(e =>
      (e.choices ?? []).some((c: any) => (c.effects?.flags?.add ?? []).includes('问鼎之约'))
    )
    expect(soulmateWriters.length, '问鼎之约至少要有「诸将劝进」和一条感情线两个产地').toBeGreaterThanOrEqual(2)
  })

  it('反推存档：seed 8101 / usurper / 没落世家 真的走得到篡位', async () => {
    const r = await simulateRun({
      seed: 8101,
      policy: 'usurper',
      origin: '没落世家',
      maxMonths: 260,
      logChoices: true
    })
    expect(r.endingId, `没走到篡位，结在 ${r.endingTitle ?? r.endReason}（${r.finalYear}）`).toBe(
      'ending_usurper_throne'
    )
    expect(r.finalFlags).toEqual(expect.arrayContaining(['掌军权', '拥兵自重', '问鼎之约']))
    expect(r.choiceLog.map(c => `${c.eventId}.${c.choiceId}`)).toContain('transition_1643_ambition.c1')
  }, 60_000)
})

describe('南明：渡江是脚程，效忠是立场', () => {
  it('结局同时读两张票，且不早于 1640 年', () => {
    const cond = ending('ending_southern_ming')?.conditions ?? {}
    expect(cond.flags?.has, '南明格必须同时读南渡长江与效忠南明').toEqual(
      expect.arrayContaining(['南渡长江', '效忠南明'])
    )
    expect(cond.year?.min).toBeGreaterThanOrEqual(1640)
  })

  it('两条南渡路径都写立场票；已降顺/降清的人不能再「去南京立朝廷」', () => {
    expect(addedFlags('transition_1644_aftermath', 'c2')).toEqual(
      expect.arrayContaining(['南渡长江', '效忠南明'])
    )
    expect(addedFlags('transition_1644_aftermath', 'c4')).toEqual(
      expect.arrayContaining(['南渡长江', '效忠南明'])
    )
    for (const id of ['c2', 'c4']) {
      const notHas = choice('transition_1644_aftermath', id)?.showConditions?.flags?.notHas ?? []
      expect(notHas, `aftermath ${id} 要排除已投降的人`).toEqual(
        expect.arrayContaining(['投降大顺', '投降清朝'])
      )
    }
    // 另一条从四月《清军入关》直接入朝的产地
    expect(addedFlags('historical_019', 'c1')).toContain('效忠南明')
  })

  it('1644 的边界卡让春戏先播完：甲申/城破都挪到五月，并排除已南渡的人', () => {
    for (const id of ['ending_jiashen_nationfall', 'ending_city_fall']) {
      const cond = ending(id)?.conditions ?? {}
      expect(cond.month?.min, `${id} 不该在正月就把 1644 收走`).toBeGreaterThanOrEqual(5)
      expect(cond.flags?.notHas, `${id} 不该接走已经过江的人`).toContain('南渡长江')
    }
  })

  it('反推存档：seed 8253 / warden / 缙绅 真的走得到南明', async () => {
    const r = await simulateRun({
      seed: 8253,
      policy: 'warden',
      origin: '缙绅',
      maxMonths: 260,
      logChoices: true
    })
    expect(r.endingId, `没走到南明，结在 ${r.endingTitle ?? r.endReason}（${r.finalYear}）`).toBe(
      'ending_southern_ming'
    )
    expect(r.finalFlags).toEqual(expect.arrayContaining(['南渡长江', '效忠南明']))
    expect(r.firedEventIds).toEqual(expect.arrayContaining(['transition_1644_aftermath']))
  }, 60_000)
})

describe('医家：入路 → 疫起 → 悬壶', () => {
  it('入路与考验都读看得见的行医经历，结局不再读隐藏道德', () => {
    const healer = event('route_medical_healer')?.conditions?.flags?.any ?? []
    expect(healer.length, '《悬壶之念》的门要能看见具体经历').toBeGreaterThan(0)
    expect(healer).toEqual(expect.arrayContaining(['习医', '行医']))

    const plague = event('route_medical_plague')
    expect(plague, '医家路的第二拍《疫起》必须存在').toBeTruthy()
    expect(plague?.conditions?.year?.min).toBeGreaterThanOrEqual(1640)
    expect(plague?.conditions?.flags?.any ?? []).toEqual(
      expect.arrayContaining(['习医', '行医', '开馆行医'])
    )
    expect((plague?.choices?.length ?? 0) >= 3 && (plague?.choices?.length ?? 0) <= 4).toBe(true)

    const cond = ending('ending_medical_saint')?.conditions ?? {}
    expect(cond.hidden, '医家格不该再由隐藏道德裁决').toBeUndefined()
    expect(cond.flags?.any ?? []).toEqual(expect.arrayContaining(['习医', '行医', '开馆行医']))
    expect(cond.gameState?.民望?.min).toBeGreaterThanOrEqual(60)
  })

  it('疫起有代价：三个选项都不是白拿（救人扣体质/财帛，自守扣民望）', () => {
    const c1 = choice('route_medical_plague', 'c1')
    const c2 = choice('route_medical_plague', 'c2')
    const c3 = choice('route_medical_plague', 'c3')
    expect(c1?.effects?.attributes?.体质).toBeLessThan(0)
    expect(c2?.effects?.attributes?.财帛).toBeLessThan(0)
    expect(c3?.effects?.gameState?.民望).toBeLessThan(0)
  })

  it('反推存档：seed 8252 / ambitious / 缙绅 真的走得到悬壶济世', async () => {
    const r = await simulateRun({
      seed: 8252,
      policy: 'ambitious',
      origin: '缙绅',
      maxMonths: 260,
      logChoices: true
    })
    expect(r.endingId, `没走到悬壶济世，结在 ${r.endingTitle ?? r.endReason}（${r.finalYear}）`).toBe(
      'ending_medical_saint'
    )
    expect(r.finalFlags).toEqual(expect.arrayContaining(['习医', '行医']))
    expect(r.firedEventIds).toContain('route_medical_healer')
  }, 60_000)
})

describe('贰臣：投降之后也得有下一拍', () => {
  it('称臣纳贡只读年窗与贰臣票，不再压隐藏道德和国势上界', () => {
    const cond = ending('ending_qing_tributary')?.conditions ?? {}
    expect(cond.flags?.has).toContain('贰臣')
    expect(cond.hidden, '投降者的去路不该再由看不见的道德区间裁决').toBeUndefined()
    expect(cond.gameState, '国势到 1644 早已崩到个位数，10–35 的上界只会把这格锁死').toBeUndefined()
    expect(cond.month?.min, '清军入关在四月，三月十九日不能先结案').toBeGreaterThanOrEqual(4)
  })

  it('《天崩地坼》不再追问已经给出答案的人', () => {
    const notHas = event('transition_1644_aftermath')?.conditions?.flags?.notHas ?? []
    expect(notHas).toEqual(
      expect.arrayContaining([
        '殉国报君', '殉国', '出家', '和尚',
        '投降清朝', '贰臣',
        '南渡长江', '效忠南明',
        '满门忠烈', '藏匿民间'
      ])
    )
  })

  it('入关那张卡上两种立场互斥：过江的人不降清，降过的人不南渡', () => {
    expect(choice('historical_019', 'c1')?.showConditions?.flags?.notHas ?? []).toEqual(
      expect.arrayContaining(['贰臣', '投降清朝', '投降大顺'])
    )
    expect(choice('historical_019', 'c2')?.showConditions?.flags?.notHas ?? []).toEqual(
      expect.arrayContaining(['南渡长江', '效忠南明'])
    )
  })

  it('三月城破的三条路都写得出结局要读的票', () => {
    expect(addedFlags('historical_018', 'c3')).toEqual(
      expect.arrayContaining(['南渡长江', '效忠南明'])
    )
    expect(addedFlags('historical_038', 'c1')).toEqual(
      expect.arrayContaining(['殉国', '殉国报君'])
    )
    // 过江的是家眷，不是殉国的本人。
    expect(addedFlags('transition_1644_family_martyr', 'c2')).not.toContain('南渡长江')
  })

  it('反推存档：seed 3 / warden / 没落世家 的贰臣票真的结得了案', async () => {
    const r = await simulateRun({
      seed: 3,
      policy: 'warden',
      origin: '没落世家',
      maxMonths: 260,
      logChoices: true
    })
    expect(
      r.endingId,
      `没走到称臣纳贡，结在 ${r.endingTitle ?? r.endReason}（${r.finalYear}），票：${r.finalFlags.join('/')}`
    ).toBe('ending_qing_tributary')
    expect(r.finalFlags).toContain('贰臣')
  }, 60_000)
})
