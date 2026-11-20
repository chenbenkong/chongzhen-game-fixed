/**
 * 《松锦决》第三拍浏览器实测：一份存档点三票，断言各自去向、无 console error。
 * 用法：先确保 dev server 在跑（默认 5173），node scripts/gen-songjin-saves.ts 生成存档，
 *       再 node tests/verify-songjin-ending.mjs（可用 BASE_URL 覆盖）。
 * c2 死守松山 → 当场结进《战死沙场》结局屏（special.endingId 绕过 体质≤8 门）；
 * c1 增援松锦 / c3 撤守入关 → 停在结果屏（回音含对应票），不结案。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const SAVE = new URL('../tmp/songjin-saves/route_songjin_decision.json', import.meta.url)
const OUT = fileURLToPath(new URL('./screenshots/songjin-ending/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const raw = readFileSync(SAVE, 'utf8')

const CASES = [
  { key: 'c2', match: '死守松山', kind: 'ending', heroTitle: '战死沙场', shot: 'c2-died-battlefield' },
  { key: 'c1', match: '增援松锦', kind: 'result', echoHas: '增援松锦', settleTitle: '松锦决 · 铁骑援松', shot: 'c1-relief' },
  { key: 'c3', match: '撤守入关', kind: 'result', echoHas: '交还边关任职', settleTitle: '松锦决 · 存人失地', shot: 'c3-retreat' }
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const c of CASES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const errors = []
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

    const card = page.locator('.choice-card').filter({ hasText: c.match }).first()
    await card.waitFor({ timeout: 15000 })
    const cls = (await card.getAttribute('class')) || ''
    const locked = cls.includes('locked')
    await card.click()

    let ok = false
    let detail = {}
    if (c.kind === 'ending') {
      await page.waitForSelector('.ending-screen', { timeout: 15000 })
      await page.waitForTimeout(400)
      const heroTitle = (await page.locator('.ending-hero-title').first().textContent())?.trim() || ''
      ok = !locked && heroTitle === c.heroTitle && errors.length === 0
      detail = { locked, heroTitle }
    } else {
      await page.waitForSelector('.result-section', { timeout: 15000 })
      await page.waitForTimeout(300)
      const echo = (await page.locator('.echo-text').first().textContent()) || ''
      const settleTitle = (await page.locator('.settlement-title').first().textContent())?.trim() || ''
      const endingCount = await page.locator('.ending-screen').count()
      ok = !locked && endingCount === 0 && echo.includes(c.echoHas) && settleTitle === c.settleTitle && errors.length === 0
      detail = { locked, settleTitle, echoHas: echo.includes(c.echoHas), endingCount }
    }
    await page.screenshot({ path: `${OUT}${c.shot}.png`, fullPage: true })
    results.push({ ...c, ...detail, errors, ok })
    console.log(`${ok ? '✓' : '✗'} ${c.key}「${c.match}」 ${JSON.stringify(detail)} errors=${errors.length}`)
    if (errors.length) console.log('   errors:', errors.slice(0, 3).join(' | '))
    await context.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 票通过`)
if (failed.length) {
  console.log('失败：', failed.map(f => `${f.key}(${JSON.stringify(f)})`).join('; '))
  process.exit(1)
}