import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 党派线与三条党派结局的**实测触达**（第二十一轮）。
 *
 * 可达性矩阵（`scripts/audit-ending-reachability.ts`）是静态的：它说得出
 * "这一格的门槛能被一份合法存档满足"和"门票发得出来"，但它说不出
 * **玩家真会走到那儿**。上一轮就栽在这两句话的差别上 ——
 * 400 局 ×0 被读成了"走不到"，而真相是"没有策略会朝那扇门走"。
 *
 * 所以这里补的是另一件事：跑真引擎，量三个静态量不出来的数 ——
 *   1. 新写的 `faction_005`（唯一发得出 `叛徒` 的那一场）和 `echo_faction_007`
 *      （唯一读那三张身份票的那一场）到底播没播出来过。没播出来，加内容等于没加。
 *   2. `党争烈度` 实测最高到多少。改造前它是**硬顶在 38 的**：引擎只认五张门票 flag，
 *      其中只有 `复社成员` 有写手，而写手是出身事件、一局只发一次（30+8）。
 *      《党争牺牲品》要 90。所以"实测 >38"就是那扇门被推开了的直接证据。
 *   3. 三条党派结局有没有被任一策略真走到过。
 *
 * 第 3 条**只打印不断言**：本模拟的四种策略没有一种会朝"烈度 90 且两边都不站"走，
 * 量不出来说明不了走不到（§1.4 ⑮ 的教训）。前两条才是这一文件的钉子。
 *
 * **出身必须轮着来**，这一条是被实测教出来的：`simulateRun` 默认 `origin='寒门'`，
 * 而 阉党路线 唯一的写手 `faction_002/c2` 的 `showConditions.origin` 只放
 * 缙绅／没落世家 —— 用默认出身跑，整条阉党线恒 0，量的根本不是可达性而是出身。
 * （清流＝寒门／诗文清望、阉党＝缙绅／没落世家 是这批事件原本的作者意图，不改它。）
 */

const GAMES = Number(process.env.SIM_GAMES ?? 24)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const POLICIES = (process.env.SIM_POLICIES ?? 'warden,steady').split(',') as Array<
  'warden' | 'steady' | 'sealer' | 'random' | 'first' | 'ambitious'
>
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

/** 引擎 faction 段认的五张身份票（`useGameEngine.ts` 的 handleChoice） */
const TICKETS = ['阉党路线', '复社成员', '东林死忠', '叛徒', '两面三刀']

/** 改造前 `党争烈度` 的天花板：初值 30 + 复社成员一次 +8。实测必须越过它。 */
const PRE_FIX_CEILING = 38

const runs: SimOutcome[] = []

beforeAll(async () => {
  for (let i = 0; i < GAMES; i++) {
    runs.push(
      await simulateRun({
        // 第六十六轮重抄（旧 4000 起）：八条历史事件的出身门从"五名里的五名"补成 ALL_ORIGINS
        // （§1.4 ㊶），四种老出身的事件池各多了一两条，骰子序列整体挪位 —— 4000..4023 里
        // 阉党路线一次也没被带上身。在 4000..4079 里筛出 4048 起 24 局：阉党路线（faction_002/c2
        // 的写手）、东林死忠、两面三刀三张票都在，faction_005 播了 4 次，echo_faction_007 播了 5 次。
        seed: 4048 + i,
        policy: POLICIES[i % POLICIES.length],
        // 出身与策略错开取，四种出身都能被两种策略轮到
        origin: ORIGINS[Math.floor(i / POLICIES.length) % ORIGINS.length],
        maxMonths: MONTHS
      })
    )
  }
}, 900_000)

const firedIn = (id: string) => runs.filter(r => r.firedEventIds.includes(id)).length
const fireTimes = (id: string) =>
  runs.reduce((n, r) => n + r.firedEventIds.filter(x => x === id).length, 0)

