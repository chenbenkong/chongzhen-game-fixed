import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome, type SimPolicy } from './helpers/simulate'
import { DECLINABLE_ENDING_IDS } from '../../src/data/endingDecline'
import type { OriginType } from '../../src/types/game'

/**
 * 「换一种出身，看到的还是不是同一个游戏」—— 实测钉死。
 *
 * 入口是 KNOWN_ISSUES §1.4 ⑩ 和 ⑪，两条都是**只有跨局才看得见**的问题：
 *
 * ⑩ `诗文清望` 的一局比别的出身短得多（第十五轮第一次把 100 局拆成四个出身才露出来）。
 *    局长短不是"难度高"那么无害：死得早的直接后果是**能撞见的事件与结局变少**，
 *    等于玩家花同样的时间买了一张内容更少的票。这一池有四种开局身份，
 *    任何一种的内容量明显少于一半，就是内容问题而不是平衡问题。
 *    第十八轮定位到根因不是出身，而是《东林烈士》那条没有年代闸的结局
 *    （见 `engine.boundary.test.ts`）—— 补闸之后四档局长之比从 1.25 收到 1.18。
 *
 * ⑫（第十八轮实测新增，比 ⑩ 大得多的一条）：**没有任何一局玩进 1636 年。**
 *    200 局的终局年份是 `1628:2 1629:82 1630:19 1631:4 1635:93` ——
 *    93 局幸存者**全部**落在 1635 年，而 1635 恰好是 `NARRATIVE_MIN_YEAR`，
 *    也就是善终结局窗口的开放年。富甲一方×54 + 名臣垂范×38 两条把幸存者一口吞掉，
 *    于是国势崩解曲线（引擎里从 1636 才开始 -1/月）、1638/1642/1643 三个历史事件池、
 *    甲申国变 / 城破殉城 / 南渡续祚 / 称臣纳贡 / 篡位自立 / 东林烈士这六条 1644 正戏、
 *    以及 `year_1644` 那三条成就，在游戏里一次都没有发生过。
 *    这一格断言的是"正戏还活着"：1636 年以后的局数占比、以及单一年份不许吃掉四成的局。
 *
 * ⑪ 三条第一波回响在 warden 组 100 局里播出 0 次，卡点在**上游某一个具体选项**：
 *    `abandoned_liushi` 只有《竹马青梅》的【悔婚】写、`xianv_token` 只有《月下侠影》的
 *    【留书答谢】写、`lixiangjun_respect` 只有《秦淮绝色》的【敬而不扰】写，
 *    而那一路是纯亏的选项 —— 一百局里没一个人按。
 *    上一轮明确拒绝用"放宽门槛"糊过去（那等于让没发生过的抉择长出后果），
 *    所以这里量的是**开门经历本身有没有被写出来**：写不出来，那三条回响就是白写的文案。
 *    第十九轮把 ⑬ 修完之后，这一条自己好了（同一批 400 局：38 / 37 / 9 局带上身）——
 *    因为局终于长到能撞见那三个事件。这反过来印证 ⑪ 的卡点确实是"活不够久"。
 *
 * ⑬（第十九轮修掉）善终结局在年窗开放的那个月**替玩家结案**，于是没人活到 1644。
 *    修法是「史馆请笔」：判定命中只把卡摆上桌，收不收笔由玩家点（`src/data/endingDecline.ts`）。
 *    本文件的策略组里 steady/warden 都会拒笔，所以修完之后：
 *      · 以善终结局的局数 = 0/400（修复前 187/400 = 47%，全挤在年窗开放那一年）；
 *      · 终局年份分布 `1629:148 1630:40 1631:7 1632:3 1634:2 1641:9 1643:6 1644:185`，
 *        平均局长从上一轮的 71.6~83.1 个月涨到 104.3~107.3，
 *        平均触达事件从 113.2~126.7 涨到 146.2~151.2（同一批 400 局种子）。
 *    1644 因此成了最常见的终局年份（46%）—— 这不是坝，是正戏本身在收人：
 *    甲申国变的年窗是 `1644..1644`（固定日期），国势崩解曲线让幸存者必然踩上 国势≤15。
 *    所以下面那格"单一年份不许吃掉四成"把 1644 从候选里摘出去，另外补一条
 *    直接盯住这一轮的量：**想继续玩下去的玩家不该被善终结局收走**。
 *    愿意收笔的那一面另有用具：`SIM_POLICIES=sealer`（见 helpers/simulate.ts）。
 *
 * 口径与 `simulation.playthrough.test.ts` 完全一致：同一个 `simulateRun`、
 * 同一套策略、同一批种子只换出身。深跑：
 *   SIM_GAMES=50 node node_modules/vitest/vitest.mjs run tests/unit/simulation.originLongevity.test.ts
 */

