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

// ---------- 2) 长周目实测：帧间隔 / DOM 规模 / 存档体积是否随存档变老而劣化 ----------
//
// 这里**不靠自然推进**去攒 eventHistory：实测盲点第一个选项会很快破产
// （一个月内就进结局），根本攒不出长存档。
// 改为注入不同"年龄"的存档 —— 这样才能真正回答
// "热路径从 O(n·m) 改成 O(n+m) 之后，帧率会不会随存档变长而劣化"。
//
// **这一段在第三十四轮之前是一条假通过**（§四 同款"把没测到当测过了"）：
// 原来的 playMonth() 只认底栏「进 下 月」，而待办事件排开时那颗按钮写着「进下 一 件」，
// 于是它每步返回 'stuck'、第一圈就退出循环；三档各只抄到 2/5/6 帧、实际推进 0 个月，
// 脚本照样打印"✅ 帧率未随存档变长而劣化"。现在读数门槛不达标就记 ✗ 并非零退出。
// 走局本身是随机的（盲点第一个选项，6 个月内什么时候结案全看运气），
// 所以门槛不许降、撞不到就整档重抽（最多 3 次）—— 重抽治的是抽样，不是标准。
console.log('\n注入不同年龄的存档，实测推进月份的帧间隔 / 主界面节点数 / 自动存档体积：')

const MIN_MONTHS = 6      // 每档至少要真的走这么多个月
const MIN_FRAMES = 240    // 至少要抄到这么多帧，否则 P50/P95 没有意义
let fails = 0

const mkSave = (histLen, recLen, year) => ({
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
  // 履历是结算页「这一生」真正渲染的东西，留空等于那一半没测。
  // 按真实比例混：绝大多数是没过 impact 的日常事件，少量升官/婚配（它们才是
  // pickKeyLifeRecords 会挑出来的"关键条目"）。
  lifeRecords: Array.from({ length: recLen }, (_, i) => ({
    id: 'lr_' + i,
    year: 1628 + Math.floor(i / 12),
    month: (i % 12) + 1,
    type: i % 60 === 0 ? 'promotion' : i % 41 === 0 ? 'marriage' : 'event',
    impact: i % 60 === 0 ? '升迁' : undefined,
    title: `履历条目 ${i}`,
    description: '这是一条用于压测的履历文字，长度接近真实条目'
  })),
  schemaVersion: 3,
  stats: {}
})

/** 从自动存档里读 turn：引擎每推进一个月 +1（useGameEngine 的 turn: newState.turn + 1） */
const readTurn = page => page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('chongzhen_autosave') || '{}')?.gameState?.turn ?? -1
  } catch {
    return -1
  }
})

/**
 * 走局：先清掉【搁笔】（拒掉上桌的收束结局卡，不然测到一半就结案），
 * 再点可选项卡 → 结算「继续」，都没有才点底栏那颗（「进 下 月」或「下 一 件」）。
 * 一个月通常排着 2~4 件待办，所以步数预算按月数放大。
 */
async function walkMonths(page, wantMonths) {
  let lastTurn = await readTurn(page)
  let months = 0
  let why = '步数用完'
  for (let step = 0; step < wantMonths * 6 && months < wantMonths; step++) {
    if (await page.locator('.game-screen--ended, .death-ending-overlay').count()) {
      why = `第 ${step + 1} 步中途结案`
      break
    }
    const decline = page.locator('button', { hasText: /搁\s*笔/ }).first()
    if (await decline.count()) {
      await decline.click({ force: true }).catch(() => {})
      await page.waitForTimeout(900)
    } else {
      const card = page.locator('.choices-list .choice-card[aria-disabled="false"]').first()
      if (await card.count()) {
        await card.click({ force: true }).catch(() => {})
        await page.waitForTimeout(900)
      } else {
        const next = page.locator('.action-bar button', { hasText: /进\s*下\s*月|下\s*一\s*件/ }).first()
        if (!(await next.count())) {
          why = `第 ${step + 1} 步没有可点的东西（既无卡也无底栏按钮）`
          break
        }
        await next.click({ force: true }).catch(() => {})
        await page.waitForTimeout(1300)
      }
    }
    const cont = page.locator('.result-actions .continue-btn').first()
    if (await cont.count()) await cont.click({ force: true }).catch(() => {})
    await page.waitForTimeout(700)
    const t = await readTurn(page)
    if (t > lastTurn) {
      months += t - lastTurn
      lastTurn = t
    }
  }
  return { months, why }
}

