import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import CareerArchiveStrip from '../../src/components/CareerArchiveStrip'
import { getAutosaveArchive, type TitleArchiveSnapshot } from '../../src/data/titleArchive'
import { deleteAutosave, restoreAutosave } from '../../src/types/save'
import { makeCharacter, makeGameState, makeLifeRecord, makeSaveData } from './helpers/gameEngine'

function makeArchive(overrides: Partial<TitleArchiveSnapshot> = {}): TitleArchiveSnapshot {
  const character = makeCharacter({ rank: '户部主事', careerGoal: 'reputation' })
  return {
    preview: {
      playerName: '顾承畴',
      year: 1629,
      month: 4,
      rank: '户部主事',
      degree: '进士',
      savedAt: '2026-11-21T00:00:00.000Z',
      title: '文官'
    },
    careerName: '清名',
    careerCompleted: 2,
    careerTotal: 3,
    storylineName: '权谋之术',
    lifeRecordCount: 18,
    ...overrides
  }
}

describe('P3.3 标题屏生涯档案条', () => {
  it('把姓名、年月、官位、志业、史线和履历数压进一条档案条', () => {
    const { container } = render(<CareerArchiveStrip archive={makeArchive()} />)
    const strip = container.querySelector('.career-archive-strip')
    expect(strip).not.toBeNull()
    const text = strip?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    expect(text).toContain('生涯档案')
    expect(text).toContain('顾承畴')
    expect(text).toContain('崇祯二年 4月')
    expect(text).toContain('户部主事')
    expect(text).toContain('清名 2/3')
    expect(text).toContain('权谋之术')
    expect(text).toContain('履历 18')
    expect(container.querySelector('.career-archive-strip__label')?.textContent).toBe('生涯档案')
    expect(container.querySelector('.career-archive-strip__name')?.textContent).toBe('顾承畴')
    expect(container.querySelector('.career-archive-strip__career')?.textContent).toBe('志业 · 清名 2/3')
    expect(container.querySelector('.career-archive-strip__storyline')?.textContent).toBe('史线 · 权谋之术')
    expect(container.querySelector('.career-archive-strip__records')?.textContent).toBe('履历 18')
  })

  it('没有存档时不渲染空档案条', () => {
    const { container } = render(<CareerArchiveStrip archive={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('从自动存档取出最近一局的志业与史线，不额外解析其他槽位', () => {
    const character = makeCharacter({ rank: '正七品·知县', careerGoal: 'reputation' })
    const save = makeSaveData({
      character,
      gameState: makeGameState({ currentYear: 1629, currentMonth: 4, 清议: 66 }),
      playerName: '顾承畴',
      lifeRecords: [
        makeLifeRecord({ id: 'r1', year: 1628, month: 4, title: '阉党覆灭' }),
        makeLifeRecord({ id: 'r2', year: 1629, month: 4, title: '己巳之变' })
      ],
      currentStoryline: 'power'
    })
    expect(restoreAutosave(save)).toBe(true)

    const archive = getAutosaveArchive()
    expect(archive?.preview.playerName).toBe('顾承畴')
    expect(archive?.preview.year).toBe(1629)
    expect(archive?.preview.month).toBe(4)
    expect(archive?.careerName).toBe('清名')
    expect(archive?.careerCompleted).toBe(2)
    expect(archive?.storylineName).toBe('权谋之术')
    expect(archive?.lifeRecordCount).toBe(2)

    deleteAutosave()
    expect(getAutosaveArchive()).toBeNull()
  })
})
