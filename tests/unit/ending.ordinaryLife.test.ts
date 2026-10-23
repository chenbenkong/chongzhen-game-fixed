import { describe, expect, it } from 'vitest'
import { eventsRouteGuide } from '../../src/data/events/transition/route_guide'
import { allEndingEvents } from '../../src/data/events/ending'
import { ORDINARY_LIFE_EXCLUDED_FLAGS } from '../../src/data/ordinaryLife'
import { declineGateOf } from '../../src/data/endingDecline'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'
import { buildParams, type DerivedState } from '../../scripts/audit-ending-reachability'
import { simulateRun, type SimOutcome } from './helpers/simulate'
import type { BoundaryEvent } from '../../src/types/boundaryEvent'
import type { OriginType } from '../../src/types/game'

/**
 * 《平凡终老》的门，从「隐藏数值落进六维窄带」改成「玩家自己选 + 没被别的路接走」。
 *
 * 第四十轮实测：旧条件要求 道德 50–68 ∧ 体质 35–65 ∧ 圣眷 30–65 ∧ 清议 35–60 ∧
 * 国势 30–55 ∧ 民望 30–60 六条同时成立，200 局里 **0 局**能落进去；即便用一个
 * 专门往中间带走的画像跑到六张票全拿，体质/民望也只会一路上行，穿不过上限。
 * 同一轮还量到原 `notHas` 的 55 条里，`弹劾袁崇焕`（20/20）、`士绅联盟`（20/20）、
 * `弹劾陈新甲`（13–17/20）是历史事件按出身只开一条选项逼出来的，不是玩家"选择去当名臣"。
 *
 * 所以这一轮不是把门槛调低，而是换判据：
 *   - 开局：路线事件《平庸之念》照常出现，只有【与世无争】被"做过大事"的名单锁住；
 *   - 门票：选了【与世无争】/【急流勇退】，玩家看得见自己拿到了什么；
 *   - 收束：结局仍保留下界（圣眷≥30、清议≥35、国势≥30、民望≥30、道德≥50、体质≥35），
 *           只把玩家看不见、也退不回去的**上界**换成玩家做过的**行为**。
 *
 * 本文件钉四件事：
 *   1. 路线事件不再有隐藏上界，锁只锁一条，理由能落到屏幕上；
 *   2. 路线与结局读同一份名单（两套口径就是"事件发得出来、结局却不认"）；
 *   3. 结局的下界与年窗一条没动 —— 这一轮不是降门槛；
 *   4. 真跑局：high 体质/民望 不再挡人，做过大事/没拿票/失宠仍然挡人。
 */

const routeEvent = eventsRouteGuide.find(e => e.id === 'route_ordinary_life')!
const routeChoice = routeEvent.choices.find(c => c.id === 'c1')!

const endingEvent = allEndingEvents.find(e => e.id === 'ending_ordinary_life')!
const endingBoundary: BoundaryEvent =
  Object.values(boundaryEventManager.getAll())
    .filter(e => e.type === 'ending')
    .find(e => e.event.id === 'ending_ordinary_life')!

function stateOf(over: Partial<DerivedState> = {}): DerivedState {
  const attributes: Record<string, number> = { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 }
  const hidden: Record<string, number> = { 道德值: 60, 欲望值: 50, 野心值: 40, 机敏值: 50, 忠诚值: 60 }
  const states: Record<string, number> = { 圣眷: 50, 中官: 50, 清议: 60, 士绅: 50, 民望: 50, 国势: 60 }
  return {
    attributes,
    hidden,
    states,
    turn: 120,
    year: 1638,
    month: 3,
    // 1638 年 / turn 120 的那把钟：22 岁开局、玩了 10 年。
    // 必须写出来 —— 不写，这份存档就"没有岁数"，而《寿终正寝》读的是岁数。
    age: 32,
    flags: ['与世无争'],
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 },
    ...over
  }
}

const allowed = (over: Partial<DerivedState> = {}) => endingBoundary.check(buildParams(stateOf(over)))

