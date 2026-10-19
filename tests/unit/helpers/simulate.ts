import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { renderGameEngine } from './gameEngine'
import { checkChoiceRequirement } from '../../../src/utils/choiceRequirements'
import { allEndingEvents } from '../../../src/data/events/ending'
import { resolveEndingTileId } from '../../../src/data/endingRegistry'
import { ZERO_WARNING_EVENT_ID } from '../../../src/data/zeroWarningEvents'
import type { Character, GameStateValues, OriginType } from '../../../src/types/game'
import type { EventChoice, GameEvent } from '../../../src/types/event'
import type { DerivedState } from '../../../scripts/audit-ending-reachability'

/**
 * 整局模拟：驱动**真的** `useGameEngine`，一路从 1628 年玩到游戏结束。
 *
 * 为什么要有这个东西。本文「需要人工验收的项」里那条「事件覆盖率 / 结局分布 —— 需要大量游玩」
 * 一直没被自动验收过，因为没人能拿手玩几百局。而这类"手玩才知道"的项，恰恰是静默失效的
 * 藏身处：一个永远不会被选中的结局、一个推进不动的年份、一处算成 NaN 的加成，
 * 单测里各点都过得住，只有真跑一整局才露出来。
 *
 * 三条设计决定：
 *  1. 用 `Math.random` 的种子替身，而不是让引擎接收 seed —— 引擎里的随机散在十几处
 *    （挑事件、投骰、随机后果），改签名要动的地方比这个替身多得多，而且改完之后
 *    "线上玩家的实际路径"就不再是被测的那条路径了。
 *  2. 选项能不能选，走 `EventDisplay.checkChoiceRequirement` —— 和玩家看到的是同一个判断。
 *    自己另写一遍就等于用第二套规则跑模拟，跑出来的覆盖率是假的。
 *  3. 假定时器推进那 340ms 调度窗口（引擎 `handleNextMonth` 里的去抖），
 *    一个月一次真实 340ms 的话，一局 200 个月要跑 70 秒，几百局无从谈起。
 */

export type SimPolicy =
  | 'random' | 'first' | 'ambitious' | 'steady' | 'warden' | 'sealer' | 'hermit' | 'monk' | 'stream'
  | 'bandit' | 'vanish'

export interface SimOutcome {
  seed: number
  policy: SimPolicy
  /** 推进过的月份数 */
  months: number
  /** 做出过的抉择数 */
  choices: number
  ended: boolean
  /**
   * 结局事件 id —— **只有它落在已注册结局表里才非空**。
   * 非空即"这一局真的走到了一个有名字的结局"；为空但 ended=true 就是异常，
   * 具体结束了什么事件看 `endEventId`。
   */
  endingId: string | null
  endingTitle: string | null
  /**
   * 与 `firedEventIds` 一一对应的**月份格**（`gameState.turn`，从 0 起算）。
   * 事件历史里只有 id，看不出「同一场病是不是三个月内治了两回」，
   * 而可重复支线的冷却期恰恰是按月份定义的 —— 这张平行表就是给那条不变量用的。
   */
  firedTurns: number[]
  /** 这一局里真正播出来的事件 id（按播放顺序） */
  firedEventIds: string[]
  /**
   * 逐月抄下的**边界入参**（只有 `opts.traceMonths` 为真时非空）。
   *
   * 第二十五轮加它，是为了回答一个终局快照答不了的问题：
   * 「这一格到底是**从来没开过门**，还是**开着门却被别格抢走**」，
   * 而《亡命江湖》那格的门是 `圣眷≤15 ∧ 道德≤30 ∧ 体质≥25 ∧ 任一票`，
   * `finalThresholds` 只有终局那一刻的值 —— 门在第 80 月开过三个月、第 96 月又关上，
   * 终局读数完全看不出这件事，只看得到"结案 0"。
   * 抄的是 `DerivedState`（可达性矩阵那一套入参），不是我自己发明的维度子集 ——
   * 两边喂同一个注册表，才许拿"矩阵说能走到"和"跑局说走不到"互相对账。
   */
  trace: MonthTrace[]
  /** 终局时算出 NaN / Infinity 的字段，正常应当恒空 */
  badNumbers: string[]
  finalYear: number
  finalRank: string
  /**
   * 结束时屏幕上那个事件的 id。
   * 比「从 eventHistory 反查结局 id」可靠：`handleGameOver` 写历史时带
   * `prev.includes(event.id) ? prev : ...` 的去重，而事件 id 早在月初就被整批推进过，
   * 所以结局事件未必是历史最后一条 —— 反查会认错。
   */
  endEventId: string | null
  /** 终局那一刻八条归零死线上的数值，用来把「为什么结束」归因到具体某一维 */
  finalThresholds: Record<string, number>
  /** 终局时角色身上的 flag 全集 —— 「死于归零必然先见过警告」这条不变量读它 */
  finalFlags: string[]
  /**
   * 终局时的党派四项（东林／阉党好感、立场、党争烈度）。
   *
   * 第二十一轮加它，是因为可达性矩阵能证明"门票发得出来、门槛够得着"，
   * 却证明不了"玩家真刷得到那个数"。`党争烈度` 只有一个来源
   * （五张门票 flag 在 `useGameEngine` 的 faction 段里各推一把），
   * 上界算法给的 100 是不考虑事件竞争的天花板；实测值才是真话。
   */
  finalFaction: { 东林好感: number; 阉党好感: number; 立场: string; 党争烈度: number } | null
  /**
   * 终局时**不在八条归零死线里、却被某些格子与支线当门读**的三维：国势／武略／野心值。
   *
   * 第二十四轮加它：《落草为寇》要 武略≥45 ∧ 野心≥60 ∧ 国势≤30，《不知所踪》要 国势≤15，
   * 而 `finalThresholds` 只有八条死线 —— 用它的数归因"这一格为什么开不了"，
   * 三条门里有两条根本量不到，量到的 0 分不清是门槛够不着还是策略没朝它走。
   * `欲望值` 是同一批"读了没人量"的维度：`checkDemotion` 的「贪墨被查」
   * （财帛>70 ∧ 欲望>75 ∧ 道德<30，severity 3，直接革职）读的正是它。
   */
  finalGates: Record<string, number>
  /**
   * 终局卡片上「为什么会走到这一步」的那一句（革职／贬官那条判据的原文）。
   *
   * 第二十四轮加它：`endingId` 只说《罢黜归田》，不说踩了哪条判据。而 `checkDemotion`
   * 只有 severity≥3 才革职 —— 「道德败坏」（道德≤0 且已收过归零警告）和「贪墨被查」
   * 那两条，跟「圣眷<10」那种只会降级的判据完全不同一类。分不清是哪条，就分不清
   * 「画像自己把道德养到 0」和「格子真的坐在考功悬崖下面」。
   */
  endReason: string | null
  /**
   * 本局所有已选选项**声明**的增量之和（属性/态度/隐藏三组一起加，未乘难度与出身系数）。
   * 与 `actualDelta` 对照用来把「这维掉了」归因到两种完全不同的原因：
   *   声明就是一片负 → 内容在扣，去看数据；
   *   声明接近 0 而实际大跌 → 引擎里有没写在 effects 里的暗扣，去看代码。
   * 因为没乘系数、也拿不到 0..100 的裁剪，两者只比方向与量级，不比尾数。
   */
  declaredDelta: Record<string, number>
  /** 八维的实际变化（终值 − 开局值），与 `declaredDelta` 同键对照 */
  actualDelta: Record<string, number>
  /** 模拟过程中抛出的异常（应当恒为 null；非空就是逮到 bug 了） */
  error: string | null
}

