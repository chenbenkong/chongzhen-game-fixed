// 结局处理工具：人物志生成、成就联动、反事实预览

import { Character, GameStateValues, LifeRecord, OriginType } from '../types/game'
import { GameEvent } from '../types/event'
import { unlockAchievement, recordEndingReached } from '../types/achievement'
import { endingAchievementIdOf, resolveEndingTileId } from '../data/endingRegistry'

/**
 * 关键生平事件的统一筛选口径。
 *
 * 为什么需要抽成共用函数：游戏里有**两处**都要挑"值得写进结局的关键事件"——
 * 人物志（`generateBiography`）与生平总结（`generateLifeSummary`）。
 * 它们此前各写一套，结果口径全都不一致：
 *   - 类型过滤不同：一边算上 `marriage`，另一边算上"带 impact 的 event"
 *   - 取样方向相反：人物志取 `slice(0, 8)`（**最早** 8 条），总结取 `slice(-10)`（最近 10 条）
 * 于是同一局游戏，人物志会只写早年的事、把后半生整段丢掉 —— 一局 17 年的仕途，
 * 传记里却看不到结局前发生了什么。现在两处都走这里，取最近的关键事件。
 */
export function pickKeyLifeRecords(lifeRecords: LifeRecord[], limit: number): LifeRecord[] {
  return lifeRecords
    .filter(
      r =>
        r.type === 'promotion' ||
        r.type === 'demotion' ||
        r.type === 'death' ||
        r.type === 'marriage' ||
        (r.type === 'event' && Boolean(r.impact))
    )
    .slice(-limit)
}

/**
 * 结局卷首（《明史·列传》体裁）。
 * 8 大卷覆盖所有 endingConfig.category 取值。
 * - official 仕林：科举正途，文臣良吏
 * - martyr 忠烈：临难不苟，为国捐躯
 * - hermit 隐逸：退处山林，遁世独立
 * - villain 贰臣：失节之行，投敌作乱
 * - gray 浮沉：名实相副，灰度抉择
 * - ming_fate 朝局：王朝兴亡，明祚归属
 * - personal_fate 个志：私我归宿，个人命运
 * - special 异闻：史外传奇，神秘异数
 */
export interface EndingArchetype {
  key: string
  name: string          // 卷首名（4 字）
  intro: string         // 一句话简介
  iconName: 'scroll' | 'sword' | 'coffin' | 'star' | 'sparkle' | 'document' | 'pin' | 'flower'  // 对应 Icon.tsx 的 IconName
  /** 主色（金/红/灰） */
  tone: 'gold' | 'red' | 'gray'
}

export const ENDING_ARCHETYPES: Record<string, EndingArchetype> = {
  official: { key: 'official', name: '仕林卷', intro: '科举入仕，文臣正途；鞠躬尽瘁，遗爱在民。', iconName: 'document', tone: 'gold' },
  martyr: { key: 'martyr', name: '忠烈卷', intro: '临难不苟，死节殉国；碧血丹心，光照汗青。', iconName: 'sword', tone: 'red' },
  hermit: { key: 'hermit', name: '隐逸卷', intro: '退处山林，遁世独立；清风明月，完养天真。', iconName: 'flower', tone: 'gray' },
  villain: { key: 'villain', name: '贰臣卷', intro: '失节之行，投敌作乱；遗臭万年，千夫所指。', iconName: 'coffin', tone: 'red' },
  gray: { key: 'gray', name: '浮沉卷', intro: '名实相副，毁誉参半；功过交织，难定一字。', iconName: 'pin', tone: 'gray' },
  ming_fate: { key: 'ming_fate', name: '朝局卷', intro: '王朝兴亡，明祚归属；系于一念，苍生随之。', iconName: 'star', tone: 'gold' },
  personal_fate: { key: 'personal_fate', name: '个志卷', intro: '私我归宿，个人命运；俯仰无愧，心安便是。', iconName: 'sparkle', tone: 'gold' },
  special: { key: 'special', name: '异闻卷', intro: '史外传奇，神秘异数；不知所终，存乎其人。', iconName: 'scroll', tone: 'gray' }
}

