import { describe, expect, it } from 'vitest'
import { wifeEvents } from '../../src/data/events/emotion/wife'
import { origins } from '../../src/data/origins'

/**
 * 第七十六轮冒烟顺手逮到：《竹马青梅》在正文里给「你」写死了两道互相打架的年数 ——
 * 「她等了你整整十年——从你八岁启蒙到你二十八岁高中」：八岁到二十八岁是二十年，
 * 而进士开局 22 岁（顶栏「年方22岁」就是玩家看得见的那个数），事件年窗又一直开到 1635，
 * 角色年龄还会随月份往上走。正文里的年数必须与顶栏相容：只写「许多年」，不报具体岁数/年数。
 */
describe('《竹马青梅》的等待年数必须与顶栏年龄相容', () => {
  const wife = wifeEvents.find(e => e.id === 'emotion_wife_005')!
  const texts = [
    wife.narrative?.background ?? '',
    wife.narrative?.situation ?? '',
    ...wife.choices.map(c => c.result?.echo ?? '')
  ].join('\n')

  it('进士开局 22 岁，正文不能写死「二十八岁高中」', () => {
    expect(origins['寒门'].initialDegree).toBe('进士')
    expect(texts).not.toContain('二十八岁')
  })

  it('三种「十年」写法都清掉：八岁到二十二岁是十四年，年窗里还会涨到二十九', () => {
    expect(texts).not.toContain('整整十年')
    expect(texts).not.toContain('十年的等待')
    expect(texts).not.toContain('我等了你十年')
  })
})
