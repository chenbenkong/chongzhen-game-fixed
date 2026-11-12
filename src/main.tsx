import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'

// 自托管字体（构建期打包，无外部 CDN 依赖，离线可用）
import '@fontsource/ma-shan-zheng/400.css'

import ErrorBoundary from './components/ErrorBoundary'
import { setupLongTaskObserver } from './utils/performance'
import './index.css'
import './theme.css'

// 启动性能监控（仅开发环境采样）
setupLongTaskObserver()

// 懒加载根组件，让启动占位更早可见；占位层在 #root 之外，由 app-ready 事件与
// index.html 里的 MutationObserver 共同负责移除
const App = lazy(() => import('./App'))

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

if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </React.StrictMode>
  )
} else {
  console.error('[启动失败] 未找到 #root 挂载点')
}