/** 根据 endingConfig.category 获取卷首；找不到时回落个志卷 */
export function getArchetype(category?: string): EndingArchetype {
  if (category && ENDING_ARCHETYPES[category]) return ENDING_ARCHETYPES[category]
  return ENDING_ARCHETYPES.personal_fate
}

/** 阿拉伯数字 → 汉字数字（用于年龄/序号等小整数） */
export function toChineseNum(n: number): string {
  if (n === 0) return '〇'
  if (n < 0) return '负' + toChineseNum(-n)
  const d = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n < 10) return d[n]
  if (n < 20) return n === 10 ? '十' : '十' + d[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10
    return d[t] + '十' + (o ? d[o] : '')
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100
    return d[h] + '百' + (r ? toChineseNum(r) : '')
  }
  return String(n)
}

/** 西历年 → 明代年号纪年。元年用"元"不用"一" */
export function toMingEraYear(year: number): string {
  if (year >= 1628) return '崇祯' + (year === 1628 ? '元' : toChineseNum(year - 1627)) + '年'
  if (year >= 1621) return '天启' + (year === 1621 ? '元' : toChineseNum(year - 1620)) + '年'
  if (year === 1620) return '泰昌元年'
  if (year >= 1573) return '万历' + (year === 1573 ? '元' : toChineseNum(year - 1572)) + '年'
  return toChineseNum(year) + '年'
}

/** 结局类型归类：决定 endingType 给成就系统 */
export function classifyEnding(event: GameEvent): 'legendary' | 'good' | 'bad' | 'tragic' | 'normal' | 'special' {
  const id = event.id
  if (id.includes('martyr') || id.includes('city_fall') || id.includes('died_battlefield') || id.includes('southern_ming') || id.includes('jiashen')) {
    return 'tragic'
  }
  if (id.includes('debauch') || id.includes('pimp') || id.includes('bandit') || id.includes('traitor') || id.includes('clan_exterminate') || id.includes('zhaoyu') || id.includes('usurper')) {
    return 'bad'
  }
  if (id.includes('zhongxing') || id.includes('famous_minister') || id.includes('border_general') || id.includes('pure_stream') || id.includes('duty_death')) {
    return 'legendary'
  }
  if (id.includes('honorable_retirement') || id.includes('family_man') || id.includes('medical_saint') || id.includes('recluse_scholar') || id.includes('hermit')) {
    return 'good'
  }
  return 'normal'
}

