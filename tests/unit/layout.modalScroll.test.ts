/**
 * 遮罩层守卫 —— 每一个全屏弹窗的控件，玩家都必须"滚得到"。
 *
 * 第三十轮实测（1280×600 + 根字号 165%，帮助弹窗第 1 步）：
 *   `.tutorial-modal` 没有高度上限，按内容长到 706px；`.tutorial-overlay` 是
 *   `display:flex + align-items:center` 的全屏固定层，居中把超出的部分**同时**顶到
 *   上下两端之外 —— 「关闭 ×」到 top=-41（视口外，且上面没有可滚的容器）、「跳过教程」
 *   到 bottom=616。遮罩自己 `overflow:visible`、`body` 是 `overflow:hidden`，
 *   所以整屏没有任何"玩家滚得动"的东西：教程既关不掉也跳不过。
 *   修好之后同一处：面板 rect 20..580（视口 600）、clientH=556、scrollH=700~911、
 *   overflowY:auto —— 内容还是那么长，但归属变成"面板内部可滚"。
 *
 * 同一族成因在仓库里另有 12 个遮罩：面板封顶（vh）+ 面板自己滚或内部滚动区，
 * 三者至少要有一个，否则就是同一个 bug 的另一种写法。这里按文件把每个遮罩**分类登记**，
 * 每类各有源文本判据（见 check）；几何本身由真浏览器那份钉子负责
 * （`tests/modals-reachability.mjs`，jsdom 不算 flexbox，本文件不是几何测试）。
 *
 * 两条棘轮：
 *   · 新写一个全屏遮罩却没在这里登记 → 红（fullScreenOverlays 扫 src/components/*.css）；
 *   · `unmeasured`（够不到、没法实测的屏，例如要撞「条件不足」才开的骰子弹窗）只许减少不许增加。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseCss, baseDecl, baseRules, fullScreenOverlays, type CssRule } from './helpers/cssRules'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const SCROLL = /^(auto|scroll)$/
const VH = /(vh|dvh)/

type Pattern =
  | 'strict' // 遮罩自己滚 + 面板有 vh 上限 + min-height:0 + 面板自己滚（本轮修的那一个）
  | 'panel-scrolls' // 面板 vh 上限 + 面板自己滚
  | 'inner-scroll' // 面板 vh 上限 + 面板 overflow:hidden + 内部滚动区 flex:1 overflow-y:auto
  | 'drawer' // 面板 height:100%（贴边抽屉）+ 内部滚动区
  | 'overlay-scrolls' // 遮罩自己滚，内容从顶部起排
  | 'capped-child' // 唯一会长的子项 max-height:100%
  | 'no-controls' // 这层上没有可交互控件（点遮罩即关的提示条）
  | 'unmeasured' // 常规玩法够不到、本轮没法实测（骰子弹窗，要撞「条件不足」）

interface Row {
  file: string
  overlay: string
  panel: string | null
  innerScroll?: string
  pattern: Pattern
  note: string
}

const ROWS: Row[] = [
  {
    file: 'TutorialModal.css', overlay: '.tutorial-overlay', panel: '.tutorial-modal',
    pattern: 'strict', note: '第三十轮修的缺陷：706px 的教程面板顶穿 600px 视口'
  },
  {
    file: 'ConfirmDialog.css', overlay: '.cd-overlay', panel: '.cd-panel', innerScroll: '.cd-body',
    pattern: 'inner-scroll', note: '辞官/焚档确认框，正文长度由事件文案决定'
  },
  {
    file: 'EventDisplay.css', overlay: '.dice-modal-overlay', panel: '.dice-modal',
    pattern: 'unmeasured', note: '骰子弹窗：面板无上限、遮罩不滚，同族结构；但 25 个月的自动跑局没撞出' +
      '「条件不足」选项（要 aria-disabled 的锁定卡才会开这个框），本轮没能实测。见 §1.4 ㉑'
  },
  {
    file: 'SaveSlotsModal.css', overlay: '.save-slots-overlay', panel: '.save-slots-modal', innerScroll: '.save-slots-list',
    pattern: 'inner-scroll', note: '存档槽位列表'
  },
  {
    file: 'AchievementPanel.css', overlay: '.achievement-panel-overlay', panel: '.achievement-panel', innerScroll: '.achievement-list',
    pattern: 'inner-scroll', note: '成就列表'
  },
  {
    file: 'CheatMode.css', overlay: '.cheat-modal-overlay', panel: '.cheat-modal', innerScroll: '.cheat-modal-body',
    pattern: 'inner-scroll', note: '作弊面板（列表很长）'
  },
  {
    file: 'GameScreen.css', overlay: '.modal-overlay', panel: '.modal-content',
    pattern: 'panel-scrolls', note: '通用弹窗壳（含帮助/存档之外的旧模态）'
  },
  {
    file: 'AIAdvisor.css', overlay: '.ai-advisor-overlay', panel: '.ai-advisor-panel', innerScroll: '.ai-messages',
    pattern: 'drawer', note: '谋士抽屉：面板 height:100%，消息区自己滚'
  },
  {
    file: 'ImageGenerator.css', overlay: '.ig-overlay', panel: '.ig-panel', innerScroll: '.ig-body',
    pattern: 'drawer', note: '丹青面板：面板 height:100%'
  },
  {
    file: 'ImageGenerator.css', overlay: '.ig-viewer-overlay', panel: '.ig-viewer-panel',
    pattern: 'drawer', note: '丹青大图查看器：面板 height:100%，按钮在首块 header'
  },
  {
    file: 'DeathEnding.css', overlay: '.death-ending-overlay', panel: null,
    pattern: 'overlay-scrolls', note: '死亡结算：遮罩自己滚'
  },
  {
    file: 'LifeReview.css', overlay: '.life-review-overlay', panel: '.life-review-content',
    pattern: 'overlay-scrolls', note: '这一生回顾：遮罩自己滚，内容区也滚'
  },
  {
    file: 'SaveNotification.css', overlay: '.save-notification-overlay', panel: null,
    pattern: 'no-controls', note: '自动存档提示条：没有控件，点遮罩即关'
  }
]

const parsed = new Map<string, CssRule[]>()
const rulesOf = (file: string): CssRule[] => {
  if (!parsed.has(file)) parsed.set(file, parseCss(readFileSync(at(`../../src/components/${file}`), 'utf8')))
  return parsed.get(file)!
}

const desc = (row: Row) => `${row.overlay} @${row.file}（${row.note}）`

function check(row: Row): string | null {
  const rules = rulesOf(row.file)
  const ovScroll = baseDecl(rules, row.overlay, 'overflow-y') ?? baseDecl(rules, row.overlay, 'overflow')
  const cap = row.panel ? baseDecl(rules, row.panel, 'max-height') : undefined
  const height = row.panel ? baseDecl(rules, row.panel, 'height') : undefined
  const panelScroll = row.panel ? baseDecl(rules, row.panel, 'overflow-y') ?? baseDecl(rules, row.panel, 'overflow') : undefined
  const innerScroll = row.innerScroll ? baseDecl(rules, row.innerScroll, 'overflow-y') : undefined
  const innerFlex = row.innerScroll ? baseDecl(rules, row.innerScroll, 'flex') : undefined

  switch (row.pattern) {
    case 'strict':
      if (!ovScroll || !SCROLL.test(ovScroll)) return '遮罩没有 overflow-y:auto/scroll：面板顶穿视口时玩家滚不上去'
      if (!cap || !VH.test(cap)) return `面板没有 vh 上限（当前 max-height:${cap ?? '未写'}）：矮视口下按内容长`
      if (baseDecl(rules, row.panel!, 'min-height') !== '0') return '面板缺 min-height:0：被 flex 居中层压缩的前提'
      if (!panelScroll || !SCROLL.test(panelScroll)) return '面板没有自己的滚动区：超出部分只能顶穿遮罩'
      return null
    case 'panel-scrolls':
      if (!cap || !VH.test(cap)) return `面板没有 vh 上限（当前 max-height:${cap ?? '未写'}）`
      if (!panelScroll || !SCROLL.test(panelScroll)) return '面板封顶了却不滚，超出部分被静默裁掉'
      return null
    case 'inner-scroll':
      if (!cap || !VH.test(cap)) return `面板没有 vh 上限（当前 max-height:${cap ?? '未写'}）`
      if (!innerScroll || !SCROLL.test(innerScroll)) return `内部滚动区 ${row.innerScroll} 没声明 overflow-y:auto`
      if (!innerFlex || !innerFlex.startsWith('1')) return `内部滚动区 ${row.innerScroll} 缺 flex:1（不吃满剩余高度）`
      return null
    case 'drawer':
      if (height !== '100%' && !(cap && VH.test(cap))) return '抽屉面板既不贴满视口也没有 vh 上限'
      if (row.innerScroll && (!innerScroll || !SCROLL.test(innerScroll))) return `内部滚动区 ${row.innerScroll} 不滚`
      return null
    case 'overlay-scrolls':
      if (!ovScroll || !SCROLL.test(ovScroll)) return '遮罩自己不滚，内容超出视口时玩家滚不动'
      return null
    case 'capped-child':
      // 会长的那一层自己封顶到 100%，遮罩不滚也成立——只需要百分比上限存在
      if (cap !== '100%' && height !== '100%') return `会长的子项没有百分比上限（max-height:${cap ?? '未写'}）`
      return null
    case 'no-controls':
    case 'unmeasured':
      return null
  }
}

describe('第三十轮：每个全屏遮罩都得让玩家滚得到它的控件', () => {
  it('登记表覆盖了 src/components 里每一个全屏遮罩（新遮罩没登记就红）', () => {
    const found: string[] = []
    for (const f of readdirSync(at('../../src/components')).filter(n => n.endsWith('.css'))) {
      for (const r of fullScreenOverlays(rulesOf(f))) found.push(`${r.selector} @${f}`)
    }
    const registered = ROWS.map(r => `${r.overlay} @${r.file}`)
    for (const o of found) expect(registered, `新出现的全屏遮罩没在登记表里：${o}`).toContain(o)
    for (const r of ROWS) expect(found, `登记表里这条已经在源文本里找不到了：${desc(r)}`).toContain(`${r.overlay} @${r.file}`)
  })

  it('够不到、没实测的屏只许减少（棘轮 ≤ 1）', () => {
    const unmeasured = ROWS.filter(r => r.pattern === 'unmeasured')
    expect(unmeasured.length, '未实测清单：' + unmeasured.map(desc).join(' / ')).toBeLessThanOrEqual(1)
  })

  for (const row of ROWS) {
    it(`${desc(row)}`, () => {
      expect(check(row), `${desc(row)} —— 判据 ${row.pattern} 不成立`).toBeNull()
    })
  }

  it('.cd-panel 不许再用无条件 max-height:auto 把上限覆盖掉（第二十九轮那类覆盖）', () => {
    for (const [file, sel, prop] of [
      ['ConfirmDialog.css', '.cd-panel', 'max-height'],
      ['TutorialModal.css', '.tutorial-modal', 'max-height'],
      ['TutorialModal.css', '.tutorial-overlay', 'overflow-y']
    ] as const) {
      for (const r of baseRules(rulesOf(file), sel)) {
        if (!r.decls.has(prop)) continue
        const v = r.decls.get(prop)!
        const ok = prop === 'max-height' ? VH.test(v) : SCROLL.test(v)
        expect(ok, `${file} 里 ${sel} 无条件写了 ${prop}:${v}，会覆盖掉上面那条能滚/封顶的声明`).toBe(true)
      }
    }
  })
})
