import { render, fireEvent, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { origins } from '../../src/data/origins'
import { AUTOSAVE_KEY, saveAutosave, type SaveData } from '../../src/types/save'

// App 的「读档 → 重新开始」链路：读档只把 SaveData 交给 App，真正决定
// 下一局身份的是 App 保存的 setup 状态（姓名 / 出身 / 起始属性）。
// 这里把 GameScreen 换成一个只记录 props 的桩，就能在不启动引擎的情况下
// 钉住「App 交给引擎的那份重新开局档案到底是谁」。

vi.mock('../../src/components/GameScreen', () => ({
  default: (props: Record<string, unknown>) => {
    ;(globalThis as Record<string, unknown>).__lastGameScreenProps = props
    return null
  }
}))

vi.mock('../../src/components/NameInput', () => ({
  default: ({ onConfirm }: { onConfirm: (r: unknown) => void }) => (
    <button
      onClick={() => onConfirm({ name: '张三', courtesyName: '', hometown: '', age: null })}
    >
      name-ok
    </button>
  )
}))

vi.mock('../../src/components/OriginSelect', () => ({
  default: ({ onSelect }: { onSelect: (o: string) => void }) => (
    <button onClick={() => onSelect('寒门')}>origin-ok</button>
  )
}))

vi.mock('../../src/components/BGMContext', () => ({
  BGMProvider: ({ children }: { children: unknown }) => children,
  useBGM: () => ({ on: false, toggle: () => {}, status: 'idle', errorMessage: '' })
}))

function lastGameScreenProps(): Record<string, any> {
  return (globalThis as Record<string, any>).__lastGameScreenProps
}

function makeSave(overrides: Partial<SaveData> = {}): SaveData {
  return {
    character: {
      name: '沈砚',
      courtesyName: '石舟',
      hometown: '大同',
      age: 45,
      origin: '军户',
      rank: '正七品·知县',
      degree: '进士',
      attributes: { 财帛: 40, 文韬: 40, 理政: 40, 武略: 40, 体质: 40 },
      hidden: { 道德值: 50, 欲望值: 50, 野心值: 50 },
      flags: ['地方官任职'],
      flagTurns: {},
      history: [],
      wives: [],
      lovers: [],
      examHistory: [],
      promotionCount: 0,
      demotionCount: 0
    } as any,
    gameState: {
      currentYear: 1630,
      currentMonth: 3,
      turn: 24,
      圣眷: 50,
      中官: 50,
      清议: 50,
      士绅: 50,
      民望: 50,
      国势: 60
    },
    eventHistory: [],
    currentEvent: null,
    currentEventId: null,
    pendingEvents: [],
    origin: '军户',
    degree: '进士',
    playerName: '沈砚',
    identityType: 'official',
    lifeRecords: [],
    savedAt: '2026-01-01T00:00:00.000Z',
    playTime: 1200,
    achievements: { unlocked: [], unlockTimes: {} },
    difficulty: 'normal',
    meritBonus: 0,
    ...overrides
  }
}

describe('第七十三轮：App 的读档 → 重新开局档案', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, any>).__lastGameScreenProps
  })

  it('从标题读档后，交给引擎的起始属性是存档出身的初始属性，不是全零', () => {
    render(<App />)

    act(() => {
      window.dispatchEvent(new CustomEvent('loadSave', { detail: makeSave() }))
    })

    const props = lastGameScreenProps()
    expect(props).toBeTruthy()
    // 没有这句，重新开局的角色是「财帛 0 / 文韬 0 / 理政 0 / 武略 0」
    expect(props.bonusAttributes).toEqual(origins['军户'].initialAttributes)
    expect(props.playerName).toBe('沈砚')
    expect(props.playerCustomAge).toBe(45)
  })

  it('先开过一局再读另一份存档，重新开局档案要换成存档里的身份', () => {
    render(<App />)

    fireEvent.click(document.querySelector('.title-btn') as HTMLButtonElement) // 开始仕途
    fireEvent.click(document.querySelector('button') as HTMLButtonElement) // 桩：起名确认
    fireEvent.click(document.querySelector('button') as HTMLButtonElement) // 桩：选出身
    expect(lastGameScreenProps()?.playerName).toBe('张三')

    act(() => {
      window.dispatchEvent(new CustomEvent('loadSave', { detail: makeSave() }))
    })

    const props = lastGameScreenProps()
    // 读档后重开，必须还是「沈砚 / 军户」，不能沿用上一局的「张三 / 寒门」
    expect(props?.playerName).toBe('沈砚')
    expect(props?.bonusAttributes).toEqual(origins['军户'].initialAttributes)
  })

  it('点「开始仕途」不能立刻删掉自动存档，选完出身才删', () => {
    saveAutosave(makeSave())
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull()

    render(<App />)
    fireEvent.click(document.querySelector('.title-btn') as HTMLButtonElement) // 开始仕途

    // 此时玩家还在起名屏，随时可以点「返回」回标题 —— 旧进度必须还能继续
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull()

    fireEvent.click(document.querySelector('button') as HTMLButtonElement) // 桩：起名确认
    fireEvent.click(document.querySelector('button') as HTMLButtonElement) // 桩：选出身

    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull()
  })
})
