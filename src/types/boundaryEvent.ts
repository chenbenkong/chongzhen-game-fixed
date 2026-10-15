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
}

export interface BoundaryEvent {
  id: string
  priority: number
  check: (params: BoundaryEventCheckParams) => boolean
  event: GameEvent
  type: 'ending' | 'crisis'
}

export type BoundaryEventRegistry = Record<string, BoundaryEvent>
