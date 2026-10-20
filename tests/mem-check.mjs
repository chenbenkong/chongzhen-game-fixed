import { chromium } from 'playwright'

/**
 * 长时内存与帧率检查。
 *
 * 为什么查这个：渲染进程 OOM 是桌面版"闪退/白屏"最常见的原因之一，
 * 而我刚给 Electron 主进程加了 render-process-gone 兜底 ——
 * 但兜底只是善后，得先确认游戏本身不会泄漏。
 *
 * 测两件事：
 *   1. 反复开关各种弹窗后，JS 堆是否单调增长（泄漏）
 *   2. 同一局内推进大量回合后，帧间隔是否随 eventHistory 变长而劣化
 *      （上一轮把热路径从 O(n*m) 改成 O(n+m)，这里是那项改动的实测验证）
 */
const BASE = process.argv[2] || 'http://localhost:4173/'
const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

const errors = []
page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)))

// 开局前先拿到 CDP 以便强制 GC，得到可比的堆占用
const client = await page.context().newCDPSession(page)
// Performance 域必须先 enable，否则 getMetrics 拿不到 JSHeapUsedSize
// （踩过：返回 null，害得第一版内存检查全是 null）
await client.send('Performance.enable')
await client.send('HeapProfiler.enable')

async function heapMB() {
  await client.send('HeapProfiler.collectGarbage')
  await new Promise(r => setTimeout(r, 120))
  const { metrics } = await client.send('Performance.getMetrics')
  const m = metrics.find(x => x.name === 'JSHeapUsedSize')
  return m ? +(m.value / 1048576).toFixed(1) : null
}

await page.goto(BASE, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2500)

await page.locator('.title-btn', { hasText: '开' }).first().click()
await page.waitForTimeout(500)
const ins = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
for (let i = 0; i < await ins.count(); i++) {
  const e = ins.nth(i)
  if (!(await e.inputValue().catch(() => ''))) await e.fill(['测试', '字明', '苏州'][i] || 'x').catch(() => {})
}
await page.locator('.setup-screen .confirm-btn').first().click()
await page.waitForTimeout(600)
await page.locator('.origin-card button, .origin-card').first().click().catch(() => {})
await page.waitForTimeout(1500)

async function playMonth() {
  for (let s = 0; s < 12; s++) {
    const r = await page.evaluate(() => {
      if (document.querySelector('.game-screen--ended')) return 'ended'
      const c = document.querySelector('.choice-card:not(.locked)')
      if (c) { c.click(); return 'choice' }
      const n = [...document.querySelectorAll('button')].find(x => /进\s*下\s*月/.test(x.textContent || ''))
      if (n && !n.disabled) { n.click(); return 'advance' }
      return 'stuck'
    })
    if (r === 'ended' || r === 'stuck') return r
    await page.waitForTimeout(70)
  }
  return 'maxsteps'
}

// ---------- 1) 弹窗开关泄漏检查 ----------
const base = await heapMB()
console.log(`堆占用基线（进游戏后）：${base} MB\n`)
console.log('弹窗开关 12 轮，每轮开/关 5 个面板：')
const series = []
for (let round = 0; round < 12; round++) {
  for (const rx of ['骰|谋士', '功\\s*成就', '经\\s*周易', '存\\s*存\\s*档']) {
    await page.evaluate(r => {
      const b = [...document.querySelectorAll('button')].find(x => new RegExp(r).test(x.textContent || ''))
      if (b) b.click()
    }, rx)
    await page.waitForTimeout(140)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(140)
  }
  // 帮助按钮已从底栏隐藏（第三十一轮补丁），H 仍要能开关这个弹窗
  await page.keyboard.press('h')
  await page.waitForTimeout(140)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(140)
  const h = await heapMB()
  series.push(h)
  console.log(`  轮 ${String(round + 1).padStart(2)}: ${h} MB`)
}
const first3 = series.slice(0, 3).reduce((a, b) => a + b, 0) / 3
const last3 = series.slice(-3).reduce((a, b) => a + b, 0) / 3
const growth = +(last3 - first3).toFixed(1)
console.log(`\n前 3 轮均值 ${first3.toFixed(1)} MB → 后 3 轮均值 ${last3.toFixed(1)} MB，差 ${growth >= 0 ? '+' : ''}${growth} MB`)
console.log(growth > 8 ? '⚠️ 疑似泄漏（12 轮弹窗开关涨了超过 8MB）' : '✅ 无明显泄漏')

