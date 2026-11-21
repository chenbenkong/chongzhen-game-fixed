/**
 * P3.3 标题屏生涯档案条实拍：最近自动存档 → 姓名 / 年月 / 官位 / 志业 / 史线 / 履历。
 * 桌面 1440×900、1024×768；手机 924×426、480×320；另测无档时整条不渲染。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p3.3-title-archive/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const raw = readFileSync(new URL('../tmp/p3.2-year-save.json', import.meta.url), 'utf8')

async function openTitle(page, mobile, withSave = true) {
  await page.addInitScript(({ save, enabled }) => {
    localStorage.clear()
    if (enabled) {
      localStorage.setItem('chongzhen_autosave', save)
      localStorage.setItem('chongzhen_autosave_seq', '1')
    }
  }, { save: raw, enabled: withSave })
  await page.goto(`${BASE}?${mobile ? 'mobile=1&' : ''}debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector(mobile ? '.mobile-title' : '.title-screen', { timeout: 15000 })
  await page.waitForTimeout(1900)
}

async function measure(page, mobile) {
  return page.evaluate((isMobile) => {
    const strip = document.querySelector('.career-archive-strip')
    const frame = document.querySelector(isMobile ? '.mobile-title' : '.title-frame')
    const difficulty = document.querySelector(isMobile ? '.mobile-title__difficulty' : '.title-difficulty')
    const actions = document.querySelector(isMobile ? '.mobile-title__actions' : '.title-buttons')
    const extras = document.querySelector(isMobile ? '.mobile-title__extras' : '.title-corner-buttons')
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]
    }
    return {
      strip: rect(strip),
      stripText: strip?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      label: document.querySelector('.career-archive-strip__label')?.textContent ?? null,
      name: document.querySelector('.career-archive-strip__name')?.textContent ?? null,
      time: document.querySelector('.career-archive-strip__time')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      rank: document.querySelector('.career-archive-strip__rank')?.textContent ?? null,
      career: document.querySelector('.career-archive-strip__career')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      storyline: document.querySelector('.career-archive-strip__storyline')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      records: document.querySelector('.career-archive-strip__records')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      detailsVisible: (() => {
        const detail = document.querySelector('.career-archive-strip__detail')
        return detail ? getComputedStyle(detail).display !== 'none' : false
      })(),
      frame: rect(frame),
      frameClass: frame?.className ?? null,
      gap: frame ? getComputedStyle(frame).gap : null,
      difficulty: rect(difficulty),
      actions: rect(actions),
      extras: rect(extras),
      startVisible: !!document.querySelector(isMobile ? '.mobile-btn--primary' : '.title-btn'),
      overflowX: document.body.scrollWidth > innerWidth + 1,
      pageScroll: document.body.scrollHeight > innerHeight + 1,
      viewport: [innerWidth, innerHeight]
    }
  }, mobile)
}

async function shot(browser, viewport, mobile, withSave = true) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await openTitle(page, mobile, withSave)
  const metrics = await measure(page, mobile)
  const name = `${withSave ? '' : '无档-'}${mobile ? '手机' : '桌面'}-生涯档案-${viewport.width}x${viewport.height}.png`
  await page.screenshot({ path: `${OUT}${name}` })
  console.log(`${withSave ? 'with-save' : 'no-save'} ${mobile ? 'mobile' : 'desktop'} ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
  return { metrics, errors }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const d1 = await shot(browser, { width: 1440, height: 900 }, false)
  const d2 = await shot(browser, { width: 1024, height: 768 }, false)
  const m1 = await shot(browser, { width: 924, height: 426 }, true)
  const m2 = await shot(browser, { width: 480, height: 320 }, true)
  const noSave = await shot(browser, { width: 1440, height: 900 }, false, false)

  const all = [d1, d2, m1, m2]
  const commonOk = all.every(({ metrics, errors }) => {
    const strip = metrics.strip
    return strip &&
      metrics.label === '生涯档案' &&
      metrics.name === '顾承畴' &&
      metrics.time === '崇祯元年 12月' &&
      metrics.rank === '户部主事' &&
      metrics.career === '志业 · 清名 2/3' &&
      metrics.storyline === '史线 · 权谋之术' &&
      metrics.records === '履历 5' &&
      strip[0] <= metrics.viewport[0] - 20 &&
      strip[2] >= 0 &&
      strip[3] <= metrics.viewport[1] + 1 &&
      metrics.actions &&
      metrics.actions[3] <= metrics.viewport[1] + 1 &&
      metrics.extras &&
      metrics.extras[3] <= metrics.viewport[1] + 1 &&
      metrics.startVisible &&
      !metrics.overflowX &&
      errors.length === 0
  })

  const ok = commonOk &&
    !d1.metrics.pageScroll &&
    !d2.metrics.pageScroll &&
    !m1.metrics.pageScroll &&
    m1.metrics.detailsVisible &&
    m1.metrics.strip[1] <= 34 &&
    m2.metrics.strip[1] <= 32 &&
    !m2.metrics.detailsVisible &&
    noSave.metrics.strip === null &&
    noSave.metrics.label === null &&
    noSave.metrics.startVisible &&
    !noSave.metrics.overflowX &&
    noSave.errors.length === 0

  console.log(ok ? 'P3.3 标题屏生涯档案条 OK' : 'P3.3 标题屏生涯档案条 FAIL')
  process.exitCode = ok ? 0 : 1
} finally {
  await browser.close()
}
