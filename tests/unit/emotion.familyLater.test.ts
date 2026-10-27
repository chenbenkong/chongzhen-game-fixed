import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { familyLaterEchoEvents } from '../../src/data/events/echo/familyLater'
import { coreEmotionEvents } from '../../src/data/events/emotion/core'
import { checkEventConditions } from '../../src/utils/eventConditions'
import { checkChoiceRequirement } from '../../src/utils/choiceRequirements'
import {
  flush,
  makeCharacter,
  makeGameState,
  makeSaveData,
  renderGameEngine
} from './helpers/gameEngine'
import { simulateRun, type SimOutcome, type SimPolicy } from './helpers/simulate'
import type { EventChoice, GameEvent } from '../../src/types/event'

/**
 * 第四十四轮：家宅线三处断头的回归测试。
 *
 * 这一轮不是"再加一段戏"，而是把情感线正文里已经写出来的三句下文补上：
 *   · 《无子之痛》【维护妻子】说「三年后的某一天，正妻告诉你——她怀孕了」，
 *     却只写 `protect_childless_wife`，那个孩子从未出生 → 《灯花》；
 *   · 【去母留子】说「多年后，当那个孩子长大成人问你『我的亲生母亲是谁』」，
 *     全游戏没有这一问 → 《名帖》；
 *   · 【灭口】说「对外宣称正妻急病暴毙」，此后再无人问 → 《问丧》。
 *
 * 第一段钉数据契约（门开在哪条经历上、每个分支写什么）；
 * 第二段用真引擎跑 36 局（12 策略 × 3 种子），证明三条回响都能被玩家撞见，
 * 且《灯花》的每一条分支都真的把孩子写进了状态 —— 不再只是正文里的一句话。
 *
 * 第五十四轮改的是**门读什么**：《灯花》《名帖》原先靠公元年窗下界（1635／1638），
 * 而它们的正文说的是"护妻之后三年""孩子到了入塾的年纪"。现在这两句自己变成门
 * （`conditions.flags.since`，读 `Character.flagTurns`），年窗只留甲申之前的上界。
 * 机制本身钉在 `conditions.flagSince.test.ts`，时间账钉在 `engine.flagTurns.test.ts`，
 * 这一文件钉的是那三格家宅回响的数据契约 + 走得到 + 反推存档。
 */

const POLICIES: SimPolicy[] = [
  'random', 'first', 'ambitious', 'steady', 'warden', 'sealer',
  'hermit', 'monk', 'stream', 'bandit', 'vanish', 'ordinary'
]

const event = (id: string) => familyLaterEchoEvents.find(e => e.id === id)!
const adds = (c: EventChoice) => c.effects?.flags?.add ?? []
const choiceGate = (c: EventChoice) => [
  ...(c.showConditions?.flags?.has ?? []),
  ...(c.showConditions?.flags?.all ?? []),
  ...(c.showConditions?.flags?.some ?? []),
  ...(c.showConditions?.flags?.any ?? [])
]
const eventGate = (e: GameEvent) => [
  ...(e.conditions?.flags?.has ?? []),
  ...(e.conditions?.flags?.all ?? []),
  ...(e.conditions?.flags?.some ?? []),
  ...(e.conditions?.flags?.any ?? [])
]

