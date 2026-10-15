import { GameEvent } from '../../../types/event'
import { hanmenEvents } from './hanmen'
import { jinshenEvents } from './jinshen'
import { moluoEvents } from './moluo'
import { shiwenEvents } from './shiwen'

export const originEvents: GameEvent[] = [
  ...hanmenEvents,
  ...jinshenEvents,
  ...moluoEvents,
  ...shiwenEvents
]
