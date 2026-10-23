import { EventChoice, GameEvent } from '../types/event'
import { Attributes, Character, GameStateValues } from '../types/game'
import { gateLabel } from '../data/flagBiography'
import { ATTR_DISPLAY_MAP, STATE_DISPLAY_MAP } from './constants'

export interface ChoiceCheckResult {
  available: boolean
  reason?: string
  staminaInfo?: { cost: number; current: number; after: number }
  difficulty?: number
  gap?: number
  conditionType?: 'attribute' | 'hidden' | 'gameState' | 'flag' | 'stamina' | 'origin' | 'rank'
  conditionKey?: string
  penaltyEffect?: {
    attributes?: Partial<Attributes>
    gameState?: Partial<GameStateValues>
    hidden?: { 道德值?: number; 欲望值?: number; 野心值?: number }
  }
}

const ORIGIN_NAMES: Record<string, string> = {
  '寒门': '寒门', '缙绅': '缙绅', '没落世家': '没落世家', '诗文清望': '诗文清望'
}

/**
 * 玩家能不能点这个选项 —— 唯一的判据。
 *
 * 放在 utils 而不是组件里，是因为**引擎也用它**：`useGameEngine` 挑事件时要先确认
 * 「这条事件抛出后玩家至少有一个能点的选项」（见 `hasOpenChoice`）。
 * 此前它住在 `EventDisplay.tsx`，引擎要么不判、要么自己再写一遍，两种都不可信。
 *
 * 导出它还是同一个理由：任何离线工具都必须用同一把尺子 ——
 * 自动跑局模拟（`tests/unit/helpers/simulate.ts`）按玩家真实的可选集合来选，
 * 自己再写一遍就等于给模拟开了一个玩家没有的后门，模拟结论也就不可信。
 *
 * 「勉力一试」投骰只对**可以用努力换掉的门**开放（属性/状态/隐藏/体质）；
 * 出身和经历（flag）不是努力能换的东西，所以这两类返回 `difficulty: undefined`，
 * 组件里的 `canAttemptDice` 据此不给骰子入口。出身那一支以前写的是 `difficulty: 0`，
 * 而骰子是 `d12 >= difficulty` —— 0 意味着**永远投中**，等于这道门形同虚设。
 */
