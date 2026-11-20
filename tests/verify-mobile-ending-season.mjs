/**
 * 手机横屏结局态 · 四季环境层核对。
 *
 * 背景：桌面在结局态用 `.game-screen:not(.game-screen--ended)::before` 把四季空镜摘掉；
 * 手机此前没有对应的 --ended 排除（memory 遗留「手机结局态未排除四季层」）。
 * 本脚本在真实浏览器里走到手机结局屏，截图并回报四季 ::before 与结局宿主层的
 * 实际叠放口径，用来判定「四季层是否真的漏在结局画面上」以及排除是否生效。
 *
 * 运行：先起 preview（dist），再
 *   BASE_URL="http://localhost:4180/" node tests/verify-mobile-ending-season.mjs
 * 依赖 tmp/1644-saves/<endingId>.json（scripts/gen-1644-saves.ts 产出）。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const SAVE_ID = process.env.SAVE_ID || 'ending_ming_loyalist'
const TAG = process.env.TAG || 'before'
const SHOT_DIR = fileURLToPath(new URL('./screenshots/mobile/', import.meta.url))
mkdirSync(SHOT_DIR, { recursive: true })

const savePath = fileURLToPath(new URL(`../tmp/1644-saves/${SAVE_ID}.json`, import.meta.url))
const save = JSON.parse(readFileSync(savePath, 'utf8'))

const errors = []

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto(BASE_URL + '?mobile=1', { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(({ data }) => {
    localStorage.setItem('chongzhen_autosave', JSON.stringify(data))
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, { data: save })
  await page.reload({ waitUntil: 'load' })

  await page.waitForSelector('.mobile-title__actions', { timeout: 15000 })
  await page.locator('.mobile-title__actions .mobile-btn', { hasText: '继 续 上 次' }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 20000 })
  await page.waitForTimeout(600)

  // 走到 1644 立场卡并点下当场收笔的选项 → 手机结局屏
  await page.waitForSelector('.mobile-choices-fab', { timeout: 15000 })
  await page.locator('.mobile-choices-fab').click()
  await page.waitForSelector('.choices-section', { timeout: 10000 })
  await page.locator('button.choice-card:not(.locked)').first().click()
  await page.waitForSelector('.mobile-ending-host', { timeout: 15000 })
  await page.waitForTimeout(700)

  const diag = await page.evaluate(() => {
    const board = document.querySelector('.mobile-board')
    const host = document.querySelector('.mobile-ending-host')
    const before = board ? getComputedStyle(board, '::before') : null
    const hostStyle = host ? getComputedStyle(host) : null
    return {
      boardClass: board ? board.className : null,
      beforeContent: before ? before.content : null,
      beforeImage: before ? (before.backgroundImage || '').slice(0, 60) : null,
      beforeOpacity: before ? before.opacity : null,
      beforeZ: before ? before.zIndex : null,
      hostBg: hostStyle ? hostStyle.backgroundColor : null,
      hostZ: hostStyle ? hostStyle.zIndex : null,
      hostPosition: hostStyle ? hostStyle.position : null,
      endingTitle: document.querySelector('.ending-hero-title')?.textContent?.trim() ?? null
    }
  })
  console.log(`[${TAG}] ${SAVE_ID}`)
  console.log(JSON.stringify(diag, null, 2))

  await page.screenshot({ path: `${SHOT_DIR}/ending-season-${TAG}-844x390.png`, fullPage: false })
  await ctx.close()
  await browser.close()

  if (errors.length) {
    console.error('console errors:', errors.slice(0, 3))
    process.exit(1)
  }
  if (!diag.endingTitle) {
    console.error('未走到结局屏（无 .ending-hero-title）')
    process.exit(1)
  }
  console.log(`OK ending=${diag.endingTitle}`)
}

main().catch(err => { console.error(err); process.exit(1) })