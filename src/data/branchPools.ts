/**
 * 引擎的「可重复支线池」有哪些事件 type —— 唯一的一份名单。
 *
 * 单独成模块的原因不是洁癖：`scripts/audit-repeatable-gating.ts` 要用**同一份**名单
 * 去判断"哪些事件受『不得钉死单年』这条规则约束"。名单原先只写在
 * `useGameEngine.findAllEventsForState` 里，脚本再抄一份，就变成第七轮那种毛病 ——
 * 引擎加一类支线时脚本静默少查一批，而"少查一批"在报告里和"全部干净"长得一模一样。
 *
 * 这一批 type 与 `cooldowns` 里那几个键是一对：加 type 必须同时给冷却期，
 * 否则它在池子里就没有冷却（`cooldowns[type] || 0` 会当成 0）。
 */
export const branchRepeatableEventTypes = ['gray', 'character', 'national', 'faction'] as const

export type BranchRepeatableEventType = (typeof branchRepeatableEventTypes)[number]
