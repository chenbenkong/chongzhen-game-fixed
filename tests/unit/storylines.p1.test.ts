import { describe, expect, it } from 'vitest'
import {
  MAINLINE_KEYS,
  MAINLINE_COUNT,
  SUPPORTLINE_COUNT,
  SUPPORTLINE_KEYS,
  STORYLINES,
  isMainline
} from '../../src/data/storylines'
import { initialEvents } from '../../src/data/events/index'
import { allEndingEvents } from '../../src/data/events/ending/index'

/**
 * P1 的第一条边界：16 条注册线必须真的收成 8 主 + 8 辅。
 *
 * 这里不测“每拍写得好不好”，只测结构：
 * - 8/8 数量；
 * - 主线 tier 不会被误标成辅线；
 * - 每条主线至少有 3 个事件（三拍的底量，不是三拍本身）；
 * - 每条主线至少有 1 个专属结局。
 *
 * 最后一条是本轮最容易回退的地方：结局的 `storyline` 长期一律写 `ordinary`，
 * 结果主线在结局页和图鉴里都不认领自己的收束。以后再有人把结局改回
 * `ordinary`，这条测试会直接失败。
 */
describe('P1 剧情线分层', () => {
  it('注册表正好 8 主 + 8 辅，不多不少', () => {
    expect(MAINLINE_COUNT).toBe(8)
    expect(SUPPORTLINE_COUNT).toBe(8)
    expect(MAINLINE_KEYS.length + SUPPORTLINE_KEYS.length).toBe(Object.keys(STORYLINES).length)
    expect(new Set([...MAINLINE_KEYS, ...SUPPORTLINE_KEYS]).size).toBe(16)
  })

  it('每条线的 tier 与名单一致', () => {
    for (const key of MAINLINE_KEYS) {
      expect(STORYLINES[key]?.tier).toBe('main')
      expect(isMainline(key)).toBe(true)
    }
    for (const key of SUPPORTLINE_KEYS) {
      expect(STORYLINES[key]?.tier).toBe('support')
      expect(isMainline(key)).toBe(false)
    }
  })

  it('每条主线至少 3 个事件，作为三拍的底量', () => {
    for (const key of MAINLINE_KEYS) {
      const events = initialEvents.filter((e) => e.storyline === key)
      expect(events.length, `${key} 的事件数不足 3`).toBeGreaterThanOrEqual(3)
    }
  })

  it('每条主线至少认领 1 个专属结局', () => {
    for (const key of MAINLINE_KEYS) {
      const endings = allEndingEvents.filter((e) => e.storyline === key)
      expect(endings.length, `${key} 没有 storyline 指向自己的结局`).toBeGreaterThanOrEqual(1)
    }
  })
})
