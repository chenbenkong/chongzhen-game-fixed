/**
 * P4.5 极短屏牌桌 HUD 实拍：
 * 480×320 原本 HUD 222px、事件区 90px；改为「身份 + 三按钮一行、
 * 六方局势一行、个人能力进面板」后，HUD 应 ≤140、事件区 ≥170。
 * 924×426 与桌面保持原样，个人能力仍在 HUD。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.5-short-hud/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const save = readFileSync(new URL('../tmp/p3.1-career-save.json', import.meta.url), 'utf8')

async function run(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript(({ save }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', save)
    localStorage.setItem('chongzhen_autosave_seq', '1')
    localStorage.setItem('chongzhen_save_slot_1', save)
  }, { save })
  await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  await page.waitForTimeout(1900)
  await page.getByRole('button', { name: /继.*续.*上.*次/ }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 15000 })
  await page.waitForSelector('.mobile-hud__route', { timeout: 15000 })
  await page.waitForTimeout(500)

  const metrics = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const hud = document.querySelector('.mobile-hud')
    const identity = document.querySelector('.mobile-hud__identity')
    const states = [...document.querySelectorAll('.mobile-hud__states .mobile-state-capsule')]
    const visibleStates = states.filter(el => getComputedStyle(el).display !== 'none')
    const rows = new Set(visibleStates.map(el => Math.round(el.getBoundingClientRect().top)))
    const personal = document.querySelector('.mobile-hud__personal')
    const bgm = document.querySelector('.mobile-hud .bgm-toggle--inline')
    const panel = document.querySelector('.mobile-hud__panel')
    const action = document.querySelector('.mobile-hud__action')
    const host = document.querySelector('.mobile-event-host')
    const h = rect(hud)
    const i = rect(identity)
    const b = rect(bgm)
    const p = rect(panel)
    const a = rect(action)
    const e = rect(host)
    return {
      hud: [h.w, h.h],
      identity: i,
      bgm: b,
      panel: p,
      action: a,
      buttonsClearIdentity: b.x > i.right && p.x > i.right && a.x > i.right,
      buttonsInHud: b.right <= h.x + h.w && a.right <= h.x + h.w,
      eventHost: [e.w, e.h],
      eventBelowHud: e.y >= h.y + h.h,
      personalDisplay: getComputedStyle(personal).display,
      stateCount: visibleStates.length,
      stateRows: rows.size,
      routeText: document.querySelector('.mobile-hud__route').textContent.replace(/\s+/g, ' ').trim(),
      overflowX: document.body.scrollWidth > innerWidth + 1,
      pageScroll: document.body.scrollHeight > innerHeight + 1,
      viewport: [innerWidth, innerHeight]
    }
  })
  await page.screenshot({ path: `${OUT}手机-牌桌-${viewport.width}x${viewport.height}.png` })
  await context.close()
  console.log(`${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  return { metrics, errors }
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const short = [
    { width: 440, height: 320 },
    { width: 480, height: 320 },
    { width: 568, height: 320 },
    { width: 640, height: 360 }
  ]
  const results = []
  for (const viewport of short) results.push(await run(browser, viewport))
  results.push(await run(browser, { width: 924, height: 426 }))

  const shortOk = results.slice(0, 4).every(({ metrics, errors }) =>
    errors.length === 0 &&
    metrics.hud[1] <= 140 &&
    metrics.eventHost[1] >= 170 &&
    metrics.eventBelowHud &&
    metrics.personalDisplay === 'none' &&
    metrics.stateCount === 6 &&
    metrics.stateRows === 1 &&
    metrics.buttonsClearIdentity &&
    metrics.buttonsInHud &&
    !metrics.overflowX &&
    !metrics.pageScroll &&
    metrics.routeText.includes('清名 2/3') &&
    metrics.routeText.includes('权谋之术')
  )
  const wide = results[4]
  const wideOk =
    wide.errors.length === 0 &&
    wide.metrics.hud[1] <= 110 &&
    wide.metrics.eventHost[1] >= 300 &&
    wide.metrics.personalDisplay !== 'none' &&
    !wide.metrics.overflowX &&
    !wide.metrics.pageScroll

  console.log(shortOk && wideOk ? 'P4.5 极短屏 HUD OK' : 'P4.5 极短屏 HUD FAIL')
  if (!(shortOk && wideOk)) process.exit(1)
} finally {
  await browser.close()
}
