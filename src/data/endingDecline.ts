/**
 * 「史馆请笔」—— 善终结局不再自动把一局收走，改成玩家自己决定何时盖棺。
 *
 * 为什么要有这一层（§1.4 ⑬，第十八轮实测）。把「1635 水坝」拆掉之后，400 局取样里
 * 终局最集中的年份变成了 1640，而证据比"集中在某一年"更难看：
 * **善终局全部落在某条年窗开放的那一个月**（1640 = 第 145 月，1638 = 第 121 月）。
 * 原因是这些结局的判定读的是**状态**：财帛≥90、道德≥80、清议≥70 一旦凑齐就恒真，
 * 于是窗口一开的第一次月份推进立刻命中 —— 玩家什么都没选，游戏替他结了案。
 * 后果是甲申国变、城破殉城、南渡续祚、称臣纳贡、东林烈士这一整段 1644 正戏
 * 一次都没播出来（2026-10-17 复测：0/200 局活到 1644）。
 *
 * 为什么不用"必须先致仕才给善终"去闸（第十九轮实测否掉了这条）：
 * 致仕族那几条 flag 是 `route_*` 事件写的，而 400 局（seed 1..50 × steady/warden × 四出身）实测
 * 它们只在**第 159 月（1641 年）以后**才可能播出来，且量极小 ——
 * `清白辞官`/`乞骸骨` 30 局、`辞官`/`归隐` 各 6 局、`急流勇退`/`主动致仕` 3 局、`告病归田` 2 局，
 * `隐居山林`/`看破红尘`/`出家`/`与世无争` **0 局**（写它们的《平庸之念》一局都没播过）。
 * 而善终年窗开在 1638 与 1640 —— 拿这些 flag 当门槛，等于把图鉴那十一格一起涂灰（第十三轮的老毛病）。
 * 见 §1.4 ⑯。
 *
 * 所以这一层只做一件事：**把收笔与否的决定权还给玩家**。
 *   · 判定命中善终 → 引擎不再直接收尾，而是把那张结局卡摆上桌（卡本文案本来就是史官口吻）；
 *   · 玩家点【青史留名】那一条 → 照旧结算，结局 id 进历史、进图鉴、进成就；
 *   · 玩家点【搁笔】/【反事实】/【后续】 → 游戏继续，并写下 `史馆辞笔`；
 *     这个 flag 由每条善终的 `conditions.flags.notHas` 读，于是**拒绝一次，本局不再被善终请笔**
 *     —— 说"我还没完"的人，就该一直走到 1644。
 *
 * 三条口径上的注意：
 *   1. `史馆辞笔` 写在数据里（选项 effects）也读在数据里（条件 notHas），
 *      所以 `audit-flag-reachability.ts` 看得见它的读者，它不会变成新的白存经历。
 *   2. 除【收笔】之外的**每一条**选项都注入这个 flag —— 少一条，那条选项就会在
 *      下个月把同一张卡片重新摆上桌（第十八轮的坝换成第十九轮的墙）。
 *   3. 名单收的是"**由玩家自己走出来的收束**"：十一条善终，加上第二十轮补的两条路线型收束
 *      （`殉职任上` / `流亡海外` —— 门票是玩家自己选的 flag，触发靠的是恒真的状态判定）。
 *      甲申之变、城破、殉国、抄家、归零病逝是**降临**，不是收束，玩家没有拒绝的余地，也不该有。
 */
import type { EventChoice, GameEvent } from '../types/event'

/** 拒绝收笔之后随身带上的经历；同时是全部善终结局的公共 notHas 门槛 */
export const SHIGUAN_DECLINE_FLAG = '史馆辞笔'

/** 追加的那条【搁笔】选项的 id */
const DECLINE_CHOICE_ID = 'c_decline'

/**
 * 每条收束型结局的【搁笔】文案：选项文字 / 一句说明 / 结算标题 / 结算正文。
 *
 * 这一张表就是"哪些结局算该由玩家自己盖棺"的唯一答案 —— 引擎与体检脚本都从这里读，
 * 不在 26 条数据里散落标记，是为了让这一轮的取舍可以一眼看完、一眼改完。
 */
