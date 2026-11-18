import { memo } from 'react'
import { Character, GameStateValues } from '../types/game'
import { careerGoalStatus } from '../data/careerGoals'
import './StatusPanel.css'
import './StatusPanelCareer.css'

interface StatusPanelProps {
  gameState: GameStateValues
  /** 有角色时才显示志业；旧调用点不传也不会多渲染一块空面板。 */
  character?: Character
}

function StatusPanel({ gameState, character }: StatusPanelProps) {
  const 国势 = Math.round(gameState.国势 ?? 75)
  const career = character ? careerGoalStatus(character.careerGoal, character, gameState) : null
  const getFortuneLevel = (value: number): string => {
    if (value >= 70) return 'fortune-high'
    if (value >= 50) return 'fortune-medium'
    if (value >= 35) return 'fortune-low'
    return 'fortune-critical'
  }

  const getStatusLevel = (value: number): 'normal' | 'low' | 'danger' | 'critical' => {
    if (value <= 0) return 'critical'
    if (value <= 10) return 'danger'
    if (value <= 25) return 'low'
    return 'normal'
  }

  const attitudeItems = [
    {
      key: '圣眷',
      value: gameState.圣眷,
      hint: (value: number) => value > 75 ? '圣宠' : value > 50 ? '受宠' : value > 25 ? '平常' : '失宠'
    },
    {
      key: '中官',
      value: gameState.中官,
      hint: (value: number) => value > 75 ? '心腹' : value > 50 ? '亲近' : value > 25 ? '中立' : '敌视'
    },
    {
      key: '清议',
      value: gameState.清议,
      hint: (value: number) => value > 75 ? '东林' : value > 50 ? '清流' : value > 25 ? '中立' : '孤立'
    },
    {
      key: '士绅',
      value: gameState.士绅,
      hint: (value: number) => value > 75 ? '拥戴' : value > 50 ? '支持' : value > 25 ? '中立' : '反对'
    },
    {
      key: '民望',
      value: gameState.民望,
      hint: (value: number) => value > 75 ? '爱戴' : value > 50 ? '称颂' : value > 25 ? '平淡' : '怨声'
    },
  ]

  return (
    <div className="status-panel">
      {career && (
        <div className="panel-section career-panel" aria-label={`志业：${career.goal.name}`}>
          <div className="career-panel-head">
            <h2 className="section-title">志业 · {career.goal.name}</h2>
            <span className={`career-panel-grade career-grade-${career.completed}`}>
              {career.grade} {career.completed}/3
            </span>
          </div>
          <ol className="career-panel-list">
            {career.milestones.map((milestone) => (
              <li key={milestone.label} className={milestone.done ? 'is-done' : ''}>
                <span className="career-panel-mark">{milestone.done ? '成' : '未'}</span>
                <span className="career-panel-label">{milestone.label}</span>
                <span className="career-panel-hint">{milestone.hint}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="panel-section">
        <h2 className="section-title">五方态度</h2>
        <div className="status-list">
          {attitudeItems.map(({ key, value, hint }) => {
            const level = getStatusLevel(value)
            return (
              <div
                key={key}
                className={`status-item status-${level}`}
              >
                <span className="status-name">{key}</span>
                <div className="status-bar-wrap">
                  <div className="status-bar-bg">
                    <div
                      className={`status-bar-fill status-bar-${level}`}
                      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
                    />
                  </div>
                </div>
                <span className={`status-num status-num-${level}`}>{Math.round(Math.max(value, 0))}</span>
                <span className={`status-hint status-hint-${level}`}>{hint(value)}</span>
                {(level === 'danger' || level === 'critical') && (
                  <span className="status-warning" aria-label="警告" />
                )}
              </div>
            )
          })}
        </div>

        <div className="national-fortune-bar">
          <div className="fortune-header">
            <span className="fortune-title">国势</span>
            <span className={`fortune-value ${getFortuneLevel(国势)}`}>
              {国势}
            </span>
          </div>
          <div className="fortune-track">
            <div
              className={`fortune-fill ${getFortuneLevel(国势)}`}
              style={{ width: `${国势}%` }}
            />
          </div>
          <div className="fortune-labels">
            <span>末日</span>
            <span>危倾</span>
            <span>紧张</span>
            <span>稳定</span>
            <span>强盛</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// 性能优化: memo - gameState 引用未变时跳过整个状态面板重渲染
// (EventDisplay/ActionBar 等子树更新时不会连带重渲染 5 个状态条)
export default memo(StatusPanel)
