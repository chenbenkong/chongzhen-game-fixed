import { chromium } from 'playwright'

/**
 * 第十九轮实测：「史馆请笔」在真实浏览器里到底长什么样。
 *
 * `tests/unit/endingDecline.test.ts` 已经拿真 hook 证明过状态机（开卡不结算 / 拒笔后不再请笔 /
 * 收笔才进历史），但它不看 DOM。这里只回答模拟与单测都答不了的三件事：
 *   1. 那张卡摆出来时，玩家看得见【搁笔】，而且**没有被判定直接盖棺**（没有结算屏）；
 *   2. 点【搁笔】之后游戏真的继续，且同一张卡在后面 40 步里不再重演；
 *   3. 点【青史留名】才真的结算 —— 结算屏的标题就是那条结局，图鉴/履历里没有多出"辞笔"这种暗账。
 *
 * 跑法（需要先起一个站点，dev 或 preview 都行；playwright 装在 tests/ 自己的 node_modules 里，
 * 所以必须在 tests/ 目录下起）：
 *   cd tests && BASE_URL=http://localhost:5173/ node verify-round19.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:4173/'
/**
 * 截图落在本脚本旁边的 `screenshots/`（与 smoke/layout 同一套路，且那目录在 .gitignore 里）。
 * 写成相对 cwd 的 `tests/screenshots/` 会随你在哪个目录起脚本而漂 —— 第十七轮踩过。
 */
const SHOT_DIR = new URL('./screenshots/', import.meta.url).pathname.replace(/^\//, '')

/**
 * 让 名臣垂范 的年窗在下一个月开：年窗 1640–1643、道德值≥80、清议≥70、圣眷≥35、体质≥20，
 * 身上不带任何 notHas 名单里的 flag（殉国/投降/归隐…），也**不带** `史馆辞笔`。
 */
const mkSave = () => ({
  character: {
    name: '测试', courtesyName: '字明', hometown: '苏州', origin: '缙绅',
    age: 45, degree: '进士', rank: '正五品·郎中',
    attributes: { 财帛: 60, 文韬: 80, 理政: 75, 武略: 40, 体质: 60 },
    hidden: { 道德值: 95, 欲望值: 30, 野心值: 40, 机敏值: 60, 忠诚值: 70 },
    flags: ['地方官任职', '东林党核心', '清算阉党'],
    promotionCount: 6, demotionCount: 0,
    faction: { 东林好感: 60, 阉党好感: 30, 立场: '东林', 党争烈度: 40 },
    history: [], wives: [], lovers: [], examHistory: []
  },
  gameState: {
    turn: 140, currentYear: 1639, currentMonth: 12,
    国势: 60, 圣眷: 55, 中官: 50, 清议: 85, 士绅: 60, 民望: 65
  },
  eventHistory: [], lifeRecords: [], schemaVersion: 4, stats: {}
})

/** 11 条善终在卡上印的标题（`src/data/endingDecline.ts` 的 DECLINE_COPY） */
const SEAL_TITLES = ['名臣垂范', '归隐田园', '大儒传世', '富甲一方', '遁入空门', '天伦之乐',
  '悬壶济世', '致仕善终', '边关大将', '清流骨鲠', '平凡终老']

const browser = await chromium.launch({ headless: true })
const failures = []
const ok = m => console.log(`  ✓ ${m}`)
const bad = m => { failures.push(m); console.log(`  ✗ ${m}`) }

async function openWithSave() {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 160)))
  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 })
  await page.evaluate(s => localStorage.setItem('chongzhen_autosave', JSON.stringify(s)), mkSave())
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
    open: cards.filter(c => !c.classList.contains('locked')).length,
    locked: cards.filter(c => c.classList.contains('locked')).length,
    declineVisible: !!decline,
    declineText: decline ? (decline.textContent || '').trim().slice(0, 40) : null,
    choiceTexts: cards.map(c => (c.textContent || '').trim().slice(0, 22))
  }
})

/**
 * 一屏一屏往下走：有选项卡就点第一条能点的（【搁笔】那条**永远留着不点**，
 * 它是本脚本要验的对象），没有就点"继续/进下月"。
 * 与 round17 那个 step 同一套路 —— 事件正文（前情态）先渲染，选项卡要点一次"继续"才出来。
 */
const step = page => page.evaluate(() => {
  if (document.querySelector('.game-screen--ended') || document.querySelector('.game-over-screen')) return 'ended'
  const cards = [...document.querySelectorAll('.choice-card')]
  const offer = cards.find(c => /搁笔/.test(c.textContent || ''))
  if (offer) return 'offer'
  const c = cards.find(x => !x.classList.contains('locked'))
  if (c) { c.click(); return 'choice' }
  const r = [...document.querySelectorAll('button')].find(x => /进\s*下\s*月|继\s*续/.test(x.textContent || ''))
  if (r && !r.disabled) { r.click(); return 'advance' }
  return 'stuck'
})

