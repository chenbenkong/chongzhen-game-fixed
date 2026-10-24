/**
 * 「命途」——把玩家已经做出的抉择，翻译成看得见的路线与去向。
 *
 * 为什么要有这一层（第四十一轮）：
 *   实测 100 局，80 局结在带票（conditions.flags）的结局上，票被无视只有 1 局，
 *   多格竞争 7 局；唯一一次"优先序选了票更少的格子"，赢的也是闸门更多的党派结局。
 *   也就是说**判定器本身没有大毛病，毛病是玩家看不见它**：
 *   走了十几步，不知道自己已经上了哪条路、离哪一格还有多远、哪一维快归零。
 *   主流做法正是把这一层摊开——太阁 5 的职业身份、中国式家长的可见前置、
 *   Reigns 的可见仪表、FNV 由选择决定的结局、P5 的关键抉择与确认。
 *
 * 三条信息各自有唯一的数据源，UI 不重写任何判定：
 *   1. 命途：把结局数据里的 conditions.flags 抄成门票，只看玩家身上有没有这些票；
 *   2. 此刻史笔：直接问 BoundaryEventManager 当前会录哪一格（与引擎同一个 checkByType）；
 *   3. 危局：八条归零死线 + 归零警告 flag，与 boundaryEvents 同口径。
 * 门票、年窗、优先级三份元数据都有单测与真实数据逐字对账（routeTrail.test.ts），
 * 结局数据改了而这里没跟上，CI 会先报错。
 */

import { Character, GameStateValues } from '../types/game'
import { BoundaryEventCheckParams } from '../types/boundaryEvent'
import { EventChoice, EventConditions } from '../types/event'
import { NARRATIVE_MIN_TURN, NARRATIVE_MIN_YEAR } from '../data/boundaryEventCompiler'
import { boundaryEventManager } from '../services/BoundaryEventManager'
import { THRESHOLD_ENDING_BY_KEY } from '../data/boundaryEvents'
import { ZERO_THRESHOLDS, zeroWarnFlag, type ZeroKey } from '../data/zeroWarningEvents'

export type RouteStatus = 'training' | 'before' | 'open' | 'passed'

interface RouteDestinationSpec {
  endingId: string
  title: string
  /** `any` = 持有任一张票；`all` = 必须全部持有（对应 conditions.flags 的 any / has） */
  mode: 'any' | 'all'
  tickets: string[]
  /** 叙事结局编译后的年窗（含 NARRATIVE_MIN_YEAR 兜底），用于解释"为什么还没落笔" */
  window: { min: number; max?: number }
  /** BoundaryEvent 的优先级：同一命途里多格同时成立时，引擎先录数字小的那一格 */
  priority: number
}

export interface RouteFamilySpec {
  key: string
  name: string
  motto: string
  destinations: RouteDestinationSpec[]
}

/**
 * 十三个命途。门票全部抄自对应结局的 conditions.flags，
 * 年窗抄自 conditions.year（叙事结局另有 1635 年 / 36 月的编译兜底），
 * 优先级抄自注册表。三份都有测试对账，不靠肉眼维持同步。
 */
