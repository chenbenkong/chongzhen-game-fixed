/**
 * flag（经历）→ 玩家看得懂的一句「履历」。
 *
 * 为什么要有这张表：`character.flags` 在游戏里原本**只有门槛读得懂**。
 * 第十六轮初见数时，447 条可写经历里 250 条没有任何门槛引用过 —— 对玩家来说，
 * 那次抉择等于没发生。第十五轮把能被玩法接住的接住了，剩下这些接不住的，
 * 至少要让他**看见自己做过**。
 *
 * 三条规矩：
 *  1. 只给"玩家真的会带上"的经历写文案。实测（200 局）那 250 条死经历里有 143 条
 *     一局都没被带上 —— 给它们写文案是自欺，那条预算应该花在内容上。
 *  2. 没登记的 flag 一律**不显示**，界面上只可能出现这张表里的句子。
 *     `lishi_tension`、`pending_zhanggui` 这类机器 id 因此要么配一句人话，要么就别露出来。
 *  3. 文案必须忠于写出这条经历的那个选项（`choice.effects.flags.add`）——
 *     玩家做的是"联名弹劾"，履历就不能写"弹劾阉党成功"。
 *     一条 flag 有多个出处时，写它们共同的那一层事实，不写其中某一个结局。
 *  4. 同一个"说人话"的义务也落在**门外的文案**上：选项被经历门槛锁住时会把缺哪段
 *     经历印在屏幕上，所以机器 id 还得进下面那张 `FLAG_GATE_LABELS`。
 *
 * 名单来源与对账：`tests/unit/flagMemoirs.data.test.ts` 钉住两件事 ——
 * 不许有"全游戏写不出来的文案"（deadMemoirs），也不许让已钉住的常被带走者掉出表外；
 * `tests/unit/audit.choiceLockout.test.ts` 钉住"选项级门槛里不许有没登记的机器 id"。
 */

export type MemoirGroup = '朝局' | '风骨' | '家宅' | '人情'

export interface Memoir {
  /** 给玩家看的一句话，过去式，不超过 20 来字 */
  line: string
  group: MemoirGroup
}

/** 分组呈现顺序：先说朝堂上的事，再说这个人怎么站的，然后家宅，最后是不肯忘的人。 */
export const MEMOIR_GROUP_ORDER: MemoirGroup[] = ['朝局', '风骨', '家宅', '人情']

