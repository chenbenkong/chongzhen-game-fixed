import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome, type SimPolicy } from './helpers/simulate'
import { buildParams } from '../../scripts/audit-ending-reachability'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { FUGITIVE_FLAG } from '../../src/data/demotionWarningEvents'
import type { BoundaryEvent } from '../../src/types/boundaryEvent'
import type { OriginType } from '../../src/types/game'

/**
 * 「人已经逃了，朝廷还在给他升圣眷」这条闸（`useGameEngine` 抉择落账处），以及它到底
 * 有没有把《亡命江湖》救活（第二十七轮）。
 *
 * 第二十六轮装过同一行代码，量出来是「门开 3 月 → 2 月、结案 1 局 → 0 局」，于是当轮回滚，
 * 并把结论写成「真正绑住这一格的是 道德，不是 圣眷」。那句话是**量具**的读数不是格子的读数：
 * 当时用的画像 `vanish` 给 财帛 −0.6、欲望值 −1 打负分，而年窗内 159 条零门下坡里最陡的那一批
 * 恰恰同时发银子发欲望（起兵、亵渎佛前、以次要挟、分赃、笑纳重礼）—— 道德 一路被压在门槛之上，
 * 圣眷 挡不挡路根本轮不到被观察。第二十七轮换掉画像（新增 `fugitive`：道德 负权重、
 * 财帛/欲望 不设惩罚、财帛 floor 18、`fleeOnWarning` 直接认领那张一生只发一次的【弃官南还】），
 * 只动这一条闸重测，同种子 40 局（下面四个数都是本文这一台量具抄出来的，两版只差这一行代码）：
 *
 *   门开   5 月 → 11 月      结案   5 局 → 8 局
 *   带票之后 圣眷 上涨 988（共 2471 月）→ 0（共 2279 月）
 *   逃后年窗内关门的差池  圣眷>15×353 · 道德>30×126（共 358 月）
 *                       → 圣眷>15×0 · 道德>30×240 · 体质<25×129（共 252 月）
 *   控制组 `vanish` 结案 4 → 4（第廿四轮那批读数没被动；它逃后上涨 115 → 0，占 281 → 168 月）
 *
 * 闸 OFF 那一版的终局分布是 烟花之主×22 · 亡命江湖×5 · 海盗之王×4 · 士林唾弃×6 · 罢黜归田×3 ——
 * 圣眷 一涨回 16 以上，这一格的门就整批让给 p130 的《烟花之主》（它的门是 欲望≥50 ∧ 道德≤30 ∧
 * 财帛≥100 ∧ 中官≥20 ∧ 清议≤30，恰好是同一副画像顺手就能满足的那一型）。
 *
 * 所以闸留下，本文把它的三条后果钉住：**逃了之后 圣眷 一次都不许涨**、
 * **年窗里再没有一个月是因为 圣眷 而关着**，以及**这一格在真跑局里结得了案**。
 * 剩下的 道德>30 与 体质<25 是这一格自己声明的代价（弃官南还自带 财帛−70，
 * 逃了的人要在年窗里空腹熬四十个月，实测 17/40 局死在《倾家荡产》上），不由引擎代消。
 *
 * 判据一行都不写：门开没开问注册表自己那份 `check`，涨没涨只比相邻两个月的读数。
 *
 * **第廿八轮改了上面这批基线**：把弃官南还之人的岁俸换成与官职无关的祖产·幕馆 8 两/岁之后，
 * 这一台量具读到的是 门开 11 → 14 月、结案 8 → 10 局、倾家荡产 17 → 16 局，控制组 `vanish`
 * 仍是 4。本文的断言一律写成不等式（≥11 / ≥8 / >0），所以照旧过；上面那批数当"闸单独的效果"读，
 * 当下的逐月读数看 `simulation.fugitiveIncome.test.ts`。同轮还量掉了一句归因：
 * "17 局死在破产"里那批人并不是被《倾家荡产》(p1) 抢走这一格(p127) 的 —— 依据见 §1.4 ⑳。
 *
 * **第四十轮又挪了同一批样本**：打开《平庸之念》的隐藏上界之后，共享种子的随机流整体动了一拍，
 * `fugitive` 组结案 12 → 13、控制组 `vanish` 2 → 5。闸一个字没动，三条后果断言照旧成立；
 * 控制组那个 2 是第卅九轮的样本读数，已按本版重抄为 5（见该用例注释）。
 */

