/**
 * 分片加载失败 → 「继续游戏」必须真的把游戏救回来。
 *
 * 为什么单独量这一条：第七十九轮把 GameScreen 改成了 `lazy()`，
 * 于是「游戏主包」成了第二块可能加载失败的分片。而 `React.lazy` 会缓存
 * **失败的那个 promise** —— 错误页上点「继续游戏」如果只清 state，
 * 重渲染会把同一个 reject 再抛回来，按钮就是死的（第七十八轮在 App 上踩过）。
 *
 * 复现方式：把 GameScreen 那个 chunk 的请求 abort 掉（模拟弱网 / 部署瞬间换 hash），
 * 走完开局流程 → 必须落到错误页；解除拦截后点「继续游戏」→ 必须真的进游戏，
 * 且全程不得留下未捕获错误（预取失败要自己咽下去，不能冒充"游戏崩了"）。
 *
 * 用法（先在仓库根目录 npm run build && npm run preview）：
 *   cd tests && node chunk-failure.mjs
 * 退出码：0 通过 / 1 重试无效 / 2 没复现到失败页（说明拦截没命中，读数无效）
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:4173/'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const blocked = []
let blockOn = true
await ctx.route('**/*', route => {
  const url = route.request().url()
  if (blockOn && /GameScreen-[\w-]+\.js/.test(url)) {
    blocked.push(url.split('/').pop())
    return route.abort('failed')
  }
  return route.continue()
})

const errors = []
page.on('pageerror', e => errors.push(e.message))

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(600)
// 先点一下标题屏，让意图预取触发（它也会被 abort）
await page.locator('.title-btn', { hasText: '开' }).first().click()
await page.waitForTimeout(400)

// 起名
const inputs = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
const n = await inputs.count()
for (let i = 0; i < n; i++) {
  await inputs.nth(i).fill(['测试', '字明', '苏州府'][i] || '测').catch(() => {})
}
await page.locator('.setup-screen .confirm-btn').first().click()
await page.waitForTimeout(500)
await page.locator('.origin-card', { hasText: '缙绅' }).first().click().catch(() => {})

// 此刻主包被拦：应落到错误页（带「继续游戏」）
await page.waitForTimeout(2500)
const sawErrorPage = await page.locator('.error-boundary').count()
console.log(`被拦下的分片：${blocked.join(', ') || '（无 —— 说明没命中拦截规则）'}`)
console.log(`开局后是否落到错误页：${sawErrorPage ? '是' : '否'}`)

if (!sawErrorPage) {
  console.log('结论：没有复现到失败页，本次验证无效')
  await browser.close()
  process.exit(2)
}

// 解除拦截，点「继续游戏」
blockOn = false
await page.locator('.error-btn.primary').click()
await page.waitForTimeout(2500)

const gameVisible = await page.locator('.game-screen').count()
const stillError = await page.locator('.error-boundary').count()
console.log(`点「继续游戏」后：游戏界面=${gameVisible ? '出现' : '没出现'}，错误页=${stillError ? '还在' : '已消失'}`)
console.log(`未捕获错误：${errors.length}${errors.length ? `（${errors[0]}）` : ''}`)

// 三条一起判：救回来了、错误页退场了、过程中没留未捕获错误
const ok = gameVisible > 0 && stillError === 0 && errors.length === 0
if (gameVisible > 0 && stillError === 0) {
  console.log('结论：重试通道有效 —— 换新 lazy 实例后真的重新发起了请求')
} else {
  console.log('结论：重试无效，仍是死按钮')
}
if (ok === false && errors.length) console.log('注意：还留下了未捕获错误，预取失败必须自己咽下去（catch）')
await browser.close()
process.exit(ok ? 0 : 1)