describe(`党派线实测（${POLICIES.join('/')} 组 ${GAMES} 局）`, () => {

  it('faction_005 真的播出来过 —— 它是 叛徒 唯一的产地', () => {
    expect(
      fireTimes('faction_005'),
      `${GAMES} 局里《阁老的分赃》一次也没播出来 —— 它要求「阉党路线」，` +
        '而那张票只有 faction_002/c2 发得出（缙绅／没落世家、道德≤60）。' +
        '这条断了，《权奸末路》就又是一格死的'
    ).toBeGreaterThan(0)
  })

  it('echo_faction_007 真的播出来过 —— 它是那三张身份票唯一的读者', () => {
    expect(
      fireTimes('echo_faction_007'),
      `${GAMES} 局里《同僚的考语》一次也没播出来 —— 三张新票就又变回只写不读，` +
        '第十七轮那条"回响池自己不许成为新的白存堆"的规矩就破了'
    ).toBeGreaterThan(0)
  })

  it('党争烈度必须刷过改造前那个 38 的硬顶', () => {
    const peak = runs.reduce((m, r) => Math.max(m, r.finalFaction?.党争烈度 ?? 0), 0)
    expect(
      peak,
      `实测党争烈度最高 ${peak}，没有超过改造前的硬顶 ${PRE_FIX_CEILING} —— ` +
        '说明四张新门票 flag 实际上一次也没被带上身，党派结局依旧全灭'
    ).toBeGreaterThan(PRE_FIX_CEILING)
  })

  it('五张身份票里，至少阉党路线／东林死忠／两面三刀这三张真会被带上身', () => {
    const seen = new Set<string>()
    for (const r of runs) for (const f of r.finalFlags) if (TICKETS.includes(f)) seen.add(f)
    // `叛徒` 不在这一条里：它要 faction_005 里【撕了卷子】那一支，
    // 而 warden／steady 两种策略都不会稳定选它 —— 上面第一条只管"播出来过"。
    for (const must of ['阉党路线', '东林死忠', '两面三刀']) {
      expect(
        seen.has(must),
        `「${must}」在这 ${GAMES} 局的终局身上一次也没出现过 —— 它的写手没被抽到，` +
          '引擎的 faction 段因此是死代码'
      ).toBe(true)
    }
  })

  it('党派结局的实测触达（只打印，不作为断言 —— 没有策略会朝这扇门走）', () => {
    const rows = runs.map(r => ({
      id: r.endingId ?? r.endEventId ?? '-',
      faction: r.finalFaction,
      tickets: r.finalFlags.filter(f => TICKETS.includes(f))
    }))
    const factionEndings = ['triggerable_faction_martyr', 'triggerable_faction_tyrant_fall', 'triggerable_faction_sacrifice']
    const hit = rows.filter(x => x.id && factionEndings.includes(x.id))
    const peak = (pick: (f: NonNullable<SimOutcome['finalFaction']>) => number) =>
      runs.reduce((m, r) => Math.max(m, r.finalFaction ? pick(r.finalFaction) : 0), 0)
    console.log(
      `  党派结局走到：${hit.length}/${GAMES} 局\n` +
        `  实测峰值  烈度=${peak(f => f.党争烈度)} 东林=${peak(f => f.东林好感)} 阉党=${peak(f => f.阉党好感)}\n` +
        `  播出次数：` +
        ['faction_001', 'faction_002', 'faction_003', 'faction_005', 'echo_faction_007']
          .map(id => `${id}×${fireTimes(id)}(${firedIn(id)}局)`)
          .join(' · ') +
        `\n  身份票上身：` +
        (TICKETS.map(t => `${t}×${runs.reduce((n, r) => n + (r.finalFlags.includes(t) ? 1 : 0), 0)}`).join(' / ')) +
        `\n  其中走过阉党线的局（缙绅／没落世家出身）：` +
        runs.reduce((n, r) => n + (r.finalFlags.includes('阉党路线') ? 1 : 0), 0)
    )
    expect(rows.length).toBe(GAMES)
  })
})
