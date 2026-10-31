import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import {
  DECLINABLE_ENDING_IDS,
  SHIGUAN_DECLINE_FLAG,
  declineGateOf
} from '../../src/data/endingDecline'
import { allEndingEvents } from '../../src/data/events/ending'
import { allEchoEvents } from '../../src/data/events/echo'
import { FLAG_MEMOIRS } from '../../src/data/flagBiography'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { advanceMonths, flush, makeCharacter, makeGameState, makeSaveData, renderGameEngine } from './helpers/gameEngine'

/**
 * 第十九轮：「史馆请笔」—— 善终结局命中时不再替玩家结案，改成把卡摆上桌让他自己选。
 *
 * 要钉的是 §1.4 ⑬ 那条实测：善终局的判定读的是**状态**（财帛≥90、道德≥80、清议≥70
 * 一旦凑齐就恒真），所以年窗一开的第一次月份推进必然命中，玩家什么都没选就被结了案。
 * 400 局的取样里善终结局全部落在窗口开放的那一年，于是 1644 那一整段正戏
 * （甲申国变、城破殉城、南渡续祚、称臣纳贡、东林烈士）实测 **0/200 局**玩进去过。
 *
 * 第二十二轮改的是这一层的**闸门形状**。第十九轮把它写成了一闸门管十三格：
 * 拒过任意一张请笔卡就写下 `史馆辞笔`，而这一条是十三格的公共 `notHas`。
 * 实测的代价（40 局「求退」定向取样）：10 局带上空门门票、7 局四道状态门全过，
 * **0 局开过《遁入空门》的卡** —— 每一局都因为早年在 1638 年拒过《归隐田园》或《殉职任上》
 * 而被永久关在外面。⑬ 要治的是"游戏替玩家结案"，可只许接受**第一张撞上的**收束，
 * 等于把这一格重新交还给优先级数字（《遁入空门》p114 永远排在《归隐田园》p109 之后）。
 * 于是闸门拆成逐格的 `搁笔·<格名>`；`史馆辞笔` 留着当履历，由 echo_shiguan_001 正面读它。
 *
 * 三层各钉一件事，少一层都会退化成别的东西：
 *   1. 数据层：卡上除了【收笔】之外的**每一条**选项都写上这一格自己的闸门，
 *      而这一格的条件读它。少写一条 = 下个月同一张卡再来一遍
 *      （第十八轮的坝换成第十九轮的墙）。
 *   2. 引擎层：判定命中时 `isGameOver` 必须还是 false —— 这是这一轮的全部意义。
 *   3. 玩法层：拒过的那一格不许再来；同一份状态仍可以被**别的一格**请笔。
 */

const SEAL_CHOICE = (e: GameEvent) => (e.choices || []).find(c => c.effects?.special?.type === 'ending')
const DECLINE_CHOICE = (e: GameEvent) => (e.choices || []).find(c => c.id === 'c_decline')

/**
 * 一份"名臣垂范的条件已经成立、但年窗还差一个月"的存档。
 *
 * 1639 年十二月：名臣的年窗是 1640-1643，所以挂载路径上判定为假；
 * 推进一个月落到 1640 年正月，月份检查（checkBoundary）就会命中 ——
 * 这样才测得到"引擎自己收尾"那条路径，而不是读档路径。
 */
function makeReadyToSealSave() {
  return makeSaveData({
    character: makeCharacter({
      rank: '正二品·尚书',
      degree: '进士',
      attributes: { 财帛: 60, 文韬: 90, 理政: 90, 武略: 50, 体质: 50 },
      hidden: { 道德值: 90, 欲望值: 20, 野心值: 40, 机敏值: 60, 忠诚值: 80 },
      // 名臣垂范的 custom 条件要"上面那批 flag 里至少两条"
      flags: ['地方官任职', '东林党核心', '清算阉党']
    }),
    gameState: makeGameState({
      currentYear: 1639,
      currentMonth: 12,
      turn: 140,
      圣眷: 50,
      中官: 50,
      清议: 80,
      士绅: 60,
      民望: 60,
      国势: 40
    })
  })
}

