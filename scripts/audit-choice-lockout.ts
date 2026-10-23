/**
 * 选项级"硬门槛"体检：盯住**任何玩家都点不动**的选项，和**某个出身整条事件没得选**。
 *
 * 为什么第十五轮要新加这一支：选项级 `showConditions.flags` 以前是一行
 * 「简化处理，假设所有flag都满足」的桩，`origin` 那道门虽然会返回 available:false，
 * 但 `difficulty: 0` 配 d12 骰（`roll >= difficulty` 恒真）等于"勉力一试必中"。
 * 两类门实装之后，门槛真的会把选项锁掉 —— 于是多出两种以前不可能出现的失效：
 * （同一轮还顺手把第三类门 `showConditions.rank` 接上了：它此前根本没人读，
 *  写了等于没写，现在它会真的挡人。）
 *
 *   DEAD_OPTION —— 选项要求的 flag 全内容池没有任何一处会写入。玩家永远拿不到，
 *                  这条选项就是纯装饰，而且是**看得见**的装饰（它会出现在屏幕上并写着"须有这段经历"）。
 *                  以前这类数据只是"没生效"，现在是"永远锁着"，危害更大。
 *   NO_ORIGIN   —— 某个出身在这条事件里一个选项都点不动（全部门槛都把它排除在外）。
 *                  引擎现在有 `hasOpenChoice` 兜底，不会卡死，但代价是**这条事件对该出身永久消失**。
 *                  数据侧要修：要么去掉不该存在的出身门，要么补一条该出身能选的分支。
 *   RAW_FLAG_ID —— 门槛引用的是 `wife_hurt` 这类机器 id，而 `FLAG_GATE_LABELS` 没登记它。
 *                  被锁的选项会把缺哪段经历**印在屏幕上**，于是玩家读到一行调试输出。
 *                  第十七轮浏览器实测逮到的就是这一类（9 个 id 全在家宅/人情一支）。
 *
 * 判定只看"硬"门槛（出身、经历、官阶），不看属性/状态/隐藏那类可以投骰换掉的门 ——
 * 本脚本管的是"有没有出路"，不是"出路贵不贵"。
 * 官阶门按"迟早会升到"计，所以不参与 NO_ORIGIN 的判定；名字合不合法由
 * `audit-value-domains.ts` 负责，两边不重复报同一件事。
 *
 * 扫描逻辑导出为 `scanChoiceLockout()`，CLI 与测试同一口径（`if (!process.env.VITEST)`）。
 */
import { GameEvent } from '../src/types/event'
import { origins } from '../src/data/origins'
import { gateLabel } from '../src/data/flagBiography'
import { allEvents, labelOfPool } from './event-pools'

export interface Finding {
  kind: 'DEAD_OPTION' | 'NO_ORIGIN' | 'ORIGIN_CONTRADICTION' | 'RAW_FLAG_ID'
  where: string
  detail: string
}

const MACHINE_ID = /^[a-z0-9_]+$/

/** 出身子句 → 数组（数据里两种写法都有：`origin: '寒门'` 与 `origin: ['寒门','缙绅']`） */
function originList(v?: string | string[]): string[] | null {
  if (!v) return null
  return Array.isArray(v) ? v : [v]
}

/** 选项上属于"不可努力换取"的那两类要求 */
function hardFlagsOf(choice: GameEvent['choices'][number]) {
  const f = choice.showConditions?.flags
  if (!f) return { need: [] as string[], any: [] as string[] }
  return {
    need: [...(f.has ?? []), ...(f.all ?? [])],
    any: [...(f.any ?? []), ...(f.some ?? [])]
  }
}

