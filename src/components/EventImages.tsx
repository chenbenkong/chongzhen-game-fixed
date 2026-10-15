import { useState, useEffect, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getImagesByEvent, deleteImage, type SavedImage } from '../services/imageStorage'
import { useConfirm } from '../hooks/useConfirm'
import './EventImages.css'

interface EventImagesProps {
  eventId: string
  eventTitle: string
  /** "为此事件作丹青" 按钮回调 */
  onGenerateClick?: () => void
}

/** 缩略图卡片 */
const Thumb = memo(function Thumb({
  item,
  onView,
  onDelete
}: {
  item: SavedImage
  onView: () => void
  onDelete: () => void
}) {
  const src = item.url || ''
  return (
    <div className="ei-thumb">
      <div className="ei-thumb-img" onClick={onView} title="点击查看">
        {src ? (
          <img src={src} alt="事件插图" loading="lazy" decoding="async" />
        ) : (
          <span className="ei-thumb-placeholder">图载失败</span>
        )}
      </div>
      <button className="ei-thumb-delete" onClick={onDelete} title="删除此画">删</button>
    </div>
  )
})

/** 简易全屏查看 */
function Viewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  const node = (
    <div className="ei-viewer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <button className="ei-viewer-close" onClick={onClose} title="关闭 (Esc)"></button>
      <img className="ei-viewer-image" src={src} alt="事件插图" />
    </div>
  )
  return createPortal(node, document.body)
}

export default function EventImages({ eventId, onGenerateClick }: EventImagesProps) {
  const [images, setImages] = useState<SavedImage[]>([])
  const [viewerSrc, setViewerSrc] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  // 每次 eventId 变化或 mounted 时重读
  const reload = useCallback(() => {
    if (!eventId) {
      setImages([])
      return
    }
    setImages(getImagesByEvent(eventId))
  }, [eventId])

  useEffect(() => {
    reload()
  }, [reload])

  // 监听 storage 事件（其他 tab 删除/新增）
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'chongzhen_image_gallery_v1') reload()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [reload])

  // 暴露 reload 给 ImageGenerator：组件挂载/卸载时通过 window 事件通知
  useEffect(() => {
    const handler = () => reload()
    window.addEventListener('imageGalleryChanged', handler)
    return () => window.removeEventListener('imageGalleryChanged', handler)
  }, [reload])

  if (!eventId) return null

  const handleDelete = async (id: string) => {
    // 删掉之前必须确认：这些丹青是玩家花额度生成出来的作品，
    // 点一下缩略图边上的「删」就永久消失、且没有任何撤销途径。
    // 本组件早就引入了 useConfirm 并把 dialog 渲染出来了，只是从来没调用 confirm。
    const ok = await confirm({
      title: '删除丹青',
      message: '确定删除这幅丹青吗？',
      detail: '删除后无法恢复，且生成它所消耗的额度不会退回。',
      variant: 'danger',
      confirmText: '删除',
      cancelText: '保留'
    })
    if (!ok) return
    deleteImage(id)
    reload()
    // 通知其他监听器（ImageGenerator 画册）刷新
    window.dispatchEvent(new CustomEvent('imageGalleryChanged'))
  }

  const openViewer = (item: SavedImage) => {
    const src = item.url || ''
    if (src) setViewerSrc(src)
  }

  return (
    <div className="event-images">
      <div className="ei-header">
        <span className="ei-title">事件插图</span>
        <span className="ei-count">（{images.length}）</span>
        {onGenerateClick && (
          <button className="ei-generate-btn" onClick={onGenerateClick} title="为该事件生成新插图">
            <span>绘</span> 丹青此景
          </button>
        )}
        {images.length > 4 && (
          <button className="ei-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起' : `展开全部 (${images.length})`}
          </button>
        )}
      </div>

      {images.length === 0 ? (
        <div className="ei-empty">
          尚无此景丹青
          {onGenerateClick && (
            <button className="ei-empty-btn" onClick={onGenerateClick}>立即作丹青 →</button>
          )}
        </div>
      ) : (
        <div className={`ei-grid ${expanded ? 'expanded' : ''}`}>
          {(expanded ? images : images.slice(0, 4)).map(item => (
            <Thumb
              key={item.id}
              item={item}
              onView={() => openViewer(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}

      {viewerSrc && <Viewer src={viewerSrc} onClose={() => setViewerSrc(null)} />}

      {confirmDialog}
    </div>
  )
}
