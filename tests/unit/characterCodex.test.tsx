import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import EndingCodex from '../../src/components/EndingCodex'
import { characterCodexEntries, RECURRING_CHARACTERS } from '../../src/data/characters'
import { characterPortrait } from '../../src/data/characterPortraits'
import { restoreAutosave } from '../../src/types/save'
import { makeCharacter, makeSaveData } from './helpers/gameEngine'

const FLAGS = ['崇祯赏识', '崇祯近臣', '孙传庭故交']

function seedAutosave(flags: string[]) {
  restoreAutosave(makeSaveData({ character: makeCharacter({ flags }) }))
}

describe('人物图鉴 · 纯排序', () => {
  it('已遇按票数在前、未遇按注册表序补齐，共 12 人', () => {
    const entries = characterCodexEntries(FLAGS)
    expect(entries).toHaveLength(RECURRING_CHARACTERS.length)
    expect(entries.slice(0, 2).map((e) => [e.character.id, e.met, e.matchedFlags.length])).toEqual([
      ['chongzhen', true, 2],
      ['sunchuanting', true, 1]
    ])
    const unmet = entries.slice(2)
    expect(unmet.every((e) => !e.met && e.matchedFlags.length === 0)).toBe(true)
    expect(unmet.map((e) => e.character.id)).toEqual(
      RECURRING_CHARACTERS.filter((c) => c.id !== 'chongzhen' && c.id !== 'sunchuanting').map((c) => c.id)
    )
  })

  it('同一张票只算一次；没写过的票不硬凑', () => {
    const entries = characterCodexEntries(['崇祯赏识', '崇祯赏识', '不存在的票'])
    expect(entries[0].character.id).toBe('chongzhen')
    expect(entries[0].matchedFlags).toEqual(['崇祯赏识'])
    expect(entries.filter((e) => e.met)).toHaveLength(1)
  })

  it('空 flags / undefined 时全员未遇且保持注册表序', () => {
    for (const flags of [[], undefined]) {
      const entries = characterCodexEntries(flags)
      expect(entries).toHaveLength(12)
      expect(entries.every((e) => !e.met)).toBe(true)
      expect(entries.map((e) => e.character.id)).toEqual(RECURRING_CHARACTERS.map((c) => c.id))
    }
  })
})

describe('人物图鉴 · 局鉴人物卷', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('默认仍是结局卷，人物 tab 带 met/12 计数', () => {
    seedAutosave(FLAGS)
    render(<EndingCodex isOpen onClose={() => {}} />)
    const container = document.body
    expect(container.querySelector('.codex-title')?.textContent).toBe('结 局 图 鉴')
    const tab = container.querySelector('.codex-tab--characters')
    expect(tab?.querySelector('.codex-tab-count')?.textContent).toBe('2/12')
    expect(container.querySelector('.codex-character-grid')).toBeNull()
  })

  it('切到人物卷：12 卡、已遇票数印+交集话、未遇灰印、立绘与 id 对应', () => {
    seedAutosave(FLAGS)
    render(<EndingCodex isOpen onClose={() => {}} />)
    const container = document.body
    fireEvent.click(container.querySelector('.codex-tab--characters')!)
    expect(container.querySelector('.codex-title')?.textContent).toBe('人 物 图 鉴')
    expect(container.querySelector('.codex-progress-cur')?.textContent).toBe('2')
    expect(container.querySelector('.codex-progress-total')?.textContent).toBe('12')
    expect(container.querySelector('.codex-progress-label')?.textContent).toBe('已遇 17%')

    const cards = [...container.querySelectorAll('.codex-character-card')]
    expect(cards).toHaveLength(12)
    const first = cards[0] as HTMLElement
    expect(first.dataset.characterId).toBe('chongzhen')
    expect(first.classList.contains('met')).toBe(true)
    expect(first.querySelector('.codex-character-seal')?.textContent).toBe('交集 2 票')
    expect(first.querySelector('.codex-character-line')?.textContent).toBe(
      RECURRING_CHARACTERS.find((c) => c.id === 'chongzhen')!.endingLine
    )
    expect((first.querySelector('.codex-character-portrait') as HTMLElement).style.backgroundImage).toContain(
      characterPortrait('chongzhen')
    )

    const locked = cards.find((c) => (c as HTMLElement).dataset.characterId === 'furen') as HTMLElement
    expect(locked.classList.contains('locked')).toBe(true)
    expect(locked.querySelector('.codex-character-seal')?.textContent).toBe('未 遇')
    expect(locked.querySelector('.codex-character-line')).toBeNull()
  })

  it('没有自动存档时全员未遇、进度 0/12，切回结局卷标题复原', () => {
    render(<EndingCodex isOpen onClose={() => {}} />)
    const container = document.body
    fireEvent.click(container.querySelector('.codex-tab--characters')!)
    expect(container.querySelector('.codex-progress-cur')?.textContent).toBe('0')
    expect(container.querySelector('.codex-progress-total')?.textContent).toBe('12')
    expect(container.querySelectorAll('.codex-character-card.locked')).toHaveLength(12)
    expect(container.querySelectorAll('.codex-character-card.met')).toHaveLength(0)

    fireEvent.click(container.querySelector('.codex-tab:not(.codex-tab--characters)')!)
    expect(container.querySelector('.codex-title')?.textContent).toBe('结 局 图 鉴')
    expect(container.querySelector('.codex-character-grid')).toBeNull()
    expect(container.querySelectorAll('.codex-card').length).toBeGreaterThan(0)
  })
})