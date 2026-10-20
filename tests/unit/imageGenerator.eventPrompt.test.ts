import { describe, expect, it } from 'vitest'
import { generateEventPrompt } from '../../src/services/eventPromptGenerator'

/**
 * 「当前事件」模板曾经只读 event.description —— 而它往往只是一句摘要
 *（例如「新朝气象，机遇与风险并存。」），真正的人名与情节写在 narrative.background。
 * 于是玩家点「当前事件」，得到的是与屏幕正文无关的通用朝堂画面（2026-10-20 报）。
 *
 * 这里钉住三件事：正文优先、标题一定进 prompt、随机模板不能把事件信息丢掉。
 */

const base = {
  playerName: '欧阳明',
  rank: '正七品·知县',
  degree: '进士',
  age: 30,
  origin: '缙绅',
  hometown: '苏州府',
  year: 1628,
  month: 2,
}

describe('丹青 · 当前事件提示词', () => {
  it('用事件正文：标题与正文里的具体人事都进 prompt（30 次随机模板都成立）', () => {
    const input = {
      ...base,
      currentEventTitle: '新朝气象',
      currentEventDescription: '新朝气象，机遇与风险并存。',
      currentEventBackground:
        '崇祯元年二月，新君登基已逾月，朝政渐趋稳定。\n魏忠贤已被罢职，发往凤阳守陵，但其党羽"五虎五彪"仍遍布朝野。皇上开始谋划清洗阉党，朝野震动。与此同时，皇上也在物色贤能，充实内阁。',
    }
    for (let i = 0; i < 30; i++) {
      const { prompt, sceneName } = generateEventPrompt(input)
      expect(prompt, `第 ${i + 1} 次：${prompt}`).toContain('新朝气象')
      expect(prompt, `第 ${i + 1} 次：${prompt}`).toContain('魏忠贤')
      expect(prompt.match(/新朝气象/g), `标题重复：${prompt}`).toHaveLength(1)
      expect(sceneName, `第 ${i + 1} 次场景为空`).not.toBe('')
    }
  })

  it('家事事件不再被判成「战场边关」（一个「充军」里的『军』不足以定性）', () => {
    const input = {
      ...base,
      currentEventTitle: '族中求托',
      currentEventDescription: '族叔登门，请你为堂兄说情。',
      currentEventBackground:
        '你的三堂兄陈伯年在邻县做粮长，被控私吞税粮、中饱私囊。知府正在查办此案，若坐实，轻则革职充军，重则抄家灭族。族叔陈伯庸亲自登门，要你利用官场关系为堂兄说情。',
    }
    for (let i = 0; i < 20; i++) {
      const { prompt, sceneName } = generateEventPrompt(input)
      expect(sceneName, `第 ${i + 1} 次误判：${prompt}`).toBe('宅邸家事')
      expect(prompt).toContain('事件「族中求托」')
      expect(prompt).toContain('陈伯年')
    }
  })

  it('没有正文时退回 description，事件标题仍不丢', () => {
    const { prompt } = generateEventPrompt({
      ...base,
      currentEventTitle: '微服私访',
      currentEventDescription: '你决定到街巷里看看。',
    })
    expect(prompt).toContain('事件「微服私访」')
    expect(prompt).toContain('你决定到街巷里看看')
  })

  it('正文优先于 description，不用旧摘要顶替', () => {
    const { prompt } = generateEventPrompt({
      ...base,
      currentEventTitle: '夜谈',
      currentEventDescription: '这是一句旧摘要。',
      currentEventBackground: '密室里，徐阶压低声音说出了关键人名：严世蕃。',
    })
    expect(prompt).toContain('严世蕃')
    expect(prompt).not.toContain('旧摘要')
  })
})
