import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'
import { eventShape, scanEventShape } from '../../scripts/audit-event-shape'

/**
 * 事件数据「静默失效」看门狗。
 *
 * 为什么需要它：这个仓库的数据文件曾经整片带着 `@ts-nocheck`（第八轮已全部摘掉），
 * 写错一个键名 tsc 一声不响，引擎只是在运行时什么都不做。第六轮之后我手工跑
 * `scripts/audit-event-shape.ts` 才抓到 5 个永不触发的事件和 9 处被丢弃的 flag 授予
 * （见 docs/KNOWN_ISSUES.md）。手工跑过一次就等于没跑过 —— 所以把结论钉成测试，CI 里跑。
 *
 * 四类必须恒为 0：
 *   DEAD  条件里的属性名不存在 → 恒为 0 / 恒 false，或事件没有 type 进不了选择器任何一层（死内容）
 *   NOOP  条件里的状态名不存在 → 静默跳过，事件比设计更早、更频繁地触发
 *   DROP  效果里的名字映射不上，或数值被偷塞进区间对象 → 玩家看不到任何变化
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

  it('未知键为 0 处（第七轮的 11 处 result.echo_2 空串已全部删除）', () => {
    const structural = eventShape.findings.filter(f => f.kind === '结构')
    expect(
      structural,
      `出现新的未知键：\n${structural.map(f => `${f.where} → ${f.detail}`).join('\n')}`
    ).toEqual([])
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
 * 盲区本身也要有人盯着。
 *
 * 上一轮我以为自己把 `@ts-nocheck` 清零了，用的命令是 `grep -rl '^// @ts-nocheck' src`。
 * 结果 51 个文件是 UTF-8 **带 BOM** 写成的：BOM 占了第一行的前三个字节，`^` 就匹配不上了。
 * 真实数字是 39 个文件仍然一声不响地关掉类型检查 —— 包括 15 个没有 `type`、
 * 因此在选择器的五层 filter 里永远排不上的历史事件（煤山殉国、崇祯帝临朝都在里面）。
 * 所以这两条断言不是洁癖，是把"我以为查过了"这件事本身变成机器能查的东西。
 */
describe('类型检查盲区不得重新出现', () => {
  const tsFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(d => {
      const p = join(dir, d.name)
      if (d.isDirectory()) return d.name === 'node_modules' ? [] : tsFiles(p)
      return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : []
    })

  const srcFiles = tsFiles(join(__dirname, '../../src'))

  it('src 里没有文件用 @ts-nocheck 关掉类型检查（注释里提到它不算）', () => {
    const offenders = srcFiles.filter(f => /^\uFEFF?\/\/\s*@ts-nocheck/.test(readFileSync(f, 'utf8')))
    expect(offenders.map(f => relative(join(__dirname, '../..'), f)), `这些文件又关掉了类型检查：\n${offenders.join('\n')}`).toEqual([])
  })

  it('src 里没有文件带 BOM（BOM 会让 ^ 锚定的体检命令静默漏检）', () => {
    const offenders = srcFiles.filter(f => {
      const b = readFileSync(f)
      return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf
    })
    expect(offenders.map(f => relative(join(__dirname, '../..'), f)), `这些文件以 BOM 开头：\n${offenders.join('\n')}`).toEqual([])
  })

  it('体检脚本覆盖到的池子里，没有事件因为缺 type 而选不中', () => {
    const dead = eventShape.findings.filter(f => f.kind === 'DEAD' && f.detail.includes('type'))
    expect(dead.map(f => f.where), `这些事件进不了任何一层选择器：\n${dead.map(f => f.where).join('\n')}`).toEqual([])
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
      // 故意不写 type：选择器按 type 分五层 filter，没有 type 的事件哪一层都进不去
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
          showConditions: {
            // 选项级条件同样是盲区：道德值是隐藏属性，写在 attributes 里取不到真值
            attributes: { 道德值: { min: 70 } },
            // 区间对象只读 min/max，塞进去的 财帛: -15 会静默丢失
            gameState: { 圣眷: { min: 20, 民望: 10 } }
          },
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

  it('DEAD：不存在的属性（带 min）、不存在的隐藏属性、缺 type', () => {
    expect(kinds().DEAD).toBeGreaterThanOrEqual(4)
  })

  it('DEAD 里能看见"没有 type"这一类死内容', () => {
    const found = scanEventShape(broken)
    expect(found.some(f => f.detail.includes('事件没有 type'))).toBe(true)
    // 隐藏属性被写进 attributes，同样是 DEAD：门永远过不去
    expect(found.some(f => f.detail.includes('showConditions.attributes.道德值'))).toBe(true)
  })

  it('DROP：映射不到的效果键、非数字效果、引擎不读的 effects 键、区间对象里偷塞的数值', () => {
    expect(kinds().DROP).toBeGreaterThanOrEqual(6)
  })

  it('DROP 里能看见把花费塞进区间对象的写法', () => {
    const found = scanEventShape(broken)
    expect(
      found.some(f => f.kind === 'DROP' && f.detail.includes('showConditions.gameState.圣眷') && f.detail.includes('民望'))
    ).toBe(true)
  })

  it('NOOP：不存在的状态键、不存在的属性（只带 max）、越界 random、不认识的 flags 键', () => {
    expect(kinds().NOOP).toBeGreaterThanOrEqual(4)
  })

  it('LINK：三处指向不存在事件 id 的引用', () => {
    expect(kinds().LINK).toBe(3)
  })

  it('一份干净的最小事件，什么都不会报', () => {
    const ok = [
      {
        id: 'ok',
        title: '正常事件',
        type: 'historical',
        conditions: { attributes: { 理政: { min: 40 } }, gameState: { 圣眷: { min: 20 } } },
        choices: [
          { id: 'c1', text: '选', effects: { attributes: { 理政: 3 }, gameState: { 圣眷: 2 } },
            result: { title: 't', tags: ['x'], echo: 'e' } }
        ]
      }
    ]
    expect(scanEventShape(ok)).toEqual([])
  })

  it('结局池不参与 type 分层，缺 type 不算死内容', () => {
    const ending = [{ id: 'ending_x', title: '某种结局', choices: [] }]
    expect(scanEventShape(ending, undefined, () => 'ending')).toEqual([])
  })
})
