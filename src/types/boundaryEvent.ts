import { GameEvent } from './event'
import { FactionState } from './game'

export interface BoundaryEventCheckParams {
  attributes: Record<string, number>
  /** 五方态度 + turn（turn 是 GameStateValues 的字段，所以搭在这里） */
  gameState?: Record<string, number>
  hidden?: Record<string, number>
  faction?: FactionState
  flags?: string[]
  /**
   * 以下四个键过去只存在于调用方的对象字面量里、类型上没有，
   * 于是 boundaryEventCompiler 只能 `(params as any).currentYear` 这样取值 ——
   * 「判定要的键」和「传进来的键」对不上时编译器只会 return false，
   * 而 return false 长得跟"条件不满足"一模一样，缺陷因此躲过了肉眼检查（第六轮）。
   */
  currentYear?: number
  currentMonth?: number
  characterOrigin?: string
  characterRank?: string
  /** 年岁（`character.age`）—— `conditions.age` 读它；缺键按 0 算，于是年龄门恒假 */
  characterAge?: number
  /**
   * 每段经历**落笔的那个月**（`character.flagTurns`）—— `conditions.flags.since` 读它。
   *
   * 第六十九轮补上这个入参。过去结局格走边界求值器，而这里没有"经历何时落下"，
   * 于是 `since` 写在结局格上等于没写（`audit-event-shape` 按 NOOP 报出），
   * 作者只能改用公元年窗间接表达时长 —— 年窗管天下，不管这个人做了多久。
   *
   * 与 `eventConditions` 同一条容错：**缺记录放行**（老存档只有 flags、没有月份，
   * 判死等于把玩家已有的结局凭空收走）。所以"整个键没传"与"这一张票没有落笔记录"
   * 都是放行，不是恒假 —— 别把它写成 `?? 0`（那会变成年龄门那种恒假陷阱）。
   */
  flagTurns?: Record<string, number>
}

export interface BoundaryEvent {
  id: string
  priority: number
  check: (params: BoundaryEventCheckParams) => boolean
  event: GameEvent
  type: 'ending' | 'crisis'
}

export type BoundaryEventRegistry = Record<string, BoundaryEvent>
