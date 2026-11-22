import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * P4.7 极短屏标题屏验收：
 * 1) 480×320 无档 / 有档，568×320 有档：主按钮 + BGM 必须固定一行，底部
 *    「成就 / 局鉴 / 帮助」不能被挤出屏幕；
 * 2) 640×360 有档同样一行，924×426 保持原 200px 主按钮宽度；
 * 3) 标题屏自身不产生纵向滚动，横向不出屏，0 console error。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.7-title/', import.meta.url))
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
  for (const c of [
    { width: 480, height: 320, save: false },
    { width: 480, height: 320, save: true },
    { width: 568, height: 320, save: false },
    { width: 568, height: 320, save: true },
    { width: 640, height: 360, save: true },
    { width: 924, height: 426, save: true },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: 1, hasTouch: true })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })
    await page.addInitScript(({ save, withSave }) => {
      localStorage.clear()
      if (withSave) {
        localStorage.setItem('chongzhen_autosave', save)
        localStorage.setItem('chongzhen_autosave_seq', '1')
      }
    }, { save, withSave: c.save })
    await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('.mobile-title', { timeout: 15000 })
    await page.waitForTimeout(350)

    const m = await page.evaluate(() => {
      const title = document.querySelector('.mobile-title')
      const extras = document.querySelector('.mobile-title__extras')
      const actions = document.querySelector('.mobile-title__actions')
      const actionKids = [...actions.children]
      const extraKids = [...extras.children]
      const bgm = document.querySelector('.mobile-title .bgm-toggle--inline')
      const rect = el => {
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
      }
      return {
        viewport: { w: innerWidth, h: innerHeight },
        title: { scrollH: title.scrollHeight, clientH: title.clientHeight },
        extras: { ...rect(extras), kids: extraKids.map(rect) },
        actions: { ...rect(actions), kids: actionKids.map(el => ({ cls: el.className, ...rect(el) })) },
        bgm: bgm ? rect(bgm) : null,
        pageScroll: document.body.scrollHeight > innerHeight + 1,
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })

    const label = `${c.width}×${c.height}${c.save ? '有档' : '无档'}`
    const short = c.width <= 640 && c.height <= 380
    const actionTops = m.actions.kids.map(k => k.y)
    const oneRow = Math.max(...actionTops) - Math.min(...actionTops) <= 1
    check(`${label} 主按钮同一行`, oneRow, JSON.stringify(m.actions.kids))
    check(`${label} 底部三入口全部在屏内`, m.extras.kids.every(k => k.y >= 0 && k.bottom <= c.height - 4 && k.right <= c.width), JSON.stringify(m.extras.kids))
    check(`${label} 底部入口整行在标题屏内`, m.extras.bottom <= c.height - 4, JSON.stringify(m.extras))
    check(`${label} 音乐键在动作行内`, !!m.bgm && m.bgm.y === Math.min(...actionTops) && m.bgm.bottom <= c.height - 4, JSON.stringify(m.bgm))
    check(`${label} 主按钮与音乐键触控高度 ≥44`, m.actions.kids.every(k => k.h >= 44), JSON.stringify(m.actions.kids))
    check(`${label} 页面无横向溢出`, m.overflowX === false, JSON.stringify({ viewport: m.viewport }))
    check(`${label} 页面无纵向滚动`, m.pageScroll === false, JSON.stringify({ viewport: m.viewport }))
    if (short) {
      check(`${label} 标题屏不产生内部滚动`, m.title.scrollH <= m.title.clientH + 1, JSON.stringify(m.title))
    }
    check(`${label} 无控制台错误`, errors.length === 0, JSON.stringify(errors))

    if (c.width === 480 && !c.save || c.width === 480 && c.save || c.width === 568 && c.save || c.width === 640 && c.save || c.width === 924 && c.save) {
      await page.screenshot({ path: `${OUT}${c.save ? '有档' : '无档'}-${c.width}x${c.height}.png` })
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`)
console.log(failures.length === 0 ? `ALL PASS (${results.length})` : `FAILED ${failures.length}/${results.length}`)
if (failures.length) process.exitCode = 1
