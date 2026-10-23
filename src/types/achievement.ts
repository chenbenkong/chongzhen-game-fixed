import { Attributes, GameStateValues, OriginType } from './game'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  category: 'career' | 'attribute' | 'relationship' | 'endgame' | 'special'
  /** 同组内互斥阶梯（例：80/95 两档、品级 7 个等级、升官次数） */
  group?: string
  /** 组内显示优先级：数字越大越优先显示；未设则视为独立成就 */
  priority?: number
  checkUnlock: (ctx: AchievementContext) => boolean
  unlocked: boolean
  unlockTime?: string
  /**
   * 标记「当前版本游戏内不存在达成入口」的成就，使其不参与「传奇大师」的全收集判定，
   * 避免把全收集成就一起拖成不可达。
   *
   * 目前**没有**任何成就使用这个标记：此前用它绕过的 random_player 与
   * ending_collection_5/15/30 都已修好（分别补上了「听天由命」入口、
   * 以及跨局结局统计与缺失的结局成就）。保留该机制以备将来又出现不可达条目。
   */
  deadByDesign?: boolean
}

export interface AchievementContext {
  attributes: Attributes
  gameState: GameStateValues
  characterRank?: string
  hasEnded?: boolean
  endingType?: string
  eventHistory: string[]
  /** 本局累计升迁次数（取自 character.promotionCount） */
  promotionCount: number
  /** 本局累计贬官次数（取自 character.demotionCount） */
  demotionCount: number
  /** 连续「非负面回合」计数：每过一个非负面回合 +1，遇到负面回合清零 */
  luckyStreak: number
  /** 连续「负面回合」计数：每过一个负面回合 +1，遇到非负面回合清零 */
  unluckyStreak: number
  /** 累计「选中当前事件的第一个选项」的事件数 */
  firstChoiceCount: number
  /**
   * 累计「随机选择选项」的次数。
   * 来源是事件选项列表下方的「听 天 由 命」按钮
   * （EventDisplay.handleRandomChoice → handleChoice(choice, { random: true })）。
   */
  randomChoiceCount: number
  /** 累计使用悔棋/回退功能的次数 */
  undoCount: number
  /** 累计手动存档次数（不含自动存档） */
  saveCount: number
  /** 角色出身。noble_climb 成就需要按出身判定 */
  origin?: OriginType
  /**
   * 当前存档内**已解锁的成就 id 列表**。
   *
   * 「结局收藏」类成就必须依赖它，而不是 `eventHistory`：结局的解锁状态是记录成
   * `ending_*_done` 形式的成就的（见 endingSystem.triggerEndingAchievements 与
   * EndingCodex 的读取方式），而 eventHistory 是**单局**的事件流水 ——
   * 一局只会走到一个结局，用它统计跨局收集数永远凑不满。
   */
  unlockedAchievements: string[]
}

export interface AchievementData {
  unlocked: string[]
  unlockTimes: Record<string, string>
  /**
   * 本存档**达成过的结局**：图鉴格子 id → 首次达成时间（ISO）。
   *
   * 为什么图鉴不能只看成就：结局成就的 id 是从事件 id 拼出来的
   * （`${event.id}_done`，见 endingSystem.triggerEndingAchievements），
   * 而 44 个格子里有 10 个**根本没有对应的成就条目** —— 病逝任上、龙颜震怒、
   * 宦官构陷、士林唾弃、乡绅反目、民怨沸腾、众叛亲离、东林烈士、权奸末路、
   * 党争牺牲品，全是边界/阈值结局。玩家反复打到它们，
   * 图鉴那一格却永远是灰的。成就表受 Steam 单 App 100 条上限约束加不动，
   * 所以达成记录自己存一份，与成就解耦。
   * （破产那一格是另一种对不上：注册 id `triggerable_bankrupt` 被引擎改名成
   *  `ending_bankrupt` 才去拼成就 id。那种在 data/endingRegistry.ts 里登记别名解决，
   *  不靠这里兜。）
   *
   * 可选：老存档没有这个字段，读档时按空处理；那些存档里已经点亮的结局成就
   * 仍会照常点亮图鉴，不会倒退。
   */
  reachedEndings?: Record<string, string>
}

/**
 * 已解锁的**不同结局**数量。
 *
 * 数据源是成就列表里的 `ending_*_done` 条目。此前三处「结局收藏」成就统计的是
 * `eventHistory` 里的 ending_* id：那是单局流水，而且 handleGameOver 是在把结局 id
 * 写进 eventHistory **之前**调用 checkAchievements 的，检查时该局结局数恒为 0，
 * 单局最多也只会有一个结局（结局即终局）。所以那些成就实际不可达。
 */
function countUnlockedEndings(ctx: AchievementContext): number {
  // 用 Set 去重：判据写的是"不同结局数"，就不能被重复条目骗过
  // （正常路径下 unlockAchievement 有 includes 守卫，不会写入重复 id，
  //  但这里显式去重可以让这条不变量不依赖调用方的自觉）
  return new Set(
    ctx.unlockedAchievements.filter(id => id.startsWith('ending_') && id.endsWith('_done'))
  ).size
}

