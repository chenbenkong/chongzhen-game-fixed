import { describe, expect, it } from 'vitest'
import { allEvents } from '../../scripts/event-pools'
import { allEndingEvents } from '../../src/data/events/ending'

/**
 * 「正文说人死了，引擎却还问下一个月」（第七十四轮）。
 *
 * 引擎只认 `effects.special.type === 'ending'` 这一个终止标记。任何**不带这个标记**的选项，
 * 点完以后游戏都会继续 —— 于是正文里写完的死亡、出殡、追赠、活到八十岁，全都成了谎：
 * 玩家刚读完自己被凌迟夷三族，下一个月屏幕还在问他要不要修河堤。
 *
 * 这里的尺子只看「主语是你」的收束句：玩家自己的死、自己的身后事、自己整段人生的结账。
 * NPC 的死（卢督师殉国、崇祯自缢）、百姓因你而死、"要求将你凌迟"这种请愿、
 * "你没有殉国"这种否定、以及"你的心已经死了"这种比喻都不算 —— 它们列在 `ALLOW` 里，
 * 每条都要写清理由，且由第二条用例钉住"判例不许过期"。
 *
 * 【反事实推演】/【极致推演】开头的回音是史官在玩家面前推演另一种可能，本来就明说不是事实，
 * 与 `audit.endingTerminality` 同一口径，不算。
 *
 * 修法只有两条：要么把正文收在死之前（死亡交给真正的结局格去写），要么补上终止标记。
 * 不许把规则放宽到"认不出就算了"。
 */

const RULES: Array<[string, RegExp]> = [
  ['殉国', /你[^。！？\n]{0,12}殉国(而死|了|$|[。，])/],
  ['自尽', /你[^。！？\n]{0,30}(自缢|悬梁|自尽|上吊)/],
  ['处死', /将你[^。！？\n]{0,6}(凌迟|处死|斩首|问斩|族诛)|你[^。！？\n]{0,16}(被|遭)(凌迟|处死|斩首|问斩|杀害|族诛|夷三族)/],
  ['老死', /你[^。！？\n]{0,10}老死/],
  ['活到', /你(最终)?活到[了]?[一二三四五六七八九十百]+岁/],
  ['终', /你[^。！？\n]{0,8}(无疾而终|病逝|去世|死了|病故|殁于)/],
  ['走了', /你(已经)?(走了|没了)[。！，]/],
  ['临终', /你[^。！？\n]{0,4}(临终|临死|死前)/],
  ['你的死', /你的死[，。！]/],
  ['身后', /你的?(墓志铭|灵柩|墓碑|身后事)|你(的)?(家人|仆从|亲兵|族人)[^。]{0,12}(安葬|埋葬|收殓)/],
  ['岁那年', /[一二三四五六七八九十]+岁那年[^。！？\n]{0,20}(死|终|病|倒|走|逝)/],
  ['享年', /你(享年|卒年)/],
  ['余日', /你[^。！？\n]{0,6}(度过余生|度过了余生|终老|了此残生)/],
]

/**
 * 判例白名单：命中了规则、但句子的主语不是"死了的你"。
 * 每一条都必须写理由；第二条用例会反向检查——正文改了、不再命中规则时，这条判例要删掉。
 */
const ALLOW = new Map<string, string>([
  ['historical_010/c3', '「卢督师殉国」是 NPC；这句话里的"你"在同生共死的誓词里'],
  ['historical_007/c4', '「士子们……要求将你凌迟处死」是请愿，不是已经发生的事'],
  ['historical_017/c4', '「崇祯皇帝自缢殉国」是 NPC 的死'],
  ['transition_1644_night_before/c4', '「你没有殉国」是否定句'],
  ['route_corrupt/c1', '「你的心——已经死了」是比喻'],
  ['echo_family_008/c2', '「你妻室病故」死的是配偶'],
])

const HYPOTHETICAL = /^【(反事实|极致)推演/
const key = (id: string, cid: string) => `${id}/${cid}`

