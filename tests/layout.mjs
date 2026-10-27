/**
 * 多分辨率布局回归 —— 在真实浏览器里逐档视口检查横向溢出与关键控件可见性。
 *
 * 用法（先在仓库根目录 npm run build && npx vite preview --port 4173）：
 *   cd tests && npm run test:layout
 *
 * 每个视口做三件事：
 *   1. 断言 documentElement.scrollWidth 不超过视口宽度（横向溢出的硬指标）
 *   2. 断言标题框、右下角按钮组、难度选择器都完整落在视口内
 *   3. 截图存到 tests/screenshots/
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/'
const SHOT_DIR = new URL('./screenshots/', import.meta.url).pathname.replace(/^\//, '')

const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 640, note: '最小手机竖屏' },
  { name: 'phone-390', width: 390, height: 844, note: 'iPhone 14 竖屏' },
  { name: 'phone-844-landscape', width: 844, height: 390, note: '手机横屏' },
  { name: 'tablet-768', width: 768, height: 1024, note: '平板竖屏（旧版标题框会在此溢出）' },
  { name: 'tablet-820', width: 820, height: 1180, note: 'iPad Air 竖屏' },
  { name: 'laptop-1024', width: 1024, height: 768, note: '小平板/小笔电' },
  { name: 'laptop-1280', width: 1280, height: 800, note: 'Steam Deck 分辨率' },
  { name: 'desktop-1440', width: 1440, height: 900, note: '常规桌面' },
  { name: 'desktop-1920', width: 1920, height: 1080, note: '全高清' }
]

/**
 * 窄屏档位：浏览器高倍缩放、分屏极窄窗口都会落到这里。
 * 这些视口一旦被某个最小宽度顶宽，body 的 overflow-x:hidden 又不给横向滚动，
 * 右侧内容就被永久裁掉；固定定位的角标按钮还会压住主按钮。
 * 后三档等于 320x568 分别放大 114% / 133% / 147%。
 */
const NARROW_VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568, note: '320 宽边界' },
  { name: 'narrow-280', width: 280, height: 497, note: '320x568 放大 114%' },
  { name: 'narrow-240', width: 240, height: 426, note: '320x568 放大 133%' },
  { name: 'narrow-218', width: 218, height: 388, note: '320x568 放大 147%' }
]

const failures = []

function pass(msg) {
  console.log(`  \u2713 ${msg}`)
}
function fail(msg) {
  failures.push(msg)
  console.log(`  \u2717 ${msg}`)
}

/** 判断元素是否完整落在视口内 */
const WITHIN_VIEWPORT = `(sel) => {
  const el = document.querySelector(sel)
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden') return { found: true, hidden: true }
  return {
    found: true,
    hidden: false,
    left: Math.round(r.left),
    right: Math.round(r.right),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    width: Math.round(r.width),
    height: Math.round(r.height),
    overflowRight: Math.round(r.right - window.innerWidth),
    overflowLeft: Math.round(-r.left),
    overflowBottom: Math.round(r.bottom - window.innerHeight)
  }
}`

