import { describe, expect, it } from 'vitest'
import { FLAG_MEMOIRS, MEMOIR_GROUP_ORDER, memoirsOf } from '../../src/data/flagBiography'
import { scanFlagReachability } from '../../scripts/audit-flag-reachability'

/**
 * 履历表（`src/data/flagBiography.ts`）与数据层的对账。
 *
 * 第十五轮留下一个诚实的负数：447 条可写经历里 250 条没有任何门槛读它。
 * 玩法接不住的那一部分，至少要让玩家结算时**看得见自己做过** —— 这张表就是那一条路。
 * 所以这里钉的全是"这条路会不会悄悄断掉"：
 *   写了显不出来的文案、覆盖度缩水、机器 id 漏上界面。
 */

const report = scanFlagReachability()

/**
 * 实测排行快照（2026-10-16，200 局 = warden 组 100 + steady 组 100，seed 1..100 × 4 出身）：
 * 这些是**只写不读、却真的被玩家随身带走**次数最多的经历。
 * 它们必须全部有履历文案 —— 这一池里"玩家做过却看不见"的事，第一条都不许留。
 */
const MOST_CARRIED_DEAD_FLAGS = [
  '地方官任职', '忠臣', '守旧派', '崇祯近臣', 'wife_wangshi', '东林系',
  '洪承畴幕僚', '徐霞客故交', '红袖的下落', 'harmonious_family', '先帝旧臣', '直笔',
  '暗中结交宦官', 'ruan_dacheng_enemy', '言路官', '台谏之声', 'namuzhong_grateful', '武将路线',
  '以工代偿', '支持辽东', '辟徐文派', '寒窗苦读', '外任实缺', '法理兼顾',
  '袁党嫌疑', '持续保袁', '徇私说情', '上报朝廷', '延误时机', '召对无言', '讳言旧朝'
]

/**
 * 第十七轮的补充快照（2026-10-16，warden 100 局 + steady 100 局）：
 * 上面那池做完之后，仍然**只写不读、又没上履历、却真的被人随身带走**的经历，一共 18 条。
 * 这一串是当时逐条数出来的，不是挑出来的 —— 它们现在全都必须有文案。
 */
const ROUND17_CARRIED_BUT_INVISIBLE = [
  '不论旧朝', '游历天下', '归隐之志', '纳妾之议', '一刻钟之恩', '旧议已收', '秦淮债清',
  'lishi_tension', '直言相告', '侠女自去', '侠女之盟', '再负一回', 'wife_hates_cuir',
  '阉党嫌疑', 'pending_zhanggui', '旧盟重寻', '如烟已嫁', '洪承畴故交'
]

describe('履历表与数据层的对账', () => {
  it('没有"全游戏写不出来"的死文案', () => {
    expect(
      report.deadMemoirs,
      `履历表给这些经历写了文案，可全游戏没有一个选项写得出它：${report.deadMemoirs.join(', ')}`
    ).toEqual([])
  })

  it('最常被随身带走的死经历，全部有文案', () => {
    const missing = MOST_CARRIED_DEAD_FLAGS.filter(f => !FLAG_MEMOIRS[f])
    expect(missing, '这些经历玩家真的会带上，却仍然看不见').toEqual([])
  })

  it('第十七轮实测"带得上身却看不见"的那 18 条，一条不许掉回暗账', () => {
    const missing = ROUND17_CARRIED_BUT_INVISIBLE.filter(f => !FLAG_MEMOIRS[f])
    expect(
      missing,
      '这些是模拟里真被玩家随身带走、又没有任何门槛读过的经历 —— 它们唯一的出路就是上履历表'
    ).toEqual([])
  })

  it('覆盖度不许缩水（棘轮下限）', () => {
    expect(
      Object.keys(FLAG_MEMOIRS).length,
      '履历条目少了 116 条以下 —— 这张表已经退化成摆设了'
    ).toBeGreaterThanOrEqual(116)
  })

  it('每条文案都短、有分组、说人话', () => {
    const bad: string[] = []
    for (const [flag, m] of Object.entries(FLAG_MEMOIRS)) {
      if (!MEMOIR_GROUP_ORDER.includes(m.group)) bad.push(`${flag}：分组「${m.group}」不存在`)
      if (!m.line.trim()) bad.push(`${flag}：空文案`)
      if (m.line.length > 30) bad.push(`${flag}：文案 ${m.line.length} 字，太长：${m.line}`)
      // 机器 id 不能出现在文案里 —— 那说明是直接把 flag 当话术用了
      if (/^[a-z0-9_]+$/.test(m.line)) bad.push(`${flag}：文案是机器 id，不许上界面`)
    }
    expect(bad).toEqual([])
  })

  it('分组只有已登记的那四个，且每组都有内容', () => {
    const used = new Set(Object.values(FLAG_MEMOIRS).map(m => m.group))
    for (const g of MEMOIR_GROUP_ORDER) {
      expect(used.has(g), `分组「${g}」一条经历都没有，UI 会渲染出一个空标题`).toBe(true)
    }
    expect([...used].every(g => MEMOIR_GROUP_ORDER.includes(g))).toBe(true)
  })

  it('看得见与看不见的比例对得上账', () => {
    const wo = new Set(report.writeOnly)
    const coveredDead = Object.keys(FLAG_MEMOIRS).filter(f => wo.has(f))
    // 白存 = 有履历的白存 + 仍然隐形的，一条不许少算
    expect(coveredDead.length + report.invisible.length).toBe(report.writeOnly.length)
    expect(
      report.invisible.length,
      `既没门槛读、又没上履历的经历仍然有 ${report.invisible.length} 条` +
        '（2026-10-16 实测：这 113 条里除了 `动用关系`、`贪声已著` 是第二波回响自己的产出' +
        '（为守住"这一池写出的都看得见"而补的文案），其余正是 warden+steady 各 100 局里' +
        '一次都没被随身带过的那一批 —— 给它们写文案是自欺；' +
        '这条棘轮钉的是"别再往这一堆里添新的"）'
    ).toBeLessThanOrEqual(113)
  })
})

describe('memoirsOf 的取数行为', () => {
  it('未登记的 flag 一律不显示（机器 id 不许漏上界面）', () => {
    expect(memoirsOf(['some_internal_marker', 'xianv_unknown_id', '忠臣'])).toHaveLength(1)
    expect(memoirsOf(undefined)).toEqual([])
    expect(memoirsOf([])).toEqual([])
  })

  it('重复的 flag 只记一次', () => {
    expect(memoirsOf(['忠臣', '忠臣', '直笔'])).toHaveLength(2)
  })

  it('按分组呈现顺序排列，组内保留玩家做选择的先后', () => {
    const out = memoirsOf(['wife_wangshi', '忠臣', '直笔', '地方官任职', '红袖的下落'])
    expect(out.map(m => m.group)).toEqual(['朝局', '风骨', '风骨', '家宅', '人情'])
    // 组内次序 = 身上的次序（那是时间的次序），不是表里的书写次序
    expect(memoirsOf(['直笔', '忠臣']).map(m => m.flag)).toEqual(['直笔', '忠臣'])
  })

  it('一条身上常见的经历集能翻出可读的履历，且不含 flag id', () => {
    const out = memoirsOf(['忠臣', '守旧派', '地方官任职', '红袖的下落', 'wife_wangshi'])
    expect(out).toHaveLength(5)
    const rendered = out.map(m => m.line).join('\n')
    for (const f of ['wife_wangshi', 'ruan_dacheng_enemy']) {
      expect(rendered).not.toContain(f)
    }
  })
})
