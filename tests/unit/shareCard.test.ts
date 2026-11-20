import { describe, expect, it } from 'vitest'
import { buildShareCardModel, planShareCardLayout, wrapCanvasText } from '../../src/utils/shareCard'

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
    expect(model.goalLine).toBe('')
    expect(model.people).toHaveLength(3)
    expect(model.footer).toBe('崇祯十七年 三月　·　青史')
  })

  it('P0.2 有志业时单起一行，不挤掉功过评分', () => {
    const model = buildShareCardModel({
      name: '沈青崖',
      origin: '寒门',
      finalRank: '正三品',
      endingTitle: '南渡续祚',
      evaluation: '守节不降。',
      years: '十七年',
      score: 78,
      date: '崇祯十七年 三月',
      careerGoal: '志业　升迁 · 遂志（3/3）'
    })
    expect(model.scoreLine).toContain('78 / 100')
    expect(model.goalLine).toBe('志业　升迁 · 遂志（3/3）')
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

describe('青史分享卡 · 故人立绘', () => {
  const base = {
    name: '沈青崖',
    origin: '寒门',
    finalRank: '正三品',
    endingTitle: '南渡续祚',
    evaluation: '守节不降。',
    years: '十七年',
    score: 78,
    date: '崇祯十七年 三月'
  }

  it('立绘与名字同序对齐、最多三个', () => {
    const model = buildShareCardModel({
      ...base,
      people: ['孙传庭　督师', '夫人　结发', '卢象升　督师', '袁崇焕　督师'],
      peoplePortraits: ['pa', 'pb', 'pc', 'pd']
    })
    expect(model.people).toEqual(['孙传庭　督师', '夫人　结发', '卢象升　督师'])
    expect(model.peoplePortraits).toEqual(['pa', 'pb', 'pc'])
  })

  it('空名字被过滤时立绘跟着配对走，不错位到别人脸上', () => {
    const model = buildShareCardModel({
      ...base,
      people: ['', '夫人　结发'],
      peoplePortraits: ['pa', 'pb']
    })
    expect(model.people).toEqual(['夫人　结发'])
    expect(model.peoplePortraits).toEqual(['pb'])
  })

  it('不传立绘时回退为 undefined 占位，长度与名字一致', () => {
    const model = buildShareCardModel({ ...base, people: ['孙传庭　督师', '夫人　结发'] })
    expect(model.peoplePortraits).toEqual([undefined, undefined])
  })
})

describe('青史分享卡 · 防重叠排版', () => {
  it('故人块底边不压页脚/印章（n=0..3 × 有无立绘 × 有无志业）', () => {
    for (const peopleCount of [0, 1, 2, 3]) {
      for (const hasPortraits of [false, true]) {
        for (const hasGoal of [false, true]) {
          const l = planShareCardLayout({ hasGoal, peopleCount, hasPortraits })
          expect(l.evalLineLimit).toBeGreaterThanOrEqual(1)
          if (peopleCount === 0) {
            expect(l.evalLineLimit).toBe(hasGoal ? 10 : 12)
            expect(l.portraitSize).toBe(0)
            continue
          }
          const bottom =
            l.bodyStartY + l.evalLineLimit * l.bodyLineHeight + l.peopleGap +
            l.peopleHeaderHeight + peopleCount * l.rowHeight
          expect(bottom, `n=${peopleCount} portraits=${hasPortraits} goal=${hasGoal}`).toBeLessThanOrEqual(l.peopleBottomLimit)
          expect(l.portraitSize > 0).toBe(hasPortraits)
        }
      }
    }
  })

  it('带立绘时行高高于纯文本，且评语行数被收紧让位', () => {
    const withP = planShareCardLayout({ hasGoal: false, peopleCount: 3, hasPortraits: true })
    const textOnly = planShareCardLayout({ hasGoal: false, peopleCount: 3, hasPortraits: false })
    expect(withP.rowHeight).toBeGreaterThan(textOnly.rowHeight)
    expect(withP.evalLineLimit).toBeLessThan(textOnly.evalLineLimit)
  })
})
