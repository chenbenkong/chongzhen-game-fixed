/**
 * 青史分享卡：结局页导出一张 3:4 的“这一生”卷轴图。
 *
 * 设计约束：
 *  - 不引入第三方截图库，不依赖 DOM 截图；直接画 Canvas，避免把整页 UI 的
 *    CSS/字体/响应式布局一起塞进图片。
 *  - 图上只放玩家自己这一局的事实：姓名、出身、官至、结局、评语、故人（带立绘）。
 *  - 不带二维码、不带外部链接；保存下来就能直接发。
 *  - 成人内容不进入分享卡：调用方只传已经展示在结局页的文本，不碰 gray 事件。
 *  - 立绘加载失败不毁卡：预加载超时/出错回退占位圆，文字照常画。
 */

export interface ShareCardInput {
  name: string
  courtesyName?: string
  origin: string
  finalRank: string
  endingTitle: string
  evaluation: string
  years: string
  score: number
  date: string
  /** 结局页“故人”段里已经算好的名字 + 身份，最多三个。 */
  people?: string[]
  /** 与 people 同序的立绘 URL（结局页同一份 characterPortrait 映射），最多三个。 */
  peoplePortraits?: (string | undefined)[]
  /** P0.2 志业评价，例如“志业　升迁 · 近志（2/3）”；不立志业时留空。 */
  careerGoal?: string
}

export interface ShareCardModel {
  nameLine: string
  metaLine: string
  endingLine: string
  scoreLine: string
  goalLine: string
  evaluation: string
  people: string[]
  peoplePortraits: (string | undefined)[]
  footer: string
}

export function buildShareCardModel(input: ShareCardInput): ShareCardModel {
  const courtesy = input.courtesyName?.trim()
  const nameLine = courtesy && courtesy !== input.name ? `${input.name}　字${courtesy}` : input.name
  const metaLine = [input.origin, input.finalRank].filter(Boolean).join('　·　')
  // 名字与立绘按同一序配对后再过滤/截断，避免空名字把立绘错位到别人脸上。
  const pairs = (input.people ?? [])
    .map((line, i) => ({ line, portrait: input.peoplePortraits?.[i] }))
    .filter((p) => p.line)
    .slice(0, 3)
  return {
    nameLine,
    metaLine,
    endingLine: input.endingTitle,
    scoreLine: `功过 ${Math.round(input.score)} / 100　·　宦海 ${input.years}`,
    goalLine: input.careerGoal?.trim() ?? '',
    evaluation: input.evaluation.trim(),
    people: pairs.map((p) => p.line),
    peoplePortraits: pairs.map((p) => p.portrait),
    footer: `${input.date}　·　青史`
  }
}

