/**
 * 手机横屏版入口 —— 阶段状态机（标题 → 起名 → 出身 → 牌桌）。
 *
 * 与桌面 App.tsx 同一套阶段流转与存档口径（复用既有存储 / 成就 / 难度工具），
 * 但只装配手机屏；玩法规则仍在 useGameEngine 内部，这里不复制。
 */
import { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import type { OriginType, DegreeType, Attributes, CareerGoalId } from '../types/game'
import type { SaveData } from '../types/save'
import type { DifficultyLevel } from '../types/difficulty'
import { getAllSaveSlots, deleteAutosave, loadAutosave } from '../types/save'
import { origins } from '../data/origins'
import { setAchievementData } from '../types/achievement'
import { loadDifficulty, saveDifficulty } from '../types/difficulty'
import type { NameInputResult } from '../components/NameInput'
import LegacySelect from '../components/LegacySelect'
import CareerSelect from '../components/CareerSelect'
import type { LegacyPerkId } from '../data/legacy'

import MobileShell from './MobileShell'
import MobileTitle from './MobileTitle'
import MobileNameSetup from './MobileNameSetup'
import MobileOriginSetup from './MobileOriginSetup'
import MobileBoard from './MobileBoard'
import './mobile.css'

// 存档槽位、成就、结局图鉴、玩法说明都只在打开时加载；标题屏不为它们付首卡。
const SaveSlotsModal = lazy(() => import('../components/SaveSlotsModal'))
const AchievementPanel = lazy(() => import('../components/AchievementPanel'))
const EndingCodex = lazy(() => import('../components/EndingCodex'))
const TutorialModal = lazy(() => import('../components/TutorialModal'))

type MobilePhase = 'title' | 'name' | 'origin' | 'legacy' | 'career' | 'board'

const FALLBACK_ATTRIBUTES: Attributes = { 财帛: 0, 文韬: 0, 理政: 0, 武略: 0, 体质: 50 }

export default function MobileApp() {
  const [phase, setPhase] = useState<MobilePhase>('title')
  const [playerName, setPlayerName] = useState('')
  const [playerCourtesyName, setPlayerCourtesyName] = useState('')
  const [playerHometown, setPlayerHometown] = useState('')
  const [playerCustomAge, setPlayerCustomAge] = useState<number | null>(null)
  const [selectedOrigin, setSelectedOrigin] = useState<OriginType | null>(null)
  const [selectedLegacyPerk, setSelectedLegacyPerk] = useState<LegacyPerkId | null>(null)
  const [selectedCareerGoal, setSelectedCareerGoal] = useState<CareerGoalId | null>(null)
  const [finalDegree, setFinalDegree] = useState<DegreeType>('进士')
  const [finalAttributes, setFinalAttributes] = useState<Attributes | null>(null)
  const [loadSaveData, setLoadSaveData] = useState<SaveData | null>(null)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => loadDifficulty())
  const [isSaveSlotsOpen, setIsSaveSlotsOpen] = useState(false)
  const [isAchievementPanelOpen, setIsAchievementPanelOpen] = useState(false)
  const [isCodexOpen, setIsCodexOpen] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  // 通知 index.html 移除启动占位层（与桌面 App 同一信号）。
  useEffect(() => {
    window.dispatchEvent(new Event('app-ready'))
  }, [])

  const handleDifficultyChange = useCallback((next: DifficultyLevel) => {
    setDifficulty(next)
    saveDifficulty(next)
  }, [])

  /** 从存档对象恢复一局（口径同桌面 App.applySaveData）。 */
  const applySaveData = useCallback((saveData: SaveData) => {
    if (!saveData || !saveData.character || !saveData.gameState) return
    const restoredOrigin = saveData.origin && origins[saveData.origin] ? saveData.origin : '寒门'
    setLoadSaveData(saveData)
    setSelectedOrigin(restoredOrigin)
    setSelectedLegacyPerk(null)
    setSelectedCareerGoal(saveData.character.careerGoal ?? null)
    setPlayerName(saveData.character.name || '')
    setPlayerCourtesyName(saveData.character.courtesyName || '')
    setPlayerHometown(saveData.character.hometown || '')
    setPlayerCustomAge(saveData.character.age ?? null)
    setFinalDegree(saveData.degree || saveData.character.degree || '进士')
    setFinalAttributes(origins[restoredOrigin].initialAttributes)
    if (saveData.difficulty) setDifficulty(saveData.difficulty)
    setAchievementData(saveData.achievements || { unlocked: [], unlockTimes: {} })
    setPhase('board')
  }, [])

  const handleStart = useCallback(() => {
    setLoadSaveData(null)
    setSelectedLegacyPerk(null)
    setSelectedCareerGoal(null)
    setAchievementData({ unlocked: [], unlockTimes: {} })
    setPhase('name')
  }, [])

  const handleNameConfirm = useCallback((result: NameInputResult) => {
    setPlayerName(result.name)
    setPlayerCourtesyName(result.courtesyName)
    setPlayerHometown(result.hometown)
    setPlayerCustomAge(result.age)
    setPhase('origin')
  }, [])

  const handleOriginSelect = useCallback((origin: OriginType) => {
    deleteAutosave()
    setSelectedOrigin(origin)
    const originData = origins[origin]
    setFinalDegree((originData.initialDegree as DegreeType) || '进士')
    setFinalAttributes(originData.initialAttributes)
    setSelectedLegacyPerk(null)
    setSelectedCareerGoal(null)
    setPhase('legacy')
  }, [])

  const handleLegacyConfirm = useCallback((perkId: LegacyPerkId | null) => {
    setSelectedLegacyPerk(perkId)
    setSelectedCareerGoal(null)
    setPhase('career')
  }, [])

  const handleCareerConfirm = useCallback((goalId: CareerGoalId | null) => {
    setSelectedCareerGoal(goalId)
    setPhase('board')
  }, [])

  const handleOpenLoad = useCallback(() => setIsSaveSlotsOpen(true), [])

  const handleOpenAchievements = useCallback(() => setIsAchievementPanelOpen(true), [])
  const handleOpenCodex = useCallback(() => setIsCodexOpen(true), [])
  const handleOpenTutorial = useCallback(() => setShowTutorial(true), [])

  const handleLoadAutosave = useCallback(() => {
    const saveData = loadAutosave()
    if (!saveData) return
    setIsSaveSlotsOpen(false)
    applySaveData(saveData)
  }, [applySaveData])

  const handleSelectSaveSlot = useCallback((slotId: number) => {
    const slot = getAllSaveSlots().find(s => s.id === slotId)
    if (!slot?.data) return
    setIsSaveSlotsOpen(false)
    applySaveData(slot.data)
  }, [applySaveData])

  const handleReturnToMenu = useCallback(() => {
    setLoadSaveData(null)
    setPhase('title')
  }, [])

  return (
    <MobileShell>
      {phase === 'title' && (
        <MobileTitle
          onStart={handleStart}
          onContinueAutosave={handleLoadAutosave}
          onOpenLoad={handleOpenLoad}
          onOpenAchievements={handleOpenAchievements}
          onOpenCodex={handleOpenCodex}
          onOpenTutorial={handleOpenTutorial}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
        />
      )}

      {phase === 'name' && (
        <MobileNameSetup onConfirm={handleNameConfirm} onBack={() => setPhase('title')} />
      )}

      {phase === 'origin' && (
        <MobileOriginSetup onSelect={handleOriginSelect} onBack={() => setPhase('name')} />
      )}

      {phase === 'legacy' && (
        <LegacySelect onConfirm={handleLegacyConfirm} onBack={() => setPhase('origin')} />
      )}

      {phase === 'career' && (
        <CareerSelect onConfirm={handleCareerConfirm} onBack={() => setPhase('legacy')} />
      )}

      {phase === 'board' && selectedOrigin && (finalAttributes || loadSaveData) && (
        <MobileBoard
          origin={selectedOrigin}
          degree={finalDegree || loadSaveData?.character?.degree}
          bonusAttributes={finalAttributes || FALLBACK_ATTRIBUTES}
          playerName={playerName || loadSaveData?.character?.name || ''}
          playerCourtesyName={playerCourtesyName || loadSaveData?.character?.courtesyName || ''}
          playerHometown={playerHometown || loadSaveData?.character?.hometown || ''}
          playerCustomAge={playerCustomAge ?? loadSaveData?.character?.age ?? null}
          loadSaveData={loadSaveData ?? undefined}
          difficulty={difficulty}
          legacyPerkId={selectedLegacyPerk}
          careerGoalId={selectedCareerGoal}
          onReturnToMenu={handleReturnToMenu}
          onOpenAchievements={handleOpenAchievements}
          onOpenCodex={handleOpenCodex}
          onOpenTutorial={handleOpenTutorial}
          overlayOpen={isAchievementPanelOpen || isCodexOpen || showTutorial}
        />
      )}

      {isSaveSlotsOpen && (
        <Suspense fallback={null}>
          <SaveSlotsModal
            isOpen={isSaveSlotsOpen}
            mode="load"
            onSelect={handleSelectSaveSlot}
            onLoadAutosave={handleLoadAutosave}
            onClose={() => setIsSaveSlotsOpen(false)}
          />
        </Suspense>
      )}

      {isAchievementPanelOpen && (
        <Suspense fallback={null}>
          <AchievementPanel
            isOpen={isAchievementPanelOpen}
            onClose={() => setIsAchievementPanelOpen(false)}
          />
        </Suspense>
      )}

      {isCodexOpen && (
        <Suspense fallback={null}>
          <EndingCodex isOpen={isCodexOpen} onClose={() => setIsCodexOpen(false)} />
        </Suspense>
      )}

      {showTutorial && (
        <Suspense fallback={null}>
          <TutorialModal
            isOpen={showTutorial}
            onClose={() => setShowTutorial(false)}
            onComplete={() => {
              try {
                localStorage.setItem('chongzhen_tutorial_seen', 'true')
              } catch {
                // 隐私模式下写入失败，不影响继续游戏
              }
              setShowTutorial(false)
            }}
          />
        </Suspense>
      )}
    </MobileShell>
  )
}
