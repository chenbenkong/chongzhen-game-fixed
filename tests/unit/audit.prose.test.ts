import { describe, expect, it } from 'vitest'
import { scanProse } from '../../scripts/audit-prose'
import { allEvents } from '../../scripts/event-pools'
import type { GameEvent } from '../../src/types/event'

/**
 * 第七十轮的看门狗：**玩家可见正文里不许有机器 id，也不许指一个盘面上没有的命途**。
 *
 * 第五十三轮（§1.4 ㉝）收掉的是图鉴卡片上界面拼出来的那行 id。这一轮量到的是另一半：
 * 数据里**写死**在 `result.echo` / `description` 里的 id —— 【回音】框把 `result.echo`
 * 原样印到玩家眼前，于是实测 51 处机器 id 直接上界面（涉及 17 个事件）。
 * 其中 4 个 id（`ending_hermit_teaching`、`ending_official_promoted_minister`、
 * `ending_official_demoted_border`、`ending_official_clean_retire`）在图鉴里根本没有对应格子，
 * 等于回音当众承诺了一个不存在的结局。
 *
 * 改写之后正文用《真实标题》指命途，所以这里还要钉住第二条：
 * 用「《X》一路」「归入《X》」这类句式指命途时，X 必须是真格子 —— 书名也用《》，
 * 因此只认带指命途语境的句式（实测全库零误报，反空转夹具在下面）。
 */

const ev = (over: Partial<GameEvent>): GameEvent =>
  ({ id: 'synthetic_prose_ev', title: '合成事件', type: 'transition', conditions: {}, choices: [], ...over }) as unknown as GameEvent

const withEcho = (echo: string) =>
  ev({ choices: [{ id: 'c1', text: '选它', effects: {}, result: { title: '结果', echo, tags: [] } }] as any })

const kinds = (events: GameEvent[]) => scanProse(events).findings.map(f => f.kind)
const details = (events: GameEvent[]) => scanProse(events).findings.map(f => f.detail)

describe('正文体检：机器 id 与虚指命途', () => {
  it('真实数据 0 处（第五十三轮只清了界面拼的，数据写死的这一半从这里开始钉）', () => {
    const { findings, strings } = scanProse(allEvents as unknown as GameEvent[])
    expect(strings, '扫描面不许空转').toBeGreaterThan(10000)
    expect(
      findings.map(f => `${f.where} ${f.detail}`),
      '玩家可见正文里不许出现机器 id，也不许指一个图鉴里没有的命途'
    ).toEqual([])
  })

  it('反空转：echo 里写 ending_xxx 必须报，且报的是那个 id', () => {
    const dirty = withEcho('【这一段记在案：边关任职 —— 此标记将解锁 ending_border_general 结局】')
    expect(kinds([dirty])).toEqual(['机器id'])
    expect(details([dirty])[0]).toContain('ending_border_general')
  })

  it('反空转：指一个不存在的命途必须报（旧数据那 4 个空头的形状）', () => {
    const dirty = withEcho('【这一段记在案：辞官、讲学 —— 《讲学传道》一路便有了凭据】')
    expect(kinds([dirty])).toEqual(['虚指命途'])
    expect(details([dirty])[0]).toContain('《讲学传道》')
  })

  it('真命途用《》指认是允许的；书名不算命途', () => {
    const ok = withEcho('你写下了《乞骸骨疏》。【这一段记在案：辞官 —— 《大儒传世》一路便有了凭据】')
    expect(kinds([ok])).toEqual([])
  })

  it('判定树里的 id 不算正文：conditions / effects / 事件自身的 id 都不许误报', () => {
    const clean = ev({
      description: '官场沉浮数十载。',
      conditions: { flags: { has: ['ending_border_general'] } } as any,
      choices: [{
        id: 'c1',
        text: '【请缨】臣愿往辽东督师',
        effects: { flags: { add: ['route_flag_x'] } } as any,
        result: { title: '辽东', echo: '你到了辽东。', tags: ['边关任职'] }
      }] as any
    })
    expect(kinds([clean])).toEqual([])
  })

  it('非 echo 的玩家可见字段同样在网里：选项 description 与 result.tags', () => {
    const dirtyDesc = ev({
      choices: [{
        id: 'c1', text: '选它', effects: {},
        description: '主动请守锦州（与 ending_border_general 的"守城"分支对应）',
        result: { title: 't', echo: '干净', tags: [] }
      }] as any
    })
    const dirtyTag = ev({
      choices: [{
        id: 'c1', text: '选它', effects: {},
        result: { title: 't', echo: '干净', tags: ['解锁 ending_medical_saint'] }
      }] as any
    })
    expect(kinds([dirtyDesc])).toEqual(['机器id'])
    expect(kinds([dirtyTag])).toEqual(['机器id'])
  })

  it('没登记在 id 表里的小写串不算机器 id：只认前缀与真实存在的 id', () => {
    // 「min_count_x」既不是前缀形状也不是任何已知 id —— 正文里出现它不该惊动玩家
    expect(kinds([withEcho('账目上写着 min_count_x 一类的私记号。')])).toEqual([])
    // 而 transition_* 这种前缀即使 id 不存在也要报：那是把内部命名漏到屏幕上
    expect(kinds([withEcho('此事见于 transition_99_ghost 的档案。')])).toEqual(['机器id'])
  })
})
