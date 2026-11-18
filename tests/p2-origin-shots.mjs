/**
 * P2.3 出身印记实拍。
 *
 * 验证 8 枚印记在桌面/手机卡头都真实加载，且桌面 4×2 与手机 4×2 不被
 * 38px/26px 的卡头图挤出一屏；同时留一张手机详情展开图确认不压正文。
 *
 * 运行：先起 preview（dist），再
 *   $env:BASE_URL="http://localhost:4180/"; node tests/p2-origin-shots.mjs
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const OUT_DIR = fileURLToPath(new URL('../tmp/p2-origin/', import.meta.url))
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 924, height: 426 }
let failures = 0

function check(name, ok, detail = '') {
  if (ok) console.log(`  ✓ ${name}${detail ? ' ' + detail : ''}`)
  else {
    failures += 1
    console.log(`  ✗ ${name}${detail ? ' ' + detail : ''}`)
  }
}

async function getEmblemState(page, selector) {
  return page.locator(selector).evaluateAll(els => els.map(el => {
    const style = getComputedStyle(el)
    return {
      image: style.backgroundImage,
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    }
  }))
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })

  // 桌面：标题 → 取名 → 出身
  {
    const ctx = await browser.newContext({ viewport: DESKTOP })
    const page = await ctx.newPage()
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('.title-screen', { timeout: 15000 })
    await page.locator('.title-btn').first().click()
    await page.waitForSelector('.name-input-screen', { timeout: 15000 })

    const inputs = page.locator('.name-input')
    await inputs.nth(0).fill('李')
    await inputs.nth(1).fill('承业')
    await inputs.nth(2).fill('伯承')
    await inputs.nth(3).fill('22')
    await inputs.nth(4).fill('南直隶苏州府吴县')
    await page.locator('.confirm-btn').click()
    await page.waitForSelector('.origin-card', { timeout: 15000 })
    await page.mouse.move(0, 0)
    await page.waitForTimeout(600)

    const emblems = await getEmblemState(page, '.origin-emblem')
    check('桌面出身印记数量 8', emblems.length === 8, `count=${emblems.length}`)
    check('桌面印记背景全部加载', emblems.every(e => e.image.includes('origin-') && e.image !== 'none'))
    check('桌面印记尺寸 56×56', emblems.every(e => e.width === 56 && e.height === 56),
      emblemSize(emblems))
    const grid = await page.locator('.origin-card').evaluateAll(els =>
      els.map(el => ({ x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) })))
    const cols = new Set(grid.map(c => c.x)).size
    const rows = new Set(grid.map(c => c.y)).size
    check('桌面出身卡 4×2 排布', cols === 4 && rows === 2,
      `cols=${cols} rows=${rows} y=${grid.map(c => c.y).join(',')}`)
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth
    }))
    check('桌面无横向溢出', overflow.scrollWidth <= overflow.innerWidth + 1,
      `scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth}`)
    await page.screenshot({ path: `${OUT_DIR}/桌面-出身-1440x900.png` })
    await page.screenshot({ path: `${OUT_DIR}/桌面-出身-全页-1440x900.png`, fullPage: true })
    await ctx.close()
  }

  // 手机：标题 → 取名 → 出身
  {
    const ctx = await browser.newContext({ viewport: MOBILE, hasTouch: true, deviceScaleFactor: 3 })
    const page = await ctx.newPage()
    await page.goto(BASE_URL + '?mobile=1', { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('.mobile-title', { timeout: 15000 })
    await page.locator('.mobile-title__actions .mobile-btn--primary').click()
    await page.waitForSelector('.mobile-name__head', { timeout: 15000 })

    const inputs = page.locator('.mobile-name input')
    await inputs.nth(0).fill('李')
    await inputs.nth(1).fill('承业')
    await inputs.nth(2).fill('伯承')
    await inputs.nth(3).fill('22')
    await inputs.nth(4).fill('南直隶苏州府吴县')
    await page.locator('.mobile-name__actions .mobile-btn--primary').click()
    await page.waitForSelector('.mobile-origin-card', { timeout: 15000 })
    await page.waitForTimeout(600)

    const emblems = await getEmblemState(page, '.origin-emblem')
    check('手机出身印记数量 8', emblems.length === 8, `count=${emblems.length}`)
    check('手机印记背景全部加载', emblems.every(e => e.image.includes('origin-') && e.image !== 'none'))
    check('手机印记尺寸 26×26', emblems.every(e => e.width === 26 && e.height === 26),
      emblemSize(emblems))
    const fit = await page.locator('.mobile-origin').evaluate(el => ({
      scroll: el.scrollHeight, client: el.clientHeight
    }))
    check('手机出身屏一屏装下', fit.scroll <= fit.client + 1, `scroll=${fit.scroll} client=${fit.client}`)
    const heights = await page.locator('.mobile-origin-card').evaluateAll(els =>
      els.map(el => Math.round(el.getBoundingClientRect().height)))
    check('手机出身卡收起态 ≤100px', heights.every(h => h <= 100), `max=${Math.max(...heights)}`)
    await page.screenshot({ path: `${OUT_DIR}/手机-出身-924x426.png` })

    await page.locator('.mobile-origin-card__toggle').first().click()
    await page.waitForSelector('.mobile-origin-card__details', { timeout: 5000 })
    await page.waitForTimeout(300)
    check('手机出身详情可展开', (await page.locator('.mobile-origin-card__details:visible').count()) === 1)
    await page.screenshot({ path: `${OUT_DIR}/手机-出身详情-924x426.png` })
    await ctx.close()
  }

  console.log('\n' + '='.repeat(56))
  if (failures === 0) console.log('P2.3 出身印记实拍通过：8 枚加载、桌面/手机一屏')
  else {
    console.log(`P2.3 出身印记实拍失败：${failures} 项`)
    process.exitCode = 1
  }
  await browser.close()
}

function emblemSize(emblems) {
  const sizes = emblems.map(e => `${e.width}x${e.height}`).join(',')
  return `sizes=${sizes}`
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
