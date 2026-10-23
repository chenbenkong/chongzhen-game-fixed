/**
 * 结局图鉴 ↔ 成就 ↔ 事件 id 三方对账体检。
 *
 * 为什么需要这一道。图鉴判断"某一格点亮没有"的方式，过去是把成就 id 砍掉
 * `_done` 直接当事件 id 用；成就判据写的是 `eventHistory.includes('...')` 硬字符串；
 * 引擎还会在触发破产时把注册 id 改名（`withEndingId`）。三条链各自以为"名字当然对得上"，
 * **没有任何一处把它们放在一起比过**，于是错了也没人知道。
 *
 * 实测代价（都是第十三轮从数据里数出来的，不是推测）：
 *   · 44 个格子里 10 个没有任何成就判据指向它们 —— 全是边界/阈值结局
 *     （病逝任上、龙颜震怒、宦官构陷、士林唾弃、乡绅反目、民怨沸腾、众叛亲离、
 *      东林烈士、权奸末路、党争牺牲品）。模拟跑 12 局就能撞到其中 6 个，
 *      玩家反复打到，图鉴那一格永远灰。
 *   · 破产的成就判据要 `ending_bankrupt`，格子 id 是 `triggerable_bankrupt`，
 *     于是达成过也永远灰（现在由 ENDING_ID_ALIASES 换算）。
 *   · 「罢黜归田」整条结局只在引擎里内联存在，图鉴根本没这一格，而成就却会点亮。
 *
 * 三条都已经修掉，这份脚本负责让它们**不再悄悄长回来**：
 * 尤其第 6 项 —— 每一格都必须有一条成就判据指着它，一格不许漏。
 * （第五十二轮之前那里有一份显式名单，兜着"Steam 上限 100 已用满、这十格先不补成就"；
 *  上限解除后名单清空，检查本身留着。）
 */
import { allEndingEvents, triggerableEndingEvents } from '../src/data/events/ending'
import { ENDING_ID_ALIASES, ENDING_TILE_IDS, resolveEndingTileId } from '../src/data/endingRegistry'
import { ALL_ACHIEVEMENTS } from '../src/types/achievement'
import { ENDING_ARCHETYPES } from '../src/utils/endingSystem'

export interface Finding {
  kind: string
  where: string
  detail: string
}

/** 图鉴 detail 弹窗会读的四段文字，缺一段就是空屏 */
const TIER_LABELS = [
  'legendary', 'saintly', 'bittersweet', 'tragic',
  'dark', 'controversial', 'mysterious', 'redemptive'
] as const

/**
 * 有格子、但没有成就指向它 —— 第五十二轮起这份名单是**空的**，所以不再需要名单。
 *
 * 它原先登记了十条边界/阈值结局，理由是"Steam 单 App 成就上限 100 已经用满"。
 * 上限解除之后（本作不上 Steam），第 6 项检查改成无条件：每一格都必须有一条成就判据
 * 指着它。留着名单等于留一条"以后再补"的路，而这条路已经没有必要。
 * 达成记录（`AchievementData.reachedEndings`）仍然是图鉴的第二条点亮链，
 * 它服务的是补成就**之前**就已经达成过那些结局的老存档。
 */

/** 结局成就 → 判据里那个 eventHistory id。读不出来就返回 null（调用方必须报出来，不能跳过）。 */
function requiredEventId(ach: { id: string; checkUnlock: (ctx: any) => boolean }): string | null {
  const src = ach.checkUnlock.toString()
  const m = src.match(/includes\(\s*['"]([^'"]+)['"]\s*\)/)
  return m ? m[1] : null
}

