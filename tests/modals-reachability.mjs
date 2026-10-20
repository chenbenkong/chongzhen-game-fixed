// 第三十轮 · 永久钉子（npm run test:modals）：把"玩家可达"从事件选项卡扩到**每一个可交互元素**。
//
// 第二十九轮量的是"选项卡被 overflow:hidden 静默裁掉"，用的判据只覆盖 `.choice-card`。
// 本轮把同一套判据扫遍每一屏（标题页 / 开局设定页 / 主界面 / 结算页）与每一个弹窗面
// （成就 / 帮助九步 / 存档 / 焚毁存档确认 / 谋士），于是量出帮助弹窗在
// 1280×600 + 根字号 165% 下的同类缺陷：教程面板按内容长到 706px，遮罩 `align-items:center`
// 把它往上下两头顶出去 —— 「关闭 ×」到 top=-41、「跳过教程」到 bottom=616，
// 而遮罩与根都没有玩家滚得动的容器，玩家既关不掉教程也跳不过它。
//
// 判据（三条，缺一即记一条 ✗）：
//   1. 只用**玩家真滚得动**的容器滚到位（overflow-y:auto|scroll + 根滚动器），
//      绝不用 scrollIntoView —— 它会替玩家去滚 overflow:hidden 的祖先，那是假通过；
//   2. 滚到最远后：整块落在视口内，且落在每个非滚动祖先的 client 盒内（只报最内侧一个）；
//   3. 中心点 elementFromPoint 命中的是它自己或它的子孙（弹窗开着时只比最上面那层面）。
//
// 仪器坑（都在这轮踩过，改脚本前先读）：
//   · src/index.css 全局 `scroll-behavior:smooth` → 抄表前必须 behavior:'instant' + 等两帧；
//   · 根滚动器不参与祖先盒比对（它一滚自己的 rect.top 就变负）；
//   · 弹窗开着时它外面的元素本来就该被盖住 → 只扫最上面那层 fixed+z≥100 **且盖住大半个视口**的面；
//     少了面积条件，常驻的 .bgm-toggle（fixed+z 高的音乐按钮）会被当成遮罩，标题页随即假失败；
//   · 每屏都带 expectSel 校验"弹窗真的打开了"：没打开时元素数会退回上一页的数，
//     读数看着全绿其实是把主界面又抄了一遍（本轮就在 1280×600 @165% 见过一次）。
//
// 用法：先起 dev server 或 preview，再 `node modals-reachability.mjs`
// 环境变量：VPS=档位名逗号分隔  SIZES=根字号逗号分隔  BASE_URL
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173/'
const VP_TABLE = {
  'desktop-1440x900': [1440, 900], 'deck-1280x800': [1280, 800], 'short-1280x600': [1280, 600],
  'laptop-1024x768': [1024, 768], 'tablet-768x1024': [768, 1024]
}
const VPS = (process.env.VPS || 'desktop-1440x900,deck-1280x800,short-1280x600,laptop-1024x768,tablet-768x1024')
  .split(',').map(n => VP_TABLE[n]).filter(Boolean)
const SIZES = (process.env.SIZES || '100%,165%,200%').split(',')
const SEL = 'button, [role="button"], a[href], input:not([type="hidden"]), select, .choice-card, .origin-card'

