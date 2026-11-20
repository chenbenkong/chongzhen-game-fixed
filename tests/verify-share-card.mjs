// 青史分享卡立绘实测：注入 1644 存档（补几张真实 visitFlags 让故人段有人），
// 走到桌面结局点「保存青史卡」，捕获 download 存 PNG 目视立绘与排版。
// 第二阶段 abort 所有立绘请求，验证加载失败回退占位圆、卡仍能导出（不毁卡）。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const SAVE = process.env.SAVE_ID || 'ending_ming_loyalist'
const save = JSON.parse(readFileSync(fileURLToPath(new URL(`../tmp/1644-saves/${SAVE}.json`, import.meta.url)), 'utf8'))
const character = save.character ?? save
character.flags = [...(character.flags ?? []), '崇祯赏识', '孙传庭故交', 'wife_respected']

async function run(blockPortraits, outName) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  if (blockPortraits) await page.route('**/portrait-*.webp', r => r.abort())
  await page.addInitScript(([data]) => {
    localStorage.setItem('chongzhen_autosave', JSON.stringify(data))
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, [save])
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.locator('.title-btn--autosave').first().click()
  await page.waitForTimeout(1500)
  // 桌面选项收在面板里，先打开再选
  if (await page.locator('.desktop-choices-fab').count()) {
    await page.locator('.desktop-choices-fab').first().click().catch(() => {})
    await page.waitForTimeout(500)
  }
  await page.locator('.choices-list .choice-card[aria-disabled="false"]').first().click({ force: true }).catch(() => {})
  await page.waitForSelector('button:has-text("保存青史卡")', { timeout: 20000 })
  const people = await page.locator('.ending-relationship-card').count()
  const dl = page.waitForEvent('download', { timeout: 20000 })
  await page.locator('button:has-text("保存青史卡")').first().click()
  const download = await dl
  await download.saveAs(`tmp/${outName}`)
  console.log(`[${outName}] people=${people} downloaded=${download.suggestedFilename()} errors=${JSON.stringify(errs.slice(0, 3))}`)
  await browser.close()
  return people
}

const n1 = await run(false, 'share-card-portraits.png')
const n2 = await run(true, 'share-card-fallback.png')
console.log(n1 > 0 && n2 > 0 ? 'SHARE CARD OK' : 'SHARE CARD FAIL: no relationships')
process.exitCode = n1 > 0 && n2 > 0 ? 0 : 1