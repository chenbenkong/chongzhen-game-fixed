import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import EndingCodex, { buildUnlockedTileIndex } from '../../src/components/EndingCodex'
import { allEndingEvents } from '../../src/data/events/ending'
import { buildDemotionEndingEvent, DEMOTION_ENDING_ID } from '../../src/data/events/ending/endingsDemotion'
import { ENDING_ID_ALIASES, ENDING_TILE_IDS, resolveEndingTileId } from '../../src/data/endingRegistry'
import {
  ALL_ACHIEVEMENTS,
  getReachedEndings,
  loadAchievements,
  recordEndingReached,
  setAchievementData,
  unlockAchievement
} from '../../src/types/achievement'
import { ENDING_ARCHETYPES, triggerEndingAchievements } from '../../src/utils/endingSystem'
import { loadSaveSlot, saveSaveSlot } from '../../src/types/save'
import { KNOWN_TILES_WITHOUT_ACHIEVEMENT, scanEndingCodex } from '../../scripts/audit-ending-codex'
import { labelOfPool } from '../../scripts/event-pools'
import { allGrayChoiceEvents, initialEvents } from '../../src/data/events/index'
import { makeSaveData } from './helpers/gameEngine'
import { simulateRun } from './helpers/simulate'
import type { GameEvent } from '../../src/types/event'

/**
 * 结局图鉴 / 结局成就 / 事件 id 三方对账。
 *
 * 这一组用例守的是一件**坏了不会报错**的事。此前图鉴读"哪些格子点亮"的方式，
 * 是把成就 id 砍掉 `_done` 直接当事件 id；成就判据自己硬写字符串；引擎还会在
 * 触发破产时改名。三条链没有一处放在一起比过，于是实测出：
 *   · 44 格里 10 格（全是边界/阈值结局）没有任何成就指向它们 —— 永远灰；
 *   · 破产的成就判据要 `ending_bankrupt`，格子却叫 `triggerable_bankrupt` —— 达成过也永远灰；
 *   · 「罢黜归田」整条结局只内联存在于引擎，图鉴根本没这一格，成就却会点亮。
 * 三条都修了，这里负责让它们长不回来。
 */
const EMPTY = { unlocked: [], unlockTimes: {} }

beforeEach(() => {
  setAchievementData(EMPTY)
})

describe('id 对账表（data/endingRegistry）', () => {
  it('改名过的破产 id 能换算回图鉴格子', () => {
    expect(resolveEndingTileId('ending_bankrupt')).toBe('triggerable_bankrupt')
  })

  it('注册 id 与内联结局 id 原样命中自己的格子', () => {
    expect(resolveEndingTileId('triggerable_eunuch')).toBe('triggerable_eunuch')
    expect(resolveEndingTileId(DEMOTION_ENDING_ID)).toBe(DEMOTION_ENDING_ID)
  })

  it('不是结局的名字一律解析不到，而不是"猜一个接近的"', () => {
    expect(resolveEndingTileId('historical_014')).toBeNull()
    expect(resolveEndingTileId('')).toBeNull()
  })

  it('每条别名都指向真实格子', () => {
    for (const [from, to] of Object.entries(ENDING_ID_ALIASES)) {
      expect(ENDING_TILE_IDS, `别名 ${from} 指向的 ${to}`).toContain(to)
    }
  })
})

