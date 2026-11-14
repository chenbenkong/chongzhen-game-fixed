import { Component, ErrorInfo, ReactNode } from 'react'
import ConfirmDialog from './ConfirmDialog'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
  /**
   * 主包（懒加载的 App）加载失败时，重新发起一次加载。
   * 没有它，「继续游戏」就只是个清 state 的空动作 —— React.lazy 缓存了失败的
   * promise，重渲染会同步再抛回本页（实测连点 3 次，零新请求）。
   */
  onRetryChunk?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  /** 删除存档确认弹窗 */
  confirmClearOpen: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      confirmClearOpen: false
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      confirmClearOpen: false
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('【游戏错误捕获】', error, errorInfo)
    this.setState({ errorInfo })
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }
      const logs = JSON.parse(localStorage.getItem('chongzhen_error_logs') || '[]')
      logs.push(errorLog)
      if (logs.length > 10) logs.shift()
      localStorage.setItem('chongzhen_error_logs', JSON.stringify(logs))
    } catch (e) {}
  }

  handleReset = (): void => {
    // 先换掉失败的 lazy 实例（内部会重新渲染整棵树），再清本页错误态。
    // 没有重试通道时退化为原来的"清 state"，行为不比以前更差。
    this.props.onRetryChunk?.()
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  /** 弹出确认弹窗（替代 window.confirm） */
  handleClearSave = (): void => {
    this.setState({ confirmClearOpen: true })
  }

  /** 确认删除存档 */
  handleConfirmClear = (): void => {
    this.setState({ confirmClearOpen: false })
    try {
      // 全量清理游戏相关存储，避免残留数据导致再次崩溃
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('chongzhen_')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch (e) {
      // ignore
    }
    window.location.reload()
  }

  /** 取消删除 */
  handleCancelClear = (): void => {
    this.setState({ confirmClearOpen: false })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container">
            <div className="error-icon">!</div>
            <h1 className="error-title">游戏遇到了一些问题</h1>
            <p className="error-message">{this.state.error?.message || '未知错误'}</p>
            <details className="error-details">
              <summary>查看技术详情</summary>
              <pre>{this.state.error?.stack}</pre>
              {this.state.errorInfo && <pre>{this.state.errorInfo.componentStack}</pre>}
            </details>
            <div className="error-actions">
              <button className="error-btn primary" onClick={this.handleReset}>继续游戏</button>
              <button className="error-btn" onClick={() => window.location.reload()}>重新加载</button>
              <button className="error-btn danger" onClick={this.handleClearSave}>清除存档</button>
            </div>
          </div>

          <ConfirmDialog
            open={this.state.confirmClearOpen}
            title="焚尽红尘"
            message="确定要清除所有游戏存档吗？此操作不可恢复。"
            warning="所有人物、记录、成就、画卷将被永久抹去"
            confirmText="清除存档"
            cancelText="保留"
            variant="danger"
            onConfirm={this.handleConfirmClear}
            onCancel={this.handleCancelClear}
          />
        </div>
      )
    }
    return this.props.children
  }
}
