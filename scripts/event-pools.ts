/**
 * 体检脚本共用的「有哪些事件池、每个 id 来自哪个池」。
 *
 * 单独成一个文件有两个原因，都不是洁癖：
 *  1. 每个体检脚本末尾都挂着 CLI 输出块（`if (!process.env.VITEST)` 打印报告）。
 *     把池子清单放在脚本里互相 import，import 方会顺带打印一遍别人的报告；
 *     这份没有副作用的模块可以随便 import。
 *  2. 池子清单以前在两个脚本里各抄一遍。新加一个池子只改一处，另一处就会**静默少查一批事件** ——
 *     而"少查一批"在报告里长得和"全部干净"一模一样。第七轮的三个崩溃脚本就是这么隐身半年的。
 *
 * `poolOf` 的来源标签要把 initialEvents 里的 historical / transition 覆盖成更精确的池名：
 * 体检报错时得能一眼看出「是历史事件还是过渡事件」，
 * 而且 audit-event-shape 靠标签判断某事件是否参与 type 分层（结局池不参与）。
 */
import {
  historicalEvents,
  transitionEvents,
  initialEvents,
  allGrayChoiceEvents,
  emotionEvents
} from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'
import { triggerableEndingEvents } from '../src/data/boundaryEvents'

export const pools: Array<[string, any[]]> = [
  ['initialEvents', initialEvents as any[]],
  ['gray', allGrayChoiceEvents as any[]],
  ['ending', allEndingEvents as any[]],
  ['emotion', emotionEvents as any[]],
  ['triggerable', triggerableEndingEvents as any[]]
]

export const endings: any[] = allEndingEvents as any[]

export const poolOf = new Map<string, string>()
for (const [name, list] of pools) {
  for (const e of list) if (e?.id && !poolOf.has(e.id)) poolOf.set(e.id, name)
}
for (const e of historicalEvents as any[]) poolOf.set(e.id, 'historical')
for (const e of transitionEvents as any[]) poolOf.set(e.id, 'transition')

/** 六个事件池首尾相接的原始数组（含重复 id，去重由调用方按 id 处理） */
export const allEvents: any[] = []
for (const [, list] of pools) allEvents.push(...list)

export const labelOfPool = (id: string) => poolOf.get(id) || 'pool'