/** mulberry32：够小、够快、可复现的 32 位种子随机 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 图鉴格子 id → 标题。
 *
 * 只从 `allEndingEvents` 取 —— 它就是图鉴的那 44 格。
 * 终局事件 id 换成格子 id 一律走 `resolveEndingTileId`（同一张对账表），
 * 这里不再自己硬记别名：此前 `ending_bankrupt` 是手抄的一条，
 * 于是模拟报告和图鉴各说各话。
 */
const ENDING_TITLES = new Map<string, string>()
for (const e of allEndingEvents as any[]) {
  if (e?.id) ENDING_TITLES.set(e.id, e.title)
}

/** 终局事件 id（注册 id / 改名后的 id / 引擎内联卡片的 id）→ 图鉴格子 id */
export const endingTileOf = (id: string | null | undefined): string | null =>
  id ? resolveEndingTileId(id) : null

/** 贪心策略的打分：把可见收益粗略加总（属性 + 州府态度 + 隐藏属性） */
function scoreChoice(choice: EventChoice): number {
  const eff = choice.effects || ({} as any)
  let sum = 0
  for (const group of [eff.attributes, eff.gameState, eff.hidden]) {
    for (const v of Object.values(group || {}) as any[]) if (typeof v === 'number') sum += v
  }
  if (typeof eff.meritScore === 'number') sum += eff.meritScore
  return sum
}

/**
 * 「守成」策略的估值：做完这个选择之后，八条归零判死线里最紧的那一条还剩多少。
 *
 * 这八条就是 boundaryEvents.ts 里 `pastGrace()` 那批 check —— turn≥12 之后
 * 财帛/体质/圣眷/中官/清议/士绅/民望/道德值 任一为 0 就立刻收尾。
 * 一个想把游戏玩下去的玩家，做的就是这个判断。
 */
function postValues(character: Character, gameState: GameStateValues, choice: EventChoice): number[] {
  const e = (choice.effects || {}) as any
  const a = e.attributes || {}
  const g = e.gameState || {}
  const h = e.hidden || {}
  return [
    character.attributes.财帛 + (a.财帛 || 0),
    character.attributes.体质 + (a.体质 || 0),
    gameState.圣眷 + (g.圣眷 || 0),
    gameState.中官 + (g.中官 || 0),
    gameState.清议 + (g.清议 || 0),
    gameState.士绅 + (g.士绅 || 0),
    gameState.民望 + (g.民望 || 0),
    character.hidden.道德值 + (h.道德值 || 0)
  ]
}

function weakestThreshold(character: Character, gameState: GameStateValues, choice: EventChoice): number {
  return Math.min(...postValues(character, gameState, choice))
}

/**
 * 「史馆请笔」卡上那条干净的【搁笔】（src/data/endingDecline.ts）。
 *
 * warden / steady 两组都必须优先点它，而不是点【反事实】或【后续】：
 * 那两条是"另一条活法"的推演，各自带增量（名臣那张要先扣 40 点道德值、加 25 点欲望），
 * 把它们当成"想继续玩"的原型动作，等于给每一个拒了笔的玩家凭空加一次惩罚 ——
 * 而我接下来要量的恰恰是"拒了笔能不能走到 1644"。
 */
const sealRefusal = (event: GameEvent) => (event.choices || []).find(c => c.id === 'c_decline')

/** warden 的保命启发式：在不收尾的选项里挑"最弱那条死线离归零最远"的一个 */
function pickSafest(
  pool: EventChoice[],
  character: Character,
  gameState: GameStateValues
): EventChoice {
  const safe = pool.filter(c => c.effects?.special?.type !== 'ending')
  const candidates = safe.length ? safe : pool
  let best = candidates[0]
  let bestWeak = -Infinity
  for (const c of candidates) {
    const weak = weakestThreshold(character, gameState, c)
    if (weak > bestWeak) {
      bestWeak = weak
      best = c
    }
  }
  return best
}

