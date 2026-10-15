/**
 * 违例人名 / 年号体检：崇祯朝（1628–1644）的剧情里不能出现清代人物与清代年号。
 *
 * 第十四轮从 `gray_debauchery_019`「上司献妾」里数出来的：那位"巡抚"被写成
 * **李鸿章**（1823–1901），全条事件 20 处 —— 玩家在游戏里管晚清中兴名臣叫上官。
 * 同批数据里另外七个"康熙 / 乾隆"（`endings_all.ts`）**是合法的**：它们出现在
 * 结局 echo 的"后世史臣曰"段落里（乾隆朝修《明史》、康熙年间于成龙求购某书），
 * 讲的是身死之后的盖棺议论。
 *
 * 所以这份体检刻意**只查"场内"字段**：标题、说明、说话人、引语、背景、现场、
 * 选项文案与结果标题 —— 这些是玩家看到的"此时此刻"；
 * `result.echo` 与 `result.tags` 不查（echo 可以写到身后百年，tags 是数值徽章）。
 * 把这条边界写死，既不会误伤史臣曰，也不会再让"李鸿章"混进崇祯朝。
 */
import { GameEvent } from '../src/types/event'
import { allGrayChoiceEvents, initialEvents } from '../src/data/events/index'
import { allEndingEvents } from '../src/data/events/ending'

export interface Finding {
  kind: 'anachronousName'
  where: string
  detail: string
}

/** 崇祯朝不可能在场的人物与年号（卒年 / 起始年均晚于 1644） */
const FORBIDDEN: Record<string, string> = {
  李鸿章: '晚清重臣（1823–1901）',
  曾国藩: '晚清湘军首领（1811–1872）',
  左宗棠: '晚清重臣（1812–1885）',
  张之洞: '晚清洋务大臣（1837–1909）',
  袁世凯: '清末民初人物（1859–1916）',
  慈禧: '晚清太后（1835–1908）',
  光绪: '清德宗年号（1875 起）',
  宣统: '清逊帝年号（1909 起）',
  同治: '清穆宗年号（1862 起）',
  道光: '清宣宗年号（1821 起）',
  咸丰: '清文宗年号（1851 起）',
  嘉庆: '清仁宗年号（1796 起）',
  乾隆: '清高宗年号（1736 起）',
  雍正: '清世宗年号（1723 起）',
  康熙: '清圣祖年号（1662 起）'
}

/**
 * 「在场」文本 —— 玩家在游戏里当作"当下"读的那些字段。
 * 注意 `echo` 与 `tags` 不在这里，理由见文件头。
 */
function inWorldTexts(event: GameEvent): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = []
  const push = (label: string, text: unknown) => {
    if (typeof text === 'string' && text) out.push({ label, text })
  }
  push('title', event.title)
  push('description', event.description)
  const n = event.narrative
  if (n) {
    push('speaker.title', n.speaker?.title)
    push('speaker.name', n.speaker?.name)
    push('quote', n.quote)
    push('background', n.background)
    push('situation', n.situation)
  }
  for (const choice of event.choices ?? []) {
    push(`${choice.id}.text`, choice.text)
    push(`${choice.id}.description`, choice.description)
    push(`${choice.id}.result.title`, choice.result?.title)
  }
  return out
}

export function scanAnachronisms(
  events: GameEvent[] = [...initialEvents, ...allGrayChoiceEvents, ...allEndingEvents]
): Finding[] {
  const findings: Finding[] = []
  for (const event of events) {
    for (const { label, text } of inWorldTexts(event)) {
      for (const [name, why] of Object.entries(FORBIDDEN)) {
        if (text.includes(name)) {
          findings.push({
            kind: 'anachronousName',
            where: `${event.id} · ${label}`,
            detail: `场内文本出现「${name}」—— ${why}，崇祯朝（1628–1644）不可能在场`
          })
        }
      }
    }
  }
  return findings
}

// 与其余体检脚本同一口径：被测试 import 时不打印
if (!process.env.VITEST) {
  const pool = [...initialEvents, ...allGrayChoiceEvents, ...allEndingEvents]
  const findings = scanAnachronisms(pool)
  console.log(`违例人名体检：事件 ${pool.length} 条，场内文本问题 ${findings.length}`)
  if (findings.length) {
    for (const f of findings) console.log(`  [${f.kind}] ${f.where} —— ${f.detail}`)
    process.exitCode = 1
  } else {
    console.log('  场内没有清代人物与年号（后世史臣曰段落按规则不计）。')
  }
}
