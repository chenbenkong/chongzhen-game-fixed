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
import { consequenceDebaucheryEvents } from './consequence'

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
  // `gray_debauchery_020` 与 `gray_debauchery_001` 是同一件“下属献妻”的换皮卡：
  // 同为柳如烟、同为四选项结构，只换了主簿/县丞的官名。两张都保留在池里，
  // 由 `exclusiveGroup: 'subordinate_wife_offer'` 保证一局只出现其中一张。
  ...powersexDebaucheryEvents,
  ...temptationDebaucheryEvents,
  ...consequenceDebaucheryEvents
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
  temptationDebaucheryEvents,
  consequenceDebaucheryEvents
}
