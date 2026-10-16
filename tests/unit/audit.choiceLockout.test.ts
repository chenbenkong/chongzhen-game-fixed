import { describe, expect, it } from 'vitest'
import { scanChoiceLockout } from '../../scripts/audit-choice-lockout'
import { allEvents } from '../../scripts/event-pools'
import { checkChoiceRequirement } from '../../src/utils/choiceRequirements'
import { FLAG_GATE_LABELS } from '../../src/data/flagBiography'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * 第十五轮的看门狗：**门槛真的会锁人**之后，锁错方向就是新的失效模式。
 *
 * 改造前，选项级的 `showConditions.flags` 是一行「简化处理，假设所有flag都满足」的桩，
 * `origin` 那道门返回的 `difficulty: 0` 配上 `d12 ≥ 0` 恒成立 —— 两类门都是画出来的，
 * 数据怎么写都不会有人被挡在门外。第十五轮把它们实装（并给 `hasOpenChoice` 兜底）之后，
 * 同一份数据里那些年久失修的抄写错误就第一次真的伤到了玩家：
 *   · 27 处「事件只给甲出身看，选项却只让乙出身选」—— 选项永远不出现；
 *   · 9 处「这个出身在这条事件里一个选项都点不动」—— 整条事件对他永久消失。
 * 两类都是**读代码读不出来**的：它们需要同时看事件级与选项级两套出身名单，
 * 再把分支事件与写 flag 的上游事件对上。所以钉成测试，CI 里跑。
 *
 * 与人造坏事件同批跑：只断言"真实数据 0 处"是不够的，那可能只是检查器自己没电。
 *
 * 第十七轮加了第四类 `RAW_FLAG_ID`：浏览器实测发现被锁的选项下面印着
 * 「须有过其中一段经历：wife_hurt、wife_jealous、pingqi_attempt」——
 * 门槛本身是对的，文案是把 flag 名直接给了玩家。于是判据（`gateLabel`）与
 * 渲染方共用一张表，这里再钉住"这张表不许漏项"。
 */

const base = (over: Partial<GameEvent>): GameEvent =>
  ({
    id: 'synthetic_ev',
    title: '合成事件',
    type: 'historical',
    conditions: {},
    choices: [],
    ...over
  }) as unknown as GameEvent

describe('选项级硬门槛体检（第十五轮实装门槛之后新增）', () => {
  it('真实数据里四类问题均为 0 处', () => {
    const findings = scanChoiceLockout()
    expect(
      findings.map(f => `[${f.kind}] ${f.where} → ${f.detail}`),
      '出现了新的死选项 / 无出路出身 / 出身门互相抵消'
    ).toEqual([])
  })

  it('扫描的确实是全池（防止 import 退化成空数组）', () => {
    expect(allEvents.length).toBeGreaterThanOrEqual(400)
    expect(scanChoiceLockout(allEvents).length).toBe(0)
  })

  it('选项要求一条全池没人写的经历 ⇒ DEAD_OPTION', () => {
    const events = [
      base({
        choices: [
          { id: 'c1', text: 'A', effects: {}, showConditions: { flags: { has: ['从未被写过的经历'] } } },
          { id: 'c2', text: 'B', effects: { flags: { add: ['正常经历'] } } }
        ]
      }) as unknown as GameEvent
    ]
    const kinds = scanChoiceLockout(events).map(f => f.kind)
    expect(kinds).toContain('DEAD_OPTION')
  })

  it('事件只给 A 出身看、选项却只让 B 出身选 ⇒ ORIGIN_CONTRADICTION', () => {
    const events = [
      base({
        conditions: { origin: ['寒门'] },
        choices: [
          { id: 'c1', text: 'A', effects: {}, showConditions: { origin: ['缙绅'] } },
          { id: 'c2', text: 'B', effects: {} }
        ]
      }) as unknown as GameEvent
    ]
    expect(scanChoiceLockout(events).map(f => f.kind)).toContain('ORIGIN_CONTRADICTION')
  })

  it('某个出身一个选项都点不动 ⇒ NO_ORIGIN，且被事件级出身排除在外的出身不算', () => {
    const allGated = [
      base({
        choices: [
          { id: 'c1', text: 'A', effects: {}, showConditions: { origin: ['寒门'] } },
          { id: 'c2', text: 'B', effects: {}, showConditions: { origin: ['没落世家'] } }
        ]
      }) as unknown as GameEvent,
      // 同一份选项门，但事件本身只给这两个出身看 —— 不该报
      base({
        id: 'synthetic_ev2',
        conditions: { origin: ['寒门', '没落世家'] },
        choices: [
          { id: 'c1', text: 'A', effects: {}, showConditions: { origin: ['寒门'] } },
          { id: 'c2', text: 'B', effects: {}, showConditions: { origin: ['没落世家'] } }
        ]
      }) as unknown as GameEvent
    ]
    const findings = scanChoiceLockout(allGated).filter(f => f.kind === 'NO_ORIGIN')
    expect(findings.map(f => f.where).join('\n')).toContain('synthetic_ev')
    expect(findings.map(f => f.where).join('\n')).not.toContain('synthetic_ev2')
  })

  it('门槛引用没登记的机器 id ⇒ RAW_FLAG_ID；中文名不算', () => {
    const events = [
      base({
        choices: [
          { id: 'c1', text: 'A', effects: {}, showConditions: { flags: { any: ['wife_unknown_flag'] } } },
          { id: 'c2', text: 'B', effects: {}, showConditions: { flags: { has: ['忠臣'] } } },
          { id: 'c3', text: 'C', effects: {}, showConditions: { flags: { notHas: ['某某旧事'] } } }
        ]
      }) as unknown as GameEvent
    ]
    const leaks = scanChoiceLockout(events).filter(f => f.kind === 'RAW_FLAG_ID')
    expect(leaks.map(f => f.detail).join('\n')).toContain('wife_unknown_flag')
    expect(leaks).toHaveLength(1)
  })
})

