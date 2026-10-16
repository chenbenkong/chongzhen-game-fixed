import { describe, expect, it } from 'vitest'
import { scanFlagReachability } from '../../scripts/audit-flag-reachability'
import { allEchoEvents, aftermathEchoEvents } from '../../src/data/events/echo'
import { allEvents } from '../../scripts/event-pools'

/**
 * 「记忆回读率」的看门狗（第十五轮 D）。
 *
 * flag（经历）在这个游戏里只有一个读者：**门槛**。翻遍 `src/` —— 组件不显示它，
 * 传记不引用它，存档之外没人读它。所以"某个选项写了 flag，而全游戏没有一处门槛引用它"
 * 不是洁癖问题，是**玩家那次抉择等于没发生过**。
 *
 * 第十五轮实测（100 局、seed 1..100 × 4 策略 × 4 出身）：改造前平均每人随身带 9.8 个这种死 flag；
 * 回响池接上因果之后实测 12.0 个，其中约 4 个是回响池自己产出的 ——
 * 净变化是**变差**的。这个数不该被解释成"那还不如不做"：
 * 同一批取样里回响事件每局真的播出 1.99 次，18 条里 15 条被玩家撞见 ——
 * "被读到的经历"确实变多了，只是顺手又攒了一批没人读的新条子。
 *
 * 取样口径提醒：平均局长对策略组极敏感（苟活组含 warden：39.3 月；玩家组含 steady：23.4 月），
 * 换策略组等于换一批局，跨轮比数字之前先比这两行。
 *
 * 所以这里钉的是**棘轮**而不是"降到多少"：白存数量不许超过最近一次实测。
 * 想调这个数，就得先回答"这条 flag 谁来读" —— 该改的是内容，不是这个常量。
 *
 * 第十七轮把上面那段"净变化是变差的"还掉了：回响池的产出自己成了新的白存，
 * 就再写一波**只读不造词**的回响（`src/data/events/echo/aftermath.ts`）去接它们。
 * 实测白存 250 → 224、玩法回读率 44.1% → 50.4%，这是这个数第一次真正下降。
 *
 * 第十五轮 C 顺手把 71 处「假门槛」清零了：负面子句（notHas / none）里引用了全游戏
 * 没人写得出的经历 —— 那个条件恒真，纯装饰，留着只会让下一个改数据的人误以为有闸门。
 * 三条去处：拼错的改名（改完排除才真的生效）、被同数组里另一条可写经历覆盖的删除、
 * 同一事件内结构上不可能成立的删除。**这个数不许回到非零**，见下一条断言。
 */

/** 第十七轮实测：452 条可写经历里 224 条只写不读（第十五轮记录为 447/250） */
const WRITE_ONLY_CEILING = 224

const report = scanFlagReachability()

describe('flag 读写对账（记忆回读率）', () => {

  it('没有任何事件要求一段全游戏写不出来的经历', () => {
    expect(
      report.unsatisfiable,
      '门槛要求了一段没人写得出的经历，这条事件对所有玩家永久消失'
    ).toEqual([])
  })

  it('没有「被清掉却从没人写过」的经历', () => {
    expect(report.orphanRemove).toEqual([])
  })

  it('没有假门槛（负面子句只引用写得出来的经历）', () => {
    expect(
      report.inertNegative,
      `有 ${report.inertNegative.length} 处 notHas/none 引用了全游戏写不出来的经历，` +
        '条件恒真＝没有闸门。要么改名指向真实存在的 flag，要么删掉这一项。'
    ).toEqual([])
  })

  it('只写不读的经历不超过记录（棘轮）', () => {
    expect(
      report.writeOnly.length,
      `新增了只写不读的 flag：${report.writeOnly.length} > ${WRITE_ONLY_CEILING}。` +
        '正确的做法是给这条经历找一个下游读者（回响 / 门槛 / 分支），而不是调这个常量。'
    ).toBeLessThanOrEqual(WRITE_ONLY_CEILING)
  })

  it('口径包含选项级读门（防止统计退化成只看事件级）', () => {
    const choiceLevel = [...report.readBy.values()].some(wheres =>
      wheres.some(w => w.includes('选项级'))
    )
    expect(
      choiceLevel,
      'readBy 里一处选项级引用都没有 —— 要么数据被改坏了，要么口径退化回了"只看事件级"'
    ).toBe(true)
  })
})

