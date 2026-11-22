/**
 * P4.9 危局条贴合顶部状态卡组：
 * - HUD 与危局条之间不再留 flex gap，红条成为 HUD 的底部告警行；
 * - 整个状态卡组与事件区之间仍保留 8px 标准间距；
 * - 无危局时 HUD 恢复四角 3px 圆角，事件区与 HUD 仍相隔 8px。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.9-risk-dock/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const save = readFileSync(new URL('../tmp/p3.1-career-save.json', import.meta.url), 'utf8')

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`PASS ${name}${detail ? ` | ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` | ${detail}` : ''}`)
  }
}
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol

async function run(browser, viewport, withRisk) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript(({ save, withRisk }) => {
    const parsed = JSON.parse(save)
    if (withRisk) {
      parsed.gameState.currentYear = 1632
      parsed.gameState.currentMonth = 8
      parsed.gameState['圣眷'] = 12
      parsed.gameState['士绅'] = 2
      parsed.gameState['中官'] = 87
      parsed.gameState['清议'] = 34
      parsed.gameState['民望'] = 74
      parsed.gameState['国势'] = 55
      parsed.character.attributes['财帛'] = 13
      parsed.character.attributes['文韬'] = 100
      parsed.character.attributes['理政'] = 100
      parsed.character.attributes['武略'] = 30
      parsed.character.attributes['体质'] = 24
      parsed.character.name = '欧阳汝贤'
      parsed.character.courtesyName = '君骞'
      parsed.character.rank = '从七品·判官'
      parsed.character.origin = '海商'
      parsed.character.age = 26
      parsed.identityType = '判官'
    } else {
      parsed.gameState['圣眷'] = 80
      parsed.gameState['士绅'] = 80
    }
    const out = JSON.stringify(parsed)
    localStorage.clear()
    localStorage.setItem('chongzhen_autosave', out)
    localStorage.setItem('chongzhen_autosave_seq', '1')
    localStorage.setItem('chongzhen_save_slot_1', out)
  }, { save, withRisk })
  await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.mobile-title', { timeout: 15000 })
  await page.waitForTimeout(1900)
  await page.getByRole('button', { name: /继.*续.*上.*次/ }).click()
  await page.waitForSelector('.mobile-hud', { timeout: 15000 })
  await page.waitForTimeout(600)

  const metrics = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        x: +r.x.toFixed(2), y: +r.y.toFixed(2), bottom: +r.bottom.toFixed(2),
        w: +r.width.toFixed(2), h: +r.height.toFixed(2),
        radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
        borderTopWidth: cs.borderTopWidth,
        borderBottomWidth: cs.borderBottomWidth,
        borderBottomColor: cs.borderBottomColor,
        borderTopColor: cs.borderTopColor,
        display: cs.display,
      }
    }
    return {
      viewport: [innerWidth, innerHeight],
      stack: rect('.mobile-board__status-stack'),
      hud: rect('.mobile-hud'),
      risk: rect('.risk-hud'),
      main: rect('.mobile-board__main'),
      host: rect('.mobile-event-host'),
      title: rect('.event-title'),
      overflowX: document.body.scrollWidth > innerWidth + 1,
      pageScroll: document.body.scrollHeight > innerHeight + 1,
    }
  })

  console.log(`\n${viewport.width}x${viewport.height} risk=${withRisk}: ${JSON.stringify(metrics)}`)
  check(`${viewport.width} 状态卡组存在`, !!metrics.stack)
  check(`${viewport.width} HUD 顶到卡组顶`, near(metrics.hud.y, metrics.stack.y), `${metrics.hud.y} vs ${metrics.stack.y}`)
  check(`${viewport.width} 事件区在 HUD 下方`, metrics.host.y > metrics.hud.bottom, `${metrics.host.y} > ${metrics.hud.bottom}`)
  check(`${viewport.width} 无横向溢出`, !metrics.overflowX)
  check(`${viewport.width} 无整页滚动`, !metrics.pageScroll)
  check(`${viewport.width} 0 console error`, errors.length === 0, String(errors.length))

  if (withRisk) {
    check(`${viewport.width} 危局条存在`, !!metrics.risk)
    check(`${viewport.width} 危局条顶接 HUD 底`, near(metrics.risk.y, metrics.hud.bottom), `${metrics.risk.y} vs ${metrics.hud.bottom}`)
    check(`${viewport.width} 危局条压在卡组底`, near(metrics.risk.bottom, metrics.stack.bottom), `${metrics.risk.bottom} vs ${metrics.stack.bottom}`)
    check(`${viewport.width} 事件区与危局条相隔 8px`, near(metrics.main.y - metrics.risk.bottom, 8), `${(metrics.main.y - metrics.risk.bottom).toFixed(2)}`)
    check(`${viewport.width} 事件标题不压危局条`, metrics.title.y >= metrics.risk.bottom + 4, `${metrics.title.y} >= ${metrics.risk.bottom}+4`)
    check(`${viewport.width} HUD 上圆角下直角`, metrics.hud.radius[0] === '3px' && metrics.hud.radius[1] === '3px' && metrics.hud.radius[2] === '0px' && metrics.hud.radius[3] === '0px', metrics.hud.radius.join('/'))
    check(`${viewport.width} 危局条上直下圆`, metrics.risk.radius[0] === '0px' && metrics.risk.radius[1] === '0px' && metrics.risk.radius[2] === '3px' && metrics.risk.radius[3] === '3px', metrics.risk.radius.join('/'))
    check(`${viewport.width} HUD 底边不再画线`, metrics.hud.borderBottomWidth === '0px', metrics.hud.borderBottomWidth)
    check(`${viewport.width} 危局条顶边不再画线`, metrics.risk.borderTopWidth === '0px', metrics.risk.borderTopWidth)
  } else {
    check(`${viewport.width} 无危局时不渲染红条`, !metrics.risk)
    check(`${viewport.width} 无危局时 HUD 与事件区间隔 8px`, near(metrics.main.y - metrics.hud.bottom, 8), `${(metrics.main.y - metrics.hud.bottom).toFixed(2)}`)
    check(`${viewport.width} 无危局时 HUD 四角 3px`, metrics.hud.radius.every((r) => r === '3px'), metrics.hud.radius.join('/'))
  }

  await page.screenshot({ path: `${OUT}手机-${withRisk ? '危局' : '无危局'}-${viewport.width}x${viewport.height}.png` })
  await context.close()
  return { metrics, errors }
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const results = []
  for (const viewport of [
    { width: 924, height: 426 },
    { width: 640, height: 360 },
    { width: 568, height: 320 },
    { width: 480, height: 320 },
  ]) {
    results.push(await run(browser, viewport, true))
  }
  results.push(await run(browser, { width: 924, height: 426 }, false))

  // 极短屏仍应保持 P4.5 的事件区可用高度，并保留 6 方局势单行。
  for (const width of [640, 568, 480]) {
    const m = results.find((r) => r.metrics.viewport[0] === width && r.metrics.risk)?.metrics
    check(`${width} 短屏 HUD ≤140px`, m.hud.h <= 140, `${m.hud.h}`)
    check(`${width} 短屏事件区 ≥150px`, m.host.h >= 150, `${m.host.h}`)
  }

  console.log(`\nP4.9 危局条贴合：${passed} PASS / ${failed} FAIL`)
  if (failed > 0) process.exit(1)
} finally {
  await browser.close()
}