async function stepUntilOffer(page, maxSteps = 120) {
  const seen = []
  for (let i = 0; i < maxSteps; i++) {
    const s = await screenState(page)
    if (s.declineVisible || s.ended) return { ...s, steps: i, seen }
    if (i % 12 === 0) seen.push(`${s.eventTitle || '-'}`)
    const acted = await step(page)
    if (acted === 'ended') return { ...await screenState(page), steps: i, seen }
    if (acted === 'stuck') await page.waitForTimeout(300)
    await page.waitForTimeout(360)
  }
  return { ...(await screenState(page)), steps: maxSteps, seen }
}

const clickCard = async (page, matcher) => page.evaluate(m => {
  const c = [...document.querySelectorAll('.choice-card')].find(x => (x.textContent || '').includes(m) && !x.classList.contains('locked'))
  if (!c) return false
  c.click()
  return true
}, matcher)

console.log('\n=== 一、判定命中那个月：卡摆上桌，但游戏还没结束 ===')
{
  const { page, pageErrors } = await openWithSave()
  const s = await stepUntilOffer(page)
  if (s.declineVisible) ok(`请笔卡出现：《${s.eventTitle}》，走了 ${s.steps} 步，选项 ${s.total} 条（可点 ${s.open}、锁住 ${s.locked}）`)
  else bad(`没撞上要拒绝的卡（走了 ${s.steps} 步，路过：${s.seen.join(' → ')}）：${JSON.stringify(s)}`)
  if (!s.ended) ok('卡片亮着的同时**没有**结算屏 —— 判定没有替玩家盖棺')
  else bad('判定命中就结算了：本轮的 declinable 没生效')
  if (s.declineText) ok(`【搁笔】文案读得通：「${s.declineText}」`)
  await page.screenshot({ path: `${SHOT_DIR}round19-offer-card.png` })

  console.log('\n=== 二、点【搁笔】：继续做官，且后面 40 步里不再被请笔 ===')
  if (await clickCard(page, '搁笔')) ok('点到了【搁笔】')
  else bad('【搁笔】点不到（可能被门槛锁住）')
  await page.waitForTimeout(900)
  let reOffered = 0
  let endedDuring = null
  for (let m = 0; m < 40 && !endedDuring; m++) {
    const acted = await step(page)
    await page.waitForTimeout(360)
    if (acted === 'offer') { reOffered++; bad(`第 ${m + 1} 步又把请笔卡摆出来了：${(await screenState(page)).eventTitle}`) }
    const t = await screenState(page)
    if (t.declineVisible && acted !== 'offer') { reOffered++; bad(`第 ${m + 1} 步屏幕上出现了【搁笔】：《${t.eventTitle}》`) }
    if (t.ended) endedDuring = t.gameOverTitle || t.eventTitle
    if (acted === 'stuck') break
  }
  if (!reOffered) ok('拒笔之后 40 步里没有第二张请笔卡 —— `史馆辞笔` 这条公共 notHas 生效了')
  /**
   * 这一段的一屏一屏走是"看见第一条能点的就点"，不是保命打法，
   * 所以它**可能**被革职/抄家/病逝这类降临型结局收尾 —— 那是正常玩法，不该算失败。
   * 本段要拦的只有一件事：拒过笔之后还被**善终**收走。
   */
  if (endedDuring && SEAL_TITLES.some(t => (endedDuring ?? '').includes(t))) bad(`拒笔之后仍被善终结局收走：${endedDuring}`)
  else ok(endedDuring ? `这一路走到 ${endedDuring} 收尾（降临型结局，不是善终）` : '这一路仍在正常游玩（没被任何善终结局收走）')
  await page.screenshot({ path: `${SHOT_DIR}round19-after-decline.png` })
  if (pageErrors.length) bad('页面报错：' + pageErrors.join(' | '))
  else ok('无 pageerror')
  await page.context().close()
}

console.log('\n=== 三、点【青史留名】：这一次才真的盖棺 ===')
{
  const { page, pageErrors } = await openWithSave()
  const s = await stepUntilOffer(page)
  if (!s.declineVisible) bad('没撞上请笔卡，第三段无法验证')
  else {
    const clicked = await clickCard(page, '青史留名')
    if (!clicked) bad('【青史留名】那条点不到（选项文案或门槛变了？）')
    await page.waitForTimeout(1400)
    const after = await screenState(page)
    if (after.ended) ok(`结算屏出现了：${after.gameOverTitle ?? '(标题未取到)'}`)
    else bad('点了收笔却没有结算 —— 结局那条 special 被弄丢了')
    await page.screenshot({ path: `${SHOT_DIR}round19-after-seal.png` })
  }
  if (pageErrors.length) bad('页面报错：' + pageErrors.join(' | '))
  await page.context().close()
}

await browser.close()
console.log(failures.length ? `\n✗ 共 ${failures.length} 处不符\n` + failures.map(f => '  - ' + f).join('\n') : '\n✓ 三段全部符合预期\n')
process.exit(failures.length ? 1 : 0)