/**
 * 「求退」这一类策略的画像：想收哪格笔、捡哪些门票、躲哪些票。
 *
 * 分成两副画像是被实测教出来的：`hermit` 一组 40 局里《归隐田园》亮过 6 回，
 * 而《遁入空门》的请笔卡**一次也没开过** —— 原因就写在同一批局里：
 * 那一格的 `notHas` 里有 `归隐`，而合并画像的玩家把两张票一起捡了。
 * 一个已经剃度的人不会同时归隐田园，这不是 bug，是互斥；要量那一格就得有一副**只要空门**的画像。
 */
interface RetireProfile {
  /** 只想收这几格的笔，其余请笔一律拒 */
  targets: Set<string>
  /** 会主动去捡的票 */
  tickets: Set<string>
  /** 会主动躲开的票（躲不开只是扣分，不是硬筛 —— 有些事件三条路都带着它） */
  avoid: Set<string>
  /** 圣眷窗口：`<=45` 是 归隐田园 的门，`<=35` 是 遁入空门 的门 */
  favorBand: number
  /**
   * 这一格的状态门读的**属性**（不在八条归零死线里，pickSafest 管不到）。
   * 清流骨鲠 要 文韬≥75，而 文韬 既不是死线也不在评分里 —— 不给这一项加分，
   * 那一组的玩家就永远攒不够它自己那一格的第三道门。
   */
  boost?: Record<string, number>
  /**
   * 隐藏属性／州府态增量的**带符号**权重。
   * 默认 `{ 道德值: 3, 清议: 2, 圣眷: -1.5 }`（求退那三副画像的口径）。
   * 落草那条路正好相反 —— 它要 道德值≤20，把道德往上推的评分永远走不到那一格。
   */
  weights?: Record<string, number>
  /**
   * 允许哪几条死线**低于 25**。默认只有 圣眷 放到 20，其余七条各留 25。
   * 第二十四轮要量的那几格全都住在低位里：《落草为寇》要 道德值≤20、
   * 《亡命江湖》要 道德值≤30、《不知所踪》要 圣眷≤10 ∧ 清议≤20 ——
   * 而那三条同时也是归零判死的维度，所以画像必须能压到 8/12 这一档，
   * 又不能压到 0。留 25 的量具永远看不见它们，跟 warden 救圣眷是同一类盲区。
   */
  floors?: Record<string, number>
  /** 想把自己**按到某个数以下**的维度：还在这个数之上、而这个选项会往下压 → +6 */
  under?: Record<string, number>
  /** 想把自己**顶到某个数以上**的维度：还在这个数之下、而这个选项会往上抬 → +6 */
  over?: Record<string, number>
  /**
   * 危险线：选项做完之后**低于**这个数就 −12。
   *
   * 第二十四轮加的，因为那三格住的那片低位**不是真空** —— `checkDemotion()`
   * （`src/hooks/useGameEngine.ts:355` 起）在那些线后面摆着一整台考功机器：
   *   圣眷<10 → 「帝心尽失」severity 2；圣眷<30 ∧ 理政<40 → 「办事不力」；
   *   民望<20 ∧ 圣眷<40 → 「言辞失当」。
   * 贬官不立刻要命，但一路贬到底就是《罢黜归田》—— 实测第一版 bandit/vanish 两副画像
   * 把 圣眷 放到 floors 允许的最低（12／6），40 局全部在 12~21 个月被革职，
   * 一把门都没摸着。画像必须知道"低到哪儿就踩线了"，否则量到的 0 是画像自杀，不是格子坏了。
   */
  keepAbove?: Record<string, number>
  /** 危险线：选项做完之后**高于**这个数就 −12（野心值>70 ∧ 圣眷<40 是「结党营私」severity 2） */
  keepBelow?: Record<string, number>
}

/** 想往空门／归隐那两格走的玩家，会去捡的门票 */
const HERMIT_TICKETS = new Set([
  '看破红尘', '脱俗', '出家', '和尚',
  '归隐', '辞官', '讲学', '告病归田', '急流勇退', '主动致仕', '与世无争'
])
/**
 * 求退的人躲着走的票：《诏狱冤死》(ending_zhaoyu_prison) 的 `any` 只有这两张。
 *
 * 从前这一组 24 局里 13 局死在那一格上 —— 不是它想去，是它的**状态**正好撞进去：
 * 诏狱冤死 要 圣眷≤15 ∧ 带过 袁党/清算袁党，而"求退"的玩家一辈子都把圣眷放在低位，
 * 只要早年沾过袁案就随时会被收走。换成真玩家的说法：想出家的人不该在袁崇焕案里站队。
 */
const HERMIT_AVOID = new Set(['袁党', '清算袁党'])

/** 只想剃度的那副画像：门票是 遁入空门 的 `any`，躲的是它的 `notHas` */
const MONK: RetireProfile = {
  targets: new Set(['ending_monk_nirvana']),
  tickets: new Set(['看破红尘', '脱俗', '出家', '和尚']),
  avoid: new Set([
    ...HERMIT_AVOID,
    // 《遁入空门》自己的互斥面：这些票一上身，那一格就永久关死
    '归隐', '归隐山林', '藏匿民间', '组织义军', '拥兵自重', '落草为寇',
    '贰臣', '南渡长江', '效忠南明', '投降清朝', '投降大顺', '殉国', '殉国报君', '谪戍边疆'
  ]),
  favorBand: 35
}
/** 想辞官回乡的那副画像 */
const HERMIT: RetireProfile = {
  targets: new Set(['ending_monk_nirvana', 'ending_hermit_taoist']),
  tickets: HERMIT_TICKETS,
  avoid: HERMIT_AVOID,
  favorBand: 45
}

/** 读某一格自己写的门票（`any`／`has`）与互斥面（`notHas`）—— 不在这里手抄一遍 */
const tileFlagPool = (id: string, key: 'any' | 'notHas' | 'has'): string[] => {
  const tile = (allEndingEvents as any[]).find(e => e.id === id)
  return (tile?.conditions?.flags ?? {})[key] ?? []
}

