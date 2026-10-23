/**
 * ============================================================================
 *  steam.cjs —— Steamworks 集成模块（崇祯 · 宦海浮沉模拟器）
 * ============================================================================
 *
 *  【这个模块的唯一设计原则】
 *  Steam 必须、永远、绝对是可选的。任何一个环节出问题（steamworks.js 没装、
 *  原生 .node 绑定没编译、Steam 客户端没启动、AppID 不对、玩家在无 Steam 的
 *  机器上运行），本模块都必须安静地退回 MOCK 驱动，让游戏 100% 可玩。
 *  任何抛出到 main.cjs 的异常都会导致白屏 —— 那是不可接受的事故。
 *
 *  【关于下面 ACHIEVEMENTS 映射表】
 *  1. 左侧的 KEY（SCREAMING_SNAKE_CASE）就是 **Steam API Name**。它必须与
 *     Steamworks App Admin 后台「成就」页面里填写的 API Name **逐字符完全一致**
 *     （大小写敏感、下划线数量敏感）。后台里显示名/描述/图标可以随便改，
 *     API Name 一旦创建就改不了 —— 只能删掉重建。
 *  2. 右侧的 { id, name } 中，`id` 是游戏内部（src/types/achievement.ts）的成就 id，
 *     `name` 只是给你自己看的备注，方便在后台对照填中文显示名。代码只用 `id`。
 *  3. 游戏内部通过 desktopBridge.syncAchievementToDesktop(内部id) 调用，本模块
 *     反查得到 API Name 再解锁。所以映射表是 owner 唯一需要维护的地方。
 *
 *  【成就数量：112 条，已超过 Steam 上限 100 —— 因为本作暂不上 Steam】
 *  Steam 单个 App 的成就上限是 **100** 个。第五十二轮之前项目一直按这个上限倒推裁剪：
 *  删到 100 条，代价是结局图鉴里有 10 格（全是边界/阈值结局）分不到成就，
 *  只能靠存档里的达成记录点亮 —— 成就面板与图鉴两套口径并存，玩家看得见的是"少了 10 条成就"。
 *  现在决定不上 Steam（2026-10-23），名额不再是约束，于是补齐 10 条 + 革职拆支 1 条 = 111 条；第五十六轮补《寿终正寝》一格 = 112 条。
 *
 *  此前已执行的裁剪（合计 -5，见 src/types/achievement.ts 里每处的说明注释）：
 *    · master_collector(60)、ultimate_master(80) —— collector 组的中间档。
 *      它们对玩家本来就不可见：getUnlockedAchievements() 按 group 分桶，
 *      每桶只展示 priority 最高的已解锁项，所以中间档只贡献"多一个勾"的观感。
 *    · ending_collection_15 —— 同理，collection 组（5/15/30）的中间档。
 *    · first_choice（"100 个事件都选第一个选项"）、saver（"存档 30 次"）——
 *      纯"操作习惯"统计型成就，衡量点击频次而非游戏体验，认真玩的人反而拿不到。
 *
 *  保留 random_player 与 careful_player：它们分别有真实入口
 *  （「听天由命」按钮 / 回退功能），且描述的是玩法而非机械操作。
 *
 *  现在映射表 112 条 = 游戏内 112 条。
 *  ⚠️ 如果你之后增删游戏内成就，必须同步改这里并重跑 `node desktop/smoke-test.cjs`
 *     —— 它会断言两边逐条一致（漂移即失败），数量超上限只报 warning（见上面那段）。
 *     日后真要上 Steam，必须先删到 100 条以内：API Name 一经创建不可改，只能删重建。
 *
 *  【Steam Cloud 字节配额】
 *  Steam Cloud 需要在后台「Steam Cloud」页面开启并设置字节配额。游戏本体存档
 *  目前写在 Electron profile 的 localStorage 里（见 preload.cjs 的 save/load 磁盘
 *  API），迁移到 Steam Cloud 是后续独立任务，本脚手架只提供通道。
 * ============================================================================
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * 游戏内部成就 id → Steam API Name。
 * KEY = Steam 后台的 API Name（不可变），value.id = 游戏内部 id。
 * 详细说明见文件头注释。
 */