describe('《平凡终老》的门：可见的选择，不再靠隐藏窄带', () => {
  it('路线事件只保留"还活着、还像个官"的下界，上界全部拆掉', () => {
    const cond = routeEvent.conditions!
    expect(cond.hidden?.道德值?.min, '道德下界保留').toBe(35)
    expect(cond.hidden?.道德值?.max, '道德上界是旧窄带的残留').toBeUndefined()
    expect(cond.attributes?.体质?.min, '体质下界保留').toBe(30)
    expect(cond.attributes?.体质?.max, '体质只涨不回头，上界等于关门').toBeUndefined()
    expect(cond.flags, '事件级 notHas 会让整张卡凭空消失，锁只许锁那一条选项').toBeUndefined()
  })

  it('锁的是【与世无争】，名单就是《平凡终老》读的那一份', () => {
    expect(routeChoice.showConditions?.flags?.notHas).toEqual([...ORDINARY_LIFE_EXCLUDED_FLAGS])
    expect(routeChoice.effects?.flags?.add).toEqual(expect.arrayContaining(['与世无争', '不争不抢']))
    expect(routeEvent.choices.find(c => c.id === 'c2')!.effects?.flags?.add).not.toContain('与世无争')
  })

  it('结局与路线读同一份名单，并且拒过笔的那一格仍然关着', () => {
    const cond = endingEvent.conditions!
    expect(cond.flags?.any).toEqual(['与世无争', '不争不抢'])
    expect(cond.flags?.notHas).toEqual(
      expect.arrayContaining([...ORDINARY_LIFE_EXCLUDED_FLAGS, declineGateOf(endingEvent.title)])
    )
  })

  it('这一轮没有动下界和年窗：不是把门槛调低', () => {
    const cond = endingEvent.conditions!
    expect(cond.year).toEqual({ min: 1635, max: 1643 })
    expect(cond.hidden?.道德值).toEqual({ min: 50 })
    expect(cond.attributes?.体质).toEqual({ min: 35 })
    expect(cond.gameState).toEqual({
      圣眷: { min: 30 },
      清议: { min: 35 },
      国势: { min: 30 },
      民望: { min: 30 }
    })
  })

  it('高体质/高民望不再挡人；做过大事、没票、失宠照旧挡', () => {
    expect(allowed(), '基准：拿到票、没做过大事').toBe(true)
    expect(
      allowed({ attributes: { ...stateOf().attributes, 体质: 96 }, states: { ...stateOf().states, 民望: 98 } }),
      '体质/民望只涨不回头，这正是旧门锁死人的地方'
    ).toBe(true)
    expect(allowed({ flags: ['与世无争', '随军出征'] }), '带兵出征的人该去边关大将那本传').toBe(false)
    expect(allowed({ flags: ['与世无争', '开仓赈灾'] }), '赈济出名的人不该读到"没赈济过灾民"').toBe(false)
    expect(allowed({ flags: [] }), '没有票就不该结案').toBe(false)
    expect(
      allowed({ states: { ...stateOf().states, 圣眷: 20 } }),
      '失宠到 20 的人该先面对诏狱，不是告老'
    ).toBe(false)
    expect(
      allowed({ flags: ['与世无争', declineGateOf(endingEvent.title)] }),
      '拒过一次笔，同一格不许下个月再把卡摆回来'
    ).toBe(false)
  })

  it('被迫签下的历史标签不挡人，自己走进朝堂大事才挡', () => {
    expect(
      allowed({ flags: ['与世无争', '弹劾袁崇焕', '反阉先锋', '士绅联盟'] }),
      '这些标签在 40 局里 15–19/19 是被事件按出身逼出来的，不是玩家选择去当名臣'
    ).toBe(true)
    expect(
      allowed({ flags: ['与世无争', '破坏招抚'] }),
      '破坏招抚是同一事件里有替代选项的主动选择 —— 做过的人不该读到"没留下名字"'
    ).toBe(false)
    expect(allowed({ flags: ['与世无争', '改革派'] }), '主动上疏行新政，也是走进大事').toBe(false)
    expect(ORDINARY_LIFE_EXCLUDED_FLAGS).not.toContain('弹劾袁崇焕')
  })
})

describe('《平凡终老》真跑局：活到年窗的人点得到、也结得了', () => {
  const ORIGINS: OriginType[] = ['寒门', '诗文清望']
  const SEEDS = 8

  it('拿到票且活进 1635 的局，绝大多数能结案', async () => {
    const runs: SimOutcome[] = []
    for (const origin of ORIGINS) {
      for (let i = 0; i < SEEDS; i++) {
        runs.push(
          await simulateRun({ seed: 8000 + i, policy: 'ordinary', origin, maxMonths: 260 })
        )
      }
    }
    const survivors = runs.filter(r => r.finalYear >= 1635 || r.firedEventIds.includes('route_ordinary_life'))
    const ticketed = runs.filter(r => r.firedEventIds.includes('route_ordinary_life'))
    const sealed = runs.filter(r => r.endingId === 'ending_ordinary_life')
    console.log(
      `  16 局：活进1635 ${survivors.length}，路线事件 ${ticketed.length}，结案 ${sealed.length}`
    )
    expect(ticketed.length, '路线事件本身抽不到，后面的门都是白搭').toBeGreaterThanOrEqual(7)
    expect(
      sealed.length / ticketed.length,
      '拿到门票却结不了案 —— 说明又有一道玩家看不见的门把这个结局锁回去了'
    ).toBeGreaterThanOrEqual(0.7)
    for (const r of sealed) {
      const hit = (r.finalFlags ?? []).filter(f => (ORDINARY_LIFE_EXCLUDED_FLAGS as readonly string[]).includes(f))
      expect(hit, `结案却带着"做过大事"的票：${hit.join('、')}`).toEqual([])
    }
  }, 240_000)
})
