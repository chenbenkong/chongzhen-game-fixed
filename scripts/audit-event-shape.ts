/**
 * 事件数据结构体检：找出「类型检查因为 @ts-nocheck 而看不见」的静默失效。
 *
 * 为什么要单独写这个：src 里 70 个文件带 `@ts-nocheck`（全部事件数据 + 结局数据），
 * 它们对 tsc 完全透明。写错一个键名不会报错，只会在运行时变成一件**什么都没做**的事。
 * 而引擎对未知键的处理方式并不统一，后果分三类，所以脚本也按三类报：
 *
 *   DEAD  —— conditions.attributes 用了不存在的属性名：取值 `attributes[key] || 0` → 恒为 0，
 *            任何 min > 0 的区间都永不满足 → 这个事件在任何存档里都选不中（死内容）。
 *            conditions.hidden 用了不存在的隐藏属性名：引擎显式 `if (value === undefined) return false`
 *            → 整个事件被一票否决，同样是死内容。
 *   NOOP  —— conditions.gameState 用了不存在的状态名：`value` 是 undefined，
 *            `undefined < min` 与 `undefined > max` 都是 false → 这条条件被静默跳过，
 *            事件**比设计更早、更频繁**地触发（与 DEAD 相反的失效方向）。
 *   DROP  —— effects.attributes / gameState / hidden 用了不存在的名字：
 *            ATTR_MAP/STATE_MAP 未命中就按原名写 → 在 character.attributes 上凭空长出一个
 *            垃圾字段。玩家看不到任何效果，但它会跟着存档一路复制下去。
 *   LINK  —— nextEvents / preludeEventId 指向一个不存在的事件 id：引擎会把队列排到那里，
 *            然后什么也找不到。
 *
 * 扫描逻辑导出为 `scanEventShape()`，`eventShape` 是六个事件池合并去重后的现成结论。
 * tests/unit/eventShape.silentFailures.test.ts 两样都用：拿真实数据断言这四类恒为 0，
 * 再喂一份人造的坏事件断言检查器本身确实抓得住 —— 上一轮发现的三个体检脚本悄悄崩了半年
 * 没人察觉，根因就是"检查器没人检查"。数据文件全是 `@ts-nocheck`，tsc 拦不住，只能靠测试。
 */
import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
import { triggerableEndingEvents } from '../src/data/boundaryEvents'

const ATTR_KEYS = ['财帛', '文韬', '理政', '武略', '体质']
const ATTR_ALIASES = ['文辩', '朝政', '权势', '机敏', '道德']
const HIDDEN_KEYS = ['道德值', '欲望值', '野心值', '机敏值', '忠诚值']
const STATE_KEYS = ['圣眷', '中官', '清议', '士绅', '民望', '国势']
const STATE_TIME = ['currentYear', 'currentMonth', 'turn']
const STATE_ALIASES = ['帝心', '派系立场', '百姓口碑', '商贾', '安全', '军事', '文化', '军心', '国势']

const EVENT_KEYS = ['id', 'title', 'description', 'narrative', 'conditions', 'choices', 'type',
  'endingConfig', 'isPreEnding', 'linksToEndingId', 'storyline', 'nextEvents']
const CHOICE_KEYS = ['id', 'text', 'quote', 'description', 'storyline', 'showConditions', 'effects',
  'resultDescription', 'result', 'failEffects', 'failResultDescription', 'failResult', 'check',
  'staminaCost', 'staminaRequired', 'staminaBonus', 'condition']
const COND_KEYS = ['year', 'month', 'rank', 'origin', 'attributes', 'hidden', 'gameState', 'flags',
  'charactersAlive', 'charactersDead', 'historicalFlags', 'random', 'relationships', 'custom']
const EFFECT_KEYS = ['attributes', 'hidden', 'gameState', 'flags', 'relationships', 'family',
  'nextEvents', 'special', 'meritScore']
const NARRATIVE_KEYS = ['speaker', 'quote', 'background', 'situation']
const RESULT_KEYS = ['title', 'tags', 'echo']

export type Finding = { kind: string; where: string; detail: string }

