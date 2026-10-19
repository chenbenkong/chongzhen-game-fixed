/**
 * 事件选项可见性回归 —— 每张选项卡都必须"滚得到、点得着"。
 *
 * 用法（BASE_URL 默认 http://localhost:4173/，可指向 dev server）：
 *   cd tests && BASE_URL=http://localhost:5173/ node choices-visibility.mjs
 *
 * 第二十九轮的由来：玩家报告"事件只显示两个选项，第三个被挡住，向下滚动也没有内容"。
 * 静态看 CSS 是对的 —— .event-display 写着 flex:1 / min-height:0 / overflow-y:auto，
 * 本该在面板内部滚动。但 GameScreen.css 文件末尾还有一条**无条件**的
 * `.main-content { min-height: auto }`，它把第 83 行那条的 min-height:0 覆盖掉了，
 * 于是中间列缩不回列高，多出来的一截由 `.game-main{overflow:hidden}` 静默裁掉，
 * 而面板自认 scrollHeight == clientHeight，滚动条压根不出现；整页又被
 * `.game-screen` 在 ≥1025px 的 height:100dvh 锁死 —— 三条路同时堵死。
 *
 * 修复前的实测（headless chromium，直接量几何）：
 *   1280×600「寒窗苦读」3 张卡：.game-main clientHeight=500 / scrollHeight=678（裁 178px）
 *                                .main-content 与 .event-display 都是 678 高
 *                                第 3 张卡 top=673 → 看不见也点不到
 *   1280×800「家书催银」3 张卡：裁 99px，同样第 3 张在外
 *   1440×900「寒窗苦读」3 张卡：内容刚好放得下，所以桌面大屏看不出问题
 *
 * 为什么这里不"选一个长事件"来复现：跑局里出现哪个事件由随机数决定，断言一旦绑在
 * 某个事件 id 上就会随版本漂移。所以本文的判据是**逐屏不变量**：只要屏幕上出现了
 * 选项卡（或结算页），它就必须能被滚进每一个 overflow 非 visible 祖先的 client 盒内，
 * 且中心点 elementFromPoint 落在它自己身上。再叠加一档 165% 根字号，把任意事件
 * 都撑成超高内容，保证溢出这条分支每个视口都被走到。
 */
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/'
// 全矩阵一轮约 20 分钟，改一条 CSS 想快速 A/B 时用环境变量收窄：
//   VPS=short-1280x600 SIZES=165% node choices-visibility.mjs
const ALL_VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'deck-1280x800', width: 1280, height: 800 },
  { name: 'short-1280x600', width: 1280, height: 600 },
  { name: 'laptop-1024x768', width: 1024, height: 768 },
  { name: 'tablet-768x1024', width: 768, height: 1024 }
]
const ALL_SIZES = ['100%', '165%']
const pick = (env, all) => (env ? env.split(',').map(s => s.trim()).filter(Boolean) : all)
const VIEWPORTS = ALL_VIEWPORTS.filter(v => pick(process.env.VPS, ALL_VIEWPORTS.map(x => x.name)).includes(v.name))
const ROOT_SIZES = pick(process.env.SIZES, ALL_SIZES)
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 40)

const failures = []
const notes = []

// 同一条读数在一局里会反复出现（每屏都撞同一个裁切），去重后清单才读得完
const seenFail = new Set()
function fail(msg) {
  if (seenFail.has(msg)) return
  seenFail.add(msg); failures.push(msg); console.log(`  \u2717 ${msg}`)
}
function pass(msg) { console.log(`  \u2713 ${msg}`) }

