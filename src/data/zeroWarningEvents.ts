/**
 * 「归零警告」临界事件 —— 八条判死维度的第一次归零不再当场收尾。
 *
 * 为什么要有这一层。`boundaryEvents.ts` 里那八条 `pastGrace()` 死线原本是
 * 「turn≥12 之后任一维度 = 0 就立刻结束」。整局模拟器实测到的后果是：
 *   · 守成玩法（随机避开「能直接收尾」的选项）里 3/4 局**恰好死在第 13 个月**，
 *     死因全是中官归零 —— 因为开局中官只有 15~40，而宽限期内归零不判死，
 *     于是玩家在 0 值上又走了十几个月，第 13 个月一到就被一颗早就埋好的雷炸死；
 *   · 一整局只碰得到 31/402 个事件、1~2 个结局。43 个结局里 41 个普通人一辈子见不到。
 * 换句话说：不是内容不够，是**内容够不着**；而"够不着"的直接原因是归零既无声、又无解。
 *
 * 这一层改的是那两点：
 *   1. 无声 → 归零后（每次推进月份 30% 概率）触发一条专属危机事件，把「你已经一文不名 /
 *      已经众叛亲离」明确打在屏幕上，玩家看得见自己站在崖边。
 *   2. 无解 → 事件给三条回天之路（花钱、搭人情、硬扛），每条都能把该维拉回正值，
 *      并写下 `归零警告·X` 这个 flag。八条死线的判死条件改为「归零 **且已被警告过**」，
 *      于是规则变成清清楚楚的一句话：**同一个维度，归零两次才要命。**
 *
 * 为什么走 crisis 而不是新造一套机制：`serious_illness`（病体支离那一类）已经在用
 * `type:'crisis'` + `checkByType(params,'crisis')` 这条通路，引擎的
 * `checkBoundary` 与挂载 effect 两边都已接好，加类型只会让求值器再多分一支。
 *
 * 三条口径上的注意：
 *   · 每条选项都会写 flag，包括"硬扛"那条 —— 警告的作用是"知道"，不是"必须救回来"；
 *     选了杯水车薪的补益，下次归零照样死。
 *   · 判据读的是 `params.gameState/attributes/hidden`，与八条死线**同一份取值口径**
 *     （缺键视为"不触发"，与原先 `undefined <= 0 === false` 的行为一致）。
 *   · flag 由本模块写、只被本模块的 check 读，不经过事件条件表；
 *     `audit-flag-reachability.ts` 会把它们记成"白存 flag"，那是口径盲区不是缺陷。
 */
import type { BoundaryEvent, BoundaryEventCheckParams } from '../types/boundaryEvent'
import type { GameEvent } from '../types/event'

export type ThresholdGroup = 'attributes' | 'gameState' | 'hidden'

export interface ThresholdSpec {
  key: string
  group: ThresholdGroup
}

/** 八条死线，顺序与 boundaryEvents 里那批 check 一致 */
export const ZERO_THRESHOLDS = [
  { key: '财帛', group: 'attributes' },
  { key: '体质', group: 'attributes' },
  { key: '圣眷', group: 'gameState' },
  { key: '中官', group: 'gameState' },
  { key: '清议', group: 'gameState' },
  { key: '士绅', group: 'gameState' },
  { key: '民望', group: 'gameState' },
  { key: '道德值', group: 'hidden' }
] as const satisfies readonly ThresholdSpec[]

/**
 * 八个维度键名的字面量类型。
 * 做成字面量联合是有原因的：boundaryEvents 里那八条 check 用字符串点名维度，
 * 一旦写错（"清意"），`src[key]` 取到 undefined，判据恒 false，
 * 结局就此静默消失 —— 这正是第九轮值域体检在事件数据里查的那类毛病，
 * 现在轮到边界规则自己，所以用类型而不是脚本来钉。
 */
export type ZeroKey = (typeof ZERO_THRESHOLDS)[number]['key']

const SPEC_BY_KEY = new Map<string, ThresholdSpec>(ZERO_THRESHOLDS.map(t => [t.key, t]))

export function specOf(key: ZeroKey): ThresholdSpec {
  const t = SPEC_BY_KEY.get(key)
  if (!t) throw new Error(`归零维度未注册：${key}`)
  return t
}

export const zeroWarnFlag = (key: string) => `归零警告·${key}`

