/**
 * 选项的「承诺」与「兑现」对账体检。
 *
 * 每个选项结算后会在结果卡上打一排徽章（`result.tags`，形如 `财帛+30`、`道德-20`），
 * 而真正改动数值的是 `effects.attributes / gameState / hidden`
 * （见 `useGameEngine.handleChoice`，它只读 effects，**从来不读 tags** —— tags 是纯展示）。
 * 两边各写各的，就留下一种玩家能直接感觉到的假接口：
 * 徽章写着"财帛+30%"，账户一个子儿没动。
 *
 * 第十四轮从数据里数出来的实例（不是推测）：`gray_bribery_001/002`、
 * `gray_smuggling_001/002`、`gray_fortune_001` 共 **9 个选项**
 * 承诺了财帛却没有声明，而且它们是全仓 7240 条徽章里**唯一 9 条用 `%` 写法**的 ——
 * 也就是这批事件（贪墨 / 走私 / 算命三条灰色支线）整条线的"收钱"环节从未落地。
 * 灰色线因此在数值上是纯惩罚：道德掉了、钱没拿到，玩家选了"受贿"反而更穷。
 * 这也被 `audit:economy` 从另一头印证过：财帛在 1633/1638/1643 三个窗口「正增量补不上负增量」。
 *
 * 这份脚本钉三件事：
 *   1. 徽章承诺了某一维，effects 里必须有这一维（`unfulfilledPromise`）；
 *   2. 声明的符号必须与承诺一致 —— 写着 +30 却结算 −30 更恶劣（`signMismatch`）；
 *   3. 徽章一律用绝对值写法，`%` 是这批遗留数据的指纹（`percentTag`）。
 */
import { GameEvent } from '../src/types/event'
import { allGrayChoiceEvents, initialEvents } from '../src/data/events/index'

export interface Finding {
  kind: 'unfulfilledPromise' | 'signMismatch' | 'percentTag'
  where: string
  detail: string
}

/** 徽章上的维度名 → effects 里该出现的位置与键名 */
const DIMENSIONS: Record<string, { bucket: 'attributes' | 'gameState' | 'hidden'; key: string }> = {
  财帛: { bucket: 'attributes', key: '财帛' },
  文韬: { bucket: 'attributes', key: '文韬' },
  理政: { bucket: 'attributes', key: '理政' },
  武略: { bucket: 'attributes', key: '武略' },
  体质: { bucket: 'attributes', key: '体质' },
  圣眷: { bucket: 'gameState', key: '圣眷' },
  中官: { bucket: 'gameState', key: '中官' },
  清议: { bucket: 'gameState', key: '清议' },
  士绅: { bucket: 'gameState', key: '士绅' },
  民望: { bucket: 'gameState', key: '民望' },
  国势: { bucket: 'gameState', key: '国势' },
  // 隐藏属性在徽章上是两字写法，数据里是「X值」
  道德: { bucket: 'hidden', key: '道德值' },
  野心: { bucket: 'hidden', key: '野心值' },
  欲望: { bucket: 'hidden', key: '欲望值' },
  机敏: { bucket: 'hidden', key: '机敏值' },
  忠诚: { bucket: 'hidden', key: '忠诚值' }
}

/** 徽章形如 `财帛+30` / `民望-15`；只认这两字或三字的已知维度名前缀 */
const TAG_RE = /^([一-龥]{2,3})([+-])(\d+)(%?)$/

export function scanTagEffects(events: GameEvent[] = [...initialEvents, ...allGrayChoiceEvents]): Finding[] {
  const findings: Finding[] = []
  const add = (kind: Finding['kind'], where: string, detail: string) =>
    findings.push({ kind, where, detail })

  for (const event of events) {
    for (const choice of event.choices ?? []) {
      const effects = (choice.effects ?? {}) as Record<string, Record<string, number>>
      for (const rawTag of choice.result?.tags ?? []) {
        const tag = String(rawTag).trim()
        const m = TAG_RE.exec(tag)
        if (!m) continue
        const dim = DIMENSIONS[m[1]]
        if (!dim) continue
        const where = `${event.id}/${choice.id}`
        const signed = (m[2] === '-' ? -1 : 1) * Number(m[3])

        if (m[4] === '%') {
          add('percentTag', where, `徽章「${tag}」用的是百分比写法，结算表只认绝对值`)
        }

        const declared = effects[dim.bucket]?.[dim.key]
        if (declared === undefined) {
          add('unfulfilledPromise', where, `徽章承诺「${tag}」，但 effects.${dim.bucket} 里没有 ${dim.key} —— 选了不涨这条`)
          continue
        }
        if (signed !== 0 && Math.sign(declared) !== Math.sign(signed)) {
          add('signMismatch', where, `徽章「${tag}」与 effects 声明的 ${dim.key}${declared} 方向相反`)
        }
      }
    }
  }
  return findings
}

// 与其余体检脚本同一口径：被测试 import 时不打印（否则每条用例都会带出一段报告）
if (!process.env.VITEST) {
  const pool = [...initialEvents, ...allGrayChoiceEvents]
  const findings = scanTagEffects(pool)
  const options = pool.reduce((n, e) => n + (e.choices?.length ?? 0), 0)
  console.log(`承诺/兑现对账：事件 ${pool.length} 条 / 选项 ${options} 个，问题 ${findings.length}`)
  if (findings.length) {
    for (const f of findings) console.log(`  [${f.kind}] ${f.where} —— ${f.detail}`)
    process.exitCode = 1
  } else {
    console.log('  每个承诺都会结算。')
  }
}
