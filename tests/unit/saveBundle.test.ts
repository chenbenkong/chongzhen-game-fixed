import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildSaveBundle,
  serializeSaveBundle,
  parseSaveBundle,
  applySaveBundle,
  loadAutosave,
  loadSaveSlot,
  saveAutosave,
  saveSaveSlot,
  resetAutosaveSeqGuardForTest,
  SAVE_BUNDLE_FORMAT,
  SAVE_BUNDLE_VERSION,
  SAVE_SCHEMA_VERSION
} from '../../src/types/save'
import { makeSaveData } from './helpers/gameEngine'

beforeEach(() => {
  localStorage.clear()
  resetAutosaveSeqGuardForTest()
})

function bundleWith(slots: Array<{ slotId: number; data: unknown }>, autosave: unknown = null) {
  return JSON.stringify({
    format: SAVE_BUNDLE_FORMAT,
    version: SAVE_BUNDLE_VERSION,
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: '2026-11-19T00:00:00.000Z',
    autosave,
    slots
  })
}

describe('P2.6 本地存档备份', () => {
  it('导出自动存档与手动槽位，清空后导入能原样恢复', () => {
    saveSaveSlot(1, makeSaveData({ playerName: '甲档', savedAt: '2026-01-01T00:00:00.000Z' }))
    saveAutosave(makeSaveData({ playerName: '乙档', savedAt: '2026-02-02T00:00:00.000Z' }))

    const bundle = buildSaveBundle()
    expect(bundle.slots.map((entry) => entry.slotId)).toEqual([1])
    expect(bundle.slots[0].data.playerName).toBe('甲档')
    expect(bundle.autosave?.playerName).toBe('乙档')

    const json = serializeSaveBundle(bundle)
    localStorage.clear()
    resetAutosaveSeqGuardForTest()

    const parsed = parseSaveBundle(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.summary.total).toBe(2)
    expect(parsed.summary.slots[0].preview.playerName).toBe('甲档')
    expect(parsed.summary.autosave?.playerName).toBe('乙档')

    const applied = applySaveBundle(parsed.bundle)
    expect(applied.ok).toBe(true)
    expect(applied.importedSlots).toEqual([1])
    expect(applied.autosaveImported).toBe(true)
    expect(loadSaveSlot(1)?.playerName).toBe('甲档')
    expect(loadAutosave()?.playerName).toBe('乙档')
  })

  it('导入只覆盖备份里出现的槽位，未出现的槽位保持原样', () => {
    saveSaveSlot(3, makeSaveData({ playerName: '丙档' }))
    const parsed = parseSaveBundle(bundleWith([
      { slotId: 1, data: makeSaveData({ playerName: '新甲档' }) }
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const applied = applySaveBundle(parsed.bundle)
    expect(applied.ok).toBe(true)
    expect(loadSaveSlot(1)?.playerName).toBe('新甲档')
    expect(loadSaveSlot(3)?.playerName).toBe('丙档')
  })

  it('拒绝未知格式、错误版本、重复槽位与空包', () => {
    expect(parseSaveBundle('')).toMatchObject({ ok: false })
    expect(parseSaveBundle('{')).toMatchObject({ ok: false })
    expect(parseSaveBundle(JSON.stringify({ format: 'other' }))).toMatchObject({ ok: false })
    expect(parseSaveBundle(JSON.stringify({
      format: SAVE_BUNDLE_FORMAT,
      version: 99,
      slots: [],
      autosave: null
    }))).toMatchObject({ ok: false })

    const save = makeSaveData({ playerName: '重复' })
    expect(parseSaveBundle(bundleWith([
      { slotId: 1, data: save },
      { slotId: 1, data: save }
    ]))).toMatchObject({ ok: false })

    expect(parseSaveBundle(bundleWith([]))).toMatchObject({ ok: false })
  })

  it('旧版本备份在导入时补齐 stats / meritBonus / schemaVersion', () => {
    const legacy = makeSaveData({
      playerName: '旧档',
      schemaVersion: 1,
      stats: undefined,
      meritBonus: undefined
    })
    const parsed = parseSaveBundle(bundleWith([{ slotId: 2, data: legacy }]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const data = parsed.bundle.slots[0].data
    expect(data.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
    expect(data.stats).toEqual({
      luckyStreak: 0,
      unluckyStreak: 0,
      firstChoiceCount: 0,
      randomChoiceCount: 0,
      undoCount: 0,
      saveCount: 0
    })
    expect(data.meritBonus).toBe(0)
  })
})
