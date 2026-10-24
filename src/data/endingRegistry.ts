import { allEndingEvents } from './events/ending'

/**
 * 结局 id 的唯一对账处。
 *
 * 这里原本不存在：图鉴把成就 id 砍掉 `_done` 当作事件 id 去查格子，成就判据
 * 用 `eventHistory.includes(...)` 硬写字符串，引擎再靠 `withEndingId` 临时改名 ——
 * 三处各自认为"名字当然是对的"，于是同名不同源的问题只能靠玩家发现。
 * 实测代价（第十三轮）：43 格里有 11 格无论怎么打都点不亮，破产那一格
 * 明明达成过也永远是灰的。
 *
 * 规则：**任何"事件 id ≠ 格子 id"的情况都必须登记进 ENDING_ID_ALIASES**，
 * 并由 scripts/audit-ending-codex.ts 逐条对账（别名指向的格子必须存在、
 * 每条结局成就判据的 id 必须能解析到格子）。
 */

const TILE_IDS = new Set(allEndingEvents.map(e => e.id))

/** 存档/成就/引擎侧用过的别名 → 图鉴格子 id（导出给体检脚本核对指向） */
export const ENDING_ID_ALIASES: Readonly<Record<string, string>> = {
  /**
   * 破产在 BoundaryEventManager 里注册为 `triggerable_bankrupt`，而成就
   * `ending_bankrupt_done` 与旧存档的 eventHistory 认的是 `ending_bankrupt`
   * （引擎 `withEndingId` 改的名）。保留历史侧名字，映射到格子。
   */
  ending_bankrupt: 'triggerable_bankrupt',

  /**
   * 第十一条起：十条边界/阈值结局。
   *
   * 这十格注册在 `boundaryEvents.ts` 里，事件 id 就是 `triggerable_*`，而成就层的命名
   * 约定是 `ending_<事名>_done`（`countUnlockedEndings` 与图鉴都按这个前缀认结局成就）。
   * 于是每一格都需要一条"成就名 → 事件名"的换算 —— 这正是本表存在的理由。
   *
   * 反方向（事件 id → 成就名）由下面的 `endingAchievementIdOf` 用同一张表推出来，
   * 不再靠字符串拼接猜。
   */
  ending_death_illness: 'triggerable_death_illness',
  ending_emperor_hate: 'triggerable_emperor_hate',
  ending_eunuch_frame: 'triggerable_eunuch',
  ending_scholar_ostracism: 'triggerable_scholar_ostracism',
  ending_gentry_rebellion: 'triggerable_gentry_rebellion',
  ending_popular_uproar: 'triggerable_popular_uproar',
  ending_moral_isolation: 'triggerable_moral_degeneracy',
  ending_faction_martyr: 'triggerable_faction_martyr',
  ending_tyrant_fall: 'triggerable_faction_tyrant_fall',
  ending_faction_sacrifice: 'triggerable_faction_sacrifice',

  /**
   * 第五十九轮：中晚年的《乞骸骨》是一张灰卡（按年岁重复出现），
   * 其中【上书乞骸骨】走 `special.type='ending'` 当场收笔。
   * 事件 id 不是图鉴格子，必须在这里换算到《致仕善终》；
   * 否则 `triggerEndingAchievements` 会把一个不存在的 id 写进图鉴/成就。
   *
   * 注意它不是成就名 —— 成就名的命名约定是 `ending_<事名>_done`，
   * 因此下面反推成就 stem 时只认以 `ending_` 开头的别名（见 `TILE_TO_ACHIEVEMENT_STEM`）。
   */
  gray_late_retire: 'ending_honorable_retirement'
}

/**
 * 把一个结局事件 id（eventHistory 里的、成就判据里的、引擎造的卡片里的）
 * 解析成图鉴格子 id。解析不到返回 null —— 调用方不要自己猜。
 */
export function resolveEndingTileId(id: string): string | null {
  const tileId = ENDING_ID_ALIASES[id] ?? id
  return TILE_IDS.has(tileId) ? tileId : null
}

/**
 * 格子 id → 那条结局成就名的词干。
 *
 * 引擎过去写的是 `` `${event.id}_done` ``：对 34 条叙事结局正好（事件 id 就是格子 id），
 * 对边界结局就会拼出 `triggerable_eunuch_done` —— 一个按命名约定永远不存在、
 * 也永远不会出现在成就面板里的名字。第五十二轮给这十格补成就之后，
 * 拼名必须经过本表换算，否则"补了成就却仍然不亮"与第十三轮那个 bug 是同一种 bug。
 *
 * 本表是把 `ENDING_ID_ALIASES` 反过来查：别名里的 `from` 通常是成就名的词干
 * （`ending_death_illness` → `ending_death_illness_done`）。但第五十九轮起也出现了
 * **普通事件 id → 格子 id** 的别名（`gray_late_retire`），它没有对应的成就名。
 * 无条件反查会让这一格的成就名被它挤掉，玩家达成《致仕善终》时永远不亮。
 * 成就命名约定是 `ending_<事名>_done`，所以只收以 `ending_` 开头的别名；
 * 一个格子若同时有一条成就名别名和一条普通事件别名，stem 仍然取前者。
 */
const TILE_TO_ACHIEVEMENT_STEM: ReadonlyMap<string, string> = new Map(
  Object.entries(ENDING_ID_ALIASES)
    .filter(([from]) => from.startsWith('ending_'))
    .map(([from, to]) => [to, from])
)

export function endingAchievementIdOf(eventId: string): string {
  const tileId = resolveEndingTileId(eventId) ?? eventId
  return `${TILE_TO_ACHIEVEMENT_STEM.get(tileId) ?? tileId}_done`
}


/** 图鉴里全部格子 id（审计与测试用） */
export const ENDING_TILE_IDS: readonly string[] = [...TILE_IDS]
