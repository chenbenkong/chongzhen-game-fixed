import { describe, expect, it } from 'vitest'
import { soulmateEvents } from '../../src/data/events/emotion/soulmate'
import { wifeEvents } from '../../src/data/events/emotion/wife'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import type { EventChoice } from '../../src/types/event'

/**
 * 三条情感回响的上游选项，不能是"纯亏"的。
 *
 * 第四十轮量到：`lixiangjun_respect`（《秦淮绝色》【敬而不扰】）只写在一百局里没人按的
 * 纯亏选项上；`abandoned_liushi`（《竹马青梅》【悔婚】）原先也是纯亏 —— 道德 −10、
 * 民望 −12、体质 −5，换不回任何东西。于是《桃叶渡再闻》《如烟嫁期》的文案写得再好，
 * 玩家没有理由走到它面前。
 *
 * 修法不是把回响门槛拆了，而是让那几条选项各自**有一个别人给不了的东西**，
 * 并且只给叙事上说得通的数值（不再用"赠玉佩加武略"这种凑数的加成）：
 *   · 【敬而不扰】给 道德+7（三选一里最高）与 机敏+3（知进退）；
 *   · 【留书答谢】用财帛换 清议+3、道德+5、机敏+3 与玉佩之约；
 *   · 【悔婚】给 野心+8、士绅+3 —— 一个明确的仕途交易，代价照旧。
 *
 * 第二段用真引擎跑：一个活到 1633 的平凡画像会不会真的把【敬而不扰】点下去、
 * 并在三年后撞见《桃叶渡再闻》。上一轮用随机组量到 0，是因为随机组 60 局里
 * 0 局活到 1633 —— 量具先死了，不是门锁着。这是本轮要记住的仪器坑。
 */

type Numbers = Record<string, number>
const delta = (c: EventChoice) => ({
  ...(c.effects?.attributes ?? {}),
  ...(c.effects?.gameState ?? {}),
  ...(c.effects?.hidden ?? {})
}) as Numbers

/** 这条选项在哪个维度上是三选一里唯一的最高值 */
const uniquePeaks = (choices: EventChoice[], c: EventChoice, keys: string[]): string[] => {
  const mine = delta(c)
  return keys.filter(k => choices.every(o => o.id === c.id || (mine[k] ?? -Infinity) > (delta(o)[k] ?? -Infinity)))
}

describe('情感回响的上游：三条选项各有各的不可替代', () => {
  const soulmate = soulmateEvents.find(e => e.id === 'emotion_soulmate_001')!
  const xianv = soulmateEvents.find(e => e.id === 'emotion_soulmate_005')!
  const wife = wifeEvents.find(e => e.id === 'emotion_wife_005')!

  it('【敬而不扰】不是纯亏：道德是三选一里最高的', () => {
    const c3 = soulmate.choices.find(c => c.id === 'c3')!
    expect(uniquePeaks(soulmate.choices, c3, ['道德值'])).toEqual(['道德值'])
    expect(delta(c3).道德值).toBeGreaterThanOrEqual(7)
    // 主动告辞不会长文才：这一格给的是"知进退"的眼力。
    expect(delta(c3).机敏值).toBeGreaterThan(0)
    expect(delta(c3).文韬 ?? 0).toBe(0)
    // 但它在文韬/清议上确实输给另外两条 —— 是取舍，不是无脑最优。
    expect(delta(c3).文韬 ?? 0).toBeLessThan(delta(soulmate.choices.find(c => c.id === 'c2')!).文韬!)
    expect(delta(c3).清议 ?? 0).toBeLessThan(delta(soulmate.choices.find(c => c.id === 'c1')!).清议!)
  })

  it('【留书答谢】用财帛换清议与道德，不是被【打听刺客】全面压过', () => {
    const c2 = xianv.choices.find(c => c.id === 'c2')!
    expect(uniquePeaks(xianv.choices, c2, ['清议', '道德值']).sort()).toEqual(['清议', '道德值'].sort())
    // 财帛是 Attributes：原先写成 effects.gameState.财帛，引擎不认，等于白送玉佩。
    expect(c2.effects?.attributes?.财帛).toBeLessThan(0)
    expect(Object.keys(c2.effects?.gameState ?? {})).not.toContain('财帛')
    // 赠一块玉练不出武艺：这一格不该再发一个和叙事无关的武略加成。
    expect(c2.effects?.attributes?.武略 ?? 0).toBe(0)
    expect(c2.effects?.flags?.add).toContain('xianv_token')
  })

  it('【悔婚】是一笔仕途交易：野心/士绅最高，但道德与民望照旧付出', () => {
    const c2 = wife.choices.find(c => c.id === 'c2')!
    const peaks = uniquePeaks(wife.choices, c2, ['野心值', '士绅'])
    expect(peaks.sort()).toEqual(['士绅', '野心值'])
    expect(delta(c2).道德值).toBeLessThan(0)
    expect(delta(c2).民望).toBeLessThan(0)
    // 悔婚不是体力活：不该顺手扣体质来凑"代价"。
    expect(delta(c2).体质 ?? 0).toBe(0)
  })
})

describe('回响 005 真跑局：活到 1633 才会播，量具必须先活着', () => {
  const SEEDS = 12

  it('平凡画像活过年窗，点了【敬而不扰】，就会等到《桃叶渡再闻》', async () => {
    const runs: SimOutcome[] = []
    for (let i = 0; i < SEEDS; i++) {
      runs.push(
        await simulateRun({ seed: 8000 + i, policy: 'ordinary', origin: '诗文清望', maxMonths: 260 })
      )
    }
    const alive33 = runs.filter(r => r.finalYear >= 1633).length
    const respect = runs.filter(r => (r.finalFlags ?? []).includes('lixiangjun_respect'))
    const echo = runs.filter(r => r.firedEventIds.includes('echo_emotion_005'))
    console.log(
      `  ${SEEDS} 局：活到1633 ${alive33}，敬而不扰 ${respect.length}，桃叶渡再闻 ${echo.length}`
    )
    expect(alive33, '量具自己都活不到年窗，就别拿 0 当"门锁着"').toBeGreaterThanOrEqual(SEEDS)
    expect(respect.length, '没有一个玩家有理由点【敬而不扰】').toBeGreaterThanOrEqual(SEEDS / 2)
    expect(echo.length, '拿到了 respect 却没人等到回响 —— 才是回响真的不可达').toBeGreaterThanOrEqual(
      Math.floor(SEEDS / 2)
    )
  }, 240_000)
})
