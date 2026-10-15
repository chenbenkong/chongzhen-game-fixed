/**
 * 重复键体检：用 TypeScript 自己的 AST 扫事件数据文件。
 *
 * 为什么 tsc 抓不到：`An object literal cannot have multiple properties with the
 * same name`（TS1117）是**语义**错误，而 70 个数据文件全都 `@ts-nocheck` ——
 * 错误被整文件静音。后果不是报错，而是后者**静默覆盖**前者：
 * 前半段写的条件/效果整块消失，作者却看得见它躺在文件里。
 *
 * 这是 audit-event-shape.ts 覆盖不到的一类：它遍历的是运行时的对象，
 * 那时重复键早就合并成一个了，看不出任何异常。
 *
 *   npm run audit:dupkeys
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import ts from 'typescript'

const ROOT = 'src'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

type Dup = { file: string; line: number; key: string; first: number; count: number }
const dups: Dup[] = []
const files = walk(ROOT)

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
  const lineOf = (pos: number) => src.getLineAndCharacterOfPosition(pos).line + 1

  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Map<string, number>()
      const dupLines = new Map<string, number[]>()
      for (const prop of node.properties) {
        if (!prop.name) continue
        const key = prop.name.getText().replace(/^['"]|['"]$/g, '')
        const line = lineOf(prop.name.getStart(src))
        const at = seen.get(key)
        if (at === undefined) { seen.set(key, line); continue }
        const lines = dupLines.get(key) ?? [at]
        lines.push(line)
        dupLines.set(key, lines)
      }
      for (const [key, lines] of dupLines) {
        dups.push({ file, line: lines[lines.length - 1], key, first: lines[0], count: lines.length })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
}

const rel = (p: string) => relative(ROOT, p)

console.log(`扫描文件: ${files.length}`)
if (!dups.length) {
  console.log('未发现重复键')
} else {
  for (const d of dups.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`  ${rel(d.file)} 键「${d.key}」第 ${d.first} 行与第 ${d.line} 行重复（共 ${d.count} 处）` +
      ` —— 后者静默覆盖前者`)
  }
  console.log(`合计 ${dups.length} 组`)
}
