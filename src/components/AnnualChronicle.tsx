import { createPortal } from 'react-dom'
import { useModal } from '../hooks/useModal'
import { toMingEraYear } from '../utils/endingSystem'
import type { AnnualChronicleSnapshot } from '../hooks/useAnnualChronicle'
import './AnnualChronicle.css'

interface AnnualChronicleProps {
  snapshot: AnnualChronicleSnapshot | null
  nextYear: number
  onClose: () => void
}

/**
 * 跨年时压上牌桌的一页年度史载。
 *
 * 它不是事件卡：没有选项、不改任何数值，只把「上一年朝局 / 玩家自己的落点 /
 * 志业走到哪一步」并到一页，给玩家一个明确的年度锚点。关闭后回到新年正月的事件。
 */
export default function AnnualChronicle({ snapshot, nextYear, onClose }: AnnualChronicleProps) {
  const open = snapshot !== null
  const { getModalProps, dialogRef, titleId, handleOverlayClick } = useModal({
    open,
    onClose,
    initialFocus: 'dialog'
  })

  if (!snapshot) return null

  const visibleRecords = snapshot.records.slice(-4)

  const node = (
    <div className="annual-chronicle-overlay" onClick={handleOverlayClick}>
      <div className="annual-chronicle" ref={dialogRef} {...getModalProps()}>
        <div className="annual-chronicle__topline">
          <span className="annual-chronicle__seal" aria-hidden="true">史</span>
          <span className="annual-chronicle__era">{toMingEraYear(snapshot.year)} · 岁末史载</span>
          <span className="annual-chronicle__serial">卷宗 · 一年一页</span>
        </div>

        <h2 className="annual-chronicle__headline" id={titleId}>{snapshot.headline}</h2>
        <p className="annual-chronicle__detail">{snapshot.detail}</p>

        <div className="annual-chronicle__stats" aria-label="年末落点">
          <div className="annual-chronicle__stat">
            <span className="annual-chronicle__stat-label">官位</span>
            <strong className="annual-chronicle__stat-value annual-chronicle__rank">
              {snapshot.rank.includes('·') ? (
                <>
                  <span className="annual-chronicle__rank-grade">
                    {snapshot.rank.slice(0, snapshot.rank.indexOf('·'))}
                  </span>
                  <span aria-hidden="true">·</span>
                  {snapshot.rank.slice(snapshot.rank.indexOf('·') + 1)}
                </>
              ) : snapshot.rank}
            </strong>
          </div>
          <div className="annual-chronicle__stat">
            <span className="annual-chronicle__stat-label">政绩</span>
            <strong className="annual-chronicle__stat-value">{snapshot.meritScore}</strong>
          </div>
          <div className="annual-chronicle__stat">
            <span className="annual-chronicle__stat-label">本年履历</span>
            <strong className="annual-chronicle__stat-value">{snapshot.records.length} 事</strong>
          </div>
          <div className="annual-chronicle__stat annual-chronicle__stat--career">
            <span className="annual-chronicle__stat-label">志业</span>
            {snapshot.career ? (
              <span className="annual-chronicle__career">
                <strong className="annual-chronicle__stat-value">
                  {snapshot.career.goal.name} {snapshot.career.completed}/3
                </strong>
                <span className="annual-chronicle__pips" aria-hidden="true">
                  {snapshot.career.milestones.map((milestone) => (
                    <span
                      key={milestone.label}
                      className={`annual-chronicle__pip ${milestone.done ? 'is-done' : ''}`}
                    />
                  ))}
                </span>
              </span>
            ) : (
              <strong className="annual-chronicle__stat-value annual-chronicle__stat-value--none">未立</strong>
            )}
          </div>
          <div className="annual-chronicle__stat">
            <span className="annual-chronicle__stat-label">史线</span>
            <strong className="annual-chronicle__stat-value">{snapshot.storylineName}</strong>
          </div>
        </div>

        <div className="annual-chronicle__records">
          <div className="annual-chronicle__records-head">
            <span>本年履历</span>
            <em>{snapshot.records.length > 4 ? `仅录最近四笔 · 共 ${snapshot.records.length} 事` : '按月份先后'}</em>
          </div>
          {visibleRecords.length > 0 ? (
            <ul className="annual-chronicle__record-list">
              {visibleRecords.map((record) => (
                <li key={record.id} className="annual-chronicle__record">
                  <span className="annual-chronicle__record-month">{record.month}月</span>
                  <span className="annual-chronicle__record-title">{record.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="annual-chronicle__record-empty">本年无事可载。案上只余空白。</p>
          )}
        </div>

        <div className="annual-chronicle__footer">
          <span className="annual-chronicle__next">{toMingEraYear(nextYear)} · 正月已至</span>
          <button type="button" className="annual-chronicle__continue" onClick={onClose}>
            展卷 · 入正月
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