describe('革职结局搬进 data', () => {
  it('两支共用同一个事件 id，因此共用同一格图鉴；文案各自独立', () => {
    const civilian = buildDemotionEndingEvent(false, '才疏学浅')
    const exiled = buildDemotionEndingEvent(true, '革职查办')

    expect(civilian.id).toBe(DEMOTION_ENDING_ID)
    expect(exiled.id).toBe(DEMOTION_ENDING_ID)
    expect(civilian.title).toBe('革职为民')
    expect(exiled.title).toBe('流放边疆')
    expect(civilian.endingConfig?.tier).toBe('tragic')
    expect(exiled.endingConfig?.tier).toBe('dark')

    const echoOf = (e: GameEvent) => e.choices?.[0]?.result?.echo ?? ''
    expect(echoOf(civilian)).not.toBe(echoOf(exiled))
    expect(echoOf(civilian)).toContain('【结局·革职为民】')
    expect(echoOf(exiled)).toContain('【结局·流放边疆】')
  })

  it('图鉴里这一格恰好一条，且四段文字都渲染得出来', () => {
    const tiles = (allEndingEvents as GameEvent[]).filter(e => e.id === DEMOTION_ENDING_ID)
    expect(tiles).toHaveLength(1)

    const tile = tiles[0]
    expect(tile.title).toBe('罢黜归田')
    for (const key of ['quote', 'background', 'situation'] as const) {
      expect((tile.narrative as any)?.[key], `narrative.${key}`).toBeTruthy()
    }
    expect(tile.choices?.[0]?.result?.echo).toBeTruthy()
  })

  it('它只登记为结局格子，不在抽卡池里（否则会变成随机撞到的普通事件）', () => {
    // src/data/events/index.ts 有意不 import ./ending；这一条保证
    // "搬进 data"不等于"搬进了牌堆"。
    expect(labelOfPool(DEMOTION_ENDING_ID)).toBe('ending')
    expect(initialEvents.some(e => e.id === DEMOTION_ENDING_ID)).toBe(false)
    expect(allGrayChoiceEvents.some(e => e.id === DEMOTION_ENDING_ID)).toBe(false)
  })
})

describe('图鉴点亮口径（两个数据源缺一不可）', () => {
  it('只有成就、没有达成记录的老存档：改名过的破产也照样点亮', () => {
    const { tileIds, times } = buildUnlockedTileIndex(
      [{ id: 'ending_bankrupt_done', unlockTime: 't1' }],
      {}
    )
    expect([...tileIds]).toEqual(['triggerable_bankrupt'])
    expect(times.triggerable_bankrupt).toBe('t1')
  })

  it('没有成就的边界结局靠达成记录点亮', () => {
    expect(ALL_ACHIEVEMENTS.some(a => a.id === 'triggerable_eunuch_done')).toBe(false)

    const { tileIds, times } = buildUnlockedTileIndex([], { triggerable_eunuch: 't2' })
    expect([...tileIds]).toEqual(['triggerable_eunuch'])
    expect(times.triggerable_eunuch).toBe('t2')
  })

  it('认不出的名字与无关成就都不算点亮', () => {
    const { tileIds } = buildUnlockedTileIndex(
      [{ id: 'collector' }, { id: 'ending_不存在的结局_done' }],
      { 不存在的格子: 't' }
    )
    expect(tileIds.size).toBe(0)
  })

  it('成就时间戳优先于达成记录（成就那份是玩家看得见的那份）', () => {
    const { times } = buildUnlockedTileIndex(
      [{ id: 'ending_demotion_done', unlockTime: '成就时间' }],
      { ending_demotion: '达成记录时间' }
    )
    expect(times.ending_demotion).toBe('成就时间')
  })
})

describe('达成记录与成就解耦', () => {
  it('触发一个"没有成就"的边界结局：记录写了，成就表没被凭空造出来', () => {
    const event = { id: 'triggerable_eunuch', type: 'ending' } as GameEvent
    triggerEndingAchievements(event)

    expect(getReachedEndings()).toHaveProperty('triggerable_eunuch')
    expect(loadAchievements().unlocked).not.toContain('triggerable_eunuch_done')
  })

  it('破产写进记录时存的是换算后的格子 id，不是引擎改名后的 id', () => {
    triggerEndingAchievements({ id: 'ending_bankrupt', type: 'ending' } as GameEvent)

    expect(Object.keys(getReachedEndings())).toEqual(['triggerable_bankrupt'])
    expect(loadAchievements().unlocked).toContain('ending_bankrupt_done')
  })

  it('革职两支都点亮同一格', () => {
    for (const exiled of [false, true]) {
      setAchievementData(EMPTY)
      triggerEndingAchievements(buildDemotionEndingEvent(exiled, '考功册上注不谨'))
      expect(getReachedEndings()).toHaveProperty(DEMOTION_ENDING_ID)
      expect(loadAchievements().unlocked).toContain('ending_demotion_done')
    }
  })

  it('只记首次达成，重复触发不覆盖时间戳', () => {
    setAchievementData({ unlocked: [], unlockTimes: {}, reachedEndings: { triggerable_eunuch: '很久以前' } })
    triggerEndingAchievements({ id: 'triggerable_eunuch', type: 'ending' } as GameEvent)
    expect(getReachedEndings().triggerable_eunuch).toBe('很久以前')
  })
})

