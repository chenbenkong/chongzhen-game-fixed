import { useEffect } from 'react'
import { isTypingTarget } from '../utils/isTypingTarget'

/**
 * 全局游戏快捷键。
 *
 * 为什么需要：这是一款以"读文字 + 做选择"为核心的游戏，一个周目要点几百次。
 * 全靠鼠标点既慢又累，而当时 README 声称"核心玩法可纯键盘完成"，
 * 实际上只有 Tab + Enter 能勉强做到 —— 事件多了以后 Tab 要按几十次。
 *
 * 映射：
 *   1–9      选中第 N 个选项（锁定的选项会被跳过，与"听天由命"的口径一致）
 *   Space    推进（等价于点「进 下 月」/「继 续」）；已选完时也可用来推进
 *   Enter    同 Space
 *   S        存档
 *   A        成就
 *   H / ?    帮助
 *   Esc      关闭最上层弹窗（由各弹窗自己处理，这里不重复拦截）
 *
 * 刻意**不做**的：
 *   · 不在输入框里响应（玩家正在取名/填内容时按 1 不该去选选项）
 *   · 不在弹窗打开时响应数字键（避免"关着弹窗却把事件选了"）
 *   · 不拦截浏览器的 Ctrl/Alt/Meta 组合
 */
export interface ShortcutHandlers {
  onPickChoice: (index: number) => void
  onAdvance: () => void
  onSave: () => void
  onAchievements: () => void
  onHelp: () => void
  /** 当前是否有弹窗 / 结局屏处于打开状态（打开时所有快捷键让路） */
  blocked: boolean
  /**
   * 仅门控「推进」按键（Space / Enter）。
   *
   * 与 blocked 分开是必须的：推进需要「本事件已做出抉择」，
   * 而存档 / 成就 / 帮助只是查看功能，跟当前有没有选完毫无关系。
   * 合成一个开关的后果是玩家卡在一个看不懂的抉择上时按 H 调不出帮助 ——
   * 那正是最需要它的时刻。
   */
  blockedAdvance?: boolean
}

export function useGameShortcuts({
  onPickChoice,
  onAdvance,
  onSave,
  onAchievements,
  onHelp,
  blocked,
  blockedAdvance
}: ShortcutHandlers): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 玩家正在输入（取名/籍贯/AI Key）→ 一切游戏快捷键都让路
      if (isTypingTarget(e.target)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (blocked) return

      // 数字键：选第 N 个可用选项
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        onPickChoice(Number(e.key) - 1)
        return
      }

      switch (e.key) {
        case ' ':
        case 'Spacebar':
        case 'Enter':
          // 推进单独受 blockedAdvance 管控，其余快捷键不受它影响
          if (blockedAdvance) return
          e.preventDefault()
          onAdvance()
          return
        case 's':
        case 'S':
          e.preventDefault()
          onSave()
          return
        case 'a':
        case 'A':
          e.preventDefault()
          onAchievements()
          return
        case 'h':
        case 'H':
        case '?':
          e.preventDefault()
          onHelp()
          return
        default:
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPickChoice, onAdvance, onSave, onAchievements, onHelp, blocked, blockedAdvance])
}