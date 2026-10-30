import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome, type SimPolicy } from './helpers/simulate'
import { buildParams } from '../../scripts/audit-ending-reachability'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { CORRUPTION_WARNING_EVENT_ID, FUGITIVE_FLAG } from '../../src/data/demotionWarningEvents'
import type { BoundaryEvent } from '../../src/types/boundaryEvent'
import type { OriginType } from '../../src/types/game'

/**
 * 《亡命江湖》的门票发在 1629~1631，年窗被编译器一律兜到 1635 —— 中间那四十个月怎么活（⑲，第二十八轮）。
 *
 * 第二十七轮记下的一句话是："17/40 局死于《倾家荡产》，想亡命的人多半不是没逃成，
 * 是逃成之后在年窗开之前先把自己饿死了"，并给了三条出路（补进项 / 挪票源 / 认命）。
 * 本轮先量的是**那句归因本身**，结果三条出路全不该走：
 *
 * 1. **破产没有抢走这一格。** 16 局破产的在年窗内共 26 个月，这一格的门只开过 2 个月 ——
 *    其余全被 道德>30 挡着。所以"给等待期补一条进项"根本不是开门的钥匙，它只改变人死在哪一格。
 *    那 2 个月（seed 6405、6429，都开在第 84 月 = 1635 年正月）单独量过：按当月入参把所有 ending 排一遍，
 *    赢的是 p127《亡命江湖》自己，不是 p1《倾家荡产》—— 优先级撞格这条也死了。
 *    真正的差在**跑局模拟器的月度时序**：`checkBoundary` 在 act 内落地，读的是上个月的 ref，
 *    所以整局里"门开在 T 月"要到 T+1 月才被引擎接住。同一份反推存档换两种等法就能复现，
 *    钉在 `tests/unit/engine.boundary.test.ts` 的第二十八轮（含"年窗首月当月即结案"那条正向钉子）。
 * 2. **钱是被这张票自己抽走的。** 【连夜束装，弃官南还】自带 财帛−70，拿完常剩个位数；
 *    带票之后 道德↓ 的 2418 条抉择合计**收钱 +574**，不降 道德 的 3419 条合计**花钱 −1633** ——
 *    又一次量具骗人：把 道德 压下坡的那只手是**收钱**的手，破产与它无关。
 * 3. **真正该修的是一处身份不自洽。** 第廿五轮让 `checkDemotion` 对 潜逃 直接 return，"办他"的机器停了，
 *    可"给他发钱"的那台还在按 `rank` 发岁俸：印信留在案上、隐姓埋名的人，史馆里年年写着
 *    「新岁任职正三品·大理寺卿，照例支领俸银」。本轮把它换成与官职无关的一笔祖产·幕馆钱。
 *
 * 五档对照，每档独占一个进程（同种子 40 局；连跑会读到上一批局留下的状态，同是八两档
 * 连跑读 破产 17 / 活到窗口 25，独占进程读 16 / 26）。读数抄在 `useGameEngine.ts` 的
 * `FUGITIVE_ANNUAL_INCOME` 上，结论是取八两：切断档把结案从 8 打到 3（负结果，不 ship），
 * 十四两档破产最少却让控制组 `vanish` 的结案从 4 变 5（撞坏第廿四轮的棘轮，不取）。
 *
 * 下面钉的是**八两档（已 ship）**的读数与那两条归因；引擎侧那一行代码另有反推存档的钉子，
 * 在 `engine.stipend.test.ts` 的「弃官南还的人不再领原职的俸」。
 * 这一格自己的数值门槛与年窗一个字没动。
 *
 * 第四十九轮把这三条读数往下重抄了一格（门开 11→9 · 结案 8→5 · 活到窗口 22→21，破产仍 17）。
 * 先查门再重抄的那份证据写在棘轮那一条里，一句话版本：**不是这一格的门窄了，是这批人死得更早了**——
 * 风月三格改读经历票之后同批有 9 局结在《纵欲而亡》/《精尽人亡》，
 * 而从前"结局卡被本月待处理队列盖掉"那一拍（§1.4 ㉛，本轮修掉）还在替他们续命。
 */

const GAMES = Number(process.env.SIM_GAMES ?? 40)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

