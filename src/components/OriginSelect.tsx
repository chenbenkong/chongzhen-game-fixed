import { KeyboardEvent } from 'react'
import { origins } from '../data/origins'
import { OriginType, OriginData } from '../types/game'
import './OriginSelect.css'

interface OriginSelectProps {
  onSelect: (origin: OriginType) => void
}

export default function OriginSelect({ onSelect }: OriginSelectProps) {
  // 卡片内含"选此出身"按钮，button 不能嵌套 button（非法 HTML 且会破坏焦点模型），
  // 因此卡片用 role="button" + tabIndex={0} 实现键盘可达，并自行处理 Enter / Space。
  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, origin: OriginData) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      onSelect(origin.type)
    }
  }

  return (
    <div className="origin-select">
      <h1>铨 选 出 身</h1>
      <p className="quote">先选个出身，毕竟在上位者眼里，诸位大人的斤两从一开始便标好了价。</p>
      
      <div className="origin-grid">
        {(Object.values(origins) as OriginData[]).map((origin) => (
          <div
            key={origin.type}
            className={`origin-card origin-${origin.type}`}
            data-origin={origin.type}
            role="button"
            tabIndex={0}
            aria-label={`选择出身：${origin.name}`}
            onClick={() => onSelect(origin.type)}
            onKeyDown={(e) => handleCardKeyDown(e, origin)}
          >
            <div className="card-header">
              <span className="origin-emblem" aria-hidden="true" />
              <h2>{origin.name}</h2>
              <span className="rank-info">
                <span className="rank-label">{origin.initialRank || '待定'}</span>
                <span className="rank-value">{origin.initialDegree || '进士'}</span>
              </span>
            </div>
            
            <div className="tags">
              {origin.tags.map((tag, i) => (
                <span key={i} className="tag">{tag}</span>
              ))}
            </div>
            
            <p className="background">{origin.background}</p>

            <div className="features">
              <h3>出身特性</h3>
              <ul>
                {origin.features.map((feature, i) => (
                  <li key={i}>{feature}</li>
                ))}
              </ul>
            </div>

            <p className="play-style">
              <strong>玩法风格：</strong>
              {origin.playStyle}
            </p>

            <div className="attributes">
              <h3>初始属性</h3>
              {Object.entries(origin.initialAttributes).map(([key, value]) => (
                <div key={key} className="attr-row">
                  <span className="attr-name">{key}</span>
                  <div className="attr-bar-container">
                    <div className="attr-bar">
                      <div 
                        className="attr-fill" 
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="attr-value">{value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 内层按钮保留：键盘用户可直接 Tab 到它并回车选择；
                阻止事件冒泡，避免触发卡片自身的 keydown 处理（否则会重复触发选择） */}
            <button 
              className="select-btn"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(origin.type)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
              }}
            >
              选 此 出 身
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