export const FLAG_MEMOIRS: Record<string, Memoir> = {
  // —— 朝局：官、兵、奏议、党派 ——
  地方官任职: { line: '在地方上实任过一职', group: '朝局' },
  崇祯近臣: { line: '御前奏对称旨，皇帝记得这名儿', group: '朝局' },
  言路官: { line: '拜在言路，以说话为职', group: '朝局' },
  台谏之声: { line: '台谏之上有人替你传过话', group: '朝局' },
  外任实缺: { line: '辞了台职，外任一处实缺', group: '朝局' },
  外放督抚: { line: '请旨外放，领过督抚的兵', group: '朝局' },
  武将路线: { line: '投笔从戎，自请赴辽东', group: '朝局' },
  以文参武: { line: '不曾从军，以幕僚赞画军务', group: '朝局' },
  支持辽东: { line: '上言辽东是国门，宜加饷固守', group: '朝局' },
  辽东旧部: { line: '收留过辽东来的旧部', group: '朝局' },
  军事人脉: { line: '军中有人认得你的名姓', group: '朝局' },
  掌军权: { line: '以剿匪为名，把麾下扩成一支私兵', group: '朝局' },
  拥兵自重: { line: '兵权在握，朝廷已经起了猜忌', group: '朝局' },
  问鼎之约: { line: '与人立下问鼎之约，从此不回头', group: '朝局' },
  南渡长江: { line: '衣冠南渡，在南京入了朝', group: '朝局' },
  效忠南明: { line: '在弘光朝领了官职，把后半生押在江南', group: '朝局' },
  主张南迁: { line: '城破前上疏，主张迁都南京', group: '朝局' },
  主南迁: { line: '朝议上力主南迁，忤了圣意', group: '朝局' },
  护送太子: { line: '想护太子出京，功败垂成', group: '朝局' },
  护送崇祯南迁: { line: '请护皇上南迁，最后只送出太子', group: '朝局' },
  密谋太子: { line: '密谋送太子南下，事泄被疑', group: '朝局' },
  保蜀策: { line: '上疏《保蜀十二策》', group: '朝局' },
  洪承畴幕僚: { line: '受洪承畴延揽，进过幕府', group: '朝局' },
  上报朝廷: { line: '事无大小先上闻，请旨而定', group: '朝局' },
  延误时机: { line: '因等候请旨批复，错过了时机', group: '朝局' },
  调停成功: { line: '在辽军与城守之间斡停，压住了火', group: '朝局' },
  化解矛盾: { line: '两军之怨经你劝解，暂且解开', group: '朝局' },
  仁政官员: { line: '开仓放粮，救过一境灾民', group: '朝局' },
  独对之荣: { line: '独对御前，答的是饥荒实数不是祥瑞', group: '朝局' },
  召对无言: { line: '大问当前，以才疏学浅缄默', group: '朝局' },
  平台三策: { line: '平台召对，力陈停内帑、核辽饷、清驿递', group: '朝局' },
  上书建言: { line: '不敢面圣，把方略写成奏疏呈上', group: '朝局' },
  上书请命: { line: '为祖父旧部上书请抚恤', group: '朝局' },
  面圣陈词: { line: '自请面陈利弊，为国尽言', group: '朝局' },
  舆论先导: { line: '不呈御前，先传士林，借舆论行事', group: '朝局' },
  刊刻农书: { line: '上疏请将《农政全书》刊刻流传', group: '朝局' },
  辟徐文派: { line: '公开辟徐光启私通洋教之说', group: '朝局' },
  反袁派: { line: '上疏劾袁崇焕擅杀大将', group: '朝局' },
  挺袁派: { line: '支持督师处决毛文龙', group: '朝局' },
  袁党嫌疑: { line: '力保袁督师，说是反间之计', group: '朝局' },
  持续保袁: { line: '袁督师死后仍继续为他鸣冤', group: '朝局' },
  袁党余孽: { line: '为袁督师执言，被记作余孽', group: '朝局' },
  袁党: { line: '名字被政敌归进了袁党名册', group: '朝局' },
  党争反戈: { line: '党争里先出手，反被人参了一本', group: '朝局' },
  谪戍边疆: { line: '请调外任，被放到西北边陲', group: '朝局' },
  戴罪立功: { line: '戴罪任事，等一个立功赎罪的机会', group: '朝局' },
  弹劾阉党: { line: '联名弹劾阉党余孽', group: '朝局' },
  暗中结交宦官: { line: '与宫里的人假意周旋，暗通声气', group: '朝局' },
  内廷奥援: { line: '认了门生帖上的名字，内廷遂有人', group: '朝局' },
  与内廷绝: { line: '把帖子原封送都察院，与内廷绝了', group: '朝局' },
  厂卫差事: { line: '替内廷领了厂卫的差事，去查人', group: '朝局' },
  税关差事: { line: '替内廷领了税关的差事，去收银', group: '朝局' },
  传奉差事: { line: '替内廷领了传奉的差事，去递话', group: '朝局' },
  谢了内廷: { line: '把内廷递来的差事退了，各走各路', group: '朝局' },
  司礼监门下: { line: '投在司礼监门下，替掌印的看折子', group: '朝局' },
  厂卫门下: { line: '跟了厂卫的路子，缇骑营里挂上名', group: '朝局' },
  抽身之意: { line: '动了抽身的念头，只是还没迈出去', group: '朝局' },
  内廷外相: { line: '做了内廷的外相，部院的事先过内廷', group: '朝局' },
  厂卫外援: { line: '成了厂卫的外援，一份名单递得进去', group: '朝局' },
  洗手不干: { line: '把内廷的旧账还清，洗手不干了', group: '朝局' },
  反戈内廷: { line: '反手把内廷的账目捅给了外朝', group: '朝局' },
  守旧派: { line: '哭庙之后，人把你归在守旧章一边', group: '朝局' },
  东林系: { line: '与东林一路通了声气', group: '朝局' },
  独立文人: { line: '婉拒复社之招，愿为独立文人', group: '朝局' },
  投机派: { line: '见势早为之所，人唤作识时务', group: '朝局' },
  务实派: { line: '不问清议，只办眼前办得动的事', group: '朝局' },
  两头取利: { line: '逆案名册两头解释，两边落了好', group: '朝局' },
  逆案自承: { line: '逆案的事当众认下：是我写的', group: '朝局' },
  逆案脱身: { line: '推说册子众人同抄，自己不过誊录', group: '朝局' },
  私祭不党: { line: '只祭先生，不入齿录', group: '朝局' },
  门生网络: { line: '与人脉互通，往后彼此照应', group: '朝局' },
  以荐代交: { line: '不便深交，便荐几位寒门俊彦', group: '朝局' },
  座师之门: { line: '赴会列名，认了这门座师', group: '朝局' },
  门生故吏: { line: '座师门下自此有了你的名字', group: '朝局' },
  遣祭代归: { line: '遣人代祭，身留官守不曾归乡', group: '朝局' },
  丁忧在籍: { line: '解职回乡奔丧，在籍守制', group: '朝局' },
  武力威慑: { line: '把上门讨债的人打了出去', group: '朝局' },
  动用关系: { line: '托人压下过一桩公事，用的是交情', group: '朝局' },
  阉党嫌疑: { line: '朝堂上认了旧事，自此有阉党之嫌', group: '朝局' },
  旧议已收: { line: '当年的疏稿收进箱底，不再提', group: '朝局' },
  洪承畴故交: { line: '登门与洪承畴纵论过兵法', group: '朝局' },

  // —— 风骨：站姿、名节、银子上的取舍 ——
  忠臣: { line: '先帝宾天，于众目之前尽臣子哀礼', group: '风骨' },
  直笔: { line: '直笔实录，先帝之失也照样写', group: '风骨' },
  先帝旧臣: { line: '以先帝旧臣自居，不作新朝之语', group: '风骨' },
  讳言旧朝: { line: '先帝朝事，只道臣下不当深论', group: '风骨' },
  廷杖受刑: { line: '廷杖之下昂首受刑，不曾改口', group: '风骨' },
  廷杖求饶: { line: '廷杖之下叩头求饶，保住了性命', group: '风骨' },
  以理抗争: { line: '上奏陈廷杖之弊，请收回成命', group: '风骨' },
  大义灭亲: { line: '族兄的案子秉公处置，不曾插手', group: '风骨' },
  徇私说情: { line: '为族叔的案子去拜访知府', group: '风骨' },
  法理兼顾: { line: '劝族兄自首从轻，国法人情两顾', group: '风骨' },
  守口至终: { line: '咬定册上那人从未见过，守口到底', group: '风骨' },
  卖人求安: { line: '供出她藏身的地方，换一日平安', group: '风骨' },
  寒窗苦读: { line: '通宵苦读，一卷不尽不休', group: '风骨' },
  孝廉之名: { line: '受乡评之称，乡里以为孝廉', group: '风骨' },
  乡党依倚: { line: '乡党有事，先来寻你拿主意', group: '风骨' },
  择债而偿: { line: '三笔债只兑了不必害人的那笔', group: '风骨' },
  依法补缴: { line: '该补的补、该罚的罚，不给人把柄', group: '风骨' },
  分期还债: { line: '与债主面议，分期归还', group: '风骨' },
  以工代偿: { line: '无银可还，转祖上田庄与人经营', group: '风骨' },
  以攻为守: { line: '反诉仇家，先把水搅浑', group: '风骨' },
  遣散旧部: { line: '赠银遣散旧部，教他归乡养老', group: '风骨' },
  不论旧朝: { line: '史馆征旧事，称病不预，一概不答', group: '风骨' },
  游历天下: { line: '抛下官身，随霞客走了十年山水', group: '风骨' },
  归隐之志: { line: '山水既久，不复作还朝之想', group: '风骨' },
  // 「史馆请笔」写下的经历（src/data/endingDecline.ts）。出处有十一个：卡上的
  // 【搁笔】【反事实】【后续】都写，只有【收笔】那一条不写 —— 所以履历写的是
  // 它们共同的那一层事实（没有当场受这个盖棺），而不是某一张卡的文案。
  史馆辞笔: { line: '史馆备下列传，你不曾当场受之', group: '风骨' },
  贪声已著: { line: '把交情折价换利，贪名自此在外', group: '风骨' },

  // —— 家宅：妻、妾、子、门里的事 ——
  wife_wangshi: { line: '娶了王氏，这段姻缘认下了', group: '家宅' },
  wife_zhangshi: { line: '娶了张氏，拜过堂', group: '家宅' },
  harmonious_family: { line: '妻妾共处一堂，家里难得和睦', group: '家宅' },
  protect_childless_wife: { line: '母亲逼纳妾，你护住了无子的妻', group: '家宅' },
  wife_respected: { line: '待正室以敬，夫人从此有体面', group: '家宅' },
  legitimate_heir: { line: '妾生之子记在正室名下，算作嫡出', group: '家宅' },
  open_marriage: { line: '与夫人默认各过各的，不再相强', group: '家宅' },
  wife_caught_affair: { line: '外遇被夫人撞见，一时遮不住', group: '家宅' },
  wife_forgave_once: { line: '跪地认错，夫人原谅了这一回', group: '家宅' },
  wife_forgave: { line: '低头认错，屋里人也让了这一回', group: '家宅' },
  crime_line: { line: '为掩一桩丑事，手上沾了血', group: '家宅' },
  wife_murdered: { line: '为灭口下了毒手，从此背一条人命', group: '家宅' },
  corruption_record: { line: '替岳父办过一笔见不得钱的事', group: '家宅' },
  lishi_tension: { line: '当面回了岳父的请托，李家生了隙', group: '家宅' },
  pending_zhanggui: { line: '首辅赐婚，你推说禀明家母、三日奉复', group: '家宅' },
  wife_hates_cuir: { line: '揽下翠屏的事，正妻自此恨她', group: '家宅' },
  纳妾之议: { line: '妾的名分议了起来，门上有闲话', group: '家宅' },
  纳妓为妾: { line: '为一名青楼女子赎了身，纳作妾室', group: '家宅' },
  纵欲成疾: { line: '纵欲伤了根本，从此药不离口', group: '家宅' },
  闭门谢客: { line: '遣散后院，从此闭门调养', group: '家宅' },

  // —— 人情：不肯忘的那些人 ——
  红袖的下落: { line: '出钱问明红袖如今在何处', group: '人情' },
  徐霞客故交: { line: '赠诗送霞客远游，算是故交', group: '人情' },
  namuzhong_grateful: { line: '将公主体面送还本部，受其一谢', group: '人情' },
  ruan_dacheng_enemy: { line: '替香君收好那把扇子，与阮大铖成仇', group: '人情' },
  soulmate_lixiangjun_soft: { line: '暗中收下香君的扇子，替她另付', group: '人情' },
  xialing_distance: { line: '知道她的事不曾告发，只与她疏远', group: '人情' },
  xianv_info: { line: '向侠女问过刺客的来路', group: '人情' },
  hongxiu_heartbreak: { line: '说自己能力有限，教她空欢喜一场', group: '人情' },
  zhaomei_restrained: { line: '喝止赵美，不许再提旧事', group: '人情' },
  三日之信: { line: '提前三日，把杀身的消息说与她听', group: '人情' },
  李氏恩断: { line: '与李氏自此恩断，再无来处', group: '人情' },
  如烟已嫁: { line: '三十两算作嫁妆，送她体面出门', group: '人情' },
  旧盟重寻: { line: '遣媒毁其新聘，替她担下这一场', group: '人情' },
  再负一回: { line: '托春杏把当年那句话又说了一遍', group: '人情' },
  一刻钟之恩: { line: '拖住缇骑一刻钟，教她先去报信', group: '人情' },
  秦淮债清: { line: '秦淮旧债照数还清，契撕在当面', group: '人情' },
  侠女之盟: { line: '城南两间房安下她，不曾令她入门', group: '人情' },
  直言相告: { line: '把自身处境如实说与她听', group: '人情' },
  流连青楼: { line: '在秦淮河畔的灯影里过过夜', group: '人情' },
  青楼暗股: { line: '在青楼里占了一份不记名的干股', group: '人情' },
  青楼靠山: { line: '替几处院子撑着官面上的体面', group: '人情' },
  辞了暗股: { line: '看过停云馆的账簿，到底没有伸手', group: '人情' },
  侠女自去: { line: '她当夜踏瓦而去，玉佩留在案上', group: '人情' },

  // —— 第六十五轮：胥吏 / 海商两支的专属经历 ——
  // 这 20 条全部由 `data/events/origin/xuli.ts` 与 `haishang.ts` 写出，
  // 其中前六条同时是下一支的选项门槛（所以玩家必须看得见它们指向哪）。
  刀笔旧账: { line: '在户房替人补过一笔旧账', group: '朝局' },
  旧账已报: { line: '当堂把户房的旧账挑明了', group: '风骨' },
  旧账一炬: { line: '一把火把旧账烧了个干净', group: '风骨' },
  衙役旧部: { line: '县衙里的旧部还认你', group: '朝局' },
  择优留用: { line: '旧部里只挑了几个能用的', group: '朝局' },
  拒旧部: { line: '把找上门的旧部一概打发了', group: '朝局' },
  假公济私: { line: '借旧账替自己谋了个差事', group: '朝局' },
  考成第一: { line: '以考成第一，把同僚比了下去', group: '朝局' },
  拜入门下: { line: '投了一封门生帖，拜了座师', group: '朝局' },
  内官照拂: { line: '走了内官的门路，宫里有人照拂', group: '朝局' },
  请调他县: { line: '自请调任他县，避开了旧衙', group: '朝局' },
  献船入官: { line: '把家里的船整队献入官府', group: '朝局' },
  通番如故: { line: '船照旧下海，走的是旧日的番路', group: '朝局' },
  改舶为漕: { line: '把海船改了漕船，走运河', group: '朝局' },
  旧案压下: { line: '使了银子，把通番的旧案压下', group: '朝局' },
  旧案认罚: { line: '认了通番的罚，银子交得干净', group: '风骨' },
  反噬巡按: { line: '反咬了巡按一口，把案子搅翻', group: '朝局' },
  输饷叙功: { line: '出资助饷，换了一纸叙功', group: '朝局' },
  不输饷: { line: '捐纳的门前，到底没有递银子', group: '风骨' },
  盐引到手: { line: '以商养官，领到了盐引', group: '朝局' },

  // —— 第六十六轮：罪臣之后 / 军户两支的专属经历 ——
  // 前六条同样兼作第三拍的选项门槛：玩家得先看见自己走过哪条路，才愿意按它再走一步。
  自陈待罪: { line: '上疏自陈身世，请革职待勘', group: '风骨' },
  隐忍守拙: { line: '不提案底，只管把一县差事办好', group: '朝局' },
  磨去案底: { line: '使了银子，把履历上那行字磨掉', group: '朝局' },
  访得旧部: { line: '寻访父亲旧部，问清当年败事', group: '人情' },
  同年援手: { line: '同年席上，有人替先父说了一句话', group: '人情' },
  以实务服人: { line: '在同年席上摊开一县的粮册', group: '朝局' },
  拜内官门下: { line: '绕开清议，攀了内廷的门路', group: '朝局' },
  席上先行: { line: '同年席上不受难堪，提前走了', group: '风骨' },
  联名请恤: { line: '联名上疏，替父亲换回恤典', group: '朝局' },
  买得恤典: { line: '花银子走部里，讨来一纸诰命', group: '朝局' },
  亲撰战守录: { line: '亲手写下一本《战守始末》', group: '风骨' },
  反持御史: { line: '拿住巡按的把柄，昭雪再无人提', group: '朝局' },
  追回屯田: { line: '以县权替卫所追回了三顷军田', group: '朝局' },
  上言卫所: { line: '把卫所积弊写成一道奏疏', group: '朝局' },
  卫所不问: { line: '把卫所的册子收进柜里，不闻不问', group: '朝局' },
  侵吞屯田: { line: '借"代管"之名，把军田并进手里', group: '朝局' },
  捐俸买马: { line: '捐出两年俸银，替五十人补了马', group: '风骨' },
  借调加派: { line: '把辽饷加派摊到全县田亩上', group: '朝局' },
  请免调遣: { line: '上疏替本卫争了一个折银代丁', group: '风骨' },
  授以方略: { line: '在教场上教了五十人三日', group: '朝局' },
  世职有继: { line: '把祖上的百户让给族中子弟', group: '家宅' },
  兼领卫事: { line: '以文臣兼领卫事，一堂两印', group: '朝局' },
  献出世职: { line: '把世职与屯田一并献入官府', group: '风骨' },
  鬻去世职: { line: '把百户的印卖给了卫里富户', group: '朝局' }
}

