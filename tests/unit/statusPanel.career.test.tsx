import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusPanel from '../../src/components/StatusPanel'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

describe('P0.2 状态面板志业', () => {
  it('在态度页列出三个里程碑与当前完成数，不用小数', () => {
    const { container } = render(
      <StatusPanel
        gameState={makeGameState({ 清议: 66 })}
        character={makeCharacter({ careerGoal: 'reputation' })}
      />
    )

    expect(screen.getByText('志业 · 清名')).not.toBeNull()
    expect(screen.getByText('近志 2/3')).not.toBeNull()
    const labels = Array.from(container.querySelectorAll('.career-panel-label')).map((node) => node.textContent)
    expect(labels).toEqual(['清誉', '清流', '东林'])
  })

  it('不立志业时不渲染志业块', () => {
    const { container } = render(
      <StatusPanel gameState={makeGameState()} character={makeCharacter()} />
    )
    expect(container.querySelector('.career-panel')).toBeNull()
  })
})