describe('数据层：善终结局被转换成可以拒绝的请笔卡片', () => {
  const offers = allEndingEvents.filter(e => e.declinable)

  it('名单里的每一条都在结局池里，且真的带上了拒绝权', () => {
    const missing = DECLINABLE_ENDING_IDS.filter(id => !allEndingEvents.some(e => e.id === id))
    expect(missing, 'DECLINE_COPY 里写了池中没有的 id').toEqual([])
    expect(
      offers.map(e => e.id).sort(),
      '不在名单里的善终不该被转换，名单里的每一条都该被转换'
    ).toEqual([...DECLINABLE_ENDING_IDS].sort())
  })

  it('每一条请笔卡片都有【搁笔】，且它是零数值代价的', () => {
    const bad = DECLINABLE_ENDING_IDS.map(id => allEndingEvents.find(e => e.id === id)!)
      .filter(e => {
        const d = DECLINE_CHOICE(e)
        if (!d) return true
        const fx = d.effects || {}
        return !d.text.startsWith('【搁笔】') ||
          !d.result?.echo ||
          fx.flags?.add?.includes(SHIGUAN_DECLINE_FLAG) !== true ||
          fx.attributes || fx.gameState || fx.hidden || fx.special
      })
      .map(e => e.id)
    expect(bad, '缺【搁笔】、或【搁笔】还要额外罚玩家的数值').toEqual([])
  })

  it('除【收笔】之外的每一条选项都写上本格闸门（否则同一张卡下月重演）', () => {
    const leaks = offers.flatMap(e =>
      (e.choices || [])
        .filter(c => c.effects?.special?.type !== 'ending')
        .flatMap(c => {
          const add = c.effects?.flags?.add || []
          const miss = [declineGateOf(e.title), SHIGUAN_DECLINE_FLAG].filter(f => !add.includes(f))
          return miss.map(f => `${e.id}/${c.id} 没写「${f}」`)
        })
    )
    expect(leaks, '这些选项答完不会关上自己那一格').toEqual([])
  })

  it('【收笔】那一条保持原样：不写 flag、仍是结局、仍在第一位', () => {
    // 第一位是给「果断抉择」成就和结局图鉴体检留的：
    // audit-ending-codex 读 choices[0].result.echo，useGameEngine 用 choices[0].id 计数。
    for (const e of offers) {
      const seal = SEAL_CHOICE(e)
      expect(seal, `${e.id} 已经没有盖棺那条选项了`).toBeTruthy()
      expect(e.choices[0].id, `${e.id} 的第一条选项被换掉了`).toBe(seal!.id)
      expect(seal!.effects?.flags?.add ?? [], `${e.id} 的盖棺选项写上了拒绝 flag`).not.toContain(SHIGUAN_DECLINE_FLAG)
    }
  })

  it('每一格读的是自己那道闸，不是公共闸', () => {
    // 公共闸门（第十九轮原样）会让"拒过任意一张卡"关死全部十三格。
    // 实测被《遁入空门》踩过：带票 10 局、四道状态门全过 7 局、开卡 0 局。
    const bad = offers.flatMap(e => {
      const notHas = e.conditions?.flags?.notHas || []
      const out: string[] = []
      if (!notHas.includes(declineGateOf(e.title))) out.push(`${e.id} 没读自己的「${declineGateOf(e.title)}」`)
      if (notHas.includes(SHIGUAN_DECLINE_FLAG)) out.push(`${e.id} 还在读公共闸门 —— 一次搁笔关死全部善终格`)
      return out
    })
    expect(bad).toEqual([])
  })

  it('每一道闸门彼此不同名，且每一道都真有人写', () => {
    const gates = offers.map(e => declineGateOf(e.title))
    expect(new Set(gates).size, '两格的闸门撞了名字：拒掉其中一格会连带关死另一格').toBe(gates.length)
    const writable = new Set(
      offers.flatMap(e => (e.choices || []).flatMap(c => c.effects?.flags?.add || []))
    )
    const unwritable = gates.filter(g => !writable.has(g))
    expect(unwritable, '闸门写不出来＝条件恒假＝这一格永久打不开').toEqual([])
  })

  it('史馆辞笔降级成履历之后，仍有一个正面读者', () => {
    // writeOnly（只写不读）的棘轮是 224。删掉公共闸门会把它顶到 225，
    // 所以这一轮给它写《史馆又来》：拒过笔这件事，史官过几年来问一次。
    const reader = allEchoEvents.find(e =>
      [...(e.conditions?.flags?.has ?? []), ...(e.conditions?.flags?.all ?? [])].includes(SHIGUAN_DECLINE_FLAG)
    )
    expect(reader, '没有任何事件正面读 史馆辞笔 —— 它变成了一个只写不读的死经历').toBeTruthy()
    expect(FLAG_MEMOIRS[SHIGUAN_DECLINE_FLAG], '这段履历还得有一句人话').toBeTruthy()
  })

  it('降临型结局一律没被改动', () => {
    // 甲申国变、城破殉城、病逝、抄家、革职是"降临"，玩家没有拒绝的余地。
    const untouched = allEndingEvents.filter(e => !e.declinable)
    const polluted = untouched
      .filter(e => (e.conditions?.flags?.notHas || []).includes(SHIGUAN_DECLINE_FLAG) || DECLINE_CHOICE(e))
      .map(e => e.id)
    expect(polluted, '这些结局不该拿到拒绝权').toEqual([])
    for (const id of ['ending_jiashen_nationfall', 'ending_city_fall', 'ending_southern_ming', 'ending_martyr_nation']) {
      const e = allEndingEvents.find(x => x.id === id)
      expect(e, `${id} 不在结局池里，本用例的名单该跟着改`).toBeTruthy()
      expect(e!.declinable, `${id} 是降临，不是收束，不许拿到拒绝权`).toBeFalsy()
    }
  })

  it('每张请笔卡只有一条【搁笔】，门槛里也没有重复项', () => {
    // 注入 flag 的那一步要先查后写（withDeclineFlag / notHas 去重），否则这条会翻倍：
    // 同一份经历在 flags 里出现两次，履历表就会把同一段事写两遍。
    for (const id of DECLINABLE_ENDING_IDS) {
      const e = allEndingEvents.find(x => x.id === id)!
      expect(
        (e.choices || []).filter(c => c.id === 'c_decline').length,
        `${id} 的【搁笔】不止一条`
      ).toBe(1)
      const notHas = e.conditions!.flags!.notHas!
      expect(new Set(notHas).size, `${id} 的 notHas 里同一个 flag 被塞了两遍`).toBe(notHas.length)
      for (const c of e.choices || []) {
        const add = c.effects?.flags?.add || []
        expect(new Set(add).size, `${id}/${c.id} 的 flags.add 里 史馆辞笔 被重复追加`).toBe(add.length)
      }
    }
  })

  it('史馆辞笔有一句人话可看（拒绝收笔不该是暗账）', () => {
    expect(FLAG_MEMOIRS[SHIGUAN_DECLINE_FLAG]).toBeTruthy()
  })
})

