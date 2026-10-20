/**
 * 智能事件场景 prompt 生成器
 *
 * 思路：先根据事件标题 + 描述中的关键词识别"场景大类"（朝堂/战场/民间/江南/宫廷/文人/边关/密谋/祭奠/灾害/家庭/科举/商贸），
 * 再从该类场景的多个模板中随机抽取一个组合生成 prompt。
 * 模板中所有可变量（光线、人物动作、周围细节、构图视角、情绪）都从元素池随机选取，
 * 避免每次生成都是同一句话。
 */

export interface EventPromptContext {
  playerName: string
  playerCourtesyName?: string
  rank: string
  degree: string
  age: number
  origin: string
  hometown: string
  year: number
  month: number
  currentEventTitle: string
  currentEventDescription: string
  /** 事件正文（narrative.background）。description 往往只有一句摘要，正文才含具体人事 */
  currentEventBackground?: string
}

interface SceneTemplate {
  /** 场景大类名称 */
  name: string
  /** 关键词命中（任一命中即归此类） */
  keywords: string[]
  /** 权重（多个类同时命中时选权重最高的） */
  weight?: number
  /** prompt 模板函数，返回完整描述 */
  templates: ((ctx: BuiltContext) => string)[]
  /** 此场景的"周围细节"元素池 */
  details: string[]
  /** 此场景的"光线/时间"元素池 */
  lights: string[]
  /** 此场景的"动作"元素池 */
  actions: string[]
  /** 此场景的"情绪"元素池 */
  moods: string[]
  /** 此场景的"周围人物/环境音"元素池 */
  surround: string[]
  /** 构图视角 */
  viewPoints: string[]
  /** 主体位置（人物站立/跪伏/端坐/行走） */
  postures: string[]
}

interface BuiltContext {
  era: string                    // 崇祯X年X月
  season: string                 // 春/夏/秋/冬
  timeOfDay: string              // 时辰
  playerDesc: string             // 玩家描述
  playerName: string
  hometown: string
  rank: string
  title: string                  // 事件标题
  descSnippet: string            // 描述摘要
  details: string                // 周围细节（随机选）
  light: string                  // 光线
  action: string                 // 动作
  mood: string                   // 情绪
  surround: string               // 周围人物
  viewPoint: string              // 构图视角
  posture: string                // 主体姿态
}

// 工具：随机选一个
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** 季节（按月分） */
function getSeason(month: number): string {
  if ([3, 4, 5].includes(month)) return '春'
  if ([6, 7, 8].includes(month)) return '夏'
  if ([9, 10, 11].includes(month)) return '秋'
  return '冬'
}

/** 时辰 */
function getTimeOfDay(_month: number): string {
  // 早春晚秋偏冷，夏冬偏暖，随机抽一个
  return pick(['晨光初照', '日光正午', '午后斜阳', '黄昏时分', '夜幕降临', '月上柳梢', '夜深人静', '黎明将至'])
}

/** 描述摘要：截取前 100 字关键情节，剔除多余换行 */
function getDescSnippet(desc: string): string {
  if (!desc) return ''
  const clean = desc.replace(/\s+/g, ' ').trim()
  if (clean.length <= 100) return clean
  const cut = clean.slice(0, 100)
  const lastPunc = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('。'), cut.lastIndexOf('；'))
  if (lastPunc > 30) return clean.slice(0, lastPunc + 1)
  return cut + '…'
}

/** 构建上下文 */
function buildContext(input: EventPromptContext): BuiltContext {
  const season = getSeason(input.month)
  const timeOfDay = getTimeOfDay(input.month)
  const courtesy = input.playerCourtesyName ? `（字${input.playerCourtesyName}）` : ''
  const rank = input.rank || '臣子'
  const playerDesc = `${input.playerName}${courtesy}，${rank}`
  const title = input.currentEventTitle || '明末士子'
  // 正文优先：description 常常只是「新朝气象，机遇与风险并存」这类一句摘要，
  // 具体人事（谁被罢职、谁在密谋）只写在 narrative.background 里。
  const body = input.currentEventBackground || input.currentEventDescription || ''
  const snippet = getDescSnippet(body)
  return {
    era: `明崇祯${input.year}年${input.month}月（${season}${timeOfDay}）`,
    season,
    timeOfDay,
    playerDesc,
    playerName: input.playerName,
    hometown: input.hometown || '',
    rank,
    title,
    descSnippet: snippet,
    details: '',
    light: '',
    action: '',
    mood: '',
    surround: '',
    viewPoint: '',
    posture: ''
  }
}

