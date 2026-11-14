/**
 * 「明年及以后」的事件：开局用不到，等主界面出来之后再补下载。
 *
 * 为什么要把它们从 `initialEvents` 里摘出来（第七十九轮之后的第一笔账）：
 * 点【开始仕途】那一刻，浏览器实际要下 **3.83 MB**（2.83 MB JS + 1.1 MB 字体），
 * 其中 **2.4 MB 是事件数据**，而 1628 年这一年只可能播到其中 100 KB 左右的东西 ——
 * 剩下 2.3 MB 是替十一年后的玩家先付的。
 *
 * 这里不做"按年逐段 await"那一套（那会把引擎的选事件改成异步，牵动
 * `BoundaryEventManager` 的同步判定接口，风险远大于收益）。做法只有一条：
 * **开局只要 1628 年这一片，其余整批在后台补，补齐之前不许跨年**。
 *
 * 三条保命的设计：
 *  1. 合并顺序必须与 `data/events/index.ts` 里的原顺序**逐项相同**
 *     （历史 1628→1644·figures，过渡 1628→1643b·1644_critical·route_guide·inner_court·preludes）。
 *     `pickEvent` / `weightedPick` 用的是 `Math.random` 顺序抽样，数组顺序一换，
 *     同一颗种子的整局路径就换了 —— 四十多个跑局用例的读数会集体漂移，
 *     而那种"漂移"看起来像"被改坏了"。
 *  2. 1628 年这一片必须留在首批里（`store.ts` 静态 import）。首批之外的事件
 *     全部带 `conditions.year`，不存在"任意年份可播"的野事件 ——
 *     `scripts/audit-year-buckets.ts` 是这条口径的守门人。
 *  3. 补齐之前 `eventDataCovers(year)` 对未来的年份一律返回 false，
 *     引擎据此**不许跨年**（见 `handleNextMonth` 与初始化 effect 里的闸门）。
 *     宁可让玩家多看一眼"正在展开案卷"，也不许在数据没到齐时把整年空月跳过去。
 */
import { GameEvent } from '../../types/event'

import { events1629 as historical1629 } from './historical/1629'
import { events1630 as historical1630 } from './historical/1630'
import { events1631 as historical1631 } from './historical/1631'
import { events1632 as historical1632 } from './historical/1632'
import { events1633 as historical1633 } from './historical/1633'
import { events1634 as historical1634 } from './historical/1634'
import { events1635 as historical1635 } from './historical/1635'
import { events1636 as historical1636 } from './historical/1636'
import { events1637 as historical1637 } from './historical/1637'
import { events1638 as historical1638 } from './historical/1638'
import { events1639 as historical1639 } from './historical/1639'
import { events1640 as historical1640 } from './historical/1640'
import { events1641 as historical1641 } from './historical/1641'
import { events1642 as historical1642 } from './historical/1642'
import { events1643 as historical1643 } from './historical/1643'
import { events1644 as historical1644 } from './historical/1644'
import { figuresEvents as historicalFigures } from './historical/figures'

import { events1629 as transition1629 } from './transition/1629'
import { events1630 as transition1630 } from './transition/1630'
import { events1631 as transition1631 } from './transition/1631'
import { events1632 as transition1632 } from './transition/1632'
import { events1633 as transition1633 } from './transition/1633'
import { events1634 as transition1634 } from './transition/1634'
import { events1635 as transition1635 } from './transition/1635'
import { events1636 as transition1636 } from './transition/1636'
import { events1637 as transition1637 } from './transition/1637'
import { events1638 as transition1638 } from './transition/1638'
import { events1639 as transition1639 } from './transition/1639'
import { events1640 as transition1640 } from './transition/1640'
import { events1641 as transition1641 } from './transition/1641'
import { events1642 as transition1642 } from './transition/1642'
import { events1643 as transition1643 } from './transition/1643'
import { events1643 as transition1643b } from './transition/1643b'
import { events1644_critical as transition1644Critical } from './transition/1644_critical'
import { eventsRouteGuide } from './transition/route_guide'
import { innerCourtEvents } from './transition/inner_court'
import { preludeEvents } from './transition/preludes'

/**
 * 1629–1644 的历史大事件，顺序与 `index.ts` 的 `historicalEvents` 后半段一致
 * （figures 排在最末，它是跨年人物事件，最早 1629 才开门）。
 */
export const futureHistoricalEvents: GameEvent[] = [
  ...historical1629,
  ...historical1630,
  ...historical1631,
  ...historical1632,
  ...historical1633,
  ...historical1634,
  ...historical1635,
  ...historical1636,
  ...historical1637,
  ...historical1638,
  ...historical1639,
  ...historical1640,
  ...historical1641,
  ...historical1642,
  ...historical1643,
  ...historical1644,
  ...historicalFigures
]

/**
 * 1629 年以后的过渡事件。`route_guide`（命途入口，最早 1632 开门）、
 * `inner_court`（1630–1644）、`preludes`（前奏，1643 起）都排在这里 ——
 * 它们的年窗全部落在 1628 之后，开局那一年一张都播不到。
 */
export const futureTransitionEvents: GameEvent[] = [
  ...transition1629,
  ...transition1630,
  ...transition1631,
  ...transition1632,
  ...transition1633,
  ...transition1634,
  ...transition1635,
  ...transition1636,
  ...transition1637,
  ...transition1638,
  ...transition1639,
  ...transition1640,
  ...transition1641,
  ...transition1642,
  ...transition1643,
  ...transition1643b,
  ...transition1644Critical,
  ...eventsRouteGuide,
  ...innerCourtEvents,
  ...preludeEvents
]
