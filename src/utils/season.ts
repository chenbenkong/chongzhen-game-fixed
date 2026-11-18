/**
 * 月份到季节的唯一映射。
 *
 * 牌桌背景、事件 prompt 和验收脚本都使用同一口径，避免出现
 * 「界面已入冬、prompt 还写深秋」这种不一致。月份为 1–12。
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export const SEASON_LABELS: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬'
}

export function getSeason(month: number): Season {
  if ([3, 4, 5].includes(month)) return 'spring'
  if ([6, 7, 8].includes(month)) return 'summer'
  if ([9, 10, 11].includes(month)) return 'autumn'
  return 'winter'
}
