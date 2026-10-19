import { beforeAll, describe, expect, it } from 'vitest'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import { allEndingEvents } from '../../src/data/events/ending'
import type { OriginType } from '../../src/types/game'

/**
 * 《清流骨鲠》这一格的实测触达（第二十三轮）。
 *
 * 它从第十九轮起就挂在 §1.4 ⑮ 的那张"×0 名单"上，归因写的是**遮蔽**：
 * `名臣垂范` priority 100 排在 清流 121 之前，两者读同一批维度
 * （名臣 道德值≥80 ∧ 清议≥70 ∧ 圣眷≥35；清流 文韬≥75 ∧ 道德值≥70 ∧ 清议≥65），
 * 1640 那年先被名臣接走。可达性矩阵量不到这件事 —— 它给每一格配的是**自己的**存档，
 * 那一格在自己的存档上当然成立；只有把两格放进同一个玩家身上才看得出谁先命中。
 *
 * 第二十二轮把"拒一次笔关死十三格"拆成逐格闸门之后，遮蔽还剩不剩、还剩多少，
 * 变成一个**只能实测**的问题：一个就是要《清流骨鲠》的玩家，现在能不能
 * 拒掉《致仕善终》、拒掉《名臣垂范》，然后在 1640–1643 被清流请笔？
 *
 * 口径：`stream` 组的门票与互斥面都从那一格自己读（不在这里手抄），圣眷放在 40 上下
 * ——**故意放在名臣的窗口里**：这一组要量的不是"躲开名臣"，而是"拒掉名臣之后那一格亮不亮"；
 * 文韬按画像加分往上推（它不在八条归零死线上，保命那套管不到它）。出身轮着来。
 *
 * 实测结论（40 局 × 四出身）：**遮蔽已经不成立了。**
 * 《名臣垂范》开卡 **0 局**，《致仕善终》开卡 22 局、**22 局全部拒掉并且继续往下走**
 * （第二十二轮那道逐格闸门在起作用），《清流骨鲠》开卡 8 局、收笔结案 8 局。
 * 名臣之所以一次也没开口，不是这组玩家躲开了它，而是《清议之争》那条门票事件自带
 * 圣眷−15/−10 —— 言官这条路本来就把圣眷往下压，而名臣要 圣眷≥35。
 * 这 40 局里最多的收束其实是《清流殉道》×24（它 1632 年就能开口，清流骨鲠 要 1640），
 * 诏狱冤死 ×7。
 *
 * 顺手量出来的真问题是**幽灵门票**：那一格的 `any` 里 清议派 与 廷杖 两张票全库无人写，
 * 而文案写的偏偏是"你被廷杖过三次"。整类（10 格 17 处）由
 * `tests/unit/audit.endingTicketWriters.test.ts` 钉住，本轮已全部改到写得出来的票上。
 */

const TILE_TITLES = new Map(allEndingEvents.map(e => [e.id, e.title]))
/** 目标格子自己声明的门票池 —— 从数据读，不在这里手抄 */
const STREAM_TICKETS = (
  allEndingEvents.find(e => e.id === 'ending_pure_stream')!.conditions?.flags?.any ?? []
) as string[]
/** 名臣垂范 的圣眷下限：这一组的圣眷故意留在这条线之上 */
const MINISTER_FAVOR_FLOOR = 35

const GAMES = Number(process.env.SIM_GAMES ?? 40)
const MONTHS = Number(process.env.SIM_MONTHS ?? 240)
const ORIGINS: OriginType[] = ['缙绅', '寒门', '没落世家', '诗文清望']

const TARGET = 'ending_pure_stream'
/** 挡在它前面的两格：1635 就开口的 致仕善终，和 1640 抢位的 名臣垂范 */
const BLOCKERS = ['ending_honorable_retirement', 'ending_famous_minister']

const runs: SimOutcome[] = []

beforeAll(async () => {
  for (let i = 0; i < GAMES; i++) {
    runs.push(
      await simulateRun({
        seed: 6100 + i,
        policy: 'stream',
        origin: ORIGINS[i % ORIGINS.length],
        maxMonths: MONTHS
      })
    )
  }
}, 900_000)

const firedIn = (id: string) => runs.filter(r => r.firedEventIds.includes(id))
const sealed = (id: string) => runs.filter(r => r.endingId === id)
const carriedAny = (flags: string[]) => runs.filter(r => r.finalFlags.some(f => flags.includes(f)))