export const ROUTE_FAMILIES: RouteFamilySpec[] = [
  {
    key: 'border',
    name: '边关武途',
    motto: '刀口立身，马革裹尸。',
    destinations: [
      {
        endingId: 'ending_died_battlefield',
        title: '战死沙场',
        mode: 'any',
        priority: 103,
        tickets: ['随军出征', '追击清军', '平定兵变', '替代孙传庭', '支援孙传庭', '死守开封', '固守潼关'],
        window: { min: 1635, max: 1643 }
      },
      {
        endingId: 'ending_border_general',
        title: '边关大将',
        mode: 'any',
        priority: 120,
        tickets: [
          '边关任职', '关外督师', '随军出征', '追击清军', '平定兵变', '替代孙传庭', '支援孙传庭',
          '死守开封', '固守潼关', '死守宁远', '增援松锦', '收编天雄军', '培养将领', '镇压流寇', '追击流寇'
        ],
        window: { min: 1638, max: 1650 }
      }
    ]
  },
  {
    key: 'remonstrance',
    name: '清流言路',
    motto: '以笔为刃，以名为枷。',
    destinations: [
      {
        endingId: 'ending_pure_stream',
        title: '清流骨鲠',
        mode: 'any',
        priority: 121,
        tickets: ['弹劾温体仁', '弹劾杨嗣昌', '弹劾陈新甲', '弹劾袁崇焕', '言官', '东林党人', '东林党核心', '反阉先锋', '廷杖受刑'],
        window: { min: 1640, max: 1660 }
      },
      {
        endingId: 'ending_scholar_martyr',
        title: '清流殉道',
        mode: 'any',
        priority: 126,
        tickets: ['言官', '弹劾温体仁', '弹劾杨嗣昌', '弹劾陈新甲', '弹劾袁崇焕', '东林党核心', '复社成员', '东林党人', '反阉先锋', '廷杖受刑'],
        window: { min: 1635, max: 1644 }
      }
    ]
  },
  {
    key: 'hermit',
    name: '归隐之志',
    motto: '挂冠而去，山中岁月。',
    destinations: [
      {
        endingId: 'ending_hermit_taoist',
        title: '归隐田园',
        mode: 'any',
        priority: 109,
        tickets: ['归隐', '归隐山林', '辞官', '告病归田', '急流勇退', '主动致仕', '辞让入阁'],
        window: { min: 1635, max: 1660 }
      },
      {
        endingId: 'ending_recluse_scholar',
        title: '大儒传世',
        mode: 'any',
        priority: 111,
        tickets: ['归隐', '归隐山林', '辞官', '讲学', '开馆行医'],
        window: { min: 1635, max: 1660 }
      },
      {
        endingId: 'ending_monk_nirvana',
        title: '遁入空门',
        mode: 'any',
        priority: 114,
        tickets: ['出家', '和尚', '看破红尘'],
        window: { min: 1635, max: 1660 }
      },
      {
        endingId: 'ending_honorable_retirement',
        title: '致仕善终',
        mode: 'any',
        priority: 118,
        tickets: ['急流勇退', '主动致仕', '告病归田'],
        window: { min: 1635, max: 1650 }
      }
    ]
  },
  {
    key: 'homestead',
    name: '田园终老',
    motto: '不求闻达，只求安稳。',
    destinations: [
      {
        endingId: 'ending_family_man',
        title: '天伦之乐',
        mode: 'any',
        priority: 115,
        tickets: ['皮岛人脉', '士绅联盟', '持续仁政', '修族谱', '义田'],
        window: { min: 1640, max: 1660 }
      },
      {
        endingId: 'ending_ordinary_life',
        title: '平凡终老',
        mode: 'any',
        priority: 124,
        tickets: ['与世无争', '不争不抢'],
        window: { min: 1635, max: 1643 }
      }
    ]
  },
  {
    key: 'outlaw',
    name: '亡命天涯',
    motto: '印信一撂，天下皆路。',
    destinations: [
      {
        endingId: 'ending_unknown_fate',
        title: '不知所踪',
        mode: 'all',
        priority: 117,
        tickets: ['下落不明', '隐姓埋名'],
        window: { min: 1637, max: 1660 }
      },
      {
        endingId: 'ending_bandit_king',
        title: '落草为寇',
        mode: 'any',
        priority: 125,
        tickets: ['落草为寇', '啸聚山林'],
        window: { min: 1635, max: 1644 }
      },
      {
        endingId: 'ending_fugitive',
        title: '亡命江湖',
        mode: 'any',
        priority: 127,
        tickets: ['隐姓埋名', '下落不明', '潜逃'],
        window: { min: 1635, max: 1650 }
      }
    ]
  },
  {
    key: 'sea',
    name: '商海远航',
    motto: '风浪越大，银子越多。',
    destinations: [
      {
        endingId: 'ending_pirate_king',
        title: '海盗之王',
        mode: 'any',
        priority: 110,
        tickets: ['皮岛敛财', '出海', '通倭', '海贸'],
        window: { min: 1636, max: 1660 }
      },
      {
        endingId: 'ending_exile_overseas',
        title: '流亡海外',
        mode: 'all',
        priority: 113,
        tickets: ['转移资产'],
        window: { min: 1635, max: 1660 }
      }
    ]
  },
  {
    key: 'defect',
    name: '贰臣之途',
    motto: '换了旗号，还是做官。',
    destinations: [
      {
        endingId: 'ending_qing_tributary',
        title: '称臣纳贡',
        mode: 'all',
        priority: 108,
        tickets: ['贰臣'],
        window: { min: 1644, max: 1660 }
      },
      {
        endingId: 'ending_traitor',
        title: '卖国求荣',
        mode: 'all',
        priority: 131,
        tickets: ['贰臣'],
        window: { min: NARRATIVE_MIN_YEAR }
      }
    ]
  },
  {
    key: 'usurper',
    name: '问鼎之途',
    motto: '兵权在手，问鼎轻重。',
    destinations: [
      {
        endingId: 'ending_usurper_throne',
        title: '篡位自立',
        mode: 'all',
        priority: 104,
        // 第 62 轮：三张兵权票只说明"手里有兵"，前奏【黄袍加身】才是跨过那条线的那一步。
        tickets: ['掌军权', '拥兵自重', '问鼎之约', '黄袍加身'],
        window: { min: 1644, max: 1660 }
      }
    ]
  },
  {
    key: 'south',
    name: '南渡续祚',
    motto: '衣冠南渡，半壁江山。',
    destinations: [
      {
        endingId: 'ending_southern_ming',
        title: '南渡续祚',
        mode: 'all',
        priority: 105,
        // 渡江是脚程，效忠是立场 —— 见结局条件里的说明。命途面板要同时列出两张票。
        tickets: ['南渡长江', '效忠南明'],
        window: { min: 1640, max: 1660 }
      }
    ]
  },
  {
    key: 'martyr',
    name: '殉国死节',
    motto: '国破之日，臣子之节。',
    destinations: [
      {
        endingId: 'ending_martyr_nation',
        title: '殉国死节',
        mode: 'all',
        priority: 101,
        tickets: ['殉国报君'],
        window: { min: 1642, max: 1660 }
      },
      {
        endingId: 'ending_duty_death',
        title: '殉职任上',
        mode: 'any',
        priority: 119,
        tickets: ['鞠躬尽瘁', '积劳成疾'],
        window: { min: 1635, max: 1660 }
      }
    ]
  },
  {
    key: 'healer',
    name: '悬壶济世',
    motto: '不为良相，便为良医。',
    destinations: [
      {
        endingId: 'ending_medical_saint',
        title: '悬壶济世',
        mode: 'any',
        priority: 116,
        tickets: ['习医', '行医', '开馆行医', '赈灾行医', '仁心仁术'],
        window: { min: 1640, max: 1660 }
      }
    ]
  },
  {
    key: 'faction',
    name: '党争漩涡',
    motto: '站错了队，便是罪过。',
    destinations: [
      {
        endingId: 'ending_zhaoyu_prison',
        title: '诏狱冤死',
        mode: 'any',
        priority: 102,
        tickets: ['袁党', '清算袁党'],
        window: { min: 1635, max: 1644 }
      }
    ]
  },
  {
    key: 'debauchery',
    name: '秦淮风月',
    motto: '温柔乡里，白骨森森。',
    // 前两行读同一批票不是重复：《精尽人亡》要 体质≤10，《纵欲而亡》要 体质≤30，
    // 优先级 128 在 129 之前 —— 同一个人先掉进更狠的那一格，这是"掏空"程度的两道台阶。
    destinations: [
      {
        endingId: 'ending_debauchery_001',
        title: '精尽人亡',
        mode: 'any',
        priority: 128,
        tickets: ['纵欲成疾', '纳妓为妾'],
        window: { min: 1635, max: 1644 }
      },
      {
        endingId: 'ending_debauch_fall',
        title: '纵欲而亡',
        mode: 'any',
        priority: 129,
        tickets: ['纵欲成疾', '纳妓为妾'],
        window: { min: 1635 }
      },
      {
        endingId: 'ending_pimp_lord',
        title: '烟花之主',
        mode: 'any',
        priority: 130,
        tickets: ['青楼暗股', '青楼靠山'],
        window: { min: 1635 }
      }
    ]
  }
]

