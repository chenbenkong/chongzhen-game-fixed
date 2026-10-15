import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { scanTagEffects } from '../../scripts/audit-tag-effects'
import { scanAnachronisms } from '../../scripts/audit-anachronism'
import { allGrayChoiceEvents, initialEvents } from '../../src/data/events/index'
import { allEndingEvents } from '../../src/data/events/ending'
import { origins } from '../../src/data/origins'
import { flush, renderGameEngine } from './helpers/gameEngine'
import type { GameEvent } from '../../src/types/event'

/**
 * 第十四轮的两条内容侧体检。它们守的是同一类东西：
 * **写在界面上的话，引擎有没有照着做；写进文本的人，是不是那个时代的人。**
 * 这类缺陷不会崩、不会报错、类型也管不着（tags 是 string[]，想写什么写什么），
 * 玩家只会觉得"我收了三千两怎么反而更穷了"。
 */

const POOL = [...initialEvents, ...allGrayChoiceEvents]

function findEvent(id: string): GameEvent {
  const e = [...POOL, ...allEndingEvents].find(x => x.id === id)
  if (!e) throw new Error(`事件 ${id} 不在了`)
  return e
}

describe('承诺 / 兑现对账（audit:tags）', () => {
  it('全仓选项的徽章承诺都能在 effects 里结算', () => {
    expect(scanTagEffects(POOL).map(f => `${f.kind} ${f.where} ${f.detail}`)).toEqual([])
  })

  it('体检不是空转：把承诺抹掉就必须报出来', () => {
    const planted = structuredClone(findEvent('gray_bribery_001'))
    // 回到修复前的样子：徽章写着财帛+30，effects 里一个财帛键都没有
    planted.choices![0].effects = { attributes: {}, gameState: { 民望: -15 } }
    planted.choices![0].result = { ...planted.choices![0].result!, tags: ['财帛+30', '民望-15'] }

    const findings = scanTagEffects([planted])
    expect(findings.map(f => f.kind)).toEqual(['unfulfilledPromise'])
    expect(findings[0].where).toBe('gray_bribery_001/c1')
  })

  it('方向相反比漏写更恶劣，也必须报出来', () => {
    const planted = structuredClone(findEvent('gray_bribery_001'))
    planted.choices![0].effects = { attributes: { 财帛: -30 } }
    planted.choices![0].result = { ...planted.choices![0].result!, tags: ['财帛+30'] }

    const findings = scanTagEffects([planted])
    expect(findings.map(f => f.kind)).toEqual(['signMismatch'])
  })

  it('九条修过的选项：徽章与 effects 现在同源同值', () => {
    const cases: Array<[string, string, number]> = [
      ['gray_bribery_001', 'c1', 30],
      ['gray_bribery_001', 'c2', 10],
      ['gray_bribery_002', 'c1', -20],
      ['gray_bribery_002', 'c2', -10],
      ['gray_smuggling_001', 'c1', 30],
      ['gray_smuggling_001', 'c2', 60],
      ['gray_smuggling_002', 'c1', 50],
      ['gray_smuggling_002', 'c2', 30],
      ['gray_fortune_001', 'c2', 5]
    ]
    for (const [eventId, choiceId, money] of cases) {
      const choice = findEvent(eventId).choices!.find(c => c.id === choiceId)!
      expect(choice.effects.attributes?.财帛, `${eventId}/${choiceId}`).toBe(money)
      expect(choice.result?.tags, `${eventId}/${choiceId}`).toContain(`财帛${money > 0 ? '+' : ''}${money}`)
    }
  })

  /**
   * 数据改对了还不够。这条走真 `handleChoice`（它只读 effects，从不读 tags）：
   * 只要有人再把 effects 清空，或者把引擎改成读 tags，这里就会红。
   */
  it('真引擎结算「收下重礼」，财帛确实涨了', async () => {
    const hook = renderGameEngine()
    await flush()

    const before = hook.result.current.character.attributes.财帛
    const bribe = findEvent('gray_bribery_001').choices!.find(c => c.id === 'c1')!
    await act(async () => {
      hook.result.current.handleChoice(bribe, { skipResignConfirm: true })
    })
    expect(hook.result.current.character.attributes.财帛).toBeGreaterThan(before)
    hook.unmount()
  })

  it('全仓再没有 % 写法的徽章 —— 那是这批遗留数据的指纹', () => {
    const percent = POOL.flatMap(e => e.choices ?? [])
      .flatMap(c => c.result?.tags ?? [])
      .filter(t => String(t).trim().endsWith('%'))
    expect(percent).toEqual([])
  })
})

describe('违例人名体检（audit:chrono）', () => {
  it('场内文本没有清代人物与年号', () => {
    expect(scanAnachronisms([...POOL, ...allEndingEvents]).map(f => `${f.where} ${f.detail}`)).toEqual([])
  })

  it('「上司献妾」那位巡抚不再是李鸿章，且改名改全了', () => {
    const json = JSON.stringify(findEvent('gray_debauchery_019'))
    expect(json).not.toContain('李鸿章')
    // 说话人、选项文案、回响都要一致 —— 只改一半比不改更糟
    expect(findEvent('gray_debauchery_019').narrative?.speaker?.name).toBe('李朝栋')
    expect(json).toContain('李朝栋')
  })

  /**
   * 字段白名单是刻意的：结局 echo 里"乾隆朝修《明史》""康熙年间于成龙求购"
   * 这类**身后议论是合法的**（实测数据里确有 7 处），所以只查场内字段。
   * 有人把 echo 也拉进检查范围、或者把场内字段漏掉时，这条会先红。
   */
  it('场内塞一个清代年号要报出来，写在 echo 里则不算', () => {
    const inWorld: GameEvent = {
      id: 'probe_anachronism',
      title: '驿馆等候',
      description: '巡抚李鸿章在驿馆等你。',
      conditions: {},
      choices: [],
      type: 'transition'
    }
    expect(scanAnachronisms([inWorld]).map(f => f.where)).toEqual(['probe_anachronism · description'])

    const onlyEcho: GameEvent = {
      ...inWorld,
      description: '你在驿馆等一位巡抚。',
      choices: [{
        id: 'c1',
        text: '接见',
        effects: {},
        result: { title: '身后名', echo: '乾隆朝修《明史》，为你立传。' }
      }]
    }
    expect(scanAnachronisms([onlyEcho])).toEqual([])
  })

  it('四个出身的名字都写在出身表里（体检用的字段白名单不许漂）', () => {
    expect(Object.keys(origins).length).toBeGreaterThanOrEqual(4)
    const originNames = new Set(POOL.flatMap(e => {
      const o = e.conditions?.origin
      return Array.isArray(o) ? o : o ? [o] : []
    }))
    for (const name of Object.keys(origins)) expect(originNames.has(name), name).toBe(true)
  })
})
