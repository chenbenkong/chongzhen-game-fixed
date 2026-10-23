import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import EndingCodex, { buildUnlockedTileIndex } from '../../src/components/EndingCodex'
import { allEndingEvents } from '../../src/data/events/ending'
import {
  buildDemotionEndingEvent,
  DEMOTION_ENDING_ID,
  EXILE_ENDING_ID
} from '../../src/data/events/ending/endingsDemotion'
import {
  endingAchievementIdOf,
  ENDING_ID_ALIASES,
  ENDING_TILE_IDS,
  resolveEndingTileId
} from '../../src/data/endingRegistry'
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
import { scanEndingCodex } from '../../scripts/audit-ending-codex'
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
 *   · 44 格里 10 格（全是边界/阈值结局）没有任何成就指向它们 —— 只能靠达成记录点亮；
 *   · 破产的成就判据要 `ending_bankrupt`，格子却叫 `triggerable_bankrupt` —— 达成过也永远灰；
 *   · 「罢黜归田」整条结局只内联存在于引擎，图鉴根本没这一格，成就却会点亮。
 * 三条都修了，这里负责让它们长不回来。
 *
 * 第五十二轮在此基础上再收一步：那 10 格补齐了成就，革职的两支拆成两格。
 * 于是"成就名"与"事件 id"第一次同时出现在十条边界结局上
 * （`ending_eunuch_frame_done` vs `triggerable_eunuch`），
 * 换算只许走 `data/endingRegistry` 那张表 —— 下面 `endingAchievementIdOf` 那组用例钉的就是这件事。
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
    expect(resolveEndingTileId(EXILE_ENDING_ID)).toBe(EXILE_ENDING_ID)
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

  /**
   * 别名表的内容必须**逐条钉住**，不能只钉"每条别名都对"。
   *
   * 后者是一条空转的断言：第十三轮漏掉的那些名字压根不在表里，循环自然全绿。
   * 成就要能点亮格子，靠的是 `ending_<成就名>_done` ↔ `triggerable_<事件名>` 这一行换算；
   * 少一行，那条成就就在成就面板里亮着、图鉴那格却永远是灰的 —— 又回到第十三条那个 bug。
   */
  it('别名表登记的正是"成就名 ≠ 事件名"的那十一格', () => {
    expect(Object.entries(ENDING_ID_ALIASES).sort()).toEqual(
      [
        ['ending_bankrupt', 'triggerable_bankrupt'],
        ['ending_death_illness', 'triggerable_death_illness'],
        ['ending_emperor_hate', 'triggerable_emperor_hate'],
        ['ending_eunuch_frame', 'triggerable_eunuch'],
        ['ending_faction_martyr', 'triggerable_faction_martyr'],
        ['ending_faction_sacrifice', 'triggerable_faction_sacrifice'],
        ['ending_gentry_rebellion', 'triggerable_gentry_rebellion'],
        ['ending_moral_isolation', 'triggerable_moral_degeneracy'],
        ['ending_popular_uproar', 'triggerable_popular_uproar'],
        ['ending_scholar_ostracism', 'triggerable_scholar_ostracism'],
        ['ending_tyrant_fall', 'triggerable_faction_tyrant_fall']
      ].sort()
    )
  })

  /**
   * 一条结局成就有**两个名字**指向同一格：id 砍掉 `_done` 是图鉴那边认的名字
   * （`buildUnlockedTileIndex` 走这条），判据里的 eventHistory id 是引擎真正写进
   * 履历的那个（体检脚本与成就解锁走这条）。两者必须换算到同一个格子。
   *
   * 破产是唯一"引擎会改名"的：成就名 `ending_bankrupt_done`、判据 `ending_bankrupt`、
   * 格子 `triggerable_bankrupt` —— 前两条相同、第三条不同；十格边界结局正好相反，
   * 成就名与判据不同名。所以这条比的是"两个名字各自 resolve 之后的落点"，不是字面相等。
   */
  it('每条别名的成就都真存在，且 id 与判据换算到同一格', () => {
    for (const [stem, tileId] of Object.entries(ENDING_ID_ALIASES)) {
      const ach = ALL_ACHIEVEMENTS.find(a => a.id === `${stem}_done`)
      expect(ach, `成就 ${stem}_done 不存在 —— 图鉴那格永远点不亮`).toBeTruthy()

      const literal = ach!.checkUnlock.toString().match(/includes\(\s*['"]([^'"]+)['"]\s*\)/)?.[1]
      expect(literal, `${ach!.id} 的判据不是 eventHistory.includes('...') 这种写法`).toBeTruthy()
      expect(resolveEndingTileId(literal as string), `${ach!.id} 的判据 '${literal}' 落不到格子上`).toBe(tileId)
    }
  })
})

