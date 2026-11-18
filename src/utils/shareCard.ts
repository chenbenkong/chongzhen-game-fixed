/**
 * 青史分享卡：结局页导出一张 3:4 的“这一生”卷轴图。
 *
 * 设计约束：
 *  - 不引入第三方截图库，不依赖 DOM 截图；直接画 Canvas，避免把整页 UI 的
 *    CSS/字体/响应式布局一起塞进图片。
 *  - 图上只放玩家自己这一局的事实：姓名、出身、官至、结局、评语、故人。
 *  - 不带二维码、不带外部链接；保存下来就能直接发。
 *  - 成人内容不进入分享卡：调用方只传已经展示在结局页的文本，不碰 gray 事件。
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
}

export interface ShareCardModel {
  nameLine: string
  metaLine: string
  endingLine: string
  scoreLine: string
  evaluation: string
  people: string[]
  footer: string
}

export function buildShareCardModel(input: ShareCardInput): ShareCardModel {
  const courtesy = input.courtesyName?.trim()
  const nameLine = courtesy && courtesy !== input.name ? `${input.name}　字${courtesy}` : input.name
  const metaLine = [input.origin, input.finalRank].filter(Boolean).join('　·　')
  return {
    nameLine,
    metaLine,
    endingLine: input.endingTitle,
    scoreLine: `功过 ${Math.round(input.score)} / 100　·　宦海 ${input.years}`,
    evaluation: input.evaluation.trim(),
    people: (input.people ?? []).filter(Boolean).slice(0, 3),
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

export function drawShareCard(input: ShareCardInput): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const model = buildShareCardModel(input)
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

  // 评语
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  ctx.font = '28px "STKaiti", "KaiTi", "SimKai", serif'
  const bodyLines = wrapCanvasText(model.evaluation, innerWidth, (value) => ctx.measureText(value).width)
    .slice(0, 12)
  let y = 556
  for (const line of bodyLines) {
    ctx.fillText(line, margin, y)
    y += 46
  }

  // 故人
  if (model.people.length > 0) {
    y += 18
    ctx.fillStyle = gold
    ctx.font = '700 26px "STKaiti", "KaiTi", "SimKai", serif'
    ctx.fillText('故　人', margin, y)
    y += 46
    ctx.fillStyle = ink
    ctx.font = '26px "STKaiti", "KaiTi", "SimKai", serif'
    for (const person of model.people) {
      const line = wrapCanvasText(person, innerWidth, (value) => ctx.measureText(value).width)[0] ?? ''
      ctx.fillText(line, margin, y)
      y += 40
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

export function downloadShareCard(input: ShareCardInput): boolean {
  const canvas = drawShareCard(input)
  if (!canvas || typeof document === 'undefined') return false
  const link = document.createElement('a')
  link.download = `崇祯直聘-青史-${input.name || '无名'}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  return true
}
