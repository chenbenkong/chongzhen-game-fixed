import { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import './App.css'
import NameInput, { NameInputResult } from './components/NameInput'
import OriginSelect from './components/OriginSelect'
import TitleScreen from './components/TitleScreen'
import { BGMProvider } from './components/BGMContext'
import ErrorBoundary from './components/ErrorBoundary'
import StorageAlerts from './components/StorageAlerts'
import { OriginType, DegreeType, Attributes } from './types/game'
import { SaveData, getAllSaveSlots, deleteAutosave, loadAutosave } from './types/save'
import { origins } from './data/origins'
import { setAchievementData } from './types/achievement'
import { DifficultyLevel, loadDifficulty, saveDifficulty } from './types/difficulty'
import { detectMobileMode } from './mobile/detect'

/**
 * 游戏主界面（引擎 + 全部事件数据）**懒加载**。
 *
 * 为什么：`events/index.ts` 是静态 import 全部年份的，而它挂在 useGameEngine 下面。
 * 只要 App 静态 import 了 GameScreen，标题屏就会把 15 个事件分片一并预取 ——
 * 实测（本地静态服务、未压缩字节）标题屏 9.35 MB，其中 2.47 MB 是玩家还没开局
 * 就先付的事件数据（5.71 MB 是那口没人听的 bgm，见 BGMContext）。
 *
 * 标题屏只需要标题组件，所以这里按"玩家真的要走进去"为界切开。
 *
 * 为什么是 `let` 而不是 `const`：`React.lazy` 会把**失败的那个 promise** 缓存住，
 * 分片一旦加载失败（弱网、运营商劫持、部署瞬间换了 hash），重渲染只会把同一个
 * 失败的 promise 再抛回来 —— 第七十八轮在 App 上踩过这个坑（「继续游戏」是死按钮）。
 * 现在这条懒加载边界是新的，同样的坑必须同样堵上：重试时换一个全新的 lazy 实例。
 */
const loadGameScreen = () => import('./components/GameScreen')
let GameScreenLazy = lazy(loadGameScreen)

// 手机横屏版整包懒加载：与桌面 GameScreen 同一条分包线，桌面标题屏不背游戏主包。
const MobileAppLazy = lazy(() => import('./mobile/MobileApp'))

/**
 * 预取游戏主包。玩家一旦表现出"要玩"的意图（点标题屏任意位置、按任意键）就开始拉，
 * 等真的进到游戏界面时通常已经就绪 —— 只有"打开看一眼、什么都没点"的访客不付这笔钱。
 *
 * 单独包一层 `gameScreenWarm`：预取失败时把缓存清掉，
 * 免得一次弱网失败把后面所有的重试都钉死在那个 reject 的 promise 上。
 */
let gameScreenWarm: Promise<unknown> | null = null
function prefetchGameScreen() {
  if (!gameScreenWarm) {
    gameScreenWarm = loadGameScreen().catch(err => {
      gameScreenWarm = null
      throw err
    })
  }
  return gameScreenWarm
}

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
  // 难度选择状态
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => loadDifficulty())

  // 游戏主包重试计数：换 lazy 实例之外再换 key，确保子树真的重挂载
  const [gameScreenTry, setGameScreenTry] = useState(0)

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

  /**
   * 标题屏上的第一次交互 = 玩家大概率要玩，此刻开始预取游戏主包。
   *
   * 为什么把信号放在"交互"而不是"挂载后空闲"：只是打开首页看一眼的访客
   * 不该付 2.5 MB；而真要玩的人一定会点，点击到真正进游戏之间还隔着
   * 起名与选出身两屏，正好把下载藏在这几秒里。
   *
   * 预取失败要自己咽下去（catch 空实现）：它是**顺手**行为，失败时真正该报错的地方
   * 是 GameScreen 渲染的那一刻（由 ErrorBoundary 接住）。否则弱网下玩家还没进游戏，
   * 控制台就先多一条"未捕获的错误"，看着像游戏已经崩了。
   */
  useEffect(() => {
    if (phase !== 'title') return
    const warm = () => {
      prefetchGameScreen().catch(() => {})
    }
    document.addEventListener('pointerdown', warm, { once: true, passive: true })
    document.addEventListener('keydown', warm, { once: true })
    return () => {
      document.removeEventListener('pointerdown', warm)
      document.removeEventListener('keydown', warm)
    }
  }, [phase])

  /**
   * 游戏主包分片加载失败后重建 lazy 实例。
   *
   * `React.lazy` 缓存的是失败的那个 promise，只清 ErrorBoundary 的 state 没用：
   * 重渲染会把同一个 reject 再抛回来。必须换一个全新的 lazy 实例（新 promise），
   * 再靠 key 变化让子树重挂载。这与 main.tsx 里对 App 的处理是同一套办法。
   */
  const retryGameScreen = useCallback(() => {
    GameScreenLazy = lazy(loadGameScreen)
    gameScreenWarm = null
    setGameScreenTry(t => t + 1)
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
    // 点「开始仕途」就是最明确的意图信号：此刻就把游戏主包拉下来，
    // 起名/选出身这两屏的几秒正好覆盖下载时间。
    // 同上：预取失败在这里不报，交给渲染时的 ErrorBoundary。
    prefetchGameScreen().catch(() => {})
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

  // 手机横屏版入口：检测命中时整棵子树切到 MobileApp。
  // 桌面分支的 JSX / className / 导入顺序保持逐字等价，下面的 return 不再改动。
  if (detectMobileMode()) {
    return (
      <BGMProvider defaultOn>
        <StorageAlerts />
        <Suspense
          fallback={
            <div className="game-boot" role="status" aria-live="polite">
              <div className="game-boot__title">崇祯</div>
              <div className="game-boot__bar" />
              <div className="game-boot__hint">正在展开卷宗…</div>
            </div>
          }
        >
          <MobileAppLazy />
        </Suspense>
      </BGMProvider>
    )
  }

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
          // 懒加载边界：主包未就绪时先给一个与启动层同款的最小占位，
          // 而不是让 #root 空着（空着就是黑屏）。
          //
          // 内层 ErrorBoundary 只为了一件事：这个分片加载失败时，
          // 「继续游戏」能真的换一个新 lazy 实例重发请求（见 loadGameScreen 上方的注释）。
          // 它沿用同一个 ErrorBoundary 组件，失败时的界面与全局错误页完全一致。
          <Suspense
            fallback={
              <div className="game-boot" role="status" aria-live="polite">
                <div className="game-boot__title">崇祯</div>
                <div className="game-boot__bar" />
                <div className="game-boot__hint">正在展开卷宗…</div>
              </div>
            }
          >
            <ErrorBoundary onRetryChunk={retryGameScreen}>
              <GameScreenLazy
                key={gameScreenTry}
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
            </ErrorBoundary>
          </Suspense>
        )}

        {/* 存档槽位选择弹窗。
            **只在打开时挂载**：这四个弹窗此前是无条件渲染的，组件内部用
            `if (!isOpen) return null` 收尾 —— 看起来"什么都没渲染"，
            但 React.lazy 的 import 是在**元素创建时**就发起的，
            于是标题屏一口气把 4 个弹窗分片全下了，还顺带把
            events-ending（205 KB）与 events-transition-misc（133 KB）拖进来。
            它们的关闭态本来就没有退场动画（组件直接 return null），
            所以条件挂载不会丢任何过渡效果。 */}
        {isSaveSlotsOpen && (
          <Suspense fallback={null}>
            <SaveSlotsModal
              isOpen={isSaveSlotsOpen}
              mode={saveSlotsMode}
              onSelect={handleSelectSaveSlot}
              onLoadAutosave={handleLoadAutosave}
              onClose={() => setIsSaveSlotsOpen(false)}
            />
          </Suspense>
        )}

        {/* 成就面板 */}
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

        {/* 教程弹窗 */}
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
      </div>
    </BGMProvider>
  )
}

export default App