/**
 * 第五十二轮：十格边界结局补上成就。
 *
 * 补之前的状态是"图鉴能亮、成就没有"，靠 `reachedEndings` 兜着；补之后多了一条
 * **名字对不上**的风险：边界结局的事件 id 是 `triggerable_*`，成就层的命名是 `ending_*_done`，
 * 而引擎当年直接拼 `${event.id}_done`，拼出来的 `triggerable_eunuch_done`
 * 在 ALL_ACHIEVEMENTS 里根本不存在 —— 于是"成就补了，却一条也不会亮"。
 * 下面三条把 判据 / 换算 / 解锁 三段一次钉住。
 */
const BOUNDARY_ENDING_ACHIEVEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['triggerable_death_illness', 'ending_death_illness_done'],
  ['triggerable_emperor_hate', 'ending_emperor_hate_done'],
  ['triggerable_eunuch', 'ending_eunuch_frame_done'],
  ['triggerable_scholar_ostracism', 'ending_scholar_ostracism_done'],
  ['triggerable_gentry_rebellion', 'ending_gentry_rebellion_done'],
  ['triggerable_popular_uproar', 'ending_popular_uproar_done'],
  ['triggerable_moral_degeneracy', 'ending_moral_isolation_done'],
  ['triggerable_faction_martyr', 'ending_faction_martyr_done'],
  ['triggerable_faction_tyrant_fall', 'ending_tyrant_fall_done'],
  ['triggerable_faction_sacrifice', 'ending_faction_sacrifice_done']
]

describe('第五十二轮：十格边界结局的成就真的会亮', () => {
  it('十格都在表里（不许悄悄漏一格）', () => {
    const stems = new Set(Object.keys(ENDING_ID_ALIASES))
    for (const [tileId, achId] of BOUNDARY_ENDING_ACHIEVEMENTS) {
      expect(ENDING_TILE_IDS, `${tileId} 不是图鉴格子`).toContain(tileId)
      expect(stems.has(achId.replace(/_done$/, '')), `${tileId} 没有别名`).toBe(true)
      expect(ALL_ACHIEVEMENTS.some(a => a.id === achId), `缺成就 ${achId}`).toBe(true)
    }
    expect(BOUNDARY_ENDING_ACHIEVEMENTS).toHaveLength(10)
  })

  it('引擎调用点拿到的成就是换算后的名字，不是拼出来的 triggerable_*_done', () => {
    for (const [tileId, achId] of BOUNDARY_ENDING_ACHIEVEMENTS) {
      setAchievementData(EMPTY)
      expect(endingAchievementIdOf(tileId), `${tileId} 换算错了`).toBe(achId)

      const { newlyUnlocked } = triggerEndingAchievements({ id: tileId, type: 'ending' } as GameEvent)
      // newlyUnlocked 里还会带上分类成就（normal_ending / completed_game 之类），所以只要求包含
      expect(newlyUnlocked, `${tileId} 没有解锁它自己那条成就`).toContain(achId)
      expect(loadAchievements().unlocked).toContain(achId)
      // 达成记录仍然要写：那是老存档唯一点得亮这一格的东西
      expect(getReachedEndings()).toHaveProperty(tileId)
    }
  })

  it('叙事结局的换算不许被顺手改掉（破产那格仍认引擎改名后的名字）', () => {
    expect(endingAchievementIdOf('ending_bankrupt')).toBe('ending_bankrupt_done')
    expect(endingAchievementIdOf('ending_city_fall')).toBe('ending_city_fall_done')
    expect(endingAchievementIdOf(DEMOTION_ENDING_ID)).toBe('ending_demotion_done')
    expect(endingAchievementIdOf(EXILE_ENDING_ID)).toBe('ending_exile_done')
  })
})

