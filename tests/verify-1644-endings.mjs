/**
 * 甲申终局浏览器实测：四份存档各点进一格新结局，断言结局屏标题正确、无 console error。
 * 用法：先 npm run build && npx vite preview --port 4173，再 node tests/verify-1644-endings.mjs
 * 存档由 scripts/gen-1644-saves.ts 生成（tmp/1644-saves/）。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const SAVE_DIR = new URL('../tmp/1644-saves/', import.meta.url)
const OUT = fileURLToPath(new URL('./screenshots/1644-endings/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const CASES = [
  { endingId: 'ending_city_fall', title: '城破殉城' },
  { endingId: 'ending_ming_loyalist', title: '遗民守节' },
  { endingId: 'ending_shun_collaborator', title: '降顺仕贼' },
  { endingId: 'ending_southern_ming', title: '南渡续祚' }
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const c of CASES) {
    const raw = readFileSync(new URL(`${c.endingId}.json`, SAVE_DIR), 'utf8')
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
    const firstOpen = page.locator('.choice-card:not(.locked)').first()
    const chosenText = (await firstOpen.locator('.choice-text, .choice-title, h3, h4').first().textContent().catch(() => '')) || ''
    await firstOpen.click()
    await page.waitForSelector('.ending-screen, .continue-btn', { timeout: 15000 })
    if ((await page.locator('.ending-screen').count()) === 0 && (await page.locator('.continue-btn').count())) {
      await page.locator('.continue-btn').click()
    }
    await page.waitForSelector('.ending-screen', { timeout: 15000 })
    await page.waitForTimeout(400)
    const heroTitle = (await page.locator('.ending-hero-title').first().textContent())?.trim() || ''
    const cfCount = await page.locator('.counterfactual-title').count()
    await page.screenshot({ path: `${OUT}${c.endingId}.png`, fullPage: true })
    const ok = heroTitle === c.title && errors.length === 0
    results.push({ ...c, heroTitle, chosenText: chosenText.slice(0, 24), cfCount, errors, ok })
    console.log(`${ok ? '✓' : '✗'} ${c.endingId}《${c.title}》 屏上标题="${heroTitle}" 反事实=${cfCount} errors=${errors.length}`)
    if (errors.length) console.log('   errors:', errors.slice(0, 3).join(' | '))
    await context.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 格通过`)
if (failed.length) {
  console.log('失败：', failed.map(f => `${f.endingId}(标题="${f.heroTitle}", errors=${f.errors.length})`).join('; '))
  process.exit(1)
}