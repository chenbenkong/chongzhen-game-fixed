import { afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { whenEventDataReady } from '../../src/data/events/store'

/**
 * 单元测试全局环境准备。
 *
 * 这一层的存在理由很具体：`useGameEngine` 是个 1900 行的 React hook，
 * 它依赖一批 jsdom 没有、或被测运行环境覆盖掉的浏览器 API。
 * 不补齐这些桩，测试会在与被测逻辑无关的地方抛错，掩盖真正的问题。
 */

/* --------------------------------------------------------------------------
 * 1) localStorage / sessionStorage
 *
 * 为什么需要自己实现：Node 22+ 引入了实验性的 Web Storage 全局，
 * Node 26 默认开启。它会在 globalThis 上定义 localStorage 的取值器，
 * 而该取值器在没有 `--localstorage-file` 时返回 undefined。
 * 结果就是 vitest 的 jsdom 环境虽然加载成功（window/document/navigator 都在），
 * 但 `localStorage` 依然是 undefined，引擎一读存档就抛
 * "Cannot read properties of undefined (reading 'getItem')"。
 *
 * 这里装一个符合 Storage 规范的内存实现，行为与浏览器一致：
 * 值会被强制转成字符串、key 顺序稳定、key(n) 按下标返回、length 正确。
 * 引擎里确实用到了 length 与 key(i)（见 ErrorBoundary 的全量清理逻辑），
 * 所以不能只实现 get/set/remove。
 * ------------------------------------------------------------------------ */
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    const k = String(key)
    return this.store.has(k) ? (this.store.get(k) as string) : null
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return index >= 0 && index < keys.length ? keys[index] : null
  }

  removeItem(key: string): void {
    this.store.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value))
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (() => {
    try {
      return (globalThis as Record<string, unknown>)[name] as Storage | undefined
    } catch {
      return undefined
    }
  })()

  // 已经有了可用实现（例如未来的 jsdom 修复了这个问题）就不要覆盖
  if (existing && typeof existing.getItem === 'function') return

  const storage = new MemoryStorage()
  for (const target of [globalThis, typeof window !== 'undefined' ? window : undefined]) {
    if (!target) continue
    try {
      Object.defineProperty(target, name, {
        value: storage,
        writable: true,
        configurable: true
      })
    } catch {
      // 某些环境下 window 属性不可重定义，忽略即可（globalThis 那份已经够用）
    }
  }
}

installStorage('localStorage')
installStorage('sessionStorage')

/* --------------------------------------------------------------------------
 * 2) jsdom 缺失的浏览器 API
 * ------------------------------------------------------------------------ */

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  })
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

beforeAll(async () => {
  // 事件仓库在线上是"开局只装 1628，其余后台补"（见 src/data/events/store.ts）。
  // 单测没有"后台"这一说：每个用例都假定全量 483 条已经就位，
  // 否则同一颗种子跑出来的路径会和线上"走满整局"的路径不是同一条。
  await whenEventDataReady()
})

beforeEach(() => {
  // 每个用例从干净的存储开始：存档/难度/教程标记都不该跨用例泄漏
  localStorage.clear()
  sessionStorage.clear()

  // 固定随机数：引擎在挑选事件、掷骰、临界事件判定里都用 Math.random，
  // 不固定就会得到随机失败的用例。需要不同序列的用例可自行 mockReturnValueOnce。
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