/**
 * 页内不变量检查。返回逐张卡的几何读数 + 违规清单。
 * reachability 的判据（"可达"必须是**玩家**可达，不是程序可达）：
 * 先把卡片滚到位 —— 只允许动 `overflow-y:auto|scroll` 的容器和根滚动器，然后
 *   1) 卡片必须完整落在视口内；
 *   2) 卡片必须完整落在**每一个** overflow-y 非 visible 祖先的 client 盒内
 *      （client 盒 = rect.top + borderTopWidth 起、高 clientHeight，天然排除滚动条与边框）；
 *   3) 卡片中心点命中的必须是它自己或它的后代（没被别的层盖住）；
 *   4) 卡片到根这条链上不许出现"`overflow:hidden` 且 scrollHeight>clientHeight"——
 *      那就是静默裁切，读数里直接把裁掉的像素数报出来。
 *
 * 量具自己的四个坑，第二十九轮实测踩过三批：
 *  · `index.css` 全局 `scroll-behavior: smooth`，滚动会被变成动画，紧接着读
 *    getBoundingClientRect 抄到的是**飞行途中**的坐标（top=-222 之类）。
 *    所以每处滚动显式 `behavior:'instant'`，并且等两帧让布局/滚动都落定再抄表。
 *  · 每张卡都要单独滚一次：页面级滚动容器（html）一次只能容纳一个滚动位置，
 *    拿一次滚动位置去要求"所有卡同时在盒内"必然是假失败。
 *  · 根滚动器不参与祖先盒比对：≤1024px 走的是整页滚动那一档，`html` 一滚自己的
 *    rect.top 就跟着变负（实测 client -437..331），照它比就是假失败；卡片是否真在
 *    视口内，第 1) 步已经查过了。
 *  · **`scrollIntoView()` 会替玩家去滚 `overflow:hidden` 的容器** —— 这一条是反向的坑
 *    （假通过，不是假失败）：修复前那一版用它，`.game-main` 可见 335px 却装着 949px
 *    内容、三张卡顶在 713/849/948，程序照样能把 scrollTop 改过去，于是一句"全部可达"
 *    把真缺陷放走了。现在改成手写滚动 + 第 4) 条结构判据，修复前当场报红。
 */
