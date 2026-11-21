/**
 * P3.2 年度史载卡实测：把存档停在崇祯元年腊月，处理「年终总结」后进入次年正月，
 * 检查桌面 1440×900 / 1024×768 与手机 924×426 / 480×320 上的卡片尺寸、文字、溢出和报错。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p3.2-annual/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const raw = readFileSync(new URL('../tmp/p3.2-year-save.json', import.meta.url), 'utf8')

async function openGame(page, mobile = false) {
  await page.addInitScript(({ save }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', save)
    localStorage.setItem('chongzhen_autosave_seq', '1')
    localStorage.setItem('chongzhen_save_slot_1', save)
  }, { save: raw })
  await page.goto(`${BASE}?${mobile ? 'mobile=1&' : ''}debug=0`, { waitUntil: 'load', timeout: 60000 })
}

async function resolveCurrentEvent(page) {
  for (let round = 0; round < 8; round++) {
    if (await page.locator('.annual-chronicle').isVisible().catch(() => false)) return true

    const fab = page.locator('.desktop-choices-fab, .mobile-choices-fab').first()
    if (await fab.isVisible().catch(() => false)) {
      await fab.click()
      await page.waitForTimeout(150)
    }

    const firstChoice = page.locator('.choice-card:not(.locked)').first()
    if (!(await firstChoice.isVisible().catch(() => false))) return false

    await firstChoice.click()
    await page.waitForSelector('.result-actions .continue-btn', { timeout: 15000 })
    await page.locator('.result-actions .continue-btn').click()
    await page.waitForTimeout(320)
  }
  throw new Error('December events did not settle after 8 rounds')
}

async function advanceToChronicle(page) {
  const mobile = await page.locator('.mobile-board').count() > 0
  for (let round = 0; round < 10; round++) {
    if (await resolveCurrentEvent(page)) {
      await page.waitForSelector('.annual-chronicle', { timeout: 15000 })
      await page.waitForTimeout(400)
      return
    }

    if (mobile) {
      const actionToggle = page.locator('.mobile-hud__action')
      if (await actionToggle.isVisible().catch(() => false)) {
        await actionToggle.click()
        await page.waitForTimeout(180)
      }
    }

    const nextMonth = page.locator('.action-btn.primary, .mobile-bar-btn--primary').first()
    if (await nextMonth.isEnabled().catch(() => false)) {
      await nextMonth.click()
      await page.waitForTimeout(500)
    }
  }
  await page.waitForSelector('.annual-chronicle', { timeout: 15000 })
  await page.waitForTimeout(400)
}

async function measure(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.annual-chronicle')
    const overlay = document.querySelector('.annual-chronicle-overlay')
    const r = card.getBoundingClientRect()
    const o = overlay.getBoundingClientRect()
    const records = Array.from(document.querySelectorAll('.annual-chronicle__record-title'))
      .map((node) => node.textContent)
    const stats = Array.from(document.querySelectorAll('.annual-chronicle__stat-value'))
      .map((node) => node.textContent)
    return {
      era: document.querySelector('.annual-chronicle__era')?.textContent,
      headline: document.querySelector('.annual-chronicle__headline')?.textContent,
      detail: document.querySelector('.annual-chronicle__detail')?.textContent?.slice(0, 28),
      stats,
      career: document.querySelector('.annual-chronicle__career')?.textContent?.replace(/\s+/g, ' ').trim(),
      pips: document.querySelectorAll('.annual-chronicle__pip').length,
      donePips: document.querySelectorAll('.annual-chronicle__pip.is-done').length,
      records,
      next: document.querySelector('.annual-chronicle__next')?.textContent,
      card: [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.bottom)],
      overlay: [Math.round(o.width), Math.round(o.height)],
      cardScroll: [card.scrollWidth, card.clientWidth, card.scrollHeight, card.clientHeight],
      overflowX: document.body.scrollWidth > innerWidth + 1,
      pageScroll: document.body.scrollHeight > innerHeight + 1,
      viewport: [innerWidth, innerHeight]
    }
  })
}

async function desktop(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await openGame(page, false)
  await page.waitForSelector('.title-screen', { timeout: 15000 })
  await page.locator('.title-btn--autosave').first().click()
  await page.waitForSelector('.game-screen', { timeout: 15000 })
  await advanceToChronicle(page)

  const metrics = await measure(page)
  await page.screenshot({ path: `${OUT}桌面-年度史载-${viewport.width}x${viewport.height}.png` })
  console.log(`desktop ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
  return { metrics, errors }
}

async function mobile(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await openGame(page, true)
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  await page.getByRole('button', { name: /继.*续.*上.*次/ }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 15000 })
  await advanceToChronicle(page)

  const metrics = await measure(page)
  await page.screenshot({ path: `${OUT}手机-年度史载-${viewport.width}x${viewport.height}.png` })
  console.log(`mobile ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
  return { metrics, errors }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const d1 = await desktop(browser, { width: 1440, height: 900 })
  const d2 = await desktop(browser, { width: 1024, height: 768 })
  const m1 = await mobile(browser, { width: 924, height: 426 })
  const m2 = await mobile(browser, { width: 480, height: 320 })

  const all = [d1, d2, m1, m2]
  const ok =
    all.every(({ metrics, errors }) =>
      metrics.headline === '魏忠贤伏诛，崇祯新政初启' &&
      metrics.era === '崇祯元年 · 岁末史载' &&
      metrics.next === '崇祯二年 · 正月已至' &&
      metrics.stats[0] === '从六品·通判' &&
      Number(metrics.stats[1]) > 300 &&
      metrics.stats[2] === '6 事' &&
      metrics.pips === 3 && metrics.donePips === 2 &&
      metrics.career?.includes('清名 2/3') &&
      metrics.stats[4] === '权谋之术' &&
      metrics.records.join('|') === '清丈田亩|官升一级|阉党覆灭|年终总结' &&
      metrics.card[0] <= metrics.viewport[0] - 20 &&
      metrics.card[1] <= metrics.viewport[1] - 20 &&
      metrics.card[2] >= 0 &&
      metrics.card[3] <= metrics.viewport[1] + 1 &&
      !metrics.overflowX &&
      errors.length === 0
    ) &&
    (m1.metrics.pageScroll === false) &&
    (m1.metrics.cardScroll[3] <= m1.metrics.cardScroll[2] + 1) &&
    (m2.metrics.cardScroll[0] <= m2.metrics.cardScroll[1] + 1)

  console.log(ok ? 'P3.2 年度史载卡 OK' : 'P3.2 年度史载卡 FAIL')
  process.exitCode = ok ? 0 : 1
} finally {
  await browser.close()
}
