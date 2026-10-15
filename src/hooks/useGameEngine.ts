import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Character, GameStateValues, OriginType, DegreeType, Attributes, LifeRecord, LifeSummary, PlayerFaction, HiddenAttributes, HIDDEN_DEFAULTS, normalizeHidden } from '../types/game'
import { GameEvent, EventChoice } from '../types/event'
import { SaveData, PlayerStats, createEmptyPlayerStats, normalizePlayerStats, saveSaveSlot, loadSaveSlot, saveAutosave, loadAutosave, deleteAutosave } from '../types/save'
import { checkAndUnlockAchievements, loadAchievements, Achievement, AchievementContext } from '../types/achievement'
import { DifficultyLevel, getDifficultyConfig } from '../types/difficulty'
import { initialEvents, allGrayChoiceEvents } from '../data/events/index'
import { origins } from '../data/origins'
import { boundaryEventManager } from '../services/BoundaryEventManager'
import '../data/boundaryEvents'
import { triggerEndingAchievements, generateBiography, pickKeyLifeRecords } from '../utils/endingSystem'
import { ATTR_MAP, STATE_MAP, ATTR_BOUNDS } from '../utils/constants'
import { checkEventConditions, pickEvent } from '../utils/eventConditions'

// 身份类型
type IdentityType = 'official' | 'civilian' | 'rebel' | 'exiled' | 'retired'

// 官职体系 - 按明朝官制，每级差100分
// 主角从正七品知县开始，初始分530分
export const RANKS = [
  { level: 1, name: '从九品·司狱', minScore: 0, type: 'official' as IdentityType },
  { level: 2, name: '正九品·主簿', minScore: 50, type: 'official' as IdentityType },
  { level: 3, name: '从八品·县丞', minScore: 100, type: 'official' as IdentityType },
  { level: 4, name: '正八品·照磨', minScore: 150, type: 'official' as IdentityType },
  { level: 5, name: '从七品·判官', minScore: 200, type: 'official' as IdentityType },
  { level: 6, name: '正七品·知县', minScore: 250, type: 'official' as IdentityType },
  { level: 7, name: '从六品·通判', minScore: 320, type: 'official' as IdentityType },
  { level: 8, name: '正六品·同知', minScore: 390, type: 'official' as IdentityType },
  { level: 9, name: '从五品·知州', minScore: 460, type: 'official' as IdentityType },
  { level: 10, name: '正五品·郎中', minScore: 530, type: 'official' as IdentityType },
  { level: 11, name: '从四品·少卿', minScore: 600, type: 'official' as IdentityType },
  { level: 12, name: '正四品·知府', minScore: 670, type: 'official' as IdentityType },
  { level: 13, name: '从三品·侍郎', minScore: 740, type: 'official' as IdentityType },
  { level: 14, name: '正三品·大理寺卿', minScore: 810, type: 'official' as IdentityType },
  { level: 15, name: '从二品·布政使', minScore: 880, type: 'official' as IdentityType },
  { level: 16, name: '正二品·尚书', minScore: 950, type: 'official' as IdentityType },
  { level: 17, name: '从一品·少师', minScore: 1020, type: 'official' as IdentityType },
  { level: 18, name: '正一品·太师', minScore: 1100, type: 'official' as IdentityType }
]

// 升官缓冲分：每升一级额外加20分，防止刚升官就贬官
const PROMOTION_SCORE_BONUS = 20

/**
 * 游玩时长的心跳周期（毫秒）。
 * 取 30 秒是个折中：足够粗，不会因为频繁 setState 引起无谓重渲染；
 * 又足够细，切屏/存档时被"舍去"的误差最多 30 秒。
 * 真正写存档时用 getTotalPlayTime() 补齐不足一个周期的部分，所以误差不会累积。
 */
const PLAY_TIME_TICK_MS = 30_000

/**
 * crisis 类临界事件（如「重病缠身」）的触发概率门。
 *
 * 这些事件的条件本身就很苛刻（例如体质 < 20），所以 0.3 并不等于"每三回合必出一次"：
 * 它只在玩家已经处于危险状态时才会被抽到，大致相当于身体状况差时每几个月发作一次。
 * 挂载路径与 checkBoundary 共用这一个常量，避免两处概率漂移。
 */
const CRISIS_EVENT_PROBABILITY = 0.3

/**
 * 把政绩分换算成 RANKS 里的「升序下标」（0 = 从九品司狱，越大官越高）。
 * 注意 RANKS 是按 minScore 升序排列的，所以必须取「最后一个满足 score >= minScore」
 * 的下标。早先此处误写成 `RANKS.findIndex(r => score >= r.minScore)`，由于
 * RANKS[0].minScore === 0，该表达式恒等于 0，导致 checkDemotion 里
 * `newRankIndex < previousRankIndex` 永远为假 —— 整条「贬官」机制形同虚设。
 */
function rankIndexForScore(score: number): number {
  let index = 0
  for (let i = 0; i < RANKS.length; i++) {
    if (score >= RANKS[i].minScore) index = i
  }
  return index
}

// 计算政绩分 - 基于基础分加上属性变化的影响
// 主角从正七品知县开始，基础分280分（250基准 + 30缓冲）
const BASE_MERIT_SCORE = 280

// 重要事件类型，会有额外政绩分加成
const IMPORTANT_EVENT_TYPES = ['historical', 'ending']

