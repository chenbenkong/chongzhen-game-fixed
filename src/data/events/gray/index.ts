import { GameEvent } from '../../../types/event'
import { allGrayBranchEvents } from './debauchery'
import { briberyGrayEvents } from './bribery'
import { smugglingGrayEvents } from './smuggling'
import { informerGrayEvents } from './informer'
import { fortuneGrayEvents } from './fortune'

// 所有灰色支线事件（不含结局）
// 灰色结局（ending_debauch_fall 等）已迁移到 events/ending/debauchery/，由 BoundaryEventManager 统一注册触发
export const allGrayChoiceEvents: GameEvent[] = [
  ...allGrayBranchEvents,
  ...briberyGrayEvents,
  ...smugglingGrayEvents,
  ...informerGrayEvents,
  ...fortuneGrayEvents
]

export {
  allGrayBranchEvents,
  briberyGrayEvents,
  smugglingGrayEvents,
  informerGrayEvents,
  fortuneGrayEvents
}
