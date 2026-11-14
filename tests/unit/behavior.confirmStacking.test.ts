import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 确认框必须压过错误页（缺陷 1）的成因钉子。
 *
 * 实测事故：主包加载失败 -> 错误页上点「清除存档」-> 确认框 z-index 11000
 * 被 .error-boundary 的 99999 整个压住：玩家看不见它，可焦点已经落在
 * 「清除存档」按钮上，按一次 Enter 就把 chongzhen_save_* 全删了。
 * 层叠关系只能按成因钉，所以照 layout.modalScroll 那一族的办法读 CSS 声明。
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

function zIndexOf(css: string, selector: string): number | null {
  const idx = css.indexOf(selector + ' {')
  if (idx < 0) return null
  const block = css.slice(idx, css.indexOf('}', idx))
  const m = block.match(/z-index:\s*(\d+)/)
  return m ? Number(m[1]) : null
}

describe('确认框与错误页的层叠关系', () => {
  it('.cd-overlay 的 z-index 必须高于 .error-boundary', () => {
    const cd = zIndexOf(read('src/components/ConfirmDialog.css'), '.cd-overlay')
    const eb = zIndexOf(read('src/components/ErrorBoundary.css'), '.error-boundary')
    expect(cd).not.toBeNull()
    expect(eb).not.toBeNull()
    expect(cd as number, '确认框必须压过错误页，否则它看不见却持有焦点').toBeGreaterThan(eb as number)
  })

  it('错误页上点「清除存档」走 ConfirmDialog，不是 window.confirm', () => {
    const s = read('src/components/ErrorBoundary.tsx')
    expect(s).toContain('<ConfirmDialog')
    expect(s).not.toMatch(/window\.confirm\s*\(/)
  })
})
