import { describe, expect, it } from 'vitest'
import { THRESHOLD_ENDING_BY_KEY } from '../../src/data/boundaryEvents'
import { resolveEndingTileId } from '../../src/data/endingRegistry'
import { deathCauseOf } from '../../src/utils/deathCause'

describe('结局屏直接死因', () => {
  it('八条归零死线都能命中死因卡', () => {
    for (const endingId of Object.values(THRESHOLD_ENDING_BY_KEY)) {
      const tileId = resolveEndingTileId(endingId)
      expect(tileId, `阈值结局 ${endingId} 没有图鉴格子`).not.toBeNull()
      expect(deathCauseOf(tileId), `阈值结局 ${endingId} 缺少死因文案`).not.toBeNull()
    }
  })

  it('非归零结局不硬编死因', () => {
    expect(deathCauseOf('ending_zTE_liu_fang')).toBeNull()
    expect(deathCauseOf(null)).toBeNull()
  })
})
