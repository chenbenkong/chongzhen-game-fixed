import { describe, expect, it } from 'vitest'
import { allEvents } from '../../scripts/event-pools'
import { buildParams, type DerivedState } from '../../scripts/audit-ending-reachability'
import { scanFlagReachability } from '../../scripts/audit-flag-reachability'
import { allEndingEvents } from '../../src/data/events/ending'
import { boundaryEventManager } from '../../src/services/BoundaryEventManager'

/**
 * 第七十二轮：九张「写了没人读」的票接进结局格（§1.4 ㊻ 第 2 类的收尾）。
 *
 * ㊻ 量到的是：`route_guide.ts` 的九个选项会落下 `入阁`、`位极人臣`、`请调外任`、
 * `清白辞官`、`乞骸骨`、`最后拼搏`、`打造舰队`、`盐引生意`、`党争反戈`，
 * 而当时结局格的 `conditions.flags` 一张都不读。第七十轮把正文里那 8 处空头承诺删了，
 * 本轮补上实物：每一张票都要有归宿，归宿必须是**看得见、说得通**的那一格。
 *
 * 三组判据，缺一不可：
 *  1. **有格收**：票真的写进了那一格的正面名单（不是 notHas 的"用来排除"）；
 *  2. **真能开**：用引擎注册表自己的 check 反推一份存档，带票能命中、不带票不能命中
 *     —— 只写字符串不测行为，等于把"名单里有"当成"门开了"；
 *  3. **没拓宽**：`打造舰队`/`盐引生意`/`党争反戈` 三张是**同案旧票的伴生票**
 *     （写手同时写下 `皮岛敛财` / `袁党`），接进 `any` 之后可达面一点没变 ——
 *     这是本轮最硬的一条边界：接票可以，借机放宽不行。
 *
 * 《名臣垂范》的门票在 `custom` 函数体里，条件扫描看不见（第二十三轮起就知道这件事）。
 * 本轮把那份名单提成 `FAMOUS_MINISTER_EXTRA_TICKETS`，让 list 与函数读同一份，
 * 体检脚本也读同一份 —— 否则"接进去了"只有写代码的人知道。
 */

const NINE = [
  '入阁',
  '位极人臣',
  '请调外任',
  '清白辞官',
  '乞骸骨',
  '最后拼搏',
  '打造舰队',
  '盐引生意',
  '党争反戈'
] as const

/** 条件对象里正面收下的六张（另外三张在 custom 里） */
const POSITIVE_HOME: Array<[tileId: string, flag: string]> = [
  ['ending_pirate_king', '打造舰队'],
  ['ending_pirate_king', '盐引生意'],
  ['ending_zhaoyu_prison', '党争反戈'],
  ['ending_honorable_retirement', '清白辞官'],
  ['ending_honorable_retirement', '乞骸骨'],
  ['ending_duty_death', '最后拼搏']
]

/** custom 里的三张：入阁/位极人臣（宰辅）、请调外任（外任名臣） */
const OFFICE_TICKETS = ['入阁', '位极人臣', '请调外任'] as const

const tileOf = (id: string) => allEndingEvents.find(e => e.id === id)!
const anyOf = (id: string) => tileOf(id).conditions?.flags?.any ?? []

const boundaryOf = (id: string) =>
  Object.values(boundaryEventManager.getAll()).find(e => e.type === 'ending' && e.event.id === id)!

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
    age: 32,
    flags: [],
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 },
    ...over
  }
}

const allowed = (tileId: string, over: Partial<DerivedState>) =>
  boundaryOf(tileId).check(buildParams(stateOf(over)))

/** 每一格只抬它自己读的那几维：其余维度留在中性值上，别让别的格子顺手也开门 */
const TILE_STATE: Record<string, Partial<DerivedState>> = {
  ending_pirate_king: {
    year: 1638,
    turn: 120,
    age: 32,
    attributes: { ...stateOf().attributes, 财帛: 85, 武略: 50 },
    hidden: { ...stateOf().hidden, 道德值: 15, 野心值: 60 }
  },
  ending_zhaoyu_prison: {
    states: { ...stateOf().states, 圣眷: 10 }
  },
  ending_honorable_retirement: {
    hidden: { ...stateOf().hidden, 道德值: 65 },
    states: { ...stateOf().states, 圣眷: 45, 国势: 40 }
  },
  ending_duty_death: {
    attributes: { ...stateOf().attributes, 文韬: 65 },
    hidden: { ...stateOf().hidden, 道德值: 75 },
    states: { ...stateOf().states, 民望: 65 }
  },
  ending_famous_minister: {
    year: 1641,
    turn: 156,
    age: 35,
    hidden: { ...stateOf().hidden, 道德值: 85 },
    states: { ...stateOf().states, 清议: 75, 圣眷: 40, 国势: 60 }
  }
}

