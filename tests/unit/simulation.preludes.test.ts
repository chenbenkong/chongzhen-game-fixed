import { describe, expect, it } from 'vitest'
import { simulateRun, type SimPolicy } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 第五十七轮：结局前奏得真的排在历史卡前面（§1.4 ㉖）。
 *
 * 改造前 `findAllEventsForState` 把 `isPreEnding` 前奏放在 `historical` 的 else 分支：
 * 只有当月没有历史卡时才轮得到它。256 局模拟里 6 张前奏 0 次登场 ——
 * 玩家从历史卡直接跳进结局，专门写的前奏是死内容。
 *
 * 这三条钉子各管一件事：
 * ① 触达下界：1643-09《决战前夜》与 1644-03《城破前夜》至少各来一次
 *    （改造前两者都是 0/256，直接红）；
 * ② 顺序：前奏必须是**当月第一格** —— 它被谁抢到前面，就是退回旧行为；
 * ③ 不变量：整批 48 局都要结案、不许报错 —— 前奏入队不能让人卡在队列里。
 * 下界留了余量（实测 16/15/15），因为批次会随内容改动整体挪位（见记忆 ㉕）。
 *
 * 第六十二轮补上另外三张前奏的下界（A 批加中兴，B 批加篡位/抄家）。
 * 读数：A 批 48 局 ——《中兴前夜》9、中兴结局 4；B 批 32 局 ——
 * 《权欲之巅》5、篡位结局 4；《抄家在即》10、抄家结局 4。
 * 抄家结局另有 2 次被 p102《诏狱冤死》按优先级截走，这是结局互斥，不是走不到。
 * B 批的 corrupt 画像必须开着 `preferTickets` 才有这 4 次：前奏入口 圣眷≤25、
 * 【拼死一搏】自抽 20 点，保命硬筛会先把这张票整条剔掉（量具毛病，见 simulate.ts）。
 *
 * ② 一开始写成「前奏之后紧跟的必须是同月历史卡」，红在 1644-03 的 3 局上——
 * 那不是回归，是数据按设计在收口：《煤山遗恨》问的正是《城破前夜》刚问过的那道
 * 「殉国/降/逃/藏」，四种答案写下的票（殉国报君 / 贰臣 / 南渡长江 / 出家）全在它的
 * notHas 里，所以前奏的选项一落，待处理队列里的它就自己被筛掉了，跟上来的是灰色支线。
 * 三月的同月配对本来就该断；1643-09 那对（前奏 + 《孙传庭殉国》）的精确顺序由
 * `engine.preludeQueue.test.ts` 用存档钉着，这里只查 48 局里的批量不变量。
 */

const ORIGINS: OriginType[] = ['寒门', '缙绅', '没落世家', '诗文清望']
const POLICIES: SimPolicy[] = ['random', 'warden', 'ambitious']
const SEEDS = [1, 3, 5, 7]

const PRELUDE_IDS = [
  'prelude_zhongxing_1643_12',
  'prelude_martyr_1644_2',
  'prelude_died_battlefield_1643_9',
  'prelude_usurper_1643_12',
  'prelude_clan_exterminate',
  'transition_1644_night_before',
  'transition_1644_aftermath'
]
const PRELUDE_SET = new Set(PRELUDE_IDS)

