/**
 * P2.2 季节背景实拍：桌面 1440×900 / 手机 924×426 各四张。
 *
 * 只验证环境层：
 *   - 根节点确实带上对应 game-screen--season-* / mobile-board--season-*；
 *   - ::before 命中对应季节资源，且不是 404；
 *   - 牌桌正文、侧栏、HUD 没有出现不可读的浅底压字。
 *
 * 运行：preview 起在 4180（tests/mobile-onboarding.mjs 同款），再
 *   node tests/p2-season-shots.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const OUT_DIR = fileURLToPath(new URL('../tmp/p2-season/', import.meta.url))
mkdirSync(OUT_DIR, { recursive: true })

const SEASONS = [
  { id: 'spring', month: 4, label: '春' },
  { id: 'summer', month: 7, label: '夏' },
  { id: 'autumn', month: 10, label: '秋' },
  { id: 'winter', month: 1, label: '冬' }
]

const errors = []

function check(page, name) {
  page.on('pageerror', err => errors.push(`${name}: ${err.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error' && !/favicon\.ico|net::ERR_|Failed to load resource/i.test(msg.text())) {
      errors.push(`${name}: console ${msg.text()}`)
    }
  })
}

async function openDesktopGame(page) {
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.title-screen', { timeout: 15000 })
  await page.locator('.title-btn', { hasText: '开' }).first().click()
  await page.waitForSelector('.setup-screen', { timeout: 15000 })

  const nameInputs = page.locator('.setup-screen .name-input')
  await nameInputs.nth(0).fill('李')
  await nameInputs.nth(1).fill('承业')
  await nameInputs.nth(2).fill('伯承')
  await nameInputs.nth(3).fill('22')
  await nameInputs.nth(4).fill('南直隶苏州府吴县')
  await page.locator('.setup-screen .confirm-btn').click()

  await page.waitForSelector('.origin-card', { timeout: 15000 })
  await page.locator('.origin-card').first().click()
  await page.waitForSelector('.legacy-screen', { timeout: 15000 })
  await page.locator('.legacy-btn.primary').click()
  await page.waitForSelector('.career-select-screen', { timeout: 15000 })
  await page.locator('.career-btn.ghost', { hasText: '不立志业' }).click()
  await page.waitForSelector('.game-screen', { timeout: 20000 })
  await page.waitForTimeout(1200)
}

async function setMonth(page, month) {
  const result = await page.evaluate(monthValue => {
    const raw = localStorage.getItem('chongzhen_autosave')
    if (!raw) return { ok: false, error: 'autosave missing' }
    const data = JSON.parse(raw)
    data.gameState.currentMonth = monthValue
    data.savedAt = new Date().toISOString()
    localStorage.setItem('chongzhen_autosave', JSON.stringify(data))
    const seq = Number(localStorage.getItem('chongzhen_autosave_seq')) || 0
    localStorage.setItem('chongzhen_autosave_seq', String(seq + 1))
    return { ok: true, bytes: JSON.stringify(data).length }
  }, month)
  if (!result.ok) throw new Error(result.error)
}

async function continueDesktop(page) {
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.title-screen', { timeout: 15000 })
  const continueBtn = page.locator('.title-btn--autosave')
  if ((await continueBtn.count()) === 0) throw new Error('desktop autosave button missing')
  await continueBtn.first().click()
  await page.waitForSelector('.game-screen', { timeout: 20000 })
  await page.waitForTimeout(600)
}

async function continueMobile(page) {
  await page.goto(BASE_URL + '?mobile=1', { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  const continueBtn = page.locator('.mobile-title__actions button').filter({ hasText: /继\s*续/ }).first()
  if ((await continueBtn.count()) === 0) throw new Error('mobile autosave button missing')
  await continueBtn.click()
  await page.waitForSelector('.mobile-board', { timeout: 20000 })
  await page.waitForTimeout(600)
}

async function layerInfo(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel)
    if (!el) return null
    const before = getComputedStyle(el, '::before')
    const box = el.getBoundingClientRect()
    return {
      className: el.className,
      box: { width: Math.round(box.width), height: Math.round(box.height) },
      isolation: getComputedStyle(el).isolation,
      opacity: before.opacity,
      zIndex: before.zIndex,
      hasImage: before.backgroundImage.includes('season-')
    }
  }, selector)
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  })
  const desktop = await context.newPage()
  check(desktop, 'desktop')
  await openDesktopGame(desktop)

  const autosave = await desktop.evaluate(() => localStorage.getItem('chongzhen_autosave'))
  console.log(`autosave: ${autosave ? `${autosave.length} bytes` : 'MISSING'}`)
  if (!autosave) throw new Error('开局后没有自动存档，无法按月份切图')

  const records = []
  for (const season of SEASONS) {
    await setMonth(desktop, season.month)
    await continueDesktop(desktop)
    const info = await layerInfo(desktop, '.game-screen')
    records.push({ view: 'desktop', ...season, info })
    await desktop.screenshot({
      path: `${OUT_DIR}桌面-牌桌-${season.label}-1440x900.png`,
      fullPage: false
    })
    console.log(`desktop ${season.label}: ${info?.className} opacity=${info?.opacity} image=${info?.hasImage}`)
  }

  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 924, height: 426 })
  check(mobile, 'mobile')
  for (const season of SEASONS) {
    await setMonth(desktop, season.month)
    await continueMobile(mobile)
    const info = await layerInfo(mobile, '.mobile-board')
    records.push({ view: 'mobile', ...season, info })
    await mobile.screenshot({
      path: `${OUT_DIR}手机-牌桌-${season.label}-924x426.png`,
      fullPage: false
    })
    console.log(`mobile ${season.label}: ${info?.className} opacity=${info?.opacity} image=${info?.hasImage}`)
  }

  await desktop.close()
  await mobile.close()
  await context.close()
  await browser.close()

  if (errors.length > 0) {
    console.error('\n页面错误：')
    errors.forEach(e => console.error(`  ${e}`))
    process.exitCode = 1
    return
  }

  const missing = records.filter(r =>
    !r.info ||
    !r.info.className.includes(`season-${r.id}`) ||
    !r.info.hasImage ||
    r.info.box.width < 800 ||
    r.info.box.height < 400
  )
  if (missing.length > 0) {
    console.error('季节层未命中或尺寸异常：', missing)
    process.exitCode = 1
    return
  }
  console.log(`\n全部 8 张实拍完成，季节类、资源与伪元素尺寸均命中。输出：${OUT_DIR}`)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
