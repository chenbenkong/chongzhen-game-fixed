import { describe, expect, it } from 'vitest'
import { buildVocab, scanValueDomains, valueDomains } from '../../scripts/audit-value-domains'
import { origins } from '../../src/data/origins'
import type { ValueVocab } from '../../scripts/audit-value-domains'

/**
 * 事件数据「自由字符串值域」看门狗。
 *
 * 第八轮把 `@ts-nocheck` 清零、把 AttributeKey/StateKey/HiddenKey 收紧之后，
 * **键名**这一层已经由 tsc 兜住了。但 conditions.origin / conditions.rank / storyline /
 * linksToEndingId 这些字段声明就是 `string`，tsc 只保证它是个字符串：
 * 出身写成「晋绅」（正字「缙绅」）编译通过，运行时 `allowed.includes(character.origin)` 恒 false，
 * 事件在任何存档里都选不中 —— 和第七轮那批死事件同一失效方向，只是错的位置挪到了值。
 * `scripts/audit-value-domains.ts` 拿真实词表（origins / RANKS / STORYLINES / 结局池 / 开局年）
 * 对账，这个文件把它的结论钉成测试，并且照第七轮的教训自检：检查器自己也得有人查。
 */

const kinds = ['DEAD', 'NOOP', 'LINK'] as const

const render = (kind: string) =>
  valueDomains.findings
    .filter(f => f.kind === kind)
    .map(f => `${f.where} → ${f.detail}`)
    .join('\n')

describe('真实数据的值域体检', () => {
  it('覆盖到的事件数量与词表规模都不为 0（import 退化成空集合时，体检会"全绿"得毫无意义）', () => {
    expect(valueDomains.total).toBeGreaterThanOrEqual(400)
    const v = valueDomains.vocab
    expect(v.origins.size).toBeGreaterThanOrEqual(4)
    expect(v.ranks.size).toBeGreaterThanOrEqual(18)
    expect(v.storylines.size).toBeGreaterThanOrEqual(15)
    expect(v.endingsById.size).toBeGreaterThanOrEqual(43)
    expect(v.startYear).toBe(1628)
  })

  it.each(kinds)('%s 类静默失效为 0 处', kind => {
    expect(render(kind), `发现 ${kind} 问题：\n${render(kind)}`).toBe('')
  })

  it('5 对 prelude↔ending 是双向配齐的，且每对都带 isPreEnding', () => {
    // 引擎强制优先播放读的是 isPreEnding；两个 id 字段本身运行时没人读，
    // 所以"配对完整"这件事只有在这里查才有人管。
    const withLink = [...valueDomains.vocab.eventsById.values()].filter(e => e.linksToEndingId)
    expect(withLink).toHaveLength(5)
    for (const e of withLink) expect(e.isPreEnding, `${e.id} 缺 isPreEnding`).toBe(true)

    const withPrelude = [...valueDomains.vocab.endingsById.values()].filter(e => e.endingConfig?.preludeEventId)
    expect(withPrelude).toHaveLength(5)
    for (const ending of withPrelude) {
      const prelude = valueDomains.vocab.eventsById.get(ending.endingConfig.preludeEventId)
      expect(prelude, `${ending.id} 的前奏查不到`).toBeTruthy()
      expect(prelude.linksToEndingId, `${ending.id} ↔ ${prelude.id} 只写了单向`).toBe(ending.id)
    }
  })

  it('第十轮逮到的两处撞号已改名，被压住的那个事件回到池子里', () => {
    // 撞号时引擎按 id 去重（useGameEngine 的 findIndex 去重 + eventConditions 的 seen），
    // 「孙传庭殉国」「新年朝会」正是被压住的那一个。
    const byId = valueDomains.vocab.eventsById
    expect(byId.get('historical_014')?.title, 'historical_014 现在只该是洪承畴降清').toBe('洪承畴降清')
    expect(byId.get('historical_1643_sunchuanting')?.title).toBe('孙传庭殉国')
    expect(byId.get('transition_163')?.title).toBe('松锦战报与辽东密议')
    expect(byId.get('transition_1642_newyear')?.title).toBe('新年朝会')
    // 同名不同 id 的事件本来就该有（每年一场新年朝会），那是内容设计，不是撞号
    expect([...byId.values()].filter(e => e.title === '新年朝会').length).toBeGreaterThan(1)
  })
})

