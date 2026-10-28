import { beforeAll, describe, expect, it } from 'vitest'
import { transitionEvents } from '../../src/data/events'
import { allEndingEvents } from '../../src/data/events/ending'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 第六十八轮：医家第二拍《疫起》为什么一次都没播（§1.4 ㊷ / ㊸）。
 *
 * ㊷ 的原始归因是「《悬壶济世》与《疫起》的年窗下沿撞在 1640 同一格，结局格先收人」。
 * 本轮先按这个假设做了一次定向实验：只把《悬壶济世》的下沿抬到 1642，判据一字未动 ——
 * 结果《疫起》仍然播 0 次，本格结案反而从 20 局掉到 **0** 局，那 20 局改由《清流骨鲠》在
 * 1640 年收走。**已回滚，负结果留档。**
 *
 * 真正的病灶在年窗之外。把带医疗票那 67 局的**抉择数按年**抄下来：
 *   1639×896 / 1640×69 / **1641 起为 0**
 * 落点是《边关大将》43 局（1638–1639）、《悬壶济世》18 局（1640）、《病逝任上》4 局、《清流骨鲠》2 局
 * —— **没有一局活过 1640**。《疫起》原来的年窗 1640–1643 对这一副画像因此就是
 * **没人居住的年份**：门开着，而门口没有活人（㊸）。修法因此是**把第二拍搬回有人住的年份**：
 * 下沿 1640 → 1639，与《悬壶之念》的 1638 相接（正文「又是一年大疫」本来就是接前一年的话头），
 * 并把正文里钉死的「崇祯十四年」改成不指明年份 —— 年窗跨 1639–1643，正文不许只讲一年。
 *
 * 抬第二拍的下沿不是降门槛：门槛（医疗票）一字未动，只是把"考试"挪到玩家真的活着的那一年。
 *
 * 第七十一轮：《悬壶济世》补了一道**时长门**（`sinceAny`，任意一张医疗票满 24 个月，列表形状的 OR）。
 * 装门之前先抄了那张票的年龄分布：不带门时结在《悬壶济世》的局，结案时最老一张票 17~25~36 个月，
 * 也就是说"习医第二年就名满天下"也在收人。阶梯（192 局/档）：不装门 13、6 与 12 各 13、
 * 18 → 12、**24 → 7**、36 → **0**（格子直接死掉，已弃）。取 24 是最大的一档活口。
 * 这一批 160 局（ambitious）的结案数因此从 18 掉到 9；下界按"留三分之一余量"钉在 6。
 */

const HEALER = 'route_medical_healer'
const PLAGUE = 'route_medical_plague'
const SAINT = 'ending_medical_saint'

const eventById = (id: string) => transitionEvents.find(e => e.id === id)
const endingById = (id: string) => allEndingEvents.find(e => e.id === id)

/** 医疗票池 —— 第二拍与结局格读的是同一份；㊷ 曾把"撞车"当成病根，㊸ 量出病根在年窗之外 */
const MEDICAL_TICKETS = ['习医', '行医', '开馆行医', '赈灾行医', '仁心仁术']

describe('医家线：三张判据的年窗次序', () => {
  it('《疫起》开门读的门票是《悬壶之念》写下的那几张', () => {
    const any = eventById(PLAGUE)?.conditions?.flags?.any ?? []
    expect(any).toEqual(expect.arrayContaining(MEDICAL_TICKETS))
  })

  it('结局格的年窗下沿晚于第二拍的年窗下沿 —— 否则第二拍永远轮不到', () => {
    const plagueMin = eventById(PLAGUE)?.conditions?.year?.min ?? 0
    const saintMin = endingById(SAINT)?.conditions?.year?.min ?? 0
    expect(
      saintMin,
      `《悬壶济世》下沿 ${saintMin} 不晚于《疫起》下沿 ${plagueMin}：同一格里结局先收人，第二拍不可能播`
    ).toBeGreaterThan(plagueMin)
  })
})

/**
 * 引擎层采样：4 出身 × 40 种子 = 160 局，画像 ambitious（医家线唯一走得动的画像）。
 *
 * 修完之后这一批的读数（下沿 1639 之后）：
 *   悬壶之念 33（1638×31 1639×2）→ 疫起 28（全在 1639）→ 悬壶济世 结案 18（全在 1640，18/18 播过疫起）
 * 阈值按「留四成余量」定下界，不是精确值 —— 采样波动与无关内容的增删都会让读数挪动。
 */
