import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { allEndingEvents } from '../../src/data/events/ending'
import type { OriginType } from '../../src/types/game'

/** 图鉴格子 id → 标题（打印用：`诏狱冤死×11` 比 `ending_zhaoyu_prison×11` 好读） */
const TILE_TITLES = new Map(allEndingEvents.map(e => [e.id, e.title]))
/** 《遁入空门》自己的互斥面 —— 从数据里读，不在这里手抄一遍 */
const NIRVANA_EXCLUDE = (
  allEndingEvents.find(e => e.id === 'ending_monk_nirvana')!.conditions?.flags?.notHas ?? []
) as string[]
/** 会写下 `史馆辞笔` 的那些格子（请笔卡）：拒过一张只关那一格（第二十二轮起的口径） */
const DECLINABLE_TILES = allEndingEvents.filter(e => e.declinable).map(e => e.id)

/**
 * 「求退」那条路的实测触达（第二十二轮）。
 *
 * 这一量具是为了回答两个静态量不出来的问题：
 *
 * 1. **门票到底发不发得出来。** 《遁入空门》原先四张票里，`出家`/`和尚` 只有 1644 年那两条
 *    事件写得出来（而甲申国变 p106 排在它们前面），`脱俗`/`看破红尘` 从前全库无人写 ——
 *    可达性矩阵照样判它 `ok`，因为 `any` 里只要有一张有写手就行。**这就是矩阵说得出
 *    "门后有把手"却说不出"玩家摸得到"的那一格。** 本轮把 `看破红尘` 还给
 *    `route_hermit/c1`（那条选项的结果标题本来就写着「心灰意冷 · 看破红尘」），
 *    所以第一条断言量的是"这一行 flag 有没有真的上过玩家身"。
 *    （第二十三轮把那一张仍无人写的 `脱俗` 从池子里摘了 —— 见 `audit.endingTicketWriters`。）
 * 2. **那一格会不会被邻格抢走。** 《诏狱冤死》p102 要 圣眷≤15 ∧ 带过 袁党/清算袁党，
 *    而 遁入空门 p114 要 圣眷≤35 —— 圣眷是一个**每月自己往下掉**的维度
 *    （实测：声明 +26 的一局，125 个月后实际 −15），求退的玩家必然穿过 15 以下那段。
 *    从前它的 `notHas` 摘了 出家/和尚 却没摘 看破红尘，于是刚看破红尘的人先被缇骑拖走。
 *
 * 归隐田园 那一格顺便量了：它的门票从来有人写（`route_grand_scholar/c1` 写 归隐/辞官/讲学，
 * 年窗 1640–1643、不要失宠），§1.4 ⑯ 第 4 条把它和 遁入空门 一起点名"缺写手"是错的 ——
 * 缺的是**一个朝那扇门走的策略**，所以有了 `hermit` 这一组。
 *
 * 3. **补了门票之后那一格才真的亮。** 这是本轮最后测出来的，也是量具自己先扑的那一次：
 *    `看破红尘` 接上之后重跑 40 局，格子仍然是 ×0，因为《遁入空门》p114 排在《归隐田园》
 *    p109 之后，而求退的玩家一路都在拒笔（拒掉"不是我要的那一格"是唯一合理的选择），
 *    拒笔写下的 `史馆辞笔` 是十三格的公共 `notHas`。本轮把闸门拆成逐格的 `搁笔·<格名>`，
 *    两格这才各自亮起来（实测 遁入空门×7 / 归隐田园×12）。
 *
 * 口径：`hermit` 组的玩家把圣眷放在低位（但守住不归零）、把道德与清议往上推、
 * 见那两格的门票就捡、别的请笔一律拒。出身轮着来，别让"量到的 0"其实是出身。
 */

const GAMES = Number(process.env.SIM_GAMES ?? 40)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const POLICIES = (process.env.SIM_POLICIES ?? 'monk,hermit').split(',') as Array<
  'hermit' | 'monk' | 'warden' | 'steady' | 'sealer' | 'random' | 'first' | 'ambitious'
>
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

/** 本轮补上的那张票（route_hermit/c1） */
const MONK_TICKET = '看破红尘'
/** 这一组想撞的两格 */
const TARGETS = ['ending_monk_nirvana', 'ending_hermit_taoist']

const runs: SimOutcome[] = []