export interface RouteDestinationView {
  endingId: string
  title: string
  matchedTickets: string[]
  status: RouteStatus
  statusLabel: string
  /** 此刻走注册表 check 是否成立；与引擎判定同一口径 */
  ready: boolean
  /** 年窗已开时还缺的硬条件（数值 / 门票），人话；训练期或年窗未开时为空 */
  gaps: string[]
  /** 身上带着与本格互斥的经历；以「搁笔·」开头的是玩家自己辞过的笔 */
  blockedBy: string[]
  /** 面板第二行：为什么还没落笔。空串表示此刻没什么可解释的 */
  detail: string
}

/**
 * 下一拍：这一格里最早还没凑齐票的那一格，缺哪些票。
 * 只报**看得见的经历票**，不报数值 —— 玩家能去做的事是"再去打一场仗"，不是"把武略刷到 50"。
 */
export interface RouteBeatHint {
  title: string
  mode: 'any' | 'all'
  missing: string[]
  status: RouteStatus
}

export interface ActiveRoute {
  key: string
  name: string
  motto: string
  heldTickets: string[]
  destinations: RouteDestinationView[]
  /** 路线链进度：已集齐门票的落点数 / 这一途的落点总数 */
  beatsDone: number
  beatsTotal: number
  /** 这一途里下一个还没走到的落点；走全了则为空 */
  nextBeat?: RouteBeatHint
}