// 成就定义
export const ALL_ACHIEVEMENTS: Achievement[] = [
  // 仕途成就
  {
    id: 'from_ninth',
    name: '从九起步',
    description: '担任从九品司狱',
    icon: '九',
    category: 'career',
    group: 'rank',
    priority: 5,
    checkUnlock: (ctx) => ctx.characterRank?.includes('从九品') === true,
    unlocked: false
  },
  {
    id: 'first_official',
    name: '初入仕途',
    description: '完成第一次做官',
    icon: '仕',
    category: 'career',
    group: 'rank',
    priority: 10,
    checkUnlock: (ctx) => ctx.characterRank !== undefined && ctx.characterRank !== '',
    unlocked: false
  },
  {
    id: 'ninth_rank',
    name: '正九品官',
    description: '担任正九品主簿',
    icon: '品',
    category: 'career',
    group: 'rank',
    priority: 15,
    checkUnlock: (ctx) => ctx.characterRank?.includes('正九品') === true,
    unlocked: false
  },
  {
    id: 'eighth_rank',
    name: '八品县丞',
    description: '担任从八品县丞',
    icon: '丞',
    category: 'career',
    group: 'rank',
    priority: 25,
    checkUnlock: (ctx) => ctx.characterRank?.includes('从八品') === true,
    unlocked: false
  },
  {
    id: 'seventh_rank',
    name: '七品通判',
    description: '担任从七品通判',
    icon: '判',
    category: 'career',
    group: 'rank',
    priority: 30,
    checkUnlock: (ctx) => ctx.characterRank?.includes('从七品') === true,
    unlocked: false
  },
  {
    id: 'county_magistrate',
    name: '七品知县',
    description: '担任正七品知县',
    icon: '县',
    category: 'career',
    group: 'rank',
    priority: 35,
    checkUnlock: (ctx) => ctx.characterRank?.includes('知县') === true,
    unlocked: false
  },
  {
    id: 'sixth_rank',
    name: '六品同知',
    description: '担任正六品同知',
    icon: '同',
    category: 'career',
    group: 'rank',
    priority: 45,
    checkUnlock: (ctx) => ctx.characterRank?.includes('正六品') === true,
    unlocked: false
  },
  {
    id: 'fifth_rank',
    name: '五品郎中',
    description: '担任正五品郎中',
    icon: '郎',
    category: 'career',
    group: 'rank',
    priority: 55,
    checkUnlock: (ctx) => ctx.characterRank?.includes('正五品') === true,
    unlocked: false
  },
  {
    id: 'prefecture_magistrate',
    name: '四品知府',
    description: '担任正四品知府',
    icon: '府',
    category: 'career',
    group: 'rank',
    priority: 65,
    checkUnlock: (ctx) => ctx.characterRank?.includes('知府') === true,
    unlocked: false
  },
  {
    id: 'third_rank',
    name: '三品大理',
    description: '担任正三品大理寺卿',
    icon: '理',
    category: 'career',
    group: 'rank',
    priority: 75,
    checkUnlock: (ctx) => ctx.characterRank?.includes('大理寺卿') === true,
    unlocked: false
  },
  {
    id: 'second_rank',
    name: '二品尚书',
    description: '担任正二品尚书',
    icon: '尚',
    category: 'career',
    group: 'rank',
    priority: 85,
    checkUnlock: (ctx) => ctx.characterRank?.includes('尚书') === true,
    unlocked: false
  },
  {
    id: 'minister',
    name: '一品大员',
    description: '担任正一品大员',
    icon: '员',
    category: 'career',
    group: 'rank',
    priority: 95,
    checkUnlock: (ctx) => ctx.characterRank?.includes('太师') === true || ctx.characterRank?.includes('正一品') === true,
    unlocked: false
  },
  {
    id: 'never_demoted',
    name: '一路高升',
    description: '从未被贬官',
    icon: '升',
    category: 'career',
    checkUnlock: (ctx) => ctx.gameState.turn >= 30 && ctx.demotionCount === 0,
    unlocked: false
  },
  {
    id: 'five_promotions',
    name: '五连升',
    description: '单次游戏内升官5次以上',
    icon: '升',
    category: 'career',
    group: 'promotion',
    priority: 50,
    checkUnlock: (ctx) => ctx.promotionCount >= 5,
    unlocked: false
  },
  {
    id: 'ten_promotions',
    name: '十连升',
    description: '单次游戏内升官10次以上',
    icon: '迁',
    category: 'career',
    group: 'promotion',
    priority: 100,
    checkUnlock: (ctx) => ctx.promotionCount >= 10,
    unlocked: false
  },
  {
    id: 'promotion_master',
    name: '升官达人',
    description: '单次游戏内升官15次以上',
    icon: '达',
    category: 'career',
    group: 'promotion',
    priority: 150,
    checkUnlock: (ctx) => ctx.promotionCount >= 15,
    unlocked: false
  },
  {
    id: 'fallen_official',
    name: '三起三落',
    description: '贬官次数达到3次以上',
    icon: '落',
    category: 'career',
    checkUnlock: (ctx) => ctx.demotionCount >= 3,
    unlocked: false
  },
  // 属性成就
    {
    id: 'rich',
    name: '家财万贯',
    description: '财帛属性达到 95 以上',
    icon: '财',
    category: 'attribute',
    group: 'wealth',
    priority: 100,
    checkUnlock: (ctx) => ctx.attributes.财帛 >= 95,
    unlocked: false
  },
    {
    id: 'genius_writer',
    name: '才高八斗',
    description: '文韬属性达到 95 以上',
    icon: '才',
    category: 'attribute',
    group: 'intellect',
    priority: 100,
    checkUnlock: (ctx) => ctx.attributes.文韬 >= 95,
    unlocked: false
  },
    {
    id: 'master_admin',
    name: '治国奇才',
    description: '理政属性达到 95 以上',
    icon: '国',
    category: 'attribute',
    group: 'admin',
    priority: 100,
    checkUnlock: (ctx) => ctx.attributes.理政 >= 95,
    unlocked: false
  },
    {
    id: 'war_god',
    name: '战神转世',
    description: '武略属性达到 95 以上',
    icon: '战',
    category: 'attribute',
    group: 'military',
    priority: 100,
    checkUnlock: (ctx) => ctx.attributes.武略 >= 95,
    unlocked: false
  },
  {
    id: 'emperor_favor',
    name: '圣眷正隆',
    description: '圣眷值达到 80 以上',
    icon: '眷',
    category: 'attribute',
    group: 'emperor',
    priority: 80,
    checkUnlock: (ctx) => ctx.gameState.圣眷 >= 80,
    unlocked: false
  },
  {
    id: 'imperial_favorite',
    name: '帝王心腹',
    description: '圣眷值达到 95 以上',
    icon: '心',
    category: 'attribute',
    group: 'emperor',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.圣眷 >= 95,
    unlocked: false
  },
    {
    id: 'loved_by_all',
    name: '万民爱戴',
    description: '民望值达到 95 以上',
    icon: '爱',
    category: 'attribute',
    group: 'reputation',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.民望 >= 95,
    unlocked: false
  },
  {
    id: 'poor',
    name: '两袖清风',
    description: '财帛属性低于 20',
    icon: '清',
    category: 'attribute',
    group: 'wealth',
    priority: 10,
    checkUnlock: (ctx) => ctx.attributes.财帛 <= 20,
    unlocked: false
  },
  {
    id: 'weak',
    name: '体弱多病',
    description: '体质属性低于 20',
    icon: '病',
    category: 'attribute',
    group: 'body',
    priority: 10,
    checkUnlock: (ctx) => ctx.attributes.体质 <= 20,
    unlocked: false
  },
  {
    id: 'strong_body',
    name: '身强力壮',
    description: '体质属性达到 80 以上',
    icon: '壮',
    category: 'attribute',
    group: 'body',
    priority: 80,
    checkUnlock: (ctx) => ctx.attributes.体质 >= 80,
    unlocked: false
  },
  {
    id: 'iron_body',
    name: '钢筋铁骨',
    description: '体质属性达到 95 以上',
    icon: '骨',
    category: 'attribute',
    group: 'body',
    priority: 100,
    checkUnlock: (ctx) => ctx.attributes.体质 >= 95,
    unlocked: false
  },
  // 关系成就
  {
    id: 'clean_image',
    name: '清风亮节',
    description: '清议值达到 80 以上',
    icon: '风',
    category: 'relationship',
    group: 'qingyi',
    priority: 80,
    checkUnlock: (ctx) => ctx.gameState.清议 >= 80,
    unlocked: false
  },
  {
    id: 'scholar_elite',
    name: '士林领袖',
    description: '清议值达到 95 以上',
    icon: '林',
    category: 'relationship',
    group: 'qingyi',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.清议 >= 95,
    unlocked: false
  },
  {
    id: 'eunuch_alliance',
    name: '宦海同游',
    description: '宦官关系达到 80 以上',
    icon: '宦',
    category: 'relationship',
    group: 'eunuch',
    priority: 80,
    checkUnlock: (ctx) => ctx.gameState.中官 >= 80,
    unlocked: false
  },
  {
    id: 'eunuch_boss',
    name: '阉党之首',
    description: '宦官关系达到 95 以上',
    icon: '阉',
    category: 'relationship',
    group: 'eunuch',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.中官 >= 95,
    unlocked: false
  },
  {
    id: 'gentry_support',
    name: '士绅拥戴',
    description: '士绅关系达到 80 以上',
    icon: '绅',
    category: 'relationship',
    group: 'gentry',
    priority: 80,
    checkUnlock: (ctx) => ctx.gameState.士绅 >= 80,
    unlocked: false
  },
  {
    id: 'gentry_alliance',
    name: '士绅领袖',
    description: '士绅关系达到 95 以上',
    icon: '绅',
    category: 'relationship',
    group: 'gentry',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.士绅 >= 95,
    unlocked: false
  },
  // 结局成就
  {
    id: 'completed_game',
    name: '仕途圆满',
    description: '完成一局游戏（到达任意结局）',
    icon: '圆',
    category: 'endgame',
    group: 'endtype',
    priority: 5,
    checkUnlock: (ctx) => ctx.hasEnded === true,
    unlocked: false
  },
  {
    id: 'good_ending',
    name: '善始善终',
    description: '达成正面结局',
    icon: '善',
    category: 'endgame',
    group: 'endtype',
    priority: 80,
    checkUnlock: (ctx) => ctx.endingType === 'good' || ctx.endingType === 'legendary',
    unlocked: false
  },
  {
    id: 'legendary_ending',
    name: '传奇结局',
    description: '达成传奇结局',
    icon: '奇',
    category: 'endgame',
    group: 'endtype',
    priority: 100,
    checkUnlock: (ctx) => ctx.endingType === 'legendary',
    unlocked: false
  },
  {
    id: 'bad_ending',
    name: '宦海浮沉',
    description: '达成负面结局',
    icon: '浮',
    category: 'endgame',
    group: 'endtype',
    priority: 30,
    checkUnlock: (ctx) => ctx.endingType === 'bad' || ctx.endingType === 'tragic',
    unlocked: false
  },
  {
    id: 'tragic_ending',
    name: '悲剧收场',
    description: '达成悲剧结局',
    icon: '悲',
    category: 'endgame',
    group: 'endtype',
    priority: 60,
    checkUnlock: (ctx) => ctx.endingType === 'tragic',
    unlocked: false
  },
  {
    id: 'normal_ending',
    name: '平淡一生',
    description: '达成普通结局',
    icon: '淡',
    category: 'endgame',
    group: 'endtype',
    priority: 50,
    checkUnlock: (ctx) => ctx.endingType === 'normal',
    unlocked: false
  },
  // ════════════════════════════════════════════════
  // 具体结局解锁的专属成就
  // ════════════════════════════════════════════════
  {
    id: 'ending_famous_minister_done',
    name: '名臣垂范',
    description: '达成"名臣垂范"结局',
    icon: '范',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.endingType === 'legendary' && ctx.eventHistory.includes('ending_famous_minister'),
    unlocked: false
  },
  {
    id: 'ending_zhongxing_success_done',
    name: '再造乾坤',
    description: '达成"中兴成功"结局',
    icon: '乾',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_zhongxing_success'),
    unlocked: false
  },
  {
    id: 'ending_martyr_nation_done',
    name: '碧血丹心',
    description: '达成"殉国死节"结局',
    icon: '碧',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_martyr_nation'),
    unlocked: false
  },
  {
    id: 'ending_died_battlefield_done',
    name: '马革裹尸',
    description: '达成"战死沙场"结局',
    icon: '革',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_died_battlefield'),
    unlocked: false
  },
  {
    id: 'ending_city_fall_done',
    name: '城破殉城',
    description: '达成"城破殉城"结局',
    icon: '城',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_city_fall'),
    unlocked: false
  },
  {
    id: 'ending_border_general_done',
    name: '威震塞外',
    description: '达成"边关大将"结局',
    icon: '塞',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_border_general'),
    unlocked: false
  },
  {
    id: 'ending_duty_death_done',
    name: '鞠躬尽瘁',
    description: '达成"殉职任上"结局',
    icon: '瘁',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_duty_death'),
    unlocked: false
  },
  {
    id: 'ending_pure_stream_done',
    name: '铁面御史',
    description: '达成"清流骨鲠"结局',
    icon: '御',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_pure_stream'),
    unlocked: false
  },
  {
    id: 'ending_honorable_retirement_done',
    name: '急流勇退',
    description: '达成"致仕善终"结局',
    icon: '退',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_honorable_retirement'),
    unlocked: false
  },
  {
    id: 'ending_ordinary_life_done',
    name: '与世无争',
    description: '达成"平凡终老"结局',
    icon: '世',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_ordinary_life'),
    unlocked: false
  },
  {
    id: 'ending_usurper_throne_done',
    name: '黄袍加身',
    description: '达成"篡位自立"结局',
    icon: '袍',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_usurper_throne'),
    unlocked: false
  },
  {
    id: 'ending_qing_tributary_done',
    name: '忍辱负重',
    description: '达成"忍辱负重"结局',
    icon: '辱',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_qing_tributary'),
    unlocked: false
  },
  {
    id: 'ending_clan_exterminate_done',
    name: '罪有应得',
    description: '达成"抄家灭族"结局',
    icon: '罪',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_clan_exterminate'),
    unlocked: false
  },
  {
    id: 'ending_pirate_king_done',
    name: '纵横四海',
    description: '达成"纵横四海"结局',
    icon: '海',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_pirate_king'),
    unlocked: false
  },
  {
    id: 'ending_bandit_king_done',
    name: '流寇之雄',
    description: '达成"落草为寇"结局',
    icon: '寇',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_bandit_king'),
    unlocked: false
  },
  {
    id: 'ending_debauch_fall_done',
    name: '纵欲而亡',
    description: '达成"纵欲而亡"结局',
    icon: '欲',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_debauch_fall'),
    unlocked: false
  },
  {
    id: 'ending_pimp_lord_done',
    name: '烟花之主',
    description: '达成"烟花之主"结局',
    icon: '花',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_pimp_lord'),
    unlocked: false
  },
  {
    id: 'ending_traitor_done',
    name: '卖国求荣',
    description: '达成"卖国求荣"结局',
    icon: '卖',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_traitor'),
    unlocked: false
  },
  {
    id: 'ending_hermit_taoist_done',
    name: '悠然南山',
    description: '达成"悠然南山"结局',
    icon: '山',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_hermit_taoist'),
    unlocked: false
  },
  {
    id: 'ending_monk_nirvana_done',
    name: '明镜台',
    description: '达成"明镜台"结局',
    icon: '镜',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_monk_nirvana'),
    unlocked: false
  },
  {
    id: 'ending_recluse_scholar_done',
    name: '万世师表',
    description: '达成"万世师表"结局',
    icon: '师',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_recluse_scholar'),
    unlocked: false
  },
  {
    id: 'ending_wealthy_retiree_done',
    name: '金山银山',
    description: '达成"金山银山"结局',
    icon: '金',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_wealthy_retiree'),
    unlocked: false
  },
  {
    id: 'ending_exile_overseas_done',
    name: '天涯海角',
    description: '达成"天涯海角"结局',
    icon: '涯',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_exile_overseas'),
    unlocked: false
  },
  {
    id: 'ending_family_man_done',
    name: '枝繁叶茂',
    description: '达成"枝繁叶茂"结局',
    icon: '枝',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_family_man'),
    unlocked: false
  },
  {
    id: 'ending_medical_saint_done',
    name: '杏林春暖',
    description: '达成"杏林春暖"结局',
    icon: '杏',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_medical_saint'),
    unlocked: false
  },
  {
    id: 'ending_unknown_fate_done',
    name: '不知所踪',
    description: '达成"不知所踪"结局',
    icon: '踪',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_unknown_fate'),
    unlocked: false
  },
  {
    id: 'ending_zhaoyu_prison_done',
    name: '六月飞雪',
    description: '达成"诏狱冤死"结局',
    icon: '雪',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_zhaoyu_prison'),
    unlocked: false
  },
  {
    id: 'ending_southern_ming_done',
    name: '南渡孤臣',
    description: '达成"南渡续祚"结局',
    icon: '渡',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_southern_ming'),
    unlocked: false
  },
  {
    id: 'ending_jiashen_nationfall_done',
    name: '天崩地坼',
    description: '达成"天崩地坼"结局',
    icon: '崩',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_jiashen_nationfall'),
    unlocked: false
  },
  // ── 补齐此前缺失的 5 个结局成就 ──────────────────────────────────────
  // 发现过程：把 src/data 与引擎里**所有** ending_* 事件 id 拉出来与成就对照，
  // 发现有 5 个结局没有对应的 `_done` 成就。后果有两个：
  //   1. 这 5 个结局永远无法写进结局图鉴（EndingCodex 的进度也就永远到不了 100%）；
  //   2. 「结局收藏」最高档要求 30 个，而可收集的只有 29 个 —— 数学上不可达。
  // 补上之后共 34 个可收集结局，30 个的门槛才成立。
  {
    id: 'ending_debauchery_001_done',
    name: '精尽人亡',
    description: '达成"精尽人亡"结局',
    icon: '亡',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_debauchery_001'),
    unlocked: false
  },
  {
    id: 'ending_scholar_martyr_done',
    name: '清流殉道',
    description: '达成"清流殉道"结局',
    icon: '殉',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_scholar_martyr'),
    unlocked: false
  },
  {
    id: 'ending_fugitive_done',
    name: '亡命江湖',
    description: '达成"亡命江湖"结局',
    icon: '逃',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_fugitive'),
    unlocked: false
  },
  {
    id: 'ending_bankrupt_done',
    name: '倾家荡产',
    description: '达成"倾家荡产"结局',
    icon: '荡',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_bankrupt'),
    unlocked: false
  },
  {
    id: 'ending_demotion_done',
    name: '罢黜归田',
    description: '达成"革职为民"结局',
    icon: '黜',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_demotion'),
    unlocked: false
  },
  {
    // 第五十二轮从 罢黜归田 里拆出来的另一支：押解宁古塔。
    // 拆之前两条归宿共用一个 id，图鉴那个勾分不清"革职"与"流放"。
    id: 'ending_exile_done',
    name: '万里投荒',
    description: '达成"流放边疆"结局',
    icon: '荒',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('ending_exile'),
    unlocked: false
  },
  // ── 补齐 10 条边界/阈值结局成就（第五十二轮）──────────────────────────
  // 这十格注册在 `src/data/boundaryEvents.ts` 里，事件 id 就是 `triggerable_*`。
  // 第十三轮只做对账、没有给它们建成就，理由是"Steam 单 App 上限 100 已用满"，
  // 让玩家靠 `reachedEndings` 达成记录点亮图鉴。后果是成就面板少十格、
  // 「结局收藏」的可收集数被压在 34，而且**成就与图鉴两套口径**长期并存。
  // 本作不上 Steam（2026-10-23 决定），名额不再是约束，于是补齐。
  //
  // 两条必须同时成立的写法（由 scripts/audit-ending-codex.ts 逐条对账）：
  //   · `id` 用成就层的命名 `ending_<事名>_done` —— 图鉴与「结局收藏」都按这个前缀认结局成就；
  //   · `checkUnlock` 里写**事件真名** `triggerable_*`，因为 eventHistory 记的就是它。
  // 两个名字之间的换算只登记在一处：`src/data/endingRegistry.ts` 的 ENDING_ID_ALIASES。
  {
    id: 'ending_death_illness_done',
    name: '病逝任上',
    description: '达成"病逝任上"结局',
    icon: '疾',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_death_illness'),
    unlocked: false
  },
  {
    id: 'ending_emperor_hate_done',
    name: '龙颜震怒',
    description: '达成"龙颜震怒"结局',
    icon: '怒',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_emperor_hate'),
    unlocked: false
  },
  {
    id: 'ending_eunuch_frame_done',
    name: '宦官构陷',
    description: '达成"宦官构陷"结局',
    icon: '谗',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_eunuch'),
    unlocked: false
  },
  {
    id: 'ending_scholar_ostracism_done',
    name: '士林唾弃',
    description: '达成"士林唾弃"结局',
    icon: '唾',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_scholar_ostracism'),
    unlocked: false
  },
  {
    id: 'ending_gentry_rebellion_done',
    name: '乡绅反目',
    description: '达成"乡绅反目"结局',
    icon: '怨',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_gentry_rebellion'),
    unlocked: false
  },
  {
    id: 'ending_popular_uproar_done',
    name: '民怨沸腾',
    description: '达成"民怨沸腾"结局',
    icon: '沸',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_popular_uproar'),
    unlocked: false
  },
  {
    id: 'ending_moral_isolation_done',
    name: '众叛亲离',
    description: '达成"众叛亲离"结局',
    icon: '离',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_moral_degeneracy'),
    unlocked: false
  },
  {
    id: 'ending_faction_martyr_done',
    name: '东林烈士',
    description: '达成"东林烈士"结局',
    icon: '烈',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_faction_martyr'),
    unlocked: false
  },
  {
    id: 'ending_tyrant_fall_done',
    name: '权奸末路',
    description: '达成"权奸末路"结局',
    icon: '僭',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_faction_tyrant_fall'),
    unlocked: false
  },
  {
    id: 'ending_faction_sacrifice_done',
    name: '党争牺牲品',
    description: '达成"党争牺牲品"结局',
    icon: '牺',
    category: 'endgame',
    checkUnlock: (ctx) => ctx.eventHistory.includes('triggerable_faction_sacrifice'),
    unlocked: false
  },
  // 「结局收藏」三档：数据源改为跨局的已解锁成就列表（见 countUnlockedEndings），
  // 因此不再需要 deadByDesign —— 它们现在是真正可达的。
  {
    id: 'ending_collection_5',
    name: '结局收藏家',
    description: '解锁 5 种不同的结局',
    icon: '藏',
    category: 'endgame',
    group: 'collection',
    priority: 5,
    checkUnlock: (ctx) => countUnlockedEndings(ctx) >= 5,
    unlocked: false
  },
  {
    // 原 collection 组是 5 / 15 / 30 三档，删掉了中间 15 档。
    // 同 collector 组的理由：getUnlockedAchievements() 按 group 只展示最高档，
    // 15 档对玩家不可见；而 Steam 单 app 成就上限 100，这里正好腾出一个名额。
    id: 'ending_collection_30',
    name: '百味人生',
    description: '解锁 30 种不同的结局',
    icon: '味',
    category: 'endgame',
    group: 'collection',
    priority: 30,
    checkUnlock: (ctx) => countUnlockedEndings(ctx) >= 30,
    unlocked: false
  },
  // 特殊成就
  {
    id: 'persistent',
    name: '持之以恒',
    description: '游玩超过 50 个回合',
    icon: '恒',
    category: 'special',
    group: 'longevity',
    priority: 50,
    checkUnlock: (ctx) => ctx.gameState.turn >= 50,
    unlocked: false
  },
  {
    id: 'long_live',
    name: '为官一甲子',
    description: '游玩超过 100 个回合',
    icon: '甲',
    category: 'special',
    group: 'longevity',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.turn >= 100,
    unlocked: false
  },
  {
    id: 'survivor',
    name: '乱世生存',
    description: '撑到崇祯 17 年',
    icon: '生',
    category: 'special',
    checkUnlock: (ctx) => ctx.gameState.currentYear >= 1644,
    unlocked: false
  },
  {
    id: 'pre_1644',
    name: '明亡之前',
    description: '在崇祯 17 年前结束游戏',
    icon: '明',
    category: 'special',
    group: 'endyear',
    priority: 50,
    checkUnlock: (ctx) => ctx.hasEnded === true && ctx.gameState.currentYear < 1644,
    unlocked: false
  },
  {
    id: 'year_1644',
    name: '王朝末日',
    description: '在崇祯 17 年结束游戏',
    icon: '末',
    category: 'special',
    group: 'endyear',
    priority: 75,
    checkUnlock: (ctx) => ctx.hasEnded === true && ctx.gameState.currentYear === 1644,
    unlocked: false
  },
  {
    id: 'year_1645',
    name: '见证沦陷',
    description: '在崇祯 17 年之后继续游戏',
    icon: '陷',
    category: 'special',
    group: 'endyear',
    priority: 100,
    checkUnlock: (ctx) => ctx.gameState.currentYear > 1644,
    unlocked: false
  },
  {
    id: 'decade_official',
    name: '十年为官',
    description: '担任官职超过10年',
    icon: '十',
    category: 'special',
    checkUnlock: (ctx) => ctx.gameState.currentYear - 1628 >= 10,
    unlocked: false
  },
  {
    id: 'half_decade',
    name: '半载仕途',
    description: '担任官职不超过5年',
    icon: '半',
    category: 'special',
    checkUnlock: (ctx) => ctx.hasEnded === true && ctx.gameState.currentYear - 1628 <= 5,
    unlocked: false
  },
  {
    // 注：原 collector 组有 4 档（30/60/80/全部）。这里删掉了中间两档
    // （master_collector 60、ultimate_master 80），只留 collector(30) 与 legendary_master(全部)。
    //
    // 删的理由不是"凑数"，而是它们本来就对玩家不可见：
    // getUnlockedAchievements() 按 group 分桶，每桶只展示 priority 最高的那个已解锁成就。
    // 所以解锁 60 档之后，玩家在成就面板里看到的仍然是 60 档而不是 30 档 ——
    // 中间档位只贡献了一个"多一个勾"的观感，不贡献任何信息。
    //
    // 更关键的是 Steam 对单个 app 的成就数有上限（100），而原来定义了 105 个，
    // 上线时 105 个无法全部注册（Steamworks 后台的 API Name 一经创建不可改，只能删重建）。
    // 少两个不可见的中间档，正好把这个硬约束解决掉。
    id: 'collector',
    name: '成就收藏家',
    description: '解锁 30 个以上成就',
    icon: '藏',
    category: 'special',
    group: 'collector',
    priority: 30,
    checkUnlock: () => false, // 这个需要特殊处理
    unlocked: false
  },
  {
    id: 'legendary_master',
    name: '传奇大师',
    description: '解锁全部成就',
    icon: '传',
    category: 'special',
    group: 'collector',
    priority: 100,
    checkUnlock: () => false, // 这个需要特殊处理
    unlocked: false
  },
  {
    id: 'balanced',
    name: '全面发展',
    description: '所有属性均达到 60 以上',
    icon: '全',
    category: 'special',
    group: 'balance',
    priority: 50,
    checkUnlock: (ctx) => ctx.attributes.财帛 >= 60 && ctx.attributes.文韬 >= 60 && ctx.attributes.理政 >= 60 && ctx.attributes.武略 >= 60 && ctx.attributes.体质 >= 60,
    unlocked: false
  },
  {
    id: 'perfect_balance',
    name: '全能之才',
    description: '所有属性均达到 80 以上',
    icon: '才',
    category: 'special',
    group: 'balance',
    priority: 100,
    checkUnlock: (ctx) => ctx.attributes.财帛 >= 80 && ctx.attributes.文韬 >= 80 && ctx.attributes.理政 >= 80 && ctx.attributes.武略 >= 80 && ctx.attributes.体质 >= 80,
    unlocked: false
  },
  {
    id: 'noble_climb',
    name: '世家崛起',
    description: '以缙绅或诗文清望出身达到太师',
    icon: '崛',
    category: 'special',
    checkUnlock: (ctx) => 
      (ctx.origin === '缙绅' || ctx.origin === '诗文清望') && 
      (ctx.characterRank?.includes('太师') === true || ctx.characterRank?.includes('正一品') === true),
    unlocked: false
  },
  // ============ 组合成就 ============
  {
    id: 'rich_popular',
    name: '富而有德',
    description: '财帛和民望均达到 80 以上',
    icon: '德',
    category: 'special',
    checkUnlock: (ctx) => ctx.attributes.财帛 >= 80 && ctx.gameState.民望 >= 80,
    unlocked: false
  },
  {
    id: 'scholar_official',
    name: '文武双全',
    description: '文韬和武略均达到 80 以上',
    icon: '双',
    category: 'special',
    checkUnlock: (ctx) => ctx.attributes.文韬 >= 80 && ctx.attributes.武略 >= 80,
    unlocked: false
  },
  {
    id: 'emperor_people',
    name: '君民兼得',
    description: '圣眷和民望均达到 80 以上',
    icon: '兼',
    category: 'special',
    checkUnlock: (ctx) => ctx.gameState.圣眷 >= 80 && ctx.gameState.民望 >= 80,
    unlocked: false
  },
  {
    id: 'three_high',
    name: '三高官员',
    description: '圣眷、清议、民望均达到 70 以上',
    icon: '高',
    category: 'special',
    checkUnlock: (ctx) => 
      ctx.gameState.圣眷 >= 70 && 
      ctx.gameState.清议 >= 70 && 
      ctx.gameState.民望 >= 70,
    unlocked: false
  },
  {
    id: 'corrupt_official',
    name: '贪官污吏',
    description: '财帛达到 90 且清议低于 30',
    icon: '贪',
    category: 'special',
    checkUnlock: (ctx) => ctx.attributes.财帛 >= 90 && ctx.gameState.清议 < 30,
    unlocked: false
  },
  {
    id: 'loyal_minister',
    name: '忠臣良将',
    description: '圣眷达到 80 且清议达到 80',
    icon: '忠',
    category: 'special',
    checkUnlock: (ctx) => ctx.gameState.圣眷 >= 80 && ctx.gameState.清议 >= 80,
    unlocked: false
  },
  {
    id: 'neutral_official',
    name: '中立之道',
    description: '清议和中官均在 40-60 之间',
    icon: '中',
    category: 'special',
    checkUnlock: (ctx) => 
      ctx.gameState.清议 >= 40 && ctx.gameState.清议 <= 60 &&
      ctx.gameState.中官 >= 40 && ctx.gameState.中官 <= 60,
    unlocked: false
  },
  // ============ 趣味成就 ============
  {
    id: 'lucky',
    name: '时来运转',
    description: '连续 10 回合未触发负面事件',
    icon: '运',
    category: 'special',
    checkUnlock: (ctx) => ctx.luckyStreak >= 10,
    unlocked: false
  },
  {
    id: 'unlucky',
    name: '屋漏偏逢雨',
    description: '连续 5 回合遭遇负面事件',
    icon: '漏',
    category: 'special',
    checkUnlock: (ctx) => ctx.unluckyStreak >= 5,
    unlocked: false
  },
  {
    // 已删除 first_choice（"100 个事件都选第一个选项"）。
    // 它衡量的是玩家的点击习惯而不是游戏体验，属于典型的"刷指标"型成就 ——
    // 认真玩的人反而拿不到。腾出的名额给了真正有意义的成就。
    id: 'random_player',
    name: '随心所欲',
    description: '随机选择选项 50 次以上',
    icon: '随',
    category: 'special',
    // 达成入口：事件选项列表下方的「听 天 由 命」按钮
    // （EventDisplay.handleRandomChoice → handleChoice(choice, { random: true })）。
    // 该路径是 AchievementContext.randomChoiceCount 的唯一自增点。
    checkUnlock: (ctx) => ctx.randomChoiceCount >= 50,
    unlocked: false
  },
  {
    id: 'careful_player',
    name: '谨慎行事',
    description: '使用回退功能 10 次以上',
    icon: '慎',
    category: 'special',
    checkUnlock: (ctx) => ctx.undoCount >= 10,
    unlocked: false
  }
  // 注：此处原有 saver（"存档次数达到 30 次以上"），已删除。
  // 理由同已删除的 first_choice：统计操作频次而非游戏体验的"刷指标"型成就，
  // 认真玩的人拿不到，删掉腾出的名额给了更有意义的成就。
]

