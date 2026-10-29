import { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import './App.css'
import NameInput, { NameInputResult } from './components/NameInput'
import OriginSelect from './components/OriginSelect'
import TitleScreen from './components/TitleScreen'
import GameScreen from './components/GameScreen'
import { BGMProvider } from './components/BGMContext'
import StorageAlerts from './components/StorageAlerts'
import { OriginType, DegreeType, Attributes } from './types/game'
import { SaveData, getAllSaveSlots, deleteAutosave, loadAutosave } from './types/save'
import { origins } from './data/origins'
import { setAchievementData } from './types/achievement'
import { DifficultyLevel, loadDifficulty, saveDifficulty } from './types/difficulty'

// 懒加载模态组件
const SaveSlotsModal = lazy(() => import('./components/SaveSlotsModal'))
const AchievementPanel = lazy(() => import('./components/AchievementPanel'))
const EndingCodex = lazy(() => import('./components/EndingCodex'))
const TutorialModal = lazy(() => import('./components/TutorialModal'))

type GamePhase = 'title' | 'name-input' | 'origin-select' | 'playing'

function App() {
  const [phase, setPhase] = useState<GamePhase>('title')
  const [playerName, setPlayerName] = useState('')
  const [playerCourtesyName, setPlayerCourtesyName] = useState('') // 字
  const [playerHometown, setPlayerHometown] = useState('') // 籍贯
  const [playerCustomAge, setPlayerCustomAge] = useState<number | null>(null) // 自定义起始年龄
  const [selectedOrigin, setSelectedOrigin] = useState<OriginType | null>(null)
  const [finalDegree, setFinalDegree] = useState<DegreeType>('进士')
  const [finalAttributes, setFinalAttributes] = useState<Attributes | null>(null)
  const [loadSaveData, setLoadSaveData] = useState<SaveData | null>(null)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => loadDifficulty())

  // 存档槽位弹窗状态
  const [isSaveSlotsOpen, setIsSaveSlotsOpen] = useState(false)
  const [saveSlotsMode, setSaveSlotsMode] = useState<'save' | 'load'>('load')

  // 成就面板状态
  const [isAchievementPanelOpen, setIsAchievementPanelOpen] = useState(false)

  // 结局图鉴状态
  const [isCodexOpen, setIsCodexOpen] = useState(false)

  // 教程弹窗状态
  const [showTutorial, setShowTutorial] = useState(false)

  // 通知 index.html 移除启动占位层（必须在这里：懒加载的 App 真正挂载后才算就绪）
  useEffect(() => {
    window.dispatchEvent(new Event('app-ready'))
  }, [])

  const handleDifficultyChange = useCallback((next: DifficultyLevel) => {
    setDifficulty(next)
    saveDifficulty(next)
  }, [])

  /** 从存档对象恢复一局游戏的公共逻辑 */
  const applySaveData = useCallback((saveData: SaveData) => {
    if (!saveData || !saveData.character || !saveData.gameState) return
    const restoredOrigin = saveData.origin && origins[saveData.origin] ? saveData.origin : '寒门'
    setLoadSaveData(saveData)
    setSelectedOrigin(restoredOrigin)
    // 这套 setup 状态同时是「死亡/结局后重新开始」的档案来源：读档时必须
    // 一起换成存档里的这一份，否则读档后重开会拿到「上一局的姓名 + 全零起始属性」
    // （finalAttributes 为 null 时 GameScreen 只拿到 {财帛:0,…,体质:50} 的兜底）。
    setPlayerName(saveData.character.name || '')
    setPlayerCourtesyName(saveData.character.courtesyName || '')
    setPlayerHometown(saveData.character.hometown || '')
    setPlayerCustomAge(saveData.character.age ?? null)
    setFinalDegree(saveData.degree || saveData.character.degree || '进士')
    setFinalAttributes(origins[restoredOrigin].initialAttributes)
    // 存档自带难度时以存档为准，否则沿用当前设置
    if (saveData.difficulty) setDifficulty(saveData.difficulty)
    // 读档时恢复成就
    setAchievementData(saveData.achievements || { unlocked: [], unlockTimes: {} })
    setPhase('playing')
  }, [])

  // 监听从 GameScreen 发来的加载存档事件
  useEffect(() => {
    const handleLoadSaveEvent = (e: CustomEvent<SaveData>) => {
      applySaveData(e.detail)
    }

    window.addEventListener('loadSave', handleLoadSaveEvent as EventListener)
    return () => {
      window.removeEventListener('loadSave', handleLoadSaveEvent as EventListener)
    }
  }, [applySaveData])

  const handleStart = useCallback(() => {
    setLoadSaveData(null)
    // 这里不能删自动存档：玩家还停在起名屏，随时可以点「返回」回标题，
    // 而旧进度要能继续读。真正的「新局开始」是 handleOriginSelect。
    // 成就数据是模块级单例（每个存档独立一份）。新开一局必须清空，
    // 否则上一局的成就状态会被沿用并写进新存档。
    setAchievementData({ unlocked: [], unlockTimes: {} })
    setPhase('name-input')
  }, [])

  const handleNameConfirm = useCallback((result: NameInputResult) => {
    setPlayerName(result.name)
    setPlayerCourtesyName(result.courtesyName)
    setPlayerHometown(result.hometown)
    setPlayerCustomAge(result.age)
    setPhase('origin-select')
  }, [])

  const handleOriginSelect = useCallback((origin: OriginType) => {
    // 身份已定、引擎马上挂载 —— 这一刻旧自动存档才真正作废
    deleteAutosave()
    setSelectedOrigin(origin)
    const originData = origins[origin]
    setFinalDegree((originData.initialDegree as DegreeType) || '进士')
    setFinalAttributes(originData.initialAttributes)
    setPhase('playing')
  }, [])

  const handleOpenLoad = useCallback(() => {
    setSaveSlotsMode('load')
    setIsSaveSlotsOpen(true)
  }, [])

  // 加载自动存档（"继续上次游戏"按钮）
  const handleLoadAutosave = useCallback(() => {
    // 走统一的 loadAutosave()：内含 schema 迁移与隐藏属性规整，
    // 不要再自己 JSON.parse 原始字符串（会绕过迁移）。
    const saveData = loadAutosave()
    if (!saveData) return
    // 必须显式关闭：这个弹窗与 phase 是平级的，切到 'playing' 不会把它顺带卸掉。
    // 缺了这一句，读档成功之后弹窗仍盖在游戏画面上（handleSelectSaveSlot 就有这一句）。
    setIsSaveSlotsOpen(false)
    applySaveData(saveData)
  }, [applySaveData])

  const handleSelectSaveSlot = useCallback(
    (slotId: number) => {
      const slot = getAllSaveSlots().find(s => s.id === slotId)
      if (!slot?.data) return
      setIsSaveSlotsOpen(false)
      applySaveData(slot.data)
    },
    [applySaveData]
  )

  const handleReturnToMenu = useCallback(() => {
    setLoadSaveData(null)
    setPhase('title')
  }, [])

  return (
    <BGMProvider>
      {/* 本地存储故障提示。挂在最外层，标题屏与游戏内都覆盖 ——
          "存档读不出来"恰恰发生在标题屏，此时玩家最需要知道发生了什么。 */}
      <StorageAlerts />
      <div className="app">
        {phase === 'title' && (
          <TitleScreen
            onStart={handleStart}
            onContinueAutosave={handleLoadAutosave}
            onOpenLoad={handleOpenLoad}
            onOpenAchievements={() => setIsAchievementPanelOpen(true)}
            onOpenCodex={() => setIsCodexOpen(true)}
            onOpenTutorial={() => setShowTutorial(true)}
            difficulty={difficulty}
            onDifficultyChange={handleDifficultyChange}
          />
        )}

        {phase === 'name-input' && (
          <div className="setup-screen">
            <NameInput onConfirm={handleNameConfirm} />
            <div className="setup-actions">
              <button className="back-btn" onClick={() => setPhase('title')}>
                ← 返回
              </button>
            </div>
          </div>
        )}

        {phase === 'origin-select' && (
          <div className="setup-screen">
            <OriginSelect onSelect={handleOriginSelect} />
            <div className="setup-actions">
              <button className="back-btn" onClick={() => setPhase('name-input')}>
                ← 返回
              </button>
            </div>
          </div>
        )}

        {phase === 'playing' && selectedOrigin && (finalAttributes || loadSaveData) && (
          <GameScreen
            origin={selectedOrigin}
            degree={finalDegree || loadSaveData?.character?.degree}
            bonusAttributes={
              finalAttributes || { 财帛: 0, 文韬: 0, 理政: 0, 武略: 0, 体质: 50 }
            }
            playerName={playerName || loadSaveData?.character?.name || ''}
            playerCourtesyName={playerCourtesyName || loadSaveData?.character?.courtesyName || ''}
            playerHometown={playerHometown || loadSaveData?.character?.hometown || ''}
            playerCustomAge={playerCustomAge ?? loadSaveData?.character?.age ?? null}
            loadSaveData={loadSaveData ?? undefined}
            difficulty={difficulty}
            onReturnToMenu={handleReturnToMenu}
          />
        )}

        {/* 存档槽位选择弹窗 */}
        <Suspense fallback={null}>
          <SaveSlotsModal
            isOpen={isSaveSlotsOpen}
            mode={saveSlotsMode}
            onSelect={handleSelectSaveSlot}
            onLoadAutosave={handleLoadAutosave}
            onClose={() => setIsSaveSlotsOpen(false)}
          />
        </Suspense>

        {/* 成就面板 */}
        <Suspense fallback={null}>
          <AchievementPanel
            isOpen={isAchievementPanelOpen}
            onClose={() => setIsAchievementPanelOpen(false)}
          />
        </Suspense>

        <Suspense fallback={null}>
          <EndingCodex isOpen={isCodexOpen} onClose={() => setIsCodexOpen(false)} />
        </Suspense>

        {/* 教程弹窗 */}
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
      </div>
    </BGMProvider>
  )
}

export default App
