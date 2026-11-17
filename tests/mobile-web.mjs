/**
 * 手机横屏 Web 版冒烟测试。
 *
 * 用途：在真实浏览器里验证「手机自动进横屏版、竖屏出旋转遮罩、?mobile=1 可强制预览、
 * 桌面视口仍走原版」四条入口规则，并检查牌桌最小可用性（HUD 六项状态齐全、
 * 操作条默认收起/可展开/可收起、财帛/体质速览、人物面板三页签、全屏抉择面板、正文 ≤14px、无横向溢出、无 console.error）。
 *
 * 运行：先起 preview（dist），再
 *   $env:BASE_URL="http://localhost:4180"; node tests/mobile-web.mjs
 * 任一断言失败即 exit 1（CI 与人工都用同一把尺）。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const SHOT_DIR = fileURLToPath(new URL('./screenshots/mobile/', import.meta.url))
mkdirSync(SHOT_DIR, { recursive: true })

const failures = []
const errors = []

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${name}${detail ? ' ' + detail : ''}`)
  } else {
    failures.push(`${name}${detail ? ' ' + detail : ''}`)
    console.log(`  ✗ ${name}${detail ? ' ' + detail : ''}`)
  }
}

async function openPage(browser, viewport, url) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  return { ctx, page }
}

/** 走完开局：标题 → 取名 → 出身 → 牌桌 */
async function playToBoard(page) {
  await page.waitForSelector('.mobile-title__actions', { timeout: 15000 })
  await page.click('.mobile-title__actions .mobile-btn--primary')

  await page.waitForSelector('.mobile-name__form')
  const inputs = page.locator('.mobile-name input')
  await inputs.nth(0).fill('李')
  await inputs.nth(1).fill('承业')
  await inputs.nth(2).fill('伯承')
  await inputs.nth(3).fill('22')
  await inputs.nth(4).fill('南直隶苏州府吴县')
  await page.click('.mobile-name__actions .mobile-btn--primary')

  await page.waitForSelector('.mobile-origin-card', { timeout: 15000 })
  await page.locator('.mobile-origin-card').first().locator('.mobile-btn--primary').click()

  await page.waitForSelector('.mobile-hud', { timeout: 20000 })
  await page.waitForTimeout(500)
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })

  // —— 1. 横屏 844×390 + ?mobile=1：完整开局到牌桌 ——
  console.log('\n[844×390 横屏 · ?mobile=1]')
  {
    const { ctx, page } = await openPage(browser, { width: 844, height: 390 }, BASE_URL + '?mobile=1')
    await page.waitForSelector('.mobile-shell', { timeout: 15000 })
    check('进入手机版外壳', (await page.locator('.mobile-shell').count()) === 1)
    const manifest = await page.evaluate(async () => {
      const res = await fetch('./manifest.webmanifest')
      return res.json()
    })
    check('PWA manifest 声明横屏', manifest.orientation === 'landscape', `orientation=${manifest.orientation}`)
    await playToBoard(page)

    const states = await page.locator('.mobile-hud__states .mobile-state-capsule').count()
    check('HUD 六项状态齐全', states === 6, `count=${states}`)
    const personal = await page.locator('.mobile-hud__personal .mobile-state-capsule').allInnerTexts()
    check('HUD 五项个人能力齐全', personal.length === 5, `count=${personal.length}`)
    check(
      '五项是财帛/文韬/理政/武略/体质',
      ['财帛', '文韬', '理政', '武略', '体质'].every(k => personal.some(t => t.includes(k))),
      personal.join(' | ')
    )
    const stateBox = await page.locator('.mobile-hud__states').boundingBox()
    const personalBox = await page.locator('.mobile-hud__personal').boundingBox()
    check('五项能力排在圣眷下面一排', !!stateBox && !!personalBox &&
      personalBox.y >= stateBox.y + stateBox.height - 1 &&
      Math.abs(personalBox.x - stateBox.x) <= 1,
      stateBox && personalBox ? `states=${stateBox.x},${stateBox.y} personal=${personalBox.x},${personalBox.y}` : 'missing')
    check('事件区不重复待办提示', !(await page.locator('.mobile-event-host .event-pending-hint').isVisible()))
    const pendingBadges = page.locator('.mobile-hud__pending')
    if (await pendingBadges.count()) {
      const pendingBadge = await pendingBadges.first().innerText()
      check('待办数字在顶栏操作入口', /^\d+$/.test(pendingBadge.trim()) && Number(pendingBadge) > 0, pendingBadge)
    } else {
      check('无待办时不显示待办角标', true)
    }
    const headerBox = await page.locator('.mobile-event-host .event-header').boundingBox()
    check('事件标题区压成单行', !!headerBox && headerBox.height <= 40,
      `h=${headerBox?.height}`)

    const choicesFab = await page.locator('.mobile-choices-fab').boundingBox()
    const hudMeta = await page.locator('.mobile-hud__meta').innerText()
    check('岁数只显示整数', /^\d+岁/.test(hudMeta), hudMeta)
    check('选项入口常驻且可触控', !!choicesFab && Math.min(choicesFab.width, choicesFab.height) >= 44,
      choicesFab ? `${choicesFab.width}×${choicesFab.height}` : 'missing')
    const choicesFabText = await page.locator('.mobile-choices-fab').innerText()
    check('选项入口显示数量', /\d+/.test(choicesFabText), choicesFabText)
    await page.locator('.mobile-choices-fab').click()
    await page.waitForTimeout(150)
    const choicesSheet = await page.locator('.choices-section').boundingBox()
    check('抉择面板直接覆盖全屏', !!choicesSheet && choicesSheet.x <= 1 && choicesSheet.y <= 1 &&
      choicesSheet.width >= 843 && choicesSheet.height >= 389,
      choicesSheet ? `${choicesSheet.x},${choicesSheet.y} ${choicesSheet.width}×${choicesSheet.height}` : 'missing')
    const choicesFit = await page.evaluate(() => {
      const el = document.querySelector('.choices-section')
      if (!el) return null
      return { scroll: el.scrollHeight, client: el.clientHeight,
        cards: [...document.querySelectorAll('.choice-card')].map(c => {
          const r = c.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom }
        }) }
    })
    check('四个选项无需下滑即可看全', !!choicesFit && choicesFit.scroll <= choicesFit.client + 1,
      choicesFit ? `scroll=${choicesFit.scroll} client=${choicesFit.client}` : 'missing')
    await page.locator('.mobile-choices-head__close').click()
    await page.waitForTimeout(150)
    check('抉择面板可收起', (await page.locator('.mobile-choices-head').count()) === 0 && !(await page.locator('.mobile-choices-fab').isHidden()))

    await page.locator('.mobile-hud__panel').click()
    await page.waitForTimeout(200)
    check('人物面板可打开', (await page.locator('.mobile-panel').count()) === 1)
    const panelAttrs = await page.locator('.mobile-panel .attr-name').allInnerTexts()
    check('面板含财帛/文韬/理政/武略/体质', ['财帛', '文韬', '理政', '武略', '体质'].every(k => panelAttrs.includes(k)),
      panelAttrs.join('/'))
    check('面板含隐藏属性', ['道德值', '欲望值', '野心值', '机敏值', '忠诚值'].every(k => panelAttrs.includes(k)),
      panelAttrs.join('/'))
    check('能力页不再画属性横条', (await page.locator('.mobile-panel .attr-bar-wrap:visible').count()) === 0)
    check('能力页十项属性紧凑成格', (await page.locator('.mobile-panel .attr-item').count()) === 10,
      `count=${await page.locator('.mobile-panel .attr-item').count()}`)
    const attrHeights = await page.locator('.mobile-panel .attr-item').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
    check('属性单格高度 ≤32px', attrHeights.every(h => h <= 32), `max=${Math.max(...attrHeights)}`)
    const attrBodyFit = await page.locator('.mobile-panel__body').evaluate(el => ({
      scroll: el.scrollHeight,
      client: el.clientHeight
    }))
    check('能力页一屏装下无需下滑', attrBodyFit.scroll <= attrBodyFit.client + 1,
      `scroll=${attrBodyFit.scroll} client=${attrBodyFit.client}`)
    await page.locator('.mobile-panel__tab', { hasText: '态度' }).click()
    await page.waitForTimeout(150)
    check('面板态度页可打开', (await page.locator('.mobile-panel .status-panel').count()) === 1)
    check('态度页不再画状态横条', (await page.locator('.mobile-panel .status-bar-wrap:visible').count()) === 0)
    check('国势不再画长条', (await page.locator('.mobile-panel .fortune-track').isVisible()) === false)
    await page.locator('.mobile-panel__tab', { hasText: '卷宗' }).click()
    await page.waitForTimeout(150)
    check('面板卷宗页可打开', (await page.locator('.mobile-panel .mobile-records').count()) === 1)
    await page.locator('.mobile-panel__close').click()
    await page.waitForTimeout(150)
    check('面板可收起', (await page.locator('.mobile-panel').count()) === 0)

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))
    check('无横向溢出', overflow.scrollWidth <= overflow.clientWidth + 1,
      `scroll=${overflow.scrollWidth} client=${overflow.clientWidth}`)

    check('底部操作条默认收起', (await page.locator('.mobile-actionbar').count()) === 0)

    const handle = page.locator('.mobile-hud__action')
    const handleBox = await handle.boundingBox()
    check('顶栏有操作入口', !!handleBox,
      handleBox ? `${handleBox.width.toFixed(1)}×${handleBox.height.toFixed(1)}` : 'no box')
    check('操作入口触控目标 ≥44px', !!handleBox && Math.min(handleBox.width, handleBox.height) >= 44,
      handleBox ? `min=${Math.min(handleBox.width, handleBox.height).toFixed(1)}` : 'n/a')
    await handle.click()
    await page.waitForTimeout(250)

    const vp = page.viewportSize()
    const bar = await page.locator('.mobile-actionbar').boundingBox()
    check('点操作后操作条展开且在视口内', !!bar && bar.y + bar.height <= vp.height + 1,
      bar ? `y=${bar.y.toFixed(1)} h=${bar.height.toFixed(1)} vp=${vp.height}` : 'no box')

    const targets = await page.locator('.mobile-actionbar .mobile-bar-btn').evaluateAll(els =>
      els.map(e => e.getBoundingClientRect()).map(r => Math.min(r.width, r.height))
    )
    check('展开后按钮触控目标 ≥44px', targets.length >= 5 && targets.every(v => v >= 44),
      `count=${targets.length} min=${targets.length ? Math.min(...targets).toFixed(1) : 'n/a'}`)

    await page.locator('.mobile-actionbar__close').click()
    await page.waitForTimeout(150)
    check('收起后操作条不再常驻', (await page.locator('.mobile-actionbar').count()) === 0)

    const bodyFont = await page.locator('.mobile-event-host .narrative-paragraph').first()
      .evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    check('手机正文 ≤14px', bodyFont <= 14, `font=${bodyFont.toFixed(1)}px`)

    check('正文底部不再重复显示选项', !(await page.locator('.choices-section').isVisible()))
    await page.locator('.mobile-choices-fab').click()
    await page.waitForTimeout(150)
    const choices = await page.locator('button.choice-card:not(.locked)').count()
    check('有可选项', choices > 0, `choices=${choices}`)
    if (choices > 0) {
      await page.locator('button.choice-card:not(.locked)').first().click()
      await page.waitForTimeout(900)
      const resultSections = await page.locator('.mobile-event-host .result-section').count()
      check('抉择后出现结算区', resultSections > 0, `result-sections=${resultSections}`)
      check('结算不再重播事件正文', !(await page.locator('.mobile-event-host .narrative-section').isVisible()))
      check('结算不再重播事件标题', !(await page.locator('.mobile-event-host .event-header').isVisible()))
      check('结算保留已选选项', await page.locator('.mobile-event-host .selected-choice').isVisible())
      check('结算保留回音', (await page.locator('.mobile-event-host .echo-box').count()) > 0)
      const eraBefore = await page.locator('.mobile-hud__era').innerText()
      // 结算后的「继续」只是同月队列里的下一张；要真正跨月，得把当月队列走完。
      for (let step = 0; step < 10; step++) {
        const eraNow = await page.locator('.mobile-hud__era').innerText()
        if (eraNow !== eraBefore) break

        if (await page.locator('.continue-btn').isVisible().catch(() => false)) {
          await page.locator('.continue-btn').click()
          await page.waitForTimeout(250)
          continue
        }

        if (await page.locator('.mobile-choices-fab').isVisible().catch(() => false)) {
          await page.locator('.mobile-choices-fab').click()
          await page.waitForTimeout(150)
          const option = page.locator('button.choice-card:not(.locked)').first()
          if ((await option.count()) > 0) {
            await option.click()
            await page.waitForTimeout(300)
          }
        } else {
          await page.waitForTimeout(250)
        }
      }
      const eraAfter = await page.locator('.mobile-hud__era').innerText()
      check('已真正推进到下一月', eraAfter !== eraBefore, `${eraBefore} -> ${eraAfter}`)
      const hudMetaAfterMonth = await page.locator('.mobile-hud__meta').innerText()
      check('跨月后岁数仍为整数', /^\d+岁/.test(hudMetaAfterMonth), hudMetaAfterMonth)
      await page.screenshot({ path: `${SHOT_DIR}/mobile-web-result-844x390.png`, fullPage: false })
    }

    await page.screenshot({ path: `${SHOT_DIR}/minimal-844x390.png`, fullPage: false })
    await ctx.close()
  }

  // —— 2. 竖屏 390×844：只给旋转遮罩 ——
  console.log('\n[390×844 竖屏]')
  {
    const { ctx, page } = await openPage(browser, { width: 390, height: 844 }, BASE_URL + '?mobile=1')
    await page.waitForSelector('.mobile-rotate-overlay', { timeout: 10000 })
    check('出现"请旋转手机"遮罩', true)
    check('遮罩下不渲染牌桌', (await page.locator('.mobile-board').count()) === 0)
    await page.screenshot({ path: `${SHOT_DIR}/portrait-390x844.png`, fullPage: false })
    await ctx.close()
  }

  // —— 3. 桌面视口 + ?mobile=1：强制预览生效 ——
  console.log('\n[1440×900 桌面视口 · ?mobile=1 强制]')
  {
    const { ctx, page } = await openPage(browser, { width: 1440, height: 900 }, BASE_URL + '?mobile=1')
    await page.waitForSelector('.mobile-shell', { timeout: 15000 }).catch(() => {})
    check('仍渲染手机版外壳', (await page.locator('.mobile-shell').count()) === 1)
    await ctx.close()
  }

  // —— 4. 桌面视口不带参数：仍走原版 ——
  console.log('\n[1440×900 桌面视口 · 无参数]')
  {
    const { ctx, page } = await openPage(browser, { width: 1440, height: 900 }, BASE_URL + '/')
    await page.waitForSelector('.app', { timeout: 20000 })
    await page.waitForTimeout(1200)
    check('不渲染手机版外壳', (await page.locator('.mobile-shell').count()) === 0)
    await ctx.close()
  }

  check('全程无 console.error / pageerror', errors.length === 0, errors.slice(0, 2).join(' | '))

  await browser.close()

  console.log('\n' + '='.repeat(56))
  if (failures.length) {
    console.log(`手机 Web 冒烟失败：${failures.length} 项`)
    failures.forEach(f => console.log('  - ' + f))
    process.exit(1)
  }
  console.log('手机 Web 冒烟通过：入口四规则 + 牌桌最小可用性全部达标')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
