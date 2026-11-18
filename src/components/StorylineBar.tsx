/**
 * 剧情线进度条
 *
 * 展示玩家当前所在剧情线（故事主题分组），帮助玩家理解游戏在叙事层面的"走向"。
 * 数据来源：src/data/storylines.ts 注册表
 * 推算逻辑：GameScreen.getCurrentStoryline() —— 从 eventHistory 末尾向前找最近一个有 storyline 字段的事件
 */

import { memo as ReactMemo } from 'react'
import { MAINLINE_COUNT, SUPPORTLINE_COUNT, getStoryline, type StorylineTone } from '../data/storylines'
import Icon from './Icon'
import type { IconName } from './Icon'
import './StorylineBar.css'

interface StorylineBarProps {
  /** 当前剧情线 key（取自 GameScreen.getCurrentStoryline） */
  currentStorylineKey?: string
  /** 已发生的事件数（用于统计"你已走过 X 个事件"） */
  eventCount: number
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

const StorylineBarImpl = function StorylineBar({ currentStorylineKey, eventCount }: StorylineBarProps) {
  const storyline = getStoryline(currentStorylineKey)
  const iconName: IconName = storyline ? (ICON_MAP[storyline.iconName] || 'sparkle') : 'sparkle'
  const tone: StorylineTone = storyline?.tone || 'gray'
  const caption = storyline?.tier === 'support' ? '当前支线' : '当前剧情线'

  // 无剧情线时的"未启程"占位
  if (!storyline) {
    return (
      <div className="storyline-bar storyline-bar--gray">
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
