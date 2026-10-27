import { GameEvent } from '../../types/event'
import { events1628 as historical1628 } from './historical/1628'
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
import { events1628 as transition1628 } from './transition/1628'
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
import { eventsRouteGuide as routeGuideEvents } from './transition/route_guide'
import { innerCourtEvents } from './transition/inner_court'
import { preludeEvents as transitionPreludes } from './transition/preludes'
import { allGrayChoiceEvents } from './gray'
// ./ending 不在这里 import。此前那行 `import { allEndingEvents } from './ending'`
// 只被早已删掉的 `export { allEndingEvents }` 用过，是个死引用；
// 而 `noUnusedLocals` 并没有报它。为什么结局数据仍然在首屏，见文件末尾。
import { allEmotionEvents as emotionEvents } from './emotion'
import { factionEvents } from './faction/faction_events'
import { originEvents } from './origin'
import { allEchoEvents } from './echo'

export const historicalEvents: GameEvent[] = [
  ...historical1628,
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
];

export const transitionEvents: GameEvent[] = [
  ...transition1628,
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
  ...routeGuideEvents,
  ...innerCourtEvents,
  ...transitionPreludes
];

// 随机/支线事件池（结局不在这里 — 结局由 BoundaryEventManager 统一触发）
export const initialEvents: GameEvent[] = [
  ...historicalEvents,
  ...transitionEvents,
  ...emotionEvents,
  // 党争事件（4 个，type='faction'）。引擎的 withCooldown 分支和
  // 事件池的 branchRepeatableTypes 一直都在处理 'faction' 这一类，
  // 但这份数据从来没被并进任何池子 —— 只有调试面板 CheatMode 单独 import 了它，
  // 于是正常游玩永远碰不到党争事件。这里补进主池，让那套冷却逻辑真正生效。
  ...factionEvents,
  ...originEvents,
  // 回响池：不新增剧情线，只把已有的死 flag 接成因果（见 echo/index.ts 的接线表）
  ...allEchoEvents
];

// 灰色支线（type='gray'，会进入 findAvailableEvent 走"30% 支线触发窗口"）
export { allGrayChoiceEvents };

// ⚠️ 全部结局**刻意不再**从这里导出，本文件对 ./ending 的静态依赖也已彻底移除。
//
// 原来这里有一行 `export { allEndingEvents }`：useGameEngine 从本 barrel 取
// initialEvents，于是结局数据被硬拖进首屏模块图。删掉导出是正确的方向，
// 但**它并没有真的把结局数据移出首屏** —— 下面这条实测结论请一起记住，
// 免得继任者以为已经优化完了：
//
//   dist/index.html 的 modulepreload 列表里仍然有 events-ending-*.js（167 KB）。
//   原因是 data/boundaryEvents.ts 静态 import 了 endings_all 与 debauchery，
//   要把它们逐个注册给 BoundaryEventManager；而 boundaryEvents 又被 useGameEngine
//   依赖。引擎在任何一个月都可能抛出结局，所以这份数据按定义就必须在首屏可用。
//
// 真要把它挪走，只有一条路：把结局注册本身改成异步（首次判定时再 dynamic import），
// 那会牵动 BoundaryEventManager 的同步判定接口，风险高于收益。
//
// 现在需要全部结局的两处直接按路径 import：
//   - components/EndingCodex.tsx  → data/events/ending（该组件本身是 lazy 的）
//   - components/CheatMode.tsx    → data/events/ending（该组件也是 lazy 的）
//
// 真实触发仍由 BoundaryEventManager 负责（见 data/boundaryEvents.ts），
// 结局也不进入 findAvailableEvent 的事件池。

export { emotionEvents };
