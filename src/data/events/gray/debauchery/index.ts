import { GameEvent } from '../../../../types/event'
import { subordinateDebaucheryEvents } from './subordinate'
import { merchantDebaucheryEvents } from './merchant'
import { commonerDebaucheryEvents } from './commoner'
import { colleagueDebaucheryEvents } from './colleague'
import { seductionDebaucheryEvents } from './seduction'
import { publicDebaucheryEvents } from './public'
import { trapDebaucheryEvents } from './trap'
import { spyDebaucheryEvents } from './spy'
import { gratitudeDebaucheryEvents } from './gratitude'
import { powersexDebaucheryEvents } from './powersex'
import { temptationDebaucheryEvents } from './temptation'

// 所有灰色支线事件（不含结局，结局已迁移到 events/ending/debauchery/）
export const allGrayBranchEvents: GameEvent[] = [
  ...subordinateDebaucheryEvents,
  ...merchantDebaucheryEvents,
  ...commonerDebaucheryEvents,
  ...colleagueDebaucheryEvents,
  ...seductionDebaucheryEvents,
  ...publicDebaucheryEvents,
  ...trapDebaucheryEvents,
  ...spyDebaucheryEvents,
  ...gratitudeDebaucheryEvents,
  ...powersexDebaucheryEvents,
  ...temptationDebaucheryEvents
]

// 按类型导出
export {
  subordinateDebaucheryEvents,
  merchantDebaucheryEvents,
  commonerDebaucheryEvents,
  colleagueDebaucheryEvents,
  seductionDebaucheryEvents,
  publicDebaucheryEvents,
  trapDebaucheryEvents,
  spyDebaucheryEvents,
  gratitudeDebaucheryEvents,
  powersexDebaucheryEvents,
  temptationDebaucheryEvents
}
