import { memo, useMemo } from 'react'
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
  /** 当前难度（由 App 统一持有，存档时一并写入） */
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
  // 两个读取都会解析 localStorage；只在挂载时算一次，避免每次父组件重渲染都解析存档
  const hasAnySave = useMemo(() => getAllSaveSlots().some(s => s.preview), [])
  const autosavePreview = useMemo(() => getAutosavePreview(), [])

  const currentDifficulty: DifficultyConfig = DIFFICULTY_CONFIGS[difficulty]

  return (
    <div className="title-screen paper-bg">
      <BGMFixedButton />

      {/* 6 层背景 */}
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
        <div className="title-seal" aria-hidden="true">
          敕
        </div>
        <h1 className="title-main">崇祯直聘</h1>
        <p className="title-sub">明末官场沉浮模拟器</p>
        <p className="title-tagline">
          天启七年，天启帝驾崩，信王朱由检即位，改元崇祯。
          <br />
          新帝登基，朝局将变——而你，不过是一个刚刚踏入仕途的年轻人。
          <br />
          在这乱世之中，你将如何抉择？
        </p>
        <p className="title-quote">
          &ldquo;你不是在一个稳定王朝里做官，
          <br />
          你是在一艘正在漏水的船上，努力决定自己要不要继续往上爬。&rdquo;
        </p>

        {/* 难度选择（写入存档，读档时恢复） */}
        <div className="title-difficulty">
          <span className="title-difficulty__label" id="difficulty-label">
            难 度
          </span>
          <div className="title-difficulty__options" role="radiogroup" aria-labelledby="difficulty-label">
            {DIFFICULTY_ORDER.map(id => {
              const cfg = DIFFICULTY_CONFIGS[id]
              const active = difficulty === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  className={`title-difficulty__option${active ? ' is-active' : ''}`}
                  onClick={() => onDifficultyChange(id)}
                  title={cfg.description}
                >
                  {cfg.name.replace('模式', '')}
                </button>
              )
            })}
          </div>
          <p className="title-difficulty__desc" aria-live="polite">
            {currentDifficulty.description}
          </p>
        </div>

        <div className="title-buttons">
          <button type="button" className="title-btn" onClick={onStart}>
            开 始 仕 途
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
            </button>
          )}
        </div>
      </div>

      {/* 成就 + 图鉴 + 帮助 */}
      <nav className="title-corner-buttons" aria-label="附加功能">
        <button type="button" className="title-follow-btn" onClick={onOpenAchievements}>
          成 就
        </button>
        <button type="button" className="title-follow-btn" onClick={onOpenCodex}>
          局 鉴
        </button>
        <button type="button" className="title-follow-btn" onClick={onOpenTutorial}>
          帮 助
        </button>
      </nav>

      <p className="title-version-topleft">{APP_VERSION_LABEL}</p>
    </div>
  )
}

export const TitleScreen = memo(TitleScreenImpl)
export default TitleScreen
