import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { allEvents } from '../../scripts/event-pools'
import { allEndingEvents } from '../../src/data/events/ending'
import { simulateRun } from './helpers/simulate'
import { flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'
import type { EventChoice, GameEvent } from '../../src/types/event'

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

  it('反推存档：seed 7990 / usurper / 没落世家 真的走得到篡位', async () => {
    // 第五十五轮重抄（旧 8101）：本轮把跑局器的随机流改成"挂载之后重新起头"（§1.4 ㉗ 收口），
    // 序列整体挪了一拍。200 个种子里 8000 走通，三张军权票齐。
    // 第六十六轮再重抄（旧 8000）：八条历史事件的出身门从"五名里的五名"补成 ALL_ORIGINS
    // （§1.4 ㊶），没落世家能抽到的事件池多了三条，骰子序列又挪了一拍 —— 8000 结在殉国死节。
    // 7990 在 7990..8210 里第一批走通，三张军权票齐，点的是 transition_1643_ambition.c1。
    // 从此这一颗骰子不会再换位置 —— 复现性由 `simulate.determinism.test.ts` 钉着。
    const r = await simulateRun({
      seed: 7990,
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

  it('反推存档：三月【南逃】→ 四月《天崩地坼》在南京入朝 → 五月结到南渡续祚', async () => {
    // 第五十七轮从整局模拟改成**按内容标定的反推存档**，理由有两层：
    //  1. 前奏修好后，《城破前夜》在三月先于历史卡播出，而 warden 的保命启发式
    //     永远不会点【南逃】—— 那一条只有 体质−10，【殉国】【投降】都有正增量。
    //     整局模拟里"走不到南明"是量具的选择，不是格子做死（与第廿四轮 bandit 同一条教训）。
    //  2. 这一格真正要钉的是**两拍**：三月渡江是脚程（只写 南渡长江），
    //     四月到了南京再答立场（《天崩地坼》c2/c4 写 效忠南明）。
    //     旧 pin 借 seed1/warden/缙绅 顺路撞上它，现在改成把这两拍一步步走一遍。
    // 站位按内容选：1644-02、国势 20、体质 60（c3 要 体质≥20），身上只有出身经历。
    const save = makeSaveData({
      character: makeCharacter({
        origin: '缙绅',
        age: 46,
        attributes: { 财帛: 60, 文韬: 60, 理政: 60, 武略: 60, 体质: 60 },
        hidden: { 道德值: 60, 欲望值: 30, 野心值: 40, 机敏值: 50, 忠诚值: 50 },
        flags: ['地方官任职']
      }),
      gameState: makeGameState({ currentYear: 1644, currentMonth: 2, turn: 193, 国势: 20 }),
      origin: '缙绅'
    })
    const { result } = renderGameEngine({ loadSaveData: save })
    await flush(400)

    // 只在这两拍上点指定选项；其余月份按"还在玩"处理（绕开结局选项）。
    const pick = (e: GameEvent): EventChoice | null => {
      const all = e.choices ?? []
      if (e.id === 'transition_1644_night_before') return all.find(c => c.id === 'c3') ?? null
      if (e.id === 'transition_1644_aftermath') return all.find(c => c.id === 'c2') ?? null
      return all.find(c => c.effects?.special?.type !== 'ending') ?? all[0] ?? null
    }
    const seen: string[] = []
    for (let i = 0; i < 40 && !result.current.isGameOver; i++) {
      const event = result.current.currentEvent
      if (!event) {
        await act(async () => {
          result.current.handleNextMonth()
        })
        await flush(600)
        continue
      }
      seen.push(event.id)
      const c = pick(event)
      if (c) {
        await act(async () => {
          result.current.handleChoice(c, { skipResignConfirm: true })
        })
        await flush(300)
      }
      if (result.current.isGameOver) break
      await act(async () => {
        result.current.handleContinue()
      })
      await flush(600)
    }

    expect(seen, '三月那一拍必须先是《城破前夜》，而不是历史卡').toContain('transition_1644_night_before')
    expect(seen, '四月这一拍没播 —— 南明就只剩脚程，没有立场').toContain('transition_1644_aftermath')
    expect(result.current.isGameOver).toBe(true)
    expect(result.current.currentEvent?.id, '南渡长江+效忠南明 两张票齐了却没结到南明').toBe(
      'ending_southern_ming'
    )
    expect(result.current.character.flags).toEqual(
      expect.arrayContaining(['南渡长江', '效忠南明'])
    )
  }, 60_000)
})

describe('医家：入路 → 疫起 → 悬壶', () => {
  it('入路与考验都读看得见的行医经历，结局不再读隐藏道德', () => {
    const healer = event('route_medical_healer')?.conditions?.flags?.any ?? []
    expect(healer.length, '《悬壶之念》的门要能看见具体经历').toBeGreaterThan(0)
    expect(healer).toEqual(expect.arrayContaining(['习医', '行医']))

    const plague = event('route_medical_plague')
    expect(plague, '医家路的第二拍《疫起》必须存在').toBeTruthy()
    // 第六十八轮重抄（旧钉 `>= 1640`）：下沿抬到 1639。理由不是"这一拍想早开两年"，
    // 而是 1640 那一年**没人居住** —— 160 局实测带医疗票的局抉择数是 1639×896 / 1640×69 / 1641 起为 0（§1.4 ㊸），
    // 高数值画像一进 1640 就被《边关大将》《悬壶济世》《清流骨鲠》成排结案。
    // 下沿留在 1640 时《疫起》160 局播 0 次；抬到 1639 之后播 28 次，且 18 局《悬壶济世》全都先见过它。
    expect(plague?.conditions?.year?.min).toBeGreaterThanOrEqual(1639)
    expect(
      plague?.conditions?.year?.min,
      '第二拍必须比《悬壶济世》的年窗下沿早开 —— 同格并排时结局格先收人'
    ).toBeLessThan(1640)
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

  it('反推存档：seed 9011 / ambitious / 缙绅 真的走得到悬壶济世', async () => {
    // 第四十九轮重抄。旧的 8252 结在《病逝任上》（1638）——《疫起》的年窗在 1640，
    // 这副骰子的人先病死了，不是这一格做死。
    // 第五十五轮重抄（旧 seed24）：随机流"挂载后重新起头"之后序列挪了一拍（§1.4 ㉗）。
    // 换骰子前先把供给量了一遍：2400 局扫描里 缙绅 600 个种子里结在悬壶济世的有 32 局，
    // 寒门 14 局 —— 这一格没做死，只是这一颗骰子挪了位。seed9004 走完 入路 → 疫起 → 收束 三拍。
    // 第六十七轮重抄（旧 seed9004）：内廷暗线那五张 transition 卡进了同一个池，
    // 抽卡顺序整体挪位 —— 这一局现在结在《病逝任上》（1638），跟 8252 当年是同一种死法。
    // 先查门再换骰子：`ending_medical_saint` 的判据、年窗、优先级本轮一字未动；
    // 再量供给 —— 缙绅/ambitious × seed 9000..9060 + 1..120 共 181 局里
    // 结在《悬壶济世》的有 9011／9013／9015／9030／9032／9037（都收在 1640），供给没塌。
    // 从此这一颗骰子不会再换位置 —— 复现性由 `simulate.determinism.test.ts` 钉着。
    const r = await simulateRun({
      seed: 9011,
      policy: 'ambitious',
      origin: '缙绅',
      maxMonths: 260,
      logChoices: true
    })
    expect(r.endingId, `没走到悬壶济世，结在 ${r.endingTitle ?? r.endReason}（${r.finalYear}）`).toBe(
      'ending_medical_saint'
    )
    // 第六十八轮：这一颗骰子现在还得多背一件事 —— 三拍都要真播出来。
    // 「疫起」这条断言在本轮之前是**不可能绿**的（它 160 局播 0 次，见 §1.4 ㊷），
    // 年窗下沿抬到 1639 之后，这一局在 1639 年撞见了那场大疫，1640 年才收的案。
    expect(r.finalFlags).toEqual(expect.arrayContaining(['习医', '行医']))
    expect(r.firedEventIds).toContain('route_medical_healer')
    expect(
      r.firedEventIds,
      `三拍断在第二拍：这一局播过 ${r.firedEventIds.filter(id => id.startsWith('route_medical')).join('/')}`
    ).toContain('route_medical_plague')
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
    // 第五十七轮把 `南渡长江` 从这一张名单里摘掉了：前奏修好后，四月还活着的局
    // 三月一定见过《城破前夜》并且已经答过，而它的四条答案每一张票都在这张名单里 ——
    // 本卡因此十一个月没开过口。渡江只是脚程，南明的立场要四月到了南京再答
    // （见上面那条反推存档）。已经过江的人仍然不被问"投降清朝/隐姓埋名"以外的问题：
    // 投降清朝那一条单独用 showConditions 关掉（人在南京没法在北京剃发）。
    const notHas = event('transition_1644_aftermath')?.conditions?.flags?.notHas ?? []
    expect(notHas).toEqual(
      expect.arrayContaining([
        '殉国报君', '殉国', '出家', '和尚',
        '投降清朝', '贰臣',
        '效忠南明',
        '满门忠烈', '藏匿民间'
      ])
    )
    expect(notHas, '南渡长江 现在是被允许的 —— 那是这一拍要接的脚程').not.toContain('南渡长江')
    expect(choice('transition_1644_aftermath', 'c1')?.showConditions?.flags?.notHas ?? []).toContain(
      '南渡长江'
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
    // 第四十九轮重抄两次，理由与上面南明那一条同一条：先是《秦淮暗股》不再反复开张把 1630
    // 年起的发牌换了位（旧的 seed 3 根本没走到投降那一步），再是结局卡不再被待处理队列盖掉
    // （§1.4 ㉛）—— 旧的 seed 4 这一局带着 殉国/殉国报君 结在《殉国死节》，那张贰臣票压根没写上。
    // 第五十五轮重抄（旧 seed5）：随机流"挂载后重新起头"之后序列挪了一拍（§1.4 ㉗）。
    // 第五十七轮重抄（旧 seed14）：本轮之前《城破前夜》被历史卡永久挤掉，三月那一拍其实是
    // 《煤山遗恨》；前奏修好后，1644 的路全从《城破前夜》起，旧 seed14 改点了【殉国】。
    // 换骰子前先量过供给：同一批 64 局（四出身 × steady/warden × seed1..8）里
    // 没落世家/warden 的 seed1／2／8 都带着贰臣票结在称臣纳贡（196 月），寒门也有三局 ——
    // 这一格没做死，只是这一颗骰子挪了位。重抄只换骰子，不改格子。
    // 第六十七轮重抄（旧 seed1）：这一局的履历里多出了 半门之客／税关差事／抽身之意／洗手不干／搁笔·抽身而去
    // —— 他走上了暗线那一拍"把账烧了、告病"的分支，那张卡给他 清议+10 道德+6，1644 年三月他改点【殉国】，
    // 于是结在《殉国死节》而不是《称臣纳贡》。（顺带一格证据：他 1640 年见过《抽身而去》的请笔卡并且拒了笔，
    // 才活到 1644 —— 暗线不再替玩家结案这条由 `simulation.originLongevity` 钉着。）
    // 这是内容真的多了一条路，不是格子做死：
    // `ending_qing_tributary` 的判据、年窗、优先级本轮一字未动，同一片网格（warden/没落世家 × seed1..80）
    // 里带 贰臣 票结在称臣纳贡的仍有 seed3／9／14／15／26／32 六局，全部收在 1644。
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
