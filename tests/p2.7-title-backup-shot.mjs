import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p2.7-title/', import.meta.url))
const BACKUP = fileURLToPath(new URL('../tmp/p2.6/backup-1440.json', import.meta.url))
mkdirSync(OUT, { recursive: true })

async function noSaveTitle(browser, viewport, suffix, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.addInitScript(() => localStorage.clear())
  await page.goto(`${BASE}${mobile ? '?mobile=1&debug=0' : '?debug=0'}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector(mobile ? '.mobile-title' : '.title-screen', { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}${suffix}-标题无存档-${viewport.width}x${viewport.height}.png` })

  const loadBtn = mobile
    ? page.locator('.mobile-btn', { hasText: /读.*取.*存.*档/ }).first()
    : page.locator('.title-btn', { hasText: /读.*取.*存.*档/ }).first()
  const loadVisible = await loadBtn.isVisible().catch(() => false)
  await loadBtn.click()
  await page.waitForSelector('.save-slots-modal', { timeout: 15000 })
  await page.waitForSelector('.save-empty-hint', { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}${suffix}-空存档弹窗-${viewport.width}x${viewport.height}.png` })

  const metrics = await page.evaluate(() => {
    const modal = document.querySelector('.save-slots-modal')
    const hint = document.querySelector('.save-empty-hint')
    const bar = document.querySelector('.save-backup-bar')
    const r = modal.getBoundingClientRect()
    return {
      modal: [Math.round(r.width), Math.round(r.height)],
      hint: hint?.textContent?.trim(),
      barVisible: !!bar && bar.getBoundingClientRect().height > 0,
      loadVisible: true,
      overflowX: document.body.scrollWidth > innerWidth + 1,
      bodyScroll: document.body.scrollHeight > innerHeight + 1
    }
  })
  console.log(`${suffix}: loadVisible=${loadVisible} ${JSON.stringify(metrics)} errors=${errors.length}`)

  if (!mobile) {
    await page.locator('.save-backup-file').setInputFiles(BACKUP)
    await page.waitForSelector('.cd-panel', { timeout: 15000 })
    await page.waitForTimeout(350)
    await page.locator('.cd-btn-primary').click()
    await page.waitForSelector('.save-slots-list:not(.save-slots-list--empty)', { timeout: 15000 })
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => ({
      hintGone: !document.querySelector('.save-empty-hint'),
      slots: document.querySelectorAll('.save-slot').length,
      modal: (() => {
        const r = document.querySelector('.save-slots-modal').getBoundingClientRect()
        return [Math.round(r.width), Math.round(r.height)]
      })()
    }))
    await page.screenshot({ path: `${OUT}${suffix}-无档导入后-${viewport.width}x${viewport.height}.png` })
    console.log(`${suffix} import: ${JSON.stringify(after)}`)
  }

  await context.close()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await noSaveTitle(browser, { width: 1440, height: 900 }, '桌面', false)
  await noSaveTitle(browser, { width: 924, height: 426 }, '手机', true)
} finally {
  await browser.close()
}