describe('家宅第三波：门开在原文已经写下的那件事上', () => {
  it('三条回响都在，门分别开在 护妻 / 有子 / 灭口 上', () => {
    expect(familyLaterEchoEvents.map(e => e.id)).toEqual([
      'echo_family_006',
      'echo_family_007',
      'echo_family_008'
    ])
    expect(eventGate(event('echo_family_006'))).toContain('protect_childless_wife')
    expect(eventGate(event('echo_family_007'))).toContain('has_children')
    expect(eventGate(event('echo_family_008'))).toContain('wife_murdered')
    // 年窗只留上界（甲申之变前）；下界交给经历自己的时间。
    // 第五十四轮之前这里是 `{ min: 1635/1638, max: 1644 }`：
    // 《灯花》正文第一句「三年前，母亲拿…逼你纳妾」、《名帖》正文「孩子到了入塾的年纪」，
    // 两句说的都是"你家过了多久"，而门量的是"公元几年" —— 实测旧门下《名帖》15 次开口
    // 全落在 1638 年，开口时孩子 2.3～8.5 岁都有。现在门直接读落笔月份。
    expect(event('echo_family_006').conditions?.year).toEqual({ max: 1644 })
    expect(event('echo_family_007').conditions?.year).toEqual({ max: 1644 })
    expect(event('echo_family_008').conditions?.year).toEqual({ min: 1635, max: 1644 })
    expect(event('echo_family_006').conditions?.flags?.since).toEqual({
      protect_childless_wife: { min: 36 }
    })
    expect(event('echo_family_007').conditions?.flags?.since).toEqual({ has_children: { min: 72 } })
  })

  it('《无子之痛》【去母留子】写下的两个 flag，正是《名帖》那一路的门票', () => {
    // 正文与门是一对：echo 把时间说成"孩子开到蒙学"，门就必须读孩子的月龄。
    // 两边都写死公元年，才叫断头。
    const core = coreEmotionEvents.find(e => e.id === 'emotion_core_003')!
    const c3 = core.choices.find(c => c.id === 'c3')!
    expect(c3.result?.echo).toContain('开到蒙学')
    expect(c3.result?.echo).not.toContain('长大成人')
    expect(adds(c3)).toEqual(expect.arrayContaining(['concubine_killed', 'has_children']))
  })

  it('《灯花》的每一条分支都让那个孩子真的出生', () => {
    const e = event('echo_family_006')
    for (const c of e.choices) {
      expect(adds(c), `${c.id} 没写 has_children —— 正文说怀孕了，状态里却没有这个孩子`).toContain(
        'has_children'
      )
      expect(adds(c)).toContain('echo_family_006_done')
    }
    // 三条分支给的是三种夫妻关系，不是同一个结果换三句台词。
    expect(adds(e.choices.find(c => c.id === 'c1')!)).toContain('harmonious_family')
    expect(adds(e.choices.find(c => c.id === 'c2')!)).toContain('wife_hurt')
    expect(adds(e.choices.find(c => c.id === 'c3')!)).toContain('wife_respected')
  })

  it('《名帖》四条分支只写一次性开关，读的却是两种身世', () => {
    const e = event('echo_family_007')
    for (const c of e.choices) {
      const rest = adds(c).filter(f => f !== 'echo_family_007_done')
      expect(rest, `${c.id} 又造了新词：${rest.join(',')}`).toEqual([])
      expect(adds(c)).toContain('echo_family_007_done')
    }
    // 亡母 一路只在"去母留子"之后出现；写生母 一路覆盖纳妾、偏宠与伤心。
    expect(choiceGate(e.choices.find(c => c.id === 'c1')!)).toContain('concubine_killed')
    const c2 = choiceGate(e.choices.find(c => c.id === 'c2')!)
    expect(c2).toEqual(expect.arrayContaining(['concubine_for_heir', 'wife_jealous', 'wife_hurt']))
    // 记在正室名下 读的是前两波刚写出来的体面。
    expect(choiceGate(e.choices.find(c => c.id === 'c3')!)).toEqual(
      expect.arrayContaining(['legitimate_heir', 'wife_respected', 'harmonious_family'])
    )
    // 只写父名 不设门槛：三条身世线都断的人，仍要能把这一栏留白。
    expect(choiceGate(e.choices.find(c => c.id === 'c4')!)).toEqual([])
  })

  it('《问丧》读的是灭口与犯罪线，不是随便一个丧事', () => {
    const e = event('echo_family_008')
    expect(eventGate(e)).toContain('wife_murdered')
    const c2 = e.choices.find(c => c.id === 'c2')!
    expect(choiceGate(c2)).toContain('crime_line')
    for (const c of e.choices) {
      expect(adds(c)).toEqual(['echo_family_008_done'])
    }
    // 以势压人 是唯一把道德再往下压的一条，其余两条都在补。
    expect(c2.effects?.hidden?.道德值).toBeLessThan(0)
    expect(e.choices.filter(c => c.id !== 'c2').every(c => (c.effects?.hidden?.道德值 ?? 0) > 0)).toBe(
      true
    )
  })

  it('六条只写不读的经历，第一次各自有了读者', () => {
    const read = new Set<string>()
    for (const e of familyLaterEchoEvents) {
      for (const f of eventGate(e)) read.add(f)
      for (const c of e.choices) for (const f of choiceGate(c)) read.add(f)
    }
    const targets = [
      'protect_childless_wife',
      'harmonious_family',
      'wife_respected',
      'legitimate_heir',
      'wife_murdered',
      'crime_line'
    ]
    expect(targets.filter(f => !read.has(f))).toEqual([])
  })
})