// 成就数据（每个存档独立一份，不再用 localStorage 共享）
//
// 用 module-level 变量保存：玩家读档时由 App 读 SaveData 恢复，新开局时清空。
// 这仍是一处共享可变状态（见 docs/KNOWN_ISSUES.md 的 K-6），但读写都在这里收口，
// 并在边界上做**防御性拷贝** —— 否则调用方拿到的就是内部对象本身，
// 任何一次无意的就地修改都会污染全局成就状态，而且极难排查。
let currentAchievementData: AchievementData = { unlocked: [], unlockTimes: {} }

/** 拷贝一份成就数据，切断与内部状态的引用共享 */
/**
 * 拷贝成就数据，并在拷贝时剔除已删除的成就 id。
 *
 * 为什么必须剔除：老存档里可能还留着 master_collector / ultimate_master /
 * ending_collection_15 / saver / first_choice。它们已不在 ALL_ACHIEVEMENTS 里，
 * 但如果不清掉：
 *   1. "已解锁 N 个"的计数会虚高 —— collector(30) 与 legendary_master 的判据都依赖
 *      data.unlocked.length / 包含关系，计数偏大会让它们提前达成；
 *   2. 成就面板会渲染出玩家从未见过的幽灵条目。
 *
 * 放在这里而不是各个入口，是因为本函数是 loadAchievements / setAchievementData /
 * saveAchievements / getCurrentAchievementData 共同的唯一入口 ——
 * 等于给所有边界上了同一道防线（与此前修过的"引用别名"是同一处）。
 */
