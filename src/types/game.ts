export type OriginType = '寒门' | '缙绅' | '没落世家' | '诗文清望'

export type ExamStage = 
  | '县试'
  | '府试'
  | '院试'
  | '乡试'
  | '会试'
  | '殿试'

export type DegreeType = '童生' | '秀才' | '举人' | '贡士' | '进士'

export type FactionType = '东林党' | '齐楚浙党' | '中间派' | '复社' | '阉党' | '农民军' | '清朝'

export type PlayerFaction = '东林' | '阉党' | '中间' | '未定'

export interface FactionState {
  东林好感: number   // 0-100, 东林党对你的评价
  阉党好感: number    // 0-100, 阉党/权贵集团对你的评价
  立场: PlayerFaction // 当前公开立场
  党争烈度: number    // 0-100, 当前朝堂党争激烈程度
}

// ============================================
// 核心属性系统 - 全部 0-100 范围
// ============================================

// 【个人能力】五大能力
export interface Attributes {
  财帛: number  // 财富资源（抽象值，不等同银两）
  文韬: number  // 文学才华、谋略
  理政: number  // 政务处理能力
  武略: number  // 军事指挥能力
  体质: number  // 身体健康
}

/** 个人能力的默认值（新角色初始化与旧存档迁移共用） */
export const ATTRIBUTE_DEFAULTS: Attributes = {
  财帛: 20,
  文韬: 20,
  理政: 20,
  武略: 20,
  体质: 50
}

/**
 * 规整个人能力（可见属性）。
 *
 * 与 {@link normalizeHidden} 同理，但**这条更关键**：
 * 隐藏属性只被条件判定与数值运算读取，缺了顶多判定失真；
 * 而 `character.attributes` 被 AttributePanel / StatusBar / EndingCodex
 * 等组件**直接下标访问**（`attributes.理政`）。
 * 一旦读档时 `attributes` 整体缺失（undefined），渲染第一帧就抛
 *
 *   TypeError: Cannot read properties of undefined (reading '理政')
 *
 * 整个游戏被 ErrorBoundary 接管 —— 玩家看到的是崩溃界面而不是游戏。
 * 历史上 migrateSave 为**每一个**字段都做了兜底（flags / faction /
 * difficulty / stats / hidden …），唯独漏了 `attributes`，
 * 于是"缺 character 或 gameState 才拒绝"的那道校验放行了它，
 * 崩溃点被推迟到渲染期 —— 这正是最难排查的那种白屏。
 *
 * 因此读档路径必须无条件过一遍这个函数。
 */
export function normalizeAttributes(
  input: Partial<Record<keyof Attributes, number | null | undefined>> | null | undefined
): Attributes {
  const out: Attributes = { ...ATTRIBUTE_DEFAULTS }
  if (!input || typeof input !== 'object') return out
  for (const key of Object.keys(ATTRIBUTE_DEFAULTS) as Array<keyof Attributes>) {
    const value = input[key]
    // NaN 经 JSON 序列化会变成 null；两者都要当"缺失"处理，
    // 否则 `null + 5 === 5` 会把属性悄悄算错。
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(100, Math.round(value)))
    }
  }
  return out
}

// 【隐藏属性】五大心性
// 说明：机敏值 / 忠诚值 在事件数据中被引用 54 次（src/data/events/**），
// 但历史上 HiddenAttributes 只声明了前三项，导致：
//   - 写入效果时 `undefined + n === NaN`，NaN 被 JSON.stringify 写成 null 存进存档；
//   - 条件判定在内存里是 `NaN < min === false`（永远通过），
//     存盘再读回来变成 `null < min === true`（永远不通过）—— 同一条件前后行为相反。
// 现在把它们补成正式属性，并用 normalizeHidden 兜底历史存档。
export interface HiddenAttributes {
  道德值: number // 品德操守（>75君子 >50正直 >25常人 ≤25小人）
  欲望值: number // 欲望程度（>75强烈 >50一般 >25淡泊 ≤25清心）
  野心值: number // 权力野心（>75勃勃 >50有 >25微 ≤25无）
  机敏值: number // 机变敏锐（>75机警 >50敏锐 >25寻常 ≤25迟钝）
  忠诚值: number // 事上之忠（>75死忠 >50忠谨 >25观望 ≤25首鼠）
}

/** 隐藏属性的默认值（新角色初始化与旧存档迁移共用） */
export const HIDDEN_DEFAULTS: HiddenAttributes = {
  道德值: 50,
  欲望值: 50,
  野心值: 50,
  机敏值: 50,
  忠诚值: 50
}

