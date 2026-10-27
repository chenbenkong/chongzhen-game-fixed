import { describe, it, expect } from 'vitest'
import { ALL_ORIGINS } from '../../src/types/game'
import { origins } from '../../src/data/origins'
import { initialEvents, allGrayChoiceEvents } from '../../src/data/events'
import type { GameEvent } from '../../src/types/event'
import type { OriginType } from '../../src/types/game'

/**
 * 出身的"骨架"体检（第六十五轮新增）。
 *
 * 为什么光有 `audit:lockout` 不够：那一支只能证明"每个在场出身至少有一个选项点得动"，
 * 证明不了**这个出身还是不是它自己**。四个老出身是围着内容长出来的，
 * 新出身是围着数字长出来的 —— 如果只把名字塞进 `origins` 表、把专属事件留空，
 * 全套体检照样是绿的：选项点得动（用的是别人的卡）、局也跑得完（用的是别人的路），
 * 只有玩家会发现"胥吏"和"缙绅"玩起来一模一样。
 *
 * 所以这份钉子盯四件事：
 *   1. 表与 `ALL_ORIGINS` 一一对应（漏登记 / 多登记都在这一行红）；
 *   2. 每副出身的开局数据真的填满，且**踩不到归零判死线的起点上**
 *      （第十四轮那条教训：旧数据把某条死线的起点放在零旁边，一半的局第 15 个月就收尾）；
 *   3. 每副出身都有**至少三条只有它看得见的支线**，且其中一条在开局两年内 ——
 *      否则"出身不同"只体现在数字上，不体现在玩家读到的东西上；
 *   4. 事件级的"给所有人"的门不许再手抄四个名字。
 *      这类门没有类型约束（`origin?: string | string[]`），少抄一个名字不报错、
 *      不变红，只让新出身在那批天下大事前变成哑巴。第六十五轮实测 19 处。
 */

const ATTR = ['财帛', '文韬', '理政', '武略', '体质'] as const
const HIDDEN = ['道德值', '欲望值', '野心值'] as const
const STATE = ['圣眷', '中官', '清议', '士绅', '民望'] as const

const ALL_EVENTS: GameEvent[] = [...initialEvents, ...allGrayChoiceEvents]

const exclusiveOf = (origin: OriginType) =>
  ALL_EVENTS.filter(e => {
    const gate = e.conditions?.origin
    if (!gate) return false
    return Array.isArray(gate) ? gate.length === 1 && gate[0] === origin : gate === origin
  })

