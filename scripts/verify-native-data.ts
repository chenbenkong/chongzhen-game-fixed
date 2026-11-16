/**
 * 原生数据导出校验脚本（精简版）。
 *
 * 三条硬断言：
 *  1. JSON.parse 成功；
 *  2. 打印事件 / 结局条数；
 *  3. 序列化文本不含函数字段痕迹（"function(" / "=>"）。
 *
 * 运行：
 *   node node_modules/vite-node/vite-node.mjs scripts/verify-native-data.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'game-data.json')

const failures: string[] = []

function main(): void {
  if (!fs.existsSync(dataFile)) {
    failures.push(`数据文件不存在：${dataFile}`)
    finish()
    return
  }

  const raw = fs.readFileSync(dataFile, 'utf8')
  const bytes = Buffer.byteLength(raw, 'utf8')

  // 1. JSON.parse 成功
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    failures.push(`JSON.parse 失败：${err instanceof Error ? err.message : String(err)}`)
    finish()
    return
  }

  const root = data as {
    events?: Array<Record<string, unknown>>
    endings?: { endingIds?: string[] }
    boundaryEvents?: unknown[]
    customRules?: unknown[]
    unportableRules?: unknown[]
  }

  // 2. 条数打印
  const events = root.events ?? []
  const endingIds = root.endings?.endingIds ?? []
  console.log(`  JSON 体积: ${bytes} 字节 (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`  事件条数: ${events.length}`)
  console.log(`  结局条数: ${endingIds.length}`)
  console.log(`  边界规则: ${(root.boundaryEvents ?? []).length}`)
  console.log(`  customRules: ${(root.customRules ?? []).length}；unportableRules: ${(root.unportableRules ?? []).length}`)

  // 3. 无函数字段痕迹
  if (raw.includes('=>')) failures.push('JSON 文本内含箭头函数 "=>"')
  if (raw.includes('function(')) failures.push('JSON 文本内含 "function("')

  finish()
}

function finish(): void {
  if (failures.length > 0) {
    console.error('[verify-native-data] 校验失败：')
    for (const f of failures) console.error('  ✗', f)
    process.exit(1)
  }
  console.log('[verify-native-data] 断言通过 ✔')
  process.exit(0)
}

main()
