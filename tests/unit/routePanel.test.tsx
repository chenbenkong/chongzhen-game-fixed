import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RoutePanel from '../../src/components/RoutePanel'
import { ROUTE_FAMILIES, buildRouteTrail } from '../../src/utils/routeTrail'
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

  /**
   * 全量可见性（第五十一轮）。
   *
   * 从前面板只渲染"已经沾了边"的那几途、每途前两格，一票没有的命途连返回值都没有 ——
   * 玩家既看不见自己还有哪些路可走，也看不见下一拍该往哪迈步。
   * 下面钉的是：十三途二十六个落点**全都**在面板上数得出来，且折叠态不因此变得吵。
   */
  describe('全量可见（十三途 / 二十六落点）', () => {
    const allTickets = [
      ...new Set(ROUTE_FAMILIES.flatMap(f => f.destinations.flatMap(d => d.tickets)))
    ]

    it('开局仍是那句"尚无定数"，但明说另有 13 途尚未起步', () => {
      render(
        <RoutePanel
          character={makeCharacter()}
          gameState={makeGameState({ currentYear: 1628, turn: 0 })}
        />
      )
      expect(screen.getByText(/尚无定数/)).toBeTruthy()
      expect(screen.getByText('另有 13 途尚未起步')).toBeTruthy()
      expect(screen.getByRole('button', { name: /展开全部 13 途/ })).toBeTruthy()
    })

    it('展开之后十三途全部排得出来', () => {
      render(
        <RoutePanel
          character={makeCharacter({ flags: ['随军出征'] })}
          gameState={makeGameState({ currentYear: 1640, turn: 60 })}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /展开全部 13 途/ }))
      for (const family of ROUTE_FAMILIES) {
        expect(screen.getAllByText(family.name).length, `${family.name} 没有出现在面板上`).toBeGreaterThan(0)
      }
      expect(screen.getByText(/尚未起步 · 12 途/)).toBeTruthy()
    })

    it('集齐全部门票时，二十六个落点一个都不少', () => {
      const { container } = render(
        <RoutePanel
          character={makeCharacter({ flags: allTickets })}
          gameState={makeGameState({ currentYear: 1643, turn: 180 })}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /展开全部/ }))
      expect(container.querySelectorAll('.route-dest')).toHaveLength(26)
      expect(screen.getByText(/在册 13\/13 途 · 落点 26\/26 格/)).toBeTruthy()
    })

    it('每一途写着第几拍，下一拍只报看得见的经历票', () => {
      render(
        <RoutePanel
          character={makeCharacter({ flags: ['随军出征', '掌军权'] })}
          gameState={makeGameState({ currentYear: 1640, turn: 60 })}
        />
      )
      // 边关武途两拍都沾过；问鼎之途只有第一张票，面板得说清下一拍缺哪两张
      fireEvent.click(screen.getByRole('button', { name: /展开全部/ }))
      expect(screen.getByText('第 2/2 拍')).toBeTruthy()
      expect(screen.getByText(/《篡位自立》还缺 拥兵自重 \/ 问鼎之约/)).toBeTruthy()
    })

    it('面板把全部命途摊开时也不许露出机器 id', () => {
      const { container } = render(
        <RoutePanel
          character={makeCharacter({ flags: ['随军出征', '归隐', '东林党人'] })}
          gameState={makeGameState({ currentYear: 1640, turn: 60 })}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /展开全部/ }))
      expect(container.textContent).not.toMatch(/[a-z][a-z0-9]*_[a-z0-9_]+/)
    })

    it('routes + dormant 恒等于十三途，落点恒等于二十六格', () => {
      const trail = buildRouteTrail(
        makeCharacter({ flags: ['随军出征', '归隐'] }),
        makeGameState({ currentYear: 1640, turn: 60 })
      )
      const totalDests = ROUTE_FAMILIES.reduce((n, f) => n + f.destinations.length, 0)
      expect(trail.routes.length + trail.dormant.length).toBe(ROUTE_FAMILIES.length)
      // 二十六格要一格不落地**在册**：已起步的按 beatsTotal 记账，未起步的同款字段
      const booked =
        trail.routes.reduce((n, r) => n + r.beatsTotal, 0) +
        trail.dormant.reduce((n, d) => n + d.beatsTotal, 0)
      expect(totalDests).toBe(26)
      expect(booked).toBe(totalDests)
      const shown = trail.routes.reduce((n, r) => n + r.destinations.length, 0)
      expect(shown).toBeLessThanOrEqual(booked)
      for (const route of trail.routes) {
        expect(route.beatsDone).toBe(route.destinations.length)
        expect(route.beatsTotal).toBeGreaterThanOrEqual(route.beatsDone)
      }
    })

    it('每一途至少有一格，"下一拍"才可能永远填得满', () => {
      // 面板上每一途都要写出起步那一格；某途 destinations 为空时那句会变成空白
      for (const family of ROUTE_FAMILIES) {
        expect(family.destinations.length, `${family.name} 一个落点都没有`).toBeGreaterThan(0)
      }
      const trail = buildRouteTrail(makeCharacter(), makeGameState({ currentYear: 1628, turn: 0 }))
      for (const dormant of trail.dormant) {
        const titles = ROUTE_FAMILIES.find(f => f.key === dormant.key)!.destinations.map(d => d.title)
        expect(titles, `${dormant.name} 的下一拍不是这一途的落点`).toContain(dormant.nextBeat.title)
        expect(dormant.nextBeat.missing.length).toBeGreaterThan(0)
      }
    })
  })
})