/**
 * flag（经历）→ 锁门时给玩家看的一句「你缺的那段前事」。
 *
 * 为什么这一张表要单独存在：第十五轮把选项级 `showConditions.flags` 实装之后，
 * 被挡在门外的选项会把缺哪段经历**印在屏幕上**（`choiceRequirements.ts` 的
 * 「须有这段经历：…」）。中文名（`忠臣`、`夺情起复`）本来就说得出，
 * 但 `wife_hurt` 这类机器 id 直接进文案，等于让玩家读一行调试输出。
 * 实测（第十七轮）全池选项级正向子句里真有 9 个这种 id，全部住在家宅/人情一支。
 *
 * 三条规矩跟履历表一致：短语必须忠于写出该 flag 的那个选项；机器 id 没登记就
 * **不要印出来**（`gateLabel` 返回 null，由调用方改说泛指）；这里只用一句话的长度。
 */
export const FLAG_GATE_LABELS: Record<string, string> = {
  wife_broken: '与正妻决裂',
  tyrant_husband: '以夫权压过家内',
  pingqi_attempt: '为妻妾排解过',
  wife_hurt: '因纳妾伤了正妻',
  wife_jealous: '偏宠致正妻生怨',
  concubine_for_heir: '为求子纳过妾',
  concubine_killed: '妾室因你而死',
  lixiangjun_poem: '赠诗李香君',
  lixiangjun_disappointed: '凉了香君的心',
  ruan_dacheng_enemy: '与阮大铖结怨'
}

