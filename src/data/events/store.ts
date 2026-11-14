/**
 * 事件数据的「分批到位」仓库。
 *
 * 一句话：**开局只装 1628 年，其余批次在后台补，补不齐不许跨年。**
 * 为什么这么干、以及三条保命设计（顺序不变 / 1628 留首批 / 跨年闸门），
 * 见 `future.ts` 的文件头 —— 这一份只负责把它变成一块可读的状态。
 *
 * 与 `data/events/index.ts` 的关系：
 *  - `index.ts` 仍是**全量静态 barrel**，给体检脚本、`CheatMode`（本来就是懒加载）
 *    以及所有单测用；它一次性把 483 条事件全 import 进来，行为和以前一模一样。
 *  - 引擎（`useGameEngine`）不再走 barrel，改走这里 —— 只有这条路径是分批的。
 *  - 所以"体检/单测算到的世界"与"线上加载方式"仍然是同一份数据，
 *    差别只在**什么时候到**，不在**到的是什么**。
 */

import { GameEvent } from '../../types/event'

import { events1628 as historical1628 } from './historical/1628'
import { events1628 as transition1628 } from './transition/1628'
import { allEmotionEvents as emotionEvents } from './emotion'
import { factionEvents } from './faction/faction_events'
import { originEvents } from './origin'
import { allEchoEvents } from './echo'
import { allGrayChoiceEvents } from './gray'

/** 首批（开局就要用）之外的事件，见 `future.ts` */
let futureHistorical: GameEvent[] = []
let futureTransition: GameEvent[] = []

/**
 * 合并顺序 = `data/events/index.ts` 里 `initialEvents` 的原顺序再 + gray。
 * 这不是审美问题：`pickEvent` / `weightedPick` 按数组顺序做随机抽样，
 * 顺序一换，同一颗种子的整局路径就变了，四十多个跑局用例会集体漂移。
 */
let merged: GameEvent[] = buildMerged()

function buildMerged(): GameEvent[] {
  return [
    ...historical1628,
    ...futureHistorical,
    ...transition1628,
    ...futureTransition,
    ...emotionEvents,
    ...factionEvents,
    ...originEvents,
    ...allEchoEvents,
    ...allGrayChoiceEvents
  ]
}

let loadError: unknown = null
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

/** 把未来的那一批装进来。失败不抛给调用方，留待 `ensureEventData` 重试。 */
async function loadFuture(): Promise<void> {
  try {
    const mod = await import('./future')
    futureHistorical = mod.futureHistoricalEvents
    futureTransition = mod.futureTransitionEvents
    merged = buildMerged()
    loadError = null
  } catch (err) {
    // 分片下载失败（断网、CDN 抖）不是致命错误：1628 那一年照旧能玩，
    // 到跨年那一刻由闸门再试一次。这里只记下来，别让 unhandled rejection 冒到控制台。
    loadError = err
    console.warn('[事件数据] 后续年份补齐失败，将在跨年时重试：', err)
  } finally {
    notify()
  }
}

/**
 * 「补齐」的 promise —— 引擎的跨年闸门与单测的 setup 都在等它。
 *
 * **不自动开跑**，这一点很关键：如果模块一被 import 就 `import('./future')`，
 * 那 1.2 MB 会和"第一张卡要的 1628 那一片"抢同一条带宽 ——
 * 首卡反而更慢。所以由引擎在自己把第一张牌发下去之后显式点火（`startEventDataLoad`）。
 */
let readyPromise: Promise<void> | null = null

/** 已经拿到后续年份了吗（失败或还在下都是 false） */
export function isEventDataReady(): boolean {
  return futureHistorical.length > 0 && futureTransition.length > 0 && loadError === null
}

/** 这一年的数据已经到位了吗 —— 跨年之前必须问这一句 */
export function eventDataCovers(year: number): boolean {
  if (year <= 1628) return true
  return isEventDataReady()
}

let inFlightRetry = false

/** 等数据到位；失败过的会再试一次（跨年那一刻的重试入口） */
export function ensureEventData(): Promise<void> {
  if (isEventDataReady()) return Promise.resolve()
  if (!readyPromise || loadError !== null) {
    // 还没开跑，或上一次失败了：重开一次。这一句是"跨年时重试"的唯一实现。
    if (!inFlightRetry) {
      inFlightRetry = true
      readyPromise = loadFuture().finally(() => {
        inFlightRetry = false
      })
    }
  }
  return readyPromise ?? Promise.resolve()
}

/**
 * 点火：让第二批事件开始下载。
 *
 * 由引擎在**第一张牌已经发到玩家手上之后**调用 —— 这样那 1.2 MB
 * 不会跟首卡抢带宽，也不会在标题屏/起名屏白下。
 */
export function startEventDataLoad(): void {
  void ensureEventData()
}


/**
 * 合并后的事件池。返回的是**同一份数组引用**，直到下一批数据到位才换成新数组 ——
 * 引擎的四个热路径（每月推进）不该每次调用都复制一遍 2000 项。
 */
export function getGameEvents(): GameEvent[] {
  return merged
}

/** 数据到位（或补齐失败）时回调一次；引擎用它触发重渲染，好让新事件进入候选池 */
export function subscribeEventData(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 单测 / 工具用：等它齐（不改变线上行为） */
export function whenEventDataReady(): Promise<void> {
  return ensureEventData()
}