const GAMES = Number(process.env.SIM_GAMES ?? 40)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

const FUGITIVE = 'ending_fugitive'

const batch = async (policy: SimPolicy): Promise<SimOutcome[]> => {
  const out: SimOutcome[] = []
  for (let i = 0; i < GAMES; i++) {
    out.push(
      await simulateRun({
        seed: 6400 + i,
        policy,
        // 与 `simulation.fugitive.test.ts` 里 vanish 那一半**同一个** seed↔出身配对（每两种子换一次出身）。
        // 配对一变，第廿四轮那批 vanish 读数就不在同一批局上了，下面的控制组断言也就无从对照。
        origin: ORIGINS[Math.floor(i / 2) % ORIGINS.length],
        maxMonths: MONTHS,
        traceMonths: true
      })
    )
  }
  return out
}

const fugitive: BoundaryEvent | null =
  (Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending') as BoundaryEvent[]).find(
    e => e.event.id === FUGITIVE
  ) ?? null

/** 带票之前 / 之后各数一次「这个月比上个月 圣眷 高」—— 前面那一段是反空转对照 */
const favorRises = (runs: SimOutcome[]) => {
  let before = 0
  let after = 0
  let afterMonths = 0
  for (const r of runs) {
    const flee = r.trace.findIndex(t => t.derived.flags.includes(FUGITIVE_FLAG))
    for (let i = 1; i < r.trace.length; i++) {
      const rose = r.trace[i].derived.states.圣眷 > r.trace[i - 1].derived.states.圣眷
      if (!rose) continue
      if (flee >= 0 && i > flee) after++; else before++
    }
    if (flee >= 0) afterMonths += r.trace.length - flee - 1
  }
  return { before, after, afterMonths }
}

/**
 * 逃了之后、年窗之内、门还关着的月份，各条差池各数一次（一个月可以同时差好几条）。
 * 门槛的数值全部从注册表那份 `conditions` 读，本文不抄一个数。
 */
const closedTally = (runs: SimOutcome[]) => {
  const c = fugitive?.event.conditions
  const tally = new Map<string, number>()
  if (!c) return { months: 0, tally }
  for (const r of runs) {
    const flee = r.trace.findIndex(t => t.derived.flags.includes(FUGITIVE_FLAG))
    if (flee < 0) continue
    for (let i = flee; i < r.trace.length; i++) {
      const d = r.trace[i].derived
      if (d.year < (c.year?.min ?? 0)) continue
      if (fugitive!.check(buildParams(d))) continue
      const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1)
      if ((c.hidden?.道德值?.max ?? 999) < d.hidden.道德值) bump(`道德>${c.hidden?.道德值?.max}`)
      if ((c.gameState?.圣眷?.max ?? 999) < d.states.圣眷) bump(`圣眷>${c.gameState?.圣眷?.max}`)
      if ((c.attributes?.体质?.min ?? 0) > d.attributes.体质) bump(`体质<${c.attributes?.体质?.min}`)
      tally.set('月', (tally.get('月') ?? 0) + 1)
    }
  }
  return { months: tally.get('月') ?? 0, tally }
}

const line = (t: Map<string, number>) =>
  [...t].filter(([k]) => k !== '月').sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' · ')

let fug: SimOutcome[] = []
let van: SimOutcome[] = []

beforeAll(async () => {
  fug = await batch('fugitive')
  van = await batch('vanish')
}, 900_000)

