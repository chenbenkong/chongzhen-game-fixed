import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, endingTileOf, type SimOutcome } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 三条"至今没播过"的路线产地，到底是被门挡住还是被量具挡住（第二十四轮）。
 *
 * ⑯ 那张表里 `route_bandit_revolt`／`route_faction_imprisoned`／`route_unknown_fate` 三条
 * 在 400 局 warden/steady 取样里播出 0 次，而它们分别是《落草为寇》《诏狱冤死》《不知所踪》
 * 门票的**唯一产地**。本轮先量后修，量出来的是三件事：
 *
 * **一、⑯ 的"播不出来"是量具假象。** 这三条门共同形状是**要失宠**，而 warden 专门把
 * 圣眷往高里维持、steady 连失宠都不碰。换成这一轮新加的 bandit／vanish 两副画像
 * （`helpers/simulate.ts` 里声明，门票直接从格子数据读，不手抄），三条产地全部播出。
 * "没有策略朝它走"不等于"走不到" —— 上一轮的教训原样复用，这一次有数了。
 *
 * **二、真正的坏处在别处：无声的即时革职。** 第一轮取样（monk／hermit／stream，40 局）
 * 里 34 局以《罢黜归田》结案，判据原文全是「贪墨受贿，中饱私囊，东窗事发」，平均第 37 月，
 * 玩家从头到尾没收到过一句提示。`checkDemotion` 的 severity 3 只有两条，「道德败坏」在
 * 第十一轮拿到了两段式（先当面警告、再革职），「贪墨被查」漏了 —— 它的三个条件
 * （财帛>70 ∧ 欲望>75 ∧ 道德<30）在 缙绅 开局就踩着两条（财帛80／道德30），于是这格
 * 坐在悬崖下面，谁失宠谁掉。修法是补一张「风闻入告」警告卡 + 把革职改成认票
 * （`src/data/demotionWarningEvents.ts`）。下面那条"不许有无声革职"的断言就是这个不变量。
 *
 * **三、两格"状态 reachable 但格子赢不到"，改的都是票源与年窗，不是数值。**
 * 《不知所踪》：vanish 组里两张门票（下落不明／隐姓埋名）同时上身的局，状态一路都在格子的门里
 * （1637 圣眷10／清议15／国势12 等），唯独格子要求 年≥1642，而它们的产地《乱世浮沉》自己只开到
 * 1643 —— 中间还夹着 甲申国变 p106 在 1644 的截胡。于是 `year.min` 1642→1638、`圣眷.max` 10→15
 * （产地门就是 圣眷≤25，10 从来没有可达过），国势≤15／清议≤20 原样不动。
 * 《亡命江湖》：它的三张票里 隐姓埋名／下落不明 只由 `route_unknown_fate/c1` **成对**写下，
 * 而 p117 读的正是那一对、优先级又在它(p127)之前 —— 拿对的人先被《不知所踪》接走；剩下唯一
 * 能自己赢的 潜逃 改前全库只有 1644 城破那一个产地，那年《甲申国变》p106 又排在前面。
 * 也就是这一格**没有任何一条能赢的路**。本轮给「风闻入告」补第四条【连夜束装，弃官南还】写 潜逃
 * （1644 之前的独立产地），并把它的 `year.min` 1635→1630 与新产地的最早开口年对齐。
 * **但这一格本轮只钉得住票源，钉不住结案**：带 潜逃 的两局仍然分别被《罢黜归田》与《龙颜震怒》
 * 抢在前面（它的 圣眷≤15 与 圣眷 归零警告 p3 同轴 —— 站在这一格门口的人，一只脚已经在 p3 里）。
 * 那是另一件事，记成任务，不在本轮里硬凑一个数。
 *
 * 三条门的原样（从数据读，不手抄）：
 *   《铤而走险》 1636–1643 ∧ 武略≥35 ∧ 野心值≥50 ∧ 道德值≤40 ∧ 圣眷≤40
 *   《党争漩涡》 1635–1642 ∧ 圣眷≤50
 *   《乱世浮沉》 1637–1643 ∧ 国势≤25 ∧ 圣眷≤25
 * 后两条门里的 国势／武略／野心值／欲望值 都不在八条归零死线上，`finalThresholds` 量不到 ——
 * 这一轮给 `SimOutcome` 补了 `finalGates` 与 `endReason`，否则归因永远是瞎猜。
 *
 * 一局都量不出来时该说的是"这一组看不见"，不是"这一格坏了"。
 */

