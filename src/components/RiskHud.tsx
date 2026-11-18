import { memo } from 'react'
import { Character, GameStateValues } from '../types/game'
import { collectDangers } from '../utils/routeTrail'
import './RiskHud.css'

interface RiskHudProps {
  character: Character
  gameState: GameStateValues
  /** 手机横屏：更矮的一行，过长时横向滚动。 */
  compact?: boolean
}

/**
 * 主界面常驻风险条。
 *
 * 命途面板里的「危局」只有展开面板才看得到；等到玩家想起来点面板，
 * 低值往往已经拖过警告宽限。这条 HUD 只做一件事：把最接近归零的 1–2 维
 * 直接摆在牌桌上方，并写清它对应哪一格结局。
 *
 * 文案边界：
 * - 「已在崖边」= 归零且已有警告票，下一次再归零就结案；
 * - 「归零·尚有警告」= 归零但还没收警告票，下一次归零会先开警告卡；
 * - 「将尽」= 已进入该维的预警区间，再挨一张重卡就可能见底。
 *
 * 不在这里预测“下月一定归零”：属性没有逐月自然衰减，硬写一句
 * “再拖一个月就断”会把玩家引到错误判断上。这里只报当前值与真实后果。
 */
function RiskHud({ character, gameState, compact = false }: RiskHudProps) {
  const dangers = collectDangers(character, gameState).slice(0, 2)
  if (dangers.length === 0) return null

  return (
    <div
      className={`risk-hud${compact ? ' is-compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="危局提示"
    >
      <span className="risk-hud__label">危局</span>
      {dangers.map(danger => (
        <span className={`risk-hud__chip is-${danger.level}`} key={danger.key}>
          <span className="risk-hud__dim">{danger.key}</span>
          <span className="risk-hud__value">{Math.round(danger.value)}</span>
          <span className="risk-hud__state">{danger.label}</span>
          {!compact && (
            <span className="risk-hud__ending">→《{danger.endingTitle}》</span>
          )}
        </span>
      ))}
      <span className="risk-hud__hint">
        {dangers.some(d => d.level === 'cliff')
          ? '已在崖边：再归零就收局'
          : '下一张重卡就可能见底'}
      </span>
    </div>
  )
}

export default memo(RiskHud)
