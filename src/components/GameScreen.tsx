import { lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OriginType, DegreeType, Attributes } from '../types/game'
import { SaveData } from '../types/save'
import { DifficultyLevel, DIFFICULTY_CONFIGS } from '../types/difficulty'
import { useGameShortcuts } from '../hooks/useGameShortcuts'
import { useGameEngine, RANKS } from '../hooks/useGameEngine'
import StatusBar from './StatusBar'
import AttributePanel from './AttributePanel'
import StatusPanel from './StatusPanel'
import EventDisplay from './EventDisplay'
import ActionBar from './ActionBar'
import GameOverScreen from './GameOverScreen'
import CheatMode from './CheatMode'
import LifeReview from './LifeReview'
import DeathEnding from './DeathEnding'
import SaveNotification from './SaveNotification'
import SaveSlotsModal from './SaveSlotsModal'

import AchievementPanel from './AchievementPanel'
import TutorialModal from './TutorialModal'
import StorylineBar from './StorylineBar'
import ResignConfirmDialog from './ResignConfirmDialog'

import './GameScreen.css'

const AIAdvisor = lazy(() => import('./AIAdvisor'))
const ImageGenerator = lazy(() => import('./ImageGenerator'))
/**
 * inert 属性在 React 18 的 JSX 类型里还没有声明，这里用条件展开绕过类型限制
 * （返回的是收窄的联合类型，可安全展开到 JSX 上），运行时就是原生属性。
 * inert 会把整棵子树从焦点顺序与无障碍树中移除。
 */
const inertProps = (on: boolean): Record<never, never> | { inert: string } => (on ? { inert: '' } : {})

