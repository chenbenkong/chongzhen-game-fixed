import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

// 截图输出到 tests/screenshots/（已在 .gitignore 中，属测试产物不入库）
mkdirSync('screenshots', { recursive: true })

/**
 * 验证这一轮布局/交互整改：
 *  1. 「进 下 月」不再是死 UI —— 该能用时真的能用
 *  2. 未做抉择时禁用，且提示文案不说"点继 续"（此刻那个按钮不存在）
 *  3. 数字键 1–9 能选选项
 *  4. Space 能推进
 *  5. 丹青入口在底栏、紧挨「谋士」；事件面板不再为它占一整行
 *  6. 输入框里按数字不会误选（取名屏）
 *  7. 全程无死锁
 *  8. 底栏不再有「帮助」按钮（帮助改走 H 快捷键）
 */
const BASE = process.argv[2] || 'http://localhost:4173/'
const b = await chromium.launch({ headless: true })
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)))
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`)
}

await page.goto(BASE, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2200)

// ---- 6. 取名屏：输入框里按数字不应触发任何游戏行为 ----
await page.locator('.title-btn', { hasText: '开' }).first().click()
await page.waitForTimeout(600)
{
  // 用 maxLength=14 的"名"字段测（姓氏框 maxLength=2，会把 "1234567" 截成 "12"，
  // 那不是 bug，是长度上限在生效）
  const wide = page.locator('.setup-screen input[maxlength="14"]').first()
  const hasWide = await wide.count() > 0
  const target = hasWide ? wide : page.locator('.setup-screen input').first()
  const cap = Number(await target.getAttribute('maxlength') || '0')
  await target.fill('')
  await target.type('1234567')
  const v = await target.inputValue()
  const expect = cap > 0 ? '1234567'.slice(0, cap) : '1234567'
  check('取名屏输入框内数字键正常输入（不被快捷键截走）', v === expect, `值="${v}" 期望="${expect}" maxLength=${cap}`)

  const ins = page.locator('.setup-screen input')
  for (let i = 0; i < await ins.count(); i++) {
    const e = ins.nth(i)
    const cur = await e.inputValue().catch(() => '')
    if (cur) continue
    await e.fill(['欧阳', '明', '苏州府', '景和', '二十', '戌时', '甲'][i] || '甲').catch(() => {})
  }
  await page.locator('.setup-screen .confirm-btn').first().click()
  await page.waitForTimeout(700)
  // 固定选「缙绅」：财帛 80 / 理政 65，起点稳定。
  // 之前点第一张卡会随机落到「寒门」这类赤贫出身，
  // 结果第一个月就触发【结局】倾家荡产，结局屏盖住事件面板，
  // 后面所有交互断言都变得毫无意义（表现为随机 11/14）。
  const rich = page.locator('.origin-card', { hasText: '缙绅' }).first()
  if (await rich.count() > 0) await rich.click()
  else await page.locator('.origin-card').first().click()
  await page.waitForTimeout(1600)
}

/** 当前焦点元素信息：排查"按了键却没反应"时最关键的线索 */
const activeInfo = () => page.evaluate(() => {
  const a = document.activeElement
  if (!a) return 'null'
  const tag = a.tagName || '?'
  const cls = (a.className && typeof a.className === 'string') ? '.' + a.className.split(/\s+/).slice(0, 3).join('.') : ''
  const editable = a.isContentEditable === true
  const inEditable = !!a.closest?.('[contenteditable="true"],[contenteditable=""]')
  // 顶层监听器能不能收到按键？装一个一次性的计数器
  const tag2 = `${tag}${cls}${editable ? '[editable]' : ''}${inEditable ? '[in-editable]' : ''}`
  return tag2
})

/** 若投骰弹窗开着，把它掷完并确认，让流程回到"已抉择"状态 */
async function settleDiceIfOpen(page) {
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('.dice-confirm-btn:visible').first()
    if (await btn.count() === 0) break
    await btn.click().catch(() => {})
    await page.waitForTimeout(900)
  }
}

const S = () => page.evaluate(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }
  const btns = [...document.querySelectorAll('button')]
  const next = btns.find(x => /进\s*下\s*月|下\s*一\s*件/.test(x.textContent || ''))
  const cont = btns.find(x => vis(x) && /^\s*继\s*续\s*$/.test(x.textContent || ''))
  const choiceEls = [...document.querySelectorAll('.choice-card:not(.locked)')]
  const dice = [...document.querySelectorAll('.dice-attempt-btn')].filter(x => vis(x) && !x.disabled)
  return {
    nextBtn: !!next,
    nextDisabled: next ? next.disabled : null,
    nextLabel: next ? (next.textContent || '').trim() : null,
    nextTitle: next ? next.getAttribute('title') : null,
    hint: document.querySelector('.action-hint')?.textContent?.trim() || null,
    pendingChip: document.querySelector('.pending-chip')?.textContent?.trim() || null,
    hasContinue: !!cont,
    choices: choiceEls.length,
    indexBadges: [...document.querySelectorAll('.choice-index')].map(e => e.textContent.trim()),
    dice: dice.length,
    hasDanqingInBar: !!document.querySelector('.action-bar .image-generator-btn'),
    danqingNextToAdvisor: (() => {
      const btns = [...document.querySelectorAll('.action-bar .action-btn')]
      const i = btns.findIndex(b => b.classList.contains('image-generator-btn'))
      const j = btns.findIndex(b => b.classList.contains('ai-advisor-btn'))
      return i >= 0 && j >= 0 && Math.abs(i - j) === 1
    })(),
    barTexts: [...document.querySelectorAll('.action-bar button')].map(x => (x.textContent || '').trim().replace(/\s+/g, '')),
    inEventDanqing: [...document.querySelectorAll('.event-display button')].filter(x => /丹青|此景/.test(x.textContent || '')).length,
    ended: !!document.querySelector('.game-screen--ended'),
    canAct: choiceEls.length > 0 || dice.length > 0 || !!cont || (next && !next.disabled)
  }
})

// ---- 1/2. 未抉择时 ----
{
  const s = await S()
  check('未触发结局屏（测试前置条件）', !s.ended, s.ended ? '角色开局即破产，后续断言无意义' : '')
  check('未抉择时「进下月」禁用', s.nextDisabled === true, `label=${s.nextLabel}`)
  check('未抉择时提示不说"点继 续"', !!s.hint && !/继\s*续/.test(s.hint), `hint="${s.hint}"`)
  check('未抉择时面板内确实没有「继 续」按钮', !s.hasContinue)
  check('底栏有「丹青」入口', s.hasDanqingInBar, `底栏=${s.barTexts.join(',')}`)
  check('丹青按钮紧挨「谋士」', s.danqingNextToAdvisor)
  check('底栏不再有「帮助」按钮', !s.barTexts.some(t => t.includes('帮助')), `底栏=${s.barTexts.join(',')}`)
  check('事件面板不再有整行「事件插图」', s.inEventDanqing === 0, `count=${s.inEventDanqing}`)
  check('回合旁显示待办数', !!s.pendingChip, s.pendingChip || '')
  check('选项带 1..N 序号徽标', s.indexBadges.join(',') === s.choices + '' ? false : s.indexBadges.length > 0, s.indexBadges.join(','))
}

// ---- 3. 数字键选选项 ----
{
  // 按**第一个未锁定**选项的序号，避免按到锁定项（那会打开投骰弹窗，
  // 是正确行为，但本用例要断言的是"数字键能完成一次抉择"）
  const target = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.choice-card')]
    for (const c of cards) {
      if (c.classList.contains('locked')) continue
      return c.querySelector('.choice-index')?.textContent?.trim() || null
    }
    return null
  })
  check('存在带序号徽标的未锁定选项', target !== null, `序号=${target}`)
  if (target) {
    // 探针：记录 window 在捕获阶段收到的最后一个按键。
// 有记录 → 产品逻辑收到了却没处理；无记录 → 按键在半路被覆盖层吞掉。
await page.evaluate(() => {
  window.__lastKey = null
  window.addEventListener('keydown', e => { window.__lastKey = `key=${e.key}` }, { capture: true })
})
await page.keyboard.press(target)
await page.waitForTimeout(1200)
const probe = await page.evaluate(() => window.__lastKey)
// 若该选项仍需投骰（条件不足但可勉力一试），把骰子掷完
await settleDiceIfOpen(page)
const after = await S()
check('数字键可选中选项', after.hasContinue, `按了 ${target}，继续=${after.hasContinue}，焦点=${await activeInfo()}，probe=${probe}`)
  }
}

// ---- 1. 已抉择后「进下月」应可用 ----
{
  const s = await S()
  check('已抉择后「进下月」变为可点', s.nextDisabled === false, `label=${s.nextLabel} title=${s.nextTitle}`)
  check('可点时不再显示禁用提示', !s.hint)
}

// ---- 4. Space 推进 ----
{
  const before = await S()
  await page.keyboard.press('Space')
  await page.waitForTimeout(1200)
  const after = await S()
  const advanced = after.ended || after.choices !== before.choices || after.hasContinue !== before.hasContinue || after.nextLabel !== before.nextLabel
  check('Space 可推进流程', advanced, `${before.nextLabel}/${before.choices} → ${after.nextLabel}/${after.choices}`)
}

// ---- 5. 循环若干步，全程无死锁（全程只用键盘，模拟真实玩家） ----
{
  let dead = 0
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => {
      const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }
      const btns = [...document.querySelectorAll('button')]
      const next = btns.find(x => /进\s*下\s*月|下\s*一\s*件/.test(x.textContent || ''))
      const cont = btns.find(x => vis(x) && /^\s*继\s*续\s*$/.test(x.textContent || ''))
      const diceOpen = [...document.querySelectorAll('.dice-confirm-btn')].some(x => vis(x) && !x.disabled)
      let firstOpenIdx = null
      for (const c of document.querySelectorAll('.choice-card')) {
        if (c.classList.contains('locked')) continue
        firstOpenIdx = c.querySelector('.choice-index')?.textContent?.trim() || null
        break
      }
      return {
        ended: !!document.querySelector('.game-screen--ended'),
        diceOpen,
        firstOpenIdx,
        cont: !!cont,
        nextReady: !!next && !next.disabled,
        canAct: diceOpen || firstOpenIdx !== null || !!cont || (!!next && !next.disabled)
      }
    })

    if (st.ended) break
    if (!st.canAct) { dead++; break }

    if (st.diceOpen) await settleDiceIfOpen(page)
    else if (st.firstOpenIdx) await page.keyboard.press(st.firstOpenIdx)
    else await page.keyboard.press('Space')
    await page.waitForTimeout(650)
  }
  const fin = await page.evaluate(() => !!document.querySelector('.game-screen--ended'))
  check('纯键盘连续游玩无死锁', dead === 0, fin ? '已触发结局' : '进行中')
}

await page.screenshot({ path: 'screenshots/ux-final.png' })
await b.close()

const failed = results.filter(r => !r.pass)
console.log(`\n通过 ${results.length - failed.length}/${results.length}`)
console.log(`未捕获错误：${errs.length}`)
for (const e of errs.slice(0, 5)) console.log('  ' + e)
process.exit(failed.length || errs.length ? 1 : 0)