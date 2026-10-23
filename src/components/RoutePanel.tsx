import { memo, useState } from 'react'
import { Character, GameStateValues } from '../types/game'
import { buildRouteTrail, previewEnding, ROUTE_FAMILIES, type RouteBeatHint } from '../utils/routeTrail'
import './RoutePanel.css'

interface RoutePanelProps {
  character: Character
  gameState: GameStateValues
}

/** 全库口径：面板头部那行计数直接读命途表，不靠渲染结果反推，也不写死数字 */
const TOTAL_FAMILIES = ROUTE_FAMILIES.length
const TOTAL_DESTINATIONS = ROUTE_FAMILIES.reduce((n, f) => n + f.destinations.length, 0)

const BEAT_STATUS_SUFFIX: Partial<Record<RouteBeatHint['status'], string>> = {
  training: '（任事未久）',
  before: '（年窗未到）',
  passed: '（年窗已过）'
}

/** 「下一拍」那句：只报看得见的经历票，all 要集齐、any 只需其一 */
function beatText(beat: RouteBeatHint): string {
  if (!beat.missing.length) return ''
  const shown = beat.missing.slice(0, 3).join(' / ')
  const more = beat.missing.length > 3 ? ' 等' : ''
  const head =
    beat.mode === 'all' ? `还缺 ${shown}${more}` : `需其一 ${shown}${more}`
  return `《${beat.title}》${head}${BEAT_STATUS_SUFFIX[beat.status] ?? ''}`
}

function RoutePanel({ character, gameState }: RoutePanelProps) {
  const { routes, dormant, dangers } = buildRouteTrail(character, gameState)
  const preview = previewEnding(character, gameState)
  const [expanded, setExpanded] = useState(false)

  const heldDests = routes.reduce((n, r) => n + r.destinations.length, 0)

  return (
    <section className="route-panel" aria-labelledby="route-panel-title">
      <div className="route-panel-head">
        <h2 className="route-panel-title" id="route-panel-title">命 途</h2>
        <span className="route-panel-sub">
          在册 {routes.length}/{TOTAL_FAMILIES} 途 · 落点 {heldDests}/{TOTAL_DESTINATIONS} 格
        </span>
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
          {(expanded ? routes : routes.slice(0, 2)).map(route => (
            <article className="route-card" key={route.key} title={route.motto}>
              <div className="route-card-head">
                <span className="route-name">{route.name}</span>
                <span className="route-beats">第 {route.beatsDone}/{route.beatsTotal} 拍</span>
                <span className="route-count">已记 {route.heldTickets.length} 笔</span>
              </div>

              <ul className="route-dests">
                {(expanded ? route.destinations : route.destinations.slice(0, 2)).map(dest => (
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

              {route.nextBeat && (
                <div className="route-next">下一拍：{beatText(route.nextBeat)}</div>
              )}

              <div className="route-tickets">
                {(expanded ? route.heldTickets : route.heldTickets.slice(0, 3)).map(ticket => (
                  <span className="route-ticket" key={ticket}>{ticket}</span>
                ))}
                {!expanded && route.heldTickets.length > 3 && (
                  <span className="route-ticket is-more">+{route.heldTickets.length - 3}</span>
                )}
              </div>
            </article>
          ))}

          {!expanded && routes.length > 2 && <div className="route-more">另 {routes.length - 2} 途在册</div>}
        </div>
      ) : (
        <p className="route-empty">尚无定数 —— 你走的每一步，史官都在记。</p>
      )}

      {expanded && dormant.length > 0 && (
        <div className="route-dormant">
          <div className="route-dormant-head">尚未起步 · {dormant.length} 途</div>
          <ul className="route-dormant-list">
            {dormant.map(family => (
              <li className="route-dormant-row" key={family.key} title={family.motto}>
                <span className="route-dormant-name">{family.name}</span>
                <span className="route-dormant-count">{family.beatsTotal} 拍</span>
                <span className="route-dormant-beat">{beatText(family.nextBeat)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!expanded && dormant.length > 0 && (
        <div className="route-more">另有 {dormant.length} 途尚未起步</div>
      )}

      {routes.length > 2 || dormant.length > 0 ? (
        <button
          type="button"
          className="route-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded
            ? '收拢，只看走上的路'
            : `展开全部 ${TOTAL_FAMILIES} 途 · ${TOTAL_DESTINATIONS} 格`}
        </button>
      ) : null}

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
