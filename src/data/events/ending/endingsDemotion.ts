/**
 * 革职结局（考功册上被注"不谨"）—— 引擎在 checkDemotion 判定 newIdentity
 * 为 civilian / exiled 时当场造卡，所以它过去**只存在于 `useGameEngine.ts` 里**：
 * 结局图鉴查不到这一格，而成就 `ending_demotion_done` 又是亮的，两边对不上。
 * 现在数据和构造都收在这里，引擎只调用 `buildDemotionEndingEvent`。
 */

import { GameEvent } from '../../../types/event'

export const DEMOTION_ENDING_ID = 'ending_demotion'

const CIVILIAN_QUOTE = '奉旨：某某才疏学浅，难胜其任。着即革职，削籍为民，永不录用。'
const EXILED_QUOTE = '奉旨：某某革职查办，永不起用，即日押解宁古塔，交驻防将军管束。'

const CIVILIAN_SITUATION =
  '你脱下官服，换上布衣。腰间的铜鱼袋解下来放在案头，发出一声轻响。从此以后，你只是一个普通百姓。'
const EXILED_SITUATION =
  '押解官已经在门外等候。你被允许带一床被子、两件换洗衣服和三本书。从京城到宁古塔，要走整整四个月。'

export const DEMOTION_CIVILIAN_ECHO = `【结局·革职为民】

回乡的路比想象中更长。

不是距离上的远——而是当你以一个庶民的身份走在曾经管辖过的土地上时，那种物是人非的感觉几乎让人窒息。

你路过自己曾经审过案的县衙，门口的差役换了一批又一批，没人认得你。你在路边摊吃了一碗面，味道和你当年微服私访时吃过的一模一样，但心境已天差地别。

你在老家置了几亩薄田，日出而作，日落而息。日子过得清贫倒也安稳。

偶尔有旧识路过来看你，你们喝茶聊天，谁也不提当年的事。只有临走时，他们会多看你一眼，眼神里有惋惜，也有某种说不清的释然。

你活到了六十三岁。去世那天是一个普通的秋日，阳光很好，院子里的菊花开了。

你没有留下什么丰功伟绩，也没有留下什么骂名。就像这世间千千万万的普通人一样，来过，走过，然后离开了。

《县志》载："某公，曾为朝廷命官，后因故罢归。居家课子，乡党称善。"
`

export const DEMOTION_EXILED_ECHO = `【结局·流放边疆】

宁古塔的风像刀子一样割在脸上。

你在这里已经待了三年。三年里，你见过零下四十度的严寒，见过被冻死在路边的流民，见过驻防将军鞭打逃卒时溅出的血点。

起初你还想着翻案、想着申诉。后来你就不想了。在这片苦寒之地，活着本身就是一种奢侈。

你开始学着和当地的女真人打交道，学着种他们叫做"哈拉"的庄稼，学着在暴风雪来临前把地窖封好。

某年冬天，一个来自京城的信使带来了消息：崇祯帝自缢于煤山，大顺军攻入北京。

你站在雪地里，看着南方的天空，久久没有说话。

第二天，人们发现你坐在地窖门口，脸上带着一种奇怪的表情——像是释然，又像是悲哀。

手里攥着一封没写完的信，收信人写着两个字："陛下"。
`

/**
 * 革职有两支：削籍为民与押解宁古塔。它们**共用一个事件 id**（成就
 * `ending_demotion_done` 的判据就是这个 id，图鉴也只有这一格），
 * 所以是一格两种归宿，而不是两格。
 *
 * @param reason checkDemotion 给出的贬官理由，进"前事"
 */
export function buildDemotionEndingEvent(isExiled: boolean, reason: string): GameEvent {
  return {
    id: DEMOTION_ENDING_ID,
    title: isExiled ? '流放边疆' : '革职为民',
    // 其余边界结局的 description 都是一句现场描写（与 situation 同源）。
    // generateBiography 把它当作人物志的收尾一句，留空等于传略最后一段是白的 ——
    // 这正是这段卡片以前内联在引擎里时写 `description: ''` 留下的口子。
    description: isExiled ? EXILED_SITUATION : CIVILIAN_SITUATION,
    endingConfig: { category: 'personal_fate', tier: isExiled ? 'dark' : 'tragic' },
    narrative: {
      speaker: { title: '吏部文书', name: '吏部主事' },
      quote: isExiled ? EXILED_QUOTE : CIVILIAN_QUOTE,
      background: reason + '\n\n吏部的文书送到的时候，你正在批阅最后几份公文。接过的那一刻，你知道——一切都结束了。',
      situation: isExiled ? EXILED_SITUATION : CIVILIAN_SITUATION
    },
    conditions: {},
    choices: [
      {
        id: 'accept',
        text: '接受命运',
        effects: { special: { type: 'ending' } },
        result: {
          title: isExiled ? '万里投荒' : '布衣终老',
          tags: isExiled
            ? ['贬官流放', '个人命运', '黑暗']
            : ['贬官为民', '个人命运', '悲剧'],
          echo: isExiled ? DEMOTION_EXILED_ECHO : DEMOTION_CIVILIAN_ECHO
        }
      }
    ],
    type: 'ending'
  }
}

/**
 * 图鉴格子。它不进可玩事件池（`src/data/events/index.ts` 有意不 import `./ending`），
 * 只供 EndingCodex 展示。id 与引擎造的卡片同一个，因此达成任一支都会点亮这一格。
 */
export const DEMOTION_ENDING_TILE: GameEvent = {
  id: DEMOTION_ENDING_ID,
  storyline: 'ordinary',
  title: '罢黜归田',
  description: '考功册上被注了"不谨"。削籍为民，或押解宁古塔。',
  endingConfig: { category: 'personal_fate', tier: 'tragic' },
  narrative: {
    speaker: { title: '吏部文书', name: '吏部主事' },
    quote: CIVILIAN_QUOTE,
    background:
      '大计之年，吏部的考功册上你的名下多了一行小字。革职的旨意下来时，你正在批阅最后几份公文。\n\n情节轻的削籍为民，情节重的"着即革职查办，永不起用"——那是流放宁古塔的说法。两条路共用这一格：史馆藏本只记"罢归"二字，怎么去的是哪一种，看的是那年冬天你的罪名有多重。',
    situation: CIVILIAN_SITUATION
  },
  conditions: {},
  choices: [
    {
      id: 'accept',
      text: '接受命运',
      effects: { special: { type: 'ending' } },
      result: {
        title: '布衣终老',
        tags: ['贬官为民', '个人命运', '悲剧'],
        echo: DEMOTION_CIVILIAN_ECHO
      }
    }
  ],
  type: 'ending'
}
