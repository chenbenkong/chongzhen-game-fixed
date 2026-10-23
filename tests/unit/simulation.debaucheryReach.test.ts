import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { buildParams } from '../../scripts/audit-ending-reachability'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'

/**
 * 风月线三格在**真跑局**里站不站得进去（第四十九轮的结案证据）。
 *
 * 第四十八轮把 001《精尽人亡》／fall《纵欲而亡》／pimp《烟花之主》从"纯数值"改成了读经历票，
 * 第四十九轮又补了两张第二拍事件（`gray_debauchery_030`《秦淮暗股》写 青楼暗股／青楼靠山，
 * `gray_debauchery_031`《纵欲成疾》写 纵欲成疾／闭门谢客）。静态对账（`ending.debaucheryTickets.test.ts`）
 * 只能证明"票有写手、门读得通"，证明不了"有一个人真的按这条路走完"。
 * 可达性矩阵更弱：它算的是"存在一条路径"，不是"玩家看得见那条路径"。
 *
 * 所以要两副画像，因为这三格**方向相反**：
 *  - `debauched` 朝《烟花之主》（要 财帛≥100 ∧ 中官≥20 ∧ 清议≤30），一路挣钱养关系；
 *  - `burnout` 朝《精尽人亡》（要 体质≤10），把 体质 拖下坡，同时留得住钱 ——
 *    第一版没给 财帛 权重，24 局里 11 局死在 `倾家荡产` 上，压根没活到 体质 见底。
 * 出身统一 缙绅：财帛 80 起步，是唯一不必先靠别的支线补钱的四个出身。
 *
 * 断言只钉"每格至少走进去过"，不钉具体种子 —— 同一进程里重复 `simulateRun` 会让 RNG 位移
 * （`simulation.playthrough.test.ts` 头部记过这件事），钉种子只会得到一份不可复制的读数。
 *
 * 另外钉一条**反向**的：`闭门谢客` 是三格共同的 `notHas`（031 的【遣散后院】写下它），
 * 一旦点下这一条，整条风月线就地关门。这条关门必须在跑局里真的关门 ——
 * 它是"自然分支"的另一半：选择要有不可逆的形状，而不只是扣几点道德。
 */

const GAMES = Number(process.env.SIM_GAMES ?? 24)
const MONTHS = Number(process.env.SIM_MONTHS ?? 260)
const ORIGIN = '缙绅'

const PIMP = 'ending_pimp_lord'
const FALL = 'ending_debauch_fall'
const DIED = 'ending_debauchery_001'

const windRuns: SimOutcome[] = []
const burnRuns: SimOutcome[] = []

beforeAll(async () => {
  for (let i = 0; i < GAMES; i++) {
    windRuns.push(
      await simulateRun({ seed: 9100 + i, policy: 'debauched', origin: ORIGIN, maxMonths: MONTHS, traceMonths: true })
    )
  }
  for (let i = 0; i < GAMES; i++) {
    burnRuns.push(
      await simulateRun({ seed: 9200 + i, policy: 'burnout', origin: ORIGIN, maxMonths: MONTHS, traceMonths: true })
    )
  }
  const dist = (list: SimOutcome[]) => {
    const m = new Map<string, number>()
    for (const r of list) m.set(r.endingTitle ?? r.endingId ?? '未结案', (m.get(r.endingTitle ?? r.endingId ?? '未结案') ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ')
  }
  console.log(`WIND-DIST debauched: ${dist(windRuns)}\nWIND-DIST burnout: ${dist(burnRuns)}`)
}, 180_000)

const all = () => [...windRuns, ...burnRuns]
const endedAs = (id: string) => all().filter(r => r.endingId === id)
const closedDoor = (r: SimOutcome) => r.finalFlags.includes('闭门谢客')

describe('风月线三格：实测可达', () => {
  it('第二拍事件真的被发出来过', () => {
    const fired = new Set(all().flatMap(r => r.firedEventIds))
    expect(fired.has('gray_debauchery_030'), '《秦淮暗股》一局都没发过').toBe(true)
    expect(fired.has('gray_debauchery_031'), '《纵欲成疾》一局都没发过').toBe(true)
  })

  it('《烟花之主》走进去过，而且身上带着那张生意票', () => {
    const hits = endedAs(PIMP)
    expect(hits.length, `${PIMP} 结案 0 局`).toBeGreaterThanOrEqual(2)
    for (const r of hits) {
      expect(r.finalFlags.filter(f => f === '青楼暗股' || f === '青楼靠山').length, `seed${r.seed} 没票却结了这一格`).toBeGreaterThan(0)
    }
  })

  it('《精尽人亡》走进去过 —— 体质≤10 这一格此前 48 轮从未结过案', () => {
    const hits = endedAs(DIED)
    expect(hits.length, `${DIED} 结案 0 局`).toBeGreaterThanOrEqual(1)
    for (const r of hits) {
      expect(r.finalThresholds['体质'], `seed${r.seed} 结案时 体质=${r.finalThresholds['体质']} 未≤10`).toBeLessThanOrEqual(10)
      expect(r.finalFlags).toContain('纵欲成疾')
    }
  })

  it('《纵欲而亡》走进去过，判据用的是"确诊后还不收手"那张票', () => {
    const hits = endedAs(FALL)
    expect(hits.length, `${FALL} 结案 0 局`).toBeGreaterThanOrEqual(1)
    for (const r of hits) {
      expect(r.finalFlags, `seed${r.seed} 没有 纵欲成疾 却结了 ${FALL}`).toContain('纵欲成疾')
    }
  })

  it('点了【遣散后院】的人结不了风月三格 —— 这条分支是真的关死的', () => {
    for (const r of all().filter(closedDoor)) {
      expect([PIMP, FALL, DIED], `seed${r.seed} 带 闭门谢客 仍结了 ${r.endingId}`).not.toContain(r.endingId)
    }
  })

  it('画像没有把 贪墨被查 撞穿：风月局的死法不是无声革职', () => {
    const quiet = all().filter(r => r.endingId === 'ending_demotion' && r.endReason?.includes('贪'))
    expect(quiet.length, quiet.map(r => `seed${r.seed}`).join(',')).toBeLessThanOrEqual(2)
  })

  it('门开着却被别格抢走的月份被记下来（优先级遮蔽的实测证据）', () => {
    // 注册表里的 id 就是事件 id（`wrapAsBoundaryEvent` 不额外加前缀），
    // 判定一律问引擎自己注册的那份 check，本文件一行判据都不写。
    const cells = [PIMP, FALL, DIED].map(id => ({ id, cell: boundaryEventManager.get(id) }))
    for (const c of cells) expect(c.cell, `${c.id} 没进边界注册表`).toBeTruthy()

    let openButTaken = 0
    let openAndWon = 0
    for (const r of all()) {
      for (const m of r.trace) {
        const params = buildParams(m.derived)
        const winner = boundaryEventManager.checkByType(params, 'ending')
        for (const c of cells) {
          if (!c.cell!.check(params)) continue
          if (winner?.id === c.id) openAndWon++
          else if (winner) openButTaken++
        }
      }
    }
    expect(openAndWon, '没有任何一个月由风月格结案').toBeGreaterThan(0)
    // 只报告读数，不断言条数：主叙事格排在风月格之前（`boundaryEvents.ts:916` 的注册顺序），
    // 遮蔽的具体月数随画像漂移，写死就成了脆断言。理由与修法见 KNOWN_ISSUES ㉘。
    console.log(`WIND-SHADOW openAndWon=${openAndWon} openButTaken=${openButTaken}`)
  })
})
