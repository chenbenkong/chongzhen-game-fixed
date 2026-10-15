import { describe, expect, it } from 'vitest'
import { eventShape, scanEventShape } from '../../scripts/audit-event-shape'

/**
 * 事件数据「静默失效」看门狗。
 *
 * 为什么需要它：src 里 70 个数据文件带 `@ts-nocheck`，写错一个键名 tsc 一声不响，
 * 引擎只是在运行时什么都不做。第六轮之后我手工跑 `scripts/audit-event-shape.ts`
 * 才抓到 5 个永不触发的事件和 9 处被丢弃的 flag 授予（见 docs/KNOWN_ISSUES.md）。
 * 手工跑过一次就等于没跑过 —— 所以把结论钉成测试，CI 里跑。
 *
 * 四类必须恒为 0：
 *   DEAD  条件里的属性名不存在 → 恒为 0 / 恒 false，事件在任何存档里都选不中（死内容）
 *   NOOP  条件里的状态名不存在 → 静默跳过，事件比设计更早、更频繁地触发
 *   DROP  效果里的名字映射不上 → 玩家看不到任何变化，垃圾字段却跟存档一路复制
 *   LINK  nextEvents / preludeEventId 指向不存在的事件 id
 */

const severityKinds = ['DEAD', 'NOOP', 'DROP', 'LINK'] as const

const render = (kind: string) =>
  eventShape.findings
    .filter(f => f.kind === kind)
    .map(f => `${f.where} → ${f.detail}`)
    .join('\n')

describe('事件数据结构体检（@ts-nocheck 盲区）', () => {
  it('体检覆盖到的事件数量不为 0（防止 import 退化成空数组）', () => {
    expect(eventShape.total).toBeGreaterThanOrEqual(400)
  })

  it.each(severityKinds)('%s 类静默失效为 0 处', kind => {
    expect(render(kind), `发现 ${kind} 问题：\n${render(kind)}`).toBe('')
  })

  it('未知键只剩已知的 result.echo_2 空串历史遗留', () => {
    const structural = eventShape.findings.filter(f => f.kind === '结构')
    expect(
      structural.every(f => f.detail.includes('echo_2')),
      `出现新的未知键：\n${structural.map(f => `${f.where} → ${f.detail}`).join('\n')}`
    ).toBe(true)
    expect(structural.length).toBeLessThanOrEqual(11)
  })

  it('五方态度不会被当成属性写进 conditions.attributes', () => {
    // 圣眷/清议/民望等是 gameState 字段。放在 attributes 里取值恒为 0，
    // 事件就再也不可能触发 —— 第六轮就是这么弄死 3 个纵欲线事件的。
    for (const key of ['圣眷', '清议', '民望', '士绅', '中官', '国势', '帝心', '派系立场', '政绩']) {
      expect(
        eventShape.findings.some(f => f.detail.includes(`conditions.attributes.${key} `)),
        `conditions.attributes.${key} 又出现了`
      ).toBe(false)
    }
  })
})

/**
 * 检查器自检。
 *
 * 上面那组断言只能证明"现在的数据是干净的"，证明不了"这个检查器抓得住脏数据"——
 * 而这两者恰恰是上一轮踩过的坑：三个体检脚本因为一个 import 早就名存实亡，
 * `for (const e of undefined)` 抛异常，但没有任何东西盯着它们。
 * 所以用人造的坏事件把每一类失效都过一遍。
 */
describe('scanEventShape 自身能抓住四类失效', () => {
  const broken = [
    {
      id: 'broken_dead',
      title: '四类都占了的坏事件',
      conditions: {
        attributes: { 政绩: { min: 50 }, 风骨: { max: 30 } },
        hidden: { 健康: { min: 1 } },
        gameState: { 风评: { min: 10 } },
        flags: { require: ['不该存在的键'] },
        random: 250
      },
      choices: [
        {
          id: 'c1',
          text: '选它',
          effects: {
            attributes: { 名德: 5, 文韬: '五' },
            hidden: { 城府: 3 },
            gameState: { 声望: 5 },
            meritBonus: 5,
            nextEvents: ['这个 id 不存在']
          },
          result: { title: 'x', echo: 'y', echo_2: '' }
        }
      ],
      nextEvents: ['那个 id 也不存在'],
      endingConfig: { preludeEventId: '还不存在' }
    }
  ]

  const kinds = () => {
    const found = scanEventShape(broken)
    return Object.fromEntries(
      ['DEAD', 'NOOP', 'DROP', 'LINK', '结构'].map(k => [k, found.filter(f => f.kind === k).length])
    )
  }

  it('DEAD：不存在的属性（带 min）与不存在的隐藏属性', () => {
    expect(kinds().DEAD).toBeGreaterThanOrEqual(2)
  })

  it('NOOP：不存在的状态键、不存在的属性（只带 max）、越界 random、不认识的 flags 键', () => {
    expect(kinds().NOOP).toBeGreaterThanOrEqual(4)
  })

  it('DROP：映射不到的效果键、非数字效果、引擎不读的 effects 键', () => {
    expect(kinds().DROP).toBeGreaterThanOrEqual(4)
  })

  it('LINK：三处指向不存在事件 id 的引用', () => {
    expect(kinds().LINK).toBe(3)
  })

  it('一份干净的最小事件，什么都不会报', () => {
    const ok = [
      {
        id: 'ok',
        title: '正常事件',
        conditions: { attributes: { 理政: { min: 40 } }, gameState: { 圣眷: { min: 20 } } },
        choices: [
          { id: 'c1', text: '选', effects: { attributes: { 理政: 3 }, gameState: { 圣眷: 2 } },
            result: { title: 't', tags: ['x'], echo: 'e' } }
        ]
      }
    ]
    expect(scanEventShape(ok)).toEqual([])
  })
})
