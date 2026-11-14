import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 丹青画卷 / AI 谋士 / 大图查看器必须走 useModal（缺陷 6）。
 *
 * 实测原状：两者是裸 div，无 role=dialog、无 aria-modal、无 ESC、无焦点陷阱 ——
 * 丹青 Tab 20 次逃逸 14 次；谋士打开后焦点根本没进来（仍在背景按钮上），
 * ESC 连按 3 次无效，键盘玩家只能靠鼠标点「关」。项目里其余 9 个弹窗都接了
 * useModal，这两个是漏网的。按成因钉：接进 useModal 后语义与陷阱自动成立。
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('覆盖层的对话框语义', () => {
  it('ImageGenerator 主面板接入 useModal 并挂上 dialog props', () => {
    const s = read('src/components/ImageGenerator.tsx')
    expect(s).toMatch(/useModal\(\{\s*open:\s*isOpen,\s*onClose\s*\}\)/)
    expect(s).toContain('igDialogRef')
    expect(s).toContain('igModalProps()')
  })

  it('大图查看器不再自带 window ESC（叠层时一次 ESC 会两层全关）', () => {
    const s = read('src/components/ImageGenerator.tsx')
    expect(s).not.toMatch(/if \(e\.key === 'Escape'\) onClose\(\)/)
    expect(s).toMatch(/className="ig-viewer-panel" ref=\{dialogRef\}/)
  })

  it('AIAdvisor 接入 useModal 并把 props 挂到面板', () => {
    const s = read('src/components/AIAdvisor.tsx')
    expect(s).toMatch(/useModal\(\{ open: isOpen, onClose \}\)/)
    expect(s).toContain('aiDialogRef')
    expect(s).toContain('aiModalProps()')
  })

  it('useModal 维护跨实例模态框栈，ESC 只关栈顶', () => {
    const s = read('src/hooks/useModal.ts')
    expect(s).toContain('openDialogStack')
    expect(s).toMatch(/openDialogStack\[openDialogStack\.length - 1\] !== dialogRef\.current\) return/)
  })

  it('ConfirmDialog 补上注释承诺却从未实现的 ESC=取消', () => {
    const s = read('src/components/ConfirmDialog.tsx')
    expect(s).toMatch(/e\.key === 'Escape'/)
    expect(s).toMatch(/onCancel\(\)/)
  })
})