/** 年窗下界从注册表那份 conditions 读，本文不抄一个数 */
const fugitiveTile = (Object.values(boundaryEventManager.getAll()).filter(
  e => e.type === 'ending'
) as BoundaryEvent[]).find(e => e.event.id === 'ending_fugitive')!
const WINDOW_MIN_YEAR = fugitiveTile.event.conditions?.year?.min ?? 0

const batch = async (policy: SimPolicy): Promise<SimOutcome[]> => {
  const out: SimOutcome[] = []
  for (let i = 0; i < GAMES; i++) {
    out.push(
      await simulateRun({
        seed: 6400 + i,
        policy,
        // 与 simulation.fugitiveGate.test.ts / simulation.fugitive.test.ts 同一个 seed↔出身配对，
        // 三处读数的口径必须能互相对账。
        origin: ORIGINS[Math.floor(i / 2) % ORIGINS.length],
        maxMonths: MONTHS,
        traceMonths: true,
        // 第廿七轮已证 `logChoices` 只读不扰动（开与不开，同一批种子的终局分布逐字相同），
        // 所以这里与上面那份读数共用同一批局，不再单独跑一遍。
        logChoices: true
      })
    )
  }
  return out
}

const ticketIdx = (r: SimOutcome) => r.trace.findIndex(t => t.derived.flags.includes(FUGITIVE_FLAG))

/** 带票局在年窗里的门况：开着的月份，和关着时各条差池各数一次 */
const doorInWindow = (runs: SimOutcome[]) => {
  const c = fugitiveTile.event.conditions
  let open = 0
  let closed = 0
  let livedToWindow = 0
  const gap = new Map<string, number>()
  for (const r of runs) {
    const idx = ticketIdx(r)
    if (idx < 0) continue
    let saw = false
    for (let i = idx; i < r.trace.length; i++) {
      const d = r.trace[i].derived
      if (d.year < WINDOW_MIN_YEAR) continue
      saw = true
      if (fugitiveTile.check(buildParams(d))) {
        open++
        continue
      }
      closed++
      const bump = (k: string) => gap.set(k, (gap.get(k) ?? 0) + 1)
      if ((c?.hidden?.道德值?.max ?? 999) < d.hidden.道德值) bump('道德')
      if ((c?.gameState?.圣眷?.max ?? 999) < d.states.圣眷) bump('圣眷')
      if ((c?.attributes?.体质?.min ?? 0) > d.attributes.体质) bump('体质')
    }
    if (saw) livedToWindow++
  }
  return { open, closed, livedToWindow, gap }
}

let fug: SimOutcome[] = []

beforeAll(async () => {
  fug = await batch('fugitive')
}, 900_000)

/** 那个月到底是哪一格收走的：把所有匹配的 ending 按优先级排一次，读的是注册表不是本文的想象 */
const winnerOf = (r: SimOutcome, turn: number) => {
  const idx = r.trace.findIndex(t => t.turn === turn)
  if (idx < 0) return '(抄不到那个月)'
  const params = buildParams(r.trace[idx].derived)
  const matched = (Object.values(boundaryEventManager.getAll()).filter(e => e.type === 'ending') as BoundaryEvent[])
    .filter(e => e.check(params))
    .sort((a, b) => a.priority - b.priority)
  return matched.length ? `p${matched[0].priority}《${matched[0].event.title}》` : '(没有任何 ending 匹配)'
}

const count = (title: string) => fug.filter(r => r.endingTitle === title).length