const CHECK = async () => {
  const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const clientBox = el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const top = r.top + parseFloat(cs.borderTopWidth || '0')
    return { top, bottom: top + el.clientHeight, cs }
  }
  const isRoot = el => el === document.documentElement || el === document.body
  const overflowY = el => getComputedStyle(el).overflowY
  const userCanScroll = el => overflowY(el) === 'auto' || overflowY(el) === 'scroll'

  // 只允许**玩家真滚得动**的容器参与滚动：overflow:hidden 的盒子程序改 scrollTop 改得动，
  // 滚轮碰不到。用 scrollIntoView 去量，等于让仪器替玩家把门推开（修复前那一版正是被它骗了）。
  const scrollToCard = async c => {
    const doc = document.documentElement
    const chain = []
    for (let p = c.parentElement; p; p = p.parentElement) {
      if (isRoot(p)) continue
      if (userCanScroll(p) && p.scrollHeight > p.clientHeight + 1) chain.push(p)
    }
    const centerIn = (el, isWin) => {
      const cr = c.getBoundingClientRect()
      const want = (isWin ? 0 : clientBox(el).top) + el.clientHeight / 2
      const delta = cr.top + cr.height / 2 - want
      // behavior:'instant' 是必须的：`index.css` 全局写了 scroll-behavior:smooth，
      // 直接改 scrollTop 会被它变成动画，紧接着抄表就抄到飞行途中的坐标。
      const opts = { top: (isWin ? window.scrollY : el.scrollTop) + delta, behavior: 'instant' }
      if (isWin) window.scrollTo(opts)
      else el.scrollTo(opts)
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const p of chain) centerIn(p, false)
      if (doc.scrollHeight > doc.clientHeight + 1) centerIn(doc, true)
      await settle()
    }
  }

  const probe = async c => {
    await scrollToCard(c)
    await settle()
    const r = c.getBoundingClientRect()
    const out = {
      text: (c.textContent || '').slice(0, 16),
      top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
      violations: []
    }
    if (r.height < 4) out.violations.push('卡片高度为 0（被折叠或未渲染）')
    if (r.top < -1 || r.bottom > innerHeight + 1) {
      out.violations.push(`滚到最远仍在视口外（top=${out.top} bottom=${out.bottom} 视口高=${innerHeight}）`)
    }
    for (let p = c.parentElement; p; p = p.parentElement) {
      // 根滚动器（≤1024px 那一档整页滚动时是它）不参与"祖先盒"比对：
      // 它一滚动，自己的 rect.top 就跟着负下去（实测 client -437..331），
      // 拿它比"在不在可视区"必然假失败——而可视区那条上面第 1 步已经查过了。
      if (p === document.documentElement || p === document.body) continue
      const cs = getComputedStyle(p)
      if (cs.overflowY === 'visible' || cs.display === 'none') continue
      const cb = clientBox(p)
      if (r.bottom > cb.bottom + 1 || r.top < cb.top - 1) {
        const cls = p.className || p.tagName.toLowerCase()
        const canScroll = p.scrollHeight > p.clientHeight + 1 && (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
        out.violations.push(
          `滚到最远也进不了 .${cls}（该容器 client ${Math.round(cb.top)}..${Math.round(cb.bottom)}，` +
          `scrollHeight=${p.scrollHeight} clientHeight=${p.clientHeight} overflowY=${cs.overflowY}` +
          `${canScroll ? '' : ' · 且它自己也滚不动'}）`
        )
        // 只报最内侧那一个：外层是跟着一起失败的，逐层都报会把清单冲成一堆重复读数
        break
      }
    }
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (r.width > 0 && r.height > 0) {
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || !(hit === c || c.contains(hit) || hit.contains(c))) {
        out.violations.push(`中心点被 ${hit ? (hit.className || hit.tagName) : 'nothing'} 盖住`)
      }
    }
    return out
  }

  // 结构读数：卡片→根这条链上，"用 overflow:hidden 裁掉玩家滚不到的内容"的容器。
  // 上面那条判据要等滚到最远才报，这一条不看滚动位置就能定性，报出来的数直接能写进文档。
  const clippedByHidden = () => {
    const first = document.querySelector('.choice-card') || document.querySelector('.result-actions .continue-btn')
    if (!first) return []
    const out = []
    for (let p = first.parentElement; p; p = p.parentElement) {
      if (isRoot(p)) continue
      const cs = overflowY(p)
      if (cs === 'visible' || cs === 'auto' || cs === 'scroll') continue
      const lost = p.scrollHeight - p.clientHeight
      if (lost > 2) {
        out.push(`容器 .${p.className || p.tagName.toLowerCase()} 用 overflow:${cs} 静默裁掉 ${lost}px` +
          `（内容 ${p.scrollHeight} / 可见 ${p.clientHeight} · 玩家滚不动）`)
      }
    }
    return out
  }

  const panel = document.querySelector('.event-display')
  const cards = []
  for (const c of document.querySelectorAll('.choice-card')) cards.push(await probe(c))
  const tail = document.querySelector('.result-actions .continue-btn') || document.querySelector('.choices-list > :last-child')
  const tailRead = tail ? await probe(tail) : null
  const bar = document.querySelector('.action-bar')
  return {
    vp: [innerWidth, innerHeight],
    eventTitle: document.querySelector('.event-title')?.textContent?.trim() || null,
    cards, tailRead,
    clipped: clippedByHidden(),
    panel: panel && {
      height: Math.round(panel.getBoundingClientRect().height),
      scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
      overflowY: getComputedStyle(panel).overflowY
    },
    barInViewport: bar ? Math.round(bar.getBoundingClientRect().bottom) <= innerHeight + 1 : null
  }
}