describe('引擎层：判定命中只开卡，不替玩家结案', () => {
  it('善终条件成立的那个月，卡片摆上桌而游戏还没结束', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeReadyToSealSave() })
    await flush()
    // 前提：1639 年十二月年窗还没开，挂载路径不该已经把局结掉
    expect(result.current.isGameOver, '挂载就把局结了，下面测不到月份路径').toBe(false)

    await advanceMonths(result, 1)

    const card = result.current.currentEvent
    expect(card?.declinable, `1640 年正月该摆出一张可以拒绝的善终卡，实际是 ${card?.id}`).toBe(true)
    expect(result.current.isGameOver, '这就是 ⑬：引擎不许在判定命中时直接收尾').toBe(false)
  })

  it('点【搁笔】：继续做官，且拒过的那一格不再来', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeReadyToSealSave() })
    await flush()
    await advanceMonths(result, 1)

    const card = result.current.currentEvent!
    const decline = DECLINE_CHOICE(card)!
    await act(async () => {
      result.current.handleChoice(decline)
    })
    await flush()

    expect(result.current.isGameOver, '拒绝收笔不该结束游戏').toBe(false)
    expect(result.current.character.flags, '拒绝收笔没写下经历').toContain(SHIGUAN_DECLINE_FLAG)

    // 抉择之后引擎会顺手做一次结局判定，而那次判定传的是**抉择前**的 flags。
    // 刚写下的本格闸门对它不可见，于是同一张卡（或另一张优先级更高的善终卡）
    // 会被当场重新摆上桌 —— 玩家点了"搁笔"，屏幕却直接换成下一张请笔卡。
    const swapped = result.current.currentEvent
    expect(
      swapped!.id === card.id || !swapped!.declinable,
      `点完【搁笔】当场又被摆了一张善终卡：${swapped!.id}`
    ).toBe(true)

    // 先把刚点掉的那张卡从屏幕上冲掉：handleChoice 对 declinable 卡会跳过结局判定，
    // currentEvent 因此还停在原卡上，直接从下一次循环看起会把"自己还没消失"当成"又来了一次"。
    await advanceMonths(result, 1)

    // 后面 30 个月里，条件一直成立（状态几乎没动），唯一该拦住卡片的只有刚写下的本格闸门。
    // 第二十二轮的口径：拒过《名臣垂范》只关《名臣垂范》，别格照旧可以来 ——
    // 所以这里钉的是"每一格最多来一次"，不再是"一次都不许来"。
    // 逐月看而不是只看末尾：请笔卡只摆一个月的话，末尾那次断言会正好漏掉它。
    const seen: string[] = []
    for (let i = 0; i < 30 && !result.current.isGameOver; i++) {
      const cur = result.current.currentEvent
      if (cur?.declinable) {
        seen.push(cur.id)
        await act(async () => {
          result.current.handleChoice(DECLINE_CHOICE(cur)!)
        })
        await flush()
      }
      await advanceMonths(result, 1)
    }
    expect(seen.filter(id => id === card.id), `拒过《${card.title}》之后它又摆上桌了一次`).toEqual([])
    expect(seen.filter((id, i) => seen.indexOf(id) !== i), '同一格出现了两次 —— 本格闸门没生效').toEqual([])
    expect(result.current.isGameOver, '这 30 个月里被别的结局收掉了，控制变量失效').toBe(false)
  })

  it('点【青史留名】：照旧结算，结局进历史', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeReadyToSealSave() })
    await flush()
    await advanceMonths(result, 1)

    const card = result.current.currentEvent!
    const seal = SEAL_CHOICE(card)!
    await act(async () => {
      result.current.handleChoice(seal)
    })
    await flush()

    expect(result.current.isGameOver).toBe(true)
    expect(result.current.eventHistory).toContain(card.id)
    expect(result.current.character.flags, '盖棺那条选项不该写拒绝经历').not.toContain(SHIGUAN_DECLINE_FLAG)
  })

  it('答【反事实】/【后续】也算拒了笔（它们是带增量的另一条路，不是第二次机会）', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeReadyToSealSave() })
    await flush()
    await advanceMonths(result, 1)

    const card = result.current.currentEvent!
    const other: EventChoice | undefined = (card.choices || []).find(
      c => c.id !== SEAL_CHOICE(card)!.id && c.id !== 'c_decline'
    )
    expect(other, `${card.id} 除了盖棺和搁笔之外没有第二条路，本用例失去意义`).toBeTruthy()

    await act(async () => {
      result.current.handleChoice(other!)
    })
    await flush()

    expect(result.current.isGameOver, '选了另一条路却被结算成善终，等于玩家没得选').toBe(false)
    expect(result.current.character.flags).toContain(SHIGUAN_DECLINE_FLAG)
  })
})