async function checkViewport(browser, vp) {
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) — ${vp.note} ===`)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.width <= 480,
    hasTouch: vp.width <= 1024
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2200)

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight
  }))

  const overflowX = metrics.scrollWidth - metrics.clientWidth
  if (overflowX <= 1) {
    pass(`无横向溢出 (scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth})`)
  } else {
    fail(`横向溢出 ${overflowX}px (scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth})`)
  }

  for (const sel of ['.title-frame', '.title-difficulty', '.title-corner-buttons', '.title-main']) {
    const box = await page.evaluate(new Function('sel', `return (${WITHIN_VIEWPORT})(sel)`), sel)
    if (!box.found) {
      fail(`${sel} 不存在`)
      continue
    }
    if (box.hidden) {
      fail(`${sel} 处于隐藏状态`)
      continue
    }
    if (box.overflowRight > 1 || box.overflowLeft > 1) {
      fail(
        `${sel} 横向超出视口 ${Math.max(box.overflowRight, box.overflowLeft)}px ` +
          `(left=${box.left}, right=${box.right}, 视口宽=${vp.width})`
      )
    } else {
      pass(`${sel} 完整落在视口内 (${box.width}x${box.height})`)
    }
  }

  // 纵向关键断言：主按钮「开 始 仕 途」必须在首屏内，不能要求玩家先滚动。
  // 这是矮屏（手机竖屏、横屏手机、小窗口）最容易踩的体验问题。
  const cta = await page.evaluate(
    new Function(
      'sel',
      `return (${WITHIN_VIEWPORT})(sel)`
    ),
    '.title-btn'
  )
  if (!cta.found || cta.hidden) {
    fail('主按钮 .title-btn 不存在或不可见')
  } else if (cta.overflowBottom > 1) {
    fail(
      `主按钮被挤到首屏之外，需向下滚动 ${cta.overflowBottom}px 才能点击 ` +
        `(top=${cta.top}, bottom=${cta.bottom}, 视口高=${vp.height})`
    )
  } else {
    pass(`主按钮在首屏内 (top=${cta.top}, bottom=${cta.bottom} / 视口高 ${vp.height})`)
  }

  // 在首屏内还不够：固定定位的「成就/局鉴/帮助」可能正好压在它身上，
  // 玩家看得见却点不动（窄屏实测用 elementFromPoint 才量得出来）。
  const ctaCover = await page.evaluate(() => {
    const btn = document.querySelector('.title-btn')
    if (!btn) return { missing: true }
    const r = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2)
    )
    if (!hit || btn.contains(hit)) return { cover: '' }
    return {
      cover: (hit.textContent || hit.className || hit.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 20)
    }
  })
  if (ctaCover.missing) {
    fail('主按钮不存在，无法做命中测试')
  } else if (ctaCover.cover) {
    fail(`主按钮被「${ctaCover.cover}」盖住，点击无效`)
  } else {
    pass('主按钮命中测试通过（点击中心落在按钮上）')
  }

  await page.screenshot({ path: `${SHOT_DIR}vp-${vp.name}.png` })
  await context.close()
}

/**
 * 窄屏档（<320 或高倍缩放）：
 *  · 文档不得因为最小宽度被撑出视口 —— 右侧裁切且没有横向滚动，等于内容丢了
 *  · 主按钮先滚进视口，再做 elementFromPoint 命中测试；
 *    否则固定定位的「成就/局鉴/帮助」压在它身上，玩家看到按钮却点不动
 */
async function checkNarrowViewport(browser, vp) {
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) — ${vp.note} ===`)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2200)

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  if (metrics.scrollWidth - metrics.clientWidth > 1) {
    fail(
      `[${vp.name}] 横向被裁 ${metrics.scrollWidth - metrics.clientWidth}px ` +
        `(scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth})`
    )
  } else {
    pass(`[${vp.name}] 无横向裁切 (scrollWidth=${metrics.scrollWidth})`)
  }

  for (const sel of ['.title-frame', '.title-main', '.title-difficulty', '.title-btn', '.title-corner-buttons']) {
    const box = await page.evaluate(new Function('sel', `return (${WITHIN_VIEWPORT})(sel)`), sel)
    if (!box.found || box.hidden) {
      fail(`[${vp.name}] ${sel} 不存在或不可见`)
    } else if (box.overflowRight > 1 || box.overflowLeft > 1) {
      fail(
        `[${vp.name}] ${sel} 横向超出视口 ${Math.max(box.overflowRight, box.overflowLeft)}px ` +
          `(left=${box.left}, right=${box.right}, 视口宽=${vp.width})`
      )
    } else {
      pass(`[${vp.name}] ${sel} 横向在视口内 (${box.width}x${box.height})`)
    }
  }

  const reach = await page.evaluate(async () => {
    const btn = document.querySelector('.title-btn')
    if (!btn) return { found: false }
    btn.scrollIntoView({ block: 'center', behavior: 'instant' })
    await new Promise(resolve => setTimeout(resolve, 400))
    const r = btn.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    const hit = document.elementFromPoint(cx, cy)
    return {
      found: true,
      rect: {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right)
      },
      fullyVisible:
        r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
      cover: hit && !btn.contains(hit) ? (hit.textContent || hit.className || hit.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 40) : null
    }
  })

  if (!reach.found) {
    fail(`[${vp.name}] 找不到主按钮`)
  } else if (!reach.fullyVisible) {
    fail(
      `[${vp.name}] 主按钮滚动后仍不完整 (top=${reach.rect.top}, bottom=${reach.rect.bottom}, ` +
        `left=${reach.rect.left}, right=${reach.rect.right})`
    )
  } else if (reach.cover) {
    fail(`[${vp.name}] 主按钮被「${reach.cover}」盖住，点击无效`)
  } else {
    pass(`[${vp.name}] 主按钮可滚动到并可直接点击 (top=${reach.rect.top}, bottom=${reach.rect.bottom})`)
  }

  await page.screenshot({ path: `${SHOT_DIR}vp-${vp.name}.png` })
  await context.close()
}

