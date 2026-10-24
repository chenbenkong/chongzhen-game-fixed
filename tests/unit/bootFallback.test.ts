import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 启动兜底与应用的交接（第六十三轮）。
 *
 * 线上实测：GitHub Pages 慢网下 23 个 JS chunk 要 50 秒才加载完，20 秒的
 * 兜底看门狗先把「游戏未能启动」遮罩点亮；应用随后挂载成功，`reveal()`
 * 撤掉了 #boot-splash，却没有摘 #boot-fallback 的 is-visible —— 错误遮罩
 * （pointer-events: auto，全屏 fixed）永久盖在已经能玩的标题屏上。
 *
 * 这里直接执行 index.html 里的**真实内联脚本**，不是抄一份逻辑：
 * 先手动把 is-visible 加上（模拟看门狗已开火），再走两条挂载路径。
 */

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

function bootScript(): string {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const found = blocks.find(b => b.includes('fallbackTimer'))
  if (!found) throw new Error('index.html 里找不到启动兜底脚本 —— 选择器或结构变了')
  return found
}

function setupDom(): void {
  document.body.innerHTML = `
    <div id="root"></div>
    <div id="boot-splash"><div>崇祯</div></div>
    <div id="boot-fallback"><button type="button">重新加载</button></div>
  `
  window.eval(bootScript())
}

const fallback = () => document.getElementById('boot-fallback')!

describe('启动兜底遮罩与应用的交接', () => {
  it('兜底先亮、应用后挂载：app-ready 到达时遮罩必须撤掉', () => {
    setupDom()
    fallback().classList.add('is-visible')

    window.dispatchEvent(new Event('app-ready'))

    expect(document.getElementById('boot-splash')!.classList.contains('is-hidden')).toBe(true)
    expect(
      fallback().classList.contains('is-visible'),
      '应用已经挂载，错误遮罩还盖在上面 —— 慢网玩家会看到能玩的标题屏上面压着「游戏未能启动」'
    ).toBe(false)
  })

  it('#root 先出现子节点（ErrorBoundary 路径）：同样撤掉遮罩', async () => {
    setupDom()
    fallback().classList.add('is-visible')

    document.getElementById('root')!.appendChild(document.createElement('div'))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(
      fallback().classList.contains('is-visible'),
      'MutationObserver 这条路也要撤遮罩'
    ).toBe(false)
  })
})