export interface UseGameEngineProps {
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

// 出身特性修正：属性效果
function applyOriginModifier(origin: OriginType, attrKey: string, value: number): number {
  if (origin === '寒门') {
    if (attrKey === '文韬' && value > 0) return Math.round(value * 1.15)
  }
  if (origin === '缙绅') {
    if (attrKey === '财帛' && value > 0) return Math.round(value * 1.1)
    if (attrKey === '理政' && value > 0) return Math.round(value * 1.1)
  }
  if (origin === '没落世家') {
    if (attrKey === '武略' && value > 0) return Math.round(value * 1.2)
    if (attrKey === '文韬' && value > 0) return Math.round(value * 0.8)
  }
  if (origin === '诗文清望') {
    if (attrKey === '文韬' && value > 0) return Math.round(value * 1.25)
    if (attrKey === '武略' && value > 0) return Math.round(value * 0.7)
  }
  return value
}

// 出身特性修正：五方态度效果
function applyOriginStateModifier(origin: OriginType, stateKey: string, value: number): number {
  if (origin === '寒门') {
    if (stateKey === '清议') return Math.round(value * 1.5)
    if (stateKey === '士绅' && value > 0) return Math.round(value * 0.7)
  }
  if (origin === '缙绅') {
    if (stateKey === '士绅' && value > 0) return Math.round(value * 1.2)
    if (stateKey === '圣眷' && value > 0) return Math.round(value * 0.9)
  }
  if (origin === '没落世家') {
    if (stateKey === '中官' && value > 0) return Math.round(value * 1.15)
    if (stateKey === '清议' && value > 0) return Math.round(value * 0.8)
  }
  if (origin === '诗文清望') {
    if (stateKey === '清议' && value > 0) return Math.round(value * 1.25)
    if (stateKey === '中官' && value > 0) return Math.round(value * 0.7)
  }
  return value
}

/**
 * 「辞官/归隐」类结局文案。这类结局不可逆，需要二次确认。
 * 判定口径与数据侧约定一致：没有独立的标记字段，只能读选项文本。
 */
function isResignEndingChoice(choice: EventChoice): boolean {
  return choice.text.includes('辞官') ||
    choice.text.includes('归隐') ||
    choice.text.includes('请辞') ||
    choice.text.includes('致仕') ||
    choice.text.includes('挂冠') ||
    choice.text.includes('急流勇退') ||
    choice.text.includes('隐姓埋名')
}

/**
 * 破产结局在 BoundaryEventManager 里注册的 id 是 `triggerable_bankrupt`，
 * 而结局成就与图鉴登记认的是 `ending_bankrupt`。
 * 这里保留成就侧 id、改用注册版本携带的完整叙事（引文 / 处境 / 【结局·倾家荡产】回声）。
 * 此前引擎里手抄了一份只有两句描述的克隆，玩家看到的永远是干瘪版本，
 * 那整段结局回声从未显示过。
 */
function withEndingId(event: GameEvent): GameEvent {
  return { ...event, id: 'ending_bankrupt' }
}

function calculateMeritScore(
  character: Character,
  gameState: GameStateValues,
  baseScore: number = BASE_MERIT_SCORE,
  eventType?: string,
  isImportant: boolean = false
): number {
  const attrs = character.attributes
  let score = baseScore

  if (character.degree === '进士') {
    score += 60
  } else if (character.degree === '举人') {
    score += 30
  }

  score += (attrs.理政 - 50) * 1.2
  score += (attrs.文韬 - 50) * 0.9
  score += (attrs.武略 - 50) * 0.7
  score += (gameState.圣眷 - 50) * 0.9
  score += (gameState.民望 - 50) * 0.8

  if (isImportant || (eventType && IMPORTANT_EVENT_TYPES.includes(eventType))) {
    score += 80
  }

  return Math.floor(score)
}

function checkPromotion(currentScore: number, previousScore: number): { promoted: boolean; newRank?: string; message?: string; scoreBonus?: number } {
  const currentRankIndex = RANKS.slice().reverse().findIndex(r => currentScore >= r.minScore)
  const previousRankIndex = RANKS.slice().reverse().findIndex(r => previousScore >= r.minScore)
  const actualCurrentIndex = RANKS.length - 1 - currentRankIndex
  const actualPreviousIndex = RANKS.length - 1 - previousRankIndex

  if (actualCurrentIndex > actualPreviousIndex) {
    const newRank = RANKS[actualCurrentIndex]
    return {
      promoted: true,
      newRank: newRank.name,
      message: `恭喜！你因政绩卓著，被擢升为${newRank.name}！`,
      scoreBonus: PROMOTION_SCORE_BONUS
    }
  }
  return { promoted: false }
}

type DemotionReason =
  | '名望过低'
  | '道德败坏'
  | '帝心尽失'
  | '政绩不佳'
  | '党争失败'
  | '贪墨被查'
  | '失职渎职'
  | '民怨沸腾'
  | '才疏学浅'
  | '结党营私'
  | '言辞失当'
  | '体弱多病'
  | '财政亏空'
  | '办事不力'
  | '得罪权贵'
  | '清议不容'
  | '政绩下滑'

function checkDemotion(
  currentScore: number,
  previousScore: number,
  character: Character,
  gameState: GameStateValues
): {
  demoted: boolean;
  newRank?: string;
  message?: string;
  reason?: DemotionReason;
  newIdentity?: IdentityType;
} {
  const currentRankData = RANKS.find(r => r.name === character.rank)
  const currentRankBaseScore = currentRankData?.minScore ?? 500

  const reasons: { condition: boolean; reason: DemotionReason; severity: number; message: string }[] = [
    {
      condition: currentScore < currentRankBaseScore,
      reason: '政绩不佳',
      severity: 1,
      message: `政绩分低于${currentRankBaseScore}分，不足以胜任${character.rank}，考核不合格`
    },
    {
      condition: character.hidden.道德值 <= 0,
      reason: '道德败坏',
      severity: 3,
      message: '道德败坏，丧尽天良，天人共愤'
    },
    {
      condition: gameState.圣眷 < 10,
      reason: '帝心尽失',
      severity: 2,
      message: '圣上震怒，龙颜不悦，失宠于上'
    },
    {
      condition: character.attributes.理政 < 15,
      reason: '政绩不佳',
      severity: 1,
      message: '政绩平庸，碌碌无为，不堪其任'
    },
    {
      condition: character.hidden.欲望值 > 75 && character.attributes.财帛 > 70 && character.hidden.道德值 < 30,
      reason: '贪墨被查',
      severity: 3,
      message: '贪墨受贿，中饱私囊，东窗事发'
    },
    {
      condition: gameState.国势 < 25 && character.attributes.武略 < 30 && character.attributes.理政 < 40,
      reason: '失职渎职',
      severity: 2,
      message: '国势衰微，武备废弛，政务弛懈，失职渎职'
    },
    {
      condition: character.attributes.文韬 < 25,
      reason: '才疏学浅',
      severity: 1,
      message: '才疏学浅，文章不通，难堪大任'
    },
    {
      condition: character.hidden.野心值 > 70 && gameState.圣眷 < 40,
      reason: '结党营私',
      severity: 2,
      message: '结党营私，图谋不轨，圣心猜忌'
    },
    {
      condition: gameState.士绅 > 75 && gameState.圣眷 < 25,
      reason: '得罪权贵',
      severity: 2,
      message: '功高震主，树大招风，遭人构陷'
    },
    {
      condition: character.attributes.体质 < 15,
      reason: '体弱多病',
      severity: 2,
      message: '体弱多病，难以视事，被责令养病'
    },
    {
      condition: character.attributes.财帛 < 15 && character.hidden.欲望值 > 60 && character.hidden.道德值 < 35,
      reason: '财政亏空',
      severity: 1,
      message: '家资匮乏而贪欲不减，行止不检，被御史参劾'
    },
    {
      condition: gameState.圣眷 < 30 && character.attributes.理政 < 40,
      reason: '办事不力',
      severity: 1,
      message: '办事不力，屡出差错，上峰不满'
    },
    {
      condition: character.hidden.道德值 < 0 && gameState.清议 > 50,
      reason: '清议不容',
      severity: 1,
      message: '清议攻讦，士林非议，被迫请辞'
    },
    {
      condition: gameState.民望 < 20 && gameState.圣眷 < 40,
      reason: '言辞失当',
      severity: 1,
      message: '言辞失当，触怒龙颜，被贬外放'
    },
    {
      condition: previousScore - currentScore > 80,
      reason: '政绩下滑',
      severity: 1,
      message: '政绩大幅下滑，考核不合格，降级留用'
    }
  ]

  const triggeredReasons = reasons.filter(r => r.condition)

  if (triggeredReasons.length > 0) {
    const worstReason = triggeredReasons.sort((a, b) => b.severity - a.severity)[0]
    // 以「本回合结算前」的政绩分对应的官阶为基准扣减：
    // currentScore 已经反映了本回合的下滑，若再以它为基准会重复惩罚。
    const previousRankIndex = rankIndexForScore(previousScore)
    const demotionLevels = worstReason.severity

    if (worstReason.severity >= 3) {
      return {
        demoted: true,
        newRank: '革职查办',
        message: `【革职】${worstReason.message}，你被革职查办，贬为庶民！`,
        reason: worstReason.reason,
        newIdentity: 'exiled'
      }
    }

    const newRankIndex = Math.max(0, previousRankIndex - demotionLevels)
    const newRank = RANKS[newRankIndex]

    // 是否构成一次"真实的降级"？
    //
    // previousRankIndex 是由**政绩分**推导出的档位，而目标官阶同样只取决于分数。
    // 因此当某条降级理由持续成立时（例如体质长期低于 15 的「体弱多病」），
    // 每次判定都会算出同一个目标官阶 —— 官阶并没有真的再降，
    // 但只比较 `newRankIndex < previousRankIndex` 会让贬官次数一次次 +1、
    // 「贬官一级」的生平记录一条条堆积，玩家会看到"隔一阵子又被贬一次"的荒谬场面。
    //
    // 改为与角色**当前实际官阶**比较：只有官阶真的会下降，才算一次贬官。
    // 若当前官阶不在 RANKS 中（例如已被革职查办、或旧存档里的自定义官阶），
    // 退回原来的分数档位比较，保持向后兼容。
    const actualRankIndex = RANKS.findIndex(r => r.name === character.rank)
    const isRealDemotion =
      actualRankIndex >= 0 ? newRankIndex < actualRankIndex : newRankIndex < previousRankIndex

    if (isRealDemotion) {
      return {
        demoted: true,
        newRank: newRank.name,
        message: `【贬官】${worstReason.message}，你被贬为${newRank.name}！`,
        reason: worstReason.reason,
        newIdentity: 'official'
      }
    }
  }

  return { demoted: false }
}

function createInitialCharacter(
  originType: OriginType,
  deg: DegreeType,
  attrs: Attributes,
  playerName?: string,
  playerCourtesyName?: string,
  playerHometown?: string,
  playerCustomAge?: number | null
): Character {
  const originData = origins[originType]
  // 出身只声明部分隐藏属性，其余（含机敏值 / 忠诚值）补齐为默认值 50
  const hidden = normalizeHidden(originData.initialHidden)
  const defaultAge = deg === '进士' ? 22 : deg === '举人' ? 24 : 16 + Math.floor(Math.random() * 6)
  const initialAge = (playerCustomAge != null && playerCustomAge >= 16) ? playerCustomAge : defaultAge

  const tempCharacter: Character = {
    name: playerName || '',
    courtesyName: playerCourtesyName || '',
    hometown: playerHometown || '',
    age: initialAge,
    origin: originType,
    rank: '',
    degree: deg,
    attributes: { ...attrs },
    hidden: hidden,
    flags: deg === '进士' ? ['地方官任职'] : [],
    history: [],
    wives: [],
    lovers: [],
    examHistory: [],
    promotionCount: 0,
    demotionCount: 0,
    faction: {
      东林好感: 50,
      阉党好感: 50,
      立场: '未定' as PlayerFaction,
      党争烈度: 30
    }
  }

  tempCharacter.rank = '正七品·知县'
  return tempCharacter
}

export function useGameEngine(props: UseGameEngineProps) {
  const {
    origin,
    degree,
    bonusAttributes,
    playerName,
    playerCourtesyName,
    playerHometown,
    playerCustomAge,
    loadSaveData,
    difficulty,
    onReturnToMenu
  } = props

  const difficultyConfig = useMemo(() => getDifficultyConfig(difficulty), [difficulty])

  const [character, setCharacter] = useState<Character>(() => {
    if (loadSaveData) {
      const char = loadSaveData.character
      const flags = char.degree === '进士' && !char.flags.includes('地方官任职')
        ? [...char.flags, '地方官任职']
        : char.flags
      return {
        ...char,
        courtesyName: char.courtesyName || '',
        hometown: char.hometown || '',
        flags,
        faction: char.faction || {
          东林好感: 50,
          阉党好感: 50,
          立场: '未定',
          党争烈度: 30
        }
      }
    }
    return createInitialCharacter(origin, degree, bonusAttributes, playerName, playerCourtesyName, playerHometown, playerCustomAge)
  })

  const [gameState, setGameState] = useState<GameStateValues>(() => {
    if (loadSaveData) {
      const oldState = loadSaveData.gameState
      return {
        currentYear: oldState.currentYear,
        currentMonth: oldState.currentMonth,
        turn: oldState.turn,
        圣眷: (oldState as any).帝心 ?? oldState.圣眷 ?? 50,
        中官: (oldState as any).中官 ?? 50,
        清议: (oldState as any).派系立场 ?? oldState.清议 ?? 50,
        士绅: (oldState as any).百姓口碑 ?? oldState.士绅 ?? 50,
        民望: (oldState as any).百姓口碑 ?? oldState.民望 ?? 50,
        国势: oldState.国势 ?? 75
      }
    }
    const originData = origins[origin]
    const initialGameStateFromOrigin = originData.initialGameState || {}
    return {
      currentYear: 1628,
      currentMonth: 1,
      turn: 0,
      圣眷: initialGameStateFromOrigin.圣眷 ?? 50,
      中官: initialGameStateFromOrigin.中官 ?? 50,
      清议: initialGameStateFromOrigin.清议 ?? 50,
      士绅: initialGameStateFromOrigin.士绅 ?? 50,
      民望: initialGameStateFromOrigin.民望 ?? 50,
      国势: 75
    }
  })

  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null)
  const [pendingEvents, setPendingEvents] = useState<GameEvent[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [eventHistory, setEventHistory] = useState<string[]>(() => loadSaveData ? loadSaveData.eventHistory : [])
  // 悔棋快照。字段必须覆盖一次抉择改动的**全部**东西 ——
  // 此前只存了 character / gameState / eventHistory，于是悔棋之后
  // 生平记录里仍然留着那一条（悔过的选择在「生平回顾」里赖着不走），
  // 连击统计（luckyStreak / unluckyStreak）也不会回退，
  // 「时来运转 / 屋漏偏逢雨」可以靠 选→悔→选 反复刷。
  const [undoHistory, setUndoHistory] = useState<Array<{
    character: Character
    gameState: GameStateValues
    eventHistory: string[]
    lifeRecords: LifeRecord[]
    playerStats: PlayerStats
    pendingEvents: GameEvent[]
    currentStoryline?: string
    meritBonus: number
  }>>([])

  const initialScoreForMerit = (() => {
    if (loadSaveData) {
      return calculateMeritScore(loadSaveData.character, loadSaveData.gameState)
    }
    const initialChar = createInitialCharacter(origin, degree, bonusAttributes, playerName, playerCourtesyName, playerHometown, playerCustomAge)
    const originData = origins[origin]
    const initialGameStateFromOrigin = originData.initialGameState || {}
    const initialState = {
      currentYear: 1628,
      currentMonth: 1,
      turn: 0,
      圣眷: initialGameStateFromOrigin.圣眷 ?? 50,
      中官: initialGameStateFromOrigin.中官 ?? 50,
      清议: initialGameStateFromOrigin.清议 ?? 50,
      士绅: initialGameStateFromOrigin.士绅 ?? 50,
      民望: initialGameStateFromOrigin.民望 ?? 50,
      国势: 75
    }
    return calculateMeritScore(initialChar, initialState)
  })()

  const [meritScore, setMeritScore] = useState<number>(() => initialScoreForMerit)

  /**
   * 选项显式声明的政绩分累计值（`choice.effects.meritScore`）。
   *
   * 它必须单独记账：calculateMeritScore 只从属性/圣眷/民望推导分数，
   * 完全看不到这类加分。此前加分是写进 previousMeritScore 的（`prev => prev + finalChange`），
   * 而升迁 effect 末尾无条件执行 `setPreviousMeritScore(adjustedScore)` 重新算基准 ——
   * 同一次抉择必然改动属性、属性就在该 effect 的依赖里，于是它紧接着重跑并把加分冲掉。
   * 结果是全部事件的 meritScore 加分都是空转：提示「政绩分变化：+30」照常弹出，
   * 分数与升迁却纹丝不动。
   */
  const [meritBonus, setMeritBonus] = useState(0)
  const meritBonusRef = useRef(meritBonus)
  useEffect(() => { meritBonusRef.current = meritBonus }, [meritBonus])

  const [previousMeritScore, setPreviousMeritScore] = useState<number>(() =>
    initialScoreForMerit / difficultyConfig.promotionThresholdMultiplier
  )
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null)

  const [identityType, setIdentityType] = useState<IdentityType>(() => {
    if (loadSaveData) {
      return (loadSaveData as any).identityType || 'official'
    }
    return 'official'
  })

  const [isGameOver, setIsGameOver] = useState(false)

  const [saveNotification, setSaveNotification] = useState<{ isOpen: boolean; message: string; subMessage: string }>({
    isOpen: false,
    message: '',
    subMessage: ''
  })

  const [resignConfirmModal, setResignConfirmModal] = useState<{
    isOpen: boolean;
    choice: EventChoice | null;
    newStateVals: Partial<GameStateValues>;
    newAttrs: Attributes;
  }>({ isOpen: false, choice: null, newStateVals: {}, newAttrs: character.attributes })

  const [isCheatModeOpen, setIsCheatModeOpen] = useState(false)
  const [isSaveSlotsOpen, setIsSaveSlotsOpen] = useState(false)
  const [saveSlotsMode, setSaveSlotsMode] = useState<'save' | 'load'>('save')

