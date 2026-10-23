import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { buildParams } from '../../scripts/audit-ending-reachability'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { FUGITIVE_FLAG } from '../../src/data/demotionWarningEvents'
import type { BoundaryEvent } from '../../src/types/boundaryEvent'
import type { OriginType } from '../../src/types/game'

/**
 * 《亡命江湖》那一格，玩家在真跑局里到底站不站得进去（第二十五轮起）。
 *
 * 第二十四轮把这一格的**票源**修好了（「风闻入告」多一条【连夜束装，弃官南还】写 `潜逃`），
 * 但当时明确没敢钉结案，理由是"它的 圣眷≤15 与 圣眷 归零那条 p3 同轴"。那句话是**推断**，
 * 不是读数 —— 本轮把它量到底：逐月抄下边界注册表真正看得见的那份入参，
 * 每个月都拿**引擎自己注册的 check** 问一次「这个月《亡命江湖》的门开着吗」，
 * 开着的话再问一次「这个月结的是哪一格」。判定一行都不重写。
 *
 * 为什么终局快照不够用：`finalThresholds` 只有结案那一刻的值。
 * 门若在某一年开过三个月、下一年又关上，读数上只会显示"结案 0"，
 * 分不清是**门从没开过**、**开着却被别格抢走**，还是**开过但那一局没活到抄表**。
 *
 * 第二十六轮拿这个量具验过一个假设：**逃了的人不该再领朝廷的恩**（带 潜逃 时挡掉一切正面
 * 圣眷 增量）。机制装得上 —— 装闸之后带票的 105 个月里 圣眷 上涨 **0** 次，回滚之后同样 40 局
 * 带票的 253 个月里上涨 101 个。但它在这个量具上**看不到好处**：门开 3 月 → 2 月（剩那两个月的
 * 票是成对票，照旧被《不知所踪》抢走），结案 1 局 → 0 局，seed6425 反而在第 90 月死于《清流殉道》。
 * 于是当轮把闸回滚了，只 ship 了「给《清流殉道》的 notHas 补 潜逃」那一处，并写下结论
 * "真正绑住这一格的是 道德，不是 圣眷"。
 *
 * **那句话到第二十七轮被推翻，推翻它的不是新读数而是新画像。** 本文这两副（`bandit`/`vanish`）
 * 给 财帛 与 欲望值 打负分，而年窗内 159 条零门下坡里最陡的那一批恰恰同时发银子发欲望 ——
 * 道德 因此永远压在门槛之上，圣眷 挡不挡路根本轮不到被观察。换一副自洽的画像（`fugitive`：
 * 道德 负权重、财帛/欲望 不惩罚、`fleeOnWarning` 直接认领那张一生只发一次的【弃官南还】），
 * 只动那一行闸重测同种子 40 局：门开 5 月 → 11 月、结案 5 局 → 8 局、带票后 圣眷 上涨
 * 988 → 0 次。**闸已重新装上并留下**，逐月读数与断言在 `simulation.fugitiveGate.test.ts`。
 *
 * 本文因此只管一件事：说清 `bandit`/`vanish` 这两副画像**为什么**走不到这一格 ——
 * 带 潜逃 的局在年窗里关着的那些月份，差池百分之百是 道德>30，圣眷 一条都不挡路。
 * 结案数在这里仍是 0，那是量具的性质（下面第 5 条用例把它钉住了），不是格子的性质。
 */

const GAMES = Number(process.env.SIM_GAMES ?? 80)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const POLICIES = (process.env.SIM_POLICIES ?? 'bandit,vanish').split(',') as SimOutcome['policy'][]
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