interface GameScreenProps {
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

function GameScreen(props: GameScreenProps) {
  const {
    character,
    gameState,
    currentEvent,
    pendingEvents,
    eventHistory,
    undoHistory,
    meritScore,
    promotionMessage,
    identityType,
    isGameOver,
    saveNotification,
    resignConfirmModal,
    isCheatModeOpen,
    isSaveSlotsOpen,
    saveSlotsMode,
    isAchievementPanelOpen,
    showTutorial,
    showHelp,
    showAIAdvisor,
    showImageGenerator,
    lifeRecords,
    isLifeReviewOpen,
    deathEndingState,
    biography,
    isProcessing,
    openCheatMode,
    closeCheatMode,
    openAchievementPanel,
    closeAchievementPanel,
    openHelp,
    closeHelp,
    openAIAdvisor,
    closeAIAdvisor,
    openImageGenerator,
    closeImageGenerator,
    openLifeReview,
    closeLifeReview,
    closeTutorial,
    completeTutorial,
    closeSaveNotification,
    closeSaveSlots,
    closeDeathEnding,
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
    getCurrentStoryline,
    generateLifeSummary
  } = useGameEngine(props)

  const currentStorylineKey = useMemo(() => getCurrentStoryline(), [getCurrentStoryline])

  const saveSlotsCurrentData = useMemo(() => ({
    name: character.name || '无名氏',
    year: gameState.currentYear,
    month: gameState.currentMonth,
    rank: character.rank,
    title: identityType === 'official' ? '官员' : identityType === 'civilian' ? '平民' : '其他'
  }), [character.name, character.rank, gameState.currentYear, gameState.currentMonth, identityType])

  const aiAdvisorContext = useMemo(() => ({
    year: gameState.currentYear,
    month: gameState.currentMonth,
    turn: gameState.turn,
    playerName: character.name || '某',
    courtesyName: character.courtesyName || '',
    hometown: character.hometown || '',
    age: character.age,
    origin: character.origin,
    rank: character.rank,
    degree: character.degree,
    attributes: { ...character.attributes },
    hidden: { ...character.hidden },
    gameState: {
      圣眷: gameState.圣眷,
      中官: gameState.中官,
      清议: gameState.清议,
      士绅: gameState.士绅,
      民望: gameState.民望,
      国势: gameState.国势
    },
    currentEventTitle: currentEvent?.title,
    currentEventDescription: currentEvent?.description,
    currentChoices: currentEvent?.choices?.map(c => c.text),
    recentRecords: lifeRecords.slice(-5).map(r => `崇祯${r.year}年${r.month}月：${r.title}`)
  }), [character, gameState, currentEvent, lifeRecords])

  const imageGeneratorContext = useMemo(() => ({
    playerName: character.name || '某',
    playerCourtesyName: character.courtesyName || '',
    hometown: character.hometown || '',
    age: character.age,
    origin: character.origin,
    rank: character.rank,
    degree: character.degree,
    year: gameState.currentYear,
    month: gameState.currentMonth,
    currentEventId: currentEvent?.id,
    currentEventTitle: currentEvent?.title,
    currentEventDescription: currentEvent?.description,
    currentEventBackground: currentEvent?.narrative?.background,
    currentChoices: currentEvent?.choices?.map(c => c.text)
  }), [character, gameState.currentYear, gameState.currentMonth, currentEvent])

  const lifeSummary = useMemo(() => generateLifeSummary(), [generateLifeSummary])

  // 结局屏打开时把整个仍在运行的游戏从无障碍树与 Tab 顺序里移除，
  // 否则键盘用户可以 Tab 进被 z-index 9999 盖住的游戏界面，结局也不会被播报。
  const endingContainerRef = useRef<HTMLDivElement>(null)

  /**
   * 当前事件的抉择是否已作出（由 EventDisplay 上报）。
   *
   * 「进 下 月」此前只看 `!currentEvent`，于是只要屏幕上有事件就永久禁用 ——
   * 实测正常游玩 120 步，它的可点状态出现 **0** 次，是死 UI。
   * 而玩家看到的是一个灰掉的、看起来像主操作的按钮，必然当成 bug。
   *
   * 现在按真实语义判断：
   *   · 没有事件            → 可点，直接进入下月
   *   · 有事件且已作出抉择  → 可点，作用等同于事件面板里的「继 续」
   *   · 有事件但还没选      → 禁用（必须先做抉择，否则等于可以跳过）
   */
  const [eventResolved, setEventResolved] = useState(false)

  // 无需在此额外复位：EventDisplay 的 onResolvedChange 依赖 event?.id，
  // 事件一变（包括读档、重开）就会自动上报 false。

  /** 统一的"往前推进"：有事件就续事件，没事件就进月 */
  const handleAdvance = useCallback(() => {
    if (currentEvent) {
      handleContinue()
    } else {
      handleNextMonth()
    }
  }, [currentEvent, handleContinue, handleNextMonth])

  // isProcessing **不再**算「可点」。推进真正落地是在 handleNextMonth 里排的那个
  // 300ms 定时器之后，把这段窗口算作可点会让双击 / 连按 Space 变成跳过两个月
  // （turn +2、增龄两次、两批事件 id 各写一次历史、pendingEvents 被覆盖）。
  const canAdvance = !currentEvent || eventResolved

  const advanceHint = useMemo(() => {
    if (canAdvance) return null
    // 还没选 —— 这里不能说"点继 续"，因为此刻「继 续」按钮还不存在
    // （它只在结果态渲染）。此前正是这句不准确的文案把人引到找不到按钮。
    return '请先在事件面板中做出选择'
  }, [canAdvance])

  /** 是否有弹窗 / 面板处于打开状态。打开时不该响应游戏快捷键 */
  const modalOpen =
    isCheatModeOpen ||
    isSaveSlotsOpen ||
    showTutorial ||
    showHelp ||
    showAIAdvisor ||
    showImageGenerator ||
    isLifeReviewOpen ||
    isAchievementPanelOpen ||
    resignConfirmModal.isOpen ||
    // 结局屏已经接管画面，此时任何游戏快捷键都不该再生效
    isGameOver

  // Space / Enter 推进，S 存档，A 成就，H 帮助。
  // 数字键在 EventDisplay 内部处理（它才知道哪个选项可选）。
  useGameShortcuts({
    onPickChoice: () => {
      /* 由 EventDisplay 自行处理，这里不参与 */
    },
    onAdvance: handleAdvance,
    onSave: handleSave,
    onAchievements: openAchievementPanel,
    onHelp: openHelp,
    // 这两类门控必须分开。此前是 `blocked: modalOpen || !canAdvance` 一个开关管到底，
    // 而「事件还没做出抉择」正好是 canAdvance=false 的主场景 —— 于是玩家面对一个
    // 读不懂的事件时，按 H 调不出帮助、按 S 存不了档、按 A 打不开成就，
    // 三个纯查看功能被一个推进用的门一起锁死，恰好卡在玩家最需要它们的时候。
    blocked: modalOpen,
    blockedAdvance: !canAdvance
  })

  useEffect(() => {
    if (!isGameOver) return
    // 等 GameOverScreen 挂载完成后再移入焦点
    const timer = window.setTimeout(() => {
      const container = endingContainerRef.current
      if (!container) return
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
      container.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isGameOver])

  const identityPanelClass = `identity-panel identity-panel--${
    identityType === 'official' ? 'official' :
    identityType === 'rebel' ? 'rebel' :
    identityType === 'exiled' ? 'exiled' : 'other'
  }`

  // 「下一级需多少分」必须换算到面板展示所用的那把标尺上。
  // 升迁判定比较的是 baseScore / promotionThresholdMultiplier 与 RANKS.minScore，
  // 而这里显示的是未经换算的 meritScore —— 两边不换算，就会出现
  // 「显示 620/需 700，却已经连升两级」或「明明过了 700 却一动不动」。
  // 换到同一口径即 minScore × 系数（两者数学等价：base/mult ≥ min ⟺ base ≥ min×mult）。
  const nextRankRequirement = useMemo(() => {
    const mult = DIFFICULTY_CONFIGS[props.difficulty].promotionThresholdMultiplier
    const next = RANKS.find(r => r.minScore * mult > meritScore)
    return next ? Math.round(next.minScore * mult) : null
  }, [props.difficulty, meritScore])

  const identityTitle = identityType === 'official' ? '官 职' :
    identityType === 'rebel' ? '反 贼 身 份' :
    identityType === 'exiled' ? '罪 臣 身 份' :
    identityType === 'retired' ? '归 隐 身 份' : '民 间 身 份'

  const identityDesc = identityType === 'official'
    ? `朝廷命官，当前政绩分${meritScore}，下一级需${nextRankRequirement ?? '已达最高'}分`
    : identityType === 'rebel'
    ? '占山为王，与朝廷为敌'
    : identityType === 'exiled'
    ? '革职查办，待罪之身'
    : identityType === 'retired'
    ? '辞官归隐，不问世事'
    : '一介布衣，无权无势'

  return (
    <div className={`game-screen ${isGameOver ? 'game-screen--ended' : ''}`}>
      {isGameOver && (
        <div ref={endingContainerRef} tabIndex={-1}>
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

      {promotionMessage && (
        <div
          className={`promotion-toast ${promotionMessage.includes('恭喜') ? 'promotion-toast--promote' : 'promotion-toast--demote'}`}
          role="alert"
        >
          {promotionMessage}
        </div>
      )}

      {/* 游戏主体：结局屏出现后隐藏于无障碍树且不可 Tab（视觉不变） */}
      <div
        className="game-screen-body"
        aria-hidden={isGameOver ? 'true' : undefined}
        {...inertProps(isGameOver)}
      >
        <StatusBar
          character={character}
          gameState={gameState}
          degree={props.degree}
          onCheatClick={openCheatMode}
        />

        <StorylineBar
          currentStorylineKey={currentStorylineKey}
          eventCount={eventHistory.length}
        />

        <Suspense fallback={null}>
          <CheatMode
            isOpen={isCheatModeOpen}
            onClose={closeCheatMode}
            currentGameState={{
              currentYear: gameState.currentYear,
              currentMonth: gameState.currentMonth,
              turn: 0,
              eventHistory: []
            }}
            currentCharacter={character}
            currentGameStateValues={gameState}
          />
        </Suspense>

        <div className="game-main">
          <aside className="sidebar">
            <AttributePanel
              attributes={character.attributes}
              hidden={character.hidden}
            />

            <div className={identityPanelClass}>
              <h2>{identityTitle}</h2>
              <div className="identity-rank">
                {character.rank}
              </div>
              <div className="identity-desc">
                {identityDesc}
              </div>
            </div>
          </aside>

          <main className="main-content">
            <EventDisplay
              event={currentEvent}
              character={character}
              gameState={gameState}
              onChoice={handleChoice}
              onContinue={handleContinue}
              onResolvedChange={setEventResolved}
              shortcutsEnabled={!modalOpen}
              onUndo={handleUndo}
              onGameOver={handleGameOver}
              onDeathEnding={handleDeathEnding}
              canUndo={undoHistory.length > 0}
              isProcessing={isProcessing}
              pendingCount={pendingEvents.length}
            />
          </main>

          <aside className="right-sidebar">
            <StatusPanel gameState={gameState} />

            {identityType === 'official' && (
              <div className="merit-panel">
                <h2>政 绩 评 定</h2>
                <div className="merit-score-row">
                  <span className="merit-score-label">当前政绩分</span>
                  <span className="merit-score-value">{meritScore}</span>
                </div>
                <div className="merit-bar-track">
                  <div className="merit-bar-fill" style={{ width: `${Math.min(100, (meritScore / 1100) * 100)}%` }} />
                </div>
                <div className="merit-next">
                  下一级需: {RANKS.find(r => r.minScore > meritScore)?.minScore || '已达最高'} 分
                </div>
              </div>
            )}
          </aside>
        </div>

        <ActionBar
          onNextMonth={handleAdvance}
          onSave={handleSave}
          onOpenAchievements={openAchievementPanel}
          onOpenAIAdvisor={openAIAdvisor}
          onOpenImageGenerator={openImageGenerator}
          onReturnToMenu={handleReturnToMenu}
          turn={gameState.turn}
          pendingCount={pendingEvents.length}
          canProceed={canAdvance}
          blockedReason={advanceHint ?? undefined}
        />

        <ResignConfirmDialog
          open={resignConfirmModal.isOpen}
          choice={resignConfirmModal.choice}
          onConfirm={confirmResign}
          onCancel={cancelResign}
        />

        <DeathEnding
          isOpen={deathEndingState.show}
          endingType={deathEndingState.type}
          title={deathEndingState.title}
          description={deathEndingState.description}
          echo={deathEndingState.echo}
          tags={deathEndingState.tags}
          onClose={() => {
            closeDeathEnding()
            openLifeReview()
          }}
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

        <AchievementPanel
          isOpen={isAchievementPanelOpen}
          onClose={closeAchievementPanel}
        />

        <TutorialModal
          isOpen={showTutorial}
          onClose={closeTutorial}
          onComplete={completeTutorial}
        />

        <TutorialModal
          isOpen={showHelp}
          onClose={closeHelp}
          onComplete={closeHelp}
        />
      </div>

      {/* 以下组件的弹窗都 portal 到 body，必须放在 inert 容器之外才能保持可交互 */}
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

      <Suspense fallback={null}>
        <AIAdvisor
          isOpen={showAIAdvisor}
          onClose={closeAIAdvisor}
          gameContext={aiAdvisorContext}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ImageGenerator
          isOpen={showImageGenerator}
          onClose={closeImageGenerator}
          context={imageGeneratorContext}
        />
      </Suspense>
    </div>
  )
}

export default memo(GameScreen)
