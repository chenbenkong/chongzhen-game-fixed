import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { buildParams } from '../../scripts/audit-ending-reachability'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import type { BoundaryEvent } from '../../src/types/boundaryEvent'
import type { OriginType } from '../../src/types/game'

/**
 * 《亡命江湖》那一格，玩家在真跑局里到底站不站得进去（第二十五轮）。
 *
 * 第二十四轮把这一格的**票源**修好了（「风闻入告」多一条【连夜束装，弃官南还】写 `潜逃`），
 * 但当时明确没敢钉结案，理由是"它的 圣眷≤15 与 圣眷 归零那条 p3 同轴"。那句话是**推断**，
 * 不是读数 —— 本轮把它量到底：逐月抄下边界注册表真正看得见的那份入参，
 * 每个月都拿**引擎自己注册的 check** 问一次「这个月《亡命江湖》的门开着吗」，
 * 开着的话再问一次「这个月结的是哪一格」。判定一行都不重写。
 *
 * 为什么终局快照不够用：`finalThresholds` 只有结案那一刻的值。
 * 门若在第 80 月开过三个月、第 96 月又关上，读数上只会显示"结案 0"，
 * 分不清是**门从没开过**、**开着却被别格抢走**，还是**开过但那一局没活到抄表**。
 *
 * 三个门槛各自的原样（从注册表读，不手抄）：
 *   年窗 1630–1650 ∧ 体质≥25 ∧ 道德≤30 ∧ 圣眷≤15 ∧ 任一票（隐姓埋名／下落不明／潜逃）
 *   外加一票否决 notHas（殉国／出家／归隐／藏匿民间／拥兵自重／落草为寇／…）
 */

const GAMES = Number(process.env.SIM_GAMES ?? 40)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const POLICIES = (process.env.SIM_POLICIES ?? 'bandit,vanish').split(',') as SimOutcome['policy'][]
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

const FUGITIVE = 'ending_fugitive'
const TICKETS = ['隐姓埋名', '下落不明', '潜逃']

const runs: SimOutcome[] = []

beforeAll(async () => {
  for (let i = 0; i < GAMES; i++) {
    runs.push(
      await simulateRun({
        seed: 6400 + i,
        policy: POLICIES[i % POLICIES.length],
        origin: ORIGINS[Math.floor(i / POLICIES.length) % ORIGINS.length],
        maxMonths: MONTHS,
        traceMonths: true
      })
    )
  }
}, 900_000)

/** 注册表里那一格本体 —— 门由它自己的 check 回答，本文件不复述判据 */
const entryOf = (id: string): BoundaryEvent | null =>
  Object.values(boundaryEventManager.getAll())
    .filter(e => e.type === 'ending')
    .find(e => e.event.id === id) ?? null

const fugitive = entryOf(FUGITIVE)
/**
 * 年窗**真正生效**的下界 —— 从注册表读，不是数据里写的那个数。
 * 两者可以不一样：`wrapBatchAsBoundaryEvents` 会把所有叙事结局的 `year.min`
 * 一律抬到 `NARRATIVE_MIN_YEAR`，所以数据里写 1630 的格子，实际要到 1635 才开门。
 */
const EFFECTIVE_MIN_YEAR = fugitive?.event.conditions?.year?.min ?? 0
const gateHeldAt = (r: SimOutcome, i: number) => !!fugitive && fugitive.check(buildParams(r.trace[i].derived))
/**
 * 门关着的时候，差的是哪一条 —— 逐键算，但**门槛的数值全部从注册表那份 `conditions` 读**，
 * 本文件不抄任何一个数（抄了就等于第二个求值器，正是第二轮之后一直在消灭的那种东西）。
 * `key` 是"哪一条门、越界到哪一侧"（同一个月里读数会变，归组只能靠它），`detail` 带上那个月的读数。
 */
