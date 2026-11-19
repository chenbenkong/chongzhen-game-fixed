import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:4181/'
const OUT = fileURLToPath(new URL('../tmp/p2.5-events/', import.meta.url))
const PREFIX = process.env.SHOT_PREFIX || ''
const save = readFileSync(new URL('../tmp/p2.5-ending-save.json', import.meta.url), 'utf8')

async function run(browser, viewport, suffix) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.mobile,
    deviceScaleFactor: viewport.mobile ? 2 : 1
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(({ raw }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', raw)
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, { raw: save })
  await page.goto(`${BASE}${viewport.mobile ? '?mobile=1&debug=0' : '?debug=0'}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(400)
  const selector = viewport.mobile ? '.mobile-title .mobile-btn' : '.title-btn--autosave'
  await page.waitForSelector(selector, { timeout: 15000 })
  const buttons = page.locator(selector)
  if (viewport.mobile) await buttons.nth(1).click()
  else await buttons.first().click()
  await page.waitForSelector('.event-display', { timeout: 15000 })
  if (viewport.mobile) {
    const fab = page.locator('.mobile-choices-fab')
    if (await fab.count()) {
      await fab.click()
      await page.waitForTimeout(250)
    }
  }
  await page.locator('.choice-card:not(.locked)').first().click()
  await page.waitForSelector('.ending-screen, .continue-btn', { timeout: 15000 })
  if ((await page.locator('.ending-screen').count()) === 0 && (await page.locator('.continue-btn').count())) {
    await page.locator('.continue-btn').click()
  }
  await page.waitForSelector('.ending-screen', { timeout: 15000 })
  await page.waitForFunction(() => {
    const seal = document.querySelector('.ending-seal')
    return seal instanceof HTMLImageElement && seal.complete && seal.naturalWidth > 0
  }, { timeout: 15000 })
  await page.waitForTimeout(350)
  const metrics = await page.evaluate(() => {
    const seal = document.querySelector('.ending-seal')
    const footer = document.querySelector('.ending-actions--footer')
    const buttons = Array.from(document.querySelectorAll('.ending-actions--footer button'))
    const rect = seal.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()
    const overlaps = buttons.map((button) => {
      const b = button.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.right, b.right) - Math.max(rect.left, b.left))
      const y = Math.max(0, Math.min(rect.bottom, b.bottom) - Math.max(rect.top, b.top))
      return Math.round(x * y)
    })
    return {
      viewport: [innerWidth, innerHeight],
      seal: {
        rendered: [Math.round(rect.width), Math.round(rect.height)],
        opacity: getComputedStyle(seal).opacity,
        right: Math.round(innerWidth - rect.right),
        bottom: Math.round(innerHeight - rect.bottom)
      },
      footer: { top: Math.round(footerRect.top), bottom: Math.round(footerRect.bottom) },
      buttonsInView: buttons.every((button) => {
        const b = button.getBoundingClientRect()
        return b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1
      }),
      overlapAreas: overlaps,
      scroll: { body: document.body.scrollHeight, viewport: innerHeight }
    }
  })
  await page.screenshot({ path: `${OUT}${PREFIX}${suffix}-结局-${viewport.width}x${viewport.height}.png` })
  console.log(`${viewport.name}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await run(browser, { name: '桌面', width: 1440, height: 900, mobile: false }, '桌面')
  await run(browser, { name: '手机', width: 924, height: 426, mobile: true }, '手机')
} finally {
  await browser.close()
}
