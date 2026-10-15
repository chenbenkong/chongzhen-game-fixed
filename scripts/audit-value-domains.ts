/**
 * 值域体检：把数据里的**自由字符串**和真实词表对账。
 *
 * 为什么还要第二个体检脚本。`audit-event-shape.ts` 盯的是键名接线，第八轮把类型收紧之后，
 * 键名这一层 tsc 已经能自己拦住；但 `conditions.origin` / `conditions.rank` / `storyline` /
 * `linksToEndingId` 这些声明就是 `string`，tsc 只保证「它是个字符串」——
 * 出身写成「晋绅」（正字是「缙绅」）照样编译通过，而引擎拿它做的是集合判断：
 *   - `allowed.includes(character.origin)` → 拼错恒 false → **事件在任何存档里都选不中**
 *   - `allowedRanks.includes(character.rank)` → 同上
 *   - `item.storyline === currentLine` 加权（引擎 weightedPick / pickEvent）→ 拼错只是权重永不生效
 * 也就是说：同一类「静默死内容」，错的位置从键名挪到了值，类型系统管不到。
 * 这个脚本补的就是另一半 —— 键名归 tsc，值域归这里。
 *
 * kind 沿用 shape 体检的分类，报告和断言都能一以贯之：
 *   DEAD —— origin / rank 不在词表里（恒 false，死内容）；
 *            year / month / turn 区间倒置；month 边界落在 1..12 之外（没有任何月份满足）；
 *            year.max 早于开局年（时钟只往前走，永远回不去）；
 *            两个不同事件共用一个 id（引擎按 id 去重，撞号者只剩一个能播）
 *   NOOP —— storyline 不在 STORYLINES 里（加权命不中、getStoryline 也查不到）；
 *            边界写得比值域还宽（month.min<1 / month.max>12 / year.min<开局年），等效于没装这道门；
 *            年份漏了世纪（1628 写成 28）；
 *            prelude 只写 linksToEndingId 却没写 isPreEnding —— 运行时读的是后者
 *   LINK —— preludeEventId / linksToEndingId 悬空，或配对只写了单向；
 *            事件里出现指向 `public/` 下不存在文件的站内资源路径
 *
 * 词表一律从**运行时真值**导入，脚本里不重抄一份：`origins` / `STORYLINES` / `RANKS` /
 * 结局池 / `GAME_START_YEAR`。RANKS 与开局年都住在 `useGameEngine` 里，代价是这个脚本连带
 * import 了 React；换来确定性：官阶名和开局年份以后只有一处能改。
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { allEvents, endings, labelOfPool } from './event-pools'
import { origins } from '../src/data/origins'
import { STORYLINES } from '../src/data/storylines'
import { RANKS, GAME_START_YEAR } from '../src/hooks/useGameEngine'
import type { Finding } from './audit-event-shape'

export interface ValueVocab {
  origins: Set<string>
  ranks: Set<string>
  storylines: Set<string>
  /** 全部事件 id → 事件本体：prelude 的反向配对要读对方身上的字段，光有 id 不够 */
  eventsById: Map<string, any>
  /** 结局 id → 结局本体 */
  endingsById: Map<string, any>
  startYear: number
  /** 站内资源路径（`/x/y.png`）是否真的躺在 public/ 里；测试可以塞一个桩函数 */
  assetExists: (sitePath: string) => boolean
}

const asArr = (v: any): any[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])

/** 只认"长得就是资源路径"的字符串，免得把正文里的斜杠也当路径查 */
const ASSET_PATH = /^\/[A-Za-z0-9_\-./]+\.(?:png|jpe?g|gif|svg|webp|mp3|ogg|wav|json)$/i

export function buildVocab(
  all: any[],
  end: any[],
  startYear = GAME_START_YEAR,
  publicDir = join(process.cwd(), 'public')
): ValueVocab {
  const eventsById = new Map<string, any>()
  for (const e of all) if (e?.id && !eventsById.has(e.id)) eventsById.set(e.id, e)
  const endingsById = new Map<string, any>()
  for (const e of end) if (e?.id && !endingsById.has(e.id)) endingsById.set(e.id, e)
  return {
    origins: new Set(Object.keys(origins)),
    ranks: new Set(RANKS.map(r => r.name)),
    storylines: new Set(Object.keys(STORYLINES)),
    eventsById,
    endingsById,
    startYear,
    assetExists: (sitePath: string) => existsSync(join(publicDir, sitePath.replace(/^\/+/, '')))
  }
}

/**
 * `events` 是被查的那批；`vocab.eventsById` / `vocab.endingsById` 才是全集 ——
 * 引用类检查必须拿全集当准绳，否则「不在我这批里」会被误报成悬空引用。
 */
