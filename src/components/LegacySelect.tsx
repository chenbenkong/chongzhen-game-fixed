import { useMemo, useState } from 'react'
import {
  LEGACY_PERKS,
  canUnlockPerk,
  loadLegacyState,
  unlockPerk,
  type LegacyPerkId,
  type LegacyState,
  type LegacyPerk
} from '../data/legacy'
import './LegacySelect.css'

interface LegacySelectProps {
  onConfirm: (perkId: LegacyPerkId | null) => void
  onBack: () => void
}

function categoryPoints(state: LegacyState, perk: LegacyPerk): number {
  return state.points[perk.category]
}

export default function LegacySelect({ onConfirm, onBack }: LegacySelectProps) {
  const [state, setState] = useState<LegacyState>(() => loadLegacyState())
  const [selected, setSelected] = useState<LegacyPerkId | null>(null)
  const [notice, setNotice] = useState('')

  const unlockedSet = useMemo(() => new Set(state.unlocked), [state.unlocked])
  const hasAnyPoints = state.points.门生 + state.points.著作 + state.points.家训 > 0

  const handlePick = (perk: LegacyPerk) => {
    setNotice('')
    if (unlockedSet.has(perk.id)) {
      setSelected(perk.id)
      return
    }
    if (!canUnlockPerk(state, perk.id)) {
      setNotice(`还差 ${perk.cost - categoryPoints(state, perk)} 点${perk.category}。`)
      return
    }
    setSelected(perk.id)
  }

  const handleConfirm = () => {
    if (selected && !unlockedSet.has(selected)) {
      const next = unlockPerk(state, selected)
      if (next === state) {
        setNotice('点数不够，未能解锁。')
        return
      }
      setState(next)
    }
    onConfirm(selected)
  }

  return (
    <div className="legacy-screen">
      <div className="legacy-sheet">
        <header className="legacy-head">
          <span className="legacy-eyebrow">身 后 余 荫</span>
          <h1>家 训</h1>
          <p>
            上一局留下的门生、著作与家训，只够带一条进下一局。
            三条都只加三点，不叠加，也不替你改命。
          </p>
        </header>

        <div className="legacy-points" aria-label="传承点数">
          <div><span>门生</span><strong>{state.points.门生}</strong></div>
          <div><span>著作</span><strong>{state.points.著作}</strong></div>
          <div><span>家训</span><strong>{state.points.家训}</strong></div>
        </div>

        {!hasAnyPoints && (
          <p className="legacy-empty">
            还没有留下什么。先走完这一局，结局会替你算一笔。
          </p>
        )}

        <div className="legacy-list" role="radiogroup" aria-label="选择家训">
          {LEGACY_PERKS.map((perk) => {
            const unlocked = unlockedSet.has(perk.id)
            const affordable = unlocked || canUnlockPerk(state, perk.id)
            const active = selected === perk.id
            return (
              <button
                key={perk.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`legacy-card ${active ? 'is-active' : ''} ${affordable ? '' : 'is-locked'}`}
                onClick={() => handlePick(perk)}
                disabled={!affordable}
              >
                <span className="legacy-card-top">
                  <strong>{perk.name}</strong>
                  <span className="legacy-card-cat">{perk.category}</span>
                </span>
                <span className="legacy-card-desc">{perk.description}</span>
                <span className="legacy-card-cost">
                  {unlocked ? '已解锁 · 免费' : `需 ${perk.cost} 点${perk.category}（有 ${categoryPoints(state, perk)}）`}
                </span>
              </button>
            )
          })}
        </div>

        {notice && <p className="legacy-notice" role="status">{notice}</p>}

        <footer className="legacy-actions">
          <button type="button" className="legacy-btn ghost" onClick={onBack}>
            ← 返回出身
          </button>
          <button type="button" className="legacy-btn ghost" onClick={() => onConfirm(null)}>
            不传家训，直接开局
          </button>
          <button type="button" className="legacy-btn primary" onClick={handleConfirm}>
            {selected ? '带此家训开局' : '直接开局'}
          </button>
        </footer>
      </div>
    </div>
  )
}