const ORIGINS: OriginType[] = ['缙绅', '寒门', '胥吏', '海商']
const SEEDS = 40

const runs: SimOutcome[] = []

const firedRuns = (id: string) => runs.filter(r => r.firedEventIds.includes(id))
/** 某一拍在哪些**年份**播出来 —— choiceLog 里带 year，firedTurns 只有月份格 */
const fireYears = (id: string) => {
  const out: number[] = []
  for (const r of runs) for (const c of r.choiceLog) if (c.eventId === id) out.push(c.year)
  return out.sort((a, b) => a - b)
}
const hist = (years: number[]) => {
  const m = new Map<number, number>()
  for (const y of years) m.set(y, (m.get(y) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}×${n}`).join(' ')
}
const countEnding = (id: string) => runs.filter(r => r.endingId === id).length

beforeAll(async () => {
  for (const origin of ORIGINS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      runs.push(await simulateRun({ seed, policy: 'ambitious', origin, maxMonths: 260, logChoices: true }))
    }
  }
  const saintRuns = runs.filter(r => r.endingId === SAINT)
  const withTicket = runs.filter(r => MEDICAL_TICKETS.some(t => r.finalFlags.includes(t)))
  const landfall = new Map<string, number>()
  for (const r of withTicket) {
    const key = r.endingTitle ?? r.endReason ?? '未结案'
    landfall.set(key, (landfall.get(key) ?? 0) + 1)
  }
  console.log(
    `  医家线 ${runs.length} 局：` +
      `${HEALER} 播出=${firedRuns(HEALER).length}（${hist(fireYears(HEALER))}）| ` +
      `${PLAGUE} 播出=${firedRuns(PLAGUE).length}（${hist(fireYears(PLAGUE))}）| ` +
      `结在悬壶济世=${countEnding(SAINT)}（终局年 ${hist(saintRuns.map(r => r.finalYear))}）| ` +
      `其中播过疫起=${saintRuns.filter(r => r.firedEventIds.includes(PLAGUE)).length}`
  )
  const ended = new Map<string, number>()
  for (const r of runs) {
    const key = `${r.finalYear} ${r.endingTitle ?? r.endReason ?? '未结案'}`
    ended.set(key, (ended.get(key) ?? 0) + 1)
  }
  const oldestAtClosure = runs
    .filter(r => r.endingId === SAINT)
    .map(r => Math.max(...MEDICAL_TICKETS.filter(t => r.finalFlags.includes(t)).map(t => r.months - (r.finalFlagTurns[t] ?? r.months))))
    .sort((a, b) => a - b)
  console.log(
    `  结在《悬壶济世》的 ${oldestAtClosure.length} 局，最老医疗票年龄 ${oldestAtClosure[0] ?? '-'}~` +
      `${oldestAtClosure[Math.floor(oldestAtClosure.length / 2)] ?? '-'}~${oldestAtClosure[oldestAtClosure.length - 1] ?? '-'} 个月` +
      `（时长门下沿 ${endingById(SAINT)?.conditions?.flags?.sinceAny?.min ?? '-'}）`
  )
  console.log(
    `  全部 ${runs.length} 局终局：` +
      [...ended.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t}×${n}`).join(' ')
  )
  console.log(
    `  带医疗票的 ${withTicket.length} 局落点：` +
      [...landfall.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(' ')
  )
  // 诊断量具（本轮记账用）：带票的局在 1640–1643 各年做了多少次抉择、
  // 其中 transition 抽到了谁 —— 用来分清「门没开」与「开了没抽到」。
  const perYearChoices = new Map<number, number>()
  const transIds = new Set(transitionEvents.map(e => e.id))
  const drawnTrans = new Map<string, number>()
  for (const r of withTicket) {
    for (const c of r.choiceLog) {
      if (c.year < 1639 || c.year > 1645) continue
      perYearChoices.set(c.year, (perYearChoices.get(c.year) ?? 0) + 1)
      if (transIds.has(c.eventId)) drawnTrans.set(c.eventId, (drawnTrans.get(c.eventId) ?? 0) + 1)
    }
  }
  console.log(
    `  带票局 1639–1645 抉择数：` +
      [...perYearChoices.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}×${n}`).join(' ') +
      ` | 其间抽中的 transition：` +
      [...drawnTrans.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t}×${n}`).join(' ')
  )
}, 300_000)

