/**
 * 传承 / 家训：结局之后留下的不是下一局的数值碾压，而是三样东西。
 *
 *  门生 —— 你带出来的人，下一局开局就有一张旧关系网；
 *  著作 —— 你写过的东西，下一局文名略高；
 *  家训 —— 你立下的规矩，下一局操守略高。
 *
 * 三条都只给一次性小加成（+3），不叠加、不滚雪球；每局最多带一条。
 * 数据单独存在 localStorage，不进角色存档，所以旧存档 schema 完全不动。
 */

import type { Character, GameStateValues } from '../types/game'

export type LegacyPerkId = 'mentor' | 'author' | 'precept'
export type LegacyCategory = '门生' | '著作' | '家训'

export interface LegacyPerk {
  id: LegacyPerkId
  name: string
  category: LegacyCategory
  cost: number
  flag: string
  /** 开局一次性小加成。只写整数，避免又出现 2.5 点圣眷那种事。 */
  effect: {
    attributes?: Partial<Record<keyof Character['attributes'], number>>
    hidden?: Partial<Record<keyof Character['hidden'], number>>
  }
  /** 下一局的小目标：只在结局页判一次，不弹窗、不打断。 */
  goal: LegacyGoalId
  description: string
}

export type LegacyGoalId = 'three_promotions' | 'literary_fame' | 'reach_1644'

export interface LegacyGoal {
  id: LegacyGoalId
  label: string
  hint: string
}

export const LEGACY_GOALS: Record<LegacyGoalId, LegacyGoal> = {
  three_promotions: { id: 'three_promotions', label: '三迁', hint: '本局至少升迁三次' },
  literary_fame: { id: 'literary_fame', label: '文名', hint: '本局文韬达到 80' },
  reach_1644: { id: 'reach_1644', label: '活到甲申', hint: '本局活到 1644 年' }
}

export const LEGACY_PERKS: LegacyPerk[] = [
  {
    id: 'mentor',
    name: '故吏满门',
    category: '门生',
    cost: 12,
    flag: '门生故吏',
    effect: { hidden: { 忠诚值: 3 } },
    goal: 'three_promotions',
    description: '开局带着一张旧门生网；忠诚 +3。目标：三迁。'
  },
  {
    id: 'author',
    name: '著述传世',
    category: '著作',
    cost: 12,
    flag: '著书立说',
    effect: { attributes: { 文韬: 3 } },
    goal: 'literary_fame',
    description: '开局已有文名；文韬 +3。目标：文韬到 80。'
  },
  {
    id: 'precept',
    name: '清白传家',
    category: '家训',
    cost: 12,
    flag: '家训在身',
    effect: { hidden: { 道德值: 3 } },
    goal: 'reach_1644',
    description: '开局带着一条家训；道德 +3。目标：活到 1644。'
  }
]

export interface LegacyGain {
  门生: number
  著作: number
  家训: number
}

export interface LegacyState {
  version: 1
  points: LegacyGain
  unlocked: LegacyPerkId[]
  recordedRuns: string[]
  lastGain: LegacyGain
  totalRuns: number
}

const STORAGE_KEY = 'chongzhen-legacy-v1'
const MAX_RECORDED_RUNS = 30

export function emptyLegacyState(): LegacyState {
  return {
    version: 1,
    points: { 门生: 0, 著作: 0, 家训: 0 },
    unlocked: [],
    recordedRuns: [],
    lastGain: { 门生: 0, 著作: 0, 家训: 0 },
    totalRuns: 0
  }
}

function isPerkId(value: unknown): value is LegacyPerkId {
  return value === 'mentor' || value === 'author' || value === 'precept'
}

export function loadLegacyState(): LegacyState {
  if (typeof localStorage === 'undefined') return emptyLegacyState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyLegacyState()
    const parsed = JSON.parse(raw) as Partial<LegacyState> | null
    if (!parsed || parsed.version !== 1) return emptyLegacyState()
    const points: Partial<LegacyGain> = parsed.points ?? {}
    const lastGain: Partial<LegacyGain> = parsed.lastGain ?? {}
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)
    return {
      version: 1,
      points: {
        门生: num(points.门生),
        著作: num(points.著作),
        家训: num(points.家训)
      },
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter(isPerkId) : [],
      recordedRuns: Array.isArray(parsed.recordedRuns)
        ? parsed.recordedRuns.filter((run): run is string => typeof run === 'string').slice(-MAX_RECORDED_RUNS)
        : [],
      lastGain: {
        门生: num(lastGain.门生),
        著作: num(lastGain.著作),
        家训: num(lastGain.家训)
      },
      totalRuns: num(parsed.totalRuns)
    }
  } catch {
    return emptyLegacyState()
  }
}

export function saveLegacyState(state: LegacyState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储满 / 隐私模式：传承是加分项，不能拖垮结局页。
  }
}

