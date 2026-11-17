/**
 * 手机 Web 牌桌截图（按真机 2772×1280 的等效 CSS 视口 924×426、DPR 3）。
 *
 * 输出：
 *   release/手机网页版-924x426.png            收起态（默认，顶栏「面板 / 操作」）
 *   release/手机网页版-人物面板-924x426.png    能力页（财帛/文韬/理政/武略/体质 + 隐藏属性）
 *   release/手机网页版-人物面板隐藏属性-924x426.png 能力页下半段（道德/欲望/野心/机敏/忠诚）
 *   release/手机网页版-操作条展开-924x426.png  操作条展开态（底部浮层）
 *
 * 运行：先起 preview（dist），再
 *   $env:BASE_URL="http://localhost:4180/"; node tests/mobile-screenshot.mjs
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const OUT_DIR = fileURLToPath(new URL('../release/', import.meta.url))

async function playToBoard(page) {
  await page.waitForSelector('.mobile-title__actions', { timeout: 15000 })
  await page.click('.mobile-title__actions .mobile-btn--primary')

  await page.waitForSelector('.mobile-name__form')
  const inputs = page.locator('.mobile-name input')
  await inputs.nth(0).fill('李')
  await inputs.nth(1).fill('承业')
  await inputs.nth(2).fill('伯承')
  await inputs.nth(3).fill('22')
  await inputs.nth(4).fill('南直隶苏州府吴县')
  await page.click('.mobile-name__actions .mobile-btn--primary')

  await page.waitForSelector('.mobile-origin-card', { timeout: 15000 })
  await page.locator('.mobile-origin-card').first().locator('.mobile-btn--primary').click()

  await page.waitForSelector('.mobile-hud', { timeout: 20000 })
  await page.waitForTimeout(600)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 924, height: 426 },
  hasTouch: true,
  deviceScaleFactor: 3
})
const page = await ctx.newPage()
await page.goto(BASE_URL + '?mobile=1', { waitUntil: 'load', timeout: 60000 })
await playToBoard(page)

await page.screenshot({ path: `${OUT_DIR}手机网页版-924x426.png`, fullPage: false })
await page.locator('.mobile-hud__panel').click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT_DIR}手机网页版-人物面板-924x426.png`, fullPage: false })
await page.evaluate(() => {
  const body = document.querySelector('.mobile-panel__body')
  if (body) body.scrollTop = body.scrollHeight
})
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT_DIR}手机网页版-人物面板隐藏属性-924x426.png`, fullPage: false })
await page.locator('.mobile-panel__close').click()
await page.waitForTimeout(150)
await page.locator('.mobile-hud__action').click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT_DIR}手机网页版-操作条展开-924x426.png`, fullPage: false })

console.log('screenshots:', OUT_DIR)
await ctx.close()
await browser.close()