const extraKeys = (obj: object, allowed: string[]) =>
  Object.keys(obj).filter(k => !allowed.includes(k))

/**
 * 对一批事件做结构体检。
 * `knownIds` 决定 nextEvents / preludeEventId 的悬空判定拿谁当全集，缺省用这批事件自身；
 * `labelOf` 只影响输出里的来源标签，纯粹是为了报错时能定位到是哪个池子。
 */
export function scanEventShape(
  events: any[],
  knownIds?: Set<string>,
  labelOf?: (id: string) => string
): Finding[] {
  const findings: Finding[] = []
  const add = (kind: string, where: string, detail: string) => findings.push({ kind, where, detail })
  const idUniverse = knownIds ?? new Set<string>(events.map(e => e?.id).filter(Boolean))
  const seen = new Map<string, any>()
  for (const e of events) {
    if (!e || !e.id) continue
    if (!seen.has(e.id)) seen.set(e.id, e)
  }

  for (const [, event] of seen) {
    const where = `${labelOf ? labelOf(event.id) : 'pool'} · ${event.id}「${String(event.title || '').slice(0, 16)}」`

    for (const k of extraKeys(event, EVENT_KEYS)) add('结构', where, `事件上有未知键 ${k}`)

    const cond = event.conditions || {}
    for (const k of extraKeys(cond, COND_KEYS)) add('结构', where, `conditions 上有未知键 ${k}`)

    for (const [key, range] of Object.entries(cond.attributes || {})) {
      if (!ATTR_KEYS.includes(key) && !ATTR_ALIASES.includes(key)) {
        const r = range as any
        const neverByMin = typeof r?.min === 'number' && r.min > 0
        add(neverByMin ? 'DEAD' : 'NOOP', where, `conditions.attributes.${key} 不是真实属性（未知键取值恒为 0）`)
      }
      const r = range as any
      if (r && typeof r.min === 'number' && typeof r.max === 'number' && r.min > r.max) {
        add('DEAD', where, `conditions.attributes.${key} 区间倒置 min=${r.min} > max=${r.max}`)
      }
    }
    for (const key of Object.keys(cond.hidden || {})) {
      if (!HIDDEN_KEYS.includes(key)) add('DEAD', where, `conditions.hidden.${key} 不是真实隐藏属性 → 引擎 return false，事件永不触发`)
    }
    for (const [key, range] of Object.entries(cond.gameState || {})) {
      if (!STATE_KEYS.includes(key) && !STATE_TIME.includes(key) && !STATE_ALIASES.includes(key)) {
        add('NOOP', where, `conditions.gameState.${key} 不在 STATE_MAP 里 → 条件被静默跳过，事件会比设计更早触发`)
      }
      const r = range as any
      if (r && typeof r.min === 'number' && typeof r.max === 'number' && r.min > r.max) {
        add('DEAD', where, `conditions.gameState.${key} 区间倒置 min=${r.min} > max=${r.max}`)
      }
    }
    for (const k of Object.keys(cond.flags || {})) {
      if (!['has', 'notHas', 'any', 'none', 'all', 'some'].includes(k)) add('NOOP', where, `conditions.flags.${k} 引擎不识别`)
    }
    if (cond.random !== undefined) {
      const r = Number(cond.random)
      if (!Number.isFinite(r) || r <= 0 || r > 100) add('NOOP', where, `conditions.random=${cond.random} 越界（应为 0-100 的百分数或 0-1 的小数）`)
    }

    for (const ch of event.choices || []) {
      if (!ch || typeof ch !== 'object') { add('结构', where, 'choices 里有非对象项'); continue }
      const cw = `${where} / 选项 ${ch.id || '(无 id)'}`
      for (const k of extraKeys(ch, CHOICE_KEYS)) add('结构', cw, `选项上有未知键 ${k}`)
      const eff = ch.effects || {}
      for (const k of extraKeys(eff, EFFECT_KEYS)) add('DROP', cw, `effects 上有未知键 ${k}（引擎不读，整段被忽略）`)
      for (const key of Object.keys(eff.attributes || {})) {
        if (!ATTR_KEYS.includes(key) && !ATTR_ALIASES.includes(key)) add('DROP', cw, `effects.attributes.${key} 无法映射 → 在 attributes 上凭空写入垃圾字段`)
        if (typeof (eff.attributes as any)[key] !== 'number' || !Number.isFinite((eff.attributes as any)[key])) add('DROP', cw, `effects.attributes.${key} 不是有限数`)
      }
      for (const key of Object.keys(eff.hidden || {})) {
        if (!HIDDEN_KEYS.includes(key)) add('DROP', cw, `effects.hidden.${key} 不是真实隐藏属性`)
      }
      for (const key of Object.keys(eff.gameState || {})) {
        if (!STATE_KEYS.includes(key) && !STATE_ALIASES.includes(key)) add('DROP', cw, `effects.gameState.${key} 不在 STATE_MAP 里`)
      }
      for (const id of eff.nextEvents || []) {
        if (!idUniverse.has(id)) add('LINK', cw, `effects.nextEvents 指向不存在的事件 ${id}`)
      }
      if (ch.result && typeof ch.result === 'object') {
        for (const k of extraKeys(ch.result, RESULT_KEYS)) add('结构', cw, `result 上有未知键 ${k}`)
      }
      for (const sub of [ch.showConditions, ch.condition]) {
        if (sub && typeof sub === 'object' && !('min' in sub)) {
          for (const k of extraKeys(sub, COND_KEYS)) add('结构', cw, `条件的未知键 ${k}`)
        }
      }
    }

    for (const id of event.nextEvents || []) {
      if (!idUniverse.has(id)) add('LINK', where, `event.nextEvents 指向不存在的事件 ${id}`)
    }
    if (event.narrative) {
      for (const k of extraKeys(event.narrative, NARRATIVE_KEYS)) add('结构', where, `narrative 上有未知键 ${k}`)
    }
    if (event.endingConfig?.preludeEventId && !idUniverse.has(event.endingConfig.preludeEventId)) {
      add('LINK', where, `endingConfig.preludeEventId 指向不存在的事件 ${event.endingConfig.preludeEventId}`)
    }
  }

  return findings
}

