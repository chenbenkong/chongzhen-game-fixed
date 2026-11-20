/**
 * 生成「南迁伏笔 → 衣冠南渡」接力浏览器实测用存档（§8.27，产物在 tmp/nationfall-saves/）。
 * 三张存档把整条接力摆到屏上：
 *  A transition_184《李自成进兵》1643/10 —— 点 c2【主张迁都】，验证它真的写下 主张南迁（修前不落票）。
 *  B aftermath《天崩地坼》1644/5，flags=[南渡长江]（无主张南迁）—— c4【按早定的路线南下】应当锁着。
 *  C aftermath《天崩地坼》1644/5，flags=[南渡长江,主张南迁] —— c4 解锁，点它停在《天崩地坼 · 衣冠南渡》。
 * B/C 都带 南渡长江，所以 c1【投降清朝】(notHas 南渡长江) 恒锁 —— 顺带证明立场互斥没被破坏。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initialEvents } from '../src/data/events'

const OUT = fileURLToPath(new URL('../tmp/nationfall-saves/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const t184 = initialEvents.find(e => e.id === 'transition_184')!
const aftermath = initialEvents.find(e => e.id === 'transition_1644_aftermath')!

function base(ev: typeof t184, year: number, month: number, turn: number, guoshi: number, flags: string[]) {
  return {
    character: {
      name: '测试者', courtesyName: '子明', hometown: '南直隶苏州府吴县', age: 48,
      origin: '缙绅', rank: '正七品·知县', degree: '进士',
      attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 60 },
      hidden: { 道德值: 60, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
      flags,
      history: [], wives: [], lovers: [], examHistory: [],
      promotionCount: 0, demotionCount: 0,
      faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }
    },
    gameState: {
      currentYear: year, currentMonth: month, turn,
      圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: guoshi
    },
    eventHistory: [],
    currentEventId: ev.id,
    currentEvent: ev,
    pendingEvents: [],
    origin: '缙绅',
    degree: '进士',
    playerName: '测试者',
    identityType: 'official',
    lifeRecords: [],
    savedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    difficulty: 'normal',
    schemaVersion: 1
  }
}

writeFileSync(`${OUT}transition_184.json`, JSON.stringify(base(t184, 1643, 10, 189, 30, [])))
writeFileSync(`${OUT}aftermath_neg.json`, JSON.stringify(base(aftermath, 1644, 5, 196, 10, ['南渡长江'])))
writeFileSync(`${OUT}aftermath_pos.json`, JSON.stringify(base(aftermath, 1644, 5, 196, 10, ['南渡长江', '主张南迁'])))
console.log(`nationfall relay saves written to ${OUT}: transition_184 / aftermath_neg / aftermath_pos`)