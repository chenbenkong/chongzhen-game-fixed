import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p2.6/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const save = readFileSync(new URL('../tmp/p2.5-event-save.json', import.meta.url), 'utf8')

async function boot(page) {
  await page.addInitScript(({ raw }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', raw)
    localStorage.setItem('chongzhen_autosave_seq', '1')
    localStorage.setItem('chongzhen_save_slot_1', raw)
  }, { raw: save })
  await page.goto(`${BASE}?debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.title-screen', { timeout: 15000 })
  await page.waitForTimeout(250)
}

async function saveBackup(browser, viewport, suffix) {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await boot(page)
  await page.getByRole('button', { name: /读.*取.*存.*档/ }).click()
  await page.waitForSelector('.save-slots-modal', { timeout: 15000 })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}${suffix}-存档备份-${viewport.width}x${viewport.height}.png` })

  const downloadPromise = page.waitForEvent('download', { timeout: 15000 })
  await page.getByRole('button', { name: '导出备份' }).click()
  const download = await downloadPromise
  const backupPath = `${OUT}backup-${viewport.width}.json`
  await download.saveAs(backupPath)

  await page.locator('.save-backup-file').setInputFiles(backupPath)
  await page.waitForSelector('.cd-panel', { timeout: 15000 })
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}${suffix}-导入确认-${viewport.width}x${viewport.height}.png` })
  await page.locator('.cd-btn-primary').click()
  await page.waitForSelector('.save-backup-notice--ok', { timeout: 15000 })

  const metrics = await page.evaluate(() => {
    const modal = document.querySelector('.save-slots-modal')
    const bar = document.querySelector('.save-backup-bar')
    const r = modal.getBoundingClientRect()
    return {
      modal: [Math.round(r.width), Math.round(r.height)],
      barVisible: !!bar && bar.getBoundingClientRect().height > 0,
      notice: document.querySelector('.save-backup-notice')?.textContent?.trim(),
      overflowX: document.body.scrollWidth > innerWidth + 1
    }
  })
  await page.screenshot({ path: `${OUT}${suffix}-存档备份完成-${viewport.width}x${viewport.height}.png` })
  console.log(`save ${suffix}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
}

async function choicePanel(browser, viewport, suffix) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: false
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await boot(page)
  await page.locator('.title-btn--autosave').first().click()
  await page.waitForSelector('.game-screen', { timeout: 15000 })
  await page.waitForSelector('.event-display', { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${suffix}-事件-${viewport.width}x${viewport.height}.png` })

  await page.locator('.desktop-choices-fab').click()
  await page.waitForSelector('.desktop-choices-panel', { timeout: 15000 })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}${suffix}-本月抉择-${viewport.width}x${viewport.height}.png` })

  // 目录也是模态层：S / A 不能穿透到下面，再叠存档或成就面板。
  await page.keyboard.press('s')
  await page.waitForTimeout(200)
  await page.keyboard.press('a')
  await page.waitForTimeout(200)

  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('.desktop-choices-panel')
    const body = document.querySelector('.desktop-choices-body')
    const cards = Array.from(document.querySelectorAll('.desktop-choices-panel .choice-card'))
    const r = panel.getBoundingClientRect()
    return {
      panel: [Math.round(r.width), Math.round(r.height)],
      cards: cards.length,
      available: cards.filter((c) => !c.classList.contains('locked')).length,
      bodyScroll: body.scrollHeight > body.clientHeight + 1,
      promptCount: document.querySelectorAll('.desktop-choices-prompt').length,
      leakedSave: !!document.querySelector('.save-slots-modal'),
      leakedAchievement: !!document.querySelector('.achievement-panel'),
      overflowX: document.body.scrollWidth > innerWidth + 1
    }
  })

  await page.locator('.desktop-choices-panel .choice-card:not(.locked)').first().click()
  await page.waitForSelector('.result-section', { timeout: 15000 })
  await page.waitForTimeout(300)
  const resultMetrics = await page.evaluate(() => {
    const display = document.querySelector('.event-display')
    const header = document.querySelector('.event-header')
    const narrative = document.querySelector('.narrative-section')
    const illustration = document.querySelector('.event-illustration')
    const selected = document.querySelector('.selected-choice')
    const settlement = document.querySelector('.settlement-area')
    const result = document.querySelector('.result-section')
    return {
      showResult: display.classList.contains('show-result'),
      headerDisplay: getComputedStyle(header).display,
      narrativeDisplay: getComputedStyle(narrative).display,
      illustrationVisible: !!illustration && illustration.getBoundingClientRect().height > 0,
      selectedVisible: !!selected && selected.getBoundingClientRect().height > 0,
      settlementVisible: !!settlement && settlement.getBoundingClientRect().height > 0,
      resultHeight: Math.round(result.getBoundingClientRect().height),
      overflowX: document.body.scrollWidth > innerWidth + 1
    }
  })
  await page.screenshot({ path: `${OUT}${suffix}-选项结算-${viewport.width}x${viewport.height}.png` })
  console.log(`choice ${suffix}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  console.log(`result ${suffix}: ${JSON.stringify(resultMetrics)}`)
  await context.close()
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await saveBackup(browser, { width: 1440, height: 900 }, '桌面')
  await saveBackup(browser, { width: 1024, height: 768 }, '小桌面')
  await choicePanel(browser, { width: 1440, height: 900 }, '桌面')
  await choicePanel(browser, { width: 1024, height: 768 }, '小桌面')
} finally {
  await browser.close()
}