/**
 * 想走《清流骨鲠》那一格言官路的画像。
 *
 * 门票与互斥面都从那一格自己读。第二十三轮之前它的 `any` 里躺着两张**全库无人写**的票
 * （清议派、廷杖），画像去检它们检不到 —— 那批幽灵票本轮已全部换成写得出来的经历
 * （东林党人、廷杖受刑），细节见 `audit.endingTicketWriters`。
 *
 * `favorBand: 40` 是刻意留的重叠：《名臣垂范》(priority 100) 要 圣眷≥35，
 * 把圣眷压到 40 上下正好让它**仍然可能命中** —— 这一副画像要量的不是"躲开名臣"，
 * 而是第二十二轮那道逐格闸门能不能让一个拒过名臣笔的人，下一个月被清流请笔。
 * 真躲开名臣的做法写在下面 `boost` 之外的一条：弹劾御本来自带 圣眷−15。
 */
const STREAM: RetireProfile = {
  targets: new Set(['ending_pure_stream']),
  tickets: new Set(tileFlagPool('ending_pure_stream', 'any')),
  avoid: new Set([...tileFlagPool('ending_pure_stream', 'notHas'), ...HERMIT_AVOID]),
  favorBand: 40,
  boost: { 文韬: 3 }
}

/**
 * 想落草为寇的那副画像（第二十四轮）—— 它和前面三副**方向相反**。
 *
 * 《落草为寇》要 武略≥45 ∧ 野心值≥60 ∧ **道德值≤20** ∧ 圣眷≤20 ∧ 国势≤30，
 * 而它的门票产地《铤而走险》要 武略≥35 ∧ 野心值≥50 ∧ **道德值≤40** ∧ 圣眷≤40。
 * 前面三副画像的评分里都写着 `+3 × 道德值`（求退的人当然道德高），
 * 于是那 40 局里 道德≤40 只有 1 局 —— 这不是走不到，是**量具一路把它往反方向推**。
 * `routeGuide.test.ts` 那句"剩下 5 条播不出来是要失宠，warden 看不见"只说对了一半：
 * 失宠之外还要**失德**。
 *
 * 道德值/清议 同时也是归零判死的维度，所以 `floors` 让它们压到 8 就停 ——
 * 压到 0 的那一局不算走到那一格，算死在门口。
 *
 * `weights` 里那两条负系数是给「贪墨被查」留的活路。第一版画像不管 财帛 与 欲望值
 * （它们既不是死线也不是门票），实测 40 局**全部**栽在这条 severity 3 的即时革职上
 * （财帛>70 ∧ 欲望>75 ∧ 道德<30），局长 avg=37 —— 一把 +财帛 的选项照单全收，
 * 到终局时 财帛 钉在 100、欲望 钉在 100。而《落草为寇》要的正是 道德≤20：
 * 一个既贪财又好色 yet 失德的人，在 1636 年那道门开之前就已被吏部题本革职。
 * 光靠 `keepBelow` 拦不住 —— 池子里每一条都超线时它给每个选项扣同一个数，等于没扣，
 * 所以要把惩罚挂在**增量**上（选得比别的选项更贪，就少排）。
 *
 * `floors.圣眷` 放到 8 而不是 12：【举兵】自带 圣眷−30，而《铤而走险》的门是 圣眷≤40，
 * 也就是说这一票只在 圣眷 30–40 那十点缝里"选得起"。而 圣眷<10 那条「帝心尽失」
 * 只是 severity 2 的**降级**（官阶降到底之后 `isRealDemotion` 恒假，等于空转），
 * 真正要命的是归零 —— 把 floor 卡在 12 会让画像永远拒掉【举兵】，
 * 量出来的 0 就成了量具的毛病。
 */
const BANDIT: RetireProfile = {
  targets: new Set(['ending_bandit_king']),
  tickets: new Set(tileFlagPool('ending_bandit_king', 'any')),
  avoid: new Set(tileFlagPool('ending_bandit_king', 'notHas')),
  favorBand: 20,
  weights: { 圣眷: -1, 财帛: -0.6, 欲望值: -1, 道德值: -0.8 },
  boost: { 武略: 3 },
  floors: { 圣眷: 5, 道德值: 6, 清议: 8, 民望: 8 },
  under: { 道德值: 20 },
  over: { 武略: 45, 野心值: 60 },
  keepAbove: { 理政: 42, 民望: 22, 圣眷: 8 },
  keepBelow: { 野心值: 68, 欲望值: 72, 财帛: 68 }
}

/**
 * 想"人没了"的那副画像：《不知所踪》要 国势≤15 ∧ 圣眷≤10 ∧ 清议≤20 ∧ 年≥1642，
 * 门票是 下落不明 + 隐姓埋名 **两张都要**（`has`，不是 `any`），唯一的产地是《乱世浮沉》；
 * 《亡命江湖》松一档（道德≤30 ∧ 圣眷≤15 ∧ 三张票任一）。两格合在一副画像里量，
 * 因为它们的互斥面几乎相同，而门票产地是同一个 `route_unknown_fate`。
 *
 * `圣眷` 的 floor 与 `BANDIT` 同一个理由：格子的门要 ≤10／≤15，而 圣眷<10 只是
 * severity 2 的降级（官阶见底的后续判定恒假），把 floor 卡在 11 等于画像自己不去够那条门。
 *
 * 财帛／欲望值 那两条负系数与 `BANDIT` 同一个理由：这一组第一版 20/20 局死在「贪墨被查」，
 * 而那两维既不是它的门票也不是死线，不扣就是白捡。
 */
