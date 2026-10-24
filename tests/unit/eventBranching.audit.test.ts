import { describe, expect, it } from 'vitest'
import { scanBranching } from '../../scripts/audit-branch'
import { transitionEvents } from '../../src/data/events/index'
import type { GameEvent } from '../../src/types/event'

/**
 * 第三十五轮：支线选项“生硬”的静态棘轮。
 *
 * 玩家抱怨的不是某一句话写得不好，而是**每个事件都端出同一张态度菜单**：
 * 积极 / 明哲保身 / 攀附 / 静观其变。量出来的形态是 54 句选项被复制到
 * 342/864 条里，最长的一句出现在 16 个事件中。这一轮把 60 个事件（40 个
 * 年年重复的岁末/新年/秋收仪式 + 20 个开局高频道事件）逐条改写，又清掉了
 * 十套跨 6 个以上事件复用的危机菜单。
 *
 * 下面两条阈值都是**只许往下**的棘轮。第三十五轮 446 条，第三十六轮按实际
 * 播放频率清到 321，第三十七轮 206。第三十八轮把最后 64 个事件（27 个实测
 * 播放过 + 37 个走特定路线、样本没覆盖到的）一次清完，存量归零：749 → 0。
 * 因此阈值从 206 直接落到 0，名单里的 195 个事件必须一条自我旁白都没有；
 * 新增事件若带回 `"当……"` 会立刻顶破。
 */
const NATURALIZED_EVENT_IDS = [
  // 岁末总结（8）
  'transition_066', 'transition_090', 'transition_114', 'transition_126',
  'transition_138', 'transition_150', 'transition_162', 'transition_174',
  // 岁末族单件（6）
  'transition_008', 'transition_030', 'transition_042', 'transition_054',
  'transition_078', 'transition_102',
  // 新年朝会（9）
  'transition_031', 'transition_043', 'transition_079', 'transition_103',
  'transition_127', 'transition_139', 'transition_151', 'transition_1642_newyear',
  'transition_175',
  // 新年族单件（5）
  'transition_019', 'transition_055', 'transition_067', 'transition_091', 'transition_115',
  // 秋收赋税（7）
  'transition_051', 'transition_087', 'transition_099', 'transition_111',
  'transition_123', 'transition_159', 'transition_171',
  // 税赋族单件（5）
  'transition_004', 'transition_012', 'transition_027', 'transition_063', 'transition_075',
  // 开局高频道事件（20）
  'transition_001', 'transition_003', 'transition_003b', 'transition_004b',
  'transition_005', 'transition_005d', 'transition_006', 'transition_011',
  'transition_013', 'transition_014', 'transition_016', 'transition_017',
  'transition_018', 'transition_020', 'transition_021', 'transition_022',
  'transition_023', 'transition_025', 'transition_028', 'transition_029',
  // 第三十六轮：按播放频率选出的高频事件（35）
  'transition_033', 'transition_034', 'transition_035', 'transition_036',
  'transition_037', 'transition_038', 'transition_039', 'transition_040',
  'transition_041', 'transition_044', 'transition_045', 'transition_046',
  'transition_047', 'transition_049', 'transition_050', 'transition_052',
  'transition_053', 'transition_056', 'transition_058', 'transition_059',
  'transition_060', 'transition_061', 'transition_062', 'transition_064',
  'transition_068', 'transition_070', 'transition_071', 'transition_072',
  'transition_073', 'transition_074', 'transition_076', 'transition_077',
  'transition_098', 'transition_100', 'transition_113',
  // 第三十七轮：沿同一口径再清的高频事件（36）
  'transition_032', 'transition_092', 'transition_093', 'transition_094',
  'transition_095', 'transition_096', 'transition_097', 'transition_101',
  'transition_110', 'transition_112', 'transition_124', 'transition_125',
  'transition_128', 'transition_129', 'transition_131', 'transition_133',
  'transition_134', 'transition_135', 'transition_137', 'transition_147',
  'transition_148', 'transition_155', 'transition_156', 'transition_157',
  'transition_160', 'transition_161', 'transition_165', 'transition_167',
  'transition_168', 'transition_169', 'transition_170', 'transition_173',
  'transition_179', 'transition_181', 'transition_185', 'transition_186',
  // 第三十八轮：实测播放过、还剩自我旁白的 27 个事件
  'transition_009', 'transition_080', 'transition_081', 'transition_082',
  'transition_083', 'transition_084', 'transition_086', 'transition_088',
  'transition_089', 'transition_104', 'transition_106', 'transition_107',
  'transition_109', 'transition_116', 'transition_117', 'transition_118',
  'transition_120', 'transition_121', 'transition_122', 'transition_144',
  'transition_145', 'transition_146', 'transition_163', 'transition_176',
  'transition_178', 'transition_180', 'prelude_martyr_1644_2',
  // 第三十八轮：样本没走到、按 storyline 覆盖补上的 37 个事件
  'transition_002', 'transition_007', 'transition_010', 'transition_015',
  'transition_024', 'transition_026', 'transition_048', 'transition_057',
  'transition_065', 'transition_069', 'transition_085', 'transition_105',
  'transition_108', 'transition_119', 'transition_130', 'transition_132',
  'transition_136', 'transition_140', 'transition_141', 'transition_142',
  'transition_143', 'transition_149', 'transition_152', 'transition_153',
  'transition_154', 'transition_158', 'transition_164', 'transition_166',
  'transition_172', 'transition_177', 'transition_182', 'transition_183',
  'transition_184', 'prelude_zhongxing_1643_12', 'prelude_died_battlefield_1643_9',
  'prelude_usurper_1643_12', 'prelude_clan_exterminate'
] as const

