import { describe, expect, it } from 'vitest'
import type { Character, GameStateValues } from '../../src/types/game'
import { CAREER_GOALS, careerGoalStatus, careerMilestoneStates, getCareerGoal } from '../../src/data/careerGoals'

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: '沈青崖',
    courtesyName: '子瞻',
    hometown: '苏州府',
    age: 30,
    origin: '寒门',
    rank: '正七品·知县',
    degree: '进士',
    attributes: { 财帛: 40, 文韬: 40, 理政: 40, 武略: 40, 体质: 50 },
    hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
    flags: [],
    flagTurns: {},
    history: [],
    wives: [],
    lovers: [],
    examHistory: [],
    promotionCount: 0,
    demotionCount: 0,
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 },
    ...overrides
  }
}

function makeState(overrides: Partial<GameStateValues> = {}): GameStateValues {
  return {
    currentYear: 1628,
    currentMonth: 1,
    turn: 0,
    圣眷: 50,
    中官: 50,
    清议: 50,
    士绅: 50,
    民望: 50,
    国势: 75,
    ...overrides
  }
}

describe('P0.2 志业：三个整数里程碑', () => {
  it('升迁按 promotionCount 的 1 / 3 / 5 次判定', () => {
    expect(careerMilestoneStates('promotion', makeCharacter({ promotionCount: 0 }), makeState()).map((m) => m.done))
      .toEqual([false, false, false])
    expect(careerMilestoneStates('promotion', makeCharacter({ promotionCount: 1 }), makeState()).map((m) => m.done))
      .toEqual([true, false, false])
    expect(careerMilestoneStates('promotion', makeCharacter({ promotionCount: 3 }), makeState()).map((m) => m.done))
      .toEqual([true, true, false])
    expect(careerMilestoneStates('promotion', makeCharacter({ promotionCount: 5 }), makeState()).map((m) => m.done))
      .toEqual([true, true, true])
  })

  it('清名按当前清议的 50 / 65 / 80 判定，边界值算达成', () => {
    expect(careerMilestoneStates('reputation', makeCharacter(), makeState({ 清议: 49 })).map((m) => m.done))
      .toEqual([false, false, false])
    expect(careerMilestoneStates('reputation', makeCharacter(), makeState({ 清议: 50 })).map((m) => m.done))
      .toEqual([true, false, false])
    expect(careerMilestoneStates('reputation', makeCharacter(), makeState({ 清议: 65 })).map((m) => m.done))
      .toEqual([true, true, false])
    expect(careerMilestoneStates('reputation', makeCharacter(), makeState({ 清议: 80 })).map((m) => m.done))
      .toEqual([true, true, true])
  })

  it('家族只用已有家庭旗，不新增好感度', () => {
    expect(careerMilestoneStates('family', makeCharacter({ flags: [] }), makeState()).map((m) => m.done))
      .toEqual([false, false, false])

    expect(careerMilestoneStates('family', makeCharacter({ flags: ['wife_respected', 'harmonious_family', 'has_children'] }), makeState()).map((m) => m.done))
      .toEqual([true, true, false])

    expect(careerMilestoneStates('family', makeCharacter({ flags: ['wife_respected', 'harmonious_family', 'has_children', '修族谱'] }), makeState()).map((m) => m.done))
      .toEqual([true, true, true])

    // 修族谱 / 设义田是同一事件里的互斥选项，不能要求同时具备。
    expect(careerMilestoneStates('family', makeCharacter({ flags: ['wife_respected', 'harmonious_family', 'has_children', '义田'] }), makeState()).map((m) => m.done))
      .toEqual([true, true, true])
  })

  it('活命按 turn 的 60 / 120 / 180 个月判定', () => {
    expect(careerMilestoneStates('survival', makeCharacter(), makeState({ turn: 59 })).map((m) => m.done))
      .toEqual([false, false, false])
    expect(careerMilestoneStates('survival', makeCharacter(), makeState({ turn: 60 })).map((m) => m.done))
      .toEqual([true, false, false])
    expect(careerMilestoneStates('survival', makeCharacter(), makeState({ turn: 120 })).map((m) => m.done))
      .toEqual([true, true, false])
    expect(careerMilestoneStates('survival', makeCharacter(), makeState({ turn: 180 })).map((m) => m.done))
      .toEqual([true, true, true])
  })

  it('3/3 为遂志，2/3 为近志，1/3 为半途，0/3 为未遂', () => {
    const c = makeCharacter({ promotionCount: 5 })
    const s = careerGoalStatus('promotion', c, makeState())
    expect(s?.completed).toBe(3)
    expect(s?.grade).toBe('遂志')
    expect(s?.line).toBe('志业 · 升迁 · 遂志（3/3）')
    expect(s?.shareLine).toBe('志业　升迁 · 遂志（3/3）')

    expect(careerGoalStatus('promotion', makeCharacter({ promotionCount: 3 }), makeState())?.grade).toBe('近志')
    expect(careerGoalStatus('promotion', makeCharacter({ promotionCount: 1 }), makeState())?.grade).toBe('半途')
    expect(careerGoalStatus('promotion', makeCharacter({ promotionCount: 0 }), makeState())?.grade).toBe('未遂')
  })

  it('不立志业时返回 null，不伪造 0/3', () => {
    expect(getCareerGoal(null)).toBeNull()
    expect(careerGoalStatus(null, makeCharacter(), makeState())).toBeNull()
    expect(careerGoalStatus(undefined, makeCharacter(), makeState())).toBeNull()
  })

  it('四个志业各有三个里程碑，ID 不重复', () => {
    expect(CAREER_GOALS).toHaveLength(4)
    expect(new Set(CAREER_GOALS.map((goal) => goal.id)).size).toBe(4)
    for (const goal of CAREER_GOALS) {
      expect(goal.milestones).toHaveLength(3)
    }
  })
})
