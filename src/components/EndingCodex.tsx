// 结局图鉴组件：显示游戏中所有结局
// 真实可触发的结局已在 BoundaryEventManager 注册，触发条件由 GameEvent.conditions 编译

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GameEvent } from '../types/event'
import { allEndingEvents } from '../data/events/ending'
import { ENDING_TILE_IDS, resolveEndingTileId } from '../data/endingRegistry'
import { getReachedEndings, getUnlockedAchievements } from '../types/achievement'
import { ENDING_ARCHETYPES, EndingArchetype } from '../utils/endingSystem'
import { useModal } from '../hooks/useModal'
import Icon from './Icon'
import './EndingCodex.css'

interface EndingCodexProps {
  isOpen: boolean
  onClose: () => void
}

type CategoryKey = keyof typeof ENDING_ARCHETYPES

// 8 个 tier → 颜色基调
const TIER_TONE: Record<string, string> = {
  legendary: 'tone-legendary',
  saintly: 'tone-saintly',
  bittersweet: 'tone-bittersweet',
  tragic: 'tone-tragic',
  dark: 'tone-dark',
  controversial: 'tone-controversial',
  mysterious: 'tone-mysterious',
  redemptive: 'tone-redemptive'
}

const TIER_LABEL: Record<string, string> = {
  legendary: '传奇',
  saintly: '圣贤',
  bittersweet: '苦乐',
  tragic: '悲剧',
  dark: '黑暗',
  controversial: '争议',
  mysterious: '神秘',
  redemptive: '救赎'
}

/**
 * 图鉴「已达成」的唯一推导口径。做成纯函数是为了它能被单测直接钉住 ——
 * 这一层原本是组件 useEffect 里的一段字符串拼接，猜错的代价是 44 格里 10 格
 * 永远灰、破产那格达成过也永远灰，而且**不会有任何报错**。
 *
 * 两个数据源，缺一不可：
 *  1. 结局成就。id 形如 `ending_xxx_done`，但**不能直接砍掉 `_done` 就当格子 id**
 *     —— 破产那格注册 id 是 `triggerable_bankrupt`，要靠 data/endingRegistry 的别名换算。
 *  2. 存档里的达成记录（`AchievementData.reachedEndings`）。有 10 个格子没有任何
 *     成就条目（全是边界/阈值结局，Steam 的 100 条上限已经用满），只读成就它们永远是灰的。
 */
export function buildUnlockedTileIndex(
  unlockedAchievements: Array<{ id: string; unlockTime?: string }>,
  reachedEndings: Record<string, string>
): { tileIds: Set<string>; times: Record<string, string> } {
  const tileIds = new Set<string>()
  const times: Record<string, string> = {}

  for (const a of unlockedAchievements) {
    if (!(a.id.startsWith('ending_') && a.id.endsWith('_done'))) continue
    const tileId = resolveEndingTileId(a.id.replace(/_done$/, ''))
    if (!tileId) continue
    tileIds.add(tileId)
    if (a.unlockTime && !times[tileId]) times[tileId] = a.unlockTime
  }

  for (const [tileId, at] of Object.entries(reachedEndings)) {
    if (!ENDING_TILE_IDS.includes(tileId)) continue
    tileIds.add(tileId)
    if (!times[tileId]) times[tileId] = at
  }

  return { tileIds, times }
}

