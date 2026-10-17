/**
 * 事件数据结构体检：盯住「判定逻辑和数据之间的接线」。
 *
 * 为什么要单独写这个：这个仓库的数据文件曾经整片带 `@ts-nocheck`（第八轮已清零），
 * 那时它们对 tsc 完全透明 —— 写错一个键名不会报错，只会在运行时变成**什么都没做**的事。
 * 类型收紧之后 tsc 能抓住键名了，但抓不住"键名合法、语义错"的那一半
 * （没有 type 的事件、指向不存在 id 的引用、把花费塞进区间对象…），
 * 所以这个脚本继续存在。引擎对未知键的处理方式并不统一，后果分几类，脚本也按类报：
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
 *   LINK  —— endingConfig.preludeEventId 指向一个不存在的事件 id：结局以为自己有前奏，
 *            排期排到那里然后什么也找不到。（配对是否**双向**、prelude 有没有 isPreEnding，
 *            由 audit-value-domains.ts 拿结局池当词表来查，这里只查悬空。）
 *   DEAD  —— 还有一类死内容：事件选择**严格按 `e.type` 分层**（pickEvent 与 useGameEngine 两条
 *            路径都是 filter(e => e.type === 'xxx')）。`type` 写错或干脆不写，事件就进不了任何
 *            一层，文本写得再长也永远不会出现在玩家面前。
 *            结局池（ending / triggerable）例外：它们不走选择器，由 BoundaryEventManager 触发。
 *
 * 键白名单与 `src/types/event.ts` 手工保持一致。删字段必须同时删这里 ——
 * 白名单多留一个死字段，等于体检脚本继续替它背书「写了有人读」。
 * 第九轮据此移除了 nextEvents / relationships / family / charactersAlive / charactersDead /
 * historicalFlags 和选项级的 condition、check（DiceCheck）：它们既没有实现也没有一处数据。
 *
 * 扫描逻辑导出为 `scanEventShape()`，`eventShape` 是六个事件池合并去重后的现成结论。
 * tests/unit/eventShape.silentFailures.test.ts 两样都用：拿真实数据断言这几类恒为 0，
 * 再喂一份人造的坏事件断言检查器本身确实抓得住 —— 上一轮发现的三个体检脚本悄悄崩了半年
 * 没人察觉，根因就是"检查器没人检查"。同一个文件里还钉着两条对本脚本覆盖面的声明：
 * `src/` 不许有 `@ts-nocheck`，也不许有 BOM 开头的文件（第八轮就是因为后者，
 * 一条 `grep '^// @ts-nocheck'` 假阴性，让我以为盲区已经清零）。
 */
import { allEvents, labelOfPool } from './event-pools'

const ATTR_KEYS = ['财帛', '文韬', '理政', '武略', '体质']
const ATTR_ALIASES = ['文辩', '朝政', '权势', '机敏', '道德']
const HIDDEN_KEYS = ['道德值', '欲望值', '野心值', '机敏值', '忠诚值']
const STATE_KEYS = ['圣眷', '中官', '清议', '士绅', '民望', '国势']
// 时间键塞进 gameState 是**无效写法**：eventConditions 对它 continue 跳过，
// 年份/月份/月数要写 cond.year / cond.month / cond.turn。
const STATE_TIME = ['currentYear', 'currentMonth', 'turn']
const STATE_ALIASES = ['帝心', '派系立场', '百姓口碑', '商贾', '安全', '军事', '文化', '军心', '国势']

// 事件选择器两条路径实际会认领的 type。写在这个集合之外的（含缺省）事件
// 在两条路径里都进不了任何一层 → 死内容。
//   pickEvent：emotion/gray → historical → transition → random/emotion/gray → normal
//   useGameEngine：historical|chain → transition → random → emotion + gray/character/national/faction
const SELECTABLE_TYPES = [
  'historical', 'chain', 'transition', 'random', 'normal',
  'emotion', 'gray', 'character', 'national', 'faction'
]
// 这两个池子由 BoundaryEventManager 触发，不参与 type 分层，缺 type 是正常的
const NON_POOL_POOLS = ['ending', 'triggerable']