describe('体检脚本', () => {
  it('三方对账干净', () => {
    expect(scanEndingCodex()).toEqual([])
  })

  it('"有格子无成就"那份名单里的格子确实存在，且数量就是实测的 10', () => {
    expect(KNOWN_TILES_WITHOUT_ACHIEVEMENT).toHaveLength(10)
    for (const id of KNOWN_TILES_WITHOUT_ACHIEVEMENT) {
      expect(ENDING_TILE_IDS, id).toContain(id)
    }
  })
})

/** 图鉴是 createPortal(node, document.body) 的，所以要从 body 里查，render 的 container 是空的 */
const openCodex = () =>
  render(createElement(EndingCodex, { isOpen: true, onClose: () => {} }), { baseElement: document.body })

const unlockedCountOf = () =>
  document.body.querySelector('.codex-progress-cur')?.textContent?.trim() ?? ''
const totalCountOf = () =>
  document.body.querySelector('.codex-progress-total')?.textContent?.trim() ?? ''

/** 切到那一卷，再把那张卡片的 class 拿回来（`unlocked` / `locked` 就是玩家看见的亮与灰） */
const cardClassOf = (tileId: string) => {
  const tile = (allEndingEvents as GameEvent[]).find(e => e.id === tileId)
  if (!tile) throw new Error(`图鉴里没有这一格：${tileId}`)
  const label = ENDING_ARCHETYPES[tile.endingConfig?.category || 'special'].name
  const tab = [...document.body.querySelectorAll('.codex-tab')].find(el => el.textContent?.includes(label))
  if (!tab) throw new Error(`没有 ${label} 这个 tab`)
  fireEvent.click(tab)

  const card = [...document.body.querySelectorAll('.codex-card')].find(
    el => el.querySelector('.codex-card-id')?.textContent?.trim() === tileId
  )
  if (!card) throw new Error(`${label} 里找不到卡片 ${tileId}`)
  return card.className
}

/**
 * 直接渲染真组件。上面那些纯函数用例证明"口径是对的"，这一组证明
 * **组件真的用了这个口径** —— 第十三轮之前推导就写在 useEffect 里，
 * 猜错名字时界面只是安静地少亮一格，没有任何东西会红。
 */
describe('真组件：一格到底会不会亮', () => {
  afterEach(() => cleanup())

  it('没有成就的边界结局，只靠达成记录也能亮起来', () => {
    openCodex()
    expect(cardClassOf('triggerable_eunuch')).toContain('locked')
    cleanup()

    recordEndingReached('triggerable_eunuch')
    openCodex()
    expect(cardClassOf('triggerable_eunuch')).toContain('unlocked')
    expect(unlockedCountOf()).toBe('1')
    expect(totalCountOf()).toBe(String(ENDING_TILE_IDS.length))
  })

  it('改名过的破产：点亮的是那一格，不是凭空多一格', () => {
    unlockAchievement('ending_bankrupt_done')
    openCodex()
    expect(cardClassOf('triggerable_bankrupt')).toContain('unlocked')
    expect(unlockedCountOf()).toBe('1')
  })

  it('两条链都指同一格时不重复计数', () => {
    unlockAchievement('ending_bankrupt_done')
    recordEndingReached('triggerable_bankrupt')
    openCodex()
    expect(unlockedCountOf()).toBe('1')
  })

  it('革职那格现在存在，而且会亮（此前它根本不在图鉴里）', () => {
    openCodex()
    expect(cardClassOf(DEMOTION_ENDING_ID)).toContain('locked')
    cleanup()

    triggerEndingAchievements(buildDemotionEndingEvent(true, '考功册上注不谨'))
    openCodex()
    expect(cardClassOf(DEMOTION_ENDING_ID)).toContain('unlocked')
  })

  it('什么都没达成时是 0，格子数就是图鉴的全部', () => {
    openCodex()
    expect(unlockedCountOf()).toBe('0')
    expect(totalCountOf()).toBe(String(ENDING_TILE_IDS.length))
  })
})

/**
 * 达成记录要活得过存档：`useGameEngine` 把 `loadAchievements()` 整个塞进 SaveData，
 * 读档时 App.tsx 再塞回模块状态。这一组走的是真 localStorage 往返。
 */
