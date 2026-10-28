// 把 GameEvent.conditions 编译成 BoundaryEvent.check 函数的工具
// 用于把"叙事性结局"包装成"可触发的边界事件"

import { GameEvent, EventConditions, LegacyAttributeConditions, LegacyGameStateConditions } from '../types/event'
import { BoundaryEvent, BoundaryEventCheckParams } from '../types/boundaryEvent'
import { evalSinceAny } from '../utils/flagDuration'

/**
 * 编译结局的 conditions 为边界事件 check 函数
 * 全部 GameState 字段都查 ctx.gameState
 * 全部 Attributes 字段都查 ctx.attributes
 * 全部 HiddenAttributes 字段都查 ctx.hidden
 * 阵营字段查 ctx.faction
 * 标记查 ctx.flags
 *
 * 如果 conditions 为空（{}），默认永真。
 */
function compileConditions(conditions: EventConditions | undefined) {
  return (params: BoundaryEventCheckParams): boolean => {
    if (!conditions) return true

    // 1) 年份 — 必须拿到 currentYear 才能继续判定
    if (conditions.year) {
      const cur = params.currentYear
      if (typeof cur !== 'number') {
        return false
      }
      if (conditions.year.min !== undefined && cur < conditions.year.min) return false
      if (conditions.year.max !== undefined && cur > conditions.year.max) return false
    }

    // 2) 月份
    if (conditions.month) {
      const cur = params.currentMonth
      if (typeof cur !== 'number') {
        return false
      }
      if (conditions.month.min !== undefined && cur < conditions.month.min) return false
      if (conditions.month.max !== undefined && cur > conditions.month.max) return false
    }

    // 2.5) 游戏月数 —— 与 eventConditions 用同一个键，两个求值器的语义终于一致
    if (conditions.turn) {
      const cur = params.gameState?.turn
      if (typeof cur !== 'number') {
        return false
      }
      if (conditions.turn.min !== undefined && cur < conditions.turn.min) return false
      if (conditions.turn.max !== undefined && cur > conditions.turn.max) return false
    }

    // 2.6) 年岁 —— 与 eventConditions 同一个键；缺键按 0 算（年龄门恒假）
    if (conditions.age) {
      const cur = params.characterAge ?? 0
      if (conditions.age.min !== undefined && cur < conditions.age.min) return false
      if (conditions.age.max !== undefined && cur > conditions.age.max) return false
    }

    // 3) 出身
    if (conditions.origin) {
      const origins = Array.isArray(conditions.origin) ? conditions.origin : [conditions.origin]
      const charOrigin = params.characterOrigin
      if (charOrigin && !origins.includes(charOrigin)) return false
    }

    // 4) 官阶
    if (conditions.rank) {
      const ranks = Array.isArray(conditions.rank) ? conditions.rank : [conditions.rank]
      const charRank = params.characterRank
      if (charRank && !ranks.includes(charRank)) return false
    }

    // 5) 属性 attributes
    if (conditions.attributes) {
      if (!checkLegacyObj(conditions.attributes as LegacyAttributeConditions, params.attributes)) {
        return false
      }
    }

    // 6) 隐藏属性 hidden
    if (conditions.hidden) {
      if (!checkLegacyObj(conditions.hidden as any, params.hidden || {})) {
        return false
      }
    }

    // 7) 国势类 gameState
    if (conditions.gameState) {
      if (!checkLegacyObj(conditions.gameState as LegacyGameStateConditions, params.gameState || {})) {
        return false
      }
    }

    // 8) 标记 flags
    if (conditions.flags) {
      const flags = params.flags || []
      if (conditions.flags.has) {
        for (const f of conditions.flags.has) {
          if (!flags.includes(f)) return false
        }
      }
      if (conditions.flags.notHas) {
        for (const f of conditions.flags.notHas) {
          if (flags.includes(f)) return false
        }
      }
      if (conditions.flags.all) {
        for (const f of conditions.flags.all) {
          if (!flags.includes(f)) return false
        }
      }
      if (conditions.flags.any || conditions.flags.some) {
        const anyList = conditions.flags.any || conditions.flags.some || []
        if (anyList.length > 0 && !anyList.some(f => flags.includes(f))) {
          return false
        }
      }
      if (conditions.flags.none) {
        for (const f of conditions.flags.none) {
          if (flags.includes(f)) return false
        }
      }
      // minCount：其中至少 N 段。与另外两个求值器同一把尺子（第 62 轮）。
      if (conditions.flags.minCount) {
        const { flags: need, min } = conditions.flags.minCount
        if (min > 0 && need.filter(f => flags.includes(f)).length < min) return false
      }
      // since：这段经历得满多久才算数。与 `checkEventConditions`、`checkChoiceRequirement`
      // 同一把尺子、同一条容错 —— 缺落笔记录**放行**（老存档只有 flags 没有月份，
      // 判死等于把玩家已经攒出来的结局收走）。
      // 第六十九轮才补这一段：这个键此前写在结局格上是纯 NOOP，因为边界入参里没有
      // `flagTurns`，作者想表达"守了三年孤城"只能改用公元年窗间接兜，而年窗管的是天下、
      // 不管这个人做了多久（§1.4 ㊸）。
      // turn 在这里必然已是数字：`wrapBatchAsBoundaryEvents` 强制 `conditions.turn`，
      // 上面 2.5 那条见到 `gameState.turn` 缺失就整格 return false 了。
      if (conditions.flags.since) {
        for (const [flag, range] of Object.entries(conditions.flags.since)) {
          if (!flags.includes(flag)) return false
          const at = params.flagTurns?.[flag]
          if (at === undefined) continue
          const elapsed = (params.gameState?.turn ?? 0) - at
          if (range.min !== undefined && elapsed < range.min) return false
          if (range.max !== undefined && elapsed > range.max) return false
        }
      }
      // sinceAny：时长门的列表形状 —— 「这几段里最老的一段满 min」，or 语义，不收窄那张网。
      // 与事件池、选项锁共用 `evalSinceAny`（含同一条老存档容错：有票没月份就放行，
      // 一张票都没有才关）。
      if (conditions.flags.sinceAny) {
        if (!evalSinceAny(conditions.flags.sinceAny, flags, params.flagTurns, params.gameState?.turn ?? 0).open) {
          return false
        }
      }
    }

    // 9) 随机数（用 Math.random 模拟）
    if (typeof conditions.random === 'number') {
      if (Math.random() * 100 > conditions.random) return false
    }

    // 10) custom 函数
    if (conditions.custom) {
      try {
        if (!conditions.custom(params)) return false
      } catch (e) {
        return false
      }
    }

    return true
  }
}