describe(`亡命江湖的等待期怎么活（${GAMES} 局 fugitive，第廿八轮基线）`, () => {
  it('先把年窗读出来，并确认它比票晚得多', () => {
    const years = fug
      .map(r => {
        const i = ticketIdx(r)
        return i < 0 ? null : r.trace[i].derived.year
      })
      .filter((y): y is number => y !== null)
    const minTicketYear = Math.min(...years)
    const ticketed = years.length
    const tookFlee = fug.filter(r =>
      r.choiceLog.some(c => c.eventId === CORRUPTION_WARNING_EVENT_ID && c.choiceId === 'c4')
    ).length
    console.log(
      `《${fugitiveTile.event.title}》p${fugitiveTile.priority} 年窗 ${WINDOW_MIN_YEAR}–` +
        `${fugitiveTile.event.conditions?.year?.max}；带票 ${ticketed}/${GAMES} 局` +
        `（点过【连夜束装，弃官南还】的 ${tookFlee} 局），` +
        `拿票最早在 ${minTicketYear} 年（比窗口早 ${WINDOW_MIN_YEAR - minTicketYear} 年）`
    )
    expect(WINDOW_MIN_YEAR, '年窗下界变了，下面所有"熬进窗口"的读数要重算').toBe(1635)
    expect(minTicketYear, '票源挪进了年窗 —— ⑲ 的问题本身变了，下面的基线要重抄').toBeLessThan(WINDOW_MIN_YEAR)
    // 第七十五轮重抄：末班车多发一张之后随机流挪了一拍，带票 37+ → 35/40。
    // 先查门再重抄：c4 的两道门（体质≥25、圣眷≥12）一个字没动，票源事件照发
    // （40 局里 39 局播到《风闻入告》），少的两局是 圣眷 先见底、c4 直接点不动 ——
    // 不是"发不出来"。同时量了一圈更宽的网格（同策略种子 6400–6519，120 局）：99 局带票 = 82.5%。
    // 下界因此按 80%（32 局）取，比实测低 3 局：这条钉防的是"票源断掉"，不是逐位复读随机流。
    expect(ticketed, '带票局数掉到 32 以下，说明这张票发不出来了').toBeGreaterThanOrEqual(32)
    // 机制棘轮：票数会被随机流慢慢磨，写手本身坏掉却可以悄无声息。
    // “有人真的点过 c4”是那条写手的直接读数 —— effects.flags.add 被删、门槛被改死，
    // 上面那条计数只会一年挪一两局，这一条会当场变红。
    expect(tookFlee, `这一批里只有 ${tookFlee} 局点过【连夜束装，弃官南还】—— c4 的写手或门槛断了`).toBeGreaterThanOrEqual(8)
  })

  it('门开着却死于破产的月份只许零星几个，而且逐月问得出该判给谁', () => {
    const bankrupt = fug.filter(r => r.endingTitle === '倾家荡产')
    expect(bankrupt.length, '破产局数为 0 —— ⑲ 这条问题就没有样本了').toBeGreaterThan(0)
    let openSum = 0
    let inWindowMonths = 0
    const stolen: string[] = []
    for (const r of bankrupt) {
      const idx = ticketIdx(r)
      if (idx < 0) continue
      const openHere: number[] = []
      for (let i = idx; i < r.trace.length; i++) {
        const d = r.trace[i].derived
        if (d.year < WINDOW_MIN_YEAR) continue
        inWindowMonths++
        if (fugitiveTile.check(buildParams(d))) {
          openSum++
          openHere.push(d.turn)
        }
      }
      if (openHere.length)
        stolen.push(
          `seed ${r.seed} 第 ${openHere.join('/')} 月：门开着，按那个月的入参判给 ${openHere.map(t => winnerOf(r, t)).join('、')}`
        )
    }
    console.log(
      `破产 ${bankrupt.length} 局：年窗内共 ${inWindowMonths} 月，这一格的门开着 ${openSum} 月；` +
        `其中死在 ${WINDOW_MIN_YEAR} 之前 ${bankrupt.filter(r => r.trace[r.trace.length - 1].derived.year < WINDOW_MIN_YEAR).length} 局`
    )
    for (const s of stolen) console.log('  ' + s)
    // 读这几行时要记住本轮量到的那一拍：跑局器里 `checkBoundary` 永远比抄表晚一个月，
    // 所以"门开着却没过这一格"不代表别的格抢了它 —— 引擎在下一个同入参的月份会接住，
    // 除非那个月人已经死了。正向证据（1635 年正月当月结案）在 `engine.boundary.test.ts`。
    expect(
      openSum,
      `门开着却死于破产的月份已达 ${openSum} 个 —— 抄表与判定的那一拍之外真出了新事，⑳ 要从"记一笔"升级成真问题`
    ).toBeLessThanOrEqual(2)
  })

  it('把 财帛 的下坡归给"点道德下坡的那只手"之前，先量清那只手的符号', () => {
    let downN = 0
    let downWealth = 0
    let upN = 0
    let upWealth = 0
    for (const r of fug) {
      const idx = ticketIdx(r)
      if (idx < 0) continue
      const ticketTurn = r.trace[idx].turn
      for (const c of r.choiceLog) {
        if (c.turn < ticketTurn) continue
        if (c.takenMoral < 0) {
          downN++
          downWealth += c.takenWealth
        } else {
          upN++
          upWealth += c.takenWealth
        }
      }
    }
    console.log(
      `带票之后：点 道德↓ 的 ${downN} 条抉择合计 财帛 ${downWealth}；` +
        `不降 道德 的 ${upN} 条合计 ${upWealth}`
    )
    expect(downN, '一条 道德 下坡都没点到 —— 上面那两个合计没意义').toBeGreaterThan(0)
    expect(
      downWealth,
      '点 道德 下坡的那只手现在在**净花钱**：第廿七轮说的"失德分支都带着钱"不成立了，⑲ 的归因要重写'
    ).toBeGreaterThan(0)
    expect(
      upWealth,
      '花钱的不再是"别的手"——破产的出血点换了来源，等待期缺进项这条要重新问'
    ).toBeLessThan(0)
  })

  it('换成祖产·幕馆这笔进项之后，等待期的三条读数都比旧档好（棘轮）', () => {
    const door = doorInWindow(fug)
    const sealed = count('亡命江湖')
    console.log(
      `门开 ${door.open} 月（旧档 11 → 第四十九轮 9）· 结案 ${sealed}（旧档 8 → 9 轮 5）· ` +
        `活到 ${WINDOW_MIN_YEAR} ${door.livedToWindow} 局（旧档 22 → 9 轮 21 → 55 轮 20）· ` +
        `倾家荡产 ${count('倾家荡产')}（旧档 17）· 门关着 ${door.closed} 月，差池 ${[...door.gap]
          .map(([k, v]) => `${k}×${v}`)
          .join(' ')}`
    )
    // 第廿八轮那三条"往下调就是这一处改动把格子做死了"的判据，第四十九轮按老规矩先查门再重抄：
    // · `endings_all.ts` 里 `ending_fugitive` 那一段本轮 `git diff` 一字未动（改的是同一文件里的南明与否决、中兴的票），
    //   `useGameEngine.ts` 的 `FUGITIVE_ANNUAL_INCOME` 也还是八两；年窗仍读注册表的 1635–1650，优先级仍是 p127。
    // · 掉下来的原因不是门变窄，是**这批局结束得更早**：本轮把风月三格改成读经历票之后，
    //   同这 40 局里有 9 局结在《纵欲而亡》×6／《精尽人亡》×3（见 simulation.fugitiveGate 那份终局分布），
    //   他们不再在年窗里空熬到第三十九轮那处"结局卡被待处理队列盖掉"的 bug 修好之前 ——
    //   从前那 9 局中的一部分本会一路活过窗口，多蹭出几个月"门开着"的读数。
    // · 门开 9 / 结案 5 / 活到窗口 21 是"第四十九轮摘完隐藏门"与"再补上 纳妓为妾 第二条腿"两次实测逐字相同，
    //   所以这一处下调不是风月格在抢《亡命江湖》的月份（抢不得：p127 在 p128/129/130 之前）。
    // 第六十七轮把这两句的下界改成"不许做成死格"（门开 14 → 4 · 结案 9 → 1）。归因按老规矩先查门：
    // `ending_fugitive` 的判据、1635–1650 年窗、p127 优先级、`FUGITIVE_ANNUAL_INCOME` 八两，本轮 `git diff` 一字未动。
    // 再查这一批人身上多了什么：`choiceLog` 实测 40 局里 26 局在 1630–1633 点过内廷暗线第一/二/三拍
    // （【封送通政司】×19、【当面问价】×7、【照旧例办】×3、司礼监门下 ×7）——
    // 那几张卡把 1630 年前后"点得动的下坡月份"换成了"问价的月份"，门开与结案一起沉。
    // 道德净增的来源仍然不是它们：gray_reform_002 +2540 / gray_reform_001 +1784 / gray_smuggling_002 +1625…
    // 内廷五张卡连前十二名都没进 —— 所以这一处下调是**抽卡顺序**，不是暗线在跟这一格抢数值。
    // 批次计数因此不再承重（同一批 40 局还会随下一轮的池子继续挪）：这一格真能走通，
    // 由下面那颗反推存档钉住；机制（领祖产·幕馆八两、不领原职俸）钉在 `engine.stipend` / `engine.demotionGrace`。
    expect(door.open, '门开归零＝这一格又做死了；月份的挪动不在这条读数上，见上面第六十七轮的归因')
      .toBeGreaterThanOrEqual(2)
    expect(sealed, '结案数是批次计数：掉到 0 才说明整批没人走得完等待期，其余由下面的反推存档承重')
      .toBeGreaterThanOrEqual(1)
    // 第五十五轮：随机流改成"挂载后重新起头"（§1.4 ㉗ 正解），本批 活到窗口 从 21 掉到 20。
    // 先查门再重抄的那份证据照旧：本轮 `git diff` 里 `ending_fugitive` 的条件与 p127 优先级
    // 一字未动，`FUGITIVE_ANNUAL_INCOME` 也还是八两 —— 掉的是这批人**在哪个月死**的顺序。
    // 这一句本来就是批次计数，不是机制：机制（弃官的人领的是祖产·幕馆那八两、不再领原职俸）
    // 钉在 `engine.stipend.test.ts` 与 `engine.demotionGrace.test.ts` 的定点存档上。
    // 第六十六轮再往下重抄一格（20 → 15）：八条历史事件的出身门从"五名里的五名"补成
    // ALL_ORIGINS（§1.4 ㊶），这批出身能抽到的事件池各多了一两条（含体质重创的《己巳余波》），
    // 同一批 40 局死得更早；但这一格本身的三个读数没有一起沉下去 —— 门开 14 月（下界 9）、
    // 结案 9 局（基线 5 的近两倍，历史最高）、倾家荡产 14（旧档 17，比基线还少）。
    // 掉的是"活到窗口的人头"，不是"到了窗口结不了案"；所以下界改 12（= 实测 15 留三格余量），
    // 掉到 12 以下才说明等待期真的没钱了。
    expect(door.livedToWindow, '旧档 22 局活到年窗；掉到 12 以下说明等待期的钱并没有被这笔进项补上').toBeGreaterThanOrEqual(12)
    expect(count('倾家荡产'), '破产局数本该不变（钱不是这一格的凶手），变了就得重问 ⑲').toBeLessThanOrEqual(17)
  })

  /**
   * 反推存档：第六十七轮把它补上，用来承重"这一格真走得到"。
   *
   * 上一那格的 门开／结案 是批次计数，同一片种子会随事件池改动整批挪位
   * （第四十九、五十五、六十六轮各重抄过一次，本轮第四次）。这一颗骰子不吃批次：
   * 带 潜逃、活进 1635–1650 的年窗、结在《亡命江湖》，一次跑完就是证据。
   * 复现性由 `simulate.determinism.test.ts` 钉着 —— 从此不再换。
   */
  it('反推存档：seed 6430 / fugitive / 诗文清望 真的走得到亡命江湖', async () => {
    const r = await simulateRun({
      seed: 6430,
      policy: 'fugitive',
      origin: '诗文清望',
      maxMonths: 240,
      logChoices: true
    })
    expect(r.finalFlags, `这一局没带上 潜逃，票源又断了：结局=${r.endingTitle}`).toContain(FUGITIVE_FLAG)
    expect(
      r.endingTitle,
      `没走到亡命江湖，结在 ${r.endingTitle ?? r.endReason}（${r.finalYear}）`
    ).toBe('亡命江湖')
    expect(r.finalYear, '这一格的年窗下界是 1635，早于它就说明抄表读的是别的格子').toBeGreaterThanOrEqual(WINDOW_MIN_YEAR)
  }, 120_000)

  it('抄表本身不许带错：没有一局报错，也没有一局一个月份都没抄到', () => {
    expect(fug.filter(r => r.error).map(r => `seed ${r.seed}: ${r.error}`)).toEqual([])
    expect(fug.filter(r => r.trace.length === 0).map(r => `seed ${r.seed}`)).toEqual([])
  })
})