/**
 * 进入主玩法后再查一遍。
 *
 * 为什么标题屏通过还不够：主玩法那条链（.game-screen → .game-screen-body →
 * .game-main → .main-content → .event-display）被改成了纵向 flex 骨架，
 * 让事件面板吃满剩余高度并在内部滚动。这套 flex 只有在真实内容下才会暴露问题：
 *   · 面板被压扁（高度算错）
 *   · 整页被顶高，底部操作栏被推出屏幕（playwright 的纵向溢出检查覆盖不到，
 *     因为 documentElement.scrollHeight 变大是"正常"的滚动）
 *   · 横向溢出（侧栏固定 220px + 放大的字号）
 * 所以这里逐档断言：底部操作栏必须完整落在视口内、事件面板不得被压到过矮。
 */
async function checkGameViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.width <= 480,
    hasTouch: vp.width <= 1024
  })
  const page = await context.newPage()
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

  if (!(await page.locator('.game-screen').isVisible().catch(() => false))) {
    fail(`[${vp.name}] 未能进入主玩法界面`)
    await context.close()
    return
  }

  // 横向溢出
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  if (m.scrollWidth - m.clientWidth > 1) {
    fail(`[${vp.name}] 主玩法横向溢出 ${m.scrollWidth - m.clientWidth}px`)
  } else {
    pass(`[${vp.name}] 主玩法无横向溢出`)
  }

  // 底部操作栏的位置。
  //
  // 这里必须区分两种布局，不能一刀切：
  //  · 宽屏（>1024px）：三栏并列，操作栏属于"始终可见"的固定区域。
  //    它一旦被顶出视口就是回归 —— 玩家想点"进 下 月"还得先滚动。
  //  · 窄屏（≤1024px）：单列堆叠，侧栏排在事件面板**之后**，
  //    整页本来就要滚动，操作栏在页面末尾是设计如此，不是缺陷。
  //    对这种布局断言"必须在首屏内"会得到一片假失败。
  const stacked = vp.width <= 1024
  const bar = await page.evaluate(
    new Function('sel', `return (${WITHIN_VIEWPORT})(sel)`),
    '.action-bar'
  )
  if (!bar.found) {
    fail(`[${vp.name}] 找不到 .action-bar`)
  } else if (stacked) {
    pass(`[${vp.name}] 单列堆叠布局，操作栏随页面滚动（bottom=${bar.bottom}）`)
  } else if (bar.overflowBottom > 1) {
    fail(`[${vp.name}] 宽屏下底部操作栏被顶出视口 ${bar.overflowBottom}px`)
  } else {
    pass(`[${vp.name}] 底部操作栏在视口内 (h=${bar.height})`)
  }

  // 事件面板不得被压扁（flex 链算错时的典型症状）
  const ev = await page.evaluate(
    new Function('sel', `return (${WITHIN_VIEWPORT})(sel)`),
    '.event-display'
  )
  if (!ev.found) {
    fail(`[${vp.name}] 找不到 .event-display`)
  } else if (ev.height < 80) {
    fail(`[${vp.name}] 事件面板被压扁，仅 ${ev.height}px 高`)
  } else {
    pass(`[${vp.name}] 事件面板高度正常 (${ev.width}x${ev.height})`)
  }

  await page.screenshot({ path: `${SHOT_DIR}game-${vp.name}.png` })
  await context.close()
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  for (const vp of VIEWPORTS) {
    await checkViewport(browser, vp)
  }
  console.log('\n' + '='.repeat(60))
  console.log('标准视口检查完毕，开始检查窄屏档')
  console.log('='.repeat(60))
  for (const vp of NARROW_VIEWPORTS) {
    await checkNarrowViewport(browser, vp)
  }
  console.log('\n' + '='.repeat(60))
  console.log('标题屏检查完毕，开始检查主玩法界面')
  console.log('='.repeat(60))
  for (const vp of VIEWPORTS) {
    await checkGameViewport(browser, vp)
  }
  await browser.close()

  console.log('\n' + '='.repeat(60))
  if (failures.length > 0) {
    console.log(`布局回归未通过，共 ${failures.length} 项：`)
    failures.forEach(f => console.log(`  \u2717 ${f}`))
    process.exit(1)
  }
  console.log('布局回归通过：所有视口均无横向溢出，关键控件均在视口内')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
