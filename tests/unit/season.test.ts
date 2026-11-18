import { describe, expect, it } from 'vitest'
import { getSeason, SEASON_LABELS } from '../../src/utils/season'

describe('月份季节映射', () => {
  it('按 3–5 春、6–8 夏、9–11 秋、12–2 冬切分', () => {
    const cases: Array<[number, string]> = [
      [1, 'winter'],
      [2, 'winter'],
      [3, 'spring'],
      [4, 'spring'],
      [5, 'spring'],
      [6, 'summer'],
      [7, 'summer'],
      [8, 'summer'],
      [9, 'autumn'],
      [10, 'autumn'],
      [11, 'autumn'],
      [12, 'winter']
    ]
    for (const [month, season] of cases) {
      expect(getSeason(month)).toBe(season)
    }
  })

  it('季节中文标签与背景类名使用同一套 id', () => {
    expect(SEASON_LABELS).toEqual({
      spring: '春',
      summer: '夏',
      autumn: '秋',
      winter: '冬'
    })
  })
})
