import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  SaveSlot,
  getAllSaveSlots,
  deleteSaveSlot,
  deleteAutosave,
  buildSaveBundle,
  serializeSaveBundle,
  parseSaveBundle,
  applySaveBundle,
  type SaveBundleSummary,
  type SavePreview
} from '../types/save'
import {
  buildArchiveFromSave,
  getAutosaveArchive,
  type TitleArchiveSnapshot
} from '../data/titleArchive'
import { useConfirm } from '../hooks/useConfirm'
import { useModal } from '../hooks/useModal'
import './SaveSlotsModal.css'

type SaveSlotView = SaveSlot & { archive: TitleArchiveSnapshot | null }

function toSlotView(slot: SaveSlot): SaveSlotView {
  return {
    ...slot,
    archive: slot.data ? buildArchiveFromSave(slot.data) : null
  }
}

function formatArchiveSummary(archive: TitleArchiveSnapshot): string {
  const career = archive.careerName === '未立志业'
    ? '未立志业'
    : `${archive.careerName} ${archive.careerCompleted}/3`
  return `${career} · ${archive.storylineName} · 履历 ${archive.lifeRecordCount}`
}

interface SaveSlotsModalProps {
  isOpen: boolean
  mode: 'save' | 'load'
  currentData?: {
    name: string
    year: number
    month: number
    rank: string
    title: string
  }
  onSelect: (slotId: number) => void
  /** 加载自动存档的回调（SaveSlotsModal 在自动存档槽位上点击时触发） */
  onLoadAutosave?: () => void
  onClose: () => void
}

