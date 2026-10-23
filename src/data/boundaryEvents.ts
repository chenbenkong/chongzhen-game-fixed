import { BoundaryEvent, BoundaryEventCheckParams } from '../types/boundaryEvent'
import { boundaryEventManager } from '../services/BoundaryEventManager'
import { GameEvent } from '../types/event'
import { wrapBatchAsBoundaryEvents, NARRATIVE_MIN_TURN, NARRATIVE_MIN_YEAR } from './boundaryEventCompiler'
import { isFatalZero, zeroWarningEvents, type ZeroKey } from './zeroWarningEvents'
import { corruptionWarningEvents, FUGITIVE_FLAG } from './demotionWarningEvents'
// 直接从子文件导入结局数据（避免与 ending/index.ts 循环依赖）
import { allEndingEvents as mainNarrativeEndings, OLD_AGE_ENDING_TILE } from './events/ending/endings_all'
import { debaucheryEndingEvents } from './events/ending/debauchery'

const ENDING_BANKRUPT: GameEvent = {
  id: 'triggerable_bankrupt',
  title: '倾家荡产',
  description: '天色渐暗，你独自坐在空荡荡的厅堂里。',
  endingConfig: { category: 'personal_fate', tier: 'tragic' },
  narrative: {
    speaker: { title: '债主', name: '刘三' },
    quote: '大人，这可是最后一道催帖了。再不还钱，连这宅子也保不住。',
    background: '库房的银两早已见底。你翻遍了所有抽屉、暗格，连夫人的嫁妆首饰都拿去当了——还是不够。\n\n门外是络绎不绝的债主，有放高利贷的市井无赖，有你曾经挪用公款的记录在案的胥吏，还有几个面善的"老友"，他们不说话，只是冷冷地站在那里。',
    situation: '天色渐暗，你独自坐在空荡荡的厅堂里。值钱的物件已经被搬得差不多了，墙上只留下一个个难看的印记。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '变卖祖产，了结债务',
      effects: { attributes: { 财帛: 0 }, special: { type: 'ending' } },
      result: {
        title: '穷困潦倒',
        tags: ['财帛归零', '个人命运', '悲剧'],
        echo: `【结局·倾家荡产】

最后一件被搬走的是那方你父亲传下来的端砚。

你站在门口，看着那辆驴车吱呀吱呀地远去，车上的东西是你半生积攒的全部身家。赶车的人回头看了你一眼，眼神里有怜悯，也有某种说不清的快意。

"大人好走。"他拱了拱手。

你没有回应。

回乡的路走了三个月。起初还有几个旧识愿意接济你一程，后来连他们也渐渐疏远了。不是他们薄情——谁愿意和一个负债累累的废人扯上关系？

你在老家城外的破庙里安顿下来。白天替人写书信、算账目，换几文铜板买粥喝；晚上就蜷缩在草堆上，听着风从破窗缝里钻进来呜呜地响。

某年除夕，大雪。你用最后三文钱买了一碗热汤面，坐在庙门槛上看着远处的万家灯火。

恍惚间好像看到了当年金榜题名的那一天——锣鼓喧天，报喜的人挤满了院子，父亲笑得合不拢嘴，母亲抹着眼泪说"祖宗保佑"。

面条凉了。

你把碗放下，拍了拍膝盖上的雪，转身走进破庙深处。

史书不载此人。
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_DEATH_ILLNESS: GameEvent = {
  id: 'triggerable_death_illness',
  title: '病逝任上',
  description: '床边围满了人。夫人握着你的手，眼泪无声地往下掉。下属们站在门外，有人已经在低声啜泣。',
  endingConfig: { category: 'personal_fate', tier: 'bittersweet' },
  narrative: {
    speaker: { title: '太医', name: '王太医' },
    quote: '大人……药石无灵了。老臣斗胆进言——该准备后事了。',
    background: '你躺在床上，连翻身都成了奢望。窗外是熟悉的衙门后院，那棵你亲手种下的槐树已经长得很高了。\n\n太医退出去的时候，脚步很轻，像是怕惊扰什么。你知道他在撒谎——什么"静养几日便好"，你的身体你自己最清楚。',
    situation: '床边围满了人。夫人握着你的手，眼泪无声地往下掉。下属们站在门外，有人已经在低声啜泣。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '留下遗言',
      effects: {
        hidden: { 道德值: 10 },
        special: { type: 'ending' }
      },
      result: {
        title: '鞠躬尽瘁',
        tags: ['体质归零', '道德回升', '个人命运', '苦涩'],
        echo: `【结局·病逝任上】

你费力地抬起手，指了指案头那叠未批完的公文。

"那些……还要批……"

夫人终于忍不住哭出声来："都什么时候了！你还想那些公文！"

你想笑，但嘴角只是微微动了一下。

其实你心里还有很多话想说。想告诉后辈为官之道，想交代家里那几亩田怎么分，想给当年提携过你的恩师写封信——但喉咙里像是塞了一团棉花，什么都说不出来。

最后你只能用力握了握夫人的手。

她的手很暖。和你刚成亲那天一样暖。

崇祯十七年春，某公以疾卒于任上。百姓闻之，皆流涕曰："清官也。"出殡之日，送行者数里，沿途摆满路祭，香火三日不绝。

——《府志·良吏传》
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_EMPEROR_HATE: GameEvent = {
  id: 'triggerable_emperor_hate',
  title: '龙颜震怒',
  description: '锦衣卫已经围住了整个府邸。',
  endingConfig: { category: 'ming_fate', tier: 'tragic' },
  narrative: {
    speaker: { title: '锦衣卫指挥使', name: '骆养性' },
    quote: '奉天承运——圣上有旨，某某欺君罔上，罪在不赦。即刻拿下，押送诏狱。',
    background: '圣眷耗尽的那一刻来得比想象中更快。也许是一道言辞不当的奏折，也许是朝堂上一句不合时宜的话，又或许——什么都没有，只是皇帝今天心情不好，而你恰好撞上了枪口。\n\n崇祯帝本就多疑，一旦对你起了疑心，便如附骨之疽，再难消解。',
    situation: '锦衣卫已经围住了整个府邸。大门被封，家人被控制在厢房。骆养性站在正厅中央，手里捧着明黄色的圣旨，脸上看不出任何表情。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '跪接圣旨',
      effects: { special: { type: 'ending' } },
      result: {
        title: '革职查办',
        tags: ['圣眷归零', '大明国运', '悲剧'],
        echo: `【结局·龙颜震怒】

你跪在地上，双手高举接过那道圣旨。

"谢主隆恩。"

声音平静得让自己都觉得陌生。

诏狱里的日子很难熬。阴暗、潮湿、散发着一股霉味和血腥气混合的味道。审讯你的人不问你犯了什么罪——他们只需要你签字画押，承认那些早就罗织好的罪名。

你签了。不签又能怎样呢？在这个地方，活着本身就是一种侥幸。

后来你听说，你的案子被定性为"朋党"。牵连者数十人，有的流放，有的斩监候。你因为"认罪态度尚可"，免了死罪，发配岭南充军。

岭南很远。你走到一半就走不动了，病死在一间破败的驿站里。

死前最后一个念头是：当初如果少说那一句话，会不会不一样？

答案随风而散。
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_EUNUCH: GameEvent = {
  id: 'triggerable_eunuch',
  title: '宦官构陷',
  description: '深夜，一个蒙面人敲开了你的房门。',
  endingConfig: { category: 'ming_fate', tier: 'dark' },
  narrative: {
    speaker: { title: '司礼监秉笔太监', name: '王承恩的同僚' },
    quote: '大人，咱们家公公有句话带给您——朝堂之上，有些话不该说，有些人不该碰。',
    background: '你得罪了不该得罪的人。也许是弹劾了某个宦官的亲戚，也许是挡了东厂的财路，又或者仅仅是因为你在一次私下聚宴中说了一句对宫闱不敬的话。\n\n宦官集团的手段你早有耳闻：罗织罪名、制造伪证、收买证人——他们做这些事驾轻就熟。',
    situation: '深夜，一个蒙面人敲开了你的房门。他自称是"宫里的朋友"，带来一个消息：司礼监已经在皇上面前告了你一状，罪名是"交通外臣，图谋不轨"。三天之内，锦衣卫就会上门。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '听天由命',
      effects: { special: { type: 'ending' } },
      result: {
        title: '诏狱冤魂',
        tags: ['中官归零', '大明国运', '黑暗'],
        echo: `【结局·宦官构陷】

三天后的凌晨，锦衣卫准时到了。

没有审判，没有辩解的机会。你被直接押进了诏狱——那个进去就很难活着出来的地方。

狱中的审讯持续了整整一个月。他们逼你承认从未犯过的罪行：贪污、结党、甚至谋逆。每一项都是灭族的大罪。你不签，他们就动刑——夹棍、拶指、烙铁，十八般手段轮番上阵。

你挺过了十七天。

第十八天，他们把你夫人和孩子带到了牢里。刀架在你女儿脖子上的时候，你终于拿起了笔。

后来你才知道，那些供词根本不重要。重要的是让你"认罪"这个过程——只要有了你的口供，无论定什么罪都"证据确凿"。

最终判决：凌迟处死，家属发配为奴。

行刑那天，京城下着小雨。围观的人群中有你曾经帮助过的百姓，也有你曾经得罪过的同僚。他们的表情各不相同，但没有人上前为你求情。

你想起入仕第一天父亲说的话："为官者，当知进退，明得失。尤其要记住——宫里的水深，莫要蹚。"

那时你没听懂。现在懂了，太晚了。
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_SCHOLAR_OSTRACISM: GameEvent = {
  id: 'triggerable_scholar_ostracism',
  title: '士林唾弃',
  description: '朝堂之上，你已经感受不到明显的敌意——没有人公开弹劾你，没有人当面指责你。',
  endingConfig: { category: 'personal_fate', tier: 'controversial' },
  narrative: {
    speaker: { title: '翰林院编修', name: '张溥的门人' },
    quote: '阁下的所作所为，复社诸君子已尽知悉。从此以后，你我——陌路人罢了。',
    background: '事情是从一篇檄文开始的。复社的才子们在秦淮河畔的茶楼里传阅着一篇文章，历数你的"十大罪状"：阿谀权贵、排挤正人、行事乖张、德行有亏……\n\n有些指控是事实，有些纯属捕风捉影。但在舆论场上，真假从来都不重要——重要的是人们愿意相信什么。',
    situation: '朝堂之上，你已经感受不到明显的敌意——没有人公开弹劾你，没有人当面指责你。但这种沉默比谩骂更可怕。你发言时无人附和，你提议时无人支持，甚至连递折子给你的人都越来越少。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '上疏自辩',
      effects: { special: { type: 'ending' } },
      result: {
        title: '孤立无援',
        tags: ['清议归零', '个人命运', '争议'],
        echo: `【结局·士林唾弃】

你的自辩疏递上去之后，如泥牛入海。

不是皇帝没看到——而是没人愿意帮你说话。内阁票拟的时候，首辅只是淡淡扫了一眼，便放在了一边。六科给事中没有一人愿意为你题本。

你在朝堂上彻底成了透明人。

更糟糕的是，这种孤立很快蔓延到了生活中。往日与你诗酒唱和的朋友不再邀你赴宴，同年进士见到你时只是客气地点点头便匆匆离去，就连你家乡来的信也日渐稀少——据说是因为"不想和那种人沾亲带故"。

半年后，一道弹劾奏章终于出现了。罪名是"行事乖张，有亏官箴"。弹劾你的人是你曾经最信任的幕僚。

你看着他念完那篇措辞严厉的奏疏，突然笑了。

"写得不错，"你说，"比我预期的好。"

他被你的反应吓了一跳，顿了顿才继续念下去。

结局毫无悬念：革职还乡，永不叙用。

收拾行李离开京城的那天，只有一个人来送你——一个你曾经救济过的乞丐。他不知道发生了什么政治风波，只知道"那个好心的官老爷要走了"。

你给了他最后一块碎银子。

"走吧，"你说，"别送了。"

他没有走，一直站在城门口看着你的马车消失在扬起的尘土中。
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_GENTRY_REBELLION: GameEvent = {
  id: 'triggerable_gentry_rebellion',
  title: '乡绅反目',
  description: '联名的万言书送到了巡抚衙门。',
  endingConfig: { category: 'personal_fate', tier: 'tragic' },
  narrative: {
    speaker: { title: '县学教谕', name: '王举人' },
    quote: '大人，非是晚生等不肯配合——实在是您的政令太过激进，伤及我等根基。还请大人三思。',
    background: '你推行的新政触动了地方士绅的根本利益：清丈田亩让他们不得不补缴隐匿的赋税，整顿吏治断了胥吏们的灰色收入，兴办学校又让原本垄断教育的宗族失去了控制力。\n\n他们表面上恭顺服从，背地里却在酝酿一场风暴。',
    situation: '联名的万言书送到了巡抚衙门。上面按满了当地最有影响力的乡绅和族长的手印——一共一百七十三枚。内容只有一项诉求：参你一本，请求朝廷另派贤能。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '据理力争',
      effects: { special: { type: 'ending' } },
      result: {
        title: '四面楚歌',
        tags: ['士绅归零', '个人命运', '悲剧'],
        echo: `【结局·乡绅反目】

你的辩疏还没送到京城，地方的反击就已经开始了。

先是衙门的师爷集体"称病告假"——没有人帮你起草文书，没有人帮你处理公文，连升堂时喊"威武"的差役都变得有气无力。

然后是地方税收突然"出了问题"——明明账面上数字好看，实际入库的银两却十不存一。户部追查下来，责任全推到你头上。

接着是"民变"——准确地说，是一群被煽动的佃户围住了衙门，要求"青天大老爷做主"。他们并不知道自己被利用了，只是拿着别人写好的状纸，声泪俱下地控诉你的"暴政"。

巡抚终于来了。他看了你的申辩，又看了一百七十三枚手印的万言书，最后叹了口气。

"你也太难了，"他说，语气里听不出是同情还是别的什么，"但这事儿……我也保不了你。"

革职的命令一个月后下达。理由是"激变地方，失察属员"。

你离开的那天，衙门门口空荡荡的——没有百姓夹道相送，没有同僚依依惜别。只有一个扫街的老卒看了你一眼，嘟囔了一句"又走了一个"。

你回头看了一眼那座你治理了三年的县城。城墙还是那座城墙，衙门还是那座衙门。但你已经不属于这里了。

马车启动的时候，你听到远处传来一阵锣鼓声——那是新任知县到任的仪仗。

一切照旧。仿佛你从来没有存在过。
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_POPULAR_UPROAR: GameEvent = {
  id: 'triggerable_popular_uproar',
  title: '民怨沸腾',
  description: '人群越聚越多。从一开始的几十人发展到几百上千人，他们包围了衙门，喊着"反贪官不反朝廷"的口号。有人开始往里面扔石头，有人在拆大门。',
  endingConfig: { category: 'ming_fate', tier: 'dark' },
  narrative: {
    speaker: { title: '百姓代表', name: '老张头' },
    quote: '青天大老爷！我们交不起啊！再这么逼下去，真就是官逼民反了！',
    background: '压垮骆驼的最后一根稻草是一次加征。朝廷为了筹措辽饷，层层加码，最终落到了每一个老百姓头上。而你作为执行者，不得不亲自督责催缴。\n\n你亲眼看到一个老太太被差役推倒在地，她怀里抱着的半个发霉的窝窝头滚进了泥水里。她爬起来去捡，又被一脚踢开。\n\n下令的是你。',
    situation: '人群越聚越多。从一开始的几十人发展到几百上千人，他们包围了衙门，喊着"反贪官不反朝廷"的口号。有人开始往里面扔石头，有人在拆大门。'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '调兵镇压',
      effects: { special: { type: 'ending' } },
      result: {
        title: '激起民变',
        tags: ['民望归零', '大明国运', '黑暗'],
        echo: `【结局·民怨沸腾】

你下令开弓的时候，手在抖。

第一支箭射中了带头那个年轻人的肩膀。他惨叫一声倒下去，人群愣了一瞬——然后像炸了锅一样四散奔逃，同时发出震天的怒吼。

接下来发生的事情超出了你的控制。

混乱中，有人放火烧了衙门侧门。有人趁乱冲进了内院。有人抢了粮仓。等到援兵赶到的时候，整座县城已经乱成了一锅粥。

伤亡统计：百姓死亡二十三人，差役死亡七人，伤者不计其数。

消息传到京城，朝野震动。科道官员纷纷上疏弹劾你"激变地方，残害百姓"。舆论一边倒地站在"受害的百姓"那边——没有人关心那些被砸死的差役有没有妻儿老小。

最终处置：革职查办，待命进京受审。

你被押解上路的那天，县城的百姓站在街道两旁。他们不骂你也不打你，只是用一种冰冷的眼神看着你——那种看死人的眼神。

老张头也在人群中。你们目光相遇的一瞬，他移开了视线。

你突然意识到，在这场风波中，没有谁是真正的赢家。百姓死了人，你丢了官，朝廷丢了面子，而那些真正导致这一切的根源——加征、贪腐、制度性的压迫——依然纹丝不动。

马车颠簸着向前走去。身后传来一阵骚动——好像是有人在衙门旧址前立了一块碑。

你不敢回头看那上面写了什么。
`
      }
    }
  ],
  type: 'ending'
}

const ENDING_MORAL_DEGENERACY: GameEvent = {
  id: 'triggerable_moral_degeneracy',
  title: '众叛亲离',
  description: '空荡荡的府邸。仆人们卷走了能带走的一切，夫人在三天前带着孩子回了娘家，留下一封信："我不想让孩子有一个这样的父亲。"',
  endingConfig: { category: 'personal_fate', tier: 'dark' },
  narrative: {
    speaker: { title: '心声', name: '' },
    quote: '镜子里那个人……是我吗？',
    background: '你不知道自己是从什么时候开始变的。也许是第一次收受贿赂时的忐忑不安逐渐变成了理所当然，也许是第一次陷害同僚时的辗转反侧变成了睡个好觉，又或者——\n\n你只是累了。累了假装好人，累了维持形象，累了对着镜子练习那张正义凛然的脸。\n\n现在你不用装了。因为你已经不在乎了。',
    situation: '空荡荡的府邸。仆人们卷走了能带走的一切，夫人在三天前带着孩子回了娘家，留下一封信："我不想让孩子有一个这样的父亲。"'
  },
  conditions: {},
  choices: [
    {
      id: 'c1',
      text: '继续沉沦',
      effects: { special: { type: 'ending' } },
      result: {
        title: '恶贯满盈',
        tags: ['道德归零', '个人命运', '黑暗'],
        echo: `【结局·恶贯满盈】

你选择了继续。

一个月后的深夜，火光冲天而起。不是意外——有人纵火。你从后门逃出来的时候，看到一群蒙面人正在前厅砍杀你的护卫。

为首的那个人转过脸来。火光照亮了他的五官——你认出了他。三年前，你为了夺取一块地皮，罗织罪名把他父亲逼得上吊自杀。那时候他是跪在你面前求饶的少年。

现在他手里握着一把染血的刀。

"你还记得我父亲吗？"他的声音出奇地平静。

你想跑，但腿不听使唤。

刀锋切入身体的时候，你竟然没有感到疼痛。只是一种奇怪的麻木，像是灵魂先于肉体离开了躯壳。

倒在地上之前，你看到的最后画面是漫天的星斗。它们冷漠地俯视着你，就像你这辈子冷漠地俯视过无数人一样。

尸体第二天被发现时已经被野狗啃食得面目全非。没有人来收殓，没有人来凭吊。你在人间留下的最后痕迹，是刑房墙上的一份未结案卷——"某年某月某夜，某人死于不明原因。疑仇杀，无从查起。"

《明史》不载此人。
`
      }
    },
    {
      id: 'c2',
      text: '我想重新做人',
      effects: {
        hidden: { 道德值: 30 },
        special: { type: 'ending' }
      },
      result: {
        title: '迷途知返',
        tags: ['道德回升', '个人命运', '救赎'],
        echo: `【结局·迷途知返】

"我想重新做人。"

说出这句话的时候，你哭了。这是多年来第一次流泪——不是因为疼痛或恐惧，而是因为一种久违的、叫做"羞耻"的情绪。

散财之路比你想象的更艰难。不是因为舍不得——那些钱财本来就是不义之财——而是因为没有人相信你的悔改。

第一个登门索偿的人朝你吐了口水。"伪君子！"他骂道，"装什么好人！"

第二个把你补偿的银两扔在了地上。"脏钱！谁要你的臭钱！"

第三个……没有第三个。消息传开后，再也没有受害者愿意接受你的赔偿。他们说："让他烂在自己的愧疚里吧。"

你没有放弃。

每天天不亮就起床，挨家挨户地赔罪、补偿、做工抵债。你帮人写过年的对联，替人挑过粪水，甚至在码头扛过大包——那些曾经对你卑躬屈膝的人，现在居高临下地看着你满身大汗的样子，脸上露出复杂的表情。

十年。

整整十年，你用行动一点点赎清了欠下的债——不是银两的债，是良心的债。

你去世的那天是一个普通的秋日。床边围着的不再是空荡荡的屋子——有当年被你伤害过的人，有受过你恩惠后来又失望过的朋友，有你的夫人（她八年前回来了），还有你现在已经长大成人的孩子。

他们没有说什么煽情的话。有人帮你擦了擦脸，有人给你倒了杯水，有人只是静静地坐在旁边。

够了。

《府志·隐逸传》载："某公，早年误入歧途，中年幡然悔悟，散财济贫，晚年以德行闻于乡里。卒年六十有七。乡人为之立碑，曰：'回头岸。'"
`
      }
    }
  ],
  type: 'ending'
}

/**
 * 阈值类结局的宽限期（月）。
 *
 * 寒门开局 `财帛` 只有 15，而它的第一个事件「家书催银」首选项就是 `财帛 -20`：
 * 变卖家产救母这个在叙事上被褒奖的选择，会把财帛直接打到 0，
 * 于是 `bankrupt` 在**开局第一个月**命中，一局当场结束 ——
 * 玩家连一次月俸都没来得及领，更没有任何回旋余地。
 *
 * 这与 `wrapBatchAsBoundaryEvents` 给叙事结局加的 `turn >= 36` 兜底是同一个原则：
 * 先让玩家真正开始经营，再让「归零」成为致命事件。
 *
 * 但**光有宽限期不够**，第十一轮的整局模拟实测到：宽限期只是把雷往后挪了十二个月，
 * 而挪出去的这段时间里归零毫无提示，于是 3/4 局恰好死在第 13 个月，
 * 一整局只碰得到 31/402 个事件。现在的规则是一句清楚的话：
 *   **同一个维度，归零两次才要命。**
 * 第一次归零由 `zeroWarningEvents` 那条 crisis 事件当面告知并给出回天之路（写下
 * `归零警告·X` 这个 flag），下面的 check 因此统一改成 `pastGrace && isFatalZero`
 * —— 没被警告过的归零不判死，警告过又再次归零的，这一次没有人再救你。
 */
const THRESHOLD_ENDING_GRACE_TURNS = 12

function pastGrace(params: BoundaryEventCheckParams): boolean {
  return (params.gameState?.turn ?? 0) >= THRESHOLD_ENDING_GRACE_TURNS
}

/** 阈值类结局的统一判据：过了宽限期、该维归零、且这一维已经被警告过 */
function doomedBy(params: BoundaryEventCheckParams, key: Parameters<typeof isFatalZero>[1]): boolean {
  return pastGrace(params) && isFatalZero(params, key)
}

/**
 * 手写 check 的党派结局专用的时间下限。
 *
 * 第十八轮实测（200 局）：《东林烈士》在**平均第 13 个月**就把一局打死，
 * 而它自己的文本写的是「甲申之变」「李自成攻入北京」「清军入关」—— 全是 1644 年的事。
 * 玩家 1629 年读到"三天后清军入关"，不是难度高，是这句话在说一件还没发生的事。
 *
 * 根因是这三条 check 与同一文件里另外两套规则各写各的：阈值结局有 `pastGrace`，
 * 编译器给叙事结局有 `NARRATIVE_MIN_YEAR / NARRATIVE_MIN_TURN`，
 * 而手写的三条什么下限都没有 —— `check` 里读都不读 `currentYear`。
 * 于是这一层不再重复发明下限，直接复用叙事结局那两个常量，
 * 再加一条"文本绑定在哪一年，闸门就至少开到哪一年"。
 */
function settledIn(params: BoundaryEventCheckParams, minYear: number): boolean {
  return (params.gameState?.turn ?? 0) >= NARRATIVE_MIN_TURN &&
    (params.currentYear ?? 0) >= Math.max(NARRATIVE_MIN_YEAR, minYear)
}

/** 《东林烈士》文本绑定甲申之变（1644）：那年还没到，就不许有人死在它里面 */
const MARTYR_MIN_YEAR = 1644
/** 《权奸末路》文本写「温体仁倒台后」—— 温体仁崇祯十年（1637）罢官 */
const TYRANT_MIN_YEAR = 1637

/**
 * 「哪一维归零收尾于哪个结局」的对照表。
 * 这张表过去只存在于八个 check 各写各的字面量里，而现在它是**规则的一半**：
 * 警告层按维度写 flag，结局按维度读 flag，两侧必须指同一个键。
 * 导出出来给测试与图鉴用 —— 将来加第九条死线，漏了这一行就会有人报错，
 * 而不是静默地"这个结局永远不需要警告"。
 */
export const THRESHOLD_ENDING_BY_KEY: Record<ZeroKey, string> = {
  财帛: ENDING_BANKRUPT.id,
  体质: ENDING_DEATH_ILLNESS.id,
  圣眷: ENDING_EMPEROR_HATE.id,
  中官: ENDING_EUNUCH.id,
  清议: ENDING_SCHOLAR_OSTRACISM.id,
  士绅: ENDING_GENTRY_REBELLION.id,
  民望: ENDING_POPULAR_UPROAR.id,
  道德值: ENDING_MORAL_DEGENERACY.id
}

export const BOUNDARY_EVENTS: BoundaryEvent[] = [
  {
    id: 'bankrupt',
    priority: 1,
    type: 'ending',
    check: (params) => doomedBy(params, '财帛'),
    event: ENDING_BANKRUPT
  },
  {
    id: 'death_illness',
    priority: 2,
    type: 'ending',
    check: (params) => doomedBy(params, '体质'),
    event: ENDING_DEATH_ILLNESS
  },
  {
    id: 'emperor_hate',
    priority: 3,
    type: 'ending',
    /**
     * `潜逃` 在身上时不触发 —— 这一格的文本是"锦衣卫已经围住了整个府邸，夫人被控制在厢房"，
     * 围的是一个**还在任上、还在自己家里**的官。
     *
     * 第二十五轮逐月抄表量到的同轴：《亡命江湖》(p127) 要 圣眷≤15，而 圣眷 归零就撞这一条(p3)，
     * p3 又压在所有格子最上面。实测 seed6431 弃官南还（票在第 31 月）之后一路掉到 圣眷最低 0
     * （同期 道德最低 15 · 体质 58 · 门开 0 个月 → 就是死在这条上）：那一格的**数值**门槛全中，
     * 年窗却要等到 1635 才开，于是人在门口之前就没了 —— 数值不缺，缺的是活着走到窗口。
     * 放开这一格不是饶他不死，是让他有机会活到自己那一格的门口；
     * 八条归零死线本身一条没绕，此后国势崩解、甲申国变那些不要官身的死线照样要他命。
     */
    check: (params) => doomedBy(params, '圣眷') && !params.flags?.includes(FUGITIVE_FLAG),
    event: ENDING_EMPEROR_HATE
  },
  {
    id: 'eunuch_conspiracy',
    priority: 4,
    type: 'ending',
    check: (params) => doomedBy(params, '中官'),
    event: ENDING_EUNUCH
  },
  {
    id: 'scholar_ostracism',
    priority: 5,
    type: 'ending',
    check: (params) => doomedBy(params, '清议'),
    event: ENDING_SCHOLAR_OSTRACISM
  },
  {
    id: 'gentry_rebellion',
    priority: 6,
    type: 'ending',
    check: (params) => doomedBy(params, '士绅'),
    event: ENDING_GENTRY_REBELLION
  },
  {
    id: 'popular_uproar',
    priority: 7,
    type: 'ending',
    check: (params) => doomedBy(params, '民望'),
    event: ENDING_POPULAR_UPROAR
  },
  {
    id: 'moral_degeneracy',
    priority: 8,
    type: 'ending',
    check: (params) => doomedBy(params, '道德值'),
    event: ENDING_MORAL_DEGENERACY
  },
  {
    id: 'serious_illness',
    priority: 10,
    type: 'crisis',
    check: (params) => params.attributes['体质'] < 20 && params.attributes['体质'] > 0,
    event: {
      id: 'boundary_serious_illness',
      title: '重病缠身',
      description: '政务堆积如山，你该如何抉择？',
      narrative: {
        speaker: { title: '太医', name: '李太医' },
        quote: '大人操劳过度，五脏俱损，需静养数月……否则……',
        background: '你突然病倒了。太医诊断后摇头叹息。',
        situation: '政务堆积如山，你该如何抉择？'
      },
      conditions: {},
      choices: [
        {
          id: 'c1',
          text: '强撑病体处理政务',
          effects: { attributes: { 体质: -15, 理政: 10 } },
          result: {
            title: '积劳成疾',
            tags: ['体质-15', '理政+10'],
            echo: '你咬牙坚持处理政务，病情却愈发严重。太医警告你再这样下去会没命的……'
          }
        },
        {
          id: 'c2',
          text: '告假休养',
          effects: { attributes: { 体质: 20, 理政: -15 } },
          result: {
            title: '安心养病',
            tags: ['体质+20', '理政-15'],
            echo: '你向朝廷告假，专心养病。身体逐渐好转，但政务因此堆积如山……'
          }
        },
        {
          id: 'c3',
          text: '寻名医',
          effects: { attributes: { 体质: 10, 财帛: -30 } },
          result: {
            title: '药到病除',
            tags: ['体质+10', '财帛-30'],
            echo: '你花重金请来江南名医，开了几副猛药，病情总算有了好转……'
          }
        }
      ],
      type: 'random'
    }
  },
  /**
   * 「内廷门路」：中官在低位（1~30）时，宫里的人最后一次递话。
   *
   * 为什么要这一条。整局模拟里 `中官` 已取代财帛成为头号死因：诗文清望开局 22 点，
   * 出身修正又把中官正增量打七折，aggressive 组 100 局里有 78 局死在它归零上。
   * 归零警告虽然给了三条回天之路，但一生只发一次；发过之后，这条路就彻底断了。
   *
   * 它不是被动漂移，也不是白给：三条都要付代价（财帛 / 圣眷 / 士绅），
   * 而且只在**低位**开一次门 —— 拉到 30 以上就再也刷不到，不能把中官存起来。
   * 已经 `潜逃` 的人不在这扇门内：一个通缉在案、印信留在案上的人，
   * 宫里不会接他的帖子（也不该在年窗里再把他最后一点盘缠换走）。
   *
   * priority 20 是有意的：排在八条归零警告（11~18）与「革职预警·贪墨」（19）之后。
   * 若与任何一条警告同月命中，警告先播；它绝不会替掉「第一次归零」的那次通知。
   * 冷却与 0.3 概率门走 `crisisEventMayShow` 的通用路径，`tests/unit/engine.boundary.test.ts`
   * 的 cooldown 用例覆盖同一张表。
   */
  {
    id: 'inner_court_channel',
    priority: 20,
    type: 'crisis',
    check: (params) => {
      if (params.flags?.includes(FUGITIVE_FLAG)) return false
      const v = params.gameState?.['中官']
      return typeof v === 'number' && v > 0 && v <= 30
    },
    event: {
      id: 'boundary_inner_court_channel',
      title: '内廷门路',
      description: '宫里还有人肯接你的帖子，只是价码一年比一年高。',
      narrative: {
        speaker: { title: '内官监', name: '赵公公' },
        quote: '大人这半年没进过宫门了。里头换了人，肯替您说话的那两个，一个调去了南京，一个病死了。再这么下去，往后您的折子递进去，谁替您念？',
        background:
          '你在外廷的名声不算差，宫里的路却一直是断的。\n\n赵公公托人带话，说愿意见一面。见这一面要备礼；不见，这条路就真的断了。往后再有构陷你的话头递到御前，不会有人替你说一句"未必有这事"。',
        situation: '内廷无人，这一步怎么走？'
      },
      conditions: {},
      choices: [
        {
          id: 'c1',
          text: '【封一份礼】封二十两礼银、二两门包，托赵公公递进司礼监',
          description: '用银子把断掉的门路重新铺一遍。',
          showConditions: { attributes: { 财帛: { min: 20 } } },
          effects: {
            attributes: { 财帛: -22 },
            gameState: { 中官: 26, 清议: -9 },
            hidden: { 道德值: -5 }
          },
          result: {
            title: '礼到路通',
            tags: ['中官+26', '财帛-22', '清议-9', '道德-5'],
            echo:
              '礼匣递进去第三天，赵公公的回帖到了，说往后有事只管递话。\n\n宫里终于有人肯接你的帖子。你在心里记了一笔账：这条路，是用银子铺的。'
          }
        },
        {
          id: 'c2',
          text: '【借言官的口】请两位御史把该说的话递上去，让宫里听见外头的声',
          description: '不送钱，把清议变成另一种内援。',
          effects: {
            gameState: { 中官: 14, 清议: 8, 圣眷: -9 },
            hidden: { 道德值: 2 }
          },
          result: {
            title: '清议为援',
            tags: ['中官+14', '清议+8', '圣眷-9', '道德+2'],
            echo:
              '折子递上去，宫里果然有人提起你的名字——不是替你说好话，是说你身后站着一群言官。\n\n圣心不悦。可从此动你要掂量：外头的声音，也是一种内援。'
          }
        },
        {
          id: 'c3',
          text: '【认一门干亲】让家中子侄拜在赵公公名下，逢节走动',
          description: '把内廷的关系变成一门亲戚，代价写在士林的风评里。',
          effects: {
            gameState: { 中官: 18, 士绅: -9 },
            hidden: { 道德值: -6, 野心值: 4 }
          },
          result: {
            title: '内廷有亲',
            tags: ['中官+18', '士绅-9', '道德-6', '野心+4'],
            echo:
              '拜帖换了庚帖，赵公公成了你子侄的干爷爷。\n\n士林里有人说你"自甘下流"。宫里却从此有你一门亲——这门亲不写在家谱上，写在你的官运里。'
          }
        }
      ],
      type: 'random'
    }
  },
  {
    id: 'faction_donglin_martyr',
    priority: 15,
    type: 'ending',
    check: (params) => {
      const f = params.faction
      const flags = params.flags || []
      return settledIn(params, MARTYR_MIN_YEAR) && !!f &&
        f.东林好感 >= 80 && f.阉党好感 <= 20 &&
        (flags.includes('东林死忠') || flags.includes('复社成员')) &&
        (params.gameState?.['清议'] ?? 0) >= 60
    },
    event: {
      id: 'triggerable_faction_martyr',
      title: '东林烈士',
      description: '牢门被撞开了。不是来救你的人——是满清的铁骑已经到了城下。看守们早就逃散了。你独自站在空荡荡的牢房里，听着远处传来的厮杀声和哭喊声。',
      endingConfig: { category: 'personal_fate', tier: 'saintly' },
      narrative: {
        speaker: { title: '史官', name: '后人' },
        quote: '先生之风，山高水长。虽九死其犹未悔。',
        background: '甲申之变的消息传来时，你正在狱中。\n\n因为坚持抗清、拒绝议和，你被温体仁之流罗织罪名、投入诏狱。他们以为只要把你关起来，朝中就再没有人敢说"不"字了。\n\n但他们错了。你的文章在民间广为流传，你的名字被士子们口口相传。你不是一个人——你代表了一种精神，一种在这个污浊的世道里依然有人愿意坚守的东西。',
        situation: '牢门被撞开了。不是来救你的人——是满清的铁骑已经到了城下。看守们早就逃散了。你独自站在空荡荡的牢房里，听着远处传来的厮杀声和哭喊声。'
      },
      conditions: {},
      choices: [
        {
          id: 'c1',
          text: '殉国明志',
          effects: {
            hidden: { 道德值: 10 },
            special: { type: 'ending' }
          },
          result: {
            title: '碧血丹心',
            tags: ['东林烈士', '道德回升', '个人命运', '圣贤'],
            echo: `【结局·东林烈士】

你在狱中的墙壁上留下了最后一首诗：

"丹心一片磁针石，不指南方不肯休。
臣心一片磁针石，不指南方不休。"

然后你整理好衣冠，面向南方——那是大明朝廷的方向——从容自缢。

三天后，李自成攻入北京。又四十多天，清军入关。

你的尸骨后来被人收殓，葬在城外的一座小山上。墓碑上没有名字，只刻了四个字："有明忠臣"。

每年清明，总有不认识的人来扫墓。他们不知道你是谁，但知道这里埋着一个不肯屈服的人。

《明史·忠义传》载："某公，以东林死节。临终赋诗明志，从容就义。士大夫闻之，皆掩面流涕。"
`
          }
        }
      ],
      type: 'ending'
    }
  },
  {
    id: 'faction_tyrant_fall',
    priority: 16,
    type: 'ending',
    check: (params) => {
      const f = params.faction
      const flags = params.flags || []
      return settledIn(params, TYRANT_MIN_YEAR) && !!f &&
        f.阉党好感 >= 70 && f.东林好感 <= 15 &&
        !flags.includes('阉党路线') &&
        flags.includes('叛徒') &&
        (params.hidden?.['道德值'] ?? 50) <= 30
    },
    event: {
      id: 'triggerable_faction_tyrant_fall',
      title: '权奸末路',
      description: '一个雨夜，几个蒙面人闯入了你的府邸。',
      endingConfig: { category: 'ming_fate', tier: 'dark' },
      narrative: {
        speaker: { title: '旧友', name: '匿名' },
        quote: '你以为出卖了温体仁就能洗白自己？太天真了。在所有人眼里，你就是一条见利忘义的疯狗。',
        background: '温体仁倒台后，你本以为可以借着"大义灭亲"的光环重新开始。\n\n但你错了。东林党人看不起你——"这种人今天能卖温体仁，明天就能卖我们"。阉党余孽恨死你——"吃里扒外的狗东西"。就连皇帝看你的眼神也充满了鄙夷和猜忌。\n\n你已经无路可走。',
        situation: '一个雨夜，几个蒙面人闯入了你的府邸。他们什么都没抢——只是把你绑到了城外的乱葬岗。'
      },
      conditions: {},
      choices: [
        {
          id: 'c1',
          text: '听天由命',
          effects: { special: { type: 'ending' } },
          result: {
            title: '众叛亲离',
            tags: ['权奸末路', '道德极低', '大明国运', '黑暗'],
            echo: `【结局·权奸末路】

领头的人摘下了蒙面布。

你认出了他——是当年被你陷害的那个言官。他如今已是六科给事中，而你——不过是一条丧家之犬。

"当年你帮温体仁整我的时候，想过会有今天吗？"他的声音很平静，平静得让你发抖。

你没有回答。没什么好说的。

刀落下来的时候，你想起了很多事：第一次见到温体仁时的诚惶诚恐，第一次拿到回扣时的忐忑不安，第一次背叛旧友时的辗转反侧……以及最后一次——当你决定出卖温体仁时的那种解脱感。

原来那不是解脱。那只是通往另一个地狱的开始。

你的尸体被扔在了乱葬岗上，和那些真正的罪犯混在一起。没有人来收尸，没有人来凭吊。

只有路过的野狗停下来嗅了嗅，然后摇摇头走了——连它们都觉得你不配被吃掉。
`
          }
        }
      ],
      type: 'ending'
    }
  },
  {
    id: 'faction_sacrifice',
    priority: 17,
    type: 'ending',
    check: (params) => {
      const f = params.faction
      return settledIn(params, NARRATIVE_MIN_YEAR) && !!f && f.党争烈度 >= 90 &&
        Math.abs(f.东林好感 - f.阉党好感) < 20 &&
        f.东林好感 < 40 && f.阉党好感 < 40
    },
    event: {
      id: 'triggerable_faction_sacrifice',
      title: '党争牺牲品',
      description: '最新的弹劾奏章送到了吏部。',
      endingConfig: { category: 'personal_fate', tier: 'tragic' },
      narrative: {
        speaker: { title: '心声', name: '' },
        quote: '我到底做错了什么？我只是想好好当个官而已……',
        background: '你谁也不想得罪，结果得罪了所有人。\n\n东林党人说你"圆滑世故、毫无原则"；阉党那边嫌你"不够意思、靠不住"；皇帝觉得你"优柔寡断、难堪大用"。\n\n两派斗争越来越激烈，而你就夹在中间，像一颗被反复碾压的棋子。今天这派弹劾你，明天那派参你一本。你的政绩无人关心，你的才能无人赏识——所有人都只关心你站哪边。',
        situation: '最新的弹劾奏章送到了吏部。这一次，两边联手了——因为他们终于达成了一个共识：你这个"墙头草"，留着也是祸害。'
      },
      conditions: {},
      choices: [
        {
          id: 'c1',
          text: '黯然离场',
          effects: { special: { type: 'ending' } },
          result: {
            title: '两头不到岸',
            tags: ['党争牺牲品', '个人命运', '悲剧'],
            echo: `【结局·党争牺牲品】

革职的命令来得并不意外。

你收拾行李的时候，甚至有一种如释重负的感觉。再也不用每天提心吊胆地揣摩上意，再也不用在两个阵营之间战战兢兢地走钢丝了。

回乡的路上，你经过了一座茶馆。里面有人在议论朝局：

"听说那个某某也被革了？"
"活该！谁让他两边都想讨好？"
"也是可怜，其实他也没做什么坏事……"
"哼，在这世道，不做选择本身就是一种选择。"

你苦笑了一下，继续赶路。

《野史·党祸录》载："某公，才具中等，操守尚可。唯于党争之际左右摇摆，终致两不容于朝。革职归里，郁郁而终。年五十有三。"
`
          }
        }
      ],
      type: 'ending'
    }
  },

  // 八条「归零警告」crisis 事件：上面那八条 check 要求先见过这一面，见 zeroWarningEvents.ts
  ...zeroWarningEvents,

  // 「革职预警·贪墨」：severity 3 的即时革职也要先当面说一次，见 demotionWarningEvents.ts
  ...corruptionWarningEvents
]

boundaryEventManager.registerBatch(BOUNDARY_EVENTS)

// ===========================================================================
// 批量注册 narrative 结局到 BoundaryEventManager
// 由 boundaryEventCompiler 自动将 conditions 编译为 check 函数
// 强制兜底：所有 narrative 结局至少 year >= 1630（开局 2 年后）才可触发
// ===========================================================================
const NARRATIVE_ENDING_IDS = new Set(BOUNDARY_EVENTS.map(e => e.event.id))

const allNarrativeEndings: GameEvent[] = [
  ...mainNarrativeEndings as GameEvent[],
  ...debaucheryEndingEvents,
  // 兜底格《寿终正寝》必须排在**最后**：`wrapBatchAsBoundaryEvents` 按下标发优先级，
  // 而 `checkByType` 是"数字小的先赢"。它读的是年岁、没有年窗，一旦排到前面，
  // 就会在每个七十岁玩家的月份上抢掉甲申国变、南渡续祚这些正局。
  // 第五十六轮 §1.4 ㉟：全部年窗封顶 1660、又没人读年岁，熬过去的人从此不朽。
  OLD_AGE_ENDING_TILE
]

const additionalNarrativeEndings = allNarrativeEndings.filter(
  e => e.type === 'ending' && !NARRATIVE_ENDING_IDS.has(e.id)
)

const wrappedAdditional = wrapBatchAsBoundaryEvents(
  additionalNarrativeEndings as GameEvent[],
  100
)

boundaryEventManager.registerBatch(wrappedAdditional)

const ENDING_FACTION_DONGLIN_MARTYR = BOUNDARY_EVENTS.find(e => e.id === 'faction_donglin_martyr')!.event
const ENDING_FACTION_TYRANT_FALL = BOUNDARY_EVENTS.find(e => e.id === 'faction_tyrant_fall')!.event
const ENDING_FACTION_SACRIFICE = BOUNDARY_EVENTS.find(e => e.id === 'faction_sacrifice')!.event

export const triggerableEndingEvents: GameEvent[] = [
  ENDING_BANKRUPT,
  ENDING_DEATH_ILLNESS,
  ENDING_EMPEROR_HATE,
  ENDING_EUNUCH,
  ENDING_SCHOLAR_OSTRACISM,
  ENDING_GENTRY_REBELLION,
  ENDING_POPULAR_UPROAR,
  ENDING_MORAL_DEGENERACY,
  ENDING_FACTION_DONGLIN_MARTYR,
  ENDING_FACTION_TYRANT_FALL,
  ENDING_FACTION_SACRIFICE
]
