/**
 * 生成甲申终局浏览器实测用的四份存档（一次性脚本，产物在 tmp/1644-saves/）。
 * 每份把 currentEvent 设成那张 1644 历史卡，并把属性/隐藏值喂到「目标选项恰好是
 * 第一个可点选项」——浏览器脚本点 `.choice-card:not(.locked)` 的第一张即可命中。
 * 身上先挂 殉国报君，复现"会被《殉国死节》抢先收走"的真实状态。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initialEvents } from '../src/data/events'

const OUT = fileURLToPath(new URL('../tmp/1644-saves/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const card = (id: string) => initialEvents.find(e => e.id === id)!

const baseChar = (origin: string, attrs: object, hidden: object) => ({
  name: '测试者', courtesyName: '子明', hometown: '南直隶苏州府吴县', age: 40,
  origin, rank: '正七品·知县', degree: '进士',
  attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 50, ...attrs },
  hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50, ...hidden },
  flags: ['地方官任职', '殉国报君'],
  history: [], wives: [], lovers: [], examHistory: [],
  promotionCount: 0, demotionCount: 0,
  faction: { 东林好感: 50, 阉党好感: 50, 立场: '未定', 党争烈度: 30 }
})

const state = () => ({
  currentYear: 1644, currentMonth: 3, turn: 182,
  圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 40
})

const CASES = [
  // 037c1 死守九门：c1 开（体质75 武略65 缙绅），c2 关（文韬50<70），c3 关（野心50<60）→ 第一张=c1
  { endingId: 'ending_city_fall', title: '城破殉城', cardId: 'historical_037', origin: '缙绅', attrs: { 体质: 75, 武略: 65 }, hidden: {} },
  // 038c2 守节不仕：c1 关（道德60<80），c2 开（道德60≥50 缙绅），c3 关（体质50<60）→ 第一张=c2
  { endingId: 'ending_ming_loyalist', title: '遗民守节', cardId: 'historical_038', origin: '缙绅', attrs: {}, hidden: { 道德值: 60 } },
  // 017c3 开城投降：c1 关（出身/武略），c2 关（出身），c3 开（道德20≤35），c4 关（武略50<65）→ 第一张=c3
  { endingId: 'ending_shun_collaborator', title: '降顺仕贼', cardId: 'historical_017', origin: '寒门', attrs: {}, hidden: { 道德值: 20 } },
  // 016c2 诈降反戈：c1 关（体质50<60），c2 开（武略80 理政75），c3 开，c4 开 → 第一张=c2
  { endingId: 'ending_southern_ming', title: '南渡续祚', cardId: 'historical_016', origin: '缙绅', attrs: { 武略: 80, 理政: 75 }, hidden: {} }
]

for (const c of CASES) {
  const ev = card(c.cardId)
  const save = {
    character: baseChar(c.origin, c.attrs, c.hidden),
    gameState: state(),
    eventHistory: [],
    currentEventId: ev.id,
    currentEvent: ev,
    pendingEvents: [],
    origin: c.origin,
    degree: '进士',
    playerName: '测试者',
    identityType: 'official',
    lifeRecords: [],
    savedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    difficulty: 'normal',
    schemaVersion: 1
  }
  writeFileSync(`${OUT}${c.endingId}.json`, JSON.stringify(save))
  console.log(`${c.endingId}《${c.title}》 ← ${c.cardId}「${ev.title}」`)
}
console.log(`written to ${OUT}`)