import { Attributes, HiddenAttributes } from './game'

/**
 * 属性 / 态度键的**唯一合法集合**：只有引擎真正解析得了的那些。
 *
 * 引擎两侧都是"查表，查不到就按原名用"：
 *   - `attributes[key] || 0` —— 认不出的属性名恒为 0，任何 min>0 的条件永不满足（死事件）
 *   - `STATE_MAP[key] || key` 再比较 `state[k]` —— 认不出的状态名比的是 undefined，
 *     `undefined < min` 与 `undefined > max` 都是 false，这条条件被静默跳过（比设计更早触发）
 *   - 效果侧认不出就按原名写进 attributes / gameState —— 凭空长出垃圾字段，跟存档一路复制
 *
 * 原来的 `LegacyAttributes` / `LegacyGameStateConditions` 等把 名望 / 政绩 / 圣眷（当属性用）/
 * 地方治安 / 财帛（当态度用） 全都列进了白名单，等于**类型系统在替引擎撒谎**：
 * 它允许写的键，恰恰是引擎解析不了的键。所以第七轮那 5 个死事件就算摘掉 `@ts-nocheck`
 * 也照样溜得过 tsc。现在收紧成与 ATTR_MAP / STATE_MAP 一致的两张表。
 *
 * 一致性由 tests/unit/types.keysMatchEngine.test.ts 逐键对账（那边是运行时真值，这边是类型声明）。
 */
export type AttributeKey = keyof Attributes | '文辩' | '朝政' | '权势' | '机敏' | '道德'

/**
 * 五方态度本体 + STATE_MAP 的别名。
 * 时间键（currentYear / currentMonth / turn）**不在这里** ——
 * `cond.gameState.currentYear` 会被引擎 `continue` 掉，写它等于没写，
 * 年份窗口要用 `cond.year`。
 */
export type StateKey =
  | '圣眷' | '中官' | '清议' | '士绅' | '民望' | '国势'
  | '帝心' | '派系立场' | '百姓口碑' | '商贾' | '安全' | '军事' | '道德' | '文化' | '军心'

export type HiddenKey = keyof HiddenAttributes

type Range = { min?: number; max?: number }

export type LegacyAttributes = Partial<Record<AttributeKey, number>>
export type LegacyGameState = Partial<Record<StateKey, number>>
export type LegacyAttributeConditions = Partial<Record<AttributeKey, Range>>
export type LegacyGameStateConditions = Partial<Record<StateKey, Range>>

export interface EventConditions {
  year?: { min?: number; max?: number }
  month?: { min?: number; max?: number }
  /**
   * 游戏月数（`state.turn`，从 0 起算）。
   * 时间类条件一律走 year / month / turn 这三个一等键；
   * 过去把 turn 塞进 `gameState` 里，两个求值器对它的态度是相反的
   * （boundaryEventCompiler 比，eventConditions 直接 continue 跳过），现改到这里。
   */
  turn?: Range
  rank?: string | string[]
  origin?: string | string[]
  attributes?: LegacyAttributeConditions
  hidden?: Partial<Record<HiddenKey, Range>>
  gameState?: LegacyGameStateConditions
  flags?: { has?: string[]; notHas?: string[]; any?: string[]; none?: string[]; all?: string[]; some?: string[] }
  charactersAlive?: string[]
  charactersDead?: string[]
  historicalFlags?: Record<string, string>
  random?: number
  relationships?: Record<string, { min?: number; max?: number }>
  custom?: (ctx: any) => boolean
}

export interface EventEffects {
  attributes?: LegacyAttributes
  hidden?: Partial<Record<HiddenKey, number>>
  gameState?: LegacyGameState
  flags?: { add?: string[]; remove?: string[] }
  relationships?: Record<string, number>
  family?: Record<string, number>
  nextEvents?: string[]
  special?: { type: 'death' | 'promotion' | 'imprisonment' | 'exile' | 'ending'; value?: string }
  meritScore?: number
}

export interface NarrativeSpeaker {
  name: string
  title: string
  avatar?: string
}

export interface EventNarrative {
  speaker?: NarrativeSpeaker
  quote?: string
  background: string
  situation: string
}

export interface ChoiceResult {
  title?: string
  tags?: string[]
  echo: string
}

export interface DiceCheck {
  attribute: string
  difficulty: number
  reason: string
  penaltyEffect?: EventEffects
}

export interface EventChoice {
  id: string
  text: string
  quote?: string
  description?: string
  /** 选择后将切换到的剧情线（留空则继承事件剧情线） */
  storyline?: string
  showConditions?: EventConditions
  effects: EventEffects
  resultDescription?: string
  result?: ChoiceResult
  // 投骰失败的副作用和结果（可选，若未提供则默认生成）
  failEffects?: EventEffects
  failResultDescription?: string
  failResult?: ChoiceResult
  check?: DiceCheck
  staminaCost?: number
  staminaRequired?: number
  staminaBonus?: number
  condition?: ((ctx: any) => boolean) | EventConditions
}

export type EventType = 'normal' | 'historical' | 'random' | 'chain' | 'ending' | 'transition' | 'gray' | 'emotion' | 'character' | 'national' | 'faction'

export interface EndingConfig {
  /** 结局大类：personal_fate=个人命运 / ming_fate=大明国运 / official=官员系 / martyr=殉国系 / villain=反派系 / hermit=隐世系 / gray=灰色线 / special=特殊 */
  category: 'personal_fate' | 'ming_fate' | 'official' | 'martyr' | 'villain' | 'hermit' | 'gray' | 'special'
  /** 结局品级：legendary=传奇 / saintly=圣贤 / bittersweet=苦乐参半 / tragic=悲剧 / dark=黑暗 / controversial=争议 / mysterious=神秘 / redemptive=救赎 */
  tier: 'legendary' | 'saintly' | 'bittersweet' | 'tragic' | 'dark' | 'controversial' | 'mysterious' | 'redemptive'
  /** 结局前奏事件 ID（提前一个月播放的过渡事件） */
  preludeEventId?: string
}

export interface GameEvent {
  id: string
  title: string
  description: string
  narrative?: EventNarrative
  conditions: EventConditions
  choices: EventChoice[]
  type: EventType
  endingConfig?: EndingConfig
  /** 结局前奏事件标记：true=这是某结局的 preludes（强制优先播放） */
  isPreEnding?: boolean
  /** 关联的结局 ID（prelude 用，标识此 prelude 指向哪个结局） */
  linksToEndingId?: string
  /** 所属剧情线 ID（用于事件管理器加权推荐，见 src/data/storylines.ts） */
  storyline?: string
  /** 本事件完成后，下一次/几次事件管理器应优先触发的事件 ID 列表 */
  nextEvents?: string[]
}