const ACHIEVEMENTS = {
  // ===== 仕途 (career) =====
  FROM_NINTH: { id: 'from_ninth', name: '从九起步' },
  FIRST_OFFICIAL: { id: 'first_official', name: '初入仕途' },
  NINTH_RANK: { id: 'ninth_rank', name: '正九品官' },
  EIGHTH_RANK: { id: 'eighth_rank', name: '八品县丞' },
  SEVENTH_RANK: { id: 'seventh_rank', name: '七品通判' },
  COUNTY_MAGISTRATE: { id: 'county_magistrate', name: '七品知县' },
  SIXTH_RANK: { id: 'sixth_rank', name: '六品同知' },
  FIFTH_RANK: { id: 'fifth_rank', name: '五品郎中' },
  PREFECTURE_MAGISTRATE: { id: 'prefecture_magistrate', name: '四品知府' },
  THIRD_RANK: { id: 'third_rank', name: '三品大理' },
  SECOND_RANK: { id: 'second_rank', name: '二品侍郎' },
  MINISTER: { id: 'minister', name: '一品尚书' },
  NEVER_DEMOTED: { id: 'never_demoted', name: '官运亨通' },
  FIVE_PROMOTIONS: { id: 'five_promotions', name: '五次升迁' },
  TEN_PROMOTIONS: { id: 'ten_promotions', name: '十次升迁' },
  PROMOTION_MASTER: { id: 'promotion_master', name: '升迁达人' },
  FALLEN_OFFICIAL: { id: 'fallen_official', name: '革职查办' },

  // ===== 属性 (attribute) =====
  RICH: { id: 'rich', name: '富甲一方' },
  GENIUS_WRITER: { id: 'genius_writer', name: '文采斐然' },
  MASTER_ADMIN: { id: 'master_admin', name: '治世能臣' },
  WAR_GOD: { id: 'war_god', name: '战神在世' },
  EMPEROR_FAVOR: { id: 'emperor_favor', name: '圣眷正隆' },
  IMPERIAL_FAVORITE: { id: 'imperial_favorite', name: '帝心独钟' },
  LOVED_BY_ALL: { id: 'loved_by_all', name: '万民敬仰' },
  POOR: { id: 'poor', name: '两袖清风' },
  WEAK: { id: 'weak', name: '体弱多病' },
  STRONG_BODY: { id: 'strong_body', name: '身强体健' },
  IRON_BODY: { id: 'iron_body', name: '铜筋铁骨' },

  // ===== 关系 (relationship) =====
  CLEAN_IMAGE: { id: 'clean_image', name: '清名在外' },
  SCHOLAR_ELITE: { id: 'scholar_elite', name: '清流领袖' },
  EUNUCH_ALLIANCE: { id: 'eunuch_alliance', name: '阉党之交' },
  EUNUCH_BOSS: { id: 'eunuch_boss', name: '阉党魁首' },
  GENTRY_SUPPORT: { id: 'gentry_support', name: '士绅拥戴' },
  GENTRY_ALLIANCE: { id: 'gentry_alliance', name: '士绅同盟' },

  // ===== 结局 (endgame) =====
  COMPLETED_GAME: { id: 'completed_game', name: '走完一生' },
  GOOD_ENDING: { id: 'good_ending', name: '善终' },
  LEGENDARY_ENDING: { id: 'legendary_ending', name: '传奇结局' },
  BAD_ENDING: { id: 'bad_ending', name: '凄凉收场' },
  TRAGIC_ENDING: { id: 'tragic_ending', name: '悲剧落幕' },
  NORMAL_ENDING: { id: 'normal_ending', name: '平淡结局' },
  ENDING_FAMOUS_MINISTER_DONE: { id: 'ending_famous_minister_done', name: '名臣结局' },
  ENDING_ZHONGXING_SUCCESS_DONE: { id: 'ending_zhongxing_success_done', name: '中兴成功' },
  ENDING_MARTYR_NATION_DONE: { id: 'ending_martyr_nation_done', name: '殉国结局' },
  ENDING_DIED_BATTLEFIELD_DONE: { id: 'ending_died_battlefield_done', name: '战死沙场' },
  ENDING_CITY_FALL_DONE: { id: 'ending_city_fall_done', name: '城破结局' },
  ENDING_BORDER_GENERAL_DONE: { id: 'ending_border_general_done', name: '边关大将' },
  ENDING_DUTY_DEATH_DONE: { id: 'ending_duty_death_done', name: '殉职结局' },
  ENDING_PURE_STREAM_DONE: { id: 'ending_pure_stream_done', name: '清流结局' },
  ENDING_HONORABLE_RETIREMENT_DONE: { id: 'ending_honorable_retirement_done', name: '致仕善终' },
  ENDING_ORDINARY_LIFE_DONE: { id: 'ending_ordinary_life_done', name: '平凡一生' },
  ENDING_OLD_AGE_DONE: { id: 'ending_old_age_done', name: '寿终正寝' },
  ENDING_USURPER_THRONE_DONE: { id: 'ending_usurper_throne_done', name: '篡位结局' },
  ENDING_QING_TRIBUTARY_DONE: { id: 'ending_qing_tributary_done', name: '降清结局' },
  ENDING_CLAN_EXTERMINATE_DONE: { id: 'ending_clan_exterminate_done', name: '满门抄斩' },
  ENDING_PIRATE_KING_DONE: { id: 'ending_pirate_king_done', name: '海寇之王' },
  ENDING_BANDIT_KING_DONE: { id: 'ending_bandit_king_done', name: '山贼之王' },
  ENDING_DEBAUCH_FALL_DONE: { id: 'ending_debauch_fall_done', name: '纵欲而亡' },
  ENDING_PIMP_LORD_DONE: { id: 'ending_pimp_lord_done', name: '龟公结局' },
  ENDING_TRAITOR_DONE: { id: 'ending_traitor_done', name: '汉奸结局' },
  ENDING_HERMIT_TAOIST_DONE: { id: 'ending_hermit_taoist_done', name: '归隐修道' },
  ENDING_MONK_NIRVANA_DONE: { id: 'ending_monk_nirvana_done', name: '出家圆寂' },
  ENDING_RECLUSE_SCHOLAR_DONE: { id: 'ending_recluse_scholar_done', name: '隐士学者' },
  ENDING_WEALTHY_RETIREE_DONE: { id: 'ending_wealthy_retiree_done', name: '富家翁结局' },
  ENDING_EXILE_OVERSEAS_DONE: { id: 'ending_exile_overseas_done', name: '海外流亡' },
  ENDING_FAMILY_MAN_DONE: { id: 'ending_family_man_done', name: '儿孙满堂' },
  ENDING_MEDICAL_SAINT_DONE: { id: 'ending_medical_saint_done', name: '一代医圣' },
  ENDING_UNKNOWN_FATE_DONE: { id: 'ending_unknown_fate_done', name: '下落不明' },
  ENDING_ZHAOYU_PRISON_DONE: { id: 'ending_zhaoyu_prison_done', name: '诏狱结局' },
  ENDING_SOUTHERN_MING_DONE: { id: 'ending_southern_ming_done', name: '南明结局' },
  ENDING_JIASHEN_NATIONFALL_DONE: { id: 'ending_jiashen_nationfall_done', name: '甲申国变' },

  // -------------------------------------------------------------------------
  //  补登记：上一轮修「34 个结局里有 5 个没有对应成就」时补进了游戏内，
  //  但**漏了这里**。原 smoke-test 只比对两个手写常量（都是 105），因此完全看不出来 ——
  //  这 5 个成就永远不会同步到 Steam，结局图鉴在 Steam 侧也永远缺这 5 个勾。
  //  现在 smoke-test.cjs 会直接解析 src/types/achievement.ts 逐条对拍，
  //  这类漏登记会被立刻抓住。
  // -------------------------------------------------------------------------
  ENDING_DEBAUCHERY_001_DONE: { id: 'ending_debauchery_001_done', name: '醉生梦死' },
  ENDING_SCHOLAR_MARTYR_DONE: { id: 'ending_scholar_martyr_done', name: '书院焚身' },
  ENDING_FUGITIVE_DONE: { id: 'ending_fugitive_done', name: '海外遗民' },
  ENDING_BANKRUPT_DONE: { id: 'ending_bankrupt_done', name: '倾家荡产' },
  ENDING_DEMOTION_DONE: { id: 'ending_demotion_done', name: '削职为民' },
  // 第五十二轮：革职两支拆开各占一格（原先与上一条共用 id，一格两种归宿）
  ENDING_EXILE_DONE: { id: 'ending_exile_done', name: '流放边疆' },
  // 第五十二轮：补齐十格边界/阈值结局的成就。
  // 游戏内成就 id 用 `ending_*_done`（成就层的命名约定），事件 id 是 `triggerable_*`，
  // 两者的换算登记在 src/data/endingRegistry.ts 的 ENDING_ID_ALIASES 里。
  ENDING_DEATH_ILLNESS_DONE: { id: 'ending_death_illness_done', name: '病逝任上' },
  ENDING_EMPEROR_HATE_DONE: { id: 'ending_emperor_hate_done', name: '龙颜震怒' },
  ENDING_EUNUCH_FRAME_DONE: { id: 'ending_eunuch_frame_done', name: '宦官构陷' },
  ENDING_SCHOLAR_OSTRACISM_DONE: { id: 'ending_scholar_ostracism_done', name: '士林唾弃' },
  ENDING_GENTRY_REBELLION_DONE: { id: 'ending_gentry_rebellion_done', name: '乡绅反目' },
  ENDING_POPULAR_UPROAR_DONE: { id: 'ending_popular_uproar_done', name: '民怨沸腾' },
  ENDING_MORAL_ISOLATION_DONE: { id: 'ending_moral_isolation_done', name: '众叛亲离' },
  ENDING_FACTION_MARTYR_DONE: { id: 'ending_faction_martyr_done', name: '东林烈士' },
  ENDING_TYRANT_FALL_DONE: { id: 'ending_tyrant_fall_done', name: '权奸末路' },
  ENDING_FACTION_SACRIFICE_DONE: { id: 'ending_faction_sacrifice_done', name: '党争牺牲品' },
  ENDING_COLLECTION_5: { id: 'ending_collection_5', name: '结局收集 5 种' },
  ENDING_COLLECTION_30: { id: 'ending_collection_30', name: '结局收集 30 种' },

  // ===== 特殊 (special) =====
  PERSISTENT: { id: 'persistent', name: '坚持不懈' },
  LONG_LIVE: { id: 'long_live', name: '长命百岁' },
  SURVIVOR: { id: 'survivor', name: '乱世幸存' },
  PRE_1644: { id: 'pre_1644', name: '甲申之前' },
  YEAR_1644: { id: 'year_1644', name: '亲历甲申' },
  YEAR_1645: { id: 'year_1645', name: '乙酉之年' },
  DECADE_OFFICIAL: { id: 'decade_official', name: '十年为官' },
  HALF_DECADE: { id: 'half_decade', name: '五载宦海' },
  COLLECTOR: { id: 'collector', name: '收藏家' },
  LEGENDARY_MASTER: { id: 'legendary_master', name: '传奇宗师' },
  BALANCED: { id: 'balanced', name: '均衡发展' },
  PERFECT_BALANCE: { id: 'perfect_balance', name: '完美均衡' },
  NOBLE_CLIMB: { id: 'noble_climb', name: '寒门贵子' },
  RICH_POPULAR: { id: 'rich_popular', name: '富而好礼' },
  SCHOLAR_OFFICIAL: { id: 'scholar_official', name: '学而优则仕' },
  EMPEROR_PEOPLE: { id: 'emperor_people', name: '君臣相得' },
  THREE_HIGH: { id: 'three_high', name: '三高全能' },
  CORRUPT_OFFICIAL: { id: 'corrupt_official', name: '贪墨之徒' },
  LOYAL_MINISTER: { id: 'loyal_minister', name: '忠臣典范' },
  NEUTRAL_OFFICIAL: { id: 'neutral_official', name: '中庸之道' },
  LUCKY: { id: 'lucky', name: '洪福齐天' },
  UNLUCKY: { id: 'unlucky', name: '时运不济' },
  RANDOM_PLAYER: { id: 'random_player', name: '听天由命' },
  CAREFUL_PLAYER: { id: 'careful_player', name: '谨小慎微' }
}

