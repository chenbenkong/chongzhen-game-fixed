import { useState, useRef, useEffect, useCallback, memo, useTransition, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { streamChat, setApiKey, hasApiKey, type ChatMessage, type GameContext } from '../services/aiService'
import './AIAdvisor.css'

interface AIAdvisorProps {
  isOpen: boolean
  onClose: () => void
  gameContext: GameContext
}

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 历史消息气泡：memo 化避免流式更新时重渲染已显示的消息
 */
const MessageBubble = memo(function MessageBubble({
  msg,
  avatarChar
}: {
  msg: DisplayMessage
  avatarChar: string
}) {
  return (
    <div className={`ai-msg ${msg.role}`}>
      <div className="ai-msg-avatar">
        {msg.role === 'user' ? avatarChar : '策'}
      </div>
      <div className="ai-msg-content">{msg.content}</div>
    </div>
  )
})

export default function AIAdvisor({ isOpen, onClose, gameContext }: AIAdvisorProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keyConfigured, setKeyConfigured] = useState(hasApiKey())

  // ====== 性能关键：流式文本完全脱离 React state ======
  // 用 ref 持有累积文本，避免每次 chunk 都触发 React 重渲染
  const streamingTextRef = useRef('')
  // 强制刷新计数：用极小的 state 仅作"通知"用途
  const renderTickRef = useRef(0)
  const [, setRenderTick] = useState(0)
  const triggerRender = useCallback(() => {
    renderTickRef.current++
    setRenderTick(renderTickRef.current)
  }, [])

  const [, startTransition] = useTransition()
  const deferredIsStreaming = useDeferredValue(isStreaming)

  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingContentRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // 节流控制：80ms 触发一次 UI 刷新（~12fps，肉眼无法察觉且节省 5-10x 渲染开销）
  const FLUSH_INTERVAL = 80
  const lastFlushRef = useRef(0)
  const flushTimerRef = useRef<number | null>(null)

  // 自动滚动：仅在用户已接近底部时跟随，且只在节流点执行
  const shouldAutoScrollRef = useRef(true)
  const checkScrollPosition = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom < 120
  }, [])
  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScrollRef.current) return
    const el = messagesEndRef.current
    if (!el) return
    el.scrollIntoView({ block: 'end' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen && !keyConfigured) {
      setShowSettings(true)
    }
  }, [isOpen, keyConfigured])

  // 打开/关闭时清理
  //
  // 依赖里必须带 isOpen。本组件在 !isOpen 时直接 return null，容器根本不在 DOM 里，
  // 而初次挂载时正是关闭状态 → `messagesContainerRef.current` 是 null → 这个 effect
  // 在第一行就 return 掉了。依赖只有稳定的 checkScrollPosition，意味着它此后
  // **永远不会再执行**：滚动监听从未挂上，shouldAutoScrollRef 恒为 true，
  // 于是谋士每次流式刷新都把画面强拉回底部，玩家想往上翻看自己刚问的问题都做不到。
  useEffect(() => {
    if (!isOpen) return
    const el = messagesContainerRef.current
    if (!el) return
    // 每次重新打开都回到「跟随最新消息」的默认姿态
    shouldAutoScrollRef.current = true
    el.addEventListener('scroll', checkScrollPosition)
    return () => el.removeEventListener('scroll', checkScrollPosition)
  }, [isOpen, checkScrollPosition])

  // 流式期间用 setInterval 定期滚动（与 flush 节流同频）
  useEffect(() => {
    if (!isStreaming) {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      return
    }
    flushTimerRef.current = window.setTimeout(() => {
      scrollToBottom()
      flushTimerRef.current = null
    }, FLUSH_INTERVAL)
    return () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [renderTickRef.current, isStreaming, scrollToBottom])

  const handleSaveKey = () => {
    setApiKey(apiKeyInput.trim())
    setKeyConfigured(apiKeyInput.trim().length > 0)
    if (apiKeyInput.trim()) {
      setShowSettings(false)
      setError('')
    }
  }

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return

    if (!keyConfigured) {
      setShowSettings(true)
      return
    }

    const userMessage: DisplayMessage = { role: 'user', content }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setError('')
    setIsStreaming(true)

    // 关键：流式文本重置
    streamingTextRef.current = ''
    lastFlushRef.current = performance.now()
    triggerRender() // 立即显示一个空的气泡

    const chatHistory: ChatMessage[] = newMessages.map(m => ({
      role: m.role,
      content: m.content
    }))

    abortRef.current = new AbortController()

    try {
      let accumulated = ''
      let lastFlush = performance.now()

      for await (const chunk of streamChat(chatHistory, gameContext, abortRef.current.signal)) {
        accumulated += chunk
        streamingTextRef.current = accumulated
        const now = performance.now()
        // 节流：80ms 才触发一次 UI 刷新
        if (now - lastFlush >= FLUSH_INTERVAL) {
          lastFlush = now
          // 用 startTransition 标记为低优先级更新，避免阻塞输入响应
          startTransition(() => {
            triggerRender()
          })
        }
      }
      // 流结束：最后一次 force render 写入全部文本
      streamingTextRef.current = accumulated
      startTransition(() => {
        triggerRender()
      })
      // 推入历史消息
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
      streamingTextRef.current = ''
      startTransition(() => {
        triggerRender()
      })

      if (!accumulated.trim()) {
        setError('AI 暂未返回内容，请重新提问一次')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用户取消，保留已生成内容
        if (streamingTextRef.current) {
          setMessages(prev => [...prev, { role: 'assistant', content: streamingTextRef.current }])
          streamingTextRef.current = ''
          triggerRender()
        }
      } else {
        const msg = err instanceof Error ? err.message : '请求失败'
        let displayMsg = msg
        if (msg.includes('upstream error') || msg.includes('(500)')) {
          displayMsg = 'API 服务暂时繁忙，请稍后重试（已自动重试 3 次）'
        } else if (msg.includes('(401)') || msg.includes('(403)')) {
          displayMsg = 'API Key 无效或已过期，请点击设置按钮重新设置'
        } else if (msg.includes('(429)')) {
          displayMsg = '请求过于频繁，请稍候片刻'
        } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          displayMsg = '网络连接失败，请检查网络后重试'
        }
        setError(displayMsg)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const quickQuestions: string[] = []
  if (gameContext.currentEventTitle) {
    quickQuestions.push('此事件当如何应对？')
    quickQuestions.push('各选项利弊如何？')
  }
  if (gameContext.gameState['圣眷'] !== undefined && gameContext.gameState['圣眷'] < 30) {
    quickQuestions.push('圣眷日衰，如何挽回圣心？')
  }
  if (gameContext.gameState['民望'] !== undefined && gameContext.gameState['民望'] < 30) {
    quickQuestions.push('民望不佳，当如何收拢人心？')
  }
  if (gameContext.gameState['国势'] !== undefined && gameContext.gameState['国势'] < 30) {
    quickQuestions.push('国势倾颓，大人有何良策？')
  }
  if (quickQuestions.length === 0) {
    quickQuestions.push('当下局势如何？')
    quickQuestions.push('今后当如何筹谋？')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  // 关键：每次 render 都从 ref 读取最新流式文本（避开 useState 异步问题）
  const streamingText = streamingTextRef.current
  const showStreamingBubble = deferredIsStreaming || (isStreaming && streamingText.length > 0)

  const node = (
    <div className="ai-advisor-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ai-advisor-panel">
        <div className="ai-header">
          <div className="ai-header-title">
            <span className="ai-header-icon">策</span>
            <span>谋士对谈</span>
          </div>
          <div className="ai-header-actions">
            <button
              className="ai-header-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="设置 API Key"
            >
              设
            </button>
            <button className="ai-header-btn" onClick={onClose} title="关闭">
              关
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="ai-settings">
            <div className="ai-settings-label">Agnes API Key（谋士对谈 · 丹青插图共用）</div>
            <div className="ai-settings-input-row">
              <input
                type="password"
                className="ai-settings-input"
                placeholder="sk-..."
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
              />
              <button className="ai-settings-save" onClick={handleSaveKey}>保存</button>
            </div>
            <div className="ai-settings-hint">
              {keyConfigured
                ? '已配置密钥，可正常对谈'
                : '请输入 API Key 后保存。密钥仅存储在本地浏览器中。'}
            </div>
          </div>
        )}

        <div className="ai-messages" ref={messagesContainerRef}>
          {messages.length === 0 && !showStreamingBubble && (
            <div className="ai-welcome">
              <div className="ai-welcome-icon">策</div>
              <div className="ai-welcome-text">
                {keyConfigured
                  ? `${gameContext.playerName}大人，但有所问，学生知无不言。`
                  : '请先配置 API Key，方可对谈。'}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} avatarChar={gameContext.playerName.charAt(0) || '某'} />
          ))}

          {showStreamingBubble && (
            <div className="ai-msg assistant ai-streaming-bubble">
              <div className="ai-msg-avatar">策</div>
              <div className="ai-msg-content" ref={streamingContentRef}>
                {streamingText}
                <span className="ai-cursor">▋</span>
              </div>
            </div>
          )}

          {error && (
            <div className="ai-error">{error}</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {!isStreaming && keyConfigured && (
          <div className="ai-quick-questions">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                className="ai-quick-btn"
                onClick={() => handleSend(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="ai-input-area">
          <textarea
            ref={inputRef}
            className="ai-input"
            placeholder={keyConfigured ? '询问谋士...' : '请先配置 API Key'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || !keyConfigured}
            rows={1}
          />
          {isStreaming ? (
            <button className="ai-send-btn stop" onClick={handleStop}>
              停止
            </button>
          ) : (
            <button
              className="ai-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || !keyConfigured}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
