import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const BGM_KEY = 'chongzhen_bgm_on'

interface BGMCtx {
  on: boolean
  toggle: () => void
  /** 加载状态：'idle'（还没开始加载）| 'loading' | 'ready' | 'error' */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** 加载/播放错误信息（用于 UI 提示） */
  errorMessage: string
}

const BGMContext = createContext<BGMCtx | null>(null)

export function useBGM(): BGMCtx {
  const ctx = useContext(BGMContext)
  if (!ctx) throw new Error('useBGM must be used within BGMProvider')
  return ctx
}

function bgmSrc() {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? `${base}bgm.mp3` : `${base}/bgm.mp3`
}

export function BGMProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 默认关，避免浏览器 autoplay 策略导致用户迷惑（以为点不动）
  const [on, setOn] = useState<boolean>(() => {
    try {
      // 老用户保留上次选择；新用户默认关
      return localStorage.getItem(BGM_KEY) === '1'
    } catch {
      return false
    }
  })
  const [status, setStatus] = useState<BGMCtx['status']>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  /**
   * 惰性创建 audio。
   *
   * 此前 audio 是**挂载即创建** + `preload='auto'`：标题屏一出来，
   * 浏览器就开始下 5.7 MB 的 bgm.mp3 —— 哪怕玩家从没开过音乐（默认是关的）。
   * 本地实测首屏总流量 9.35 MB，其中 5.71 MB 就是这口没人听的音频。
   *
   * 现在改成"真要播了才创建"：默认关的玩家一个字节都不下，
   * 开了音乐的玩家才在那一刻开始加载（此时本来就有用户手势，不会触发 autoplay 拒绝）。
   */
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current
    const src = bgmSrc()
    const a = new Audio()
    a.loop = true
    a.volume = 0.4
    a.preload = 'auto'
    a.src = src

    a.addEventListener('canplay', () => {
      setStatus('ready')
      setErrorMessage('')
      // 重要：canplay 不再自动 play，等用户点击
    })
    a.addEventListener('error', () => {
      setStatus('error')
      setErrorMessage(`背景音乐加载失败：${src}`)
      // eslint-disable-next-line no-console
      console.error('[BGM] audio error:', { src, code: a.error?.code, message: a.error?.message })
    })

    audioRef.current = a
    setStatus('loading')
    return a
  }, [])

  // 卸载时回收（整个应用只有一份，随 Provider 一起走）
  useEffect(
    () => () => {
      const a = audioRef.current
      if (!a) return
      a.pause()
      a.removeAttribute('src')
      a.load()
      audioRef.current = null
    },
    []
  )

  // 同步 on -> play/pause + 持久化
  // 关键：依赖项只有 [on]（与 ensureAudio），不能加 status！否则 audio 加载完成时
  // status 变化会触发 play，而此时没有用户交互，play() 会被 autoplay 策略拒掉，反而把状态搞乱。
  useEffect(() => {
    try {
      localStorage.setItem(BGM_KEY, on ? '1' : '0')
    } catch {}

    if (!on) {
      audioRef.current?.pause()
      setErrorMessage('')
      return
    }

    const a = ensureAudio()
    const tryPlay = () => {
      a.play().catch(err => {
        // autoplay 被拒 / 资源 404 等
        const reason =
          err?.name === 'NotAllowedError' ? '请先点击页面任意位置' : err?.message || '未知原因'
        setErrorMessage(`播放未启动：${reason}`)
        // eslint-disable-next-line no-console
        console.warn('[BGM] play() rejected:', err)
      })
    }
    // 已经能播就直接播；否则等这一块数据到齐（只等一次，避免 canplay 反复触发）
    if (a.readyState >= 3) tryPlay()
    else a.addEventListener('canplay', tryPlay, { once: true })
  }, [on, ensureAudio])

  // 一次性：捕获用户首次交互（点击/按键）后，如果 on=true 但音频 paused，重试 play
  useEffect(() => {
    if (!on) return
    const a = audioRef.current
    if (!a) return
    const handler = () => {
      // 触发后，如果还是 paused 状态，尝试再 play
      if (a.paused) {
        a.play()
          .then(() => setErrorMessage(''))
          .catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[BGM] retry after interaction failed:', err)
          })
      }
    }
    // 只监听一次（首次交互）
    document.addEventListener('click', handler, { once: true, capture: true })
    document.addEventListener('keydown', handler, { once: true, capture: true })
    return () => {
      document.removeEventListener('click', handler, { capture: true })
      document.removeEventListener('keydown', handler, { capture: true })
    }
  }, [on])

  const toggle = () => {
    // 如果是错误状态，再次 toggle 触发重试：重新设置 src 强制重新加载
    if (status === 'error' && audioRef.current) {
      const a = audioRef.current
      a.src = bgmSrc()
      a.load()
      setStatus('loading')
      setErrorMessage('')
    }
    setOn(v => !v)
  }

  return (
    <BGMContext.Provider value={{ on, toggle, status, errorMessage }}>
      {children}
    </BGMContext.Provider>
  )
}
