/**
 * 剧情线进度条
 *
 * 展示玩家当前所在剧情线（故事主题分组），帮助玩家理解游戏在叙事层面的"走向"。
 * 数据来源：src/data/storylines.ts 注册表
 * 推算逻辑：GameScreen.getCurrentStoryline() —— 从 eventHistory 末尾向前找最近一个有 storyline 字段的事件
 */

import { memo as ReactMemo } from 'react'
import { MAINLINE_COUNT, SUPPORTLINE_COUNT, getStoryline, type StorylineTone } from '../data/storylines'
import type { CareerGoalStatus } from '../data/careerGoals'
import Icon from './Icon'
import type { IconName } from './Icon'
import './StorylineBar.css'

interface StorylineBarProps {
  /** 当前剧情线 key（取自 GameScreen.getCurrentStoryline） */
  currentStorylineKey?: string
  /** 已发生的事件数（用于统计"你已走过 X 个事件"） */
  eventCount: number
  /**
   * 本局志业进度。手机端由 MobileBoard 自己渲染同一份数据；
   * 桌面端并入这条抬头，避免再占一行。
   */
  career?: CareerGoalStatus | null
}

// Icon 名字收敛到 IconName 类型（storylines.ts 里的 iconName 来自注册表）
const ICON_MAP: Record<string, IconName> = {
  document: 'document',
  sword: 'sword',
  coffin: 'coffin',
  flower: 'flower',
  star: 'star',
  pin: 'pin',
  sparkle: 'sparkle',
  marriage: 'marriage',
  shuffle: 'shuffle',
  starOutline: 'starOutline',
  warning: 'warning',
  sparkleDim: 'sparkleDim'
}

// 全部剧情线计数（P1：8 主 + 8 辅）
const TOTAL_LABEL = `${MAINLINE_COUNT} 条主线 · ${SUPPORTLINE_COUNT} 条支线`

const StorylineBarImpl = function StorylineBar({ currentStorylineKey, eventCount, career }: StorylineBarProps) {
  const storyline = getStoryline(currentStorylineKey)
  const iconName: IconName = storyline ? (ICON_MAP[storyline.iconName] || 'sparkle') : 'sparkle'
  const tone: StorylineTone = storyline?.tone || 'gray'
  const caption = storyline?.tier === 'support' ? '当前支线' : '当前剧情线'

  // 志业只显示目标名、完成数与三枚点；具体三个里程碑仍在右侧「态度」页，
  // 这里不复制整张卡，也不给它第二个点击入口。
  const careerSegment = career ? (
    <div
      className="storyline-bar__career"
      aria-label={`志业：${career.goal.name}，已完成 ${career.completed} 项，共 3 项`}
    >
      <span className="storyline-bar__career-caption">志业</span>
      <span className="storyline-bar__career-name">{career.goal.name}</span>
      <span className="storyline-bar__career-count">{career.completed}/3</span>
      <span className="storyline-bar__career-pips" aria-hidden="true">
        {career.milestones.map((milestone) => (
          <span
            key={milestone.label}
            className={`storyline-bar__career-pip ${milestone.done ? 'is-done' : ''}`}
            title={`${milestone.label} · ${milestone.hint}`}
          />
        ))}
      </span>
    </div>
  ) : null

  // 无剧情线时的"未启程"占位
  if (!storyline) {
    return (
      <div className="storyline-bar storyline-bar--gray">
        {careerSegment}
        <div className="storyline-bar__lead">
          <Icon name="sparkleDim" size={16} />
          <span className="storyline-bar__caption">当前剧情线</span>
        </div>
        <div className="storyline-bar__main">
          <span className="storyline-bar__name">未启程</span>
          <span className="storyline-bar__intro">
            尚未进入任何主题——下一个事件将决定你的人生方向。
          </span>
        </div>
        <div className="storyline-bar__meta">
          <span className="storyline-bar__count">{eventCount} 事件</span>
          <span className="storyline-bar__divider">·</span>
          <span className="storyline-bar__total">{TOTAL_LABEL}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`storyline-bar storyline-bar--${tone}`} title={storyline.intro}>
      {careerSegment}
      <div className="storyline-bar__lead">
        <Icon name={iconName} size={16} />
        <span className="storyline-bar__caption">{caption}</span>
      </div>
      <div className="storyline-bar__main">
        <span className="storyline-bar__name">{storyline.name}</span>
        <span className="storyline-bar__intro">{storyline.intro}</span>
      </div>
      <div className="storyline-bar__meta">
        <span className="storyline-bar__count">{eventCount} 事件</span>
        <span className="storyline-bar__divider">·</span>
        <span className="storyline-bar__total">{TOTAL_LABEL}</span>
      </div>
    </div>
  )
}

const StorylineBar = ReactMemo(StorylineBarImpl)
export default StorylineBar
