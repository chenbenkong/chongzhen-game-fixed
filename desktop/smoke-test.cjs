/**
 * steam.cjs 冒烟自检：验证「steamworks.js 缺失 / Steam 未运行」时 MOCK 驱动
 * 依然完整可用，且任何调用都不抛异常。
 *
 * 用法：node desktop/smoke-test.cjs
 * 注意：这不是单元测试框架，只是一个给 owner 用的可执行自检脚本。
 */

'use strict'

const path = require('node:path')
const fs = require('node:fs')

// 强制 mock，这样在没有 Steam 的 CI / 开发机上结果稳定
process.env.CHONGZHEN_FORCE_MOCK_STEAM = '1'

const steam = require('./steam.cjs')

const testUserData = path.join(__dirname, '.test-userdata')
fs.rmSync(testUserData, { recursive: true, force: true })

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  =>  ${JSON.stringify(actual)}${ok ? '' : '  (期望 ' + JSON.stringify(expected) + ')'}`)
}

console.log('=== 1. 初始化（强制 mock） ===')
const status = steam.initSteam({ appId: 480, userDataPath: testUserData })
console.log('getStatus() =', JSON.stringify(status, null, 2))
check('driver 是 mock', status.driver, 'mock')
check('available 为 false', status.available, false)
check('appId 已记录', status.appId, 480)

console.log('\n=== 2. 成就：解锁 / 查询 / 幂等 / 未知 id ===')
check('解锁 from_ninth', steam.unlockAchievement('from_ninth'), true)
check('用 API Name 查询 FROM_NINTH', steam.isAchievementUnlocked('FROM_NINTH'), true)
check('重复解锁仍为 true', steam.unlockAchievement('from_ninth'), true)
check('未解锁的成就为 false', steam.isAchievementUnlocked('WAR_GOD'), false)
check('未知 id 返回 false（不抛异常）', steam.unlockAchievement('definitely_not_an_achievement'), false)
check('空字符串返回 false', steam.unlockAchievement(''), false)
check('null 返回 false', steam.unlockAchievement(null), false)

console.log('\n=== 3. 云存档：写 / 读 / 列表 / 安全校验 ===')
check('写入 save1.json', steam.setCloudFile('save1.json', '{"slot":1}'), true)
check('写回 save1.json', steam.setCloudFile('save1.json', '{"slot":1,"v":2}'), true)
check('写入 save2.json', steam.setCloudFile('save2.json', '{"slot":2}'), true)
check('读取 save1.json', steam.getCloudFile('save1.json'), '{"slot":1,"v":2}')
check('读取不存在的文件返回 null', steam.getCloudFile('nope.json'), null)
check('列表按字典序', steam.listCloudFiles(), ['save1.json', 'save2.json'])
check('拒绝路径穿越', steam.setCloudFile('../escape.json', 'x'), false)
check('拒绝空文件名', steam.setCloudFile('', 'x'), false)
check('拒绝非字符串内容', steam.setCloudFile('a.json', 12345), false)

console.log('\n=== 4. 持久化：重新 require 后状态仍在 ===')
delete require.cache[require.resolve('./steam.cjs')]
const steam2 = require('./steam.cjs')
steam2.initSteam({ appId: 480, userDataPath: testUserData })
check('成就已持久化', steam2.isAchievementUnlocked('FROM_NINTH'), true)
check('文件已持久化', steam2.getCloudFile('save1.json'), '{"slot":1,"v":2}')

console.log('\n=== 5. 优雅退出 ===')
steam.shutdown()
const afterShutdown = steam.getStatus()
check('退出后 driver 仍报 mock', afterShutdown.driver, 'mock')
check('退出后 available 为 false', afterShutdown.available, false)
steam.shutdown() // 重复调用必须安全
console.log('重复 shutdown() 未抛异常')

console.log('\n=== 6. 映射表统计 ===')
const apiNames = Object.keys(steam.ACHIEVEMENTS)
console.log(`Steam API Name 数量：${apiNames.length}`)
console.log(`游戏内部成就数量：${steam.INTERNAL_ACHIEVEMENT_COUNT}`)
console.log(`Steam 上限：${steam.STEAM_ACHIEVEMENT_LIMIT}`)
check('映射表条数 = 内部成就数', apiNames.length, steam.INTERNAL_ACHIEVEMENT_COUNT)
check('全部为 SCREAMING_SNAKE_CASE', apiNames.every((n) => /^[A-Z0-9_]+$/.test(n)), true)
check('内部 id 全部小写蛇形', apiNames.every((n) => /^[a-z0-9_]+$/.test(steam.ACHIEVEMENTS[n].id)), true)
const dupes = apiNames.length - new Set(apiNames.map((n) => steam.ACHIEVEMENTS[n].id)).size
check('内部 id 无重复', dupes, 0)
if (apiNames.length > steam.STEAM_ACHIEVEMENT_LIMIT) {
  // 不是失败：本作暂不上 Steam，成就数因此从"倒推裁剪"改成"按图鉴需要补齐"（第五十二轮）。
  // 留一条醒目的提示，是为了"哪天真要上线"时这里还在替人记着要删多少条 ——
  // 见 steam.cjs 头部【成就数量】那一段。
  console.log(`⚠️ 提示：${apiNames.length} 条已超过 Steam 上限 ${steam.STEAM_ACHIEVEMENT_LIMIT}，` +
    `上线前需先裁到 ${steam.STEAM_ACHIEVEMENT_LIMIT} 条以内（当前超出 ${apiNames.length - steam.STEAM_ACHIEVEMENT_LIMIT} 条）。`)
}

// ---------------------------------------------------------------------------
// 6b. 与源码对拍 —— 这是最关键的一条断言
//
// 上面那条「映射表条数 = 内部成就数」只比对了两个**手写常量**，它们完全可能一起漂移。
// 这里直接解析 src/types/achievement.ts 的 ALL_ACHIEVEMENTS 数组，把真实 id 集合与
// 映射表逐条对拍：数量、缺失、多余，三种漂移都会被抓到。
// 这样"改了游戏内成就忘了改 steam.cjs"会立刻失败，而不是等上线才发现。
// ---------------------------------------------------------------------------
console.log('\n=== 6b. 与源码 achievement.ts 逐条对拍 ===')
const ACH_SRC = path.join(__dirname, '..', 'src', 'types', 'achievement.ts')
if (!fs.existsSync(ACH_SRC)) {
  console.log('❌ 找不到 src/types/achievement.ts，无法对拍')
  failures++
} else {
  const src = fs.readFileSync(ACH_SRC, 'utf8')
  // 取 ALL_ACHIEVEMENTS 数组体，避免误抓文件里其它数组
  const arrayBody = src.slice(src.indexOf('ALL_ACHIEVEMENTS'))
  const srcIds = [...arrayBody.matchAll(/^\s{4}id:\s*'([a-z0-9_]+)',/gm)].map(m => m[1])
  const srcSet = new Set(srcIds)
  const mapSet = new Set(apiNames.map(n => steam.ACHIEVEMENTS[n].id))

  console.log(`源码中的成就 id：${srcIds.length} 条（去重后 ${srcSet.size} 条）`)
  check('源码 id 无重复', srcIds.length, srcSet.size)

  const missing = [...srcSet].filter(id => !mapSet.has(id))
  const extra = [...mapSet].filter(id => !srcSet.has(id))
  check('源码有、映射表缺的成就数', missing.length, 0)
  if (missing.length) console.log('   缺：' + missing.join(', '))
  check('映射表有、源码已删除的多余成就数', extra.length, 0)
  if (extra.length) console.log('   多：' + extra.join(', '))

  check('手写常量 INTERNAL_ACHIEVEMENT_COUNT 与源码实际条数一致',
    steam.INTERNAL_ACHIEVEMENT_COUNT, srcIds.length)

  // 上限只提示、不判失败（理由见上面「6. 映射表统计」那段）
  if (apiNames.length > steam.STEAM_ACHIEVEMENT_LIMIT) {
    console.log(`   超出 Steam 上限：${apiNames.length} > ${steam.STEAM_ACHIEVEMENT_LIMIT}`)
  }
}

console.log(`\n=== 结果：${failures === 0 ? '全部通过' : failures + ' 项失败'} ===`)
fs.rmSync(testUserData, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