/**
 * 第七十六轮：请笔卡是「邀请」，不是「降临」—— 它不许整月吃掉当月的发牌（§1.4 54）。
 *
 * 第十九轮把 `checkBoundary` 写成「命中即 return」，是为了让降临型结局（甲申国变那类
 * 只有一个月窗口的）不被当月队列盖掉（§1.4 ㉛）；请笔卡沿用了同一条，理由是
 * 「拒笔不能变成白看一张卡」。但请笔卡不收尾 —— 玩家拒了笔，这一个月照样要过，
 * 于是这条规则的实际代价是：**可拒绝的邀请换走了玩家的一个月**。
 *
 * 实测（24 局 × 6 策略，seed 9700+）：请笔卡在 1635 年之后密集命中，
 * 24 局里 34 处「过渡卡最后窗口月」被整月吞掉 —— 1640-02/03/04 三格最干净：
 * 24 局全部走到第 140 格，transition_139–142 的发牌数是 27/0/0/0，四张卡里三张从未下发。
 * 同月已演清一色是 `ending_*` 请笔卡（名臣垂范 / 天伦之乐 / 富甲一方 …）。
 *
 * 两条路径各钉一条，少一条都会漏：
 *   1. 月初命中：300ms 定时器里 checkBoundary 摆出请笔卡时，本月普通事件要照发（进队列）。
 *   2. 月中命中：答完历史卡后状态才越过门线，请笔卡当天摆上桌 —— 队列同样不许被清。
 */
