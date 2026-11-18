/**
 * 手机版出身选择屏 —— 出身卡网格。
 *
 * 数据直接复用 src/data/origins，不复制出身数值；每卡展示初始五围与玩法提示，
 * 点选即开局。布局为手机原生网格，不复用桌面 OriginSelect 的宽卡片样式。
 */
import { useState } from 'react'
import { origins } from '../data/origins'
import type { OriginType, OriginData } from '../types/game'

interface MobileOriginSetupProps {
  onSelect: (origin: OriginType) => void
  onBack: () => void
}

function OriginCard({ origin, onSelect }: { origin: OriginData; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const entries = Object.entries(origin.initialAttributes)
  return (
    <div className={`mobile-origin-card${expanded ? ' is-expanded' : ''}`} data-origin={origin.type}>
      <div className="mobile-origin-card__header">
        <span className="origin-emblem" aria-hidden="true" />
        <h2>{origin.name}</h2>
        <span className="mobile-origin-card__rank">
          {origin.initialRank || '待定'} · {origin.initialDegree || '进士'}
        </span>
      </div>

      <div className="mobile-origin-card__actions">
        <button
          type="button"
          className="mobile-btn mobile-btn--ghost mobile-origin-card__toggle"
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? '收起' : '详情'}
        </button>
        <button type="button" className="mobile-btn mobile-btn--primary" onClick={onSelect}>
          选此出身
        </button>
      </div>

      {expanded && (
        <div className="mobile-origin-card__details">
          <div className="mobile-origin-card__attrs">
            {entries.map(([key, value]) => (
              <span key={key} className="mobile-origin-attr">
                <span className="mobile-origin-attr__name">{key}</span>
                <span className="mobile-origin-attr__value">{value}</span>
              </span>
            ))}
          </div>
          <div className="mobile-origin-card__tags">
            {origin.tags.map(tag => (
              <span key={tag} className="mobile-origin-tag">{tag}</span>
            ))}
          </div>
          <p className="mobile-origin-card__background">{origin.background}</p>
          <p className="mobile-origin-card__style">
            <strong>玩法风格：</strong>{origin.playStyle}
          </p>
        </div>
      )}
    </div>
  )
}

export default function MobileOriginSetup({ onSelect, onBack }: MobileOriginSetupProps) {
  return (
    <div className="mobile-origin">
      <div className="mobile-origin__head">
        <h1 className="mobile-origin__title">铨 选 出 身</h1>
        <button type="button" className="mobile-btn mobile-btn--ghost mobile-origin__back" onClick={onBack}>
          ← 返回
        </button>
      </div>
      <p className="mobile-origin__quote">先选个出身，毕竟在上位者眼里，诸位大人的斤两从一开始便标好了价。</p>

      <div className="mobile-origin__grid">
        {Object.values(origins).map(origin => (
          <OriginCard
            key={origin.type}
            origin={origin}
            onSelect={() => onSelect(origin.type)}
          />
        ))}
      </div>
    </div>
  )
}
