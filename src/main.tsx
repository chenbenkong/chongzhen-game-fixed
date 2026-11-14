import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'

// 自托管字体（构建期打包，无外部 CDN 依赖，离线可用）
import '@fontsource/ma-shan-zheng/400.css'

import ErrorBoundary from './components/ErrorBoundary'
import { setupLongTaskObserver } from './utils/performance'
import './index.css'
import './theme.css'

// 启动性能监控（仅开发环境采样）
//
// 这里以前是无条件调用，而 performance.ts 的注释和这一行都写着"仅开发环境" ——
// 于是生产构建也在跑一个常驻 PerformanceObserver，玩家每次超过 50ms 的渲染
// 都会往控制台丢一条 `[长任务] xxxms`（崩溃压力测试的警告样本里全是它）。
// 采样是给开发者看的，不该占用玩家的 CPU，也不该污染玩家的控制台。
if (import.meta.env.DEV) setupLongTaskObserver()

// 懒加载根组件，让启动占位更早可见；占位层在 #root 之外，由 app-ready 事件与
// index.html 里的 MutationObserver 共同负责移除。
//
// 用 let + 工厂重建：React.lazy 会缓存**失败的那个 promise**，
// 主包一旦加载失败，原样重渲染永远同步再抛回错误页 ——
// 这正是 ErrorBoundary「继续游戏」成为死按钮的根因（实测连点 3 次零新请求）。
// 重试时必须换一个全新的 lazy 实例，才会真正重发请求。
let AppLazy = lazy(() => import('./App'))

// 全局未捕获错误处理
window.addEventListener('error', (e) => {
  console.error('[全局错误]', e.error || e.message)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Promise 未捕获错误]', e.reason)
})

// 防止页面被第三方站点嵌入 iframe（点击劫持保护）。
// 桌面版（Electron）中 window.top === window.self，不会触发。
if (window.self !== window.top && window.top) {
  try {
    window.top.location.href = window.self.location.href
  } catch {
    // 跨域限制：无法改写父页面，至少阻止自身继续渲染
    document.documentElement.innerHTML = ''
  }
}

const container = document.getElementById('root')
const root = container ? ReactDOM.createRoot(container) : null

// 每次重试都换 key：React 元素一旦创建，它的 type 就固定为当时那个 lazy 实例，
// 光靠 setState 重渲染拿不到新实例；换 key 让 ErrorBoundary 连同其 hasError 状态
// 一起重建，新实例渲染的是新元素（新 lazy），才会真正重发请求。
let renderAttempt = 0

function renderTree() {
  if (!root) return
  renderAttempt++
  root.render(
    <React.StrictMode>
      {/* key 必须打在 ErrorBoundary 自己身上：打在 StrictMode 上不会重建子树，
          hasError 会残留，重试后仍停在错误页 */}
      <ErrorBoundary key={renderAttempt} onRetryChunk={retryChunk}>
        <Suspense fallback={null}>
          <AppLazy />
        </Suspense>
      </ErrorBoundary>
    </React.StrictMode>
  )
}

/** 换一个全新的 lazy 实例再渲染：绕开 React.lazy 对失败 promise 的缓存 */
function retryChunk() {
  AppLazy = lazy(() => import('./App'))
  renderTree()
}

if (root) {
  renderTree()
} else {
  console.error('[启动失败] 未找到 #root 挂载点')
}
