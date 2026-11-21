/**
 * P4.1 存档槽位生涯摘要实拍：
 * 自动存档 + 3 个手动槽位分别显示 志业 X/3 · 史线 · 履历 N。
 * 桌面 1440×900 / 1024×768，手机 924×426 / 480×320。
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4182/'
const OUT = fileURLToPath(new URL('../tmp/p4.1-save-slots/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const raw = JSON.parse(readFileSync(new URL('../tmp/p3.2-year-save.json', import.meta.url), 'utf8'))

function makeSave(variant) {
  const data = structuredClone(raw)
  data.playerName = variant.name
  data.character.name = variant.name
  data.character.rank = variant.rank
  data.character.promotionCount = variant.promotionCount ?? 0
  data.character.flags = [...(data.character.flags ?? []), ...(variant.flags ?? [])]
  if (variant.careerGoal) data.character.careerGoal = variant.careerGoal
  else delete data.character.careerGoal
  data.gameState.currentYear = variant.year
  data.gameState.currentMonth = variant.month
  data.gameState.清议 = variant.清议 ?? 50
  data.currentStoryline = variant.storyline ?? null
  data.lifeRecords = (data.lifeRecords ?? []).slice(0, variant.records)
  data.savedAt = variant.savedAt
  return JSON.stringify(data)
}

const variants = [
  {
    key: 'chongzhen_autosave',
    name: '顾承畴',
    rank: '户部主事',
    careerGoal: 'reputation',
    year: 1628,
    month: 12,
    清议: 66,
    storyline: 'power',
    records: 5,
    savedAt: '2026-11-21T09:00:00.000Z'
  },
  {
    key: 'chongzhen_save_slot_1',
    name: '沈介之',
    rank: '正七品·知县',
    careerGoal: 'promotion',
    promotionCount: 1,
    year: 1629,
    month: 4,
    storyline: 'border_war',
    records: 3,
    savedAt: '2026-11-21T10:00:00.000Z'
  },
  {
    key: 'chongzhen_save_slot_2',
    name: '周允修',
    rank: '从五品·员外郎',
    careerGoal: 'family',
    flags: ['wife_respected'],
    year: 1631,
    month: 9,
    storyline: 'eastern_forest',
    records: 4,
    savedAt: '2026-11-21T11:00:00.000Z'
  },
  {
    key: 'chongzhen_save_slot_3',
    name: '陆守拙',
    rank: '正八品·县丞',
    year: 1633,
    month: 2,
    storyline: null,
    records: 2,
    savedAt: '2026-11-21T12:00:00.000Z'
  }
]

async function openLoadModal(page, mobile) {
  await page.addInitScript((entries) => {
    localStorage.clear()
    for (const { key, value } of entries) localStorage.setItem(key, value)
    localStorage.setItem('chongzhen_autosave_seq', '1')
  }, variants.map(v => ({ key: v.key, value: makeSave(v) })))
  await page.goto(`${BASE}?${mobile ? 'mobile=1&' : ''}debug=0`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector(mobile ? '.mobile-title' : '.title-screen', { timeout: 15000 })
  await page.waitForTimeout(1900)
  await page.getByRole('button', { name: /读\s*取\s*存\s*档/ }).first().click()
  await page.waitForSelector('.save-slots-modal', { timeout: 15000 })
  await page.waitForTimeout(500)
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]
    }
    const modal = document.querySelector('.save-slots-modal')
    const list = document.querySelector('.save-slots-list')
    return {
      modal: rect(modal),
      modalInViewport: !!modal && modal.getBoundingClientRect().bottom <= innerHeight + 1 && modal.getBoundingClientRect().top >= -1,
      list: rect(list),
      listScrollHeight: list?.scrollHeight ?? null,
      listClientHeight: list?.clientHeight ?? null,
      listScrolls: !!list && list.scrollHeight > list.clientHeight + 1,
      filledSlots: document.querySelectorAll('.save-slot.has-data').length,
      archiveRows: [...document.querySelectorAll('.slot-archive-line')].map(el => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      autosaveArchive: document.querySelector('.autosave-slot .slot-archive-line')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      overflowX: document.body.scrollWidth > innerWidth + 1,
      pageScroll: document.body.scrollHeight > innerHeight + 1,
      viewport: [innerWidth, innerHeight]
    }
  })
}

async function shot(browser, viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await openLoadModal(page, mobile)
  const metrics = await measure(page)
  const name = `${mobile ? '手机' : '桌面'}-存档生涯-${viewport.width}x${viewport.height}.png`
  await page.screenshot({ path: `${OUT}${name}` })
  console.log(`${mobile ? 'mobile' : 'desktop'} ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)} errors=${errors.length}`)
  await context.close()
  return { metrics, errors }
}

const browser = await chromium.launch({ channel: 'chrome' })
const cases = [
  [{ width: 1440, height: 900 }, false],
  [{ width: 1024, height: 768 }, false],
  [{ width: 924, height: 426 }, true],
  [{ width: 480, height: 320 }, true]
]
let ok = true
for (const [viewport, mobile] of cases) {
  const { metrics, errors } = await shot(browser, viewport, mobile)
  const pass =
    errors.length === 0 &&
    metrics.modalInViewport &&
    metrics.filledSlots === 4 &&
    metrics.archiveRows.length === 4 &&
    metrics.autosaveArchive === '清名 2/3 · 权谋之术 · 履历 5' &&
    metrics.archiveRows.includes('升迁 1/3 · 边关狼烟 · 履历 3') &&
    metrics.archiveRows.includes('家族 1/3 · 东林风云 · 履历 4') &&
    metrics.archiveRows.includes('未立志业 · 未启程 · 履历 2') &&
    !metrics.overflowX
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${viewport.width}x${viewport.height}`)
  if (!pass) ok = false
}
await browser.close()

if (!ok) {
  console.error('P4.1 存档槽位生涯摘要 FAIL')
  process.exit(1)
}
console.log('P4.1 存档槽位生涯摘要 OK')