function cloneAchievementData(data: AchievementData): AchievementData {
  const unlocked: string[] = []
  const unlockTimes: Record<string, string> = {}
  const retired = RETIRED_ACHIEVEMENT_IDS as readonly string[]

  for (const id of data.unlocked ?? []) {
    if (retired.includes(id)) continue
    unlocked.push(id)
  }
  for (const [id, at] of Object.entries(data.unlockTimes ?? {})) {
    if (retired.includes(id)) continue
    unlockTimes[id] = at
  }

  // reachedEndings 不过 retired 过滤：它存的不是成就 id，而是图鉴格子 id
  const reachedEndings = cloneReachedEndings(data.reachedEndings)

  return { unlocked, unlockTimes, ...(reachedEndings ? { reachedEndings } : {}) }
}

/** 独立一份达成记录；空/缺失时返回 undefined，让老存档的字段形状保持不变 */
function cloneReachedEndings(src?: Record<string, string>): Record<string, string> | undefined {
  if (!src) return undefined
  const out: Record<string, string> = {}
  for (const [id, at] of Object.entries(src)) {
    if (typeof id === 'string' && typeof at === 'string') out[id] = at
  }
  return out
}

/** 获取当前内存中的成就数据（返回副本，改它不会影响内部状态） */
export function getCurrentAchievementData(): AchievementData {
  return cloneAchievementData(currentAchievementData)
}