describe('家宅第三波真跑局：《灯花》《名帖》在样本里撞得到，《问丧》改由反推存档钉', () => {
  const SEEDS = 3

  it('36 局里《灯花》《名帖》都播出，且《灯花》的每个孩子都落了地', async () => {
    const runs: SimOutcome[] = []
    for (const policy of POLICIES) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        runs.push(await simulateRun({ seed, policy, maxMonths: 260, logChoices: true }))
      }
    }
    const fired = (id: string) => runs.filter(r => r.firedEventIds.includes(id))
    const used = (id: string) =>
      new Set(
        runs.flatMap(r =>
          r.choiceLog.filter(c => c.eventId === id).map(c => c.choiceId)
        )
      )

    const deng = fired('echo_family_006')
    expect(deng.length, '没有一个玩家走到《灯花》—— 护妻那一路又断在怀孕那句话上').toBeGreaterThanOrEqual(2)
    expect(
      deng.every(r => r.finalFlags.includes('has_children')),
      '《灯花》播了，孩子却没有进状态'
    ).toBe(true)
    // 第五十四轮重抄读数：门从"公元 1635 年起"换成"护妻之后满三年"，
    // 能撞见《灯花》的那一批局整个换了一遍，36 局里只出现 c1【先握住她的手】。
    // 样本覆盖到哪一支是画像的运气，不是机制；c2/c3 的可点性与写入契约
    // 由本文件第一段（每条分支都写 has_children）和下面的反推存档看住。
    expect([...used('echo_family_006')]).toContain('c1')

    const mingtie = fired('echo_family_007')
    const withChild = [...deng, ...runs.filter(r => r.finalFlags.includes('has_children') && !deng.includes(r))]
    console.log(
      `有子 ${withChild.length} 局 · 《名帖》${mingtie.length} 局（${mingtie.map(r => `${r.policy}/${r.seed}`).join(' · ')}）· ` +
        `有子局的终局：${withChild.map(r => `${r.policy}/${r.seed}→${r.endingId ?? '未结案'}@${r.finalYear}`).join(' · ')}`
    )
    // 第六十一轮：这条下界从 4 改成 3，原因写清楚 —— 不是《名帖》坏了，是《不知所踪》按设计接人。
    // `hermit/1` 在第九十五月得子，第一百三十二月（1639）带着成对票被《不知所踪》接走，
    // 孩子实岁才 37 个月，够不到 72 个月那条《名帖》。那一格的选项正文写着
    // 「此标记将直接解锁结局」，现在它真的兑现了；少掉的一份样本就是这句承诺的代价。
    // 《名帖》机制本身另有两处不吃这批随机流的读数承重：
    // 本文件下面的反推存档（孩子满六岁当天开口 / 差一个月不开），以及 12 局【去母留子】专线。
    expect(mingtie.length, '有子的人不少，没有一个等到《名帖》').toBeGreaterThanOrEqual(3)
    // 棘轮：每一次《名帖》开口，孩子都必须已经满六岁（72 个月）。
    // 第五十四轮之前的这一格钉的是 `finalYear >= 1638`，而实测旧门下 15 次开口全落在 1638 年、
    // 孩子 28～102 个月都有 —— 年窗与正文「孩子到了入塾的年纪」之间没有因果关系。
    // 现在读的是孩子自己的月龄，所以这道棘轮钉的是正文承诺的那件事。
    const birthMonth = (r: SimOutcome) =>
      r.choiceLog.find(l => l.flagsAfter.includes('has_children') && !l.flagsBefore.includes('has_children'))
      ?.turn
    const cardAge = (r: SimOutcome) => {
      const born = birthMonth(r)
      const card = r.choiceLog.find(l => l.eventId === 'echo_family_007')
      return born === undefined || !card ? null : card.turn - born
    }
    const ages = mingtie.map(cardAge).filter((n): n is number => n !== null)
    expect(ages.length, '《名帖》播了却找不到孩子的出生记录 —— 门读的是出生月，不是公元年').toBe(mingtie.length)
    expect(
      ages.filter(a => a < 72),
      '有孩子没满六岁就收到了入塾名帖'
    ).toEqual([])
    expect([...used('echo_family_007')]).toEqual(expect.arrayContaining(['c3']))

    // 第六十六轮：《问丧》从这一批样本里撤下来了 —— 不是门变窄，是骰子挪位。
    // 它的触发链要求两件事同时成立：点过【灭口】（144 局里只有 3 局点到）、且活到 1635。
    // 样本撞不上不等于走不到，所以改按老规矩用**反推存档**钉门（见下一段《问丧》的定点用例）。
    // 样本这一侧只留一条不许自相矛盾的不变式：它若真被撞上，身上必须带着灭口与犯罪线。
    for (const r of fired('echo_family_008')) {
      expect(r.finalFlags).toContain('wife_murdered')
      expect(r.finalFlags).toContain('crime_line')
    }
  }, 240_000)
})

