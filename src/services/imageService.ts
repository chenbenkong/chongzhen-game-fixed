/**
 * Agnes Image 2.5 Flash 图像生成服务
 * 为「崇祯·宦海浮沉模拟器」提供 AI 场景插图能力
 */

const API_URL = 'https://apihub.agnes-ai.com/v1/images/generations'
const MODEL = 'agnes-image-2.5-flash'
// 长耗时操作：图像生成通常 30-120s
const TIMEOUT_MS = 120_000

/** 尺寸档位 */
export type ImageSize = '1K' | '2K' | '3K' | '4K'
/** 宽高比 */
export type ImageRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16' | '2:3' | '3:2' | '21:9'

export interface ImageGenRequest {
  prompt: string
  size?: ImageSize
  ratio?: ImageRatio
  /** 是否返回 base64（默认 false，返回 URL） */
  returnBase64?: boolean
}

export interface ImageGenResult {
  url?: string
  b64Json?: string
  revisedPrompt?: string | null
}

/** 复用 aiService.ts 的密钥管理（localStorage 优先 + 环境变量兜底） */
export function getImageApiKey(): string {
  // 同一份密钥：用户已经在 AIAdvisor 里设置过
  const localKey = localStorage.getItem('chongzhen_ai_apikey')
  if (localKey) return localKey
  const envKey = import.meta.env.VITE_AI_API_KEY as string | undefined
  return envKey || ''
}

export function hasImageApiKey(): boolean {
  return getImageApiKey().length > 0
}

/** 优化 prompt：注入明末风格词，让生成的图像更契合古风游戏 */
export function enhancePrompt(userPrompt: string, context?: { era?: string; style?: string }): string {
  const era = context?.era || '明朝末年崇祯年间'
  const style = context?.style || '中国工笔重彩与水墨写意结合的电影级古风写实风格'
  // 明末 + 风格 + 画质词
  return `${userPrompt}，${era}，${style}，丰富的明代服饰、建筑、生活细节，柔和自然光，富有时代气息，高视觉密度，电影级构图，4K 高清细节`
}

/**
 * 调用图像生成 API
 * 超时 120s，单次调用（图像生成不便宜，不重试避免重复计费）
 */
export async function generateImage(
  req: ImageGenRequest,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  const apiKey = getImageApiKey()
  if (!apiKey) {
    throw new Error('未配置 API Key，请点击右上角设置按钮输入密钥')
  }

  // 合并外部 signal + 内部超时 signal
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), TIMEOUT_MS)
  const combinedSignal = signal
    ? composeSignals(signal, timeoutController.signal)
    : timeoutController.signal

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: req.prompt,
        size: req.size || '2K',
        ratio: req.ratio || '16:9',
        return_base64: req.returnBase64 || false,
        extra_body: {
          response_format: req.returnBase64 ? 'b64_json' : 'url'
        }
      }),
      signal: combinedSignal,
      keepalive: true
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      throw new Error(`图像生成失败 (${response.status}): ${errText}`)
    }

    const json = await response.json()
    const item = json?.data?.[0]
    if (!item) {
      throw new Error('API 返回数据格式异常')
    }
    return {
      url: item.url || undefined,
      b64Json: item.b64_json || undefined,
      revisedPrompt: item.revised_prompt
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // 区分用户取消 vs 超时
      if (signal?.aborted) throw err
      throw new Error('图像生成超时（120s），请稍后重试')
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/** 合并多个 AbortSignal，任一被 abort 则全部 abort */
function composeSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      controller.abort()
      break
    }
    s.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
}
