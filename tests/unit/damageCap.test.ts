import { describe, expect, it } from 'vitest'
import { DAMAGE_CAP_FLOOR, DAMAGE_CAP_RATIO, capDamage } from '../../src/utils/damageCap'

describe('单次结算负向伤害上限', () => {
  it('参数口径：当前值 50%、绝对下限 10', () => {
    expect(DAMAGE_CAP_RATIO).toBe(0.5)
    expect(DAMAGE_CAP_FLOOR).toBe(10)
  })

  it('当前 50，一次 -100 只能掉到 25，不能直接打穿', () => {
    expect(capDamage(50, -100)).toBe(-25)
  })

  it('当前 100，一次 -100 最多掉 50，剩 50', () => {
    expect(capDamage(100, -100)).toBe(-50)
  })

  it('当前 65，一次 -100 最多掉 32（半整数向下取整），不会留下 32.5', () => {
    expect(capDamage(65, -100)).toBe(-32)
  })

  it('当前 20，声明 -5 原样保留', () => {
    expect(capDamage(20, -5)).toBe(-5)
  })

  it('低值维仍可被清零：当前 5，-100 夹到 -10，再由外层 clamp 到 0', () => {
    expect(capDamage(5, -100)).toBe(-10)
  })

  it('正增量不夹', () => {
    expect(capDamage(50, 100)).toBe(100)
    expect(capDamage(0, 3)).toBe(3)
  })

  it('异常当前值不产生 NaN', () => {
    expect(capDamage(Number.NaN, -100)).toBe(-10)
    expect(capDamage(-5, -100)).toBe(-10)
  })
})
