import { chromium } from 'playwright'

/**
 * 第十七轮实测：第二波回响在真实浏览器里到底长什么样。
 *
 * 模拟（vitest + simulate.ts）已经证明这五条会播出来，但模拟不看 DOM。
 * 这里只回答模拟答不了的三件事：
 *   1. 新事件的四个选项渲染得对不对，被门槛锁住的那几个有没有把理由说给人听；
 *   2. 选下去之后结算文案是否落地（tag 与 effects 一致已由 audit 钉死，这里看的是显示）；
 *   3. 本轮新增的 20 条履历文案在「这一生」里是否真露出来，机器 id 是否仍然不外泄。
 */
const BASE = process.env.BASE_URL || 'http://localhost:4173/'

const AFTERMATH_TITLES = ['不系之名', '学田的碑', '门内门外', '李家的旧账', '扇价']

/** 本轮新写的履历（flag → 应当出现的句子） */
const NEW_MEMOIRS = [
  ['侠女之盟', '城南两间房安下她，不曾令她入门'],
  ['如烟已嫁', '三十两算作嫁妆，送她体面出门'],
  ['pending_zhanggui', '首辅赐婚，你推说禀明家母、三日奉复'],
  ['lishi_tension', '当面回了岳父的请托，李家生了隙'],
  ['游历天下', '抛下官身，随霞客走了十年山水'],
  ['不论旧朝', '史馆征旧事，称病不预，一概不答']
]

const mkSave = (flags, attrs) => ({
  character: {
    name: '测试', courtesyName: '字明', hometown: '苏州', origin: '寒门',
    age: 40, degree: '进士', rank: '正五品·郎中',
    attributes: attrs ?? { 财帛: 80, 文韬: 80, 理政: 80, 武略: 70, 体质: 80 },
    hidden: { 道德值: 60, 欲望值: 40, 野心值: 50, 机敏值: 60, 忠诚值: 60 },
    flags,
    promotionCount: 5, demotionCount: 0,
    faction: { 东林好感: 55, 阉党好感: 45, 立场: '东林', 党争烈度: 40 },
    history: [], wives: [], lovers: [], examHistory: []
  },
  gameState: {
    turn: 77, currentYear: 1634, currentMonth: 6,
    国势: 60, 圣眷: 55, 中官: 45, 清议: 55, 士绅: 55, 民望: 55
  },
  eventHistory: [], lifeRecords: [], schemaVersion: 4, stats: {}
})

const browser = await chromium.launch({ headless: true })
const failures = []
const ok = m => console.log(`  ✓ ${m}`)
const bad = m => { failures.push(m); console.log(`  ✗ ${m}`) }

async function openWithSave(flags, attrs) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 160)))
  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 })
  await page.evaluate(s => localStorage.setItem('chongzhen_autosave', JSON.stringify(s)), mkSave(flags, attrs))
  await page.reload({ waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(2200)
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /继\s*续|读\s*取\s*存\s*档/.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  await page.waitForTimeout(1800)
  return { page, pageErrors, clicked }
}

const title = page => page.evaluate(() => document.querySelector('.event-title')?.textContent?.trim() ?? '')

/** 五条新回响各自的开门经历，一次注入全套：这样一局里就有机会撞见不止一条 */
const SEEDS = [
  'lixiangjun_disappointed', '半门之客', '乡里护产', 'wife_broken', '恩义付之',
  '不系一党', '让善于乡', 'concubine_killed', '三日之信', 'lixiangjun_poem'
]

/** 只点"没被锁住"的选项；没有事件就进下月 */
const step = page => page.evaluate(() => {
  if (document.querySelector('.game-screen--ended')) return 'ended'
  const c = document.querySelector('.choice-card:not(.locked)')
  if (c) { c.click(); return 'choice' }
  const r = [...document.querySelectorAll('button')].find(x => /进\s*下\s*月|继\s*续/.test(x.textContent || ''))
  if (r && !r.disabled) { r.click(); return 'advance' }
  return 'stuck'
})

/**
 * 读这一屏的选项卡。
 *
 * 第一版直接在这儿读，结果把《学田的碑》报成"一个可点的选项都没有 —— 软锁死"：
 * 事件正文（前情态）先渲染，选项卡要玩家点一下"继续"才出现，抓早了就是 0 张卡。
 * 所以这里等到看见卡片为止；期间标题变了（说明已经翻篇）就判"这次没撞上"，
 * 而不是硬说它锁死 —— 假阳性的检查比没有检查更坏。
 */
async function inspectEvent(page, t) {
  for (let round = 0; round < 6; round++) {
    const info = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.choice-card')]
      return {
        total: cards.length,
        locked: cards.filter(c => c.classList.contains('locked')).map(c => ({
          text: (c.textContent || '').slice(0, 26),
          aria: c.getAttribute('aria-disabled'),
          reason: document.getElementById(c.getAttribute('aria-describedby') || '')?.textContent?.trim().slice(0, 60) ?? null
        })),
        open: cards.filter(c => !c.classList.contains('locked')).length
      }
    })
    if (info.total) return info
    const r = await step(page)
    if (r === 'ended' || r === 'stuck') return null
    if ((await title(page)) !== t) return null
    await page.waitForTimeout(160)
  }
  return null
}