/** 内部 id → Steam API Name 的反查表（由 ACHIEVEMENTS 自动生成，不要手改） */
const INTERNAL_ID_TO_API_NAME = (() => {
  const map = Object.create(null)
  for (const apiName of Object.keys(ACHIEVEMENTS)) {
    map[ACHIEVEMENTS[apiName].id] = apiName
  }
  return map
})()

/** 实测从 src/types/achievement.ts 提取到的成就总数，仅用于日志/文档 */
/**
 * 游戏内部成就数量（对应 src/types/achievement.ts 里 ALL_ACHIEVEMENTS 的条目数）。
 *
 * 这是个手写常量，会随成就增删而漂移 —— 所以 smoke-test.cjs 会直接解析
 * src/types/achievement.ts，把真实条数与它对拍。改了一处忘了另一处时
 * 
ode desktop/smoke-test.cjs 会失败，而不是等到上线才发现有成就没注册。
 */
const INTERNAL_ACHIEVEMENT_COUNT = 112
/**
 * Steam 单 App 成就数量硬上限。
 *
 * 第五十二轮起**本表已经超出这个数**（112 > 100）：本作暂不上 Steam，
 * 而图鉴那 45 格每一格都该有一条成就 —— 此前 10 格因为"名额不够"只能靠达成记录点亮，
 * 成就面板与图鉴于是长期是两套口径。这条上限因此从"硬约束"降级成"上线前的待办"：
 * 真要上 Steam，先删够 12 条（候选：category='special' 里的操作统计型成就），再重跑 smoke-test。
 */