/** 明史列传风格人物志生成 */
export function generateBiography(
  character: Character,
  gameState: GameStateValues,
  endingEvent: GameEvent,
  lifeRecords: LifeRecord[]
): string {
  const age = Math.floor(character.age)
  const startYear = 1628
  const endYear = gameState.currentYear

  // 提取关键人生事件（升迁、贬官、死亡、婚配及有重大影响的事件）。
  // 口径与生平总结共用 pickKeyLifeRecords —— 此前这里取的是**最早** 8 条，
  // 导致人物志只写早年、把后半生丢掉。
  const keyRecords = pickKeyLifeRecords(lifeRecords, 8)

  const emperorsFavor = gameState.圣眷 ?? 50
  // 评价关键词
  const moral = character.hidden?.道德值 ?? 50
  const ambi = character.hidden?.野心值 ?? 30
  // 清议 + 民望 综合评价
  const reputation = gameState.清议 ?? 50
  const popularity = gameState.民望 ?? 50
  const combinedReputation = Math.max(reputation, popularity)  // 取两者较高值

  // 评价语
  let evaluation = ''
  if (moral >= 80) evaluation = '清慎忠直，朝野称贤'
  else if (moral >= 60) evaluation = '操守可称，无忝所生'
  else if (moral >= 40) evaluation = '中人之资，毁誉参半'
  else if (moral >= 20) evaluation = '声名狼藉，颇受物议'
  else evaluation = '卑污苟贱，千夫所指'

  // 官职评价
  let rankComment = ''
  if (emperorsFavor >= 80) rankComment = '宠遇优渥，屡承天语'
  else if (emperorsFavor >= 60) rankComment = '简在帝心，累迁不次'
  else if (emperorsFavor >= 40) rankComment = '循分供职，未有大过'
  else if (emperorsFavor >= 20) rankComment = '失宠于朝，动辄得咎'
  else rankComment = '帝心厌弃，危若朝露'

  // 志向
  let ambitionComment = ''
  if (ambi >= 80) ambitionComment = '雄心勃勃，常怀异志'
  else if (ambi >= 60) ambitionComment = '志存高远，锐意进取'
  else if (ambi >= 40) ambitionComment = '安于本职，无意攀援'
  else ambitionComment = '恬淡自守，与世无争'

  // 清议
  let reputationComment = ''
  if (combinedReputation >= 80) reputationComment = '清流推重，士林仰慕'
  else if (combinedReputation >= 60) reputationComment = '有清望，为人称道'
  else if (combinedReputation >= 40) reputationComment = '名望平平，鲜有褒贬'
  else if (combinedReputation >= 20) reputationComment = '物议沸腾，多见指斥'
  else reputationComment = '清议不齿，士林侧目'

  // 取显示名：玩家有真名则用真名，无名 / 仍是默认"我"则用"某"
  const displayName = (character.name && character.name !== '我' && character.name.trim())
    ? character.name.trim()
    : '某'

  // 拼装人物志（仿《明史》列传体）
  // 死亡结局判定：ID 含以下关键字的视为人物已死；其余是罢官/归隐/流亡/篡位等活人结局
  const isDeathEnding = /martyr|zhaoyu|died_battlefield|southern_ming|jiashen|duty_death|city_fall|clan_exterminate|death_illness|bankrupt|emperor_hate|eunuch|scholar_ostracism|gentry_rebellion|popular_uproar|moral_degeneracy|debauchery|burning_death|died_fighting|whole_family|traitor|massacre|frame_loyal/.test(endingEvent.id)
  // 键类型写成 OriginType 而不是 string：漏一个出身在运行时只会静默显示「出身未详」，
  // 类型把它变成编译错误（第六十五轮新增胥吏/海商时正是靠这一条认出这三张表）。
  const originShortMap: Record<OriginType, string> = {
    '寒门': '寒门子也',
    '缙绅': '缙绅家也',
    '没落世家': '没落世家也',
    '诗文清望': '诗礼家也',
    '胥吏': '刀笔吏也',
    '海商': '海商家也'
  }
  const originShort = originShortMap[character.origin] || '出身未详'

  // 计算入仕年（用于"XX年授知县"句式）
  const chongzhenEntry = toMingEraYear(startYear)

  // 末尾卒/罢句（仿海瑞传"十五年，卒官" / "十五年，卒，年七十有二"格式）
  const endYearText = toMingEraYear(endYear)
  // 卒年句：死亡用"卒"配卒于...+年龄（海瑞传范例），非死亡用"罢"或"致仕"
  // 年龄数字用汉字（不出现阿拉伯）
  const cnAge = toChineseNum(age)
  const closeLine = isDeathEnding
    ? `${endYearText}，卒，年${cnAge}。`
    : `${endYearText}，罢归，年${cnAge}。`

  // 关键事迹改用编号列项（仿史馆传略原有排版）
  const keyEventsText = keyRecords.length > 0
    ? keyRecords.map((r, i) => `    ${toChineseNum(i + 1)}、${r.year}年${toChineseNum(r.month)}月 — ${r.title}：${r.description.slice(0, 50)}${r.description.length > 50 ? '……' : ''}`).join('\n')
    : '    （无显著事件）'

  const cleanEndingTitle = endingEvent.title.replace(/【?结局】?\s*/g, '').trim()

  return `【明史列传·${displayName}传】

    ${displayName}，字${character.courtesyName || '未详'}，${character.hometown || '籍贯未详'}人。${originShort}。以${character.degree}出身，${chongzhenEntry}授知县。

    ${closeLine}

    ${rankComment}。${ambitionComment}。${reputationComment}。

    关键事迹：
${keyEventsText}

    史臣曰：${evaluation}。

    【结局：${cleanEndingTitle}】

    ${endingEvent.description}
`
}

