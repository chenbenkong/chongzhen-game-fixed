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

  it('8 条主线各有至少两个内容拍，加上结局构成三拍', () => {
    const beats: Record<string, string[]> = {
      eastern_forest: ['route_impeach_ministers', 'route_loyal_minister'],
      border_war: ['route_military', 'route_border_volunteer'],
      power: ['transition_1643_ambition', 'transition_1643_crown_offer'],
      nationfall: ['transition_1644_night_before', 'transition_1644_aftermath'],
      female: ['emotion_core_003', 'emotion_core_004'],
      eunuch: ['inner_court_001', 'inner_court_002', 'inner_court_003'],
      hermit: ['route_hermit', 'route_grand_scholar'],
      legend: ['historical_003_aftermath', 'historical_022_aftermath', 'historical_1643_sunchuanting']
    }
    for (const key of MAINLINE_KEYS) {
      const ids = beats[key]
      expect(ids, `${key} 还没有三拍表`).toBeTruthy()
      expect(ids.length, `${key} 的内容拍不足两个`).toBeGreaterThanOrEqual(2)
      for (const id of ids) {
        expect(initialEvents.some((e) => e.id === id), `${key} 的拍子事件 ${id} 不存在`).toBe(true)
      }
    }
  })

  it('东林三拍：弹劾 → 直言进谏 → 清流骨鲠', () => {
    const stand = initialEvents.find((e) => e.id === 'route_loyal_minister')
    expect(stand, '《直言进谏》必须存在').toBeTruthy()
    expect(stand?.storyline).toBe('eastern_forest')
    const c1 = stand?.choices?.find((c) => c.id === 'c1')
    expect(c1?.effects?.flags?.add ?? [], '据理力争这一条要写清流直谏').toContain('清流直谏')

    const pure = allEndingEvents.find((e) => e.id === 'ending_pure_stream')
    expect(pure?.conditions?.flags?.has ?? [], '清流骨鲠必须读第二拍的票').toContain('清流直谏')
    expect(pure?.conditions?.flags?.any ?? []).toEqual(
      expect.arrayContaining(['弹劾温体仁', '弹劾杨嗣昌', '弹劾陈新甲'])
    )
  })

  it('红颜结局要读情感线写得出的票，不只是族谱/义田', () => {
    const family = allEndingEvents.find((e) => e.id === 'ending_family_man')
    expect(family?.storyline).toBe('female')
    expect(family?.conditions?.flags?.any ?? []).toEqual(
      expect.arrayContaining(['harmonious_family', 'has_children', 'wife_respected', 'legitimate_heir'])
    )
  })
})