/** 设置当前内存中的成就数据（读档/新游戏时调用；会存副本） */
export function setAchievementData(data: AchievementData): void {
  currentAchievementData = cloneAchievementData(data)
}

/** 读取成就数据（从内存；返回副本） */
export function loadAchievements(): AchievementData {
  return cloneAchievementData(currentAchievementData)
}

/** 写入成就数据（写到内存，不写 localStorage；会存副本） */
export function saveAchievements(data: AchievementData): void {
  currentAchievementData = cloneAchievementData(data)
}

// ============================================================
// 收集链（特殊判定，不走 checkUnlock）
// ============================================================

/**
 * 收集链成就 id。
 * collector / master_collector / ultimate_master 按「已解锁总数」逐档判定；
 * legendary_master 见 unlockAchievement 中修复过的判据。
 * 这四个 id 同时是 legendary_master 判定的排除项（自己不能要求自己已解锁）。
 */
export const COLLECTOR_CHAIN_ACHIEVEMENT_IDS = [
  'collector',
  'legendary_master'
] as const

/** 收集链各档阈值（只保留 30 档；60/80 两档已删除，理由见上方 collector 定义处的注释） */
const COLLECTOR_CHAIN_THRESHOLDS: ReadonlyArray<{ id: string; threshold: number }> = [
  { id: 'collector', threshold: 30 }
]

