import { describe, expect, it } from 'vitest'
import { allEvents } from '../../scripts/event-pools'
import { allEndingEvents } from '../../src/data/events/ending'

/**
 * 结局格子的门票池里不许有「幽灵票」（第二十三轮）。
 *
 * 什么叫幽灵票：格子条件读的那个 flag，**全库没有任何一条选项写得出来**。
 * 它比"没人读的 flag"更坏 —— 白存的 flag 只是没人看，幽灵票是**门槛自己在撒谎**：
 * 图鉴与格子文案告诉玩家"你得受过廷杖 / 得下过海 / 得聚众为盗"，而玩家一辈子
 * 无论怎么选都拿不到那张票。可达性矩阵量不到它：矩阵给每格配的是**自己的**驱动存档，
 * 存档里直接写上那张票，于是那一格照样 `ok`。第二十二轮的 看破红尘 就是这个形状，
 * 本轮把整类一次性量了出来：**10 格读到 17 处幽灵票**。
 *
 * 最刺眼的是《落草为寇》：它的 `any` 写的是 落草为寇/啸聚山林/聚众为盗/流寇 四张，
 * 其中三张无人写 —— 那一格一直只有一条腿站着，而那条腿的写手 `route_bandit_revolt`
 * 在模拟里至今没播过（⑯）。第二十三轮的修法只有两种，都写在了各自的站点上：
 *  ① 有真同义词的改成写得出来的那张（廷杖→廷杖受刑、隐居山林→归隐山林、镇守辽东→关外督师、
 *    畏罪潜逃→潜逃、清议派→东林党人、下海→出海那张本来就在池子里、三守开封→死守开封同理）；
 *  ② 正文已经写了这段经历的，把 flag 补还给那个选项（啸聚山林 → route_bandit_revolt/c2
 *    「占山为王」，它的 echo 写的就是"在深山中的一座旧山寨安顿下来"）。
 * 两张都不适用的（削职为民、下狱、通缉在案、聚众为盗、流寇、脱俗）从池子里摘掉 ——
 * **摘幽灵不算抬门槛**：它本来就不可能被满足，摘掉前后玩家的可选项一模一样。
 *
 * 管不到的地方要说明白：`ending_famous_minister` 的「>=2 张清流票」写在 `custom` 函数体里，
 * 条件对象扫不到（本轮也顺手把那里的 清议派 摘了，池子实际一直是 8 张在轮转）。
 * 选项级门槛的同类问题由 `audit.choiceLockout` 看着，两份不重叠。
 */

/** 全游戏任何一条选项的结果里写得出来的 flag */
const writable = new Set<string>()
for (const e of allEvents) {
  for (const c of e.choices ?? []) {
    for (const f of c.effects?.flags?.add ?? []) writable.add(f)
  }
}

/** 条件对象里正面读的那批池子（`has` 全要 / `all` 全要 / `some`、`any` 任一） */
const positivePool = (f: any): string[] => [
  ...(f?.has ?? []),
  ...(f?.all ?? []),
  ...(f?.some ?? []),
  ...(f?.any ?? [])
]

const tiles = allEndingEvents as any[]
const withFlagGate = tiles.filter(t => positivePool(t.conditions?.flags).length > 0)

describe('结局格子的门票必须有写手', () => {
  it('覆盖面不许缩水：带 flag 门的格子仍是 20 个以上', () => {
    expect(
      withFlagGate.length,
      `只有 ${withFlagGate.length} 格还读正面 flag 门（2026-10-19 实测 23 格）—— ` +
        '这一轮只该动池子里的字符串，不该动格子本身，数量掉了说明有别的改动进来了'
    ).toBeGreaterThanOrEqual(20)
  })

  it('正面池里不许有幽灵票 —— 每张票都得有人写得出来', () => {
    const ghosts: string[] = []
    for (const t of tiles) {
      const dead = positivePool(t.conditions?.flags).filter(f => !writable.has(f))
      if (dead.length) ghosts.push(`${t.id}《${t.title}》：${dead.join(' / ')}`)
    }
    expect(
      ghosts,
      '这些票全库无人写：门槛等于在向玩家许诺一段拿不到的经历。' +
        '要么改成写得出来的同义 flag，要么把这段经历补写给那个选项，要么摘掉它'
    ).toEqual([])
  })

  it('notHas 里也不许有幽灵票 —— 关不上的门不许写在门框上', () => {
    const noops: string[] = []
    for (const t of tiles) {
      const dead = ((t.conditions?.flags ?? {}).notHas ?? []).filter((f: string) => !writable.has(f))
      if (dead.length) noops.push(`${t.id}《${t.title}》：${dead.join(' / ')}`)
    }
    expect(
      noops,
      '互斥面读一张永远拿不到的票，看起来在防某条路线、其实一条也没防住'
    ).toEqual([])
  })

  it('同一格不许既要求又禁止同一张票（自相矛盾 = 永久关死）', () => {
    const contra: string[] = []
    for (const t of tiles) {
      const f = t.conditions?.flags ?? {}
      const both = positivePool(f).filter(p => (f.notHas ?? []).includes(p))
      if (both.length) contra.push(`${t.id}《${t.title}》：${both.join(' / ')}`)
    }
    expect(contra, '这一格的 flag 门永远不可能同时满足，等于图鉴上少一格').toEqual([])
  })

  it('摘完幽灵之后，每一格至少还剩两条能摸到的票', () => {
    // 5 张"单票格"是设计如此（殉国死节=殉国报君、南渡续祚=南渡长江、称臣纳贡/卖国求荣=贰臣、
    // 流亡海外=转移资产）：它们读的是那一件只有一次可能的动作，不在本条断言的格子里。
    const oneAction = new Set([
      'ending_martyr_nation',
      'ending_southern_ming',
      'ending_qing_tributary',
      'ending_traitor',
      'ending_exile_overseas'
    ])
    const thin: string[] = []
    for (const t of tiles) {
      const pool = positivePool(t.conditions?.flags)
      if (!pool.length || oneAction.has(t.id)) continue
      const live = pool.filter(f => writable.has(f))
      if (live.length < 2) thin.push(`${t.id}《${t.title}》只剩 ${live.length} 张：${live.join(' / ')}`)
    }
    expect(
      thin,
      '只剩一条腿的格子，那一格的内容就完全系在那一个选项上 —— 那个选项的年份/门槛一挪，' +
        '整格就永远打不着（本轮摘幽灵之前《落草为寇》就是这个形状）'
    ).toEqual([])
  })
})