export function scanValueDomains(
  events: any[],
  vocab: ValueVocab,
  labelOf?: (id: string) => string
): Finding[] {
  const findings: Finding[] = []
  const add = (kind: string, where: string, detail: string) => findings.push({ kind, where, detail })

  // id 撞号：同一个 id 挂两个**不同**的事件。
  // 引擎到处按 id 行事 —— useGameEngine 里 `results.filter((e,i,arr) => arr.findIndex(x => x.id === e.id) === i)`
  // 会把后出现的那个直接从候选池里剔掉，eventConditions 的 `new Set(eventHistory)` 又会把它的孪生兄弟
  // 永久标记成「已播过」。于是两个事件只剩一个能播，而且剩哪个取决于数组顺序 —— 数据里看不出问题，
  // 只有真跑一局才看得见。第十轮就是这么逮到 historical_014 / transition_163 的。
  // 注意：同一个对象被两个池子各引一次（情感线既在 initialEvents 也在 emotionEvents）是**正常**的，
  // 内容完全相同的那一份也算正常 —— 池子以后要是改成 `list.map(e => ({ ...e }))`，引用会变但内容不变，
  // 这时候还报错就是体检自己造噪音，后人只会顺手加豁免。所以比的是「标题 + 选项 id 序列」。
  const choiceKey = (ev: any) => (ev.choices || []).map((c: any) => c?.id).join('|')
  const seen = new Map<string, any>()
  for (const e of events) {
    if (!e || !e.id) continue
    const prev = seen.get(e.id)
    if (prev === undefined) {
      seen.set(e.id, e)
    } else if (prev !== e && !(prev.title === e.title && choiceKey(prev) === choiceKey(e))) {
      add(
        'DEAD',
        labelOf?.(e.id) || 'pool',
        `id='${e.id}' 被两个不同事件共用：「${prev.title}」与「${e.title}」 —— 引擎按 id 去重，其中一个永远播不出来`
      )
    }
  }

  const scanTime = (cond: any, prefix: string, where: string) => {
    for (const key of ['year', 'month', 'turn'] as const) {
      const range = cond?.[key]
      if (!range || typeof range !== 'object') continue
      const path = `${prefix}.${key}`
      const min = (range as any).min
      const max = (range as any).max

      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        add('DEAD', where, `${path} 区间倒置 min=${min} > max=${max} —— 没有任何取值能同时满足，这道门恒 false`)
      }

      if (key === 'month') {
        // 引擎里 currentMonth 恒为 1..12（跨年时手动折回 1），所以越界边界是可以判死的
        if (typeof min === 'number' && min > 12) add('DEAD', where, `${path}.min=${min} 越出 1..12 —— 没有哪个月份能满足`)
        if (typeof max === 'number' && max < 1) add('DEAD', where, `${path}.max=${max} 越出 1..12 —— 同上`)
        if (typeof min === 'number' && min < 1) add('NOOP', where, `${path}.min=${min} 低于最小月份，等效于不设下限`)
        if (typeof max === 'number' && max > 12) add('NOOP', where, `${path}.max=${max} 高于最大月份，等效于不设上限`)
      }

      if (key === 'year') {
        if (typeof max === 'number' && max < vocab.startYear) {
          add('DEAD', where, `${path}.max=${max} 早于开局年 ${vocab.startYear} —— 时钟只往前走，这个事件永远等不到自己的窗口`)
        }
        if (typeof min === 'number' && min < vocab.startYear) {
          add('NOOP', where, `${path}.min=${min} 低于开局年 ${vocab.startYear}，等效于不设下限${min < 1000 ? '（多半是漏写了世纪）' : ''}`)
        }
      }
    }
  }

  const scanConditionValues = (cond: any, prefix: string, where: string) => {
    if (!cond || typeof cond !== 'object') return
    for (const o of asArr(cond.origin)) {
      if (!vocab.origins.has(String(o))) {
        add('DEAD', where, `${prefix}.origin='${o}' 不在出身表（现有：${[...vocab.origins].join('、')}）—— allowed.includes(character.origin) 恒 false，事件永不触发`)
      }
    }
    for (const r of asArr(cond.rank)) {
      if (!vocab.ranks.has(String(r))) {
        add('DEAD', where, `${prefix}.rank='${r}' 不是 RANKS 里的官阶名（共 ${vocab.ranks.size} 级，取 name 字段）—— 同样恒 false`)
      }
    }
    scanTime(cond, prefix, where)
  }

  /**
   * 深度走一遍事件里所有字符串，凡长得像站内资源路径的都验一次存在性。
   *
   * 这条规则是被 `narrative.speaker.avatar` 逼出来的：数据里 301 处 `/avatars/*.png`，
   * 而 `public/avatars/` 从来不存在，也没有任何组件读它 —— 于是"三百张碎图"安静地躺在数据里，
   * 谁也没看见。字段和那 301 处已经删了，规则留着：
   * 下次有人往数据里塞图片/音频路径，报错的时机是 CI，而不是上线后的某个空白 <img>。
   */
  const scanAssetPaths = (node: any, pathStr: string, where: string, walked: Set<any>) => {
    if (typeof node === 'string') {
      if (ASSET_PATH.test(node) && !vocab.assetExists(node)) {
        add('LINK', where, `${pathStr} 指向站内资源 ${node}，但 public/ 下没有这个文件`)
      }
      return
    }
    if (!node || typeof node !== 'object' || walked.has(node)) return
    walked.add(node)
    if (Array.isArray(node)) {
      node.forEach((v, i) => scanAssetPaths(v, `${pathStr}[${i}]`, where, walked))
      return
    }
    for (const [k, v] of Object.entries(node)) scanAssetPaths(v, pathStr ? `${pathStr}.${k}` : k, where, walked)
  }

  for (const [, event] of seen) {
    const label = labelOf ? labelOf(event.id) : 'pool'
    const where = `${label} · ${event.id}「${String(event.title || '').slice(0, 16)}」`

    scanConditionValues(event.conditions, 'conditions', where)
    scanAssetPaths(event, '', where, new Set())

    for (const ch of event.choices || []) {
      if (!ch || typeof ch !== 'object') continue
      const cw = `${where} / 选项 ${ch.id || '(无 id)'}`
      scanConditionValues(ch.showConditions, 'showConditions', cw)
      if (ch.storyline && !vocab.storylines.has(ch.storyline)) {
        add('NOOP', cw, `choice.storyline='${ch.storyline}' 不在 STORYLINES（共 ${vocab.storylines.size} 条）—— 切换过去之后没有任何剧情线与之对应，加权与面板都查不到`)
      }
    }

    if (event.storyline && !vocab.storylines.has(event.storyline)) {
      add('NOOP', where, `storyline='${event.storyline}' 不在 STORYLINES（共 ${vocab.storylines.size} 条）—— 同 storyline 加权 4 倍这条永不生效`)
    }

    // prelude ↔ ending 是一对互相指认的关系，但运行时只认 isPreEnding。
    // 所以这里既查悬空（指向不存在的 id），也查单向（对面没回指），还查那个真正决定行为的标记。
    if (event.linksToEndingId) {
      const target = vocab.endingsById.get(event.linksToEndingId)
      if (!target) {
        add('LINK', where, `linksToEndingId='${event.linksToEndingId}' 在结局池里不存在（结局共 ${vocab.endingsById.size} 个）`)
      } else {
        const back = target.endingConfig?.preludeEventId
        if (back !== event.id) {
          add('LINK', where, `指向结局 ${target.id}，但该结局的 endingConfig.preludeEventId=${JSON.stringify(back)} 没有回指本事件 —— 配对只写了单向`)
        }
        if (!event.isPreEnding) {
          add('NOOP', where, `是 ${target.id} 的前奏却没有 isPreEnding —— 引擎按 isPreEnding 决定强制优先播放，linksToEndingId 本身运行时不读`)
        }
      }
    }
    const preludeId = event.endingConfig?.preludeEventId
    if (preludeId) {
      const prelude = vocab.eventsById.get(preludeId)
      if (!prelude) {
        add('LINK', where, `endingConfig.preludeEventId='${preludeId}' 在事件全集里不存在 —— 结局以为自己有前奏，排期排到一个空 id`)
      } else if (prelude.linksToEndingId !== event.id) {
        add('LINK', where, `preludeEventId='${preludeId}'，但该事件的 linksToEndingId=${JSON.stringify(prelude.linksToEndingId)} 没有指回本结局 —— 配对只写了单向`)
      }
    }
  }

  return findings
}