const DECLINE_COPY: Record<string, { text: string; description: string; title: string; echo: string }> = {
  ending_famous_minister: {
    text: '【搁笔】传未成，且再任几年',
    description: '史馆且慢落笔',
    title: '名臣垂范 · 搁笔',
    echo: `史官捧着笔等你，你摇头。

「流寇未平，辽东未靖，某传且慢写。」

他把册子合上，退了半步。列传空着那一页，随你继续任事。`
  },
  ending_hermit_taoist: {
    text: '【搁笔】山里住不惯，再出山一趟',
    description: '茅屋才盖两间',
    title: '归隐田园 · 搁笔',
    echo: `你走到篱门前，回头看了一眼那两间新茅屋，又把包袱放回了屋里。

「山中日月长，城里的事还没完。」

隐士笑了一声，替你把关外的那封信拆开。`
  },
  ending_recluse_scholar: {
    text: '【搁笔】书未刻成，稿还在案上',
    description: '著述只写了半部',
    title: '大儒传世 · 搁笔',
    echo: `弟子来问：先生的书，可以定稿了么？

你翻开案上那册，中间还缺三篇序、两卷答问。

「再等几年。书比人长寿，不必赶在今日写完。」`
  },
  ending_wealthy_retiree: {
    text: '【搁笔】仓里的米还没发完',
    description: '散财未竟',
    title: '富甲一方 · 搁笔',
    echo: `账房把最后一笔摊上时，你只批了两个字：再赈。

史官在旁记「某公富甲一时」，你把他请出门，说：

「等我施完这一季粥，再回来写也不迟。」`
  },
  ending_monk_nirvana: {
    text: '【搁笔】香未烧尽，山下还有人等',
    description: '剃度且缓一日',
    title: '遁入空门 · 搁笔',
    echo: `师父把剃刀搁在案上，你合十：

「弟子尚有一事未了 —— 山下那几家，还等这斗米的信。」

「那你先去办事，」师父说，「寺里的名额，我给你留到年底。」`
  },
  ending_family_man: {
    text: '【搁笔】儿孙尚小，撑不起这个家',
    description: '族谱留白一页',
    title: '天伦之乐 · 搁笔',
    echo: `祠堂新砌，族谱才修到一半。你看着阶下那几个还在抢果子的孩子，把笔放下了。

「这宅子要有人守，功名要有人续。今日不是收束的日子。」`
  },
  ending_medical_saint: {
    text: '【搁笔】疫势未平，药炉还不能冷',
    description: '方书再补一卷',
    title: '悬壶济世 · 搁笔',
    echo: `徒弟问：先生的方书可要进呈史馆？

你指着窗外那队抬伤者的门板：

「先别写我。等这一场疫过了，再说也不迟。」`
  },
  ending_honorable_retirement: {
    text: '【搁笔】朝廷未许，骸骨且留',
    description: '乞休疏被挽留',
    title: '致仕善终 · 搁笔',
    echo: `你上疏乞骸骨，旨意下来却是「温旨留公，以慰舆望」。

司礼监的太监把原疏奉还，你只好再拜受职。

史馆那支笔，于是又等了你几年。`
  },
  ending_border_general: {
    text: '【搁笔】城未筑完，兵未练成',
    description: '边务在手，未可言归',
    title: '边关大将 · 搁笔',
    echo: `幕将请你上疏刻石纪功，你摇头：

「大城才合了夯，新兵还在发饷。此时勒石，是把没打完的仗交给人家讲。」

纪功碑留到下一回。`
  },
  ending_pure_stream: {
    text: '【搁笔】疏稿在袖中，尚未上',
    description: '言路未开，不敢自定结案',
    title: '清流骨鲠 · 搁笔',
    echo: `同僚抄了弹章副本，说史馆已备立传。

你把袖中那份还没递的稿子抽出来，摊在灯下：

「这一本还没上。传也不忙写。」`
  },
  ending_ordinary_life: {
    text: '【搁笔】日子还长，且不必写定',
    description: '寻常人不当场结案',
    title: '平凡终老 · 搁笔',
    echo: `史官查了半天告身，提笔要写「某某，寻常一官，无甚奇异」。

你在旁听着，笑了：

「无甚奇异，也正是没写完。且等我过完这一段再说。」`
  },
  /**
   * 下面两条不是"善终"，是**你自己选出来的收束**（第二十轮加进来的）。
   * 第二十轮把 21 条 `route_*` 从饿死的 random 层挪回 transition 层之后，
   * 400 局取样里 `殉职任上` 从 7 局涨到 37 局、平均触发局长从 162 月掉到 **90 月**（1635 年），
   * `流亡海外` 从 6 局涨到 25 局 —— 于是"一年吃掉一批局"的形状在另一个年份复现了。
   * 成因与上面十一条完全同一类：判定读的是 flag + 状态，一旦成立就恒真，
   * 年窗一开的第一次月份推进必然命中，玩家没有被问过就把局收走了。
   * 区别只在于这两条的门票是玩家自己选的（【坚守岗位】写下 `鞠躬尽瘁`、
   * 出海那条写下 `转移资产`），所以"要不要就在这一刻盖棺"更该由他答。
   */
  ending_duty_death: {
    text: '【搁笔】案头公文没批完，传且慢写',
    description: '最后一日还没到',
    title: '殉职任上 · 搁笔',
    echo: `史官捧着册子来，说已经备下「鞠躬尽瘁，死而后已」八个字。

你抬头看了看案上那叠还没批完的公文，又看了看窗外等着发赈的名册。

「八个字是好八个字，」你说，「只是我还没死。」

史官把册子收进袖里，说他在任满之前每天都来。`
  },
  ending_exile_overseas: {
    text: '【搁笔】船钱已付，人且留下',
    description: '行装才打了一半',
    title: '流亡海外 · 搁笔',
    echo: `管事来问：船已雇定，今日可动身？

你看着那两只箱子——一箱是账册，一箱是给灾民买的米，都还没落锁。

「史馆要写我浮海而死，」你笑了一声，「写早了半步。」

你叫船工先把锚落下，说米发完了再谈航期。`
  }
}

