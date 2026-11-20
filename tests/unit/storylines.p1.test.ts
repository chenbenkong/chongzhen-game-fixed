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
      border_war: ['route_military', 'route_border_volunteer', 'route_songjin_decision'],
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

  it('边关三拍：投笔从戎 → 请缨边关 → 松锦决，第三拍的门读第二拍的票', () => {
    const second = initialEvents.find((e) => e.id === 'route_border_volunteer')
    const third = initialEvents.find((e) => e.id === 'route_songjin_decision')
    expect(third, '《松锦决》必须存在').toBeTruthy()
    expect(third?.storyline).toBe('border_war')
    expect(third?.conditions?.flags?.has ?? [], '第三拍必须以第二拍的边关任职为前置').toContain('边关任职')
    expect(third?.conditions?.flags?.any ?? []).toEqual(
      expect.arrayContaining(['随军出征', '死守宁远', '增援松锦'])
    )

    // 第三拍是结局前奏：引擎按 isPreEnding 强制同月先发，否则链上玩家被《边关大将》
    // 1638 年窗截胡、或发牌竞争饿死，reach 恒为 0（§8.25 探针实测）。
    expect(third?.isPreEnding, '松锦决必须是前奏才保证发牌').toBe(true)
    expect(third?.linksToEndingId).toBe('ending_border_general')
    expect(third?.conditions?.month?.min, '前奏钉在八月催战').toBe(8)
    expect(third?.conditions?.year?.min, '下沿 1639 是探针证明的空档，1640 正月有医圣/名臣坝墙').toBe(1639)
    expect(third?.conditions?.flags?.has ?? [], '门要读第二拍写下的临时坝').toContain('松锦未决')

    // 临时坝接力：第二拍 c1/c2 写「松锦未决」按住大将结算，第三拍三个选项都拆坝。
    const s1 = second?.choices?.find((c) => c.id === 'c1')
    const s2 = second?.choices?.find((c) => c.id === 'c2')
    expect(s1?.effects?.flags?.add ?? [], '请缨要写下松锦未决').toContain('松锦未决')
    expect(s2?.effects?.flags?.add ?? [], '请守锦州要写下松锦未决').toContain('松锦未决')

    const c1 = third?.choices?.find((c) => c.id === 'c1')
    expect(c1?.effects?.flags?.add ?? [], '援松锦要写结局读得到的票').toContain('增援松锦')
    expect(c1?.effects?.flags?.remove ?? [], '援松锦落地即拆坝').toContain('松锦未决')
    const c2 = third?.choices?.find((c) => c.id === 'c2')
    expect(c2?.effects?.special?.endingId, '死守松山当场收笔战死沙场').toBe('ending_died_battlefield')
    expect(c2?.effects?.flags?.remove ?? [], '死守也要拆坝（虽然当场收笔）').toContain('松锦未决')
    const c3 = third?.choices?.find((c) => c.id === 'c3')
    expect(c3?.effects?.flags?.add ?? [], '撤守是退出链的选项，不写票').toEqual([])
    expect(c3?.effects?.flags?.remove ?? [], '撤守拆坝并交还边关任职').toEqual(
      expect.arrayContaining(['松锦未决', '边关任职'])
    )

    const general = allEndingEvents.find((e) => e.id === 'ending_border_general')
    expect(general?.conditions?.flags?.any ?? []).toEqual(
      expect.arrayContaining(['边关任职', '随军出征', '增援松锦'])
    )
    expect(general?.conditions?.flags?.notHas ?? [], '大将结算要按住松锦未决').toContain('松锦未决')
    expect(general?.endingConfig?.preludeEventId, '大将要回指松锦决前奏').toBe('route_songjin_decision')
    const died = allEndingEvents.find((e) => e.id === 'ending_died_battlefield')
    expect(died?.storyline).toBe('border_war')
    expect(died?.conditions?.flags?.any ?? []).toContain('随军出征')
  })

  it('红颜结局要读情感线写得出的票，不只是族谱/义田', () => {
    const family = allEndingEvents.find((e) => e.id === 'ending_family_man')
    expect(family?.storyline).toBe('female')
    expect(family?.conditions?.flags?.any ?? []).toEqual(
      expect.arrayContaining(['harmonious_family', 'has_children', 'wife_respected', 'legitimate_heir'])
    )
  })

  it('权谋三拍：天命所归 → 诸将劝进 → 权欲之巅 → 篡位自立，四格皆归 power', () => {
    // §8.26：篡位链的起点《天命所归》长期 tag mystery（异闻怪谭），而第二拍《诸将劝进》、
    // 前奏《权欲之巅》、结局《篡位自立》都是 power —— 主线认领不到自己的第一拍。
    // 这张卡讲的是幕僚劝进、扩私兵、问鼎（c2 回音明说"看不到任何天命"），是权谋不是谶纬。
    // 这里把四格的归属一次性钉死：再有人把起点改回 mystery，或把链上任何一格挪去别的线，都会红。
    const ambition = initialEvents.find((e) => e.id === 'transition_1643_ambition')
    const crown = initialEvents.find((e) => e.id === 'transition_1643_crown_offer')
    const prelude = initialEvents.find((e) => e.id === 'prelude_usurper_1643_12')
    const usurper = allEndingEvents.find((e) => e.id === 'ending_usurper_throne')

    expect(ambition?.storyline, '《天命所归》是权谋第一拍，不能再落在异闻怪谭').toBe('power')
    expect(crown?.storyline).toBe('power')
    expect(prelude?.storyline).toBe('power')
    expect(usurper?.storyline).toBe('power')

    // 票的接力：每一拍写下一拍要读的票，结局收齐四张（与 simulation.routeBeats 同口径）。
    const add = (ev: typeof ambition, cid: string) =>
      ev?.choices?.find((c) => c.id === cid)?.effects?.flags?.add ?? []
    expect(add(ambition, 'c1')).toEqual(expect.arrayContaining(['掌军权', '拥兵自重']))
    expect(add(crown, 'c1')).toContain('问鼎之约')
    expect(add(prelude, 'c1')).toContain('黄袍加身')
    expect(usurper?.conditions?.flags?.has ?? []).toEqual(
      expect.arrayContaining(['掌军权', '拥兵自重', '问鼎之约', '黄袍加身'])
    )

    // 起点归位不能把 mystery 辅线抽干：它仍有自己的事件与专属结局《下落不明》。
    const mysteryEvents = initialEvents.filter((e) => e.storyline === 'mystery')
    expect(mysteryEvents.length, 'mystery 辅线被篡位链归位抽干了').toBeGreaterThanOrEqual(1)
    const unknown = allEndingEvents.find((e) => e.id === 'ending_unknown_fate')
    expect(unknown?.storyline, 'mystery 仍要认领自己的结局').toBe('mystery')
  })
})