// ============ 场景库 ============

const SCENE_LIBRARY: SceneTemplate[] = [
  // ===== 1. 朝堂奏对 =====
  {
    name: '朝堂奏对',
    keywords: ['朝', '奏', '议', '觐', '面圣', '廷议', '朝会', '内阁', '奏章', '弹劾', '急报', '军机', '召对', '御前', '经筵', '廷推', '京察', '科道'],
    weight: 10,
    details: [
      '御案上堆满各地奏报',
      '龙椅旁悬大明十三省疆域图',
      '殿角燃着檀香，烟雾缭绕',
      '丹墀之上铺着红色御毯',
      '殿外传来锦衣卫换班的脚步声',
      '金砖地面映出百官身影',
      '案头摆着玉玺与令箭',
      '楹柱盘龙金漆，辉煌夺目',
      '窗棂透入秋日斜阳',
      '殿角香炉中沉香袅袅升起',
      '御屏风绣着山河社稷图',
      '殿中悬挂"敬天法祖"匾额',
    ],
    lights: [
      '晨光自雕花窗棂斜入',
      '黄昏金光透过云层洒下',
      '烛火通明，映照金砖',
      '日光从高窗倾泻而下',
      '阴云之下殿内光线昏暗',
      '殿内万盏宫灯齐燃',
    ],
    actions: [
      '躬身奏对',
      '执笏而立',
      '展卷陈奏',
      '跪伏于地',
      '退立班末',
      '趋前答话',
      '与同僚低声商议',
      '目光凝重地审视御案',
    ],
    moods: [
      '忧国忧民',
      '诚惶诚恐',
      '从容自若',
      '心思深沉',
      '暗自揣度',
      '胸有成竹',
      '心怀忐忑',
    ],
    surround: [
      '文武百官分列两班肃立',
      '锦衣卫肃立殿角',
      '御史大夫执笏侧目',
      '司礼监太监执拂尘侍立',
      '内阁大学士立于御座旁',
      '翰林编修捧笔记录',
      '太监执掌宫灯列队',
    ],
    viewPoints: [
      '御座高视角俯视群臣',
      '殿门中轴对称构图',
      '文武官员中透出一人',
      '近景特写上奏者面部',
      '广角呈现整座大殿',
    ],
    postures: ['执笏肃立', '跪伏殿中', '立于班列', '趋前数步', '退居殿角'],
    templates: [
      (c) => `${c.era}，紫禁城内${pick(['太和殿', '文华殿', '乾清宫', '武英殿'])}。${c.playerDesc}${c.posture}，${c.action}，神情${c.mood}。崇祯帝${pick(['高坐龙椅', '端坐御座', '凭几沉思'])}${pick(['，眉宇间隐现忧色', '，目光如炬扫视群臣', '，手持朱笔批阅奏章']) }。${c.surround}，${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}于${pick(['丹墀之下', '御道之侧', '群臣班列'])}${c.posture}，${c.action}，面容${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，紫禁城${pick(['午门', '端门', '太和门'])}广场上，文武百官正鱼贯而入，${c.playerDesc}${pick(['位列其中', '位居前列', '立于班末'])}。${c.light}，${c.details}。`,
    ],
  },

  // ===== 2. 战场边关 =====
  {
    name: '战场边关',
    keywords: ['战', '兵', '剿', '贼', '军', '敌', '守', '城', '关', '辽', '边', '流寇', '闯', '虏', '蒙古', '女真', '建虏', '闯王', '贼寇', '起事', '起义', '乱', '烽火', '告急', '失守', '攻'],
    weight: 12,
    details: [
      '城头旌旗猎猎作响',
      '城下尸体狼藉',
      '营帐连绵数里，灯火通明',
      '城砖缝隙渗出暗红色血迹',
      '残破的战车横陈路旁',
      '火炮烟尘尚未散尽',
      '垛口上堆放着滚木礌石',
      '瞭望塔上悬挂大明军旗',
      '城门前拒马森严',
      '军帐中地图散落一地',
      '篝火旁围坐着疲惫的士兵',
      '城头插满了箭矢',
    ],
    lights: [
      '战火映红了半边天空',
      '晨曦穿透硝烟',
      '夕阳西下，残阳如血',
      '黎明前的灰蓝色',
      '月色下刀光闪烁',
      '阴云密布，山雨欲来',
    ],
    actions: [
      '握刀立于城头',
      '策马扬鞭',
      '凝视远方战尘',
      '俯身查看地图',
      '拔剑怒喝',
      '挽弓搭箭',
      '与部将低声议事',
      '扶伤兵起身',
    ],
    moods: [
      '铁血坚毅',
      '壮怀激烈',
      '忧心忡忡',
      '视死如归',
      '沉毅果决',
      '悲愤难平',
    ],
    surround: [
      '士兵列阵持戟',
      '亲兵环侍身侧',
      '战马嘶鸣待发',
      '传令兵飞骑来报',
      '火铳手举铳待发',
      '辎重车队蜿蜒而行',
    ],
    viewPoints: [
      '城头俯视战场',
      '马背上远眺天际',
      '中军大帐内议事',
      '广角呈现连营数里',
      '近景刻画主将神情',
    ],
    postures: ['立马横刀', '屹立城头', '帐中端坐', '跨马前行', '半跪查看地图'],
    templates: [
      (c) => `${c.era}，${pick(['辽东', '西北边关', '山海关', '居庸关', '黄河渡口', '潼关'])}${pick(['城头', '要塞', '烽火台', '军帐'])}。${c.playerDesc}身着${pick(['山文甲', '鱼鳞甲', '罩甲', '棉甲'])}${c.posture}，${c.action}，神情${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${c.posture}，${c.action}，眉宇间${c.mood}。${c.surround}，远处${pick(['喊杀声震天', '狼烟四起', '战鼓隆隆', '号角呜咽'])}。${c.details}。`,
      (c) => `${c.era}，明军与${pick(['流寇', '建州女真', '蒙古骑兵', '叛军'])}激战正酣。${c.playerDesc}${c.posture}，${c.action}，刀锋上犹带血迹。${c.light}，${c.details}。`,
    ],
  },

  // ===== 3. 民间市井 =====
  {
    name: '民间市井',
    keywords: ['民', '市', '商', '街', '乡', '村', '里', '市井', '铺', '店', '集', '贩', '灾', '旱', '涝', '饥', '税', '加派', '三饷', '闾里', '县衙', '里甲', '钱粮'],
    weight: 9,
    details: [
      '街边小贩挑担叫卖',
      '茶馆内客官闲坐饮茶',
      '青楼门前红灯高悬',
      '算命摊前围满看客',
      '告示榜前人头攒动',
      '黄包车夫蹲在路旁歇脚',
      '孩童在巷口追逐嬉戏',
      '老妇倚门远望',
      '挑夫担着货物匆匆走过',
      '街角杂耍艺人敲锣表演',
      '豆腐坊蒸汽氤氲',
      '染坊门口晾着五色布匹',
    ],
    lights: [
      '黄昏暖光洒落街巷',
      '晨曦透过屋檐',
      '雨天湿漉漉的青石板',
      '夕阳斜照，炊烟四起',
      '雪后初晴，街市如洗',
      '正月里红灯笼高悬',
    ],
    actions: [
      '沿街而行',
      '驻足与商贩议价',
      '微服出行',
      '坐于茶肆窗前',
      '在人群中高声宣讲',
      '与乡绅拱手寒暄',
    ],
    moods: [
      '心系苍生',
      '若有所思',
      '深藏不露',
      '忧心忡忡',
      '体察民情',
      '若有所悟',
    ],
    surround: [
      '行人摩肩接踵',
      '妇孺围观看热闹',
      '乞丐沿街乞讨',
      '乡绅乘轿而来',
      '衙役执鞭开道',
      '货郎摇着拨浪鼓',
    ],
    viewPoints: [
      '街角远眺',
      '茶楼窗前俯视',
      '近景捕捉市井百态',
      '穿过牌坊望见远山',
      '巷口特写',
    ],
    postures: ['信步漫游', '驻足而观', '坐于茶肆', '立于桥头', '缓辔而行'],
    templates: [
      (c) => `${c.era}，${c.hometown || pick(['江南', '金陵', '苏州', '杭州', '扬州'])}${pick(['城内', '府衙前', '集市', '街巷'])}。${c.playerDesc}${pick(['微服出行', '便服简从']) }，${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}深入${pick(['里巷', '村野', '集镇', '码头'])}${c.posture}，所见${pick(['民生凋敝', '市井繁华', '灾民遍野', '物阜民丰'])}。${c.details}。`,
      (c) => `${c.era}，乡间${pick(['小镇', '渡口', '田畴', '祠堂前'])}。${c.playerDesc}${c.posture}，正与${pick(['乡绅', '里长', '老农', '商贩'])}${pick(['攀谈', '对坐', '拱手']) }。${c.light}，${c.details}。`,
    ],
  },

  // ===== 4. 江南水乡 =====
  {
    name: '江南水乡',
    keywords: ['江南', '苏', '杭', '金陵', '扬州', '苏州', '杭州', '湖', '水', '船', '画舫', '园林', '秦淮', '西湖', '烟雨', '杏花', '春', '烟', '雨', '花', '柳', '桥'],
    weight: 8,
    details: [
      '乌篷船摇橹而过',
      '白墙黛瓦倒映水中',
      '杨柳依依拂过画舫',
      '雨打芭蕉声入耳',
      '青石板路湿漉漉泛着光',
      '茶馆临河而建，灯笼高悬',
      '亭台水榭错落有致',
      '远山含黛，云雾缭绕',
      '小桥流水人家',
      '木窗雕花古朴雅致',
      '油纸伞下伊人独行',
      '岸畔桃花灼灼其华',
    ],
    lights: [
      '烟雨朦胧，水汽氤氲',
      '晨雾未散，江面如镜',
      '夕阳斜照，渔歌唱晚',
      '杏花春雨，润物无声',
      '月下秦淮，灯影摇曳',
      '雪后初晴，水墨丹青',
    ],
    actions: [
      '凭栏远眺',
      '乘一叶扁舟',
      '执伞漫步于青石小巷',
      '坐于画舫窗前',
      '抚琴一曲',
      '品茶赏景',
    ],
    moods: [
      '闲适淡然',
      '触景生情',
      '心绪万千',
      '寄情山水',
      '若有所思',
      '凭栏怀古',
    ],
    surround: [
      '画舫穿梭河面',
      '渔翁撑船而过',
      '闺阁女子在窗前张望',
      '文士聚会于亭中',
      '孩童在岸边嬉戏',
      '商船满载货物缓缓驶过',
    ],
    viewPoints: [
      '烟雨长镜头',
      '船头远眺',
      '桥上俯瞰',
      '临窗凝视',
      '水墨写意构图',
    ],
    postures: ['凭栏而立', '坐于船头', '独立桥头', '漫步于巷', '盘坐于亭'],
    templates: [
      (c) => `${c.era}，${pick(['秦淮河畔', '西湖断桥', '苏州阊门', '扬州瘦西湖', '金陵秦淮', '江南水乡'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${pick(['乘画舫', '着青衫', '执油纸伞'])}${c.posture}，${c.action}，远处${pick(['丝竹之声隐隐传来', '渔火点点', '烟波浩渺', '画舫林立'])}。${c.details}。`,
    ],
  },

  // ===== 5. 宫廷内苑 =====
  {
    name: '宫廷内苑',
    keywords: ['宫', '内', '后', '妃', '嫔', '皇', '中宫', '坤宁', '内廷', '宦官', '太监', '宫女', '司礼', '内阁', '养心', '乾清', '坤宁'],
    weight: 10,
    details: [
      '殿内帷幔低垂',
      '香炉中沉香袅袅',
      '宫灯如豆，映出雕梁',
      '金砖地面光可鉴人',
      '屏风上绣着凤穿牡丹',
      '御花园中奇花异草',
      '殿角摆设青铜鼎彝',
      '窗棂雕着百鸟朝凤',
      '琉璃瓦在阳光下熠熠生辉',
      '宫墙朱红，金钉铜环',
      '殿内悬挂宫训图',
      '金丝楠木案上摆着玉器',
    ],
    lights: [
      '晨光透过纱帘',
      '黄昏的金色余晖',
      '宫灯摇曳的暖光',
      '月光如水洒入',
      '正午日光从高窗倾泻',
      '阴雨天的灰冷光',
    ],
    actions: [
      '跪安听训',
      '恭呈奏本',
      '陪侍在侧',
      '躬身退出',
      '与宦官低语',
      '扶案沉思',
    ],
    moods: [
      '恭谨小心',
      '心思缜密',
      '城府极深',
      '诚惶诚恐',
      '从容周旋',
      '若有所虑',
    ],
    surround: [
      '宫女执扇侍立',
      '太监垂手肃立',
      '嫔妃侧立屏风后',
      '司礼监秉笔太监',
      '内阁辅臣环立',
      '锦衣卫隐于暗处',
    ],
    viewPoints: [
      '殿内纵深构图',
      '屏风后窥视',
      '近景特写',
      '俯视殿中',
      '透过纱帘朦胧美',
    ],
    postures: ['跪于殿中', '垂首侍立', '坐于绣墩', '恭立阶下', '缓步而出'],
    templates: [
      (c) => `${c.era}，紫禁城内廷${pick(['乾清宫', '坤宁宫', '养心殿', '交泰殿', '长春宫', '储秀宫'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${pick(['穿内廷便道', '经长廊', '过月华门'])}${c.posture}，${c.action}，与${c.surround}。${c.details}。`,
    ],
  },

  // ===== 6. 文人雅集 =====
  {
    name: '文人雅集',
    keywords: ['文', '诗', '书', '画', '雅', '园', '书院', '文社', '会文', '诗社', '文会', '雅集', '琴', '棋', '墨', '笔', '文士', '进士', '科举', '考', '举子', '书院'],
    weight: 7,
    details: [
      '书案上铺着宣纸',
      '砚池中墨色犹润',
      '墙上挂着山水立轴',
      '窗前竹影婆娑',
      '案头摆着青瓷笔洗',
      '博古架上陈列古玩',
      '庭院中腊梅初绽',
      '炉中燃着篆香',
      '桌上散落诗稿',
      '砚台边搁着狼毫数支',
      '书架上卷帙浩繁',
      '琴案上古琴横陈',
    ],
    lights: [
      '清晨日光透窗',
      '午后暖阳斜照',
      '雨后初霁清新',
      '月下清辉满窗',
      '烛光下书卷气浓',
      '暮色中灯火初上',
    ],
    actions: [
      '挥毫泼墨',
      '抚琴一曲',
      '与友对坐清谈',
      '展卷品茗',
      '拈棋对弈',
      '凭栏吟诗',
    ],
    moods: [
      '风雅自若',
      '逸兴遄飞',
      '心怀天下',
      '超然物外',
      '怀才不遇',
      '踌躇满志',
    ],
    surround: [
      '文友围坐品评',
      '童子烹茶侍立',
      '红袖添香在侧',
      '同道执卷相商',
      '山中高士来访',
      '故友久别重逢',
    ],
    viewPoints: [
      '书斋一角',
      '园林深处',
      '近景捕捉神态',
      '庭院中远眺',
      '透过雕花窗棂',
    ],
    postures: ['坐于书案后', '拈须而立', '凭窗远眺', '盘坐于蒲团', '负手踱步'],
    templates: [
      (c) => `${c.era}，${pick(['江南园林', '京师书斋', '名士山庄', '书院精舍', '西园雅集'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${c.posture}，${c.action}，与${c.surround}，${pick(['谈笑风生', '辩论激烈', '各抒己见', '击节叹赏'])}。${c.details}。`,
    ],
  },

  // ===== 6b. 宅邸家事 =====
  // 族人求托、亲戚登门、家中纠纷 —— 这些事件没有战场与朝堂，旧的场景库只能误判。
  {
    name: '宅邸家事',
    keywords: ['族', '亲', '家', '堂兄', '族叔', '登门', '求托', '说情', '求情', '内宅', '府邸', '宗族', '亲戚', '长辈', '妻', '母', '父', '兄', '弟', '姐', '妹', '侄', '婚', '嫁', '娶', '家宴', '家事', '门第'],
    weight: 9,
    details: [
      '案上摊着族中来信',
      '屏风后传来压低的说话声',
      '廊下灯笼被风吹得摇晃',
      '茶盏已凉，无人去动',
      '庭院里站着等候的仆从',
      '墙上挂着祖先画像',
      '案头堆着田契与账册',
      '门外停着一顶青布小轿',
      '炭盆里的火将熄',
      '窗纸透出昏黄灯光',
      '几案上摆着未动的酒菜',
      '帘外雨声淅沥',
    ],
    lights: [
      '午后阳光斜照进厅堂',
      '烛火在风中摇曳',
      '黄昏的余晖落在门槛上',
      '阴天光线晦暗',
      '檐下灯笼投下暖光',
      '窗棂透进清冷月色',
    ],
    actions: [
      '拱手行礼',
      '低声恳谈',
      '端坐主位',
      '来回踱步',
      '垂首听训',
      '递上书信',
      '举杯敬酒',
      '沉默不语',
    ],
    moods: [
      '左右为难',
      '面沉如水',
      '言辞恳切',
      '心存疑虑',
      '隐忍不发',
      '心怀愧疚',
      '不动声色',
    ],
    surround: [
      '族中长辈围坐堂中',
      '老仆垂手侍立',
      '内眷在屏风后静听',
      '晚辈立于廊下',
      '管家捧着账册',
      '亲族面面相觑',
      '邻里在门外张望',
    ],
    viewPoints: [
      '厅堂正中取景',
      '主客对坐的侧面构图',
      '从屏风后向外望去',
      '门槛内外的分隔构图',
      '近景捕捉两人神色',
    ],
    postures: ['端坐主位', '拱手立于堂中', '侧身坐在客位', '立于门槛处', '俯身倾听'],
    templates: [
      (c) => `${c.era}，${pick(['府邸正厅', '家宅堂屋', '内院花厅', '书房'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.surround}，${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}与${c.surround}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${pick(['青砖影壁', '垂花门', '厅堂'])}前，${c.playerDesc}${c.posture}，${c.action}。${c.surround}，${c.details}，${c.light}。`,
    ],
  },

  // ===== 7. 密谋 / 夜话 =====
  {
    name: '密谋夜话',
    keywords: ['密', '谋', '私', '暗', '夜', '议', '党', '盟', '私', '谗', '陷', '诬', '弹', '劾', '暗', '通', '联', '结党', '东林', '阉党', '复社'],
    weight: 9,
    details: [
      '屏风后烛影幢幢',
      '书斋内仅一盏孤灯',
      '密室中悬挂字画遮掩',
      '案上摆着密信数封',
      '窗外传来更夫梆子声',
      '院中老槐遮蔽月光',
      '茶已凉透未续',
      '炉中炭火将尽',
      '门闩紧锁，帘幕低垂',
      '墙角立着兵器',
      '书页间夹着密笺',
      '案角摆着半盏残酒',
    ],
    lights: [
      '烛火摇曳不定',
      '月色朦胧',
      '夜深昏暗，仅一灯如豆',
      '阴雨夜，电闪雷鸣',
      '拂晓前的灰蓝',
      '灯下人影幢幢',
    ],
    actions: [
      '低声密语',
      '执笔写就密信',
      '掩卷沉思',
      '窃窃私语',
      '与同党对坐密议',
      '销毁文牍',
    ],
    moods: [
      '城府深沉',
      '如履薄冰',
      '紧张不安',
      '老谋深算',
      '暗藏杀机',
      '心机重重',
    ],
    surround: [
      '心腹侍立于侧',
      '门生故吏环坐',
      '亲信把守门外',
      '密探影影绰绰',
      '同党面目模糊',
      '盟友神情凝重',
    ],
    viewPoints: [
      '烛光近景',
      '屏风后窥视',
      '门缝中望入',
      '阴影中凝视',
      '俯视密室全景',
    ],
    postures: ['坐于案后', '负手踱步', '掩于屏风后', '侧卧榻上', '立于窗前'],
    templates: [
      (c) => `${c.era}，${pick(['夜深', '子时', '三更', '四更'])}。${pick(['书斋', '密室', '内院', '偏厅'])}内，${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}与${c.surround}，${pick(['低声商议', '密约共事', '暗中筹谋', '歃血为盟'])}。${c.details}。`,
    ],
  },

  // ===== 8. 祭奠 / 丧礼 =====
  {
    name: '祭奠丧礼',
    keywords: ['祭', '奠', '丧', '死', '殁', '殉', '谥', '墓', '陵', '庙', '祠', '香火', '致祭', '追封', '入殓', '吊', '唁'],
    weight: 8,
    details: [
      '灵堂白幡低垂',
      '香案上香烟缭绕',
      '棺木漆成朱红',
      '挽联挂满堂前',
      '纸钱在火光中翻飞',
      '墓碑上刻着谥号',
      '庭院中搭起白幔',
      '供桌上摆着三牲祭品',
      '墓前松柏森森',
      '亲友着素服肃立',
      '法器铙钹声起',
      '堂中烛泪流淌',
    ],
    lights: [
      '阴云低垂，天色惨淡',
      '烛火明灭不定',
      '白日如晦',
      '细雨纷飞',
      '薄暮时分',
      '黎明前最暗时刻',
    ],
    actions: [
      '躬身祭拜',
      '扶灵恸哭',
      '焚香祷告',
      '敬献祭文',
      '与亡者告别',
      '搀扶遗孀',
    ],
    moods: [
      '悲恸欲绝',
      '哀思如潮',
      '沉痛缅怀',
      '凄然泪下',
      '不胜哀悼',
      '含悲忍泪',
    ],
    surround: [
      '孝子贤孙跪列',
      '僧道诵经超度',
      '亲友素服肃立',
      '同僚执绋送行',
      '乡民沿途凭吊',
      '故交执香前来',
    ],
    viewPoints: [
      '灵堂中轴对称',
      '棺木前近景',
      '墓前远眺',
      '庭院肃穆全景',
      '烛光中哀容',
    ],
    postures: ['跪于灵前', '躬身祭拜', '肃立一侧', '伏地痛哭', '扶杖而立'],
    templates: [
      (c) => `${c.era}，${pick(['灵堂', '宗祠', '墓前', '城郊送别处'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${c.posture}，${c.action}，${c.surround}。${c.details}。`,
    ],
  },

  // ===== 9. 灾害饥荒 =====
  {
    name: '灾害饥荒',
    keywords: ['灾', '旱', '涝', '疫', '饥', '荒', '蝗', '瘟', '病', '死', '逃荒', '流民', '饿殍', '颗粒无收', '赤地', '洪水'],
    weight: 9,
    details: [
      '田畴龟裂，禾苗枯死',
      '饿殍遍野，野狗争食',
      '流民扶老携幼逃荒',
      '城门紧闭，饥民哀号',
      '瘟疫横行，乡间萧索',
      '蝗虫遮天蔽日',
      '枯井旁围满取水之人',
      '官仓前饥民骚动',
      '易子而食的惨状',
      '黄河决口，泛滥成灾',
      '赤地千里，寸草不生',
      '尸骸枕藉于道旁',
    ],
    lights: [
      '赤日炎炎似火',
      '阴雨连绵不绝',
      '乌云压城，惨雾弥漫',
      '日色昏黄如晦',
      '风沙漫天',
      '朔风凛冽',
    ],
    actions: [
      '巡视灾情',
      '开仓赈济',
      '掩埋遗骸',
      '与灾民对话',
      '勘察田亩',
      '跪于天地祈雨',
    ],
    moods: [
      '心如刀割',
      '忧心如焚',
      '愁眉不展',
      '痛心疾首',
      '悲天悯人',
      '束手无策',
    ],
    surround: [
      '流民哀号求食',
      '官吏束手无策',
      '乡绅闭门不出',
      '疫病患者躺卧道旁',
      '孤儿啼哭不止',
      '老弱相携逃难',
    ],
    viewPoints: [
      '城头俯视灾民',
      '田畴远景萧索',
      '近景捕捉饥民眼神',
      '官道绵延流民',
      '荒野孤坟',
    ],
    postures: ['立于田垄', '策马巡视', '蹲于饥民旁', '负手远望', '跪于荒郊'],
    templates: [
      (c) => `${c.era}，${pick(['黄河决口', '连年大旱', '瘟疫横行', '蝗灾肆虐', '赤地千里'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${c.posture}，所见${c.surround}。${c.details}。`,
    ],
  },

  // ===== 10. 礼仪/婚丧嫁娶 =====
  {
    name: '礼仪场面',
    keywords: ['婚', '嫁', '娶', '礼', '贺', '寿', '诞', '节', '元夕', '元宵', '端午', '中秋', '除夕', '岁旦', '春祭', '秋祭', '朝贺', '朝拜'],
    weight: 7,
    details: [
      '府邸张灯结彩',
      '红烛高照，喜字贴满',
      '宾客盈门，贺礼堆叠',
      '庭院中搭起彩棚',
      '鞭炮纸屑满地',
      '喜宴上觥筹交错',
      '宫灯如昼，丝竹盈耳',
      '礼台上陈设礼器',
      '红绸彩带随风飘扬',
      '府门大开，鼓乐齐鸣',
      '新娘凤冠霞帔',
      '月台上铺着红毯',
    ],
    lights: [
      '红灯高照，喜气洋洋',
      '花灯如昼，映得满堂生辉',
      '正午吉时阳光普照',
      '元宵夜，万家灯火',
      '中秋月，圆润皎洁',
      '除夕夜，烛光通明',
    ],
    actions: [
      '拱手贺喜',
      '主持仪式',
      '举杯致贺',
      '与新人对饮',
      '献上贺礼',
      '与众宾同乐',
    ],
    moods: [
      '春风得意',
      '喜气洋洋',
      '与有荣焉',
      '觥筹交错间',
      '心怀感念',
      '志得意满',
    ],
    surround: [
      '贺客熙熙攘攘',
      '伶人吹拉弹唱',
      '仆从穿梭奉茶',
      '孩童追逐嬉闹',
      '亲族围坐满堂',
      '红娘穿梭于席间',
    ],
    viewPoints: [
      '府门远望',
      '厅堂正中取景',
      '高朋满座全景',
      '近景捕捉神态',
      '庭院深远透视',
    ],
    postures: ['端坐上席', '拱手而立', '行至堂前', '立于门侧', '陪坐一侧'],
    templates: [
      (c) => `${c.era}，${pick(['府邸', '官邸', '酒楼', '戏台'])}${pick(['喜堂', '正厅', '庭院'])}。${c.playerDesc}${c.posture}，${c.action}，${c.mood}。${c.light}，${c.details}。`,
      (c) => `${c.era}，${c.viewPoint}。${c.playerDesc}${c.posture}，${c.action}，${c.surround}。${c.details}。`,
    ],
  },
]