// 三档**只让存档年龄变、年份不动**（都停在 1634，结局年窗没开、事也不多）：
// 否则"长档更卡"可能只是那一年恰好事多，读不出是存档年龄的功劳还是负担。
async function runSample(histLen, recLen, year, label) {
  const json = JSON.stringify(mkSave(histLen, recLen, year))
  await page.evaluate(([key, save]) => localStorage.setItem(key, save), ['chongzhen_autosave', json])
  // 读档耗时用"等到元素出现"来量，不用固定 sleep：
  // 第一版在 reload 前后各写死 1800ms，抄出来的 3.7s 三档一模一样 —— 那是脚本在睡觉，不是游戏在载入。
  const loadT0 = Date.now()
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  let titleMs = -1
  let inGameMs = -1
  try {
    await page.waitForSelector('.title-btn', { timeout: 30000 })
    titleMs = Date.now() - loadT0
    const cont = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /继\s*续|读\s*取\s*存\s*档/.test(x.textContent || ''))
      if (b) { b.click(); return true }
      return false
    })
    if (!cont) { console.log(`  ${label}：标题页没有"继续游戏"（存档没被认出来）`); return null }
    const inT0 = Date.now()
    await page.waitForSelector('.game-screen', { timeout: 30000 })
    inGameMs = Date.now() - inT0
    await page.waitForTimeout(600)
  } catch {
    console.log(`  ${label}：载入/读档没等到界面出现`)
    return null
  }
  const nodesBefore = await page.evaluate(() => document.querySelectorAll('*').length)

  await page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = t => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })

  const { months, why } = await walkMonths(page, MIN_MONTHS)
  const m = await page.evaluate(() => {
    const f = (window.__frames || []).filter(x => x > 0).sort((a, b) => a - b)
    if (!f.length) return null
    return {
      p50: +f[Math.floor(f.length * 0.5)].toFixed(1),
      p95: +f[Math.floor(f.length * 0.95)].toFixed(1),
      worst: +f[f.length - 1].toFixed(1),
      over50: f.filter(x => x > 50).length,
      total: f.length
    }
  })
  const heap = await heapMB()
  const size = await page.evaluate(() => {
    const raw = localStorage.getItem('chongzhen_autosave') || ''
    const per = {}
    try {
      const obj = JSON.parse(raw)
      for (const k of Object.keys(obj)) per[k] = JSON.stringify(obj[k]).length
    } catch {
      return { bytes: raw.length, top: '（读不到）' }
    }
    const top = Object.entries(per)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${(v / 1024).toFixed(1)}KB`)
      .join(' / ')
    return { bytes: raw.length, top }
  })
  const nodesAfter = await page.evaluate(() => document.querySelectorAll('*').length)
  const frame = m || { p50: 0, p95: 0, worst: 0, over50: 0, total: 0 }
  return { label, hist: histLen, rec: recLen, months, why, titleMs, inGameMs, nodesBefore, nodesAfter, heap, bytes: size.bytes, top: size.top, ...frame }
}

/** 读数门槛不许动，所以撞不到就重抽 —— 走局是随机的，6 个月里什么时候结案全看运气 */
const MAX_ATTEMPTS = 3
const samples = []
for (const [histLen, recLen, year, label] of [
  [5, 4, 1634, '新档（5 史 / 4 履历）'],
  [150, 120, 1634, '中年档（150 / 120）'],
  [600, 480, 1634, '长档（600 / 480）']
]) {
  let best = null
  let attempts = 0
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++
    const r = await runSample(histLen, recLen, year, label)
    if (!r) continue
    if (!best || r.months > best.months) best = r
    if (best.months >= MIN_MONTHS && best.total >= MIN_FRAMES) break
  }
  if (!best) {
    console.log(`  ${label}：✗ ${attempts} 次都没载入成功 —— 读数无效`)
    fails++
    continue
  }
  samples.push(best)
  console.log(`  ${label}${attempts > 1 ? `（第 ${attempts} 次抽到）` : ''}`)
  console.log(`    首屏 ${best.titleMs}ms · 读档→主界面 ${best.inGameMs}ms · 主界面节点 ${best.nodesBefore}→${best.nodesAfter} · 堆 ${best.heap} MB`)
  console.log(`    自动存档 ${(best.bytes / 1024).toFixed(1)} KB，占头：${best.top}`)
  console.log(`    推进 ${best.months} 月 · 帧 P50 ${best.p50}ms P95 ${best.p95}ms 最差 ${best.worst}ms · >50ms ${best.over50}/${best.total}`)
  if (best.months < MIN_MONTHS || best.total < MIN_FRAMES) {
    console.log(`    ✗ 读数无效：${MAX_ATTEMPTS} 次都只推进到 ${best.months} 月 / ${best.total} 帧（要 ≥${MIN_MONTHS} 月、≥${MIN_FRAMES} 帧；${best.why}）`)
    fails++
  }
}

// ---------- 3) 结算页「生平回顾」的渲染规模 ----------
//
// 上面三档量的是**主界面**：那里恒定 349 个节点，履历再多也不涨。
// 真正会随局龄失控的是结案后那一眼 —— `keyEvents` 只取最近 10 条，可`keyEvents`
// 为空的一生走的是另一条路：整份 `lifeRecords` 直接铺成时间线。
// 为了确定性地走到结算页，存档里直接摆上破产死线的两个条件
// （`财帛 <= 0` 且已警告过，见 src/data/zeroWarningEvents.ts 的 isFatalZero）。
console.log('\n长履历一路走到结案，抄结算页·时间线的渲染规模：')

const TIMELINE_WINDOW = 60 // 与 LifeReview.tsx 的常量同值，改那边要改这里
{
  const longSave = mkSave(600, 480, 1640)
  const json = JSON.stringify({
    ...longSave,
    character: {
      ...longSave.character,
      attributes: { 财帛: 0, 文韬: 50, 理政: 50, 武略: 30, 体质: 40 },
      flags: ['归零警告·财帛']
    },
    // 关键条目那条路最多 10 行，永远不会撑爆；出问题的是**没有关键条目**时
    // 直接渲染整份 lifeRecords 的那条兜底路。所以这里的履历一律写成普通事件。
    lifeRecords: longSave.lifeRecords.map(r => ({ ...r, type: 'event', impact: undefined }))
  })
  await page.evaluate(([key, save]) => localStorage.setItem(key, save), ['chongzhen_autosave', json])
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  try {
    await page.waitForSelector('.title-btn', { timeout: 30000 })
    const ok = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /继\s*续|读\s*取\s*存\s*档/.test(x.textContent || ''))
      if (b) { b.click(); return true }
      return false
    })
    if (!ok) throw new Error('标题页没有"继续游戏"')
    await page.waitForSelector('.game-screen', { timeout: 30000 })
    await page.waitForTimeout(800)
  } catch (e) {
    console.log(`  ✗ 载入失败：${String(e.message).slice(0, 60)}`)
    fails++
  }

  let ended = false
  for (let step = 0; step < 30 && !ended; step++) {
    ended = await page.locator('.game-screen--ended, .death-ending-overlay').count() > 0
    if (ended) break
    const card = page.locator('.choices-list .choice-card[aria-disabled="false"]').first()
    if (await card.count()) {
      await card.click({ force: true }).catch(() => {})
      await page.waitForTimeout(900)
      const cont = page.locator('.result-actions .continue-btn').first()
      if (await cont.count()) await cont.click({ force: true }).catch(() => {})
    } else {
      const next = page.locator('.action-bar button', { hasText: /进\s*下\s*月|下\s*一\s*件/ }).first()
      if (!(await next.count())) break
      await next.click({ force: true }).catch(() => {})
    }
    await page.waitForTimeout(700)
  }
  if (!ended) {
    console.log('  ✗ 没能走到结案 —— 结算页读数无效')
    fails++
  } else {
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /查看生平/.test(x.textContent || ''))
      if (!b) return false
      b.click()
      return true
    })
    if (!opened) {
      console.log('  ✗ 结算页上没有"查看生平"按钮 —— 读数无效')
      fails++
    } else {
      await page.waitForTimeout(1200)
      const r = await page.evaluate(() => ({
        rows: document.querySelectorAll('.timeline-row').length,
        panelNodes: document.querySelectorAll('.life-review-container *').length,
        total: document.querySelectorAll('*').length
      }))
      const life = await page.evaluate(() => JSON.parse(localStorage.getItem('chongzhen_autosave') || '{}').lifeRecords?.length ?? -1)
      console.log(`  存档履历 ${life} 条 → 时间线 ${r.rows} 行 · 面板节点 ${r.panelNodes} · 全页节点 ${r.total}（主界面才 349）`)
      if (r.rows > TIMELINE_WINDOW) {
        console.log(`    ✗ 时间线整份铺开了：${r.rows} 行 > 上限 ${TIMELINE_WINDOW}`)
        fails++
      } else {
        console.log(`    ✅ 已收到上限 ${TIMELINE_WINDOW} 行以内`)
      }
    }
  }
}

if (samples.length === 3 && fails === 0) {
  const a = samples[0]
  const b = samples[2]
  console.log(`\n存档从 ${a.hist} 条历史 / ${a.rec} 条履历 涨到 ${b.hist} / ${b.rec}：`)
  console.log(`  帧 P95 ${a.p95}ms → ${b.p95}ms · 最差 ${a.worst}ms → ${b.worst}ms`)
  console.log(`  主界面节点 ${a.nodesAfter} → ${b.nodesAfter} · 堆 ${a.heap} → ${b.heap} MB`)
  console.log(`  自动存档 ${(a.bytes / 1024).toFixed(1)}KB → ${(b.bytes / 1024).toFixed(1)}KB（localStorage 配额约 5MB）`)
  console.log(b.p95 <= a.p95 + 8 && b.bytes < 4 * 1024 * 1024
    ? '✅ 长周目没有劣化（§1.2 那句"推理"到此才算实测）'
    : '⚠️ 长周目劣化：帧率或存档体积随局龄走高，需要复查热路径/瘦身存档')
} else if (fails > 0) {
  console.log(`\n⚠️ ${fails} 档读数无效 —— 未通过的门槛不许算成"测过了"`)
}

await browser.close()
console.log(`\n未捕获错误：${errors.length} 条`)
for (const e of errors.slice(0, 5)) console.log('  ' + e)
process.exit(fails > 0 || errors.length > 0 ? 1 : 0)