describe('回响池自身的接线契约', () => {
  /** flag → 写出它的事件 id 集合 */
  const writers = new Map<string, Set<string>>()
  for (const e of allEvents) {
    for (const c of e.choices ?? []) {
      for (const f of c.effects?.flags?.add ?? []) {
        if (!writers.has(f)) writers.set(f, new Set())
        writers.get(f)!.add(e.id)
      }
    }
  }

  const positiveClauses = (eventId: string): string[] => {
    const e = allEchoEvents.find(x => x.id === eventId)!
    const f = e.conditions?.flags
    return [...(f?.has ?? []), ...(f?.all ?? []), ...(f?.some ?? []), ...(f?.any ?? [])]
  }

  it('每条回响都必须以"玩家有过某段经历"开门', () => {
    const naked = allEchoEvents.filter(e => positiveClauses(e.id).length === 0).map(e => e.id)
    expect(naked, '回响事件没有 flag 前置条件，那它就是一普通事件，不属于这一池').toEqual([])
  })

  it('开门经历必须由**别的**事件写出（不许自锁）', () => {
    const selfSealed: string[] = []
    for (const e of allEchoEvents) {
      for (const f of positiveClauses(e.id)) {
        const w = writers.get(f)
        if (!w) {
          selfSealed.push(`${e.id}：开门经历「${f}」全游戏没人写得出来`)
        } else if ([...w].every(id => id === e.id)) {
          selfSealed.push(`${e.id}：开门经历「${f}」只有它自己写，这条回响永远等不到开门`)
        }
      }
    }
    expect(selfSealed).toEqual([])
  })

  it('回响池的产出不能全是死条子（至少有几条被下游接住）', () => {
    const read = new Set(report.readBy.keys())
    const produced = new Set<string>()
    for (const e of allEchoEvents) {
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) {
          // `echo_*_done` 是这一池自己的一次性开关，不算"产出"
          if (!f.endsWith('_done')) produced.add(f)
        }
      }
    }
    const readBack = [...produced].filter(f => read.has(f))
    expect(
      readBack.length,
      `回响池产出 ${produced.size} 条经历，被下游读到的只有 ${readBack.length} 条`
    ).toBeGreaterThanOrEqual(5)
  })

  /**
   * 第十七轮的规矩：第二波（aftermath）**只读不造词**。
   *
   * 第十五轮记下过一次教训 —— 回响池一边接住旧经历，一边又攒出一批新的白存，
   * 净效果是"只写不读"反而变多。第二波要是也这么写，棘轮就只是往前挪了一格而已。
   * 所以这一池除了自己的一次性开关 `echo_*_done`，只许写**别处早已写得出**的经历。
   */
  it('第二波回响不许造新词', () => {
    const aftermathIds = new Set(aftermathEchoEvents.map(e => e.id))
    const writtenElsewhere = new Map<string, Set<string>>()
    for (const e of allEvents) {
      if (aftermathIds.has(e.id)) continue
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) {
          if (!writtenElsewhere.has(f)) writtenElsewhere.set(f, new Set())
          writtenElsewhere.get(f)!.add(e.id)
        }
      }
    }
    const coined: string[] = []
    for (const e of aftermathEchoEvents) {
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) {
          if (f.endsWith('_done')) continue
          if (!writtenElsewhere.has(f)) coined.push(`${e.id}/${c.id}：「${f}」只有这一池写得出来`)
        }
      }
    }
    expect(coined, '第二波回响是读者，不是作者 —— 新词得由别的事件先写出来').toEqual([])
  })

  it('第二波回响确实存在，且读到的是第一波的产出', () => {
    expect(aftermathEchoEvents.length).toBeGreaterThanOrEqual(5)
    const firstWaveOutput = new Set<string>()
    const aftermathIds = new Set(aftermathEchoEvents.map(e => e.id))
    for (const e of allEchoEvents) {
      if (aftermathIds.has(e.id)) continue
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) {
          if (!f.endsWith('_done')) firstWaveOutput.add(f)
        }
      }
    }
    const reads = aftermathEchoEvents.flatMap(e => positiveClauses(e.id))
    const chained = reads.filter(f => firstWaveOutput.has(f))
    expect(
      chained.length,
      `第二波开门用的 ${reads.length} 条经历里，只有 ${chained.length} 条接的是第一波产出`
    ).toBeGreaterThanOrEqual(8)
  })
})
