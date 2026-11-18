import { describe, expect, it } from 'vitest'
import { buildShareCardModel, wrapCanvasText } from '../../src/utils/shareCard'

describe('青史分享卡', () => {
  it('把姓名、字、出身、官至、结局、评语装进固定字段', () => {
    const model = buildShareCardModel({
      name: '沈青崖',
      courtesyName: '子瞻',
      origin: '寒门',
      finalRank: '正三品',
      endingTitle: '南渡续祚',
      evaluation: '守节不降，终老江南。',
      years: '十七年又三个月',
      score: 78,
      date: '崇祯十七年 三月',
      people: ['孙传庭　督师', '夫人　结发', '卢象升　督师', '袁崇焕　督师']
    })
    expect(model.nameLine).toBe('沈青崖　字子瞻')
    expect(model.metaLine).toBe('寒门　·　正三品')
    expect(model.endingLine).toBe('南渡续祚')
    expect(model.scoreLine).toContain('78 / 100')
    expect(model.scoreLine).toContain('十七年又三个月')
    expect(model.people).toHaveLength(3)
    expect(model.footer).toBe('崇祯十七年 三月　·　青史')
  })

  it('没有字时不硬写“字”', () => {
    const model = buildShareCardModel({
      name: '沈青崖',
      origin: '寒门',
      finalRank: '正三品',
      endingTitle: '归园田居',
      evaluation: '归去来兮。',
      years: '九年',
      score: 60,
      date: '崇祯十七年 三月'
    })
    expect(model.nameLine).toBe('沈青崖')
    expect(model.people).toEqual([])
  })

  it('按测量宽度拆行，不把整段评语塞成一行', () => {
    const measure = (value: string) => value.length * 10
    const lines = wrapCanvasText('守节不降，终老江南。', 30, measure)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('守节不降，终老江南。')
  })
})
