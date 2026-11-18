import { describe, expect, it } from 'vitest'
import {
  RECURRING_CHARACTERS,
  RECURRING_CHARACTER_COUNT,
  relationshipEpilogue,
  relationshipsOf
} from '../../src/data/characters'
import { initialEvents } from '../../src/data/events/index'

function flagsWritten(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const event of initialEvents) {
    for (const choice of event.choices ?? []) {
      for (const flag of choice.effects?.flags?.add ?? []) {
        const set = map.get(flag) ?? new Set<string>()
        set.add(event.id)
        map.set(flag, set)
      }
    }
  }
  return map
}

describe('P1 常驻人物', () => {
  const written = flagsWritten()

  it('正好 12 个，id 不重复', () => {
    expect(RECURRING_CHARACTER_COUNT).toBe(12)
    expect(new Set(RECURRING_CHARACTERS.map((c) => c.id)).size).toBe(12)
  })

  it('每人挂 3–5 张现有事件写得出的关系票', () => {
    for (const character of RECURRING_CHARACTERS) {
      expect(character.visitFlags.length, `${character.name} 的关系票不足 3`).toBeGreaterThanOrEqual(3)
      expect(character.visitFlags.length, `${character.name} 的关系票超过 5`).toBeLessThanOrEqual(5)
      for (const flag of character.visitFlags) {
        expect(written.get(flag)?.size ?? 0, `${character.name} 的票 ${flag} 没有任何事件写出`).toBeGreaterThan(0)
      }
    }
  })

  it('每人都至少在两个不同事件里露过面，不是一张卡的换皮', () => {
    for (const character of RECURRING_CHARACTERS) {
      const events = new Set<string>()
      for (const flag of character.visitFlags) {
        for (const id of written.get(flag) ?? []) events.add(id)
      }
      expect(events.size, `${character.name} 只在一个事件里出现`).toBeGreaterThanOrEqual(2)
    }
  })

  it('结局只提真的写过票的人，最多三个', () => {
    const flags = ['孙传庭故交', '崇祯赏识', 'wife_respected', '弹劾袁崇焕']
    const epilogue = relationshipEpilogue(flags)
    expect(epilogue).toContain('孙传庭')
    expect(epilogue).toContain('崇祯帝')
    expect(epilogue).toContain('袁崇焕')
    expect(epilogue).not.toContain('夫人')
    expect(epilogue.split('\n').length).toBeLessThanOrEqual(4)
  })

  it('没有关系票时不硬塞故人段', () => {
    expect(relationshipEpilogue([])).toBe('')
    expect(relationshipEpilogue(['与世无争'])).toBe('')
  })

  it('排序按命中票数，不按注册顺序', () => {
    const flags = ['wife_respected', 'harmonious_family', 'wife_forgave', '崇祯赏识']
    const list = relationshipsOf(flags)
    expect(list[0]?.character.name).toBe('夫人')
    expect(list[1]?.character.name).toBe('崇祯帝')
  })
})
