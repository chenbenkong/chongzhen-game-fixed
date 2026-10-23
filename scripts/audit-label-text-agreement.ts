/**
 * 标签—正文一致性体检（第五十轮）。
 *
 * 口径：一个选项的 `text` 里的【标签】是玩家做决定时唯一能看见的承诺。标签说「拒绝」，
 * 正文却写「先享用一番」，玩家按标签点的，拿到的是另一回事 —— 这不是文笔问题，是**选项失效**：
 * 面板上四个选项实际指向两种行为，取舍是假的。
 *
 * 判定两头取严：
 *  - `LABEL` 认「拒绝 / 辞 / 不越 / 克制 / 君子 / 严词 / 揭穿 / 上报 / 只升官」这类**拒色守礼**的姿态词，
 *    只看 `text`（标签 + 首句），不看正文 —— 正文本来就允许叙述拒绝之后的余波。
 *    四个 `(?<!不)` / `(?<!未曾)` 之类的前瞻是为了放过「本官也不好拒绝」「难以辞谢」这种
 *    **反向**表述：那属于收下的语境，不该被当成守礼标签来核对。
 *  - `BODY` 认「享用 / 抱上了床 / 抽送 / 高潮 / 云雨 / 枕席 / 同榻」这类**实际发生了性事**的描写，
 *    读 `description` + `result.echo`。
 *
 * 命中即冲突。修法只有两条：改标签（承认这是伪君子线，得同步调隐藏数值）或**改正文**（让叙述兑现标签）。
 * 第五十轮走的是后者 —— 这 19 处原有奖励本来就按「守礼」给（道德+20、清议+15、欲望−10），
 * 动标签等于要把约 20 处已钉读数重抄；动正文零数值、零门禁、零 flags。
 *
 * 输出既是 CLI 报告，也是 `tests/unit/audit.labelText.test.ts` 的棘轮。
 * 新事件写完先跑 `npm run audit:label-text`；把 `conflicts` 从 0 顶回去的提交不予合并。
 */
import { pools, poolOf } from './event-pools'

export interface LabelTextConflictRow {
  eventId: string
  choiceId: string
  eventTitle: string
  pool: string
  label: string
  bodyMarkers: string[]
}

export interface LabelTextReport {
  events: number
  choices: number
  labeled: number
  conflicts: LabelTextConflictRow[]
}

const LABEL =
  /(?<!不好)(?<!难以)(?<!不忍)(?<!不愿)(?<!未曾)拒绝|(?<!不)辞|不越|点到为止|克制|君子|严词|严拒|驱逐|揭穿|发现阴谋|设局|上报|资助|义亲|商业合作|只升官|不纳妾|让妻|归其夫/

const BODY = /享用|抱上了床|翻云覆雨|抽送|高潮|云雨|枕席|同榻|宽衣解带/

export function scanLabelTextAgreements(): LabelTextReport {
  const seen = new Map<string, any>()
  for (const [, events] of pools) {
    for (const e of events) if (e?.id && !seen.has(e.id)) seen.set(e.id, e)
  }

  const conflicts: LabelTextConflictRow[] = []
  let choices = 0
  let labeled = 0

  for (const e of seen.values()) {
    for (const c of e.choices ?? []) {
      choices++
      const text: string = c.text ?? ''
      if (!LABEL.test(text)) continue
      labeled++

      const hay = `${c.description ?? ''}\n${(c.result as any)?.echo ?? ''}`
      const hit = [...hay.matchAll(new RegExp(BODY, 'g'))].map(m => m[0])
      if (!hit.length) continue

      conflicts.push({
        eventId: e.id,
        choiceId: c.id,
        eventTitle: e.title,
        pool: poolOf.get(e.id) ?? '?',
        label: text,
        bodyMarkers: [...new Set(hit)]
      })
    }
  }

  return { events: seen.size, choices, labeled, conflicts }
}

if (!process.env.VITEST) {
  const r = scanLabelTextAgreements()
  console.log('=== 标签—正文一致性体检（守礼标签不得配实录性事正文）===')
  console.log(
    `去重事件 ${r.events} 条 · 选项 ${r.choices} 项 · 其中守礼标签 ${r.labeled} 项`
  )
  console.log(`标签与正文打架：${r.conflicts.length}`)
  for (const x of r.conflicts) {
    console.log(
      `  ${x.pool.padEnd(6)} ${x.eventId} ${x.choiceId}「${x.eventTitle}」 ${x.label.slice(0, 40)}`
    )
    console.log(`      正文命中：${x.bodyMarkers.join(' / ')}`)
  }
}
