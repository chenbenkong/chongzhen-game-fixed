/**
 * 生成《松锦决》浏览器实测用存档（一次性脚本，产物在 tmp/songjin-saves/）。
 * 把 currentEvent 设成第三拍前奏卡 route_songjin_decision，喂满门槛：
 * 军户出身、边关任职 + 松锦未决（第二拍写下的临时坝）+ 随军出征（军票），
 * 道德值 65（c2「死守松山」showConditions ≥60 恰好开），体质 70（c2 后 50，
 * 仍远高于《战死沙场》的 ≤8 门 —— 用来在屏上证明这一格是被 endingId 当场收走）。
 * 1639/8：第三拍年窗 min 1639、月窗 8，且 1639 是探针实测的安全空档
 * （1640 正月有医圣/名臣第二道坝，详见 endings_all.ts §8.25 注释）。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initialEvents } from '../src/data/events'

const OUT = fileURLToPath(new URL('../tmp/songjin-saves/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const ev = initialEvents.find(e => e.id === 'route_songjin_decision')!

const save = {
  character: {
    name: '测试者', courtesyName: '子明', hometown: '南直隶苏州府吴县', age: 40,
    origin: '军户', rank: '正七品·知县', degree: '进士',
    attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 70 },
    hidden: { 道德值: 65, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
    flags: ['地方官任职', '边关任职', '松锦未决', '随军出征'],
    history: [], wives: [], lovers: [], examHistory: [],
    promotionCount: 0, demotionCount: 0,
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }
  },
  gameState: {
    currentYear: 1639, currentMonth: 8, turn: 139,
    圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 40
  },
  eventHistory: [],
  currentEventId: ev.id,
  currentEvent: ev,
  pendingEvents: [],
  origin: '军户',
  degree: '进士',
  playerName: '测试者',
  identityType: 'official',
  lifeRecords: [],
  savedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  difficulty: 'normal',
  schemaVersion: 1
}

writeFileSync(`${OUT}route_songjin_decision.json`, JSON.stringify(save))
console.log(`route_songjin_decision《${ev.title}》 written to ${OUT}`)