const CHECK = async ({ sel, expectSel }) => {  const isRoot = el => el === document.documentElement || el === document.body
  const oy = el => getComputedStyle(el).overflowY
  const canScroll = el => oy(el) === 'auto' || oy(el) === 'scroll'
  const clientTop = el => el.getBoundingClientRect().top + parseFloat(getComputedStyle(el).borderTopWidth || '0')
  const cls = el => (el.className || el.tagName).toString().trim().split(/\s+/)[0]
  const label = el => {
    const txt = (el.textContent || el.getAttribute('aria-label') || el.type || '').replace(/\s+/g, '').slice(0, 14)
    return `${el.tagName.toLowerCase()}.${cls(el)} "${txt}"`
  }
  const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  const scrollableAncestors = el => {
    const chain = []
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (isRoot(p)) continue
      if (canScroll(p) && p.scrollHeight > p.clientHeight + 1) chain.push(p)
    }
    return chain
  }
  const scrollToCenter = async el => {
    const chain = scrollableAncestors(el)
    const doc = document.documentElement
    for (let pass = 0; pass < 2; pass++) {
      for (const p of [...chain].reverse()) {
        const r = el.getBoundingClientRect()
        p.scrollTo({ top: p.scrollTop + r.top + r.height / 2 - (clientTop(p) + p.clientHeight / 2), behavior: 'instant' })
      }
      if (doc.scrollHeight > doc.clientHeight + 1) {
        const r = el.getBoundingClientRect()
        window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' })
      }
      await settle()
    }
    return chain.length
  }

  // 最上面那层面：fixed + z≥100 + **盖住大半个视口**，按 z 排序、同 z 取 DOM 后者（portal 追加在末尾）。
  // 只按 fixed+z 判断会把常驻的小固定控件（背景音乐开关 .bgm-toggle）当成"遮罩层"，
  // 于是标题页被测成"弹窗没打开"—— 本轮第一版就这么假失败过一次，必须再加面积条件。
  let surface = document.body
  const overlays = [...document.querySelectorAll('body *')].filter(el => {
    const cs = getComputedStyle(el)
    const z = parseFloat(cs.zIndex || 'NaN')
    const r = el.getBoundingClientRect()
    return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden' &&
      !isNaN(z) && z >= 100 && r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.6
  })
  overlays.sort((a, b) => (parseFloat(getComputedStyle(a).zIndex) - parseFloat(getComputedStyle(b).zIndex)) ||
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  if (overlays.length) surface = overlays[overlays.length - 1]

  const expect = expectSel ? document.querySelector(expectSel) : null
  if (expectSel && (!expect || !surface.contains(expect))) {
    return {
      missing: `${expectSel}（当前最上面那层是 ${surface === document.body ? 'body' : cls(surface)}）`,
      total: 0, bad: [], onSurface: 'body'
    }
  }

  const nodes = [...surface.querySelectorAll(sel)].filter(el => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2
  })
  const bad = []
  // 先量"面板盒子本身"：弹窗面板超出视口、而遮罩和根都滚不动 —— 这就是静默裁切的成因，
  // 比"某个控件点不着"更早一步（控件可能刚好还剩 19px 余量，但面板已经顶穿了）。
  const panel = [...surface.children].find(el => {
    const r = el.getBoundingClientRect()
    return r.height > 20 && r.width > 20
  })
  if (panel && surface !== document.body) {
    const pr = panel.getBoundingClientRect()
    const surfaceScrolls = canScroll(surface) && surface.scrollHeight > surface.clientHeight + 1
    const docScrolls = document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
    if ((pr.top < -1 || pr.bottom > innerHeight + 1) && !surfaceScrolls && !docScrolls) {
      bad.push({
        l: `面板 .${cls(panel)}（${Math.round(pr.height)}px 装进 ${innerHeight}px 视口）`,
        v: [`顶出视口 ${Math.round(Math.max(-pr.top, pr.bottom - innerHeight))}px，` +
          `而遮罩 .${cls(surface)} overflowY=${oy(surface)}、根 scrollH=${document.documentElement.scrollHeight}/clientH=${document.documentElement.clientHeight} —— 谁都不滚`]
      })
    }
  }
  for (const el of nodes) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
    if (getComputedStyle(el).pointerEvents === 'none') { bad.push({ l: label(el), v: ['pointer-events:none（点不动）'] }); continue }
    const nScrollers = await scrollToCenter(el)
    const r = el.getBoundingClientRect()
    const v = []
    if (r.top < -1 || r.bottom > innerHeight + 1) {
      v.push(`滚到最远仍在视口外（top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} 视口=${innerHeight}` +
        `${nScrollers ? '' : ' · 而它没有任何玩家滚得动的祖先'}）`)
    }
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (isRoot(p)) continue
      const c = oy(p)
      if (c === 'visible' || getComputedStyle(p).display === 'none') continue
      if (canScroll(p)) continue
      const cb = { top: clientTop(p), bottom: clientTop(p) + p.clientHeight }
      if (r.bottom > cb.bottom + 1 || r.top < cb.top - 1) {
        v.push(`进不了 .${cls(p)}（client ${Math.round(cb.top)}..${Math.round(cb.bottom)} · overflowY=${c} · ` +
          `scrollH=${p.scrollHeight}/clientH=${p.clientHeight}${p.scrollHeight > p.clientHeight ? ' · 且它自己也滚不动' : ''}）`)
        break
      }
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
      v.push(`中心点被 ${hit ? cls(hit) : 'nothing'} 盖住`)
    }
    if (v.length) bad.push({ l: label(el), v })
  }
  return { missing: null, total: nodes.length, bad, onSurface: surface === document.body ? 'body' : cls(surface) }
}

