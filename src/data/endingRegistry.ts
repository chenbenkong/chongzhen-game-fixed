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
  ending_bankrupt: 'triggerable_bankrupt'
}

/**
 * 把一个结局事件 id（eventHistory 里的、成就判据里的、引擎造的卡片里的）
 * 解析成图鉴格子 id。解析不到返回 null —— 调用方不要自己猜。
 */
export function resolveEndingTileId(id: string): string | null {
  const tileId = ENDING_ID_ALIASES[id] ?? id
  return TILE_IDS.has(tileId) ? tileId : null
}

/** 图鉴里全部格子 id（审计与测试用） */
export const ENDING_TILE_IDS: readonly string[] = [...TILE_IDS]
