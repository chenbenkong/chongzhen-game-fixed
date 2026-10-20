import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  generateImage,
  enhancePrompt,
  hasImageApiKey,
  type ImageSize,
  type ImageRatio,
  type ImageGenResult
} from '../services/imageService'
import { saveImage,
  getAllImages,
  deleteImage,
  clearAllImages,
  type SavedImage
} from '../services/imageStorage'
import { generateEventPrompt } from '../services/eventPromptGenerator'
import { useConfirm } from '../hooks/useConfirm'
import './ImageGenerator.css'

interface ImageGeneratorProps {
  isOpen: boolean
  onClose: () => void
  context: {
    playerName: string
    playerCourtesyName: string
    hometown: string
    age: number
    origin: string
    rank: string
    degree: string
    year: number
    month: number
    currentEventId?: string
    currentEventTitle?: string
    currentEventDescription?: string
    currentEventBackground?: string
    currentChoices?: string[]
  }
}

interface RatioPreset {
  value: ImageRatio
  label: string
  sub: string
}

const RATIO_PRESETS: RatioPreset[] = [
  { value: '16:9', label: '横卷', sub: '16:9 场景' },
  { value: '9:16', label: '立轴', sub: '9:16 人物' },
  { value: '1:1', label: '方幅', sub: '1:1 章回' },
  { value: '3:4', label: '肖像', sub: '3:4 立绘' },
  { value: '4:3', label: '宽幅', sub: '4:3 写实' }
]

const SIZE_PRESETS: { value: ImageSize; label: string; sub: string }[] = [
  { value: '1K', label: '1K', sub: '1024' },
  { value: '2K', label: '2K', sub: '2048' },
  { value: '3K', label: '3K', sub: '3072' }
]

