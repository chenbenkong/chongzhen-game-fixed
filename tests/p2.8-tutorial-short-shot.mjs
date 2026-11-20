import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p2.8-tutorial/', import.meta.url))
mkdirSync(OUT, { recursive: true })

async function measure(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.tutorial-modal')
    const mr = modal.getBoundingClientRect()
    const close = document.querySelector('.tutorial-close').getBoundingClientRect()
    const primary = document.querySelector('.tutorial-actions .tutorial-btn.primary').getBoundingClientRect()
    const skip = document.querySelector('.tutorial-skip button').getBoundingClientRect()
    const body = document.querySelector('.tutorial-body')
    const inside = (r) => r.top >= mr.top && r.bottom <= mr.bottom && r.bottom <= innerHeight
    return {
      modal: [Math.round(mr.width), Math.round(mr.height)],
      top: Math.round(mr.top),
      bottom: Math.round(mr.bottom),
      closeVisible: close.top >= 0 && close.bottom <= innerHeight,
      primaryVisible: inside(primary),
      skipVisible: inside(skip),
      bodyScroll: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight },
      overflowX: document.body.scrollWidth > innerWidth + 1
    }
  })
}

async function openTutorial(browser, viewport, font, suffix, keepShot) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${BASE}?debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.title-screen', { timeout: 15000 })
  if (font) await page.evaluate((f) => { document.documentElement.style.fontSize = f }, font)
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.title-follow-btn')).find(b => /帮.*助/.test(b.textContent || ''))
    btn?.click()
  })
  await page.waitForSelector('.tutorial-modal', { timeout: 15000 })
  await page.waitForTimeout(350)
  const m = await measure(page)
  if (keepShot) await page.screenshot({ path: `${OUT}${suffix}-${viewport.width}x${viewport.height}.png` })
  console.log(`${suffix}: ${JSON.stringify(m)} errors=${errors.length}`)
  await context.close()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await openTutorial(browser, { width: 1440, height: 900 }, null, '桌面-帮助', true)
  await openTutorial(browser, { width: 1280, height: 600 }, '200%', '短桌面-帮助-200', true)
} finally {
  await browser.close()
}