const STEAM_ACHIEVEMENT_LIMIT = 100

/** runCallbacks 泵的间隔（ms）。steamworks.js 必须持续泵，成就/overlay 才会生效 */
const CALLBACK_PUMP_INTERVAL_MS = 100

/**
 * 把内部 id 解析成 Steam API Name。
 * @param {string} idOrApiName 游戏内部 id（小写蛇形）或已经是 API Name
 * @returns {string|null}
 */
function resolveApiName(idOrApiName) {
  if (typeof idOrApiName !== 'string' || idOrApiName === '') return null
  if (Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, idOrApiName)) return idOrApiName
  const mapped = INTERNAL_ID_TO_API_NAME[idOrApiName]
  return mapped === undefined ? null : mapped
}

/* ==========================================================================
 *  模块级状态
 * ========================================================================== */

/** @type {'steam'|'mock'|null} */
let activeDriver = null
let activeAppId = null
let playerName = null
/** 最近一次失败原因（成功时为 null）。getStatus() 会原样返回，便于排障 */
let lastError = null
let pumpTimer = null
let realClient = null
let userDataPath = null
let shuttingDown = false

/* ==========================================================================
 *  MOCK 驱动
 *  ------------------------------------------------------------------------
 *  纯 JS 实现，零原生依赖。把「已解锁成就」和「云存档文件」当成一个 JSON
 *  文件落在 <userData>/mock-steam/ 下面，因此：
 *    - 没有 Steam 也能完整跑通成就流程，方便本地开发与 QA；
 *    - 重启应用后状态保留，能验证「已解锁不再重复解锁」这类逻辑；
 *    - 想重置，直接删掉 mock-steam/ 目录即可。
 * ========================================================================== */

