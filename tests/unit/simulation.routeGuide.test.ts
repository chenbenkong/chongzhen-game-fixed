import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { initialEvents, allGrayChoiceEvents } from '../../src/data/events/index'
import type { GameEvent } from '../../src/types/event'

/**
 * 「结局引路事件」不许再被结构性饿死（§1.4 ⑯，第二十轮）。
 *
 * 第二十轮之前，这一批 21 条 `route_*` 标的是 `type: 'random'`。引擎每月的**主槽**按
 * 「historical/chain（未看过）→ transition（未看过）→ random」填，random 只在**前两层全空**
 * 时才拿得到槽（`useGameEngine.ts:1015`）。实测 20 局 × 平均 192 月 = 3850 个月：
 *   hist/chain 18% · transition 80% · **random 0.5%（19 个月）**
 * 于是主池 `type:'random'` 的 21 条（恰好就是全部 route_*）抽不出来 ——
 * 400 局只播得出来 7 条、且全部挤在第 159 月以后（大事件池被抽干的月份），
 * `route_ordinary_life` 一局都没有。连带后果在别处：这批事件是
 * `急流勇退`/`主动致仕`/`著书立说`/`辞官`/`归隐`/`积劳成疾` 这些经历的**唯一写手**，
 * 而善终结局与图鉴那几格读它们 —— 所以"事件层饿死"表现成"结局层不可达"。
 *
 * 修法是把这 21 条改回它们本来的分类（一次性人生路线 = `transition`），
 * 而不是改引擎的抽取顺序（那会动到正戏的排期）。本文件钉三件事、外加一条默认关闭的探针：
 *   1. 静态：每月主池不许再有 `type:'random'` 的事件 —— 那一层是结构性兜底位，放它等于放死内容；
 *   2. 动态：一批实测局里 route_* 必须**成批**出现，且不许等到 159 月之后才第一次出现；
 *   3. 排期：改动不许把 hist/chain 的月度主槽占比顶掉；
 *   4.（`SIM_PROBE_SLOTS=1`）把主槽在四层里的月度分布整个打出来 —— 上面那句 3850 个月的实测就出自这条。
 * 第 2 条要跑真引擎，所以默认只跑 12 局；深跑与别的量具同一口径（SIM_GAMES）。
 */
const ALL: GameEvent[] = [...initialEvents, ...allGrayChoiceEvents]
const ROUTE = ALL.filter(e => e.id.startsWith('route_'))
const ROUTE_IDS = new Set(ROUTE.map(e => e.id))
const typeOf = new Map<string, string>(ALL.map(e => [e.id, e.type ?? '?']))

const SEEDS = Number(process.env.SIM_GAMES ?? 12)
const runs: SimOutcome[] = []

/**
 * 按月归主槽：一个月份里播过的事件，按引擎的取槽顺序算它属于哪一层。
 * 顺序是 `historical/chain → transition → random`，都没播的月份就是"只剩支线池"。
 * 注意这是**从播出记录反推**，不是引擎内部计数器：同月播了两条，按最高层归类，
 * 与"主槽给谁"是同一个意思（每月只有一个主槽）。
 */
function slotShares(games: SimOutcome[]) {
  let months = 0
  let hist = 0
  let trans = 0
  let random = 0
  let branch = 0
  for (const r of games) {
    const byTurn = new Map<number, string[]>()
    r.firedEventIds.forEach((id, i) => {
      const t = r.firedTurns[i]
      if (!byTurn.has(t)) byTurn.set(t, [])
      byTurn.get(t)!.push(id)
    })
    for (const [, ids] of byTurn) {
      months++
      const types = ids.map(id => typeOf.get(id))
      if (types.some(x => x === 'historical' || x === 'chain')) hist++
      else if (types.includes('transition')) trans++
      else if (types.includes('random')) random++
      else branch++
    }
  }
  return { months, hist, trans, random, branch }
}

beforeAll(async () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    runs.push(await simulateRun({ seed, policy: 'warden', origin: '缙绅', maxMonths: 260 }))
  }
}, 900000)

