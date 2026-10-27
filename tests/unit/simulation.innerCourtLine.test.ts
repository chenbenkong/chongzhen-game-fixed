import { beforeAll, describe, expect, it } from 'vitest'
import { transitionEvents } from '../../src/data/events'
import { allEndingEvents } from '../../src/data/events/ending'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 第六十七轮：内廷暗线的「门」与「路」。
 *
 * 上半截是数据层：五拍每一拍读的必须真的是上一拍写下的经历 —— 改一个 flag 名，
 * 这条线就静默断开，而 `audit:shape` / `audit:choice-count` 都不会响。
 * 下半截是引擎层：用三副只想走这条线的画像（simulate.ts 的 eunuch / eunuchBacklash /
 * eunuchExit）真跑 180 局，证明五拍都播得出来、三格结局都结得了案。
 *
 * 为什么 002 会比 001 多：入幕有两张门票 —— 本线第一拍拍下来的「内廷奥援 / 半门之客」，
 * 以及旧的党派回响 `echo_faction_001`（门生帖）写下的同一对经历。后者是**自然分流**，
 * 不是漏了第一拍，所以这里不许断言「002 必然跟着 001」。
 */

const BEATS = ['inner_court_001', 'inner_court_002', 'inner_court_003', 'inner_court_004', 'inner_court_005']

/** 每一拍开门要读的上一拍经历（任一即可）—— 与下面数据层的断言是同一张表 */
const BEAT_TICKETS: Record<string, string[]> = {
  inner_court_002: ['内廷奥援', '半门之客'],
  inner_court_003: ['厂卫差事', '税关差事', '传奉差事'],
  inner_court_004: ['司礼监门下', '厂卫门下'],
  inner_court_005: ['抽身之意']
}

const ENDING_FLAGS: Record<string, string[]> = {
  ending_inner_court_chancellor: ['内廷外相'],
  ending_inner_court_backlash: ['厂卫外援', '反戈内廷'],
  ending_inner_court_escape: ['洗手不干']
}

const eventById = (id: string) => transitionEvents.find(e => e.id === id)

