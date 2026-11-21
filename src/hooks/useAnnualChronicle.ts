import { useCallback, useEffect, useRef, useState } from 'react'
import type { Character, GameStateValues, LifeRecord } from '../types/game'
import type { CareerGoalStatus } from '../data/careerGoals'
import { getAnnualChronicle } from '../data/annualChronicle'
import { getStoryline } from '../data/storylines'

export interface AnnualChronicleSnapshot {
  /** 刚刚走完的那一年（不是新年份） */
  year: number
  rank: string
  meritScore: number
  records: LifeRecord[]
  career: CareerGoalStatus | null
  storylineName: string
  headline: string
  detail: string
}

interface UseAnnualChronicleArgs {
  gameState: GameStateValues
  character: Character
  lifeRecords: LifeRecord[]
  career: CareerGoalStatus | null
  meritScore: number
  currentStorylineKey: string | undefined
}

/**
 * 只在「年份变大」的那一帧生成一次年度史载。
 *
 * 用 ref 记录上一帧年份，而不是把「已读年份」写进存档：
 *   · 读档停在正月时不会重弹上一年的总结（初始 ref 就是当前年份）；
 *   · 悔棋退回腊月、再进正月时会重新弹一次，符合「重新跨年」的语义；
 *   · 不新增存档字段，旧档不需要迁移。
 */
export function useAnnualChronicle({
  gameState,
  character,
  lifeRecords,
  career,
  meritScore,
  currentStorylineKey
}: UseAnnualChronicleArgs) {
  const [chronicle, setChronicle] = useState<AnnualChronicleSnapshot | null>(null)
  const previousYearRef = useRef(gameState.currentYear)

  useEffect(() => {
    const previousYear = previousYearRef.current
    const currentYear = gameState.currentYear
    previousYearRef.current = currentYear

    if (currentYear <= previousYear || gameState.currentMonth !== 1) return

    const entry = getAnnualChronicle(previousYear)
    const records = lifeRecords.filter((record) => record.year === previousYear)
    const storyline = getStoryline(currentStorylineKey ?? '')

    setChronicle({
      year: previousYear,
      rank: character.rank || '待选',
      meritScore,
      records,
      career,
      storylineName: storyline?.name ?? '未启程',
      headline: entry?.headline ?? '本年朝局，史馆失载',
      detail: entry?.detail ?? '案卷散佚，只余这一页空白。'
    })
  }, [
    gameState.currentYear,
    gameState.currentMonth,
    lifeRecords,
    character.rank,
    career,
    meritScore,
    currentStorylineKey
  ])

  const dismiss = useCallback(() => setChronicle(null), [])

  return { chronicle, dismiss }
}