/** 触发结局时调用：登记达成记录 + 解锁成就 + 分类结局类型 */
export function triggerEndingAchievements(endingEvent: GameEvent): { newlyUnlocked: string[] } {
  const endingType = classifyEnding(endingEvent)
  const newUnlocks: string[] = []

  const tileId = resolveEndingTileId(endingEvent.id) ?? endingEvent.id

  /**
   * 达成记录先写，而且写的是**图鉴格子 id**。
   * 这一步不依赖"有没有一条名字叫 `${id}_done` 的成就"：
   * 补成就之前达成的老存档只有这条记录，图鉴靠它把那些格子点亮。
   */
  recordEndingReached(tileId)

  // 解锁该具体结局的成就。名字要经过 data/endingRegistry 换算，不能直接拼 `${event.id}_done`：
  // 边界结局的事件 id 是 `triggerable_*`，而成就层按 `ending_*_done` 命名，
  // 拼出来的名字在 ALL_ACHIEVEMENTS 里根本不存在 —— 成就永远不会亮。
  const specificId = endingAchievementIdOf(endingEvent.id)
  if (unlockAchievement(specificId)) {
    newUnlocks.push(specificId)
  }

  // 解锁分类成就
  const categoryMap: Record<string, string> = {
    legendary: 'legendary_ending',
    good: 'good_ending',
    bad: 'bad_ending',
    tragic: 'tragic_ending',
    normal: 'normal_ending'
  }
  const categoryId = categoryMap[endingType]
  if (categoryId && unlockAchievement(categoryId)) {
    newUnlocks.push(categoryId)
  }

  // completed_game（任何结局都触发）
  if (unlockAchievement('completed_game')) {
    newUnlocks.push('completed_game')
  }

  return { newlyUnlocked: newUnlocks }
}

/** 反事实预览：从 c2/c3 选项提取 "若……则……" 描述 */
export interface CounterfactualPreview {
  text: string
  endingId: string
  endingTitle: string
}

export function extractCounterfactuals(event: GameEvent): CounterfactualPreview[] {
  if (!event.choices) return []
  // 选择 c2/c3 提取反事实——这些是玩家**没选**的选项
  return event.choices
    .filter(c => c.id === 'c2' || c.id === 'c3')
    .map(c => {
      // 还原 endingTitle：去掉方括号，提取纯文本
      const cleanTitle = c.text.replace(/【|】/g, '').trim()
      return {
        text: c.description || c.text,
        endingId: c.id,
        endingTitle: `若当年${cleanTitle}，则……`
      }
    })
}

/**
 * 生成墓志铭（仿唐宋墓志铭体）
 * 短小精悍，分三段：志主生平、品德评骘、葬年葬地
 * 体现：出身 / 官职 / 道德 / 结局类型
 */
