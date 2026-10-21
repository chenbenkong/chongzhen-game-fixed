import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import RoutePanel from '../../src/components/RoutePanel'
import { makeCharacter, makeGameState } from './helpers/gameEngine'
import { zeroWarnFlag } from '../../src/data/zeroWarningEvents'
import type { Attributes } from '../../src/types/game'

describe('RoutePanel', () => {
  it('显示命途名称、落点与已记门票', () => {
    render(
      <RoutePanel
        character={makeCharacter({ flags: ['随军出征', '固守潼关'] })}
        gameState={makeGameState({ currentYear: 1640, turn: 60 })}
      />
    )
    expect(screen.getByRole('heading', { name: '命 途' })).toBeTruthy()
    expect(screen.getByText('边关武途')).toBeTruthy()
    expect(screen.getByText('已记 2 笔')).toBeTruthy()
    expect(screen.getByText('《战死沙场》')).toBeTruthy()
    expect(screen.getByText('《边关大将》')).toBeTruthy()
    expect(screen.getByText('随军出征')).toBeTruthy()
    expect(screen.getByText('固守潼关')).toBeTruthy()
  })

  it('开局没有门票时不虚构落点', () => {
    render(
      <RoutePanel
        character={makeCharacter()}
        gameState={makeGameState()}
      />
    )
    expect(screen.getByText(/尚无定数/)).toBeTruthy()
    expect(screen.queryByText('边关武途')).toBeNull()
  })

  it('危局把数值与具体死局放在一起', () => {
    render(
      <RoutePanel
        character={makeCharacter({
          flags: [zeroWarnFlag('财帛')],
          attributes: { 财帛: 0, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 } as Attributes
        })}
        gameState={makeGameState({ turn: 20 })}
      />
    )
    expect(screen.getByText('危 局')).toBeTruthy()
    expect(screen.getByText('财帛')).toBeTruthy()
    expect(screen.getByText('已在崖边')).toBeTruthy()
    expect(screen.getByText('→《倾家荡产》')).toBeTruthy()
    expect(screen.getByText('《倾家荡产》')).toBeTruthy()
  })

  it('落点第二行把重复的互斥经历写清楚', () => {
    render(
      <RoutePanel
        character={makeCharacter({ flags: ['随军出征', '出家'] })}
        gameState={makeGameState({ currentYear: 1640, turn: 60 })}
      />
    )
    expect(screen.getAllByText('经历相冲').length).toBeGreaterThan(0)
    expect(screen.getByText('相冲：出家；还缺：武略 50/70')).toBeTruthy()
  })

  it('玩家自己搁了笔，第二行直说是他辞的', () => {
    render(
      <RoutePanel
        character={makeCharacter({
          flags: ['归隐', '搁笔·归隐田园'],
          hidden: { 道德值: 80, 欲望值: 50, 野心值: 50, 机敏值: 50, 忠诚值: 50 }
        })}
        gameState={makeGameState({ currentYear: 1640, turn: 60, 清议: 60, 圣眷: 40 })}
      />
    )
    expect(screen.getByText('已搁笔')).toBeTruthy()
    expect(screen.getByText('已搁笔：归隐田园')).toBeTruthy()
  })

  it('此刻史笔与路线落点同时出现时，不再写"尚无定局"', () => {
    render(
      <RoutePanel
        character={makeCharacter({ flags: ['与世无争'] })}
        gameState={makeGameState({ currentYear: 1636, turn: 60 })}
      />
    )
    expect(screen.queryByText('尚无定局')).toBeNull()
    expect(screen.getAllByText('《平凡终老》').length).toBeGreaterThan(0)
  })
})