describe('结局引路事件的可达性', () => {
  it('每月主池里不许有 type:"random" 的事件（那一层只在兜底位，等于抽不出来）', () => {
    const stranded = ALL.filter(e => e.type === 'random').map(e => e.id)
    expect(
      stranded,
      `${stranded.length} 条事件标着 type:'random'：主槽要等 historical/chain/transition 全空才轮到它，` +
        `实测那一层在 3850 个月里只拿到 19 个槽。一次性事件请标 transition。` +
        `（若将来改的是引擎的抽取顺序、让 random 真有槽，请连同本用例与注释一起改。）` +
        `（边界/归零那两条 random 不在本池：它们由 checkBoundary 直接命中，不占主槽。）`
    ).toEqual([])
  })

  it('route_* 这批人生路线事件，实测里得成批出现，且不许等到 159 月', () => {
    const seenTurns = new Map<string, number>()
    let fires = 0
    for (const r of runs) {
      r.firedEventIds.forEach((id, i) => {
        if (!ROUTE_IDS.has(id)) return
        fires++
        const t = r.firedTurns[i]
        if (!seenTurns.has(id) || t < (seenTurns.get(id) ?? Infinity)) seenTurns.set(id, t)
      })
    }
    const earliest = Math.min(...seenTurns.values())
    console.log(
      `${runs.length} 局里 route_* 播出 ${fires} 次，覆盖 ${seenTurns.size}/${ROUTE_IDS.size} 条，` +
        `最早第 ${earliest} 月（第二十轮修复前：19 次 / 1 条 / 第 82 月）`
    )
    // 覆盖面阈值：修复前是 1/21。改成 transition 之后实测 16/21（12 局取样，173 次，最早第 58 月）。
    // 剩下 5 条播不出来的共同形状是**要失宠**（route_hermit / route_faction_imprisoned 要 圣眷≤50、
    // route_bandit_revolt 要 圣眷≤40、route_unknown_fate 要 圣眷≤25），而本文件的量具是 warden ——
    // 它专门把 圣眷 往高里维持，所以这 5 条是"这一组策略看不见"，不是抽不到。
    // 唯一例外是 route_ordinary_life：它不要失宠，卡在 道德 35–70 且体质 30–70 的**双向上限**（§1.4 ⑯ 第 3 条），
    // 而想活下去的玩家八维只会一路上行，越活越出不了那个窗口。
    // 要量它们得先有一个不救圣眷的策略，不该靠把这五条的门槛往下调来"点亮"取样。
    // 阈值钉在 8：留一倍余量给种子噪音，同时挡住"退回只有一条能播"的形状。
    expect(seenTurns.size).toBeGreaterThanOrEqual(8)
    expect(fires / runs.length).toBeGreaterThanOrEqual(2)
    expect(earliest, `最早也要等到第 ${earliest} 月才见到路线事件，说明它们又被别的层挤到后面了`).toBeLessThan(120)
  })

  it('改分类不许把正戏挤掉：hist/chain 与 transition 的月度槽位占比', () => {
    const s = slotShares(runs)
    const histShare = s.hist / s.months
    console.log(
      `${s.months} 个月：主槽 hist/chain ${(histShare * 100).toFixed(0)}%、` +
        `transition ${((s.trans / s.months) * 100).toFixed(0)}%（第二十轮基线 17% / 80%）`
    )
    // 历史大事件是正文，路线事件不许把它顶掉：17% 的实测基线，掉到 10% 以下才算挤占了正戏。
    expect(histShare).toBeGreaterThanOrEqual(0.1)
  })

  /**
   * 可选探针（`SIM_PROBE_SLOTS=1`）：把"每月的**主槽**落在哪一层"按月打出来。
   *
   * route_guide.ts 的头部注释与 KNOWN_ISSUES §三 第二十轮里那句
   * 「3850 个月：hist/chain 18% · transition 80% · **random 0.5%（19 个月）**· 只剩支线 2%」就是这条口径量出来的
   * （20 局 = seed 1..20 × warden × 缙绅，平均 192 月）。
   * 那个数是**修复前**取的：当时 21 条 `route_*` 还标着 `random`，而 `random` 只在
   * 「historical/chain 与 transition 都空了」时才拿槽（`useGameEngine.ts:1015`），所以整层饿死。
   * 修复之后 `random` 层按构造是 0（上面第 1 条静态用例守住它），要复现那条 0.5% 只需把
   * `route_guide.ts` 里 21 个 `type: 'transition'` 改回 `'random'` 再跑这条探针。
   *
   * 默认关掉：它要多跑 20 局，而它钉的结论已经有静态用例守着；
   * 将来谁改 `findAllEventsForState` 的抽取顺序或给某一层开配额，先打开这条看分布。
   */
  const probe = process.env.SIM_PROBE_SLOTS === '1'
  it.skipIf(!probe)('探针：主槽在各层的月度分布（改抽取顺序之前先跑这个）', async () => {
    const games: SimOutcome[] = []
    for (let seed = 1; seed <= 20; seed++) {
      games.push(await simulateRun({ seed, policy: 'warden', origin: '缙绅', maxMonths: 260 }))
    }
    const s = slotShares(games)
    const pct = (n: number) => `${((n / s.months) * 100).toFixed(1)}%`
    console.log(
      `${games.length} 局 / ${s.months} 个月：hist+chain ${s.hist}(${pct(s.hist)}) · ` +
        `transition ${s.trans}(${pct(s.trans)}) · random ${s.random}(${pct(s.random)}) · ` +
        `只剩支线 ${s.branch}(${pct(s.branch)})`
    )
    expect(s.months).toBeGreaterThan(3000)
  })
})
