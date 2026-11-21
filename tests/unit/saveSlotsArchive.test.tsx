import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import SaveSlotsModal from '../../src/components/SaveSlotsModal'
import { buildArchiveFromSave } from '../../src/data/titleArchive'
import {
  deleteSaveSlot,
  getAllSaveSlots,
  saveSaveSlot
} from '../../src/types/save'
import { makeCharacter, makeGameState, makeLifeRecord, makeSaveData } from './helpers/gameEngine'

function makeCareerSave(overrides: Parameters<typeof makeSaveData>[0] = {}) {
  const character = makeCharacter({
    name: '顾承畴',
    rank: '户部主事',
    careerGoal: 'reputation'
  })
  return makeSaveData({
    character,
    gameState: makeGameState({ currentYear: 1629, currentMonth: 4, 清议: 66 }),
    playerName: '顾承畴',
    lifeRecords: [
      makeLifeRecord({ id: 'r1', year: 1628, month: 7, title: '清丈田亩' }),
      makeLifeRecord({ id: 'r2', year: 1629, month: 4, title: '己巳之变' })
    ],
    currentStoryline: 'power',
    playTime: 0,
    ...overrides
  })
}

describe('P4.1 存档槽位生涯摘要', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('手动槽位直接展示志业进度、史线与履历数', () => {
    expect(saveSaveSlot(1, makeCareerSave())).toBe(true)

    const slots = getAllSaveSlots()
    const archive = slots[0].data ? buildArchiveFromSave(slots[0].data) : null
    expect(archive?.careerName).toBe('清名')
    expect(archive?.careerCompleted).toBe(2)
    expect(archive?.storylineName).toBe('权谋之术')
    expect(archive?.lifeRecordCount).toBe(2)

    render(
      <SaveSlotsModal
        isOpen
        mode="load"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('清名 2/3 · 权谋之术 · 履历 2')).not.toBeNull()

    // 存档条自己的 class 不能再用 preview-name：它会撞上取名屏 NameInput 的
    // .preview-name（display:flex、大字），把槽位撑成 400px 高。
    const content = document.querySelector('.save-slot.has-data .slot-content')
    const slot = document.querySelector('.save-slot.has-data')
    expect(content?.querySelector('.save-slot-name')?.textContent).toBe('顾承畴')
    expect(content?.querySelector('.preview-name')).toBeNull()
    const meta = content?.querySelector('.slot-meta-line')?.textContent?.replace(/\s+/g, ' ')
    expect(meta).toContain('1629年4月')
    expect(meta).toContain('户部主事')
    expect(meta).not.toContain('存档')
    expect(slot?.querySelector('.slot-header-stamp')?.textContent).toContain('存档')
    expect(content?.querySelector('.slot-info')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('每个手动槽位只解析一次存档本体', () => {
    saveSaveSlot(1, makeCareerSave())
    deleteSaveSlot(2)
    deleteSaveSlot(3)

    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    getAllSaveSlots()
    const slotReads = getItem.mock.calls.filter(([key]) =>
      String(key).startsWith('chongzhen_save_slot_')
    )

    expect(slotReads).toHaveLength(3)
  })
})