/** 历史卡片：memo + lazy 避免重复加载 */
const HistoryCard = memo(function HistoryCard({
  item,
  onClick,
  onDelete
}: {
  item: SavedImage
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const src = item.url || ''
  return (
    <div className="ig-history-card">
      <div className="ig-history-card-img" onClick={onClick} title="点击查看">
        <img src={src} alt="生成结果" loading="lazy" />
      </div>
      {item.eventTitle && (
        <div className="ig-history-card-event" title={item.eventTitle}>{item.eventTitle}</div>
      )}
      <div className="ig-history-meta">
        <span className="ig-history-ratio">{item.ratio}</span>
        <span className="ig-history-time">{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <button className="ig-history-delete" onClick={onDelete} title="删除此画">删</button>
    </div>
  )
})

/** 全屏查看器（Portal 化：脱离父组件的 stacking context，避免 z-index / overflow 问题） */
function ImageViewer({
  src,
  prompt,
  eventTitle,
  onClose,
  onDownload
}: {
  src: string
  prompt: string
  eventTitle?: string
  onClose: () => void
  onDownload: () => void
}) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // Esc 关闭（绑定 window）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // 打开时锁 body 滚动（避免背景也跟着滚）
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // 关闭按钮的 click handler（用 ref 确保总是最新）
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const handleClose = useCallback(() => onCloseRef.current(), [])

  const node = (
    <div
      className="ig-viewer-overlay"
      onClick={(e) => {
        // 只在点 overlay 自身时关闭，点子元素不关闭
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="ig-viewer-panel">
        <div className="ig-viewer-header">
          <div className="ig-viewer-title">
            {eventTitle && <span className="ig-viewer-event">{eventTitle}</span>}
            <span className="ig-viewer-prompt">{prompt.slice(0, 60)}{prompt.length > 60 ? '…' : ''}</span>
          </div>
          <div className="ig-viewer-actions">
            <button className="ig-viewer-btn" onClick={(e) => { e.stopPropagation(); onDownload() }}>存 保存</button>
            <button className="ig-viewer-btn close" onClick={(e) => { e.stopPropagation(); handleClose() }}>关闭 (Esc)</button>
          </div>
        </div>
        <div className="ig-viewer-image-wrap" onClick={(e) => e.stopPropagation()}>
          {!imgLoaded && !imgError && (
            <div className="ig-viewer-loading">
              <div className="ig-viewer-loading-spinner" />
              <div>画卷展开中…</div>
            </div>
          )}
          {imgError ? (
            <div className="ig-viewer-error">
              <div className="ig-viewer-error-icon"></div>
              <div>图片加载失败</div>
              <div className="ig-viewer-error-url">{src.slice(0, 60)}…</div>
              <button className="ig-viewer-btn" onClick={onDownload}>下载源文件</button>
            </div>
          ) : (
            <img
              className={`ig-viewer-image ${imgLoaded ? 'loaded' : ''}`}
              src={src}
              alt="丹青"
              decoding="async"
              loading="eager"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              draggable={false}
            />
          )}
        </div>
      </div>
    </div>
  )

  // Portal 到 body，脱离父组件 stacking context
  return createPortal(node, document.body)
}

export default function ImageGenerator({ isOpen, onClose, context }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<ImageSize>('2K')
  const [ratio, setRatio] = useState<ImageRatio>('16:9')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [error, setError] = useState('')
  const [current, setCurrent] = useState<SavedImage | null>(null)
  const [gallery, setGallery] = useState<SavedImage[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [viewerSrc, setViewerSrc] = useState<{ src: string; prompt: string; eventTitle?: string } | null>(null)
  /** 控制 Tab 切换：'generate'（绘制）| 'gallery'（画册） */
  const [tab, setTab] = useState<'generate' | 'gallery'>('generate')
  /** 识别出的场景大类（用于在 UI 显示） */
  const [sceneName, setSceneName] = useState<string>('')

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 打开时从 localStorage 加载画册 + 默认聚焦输入
  useEffect(() => {
    if (isOpen) {
      setGallery(getAllImages())
      setTimeout(() => promptTextareaRef.current?.focus(), 250)
    }
  }, [isOpen])

  // 加载状态：每秒更新已耗时
  useEffect(() => {
    if (!isGenerating) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      setElapsed(0)
      return
    }
    const start = Date.now()
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 500)
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isGenerating])

  // 快捷 prompt 模板
  const buildQuickPrompt = useCallback((kind: 'event' | 'portrait' | 'court' | 'street'): { prompt: string; eventId?: string; eventTitle?: string; sceneName?: string } => {
    const name = context.playerName || '某'
    const courtesy = context.playerCourtesyName ? `（字${context.playerCourtesyName}）` : ''
    const era = `崇祯${context.year}年${context.month}月`

    if (kind === 'event') {
      // 智能事件场景生成：根据标题/描述识别场景大类，每类 2-3 模板 + 元素池随机
      const { prompt, sceneName } = generateEventPrompt({
        playerName: name,
        playerCourtesyName: context.playerCourtesyName,
        rank: context.rank,
        degree: context.degree,
        age: context.age,
        origin: context.origin,
        hometown: context.hometown,
        year: context.year,
        month: context.month,
        currentEventTitle: context.currentEventTitle || '',
        currentEventDescription: context.currentEventDescription || '',
        currentEventBackground: context.currentEventBackground || '',
      })
      return {
        prompt,
        eventId: context.currentEventId,
        eventTitle: context.currentEventTitle,
        sceneName,
      }
    }
    const map: Record<typeof kind, string> = {
      portrait: `${era}，${name}${courtesy}，${context.age}岁，${context.origin}出身，${context.degree}功名，明代官员装束（乌纱帽、圆领袍、束带、笏板），端坐于书房或衙署内，神情${context.degree === '进士' ? '儒雅自信' : '沉稳内敛'}，精细面部刻画，明代服饰花纹细节`,
      court: `${era}，紫禁城朝会场景，文武百官列队于太和殿前，崇祯帝高坐龙椅，宦官执拂尘侍立，日光穿透云层，气势恢宏，明代宫廷建筑细节，飞檐斗拱，琉璃瓦当`,
      street: `${era}，${context.hometown || '江南'}城郭街市，商贩叫卖，行人往来，客栈茶楼林立，远处城墙巍峨，街角有告示榜与算命摊，明代市井生活百态，黄昏暖光，烟火气十足`,
    }
    return { prompt: map[kind] }
  }, [context])

  const fillTemplate = useCallback((kind: 'event' | 'portrait' | 'court' | 'street') => {
    const { prompt: p, sceneName: sn } = buildQuickPrompt(kind)
    setPrompt(p)
    setSceneName(sn || '')
    setError('')
  }, [buildQuickPrompt])

  // 持久化保存并刷新画册
  const persistCurrent = useCallback((result: ImageGenResult, templateKind: string, eventId?: string, eventTitle?: string) => {
    // 关键：主动丢弃 b64Json，只存 URL。
    // 原因：base64 编码后体积是原始 PNG 的 1.37 倍（2K 图 1-3MB，3K 可达 5-10MB），
    // 多个 base64 存 localStorage 会撑爆 5-10MB 容量限制，画册一次性渲染还会阻塞主线程。
    const saved = saveImage({
      userPrompt: prompt,
      fullPrompt: result.revisedPrompt || enhancePrompt(prompt, {
        era: `明崇祯${context.year}年${context.month}月`,
        style: '中国工笔重彩与电影级古风写实结合'
      }),
      url: result.url,
      // b64Json: undefined —— 显式不存
      size,
      ratio,
      eventId,
      eventTitle,
      year: context.year,
      month: context.month,
      templateKind
    })
    setCurrent(saved)
    setGallery(getAllImages())
  }, [prompt, size, ratio, context.year, context.month])

  const handleGenerate = useCallback(async () => {
    const text = prompt.trim()
    if (!text || isGenerating) return
    if (!hasImageApiKey()) {
      setError('请先配置 API Key（在"谋士对谈"中可设置）')
      return
    }

    setIsGenerating(true)
    setError('')
    setCurrent(null)
    setProgressText('正在召唤画师……')

    abortRef.current = new AbortController()

    const phaseTimer = window.setTimeout(() => setProgressText('画师构思构图……'), 8_000)
    const phaseTimer2 = window.setTimeout(() => setProgressText('渲染细节中……'), 25_000)

    try {
      const finalPrompt = enhancePrompt(text, {
        era: `明崇祯${context.year}年${context.month}月`,
        style: '中国工笔重彩与电影级古风写实结合'
      })
      const result = await generateImage(
        { prompt: finalPrompt, size, ratio },
        abortRef.current.signal
      )
      // 推断模板类型（用 prompt 关键词简单判断）
      let templateKind = 'custom'
      let eventId: string | undefined
      let eventTitle: string | undefined
      if (text.includes(context.currentEventTitle || '__never__')) {
        templateKind = 'event'
        eventId = context.currentEventId
        eventTitle = context.currentEventTitle
      } else if (text.includes('紫禁城朝会')) {
        templateKind = 'court'
      } else if (text.includes('明代官员装束') || text.includes('乌纱帽')) {
        templateKind = 'portrait'
      } else if (text.includes('城郭街市') || text.includes('市井')) {
        templateKind = 'street'
      }
      persistCurrent(result, templateKind, eventId, eventTitle)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('已取消生成')
      } else {
        const msg = err instanceof Error ? err.message : '生成失败'
        let display = msg
        if (msg.includes('(401)') || msg.includes('(403)')) {
          display = 'API Key 无效或已过期，请在"谋士"中重新设置'
        } else if (msg.includes('(429)')) {
          display = '请求过于频繁，请稍候片刻'
        } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          display = '网络连接失败，请检查网络后重试'
        } else if (msg.includes('超时')) {
          display = '图像生成超时（120s），请稍后重试或降低清晰度'
        }
        setError(display)
      }
    } finally {
      window.clearTimeout(phaseTimer)
      window.clearTimeout(phaseTimer2)
      setIsGenerating(false)
      setProgressText('')
      abortRef.current = null
    }
  }, [prompt, isGenerating, size, ratio, context.year, context.month, context.currentEventTitle, context.currentEventId, persistCurrent])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleRedo = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  const handleDownload = useCallback(() => {
    if (!current) return
    const src = current.url || ''
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = `崇祯丹青_${Date.now()}.png`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [current])

  const recallFromHistory = useCallback((item: SavedImage) => {
    setCurrent(item)
    setTab('generate')
  }, [])

  const openViewer = useCallback((item: SavedImage) => {
    const src = item.url || ''
    if (!src) return
    setViewerSrc({ src, prompt: item.userPrompt, eventTitle: item.eventTitle })
  }, [])

  const { confirm, dialog: confirmDialog } = useConfirm()

  const handleDelete = useCallback(async (item: SavedImage) => {
    const ok = await confirm({
      title: '焚毁此画',
      message: '确定要焚毁此卷吗？此操作不可恢复。',
      detail: item.eventTitle ? `关联事件：${item.eventTitle}` : (item.userPrompt.slice(0, 60) + (item.userPrompt.length > 60 ? '…' : '')),
      warning: '焚毁后无法复原',
      confirmText: '焚毁',
      cancelText: '保留'
    })
    if (!ok) return
    deleteImage(item.id)
    setGallery(getAllImages())
    if (current?.id === item.id) setCurrent(null)
  }, [current, confirm])

  const handleClearAll = useCallback(async () => {
    const ok = await confirm({
      title: '焚尽卷轴阁',
      message: `确定要焚毁全部 ${gallery.length} 卷存档吗？此操作不可恢复。`,
      warning: '所有画卷将被永久焚毁',
      confirmText: '全部焚毁',
      cancelText: '保留'
    })
    if (!ok) return
    clearAllImages()
    setGallery([])
    setCurrent(null)
  }, [gallery.length, confirm])

  if (!isOpen) return null

  const currentSrc = current?.url || ''

  const node = (
    <div className="ig-overlay" onClick={onClose}>
      <div className="ig-panel" onClick={e => e.stopPropagation()}>
        <div className="ig-header">
          <div className="ig-header-title">
            <span className="ig-header-icon">绘</span>
            <span>丹青画卷</span>
          </div>
          <div className="ig-tab-row">
            <button
              className={`ig-tab ${tab === 'generate' ? 'active' : ''}`}
              onClick={() => setTab('generate')}
            >
              绘制
            </button>
            <button
              className={`ig-tab ${tab === 'gallery' ? 'active' : ''}`}
              onClick={() => setTab('gallery')}
            >
              画册 · {gallery.length}
            </button>
          </div>
          <div className="ig-header-actions">
            <button className="ig-header-btn" onClick={onClose} title="关闭">关</button>
          </div>
        </div>

        <div className="ig-body">
          {tab === 'generate' && (
            <>
              <div className="ig-input-section">
                <div className="ig-label-row">
                  <div className="ig-label">场景描绘</div>
                  {sceneName && (
                    <div className="ig-scene-tag" title="智能识别的事件场景">
                      <span className="ig-scene-icon">◆</span>
                      <span>{sceneName}</span>
                    </div>
                  )}
                </div>
                <textarea
                  ref={promptTextareaRef}
                  className="ig-prompt-input"
                  placeholder="例：崇祯元年元宵夜，金陵秦淮河畔灯火通明，画舫穿梭其间，士子佳人凭栏远望……"
                  value={prompt}
                  onChange={e => { setPrompt(e.target.value); if (sceneName) setSceneName('') }}
                  disabled={isGenerating}
                  rows={3}
                />
                <div className="ig-template-row">
                  <span className="ig-template-label">模板：</span>
                  {context.currentEventTitle && (
                    <button className="ig-template-btn" onClick={() => fillTemplate('event')} disabled={isGenerating}>
                      当前事件
                    </button>
                  )}
                  <button className="ig-template-btn" onClick={() => fillTemplate('portrait')} disabled={isGenerating}>
                    角色立绘
                  </button>
                  <button className="ig-template-btn" onClick={() => fillTemplate('court')} disabled={isGenerating}>
                    紫禁朝会
                  </button>
                  <button className="ig-template-btn" onClick={() => fillTemplate('street')} disabled={isGenerating}>
                    街头巷陌
                  </button>
                </div>

                <div className="ig-options">
                  <div className="ig-option-group">
                    <div className="ig-option-label">画幅</div>
                    <div className="ig-ratio-row">
                      {RATIO_PRESETS.map(p => (
                        <button
                          key={p.value}
                          className={`ig-ratio-btn ${ratio === p.value ? 'active' : ''}`}
                          onClick={() => setRatio(p.value)}
                          disabled={isGenerating}
                        >
                          <span className="ig-ratio-label">{p.label}</span>
                          <span className="ig-ratio-sub">{p.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ig-option-group">
                    <div className="ig-option-label">清晰度</div>
                    <div className="ig-size-row">
                      {SIZE_PRESETS.map(s => (
                        <button
                          key={s.value}
                          className={`ig-size-btn ${size === s.value ? 'active' : ''}`}
                          onClick={() => setSize(s.value)}
                          disabled={isGenerating}
                        >
                          <span className="ig-size-label">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {error && <div className="ig-error">{error}</div>}

                <div className="ig-action-row">
                  {isGenerating ? (
                    <button className="ig-generate-btn stop" onClick={handleCancel}>
                      停止生成 · {elapsed}s
                    </button>
                  ) : (
                    <button
                      className="ig-generate-btn"
                      onClick={handleGenerate}
                      disabled={!prompt.trim()}
                    >
                      <span className="ig-generate-icon"></span>
                      <span>落笔生花</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="ig-display-section">
                {isGenerating ? (
                  <div className="ig-loading">
                    <div className="ig-loading-icon">
                      <span className="ig-loading-brush">笔</span>
                    </div>
                    <div className="ig-loading-text">{progressText}</div>
                    <div className="ig-loading-hint">图像生成需 30-120 秒，请耐心等候</div>
                    <div className="ig-loading-bar">
                      <div className="ig-loading-bar-inner" />
                    </div>
                  </div>
                ) : current ? (
                  <div className="ig-result">
                    <div className="ig-result-image-wrap" onClick={() => openViewer(current)}>
                      <img className="ig-result-image" src={currentSrc} alt="AI 生成的明末场景" />
                      <div className="ig-result-zoom-hint">点击放大</div>
                    </div>
                    {current.eventTitle && (
                      <div className="ig-result-event-tag">{current.eventTitle}</div>
                    )}
                    <div className="ig-result-actions">
                      <button className="ig-result-btn" onClick={handleRedo} disabled={!prompt.trim()}>
                        <span>重</span> 重画一张
                      </button>
                      <button className="ig-result-btn primary" onClick={handleDownload}>
                        <span>存</span> 保存到本地
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ig-empty">
                    <div className="ig-empty-icon">绘</div>
                    <div className="ig-empty-text">
                      输入场景描述，或选择下方模板
                      <br />
                      画师将依你之言，落笔生花
                    </div>
                    <div className="ig-empty-tip">
                      提示：详细描述人物、地点、时间、动作、氛围，生成效果更佳
                    </div>
                  </div>
                )}
              </div>

              {/* 最近存档（最近 4 张） */}
              {gallery.length > 0 && (
                <div className="ig-recent-section">
                  <div className="ig-recent-header">
                    <span className="ig-recent-label">最近存档</span>
                    <button className="ig-recent-more" onClick={() => setTab('gallery')}>
                      查看全部 ({gallery.length}) →
                    </button>
                  </div>
                  <div className="ig-recent-row">
                    {gallery.slice(0, 4).map(item => {
                      const src = item.url || ''
                      return (
                        <div key={item.id} className="ig-recent-card" onClick={() => recallFromHistory(item)} title={item.userPrompt}>
                          <img src={src} alt="存档" loading="lazy" decoding="async" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'gallery' && (
            <div className="ig-gallery-section">
              {gallery.length === 0 ? (
                <div className="ig-empty">
                  <div className="ig-empty-icon">册</div>
                  <div className="ig-empty-text">画册空空如也</div>
                  <div className="ig-empty-tip">点击"绘制"标签，开始你的第一幅丹青</div>
                </div>
              ) : (
                <>
                  <div className="ig-gallery-header">
                    <span className="ig-gallery-label">共 {gallery.length} 幅存档（按时间倒序）</span>
                    <button className="ig-gallery-clear" onClick={handleClearAll}>清空全部</button>
                  </div>
                  <div className="ig-gallery-grid">
                    {gallery.map(item => (
                      <HistoryCard
                        key={item.id}
                        item={item}
                        onClick={() => openViewer(item)}
                        onDelete={(e) => {
                          e.stopPropagation()
                          handleDelete(item)
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 全屏查看器 */}
        {viewerSrc && (
          <ImageViewer
            src={viewerSrc.src}
            prompt={viewerSrc.prompt}
            eventTitle={viewerSrc.eventTitle}
            onClose={() => setViewerSrc(null)}
            onDownload={() => {
              const a = document.createElement('a')
              a.href = viewerSrc.src
              a.download = `崇祯丹青_${Date.now()}.png`
              a.target = '_blank'
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
            }}
          />
        )}

        {confirmDialog}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
