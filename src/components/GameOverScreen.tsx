import { useMemo, useEffect, useRef, useState } from 'react'
import { Character, GameStateValues } from '../types/game'
import { GameEvent } from '../types/event'
import { getUnlockedAchievements, Achievement } from '../types/achievement'
import { extractCounterfactuals, getArchetype, toChineseNum, toMingEraYear } from '../utils/endingSystem'
import { deathCauseOf } from '../utils/deathCause'
import { resolveEndingTileId } from '../data/endingRegistry'
import { relationshipEpilogue, relationshipsOf } from '../data/characters'
import { downloadShareCard } from '../utils/shareCard'
import {
  computeLegacyGain,
  legacyGoalStatus,
  legacyRunKey,
  recordLegacyRun,
  type LegacyGain,
  type LegacyGoalId
} from '../data/legacy'
import Icon from './Icon'
import './GameOverScreen.css'

interface GameOverScreenProps {
  endingEvent: GameEvent | null
  character: Character
  gameState: GameStateValues
  /** 人物志（明史列传风格）— 由 GameScreen 在 handleGameOver 时生成 */
  biography?: string
  onRestart: () => void
  /** 是否还能回到触发结局的事件重选；没有可重选事件时为 false。 */
  canRestart?: boolean
  /** 该事件已经重选过一次且再次触发结局，按钮锁定。 */
  restartLocked?: boolean
  onReturnToMenu: () => void
  onViewLifeReview?: () => void
  /** 本局带的家训目标；由本局家训决定，结局页只判一次。 */
  legacyGoalId?: LegacyGoalId
}

type EndingType = 'legendary' | 'good' | 'normal' | 'bad' | 'dark'

// 属性定义（4 档制评级）
type AttrTone = 'good' | 'mid' | 'low' | 'bad'

interface AttrCell {
  name: string
  value: number
  level: string
  tone: AttrTone
}

