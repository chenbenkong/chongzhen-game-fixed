import { toMingEraYear } from '../utils/mingEra'
import type { TitleArchiveSnapshot } from '../data/titleArchive'
import './CareerArchiveStrip.css'

interface CareerArchiveStripProps {
  archive: TitleArchiveSnapshot | null
}

/**
 * 标题屏的「最近一局」生涯摘要。
 *
 * 只展示已经存在的存档：没有档时不渲染空条，避免给新玩家多一行噪声。
 * 数据全部来自自动存档摘要，点击继续仍走原来的「继续游戏 / 继续上次」按钮。
 */
export default function CareerArchiveStrip({ archive }: CareerArchiveStripProps) {
  if (!archive) return null

  const { preview } = archive

  return (
    <div className="career-archive-strip" aria-label="最近一局生涯档案">
      <span className="career-archive-strip__label">生涯档案</span>
      <span className="career-archive-strip__name">{preview.playerName}</span>
      <span className="career-archive-strip__sep" aria-hidden="true">·</span>
      <span className="career-archive-strip__time">
        {toMingEraYear(preview.year)} {preview.month}月
      </span>
      <span className="career-archive-strip__sep" aria-hidden="true">·</span>
      <span className="career-archive-strip__rank">{preview.rank}</span>
      <span className="career-archive-strip__rule" aria-hidden="true" />
      <span className="career-archive-strip__career">
        志业 · {archive.careerName} {archive.careerCompleted}/{archive.careerTotal}
      </span>
      <span className="career-archive-strip__sep career-archive-strip__sep--detail" aria-hidden="true">·</span>
      <span className="career-archive-strip__storyline career-archive-strip__detail">
        史线 · {archive.storylineName}
      </span>
      <span className="career-archive-strip__sep career-archive-strip__sep--detail" aria-hidden="true">·</span>
      <span className="career-archive-strip__records career-archive-strip__detail">
        履历 {archive.lifeRecordCount}
      </span>
    </div>
  )
}
