import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * P4.8 极短屏本月抉择「听天由命」验收：
 * 1) 480×320 / 568×320：随机键必须首屏可见，落在顶栏关闭键左侧，
 *    不与「本月抉择 / N 项 / ×」重叠，点击不被标题栏挡住；
 * 2) 同一个 2×2 里四个正式选项与「勉力一试」仍全部首屏可见，
 *    抉择面板自身不产生纵向滚动；
 * 3) 640×360 / 924×426 保持原位（选项下方），不进入顶栏。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.8-short-random/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const save = readFileSync(new URL('../tmp/p3.1-career-save.json', import.meta.url), 'utf8')

const results = []
const failures = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  if (!pass) failures.push(`${name}: ${detail}`)
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const viewport of [
    { width: 480, height: 320 },
    { width: 568, height: 320 },
    { width: 640, height: 360 },
    { width: 924, height: 426 },
  ]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })
    await page.addInitScript(({ save }) => {
      localStorage.clear()
      localStorage.setItem('chongzhen_autosave', save)
      localStorage.setItem('chongzhen_autosave_seq', '1')
      localStorage.setItem('chongzhen_save_slot_1', save)
    }, { save })
    await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('.mobile-title', { timeout: 15000 })
    await page.waitForTimeout(1900)
    await page.getByRole('button', { name: /继.*续.*上.*次/ }).click()
    await page.waitForSelector('.mobile-hud', { timeout: 15000 })
    await page.waitForTimeout(450)
    await page.locator('.mobile-choices-fab').click()
    await page.waitForTimeout(350)

    const m = await page.evaluate(() => {
      const panel = document.querySelector('.choices-section')
      const head = document.querySelector('.mobile-choices-head')
      const title = document.querySelector('.mobile-choices-head__title')
      const count = document.querySelector('.mobile-choices-head__count')
      const close = document.querySelector('.mobile-choices-head__close')
      const list = document.querySelector('.choices-list')
      const random = document.querySelector('.choices-section .random-choice-btn')
      const cards = [...document.querySelectorAll('.choices-section .choice-card')]
      const dice = [...document.querySelectorAll('.choices-section .dice-attempt-btn')]
      const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
      const style = random ? getComputedStyle(random) : null
      return {
        viewport: { w: innerWidth, h: innerHeight },
        panel: { ...rect(panel), scrollH: panel.scrollHeight, clientH: panel.clientHeight, scrollTop: panel.scrollTop, scrollW: panel.scrollWidth, clientW: panel.clientWidth },
        head: { ...rect(head), bg: getComputedStyle(head).backgroundImage, bgColor: getComputedStyle(head).backgroundColor, pointer: getComputedStyle(head).pointerEvents },
        title: rect(title),
        count: rect(count),
        close: rect(close),
        list: { ...rect(list), rows: getComputedStyle(list).gridTemplateRows },
        cards: cards.map(c => ({ ...rect(c), text: c.querySelector('.choice-title')?.textContent?.trim().slice(0, 14) })),
        dice: dice.map(d => rect(d)),
        random: random ? { ...rect(random), position: style.position, fontSize: style.fontSize, marginTop: style.marginTop, zIndex: style.zIndex } : null,
        topAtRandom: random ? (() => {
          const r = random.getBoundingClientRect()
          const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return el ? { tag: el.tagName, cls: el.className } : null
        })() : null,
      }
    })

    const label = `${viewport.width}×${viewport.height}`
    const short = viewport.width <= 600 && viewport.height <= 340
    check(`${label} 随机键存在`, !!m.random, JSON.stringify(m.random))
    check(`${label} 四个正式选项全在首屏`, m.cards.length === 4 && m.cards.every(c => c.y >= m.head.bottom && c.bottom <= viewport.height - 4), JSON.stringify(m.cards))
    check(`${label} 整页与抉择面板无横向溢出`, m.panel.scrollW <= m.panel.clientW + 1, JSON.stringify(m.panel))
    check(`${label} 随机键触控高 ≥44`, m.random && m.random.h >= 44, JSON.stringify(m.random))
    check(`${label} 随机键点击命中自身`, !!m.topAtRandom && /random-choice-btn/.test(m.topAtRandom.cls || ''), JSON.stringify(m.topAtRandom))

    if (short) {
      check(`${label} 随机键进入顶栏`, m.random.position === 'fixed' && m.random.y >= 0 && m.random.bottom <= 47, JSON.stringify(m.random))
      check(`${label} 随机键不压关闭键`, m.random.right <= m.close.x - 4, JSON.stringify({ random: m.random, close: m.close }))
      check(`${label} 随机键不压标题与计数`, m.random.x >= m.count.right + 4, JSON.stringify({ random: m.random, count: m.count }))
      check(`${label} 标题栏透明且空白区可点击穿透`, (m.head.bg === 'none' || /rgba\(0, 0, 0, 0\)/.test(m.head.bg)) && /rgba\(0, 0, 0, 0\)/.test(m.head.bgColor) && m.head.pointer === 'none', JSON.stringify({ bg: m.head.bg, bgColor: m.head.bgColor, pointer: m.head.pointer }))
      check(`${label} 四选项与勉力一试全在首屏`, m.dice.every(d => d.bottom <= viewport.height - 1) && m.cards.every(c => c.bottom <= viewport.height - 4), JSON.stringify({ cards: m.cards, dice: m.dice }))
      check(`${label} 抉择面板无纵向滚动`, m.panel.scrollH <= m.panel.clientH + 1 && m.panel.scrollTop === 0, JSON.stringify(m.panel))
    } else {
      check(`${label} 随机键仍在选项下方`, m.random.position !== 'fixed' && m.random.y > 250, JSON.stringify(m.random))
      check(`${label} 随机键首屏可见`, m.random.bottom <= viewport.height - 4, JSON.stringify(m.random))
      check(`${label} 标题栏保持原背景`, !/rgba\(0, 0, 0, 0\)/.test(m.head.bg), JSON.stringify(m.head.bg))
    }
    check(`${label} 无控制台错误`, errors.length === 0, JSON.stringify(errors))

    await page.screenshot({ path: `${OUT}手机-抉择-${viewport.width}x${viewport.height}.png` })

    if (short) {
      await page.locator('.choices-section .random-choice-btn').click()
      await page.waitForTimeout(550)
      const after = await page.evaluate(() => ({
        choicesOpen: document.querySelector('.mobile-board')?.classList.contains('is-choices-open'),
        result: !!document.querySelector('.result-section'),
      }))
      check(`${label} 随机键点击后收起抉择并进入结果`, after.choicesOpen === false && after.result === true, JSON.stringify(after))
      check(`${label} 点击后无控制台错误`, errors.length === 0, JSON.stringify(errors))
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`)
console.log(failures.length === 0 ? `ALL PASS (${results.length})` : `FAILED ${failures.length}/${results.length}`)
if (failures.length) process.exitCode = 1
