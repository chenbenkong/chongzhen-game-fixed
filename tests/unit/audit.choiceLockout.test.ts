import { describe, expect, it } from 'vitest'
import { scanChoiceLockout } from '../../scripts/audit-choice-lockout'
import { allEvents } from '../../scripts/event-pools'
import type { GameEvent } from '../../src/types/event'

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
  it('真实数据里三类问题均为 0 处', () => {
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
})
