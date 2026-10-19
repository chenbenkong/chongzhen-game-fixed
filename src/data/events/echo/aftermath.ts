import { GameEvent } from '../../../types/event'

/**
 * 第二波回响（aftermath）。
 *
 * 第十五轮的回响池把"老内容写出去没人收"的经历接上了；但它自己又产出了一批新的死条子——
 * 第十六轮实测（warden / steady 各 100 局）：**携带最多的 invisible 经历里，十条有七条
 * 是回响池自己写的**。`不系一党` 在 100 局里被带上身 49 次，而全游戏没有一处读它。
 *
 * 所以这一池不是"新剧情"，是**回响的下文**：玩家在前一环里替自己画的那个格子，
 * 过几年一定要在别处付账。判断标准沿用 echo/index.ts 那一条——
 * 只给实测真会被带上身、且没有任何读者的经历写下游。
 *
 * 接线（读 → 本池事件）：
 *   不系一党 / 半门之客 / 求外避察 / 晚归清流 / 负讥不辩 / 改文之讥 → echo_faction_006 不系之名
 *   乡里护产 / 让善于乡 / 乡党依倚 / 孝廉之名 / 债清人疏           → echo_family_004 学田的碑
 *   wife_broken / tyrant_husband / wife_hurt / concubine_killed /
 *   wife_jealous / pingqi_attempt                                  → echo_family_005 门内门外
 *   恩义付之 / 改漕之案 / 三日之信                                  → echo_emotion_007 李家的旧账
 *   lixiangjun_disappointed / lixiangjun_poem / 桃花扇底 / 还扇之义 /
 *   ruan_dacheng_enemy                                             → echo_emotion_008 扇价
 *   史馆辞笔（史馆请笔拒过笔的那一段）                              → echo_shiguan_001 史馆又来
 *
 * 最后一条是第二十二轮加进来的，它补的是一处**改出来的缺口**：拒笔的闸门从前只有
 * `史馆辞笔` 一条、而且是十三格善终的公共 notHas；本轮把闸门拆成逐格的 `搁笔·<格名>`
 * （见 `src/data/endingDecline.ts` 顶部），`史馆辞笔` 就从"闸门"降级成"一段经历"。
 * 一段没人读的经历等于没发生过，所以给它写一个正面读者：史官记得你拒过笔，
 * 过几年来问那一页到底留白到什么时候。
 *
 * **这一池刻意不产新词**：每个选项除了自己的 `echo_*_done` 一次性开关之外，
 * 落笔只写早已存在的 flag。第十五轮的教训是回响池自己变成新的白存堆，这一池宁可只当读者。
 */
