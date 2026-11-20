/**
 * 字体加载诊断：确认自托管的「马善政」真的在浏览器里生效。
 *
 * 为什么单独写一个脚本：@fontsource 用的是 unicode-range 子集化，
 * 字体分片按实际渲染到的字符**按需加载**。因此
 * `document.fonts.check('1em "Ma Shan Zheng"')`（不带文本）会因为默认探测文本
 * 不在任何已加载分片的 unicode-range 内而返回 false —— 那是**假阴性**，
 * 不能据此判断字体没生效。必须用真实渲染到的中文字去问。
 *
 * 用法：cd tests && node font-check.mjs
 */
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/'
const FAMILY = 'Ma Shan Zheng'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const requested = []
page.on('response', res => {
  const url = res.url()
  if (/\.woff2?(\?|$)/.test(url)) requested.push({ url: url.split('/').pop(), status: res.status() })
})

await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(3500)

const result = await page.evaluate(async family => {
  await document.fonts.ready
  const faces = [...document.fonts]
  const check = text => document.fonts.check(`1em "${family}"`, text)
  const computed = sel => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el).fontFamily : null
  }
  return {
    status: document.fonts.status,
    faceCount: faces.length,
    loadedCount: faces.filter(f => f.status === 'loaded').length,
    families: [...new Set(faces.map(f => f.family))],
    checkEmpty: check(''),
    checkLatin: check('A'),
    checkChong: check('崇'),
    checkZhen: check('祯'),
    checkTitle: check('崇祯·宦海浮沉'),
    titleFont: computed('.title-main'),
    // 实际渲染宽度对比：如果字体真生效，同一段文字在「马善政」下的宽度会与 serif 不同
    widthWithWebfont: (() => {
      const s = document.createElement('span')
      s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:48px;font-family:"${family}"`
      s.textContent = '崇祯·宦海浮沉'
      document.body.appendChild(s)
      const w = s.getBoundingClientRect().width
      s.remove()
      return Math.round(w)
    })(),
    widthWithSerif: (() => {
      const s = document.createElement('span')
      s.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap;font-size:48px;font-family:serif'
      s.textContent = '崇祯·宦海浮沉'
      document.body.appendChild(s)
      const w = s.getBoundingClientRect().width
      s.remove()
      return Math.round(w)
    })()
  }
}, FAMILY)

console.log('=== document.fonts ===')
console.log(`status            = ${result.status}`)
console.log(`FontFace 总数      = ${result.faceCount}（已 loaded：${result.loadedCount}）`)
console.log(`已注册字体族        = ${JSON.stringify(result.families)}`)
console.log('')
console.log('=== check() 结果 ===')
console.log(`check('')        = ${result.checkEmpty}   <- 默认探测文本，子集化下为 false 属正常`)
console.log(`check('A')       = ${result.checkLatin}`)
console.log(`check('崇')       = ${result.checkChong}`)
console.log(`check('祯')       = ${result.checkZhen}`)
console.log(`check('崇祯·宦海浮沉')   = ${result.checkTitle}   <- 真正有意义的判据`)
console.log('')
console.log('=== 实际渲染 ===')
console.log(`.title-main 计算字体 = ${result.titleFont}`)
console.log(`「崇祯·宦海浮沉」宽度：马善政 ${result.widthWithWebfont}px / serif ${result.widthWithSerif}px`)
console.log('')
console.log(`=== 实际请求的字体分片（${requested.length} 个）===`)
requested.forEach(r => console.log(`  HTTP ${r.status}  ${r.url}`))

const ok = result.checkTitle || (result.widthWithWebfont !== result.widthWithSerif && requested.length > 0)
console.log('')
if (ok) {
  console.log('结论：自托管字体已生效（分片按需加载正常）')
} else {
  console.log('结论：字体可能未生效 —— 需要排查 woff2 请求与 @font-face 声明')
}

await browser.close()
process.exit(ok ? 0 : 1)
