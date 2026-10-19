/**
 * 「革职预警」临界事件 —— severity 3 的即时革职不再无声无息。
 *
 * 为什么要有这一张。`checkDemotion` 的判据表里有两条 severity 3：「道德败坏」与
 * 「贪墨被查」，命中即 `newIdentity:'exiled'` —— 引擎当场替玩家结案，摆上桌的是
 * 《罢黜归田》。第十九轮给「道德败坏」补过前置（它现在要求先收过「归零警告·道德值」），
 * 「贪墨被查」漏在外面没补。第二十四轮实测到这一条有多吃人：为《落草为寇》《亡命江湖》
 * 那两格量身造的画像（`tests/unit/helpers/simulate.ts` 的 bandit/vanish）**40 局里 34 局
 * 死在它手上**，局长平均 37 个月 —— 那两格要 道德≤20／≤30，而这条判据读的是
 * 财帛>70 ∧ 欲望>75 ∧ 道德<30：往"失德"那边走的人，一路捡钱、一路纵欲，
 * 正好一路走在它的枪口上。而屏幕上从头到尾没有一个字提过这件事。
 *
 * 所以这里补的是**通知**，不是**宽恕**：判据一个字没改，只是第一次撞线先当面说一次，
 * 并且给出四条都付得起的回天之路（散财／托人中官／干脆不认／弃官而逃）。第二个月还在那个
 * 状态里，吏部照样题本革职 —— 与八条归零死线同一个原则（`zeroWarningEvents.ts` 头部）。
 *
 * 第四条【连夜束装，弃官南还】另有一件事要办：《亡命江湖》(p127) 的三张票里，
 * `隐姓埋名`/`下落不明` 只由 `route_unknown_fate/c1` **成对**写下，而《不知所踪》(p117) 读的正是
 * 那一对、优先级又在这一格之前 —— 拿对的人永远先被 p117 接走；剩下唯一一张独立票
 * `潜逃` 全库只有 `historical_038/c3` 写，那是 1644 年城破 —— 那年《甲申国变》(p106) 排在前面。
 * 换句话说这一格在 1644 之前**没有一条自己能赢的路**。这条选项给它补了一个 1644 之前的产地，
 * 而且补在叙事最合该处：一个账被御史圈了、连夜把印信留在案上的人，本来就是要亡命的人。
 * 它把 财帛 一把打回 70 以下（行李只带一箱书），所以选了逃的人不会立刻被同一条判据革职。
 * 圣眷 那一笔给 −10，另外要求 圣眷≥12 才摆得上桌 —— 两笔都围着同一件事：《亡命江湖》要 圣眷≤15，
 * 而 圣眷 归零那条警告规则（`龙颜震怒`，p3）压在所有格子最上面。试过 −30，bandit/vanish 组
 * **立刻 0 人敢选**（画像一路把 圣眷 守在 15 以下，一选就进死线）；−10 配上 圣眷≥12 之后
 * 这一条在同一批里被 2 局选中（带 潜逃 的 seed6425／seed6431）。
 *
 * 年窗那一半，第二十五轮量出来是**上一轮自己骗了自己**：`wrapBatchAsBoundaryEvents` 对每一格都做
 * `minYear = max(NARRATIVE_MIN_YEAR, 声明值)`，而那个兜底值是 1635 —— 所以那次"1635→1630"从未生效过，
 * 数据里那个 1630 是装饰（现在按实生效值写回 1635，并新增一条静态对账用例钉住这类装饰）。
 * 真正卡住那两局的是另一件事：**弃官而逃之后，朝廷的机器还在按在任官员办他。**
 * 逐月抄表实测（`tests/unit/simulation.fugitive.test.ts`，40 局 · 3975 个月）这一格的门只开过 2 个月，
 * 两次都是《乱世浮沉》的成对票、两次都被《不知所踪》(p117) 抢先；而两个带 潜逃 的人
 * 数值门槛全都满足过（圣眷最低 8／0，道德最低 22／15，体质 85／58），却分别在年窗打开之前被
 * 《罢黜归田》与《龙颜震怒》收走 —— 死在考功与圣眷归零这两台朝廷机器上，而不是死在那道门外。
 * 所以本轮给 `潜逃` 这张票装上机械含义（见下面的 `FUGITIVE_FLAG`）：已经印信留案上的人，
 * 吏部撤不到，锦衣卫也围不住。《亡命江湖》那一格的数值门槛与年窗一个没动。
 *
 * 载体是 `BoundaryEvent`（`type:'crisis'`），因为要读的是**状态**而不是履历；
 * flag 由 `buildCorruptionWarningEvents()` 统一注入到每条选项上，与归零警告同一堵承重墙：
 * 漏写一条，这一格就退化成"撞线即革职"，而且退化得毫无声响。
 */