const VANISH: RetireProfile = {
  targets: new Set(['ending_unknown_fate', 'ending_fugitive']),
  tickets: new Set([
    ...tileFlagPool('ending_unknown_fate', 'has'),
    ...tileFlagPool('ending_fugitive', 'any')
  ]),
  avoid: new Set([
    ...tileFlagPool('ending_unknown_fate', 'notHas'),
    ...tileFlagPool('ending_fugitive', 'notHas')
  ]),
  favorBand: 15,
  weights: { 圣眷: -1, 清议: -2, 财帛: -0.6, 欲望值: -1 },
  floors: { 圣眷: 8, 清议: 8, 道德值: 8 },
  under: { 圣眷: 12, 清议: 20, 道德值: 30 },
  keepAbove: { 理政: 42, 民望: 22, 圣眷: 8 },
  keepBelow: { 野心值: 68, 欲望值: 72, 财帛: 68 }
}

/** 策略 → 画像；各副共用同一个 `pickHermit` */
const PROFILES: Partial<Record<SimPolicy, RetireProfile>> = {
  monk: MONK,
  hermit: HERMIT,
  stream: STREAM,
  bandit: BANDIT,
  vanish: VANISH
}

/** 八条归零死线里 圣眷 的下标 —— 这一组唯一允许它掉到低位的维度 */
const FAVOR = 2

/** `postValues()` 返回数组的下标 → 维度名（画像的 `floors` 按名字改） */
const DEADLINES = ['财帛', '体质', '圣眷', '中官', '清议', '士绅', '民望', '道德值'] as const

/**
 * 「求退」策略：一个**就是想出家 / 想归隐**的玩家会怎么点。
 *
 * 为什么要有这一组。可达性矩阵只说得出"门后有把手"，既有策略里没有一种朝
 * 那两格走 —— 它们的判据是"活下去"或"收益最大"，而 遁入空门 要的是
 * **圣眷≤35 ∧ 道德≥65**、归隐田园 要的是 **圣眷≤45 ∧ 清议≥55 ∧ 道德≥70**：
 * 前者要主动把圣眷放掉，后者还得同时攒住清议。让 warden 去量它，量到的永远是 ×0，
 * 而 ×0 既可能是"走不到"也可能是"没人朝它走"（§1.4 ⑮ 那句话）。
 *
 * 所以这一组把圣眷**放着不管**（但绝不许归零 —— 圣眷=0 是即死死线），
 * 把道德与清议往上推，看见门票就捡，别的请笔一律拒。
 *
 * 口径上有一处必须留神："八条都不许掉到 8"这种**选项级**余量量不出东西。
 * 第一版就是这么写的，24 局平均只活 57 个月，全数死在 中官／财帛 归零上 ——
 * 维度在两次抉择之间还会每月自己往下滑，选项给的那点余量挡不住。
 * 现在是：圣眷留 20，其余七条各留 25，一条都够不着时退回纯保命。
 *
 * 第二十四轮把这副评分**借给反方向的画像**（`bandit`／`vanish`）：落草与失踪那三格读的
 * 是 道德值≤20／≤30 与 清议≤20，正好是求退画像一路往上推的那两维。所以方向做成了
 * `weights`／`under`／`over`／`floors` 四个可选字段，**不给就用原来那套** ——
 *  monk／hermit／stream 三副的实测数（遁入空门×7、归隐田园×12、清流骨鲠 开卡 8）
 * 是靠默认分支量出来的，改评分口径等于把那三轮的结论一起改掉。
 */
