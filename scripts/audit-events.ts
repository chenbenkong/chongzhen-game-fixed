import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
// 结局数据刻意不从 barrel 导出（它会把 81 KB 拖回首屏模块图），
// 体检脚本要读它就按路径直取。
import { allEndingEvents } from '../src/data/events/ending'
import { GameEvent, EventChoice } from '../src/types/event'

interface AuditIssue {
  eventId: string
  eventTitle: string
  choiceId?: string
  choiceText?: string
  type: string
  message: string
}

// 全局去重后的事件集合（initialEvents 已包含 historical/transition/emotion，避免重复统计）
const eventSet = new Map<string, GameEvent>()
for (const event of [
  ...historicalEvents,
  ...transitionEvents,
  ...allGrayChoiceEvents,
  ...allEndingEvents,
  ...emotionEvents
]) {
  eventSet.set(event.id, event)
}
const allEvents = Array.from(eventSet.values())

function auditEvent(event: GameEvent): AuditIssue[] {
  const issues: AuditIssue[] = []

  if (!event.title || event.title.trim() === '') {
    issues.push({ eventId: event.id, eventTitle: event.title || '(无标题)', type: '空标题', message: '事件 title 为空' })
  }

  if (event.description === undefined || event.description === null) {
    issues.push({ eventId: event.id, eventTitle: event.title, type: '缺描述', message: '事件 description 未定义' })
  }

  if (!event.narrative) {
    issues.push({ eventId: event.id, eventTitle: event.title, type: '缺叙事', message: '事件 narrative 未定义' })
  } else {
    if (!event.narrative.background || event.narrative.background.trim() === '') {
      issues.push({ eventId: event.id, eventTitle: event.title, type: '空背景', message: 'narrative.background 为空' })
    }
    if (!event.narrative.situation || event.narrative.situation.trim() === '') {
      issues.push({ eventId: event.id, eventTitle: event.title, type: '空情境', message: 'narrative.situation 为空' })
    }
  }

  if (!event.conditions) {
    issues.push({ eventId: event.id, eventTitle: event.title, type: '缺条件', message: '事件 conditions 未定义' })
  } else {
    const { year, month } = event.conditions
    if (year && year.min !== undefined && year.max !== undefined && year.min > year.max) {
      issues.push({ eventId: event.id, eventTitle: event.title, type: '条件矛盾', message: `年份条件 min(${year.min}) > max(${year.max})` })
    }
    if (month && month.min !== undefined && month.max !== undefined && month.min > month.max) {
      issues.push({ eventId: event.id, eventTitle: event.title, type: '条件矛盾', message: `月份条件 min(${month.min}) > max(${month.max})` })
    }
  }

  if (!event.choices || event.choices.length === 0) {
    issues.push({ eventId: event.id, eventTitle: event.title, type: '缺选项', message: '事件没有 choices' })
  } else {
    for (const choice of event.choices) {
      issues.push(...auditChoice(event, choice))
    }
  }

  return issues
}

function auditChoice(event: GameEvent, choice: EventChoice): AuditIssue[] {
  const issues: AuditIssue[] = []
  const base = { eventId: event.id, eventTitle: event.title, choiceId: choice.id, choiceText: choice.text.slice(0, 30) }

  if (!choice.text || choice.text.trim() === '') {
    issues.push({ ...base, type: '空选项文本', message: 'choice.text 为空' })
  }

  if (!choice.effects) {
    issues.push({ ...base, type: '缺效果', message: 'choice.effects 未定义' })
  } else {
    const hasAnyEffect =
      (choice.effects.attributes && Object.keys(choice.effects.attributes).length > 0) ||
      (choice.effects.gameState && Object.keys(choice.effects.gameState).length > 0) ||
      (choice.effects.hidden && Object.keys(choice.effects.hidden).length > 0) ||
      (choice.effects.flags && (choice.effects.flags.add?.length || choice.effects.flags.remove?.length)) ||
      choice.effects.special ||
      choice.effects.meritScore !== undefined

    if (!hasAnyEffect) {
      issues.push({ ...base, type: '空效果', message: 'choice.effects 没有任何效果' })
    }
  }

  if (!choice.result) {
    issues.push({ ...base, type: '缺结果', message: 'choice.result 未定义' })
  } else {
    if (!choice.result.echo || choice.result.echo.trim() === '') {
      issues.push({ ...base, type: '空回响', message: 'choice.result.echo 为空' })
    }
    if (!choice.result.tags || choice.result.tags.length === 0) {
      issues.push({ ...base, type: '缺标签', message: 'choice.result.tags 为空' })
    }
  }

  return issues
}

function report(name: string, events: GameEvent[]) {
  let allIssues: AuditIssue[] = []
  for (const event of events) {
    allIssues.push(...auditEvent(event))
  }

  const grouped = new Map<string, AuditIssue[]>()
  for (const issue of allIssues) {
    const list = grouped.get(issue.type) || []
    list.push(issue)
    grouped.set(issue.type, list)
  }

  console.log(`\n${name}: 共 ${allIssues.length} 处问题`)
  for (const [type, issues] of grouped) {
    console.log(`  [${type}] ${issues.length} 处`)
    for (const issue of issues.slice(0, 5)) {
      const choiceInfo = issue.choiceId ? ` / ${issue.choiceId} "${issue.choiceText}"` : ''
      console.log(`    [${issue.eventId}] ${issue.eventTitle}${choiceInfo}: ${issue.message}`)
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
total += report('初始事件池', initialEvents)
total += report('灰色支线', allGrayChoiceEvents)
total += report('结局事件', allEndingEvents)
total += report('情感事件', emotionEvents)

// 全局重复 ID 检查
const idCounts = new Map<string, number>()
for (const event of allEvents) {
  idCounts.set(event.id, (idCounts.get(event.id) || 0) + 1)
}
const duplicates = [...idCounts.entries()].filter(([_, count]) => count > 1)
if (duplicates.length > 0) {
  console.log(`\n全局: 发现 ${duplicates.length} 个重复事件 ID`)
  for (const [id, count] of duplicates) {
    console.log(`  ${id}: 出现 ${count} 次`)
  }
  total += duplicates.length
}

console.log(`\n总计发现问题: ${total} 处`)