/**
 * 已被删除的成就 id —— 用于存档迁移。
 *
 * 两类：
 *  1. 收集链 / 结局收藏的中间档（master_collector、ultimate_master、ending_collection_15）
 *  2. 属性阈值 80 档（wealthy、scholar、administrator、military_genius、popular）——
 *     与各自的 95 档同属一个 group，而 getUnlockedAchievements() 每组只展示
 *     priority 最高的那一个，所以低档对玩家不可见。
 *
 * 加上 first_choice / saver 两个纯"操作频次"统计成就，合计正好腾出 10 个名额，
 * 让 110 条降到 100 条 —— 卡进 Steam 单 App 成就上限。
 *
 * 旧存档里可能还留着这些 id（玩家在删除之前解锁过）。
 * 它们对当前版本已无意义，且会让"已解锁 N 个"的计数虚高，
 * 进而让 collector / legendary_master 的判据算错，所以读写时一律清掉。
 */
export const RETIRED_ACHIEVEMENT_IDS = [
  'master_collector',
  'ultimate_master',
  'ending_collection_15',
  'saver',
  'first_choice',
  'wealthy',
  'scholar',
  'administrator',
  'military_genius',
  'popular'
] as const

/** 直接写入一条已解锁成就（内部使用） */
function grantAchievement(id: string, data: AchievementData): void {
  if (data.unlocked.includes(id)) return
  if (!ALL_ACHIEVEMENTS.some(a => a.id === id)) return
  data.unlocked.push(id)
  data.unlockTimes[id] = new Date().toISOString()
  saveAchievements(data)
}