/**
 * 尚未起步的命途：身上一票没有的那几途。
 * 第五十一轮之前它们**根本不在返回值里**，于是面板上永远只有"已经沾了边的路"，
 * 玩家看不见自己还有哪些路可走，也看不见下一拍该往哪迈步。
 */
export interface DormantRoute {
  key: string
  name: string
  motto: string
  /** 起步那一格与它要的票 */
  nextBeat: RouteBeatHint
  /** 这一途一共几拍 */
  beatsTotal: number
}

export type DangerLevel = 'cliff' | 'zero' | 'near'

export interface DangerRow {
  key: ZeroKey
  value: number
  level: DangerLevel
  label: string
  endingTitle: string
}

export interface EndingPreview {
  endingId: string
  title: string
  isThreshold: boolean
}

export interface RouteTrail {
  routes: ActiveRoute[]
  dormant: DormantRoute[]
  dangers: DangerRow[]
}

/** 与 useGameEngine 的 checkBoundary / 挂载路径同构；缺一个键就等于条件不满足 */
function buildCheckParams(character: Character, gameState: GameStateValues): BoundaryEventCheckParams {
  return {
    attributes: { ...character.attributes } as unknown as Record<string, number>,
    gameState: {
      圣眷: gameState.圣眷,
      中官: gameState.中官,
      清议: gameState.清议,
      士绅: gameState.士绅,
      民望: gameState.民望,
      国势: gameState.国势,
      turn: gameState.turn
    },
    hidden: { ...character.hidden } as unknown as Record<string, number>,
    faction: character.faction,
    flags: character.flags,
    currentYear: gameState.currentYear,
    currentMonth: gameState.currentMonth,
    // 命途面板必须与引擎同一份入参：少了年岁，《寿终正寝》这类年龄门在这里会
    // 永远显示成"差得远"，而引擎其实下个月就收人。
    characterAge: character.age
  }
}

function windowStatus(window: { min: number; max?: number }, turn: number, year: number): RouteStatus {
  if (turn < NARRATIVE_MIN_TURN) return 'training'
  if (year < window.min) return 'before'
  if (window.max !== undefined && year > window.max) return 'passed'
  return 'open'
}

function statusLabel(status: RouteStatus, window: { min: number; max?: number }, turn: number): string {
  if (status === 'training') {
    return `尚需 ${Math.max(0, NARRATIVE_MIN_TURN - turn)} 月`
  }
  if (status === 'before') return `${window.min} 年后`
  if (status === 'passed') return '年窗已过'
  return '尚缺条件'
}

function matchesTickets(spec: RouteDestinationSpec, held: Set<string>): string[] {
  if (spec.mode === 'all') {
    return spec.tickets.every(t => held.has(t)) ? [...spec.tickets] : []
  }
  return spec.tickets.filter(t => held.has(t))
}

