import { chromium } from 'playwright'

/**
 * 第二十轮实测：新拿到拒绝权的两张卡（《殉职任上》《流亡海外》）在真实浏览器里长什么样。
 *
 * 第十九轮的「史馆请笔」名单收的是十一条**善终**；第二十轮把 21 条 `route_*`
 * 从饿死的 random 层挪回 transition 层之后，同一类缺陷在另一批结局上复现了：
 * `殉职任上` 的门票是玩家自己选的 `鞠躬尽瘁`，可判定读的是 flag + 状态（恒真），
 * 于是年窗一开（1635）的第二次月份推进就把局结走 —— 400 局里 36 局停在 1635 年。
 * 这一轮把它和 `流亡海外` 一起纳入名单。本脚本只回答单测答不了的那一半：
 *   1. 这两张卡在界面上真的摆出来，且摆出来的同时**没有**结算屏；
 *   2. 【搁笔】点下去之后游戏继续，且后面不再被请笔；
 *   3. 点收笔那条才真的盖棺（结算屏标题就是这条结局）。
 *
 * 跑法（playwright 装在 tests/ 自己的 node_modules 里，必须在 tests/ 目录下起）：
 *   cd tests && BASE_URL=http://localhost:5173/ node verify-round20.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const SHOT_DIR = new URL('./screenshots/', import.meta.url).pathname.replace(/^\//, '')

/**
 * 两份存档都落在 1634 年十二月（turn 83）：下一月就是 1635 年正月，
 * 这两条结局的年窗 `1635..1660` 在那一刻打开 —— 正是"引擎自己收尾"的那个形状。
 */
const CASES = [
  {
    key: 'duty',
    expectTitle: '殉职任上',
    sealText: '【鞠躬尽瘁】',
    save: {
      character: {
        name: '测试', courtesyName: '字明', hometown: '苏州', origin: '寒门',
        age: 46, degree: '进士', rank: '正三品·侍郎',
        attributes: { 财帛: 40, 文韬: 90, 理政: 85, 武略: 30, 体质: 55 },
        hidden: { 道德值: 92, 欲望值: 15, 野心值: 20, 机敏值: 60, 忠诚值: 90 },
        flags: ['鞠躬尽瘁', '地方官任职'],
        promotionCount: 7, demotionCount: 0,
        faction: { 东林好感: 60, 阉党好感: 20, 立场: '东林', 党争烈度: 30 },
        history: [], wives: [], lovers: [], examHistory: []
      },
      gameState: {
        turn: 83, currentYear: 1634, currentMonth: 12,
        国势: 60, 圣眷: 65, 中官: 40, 清议: 75, 士绅: 65, 民望: 78
      },
      eventHistory: [], lifeRecords: [], schemaVersion: 4, stats: {}
    }
  },
  {
    key: 'exile',
    expectTitle: '流亡海外',
    sealText: '【天涯海角】',
    save: {
      character: {
        name: '测试', courtesyName: '字明', hometown: '泉州', origin: '缙绅',
        age: 44, degree: '进士', rank: '从四品·道台',
        attributes: { 财帛: 70, 文韬: 60, 理政: 60, 武略: 35, 体质: 60 },
        hidden: { 道德值: 40, 欲望值: 55, 野心值: 55, 机敏值: 65, 忠诚值: 30 },
        flags: ['转移资产'],
        promotionCount: 6, demotionCount: 1,
        faction: { 东林好感: 20, 阉党好感: 40, 立场: '无', 党争烈度: 20 },
        history: [], wives: [], lovers: [], examHistory: []
      },
      gameState: {
        turn: 83, currentYear: 1634, currentMonth: 12,
        国势: 20, 圣眷: 30, 中官: 55, 清议: 35, 士绅: 40, 民望: 45
      },
      eventHistory: [], lifeRecords: [], schemaVersion: 4, stats: {}
    }
  }
]

/** 13 条收束型结局印在卡上的标题（DECLINE_COPY），用来区分"被收束结局结案"和"被降临型收掉" */
const SEAL_TITLES = ['名臣垂范', '归隐田园', '大儒传世', '富甲一方', '遁入空门', '天伦之乐',
  '悬壶济世', '致仕善终', '边关大将', '清流骨鲠', '平凡终老', '殉职任上', '流亡海外']

const browser = await chromium.launch({ headless: true })
const failures = []
const ok = m => console.log(`  ✓ ${m}`)
const bad = m => { failures.push(m); console.log(`  ✗ ${m}`) }

async function openWithSave(save) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 160)))
  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 })
  await page.evaluate(s => localStorage.setItem('chongzhen_autosave', JSON.stringify(s)), save)
  await page.reload({ waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(2200)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /继\s*续|读\s*取\s*存\s*档/.test(x.textContent || ''))
    if (b) b.click()
  })
  await page.waitForTimeout(1600)
  return { page, pageErrors }
}

const screenState = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.choice-card')]
  const decline = cards.find(c => /【?搁笔】?/.test(c.textContent || ''))
  return {
    ended: !!document.querySelector('.game-screen--ended') || !!document.querySelector('.game-over-screen'),
    gameOverTitle: document.querySelector('.archetype-variant')?.textContent?.trim() ?? null,
    eventTitle: document.querySelector('.event-title')?.textContent?.trim() ?? '',
    total: cards.length,
    declineVisible: !!decline,
    declineText: decline ? (decline.textContent || '').trim().slice(0, 40) : null
  }
})

