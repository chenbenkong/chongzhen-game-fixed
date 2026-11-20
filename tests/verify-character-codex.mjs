// 人物图鉴实测：注入 1644 存档（补几张真实 visitFlags），桌面 / 手机横屏各自
// 进牌桌开局鉴切「人物」卷，断言 12 卡 / 3 已遇 / 立绘请求 200，截图目视排版与灰显。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const save = JSON.parse(readFileSync(fileURLToPath(new URL('../tmp/1644-saves/ending_ming_loyalist.json', import.meta.url)), 'utf8'))
const character = save.character ?? save
character.flags = [...(character.flags ?? []), '崇祯赏识', '孙传庭故交', 'wife_respected']

async function run(mobile, outName) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 },
    hasTouch: mobile
  })
  const page = await ctx.newPage()
  const errs = []
  const portraitStatus = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  page.on('response', r => { if (/portrait-[^/]*\.webp/.test(r.url())) portraitStatus.push(r.status()) })
  await page.addInitScript(([data]) => {
    localStorage.setItem('chongzhen_autosave', JSON.stringify(data))
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, [save])
  await page.goto(BASE + (mobile ? '?mobile=1' : ''), { waitUntil: 'load', timeout: 60000 })

  if (mobile) {
    await page.waitForSelector('.mobile-title__actions', { timeout: 30000 })
    await page.locator('.mobile-title__actions .mobile-btn', { hasText: '继 续 上 次' }).first().click()
    await page.waitForSelector('.mobile-hud', { timeout: 30000 })
    await page.locator('.mobile-hud__action').click()
    await page.waitForSelector('.mobile-actionbar', { timeout: 10000 })
    await page.locator('.mobile-actionbar .mobile-bar-btn', { hasText: '局鉴' }).click()
  } else {
    await page.waitForSelector('.title-btn--autosave', { timeout: 30000 })
    await page.locator('.title-btn--autosave').first().click()
    await page.waitForSelector('.action-btn:has-text("局鉴")', { timeout: 30000 })
    await page.locator('.action-btn:has-text("局鉴")').first().click()
  }
  await page.waitForSelector('.ending-codex-overlay', { timeout: 15000 })
  await page.locator('.codex-tab--characters').first().click()
  await page.waitForSelector('.codex-character-grid', { timeout: 10000 })
  await page.waitForTimeout(1200)

  const cards = await page.locator('.codex-character-card').count()
  const met = await page.locator('.codex-character-card.met').count()
  const locked = await page.locator('.codex-character-card.locked').count()
  const title = await page.locator('.codex-title').textContent()
  const cur = await page.locator('.codex-progress-cur').textContent()
  const total = await page.locator('.codex-progress-total').textContent()
  await page.screenshot({ path: `tmp/${outName}` })
  await page.locator('.codex-close-btn').first().click()
  await page.waitForTimeout(400)
  const closed = (await page.locator('.ending-codex-overlay').count()) === 0
  await browser.close()

  const ok = cards === 12 && met === 3 && locked === 9 && title === '人 物 图 鉴' &&
    cur === '3' && total === '12' && closed && errs.length === 0 &&
    portraitStatus.filter(s => s === 200).length >= 3
  console.log(`[${outName}] cards=${cards} met=${met} locked=${locked} title=${title} progress=${cur}/${total} portraits200=${portraitStatus.filter(s => s === 200).length} closed=${closed} errors=${JSON.stringify(errs.slice(0, 3))} => ${ok ? 'OK' : 'FAIL'}`)
  return ok
}

const a = await run(false, 'character-codex-desktop.png')
const b = await run(true, 'character-codex-mobile.png')
console.log(a && b ? 'CHARACTER CODEX OK' : 'CHARACTER CODEX FAIL')
process.exitCode = a && b ? 0 : 1