export default function GameOverScreen({
  character,
  gameState,
  endingEvent,
  biography,
  onRestart,
  canRestart = true,
  restartLocked = false,
  onReturnToMenu,
  onViewLifeReview,
  legacyGoalId
}: GameOverScreenProps) {
  const achievements = getUnlockedAchievements()
  const unlockedAchievements = achievements

  // 反事实面板（从结局的 c2/c3 选项提取"若当年…则…"推演）
  const counterfactuals = useMemo(() => {
    return endingEvent ? extractCounterfactuals(endingEvent) : []
  }, [endingEvent])

  const {
    endingType, score, finalRank, posthumousTitle, historicalRank, evaluationText
  } = useMemo(() => {
    return calculateEnding(character, gameState)
  }, [character, gameState])

  const serviceMonths = Math.max(0, (gameState.currentYear - 1628) * 12 + (gameState.currentMonth - 1))
  const totalYearsText = serviceMonths === 0
    ? '不足一年'
    : serviceMonths < 12
      ? `${toChineseNum(serviceMonths)}个月`
      : `${toChineseNum(Math.floor(serviceMonths / 12))}年又${toChineseNum(serviceMonths % 12)}个月`
  const eventCount = (character.history?.length || 0)

  // 13 个属性分 3 组
  const attrGroups = useMemo(() => buildAttrGroups(character, gameState), [character, gameState])

  const endingTitle = endingEvent?.title.replace(/【?结局】?\s*/g, '').trim() || '结局'
  const archetype = endingEvent ? getArchetype(endingEvent.endingConfig?.category) : undefined
  const endingSummary = buildEndingSummary(endingEvent)
  const endingDate = `${toMingEraYear(gameState.currentYear)} ${getChineseMonth(gameState.currentMonth)}月`
  const deathCause = useMemo(
    () => deathCauseOf(endingEvent ? resolveEndingTileId(endingEvent.id) : null),
    [endingEvent]
  )
  const relationships = useMemo(
    () => relationshipEpilogue(character.flags),
    [character.flags]
  )
  const sharePeople = useMemo(
    () => relationshipsOf(character.flags)
      .slice(0, 3)
      .map(({ character: person }) => `${person.name}　${person.title}`),
    [character.flags]
  )
  const handleSaveShareCard = () => {
    downloadShareCard({
      name: character.name,
      courtesyName: character.courtesyName,
      origin: character.origin,
      finalRank,
      endingTitle,
      evaluation: evaluationText,
      years: totalYearsText,
      score,
      date: endingDate,
      people: sharePeople
    })
  }

  // P1 传承：结局只结算一次，按 runKey 去重；同一局刷新结局页不会重复发点。
  const legacyRecordedKey = useRef<string | null>(null)
  const [legacyGain, setLegacyGain] = useState<LegacyGain>({ 门生: 0, 著作: 0, 家训: 0 })
  useEffect(() => {
    if (!endingEvent) return
    const runKey = legacyRunKey({
      endingId: endingEvent.id,
      name: character.name || '无名',
      date: endingDate,
      score
    })
    if (legacyRecordedKey.current === runKey) return
    legacyRecordedKey.current = runKey
    const result = recordLegacyRun({
      runKey,
      gain: computeLegacyGain({ score, character, gameState })
    })
    setLegacyGain(result.gained)
  }, [endingEvent?.id, character, gameState, score, endingDate])
  const legacyGoal = useMemo(
    () => legacyGoalStatus(legacyGoalId, character, gameState),
    [legacyGoalId, character, gameState]
  )

  return (
    <div className={`ending-screen ending-${endingType}`}>
      <div className="ending-bg-pattern"></div>
      <div className="ending-vignette"></div>

      <div className="ending-container ending-container--compact">
        {/* 只留结局本身：卷首、人物、评价，不再铺陈通用卷名。 */}
        <header className="ending-hero">
          <div className="ending-hero-copy">
            <div className="ending-eyebrow">
              {archetype && (
                <>
                  <span className="ending-archetype" title={archetype.intro}>{archetype.name}</span>
                  <span className="ending-eyebrow-dot">·</span>
                </>
              )}
              <span>{endingDate}</span>
            </div>
            <h1 className="ending-hero-title">{endingTitle}</h1>
            <div className="ending-hero-meta">
              <span className="ending-hero-name">{character.name || '无名氏'}</span>
              <span className="ending-meta-dot">·</span>
              <span>{finalRank}</span>
              <span className="ending-meta-dot">·</span>
              <span className="ending-posthumous">谥 {posthumousTitle}</span>
            </div>
          </div>
          <div className="ending-score" aria-label={`功过 ${score} 分，${historicalRank}`}>
            <div className="ending-score-value">
              {score}<small>分</small>
            </div>
            <div className="ending-score-rank">{historicalRank}</div>
          </div>
        </header>

        {endingSummary && (
          <p className="ending-summary">{endingSummary}</p>
        )}

        {relationships && (
          <div className="ending-relationships" aria-label="这一生绕不开的人">
            <span className="ending-relationships-label">故 人</span>
            <p className="ending-relationships-text">{relationships}</p>
          </div>
        )}

        {legacyGoal && (
          <div className={`ending-legacy-goal ${legacyGoal.achieved ? 'is-achieved' : 'is-missed'}`}>
            <span className="ending-legacy-label">家 训 目 标</span>
            <span className="ending-legacy-title">{legacyGoal.goal.label}</span>
            <span className="ending-legacy-status">
              {legacyGoal.achieved ? '达成' : '未达成'} · {legacyGoal.goal.hint}
            </span>
          </div>
        )}

        {(legacyGain.门生 > 0 || legacyGain.著作 > 0 || legacyGain.家训 > 0) && (
          <div className="ending-legacy-gain">
            <span className="ending-legacy-label">传 家</span>
            <span>门生 +{legacyGain.门生}</span>
            <span>著作 +{legacyGain.著作}</span>
            <span>家训 +{legacyGain.家训}</span>
            <span className="ending-legacy-hint">下一局可带一条</span>
          </div>
        )}

        {deathCause && (
          <div className="ending-cause" aria-label="直接死因">
            <span className="ending-cause-label">直接死因</span>
            <strong className="ending-cause-value">{deathCause.label}</strong>
            <span className="ending-cause-tip">下一局：{deathCause.tip}</span>
          </div>
        )}

        <div className="ending-facts" aria-label="一生概要">
          <div className="ending-fact">
            <span>宦海</span>
            <strong>{totalYearsText}</strong>
          </div>
          <div className="ending-fact">
            <span>历任</span>
            <strong>{getPositionCount(character)} 职</strong>
          </div>
          <div className="ending-fact">
            <span>经历</span>
            <strong>{eventCount} 事</strong>
          </div>
          <div className="ending-fact">
            <span>成就</span>
            <strong>{unlockedAchievements.length} 项</strong>
          </div>
        </div>

        {/* 详细内容默认收起：不给玩家一上来塞满两栏文字和十三格属性。 */}
        <details className="ending-details">
          <summary className="ending-details-summary">
            <span>完整史传与功过</span>
            <span className="ending-details-hint">展开查看</span>
          </summary>

          <div className="ending-details-body">
            <section className="ending-detail-section ending-detail-biography">
              <h2 className="ending-detail-title">史 馆 传 略</h2>
              <pre className="comment-biography">{biography || '史传未成。'}</pre>
            </section>

            <section className="ending-detail-section">
              <h2 className="ending-detail-title">属 性 与 成 就</h2>

              {attrGroups.map((group) => (
                <div key={group.title} className="attr-group">
                  <div className="attr-group-title">
                    <span className="attr-group-name">{group.title}</span>
                    <span className="attr-group-line"></span>
                  </div>
                  <div className="attr-cells">
                    {group.cells.map((cell) => (
                      <div key={cell.name} className={`attr-cell tone-${cell.tone}`}>
                        <div className="attr-cell-name">{cell.name}</div>
                        <div className="attr-cell-val">{cell.value}</div>
                        <div className="attr-cell-lv">{cell.level}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="micro-divider"></div>

              <div className="merit-subtitle">青 史 留 名</div>
              {unlockedAchievements.length > 0 ? (
                <div className="achievements-grid">
                  {unlockedAchievements.map((a) => {
                    const cat = getAchievementTone(a)
                    return (
                      <div key={a.id} className={`achievement-item tone-${cat}`} title={a.description}>
                        <span className="achievement-name">{a.name}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-state-mini">未曾留下青史之名</div>
              )}
            </section>

            {counterfactuals.length > 0 && (
              <section className="ending-detail-section ending-detail-wide">
                <h2 className="ending-detail-title">其 他 可 能</h2>
                <div className="counterfactual-list">
                  {counterfactuals.map((cf, i) => (
                    <div key={i} className="counterfactual-item">
                      <div className="counterfactual-title">{cf.endingTitle}</div>
                      <p className="counterfactual-text">{cf.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </details>

        <footer className="ending-actions ending-actions--footer">
          {onViewLifeReview && (
            <button className="end-btn secondary" onClick={onViewLifeReview}>
              <span className="btn-icon"><Icon name="scroll" size={14} color="#c9a227" /></span>
              <span>查看生平</span>
            </button>
          )}
          <button className="end-btn secondary" onClick={handleSaveShareCard}>
            <span className="btn-icon"><Icon name="scroll" size={14} color="#c9a227" /></span>
            <span>保存青史卡</span>
          </button>
          <button className="end-btn secondary" onClick={onReturnToMenu}>
            <span className="btn-icon"><Icon name="flower" size={14} color="#c9a227" /></span>
            <span>返回首页</span>
          </button>
          <button
            className="end-btn primary"
            onClick={onRestart}
            disabled={!canRestart}
            title={restartLocked ? '同一事件只能重选一次' : undefined}
          >
            <span className="btn-icon"><Icon name="shuffle" size={14} color={canRestart ? '#0a0806' : '#6b6257'} /></span>
            <span>{restartLocked ? '重走人生 · 已锁' : '重走人生'}</span>
          </button>
        </footer>
      </div>
    </div>
  )
}

/** 结算页摘要：优先用结局卡自带的短描述，不回放整篇回音。 */
function buildEndingSummary(event: GameEvent | null): string {
  if (!event) return ''
  const description = event.description?.trim()
  if (description) return normalizeParagraphs(description)

  const choice = event.choices?.find(c => c.resultDescription?.trim() || c.result?.echo?.trim())
  if (!choice) return ''
  if (choice.resultDescription?.trim()) return normalizeParagraphs(choice.resultDescription)

  const echo = choice.result?.echo?.trim() || ''
  const paragraphs = echo
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('【'))
  return paragraphs[0] || ''
}

function normalizeParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
}

// ============================================================
// 评价系统：基于真实属性动态计算 endingType
// 道德值 0-100
//   >75 君子 / >50 正直 / >25 常人 / ≤25 小人
// ============================================================
function calculateEnding(character: Character, gameState: GameStateValues): {
  endingType: EndingType
  score: number
  rating: number
  finalRank: string
  posthumousTitle: string
  historicalRank: string
  evaluationText: string
  evaluationSub: string
} {
  // 综合分（100 分制）：
  //  能力均值 30% + 朝堂均值 30% + 道德均值 40%
  //  满分 100，最低 0；扣分项：贪腐、野心钻营、道德崩塌
  const attrs = character.attributes
  const hid = character.hidden
  const gs = gameState

  const abilityMean = (attrs.财帛 + attrs.文韬 + attrs.理政 + attrs.武略 + attrs.体质) / 5
  const courtMean  = (gs.圣眷 + gs.中官 + gs.清议 + gs.士绅 + gs.民望) / 5
  // 道德 60% 权重 + 欲望反向 40% 权重（欲望越低越好）
  const moralMean  = hid.道德值 * 0.6 + (100 - hid.欲望值) * 0.4

  // 贪腐/钻营/道德崩塌扣分（最高 -60）
  const corruptionDeduction =
    (attrs.财帛 >= 85 && gs.清议 < 30 ? 30 : 0) +   // 财高+清议低 = 贪墨
    (hid.野心值 >= 70 && gs.中官 >= 70 && gs.清议 < 40 ? 20 : 0) + // 钻营阉党
    (hid.道德值 <= 20 ? 25 : 0)                            // 道德崩塌

  // 基础分（满 100）
  const baseScore = abilityMean * 0.30 + courtMean * 0.30 + moralMean * 0.40
  const score = Math.max(0, Math.min(100, Math.round(baseScore - corruptionDeduction)))

  // 结局类型决策
  let endingType: EndingType
  if (hid.道德值 <= 20 || corruptionDeduction >= 50) {
    endingType = 'dark' // 道德崩塌/巨贪
  } else if (score >= 88 && hid.道德值 >= 60) {
    endingType = 'legendary' // 高分 + 高道德
  } else if (score >= 70) {
    endingType = 'good'
  } else if (score >= 45) {
    endingType = 'normal'
  } else {
    endingType = 'bad'
  }

  // 星等（基于 100 分制）
  let rating: number
  if (endingType === 'dark')      rating = 1
  else if (score >= 88)           rating = 5
  else if (score >= 75)           rating = 4
  else if (score >= 55)           rating = 3
  else if (score >= 35)           rating = 2
  else                            rating = 1

  // 评语 + 副评
  const { main, sub } = buildEvaluation(endingType, character, gameState)

  return {
    endingType,
    score,
    rating,
    finalRank: getFinalRank(character),
    posthumousTitle: getPosthumousTitle(endingType, hid.道德值),
    historicalRank: getHistoricalRank(rating, endingType),
    evaluationText: main,
    evaluationSub: sub
  }
}

// 构建属性组
function buildAttrGroups(character: Character, gameState: GameStateValues) {
  const a = character.attributes
  const h = character.hidden
  const g = gameState

  const cell = (name: string, value: number, threshold: number, label: { good: string; mid: string; low: string; bad: string }): AttrCell => {
    let level: string
    let tone: AttrTone
    if (value >= threshold) { level = label.good; tone = 'good' }
    else if (value >= threshold - 25) { level = label.mid; tone = 'mid' }
    else if (value >= threshold - 50) { level = label.low; tone = 'low' }
    else { level = label.bad; tone = 'bad' }
    return { name, value: Math.max(0, Math.min(100, Math.round(value))), level, tone }
  }

  return [
    {
      title: '个人能力',
      cells: [
        cell('财帛', a.财帛, 75, { good: '豪富', mid: '小康', low: '清贫', bad: '困顿' }),
        cell('文韬', a.文韬, 75, { good: '才高', mid: '通文', low: '粗识', bad: '不学' }),
        cell('理政', a.理政, 75, { good: '能臣', mid: '称职', low: '平庸', bad: '尸位' }),
        cell('武略', a.武略, 75, { good: '将才', mid: '知兵', low: '疏武', bad: '怯懦' }),
        cell('体质', a.体质, 75, { good: '强健', mid: '平康', low: '多病', bad: '垂危' })
      ]
    },
    {
      title: '朝堂人望',
      cells: [
        cell('圣眷', g.圣眷, 75, { good: '圣宠', mid: '受记', low: '平常', bad: '失宠' }),
        cell('中官', g.中官, 75, { good: '心腹', mid: '亲近', low: '疏远', bad: '敌视' }),
        cell('清议', g.清议, 75, { good: '清望', mid: '中立', low: '孤立', bad: '声败' }),
        cell('士绅', g.士绅, 75, { good: '拥戴', mid: '支持', low: '疏离', bad: '反对' }),
        cell('民望', g.民望, 75, { good: '爱戴', mid: '称颂', low: '平淡', bad: '怨声' })
      ]
    },
    {
      title: '心性操守',
      cells: [
        cell('道德', h.道德值, 75, { good: '君子', mid: '正直', low: '常人', bad: '小人' }),
        cell('欲望', h.欲望值, 75, { good: '清心', mid: '淡泊', low: '有欲', bad: '炽烈' }),
        cell('野心', h.野心值, 75, { good: '无竞', mid: '务实', low: '有图', bad: '勃勃' })
      ]
    }
  ]
}

// 评语构造器 —— 全部按真实属性动态生成，杜绝死数据
function buildEvaluation(
  endingType: EndingType,
  character: Character,
  gameState: GameStateValues
): { main: string; sub: string } {
  const a = character.attributes
  const h = character.hidden
  const g = gameState
  const rank = character.rank || '未入仕'
  const degree = character.degree || ''
  const promotions = character.promotionCount ?? 0
  const demotions = character.demotionCount ?? 0
  const startYear = 1628
  const serviceYears = Math.max(0, g.currentYear - startYear)
  const months = g.currentMonth

  // ============ 1) 开篇：点出身份、仕途、任期 ============
  const openingParts: string[] = []
  // 出身 + 科举
  if (degree === '进士') openingParts.push('公以进士出身')
  else if (degree === '举人') openingParts.push('公以举人出身')
  else openingParts.push('公以诸生起于乡里')

  // 仕途高度 + 任期
  if (rank.includes('一品')) openingParts.push(`位列${rank}`)
  else if (rank.includes('二品') || rank.includes('三品')) openingParts.push(`官至${rank}`)
  else if (rank.includes('知县') || rank.includes('七品')) openingParts.push(`释褐为${rank}`)
  else if (rank) openingParts.push(`历任${rank}`)
  else openingParts.push('未获实授')

  // 任期与起伏
  if (serviceYears > 0) {
    openingParts.push(`宦海凡${serviceYears}年${months}月`)
  }
  if (promotions >= 3) openingParts.push(`其间累迁${promotions}次`)
  else if (promotions >= 1) openingParts.push(`间有升迁${promotions}次`)
  if (demotions >= 3) openingParts.push(`亦遭贬谪${demotions}次`)
  else if (demotions >= 1) openingParts.push(`亦经蹉跌${demotions}次`)

  const opening = openingParts.join('，') + '。'

  // ============ 2) 能力评点（突出最强与最弱，差距明显时分述） ============
  const abilities: Array<{ name: string; value: number; label: string }> = [
    { name: '理政', value: a.理政, label: a.理政 >= 75 ? '治政有方' : a.理政 >= 50 ? '称职' : a.理政 >= 25 ? '平庸' : '昏聩' },
    { name: '文韬', value: a.文韬, label: a.文韬 >= 75 ? '下笔成章' : a.文韬 >= 50 ? '通晓文墨' : a.文韬 >= 25 ? '粗识文理' : '不学无术' },
    { name: '武略', value: a.武略, label: a.武略 >= 75 ? '善用兵' : a.武略 >= 50 ? '粗知兵事' : a.武略 >= 25 ? '疏于武备' : '怯懦不堪' },
    { name: '财帛', value: a.财帛, label: a.财帛 >= 75 ? '家赀丰盈' : a.财帛 >= 50 ? '家道小康' : a.财帛 >= 25 ? '家道清贫' : '家徒四壁' },
    { name: '体质', value: a.体质, label: a.体质 >= 75 ? '体魄强健' : a.体质 >= 50 ? '身体平康' : a.体质 >= 25 ? '多病之躯' : '形销骨立' }
  ]
  // 找最高和最低
  const sortedAbs = [...abilities].sort((x, y) => y.value - x.value)
  const top = sortedAbs[0]
  const bottom = sortedAbs[sortedAbs.length - 1]

  let abilityLine = ''
  if (top.value - bottom.value >= 20 && top.value >= 50) {
    abilityLine = `论才则所长在${top.name}（${top.label}），所短在${bottom.name}（${bottom.label}）。`
  } else if (top.value < 30) {
    abilityLine = `论才则诸事平庸，${sortedAbs.map(x => x.name).join('、')}皆不足观。`
  } else {
    const avg = Math.round(sortedAbs.reduce((s, x) => s + x.value, 0) / sortedAbs.length)
    abilityLine = avg >= 60
      ? `论才则诸事尚可，${top.name}尤为所长。`
      : `论才则无甚突出，${top.name}稍可，其余皆平平。`
  }

  // ============ 3) 朝中人望 ============
  const courtBits: string[] = []
  if (g.圣眷 >= 75) courtBits.push('圣上倚为心膂')
  else if (g.圣眷 >= 50) courtBits.push('圣眷尚稳')
  else if (g.圣眷 >= 25) courtBits.push('圣眷平平')
  else courtBits.push('为圣上所弃')

  if (g.清议 >= 75) courtBits.push('清流交相称誉')
  else if (g.清议 <= 25 && g.圣眷 <= 25) courtBits.push('清流侧目')
  else if (g.清议 <= 25) courtBits.push('清议多有指摘')

  if (g.中官 >= 75) {
    if (h.野心值 >= 60) courtBits.push('与中官交结甚深，恐有干进之嫌')
    else courtBits.push('与中官颇相得')
  }
  else if (g.中官 <= 25) courtBits.push('与阉宦势同水火')

  const courtLine = courtBits.length > 0
    ? `论朝中则${courtBits.join('，')}。`
    : ''

  // ============ 4) 地方与民心 ============
  const localBits: string[] = []
  if (g.民望 >= 75) localBits.push('所至之处，百姓口碑甚佳')
  else if (g.民望 <= 25) localBits.push('所至之处，民怨颇深')
  if (g.士绅 >= 75) localBits.push('乡绅拥戴，颇有根基')
  else if (g.士绅 <= 25) localBits.push('乡绅掣肘，难以施展')

  const localLine = localBits.length > 0
    ? `论地方则${localBits.join('，')}。`
    : ''

  // ============ 5) 心性操守 ============
  const heartBits: string[] = []
  if (h.道德值 >= 75) heartBits.push('持身清正，操守端方')
  else if (h.道德值 >= 50) heartBits.push('德行尚可')
  else if (h.道德值 <= 25) {
    if (h.欲望值 >= 60) heartBits.push('贪鄙无厌，操守全丧')
    else heartBits.push('操守有亏，颇滋物议')
  }

  if (h.野心值 >= 75) heartBits.push('其志不小，颇有干进之心')
  else if (h.野心值 <= 25 && endingType !== 'bad' && endingType !== 'dark') heartBits.push('恬淡自守，无竞于时')

  const heartLine = heartBits.length > 0
    ? `论心性则${heartBits.join('，')}。`
    : ''

  // ============ 6) 收束句（按 endingType 给定总评） ============
  const closerByType: Record<EndingType, string> = {
    legendary: '综其生平，德才兼备，治政修文，皆有可观。诚一代名臣，青史流芳，百世之下，犹令人景仰。',
    good: '综其生平，居官有惠，于民有劳，虽未至宰辅之位，亦不失为循良之吏。',
    normal: '综其生平，居其位而守其职，循例而行，未闻大善，亦未闻大恶。',
    bad: '综其生平，无赫赫之功业，有碌碌之嗟叹，史笔所载，亦不过寥寥数语而已。',
    dark: '综其生平，贪鄙成性，操守全丧，清议不容，民怨载道，青史之上，留此丑名，百世之下，犹为人所指。'
  }
  const closer = closerByType[endingType]

  // ============ 拼装主评 ============
  const main = [opening, abilityLine, courtLine, localLine, heartLine, closer]
    .filter(Boolean)
    .join('')

  // ============ 副评：精炼一句作为"具体褒贬"附加（与主评互补） ============
  const subBits: string[] = []
  if (a.财帛 >= 85 && g.清议 < 30) subBits.push('广积财货而清议不齿，是为贪墨之迹')
  else if (a.财帛 >= 85) subBits.push('其家赀颇丰')
  else if (a.财帛 <= 20) subBits.push('其家甚清贫')
  if (g.圣眷 <= 20 && !courtLine.includes('为圣上所弃')) subBits.push('为圣上所弃')
  if (g.民望 >= 75 && !localLine.includes('百姓口碑甚佳')) subBits.push('百姓口碑甚佳')
  if (g.中官 <= 20 && !courtLine.includes('阉宦')) subBits.push('与阉宦势同水火')
  if (g.清议 <= 20 && !courtLine.includes('清流')) subBits.push('清流侧目而视')
  if (h.野心值 >= 80 && !heartLine.includes('干进')) subBits.push('其志不小')
  if (h.野心值 <= 20 && !heartLine.includes('恬淡')) subBits.push('其志恬退')

  const sub = subBits.length > 0 ? subBits.join('，') + '。' : ''

  return { main, sub }
}

// 成就色调分类：按 category 分配色系 + 负面成就额外标红
function getAchievementTone(a: Achievement): string {
  // 负面成就（贬官、贪官、不幸、悲剧、沦陷等）
  const negativeIds = [
    'fallen_official', 'poor', 'weak', 'corrupt_official', 'unlucky',
    'bad_ending', 'tragic_ending', 'year_1644', 'year_1645', 'half_decade'
  ]
  if (negativeIds.includes(a.id)) return 'negative'

  switch (a.category) {
    case 'attribute':    return 'attribute'   // 属性类（高财、高文等）→ 绿
    case 'relationship': return 'relationship'// 关系类（清议、士绅等）→ 紫
    case 'career':       return 'career'      // 仕途类（升官、贬官中正面的）→ 金
    case 'endgame':      return 'endgame'     // 结局类 → 橙
    case 'special':      return 'special'     // 特殊（持有时间等）→ 暗金
    default:             return 'career'
  }
}

function getFinalRank(character: Character) {
  if (character.rank?.includes('一品')) return '一品大员'
  if (character.rank?.includes('二品')) return '封疆大吏'
  if (character.rank?.includes('三品')) return '九卿之位'
  if (character.rank?.includes('四品')) return '道台之职'
  if (character.rank?.includes('五品')) return '知府之位'
  if (character.rank?.includes('六品')) return '知州之职'
  if (character.rank?.includes('七品')) return '知县之位'
  return '乡绅之属'
}

function getPosthumousTitle(endingType: EndingType, moral: number) {
  // 谥号既要按结局分，也要按道德分
  if (moral <= 25) return '缪丑'
  if (endingType === 'legendary') return moral >= 75 ? '文正' : '文忠'
  if (endingType === 'good') return '文忠'
  if (endingType === 'normal') return '文敏'
  if (endingType === 'bad') return '文戾'
  return '缪丑'
}

function getHistoricalRank(rating: number, endingType: EndingType) {
  if (endingType === 'dark') return '遗臭万年'
  if (endingType === 'bad') return '声名狼藉'
  switch (rating) {
    case 5: return '千古名臣'
    case 4: return '一代贤良'
    case 3: return '循吏之名'
    case 2: return '平庸之辈'
    case 1: return '默默无闻'
    default: return '默默无闻'
  }
}

function getChineseMonth(month: number) {
  const months = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
  return months[month - 1] || '正'
}

function getPositionCount(character: Character) {
  // 历任官职以实际升降次数 + 1 估算，避免只显示当前官职
  return Math.max(1, 1 + character.promotionCount + character.demotionCount)
}
