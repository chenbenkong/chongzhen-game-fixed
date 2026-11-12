import { memo, useMemo, type KeyboardEvent } from 'react'
import { BGMFixedButton } from './BGM'
import { SaveData, getAllSaveSlots, getAutosavePreview } from '../types/save'
import {
  DIFFICULTY_CONFIGS,
  DifficultyLevel,
  type DifficultyConfig
} from '../types/difficulty'
import { APP_VERSION_LABEL } from '../utils/version'
import './TitleScreen.css'

const DIFFICULTY_ORDER: DifficultyLevel[] = ['easy', 'normal', 'hard']

export interface TitleScreenProps {
  onStart: () => void
  onContinueAutosave: () => void
  onOpenLoad: () => void
  onOpenAchievements: () => void
  onOpenCodex: () => void
  onOpenTutorial: () => void
  difficulty: DifficultyLevel
  onDifficultyChange: (difficulty: DifficultyLevel) => void
  loadSaveData?: SaveData
}

function TitleScreenImpl({
  onStart,
  onContinueAutosave,
  onOpenLoad,
  onOpenAchievements,
  onOpenCodex,
  onOpenTutorial,
  difficulty,
  onDifficultyChange
}: TitleScreenProps) {
  const hasAnySave = useMemo(() => getAllSaveSlots().some(s => s.preview), [])
  const autosavePreview = useMemo(() => getAutosavePreview(), [])
  const currentDifficulty: DifficultyConfig = DIFFICULTY_CONFIGS[difficulty]

  const handleDifficultyKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % DIFFICULTY_ORDER.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = DIFFICULTY_ORDER.length - 1
    }
    if (nextIndex === undefined) return

    event.preventDefault()
    onDifficultyChange(DIFFICULTY_ORDER[nextIndex])
    const options = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '.title-difficulty__option'
    )
    options?.[nextIndex]?.focus()
  }

  return (
    <div className="title-screen paper-bg">
      <BGMFixedButton />

      <div className="title-bg-layer title-bg-gradient" aria-hidden="true"></div>
      <div className="title-bg-layer title-bg-texture" aria-hidden="true"></div>
      <div className="title-bg-layer title-bg-ink" aria-hidden="true"></div>
      <div className="title-bg-layer title-bg-image" aria-hidden="true"></div>
      <div className="title-bg-layer title-bg-mountains" aria-hidden="true"></div>
      <div className="title-bg-layer title-bg-vignette" aria-hidden="true"></div>
      <div className="title-ambient-glow" aria-hidden="true"></div>
      <div className="title-ink-stroke-top" aria-hidden="true"></div>
      <div className="title-ink-stroke-bot" aria-hidden="true"></div>

      <div className="title-frame">
        <div className="title-seal" aria-hidden="true">敕</div>
        <h1 className="title-main">崇祯直聘</h1>
        <p className="title-sub">明末官场沉浮模拟器</p>
        <p className="title-tagline">
          天启七年，天启帝驾崩，信王朱由检即位，改元崇祯。
          <br />
          新帝登基，朝局将变——而你，不过是一个刚刚踏入仕途的年轻人。
          <br />
          在这乱世之中，你将如何抉择？
        </p>
        <ul className="title-features" aria-label="游戏特色">
          <li>科举入仕</li>
          <li>党争抉择</li>
          <li>青史留名</li>
        </ul>
        <p className="title-quote">
          &ldquo;王朝将倾，你的每个抉择，都将写入青史。&rdquo;
        </p>

        <div className="title-difficulty">
          <span className="title-difficulty__label" id="difficulty-label">难 度</span>
          <div className="title-difficulty__options" role="radiogroup" aria-labelledby="difficulty-label">
            {DIFFICULTY_ORDER.map((id, index) => {
              const cfg = DIFFICULTY_CONFIGS[id]
              const active = difficulty === id
              const label = cfg.name.replace('模式', '')
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  tabIndex={active ? 0 : -1}
                  className={`title-difficulty__option${active ? ' is-active' : ''}`}
                  onClick={() => onDifficultyChange(id)}
                  onKeyDown={event => handleDifficultyKeyDown(event, index)}
                  title={cfg.description}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p className="title-difficulty__desc" aria-live="polite">
            {currentDifficulty.description}
          </p>
        </div>

        <div className="title-buttons">
          <button type="button" className="title-btn title-btn--primary" onClick={onStart}>
            开 始 仕 途
            <span className="title-btn__hint">自崇祯元年起，书写你的生平</span>
          </button>

          {hasAnySave && (
            <button type="button" className="title-btn" onClick={onOpenLoad}>
              读 取 存 档
            </button>
          )}

          {autosavePreview && (
            <button
              type="button"
              className="title-btn title-btn--autosave"
              onClick={onContinueAutosave}
              title={`自动存档 · ${autosavePreview.playerName} · ${autosavePreview.year}年${autosavePreview.month}月`}
            >
              继 续 游 戏
              <span className="title-btn__hint">
                {autosavePreview.playerName} · {autosavePreview.year}年{autosavePreview.month}月
              </span>
            </button>
          )}
        </div>
      </div>

      <nav className="title-corner-buttons" aria-label="附加功能">
        <button type="button" className="title-follow-btn" onClick={onOpenAchievements}>成 就</button>
        <button type="button" className="title-follow-btn" onClick={onOpenCodex}>局 鉴</button>
        <button type="button" className="title-follow-btn" onClick={onOpenTutorial}>帮 助</button>
      </nav>

      <p className="title-version-topleft">{APP_VERSION_LABEL}</p>
    </div>
  )
}

export const TitleScreen = memo(TitleScreenImpl)
export default TitleScreen
