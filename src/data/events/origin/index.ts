import { GameEvent } from '../../../types/event'
import { hanmenEvents } from './hanmen'
import { jinshenEvents } from './jinshen'
import { moluoEvents } from './moluo'
import { shiwenEvents } from './shiwen'
import { xuliEvents } from './xuli'
import { haishangEvents } from './haishang'

export const originEvents: GameEvent[] = [
  ...hanmenEvents,
  ...jinshenEvents,
  ...moluoEvents,
  ...shiwenEvents,
  ...xuliEvents,
  ...haishangEvents
]
