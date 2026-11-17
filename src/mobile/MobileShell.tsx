/**
 * 手机横屏壳 —— 竖屏旋转提示、全屏 / 锁横屏、安全区与触控防误触。
 *
 * 职责边界：
 *   - 只做「壳」：方向闸门、浏览器能力调用、body 作用域类名挂载；
 *   - 不碰玩法规则，不重复引擎状态；
 *   - 竖屏（`orientation: portrait` 或高度 > 宽度）时整屏覆盖旋转提示，
 *     牌桌交互不渲染在覆盖层之下。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** 方向 / 全屏能力调用结果，如实回传给玩家；API 不支持或失败都不假装成功。 */
interface OrientationStatus {
  fullscreen: 'unsupported' | 'pending' | 'ok' | 'failed'
  lock: 'unsupported' | 'pending' | 'ok' | 'failed'
  message: string
}

function readIsPortrait(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches) {
    return true
  }
  return window.innerHeight > window.innerWidth
}

/**
 * 调用全屏 + 尝试锁定横屏。
 * 两步各自独立 try/catch：全屏成功但锁横屏失败，也要把「横屏未锁定」如实说出来，
 * 不能因为后一步失败就谎称整体成功，也不能因为前一步不支持就跳过锁横屏尝试。
 */
async function enterFullscreenAndLock(): Promise<OrientationStatus> {
  const docEl = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>
  }
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (type: string) => Promise<void>
    unlock?: () => void
  } | undefined

  let fullscreen: OrientationStatus['fullscreen'] = 'unsupported'
  let lock: OrientationStatus['lock'] = 'unsupported'

  // 第一步：进入全屏（iOS Safari 不支持 RequestFullscreen，会落到 unsupported）
  if (typeof docEl.requestFullscreen === 'function') {
    fullscreen = 'pending'
    try {
      await docEl.requestFullscreen()
      fullscreen = 'ok'
    } catch (err) {
      fullscreen = 'failed'
    }
  }

  // 第二步：锁横屏。桌面浏览器 / iOS Safari 没有 ScreenOrientation.lock，记 unsupported。
  if (orientation && typeof orientation.lock === 'function') {
    lock = 'pending'
    try {
      await orientation.lock('landscape')
      lock = 'ok'
    } catch {
      lock = 'failed'
    }
  }

  const parts: string[] = []
  if (fullscreen === 'ok') parts.push('已进入全屏')
  else if (fullscreen === 'failed') parts.push('全屏被浏览器拒绝，可手动在浏览器菜单里全屏')
  else if (fullscreen === 'unsupported') parts.push('当前浏览器不支持网页全屏')

  if (lock === 'ok') parts.push('已锁定横屏')
  else if (lock === 'failed') parts.push('横屏锁定被系统拒绝，请手动旋转手机')
  else if (lock === 'unsupported') parts.push('当前浏览器不支持锁定方向，请手动旋转手机')

  return { fullscreen, lock, message: parts.join('；') }
}

interface MobileShellProps {
  children: ReactNode
}

export default function MobileShell({ children }: MobileShellProps) {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => readIsPortrait())
  const [status, setStatus] = useState<OrientationStatus | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const statusRef = useRef<OrientationStatus | null>(null)
  const requestInFlightRef = useRef(false)
  const autoAttemptedRef = useRef(false)

  const requestOrientation = useCallback(async () => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true
    setIsRequesting(true)
    const result = await enterFullscreenAndLock()
    statusRef.current = result
    setStatus(result)
    setIsRequesting(false)
    requestInFlightRef.current = false
  }, [])

  // 把手机版作用域类名挂到 body 上：portal 到 body 的复用组件（骰子弹窗、
  // 存档槽位、死亡结局、生平回顾等）只能靠这个类名被 mobile.css 作用域选择器覆盖。
  useEffect(() => {
    document.body.classList.add('mobile-applied')
    return () => {
      document.body.classList.remove('mobile-applied')
    }
  }, [])

  // 监听视口尺寸与方向变化，实时更新竖屏覆盖层。
  useEffect(() => {
    const update = () => setIsPortrait(readIsPortrait())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    if (typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(orientation: portrait)')
      mq.addEventListener?.('change', update)
    }
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  // 手机网页版的限制：screen.orientation.lock 通常只允许在「全屏 + 用户手势」里调用。
  // 首次触摸时静默尝试一次全屏+锁横屏；失败也不阻塞游戏，竖屏时仍有显式按钮兜底。
  useEffect(() => {
    if (autoAttemptedRef.current) return
    const onFirstGesture = () => {
      if (autoAttemptedRef.current) return
      autoAttemptedRef.current = true
      void requestOrientation()
    }
    window.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', onFirstGesture, true)
  }, [requestOrientation])

  const handleEnterFullscreen = useCallback(async () => {
    await requestOrientation()
  }, [requestOrientation])

  return (
    <div className="mobile-shell">
      {isPortrait ? (
        <div className="mobile-rotate-overlay" role="dialog" aria-label="请旋转手机">
          <div className="mobile-rotate-icon" aria-hidden="true">⟳</div>
          <h2 className="mobile-rotate-title">请旋转手机</h2>
          <p className="mobile-rotate-desc">本作按横屏牌桌布局设计，请将手机横过来游玩。</p>
          <button
            type="button"
            className="mobile-rotate-btn"
            onClick={handleEnterFullscreen}
            disabled={isRequesting}
          >
            {isRequesting ? '正在请求…' : '全屏并锁定横屏'}
          </button>
          {status && <p className="mobile-rotate-status" role="status">{status.message}</p>}
          <p className="mobile-rotate-hint">网页版的横屏锁定受浏览器限制：若按钮无效，请关闭系统竖屏锁定，或安装为 PWA 后从桌面启动；原生 APK 已在应用层强制横屏，不受系统锁定影响。</p>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