// ---------- 1) 第二波回响是否真播出来，锁住的选项是否说得出理由 ----------
console.log('\n=== 一、五条新回响的渲染（带着它们的开门经历，从崇祯七年六月推进）===')
{
  const seen = new Map()
  const allErrors = []
  // 一局里死一次就换一局接着撞：随机池 + 死法太多，单局 240 步根本扫不完五条回响
  for (let attempt = 1; attempt <= 6 && seen.size < AFTERMATH_TITLES.length; attempt++) {
    const { page, pageErrors, clicked } = await openWithSave(SEEDS)
    if (!clicked) bad('没找到"继续上次游戏"入口，注入的存档没被认')
    console.log(`\n—— 第 ${attempt} 局开局（此前已撞上 ${seen.size}/${AFTERMATH_TITLES.length}）`)
    let why = '跑满步数'
    for (let i = 0; i < 200 && seen.size < AFTERMATH_TITLES.length; i++) {
      const t = await title(page)
      if (AFTERMATH_TITLES.includes(t) && !seen.has(t)) {
        const info = await inspectEvent(page, t)
        if (!info) { why = '读到前情态就翻篇了'; continue }
        seen.set(t, info)
        console.log(`\n《${t}》撞上：选项 ${info.total} 个，可点 ${info.open} 个，锁住 ${info.locked.length} 个`)
        for (const l of info.locked) {
          console.log(`   🔒 ${l.text}｜aria-disabled=${l.aria}｜理由：${l.reason ?? '（空）'}`)
          if (l.aria !== 'true') bad(`《${t}》锁住的选项没标 aria-disabled`)
          if (!l.reason) bad(`《${t}》锁住的选项说不出理由：${l.text}`)
          else if (/[A-Za-z_]{4,}/.test(l.reason)) bad(`《${t}》的理由把机器 id 印给了玩家：${l.reason}`)
        }
        if (info.open < 1) bad(`《${t}》一个可点的选项都没有 —— 软锁死`)
      }
      const r = await step(page)
      if (r === 'ended') { why = '这一局结束了'; break }
      if (r === 'stuck') { why = '卡住不动了'; break }
      await page.waitForTimeout(60)
    }
    allErrors.push(...pageErrors)
    console.log(`  本局收场：${why}`)
    await page.context().close()
  }
  const missed = AFTERMATH_TITLES.filter(t => !seen.has(t))
  console.log(`\n合计撞上 ${seen.size}/${AFTERMATH_TITLES.length} 条${missed.length ? `｜没撞上：${missed.join('、')}` : ''}`)
  // 五条全撞是"模拟"那边钉的（warden 100 局每条 ≥3 次播出）；浏览器一局走多远是随机的，
  // 这里只要求"第二波回响在界面上确实看得见"，撞不满五条算正常。
  if (seen.size < 3) bad(`6 局只撞上 ${seen.size} 条，界面上的第二波回响基本看不见`)
  if (allErrors.length) bad(`页面未捕获异常：${allErrors.slice(0, 3).join(' | ')}`)
}

