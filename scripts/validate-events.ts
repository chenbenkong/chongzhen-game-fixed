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
import { Attributes } from '../src/types/game'

const ATTR_KEYS = ['财帛', '文韬', '理政', '武略', '体质'] as const
const HIDDEN_KEYS = ['道德值', '欲望值', '野心值', '机敏值', '忠诚值'] as const
const STATE_KEYS = ['圣眷', '中官', '清议', '士绅', '民望', '国势'] as const

// 标签中的简写映射到数据字段名
const TAG_TO_DATA_KEY: Record<string, string> = {
  道德: '道德值',
  欲望: '欲望值',
  野心: '野心值',
  机敏: '机敏值',
  忠诚: '忠诚值',
  // 灰色支线中的旧版状态标签映射到当前五方态度
  商贾: '士绅',
  安全: '中官',
  军事: '国势',
  文化: '清议',
  军心: '国势',
  权势: '圣眷'
}

function resolveTagKey(tagKey: string): string {
  return TAG_TO_DATA_KEY[tagKey] ?? tagKey
}

function parseTag(tag: string): { key: string; value: number } | null {
  const match = tag.match(/^(.+?)([+-]\d+)$/)
  if (!match) return null
  return { key: match[1], value: parseInt(match[2], 10) }
}

function getEffectValue(choice: EventChoice, key: string): number | undefined {
  const dataKey = resolveTagKey(key)
  if ((ATTR_KEYS as readonly string[]).includes(dataKey)) {
    return choice.effects.attributes?.[dataKey as keyof Attributes]
  }
  if ((HIDDEN_KEYS as readonly string[]).includes(dataKey)) {
    return choice.effects.hidden?.[dataKey as '道德值' | '欲望值' | '野心值' | '机敏值' | '忠诚值']
  }
  if ((STATE_KEYS as readonly string[]).includes(dataKey)) {
    return choice.effects.gameState?.[dataKey as '圣眷' | '中官' | '清议' | '士绅' | '民望' | '国势']
  }
  return undefined
}

interface Issue {
  file?: string
  eventId: string
  eventTitle: string
  choiceId: string
  choiceText: string
  tag: string
  expectedValue: number
  actualValue: number | undefined
}

function collectIssues(events: GameEvent[]): Issue[] {
  const issues: Issue[] = []
  for (const event of events) {
    for (const choice of event.choices) {
      const tags = choice.result?.tags || []

      // 汇总所有标签的期望值（多个标签可能映射到同一数据字段）
      const tagTotals = new Map<string, number>()
      const tagExamples = new Map<string, string>()
      for (const tag of tags) {
        const parsed = parseTag(tag)
        if (!parsed) continue
        const dataKey = resolveTagKey(parsed.key)
        if (!isKnownKey(dataKey)) continue
        tagTotals.set(dataKey, (tagTotals.get(dataKey) || 0) + parsed.value)
        if (!tagExamples.has(dataKey)) {
          tagExamples.set(dataKey, tag)
        }
      }

      // 对比每个数据字段的期望值与实际值
      for (const [dataKey, expectedValue] of tagTotals) {
        const actual = getEffectValue(choice, dataKey)
        if (actual === undefined) {
          issues.push({
            eventId: event.id,
            eventTitle: event.title,
            choiceId: choice.id,
            choiceText: choice.text.slice(0, 30),
            tag: tagExamples.get(dataKey) || dataKey,
            expectedValue,
            actualValue: undefined
          })
        } else if (Math.abs(actual - expectedValue) > 0.001) {
          issues.push({
            eventId: event.id,
            eventTitle: event.title,
            choiceId: choice.id,
            choiceText: choice.text.slice(0, 30),
            tag: tagExamples.get(dataKey) || dataKey,
            expectedValue,
            actualValue: actual
          })
        }
      }
    }
  }
  return issues
}

function isKnownKey(key: string): boolean {
  return (
    (ATTR_KEYS as readonly string[]).includes(key) ||
    (HIDDEN_KEYS as readonly string[]).includes(key) ||
    (STATE_KEYS as readonly string[]).includes(key)
  )
}

function report(name: string, events: GameEvent[]) {
  const issues = collectIssues(events)
  if (issues.length === 0) {
    console.log(`\n${name}: 未发现问题`)
    return
  }
  console.log(`\n${name}: 发现 ${issues.length} 处不一致`)
  for (const issue of issues) {
    const actualText = issue.actualValue === undefined ? '未设置' : `${issue.actualValue}`
    console.log(
      `  [${issue.eventId}] ${issue.eventTitle} / ${issue.choiceId} "${issue.choiceText}"` +
      `  综合标签 "${issue.tag}" 期望 ${issue.expectedValue}，实际 ${actualText}`
    )
  }
}

report('历史事件', historicalEvents)
report('过渡事件', transitionEvents)
report('初始事件池', initialEvents)
report('灰色支线', allGrayChoiceEvents)
report('结局事件', allEndingEvents)
report('情感事件', emotionEvents)