/** mock 状态文件名 */
const MOCK_STATE_FILE = 'mock-state.json'

/** @returns {string} mock 驱动的数据目录 */
function mockDir() {
  const base = userDataPath || path.join(process.cwd(), '.mock-userdata')
  return path.join(base, 'mock-steam')
}

/** @returns {string} mock 状态文件的绝对路径 */
function mockStatePath() {
  return path.join(mockDir(), MOCK_STATE_FILE)
}

/** 读取 mock 状态；文件缺失/损坏时返回全新空状态，绝不抛异常 */
function mockReadState() {
  const empty = { achievements: {}, cloudFiles: {} }
  try {
    const raw = fs.readFileSync(mockStatePath(), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      achievements: parsed && typeof parsed.achievements === 'object' && parsed.achievements !== null
        ? parsed.achievements
        : {},
      cloudFiles: parsed && typeof parsed.cloudFiles === 'object' && parsed.cloudFiles !== null
        ? parsed.cloudFiles
        : {}
    }
  } catch {
    return empty
  }
}

/** 写回 mock 状态；失败只告警，不影响游戏 */
function mockWriteState(state) {
  try {
    fs.mkdirSync(mockDir(), { recursive: true })
    fs.writeFileSync(mockStatePath(), JSON.stringify(state, null, 2), 'utf8')
    return true
  } catch (err) {
    lastError = 'mock 状态写入失败：' + (err && err.message ? err.message : String(err))
    return false
  }
}

/**
 * 云存档文件名的安全校验：mock 驱动直接落盘，必须阻止路径穿越。
 * @param {unknown} name
 * @returns {string|null} 合法则返回原名，否则 null
 */
function sanitizeCloudFileName(name) {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > 200) return null
  if (/[\\/]/.test(trimmed)) return null
  if (trimmed === '.' || trimmed === '..') return null
  if (/[\u0000-\u001f]/.test(trimmed)) return null
  return trimmed
}

/** 构造 mock 驱动实例 */
function createMockDriver() {
  return {
    kind: 'mock',

    /**
     * @param {number|null} appId
     * @returns {boolean} mock 永远"初始化成功"
     */
    init(appId) {
      activeAppId = appId === null || appId === undefined ? null : Number(appId)
      playerName = '离线玩家 (Mock)'
      // 确保目录存在，便于 owner 一眼看到 mock 数据落在哪里
      try {
        fs.mkdirSync(mockDir(), { recursive: true })
      } catch {
        /* 目录建不出来也不影响内存态工作 */
      }
      return true
    },

    getPlayerName() {
      return playerName
    },

    /**
     * 解锁成就（幂等：已解锁直接返回 true，不覆盖原解锁时间）
     * @param {string} apiName
     * @returns {boolean}
     */
    unlockAchievement(apiName) {
      if (typeof apiName !== 'string' || apiName === '') return false
      const state = mockReadState()
      if (!Object.prototype.hasOwnProperty.call(state.achievements, apiName)) {
        state.achievements[apiName] = new Date().toISOString()
      }
      mockWriteState(state)
      return true
    },

    /**
     * @param {string} apiName
     * @returns {boolean}
     */
    isAchievementUnlocked(apiName) {
      if (typeof apiName !== 'string' || apiName === '') return false
      const state = mockReadState()
      return Object.prototype.hasOwnProperty.call(state.achievements, apiName)
    },

    /**
     * @param {string} name
     * @param {string} contents
     * @returns {boolean}
     */
    setCloudFile(name, contents) {
      const safe = sanitizeCloudFileName(name)
      if (safe === null) return false
      if (typeof contents !== 'string') return false
      const state = mockReadState()
      state.cloudFiles[safe] = contents
      return mockWriteState(state)
    },

    /**
     * @param {string} name
     * @returns {string|null}
     */
    getCloudFile(name) {
      const safe = sanitizeCloudFileName(name)
      if (safe === null) return null
      const state = mockReadState()
      const value = state.cloudFiles[safe]
      return typeof value === 'string' ? value : null
    },

    /** @returns {string[]} */
    listCloudFiles() {
      const state = mockReadState()
      return Object.keys(state.cloudFiles).sort()
    },

    runCallbacks() {
      /* mock 不需要泵回调 */
    },

    shutdown() {
      /* mock 无资源可释放 */
    }
  }
}