export function checkChoiceRequirement(
  choice: EventChoice,
  character: Character,
  gameState: GameStateValues
): ChoiceCheckResult {
  const cond = choice.showConditions

  const currentStamina = character.attributes.体质
  const staminaCost = choice.staminaCost || 0
  const staminaRequired = choice.staminaRequired || 0
  const staminaAfter = currentStamina - staminaCost

  if (staminaRequired > 0 && currentStamina < staminaRequired) {
    const gap = staminaRequired - currentStamina
    return {
      available: false,
      reason: `体质不足（需≥${staminaRequired}，当前${currentStamina}）`,
      staminaInfo: { cost: staminaCost, current: currentStamina, after: staminaAfter },
      difficulty: Math.min(6, Math.ceil(gap / 15) + 2),
      gap,
      conditionType: 'stamina',
      conditionKey: '体质',
      penaltyEffect: { attributes: { 体质: -5 } }
    }
  }

  if (cond?.attributes) {
    for (const [key, range] of Object.entries(cond.attributes)) {
      const displayKey = ATTR_DISPLAY_MAP[key] || key
      const attrValue = character.attributes[key as keyof Attributes] ?? 50

      if (range.max !== undefined && attrValue > range.max) {
        const gap = attrValue - range.max
        return {
          available: false,
          reason: `${displayKey}过高（需≤${range.max}，当前${Math.floor(attrValue)}）`,
          difficulty: Math.min(6, Math.ceil(gap / 15) + 2),
          gap,
          conditionType: 'attribute' as const,
          conditionKey: displayKey,
          penaltyEffect: { attributes: { [key as keyof Attributes]: -5 } as Partial<Attributes> }
        }
      }

      if (range.min !== undefined && attrValue < range.min) {
        const gap = range.min - attrValue
        return {
          available: false,
          reason: `${displayKey}不足（需≥${range.min}，当前${Math.floor(attrValue)}）`,
          difficulty: Math.min(6, Math.ceil(gap / 15) + 2),
          gap,
          conditionType: 'attribute' as const,
          conditionKey: displayKey,
          penaltyEffect: { attributes: { [key as keyof Attributes]: -5 } as Partial<Attributes> }
        }
      }
    }
  }

  if (cond?.gameState) {
    for (const [key, range] of Object.entries(cond.gameState)) {
      const displayKey = STATE_DISPLAY_MAP[key] || key
      const stateValue = gameState[key as keyof GameStateValues] ?? 50

      if (range.max !== undefined && stateValue > range.max) {
        const gap = stateValue - range.max
        return {
          available: false,
          reason: `${displayKey}过高（需≤${range.max}，当前${stateValue}）`,
          difficulty: Math.min(6, Math.ceil(gap / 10) + 2),
          gap,
          conditionType: 'gameState' as const,
          conditionKey: displayKey,
          penaltyEffect: { gameState: { [key as keyof GameStateValues]: -5 } as Partial<GameStateValues> }
        }
      }

      if (range.min !== undefined && stateValue < range.min) {
        const gap = range.min - stateValue
        return {
          available: false,
          reason: `${displayKey}不足（需≥${range.min}，当前${stateValue}）`,
          difficulty: Math.min(6, Math.ceil(gap / 10) + 2),
          gap,
          conditionType: 'gameState' as const,
          conditionKey: displayKey,
          penaltyEffect: { gameState: { [key as keyof GameStateValues]: -5 } as Partial<GameStateValues> }
        }
      }
    }
  }

  if (cond?.hidden) {
    for (const [key, range] of Object.entries(cond.hidden)) {
      const hiddenValue = character.hidden?.[key as keyof typeof character.hidden] ?? 50

      if (range.max !== undefined && hiddenValue > range.max) {
        const gap = hiddenValue - range.max
        return {
          available: false,
          reason: `${key}过高（需≤${range.max}）`,
          difficulty: Math.min(6, Math.ceil(gap / 10) + 2),
          gap,
          conditionType: 'hidden' as const,
          conditionKey: key,
          penaltyEffect: { hidden: { [key]: -5 } }
        }
      }

      if (range.min !== undefined && hiddenValue < range.min) {
        const gap = range.min - hiddenValue
        return {
          available: false,
          reason: `${key}不足（需≥${range.min}）`,
          difficulty: Math.min(6, Math.ceil(gap / 10) + 2),
          gap,
          conditionType: 'hidden' as const,
          conditionKey: key,
          penaltyEffect: { hidden: { [key]: -5 } }
        }
      }
    }
  }

  if (cond?.flags) {
    const own = character.flags ?? []
    const f = cond.flags
    // 六种子句与事件级 `checkEventConditions` 一一对应，语义保持一致：
    // has/all = 全部要有，any/some = 至少一个，notHas/none = 一个都不能有。
    const missingAll = [...(f.has ?? []), ...(f.all ?? [])].filter(x => !own.includes(x))
    if (missingAll.length) {
      return lockedByFlag(`须有这段经历：${sayFlags(missingAll)}`, missingAll[0])
    }
    const anyList = f.any ?? f.some
    if (anyList && anyList.length && !anyList.some(x => own.includes(x))) {
      return lockedByFlag(`须有过其中一段经历：${sayFlags(anyList)}`, anyList[0])
    }
    const forbidden = [...(f.notHas ?? []), ...(f.none ?? [])].filter(x => own.includes(x))
    if (forbidden.length) {
      return lockedByFlag(`与你的另一段经历相冲：${sayFlags(forbidden)}`, forbidden[0])
    }
    // since：这段经历得满多久才算数。与事件级同义、同一条容错（无落笔记录则放行）。
    for (const [flag, range] of Object.entries(f.since ?? {})) {
      if (!own.includes(flag)) {
        return lockedByFlag(`须有这段经历：${sayFlags([flag])}`, flag)
      }
      const at = character.flagTurns?.[flag]
      if (at === undefined) continue
      const elapsed = gameState.turn - at
      if (range.min !== undefined && elapsed < range.min) {
        return lockedByFlag(agoTooYoung(flag, range.min - elapsed), flag)
      }
      if (range.max !== undefined && elapsed > range.max) {
        return lockedByFlag('这段旧事隔得太久，这一回赶不上了', flag)
      }
    }
  }

  // 出身条件检查
  if (cond?.origin) {
    const allowed = Array.isArray(cond.origin) ? cond.origin : [cond.origin]
    if (!allowed.includes(character.origin)) {
      const names = allowed.map(o => ORIGIN_NAMES[o] || o).join('、')
      return {
        available: false,
        reason: `需要出身：${names}`,
        // 出身改不了，所以不给骰子。这里以前写 difficulty: 0，
        // 而 d12 ≥ 0 恒成立 —— 「勉力一试」百分之百成功，这道出身门是画出来的。
        gap: 0,
        conditionType: 'origin' as const,
        conditionKey: '出身',
        penaltyEffect: undefined
      }
    }
  }

  // 官阶条件检查（与事件级 `checkEventConditions` 同一口径，第十五轮补）
  // 此前选项上的 `showConditions.rank` 从来没人读，写了等于没写。
  // 和出身同理：官阶不是这一下能"努力"换来的，所以不给 difficulty，
  // 于是组件里的 canAttemptDice 不会为它开投骰入口。
  if (cond?.rank) {
    const allowed = Array.isArray(cond.rank) ? cond.rank : [cond.rank]
    if (!allowed.includes(character.rank)) {
      return {
        available: false,
        reason: `须任此官阶：${allowed.join('、')}`,
        gap: 0,
        conditionType: 'rank' as const,
        conditionKey: '官阶',
        penaltyEffect: undefined
      }
    }
  }

  return { available: true, staminaInfo: { cost: staminaCost, current: currentStamina, after: staminaAfter } }
}

