import { transitionEvents } from '../src/data/events/index'
import type { GameEvent } from '../src/types/event'

/**
 * 支线“生硬”体检。
 *
 * 生硬不是文风问题，是两个可以静态数出来的东西：
 *  1. 同一句选项文案被复制到很多事件里 —— 玩家看到的不是这个处境里的选择，
 *     而是一张换皮菜单。第三十五轮把最长的一条（静观其变）从 12 个事件压到 5 个。
 *  2. `【标签】"当……"` 这种自我旁白 —— 选项替玩家把道理讲完了，玩家只是在选立场。
 *
 * 这里只负责找，不负责判。阈值放在测试里，方便下一轮继续往下压。
 */
export const MENU_REPEAT_LIMIT = 6

export interface BranchFinding {
  kind: 'repeated-menu' | 'self-narration'
  where: string
  detail: string
}

export interface BranchAudit {
  findings: BranchFinding[]
  choices: number
  selfNarration: number
  repeatedMenus: Array<{ text: string; events: string[] }>
}

const SELF_NARRATION = /^【[^】]+】\s*["“]\s*当/

export function scanBranching(events: GameEvent[]): BranchAudit {
  const byText = new Map<string, Set<string>>()
  const findings: BranchFinding[] = []
  let choices = 0
  let selfNarration = 0

  for (const e of events) {
    for (const c of e.choices ?? []) {
      choices++
      const text = c.text.trim()
      const ids = byText.get(text) ?? new Set<string>()
      ids.add(e.id)
      byText.set(text, ids)

      if (SELF_NARRATION.test(text)) {
        selfNarration++
        findings.push({
          kind: 'self-narration',
          where: `${e.id}（type:${e.type}）`,
          detail: text
        })
      }
    }
  }

  const repeatedMenus = [...byText.entries()]
    .filter(([, ids]) => ids.size >= MENU_REPEAT_LIMIT)
    .map(([text, ids]) => ({ text, events: [...ids] }))
    .sort((a, b) => b.events.length - a.events.length)

  for (const menu of repeatedMenus) {
    findings.push({
      kind: 'repeated-menu',
      where: menu.events.join('、'),
      detail: `${menu.events.length} 个事件共用同一句：${menu.text}`
    })
  }

  return { findings, choices, selfNarration, repeatedMenus }
}

// 与其余体检脚本同一口径：被测试 import 时不打印
if (!process.env.VITEST) {
  const audit = scanBranching(transitionEvents)
  console.log(`支线自然度体检：过渡选项 ${audit.choices} 条，自我旁白 ${audit.selfNarration} 条，重复菜单 ${audit.repeatedMenus.length} 套`)
  for (const m of audit.repeatedMenus) {
    console.log(`  ${m.events.length}× ${m.text} → ${m.events.join('、')}`)
  }
  if (audit.repeatedMenus.length) process.exitCode = 1
}
