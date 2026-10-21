import { GameEvent } from '../../../types/event'

/**
 * 第三波回响：家宅线的孩子。
 *
 * 第二波 `aftermath.ts` 的《门内门外》把内宅的事收了尾，但它自己又写下两条没有读者的经历——
 * `wife_respected`（亲迎正室）与 `harmonious_family`（请族老调停）。第四十四轮实测
 * 108 局（12 策略 × 9 种子）：这两条（改动前）分别被带上身 21 次与 31 次，全游戏没有一处门槛读它们。
 *
 * 这一波只做一件早就该做的事：**把情感线正文里已经答应过、却从没兑现的下文补上**。
 *
 *   1. `emotion_core_003` 的【维护妻子】写完「三年后的某一天，正妻告诉你——她怀孕了」，
 *      却只写 `protect_childless_wife`，不写 `has_children`：那个孩子从未出生。
 *      → `echo_family_006` 灯花（1635 起，实测 108 局里播出 12 局）。
 *   2. `emotion_core_003` 的【去母留子】写完「多年后，当那个孩子长大成人问你
 *      『我的亲生母亲是谁』时，你该如何回答？」，全游戏没有这一问。
 *      → `echo_family_007` 名帖（1638 起，18 局有子且活到年窗，全部播出）。
 *   3. `emotion_core_001` 的【灭口】写完「对外宣称正妻急病暴毙」，此后再无人问。
 *      而 `wife_murdered` / `crime_line` 两条经历 108 局里各被带上身 4 次，一次也没被读过。
 *      → `echo_family_008` 问丧（1635 起）。
 *
 * 与第二波同一条规矩：**不造新词**。除了一次性开关 `echo_family_00x_done`，
 * 这里只写别处早已写得出的 flag（`has_children` / `harmonious_family` /
 * `wife_respected` / `wife_hurt`），开门读的也全是前两波或原始情感线的产出。
 *
 * 为什么不是"再加一段恩爱戏"：这三条都是原文自己留下的欠账。
 * 玩家的选择已经写进正文，后续不出现不是留白，是断头。
 */
