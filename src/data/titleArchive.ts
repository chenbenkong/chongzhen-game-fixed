import { careerGoalStatus } from './careerGoals'
import { getStoryline } from './storylines'
import {
  buildSavePreview,
  loadAutosave,
  type SaveData,
  type SavePreview
} from '../types/save'

/**
 * 标题屏「生涯档案条」的唯一数据口径。
 *
 * 只读最近一次自动存档，不遍历手动槽位：自动存档每回合都写，
 * 正常游玩时必然是四个槽里最新的一份；读手动档也是从它恢复后继续写自动存档。
 * 这样标题屏只解析一份存档，不会为了展示再解析 2–4 份 1 MB 的 JSON。
 *
 * 返回的是剥掉事件正文、事件队列后的轻量摘要，不把整份 SaveData 挂到标题屏上。
 */
export interface TitleArchiveSnapshot {
  preview: SavePreview
  careerName: string
  careerCompleted: number
  careerTotal: number
  storylineName: string
  lifeRecordCount: number
}

export function buildArchiveFromSave(save: SaveData): TitleArchiveSnapshot | null {
  const preview = buildSavePreview(save)
  if (!preview) return null

  const career = careerGoalStatus(
    save.character.careerGoal ?? null,
    save.character,
    save.gameState
  )

  return {
    preview,
    careerName: career ? career.goal.name : '未立志业',
    careerCompleted: career ? career.completed : 0,
    careerTotal: 3,
    storylineName: getStoryline(save.currentStoryline)?.name ?? '未启程',
    lifeRecordCount: save.lifeRecords?.length ?? 0
  }
}

export function getAutosaveArchive(): TitleArchiveSnapshot | null {
  const save = loadAutosave()
  if (!save) return null
  return buildArchiveFromSave(save)
}