/**
 * 反推存档：把实测里那一局钉死。
 *
 * 网格只证明"这一支走得到"，不证明"走得到的那一步是对的"。第五十四轮实测
 * （10 策略 × 12 种子 = 120 局）里最典型的一局是 `heir#7883`：
 * 《无子之痛》c3【去母留子】在第 49 月同时写下 `concubine_killed` 与 `has_children`，
 * 《名帖》在第 123 月开口（孩子 74 个月），玩家点的是 c1【写亡母】。
 * 下面用同一份状态做确定性用例 —— 差一个月都不许开，开的那一天必须点得动。
 */
describe('反推存档：去母留子之后，孩子满六岁那天《名帖》才来', () => {
  const BORN = 49
  const mingtie = event('echo_family_007')
  const c1 = mingtie.choices.find(c => c.id === 'c1')!

  const kid = (age: number, extra: string[] = []) =>
    makeCharacter({
      degree: '举人',
      flags: ['has_children', ...extra],
      flagTurns: { has_children: BORN }
    })
  const stateAt = (age: number) => {
    const turn = BORN + age
    return makeGameState({ turn, currentYear: 1627 + Math.floor(turn / 12), currentMonth: (turn % 12) + 1 })
  }

  it('孩子 71 个月：门还关着', () => {
    expect(checkEventConditions(mingtie, kid(71), stateAt(71))).toBe(false)
  })

  it('孩子 72 个月（六岁入塾）：门开', () => {
    expect(checkEventConditions(mingtie, kid(72), stateAt(72))).toBe(true)
  })

  it('没满六岁的人即使站在旧年窗里也开不了 —— 那正是旧的 `year.min: 1638` 会放的', () => {
    // 1642 年在旧门下完全合格；这一局的孩子只有 7 个月。
    const baby = makeCharacter({ degree: '举人', flags: ['has_children'], flagTurns: { has_children: 164 } })
    expect(checkEventConditions(mingtie, baby, makeGameState({ turn: 171, currentYear: 1642 }))).toBe(false)
  })

  it('【写亡母】只出现在真走过【去母留子】的人面前，且说的是人话', () => {
    expect(checkChoiceRequirement(c1, kid(72, ['concubine_killed']), stateAt(72)).available).toBe(true)
    const locked = checkChoiceRequirement(c1, kid(72), stateAt(72))
    expect(locked.available).toBe(false)
    expect(locked.reason).toContain('妾室因你而死')
    expect(locked.reason).not.toMatch(/concubine_killed|[a-z_]{4,}/)
  })

  it('没点【去母留子】的人仍有路可走：【只写父名】永远点得动', () => {
    const c4 = mingtie.choices.find(c => c.id === 'c4')!
    expect(checkChoiceRequirement(c4, kid(72), stateAt(72)).available).toBe(true)
  })

  it('真引擎结算【写亡母】：三个数都入账，这一格被关掉，时间戳一起写下', async () => {
    const view = renderGameEngine({
      loadSaveData: makeSaveData({
        character: kid(72, ['concubine_killed']),
        currentEvent: mingtie,
        currentEventId: mingtie.id,
        gameState: stateAt(72)
      })
    })
    await flush()

    const before = view.result.current
    const turn = before.gameState.turn
    await act(async () => {
      before.handleChoice(c1)
    })

    const after = view.result.current
    expect(after.gameState.士绅, '【写亡母】的 士绅−6 没入账').toBeLessThan(before.gameState.士绅)
    expect(after.gameState.民望, '【写亡母】的 民望+5 没入账').toBeGreaterThan(before.gameState.民望)
    expect(after.character.hidden.道德值, '【写亡母】的 道德+8 没入账').toBeGreaterThan(before.character.hidden.道德值)
    expect(after.character.flags).toContain('echo_family_007_done')
    // 时间戳落在结算那一个月 —— 下一张读 `since` 的回响才有正确的起点
    expect(after.character.flagTurns?.echo_family_007_done).toBe(turn)
    view.unmount()
  })
})

