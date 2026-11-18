/**
 * 首屏性能闸门 —— 用真实浏览器量「玩家还没开始玩」之前，页面到底下载了什么。
 *
 * 为什么需要这把尺子：
 *   标题屏（title）只需要 React + 标题组件 + 一点点存档读取代码。
 *   在此之前，它还会把全部事件数据、结局数据、战斗组件一起拉下来 ——
 *   玩家只是打开首页看一眼，就先付了整局游戏的带宽。
 *   这类回归**类型检查和单测都看不见**（它们不跑打包产物），只有真浏览器能量到。
 *
 * 用法（先在仓库根目录 npm run build）：
 *   cd tests && node perf-budget.mjs
 *   可选：node perf-budget.mjs --dist=../dist --json
 *   可选：node perf-budget.mjs --base=https://chenbenkong.github.io/chongzhen-game-fixed/
 *         （量**线上**站点：跳过本地静态服务，改用 Resource Timing 的 encodedBodySize，
 *           也就是含 gzip 的"真实过线字节"，和本地未压缩口径不是一回事，两边别混着比）
 *
 * 三个断言（任一不过即退出码 1）：
 *   1. 标题屏不得请求任何 events-*.js      —— 事件数据必须等到真正开局
 *   2. 标题屏 JS 字节数 ≤ BUDGET_JS         —— 防止首屏再次膨胀
 *   3. 音乐默认关时不得请求 bgm.mp3          —— 5.7 MB 音频不能白下
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const argv = process.argv.slice(2)
const distArg = argv.find(a => a.startsWith('--dist='))
const DIST = distArg ? resolve(ROOT, distArg.slice('--dist='.length)) : join(ROOT, 'dist')
const AS_JSON = argv.includes('--json')
/** 指向线上站点时跳过本地服务；空串表示量本地 dist */
const baseArg = argv.find(a => a.startsWith('--base='))
const REMOTE_BASE = baseArg ? baseArg.slice('--base='.length) : process.env.BASE_URL || ''

/** 首屏 JS 预算（KB，未压缩字节数）。当前实测见文件末尾的基线记录。 */
const BUDGET_JS_KB = 700
/** 首屏请求数上限 */
const BUDGET_REQUESTS = 45

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
}

/** 每一份被发出的响应都记在这里 —— 这也是断言的数据来源（不依赖 Content-Length） */
const served = []
let totalBytes = 0

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = join(DIST, urlPath === '/' ? 'index.html' : urlPath)
  // 目录穿越防护：解析后的路径必须仍在 dist 内
  if (!filePath.startsWith(DIST + sep)) {
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const st = await stat(filePath)
    if (st.isDirectory()) filePath = join(filePath, 'index.html')
    const buf = await readFile(filePath)
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.byteLength,
      'Cache-Control': 'no-store'
    })
    res.end(buf)
    served.push({ url: urlPath, type, bytes: buf.byteLength })
    totalBytes += buf.byteLength
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found')
    served.push({ url: urlPath, type: 'missing', bytes: 0 })
  }
})

const failures = []
const pass = msg => console.log(`  \u2713 ${msg}`)
const warn = msg => console.log(`  \u00b7 ${msg}`)
const fail = msg => {
  failures.push(msg)
  console.log(`  \u2717 ${msg}`)
}

/** 按扩展名/路径归类，便于读 */
const kindOf = ({ type, url }) => {
  if (type.startsWith('text/javascript')) return 'js'
  if (type.startsWith('text/css')) return 'css'
  if (type.startsWith('font/')) return 'font'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  return 'other'
}

/** Resource Timing 只给 URL，没给 MIME —— 线上模式靠扩展名反推同一套桶 */
const typeFromPath = p => {
  const ext = extname(p.split('?')[0]).toLowerCase()
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.woff2' || ext === '.woff') return 'font/woff2'
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(ext)) return 'image/png'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.html' || p === '(document)') return 'text/html; charset=utf-8'
  return 'application/octet-stream'
}

