/**
 * 手机横屏牌桌 —— 最小骨架。
 *
 * 玩法规则全部复用 useGameEngine 与既有事件数据；本文件只做手机原生布局：
 * 顶部 HUD / 中央事件卡 / 底部操作条。事件卡直接复用桌面 EventDisplay，
 * 包在 `.mobile-event-host` 作用域内，尺寸 / 排布由 mobile.css 覆盖。
 * 抉择门槛、投骰、失败回音一律沿用 EventDisplay 既有实现，不在此另写一套。
 */
import { useCallback, useMemo, useState } from 'react'
import type { OriginType, DegreeType, Attributes, GameStateValues, CareerGoalId } from '../types/game'
import type { SaveData } from '../types/save'
import type { DifficultyLevel } from '../types/difficulty'
import { useGameEngine } from '../hooks/useGameEngine'
import { getSeason, toMingEraYear } from '../utils/endingSystem'
import { LEGACY_PERKS, type LegacyPerkId } from '../data/legacy'
import { careerGoalStatus } from '../data/careerGoals'
import { getStoryline } from '../data/storylines'

import EventDisplay from '../components/EventDisplay'
import RiskHud from '../components/RiskHud'
import AttributePanel from '../components/AttributePanel'
import StatusPanel from '../components/StatusPanel'
import GameOverScreen from '../components/GameOverScreen'
import LifeReview from '../components/LifeReview'
import DeathEnding from '../components/DeathEnding'
import SaveNotification from '../components/SaveNotification'
import SaveSlotsModal from '../components/SaveSlotsModal'
import ResignConfirmDialog from '../components/ResignConfirmDialog'
import { BGMInlineButton } from '../components/BGM'

export interface MobileBoardProps {
  origin: OriginType
  degree: DegreeType
  bonusAttributes: Attributes
  playerName?: string
  playerCourtesyName?: string
  playerHometown?: string
  playerCustomAge?: number | null
  loadSaveData?: SaveData
  difficulty: DifficultyLevel
  legacyPerkId?: LegacyPerkId | null
  careerGoalId?: CareerGoalId | null
  onReturnToMenu?: () => void
  /** 牌桌内常驻档案入口：复用 MobileApp 既有的成就 / 局鉴 / 帮助弹窗状态。 */
  onOpenAchievements?: () => void
  onOpenCodex?: () => void
  onOpenTutorial?: () => void
  /** 上述任一弹窗开着时为 true，并入 modalOpen，避免快捷键 / 选项 FAB 穿透到下层牌桌。 */
  overlayOpen?: boolean
}

/** 六项朝堂状态，与 gameState 的键一一对应。 */
const SIX_STATES: Array<keyof GameStateValues> = [
  '圣眷', '中官', '清议', '士绅', '民望', '国势'
]

/** 个人五项能力，排在六项朝堂状态下面一行。 */
const PERSONAL_ATTRIBUTES = ['财帛', '文韬', '理政', '武略', '体质'] as const

