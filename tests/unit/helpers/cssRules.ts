/**
 * 极小的 CSS 花括号扫描器 —— 给"读源文本守成因"的守卫测试用（CI 里跑得动，不需要浏览器）。
 *
 * 只做一件事：把 `选择器 → 声明表` 取出来，并记住每条规则在不在 @media 里。
 * 同名声明按源文本顺序后者胜出，与层叠一致（第二十九轮的缺陷正是"文件末尾一条无条件
 * min-height:auto 覆盖掉前面的 min-height:0"，所以这条顺序语义必须保留）。
 * 不解析嵌套、不解析 `@media` 的条件内容、忽略注释 —— 够用了，也别指望它更多。
 */
export interface CssRule {
  selector: string
  decls: Map<string, string>
  inMedia: string | null
}

export function parseCss(src: string, inMedia: string | null = null): CssRule[] {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  let i = 0
  while (i < s.length) {
    const open = s.indexOf('{', i)
    if (open < 0) break
    const selector = s.slice(i, open).trim().replace(/\s+/g, ' ')
    let depth = 1
    let j = open + 1
    while (j < s.length && depth > 0) {
      if (s[j] === '{') depth++
      else if (s[j] === '}') depth--
      j++
    }
    const body = s.slice(open + 1, j - 1)
    if (selector.startsWith('@')) {
      rules.push(...parseCss(body, selector))
    } else {
      const decls = new Map<string, string>()
      for (const part of body.split(';')) {
        const idx = part.indexOf(':')
        if (idx < 0) continue
        const prop = part.slice(0, idx).trim()
        if (!prop) continue
        decls.set(prop, part.slice(idx + 1).trim())
      }
      rules.push({ selector, decls, inMedia })
    }
    i = j
  }
  return rules
}

/** 某选择器的**基础**（非媒体查询）规则，按源文本顺序 */
export function baseRules(rules: CssRule[], selector: string): CssRule[] {
  return rules.filter(r => r.selector === selector && r.inMedia === null)
}

/** 层叠后的值：基础规则里最后一条说了算 */
export function baseDecl(rules: CssRule[], selector: string, prop: string): string | undefined {
  const hits = baseRules(rules, selector).filter(r => r.decls.has(prop))
  return hits.length ? hits[hits.length - 1].decls.get(prop) : undefined
}

/** 找出所有"全屏固定遮罩"：position:fixed + top:0 + (bottom:0 | height:100% | inset) */
export function fullScreenOverlays(rules: CssRule[]): CssRule[] {
  return mergedBaseRules(rules).filter(r => {
    const d = r.decls
    if (d.get('position') !== 'fixed') return false
    if (!['0', '0px'].includes(d.get('top') || '')) return false
    const bottom = d.get('bottom') || ''
    const height = d.get('height') || ''
    const inset = d.get('inset') || ''
    return ['0', '0px'].includes(bottom) || height === '100%' || inset !== ''
  })
}

function mergedBaseRules(rules: CssRule[]): CssRule[] {
  // 同一选择器多条基础规则时取"最后一条为准"，但仍保留所有选择器
  const bySelector = new Map<string, CssRule>()
  for (const r of rules) {
    if (r.inMedia !== null) continue
    const prev = bySelector.get(r.selector)
    if (!prev) bySelector.set(r.selector, { ...r, decls: new Map(r.decls) })
    else for (const [k, v] of r.decls) prev.decls.set(k, v)
  }
  return [...bySelector.values()]
}