/**
 * 反推存档：护妻 → 三年 → 灯花 → 孩子 → 六岁 → 名帖，一条链一次走通。
 *
 * 《灯花》三条分支都不设选项门（那是三种丈夫，不是三种资格），所以这里钉的是
 * "时间"而不是"资格"：门读的是护妻那一个月的月龄，孩子的门读的是落地那一个月。
 * 引擎结算 c2 那一条是链上唯一有争议的一支 —— 他先问的是男女，她从此心冷，
 * 但孩子必须真的写进状态，否则后面的《名帖》整段都是空的。
 */
describe('反推存档：护妻三年后灯花开，孩子六岁时名帖才来', () => {
  const deng = event('echo_family_006')
  const PROT = 10

  const protector = (extra: string[] = []) =>
    makeCharacter({
      degree: '举人',
      flags: ['protect_childless_wife', ...extra],
      flagTurns: { protect_childless_wife: PROT }
    })
  const stateAt = (turn: number) =>
    makeGameState({ turn, currentYear: 1627 + Math.floor(turn / 12), currentMonth: (turn % 12) + 1 })

  it('护妻之后满三年才开：差一个月不算三年', () => {
    expect(checkEventConditions(deng, protector(), stateAt(PROT + 35))).toBe(false)
    expect(checkEventConditions(deng, protector(), stateAt(PROT + 36))).toBe(true)
  })

  it('已经另有子嗣的人不再收到这张卡（notHas 那一支照旧生效）', () => {
    expect(checkEventConditions(deng, protector(['has_children']), stateAt(PROT + 60))).toBe(false)
  })

  it('三条分支对同一个人全点得动 —— 那是三种丈夫，不是三种资格', () => {
    for (const c of deng.choices) {
      expect(
        checkChoiceRequirement(c, protector(), stateAt(PROT + 36)).available,
        `${c.id} 被意外锁住了`
      ).toBe(true)
    }
  })

  it('真引擎结算 c2：孩子落地、时间戳落在落地那个月，此后《名帖》就按这个月算岁数', async () => {
    const view = renderGameEngine({
      loadSaveData: makeSaveData({
        character: protector(),
        currentEvent: deng,
        currentEventId: deng.id,
        gameState: stateAt(PROT + 36)
      })
    })
    await flush()
    const born = view.result.current.gameState.turn
    const c2 = deng.choices.find(c => c.id === 'c2')!
    await act(async () => {
      view.result.current.handleChoice(c2)
    })

    const after = view.result.current.character
    expect(after.flags).toEqual(expect.arrayContaining(['has_children', 'wife_hurt', 'echo_family_006_done']))
    expect(after.flagTurns?.has_children).toBe(born)

    // 同一份状态往前推：孩子满六岁之前，《名帖》不许插进来
    const mingtie = event('echo_family_007')
    const kidChar = makeCharacter({ degree: '举人', flags: ['has_children'], flagTurns: { has_children: born } })
    expect(checkEventConditions(mingtie, kidChar, stateAt(born + 71))).toBe(false)
    expect(checkEventConditions(mingtie, kidChar, stateAt(born + 72))).toBe(true)
    view.unmount()
  })
})

/**
 * 第五十四轮：《名帖》【写亡母】不再是纸面上的分支。
 *
 * 第四十六轮的读数是「240 局里【去母留子】点过 6 次，这 6 局全在 1633–1638 收束，
 * 一局都没活到年窗」，当时的结论是"那条路代价太重，不是门写错"。
 * 八轮改动之后重量：代价确实重，但**门也写错了**（年窗与孩子无关），而且旧网格根本没有
 * 一副朝嗣子走的画像 —— 6/240 是"路过"，不是"走过去"。
 * 所以这一格换 `heir` 画像（见 helpers/simulate.ts 的 HEIR 注释），把"专门走这一支"的人量出来。
 */