/** 纯机器 id：没有汉字、只有小写字母数字下划线的那一类 flag 名 */
const MACHINE_ID = /^[a-z0-9_]+$/

/**
 * 一段经历的门禁文案。中文名照抄；机器 id 查这张表，查不到就退回履历句；
 * 两句都凑不出来的，返回 `null` —— 宁可说"须有前事"，也不把 `wife_hurt` 印给玩家。
 */
export function gateLabel(flag: string): string | null {
  if (!MACHINE_ID.test(flag)) return flag
  return FLAG_GATE_LABELS[flag] ?? FLAG_MEMOIRS[flag]?.line ?? null
}

export interface MemoirEntry extends Memoir {
  flag: string
}

/**
 * 把身上的 flag 翻成履历。
 *
 * 未登记的 flag 直接丢掉（机器 id 不能上界面）；同一句不重复。
 * 组内保持 flag 身上的先后次序 —— 那是玩家做选择的次序，读起来像一段一段回忆。
 */
export function memoirsOf(flags: readonly string[] | undefined): MemoirEntry[] {
  const seen = new Set<string>()
  const hit = new Map<MemoirGroup, MemoirEntry[]>()
  for (const f of flags ?? []) {
    if (seen.has(f)) continue
    seen.add(f)
    const m = FLAG_MEMOIRS[f]
    if (!m) continue
    const list = hit.get(m.group)
    if (list) list.push({ flag: f, ...m })
    else hit.set(m.group, [{ flag: f, ...m }])
  }
  return MEMOIR_GROUP_ORDER.flatMap(g => hit.get(g) ?? [])
}