/* ==========================================================================
 *  真实 Steam 驱动（steamworks.js）
 * ========================================================================== */

/**
 * 尝试加载 steamworks.js。
 * 用变量拼接模块名可以避免打包器/静态分析把 require 提升成硬依赖 —— 这个模块
 * 必须能在 steamworks.js 完全不存在时也正常 require 本文件。
 * @returns {object|null} 模块对象，或 null
 */
function tryRequireSteamworks() {
  const moduleName = 'steamworks.js'
  try {
    // eslint-disable-next-line global-require
    return require(moduleName)
  } catch (err) {
    lastError = 'steamworks.js 加载失败：' + (err && err.message ? err.message : String(err))
    return null
  }
}

/**
 * 构造真实驱动。
 * @param {object} steamworks steamworks.js 模块对象
 * @returns {object|null} 初始化失败返回 null（由调用方回退到 mock）
 */
function createSteamDriver(steamworks) {
  // steamworks.js 的 CJS 入口导出 { init, ... }；某些版本包了一层 default
  const api = steamworks && steamworks.default ? steamworks.default : steamworks
  if (!api || typeof api.init !== 'function') {
    lastError = 'steamworks.js 已加载但缺少 init()，版本不兼容（需要 ^0.3.0）'
    return null
  }

  let client
  try {
    // init(appId) 在以下情况会抛：Steam 未运行、AppID 无效、未拥有该 App
    client = api.init(activeAppId === null ? undefined : activeAppId)
  } catch (err) {
    lastError = 'Steam 初始化失败：' + (err && err.message ? err.message : String(err))
    return null
  }
  if (!client) {
    lastError = 'Steam 初始化返回空 client（Steam 客户端未运行或 AppID 无效）'
    return null
  }

  realClient = client

  return {
    kind: 'steam',

    /**
     * @param {number|null} appId
     * @returns {boolean}
     */
    init(appId) {
      activeAppId = appId === null || appId === undefined ? null : Number(appId)
      try {
        playerName = client.localplayer.getName()
      } catch (err) {
        // 用户名拿不到不算致命
        playerName = null
        lastError = '读取 Steam 昵称失败：' + (err && err.message ? err.message : String(err))
      }
      return true
    },

    getPlayerName() {
      return playerName
    },

    /**
     * @param {string} apiName
     * @returns {boolean} 是否成功下发（Steam 后端不存在的 API Name 返回 false）
     */
    unlockAchievement(apiName) {
      try {
        return client.achievement.activate(apiName) === true
      } catch (err) {
        lastError = '成就解锁失败（' + apiName + '）：' + (err && err.message ? err.message : String(err))
        return false
      }
    },

    /**
     * @param {string} apiName
     * @returns {boolean}
     */
    isAchievementUnlocked(apiName) {
      try {
        return client.achievement.isActivated(apiName) === true
      } catch (err) {
        lastError = '查询成就状态失败（' + apiName + '）：' + (err && err.message ? err.message : String(err))
        return false
      }
    },

    /**
     * 写入 Steam 远程存储（Steam Cloud）。
     * 注意：后台没开 Steam Cloud 或没配足字节配额时，writeFile 会返回 false ——
     * 这不是崩溃，只是这次写入没进云，本地 localStorage 存档依然完好。
     * @param {string} name
     * @param {string} contents
     * @returns {boolean}
     */
    setCloudFile(name, contents) {
      try {
        if (typeof client.cloud.isEnabledForApp === 'function' && client.cloud.isEnabledForApp() !== true) {
          lastError = 'Steam Cloud 未对本 App 启用（需在 Steamworks 后台 Steam Cloud 页面开启并设置配额）'
          return false
        }
        return client.cloud.writeFile(name, contents) === true
      } catch (err) {
        lastError = 'Steam Cloud 写入失败（' + name + '）：' + (err && err.message ? err.message : String(err))
        return false
      }
    },

    /**
     * @param {string} name
     * @returns {string|null}
     */
    getCloudFile(name) {
      try {
        const exists = client.cloud.fileExists(name)
        if (exists !== true) return null
        const content = client.cloud.readFile(name)
        if (typeof content === 'string') return content
        if (content && typeof content.toString === 'function') return content.toString('utf8')
        return null
      } catch (err) {
        lastError = 'Steam Cloud 读取失败（' + name + '）：' + (err && err.message ? err.message : String(err))
        return null
      }
    },

    /**
     * 列出云端文件。
     * steamworks.js 0.3.x 提供 cloud.listFiles(): Array<{ name, size }>。
     * @returns {string[]}
     */
    listCloudFiles() {
      try {
        if (typeof client.cloud.listFiles !== 'function') {
          lastError = 'steamworks.js 的 cloud.listFiles() 不可用，版本可能过旧（需要 ^0.3.0）'
          return []
        }
        const files = client.cloud.listFiles()
        if (!Array.isArray(files)) return []
        return files
          .map((item) => (item && typeof item.name === 'string' ? item.name : null))
          .filter((name) => name !== null)
          .sort()
      } catch (err) {
        lastError = 'Steam Cloud 列表读取失败：' + (err && err.message ? err.message : String(err))
        return []
      }
    },

    /**
     * 泵一次 Steam 回调。
     * 说明：steamworks.js 的 init() 内部已经起了一个 30Hz 的 setInterval 自动泵
     * （见其 index.js），所以这里的额外泵**不是必需的**。保留是为了两点：
     *   1. 万一将来换用不自动泵的版本，回调仍然会被驱动；
     *   2. 让"必须持续泵回调"这件事在代码里显式可见，而不是藏在依赖内部。
     * 重复泵是安全的：SteamAPI_RunCallbacks 可以被反复调用。
     */
    runCallbacks() {
      try {
        api.runCallbacks()
      } catch (err) {
        lastError = 'runCallbacks 异常：' + (err && err.message ? err.message : String(err))
      }
    },

    shutdown() {
      try {
        // steamworks.js 0.3.x 没有导出 shutdown()；先探测再调用，避免误报。
        if (api && typeof api.shutdown === 'function') api.shutdown()
      } catch {
        /* 退出阶段的异常无意义，吞掉 */
      }
    }
  }
}

