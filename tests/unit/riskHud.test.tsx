import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import RiskHud from '../../src/components/RiskHud'
import { zeroWarnFlag } from '../../src/data/zeroWarningEvents'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

describe('RiskHud · 主界面常驻危局提示', () => {
  it('八维都安全时不占版面', () => {
    const view = render(<RiskHud character={makeCharacter()} gameState={makeGameState()} />)
    expect(view.container.querySelector('.risk-hud')).toBeNull()
    view.unmount()
  })

  it('只报最危险的 1–2 维，并把数值显示成整数', () => {
    const view = render(
      <RiskHud
        character={makeCharacter({ attributes: { 财帛: 7.6, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 } })}
        gameState={makeGameState({ 士绅: 12, 圣眷: 50 })}
      />
    )
    const hud = view.container.querySelector('.risk-hud')
    expect(hud).not.toBeNull()
    expect(hud?.textContent).toContain('财帛')
    expect(hud?.textContent).toContain('8')
    expect(hud?.textContent).toContain('士绅')
    expect(hud?.textContent).toContain('12')
    expect(hud?.textContent).not.toContain('圣眷')
    expect(hud?.textContent).not.toContain('7.6')
    view.unmount()
  })

  it('归零且已有警告票，写明再归零就收局', () => {
    const view = render(
      <RiskHud
        character={makeCharacter({
          attributes: { 财帛: 0, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 },
          flags: ['地方官任职', zeroWarnFlag('财帛')]
        })}
        gameState={makeGameState()}
      />
    )
    const hud = view.container.querySelector('.risk-hud')
    expect(hud?.classList.contains('is-cliff') || hud?.querySelector('.is-cliff')).toBeTruthy()
    expect(hud?.textContent).toContain('已在崖边')
    expect(hud?.textContent).toContain('再归零就收局')
    view.unmount()
  })

  it('归零但还没警告票，提示尚有警告，不冒充死局', () => {
    const view = render(
      <RiskHud
        character={makeCharacter({
          attributes: { 财帛: 0, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 },
          flags: ['地方官任职']
        })}
        gameState={makeGameState()}
      />
    )
    const hud = view.container.querySelector('.risk-hud')
    expect(hud?.textContent).toContain('归零·尚有警告')
    expect(hud?.textContent).not.toContain('再归零就收局')
    view.unmount()
  })

  it('手机紧凑版保留维度与数值，去掉结局副文案', () => {
    const view = render(
      <RiskHud
        compact
        character={makeCharacter({ attributes: { 财帛: 5, 文韬: 50, 理政: 50, 武略: 50, 体质: 50 } })}
        gameState={makeGameState()}
      />
    )
    const hud = view.container.querySelector('.risk-hud')
    expect(hud?.classList.contains('is-compact')).toBe(true)
    expect(hud?.textContent).toContain('财帛')
    expect(hud?.textContent).toContain('5')
    expect(hud?.textContent).toContain('将尽')
    expect(hud?.textContent).not.toContain('倾家荡产')
    view.unmount()
  })
})