interface UnmetExplanation {
  gaps: string[]
  blockedBy: string[]
  /** 条件里有 custom / random：不是数值或门票能解释的 */
  opaque: boolean
}

function scanRanges(
  obj: Record<string, { min?: number; max?: number } | undefined> | undefined,
  src: Record<string, number> | undefined,
  gaps: string[]
): void {
  if (!obj) return
  for (const key of Object.keys(obj)) {
    const range = obj[key]
    if (!range) continue
    const val = src?.[key] ?? 0
    const shown = Math.round(val)
    if (range.min !== undefined && val < range.min) gaps.push(`${key} ${shown}/${range.min}`)
    if (range.max !== undefined && val > range.max) gaps.push(`${key} ${shown}（需≤${range.max}）`)
  }
}

/**
 * 把"还差什么"翻译成人话。只读注册表里的条件，不另建一套门槛：
 * 年窗由 statusLabel 说（年代没到不能算"缺条件"），这里只列开放窗后仍挡路的东西。
 * `notHas` / `none` 单独归为"相冲" —— 它们不是还能补的缺口，是已经断掉的路。
 */
function explainUnmet(
  conditions: EventConditions | undefined,
  params: BoundaryEventCheckParams
): UnmetExplanation {
  const gaps: string[] = []
  const blockedBy: string[] = []
  let opaque = false
  if (!conditions) return { gaps, blockedBy, opaque }

  scanRanges(conditions.attributes, params.attributes, gaps)
  scanRanges(conditions.hidden, params.hidden, gaps)
  scanRanges(conditions.gameState, params.gameState, gaps)

  const flags = params.flags || []
  const f = conditions.flags
  if (f) {
    for (const x of f.has || []) if (!flags.includes(x)) gaps.push(`还缺「${x}」`)
    for (const x of f.all || []) if (!flags.includes(x)) gaps.push(`还缺「${x}」`)
    const anyList = f.any || f.some
    if (anyList && anyList.length > 0 && !anyList.some(x => flags.includes(x))) {
      gaps.push(`还缺其一：${anyList.slice(0, 2).join(' / ')}${anyList.length > 2 ? ' 等' : ''}`)
    }
    for (const x of f.notHas || []) if (flags.includes(x)) blockedBy.push(x)
    for (const x of f.none || []) if (flags.includes(x)) blockedBy.push(x)
  }

  if (conditions.month) {
    const cur = params.currentMonth
    if (typeof cur !== 'number') {
      gaps.push('月份未明')
    } else {
      if (conditions.month.min !== undefined && cur < conditions.month.min) gaps.push(`${conditions.month.min} 月后`)
      if (conditions.month.max !== undefined && cur > conditions.month.max) gaps.push('月份已过')
    }
  }

  if (conditions.age) {
    // 与顶栏「年方X岁」同一个说法：玩家看得见的量，缺口也才看得懂
    const cur = params.characterAge ?? 0
    if (conditions.age.min !== undefined && cur < conditions.age.min) {
      gaps.push(`年方 ${cur}（需 ${conditions.age.min} 岁）`)
    }
    if (conditions.age.max !== undefined && cur > conditions.age.max) {
      gaps.push(`年方 ${cur}（需 ≤${conditions.age.max} 岁）`)
    }
  }

  if (conditions.custom || typeof conditions.random === 'number') opaque = true
  return { gaps, blockedBy, opaque }
}

function buildDetail(status: RouteStatus, ready: boolean, ex: UnmetExplanation): string {
  // 年窗已过就只剩"这一页翻过去了"，再列门槛没有意义
  if (ready || status === 'passed') return ''
  // 互斥经历与年窗无关：门就算还没开，这条路也已经被自己走死了，得提前说
  if (status !== 'open' && ex.blockedBy.length === 0) return ''

  const parts: string[] = []
  const declined = ex.blockedBy.filter(x => x.startsWith('搁笔·'))
  const conflicted = ex.blockedBy.filter(x => !x.startsWith('搁笔·'))
  if (declined.length > 0) {
    const names = declined.map(x => x.replace(/^搁笔·/, '')).slice(0, 2)
    parts.push(`已搁笔：${names.join('、')}${declined.length > 2 ? ' 等' : ''}`)
  }
  if (conflicted.length > 0) {
    parts.push(`相冲：${conflicted.slice(0, 2).join('、')}${conflicted.length > 2 ? ' 等' : ''}`)
  }
  if (status === 'open' && ex.gaps.length > 0) {
    parts.push(`还缺：${ex.gaps.slice(0, 2).join(' · ')}${ex.gaps.length > 2 ? ' 等' : ''}`)
  }
  if (parts.length === 0) parts.push(ex.opaque ? '另有隐情' : '条件未明')
  return parts.join('；')
}

