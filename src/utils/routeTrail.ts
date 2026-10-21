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
 * 十二个命途。门票全部抄自对应结局的 conditions.flags，
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
        window: { min: 1638, max: 1660 }
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
        mode: 'any',
        priority: 104,
        tickets: ['贰臣', '掌军权'],
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
        tickets: ['南渡长江'],
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
}

export interface ActiveRoute {
  key: string
  name: string
  motto: string
  heldTickets: string[]
  destinations: RouteDestinationView[]
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
    currentMonth: gameState.currentMonth
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
 * 走向：只看玩家身上已有的门票，不预测数值。
 * 每一途里按结局优先级排序（与 BoundaryEventManager 的结算顺序一致），
 * ready 则直接问注册表——所以"条件已足"不是这里另算的，是引擎说成立。
 */
export function buildRouteTrail(character: Character, gameState: GameStateValues): RouteTrail {
  const held = new Set(character.flags)
  const params = buildCheckParams(character, gameState)
  const registry = new Map(
    Object.values(boundaryEventManager.getAll())
      .filter(b => b.type === 'ending')
      .map(b => [b.event.id, b])
  )

  const routes: ActiveRoute[] = []
  for (const family of ROUTE_FAMILIES) {
    const destinations: RouteDestinationView[] = []
    const heldTickets: string[] = []

    for (const spec of family.destinations) {
      const matched = matchesTickets(spec, held)
      if (!matched.length) continue
      for (const t of matched) if (!heldTickets.includes(t)) heldTickets.push(t)

      const status = windowStatus(spec.window, gameState.turn, gameState.currentYear)
      const boundary = registry.get(spec.endingId)
      const ready = boundary ? boundary.check(params) : false
      destinations.push({
        endingId: spec.endingId,
        title: spec.title,
        matchedTickets: matched,
        status,
        statusLabel: ready ? '条件已足' : statusLabel(status, spec.window, gameState.turn),
        ready
      })
    }

    if (!destinations.length) continue
    routes.push({
      key: family.key,
      name: family.name,
      motto: family.motto,
      heldTickets,
      destinations
    })
  }

  routes.sort((a, b) => {
    const readyA = a.destinations.filter(d => d.ready).length
    const readyB = b.destinations.filter(d => d.ready).length
    if (readyA !== readyB) return readyB - readyA
    if (a.heldTickets.length !== b.heldTickets.length) return b.heldTickets.length - a.heldTickets.length
    return ROUTE_FAMILIES.findIndex(f => f.key === a.key) - ROUTE_FAMILIES.findIndex(f => f.key === b.key)
  })

  return { routes, dangers: collectDangers(character, gameState) }
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