describe('革职结局搬进 data', () => {
  it('两支各有各的事件 id、各占一格图鉴，文案也各自独立', () => {
    const civilian = buildDemotionEndingEvent(false, '才疏学浅')
    const exiled = buildDemotionEndingEvent(true, '革职查办')

    expect(civilian.id).toBe(DEMOTION_ENDING_ID)
    expect(exiled.id).toBe(EXILE_ENDING_ID)
    expect(civilian.id).not.toBe(exiled.id)
    expect(civilian.title).toBe('革职为民')
    expect(exiled.title).toBe('流放边疆')
    expect(civilian.endingConfig?.tier).toBe('tragic')
    expect(exiled.endingConfig?.tier).toBe('dark')

    const echoOf = (e: GameEvent) => e.choices?.[0]?.result?.echo ?? ''
    expect(echoOf(civilian)).not.toBe(echoOf(exiled))
    expect(echoOf(civilian)).toContain('【结局·革职为民】')
    expect(echoOf(exiled)).toContain('【结局·流放边疆】')
  })

  it('两支各有一格，且四段文字都渲染得出来', () => {
    for (const [id, title] of [
      [DEMOTION_ENDING_ID, '罢黜归田'],
      [EXILE_ENDING_ID, '流放边疆']
    ] as const) {
      const tiles = (allEndingEvents as GameEvent[]).filter(e => e.id === id)
      expect(tiles, `${id} 在图鉴里应当恰好一条`).toHaveLength(1)

      const tile = tiles[0]
      expect(tile.title).toBe(title)
      for (const key of ['quote', 'background', 'situation'] as const) {
        expect((tile.narrative as any)?.[key], `${id} narrative.${key}`).toBeTruthy()
      }
      expect(tile.choices?.[0]?.result?.echo).toBeTruthy()
    }
  })

  it('它们只登记为结局格子，不在抽卡池里（否则会变成随机撞到的普通事件）', () => {
    // src/data/events/index.ts 有意不 import ./ending；这一条保证
    // "搬进 data"不等于"搬进了牌堆"。
    for (const id of [DEMOTION_ENDING_ID, EXILE_ENDING_ID]) {
      expect(labelOfPool(id)).toBe('ending')
      expect(initialEvents.some(e => e.id === id)).toBe(false)
      expect(allGrayChoiceEvents.some(e => e.id === id)).toBe(false)
    }
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

  it('补成就之前的老存档只有达成记录，那一格照样点亮', () => {
    // 边界结局的成就叫 ending_eunuch_frame_done；`triggerable_eunuch_done` 是引擎
    // 当年直接拼出来的名字，表里从来没有过，也不许有（第五十二轮起由换算函数负责）。
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

describe('达成记录与成就是两条独立的链', () => {
  it('触发边界结局：记录写格子 id，成就写换算出来的名字', () => {
    const event = { id: 'triggerable_eunuch', type: 'ending' } as GameEvent
    triggerEndingAchievements(event)

    expect(getReachedEndings()).toHaveProperty('triggerable_eunuch')
    expect(loadAchievements().unlocked).toContain('ending_eunuch_frame_done')
    expect(loadAchievements().unlocked).not.toContain('triggerable_eunuch_done')
  })

  it('破产写进记录时存的是换算后的格子 id，不是引擎改名后的 id', () => {
    triggerEndingAchievements({ id: 'ending_bankrupt', type: 'ending' } as GameEvent)

    expect(Object.keys(getReachedEndings())).toEqual(['triggerable_bankrupt'])
    expect(loadAchievements().unlocked).toContain('ending_bankrupt_done')
  })

  it('革职两支各点各的格、各解各的成就', () => {
    setAchievementData(EMPTY)
    triggerEndingAchievements(buildDemotionEndingEvent(false, '考功册上注不谨'))
    expect(Object.keys(getReachedEndings())).toEqual([DEMOTION_ENDING_ID])
    expect(loadAchievements().unlocked).toContain('ending_demotion_done')
    expect(loadAchievements().unlocked).not.toContain('ending_exile_done')

    setAchievementData(EMPTY)
    triggerEndingAchievements(buildDemotionEndingEvent(true, '革职查办'))
    expect(Object.keys(getReachedEndings())).toEqual([EXILE_ENDING_ID])
    expect(loadAchievements().unlocked).toContain('ending_exile_done')
    expect(loadAchievements().unlocked).not.toContain('ending_demotion_done')
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

  /**
   * 第五十二轮起"有格子无成就"不再是可登记的状态，所以那份名单删了，
   * 检查改成无条件：每一格都必须有一条成就判据指着它。
   *
   * 这里用**成就表**再数一遍，而不是只信 `scanEndingCodex()` 返回空 ——
   * 体检脚本与被检对象同方向出错时（比如判据写法机器读不出来），前者会安静地绿。
   */
  it('每一格都有结局成就指着，一格不漏', () => {
    const pointed = new Set<string>()
    for (const ach of ALL_ACHIEVEMENTS) {
      if (!(ach.id.startsWith('ending_') && ach.id.endsWith('_done'))) continue
      const m = ach.checkUnlock.toString().match(/includes\(\s*['"]([^'"]+)['"]\s*\)/)
      const tile = m ? resolveEndingTileId(m[1]) : null
      if (tile) pointed.add(tile)
    }
    const missing = ENDING_TILE_IDS.filter(id => !pointed.has(id))
    expect(missing, `这 ${missing.length} 格没有成就判据指向：${missing.join(', ')}`).toEqual([])
    expect(pointed.size).toBe(ENDING_TILE_IDS.length)
  })
})

/** 图鉴是 createPortal(node, document.body) 的，所以要从 body 里查，render 的 container 是空的 */
const openCodex = () =>
  render(createElement(EndingCodex, { isOpen: true, onClose: () => {} }), { baseElement: document.body })

const unlockedCountOf = () =>
  document.body.querySelector('.codex-progress-cur')?.textContent?.trim() ?? ''
const totalCountOf = () =>
  document.body.querySelector('.codex-progress-total')?.textContent?.trim() ?? ''

/**
 * 切到那一卷，再把那张卡片的 class 拿回来（`unlocked` / `locked` 就是玩家看见的亮与灰）。
 *
 * 第五十三轮之前这里是拿卡片上那行**印给玩家看的机器 id** 当把手的 ——
 * 那一行删掉之后把手换成 `data-tile-id`：测试与工具仍然按格子 id 找得到卡片，
 * 玩家的屏幕上却不再有 `triggerable_moral_degeneracy` 这种东西。
 */
const cardClassOf = (tileId: string) => {
  const tile = (allEndingEvents as GameEvent[]).find(e => e.id === tileId)
  if (!tile) throw new Error(`图鉴里没有这一格：${tileId}`)
  const label = ENDING_ARCHETYPES[tile.endingConfig?.category || 'special'].name
  const tab = [...document.body.querySelectorAll('.codex-tab')].find(el => el.textContent?.includes(label))
  if (!tab) throw new Error(`没有 ${label} 这个 tab`)
  fireEvent.click(tab)

  const card = [...document.body.querySelectorAll('.codex-card')].find(
    el => el.getAttribute('data-tile-id') === tileId
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

  it('补成就之前的老存档只靠达成记录也能亮起来', () => {
    openCodex()
    expect(cardClassOf('triggerable_eunuch')).toContain('locked')
    cleanup()

    recordEndingReached('triggerable_eunuch')
    openCodex()
    expect(cardClassOf('triggerable_eunuch')).toContain('unlocked')
    expect(unlockedCountOf()).toBe('1')
    expect(totalCountOf()).toBe(String(ENDING_TILE_IDS.length))
  })

  /**
   * 第五十二轮新加的这条走的是**成就**那条链，而且成就是 `ending_eunuch_frame_done`、
   * 格子是 `triggerable_eunuch` —— 名字对不上，只能靠 endingRegistry 换算。
   * 组件里的 useEffect 是唯一会用这条链的地方，所以必须在这里渲染一次真格子：
   * 补成就却不亮，正是第十三轮"两边各自以为名字当然对得上"的翻版。
   */
  it('边界结局的成就也能点亮它那一格（成就名与格子名不同名）', () => {
    unlockAchievement('ending_eunuch_frame_done')
    openCodex()
    expect(cardClassOf('triggerable_eunuch')).toContain('unlocked')
    expect(unlockedCountOf()).toBe('1')
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

  it('革职两支各亮各的格，不会互相顶掉', () => {
    openCodex()
    expect(cardClassOf(DEMOTION_ENDING_ID)).toContain('locked')
    expect(cardClassOf(EXILE_ENDING_ID)).toContain('locked')
    cleanup()

    triggerEndingAchievements(buildDemotionEndingEvent(true, '考功册上注不谨'))
    openCodex()
    expect(cardClassOf(EXILE_ENDING_ID)).toContain('unlocked')
    expect(cardClassOf(DEMOTION_ENDING_ID)).toContain('locked')
    expect(unlockedCountOf()).toBe('1')
    cleanup()

    setAchievementData(EMPTY)
    recordEndingReached(DEMOTION_ENDING_ID)
    openCodex()
    expect(cardClassOf(DEMOTION_ENDING_ID)).toContain('unlocked')
    expect(cardClassOf(EXILE_ENDING_ID)).toContain('locked')
  })

  it('什么都没达成时是 0，格子数就是图鉴的全部', () => {
    openCodex()
    expect(unlockedCountOf()).toBe('0')
    expect(totalCountOf()).toBe(String(ENDING_TILE_IDS.length))
  })
})

/**
 * 第五十二轮的**线上复核**量到的一处界面缺陷（§1.4 ㉝）：图鉴每张卡都在玩家眼前印一行机器 id
 * （`triggerable_moral_degeneracy` 这种淡金小字，`opacity:1`、`display:block`，不是隐藏的），
 * 点开详情还多一行 `ID: ending_exile`。第五十三轮把两处都收了，把手换成 `data-tile-id`。
 *
 * 这两条必须拿修复前的组件跑：那时 `.codex-card-id` 是文本节点、卡片正文里就带着 id，两条都红。
 */
describe('第五十三轮：图鉴不把机器 id 印给玩家', () => {
  afterEach(() => cleanup())

  it('卡片正文里没有格子 id，但每一格仍按 id 找得到', () => {
    openCodex()
    expect(document.body.querySelectorAll('.codex-card-id'), '那行淡金小字应整行消失').toHaveLength(0)

    const cards = [...document.body.querySelectorAll('.codex-card')]
    expect(cards.length, '当前这一卷本该有卡片').toBeGreaterThan(0)
    for (const card of cards) {
      const id = card.getAttribute('data-tile-id')
      expect(id, 'data-tile-id 这个把手不能少').toBeTruthy()
      expect(card.textContent, `卡片里不该出现 ${id}`).not.toContain(id as string)
    }
  })

  it('点开详情也不再印 id，那一行换成玩家看得懂的卷名', () => {
    openCodex()
    const tile = (allEndingEvents as GameEvent[]).find(e => e.id === EXILE_ENDING_ID)
    if (!tile) throw new Error(`图鉴里没有 ${EXILE_ENDING_ID}`)
    // 先借 cardClassOf 切到那一格所属的卷（图鉴一次只渲染当前卷），再来点它
    expect(cardClassOf(EXILE_ENDING_ID)).toContain('locked')
    const card = [...document.body.querySelectorAll('.codex-card')]
      .find(el => el.getAttribute('data-tile-id') === EXILE_ENDING_ID)
    if (!card) throw new Error('找不到流放边疆那一格')
    fireEvent.click(card)

    const modal = document.body.querySelector('.codex-detail-modal')
    expect(modal, '详情面板没打开').not.toBeNull()
    expect(modal!.textContent, '详情里不该再有机器 id').not.toMatch(/ending_|triggerable_/)
    expect(modal!.textContent).toContain(ENDING_ARCHETYPES[tile.endingConfig?.category || 'special'].name)
    expect(modal!.getAttribute('data-tile-id')).toBe(EXILE_ENDING_ID)
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

  /**
   * 实测会走到的结局，一局一个格子，互不重叠。
   *
   * 第十四轮（财帛可负担性整改之后）重扫过 60 个种子换的血：老那批 1/2/3/4/7
   * 已经不再经过破产结局了 —— 这条取样保证因此直接失败，而不是悄悄空跑，
   * 正是它设计出来要做的事。新组合覆盖 5 个互不相同的格子。
   *
   * 第十五轮又换了一次血：选项级门槛（出身／经历／官阶）与 `hasOpenChoice` 接上之后，
   * 抽样路径整体重排，上一批 1/3/5/14/16 里破产与革职都不再经过。
   * 这次是 70 个种子全扫一遍挑出来的（`random` 档，260 月上限）：
   *   1 乡绅反目 / 2 士绅反目 / 3 内廷 / 4 革职（从前内联在引擎里那格）/ 7 破产（被改名那格）。
   * 5 局 5 格，两个必须压住的口子各占一格。
   *
   * 第三十九轮再换一格：新增的「内廷门路」多消费一次 `Math.random()`，
   * 整条随机流后移，seed 7 落到了和 seed 1 同一格（乡绅反目），取样里不再有革职。
   * 100 个种子全扫（同一口径）挑出 seed 26 —— 它仍走革职那条线。
   *
   * 第五十二轮实测重抄（拆流放格之后，`npx vitest run` 同一批种子）：
   *   1 民怨沸腾 / 2 乡绅反目 / 3 宦官构陷 / 4 破产（被改名那格）/ 26 流放边疆（革职两支之一）。
   * 三条边界结局正好压在本轮补的那批成就上 —— 下面 `rawIds.filter(startsWith('triggerable_'))`
   * 那条就是拿这一行读数列的门槛。
   */
  const SEEDS = [1, 2, 3, 4, 26]

  it('引擎实际达成的每一局都在图鉴里有格子，且真的亮了', async () => {
    const outcomes = []
    for (const seed of SEEDS) outcomes.push(await simulateRun({ seed, policy: 'random', maxMonths: 260 }))

    for (const r of outcomes) {
      expect(`seed=${r.seed} ${r.error ?? ''}`).toBe(`seed=${r.seed} `)
      expect(r.ended, `seed=${r.seed} 应在时限内结束`).toBe(true)
      expect(r.endingId, `seed=${r.seed} 终点 ${r.endEventId} 必须落在已注册格子上`).not.toBeNull()
    }

    const rawTiles = outcomes.map(r => r.endingId as string)
    // 取样必须有**多样性**，否则下面"亮了几格"就退化成"亮了同一格五次"，
    // 对账再多做一次也没有意义。
    //
    // 这里从 `toBe(rawTiles.length)`（第五轮实测：5 局 5 格）放宽成 `>= 3`：
    // 第十四轮给中官／体质／士绅补上有代价的回升通道、并把月份冷却真正按月份算之后，
    // 同一批种子会更多地死在同一个格子上（5 局 3 格）。这是内容变动的**预期结果**，
    // 不是图鉴对账坏了 —— 所以门槛留着，只是不许再拿"某一局恰好走到某一格"当契约。
    const tiles = [...new Set(rawTiles)]
    expect(tiles.length, '取样里至少要有 3 个不同格子，否则"亮了几格"没法当计数用').toBeGreaterThanOrEqual(3)

    /**
     * 取样必须**恰好**压住这几轮修过的口子，否则这组用例只是"跑了几局没崩"：
     *   · `ending_bankrupt` —— 引擎会把它改名成 `triggerable_bankrupt`；
     *   · 革职两支之一 —— 以前只内联在引擎里，图鉴根本没这两格。
     * 少了这两条，换一批种子就可能悄悄不再经过它们。
     *
     * 第五十二轮把革职拆成两个 id 之后，走到哪一支由 `checkDemotion` 的 severity 决定，
     * 不归本用例控制，所以钉"两支里必然出现一支"，而不是钉某个具体分支名。
     */
    const rawIds = outcomes.map(r => r.endEventId as string)
    expect(rawIds, '取样里必须有被引擎改名过的破产').toContain('ending_bankrupt')
    expect(
      rawIds.filter(id => id === DEMOTION_ENDING_ID || id === EXILE_ENDING_ID),
      '取样里必须有从前内联在引擎里的那条革职结局（两支之一）'
    ).toHaveLength(1)

    // 引擎自己写的达成记录：达成的格子集合就是它，一个不多一个不少
    expect(Object.keys(getReachedEndings()).sort()).toEqual([...tiles].sort())

    /**
     * 撞到的每一格还得真的解掉**它自己那条**成就。
     *
     * 第五十二轮补的十成里，事件名与成就名不同名（`triggerable_eunuch` vs
     * `ending_eunuch_frame_done`），这条链只有走真引擎才量得到：
     * 换算写错时纯函数用例照样绿（我把名字抄对了就等于把 bug 抄掉了），
     * 玩家那边却是成就永远不亮。
     */
    const unlocked = loadAchievements().unlocked
    for (const rawId of rawIds) {
      expect(unlocked, `${rawId} 没有解锁它那条成就`).toContain(endingAchievementIdOf(rawId))
    }
    expect(unlocked.filter(id => id.startsWith('triggerable_')), '不许有拼出来的 triggerable_*_done').toEqual([])

    openCodex()
    for (const tile of tiles) expect(cardClassOf(tile)).toContain('unlocked')
    expect(unlockedCountOf()).toBe(String(tiles.length))
  }, 120_000)

  it('拼出来的 triggerable_*_done 一条也不许存在于成就表里', () => {
    // 边界结局的成就必须走 endingRegistry 的换算名，否则 `ending_*_done` 那套
    // 命名约定（图鉴、结局收藏、Steam 映射表都按它认）会漏掉这一批。
    for (const tile of ENDING_TILE_IDS.filter(id => id.startsWith('triggerable_'))) {
      expect(ALL_ACHIEVEMENTS.some(a => a.id === `${tile}_done`), tile).toBe(false)
    }
  })
})
