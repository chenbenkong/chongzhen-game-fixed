import {
  historicalEvents,
  transitionEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
// 结局数据刻意不从 barrel 导出（它会把 81 KB 拖回首屏模块图），
// 体检脚本要读它就按路径直取。
import { allEndingEvents } from '../src/data/events/ending'
import { GameEvent } from '../src/types/event'

interface NarrativeIssue {
  eventId: string
  eventTitle: string
  category: string
  type: string
  message: string
  length?: number
}

function auditNarrative(event: GameEvent, category: string): NarrativeIssue[] {
  const issues: NarrativeIssue[] = []
  const base = { eventId: event.id, eventTitle: event.title, category }

  if (!event.narrative) {
    issues.push({ ...base, type: '缺叙事', message: '事件未定义 narrative' })
    return issues
  }

  if (!event.narrative.background || event.narrative.background.trim().length < 30) {
    issues.push({
      ...base,
      type: '背景过短',
      message: `narrative.background 过短（${event.narrative.background?.length || 0} 字符）`,
      length: event.narrative.background?.length
    })
  }

  if (!event.narrative.situation || event.narrative.situation.trim().length < 10) {
    issues.push({
      ...base,
      type: '情境过短',
      message: `narrative.situation 过短（${event.narrative.situation?.length || 0} 字符）`,
      length: event.narrative.situation?.length
    })
  }

  if (!event.narrative.quote || event.narrative.quote.trim().length < 5) {
    issues.push({
      ...base,
      type: '缺少引语',
      message: 'narrative.quote 缺失或过短',
      length: event.narrative.quote?.length
    })
  }

  return issues
}

function report(name: string, events: GameEvent[]) {
  let allIssues: NarrativeIssue[] = []
  for (const event of events) {
    allIssues.push(...auditNarrative(event, name))
  }

  const grouped = new Map<string, NarrativeIssue[]>()
  for (const issue of allIssues) {
    const list = grouped.get(issue.type) || []
    list.push(issue)
    grouped.set(issue.type, list)
  }

  console.log(`\n${name}: 共 ${allIssues.length} 处叙事问题`)
  for (const [type, issues] of grouped) {
    console.log(`  [${type}] ${issues.length} 处`)
    for (const issue of issues.slice(0, 5)) {
      console.log(`    [${issue.eventId}] ${issue.eventTitle}: ${issue.message}`)
    }
    if (issues.length > 5) {
      console.log(`    ... 还有 ${issues.length - 5} 处同类问题`)
    }
  }

  return allIssues.length
}

let total = 0
total += report('历史事件', historicalEvents)
total += report('过渡事件', transitionEvents)
total += report('灰色支线', allGrayChoiceEvents)
total += report('结局事件', allEndingEvents)
total += report('情感事件', emotionEvents)

console.log(`\n总计发现叙事问题: ${total} 处`)
