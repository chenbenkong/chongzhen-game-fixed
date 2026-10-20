import { chromium } from 'playwright'

/**
 * 崩溃压力测试：模拟真实玩家的"乱按"，全程捕获未捕获异常与错误界面。
 * 重点覆盖：
 *   1. 连续快速点击（双击/三击选项与「进 下 月」）—— 状态竞争
 *   2. 反复开关每一个弹窗
 *   3. 存档 / 读档往返
 *   4. localStorage 配额耗尽
 *   5. 中途刷新
 * 判定"闪退"的三种形态：
 *   - pageerror（未捕获异常）
 *   - ErrorBoundary 界面出现
 *   - #root 被清空（白屏）
 */
const BASE = process.argv[2] || 'http://localhost:4173/'
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
const warnings = []
page.on('pageerror', e => errors.push({ kind: 'pageerror', msg: String(e.message).slice(0, 300) }))
page.on('console', m => {
  const t = m.text()
  if (m.type() === 'error') errors.push({ kind: 'console.error', msg: t.slice(0, 300) })
  if (m.type() === 'warning') warnings.push(t.slice(0, 200))
})

const probes = []
async function health(label) {
  const st = await page.evaluate(() => {
    const root = document.getElementById('root')
    const eb = document.querySelector('.error-boundary, [class*=error-boundary], [class*=errorBoundary]')
    return {
      rootChildren: root ? root.childElementCount : -1,
      hasErrorUI: !!eb,
      errorText: eb ? (eb.innerText || '').slice(0, 120) : null,
      inGame: !!document.querySelector('.game-screen'),
      turn: document.body.innerText.match(/第\s*(\d+)\s*回合/)?.[1] || null,
      storageKB: Math.round((JSON.stringify(localStorage) || '').length / 1024)
    }
  })
  probes.push({ label, ...st })
  return st
}

await page.goto(BASE, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2500)
await health('boot')

// ---- 开局 ----
await page.locator('.title-btn', { hasText: '开' }).first().click()
await page.waitForTimeout(500)
const ins = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
for (let i = 0; i < await ins.count(); i++) {
  const e = ins.nth(i)
  if (!(await e.inputValue().catch(() => ''))) await e.fill(['测试', '字明', '苏州府'][i] || 'x').catch(() => {})
}
await page.locator('.setup-screen .confirm-btn').first().click()
await page.waitForTimeout(600)
await page.locator('.origin-card button, .origin-card').first().click().catch(() => {})
await page.waitForTimeout(1500)
await health('in-game')

const clickAll = async (sel, times = 1, delay = 60) => {
  for (let i = 0; i < times; i++) {
    await page.evaluate(s => {
      const el = document.querySelector(s)
      if (el) el.click()
    }, sel)
    await page.waitForTimeout(delay)
  }
}
const clickByText = async (rx, times = 1, delay = 80) => {
  for (let i = 0; i < times; i++) {
    await page.evaluate(r => {
      const re = new RegExp(r)
      const el = [...document.querySelectorAll('button')].find(b => re.test(b.textContent || '') && !b.disabled)
      if (el) el.click()
    }, rx)
    await page.waitForTimeout(delay)
  }
}

// 真正推进一个月：先把本月的待处理事件全部解决，再点「进 下 月」。
// 注意：只要还有待处理事件，「进 下 月」就是 disabled 的 —— 必须先清事件。
async function playMonth(maxSteps = 12) {
  for (let s = 0; s < maxSteps; s++) {
    const acted = await page.evaluate(() => {
      const ended = !!document.querySelector('.game-screen--ended')
      if (ended) return 'ended'
      const c = document.querySelector('.choice-card:not(.locked)')
      if (c) { c.click(); return 'choice' }
      const n = [...document.querySelectorAll('button')].find(x => /进\s*下\s*月/.test(x.textContent || ''))
      if (n && !n.disabled) { n.click(); return 'advance' }
      return 'stuck'
    })
    if (acted === 'ended') return 'ended'
    if (acted === 'stuck') return 'stuck'
    await page.waitForTimeout(90)
  }
  return 'maxsteps'
}

// ---- 场景 1：疯狂连点选项（状态竞争）----
for (let round = 0; round < 4; round++) {
  await clickAll('.choice-card:not(.locked)', 3, 40)   // 三连击同一个选项
  await clickByText('进\\s*下\\s*月', 3, 40)           // 三连击推进
  await page.waitForTimeout(200)
  await playMonth()
}
await health('after-rapid-click')

