/**
 * audit-narrative-claims —— 正文里「你被革职 / 下狱 / 抄家 / 流放 / 贬为庶民 / 连降三级」
 * 这类**法律身份变更**的声称，必须和这一选真正写进存档的东西对得上。
 *
 * 为什么单开这一张网：现有 21 个体检脚本盯的都是数据形状（键认得吗、年窗自洽吗、
 * 门票有没有写手、标签和效果一致吗），**没有一条读"正文说了什么"**。
 * 于是出现了一类只在玩家眼里才算 bug 的缺陷 —— 玩家读完自己被革职抄家，
 * 下个月照常上朝。本轮清掉的九处（全部只改正文，判定与数值一个没动）：
 *   gray_informer_002/c1「你被革职下狱，家产抄没」→ 条件句（东厂拿到口供才发生）
 *   historical_004/c1「贬为庶民」→ 只留廷杖（体伤不作持久状态）
 *   route_loyal_minister/c1「贬了一级」→ 弹章留中、考语添字
 *   route_impeach_ministers/c2「贬到岭南」→ 留中 + 送匾
 *   route_faction_imprisoned/c1「着即下锦衣卫诏狱勘问」→ 交部议处（下一道才是诏狱）
 *   figure_sun_chuanting/c3「连降三级，贬为庶民」→ 罚俸一年、原衙门照坐
 *   echo_faction_005/c1「降一级调用」→ 罚俸一年、不许升转
 *   echo_emotion_003/c3「降一级留任」→ 罚俸一年、留任原职
 *   gray_smuggling_001/c2「被革职查办、家产抄没」→ 失察罚俸、官还在
 *   gray_fortune_002/c1「生擒、下诏狱、革职谪戍」→ 案子落成妖言惑众、官照做
 * （其中 historical_004 与 gray_fortune 的例子还各自顺手删掉了一笔无来由的进项/结局。）
 *
 * 口径（为什么只查这一小类，不查"升官""罚俸"）：
 *  - 身份变更（丢官、入狱、抄家、流放、降级、削籍）是**玩家看得见的状态**：
 *    顶栏的品级还在、人还在任上，正文却说他成了庶民 —— 这不是文风问题，
 *    是正文与存档互相打脸。降级同属此列：品级是政绩分的纯函数，选项没有 rank 字段。
 *  - 升迁与赏赐由引擎按月判定（政绩分 → RANKS），正文写"补了某缺"是叙事上的一次安排；
 *    把它也塞进正则只会产出噪音（实测 23 处里 19 处是"你放下茶杯"这种误命中）。
 *  - 罚俸 / 申饬 / 切责 / 戴罪 / 听勘 / 留用 是**过程与名誉**，不改变官身，
 *    本轮刻意不查也不改（全库约十余处，扣不扣银子不影响玩家对身份的认知）。
 *  - 廷杖 / 杖责是**一次性体伤**，引擎没有伤病系统，写进正文不构成状态谎言。
 *
 * 判定：命中的每一处，必须在**同一个选项**的 `effects.flags.add` 里带一张状态票
 * （含 革职/罢官/削籍/夺职/下狱/诏狱/抄家/流放/遣戍/戍边/贬/谪/降 任一字样）。
 * 想表达"威胁"而不写既成事实，就把句子改成条件句（"只要……下一道就是诏狱"）。
 *
 * 不查的两类事件池：
 *  - 结局池（`ending` / `triggerable`）：结局正文的职责就是把这个人怎么结束的说清楚。
 *  - 结局前夜（`isPreEnding` / 带 `linksToEndingId`）：下一屏就是那一格，正文写什么都对得上。
 */
import { allEvents, poolOf } from './event-pools'