describe('第七十二轮 · 九张无主票各自有格收', () => {
  it('六张正面票真的写进了那一格的 any —— 不是注释、不是 tags', () => {
    const missing = POSITIVE_HOME.filter(([tile, flag]) => !anyOf(tile).includes(flag)).map(
      ([tile, flag]) => `${tile} 的 any 里没有「${flag}」`
    )
    expect(missing).toEqual([])
  })

  it('宰辅与外任三张写进《名臣垂范》的 custom 名单（第三份凭据，与清流票并列）', () => {
    const cond = tileOf('ending_famous_minister').conditions!
    const custom = cond.custom as (p: { flags: string[] }) => boolean
    const verdicts = OFFICE_TICKETS.map(flag => [flag, custom({ flags: [flag] })])
    expect(verdicts.filter(([, ok]) => !ok).map(([flag]) => `${flag} 没有被 custom 认下`)).toEqual([])
  })

  it('custom 原有的清流票口径一点没动：一张不够、两张才算', () => {
    const custom = tileOf('ending_famous_minister').conditions!.custom as (p: {
      flags: string[]
    }) => boolean
    expect(custom({ flags: [] }), '没有票不该开门').toBe(false)
    expect(custom({ flags: ['东林党核心'] }), '一张清流票在旧口径里就不够').toBe(false)
    expect(custom({ flags: ['东林党核心', '清算阉党'] }), '两张清流票是旧口径').toBe(true)
    // 宰辅票是**另一条凭据**，不是第三张清流票：一张清流票 + 入阁 走的是宰辅那一支。
    expect(custom({ flags: ['东林党核心', '入阁'] }), '宰辅凭据与清流票并列，不互相凑数').toBe(true)
    expect(custom({ flags: ['东林党核心', '改革派', '入阁'] }), '三条并存时仍按旧口径开门').toBe(true)
  })
})

describe('第七十二轮 · 带票能开、不带票不能开（引擎自己的 check）', () => {
  for (const [tile, flag] of POSITIVE_HOME) {
    it(`${tile}《${tileOf(tile).title}》：只差「${flag}」时，有它就开、没它不开`, () => {
      const base = TILE_STATE[tile]
      expect(allowed(tile, { ...base, flags: [flag] }), `带「${flag}」没开`).toBe(true)
      expect(allowed(tile, { ...base, flags: [] }), '不带票也开了，说明这张票根本没有分量').toBe(false)
    })
  }

  for (const flag of OFFICE_TICKETS) {
    it(`ending_famous_minister《${tileOf('ending_famous_minister').title}》：只差「${flag}」时，有它就开、没它不开`, () => {
      const base = TILE_STATE.ending_famous_minister
      expect(allowed('ending_famous_minister', { ...base, flags: [flag] }), `带「${flag}」没开`).toBe(
        true
      )
      expect(allowed('ending_famous_minister', { ...base, flags: [] }), '不带票也开了').toBe(false)
    })
  }
})

describe('第七十二轮 · 接票不是借机放宽：三张伴生票的可达面必须为零', () => {
  /** 新票 → 写手同案落下的旧票（那张旧票早就在目标格的 any 里） */
  const COMPANION: Array<[flag: string, companion: string, tile: string]> = [
    ['打造舰队', '皮岛敛财', 'ending_pirate_king'],
    ['盐引生意', '皮岛敛财', 'ending_pirate_king'],
    ['党争反戈', '袁党', 'ending_zhaoyu_prison']
  ]

  for (const [flag, companion, tile] of COMPANION) {
    it(`每一个写下「${flag}」的选项都同时写下「${companion}」（${tile} 的旧门票）`, () => {
      expect(anyOf(tile), `旧门票「${companion}」不在 ${tile} 的 any 里，这条不变量失效`).toContain(
        companion
      )
      const writers: string[] = []
      for (const e of allEvents) {
        for (const c of e.choices ?? []) {
          const add = c.effects?.flags?.add ?? []
          if (add.includes(flag)) writers.push(`${e.id}/${c.id}`)
        }
      }
      expect(writers.length, `「${flag}」没有任何写手`).toBeGreaterThan(0)
      const alone = writers.filter(id => {
        const [eventId, choiceId] = id.split('/')
        const choice = allEvents.find(e => e.id === eventId)!.choices!.find((c: any) => c.id === choiceId)!
        return !(choice.effects?.flags?.add ?? []).includes(companion)
      })
      expect(alone, `这些选项只写「${flag}」不写「${companion}」—— 接票之后就多了一条新路`).toEqual([])
    })
  }
})

describe('第七十二轮 · 回读率口径：九张票不再是"只写不读"', () => {
  const report = scanFlagReachability()

  it('九张票都写得出来（防止名单打错字，让后面的断言空转）', () => {
    const ghosts = NINE.filter(f => !report.granted.has(f))
    expect(ghosts, '这些名字全库没人写得出，检查拼写').toEqual([])
  })

  it('九张票一张都不在 writeOnly 名单里', () => {
    const still = NINE.filter(f => report.writeOnly.includes(f))
    expect(still, '这些票还是只写不读：玩家那次抉择仍然等于没发生').toEqual([])
  })

  it('《名臣垂范》custom 名单里的每一张票都有写手', () => {
    const missing = OFFICE_TICKETS.filter(f => !report.granted.has(f))
    expect(missing).toEqual([])
  })
})