// declinable 由 src/data/endingDecline.ts 在运行时给善终结局加上，引擎的结局落点读它（§1.4 ⑬）
const EVENT_KEYS = ['id', 'title', 'description', 'narrative', 'conditions', 'choices', 'type',
  'endingConfig', 'isPreEnding', 'linksToEndingId', 'storyline', 'declinable']
const CHOICE_KEYS = ['id', 'text', 'quote', 'description', 'storyline', 'showConditions', 'effects',
  'resultDescription', 'result', 'failEffects', 'failResultDescription', 'failResult',
  'staminaCost', 'staminaRequired', 'staminaBonus']
const COND_KEYS = ['year', 'month', 'turn', 'rank', 'origin', 'attributes', 'hidden', 'gameState', 'flags',
  'random', 'custom']
const EFFECT_KEYS = ['attributes', 'hidden', 'gameState', 'flags', 'special', 'meritScore']
const NARRATIVE_KEYS = ['speaker', 'quote', 'background', 'situation']
const RESULT_KEYS = ['title', 'tags', 'echo']

export type Finding = { kind: string; where: string; detail: string }

const extraKeys = (obj: object, allowed: string[]) =>
  Object.keys(obj).filter(k => !allowed.includes(k))

/**
 * 对一批事件做结构体检。
 * `knownIds` 决定 preludeEventId 的悬空判定拿谁当全集，缺省用这批事件自身；
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

  /**
   * 条件块检查。同一个函数同时用于事件级 `conditions` 和选项级 `showConditions`：
   * 后者原先是这个体检脚本自己的盲区（只查了未知键名，没查里面的属性名），
   * 于是 `showConditions.attributes.道德值` 这种"把隐藏属性写成属性"的死条件，
   * 是 tsc 而不是体检脚本先抓到的。
   *
   * `level` 只服务一条判定：`custom` 只有 boundaryEventCompiler 在**事件级**、
   * 且事件来自结局池时才真的会被调用。别的位置写 custom 是一道看不见的门。
   */
  const scanConditions = (cond: any, prefix: string, where: string, level: 'event' | 'choice', poolLabel: string) => {
    for (const k of extraKeys(cond, COND_KEYS)) add('结构', where, `${prefix} 上有未知键 ${k}`)

    // Range 只认 min / max。往里面塞数值是另一种写法错误：
    // `{ 文韬: { min: 70, 财帛: -15 } }` 想表达"要 70 文韬、花 15 两银子"，
    // 但 财帛 那个数被整个忽略 —— 门槛在、花费凭空蒸发。
    const rangeKeys = (path: string, key: string, range: any) => {
      if (!range || typeof range !== 'object') return
      for (const rk of Object.keys(range)) {
        if (rk !== 'min' && rk !== 'max') {
          add('DROP', where, `${path}.${key} 是区间对象，只有 min/max 会被读取 —— ${rk}: ${JSON.stringify(range[rk])} 静默丢失`)
        }
      }
      if (typeof range.min === 'number' && typeof range.max === 'number' && range.min > range.max) {
        add('DEAD', where, `${path}.${key} 区间倒置 min=${range.min} > max=${range.max}`)
      }
    }

    for (const [key, range] of Object.entries(cond.attributes || {})) {
      if (!ATTR_KEYS.includes(key) && !ATTR_ALIASES.includes(key)) {
        const r = range as any
        const neverByMin = typeof r?.min === 'number' && r.min > 0
        const hint = HIDDEN_KEYS.includes(key) ? '（它是隐藏属性，应该写在 conditions.hidden 里）' : ''
        add(neverByMin ? 'DEAD' : 'NOOP', where, `${prefix}.attributes.${key} 不是真实属性（未知键取值恒为 0，选项门则按 50 算）${hint}`)
      }
      rangeKeys(`${prefix}.attributes`, key, range)
    }
    for (const [key, range] of Object.entries(cond.hidden || {})) {
      if (!HIDDEN_KEYS.includes(key)) add('DEAD', where, `${prefix}.hidden.${key} 不是真实隐藏属性 → 引擎 return false，事件永不触发`)
      rangeKeys(`${prefix}.hidden`, key, range)
    }
    for (const [key, range] of Object.entries(cond.gameState || {})) {
      if (STATE_TIME.includes(key)) {
        const proper = key === 'turn' ? 'turn' : key === 'currentYear' ? 'year' : 'month'
        add('NOOP', where, `${prefix}.gameState.${key} 被 eventConditions 直接 continue 跳过 —— 这道时间门等于没写，应该放到 conditions.${proper}`)
        continue
      }
      if (!STATE_KEYS.includes(key) && !STATE_ALIASES.includes(key)) {
        add('NOOP', where, `${prefix}.gameState.${key} 不在 STATE_MAP 里 → 条件被静默跳过，事件会比设计更早触发`)
      }
      rangeKeys(`${prefix}.gameState`, key, range)
    }
    for (const k of Object.keys(cond.flags || {})) {
      if (!['has', 'notHas', 'any', 'none', 'all', 'some'].includes(k)) add('NOOP', where, `${prefix}.flags.${k} 引擎不识别`)
    }
    if (cond.random !== undefined) {
      const r = Number(cond.random)
      if (!Number.isFinite(r) || r <= 0 || r > 100) add('NOOP', where, `${prefix}.random=${cond.random} 越界（应为 0-100 的百分数或 0-1 的小数）`)
    }
    if (typeof cond.custom === 'function') {
      const honored = level === 'event' && NON_POOL_POOLS.includes(poolLabel)
      if (!honored) {
        const why = level === 'choice'
          ? '选项级条件走的是 EventDisplay.checkChoiceRequirement，它只读 attributes/gameState/hidden/flags/出身/体质，不调用 custom'
          : '事件池的条件走的是 checkEventConditions，它不调用 custom（只有 boundaryEventCompiler 会）'
        add('NOOP', where, `${prefix}.custom 不会被任何求值器调用 —— ${why}，这道门等于没装`)
      }
    }
  }

  for (const [, event] of seen) {
    const label = labelOf ? labelOf(event.id) : 'pool'
    const where = `${label} · ${event.id}「${String(event.title || '').slice(0, 16)}」`

    for (const k of extraKeys(event, EVENT_KEYS)) add('结构', where, `事件上有未知键 ${k}（类型里没有这个字段，写了没人读）`)

    if (!NON_POOL_POOLS.includes(label)) {
      if (!event.type) add('DEAD', where, '事件没有 type —— 两条选择器路径都按 type 分层，这个事件进不了任何一层，永不触发')
      else if (!SELECTABLE_TYPES.includes(event.type)) add('DEAD', where, `事件 type='${event.type}' 不在选择器认领的类型集合里，永不触发`)
    }

    scanConditions(event.conditions || {}, 'conditions', where, 'event', label)

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
      // special 是"剧情级动作"键，但引擎只实现了 ending 一种（useGameEngine 两处
      // `special?.type === 'ending'`）。写 death / promotion / imprisonment 不会杀人也不会升官，
      // 只会安静地什么都不做 —— 这类"看起来像副作用的注释"最容易被后来人当成真接口。
      for (const k of extraKeys(eff.special || {}, ['type'])) {
        add('DROP', cw, `effects.special.${k} 引擎不读（这个对象只认 type，且只有 'ending' 有实现）`)
      }
      if (eff.special && eff.special.type !== 'ending') {
        add('DEAD', cw, `effects.special.type='${eff.special.type}' 没有任何分支处理 —— 死亡/贬谪走引擎自己的升贬判定，不经过这里`)
      }
      if (ch.result && typeof ch.result === 'object') {
        for (const k of extraKeys(ch.result, RESULT_KEYS)) add('结构', cw, `result 上有未知键 ${k}`)
      }
      if (ch.showConditions && typeof ch.showConditions === 'object') {
        scanConditions(ch.showConditions, 'showConditions', cw, 'choice', label)
      }
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

const order = ['DEAD', 'NOOP', 'DROP', 'LINK', '结构']

/** 六个事件池合并去重后的体检结论（测试和 CLI 用的都是这一份） */
export const eventShape = {
  total: new Set<string>(allEvents.map(e => e?.id).filter(Boolean)).size,
  findings: scanEventShape(allEvents, undefined, labelOfPool)
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