/** 一局结算给多少点。全部整数，不按小数累计。 */
export function computeLegacyGain(input: {
  score: number
  character: Character
  gameState: GameStateValues
}): LegacyGain {
  const { score, character, gameState } = input
  const flags = character.flags ?? []
  const has = (flag: string) => flags.includes(flag)

  let 门生 = 7
  if (gameState.士绅 >= 60) 门生 += 2
  if (gameState.民望 >= 60) 门生 += 2
  if (has('门生故吏') || has('门生网络')) 门生 += 2

  let 著作 = 7
  if (character.attributes.文韬 >= 70) 著作 += 2
  if (gameState.清议 >= 60) 著作 += 2
  if (has('著书立说')) 著作 += 2

  let 家训 = 7
  if (character.hidden.道德值 >= 70) 家训 += 2
  if (has('harmonious_family') || has('wife_respected') || has('has_children')) 家训 += 2
  if (score >= 70) 家训 += 1

  return {
    门生: Math.min(14, 门生),
    著作: Math.min(14, 著作),
    家训: Math.min(14, 家训)
  }
}

export function legacyRunKey(input: {
  endingId: string
  name: string
  date: string
  score: number
}): string {
  return `${input.endingId}|${input.name}|${input.date}|${Math.round(input.score)}`
}

export function recordLegacyRun(input: {
  runKey: string
  gain: LegacyGain
}): { state: LegacyState; gained: LegacyGain; duplicate: boolean } {
  const state = loadLegacyState()
  if (state.recordedRuns.includes(input.runKey)) {
    return { state, gained: state.lastGain, duplicate: true }
  }
  const gained = {
    门生: Math.max(0, Math.round(input.gain.门生)),
    著作: Math.max(0, Math.round(input.gain.著作)),
    家训: Math.max(0, Math.round(input.gain.家训))
  }
  const next: LegacyState = {
    ...state,
    points: {
      门生: state.points.门生 + gained.门生,
      著作: state.points.著作 + gained.著作,
      家训: state.points.家训 + gained.家训
    },
    recordedRuns: [...state.recordedRuns, input.runKey].slice(-MAX_RECORDED_RUNS),
    lastGain: gained,
    totalRuns: state.totalRuns + 1
  }
  saveLegacyState(next)
  return { state: next, gained, duplicate: false }
}

export function canUnlockPerk(state: LegacyState, perkId: LegacyPerkId): boolean {
  const perk = LEGACY_PERKS.find((p) => p.id === perkId)
  if (!perk || state.unlocked.includes(perkId)) return false
  return state.points[perk.category] >= perk.cost
}

export function unlockPerk(state: LegacyState, perkId: LegacyPerkId): LegacyState {
  if (!canUnlockPerk(state, perkId)) return state
  const perk = LEGACY_PERKS.find((p) => p.id === perkId)!
  const next: LegacyState = {
    ...state,
    points: {
      ...state.points,
      [perk.category]: state.points[perk.category] - perk.cost
    },
    unlocked: [...state.unlocked, perkId]
  }
  saveLegacyState(next)
  return next
}

/** 把传承加成落到开局角色上。只加整数，且夹在 0–100。 */
export function applyLegacyPerk(character: Character, perkId: LegacyPerkId | null | undefined): Character {
  if (!perkId) return character
  const perk = LEGACY_PERKS.find((p) => p.id === perkId)
  if (!perk) return character
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

  if (perk.effect.attributes) {
    for (const [key, value] of Object.entries(perk.effect.attributes)) {
      const attrKey = key as keyof Character['attributes']
      character.attributes[attrKey] = clamp(character.attributes[attrKey] + (value ?? 0))
    }
  }
  if (perk.effect.hidden) {
    for (const [key, value] of Object.entries(perk.effect.hidden)) {
      const hiddenKey = key as keyof Character['hidden']
      character.hidden[hiddenKey] = clamp(character.hidden[hiddenKey] + (value ?? 0))
    }
  }
  if (!character.flags.includes(perk.flag)) {
    character.flags.push(perk.flag)
  }
  character.flagTurns = {
    ...(character.flagTurns ?? {}),
    [perk.flag]: character.flagTurns?.[perk.flag] ?? 0
  }
  return character
}

export function legacyGoalStatus(
  goalId: LegacyGoalId | undefined,
  character: Character,
  gameState: GameStateValues
): { goal: LegacyGoal; achieved: boolean } | null {
  if (!goalId) return null
  const goal = LEGACY_GOALS[goalId]
  if (!goal) return null
  if (goalId === 'three_promotions') {
    return { goal, achieved: character.promotionCount >= 3 }
  }
  if (goalId === 'literary_fame') {
    return { goal, achieved: character.attributes.文韬 >= 80 }
  }
  return { goal, achieved: gameState.currentYear >= 1644 }
}