/** 一屏一屏往下走；请笔卡与结算屏都算走到头（【搁笔】那条永远留着不点） */
const step = page => page.evaluate(() => {
  if (document.querySelector('.game-screen--ended') || document.querySelector('.game-over-screen')) return 'ended'
  const cards = [...document.querySelectorAll('.choice-card')]
  if (cards.some(c => /搁笔/.test(c.textContent || ''))) return 'offer'
  const c = cards.find(x => !x.classList.contains('locked'))
  if (c) { c.click(); return 'choice' }
  const r = [...document.querySelectorAll('button')].find(x => /进\s*下\s*月|继\s*续/.test(x.textContent || ''))
  if (r && !r.disabled) { r.click(); return 'advance' }
  return 'stuck'
})

async function stepUntilOffer(page, maxSteps = 60) {
  for (let i = 0; i < maxSteps; i++) {
    const s = await screenState(page)
    if (s.declineVisible || s.ended) return { ...s, steps: i }
    const acted = await step(page)
    if (acted === 'ended') return { ...(await screenState(page)), steps: i }
    if (acted === 'stuck') await page.waitForTimeout(300)
    await page.waitForTimeout(340)
  }
  return { ...(await screenState(page)), steps: maxSteps }
}

const clickCard = (page, re) => page.evaluate(({ re }) => {
  const c = [...document.querySelectorAll('.choice-card')].find(x => new RegExp(re).test(x.textContent || ''))
  if (!c) return false
  c.click()
  return true
}, { re })

for (const c of CASES) {
  console.log(`\n=== ${c.expectTitle}：判定命中那个月把卡摆上桌 ===`)
  const { page, pageErrors } = await openWithSave(c.save)
  const s = await stepUntilOffer(page)
  if (!s.declineVisible) {
    bad(`没等到《${c.expectTitle}》的请笔卡（走到 "${s.eventTitle}"，ended=${s.ended}，终局=${s.gameOverTitle}）`)
  } else {
    ok(`请笔卡出现：《${s.eventTitle}》，走了 ${s.steps} 步`)
    if (s.eventTitle.includes(c.expectTitle)) ok(`是这一轮新拿到拒绝权的那条：${c.expectTitle}`)
    else bad(`摆出来的是《${s.eventTitle}》，不是预期的《${c.expectTitle}》`)
    if (!s.ended) ok('卡片亮着的同时没有结算屏 —— 判定没有替玩家盖棺')
    else bad('卡亮着的同时已经结算了，declinable 没生效')
    ok(`【搁笔】文案读得通：「${s.declineText}」`)
    await page.screenshot({ path: `${SHOT_DIR}round20-${c.key}-offer.png` })

    console.log(`\n=== ${c.expectTitle}：点【搁笔】之后 ===`)
    if (await clickCard(page, '搁笔')) ok('点到了【搁笔】')
    else bad('【搁笔】那条点不到')
    let endedDuring = null
    let reopened = false
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(320)
      const after = await screenState(page)
      if (after.declineVisible) { reopened = true; break }
      if (after.ended) { endedDuring = after.gameOverTitle ?? after.eventTitle; break }
      await step(page)
    }
    if (reopened) bad('拒过笔之后又被请了一次笔 —— 史馆辞笔 那道闸没生效')
    else ok('拒笔之后 30 步里没有第二张请笔卡')
    if (endedDuring && SEAL_TITLES.some(t => endedDuring.includes(t))) {
      bad(`拒笔之后仍被收束型结局结案：${endedDuring}`)
    } else {
      ok(endedDuring ? `这一路走到 ${endedDuring} 收尾（降临型，不是收束）` : '这一路仍在正常游玩')
    }
    await page.screenshot({ path: `${SHOT_DIR}round20-${c.key}-after-decline.png` })
  }
  if (pageErrors.length) bad('页面报错：' + pageErrors.join(' | '))
  await page.context().close()

  // 收笔那一条：另开一局，确认"点了才盖棺"这条路还在
  const second = await openWithSave(c.save)
  const p2 = second.page
  const s2 = await stepUntilOffer(p2)
  console.log(`\n=== ${c.expectTitle}：点收笔那条，这一次才真的结算 ===`)
  if (!s2.declineVisible) bad('第二局没等到请笔卡，收笔路径没测到')
  else if (await clickCard(p2, c.sealText.replace(/[【】]/g, ''))) {
    await p2.waitForTimeout(2600)
    const after = await screenState(p2)
    if (after.ended) ok(`结算屏出现了：${after.gameOverTitle ?? '(标题未取到)'}`)
    else bad('点了收笔却没有结算 —— 结局那条 special 被弄丢了')
    await p2.screenshot({ path: `${SHOT_DIR}round20-${c.key}-after-seal.png` })
  } else bad(`卡上找不到收笔那条：${c.sealText}`)
  if (second.pageErrors.length) bad('页面报错：' + second.pageErrors.join(' | '))
  await second.page.context().close()
}

await browser.close()
console.log(failures.length ? `\n✗ ${failures.length} 处不符预期：\n  ${failures.join('\n  ')}` : '\n✓ 两条新卡都符合预期')
process.exit(failures.length ? 1 : 0)
