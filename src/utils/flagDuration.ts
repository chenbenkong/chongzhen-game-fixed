/**
 * `conditions.flags.sinceAny` 的判定 —— 时长门的**列表形状**。
 *
 * 为什么单独一个文件：这一条判据要被四个地方读（事件池 `checkEventConditions`、
 * 选项锁 `checkChoiceRequirement`、边界/结局编译器 `boundaryEventCompiler`、
 * 命途面板 `routeTrail.explainUnmet`），四处不仅要同义，还得**同一条老存档容错**、
 * 同一句"还差多久"。`since`（AND 形状）那一条是在三处各抄一遍的，
 * 第六十九轮补边界入参时就差过一处 —— 差的那一处不是报错，是安静地放行。
 * 新键不再复制这份风险。
 *
 * 它回答的问题是「这几段经历里，最老的一段满几年了」，而 `since` 回答的是
 * 「这一段特定的经历满几年了」。后者写在 `any` 网里会把整张网收窄成一张票
 * （见 `src/types/event.ts` 的 `since` 注释与 §1.4 ㊹），前者天生不收窄：
 * 网里的每一条支路都照样算数，只是都得做得够久。
 */

export type SinceAnySpec = { flags: string[]; min?: number; max?: number }

export interface SinceAnyVerdict {
  /** 这道门现在开不开 */
  open: boolean
  /** 身上到底有没有这张网里的任意一段经历 —— 决定说的是"缺经历"还是"等得不够久" */
  held: boolean
  /** 身上这些票里最老的那一段（把"还差多久"说成人话时的主语） */
  oldest?: { flag: string; elapsed: number }
  /** 还差几个月才够 `min`；只在 `!open && held && 写了 min` 时有值 */
  shortBy?: number
}

/**
 * 判定「所列经历里至少有一段，落笔满 `min` 且不超过 `max`」。
 *
 * 容错与 `since` 一字不差：身上有这张票、却查不到落笔月份（第 54 轮之前的存档只有
 * `flags` 没有 `flagTurns`）→ **放行**。判死等于把玩家已经攒出来的事件与结局凭空收走。
 * 一张票都没有 → 关，不许被这条容错放走。
 */
export function evalSinceAny(
  spec: SinceAnySpec | undefined,
  own: string[],
  flagTurns: Record<string, number> | undefined,
  turn: number
): SinceAnyVerdict {
  const list = spec?.flags ?? []
  const min = spec?.min
  const max = spec?.max
  let held = false
  let oldest: { flag: string; elapsed: number } | undefined

  for (const flag of list) {
    if (!own.includes(flag)) continue
    held = true
    const at = flagTurns?.[flag]
    if (at === undefined) return { open: true, held }
    const elapsed = turn - at
    if (!oldest || elapsed > oldest.elapsed) oldest = { flag, elapsed }
    if (min !== undefined && elapsed < min) continue
    if (max !== undefined && elapsed > max) continue
    return { open: true, held, oldest }
  }

  return {
    open: false,
    held,
    oldest,
    shortBy: min !== undefined && oldest ? Math.max(0, min - oldest.elapsed) : undefined
  }
}