  const [isAchievementPanelOpen, setIsAchievementPanelOpen] = useState(false)
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null)

  // 教程不再自动弹出。
  //
  // 原来这里是 `!hasSeenTutorial && !loadSaveData`：首次进入游戏会被一个
  // 8 页的模态框挡住，必须点满"下一步"或点"跳过教程"才能开始玩。
  // 玩家的真实反馈是"进入时有一段验证"，把它误认为已删除的口令门。
  // 现在改为完全不拦截：教程保持随时可从状态栏「帮助」打开，
  // 但不再成为进入游戏的必经步骤。`chongzhen_tutorial_seen` 标记
  // 仍然照写不误（用于统计看过教程的玩家，也兼容旧存档）。
  const [showTutorial, setShowTutorial] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showAIAdvisor, setShowAIAdvisor] = useState(false)
  const [showImageGenerator, setShowImageGenerator] = useState(false)

  // 游玩时长（秒）。此前只有初值、没有 setter，因此新开一局的时长永远是 0，
  // 存档预览里的"游玩时长"是个毫无意义的常量。现在按真实经过时间累计：
  //   playTimeRef  —— 权威累计值（秒，浮点）
  //   playTime     —— 仅供 UI 显示的镜像，由心跳定期同步
  const [playTime, setPlayTime] = useState<number>(() => {
    const saved = (loadSaveData as { playTime?: number } | undefined)?.playTime
    return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : 0
  })

  const [lifeRecords, setLifeRecords] = useState<LifeRecord[]>(() => {
    if (loadSaveData) {
      return (loadSaveData as any).lifeRecords || []
    }
    return []
  })

  const [isLifeReviewOpen, setIsLifeReviewOpen] = useState(false)

  const [deathEndingState, setDeathEndingState] = useState<{
    show: boolean
    type: 'martyrdom' | 'suicide' | 'killed' | 'execution'
    title: string
    description: string
    echo: string
    tags: string[]
  }>({
    show: false,
    type: 'martyrdom',
    title: '',
    description: '',
    echo: '',
    tags: []
  })

  const [biography, setBiography] = useState<string>('')
  const [lastAutosaveFingerprint, setLastAutosaveFingerprint] = useState<string>('')

  const [currentStoryline, setCurrentStoryline] = useState<string | undefined>(() => {
    if (loadSaveData && (loadSaveData as any).currentStoryline) {
      return (loadSaveData as any).currentStoryline
    }
    return undefined
  })

  /**
   * 局内统计计数（成就判定用，随存档持久化，见 SaveData.stats）。
   * 升迁 / 贬官次数不在这里 —— 它们已经存在 character.promotionCount / demotionCount 上。
   * 读档时按现有 useState 初始化模式从 loadSaveData 恢复；旧存档没有 stats 时补 0。
   */
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => {
    if (loadSaveData) return normalizePlayerStats(loadSaveData.stats)
    return createEmptyPlayerStats()
  })

  // refs 用于在稳定回调中读取最新状态
  const characterRef = useRef(character)
  const gameStateRef = useRef(gameState)
  const currentEventRef = useRef(currentEvent)
  const pendingEventsRef = useRef(pendingEvents)
  const eventHistoryRef = useRef(eventHistory)
  const undoHistoryRef = useRef(undoHistory)
  /** 推进月份的同步重入闸门（见 handleNextMonth） */
  const advanceInFlightRef = useRef(false)
  const identityTypeRef = useRef(identityType)
  const lifeRecordsRef = useRef(lifeRecords)
  const isProcessingRef = useRef(isProcessing)
  const difficultyConfigRef = useRef(difficultyConfig)
  const playTimeRef = useRef(playTime)
  // 上一次把「墙钟时间」折算进 playTimeRef 的时刻。两次折算之间经过的时间
  // 尚未计入 playTimeRef，写存档时需要用 getTotalPlayTime() 补上，
  // 否则每次都会丢掉不足一个心跳周期的那几秒。
  const playTimeSessionStartRef = useRef<number>(Date.now())
  const onReturnToMenuRef = useRef(onReturnToMenu)
  const currentStorylineRef = useRef(currentStoryline)
  const playerStatsRef = useRef(playerStats)

  useEffect(() => { characterRef.current = character }, [character])
  useEffect(() => { gameStateRef.current = gameState }, [gameState])
  useEffect(() => { currentEventRef.current = currentEvent }, [currentEvent])
  useEffect(() => { pendingEventsRef.current = pendingEvents }, [pendingEvents])
  useEffect(() => { eventHistoryRef.current = eventHistory }, [eventHistory])
  useEffect(() => { undoHistoryRef.current = undoHistory }, [undoHistory])
  useEffect(() => { identityTypeRef.current = identityType }, [identityType])
  useEffect(() => { lifeRecordsRef.current = lifeRecords }, [lifeRecords])
  useEffect(() => { isProcessingRef.current = isProcessing }, [isProcessing])
  useEffect(() => { difficultyConfigRef.current = difficultyConfig }, [difficultyConfig])
  useEffect(() => { onReturnToMenuRef.current = onReturnToMenu }, [onReturnToMenu])
  useEffect(() => { currentStorylineRef.current = currentStoryline }, [currentStoryline])
  useEffect(() => { playerStatsRef.current = playerStats }, [playerStats])

  /**
   * 游玩时长的**唯一**权威读取口：累计值 + 尚未折算进累计值的这一段（不足一个心跳）。
   * 写存档一律走它，保证"刚玩完就存档"不会丢秒。
   */
  const getTotalPlayTime = useCallback((): number => {
    const now = Date.now()
    const pending = (now - playTimeSessionStartRef.current) / 1000
    return Math.floor(playTimeRef.current + (pending > 0 ? pending : 0))
  }, [])

  // 游玩时长心跳：把经过的墙钟时间折算进 playTimeRef，并同步给 UI。
  // 注意方向 —— 必须是「ref 为准、state 为镜像」。
  // 早先这里写的是 `playTimeRef.current = playTime`（state 覆盖 ref），
  // 一旦改成累计就会在每次 state 变化时被清零。
  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const elapsed = (now - playTimeSessionStartRef.current) / 1000
      if (elapsed <= 0) return
      playTimeSessionStartRef.current = now
      playTimeRef.current += elapsed
      setPlayTime(playTimeRef.current)
    }
    const timer = window.setInterval(tick, PLAY_TIME_TICK_MS)
    return () => {
      window.clearInterval(timer)
      // 卸载时把最后不足一个心跳的一段也计入，避免频繁切屏时每次都丢几秒
      const now = Date.now()
      const elapsed = (now - playTimeSessionStartRef.current) / 1000
      if (elapsed > 0) {
        playTimeSessionStartRef.current = now
        playTimeRef.current += elapsed
      }
    }
  }, [])

  /**
   * 更新局内统计。
   * 同时写 ref 与 state：ref 保证同一 tick 内连续自增不丢（例如一次选项同时命中
   * 「第一个选项」与连击计数），state 保证自动存档能读到最新值并触发重跑。
   */
  const updatePlayerStats = useCallback((updater: (prev: PlayerStats) => PlayerStats) => {
    const next = updater(playerStatsRef.current)
    playerStatsRef.current = next
    setPlayerStats(next)
  }, [])

  // 全量事件池 —— 模块级构建一次。
  //
  // 改造前这里在 4 个函数体内各写了一遍 `const allEvents = [...initialEvents, ...allGrayChoiceEvents]`。
  // 每次调用都要新建一个约 2000 项的数组并逐个拷贝，而这几个函数是**每月推进都会跑**
  // 的热路径（findAvailableEvent / findAvailableEventWithState / findAllEventsForState /
  // getCurrentStoryline），一局 17 年下来是数千次无谓的 2000 元素数组分配。
  const ALL_EVENTS: GameEvent[] = [...initialEvents, ...allGrayChoiceEvents]

  // 推断当前剧情线：优先使用玩家选择后持久化的剧情线，否则从历史事件反推
  const getCurrentStoryline = useCallback((): string | undefined => {
    if (currentStorylineRef.current) return currentStorylineRef.current
    const history = eventHistoryRef.current
    for (let i = history.length - 1; i >= Math.max(0, history.length - 8); i--) {
      const id = history[i]
      const ev = ALL_EVENTS.find(e => e.id === id)
      if (ev?.storyline) return ev.storyline
    }
    return undefined
  }, [])

  const findAvailableEvent = useCallback((): GameEvent | null => {
    const available = ALL_EVENTS.filter(e => checkEventConditions(e, characterRef.current, gameStateRef.current))
    return pickEvent(available, eventHistoryRef.current, getCurrentStoryline())
  }, [])

  const findAvailableEventWithState = useCallback((state: GameStateValues): GameEvent | null => {
    const available = ALL_EVENTS.filter(e => checkEventConditions(e, characterRef.current, state))
    return pickEvent(available, eventHistoryRef.current, getCurrentStoryline())
  }, [])

  const weightedPick = useCallback(<T extends { storyline?: string }>(pool: T[], activeStoryline?: string): T | null => {
    if (pool.length === 0) return null
    if (pool.length === 1) return pool[0]
    const currentLine = activeStoryline ?? currentStorylineRef.current
    const weights = pool.map(item => {
      if (!currentLine) return 1
      if (item.storyline === currentLine) return 6
      if (item.storyline && item.storyline.startsWith(currentLine)) return 3
      return 1
    })
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) return pool[i]
    }
    return pool[pool.length - 1]
  }, [])

  const findAllEventsForState = useCallback((state: GameStateValues): GameEvent[] => {
    const history = eventHistoryRef.current
    const available = ALL_EVENTS.filter(e => checkEventConditions(e, characterRef.current, state))
    if (available.length === 0) return []

    const activeStoryline = getCurrentStoryline()

    // 已触发集合与「最后一次出现位置」表，各构建一次。
    //
    // 改造前：下面 4 处 `!history.includes(e.id)` 各自对最多 2000 个候选做一次线性扫描，
    // 而 history 一局能涨到 200+ 项 —— 单次推进要做几十万次字符串比较。
    // 更糟的是 lastOccurrenceDistance 用 `history.lastIndexOf()`，
    // 在 withCooldown 里对每个可重复事件各扫一遍，是本函数最大的热点。
    // 两张表建一次、之后全是 O(1) 查询，语义与原来完全一致。
    const seen = new Set(history)
    const lastIndexById = new Map<string, number>()
    for (let i = 0; i < history.length; i++) lastIndexById.set(history[i], i)

    // 计算某个事件 ID 距离上次触发有多远（月数）
    const lastOccurrenceDistance = (eventId: string): number => {
      const lastIndex = lastIndexById.get(eventId)
      if (lastIndex === undefined) return Infinity
      return history.length - lastIndex
    }

    // 可重复事件的冷却期（月），避免同一事件反复出现
    const cooldowns: Record<string, number> = {
      random: 8,
      gray: 6,
      character: 6,
      national: 6,
      faction: 6,
      emotion: 12
    }
    const withCooldown = (pool: GameEvent[], type: string): GameEvent[] => {
      const minGap = cooldowns[type] || 0
      return minGap <= 0 ? pool : pool.filter(e => lastOccurrenceDistance(e.id) > minGap)
    }

    const results: GameEvent[] = []

    // 1. 历史大事件（一次性）
    //
    // `chain` 必须与 `historical` 同层。数据侧有 15 个 type='chain' 的事件
    // （新君登基 / 皮岛经营 / 松山之战 / 勤王末路 …，全在 src/data/events/historical/*.ts），
    // 它们带完整的年份 + 月份 + 出身 + flags 条件，是这个游戏的主线正文；
    // 但选择器此前只认 historical / transition / random / emotion / gray / character /
    // national / faction，从来没有 chain 这一支 —— 于是这 15 个事件在任何存档里
    // 都不可能被子选中，属于彻头彻尾的死内容。
    // 其中 002_danger / 020_crisis / 013_aftermath 这类续写事件本身带 flags.has 前置，
    // 只有玩家在前序事件里拿到对应标记后才会解锁，正好符合"接续"的设计意图。
    const historical = available.filter(
      e => (e.type === 'historical' || e.type === 'chain') && !seen.has(e.id)
    )
    const pickedHistorical = weightedPick(historical, activeStoryline)
    if (pickedHistorical) {
      results.push(pickedHistorical)
    } else {
      // 2. 过渡事件（一次性），结局前奏优先
      const prelude = available.find(
        e => e.type === 'transition' && e.isPreEnding === true && !seen.has(e.id)
      )
      if (prelude) {
        results.push(prelude)
      } else {
        const transition = available.filter(e => e.type === 'transition' && !seen.has(e.id))
        const pickedTransition = weightedPick(transition, activeStoryline)
        if (pickedTransition) {
          results.push(pickedTransition)
        }
      }
    }

    // 3. 若本月没有大事件/过渡事件，用随机事件填充（可重复，带冷却）
    if (results.length === 0) {
      const random = withCooldown(available.filter(e => e.type === 'random'), 'random')
      const pickedRandom = weightedPick(random, activeStoryline)
      if (pickedRandom) {
        results.push(pickedRandom)
      }
    }

    // 4. 支线事件：emotion 一次性，gray/character/national/faction 可重复但带冷却
    const branchEmotion = available.filter(e => e.type === 'emotion' && !seen.has(e.id))
    const branchRepeatableTypes = ['gray', 'character', 'national', 'faction'] as const
    const branchRepeatable = branchRepeatableTypes.flatMap(type =>
      withCooldown(available.filter(e => e.type === type), type)
    )
    const branchPool = [...branchEmotion, ...branchRepeatable]

    // 按剧情线加权的无放回抽样，最多 2 个
    const branchWeighted = branchPool.map(e => ({
      e,
      w: activeStoryline && e.storyline === activeStoryline ? 4 : 1
    }))
    const branchSelected: GameEvent[] = []
    const remaining = [...branchWeighted]
    while (branchSelected.length < 2 && remaining.length > 0) {
      const total = remaining.reduce((a, b) => a + b.w, 0)
      let r = Math.random() * total
      let selectedIndex = -1
      for (let i = 0; i < remaining.length; i++) {
        r -= remaining[i].w
        if (r <= 0) {
          selectedIndex = i
          break
        }
      }
      if (selectedIndex === -1) selectedIndex = remaining.length - 1
      branchSelected.push(remaining[selectedIndex].e)
      remaining.splice(selectedIndex, 1)
    }
    results.push(...branchSelected)

    // 去重并过滤掉已经在本月结果中的事件
    return results.filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)
  }, [getCurrentStoryline, weightedPick])

  const addLifeRecord = useCallback((record: Omit<LifeRecord, 'id'>) => {
    const newRecord: LifeRecord = {
      ...record,
      id: `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
    setLifeRecords(prev => [...prev, newRecord])
  }, [])

  const getEndingType = useCallback((event?: GameEvent | null): 'legendary' | 'good' | 'normal' | 'bad' | 'tragic' => {
    const attrs = characterRef.current.attributes
    const hidden = characterRef.current.hidden
    const state = gameStateRef.current

    if (event) {
      const eventId = event.id
      const endingTitle = event.title

      const isLegendary = characterRef.current.rank === '正一品·太师' &&
        state.民望 >= 80 &&
        state.圣眷 >= 70 &&
        hidden.道德值 >= 70 &&
        attrs.理政 >= 70

      if (isLegendary) return 'legendary'

      const isRetire = eventId.includes('retire') || endingTitle.includes('归隐') || endingTitle.includes('辞官')
      if (isRetire && hidden.道德值 >= 70 && state.民望 >= 60) return 'good'

      const isDeath = eventId.includes('death') || endingTitle.includes('病逝') || endingTitle.includes('油尽灯枯')
      if (isDeath && hidden.道德值 >= 60) return 'good'

      if (eventId.includes('demotion') || endingTitle.includes('革职') || endingTitle.includes('庶民')) return 'bad'

      if (eventId.includes('emperor') || eventId.includes('moral') || endingTitle.includes('众叛亲离')) return 'tragic'
    }

    const checkTrigger = (): string | null => {
      if (attrs.财帛 <= 0) return '财帛'
      if (attrs.体质 <= 0) return '体质'
      if (state.圣眷 <= 0) return '圣眷'
      if (state.中官 <= 0) return '中官'
      if (state.清议 <= 0) return '清议'
      if (state.士绅 <= 0) return '士绅'
      if (state.民望 <= 0) return '民望'
      if (attrs.文韬 <= 0) return '文韬'
      if (attrs.理政 <= 0) return '理政'
      if (attrs.武略 <= 0) return '武略'
      if (hidden.道德值 <= 0) return '道德值'
      return null
    }

    const triggerAttr = checkTrigger()

    if (triggerAttr === '道德值') return 'tragic'
    if (triggerAttr === '圣眷') return 'bad'
    if (triggerAttr) return 'normal'

    return 'normal'
  }, [])

  const checkAchievements = useCallback((hasEnded?: boolean, endingType?: string) => {
    const stats = playerStatsRef.current
    const ctx: AchievementContext = {
      attributes: characterRef.current.attributes,
      gameState: gameStateRef.current,
      characterRank: characterRef.current.rank,
      eventHistory: eventHistoryRef.current,
      hasEnded: hasEnded,
      endingType: endingType,
      // 出身（noble_climb 成就需要按出身判定）
      origin: characterRef.current.origin,
      // 升迁 / 贬官次数直接读角色对象上的累计值（存档里也在角色身上，无需额外持久化）
      promotionCount: characterRef.current.promotionCount ?? 0,
      demotionCount: characterRef.current.demotionCount ?? 0,
      // 以下计数来自局内统计（随存档持久化）
      luckyStreak: stats.luckyStreak,
      unluckyStreak: stats.unluckyStreak,
      firstChoiceCount: stats.firstChoiceCount,
      // 来自「听天由命」按钮（EventDisplay.handleRandomChoice）
      randomChoiceCount: stats.randomChoiceCount,
      undoCount: stats.undoCount,
      saveCount: stats.saveCount,
      // 当前存档内已解锁的成就。「结局收藏」类成就必须靠它统计**跨局**解锁的结局数，
      // 而不是靠 eventHistory（那是单局流水，一局只会走到一个结局）。
      unlockedAchievements: loadAchievements().unlocked
    }
    const newlyUnlocked = checkAndUnlockAchievements(ctx)
    // 成就解锁后不再弹出弹窗，仅在后台记录
    void newlyUnlocked
  }, [])

  const handleGameOver = useCallback((event?: GameEvent) => {
    const endingType = getEndingType(event)
    checkAchievements(true, endingType)
    if (event) {
      setEventHistory(prev => prev.includes(event.id) ? prev : [...prev, event.id])
      triggerEndingAchievements(event)
      const bio = generateBiography(characterRef.current, gameStateRef.current, event, lifeRecordsRef.current)
      setBiography(bio)
    }
    setIsGameOver(true)
  }, [])

  const handleChoice = useCallback((choice: EventChoice, opts?: { random?: boolean; skipResignConfirm?: boolean }) => {
    const currentCharacter = characterRef.current
    const currentGameState = gameStateRef.current
    const currentEvent = currentEventRef.current
    const currentEventHistory = eventHistoryRef.current

    const snapshotChar = JSON.parse(JSON.stringify(currentCharacter))
    const snapshotState = JSON.parse(JSON.stringify(currentGameState))
    // 这些必须在**任何统计计数之前**取，而不是等到 push 的时候取：
    // 下面的 firstChoiceCount / randomChoiceCount / 连击数都会同步改写 playerStatsRef，
    // 到 setUndoHistory 那一步 ref 已经带着本次抉择的痕迹了，快照会变成「事后」而非「事前」。
    const snapshotStats: PlayerStats = { ...playerStatsRef.current }
    const snapshotLifeRecords = [...lifeRecordsRef.current]
    const snapshotPendingEvents = [...pendingEventsRef.current]
    const snapshotStoryline = currentStorylineRef.current
    const snapshotMeritBonus = meritBonusRef.current

    let newAttrs = { ...currentCharacter.attributes }

    if (choice.staminaCost && choice.staminaCost > 0) {
      newAttrs.体质 = Math.max(0, newAttrs.体质 - choice.staminaCost)
    }

    if (choice.staminaBonus && choice.staminaBonus > 0) {
      const bounds = ATTR_BOUNDS.体质
      newAttrs.体质 = Math.max(bounds.min, Math.min(bounds.max, newAttrs.体质 + choice.staminaBonus))
    }

    if (choice.effects.attributes) {
      for (const [key, value] of Object.entries(choice.effects.attributes)) {
        const mappedKey = ATTR_MAP[key] || key
        const attrKey = mappedKey as keyof Attributes
        const bounds = ATTR_BOUNDS[attrKey] || { min: 0, max: 150 }
        let adjustedValue = value * difficultyConfigRef.current.attributeMultiplier
        adjustedValue = applyOriginModifier(currentCharacter.origin, mappedKey, adjustedValue)
        newAttrs[attrKey] = Math.max(bounds.min, Math.min(bounds.max, (newAttrs[attrKey] || 0) + adjustedValue))
      }
    }

    let newStateVals = { ...currentGameState }
    if (choice.effects.gameState) {
      for (const [key, value] of Object.entries(choice.effects.gameState)) {
        const mappedKey = STATE_MAP[key] || key
        const stateKey = mappedKey as keyof GameStateValues
        if (stateKey === 'currentYear' || stateKey === 'currentMonth' || stateKey === 'turn') continue
        const currentVal = (newStateVals[stateKey] as number) || 0
        const adjustedStateValue = applyOriginStateModifier(currentCharacter.origin, mappedKey, value)
        newStateVals[stateKey] = Math.max(0, Math.min(100, currentVal + adjustedStateValue))
      }
    }

    const attrsForCheck = { ...newAttrs } as Record<string, number>
    const stateForCheck = { ...newStateVals } as Record<string, number>
    const hiddenForCheck = { ...currentCharacter.hidden } as Record<string, number>

    // 辞官类结局的二次确认必须发生在**任何写入之前**。
    // 原先这段判定排在 setCharacter / addLifeRecord / 统计计数之后，只把
    // setGameState 挡在了后面 —— 于是「取消」会留下一个半应用的抉择：
    // 属性、隐藏属性、flags、生平记录、连击统计全部生效，唯独五方态度被丢掉；
    // 而玩家重新选一次又会把属性再加一遍。确认后走 handleChoice(skipResignConfirm)
    // 重放整条链路（含结局落账），取消则什么都不发生。
    if (choice.effects.special?.type === 'ending' && !opts?.skipResignConfirm && isResignEndingChoice(choice)) {
      setResignConfirmModal({
        isOpen: true,
        choice: choice,
        newStateVals: newStateVals,
        newAttrs: newAttrs
      })
      return
    }

    // ===== 成就统计（选项侧）=====

    // 「果断抉择」：本次选择是否为当前事件的第一个选项
    if (currentEvent?.choices[0]?.id === choice.id) {
      updatePlayerStats(prev => ({ ...prev, firstChoiceCount: prev.firstChoiceCount + 1 }))
    }

    // 「随心所欲」：本次选择是否来自「听天由命」随机挑选。
    // 这是 randomChoiceCount 的**唯一**自增点 —— 在 EventDisplay 加上那个入口之前，
    // 这个计数恒为 0，导致对应成就无法达成。
    if (opts?.random) {
      updatePlayerStats(prev => ({ ...prev, randomChoiceCount: prev.randomChoiceCount + 1 }))
    }

    // 「时来运转 / 屋漏偏逢雨」的「负面回合」定义：
    // 把本次选项**实际生效**的全部增量相加 ——
    //   属性五项差值（已含难度倍率、出身修正与上下限裁剪）、
    //   五方态度差值（已含出身修正与 0-100 裁剪）、
    //   隐藏属性声明增量（实际写入时另有 0-100 裁剪，这里按声明值近似）。
    // 总和 < 0 记为「负面回合」→ unluckyStreak+1 且 luckyStreak 清零；
    // 总和 >= 0 记为「非负面回合」→ luckyStreak+1 且 unluckyStreak 清零。
    const attrDelta = (Object.keys(newAttrs) as Array<keyof Attributes>)
      .reduce((sum, key) => sum + ((newAttrs[key] ?? 0) - (currentCharacter.attributes[key] ?? 0)), 0)
    const stateDelta = (Object.keys(newStateVals) as Array<keyof GameStateValues>)
      .reduce((sum, key) => {
        if (key === 'currentYear' || key === 'currentMonth' || key === 'turn') return sum
        return sum + (((newStateVals[key] as number) ?? 0) - ((currentGameState[key] as number) ?? 0))
      }, 0)
    const hiddenEffects = choice.effects.hidden as Record<string, number> | undefined
    const hiddenDelta = hiddenEffects
      ? Object.keys(hiddenEffects).reduce((sum, key) => sum + (hiddenEffects[key] ?? 0), 0)
      : 0
    const netEffect = attrDelta + stateDelta + hiddenDelta
    updatePlayerStats(prev => netEffect < 0
      ? { ...prev, unluckyStreak: prev.unluckyStreak + 1, luckyStreak: 0 }
      : { ...prev, luckyStreak: prev.luckyStreak + 1, unluckyStreak: 0 })

    setUndoHistory(prev => [...prev, {
      character: snapshotChar,
      gameState: snapshotState,
      eventHistory: [...currentEventHistory],
      lifeRecords: snapshotLifeRecords,
      playerStats: snapshotStats,
      pendingEvents: snapshotPendingEvents,
      currentStoryline: snapshotStoryline,
      meritBonus: snapshotMeritBonus
    }])

    setCharacter(prev => {
      const newChar = { ...prev }
      newChar.attributes = newAttrs

      const currentEventTitle = currentEvent?.title || '未知事件'
      const historyEntry = `${currentGameState.currentYear}年${currentGameState.currentMonth}月：${currentEventTitle} - ${choice.text}`
      newChar.history = [...newChar.history, historyEntry]

      if (choice.effects.hidden) {
        // 先规整：旧存档里可能缺键或是 NaN/null，直接相加会污染成 NaN
        newChar.hidden = normalizeHidden(newChar.hidden)
        for (const [key, value] of Object.entries(choice.effects.hidden)) {
          if (!(key in HIDDEN_DEFAULTS)) {
            // 未知隐藏属性键：跳过而不是写入 NaN（NaN 会被 JSON 序列化成 null，
            // 并让条件判定在「永远通过」和「永远不通过」之间摇摆）
            console.warn('[effects] 未知的隐藏属性键，已忽略：', key)
            continue
          }
          const hiddenKey = key as keyof HiddenAttributes
          const currentVal = newChar.hidden[hiddenKey]
          newChar.hidden[hiddenKey] = Math.max(0, Math.min(100, currentVal + value))
        }
      }
      if (choice.effects.flags?.add) {
        newChar.flags = [...newChar.flags, ...choice.effects.flags.add.filter(f => !newChar.flags.includes(f))]
      }
      if (choice.effects.flags?.remove) {
        newChar.flags = newChar.flags.filter(f => !choice.effects.flags!.remove!.includes(f))
      }

      const addedFlags = choice.effects.flags?.add || []
      const removedFlags = choice.effects.flags?.remove || []
      if (addedFlags.length > 0 || removedFlags.length > 0) {
        newChar.faction = { ...newChar.faction }
        let { 东林好感, 阉党好感, 立场, 党争烈度 } = newChar.faction

        for (const flag of addedFlags) {
          if (flag === '阉党路线') {
            阉党好感 = Math.min(100, 阉党好感 + 20)
            东林好感 = Math.max(0, 东林好感 - 15)
            立场 = '阉党'
            党争烈度 = Math.min(100, 党争烈度 + 10)
          } else if (flag === '复社成员' || flag === '东林死忠') {
            东林好感 = Math.min(100, 东林好感 + 20)
            阉党好感 = Math.max(0, 阉党好感 - 15)
            立场 = '东林'
            党争烈度 = Math.min(100, 党争烈度 + 8)
          } else if (flag === '叛徒') {
            if (立场 === '阉党') {
              东林好感 = Math.min(100, 东林好感 + 25)
              阉党好感 = Math.max(0, 阉党好感 - 30)
              立场 = '中间'
            }
          } else if (flag === '两面三刀') {
            党争烈度 = Math.min(100, 党争烈度 + 5)
          } else if (flag === '主和派') {
            阉党好感 = Math.min(100, 阉党好感 + 10)
            东林好感 = Math.max(0, 东林好感 - 10)
          }
        }

        for (const flag of removedFlags) {
          if (flag === '阉党路线') {
            阉党好感 = Math.max(0, 阉党好感 - 25)
            立场 = '中间'
          }
        }

        if (choice.effects.gameState) {
          if (choice.effects.gameState['清议'] && choice.effects.gameState['清议'] > 0) {
            东林好感 = Math.min(100, 东林好感 + Math.floor(choice.effects.gameState['清议'] / 2))
          }
          if (choice.effects.gameState['中官'] && choice.effects.gameState['中官'] > 0) {
            阉党好感 = Math.min(100, 阉党好感 + Math.floor(choice.effects.gameState['中官'] / 2))
          }
          if (choice.effects.gameState['清议'] && choice.effects.gameState['清议'] < 0) {
            东林好感 = Math.max(0, 东林好感 + Math.floor(choice.effects.gameState['清议'] / 2))
          }
          if (choice.effects.gameState['中官'] && choice.effects.gameState['中官'] < 0) {
            阉党好感 = Math.max(0, 阉党好感 + Math.floor(choice.effects.gameState['中官'] / 2))
          }
        }

        newChar.faction = { 东林好感, 阉党好感, 立场, 党争烈度 }
      }

      return newChar
    })

    addLifeRecord({
      year: currentGameState.currentYear,
      month: currentGameState.currentMonth,
      type: currentEvent?.type === 'historical' ? 'event' : 'choice',
      title: currentEvent?.title || '未知事件',
      description: choice.text,
      impact: choice.resultDescription || choice.result?.title,
      attributesChange: choice.effects.attributes,
      gameStateChange: choice.effects.gameState,
      hiddenChange: choice.effects.hidden,
      relatedEvent: currentEvent?.id
    })

    // 剧情线推进：优先采用选项显式指定的非 ordinary 剧情线；其次继承当前事件的非 ordinary 剧情线
    const explicitChoiceLine = choice.storyline && choice.storyline !== 'ordinary' ? choice.storyline : undefined
    const eventLine = currentEvent?.storyline && currentEvent.storyline !== 'ordinary' ? currentEvent.storyline : undefined
    const newStoryline = explicitChoiceLine || eventLine
    if (newStoryline && newStoryline !== currentStorylineRef.current) {
      currentStorylineRef.current = newStoryline
      setCurrentStoryline(newStoryline)
    }

    if (choice.effects.meritScore !== undefined) {
      const baseChange = choice.effects.meritScore
      const eventMultiplier = (currentEvent?.type === 'historical' || currentEvent?.type === 'ending') ? 2 : 1
      const finalChange = baseChange * eventMultiplier * difficultyConfigRef.current.meritScoreMultiplier

      // 记账到独立的 meritBonus（升迁 effect 会把它并进分数与判定标尺）。
      // 原先这里是 `setPreviousMeritScore(prev => prev + finalChange)`，
      // 而升迁 effect 结尾无条件用 adjustedScore 覆写 previousMeritScore，
      // 同一次抉择一定改属性 → 该 effect 立刻重跑 → 加分被冲掉，等于白加。
      if (finalChange !== 0) {
        setMeritBonus(prev => prev + finalChange)
        const changeText = finalChange > 0 ? `+${Math.round(finalChange)}` : `${Math.round(finalChange)}`
        setPromotionMessage(`政绩分变化：${changeText}`)
        setTimeout(() => setPromotionMessage(null), 2000)
      }
    }

    // 五方态度必须在结局分支**之前**落账。
    // 原先这段排在 ending 分支的 return 之后，于是所有带 special.type='ending' 的选项
    // 都会丢掉 gameState 增量：属性、隐藏属性、flags 已经写了，五方态度却停在原地，
    // 结局屏与史馆传略读到的是「改了一半」的局势。
    setGameState(prev => {
      const newState = { ...prev, ...newStateVals }
      if (newState.民望 !== undefined) {
        newState.民望 = Math.max(-100, Math.min(100, newState.民望))
      }
      if (newState.士绅 !== undefined) {
        newState.士绅 = Math.max(0, Math.min(100, newState.士绅))
      }
      if (newState.圣眷 !== undefined) {
        newState.圣眷 = Math.max(0, Math.min(100, newState.圣眷))
      }
      if (newState.中官 !== undefined) {
        newState.中官 = Math.max(0, Math.min(100, newState.中官))
      }
      return newState
    })

    if (choice.effects.special?.type === 'ending') {
      // 辞官类结局已在函数开头完成确认（未确认时根本走不到这里），
      // 其余结局直接结算。
      handleGameOver(currentEvent ?? undefined)
      return
    }

    try {
      const params = {
        attributes: attrsForCheck,
        gameState: stateForCheck,
        hidden: hiddenForCheck,
        faction: currentCharacter.faction,
        flags: currentCharacter.flags,
        currentYear: currentGameState.currentYear,
        currentMonth: currentGameState.currentMonth
      }

      const triggeredEvent = boundaryEventManager.checkByType(params, 'ending')

      if (triggeredEvent) {
        if (triggeredEvent.id === 'bankrupt') {
          setCurrentEvent(withEndingId(triggeredEvent.event))
          handleGameOver(withEndingId(triggeredEvent.event))
          return
        }
        setCurrentEvent(triggeredEvent.event)
      }
    } catch (e) {
      console.error('handleChoice boundary check error:', e)
    }
  }, [])

  const checkBoundary = useCallback((): boolean => {
    try {
      const currentCharacter = characterRef.current
      const currentGameState = gameStateRef.current
      const currentEvent = currentEventRef.current

      if (!currentCharacter?.attributes || !currentGameState) return false
      if (currentEvent?.id?.startsWith('boundary_')) return false

      const params = {
        attributes: { ...currentCharacter.attributes } as Record<string, number>,
        // gameState 里必须带上 turn。wrapBatchAsBoundaryEvents 会给每个叙事结局
        // 注入 `gameState.turn >= 36` 这道「不许开局秒结束」的兜底门，
        // 而 checkLegacyObj 取值是 `src[key] ?? 0` —— 不带 turn 就等于 turn=0，
        // 于是这条注入把所有结局都判成「还没玩满 3 年」，
        // 本函数（推进月份时的边界检查）永远不可能触发任何结局。
        gameState: { 圣眷: currentGameState.圣眷, 中官: currentGameState.中官, 清议: currentGameState.清议, 士绅: currentGameState.士绅, 民望: currentGameState.民望, 国势: currentGameState.国势, turn: currentGameState.turn },
        hidden: { ...currentCharacter.hidden } as Record<string, number>,
        faction: currentCharacter.faction,
        flags: currentCharacter.flags,
        currentYear: currentGameState.currentYear,
        currentMonth: currentGameState.currentMonth
      }

      const triggeredEvent = boundaryEventManager.checkByType(params, 'ending')
      if (triggeredEvent) {
        if (triggeredEvent.id === 'bankrupt') {
          setCurrentEvent(withEndingId(triggeredEvent.event))
          handleGameOver(withEndingId(triggeredEvent.event))
          return true
        }
        setCurrentEvent(triggeredEvent.event)
        handleGameOver(triggeredEvent.event)
        return true
      }

      // crisis 类临界事件此前**只在挂载 effect 里查过一次**，而那个 effect 带一次性守卫、
      // 整个生命周期只跑一次。于是这类事件成了死内容：玩家只有在开局那一瞬间就已经
      // 满足条件时才可能遇到，「重病缠身」之类在游戏中途永远触发不了。
      // 这里补上同一条检查，概率门与挂载路径共用 CRISIS_EVENT_PROBABILITY。
      const crisisEvent = boundaryEventManager.checkByType(params, 'crisis')
      if (crisisEvent && Math.random() < CRISIS_EVENT_PROBABILITY) {
        setCurrentEvent(crisisEvent.event)
        return true
      }
    } catch (e) {
      console.error('checkBoundary error:', e)
    }
    return false
  }, [])

  const handleNextMonth = useCallback(() => {
    // 同步的重入闸门。isProcessing 是 state，要等渲染后才由 effect 回写进 ref，
    // 而真正的推进排在 300ms 定时器里 —— 双击或连按 Space 时两次调用都落在
    // 同一次 flush 之前，state 与 ref 都还是旧值，于是 turn +2、age += 2/12、
    // 两批事件 id 各写一次历史、pendingEvents 被第二次覆盖。
    // ActionBar 那边又把 isProcessing 当成「可点」，所以按钮在这 300ms 里根本不禁用。
    if (advanceInFlightRef.current) return
    advanceInFlightRef.current = true

    setIsProcessing(true)
    setUndoHistory([])

    // ── 纯计算部分 ──────────────────────────────────────────────────────
    // 这一整段必须在 setState 更新函数**之外**执行。
    //
    // 早先它写在 `setGameState(prev => {...})` 的更新函数里，而那个更新函数还顺手做了
    // 增龄、排 300ms 定时器、改事件历史这些**副作用**。React 的更新函数必须是纯的：
    // StrictMode 在开发构建下会重复调用它来暴露不纯的代码，并发渲染下也可能重放。
    // 一旦被重放，那些副作用就各执行两遍 —— 事件 id 重复写进历史、年龄被加两次、
    // 两个定时器互相抢事件。有回归测试盯着（tests/unit/engine.strictMode.test.ts）。
    //
    // 现在改为「先从 gameStateRef 同步算出结果 → 一次性 setGameState → 再做副作用」。
    const prev = gameStateRef.current
    let newState = { ...prev }
    let allEvents: GameEvent[] = []
    let skippedMonths = 0
    const maxSkip = 12

    // 连续跳过空月，直到找到事件或达到上限，避免玩家反复点击继续
    while (skippedMonths < maxSkip) {
      let nextMonth = newState.currentMonth + 1
      let nextYear = newState.currentYear

      if (nextMonth > 12) {
        nextMonth = 1
        nextYear++
      }

      const current国势 = newState.国势 ?? 75
      let 国势Decay = 0
      const decayMultiplier = difficultyConfigRef.current.countryPowerDecay
      if (nextYear >= 1636) {
        国势Decay = -1 * decayMultiplier
      }
      if (nextYear >= 1640) {
        国势Decay = -2 * decayMultiplier
      }
      if (nextYear >= 1643) {
        国势Decay = -3 * decayMultiplier
      }

      newState = {
        ...newState,
        currentMonth: nextMonth,
        currentYear: nextYear,
        turn: newState.turn + 1,
        国势: Math.max(0, Math.min(100, current国势 + 国势Decay))
      }

      allEvents = findAllEventsForState(newState)
      skippedMonths++
      if (allEvents.length > 0) break
    }

    setGameState(newState)

    // ── 副作用部分：每次调用只执行一次 ────────────────────────────────
    setCharacter(prevChar => ({
      ...prevChar,
      age: prevChar.age + skippedMonths / 12
    }))

    window.setTimeout(() => {
      advanceInFlightRef.current = false
      if (checkBoundary()) {
        setIsProcessing(false)
        return
      }
      if (allEvents.length > 0) {
        setCurrentEvent(allEvents[0])
        setPendingEvents(allEvents.slice(1))
        setEventHistory(prevHistory => [...prevHistory, ...allEvents.map(e => e.id)])
      } else {
        setCurrentEvent(null)
      }
      setIsProcessing(false)
      checkAchievements()
    }, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleContinue = useCallback(() => {
    const currentPending = pendingEventsRef.current
    if (currentPending.length > 0) {
      const [next, ...rest] = currentPending
      setCurrentEvent(next)
      setPendingEvents(rest)
      return
    }

    // 当前月份事件已处理完，直接进入下月，不再显示空事件界面
    handleNextMonth()
  }, [handleNextMonth])

  const handleUndo = useCallback(() => {
    const history = undoHistoryRef.current
    if (history.length === 0) return
    const snapshot = history[history.length - 1]
    // 先整体回到抉择前，再单独把「悔棋」这一次计数加回去 ——
    // 顺序反过来会被快照覆写，undoCount 恒为 0，「谨慎行事」成就永远达不成。
    setCharacter({ ...snapshot.character })
    setGameState(snapshot.gameState)
    setEventHistory(snapshot.eventHistory)
    setLifeRecords([...snapshot.lifeRecords])
    setPendingEvents([...snapshot.pendingEvents])
    setMeritBonus(snapshot.meritBonus)
    meritBonusRef.current = snapshot.meritBonus
    currentStorylineRef.current = snapshot.currentStoryline
    setCurrentStoryline(snapshot.currentStoryline)
    const restoredStats: PlayerStats = { ...snapshot.playerStats, undoCount: snapshot.playerStats.undoCount + 1 }
    playerStatsRef.current = restoredStats
    setPlayerStats(restoredStats)
    setUndoHistory(prev => prev.slice(0, -1))
  }, [])

  /**
   * 打开「存档槽」弹窗。
   * 注意：这里不写盘，真正的写入在 handleSaveToSlot —— 因此手动存档计数
   * （PlayerStats.saveCount）也只加在 handleSaveToSlot 里。
   */
  const handleSave = useCallback(() => {
    setSaveSlotsMode('save')
    setIsSaveSlotsOpen(true)
  }, [])

  const handleSaveToSlot = useCallback((slotId: number) => {
    const currentCharacter = characterRef.current
    const currentGameState = gameStateRef.current
    const currentEventHistory = eventHistoryRef.current
    const currentLifeRecords = lifeRecordsRef.current
    const charForSave = { ...currentCharacter }
    // 「习惯性存档」成就：手动存档计数（自动存档不计入）。
    // 先把本次存档算进去，写盘成功后才落到内存 —— 写失败（配额不足）不虚增。
    const statsForSave: PlayerStats = {
      ...playerStatsRef.current,
      saveCount: playerStatsRef.current.saveCount + 1
    }
    // 必须和自动存档写入同一组字段：事件 id 在下月时就已经进了 eventHistory，
    // 若存档不带 currentEvent / pendingEvents，读档后该事件不会重放，
    // 玩家会永久错过一个已经「消耗掉」的事件（早期手动存档就存在这个问题）。
    const saveData: SaveData = {
      character: charForSave as any,
      gameState: currentGameState,
      eventHistory: currentEventHistory,
      currentEventId: currentEventRef.current?.id || null,
      currentEvent: currentEventRef.current || null,
      pendingEvents: pendingEventsRef.current,
      origin,
      degree,
      playerName: currentCharacter.name || playerName || '',
      identityType: identityTypeRef.current,
      lifeRecords: currentLifeRecords,
      savedAt: new Date().toISOString(),
      // 用 getTotalPlayTime() 而不是 playTime state：后者最多滞后一个心跳周期
      playTime: getTotalPlayTime(),
      achievements: loadAchievements(),
      difficulty,
      currentStoryline: currentStorylineRef.current,
      stats: statsForSave,
      meritBonus: meritBonusRef.current
    }
    const ok = saveSaveSlot(slotId, saveData)
    if (ok) {
      playerStatsRef.current = statsForSave
      setPlayerStats(statsForSave)
    }
    setIsSaveSlotsOpen(false)
    if (ok) {
      setSaveNotification({
        isOpen: true,
        message: '存档成功',
        subMessage: `${currentCharacter.name || '无名氏'} · ${currentGameState.currentYear}年${currentGameState.currentMonth}月 · ${currentCharacter.rank}`
      })
    } else {
      setSaveNotification({
        isOpen: true,
        message: '存档失败',
        subMessage: 'localStorage 写入异常，请检查浏览器存储空间或隐私模式设置'
      })
    }
  }, [origin, degree, playerName, difficulty, getTotalPlayTime])

  const handleLoadFromSlot = useCallback((slotId: number) => {
    const saveData = loadSaveSlot(slotId)
    if (saveData) {
      setIsSaveSlotsOpen(false)
      if (onReturnToMenuRef.current) {
        onReturnToMenuRef.current()
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('loadSave', { detail: saveData }))
        }, 100)
      }
    }
  }, [])

  /**
   * 重开一局（死亡 / 结局后的「重新开始」）。
   *
   * 这里必须重置**引擎的全部局内状态**。早先只重置了 gameState/lifeRecords/
   * currentEvent/isGameOver，导致两个严重问题：
   *   1. eventHistory 仍标记着上一局已触发过的全部事件 id，而事件选择器会过滤
   *      `history.includes(id)`，于是新一局几乎没有事件可触发；
   *   2. 角色（姓名、官阶、属性、升迁次数）沿用上一局的，等于用死者的身份重开。
   * 现在按「用同样的出身与姓名重新捏一个角色」的语义做完整重置。
   */
  const handleRestart = useCallback(() => {
    const freshCharacter = createInitialCharacter(
      origin,
      degree,
      bonusAttributes,
      playerName,
      playerCourtesyName,
      playerHometown,
      playerCustomAge
    )
    const originData = origins[origin]
    const initialGameStateFromOrigin = originData.initialGameState || {}
    const freshGameState: GameStateValues = {
      currentYear: 1628,
      currentMonth: 1,
      turn: 0,
      圣眷: initialGameStateFromOrigin.圣眷 ?? 50,
      中官: initialGameStateFromOrigin.中官 ?? 50,
      清议: initialGameStateFromOrigin.清议 ?? 50,
      士绅: initialGameStateFromOrigin.士绅 ?? 50,
      民望: initialGameStateFromOrigin.民望 ?? 50,
      国势: 75
    }
    const freshMeritScore = calculateMeritScore(freshCharacter, freshGameState)

    setCharacter(freshCharacter)
    setGameState(freshGameState)
    setEventHistory([])
    setPendingEvents([])
    setCurrentEvent(null)
    setUndoHistory([])
    setMeritScore(freshMeritScore)
    // 选项加分属于上一局，必须清零，否则新的一局开局就白拿一段政绩分。
    meritBonusRef.current = 0
    setMeritBonus(0)
    setPreviousMeritScore(freshMeritScore / difficultyConfig.promotionThresholdMultiplier)
    setIdentityType('official')
    setCurrentStoryline(undefined)
    setBiography('')
    setLifeRecords([])
    setDeathEndingState({
      show: false,
      type: 'martyrdom',
      title: '',
      description: '',
      echo: '',
      tags: []
    })
    setIsGameOver(false)
    setIsLifeReviewOpen(false)
    setPromotionMessage(null)
    setLastAutosaveFingerprint('')
    // 新的一局：局内统计清零（否则上一局的存档次数 / 连击数会串进新局，成就等于白送）
    const freshStats = createEmptyPlayerStats()
    playerStatsRef.current = freshStats
    setPlayerStats(freshStats)
    // 游玩时长同样从 0 重新计，并把心跳基准对齐到"现在"
    playTimeRef.current = 0
    playTimeSessionStartRef.current = Date.now()
    setPlayTime(0)
    // 清掉上一局的自动存档，否则返回标题后「继续游戏」会恢复已结束的那一局
    deleteAutosave()
  }, [
    origin,
    degree,
    bonusAttributes,
    playerName,
    playerCourtesyName,
    playerHometown,
    playerCustomAge,
    difficultyConfig
  ])

  const handleReturnToMenu = useCallback(() => {
    setIsGameOver(false)
    if (onReturnToMenuRef.current) {
      onReturnToMenuRef.current()
    }
  }, [])

  const generateLifeSummary = useCallback((): LifeSummary => {
    const startYear = 1628
    const endYear = gameStateRef.current.currentYear
    const character = characterRef.current
    const gameState = gameStateRef.current
    const lifeRecords = lifeRecordsRef.current

    const getReputation = () => {
      const { 理政 } = character.attributes
      const { 圣眷, 民望 } = gameState
      const { 道德值 } = character.hidden

      if (道德值 >= 70 && 民望 >= 60) return '清廉正直，深得民心'
      if (道德值 >= 50 && 理政 >= 60) return '政绩卓著，为官清廉'
      if (圣眷 >= 70) return '深受皇恩，位极人臣'
      if (道德值 <= 30) return '贪墨成性，声名狼藉'
      if (民望 <= 30) return '民怨沸腾，臭名昭著'
      return '平平无奇，碌碌无为'
    }

    const getLegacy = () => {
      const { 理政, 文韬 } = character.attributes
      const { 民望, 清议 } = gameState

      if (理政 >= 70 && 民望 >= 60) return '其政绩为后人所称道，百姓立碑纪念。'
      if (文韬 >= 70 && 清议 >= 60) return '其文章传世，为士林所推崇。'
      if (character.promotionCount >= 3) return '历经宦海沉浮，最终位极人臣。'
      if (character.demotionCount >= 2) return '仕途坎坷，屡遭贬谪，令人唏嘘。'
      return '其一生平淡，未留下太多痕迹。'
    }

    const achievements: string[] = []
    if (character.promotionCount >= 3) achievements.push(`历经${character.promotionCount}次升迁`)
    if (character.attributes.理政 >= 70) achievements.push('政绩斐然')
    if (character.attributes.文韬 >= 70) achievements.push('文采出众')
    if (character.attributes.武略 >= 70) achievements.push('武艺超群')
    if (gameState.圣眷 >= 70) achievements.push('深受皇恩')
    if (gameState.民望 >= 70) achievements.push('深得民心')
    if (character.hidden.道德值 >= 70) achievements.push('清廉自守')

    const controversies: string[] = []
    if (character.demotionCount >= 2) controversies.push(`遭贬${character.demotionCount}次`)
    if (character.hidden.道德值 <= 30) controversies.push('贪墨受贿')
    if (gameState.民望 <= 30) controversies.push('民怨沸腾')
    if (character.hidden.欲望值 >= 70) controversies.push('欲望膨胀')

    return {
      totalRecords: lifeRecords.length,
      // 与人物志共用同一套筛选口径（见 pickKeyLifeRecords 的说明），
      // 避免"两处各挑一套、口径不一致"的老问题再次出现
      keyEvents: pickKeyLifeRecords(lifeRecords, 10),
      finalTitle: character.rank,
      finalRank: character.degree,
      reputation: getReputation(),
      legacy: getLegacy(),
      lifespan: { start: startYear, end: endYear },
      achievements,
      controversies
    }
  }, [])

  const handleDeathEnding = useCallback((ending: {
    type: 'martyrdom' | 'suicide' | 'killed' | 'execution'
    title: string
    description: string
    echo: string
    tags: string[]
  }) => {
    const currentGameState = gameStateRef.current
    addLifeRecord({
      year: currentGameState.currentYear,
      month: currentGameState.currentMonth,
      type: 'death',
      title: ending.title,
      description: ending.description,
      impact: ending.echo
    })
    setDeathEndingState({
      show: true,
      ...ending
    })
  }, [])

  // UI 开关回调
  const openCheatMode = useCallback(() => setIsCheatModeOpen(true), [])
  const closeCheatMode = useCallback(() => setIsCheatModeOpen(false), [])
  const openAchievementPanel = useCallback(() => setIsAchievementPanelOpen(true), [])
  const closeAchievementPanel = useCallback(() => setIsAchievementPanelOpen(false), [])
  const openHelp = useCallback(() => setShowHelp(true), [])
  const closeHelp = useCallback(() => setShowHelp(false), [])
  const openAIAdvisor = useCallback(() => setShowAIAdvisor(true), [])
  const closeAIAdvisor = useCallback(() => setShowAIAdvisor(false), [])
  const openImageGenerator = useCallback(() => setShowImageGenerator(true), [])
  const closeImageGenerator = useCallback(() => setShowImageGenerator(false), [])
  const openLifeReview = useCallback(() => setIsLifeReviewOpen(true), [])
  const closeLifeReview = useCallback(() => setIsLifeReviewOpen(false), [])
  const closeTutorial = useCallback(() => setShowTutorial(false), [])
  const completeTutorial = useCallback(() => {
    localStorage.setItem('chongzhen_tutorial_seen', 'true')
    setShowTutorial(false)
  }, [])
  const closeSaveNotification = useCallback(() => setSaveNotification(prev => ({ ...prev, isOpen: false })), [])
  const closeSaveSlots = useCallback(() => setIsSaveSlotsOpen(false), [])
  const dismissNewAchievement = useCallback(() => setNewAchievement(null), [])
  const closeDeathEnding = useCallback(() => setDeathEndingState(prev => ({ ...prev, show: false })), [])

  const confirmResign = useCallback(() => {
    const pending = resignConfirmModal.choice
    setResignConfirmModal(prev => ({ ...prev, isOpen: false, choice: null, newStateVals: {}, newAttrs: characterRef.current.attributes }))
    if (!pending) {
      setIsGameOver(true)
      return
    }
    // 重放这次抉择，让它走完整条结算链路：属性、五方态度、隐藏属性、flags、
    // 生平记录、成就统计、结局图鉴登记，以及最重要的 handleGameOver
    // —— 它负责生成史馆传略并解锁对应结局成就。
    // 此前这里只有一句 setIsGameOver(true)：确认辞官后 gameState 的五方态度被整份丢弃，
    // 结局屏的「史馆传略」是空的，这个结局也永远不会写进图鉴。
    handleChoice(pending, { skipResignConfirm: true })
  }, [resignConfirmModal.choice, handleChoice])

  const cancelResign = useCallback(() => {
    // 什么都不必回滚：确认弹窗现在在一切写入之前就弹出（见 handleChoice 开头的辞官分支），
    // 取消 = 这次抉择从未发生。
    setResignConfirmModal(prev => ({ ...prev, isOpen: false, choice: null, newStateVals: {}, newAttrs: characterRef.current.attributes }))
  }, [])

  const handleLoadAutosave = useCallback(() => {
    setIsSaveSlotsOpen(false)
    // 必须走统一的 loadAutosave()，它内含 schema 迁移与隐藏属性/属性规整。
    //
    // 原来这里是自己 localStorage.getItem + JSON.parse —— 也就是**绕过了迁移**。
    // 后果：同一个自动存档，从标题屏读是好的（App.tsx 走 loadAutosave），
    // 从游戏内存档面板的「继续上次游戏」读就会绕过所有兜底直接进渲染，
    // 旧存档缺 attributes 时当场白屏（ErrorBoundary 接管）。
    // 这条路径玩家最容易误触（"读档闪退"），所以必须收敛到同一个入口。
    const saveData = loadAutosave()
    if (!saveData) return
    window.dispatchEvent(new CustomEvent('loadSave', { detail: saveData }))
  }, [])

  // 当 loadSaveData 变化时（读档），恢复存档数据
  useEffect(() => {
    if (!loadSaveData) return
    const char = loadSaveData.character
    const flags = char.degree === '进士' && !char.flags.includes('地方官任职')
      ? [...char.flags, '地方官任职']
      : char.flags

    const faction = (char as any).faction || {
      东林好感: 50,
      阉党好感: 50,
      立场: '未定',
      党争烈度: 30
    }

    const fixedCharacter = {
      ...char,
      courtesyName: char.courtesyName || '',
      hometown: char.hometown || '',
      flags,
      faction
    }

    const oldState = loadSaveData.gameState
    // 旧存档的键名迁移必须走 STATE_MAP 的同一张表。
    // 这里原来是 `士绅: 百姓口碑 ?? 士绅` —— 把「百姓口碑」错接给了士绅，
    // 而按 STATE_MAP，百姓口碑→民望、商贾→士绅。后果是 v1 存档读进来后，
    // 士绅态度被民望的数字顶替，且这个错误同时污染政绩分与贬官判定。
    const legacyState = oldState as unknown as Record<string, unknown>
    const numOr = (value: unknown, fallback: number): number => {
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? n : fallback
    }
    const initialGameState = {
      currentYear: oldState.currentYear,
      currentMonth: oldState.currentMonth,
      turn: oldState.turn,
      圣眷: numOr(legacyState.帝心 ?? oldState.圣眷, 50),
      中官: numOr(legacyState.安全 ?? legacyState.中官, 50),
      清议: numOr(legacyState.派系立场 ?? oldState.清议, 50),
      士绅: numOr(legacyState.商贾 ?? oldState.士绅, 50),
      民望: numOr(legacyState.百姓口碑 ?? oldState.民望, 50),
      国势: numOr(oldState.国势, 75)
    }

    const currentScore = calculateMeritScore(fixedCharacter, initialGameState)
    const correctRank = RANKS.slice().reverse().find(r => currentScore >= r.minScore)

    if (correctRank && fixedCharacter.rank !== correctRank.name) {
      fixedCharacter.rank = correctRank.name
    }

    setCharacter(fixedCharacter)
    setGameState(initialGameState)
    setEventHistory(loadSaveData.eventHistory)
    setUndoHistory([])
    setPendingEvents((loadSaveData as any).pendingEvents || [])
    const restoredEvent = (loadSaveData as any).currentEvent || null
    setCurrentEvent(restoredEvent)
    // 必须同步 ref：本文件末尾的「初始化第一个事件」effect 用 currentEventRef 作守卫，
    // 而 ref 由另一个 effect 在渲染后才回写。两个 effect 在同一次 commit 里按声明顺序执行，
    // 读档 effect 先跑、初始化 effect 后跑，此时 ref 仍是首帧的 null ——
    // 于是守卫失效，初始化逻辑重新摇一个事件覆盖掉刚读出来的那个，
    // 并把它的 id 连同整批候选 id 一起烧进 eventHistory（该事件永久消失）。
    currentEventRef.current = restoredEvent

    // 生平流水必须一起换掉。此前这里漏了 lifeRecords，导致在引擎已挂载的情况下
    // 切换存档（切槽位 / 读另一份自动存档）时，新的「生平回顾」里混着上一辈子的记录。
    // App.tsx 因为会先回标题页把 GameScreen 卸载，把这个缺陷掩盖了。
    setLifeRecords(loadSaveData.lifeRecords || [])

    // 游玩时长同样要换成存档里的值，并把心跳基准对齐到"现在"
    const restoredPlayTime =
      typeof loadSaveData.playTime === 'number' && Number.isFinite(loadSaveData.playTime)
        ? loadSaveData.playTime
        : 0
    playTimeRef.current = restoredPlayTime
    playTimeSessionStartRef.current = Date.now()
    setPlayTime(restoredPlayTime)

    // 局内统计随存档一起恢复（旧存档没有 stats → 全 0）
    const restoredStats = normalizePlayerStats(loadSaveData.stats)
    playerStatsRef.current = restoredStats
    setPlayerStats(restoredStats)

    // 事件侧显式加成的「政绩分」不来自属性，必须随存档一起存活，
    // 否则读档后这些加分被清零（见 meritBonus 状态声明处的说明）。
    const restoredMeritBonus = numOr((loadSaveData as any).meritBonus, 0)
    setMeritBonus(restoredMeritBonus)
    meritBonusRef.current = restoredMeritBonus

    const displayScore = currentScore + restoredMeritBonus
    setMeritScore(displayScore)
    // previousMeritScore 与升迁判定用的是**除以难度系数之后**的那条标尺
    // （见文件末尾升迁 effect 里的 adjustedScore）。这里必须一致，
    // 否则读档后 previous=base、current=base/系数，两者之差会被误判成
    // 「政绩下滑/擢升」——简单模式一读档就凭空升一级、困难模式就凭空贬一级。
    // 重开一局那条路径（handleRestart）本来就除了，唯独这里漏了。
    setPreviousMeritScore(displayScore / difficultyConfig.promotionThresholdMultiplier)

    if ((loadSaveData as any).identityType) {
      setIdentityType((loadSaveData as any).identityType)
    }

    const savedStoryline = (loadSaveData as any).currentStoryline
    if (savedStoryline) {
      currentStorylineRef.current = savedStoryline
      setCurrentStoryline(savedStoryline)
    }
  }, [loadSaveData])

  // 组件挂载/读档时初始化第一个事件
  // React 18 StrictMode 下挂载 effect 会执行两次（清理后重跑）。原守卫只依赖
  // currentEventRef / isProcessingRef，而这两个 ref 是由另外的 effect 在渲染后同步的，
  // 第二次执行时它们仍是旧值 → 事件 id 被重复写进 eventHistory、年龄被加两次。
  // 这里加一次性 ref 守卫，保证初始化逻辑只跑一次。
  const firstEventInitialisedRef = useRef(false)
  useEffect(() => {
    if (firstEventInitialisedRef.current) return
    firstEventInitialisedRef.current = true

    if (currentEventRef.current) return
    if (isProcessingRef.current) return

    checkAchievements()

    const params = {
      attributes: { ...characterRef.current.attributes } as Record<string, number>,
      // 同 checkBoundary：turn 缺失会让注入的 turn ≥ 36 判定恒假。
      gameState: { 圣眷: gameStateRef.current.圣眷, 中官: gameStateRef.current.中官, 清议: gameStateRef.current.清议, 士绅: gameStateRef.current.士绅, 民望: gameStateRef.current.民望, 国势: gameStateRef.current.国势, turn: gameStateRef.current.turn },
      hidden: { ...characterRef.current.hidden } as Record<string, number>,
      faction: characterRef.current.faction,
      flags: characterRef.current.flags,
      // 这两个键缺失时 compileConditions 的第 1)、2) 步会直接 `return false`
      // （它要求 currentYear / currentMonth 必须是 number 才继续判定年份窗口），
      // 于是所有带年份窗口的结局（甲申之变、殉国煤山这一类）在挂载路径上永不触发。
      // 「读档进来时条件本来就已经成立」这种最常见的场景恰好走的就是这条路径。
      currentYear: gameStateRef.current.currentYear,
      currentMonth: gameStateRef.current.currentMonth
    }

    const endingEvent = boundaryEventManager.checkByType(params, 'ending')
    if (endingEvent) {
      const bankrupt = endingEvent.id === 'bankrupt'
      const shown = bankrupt ? withEndingId(endingEvent.event) : endingEvent.event
      // 这个结局如果已经在历史里出现过，说明玩家是带着它走过一段之后才存的档。
      // 此时不再重播，否则会变成「读档 → 立刻又弹同一个结局」的死循环，存档再也进不去。
      if (eventHistoryRef.current.includes(shown.id) || eventHistoryRef.current.includes(endingEvent.event.id)) {
        // 继续走下面的正常开局流程
      } else {
        setCurrentEvent(shown)
        if (bankrupt) {
          handleGameOver(shown)
        }
        return
      }
    }

    const crisisEvent = boundaryEventManager.checkByType(params, 'crisis')
    if (crisisEvent && Math.random() < CRISIS_EVENT_PROBABILITY) {
      setCurrentEvent(crisisEvent.event)
      return
    }

    let allEvents = findAllEventsForState(gameStateRef.current)
    let newState = gameStateRef.current
    let attempts = 0
    while (allEvents.length === 0 && attempts < 24) {
      const nextMonth = newState.currentMonth + 1
      newState = nextMonth > 12
        ? { ...newState, currentMonth: 1, currentYear: newState.currentYear + 1 }
        : { ...newState, currentMonth: nextMonth }
      allEvents = findAllEventsForState(newState)
      attempts++
    }

    if (allEvents.length > 0) {
      if (newState !== gameStateRef.current) setGameState(newState)
      setCurrentEvent(allEvents[0])
      setPendingEvents(allEvents.slice(1))
      setEventHistory(prev => [...prev, ...allEvents.map(e => e.id)])
    }

    // 初始化时若跳过若干月份才找到事件，需同步增加角色年龄
    if (attempts > 0) {
      setCharacter(prev => ({
        ...prev,
        age: prev.age + attempts / 12
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 自动存档
  const autosaveTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (isProcessing) return
    if (!character || !gameState) return
    if (gameState.currentYear < 1628) return
    if (gameState.currentMonth < 1 || gameState.currentMonth > 12) return

    const charForSave = { ...character }
    const data: SaveData = {
      character: charForSave as any,
      gameState,
      eventHistory,
      currentEventId: currentEvent?.id || null,
      currentEvent: currentEvent || null,
      pendingEvents,
      origin,
      degree,
      playerName: character.name || playerName || '',
      identityType,
      lifeRecords,
      savedAt: new Date().toISOString(),
      // 同手动存档：累计值 + 尚未折算进累计值的当前区间
      playTime: getTotalPlayTime(),
      achievements: loadAchievements(),
      difficulty,
      currentStoryline,
      stats: playerStats,
      meritBonus
    }

    const fingerprint = `${gameState.currentYear}|${gameState.currentMonth}|${gameState.turn}|${eventHistory.length}|${character.attributes.财帛}|${character.attributes.文韬}|${character.attributes.理政}|${character.attributes.武略}|${character.attributes.体质}|${gameState.圣眷}|${gameState.中官}|${gameState.清议}|${gameState.士绅}|${gameState.民望}|${gameState.国势}|${character.flags.length}|${currentEvent?.id || ''}|${currentStoryline || ''}`
    if (fingerprint === lastAutosaveFingerprint) return

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      const ok = saveAutosave(data)
      if (!ok) {
        // 写入失败（多为 localStorage 配额耗尽）。以前这里静默失败，
        // 玩家会在毫无提示的情况下丢掉整局进度，现在明确告知。
        setSaveNotification({
          isOpen: true,
          message: '自动存档失败',
          subMessage: '浏览器本地存储已满，请删除旧存档或清理站点数据，否则进度可能丢失'
        })
      }
      setLastAutosaveFingerprint(fingerprint)
      autosaveTimerRef.current = null
    }, 400)

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [character, gameState, eventHistory, currentEvent, pendingEvents, isProcessing, identityType, lifeRecords, playTime, lastAutosaveFingerprint, origin, degree, playerName, difficulty, currentStoryline, playerStats, meritBonus])

  // 升官贬官检查
  useEffect(() => {
    const currentCharacter = characterRef.current
    const currentGameState = gameStateRef.current
    // 属性推导分 + 选项显式加分。两者必须同尺计入，否则 effects.meritScore 无处落地。
    const baseScore = calculateMeritScore(currentCharacter, currentGameState) + Math.round(meritBonus)
    const adjustedScore = baseScore / difficultyConfig.promotionThresholdMultiplier

    setMeritScore(baseScore)

    if (identityType === 'official') {
      const promotion = checkPromotion(adjustedScore, previousMeritScore)
      if (promotion.promoted && promotion.message) {
        setPromotionMessage(promotion.message)
        setCharacter(prev => ({
          ...prev,
          rank: promotion.newRank || prev.rank,
          promotionCount: prev.promotionCount + 1,
          history: [...prev.history, `${currentGameState.currentYear}年${currentGameState.currentMonth}月：${promotion.message}`]
        }))
        addLifeRecord({
          year: currentGameState.currentYear,
          month: currentGameState.currentMonth,
          type: 'promotion',
          title: '官升一级',
          description: promotion.message,
          impact: `晋升为${promotion.newRank}`
        })
        const bonus = promotion.scoreBonus ?? 0
        // 升官后立即更新基准分，避免同一轮再次触发升降官或 immediate 贬官
        setPreviousMeritScore(adjustedScore + bonus)
        setTimeout(() => checkAchievements(), 100)
        setTimeout(() => setPromotionMessage(null), 3000)
        return
      }

      const demotion = checkDemotion(adjustedScore, previousMeritScore, currentCharacter, currentGameState)
      if (demotion.demoted && demotion.message) {
        if (demotion.newIdentity === 'civilian' || demotion.newIdentity === 'exiled') {
          addLifeRecord({
            year: currentGameState.currentYear,
            month: currentGameState.currentMonth,
            type: 'demotion',
            title: '革职查办',
            description: demotion.message,
            impact: '被贬为庶民'
          })
          const isExiled = demotion.newIdentity === 'exiled'
          const demotionEndingEvent: GameEvent = {
            id: 'ending_demotion',
            title: isExiled ? '流放边疆' : '革职为民',
            description: '',
            endingConfig: { category: 'personal_fate', tier: isExiled ? 'dark' : 'tragic' },
            narrative: {
              speaker: { title: '吏部文书', name: '吏部主事' },
              quote: isExiled
                ? '奉旨：某某革职查办，永不起用，即日押解宁古塔，交驻防将军管束。'
                : '奉旨：某某才疏学浅，难胜其任。着即革职，削籍为民，永不录用。',
              background: demotion.message + '\n\n吏部的文书送到的时候，你正在批阅最后几份公文。接过的那一刻，你知道——一切都结束了。',
              situation: isExiled
                ? '押解官已经在门外等候。你被允许带一床被子、两件换洗衣服和三本书。从京城到宁古塔，要走整整四个月。'
                : '你脱下官服，换上布衣。腰间的铜鱼袋解下来放在案头，发出一声轻响。从此以后，你只是一个普通百姓。'
            },
            conditions: {},
            choices: [{
              id: 'accept',
              text: '接受命运',
              effects: { special: { type: 'ending' } },
              result: {
                title: isExiled ? '万里投荒' : '布衣终老',
                tags: isExiled
                  ? ['贬官流放', '个人命运', '黑暗']
                  : ['贬官为民', '个人命运', '悲剧'],
                echo: isExiled
                  ? `【结局·流放边疆】\n\n宁古塔的风像刀子一样割在脸上。\n\n你在这里已经待了三年。三年里，你见过零下四十度的严寒，见过被冻死在路边的流民，见过驻防将军鞭打逃卒时溅出的血点。\n\n起初你还想着翻案、想着申诉。后来你就不想了。在这片苦寒之地，活着本身就是一种奢侈。\n\n你开始学着和当地的女真人打交道，学着种他们叫做"哈拉"的庄稼，学着在暴风雪来临前把地窖封好。\n\n某年冬天，一个来自京城的信使带来了消息：崇祯帝自缢于煤山，大顺军攻入北京。\n\n你站在雪地里，看着南方的天空，久久没有说话。\n\n第二天，人们发现你坐在地窖门口，脸上带着一种奇怪的表情——像是释然，又像是悲哀。\n\n手里攥着一封没写完的信，收信人写着两个字："陛下"。\n`
                  : `【结局·革职为民】\n\n回乡的路比想象中更长。\n\n不是距离上的远——而是当你以一个庶民的身份走在曾经管辖过的土地上时，那种物是人非的感觉几乎让人窒息。\n\n你路过自己曾经审过案的县衙，门口的差役换了一批又一批，没人认得你。你在路边摊吃了一碗面，味道和你当年微服私访时吃过的一模一样，但心境已天差地别。\n\n你在老家置了几亩薄田，日出而作，日落而息。日子过得清贫倒也安稳。\n\n偶尔有旧识路过来看你，你们喝茶聊天，谁也不提当年的事。只有临走时，他们会多看你一眼，眼神里有惋惜，也有某种说不清的释然。\n\n你活到了六十三岁。去世那天是一个普通的秋日，阳光很好，院子里的菊花开了。\n\n你没有留下什么丰功伟绩，也没有留下什么骂名。就像这世间千千万万的普通人一样，来过，走过，然后离开了。\n\n《县志》载："某公，曾为朝廷命官，后因故罢归。居家课子，乡党称善。"\n`
              }
            }],
            type: 'ending'
          }
          setCurrentEvent(demotionEndingEvent)
          setIdentityType(demotion.newIdentity || 'civilian')
          // 必须走 handleGameOver：它负责把结局 id 写进 eventHistory、登记结局成就、
          // 生成史馆传略。此前这里只有 setIsGameOver(true)，于是革职为民/流放边疆
          // 这两个结局的结算屏是空白传略，而成就 ending_demotion_done
          // （判据是 eventHistory 含 'ending_demotion'）在数学上永远无法达成。
          handleGameOver(demotionEndingEvent)
          return
        }

        setPromotionMessage(demotion.message)
        setCharacter(prev => ({
          ...prev,
          rank: demotion.newRank || prev.rank,
          demotionCount: prev.demotionCount + 1,
          history: [...prev.history, `${currentGameState.currentYear}年${currentGameState.currentMonth}月：${demotion.message}（第${prev.demotionCount + 1}次贬官）`]
        }))
        addLifeRecord({
          year: currentGameState.currentYear,
          month: currentGameState.currentMonth,
          type: 'demotion',
          title: '贬官一级',
          description: demotion.message,
          impact: `贬为${demotion.newRank}`
        })
        setTimeout(() => checkAchievements(), 100)
        setTimeout(() => setPromotionMessage(null), 3000)
      }
    }

    setPreviousMeritScore(adjustedScore)
    // 依赖数组必须是"判定真正读过的一切"。此前漏了 4 个：
    //   character.attributes.体质  —— 「体弱多病」贬官理由
    //   character.hidden.野心值     —— 「结党营私」贬官理由
    //   character.degree            —— calculateMeritScore 里的功名加成（进士 +60 / 举人 +30）
    //   gameState.国势              —— 「失职渎职」贬官理由
    // 漏掉的后果是这些字段单独变化时判定根本不重跑，那几条理由形同虚设。
    //
    // 刻意**不**加入 character.rank：rank 会被贬官/升官本身改写，
    // 一旦进依赖就会形成「贬官 → rank 变 → 重新判定 → 再贬」的自激循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.attributes.理政, character.attributes.文韬, character.attributes.武略, character.attributes.财帛, character.attributes.体质, character.hidden.道德值, character.hidden.欲望值, character.hidden.野心值, character.degree, gameState.圣眷, gameState.中官, gameState.清议, gameState.士绅, gameState.民望, gameState.国势, difficultyConfig, identityType, previousMeritScore, meritBonus])

  return {
    // 状态
    character,
    gameState,
    currentEvent,
    pendingEvents,
    eventHistory,
    undoHistory,
    meritScore,
    previousMeritScore,
    promotionMessage,
    identityType,
    isGameOver,
    saveNotification,
    resignConfirmModal,
    isCheatModeOpen,
    isSaveSlotsOpen,
    saveSlotsMode,
    isAchievementPanelOpen,
    newAchievement,
    showTutorial,
    showHelp,
    showAIAdvisor,
    showImageGenerator,
    playTime,
    // 局内统计（「果断抉择 / 随心所欲 / 谨慎行事 / 习惯性存档」等成就的计数来源）。
    // 暴露出来既方便将来做统计面板，也让这些计数可被测试直接断言。
    playerStats,
    lifeRecords,
    isLifeReviewOpen,
    deathEndingState,
    biography,
    lastAutosaveFingerprint,
    isProcessing,

    // UI 开关
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
    dismissNewAchievement,
    closeDeathEnding,

    // 核心回调
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

    // 辅助函数
    getCurrentStoryline,
    findAvailableEvent,
    findAvailableEventWithState,
    findAllEventsForState,
    addLifeRecord,
    generateLifeSummary,
    checkAchievements,
    getEndingType,
    checkBoundary
  }
}
