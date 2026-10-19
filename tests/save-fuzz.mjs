import { chromium } from 'playwright'

/**
 * 判定"崩溃"的口径。
 *
 * 踩过的坑：最初把**任何** console.error 都算作崩溃，结果把
 * "存档损坏 → 被 try/catch 正确捕获 → 打一条诊断日志" 误报成崩溃，
 * 一度以为还有 3 个白屏。实际上它们 root 完好、无 ErrorBoundary、
 * 无未捕获异常 —— 那是**正确行为**。
 *
 * 真正的闪退只有三种形态：
 *   1. pageerror —— 未捕获异常
 *   2. ErrorBoundary 接管
 *   3. #root 被清空（白屏）
 * console.error 只作为参考信息打印，不参与判定。
 */
/**
 * 存档模糊测试：把各种"畸形存档"塞进 localStorage，逐一尝试加载，
 * 看会不会崩溃。动机：这是一款迭代了多版的游戏，玩家手里必然有旧存档，
 * "读档闪退"是最典型的 complaint 来源，且只在真实浏览器里暴露。
 *
 * 判定"崩溃"的口径踩过一个坑：最初把**任何** console.error 都算作崩溃，
 * 结果把"存档损坏 → 被 try/catch 正确捕获 → 打一条诊断日志"误报成崩溃，
 * 一度以为还有 3 个白屏。它们其实 root 完好、无 ErrorBoundary、无未捕获异常。
 * 真正的闪退只有三种：pageerror / ErrorBoundary 接管 / #root 被清空。
 */
const isRealCrash = r =>
  r.pageErrors > 0 || r.hasErrorUI || r.rootChildren === 0
const BASE = process.argv[2] || 'http://localhost:4173/'
const KEY = 'chongzhen_autosave'

const LEGACY_V1 = {
  character: {
    name: '旧档', courtesyName: '', hometown: '苏州', origin: '寒门', age: 22,
    degree: '进士', rank: '从七品·判官',
    attributes: { 财帛: 15, 文韬: 65, 理政: 30, 武略: 20, 体质: 60 },
    flags: []
  },
  gameState: { turn: 5, currentYear: 1629, currentMonth: 3, 国势: 75, 圣眷: 20, 中官: 20, 清议: 25, 士绅: 15, 民望: 30 },
  eventHistory: ['hist_1628_001'],
  saveTime: '2026-01-01T00:00:00.000Z'
}