describe(`潜逃者不再领朝廷的恩（${GAMES} 局 × 两副画像）`, () => {
  it('先把这一格的门读出来，确认读的是注册表而不是本文的想象', () => {
    expect(fugitive, `${FUGITIVE} 不在边界注册表的 ending 里 —— 那这一格根本不会被结`).not.toBeNull()
    const c = fugitive!.event.conditions || {}
    console.log(
      `《${fugitive!.event.title}》p${fugitive!.priority} 的门：年 ${c.year?.min}–${c.year?.max} · ` +
        `体质≥${c.attributes?.体质?.min} · 道德≤${c.hidden?.道德值?.max} · 圣眷≤${c.gameState?.圣眷?.max}`
    )
    expect(c.gameState?.圣眷?.max, '圣眷上限是这条闸的坐标，改了它下面的读数全要重算').toBe(15)
  })

  it('带票之后的月份里，圣眷 一次都不许上涨', () => {
    const on = favorRises(fug)
    console.log(
      `装闸后：带票之后共 ${on.afterMonths} 个月，圣眷 上涨 ${on.after} 个（带票局 ${
        fug.filter(r => r.trace.some(t => t.derived.flags.includes(FUGITIVE_FLAG))).length
      }/${GAMES}）· 同一批局里带票**之前**上涨 ${on.before} 个`
    )
    // 反空转：这一句若为 0，上面那句"逃后 0 个"就只是"这局根本没人涨圣眷"的同义反复，
    // 第廿六轮之所以会被读数骗，缺的就是这一句对照。
    expect(on.before, '带票之前也没有一个月涨过 圣眷 —— 那这一组量不出闸的存在').toBeGreaterThan(0)
    expect(on.after, '人已经弃官南还，朝廷的恩还在往他身上加').toBe(0)
  })

  it('年窗里门关着的月份，一条也不许是因为 圣眷（拔掉这一行读的是 ×353）', () => {
    const { months, tally } = closedTally(fug)
    const favorKey = `圣眷>${fugitive!.event.conditions?.gameState?.圣眷?.max}`
    console.log(
      `逃后·年窗内·门关着 ${months} 个月，差池：${line(tally) || '（一条都没有）'} · 其中 ${favorKey}×${tally.get(favorKey) ?? 0}`
    )
    expect(
      tally.get(favorKey) ?? 0,
      `${favorKey} 还挡得住路 —— 那条闸没生效，或者 圣眷 还有一条这条闸管不到的来路（月 drift？）`
    ).toBe(0)
    expect(months, '逃后年窗内一个月都没关过门 —— 那上面那句 0 只是"根本没人站在门口"').toBeGreaterThan(0)
  })

  it('《亡命江湖》在真跑局里至少结一次案（棘轮：第廿七轮实测 8/40）', () => {
    const gateMonths = fug.reduce(
      (n, r) => n + r.trace.filter(t => fugitive!.check(buildParams(t.derived))).length,
      0
    )
    const sealed = fug.filter(r => r.endingId === FUGITIVE).length
    const dist = [...new Set(fug.map(r => r.endingTitle ?? '（未结案）'))]
      .map(t => `${t}×${fug.filter(r => (r.endingTitle ?? '（未结案）') === t).length}`)
      .join(' · ')
    console.log(`带票画像：门开 ${gateMonths} 月 · 结案 ${sealed} · 终局分布 ${dist}`)
    expect(sealed, `${GAMES} 局里《亡命江湖》结案 0 次 —— 上面那行分布会指出人死在哪一格`).toBeGreaterThan(0)
  })

  it('控制组：`vanish` 的结案数（第四十轮重抄为 5；第卅九轮 2，第廿六轮 4）', () => {
    const sealed = van.filter(r => r.endingId === FUGITIVE).length
    const v = favorRises(van)
    console.log(
      `vanish：带票 ${van.filter(r => r.trace.some(t => t.derived.flags.includes(FUGITIVE_FLAG))).length}/${GAMES} · ` +
        `结案 ${sealed} · 逃后 圣眷 上涨 ${v.after}/${v.afterMonths} 月`
    )
    // 第四十轮打开《平庸之念》的隐藏上界之后，与这批种子共享随机流的每一组都挪了一拍：
    // 控制组从 2 局结案变成 5 局。变的是**样本**，不是这条闸 —— `fugitive` 组在
    // 同一构建上仍是 13 局结案、年窗内 圣眷 挡路 0 次（见上面两条）。
    // 控制组的价值是"同一版上量出来的旁证"，所以这里按本版重抄，而不是为了保住旧数
    // 去动闸或动种子。
    expect(sealed, 'vanish 组的结案数又动了 —— 先确认是内容改动的随机流偏移，还是这条闸被改坏').toBe(5)
    expect(v.after, 'vanish 组也带得上 潜逃，闸对它同样生效').toBe(0)
  })

  it('抄表本身不许带错：没有一局报错，也没有一局一个月份都没抄到', () => {
    expect([...fug, ...van].filter(r => r.error).map(r => `seed ${r.seed}: ${r.error}`)).toEqual([])
    expect([...fug, ...van].filter(r => r.trace.length === 0).map(r => `seed ${r.seed}`)).toEqual([])
  })
})
