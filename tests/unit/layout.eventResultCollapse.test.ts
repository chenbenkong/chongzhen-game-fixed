import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseCss, baseRules } from './helpers/cssRules'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// 手机端结算态会隐藏 event-header 与 narrative-section，只保留插图、已选选项、
// 效果与回音。桌面端此前仍把整篇正文重播一遍；这条源文本守卫防止规则被删回去。
describe('桌面事件结算态与手机对齐', () => {
  it('show-result 下隐藏事件标题与整篇正文', () => {
    const rules = parseCss(readFileSync(at('../../src/components/EventDisplay.css'), 'utf8'))
    const collapse = baseRules(
      rules,
      '.event-display.show-result .event-header, .event-display.show-result .narrative-section'
    )
    expect(collapse.length).toBeGreaterThan(0)
    expect(collapse[collapse.length - 1].decls.get('display')).toBe('none')
  })
})