describe('出身骨架：表、数值、专属内容与"给所有人"的门', () => {
  it('出身表与 ALL_ORIGINS 一一对应（顺序即选人界面的顺序）', () => {
    expect(Object.keys(origins)).toEqual(ALL_ORIGINS)
    for (const o of ALL_ORIGINS) expect(origins[o].type).toBe(o)
  })

  it.each(ALL_ORIGINS)('「%s」的开局数据是填满的', origin => {
    const d = origins[origin]
    for (const key of ATTR) expect(Number.isFinite(d.initialAttributes[key]), `属性 ${key}`).toBe(true)
    for (const key of HIDDEN) expect(Number.isFinite(d.initialHidden[key]), `隐藏 ${key}`).toBe(true)
    for (const key of STATE) expect(Number.isFinite(d.initialGameState?.[key]), `态度 ${key}`).toBe(true)
    expect(d.initialRank, 'initialRank').toBeTruthy()
    expect(d.initialDegree, 'initialDegree').toBeTruthy()
    expect(d.background.length, 'background 太短：玩家在选人卡上读不到这是谁').toBeGreaterThanOrEqual(40)
    expect(d.tags.length, 'tags 少于两条').toBeGreaterThanOrEqual(2)
    expect(d.features.length, 'features 少于三条').toBeGreaterThanOrEqual(3)
    expect(d.playStyle.length, 'playStyle').toBeGreaterThanOrEqual(8)
    expect(Object.keys(d.examBonus).length, 'examBonus').toBeGreaterThanOrEqual(1)
  })

  it.each(ALL_ORIGINS)('「%s」踩不到归零判死线的起点上', origin => {
    const d = origins[origin]
    // 八条归零判死线里，出身表能决定的六条：财帛 / 体质 / 圣眷 / 中官 / 清议 / 士绅 / 民望。
    // 态度地板取 20、体质取 40：这是全表现存的最低起点（缙绅的 清议/民望 都是 20），
    // 离归零判死线仍有二十点缓冲 —— 再往下就是"开局就贴着死线"，不该再放新的进来。
    expect(d.initialAttributes.财帛, '财帛').toBeGreaterThanOrEqual(25)
    expect(d.initialAttributes.体质, '体质').toBeGreaterThanOrEqual(40)
    for (const key of STATE) expect(d.initialGameState![key], key).toBeGreaterThanOrEqual(20)
    expect(d.initialHidden.道德值, '道德值').toBeGreaterThanOrEqual(20)
  })

  it('八个出身在能力面板上互不相同（任意两副的属性 L1 距离 ≥ 30）', () => {
    const vec = (o: OriginType) => ATTR.map(k => origins[o].initialAttributes[k])
    for (let i = 0; i < ALL_ORIGINS.length; i++) {
      for (let j = i + 1; j < ALL_ORIGINS.length; j++) {
        const a = vec(ALL_ORIGINS[i])
        const b = vec(ALL_ORIGINS[j])
        const l1 = a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0)
        expect(l1, `${ALL_ORIGINS[i]} 与 ${ALL_ORIGINS[j]} 的属性太像`).toBeGreaterThanOrEqual(30)
      }
    }
    // 每副出身都得有一项是"它的招牌"（≥60），否则它在故事里没有可倚仗的东西。
    for (const o of ALL_ORIGINS) {
      expect(Math.max(...vec(o)), `${o} 没有一项 ≥60`).toBeGreaterThanOrEqual(60)
    }
  })

  it.each(ALL_ORIGINS)('「%s」有至少三条专属支线，且第一条在开局两年内开口', origin => {
    const mine = exclusiveOf(origin)
    expect(mine.length, `${origin} 的专属事件`).toBeGreaterThanOrEqual(3)
    const early = mine.filter(e => (e.conditions?.year?.min ?? 0) <= 1629)
    expect(early.length, `${origin} 在 1628–1629 年没有专属支线：前两年只能读别人的故事`).toBeGreaterThanOrEqual(1)
    for (const e of mine) {
      expect(e.choices.length, `${e.id} 的选项数`).toBeGreaterThanOrEqual(3)
      expect(e.choices.length, `${e.id} 的选项数`).toBeLessThanOrEqual(4)
    }
  })

  it('专属支线的属性"上界"门必须留出成长空间，否则会随玩家长进而关死', () => {
    // 第六十五轮实测逮到的一次：胥吏第三支《举人坐堂》写了 `文韬 ≤ 55`，
    // 本意是"功名不硬、被人轻视"，但文韬只会随事件往上涨 ——
    // warden 12 局全部活到 1632 年以后，这条支线 **0/12 一次都没播出来**
    // （同批六副出身的其余 17 条专属支线都是 12/12）。
    // 上界门在这里是反的：玩家越有本事，越没人轻贱他，这层意思该由正文写，
    // 不该让门槛把整条支线关死。下界门（理政≥55 这类）没这个问题，允许保留。
    //
    // 不是所有上界门都错：寒门的 `文韬 ≤ 80` 起点 65，只差 15 点，
    // 但它 1628 年就开门，通常头两年就播完了（实测 steady 20/20、warden 12/12）。
    // 所以判据不是"离起点多远"，而是**能不能撑到窗口开门**：
    // 窗口每往后一年，就要多留 10 点（胥吏实测文韬两年涨过 17 点，约 9 点/年）。
    const GROWTH_PER_YEAR = 10
    const bad: string[] = []
    for (const e of ALL_EVENTS) {
      const gate = e.conditions?.origin
      if (!gate || Array.isArray(gate)) continue
      const start = origins[gate as OriginType].initialAttributes
      const opens = e.conditions?.year?.min ?? 1628
      const need = GROWTH_PER_YEAR * Math.max(0, opens - 1628)
      for (const [key, range] of Object.entries(e.conditions?.attributes ?? {})) {
        if (range?.max === undefined) continue
        const headroom = range.max - start[key as keyof typeof start]
        if (headroom < need) {
          bad.push(
            `${e.id} 属性 ${key} ≤ ${range.max}：${gate} 起点 ${start[key as keyof typeof start]}，` +
              `只差 ${headroom} 点，而窗口 ${opens} 年才开（需要 ${need} 点）`
          )
        }
      }
    }
    expect(bad, '专属支线的属性上界撑不到窗口开门，几年后就会把整条支线关死').toEqual([])
  })

  it('事件级"给所有人"的门写 ALL_ORIGINS，不许再手抄四个老出身', () => {
    const legacyFour = ['寒门', '缙绅', '没落世家', '诗文清望']
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every(x => b.includes(x))
    const offenders = ALL_EVENTS.filter(e => {
      const gate = e.conditions?.origin
      return Array.isArray(gate) && gate.length > 1 && same(gate, legacyFour)
    }).map(e => `${e.id}「${e.title}」`)
    expect(
      offenders,
      '这些事件的门手抄了四个老出身，新出身会在它们面前变成哑巴 —— 改用 ALL_ORIGINS'
    ).toEqual([])
  })

  it('两副新出身的每一段经历都有人读（不许只写不读）', () => {
    // 第六十六轮加「罪臣之后」「军户」时，三拍留下的 24 段经历里有 12 段
    // 全游戏没有一处门槛读 —— 玩家做完那次抉择，世界毫无反应。
    // 补法不是改文案，是各加一条回响事件（`origin_zuichen_004` / `origin_junhu_004`），
    // 让第四拍按第三拍留下的经历分岔。这里钉的是**读**这件事本身：
    // 谁再把手抄的 any 名单删掉一段，那段经历就重新变成白存，这条会红。
    // 判据不看事件 id：从两副出身的专属事件里收集"写出来的 flag"，
    // 再对着全库六个子句找读者 —— 换一种补法（改写别人的门槛）同样能过。
    const NEW_ORIGINS: OriginType[] = ['罪臣之后', '军户']
    const exclusive = (e: GameEvent) => {
      const gate = e.conditions?.origin
      const arr = Array.isArray(gate) ? gate : gate ? [gate] : []
      return arr.length === 1 && NEW_ORIGINS.includes(arr[0] as OriginType)
    }
    const written = new Map<string, string>()
    for (const e of ALL_EVENTS.filter(exclusive)) {
      for (const c of e.choices) {
        for (const f of c.effects?.flags?.add ?? []) written.set(f, `${e.id}/${c.id}`)
      }
    }
    const read = new Set<string>()
    const clauses = ['has', 'all', 'some', 'notHas', 'none', 'any'] as const
    for (const e of ALL_EVENTS) {
      const groups = [
        e.conditions?.flags,
        ...e.choices.map(c => c.showConditions?.flags)
      ]
      for (const g of groups) {
        if (!g) continue
        for (const clause of clauses) for (const f of g[clause] ?? []) read.add(f)
      }
    }
    const orphan = [...written.entries()]
      .filter(([f]) => !read.has(f))
      .map(([f, where]) => `${f}（${where} 写入）`)
    expect(written.size, '两副新出身没有专属事件').toBeGreaterThan(0)
    expect(orphan, '这些经历写出来之后再没人读：给它们一处门槛或一条回响').toEqual([])
  })

  it('事件级的门不许"抄一大半"：长过半数的名单必须就是 ALL_ORIGINS', () => {
    // 第六十六轮实测逮到的第二形态：第六十五轮只把**四元组**换成 ALL_ORIGINS，
    // 而国库里还有八处五元组（阉党清算、袁崇焕之死、登莱兵变、清国建立、
    // 流寇糜烂、科举舞弊），每一处都各漏一个老出身 —— 没落世家或被漏在文事里，
    // 寒门被漏在兵事里。这种门看起来"有取向"，其实只是手抄时少写了一个名字，
    // 玩家读到的是"这件事跟我出身无关"，而不是"我不该看见它"。
    // 判据按形状定：事件级点名超过半数出身，就是"给所有人"的意思，必须写 ALL_ORIGINS。
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every(x => b.includes(x))
    const offenders = ALL_EVENTS.filter(e => {
      const gate = e.conditions?.origin
      return (
        Array.isArray(gate) &&
        gate.length > ALL_ORIGINS.length / 2 &&
        !same(gate, ALL_ORIGINS)
      )
    }).map(e => `${e.id}「${e.title}」：${(e.conditions!.origin as string[]).join('/')}`)
    expect(
      offenders,
      '这些事件点了超过半数出身，却漏掉了其中几个 —— 要么补齐成 ALL_ORIGINS，' +
        '要么缩到半数以下并说明"这件事确实只关某几类人"'
    ).toEqual([])
  })
})