async function launchBrowser() {
  // 优先用本机已安装的 Chrome：CI 与本机的浏览器版本都稳定，
  // 也避免 playwright 版本与缓存里的 headless shell 对不上时直接起不来。
  const attempts = [
    { channel: 'chrome' },
    { channel: 'msedge' },
    {}
  ]
  let lastErr
  for (const opts of attempts) {
    try {
      return await chromium.launch({ headless: true, ...opts })
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

const fmtKB = n => `${(n / 1024).toFixed(0)} KB`
const fmtMB = n => `${(n / 1024 / 1024).toFixed(2)} MB`

async function main() {
  let base = REMOTE_BASE
  if (!REMOTE_BASE) {
    if (!(await stat(join(DIST, 'index.html')).catch(() => null))) {
      console.error(`找不到 ${join(DIST, 'index.html')}，请先 npm run build`)
      process.exit(2)
    }
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}/`
  } else if (!base.endsWith('/')) {
    base += '/'
  }

  const browser = await launchBrowser()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    // 禁掉缓存，保证每次量的都是"冷启动"
    extraHTTPHeaders: { 'Cache-Control': 'no-cache' }
  })

  const consoleErrors = []
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))

  const t0 = Date.now()
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  // 等应用真正挂载（index.html 里的启动层就是等这个 MutationObserver）
  await page.waitForSelector('#root > *', { timeout: 20000 })
  const appReadyMs = Date.now() - t0
  // 再空转 2.5s：把空闲预取、延迟 import、audio 预载全部钓出来。
  // 只看"文档加载完那一瞬"会漏掉这类请求，而它们同样吃用户的流量。
  await page.waitForTimeout(2500)

  const fcp = await page.evaluate(() => {
    const e = performance.getEntriesByName('first-contentful-paint')[0]
    return e ? Math.round(e.startTime) : null
  })

  // 线上模式没有本地服务做记账，改用浏览器自己的 Resource Timing：
  // encodedBodySize 是"压缩后实际过线的字节"，与本地未压缩口径不同，只用于前后对比。
  const resources = REMOTE_BASE
    ? await page.evaluate(() => {
        const out = []
        const nav = performance.getEntriesByType('navigation')[0]
        if (nav) out.push({ url: '(document)', bytes: nav.encodedBodySize || 0 })
        for (const e of performance.getEntriesByType('resource')) {
          out.push({ url: new URL(e.name).pathname, bytes: Math.round(e.encodedBodySize || 0) })
        }
        return out
      })
    : null

  // 注意：浏览器**先别关** —— 第二相（点开始 → 首卡）还要用它，见下方。
  // （第七十九轮加这一相时就是忘了这行，量出来永远"首卡没出现"。）

  // ---- 归类统计 ----
  const titlePhase = resources
    ? resources.map(r => ({ url: r.url, type: typeFromPath(r.url), bytes: r.bytes }))
    : served.slice()
  if (resources) totalBytes = titlePhase.reduce((s, r) => s + r.bytes, 0)
  const byKind = {}
  for (const r of titlePhase) {
    const k = kindOf(r)
    byKind[k] = byKind[k] || { count: 0, bytes: 0 }
    byKind[k].count++
    byKind[k].bytes += r.bytes
  }
  const jsBytes = byKind.js?.bytes || 0
  const eventChunks = titlePhase.filter(r => /\/events-[^/]*\.js$/.test(r.url))
  const audioReqs = titlePhase.filter(r => kindOf(r) === 'audio')

  if (AS_JSON) {
    await browser.close()
    if (!REMOTE_BASE) await new Promise(r => server.close(r))
    console.log(
      JSON.stringify(
        {
          appReadyMs,
          fcp,
          requests: titlePhase.length,
          bytes: totalBytes,
          byKind,
          all: titlePhase.map(r => `${r.url} (${(r.bytes / 1024).toFixed(0)} KB)`),
          eventChunks: eventChunks.map(r => ({ url: r.url, bytes: r.bytes })),
          audioReqs: audioReqs.map(r => ({ url: r.url, bytes: r.bytes })),
          consoleErrors
        },
        null,
        2
      )
    )
    return finish()
  }

  console.log('\n=== 标题屏（玩家还没点「开始仕途」）===')
  console.log(`  文档就绪 + 应用挂载：${appReadyMs} ms`)
  console.log(`  FCP：${fcp === null ? '未测得' : `${fcp} ms`}`)
  console.log(`  请求数：${titlePhase.length}，总字节：${fmtMB(totalBytes)}`)
  for (const [k, v] of Object.entries(byKind)) {
    console.log(`    ${k.padEnd(6)} ${String(v.count).padStart(3)} 个  ${fmtKB(v.bytes)}`)
  }

  console.log('\n=== 断言 ===')
  if (eventChunks.length === 0) {
    pass('标题屏没有请求任何 events-*.js（事件数据等到开局才取）')
  } else {
    const biggest = eventChunks.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 5)
    fail(
      `标题屏仍在预取 ${eventChunks.length} 个事件分片（${fmtKB(
        eventChunks.reduce((s, r) => s + r.bytes, 0)
      )}）：` +
        biggest.map(r => `\n        ${r.url} (${fmtKB(r.bytes)})`).join('')
    )
  }

  if (jsBytes / 1024 <= BUDGET_JS_KB) {
    pass(`标题屏 JS ${fmtKB(jsBytes)} ≤ 预算 ${BUDGET_JS_KB} KB`)
  } else {
    fail(`标题屏 JS ${fmtKB(jsBytes)} 超预算 ${BUDGET_JS_KB} KB`)
  }

  if (titlePhase.length <= BUDGET_REQUESTS) {
    pass(`标题屏请求 ${titlePhase.length} 个 ≤ 预算 ${BUDGET_REQUESTS}`)
  } else {
    fail(`标题屏请求 ${titlePhase.length} 个超预算 ${BUDGET_REQUESTS}`)
  }

  if (audioReqs.length === 0) {
    pass('音乐默认关：没有下载 bgm.mp3')
  } else {
    fail(
      `音乐默认关，却仍请求了 ${audioReqs.length} 个音频（${fmtMB(
        audioReqs.reduce((s, r) => s + r.bytes, 0)
      )}）`
    )
  }

  if (consoleErrors.length === 0) {
    pass('标题屏无 console error')
  } else {
    fail(`标题屏出现 ${consoleErrors.length} 条 console error：\n        ${consoleErrors.join('\n        ')}`)
  }

  // ---- 第二相：点「开始仕途」→ 第一张事件卡（第七十九轮之后新增）----
  //
  // 标题屏之后还有一笔账：开局要下什么。事件数据按年切成了两批
  // （`src/data/events/future.ts`），第一批只有 1628，其余在首卡上屏之后才补。
  // 这里量的是"首卡之前"那一截：它不许包含 1632 年以后的任何事件分片，
  // 也不许超过 3 MB —— 否则说明某个组件又把全量 barrel 拖回了静态图
  // （第七十九轮的教训：`GameScreen` 静态 import `CheatMode`，就这么漏的）。
  if (REMOTE_BASE) {
    console.log('\n（线上模式：跳过「开局首卡」这一相，Resource Timing 记不到首卡的瞬间）')
  } else {
    const beforeGame = served.length
    const startAt = Date.now()
    let reachedCard = false
    let cardMs = 0
    try {
      await page.locator('.title-btn', { hasText: '开' }).first().click({ timeout: 10000 })
      await page.waitForTimeout(400)
      const inputs = page.locator('.setup-screen input[type="text"], .setup-screen input:not([type])')
      const n = await inputs.count()
      for (let i = 0; i < n; i++) {
        await inputs.nth(i).fill(['测试', '字明', '苏州府'][i] ?? '测').catch(() => {})
      }
      await page.locator('.setup-screen .confirm-btn').first().click({ timeout: 10000 })
      await page.waitForTimeout(600)
      const cards = page.locator('.origin-card')
      if ((await cards.count()) > 0) {
        await cards.first().click().catch(() => {})
      }
      await page.waitForTimeout(600)
      // P1 在出身之后多了一屏「家训」。这里走无传承的空局，
      // 不能只点出身就等首卡，否则量具会自己卡在 legacy-select 上。
      const legacyPrimary = page.locator('.legacy-btn.primary')
      if ((await legacyPrimary.count()) > 0) {
        await legacyPrimary.first().click().catch(() => {})
      }
      await page.waitForSelector('.event-title', { timeout: 60000 })
      reachedCard = true
      cardMs = Date.now() - startAt
    } catch (e) {
      warn(`首卡没有出现：${e.message?.split('\n')[0] ?? e}`)
    }

    const cardPhase = served.slice(beforeGame)
    const cardBytes = cardPhase.reduce((s, r) => s + (r.bytes || 0), 0)
    const cardJs = cardPhase.filter(r => kindOf(r) === 'js')
    const cardJsBytes = cardJs.reduce((s, r) => s + (r.bytes || 0), 0)

    console.log('\n=== 开局首卡（点「开始仕途」→ 第一张卡上屏）===')
    console.log(`  用时：${reachedCard ? `${cardMs} ms` : '未到达'}`)
    console.log(`  首卡之前付出：${cardPhase.length} 请求 / ${fmtMB(cardBytes)}（JS ${fmtKB(cardJsBytes)}）`)
    const biggest = cardJs.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 6)
    for (const r of biggest) console.log(`    ${fmtKB(r.bytes).padStart(7)}  ${r.url}`)

    // 1632 年及以后的事件分片（含 route_guide / inner_court / preludes 那一片 misc）
    const deferredPattern = /\/events-(historical|transition)-(\d{4}|misc)-[^/]*\.js$/
    const leaked = cardPhase.filter(r => {
      const m = r.url.match(deferredPattern)
      if (!m) return false
      if (m[2] === 'misc') return true
      return Number(m[2]) >= 1632
    })

    if (!reachedCard) {
      fail('首卡没有出现（开局路径断了，或事件数据取不到）')
    } else if (leaked.length === 0) {
      pass('首卡之前没有请求 1632 年以后的事件分片（分批生效）')
    } else {
      fail(
        `首卡之前就下了 ${leaked.length} 个"以后年份"的事件分片（${fmtKB(
          leaked.reduce((s, r) => s + r.bytes, 0)
        )}）：` +
          leaked.map(r => `\n        ${r.url} (${fmtKB(r.bytes)})`).join('')
      )
    }

    const BUDGET_CARD_MB = 3.0
    if (reachedCard && cardBytes / 1024 / 1024 <= BUDGET_CARD_MB) {
      pass(`首卡之前 ${fmtMB(cardBytes)} ≤ 预算 ${BUDGET_CARD_MB} MB`)
    } else if (reachedCard) {
      fail(`首卡之前 ${fmtMB(cardBytes)} 超预算 ${BUDGET_CARD_MB} MB`)
    }

    if (consoleErrors.length === 0) {
      pass('开局阶段无 console error')
    } else {
      fail(`开局阶段出现 console error：\n        ${consoleErrors.join('\n        ')}`)
    }

    // 「幽灵模式」：面板静态 import 全量 barrel（2.4 MB），必须是懒加载。
    // 这条断言防的是把它改回 `import CheatMode from './CheatMode'` ——
    // 那样开局就会重新背上 1632 年以后的全部事件，而其它闸门都看不见。
    const cheatChunks = served.slice(beforeGame).filter(r => /\/CheatMode-[^/]*\.js$/.test(r.url))
    if (cheatChunks.length === 0) {
      pass('开局阶段没有请求 CheatMode 分片（面板仍是懒加载）')
    } else {
      fail(`开局就请求了 ${cheatChunks.length} 个 CheatMode 分片：${cheatChunks.map(r => r.url).join(', ')}`)
    }

    if (reachedCard) {
      const cheatBtn = page.locator('.cheat-button').first()
      if ((await cheatBtn.count()) === 0) {
        warn('找不到 .cheat-button，跳过调试面板开合检查')
      } else {
        await cheatBtn.click({ timeout: 15000 }).catch(() => {})
        const opened = await page
          .locator('.cheat-modal-overlay')
          .first()
          .waitFor({ state: 'visible', timeout: 20000 })
          .then(() => true)
          .catch(() => false)
        if (opened) pass('点「幽灵模式」后面板正常出现（懒加载没把入口点死）')
        else fail('点「幽灵模式」后面板没出现（懒加载把入口点死了）')
        await page.keyboard.press('Escape').catch(() => {})
      }
    }
  }

  await browser.close()
  if (!REMOTE_BASE) await new Promise(r => server.close(r))

  finish()
}

function finish() {
  if (failures.length) {
    console.log(`\n结果：${failures.length} 项不达标\n`)
    process.exitCode = 1
  } else {
    console.log('\n结果：全部达标\n')
  }
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})

/**
 * 基线记录（本地 dist，未压缩口径，Chrome headless 1440×900，禁缓存）
 *
 *   第七十九轮前：标题屏 32 请求 / 9.35 MB；开局首卡前 3.83 MB
 *   第七十九轮后：标题屏 15 请求 / 0.89 MB（JS 213 KB、字体 379 KB、CSS 299 KB）
 *                开局首卡 8348 ms → 6688 ms（2 Mbps / 150 ms 限速，tests 里的临时量具）
 *   第八十轮后：  标题屏 15 请求 / 0.89 MB（不变）
 *                开局首卡前 31 请求 / 2.54 MB（JS 1508 KB），首卡前不再有 1632+ 分片
 *                第二批（future + 9 个分片）在首卡后 +36 ms 才发起
 *
 * 预算留了余量，不是把实测值当阈值：
 *   BUDGET_JS_KB 700（实测 213）、BUDGET_REQUESTS 45（实测 15）、首卡 3.0 MB（实测 2.54）
 */
