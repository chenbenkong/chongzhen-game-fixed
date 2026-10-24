import { memo as ReactMemo } from 'react'
import { Character, GameStateValues, DegreeType } from '../types/game'
import { BGMInlineButton } from './BGM'
import { isDebugModeEnabled } from '../utils/debug'
import { toMingEraYear } from '../utils/endingSystem'
import './StatusBar.css'

interface StatusBarProps {
  character: Character
  gameState: GameStateValues
  degree?: DegreeType
  onCheatClick?: () => void
}

const StatusBarImpl = function StatusBar({ character, gameState, degree, onCheatClick }: StatusBarProps) {

  // 优先使用 character.degree（当前实际功名），如果没有则使用传入的 degree（初始功名）
  const currentDegree = character.degree || degree

  const getDegreeRank = (deg: DegreeType): string => {
    switch (deg) {
      case '童生': return '尚未入仕'
      case '秀才': return '秀才（待科举）'
      case '举人': return '举人（待铨选）'
      case '贡士': return '贡士（待殿试）'
      case '进士': return character.rank || '进士及第，待授官'
      default: return character.rank || '未知'
    }
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className="time-info">
          {/* 用结局系统同一把年号尺子：年表只写到崇祯十七年，
              而中晚年的卡全在 1645 以后（1649 读作崇祯二十二年） */}
          <span className="year">{toMingEraYear(gameState.currentYear)}</span>
          <span className="month">{gameState.currentMonth}月</span>
        </div>
        <div className="divider"></div>
        <div className="player-info">
          <span className="name">{character.name || '无名氏'}</span>
          <span className="age">年方{Math.floor(character.age)}岁</span>
        </div>
        <div className="divider"></div>
        <div className="rank-info">
          <span className="rank-label">官职</span>
          <span className="rank-value">{character.rank || (currentDegree ? getDegreeRank(currentDegree) : '白身')}</span>
        </div>
      </div>

      <div className="status-right">
        <BGMInlineButton />
        {/* 「幽灵模式」调试入口。当前**默认常驻可见**（项目所有者的选择）。
            需要注意代价：面板里能直接浏览全部事件与全部结局（含未解锁剧透）。
            开关在 src/utils/debug.ts —— 加 ?debug=0 可临时隐藏，
            要发行时把那里的默认返回值改成 false 即可。 */}
        {isDebugModeEnabled() && (
          <button
            type="button"
            className="cheat-button"
            onClick={onCheatClick}
            title="进入幽灵模式（调试工具）"
          >
            幽灵模式
          </button>
        )}
        <div className="origin-info">
          <span className="origin-label">出身</span>
          <span className="origin-value">{character.origin || '未知'}</span>
        </div>
      </div>
    </div>
  )
}

// 性能优化: memo - 阻止 character/gameState 引用未变时的重渲染
// (EventDisplay 等子组件更新时不会连带重渲染整个 StatusBar)
const StatusBar = ReactMemo(StatusBarImpl)
export default StatusBar
