import { describe, expect, it } from 'vitest'
import { allEndingEvents } from '../../src/data/events/ending'
import { DECLINABLE_ENDING_IDS } from '../../src/data/endingDecline'

/**
 * 「正文说结束了，就必须真的结束」（第五十六轮）。
 *
 * 引擎只认一个终止标记：`effects.special.type === 'ending'`（`useGameEngine` 里两处）。
 * 于是有一种格子缺陷量具测不出来、玩家却一定撞得上：选项的正文已经写完了一生
 * ——「【结局·教书育人】」「【游戏结束】」——但没写那个标记，玩家点完发现界面还在问他
 * 「下一个月」。**图鉴把这一格标成结局，格子自己也说这是结局，只有引擎不同意。**
 *
 * 为什么要用「正文声称」当尺子，而不是「所有结局格选项一律终止」：
 * 结局格上的 42 条非终止选项里，35 条的正文第一行写的是
 * 【反事实推演·…】/【极致推演·…】 —— 那是史官在玩家面前推演另一种可能，
 * 它明说"这是推演"，推演完人当然还在宦海里（第十九轮「史馆请笔」整套设计就靠这个）。
 * 把它们判成撒谎就是判错。真正撒谎的是那几条自己盖了「结局」/「游戏结束」戳的。
 *
 * 例外只有【搁笔】（`DECLINE_CHOICE_ID`）：它承诺的就是"不盖棺"，正文写的也是
 * 「传未成，人还在宦海里」，与终止标记一致地缺席。第三条用例反向钉住它。
 */

const tiles = allEndingEvents.filter(e => e.type === 'ending')
const isTerminal = (c: any) => c?.effects?.special?.type === 'ending'

/** 这条选项有没有在自己身上盖"结束"的戳：正文里的 结局/游戏结束 标记，或 tags 里的 游戏结束 */
const claimsEnding = (c: any): string => {
  const echo: string = c.result?.echo ?? ''
  const hit = echo.match(/【(结局·[^】]*|游戏结束)】/g) ?? []
  const marks = [...new Set([...hit, ...(c.result?.tags ?? []).filter((t: string) => t === '游戏结束')])]
  return marks.join(' ')
}

describe('结局卡：声称结束的选项必须真的结束', () => {
  it('覆盖面不许缩水：43 格 type:ending 仍在池子里', () => {
    expect(
      tiles.length,
      `只有 ${tiles.length} 格 type:'ending'（2026-10-23 实测 43 格）—— ` +
        '这一轮只该动选项的终止标记，格子数量掉了说明有别的改动进来了'
    ).toBeGreaterThanOrEqual(40)
  })

  it('不许出现"正文已盖结局戳、引擎却不收尾"的选项', () => {
    const liars: string[] = []
    for (const t of tiles) {
      for (const c of t.choices ?? []) {
        if (isTerminal(c)) continue
        const mark = claimsEnding(c)
        if (!mark) continue
        liars.push(`${t.id}《${t.title}》/${c.id}「${c.text}」盖了戳却不收尾：${mark}`)
      }
    }
    expect(
      liars,
      '这些选项自己写了「【结局·…】」或「【游戏结束】」，却没带 special:ending —— ' +
        '玩家读完这一生还要被问下一个月。要么补标记，要么把正文里的结局戳改成推演写法'
    ).toEqual([])
  })

  it('每一格结局至少有一条真能收尾的选项', () => {
    const dead = tiles
      .filter(t => !(t.choices ?? []).some(isTerminal))
      .map(t => `${t.id}《${t.title}》：${(t.choices ?? []).length} 条选项全不收尾`)
    expect(
      dead,
      '这些格子没有任何一条路能结案：命中即开卡，玩家只能继续活 —— ' +
        '而年窗一过就再也没有格子收他（§1.4 ㉟ 的形状）'
    ).toEqual([])
  })

  it('请笔卡的【搁笔】必须确实不终止 —— 反向也要钉住', () => {
    const broken: string[] = []
    for (const id of DECLINABLE_ENDING_IDS) {
      const t = tiles.find(x => x.id === id)
      const decline = t?.choices?.find((c: any) => c.id === 'c_decline')
      if (!decline) broken.push(`${id}：请笔卡缺【搁笔】选项`)
      else if (isTerminal(decline)) broken.push(`${id}：【搁笔】竟然会终止游戏`)
    }
    expect(broken).toEqual([])
  })
})