// 确认框的文案长度是**数据**决定的，常规玩法里 e2e 走不到最长那一份（辞官确认要撞到一个
// declinable 事件）。这里往已经打开的确认框里注入 ResignConfirmDialog.tsx 的原文：
// 类名、CSS、层级都不变，浏览器算出来的高度就是游戏当时真的会渲染出来的高度。
const INJECT_WORST_TEXT = () => {
  const overlay = document.querySelector('.cd-overlay')
  if (!overlay) return null
  const body = document.querySelector('.cd-body')
  const title = document.querySelector('.cd-title')
  if (title) title.textContent = '皇帝挽留'
  const msg = body.querySelector('.cd-message')
  if (msg) {
    msg.textContent = '你上疏请求辞官，皇帝看了你的奏疏，面露不悦：「朕待你不薄，为何此时要弃朕而去？再考虑考虑吧……」'
  }
  for (const [cls, txt] of [
    ['cd-detail', '挂印离乡：辞官归里，宦橐萧然，变卖田产得银四百两（结束游戏，此决定不可撤销）'],
    ['cd-warning', '辞官后将结束游戏，此决定不可撤销。']
  ]) {
    if (body.querySelector('.' + cls)) continue
    const d = document.createElement('div')
    d.className = cls
    d.textContent = txt
    body.appendChild(d)
  }
  const panel = document.querySelector('.cd-panel')
  const box = document.querySelector('.cd-actions').getBoundingClientRect()
  return {
    viewport: innerHeight,
    panel: `${Math.round(panel.getBoundingClientRect().top)}..${Math.round(panel.getBoundingClientRect().bottom)}` +
      ` clientH=${panel.clientHeight} scrollH=${panel.scrollHeight} maxH=${getComputedStyle(panel).maxHeight}`,
    body: `clientH=${body.clientHeight} scrollH=${body.scrollHeight} overflowY=${getComputedStyle(body).overflowY}`,
    btnBottomGap: Math.round(innerHeight - box.bottom)
  }
}

