import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import EventDisplay from '../../src/components/EventDisplay'
import { useGameEngine } from '../../src/hooks/useGameEngine'
import { initialEvents } from '../../src/data/events'
import { makeCharacter, makeGameState, makeProps, makeSaveData } from './helpers/gameEngine'
import type { SaveData } from '../../src/types/save'

/**
 * 读档首帧不许被「无事件自动继续」推进一个月。
 *
 * 真实缺陷：点「继续游戏」后，引擎的读档在 useEffect 里恢复 currentEvent，
 * 而 Effect 的执行顺序是**子组件先、父组件后** —— EventDisplay 的
 * 「event 为空就自动 onContinue」先跑，handleNextMonth 排下的 300ms 定时器
 * 随后把刚恢复的事件换成下个月的事件，并把新一批 id 写进 eventHistory。
 * 实测（1440×900 生产包）：100ms 时标题还是「己巳之变」，400ms 已变成
 * 「崇祯帝临朝」，自动存档里的 currentEvent 也随之被覆盖。
 *
 * 纯 hook 测试复现不了（没有 EventDisplay 这条自动继续），所以这里按
 * GameScreen 的方式把两者挂在同一次 commit 里。
 */

let engine: ReturnType<typeof useGameEngine>

function Harness({ save }: { save: SaveData }) {
  engine = useGameEngine(makeProps({ loadSaveData: save }))
  return (
    <EventDisplay
      event={engine.currentEvent}
      character={engine.character}
      gameState={engine.gameState}
      onChoice={engine.handleChoice}
      onContinue={engine.handleContinue}
      isProcessing={engine.isProcessing}
      pendingCount={engine.pendingEvents.length}
    />
  )
}

describe('读档首帧与「无事件自动继续」的先后顺序', () => {
  it('继续游戏 500ms 后仍停在存档事件，回合与历史都没有被推进', async () => {
    const event = initialEvents.find(e => e.id === 'historical_003')!
    const save = makeSaveData({
      character: makeCharacter({ flags: ['地方官任职', '东林党人'] }),
      gameState: makeGameState({ currentYear: 1629, turn: 20 }),
      currentEvent: event,
      currentEventId: event.id,
      eventHistory: []
    })

    render(<Harness save={save} />)
    // 自动继续落在 handleNextMonth 的 300ms 定时器里，窗口必须长于它
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 500))
    })

    expect(screen.getByText('己巳之变')).toBeTruthy()
    expect(engine.currentEvent?.id).toBe('historical_003')
    expect(engine.gameState.turn, '读档不是推进：回合数必须还是存档里的 20').toBe(20)
    expect(engine.eventHistory, '不该凭空写入下月事件 id').toEqual([])
  })
})
