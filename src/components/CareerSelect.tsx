import { useState } from 'react'
import { CAREER_GOALS } from '../data/careerGoals'
import type { CareerGoalId } from '../types/game'
import './CareerSelect.css'

interface CareerSelectProps {
  onConfirm: (goalId: CareerGoalId | null) => void
  onBack: () => void
}

/**
 * 开局“志业”屏：老玩家不需要教学，这里只给四张目标卡。
 * 允许不选；不选就没有志业评价，不强迫。
 */
export default function CareerSelect({ onConfirm, onBack }: CareerSelectProps) {
  const [selected, setSelected] = useState<CareerGoalId | null>(null)

  return (
    <div className="career-select-screen">
      <header className="career-select-header">
        <p className="career-select-kicker">这一局，你打算拿什么换什么</p>
        <h1>志 业</h1>
        <p className="career-select-sub">
          一个长期目标，三个整数里程碑。选不选都不影响开局，也不加属性。
        </p>
      </header>

      <div className="career-grid" role="radiogroup" aria-label="选择志业">
        {CAREER_GOALS.map((goal) => {
          const active = selected === goal.id
          return (
            <button
              key={goal.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`career-card${active ? ' is-active' : ''}`}
              onClick={() => setSelected(goal.id)}
            >
              <span className="career-card-index">{goal.subtitle}</span>
              <span className="career-card-name">{goal.name}</span>
              <span className="career-card-desc">{goal.description}</span>
              <span className="career-card-milestones">
                {goal.milestones.map((milestone) => (
                  <span key={milestone.label} className="career-milestone-chip">
                    {milestone.label}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <footer className="career-actions">
        <button type="button" className="career-btn ghost" onClick={onBack}>
          返回家训
        </button>
        <button type="button" className="career-btn ghost" onClick={() => onConfirm(null)}>
          不立志业，直接开局
        </button>
        <button
          type="button"
          className="career-btn primary"
          disabled={!selected}
          onClick={() => selected && onConfirm(selected)}
        >
          {selected ? `以「${CAREER_GOALS.find((goal) => goal.id === selected)?.name}」开局` : '先选一个志业'}
        </button>
      </footer>
    </div>
  )
}