/* ==========================================================================
 *  对外 API
 * ========================================================================== */

/** 停止回调泵（重复调用安全） */
function stopCallbackPump() {
  if (pumpTimer !== null) {
    clearInterval(pumpTimer)
    pumpTimer = null
  }
}

/**
 * 初始化 Steam。**绝不抛异常**：任何失败都回退到 mock 驱动。
 *
 * @param {object} [options]
 * @param {number|string|null} [options.appId] Steam AppID；为空时依次尝试
 *        读取 steam_appid.txt / 环境变量 SteamAppId / 退回 mock。
 * @param {string} [options.userDataPath] 用户数据目录（app.getPath('userData')）。
 *        mock 驱动的持久化落在这里；不传则用 cwd 下的 .mock-userdata。
 * @param {boolean} [options.preferMock] 强制使用 mock（调试用）
 * @returns {{ available:boolean, driver:'steam'|'mock', appId:number|null, playerName:string|null, error:string|null }}
 */
function initSteam(options) {
  const opts = options || {}

  // 幂等：重复 init 直接返回当前状态，避免起两个回调泵
  if (activeDriver !== null) return getStatus()

  if (typeof opts.userDataPath === 'string' && opts.userDataPath !== '') {
    userDataPath = opts.userDataPath
  }

  activeAppId = normalizeAppId(opts.appId)

  // 逃生开关：某些机器上 Steam 客户端可能处于半坏状态（能加载 dll 但 init 卡住）。
  // 设 CHONGZHEN_FORCE_MOCK_STEAM=1 可强制走 mock，便于玩家自救与排障。
  const forceMock = opts.preferMock === true || process.env.CHONGZHEN_FORCE_MOCK_STEAM === '1'

  let driver = null

  if (!forceMock) {
    const steamworks = tryRequireSteamworks()
    if (steamworks !== null) {
      driver = createSteamDriver(steamworks)
    }
  } else {
    lastError = '强制使用 mock 驱动（preferMock 或 CHONGZHEN_FORCE_MOCK_STEAM=1）'
  }

  if (driver === null) {
    // ---- 回退路径：这是最常见的情况，且必须是完全无害的 ----
    // 真实驱动失败的具体原因已经写在 lastError 里；如果本来就没试真实驱动
    // （preferMock），lastError 也是那句"按要求使用 mock 驱动"，都留着给 getStatus() 看。
    driver = createMockDriver()
    activeDriver = driver
    driver.init(activeAppId)
    return getStatus()
  }

  // ---- 真实驱动路径 ----
  activeDriver = driver
  driver.init(activeAppId)

  // 显式泵回调（steamworks.js 内部已有 30Hz 自动泵，这里是冗余保险）
  stopCallbackPump()
  pumpTimer = setInterval(() => {
    if (shuttingDown || activeDriver === null) return
    try {
      activeDriver.runCallbacks()
    } catch {
      /* 泵里的异常绝不能冒出去 */
    }
  }, CALLBACK_PUMP_INTERVAL_MS)
  if (typeof pumpTimer.unref === 'function') pumpTimer.unref()

  return getStatus()
}