export default function MobileBoard(props: MobileBoardProps) {
  const engine = useGameEngine(props)
  const legacyGoalId = LEGACY_PERKS.find((perk) => perk.id === props.legacyPerkId)?.goal
  const {
    character,
    gameState,
    currentEvent,
    pendingEvents,
    eventHistory,
    currentStoryline,
    getCurrentStoryline,
    undoHistory,
    promotionMessage,
    identityType,
    isGameOver,
    canRetryEnding,
    retryEndingLocked,
    saveNotification,
    resignConfirmModal,
    lifeRecords,
    deathEndingState,
    biography,
    isProcessing,
    awaitingEventData,
    isSaveSlotsOpen,
    saveSlotsMode,
    isLifeReviewOpen,
    closeSaveSlots,
    closeLifeReview,
    closeDeathEnding,
    closeSaveNotification,
    handleChoice,
    handleNextMonth,
    handleContinue,
    handleUndo,
    handleSave,
    handleSaveToSlot,
    handleLoadFromSlot,
    handleLoadAutosave,
    handleRestart,
    handleRetryEnding,
    handleReturnToMenu,
    handleGameOver,
    handleDeathEnding,
    confirmResign,
    cancelResign,
    openLifeReview,
    generateLifeSummary
  } = engine

  // 事件是否已抉择（由 EventDisplay 上报），与桌面 GameScreen 同一口径。
  const [eventResolved, setEventResolved] = useState(false)
  // 骰子弹窗开合（EventDisplay 内部，portal 到 body）。
  const [diceModalOpen, setDiceModalOpen] = useState(false)
  // 底部操作条默认收起，只留顶栏「操作」入口。
  const [isActionbarOpen, setIsActionbarOpen] = useState(false)
  // 人物面板默认收起；能力 / 态度 / 卷宗三页签，补回财帛等桌面侧栏参数。
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<'能力' | '态度' | '卷宗'>('能力')
  // 选项不再埋在长正文底部：点「选项」把抉择区提到全屏面板，省掉反复下滑。
  const [isChoicesOpen, setIsChoicesOpen] = useState(false)

  const lifeSummary = useMemo(() => generateLifeSummary(), [generateLifeSummary])

  // 与桌面 StorylineBar 同一份口径：本局志业 + 当前史线。
  const currentStorylineKey = useMemo(
    () => currentStoryline ?? getCurrentStoryline(),
    [currentStoryline, eventHistory, getCurrentStoryline]
  )
  const storyline = getStoryline(currentStorylineKey)
  const careerStatus = careerGoalStatus(
    character.careerGoal ?? props.careerGoalId ?? null,
    character,
    gameState
  )

  /** 统一推进：有事件续事件，无事件进下月（与桌面 canAdvance 语义一致）。 */
  const canAdvance = !currentEvent || eventResolved
  const advanceHint = canAdvance ? null : '请先在事件卡中做出选择'

  const handleAdvance = useCallback(() => {
    if (currentEvent) handleContinue()
    else handleNextMonth()
  }, [currentEvent, handleContinue, handleNextMonth])

  const handleChoiceFromDock = useCallback((
    choice: Parameters<typeof handleChoice>[0],
    opts?: Parameters<typeof handleChoice>[1]
  ) => {
    setIsChoicesOpen(false)
    return handleChoice(choice, opts)
  }, [handleChoice])

  const modalOpen =
    diceModalOpen ||
    isSaveSlotsOpen ||
    isLifeReviewOpen ||
    resignConfirmModal.isOpen ||
    deathEndingState.show ||
    isGameOver ||
    !!props.overlayOpen

  const showChoicesFab = !!currentEvent && !eventResolved && !modalOpen &&
    !isPanelOpen && !isActionbarOpen && !isChoicesOpen

  const saveSlotsCurrentData = useMemo(() => ({
    name: character.name || '无名氏',
    year: gameState.currentYear,
    month: gameState.currentMonth,
    rank: character.rank,
    title: identityType === 'official' ? '官员' : '平民'
  }), [character.name, character.rank, gameState.currentYear, gameState.currentMonth, identityType])

  const season = getSeason(gameState.currentMonth)

  return (
    <div className={`mobile-board mobile-board--season-${season} ${isChoicesOpen ? 'is-choices-open' : ''}`}>
      {awaitingEventData && (
        <div className="mobile-boot" role="status" aria-live="polite">
          <div className="mobile-boot__title">崇祯 · 宦海浮沉</div>
          <div className="mobile-boot__bar" />
          <div className="mobile-boot__hint">正在展开案卷…</div>
        </div>
      )}

      {/* 升迁 / 贬官提示：顶部滑入条，不遮挡抉择区 */}
      {promotionMessage && (
        <div
          className={`mobile-promotion-toast ${promotionMessage.includes('恭喜') ? 'is-promote' : 'is-demote'}`}
          role="alert"
        >
          {promotionMessage}
        </div>
      )}

      {/* 顶部 HUD */}
      <header className="mobile-hud">
        <div className="mobile-hud__identity">
          <span className="mobile-hud__era">{toMingEraYear(gameState.currentYear)} · {gameState.currentMonth}月</span>
          <span className="mobile-hud__name">
            {character.name || '某'}
            {character.courtesyName && <em>字{character.courtesyName}</em>}
          </span>
          <span className="mobile-hud__meta">
            {Math.floor(character.age)}岁 · {character.rank || identityType} · {character.origin}
          </span>
          <span
            className="mobile-hud__route"
            aria-label={`本局志业与史线：${careerStatus ? `${careerStatus.goal.name}，已完成 ${careerStatus.completed} 项` : '未立志业'}；${storyline ? storyline.name : '未启程'}`}
          >
            {careerStatus ? (
              <>
                <span className="mobile-hud__career">
                  志业 · {careerStatus.goal.name} <strong>{careerStatus.completed}/3</strong>
                </span>
                <span className="mobile-hud__career-pips" aria-hidden="true">
                  {careerStatus.milestones.map((milestone) => (
                    <span
                      key={milestone.label}
                      className={`mobile-hud__career-pip ${milestone.done ? 'is-done' : ''}`}
                      title={`${milestone.label} · ${milestone.hint}`}
                    />
                  ))}
                </span>
              </>
            ) : (
              <span className="mobile-hud__career mobile-hud__career--none">志业 · 未立</span>
            )}
            <span className="mobile-hud__route-sep" aria-hidden="true">·</span>
            <span className="mobile-hud__storyline">
              史线 · {storyline ? storyline.name : '未启程'}
            </span>
          </span>
        </div>

        <div className="mobile-hud__meters">
          <div className="mobile-hud__states" aria-label="五方态度与国势">
            {SIX_STATES.map(key => (
              <span key={key} className="mobile-state-capsule">
                <span className="mobile-state-capsule__label">{key}</span>
                <span className="mobile-state-capsule__value">{Math.round(gameState[key])}</span>
              </span>
            ))}
          </div>
          <div className="mobile-hud__personal" aria-label="个人能力">
            {PERSONAL_ATTRIBUTES.map(key => (
              <span key={key} className="mobile-state-capsule mobile-state-capsule--personal">
                <span className="mobile-state-capsule__label">{key}</span>
                <span className="mobile-state-capsule__value">{Math.round(character.attributes[key])}</span>
              </span>
            ))}
          </div>
        </div>

        <BGMInlineButton />

        <button
          type="button"
          className="mobile-hud__panel"
          onClick={() => {
            setIsActionbarOpen(false)
            setIsChoicesOpen(false)
            setIsPanelOpen(true)
          }}
          aria-label="打开人物面板"
          aria-expanded={isPanelOpen}
        >
          面板
        </button>

        <button
          type="button"
          className="mobile-hud__action"
          onClick={() => {
            setIsPanelOpen(false)
            setIsChoicesOpen(false)
            setIsActionbarOpen(true)
          }}
          aria-label="展开操作栏"
          aria-expanded={isActionbarOpen}
        >
          <span className="mobile-hud__action-icon" aria-hidden="true">☰</span>
          <span>操作</span>
          {pendingEvents.length > 0 && (
            <span className="mobile-hud__pending" aria-label={`待办 ${pendingEvents.length}`}>
              {pendingEvents.length}
            </span>
          )}
        </button>
      </header>

      <RiskHud character={character} gameState={gameState} compact />

      {/* 主区：中央事件卡 */}
      <main className="mobile-board__main">
        {/* 选项入口：不再让玩家划过整篇正文才看到抉择。 */}
        {showChoicesFab && (
          <button
            type="button"
            className="mobile-choices-fab"
            onClick={() => {
              setIsPanelOpen(false)
              setIsActionbarOpen(false)
              setIsChoicesOpen(true)
            }}
            aria-label={`打开选项，共 ${currentEvent?.choices.length ?? 0} 项`}
          >
            <span>选项</span>
            <span className="mobile-choices-fab__count">{currentEvent?.choices.length ?? 0}</span>
          </button>
        )}

        <div className="mobile-event-host">
          <EventDisplay
            event={currentEvent}
            character={character}
            gameState={gameState}
            onChoice={handleChoiceFromDock}
            onContinue={handleContinue}
            onResolvedChange={(resolved) => {
              setEventResolved(resolved)
              if (resolved) setIsChoicesOpen(false)
            }}
            onDiceModalOpenChange={setDiceModalOpen}
            shortcutsEnabled={!modalOpen}
            onUndo={handleUndo}
            onGameOver={handleGameOver}
            onDeathEnding={handleDeathEnding}
            canUndo={undoHistory.length > 0}
            isProcessing={isProcessing}
            pendingCount={pendingEvents.length}
          />
        </div>
      </main>

      {isChoicesOpen && (
        <div className="mobile-choices-head">
          <span className="mobile-choices-head__title">本月抉择</span>
          <span className="mobile-choices-head__count">{currentEvent?.choices.length ?? 0} 项</span>
          <button
            type="button"
            className="mobile-choices-head__close"
            onClick={() => setIsChoicesOpen(false)}
            aria-label="收起选项目录"
          >
            ×
          </button>
        </div>
      )}

      {/* 底部操作条：默认收起，点顶栏「操作」才展开；展开后不再挤压事件区。 */}
      {isActionbarOpen && !modalOpen && !isPanelOpen && (
        <footer className="mobile-actionbar" aria-label="牌桌操作">
          <button
            type="button"
            className="mobile-bar-btn"
            onClick={() => {
              setIsActionbarOpen(false)
              handleReturnToMenu()
            }}
            aria-label="返回首页"
          >
            首页
          </button>
          <button
            type="button"
            className="mobile-bar-btn"
            onClick={() => {
              setIsActionbarOpen(false)
              handleUndo()
            }}
            disabled={undoHistory.length === 0}
            aria-label="撤销"
          >
            撤销
          </button>
          <button
            type="button"
            className="mobile-bar-btn"
            onClick={() => {
              setIsActionbarOpen(false)
              handleSave()
            }}
            aria-label="存档"
          >
            存档
          </button>
          {props.onOpenAchievements && (
            <button
              type="button"
              className="mobile-bar-btn"
              onClick={() => {
                setIsActionbarOpen(false)
                props.onOpenAchievements?.()
              }}
              aria-label="成就"
            >
              成就
            </button>
          )}
          {props.onOpenCodex && (
            <button
              type="button"
              className="mobile-bar-btn"
              onClick={() => {
                setIsActionbarOpen(false)
                props.onOpenCodex?.()
              }}
              aria-label="局鉴"
            >
              局鉴
            </button>
          )}
          {props.onOpenTutorial && (
            <button
              type="button"
              className="mobile-bar-btn"
              onClick={() => {
                setIsActionbarOpen(false)
                props.onOpenTutorial?.()
              }}
              aria-label="帮助"
            >
              帮助
            </button>
          )}
          <button
            type="button"
            className="mobile-bar-btn mobile-bar-btn--primary"
            onClick={() => {
              setIsActionbarOpen(false)
              handleAdvance()
            }}
            disabled={!canAdvance}
            title={advanceHint ?? undefined}
          >
            {currentEvent ? '继 续' : '进 下 月'}
          </button>
          <button
            type="button"
            className="mobile-bar-btn mobile-actionbar__close"
            onClick={() => setIsActionbarOpen(false)}
            aria-label="收起操作栏"
          >
            ×
          </button>
        </footer>
      )}

      {/* 人物面板：默认收起；能力 / 态度 / 卷宗三页签，补回财帛等桌面侧栏参数。 */}
      {isPanelOpen && (
        <>
          <button
            type="button"
            className="mobile-panel__scrim"
            onClick={() => setIsPanelOpen(false)}
            aria-label="关闭人物面板"
          />
          <aside className="mobile-panel" role="dialog" aria-modal="true" aria-label="人物面板">
            <div className="mobile-panel__head">
              <span className="mobile-panel__title">人物面板</span>
              <button
                type="button"
                className="mobile-panel__close"
                onClick={() => setIsPanelOpen(false)}
                aria-label="关闭人物面板"
              >
                ×
              </button>
            </div>

            <div className="mobile-panel__tabs" role="tablist" aria-label="人物面板页签">
              {(['能力', '态度', '卷宗'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === tab}
                  className={`mobile-panel__tab ${panelTab === tab ? 'is-active' : ''}`}
                  onClick={() => setPanelTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mobile-panel__body">
              {panelTab === '能力' && (
                <AttributePanel
                  attributes={character.attributes}
                  hidden={character.hidden}
                />
              )}
              {panelTab === '态度' && <StatusPanel gameState={gameState} character={character} />}
              {panelTab === '卷宗' && (
                <div className="mobile-records">
                  {lifeRecords.length === 0 ? (
                    <p className="mobile-records__empty">尚无履历。</p>
                  ) : (
                    [...lifeRecords].reverse().slice(0, 30).map(record => (
                      <div key={record.id} className="mobile-record">
                        <div className="mobile-record__title">
                          {toMingEraYear(record.year)} · {record.month}月 · {record.title}
                        </div>
                        <div className="mobile-record__body">{record.description}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* 结局屏（复用 GameOverScreen，作用域样式见 mobile.css） */}
      {isGameOver && (
        <div className="mobile-ending-host">
          <GameOverScreen
            endingEvent={currentEvent}
            character={character}
            gameState={gameState}
            biography={biography}
            legacyGoalId={legacyGoalId}
            careerGoalId={character.careerGoal ?? props.careerGoalId ?? null}
            onRestart={handleRetryEnding}
            canRestart={canRetryEnding}
            restartLocked={retryEndingLocked}
            onReturnToMenu={handleReturnToMenu}
            onViewLifeReview={openLifeReview}
          />
        </div>
      )}

      {/* 死亡结局覆盖层 */}
      <DeathEnding
        isOpen={deathEndingState.show}
        endingType={deathEndingState.type}
        title={deathEndingState.title}
        description={deathEndingState.description}
        echo={deathEndingState.echo}
        tags={deathEndingState.tags}
        onClose={() => { closeDeathEnding(); openLifeReview() }}
        onRestart={handleRestart}
      />

      {/* 生平回顾（portal 到 body，作用域样式见 mobile.css） */}
      <LifeReview
        isOpen={isLifeReviewOpen}
        lifeRecords={lifeRecords}
        lifeSummary={lifeSummary}
        character={character}
        finalGameState={gameState}
        endingEvent={currentEvent ?? undefined}
        onClose={closeLifeReview}
        onRestart={handleRestart}
      />

      <SaveNotification
        isOpen={saveNotification.isOpen}
        onClose={closeSaveNotification}
        message={saveNotification.message}
        subMessage={saveNotification.subMessage}
      />

      <SaveSlotsModal
        isOpen={isSaveSlotsOpen}
        mode={saveSlotsMode}
        currentData={saveSlotsCurrentData}
        onSelect={saveSlotsMode === 'save' ? handleSaveToSlot : handleLoadFromSlot}
        onLoadAutosave={handleLoadAutosave}
        onClose={closeSaveSlots}
      />

      <ResignConfirmDialog
        open={resignConfirmModal.isOpen}
        choice={resignConfirmModal.choice}
        onConfirm={confirmResign}
        onCancel={cancelResign}
      />
    </div>
  )
}
