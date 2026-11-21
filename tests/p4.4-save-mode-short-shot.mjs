/**
 * P4.4 短屏保存模式实拍：
 * 924×426 进入牌桌 → 展开操作栏 → 存档，2×2 四槽同屏；
 * 短屏隐藏「当前进度」条，列表 264 / 264 不滚动。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.4-save-slots/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const raw = JSON.parse(readFileSync(new URL('../tmp/p3.2-year-save.json', import.meta.url), 'utf8'))
const variants = [
  ['chongzhen_autosave', '顾承畴', '户部主事', 'reputation', 'power', 5],
  ['chongzhen_save_slot_1', '沈介之', '正七品·知县', 'promotion', 'border_war', 3],
  ['chongzhen_save_slot_2', '周允修', '从五品·员外郎', 'family', 'eastern_forest', 4],
  ['chongzhen_save_slot_3', '陆守拙', '正八品·县丞', null, null, 2]
]

function makeSave(v, i) {
  const data = structuredClone(raw)
  data.playerName = v[1]
  data.character.name = v[1]
  data.character.rank = v[2]
  if (v[3]) data.character.careerGoal = v[3]
  else delete data.character.careerGoal
  data.gameState.currentYear = 1628 + i
  data.gameState.currentMonth = 12
  data.currentStoryline = v[4]
  data.lifeRecords = (data.lifeRecords ?? []).slice(0, v[5])
  data.savedAt = `2026-11-21T0${4 + i}:00:00.000Z`
  data.playTime = 3600 + i * 600
  return JSON.stringify(data)
}

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 924, height: 426 }, deviceScaleFactor: 1, hasTouch: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript((entries) => {
  localStorage.clear()
  for (const [key, value] of entries) localStorage.setItem(key, value)
  localStorage.setItem('chongzhen_autosave_seq', '1')
}, variants.map((v, i) => [v[0], makeSave(v, i)]))
await page.goto(`${BASE}?mobile=1&debug=0`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('.mobile-title', { timeout: 15000 })
await page.waitForTimeout(1900)
await page.getByRole('button', { name: /继\s*续\s*上\s*次/ }).click()
await page.waitForSelector('.mobile-board', { timeout: 15000 })
await page.waitForTimeout(600)
await page.getByRole('button', { name: '展开操作栏' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '存档', exact: true }).click()
await page.waitForSelector('.save-slots-modal', { timeout: 15000 })
await page.waitForTimeout(500)

const metrics = await page.evaluate(() => {
  const modal = document.querySelector('.save-slots-modal')
  const list = document.querySelector('.save-slots-list')
  const cards = [...document.querySelectorAll('.save-slot.has-data')]
  const rect = modal.getBoundingClientRect()
  return {
    modal: [Math.round(rect.width), Math.round(rect.height)],
    modalInViewport: rect.top >= -1 && rect.bottom <= innerHeight + 1,
    list: [list.clientHeight, list.scrollHeight, list.scrollHeight > list.clientHeight + 1],
    currentInfo: getComputedStyle(document.querySelector('.current-game-info')).display,
    filled: cards.length,
    clipped: cards.filter(slot => {
      const content = slot.querySelector('.slot-content')
      return content.getBoundingClientRect().bottom > slot.getBoundingClientRect().bottom + 1
    }).length
  }
})
await page.screenshot({ path: `${OUT}手机-保存模式-924x426.png` })
await browser.close()

console.log(JSON.stringify(metrics), `errors=${errors.length}`)
const pass =
  errors.length === 0 &&
  metrics.modalInViewport &&
  metrics.modal[0] === 795 &&
  metrics.list[2] === false &&
  metrics.currentInfo === 'none' &&
  metrics.filled === 4 &&
  metrics.clipped === 0
console.log(pass ? 'PASS 924×426 保存模式' : 'FAIL 924×426 保存模式')
if (!pass) {
  console.error('P4.4 短屏保存模式 FAIL')
  process.exit(1)
}
console.log('P4.4 短屏保存模式 OK')
