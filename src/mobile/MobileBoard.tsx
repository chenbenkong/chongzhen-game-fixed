/**
 * 手机横屏牌桌 —— 最小骨架。
 *
 * 玩法规则全部复用 useGameEngine 与既有事件数据；本文件只做手机原生布局：
 * 顶部 HUD / 中央事件卡 / 底部操作条。事件卡直接复用桌面 EventDisplay，
 * 包在 `.mobile-event-host` 作用域内，尺寸 / 排布由 mobile.css 覆盖。
 * 抉择门槛、投骰、失败回音一律沿用 EventDisplay 既有实现，不在此另写一套。
 */
import { useCallback, useMemo, useState } from 'react'
import type { OriginType, DegreeType, Attributes, GameStateValues } from '../types/game'
import type { SaveData } from '../types/save'
import type { DifficultyLevel } from '../types/difficulty'
import { useGameEngine } from '../hooks/useGameEngine'
import { toMingEraYear } from '../utils/endingSystem'

import EventDisplay from '../components/EventDisplay'
import GameOverScreen from '../components/GameOverScreen'
import LifeReview from '../components/LifeReview'
import DeathEnding from '../components/DeathEnding'
import SaveNotification from '../components/SaveNotification'
import SaveSlotsModal from '../components/SaveSlotsModal'
import ResignConfirmDialog from '../components/ResignConfirmDialog'

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
  onReturnToMenu?: () => void
}

/** 六项朝堂状态，与 gameState 的键一一对应。 */
const SIX_STATES: Array<keyof GameStateValues> = [
  '圣眷', '中官', '清议', '士绅', '民望', '国势'
]

export default function MobileBoard(props: MobileBoardProps) {
  const engine = useGameEngine(props)
  const {
    character,
    gameState,
    currentEvent,
    pendingEvents,
    undoHistory,
    promotionMessage,
    identityType,
    isGameOver,
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
  // 手机寸土寸金：底部操作条默认收起，只留一个浮动「操作」入口。
  const [isActionbarOpen, setIsActionbarOpen] = useState(false)

  const lifeSummary = useMemo(() => generateLifeSummary(), [generateLifeSummary])

  /** 统一推进：有事件续事件，无事件进下月（与桌面 canAdvance 语义一致）。 */
  const canAdvance = !currentEvent || eventResolved
  const advanceHint = canAdvance ? null : '请先在事件卡中做出选择'

  const handleAdvance = useCallback(() => {
    if (currentEvent) handleContinue()
    else handleNextMonth()
  }, [currentEvent, handleContinue, handleNextMonth])

  const modalOpen =
    diceModalOpen ||
    isSaveSlotsOpen ||
    isLifeReviewOpen ||
    resignConfirmModal.isOpen ||
    deathEndingState.show ||
    isGameOver

  const saveSlotsCurrentData = useMemo(() => ({
    name: character.name || '无名氏',
    year: gameState.currentYear,
    month: gameState.currentMonth,
    rank: character.rank,
    title: identityType === 'official' ? '官员' : '平民'
  }), [character.name, character.rank, gameState.currentYear, gameState.currentMonth, identityType])

  return (
    <div className="mobile-board">
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
            {character.age}岁 · {character.rank || identityType} · {character.origin}
          </span>
        </div>

        <div className="mobile-hud__states" aria-label="五方态度与国势">
          {SIX_STATES.map(key => (
            <span key={key} className="mobile-state-capsule">
              <span className="mobile-state-capsule__label">{key}</span>
              <span className="mobile-state-capsule__value">{gameState[key]}</span>
            </span>
          ))}
        </div>

        <button
          type="button"
          className="mobile-hud__action"
          onClick={() => setIsActionbarOpen(true)}
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

      {/* 主区：中央事件卡 */}
      <main className="mobile-board__main">
        <div className="mobile-event-host">
          <EventDisplay
            event={currentEvent}
            character={character}
            gameState={gameState}
            onChoice={handleChoice}
            onContinue={handleContinue}
            onResolvedChange={setEventResolved}
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

      {/* 底部操作条：默认收起，点顶栏「操作」才展开；展开后不再挤压事件区。 */}
      {isActionbarOpen && !modalOpen && (
        <footer className="mobile-actionbar" aria-label="牌桌操作">
          <button
            type="button"
            className="mobile-bar-btn"
            onClick={() => {
              setIsActionbarOpen(false)
              handleReturnToMenu()
            }}
            aria-label="返回标题"
          >
            标题
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

      {/* 结局屏（复用 GameOverScreen，作用域样式见 mobile.css） */}
      {isGameOver && (
        <div className="mobile-ending-host">
          <GameOverScreen
            endingEvent={currentEvent}
            character={character}
            gameState={gameState}
            biography={biography}
            onRestart={handleRestart}
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