const FUGITIVE = 'ending_fugitive'
const TICKETS = ['隐姓埋名', '下落不明', FUGITIVE_FLAG]

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
 * 一律抬到 `NARRATIVE_MIN_YEAR`（1635），所以数据里写得更早也没用。
 * 第二十五轮正是被这一点骗过（那次 1635→1630 是空转），于是把这类装饰性声明
 * 全部改成生效值，并由 `audit.endingReachability.test.ts` 两条用例钉住不许再写。
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
      `带 潜逃 ${byTicket(f => f.includes(FUGITIVE_FLAG))} 局 · ` +
        `带成对票 ${byTicket(f => f.includes('隐姓埋名') && f.includes('下落不明'))} 局 · ` +
        `只带单张成对票 ${byTicket(f => (f.includes('隐姓埋名') || f.includes('下落不明')) && !(f.includes('隐姓埋名') && f.includes('下落不明')))} 局`
    )
    expect(total, '一局里都没有一个月让《亡命江湖》的门成立 —— 这一格是真死的，不是"没人朝它走"').toBeGreaterThan(0)
  })

  it('成对票开门时先让《不知所踪》裁决；它不成立，才轮到这一格接住', () => {
    const pairOnlyOpen = runs.flatMap(r =>
      r.trace
        .map((s, i) => ({ s, i, r }))
        .filter(x => gateHeldAt(x.r, x.i) && !x.s.derived.flags.includes(FUGITIVE_FLAG))
    )
    const unknown = (Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending') as BoundaryEvent[]).find(
      e => e.event.id === 'ending_unknown_fate'
    )
    const winners = new Map<string, number>()
    const stolen: string[] = []
    for (const x of pairOnlyOpen) {
      const w = winnerAt(x.r, x.i)
      const k = w ? `p${w.priority}《${w.title}》` : '（无人命中）'
      winners.set(k, (winners.get(k) ?? 0) + 1)
      // 《不知所踪》的门票与这一格共用同一对 隐姓埋名/下落不明，但它排在前头（p117）。
      // 只要它自己也成立，这一格就不许抢；它不成立时，成对票照样能把这一格送出去 ——
      // 第四十轮样本里就有 2 个月是这么赢的，所以断言写成"让位"而不是"永远不属于这一格"。
      if (unknown?.check(buildParams(x.s.derived)) && w?.id !== 'ending_unknown_fate') {
        stolen.push(`第${x.s.turn}月 seed${x.r.seed}：${k}`)
      }
    }
    console.log(
      `门开着但不带 潜逃 的月份 ${pairOnlyOpen.length} 个 —— ` +
        ([...winners].map(([k, v]) => `${k}×${v}`).join(' · ') || '无')
    )
    expect(stolen, '《不知所踪》同时也成立时，《亡命江湖》不许抢在它前面').toEqual([])
  })

  it('带 潜逃 活进年窗的局（第四十九轮重抄为 1 局）：门关着全因 道德/体质，圣眷 一次没挡路', () => {
    // 第四十轮打开《平庸之念》的上界之后，这批共享种子的随机流整体挪了一拍：
    // 本组又出现 1 局带票活进年窗（seed6415/vanish，活到 1638），
    // 第卅九轮那句"本组已无带票活进年窗"的读数到此作废。
    // 第四十五轮把历史事件与《名帖》的选项数收口到 3–4 之后，随机流又挪了一拍：
    // seed6425/vanish 也活进了年窗，样本 1 → 2（两局都带 潜逃）。
    // 这一条重新变成有样本的实测：门关着的月份里 圣眷 一次都不许出现。
    // 第四十九轮把风月三格改成读经历票之后又挪了一拍：带 潜逃 的样本仍是 2 局
    // （seed6425/6473，都是 vanish），但 6425 这一局在第 21 月(1629)就倾家荡产，
    // 压根没活到 1635 —— 样本 2 → 1。门、年窗、优先级一字未动，见下面逐局打印。
    const withTicket = runs.filter(r => r.trace.some(s => s.derived.flags.includes(FUGITIVE_FLAG)))
    const inWindow = withTicket.filter(r => r.trace.some(s => s.derived.year >= EFFECTIVE_MIN_YEAR))
    console.log(
      `带 潜逃 ${withTicket.length} 局（${withTicket.map(r => `seed${r.seed}/${r.policy}`).join(' · ') || '无'}）· ` +
        `活进年窗 ${inWindow.length} 局`
    )
    expect(inWindow.length, '带票活进年窗的样本数又动了 —— 先重抄下面的差池，再决定是样本还是闸').toBe(1)
    let closed = 0
    let favorBlocked = 0
    for (const r of inWindow) {
      const start = r.trace.findIndex(s => s.derived.year >= EFFECTIVE_MIN_YEAR)
      for (let i = start; i < r.trace.length; i++) {
        if (gateHeldAt(r, i)) continue
        closed++
        if (r.trace[i].derived.states.圣眷 > (fugitive!.event.conditions?.gameState?.圣眷?.max ?? 999)) favorBlocked++
      }
    }
    console.log(`带票·年窗内·门关着 ${closed} 个月，其中 圣眷 挡路 ${favorBlocked} 次`)
    expect(closed, '门一次都没关过 —— 那上面那句 0 只是"根本没人站在门口"').toBeGreaterThan(0)
    expect(favorBlocked, '带票之后 圣眷 还在挡路 —— 那条闸没生效').toBe(0)
  })

  it('这两副画像只结得出 1 局（第四十九轮重抄），且每一局都带着票 —— 它是量具的读数，不是格子的读数（棘轮在 fugitive 那一组）', () => {
    const withTicket = runs.filter(r => r.trace.some(s => s.derived.flags.includes(FUGITIVE_FLAG)))
    console.log(
      `结案 ${sealed(FUGITIVE)} 局；带 潜逃 ${withTicket.length} 局；` +
        `终局分布 ${[...new Set(runs.map(r => r.endingTitle ?? '（未结案）'))]
          .map(t => `${t}×${runs.filter(r => (r.endingTitle ?? '（未结案）') === t).length}`)
          .join(' · ')}`
    )
    for (const r of withTicket) {
      const f = r.trace.findIndex(s => s.derived.flags.includes(FUGITIVE_FLAG))
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
    // 第四十轮打开《平庸之念》的上界之后，这批共享种子的随机流挪了一拍：
    // 本组从 0 局结案变成 2 局，且两局都是**成对票**（隐姓埋名/下落不明）结的 ——
    // 不是 潜逃 那条线。这正是这一格 `any` 里本来就承认的门票；拿掉它反而是改设计。
    // 第四十四轮接进家宅第三波回响后随机流又挪了一拍：同一批 40 局变成 3 局结案。
    // 第四十五轮把历史事件与《名帖》的选项数收口到 3–4 后又挪回 2 局（seed6415 带 潜逃、
    // seed6424 带成对票）。第四十六轮改《铤而走险》的门与《落草为寇》的判据，同一批
    // 再挪到 1 局（seed6415 带 潜逃；seed6424 这一局改结《罢黜归田》）——
    // 仍然是每一局都带着门票（见上面的逐局打印）。
    // 读数按本版重抄，门与优先级没动。所以这里钉的不是"3""2"或"1"，而是"结案必须带票"：
    // 先证明不是凭空结的，再记下本版读数。
    // 第四十九轮把风月三格改成读经历票之后，这一批 80 局的随机流又挪了一拍：结案 2 → 1，
    // 剩下这一局是 seed6445 带 隐姓埋名/下落不明 结的（上一版的 seed6415 带 潜逃 那一局
    // 现在在第 21 月就倾家荡产，没活到年窗）。同一批里 烟花之主×6、精尽人亡×1 ——
    // 这两副画像本来没朝风月走，是它们自己点下了【流连青楼】那一张卡。门没坏，
    // 是这一格的月份被别的格先结走了；证据与取舍记在 KNOWN_ISSUES ㉘。
    const anyTickets = ((fugitive!.event.conditions?.flags as { any?: string[] })?.any ?? [])
    const sealedRuns = runs.filter(r => r.endingId === FUGITIVE)
    console.log(
      `结案 ${sealedRuns.length} 局，门票：` +
        (sealedRuns.map(r => `seed${r.seed}[${anyTickets.filter(f => (r.finalFlags ?? []).includes(f)).join('/')}]`).join(' · ') || '无')
    )
    for (const r of sealedRuns) {
      const carried = anyTickets.filter(f => (r.finalFlags ?? []).includes(f))
      expect(carried.length, `seed${r.seed} 没带任何一张门票就结了这一格 —— 那不是画像的读数`).toBeGreaterThan(0)
    }
    expect(
      sealed(FUGITIVE),
      `${GAMES} 局 ${POLICIES.join('/')} 的结案数又动了 —— 先区分是内容改动的随机流偏移，还是这一格的门/优先级被改坏`
    ).toBe(1)
  })

  it('抄表本身不许带错：没有一局报错，也没有一局一个月份都没抄到', () => {
    expect(runs.filter(r => r.error).map(r => `seed ${r.seed}: ${r.error}`)).toEqual([])
    expect(runs.filter(r => r.trace.length === 0).map(r => `seed ${r.seed}`)).toEqual([])
  })
})