describe('专门走这一支的人：去母留子 → 六岁 → 写亡母', () => {
  const SEEDS = 12

  it('12 局里【去母留子】有人点、《名帖》有人开、【写亡母】有人落下', async () => {
    const runs: SimOutcome[] = []
    for (let i = 0; i < SEEDS; i++) {
      runs.push(
        await simulateRun({
          seed: 7600 + i * 31 + 'heir'.length,
          policy: 'heir',
          maxMonths: 260,
          logChoices: true
        })
      )
    }
    expect(runs.every(r => !r.error), '跑局本身报错').toBe(true)

    const picked = (eventId: string, choiceId: string) =>
      runs.filter(r => r.choiceLog.some(l => l.eventId === eventId && l.choiceId === choiceId))

    const killed = picked('emotion_core_003', 'c3')
    expect(killed.length, '12 局专门求嗣的人，没有一个点【去母留子】').toBeGreaterThanOrEqual(1)
    // 点了那条的人，身上必须真的带着"妾室因你而死"
    expect(killed.every(r => r.finalFlags.includes('concubine_killed'))).toBe(true)

    const wroteDeadMother = picked('echo_family_007', 'c1')
    expect(
      wroteDeadMother.length,
      '【写亡母】还是没人点得下 —— 这一支仍是纸面分支'
    ).toBeGreaterThanOrEqual(1)
    // 点它的人必然是【去母留子】走过来的人：门票只有一个写手
    expect(wroteDeadMother.every(r => r.finalFlags.includes('concubine_killed'))).toBe(true)

    for (const r of runs.filter(x => x.choiceLog.some(l => l.eventId === 'echo_family_007'))) {
      const born = r.choiceLog.find(
        l => l.flagsAfter.includes('has_children') && !l.flagsBefore.includes('has_children')
      )?.turn
      const card = r.choiceLog.find(l => l.eventId === 'echo_family_007')
      expect(born, '《名帖》开口却查不到出生记录').toBeDefined()
      expect(card!.turn - born!, `孩子 ${card!.turn - born!} 个月就收到入塾名帖`).toBeGreaterThanOrEqual(72)
    }
  }, 240_000)
})

/**
 * 反推存档：《问丧》读的是灭口与犯罪线，门开在 1635 之后。
 *
 * 第六十六轮从 36 局样本里撤下来的原因写在样本那一段：那一千多个月的随机流里，
 * 点过【灭口】的只有 3 局，且都没有活到 1635 —— 抽样撞不上，不等于这一格走不到。
 * 这里按第五十四轮《名帖》的老办法钉四件事：年窗两界、wife_murdered 那道门、
 * 【以势压人】只认犯罪线，以及真引擎结算时三个数都入账。
 */
describe('反推存档：灭口之后，妻族带着公信来问卒年', () => {
  const wensang = event('echo_family_008')
  const c2 = wensang.choices.find(c => c.id === 'c2')!

  const murderer = (flags: string[] = ['wife_murdered', 'crime_line']) =>
    makeCharacter({ degree: '举人', flags, flagTurns: { wife_murdered: 100, crime_line: 100 } })
  const stateAt = (year: number, month = 6) =>
    makeGameState({
      turn: (year - 1627) * 12 + (month - 1),
      currentYear: year,
      currentMonth: month
    })

  it('1634 年门关着，1635 年门开 —— 上下界都钉住', () => {
    expect(checkEventConditions(wensang, murderer(), stateAt(1634))).toBe(false)
    expect(checkEventConditions(wensang, murderer(), stateAt(1635))).toBe(true)
  })

  it('没灭过口的人撞不到这一问 —— 门读的是 wife_murdered，不是随便一场丧事', () => {
    expect(checkEventConditions(wensang, murderer(['crime_line']), stateAt(1638))).toBe(false)
  })

  it('【以势压人】只认犯罪线，锁住时说的是人话', () => {
    expect(checkChoiceRequirement(c2, murderer(), stateAt(1638)).available).toBe(true)
    const locked = checkChoiceRequirement(c2, murderer(['wife_murdered']), stateAt(1638))
    expect(locked.available).toBe(false)
    expect(locked.reason).not.toMatch(/crime_line|[a-z_]{4,}/)
  })

  it('真引擎结算【以势压人】：士绅升、民望与道德降，这一格被关掉，时间戳一起写下', async () => {
    const view = renderGameEngine({
      loadSaveData: makeSaveData({
        character: murderer(),
        currentEvent: wensang,
        currentEventId: wensang.id,
        gameState: stateAt(1638)
      })
    })
    await flush()

    const before = view.result.current
    const turn = before.gameState.turn
    await act(async () => {
      before.handleChoice(c2)
    })

    const after = view.result.current
    expect(after.gameState.士绅, '【以势压人】的 士绅+5 没入账').toBeGreaterThan(before.gameState.士绅)
    expect(after.gameState.民望, '【以势压人】的 民望−8 没入账').toBeLessThan(before.gameState.民望)
    expect(
      after.character.hidden.道德值,
      '【以势压人】的 道德−10 没入账'
    ).toBeLessThan(before.character.hidden.道德值)
    expect(after.character.flags).toContain('echo_family_008_done')
    expect(after.character.flagTurns?.echo_family_008_done).toBe(turn)
    view.unmount()
  })
})
