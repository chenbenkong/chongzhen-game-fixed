/**
 * 原生客户端数据导出脚本（Android 单机 APK / 未来其他原生端共用）。
 *
 * 职责：
 *  - 从现有 TS 数据源（事件池 / 结局 / 出身 / 难度 / 官阶 / 剧情线 / 履历文案 / 边界规则）
 *    读取**只读**数据，序列化为纯 JSON，写到
 *    `android/app/src/main/assets/game-data.json`。
 *  - 函数字段一律剥离：不可序列化的闭包不允许静默丢失。
 *    * `conditions.custom`（全库仅 ending_famous_minister 一处）→ `customRules`；
 *    * 手写 boundary `check` 闭包（二十来条）→ 原样登记进 `unportableRules`，
 *      先把事件 id / 判定语义 / 涉及字段 / 不能声明式化的原因抓全，声明式规则留到后续迭代。
 *  - 同 id 事件只留一份；去重前后条数打印到 stdout 并写进 meta。
 *
 * 本脚本不修改任何 src 下的数据文件，不做联网请求。
 *
 * 运行：
 *   node node_modules/vite-node/vite-node.mjs scripts/export-native-data.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 事件数据（只读）─────────────────────────────────────────────────────────
import { initialEvents, allGrayChoiceEvents } from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
import { FAMOUS_MINISTER_EXTRA_TICKETS } from '../src/data/events/ending/endings_all'
// 导入该模块即把全部边界事件（手写 check + 编译器包装的叙事结局）注册进 manager
import '../src/data/boundaryEvents'
import { boundaryEventManager } from '../src/services/BoundaryEventManager'

// ── 配置 / 规则数据（只读）─────────────────────────────────────────────────
import { origins } from '../src/data/origins'
import { DIFFICULTY_CONFIGS, DEFAULT_DIFFICULTY } from '../src/types/difficulty'
import { RANKS, GAME_START_YEAR, FUGITIVE_ANNUAL_INCOME } from '../src/hooks/useGameEngine'
import { STORYLINES } from '../src/data/storylines'
import { FLAG_MEMOIRS, FLAG_GATE_LABELS } from '../src/data/flagBiography'
import { ENDING_ID_ALIASES } from '../src/data/endingRegistry'
import { DECLINABLE_ENDING_IDS } from '../src/data/endingDecline'
import { ORDINARY_LIFE_EXCLUDED_FLAGS } from '../src/data/ordinaryLife'
import {
  CORRUPTION_EXPOSURE,
  FUGITIVE_FLAG,
  CORRUPTION_WARNING_FLAG,
} from '../src/data/demotionWarningEvents'
import { ZERO_THRESHOLDS, zeroWarnFlag } from '../src/data/zeroWarningEvents'
import { NARRATIVE_MIN_YEAR, NARRATIVE_MIN_TURN } from '../src/data/boundaryEventCompiler'
import { ATTRIBUTE_DEFAULTS, HIDDEN_DEFAULTS } from '../src/types/game'
import type { GameEvent } from '../src/types/event'

// ── 路径 ───────────────────────────────────────────────────────────────────
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets')
const outFile = path.join(outDir, 'game-data.json')

// ── 引擎常量（与源码逐项对齐，source 字段标注出处）──────────────────────────
/** 阈值类结局宽限期（月）：boundaryEvents.ts THRESHOLD_ENDING_GRACE_TURNS */
const THRESHOLD_ENDING_GRACE_TURNS = 12
/** 贬官宽限期（月）：useGameEngine.ts DEMOTION_GRACE_TURNS */
const DEMOTION_GRACE_TURNS = 12

// ── 函数字段扫描 / 剥离 ─────────────────────────────────────────────────────
interface StripHit {
  eventId: string
  path: string
  kind: string
}

function stripFunctionsDeep(value: unknown, path: string, eventId: string, hits: StripHit[]): unknown {
  if (typeof value === 'function') {
    hits.push({ eventId, path, kind: typeof value })
    return undefined
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripFunctionsDeep(v, path, eventId, hits))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const stripped = stripFunctionsDeep(v, `${path}.${k}`, eventId, hits)
      if (stripped !== undefined) out[k] = stripped
    }
    return out
  }
  return value
}

// ── conditions.custom 的登记（不写 Kotlin 代码）────────────────────────────
/**
 * ending_famous_minister 的 custom 闭包（endings_all.ts:82–102）语义：
 *  清流票 8 张里命中 ≥2 张；或者 宰辅/外任票 3 张里任一命中；两支并列 OR。
 */
