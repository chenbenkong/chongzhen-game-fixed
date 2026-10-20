/**
 * 高度链守卫 —— 事件面板这条纵向 flex 链上，谁都不许再被"无条件 min-height:auto"顶回去。
 *
 * 第二十九轮的两个缺陷都不是写错了一处，而是**后面一条规则把前面一条悄悄覆盖掉**：
 *   · `GameScreen.css` 第 83 行 `.main-content{min-height:0}`，文件末尾又有一条
 *     无条件的 `.main-content{min-height:auto}`（注释还写着"允许 1fr 轨道被压缩"）。
 *     实测 1280×600：`.game-main` clientHeight=500 而 `.main-content` 被顶到 678，
 *     超出的 178px 由 `.game-main{overflow:hidden}` 静默裁掉，事件「寒窗苦读」
 *     三张选项卡只露出两张，第三张 top=673 在盒外；`.event-display` 自己
 *     scrollHeight==clientHeight，所以滚动条也不出现 —— 玩家"下滑也没有内容"。
 *   · `EventDisplay.css` 的 `.result-section` 自带 `max-height: min(520px,100dvh-180px)`
 *     + `overflow-y:auto`，是"整页顶高"年代留下的内层滚动。面板自己能滚之后它成了
 *     第二个抢高度的滚动盒：实测 1280×800 + 根字号 165%，面板 clientHeight=533、
 *     `.narrative-section` 占 412，留给结算区的只有 **7px**（内容 531px），
 *     「继 续」按钮 top=1068、中心点被 `.narrative-section` 盖住。
 *
 * 几何本身只有真实浏览器量得出来（`tests/choices-visibility.mjs`，5 档视口 × 2 档字号；
 * jsdom 不算 flexbox，所以本文件**不是**几何测试）。这里钉的是它的**成因**：
 * 链上每一层的 min-height 只能由媒体查询改写，不许再出现无条件覆盖；
 * 结算区不许再变回嵌套滚动盒。谁改回去，CI 当场红，不用等到玩家报"选项看不见"。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseCss, type CssRule } from './helpers/cssRules'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const gameScreen = parseCss(readFileSync(at('../../src/components/GameScreen.css'), 'utf8'))
const eventDisplay = parseCss(readFileSync(at('../../src/components/EventDisplay.css'), 'utf8'))

/** 找出所有对某选择器声明了某属性的规则 */
function decl(rules: CssRule[], selector: string, prop: string) {
  return rules.filter(r => r.selector === selector && r.decls.has(prop))
}

describe('第二十九轮：事件面板的高度链不许被无条件覆盖', () => {
  it('.main-content 的 min-height 只能是 0，且只有媒体查询能改它', () => {
    const hits = decl(gameScreen, '.main-content', 'min-height')
    expect(hits.length, '链断了：.main-content 上没有 min-height 声明').toBeGreaterThan(0)
    for (const h of hits) {
      if (h.inMedia) continue
      expect(h.decls.get('min-height'), '无条件 min-height 会把中间列顶回内容高，选项被 .game-main 裁掉').toBe('0')
    }
    expect(
      hits.filter(h => h.inMedia === null).map(h => h.decls.get('min-height')),
      '基础规则必须明写 min-height:0（flex/grid 项默认 auto 会拒绝收缩）'
    ).toContain('0')
  })

  it('.event-display 自己也不许写成 min-height:auto', () => {
    const hits = decl(eventDisplay, '.event-display', 'min-height')
    expect(hits.length, '.event-display 丢了 min-height:0，面板不再吃满列高').toBeGreaterThan(0)
    for (const h of hits) {
      if (h.inMedia) continue
      expect(h.decls.get('min-height'), '面板必须能收缩，否则内部滚动条永远不出现').toBe('0')
    }
    const base = hits.find(h => h.inMedia === null)
    expect(base?.decls.get('overflow-y'), '面板是唯一的滚动容器').toBe('auto')
    expect(base?.decls.get('flex'), '面板靠 flex:1 吃满 .main-content 透传的高度').toBe('1')
  })

  it('.game-main 与 .game-screen-body 保持可收缩（min-height:0 + overflow 由自己滚）', () => {
    const main = gameScreen.filter(r => r.selector === '.game-main' && r.inMedia === null)[0]
    expect(main?.decls.get('min-height')).toBe('0')
    expect(main?.decls.get('overflow'), '裁切层：内容超高时必须由面板内部滚动兜住，不能溢出到它身上').toBe('hidden')
    const body = gameScreen.filter(r => r.selector === '.game-screen-body' && r.inMedia === null)[0]
    expect(body?.decls.get('min-height')).toBe('0')
  })

  it('.result-section 不许再当嵌套滚动盒（结算页被挤成 7px 的成因）', () => {
    const hits = eventDisplay.filter(r => r.selector === '.result-section')
    expect(hits.length, '找不到 .result-section 规则').toBeGreaterThan(0)
    for (const h of hits) {
      expect(h.decls.get('overflow-y'), '结算区必须跟着外层面板一起滚，不能再自己滚').toBeUndefined()
      expect(h.decls.get('max-height'), '结算区不许设高度上限，否则会被 narrative-section 挤没').toBeUndefined()
      if (h.decls.has('flex')) {
        expect(h.decls.get('flex'), 'flex 必须是 0 0 auto：不参与剩余高度分配').toBe('0 0 auto')
      }
    }
  })

  it('链上每一层的声明都还在（有人删掉整条规则时给个明确信号）', () => {
    for (const sel of ['.game-screen', '.game-screen-body', '.game-main', '.main-content']) {
      expect(gameScreen.some(r => r.selector === sel), `${sel} 的规则被删了 —— 高度链断在这一层`).toBe(true)
    }
    expect(eventDisplay.some(r => r.selector === '.event-display')).toBe(true)
  })
})