describe('第七十六轮：请笔卡不许把当月的历史卡与末班车一起吞掉', () => {
  it('月初摆上请笔卡时，当月队列照发；拒笔后同月就能演', async () => {
    const { result } = renderGameEngine({ loadSaveData: makeReadyToSealSave() })
    await flush()
    await advanceMonths(result, 1)

    const card = result.current.currentEvent
    expect(card?.declinable, `1640-01 该先摆请笔卡，实际是 ${card?.id}`).toBe(true)

    const queued = result.current.pendingEvents.map(e => e.id)
    expect(
      queued,
      '请笔卡把 1640-01 的历史卡整批吞了 —— 拒笔的玩家白丢一个月'
    ).toContain('historical_031')

    await act(async () => {
      result.current.handleChoice(DECLINE_CHOICE(card!)!)
    })
    await flush()
    expect(result.current.gameState.currentYear, '拒笔不该跨年').toBe(1640)
    expect(result.current.gameState.currentMonth, '拒笔不该跨月 —— 拒的是笔，不是这个月').toBe(1)

    await act(async () => {
      result.current.handleContinue()
    })
    await flush()
    expect(
      result.current.currentEvent?.id,
      '拒完笔，「继续」没有接上当月队列里的历史卡'
    ).toBe('historical_031')
  })

  it('月中的抉择把状态推过门线时，请笔卡同样不许清空当月的队列', async () => {
    // 1640-01 月初：清议 60、圣眷 55、文韬 72 —— 名臣垂范（清议≥70 ∧ 圣眷≥35）还没开门。
    // 当月历史卡《松锦之战》的【上疏问责】给 清议+30 / 圣眷−15 / 道德+15 / 文韬+8，
    // 答完这一条，名臣垂范当场成立。实测里 1640-02 那一格正是这样被吃掉的。
    const save = makeSaveData({
      character: makeCharacter({
        rank: '正六品·同知',
        degree: '进士',
        attributes: { 财帛: 60, 文韬: 72, 理政: 55, 武略: 50, 体质: 50 },
        hidden: { 道德值: 90, 欲望值: 50, 野心值: 40, 机敏值: 50, 忠诚值: 50 },
        // 名臣垂范还有一条 custom：至少两张清流票（东林党核心/清算阉党…）。
        // 这两张票同时也开 清流骨鲠，但那一格要 文韬≥75 —— 月初 72，答完【上疏问责】
        // 才到 80。名臣 priority 100 排在它前面，所以月中先摆出来的还是名臣。
        flags: ['地方官任职', '东林党核心', '清算阉党']
      }),
      gameState: makeGameState({
        currentYear: 1639,
        currentMonth: 12,
        turn: 143,
        圣眷: 55,
        中官: 50,
        清议: 60,
        士绅: 50,
        民望: 45,
        国势: 60
      })
    })
    const { result } = renderGameEngine({ loadSaveData: save })
    await flush()

    await advanceMonths(result, 1)
    const first = result.current.currentEvent
    expect(first?.id, `1640-01 的第一张卡不是《松锦之战》，是 ${first?.id}`).toBe('historical_031')
    expect(first?.declinable ?? false, '月初就已经是请笔卡，月中路径无从测起').toBe(false)

    const c2 = first!.choices!.find(c => c.id === 'c2')!
    await act(async () => {
      result.current.handleChoice(c2)
    })
    await flush()

    const offer = result.current.currentEvent
    expect(offer?.declinable, `答完【上疏问责】该摆出名臣垂范，实际是 ${offer?.id}`).toBe(true)
    const queued = result.current.pendingEvents.map(e => e.id)
    expect(
      queued,
      '月中摆出的请笔卡把当月剩下的牌清空了 —— 1640-02/03/04 就是这样连丢三格'
    ).toContain('transition_139')
  })
})
