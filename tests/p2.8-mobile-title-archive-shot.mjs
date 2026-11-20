import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p2.8-mobile-title/', import.meta.url))
const BACKUP = fileURLToPath(new URL('../tmp/p2.6/backup-1440.json', import.meta.url))
const bundle = JSON.parse(readFileSync(BACKUP, 'utf8'))
const AUTOSAVE = JSON.stringify(bundle.autosave)
mkdirSync(OUT, { recursive: true })

const VIEW = { width: 924, height: 426 }

async function openTitle(browser, { withSave }) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  const lazyChunks = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('request', (r) => {
    if (/AchievementPanel|EndingCodex|TutorialModal/.test(r.url())) lazyChunks.push(r.url().split('/').pop())
  })
  await page.addInitScript(({ save, withSave }) => {
    localStorage.clear()
    if (withSave) {
      localStorage.setItem('chongzhen_autosave', save)
      localStorage.setItem('chongzhen_autosave_seq', '1')
    }
  }, { save: AUTOSAVE, withSave })
  await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  await page.waitForTimeout(300)
  return { context, page, errors, lazyChunks }
}

function rect(el) {
  const r = el.getBoundingClientRect()
  return {
    width: Math.round(r.width),
    height: Math.round(r.height),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom)
  }
}

async function titleMetrics(page) {
  return page.evaluate(() => {
    const title = document.querySelector('.mobile-title')
    const extras = document.querySelector('.mobile-title__extras')
    const buttons = Array.from(document.querySelectorAll('.mobile-title__extra'))
    const tr = title.getBoundingClientRect()
    const er = extras.getBoundingClientRect()
    return {
      title: [Math.round(tr.width), Math.round(tr.height)],
      scrollHeight: title.scrollHeight,
      clientHeight: title.clientHeight,
      extras: [Math.round(er.width), Math.round(er.height)],
      extraButtons: buttons.length,
      extraBottom: Math.round(Math.max(...buttons.map(b => b.getBoundingClientRect().bottom))),
      viewport: [innerWidth, innerHeight],
      bodyScroll: document.body.scrollHeight > innerHeight + 1,
      overflowX: document.body.scrollWidth > innerWidth + 1
    }
  })
}

async function modalMetrics(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.achievement-panel, .ending-codex-modal, .tutorial-modal')
    const close = document.querySelector('.achievement-panel .close-button, .ending-codex-modal .codex-close-btn, .tutorial-modal .tutorial-close')
    const body = document.querySelector('.achievement-list, .codex-content, .tutorial-body')
    const r = modal.getBoundingClientRect()
    const c = close?.getBoundingClientRect()
    const primary = document.querySelector('.tutorial-actions .tutorial-btn.primary')
    const skip = document.querySelector('.tutorial-skip button')
    const visibleInside = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return b.top >= r.top && b.bottom <= r.bottom && b.bottom <= innerHeight
    }
    return {
      modal: [Math.round(r.width), Math.round(r.height)],
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      closeVisible: !!c && c.top >= 0 && c.bottom <= innerHeight,
      primaryVisible: visibleInside(primary),
      skipVisible: visibleInside(skip),
      innerScroll: body ? { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight } : null,
      overflowX: document.body.scrollWidth > innerWidth + 1
    }
  })
}

async function checkBonusScreens(browser, withSave, suffix) {
  const { context, page, errors, lazyChunks } = await openTitle(browser, { withSave })
  await page.screenshot({ path: `${OUT}${suffix}-标题-${VIEW.width}x${VIEW.height}.png` })
  const title = await titleMetrics(page)
  console.log(`${suffix} title: ${JSON.stringify(title)} lazyChunks=${JSON.stringify(lazyChunks)} errors=${errors.length}`)

  const cases = [
    ['成就', /成.*就/, '.achievement-panel', '.close-button'],
    ['局鉴', /局.*鉴/, '.ending-codex-modal', '.codex-close-btn'],
    ['帮助', /帮.*助/, '.tutorial-modal', '.tutorial-close']
  ]
  for (const [name, btnName, modalClass, closeClass] of cases) {
    await page.locator('.mobile-title__extra', { hasText: btnName }).click()
    await page.waitForSelector(modalClass, { timeout: 15000 })
    await page.waitForTimeout(350)
    const m = await modalMetrics(page)
    await page.screenshot({ path: `${OUT}${suffix}-${name}-${VIEW.width}x${VIEW.height}.png` })
    let closed = false
    let stepReport = ''
    if (name === '帮助') {
      const steps = []
      for (let i = 0; i < 12; i++) {
        if ((await page.locator(modalClass).count()) === 0) break
        const state = await page.evaluate(() => {
          const modal = document.querySelector('.tutorial-modal')
          const mr = modal.getBoundingClientRect()
          const primary = document.querySelector('.tutorial-actions .tutorial-btn.primary')
          const skip = document.querySelector('.tutorial-skip button')
          const inside = (el) => {
            const r = el.getBoundingClientRect()
            return r.top >= mr.top && r.bottom <= mr.bottom && r.bottom <= innerHeight
          }
          return {
            primaryVisible: inside(primary),
            skipVisible: inside(skip),
            body: [document.querySelector('.tutorial-body').scrollHeight, document.querySelector('.tutorial-body').clientHeight]
          }
        })
        steps.push(state)
        await page.locator('.tutorial-actions .tutorial-btn.primary').click()
        await page.waitForTimeout(250)
      }
      closed = (await page.locator(modalClass).count()) === 0
      stepReport = ` steps=${JSON.stringify(steps)}`
    } else {
      await page.locator(modalClass).locator(closeClass).click()
      await page.waitForSelector(modalClass, { state: 'detached', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(200)
      closed = (await page.locator(modalClass).count()) === 0
    }
    console.log(`${suffix} ${name}: ${JSON.stringify(m)} closed=${closed} errors=${errors.length}${stepReport}`)
  }

  await context.close()
  return errors
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const e1 = await checkBonusScreens(browser, false, '无档')
  const e2 = await checkBonusScreens(browser, true, '有档')
  const all = [...e1, ...e2]
  if (all.length) console.log(`ERRORS: ${all.join(' | ')}`)
} finally {
  await browser.close()
}
