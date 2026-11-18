import type { CareerGoalId, Character, GameStateValues } from '../types/game'

/**
 * P0.2 志业：给每一局一个长期目标，不新增属性、货币、好感度或新资源。
 *
 * 三个里程碑全部用已有状态判定：
 * - 升迁：character.promotionCount（整数）
 * - 清名：gameState.清议（当前值，整数）
 * - 家族：已有家庭旗
 * - 活命：gameState.turn（已活月数，整数）
 *
 * 里程碑不写成永久成就，也不发额外奖励；它只改变“这一局怎么评价”，
 * 避免把志业做成第二套成就系统。
 */

export type CareerGoalGrade = '遂志' | '近志' | '半途' | '未遂'

export interface CareerMilestone {
  label: string
  hint: string
  test: (character: Character, gameState: GameStateValues) => boolean
}

export interface CareerGoal {
  id: CareerGoalId
  name: string
  subtitle: string
  description: string
  milestones: [CareerMilestone, CareerMilestone, CareerMilestone]
}

export interface CareerMilestoneState extends CareerMilestone {
  done: boolean
}

export interface CareerGoalStatus {
  goal: CareerGoal
  milestones: CareerMilestoneState[]
  completed: number
  total: 3
  grade: CareerGoalGrade
  line: string
  shareLine: string
}

const hasFlag = (character: Character, flag: string) => character.flags.includes(flag)

export const CAREER_GOALS: CareerGoal[] = [
  {
    id: 'promotion',
    name: '升迁',
    subtitle: '向上爬',
    description: '你要的是更高的椅子。每迁一次，都得拿别的东西换。',
    milestones: [
      { label: '一迁', hint: '升迁 1 次', test: (character) => (character.promotionCount ?? 0) >= 1 },
      { label: '三迁', hint: '升迁 3 次', test: (character) => (character.promotionCount ?? 0) >= 3 },
      { label: '五迁', hint: '升迁 5 次', test: (character) => (character.promotionCount ?? 0) >= 5 }
    ]
  },
  {
    id: 'reputation',
    name: '清名',
    subtitle: '留个名字',
    description: '你要的是清议。名声能护身，也能招刀。',
    milestones: [
      { label: '清誉', hint: '清议 ≥ 50', test: (_character, gameState) => Math.round(gameState.清议) >= 50 },
      { label: '清流', hint: '清议 ≥ 65', test: (_character, gameState) => Math.round(gameState.清议) >= 65 },
      { label: '东林', hint: '清议 ≥ 80', test: (_character, gameState) => Math.round(gameState.清议) >= 80 }
    ]
  },
  {
    id: 'family',
    name: '家族',
    subtitle: '把家接住',
    description: '你要的不是自己一个人善终。你倒下之后，家里得有人接得住。',
    milestones: [
      {
        label: '成家',
        hint: '有妻室',
        test: (character) => character.wives.length > 0 || hasFlag(character, 'wife_respected')
      },
      {
        label: '齐家',
        hint: '家宅和睦且有子嗣',
        test: (character) =>
          hasFlag(character, 'harmonious_family') &&
          (hasFlag(character, 'has_children') || hasFlag(character, 'legitimate_heir'))
      },
      {
        label: '传家',
        hint: '修族谱或设义田',
        test: (character) => hasFlag(character, '修族谱') || hasFlag(character, '义田')
      }
    ]
  },
  {
    id: 'survival',
    name: '活命',
    subtitle: '活到下一春',
    description: '你要的是活着。乱世里，活得久本身就是一种本事。',
    milestones: [
      { label: '五载', hint: '活过 60 个月', test: (_character, gameState) => gameState.turn >= 60 },
      { label: '十载', hint: '活过 120 个月', test: (_character, gameState) => gameState.turn >= 120 },
      { label: '十五载', hint: '活过 180 个月', test: (_character, gameState) => gameState.turn >= 180 }
    ]
  }
]

export function getCareerGoal(id: CareerGoalId | null | undefined): CareerGoal | null {
  if (!id) return null
  return CAREER_GOALS.find((goal) => goal.id === id) ?? null
}

export function careerMilestoneStates(
  goalId: CareerGoalId | null | undefined,
  character: Character,
  gameState: GameStateValues
): CareerMilestoneState[] {
  const goal = getCareerGoal(goalId)
  if (!goal) return []
  return goal.milestones.map((milestone) => ({
    ...milestone,
    done: milestone.test(character, gameState)
  }))
}

export function careerGoalStatus(
  goalId: CareerGoalId | null | undefined,
  character: Character,
  gameState: GameStateValues
): CareerGoalStatus | null {
  const goal = getCareerGoal(goalId)
  if (!goal) return null
  const milestones = careerMilestoneStates(goalId, character, gameState)
  const completed = milestones.filter((milestone) => milestone.done).length
  const grade: CareerGoalGrade =
    completed === 3 ? '遂志' : completed === 2 ? '近志' : completed === 1 ? '半途' : '未遂'
  return {
    goal,
    milestones,
    completed,
    total: 3,
    grade,
    line: `志业 · ${goal.name} · ${grade}（${completed}/3）`,
    shareLine: `志业　${goal.name} · ${grade}（${completed}/3）`
  }
}
