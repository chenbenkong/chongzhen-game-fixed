import { allEvents } from './event-pools'
import { allEndingEvents } from '../src/data/events/ending'
import { ENDING_TILE_IDS } from '../src/data/endingRegistry'
import type { GameEvent } from '../src/types/event'

/**
 * 玩家可见正文体检（第七十轮）。
 *
 * 第五十三轮（§1.4 ㉝）收掉的是**结局图鉴卡片**上那行机器 id —— 那是界面拼的。
 * 这一轮收的是**数据里写死的**机器 id：`result.echo` 与 `description` 会被
 * `EventDisplay.tsx` 的【回音】框原样印出来，于是 `ending_border_general` 这种字符串
 * 就直接出现在玩家眼前（实测 44 处 / 17 个事件）。
 *
 * 两条规矩：
 *  1. `机器id` —— 正文里出现任何真实存在的事件/结局 id 字样（`ending_*`、`triggerable_*`、
 *     `route_*`、`transition_*` 之类）。界面自己会拼 id，正文不该跟着拼。
 *  2. `虚指命途` —— 正文用「《X》一路 / 《X》那一格 / 归入《X》」这种**指命途**的句式时，
 *     X 必须是图鉴里真有的格子。旧数据里 4 个 id（`ending_hermit_teaching` 等）
 *     在盘面上根本没有对应结局，等于回音承诺了一个不存在的结局。
 *     书名也用《》，所以这条只认带指命途语境的句式；实测全库零误报。
 */

export interface ProseFinding {
  kind: '机器id' | '虚指命途'
  where: string
  detail: string
}

/** 指命途的句式：《X》前后出现这些词，就是在报一个结局名 */
const FATE_MENTION = /(?:《([^》\n]{2,6})》\s*(?:那一格|那格|一路|两路|三路|的凭据|便有了|就此)|归入《([^》\n]{2,6})》|记入《([^》\n]{2,6})》|通向《([^》\n]{2,6})》|认的(?:是)?《([^》\n]{2,6})》|够上《([^》\n]{2,6})》|压在《([^》\n]{2,6})》|算(?:作?)?《([^》\n]{2,6})》|引导《([^》\n]{2,6})》|解锁《([^》\n]{2,6})》|走向《([^》\n]{2,6})》)/g

const MACHINE_TOKEN = /[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+/g
const MACHINE_PREFIX = /^(?:ending|triggerable|route|transition|gray|prelude|historical|emotion|daily)_/

/** 只走这些字段：其余字段要么不给玩家看，要么本来就该写 id */
const EVENT_FIELDS = ['title', 'description'] as const
const NARRATIVE_FIELDS = ['quote', 'background', 'situation'] as const
const CHOICE_FIELDS = ['text', 'description', 'resultDescription'] as const
const RESULT_FIELDS = ['title', 'echo'] as const

export function scanProse(events: GameEvent[]): { findings: ProseFinding[]; strings: number } {
  const ids = new Set<string>()
  for (const e of allEvents) ids.add(e.id)
  for (const id of ENDING_TILE_IDS) ids.add(id)
  const tileTitles = new Set(allEndingEvents.map(e => e.title))

  const findings: ProseFinding[] = []
  let strings = 0

  const check = (where: string, text: string | undefined) => {
    if (typeof text !== 'string' || !text) return
    strings++
    for (const token of text.match(MACHINE_TOKEN) || []) {
      if (ids.has(token) || MACHINE_PREFIX.test(token)) {
        findings.push({ kind: '机器id', where, detail: `正文里印出机器 id「${token}」` })
      }
    }
    for (const m of text.matchAll(FATE_MENTION)) {
      const name = m.slice(1).find(Boolean) as string
      if (!tileTitles.has(name)) {
        findings.push({ kind: '虚指命途', where, detail: `正文把《${name}》当命途指给玩家，图鉴里没有这一格` })
      }
    }
  }

  for (const e of events) {
    for (const f of EVENT_FIELDS) check(`${e.id}.${f}`, (e as any)[f])
    for (const f of NARRATIVE_FIELDS) check(`${e.id}.narrative.${f}`, (e.narrative as any)?.[f])
    for (const [i, c] of (e.choices ?? []).entries()) {
      const at = `${e.id}.choices[${i}]`
      for (const f of CHOICE_FIELDS) check(`${at}.${f}`, (c as any)[f])
      for (const f of RESULT_FIELDS) check(`${at}.result.${f}`, (c.result as any)?.[f])
      for (const [j, t] of (c.result?.tags ?? []).entries()) check(`${at}.result.tags[${j}]`, t)
    }
  }
  return { findings, strings }
}

// 与其余体检脚本同一口径：被测试 import 时不打印
if (!process.env.VITEST) {
  const { findings, strings } = scanProse(allEvents as unknown as GameEvent[])
  const byKind = new Map<string, number>()
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1)
  console.log(`正文体检：扫了 ${strings} 段玩家可见文本，问题 ${findings.length} 处（${[...byKind].map(([k, v]) => `${k} ${v}`).join('、') || '干净'}）`)
  for (const f of findings) console.log(`  [${f.kind}] ${f.where} —— ${f.detail}`)
  if (findings.length) process.exitCode = 1
}
