/**
 * 「南迁伏笔 → 衣冠南渡」接力浏览器实测（§8.27）。
 * 修前 transition_184.c2【主张迁都】回音许下南迁伏笔却不落票，《天崩地坼》c4【按早定的路线南下】
 * (衣冠南渡) 读 主张南迁 —— 1643 年主南迁的人到了甲申兑现不到城破前的准备。本脚本把整条接力摆到屏上：
 *  A《李自成进兵》点 c2 → 结果屏回音含「获得标记：主张南迁」，续月后剧情线条认领 天崩地坼；
 *  B《天崩地坼》flags=[南渡长江]（无主张南迁）→ c4 衣冠南渡 **锁着**（c1 投降清朝 也锁，立场互斥）；
 *  C《天崩地坼》flags=[南渡长江,主张南迁] → c4 **解锁**，点它停在《天崩地坼 · 衣冠南渡》，回音含 效忠南明。
 * 用法：dev server 在跑（默认 5173），npx vite-node scripts/gen-nationfall-saves.ts 生成存档，
 *       再 node tests/verify-nationfall-relay.mjs（可用 BASE_URL 覆盖）。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const DIR = new URL('../tmp/nationfall-saves/', import.meta.url)
const OUT = fileURLToPath(new URL('./screenshots/nationfall-relay/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const detail = {}

async function openSave(file) {
  const raw = readFileSync(new URL(file, DIR), 'utf8')
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
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
  return { context, page }
}

async function cardLocked(page, text) {
  const card = page.locator('.choice-card').filter({ hasText: text }).first()
  await card.waitFor({ timeout: 15000 })
  const cls = (await card.getAttribute('class')) || ''
  return cls.includes('locked')
}

let ok = false
try {
  // A 源头：transition_184 c2 主张迁都 → 写下 主张南迁。
  {
    const { context, page } = await openSave('transition_184.json')
    const c2 = page.locator('.choice-card').filter({ hasText: '主张迁都' }).first()
    await c2.waitFor({ timeout: 15000 })
    await c2.click()
    await page.waitForSelector('.result-section', { timeout: 15000 })
    await page.waitForTimeout(300)
    detail.A_title = (await page.locator('.settlement-title').first().textContent())?.trim() || ''
    const echo = (await page.locator('.echo-text').first().textContent()) || ''
    detail.A_echoTicket = echo.includes('主张南迁')
    detail.A_ending = await page.locator('.ending-screen').count()
    await page.screenshot({ path: `${OUT}A-source-result.png`, fullPage: true })
    await page.locator('.continue-btn').first().click()
    await page.waitForSelector('.storyline-bar', { timeout: 15000 })
    await page.waitForTimeout(700)
    const bar = (await page.locator('.storyline-bar').first().textContent()) || ''
    detail.A_bar = bar.replace(/\s+/g, ' ').trim()
    detail.A_barNationfall = bar.includes('天崩地坼') && bar.includes('当前剧情线')
    await page.screenshot({ path: `${OUT}A-storyline-bar.png`, fullPage: true })
    await context.close()
  }

  // B 负对照：aftermath 无 主张南迁 → c4 衣冠南渡锁着；c1 投降清朝 也锁（南渡长江）。
  {
    const { context, page } = await openSave('aftermath_neg.json')
    detail.B_c4Locked = await cardLocked(page, '按早定的路线南下')
    detail.B_c1Locked = await cardLocked(page, '投降清朝')
    await page.screenshot({ path: `${OUT}B-payoff-locked.png`, fullPage: true })
    await context.close()
  }

  // C 正对照：aftermath 带 主张南迁 → c4 解锁，点它 → 衣冠南渡。
  {
    const { context, page } = await openSave('aftermath_pos.json')
    detail.C_c4Locked = await cardLocked(page, '按早定的路线南下')
    const c4 = page.locator('.choice-card').filter({ hasText: '按早定的路线南下' }).first()
    await c4.click()
    await page.waitForSelector('.result-section', { timeout: 15000 })
    await page.waitForTimeout(300)
    detail.C_title = (await page.locator('.settlement-title').first().textContent())?.trim() || ''
    const echo = (await page.locator('.echo-text').first().textContent()) || ''
    detail.C_echoLoyal = echo.includes('效忠南明')
    detail.C_ending = await page.locator('.ending-screen').count()
    await page.screenshot({ path: `${OUT}C-payoff-result.png`, fullPage: true })
    await context.close()
  }

  ok = detail.A_title === '主张迁都，朝野哗然' && detail.A_echoTicket && detail.A_ending === 0 &&
    detail.A_barNationfall &&
    detail.B_c4Locked === true && detail.B_c1Locked === true &&
    detail.C_c4Locked === false && detail.C_title === '天崩地坼 · 衣冠南渡' &&
    detail.C_echoLoyal && detail.C_ending === 0 && errors.length === 0
} catch (e) {
  detail.exception = String(e).slice(0, 200)
} finally {
  await browser.close()
}

console.log(`${ok ? '✓' : '✗'} 南迁伏笔→衣冠南渡接力 ${JSON.stringify(detail)} errors=${errors.length}`)
if (errors.length) console.log('   errors:', errors.slice(0, 3).join(' | '))
console.log(ok ? '1/1 通过' : '0/1 通过')
process.exit(ok ? 0 : 1)