type Blocker = { key: string; detail: string }
const closedBy = (r: SimOutcome, i: number): Blocker[] => {
  const c = fugitive?.event.conditions
  if (!c) return [{ key: '（这一格没有 conditions）', detail: '（这一格没有 conditions）' }]
  const d = r.trace[i].derived
  const out: Blocker[] = []
  const ranges = (src: Record<string, number> | undefined, cond: Record<string, { min?: number; max?: number }> | undefined, label: string) => {
    for (const [k, rg] of Object.entries(cond || {})) {
      const v = src?.[k] ?? 0
      if (rg.min !== undefined && v < rg.min) out.push({ key: `${label}.${k}<${rg.min}`, detail: `${label}.${k} ${v}<${rg.min}` })
      if (rg.max !== undefined && v > rg.max) out.push({ key: `${label}.${k}>${rg.max}`, detail: `${label}.${k} ${v}>${rg.max}` })
    }
  }
  if (c.year && (d.year < (c.year.min ?? 0) || d.year > (c.year.max ?? 9999)))
    out.push({ key: `年不在窗`, detail: `年 ${d.year} 不在窗` })
  ranges(d.attributes, c.attributes as any, '属性')
  ranges(d.hidden, c.hidden as any, '隐藏')
  ranges(d.states, c.gameState as any, '州府')
  const fl = c.flags as { any?: string[]; has?: string[]; notHas?: string[] } | undefined
  if (fl?.any?.length && !fl.any.some(f => d.flags.includes(f)))
    out.push({ key: `票一张没有`, detail: `票一张没有(${d.flags.length} 张身上)` })
  for (const f of fl?.has || []) if (!d.flags.includes(f)) out.push({ key: `缺票 ${f}`, detail: `缺票 ${f}` })
  for (const f of fl?.notHas || []) if (d.flags.includes(f)) out.push({ key: `被否决 ${f}`, detail: `被否决 ${f}` })
  return out
}
/** 门关着的那些月份里，最常出现的那几条差池（按"哪一条门"归组，读数不进组键） */
const topBlockers = (r: SimOutcome, from = 0) => {
  const tally = new Map<string, number>()
  let closed = 0
  r.trace.forEach((_, i) => {
    if (i < from || gateHeldAt(r, i)) return
    closed++
    for (const { key } of closedBy(r, i)) tally.set(key, (tally.get(key) ?? 0) + 1)
  })
  return { closed, list: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`) }
}

/** 那个月若真结案，注册表会给出哪一格（同一次存档里先命中谁） */
const winnerAt = (r: SimOutcome, i: number) => {
  const w = boundaryEventManager.checkByType(buildParams(r.trace[i].derived), 'ending')
  return w ? { id: w.event.id, title: w.event.title, priority: w.priority } : null
}
const sealed = (id: string) => runs.filter(r => r.endingId === id).length

describe(`${POLICIES.join('/')} 组《亡命江湖》逐月开门实测（${GAMES} 局 × 四出身）`, () => {
  it('先把这一格的门读出来，确认读的是注册表而不是本文的想象', () => {
    expect(fugitive, `${FUGITIVE} 不在边界注册表的 ending 里 —— 那这一格根本不会被结`).not.toBeNull()
    const c = fugitive!.event.conditions || {}
    console.log(
      `《${fugitive!.event.title}》p${fugitive!.priority} 的门：年 ${c.year?.min}–${c.year?.max} · ` +
        `体质≥${c.attributes?.体质?.min} · 道德≤${c.hidden?.道德值?.max} · 圣眷≤${c.gameState?.圣眷?.max} · ` +
        `任一票 ${(c.flags as any)?.any?.join('/')} · 一票否决 ${(c.flags as any)?.notHas?.length} 条`
    )
    expect(c.gameState?.圣眷?.max, '圣眷上限是本轮归因的坐标，改了它下面的读数全要重算').toBe(15)
  })

  it('门至少开过一个月：逐月读数里必须存在"这一格自己成立"的月份', () => {
    const perRun = runs.map(r => r.trace.filter((_, i) => gateHeldAt(r, i)).length)
    const total = perRun.reduce((a, b) => a + b, 0)
    console.log(
      `逐月开门总数 ${total}（开过门的局 ${perRun.filter(n => n > 0).length}/${GAMES}，` +
        `单局最多 ${Math.max(...perRun)} 月）· 抄表月份总数 ${runs.reduce((n, r) => n + r.trace.length, 0)}`
    )
    // 按票种分开数：三张票不是一回事。`隐姓埋名`/`下落不明` 只由《乱世浮沉》**成对**写下，
    // 而那一对正是《不知所踪》(p117) 的门票 —— 只要成对上身，两格就同时成立，只剩优先级裁决。
    // `潜逃` 才是这一格独有的票。混在一起报"开门 2 月"，看不出该修的是票还是优先级。
    const byTicket = (want: (flags: string[]) => boolean) =>
      runs.filter(r => r.trace.some(s => want(s.derived.flags))).length
    console.log(
      `带 潜逃 ${byTicket(f => f.includes('潜逃'))} 局 · ` +
        `带成对票 ${byTicket(f => f.includes('隐姓埋名') && f.includes('下落不明'))} 局 · ` +
        `只带单张成对票 ${byTicket(f => (f.includes('隐姓埋名') || f.includes('下落不明')) && !(f.includes('隐姓埋名') && f.includes('下落不明')))} 局`
    )
    expect(total, '一局里都没有一个月让《亡命江湖》的门成立 —— 这一格是真死的，不是"没人朝它走"').toBeGreaterThan(0)
  })

  it('成对票不是这一格的活路：只靠 隐姓埋名/下落不明 开门的月份，一律被《不知所踪》拿走', () => {
    const pairOnlyOpen = runs.flatMap(r =>
      r.trace
        .map((s, i) => ({ s, i, r }))
        .filter(x => gateHeldAt(x.r, x.i) && !x.s.derived.flags.includes('潜逃'))
    )
    const winners = new Map<string, number>()
    for (const x of pairOnlyOpen) {
      const w = winnerAt(x.r, x.i)
      const k = w ? `p${w.priority}《${w.title}》` : '（无人命中）'
      winners.set(k, (winners.get(k) ?? 0) + 1)
    }
    console.log(
      `门开着但不带 潜逃 的月份 ${pairOnlyOpen.length} 个 —— ` +
        ([...winners].map(([k, v]) => `${k}×${v}`).join(' · ') || '无')
    )
    expect(
      pairOnlyOpen.every(x => winnerAt(x.r, x.i)?.id !== FUGITIVE),
      '不带 潜逃 的月份里《亡命江湖》赢过 —— 那《不知所踪》和这一格就还在抢同一批玩家'
    ).toBe(true)
  })

  it('门开着的那几个月，必须真的由它结案（而不是被别格抢走）', () => {
    const stolen: string[] = []
    let heldAndWon = 0
    for (const r of runs) {
      r.trace.forEach((s, i) => {
        if (!gateHeldAt(r, i)) return
        const w = winnerAt(r, i)
        if (!w || w.id === FUGITIVE) heldAndWon++
        else stolen.push(`seed${r.seed}/${r.policy} 第${s.turn}月(${s.derived.year}) p${w.priority}《${w.title}》`)
      })
    }
    const byBlocker = new Map<string, number>()
    for (const line of stolen) {
      const k = line.replace(/^seed\d+\/\S+ 第\d+月\(\d+\) /, '')
      byBlocker.set(k, (byBlocker.get(k) ?? 0) + 1)
    }
    console.log(
      `门开着且它自己赢 ${heldAndWon} 月；门开着却被抢走 ${stolen.length} 月 —— ` +
        [...byBlocker].map(([k, v]) => `${k}×${v}`).join(' · ')
    )
    if (process.env.SIM_DEBUG === '1') console.log(stolen.slice(0, 12).join('\n'))
    expect(heldAndWon, '《亡命江湖》的门从来没有一个月是它自己赢的 —— 玩家站在门口也只会被别格接走').toBeGreaterThan(0)
  })

  it('这一格在真跑局里至少结一次案（本轮的主断言）', () => {
    const withTicket = runs.filter(r => r.trace.some(s => s.derived.flags.includes('潜逃')))
    console.log(
      `结案 ${sealed(FUGITIVE)} 局；带 潜逃 ${withTicket.length} 局；` +
        `终局分布 ${[...new Set(runs.map(r => r.endingTitle ?? '（未结案）'))]
          .map(t => `${t}×${runs.filter(r => (r.endingTitle ?? '（未结案）') === t).length}`)
          .join(' · ')}`
    )
    for (const r of withTicket) {
      const f = r.trace.findIndex(s => s.derived.flags.includes('潜逃'))
      const got = r.trace.slice(f)
      // 拿到票的那个月和年窗真正开的那个月不是同一个月 —— 编译器把每一格的年窗一律兜到
      // `NARRATIVE_MIN_YEAR`（见 `wrapBatchAsBoundaryEvents`），数据里写得更早也没用。
      // 中间这段等待期人活着吗、圣眷掉进 ≤15 了吗，只有抄到那一年才量得到。
      const open = got.filter(s => s.derived.year >= EFFECTIVE_MIN_YEAR)
      const openAt = open.length ? r.trace.findIndex(s => s.derived.year >= EFFECTIVE_MIN_YEAR) : r.trace.length
      const blocked = topBlockers(r, openAt)
      console.log(
        `  seed${r.seed}/${r.policy} 票在第${r.trace[f].turn}月(${r.trace[f].derived.year}) · ` +
          `年窗(≥${EFFECTIVE_MIN_YEAR})开于${open.length ? `第${open[0].turn}月` : '——没活到'} · ` +
          `此后 圣眷最低${Math.min(...got.map(s => s.derived.states.圣眷))} ` +
          `道德最低${Math.min(...got.map(s => s.derived.hidden.道德值))} ` +
          `清议最低${Math.min(...got.map(s => s.derived.states.清议))} ` +
          `体质${r.trace[f].derived.attributes.体质} · 票 ${TICKETS.filter(t => got.some(s => s.derived.flags.includes(t))).join('/')} · ` +
          `门开 ${r.trace.filter((_, i) => gateHeldAt(r, i)).length} 月 → ${r.endingTitle ?? '（未结案）'}\n` +
          `      年窗开过之后还关着 ${blocked.closed} 个月，差的是：${blocked.list.join(' · ') || '（没有一个月是关着的）'}`
      )
      // 下一轮要找的是"圣眷在年窗里怎么爬回去的"，那需要逐月读数而不是归组计数（SIM_DEBUG=1 才打）
      if (process.env.SIM_DEBUG === '1') {
        const rows: string[] = []
        for (let i = openAt; i < r.trace.length && rows.length < 8; i++) {
          if (gateHeldAt(r, i)) continue
          rows.push(`        第${r.trace[i].turn}月(${r.trace[i].derived.year}) 差：${closedBy(r, i).map(b => b.detail).join(' / ')}`)
        }
        console.log(rows.join('\n'))
      }
    }
    expect(
      sealed(FUGITIVE),
      `${GAMES} 局 ${POLICIES.join('/')} 里《亡命江湖》结案 0 次 —— 上面几行的读数会指出是门没开还是被抢`
    ).toBeGreaterThan(0)
  })

  it('抄表本身不许带错：没有一局报错，也没有一局一个月份都没抄到', () => {
    expect(runs.filter(r => r.error).map(r => `seed ${r.seed}: ${r.error}`)).toEqual([])
    expect(runs.filter(r => r.trace.length === 0).map(r => `seed ${r.seed}`)).toEqual([])
  })
})