const byId = new Map(transitionEvents.map(e => [e.id, e]))

describe('支线选项的自然度（audit:branch）', () => {
  it('没有任何一句选项文案被六个以上事件共用', () => {
    const audit = scanBranching(transitionEvents)
    expect(
      audit.repeatedMenus.map(m => `${m.events.length}× ${m.text} → ${m.events.join('、')}`)
    ).toEqual([])
  })

  it('自我旁白归零后不再回涨', () => {
    const audit = scanBranching(transitionEvents)
    // 第三十八轮起 0/864（第三十七轮 206，第三十六轮 321，第三十五轮 446）
    expect(audit.selfNarration).toBe(0)
  })

  it('已自然化的 195 个事件一个自我旁白都不剩', () => {
    const events = NATURALIZED_EVENT_IDS.map(id => {
      const e = byId.get(id)
      expect(e, `名单里的 ${id} 在过渡池里找不到`).toBeTruthy()
      return e as GameEvent
    })
    expect(events).toHaveLength(195)
    const audit = scanBranching(events)
    expect(audit.selfNarration).toBe(0)
  })

  /**
   * 反空转：如果扫描函数把正则写错、或把 byText 的键拼错，上面三条会安静地永远通过。
   * 这里直接喂一份必然违规的池子，并卡住阈值边界：5 个事件共用不算，6 个才算。
   */
  it('体检真的认得重复菜单和自我旁白', () => {
    const shared = '【静观其变】"当静观其变，不轻易表态"'
    const synthetic: GameEvent[] = Array.from({ length: 6 }, (_, i) => ({
      id: `fake_${i}`,
      type: 'gray' as const,
      title: `假事件${i}`,
      description: '夹具',
      conditions: {},
      narrative: { quote: '', background: '', situation: '' },
      choices: [
        { id: 'c1', text: shared, description: '假装沉默', effects: {} },
        { id: 'c2', text: `【具体动作${i}】把第 ${i} 份塘报压进案底`, description: '塘报落了灰。', effects: {} }
      ]
    }))
    synthetic.push({
      id: 'fake_boundary',
      type: 'gray' as const,
      title: '边界事件',
      description: '夹具',
      conditions: {},
      narrative: { quote: '', background: '', situation: '' },
      choices: [{ id: 'c1', text: '【再静观】再等等', description: '等到入冬。', effects: {} }]
    })

    const audit = scanBranching(synthetic)
    expect(audit.repeatedMenus).toHaveLength(1)
    expect(audit.repeatedMenus[0].events).toHaveLength(6)
    expect(audit.selfNarration).toBe(6)
    expect(audit.findings.filter(f => f.kind === 'repeated-menu')).toHaveLength(1)
    expect(audit.findings.filter(f => f.kind === 'self-narration')).toHaveLength(6)
  })
})
