import { memo } from 'react'
import { Character, GameStateValues } from '../types/game'
import { buildRouteTrail, previewEnding } from '../utils/routeTrail'
import './RoutePanel.css'

interface RoutePanelProps {
  character: Character
  gameState: GameStateValues
}

function RoutePanel({ character, gameState }: RoutePanelProps) {
  const { routes, dangers } = buildRouteTrail(character, gameState)
  const preview = previewEnding(character, gameState)

  return (
    <section className="route-panel" aria-labelledby="route-panel-title">
      <div className="route-panel-head">
        <h2 className="route-panel-title" id="route-panel-title">命 途</h2>
        <span className="route-panel-sub">史官随行</span>
      </div>

      {(preview || routes.length > 0) && (
        <div className={`route-preview ${preview?.isThreshold ? 'is-danger' : ''}`}>
          <span className="route-preview-label">此刻史笔</span>
          {preview
            ? <span className="route-preview-ending">《{preview.title}》</span>
            : <span className="route-preview-none">尚无定局</span>}
        </div>
      )}

      {routes.length > 0 ? (
        <div className="route-list">
          {routes.slice(0, 2).map(route => (
            <article className="route-card" key={route.key} title={route.motto}>
              <div className="route-card-head">
                <span className="route-name">{route.name}</span>
                <span className="route-count">已记 {route.heldTickets.length} 笔</span>
              </div>

              <ul className="route-dests">
                {route.destinations.slice(0, 2).map(dest => (
                  <li
                    className={`route-dest ${dest.ready ? 'is-ready' : ''} ${dest.blockedBy.length > 0 ? 'is-blocked' : ''}`}
                    key={dest.endingId}
                    title={dest.detail || undefined}
                  >
                    <span className="route-dest-title">《{dest.title}》</span>
                    <span className={`route-dest-status is-${dest.status}`}>
                      {dest.statusLabel}
                    </span>
                    {dest.detail && <span className="route-dest-detail">{dest.detail}</span>}
                  </li>
                ))}
              </ul>

              <div className="route-tickets">
                {route.heldTickets.slice(0, 3).map(ticket => (
                  <span className="route-ticket" key={ticket}>{ticket}</span>
                ))}
                {route.heldTickets.length > 3 && (
                  <span className="route-ticket is-more">+{route.heldTickets.length - 3}</span>
                )}
              </div>
            </article>
          ))}
          {routes.length > 2 && (
            <div className="route-more">另 {routes.length - 2} 途在册</div>
          )}
        </div>
      ) : (
        <p className="route-empty">尚无定数 —— 你走的每一步，史官都在记。</p>
      )}

      {dangers.length > 0 && (
        <div className="route-danger">
          <div className="route-danger-head">危 局</div>
          {dangers.map(danger => (
            <div className={`route-danger-row is-${danger.level}`} key={danger.key}>
              <span className="route-danger-dim">{danger.key}</span>
              <span className="route-danger-value">{Math.round(danger.value)}</span>
              <span className="route-danger-state">{danger.label}</span>
              <span className="route-danger-ending">→《{danger.endingTitle}》</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// 同 AttributePanel：character/gameState 引用未变时跳过重算（门票与危局只随这两者变）
export default memo(RoutePanel)