const DANGER_COPY: Record<ZeroKey, { endingTitle: string; warnAt: number }> = {
  财帛: { endingTitle: '倾家荡产', warnAt: 20 },
  体质: { endingTitle: '病逝任上', warnAt: 20 },
  圣眷: { endingTitle: '龙颜震怒', warnAt: 15 },
  中官: { endingTitle: '宦官构陷', warnAt: 15 },
  清议: { endingTitle: '士林唾弃', warnAt: 15 },
  士绅: { endingTitle: '乡绅反目', warnAt: 15 },
  民望: { endingTitle: '民怨沸腾', warnAt: 15 },
  道德值: { endingTitle: '众叛亲离', warnAt: 15 }
}

function dangerValue(
  key: ZeroKey,
  group: 'attributes' | 'gameState' | 'hidden',
  character: Character,
  gameState: GameStateValues
): number {
  const src =
    group === 'attributes'
      ? (character.attributes as unknown as Record<string, number>)
      : group === 'hidden'
        ? (character.hidden as unknown as Record<string, number>)
        : (gameState as unknown as Record<string, number>)
  return src[key] ?? 0
}

function collectDangers(character: Character, gameState: GameStateValues): DangerRow[] {
  const held = new Set(character.flags)
  return ZERO_THRESHOLDS.map((t, order) => {
    const value = dangerValue(t.key, t.group, character, gameState)
    const copy = DANGER_COPY[t.key]
    const warned = held.has(zeroWarnFlag(t.key))
    const level: DangerLevel = value <= 0 ? (warned ? 'cliff' : 'zero') : 'near'
    return {
      order,
      row: {
        key: t.key,
        value,
        level,
        label: level === 'cliff' ? '已在崖边' : level === 'zero' ? '归零·尚有警告' : '将尽',
        endingTitle: copy.endingTitle
      } satisfies DangerRow,
      warnAt: copy.warnAt
    }
  })
    .filter(x => x.row.value <= x.warnAt)
    .sort((a, b) => a.row.value - b.row.value || a.order - b.order)
    .slice(0, 3)
    .map(x => x.row)
}

/**
 * 落点闸门里**还能被后续事件摘掉**的 flag。
 *
 * 数据里只有三条：赈灾敛财／军需牟利／皮岛敛财，各自对应一场「事发」危机，
 * 玩家可以在那里退赃销案。其余的 notHas 全库没有任何 remove，写上去就是永久关门。
 * 这三个字不是随手抄的：`routeTrail.test.ts` 会扫描全部事件，把这份名单与真实数据对账。
 */
export const REVERSIBLE_ROUTE_BLOCKERS = new Set(['赈灾敛财', '军需牟利', '皮岛敛财'])

/**
 * 玩家主动交出去的命途门票（第四十七轮）。
 *
 * 目前只有《诸将劝进》c2「交出兵权」一处：它摘掉「掌军权」「拥兵自重」两张票，
 * 让问鼎之路当场关掉。这不是退赃那种"以后还能补回来"的闸门，而是这一拍的**代价本身**，
 * 所以不进 `REVERSIBLE_ROUTE_BLOCKERS`（那个集合只用于"选项新增 blocker 时是否提醒"）。
 * 测试拿它和全库 remove 数据对账：凡是摘掉 route 落点 blocker 的 remove，
 * 必须在这两份名单里出现过，不允许悄悄摘票。
 */
export const REVIEWED_ROUTE_TICKET_REMOVALS = new Set(['掌军权', '拥兵自重'])

function endingRegistry() {
  return new Map(
    Object.values(boundaryEventManager.getAll())
      .filter(b => b.type === 'ending')
      .map(b => [b.event.id, b])
  )
}

