// P1 第三阶段：12 个常驻人物。
//
// 这里只做“人”的身份与关系票，不新写事件。每个常驻人物至少挂 3 张
// 现有事件已经写得出的人生经历（visitFlags），玩家在 3–5 个不同场合
// 遇到同一个人，结局再把这些票翻成一句人话。
//
// 为什么用 flag 而不是新加一套关系数值：
// - 现有存档、履历、选项门槛已经全按 flags 走；
// - 新数值要同时改 Web/Android 存档、迁移、UI，收益不如先把人立住；
// - 结局只需要回答“你这一生绕不开谁”，不需要把关系量化成好感度。

export interface RecurringCharacter {
  id: string
  name: string
  /** 一句话身份，写在结局里的人名后面 */
  title: string
  /** 3–5 张由现有事件写出的关系票 */
  visitFlags: string[]
  /** 结局里提到这个人时说的话；只写“你和他之间发生过什么”，不替他编结局 */
  endingLine: string
}

export const RECURRING_CHARACTERS: RecurringCharacter[] = [
  {
    id: 'chongzhen',
    name: '崇祯帝',
    title: '乾清宫里的那位皇帝',
    visitFlags: ['崇祯赏识', '崇祯近臣', '外放督抚', '崇祯所忌', '崇祯所疑'],
    endingLine: '崇祯见过你：有时听进了你的话，有时只记住了你的回避。'
  },
  {
    id: 'sunchuanting',
    name: '孙传庭',
    title: '大明最后能野战的那只手',
    visitFlags: ['孙传庭故交', '孙传庭监军', '支援孙传庭', '替代孙传庭', '固守潼关'],
    endingLine: '孙传庭出狱时你去见过他；潼关那一战，你劝过他、替过他，或只在城头看着。'
  },
  {
    id: 'yuanchonghuan',
    name: '袁崇焕',
    title: '蓟辽督师',
    visitFlags: ['弹劾袁崇焕', '挺袁派', '持续保袁', '资助袁家', '袁党'],
    endingLine: '袁崇焕案上你站过一边：弹过、保过，或在他死后替他养过家小。'
  },
  {
    id: 'hongchengchou',
    name: '洪承畴',
    title: '松锦败后降清的蓟辽总督',
    visitFlags: ['洪承畴幕僚', '洪承畴故交', '联络洪承畴', '声讨洪承畴'],
    endingLine: '洪承畴出关时你进过他的幕府；他降清后，你要么秘密联络过他，要么上疏骂过他。'
  },
  {
    id: 'yang_sichang',
    name: '杨嗣昌',
    title: '督师剿匪的阁臣',
    visitFlags: ['杨嗣昌幕僚', '支持杨嗣昌', '反对杨嗣昌', '弹劾杨嗣昌'],
    endingLine: '杨嗣昌督师时你入过幕、配合过、反对过，或直接参过他。'
  },
  {
    id: 'wen_tiren',
    name: '温体仁',
    title: '崇祯朝首辅',
    visitFlags: ['弹劾温体仁', 'wentiren_enemy', 'wentiren_public_enemy', 'soulmate_sacrificed'],
    endingLine: '温体仁当国时你弹过他、顶过他，或在他手里让出过自己珍视的人。'
  },
  {
    id: 'wu_sangui',
    name: '吴三桂',
    title: '关宁军最后的总兵',
    visitFlags: ['代吴三桂请饷', '关宁军故交', '增援松锦'],
    endingLine: '吴三桂的关宁军缺饷时你替他上过疏；松锦告急，你也往那边派过兵。'
  },
  {
    id: 'li_zicheng',
    name: '李自成',
    title: '闯军之首',
    visitFlags: ['诈降反戈', '主招抚', '从军剿贼', '闯军所杀'],
    endingLine: '李自成这三个字，你或剿过、或抚过、或诈降过他；城破那日，也有人死在他手里。'
  },
  {
    id: 'huang_taiji',
    name: '皇太极',
    title: '关外的清国之主',
    visitFlags: ['主和派', '议和泄露', '静观其变', '关外督师'],
    endingLine: '皇太极在关外时，你议过和、泄过密、主张过静观，或真的去督过师。'
  },
  {
    id: 'wei_zhongxian',
    name: '魏忠贤',
    title: '天启朝司礼监掌印',
    visitFlags: ['反阉先锋', '东林死忠', '清算阉党', '阉党嫌疑', '弹劾阉党'],
    endingLine: '魏忠贤倒台前后你选过边：反过阉、清过阉党，或被人记进过阉党名册。'
  },
  {
    id: 'lu_xiangsheng',
    name: '卢象升',
    title: '巨鹿战死的督师',
    visitFlags: ['留守文官', '为卢象升复仇', '为卢象升请恤', '弹劾高起潜'],
    endingLine: '卢象升巨鹿殉国后，你替他追过仇、请过恤；他邀你从军时，你也可能婉拒过。'
  },
  {
    id: 'furen',
    name: '夫人',
    title: '门里那个陪你到最后的人',
    visitFlags: ['wife_respected', 'harmonious_family', 'wife_forgave', 'wife_broken', 'protect_childless_wife'],
    endingLine: '门里那个人记得你：你敬过她、护过她，也伤过她；到最后，她还在或已经不在。'
  }
]

