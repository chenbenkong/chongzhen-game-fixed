import { memo, useState, useEffect, useId, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { isTypingTarget } from '../utils/isTypingTarget'
import { GameEvent, EventChoice } from '../types/event'
import { Character, GameStateValues } from '../types/game'
import { ATTR_DISPLAY_MAP, STATE_DISPLAY_MAP } from '../utils/constants'
import { checkChoiceRequirement, type ChoiceCheckResult } from '../utils/choiceRequirements'
import { motionDelay } from '../utils/motion'
import { getStoryline } from '../data/storylines'
import { useModal } from '../hooks/useModal'
import DiceAnimation from './DiceAnimation'
import Icon from './Icon'
import './EventDisplay.css'

interface EventDisplayProps {
  event: GameEvent | null
  character: Character
  gameState: GameStateValues
  onChoice?: (choice: EventChoice, opts?: { random?: boolean }) => void
  onContinue?: () => void
  onUndo?: () => void
  onGameOver?: () => void
  canUndo?: boolean
  isProcessing?: boolean
  pendingCount?: number
  /**
   * 当前事件的抉择是否已作出（结果态）。
   *
   * 底部「进 下 月」要靠它决定自己该不该可点：
   *   · 还没选 → 不能点（否则玩家会跳过抉择）
   *   · 已选   → 可以点，作用等同于面板里的「继 续」
   *
   * 此前这个状态只存在于本组件内部，外层完全看不到，
   * 于是「进 下 月」只能用 `!currentEvent` 判断 —— 只要有事件就永久禁用，
   * 实际游玩 120 步里可点状态出现 0 次，成了死 UI。
   */
  onResolvedChange?: (resolved: boolean) => void
  /** 是否启用 1-9 数字键选选项（弹窗打开时应关掉） */
  shortcutsEnabled?: boolean
  isGhostMode?: boolean
  onChoiceSelect?: (choiceId: string) => void
  showResult?: boolean
  selectedChoiceId?: string | null
  onBackToChoices?: () => void
  onDeathEnding?: (ending: {
    type: 'martyrdom' | 'suicide' | 'killed' | 'execution'
    title: string
    description: string
    echo: string
    tags: string[]
  }) => void
}


/**
 * 根据选项的"成功时的效果"反推失败时的合理副作用。
 * 原则：成功+的属性，失败时按比例扣回；隐藏属性默认道德-、野心+。
 */
function deriveFailEffects(choice: EventChoice): {
  attributes?: Record<string, number>
  gameState?: Record<string, number>
  hidden?: Record<string, number>
} {
  const attrs = (choice.effects && choice.effects.attributes) || {}
  const gs = (choice.effects && choice.effects.gameState) || {}
  const hid = (choice.effects && choice.effects.hidden) || {}

  const failAttrs: Record<string, number> = {}
  const failGs: Record<string, number> = {}
  const failHid: Record<string, number> = {}

  // 1. 属性类
  if (typeof attrs.体质 === 'number' && attrs.体质 > 0) {
    failAttrs.体质 = -Math.min(5, Math.max(2, Math.ceil(attrs.体质 / 2)))
  } else if (typeof attrs.体质 === 'number' && attrs.体质 < 0) {
    // 成功时就要扣体质的事件（如苦差事），失败时扣更多
    failAttrs.体质 = -Math.min(8, Math.max(3, Math.abs(attrs.体质)))
  }
  if (typeof attrs.财帛 === 'number' && attrs.财帛 > 0) {
    failAttrs.财帛 = -Math.min(8, Math.max(3, Math.ceil(attrs.财帛 / 2)))
  }
  if (typeof attrs.武略 === 'number' && attrs.武略 > 0) {
    failAttrs.武略 = -Math.min(3, Math.max(1, Math.ceil(attrs.武略 / 3)))
  }
  if (typeof attrs.理政 === 'number' && attrs.理政 > 0) {
    failAttrs.理政 = -Math.min(3, Math.max(1, Math.ceil(attrs.理政 / 3)))
  }
  if (typeof attrs.文韬 === 'number' && attrs.文韬 > 0) {
    failAttrs.文韬 = -Math.min(3, Math.max(1, Math.ceil(attrs.文韬 / 3)))
  }

  // 2. 朝堂指标
  if (typeof gs.圣眷 === 'number' && gs.圣眷 > 0) {
    failGs.圣眷 = -Math.min(8, Math.max(3, Math.ceil(gs.圣眷 / 2)))
  }
  if (typeof gs.清议 === 'number' && gs.清议 > 0) {
    failGs.清议 = -Math.min(8, Math.max(3, Math.ceil(gs.清议 / 2)))
  }
  if (typeof gs.民望 === 'number' && gs.民望 > 0) {
    failGs.民望 = -Math.min(8, Math.max(3, Math.ceil(gs.民望 / 2)))
  }
  if (typeof gs.中官 === 'number' && gs.中官 > 0) {
    failGs.中官 = -Math.min(6, Math.max(2, Math.ceil(gs.中官 / 2)))
  }

  // 3. 隐藏属性
  if (typeof hid.道德值 === 'number' && hid.道德值 > 0) {
    failHid.道德值 = -Math.min(5, Math.max(2, Math.ceil(hid.道德值 / 2)))
  } else {
    failHid.道德值 = -2
  }
  failHid.野心值 = (typeof hid.野心值 === 'number')
    ? Math.max(2, Math.ceil(Math.abs(hid.野心值) / 2 + 1))
    : 2

  // 兜底
  const totalFail = Object.values(failAttrs).reduce((s, v) => s + Math.abs(v), 0) +
                    Object.values(failGs).reduce((s, v) => s + Math.abs(v), 0)
  if (totalFail === 0) {
    failAttrs.体质 = (failAttrs.体质 ?? 0) - 2
  }

  return {
    attributes: Object.keys(failAttrs).length ? failAttrs : undefined,
    gameState: Object.keys(failGs).length ? failGs : undefined,
    hidden: Object.keys(failHid).length ? failHid : undefined
  }
}

/**
 * 根据所选选项、失败条件、事件背景，生成跟事件强相关的失败回音。
 * 优先级：事件描述 > 选项意图 > 失败条件原因。
 */
function generateFailEcho(
  choice: EventChoice,
  dice: { reason?: string; conditionType?: string; conditionKey?: string; difficulty?: number; gap?: number },
  event: GameEvent | null
): { title: string; description: string; echo: string } {
  const eventDesc = event?.description || event?.narrative?.situation || ''
  // 从 choice.text 中精准提取【...】中的标签（如"【全力赈灾】"当..." → "全力赈灾"）
  const tagMatch = (choice.text || '').match(/【([^】]+)】/)
  const choiceText = (tagMatch ? tagMatch[1] : (choice.text || '')).trim()
  const reason = dice.reason || ''
  // 从 reason 中提取属性名（"文韬不足（需≥50，当前33）" → "文韬"）。
  // 先去掉"不足""差距"等后缀词，避免"道德值不足"被抓成"道德值不足"
  const reasonTrimmed = reason.replace(/(不足|差距|太低|欠缺)$/g, '')
  // 属性名通常 2~3 个汉字：圣眷/清议/民望/文韬/武略/理政/体质/中官/士绅/财帛/道德值
  // 用 [\u4e00-\u9fa5] 限定仅匹配汉字，并用 (?=[不足低欠差（）(]) 断言后跟边界字符，
  // 避免"武略不足"被贪心匹配成"武略不足"
  const keyMatch = reasonTrimmed.match(/^([\u4e00-\u9fa5]{2,4})(?=[不足低欠差（）(])/)
  const lackingKey = keyMatch ? keyMatch[1] : (dice.conditionKey || '')

  // 缺什么能力的"中文修饰词"（不含"不足"二字，避免与 reason 里的"不足"重复）
  const lackingDescriptive = (() => {
    if (!lackingKey) return '能力尚有欠缺'
    if (/(文|才|学|理|墨|笔)/.test(lackingKey)) return '文才未逮'
    if (/(武|兵|战|勇|力)/.test(lackingKey)) return '武略生疏'
    if (/(圣|帝|眷|宠|心)/.test(lackingKey)) return '圣眷未孚'
    if (/(中|宦|阉|寺|内|官)/.test(lackingKey)) return '内侍嫌隙'
    if (/(清|议|士|林|言|弹)/.test(lackingKey)) return '清议责难'
    if (/(民|望|乡|里|众|舆)/.test(lackingKey)) return '民望有亏'
    if (/(绅|豪|地|方|族)/.test(lackingKey)) return '乡绅掣肘'
    if (/(体|身|疾|病|康)/.test(lackingKey)) return '身体违和'
    if (/(财|银|钱|资|库)/.test(lackingKey)) return '资财短绌'
    if (/(道|德|品|行)/.test(lackingKey)) return '德行有亏'
    return `${lackingKey}尚欠火候`
  })()

  // 文绉绉的失败叙述模板
  const title = `未能如愿 · ${choiceText || '行动'}`
  const description = `因${lackingDescriptive}，强行为之反遭其祸。`

  // 根据事件/选项的特征关键词匹配更具体的回音
  const evtLower = (eventDesc + ' ' + choiceText).toLowerCase()
  const isMilitary = /军|兵|战|剿|守|边|关|匪|贼/.test(evtLower)
  const isPolitics = /官|朝|政|奏|帝|阉|东林|权|党/.test(evtLower)
  const isExam = /考|试|举|进士|状元|科举/.test(evtLower)
  const isDiplomacy = /外|使|和|贡|边|夷|番/.test(evtLower)
  const isRelief = /灾|民|荒|济|赈|赋|税/.test(evtLower)
  const isBandit = /士子|闹|考|落|落第|举|监|学/.test(evtLower)

  // 先抓一句"开场白"：把事件描述截短作为引子
  const intro = eventDesc.length > 0
    ? eventDesc.slice(0, Math.min(eventDesc.length, 60))
    : '事情出了岔子'

  let body = ''
  if (isMilitary) {
    body = `你自恃能武，执意出战。无奈${lackingKey || '武略'}不济，阵脚大乱，反被对方看出破绽。\n\n兵卒折损数十，部下虽未明言，眼底颇有怨色。\n\n` +
      `更糟的是，这一败让你的威严扫地，往后再要整军，只怕调遣不动。`
  } else if (isPolitics) {
    body = `你欲在朝堂上翻云覆雨，无奈${lackingKey || '根基'}未稳，被对方一句话顶了回来。\n\n` +
      `朝会散后，政敌们相视而笑，传言当晚便在京城各衙门口传开。\n\n` +
      `你不仅没占到便宜，反而暴露出急于求成的底牌。`
  } else if (isExam) {
    body = `你自信才学，欲在科场上一搏。无奈${lackingKey || '文才'}欠火候，文章被考官批得体无完肤。\n\n` +
      `同场士子皆以异样的目光看你，更有好事者当场赋诗讽之。\n\n` +
      `你颜面尽失，原本有意结交的几位才子，也悄然远离。`
  } else if (isDiplomacy) {
    body = `你欲以外交手段斡旋，奈何${lackingKey || '手腕'}生疏，被对方使节三言两语便看穿了底牌。\n\n` +
      `谈判未成，反被对方抓住了把柄，回国后还须向朝廷解释。\n\n` +
      `消息传回京城，主和派借题发挥，让你处境愈发尴尬。`
  } else if (isRelief) {
    body = `你心系灾民，急于赈济。无奈${lackingDescriptive}，筹到的米粮杯水车薪，分配时又生骚乱。\n\n` +
      `流民非但没有领情，反而砸了你的施粥棚。\n\n` +
      `此事被人参了一本，说你沽名钓誉、办事不力。`
  } else if (isBandit) {
    body = `你欲以德化之、安抚之。无奈${lackingDescriptive}，群情激愤之下反被人揪住衣领质问。\n\n` +
      `你仓皇退场，不仅平白折了脸面，事情也彻底闹大。\n\n` +
      `更麻烦的是，落榜士子已将你视为眼中钉，日后再想施恩，怕是没人会领情。`
  } else {
    body = `你决意强行推动此事，无奈${lackingDescriptive}，结果与你的设想背道而驰。\n\n` +
      `现场陷入一片尴尬的沉默。旁人的目光，让你恨不得掘地三尺。\n\n` +
      `事后回想，其实若再等一等、准备更充分一些，未必不能成事。`
  }

  // 末尾提示：避免"不足"重复，改用"还差 X 点"
  const gapHint = (dice.gap !== undefined && dice.gap > 0)
    ? `\n\n（提示：${lackingKey || dice.conditionKey || '此项'}还差约${dice.gap}点，待来日修为精进，或可一搏。）`
    : ''

  const echo = `【回音】\n\n${intro}…\n\n${body}\n\n——事已至此，多想无益。${gapHint}`

  return { title, description, echo }
}

function EventDisplay({
  event,
  character,
  gameState,
  onChoice,
  onContinue,
  onUndo,
  canUndo,
  isProcessing,
  pendingCount = 0,
  onResolvedChange,
  shortcutsEnabled = true,
  isGhostMode,
  onChoiceSelect,
  showResult: externalShowResult,
  selectedChoiceId: externalSelectedChoiceId,
  onBackToChoices,
  onDeathEnding
}: EventDisplayProps) {
  // 无事件时自动触发继续（进入下月），避免显示空界面
  const autoAdvancedRef = useRef(false)

  useEffect(() => {
    if (event) {
      autoAdvancedRef.current = false
      return
    }
    if (pendingCount === 0 && !isProcessing && onContinue && !autoAdvancedRef.current && !isGhostMode) {
      autoAdvancedRef.current = true
      onContinue()
    }
  }, [event, pendingCount, isProcessing, onContinue, isGhostMode])

  const [internalSelectedChoice, setInternalSelectedChoice] = useState<EventChoice | null>(null)
  const [internalShowResult, setInternalShowResult] = useState(false)
  
  // 幽灵模式使用外部状态，正常模式使用内部状态
  const selectedChoice = isGhostMode 
    ? (externalSelectedChoiceId ? event?.choices.find(c => c.id === externalSelectedChoiceId) || null : null)
    : internalSelectedChoice
  const showResult = isGhostMode ? externalShowResult : internalShowResult
  const setSelectedChoice = isGhostMode ? () => {} : setInternalSelectedChoice
  const setShowResult = isGhostMode ? () => {} : setInternalShowResult

  // 把「已作出抉择」这个状态同步给外层（供底部「进 下 月」判断能否点击）。
  // 依赖 event?.id 而非 event 对象：事件切换时下面那个 effect 会把 showResult
  // 复位成 false，这里跟着把外层也复位 —— 否则上一个事件的"已选"会漏到下一个事件，
  // 玩家在还没做选择时就能点「进 下 月」，等于可以跳过抉择。
  useEffect(() => {
    onResolvedChange?.(!!showResult)
  }, [event?.id, showResult, onResolvedChange])

  // 事件级投骰状态：整个事件只能投一次
  const [eventDiceUsed, setEventDiceUsed] = useState(false)

  /**
   * 投骰流程里排下的所有定时器 id，以及 diceModal 的 ref 镜像。
   *
   * `diceModalRef` 的存在是为了让 `rollDice` 能**同步**读到最新的 choice / difficulty，
   * 从而把掷骰与后续调度都放在 setState 更新函数**之外**。
   * React 的更新函数必须是纯的：StrictMode（开发期）与并发渲染下的重放
   * 都会重复执行它，而只要里面还残留"排下一个定时器"这种副作用，
   * 结算就会被排两次 —— `onChoice` 是永久生效的（属性扣减、人生记录写进存档），
   * 重复调用等于把同一个选择的后果应用两遍。
   *
   * 定时器统一登记则是因为：卸载时若不清理会留下悬挂定时器，回调里同样会走到 `onChoice`。
   */
  const diceTimersRef = useRef<number[]>([])

  const scheduleDiceTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      diceTimersRef.current = diceTimersRef.current.filter(t => t !== id)
      fn()
    }, ms)
    diceTimersRef.current.push(id)
  }, [])

  const clearDiceTimers = useCallback(() => {
    diceTimersRef.current.forEach(id => window.clearTimeout(id))
    diceTimersRef.current = []
  }, [])

  // 卸载时清空所有悬挂的投骰定时器
  useEffect(() => clearDiceTimers, [clearDiceTimers])

  const [diceModal, setDiceModal] = useState<{
    show: boolean
    choice: EventChoice | null
    isRolling: boolean
    rollResult: number | null
    success: boolean | null
    showPenalty: boolean
    difficulty?: number
    reason?: string
    attemptCount: number
  }>({
    show: false,
    choice: null,
    isRolling: false,
    rollResult: null,
    success: null,
    showPenalty: false,
    attemptCount: 0
  })

  // 记录每个选项的独立尝试状态
  const [attemptedChoices, setAttemptedChoices] = useState<Set<string>>(new Set())
  // 记录每个选项的成功/失败状态
  const [choiceResults, setChoiceResults] = useState<Map<string, boolean>>(new Map())

  /**
   * diceModal 的 ref 镜像。
   *
   * 存在的原因是让 `rollDice` 能**同步**读到最新的 choice / difficulty，
   * 从而把掷骰与后续调度都放在 setState 更新函数**之外**。
   * React 的更新函数必须是纯的：StrictMode（开发期）与并发渲染下的重放
   * 都会重复执行它；只要里面还残留"排下一个定时器"这种副作用，结算就会被排两次 ——
   * `onChoice` 是永久生效的（属性扣减、人生记录写进存档），
   * 重复调用等于把同一个选择的后果应用两遍。
   */
  const diceModalRef = useRef(diceModal)
  useEffect(() => {
    diceModalRef.current = diceModal
  }, [diceModal])

  /**
   * 投掷结果一出现就把它滚进视野。
   *
   * 165% 以上字号 + 矮视口时面板装不下整段（1280×600@165% 实测结果行落在滚动盒之下、
   * 1280×600@200% 连骰子都在折叠外），玩家点了「投 掷」却看不见成败，只会以为没反应。
   * 这和"打开时不许自动滚"不冲突：那一步是弹窗替玩家做的，这一步是玩家自己按出来的。
   */
  const diceResultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (diceModal.success === null) return
    // 可选调用：jsdom 不实现 scrollIntoView，测试里这一枪必须跳过而不是抛
    diceResultRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [diceModal.success])

  // 判断是否为死亡结局选项
  const checkDeathEnding = useCallback((choice: EventChoice): {
    isDeath: boolean
    type: 'martyrdom' | 'suicide' | 'killed' | 'execution'
  } => {
    const deathKeywords = {
      martyrdom: ['殉国', '殉死', '殉难', '殉节', '殉职', '殉道'],
      suicide: ['自缢', '自尽', '自杀', '自刎', '自裁', '自绝', '上吊', '投河', '跳井'],
      killed: ['战死', '阵亡', '战死沙场', '力战而死', '血战而死', '壮烈牺牲'],
      execution: ['处斩', '斩首', '凌迟', '处死', '赐死', '赐自尽', '押赴刑场']
    }

    // 只检测选项文本，不检测description和result（它们可能描述其他人的死亡或包含误导性词汇）
    const text = choice.text || ''
    const fullText = text

    // 排除词：如果包含这些词，说明是描述他人的死亡，不是玩家自己
    // 这些词描述的是他人的死亡，不是玩家角色的死亡
    // 使用正则表达式匹配"卢督师...阵亡"的模式（中间可以有其他字）
    const excludePatterns = [
      /卢督师.*殉国/,
      /卢象升.*殉国/,
      /卢督师.*阵亡/,
      /卢象升.*阵亡/,
      /坐视.*殉国/,
      /坐视.*阵亡/
    ]

    for (const pattern of excludePatterns) {
      if (pattern.test(fullText)) {
        return { isDeath: false, type: 'martyrdom' }
      }
    }

    for (const [type, keywords] of Object.entries(deathKeywords)) {
      for (const keyword of keywords) {
        if (fullText.includes(keyword)) {
          return { isDeath: true, type: type as 'martyrdom' | 'suicide' | 'killed' | 'execution' }
        }
      }
    }

    return { isDeath: false, type: 'martyrdom' }
  }, [])

  const choiceChecks = useMemo(() => {
    const checks = new Map<string, ChoiceCheckResult>()
    if (!event) return checks
    
    for (const choice of event.choices) {
      checks.set(choice.id, checkChoiceRequirement(choice, character, gameState))
    }
    
    return checks
  }, [event, character, gameState])

  useEffect(() => {
    // 骰子流程属于「它开始时的那个事件」。事件一换，就必须把还在飞行中的
    // 投骰定时器全部取消 —— 否则旧事件的结算会在新事件上落地，
    // 把玩家已经离开的那个选择的后果（属性扣减、人生记录）应用到当前局面。
    // 此前这一点是靠"二级定时器排在更新函数内部、而切换事件会把 choice 重置为 null
    // 从而让更新函数提前返回"这个巧合掩盖的，并不是有意为之的守卫。
    clearDiceTimers()

    setShowResult(false)
    setSelectedChoice(null)
    setEventDiceUsed(false) // 切换事件时重置骰子状态
    setDiceModal({
      show: false,
      choice: null,
      isRolling: false,
      rollResult: null,
      success: null,
      showPenalty: false,
      attemptCount: 0
    })
    // 重置每个选项的尝试记录
    setAttemptedChoices(new Set())
    setChoiceResults(new Map())
  }, [event, clearDiceTimers])

  const handleSelectChoice = useCallback((choice: EventChoice, opts?: { random?: boolean }) => {
    if ((isProcessing) && !isGhostMode) return

    // 条件不足的选项已不再是 disabled（改用 aria-disabled 以保持可聚焦、可被读屏朗读原因），
    // 因此这里显式兜住点击：只有"勉力一试"投骰成功后才会以该选项结算。
    const check = choiceChecks.get(choice.id)
    if (!isGhostMode && check && !check.available && choiceResults.get(choice.id) !== true) return

    // 检查是否为死亡结局
    const deathCheck = checkDeathEnding(choice)
    
    if (isGhostMode) {
      // 幽灵模式：只触发选择，不改变状态
      onChoiceSelect?.(choice.id)
    } else if (deathCheck.isDeath) {
      // 死亡结局：通过回调通知父组件
      onDeathEnding?.({
        type: deathCheck.type,
        title: choice.result?.title || '以身殉国',
        description: choice.resultDescription || choice.description || '',
        echo: choice.result?.echo || '',
        tags: choice.result?.tags || []
      })
      onChoice?.(choice, opts)
    } else {
      // 正常模式
      setSelectedChoice(choice)
      setShowResult(true)
      onChoice?.(choice, opts)
    }
  }, [isProcessing, onChoice, isGhostMode, onChoiceSelect, checkDeathEnding, onDeathEnding, choiceChecks, choiceResults])

  /**
   * 「听天由命」：在当前**可选**的选项里随机挑一个。
   *
   * 这个入口有两个意义：
   *   1. 玩家选择困难时的实用功能；
   *   2. 它是游戏内 `randomChoiceCount` 的**唯一**来源 ——
   *      没有它，「随心所欲」（随机选择 50 次）成就在设计上不可达，
   *      只能被标记成 deadByDesign 排除在全收集判定之外。
   * 只从"可选"里挑，锁定（条件不足）的选项不会被随机选中。
   */
  const handleRandomChoice = useCallback(() => {
    if (!event) return
    if (isProcessing || showResult) return

    const available = event.choices.filter(c => choiceChecks.get(c.id)?.available)
    if (available.length === 0) return

    const picked = available[Math.floor(Math.random() * available.length)]
    handleSelectChoice(picked, { random: true })
  }, [event, choiceChecks, isProcessing, showResult, handleSelectChoice])

  /**
   * 数字键 1–9 选择对应序号的选项。
   *
   * 为什么放在这里而不是 GameScreen：判断"这个选项能不能点"
   * 依赖 choiceChecks / choiceResults / 投骰状态，都在本组件内，
   * 放到外层就得把这些再暴露一遍。
   *
   * 序号按**当前显示顺序**（含锁定项）计数，这样屏幕上第 3 个就是按 3，
   * 不会出现"我按 3 却选中了另一个"。锁定项按下去等同于点击 ——
   * 由 handleSelectChoice 自己弹出投骰/锁定原因，行为与鼠标一致。
   */
  useEffect(() => {
    if (!shortcutsEnabled) return
    const handler = (e: KeyboardEvent) => {
      if (!/^[1-9]$/.test(e.key)) return
      if (isTypingTarget(e.target)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (!event || isProcessing || showResult || isGhostMode) return
      // 投骰弹窗（勉力一试）开着时，数字键不能穿透到背后的事件面板：
      // 那会在弹窗里结算之前就把事件选定，并消耗掉本局唯一一次投骰机会。
      if (diceModal.show) return

      const idx = Number(e.key) - 1
      const choice = event.choices[idx]
      if (!choice) return
      e.preventDefault()
      handleSelectChoice(choice)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [event, isProcessing, showResult, isGhostMode, shortcutsEnabled, handleSelectChoice, diceModal.show])

  const openDiceModal = useCallback((choice: EventChoice) => {
    const check = choiceChecks.get(choice.id)
    if (!check || check.available) return

    if (choiceResults.get(choice.id) === true) return

    // 整个事件已经用过了投骰
    if (eventDiceUsed) return

    setDiceModal({
      show: true,
      choice,
      isRolling: false,
      rollResult: null,
      success: (choiceResults.get(choice.id) === true) ? true : null,
      showPenalty: false,
      attemptCount: 0,
      ...check
    })
  }, [choiceChecks, choiceResults, eventDiceUsed])

  const closeDiceModal = useCallback(() => {
    setDiceModal(prev => ({ ...prev, show: false }))
  }, [])

  const rollDice = useCallback(() => {
    const current = diceModalRef.current
    const choice = current.choice

    // 显式并发守卫：没有选项、正在投掷、或已经出过结果，都直接忽略。
    // （骰子区与底部按钮各自也有守卫，这里再加一层是因为下面改成了从 ref 读快照。）
    if (!choice || current.isRolling || current.success !== null) return

    const difficulty = current.difficulty || 3
    const roll = Math.floor(Math.random() * 6) + 1
    const success = roll >= difficulty

    setDiceModal(prev => ({ ...prev, isRolling: true }))

    // 以下是"排定时器"的副作用，全部放在更新函数之外
    scheduleDiceTimer(() => {
      // 标记事件级骰子已用（整个事件只能投一次）
      setEventDiceUsed(true)

      if (success) {
        setChoiceResults(r => new Map(r).set(choice.id, true))
      } else {
        setAttemptedChoices(r => new Set(r).add(choice.id))
        setChoiceResults(r => new Map(r).set(choice.id, false))
      }

      // 亮出点数，结束"投掷中"
      setDiceModal(prev => ({
        ...prev,
        isRolling: false,
        rollResult: roll,
        success,
        attemptCount: 1,
        showPenalty: !success,
        difficulty
      }))

      // 第二级：把结果真正落到游戏状态上（这一步会调用 onChoice，只允许发生一次）
      scheduleDiceTimer(() => {
        if (isGhostMode) {
          onChoiceSelect?.(choice.id)
        } else if (success) {
          // 成功：用原 effects / result
          setSelectedChoice(choice)
          setShowResult(true)
          onChoice?.(choice)
        } else {
          // 失败：优先用作者在 choice.failEffects / failResult 里配的，
          // 否则根据"成功时的效果"反推；绝不再用死数据"体质-2/道德值-1"敷衍
          const generated = generateFailEcho(choice, current, event)
          const failEffects = choice.failEffects || deriveFailEffects(choice)

          const useChoice: EventChoice = {
            ...choice,
            effects: failEffects,
            resultDescription: choice.failResultDescription || generated.description,
            result: choice.failResult || {
              title: generated.title,
              tags: ['投骰失败', '副作用'],
              echo: generated.echo
            }
          }
          setSelectedChoice(useChoice)
          setShowResult(true)
          onChoice?.(useChoice)
        }
        setDiceModal(p => ({ ...p, show: false }))
      }, motionDelay(1500))
    }, motionDelay(800))
  }, [isGhostMode, onChoiceSelect, onChoice, scheduleDiceTimer, event])

  const handleContinue = () => {
    if (isGhostMode) {
      onBackToChoices?.()
    } else {
      setShowResult(false)
      setSelectedChoice(null)
      onContinue?.()
    }
  }

  const handleUndoClick = () => {
    if (isGhostMode) {
      onBackToChoices?.()
    } else {
      setShowResult(false)
      setSelectedChoice(null)
      onUndo?.()
    }
  }

  // 骰子弹窗此前是应用里唯一的"键盘陷阱"：没有语义、没有 ESC、没有焦点陷阱。
  // 这里补上完整对话框行为（role/aria-modal/ESC/Tab 循环/焦点还原/滚动锁）。
  const {
    getModalProps: getDiceModalProps,
    dialogRef: diceDialogRef,
    titleId: diceTitleId,
    handleOverlayClick: handleDiceOverlayClick
  } = useModal({
    open: diceModal.show,
    onClose: closeDiceModal,
    // 初始焦点停在面板本身，而不是"框里第一个可聚焦元素"（那是 .dice-area，排在整段
    // 难度说明之下）。第三十三轮把弹窗改成"只让中间一段滚"之后，focus() 的默认行为会把
    // 滚动区一路拉到骰子（1280×600 + 200% 字号实测 scrollTop=421），弹窗一打开就把
    // 「难度 / 需投出 三 或以上」滚出视野 —— 而那恰恰是玩家决定要不要投之前唯一要读的话。
    // 停在面板上时读屏念 aria-labelledby 的标题，Tab 一下才进骰子（那时是玩家自己要过去，
    // 浏览器按需滚动）；「投 掷」在钉住的页脚里，鼠标玩家从一开始就点得到。
    initialFocus: 'dialog'
  })

  // 锁定原因 aria-describedby 的 id 前缀（useId 保证实例唯一）
  const choiceIdPrefix = useId()

  // 结算结果的无障碍播报文案（例如："效果：文韬+3、圣眷-2"）
  const settlementAnnouncement = useMemo(() => {
    if (!selectedChoice) return ''
    const parts: string[] = []
    const push = (label: string, value: number) => {
      parts.push(`${label}${value > 0 ? `+${value}` : value}`)
    }
    const attrs = selectedChoice.effects?.attributes
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (typeof value === 'number') push(ATTR_DISPLAY_MAP[key] || key, value)
      }
    }
    const states = selectedChoice.effects?.gameState
    if (states) {
      for (const [key, value] of Object.entries(states)) {
        if (typeof value === 'number') push(STATE_DISPLAY_MAP[key] || key, value)
      }
    }
    const hidden = selectedChoice.effects?.hidden
    if (hidden) {
      for (const [key, value] of Object.entries(hidden)) {
        if (typeof value === 'number') push(key, value)
      }
    }
    const title = selectedChoice.result?.title
    const effectText = parts.length > 0 ? `效果：${parts.join('、')}` : ''
    return [title, effectText].filter(Boolean).join('。')
  }, [selectedChoice])

  if (!event) {
    // 无事件时不渲染任何界面，由 useEffect 自动触发下月推进
    return null
  }

  const narrative = event.narrative

  const node = (
    <div className="dice-modal-overlay" onClick={handleDiceOverlayClick}>
      <div className="dice-modal" ref={diceDialogRef} {...getDiceModalProps()}>
        <div className="dice-modal-header">
          <h3 id={diceTitleId}>勉 力 一 试</h3>
        </div>

        <div className="dice-modal-content">
          {(() => {
            if (!diceModal.choice) return null
            const check = choiceChecks.get(diceModal.choice.id)
            if (!check || check.available) return null

            return (
              <div className="dice-info-simple">
                <div className="dice-condition-simple">
                  {check.reason}
                </div>

                <div className="difficulty-adjust-info">
                  <span className="difficulty-label">难度：</span>
                  <div className="difficulty-circles">
                    {[1, 2, 3, 4, 5, 6].map((level) => (
                      <span
                        key={level}
                        className={`difficulty-circle ${level <= (diceModal.difficulty || 3) ? 'active' : ''}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="dice-target">
                  需投出 <span className="target-char">{['零', '一', '二', '三', '四', '五', '六'][diceModal.difficulty || 3]}</span>（{diceModal.difficulty}）或以上
                </div>

                <div className="attempt-info">
                  投骰一次，成功即达成，失败则触发负面效果
                </div>
              </div>
            )
          })()}
          
          {/* 骰子区改为真实 button：键盘可用 Enter/Space 投掷。
              投掷中用 aria-disabled 而不是 disabled，保证投掷动画期间焦点不会被弹出对话框
              （否则焦点陷阱内可能一个可聚焦元素都不剩） */}
          <button
            type="button"
            className="dice-area"
            onClick={() => { if (!diceModal.isRolling && diceModal.success === null) rollDice() }}
            aria-disabled={diceModal.isRolling || diceModal.success !== null}
            aria-label={diceModal.isRolling ? '投掷中' : '投掷骰子'}
          >
            <DiceAnimation 
              isRolling={diceModal.isRolling}
              result={diceModal.rollResult}
              success={diceModal.success}
            />
          </button>
          
          {!diceModal.isRolling && diceModal.success === null && (
            <div className="dice-click-hint">点击骰子开始</div>
          )}
          
          {diceModal.success !== null && (
            <div ref={diceResultRef} className={`dice-result-text ${diceModal.success ? 'success' : 'fail'}`}>
              {diceModal.success ? '天命所归——成功' : '力有不逮——失败'}
            </div>
          )}
          
          {/* 失败后的属性变化会由效果系统自动应用，不在弹窗里重复显示 */}
        </div>
        
        {/* 键盘用户需要一个可见的投掷/关闭出口（原来这里是空 div，形成键盘陷阱） */}
        <div className="dice-modal-footer">
          {diceModal.success === null ? (
            <button
              type="button"
              className="dice-confirm-btn"
              onClick={rollDice}
              disabled={diceModal.isRolling}
            >
              {diceModal.isRolling ? '投 掷 中' : '投 掷'}
            </button>
          ) : (
            <button
              type="button"
              className="dice-confirm-btn"
              onClick={closeDiceModal}
            >
              关 闭
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className={`event-display ${showResult ? 'show-result' : ''}`}>
      {/* 标题区：随事件切换原地更新的标题，需要 live region 才会被读屏播报 */}
      <div className="event-header" role="status" aria-live="polite" aria-atomic="true">
        <h1 className="event-title">{event.title}</h1>
        {pendingCount > 0 && (
          <div className="event-pending-hint">
            本月尚有 <strong>{pendingCount}</strong> 个事件待处理
          </div>
        )}
      </div>

      {/* 叙事区 */}
      <div className="narrative-section">
        {/* 人物信息和引语合并 */}
        {(narrative?.speaker || narrative?.quote) && (
          <div className="speaker-quote-row">
            {narrative?.speaker && (
              <div className="speaker-card-compact">
                <div className="speaker-avatar-compact">
                  <svg viewBox="0 0 32 32" className="avatar-svg">
                    {/* 背景圆 */}
                    <circle cx="16" cy="16" r="15" fill="url(#avatarBg)" />
                    {/* 身体/衣服 */}
                    <path d="M8 26 Q16 20 24 26 L24 28 Q16 24 8 28 Z" fill="#8b6914" />
                    {/* 脖子 */}
                    <rect x="14" y="18" width="4" height="4" fill="#d4a574" />
                    {/* 脸部 */}
                    <ellipse cx="16" cy="14" rx="5" ry="6" fill="#d4a574" />
                    {/* 帽子顶部 */}
                    <ellipse cx="16" cy="7" rx="7" ry="2" fill="#2a2a2a" />
                    {/* 帽子主体 */}
                    <path d="M9 7 L9 10 Q16 12 23 10 L23 7 Z" fill="#3a3a3a" />
                    {/* 帽子装饰带 */}
                    <rect x="9" y="9" width="14" height="1.5" fill="#c9a227" />
                    {/* 眼睛 */}
                    <circle cx="14" cy="14" r="0.8" fill="#2a1a10" />
                    <circle cx="18" cy="14" r="0.8" fill="#2a1a10" />
                    {/* 眉毛 */}
                    <path d="M13 12 Q14 11.5 15 12" stroke="#2a1a10" strokeWidth="0.5" fill="none" />
                    <path d="M17 12 Q18 11.5 19 12" stroke="#2a1a10" strokeWidth="0.5" fill="none" />
                    {/* 胡须 */}
                    <path d="M15 19 Q16 21 17 19" stroke="#2a1a10" strokeWidth="0.8" fill="none" />
                    <path d="M16 20 L16 22" stroke="#2a1a10" strokeWidth="0.8" fill="none" />
                    {/* 渐变定义 */}
                    <defs>
                      <linearGradient id="avatarBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4a3520" />
                        <stop offset="100%" stopColor="#2a1a10" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="speaker-info-compact">
                  <span className="speaker-name-compact">{narrative.speaker.name}</span>
                  <span className="speaker-title-compact">{narrative.speaker.title}</span>
                </div>
              </div>
            )}
            {narrative?.quote && (
              <div className="quote-box-compact">
                <span className="quote-mark-compact" aria-hidden="true" />
                <p className="quote-text-compact">{narrative.quote}</p>
                <span className="quote-end-compact" aria-hidden="true" />
              </div>
            )}
          </div>
        )}

        {/* 背景叙述 */}
        <div className="narrative-body">
          {(narrative?.background || event.description).split('\n').map((line, i) => (
            <p key={i} className="narrative-paragraph">{line}</p>
          ))}
        </div>

        {/* 决策引导 */}
        <div className="situation-prompt">
          {narrative?.situation || '你决定——'}
        </div>
      </div>

      {!showResult ? (
        /* 选项列表 */
        <div className="choices-section">
          <div className="choices-list">
            {event.choices.map((choice, idx) => {
              const check = choiceChecks.get(choice.id)
              if (!check) return null

              const canAttemptDice = !check.available &&
                !diceModal.isRolling &&
                check.difficulty !== undefined &&
                check.conditionType !== 'flag' &&
                (choiceResults.get(choice.id) !== true) &&
                !eventDiceUsed // 整个事件只投一次

              // 锁定原因用 aria-describedby 暴露；id 由 useId() 派生，避免实例/选项间冲突
              const lockReasonId = `${choiceIdPrefix}-${choice.id}-lock-reason`

              return (
                <div key={`${choice.id}-${idx}`} className="choice-card-wrapper">
                  <button
                    className={`choice-card ${!check.available ? 'locked' : ''}`}
                    onClick={() => handleSelectChoice(choice)}
                    aria-disabled={isProcessing || !check.available}
                    aria-label={!check.available ? choice.text : undefined}
                    aria-describedby={!check.available ? lockReasonId : undefined}
                  >
                    <div className="choice-content">
                      {/* 序号徽标：既是 1–9 快捷键的可见提示，也让"点第几个"
                          与"按几"对应上，减少误点。仅前 9 个选项显示。 */}
                      {idx < 9 && shortcutsEnabled && (
                        <span className="choice-index" aria-hidden="true">
                          {idx + 1}
                        </span>
                      )}
                      <div className="choice-title">
                        {choice.text}
                        {choice.storyline && choice.storyline !== event.storyline && (
                          <span className="choice-storyline-shift">
                            → {getStoryline(choice.storyline)?.name || choice.storyline}
                          </span>
                        )}
                      </div>
                      {choice.description && (
                        <div className="choice-description">{choice.description}</div>
                      )}
                    </div>

                    {/* 锁定原因：按钮不再 disabled（可聚焦），原因通过 aria-describedby 暴露。
                        放在按钮内部以保留原来的缩进/透明度叠加效果（视觉不变） */}
                    {!check.available && (
                      <div className="choice-lock-reason" id={lockReasonId}>
                        {check.reason}
                        {attemptedChoices.has(choice.id) && choiceResults.get(choice.id) === false && (
                          <span className="attempt-failed-mark"> <Icon name="cross" size={12} /> 已失败</span>
                        )}
                        {eventDiceUsed && !canAttemptDice && choiceResults.get(choice.id) !== true && (
                          <span className="attempt-failed-mark"> （本事件骰子已投）</span>
                        )}
                      </div>
                    )}
                  </button>

                  {canAttemptDice && (
                    <button
                      className="dice-attempt-btn"
                      onClick={() => openDiceModal(choice)}
                      aria-label={`勉力一试：${choice.text}`}
                    >
                      勉力一试
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* 「听天由命」：从当前可选的选项里随机挑一个。
              只在有两个及以上可选时才有意义（只有一个选项时等于替玩家点它）。
              这个入口同时是 randomChoiceCount 的唯一来源。 */}
          {event.choices.filter(c => choiceChecks.get(c.id)?.available).length >= 2 && (
            <button
              type="button"
              className="random-choice-btn"
              onClick={handleRandomChoice}
              aria-disabled={isProcessing}
              title="从当前可选的选项中随机挑一个"
            >
              听 天 由 命
            </button>
          )}

        </div>
      ) : (
        /* 结果展示 */
        <div className="result-section">
          {/* 选中的选项卡片 */}
          {selectedChoice && (
            <div className="selected-choice">
              <div className="selected-choice-title">
                {selectedChoice.text}
              </div>
              {selectedChoice.description && (
                <div className="selected-choice-desc">{selectedChoice.description}</div>
              )}
            </div>
          )}

          {/* 结算区域 */}
          <div className="settlement-area">
            {/* 结果评价 */}
            {selectedChoice?.result?.title && (
              <div className="settlement-title">{selectedChoice.result.title}</div>
            )}
            
            {/* 属性变化 */}
            <div className="effects-grid">
              {selectedChoice?.effects.attributes && Object.entries(selectedChoice.effects.attributes).map(([key, value]) => (
                <div key={key} className={`effect-tag ${value > 0 ? 'positive' : 'negative'}`}>
                  {ATTR_DISPLAY_MAP[key] || key}{value > 0 ? `+${value}` : value}
                </div>
              ))}
              {selectedChoice?.effects.gameState && Object.entries(selectedChoice.effects.gameState).map(([key, value]) => (
                <div key={key} className={`effect-tag ${value > 0 ? 'positive' : 'negative'}`}>
                  {STATE_DISPLAY_MAP[key] || key}{value > 0 ? `+${value}` : value}
                </div>
              ))}
              {selectedChoice?.effects.hidden && Object.entries(selectedChoice.effects.hidden).map(([key, value]) => (
                <div key={key} className={`effect-tag ${value > 0 ? 'positive' : 'negative'}`}>
                  {key}{value > 0 ? `+${value}` : value}
                </div>
              ))}
            </div>

            {/* 结算结果播报：视觉上隐藏，读屏会念出"效果：文韬+3、圣眷-2" */}
            {settlementAnnouncement && (
              <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {settlementAnnouncement}
              </div>
            )}

            {/* 回音叙述 */}
            {selectedChoice?.result?.echo && (() => {
              const echo = selectedChoice.result.echo
              return (
                <div className="echo-box">
                  <div className="echo-label">【回音】</div>
                  <pre className="echo-text">{echo}</pre>
                </div>
              )
            })()}
          </div>

          {/* 操作按钮 */}
          <div className="result-actions">
            {(canUndo || isGhostMode) && (
              <button className="undo-btn" onClick={handleUndoClick}>
                {isGhostMode ? '↩ 返回' : '↩ 悔棋'}
              </button>
            )}
            <button className="continue-btn" onClick={handleContinue}>
              {isGhostMode ? '返 回' : '继 续'}
            </button>
          </div>
        </div>
      )}

      {/* 骰子弹窗 */}
      {diceModal.show && diceModal.choice && (() => {
        const check = choiceChecks.get(diceModal.choice.id)
        return check && !check.available
      })() && createPortal(node, document.body)}

    </div>
  )
}

// 性能优化: memo - event/character/gameState/callbacks 引用未变时跳过整个事件面板重渲染
// (handleChoice/handleContinue/handleUndo 等已用 useCallback 包裹，引用稳定 → memo 有效)
// (AttributePanel/StatusPanel 状态条变化时不会连带重渲染整个事件卡 DOM)
export default memo(EventDisplay)
