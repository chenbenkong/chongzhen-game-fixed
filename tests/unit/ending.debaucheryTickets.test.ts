import { describe, expect, it } from 'vitest'
import { allEndingEvents } from '../../src/data/events/ending'
import { allEvents } from '../../scripts/event-pools'
import { FLAG_MEMOIRS } from '../../src/data/flagBiography'
import { scanRouteGates } from '../../scripts/audit-route-gates'

/**
 * 风月线结局的门票（第四十九轮）。
 *
 * 第四十八轮结束时，44 格结局里还剩 3 格"纯数值"：中兴成功、纵欲而亡、烟花之主。
 * 它们共同的问题是：玩家在界面上看不见 欲望值 / 道德值 / 野心值，也就看不出
 * 自己离那一格有多远。这一轮把三格改成读经历票，并把纵欲线的两格彻底摘掉 hidden；
 * 《卖国求荣》也顺手摘掉了隐藏道德/野心（贰臣这张票已经说明了立场）。
 *
 * 这份用例钉四件事：
 *  1. 三格各自的 flag 门与数值下界（下界必须是玩家看得见的属性/状态）；
 *  2. 新票（流连青楼 / 纳妓为妾 / 纵欲成疾 / 青楼暗股 / 青楼靠山 / 闭门谢客）都有写手；
 *  3. 第二拍事件真的存在，且门槛读的是第一拍的票（不是又一次隐藏数值）；
 *  4. 结局门禁的读数不再回涨（纯数值 0、隐藏 ≤19）。
 */

const byId = new Map(allEvents.map(e => [e.id, e]))
const endingById = new Map(allEndingEvents.map(e => [e.id, e]))

const positivePool = (f: any): string[] => [
  ...(f?.has ?? []),
  ...(f?.all ?? []),
  ...(f?.some ?? []),
  ...(f?.any ?? [])
]

const writerIndex = new Map<string, string[]>()
for (const e of allEvents) {
  for (const c of e.choices ?? []) {
    for (const flag of c.effects?.flags?.add ?? []) {
      const list = writerIndex.get(flag) ?? []
      list.push(`${e.id}.${c.id}`)
      writerIndex.set(flag, list)
    }
  }
}

const WIND_TICKETS = ['流连青楼', '纳妓为妾', '纵欲成疾', '青楼暗股', '青楼靠山', '闭门谢客', '辞了暗股']