// ---- 场景 2：结算进行中就点别的 ----
await page.evaluate(() => document.querySelector('.choice-card:not(.locked)')?.click())
await page.waitForTimeout(20)
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /进\s*下\s*月/.test(b.textContent || ''))?.click())
await page.evaluate(() => document.querySelector('.choice-card:not(.locked)')?.click())
await page.waitForTimeout(20)
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /骰|谋士/.test(b.textContent || ''))?.click())
await page.waitForTimeout(600)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await health('after-overlap')

// ---- 场景 3：反复开关每个弹窗 ----
for (const rx of ['骰|谋士', '功\\s*成就', '存\\s*存\\s*档', '经\\s*周易']) {
  await clickByText(rx, 1, 250)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await clickByText(rx, 1, 250)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
// 帮助按钮已从底栏隐藏（第三十一轮补丁），H 仍要能开关这个弹窗
await page.keyboard.press('h')
await page.waitForTimeout(250)
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
await health('after-modals')

// ---- 场景 4：存档 / 读档往返 ----
await clickByText('存\\s*存\\s*档', 1, 500)
await page.waitForTimeout(500)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const go = btns.find(b => /存|确认|覆|写/.test(b.textContent || '') && !b.disabled)
  if (go) go.click()
})
await page.waitForTimeout(700)
await health('after-save')

// ---- 场景 5：大量回合 ----
let advanced = 0
for (let i = 0; i < 90; i++) {
  const r = await playMonth()
  if (r === 'ended') { probes.push({ label: `ended-at-loop-${i}`, rootChildren: 1, hasErrorUI: false, turn: 'END' }); break }
  if (r === 'stuck') { probes.push({ label: `STUCK-at-loop-${i}`, rootChildren: 1, hasErrorUI: false, turn: '?' }); break }
  advanced++
  if (i % 15 === 0) {
    const st = await health(`turn-loop-${i}`)
    if (st.rootChildren === 0 || st.hasErrorUI) break
  }
}
await health('after-45-turns')
console.log(`（成功推进 ${advanced} 个月）`)

// ---- 场景 6：localStorage 配额耗尽下继续玩 ----
await page.evaluate(() => {
  const big = 'x'.repeat(1024 * 1024)
  try { localStorage.setItem('__fill1', big); localStorage.setItem('__fill2', big); localStorage.setItem('__fill3', big) } catch {}
})
for (let i = 0; i < 6; i++) await playMonth()
await page.waitForTimeout(600)
await health('after-storage-full')
await page.evaluate(() => {
  try { localStorage.removeItem('__fill1'); localStorage.removeItem('__fill2'); localStorage.removeItem('__fill3') } catch {}
})

// ---- 场景 7：刷新后能否续上 ----
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2500)
await health('after-reload')
await clickByText('继\\s*续|读\\s*取\\s*存\\s*档', 1, 600)
await page.waitForTimeout(1500)
await health('after-continue')

await ctx.close()
await b.close()

console.log('=== 健康检查轨迹 ===')
for (const p of probes) {
  const bad = p.rootChildren === 0 || p.hasErrorUI
  console.log(`${bad ? 'XX' : 'ok'}  ${p.label.padEnd(22)} root=${String(p.rootChildren).padStart(2)} turn=${String(p.turn).padStart(3)} storage=${p.storageKB}KB ${p.hasErrorUI ? 'ERR_UI=' + p.errorText : ''}`)
}
console.log('\n=== 未捕获错误 ===')
const uniq = []
const seen = new Set()
for (const e of errors) {
  const k = e.kind + '|' + e.msg.slice(0, 120)
  if (seen.has(k)) continue
  seen.add(k)
  uniq.push(e)
}
if (uniq.length === 0) console.log('（无）')
for (const e of uniq) console.log(`[${e.kind}] ${e.msg}`)

console.log('\n=== console.warning 样本 ===')
const wu = [...new Set(warnings.map(w => w.slice(0, 120)))]
for (const w of wu.slice(0, 8)) console.log('  ' + w)

console.log(`\n总计: ${errors.length} 条错误 / ${uniq.length} 条去重 / ${probes.length} 次健康检查`)