describe('锁门文案说的是人话（第十七轮浏览器实测逮到的那一类）', () => {
  /** 玩家身上干干净净：所有经历门槛都会把他挡在门外，于是每条理由都要读一遍 */
  const nobody = makeCharacter({ flags: [] })
  const ascii = /[A-Za-z_]{4,}/

  it('全池每一个被锁住的选项，理由里一个 ASCII 字都没有', () => {
    const leaks: string[] = []
    for (const e of allEvents) {
      for (const c of e.choices ?? []) {
        const check = checkChoiceRequirement(c, nobody, makeGameState())
        if (check.available || !check.reason) continue
        if (ascii.test(check.reason)) leaks.push(`${e.id}/${c.id}：${check.reason}`)
      }
    }
    expect(leaks, '这些理由会原样印在灰色选项下面').toEqual([])
  })

  it('被挡在门外时仍然说得出"缺的是哪段前事"', () => {
    const gated = allEvents
      .flatMap((e: GameEvent) => (e.choices ?? []).map((c: EventChoice) => ({ e, c })))
      .filter(x => x.c.showConditions?.flags?.any?.length)
    const sample = gated.find(
      x => (x.c.showConditions?.flags?.any ?? []).includes('wife_hurt')
    )
    expect(sample, '第十七轮的《门内门外》靠这一支分流，样本还在').toBeTruthy()
    const check = checkChoiceRequirement(sample!.c, nobody, makeGameState())
    expect(check.available).toBe(false)
    expect(check.reason).toContain('因纳妾伤了正妻')
    expect(check.reason).not.toContain('wife_hurt')
  })

  it('短语表自己也得是人话，而且指着的经历真有人写得出来', () => {
    const writable = new Set<string>()
    for (const e of allEvents) {
      for (const c of e.choices ?? []) {
        for (const f of c.effects?.flags?.add ?? []) writable.add(f)
      }
    }
    const bad: string[] = []
    for (const [flag, label] of Object.entries(FLAG_GATE_LABELS)) {
      if (ascii.test(label)) bad.push(`${flag}：短语里还有 ASCII ——${label}`)
      if (label.length > 12) bad.push(`${flag}：短语 ${label.length} 字，锁门文案会挤成一段话 ——${label}`)
      if (!writable.has(flag)) bad.push(`${flag}：全池没有选项写得出它，这句短语是白写的`)
    }
    expect(bad).toEqual([])
  })
})