const pools: Array<[string, any[]]> = [
  ['initialEvents', initialEvents as any[]],
  ['gray', allGrayChoiceEvents as any[]],
  ['ending', allEndingEvents as any[]],
  ['emotion', emotionEvents as any[]],
  ['triggerable', triggerableEndingEvents as any[]]
]
// historical / transition 已经并进 initialEvents，单独记一下来源便于定位
const poolOf = new Map<string, string>()
for (const e of historicalEvents as any[]) poolOf.set(e.id, 'historical')
for (const e of transitionEvents as any[]) poolOf.set(e.id, 'transition')

const allEvents: any[] = []
for (const [, list] of pools) allEvents.push(...list)

const order = ['DEAD', 'NOOP', 'DROP', 'LINK', '结构']

/** 六个事件池合并去重后的体检结论（测试和 CLI 用的都是这一份） */
export const eventShape = {
  total: new Set<string>(allEvents.map(e => e?.id).filter(Boolean)).size,
  findings: scanEventShape(allEvents, undefined, id => poolOf.get(id) || 'pool')
}

// vite-node 跑脚本时 process.argv 只有 node 和 vite-node 两项（目标文件路径被它吃掉了），
// 所以不能用 argv[1] 判断"我是不是入口"。测试里唯一的稳定信号是 vitest 注入的 VITEST。
if (!process.env.VITEST) {
  const findings = eventShape.findings
  console.log(`事件总数（去重）: ${eventShape.total}\n`)
  for (const kind of order) {
    const list = findings.filter(f => f.kind === kind)
    console.log(`=== ${kind}：${list.length} 处 ===`)
    list.slice(0, 40).forEach(f => console.log(`  ${f.where}\n      ${f.detail}`))
    if (list.length > 40) console.log(`  …另有 ${list.length - 40} 处`)
    console.log('')
  }
  console.log(`合计 ${findings.length} 处`)
}