// 第四十四轮：家宅第三波回响接进事件池之后，前 40 局里《铤而走险》仍播出 12 次，
// 但事件发生时的 圣眷 全落在 5–29，画像每次都点了【退隐】—— 门票只在 圣眷 35–40
// 那五点的窄窗里选得起（【举兵】−30，而 BANDIT 的保命底线是 5）。门没坏：
// 扩到 80 局，seed6446/6476 在 圣眷 32 点【占山为王】并结案。40 局已经分不清
// "路线死了"与"窄窗没撞上"，这一批的最低样本因此提到 80。
//
// 第四十六轮：《铤而走险》的主门从「野心≥50 ∧ 道德≤40 ∧ 圣眷≤40」三点隐藏窄窗
// 换成六张看得见的失势票（党争反戈/袁党/谪戍边疆/廷杖受刑/廷杖求饶/戴罪立功），
// 结局格《落草为寇》同步撤掉 野心/道德 与 圣眷/国势 四道上界，只留门票 + 武略/体质下界。
// 改门前同一批 80 局：产地播出 29 次，旧门开 426 月/34 局；按新门口径可开 698 月/20 局，
// 两门差 445 月全在野心/道德/圣眷 三维。改门后：播出 20 次、结案 1 次（新门开 466 月）。
// 画像仍在 19/20 次点【退隐】—— 那是画像不想造反，不是格子不开门：播出时 c1 选得起
// 1 次、c2 6 次（BANDIT 的 圣眷 地板 5 会先拦住 −30 的【举兵】）。
const GAMES = Number(process.env.SIM_GAMES ?? 80)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const POLICIES = (process.env.SIM_POLICIES ?? 'bandit,vanish').split(',') as SimOutcome['policy'][]
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

const ROUTES = [
  { id: 'route_bandit_revolt', title: '铤而走险', tile: 'ending_bandit_king', tileTitle: '落草为寇' },
  { id: 'route_faction_imprisoned', title: '党争漩涡', tile: 'ending_zhaoyu_prison', tileTitle: '诏狱冤死' },
  { id: 'route_unknown_fate', title: '乱世浮沉', tile: 'ending_unknown_fate', tileTitle: '不知所踪' }
]
/** 《亡命江湖》的 `any` 里唯一有独立产地的那张票（historical_038/c3，1644 城破） */
const FUGITIVE = 'ending_fugitive'
/** 「贪墨被查」的两段式：先由这张卡记下票，革职只认票 */
const CORRUPTION_WARNING = '革职预警·贪墨'

const runs: SimOutcome[] = []

beforeAll(async () => {
  for (let i = 0; i < GAMES; i++) {
    runs.push(
      await simulateRun({
        seed: 6400 + i,
        policy: POLICIES[i % POLICIES.length],
        origin: ORIGINS[Math.floor(i / POLICIES.length) % ORIGINS.length],
        maxMonths: MONTHS
      })
    )
  }
}, 900_000)

const fireTimes = (id: string) =>
  runs.reduce((n, r) => n + r.firedEventIds.filter(x => x === id).length, 0)
const firedIn = (id: string) => runs.filter(r => r.firedEventIds.includes(id)).length
const earliest = (id: string) => {
  const t = runs.flatMap(r => r.firedEventIds.map((x, i) => (x === id ? r.firedTurns[i] : -1)).filter(x => x >= 0))
  return t.length ? Math.min(...t) : -1
}
const sealed = (id: string) => runs.filter(r => r.endingId === id).length
const carried = (flag: string) => runs.filter(r => r.finalFlags.includes(flag)).length
/**
 * 「开过卡」的局数 —— 必须经 `endingTileOf` 折算。
 * 边界结局的卡片在引擎里可能被 `withEndingId` 之类改过名，`firedEventIds` 里存的是
 * 那个原始 id，直接 `includes('ending_bandit_king')` 会量出 0，于是"开卡 0 · 结案 3"
 * 这种自相矛盾的读数就出现了（结案走的是 `endingId`，它已经是折算过的格子 id）。
 */