// ---------- 2) 选下去之后：结算文案落地 ----------
console.log('\n=== 二、选一个开着的选项，看结算是否落地 ===')
{
  const clickedThrough = new Set()
  for (let attempt = 1; attempt <= 5 && clickedThrough.size < 2; attempt++) {
    const { page } = await openWithSave(SEEDS)
    for (let i = 0; i < 200 && clickedThrough.size < 2; i++) {
      const t = await title(page)
      if (AFTERMATH_TITLES.includes(t) && !clickedThrough.has(t)) {
        const info = await inspectEvent(page, t)
        if (!info) continue
        const r = await step(page)
        await page.waitForTimeout(900)
        // 结算的真实DOM：`.settlement-title` 是选项自己写的 result.title，
        // `.effect-tag` 是它承诺过的那些增减（第一版拿 `h2` 去抓，抓到的是侧栏的「个人能力」）
        const after = await page.evaluate(() => ({
          picked: document.querySelector('.selected-choice-title')?.textContent?.trim() ?? '',
          title: document.querySelector('.settlement-title')?.textContent?.trim() ?? '',
          tags: [...document.querySelectorAll('.effect-tag')].map(x => x.textContent?.trim())
        }))
        console.log(`《${t}》${info.open} 个可点 → ${r}｜结算「${after.title}」${after.tags.slice(0, 4).join(' ')}`)
        if (r !== 'choice') bad(`《${t}》明明有 ${info.open} 个可点选项，却点不动（这一步做的是 ${r}）`)
        else if (!after.title) bad(`《${t}》点下去没有结算标题：${after.picked.slice(0, 24)}`)
        else if (!after.tags.length) bad(`《${t}》结算只有标题、没有增减：「${after.title}」`)
        else clickedThrough.add(t)
        continue
      }
      const r = await step(page)
      if (r === 'stuck' || r === 'ended') break
      await page.waitForTimeout(60)
    }
    await page.context().close()
  }
  if (clickedThrough.size < 2) {
    bad(`5 局里只点完 ${clickedThrough.size} 条第二波回响的结算 —— "选得下去、看得到结果"没验证到`)
  } else console.log(`  点完并落地结算：${[...clickedThrough].join('、')}`)
}

// ---------- 3) 本轮新增履历在「这一生」里的呈现 ----------
console.log('\n=== 三、新履历文案上界面，机器 id 不外泄 ===')
{
  const flags = ['归零警告·财帛', ...NEW_MEMOIRS.map(([f]) => f)]
  // 死法是按数据层的规矩挑的：带着警告却又一文不名，推进一个月就该身故
  const starving = { 财帛: 0, 文韬: 80, 理政: 80, 武略: 70, 体质: 80 }
  let page = null
  let died = false
  for (let attempt = 1; attempt <= 4 && !died; attempt++) {
    const opened = await openWithSave(flags, starving)
    page = opened.page
    for (let i = 0; i < 10; i++) {
      const over = await page.evaluate(() =>
        !!document.querySelector('.game-screen--ended') ||
        [...document.querySelectorAll('button')].some(x => /查看生平/.test(x.textContent || '')))
      if (over) { died = true; break }
      await step(page)
      await page.waitForTimeout(400)
    }
    console.log(`  第 ${attempt} 局${died ? '按预期身故（财帛归零）' : '没死成，换一局再试'}`)
    if (!died) await page.context().close()
  }
  if (!died) bad('注入"归零警告·财帛"+ 财帛=0 之后仍然死不掉，第三条检查作废')
  else {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /查看生平/.test(x.textContent || ''))
      if (b) { b.click(); return true }
      return false
    })
    await page.waitForTimeout(900)
    if (!clicked) bad('没能进入「查看生平」，第三条检查作废')
    else {
      let tabbed = false
      for (let i = 0; i < 10 && !tabbed; i++) {
        tabbed = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '这一生')
          if (b) { b.click(); return true }
          return false
        })
        if (!tabbed) await page.waitForTimeout(500)
      }
      console.log(`  切到「这一生」：${tabbed ? '成功' : '失败'}`)
      if (!tabbed) bad('这一页没有「这一生」，履历没处看')
      else {
        await page.waitForTimeout(400)
        const text = await page.evaluate(() => document.body.innerText)
        const items = await page.evaluate(() => document.querySelectorAll('.memoirs-item').length)
        console.log(`  列表条目 ${items} 条（注入了 ${NEW_MEMOIRS.length} 条新履历）`)
        if (items < NEW_MEMOIRS.length) bad(`注入 ${NEW_MEMOIRS.length} 条新履历，界面只列出 ${items} 条`)
        for (const [flag, line] of NEW_MEMOIRS) {
          if (!text.includes(line)) bad(`新履历没显示：${flag} →「${line}」`)
          // 只有"纯机器 id"才谈得上外泄；中文 flag 名本来就长得像正文，不算
          if (/^[a-z0-9_]+$/.test(flag) && text.includes(flag)) bad(`机器 id 漏到界面上：${flag}`)
        }
        const count = await page.evaluate(() => document.querySelector('.memoirs-lede-count')?.textContent?.trim() ?? '')
        console.log(`  「拣出可记者」计数：${count}`)
        const groups = await page.evaluate(() =>
          [...document.querySelectorAll('.memoirs-group-title')].map(x => x.textContent?.trim()))
        console.log(`  出现的分组：${groups.join(' / ')}`)
      }
    }
  }
  await page.context().close()
}

await browser.close()
console.log(failures.length ? `\n❌ ${failures.length} 项不合格：\n - ${failures.join('\n - ')}` : '\n✅ 全部合格')
process.exit(failures.length ? 1 : 0)