const ORIGINS: OriginType[] = ['寒门', '缙绅', '没落世家', '诗文清望']
const SEEDS = Number(process.env.SIM_GAMES ?? 8)
const POLICIES = (process.env.SIM_POLICIES ?? 'steady,warden').split(',') as SimPolicy[]
const MAX_MONTHS = Number(process.env.SIM_MONTHS ?? 260)

/**
 * 甲申国变的年窗是 `1644..1644`（李自成入京是固定日期），所以"终局挤在 1644"
 * 是正戏本身在收人，与水坝那种"状态型善终在年窗开放当年一口吞掉幸存者"是两回事。
 * 下面两格因此都要把它单独拿出来看。
 */
const JIASHEN_YEAR = 1644

/**
 * `SIM_POLICIES=sealer` 是第十九轮为 §1.4 ⑮ 加的量具：这一组的玩家**就是**要在请笔卡上收笔，
 * 所以"善终占比""终局年份不集中""玩进 1636 以后""玩进 1644""回响开门"这五条
 * 钉在拒笔玩家身上的断言必然全红。让它们显式 skip，而不是让人误读成回归。
 * 第二十轮 B 之后这条更成立：收笔组实测 190/200 局停在 1635 年（《退意萌生》一播出来就有人盖章），
 * 那正是"愿意结案的人不会看到正戏"的定义，不是坝。
 */
const SEALERS_ONLY = POLICIES.length === 1 && POLICIES[0] === 'sealer'

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const fired = (r: SimOutcome) => new Set(r.firedEventIds).size

/** 每种出身一格：同一批种子，只换出身，所以差值可以直接归因到开局 */
const byOrigin = new Map<OriginType, SimOutcome[]>()

// 跑 SIM_GAMES=25 时这里是 200 局，深跑的 hook 要几分钟，比默认 10 秒大得多
beforeAll(async () => {
  for (const origin of ORIGINS) {
    const list: SimOutcome[] = []
    for (const policy of POLICIES) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        list.push(await simulateRun({ seed, policy, origin, maxMonths: MAX_MONTHS }))
      }
    }
    byOrigin.set(origin, list)
  }
  const allRuns = [...byOrigin.values()].flat()
  const byYear = new Map<number, number>()
  for (const r of allRuns) byYear.set(r.finalYear, (byYear.get(r.finalYear) ?? 0) + 1)
  console.log(
    `终局年份分布（${allRuns.length} 局合计）：` +
      [...byYear].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}:${n}`).join(' ')
  )
  const byEnding = new Map<string, number[]>()
  for (const r of allRuns) {
    const key = r.endingId ?? (Object.entries(r.finalThresholds).filter(([, v]) => v <= 0).length
      ? '归零' : '未见终局')
    byEnding.set(key, [...(byEnding.get(key) ?? []), r.months])
  }
  console.log(
    '终局构成（结局 id ×局数，括号内为触发时的局长）：' +
      [...byEnding].sort((a, b) => b[1].length - a[1].length)
        .map(([k, ms]) => `${k}×${ms.length}(${Math.round(avg(ms))}月)`).join(' ')
  )
  const sealed = allRuns.filter(r => DECLINABLE_ENDING_IDS.includes(r.endingId ?? ''))
  const sealedYears = new Map<number, number>()
  for (const r of sealed) sealedYears.set(r.finalYear, (sealedYears.get(r.finalYear) ?? 0) + 1)
  console.log(
    `以可拒笔的收束型结局结案的局数：${sealed.length}/${allRuns.length}` +
      (sealed.length
        ? `（落在：${[...sealedYears].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}:${n}`).join(' ')}）`
        : ' —— 这一组的玩家都会拒笔，这正是 ⑬ 修完该有的形状')
  )
  const lateRuns = allRuns.filter(r => r.finalYear >= 1644)
  const lateRanks = new Map<string, number>()
  for (const r of lateRuns) lateRanks.set(r.finalRank, (lateRanks.get(r.finalRank) ?? 0) + 1)
  console.log(
    `活到 1644 的 ${lateRuns.length} 局，终局官阶：` +
      [...lateRanks].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ')
  )
  console.log(
    `出身内容量实测（每格 ${SEEDS * POLICIES.length} 局：seed 1..${SEEDS} × ${POLICIES.join('/')}）\n` +
      '出身        平均局长   中位局长   活不过24月   平均触达事件   活到1643   最常见死因'
  )
  for (const origin of ORIGINS) {
    const list = byOrigin.get(origin)!
    const months = list.map(r => r.months).sort((a, b) => a - b)
    const deaths = new Map<string, number>()
    for (const r of list) {
      const zeroed = Object.entries(r.finalThresholds).filter(([, v]) => v <= 0).map(([k]) => k)
      const cause = zeroed.length ? `归零:${zeroed.join('/')}` : (r.endingId ?? '未见终局')
      deaths.set(cause, (deaths.get(cause) ?? 0) + 1)
    }
    const top = [...deaths].sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k, n]) => `${k}×${n}`).join(' ')
    const to1643 = list.filter(r => r.finalYear >= 1643).length
    console.log(
      `  ${origin.padEnd(6)} ${avg(list.map(r => r.months)).toFixed(1).padStart(7)} 月` +
        ` ${months[Math.floor(months.length / 2)].toString().padStart(8)} 月` +
        ` ${((100 * list.filter(r => r.months < 24).length) / list.length).toFixed(0).padStart(9)}%` +
        ` ${avg(list.map(fired)).toFixed(1).padStart(12)}` +
        ` ${((100 * to1643) / list.length).toFixed(0).padStart(9)}%   ${top}`
    )
  }
}, 300_000)