export function scanChoiceLockout(events: GameEvent[] = allEvents): Finding[] {
  const findings: Finding[] = []
  const add = (kind: Finding['kind'], where: string, detail: string) => findings.push({ kind, where, detail })

  // 全池能被某个选项写入的 flag 全集 —— 门槛引用了不在这个集合里的名字就是死门。
  const granted = new Set<string>()
  for (const e of events) {
    for (const c of e.choices ?? []) {
      for (const f of c.effects?.flags?.add ?? []) granted.add(f)
    }
  }
  // 引擎/数据侧硬编码写入的两条
  granted.add('地方官任职')

  const originNames = Object.keys(origins)

  const byId = new Map<string, GameEvent>()
  for (const e of events) if (e.id && !byId.has(e.id)) byId.set(e.id, e)

  for (const e of byId.values()) {
    const choices = e.choices ?? []
    if (!choices.length) continue
    const where = `${labelOfPool(e.id)} · ${e.id}「${String(e.title || '').slice(0, 16)}」`

    // 1) 单个选项：要求的经历有没有一条路能拿到
    for (const c of choices) {
      const { need, any } = hardFlagsOf(c)
      const deadNeed = need.filter(f => !granted.has(f))
      if (deadNeed.length) {
        add('DEAD_OPTION', `${where} / 选项 ${c.id}`, `showConditions.flags 要求「${deadNeed.join('、')}」，但全池没有任何选项会写入它 —— 这个选项永远锁着`)
      }
      if (any.length && any.every(f => !granted.has(f))) {
        add('DEAD_OPTION', `${where} / 选项 ${c.id}`, `showConditions.flags.any 列的「${any.join('、')}」全都不会被写入 —— 这个选项永远锁着`)
      }

      // 1b) 选项自带的出身门，和事件自己的出身门能不能同时成立
      //     两边都有 `origin` 而不相交 ⇒ 这个选项对**任何玩家**都不可能点亮：
      //     能看见这条事件的出身，恰好都是这个选项不要的出身。
      const eventOrigin = originList(e.conditions?.origin)
      const choiceOrigin = originList(c.showConditions?.origin)
      // 名字拼错由 audit-value-domains 报，这里只查"两道门互相把对方的人清空了"
      if (eventOrigin && choiceOrigin &&
          eventOrigin.some(o => originNames.includes(o)) &&
          choiceOrigin.some(o => originNames.includes(o)) &&
          !choiceOrigin.some(o => eventOrigin.includes(o))) {
        add('ORIGIN_CONTRADICTION', `${where} / 选项 ${c.id}`, `选项只给出身「${choiceOrigin.join('、')}」，而这条事件本身只对「${eventOrigin.join('、')}」开放 —— 两边无交集，这个选项永远不会出现`)
      }

      // 1c) 这道门的文案会不会印出机器 id？
      //     六种子句都会印（`相冲`那两支在玩家**带着**该经历时印），所以一并查。
      //     `since` 也印：锁住时说的是「〈这段经历〉之后，还得再等 X 年」，主语就是它。
      //     判据用的是渲染方同一个 `gateLabel`，表和文案不可能各说各话。
      const sf = c.showConditions?.flags
      const printed = [
        ...(sf?.has ?? []), ...(sf?.all ?? []), ...(sf?.any ?? []), ...(sf?.some ?? []),
        ...(sf?.notHas ?? []), ...(sf?.none ?? []), ...Object.keys(sf?.since ?? {})
      ].filter(f => MACHINE_ID.test(f) && !gateLabel(f))
      if (printed.length) {
        add('RAW_FLAG_ID', `${where} / 选项 ${c.id}`, `门槛引用了没登记人话的机器 id「${printed.join('、')}」—— 玩家会在锁定的选项下面读到它`)
      }
    }

    // 2) 事件级：某个出身是否一个选项都点不动
    //    经历门槛按"能满足"计（玩家理论上可以走对上一支），出身门槛按"该出身"计。
    const flagOpenable = (c: GameEvent['choices'][number]) => {
      const { need, any } = hardFlagsOf(c)
      if (any.length && any.every(f => !granted.has(f))) return false
      return need.every(f => granted.has(f))
    }
    // 事件级本来就限定了出身的话，那些被排除在外的出身不算"内容消失" ——
    // 它们在这条事件出现之前就已经被 `checkEventConditions` 挡掉了。
    // 不扣这一层，本脚本会把每一条带出身限定的事件都报成"其他出身没得选"。
    const eligibleOrigins = e.conditions?.origin
      ? originNames.filter(o => (Array.isArray(e.conditions!.origin) ? e.conditions!.origin : [e.conditions!.origin]).includes(o))
      : originNames
    const deadForOrigin = eligibleOrigins.filter(o =>
      !choices.some(c => {
        const cond = c.showConditions
        if (!cond) return true
        if (cond.origin) {
          const allowed = Array.isArray(cond.origin) ? cond.origin : [cond.origin]
          if (!allowed.includes(o)) return false
        }
        return flagOpenable(c)
      })
    )
    if (deadForOrigin.length === eligibleOrigins.length && eligibleOrigins.length) {
      add('NO_ORIGIN', where, `全部 ${choices.length} 个选项对**所有在场出身**（${eligibleOrigins.join('、')}）都点不动 —— 这条事件已被引擎的 hasOpenChoice 永久过滤`)
    } else if (deadForOrigin.length) {
      add('NO_ORIGIN', where, `出身「${deadForOrigin.join('、')}」在这条事件里一个选项都点不动 —— 该出身永远撞不到它`)
    }
  }

  return findings
}

if (!process.env.VITEST) {
  const findings = scanChoiceLockout()
  const counts = {
    DEAD_OPTION: findings.filter(f => f.kind === 'DEAD_OPTION').length,
    NO_ORIGIN: findings.filter(f => f.kind === 'NO_ORIGIN').length,
    ORIGIN_CONTRADICTION: findings.filter(f => f.kind === 'ORIGIN_CONTRADICTION').length,
    RAW_FLAG_ID: findings.filter(f => f.kind === 'RAW_FLAG_ID').length
  }
  console.log(`硬门槛体检：事件 ${allEvents.length} 条（去重后 ${new Set(allEvents.map(e => e.id)).size}）`)
  console.log(
    `永锁选项 ${counts.DEAD_OPTION} 处 / 出身级无出路事件 ${counts.NO_ORIGIN} 处 / ` +
      `出身门互相抵消 ${counts.ORIGIN_CONTRADICTION} 处 / 门槛文案漏机器 id ${counts.RAW_FLAG_ID} 处\n`
  )
  for (const f of findings) console.log(`  [${f.kind}] ${f.where}\n      ${f.detail}`)
  if (findings.length) process.exitCode = 1
  else console.log('  每个选项都还有路可走，锁住它们时说的也是人话。')
}
