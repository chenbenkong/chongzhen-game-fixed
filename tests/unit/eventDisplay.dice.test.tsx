import { StrictMode, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventDisplay from '../../src/components/EventDisplay'
import type { EventChoice, GameEvent } from '../../src/types/event'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * EventDisplay「勉力一试」（投骰）流程的回归用例。
 *
 * 被钉住的两条玩家可见的正确性：
 *   1) 一次投骰只结算一次 —— 连点两次不该让 onChoice 跑两遍
 *      （onChoice 是永久生效的：属性扣减、人生记录都会重复写）
 *   2) 投骰在飞行中时组件消失（卸载 / 切事件），结果不该再落地
 *
 * 为什么用例都打开「减少动态效果」：
 *   组件用 motionDelay() 决定 800ms / 1500ms 的延时。匹配到 reduce 时这些延时归零，
 *   DiceAnimation 的 80ms 数字跳动 interval 也会被跳过（见 DiceAnimation.startShuffling），
 *   于是 advanceTimersByTime 只需推进我们自己关心的那几个定时器，结果完全可判定。
 *   正常的 800/1500 延时链由本文件最后一个用例专门覆盖。
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function installMatchMedia(prefersReduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === REDUCED_MOTION_QUERY ? prefersReduced : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  })
}

/**
 * 构造一个"必定要投骰"的选项：文韬需 ≥ 80，而角色文韬只有 50，
 * 于是 checkChoiceRequirement 返回 available:false + difficulty，
 * 「勉力一试」按钮才会出现（见组件里 canAttemptDice 的条件）。
 */
function makeDiceChoice(id: string, text: string, resultTitle: string): EventChoice {
  return {
    id,
    text,
    description: `${text}的说明`,
    showConditions: { attributes: { 文韬: { min: 80 } } },
    effects: { attributes: { 文韬: 3 } },
    result: { title: resultTitle, tags: ['测试'], echo: '回音文本' }
  }
}

function makeDiceEvent(id: string, choice?: EventChoice): GameEvent {
  return {
    id,
    title: `事件 ${id}`,
    description: '一段用于测试的事件描述。',
    conditions: {},
    type: 'normal',
    choices: [choice ?? makeDiceChoice('c1', '强行上疏', '强行上疏·结果')]
  }
}

/** 与 GameScreen 传给 EventDisplay 的那组 props 对齐 */
function baseProps(event: GameEvent | null) {
  return {
    event,
    character: makeCharacter(),
    gameState: makeGameState(),
    onChoice: () => {},
    onContinue: () => {},
    onUndo: () => {},
    canUndo: false,
    isProcessing: false,
    pendingCount: 0
  }
}

/** 打开骰子弹窗（点「勉力一试」），返回骰子按钮 */
function openDiceModal(choiceText = '强行上疏'): HTMLElement {
  fireEvent.click(screen.getByLabelText(`勉力一试：${choiceText}`))
  return screen.getByLabelText('投掷骰子')
}

/**
 * 让挂起的定时器逐轮落地。
 *
 * 为什么不能只调用一次 vi.runAllTimers()：
 * `rollDice` 是在 **setState 更新函数内部**调度第二级定时器的
 * （`setTimeout(() => setDiceModal(updater))`，而那个 updater 里又 `setTimeout(...)` 去结算）。
 * 在 act 里调 runAllTimers 时，第一级定时器只是**排入**了状态更新，
 * React 要等 act 这一轮结束才会执行 updater —— 也就是说第二级定时器
 * 此时还没被排上，runAllTimers 看到队列为空就返回了，结算永远不会发生。
 *
 * 因此必须「跑一遍定时器 → 让 React flush 更新函数 → 再跑一遍」这样交替若干轮。
 * 早先只跑一轮，导致「连点两次只结算一次」拿到 0 次调用，
 * 而「切事件后旧结果不落地」这类用例则是**空过**（什么都没发生所以断言成立）。
 */
function settleTimers(rounds = 4): void {
  for (let i = 0; i < rounds; i++) {
    act(() => {
      vi.runAllTimers()
    })
  }
}

/** 取按钮的原生 disabled（不依赖 jest-dom 匹配器） */
function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true
}

