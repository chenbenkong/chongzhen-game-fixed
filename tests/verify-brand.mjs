// 品牌统一实测（8.24）：桌面 / 窄桌面 / 竖屏手机 / 极窄 / 横屏手机五档标题屏 h1 为新名「崇祯·宦海浮沉」，
// 七字标题单行不折行（Range 高度 = 一行行高）、不顶穿视口（scrollWidth <= innerWidth）。
// 分享卡卡头与文件名由 verify-share-card.mjs 覆盖。
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'

async function run(viewport, mobile, outName) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport, hasTouch: mobile })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  await page.goto(BASE + (mobile ? '?mobile=1' : ''), { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector(mobile ? '.mobile-title__main' : '.title-main', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const h1 = await page.locator(mobile ? '.mobile-title__main' : '.title-main').textContent()
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.title-main, .mobile-title__main')
    const r = document.createRange()
    r.selectNodeContents(el)
    const lh = parseFloat(getComputedStyle(el).lineHeight)
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      h1W: Math.round(el.getBoundingClientRect().width),
      lines: Math.round(r.getBoundingClientRect().height / lh)
    }
  })
  await page.screenshot({ path: `tmp/${outName}` })
  await browser.close()
  const ok = h1 === '崇祯·宦海浮沉' && overflow.scrollW <= overflow.innerW && overflow.lines === 1 && errs.length === 0
  console.log(`[${outName}] h1=${h1} h1W=${overflow.h1W} lines=${overflow.lines} scrollW=${overflow.scrollW}/${overflow.innerW} errors=${JSON.stringify(errs.slice(0, 3))} => ${ok ? 'OK' : 'FAIL'}`)
  return ok
}

const a = await run({ width: 1440, height: 900 }, false, 'brand-desktop.png')
const b = await run({ width: 768, height: 1024 }, false, 'brand-768.png')
const c = await run({ width: 390, height: 844 }, false, 'brand-390.png')
const d = await run({ width: 320, height: 568 }, false, 'brand-320.png')
const e = await run({ width: 844, height: 390 }, true, 'brand-mobile.png')
console.log(a && b && c && d && e ? 'BRAND OK' : 'BRAND FAIL')
process.exitCode = a && b && c && d && e ? 0 : 1