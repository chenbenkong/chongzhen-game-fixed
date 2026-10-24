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
 * 本文因此只管一件事：说清 `bandit`/`vanish` 这两副画像**为什么**走不到这一格。
 * 第五十四轮把这句的口径改正了一次（旧版写的是"差池百分之百是 道德>30，圣眷 一条都不挡路"，
 * 那是被一个巧合喂出来的读数：当时唯一的样本在第 71 月就拿票，年窗 84 月才开，
 * "带票之后"与"年窗之内"恰好是同一批月份）。
 * 第五十五轮又改了一次，这次是**结论搬家**：随机流重新起头之后（§1.4 ㉗ 收口），
 * 这批 80 局里没有一个带 潜逃 的人活进年窗 —— 本文件的年窗归因失去样本，
 * 而 `simulation.fugitiveGate.test.ts` 那边同一句话有 140 个月的样本
 * （逃后·年窗内·门关着 140 月：道德>30×130 · 圣眷>15 全部是带进来的存量×4 · 逃后新涨×0）。
 * 所以这里只留两句：**带票的月份里 圣眷 一次都不许上涨**（机制棘轮），
 * 以及**带票之前必须涨过**（反空转对照）。"死在道德上"那句改由有样本的那一侧承重。
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

  it('《亡命江湖》的门在这一批里一次都没开过：成对票的局都被《不知所踪》先接走', () => {
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
    // 第六十一轮（§1.4 ㉞）把《不知所踪》的年窗下沿对齐产地 1637、并删掉产地之后的
    // 圣眷≤15 / 清议≤20 两道二道窗。成对票的局不再多等一年：拿票当月就满足 p117 的判据，
    // 下一拍结案。于是这一批里《亡命江湖》自己的门一次都没开过 —— 这是**被更高优先级接走**，
    // 不是"这一格死了"。门是否活着、开过几个月，由 `simulation.fugitiveGate.test.ts`
    // 的潜逃画像承重（本版：结案 9 局、门开 14 月），引擎侧另有反推存档钉
    // （`engine.boundary.test.ts` 的《第二十八轮》两条）。
    const paired = runs.filter(r =>
      r.trace.some(s => s.derived.flags.includes('隐姓埋名') && s.derived.flags.includes('下落不明'))
    )
    expect(paired.length, '这一批里连一局成对票都没有 —— 下面那句"不许被抢"是空集上的真').toBeGreaterThan(0)
    expect(
      paired.filter(r => r.endingId === FUGITIVE).map(r => `seed${r.seed} → ${r.endingTitle}`),
      '成对票在身、《不知所踪》又排在前面，这一格还是把人抢走了'
    ).toEqual([])
  })

  it('成对票在身上、《不知所踪》也成立时，不许这一格抢在前面', () => {
    const unknown = (Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending') as BoundaryEvent[]).find(
      e => e.event.id === 'ending_unknown_fate'
    )
    const winners = new Map<string, number>()
    const stolen: string[] = []
    // 第六十一轮之后，本批《亡命江湖》自己的门 0 个月 —— 但"优先级次序"仍有非空样本：
    // 只要成对票在身上，《不知所踪》的判据就该成立，那时赢家只能是它或排得更前的格子。
    // （旧写法从这里剔掉带 潜逃 的月份，样本 2 月；现在两格共用成对票的月份才是承重点。）
    const pairOpen = runs.flatMap(r =>
      r.trace
        .map((s, i) => ({ s, i, r }))
        .filter(x => x.s.derived.flags.includes('隐姓埋名') && x.s.derived.flags.includes('下落不明'))
    )
    const unknownOpen = pairOpen.filter(x => unknown?.check(buildParams(x.s.derived)))
    for (const x of unknownOpen) {
      const w = winnerAt(x.r, x.i)
      const k = w ? `p${w.priority}《${w.title}》` : '（无人命中）'
      winners.set(k, (winners.get(k) ?? 0) + 1)
      // 本句只管 亡命江湖 与 不知所踪 这两格之间的次序：赢家是排在 p117 之前的第三格
      // （例如 p102《诏狱冤死》）是正常收人，不算这一格抢。
      if (w?.id === FUGITIVE) stolen.push(`第${x.s.turn}月 seed${x.r.seed}：${k}`)
    }
    console.log(
      `成对票 ∧ 《不知所踪》成立 ${unknownOpen.length} 月 —— ` +
        ([...winners].map(([k, v]) => `${k}×${v}`).join(' · ') || '无')
    )
    expect(unknownOpen.length, '成对票都拿不到《不知所踪》的成立月 —— 这一条又成了空集').toBeGreaterThan(0)
    expect(stolen, '《不知所踪》同时也成立时，《亡命江湖》不许抢在它前面').toEqual([])
  })

  it('带 潜逃 的月份里 圣眷 一次没涨（年窗内的差池归因见 simulation.fugitiveGate.test.ts）', () => {
    // 第四十轮打开《平庸之念》的上界之后，这批共享种子的随机流整体挪了一拍：
    // 本组又出现 1 局带票活进年窗（seed6415/vanish，活到 1638），
    // 第卅九轮那句"本组已无带票活进年窗"的读数到此作废。
    // 第四十五轮把历史事件与《名帖》的选项数收口到 3–4 之后，随机流又挪了一拍：
    // seed6425/vanish 也活进了年窗，样本 1 → 2（两局都带 潜逃）。
    // 这一条重新变成有样本的实测：带票的月份里 圣眷 一次都不许上涨。
    // 第四十九轮把风月三格改成读经历票之后又挪了一拍：带 潜逃 的样本仍是 2 局
    // （seed6425/6473，都是 vanish），但 6425 这一局在第 21 月(1629)就倾家荡产，
    // 压根没活到 1635 —— 样本 2 → 1。门、年窗、优先级一字未动，见下面逐局打印。
    // 第五十四轮把《名帖》/《灯花》的门改成读出生月之后随机流再挪一拍：样本 1 → 2，
    // 新增的是 seed6429/vanish —— 它同时把旧断言里一个**藏了很久的口径错误**照了出来。
    // 旧版从"年窗打开那个月"起算，默认票一定在窗口之前就到身上了（上一版唯一的样本确实如此：
    // seed6473 的票在第 71 月，年窗在第 84 月才开）。seed6429 反过来：年窗第 84 月开，
    // 票要到第 130 月(1638)才落下 —— 中间那 46 个月身上根本没有 潜逃
    // （逐月打印里那 46 个「票一张没有」就是它们），却被整段算进了旧那句"65 个月 圣眷 挡路"。
    // 按"带票之后"重量：带票的 54 个月里 圣眷 上涨 **0** 次，年窗内带票且门关着的 41 个月里
    // 圣眷>15 只出现在 20 个月，且全部集中在 seed6429 弃官后的头几个月 ——
    // 它挡路靠的是弃官那天就挂在身上的 65 这一高位读数，不是"逃了还在升"。
    // 所以断言分成两句：① 带票月份里 圣眷 不许**上涨**（机制棘轮，红过一次才是这条的意义）；
    // ② 带票·年窗内关着的那些月份，头号差池是 道德 而不是 圣眷（本文件的职责所在）。
    // 高位 圣眷 单独挡路的月份数只打印、不钉死：那是一格自己声明的代价，
    // 要不要让"逃"直接把恩俸砍到 15 以下，是数据侧的设计题，记在 KNOWN_ISSUES ㉞。
    const withTicket = runs.filter(r => r.trace.some(s => s.derived.flags.includes(FUGITIVE_FLAG)))
    const inWindow = withTicket.filter(r => r.trace.some(s => s.derived.year >= EFFECTIVE_MIN_YEAR))

    // ── 第一句：机制棘轮，钉在**所有**带票的局上（不止活进年窗的那几局），
    //    所以它排在样本数读数之前 —— 随机流挪位会先动下面的计数，别让它替这条闸挡枪。
    let rose = 0
    let ticketMonths = 0
    const riseDetail: string[] = []
    for (const r of withTicket) {
      const first = r.trace.findIndex(s => s.derived.flags.includes(FUGITIVE_FLAG))
      for (let i = first; i < r.trace.length; i++) {
        if (!r.trace[i].derived.flags.includes(FUGITIVE_FLAG)) continue
        ticketMonths++
        if (i > first && r.trace[i].derived.states.圣眷 > r.trace[i - 1].derived.states.圣眷) {
          rose++
          riseDetail.push(`seed${r.seed} 第${r.trace[i].turn}月 ${r.trace[i - 1].derived.states.圣眷}→${r.trace[i].derived.states.圣眷}`)
        }
      }
    }
    console.log(`带 潜逃 的月份合计 ${ticketMonths} 月（${withTicket.length} 局），其中 圣眷 上涨 ${rose} 次`)
    expect(rose, '带 潜逃 之后 圣眷 还在上涨 —— 第廿七轮那条"逃了的人不再领朝廷的恩"的闸松了：' + riseDetail.slice(0, 4).join(' · ')).toBe(0)

    let roseBefore = 0
    for (const r of withTicket) {
      const first = r.trace.findIndex(s => s.derived.flags.includes(FUGITIVE_FLAG))
      for (let i = 1; i < first; i++) {
        if (r.trace[i].derived.states.圣眷 > r.trace[i - 1].derived.states.圣眷) roseBefore++
      }
    }
    console.log(
      `带 潜逃 ${withTicket.length} 局（${withTicket.map(r => `seed${r.seed}/${r.policy}`).join(' · ') || '无'}）· ` +
        `活进年窗 ${inWindow.length} 局 · 带票**之前** 圣眷 上涨 ${roseBefore} 次`
    )
    // 反空转：这一句为 0，上面那句"逃后 0 涨"就只是"这局根本没人涨圣眷"的同义反复。
    // 它只在**这一组真的有人带票**时才是一件事。第五十五轮重新起头之后这批 0 人带票
    // （13 次「风闻入告」开口，bandit/vanish 按分数自选，一次都没点【弃官南还】），
    // 所以这里明说"量不到"而不是让一句 `toBeGreaterThan(0)` 去替骰子还债 ——
    // 棘轮的承重读数在 `simulation.fugitiveGate.test.ts`（fugitive 画像，逃后新涨×0），
    // 票源本身点不点得动在 `engine.demotionGrace.test.ts` 的 K-55（引擎驱动，不吃随机流）。
    if (withTicket.length === 0) {
      console.log(
        '本组无一带票：上面那句 0 是空集上的真，不构成闸的证据 —— 已知的两处承重读数见上面的注释'
      )
    } else {
      expect(roseBefore, '带票之前也没有一个月涨过 圣眷 —— 这一组量不出闸的存在').toBeGreaterThan(0)
    }
    // 年窗内的差池归因（"死在道德上而不是死在 圣眷 上"）不再钉在这里：
    // 第五十五轮重新起头之后，这批 80 局里没有一个带票的人活进年窗（样本 0），
    // 而同一句话在 `simulation.fugitiveGate.test.ts` 有 140 个月的样本
    // （道德>30×130 · 圣眷>15 存量×4 · 逃后新涨×0）。结论钉在有读数的那一侧。
  })

  it('这两副画像结出来的每一局都带着票 —— 它是量具的读数，不是格子的读数（棘轮在 fugitive 那一组）', () => {
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
    // 第五十四轮把《名帖》/《灯花》的门改成读出生月，随机流再挪一拍：结案 1 → 2，
    // 新增的是 seed6407（带 隐姓埋名/下落不明 成对票）。两局都带票，见上面的逐局打印与下面那句
    // "没带门票就不许结这一格"的棘轮；成对票这两局都没被《不知所踪》接走，是因为它们
    // 结案那个月的 清议 是 54／33，而那一格要 ≤20 —— 逐月读数在 lostRoutes 那条反推存档旁边。
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
    // 第六十一轮（§1.4 ㉞）之后本批结案 0 局，这是**设计后的读数**而不是新漏洞：
    // 成对票在 1637 拿票当月就满足《不知所踪》(p117) 的判据，下一拍被它接走；
    // 这一组又没有一个带 潜逃 的样本。旧版的 `>=1` 地板在这一版量不到东西，
    // 硬留着只会让随机流替骰子还债。这一格的活口由两处不吃这批随机流的读数承重：
    // `simulation.fugitiveGate.test.ts` 的潜逃画像棘轮（本版结案 9 局、门开 14 月），
    // 以及 `engine.boundary.test.ts` 的反推存档（1635-1 当月结案 / 1634-12 不许放行）。
    // 上面"结案必须带票"那句照旧生效 —— 本版它是空集上的真，等有样本时不必重写。
  })

  it('抄表本身不许带错：没有一局报错，也没有一局一个月份都没抄到', () => {
    expect(runs.filter(r => r.error).map(r => `seed ${r.seed}: ${r.error}`)).toEqual([])
    expect(runs.filter(r => r.trace.length === 0).map(r => `seed ${r.seed}`)).toEqual([])
  })
})