const opened = (tileId: string) =>
  runs.filter(r => r.firedEventIds.some(id => endingTileOf(id) === tileId)).length

describe(`${POLICIES.join('/')} 组失宠路线产地实测（${GAMES} 局 × 四出身）`, () => {
  it('三条产地全部播得出来 —— ⑯ 的全盲是量具看不见，不是格子坏了', () => {
    const lines: string[] = []
    for (const r of ROUTES) {
      lines.push(
        `《${r.title}》${r.id}：播出 ${fireTimes(r.id)} 次 / ${firedIn(r.id)} 局，最早第 ${earliest(r.id)} 月` +
          ` → 它那格《${r.tileTitle}》玩家亲手点过卡 ${opened(r.tile)} 局、结案 ${sealed(r.tile)} 局`
      )
    }
    console.log(lines.join('\n'))
    if (process.env.SIM_DEBUG === '1') {
      for (const r of runs.filter(x => x.endingId && ROUTES.some(k => k.tile === x.endingId))) {
        console.log(
          `  seed ${r.seed} ${r.policy} → ${r.endingId} @第${r.months}月(${r.finalYear}) ` +
            `end=${r.endEventId} 尾部：${r.firedEventIds.slice(-4).join(' / ')}`
        )
      }
    }
    console.log(
      `门票上身：落草为寇×${carried('落草为寇')} 啸聚山林×${carried('啸聚山林')} ` +
        `袁党×${carried('袁党')} 清算袁党×${carried('清算袁党')} ` +
        `下落不明×${carried('下落不明')} 隐姓埋名×${carried('隐姓埋名')} 潜逃×${carried('潜逃')}`
    )
    console.log(
      `终局分布：${[...new Set(runs.map(r => r.endingTitle ?? String(r.endingId)).values())]
        .map(t => `${t}×${runs.filter(r => (r.endingTitle ?? String(r.endingId)) === t).length}`)
        .join(' · ')}`
    )
    // 《罢黜归田》是引擎的考功层替玩家结的案，`checkDemotion` 里只有 severity≥3 那两条
    // （道德≤0 且已收过归零警告 / 贪墨被查）会直接革职。不打印判据原文，
    // 这一行就只是一句"失宠的人都被开除了"，量不出到底是画像自杀还是格子坐在悬崖下面。
    const demoted = runs.filter(r => r.endingId === 'ending_demotion')
    if (demoted.length) {
      const byReason = new Map<string, number>()
      for (const r of demoted) {
        const k = (r.endReason ?? '（没记到判据）').slice(0, 30)
        byReason.set(k, (byReason.get(k) ?? 0) + 1)
      }
      console.log(
        `革职 ${demoted.length} 局的判据：${[...byReason].map(([k, v]) => `${k}×${v}`).join(' · ')}` +
          `；这批局终局道德值 min=${Math.min(...demoted.map(r => r.finalThresholds.道德值 ?? 0))} ` +
          `局长 min=${Math.min(...demoted.map(r => r.months))} ` +
          `avg=${(demoted.reduce((n, r) => n + r.months, 0) / demoted.length).toFixed(0)}`
      )
      // 「贪墨被查」= 财帛>70 ∧ 欲望>75 ∧ 道德<30，而 缙绅 开局就是 财帛80／欲望50／道德30 ——
      // 三条门里两条开局就半踩着，所以这一格到底是谁踩的，得分出身讲。
      const byGroup = new Map<string, SimOutcome[]>()
      runs.forEach((r, i) => {
        const k = `${r.policy}×${ORIGINS[Math.floor(i / POLICIES.length) % ORIGINS.length]}`
        byGroup.set(k, [...(byGroup.get(k) ?? []), r])
      })
      console.log(
        [...byGroup]
          .map(
            ([k, v]) =>
              `${k} 革职 ${v.filter(r => r.endingId === 'ending_demotion').length}/${v.length}` +
              `（局长 avg=${(v.reduce((n, r) => n + r.months, 0) / v.length).toFixed(0)}）`
          )
          .join(' · ')
      )
      console.log(
        `革职那批的 财帛/欲望：${demoted
          .slice(0, 8)
          .map(r => `${r.finalThresholds.财帛}/${r.finalGates.欲望值}`)
          .join(' ')}`
      )
    }
    console.log(
      `革职预警「${CORRUPTION_WARNING}」上身 ${carried(CORRUPTION_WARNING)} 局；` +
        `「风闻入告」播出 ${firedIn('boundary_warn_corruption')} 局`
    )
    console.log(
      `局长：min=${Math.min(...runs.map(r => r.months))} avg=${(
        runs.reduce((n, r) => n + r.months, 0) / runs.length
      ).toFixed(0)} max=${Math.max(...runs.map(r => r.months))}`
    )

    for (const r of ROUTES) {
      expect(
        firedIn(r.id),
        `${GAMES} 局 ${POLICIES.join('/')} 失宠玩家里《${r.title}》${r.id} 一次也没播出来 —— ` +
          `它的门是 ${r.id === 'route_bandit_revolt' ? '武略≥35 ∧ 任一失势票' : r.id === 'route_faction_imprisoned' ? '圣眷≤50' : '国势≤25 ∧ 圣眷≤25'}，` +
          '这两副画像全程就在低位，播出 0 次说明画像又漂了'
      ).toBeGreaterThan(0)
    }
  })

  it('失宠结局由真玩家点得开；《不知所踪》另用反推存档钉（见下一条）', () => {
    const tiles = ROUTES.map(r => ({ id: r.tile, title: r.tileTitle }))
    console.log(
      tiles.map(t => `《${t.title}》${t.id}：结案 ${sealed(t.id)} 局（玩家亲手点过卡 ${opened(t.id)} 局）`).join('\n') +
        `\n《亡命江湖》${FUGITIVE}：结案 ${sealed(FUGITIVE)} 局，带独立票 潜逃 ${carried('潜逃')} 局`
    )
    for (const t of tiles) {
      if (t.id === 'ending_unknown_fate') continue
      expect(
        sealed(t.id),
        `《${t.title}》在这 ${GAMES} 局里结案 0 次 —— 本轮为它做的门/年窗修正没生效，` +
          '要么产地又抢不到了，要么格子被别的结局截胡'
      ).toBeGreaterThan(0)
    }
    // 《不知所踪》按本文件自己定的口径改钉：上面那条"批次结案数只当读数"的规矩，第四十九轮轮到它自己执行。
    // 80 局批次本轮读到 0，先查门再定性：格子 conditions 与 p117 优先级一字未动；产地《乱世浮沉》
    // 照旧播出 9 次、两张票成对上身 2 局（seed6429 被《甲申国变》收走、seed6445 结《亡命江湖》），
    // 而下一条反推存档（seed 6536 / vanish / 缙绅）在同一天真的结了这一格
    // —— 所以这个 0 是"这副骰子这批没人走到"，不是"格子被做死"。
    // 抢走月份的是本轮改写的风月三格：同批 80 局里《纵欲而亡》《烟花之主》开始正确收人，
    // 再加上 §1.4 ㉛ 那处"结局卡被本月待处理队列盖掉"修好，从前靠这个 bug 续命的人不再往下走。
    const unknownSource = ROUTES.find(r => r.tile === 'ending_unknown_fate')!
    expect(
      fireTimes(unknownSource.id),
      `产地《${unknownSource.title}》在这 ${GAMES} 局里一次都没播出 —— 那才是这一格真断了，去查产地门`
    ).toBeGreaterThan(0)
    // 随机流会随门的改动整批挪位：第四十五轮收口选项数时《不知所踪》从 1 局挪到 0 局，
    // 第四十六轮改《铤而走险》的门又挪回来 2 局（seed6455/6469），第四十九轮再挪回 0 局，
    // 第五十四轮改《名帖》/《灯花》的门之后仍是 0 局（本批带成对票的 4 局里两局结案那个月
    // 清议 54／33，够不上这一格要的 ≤20）。
    // 这条 80 局网格只能证明"产地播出 + 两张票仍会成对上身"，格子本身由反推存档钉住。
    const bothTickets = runs.filter(
      r => r.finalFlags.includes('下落不明') && r.finalFlags.includes('隐姓埋名')
    )
    expect(
      bothTickets.length,
      '两张票在这 80 局里一次都没同时上身 —— 那才是产地《乱世浮沉》真的没人走到'
    ).toBeGreaterThan(0)
    // 《亡命江湖》这一格本轮只敢钉"票源"，不敢钉"结案"，理由是量出来的（见下一条的打印）：
    // 它的 圣眷≤15 与 圣眷 归零那条警告规则（龙颜震怒 p3）同轴，而它的两张共同票
    // 隐姓埋名／下落不明 只成对出现、拿对的人永远先被《不知所踪》p117 接走。
    // 改前它连一张 1644 之前能自己赢的票都没有；本轮补的【弃官南还】把这条断了 —— 钉住它。
    expect(
      carried('潜逃'),
      '「风闻入告」的【连夜束装，弃官南还】是《亡命江湖》唯一的 1644 之前的独立票源，' +
        `${GAMES} 局里 0 人拿到 —— 要么警告卡没开口，要么这条选项又被画像当成自杀跳过了`
    ).toBeGreaterThan(0)
  })

  // 原存档 seed6406 在第四十六轮改门后改结《亡命江湖》。同策略/同出身的 6400–6799 网格里
  // 仍有 17 局落在《不知所踪》（第四十七轮新事件挪动随机流后为 seed6418/6434/…），
  // 格子与年窗一字未动 —— 只是随机流挪位。
  // 第五十四轮把《名帖》/《灯花》的门改成读出生月，随机流再挪一拍：seed6434 那一局现在
  // 活到了 1644，被《甲申国变》(p106) 按 国势0 收走。按 §1.4 ㉗ 的规矩重扫 400 局
  // （seed 6400–6799 × vanish/bandit × 四出身轮流）找新的反推存档，只找到 **1 局**：
  // seed6536/vanish/缙绅，第 163 月(1641) 圣眷10 清议8 国势2 —— 那一格要的是
  // 成对票 ∧ 圣眷≤15 ∧ 清议≤20 ∧ 国势≤15，四个条件同真本来就极窄。
  // 重扫用的探针脚本不入库（本文件外的临时 test 跑完即删），读数与取舍记在 KNOWN_ISSUES ㉞。
  it('《不知所踪》仍结得了案（反推存档：seed 6536 / vanish / 缙绅）', async () => {
    const r = await simulateRun({ seed: 6536, policy: 'vanish', origin: '缙绅', maxMonths: MONTHS })
    expect(
      r.endingId,
      `反推存档没走到《不知所踪》—— 结在 ${r.endingTitle ?? '（未结案）'}，` +
        `年${r.finalYear} 圣眷${r.finalThresholds.圣眷} 清议${r.finalThresholds.清议} 国势${r.finalGates.国势}`
    ).toBe('ending_unknown_fate')
    expect(r.finalFlags).toEqual(expect.arrayContaining(['下落不明', '隐姓埋名']))
    expect(r.finalYear).toBeGreaterThanOrEqual(1638)
  }, 60_000)

  it('无声的即时革职已经不存在：凡是「贪墨被查」收的局，身上一定带着预警票', () => {
    const silent = runs
      .filter(r => r.endingId === 'ending_demotion' && (r.endReason ?? '').includes('贪墨受贿'))
      .filter(r => !r.finalFlags.includes(CORRUPTION_WARNING))
      .map(r => `seed ${r.seed}/${r.policy} 财帛${r.finalThresholds.财帛} 欲望${r.finalGates.欲望值} @第${r.months}月`)
    console.log(
      `「贪墨被查」结案 ${runs.filter(r => (r.endReason ?? '').includes('贪墨受贿')).length} 局，` +
        `其中带票 ${runs.filter(r => (r.endReason ?? '').includes('贪墨受贿') && r.finalFlags.includes(CORRUPTION_WARNING)).length} 局`
    )
    expect(silent, '「贪墨被查」不再有无声的革职：凡是这条判据收的局，身上一定带着「革职预警·贪墨」').toEqual([])
  })

  it('逐条归因：那三副门各自差在哪一维，打出来', () => {
    const DISGRACE = ['党争反戈', '袁党', '谪戍边疆', '廷杖受刑', '廷杖求饶', '戴罪立功']
    const dims = (r: SimOutcome) => ({
      圣眷: r.finalThresholds.圣眷 ?? 100,
      道德值: r.finalThresholds.道德值 ?? 100,
      国势: r.finalGates.国势 ?? 100,
      武略: r.finalGates.武略 ?? 0,
      野心值: r.finalGates.野心值 ?? 0,
      失势票: DISGRACE.some(f => r.finalFlags.includes(f)),
      年: r.finalYear
    })
    const report = (name: string, test: (d: ReturnType<typeof dims>) => boolean, parts: Array<[string, (d: ReturnType<typeof dims>) => boolean]>) => {
      const all = runs.filter(r => test(dims(r)))
      const each = parts.map(([k, f]) => `${k}×${runs.filter(r => f(dims(r))).length}`).join(' ')
      console.log(`  ${name}：全部条件同真 ${all.length} 局 —— ${each}`)
      return all.length
    }
    report(
      '《铤而走险》(1636–1643 ∧ 武略≥35 ∧ 任一失势票)',
      d => d.年 >= 1636 && d.年 <= 1643 && d.武略 >= 35 && d.失势票,
      [
        ['年在窗内', d => d.年 >= 1636 && d.年 <= 1643],
        ['武略≥35', d => d.武略 >= 35],
        ['失势票', d => d.失势票]
      ]
    )
    report(
      '《乱世浮沉》(1637–1643 ∧ 国势≤25 ∧ 圣眷≤25)',
      d => d.年 >= 1637 && d.年 <= 1643 && d.国势 <= 25 && d.圣眷 <= 25,
      [
        ['年在窗内', d => d.年 >= 1637 && d.年 <= 1643],
        ['国势≤25', d => d.国势 <= 25],
        ['圣眷≤25', d => d.圣眷 <= 25]
      ]
    )
    report(
      '《亡命江湖》那一格(1630–1650 ∧ 体质≥25 ∧ 道德≤30 ∧ 圣眷≤15 ∧ 任一票)',
      d => d.道德值 <= 30 && d.圣眷 <= 15,
      [
        ['道德≤30', d => d.道德值 <= 30],
        ['圣眷≤15', d => d.圣眷 <= 15]
      ]
    )
    // 本轮给《亡命江湖》补的独立票源（「风闻入告」第四条【连夜束装，弃官南还】写的 潜逃）
    // 到底走没走到那一格 —— 不打印这批局的门，就只能得到"票有货了，格子还是 0"，又是一次瞎猜。
    const fug = runs.filter(r => r.finalFlags.includes('潜逃'))
    console.log(
      `  带 潜逃 ${fug.length} 局（结案 ${sealed(FUGITIVE)}）：` +
        (fug.length
          ? fug
              .map(
                r =>
                  `seed${r.seed}/${r.policy} 活到${r.finalYear}(第${r.months}月) ` +
                  `圣眷${r.finalThresholds.圣眷} 道德${r.finalThresholds.道德值} 体质${r.finalThresholds.体质} ` +
                  `拥兵${r.finalFlags.includes('拥兵自重') || r.finalFlags.includes('落草为寇') ? 'Y' : 'N'}` +
                  ` → ${r.endingTitle ?? '（未结案）'}`
              )
              .join(' ｜ ')
          : '（本组无人选【弃官南还】）')
    )
    // 门票已经在身上的那几局，差的是门还是"没活到年窗"—— 这一行是《不知所踪》改门的依据。
    const both = runs.filter(r => r.finalFlags.includes('下落不明') && r.finalFlags.includes('隐姓埋名'))
    console.log(
      `  两张票都在身上 ${both.length} 局：` +
        both.map(r => `seed${r.seed}/${r.policy} 活到${r.finalYear}(第${r.months}月) 圣眷${r.finalThresholds.圣眷} 清议${r.finalThresholds.清议} 国势${r.finalGates.国势} → ${r.endingTitle}`).join(' ｜ ')
    )
    expect(runs.length).toBe(GAMES)
  })

  it('取样本身不许带错：没有一局是以"报错"结束的', () => {
    expect(runs.filter(r => r.error).map(r => `seed ${r.seed}: ${r.error}`)).toEqual([])
  })
})