describe('EventDisplay 勉力一试（投骰）', () => {
  beforeEach(() => {
    // 只替换 matchMedia，不碰 rest：setup.ts 已把 Math.random 钉成 0.5
    // （=> 掷出 3 点，对难度 3 判定为成功，结果可预期）
    installMatchMedia(true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    // 必须还原，否则整份 suite 会被卡在假定时器里
    vi.useRealTimers()
  })

  it('点「勉力一试」会打开骰子弹窗，并显示锁定原因', () => {
    render(<EventDisplay {...baseProps(makeDiceEvent('ev-open'))} />)

    expect(screen.queryByRole('dialog')).toBeNull()

    openDiceModal()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('勉 力 一 试')
    expect(dialog.textContent).toContain('文韬不足')
    // 结算尚未发生
    expect(screen.queryByText('强行上疏·结果')).toBeNull()
  })

  it('连点两次投骰只结算一次 onChoice', () => {
    const onChoice = vi.fn()
    render(<EventDisplay {...baseProps(makeDiceEvent('ev-double'))} onChoice={onChoice} />)

    const diceButton = openDiceModal()

    // 同一 tick 内连点：此时 isRolling 的 state 还没提交，
    // 第二次点击同样进得来（这正是双击能排两次结算的路径）。
    fireEvent.click(diceButton)
    fireEvent.click(diceButton)

    settleTimers()

    expect(onChoice).toHaveBeenCalledTimes(1)
  })

  it('投掷进行中：底部按钮禁用、骰子区标记为投掷中，随后只结算一次', () => {
    const onChoice = vi.fn()
    render(<EventDisplay {...baseProps(makeDiceEvent('ev-two-buttons'))} onChoice={onChoice} />)

    const diceButton = openDiceModal()

    // 底部栏里的那个按钮。
    // 为什么要用 within 限定作用域：骰子区自己的 aria-label 是「投掷骰子」，
    // 飞行中又会变成「投掷中」，按名称查会同时命中两个元素（都含"投掷"二字）。
    const footer = document.querySelector('.dice-modal-footer') as HTMLElement
    expect(footer).toBeTruthy()
    const footerButton = (): HTMLButtonElement =>
      within(footer).getByRole('button') as HTMLButtonElement

    // 投掷前：底部按钮可用，骰子区也未标记为不可用
    expect(footerButton().textContent).toContain('投')
    expect(isDisabled(footerButton())).toBe(false)
    expect(diceButton.getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(diceButton)

    // 飞行中：底部按钮禁用且文案变化，骰子区也标记为不可再触发。
    // 这就是「连点不会排两次结算」的守卫本身 —— 与其去点一个 disabled 的按钮
    // （浏览器根本不会派发 click 事件，测不到任何东西），不如直接断言守卫存在。
    expect(isDisabled(footerButton())).toBe(true)
    expect(footerButton().textContent).toContain('中')
    expect(diceButton.getAttribute('aria-disabled')).toBe('true')

    settleTimers()

    expect(onChoice).toHaveBeenCalledTimes(1)
  })

  it('投骰落地后再点已经结算过的骰子，不会重复结算', () => {
    const onChoice = vi.fn()
    render(<EventDisplay {...baseProps(makeDiceEvent('ev-after'))} onChoice={onChoice} />)

    const diceButton = openDiceModal()
    fireEvent.click(diceButton)
    settleTimers()

    // 结果已经展示，骰子按钮理论上不可再触发；这里直接补一枪做兜底
    fireEvent.click(diceButton)
    settleTimers()

    expect(onChoice).toHaveBeenCalledTimes(1)
  })

  it('投骰在飞行中卸载组件：结果不再落地，也不再碰已卸载的 state', () => {
    const onChoice = vi.fn()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = render(
      <EventDisplay {...baseProps(makeDiceEvent('ev-unmount'))} onChoice={onChoice} />
    )

    const diceButton = openDiceModal()
    fireEvent.click(diceButton)

    unmount()

    // 卸载后推进定时器。若定时器没被清理，800ms 的结算链仍会跑完并调用 onChoice。
    expect(() => settleTimers()).not.toThrow()

    expect(onChoice).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('投骰在飞行中切到下一个事件：旧事件的结果不会落到新事件上', () => {
    const onChoice = vi.fn()

    function Host() {
      const [ev, setEv] = useState(() => makeDiceEvent('ev-first'))
      return (
        <>
          <button onClick={() => setEv(makeDiceEvent('ev-second'))}>切换事件</button>
          <EventDisplay {...baseProps(ev)} onChoice={onChoice} />
        </>
      )
    }

    render(<Host />)

    const diceButton = openDiceModal()
    fireEvent.click(diceButton)

    // 玩家在结算动画期间离开了这个事件（GameScreen 里 currentEvent 换了一个对象）
    fireEvent.click(screen.getByText('切换事件'))

    settleTimers()

    // 旧事件的投骰不得凭空结算到新事件上
    expect(onChoice).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('强行上疏·结果')).toBeNull()
  })

  it('正常动效下，投骰结果不会提前落地（800ms 延时链仍然保留）', () => {
    installMatchMedia(false)

    const onChoice = vi.fn()
    render(<EventDisplay {...baseProps(makeDiceEvent('ev-delay'))} onChoice={onChoice} />)

    const diceButton = openDiceModal()
    fireEvent.click(diceButton)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onChoice).not.toHaveBeenCalled()

    // 越过 800ms + 1500ms 两级延时
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onChoice).toHaveBeenCalledTimes(1)
  })
  it('StrictMode 下投骰只结算一次（更新函数必须是纯的）', () => {
    // React 18 的 StrictMode 会在开发构建下**重复调用 setState 的更新函数**，
    // 目的就是暴露更新函数里的副作用。而 rollDice 恰恰把「排第二级定时器」这件事
    // 写在了 setDiceModal(updater) 的 updater 内部 —— 更新函数被重放一次，
    // 就会多排一个结算定时器，onChoice 被调用两次。
    //
    // onChoice 是永久生效的（属性扣减、人生记录都会写进存档），
    // 重复调用等于把同一个选择的后果应用两遍，所以这不是"仅开发期"的问题，
    // 而是更新函数不纯所导致的真实正确性缺陷。
    const onChoice = vi.fn()
    render(
      <StrictMode>
        <EventDisplay {...baseProps(makeDiceEvent('ev-strict'))} onChoice={onChoice} />
      </StrictMode>
    )

    const diceButton = openDiceModal()
    fireEvent.click(diceButton)
    settleTimers()

    expect(onChoice).toHaveBeenCalledTimes(1)
  })
})