export const familyLaterEchoEvents: GameEvent[] = [
  {
    id: 'echo_family_006',
    storyline: 'female',
    type: 'transition',
    title: '灯花',
    description: '她让丫鬟来请你，说有句话要当面说。',
    narrative: {
      speaker: { title: '正妻', name: '夫人' },
      quote: '这几年我没有再提那件事。今天请你来，是想让你先知道。',
      background: `三年前，母亲拿"不孝有三，无后为大"逼你纳妾。你站到了妻子这一边，对母亲说孩子的事顺其自然。那之后，家里再没人提子嗣，你也以为这件事就这样过去了。

这三年里，她照旧掌家、照旧替你打点年节，只是每到夜里，总有一盏灯留到你回房。`,
      situation: '灯芯爆了一个花。她把手放在小腹上，没有笑，只是看着你。'
    },
    conditions: {
      year: { min: 1635, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        has: ['protect_childless_wife'],
        notHas: ['has_children', 'echo_family_006_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'family',
        text: '【先握住她的手】"这一回，我哪儿也不去"',
        description: '把这三年欠下的陪伴补上',
        effects: {
          attributes: { 体质: 3, 财帛: -8 },
          hidden: { 道德值: 8, 欲望值: -4 },
          flags: {
            add: ['echo_family_006_done', 'has_children', 'harmonious_family']
          }
        },
        result: {
          title: '灯花',
          tags: ['体质+3', '财帛-8', '道德+8', '欲望-4', '获得子嗣', '家庭和睦'],
          echo: `你握住她的手。那只手比三年前瘦，指节上有操持家务留下的薄茧。她终于哭了，哭得很轻，像怕惊动肚子里的那一点动静。

十个月后，孩子落地，哭声把整个院子都吵醒了。母亲站在门外，念了一声佛，没有再说纳妾的事。

你给孩子取了个小名，叫"灯花"。她问为什么，你说："那晚灯芯爆了个花，我就知道，这个家还有后福。"

此后很多年，你夜里回房，那盏灯都亮着。`
        }
      },
      {
        id: 'c2',
        storyline: 'corrupt',
        text: '【先问一句】"大夫看过了？是男是女？"',
        description: '在高兴之前，先问最要紧的那一句',
        effects: {
          gameState: { 士绅: 4 },
          hidden: { 道德值: -8 },
          flags: { add: ['echo_family_006_done', 'has_children', 'wife_hurt'] }
        },
        result: {
          title: '那句"你的儿子"',
          tags: ['士绅+4', '道德-8', '获得子嗣', '正妻心冷'],
          echo: `她的手指在你掌心里凉了一下，随即抽了回去。

"大夫说，是个儿子。"她答得很平，像在回一件公事。

十个月后孩子落地，她让人来报喜，自己没有开口。你去房里看她，她正抱着孩子，见你进来，把孩子递过来，说："抱抱吧，你的儿子。"

那句"你的"，把你自己划在了外头。

此后她待你依旧周到，账目、年礼、人情，一件不差；只是再没有让你在灯下坐过。`
        }
      },
      {
        id: 'c3',
        storyline: 'family',
        text: '【请岳母来】"这三年委屈你了，请你母亲来住些日子"',
        description: '把这一桩喜事办成两家人的事',
        effects: {
          attributes: { 财帛: -12 },
          gameState: { 士绅: 3, 民望: 3 },
          hidden: { 道德值: 5 },
          flags: {
            add: ['echo_family_006_done', 'has_children', 'wife_respected']
          }
        },
        result: {
          title: '两家的灯',
          tags: ['财帛-12', '士绅+3', '民望+3', '道德+5', '获得子嗣', '正妻受敬'],
          echo: `岳母来的那天，带了两箱旧书和一坛自酿的米酒。她没提三年前的事，只在你书房里坐了一刻，说："我这个女儿，从小不肯在人前掉泪。"

十个月后孩子落地，岳母抱着外孙，对她说："这个家，总算有个明白人。"

她在月子里第一次笑了。你站在门外，听见她们母女说话，没有进去。

那晚的灯，是岳母替你们点的。`
        }
      }
    ]
  },

  {
    id: 'echo_family_007',
    storyline: 'female',
    type: 'transition',
    title: '名帖',
    description: '塾师送来一张名帖，问孩子的出身该怎么写。',
    narrative: {
      speaker: { title: '塾师', name: '陈先生' },
      quote: '东翁，这一栏照实写，还是学生代笔？',
      background: `孩子到了入塾的年纪。你请了城里一位老塾师，姓陈，曾在国子监读过书。头一天，他送来一张名帖，说照例要写明出身：嫡出、庶出，生母何人。

这不是一张给塾师看的纸。孩子将来进学、应试、议婚，都要用它。你研好墨，笔尖悬在"生母"那一栏上。`,
      situation: '陈先生把笔搁在砚边，没有催你。孩子坐在窗下，正拿一支废笔在纸上画字。'
    },
    conditions: {
      year: { min: 1638, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        has: ['has_children'],
        notHas: ['echo_family_007_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'family',
        text: '【写亡母】"她叫小桃"',
        description: '把那个不能提的名字写进孩子的出身里',
        showConditions: {
          flags: { any: ['concubine_killed'] }
        },
        effects: {
          gameState: { 士绅: -6, 民望: 5 },
          hidden: { 道德值: 8 },
          flags: { add: ['echo_family_007_done'] }
        },
        result: {
          title: '帖上的亡母',
          tags: ['士绅-6', '民望+5', '道德+8', '生母入帖'],
          echo: `你在"生母"一栏写下"亡妾小桃"。

陈先生顿了一下，问："可要注'病故'？"

你说："不必。"

名帖送出去，族里有人皱眉，塾师却没有再问。孩子放学回来，指着帖上的名字问你："她是谁？"

你说："她生了你。"

孩子把"小桃"两个字念了三遍，像在认一个很难的字。夜里你听见他在被子里小声叫了一声"娘"，不知道叫的是谁。`
        }
      },
      {
        id: 'c2',
        storyline: 'family',
        text: '【写生母】"生母就是生母，不必瞒"',
        description: '让活着的那个人也有一行字',
        showConditions: {
          flags: { any: ['concubine_for_heir', 'wife_jealous', 'wife_hurt'] }
        },
        effects: {
          gameState: { 士绅: -4, 清议: -3 },
          hidden: { 道德值: 5 },
          flags: { add: ['echo_family_007_done'] }
        },
        result: {
          title: '两行字',
          tags: ['士绅-4', '清议-3', '道德+5', '生母入帖'],
          echo: `你写下生母的名字。

正室在屏后听见了，没有出来。晚饭时她照常布菜，只是把汤放在孩子面前，没有放在你面前。

陈先生收起名帖时说："东翁这一笔，写得比许多人都直。"

你不知这是称赞还是别的。

夜里孩子睡了，你听见正室在隔壁同丫鬟说："明日起，哥儿的衣裳单放一柜。"她没有哭，也没有摔东西。`
        }
      },
      {
        id: 'c3',
        storyline: 'family',
        text: '【记在正室名下】"嫡母在，生母不必入册"',
        description: '把体面给养孩子的那个人',
        showConditions: {
          flags: { any: ['legitimate_heir', 'wife_respected', 'harmonious_family'] }
        },
        effects: {
          gameState: { 士绅: 6, 清议: 3 },
          hidden: { 道德值: 3 },
          flags: { add: ['echo_family_007_done'] }
        },
        result: {
          title: '落款',
          tags: ['士绅+6', '清议+3', '道德+3', '嫡母入册'],
          echo: `你在"生母"一栏写了正室的姓。

夫人接过笔，在下面添了自己的名。她写得很慢，像在给一桩旧事落款。

陈先生走后，孩子问她："那我亲娘呢？"

她说："你有两个娘。一个生你，一个养你。"

孩子点点头，像是懂了，又像是没懂。

那一夜，夫人把名帖压在妆奁底下。你后来再没见过那张纸，只知道它一直在。`
        }
      },
      {
        id: 'c4',
        storyline: 'ordinary',
        text: '【只写父名】"内宅的事，不入外册"',
        description: '把这一栏留白',
        effects: {
          gameState: { 士绅: 2 },
          hidden: { 机敏值: 5, 道德值: -4 },
          flags: { add: ['echo_family_007_done'] }
        },
        result: {
          title: '留白',
          tags: ['士绅+2', '机敏+5', '道德-4', '出身留白'],
          echo: `你只写了"父某"。

陈先生看了你一眼，把名帖收进袖里。

孩子长大后从同学嘴里知道了自己的生母，回来问你。你说："名帖上写不下那么多。"

他站着没走，过了一会儿说："那我以后自己写。"

你看着他的背影，忽然想起自己当年落笔时，也是这样背着父亲站的。`
        }
      },
      {
        id: 'c5',
        storyline: 'family',
        text: '【问孩子】"你想写谁？"',
        description: '把这一笔交给他自己',
        showConditions: {
          flags: { any: ['harmonious_family', 'protect_childless_wife'] }
        },
        effects: {
          hidden: { 道德值: 6, 机敏值: 4 },
          flags: { add: ['echo_family_007_done'] }
        },
        result: {
          title: '都写',
          tags: ['道德+6', '机敏+4', '两母入帖'],
          echo: `你把笔递给孩子。

他握不稳，在"生母"一栏写了"母亲"两个字。

陈先生问："哪位母亲？"

孩子说："都写。"

陈先生看着你，你点了点头。他把名帖收好，没有改。

那一年入塾，孩子是唯一一个名帖上写着两个母亲的人。塾里有人笑，他回了一句："我家里有两个。"`
        }
      },
      {
        id: 'c6',
        storyline: 'corrupt',
        text: '【说她病故】"你娘早已病故"',
        description: '把那条命从纸上再抹一次',
        showConditions: {
          flags: { any: ['concubine_killed'] }
        },
        effects: {
          hidden: { 机敏值: 4, 道德值: -10 },
          flags: { add: ['echo_family_007_done'] }
        },
        result: {
          title: '病故',
          tags: ['机敏+4', '道德-10', '生母病故'],
          echo: `你在名帖上写"生母病故"。

陈先生没有再问。

孩子把"病故"两个字念了一遍，没有哭。夜里你听见他问乳母："病死的人，疼不疼？"

乳母说："不疼。"

他很久没有说话。`

        }
      }
    ]
  },

  {
    id: 'echo_family_008',
    storyline: 'female',
    type: 'transition',
    title: '问丧',
    description: '妻族修谱，内兄带着一封公信到了门口。',
    narrative: {
      speaker: { title: '内兄', name: '妻兄' },
      quote: '妹夫，族里要修谱。她的卒年、葬地、病因，都要写进去。你给一句准话。',
      background: `那一年，你对外说正妻急病暴毙。丧事办得很快，棺木是她娘家送来的，你没有让他们开棺。

这三年里，妻族没有来过人。今天，内兄带着一封族里的公信到了门口，身后还跟着两个执笔的族侄。`,
      situation: '公信摊在桌上，卒年、葬地、病因三栏都空着。内兄没有坐。'
    },
    conditions: {
      year: { min: 1635, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        has: ['wife_murdered'],
        notHas: ['echo_family_008_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'family',
        text: '【补一份丧仪】"该给的体面，一样不少"',
        description: '把三年前省掉的礼数补齐',
        effects: {
          attributes: { 财帛: -25 },
          gameState: { 民望: 5, 清议: 2 },
          hidden: { 道德值: 6 },
          flags: { add: ['echo_family_008_done'] }
        },
        result: {
          title: '补葬',
          tags: ['财帛-25', '民望+5', '清议+2', '道德+6', '补葬'],
          echo: `你请了僧人，补做七日道场，碑上刻了她的姓和卒年，不刻"急病"。

内兄在碑前站了很久，说："我妹妹嫁给你的时候，十里红妆。"

他没有再问病因。

族谱上最后写了"病卒"，你签了名。此后每年清明，妻族都来上香，与你无话。

有一年你远远看见内兄在碑前摆了一碟她爱吃的青梅。你没有过去。`
        }
      },
      {
        id: 'c2',
        storyline: 'corrupt',
        text: '【以势压人】"人已经死了，族里别再翻"',
        description: '让县里递一句话，把公信按回去',
        showConditions: {
          flags: { has: ['crime_line'] }
        },
        effects: {
          gameState: { 士绅: 5, 民望: -8, 清议: -6 },
          hidden: { 道德值: -10, 野心值: 3 },
          flags: { add: ['echo_family_008_done'] }
        },
        result: {
          title: '按回去',
          tags: ['士绅+5', '民望-8', '清议-6', '道德-10', '野心+3', '妻族绝'],
          echo: `你让县里递了话：你妻室病故，族中再议，便是诬告命官。

内兄把公信收回袖里，临走时看了你一眼。

那一眼没有恨，只有认命。

族谱上最后写了"病卒"，没有葬地。三年后你听说，她娘家的老宅卖了，族里再没人提她。

你升了一级。贺客里没有一个是她娘家的人。`
        }
      },
      {
        id: 'c3',
        storyline: 'family',
        text: '【归葬】"把她迁回娘家祖坟，碑我来立"',
        description: '让她回到娘家那边',
        effects: {
          attributes: { 财帛: -15 },
          gameState: { 民望: 3 },
          hidden: { 道德值: 4 },
          flags: { add: ['echo_family_008_done'] }
        },
        result: {
          title: '归葬',
          tags: ['财帛-15', '民望+3', '道德+4', '归葬'],
          echo: `你出钱把棺木迁回她娘家祖坟，碑上按内兄的意思写"某门某氏"。

下葬那天你没有去，只让人送了一副挽联。

内兄后来托人带话："碑立了，族谱也写了。往后不必再来。"

你把这句"不必再来"在心里放了很多年。

有时夜里醒来，你会想起她推门进来送参汤的那一晚。汤碗碎在地上的声音，比什么都清楚。`
        }
      }
    ]
  }
]
