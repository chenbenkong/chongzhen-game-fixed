import { describe, expect, it } from 'vitest'
import { ATTR_MAP, STATE_MAP } from '../../src/utils/constants'
import { Attributes, GameStateValues, HiddenAttributes, HIDDEN_DEFAULTS } from '../../src/types/game'
import type {
  AttributeKey, StateKey, HiddenKey,
  LegacyAttributes, LegacyAttributeConditions, LegacyGameStateConditions
} from '../../src/types/event'
import type { EventChoice } from '../../src/types/event'
import type { EventConditions, EventEffects, GameEvent, NarrativeSpeaker } from '../../src/types/event'

/**
 * 事件数据键名的两道机器守卫。
 *
 * 第一道：类型声明 vs 引擎真值 对账。
 *   `src/types/event.ts` 里的 AttributeKey / StateKey / HiddenKey 是手写的字面量联合，
 *   而引擎真正认得哪些键由 utils/constants.ts 的 ATTR_MAP / STATE_MAP 与
 *   types/game.ts 的 HIDDEN_DEFAULTS 决定。两边漂移的两种后果都不好受：
 *     类型比引擎宽 → 错键名照样编译通过，变成第七轮那种"死事件"；
 *     类型比引擎窄 → 合法写法被拦，只能 as any 绕过去，绕过去就再没人查。
 *
 * 第二道：下面那批 `@ts-expect-error`。它们断言的是"这些写法必须报错"，
 *   而 tsc 对**没有生效的** @ts-expect-error 会报 "Unused '@ts-expect-error' directive"。
 *   所以一旦有人把 Legacy* 类型放宽回去（第七轮之前它们确实很宽），
 *   `npm run typecheck:test` 立刻红 —— 这一条不需要真的跑测试就能生效。
 */

// `as const` 而不是 `.sort()`：下面既要用它做运行时对账（需要数组），
// 又要用它做类型层面的闭合检查（需要字面量元组）。先排好序会把它退化成 string[]，
// 类型那一半就检查不到任何东西了。
const attrKeys = ['财帛', '文韬', '理政', '武略', '体质', '文辩', '朝政', '权势', '机敏', '道德'] as const
const stateKeys = [
  '圣眷', '中官', '清议', '士绅', '民望', '国势',
  '帝心', '派系立场', '百姓口碑', '商贾', '安全', '军事', '道德', '文化', '军心'
] as const
const hiddenKeys = ['道德值', '欲望值', '野心值', '机敏值', '忠诚值'] as const
const sorted = (a: readonly string[]) => [...a].sort()

describe('类型声明的键集合 == 引擎真正解析的键集合', () => {
  it('AttributeKey == ATTR_MAP 的键', () => {
    expect(sorted(attrKeys)).toEqual(Object.keys(ATTR_MAP).sort())
  })

  it('StateKey == STATE_MAP 的键', () => {
    expect(sorted(stateKeys)).toEqual(Object.keys(STATE_MAP).sort())
  })

  it('HiddenKey == HIDDEN_DEFAULTS 的键', () => {
    expect(sorted(hiddenKeys)).toEqual(Object.keys(HIDDEN_DEFAULTS).sort())
  })

  it('STATE_MAP 不认时间键：currentYear / currentMonth / turn 属于 cond.year / month / turn', () => {
    for (const k of ['currentYear', 'currentMonth', 'turn']) {
      expect(STATE_MAP[k], `${k} 不该出现在 STATE_MAP 里`).toBeUndefined()
    }
  })

  it('每个 STATE_MAP / ATTR_MAP 的值都落在真实字段上', () => {
    const stateSample: GameStateValues = {
      currentYear: 1630, currentMonth: 1, turn: 0,
      圣眷: 1, 中官: 2, 清议: 3, 士绅: 4, 民望: 5, 国势: 6
    }
    const attrSample: Attributes = { 财帛: 1, 文韬: 2, 理政: 3, 武略: 4, 体质: 5 }
    for (const [alias, real] of Object.entries(STATE_MAP)) {
      expect(typeof stateSample[real], `STATE_MAP['${alias}'] → ${String(real)}`).toBe('number')
    }
    for (const [alias, real] of Object.entries(ATTR_MAP)) {
      expect(typeof attrSample[real], `ATTR_MAP['${alias}'] → ${String(real)}`).toBe('number')
    }
  })

  it('联合类型与字面量清单互相没有漏项（漏了编译期就红）', () => {
    // `satisfies` 保证清单里的每一项都是合法成员；
    // AssertNever 反过来保证联合类型里没有清单之外的成员。
    // 两个方向都钉住之后，上面的运行时对账就把「类型 == 引擎」这条链闭上了。
    type AssertNever<T> = [T] extends [never] ? true : never
    const attrs = attrKeys satisfies readonly AttributeKey[]
    const states = stateKeys satisfies readonly StateKey[]
    const hiddens = hiddenKeys satisfies readonly HiddenKey[]
    const _attrClosed: AssertNever<Exclude<AttributeKey, (typeof attrs)[number]>> = true
    const _stateClosed: AssertNever<Exclude<StateKey, (typeof states)[number]>> = true
    const _hiddenClosed: AssertNever<Exclude<HiddenKey, (typeof hiddens)[number]>> = true
    expect([_attrClosed, _stateClosed, _hiddenClosed]).toEqual([true, true, true])
    const sample: HiddenAttributes = { 道德值: 0, 欲望值: 0, 野心值: 0, 机敏值: 0, 忠诚值: 0 }
    for (const k of hiddens) expect(sample[k as keyof HiddenAttributes]).toBe(0)
  })
})

