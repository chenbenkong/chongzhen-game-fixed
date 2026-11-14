import { useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../hooks/useModal'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  /** 补充说明（红色，警示性） */
  warning?: string
  /** 关联的元信息（如事件标题） */
  detail?: string
  confirmText?: string
  cancelText?: string
  /** 'danger' 红色确认 / 'primary' 暗金确认 */
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/** 自定义确认弹窗 —— 暗金古风主题，Portal 到 body */
function ConfirmDialogImpl({
  open,
  title = '请确认',
  message,
  warning,
  detail,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // 对话框语义（useId 生成 aria-labelledby，避免多实例同 id 冲突）
  // + Tab 焦点陷阱 + 焦点还原 + 计数式滚动锁 + 初始聚焦确认按钮
  // ESC 由下方自定义监听统一处理（因为这里还有 Enter 确认的逻辑），故 closeOnEsc 关闭
  const { getModalProps, dialogRef, titleId, handleOverlayClick } = useModal({
    open,
    onClose: onCancel,
    labelledBy: undefined,
    initialFocusRef: confirmRef,
    closeOnEsc: false
  })

  // Enter 确认（仅在无 input focus 时）+ 焦点管理交给 useModal
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.target === document.body) {
        // 仅在无 input focus 时按 Enter 确认
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        // 文件头注释写着"ESC 由自定义监听统一处理"，但原实现只处理了 Enter ——
        // 确认框对 ESC 其实完全无反应。补上：ESC = 取消。
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onConfirm, onCancel])

  if (!open) return null

  const node = (
    <div className="cd-overlay" onClick={handleOverlayClick}>
      <div
        className="cd-panel"
        ref={dialogRef}
        {...getModalProps()}
      >
        <div className="cd-header">
          <div className={`cd-icon cd-icon-${variant}`} aria-hidden="true" />
          <h2 id={titleId} className="cd-title">{title}</h2>
        </div>

        <div className="cd-body">
          <p className="cd-message">{message}</p>
          {detail && <div className="cd-detail">{detail}</div>}
          {warning && <div className="cd-warning">{warning}</div>}
        </div>

        <div className="cd-actions">
          <button className="cd-btn cd-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={`cd-btn cd-btn-${variant}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

export const ConfirmDialog = memo(ConfirmDialogImpl)
export default ConfirmDialog
