// 剧情线注册表
// 用于事件管理器在 pickEvent 时按"当前剧情线"加权
// 同时给 UI 提供徽章（图标 / 主色 / 简介）
//
// P1 起，16 条线不再一律叫“主线”：8 条主线承担三拍与专属结局，
// 8 条辅线只做氛围、资源与人物回访。`tier` 是这条边界的唯一来源，
// UI 计数与后续内容审计都读它，不再数 `Object.keys(STORYLINES).length`。

export type StorylineTone = 'gold' | 'red' | 'blue' | 'green' | 'purple' | 'pink' | 'gray' | 'dark' | 'cyan'

export type StorylineTier = 'main' | 'support'

export interface Storyline {
  key: string
  name: string
  intro: string
  iconName: string
  tone: StorylineTone
  /** 主线 = 三拍 + 专属结局；辅线 = 氛围、资源、人物回访，不单独收束 */
  tier: StorylineTier
}

export const STORYLINES: Record<string, Storyline> = {
  eastern_forest: {
    key: 'eastern_forest',
    name: '东林风云',
    intro: '东林讲学、阉党余孽、清流弹劾——你卷入了大明最激烈的党争。',
    iconName: 'document',
    tone: 'blue',
    tier: 'main'
  },
  border_war: {
    key: 'border_war',
    name: '边关狼烟',
    intro: '辽东告急，松锦会战，请缨出关——武将之路。',
    iconName: 'sword',
    tone: 'red',
    tier: 'main'
  },
  power: {
    key: 'power',
    name: '权谋之术',
    intro: '攀附权贵、结党营私、左右逢源——权力的游戏。',
    iconName: 'starOutline',
    tone: 'dark',
    tier: 'main'
  },
  nationfall: {
    key: 'nationfall',
    name: '天崩地坼',
    intro: '甲申之变、崇祯殉国——大明亡了，你怎么办？',
    iconName: 'warning',
    tone: 'red',
    tier: 'main'
  },
  female: {
    key: 'female',
    name: '红颜相伴',
    intro: '妻妾、知己、红颜——温柔乡里亦是人生。',
    iconName: 'marriage',
    tone: 'pink',
    tier: 'main'
  },
  eunuch: {
    key: 'eunuch',
    name: '内廷暗线',
    intro: '宫门里的传话、文书房的折子、厂卫的名单——内廷的另一条路。',
    iconName: 'starOutline',
    tone: 'dark',
    tier: 'main'
  },
  hermit: {
    key: 'hermit',
    name: '林泉隐逸',
    intro: '辞官归隐、著书讲学、寻仙访道——退一步海阔天空。',
    iconName: 'flower',
    tone: 'green',
    tier: 'main'
  },
  legend: {
    key: 'legend',
    name: '中兴之梦',
    intro: '保袁、招抚、阻出战——若能挽救大明，功在千秋。',
    iconName: 'star',
    tone: 'gold',
    tier: 'main'
  },
  corrupt: {
    key: 'corrupt',
    name: '贪墨风云',
    intro: '盐引、军需、矿税——黑金之路，步步惊心。',
    iconName: 'coffin',
    tone: 'dark',
    tier: 'support'
  },
  merchant: {
    key: 'merchant',
    name: '商海浮沉',
    intro: '亦官亦商、买椟还珠——白银铺就的另一条路。',
    iconName: 'star',
    tone: 'gold',
    tier: 'support'
  },
  family: {
    key: 'family',
    name: '家业绵延',
    intro: '修族谱、建宗祠、设义田——为家族留下根基。',
    iconName: 'pin',
    tone: 'cyan',
    tier: 'support'
  },
  medical: {
    key: 'medical',
    name: '悬壶济世',
    intro: '习医救人、开馆行医——救得一人是一人。',
    iconName: 'flower',
    tone: 'green',
    tier: 'support'
  },
  mystery: {
    key: 'mystery',
    name: '异闻怪谭',
    intro: '天命、谶纬、狐仙、奇人——大明将倾时的神秘。',
    iconName: 'sparkle',
    tone: 'purple',
    tier: 'support'
  },
  martyr: {
    key: 'martyr',
    name: '忠烈千秋',
    intro: '城破之日、殉国之时——死节者名垂青史。',
    iconName: 'sword',
    tone: 'red',
    tier: 'support'
  },
  ordinary: {
    key: 'ordinary',
    name: '烟火人间',
    intro: '柴米油盐、妻儿老小——平平淡淡才是真。',
    iconName: 'sparkleDim',
    tone: 'gray',
    tier: 'support'
  },
  gray: {
    key: 'gray',
    name: '灰色地带',
    intro: '宴请、馈赠、交易——官场灰色，亦有代价。',
    iconName: 'shuffle',
    tone: 'gray',
    tier: 'support'
  }
}

/** P1 八条主线：每条要有三拍、至少一个专属结局。 */
export const MAINLINE_KEYS = [
  'eastern_forest',
  'border_war',
  'power',
  'nationfall',
  'female',
  'eunuch',
  'hermit',
  'legend'
] as const

/** P1 八条辅线：只做氛围、资源与人物回访，不单独收束。 */
export const SUPPORTLINE_KEYS = [
  'corrupt',
  'merchant',
  'family',
  'medical',
  'mystery',
  'martyr',
  'ordinary',
  'gray'
] as const

export type MainlineKey = (typeof MAINLINE_KEYS)[number]
export type SupportlineKey = (typeof SUPPORTLINE_KEYS)[number]

export const MAINLINE_COUNT = MAINLINE_KEYS.length
export const SUPPORTLINE_COUNT = SUPPORTLINE_KEYS.length

export function isMainline(key?: string): boolean {
  return !!key && (MAINLINE_KEYS as readonly string[]).includes(key)
}

export function getStoryline(key?: string): Storyline | undefined {
  if (!key) return undefined
  return STORYLINES[key]
}