// ---------- 2) 帧间隔随事件历史增长是否劣化 ----------
//
// 这里**不靠自然推进**去攒 eventHistory：实测盲点第一个选项会很快破产
// （一个月内就进结局），根本攒不出长存档。
// 改为直接注入"长历史"存档 —— 这样才能真正回答
// "热路径从 O(n·m) 改成 O(n+m) 之后，帧率会不会随存档变长而劣化"。
console.log('\n注入不同长度的 eventHistory 存档，实测推进月份的帧间隔：')

async function advanceAndSample(nMonths) {
  for (let i = 0; i < nMonths; i++) {
    const r = await playMonth()
    if (r === 'ended' || r === 'stuck') return false
  }
  return true
}

const mkSave = (histLen, year) => ({
  character: {
    name: '测试', courtesyName: '字明', hometown: '苏州', origin: '缙绅',
    age: 40, degree: '进士', rank: '正五品·郎中',
    attributes: { 财帛: 80, 文韬: 80, 理政: 80, 武略: 70, 体质: 80 },
    hidden: { 道德值: 60, 欲望值: 40, 野心值: 50, 机敏值: 60, 忠诚值: 60 },
    flags: ['地方官任职'],
    promotionCount: 5, demotionCount: 0,
    faction: { 东林好感: 55, 阉党好感: 45, 立场: '东林', 党争烈度: 40 },
    history: [], wives: [], lovers: [], examHistory: []
  },
  gameState: { turn: 200, currentYear: year, currentMonth: 1, 国势: 60, 圣眷: 55, 中官: 45, 清议: 55, 士绅: 55, 民望: 55 },
  eventHistory: Array.from({ length: histLen }, (_, i) => 'seed_' + i),
  lifeRecords: [], schemaVersion: 3,
  stats: {}
})

const samples = []
for (const [histLen, year, label] of [[5, 1630, '短存档'], [150, 1640, '中存档'], [600, 1644, '长存档（600 条历史）']]) {
  await page.evaluate(([key, save]) => {
    localStorage.setItem('chongzhen_autosave', JSON.stringify(save))
  }, ['chongzhen_autosave', mkSave(histLen, year)])
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2000)
  // 走"继续上次游戏"
  const cont = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /继\s*续|读\s*取\s*存\s*档/.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  await page.waitForTimeout(1800)
  const inGame = await page.evaluate(() => !!document.querySelector('.game-screen'))
  if (!cont || !inGame) { console.log(`  ${label}：未能读档，跳过`); continue }

  await page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = t => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })

  const ok = await advanceAndSample(6)
  const m = await page.evaluate(() => {
    const f = (window.__frames || []).filter(x => x > 0).sort((a, b) => a - b)
    if (!f.length) return null
    return {
      p50: +f[Math.floor(f.length * 0.5)].toFixed(1),
      p95: +f[Math.floor(f.length * 0.95)].toFixed(1),
      over32: f.filter(x => x > 32).length,
      total: f.length
    }
  })
  const heap = await heapMB()
  samples.push({ label, hist: histLen, ...m, heap })
  console.log(`  ${label.padEnd(22)} 帧 P50 ${String(m.p50).padStart(6)}ms P95 ${String(m.p95).padStart(6)}ms | >32ms ${m.over32}/${m.total} | 堆 ${heap} MB`)
  if (!ok) console.log('    （中途触发结局，样本偏短）')
}

if (samples.length >= 2) {
  const a = samples[0]
  const b = samples[samples.length - 1]
  console.log(`\n事件历史 ${a.hist} → ${b.hist} 条，帧 P95 ${a.p95}ms → ${b.p95}ms`)
  console.log(b.p95 <= a.p95 + 6
    ? '✅ 帧率未随存档变长而明显劣化（O(n·m) → O(n+m) 的实测验证）'
    : '⚠️ 帧率随存档变长劣化，需要复查热路径')
}

await browser.close()
console.log(`\n未捕获错误：${errors.length} 条`)
for (const e of errors.slice(0, 5)) console.log('  ' + e)