/**
 * 自检：人造坏事件。
 *
 * 上面只能证明"现在的数据干净"，证明不了"这些字符串真的会被查"。
 * 词表一改（比如以后 RANKS 加一级、origins 换个键名），检查逻辑可能悄悄失效，
 * 而报告依旧是一片 0 —— 正是上一轮三个崩溃脚本隐身半年的形态。
 */
describe('scanValueDomains 自身能抓住每一类值域错误', () => {
  const vocab = buildVocab(
    [
      { id: 'prelude_ok', title: '合格前奏', linksToEndingId: 'ending_a', isPreEnding: true, conditions: {}, choices: [] },
      { id: 'prelude_no_flag', title: '忘了标 isPreEnding', linksToEndingId: 'ending_a', conditions: {}, choices: [] },
      { id: 'prelude_orphan', title: '谁也不指它', conditions: {}, choices: [] }
    ],
    [
      { id: 'ending_a', title: '结局 A', endingConfig: { preludeEventId: 'prelude_ok' }, conditions: {}, choices: [] },
      // 上面那个结局把 preludeEventId 指给一个不存在的 id
      { id: 'ending_b', title: '结局 B', endingConfig: { preludeEventId: 'prelude_不存在' }, conditions: {}, choices: [] }
    ],
    1628
  )

  const broken: any[] = [
    {
      id: 'broken_values',
      title: '值域全错的坏事件',
      type: 'historical',
      storyline: '不存在的剧情线',
      conditions: {
        origin: '晋绅',
        rank: '正七品·知县（错）',
        year: { min: 1640, max: 1630 },
        month: { min: 13 },
        turn: { min: 30, max: 20 }
      },
      choices: [
        {
          id: 'c1',
          text: '选它',
          storyline: '这条线也不存在',
          showConditions: { origin: ['寒门', '没落世家', '写错的出身'] }
        }
      ]
    },
    {
      id: 'broken_time',
      title: '时间门写在开局年之前',
      type: 'historical',
      conditions: { year: { min: 28, max: 1600 }, month: { max: 0 } },
      choices: []
    },
    {
      id: 'broken_links',
      title: '引用悬空与单向配对',
      type: 'transition',
      linksToEndingId: 'ending_不存在',
      conditions: {},
      choices: []
    },
    { id: 'prelude_no_flag', title: '忘了标 isPreEnding', linksToEndingId: 'ending_a', conditions: {}, choices: [] },
    { id: 'ending_b', title: '结局 B', endingConfig: { preludeEventId: 'prelude_不存在' }, conditions: {}, choices: [] },
    // prelude_orphan 在词表里 linksToEndingId 为空，被 ending_a 当作前奏指认 → 单向
    { id: 'ending_a2', title: '回指错人', endingConfig: { preludeEventId: 'prelude_orphan' }, conditions: {}, choices: [] }
  ]

  const found = () => scanValueDomains(broken, vocab, () => 'pool')
  const countOf = (kind: string) => found().filter(f => f.kind === kind).length
  const has = (kind: string, needle: string) =>
    found().some(f => f.kind === kind && f.detail.includes(needle))

  it('DEAD：写错的出身与官阶，恒 false 的死门', () => {
    expect(has('DEAD', "conditions.origin='晋绅'")).toBe(true)
    expect(has('DEAD', "conditions.rank='正七品·知县（错）'")).toBe(true)
    // 数组形式里那一项也要单独报出来，不能因为"有一项是对的"就放过
    expect(has('DEAD', "写错的出身")).toBe(true)
    // 正确的出身不该被牵连
    expect(found().some(f => f.detail.includes("'寒门'"))).toBe(false)
  })

  it('DEAD：区间倒置、月份越界、年份窗口早于开局', () => {
    expect(has('DEAD', 'conditions.year 区间倒置')).toBe(true)
    expect(has('DEAD', 'conditions.turn 区间倒置')).toBe(true)
    expect(has('DEAD', 'conditions.month.min=13')).toBe(true)
    expect(has('DEAD', 'conditions.month.max=0')).toBe(true)
    expect(has('DEAD', 'conditions.year.max=1600')).toBe(true)
  })

  it('NOOP：剧情线拼错、边界宽到等于没写、prelude 缺 isPreEnding', () => {
    expect(has('NOOP', "storyline='不存在的剧情线'")).toBe(true)
    expect(has('NOOP', "choice.storyline='这条线也不存在'")).toBe(true)
    expect(has('NOOP', 'conditions.year.min=28')).toBe(true)
    expect(has('NOOP', '却没有 isPreEnding')).toBe(true)
  })

  it('LINK：悬空的 linksToEndingId / preludeEventId，以及只写单向的配对', () => {
    expect(countOf('LINK')).toBeGreaterThanOrEqual(3)
    expect(has('LINK', "linksToEndingId='ending_不存在'")).toBe(true)
    expect(has('LINK', "preludeEventId='prelude_不存在'")).toBe(true)
    expect(has('LINK', '配对只写了单向')).toBe(true)
  })

  it('LINK：数据里的站内资源路径必须真的存在（public/ 下查不到就报）', () => {
    const stub: ValueVocab = { ...vocab, assetExists: (p: string) => p === '/scenes/real.png' }
    const ghost: any[] = [{
      id: 'with_asset', title: '带插图的事件', type: 'historical', conditions: {}, choices: [],
      narrative: { background: '/scenes/ghost.png', situation: 's', speaker: { name: '老仆', title: '某府旧人' } }
    }]
    const found = scanValueDomains(ghost, stub, () => 'pool').filter(f => f.kind === 'LINK')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('narrative.background')

    const real: any[] = [{ ...ghost[0], narrative: { ...ghost[0].narrative, background: '/scenes/real.png' } }]
    expect(scanValueDomains(real, stub, () => 'pool')).toEqual([])
  })

  it('DEAD：两个不同事件共用一个 id —— 撞号者只剩一个播得出来', () => {
    const collide: any[] = [
      { id: 'same_id', title: '甲事件', type: 'historical', conditions: {}, choices: [{ id: 'a', text: '甲', effects: {} }] },
      { id: 'same_id', title: '乙事件', type: 'historical', conditions: {}, choices: [{ id: 'b', text: '乙', effects: {} }] }
    ]
    const found = scanValueDomains(collide, vocab, () => 'pool').filter(f => f.kind === 'DEAD')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain("id='same_id'")
    expect(found[0].detail).toContain('甲事件')
    expect(found[0].detail).toContain('乙事件')
  })

  it('同一个事件被两个池子各引一次是**正常**的，不能报成撞号（情感线就同时挂在 initialEvents 与 emotionEvents）', () => {
    const shared = { id: 'shared_once', title: '两边都引它', type: 'emotion', conditions: {}, choices: [] }
    expect(scanValueDomains([shared, shared, { ...shared }], vocab, () => 'pool')).toEqual([])
  })

  it('词表里的合法值什么都不会报（防止检查器把正常数据也报成一堆，逼后人加豁免）', () => {
    const ok: any[] = [{
      id: 'ok', title: '正常事件', type: 'historical', storyline: 'martyr',
      conditions: {
        origin: ['缙绅', '寒门'], rank: '正七品·知县',
        year: { min: 1628, max: 1644 }, month: { min: 1, max: 12 }, turn: { min: 0, max: 200 }
      },
      choices: [{ id: 'c1', text: '选', storyline: 'martyr', effects: {} }]
    }]
    expect(scanValueDomains(ok, vocab, () => 'pool')).toEqual([])
  })

  it('查的确实是引擎那套词表：官阶名与 RANKS 同源，出身名与 origins 同源', () => {
    // 不写死名字表：第六十五轮加了两副出身，写死的四元组会把「同源」检查退化成
    // 「和去年那份名单一致」，新出身在词表里漏了也照样绿。
    expect([...vocab.origins].sort()).toEqual(Object.keys(origins).sort())
    expect(vocab.ranks.has('正七品·知县')).toBe(true)
    expect(vocab.ranks.has('从九品·司狱')).toBe(true)
    // 「正七品」这种半截写法是拼错的主要形态，词表里不该有它
    expect(vocab.ranks.has('正七品')).toBe(false)
  })
})