const CLAIM = new RegExp(
  [
    // 你被…（直接处分）
    '你(?:也|就|又)?被(?:连降|降[一二三四五六]?级|降为|贬为|贬官|贬了?[一二三四]?级|贬到|革职|罢官|削籍|削职|夺职|褫夺|下狱|入狱|押进|生擒|抄家|流放|遣戍|戍边)',
    // 你作为"同谋"被革职
    '你作为[^。；\\n]{0,12}(?:被|遭)(?:革职|下狱|抄家|流放|贬)',
    // 你以"协从"论，降一级
    '你(?:以|坐|因)[^。；\\n]{0,8}(?:降[一二三四五六]?级|贬[一二三四]?级)',
    // 你被切责、罚俸，降一级留任（处分词夹在中间）
    '你被[^。；\\n]{0,10}(?:降[一二三四五六]?级|贬[一二三四]?级)',
    // 圣旨：着即下锦衣卫诏狱 / 革职拿问（中间允许夹"下锦衣卫"这类限定）
    '着即[^。；\\n]{0,8}(?:下诏狱|诏狱|革职|拿问|抄家|流放|谪戍)'
  ].join('|'),
  'g'
)

/** 状态票的识别词：写在这些字上的 flag 视为"正文的处分有机械痕迹"。 */
const STATUS_TOKENS = ['革职', '罢官', '削籍', '夺职', '下狱', '诏狱', '抄家', '流放', '遣戍', '戍边', '贬', '谪', '降']

/** 已复核、确认不是"既成事实"的句子。现在为空 —— 九处全部改写，不需要豁免。 */
const REVIEWED: string[] = []

export interface NarrativeClaim {
  id: string
  pool: string
  title: string
  choiceId: string
  /** 命中的原句（用于报错定位） */
  sentence: string
  /** 这一选写下的 flag */
  flags: string[]
}

const statusFlagged = (flags: string[]) => flags.some(f => STATUS_TOKENS.some(t => f.includes(t)))

/**
 * 一句话里有没有"硬处分"的声称。单独导出是为了让用例能拿**修复前的原句**当阳性对照 ——
 * 一张从来不会响的网比没有网更糟，它会让下一个人以为这类句子已经被盯着了。
 */
export function findHardClaims(text: string): string[] {
  CLAIM.lastIndex = 0
  return text.match(CLAIM) ?? []
}

/** 返回所有"正文说了处分、数据没留痕"的候选（0 条 = 干净）。 */
export function scanNarrativeClaims(events: any[] = allEvents): NarrativeClaim[] {
  const out: NarrativeClaim[] = []
  for (const e of events) {
    const pool = poolOf.get(e?.id) ?? 'pool'
    if (pool === 'ending' || pool === 'triggerable') continue
    if (e?.isPreEnding || e?.linksToEndingId) continue
    for (const c of e.choices ?? []) {
      const texts = [c.result?.echo ?? '', c.resultDescription ?? '']
      for (const text of texts) {
        const hits = findHardClaims(text)
        if (!hits.length) continue
        const flags: string[] = c.effects?.flags?.add ?? []
        if (REVIEWED.includes(`${e.id}/${c.id}`)) continue
        if (statusFlagged(flags)) continue
        const at = text.indexOf(hits[0])
        const sentence = text.slice(Math.max(0, at - 26), at + hits[0].length + 34).replace(/\n/g, ' ')
        out.push({ id: e.id, pool, title: e.title, choiceId: c.id, sentence, flags })
      }
    }
  }
  return out
}

if (!process.env.VITEST) {
  const bad = scanNarrativeClaims()
  if (!bad.length) {
    console.log('正文处分声称：0 处无机械痕迹（结局池 / 结局前夜不计；罚俸·申饬·廷杖不在口径内）')
    process.exit(0)
  }
  console.error(`正文处分声称：${bad.length} 处没有机械痕迹 ——`)
  for (const b of bad) {
    console.error(`  [${b.pool}] ${b.id} 《${b.title}》 / ${b.choiceId}`)
    console.error(`      命中：…${b.sentence}…`)
    console.error(`      这一选写下的 flag：${b.flags.join('、') || '无'}`)
  }
  process.exit(1)
}