export function generateEpitaph(
  character: Character,
  gameState: GameStateValues,
  endingEvent: GameEvent
): string {
  const age = Math.floor(character.age)
  const endYear = gameState.currentYear
  const cnAge = toChineseNum(age)

  // 取显示名
  const displayName = (character.name && character.name !== '我' && character.name.trim())
    ? character.name.trim()
    : '某公'

  // 出身称谓
  const originMap: Record<OriginType, string> = {
    '寒门': '寒门',
    '缙绅': '缙绅',
    '没落世家': '世胄',
    '诗文清望': '诗礼',
    '胥吏': '刀笔',
    '海商': '海商'
  }
  const originShort = originMap[character.origin] || '布衣'

  // 官职评价（按圣眷分 5 档）
  const emperorsFavor = gameState.圣眷 ?? 50
  let rankLine = ''
  if (emperorsFavor >= 80) rankLine = '位极人臣，恩宠优渥'
  else if (emperorsFavor >= 60) rankLine = '累迁不次，简在帝心'
  else if (emperorsFavor >= 40) rankLine = '循分供职，未有大过'
  else if (emperorsFavor >= 20) rankLine = '失宠于朝，动辄得咎'
  else rankLine = '罢归田里，帝心厌弃'

  // 道德评骘
  const moral = character.hidden?.道德值 ?? 50
  let moralLine = ''
  if (moral >= 80) moralLine = '清慎忠直，君子人也'
  else if (moral >= 60) moralLine = '操守可嘉，不愧所生'
  else if (moral >= 40) moralLine = '中人之资，毁誉参半'
  else if (moral >= 20) moralLine = '声名狼藉，物议沸腾'
  else moralLine = '卑污苟贱，千夫所指'

  // 结局归类（影响葬语）
  const isMartyrdom = /martyr|city_fall|died_battlefield|duty_death|burning_death|died_fighting|whole_family/.test(endingEvent.id)
  const isRefuge = /hermit|monk|recluse|family_man|honorable_retirement|wealthy_retiree|exile_overseas/.test(endingEvent.id)
  const isTreason = /traitor|debauch|pimp|clan_exterminate|villain|usurper|贰臣/.test(endingEvent.id)
  const isLegend = /zhongxing|famous_minister|border_general|pure_stream|medical_saint/.test(endingEvent.id)

  // 葬年葬地（仿古体"葬于XX"句式）
  const endYearText = toMingEraYear(endYear)
  let burialLine = ''
  if (isMartyrdom) {
    burialLine = `${endYearText}，殉国难，享年${cnAge}岁。葬于故里，私谥"忠烈"。`
  } else if (isRefuge) {
    burialLine = `${endYearText}，卒于山野，享年${cnAge}岁。葬于某山之阴，遗民私谥"贞白"。`
  } else if (isTreason) {
    burialLine = `${endYearText}，卒，享年${cnAge}岁。葬于某乡，子孙不齿。`
  } else if (isLegend) {
    burialLine = `${endYearText}，卒，享年${cnAge}岁。葬于某山之阳，朝廷追赠、赐谥。`
  } else {
    burialLine = `${endYearText}，卒，享年${cnAge}岁。葬于故里，私谥"文简"。`
  }

  // 第一段：志主姓名、籍贯、出身
  const paragraph1 = `公讳${displayName}，字${character.courtesyName || '未详'}，${character.hometown || '籍贯未详'}人也。${originShort}之子，少负异禀。`

  // 第二段：生平大端
  const paragraph2 = `起于崇祯元年，历宦海浮沉。${rankLine}。${moralLine}。`

  // 第三段：葬语
  const paragraph3 = burialLine

  // 第四段：铭文（韵文，仿唐宋墓志铭"铭曰"）
  let epitaphPoem = ''
  if (isMartyrdom) {
    epitaphPoem = `铭曰：
    呜呼！公生逢末世，志在匡时。
    一朝城破，矢死靡他。
    血染青史，名照汗青。
    魂归华表，魂兮有灵。`
  } else if (isRefuge) {
    epitaphPoem = `铭曰：
    公之去也，山高水长。
    公之归也，云淡风轻。
    身隐而道存，迹远而名彰。
    后之君子，其知公之心也夫。`
  } else if (isTreason) {
    epitaphPoem = `铭曰：
    呜呼！公之生也，名动公卿。
    公之死也，遗臭万年。
    青史有笔，难逃斧钺。
    后之览者，亦将何言。`
  } else if (isLegend) {
    epitaphPoem = `铭曰：
    公之出也，致君尧舜。
    公之处也，利泽生民。
    名垂宇宙，功在社稷。
    呜呼休哉，千古一人。`
  } else {
    epitaphPoem = `铭曰：
    生也有涯，宦海无涯。
    公之往矣，山高月白。
    史笔有据，墓石有铭。
    后之来者，其鉴于是。`
  }

  return `【墓志铭】

${paragraph1}
${paragraph2}
${paragraph3}

${epitaphPoem}`
}
