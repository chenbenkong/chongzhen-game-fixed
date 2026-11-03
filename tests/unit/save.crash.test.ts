import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeAttributes, ATTRIBUTE_DEFAULTS } from '../../src/types/game'
import { loadAutosave, migrateSaveForTest, SAVE_SCHEMA_VERSION } from '../../src/types/save'

/**
 * 读档白屏的回归防线。
 *
 * 实测（真实 Chromium + 畸形存档模糊测试）发现的崩溃：
 *   character 存在但**整个 attributes 缺失**时，读档后渲染第一帧就抛
 *     TypeError: Cannot read properties of undefined (reading '理政')
 *   抛在 AttributePanel —— 它是直接下标访问 `attributes.理政` 的。
 *   整个游戏被 ErrorBoundary 接管，玩家看到的是崩溃界面。
 *
 * 为什么以前没被发现：`migrateSave` 为**每一个**字段都做了兜底
 *（flags / faction / difficulty / stats / hidden …），唯独漏了 `attributes`。
 * 于是"缺 character 或 gameState 才拒绝"的那道校验放行了这份存档，
 * 崩溃点被推迟到渲染期 —— 最难排查的那种白屏。
 *
 * 还有第二条独立路径：游戏内存档面板的「继续上次游戏」曾经自己
 * `JSON.parse` 而**绕过 migrateSave**，所以同一个存档从标题屏读没事、
 * 从游戏内读就崩。现已收敛到统一的 loadAutosave()。
 */

const VALID_CHAR = {
  name: '测试',
  courtesyName: '',
  hometown: '苏州',
  origin: '寒门',
  age: 22,
  degree: '进士',
  rank: '从七品·判官',
  attributes: { 财帛: 15, 文韬: 65, 理政: 30, 武略: 20, 体质: 60 },
  flags: []
}
const VALID_STATE = {
  turn: 5,
  currentYear: 1629,
  currentMonth: 3,
  国势: 75,
  圣眷: 20,
  中官: 20,
  清议: 25,
  士绅: 15,
  民望: 30
}