/**
 * 把任意来源的 hidden 数据规整成完整的 HiddenAttributes。
 * 缺失、null、NaN、Infinity 一律回落到默认值，并夹到 0-100。
 * 这是历史存档（含 NaN/null 机敏值）能被安全读取的关键。
 */
export function normalizeHidden(
  input: Partial<Record<keyof HiddenAttributes, number | null | undefined>> | null | undefined
): HiddenAttributes {
  const out: HiddenAttributes = { ...HIDDEN_DEFAULTS }
  if (!input) return out
  for (const key of Object.keys(HIDDEN_DEFAULTS) as Array<keyof HiddenAttributes>) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(100, Math.round(value)))
    }
  }
  return out
}

// 【五方态度】四档制评价
export interface GameStateValues {
  currentYear: number
  currentMonth: number
  turn: number
  // 五方态度（全部 0-100）
  圣眷: number  // 皇帝态度（>75圣宠 >50受宠 >25平常 ≤25失宠）
  中官: number  // 宦官态度（>75心腹 >50亲近 >25中立 ≤25敌视）
  清议: number  // 清流评价（>75东林 >50清流 >25孤立 ≤25孤立）
  士绅: number  // 士绅态度（>75拥戴 >50支持 >25中立 ≤25反对）
  民望: number  // 百姓评价（>75爱戴 >50称颂 >25平淡 ≤25怨声）
  国势: number
}



// ============================================
// 角色数据
// ============================================

export interface OriginData {
  type: OriginType
  name: string
  tags: string[]
  background: string
  initialAttributes: Attributes
  /** 出身的隐藏属性初值；未列出的键由 normalizeHidden 补默认 50 */
  initialHidden: Partial<HiddenAttributes>
  initialGameState?: Partial<Omit<GameStateValues, 'currentYear' | 'currentMonth' | 'turn'>>
  features: string[]
  playStyle: string
  examBonus: Partial<Attributes>
  initialRank?: string
  initialDegree?: string
}

export interface Character {
  name: string
  /** 字（表字）。开局取名时由系统按姓名自动生成，玩家可改 */
  courtesyName: string
  /** 籍贯。开局取名时玩家可自填或随机抽取 */
  hometown: string
  age: number
  origin: OriginType
  rank: string
  degree: DegreeType
  attributes: Attributes
  hidden: HiddenAttributes
  flags: string[]
  /**
   * 每段经历**落笔的那一个月**（`gameState.turn`），与 `flags` 平行。
   *
   * 只有这一个用途：给 `conditions.flags.since` 提供入参，让"孩子几岁了""三年之后"
   * 这类正文承诺能按经历自己的时间开门，而不是按公元年。
   * 写它的地方是引擎结算抉择的那一处（`useGameEngine` 里加/移除 flag 的同一行），
   * 移除经历时一起删掉 —— 不然复婚、再中进士这类"第二次发生"会被算成第一次的年纪。
   *
   * 可选：第 54 轮之前的存档只有 `flags`。缺记录时门槛**放行**，
   * 老存档不会因此丢掉已有的回响事件。
   */
  flagTurns?: Record<string, number>
  history: string[]
  wives: Wife[]
  lovers: Lover[]
  examHistory: ExamRecord[]
  promotionCount: number  // 升迁次数
  demotionCount: number   // 贬官次数
  faction: FactionState   // 派系状态
}

// ============================================
// 生平记录系统
// ============================================

export interface LifeRecord {
  id: string
  year: number
  month: number
  type: 'birth' | 'exam' | 'promotion' | 'demotion' | 'event' | 'choice' | 'death' | 'marriage' | 'relation'
  title: string
  description: string
  impact?: string
  attributesChange?: Partial<Attributes>
  gameStateChange?: Partial<GameStateValues>
  hiddenChange?: Partial<HiddenAttributes>
  relatedCharacters?: string[]
  relatedEvent?: string
}

export interface LifeSummary {
  totalRecords: number
  keyEvents: LifeRecord[]
  finalTitle: string
  finalRank: string
  reputation: string
  legacy: string
  lifespan: { start: number; end: number }
  achievements: string[]
  controversies: string[]
}

export interface ExamRecord {
  stage: ExamStage
  year: number
  passed: boolean
  score?: number
  ranking?: number
}

export interface Wife {
  name: string
  type: '正妻' | '妾室'
  relationship: number
}

export interface Lover {
  name: string
  type: string
  relationship: number
}

export const STATE_MAP = {
  圣眷: '圣眷',
  清议: '清议',
  中官: '中官',
  民望: '民望',
  国势: '国势'
} as const;
