/**
 * 更窄横屏（<568px）手机牌桌操作栏永久回归钉子（§8.30）。
 * §8.20 把操作栏增到 8 按钮（首页/撤销/存档/成就/局鉴/帮助/继续/×），只在 844×390 实测过
 * 不溢出且触控 ≥44px；<568px 更窄横屏自 §8.20 起四轮「未实测」（§8.21/8.22/8.23 沿用）。
 * 本轮把操作栏摆到屏上量并钉住：844×390(对照)/667×375(iPhone8)/568×320(iPhoneSE)/480×320(小屏)
 * 各走完开局 → 展开操作栏 → 断言 8 按钮齐全、整页无横向溢出、操作栏容器在视口内、
 * 每按钮触控目标 ≥44px、按钮不溢出容器、文字不裁剪、0 console error。
 * 另在 568/480 两档把主按钮文字换成最宽的「进 下 月」（无当前事件态）做文字适配压力：
 * 主按钮不裁剪、整页仍不溢出、其余六按钮触控仍 ≥44px。
 * 实测结论：flex:1 1 0 + nowrap 让按钮随视口线性收窄，480×320 仍 45.5px 宽 ≥44，无需改 CSS。
 * 用法：dev server 在跑（默认 5173），node tests/verify-mobile-actionbar-narrow.mjs（BASE_URL 可覆盖）。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('./screenshots/mobile-actionbar-narrow/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { width: 844, height: 390, label: '844x390-control', stress: false },
  { width: 667, height: 375, label: '667x375-iPhone8', stress: false },
  { width: 568, height: 320, label: '568x320-iPhoneSE', stress: true },
  { width: 480, height: 320, label: '480x320-small', stress: true }
]

const failures = []
const errors = []
function check(name, ok, detail) {
  if (ok) console.log(`  ✓ ${name}${detail ? ' ' + detail : ''}`)
  else { failures.push(`${name}${detail ? ' ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' ' + detail : ''}`) }
}

async function playToBoard(page) {
  await page.waitForSelector('.mobile-title__actions', { timeout: 15000 })
  await page.click('.mobile-title__actions .mobile-btn--primary')
  await page.waitForSelector('.mobile-name__form')
  const inputs = page.locator('.mobile-name input')
  await inputs.nth(0).fill('李')
  await inputs.nth(1).fill('承业')
  await inputs.nth(2).fill('伯承')
  await inputs.nth(3).fill('22')
  await inputs.nth(4).fill('南直隶苏州府吴县')
  await page.click('.mobile-name__actions .mobile-btn--primary')
  await page.waitForSelector('.mobile-origin-card', { timeout: 15000 })
  await page.locator('.mobile-origin-card').first().locator('.mobile-btn--primary').click()
  await page.waitForSelector('.legacy-screen', { timeout: 15000 })
  await page.locator('.legacy-btn.primary').click()
  await page.waitForSelector('.career-select-screen', { timeout: 15000 })
  await page.locator('.career-btn.ghost', { hasText: '不立志业' }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 20000 })
  await page.waitForTimeout(500)
}

function measure() {
  const bar = document.querySelector('.mobile-actionbar')
  const br = bar.getBoundingClientRect()
  const btns = [...bar.querySelectorAll('.mobile-bar-btn')].map(e => {
    const r = e.getBoundingClientRect()
    return {
      text: (e.textContent || '').trim(),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      touch: +Math.min(r.width, r.height).toFixed(1),
      right: +r.right.toFixed(1),
      clip: e.scrollWidth > e.clientWidth + 1,
      primary: e.classList.contains('mobile-bar-btn--primary')
    }
  })
  return {
    docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
    barX: +br.x.toFixed(1), barRight: +br.right.toFixed(1), barBottom: +br.bottom.toFixed(1),
    btns, lastRight: btns.length ? btns[btns.length - 1].right : 0,
    minTouch: btns.length ? Math.min(...btns.map(b => b.touch)) : 0
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const vp of VIEWPORTS) {
  console.log(`\n[${vp.label}]`)
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${vp.label}: ${String(e)}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`${vp.label}: ${m.text()}`) })
  try {
    await page.goto(`${BASE}?mobile=1`, { waitUntil: 'load', timeout: 60000 })
    await playToBoard(page)
    await page.locator('.mobile-hud__action').click()
    await page.waitForSelector('.mobile-actionbar', { timeout: 15000 })
    await page.waitForTimeout(250)

    const m = await page.evaluate(measure)
    check('8 按钮齐全', m.btns.length === 8, `count=${m.btns.length}`)
    check('整页无横向溢出', !m.docOverflow, `scroll=${m.docScrollW} client=${m.docClientW}`)
    check('操作栏在视口内', m.barX >= -1 && m.barRight <= vp.width + 1 && m.barBottom <= vp.height + 1,
      `x=${m.barX} right=${m.barRight} bottom=${m.barBottom} vp=${vp.width}x${vp.height}`)
    check('每按钮触控目标 ≥44px', m.btns.every(b => b.touch >= 44), `min=${m.minTouch}`)
    check('按钮不溢出操作栏容器', m.lastRight <= m.barRight + 1, `lastRight=${m.lastRight} barRight=${m.barRight}`)
    check('按钮文字不裁剪', m.btns.every(b => !b.clip), m.btns.filter(b => b.clip).map(b => b.text).join(',') || 'none')
    console.log('  btns:', m.btns.map(b => `${b.text}:${b.w}x${b.h}`).join(' '))
    await page.screenshot({ path: `${OUT}${vp.label}.png`, fullPage: false })

    if (vp.stress) {
      // 主按钮最宽标签「进 下 月」（无当前事件态）的文字适配压力。
      const s = await page.evaluate(() => {
        const bar = document.querySelector('.mobile-actionbar')
        const primary = bar.querySelector('.mobile-bar-btn--primary')
        const original = primary.textContent
        primary.textContent = '进 下 月'
        void primary.offsetWidth
        const pr = primary.getBoundingClientRect()
        const out = {
          primaryClip: primary.scrollWidth > primary.clientWidth + 1,
          primaryW: +pr.width.toFixed(1),
          docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          regularMinTouch: Math.min(...[...bar.querySelectorAll('.mobile-bar-btn:not(.mobile-bar-btn--primary):not(.mobile-actionbar__close)')]
            .map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) }))
        }
        primary.textContent = original
        return out
      })
      check('压力·主按钮「进 下 月」不裁剪', !s.primaryClip, `w=${s.primaryW}`)
      check('压力·整页仍无横向溢出', !s.docOverflow)
      check('压力·其余六按钮触控仍 ≥44px', s.regularMinTouch >= 44, `min=${s.regularMinTouch.toFixed(1)}`)
      await page.screenshot({ path: `${OUT}${vp.label}-stress.png`, fullPage: false })
    }
  } catch (e) {
    failures.push(`${vp.label} EXCEPTION ${String(e).slice(0, 160)}`)
    console.log('  EXCEPTION', String(e).slice(0, 160))
  } finally {
    await ctx.close()
  }
}
await browser.close()

check('0 console/page error', errors.length === 0, `errors=${errors.length}`)
if (errors.length) console.log(errors.slice(0, 5).join('\n'))
console.log(`\n${failures.length === 0 ? '✓ 全部通过' : '✗ 失败 ' + failures.length + ' 项'}`)
if (failures.length) console.log(failures.join('\n'))
process.exit(failures.length === 0 ? 0 : 1)