describe('第五十七轮：结局前奏与同月历史卡的先后', () => {
  it('48 局：前奏有下界、顺序正确、全部结案', async () => {
    const counts = new Map<string, number>()
    const endingCounts = new Map<string, number>()
    const duplicates: string[] = []
    const orderBreaks: string[] = []
    const errors: string[] = []
    let ended = 0

    for (const origin of ORIGINS) {
      for (const policy of POLICIES) {
        for (const seed of SEEDS) {
          const r = await simulateRun({ seed, policy, origin, maxMonths: 260 })
          if (r.ended) ended++
          if (r.error) errors.push(`${origin}/${policy}/${seed}: ${r.error.slice(0, 120)}`)
          if (r.endingId) endingCounts.set(r.endingId, (endingCounts.get(r.endingId) || 0) + 1)

          const seenHere = new Set<string>()
          for (let i = 0; i < r.firedEventIds.length; i++) {
            const id = r.firedEventIds[i]
            if (!PRELUDE_SET.has(id)) continue
            counts.set(id, (counts.get(id) || 0) + 1)
            if (seenHere.has(id)) duplicates.push(`${origin}/${policy}/${seed}: ${id}`)
            seenHere.add(id)

            // 前奏是选择器的 results[0]，落在当月第一格。同月若有事件排在它前面，
            // 说明它又被塞回历史卡后面去了 —— 那时当月的历史卡会先消耗掉这一格。
            const turn = r.firedTurns[i]
            for (let j = 0; j < i; j++) {
              if (r.firedTurns[j] !== turn) continue
              orderBreaks.push(
                `${origin}/${policy}/${seed}: ${id} 排在了 ${r.firedEventIds[j]} 后面（turn${turn}）`
              )
              break
            }
          }
        }
      }
    }

    expect(errors, '模拟报错').toEqual([])
    expect(ended, '有局没结案 —— 前奏入队把人卡住了').toBe(ORIGINS.length * POLICIES.length * SEEDS.length)
    expect(duplicates, '同一局里前奏播了两次').toEqual([])
    expect(orderBreaks, '前奏没排在当月第一格 —— 又被历史卡抢在前面了').toEqual([])
    expect(counts.get('prelude_died_battlefield_1643_9') ?? 0, '1643-09 的《决战前夜》一次都没播').toBeGreaterThanOrEqual(5)
    expect(counts.get('transition_1644_night_before') ?? 0, '1644-03 的《城破前夜》一次都没播').toBeGreaterThanOrEqual(5)
    expect(counts.get('prelude_martyr_1644_2') ?? 0, '1644-02 的《城破前夕》一次都没播').toBeGreaterThanOrEqual(5)
    // 第 62 轮：原来要 1643-12 的 国势≥60，而国势从 1636 起每月衰减，实测量不到；
    // 改成「三张参朝票 + 清议」后 A 批 9 次登场、4 次走到《中兴成功》。
    expect(counts.get('prelude_zhongxing_1643_12') ?? 0, '1643-12 的《中兴前夜》一次都没播').toBeGreaterThanOrEqual(4)
    expect(endingCounts.get('ending_zhongxing_success') ?? 0, '《中兴成功》一次都没结案').toBeGreaterThanOrEqual(2)
  }, 600000)

  /**
   * 第六十二轮 B 批：通用策略不往兵权/贪墨上走，前奏与结局只在这两组画像里出现。
   *
   * 这三格的前奏原来各有一道不可能成立的门：《权欲之巅》要隐藏 野心/道德 与 中官，
   * 且【黄袍加身】不写票；《抄家在即》钉死 1644 正月 + 圣眷≤10。
   * 现在前奏各写一张正门票，结局仍在下个月走原来的边界门。
   *
   * 抄家结局 4/32 里有 2 局被《诏狱冤死》截走 —— 后者 p102 排在 p123 前面，
   * 而 corrupt 画像常带着袁案票且圣眷已被抽到 ≤15。这是设计上的互斥收口，
   * 下界因此只取 1，不追那 2 局。
   */
  it('B 批 32 局：篡位、抄家两条链都有下界且全部结案', async () => {
    const counts = new Map<string, number>()
    const endingCounts = new Map<string, number>()
    const errors: string[] = []
    let ended = 0

    for (const origin of ORIGINS) {
      for (const policy of ['usurper', 'corrupt'] as SimPolicy[]) {
        for (const seed of SEEDS) {
          const r = await simulateRun({ seed, policy, origin, maxMonths: 260 })
          if (r.ended) ended++
          if (r.error) errors.push(`${origin}/${policy}/${seed}: ${r.error.slice(0, 120)}`)
          for (const id of r.firedEventIds) {
            if (id.startsWith('prelude_')) counts.set(id, (counts.get(id) || 0) + 1)
          }
          if (r.endingId) endingCounts.set(r.endingId, (endingCounts.get(r.endingId) || 0) + 1)
        }
      }
    }

    expect(errors, '模拟报错').toEqual([])
    expect(ended, '有局没结案').toBe(ORIGINS.length * 2 * SEEDS.length)
    expect(counts.get('prelude_usurper_1643_12') ?? 0, '《权欲之巅》一次都没播').toBeGreaterThanOrEqual(2)
    expect(counts.get('prelude_clan_exterminate') ?? 0, '《抄家在即》一次都没播').toBeGreaterThanOrEqual(5)
    expect(endingCounts.get('ending_usurper_throne') ?? 0, '《篡位自立》一次都没结案').toBeGreaterThanOrEqual(2)
    expect(endingCounts.get('ending_clan_exterminate') ?? 0, '《抄家灭族》一次都没结案').toBeGreaterThanOrEqual(1)
  }, 600000)
})