describe('内廷暗线：五拍的门读的是上一拍的可见经历', () => {
  it('五拍都注册进了 transitionEvents，且各自带自己的 storyline', () => {
    for (const id of BEATS) {
      const e = eventById(id)
      expect(e, `${id} 不在 transitionEvents 里 —— 注册漏了，整条线不会播`).toBeTruthy()
      expect(e!.storyline).toBe('eunuch')
    }
  })

  it('每拍 3–4 个选项（含锁），且每拍至少有一条不锁的路', () => {
    for (const id of BEATS) {
      const choices = eventById(id)!.choices ?? []
      expect(choices.length, `${id} 选项数`).toBeGreaterThanOrEqual(3)
      expect(choices.length, `${id} 选项数`).toBeLessThanOrEqual(4)
      expect(
        choices.filter(c => !c.showConditions || Object.keys(c.showConditions).length === 0).length,
        `${id} 一个不锁的选项都没有`
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('后四拍的 flags 门读的正是上一拍写下的经历', () => {
    for (const [id, tickets] of Object.entries(BEAT_TICKETS)) {
      const flags = (eventById(id)!.conditions?.flags ?? {}) as {
        any?: string[]
        has?: string[]
      }
      const gate = [...(flags.any ?? []), ...(flags.has ?? [])]
      expect(
        tickets.some(t => gate.includes(t)),
        `${id} 的门没有读上一拍的任何经历（门里有：${gate.join(',') || '空'}；` +
          `应读：${tickets.join('/')}）—— 改 flag 名会把这条线静默断开`
      ).toBe(true)
    }
  })

  it('三格结局的 flags 判据读的是第五拍/第四拍写下的终局经历', () => {
    for (const [id, expected] of Object.entries(ENDING_FLAGS)) {
      const ending = (allEndingEvents as any[]).find(e => e.id === id)
      expect(ending, `${id} 不在结局池里`).toBeTruthy()
      const flags = ending.conditions?.flags ?? {}
      const gate = [...(flags.any ?? []), ...(flags.has ?? [])]
      expect(
        expected.some(f => gate.includes(f)),
        `${id} 的判据没有读 ${expected.join('/')}（实际门：${gate.join(',') || '空'}）`
      ).toBe(true)
    }
  })

  it('三格在图鉴里的卷与档对得上各自的正文', () => {
    // 《内廷外相》归**浮沉卷**（「名实相副，毁誉参半；功过交织，难定一字」）——
    // 它的盖棺正文自己写的是"士论惜之"，而仕林卷的卷首语是"文臣正途；遗爱在民"。
    // 玩家在一个许诺"遗爱在民"的卷里翻到一方内相的铜印，那是图鉴在替玩家做错评。
    // 另两格归个志卷：一场抄家、一场乡居，都是私我归宿，不是朝局归属。
    const PLACEMENT: Record<string, { category: string; tier: string }> = {
      ending_inner_court_chancellor: { category: 'gray', tier: 'dark' },
      ending_inner_court_backlash: { category: 'personal_fate', tier: 'tragic' },
      ending_inner_court_escape: { category: 'personal_fate', tier: 'bittersweet' }
    }
    for (const [id, want] of Object.entries(PLACEMENT)) {
      const cfg = (allEndingEvents as any[]).find(e => e.id === id)!.endingConfig
      expect(cfg?.category, `${id} 不在「${want.category}」卷里`).toBe(want.category)
      expect(cfg?.tier, `${id} 的档次与正文不符`).toBe(want.tier)
    }
  })
})

/**
 * 引擎层采样：4 出身 × 3 副画像 × 15 种子 = 180 局。
 *
 * 阈值是这一批实测按「留四成余量」定下的下界，不是精确值：
 *   001 146 / 002 177 / 003 175 / 004 39 / 005 16
 *   外相 22 / 反噬 16 / 抽身 16
 * 采样波动与无关内容的增删都会让读数挪动，所以下界只钉「这条线还活着」。
 */
const ORIGINS: OriginType[] = ['寒门', '缙绅', '胥吏', '海商']
const POLICIES = ['eunuch', 'eunuchBacklash', 'eunuchExit'] as const
const SEEDS = 15

const runs: SimOutcome[] = []

const countFired = (id: string) => runs.filter(r => r.firedEventIds.includes(id)).length
const countEnding = (id: string) => runs.filter(r => r.endingId === id).length

beforeAll(async () => {
  for (const origin of ORIGINS) {
    for (const policy of POLICIES) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        runs.push(await simulateRun({ seed, policy, origin, maxMonths: 260 }))
      }
    }
  }
  console.log(
    `  内廷暗线 ${runs.length} 局：` +
      BEATS.map(b => `${b.slice(-3)}=${countFired(b)}`).join(' ') +
      ' | ' +
      Object.keys(ENDING_FLAGS).map(e => `${e.replace('ending_inner_court_', '')}=${countEnding(e)}`).join(' ')
  )
}, 300_000)

describe('内廷暗线：引擎里真的播得出来、结得了案', () => {
  it('模拟本身跑得干净（否则下面的读数不成立）', () => {
    expect(runs.filter(r => r.error).map(r => `${r.seed} ${r.error}`)).toEqual([])
    expect(runs.filter(r => r.badNumbers.length).map(r => String(r.seed))).toEqual([])
    expect(runs.filter(r => !r.ended).length, '每局都该在时限内结束').toBe(0)
  })

  it('五拍都播出过 —— 每一拍的下界按实测留四成余量', () => {
    const bounds: Record<string, number> = {
      inner_court_001: 90,
      inner_court_002: 110,
      inner_court_003: 110,
      inner_court_004: 22,
      inner_court_005: 14
    }
    for (const [id, min] of Object.entries(bounds)) {
      expect(countFired(id), `${id} 只播了 ${countFired(id)} 局（下界 ${min}）`).toBeGreaterThanOrEqual(min)
    }
  })

  it('三格结局都结过案，且年窗都在 1636 之后', () => {
    const bounds: Record<string, number> = {
      ending_inner_court_chancellor: 12,
      ending_inner_court_backlash: 9,
      ending_inner_court_escape: 14
    }
    for (const [id, min] of Object.entries(bounds)) {
      expect(countEnding(id), `${id} 只结案 ${countEnding(id)} 局（下界 ${min}）`).toBeGreaterThanOrEqual(min)
      for (const run of runs.filter(r => r.endingId === id)) {
        const floor = id === 'ending_inner_court_chancellor' ? 1638 : 1636
        expect(run.finalYear, `${id} 的终局年份`).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('凡播出后四拍，身上必带着上一拍写下的那张门票', () => {
    for (const [id, tickets] of Object.entries(BEAT_TICKETS)) {
      const fired = runs.filter(r => r.firedEventIds.includes(id))
      const missing = fired.filter(r => !tickets.some(t => r.finalFlags.includes(t)))
      expect(
        missing.map(r => `${r.seed}/${r.policy}`),
        `${id} 播了却没有门票 ${tickets.join('/')} —— 引擎和数据的口径不一致`
      ).toEqual([])
    }
  })

  it('三格结局的终局经历与判据一致', () => {
    for (const [id, flags] of Object.entries(ENDING_FLAGS)) {
      const hit = runs.filter(r => r.endingId === id)
      const wrong = hit.filter(r => !flags.some(f => r.finalFlags.includes(f)))
      expect(wrong.map(r => `${r.seed}/${r.policy}`), `${id} 的终局经历对不上`).toEqual([])
    }
  })
})