/** 纯排版测量：按像素宽度拆行，中文按单字拆，英文按词拆。 */
export function wrapCanvasText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    if (!paragraph.trim()) continue
    let line = ''
    let i = 0
    while (i < paragraph.length) {
      const char = paragraph[i]
      const next = line + char
      if (measure(next) <= maxWidth || line.length === 0) {
        line = next
        i++
      } else {
        lines.push(line)
        line = char
        i++
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

export interface ShareCardLayout {
  bodyStartY: number
  bodyLineHeight: number
  /** 评语最多画几行：给故人块让位，保证不压页脚/印章。 */
  evalLineLimit: number
  peopleGap: number
  peopleHeaderHeight: number
  /** 每个故人一行的高度；带立绘时更高。 */
  rowHeight: number
  /** 立绘直径；0 表示纯文本行。 */
  portraitSize: number
  /** 故人块底边不得超过此 y（印章顶 1272 / 页脚 1328 之上留余量）。 */
  peopleBottomLimit: number
}

/**
 * 纯排版规划：不碰 Canvas，便于单测钉住“故人块不压页脚/印章”。
 * 带立绘时行高 84（圆像 72），纯文本行高 40；评语行数按剩余空间动态收紧。
 */
export function planShareCardLayout(opts: {
  hasGoal: boolean
  peopleCount: number
  hasPortraits: boolean
}): ShareCardLayout {
  const bodyStartY = opts.hasGoal ? 574 : 556
  const bodyLineHeight = 46
  const peopleGap = opts.hasGoal ? 36 : 18
  const peopleHeaderHeight = 46
  const peopleBottomLimit = 1240
  const baseLimit = opts.hasGoal ? 10 : 12
  const rowHeight = opts.peopleCount === 0 ? 0 : opts.hasPortraits ? 84 : 40
  const portraitSize = opts.peopleCount > 0 && opts.hasPortraits ? 72 : 0
  let evalLineLimit = baseLimit
  if (opts.peopleCount > 0) {
    const available =
      peopleBottomLimit - peopleHeaderHeight - opts.peopleCount * rowHeight - peopleGap - bodyStartY
    evalLineLimit = Math.max(1, Math.min(baseLimit, Math.floor(available / bodyLineHeight)))
  }
  return {
    bodyStartY,
    bodyLineHeight,
    evalLineLimit,
    peopleGap,
    peopleHeaderHeight,
    rowHeight,
    portraitSize,
    peopleBottomLimit
  }
}

/** 预加载立绘；超时/出错回退 null，绝不 reject（毁卡不如少一张像）。 */
function loadPortrait(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 4000)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

export async function drawShareCard(input: ShareCardInput): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const model = buildShareCardModel(input)
  const layout = planShareCardLayout({
    hasGoal: !!model.goalLine,
    peopleCount: model.people.length,
    hasPortraits: model.peoplePortraits.some((p) => !!p)
  })
  const portraits = await Promise.all(
    model.peoplePortraits.map((url) => (url ? loadPortrait(url) : Promise.resolve(null)))
  )
  const margin = 92
  const innerWidth = canvas.width - margin * 2
  const paper = '#e9dfc8'
  const ink = '#2c241b'
  const muted = '#6f6250'
  const gold = '#9a7428'

  // 纸底 + 细横纹，避免纯色看起来像 PPT。
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(80, 62, 38, 0.06)'
  ctx.lineWidth = 1
  for (let y = 40; y < canvas.height; y += 38) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }

  // 双线框
  ctx.strokeStyle = 'rgba(44, 36, 27, 0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(46, 46, canvas.width - 92, canvas.height - 92)
  ctx.strokeStyle = 'rgba(154, 116, 40, 0.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(62, 62, canvas.width - 124, canvas.height - 124)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = muted
  ctx.font = '24px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.fillText('崇 祯 直 聘　·　明 末 人 生', canvas.width / 2, 138)

  ctx.fillStyle = ink
  ctx.font = '700 72px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.fillText(model.nameLine, canvas.width / 2, 252)

  ctx.fillStyle = muted
  ctx.font = '28px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.fillText(model.metaLine, canvas.width / 2, 318)

  ctx.strokeStyle = 'rgba(154, 116, 40, 0.5)'
  ctx.beginPath()
  ctx.moveTo(canvas.width / 2 - 150, 354)
  ctx.lineTo(canvas.width / 2 + 150, 354)
  ctx.stroke()

  ctx.fillStyle = gold
  ctx.font = '700 42px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.fillText(`【${model.endingLine}】`, canvas.width / 2, 430)

  ctx.fillStyle = muted
  ctx.font = '24px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.fillText(model.scoreLine, canvas.width / 2, 478)

  // P0.2 志业：只占一行，放在功过下面；没有志业时不占位。
  if (model.goalLine) {
    ctx.fillStyle = gold
    ctx.font = '24px "STKaiti", "KaiTi", "SimKai", serif'
    ctx.fillText(model.goalLine, canvas.width / 2, 522)
  }

  // 评语；行数由 layout 收紧，给故人块让位；超出的部分用省略号收尾。
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  ctx.font = '28px "STKaiti", "KaiTi", "SimKai", serif'
  const allBodyLines = wrapCanvasText(model.evaluation, innerWidth, (value) => ctx.measureText(value).width)
  const bodyLines = allBodyLines.slice(0, layout.evalLineLimit)
  if (allBodyLines.length > layout.evalLineLimit && bodyLines.length > 0) {
    bodyLines[bodyLines.length - 1] += '…'
  }
  let y = layout.bodyStartY
  for (const line of bodyLines) {
    ctx.fillText(line, margin, y)
    y += layout.bodyLineHeight
  }

  // 故人：带立绘时圆像 + 右侧名字身份；立绘缺失画占位圆，文字照常。
  if (model.people.length > 0) {
    y += layout.peopleGap
    ctx.fillStyle = gold
    ctx.font = '700 26px "STKaiti", "KaiTi", "SimKai", serif'
    ctx.fillText('故　人', margin, y)
    y += layout.peopleHeaderHeight
    ctx.font = '26px "STKaiti", "KaiTi", "SimKai", serif'
    for (let i = 0; i < model.people.length; i++) {
      const person = model.people[i]
      if (layout.portraitSize > 0) {
        const size = layout.portraitSize
        const cx = margin + size / 2
        const cy = y + size / 2
        const r = size / 2
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        const img = portraits[i]
        if (img && img.width > 0 && img.height > 0) {
          const scale = Math.max(size / img.width, size / img.height)
          const dw = img.width * scale
          const dh = img.height * scale
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
        } else {
          ctx.fillStyle = 'rgba(44, 36, 27, 0.15)'
          ctx.fillRect(cx - r, cy - r, size, size)
        }
        ctx.restore()
        ctx.strokeStyle = 'rgba(154, 116, 40, 0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = ink
        const textX = margin + size + 20
        const line = wrapCanvasText(person, innerWidth - size - 20, (v) => ctx.measureText(v).width)[0] ?? ''
        ctx.fillText(line, textX, y + size / 2 + 9)
      } else {
        ctx.fillStyle = ink
        const line = wrapCanvasText(person, innerWidth, (v) => ctx.measureText(v).width)[0] ?? ''
        ctx.fillText(line, margin, y + 30)
      }
      y += layout.rowHeight
    }
  }

  // 页脚
  ctx.textAlign = 'center'
  ctx.fillStyle = muted
  ctx.font = '24px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.fillText(model.footer, canvas.width / 2, canvas.height - 112)

  // 印章
  ctx.save()
  ctx.translate(canvas.width - 154, canvas.height - 168)
  ctx.rotate(-0.06)
  ctx.fillStyle = 'rgba(164, 48, 38, 0.9)'
  ctx.fillRect(0, 0, 84, 84)
  ctx.strokeStyle = 'rgba(255, 238, 216, 0.85)'
  ctx.lineWidth = 2
  ctx.strokeRect(7, 7, 70, 70)
  ctx.fillStyle = '#f4e7d2'
  ctx.font = '700 28px "STKaiti", "KaiTi", "SimKai", serif'
  ctx.textAlign = 'center'
  ctx.fillText('青', 42, 38)
  ctx.fillText('史', 42, 72)
  ctx.restore()

  return canvas
}

export async function downloadShareCard(input: ShareCardInput): Promise<boolean> {
  const canvas = await drawShareCard(input)
  if (!canvas || typeof document === 'undefined') return false
  const link = document.createElement('a')
  link.download = `崇祯直聘-青史-${input.name || '无名'}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  return true
}