function checkLegacyObj(
  obj: Record<string, { min?: number; max?: number } | undefined>,
  src: Record<string, number>
): boolean {
  for (const key of Object.keys(obj)) {
    const range = obj[key]
    if (!range) continue
    const val = src[key] ?? 0
    if (range.min !== undefined && val < range.min) return false
    if (range.max !== undefined && val > range.max) return false
  }
  return true
}

/**
 * 把 GameEvent 包装成 BoundaryEvent
 * @param event GameEvent（必须为 ending 类型）
 * @param priority 优先级（数字越小越先匹配）
 * @param idSuffix 可选后缀，避免与已有 boundary id 冲突
 */
export function wrapAsBoundaryEvent(
  event: GameEvent,
  priority: number,
  idSuffix?: string
): BoundaryEvent {
  const eventId = event.id
  const check = compileConditions(event.conditions)
  return {
    id: idSuffix ? `${eventId}__${idSuffix}` : eventId,
    priority,
    type: 'ending',
    check,
    event
  }
}

// 兜底参数：narrative 结局至少满足以下全部条件才可触发
//  1. 崇祯八年（1635）后（开局至少 7 年，让"名臣/殉国/归隐"等叙事性结局有时间沉淀）
//  2. 游戏 turn ≥ 36（开局 3 年后，宦海须有"沉浮"才有结局）
// 导出给 boundaryEvents.ts 里手写的 check 复用 —— 同一个"结局要有时间沉淀"的原则，
// 不许一份数据里两套标准（第十八轮实测：手写党派结局没有任何时间下限，
// 于是《东林烈士》在开局第 13 个月就把一局打死，而它的文本写的是 1644 年甲申之变）。
export const NARRATIVE_MIN_YEAR = 1635
export const NARRATIVE_MIN_TURN = 36

/**
 * 批量把结局事件包装成 BoundaryEvent
 * 自动分配 priority（从 100 开始递增）
 *
 * 强制兜底（避免"开局秒结束"）：
 *  1. 没有 conditions 或没 year 限制 → 强制 year >= 1635
 *  2. 有 conditions 且 year.min < 1635 → 提升到 1635
 *  3. max 年份保留（避免错过"甲申之变"类有历史窗口的结局）
 *  4. turn 兜底 ≥ 36（玩家须"宦海沉浮"满 3 年才能触发叙事性结局）
 *  5. user 自带的 gameState 条件与 turn 兜底合并（不覆盖 user 设置）
 */
export function wrapBatchAsBoundaryEvents(
  events: GameEvent[],
  startPriority = 100
): BoundaryEvent[] {
  return events.map((e, i) => {
    const conds = e.conditions || {}

    let minYear = NARRATIVE_MIN_YEAR
    let maxYear: number | undefined

    if (conds.year) {
      if (typeof conds.year.min === 'number') {
        minYear = Math.max(NARRATIVE_MIN_YEAR, conds.year.min)
      }
      if (typeof conds.year.max === 'number') {
        maxYear = conds.year.max
      }
    }

    // turn 兜底：叙事结局至少要玩满 NARRATIVE_MIN_TURN 个月；
    // 作者自己写了更高的 cond.turn 就取更大的那个。
    // 注意这里**不再**把 turn 塞进 gameState —— 以前那样写只有本文件认，
    // utils/eventConditions.ts 见到 gameState.turn 是直接 continue 跳过的。
    const userGameState = (conds.gameState || {}) as Record<string, { min?: number; max?: number } | undefined>
    const turnMin = Math.max(NARRATIVE_MIN_TURN, conds.turn?.min ?? 0)

    const safeConditions: EventConditions = {
      ...conds,
      year: {
        min: minYear,
        ...(maxYear !== undefined ? { max: maxYear } : {})
      },
      turn: { min: turnMin },
      gameState: { ...userGameState }
    }

    const wrappedEvent: GameEvent = { ...e, conditions: safeConditions }
    return wrapAsBoundaryEvent(wrappedEvent, startPriority + i)
  })
}
