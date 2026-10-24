import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import StatusBar from '../../src/components/StatusBar'
import { BGMProvider } from '../../src/components/BGMContext'
import { toMingEraYear } from '../../src/utils/endingSystem'
import { makeCharacter, makeGameState } from './helpers/gameEngine'

/**
 * 第五十九轮线上复核时在真浏览器里读到的：读档到 1649-08，顶栏写「崇祯十七年 8月」。
 *
 * 顶栏自己抄了一份年表，只写到崇祯十七年，索引又被 `Math.min(16, …)` 夹住，
 * 于是 1645 年以后**永远**显示崇祯十七年 —— 而那正是这一轮补的中晚年内容所在的年份。
 * 桌上摆着《乞骸骨》，顶栏说现在是崇祯十七年，玩家会以为年份坏了。
 *
 * 现在顶栏与结局屏共用 `toMingEraYear`：1644 十七年、1645 十八年、1650 二十三年，
 * 和史馆传略里读到的「崇祯二十三年」是同一个数。
 */

describe('顶栏年号 · 1644 之后继续数下去', () => {
  it('元年只写「元」，不写「一」', () => {
    expect(toMingEraYear(1628)).toBe('崇祯元年')
    expect(toMingEraYear(1629)).toBe('崇祯二年')
  })

  it('1644 仍是崇祯十七年', () => {
    expect(toMingEraYear(1644)).toBe('崇祯十七年')
  })

  it('1645 以后不再被夹在崇祯十七年上', () => {
    expect(toMingEraYear(1645)).toBe('崇祯十八年')
    expect(toMingEraYear(1649)).toBe('崇祯二十二年')
    expect(toMingEraYear(1650)).toBe('崇祯二十三年')
  })

  it('顶栏渲染的就是这一串字（1649-08 读作崇祯二十二年 8月）', () => {
    for (const [year, label] of [
      [1644, '崇祯十七年'],
      [1649, '崇祯二十二年'],
      [1650, '崇祯二十三年']
    ] as const) {
      const view = render(
        <BGMProvider>
          <StatusBar
            character={makeCharacter({ name: '沈砚秋', age: 52, rank: '正三品·按察使' })}
            gameState={makeGameState({ currentYear: year, currentMonth: 8 })}
          />
        </BGMProvider>
      )
      expect(view.container.querySelector('.year')?.textContent, `${year} 年的顶栏`).toBe(label)
      view.unmount()
    }
    const view = render(
      <BGMProvider>
        <StatusBar
          character={makeCharacter({ name: '沈砚秋', age: 52 })}
          gameState={makeGameState({ currentYear: 1649, currentMonth: 8 })}
        />
      </BGMProvider>
    )
    expect(view.container.querySelector('.month')?.textContent).toBe('8月')
    view.unmount()
  })
})