beforeAll(async () => {
  for (let i = 0; i < GAMES; i++) {
    runs.push(
      await simulateRun({
        seed: 5200 + i,
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
const carried = (flag: string) => runs.filter(r => r.finalFlags.includes(flag))

describe(`求退线实测（${POLICIES.join('/')} 组 ${GAMES} 局 × 四出身）`, () => {

  it('route_hermit 真的播出来过 —— 它是 看破红尘 唯一的产地', () => {
    expect(
      fireTimes('route_hermit'),
      `${GAMES} 局里《心灰意冷》一次也没播出来。它要 1636–1642 ∧ 道德≥50 ∧ 圣眷≤50，` +
        '一局都没走到那个状态，说明这一组玩家的局长还是太短（⑭）'
    ).toBeGreaterThan(0)
  })

  it('看破红尘 真会被带上身 —— 否则《遁入空门》仍然是一格只有 1644 年门票的死格', () => {
    expect(
      carried(MONK_TICKET).length,
      `${GAMES} 局里没有一局终局带着「${MONK_TICKET}」：` +
        '要么 route_hermit 没播，要么玩家选了【坚守岗位】/【半官半隐】那两支'
    ).toBeGreaterThan(0)
  })

  it('归隐田园 这一格在"有人朝它走"之后真的亮得起来', () => {
    const hit = runs.filter(r => r.endingId === 'ending_hermit_taoist').length
    expect(
      hit,
      `${GAMES} 局求退玩家里没有一局走到《归隐田园》—— 它的门票（归隐/辞官/讲学，` +
        'route_grand_scholar/c1）与状态门（道德≥70 ∧ 清议≥55 ∧ 圣眷≤45）至少有一头接不上'
    ).toBeGreaterThan(0)
  })

  it('遁入空门 这一格也亮得起来', () => {
    // 这一格先后栽在两处，都得有钉子：
    //  ① 四张门票（出家/和尚/脱俗/看破红尘）里，前两张只有 1644 年那两条事件写得出来，
    //     而后两张全库无人写 —— 本轮补的是 `route_hermit/c1` → `看破红尘`；
    //  ② 门票补上之后照样 ×0。带票 10 局、四道状态门全过 7 局、**开卡 0 局**，
    //     原因是拒过任意一张请笔卡就写下 `史馆辞笔`，而它是全部十三格的公共 notHas。
    //     本轮把闸门拆成逐格的 `搁笔·<格名>`（见 src/data/endingDecline.ts）。
    const hit = runs.filter(r => r.endingId === 'ending_monk_nirvana').length
    expect(
      hit,
      `${GAMES} 局求退玩家里没有一局走到《遁入空门》—— 它的门是 ` +
        '圣眷≤35 ∧ 道德≥65 ∧ 体质≥10 ∧ 年≥1635，且不带那十五张互斥经历'
    ).toBeGreaterThan(0)
    expect(
      firedIn('ending_monk_nirvana'),
      '格子亮过但卡一次也没摆上过桌 —— 那是被别的路径顺手结掉的，不是玩家走到的'
    ).toBeGreaterThan(0)
  })

  it('带着 看破红尘 的局，圣眷确实落在 遁入空门 的窗口里（≤35）', () => {
    const withTicket = carried(MONK_TICKET)
    const inWindow = withTicket.filter(r => (r.finalThresholds.圣眷 ?? 100) <= 35)
    /** 《遁入空门》那一格的三道状态门，逐条量给"为什么没开卡"看 */
    const qualified = withTicket.filter(
      r =>
        (r.finalThresholds.圣眷 ?? 100) <= 35 &&
        (r.finalThresholds.道德值 ?? 0) >= 65 &&
        (r.finalThresholds.体质 ?? 0) >= 10 &&
        r.finalYear >= 1635
    )
    console.log(
      `  带票 ${withTicket.length} 局，其中圣眷≤35 的 ${inWindow.length} 局、` +
        `四道门全过的 ${qualified.length} 局\n` +
        `  《遁入空门》的互斥面 notHas：${NIRVANA_EXCLUDE.join(' / ')}\n` +
        withTicket
          .slice(0, 8)
          .map(r => `    seed=${r.seed} 年=${r.finalYear} 月=${r.months} 结局=${TILE_TITLES.get(r.endingId ?? '') ?? r.endingId ?? r.endEventId ?? '-'} ` +
            `圣眷=${r.finalThresholds.圣眷} 清议=${r.finalThresholds.清议} 道德=${r.finalThresholds.道德值} 体质=${r.finalThresholds.体质} ` +
            `开过的请笔=${r.firedEventIds.filter(id => DECLINABLE_TILES.includes(id)).join(',') || '-'} ` +
            `撞互斥=${r.finalFlags.filter(f => NIRVANA_EXCLUDE.includes(f)).join(',') || '-'}`)
          .join('\n')
    )
    expect(
      inWindow.length,
      `带票的 ${withTicket.length} 局里没有一局停在 圣眷≤35 —— 求退的玩家把圣眷放得太高，` +
        '或者掉得太快（穿过窗口时那格还没被轮到）'
    ).toBeGreaterThan(0)
  })

  it('两格的实测触达（含 诏狱冤死 的抢位与终局分布）', () => {
    const counts = TARGETS.map(id => `${id}×${runs.reduce((n, r) => n + (r.endingId === id ? 1 : 0), 0)}`)
    const ended = new Map<string, number>()
    for (const r of runs) {
      const id = r.endingId ?? r.endEventId ?? '-'
      ended.set(id, (ended.get(id) ?? 0) + 1)
    }
    console.log(
      `  目标两格：${counts.join(' / ')}（共 ${GAMES} 局）\n` +
        `  请笔开过卡：` +
        TARGETS.map(id => `${id} ${firedIn(id)}局`).join(' / ') + '\n' +
        `  局长：min=${Math.min(...runs.map(r => r.months))} ` +
        `avg=${Math.round(runs.reduce((n, r) => n + r.months, 0) / GAMES)} ` +
        `max=${Math.max(...runs.map(r => r.months))}\n` +
        `  心灰意冷播出：${fireTimes('route_hermit')} 次／${firedIn('route_hermit')} 局\n` +
        `  终局分布：` +
        [...ended.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${TILE_TITLES.get(k) ?? k}×${v}`)
          .join(' · ')
    )
    // 只钉"这一组确实跑完了"，遁入空门 那一格见上面三条与 §1.4 ⑯：
    // 它现在缺的已经不是门票，而是"圣眷在 15–35 这段停得住"这件事本身。
    expect(runs.filter(r => r.error).map(r => `seed=${r.seed} ${r.error}`)).toEqual([])
  })
})