export const aftermathEchoEvents: GameEvent[] = [
  {
    id: 'echo_faction_006',
    storyline: 'ordinary',
    type: 'transition',
    title: '不系之名',
    description: '考功司把你在京察上写的那句话，立成了一个名目。',
    narrative: {
      speaker: { title: '吏部考功司主事', name: '沈敬舆' },
      quote: '册上"不系"二字，近年成了一种考语。堂官问我：这种人是可起，还是可弃？',
      background: `你当年在两份名册之间画了同一句，或者收了帖子不赴，或者索性求外任跳出那个格子。当年看你这样做的人，如今有的已不在朝，有的正替你写考语。

考功司的册子上多了一类人，名目就叫"不系"。它不是贬词，也不是荐词，它只是一个方便的归档。

沈敬舆是后辈，说话直："堂官的意思，是想知道这个人到底能不能自己走。"`,
      situation: '一个名目已经替你答过一次；这一回要你自己答。'
    },
    conditions: {
      year: { min: 1632, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        any: ['不系一党', '半门之客', '求外避察', '晚归清流', '负讥不辩', '改文之讥'],
        notHas: ['echo_faction_006_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'ordinary',
        text: '【仍不系】"名目是你们的，格子是我自己的"',
        description: '认下这个归档，不再往任何一边挪',
        effects: {
          attributes: { 理政: 3 },
          gameState: { 清议: 3, 圣眷: -4, 民望: 4 },
          hidden: { 道德值: 4, 野心值: -6 },
          flags: { add: ['echo_faction_006_done'] }
        },
        result: {
          title: '一格六年',
          tags: ['理政+3', '清议+3', '圣眷-4', '民望+4', '道德+4', '野心-6'],
          echo: `你回了一句："某不系，非不能系，是不肯系。"

沈敬舆把这句话原样誊上去，誊完自己看了一眼，说："这句更像人话。"

铨选仍然不看人话。你的名次在那一格裡又停了三年，三年里办成的事照旧入档，档照旧没人翻。

但有一桩小事：那年冬天，考功司来了两个新人问"不系"该怎么写考语。他们没问堂官，问的是你。`
        }
      },
      {
        id: 'c2',
        storyline: 'eastern_forest',
        text: '【改名目】"把不系两个字划去，我署自己的名字"',
        description: '终于肯在一边落名',
        showConditions: {
          flags: { any: ['不系一党', '晚归清流', '求外避察'] }
        },
        effects: {
          attributes: { 文韬: 3 },
          gameState: { 清议: 12, 中官: -8, 圣眷: 3 },
          hidden: { 道德值: 6, 机敏值: -4 },
          flags: { add: ['echo_faction_006_done', '东林系'] }
        },
        result: {
          title: '划去两个字',
          tags: ['文韬+3', '清议+12', '中官-8', '圣眷+3', '道德+6', '机敏-4'],
          echo: `你当着他的面把"不系"划了，在旁边写下三个人的名字：一个已死，一个戍边，一个还在翰林院里不肯见客。

沈敬舆不敢抄那三个名字，只抄了"清议可倚"四个字。

一个月后，都察院有人荐你。荐疏写得很短，末尾一句："此人往年独立，今始有归。"

你读了两遍。"始"这个字，等得有点久。`
        }
      },
      {
        id: 'c3',
        storyline: 'corrupt',
        text: '【再走一次半门】"帖子既然留过，话不妨说完"',
        description: '把当年收帖不赴的那半截情补足',
        showConditions: {
          flags: { any: ['半门之客'] }
        },
        effects: {
          attributes: { 财帛: 15 },
          gameState: { 中官: 12, 清议: -10, 士绅: -4 },
          hidden: { 欲望值: 8, 道德值: -8 },
          flags: { add: ['echo_faction_006_done', '内廷奥援'] }
        },
        result: {
          title: '门轴没换',
          tags: ['财帛+15', '中官+12', '清议-10', '士绅-4', '欲望+8', '道德-8'],
          echo: `你托人把那张旧帖子的事问完了。答复来得很快：一笔拖了三年的料银，一夜解齐；一个缺，说"某人想要"。

王德化已不在内官监，接话的是他侄儿。那孩子客气得过分："大人当年留一半，如今肯来，我们自然尽一半。"

尽一半的意思你六年前就懂。只是如今你身上多了一个名目：不是"不系"，是"内廷之可用人"。

这个名目在考功司的册子上，比"不系"好看得多，也好用得少。`
        }
      },
      {
        id: 'c4',
        storyline: 'eastern_forest',
        text: '【把那篇文章认下】"他骂的是道理，我欠的也是道理"',
        description: '不辩、不改、不躲，把旧账当面写清',
        showConditions: {
          flags: { any: ['负讥不辩', '改文之讥'] }
        },
        effects: {
          attributes: { 文韬: 5 },
          gameState: { 清议: 8, 圣眷: -2 },
          hidden: { 道德值: 8, 机敏值: -3 },
          flags: { add: ['echo_faction_006_done', '直笔'] }
        },
        result: {
          title: '补一页',
          tags: ['文韬+5', '清议+8', '圣眷-2', '道德+8', '机敏-3'],
          echo: `你在自己的文集末尾补了一页，把那篇骂你的文章全文收进去，题下注一句："黄先生之作，存之以见某之失。"

刻书的坊匠来问："这……要不要撤几行？"你说一行也不撤。

书成之后，骂你的那位读到了，托人带话，只有五个字："他还算个直笔。"

你等这句话等了七年。等到时你已经不在意了，但你还是把它写进了日记。`
        }
      }
    ]
  },

  {
    id: 'echo_family_004',
    storyline: 'family',
    type: 'transition',
    title: '学田的碑',
    description: '族里立了一方学田的碑，刻名的人来问你一句话。',
    narrative: {
      speaker: { title: '族中长老', name: '族叔' },
      quote: '田是你当年护下来的，碑上要不要你的名字，族里争了三日。',
      background: `你在乡评最重的那两年，替家里争过一份学田与赋役；或者你把那份好处让了出去，只认家事不认功名；又或者你把三笔人情全数还清，从此与乡党两讫。

无论哪一种，乡里都记住了你那个举动，而且记的不是同一件事。

如今族里要立碑。主事的老者说：碑上写你，族里三分之一的人不服；不写你，那田的来路就不清白。`,
      situation: '一方碑，两个难处——名字要不要落下去。'
    },
    conditions: {
      year: { min: 1631, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        any: ['乡里护产', '让善于乡', '乡党依倚', '孝廉之名', '债清人疏'],
        notHas: ['echo_family_004_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'family',
        text: '【辞碑】"田是族里的，名是我的，两不相干"',
        description: '坚辞刻名，只出钱不出名字',
        effects: {
          attributes: { 财帛: -8 },
          gameState: { 民望: 8, 清议: 3, 士绅: -3 },
          hidden: { 道德值: 8, 野心值: -6 },
          flags: { add: ['echo_family_004_done'] }
        },
        result: {
          title: '无名之碑',
          tags: ['财帛-8', '民望+8', '清议+3', '士绅-3', '道德+8', '野心-6'],
          echo: `你回了书："碑不必刻某；刻某，则田为某人所有，非族所有。"

族里照办。碑上只写"里人共成"，末行附一小注，说明银两来自何姓一族。

那年冬天有人从乡里来京，说你那方碑前多了两座小堆：一堆是本族送来的田契副本，一堆是外姓送来求你说话的帖子。

你笑道：我不刻名，他们倒把我刻进别处了。`
        }
      },
      {
        id: 'c2',
        storyline: 'power',
        text: '【认名】"田是我争的，我认"',
        description: '把当年借乡评护住的那份产业正式收到自己名下',
        showConditions: {
          flags: { any: ['乡里护产'] }
        },
        effects: {
          attributes: { 财帛: 18 },
          gameState: { 士绅: 10, 民望: -6, 清议: -6 },
          hidden: { 欲望值: 10, 道德值: -6 },
          flags: { add: ['echo_family_004_done', '乡党依倚'] }
        },
        result: {
          title: '入己名',
          tags: ['财帛+18', '士绅+10', '民望-6', '清议-6', '欲望+10', '道德-6'],
          echo: `碑成那日，你的名字刻在正中，下头列学田四十一亩、佃若干户。

三日后，同乡一位举子投来一纸诉状，说那四十一亩里有十二亩是公产，"借乡评为名，入私券为实"。

状子没有告准。你在本地的名声从此分成两种声音：一种说你能护家，一种说你能挪公。

这两种声音都要吃饭，也都不要饭。你只记得立碑那天，族里小孩指着你的名字问："这是我家的田吗？"`
        }
      },
      {
        id: 'c3',
        storyline: 'family',
        text: '【归田于族】"把当年的账一次结清"',
        description: '立族规、设义庄，让那笔债永远不必再算',
        showConditions: {
          flags: { any: ['债清人疏', '让善于乡'] }
        },
        effects: {
          attributes: { 财帛: -22 },
          gameState: { 民望: 12, 清议: 8, 士绅: 5 },
          hidden: { 道德值: 12, 野心值: -4 },
          flags: { add: ['echo_family_004_done', '孝廉之名'] }
        },
        result: {
          title: '义庄',
          tags: ['财帛-22', '民望+12', '清议+8', '士绅+5', '道德+12', '野心-4'],
          echo: `你出银子，把学田定成义庄：鳏寡孤独得粮，族中子弟得学费，你一份不取。

立约那日，当年替你还过债、又与你两讫的几个人到场。他们握着契书看了很久，把纸推回来："我们不是要这块田。"

你明白那句话：他们要的是当年那一笔不是白给。

于是你当众把旧账念了一遍，念完再无人说话。县里的乡约所把你的名字写进了"孝义"一栏。`
        }
      },
      {
        id: 'c4',
        storyline: 'family',
        text: '【请邑志载之】"田不足道，法该留下一条"',
        description: '把乡里分利的规矩写进地方志',
        showConditions: {
          flags: { any: ['孝廉之名', '乡党依倚'] }
        },
        effects: {
          attributes: { 文韬: 4, 理政: 3 },
          gameState: { 清议: 10, 圣眷: 3, 民望: 4 },
          hidden: { 道德值: 5 },
          flags: { add: ['echo_family_004_done'] }
        },
        result: {
          title: '志一部',
          tags: ['文韬+4', '理政+3', '清议+10', '圣眷+3', '民望+4', '道德+5'],
          echo: `你修的不是家谱，是赋役那一卷：写明学田如何议、如何派、如何防住被挪。

邑志成书，主修在你名下行文写："里中义田之设，自某始。"

后来本县三处乡约都照你那一卷办。你官位不高，但你写的规矩活过了你的任。`
        }
      }
    ]
  },

  {
    id: 'echo_family_005',
    storyline: 'female',
    type: 'transition',
    title: '门内门外',
    description: '你家里那一年闹的事，第二年变成了外头的闲话。',
    narrative: {
      speaker: { title: '母亲', name: '太夫人' },
      quote: '外头的话我不管，我只问一句：这个家还要不要像个家。',
      background: `有一年，你在内宅做了一件不好解释的事：或拂袖压人，或偏心一面，或干脆同意纳妾以延续香火。

这类事从来不会只关在门内。第二年它就到了亲戚席上、到了你母亲的枕头边、到了同僚夫人的口耳之间。

如今家里要办一件事——一位族亲的婚，来客要见全家。`,
      situation: '门内的账，要在门外的席上过一次。'
    },
    conditions: {
      year: { min: 1632, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        any: [
          'wife_broken',
          'tyrant_husband',
          'wife_hurt',
          'concubine_killed',
          'wife_jealous',
          'pingqi_attempt'
        ],
        notHas: ['echo_family_005_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'family',
        text: '【亲迎正室】"今日上席的只有她"',
        description: '把体面还给被冷落的那一位',
        effects: {
          attributes: { 财帛: -10 },
          gameState: { 士绅: 5, 民望: 4, 清议: 3 },
          hidden: { 道德值: 10, 欲望值: -6 },
          flags: { add: ['echo_family_005_done', 'wife_respected'] }
        },
        result: {
          title: '上席',
          tags: ['财帛-10', '士绅+5', '民望+4', '清议+3', '道德+10', '欲望-6'],
          echo: `你把正室的轿排在自家门前第一位，自己到廊下接。族里女眷看见的是：这个官人家的夫人，是被人当夫人待的。

席散后她没有道谢。她只说了一句："我不是做给亲戚看的。"

你说："我知道。但也不是给你看的。"`
        }
      },
      {
        id: 'c2',
        storyline: 'corrupt',
        text: '【以母命压席】"家事不必外议"',
        description: '让族里闭嘴，把闲话按回去',
        showConditions: {
          flags: { any: ['tyrant_husband', 'wife_broken'] }
        },
        effects: {
          gameState: { 士绅: 8, 民望: -8, 清议: -8 },
          hidden: { 道德值: -10, 野心值: 5 },
          flags: { add: ['echo_family_005_done', '纳妾之议'] }
        },
        result: {
          title: '压席',
          tags: ['士绅+8', '民望-8', '清议-8', '道德-10', '野心+5'],
          echo: `你请出母亲的话："家无二主，外言不入内。"族里当下无人再言。

第二日，你两位表亲的婚约都改了日子。你听见的是"不敢搅扰"；你听不见的是他们回家路上说的那半句。

家里的规矩立住了。只是从此家事再无人来报喜——来报的都是要你看一眼的东西。`
        }
      },
      {
        id: 'c3',
        storyline: 'family',
        text: '【请族老调停】"我办不了的家，请叔伯办"',
        description: '把内宅的账交给族里公议',
        showConditions: {
          flags: { any: ['wife_hurt', 'wife_jealous', 'pingqi_attempt'] }
        },
        effects: {
          attributes: { 财帛: -12 },
          gameState: { 民望: 8, 清议: 6 },
          hidden: { 道德值: 8, 机敏值: -5 },
          flags: { add: ['echo_family_005_done', 'harmonious_family'] }
        },
        result: {
          title: '公议',
          tags: ['财帛-12', '民望+8', '清议+6', '道德+8', '机敏-5'],
          echo: `族中三位长老到堂，你正室与妾室隔帘听断。判词很朴素：分月、分用度、不许互称。

你在堂下听着别人议自己的家事，第一次知道那些事在别人嘴里是什么样子。

断完，族老说了一句："你官做得不小，理却不认得。往后先认理。"

那之后家里安静了，也冷了。安静与冷，是同一天来的。`
        }
      },
      {
        id: 'c4',
        storyline: 'family',
        text: '【为那条命做道场】"我不辩，我只出钱"',
        description: '给去母留子那条命做七日佛事，堵住外议',
        showConditions: {
          flags: { any: ['concubine_killed'] }
        },
        effects: {
          attributes: { 财帛: -25 },
          gameState: { 民望: 6, 清议: -4, 士绅: -3 },
          hidden: { 道德值: 6, 欲望值: -8 },
          flags: { add: ['echo_family_005_done'] }
        },
        result: {
          title: '七日',
          tags: ['财帛-25', '民望+6', '清议-4', '士绅-3', '道德+6', '欲望-8'],
          echo: `你请僧人做了七日道场，疏文上写"亡妾某氏"，不写因由。

乡里议论了半个月，最后落成一句话："他总还算认。"

孩子在正室名下长大，叫你"父亲"的时候很规矩，从不叫你"爹"。这半寸距离，是你那笔钱买不回来的。`
        }
      }
    ]
  },

  {
    id: 'echo_emotion_007',
    storyline: 'female',
    type: 'transition',
    title: '李家的旧账',
    description: '当年那条船的事，两年后连本带利回来了。',
    narrative: {
      speaker: { title: '漕运书办', name: '周书办' },
      quote: '李家的船没回来。案卷上有一句"某官不预闻"，是大人你的口吻。',
      background: `那年有人来求你，你既不救也不害，只把恩义留在原地；或者你动用关系把案子从源头改了改；又或者你提前三日把消息递了出去。

李家那条船的下落，两年里换了三种说法：沉了、卖了、抄了。唯一不变的是案卷里有一句你的话。

如今漕政清查旧案，那句话被人挑出来，问是谁写的。`,
      situation: '一句不救不害的话，如今要重新解释一次。'
    },
    conditions: {
      year: { min: 1633, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        any: ['恩义付之', '改漕之案', '三日之信'],
        notHas: ['echo_emotion_007_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'ordinary',
        text: '【不认】"某不预闻，原话在此"',
        description: '把当年那句"不救不害"照原样再说一遍',
        effects: {
          gameState: { 清议: -5, 民望: -4, 圣眷: 3 },
          hidden: { 道德值: -6, 机敏值: 4 },
          flags: { add: ['echo_emotion_007_done'] }
        },
        result: {
          title: '原话',
          tags: ['清议-5', '民望-4', '圣眷+3', '道德-6', '机敏+4'],
          echo: `你把那六个字重抄一遍，封回。清查的官没有再问——问不动，因为"不预闻"在律上确实无罪。

周书办走时行了一礼，礼数很足。你后来才想明白：礼数足是因为他没辙，不是因为你有理。

那一年你在漕政上没人再借力，也没人再借力给你。`
        }
      },
      {
        id: 'c2',
        storyline: 'power',
        text: '【认下那笔更大的】"案子是我改的，我认"',
        description: '把当年动用关系的那件事摆到明处，另换一桩人情',
        showConditions: {
          flags: { any: ['改漕之案'] }
        },
        effects: {
          attributes: { 财帛: -18 },
          gameState: { 士绅: 8, 民望: 6, 圣眷: -5, 清议: -3 },
          hidden: { 道德值: 6, 野心值: 4 },
          flags: { add: ['echo_emotion_007_done', '动用关系'] }
        },
        result: {
          title: '认账',
          tags: ['财帛-18', '士绅+8', '民望+6', '圣眷-5', '清议-3', '道德+6', '野心+4'],
          echo: `你去清查衙门自己把话说圆了：改案是你，主事者不知情。

罚俸一年，案结。李家的余产从官卖成了民卖，你替他们出了中间那道差价。

受恩的那位当夜遣人送来一坛酒，附一句："大人往后再有事，某仍不知。"

你笑了。这句话翻译过来是：你这次是真的欠下了。`
        }
      },
      {
        id: 'c3',
        storyline: 'female',
        text: '【寻那三日】"当年知道我早说三日的人，还在么"',
        description: '去寻那位因你提前三日而走脱的人',
        showConditions: {
          flags: { any: ['三日之信', '恩义付之'] }
        },
        effects: {
          attributes: { 体质: -3 },
          gameState: { 民望: 6, 清议: 4 },
          hidden: { 道德值: 10, 欲望值: -4 },
          flags: { add: ['echo_emotion_007_done', '守口至终'] }
        },
        result: {
          title: '城南一头',
          tags: ['体质-3', '民望+6', '清议+4', '道德+10', '欲望-4'],
          echo: `你寻到城南一处绣坊。坊主的手在抖——那三日她记得，比你自己记得还清楚。

她没有求你什么。她只说："当年我走的时候，门口灯笼是您灭的。"

你坐了半个时辰，喝了一碗凉茶，回去时天已黑透。

清查的官后来问你可认识李家人，你答："不认识。"这一次答得比头一次快。`
        }
      },
      {
        id: 'c4',
        storyline: 'corrupt',
        text: '【把旧恩折价】"恩义留着也生不了利息"',
        description: '用当年那点未算清的情面，换一桩现成的便宜',
        showConditions: {
          flags: { any: ['恩义付之'] }
        },
        effects: {
          attributes: { 财帛: 20 },
          gameState: { 清议: -8, 民望: -5 },
          hidden: { 道德值: -12, 欲望值: 10 },
          flags: { add: ['echo_emotion_007_done', '贪声已著'] }
        },
        result: {
          title: '折价',
          tags: ['财帛+20', '清议-8', '民望-5', '道德-12', '欲望+10'],
          echo: `你把那份未算清的情面提给了牙行：漕折的价差里，你得一十八两。

事情办得极快。快到那晚你翻账本，看见自己把"李家"两个字写成了数目。

两年后你被同僚在密参里提了一句："某官于漕折有旧利。"没有实据，但也没有人替你说没有。`
        }
      }
    ]
  },

  {
    id: 'echo_emotion_008',
    storyline: 'female',
    type: 'transition',
    title: '扇价',
    description: '阮大铖要复出了，桃叶渡那把扇子的价钱也跟着变。',
    narrative: {
      speaker: { title: '秦淮旧妪', name: '卞玉京' },
      quote: '当年那把扇子，如今有人出百金买一句"他肯替阮大人说话"。',
      background: `香君那把扇子在你手里过：你收下了、替她藏了，还是劝她把扇子扔了。

那时大家都年轻，一把扇子只是扇子。如今阮大铖将在朝中复用，桃叶渡的旧事都成了可以换算的东西。

来的是卞玉京，她不带信，只带一句话：有人要买，你卖不卖。`,
      situation: '一件旧情被标了价。标价的人不是她，也不是你。'
    },
    conditions: {
      year: { min: 1634, max: 1644 },
      month: { min: 1, max: 12 },
      flags: {
        any: [
          'lixiangjun_disappointed',
          'lixiangjun_poem',
          '桃花扇底',
          '还扇之义',
          'ruan_dacheng_enemy'
        ],
        notHas: ['echo_emotion_008_done']
      }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'female',
        text: '【却之】"扇子不是我的，我不敢卖"',
        description: '不接这个价钱，也不接这个人情',
        effects: {
          attributes: { 财帛: -5 },
          gameState: { 清议: 6 },
          hidden: { 道德值: 8, 欲望值: -5 },
          flags: { add: ['echo_emotion_008_done'] }
        },
        result: {
          title: '却金',
          tags: ['财帛-5', '清议+6', '道德+8', '欲望-5'],
          echo: `你回帖："扇是他人之物，物不在我，话更不在我。"

卞玉京看完笑了一声，把回帖折好收进袖里，说："这句我原样给他看。"

百金的价钱第二天挪去买了一位御史的门房。你没听见这件事，你只听见了秦淮河上的雨。`
        }
      },
      {
        id: 'c2',
        storyline: 'female',
        text: '【以诗赎扇】"扇子我买回来，还她"',
        description: '出钱赎回旧物，只为一句话两清',
        showConditions: {
          flags: { any: ['lixiangjun_poem', '桃花扇底', '还扇之义'] }
        },
        effects: {
          attributes: { 文韬: 4, 财帛: -16 },
          gameState: { 清议: 4 },
          hidden: { 道德值: 5, 欲望值: 3 },
          flags: { add: ['echo_emotion_008_done', '还扇之义'] }
        },
        result: {
          title: '赎扇',
          tags: ['文韬+4', '财帛-16', '清议+4', '道德+5', '欲望+3'],
          echo: `你托坊匠把扇子赎回来，扇面血痕已淡。你题了两个字，封好送去桃叶渡，不附名。

三日后回礼是一方旧砚。砚底刻的是当年你送她的那首诗，一个字都没少。

你忽然明白：这件事从头到尾没有便宜可占，只有人在等你认账。`
        }
      },
      {
        id: 'c3',
        storyline: 'eastern_forest',
        text: '【借扇问罪】"阮公若要人说话，先问他当年那出戏"',
        description: '拿旧事当面顶回去，替香君出这口气',
        showConditions: {
          flags: { any: ['lixiangjun_disappointed', 'ruan_dacheng_enemy'] }
        },
        effects: {
          gameState: { 中官: -8, 清议: 8, 圣眷: 2 },
          hidden: { 道德值: 8, 机敏值: -6 },
          flags: { add: ['echo_emotion_008_done', 'ruan_dacheng_enemy'] }
        },
        result: {
          title: '当面',
          tags: ['中官-8', '清议+8', '圣眷+2', '道德+8', '机敏-6'],
          echo: `你在席上把话说到底："当年那出戏，是阮公先投的票。"

满座散了。第二天弹章到了，弹的不是你，是你替香君出气时提到的另一位。你因此躲过，也因这一句"某官与桃叶渡有旧"被记了一笔小账。

阮大铖复起那年你在外任。回来说有人替他修书求和，你没修。`
        }
      },
      {
        id: 'c4',
        storyline: 'corrupt',
        text: '【递一句话】"扇价我不动，话我可以替他说"',
        description: '替阮氏在士林中递一次软话，换一条内廷的路',
        showConditions: {
          flags: { any: ['半门之客', '改文之讥', '投机派'] }
        },
        effects: {
          attributes: { 财帛: 12 },
          gameState: { 中官: 10, 清议: -10, 圣眷: -3 },
          hidden: { 道德值: -8, 机敏值: 6, 野心值: 6 },
          flags: { add: ['echo_emotion_008_done', '投机派'] }
        },
        result: {
          title: '软话',
          tags: ['财帛+12', '中官+10', '清议-10', '圣眷-3', '道德-8', '机敏+6', '野心+6'],
          echo: `你在两处席上各说了半句："阮公之才，用之得法则无害。"

半句话在秦淮河上传播得比政事还快。半月之内，投到阮氏门下的帖子多了七份，其中两份署了你的荐语。

那年冬天你补了一个"繁缺"。缺是好缺，来路不好说。`
        }
      }
    ]
  },
  {
    id: 'echo_shiguan_001',
    storyline: 'eastern_forest',
    type: 'transition',
    title: '史馆又来',
    description: '前年你把那支笔搁回案上。今年他又带着稿子来了。',
    narrative: {
      speaker: { title: '翰林院编修', name: '沈退思' },
      quote: '前岁辞列传之聘，臣照实记了一笔「某官自谓功业未竟」。如今那一页还空着，敢问阁下要留白到何年？',
      background: `史馆的规矩：一个人什么时候"算完了"，由他自己说。你那年说了"还没完"，于是编修把册子合上，记下你这句话本身 ——
这一条也算一笔史料，他记得很清楚。

这几年你换了两处任，办过赈、核过饷、也挨过一处处分。同一年入仕的两个人，一个已附了家传，一个还在外任。
沈退思这次来不是催你盖棺，是带了一份《儒林》《文苑》的体例给你看：不进本传的人，可以走这两条路，字数少些，但不必等死。

案上那册日历翻到今年的那一页。他等你答话，手里那支笔是干的。`,
      situation: '他问的不是你要不要传，是你要哪一种传 —— 这一答会写进册子。'
    },
    conditions: {
      year: { min: 1630, max: 1644 },
      month: { min: 1, max: 12 },
      flags: { has: ['史馆辞笔'], notHas: ['echo_shiguan_001_done'] }
    },
    choices: [
      {
        id: 'c1',
        storyline: 'eastern_forest',
        text: '【直笔见付】"我做过什么、不曾做什么，都照你听来的写"',
        description: '把这几年的事一并交出去，不删、不求、不添',
        showConditions: {
          hidden: { 道德值: { min: 60 } }
        },
        effects: {
          attributes: { 文韬: 3 },
          gameState: { 清议: 12, 圣眷: -5, 中官: -8 },
          hidden: { 道德值: 6 },
          flags: { add: ['echo_shiguan_001_done', '直笔'] }
        },
        result: {
          title: '一页写实',
          tags: ['文韬+3', '清议+12', '圣眷-5', '中官-8', '道德+6'],
          echo: `你把他听来的那些事一件件核对了一遍：哪一年赈过多少石，哪一处的账是你清的，哪一次处分你确实认了。
说到处分那一段，你要他把"抗辩之语"也写进去，他说这样于你不便，你说"不便才要写"。

册子抄出两份，一份在国史院，一份在私家里。半年后有同僚在你案头看见那篇文字的副本，
只说了一句："原来你自己也认。"

宫里的风声不太好。编修那边倒很平静，他说这一页他写得最省力气。`
        }
      },
      {
        id: 'c2',
        storyline: 'power',
        text: '【删其刺时者】"某年的话、某人的事，且从册上撤下来"',
        description: '受传，但把最扎手的几处抹平',
        effects: {
          gameState: { 圣眷: 8, 清议: -10, 中官: 6 },
          hidden: { 机敏值: 6, 道德值: -6, 野心值: 4 },
          flags: { add: ['echo_shiguan_001_done', '讳言旧朝'] }
        },
        result: {
          title: '干净的传',
          tags: ['圣眷+8', '清议-10', '中官+6', '机敏+6', '道德-6', '野心+4'],
          echo: `沈退思照着你的话删了三处：删了那年军前的一句话，删了某个人的名字，删了处分那一段里你的原话。
删完他把册子送你过目，问"可还有"。你说没有了。他收起笔，行了一礼，礼数一丝不错。

那年秋天你的考语果然顺当。只是此后有人在你面前提及史馆，语气里总带一点客气 ——
那种客气，是知道一个人肯为自己的文字动刀之后才会有的。`
        }
      },
      {
        id: 'c3',
        storyline: 'ordinary',
        text: '【让传于死者】"这一页给李某吧，他今年没能回来"',
        description: '不受列传，把名额转给同死的那位同僚',
        effects: {
          attributes: { 理政: 3 },
          gameState: { 清议: 8, 士绅: 6, 民望: 5 },
          hidden: { 道德值: 8, 野心值: -5 },
          flags: { add: ['echo_shiguan_001_done'] }
        },
        result: {
          title: '空页',
          tags: ['理政+3', '清议+8', '士绅+6', '民望+5', '道德+8', '野心-5'],
          echo: `你把那个人的名字报给他：去年守一座县城死的，官阶比你低两级，家里只剩一个瞎了眼的老母。
沈退思翻了两页，说史馆名额一年只几个。你说"我这页既然还空着，就先填他的"。

他当场把那人的行事记了下来，问你要了几张文书的日期。你给了他，还给了一笔送其家小回籍的钱。

册子上你的名字仍空着。你回家路上想：这一页空着便空着，反正你还没完。`
        }
      }
    ]
  }
]
