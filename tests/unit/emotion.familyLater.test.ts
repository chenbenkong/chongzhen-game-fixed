import { describe, expect, it } from 'vitest'
import { familyLaterEchoEvents } from '../../src/data/events/echo/familyLater'
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
    // 年窗对应正文里的"三年后""多年后"，不是随手写的。
    expect(event('echo_family_006').conditions?.year).toEqual({ min: 1635, max: 1644 })
    expect(event('echo_family_007').conditions?.year).toEqual({ min: 1638, max: 1644 })
    expect(event('echo_family_008').conditions?.year).toEqual({ min: 1635, max: 1644 })
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

  it('《名帖》六条分支只写一次性开关，读的却是两种身世', () => {
    const e = event('echo_family_007')
    for (const c of e.choices) {
      const rest = adds(c).filter(f => f !== 'echo_family_007_done')
      expect(rest, `${c.id} 又造了新词：${rest.join(',')}`).toEqual([])
      expect(adds(c)).toContain('echo_family_007_done')
    }
    // 亡母/病故 两路只在"去母留子"之后出现；写生母 一路覆盖纳妾、偏宠与伤心。
    expect(choiceGate(e.choices.find(c => c.id === 'c1')!)).toContain('concubine_killed')
    expect(choiceGate(e.choices.find(c => c.id === 'c6')!)).toContain('concubine_killed')
    const c2 = choiceGate(e.choices.find(c => c.id === 'c2')!)
    expect(c2).toEqual(expect.arrayContaining(['concubine_for_heir', 'wife_jealous', 'wife_hurt']))
    // 记在正室名下 / 问孩子 读的是前两波刚写出来的体面。
    expect(choiceGate(e.choices.find(c => c.id === 'c3')!)).toEqual(
      expect.arrayContaining(['legitimate_heir', 'wife_respected', 'harmonious_family'])
    )
    expect(choiceGate(e.choices.find(c => c.id === 'c5')!)).toEqual(
      expect.arrayContaining(['harmonious_family', 'protect_childless_wife'])
    )
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

describe('家宅第三波真跑局：三条回响都撞得到', () => {
  const SEEDS = 3

  it('36 局里三条都播出，且《灯花》的每个孩子都落了地', async () => {
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
    expect([...used('echo_family_006')]).toEqual(expect.arrayContaining(['c1', 'c2']))

    const mingtie = fired('echo_family_007')
    expect(mingtie.length, '有子的人不少，没有一个等到《名帖》').toBeGreaterThanOrEqual(4)
    expect([...used('echo_family_007')]).toEqual(
      expect.arrayContaining(['c1', 'c3', 'c5'])
    )
    expect(
      mingtie.every(r => r.finalYear >= 1638),
      '《名帖》在 1638 年之前播了'
    ).toBe(true)

    const wensang = fired('echo_family_008')
    expect(wensang.length, '灭口之后再无人问 —— 《问丧》没播过').toBeGreaterThanOrEqual(1)
    expect([...used('echo_family_008')]).toContain('c2')
    for (const r of wensang) {
      expect(r.finalFlags).toContain('wife_murdered')
      expect(r.finalFlags).toContain('crime_line')
    }
  }, 240_000)
})