/**
 * 主入口：基于事件信息智能生成 prompt
 */
export function generateEventPrompt(input: EventPromptContext): { prompt: string; sceneName: string } {
  const ctx = buildContext(input)
  const title = input.currentEventTitle || ''
  const desc = input.currentEventBackground || input.currentEventDescription || ''

  // 1) 识别场景大类：多字关键词比单字更可信，标题命中再乘 3。
  //    旧版按"命中个数"算，一个「充军」里的『军』就能把家事事件判成战场边关。
  const matched: { scene: SceneTemplate; score: number }[] = []
  for (const scene of SCENE_LIBRARY) {
    let score = 0
    for (const kw of scene.keywords) {
      const w = Math.max(1, kw.length)
      if (title.includes(kw)) score += w * 3
      else if (desc.includes(kw)) score += w
    }
    // 单字命中（如「军」）说明不了问题，至少要有 3 分才参与竞争
    if (score >= 3) matched.push({ scene, score })
  }

  // 2) 选场景：按得分排序，同分按 weight 排序
  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.scene.weight || 0) - (a.scene.weight || 0)
  })

  let chosen: SceneTemplate
  if (matched.length === 0) {
    // 没命中：智能推断
    chosen = inferScene(input) || SCENE_LIBRARY[0]
  } else {
    chosen = matched[0].scene
  }

  // 3) 填充该场景的随机元素
  ctx.details = pick(chosen.details)
  ctx.light = pick(chosen.lights)
  ctx.action = pick(chosen.actions)
  ctx.mood = pick(chosen.moods)
  ctx.surround = pick(chosen.surround)
  ctx.viewPoint = pick(chosen.viewPoints)
  ctx.posture = pick(chosen.postures)

  // 4) 选模板（多模板时随机）
  const template = pick(chosen.templates)
  const prompt = template(ctx)

  // 5) 事件本身的信息统一追加一次（标题 + 正文摘要），再补风格词。
  //    模板只负责画面构成；事件内容不依赖随机模板是否恰好写了标题。
  const eventClause = ctx.descSnippet ? `事件「${ctx.title}」：${ctx.descSnippet}` : ''
  const parts = [
    prompt,
    eventClause,
    pick(['中国工笔重彩与水墨写意结合', '电影级古风写实风格', '明代院体画与写实油画结合']),
    pick(['柔美自然光', '戏剧化光影', '暖色调光', '冷暖对比光']),
  ].map(s => s.replace(/[，。；、\s]+$/, '')).filter(Boolean)
  const final = `${parts.join('，')}，高视觉密度，4K 超清细节`

  return { prompt: final, sceneName: chosen.name }
}

/** 智能推断（关键词未命中时） */
function inferScene(input: EventPromptContext): SceneTemplate | null {
  const t = input.currentEventTitle
  const d = input.currentEventBackground || input.currentEventDescription
  const text = t + d

  // 推断规则
  if (/月|季|春|夏|秋|冬|寒|暑/.test(text) && /名|景|游|赏/.test(text)) {
    return SCENE_LIBRARY.find(s => s.name === '江南水乡') || null
  }
  if (/人|友|家|父|母|兄|弟|姐|妹|妻|子/.test(text) && /聚|会|见|宴/.test(text)) {
    return SCENE_LIBRARY.find(s => s.name === '文人雅集') || null
  }
  if (/生|人|民|户/.test(text)) {
    return SCENE_LIBRARY.find(s => s.name === '民间市井') || null
  }
  // 默认朝堂
  return null
}
