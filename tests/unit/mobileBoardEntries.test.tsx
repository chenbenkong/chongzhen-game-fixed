/**
 * 手机牌桌内常驻档案入口（成就 / 局鉴 / 帮助）。
 *
 * 手机横屏没有桌面那套 A / H / S 快捷键（useGameShortcuts 只在 GameScreen 里挂），
 * 此前这三个入口只在标题屏，玩家进了牌桌就得回首页才能看。这里钉住：
 *   1. 操作栏里三个按钮都在，点一下各自触发对应回调一次，并把操作栏收起；
 *   2. 任一档案弹窗开着（overlayOpen）时，选项 FAB 与事件快捷键都被压住，不穿透到下层牌桌；
 *   3. 没传回调就不渲染对应按钮（props 是可选的）。
 *
 * 引擎与重子组件全部 mock：本用例只测 MobileBoard 自己的操作栏 JSX 与门控，
 * 不重复测玩法（useGameEngine 另有专测），也不让事件数据加载 / 定时器掺进来。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

const hoisted = vi.hoisted(() => ({
  currentEvent: null as unknown,
  eventDisplayProps: [] as Array<{ shortcutsEnabled?: boolean }>
}))

vi.mock('../../src/hooks/useGameEngine', () => {
  const noop = () => {}
  // 角色 / 朝堂状态内联构造，绝不 import helpers/gameEngine —— 它静态 import
  // useGameEngine 本身，会在 mock 工厂里形成「工厂→helpers→被 mock 的模块」循环而死锁。
  const character = {
    name: '测试者', courtesyName: '子明', age: 30, rank: '正七品·知县', origin: '寒门',
    attributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 },
    hidden: { 道德值: 50, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 },
    flags: [],
    careerGoal: 'reputation'
  }
  const gameState = {
    currentYear: 1628, currentMonth: 1, turn: 0,
    圣眷: 50, 中官: 50, 清议: 50, 士绅: 50, 民望: 50, 国势: 75
  }
  return {
    useGameEngine: () => ({
      character,
      gameState,
      currentEvent: hoisted.currentEvent,
      pendingEvents: [],
      eventHistory: [],
      currentStoryline: 'power',
      getCurrentStoryline: () => 'power',
      undoHistory: [],
      promotionMessage: null,
      identityType: 'official',
      isGameOver: false,
      canRetryEnding: false,
      retryEndingLocked: false,
      saveNotification: { isOpen: false, message: '', subMessage: '' },
      resignConfirmModal: { isOpen: false, choice: null },
      lifeRecords: [],
      deathEndingState: { show: false },
      biography: '',
      isProcessing: false,
      awaitingEventData: false,
      isSaveSlotsOpen: false,
      saveSlotsMode: 'save',
      isLifeReviewOpen: false,
      closeSaveSlots: noop,
      closeLifeReview: noop,
      closeDeathEnding: noop,
      closeSaveNotification: noop,
      handleChoice: noop,
      handleNextMonth: noop,
      handleContinue: noop,
      handleUndo: noop,
      handleSave: noop,
      handleSaveToSlot: noop,
      handleLoadFromSlot: noop,
      handleLoadAutosave: noop,
      handleRestart: noop,
      handleRetryEnding: noop,
      handleReturnToMenu: noop,
      handleGameOver: noop,
      handleDeathEnding: noop,
      confirmResign: noop,
      cancelResign: noop,
      openLifeReview: noop,
      generateLifeSummary: () => ''
    })
  }
})

vi.mock('../../src/components/BGM', () => ({ BGMInlineButton: () => null }))
vi.mock('../../src/components/RiskHud', () => ({ default: () => null }))
vi.mock('../../src/components/EventDisplay', () => ({
  default: (props: { shortcutsEnabled?: boolean }) => {
    hoisted.eventDisplayProps.push(props)
    return null
  }
}))
// 这些弹窗 / 面板在本用例里全是关闭态（引擎 stub 给的 isOpen=false），
// mock 掉只为把 MobileBoard 自己的操作栏 JSX 隔离出来，不让它们的重模块图掺进变换。
vi.mock('../../src/components/GameOverScreen', () => ({ default: () => null }))
vi.mock('../../src/components/LifeReview', () => ({ default: () => null }))
vi.mock('../../src/components/DeathEnding', () => ({ default: () => null }))
vi.mock('../../src/components/SaveNotification', () => ({ default: () => null }))
vi.mock('../../src/components/SaveSlotsModal', () => ({ default: () => null }))
vi.mock('../../src/components/ResignConfirmDialog', () => ({ default: () => null }))
vi.mock('../../src/components/AttributePanel', () => ({ default: () => null }))
vi.mock('../../src/components/StatusPanel', () => ({ default: () => null }))

import MobileBoard from '../../src/mobile/MobileBoard'
import type { ComponentProps } from 'react'

const baseProps: ComponentProps<typeof MobileBoard> = {
  origin: '寒门',
  degree: '进士',
  bonusAttributes: { 财帛: 50, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 },
  difficulty: 'normal'
}

function openActionbar() {
  fireEvent.click(screen.getByRole('button', { name: '展开操作栏' }))
}

beforeEach(() => {
  hoisted.currentEvent = null
  hoisted.eventDisplayProps.length = 0
})

describe('手机牌桌操作栏 · 成就 / 局鉴 / 帮助入口', () => {
  it('抬头一行显示本局志业进度与当前史线', () => {
    const { container } = render(<MobileBoard {...baseProps} />)
    const route = container.querySelector('.mobile-hud__route')
    expect(route?.textContent?.replace(/\s+/g, ' ').trim()).toContain('志业 · 清名 1/3')
    expect(route?.textContent).toContain('史线 · 权谋之术')
    const pips = container.querySelectorAll('.mobile-hud__career-pip')
    expect(pips.length).toBe(3)
    expect(pips[0].classList.contains('is-done')).toBe(true)
    expect(pips[1].classList.contains('is-done')).toBe(false)
  })

  it('三个按钮都在，点击各触发对应回调一次并收起操作栏', () => {
    const onOpenAchievements = vi.fn()
    const onOpenCodex = vi.fn()
    const onOpenTutorial = vi.fn()
    render(
      <MobileBoard
        {...baseProps}
        onOpenAchievements={onOpenAchievements}
        onOpenCodex={onOpenCodex}
        onOpenTutorial={onOpenTutorial}
      />
    )

    openActionbar()
    expect(screen.getByRole('button', { name: '成就' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '局鉴' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '帮助' })).toBeTruthy()
    // 原有按钮不能被挤掉（首页按钮的无障碍名是 aria-label「返回首页」）
    expect(screen.getByRole('button', { name: '返回首页' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '存档' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '成就' }))
    expect(onOpenAchievements).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '成就' })).toBeNull()

    openActionbar()
    fireEvent.click(screen.getByRole('button', { name: '局鉴' }))
    expect(onOpenCodex).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '局鉴' })).toBeNull()

    openActionbar()
    fireEvent.click(screen.getByRole('button', { name: '帮助' }))
    expect(onOpenTutorial).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '帮助' })).toBeNull()
  })

  it('没传回调就不渲染对应按钮', () => {
    render(<MobileBoard {...baseProps} />)
    openActionbar()
    expect(screen.queryByRole('button', { name: '成就' })).toBeNull()
    expect(screen.queryByRole('button', { name: '局鉴' })).toBeNull()
    expect(screen.queryByRole('button', { name: '帮助' })).toBeNull()
  })
})

describe('手机牌桌 · 档案弹窗开着时压住下层交互', () => {
  const event = { id: 'evt_test', choices: [{ id: 'c1' }] }

  it('overlayOpen=false 时选项 FAB 出现、事件快捷键启用', () => {
    hoisted.currentEvent = event
    render(<MobileBoard {...baseProps} overlayOpen={false} />)
    expect(screen.getByRole('button', { name: /打开选项/ })).toBeTruthy()
    expect(hoisted.eventDisplayProps[hoisted.eventDisplayProps.length - 1]?.shortcutsEnabled).toBe(true)
  })

  it('overlayOpen=true 时选项 FAB 消失、事件快捷键禁用', () => {
    hoisted.currentEvent = event
    const { rerender } = render(<MobileBoard {...baseProps} overlayOpen={false} />)
    expect(screen.getByRole('button', { name: /打开选项/ })).toBeTruthy()

    rerender(<MobileBoard {...baseProps} overlayOpen />)
    expect(screen.queryByRole('button', { name: /打开选项/ })).toBeNull()
    expect(hoisted.eventDisplayProps[hoisted.eventDisplayProps.length - 1]?.shortcutsEnabled).toBe(false)
  })
})