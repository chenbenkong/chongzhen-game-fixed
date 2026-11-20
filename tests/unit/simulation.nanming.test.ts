import { describe, it, expect } from 'vitest'
import { simulateRun } from './helpers/simulate'
import type { OriginType } from '../../src/types/game'

/**
 * 南明自由可达钉子（§8.28）。
 *
 * §8.27 把 1643 两处主南迁的伏笔落了票（transition_176.c4 / transition_184.c2 写 `主张南迁`），
 * 接住《天崩地坼》aftermath.c4「衣冠南渡」→《南渡续祚》。但那一轮的兑现是靠**造档浏览器实测**
 * 钉的 —— 标准策略网格（warden/steady/first/random/ambitious）里南渡续祚自由触达恒 0：
 * 《城破前夜》四条答案只有 c3【南逃】写的 `南渡长江` 不在 aftermath 的 notHas 里，而 c3 自带
 * 体质−10，warden 的 pickSafest 永远躲开它，于是 aftermath 开不了口。这不是格子坏了，是
 * **量具里没人朝它走**（与第廿四轮 bandit、第四十九轮 burnout 同一条教训）。
 *
 * §8.28 补一副 `nanming` 画像：保命活到甲申（其余卡同 warden），只在四张 nationfall 卡上
 * 按"想南渡的人"会做的选择覆盖，见到《南渡续祚》请笔就收笔。本钉子证明这条链在**自由模拟**里
 * 真演得到，且 §8.27 的伏笔票在衣冠南渡那一刻确实上身 —— 与造档实测互补，不再只靠手工存档。
 *
 * 棘轮口径：8 出身 × 6 种子 = 48 局，实测南渡续祚 8 局、衣冠南渡(aftermath.c4) 8 局，留 2 余量
 * 钉 ≥6。再有人把南逃票挪走、把衣冠南渡的 主张南迁 门改断、或把南渡续祚请笔摘掉，都会红。
 * 内容挪位致随机流漂移时按历轮惯例重标定（换 seed / 补代表），不降棘轮。
 */
const ORIGINS: OriginType[] = ['寒门', '缙绅', '军户', '海商', '没落世家', '诗文清望', '胥吏', '罪臣之后']
const SEEDS = 6

describe('南明自由可达（§8.28）', () => {
  it('nanming 画像自由模拟真演到《南渡续祚》，§8.27 南迁伏笔在衣冠南渡兑现', async () => {
    const runs = []
    for (const origin of ORIGINS) {
      for (let i = 0; i < SEEDS; i++) {
        runs.push(await simulateRun({ seed: 1 + i, policy: 'nanming', origin, maxMonths: 260, logChoices: true }))
      }
    }

    const southern = runs.filter(r => r.endingId === 'ending_southern_ming')
    const viaYiguan = runs.filter(r =>
      r.choiceLog.some(c => c.eventId === 'transition_1644_aftermath' && c.choiceId === 'c4')
    )

    // 自由触达棘轮（实测 8/48，留 2 余量）
    expect(southern.length).toBeGreaterThanOrEqual(6)
    expect(viaYiguan.length).toBeGreaterThanOrEqual(6)
    expect(runs.some(r => r.error)).toBe(false)

    // §8.27 的兑现路径：衣冠南渡真被点到，且点它那一刻 主张南迁 伏笔票已上身（城破前的准备真接住了）
    for (const r of viaYiguan) {
      const after = r.choiceLog.find(c => c.eventId === 'transition_1644_aftermath' && c.choiceId === 'c4')!
      expect(after.flagsBefore).toContain('主张南迁')
      expect(after.flagsAfter).toEqual(expect.arrayContaining(['南渡长江', '效忠南明']))
    }

    // 结进《南渡续祚》的局，立场票齐（结局自己的 conditions.flags.has）
    for (const r of southern) {
      expect(r.finalFlags).toEqual(expect.arrayContaining(['南渡长江', '效忠南明']))
    }

    // 链上每一拍都有人走：1643 主南迁落票 → 城破前夜南逃（唯一不挡 aftermath 的票）
    expect(runs.some(r => r.choiceLog.some(c =>
      (c.eventId === 'transition_184' && c.choiceId === 'c2') ||
      (c.eventId === 'transition_176' && c.choiceId === 'c4')
    ))).toBe(true)
    expect(runs.some(r => r.choiceLog.some(c =>
      c.eventId === 'transition_1644_night_before' && c.choiceId === 'c3'
    ))).toBe(true)
  }, 600000)
})