const scan = (): Array<{ key: string; label: string; rules: string[]; lines: string[] }> => {
  const found: Array<{ key: string; label: string; rules: string[]; lines: string[] }> = []
  for (const e of allEvents) {
    if (e.type === 'ending') continue
    for (const c of e.choices ?? []) {
      if (c.effects?.special?.type === 'ending') continue
      const echo = c.result?.echo ?? ''
      if (!echo || HYPOTHETICAL.test(echo)) continue
      const rules = RULES.filter(([, re]) => re.test(echo)).map(([n]) => n)
      if (!rules.length) continue
      found.push({
        key: key(e.id, c.id),
        label: `${e.id}《${e.title}》/${c.id}「${c.text}」`,
        rules,
        lines: echo.split('\n').filter((l: string) => RULES.some(([, re]) => re.test(l))),
      })
    }
  }
  return found
}

describe('非结局选项的正文：不许写玩家自己的死与身后事', () => {
  it('没有"正文写死了、引擎却继续问下一个月"的选项', () => {
    const liars = scan()
      .filter(h => !ALLOW.has(h.key))
      .map(h => `${h.label} [${h.rules.join(',')}]\n      ${h.lines[0]?.trim().slice(0, 90) ?? ''}`)
    expect(
      liars,
      '这些选项的正文写完了玩家的死/身后/一生，却没带 special:ending —— 玩家读完自己的葬礼，' +
        '下一个月还要接着上衙。要么把正文收在死之前（死亡交给结局格），要么补终止标记'
    ).toEqual([])
  })

  it('判例不许过期：每条白名单都必须仍然命中规则', () => {
    const live = new Set(scan().map(h => h.key))
    const stale = [...ALLOW.keys()].filter(k => !live.has(k))
    expect(
      stale,
      '这些白名单条目已经不命中任何规则了（正文改过 / 选项删了）—— 死判例会遮住后来新写进来的死'
    ).toEqual([])
  })

  it('规则本身有牙：拿本轮修过的六条原句回放，必须全部命中', () => {
    const specimens = [
      '最终...北京城破了。你力战不退，壮烈殉国。',
      '你追随崇祯皇帝，殉国而死。',
      '然后，你悬梁自尽。',
      '你七十六岁那年无疾而终。皇帝辍朝三日，追赠太师。',
      '你最终老死乡间，无人知晓你曾经是大明的官员。',
      '崇祯帝亲自下旨，将你凌迟处死，夷三族。',
    ]
    const missed = specimens.filter(s => !RULES.some(([, re]) => re.test(s)))
    expect(missed, '量具自己失灵了：这些原句是第七十四轮实测出来的漏网句').toEqual([])
  })
})

/**
 * 路线卡的收据（【这一段记在案：…《某格》…】）点名的格子必须真的存在。
 * 第七十二轮把 9 张票接进结局格，同时要求"回音点名真格"；这里把那条要求变成钉子，
 * 免得以后写一张不存在的格子名，玩家照着找不到。
 */
describe('路线卡收据点名的格子必须存在于图鉴', () => {
  const tileTitles = new Set(allEndingEvents.filter(e => e.type === 'ending').map(e => e.title))
  const NAMED = /《([^》]+)》/g

  it('收据里出现的《…》要么是结局格，要么是本局眼前的事件（不在收据里点名）', () => {
    const dangling: string[] = []
    for (const e of allEvents) {
      for (const c of e.choices ?? []) {
        const echo = c.result?.echo ?? ''
        const receipt = echo.match(/【这一段记在案：[^】]*】/)
        if (!receipt) continue
        for (const m of receipt[0].matchAll(NAMED)) {
          if (!tileTitles.has(m[1])) dangling.push(`${e.id}/${c.id}：收据点名《${m[1]}》，图鉴里没有这一格`)
        }
      }
    }
    expect(dangling, '收据是给玩家看的承诺：点名的格子必须能在图鉴里找到').toEqual([])
  })
})
