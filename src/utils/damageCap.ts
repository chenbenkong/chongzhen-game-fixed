/**
 * 单次结算的负向伤害上限。
 *
 * 现状的问题不是“每回合慢性流血”，而是某一张卡一次性把一维从 50 打到 0：
 * 玩家没有预警窗口，宽限期只能把处决日整体后移，曲线变成阶跃。
 * 这里把单次结算的跌幅夹住：
 *
 *   最大跌幅 = max(当前值 × 50%, 10)
 *
 * 结果是任何一次抉择都不能把一维从健康值直接打穿；归零必须靠 2–3 次累积。
 * 当前值已经很低时仍可能被打到 0（小值维不该被这条规则变成无敌），
 * 但那一步会先经过归零警告，而不是从 50 直接消失。
 *
 * 只夹“负增量”，正增量不受影响；属性、五方态度、隐藏属性共用同一口径。
 */
export const DAMAGE_CAP_RATIO = 0.5
export const DAMAGE_CAP_FLOOR = 10

export function capDamage(current: number, delta: number): number {
  if (delta >= 0) return Math.round(delta)
  const currentSafe = Number.isFinite(current) ? Math.max(0, Math.round(current)) : 0
  // 上限必须也取整：50% 会算出 32.5 这类半整数，再落到状态上就变成小数。
  const maxDrop = Math.max(Math.floor(currentSafe * DAMAGE_CAP_RATIO), DAMAGE_CAP_FLOOR)
  return -Math.min(Math.round(Math.abs(delta)), maxDrop)
}