// 获取解锁的成就列表（包含完整信息）
// 同时按 group 合并：同组内只保留 priority 最高的成就
export function getUnlockedAchievements(): Achievement[] {
  const data = loadAchievements()
  const all: Achievement[] = ALL_ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: data.unlocked.includes(a.id),
    unlockTime: data.unlockTimes[a.id]
  }))

  const unlocked = all.filter(a => a.unlocked)

  // 按 group 分桶：每桶只保留 priority 最高的
  const groupMap = new Map<string, Achievement>()
  const standalone: Achievement[] = []

  for (const a of unlocked) {
    if (a.group) {
      const cur = groupMap.get(a.group)
      if (!cur || (a.priority ?? 0) > (cur.priority ?? 0)) {
        groupMap.set(a.group, a)
      }
    } else {
      standalone.push(a)
    }
  }

  // 合并 + 按 priority 降序、名称稳定排序
  return [...groupMap.values(), ...standalone].sort((a, b) => {
    const pa = a.priority ?? 0
    const pb = b.priority ?? 0
    if (pb !== pa) return pb - pa
    return a.name.localeCompare(b.name)
  })
}

// 获取所有成就状态
export function getAllAchievements(): Achievement[] {
  const data = loadAchievements()
  return ALL_ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: data.unlocked.includes(a.id),
    unlockTime: data.unlockTimes[a.id]
  }))
}