const FAMOUS_MINISTER_CLEAN_TICKETS = [
  '东林党核心',
  '改革派',
  '反阉先锋',
  '东林党人',
  '持续保袁',
  '弹劾陈新甲',
  '反对增饷',
  '清算阉党',
] as const

// ── 手写 boundary check 登记 ────────────────────────────────────────────────
interface UnportableEntry {
  registryId: string
  eventId: string
  description: string
  fields: string[]
  reason: string
  source: string
}

interface HandwrittenMeta {
  description: string
  fields: string[]
  reason: string
  source: string
}

const ZERO_WARN_REASON =
  '判定由「宽限期 turn 阈值 + 已警告 flag 是否在场 + 维度值归零」三段合取构成；事件 conditions 模型里没有 graceTurns / warnedFlag 槽位，标准条件求值器覆盖不到，Kotlin 侧需专用边界求值器。'
const FACTION_REASON =
  '判定读取 faction 阵营结构（好感度 / 党争烈度 / 两派差值绝对值），事件 conditions 模型没有 faction 段；且含差值绝对值比较与多字段合取，Kotlin 侧需维护阵营状态并实现专用判定。'

/** 二十来条手写 check 的人话语义、涉及字段、不能声明式化的原因。 */
const HANDWRITTEN_META: Record<string, HandwrittenMeta> = {
  // ── 八条阈值结局（归零 + 已警告）─────────────────────────────────────
  bankrupt: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月（turn≥${THRESHOLD_ENDING_GRACE_TURNS}）后，财帛≤0 且已收到「归零警告·财帛」警告票 → 触发抄没破产结局。`,
    fields: ['gameState.turn', 'attributes.财帛', 'flags[归零警告·财帛]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:48-73',
  },
  death_illness: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，体质≤0 且已收到「归零警告·体质」警告票 → 触发暴病而亡结局。`,
    fields: ['gameState.turn', 'attributes.体质', 'flags[归零警告·体质]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:74-99',
  },
  emperor_hate: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，圣眷≤0 且已收到「归零警告·圣眷」警告票，且身上没有「潜逃」票 → 触发龙颜震怒赐死结局。`,
    fields: ['gameState.turn', 'gameState.圣眷', 'flags[归零警告·圣眷]', 'flags[潜逃]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:100-130',
  },
  eunuch_conspiracy: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，中官≤0 且已收到「归零警告·中官」警告票 → 触发宦官罗织构陷结局。`,
    fields: ['gameState.turn', 'gameState.中官', 'flags[归零警告·中官]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:131-156',
  },
  scholar_ostracism: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，清议≤0 且已收到「归零警告·清议」警告票 → 触发士林不齿结局。`,
    fields: ['gameState.turn', 'gameState.清议', 'flags[归零警告·清议]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:157-182',
  },
  gentry_rebellion: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，士绅≤0 且已收到「归零警告·士绅」警告票 → 触发乡绅作乱结局。`,
    fields: ['gameState.turn', 'gameState.士绅', 'flags[归零警告·士绅]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:183-208',
  },
  popular_uproar: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，民望≤0 且已收到「归零警告·民望」警告票 → 触发民怨沸腾结局。`,
    fields: ['gameState.turn', 'gameState.民望', 'flags[归零警告·民望]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:209-234',
  },
  moral_degeneracy: {
    description: `开局满 ${THRESHOLD_ENDING_GRACE_TURNS} 个月后，隐藏道德值≤0 且已收到「归零警告·道德值」警告票 → 触发道德败坏结局。`,
    fields: ['gameState.turn', 'hidden.道德值', 'flags[归零警告·道德值]'],
    reason: ZERO_WARN_REASON,
    source: 'src/data/boundaryEvents.ts:235-260',
  },

  // ── 八条归零警告（归零且尚未警告）────────────────────────────────────
  'warn_zero_财帛': {
    description: '财帛≤0 且身上还没有「归零警告·财帛」票 → 发归零警告卡（一生只发一次）。',
    fields: ['attributes.财帛', 'flags[归零警告·财帛]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_体质': {
    description: '体质≤0 且身上还没有「归零警告·体质」票 → 发归零警告卡。',
    fields: ['attributes.体质', 'flags[归零警告·体质]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_圣眷': {
    description: '圣眷≤0 且身上还没有「归零警告·圣眷」票 → 发归零警告卡。',
    fields: ['gameState.圣眷', 'flags[归零警告·圣眷]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_中官': {
    description: '中官≤0 且身上还没有「归零警告·中官」票 → 发归零警告卡。',
    fields: ['gameState.中官', 'flags[归零警告·中官]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_清议': {
    description: '清议≤0 且身上还没有「归零警告·清议」票 → 发归零警告卡。',
    fields: ['gameState.清议', 'flags[归零警告·清议]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_士绅': {
    description: '士绅≤0 且身上还没有「归零警告·士绅」票 → 发归零警告卡。',
    fields: ['gameState.士绅', 'flags[归零警告·士绅]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_民望': {
    description: '民望≤0 且身上还没有「归零警告·民望」票 → 发归零警告卡。',
    fields: ['gameState.民望', 'flags[归零警告·民望]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },
  'warn_zero_道德值': {
    description: '隐藏道德值≤0 且身上还没有「归零警告·道德值」票 → 发归零警告卡。',
    fields: ['hidden.道德值', 'flags[归零警告·道德值]'],
    reason: '警告票「一生只发一次」的自耗式判定（!flags.includes），conditions 模型没有「已警告」槽位；Kotlin 侧需专用警告求值器。',
    source: 'src/data/zeroWarningEvents.ts',
  },

  // ── 贪墨预警 ───────────────────────────────────────────────────────
  warn_corruption: {
    description: `开局满 ${DEMOTION_GRACE_TURNS} 个月，身上还没有「革职预警·贪墨」票；且财帛>${CORRUPTION_EXPOSURE.财帛}、欲望值>${CORRUPTION_EXPOSURE.欲望值}、道德值<${CORRUPTION_EXPOSURE.道德值}（道德值缺省按 100 算）→ 发贪墨预警卡。`,
    fields: [
      'gameState.turn',
      'attributes.财帛',
      'hidden.欲望值',
      'hidden.道德值',
      'flags[革职预警·贪墨]',
    ],
    reason: '宽限期 + 自耗式警告票 + 跨属性/隐藏值的三向合取，且道德值有缺省默认值；标准 conditions 求值器不覆盖宽限期与缺省兜底，Kotlin 侧需专用求值器。',
    source: 'src/data/demotionWarningEvents.ts:188-219',
  },

  // ── 两条危机复合判定 ────────────────────────────────────────────────
  serious_illness: {
    description: '0 < 体质 < 20（开区间：体质大于 0 且严格小于 20）→ 触发「重病缠身」危机。',
    fields: ['attributes.体质'],
    reason: 'conditions 区间模型只有闭区间 min/max，表达不开区间「大于 0 且小于 20」的单侧严格边界；Kotlin 侧需在危机判定里做开区间比较。',
    source: 'src/data/boundaryEvents.ts:589-639',
  },
  inner_court_channel: {
    description: '身上没有「潜逃」票，且 0 < 中官 ≤ 30（左开右闭）→ 触发内廷通道危机。',
    fields: ['gameState.中官', 'flags[潜逃]'],
    reason: '混合了 flag 排除与开/闭混合区间（0 不包含、30 包含），标准 conditions 区间模型表达不了左开右闭；Kotlin 侧需专用判定。',
    source: 'src/data/boundaryEvents.ts:657-729',
  },

  // ── 三条党争结局 ────────────────────────────────────────────────────
  faction_donglin_martyr: {
    description: `turn≥${NARRATIVE_MIN_TURN} 且当前年≥1644；东林好感≥80 且阉党好感≤20；身上持「东林死忠」或「复社成员」任一；清议≥60 → 触发东林殉道结局。`,
    fields: ['gameState.turn', 'state.currentYear', 'faction.东林好感', 'faction.阉党好感', 'flags[东林死忠/复社成员]', 'gameState.清议'],
    reason: FACTION_REASON,
    source: 'src/data/boundaryEvents.ts:731-787',
  },
  faction_tyrant_fall: {
    description: `turn≥${NARRATIVE_MIN_TURN} 且当前年≥1637；阉党好感≥70 且东林好感≤15；身上持「叛徒」票且无「阉党路线」票；道德值≤30（缺省 50）→ 触发权阉败亡结局。`,
    fields: ['gameState.turn', 'state.currentYear', 'faction.阉党好感', 'faction.东林好感', 'flags[叛徒]', 'flags[阉党路线]', 'hidden.道德值'],
    reason: FACTION_REASON,
    source: 'src/data/boundaryEvents.ts:788-844',
  },
  faction_sacrifice: {
    description: `turn≥${NARRATIVE_MIN_TURN} 且当前年≥${NARRATIVE_MIN_YEAR}；党争烈度≥90；东林好感与阉党好感差值绝对值 < 20，且两派好感都 < 40 → 触发党争牺牲品结局。`,
    fields: ['gameState.turn', 'state.currentYear', 'faction.党争烈度', 'faction.东林好感', 'faction.阉党好感'],
    reason: FACTION_REASON,
    source: 'src/data/boundaryEvents.ts:845-897',
  },
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
function main(): void {
  // 1. 收集原始事件（去重前）
  const rawPool: GameEvent[] = [...initialEvents, ...allGrayChoiceEvents]
  const rawEndings: GameEvent[] = [...allEndingEvents]
  const registry = Object.values(boundaryEventManager.getAll())

  const rawTotal = rawPool.length + rawEndings.length + registry.length

  // 2. 按 id 合并；registry 包装过的结局条件带 year/turn 地板，后写入覆盖
  const master = new Map<string, GameEvent>()
  const provenance = new Map<string, Set<string>>()
  const ingest = (events: GameEvent[], source: string) => {
    for (const e of events) {
      if (!master.has(e.id)) {
        master.set(e.id, e)
        provenance.set(e.id, new Set([source]))
      } else {
        provenance.get(e.id)!.add(source)
        if (source === 'boundary') master.set(e.id, e)
      }
    }
  }
  ingest(rawPool, 'pool')
  ingest(rawEndings, 'ending')
  ingest(registry.map((b) => b.event), 'boundary')

  const dedupRemoved = rawTotal - master.size

  // 3. 序列化事件，剥离函数；收集 custom 规则
  const stripHits: StripHit[] = []
  const customRules: unknown[] = []
  const serializedEvents: Record<string, unknown>[] = []

  for (const [id, event] of master) {
    const raw = event as GameEvent

    // 3.1 先抽取 conditions.custom（全库仅 ending_famous_minister 一处）
    const customFn = (raw.conditions as { custom?: unknown } | undefined)?.custom
    if (typeof customFn === 'function') {
      if (id === 'ending_famous_minister') {
        customRules.push({
          eventId: id,
          kind: 'ticketCountOrAny',
          description:
            '清流票命中数 ≥ cleanMin；或宰辅/外任票任一命中；两支并列 OR。',
          params: {
            cleanTickets: [...FAMOUS_MINISTER_CLEAN_TICKETS],
            cleanMin: 2,
            extraTickets: [...FAMOUS_MINISTER_EXTRA_TICKETS],
          },
          source: 'src/data/events/ending/endings_all.ts:82-102',
        })
      } else {
        stripHits.push({ eventId: id, path: 'conditions.custom', kind: 'function' })
      }
    }

    const clone = stripFunctionsDeep(raw, id, id, stripHits) as Record<string, unknown>
    const cond = (clone.conditions as Record<string, unknown> | undefined)
    if (cond && typeof cond.custom !== 'undefined') delete cond.custom

    const sources = [...(provenance.get(id) ?? [])]
    serializedEvents.push({
      ...clone,
      origin: sources.includes('ending') || raw.type === 'ending' ? 'ending' : 'pool',
      sources,
    })
  }

  // 4. 边界事件登记：手写 check → unportableRules；编译器包装结局 → compiledConditions
  const boundaryExports: Array<Record<string, unknown>> = []
  const unportableRules: UnportableEntry[] = []

  for (const b of registry) {
    const meta = HANDWRITTEN_META[b.id]
    if (meta) {
      boundaryExports.push({
        registryId: b.id,
        priority: b.priority,
        type: b.type,
        eventId: b.event.id,
        rule: { kind: 'handwrittenCheck', note: '原始 check 为手写闭包，判定语义/字段/原因见 unportableRules。' },
        kotlinSpecial: true,
        source: meta.source,
      })
      unportableRules.push({
        registryId: b.id,
        eventId: b.event.id,
        description: meta.description,
        fields: meta.fields,
        reason: meta.reason,
        source: meta.source,
      })
    } else {
      boundaryExports.push({
        registryId: b.id,
        priority: b.priority,
        type: b.type,
        eventId: b.event.id,
        rule: {
          kind: 'compiledConditions',
          note: '标准条件求值器按 event.conditions 判定；year/turn 兜底地板已由 wrapBatchAsBoundaryEvents 烘入 conditions。',
        },
        kotlinSpecial: false,
        source: 'src/data/boundaryEventCompiler.ts',
      })
    }
  }

  // 5. 组装输出
  const endingIds = serializedEvents
    .filter((e) => (e.origin as string) === 'ending')
    .map((e) => e.id as string)

  const payload = {
    meta: {
      schemaVersion: 1,
      sourceVersion: '0.4.8',
      exportedAt: new Date().toISOString(),
      generator: 'scripts/export-native-data.ts',
      counts: {
        eventsTotal: serializedEvents.length,
        poolEvents: serializedEvents.filter((e) => e.origin === 'pool').length,
        endingEvents: endingIds.length,
        boundaryEvents: boundaryExports.length,
        handwrittenBoundary: unportableRules.length,
        compiledBoundary: boundaryExports.length - unportableRules.length,
        origins: Object.keys(origins).length,
        difficulties: Object.keys(DIFFICULTY_CONFIGS).length,
        ranks: RANKS.length,
        storylines: Object.keys(STORYLINES).length,
        flagMemoirs: Object.keys(FLAG_MEMOIRS).length,
        flagGateLabels: Object.keys(FLAG_GATE_LABELS).length,
        customRules: customRules.length,
        unportableRules: unportableRules.length,
      },
      dedup: {
        rawTotal,
        unique: master.size,
        removedDuplicates: dedupRemoved,
      },
      strippedFunctions: stripHits,
    },
    constants: {
      gameStartYear: GAME_START_YEAR,
      narrativeMinYear: NARRATIVE_MIN_YEAR,
      narrativeMinTurn: NARRATIVE_MIN_TURN,
      thresholdGraceTurns: THRESHOLD_ENDING_GRACE_TURNS,
      demotionGraceTurns: DEMOTION_GRACE_TURNS,
      fugitiveAnnualIncome: FUGITIVE_ANNUAL_INCOME,
      fugitiveFlag: FUGITIVE_FLAG,
      corruptionWarningFlag: CORRUPTION_WARNING_FLAG,
      zeroWarnFlagPrefix: '归零警告·',
      corruptionExposure: CORRUPTION_EXPOSURE,
      ordinaryLifeExcludedFlags: [...ORDINARY_LIFE_EXCLUDED_FLAGS],
      zeroThresholds: ZERO_THRESHOLDS,
    },
    defaults: {
      attributes: ATTRIBUTE_DEFAULTS,
      hidden: HIDDEN_DEFAULTS,
    },
    origins: Object.values(origins),
    difficulties: Object.values(DIFFICULTY_CONFIGS),
    defaultDifficulty: DEFAULT_DIFFICULTY,
    ranks: RANKS,
    storylines: Object.values(STORYLINES),
    flagMemoirs: Object.entries(FLAG_MEMOIRS).map(([flag, m]) => ({ flag, ...m })),
    flagGateLabels: Object.entries(FLAG_GATE_LABELS).map(([flag, label]) => ({ flag, label })),
    endings: {
      aliasMap: ENDING_ID_ALIASES,
      declinableEndingIds: [...DECLINABLE_ENDING_IDS],
      endingIds,
    },
    events: serializedEvents,
    boundaryEvents: boundaryExports,
    customRules,
    unportableRules,
  }

  // 6. 落盘
  fs.mkdirSync(outDir, { recursive: true })
  const json = JSON.stringify(payload, null, 2)
  fs.writeFileSync(outFile, json, 'utf8')

  const bytes = Buffer.byteLength(json, 'utf8')
  console.log('[export-native-data] 写出:', path.relative(repoRoot, outFile))
  console.log(`  事件(去重后): ${serializedEvents.length}（池 ${payload.meta.counts.poolEvents} / 结局 ${endingIds.length}）`)
  console.log(`  去重: 原始 ${rawTotal} → 唯一 ${master.size}，剔除重复 ${dedupRemoved}`)
  console.log(`  边界事件: ${boundaryExports.length}（手写专用 ${unportableRules.length} / 编译器 ${payload.meta.counts.compiledBoundary}）`)
  console.log(`  custom 规则: ${customRules.length}；unportableRules: ${unportableRules.length}`)
  console.log(`  剥离函数字段: ${stripHits.length}`)
  console.log(`  JSON 体积: ${bytes} 字节 (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
}

main()