const CASES = [
  ['完全空对象', {}],
  ['只有 character', { character: LEGACY_V1.character }],
  ['只有 gameState', { gameState: LEGACY_V1.gameState }],
  ['character 无 attributes', { character: { ...LEGACY_V1.character, attributes: undefined }, gameState: LEGACY_V1.gameState }],
  ['attributes 为 null', { character: { ...LEGACY_V1.character, attributes: null }, gameState: LEGACY_V1.gameState }],
  ['attributes 缺单个键（理政）', {
    character: { ...LEGACY_V1.character, attributes: { 财帛: 10, 文韬: 10, 武略: 10, 体质: 10 } },
    gameState: LEGACY_V1.gameState
  }],
  ['character 是字符串', { character: 'not an object', gameState: LEGACY_V1.gameState }],
  ['gameState 是字符串', { character: LEGACY_V1.character, gameState: 'not an object' }],
  ['character.faction 缺字段', { character: { ...LEGACY_V1.character, faction: {} }, gameState: LEGACY_V1.gameState }],
  ['pendingEvents 含垃圾', { ...LEGACY_V1, pendingEvents: [null, 'x', { id: 'nope' }] }],
  ['currentEvent.choices 含 null 项', { ...LEGACY_V1, currentEvent: { id: 'e1', title: 't', description: 'd', choices: [null, { text: 'ok' }] } }],
  ['currentEvent 缺 description', { ...LEGACY_V1, currentEvent: { id: 'e1', title: 't', choices: [] } }],
  ['wife 对象残缺', { character: { ...LEGACY_V1.character, wives: [{ id: 'w1' }] }, gameState: LEGACY_V1.gameState }],
  ['stats 全 null', { ...LEGACY_V1, stats: { choicesMade: null, promotions: null, demotions: null, saves: null, undos: null, firstChoice: null, randomChoice: null, eventsSeen: null } }],
  ['attributes 全 null（NaN 被序列化）', {
    character: { ...LEGACY_V1.character, attributes: { 财帛: null, 文韬: null, 理政: null, 武略: null, 体质: null } },
    gameState: LEGACY_V1.gameState
  }],
  ['缺 hidden（隐藏属性）', { character: { ...LEGACY_V1.character, hidden: undefined }, gameState: LEGACY_V1.gameState }],
  ['缺 机敏值/忠诚值 的 hidden', {
    character: { ...LEGACY_V1.character, hidden: { 道德值: 50, 欲望值: 40, 野心值: 30 } },
    gameState: LEGACY_V1.gameState
  }],
  ['含已删除的成就 id', {
    ...LEGACY_V1,
    achievements: { unlocked: ['wealthy', 'master_collector', 'ultimate_master', 'saver', 'first_choice', 'popular', 'ending_collection_15'], unlockTimes: { wealthy: '2026-01-01T00:00:00.000Z' } }
  }],
  ['含未定义成就 id', {
    ...LEGACY_V1,
    achievements: { unlocked: ['totally_made_up_xyz'], unlockTimes: { totally_made_up_xyz: 'x' } }
  }],
  ['gameState.currentYear 为 null', { ...LEGACY_V1, gameState: { ...LEGACY_V1.gameState, currentYear: null } }],
  ['gameState 全 null 字段', { ...LEGACY_V1, gameState: { turn: null, currentYear: null, currentMonth: null, 国势: null } }],
  ['eventHistory 含重复与 null', { ...LEGACY_V1, eventHistory: ['a', 'a', null, 'b'] }],
  ['currentEvent 指向不存在的事件', { ...LEGACY_V1, currentEvent: { id: 'does_not_exist', title: '幽灵事件', choices: [] } }],
  ['currentEvent.choices 为 null', { ...LEGACY_V1, currentEvent: { id: 'x', title: 't', description: 'd', choices: null } }],
  ['lifeRecords 非数组', { ...LEGACY_V1, lifeRecords: { not: 'an array' } }],
  ['playTime 为字符串', { ...LEGACY_V1, playTime: '12345' }],
  ['rank 为空字符串', { ...LEGACY_V1, character: { ...LEGACY_V1.character, rank: '' } }],
  ['schemaVersion 为未来值', { ...LEGACY_V1, schemaVersion: 999 }],
  ['year 超出范围 1600', { ...LEGACY_V1, gameState: { ...LEGACY_V1.gameState, currentYear: 1600, currentMonth: 1 } }],
  ['year 超出范围 3000', { ...LEGACY_V1, gameState: { ...LEGACY_V1.gameState, currentYear: 3000, currentMonth: 99 } }],
  ['超大 eventHistory（5000 条）', { ...LEGACY_V1, eventHistory: Array.from({ length: 5000 }, (_, i) => 'ev_' + i) }],
  ['深层嵌套 flags', { ...LEGACY_V1, character: { ...LEGACY_V1.character, flags: Array.from({ length: 3000 }, (_, i) => 'f' + i) } }]
]

const b = await chromium.launch({ headless: true })
const results = []

