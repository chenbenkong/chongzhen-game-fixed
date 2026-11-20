/**
 * 生成《天命所归》浏览器实测用存档（一次性脚本，产物在 tmp/ambition-saves/）。
 * 把 currentEvent 设成权谋第一拍 transition_1643_ambition，喂满门槛：
 * 缙绅出身、随军出征 + 拥兵自重（军票，落在 conditions.flags.any 里）、武略 55（≥45）。
 * 1643/6：第一拍年窗 1643–1644。eventHistory 留空，开局剧情线"未启程"，
 * 点 c1【野心萌动】后引擎把当前线设成事件线 power —— 用来在屏上证明这条链归了权谋之术，
 * 而不是改 tag 前的异闻怪谭（c1 是 ordinary，继承事件线）。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initialEvents } from '../src/data/events'

const OUT = fileURLToPath(new URL('../tmp/ambition-saves/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const ev = initialEvents.find(e => e.id === 'transition_1643_ambition')!

const save = {
  character: {
    name: '测试者', courtesyName: '子明', hometown: '南直隶苏州府吴县', age: 46,
    origin: '缙绅', rank: '正七品·知县', degree: '进士',
    attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 55, 体质: 60 },
    hidden: { 道德值: 60, 欲望值: 50, 野心值: 55, 机敏值: 50, 忠诚值: 50 },
    flags: ['地方官任职', '随军出征', '拥兵自重'],
    history: [], wives: [], lovers: [], examHistory: [],
    promotionCount: 0, demotionCount: 0,
    faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }
  },
  gameState: {
    currentYear: 1643, currentMonth: 6, turn: 185,
    圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 30
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

writeFileSync(`${OUT}transition_1643_ambition.json`, JSON.stringify(save))
console.log(`transition_1643_ambition《${ev.title}》 written to ${OUT}`)