/**
 * 第二道守卫。这里的每一个对象字面量都是第七轮**真实存在过**的错误形态；
 * 它们必须被 tsc 拒绝。
 */
const _rejectedStatesInAttributes: LegacyAttributeConditions = {
  理政: { min: 70 },
  // @ts-expect-error 圣眷 是五方态度（gameState），写进 attributes 后引擎取值恒为 0 → 事件永不触发
  圣眷: { min: 30 }
}
const _rejectedTimeKeysInGameState: LegacyGameStateConditions = {
  圣眷: { min: 20 },
  // @ts-expect-error turn 要走 conditions.turn；塞进 gameState 会被 eventConditions 直接 continue 跳过
  turn: { min: 36 }
}
const _rejectedUnmappableEffect: LegacyAttributes = {
  文韬: 5,
  // @ts-expect-error 政绩 既不是属性、也不在 ATTR_MAP 别名表里 → 效果写进垃圾字段
  政绩: 5
}
const _rejectedChoiceLevelFlags: EventChoice = {
  id: 'c1',
  text: '探针选项',
  effects: { flags: { add: ['probe_done'] } },
  // @ts-expect-error flags 只存在于 effects 之下；挂在选项层引擎从来不读，出身事件因此整局反复触发
  flags: { add: ['origin_jinshen_001_done'] }
}

describe('类型系统拒绝第七轮那四类写错的键名', () => {
  it('上面四个探针字面量在运行时仍然是对象（报错只发生在编译期）', () => {
    expect(Object.keys(_rejectedStatesInAttributes)).toContain('理政')
    expect(Object.keys(_rejectedTimeKeysInGameState)).toContain('圣眷')
    expect(Object.keys(_rejectedUnmappableEffect)).toContain('文韬')
    expect(_rejectedChoiceLevelFlags.effects.flags?.add).toEqual(['probe_done'])
  })

  it('tsc 会拒绝没有生效的 @ts-expect-error，所以本文件的四条断言由 typecheck:test 把关', () => {
    expect(true).toBe(true)
  })
})

/**
 * 第九轮删掉的那批字段，同样各留一枚探针。
 *
 * 它们的共同点是「类型里挂着，实现里从来没有」：
 * nextEvents / charactersAlive / relationships / family / 选项级 condition / DiceCheck /
 * special.value / special 的 death|promotion|imprisonment|exile 分支 / narrative.speaker.avatar。
 * 数据侧要么零引用、要么写了一堆（avatar 301 处）却没有一个组件读。
 * 上一轮我删的时候没留守卫，结果「删了」这件事唯一的证据是 git log ——
 * 现在这几枚 @ts-expect-error 就是那份证据的可执行版本：谁把字段加回来，typecheck:test 立刻红。
 */