export default function EndingCodex({ isOpen, onClose }: EndingCodexProps) {
  const [endings] = useState<GameEvent[]>(allEndingEvents)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('personal_fate')
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [unlockTimes, setUnlockTimes] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<GameEvent | null>(null)

  // 详情弹窗的初始焦点（关闭按钮）
  const detailCloseRef = useRef<HTMLButtonElement>(null)

  // 图鉴主弹窗：对话框语义 + ESC + Tab 焦点陷阱 + 焦点还原 + 滚动锁
  const {
    getModalProps: getCodexModalProps,
    dialogRef: codexDialogRef,
    titleId: codexTitleId,
    handleOverlayClick: handleCodexOverlayClick
  } = useModal({ open: isOpen, onClose })

  // 详情弹窗（叠在图鉴之上）：同样需要完整语义，并指定初始焦点
  const {
    getModalProps: getDetailModalProps,
    dialogRef: detailDialogRef,
    titleId: detailTitleId,
    handleOverlayClick: handleDetailOverlayClick
  } = useModal({
    open: isOpen && detail !== null,
    onClose: () => setDetail(null),
    initialFocusRef: detailCloseRef
  })

  useEffect(() => {
    if (!isOpen) return
    const { tileIds, times } = buildUnlockedTileIndex(getUnlockedAchievements(), getReachedEndings())
    setUnlockedIds(tileIds)
    setUnlockTimes(times)
  }, [isOpen])

  if (!isOpen) return null

  // 按 category 分组
  const byCategory = endings.reduce((acc, e) => {
    const cat = (e.endingConfig?.category || 'special') as CategoryKey
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(e)
    return acc
  }, {} as Record<CategoryKey, GameEvent[]>)

  // 当前类别下按 tier 分组
  const currentList = byCategory[activeCategory] || []
  const byTier = currentList.reduce((acc, e) => {
    const tier = e.endingConfig?.tier || 'mysterious'
    if (!acc[tier]) acc[tier] = []
    acc[tier].push(e)
    return acc
  }, {} as Record<string, GameEvent[]>)

  // 统计
  const totalCount = endings.length
  const unlockedCount = endings.filter(e => unlockedIds.has(e.id)).length
  const progressPercent = Math.round((unlockedCount / totalCount) * 100)

  const formatTime = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  const detailNode = detail ? (
    <div className="codex-detail-overlay" onClick={handleDetailOverlayClick}>
      <div
        className={`codex-detail-modal ${unlockedIds.has(detail.id) ? '' : 'locked'} ${TIER_TONE[detail.endingConfig?.tier || 'mysterious']}`}
        data-tile-id={detail.id}
        ref={detailDialogRef}
        {...getDetailModalProps()}
      >
        <button ref={detailCloseRef} className="codex-detail-close" onClick={() => setDetail(null)} aria-label="关闭">关</button>
        <div className="codex-detail-header">
          <div className="codex-detail-tier-tag">
            {TIER_LABEL[detail.endingConfig?.tier || ''] || '奇遇'}
          </div>
          <h3 className="codex-detail-title" id={detailTitleId}>{detail.title}</h3>
          <div className="codex-detail-meta">
            <span>{ENDING_ARCHETYPES[(detail.endingConfig?.category || 'special') as CategoryKey].name}</span>
            {unlockedIds.has(detail.id) ? (
              <span className="codex-detail-unlocked">已达成</span>
            ) : (
              <span className="codex-detail-locked">未达成</span>
            )}
            {unlockedIds.has(detail.id) && unlockTimes[detail.id] && (
              <span>· {formatTime(unlockTimes[detail.id])}</span>
            )}
          </div>
        </div>

        <div className="codex-detail-body">
          {detail.narrative?.quote && (
            <blockquote className="codex-detail-quote">
              「{detail.narrative.quote}」
              {detail.narrative.speaker && (
                <cite>—— {detail.narrative.speaker.title}·{detail.narrative.speaker.name}</cite>
              )}
            </blockquote>
          )}

          {detail.narrative?.background && (
            <div className="codex-detail-section">
              <h4>前 事</h4>
              <p>{detail.narrative.background}</p>
            </div>
          )}

          {detail.narrative?.situation && (
            <div className="codex-detail-section">
              <h4>当 下</h4>
              <p>{detail.narrative.situation}</p>
            </div>
          )}

          {detail.choices?.[0]?.result?.echo && (
            <div className="codex-detail-section">
              <h4>结 局 演 绎</h4>
              <pre className="codex-detail-echo">{detail.choices[0].result.echo}</pre>
            </div>
          )}

          {!unlockedIds.has(detail.id) && (
            <div className="codex-detail-hint">
              达成该结局后可解锁时间戳与详细演绎。
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null

  const node = (
    <div className="ending-codex-overlay" onClick={handleCodexOverlayClick}>
      <div className="ending-codex-modal" ref={codexDialogRef} {...getCodexModalProps()}>
        {/* 顶栏 */}
        <div className="codex-topbar">
          <div className="codex-title-area">
            <h2 className="codex-title" id={codexTitleId}>结 局 图 鉴</h2>
            <div className="codex-subtitle">史 馆 藏 本</div>
          </div>
          <div className="codex-progress">
            <div className="codex-progress-numbers">
              <span className="codex-progress-cur">{unlockedCount}</span>
              <span className="codex-progress-sep">/</span>
              <span className="codex-progress-total">{totalCount}</span>
            </div>
            <div className="codex-progress-bar">
              <div className="codex-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="codex-progress-label">已达成 {progressPercent}%</div>
          </div>
          <button className="codex-close-btn" onClick={onClose} aria-label="关闭结局图鉴">关</button>
        </div>

        {/* 卷首 tab（8 大卷） */}
        <div className="codex-tabs">
          {(Object.values(ENDING_ARCHETYPES) as EndingArchetype[]).map((arch) => {
            const list = byCategory[arch.key] || []
            const unlockedInCat = list.filter(e => unlockedIds.has(e.id)).length
            return (
              <button
                key={arch.key}
                className={`codex-tab ${activeCategory === arch.key ? 'active' : ''} tone-${arch.tone}`}
                onClick={() => setActiveCategory(arch.key as CategoryKey)}
                title={arch.intro}
              >
                <span className="codex-tab-icon"><Icon name={arch.iconName} size={16} /></span>
                <span className="codex-tab-label">{arch.name}</span>
                <span className="codex-tab-count">{unlockedInCat}/{list.length}</span>
              </button>
            )
          })}
        </div>

        {/* 当前卷内容 */}
        <div className="codex-content">
          <div className={`codex-cat-header tone-${ENDING_ARCHETYPES[activeCategory].tone}`}>
            <span className="codex-cat-icon">
              <Icon name={ENDING_ARCHETYPES[activeCategory].iconName} size={22} />
            </span>
            <span className="codex-cat-label">{ENDING_ARCHETYPES[activeCategory].name}</span>
            <span className="codex-cat-sub">· {ENDING_ARCHETYPES[activeCategory].intro}</span>
          </div>

          {Object.entries(byTier).map(([tier, list]) => (
            <div key={tier} className="codex-tier-block">
              <div className="codex-tier-header">
                <span className={`codex-tier-tag ${TIER_TONE[tier]}`}>{TIER_LABEL[tier] || tier}</span>
                <span className="codex-tier-count">
                  {list.filter(e => unlockedIds.has(e.id)).length} / {list.length}
                </span>
              </div>
              <div className="codex-card-grid">
                {list.map(e => {
                  const unlocked = unlockedIds.has(e.id)
                  // 解锁后只显示标题；未解锁时也展示标题但附加一行小字提示
                  const displayName = e.title
                  const displaySub = unlocked
                    ? (e.narrative?.situation || e.description || '')
                    : (e.description || e.narrative?.situation || '未达成 · 条件未知')
                  return (
                    <button
                      key={e.id}
                      type="button"
                      data-tile-id={e.id}
                      className={`codex-card ${unlocked ? 'unlocked' : 'locked'} ${TIER_TONE[tier]}`}
                      title={unlocked ? `${e.title} · 单击查看详情` : `${e.title}（未达成）· 单击查看详情`}
                      onClick={() => setDetail(e)}
                    >
                      <div className="codex-card-name">
                        {displayName}
                      </div>
                      {displaySub && (
                        <div className="codex-card-sub">{displaySub}</div>
                      )}
                      {unlocked && unlockTimes[e.id] && (
                        <div className="codex-card-time">{formatTime(unlockTimes[e.id])}</div>
                      )}
                      {!unlocked && (
                        <div className="codex-card-seal">未 解 锁</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {currentList.length === 0 && (
            <div className="codex-empty">此类别暂无结局</div>
          )}
        </div>

        {/* 底栏 */}
        <div className="codex-footer">
          <div className="codex-footer-hint">已达成高亮显示 · 灰色卡片代表尚未达成 · 单击卡片查看详情</div>
          <button className="codex-footer-close" onClick={onClose} aria-label="关闭结局图鉴">关 闭</button>
        </div>
      </div>

      {/* 详情弹窗 */}
      {detail && createPortal(detailNode, document.body)}
    </div>
  )

  return createPortal(node, document.body)
}
