import { GameEvent } from '../../../types/event'
import { wifeEvents } from './wife'
import { concubineEvents } from './concubine'
import { soulmateEvents } from './soulmate'
import { coreEmotionEvents } from './core'

// 所有情感线事件
export const allEmotionEvents: GameEvent[] = [
  ...wifeEvents,
  ...concubineEvents,
  ...soulmateEvents,
  ...coreEmotionEvents
]

export { wifeEvents }
export { concubineEvents }
export { soulmateEvents }
export { coreEmotionEvents }