const _rejectedSpeakerAvatar: NarrativeSpeaker = {
  name: '老仆',
  title: '某府旧人',
  // @ts-expect-error avatar 指向 public/ 下根本不存在的 /avatars/*.png，且没有任何组件读它
  avatar: '/avatars/messenger.png'
}
// tsc 对一个对象字面量只报**第一个**未知键，所以一枚探针只能钉一个字段：
// 下面每个常量都是「一个合法键 + 一个已删除的键」的最小形状。
const _rejectedCharactersAlive: EventConditions = {
  origin: '缙绅',
  // @ts-expect-error charactersAlive 没有实现：checkEventConditions 与 boundaryEventCompiler 都不读它
  charactersAlive: ['王承恩']
}
const _rejectedCharactersDead: EventConditions = {
  origin: '寒门',
  // @ts-expect-error charactersDead 同上，人物生死表压根没有对应的数据结构
  charactersDead: ['魏忠贤']
}
const _rejectedHistoricalFlags: EventConditions = {
  rank: '正七品·知县',
  // @ts-expect-error historicalFlags 无实现：历史进度走的是 flags / gameState，不是这个自由字典
  historicalFlags: { 某事: '某值' }
}
const _rejectedConditionRelationships: EventConditions = {
  random: 50,
  // @ts-expect-error relationships 挂在 conditions 上没有任何求值器读（人物关系不做条件）
  relationships: { 袁崇焕: { min: 50 } }
}
const _rejectedEffectNextEvents: EventEffects = {
  attributes: { 文韬: 5 },
  // @ts-expect-error effects.nextEvents 无实现（pickEvent 从没读过它）
  nextEvents: ['some_event']
}
const _rejectedEffectRelationships: EventEffects = {
  hidden: { 道德值: 5 },
  // @ts-expect-error effects.relationships 无实现：数值只会安静地落在一个没人读的字段上
  relationships: { 袁崇焕: 10 }
}
const _rejectedEffectFamily: EventEffects = {
  flags: { add: ['probe'] },
  // @ts-expect-error effects.family 同上
  family: { 族人: 5 }
}
const _rejectedSpecialValue: EventEffects = {
  // @ts-expect-error special 只认 type，value 从来没被读过（43 处数据全是 { type: 'ending' }）
  special: { type: 'ending', value: 'ending_hermit' }
}
const _rejectedSpecialType: EventEffects = {
  special: {
    // @ts-expect-error 引擎里没有 special.type === 'death' 这个分支；死亡走引擎自己的升贬与临界判定
    type: 'death'
  }
}
const _rejectedChoiceCondition: EventChoice = {
  id: 'c1',
  text: '探针选项',
  effects: {},
  // @ts-expect-error 选项级 condition 没有任何求值器读（选项门只有 showConditions 这一条路）
  condition: { attributes: { 文韬: { min: 90 } } }
}
const _rejectedChoiceDiceCheck: EventChoice = {
  id: 'c1',
  text: '探针选项',
  effects: {},
  // @ts-expect-error DiceCheck 整条接口已删：投骰的难度/理由由 checkChoiceRequirement 从条件反推，
  // 作者手写的 check 从来没被读过
  check: { attribute: '文韬', difficulty: 3, reason: '探针' }
}
const _rejectedEventNextEvents: GameEvent = {
  id: 'e1',
  title: '探针事件',
  description: '探针',
  type: 'normal',
  conditions: {},
  choices: [],
  // @ts-expect-error 事件级 nextEvents 无实现，"上一事件的 nextEvents 100% 命中"那段注释也是编的
  nextEvents: ['e2']
}

describe('类型系统拒绝第九轮删掉的那些「有声明、无实现」字段', () => {
  it('这些探针字面量在运行时仍然只是普通对象（报错只发生在编译期）', () => {
    expect(Object.keys(_rejectedSpeakerAvatar)).toEqual(['name', 'title', 'avatar'])
    expect(_rejectedCharactersAlive.origin).toBe('缙绅')
    expect(_rejectedCharactersDead.origin).toBe('寒门')
    expect(_rejectedHistoricalFlags.rank).toBe('正七品·知县')
    expect(_rejectedConditionRelationships.random).toBe(50)
    expect(_rejectedEffectNextEvents.attributes?.文韬).toBe(5)
    expect(_rejectedEffectRelationships.hidden?.道德值).toBe(5)
    expect(_rejectedEffectFamily.flags?.add).toEqual(['probe'])
    expect(_rejectedSpecialValue.special?.type).toBe('ending')
    expect(_rejectedSpecialType.special?.type).toBe('death')
    expect(_rejectedChoiceCondition.id).toBe('c1')
    expect(_rejectedEventNextEvents.id).toBe('e1')
  })

  it('tsc 会拒绝没有生效的 @ts-expect-error，所以这十一枚探针由 typecheck:test 把关', () => {
    expect(true).toBe(true)
  })
})