describe('normalizeAttributes：个人能力规整', () => {
  it('undefined 时返回完整默认值', () => {
    expect(normalizeAttributes(undefined)).toEqual(ATTRIBUTE_DEFAULTS)
  })

  it('null 时返回完整默认值', () => {
    expect(normalizeAttributes(null as never)).toEqual(ATTRIBUTE_DEFAULTS)
  })

  it('缺单个键时用默认值补齐（这正是崩溃的那个字段）', () => {
    const out = normalizeAttributes({ 财帛: 10, 文韬: 10, 武略: 10, 体质: 10 } as never)
    expect(out.理政).toBe(ATTRIBUTE_DEFAULTS.理政)
    expect(out.财帛).toBe(10)
  })

  it('NaN 被 JSON 序列化成 null —— 当成缺失而不是当 0 处理', () => {
    const out = normalizeAttributes({ 财帛: null, 文韬: null } as never)
    expect(out.财帛).toBe(ATTRIBUTE_DEFAULTS.财帛)
    expect(Number.isNaN(out.文韬)).toBe(false)
  })

  it('越界值被夹到 0-100 并取整', () => {
    const out = normalizeAttributes({ 财帛: -50, 文韬: 999, 理政: 30.7 } as never)
    expect(out.财帛).toBe(0)
    expect(out.文韬).toBe(100)
    expect(out.理政).toBe(31)
  })

  it('结果里不含 NaN（NaN 会污染存档并让条件判定前后矛盾）', () => {
    const out = normalizeAttributes({ 财帛: NaN, 文韬: Infinity } as never)
    for (const v of Object.values(out)) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('migrateSave：畸形存档必须被安全拒绝或修复', () => {
  it('character 缺 attributes 时补齐（回归：曾经在此白屏）', () => {
    const out = migrateSaveForTest({ character: { ...VALID_CHAR, attributes: undefined }, gameState: VALID_STATE })
    expect(out).not.toBeNull()
    expect(Number.isFinite(out!.character.attributes.理政)).toBe(true)
    expect(Number.isFinite(out!.character.attributes.财帛)).toBe(true)
  })

  it('character 是字符串时干净拒绝，而不是抛 TypeError', () => {
    // 原实现只判 `!raw.character`，于是 character='x' 会走进
    // `raw.character.hidden = ...` 抛 "Cannot create property 'hidden' on string"
    expect(migrateSaveForTest({ character: 'not an object', gameState: VALID_STATE })).toBeNull()
  })

  it('gameState 是字符串时干净拒绝', () => {
    expect(migrateSaveForTest({ character: VALID_CHAR, gameState: 'not an object' })).toBeNull()
  })

  it('数组被拒绝', () => {
    expect(migrateSaveForTest([1, 2, 3])).toBeNull()
    expect(migrateSaveForTest({ character: [], gameState: VALID_STATE })).toBeNull()
  })

  it('缺 character / gameState 时拒绝', () => {
    expect(migrateSaveForTest({})).toBeNull()
    expect(migrateSaveForTest({ character: VALID_CHAR })).toBeNull()
    expect(migrateSaveForTest({ gameState: VALID_STATE })).toBeNull()
  })

  it('正常存档通过且版本号被提升', () => {
    const out = migrateSaveForTest({ character: VALID_CHAR, gameState: VALID_STATE })
    expect(out).not.toBeNull()
    expect(out!.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
  })

  it('旧存档缺的字段一律补齐（回归：读档后各处下标访问）', () => {
    const out = migrateSaveForTest({
      character: { name: '旧档', age: 22 },
      gameState: { currentYear: 1629, currentMonth: 3 }
    })
    expect(out).not.toBeNull()
    const c = out!.character
    expect(Array.isArray(c.flags)).toBe(true)
    expect(Array.isArray(c.history)).toBe(true)
    expect(Array.isArray(c.wives)).toBe(true)
    expect(Array.isArray(c.lovers)).toBe(true)
    expect(Array.isArray(c.examHistory)).toBe(true)
    expect(typeof c.promotionCount).toBe('number')
    expect(typeof c.demotionCount).toBe('number')
    expect(c.faction).toBeTruthy()
    // 关键：属性也必须在
    for (const v of Object.values(c.attributes)) expect(Number.isFinite(v)).toBe(true)
    for (const v of Object.values(c.hidden)) expect(Number.isFinite(v)).toBe(true)
  })
})

/**
 * 第七十七轮：读档稳定性的数值面。
 *
 * 这些字段此前只做了「有没有」的检查，没做「是不是数」的检查：
 *   · JSON 里 NaN 会变成 null，而 `Number(null) === 0` —— 五方态度被静默改成 0；
 *   · currentYear / currentMonth / turn 原样透传：turn 是字符串时每月 `'5' + 1` 变成 '51'，
 *     月份是 99 时界面直接显示「九月九」之外的怪月份，年份是 null 时自动存档
 *     因为 `currentYear < 1628` 直接 return —— 整局从此不再落盘；
 *   · 空 choices 的事件被当成正常卡恢复，玩家看到一张点不动的死卡；
 *   · age 是字符串时 `+ skippedMonths/12` 变成 '221.08'，升贬次数是 NaN 时成就全乱。
 */
describe('第七十七轮：migrateSave 必须把核心数值规整成有限数', () => {
  it('currentYear / currentMonth / turn 被规整（null 年份、越界月份、字符串 turn）', () => {
    const out = migrateSaveForTest({
      character: VALID_CHAR,
      gameState: {
        ...VALID_STATE,
        currentYear: null,
        currentMonth: 99,
        turn: '5'
      }
    })
    expect(out).not.toBeNull()
    expect(out!.gameState.currentYear).toBe(1628)
    expect(out!.gameState.currentMonth).toBe(12)
    expect(out!.gameState.turn).toBe(5)
  })

  it('五方态度与国势遇到 null/字符串时回到默认值，而不是被 Number(null) 变成 0', () => {
    const out = migrateSaveForTest({
      character: VALID_CHAR,
      gameState: {
        ...VALID_STATE,
        圣眷: null,
        中官: 'abc',
        清议: null,
        士绅: null,
        民望: null,
        国势: null
      }
    })
    expect(out).not.toBeNull()
    const gs = out!.gameState
    expect(gs.圣眷).toBe(50)
    expect(gs.中官).toBe(50)
    expect(gs.清议).toBe(50)
    expect(gs.士绅).toBe(50)
    expect(gs.民望).toBe(50)
    expect(gs.国势).toBe(75)
    for (const v of Object.values(gs)) expect(Number.isFinite(v)).toBe(true)
  })

  it('choices 为空或全不可用的事件不被恢复成「进行中」（否则读档即死卡）', () => {
    const broken = {
      id: 'broken_event',
      title: '坏卡',
      description: '这张卡没有任何可渲染的选项。',
      conditions: {},
      type: 'normal',
      choices: []
    }
    const out = migrateSaveForTest({
      character: VALID_CHAR,
      gameState: VALID_STATE,
      currentEvent: broken,
      currentEventId: 'broken_event',
      pendingEvents: [
        broken,
        {
          id: 'good_event',
          title: '好卡',
          description: '至少有一个选项。',
          conditions: {},
          type: 'normal',
          choices: [{ id: 'c1', text: '继续', effects: {}, result: { title: '继续', tags: [], echo: '' } }]
        }
      ]
    })
    expect(out).not.toBeNull()
    expect(out!.currentEvent ?? null).toBeNull()
    expect(out!.currentEventId ?? null).toBeNull()
    expect(out!.pendingEvents!.map(e => e.id)).toEqual(['good_event'])
  })

  it('character.age 与升贬次数被规整成有限数（字符串 / null 不再污染增龄与成就）', () => {
    const out = migrateSaveForTest({
      character: {
        ...VALID_CHAR,
        age: '22',
        promotionCount: '3',
        demotionCount: null
      },
      gameState: VALID_STATE
    })
    expect(out).not.toBeNull()
    expect(out!.character.age).toBe(22)
    expect(out!.character.promotionCount).toBe(3)
    expect(out!.character.demotionCount).toBe(0)
    expect(Number.isFinite(out!.character.age)).toBe(true)
  })

  it('lifeRecords 里的 null / 字符串条目被丢弃（否则一进游戏就在筛选履历时崩）', () => {
    // pickKeyLifeRecords 直接读 r.type；generateLifeSummary 在 GameScreen 每次渲染都调用它，
    // 所以 null 条目不是"打开生平才崩"，而是读档进游戏的第一帧就崩。
    const out = migrateSaveForTest({
      character: VALID_CHAR,
      gameState: VALID_STATE,
      lifeRecords: [null, 'oops', 42, { id: 'r1', year: 1628, month: 1, type: 'choice', title: '上任', description: '到任' }]
    })
    expect(out).not.toBeNull()
    expect(out!.lifeRecords).toHaveLength(1)
    expect((out!.lifeRecords[0] as unknown as Record<string, unknown>).id).toBe('r1')
  })

  it('角色姓名的字符串字段不许是对象（否则 React 渲染直接抛 "Objects are not valid as a React child"）', () => {
    const out = migrateSaveForTest({
      character: {
        ...VALID_CHAR,
        name: { bad: true },
        courtesyName: 42,
        hometown: null,
        rank: [],
        degree: {}
      },
      gameState: VALID_STATE
    })
    expect(out).not.toBeNull()
    expect(typeof out!.character.name).toBe('string')
    expect(out!.character.name).toBe('')
    expect(out!.character.courtesyName).toBe('')
    expect(out!.character.hometown).toBe('')
    expect(out!.character.rank).toBe('')
    expect(out!.character.degree).toBe('')
  })
})

describe('loadAutosave：坏存档不抛且不上抛', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('不存在时返回 null', () => {
    expect(loadAutosave()).toBeNull()
  })

  it('非法 JSON 返回 null 而不是抛出', () => {
    localStorage.setItem('chongzhen_autosave', '{"character":{"name":"x"')
    expect(() => loadAutosave()).not.toThrow()
    expect(loadAutosave()).toBeNull()
  })

  it('纯乱码返回 null', () => {
    localStorage.setItem('chongzhen_autosave', 'not json at all')
    expect(loadAutosave()).toBeNull()
  })

  it('缺 attributes 的旧存档能被修复并正常返回（回归：曾经白屏）', () => {
    localStorage.setItem(
      'chongzhen_autosave',
      JSON.stringify({ character: { name: '旧档', age: 22 }, gameState: { currentYear: 1629, currentMonth: 3 } })
    )
    const data = loadAutosave()
    expect(data).not.toBeNull()
    expect(Number.isFinite(data!.character.attributes.理政)).toBe(true)
  })
})