describe('医家线：引擎里真的播得出来', () => {
  it('模拟本身跑得干净（否则下面的读数不成立）', () => {
    expect(runs.filter(r => r.error).map(r => `${r.seed} ${r.error}`)).toEqual([])
    expect(runs.filter(r => r.badNumbers.length).map(r => String(r.seed))).toEqual([])
    expect(runs.filter(r => !r.ended).length, '每局都该在时限内结束').toBe(0)
  })

  it('《悬壶之念》播得出来 —— 入路死了后面都白搭', () => {
    expect(firedRuns(HEALER).length, '《悬壶之念》一次都没播').toBeGreaterThanOrEqual(20)
  })

  it('《疫起》播得出来 —— 修之前这一批是 0', () => {
    expect(firedRuns(PLAGUE).length, `《疫起》只播了 ${firedRuns(PLAGUE).length} 局（下界 16）`).toBeGreaterThanOrEqual(16)
  })

  it('把第二拍搬回有人住的年份，不许把收束格搬死', () => {
    // 定向实验的负结果就钉在这里：抬《悬壶济世》的下沿曾让本格结案 20 → 0。
    // 第七十一轮的时长门又会削一刀（18 → 9），所以下界降到 6 —— 但仍必须结得了案：
    // 这一格死掉，医家线的心愿就只剩一段没有落款的旅程。
    expect(countEnding(SAINT), `《悬壶济世》只结案 ${countEnding(SAINT)} 局（下界 6）`).toBeGreaterThanOrEqual(6)
  })

  it('《悬壶济世》的时长门是列表形状 —— 任意一张票满 24 个月，不是五张都得满', () => {
    const f = endingById(SAINT)?.conditions?.flags
    expect(f?.sinceAny?.flags, '时长门不覆盖医疗票池').toEqual(expect.arrayContaining(MEDICAL_TICKETS))
    expect(f?.sinceAny?.min).toBe(24)
    // `since`（AND）配 `any` 网会把"任意一张"悄悄收窄成"每一张"—— 第六十九轮记过的那个坑。
    expect(f?.since, '结局格又长出了 AND 形状的时长门').toBeUndefined()
  })

  it('结案时，最老的一张医疗票已经满 24 个月', () => {
    const tooYoung = runs
      .filter(r => r.endingId === SAINT)
      .map(r => {
        const ages = MEDICAL_TICKETS.filter(t => r.finalFlags.includes(t)).map(t => ({
          ticket: t,
          age: r.months - (r.finalFlagTurns[t] ?? r.months),
        }))
        return { r, oldest: ages.sort((a, b) => b.age - a.age)[0] }
      })
      .filter(({ oldest }) => !oldest || oldest.age < 24)
    expect(
      tooYoung.map(({ r, oldest }) => `${r.seed} 最老 ${oldest?.ticket ?? '无票'}=${oldest?.age ?? '-'}月`),
      '有局在"行医还不满两年"时就被封了悬壶济世'
    ).toEqual([])
  })

  it('《悬壶之念》交出的票与结果卡宣告的一致 —— 不许静默多塞一张', () => {
    const c2 = eventById(HEALER)?.choices?.find(c => c.id === 'c2')
    const written = c2?.effects?.flags?.add ?? []
    const tags = c2?.result?.tags ?? []
    expect(written, '《悬壶之念》c2 又把"赈灾行医"塞回来了').not.toContain('赈灾行医')
    expect(tags, '结果卡宣告了没写进去的票').not.toContain('赈灾行医')
    expect(written.filter(f => !tags.includes(f)), '写进去却没告诉玩家的票').toEqual([])
  })

  it('凡播出《疫起》，身上必带着医疗票', () => {
    const missing = firedRuns(PLAGUE).filter(r => !MEDICAL_TICKETS.some(t => r.finalFlags.includes(t)))
    const healerYears = hist(fireYears(HEALER))
    expect(
      missing.map(r => `${r.seed}/${r.policy}`),
      `播了第二拍却没有门票（《悬壶之念》播出年份：${healerYears}）`
    ).toEqual([])
  })

  it('结在《悬壶济世》的局，先见过疫情', () => {
    const saintRuns = runs.filter(r => r.endingId === SAINT)
    const withoutPlague = saintRuns.filter(r => !r.firedEventIds.includes(PLAGUE))
    expect(
      withoutPlague.length,
      `${saintRuns.length} 局里 ${withoutPlague.length} 局没经过第二拍就结案 —— 结局仍在抢跑`
    ).toBeLessThanOrEqual(Math.floor(saintRuns.length / 3))
  })
})