/** 与死线 check 同口径地取一个阈值维度的当前值；取不到就返回 null（视为不触发） */
function thresholdValue(params: BoundaryEventCheckParams, t: ThresholdSpec): number | null {
  const src =
    t.group === 'attributes' ? params.attributes : t.group === 'gameState' ? params.gameState : params.hidden
  const v = src?.[t.key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 这一维已经归零（不含宽限期判定，由调用方决定） */
export function isZeroed(params: BoundaryEventCheckParams, t: ThresholdSpec): boolean {
  const v = thresholdValue(params, t)
  return v !== null && v <= 0
}

/** 这一维曾经被警告过 —— 八条死线现在都要求它为真 */
export function wasWarned(params: BoundaryEventCheckParams, t: ThresholdSpec): boolean {
  return !!params.flags?.includes(zeroWarnFlag(t.key))
}

/**
 * 八条判死线的共用判据：**归零 且 已经警告过**。
 * boundaryEvents 那边只调这一个函数，键名写错会在类型上直接报错（见 ZeroKey）。
 */
export function isFatalZero(params: BoundaryEventCheckParams, key: ZeroKey): boolean {
  const t = specOf(key)
  return isZeroed(params, t) && wasWarned(params, t)
}

interface WarningChoiceSpec {
  id: string
  text: string
  effects: GameEvent['choices'][number]['effects']
  result: GameEvent['choices'][number]['result']
}

interface WarningSpec extends ThresholdSpec {
  key: ZeroKey
  priority: number
  title: string
  description: string
  narrative: GameEvent['narrative']
  choices: WarningChoiceSpec[]
}

/**
 * 八条警告的内容。
 * 共同形状：一条"用别的东西换这一维"的路、一条"花钱"的路、一条"少拿一点但代价最小"的路。
 * 没有一条是白拿 —— 归零本来就该有代价，只是不再直接要命。
 */
const WARNINGS: WarningSpec[] = [
  {
    key: '财帛',
    group: 'attributes',
    priority: 11,
    title: '囊橐萧然',
    description: '俸银早尽，库子催促，连幕友的束脩都拖欠了三个月。',
    narrative: {
      speaker: { title: '老仆', name: '福伯' },
      quote: '老爷，米缸见了底。当票摞起来比官印还厚，这月实在当不出了。',
      background:
        '账房上的先生撂了挑子，走时把算盘珠拨得震天响。\n\n七品官的俸银看着有数，可冰敬、炭敬、幕脩、驿马、上官的寿礼，哪一样不是从这一点俸里出。\n\n如今库里比脸还干净，而催征的文移明天就到。',
      situation: '囊橐萧然，下一步怎么走？'
    },
    choices: [
      {
        id: 'c1',
        text: '挪移库金，先补眼前的窟窿',
        effects: {
          attributes: { 财帛: 35 },
          gameState: { 民望: -10, 士绅: -10 },
          hidden: { 道德值: -12 }
        },
        result: {
          title: '挖了东墙',
          tags: ['财帛+35', '民望-10', '士绅-10', '道德-12'],
          echo:
            '库子上的银子过了你的手，账面平了，心里的账却从此不平。\n\n胥吏们看得分明：大人也会挪。往后征钱粮时"火耗"多收那三分，再没人来回话了。'
        }
      },
      {
        id: 'c2',
        text: '修书向山西商人借贷',
        effects: { attributes: { 财帛: 30, 体质: -5 }, gameState: { 士绅: -8 } },
        result: {
          title: '称贷于商',
          tags: ['财帛+30', '体质-5', '士绅-8'],
          echo:
            '银票到手那夜你一夜没睡稳。盐商不要利钱，要的是"日后方便"四个字。\n\n地方上的士绅听说官儿靠商人周转，拜帖渐渐少了——他们算得清楚，这人是欠了人家的。'
        }
      },
      {
        id: 'c3',
        text: '罢舆马、省厨传，粗粝自持',
        effects: { attributes: { 财帛: 12, 体质: -8 }, gameState: { 民望: 6 }, hidden: { 道德值: 8 } },
        result: {
          title: '咬得菜根',
          tags: ['财帛+12', '体质-8', '民望+6', '道德+8'],
          echo:
            '你把仪仗减了大半，一日两餐粥菜。轿夫改为步行，衙门里传出"大人清苦"的话。\n\n银钱是省下了些，身子先撑不住；而百姓不论这些，只论你还肯不肯替他们说话。'
        }
      }
    ]
  },
  {
    key: '体质',
    group: 'attributes',
    priority: 12,
    title: '病体支离',
    description: '咳血染了袖角，太医说"再如此，恐不起"。',
    narrative: {
      speaker: { title: '太医', name: '薛太医' },
      quote: '大人，脉象如操梯。官身是别人的，这条命是自己的。',
      background:
        '三更批完最后一件稿，你才发现砚台里的水结了冰。\n\n烛影里自己的影子瘦得认不出：这几年透支得太狠，如今五脏都在算总账。',
      situation: '病体支离，怎么处置？'
    },
    choices: [
      {
        id: 'c1',
        text: '吞下参汤，撑到任满',
        effects: { attributes: { 体质: 8, 理政: 10, 财帛: -12 }, hidden: { 欲望值: 8 } },
        result: {
          title: '硬撑官身',
          tags: ['体质+8', '理政+10', '财帛-12', '欲望+8'],
          echo:
            '你把太医的建议压在公文底下，靠浓参汤吊着办完了秋防。\n\n上官考语里多了"实心任事"四个字，你自己知道：这是拿寿数换的。'
        }
      },
      {
        id: 'c2',
        text: '具疏告假，闭门养病',
        effects: { attributes: { 体质: 28, 文韬: 5 }, gameState: { 圣眷: -12 } },
        result: {
          title: '予告还山',
          tags: ['体质+28', '文韬+5', '圣眷-12'],
          echo:
            '准假的批红下来，你当日就移居城外寺中，读了一个月的《通鉴》。\n\n身体好了七成，只是御前再提不起你——官场上"养病"两个字，往往是淡出的委婉说法。'
        }
      },
      {
        id: 'c3',
        text: '重聘名医，割一程病根',
        effects: { attributes: { 体质: 22, 财帛: -30 }, hidden: { 道德值: -3 } },
        result: {
          title: '延和立方',
          tags: ['体质+22', '财帛-30'],
          echo:
            '你典了两箱书，请来一位专治虚劳的老医。百日汤药下去，晨起居然能缓行半里。\n\n病去了一半，底子却从此娇了：稍遇劳倦，胸口就发紧。'
        }
      }
    ]
  },
  {
    key: '圣眷',
    group: 'gameState',
    priority: 13,
    title: '天颜不怿',
    description: '召对时御座上一声不响，奏对三本，全留中不发。',
    narrative: {
      speaker: { title: '传旨太监', name: '高太监' },
      quote: '大人，万岁爷今日乏了。您这话……奴才不敢替您传。',
      background:
        '平台召对，你跪了半个时辰，起来时膝盖发麻。\n\n最难受的不是被申饬——是皇上已经不打算申饬你了。'
      ,
      situation: '恩眷已衰，如何自处？'
    },
    choices: [
      {
        id: 'c1',
        text: '抗疏自辩，把话说透',
        effects: { gameState: { 圣眷: 18, 清议: 10, 中官: -10 }, hidden: { 野心值: 6 } },
        result: {
          title: '一疏动天听',
          tags: ['圣眷+18', '清议+10', '中官-10'],
          echo:
            '你连夜写就八千言，从本官职掌一直说到祖宗养士之意，直送御前。\n\n据说皇上读了两遍。疏上后三日，那几本"留中"的奏章忽然发了；只是内廷有人记下了你的名字。'
        }
      },
      {
        id: 'c2',
        text: '重结近侍，替自己在跟前递话',
        effects: { gameState: { 圣眷: 25, 中官: 10 }, attributes: { 财帛: -25 }, hidden: { 道德值: -8 } },
        result: {
          title: '中涓之美',
          tags: ['圣眷+25', '中官+10', '财帛-25', '道德-8'],
          echo:
            '几份"土仪"送进乾清宫外面那几间值房，话就一层层递了上去。\n\n再召对时，皇上语气竟松了半寸。你心里清楚：这半寸，是别人替你买来的。'
        }
      },
      {
        id: 'c3',
        text: '杜门省躬，一言不辨',
        effects: { gameState: { 圣眷: 6 }, attributes: { 文韬: 8 }, hidden: { 道德值: 10 } },
        result: {
          title: '闭阁思过',
          tags: ['圣眷+6', '文韬+8', '道德+10'],
          echo:
            '你上了了一道"候勘"的自检疏，随后谢客读书，任同僚怎么暗示都不出一语。\n\n朝里有人说你"有量"。恩眷没回多少，声望倒厚了一层——只是厚得安静，看不见用处。'
        }
      }
    ]
  },
  {
    key: '中官',
    group: 'gameState',
    priority: 14,
    title: '内援已断',
    description: '司礼监的茶你没脸再喝——宫里没人肯接你的帖子。',
    narrative: {
      speaker: { title: '门生', name: '沈编修' },
      quote: '老师，如今外廷的话要进宫里，得有人肯替您拿。这样的人，您还有吗？',
      background:
        '一次大典，你在班次里站了两个时辰，无一个内侍向你施礼。\n\n这不算祸。祸的是：往后再有构陷你的话头递到御前，没有一个人会替你说一句"未必有这事"。'
      ,
      situation: '禁城之内形同孤立，怎么走？'
    },
    choices: [
      {
        id: 'c1',
        text: '折节往来，与内里结个好',
        effects: { gameState: { 中官: 28, 清议: -18 }, hidden: { 道德值: -12 } },
        result: {
          title: '结纳禁近',
          tags: ['中官+28', '清议-18', '道德-12'],
          echo:
            '你开始往司礼监送节礼，收了他们几方帕子作回赐。宫里的话说得上几句了。\n\n御史房的同僚看你的眼神变了——"东林"这两个字，从此与你无干。'
        }
      },
      {
        id: 'c2',
        text: '不走宫门，走言路',
        effects: { gameState: { 中官: 6, 清议: 18 }, hidden: { 道德值: 8 } },
        result: {
          title: '以舆论为内援',
          tags: ['中官+6', '清议+18', '道德+8'],
          echo:
            '你把话交给几个敢言的少年御史，风闻奏事，一笔笔都从外面砸进去。\n\n宫里对你的敬意少了些，但从此动你要掂量：你身后有一堆眼睛。这是另一种内援，只是不体面也不牢靠。'
        }
      },
      {
        id: 'c3',
        text: '进献方物，先通了门再说',
        effects: { gameState: { 中官: 18 }, attributes: { 财帛: -25 }, hidden: { 欲望值: 5 } },
        result: {
          title: '苞苴之行',
          tags: ['中官+18', '财帛-25', '欲望+5'],
          echo:
            '江南的缎、闽中的糖、几部新刻的书，一担担进了宫门。管事太监笑着收下，从此喊你"大人"是带着热度的。\n\n银子去了，路通了。你开始习惯这件事，这才是最要命的地方。'
        }
      }
    ]
  },
  {
    key: '清议',
    group: 'gameState',
    priority: 15,
    title: '物议沸腾',
    description: '书院不讲你的事，会馆不收你的帖，京师的说部换了口风。',
    narrative: {
      speaker: { title: '同年', name: '周侍御' },
      quote: '足下如今是"可议之官"。茶肆里说你的，比说阉党的还热闹。',
      background:
        '你才除了一桩事，转头又一桩事：有人把你的旧稿掐头去尾传抄，说你在任上如何如何。\n\n士林定罪不用三法司，只用一支笔；而这一次，笔不在你手里。'
      ,
      situation: '风声不好，怎么挽回？'
    },
    choices: [
      {
        id: 'c1',
        text: '刊书自讼，把始末写给人看',
        effects: { gameState: { 清议: 22 }, attributes: { 财帛: -15, 文韬: 8 } },
        result: {
          title: '著书辨诬',
          tags: ['清议+22', '财帛-15', '文韬+8'],
          echo:
            '你刻了一本《在官录》，逐条附文书、日期、经手人，褒贬一辞不置。\n\n书卖得动。半年后茶肆里的版本终于有了两个说法，你至少不再是唯一一个错的人。'
        }
      },
      {
        id: 'c2',
        text: '反守为攻，具章劾那几个权阉',
        effects: { gameState: { 清议: 30, 中官: -18 }, hidden: { 道德值: 10, 野心值: 8 } },
        result: {
          title: '一劾翻身',
          tags: ['清议+30', '中官-18', '道德+10', '野心+8'],
          echo:
            '疏文夜里誊出，五更封进会极门。朝上有人替你念，有人替你笑。\n\n名声回来了，宫里的路断了。你自己选的：这一笔赌的是"后世"两个字。'
        }
      },
      {
        id: 'c3',
        text: '谢客抄书，等这阵风过去',
        effects: { gameState: { 清议: 8, 圣眷: -6 }, hidden: { 道德值: 5 } },
        result: {
          title: '杜门自守',
          tags: ['清议+8', '圣眷-6', '道德+5'],
          echo:
            '你连写三封"不敏"的回信，把请酒的帖子一概退回。\n\n议论确实会老。只是老去的这半年里，御前也没人再提起你——风过去了，你也跟着过去了。'
        }
      }
    ]
  },
  {
    key: '士绅',
    group: 'gameState',
    priority: 16,
    title: '乡里怨望',
    description: '县学明伦堂聚饮，说的是你；城隍庙说书，说的还是你。',
    narrative: {
      speaker: { title: '族长', name: '赵老人' },
      quote: '青天不青，只缘不识本地乡绅。大人，一县的公事离了我们，办不动。',
      background:
        '催科之令下到各图，粮长们连夜聚会；你幕宾的亲哥哥也在席上。\n\n第二日，城内三家典当一齐抬高了钱价的牌价——这已是明着给你看颜色。'
      ,
      situation: '地方上不肯与你合作，如何措手？'
    },
    choices: [
      {
        id: 'c1',
        text: '请减免本县赋役，让利于乡里',
        effects: { gameState: { 士绅: 25, 民望: 12, 圣眷: -8 }, attributes: { 财帛: -20 } },
        result: {
          title: '与地方休息',
          tags: ['士绅+25', '民望+12', '圣眷-8', '财帛-20'],
          echo:
            '你题请减本县均徭银三千两，自己先把任内加征的部分剔还。\n\n城里的颜色改了，席上也请你上座。户部那头的考语则冷了一行——短收的三千两总要有人赔。'
        }
      },
      {
        id: 'c2',
        text: '严拿抗粮之户，立威为先',
        effects: { gameState: { 士绅: 8, 民望: -22 }, hidden: { 道德值: -10 } },
        result: {
          title: '以刑摧科',
          tags: ['士绅+8', '民望-22', '道德-10'],
          echo:
            '三个粮长被拖到甬上杖责，钱粮当月扫数补足。\n\n大户们怕了你，也恨了你；小户不恨你——他们只是从此不敢再喊你"青天"。'
        }
      },
      {
        id: 'c3',
        text: '延聘名儒修县志，把话头引到文事上',
        effects: { gameState: { 士绅: 20, 清议: 8 }, attributes: { 财帛: -15 } },
        result: {
          title: '修志和众',
          tags: ['士绅+20', '清议+8', '财帛-15'],
          echo:
            '你出俸延了两位宿儒，开局于明伦堂，请各家子弟分任校订。\n\n怨气有了去处，士绅们忙着争凡例、争列传，一时倒忘了和你置气。书局成了，本县文风也活了一层。'
        }
      }
    ]
  },
  {
    key: '民望',
    group: 'gameState',
    priority: 17,
    title: '口碑大坏',
    description: '乡里传歌："官如虎，吏如狼。"——唱的是你的衙门。',
    narrative: {
      speaker: { title: '耆老', name: '孙老头' },
      quote: '大人，民谣不是罪，可民谣也不会无缘无故就长了腿。',
      background:
        '漕河边有人聚众拦船告状，被差役驱散；三日后这话就编成了四句韵文，传到邻县。\n\n你叫来户房查案底，案底上写着："该役系某衙门禁子，病故。"——你信与不信，百姓已先替你定了。'
      ,
      situation: '民怨已形，如何下手？'
    },
    choices: [
      {
        id: 'c1',
        text: '亲提狱案，平反冤狱',
        effects: { gameState: { 民望: 28, 圣眷: -6 }, attributes: { 财帛: -15, 理政: 8 } },
        result: {
          title: '一平众冤',
          tags: ['民望+28', '圣眷-6', '财帛-15', '理政+8'],
          echo:
            '你调出积年疑狱十二件，三个月里亲自问供，放了七个人，杖了三个胥吏。\n\n街上那首歌换了末句。上官怪你"发前官之隐"——你为百姓做的事，得由别人的脸面来买。'
        }
      },
      {
        id: 'c2',
        text: '开仓平粜，先救眼前性命',
        effects: { gameState: { 民望: 35, 士绅: -15 }, attributes: { 财帛: -30 } },
        result: {
          title: '振济活人',
          tags: ['民望+35', '士绅-15', '财帛-30'],
          echo:
            '常平仓的米按本钱粜出，日活千人。大户们囤的米跌了价，当夜就有人递揭帖告你"擅自发仓"。\n\n百姓称你再生父母；这四个字在考语上换不来任何分数。'
        }
      },
      {
        id: 'c3',
        text: '清核胥吏，把衙门口的毒先剜掉',
        effects: { gameState: { 民望: 15, 清议: 6 }, hidden: { 道德值: 8 } },
        result: {
          title: '汰役清衙',
          tags: ['民望+15', '清议+6', '道德+8'],
          echo:
            '你删差役名额一百三十人，把挂名吃粮的一概革去，立木架于仪门外，许民间指告。\n\n衙门里骂你断人财路，衙门外那口气松了。你两头都没落好，只是夜里听得见街上的声音了。'
        }
      }
    ]
  },
  {
    key: '道德值',
    group: 'hidden',
    priority: 18,
    title: '本心蒙尘',
    description: '镜中那个人，你已认不出眉眼。',
    narrative: {
      speaker: { title: '镜中人', name: '少年时的你' },
      quote: '你说过不当这样的官。',
      background:
        '这半年你替人遮掩了两桩事，收了三份礼，改了四次供状。都是不得已，都算得清。\n\n今日卸帽对镜，忽然想不起上一次夜里睡得踏实是哪一夜。'
      ,
      situation: '良心开始讨账，你怎么办？'
    },
    choices: [
      {
        id: 'c1',
        text: '乞归守墓，先把自己洗一遍',
        effects: { hidden: { 道德值: 25, 欲望值: -10 }, gameState: { 圣眷: -12 }, attributes: { 财帛: -10 } },
        result: {
          title: '请告归茔',
          tags: ['道德+25', '圣眷-12', '财帛-10', '欲望-10'],
          echo:
            '你上了终养疏，回籍守墓。筑了三间土屋，日读《孝经》，不受有司一菜一果。\n\n朝中恩眷冷了，夜里却睡得着了。这一年你三十九，重新认得了"不欠人"三个字怎么写。'
        }
      },
      {
        id: 'c2',
        text: '焚掉平日密禀，断了自己那条歪路',
        effects: { hidden: { 道德值: 18, 欲望值: -12 }, gameState: { 中官: -8 } },
        result: {
          title: '焚箴自誓',
          tags: ['道德+18', '中官-8', '欲望-12'],
          echo:
            '那些替人递话的稿子、写着某公短长的私簿，你堆在庭中一把火烧了。\n\n内里知道了，说你"忘旧"。你少了条路，倒也少了副枷——从此有人拿火劝你时，你答不上来。'
        }
      },
      {
        id: 'c3',
        text: '做一件不问回报的善政',
        effects: { hidden: { 道德值: 20, 野心值: -5 }, gameState: { 民望: 12 }, attributes: { 财帛: -15 } },
        result: {
          title: '一事利人',
          tags: ['道德+20', '民望+12', '财帛-15', '野心-5'],
          echo:
            '你出俸修了那座塌了三年的石桥，不报工部、不请赏、不刻碑。\n\n桥成那日一个卖菜的老妇人朝你作了个揖。回衙的路上，你脊背直了些——原来这件事不难。'
        }
      }
    ]
  }
]

/**
 * 由内容表生成八条 crisis 边界事件。
 * `flags.add` 在这里统一注入而不是写在每条内容里：
 * "任何一条警告选项都必须写下 flag"是这一层的承重墙 —— 漏了某一条，
 * 那一维就退化成"归零即死"，而且漏得毫无声响。
 */
export function buildZeroWarningEvents(): BoundaryEvent[] {
  return WARNINGS.map(spec => {
    const flag = zeroWarnFlag(spec.key)
    const event: GameEvent = {
      id: `boundary_warn_${spec.key}`,
      title: spec.title,
      description: spec.description,
      narrative: spec.narrative,
      conditions: {},
      type: 'random',
      choices: spec.choices.map(choice => ({
        ...choice,
        effects: {
          ...choice.effects,
          flags: { ...(choice.effects.flags || {}), add: [...((choice.effects.flags?.add as string[]) || []), flag] }
        }
      }))
    }
    return {
      id: `warn_zero_${spec.key}`,
      priority: spec.priority,
      type: 'crisis',
      check: (params: BoundaryEventCheckParams) =>
        isZeroed(params, spec) && !wasWarned(params, spec),
      event
    }
  })
}

/** 供 boundaryEvents 直接 append；也是"死线要见过警告才收尾"那八条 check 的判据来源 */
export const zeroWarningEvents: BoundaryEvent[] = buildZeroWarningEvents()