export function scanEndingCodex(): Finding[] {
  const findings: Finding[] = []
  const add = (kind: string, where: string, detail: string) => findings.push({ kind, where, detail })

  // 1. 格子 id 撞号：两格同 id 时 unlockedCount 会一次 +2 而成就只点亮一条，
  //    进度百分比直接失真。
  const seen = new Map<string, number>()
  for (const e of allEndingEvents as any[]) {
    seen.set(e.id, (seen.get(e.id) ?? 0) + 1)
  }
  for (const [id, n] of seen) {
    if (n > 1) add('dupTile', id, `${n} 个格子共用 id，图鉴进度与"已达成"标记都会算错`)
  }

  const categoryKeys = Object.keys(ENDING_ARCHETYPES)

  // 2. 格子自身可渲染性 + 3/4. 卷首与 tier 必须在组件认识的集合里
  for (const e of allEndingEvents as any[]) {
    const cat = e.endingConfig?.category
    const tier = e.endingConfig?.tier
    if (!cat || !categoryKeys.includes(cat)) {
      add('badCategory', e.id, `category=${JSON.stringify(cat)} 不在 ENDING_ARCHETYPES 里，会被塞进"异闻卷"或干脆没有 tab`)
    }
    if (!tier || !(TIER_LABELS as readonly string[]).includes(tier)) {
      add('badTier', e.id, `tier=${JSON.stringify(tier)} 不在图鉴的 8 档里，标签会显示成"奇遇"`)
    }
    if (!e.title) add('tileUnrenderable', e.id, '缺 title')
    for (const key of ['quote', 'background', 'situation'] as const) {
      const text = e.narrative?.[key]
      if (typeof text !== 'string' || !text.trim()) add('tileUnrenderable', e.id, `缺 narrative.${key}（详情弹窗那一段会是空白）`)
    }
    const echo = e.choices?.[0]?.result?.echo
    if (typeof echo !== 'string' || !echo.trim()) add('tileUnrenderable', e.id, '缺 choices[0].result.echo（"结局演绎"那一段会是空白）')
  }

  // 5. 每条结局成就都必须能对上一格；读不出判据 id 的也要报，不能让体检假装它不存在
  const requiredByAchievement = new Set<string>()
  for (const ach of ALL_ACHIEVEMENTS) {
    if (!(ach.id.startsWith('ending_') && ach.id.endsWith('_done'))) continue
    const raw = requiredEventId(ach)
    if (!raw) {
      add('unparsedAchievement', ach.id, `判据写法机器读不出来：${ach.checkUnlock.toString().slice(0, 90)}`)
      continue
    }
    const tile = resolveEndingTileId(raw)
    if (!tile) {
      add('achievementWithoutTile', ach.id, `判据要的 eventHistory id '${raw}' 在图鉴里没有格子（成就会亮，图鉴永远查不到这一条）`)
      continue
    }
    requiredByAchievement.add(tile)
  }

  // 6. 有格子无成就 —— 第五十二轮起一格都不许有（不再有"名额不够"这个理由）
  for (const id of ENDING_TILE_IDS.filter(t => !requiredByAchievement.has(t)).sort()) {
    add('tileWithoutAchievement', id, '没有任何成就判据指向它，只能靠达成记录点亮 —— 补一条 ending_*_done，判据写这格的事件 id')
  }

  // 7. 别名必须指向真实格子
  for (const [from, to] of Object.entries(ENDING_ID_ALIASES)) {
    if (!ENDING_TILE_IDS.includes(to)) add('aliasDangling', from, `别名指向不存在的格子 '${to}'`)
    if (ENDING_TILE_IDS.includes(from)) add('aliasRedundant', from, '这个名字本身就是格子 id，不需要别名')
  }

  // 8. 边界池里的结局事件（真会被引擎触发的那批）必须都有格子，
  //    否则玩家撞到了却查不到 —— 这正是 ending_demotion 的成因。
  for (const e of triggerableEndingEvents as any[]) {
    if (!resolveEndingTileId(e.id)) {
      add('triggerableWithoutTile', e.id, `边界池里的结局事件在图鉴里没有格子（${e.title ?? '无题'}）`)
    }
  }

  return findings
}

// 与其余体检脚本同一口径：被测试 import 时不打印（否则每条用例都会带出一段报告）
if (!process.env.VITEST) {
  const findings = scanEndingCodex()
  const endingAchievements = ALL_ACHIEVEMENTS.filter(a => a.id.startsWith('ending_') && a.id.endsWith('_done'))
  console.log(`结局图鉴对账：格子 ${ENDING_TILE_IDS.length}，结局成就 ${endingAchievements.length}，问题 ${findings.length}`)
  if (findings.length) {
    for (const f of findings) console.log(`  [${f.kind}] ${f.where} —— ${f.detail}`)
    process.exitCode = 1
  } else {
    console.log('  三方（图鉴 / 成就 / 事件 id）对得上。')
  }
}
