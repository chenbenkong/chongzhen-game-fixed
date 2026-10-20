import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'

/**
 * 共享模态框 hook —— 统一提供无障碍语义与键盘/焦点行为：
 *   1. role="dialog" + aria-modal="true" + 由 useId() 生成的 aria-labelledby
 *   2. ESC 关闭
 *   3. 真正的 Tab 焦点陷阱（在对话框内循环，首尾回绕）
 *   4. 焦点恢复：打开时记住 document.activeElement，关闭时还原，并把焦点移入对话框
 *   5. body 滚动锁：用计数而非直接重置 style.overflow，支持嵌套/并发模态框
 *   6. 可选 initialFocusRef / initialFocus:'dialog' 指定初始焦点
 *   7. 点击遮罩守卫：仅当 e.target === e.currentTarget 时才关闭
 *      （React 合成事件沿 React 树冒泡，子组件 portal 出去也仍会冒泡上来，故必须做 target 守卫）
 */

/** 可聚焦候选选择器（Tab 陷阱用） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/** 收集容器内当前可聚焦的元素（过滤不可见项与 aria-hidden 项） */
function getTabbable(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter(el => {
    if (el.hasAttribute('inert')) return false
    if (el.closest('[aria-hidden="true"]')) return false
    // 隐藏元素不参与焦点循环
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false
    return true
  })
}

/* ---------- body 滚动锁：计数实现，支持嵌套/并发模态框 ---------- */
let scrollLockCount = 0
let savedBodyOverflow = ''

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

function releaseScrollLock() {
  if (scrollLockCount === 0) return
  scrollLockCount -= 1
  // 只有最后一个持有者释放时才还原，避免嵌套模态框互相踩踏
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow
  }
}

export interface UseModalOptions {
  /** 是否打开；关闭时不做任何副作用 */
  open: boolean
  /** 关闭回调（ESC / 点击遮罩触发） */
  onClose: () => void
  /** 对话框标题元素的 id，用于 aria-labelledby（推荐传入 hook 返回的 titleId） */
  labelledBy?: string
  /** 打开时优先聚焦的元素；缺省则按 initialFocus 的策略 */
  initialFocusRef?: RefObject<HTMLElement>
  /**
   * 没给 initialFocusRef 时的初始焦点策略，默认 `'first'`（框里第一个可聚焦元素）。
   *
   * `'dialog'` 是给"打开要先读一段话"的框用的：第一个可聚焦元素排在正文之下时，
   * `focus()` 的默认行为会把正文滚出滚动区（第三十三轮的骰子弹窗实测 scrollTop=421，
   * 难度说明一打开就看不见）。停在面板上则正文从头显示，读屏也会念 aria-labelledby
   * 的标题；Tab 陷阱本来就处理"焦点停在对话框容器上"这种情况（首尾回绕）。
   */
  initialFocus?: 'first' | 'dialog'
  /** 是否接管 ESC（默认 true）。需要自定义 ESC 行为时可关闭，自行处理 onKeyDown */
  closeOnEsc?: boolean
  /** 点击遮罩（e.target === e.currentTarget）时是否关闭，默认 true */
  closeOnOverlayClick?: boolean
}

export interface UseModalResult {
  /** 展开到对话框元素上（含 role/aria-modal/aria-labelledby/onKeyDown） */
  getModalProps: () => {
    role: 'dialog'
    'aria-modal': true
    'aria-labelledby': string | undefined
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  }
  /** 对话框容器 ref（焦点陷阱的作用域） */
  dialogRef: RefObject<HTMLDivElement>
  /** useId() 生成的稳定 id，需要额外绑定时可用 */
  modalId: string
  /** 给标题元素用的 id（再回传给 labelledBy） */
  titleId: string
  /** 点击遮罩守卫：仅点击遮罩本身才关闭 */
  handleOverlayClick: (e: ReactMouseEvent<HTMLElement>) => void
  /** 手动把焦点移入对话框（一般不需要调用） */
  focusDialog: () => void
}

export function useModal({
  open,
  onClose,
  labelledBy,
  initialFocusRef,
  initialFocus = 'first',
  closeOnEsc = true,
  closeOnOverlayClick = true
}: UseModalOptions): UseModalResult {
  const baseId = useId()
  const modalId = `modal-${baseId}`
  const titleId = `${modalId}-title`

  const dialogRef = useRef<HTMLDivElement>(null)
  // 打开前拥有焦点的元素，关闭时还原
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  // 用 ref 持有最新回调，避免因回调引用变化反复重跑副作用（导致焦点被反复重置）
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const focusDialog = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const focusContainer = () => {
      // 没有任何可聚焦子元素时，聚焦对话框自身兜底
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1')
      dialog.focus()
    }
    if (initialFocus === 'dialog') {
      focusContainer()
      return
    }
    const initial = initialFocusRef?.current
    if (initial && dialog.contains(initial)) {
      initial.focus()
      return
    }
    const tabbables = getTabbable(dialog)
    if (tabbables.length > 0) {
      tabbables[0].focus()
    } else {
      focusContainer()
    }
  }, [initialFocus, initialFocusRef])

  // 打开/关闭生命周期：只依赖 open，避免调用方回调引用变化时反复抢焦点/反复还原
  useEffect(() => {
    if (!open) return

    // 1) 记录打开前的焦点（仅记录一次）
    if (restoreFocusRef.current === null) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
    }
    // 2) 加锁 body 滚动
    acquireScrollLock()
    // 3) 延迟一帧把焦点移入对话框（等 portal 挂载 / transition 开始）
    const timer = window.setTimeout(() => focusDialog(), 0)

    return () => {
      window.clearTimeout(timer)
      releaseScrollLock()
      // 4) 还原焦点
      const target = restoreFocusRef.current
      restoreFocusRef.current = null
      if (target && document.contains(target) && !(target as HTMLButtonElement).disabled) {
        target.focus()
      }
    }
    // focusDialog 用 ref 间接调用，避免其引用变化触发本副作用重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ESC 关闭（回调引用变化时只重挂监听，不影响焦点与滚动锁）
  useEffect(() => {
    if (!open || !closeOnEsc) return

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeOnEsc])

  // Tab 焦点陷阱：在对话框内循环，首尾回绕
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const tabbables = getTabbable(dialog)
    if (tabbables.length === 0) {
      e.preventDefault()
      dialog.focus()
      return
    }
    const first = tabbables[0]
    const last = tabbables[tabbables.length - 1]
    const active = document.activeElement as HTMLElement | null

    if (e.shiftKey) {
      // 反向：焦点在第一个（或跑出/停在对话框容器上）→ 回到最后一个
      if (!active || active === first || active === dialog || !dialog.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      // 正向：焦点在最后一个（或跑出/停在对话框容器上）→ 回到第一个
      if (!active || active === last || active === dialog || !dialog.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  const handleOverlayClick = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    // 只有点在遮罩本身才关闭；React 合成事件会沿 React 树冒泡，故必须比较 target 与 currentTarget
    if (!closeOnOverlayClick) return
    if (e.target === e.currentTarget) onCloseRef.current()
  }, [closeOnOverlayClick])

  const getModalProps = useCallback(() => ({
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-labelledby': labelledBy,
    onKeyDown: handleKeyDown
  }), [labelledBy, handleKeyDown])

  return { getModalProps, dialogRef, modalId, titleId, handleOverlayClick, focusDialog }
}

export default useModal