const vocab = buildVocab(allEvents, endings)
const order = ['DEAD', 'NOOP', 'LINK']

/** 六个事件池合并去重后的值域结论（测试和 CLI 用的都是这一份） */
export const valueDomains = {
  total: vocab.eventsById.size,
  vocab,
  findings: scanValueDomains(allEvents, vocab, labelOfPool)
}

// 同 audit-event-shape：vite-node 会吃掉 argv，判断"我是不是入口"只能靠 vitest 注入的 VITEST。
if (!process.env.VITEST) {
  console.log(`事件总数（去重）: ${valueDomains.total}`)
  console.log(`词表规模：出身 ${vocab.origins.size} / 官阶 ${vocab.ranks.size} / 剧情线 ${vocab.storylines.size} / 结局 ${vocab.endingsById.size} / 开局年 ${vocab.startYear}\n`)
  for (const kind of order) {
    const list = valueDomains.findings.filter(f => f.kind === kind)
    console.log(`=== ${kind}：${list.length} 处 ===`)
    list.slice(0, 40).forEach(f => console.log(`  ${f.where}\n      ${f.detail}`))
    if (list.length > 40) console.log(`  …另有 ${list.length - 40} 处`)
    console.log('')
  }
  console.log(`合计 ${valueDomains.findings.length} 处`)
}
