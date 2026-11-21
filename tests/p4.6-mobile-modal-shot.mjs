import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * P4.6 手机极短屏弹窗验收：
 * 1) 480 / 568 / 640 的「本月抉择」改成 2×2，四个选项首屏全见，触屏序号隐藏；
 * 2) 480 的人物面板属性改两列，横向内容不再被 overflow-x:hidden 裁掉；
 * 3) 924 保持单列抉择与三列面板，序号仍显示。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.6-mobile-modal/', import.meta.url))
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
    { width: 480, height: 320, panel: true },
    { width: 568, height: 320, panel: false },
    { width: 640, height: 360, panel: false },
    { width: 924, height: 426, panel: true },
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

    const pageBox = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      pageScroll: document.body.scrollHeight > innerHeight + 1 || document.documentElement.scrollHeight > innerHeight + 1,
    }))
    check(`${viewport.width} 页面无横向溢出`, pageBox.scrollW <= pageBox.clientW + 1, JSON.stringify(pageBox))
    check(`${viewport.width} 页面无纵向滚动`, pageBox.pageScroll === false, JSON.stringify(pageBox))

    await page.locator('.mobile-choices-fab').click()
    await page.waitForTimeout(350)
    const choices = await page.evaluate(() => {
      const panel = document.querySelector('.choices-section')
      const list = document.querySelector('.choices-list')
      const cards = [...document.querySelectorAll('.choices-section .choice-card')]
      const idxs = [...document.querySelectorAll('.choices-section .choice-index')]
      const r = panel.getBoundingClientRect()
      return {
        panel: { x: Math.round(r.x), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), scrollH: panel.scrollHeight, clientH: panel.clientHeight },
        columns: getComputedStyle(list).gridTemplateColumns,
        cards: cards.map(c => { const cr = c.getBoundingClientRect(); return { x: Math.round(cr.x), right: Math.round(cr.right), top: Math.round(cr.top), bottom: Math.round(cr.bottom), h: Math.round(cr.height) } }),
        indexDisplay: idxs.map(i => getComputedStyle(i).display),
        overflowX: document.querySelector('.choices-section').scrollWidth > document.querySelector('.choices-section').clientWidth + 1,
      }
    })
    const short = viewport.width <= 680 && viewport.height <= 480
    check(`${viewport.width} 四项全部存在`, choices.cards.length === 4, JSON.stringify(choices.cards))
    check(`${viewport.width} 四项首屏全见`, choices.cards.every(c => c.top >= choices.panel.top && c.bottom <= viewport.height - 4), JSON.stringify(choices.cards))
    check(`${viewport.width} 卡片无横向溢出`, choices.cards.every(c => c.x >= choices.panel.x && c.right <= choices.panel.right), JSON.stringify(choices.cards))
    check(`${viewport.width} 抉择容器无横向滚动`, choices.overflowX === false, JSON.stringify(choices.panel))
    if (short) {
      check(`${viewport.width} 短屏抉择 2×2`, choices.columns.trim().split(/\s+/).length === 2, choices.columns)
      check(`${viewport.width} 短屏隐藏序号`, choices.indexDisplay.every(d => d === 'none'), JSON.stringify(choices.indexDisplay))
    } else {
      check(`${viewport.width} 宽屏抉择单列`, choices.columns.trim().split(/\s+/).length === 1, choices.columns)
      check(`${viewport.width} 宽屏保留序号`, choices.indexDisplay.every(d => d !== 'none'), JSON.stringify(choices.indexDisplay))
    }
    await page.screenshot({ path: `${OUT}手机-抉择-${viewport.width}x${viewport.height}.png` })

    if (viewport.panel) {
      await page.locator('.mobile-choices-head__close').click()
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: '打开人物面板' }).click()
      await page.waitForTimeout(350)
      const panel = await page.evaluate(() => {
        const p = document.querySelector('.mobile-panel')
        const b = document.querySelector('.mobile-panel__body')
        const list = document.querySelector('.mobile-panel__body .attr-list')
        const attrs = [...document.querySelectorAll('.mobile-panel__body .attr-item')]
        const pr = p.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        return {
          panel: { x: Math.round(pr.x), right: Math.round(pr.right), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
          body: { x: Math.round(br.x), right: Math.round(br.right), top: Math.round(br.top), bottom: Math.round(br.bottom), scrollW: b.scrollWidth, clientW: b.clientWidth, scrollH: b.scrollHeight, clientH: b.clientHeight },
          columns: getComputedStyle(list).gridTemplateColumns,
          attrs: attrs.map(a => { const ar = a.getBoundingClientRect(); return { x: Math.round(ar.x), right: Math.round(ar.right), bottom: Math.round(ar.bottom), text: a.textContent.replace(/\s+/g, ' ').trim() } }),
        }
      })
      check(`${viewport.width} 面板无横向滚动`, panel.body.scrollW <= panel.body.clientW + 1, JSON.stringify(panel.body))
      check(`${viewport.width} 属性不出面板右边界`, panel.attrs.every(a => a.right <= panel.body.right + 1), JSON.stringify(panel.attrs))
      if (viewport.width <= 520) {
        check(`${viewport.width} 窄面板属性两列`, panel.columns.trim().split(/\s+/).length === 2, panel.columns)
      } else {
        check(`${viewport.width} 宽面板属性三列`, panel.columns.trim().split(/\s+/).length === 3, panel.columns)
      }
      await page.screenshot({ path: `${OUT}手机-面板-${viewport.width}x${viewport.height}.png` })
    }

    check(`${viewport.width} 无控制台错误`, errors.length === 0, JSON.stringify(errors))
    await ctx.close()
  }
} finally {
  await browser.close()
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`)
console.log(failures.length === 0 ? `ALL PASS (${results.length})` : `FAILED ${failures.length}/${results.length}`)
if (failures.length) process.exitCode = 1
