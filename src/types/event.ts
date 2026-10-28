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
  /**
   * 年岁（`character.age`，整数岁）。
   *
   * 加它的原因是一个量具量不到的死局：**全部 43 格结局的年窗最晚只到 1660**，
   * 而没有任何一处判据读年岁 —— 于是一个熬过最后一个年窗、又没被任何一格收走的人
   * 从此不朽（第五十六轮实测：`seed6/warden/寒门` 一路活到公元 10713 年、
   * 局长 109029 个月，中途没有一格肯结案）。
   *
   * 为什么用年岁而不是把某个年窗往后延：年岁是玩家**看得见**的量 ——
   * 顶栏「年方X岁」、生涯回顾的「享年」、碑文里的「卒，年X」。
   * 「活到七十岁」是一个能被理解、能被预期、也能被回避的条件；
   * 「1661 年以后天下没有故事了所以系统强行收你」不是。
   *
   * 读它的求值器与 `since` 同一套规矩：`boundaryEventCompiler`（结局/边界池）与
   * `checkEventConditions`（事件池）认这个键，`checkChoiceRequirement`（选项级门）**不读** ——
   * 写在 `showConditions` 里是一道看不见的门，体检脚本（`audit-event-shape`）按 NOOP 报出。
   */
  age?: Range
  rank?: string | string[]
  origin?: string | string[]
  attributes?: LegacyAttributeConditions
  hidden?: Partial<Record<HiddenKey, Range>>
  gameState?: LegacyGameStateConditions
  flags?: {
    has?: string[]
    notHas?: string[]
    any?: string[]
    none?: string[]
    all?: string[]
    some?: string[]
    /**
     * 「这段经历距今多久」—— 键是经历名，值是**月数**区间，语义与 `cond.turn` 同一把尺子。
     *
     * 加它是因为有一类门根本不该读公元年：《名帖》正文写的是「孩子到了入塾的年纪」，
     * 门却写着 `year.min: 1638` —— 第五十四轮实测 15 次开口全在 1638 年，
     * 开口时孩子 28～102 个月（2.3 岁到 8.5 岁）都有。年窗管的是"天下发生了什么"，
     * 管不了"你家孩子几岁"；两者之间没有因果关系，硬对齐就变成玩家看得见正文、
     * 引擎看不见正文的生硬分支。
     *
     * 读的是 `character.flagTurns`（经历落笔那一个月）。三个求值器都认这个键：
     * `checkEventConditions`（事件池）、`checkChoiceRequirement`（选项锁）、
     * `boundaryEventCompiler`（结局格）。最后那一家是第六十九轮才补上的入参 ——
     * 在此之前写在结局格上等于没写（`audit-event-shape` 按 NOOP 报出），
     * 作者想表达"守了三年孤城"只能改用公元年窗间接兜，而年窗管天下、不管这个人做了多久
     * （§1.4 ㊸：实测《边关大将》的门票落在 1637 年，年窗开在 1638 年，
     * 于是"守孤城三年"那一句话在引擎里只有 9 个月的根据）。
     *
     * **写法上的坑**：`since` 的每一项都是**必查**的（与 `has` 同一条形状）。
     * 把它写在只出现在 `any` 列表里的经历上，等于悄悄把那张 `any` 网收成"必须持有这一张"，
     * 玩家看得见的是"我明明走的是这条路"，看不见的是"你走的是另一张票那条支路"。
     * 要限时长，就限这条路的**前提经历**（《边关大将》→ 边关任职），别限网里的任意一张。
     *
     * 老存档里带着经历却没有落笔月份：这一句**放行**（与 `cond.gameState`
     * 跳过遗留时间键同一条理由 —— 判死会让玩家已有的内容凭空消失）。
     */
    since?: Record<string, { min?: number; max?: number }>
    /**
     * 「这几段经历里，最老的一段满 N 月」—— 时长门的**列表形状**。
     *
     * `since` 是 AND：每一项必查，所以它只能钉在"这条路的前提经历"上。第六十九轮量出
     * 把它写在 `any` 网里的任意一张票上会发生什么（`{ any: [A, B], since: { A } }` 读起来
     * 像"任一条路满三年"，引擎看到的是"A 必须有且 A 满三年"，B 那条支路整条消失且没有日志），
     * 从那以后 `audit-event-shape` 把那种写法按「窄化」报掉 —— 于是"这一段路上做过的事满几年"
     * 这种最自然的问法反而没有原语可写，作者只能不写，或者退回公元年窗间接兜。
     *
     * `sinceAny` 是它的 OR 版：**所列经历里至少有一段**，落笔满 `min` 且不超过 `max`。
     * 因为它是 or，它永远不收窄这张网 —— 网里每一条支路都照样算数，只是都得"做得够久"。
     * `min`/`max` 都可省：只写 `min` 是"至少有一段够久"，只写 `max` 是"至少有一段还新鲜"，
     * 两个都写是一扇窗口。判定读的还是 `character.flagTurns`，与 `since` 同一条老存档容错
     * （身上有这张票、却没有落笔月份 → 放行；一张票都没有 → 关）。
     *
     * 三个求值器都认（事件池 / 选项锁 / 边界编译器），命途面板与四份体检脚本也认。
     */
    sinceAny?: { flags: string[]; min?: number; max?: number }
    /**
     * 「这几段经历里至少有过 N 段」—— 四张票凑三张这一类。
     *
     * `has` / `all` 是"全都要"，`any` / `some` 是"至少一段"，中间那档此前没有原语：
     * 中兴线要的是"做过三件不同的事"，写 `any` 就退化成一张票就够。
     * 它和 `custom` 的基数判定同义，但事件池（`checkEventConditions`）读不到 `custom`，
     * 所以必须是一等键。三个求值器都认（事件级 / 选项级 / 边界池）。
     */
    minCount?: { flags: string[]; min: number }
  }
  random?: number
  /**
   * 只有 `boundaryEventCompiler`（ending / triggerable 两个池，由 BoundaryEventManager 触发）
   * 会在**事件级**调用它。事件池走的 `checkEventConditions` 和选项级走的
   * `checkChoiceRequirement` 都不读这个键 —— 在旁边写一道 custom 并不构成一道门，
   * 体检脚本按 NOOP 报出来。
   */
  custom?: (ctx: any) => boolean
}