/**
 * 把各种形态的 AppID 归一化成 number | null。
 * @param {unknown} raw
 * @returns {number|null}
 */
function normalizeAppId(raw) {
  if (raw === null || raw === undefined || raw === '') {
    const fromEnv = process.env.SteamAppId
    if (typeof fromEnv === 'string' && /^\d+$/.test(fromEnv.trim())) return Number(fromEnv.trim())
    return null
  }
  const value = String(raw).trim()
  return /^\d+$/.test(value) ? Number(value) : null
}

/**
 * 读取 steam_appid.txt 的内容（去掉注释与空白）。
 * 约定：文件里只有一行纯数字。找不到或内容非法返回 null。
 * @param {string} filePath
 * @returns {string|null}
 */
function readAppIdFile(filePath) {
  try {
    if (typeof filePath !== 'string' || filePath === '') return null
    const raw = fs.readFileSync(filePath, 'utf8')
    const firstLine = String(raw)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('#'))
    if (firstLine === undefined) return null
    return /^\d+$/.test(firstLine) ? firstLine : null
  } catch {
    return null
  }
}

/**
 * 当前状态快照。UI / 日志 / 排障都用它。
 * @returns {{ available:boolean, driver:'steam'|'mock', appId:number|null, playerName:string|null, error:string|null }}
 */
function getStatus() {
  const driver = activeDriver === null ? 'mock' : activeDriver.kind
  return {
    // available 的真实含义是"真的连上了 Steam 客户端"，mock 永远是 false
    available: driver === 'steam' && realClient !== null,
    driver,
    appId: activeAppId,
    playerName,
    error: lastError
  }
}

/**
 * 解锁成就。支持传游戏内部 id（如 'from_ninth'）或 Steam API Name（如 'FROM_NINTH'）。
 * 未知 id 返回 false 并记录原因，绝不抛异常。
 * @param {string} idOrApiName
 * @returns {boolean}
 */
function unlockAchievement(idOrApiName) {
  if (activeDriver === null) {
    lastError = 'Steam 尚未初始化（请先调用 initSteam）'
    return false
  }
  const apiName = resolveApiName(idOrApiName)
  if (apiName === null) {
    lastError = '未知成就 id：' + String(idOrApiName) + '（不在 ACHIEVEMENTS 映射表中）'
    return false
  }
  return activeDriver.unlockAchievement(apiName) === true
}

/**
 * 查询成就是否已解锁。
 * @param {string} idOrApiName
 * @returns {boolean}
 */
function isAchievementUnlocked(idOrApiName) {
  if (activeDriver === null) return false
  const apiName = resolveApiName(idOrApiName)
  if (apiName === null) return false
  return activeDriver.isAchievementUnlocked(apiName) === true
}

/**
 * 写入云存档文件。
 * @param {string} name
 * @param {string} contents
 * @returns {boolean}
 */
function setCloudFile(name, contents) {
  if (activeDriver === null) return false
  if (typeof name !== 'string' || typeof contents !== 'string') return false
  return activeDriver.setCloudFile(name, contents) === true
}

/**
 * 读取云存档文件。
 * @param {string} name
 * @returns {string|null}
 */
function getCloudFile(name) {
  if (activeDriver === null) return null
  if (typeof name !== 'string') return null
  return activeDriver.getCloudFile(name)
}

/**
 * 列出云端文件名。
 * @returns {string[]}
 */
function listCloudFiles() {
  if (activeDriver === null) return []
  return activeDriver.listCloudFiles()
}

/** @returns {string|null} Steam 昵称 */
function getPlayerName() {
  return playerName
}

/** @returns {boolean} 是否真的连着 Steam（mock 时为 false） */
function isAvailable() {
  return getStatus().available
}

/** @returns {boolean} 是否使用真实 Steam 驱动 */
function isRealSteam() {
  return activeDriver !== null && activeDriver.kind === 'steam'
}

/**
 * 优雅退出。before-quit 时调用。重复调用安全。
 * @returns {void}
 */
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  stopCallbackPump()
  try {
    if (activeDriver !== null && typeof activeDriver.shutdown === 'function') {
      activeDriver.shutdown()
    }
  } catch {
    /* 忽略 */
  }
  activeDriver = null
  realClient = null
}

module.exports = {
  // 初始化 / 状态
  initSteam,
  getStatus,
  shutdown,
  getPlayerName,
  isAvailable,
  isRealSteam,
  readAppIdFile,
  // 成就
  ACHIEVEMENTS,
  unlockAchievement,
  isAchievementUnlocked,
  resolveApiName,
  // 云存档
  setCloudFile,
  getCloudFile,
  listCloudFiles,
  // 常量（文档 / 自检用）
  INTERNAL_ACHIEVEMENT_COUNT,
  STEAM_ACHIEVEMENT_LIMIT,
  CALLBACK_PUMP_INTERVAL_MS
}