export const RECURRING_CHARACTER_COUNT = RECURRING_CHARACTERS.length

export interface CharacterRelationship {
  character: RecurringCharacter
  matchedFlags: string[]
}

/**
 * 把玩家身上的经历票翻成“有关系的人”。
 *
 * 只返回真的写过票的人；排序先按命中票数，再按注册表顺序。
 * 同一张票只算一次；没写过的票不硬凑。
 */
export function relationshipsOf(flags: readonly string[] | undefined): CharacterRelationship[] {
  const owned = new Set(flags ?? [])
  return RECURRING_CHARACTERS
    .map((character, index) => ({
      character,
      index,
      matchedFlags: character.visitFlags.filter((flag) => owned.has(flag))
    }))
    .filter((entry) => entry.matchedFlags.length > 0)
    .sort((a, b) => b.matchedFlags.length - a.matchedFlags.length || a.index - b.index)
    .map(({ character, matchedFlags }) => ({ character, matchedFlags }))
}

/**
 * 结局里的“这一生绕不开的人”。
 *
 * 取关系最深的三个人；不足三人时只说实际有的人，不拿无名氏凑数。
 * 返回空串表示这一局没有写出任何常驻人物的票，调用方不要硬塞一段。
 */
export function relationshipEpilogue(flags: readonly string[] | undefined): string {
  const relationships = relationshipsOf(flags).slice(0, 3)
  if (relationships.length === 0) return ''
  const lines = relationships.map(({ character }) => `${character.name}：${character.endingLine}`)
  return `这一生绕不开的人——\n${lines.join('\n')}`
}

export interface CharacterCodexEntry {
  character: RecurringCharacter
  met: boolean
  matchedFlags: string[]
}

/**
 * 图鉴人物卷：已遇的按交集票数排在前面，未遇的按注册表序补齐。
 * 与 relationshipsOf 不同，这里返回全部 12 人——未遇的人在图鉴里灰显而不是隐藏，
 * 玩家才看得到「这一生还有谁没遇上」。
 */
export function characterCodexEntries(flags: readonly string[] | undefined): CharacterCodexEntry[] {
  const met = relationshipsOf(flags).map(({ character, matchedFlags }) => ({ character, met: true, matchedFlags }))
  const metIds = new Set(met.map((entry) => entry.character.id))
  const unmet = RECURRING_CHARACTERS
    .filter((character) => !metIds.has(character.id))
    .map((character) => ({ character, met: false, matchedFlags: [] as string[] }))
  return [...met, ...unmet]
}