/**
 * 经历（flag）类门槛的统一返回值：不给 `difficulty`，
 * 于是组件里的 `canAttemptDice` 不会为它开出投骰入口。
 */
function lockedByFlag(reason: string, conditionKey: string): ChoiceCheckResult {
  return { available: false, reason, gap: 0, conditionType: 'flag' as const, conditionKey }
}

/**
 * 把"缺哪段经历"翻成玩家读得懂的一句。
 *
 * 第十五轮刚把选项级经历门实装时，这里直接 `join('、')` 了 flag 名，
 * 浏览器实测逮到屏幕上印出「wife_hurt、wife_jealous、pingqi_attempt」——
 * 门槛是真门槛，文案却是调试输出。现在查 `FLAG_GATE_LABELS`，
 * 查不到的机器 id 一个都不印出来，改说"前头有一段没走到的旧事"这种泛指。
 */
function sayFlags(flags: string[]): string {
  const named = flags.map(gateLabel).filter((s): s is string => !!s)
  return named.length ? named.join('、') : '前头有一段没走到的旧事'
}

/**
 * `since` 门锁住时的那一句。
 *
 * 月数要说成人话：玩家看得懂"还得再等 2 年 3 个月"，看不得懂"turn 差 27"。
 * 经历名查得出就带上主语，查不出就只说等多久 —— 与 `sayFlags` 同一条规矩：
 * 机器 id 一个都不许印到屏幕上。
 */
function agoTooYoung(flag: string, months: number): string {
  const named = gateLabel(flag)
  const years = Math.floor(months / 12)
  const rest = months % 12
  const wait = years ? `${years} 年${rest ? ` ${rest} 个月` : ''}` : `${months} 个月`
  return named ? `${named}之后，还得再等 ${wait}` : `这段旧事还得再等 ${wait}`
}

/**
 * 这条事件现在**能不能**抛给玩家：至少有一个选项点得动。
 *
 * 没有它，"所有选项都锁着"的事件会真的抛出来 —— 玩家面对一屏不能点的选项，
 * 而底部「进 下 月」在选中之前一直是禁用的，等于卡死。
 * 第十五轮把选项级 flag 门槛接上之后，这个筛子从"锦上添花"变成了必需：
 * `*_aftermath` 那一族分支事件的每个选项都要求上一事件对应分支写下的 flag。
 */
export function hasOpenChoice(
  event: GameEvent,
  character: Character,
  gameState: GameStateValues
): boolean {
  const choices = event.choices ?? []
  if (choices.length === 0) return false
  return choices.some(c => checkChoiceRequirement(c, character, gameState).available)
}