/**
 * 记下"这个存档达成过某个结局"。参数必须是**图鉴格子 id**
 * —— 调用方（endingSystem.triggerEndingAchievements）负责用
 * data/endingRegistry.ts 的 resolveEndingTileId 把事件 id 换算过来。
 * 这里不 import 那张表，是为了让 types/achievement 不依赖 data 层。
 *
 * 只记首次：重复达成不覆盖时间戳。
 */
export function recordEndingReached(tileId: string): void {
  if (!tileId) return
  const data = loadAchievements()
  const reached = data.reachedEndings ?? {}
  if (reached[tileId]) return
  reached[tileId] = new Date().toISOString()
  saveAchievements({ ...data, reachedEndings: reached })
}

/** 本存档达成过的结局格子 id → 时间戳（老存档没有该字段时为空对象） */
export function getReachedEndings(): Record<string, string> {
  return loadAchievements().reachedEndings ?? {}
}

// 解锁成就
export function unlockAchievement(id: string): Achievement | null {
  const achievement = ALL_ACHIEVEMENTS.find(a => a.id === id)
  if (!achievement) return null

  const data = loadAchievements()
  if (data.unlocked.includes(id)) return null

  data.unlocked.push(id)
  data.unlockTimes[id] = new Date().toISOString()
  saveAchievements(data)

  // 收集链前 3 档：按「已解锁总数」逐档判定（阈值保持原有数值 30/60/80 不变）
  for (const step of COLLECTOR_CHAIN_THRESHOLDS) {
    if (data.unlocked.length >= step.threshold) {
      grantAchievement(step.id, data)
    }
  }

  // 检查"传奇大师"
  //
  // 【修复 off-by-one 死锁】原判据为：
  //   data.unlocked.length >= ALL_ACHIEVEMENTS.length && !data.unlocked.includes('legendary_master')
  // legendary_master 自己也是 ALL_ACHIEVEMENTS 的成员（共 105 个），而它只能在判据成立
  // 之后才被 push 进 unlocked —— 也就是要求「已解锁 105 个」才能解锁第 105 个，永远差一个，
  // 数学上不可达。
  // 现改为：除收集链 4 个成就自身、以及 deadByDesign（当前版本无达成入口）的成就之外，
  // 其余成就全部解锁即可 —— 该条件可以被真正达成。
  const legendaryRequiredIds = ALL_ACHIEVEMENTS
    .filter(a => !(COLLECTOR_CHAIN_ACHIEVEMENT_IDS as readonly string[]).includes(a.id) && !a.deadByDesign)
    .map(a => a.id)
  const legendaryReady = legendaryRequiredIds.every(requiredId => data.unlocked.includes(requiredId))
  if (legendaryReady) {
    grantAchievement('legendary_master', data)
  }

  return { ...achievement, unlocked: true, unlockTime: data.unlockTimes[id] }
}

// 检查并解锁应该解锁的成就
export function checkAndUnlockAchievements(ctx: AchievementContext): Achievement[] {
  const data = loadAchievements()
  const achievements = getAllAchievements()
  const newlyUnlocked: Achievement[] = []

  for (const achievement of achievements) {
    if (!data.unlocked.includes(achievement.id) && achievement.checkUnlock(ctx)) {
      const unlocked = unlockAchievement(achievement.id)
      if (unlocked) {
        newlyUnlocked.push(unlocked)
      }
    }
  }

  return newlyUnlocked
}
