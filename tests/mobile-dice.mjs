/**
 * 手机横屏骰子弹窗几何测试。
 *
 * 骰子弹窗是 portal 到 body 的，桌面 CSS 在 844×390 下会把内容顶成滚动区。
 * 这里按真实 DOM 结构注入同一套 class，验证手机作用域的紧凑规则：
 *   - 弹窗上下不出视口；
 *   - 中间内容不需要滚动；
 *   - 投掷按钮 ≥44px；
 *   - 存档截图，供人工复核。
 *
 * 运行：$env:BASE_URL="http://localhost:4180/"; node tests/mobile-dice.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4180/'
const SHOT_DIR = fileURLToPath(new URL('./screenshots/mobile/', import.meta.url))
mkdirSync(SHOT_DIR, { recursive: true })
const RELEASE_DIR = fileURLToPath(new URL('../release/', import.meta.url))
mkdirSync(RELEASE_DIR, { recursive: true })

const failures = []
const errors = []
const check = (name, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' ' + detail : ''}`)
  if (!ok) failures.push(name)
}

const fixture = `
<div class="dice-modal-overlay">
  <div class="dice-modal">
    <div class="dice-modal-header"><h3>勉 力 一 试</h3></div>
    <div class="dice-modal-content">
      <div class="dice-info-simple">
        <div class="dice-condition-simple">文韬不足（需 65，当前 42）</div>
        <div class="difficulty-adjust-info">
          <span class="difficulty-label">难度：</span>
          <div class="difficulty-circles">
            <span class="difficulty-circle active"></span>
            <span class="difficulty-circle active"></span>
            <span class="difficulty-circle active"></span>
            <span class="difficulty-circle"></span>
            <span class="difficulty-circle"></span>
            <span class="difficulty-circle"></span>
          </div>
        </div>
        <div class="dice-target">需投出 <span class="target-char">三</span>（3）或以上</div>
        <div class="attempt-info">投骰一次，成功即达成，失败则触发负面效果</div>
      </div>
      <button type="button" class="dice-area" aria-label="投掷骰子">
        <div class="dice-simple-wrapper">
          <div class="dice-box-simple"><span class="dice-char">?</span></div>
        </div>
      </button>
      <div class="dice-click-hint">点击骰子开始</div>
    </div>
    <div class="dice-modal-footer">
      <button type="button" class="dice-confirm-btn">投 掷</button>
    </div>
  </div>
</div>`

async function inspect(page, label, screenshotName) {
  await page.evaluate((html) => {
    document.querySelector('.dice-modal-overlay')?.remove()
    const host = document.createElement('div')
    host.id = 'dice-test-host'
    host.innerHTML = html
    document.body.appendChild(host)
  }, fixture)
  await page.waitForTimeout(500)

  const geo = await page.evaluate(() => {
    const overlay = document.querySelector('.dice-modal-overlay')
    const modal = overlay.querySelector('.dice-modal')
    const content = modal.querySelector('.dice-modal-content')
    const confirm = modal.querySelector('.dice-confirm-btn')
    const r = modal.getBoundingClientRect()
    const c = content.getBoundingClientRect()
    const b = confirm.getBoundingClientRect()
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      modal: { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom },
      content: { scrollHeight: content.scrollHeight, clientHeight: content.clientHeight, h: c.height },
      confirm: { h: b.height, w: b.width, top: b.top, bottom: b.bottom },
    }
  })

  check(`${label} 弹窗不出视口`, geo.modal.top >= 0 && geo.modal.bottom <= geo.viewport.h,
    `top=${geo.modal.top.toFixed(1)} bottom=${geo.modal.bottom.toFixed(1)} vp=${geo.viewport.h}`)
  check(`${label} 弹窗宽度不撑爆`, geo.modal.w <= 520,
    `w=${geo.modal.w.toFixed(1)}`)
  check(`${label} 中间内容无需滚动`, geo.content.scrollHeight <= geo.content.clientHeight + 1,
    `scroll=${geo.content.scrollHeight} client=${geo.content.clientHeight}`)
  check(`${label} 投掷按钮 ≥44px`, geo.confirm.h >= 44,
    `h=${geo.confirm.h.toFixed(1)}`)
  check(`${label} 投掷按钮在视口内`, geo.confirm.bottom <= geo.viewport.h,
    `bottom=${geo.confirm.bottom.toFixed(1)}`)

  await page.screenshot({ path: SHOT_DIR + screenshotName, fullPage: false })
  await page.evaluate(() => document.querySelector('#dice-test-host')?.remove())
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })

  for (const [w, h, label, shot] of [
    [844, 390, '844×390', 'mobile-dice-844x390.png'],
    [924, 426, '924×426', '手机网页版-骰子-924x426.png'],
  ]) {
    console.log(`\n[${label}]`)
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(String(e)))
    await page.goto(BASE_URL + '?mobile=1', { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('.mobile-shell', { timeout: 15000 })
    await page.waitForTimeout(300)
    await inspect(page, label, shot)
    if (label === '924×426') {
      const releaseShot = RELEASE_DIR + '手机网页版-骰子-924x426.png'
      await page.evaluate((html) => {
        const host = document.createElement('div')
        host.id = 'dice-test-host'
        host.innerHTML = html
        document.body.appendChild(host)
      }, fixture)
      await page.waitForTimeout(500)
      await page.screenshot({ path: releaseShot, fullPage: false })
    }
    await ctx.close()
  }

  await browser.close()
  if (errors.length) {
    console.log('\n✗ console.error / pageerror:')
    for (const e of errors) console.log('  ' + e)
  }
  console.log(`\n${failures.length === 0 && errors.length === 0 ? '✓ 骰子弹窗紧凑化通过' : '✗ 骰子弹窗测试失败'}`)
  if (failures.length || errors.length) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