describe(`四种出身的内容量（${SEEDS * POLICIES.length} 局/格）`, () => {
  it('模拟本身跑得干净（否则下面所有结论都不成立）', () => {
    const all = [...byOrigin.values()].flat()
    expect(all.filter(r => r.error).map(r => `${r.seed} ${r.error}`), '模拟中途抛异常').toEqual([])
    expect(all.filter(r => r.badNumbers.length).map(r => String(r.seed)), '终局存在非有限数值').toEqual([])
    // §1.4 ㉟ 于第五十六轮修掉，这一句按它自己的指示改回"0 局未结案"。
    // 第五十五轮的在册读数是 `['6/warden/寒门']` —— 那一局国势停在 16–54、
    // 又没凑齐《中兴成功》要的三张军权票，翻到公元 3193 年（18789 月）才被步数预算截停。
    // 第五十六轮量出三处真原因（都不是"国势那一段没有落点"）：
    //   1. 《称臣纳贡》的 `notHas` 里躺着 `组织义军` —— 门票是 贰臣（人已经降了清），
    //      却禁止"先抗过再降"。组织义军 全库只有一个写手、零个擦除者，
    //      于是先举义再降清的人撞上一张自相矛盾的禁令，四格 1644 结局一格也接不住他。
    //   2. 44 格的年窗全部止于 1660 之前，没有一格读年岁 —— 过了 1644 就没有上界。
    //   3. 五格结局卡上有选项正文已经盖章、`effects` 却没写 `special.type: 'ending'`，
    //      玩家点了它，结局卡就静默作废（`audit.endingTerminality.test.ts` 钉住）。
    // 修法：摘掉那条自相矛盾的禁令 + 补 5 个收尾标记 + 加一格最低优先级的《寿终正寝》
    // （年岁≥70，见 `endings_all.ts`）。同一批 64 局读数：seed 6 那一局现在停在
    // 1644 年 5 月（第 197 月）《称臣纳贡》，未结案 0 局。
    const stuck: string[] = []
    for (const [origin, list] of byOrigin) for (const r of list) if (!r.ended) stuck.push(`${r.seed}/${r.policy}/${origin}`)
    console.log(`未结案 ${stuck.length} 局：${stuck.join(' · ') || '（无）'}`)
    expect(
      stuck,
      '§1.4 ㉟ 回来了：有局跑完预算还没结案 —— 先看是哪一格不再接人，别急着放宽门槛'
    ).toEqual([])
  })

  it('最长寿出身的平均局长不许比最短的多出一倍以上', () => {
    // 第五十五轮曾把量法临时换成中位：§1.4 ㉟ 那一局不朽的 18789 月把 寒门 的平均局长
    // 抬到 1270.7 月，平均值被一个上界都不存在的样本污染。㉟ 第五十六轮修好之后，
    // 这一句按当时的指示改回平均 —— 同一批 64 局：诗文清望 113.1 / 缙绅 107.4 = 1.05，
    // 与中位读数（197 / 193 = 1.02）说的是同一件事。
    const rows = ORIGINS.map(o => {
      const list = byOrigin.get(o)!.map(r => r.months).sort((a, b) => a - b)
      return {
        origin: o,
        months: avg(byOrigin.get(o)!.map(r => r.months)),
        median: list[Math.floor(list.length / 2)]
      }
    }).sort((a, b) => b.months - a.months)
    const best = rows[0]
    const worst = rows[rows.length - 1]
    console.log(
      `  平均局长差距：${best.origin} ${best.months.toFixed(1)} 月 vs ${worst.origin} ${worst.months.toFixed(1)} 月` +
        `（中位 ${rows.map(r => `${r.origin} ${r.median}`).join(' / ')}）`
    )
    expect(
      best.months / worst.months,
      `出身之间局长差到 ${((best.months / worst.months - 1) * 100).toFixed(0)}%，` +
        `挑${worst.origin}的人买到的内容明显更少（明细见上面的表）`
    ).toBeLessThanOrEqual(1.35)
    // 1.35 是第十八轮从实测钉出来的：400 局取样（seed 1..50 × steady/warden × 四出身）
    // 修复后 诗文清望 83.1 / 没落世家 71.6 = 1.16，余量留得不大。
    // 第十九轮把局长整体拉长之后，同一批 400 局是 107.3 / 104.3 = 1.03 —— 出身差距反而小了
    // （因为死得早的那批人本来就是被善终窗口提前收走的）。阈值不动：这一格管的是出身平衡，
    // 不是本轮的正戏可达性，动它只会让下一轮的归因多一个变量。
    // 原来钉的是 1.6 那个猜测值 —— 而 ⑩ 那条"诗文清望特别短"正是在 1.6 之下混过去的。
    // 但要如实记一句：这条阈值在第十八轮修复前也是**过的**（53.3 / 42.8 = 1.25），
    // 因为它量的是出身之间的相对差距，而水坝是"所有幸存者被同一年收走"的绝对量问题 ——
    // 真正拦住坝的是下面「1635 水坝」与「1636 年以后」那两条。
  })

  it('挑任何一种出身，平均该撞见的事件数不许少到别的一半', () => {
    const rows = ORIGINS.map(o => ({ origin: o, events: avg(byOrigin.get(o)!.map(fired)) }))
      .sort((a, b) => b.events - a.events)
    console.log(`  触达事件：${rows.map(r => `${r.origin} ${r.events.toFixed(1)}`).join(' / ')}`)
    expect(
      rows[rows.length - 1].events / rows[0].events,
      `最少的${rows[rows.length - 1].origin}只撞见 ${rows[rows.length - 1].events.toFixed(1)} 条，` +
        `最多的${rows[0].origin}有 ${rows[0].events.toFixed(1)} 条`
    ).toBeGreaterThanOrEqual(0.75)
    // 0.75 的量纲是"最少的出身不许只撞见最多的一半"。第十八轮的实测把它按在 steady/warden 上：
    // 修复后 113.2 / 126.7 = 0.89，修复前 77.9 / 95.9 = 0.81 —— 也就是说这一条**两轮都在阈值内**，
    // 它拦的不是水坝，是出身之间的内容失衡。同一批种子换成 random/ambitious 是 50.4 / 95.1 = 0.53，
    // 见 §1.4 ⑭：那条差距是真的，但拿随机点选项的玩家来钉 CI 只会把阈值长期钉在噪音上。
  })

  it.skipIf(SEALERS_ONLY)('「1635 水坝」不许回来：除 1644 之外，任何一年都不许成为最常见的死法', () => {
    const all = [...byOrigin.values()].flat()
    const byYear = new Map<number, number>()
    for (const r of all) byYear.set(r.finalYear, (byYear.get(r.finalYear) ?? 0) + 1)
    // 1644 是**那一年本身**在收人，不是坝：甲申国变的年窗写死 `1644..1644`（李自成入京是固定日期），
    // 而国势崩解曲线从 1636 起 -1/月、1640 起 -2、1643 起 -3，幸存者到 1644 必然已经 国势≤15。
    // 坝的特征是"某条**状态型**善终在它年窗开放的那一年把幸存者一口吞掉" ——
    // 所以把 1644 从"最常见死法"的候选里摘出去，其余任何一年吃掉四成仍然就是坝回来了。
    const candidates = [...byYear].filter(([y]) => y !== JIASHEN_YEAR)
    const [topYear, topCount] = candidates.sort((a, b) => b[1] - a[1])[0]
    const share = topCount / all.length
    console.log(
      `  除 ${JIASHEN_YEAR} 年之外终局最集中的年份：${topYear} 年，占 ${(share * 100).toFixed(0)}%（${topCount}/${all.length} 局）`
    )
    expect(
      share,
      `${topYear} 年一年吃掉 ${all.length} 局里的 ${topCount} 局 —— ` +
        `这就是"善终结局在窗口开放当年把幸存者全部收走"的水坝特征。` +
        `第十八轮修复前实测：1635 年 187/400 局（47%）`
    ).toBeLessThanOrEqual(0.4)
  })

  it.skipIf(SEALERS_ONLY)('想继续玩下去的玩家，不该被收束型结局结案（§1.4 ⑬ 的直接口径）', () => {
    const all = [...byOrigin.values()].flat()
    const sealed = all.filter(r => DECLINABLE_ENDING_IDS.includes(r.endingId ?? ''))
    const share = sealed.length / all.length
    console.log(`  以可拒笔的收束型结局结案：${sealed.length}/${all.length}（${(share * 100).toFixed(0)}%）`)
    expect(
      share,
      `${sealed.length} 局在本可以拒笔的时候被结成了收束型结局 —— ` +
        `引擎又回到"判定命中就替玩家结案"去了。第十八轮实测：187/400（47%），全部落在年窗开放那一年`
    ).toBeLessThanOrEqual(0.05)
    // 5% 而不是 0%：请笔卡上除了【收笔】之外的那几条也可能被经历门槛锁住，
    // 此时模拟按"勉力一试"处理，pool 退回全部选项、只剩盖棺那条可点。
    // 400 局实测为 0/400，余量留给那种边角而不是留给回归。
    // 第二十轮 B 把名单从 11 条善终扩到 13 条（补 `殉职任上`/`流亡海外`）：
    // 口径不变，量的还是"能不能拒"，不是"拒了之后死得多不多"。
  })

  it.skipIf(SEALERS_ONLY)('崇祯朝的正戏（1636 年以后，国势崩解曲线起跑）必须有局真的玩进去', () => {
    const all = [...byOrigin.values()].flat()
    const late = all.filter(r => r.finalYear >= 1636)
    const share = late.length / all.length
    console.log(`  活到 1636 年以后：${late.length}/${all.length} 局（${(share * 100).toFixed(0)}%）`)
    expect(
      share,
      `${all.length} 局里只有 ${late.length} 局进入 1636-1644 —— ` +
        `那一段的历史事件池、回响（年窗到 1644）、以及甲申国变/城破殉城/南渡/称臣/东林烈士全部是白写的。` +
        `第十八轮修复前实测为 0/400`
    ).toBeGreaterThanOrEqual(0.4)
    // 0.3 → 0.4 是**收紧**：第十八轮量到 200/400（50%），第十九轮「史馆请笔」之后仍是 200/400。
    // 阈值取实测下面 10 个百分点，够挡住"某条善终结局又提前收人"，又不至于贴脸。
  })

  it.skipIf(SEALERS_ONLY)('甲申之变这一段，实测里必须成批真的发生过', () => {
    const all = [...byOrigin.values()].flat()
    const jiashen = all.filter(r => r.finalYear >= JIASHEN_YEAR)
    const share = jiashen.length / all.length
    console.log(`  玩进 ${JIASHEN_YEAR} 年及以后：${jiashen.length}/${all.length} 局（${(share * 100).toFixed(0)}%）`)
    expect(
      share,
      `${all.length} 局里只有 ${jiashen.length} 局走到 ${JIASHEN_YEAR} —— ` +
        `城破殉城、南渡续祚、称臣纳贡、东林烈士、year_1644 那三条成就又要变回白写的内容。` +
        `第十九轮「史馆请笔」实测 185/400（46%）；第十八轮修复前 0/400`
    ).toBeGreaterThanOrEqual(0.3)
  })

  it.skipIf(SEALERS_ONLY)('三条回响的开门经历，实测里得真的被写出来过（§1.4 ⑪）', () => {
    const all = [...byOrigin.values()].flat()
    const counts = new Map<string, number>()
    for (const need of ['abandoned_liushi', 'xianv_token', 'lixiangjun_respect']) {
      counts.set(need, all.filter(r => (r.finalFlags ?? []).includes(need)).length)
    }
    console.log(`  开门经历被写出：${[...counts].map(([f, n]) => `${f}×${n}`).join(' ')}`)
    const never = [...counts].filter(([, n]) => n === 0).map(([f]) => f)
    expect(
      never,
      `这些经历一局都没被写出来，靠它开门的回响（《如烟嫁期》《玉佩之约》《桃叶渡再闻》）` +
        `就是白写的文案 —— 要修的是上游那条选项的数值，不是回响的门槛`
    ).toEqual([])
  })
})