describe(`清流骨鲠 实测（stream 组 ${GAMES} 局 × 四出身）`, () => {
  it('门票的产地《清议之争》真的播出来过 —— 它是 言官/弹劾温体仁/弹劾杨嗣昌 的唯一写手', () => {
    const aired = firedIn('route_impeach_ministers')
    expect(
      aired.length,
      `${GAMES} 局里《清议之争》一次也没播。它要 1635–1642 ∧ 文韬≥55 ∧ 道德≥60 ∧ 清议≥50 —— ` +
        '走到过那个状态的人，要么没活到 1635，要么被别的格子先收走了'
    ).toBeGreaterThan(0)
  })

  it('门票真会上身 —— 否则那一格的 flag 门是空的', () => {
    const withTicket = carriedAny(STREAM_TICKETS)
    expect(
      withTicket.length,
      `${GAMES} 局里没有一局终局带着《清流骨鲠》的门票：` +
        `它的 any 池是 ${STREAM_TICKETS.join(' / ')}`
    ).toBeGreaterThan(0)
  })

  it('拒过《致仕善终》的玩家还能继续往下走 —— 逐格闸门没有把它自己也关死', () => {
    const declined = firedIn('ending_honorable_retirement').filter(
      r => r.endingId !== 'ending_honorable_retirement'
    )
    expect(
      declined.length,
      `${GAMES} 局里没有一局拒过《致仕善终》—— 说明它压根没开口，` +
        '要么这一组的圣眷掉到了 40 以下（它的门），要么 1635 那年先被别的格子接走'
    ).toBeGreaterThan(0)
    const after1635 = declined.filter(r => r.finalYear > 1635)
    expect(
      after1635.length,
      `拒过致仕笔的 ${declined.length} 局里，没有一局走过 1635 —— 拒笔之后立刻被别的结局收掉了`
    ).toBeGreaterThan(0)
  })

  it('遮蔽的真相：名臣 与 清流 在同一批玩家身上重叠到什么程度', () => {
    const offered = firedIn(TARGET)
    const ministerFirst = firedIn('ending_famous_minister')
    const both = runs.filter(r => r.firedEventIds.includes(TARGET) && r.firedEventIds.includes('ending_famous_minister'))
    const withFavor = ministerFirst.filter(
      r => (r.finalThresholds.圣眷 ?? 100) >= MINISTER_FAVOR_FLOOR
    )
    console.log(
      BLOCKERS.map(id => `  《${TILE_TITLES.get(id)}》开卡 ${firedIn(id).length} 局 / 结案 ${sealed(id).length} 局`).join('\n') +
        `\n  《名臣垂范》开卡 ${ministerFirst.length} 局（其中圣眷≥${MINISTER_FAVOR_FLOOR} 的 ${withFavor.length} 局）\n` +
        `  两格都开过卡的 ${both.length} 局 —— 拒掉名臣之后清流开口，这条链路通不通就看它\n` +
        `  《清流骨鲠》开卡 ${offered.length} 局，收笔结案 ${sealed(TARGET).length} 局\n` +
        `  门票上身：${STREAM_TICKETS.map(f => `${f}×${carriedAny([f]).length}`).join(' ')}\n` +
        `  局长：min=${Math.min(...runs.map(r => r.months))} ` +
        `avg=${Math.round(runs.reduce((n, r) => n + r.months, 0) / GAMES)} ` +
        `max=${Math.max(...runs.map(r => r.months))}\n` +
        `  终局分布：` +
        (() => {
          const m = new Map<string, number>()
          for (const r of runs) {
            const id = r.endingId ?? r.endEventId ?? '-'
            m.set(id, (m.get(id) ?? 0) + 1)
          }
          return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${TILE_TITLES.get(k) ?? k}×${v}`).join(' · ')
        })()
    )
    expect(
      offered.length,
      `${GAMES} 局里有玩家专门朝《清流骨鲠》走，卡却一次也没开：` +
        '门票、四道状态门、或那道逐格闸门，至少有一头接不上（逐条见上面的打印）'
    ).toBeGreaterThan(0)
  })

  it('《清流骨鲠》这一格亮得起来，而且真有人收笔在这一格上', () => {
    const hit = sealed(TARGET).length
    console.log(`  实测：${GAMES} 局 stream 组里《清流骨鲠》结案 ${hit} 局`)
    expect(hit, `${GAMES} 局专门朝它走的玩家没有一局收在这一格上`).toBeGreaterThan(0)
  })

  it('跑完不许有异常局', () => {
    expect(runs.filter(r => r.error).map(r => `seed=${r.seed} ${r.error}`)).toEqual([])
  })
})