/**
 * 「此择将断了」—— 点下去之前就能看见的关门提醒（第四十三轮）。
 *
 * 生产口径 108 局（排除结局卡本身）：8610 月 / 21814 次抉择里，54 次选项真的
 * 关掉了玩家正在追的命途，占 0.25%；命中 41 局（38.0%），单局最多 2 次，
 * 每次只断一个落点。其中 36 次发生在年窗开启前 —— 玩家要等几年才看见
 * 「经历相冲」，那时已经改不回来了。按落点：清流殉道 41、流亡海外 8、诏狱冤死 5。
 *
 * 门票丢失在 108 局里一次也没撞上（皮岛清算本身没被跑到），但那是真实存在的
 * 关门路径：退赃拿走「皮岛敛财」，面板上的「海盗之王」就会消失。静态测试
 * 扫描全库 remove，把「摘票必须提醒」也钉住了。
 *
 * 关门有两种，都收在这里：
 *   1. 选项中了一个不可撤销的闸门（notHas / none）；
 *   2. 选项摘掉了最后一张门票 —— 退赃拿掉「皮岛敛财」时，面板上的「海盗之王」
 *      会直接消失。门票丢了，落点也就没了，和撞上闸门是同一件事。
 *
 * 四条边界：
 *   1. 只提醒**正在追**的落点（门票还齐）。没上这条路的选项不该来打扰；
 *   2. 已经相冲或年窗已过的落点不再提醒 —— 面板已经写着原因，重复一次没有信息；
 *   3. 闸门只认不可撤销的。可退赃的三条不算"断了"，玩家还有回头路；
 *   4. 门票丢了才算断：手里还剩别的票，落点就没关。
 *
 * 返回 choiceId → 将被断掉的落点标题。EventDisplay 只负责画，不再算一遍。
 */
export function findRouteClosures(
  choices: EventChoice[],
  character: Character,
  gameState: GameStateValues
): Map<string, string[]> {
  const held = new Set(character.flags)
  const registry = endingRegistry()
  const active: Array<{
    title: string
    mode: 'any' | 'all'
    tickets: string[]
    blockers: string[]
  }> = []

  for (const family of ROUTE_FAMILIES) {
    for (const spec of family.destinations) {
      if (!matchesTickets(spec, held).length) continue
      if (windowStatus(spec.window, gameState.turn, gameState.currentYear) === 'passed') continue
      const flags = registry.get(spec.endingId)?.event.conditions?.flags
      const blockers = [...(flags?.notHas ?? []), ...(flags?.none ?? [])]
      if (blockers.some(f => held.has(f))) continue
      active.push({ title: spec.title, mode: spec.mode, tickets: spec.tickets, blockers })
    }
  }

  const closures = new Map<string, string[]>()
  if (!active.length) return closures

  for (const choice of choices) {
    const added = new Set(choice.effects?.flags?.add ?? [])
    const removed = new Set(choice.effects?.flags?.remove ?? [])
    if (!added.size && !removed.size) continue

    const kept = (ticket: string) => added.has(ticket) || (held.has(ticket) && !removed.has(ticket))

    const titles: string[] = []
    for (const dest of active) {
      const hit = dest.blockers.filter(f => added.has(f))
      const closedByGate = hit.length > 0 && !hit.every(f => REVERSIBLE_ROUTE_BLOCKERS.has(f))
      const closedByTicket = dest.mode === 'all'
        ? !dest.tickets.every(kept)
        : !dest.tickets.some(kept)
      if (closedByGate || closedByTicket) titles.push(dest.title)
    }
    if (titles.length) closures.set(choice.id, titles)
  }
  return closures
}

/**
 * 走向：只看玩家身上已有的门票，不预测数值。
 * 每一途里按结局优先级排序（与 BoundaryEventManager 的结算顺序一致），
 * ready 则直接问注册表——所以"条件已足"不是这里另算的，是引擎说成立。
 *
 * 十三途二十六个落点**全部**出现在返回值里：沾过票的进 `routes`，一票没有的进 `dormant`。
 * 第五十一轮之前后者被整个 `continue` 掉了，面板于是只能显示"已经走上路的"那几途，
 * 玩家看不见自己还有哪些路、也看不见下一拍该往哪迈 —— 全量可见性靠这一刀补上。
 */
