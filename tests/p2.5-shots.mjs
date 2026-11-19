import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://localhost:4181/'
const OUT = fileURLToPath(new URL('../tmp/p2.5-events/', import.meta.url))
const save = readFileSync(new URL('../tmp/p2.5-event-save.json', import.meta.url), 'utf8')

async function openEvent(page, mobile) {
  await page.addInitScript(({ raw }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', raw)
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, { raw: save })
  await page.goto(`${BASE}${mobile ? '?mobile=1&debug=0' : '?debug=0'}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(400)
  const selector = mobile ? '.mobile-title .mobile-btn' : '.title-btn--autosave'
  await page.waitForSelector(selector, { timeout: 15000 })
  const buttons = page.locator(selector)
  if (mobile) await buttons.nth(1).click()
  else await buttons.first().click()
  await page.waitForSelector(mobile ? '.mobile-board' : '.game-screen', { timeout: 15000 })
  await page.waitForSelector('.event-display', { timeout: 15000 })
  await page.waitForSelector('.event-illustration img', { timeout: 15000 })
  await page.waitForFunction(() => {
    const img = document.querySelector('.event-illustration img')
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
  }, { timeout: 15000 })
  await page.waitForTimeout(300)
}

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
  await openEvent(page, viewport.mobile)
  const metrics = await page.evaluate(() => {
    const image = document.querySelector('.event-illustration img')
    const panel = document.querySelector('.event-display')
    const r = image.getBoundingClientRect()
    return {
      viewport: [innerWidth, innerHeight],
      image: {
        src: image.getAttribute('src'),
        natural: [image.naturalWidth, image.naturalHeight],
        rendered: [Math.round(r.width), Math.round(r.height)],
        top: Math.round(r.top),
        bottom: Math.round(r.bottom)
      },
      panel: { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight },
      bodyOverflow: document.body.scrollHeight > innerHeight + 1
    }
  })
  await page.screenshot({ path: `${OUT}${suffix}-事件-${viewport.width}x${viewport.height}.png` })
  if (viewport.mobile) {
    const fab = page.locator('.mobile-choices-fab')
    if (await fab.count()) {
      await fab.click()
      await page.waitForTimeout(250)
    }
  }
  await page.locator('.choice-card').first().click()
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}${suffix}-事件结果-${viewport.width}x${viewport.height}.png` })
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
