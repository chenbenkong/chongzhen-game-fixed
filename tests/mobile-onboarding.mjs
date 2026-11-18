/**
 * 手机版开局链路：标题 / 取名 / 出身 / 家训 / 志业。
 *
 * 重点验证“紧凑、能一屏完成、详细资料默认收起、属性不再用横条”：
 *   - 取名页四个身份字段同一排，整页不用下滑；
 *   - 出身卡默认只显示名称、官阶与按钮，详情点开才出现；
 *   - 展开后的五围是紧凑值块，没有任何横条；
 *   - 直接点“选此出身”能进入牌桌。
 *
 * 运行：先起 preview（dist），再
 *   $env:BASE_URL="http://localhost:4180/"; node tests/mobile-onboarding.mjs
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const OUT_DIR = fileURLToPath(new URL('../release/', import.meta.url))
const WIDTH = Number(process.env.W || 924)
const HEIGHT = Number(process.env.H || 426)
const SHOTS = process.env.NO_SHOTS !== '1'
let failures = 0

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${name}${detail ? ' ' + detail : ''}`)
  } else {
    failures += 1
    console.log(`  ✗ ${name}${detail ? ' ' + detail : ''}`)
  }
}

async function fit(page, selector) {
  return page.locator(selector).evaluate(el => ({
    scroll: el.scrollHeight,
    client: el.clientHeight
  }))
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    hasTouch: true,
    deviceScaleFactor: 3
  })
  const page = await ctx.newPage()
  await page.goto(BASE_URL + '?mobile=1', { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  await page.waitForTimeout(400)

  console.log(`\n[${WIDTH}×${HEIGHT} 横屏 · 开局链路]`)
  const titleFit = await fit(page, '.mobile-title')
  check('标题页一屏装下', titleFit.scroll <= titleFit.client + 1,
    `scroll=${titleFit.scroll} client=${titleFit.client}`)
  check('难度选项横向排列', (await page.locator('.mobile-title__difficulty .mobile-difficulty__option').count()) === 3)
  if (SHOTS) await page.screenshot({ path: `${OUT_DIR}手机网页版-标题-924x426.png` })

  await page.click('.mobile-title__actions .mobile-btn--primary')
  await page.waitForSelector('.mobile-name__head', { timeout: 15000 })
  check('取名页有顶部返回', (await page.locator('.mobile-name__back').count()) === 1)
  check('姓/名/字/年岁同一排', (await page.locator('.mobile-name__row--identity input').count()) === 4)
  const nameFit = await fit(page, '.mobile-name')
  check('取名页一屏填完', nameFit.scroll <= nameFit.client + 1,
    `scroll=${nameFit.scroll} client=${nameFit.client}`)
  check('取名页不再放重复预览', (await page.locator('.mobile-name__preview').count()) === 0)
  if (SHOTS) await page.screenshot({ path: `${OUT_DIR}手机网页版-取名-924x426.png` })

  const inputs = page.locator('.mobile-name input')
  await inputs.nth(0).fill('李')
  await inputs.nth(1).fill('承业')
  await inputs.nth(2).fill('伯承')
  await inputs.nth(3).fill('22')
  await inputs.nth(4).fill('南直隶苏州府吴县')
  await page.click('.mobile-name__actions .mobile-btn--primary')
  await page.waitForSelector('.mobile-origin-card', { timeout: 15000 })

  check('出身卡数量 8', (await page.locator('.mobile-origin-card').count()) === 8)
  check('出身详情默认全收起', (await page.locator('.mobile-origin-card__details:visible').count()) === 0)
  check('出身屏无属性横条', (await page.locator('.mobile-origin-attr__bar').count()) === 0)
  const originFit = await fit(page, '.mobile-origin')
  check('出身屏默认一屏看完', originFit.scroll <= originFit.client + 1,
    `scroll=${originFit.scroll} client=${originFit.client}`)
  const cardHeights = await page.locator('.mobile-origin-card').evaluateAll(els =>
    els.map(el => el.getBoundingClientRect().height))
  check('出身卡收起态高度 ≤100px', cardHeights.every(h => h <= 100),
    `max=${Math.max(...cardHeights)}`)
  if (SHOTS) await page.screenshot({ path: `${OUT_DIR}手机网页版-出身-924x426.png` })

  await page.locator('.mobile-origin-card__toggle').first().click()
  await page.waitForSelector('.mobile-origin-card__details', { timeout: 5000 })
  check('详情可展开', (await page.locator('.mobile-origin-card__details:visible').count()) === 1)
  check('展开后五围齐全', (await page.locator('.mobile-origin-card__details .mobile-origin-attr').count()) === 5)
  check('展开后仍无横条', (await page.locator('.mobile-origin-attr__bar').count()) === 0)
  if (SHOTS) await page.screenshot({ path: `${OUT_DIR}手机网页版-出身详情-924x426.png` })

  await page.locator('.mobile-origin-card').first().locator('.mobile-btn--primary').click()
  await page.waitForSelector('.legacy-screen', { timeout: 15000 })
  check('出身之后进入家训屏', (await page.locator('.legacy-screen').count()) === 1)
  await page.locator('.legacy-btn.primary').click()
  await page.waitForSelector('.career-select-screen', { timeout: 15000 })
  check('家训之后进入志业屏', (await page.locator('.career-select-screen').count()) === 1)
  check('志业屏四张卡同排', (await page.locator('.career-card').count()) === 4)
  const careerFit = await fit(page, '.career-select-screen')
  check('志业屏一屏装下', careerFit.scroll <= careerFit.client + 1,
    `scroll=${careerFit.scroll} client=${careerFit.client}`)
  if (SHOTS) await page.screenshot({ path: `${OUT_DIR}手机网页版-志业-924x426.png` })
  await page.locator('.career-btn.ghost', { hasText: '不立志业' }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 20000 })
  check('跳过志业可进入牌桌', (await page.locator('.mobile-hud').count()) === 1)

  if (SHOTS) {
    await page.locator('.mobile-choices-fab').click()
    await page.locator('button.choice-card:not(.locked)').first().click()
    await page.waitForSelector('.mobile-event-host .result-section', { timeout: 10000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT_DIR}手机网页版-结算-924x426.png` })
  }

  console.log('\n' + '='.repeat(56))
  if (failures === 0) {
    console.log('手机版开局链路通过：紧凑、详情收起、无横条、可选出身、志业一屏')
  } else {
    console.log(`手机版开局三屏失败：${failures} 项`)
    process.exitCode = 1
  }
  await ctx.close()
  await browser.close()
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
