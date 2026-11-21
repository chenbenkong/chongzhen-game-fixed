/**
 * P3.1 牌桌抬头实测：本局志业并入桌面剧情线条，手机 HUD 身份下常驻同一行。
 * 用构造存档（志业清名、清议 66 = 2/3、史线权谋之术）打开牌桌，
 * 只测「看不看得见 / 挤不挤」：桌面 1440×900、1024×768；手机 924×426、480×320。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p3.1-career/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const raw = readFileSync(new URL('../tmp/p3.1-career-save.json', import.meta.url), 'utf8')

async function openGame(page) {
  await page.addInitScript(({ save }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', save)
    localStorage.setItem('chongzhen_autosave_seq', '1')
    localStorage.setItem('chongzhen_save_slot_1', save)
  }, { save: raw })
  await page.goto(`${BASE}?debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.title-screen', { timeout: 15000 })
  await page.waitForTimeout(250)
}

async function desktop(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await openGame(page)
  await page.locator('.title-btn--autosave').first().click()
  await page.waitForSelector('.game-screen', { timeout: 15000 })
  await page.waitForSelector('.storyline-bar', { timeout: 15000 })
  await page.waitForTimeout(400)

  const metrics = await page.evaluate(() => {
    const bar = document.querySelector('.storyline-bar')
    const career = document.querySelector('.storyline-bar__career')
    const pips = Array.from(document.querySelectorAll('.storyline-bar__career-pip'))
    const r = bar.getBoundingClientRect()
    return {
      text: bar.textContent.replace(/\s+/g, ' ').trim(),
      hasCareer: !!career,
      careerName: document.querySelector('.storyline-bar__career-name')?.textContent,
      careerCount: document.querySelector('.storyline-bar__career-count')?.textContent,
      pips: pips.length,
      donePips: pips.filter((p) => p.classList.contains('is-done')).length,
      storyline: document.querySelector('.storyline-bar__name')?.textContent,
      bar: [Math.round(r.width), Math.round(r.height)],
      overflowX: document.body.scrollWidth > innerWidth + 1,
      scrollW: document.body.scrollWidth,
      innerW: innerWidth
    }
  })
  await page.screenshot({ path: `${OUT}桌面-抬头-${viewport.width}x${viewport.height}.png` })
  console.log(`desktop ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
  return metrics
}

async function mobile(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript(({ save }) => {
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', save)
    localStorage.setItem('chongzhen_autosave_seq', '1')
    localStorage.setItem('chongzhen_save_slot_1', save)
  }, { save: raw })
  await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  await page.getByRole('button', { name: /继.*续.*上.*次/ }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 15000 })
  await page.waitForSelector('.mobile-hud__route', { timeout: 15000 })
  await page.waitForTimeout(400)

  const metrics = await page.evaluate(() => {
    const route = document.querySelector('.mobile-hud__route')
    const hud = document.querySelector('.mobile-hud')
    const host = document.querySelector('.mobile-event-host')
    const pips = Array.from(document.querySelectorAll('.mobile-hud__career-pip'))
    const rr = route.getBoundingClientRect()
    const hr = hud.getBoundingClientRect()
    const er = host?.getBoundingClientRect()
    return {
      routeText: route.textContent.replace(/\s+/g, ' ').trim(),
      route: [Math.round(rr.width), Math.round(rr.height), Math.round(rr.right)],
      hudHeight: Math.round(hr.height),
      eventHostHeight: er ? Math.round(er.height) : null,
      careerName: document.querySelector('.mobile-hud__career')?.textContent.replace(/\s+/g, ' ').trim(),
      storyline: document.querySelector('.mobile-hud__storyline')?.textContent.replace(/\s+/g, ' ').trim(),
      pips: pips.length,
      donePips: pips.filter((p) => p.classList.contains('is-done')).length,
      overflowX: document.body.scrollWidth > innerWidth + 1,
      scrollW: document.body.scrollWidth,
      innerW: innerWidth,
      viewport: [innerWidth, innerHeight],
      pageScroll: document.body.scrollHeight > innerHeight + 1
    }
  })
  await page.screenshot({ path: `${OUT}手机-抬头-${viewport.width}x${viewport.height}.png` })
  console.log(`mobile ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
  return metrics
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const d1 = await desktop(browser, { width: 1440, height: 900 })
  const d2 = await desktop(browser, { width: 1024, height: 768 })
  const m1 = await mobile(browser, { width: 924, height: 426 })
  const m2 = await mobile(browser, { width: 480, height: 320 })
  const ok =
    d1.hasCareer && d2.hasCareer &&
    d1.careerCount === '2/3' && d2.careerCount === '2/3' &&
    d1.storyline === '权谋之术' && d2.storyline === '权谋之术' &&
    d1.pips === 3 && d1.donePips === 2 && !d1.overflowX &&
    d1.bar[1] <= 60 && d2.bar[1] <= 60 &&
    m1.routeText.includes('志业 · 清名 2/3') && m1.storyline.includes('权谋之术') &&
    m1.hudHeight <= 150 && (m1.eventHostHeight ?? 0) >= 210 &&
    !m1.overflowX && !m1.pageScroll && m1.pips === 3 && m1.donePips === 2 &&
    !m2.overflowX
  console.log(ok ? 'P3.1 牌桌抬头 OK' : 'P3.1 牌桌抬头 FAIL')
  process.exitCode = ok ? 0 : 1
} finally {
  await browser.close()
}