/** 这一轮拿到拒绝权的善终结局 id（顺序即 `DECLINE_COPY` 的覆盖面，用例逐一对账） */
export const DECLINABLE_ENDING_IDS = Object.keys(DECLINE_COPY)

/** 这条选项是不是"盖棺"那一条 */
const isSealChoice = (c: EventChoice) => c.effects?.special?.type === 'ending'

const has = (list: string[] | undefined, f: string) => (list || []).includes(f)

function withDeclineFlag(c: EventChoice): EventChoice {
  const add = c.effects?.flags?.add || []
  if (has(add, SHIGUAN_DECLINE_FLAG)) return c
  return {
    ...c,
    effects: {
      ...c.effects,
      flags: { ...c.effects?.flags, add: [...add, SHIGUAN_DECLINE_FLAG] }
    }
  }
}

/**
 * 把一条善终结局改成"请笔卡片"：
 *  1. `declinable` —— 只给引擎看：判定命中时**不许**直接 handleGameOver；
 *  2. `conditions.flags.notHas += 史馆辞笔` —— 拒绝过就不再来；
 *  3. 每条非收笔选项都写上这个 flag；
 *  4. 追加一条干净的【搁笔】选项（零数值代价 —— 拒绝收笔不该再额外罚人，
 *     而原有的【反事实】/【后续】是带增量的，见第 3 条）。
 */
function asOffer(e: GameEvent): GameEvent {
  const copy = DECLINE_COPY[e.id]
  const condFlags = e.conditions?.flags
  const notHas = condFlags?.notHas || []
  const choices = (e.choices || []).map(c => (isSealChoice(c) ? c : withDeclineFlag(c)))
  const declineChoice: EventChoice = {
    id: DECLINE_CHOICE_ID,
    text: copy.text,
    description: copy.description,
    effects: { flags: { add: [SHIGUAN_DECLINE_FLAG] } },
    resultDescription: '你把史官的笔搁回了案上 —— 传未成，人还在宦海里。',
    result: {
      title: copy.title,
      tags: ['搁笔', '传未成'],
      echo: copy.echo
    }
  }
  return {
    ...e,
    declinable: true,
    conditions: {
      ...e.conditions,
      flags: {
        ...condFlags,
        notHas: has(notHas, SHIGUAN_DECLINE_FLAG) ? notHas : [...notHas, SHIGUAN_DECLINE_FLAG]
      }
    },
    choices: [...choices, declineChoice]
  }
}

/**
 * 就地把结局池里的善终类转换成请笔卡片。
 * 表里没有的 id 原样返回 —— 恶终、国变、革职、病逝那些"降临型"结局照旧当场收尾。
 */
export function applyShiguanOffers(events: GameEvent[]): GameEvent[] {
  return events.map(e => (DECLINE_COPY[e.id] ? asOffer(e) : e))
}