let fails = 0
const seen = new Set()
async function sweep(page, name, expectSel = null) {
  const res = await page.evaluate(CHECK, { sel: SEL, expectSel })
  if (res.missing) {
    console.log(`  ✗ [${name}] 这一屏没打开：${res.missing} —— 读数无效`)
    fails++
    return
  }
  if (!res.bad.length) {
    console.log(`  ✓ [${name}] ${res.total} 个可交互元素全部点得着（面=${res.onSurface}）`)
    return
  }
  for (const b of res.bad) for (const v of b.v) {
    const key = `${name}|${b.l}|${v}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`  ✗ [${name}] ${b.l} —— ${v}`)
  }
  console.log(`  ✗ [${name}] 共 ${res.total} 个可交互元素，${res.bad.length} 个点不着`)
  fails++
}

const browser = await chromium.launch({ headless: true })
for (const [w, h] of VPS) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    console.log(`\n########## ${w}x${h} @${size} ##########`)
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(2200)
    await page.addStyleTag({ content: `:root{font-size:${size}!important}` })
    await sweep(page, '标题页', '.title-btn')

    await page.locator('.title-btn', { hasText: '开' }).first().click()
    await page.waitForTimeout(700)
    await sweep(page, '开局设定页', '.setup-screen')
    const inputs = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i)
      if (!(await el.inputValue().catch(() => ''))) await el.fill(['测试', '字明', '苏州府'][i] || '测').catch(() => {})
    }
    await page.locator('.setup-screen .confirm-btn').first().click()
    await page.waitForTimeout(800)
    await page.locator('.origin-card button, .origin-card').first().click().catch(() => {})
    await page.waitForTimeout(1700)
    await sweep(page, '主界面', '.game-screen')

    const card = page.locator('.choices-list .choice-card[aria-disabled="false"]').first()
    if (await card.count()) {
      await card.click({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
      if (await page.locator('.dice-modal-overlay').count()) await sweep(page, '骰子弹窗', '.dice-modal-overlay')
      await page.waitForTimeout(700)
      await sweep(page, '结算页', '.settlement-title')
      await page.locator('.result-actions .continue-btn').first().click().catch(() => {})
      await page.waitForTimeout(700)
    }

    // 成就
    await page.locator('.action-btn:has-text("成就")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(900)
    await sweep(page, '成就弹窗', '.achievement-panel-overlay')
    await page.locator('.close-button').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)

    // 帮助：九步逐条量（第 5 步「剧情线路」正文最长，706→911px 都靠它撑出缺陷）
    await page.locator('.action-btn:has-text("帮助")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(900)
    for (let step = 0; step < 12; step++) {
      if (!(await page.locator('.tutorial-overlay').count())) break
      const title = (await page.locator('.tutorial-title').first().textContent().catch(() => '') || '').trim()
      await sweep(page, `帮助·${title || '第 ' + (step + 1) + ' 步'}`, '.tutorial-overlay')
      const next = page.locator('.tutorial-btn.primary').first()
      if (!(await next.count())) break
      await next.click({ force: true }).catch(() => {})
      await page.waitForTimeout(500)
    }
    await page.locator('.tutorial-close').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)

    // 存档 + 它上面的"焚毁存档"确认框（.cd-overlay，z=11000）
    await page.locator('.action-btn:has-text("档")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(900)
    await sweep(page, '存档弹窗', '.save-slots-overlay')
    const del = page.locator('.delete-btn[aria-label="删除自动存档"]').first()
    if (await del.count()) {
      await del.click({ force: true }).catch(() => {})
      await page.waitForTimeout(700)
      await sweep(page, '焚毁存档确认', '.cd-overlay')
      const worst = await page.evaluate(INJECT_WORST_TEXT)
      if (worst) {
        console.log(`    · 灌入辞官确认框原句后：视口 ${worst.viewport} · 面板 ${worst.panel} · ` +
          `正文 ${worst.body} · 按钮距视口底 ${worst.btnBottomGap}px`)
        await page.waitForTimeout(300)
        await sweep(page, '焚毁存档确认·长文案', '.cd-overlay')
      }
      await page.locator('.cd-btn').last().click({ force: true }).catch(() => {}) // 保留，别真删
      await page.waitForTimeout(500)
    } else {
      console.log('  · [焚毁存档确认] 没有自动存档，跳过这一屏')
    }
    await page.locator('.save-slots-overlay .close-btn').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)

    // 谋士
    await page.locator('.ai-advisor-btn').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(900)
    await sweep(page, '谋士弹窗', '.ai-advisor-overlay')
    await ctx.close()
  }
}
await browser.close()
console.log(fails ? `\n✗ ${fails} 屏存在不可达控件` : '\n✓ 全部屏：每个可交互元素玩家都点得着')
process.exitCode = fails ? 1 : 0
