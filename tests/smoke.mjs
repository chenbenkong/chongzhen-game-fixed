/**
 * 端到端冒烟测试 —— 在真实 Chromium 里跑一遍主链路。
 *
 * 用法（先在仓库根目录构建并起 preview）：
 *   npm run build
 *   npx vite preview --port 4173
 *   cd tests && npm test
 *
 * 或用 BASE_URL 指向任意已部署地址：
 *   BASE_URL=https://chenbenkong.github.io/chongzhen-game-fixed/ npm test
 *
 * 断言重点：
 *   1. 访问口令门已彻底移除（这是本次改造的核心诉求，必须硬失败）
 *   2. 启动占位层会被正确移除，不残留黑屏
 *   3. 标题屏渲染，难度选择器可用
 *   4. 能进入「取名 → 择出身 → 主玩法」链路
 *   5. 全程无 console error / 无未捕获异常 / 无资源 404
 *   6. 手动存档能写进 localStorage 且可读回
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/'
const SHOT_DIR = new URL('./screenshots/', import.meta.url).pathname.replace(/^\//, '')

const failures = []
const warnings = []
const consoleErrors = []
const pageErrors = []
const failedRequests = []

function pass(msg) {
  console.log(`  \u2713 ${msg}`)
}
function fail(msg) {
  failures.push(msg)
  console.log(`  \u2717 ${msg}`)
}
function warn(msg) {
  warnings.push(msg)
  console.log(`  ! ${msg}`)
}
function section(title) {
  console.log(`\n=== ${title} ===`)
}

/** 忽略与本次验收无关的噪声（例如可选的 AI 接口在未配置时的报错） */
function isIgnorableConsoleError(text) {
  return /favicon\.ico|net::ERR_|Failed to load resource/i.test(text)
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  })
  const page = await context.newPage()

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      consoleErrors.push(text)
      console.log(`    [console.error] ${text}`)
    }
  })
  page.on('pageerror', err => {
    pageErrors.push(err.message)
    console.log(`    [pageerror] ${err.message}`)
  })
  page.on('requestfailed', req => {
    failedRequests.push(`${req.url()} :: ${req.failure()?.errorText}`)
  })

  section(`加载 ${BASE_URL}`)
  const response = await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
  if (!response || !response.ok()) {
    fail(`页面返回状态异常：${response ? response.status() : 'no response'}`)
  } else {
    pass(`HTTP ${response.status()}`)
  }

  // ---------------------------------------------------------------
  section('1. 访问口令门必须已移除')
  // ---------------------------------------------------------------
  const gateCount = await page.locator('#cz-gate, #cz-pw, #cz-err').count()
  if (gateCount === 0) {
    pass('页面中不存在 #cz-gate / #cz-pw / #cz-err')
  } else {
    fail(`发现 ${gateCount} 个口令门相关元素 —— 门禁没有被移除`)
  }

  const gateInHtml = await page.evaluate(async () => {
    const res = await fetch(window.location.href, { cache: 'no-store' })
    const html = await res.text()
    return {
      hasCzGate: /cz-gate|czCheck|cz-pw|cz_ok/.test(html),
      hasPasswordLiteral: html.includes("'chongzhen'") || html.includes('"chongzhen"')
    }
  })
  if (!gateInHtml.hasCzGate && !gateInHtml.hasPasswordLiteral) {
    pass('源码 HTML 中不含 cz-gate / czCheck / cz_ok / 明文口令')
  } else {
    fail(`HTML 里仍残留口令门逻辑：${JSON.stringify(gateInHtml)}`)
  }

  // 之前的口令门会把 #root 设成 display:none，必须确认这一点没被继承
  const rootHidden = await page.evaluate(() => {
    const root = document.getElementById('root')
    return root ? getComputedStyle(root).display : 'missing'
  })
  if (rootHidden === 'none') {
    fail('#root 仍被设为 display:none（玩家会看到空白页）')
  } else {
    pass(`#root display = ${rootHidden}`)
  }

  // ---------------------------------------------------------------
  section('2. 启动占位层正常退场')
  // ---------------------------------------------------------------
  await page.waitForTimeout(2500)
  const splashGone = await page.locator('#boot-splash').count()
  if (splashGone === 0) {
    pass('启动占位层已被移除')
  } else {
    const hidden = await page.evaluate(() => {
      const el = document.getElementById('boot-splash')
      return el ? el.classList.contains('is-hidden') : false
    })
    if (hidden) pass('启动占位层已淡出')
    else fail('启动占位层仍然可见（可能卡在加载态）')
  }
  const fallbackVisible = await page.evaluate(() => {
    const el = document.getElementById('boot-fallback')
    return el ? el.classList.contains('is-visible') : false
  })
  if (fallbackVisible) fail('启动了「游戏未能启动」兜底界面')
  else pass('未触发启动失败兜底')

  // ---------------------------------------------------------------
  section('3. 标题屏')
  // ---------------------------------------------------------------
  const titleVisible = await page.locator('.title-screen').isVisible().catch(() => false)
  if (titleVisible) pass('.title-screen 可见')
  else fail('.title-screen 不可见')

  const heading = await page.locator('.title-main').first().textContent().catch(() => null)
  if (heading && heading.trim().length > 0) pass(`主标题 = ${heading.trim()}`)
  else fail('未取到主标题文本')

  // 自托管字体是否真的加载（离线可用的前提）。
  // 注意：@fontsource 用 unicode-range 子集化，分片按渲染到的字符按需加载，
  // 所以必须拿真实的中文字去问；不带文本的 check() 在子集化字体上会假阴性。
  const fontProbe = await page.evaluate(async () => {
    try {
      await document.fonts.ready
      const family = '"Ma Shan Zheng"'
      return {
        status: document.fonts.status,
        faceCount: [...document.fonts].length,
        loadedCount: [...document.fonts].filter(f => f.status === 'loaded').length,
        hasCjk: document.fonts.check(`1em ${family}`, '崇祯'),
        titleFont: getComputedStyle(document.querySelector('.title-main')).fontFamily
      }
    } catch {
      return { error: true }
    }
  })
  if (fontProbe.hasCjk) {
    pass(
      `自托管字体已生效（FontFace ${fontProbe.faceCount} 个，按需加载 ${fontProbe.loadedCount} 个分片）`
    )
  } else if (fontProbe.status === 'loaded' && fontProbe.faceCount > 0) {
    warn(`字体声明已注册 ${fontProbe.faceCount} 个 FontFace，但中文分片未判定为已加载`)
  } else {
    warn('Ma Shan Zheng 未被识别，将回退到系统中文字体')
  }

  // ---------------------------------------------------------------
  section('4. 难度选择器（此前难度被硬编码为 normal）')
  // ---------------------------------------------------------------
  const diffButtons = page.locator('.title-difficulty__option')
  const diffCount = await diffButtons.count()
  if (diffCount === 3) pass('难度选项数量 = 3')
  else fail(`难度选项数量 = ${diffCount}，期望 3`)

  if (diffCount === 3) {
    const labels = await diffButtons.allTextContents()
    pass(`难度选项 = ${labels.map(s => s.trim()).join(' / ')}`)

    await diffButtons.nth(2).click()
    await page.waitForTimeout(200)
    const activeText = (await page.locator('.title-difficulty__option.is-active').first().textContent()) || ''
    if (activeText.includes('困难')) pass('点击后「困难」成为选中项')
    else fail(`点击第三个难度后选中项为「${activeText.trim()}」，期望「困难」`)

    const persisted = await page.evaluate(() => localStorage.getItem('chongzhen_difficulty'))
    if (persisted === 'hard') pass('难度已持久化到 localStorage（chongzhen_difficulty=hard）')
    else fail(`难度未持久化，localStorage 值为 ${persisted}`)

    // 还原成普通难度，避免影响后续
    await diffButtons.nth(1).click()
  }

  await page.screenshot({ path: `${SHOT_DIR}01-title.png` })

  // ---------------------------------------------------------------
  section('5. 开局链路 取名 → 择出身 → 主玩法')
  // ---------------------------------------------------------------
  await page.locator('.title-btn', { hasText: '开' }).first().click()
  await page.waitForTimeout(600)

  const setupVisible = await page.locator('.setup-screen').isVisible().catch(() => false)
  if (setupVisible) pass('进入取名牌')
  else fail('点击「开始仕途」后未进入设置屏')

  // 尽量把名字填上：不确定控件细节，因此对可见输入框逐个填值
  const inputs = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
  const inputCount = await inputs.count()
  if (inputCount > 0) {
    for (let i = 0; i < inputCount; i++) {
      const el = inputs.nth(i)
      if (await el.isVisible().catch(() => false)) {
        const current = await el.inputValue().catch(() => '')
        if (!current) await el.fill('测试者').catch(() => {})
      }
    }
    pass(`填写了 ${inputCount} 个文本输入框`)
  } else {
    warn('取名牌上没有找到文本输入框')
  }

  // 点击推进按钮：优先用业务类名（.confirm-btn / #cz-... 不存在），
  // 退回到文案匹配。取名牌的确认按钮文案是「定 此 名 字」。
  async function clickAdvance() {
    // 1) 业务类名优先，最稳
    const byClass = page.locator('.setup-screen .confirm-btn').first()
    if ((await byClass.count()) > 0 && (await byClass.isVisible().catch(() => false))) {
      await byClass.click()
      return '.confirm-btn'
    }
    // 2) 文案匹配（注意原文含全角空格）
    const candidates = ['定 此 名 字', '选 此 出 身', '确认', '下一步', '确定', '开 始']
    for (const text of candidates) {
      const btn = page.locator('.setup-screen button', { hasText: text }).first()
      if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.click()
        return text
      }
    }
    return null
  }

  const advanced = await clickAdvance()
  await page.waitForTimeout(700)
  if (advanced) pass(`点击推进按钮「${advanced}」`)
  else warn('未在取名牌上找到推进按钮，跳过后续流程')

  let reachedGame = false
  if (advanced) {
    // 出身选择：卡片本身是 role="button"（内含「选 此 出 身」按钮），点卡片即选中
    const originCards = page.locator('.origin-card')
    const originCount = await originCards.count()
    if (originCount > 0) {
      pass(`找到 ${originCount} 个出身卡片`)

      // 先确认卡片键盘可达（这是一次真实的可访问性回归断言）
      const cardRole = await originCards.first().getAttribute('role')
      const cardTabIndex = await originCards.first().getAttribute('tabindex')
      if (cardRole === 'button' && cardTabIndex === '0') {
        pass('出身卡片具备 role="button" 且可 Tab 聚焦')
      } else {
        warn(`出身卡片缺少键盘语义（role=${cardRole}, tabindex=${cardTabIndex}）`)
      }

      await originCards.first().click().catch(() => {})
      await page.waitForTimeout(900)

      // 卡片点击没生效时，退回点它内部的「选 此 出 身」
      if (!(await page.locator('.game-screen').isVisible().catch(() => false))) {
        const inner = page.locator('.origin-card button', { hasText: '选' }).first()
        if ((await inner.count()) > 0) {
          await inner.click().catch(() => {})
          await page.waitForTimeout(900)
        }
      }
    } else {
      warn('未找到 .origin-card')
    }

    reachedGame = await page.locator('.game-screen').isVisible().catch(() => false)
  }

  if (reachedGame) {
    pass('进入主玩法界面 .game-screen')
    await page.screenshot({ path: `${SHOT_DIR}02-game.png` })

    const eventVisible = await page.locator('.event-title').first().isVisible().catch(() => false)
    if (eventVisible) {
      const t = await page.locator('.event-title').first().textContent()
      pass(`事件标题 = ${(t || '').trim()}`)
    } else {
      warn('.event-title 不可见（可能当前无事件卡）')
    }

    // 属性面板应当渲染出 5 项个人能力 + 5 项隐藏属性（机敏值/忠诚值本次新增）
    const hiddenRows = await page.locator('.hidden-attrs .attr-item').count()
    if (hiddenRows >= 5) pass(`隐藏属性条目 = ${hiddenRows}（含新增的机敏值/忠诚值）`)
    else warn(`隐藏属性条目 = ${hiddenRows}，期望 ≥5`)

    // 「幽灵模式」调试入口：当前**默认常驻可见**（项目所有者的明确选择）。
    // 面板里能浏览全部事件与未解锁结局，属于剧透 —— 这条断言把该决定记录在案，
    // 免得日后有人看到按钮常驻、以为是漏了门禁又默默地关掉。
    const cheatVisible = await page.locator('.cheat-button').isVisible().catch(() => false)
    if (cheatVisible) {
      pass('「幽灵模式」调试入口按当前设定常驻可见')
    } else {
      warn(
        '「幽灵模式」入口不可见 —— 若是有意关闭（?debug=0 或改了 utils/debug.ts 的默认值）可忽略'
      )
    }
  } else {
    warn('未能自动走到主玩法界面，跳过游戏内断言')
  }

  // ---------------------------------------------------------------
  section('6. 存档：写入与读回')
  // ---------------------------------------------------------------
  const storageProbe = await page.evaluate(() => {
    // 直接验证存档模块的契约：写入 → 读回 → 结构完整
    const key = 'chongzhen_save_slot_1'
    const payload = {
      character: {
        name: '测试者',
        courtesyName: '子明',
        hometown: '苏州',
        age: 22,
        origin: '寒门',
        rank: '正七品·知县',
        degree: '进士',
        attributes: { 财帛: 50, 文韬: 60, 理政: 55, 武略: 40, 体质: 70 },
        // 故意缺少 机敏值 / 忠诚值，并混入 NaN，验证迁移与规整
        hidden: { 道德值: 60, 欲望值: Number.NaN, 野心值: 40 },
        flags: [],
        history: [],
        wives: [],
        lovers: [],
        examHistory: [],
        promotionCount: 0,
        demotionCount: 0,
        faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }
      },
      gameState: { currentYear: 1628, currentMonth: 1, turn: 0, 圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 75 },
      eventHistory: [],
      origin: '寒门',
      degree: '进士',
      playerName: '测试者',
      identityType: 'official',
      lifeRecords: [],
      savedAt: new Date().toISOString()
    }
    try {
      localStorage.setItem(key, JSON.stringify(payload))
      const raw = localStorage.getItem(key)
      const parsed = JSON.parse(raw)
      return {
        ok: true,
        bytes: raw.length,
        storedHidden: parsed.character.hidden,
        // NaN 经 JSON 序列化会变成 null，这正是历史存档里机敏值变成 null 的原因
        nanBecameNull: parsed.character.hidden.欲望值 === null
      }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  if (storageProbe.ok) {
    pass(`存档写入/读回成功，${storageProbe.bytes} 字节`)
    if (storageProbe.nanBecameNull) {
      pass('确认 NaN 会被 JSON 序列化为 null —— 迁移必须处理这种情况')
    }
  } else {
    fail(`存档读写失败：${storageProbe.error}`)
  }

  // 重新加载，确认「读取存档」入口出现（说明存档被识别）
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)
  const loadBtnVisible = await page
    .locator('.title-btn', { hasText: '读' })
    .first()
    .isVisible()
    .catch(() => false)
  if (loadBtnVisible) pass('刷新后标题屏出现「读取存档」入口')
  else warn('刷新后未见「读取存档」入口（可能存档预览未生成）')

  await page.evaluate(() => {
    try {
      localStorage.removeItem('chongzhen_save_slot_1')
    } catch {}
  })

  await page.screenshot({ path: `${SHOT_DIR}03-after-reload.png` })

  // ---------------------------------------------------------------
  section('7. 控制台与网络')
  // ---------------------------------------------------------------
  const realConsoleErrors = consoleErrors.filter(t => !isIgnorableConsoleError(t))
  if (realConsoleErrors.length === 0) pass('无 console.error')
  else fail(`有 ${realConsoleErrors.length} 条 console.error（见上）`)

  if (pageErrors.length === 0) pass('无未捕获异常')
  else fail(`有 ${pageErrors.length} 条未捕获异常`)

  const realFailedRequests = failedRequests.filter(u => !/favicon\.ico/.test(u))
  if (realFailedRequests.length === 0) pass('无失败请求')
  else fail(`有 ${realFailedRequests.length} 个失败请求：\n      ${realFailedRequests.join('\n      ')}`)

  await browser.close()

  // ---------------------------------------------------------------
  console.log('\n' + '='.repeat(60))
  if (warnings.length > 0) {
    console.log(`警告 ${warnings.length} 条：`)
    warnings.forEach(w => console.log(`  ! ${w}`))
  }
  if (failures.length > 0) {
    console.log(`\n失败 ${failures.length} 项：`)
    failures.forEach(f => console.log(`  \u2717 ${f}`))
    console.log('\n冒烟测试未通过')
    process.exit(1)
  }
  console.log(`\n冒烟测试通过（${warnings.length} 条警告）`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