export function buildRouteTrail(character: Character, gameState: GameStateValues): RouteTrail {
  const held = new Set(character.flags)
  const params = buildCheckParams(character, gameState)
  const registry = endingRegistry()

  const routes: ActiveRoute[] = []
  const dormant: DormantRoute[] = []
  for (const family of ROUTE_FAMILIES) {
    const destinations: RouteDestinationView[] = []
    const unmatched: RouteBeatHint[] = []
    const heldTickets: string[] = []

    for (const spec of family.destinations) {
      const matched = matchesTickets(spec, held)
      const status = windowStatus(spec.window, gameState.turn, gameState.currentYear)
      const boundary = registry.get(spec.endingId)
      const ready = boundary ? boundary.check(params) : false
      const explanation = explainUnmet(boundary?.event.conditions, params)
      const declined = explanation.blockedBy.some(x => x.startsWith('搁笔·'))

      if (!matched.length) {
        unmatched.push({
          title: spec.title,
          mode: spec.mode,
          missing: spec.mode === 'all' ? spec.tickets.filter(t => !held.has(t)) : [...spec.tickets],
          status
        })
        continue
      }

      for (const t of matched) if (!heldTickets.includes(t)) heldTickets.push(t)
      destinations.push({
        endingId: spec.endingId,
        title: spec.title,
        matchedTickets: matched,
        status,
        statusLabel: ready
          ? '条件已足'
          : status === 'passed'
            ? '年窗已过'
            : declined
              ? '已搁笔'
              : explanation.blockedBy.length > 0
                ? '经历相冲'
                : statusLabel(status, spec.window, gameState.turn),
        ready,
        gaps: explanation.gaps,
        blockedBy: explanation.blockedBy,
        detail: buildDetail(status, ready, explanation)
      })
    }

    const nextBeat = unmatched[0]
    if (!destinations.length) {
      // 一格票都没有 ⇒ 上面每一格都进了 unmatched，起步那一格必然存在
      dormant.push({
        key: family.key,
        name: family.name,
        motto: family.motto,
        beatsTotal: family.destinations.length,
        nextBeat
      })
      continue
    }
    routes.push({
      key: family.key,
      name: family.name,
      motto: family.motto,
      heldTickets,
      destinations,
      beatsDone: destinations.length,
      beatsTotal: family.destinations.length,
      nextBeat
    })
  }

  routes.sort((a, b) => {
    const readyA = a.destinations.filter(d => d.ready).length
    const readyB = b.destinations.filter(d => d.ready).length
    if (readyA !== readyB) return readyB - readyA
    if (a.heldTickets.length !== b.heldTickets.length) return b.heldTickets.length - a.heldTickets.length
    return ROUTE_FAMILIES.findIndex(f => f.key === a.key) - ROUTE_FAMILIES.findIndex(f => f.key === b.key)
  })

  // 尚未起步的按"起步那一格的年窗"排：开得动的路排在还在训练 / 年代未到的前面
  dormant.sort((a, b) => {
    const openA = a.nextBeat.status === 'open' ? 0 : 1
    const openB = b.nextBeat.status === 'open' ? 0 : 1
    if (openA !== openB) return openA - openB
    return ROUTE_FAMILIES.findIndex(f => f.key === a.key) - ROUTE_FAMILIES.findIndex(f => f.key === b.key)
  })

  return { routes, dormant, dangers: collectDangers(character, gameState) }
}

/**
 * 此刻落笔会录哪一格 —— 直接调用引擎的结算函数，不复制条件。
 * 与引擎唯一的差别是这里不执行"史馆请笔"的跳过逻辑：
 * 那张卡就摆在桌上时，预览仍显示它本身，玩家才不会以为局面已经换了。
 */
export function previewEnding(character: Character, gameState: GameStateValues): EndingPreview | null {
  const boundary = boundaryEventManager.checkByType(buildCheckParams(character, gameState), 'ending')
  if (!boundary) return null
  const thresholdIds = Object.values(THRESHOLD_ENDING_BY_KEY)
  return {
    endingId: boundary.event.id,
    title: boundary.event.title,
    isThreshold: thresholdIds.includes(boundary.event.id)
  }
}
