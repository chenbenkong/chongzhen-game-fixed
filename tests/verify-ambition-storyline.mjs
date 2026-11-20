/**
 * 《天命所归》权谋归属浏览器实测（§8.26）：
 * 改 tag 前这张卡 storyline=mystery，点 c1【野心萌动】（ordinary 继承事件线）后剧情线条显示
 * "异闻怪谭 · 当前支线"；改 tag 后 storyline=power，同一点法应显示"权谋之术 · 当前剧情线"。
 * 用法：dev server 在跑（默认 5173），npx vite-node scripts/gen-ambition-saves.ts 生成存档，
 *       再 node tests/verify-ambition-storyline.mjs（可用 BASE_URL 覆盖）。
 * 断言：① 卡上三个选项都不锁、且不再出现"异闻怪谭"漂移提示；② c1 停在结果屏《天命所归 · 野心萌动》
 *       （回音含 掌军权），不结案；③ 续月后剧情线条认领 权谋之术 / 当前剧情线；④ 无 console error。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const SAVE = new URL('../tmp/ambition-saves/transition_1643_ambition.json', import.meta.url)
const OUT = fileURLToPath(new URL('./screenshots/ambition-storyline/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const raw = readFileSync(SAVE, 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

let ok = false
const detail = {}
try {
  await page.addInitScript(({ raw }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', raw)
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, { raw })
  await page.goto(`${BASE}?debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.title-btn--autosave', { timeout: 15000 })
  await page.locator('.title-btn--autosave').first().click()
  await page.waitForSelector('.event-display', { timeout: 15000 })

  const fab = page.locator('.desktop-choices-fab')
  if (await fab.count()) {
    await fab.click()
    await page.waitForSelector('.desktop-choices-panel', { timeout: 15000 })
    await page.waitForTimeout(150)
  }

  // ① 三个选项都在、都不锁；记录漂移提示，断言不再出现"异闻怪谭"。
  const cards = page.locator('.choice-card')
  const cardCount = await cards.count()
  const lockedCount = await page.locator('.choice-card.locked').count()
  const shifts = await page.locator('.choice-storyline-shift').allTextContents()
  detail.cardCount = cardCount
  detail.lockedCount = lockedCount
  detail.shifts = shifts.map(s => s.trim())
  const noMystery = !shifts.some(s => s.includes('异闻怪谭'))
  await page.screenshot({ path: `${OUT}card.png`, fullPage: true })

  // ② 点 c1【野心萌动】→ 结果屏，不结案。
  const c1 = page.locator('.choice-card').filter({ hasText: '野心萌动' }).first()
  await c1.waitFor({ timeout: 15000 })
  await c1.click()
  await page.waitForSelector('.result-section', { timeout: 15000 })
  await page.waitForTimeout(300)
  const settleTitle = (await page.locator('.settlement-title').first().textContent())?.trim() || ''
  const echo = (await page.locator('.echo-text').first().textContent()) || ''
  const endingCount = await page.locator('.ending-screen').count()
  detail.settleTitle = settleTitle
  detail.echoHasTicket = echo.includes('掌军权')
  detail.endingCount = endingCount
  await page.screenshot({ path: `${OUT}c1-result.png`, fullPage: true })

  // ③ 续月 → 剧情线条认领权谋之术（当前剧情线），不再是异闻怪谭（当前支线）。
  await page.locator('.continue-btn').first().click()
  await page.waitForSelector('.storyline-bar', { timeout: 15000 })
  await page.waitForTimeout(700)
  const bar = (await page.locator('.storyline-bar').first().textContent()) || ''
  detail.bar = bar.replace(/\s+/g, ' ').trim()
  const barPower = bar.includes('权谋之术') && bar.includes('当前剧情线') && !bar.includes('异闻怪谭')
  await page.screenshot({ path: `${OUT}storyline-bar.png`, fullPage: true })

  ok = cardCount >= 3 && lockedCount === 0 && noMystery &&
    settleTitle === '天命所归 · 野心萌动' && detail.echoHasTicket && endingCount === 0 &&
    barPower && errors.length === 0
  detail.noMystery = noMystery
  detail.barPower = barPower
} catch (e) {
  detail.exception = String(e).slice(0, 200)
} finally {
  await context.close()
  await browser.close()
}

console.log(`${ok ? '✓' : '✗'} 天命所归权谋归属 ${JSON.stringify(detail)} errors=${errors.length}`)
if (errors.length) console.log('   errors:', errors.slice(0, 3).join(' | '))
console.log(ok ? '1/1 通过' : '0/1 通过')
process.exit(ok ? 0 : 1)