for (const [label, payload] of CASES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errs = []
  const pageErrs = []
  page.on('pageerror', e => pageErrs.push(String(e.message).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })

  // 先正常开局进到主玩法，这样"游戏内读档"那条路径才可用
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.locator('.title-btn', { hasText: '开' }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  const ins = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
  if (await ins.count()) {
    for (let i = 0; i < await ins.count(); i++) {
      const e = ins.nth(i)
      if (!(await e.inputValue().catch(() => ''))) await e.fill(['测试', '字明', '苏州'][i] || 'x').catch(() => {})
    }
    await page.locator('.setup-screen .confirm-btn').first().click().catch(() => {})
    await page.waitForTimeout(500)
    await page.locator('.origin-card button, .origin-card').first().click().catch(() => {})
    await page.waitForTimeout(1200)
  }

  // 注入畸形存档
  await page.evaluate(([k, v]) => { localStorage.setItem(k, v) }, [KEY, JSON.stringify(payload)])

  // 路径 A：游戏内「存档 → 继续上次游戏」（此前绕过迁移，是白屏高发路径）
  let loadedA = false
  let errsA = []
  if (await page.locator('.game-screen').count()) {
    const before = errs.length
    await page.evaluate(() => {
      // 精确匹配：底栏存按钮是「徽标 存 + 标签 档」两段文本，曾经渲染成「存存档」，
      // 那时这里写的是 /存\s*存\s*档/；现在按整句文本认，避免再次跟着错别字走。
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '存档')
      if (b) b.click()
    })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /继\s*续上次|继续上次/.test(x.textContent || ''))
      if (b) b.click()
    })
    await page.waitForTimeout(1800)
    loadedA = await page.evaluate(() => !!document.querySelector('.game-screen') && !document.querySelector('.error-boundary'))
    const hA = await page.evaluate(() => ({
      root: document.getElementById('root')?.childElementCount ?? -1,
      eb: !!document.querySelector('.error-boundary')
    }))
    if (hA.eb || hA.root === 0) { errsA = errs.slice(before); if (errsA.length === 0) errsA.push('ErrorBoundary/白屏') }
    else errsA = []
  }

  // 路径 B：刷新后从标题屏读档
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /继\s*续|读\s*取\s*存\s*档/.test(x.textContent || ''))
    if (b) b.click()
  })
  await page.waitForTimeout(1800)
  const loadedB = await page.evaluate(() => !!document.querySelector('.game-screen') && !document.querySelector('.error-boundary'))
  const health = await page.evaluate(() => {
    const root = document.getElementById('root')
    const eb = document.querySelector('.error-boundary')
    return {
      rootChildren: root ? root.childElementCount : -1,
      hasErrorUI: !!eb,
      errorMsg: eb ? (eb.querySelector('.error-message')?.textContent || '').slice(0, 140) : null
    }
  })

  const rec = { label, loaded: loadedB, pageErrors: pageErrs.length, errsA, errs: [...new Set(errs)].slice(0, 3), ...health }
  rec.crashed = isRealCrash(rec)
  results.push(rec)
  await ctx.close()
}

// 再测几个"坏字符串"（连 JSON.parse 都过不了）
for (const [label, raw] of [['截断的 JSON', '{"character":{"name":"x"'], ['纯乱码', 'not json at all'], ['空字符串', ''], ['数组而非对象', '[1,2,3]'], ['null 字面量', 'null']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errs = []
  const pageErrs = []
  page.on('pageerror', e => pageErrs.push(String(e.message).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(1000)
  await page.evaluate(([k, v]) => { localStorage.setItem(k, v) }, [KEY, raw])
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(2000)
  const health = await page.evaluate(() => {
    const root = document.getElementById('root')
    return { rootChildren: root ? root.childElementCount : -1, hasErrorUI: !!document.querySelector('.error-boundary') }
  })
  const rec = { label, loaded: false, pageErrors: pageErrs.length, errs: [...new Set(errs)].slice(0, 3), ...health }
  rec.crashed = isRealCrash(rec)
  results.push(rec)
  await ctx.close()
}

await b.close()

console.log('=== 存档模糊测试结果 ===\n')
console.log('（路径A = 游戏内「存档 → 继续上次游戏」；路径B = 刷新后标题屏读档）\n')
let bad = 0
for (const r of results) {
  const tag = r.crashed ? 'CRASH' : (r.loaded ? 'ok   ' : 'skip ')
  if (r.crashed) bad++
  console.log(`${tag} ${r.label.padEnd(32)} A=${r.pathA || '-'} B=${r.loaded ? 'ok' : '-'} root=${String(r.rootChildren).padStart(2)}`)
  if (r.hasErrorUI) console.log(`       ErrorBoundary: ${r.errorMsg}`)
  if (r.errsA?.length) for (const e of r.errsA) console.log(`       [A] ${e}`)
  for (const e of r.errs) console.log(`       ${e}`)
}
console.log(`\n共 ${results.length} 个用例，崩溃 ${bad} 个`)