import { BoundaryEvent, BoundaryEventCheckParams } from '../types/boundaryEvent'
import { GameEvent } from '../types/event'

/** 第一次撞线写下的那张票 —— `checkDemotion` 的「贪墨被查」现在要求它 */
export const CORRUPTION_WARNING_FLAG = '革职预警·贪墨'

/**
 * 「已经弃职亡命」这张票。全库两个产地：本文件的【连夜束装，弃官南还】与
 * `historical_038/c3`（1644 城破时混在难民里出京）。
 *
 * 第二十五轮起它有了**机械含义**，不再只是图鉴上的一行字：
 *   - `checkDemotion` 对带上它的人整台考功机器停摆（革职撤不到一个已经把印信留在案上的人）；
 *   - `龙颜震怒`(p3) 对他不触发（锦衣卫围的是府邸，人早不在府邸）。
 * 这两条不是宽恕，是让"逃"这件事真的算逃 —— 否则弃官南还只是扣十点圣眷，
 * 玩家照样死在同一个衙门手里，那张 潜逃 票等于白给。
 * 两处判据都读这一个常量，别在两边各抄一遍字面量。
 */
export const FUGITIVE_FLAG = '潜逃'

/** 注册 id 与事件 id：事件 id 必须以 `boundary_` 开头，见 `checkBoundary` 顶上那道守卫 */
export const CORRUPTION_WARNING_REGISTRY_ID = 'warn_corruption'
export const CORRUPTION_WARNING_EVENT_ID = 'boundary_warn_corruption'
export const isCorruptionWarningRegistryId = (id: string) => id === CORRUPTION_WARNING_REGISTRY_ID

/**
 * 「贪墨被查」的三个阈值。导出来是因为判据写在两侧 ——
 * 这一侧决定警告什么时候当面开口，引擎那一侧决定革职什么时候落下。
 * 两处各写字面量的话，改一处就会得到"警告永不出现"或"警告出现也不放过"，
 * 两种都比原来更糟，而且都只在实际游玩里才看得出来。
 */
export const CORRUPTION_EXPOSURE = { 财帛: 70, 欲望值: 75, 道德值: 30 }

/**
 * 与 `useGameEngine.checkDemotion` 里那条 severity 3 判据**同口径**的合取。
 * 「太贪、太好色、已经失德」三者同时成立才算暴露 —— 缺一条都只是官声不好。
 */
export function isCorruptExposed(a: { 财帛: number; 欲望值: number; 道德值: number }): boolean {
  return a.财帛 > CORRUPTION_EXPOSURE.财帛 && a.欲望值 > CORRUPTION_EXPOSURE.欲望值 && a.道德值 < CORRUPTION_EXPOSURE.道德值
}

/** 判死线共用那份宽限期（`boundaryEvents.ts` 的 `THRESHOLD_ENDING_GRACE_TURNS`）同值 */
const GRACE_TURNS = 12

