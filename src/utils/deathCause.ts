/**
 * 结局屏的「直接死因」。
 *
 * 只解释八条归零死线，不替所有结局编原因：被流放、被革职、甲申国变
 * 都有自己的叙事卡，硬塞一句“因为你没保某属性”反而误导。
 * 这里按图鉴格子 id 归一，别名（ending_bankrupt 等）也能命中。
 */

export interface DeathCause {
  key: string
  label: string
  tip: string
}

const CAUSES: Record<string, DeathCause> = {
  triggerable_bankrupt: {
    key: '财帛',
    label: '财帛归零 · 倾家荡产',
    tip: '先留 30 两应急银，别把家底一次押空。'
  },
  triggerable_death_illness: {
    key: '体质',
    label: '体质归零 · 病入膏肓',
    tip: '硬撑之后先休养一月，再接差事。'
  },
  triggerable_emperor_hate: {
    key: '圣眷',
    label: '圣眷归零 · 龙颜震怒',
    tip: '圣眷见底时，先做一件御前看得见的实事，不要硬顶。'
  },
  triggerable_eunuch: {
    key: '中官',
    label: '中官归零 · 宦官构陷',
    tip: '中官低于 20 时，要么补门路，要么走言路，不要两头空。'
  },
  triggerable_scholar_ostracism: {
    key: '清议',
    label: '清议归零 · 士林唾弃',
    tip: '清议跌破 20 时，先刊书自讼或做一件清望事。'
  },
  triggerable_gentry_rebellion: {
    key: '士绅',
    label: '士绅归零 · 乡绅反目',
    tip: '士绅低于 20 时，先减免本县赋役，别同时得罪地方。'
  },
  triggerable_popular_uproar: {
    key: '民望',
    label: '民望归零 · 民怨沸腾',
    tip: '民望低于 20 时，先平反冤狱或开仓平粜。'
  },
  triggerable_moral_degeneracy: {
    key: '道德值',
    label: '道德归零 · 身败名裂',
    tip: '道德低于 20 时，做一件不问回报的善政，别再碰灰色收入。'
  }
}

/** 传入图鉴格子 id；不是归零死线返回 null。 */
export function deathCauseOf(tileId: string | null): DeathCause | null {
  return tileId ? CAUSES[tileId] ?? null : null
}