export interface EventEffects {
  attributes?: LegacyAttributes
  hidden?: Partial<Record<HiddenKey, number>>
  gameState?: LegacyGameState
  flags?: { add?: string[]; remove?: string[] }
  /**
   * 引擎只认 `'ending'`（useGameEngine 里两处 `special?.type === 'ending'`）。
   * 这里原来还列着 death / promotion / imprisonment / exile 和一个 value 字段，
   * 四者既无实现也无数据（43 处全是 `{ type: 'ending' }`）——
   * 留着等于向作者承诺"写这些会被特殊处理"，而实际什么都不会发生。
   * 死亡 / 贬谪 / 革职走的是引擎自己的升迁贬谪判定，不经过这个键。
   */
  special?: { type: 'ending' }
  meritScore?: number
}

/**
 * 话者卡片的两行文字（姓名 + 头衔）。
 * 这里原来还挂着 `avatar?: string`，数据里写了 301 处，全部指向 `/avatars/*.png`，
 * 而 `public/avatars/` 这个目录从来不存在（dist 里也没有），也没有任何组件读它 ——
 * 话者头像一直是 EventDisplay 按姓名首字现画的 SVG 印记。
 * 「没人读、又指向不存在资源」的字段比没有字段更糟：下一个人把它接进 UI 就得到 301 张碎图。
 * 所以字段和那 301 处一起删了，值域体检脚本从此替所有人盯着这类站内路径。
 */
export interface NarrativeSpeaker {
  name: string
  title: string
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
  staminaCost?: number
  staminaRequired?: number
  staminaBonus?: number
}

export type EventType = 'normal' | 'historical' | 'random' | 'chain' | 'ending' | 'transition' | 'gray' | 'emotion' | 'character' | 'national' | 'faction'

export interface EndingConfig {
  /** 结局大类：personal_fate=个人命运 / ming_fate=大明国运 / official=官员系 / martyr=殉国系 / villain=反派系 / hermit=隐世系 / gray=灰色线 / special=特殊 */
  category: 'personal_fate' | 'ming_fate' | 'official' | 'martyr' | 'villain' | 'hermit' | 'gray' | 'special'
  /** 结局品级：legendary=传奇 / saintly=圣贤 / bittersweet=苦乐参半 / tragic=悲剧 / dark=黑暗 / controversial=争议 / mysterious=神秘 / redemptive=救赎 */
  tier: 'legendary' | 'saintly' | 'bittersweet' | 'tragic' | 'dark' | 'controversial' | 'mysterious' | 'redemptive'
  /**
   * 结局前奏事件 ID（提前一个月播放的过渡事件）。
   *
   * 运行时**不读**这个键 —— 让 prelude 强制优先播放的是事件上的 `isPreEnding` 标记
   * （useGameEngine 的 transition 分层）。这两个字段是同一份知识写两遍，
   * 所以它靠 `scripts/audit-value-domains.ts` 双向对账：谁悬空、谁单向，一律报 LINK。
   */
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
  /** 结局前奏事件标记：true=这是某结局的 preludes（引擎按此强制优先播放） */
  isPreEnding?: boolean
  /**
   * 关联的结局 ID（prelude 用，标识此 prelude 指向哪个结局）。
   * 与 `EndingConfig.preludeEventId` 一样只服务于体检脚本的双向对账，
   * 运行时读的是上面的 `isPreEnding`。
   */
  linksToEndingId?: string
  /**
   * 可拒绝的结局（§1.4 ⑬「史馆请笔」）：true = 判定命中时引擎**只把卡摆上桌，不结算**。
   *
   * 只有 `src/data/endingDecline.ts` 会给这个标记，也只有 useGameEngine 的三处结局
   * 落点读它。拒绝的代价由数据自己说：这类结局的 `conditions.flags.notHas` 里带着
   * 属于**自己那一格**的 `搁笔·<格名>`，玩家点了【搁笔】就本局不再被这一格请笔 ——
   * 但别格照旧会来（第二十二轮：公共闸门会把"选哪一格"交还给优先级数字）。
   * 同时写下的 `史馆辞笔` 是履历，不是闸门，它由 echo_shiguan_001 正面读。
   */
  declinable?: boolean
  /** 所属剧情线 ID（用于事件管理器加权推荐，见 src/data/storylines.ts） */
  storyline?: string
}