const EVENT: GameEvent = {
  id: CORRUPTION_WARNING_EVENT_ID,
  title: '风闻入告',
  description: '都察院的密考已经抄到御前，你名下那一栏写着"贪"字。',
  type: 'random',
  narrative: {
    speaker: { title: '监察御史', name: '同年周某' },
    quote: '兄台，这道题本是我替你压下的。压得了这一次，压不了第二次。',
    background:
      '散直那日，一位在同朝做御史的同年假意留你吃酒，席间把一张抄件推了过来。\n\n抄件是都察院风闻奏事的底稿。你的名字底下列着三行：任上置产若干、往来货赂若干、狎游某地某楼若干。数目都是估的，可估得极准。\n\n"御史风闻，不必实证。"他替你斟了杯，"如今你身上这三样，随便哪一样被人凑齐了写成题本，吏部就要改你的考语。"\n\n你想起自己这些年经手的银子，一笔一笔都还在账上。',
    situation: '酒已经淡了。他等你说一句"怎么办"。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '散财杜门，把那些"生意"断了',
      effects: {
        attributes: { 财帛: -30 },
        gameState: { 民望: 6 },
        hidden: { 欲望值: -25, 道德值: 10 }
      },
      result: {
        title: '却金谢客',
        tags: ['财帛-30', '民望+6', '欲望-25', '道德+10'],
        echo:
          '你连夜把门路清单烧了，退了三家商号的"节礼"，另把一柜当票寄回原主。\n\n那以后你一概只收俸银。同僚笑你忽然清了，属下小心了许多。都察院那张底稿没有递上去——风闻也要等一件新鲜事才再提得起。\n\n【此标记将作为"革职预警·贪墨"记在履历上：再有一次，吏部就要题本革职】'
      }
    },
    {
      id: 'c2',
      text: '割金托人，买一句好话',
      effects: {
        attributes: { 财帛: -35 },
        gameState: { 中官: 12, 圣眷: 8 },
        hidden: { 欲望值: 6, 道德值: -6 }
      },
      result: {
        title: '内援解围',
        tags: ['财帛-35', '中官+12', '圣眷+8', '道德-6'],
        echo:
          '银子进了司礼监某位长随的手，三日后宫里传出一句"某某官尚勤"。\n\n题本果然没上来。你也从此明白：这笔钱不是买平安，是买下一个把柄。\n\n【此标记将作为"革职预警·贪墨"记在履历上：再有一次，吏部就要题本革职】'
      }
    },
    {
      id: 'c3',
      text: '一概不认，照旧经手',
      effects: {
        attributes: { 财帛: 15 },
        gameState: { 清议: -10 },
        hidden: { 欲望值: 10, 道德值: -8 }
      },
      result: {
        title: '视若无睹',
        tags: ['财帛+15', '清议-10', '欲望+10', '道德-8'],
        echo:
          '你把抄件折起来放回案上："风闻之言，也值得这样郑重？"\n\n他起身走了，没再回头。账上的银子照旧进出，酒照旧喝。\n\n你只知道从今夜起，你的名字已经在某一份册子上被人用朱笔圈了一下。\n\n【此标记将作为"革职预警·贪墨"记在履历上：再有一次，吏部就要题本革职】'
      }
    },
    {
      id: 'c4',
      text: '连夜束装，弃官南还',
      // 两道门都是量出来的，不是装饰：
      // 体质 —— 那一格要求 体质≥25，跑不动的人谈不上亡命；
      // 圣眷 —— 一个 圣眷 已经见底的人夜里上船，天亮就被锦衣卫拿住了；更要紧的是 圣眷 归零那条
      // 警告规则（`龙颜震怒`，p3）压在所有格子最上面，少了这一下限，这一条就成了专门给
      // "最够格亡命的人"准备的自杀按钮。同一个道理见 `route_unknown_fate/c2`【出逃海外】要 财帛≥30。
      showConditions: { attributes: { 体质: { min: 25 } }, gameState: { 圣眷: { min: 12 } } },
      description: '行李只带一箱书，印信留在案上',
      effects: {
        attributes: { 财帛: -70 },
        gameState: { 圣眷: -10, 清议: -15 },
        hidden: { 欲望值: -30, 野心值: -10 },
        flags: { add: [FUGITIVE_FLAG] }
      },
      result: {
        title: '挂冠而遁',
        tags: ['潜逃', '财帛-70', '圣眷-10', '清议-15'],
        echo:
          '二更天，你换了一身布衣，从南门上船。案上留着印信，手里只多了一箱书。\n\n天明时衙役上门，只看见一封未署名的禀帖。都察院那道题本改了一行字："某官病免，不知踪由。"\n\n从此你在江南七个府县用过九个名字。没有人再来查你的账——要查的人已经不记得你的官衔了。\n\n【获得标记：潜逃 — 此标记将引导 ending_fugitive 结局】\n\n【此标记将作为"革职预警·贪墨"记在履历上：再有一次，吏部就要题本革职】'
      }
    }
  ]
}

/**
 * 每条选项都必须写下那张票 —— 与 `buildZeroWarningEvents` 同一条理由，
 * 所以在这里统一注入而不写在内容里。
 */
export function buildCorruptionWarningEvents(): BoundaryEvent[] {
  return [
    {
      id: CORRUPTION_WARNING_REGISTRY_ID,
      priority: 19,
      type: 'crisis',
      check: (params: BoundaryEventCheckParams) => {
        if ((params.gameState?.turn ?? 0) < GRACE_TURNS) return false
        if (params.flags?.includes(CORRUPTION_WARNING_FLAG)) return false
        const a = params.attributes
        const h = params.hidden
        return isCorruptExposed({
          财帛: a?.['财帛'] ?? 0,
          欲望值: h?.['欲望值'] ?? 0,
          道德值: h?.['道德值'] ?? 100
        })
      },
      event: {
        ...EVENT,
        choices: EVENT.choices.map(c => ({
          ...c,
          effects: {
            ...c.effects,
            flags: {
              ...(c.effects.flags || {}),
              add: [...((c.effects.flags?.add as string[]) || []), CORRUPTION_WARNING_FLAG]
            }
          }
        }))
      }
    }
  ]
}

export const corruptionWarningEvents: BoundaryEvent[] = buildCorruptionWarningEvents()