describe('存档往返：达成记录必须活得过 JSON', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('写盘再读回来，格子 id 与时间戳都还在，读档后图鉴照样点亮', () => {
    setAchievementData(EMPTY)
    triggerEndingAchievements({ id: 'triggerable_eunuch', type: 'ending' } as GameEvent)

    expect(saveSaveSlot(7, makeSaveData({ achievements: loadAchievements() }))).toBe(true)

    const back = loadSaveSlot(7)
    expect(back?.achievements?.reachedEndings).toEqual({ triggerable_eunuch: expect.any(String) })

    setAchievementData(back!.achievements!)
    openCodex()
    expect(cardClassOf('triggerable_eunuch')).toContain('unlocked')
  })

  it('旧存档完全没有这个字段：不报错，也不影响已经点亮的结局成就', () => {
    const legacy = { unlocked: ['ending_bankrupt_done'], unlockTimes: { ending_bankrupt_done: '很久以前' } }
    expect(saveSaveSlot(8, makeSaveData({ achievements: legacy }))).toBe(true)

    setAchievementData(loadSaveSlot(8)!.achievements!)

    expect(getReachedEndings()).toEqual({})
    openCodex()
    expect(cardClassOf('triggerable_bankrupt')).toContain('unlocked')
    expect(unlockedCountOf()).toBe('1')
  })
})

/**
 * 上面所有用例都是"喂好数据再往下看"。这一条把中间那段换成真引擎：
 * `handleChoice` 一路打到 `handleGameOver`，让引擎自己去改名、自己去调
 * `triggerEndingAchievements`，再回头看图鉴。
 *
 * 之所以非要走这一趟：第十二轮那个「图鉴查不到的结局」就是从这里漏出去的 ——
 * 纯函数用例里我把 id 抄对了，就等于把 bug 抄掉了；只有真引擎的 id 能证明
 * 对账表接在了正确的调用点上。种子是实测固定的（8 局 0.8 秒），
 * 换成别的种子会测到不同结局，那条"改名过的破产也能亮"就未必被覆盖。
 */
describe('真引擎跑完一局：从 handleChoice 到格子亮', () => {
  afterEach(() => cleanup())

  /** 实测会走到的结局，一局一个格子，互不重叠 */
  const SEEDS = [1, 2, 3, 4, 7]

  it('引擎实际达成的每一局都在图鉴里有格子，且真的亮了', async () => {
    const outcomes = []
    for (const seed of SEEDS) outcomes.push(await simulateRun({ seed, policy: 'random', maxMonths: 260 }))

    for (const r of outcomes) {
      expect(`seed=${r.seed} ${r.error ?? ''}`).toBe(`seed=${r.seed} `)
      expect(r.ended, `seed=${r.seed} 应在时限内结束`).toBe(true)
      expect(r.endingId, `seed=${r.seed} 终点 ${r.endEventId} 必须落在已注册格子上`).not.toBeNull()
    }

    const tiles = outcomes.map(r => r.endingId as string)
    expect(new Set(tiles).size, '取样里每局应走到不同格子，否则下面"亮了几格"没法当计数用').toBe(tiles.length)

    /**
     * 取样必须**恰好**压住这一轮修的两个口子，否则这组用例只是"跑了几局没崩"：
     *   · `ending_bankrupt` —— 引擎会把它改名成 `triggerable_bankrupt`；
     *   · `ending_demotion` —— 以前只内联在引擎里，图鉴根本没这一格。
     * 少了这两条，换一批种子就可能悄悄不再经过它们。
     */
    const rawIds = outcomes.map(r => r.endEventId)
    expect(rawIds, '取样里必须有被引擎改名过的破产').toContain('ending_bankrupt')
    expect(rawIds, '取样里必须有从前内联在引擎里的革职结局').toContain(DEMOTION_ENDING_ID)

    // 引擎自己写的达成记录：达成的格子集合就是它，一个不多一个不少
    expect(Object.keys(getReachedEndings()).sort()).toEqual([...tiles].sort())

    openCodex()
    for (const tile of tiles) expect(cardClassOf(tile)).toContain('unlocked')
    expect(unlockedCountOf()).toBe(String(tiles.length))
  }, 120_000)

  it('靠真引擎达成的边界结局，不会因此凭空多出成就', () => {
    // 图鉴能亮、成就表里却没有对应条目 —— 这正是"记录与成就解耦"的定义
    for (const tile of KNOWN_TILES_WITHOUT_ACHIEVEMENT) {
      expect(ALL_ACHIEVEMENTS.some(a => a.id === `${tile}_done`), tile).toBe(false)
    }
  })
})