describe('风月线结局：判据换成看得见的经历票', () => {
  it('三格原本的纯数值结局现在都读经历票', () => {
    for (const id of ['ending_zhongxing_success', 'ending_debauch_fall', 'ending_pimp_lord']) {
      const e = endingById.get(id)!
      expect(e, `${id} 不在结局池里`).toBeTruthy()
      expect(positivePool(e.conditions?.flags).length, `${id}《${e.title}》没有经历门`).toBeGreaterThanOrEqual(1)
    }
  })

  it('《精尽人亡》《纵欲而亡》不再读隐藏欲望/道德', () => {
    for (const id of ['ending_debauchery_001', 'ending_debauch_fall']) {
      const e = endingById.get(id)!
      expect(e.conditions?.hidden, `${id} 还在读 hidden`).toBeUndefined()
      expect(positivePool(e.conditions?.flags)).toContain('纵欲成疾')
      expect(e.conditions?.attributes?.体质?.max, `${id} 的体质下界`).toBeTypeOf('number')
    }
  })

  it('《纵欲而亡》不许把"去过一次秦楼楚馆"判成死症（第四十九轮的实测教训）', () => {
    const pool = positivePool(endingById.get('ending_debauch_fall')!.conditions?.flags)
    // 第一版的门是 any['流连青楼','纳妓为妾','纵欲成疾']，比它原本的两道隐藏门松得多：
    // seed 8101（usurper 篡位线）只点过一次【赴约共度】，1642 年就结在这格，篡位走不到。
    // 摘掉的只有 流连青楼 那一条腿 —— "去过"不等于"过死在里头"。
    // 留住的两条都是动作本身：纵欲成疾＝确诊之后还"药照煎，夜照旧"，纳妓为妾＝真把人赎进家门
    //（这张卡的背景原文就是"你后院的女子越聚越多"）。
    // 只留一条腿也不行：那一格就全系在一个选项上，它的年份/门槛一挪整格打死 ——
    // 同一条由 audit.endingTicketWriters 的"每格至少两条能摸到的票"看着。
    expect(pool).toEqual(['纵欲成疾', '纳妓为妾'])
    expect(pool).not.toContain('流连青楼')
  })

  it('《烟花之主》读"有暗股 / 做靠山"两张票，不再读隐藏值', () => {
    const e = endingById.get('ending_pimp_lord')!
    const pool = positivePool(e.conditions?.flags)
    expect(pool).toEqual(expect.arrayContaining(['青楼暗股', '青楼靠山']))
    expect(e.conditions?.hidden).toBeUndefined()
    expect(e.conditions?.attributes?.财帛?.min).toBeGreaterThanOrEqual(100)
    expect(e.conditions?.gameState?.中官?.min).toBeGreaterThanOrEqual(20)
    // 清议≤30 是"名声已经坏了"的公开上界，不是隐藏数值
    expect(e.conditions?.gameState?.清议?.max).toBeLessThanOrEqual(30)
  })

  it('《中兴成功》把 custom 依赖的四张改革票写进门里，道德值换成公开清议', () => {
    const e = endingById.get('ending_zhongxing_success')!
    expect(positivePool(e.conditions?.flags).sort()).toEqual(
      ['先见之明', '坚持招抚', '阻止孙传庭出战', '持续保袁'].sort()
    )
    expect(e.conditions?.hidden).toBeUndefined()
    expect(e.conditions?.gameState?.清议?.min).toBeGreaterThanOrEqual(55)
    // 3 of 4 的集合基数判定仍在 custom 里，不能因为加了 any 就把它删了
    expect(typeof e.conditions?.custom).toBe('function')
  })

  it('《卖国求荣》保留贰臣票，撤掉隐藏道德/野心', () => {
    const e = endingById.get('ending_traitor')!
    expect(e.conditions?.flags?.has).toEqual(['贰臣'])
    expect(e.conditions?.hidden).toBeUndefined()
    expect(e.conditions?.gameState?.国势?.max).toBeLessThanOrEqual(20)
    expect(e.conditions?.gameState?.圣眷?.max).toBeLessThanOrEqual(5)
  })

  it('六张风月票都有写手，且都上了履历表', () => {
    for (const ticket of WIND_TICKETS) {
      expect(writerIndex.get(ticket)?.length, `${ticket} 没有写手`).toBeGreaterThan(0)
      expect(FLAG_MEMOIRS[ticket], `${ticket} 在"这一生"里没有一句人话`).toBeTruthy()
    }
  })

  it('第二拍《秦淮暗股》读第一拍的票，三个选项分别入股/做靠山/抽身', () => {
    const e = byId.get('gray_debauchery_030')!
    expect(e, 'gray_debauchery_030 没有进事件池').toBeTruthy()
    expect(e.choices.length).toBe(3)
    expect(positivePool((e.conditions as any)?.flags)).toEqual(
      expect.arrayContaining(['流连青楼', '纳妓为妾'])
    )
    const added = new Set(e.choices.flatMap((c: any) => c.effects?.flags?.add ?? []))
    expect(added).toContain('青楼暗股')
    expect(added).toContain('青楼靠山')
    expect(added).not.toContain('纵欲成疾')
    // 三条选项各写一张收束票，这张卡一生只开一次。
    // 第一版没有这一层：灰线冷却只有 6 个月，而【抽身】什么都不改变，
    // 实测 seed 8253 后半局 40 多次全花在停云馆，把 1643 年的南渡/劝进档期挤没了。
    expect(e.conditions?.flags?.notHas, '《秦淮暗股》没有收束票，能反复开').toEqual(
      expect.arrayContaining([...added])
    )
  })

  it('第二拍《纵欲成疾》读第一拍的票，且"遣散后院"是明确的收手选项', () => {
    const e = byId.get('gray_debauchery_031')!
    expect(e, 'gray_debauchery_031 没有进事件池').toBeTruthy()
    expect(e.choices.length).toBe(3)
    expect(positivePool((e.conditions as any)?.flags)).toEqual(
      expect.arrayContaining(['流连青楼', '纳妓为妾'])
    )
    const added = new Set(e.choices.flatMap((c: any) => c.effects?.flags?.add ?? []))
    expect(added).toContain('纵欲成疾')
    expect(added).toContain('闭门谢客')
    // 讳疾忌医与延医问药都是"慢病"的一条线，这张卡可以隔半年再开；
    // 只有【遣散后院】把它收死 —— 那条才是"该断的断干净"。
    expect(e.conditions?.flags?.notHas, '《纵欲成疾》的收束票写错了').toEqual(['闭门谢客'])
    // 收手不是空话：三张风月结局都不能在"闭门谢客"之后再弹出来
    for (const id of ['ending_debauchery_001', 'ending_debauch_fall', 'ending_pimp_lord']) {
      expect(endingById.get(id)!.conditions?.flags?.notHas, `${id} 没有排除闭门谢客`).toContain('闭门谢客')
    }
  })

  it('结局门禁读数不再回涨', () => {
    const s = scanRouteGates().summary
    expect(s.endingNumericOnly).toBe(0)
    expect(s.endingHidden).toBeLessThanOrEqual(19)
    expect(s.endingDeadTicket).toBe(0)
  })
})
