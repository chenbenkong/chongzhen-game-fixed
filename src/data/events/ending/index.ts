// 结局事件索引（仅用于 EndingCodex / CheatMode 的展示/筛选）
// 真实触发由 BoundaryEventManager 统一负责（见 data/boundaryEvents.ts）

import { triggerableEndingEvents } from '../../boundaryEvents'
import { debaucheryEndingEvents } from './debauchery'
import { allEndingEvents as mainAndExtraEndings } from './endings_all'

// 全部结局（去重后）— 仅用于展示，不可作为游戏事件池的一部分
export const allEndingEvents = [
  ...triggerableEndingEvents,
  ...mainAndExtraEndings,
  ...debaucheryEndingEvents
]

// 按需导出（保持向后兼容：mainEndings / extraCategoryEndings 均指向合并数组）
export { triggerableEndingEvents, debaucheryEndingEvents }
export const mainEndings = mainAndExtraEndings
export const extraCategoryEndings: typeof mainAndExtraEndings = []
