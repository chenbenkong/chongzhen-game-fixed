import { GameEvent } from '../../../types/event'
import { allGrayBranchEvents } from './debauchery'
import { briberyGrayEvents } from './bribery'
import { smugglingGrayEvents } from './smuggling'
import { informerGrayEvents } from './informer'
import { fortuneGrayEvents } from './fortune'
import { patronageGrayEvents } from './patronage'
import { regimenGrayEvents } from './regimen'
import { locallineGrayEvents } from './localline'
import { reformGrayEvents } from './reform'
import { lateLifeGrayEvents } from './lateLife'

// 所有灰色支线事件（不含结局）
// 灰色结局（ending_debauch_fall 等）已迁移到 events/ending/debauchery/，由 BoundaryEventManager 统一注册触发
export const allGrayChoiceEvents: GameEvent[] = [
  ...allGrayBranchEvents,
  ...briberyGrayEvents,
  ...smugglingGrayEvents,
  ...informerGrayEvents,
  ...fortuneGrayEvents,
  // 有代价的回升通道：中官（patronage）、体质（regimen）、士绅与民望（localline）。
  // 这三项从前只有下降通道，掉下去就再也回不来，中期基本等于被判了死缓。
  ...patronageGrayEvents,
  ...regimenGrayEvents,
  ...locallineGrayEvents,
  // reform 是第四条、也是最重要的一条：全内容池的账面统计显示 欲望值 的升降比是
  // **进 291 条 +3516 / 出 37 条 −282（比 12.47）** —— 欲望几乎只涨不跌，
  // 而纵欲线（单条最高 −65 道德）偏偏以 欲望值 25~35 为开门条件。
  // 于是"腐化"是一条自我强化的下坡滑梯：欲望涨 → 纵欲事件解锁 → 道德崩 → 第 13 个月被考核革职。
  // reform 补的正是那条缺失的下行通道（欲望 −172 / 道德 +126），也是道德值唯一的主动回升口。
  ...reformGrayEvents,
  // 中晚年（第五十九轮）：年窗在 1645 前全部关完之后，玩家还需要看得见自己的老去。
  // 这一组按**年岁**开门，不按公元年 —— 见 lateLife.ts 的表头。
  ...lateLifeGrayEvents
]

export {
  allGrayBranchEvents,
  briberyGrayEvents,
  smugglingGrayEvents,
  informerGrayEvents,
  fortuneGrayEvents,
  patronageGrayEvents,
  regimenGrayEvents,
  locallineGrayEvents,
  reformGrayEvents,
  lateLifeGrayEvents
}