export default function SaveSlotsModal({ isOpen, mode, currentData, onSelect, onLoadAutosave, onClose }: SaveSlotsModalProps) {
  const [slots, setSlots] = useState<SaveSlotView[]>([])
  const [autosaveArchive, setAutosaveArchive] = useState<TitleArchiveSnapshot | null>(null)
  const [backupNotice, setBackupNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const refreshSaves = useCallback(() => {
    setSlots(getAllSaveSlots().map(toSlotView))
    setAutosaveArchive(getAutosaveArchive())
  }, [])

  useEffect(() => {
    if (isOpen) {
      refreshSaves()
      setBackupNotice(null)
    }
  }, [isOpen, refreshSaves])

  const handleExportBackup = useCallback(() => {
    const bundle = buildSaveBundle()
    if (bundle.slots.length === 0 && !bundle.autosave) {
      setBackupNotice({ text: '当前没有可导出的存档', tone: 'warn' })
      return
    }
    try {
      const json = serializeSaveBundle(bundle)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const link = document.createElement('a')
      link.href = url
      link.download = `chongzhen-save-backup-${stamp}.json`
      link.click()
      URL.revokeObjectURL(url)
      const total = bundle.slots.length + (bundle.autosave ? 1 : 0)
      setBackupNotice({ text: `已导出 ${total} 份存档备份`, tone: 'ok' })
    } catch (error) {
      console.error('[save] 导出备份失败：', error)
      setBackupNotice({ text: '导出失败，请检查浏览器是否允许下载文件', tone: 'warn' })
    }
  }, [])

  const formatBundleSummary = (summary: SaveBundleSummary): string => {
    const parts: string[] = []
    if (summary.autosave) {
      parts.push(`自动存档：${summary.autosave.playerName} · ${summary.autosave.year}年${summary.autosave.month}月`)
    }
    for (const { slotId, preview } of summary.slots) {
      parts.push(`槽位 ${slotId}：${preview.playerName} · ${preview.year}年${preview.month}月`)
    }
    return parts.join('；')
  }

  const handleImportFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > 6_000_000) {
      setBackupNotice({ text: '备份文件过大，已拒绝导入', tone: 'warn' })
      return
    }

    let text: string
    try {
      text = await file.text()
    } catch {
      setBackupNotice({ text: '无法读取该文件', tone: 'warn' })
      return
    }

    const parsed = parseSaveBundle(text)
    if (!parsed.ok) {
      setBackupNotice({ text: `导入失败：${parsed.error}`, tone: 'warn' })
      return
    }

    const ok = await confirm({
      title: '导入存档备份',
      message: `备份包含 ${parsed.summary.total} 份存档。`,
      detail: formatBundleSummary(parsed.summary),
      warning: '导入会覆盖同编号的手动槽位与自动存档；备份里没有的槽位保持原样。',
      confirmText: '导入',
      cancelText: '取消',
      variant: 'primary'
    })
    if (!ok) return

    const applied = applySaveBundle(parsed.bundle)
    refreshSaves()
    if (applied.ok) {
      const parts: string[] = []
      if (applied.importedSlots.length > 0) parts.push(`槽位 ${applied.importedSlots.join('、')}`)
      if (applied.autosaveImported) parts.push('自动存档')
      setBackupNotice({ text: `已导入：${parts.join(' / ')}。可从上方直接读取。`, tone: 'ok' })
    } else {
      setBackupNotice({ text: `部分导入失败：${applied.failures.join('、')}`, tone: 'warn' })
    }
  }, [confirm, refreshSaves])

  const handleDelete = useCallback(async (slotId: number) => {
    const slot = slots.find(s => s.id === slotId)
    const ok = await confirm({
      title: '焚毁存档',
      message: `确定要删除槽位 ${slotId} 的存档吗？`,
      detail: slot?.preview
        ? `${slot.preview.playerName} · ${slot.preview.year}年${slot.preview.month}月 · ${slot.preview.rank}`
        : undefined,
      warning: '删除后无法恢复，该进度将永久消失。',
      confirmText: '删除',
      cancelText: '保留',
      variant: 'danger'
    })
    if (!ok) return
    deleteSaveSlot(slotId)
    refreshSaves()
  }, [slots, confirm, refreshSaves])

  const handleDeleteAutosave = useCallback(async () => {
    const ok = await confirm({
      title: '焚毁存档',
      message: '确定要删除自动存档吗？',
      warning: '删除后无法恢复，最近进度将丢失。',
      confirmText: '删除',
      cancelText: '保留',
      variant: 'danger'
    })
    if (!ok) return
    deleteAutosave()
    setAutosaveArchive(null)
  }, [confirm])

  // 对话框无障碍语义 + ESC / Tab 焦点陷阱 / 焦点还原 / 滚动锁
  // 遮罩点击改为 target 守卫：确认弹窗 portal 到 body，但 React 合成事件仍会沿 React 树冒泡上来
  const { getModalProps, dialogRef, titleId, handleOverlayClick } = useModal({
    open: isOpen,
    onClose
  })

  if (!isOpen) return null

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const formatPlayTime = (seconds?: number) => {
    if (!seconds) return ''
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}小时${minutes}分`
    }
    return `${minutes}分钟`
  }

  const formatSaveStamp = (isoString: string) => formatDate(isoString).replace(/^\d{4}\//, '')

  // 槽位压缩成三行：姓名 + 生涯摘要 / 文官 + 年月 + 官职 + 存档时间 / 右侧读取箭头。
  // 头部仍保留槽位编号与删除，整个内容区仍是一个 button。
  const renderSlotContent = (
    preview: SavePreview,
    archive: TitleArchiveSnapshot | null,
    onClick: () => void,
    ariaLabel: string,
    actionText: string
  ) => (
    <button
      type="button"
      className="slot-content"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <div className="slot-summary">
        <div className="slot-name-row">
          <span className="save-slot-name">{preview.playerName}</span>
          {archive && (
            <span className="slot-archive-line">{formatArchiveSummary(archive)}</span>
          )}
        </div>
        <div className="slot-meta-line">
          <span className="save-slot-title">{preview.title}</span>
          <span className="slot-meta-sep" aria-hidden="true">·</span>
          <span>{preview.year}年{preview.month}月</span>
          <span className="slot-meta-sep" aria-hidden="true">·</span>
          <span>{preview.rank}</span>
          <span className="slot-meta-sep" aria-hidden="true">·</span>
          <span className="slot-meta-stamp">存档 {formatSaveStamp(preview.savedAt)}</span>
          {preview.playTime ? (
            <>
              <span className="slot-meta-sep" aria-hidden="true">·</span>
              <span className="slot-meta-playtime">游玩 {formatPlayTime(preview.playTime)}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="slot-action" aria-hidden="true">
        <span className="action-text">{actionText}</span>
        <span className="arrow">→</span>
      </div>
    </button>
  )

  const autosavePresent = autosaveArchive !== null
  const autosavePreview = autosaveArchive?.preview ?? null

  // 读档模式且本机一份存档都没有时，唯一能做的事就是导入备份；
  // 标题屏现在常驻「读取存档」，新机器点进来必须先看到这句，而不是四个空槽。
  const hasAnyLocalSave = autosavePresent || slots.some(s => !!s.preview)

  // 自动存档槽位 UI（独立于手动 1/2/3 槽，单独排在最上方）
  const renderAutosaveSlot = () => (
    <div className={`save-slot autosave-slot ${autosavePresent ? 'has-data' : 'empty'}`}>
      <div className="slot-header">
        <span className="slot-number autosave-label">自动存档</span>
        {autosavePresent && (
          <button
            className="delete-btn"
            aria-label="删除自动存档"
            onClick={(e) => { e.stopPropagation(); handleDeleteAutosave() }}
          >
            删
          </button>
        )}
      </div>

      {autosavePresent && autosavePreview ? (
        mode === 'load' ? (
          renderSlotContent(
            autosavePreview,
            autosaveArchive,
            () => onLoadAutosave?.(),
            `读取自动存档：${autosavePreview.playerName} · ${autosavePreview.year}年${autosavePreview.month}月 · ${autosavePreview.rank}${autosaveArchive ? ` · ${formatArchiveSummary(autosaveArchive)}` : ''}`,
            '读取'
          )
        ) : (
          /* 存档模式下自动存档不可手动覆盖：保留原来的非交互信息块 */
          <div className="slot-content empty-slot">
            <div className="empty-icon" aria-hidden="true" />
            <div className="empty-text">自动保存中（不可手动覆盖）</div>
          </div>
        )
      ) : (
        <div className="slot-content empty-slot">
          <div className="empty-icon" aria-hidden="true" />
          <div className="empty-text">
            {mode === 'save' ? '游戏中会自动保存进度' : '暂无自动存档'}
          </div>
        </div>
      )}

    </div>
  )

  const node = (
    <div className="save-slots-overlay" onClick={handleOverlayClick}>
      <div className="save-slots-modal" ref={dialogRef} {...getModalProps()}>
        <div className="save-slots-header">
          <h2 id={titleId}>{mode === 'save' ? '选择存档槽位' : '选择存档'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="关闭">×</button>
        </div>

        {mode === 'save' && currentData && (
          <div className="current-game-info">
            <span>当前进度：</span>
            <span className="highlight">{currentData.name}</span>
            <span>·</span>
            <span>{currentData.year}年{currentData.month}月</span>
            <span>·</span>
            <span>{currentData.rank}</span>
          </div>
        )}

        <div className={`save-slots-list${mode === 'load' && !hasAnyLocalSave ? ' save-slots-list--empty' : ''}`}>
          {mode === 'load' && !hasAnyLocalSave && (
            <div className="save-empty-hint">
              本机没有本地存档。换过浏览器或机器的话，可在下方「导入备份」恢复。
            </div>
          )}
          {renderAutosaveSlot()}
          {[1, 2, 3].map(slotId => {
            const slot = slots.find(s => s.id === slotId)
            const hasData = !!slot?.preview

            return (
              <div key={slotId} className={`save-slot ${hasData ? 'has-data' : 'empty'}`}>
                <div className="slot-header">
                  <span className="slot-number">槽位 {slotId}</span>
                  {hasData && (
                    <button
                      className="delete-btn"
                      aria-label={`删除槽位 ${slotId}`}
                      onClick={(e) => { e.stopPropagation(); handleDelete(slotId) }}
                    >
                      删
                    </button>
                  )}
                </div>

                {hasData && slot?.preview ? (
                  renderSlotContent(
                    slot.preview,
                    slot.archive,
                    () => onSelect(slotId),
                    `${mode === 'save' ? '覆盖' : '读取'}槽位 ${slotId}：${slot.preview.playerName} · ${slot.preview.year}年${slot.preview.month}月 · ${slot.preview.rank}${slot.archive ? ` · ${formatArchiveSummary(slot.archive)}` : ''}`,
                    mode === 'save' ? '覆盖' : '读取'
                  )
                ) : mode === 'save' ? (
                  <button
                    type="button"
                    className="slot-content empty-slot"
                    onClick={() => onSelect(slotId)}
                    aria-label={`保存到空槽位 ${slotId}`}
                  >
                    <div className="empty-icon" aria-hidden="true" />
                    <div className="empty-text">点击保存到该槽位</div>
                  </button>
                ) : (
                  <div className="slot-content empty-slot">
                    <div className="empty-icon" aria-hidden="true" />
                    <div className="empty-text">暂无存档</div>
                  </div>
                )}

              </div>
            )
          })}
        </div>

        <div className="save-backup-bar">
          <button type="button" className="save-backup-btn" onClick={handleExportBackup}>
            导出备份
          </button>
          {mode === 'load' && (
            <button
              type="button"
              className="save-backup-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              导入备份
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="save-backup-file"
            onChange={handleImportFile}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
        {backupNotice && (
          <p
            className={`save-backup-notice save-backup-notice--${backupNotice.tone}`}
            role="status"
            aria-live="polite"
          >
            {backupNotice.text}
          </p>
        )}
      </div>
      {confirmDialog}
    </div>
  )

  return createPortal(node, document.body)
}