function pickHermit(
  pool: EventChoice[],
  character: Character,
  gameState: GameStateValues,
  profile: RetireProfile
): EventChoice {
  const nonEnding = pool.filter(c => c.effects?.special?.type !== 'ending')
  const candidates = nonEnding.length ? nonEnding : pool
  const floorOf = (i: number) =>
    profile.floors?.[DEADLINES[i]] ?? (i === FAVOR ? 20 : 25)
  const sustainable = candidates.filter(c => {
    const v = postValues(character, gameState, c)
    return v.every((x, i) => x >= floorOf(i))
  })
  const bounded = sustainable.length ? sustainable : [pickSafest(candidates, character, gameState)]
  let best = bounded[0]
  let bestScore = -Infinity
  for (const c of bounded) {
    const e = (c.effects || {}) as any
    const g = e.gameState || {}
    const h = e.hidden || {}
    const 圣眷后 = postValues(character, gameState, c)[FAVOR]
    /** 这一副画像往哪个方向走：默认是"求退"（道德往上、圣眷往下） */
    const weights = profile.weights ?? { 道德值: 3, 清议: 2, 圣眷: -1.5 }
    const deltaOf = (k: string): number => h[k] ?? g[k] ?? (e.attributes ?? {})[k] ?? 0
    // 圣眷是"越低越像要退"，但低进死线就没意义了：只在还在窗口里时给它加分。
    let score = 0
    for (const [k, w] of Object.entries(weights)) score += w * (deltaOf(k) || 0)
    if (圣眷后 <= profile.favorBand) score += 10
    if (圣眷后 <= 35 && profile.favorBand === 45) score += 10
    for (const f of (e.flags?.add || []) as string[]) {
      if (profile.tickets.has(f)) score += 40
      if (profile.avoid.has(f)) score -= 60
    }
    // 画像自己声明的属性追求（文韬之类）—— 它们不在八条死线上，上面那套保命分管不到
    for (const [k, w] of Object.entries(profile.boost || {})) {
      score += w * (((e.attributes as any) || {})[k] || 0)
    }
    const curOf = (k: string): number =>
      (character.hidden as any)[k] ?? (gameState as any)[k] ?? (character.attributes as any)[k] ?? 0
    if (profile.under || profile.over) {
      // 按格子自己声明的那副"低位窗口"走：已经够了就不再加分，免得一路压到归零。
      for (const [k, bound] of Object.entries(profile.under ?? {})) {
        if (deltaOf(k) < 0 && curOf(k) > bound) score += 6
      }
      for (const [k, bound] of Object.entries(profile.over ?? {})) {
        if (deltaOf(k) > 0 && curOf(k) < bound) score += 6
      }
    } else {
      // 求退那三副的默认补钉：那两格的状态门都读道德与清议，够不到就先补着。
      // （第二十二/二十三轮的实测数是这套评分量出来的，写死了就别动。）
      if (h.道德值 > 0 && character.hidden.道德值 < 65) score += 5
      if (g.清议 > 0 && gameState.清议 < 55) score += 5
    }
    // 考功机器踩线：低到/高过那条线就躲开（详见 RetireProfile.keepAbove 的注释）
    for (const [k, bound] of Object.entries(profile.keepAbove ?? {})) {
      if (curOf(k) + deltaOf(k) < bound) score -= 12
    }
    for (const [k, bound] of Object.entries(profile.keepBelow ?? {})) {
      if (curOf(k) + deltaOf(k) > bound) score -= 12
    }
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

function pickChoice(
  event: GameEvent,
  character: Character,
  gameState: GameStateValues,
  policy: SimPolicy,
  rand: () => number
): EventChoice | null {
  const all = event.choices || []
  if (all.length === 0) return null
  const open = all.filter(c => checkChoiceRequirement(c, character, gameState).available)
  // 全部锁住时按「勉力一试且成功」处理：玩家此时还有投骰这条路，
  // 而投骰的失败分支在 EventDisplay 里、不在引擎里，模拟层拿不到。
  // 这是本模拟器唯一的失真处，它只会让进度比真人略快，不会影响"能不能播出来"。
  const pool = open.length ? open : all
  const refusal = sealRefusal(event)
  if (policy === 'sealer') {
    // 「愿意收笔」的玩家：请笔卡一摆出来就点【青史留名】，其余一律按 warden 保命。
    //
    // 这一组是第十九轮加的量具：steady/warden 两组都会拒笔，于是善终结局在模拟里
    // 一次也不发生，"图鉴那十一格还亮不亮、善终之间谁先接走（§1.4 ⑮）"就没法量。
    // 而它必须建在 warden 上而不是 steady 上 —— 实测过：非结局选项随机挑的话，
    // 200 局里 148 局死在 1629 年（平均 20 个月），根本走不到年窗开放的那一年。
    const seal = (event.choices || []).find(c => c.effects?.special?.type === 'ending')
    if (event.declinable && seal && pool.includes(seal)) return seal
    return pickSafest(pool, character, gameState)
  }
  const profile = PROFILES[policy]
  if (profile) {
    // 只想收自己那几格的笔；别的请笔照 warden 的规矩拒掉。
    const seal = (event.choices || []).find(c => c.effects?.special?.type === 'ending')
    if (event.declinable && profile.targets.has(endingTileOf(event.id) ?? '') && seal && pool.includes(seal)) {
      return seal
    }
    if (refusal && pool.includes(refusal)) return refusal
    return pickHermit(pool, character, gameState, profile)
  }
  if (policy === 'warden') {
    if (refusal && pool.includes(refusal)) return refusal
    return pickSafest(pool, character, gameState)
  }
  if (policy === 'steady') {
    // 「想继续玩下去」的玩家：看见能直接收尾的选项（辞官、赐死、兵败自裁……）就绕开。
    // 没有这一层，模拟出来的局长是"玩家一看到退出就点"的局长，
    // 1630 年以后的那些事件与结局就永远统计不到 —— 那正是我们要量的东西。
    if (refusal && pool.includes(refusal)) return refusal
    const keepsPlaying = pool.filter(c => c.effects?.special?.type !== 'ending')
    if (keepsPlaying.length) return keepsPlaying[Math.floor(rand() * keepsPlaying.length) % keepsPlaying.length]
    return pool[Math.floor(rand() * pool.length) % pool.length]
  }
  if (policy === 'first') return pool[0]
  if (policy === 'ambitious') {
    let best = pool[0]
    let bestScore = -Infinity
    for (const c of pool) {
      const s = scoreChoice(c)
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    return best
  }
  return pool[Math.floor(rand() * pool.length) % pool.length]
}

/** 把一个选项声明的全部增量累加进账（属性/态度/隐藏三组，键名不重叠） */
function accumulateDeclared(into: Record<string, number>, choice: EventChoice): void {
  const eff = (choice.effects || {}) as any
  for (const group of [eff.attributes, eff.gameState, eff.hidden]) {
    for (const [k, v] of Object.entries(group || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) into[k] = (into[k] || 0) + v
    }
  }
}

function findBadNumbers(character: Character, gameState: GameStateValues): string[] {
  const bad: string[] = []
  const walk = (obj: any, prefix: string) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${prefix}.${k}`)
    }
  }
  walk(character.attributes, 'attributes')
  walk(character.hidden, 'hidden')
  walk(gameState, 'gameState')
  return bad
}

/** boundaryEvents 里 `pastGrace()` 那批判死线，逐项取当前值 */
function thresholdSnapshot(character: Character, gameState: GameStateValues): Record<string, number> {
  return {
    财帛: character.attributes.财帛,
    体质: character.attributes.体质,
    圣眷: gameState.圣眷,
    中官: gameState.中官,
    清议: gameState.清议,
    士绅: gameState.士绅,
    民望: gameState.民望,
    道德值: character.hidden.道德值
  }
}

/**
 * 逐月抄一份**边界注册表看得见的那个世界**。
 *
 * 字段照 `DerivedState` 抄，不自己发明子集：可达性矩阵用 `buildParams` 喂注册表，
 * 这条轨迹也用同一个 `buildParams` —— 两边问的是同一个问题，才允许互相对账。
 * `faction` 缺省那份与 `audit-ending-reachability.ts` 的 `neutral()` 同值，
 * 否则"没有党籍"在两边会被读成两种数。
 */
export interface MonthTrace {
  turn: number
  derived: DerivedState
}

const NO_FACTION = { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }

function derivedOf(character: Character, gameState: GameStateValues): DerivedState {
  return {
    attributes: { ...(character.attributes as unknown as Record<string, number>) },
    hidden: { ...(character.hidden as unknown as Record<string, number>) },
    states: {
      圣眷: gameState.圣眷,
      中官: gameState.中官,
      清议: gameState.清议,
      士绅: gameState.士绅,
      民望: gameState.民望,
      国势: gameState.国势
    },
    turn: gameState.turn,
    year: gameState.currentYear,
    month: gameState.currentMonth,
    flags: [...(character.flags || [])],
    faction: { ...(character.faction ?? NO_FACTION) }
  }
}

/**
 * 跑一局。`maxMonths` 默认 260（1628 起算约等于玩到 1649 年，早已越过甲申之变）。
 * 到点还没结束就返回 ended=false —— 那本身就是一个结论，不是失败。
 *
 * `origin` 默认 '寒门'。这个参数是第十四轮加上去的：**在此之前所有模拟跑的都只是寒门一个出身**，
 * 于是"出身之间的平衡"这件事从来没被测过 —— 而出身恰恰决定了你开局踩在哪几条死线旁边
 * （旧数据里 寒门 财帛15/士绅15、诗文清望 中官15），也决定了你头几个月看得见哪几条支线
 * （纵欲线的门槛是 欲望值 25~35）。跨出身取样才有资格说"平均局长"。
 */
export async function simulateRun(opts: {
  seed: number
  policy?: SimPolicy
  maxMonths?: number
  origin?: OriginType
  /** 逐月抄一份边界入参（见 `SimOutcome.trace`）。默认关：其余 41 个测试文件都不需要它。 */
  traceMonths?: boolean
}): Promise<SimOutcome> {
  const { seed, policy = 'random', maxMonths = 260, origin = '寒门', traceMonths = false } = opts
  const rand = mulberry32(seed)
  const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => rand())
  vi.useFakeTimers()

  const fired: string[] = []
  const firedTurns: number[] = []
  let badNumbers: string[] = []
  let outcomeMonths = 0
  let choices = 0
  let ended = false
  let endingId: string | null = null
  let endingTitle: string | null = null
  let error: string | null = null
  let finalYear = 1628
  let finalRank = ''

  const hook = renderGameEngine({ origin })
  let endEventId: string | null = null
  let finalThresholds: Record<string, number> = {}
  let finalFlags: string[] = []
  let finalFaction: SimOutcome['finalFaction'] = null
  let finalGates: Record<string, number> = {}
  let endReason: string | null = null
  const traceRows: MonthTrace[] = []
  let lastTraceTurn = -1
  const declaredDelta: Record<string, number> = {}
  const actualDelta: Record<string, number> = {}
  let startThresholds: Record<string, number> = {}
  try {
    await actFlush(400)
    startThresholds = thresholdSnapshot(hook.result.current.character, hook.result.current.gameState)
    let months = 0
    // 一个月最多几个事件，乘一个安全系数就是整局的最大步数；
    // 触到上限说明时钟推不动了，那是引擎 bug，不是局长。
    const maxSteps = maxMonths * 8
    let steps = 0
    while (steps++ < maxSteps && !hook.result.current.isGameOver) {
      const event = hook.result.current.currentEvent
      if (event) {
        const choice = pickChoice(
          event,
          hook.result.current.character,
          hook.result.current.gameState,
          policy,
          rand
        )
        if (choice) {
          accumulateDeclared(declaredDelta, choice)
          await act(async () => {
            hook.result.current.handleChoice(choice, { skipResignConfirm: true })
            await vi.advanceTimersByTimeAsync(60)
          })
          choices++
          fired.push(event.id)
          firedTurns.push(hook.result.current.gameState.turn)
          if (hook.result.current.isGameOver) {
            endEventId = hook.result.current.currentEvent?.id ?? event.id
            break
          }
        }
        // 玩家点「继 续」：先把当月剩下的待处理事件取出来，队列空了才进下月。
        // 这一步不能省 —— handleChoice **不会**清空 currentEvent，
        // 少了它就是对同一个事件连点，效果被重复计入（第一版就踩了这里，
        // 于是模拟里出现「同一个月点 8 次金榜题名」的假异常）。
        await act(async () => {
          hook.result.current.handleContinue()
          await vi.advanceTimersByTimeAsync(340)
        })
      } else {
        await act(async () => {
          hook.result.current.handleNextMonth()
          await vi.advanceTimersByTimeAsync(340)
        })
        if (hook.result.current.isGameOver) {
          endEventId = hook.result.current.currentEvent?.id ?? null
          break
        }
      }
      months = hook.result.current.gameState.turn
      if (traceMonths && months !== lastTraceTurn) {
        lastTraceTurn = months
        traceRows.push({ turn: months, derived: derivedOf(hook.result.current.character, hook.result.current.gameState) })
      }
    }

    ended = hook.result.current.isGameOver
    finalYear = hook.result.current.gameState.currentYear
    finalRank = hook.result.current.character.rank
    finalThresholds = thresholdSnapshot(hook.result.current.character, hook.result.current.gameState)
    finalFlags = [...(hook.result.current.character.flags || [])]
    finalFaction = hook.result.current.character.faction
      ? { ...hook.result.current.character.faction }
      : null
    finalGates = {
      国势: hook.result.current.gameState.国势,
      武略: hook.result.current.character.attributes.武略,
      野心值: hook.result.current.character.hidden.野心值,
      欲望值: hook.result.current.character.hidden.欲望值
    }
    for (const [k, v] of Object.entries(finalThresholds)) {
      actualDelta[k] = Math.round(((v ?? 0) - (startThresholds[k] ?? 0)) * 100) / 100
    }
    badNumbers = findBadNumbers(hook.result.current.character, hook.result.current.gameState)
    if (ended && !endEventId) {
      const history = hook.result.current.eventHistory
      for (let i = history.length - 1; i >= 0; i--) {
        if (endingTileOf(history[i])) {
          endEventId = history[i]
          break
        }
      }
    }
    // endingId 存的是**图鉴格子 id**（注册 id 可能被引擎改过名），
    // endEventId 保留原始事件 id 供排查。
    const endingTile = endingTileOf(endEventId)
    if (endingTile) {
      endingId = endingTile
      endingTitle = ENDING_TITLES.get(endingTile) ?? null
    }
    if (endingTile === 'ending_demotion') {
      const bg = hook.result.current.currentEvent?.narrative?.background
      endReason = typeof bg === 'string' ? bg.split('\n')[0].trim() || null : null
    }
    outcomeMonths = months
  } catch (e) {
    error = e instanceof Error ? `${e.message}\n${e.stack?.split('\n')[1] || ''}` : String(e)
  } finally {
    hook.unmount()
    randomSpy.mockRestore()
    vi.useRealTimers()
  }

  return {
    seed,
    policy,
    months: outcomeMonths,
    choices,
    ended,
    endingId,
    endingTitle,
    firedEventIds: fired,
    firedTurns,
    trace: traceRows,
    badNumbers,
    finalYear,
    finalRank,
    endEventId,
    finalThresholds,
    finalFlags,
    finalFaction,
    finalGates,
    endReason,
    declaredDelta,
    actualDelta,
    error
  }
}

async function actFlush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

export interface SimReport {
  games: number
  endedCount: number
  monthStats: { min: number; max: number; avg: number }
  endingsReached: Array<{ id: string; title: string | null; count: number }>
  distinctEndings: number
  distinctEventsFired: number
  /**
   * 触达过的「归零警告」危机事件（`boundary_warn_*`）。
   * 单列出来是因为这批 id 不属于 402 条内容池，混进 `distinctEventsFired`
   * 会让覆盖率虚高；而它们本身恰恰是本次要量的东西——警告到底有没有真的发生。
   */
  zeroWarningsFired: string[]
  errors: Array<{ seed: number; error: string }>
  badNumberRuns: number[]
  /**
   * ended=true 却没落在任何已注册结局上 —— 每条附终局事件、月份与八维数值。
   * 这类局要么是引擎在别处（危机、革职、油尽灯枯）提前收尾，要么是模拟器的漏洞；
   * 不做归因就只能靠猜，而本文已经为"靠猜"付过一次代价。
   */
  endedWithoutRegistry: Array<{
    seed: number
    policy: SimPolicy
    endEventId: string | null
    months: number
    year: number
    zeroed: string[]
  }>
  /** 终局那一刻恰好为 0 的维度计数，用来看「死法」的分布 */
  zeroedAtEnd: Record<string, number>
}

/** 跑一批，并把「触达率」这类只有跨局才看得出来的数字汇总出来 */
export async function simulateMany(opts: {
  count: number
  startSeed?: number
  policies?: SimPolicy[]
  maxMonths?: number
}): Promise<{ report: SimReport; runs: SimOutcome[] }> {
  const policies = opts.policies ?? ['random', 'first', 'ambitious']
  const runs: SimOutcome[] = []
  for (let i = 0; i < opts.count; i++) {
    runs.push(
      await simulateRun({
        seed: (opts.startSeed ?? 1) + i,
        policy: policies[i % policies.length],
        maxMonths: opts.maxMonths
      })
    )
  }

  const endingCounts = new Map<string, number>()
  const eventsFired = new Set<string>()
  const months: number[] = []
  const errors: SimReport['errors'] = []
  let endedCount = 0
  const badNumberRuns: number[] = []
  const endedWithoutRegistry: SimReport['endedWithoutRegistry'] = []
  const zeroedAtEnd: Record<string, number> = {}
  const zeroWarnings = new Set<string>()

  for (const r of runs) {
    if (r.error) errors.push({ seed: r.seed, error: r.error })
    if (r.badNumbers.length) badNumberRuns.push(r.seed)
    if (r.ended) endedCount++
    months.push(r.months)
    if (r.endingId) endingCounts.set(r.endingId, (endingCounts.get(r.endingId) || 0) + 1)
    for (const id of r.firedEventIds) {
      if (id.startsWith(ZERO_WARNING_EVENT_ID)) zeroWarnings.add(id)
      else eventsFired.add(id)
    }

    const zeroed = Object.entries(r.finalThresholds)
      .filter(([, v]) => v <= 0)
      .map(([k]) => k)
    for (const k of zeroed) zeroedAtEnd[k] = (zeroedAtEnd[k] || 0) + 1
    if (r.ended && !r.endingId) {
      endedWithoutRegistry.push({
        seed: r.seed,
        policy: r.policy,
        endEventId: r.endEventId,
        months: r.months,
        year: r.finalYear,
        zeroed
      })
    }
  }

  return {
    runs,
    report: {
      games: runs.length,
      endedCount,
      monthStats: {
        min: Math.min(...months),
        max: Math.max(...months),
        avg: Math.round(months.reduce((a, b) => a + b, 0) / months.length)
      },
      endingsReached: [...endingCounts.entries()]
        .map(([id, count]) => ({ id, title: ENDING_TITLES.get(id) ?? null, count }))
        .sort((a, b) => b.count - a.count),
      distinctEndings: endingCounts.size,
      distinctEventsFired: eventsFired.size,
      zeroWarningsFired: [...zeroWarnings].sort(),
      errors,
      badNumberRuns,
      endedWithoutRegistry,
      zeroedAtEnd
    }
  }
}

/** 供用例与报告脚本共用：所有已注册结局的 id */
export const allEndingIds = () => [...ENDING_TITLES.keys()]
