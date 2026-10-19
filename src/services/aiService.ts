/**
 * Agnes 2.5 Flash AI 服务
 * 为「崇祯·宦海浮沉模拟器」提供谋士对谈能力
 */

const API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions'
const MODEL = 'agnes-2.5-flash'

/** 从环境变量或 localStorage 获取 API Key */
export function getApiKey(): string {
  const localKey = localStorage.getItem('chongzhen_ai_apikey')
  if (localKey) return localKey
  const envKey = import.meta.env.VITE_AI_API_KEY as string | undefined
  return envKey || ''
}

export function setApiKey(key: string): void {
  if (key) {
    localStorage.setItem('chongzhen_ai_apikey', key)
  } else {
    localStorage.removeItem('chongzhen_ai_apikey')
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 游戏上下文 —— 传给 AI 的当前局势摘要 */
export interface GameContext {
  year: number
  month: number
  turn: number
  playerName: string
  courtesyName: string
  hometown: string
  age: number
  origin: string
  rank: string
  degree: string
  attributes: Record<string, number>
  hidden: Record<string, number>
  gameState: Record<string, number>
  currentEventTitle?: string
  currentEventDescription?: string
  currentChoices?: string[]
  recentRecords?: string[]
}

/** 构建系统提示词 */
function buildSystemPrompt(ctx: GameContext): string {
  const attrStr = Object.entries(ctx.attributes)
    .map(([k, v]) => `${k}: ${v}`)
    .join('、')
  const hiddenStr = Object.entries(ctx.hidden)
    .map(([k, v]) => `${k}: ${v}`)
    .join('、')
  const stateStr = Object.entries(ctx.gameState)
    .map(([k, v]) => `${k}: ${v}`)
    .join('、')

  let prompt = `你是一位明末资深谋士，精通经史子集、朝堂博弈与治国理政。你正在辅佐一位大明官员。

【当前局势】
- 时间：崇祯${ctx.year}年${ctx.month}月（第${ctx.turn}回合）
- 角色：${ctx.playerName}${ctx.courtesyName ? `（字${ctx.courtesyName}）` : ''}，${ctx.age}岁，${ctx.origin}出身，${ctx.degree}功名
- 官职：${ctx.rank}
- 籍贯：${ctx.hometown}
- 能力：${attrStr}
- 心性：${hiddenStr}
- 朝局：${stateStr}`

  if (ctx.currentEventTitle) {
    prompt += `\n\n【当前事件】${ctx.currentEventTitle}`
    if (ctx.currentEventDescription) {
      prompt += `\n${ctx.currentEventDescription}`
    }
    if (ctx.currentChoices && ctx.currentChoices.length > 0) {
      prompt += `\n\n可选抉择：`
      ctx.currentChoices.forEach((c, i) => {
        prompt += `\n  ${i + 1}. ${c}`
      })
    }
  }

  if (ctx.recentRecords && ctx.recentRecords.length > 0) {
    prompt += `\n\n【近期经历】`
    ctx.recentRecords.forEach(r => {
      prompt += `\n- ${r}`
    })
  }

  prompt += `\n\n【行为准则】
1. 始终以谋士口吻回答，称呼对方为"大人"或"${ctx.playerName}大人"
2. 回答简洁有力，**严格控制在200字以内**，切忌空泛
3. 结合当前局势给出具体建议，而非泛泛而谈
4. 深谙明末历史背景，可引用史实、典故、先例
5. 如果大人面临抉择，分析每个选项的利弊得失
6. 注意：圣眷代表皇帝态度、中官代表宦官态度、清议代表清流评价、士绅代表士绅态度、民望代表百姓评价
7. 不要编造不存在的游戏机制，只基于给出的信息分析`

  return prompt
}

/** 发送聊天请求（流式） */
export async function* streamChat(
  messages: ChatMessage[],
  ctx: GameContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('未配置 API Key，请点击右上角设置按钮输入密钥')
  }

  const systemPrompt = buildSystemPrompt(ctx)
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  // 重试 3 次以应对 API 偶发 500 错误
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      yield* streamChatOnce(fullMessages, apiKey, signal)
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      const msg = lastError.message
      // 客户端错误（4xx）不重试
      if (msg.includes('(400)') || msg.includes('(401)') || msg.includes('(403)')) {
        throw lastError
      }
      // 服务端错误（5xx）等待 1.5s 后重试
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }
  throw lastError || new Error('API 请求失败')
}

async function* streamChatOnce(
  fullMessages: ChatMessage[],
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  // 关键：keepalive + 优先权，让浏览器立即把请求发出去
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: fullMessages,
      temperature: 0.8,
      // 显式禁用 thinking 模式：否则模型把所有 token 耗在 reasoning_content，
      // 导致 delta.content 为空
      chat_template_kwargs: { enable_thinking: false },
      // 不限制 token 数量上限
      max_tokens: 32000,
      stream: true
    }),
    signal,
    keepalive: true,
    priority: 'high'
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText)
    throw new Error(`API 请求失败 (${response.status}): ${errText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder()
  let buffer = ''
  // 批 yield：把多个小 chunk 累积到 30ms 或 64 字节后一次性 yield，
  // 极大减少上层 setState 次数（从每 chunk 1 次降到每 30ms 1 次）
  let batch = ''
  let lastFlush = performance.now()
  const BATCH_MS = 30
  const BATCH_BYTES = 64

  const flushBatch = (): string | null => {
    if (!batch) return null
    const out = batch
    batch = ''
    lastFlush = performance.now()
    return out
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      const tail = flushBatch()
      if (tail) yield tail
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') {
        const tail = flushBatch()
        if (tail) yield tail
        return
      }

      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          batch += delta
          const now = performance.now()
          if (now - lastFlush >= BATCH_MS || batch.length >= BATCH_BYTES) {
            const out = flushBatch()
            if (out) yield out
          }
        }
      } catch {
        // 跳过无法解析的行
      }
    }
  }
}

async function chatOnce(
  fullMessages: ChatMessage[],
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: fullMessages,
      temperature: 0.8,
      // 显式禁用 thinking 模式：否则模型把所有 token 耗在 reasoning_content，
      // 导致返回内容为空
      chat_template_kwargs: { enable_thinking: false },
      // 不限制 token 数量上限，避免长回答被截断
      max_tokens: 32000
    }),
    signal
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText)
    throw new Error(`API 请求失败 (${response.status}): ${errText}`)
  }

  const json = await response.json()
  return json.choices?.[0]?.message?.content || ''
}

/** 发送聊天请求（非流式，用于简单场景） */
export async function chat(
  messages: ChatMessage[],
  ctx: GameContext,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('未配置 API Key，请点击右上角设置按钮输入密钥')
  }

  const systemPrompt = buildSystemPrompt(ctx)
  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  // 与 streamChat 保持一致：服务端 5xx 时重试 3 次
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await chatOnce(fullMessages, apiKey, signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      lastError = err instanceof Error ? err : new Error(String(err))
      const msg = lastError.message
      // 客户端错误（4xx）不重试
      if (msg.includes('(400)') || msg.includes('(401)') || msg.includes('(403)')) {
        throw lastError
      }
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }
  throw lastError || new Error('API 请求失败')
}
