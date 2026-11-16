/**
 * 手机横屏 Web 版 —— 入口检测。
 *
 * 判定优先级（从高到低，前一条命中即返回，不再往后看）：
 *   1. URL 显式参数：`?mobile=1` 强制手机版；`?mobile=0` 强制桌面版。
 *      这是预览 / 调试口子，优先级最高，任何设备都听它的。
 *   2. 无显式参数时，三个信号**同时成立**才进手机版（AND 而非 OR）：
 *        a. UA 命中移动标识（Android / iPhone / iPad / iPod / HarmonyOS / 移动浏览器 …）；
 *        b. 主指针为粗指针 `(pointer: coarse)`（触屏笔/手指，不是鼠标）；
 *        c. 视口短边 ≤ 520px。
 *      只要 UA 是桌面标识（Windows / macOS / Linux 桌面浏览器），一律桌面版，
 *      哪怕视口被拖成窄窗、或模拟成触屏 —— 桌面 UA 不进手机版。
 *
 * 为什么三条 AND：
 *   - 只看 UA：桌面浏览器把窗口拖窄到 390px 也会被误判成手机；
 *   - 只看视口宽度：平板 / 可翻转本 / 窄窗口桌面会被塞进手机布局；
 *   - 只看 coarse pointer：触屏笔记本（pointer 可能同时报 coarse）会被误判。
 * 三条交叉之后，剩下的才是「真手机浏览器 + 小屏 + 触屏」这一组。
 */

/** 移动 UA 关键词。覆盖 iOS / Android / 鸿蒙 / 常见移动浏览器；iPadOS 桌面级 UA 由短边+粗指针兜底。 */
const MOBILE_UA_RE =
  /Android|iPhone|iPad|iPod|iOS|Mobile|webOS|BlackBerry|HarmonyOS|Harmony|MiuiBrowser|Opera Mini|UCBrowser|MicroMessenger|Dolphin|Symbian/i

/** 短边阈值（px）。超过它的设备按平板 / 桌面对待，走桌面三栏。 */
export const MOBILE_SHORT_SIDE_LIMIT = 520

/**
 * 读取 URL 上的 `mobile` 参数。
 * @returns '1' 强制手机 / '0' 强制桌面 / null 未带参数
 */
function readExplicitFlag(): '1' | '0' | null {
  if (typeof window === 'undefined' || !window.location) return null
  const raw = new URLSearchParams(window.location.search).get('mobile')
  if (raw === '1') return '1'
  if (raw === '0') return '0'
  return null
}

/** UA 是否带移动标识。桌面 UA（Windows NT / Macintosh / X11 / Linux x86_64）一律不匹配。 */
function looksMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return MOBILE_UA_RE.test(navigator.userAgent || '')
}

/** 主指针是否为粗指针（手指 / 触屏笔）。无法查询时回退 false，从严不放大。 */
function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** 视口短边是否落在手机尺寸范围内。 */
function shortSideWithinLimit(): boolean {
  if (typeof window === 'undefined') return false
  return Math.min(window.innerWidth, window.innerHeight) <= MOBILE_SHORT_SIDE_LIMIT
}

/**
 * 当前是否应进入手机横屏版。
 * 纯函数、可在渲染期调用；同一 URL 下结果稳定（不监听视口变化，
 * 横竖屏切换由 MobileShell 内部的方向覆盖层处理，不在这里改分支）。
 */
export function detectMobileMode(): boolean {
  const explicit = readExplicitFlag()
  if (explicit === '1') return true
  if (explicit === '0') return false

  if (!looksMobileUA()) return false
  return hasCoarsePointer() && shortSideWithinLimit()
}