async function enterGame(page) {
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2200)
  await page.locator('.title-btn', { hasText: '开' }).first().click()
  await page.waitForTimeout(600)
  const inputs = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
  const n = await inputs.count()
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i)
    if (!(await el.inputValue().catch(() => ''))) await el.fill(['测试', '字明', '苏州府'][i] || '测').catch(() => {})
  }
  await page.locator('.setup-screen .confirm-btn').first().click()
  await page.waitForTimeout(700)
  await page.locator('.origin-card button, .origin-card').first().click().catch(() => {})
  await page.waitForTimeout(1600)
}

async function runOne(browser, vp, rootSize) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const label = `${vp.name} @${rootSize}`
  console.log(`\n===== ${label} =====`)
  await enterGame(page)
  if (!(await page.locator('.game-screen').isVisible().catch(() => false))) {
    fail(`${label} 未能进入主玩法界面`)
    await ctx.close()
    return
  }
  await page.addStyleTag({ content: `:root{font-size:${rootSize}!important}` })

  let checkedCards = 0, checkedResults = 0
  for (let step = 0; step < MAX_STEPS && checkedResults < 2; step++) {
    const inChoices = await page.locator('.choices-list .choice-card').count()
    const inResult = await page.locator('.result-actions .continue-btn').count()
    if (inChoices === 0 && inResult === 0) {
      await page.locator('.action-btn.primary').first().click().catch(() => {})
      await page.waitForTimeout(700)
      continue
    }

    const read = await page.evaluate(CHECK)
    const line = `${read.eventTitle || '(无标题)'}：${read.cards.length} 张卡 · 面板 ${read.panel?.height}px / scrollH ${read.panel?.scrollHeight} / clientH ${read.panel?.clientHeight} / overflowY ${read.panel?.overflowY}`
    notes.push(`${label} ${line}`)
    console.log(`  [step ${step}] ${line}`)

    for (const v of read.clipped) fail(`${label} ${v}`)
    for (const c of read.cards) {
      for (const v of c.violations) fail(`${label} 选项「${c.text}」${v}`)
    }
    if (read.tailRead) {
      for (const v of read.tailRead.violations) fail(`${label} 末位元素「${read.tailRead.text}」${v}`)
    }
    if (inChoices > 0) {
      if (read.cards.length === 0) fail(`${label} 数到 ${inChoices} 张选项卡却读不到几何`)
      else if (!read.cards.some(c => c.violations.length)) pass(`${label} ${read.cards.length} 张选项卡全部可达`)
      checkedCards++
      // 点"点得动"的那一张，游戏才往下走；全被锁住时退回第一张（只读屏，不影响断言）
      const clickable = page.locator('.choices-list .choice-card[aria-disabled="false"]').first()
      if (await clickable.count()) await clickable.click({ force: true }).catch(() => {})
      else await page.locator('.choices-list .choice-card').first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(650)
      continue
    }
    checkedResults++
    if (vp.width >= 1025 && read.barInViewport === false) fail(`${label} 修复后底部操作栏被顶出视口`)
    await page.locator('.result-actions .continue-btn').first().click().catch(() => {})
    await page.waitForTimeout(500)
    await page.locator('.action-btn.primary').first().click().catch(() => {})
    await page.waitForTimeout(700)
  }
  if (checkedCards < 2) fail(`${label} ${MAX_STEPS} 步内只量到 ${checkedCards} 屏选项，覆盖不足`)
  await ctx.close()
}

const browser = await chromium.launch({ headless: true })
for (const vp of VIEWPORTS) {
  for (const size of ROOT_SIZES) await runOne(browser, vp, size)
}
await browser.close()

console.log('\n' + '='.repeat(64))
notes.forEach(n => console.log(`  · ${n}`))
console.log('='.repeat(64))
if (failures.length) {
  console.log(`选项可达性回归未通过，共 ${failures.length} 项：`)
  failures.forEach(f => console.log(`  \u2717 ${f}`))
  process.exit(1)
}
console.log('选项可达性回归通过：每个视口、每档字号下，选项卡与末位元素都滚得到、点得着')
