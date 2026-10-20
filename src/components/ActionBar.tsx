import { memo as ReactMemo } from 'react'
import './ActionBar.css'

interface ActionBarProps {
  /** 统一的"往前推进"：有事件则续下一个事件，无事件则进入下月 */
  onNextMonth: () => void
  onSave: () => void
  onOpenAchievements?: () => void
  onOpenAIAdvisor?: () => void
  onOpenImageGenerator?: () => void
  onReturnToMenu?: () => void
  turn: number
  canProceed: boolean
  /** 本月还有几个事件待处理（显示在回合旁边，玩家不用回头看事件面板） */
  pendingCount?: number
  /**
   * 按钮不可点时的原因（常驻显示给玩家）。
   *
   * 措辞必须与真实状态一致：还没做出抉择时，面板里的「继 续」按钮
   * **根本还不存在**（它只在结果态渲染）。此前这里写的是"点「继 续」推进"，
   * 把玩家引向一个此刻看不到的按钮 —— 于是有了"我没看到有继续的按钮啊"。
   */
  blockedReason?: string
}

const ActionBarImpl = function ActionBar({
  onNextMonth,
  onSave,
  onOpenAchievements,
  onOpenAIAdvisor,
  onOpenImageGenerator,
  onReturnToMenu,
  turn,
  canProceed,
  pendingCount = 0,
  blockedReason
}: ActionBarProps) {
  const hint = canProceed ? null : blockedReason || '请先处理当前事件'

  // 文案随状态走：玩家一眼就知道点下去会发生什么
  // 有待办 → 推进的是"下一件事"；无待办 → 才是"进下月"
  //
  // 标签里**不许重复徽标那个字**：`.btn-icon` 是可见文本，不是隐藏图标。
  // 这里写成「进 下 月」时玩家看到的是「进进下月」（存档按钮同一病灶「存存档」），
  // 由 `tests/unit/actionBar.labels.test.tsx` 守住这条规矩。
  const advanceLabel = canProceed && pendingCount > 0 ? '下 一 件' : '下 月'

  return (
    <div className="action-bar">
      <div className="action-left">
        <span className="turn-info">第 {turn} 回合</span>
        {pendingCount > 0 && (
          <span className="pending-chip" title="本月尚未处理的事件数">
            待办 {pendingCount}
          </span>
        )}
      </div>

      <div className="action-center">
        <button
          className={`action-btn primary ${!canProceed ? 'disabled' : ''}`}
          onClick={onNextMonth}
          disabled={!canProceed}
          title={hint || (pendingCount > 0 ? '处理下一个待办事件' : '进入下一个月')}
          aria-describedby={hint ? 'action-next-hint' : undefined}
        >
          <span className="btn-icon">进</span>
          <span>{advanceLabel}</span>
        </button>
        {/* 禁用原因常驻显示：光靠一个灰按钮，玩家猜不出为什么 */}
        {hint && (
          <span className="action-hint" id="action-next-hint">
            {hint}
          </span>
        )}
      </div>

      <div className="action-right">
        {onReturnToMenu && (
          <button
            className="action-btn secondary menu-btn"
            onClick={onReturnToMenu}
            title="返回主菜单（自动存档会被保留）"
            aria-label="返回主菜单"
          >
            <span className="btn-icon">返</span>
            <span>主菜单</span>
          </button>
        )}
        <button className="action-btn secondary" onClick={onOpenAchievements}>
          <span className="btn-icon">功</span>
          <span>成就</span>
        </button>
        {onOpenImageGenerator && (
          <button
            className="action-btn secondary image-generator-btn"
            onClick={onOpenImageGenerator}
            title="为该事件作丹青（AI 生成插图）"
            aria-label="丹青画卷"
          >
            <span className="btn-icon">绘</span>
            <span>丹青</span>
          </button>
        )}
        {onOpenAIAdvisor && (
          <button
            className="action-btn secondary ai-advisor-btn"
            onClick={onOpenAIAdvisor}
            title="询问 AI 谋士（需自备 API Key）"
            aria-label="AI 谋士"
          >
            <span className="btn-icon">策</span>
            <span>谋士</span>
          </button>
        )}
        <button className="action-btn secondary" onClick={onSave}>
          <span className="btn-icon">存</span>
          <span>档</span>
        </button>
      </div>
    </div>
  )
}

// 性能优化: memo + default export（确保 default import 名字正确）
const ActionBar = ReactMemo(ActionBarImpl)
export default ActionBar