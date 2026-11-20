/**
 * 手机版标题屏（最小骨架）—— 横屏入口。
 *
 * 存档 / 难度口径与桌面 TitleScreen 一致（读既有存储与难度配置），
 * 布局是手机原生竖排按钮组，不复用桌面三栏视觉。成就 / 结局图鉴 / 帮助
 * 收在按钮组下方的一行小入口，保证 924×426 仍一屏装下。
 */
import { useMemo } from 'react'
import { getAutosavePreview } from '../types/save'
import { DIFFICULTY_CONFIGS, type DifficultyLevel } from '../types/difficulty'
import { APP_VERSION_LABEL } from '../utils/version'
import { BGMInlineButton } from '../components/BGM'

/** 难度展示顺序：简单 / 普通 / 困难，与桌面一致。 */
const DIFFICULTY_ORDER: DifficultyLevel[] = ['easy', 'normal', 'hard']

export interface MobileTitleProps {
  onStart: () => void
  onContinueAutosave: () => void
  onOpenLoad: () => void
  onOpenAchievements: () => void
  onOpenCodex: () => void
  onOpenTutorial: () => void
  difficulty: DifficultyLevel
  onDifficultyChange: (difficulty: DifficultyLevel) => void
}

export default function MobileTitle({
  onStart,
  onContinueAutosave,
  onOpenLoad,
  onOpenAchievements,
  onOpenCodex,
  onOpenTutorial,
  difficulty,
  onDifficultyChange
}: MobileTitleProps) {
  const autosavePreview = useMemo(() => getAutosavePreview(), [])
  const currentDifficulty = DIFFICULTY_CONFIGS[difficulty]

  return (
    <div className="mobile-title">
      <p className="mobile-title__version">{APP_VERSION_LABEL}</p>
      <h1 className="mobile-title__main">崇祯·宦海浮沉</h1>
      <p className="mobile-title__sub">明末官场沉浮模拟器 · 横屏版</p>

      <div className="mobile-title__difficulty" role="radiogroup" aria-label="难度选择">
        {DIFFICULTY_ORDER.map(id => {
          const cfg = DIFFICULTY_CONFIGS[id]
          const active = difficulty === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`mobile-difficulty__option${active ? ' is-active' : ''}`}
              onClick={() => onDifficultyChange(id)}
              title={cfg.description}
            >
              {cfg.name.replace('模式', '')}
            </button>
          )
        })}
        <p className="mobile-difficulty__desc" aria-live="polite">{currentDifficulty.description}</p>
      </div>

      <div className="mobile-title__actions">
        <button type="button" className="mobile-btn mobile-btn--primary" onClick={onStart}>
          开 始 仕 途
        </button>
        {autosavePreview && (
          <button type="button" className="mobile-btn" onClick={onContinueAutosave}>
            继 续 上 次
          </button>
        )}
        <button type="button" className="mobile-btn" onClick={onOpenLoad}>
          读 取 存 档
        </button>
        <BGMInlineButton />
      </div>

      <nav className="mobile-title__extras" aria-label="档案与帮助">
        <button type="button" className="mobile-title__extra" onClick={onOpenAchievements} aria-haspopup="dialog">
          成 就
        </button>
        <button type="button" className="mobile-title__extra" onClick={onOpenCodex} aria-haspopup="dialog">
          局 鉴
        </button>
        <button type="button" className="mobile-title__extra" onClick={onOpenTutorial} aria-haspopup="dialog">
          帮 助
        </button>
      </nav>
    </div>
  )
}
