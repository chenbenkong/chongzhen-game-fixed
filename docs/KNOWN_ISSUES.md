# 已知问题与后续工作

> 本文件记录**已确认、但尚未修复**的问题，以及需要人工验收的项。
> 目的是让继任者不必重新审计一遍，也避免把"已知缺陷"误当成"已解决"。
>
> 前三轮修复之后，2026-10-04 又做了第四轮（面向交付的整改），
> 摘要见 [STEAM_RELEASE.md](STEAM_RELEASE.md) §2。
> 本轮新增的未修复项见下方 §1.1。

---

## 一、尚未修复的问题

### 1.1 · 第六轮已部分处理 · 首屏预取的分片数量从 46 降到 23

**位置**：`vite.config.js` 的 `manualChunks`（`historicalBucket` / `transitionBucket`）。

**原状**：Vite 把 17 个历史年份 + 18 个过渡年份各自分包，
而 `events/index.ts` 静态 import 全部，于是首屏一次性预取 **1.36MB / 46 个 JS 请求**，
线上 FCP 1.34s（本地 112ms，差异全是网络往返）。

**这一轮做了什么**：按本文原来的建议 —— 先合并年份分片，不动引擎的异步模型 ——
把每个年份一片改成「历史 4 年一片 / 过渡 5 年一片」。
产物 JS 分片从 **46 个降到 23 个**，总体积一个字节没变，
省掉的是 23 次请求往返，正是 FCP 差距的来源。

**仍未解决的部分**：这些分片**依然是全量预取** —— 因为
`events/index.ts` 是静态 import，`manualChunks` 只影响"切成几个文件"，不影响"何时取"。
要真正做到按需加载，必须把事件挑选改成异步，那会大改 `useGameEngine` 核心。
桌面版（Steam 的实际发行形态）跑在本地磁盘上，这个成本根本不存在，
所以完整的懒加载仍然排在低优先级。

**第六轮之后实测的准确口径**（`dist/index.html` 的 modulepreload 列表）：
首屏预取 **19 个 JS / 2.63 MB**。其中 `events-ending-*.js` 占 167 KB，
它**按定义无法延后** —— `data/boundaryEvents.ts` 必须静态拿到全部结局事件
逐个注册给 `BoundaryEventManager`，而引擎在任何一个月都可能抛出结局。
上一轮在 `events/index.ts` 末尾留下的注释声称"结局数据不再阻塞首屏"，
这是**错的**（本轮实测推翻并已改正）。同轮还删掉了该文件里一个
`import { allEndingEvents } from './ending'` 死引用 —— 它只被早已删除的
同名 export 用过，而 `noUnusedLocals` 没有报它（已用探针验证：往该文件追加一个
完全无用的 import，`tsc --noEmit` 依然通过）。
**结论：类型检查对"死 import"这一类是盲的，别把它当成防线。**

**本轮顺带修掉的真实缺陷（开发工具侧）**：
`scripts/validate-events.ts`、`scripts/audit-events.ts`、`scripts/audit-narrative-quality.ts`
三个事件体检脚本**全部在运行时崩溃** —— 它们都从 barrel import 那个已被删除的
`allEndingEvents`，拿到 `undefined` 后 `for (const event of events)` 抛
`TypeError: events is not iterable`。也就是说本文「需要人工验收的项」里
指向的那两条内容体检命令，其实从上一次性能改造起就一直跑不了。
三处已改为按路径直取 `../src/data/events/ending`，现在全部跑通且结论是干净的：
六个事件池 0 问题（标签与效果对账、空标题/缺描述/缺选项/条件矛盾/年份区间倒置）。

**并把这一类钉进 CI**：`tsconfig.test.json` 的 include 加上 `scripts/*.ts`。
改之前 `scripts/` 完全不在类型检查范围内，所以那次删 export 的改动才会一路沉默下来。
加上之后，同样的破坏会以 `error TS2459: Module '"../src/data/events/index"'
declares 'allEndingEvents' locally, but it is not exported` 直接拦住部署
（已实测：把 import 改回 barrel 形式，typecheck 立刻失败）。

**本轮新增的体检脚本**：`scripts/audit-flag-reachability.ts` ——
它把「事件条件要求的 flag」与「任何选项能获得的 flag」两张表对拍，
用来找"因前置 flag 永不可能获得而永远选不中的事件"。
当前结果：400 个事件里 **0 个** 这类死内容，0 个"只 remove 从不 add"的 flag。
另外 216 个 flag 属于"写进去但没有任何条件读它"（妻室线、党争立场居多），
是记账冗余而非缺陷，动它们等于发明玩法，故保留。
（这 9 个新出现的白存 flag 是第七轮把出身线 c3 的 `flags.add` 搬进 `effects` 之后
才第一次真的被写入存档的 —— 数字变大恰好是那处修复生效的证据。）

**第七轮补的第二个体检**：`scripts/audit-event-shape.ts`（`npm run audit:shape`）。
flag 可达性查的是"这条条件能不能凑齐"，它查的是"这个键名引擎认不认"，
两类问题互相覆盖不到。详见第三节第七轮。

### 1.2 · 本轮新增 · 长周目性能只做了推理、未做实测

本轮把引擎热路径从 O(n×m) 改成 O(n+m)（见 STEAM_RELEASE §2.6），
所以**理论上**不再随存档变老而劣化。但实测只覆盖了"单次推进月份"
（P99 16.8ms），**没有**跑一个长存档（200+ 条 `eventHistory`）来对比帧率。
这是推理，不是实测。

**建议验收方式**：用幽灵模式跳到 1644 年，积累大量事件历史后，
连续推进 12 个月并记录帧间隔。

### 1.3 · 遗留 · 成就数据仍是模块级共享状态（结构性重构未做）

**位置**：`src/types/achievement.ts` 的 `currentAchievementData`。

**现状**：成就数据仍保存在一个模块级变量里，而不是随 `SaveData` 传递。

**已解决的部分 —— 引用别名与退役 id 清理**：
原来 `setAchievementData` 直接按引用保存调用方的对象、`loadAchievements` 也按引用返回
内部对象，于是任何调用方的一次就地修改都会污染全局成就状态，而且完全不会报错。
现在读写边界上都做防御性拷贝；本轮又在同一个函数里加上了
`RETIRED_ACHIEVEMENT_IDS` 的剔除（已删除的成就不能留在旧存档里）。
行为由 `tests/unit/achievement.store.test.ts`（6 例）与
`achievement.steamLimit.test.ts`（8 例）钉住。

**仍未解决的部分**：模块级单例本身。它的实际影响只出现在
"同时存在多个成就消费者"的场景（多周目并行、回放、成就对比面板），
而当前游戏在任何时刻都只有一个引擎实例，因此这不构成现实缺陷。

**为什么不做完整重构**：把成就数据并入 `SaveData` 意味着
`unlockAchievement` / `checkAndUnlockAchievements` 都要改成由调用方传入并回传数据，
而它们目前被 `endingSystem`（不持有引擎状态）与多个组件直接调用。
这是一次横跨 4 个模块的改动，风险明显高于它现在能带来的收益。
**触发条件**：一旦真的要做多周目并行或回放，再动它。

---

## 二、需要人工验收的项

| 项 | 为什么无法自动验收 | 建议验收方式 |
| --- | --- | --- |
| Electron 安装包 | 需要真实 Windows 桌面环境与 GUI | 在 Windows 上跑 `npm run desktop:dist`，双击安装包完整玩一局 |
| Steamworks 真实驱动 | 需要原生模块 + 真实 Steam 客户端 + AppID | 用测试 AppID `480`（Spacewar）先验证成就与云存档通路 |
| 数值平衡 | 属于主观体验 | 各难度各通关 2–3 遍，观察升迁曲线与结局分布 |
| 事件覆盖率 | 需要大量游玩 | 跑 `npm run audit:events` / `audit:validate` / `audit:narrative` 做内容侧体检（`@ts-nocheck` 盲区另有 `npm run audit:shape`，已在 CI 里跑） |
| 成人内容角色年龄 | 无法从文本可靠推断 | **人工通读** `src/data/events/gray/debauchery/` 全部文本 |
| BGM / 美术授权 | 不在代码里 | 追溯素材来源，保留授权凭证 |

---

---

## 二点五、第五轮：闪退专项

这一节记录"动不动就闪退"的排查过程与结论。**先说最重要的一条**：

> ### 排查过程中发现：C: 盘当时是 100% 满的（0 字节可用）
>
> 这不是游戏代码的问题，但它本身就会导致各种异常（存档写不进去、
> 临时文件创建失败、Electron 起不来），很可能与你感受到的"闪退"直接相关。
> 已清理 5.2 GB 孤儿 Chromium 临时目录（`%TEMP%\scoped_dir*`，185 个）恢复空间。
>
> **请确认磁盘剩余空间**。Electron / Steam 版对可用空间比浏览器版敏感得多。

### 排查方法

"闪退"是个主观词，先要确定它指的是哪一种。三种形态、三种查法：

| 形态 | 判定方式 | 工具 |
| --- | --- | --- |
| 未捕获异常 | `page.on('pageerror')` | `tests/crash-hunt.mjs` |
| React 错误界面 | DOM 里有 `.error-boundary` | 同上 |
| 白屏 | `#root` 的 childElementCount === 0 | 同上 |

新增的三个可复用脚本（都在 `tests/`，需先 `npm run build && npm run preview`）：

| 脚本 | 作用 |
| --- | --- |
| `npm run test:crash` | 乱按压力测试：三连击选项与推进、结算进行中点别的、反复开关每个弹窗、存档往返、localStorage 写满后继续玩、中途刷新 |
| `npm run test:fuzz` | 存档模糊测试：**37 个畸形存档**（缺字段 / null / 字符串 / 超长 / 已删除的成就 id / 非法 JSON）逐一加载 |
| `npm run test:mem` | 内存与帧率：60 次弹窗开关后的堆占用、以及不同长度 `eventHistory` 下的帧间隔 |

### 找到并修复的真缺陷

| 严重度 | 缺陷 | 后果 |
| --- | --- | --- |
| **高** | `character` 存在但**整个 `attributes` 缺失**时，读档后渲染第一帧就抛 `Cannot read properties of undefined (reading '理政')` | **白屏**。抛在 AttributePanel（它直接下标访问 `attributes.理政`），整个游戏被 ErrorBoundary 接管 |
| **高** | 游戏内存档面板的「继续上次游戏」自己 `JSON.parse`，**绕过 `migrateSave`** | 同一个存档从标题屏读没事、从游戏内读就崩 —— 而这正是玩家最容易误触的路径 |
| **高** | `STORAGE_ERROR_EVENT` 一直在派发，但**没有任何组件订阅** | 文档里"存档失败不再静默"其实并不成立：localStorage 写满时玩家毫无提示地丢掉整局进度 |
| 高 | 存档损坏时「继续上次游戏」按钮直接消失，只有一条 console.error | 看起来像"存档被吃掉"，通常被当成丢档 / 闪退投诉 |
| 中 | Electron 主进程**没有** `uncaughtException` / `unhandledRejection` 监听 | 主进程任何未捕获异常都会让整个应用立即退出、无栈无提示 —— 这正是桌面端"闪退"的字面含义 |
| 中 | 没有 `render-process-gone` 监听 | 渲染进程 OOM 时窗口变白，玩家无法恢复也不知道发生了什么 |
| 中 | 启动流程失败只 `console.error` | 结果是"进程活着但一个窗口都没有"，玩家看到应用闪一下就没了 |
| 低 | `migrateSave` 只判 `!raw.character` 不判类型 | `character` 是字符串时抛 "Cannot create property 'hidden' on string"，虽被 catch 吞掉但日志误导 |

### 修复要点

`migrateSave` 此前为**每一个**字段都做了兜底，唯独漏了 `attributes`：

```ts
if (!Array.isArray(character.flags)) character.flags = []
raw.character.hidden = normalizeHidden(raw.character.hidden)
// ... 但没有 attributes，于是崩溃点被推迟到渲染期
```

现在：

```ts
raw.character.attributes = normalizeAttributes(raw.character.attributes)
```

`normalizeAttributes` 与 `normalizeHidden` 对称：缺键 / null / NaN 一律取默认值，
越界夹到 0–100。**关键在于它在读档路径上无条件执行** ——
渲染组件是直接下标访问属性的，兜底必须发生在数据层，不能指望每个组件自己判空。

### 验证结果

- 存档模糊测试：**37 个用例，0 崩溃**（修复前 1 个真白屏，外加 1 条绕过迁移的路径）
- 压力测试：11 次健康检查全绿，0 未捕获异常
- 内存：60 次弹窗开关后堆占用 5.5 → 6.1 MB **完全持平**，无泄露
- 帧率：注入 600 条 `eventHistory` 的长存档并不比 5 条的慢（样本偏少，仅作趋势参考）

### 两条方法论教训

**一、不要把"日志"和"崩溃"混为一谈。**
第一版检测器把**任何** `console.error` 都算作崩溃，于是报出"还有 3 个白屏"。
实际上那 3 个都是「存档损坏 → 被 try/catch 正确捕获 → 打一条诊断日志」，
root 完好、无 ErrorBoundary、无未捕获异常 —— 那是**正确行为**。

真正的闪退只有三种：`pageerror` / ErrorBoundary 接管 / `#root` 被清空。
混为一谈会让你去修不存在的问题，同时掩盖真正要修的地方。
这条已写进 `tests/save-fuzz.mjs` 的注释里。

**二、渲染早于 effect，只靠事件通知会漏。**
标题屏在**渲染阶段**就调用 `hasAutosave()`，而订阅事件发生在 `useEffect` 里 ——
渲染早于 effect，所以只在构造完成时派发的读错误事件会被整个漏掉，
提示永远不会出现。这正是"存档坏了却没人告诉玩家"的直接原因之一。
因此读错误额外在内存里留了一份供 UI 挂载时补取（`takePendingReadError`）。

## 三、已修复的问题（按轮次索引）

回归测试共 **102 例**，分 15 个文件，全部在 `tests/unit/`。

### 第七轮：`@ts-nocheck` 盲区里的静默失效

这一轮的对象不是引擎代码，而是**数据**。`src/` 里有 **70 个文件**带 `@ts-nocheck`
（全部事件数据 + 结局数据），它们对 `tsc` 完全透明：键名写错、层级放错，
编译照样通过、线上照样不崩，只是在运行时变成一件**什么都没做**的事。
第六轮末尾我写了一个结构体检脚本手工跑，一跑就掉出两类真缺陷。

| 缺陷 | 表现 | 位置 |
| --- | --- | --- |
| 五方态度被当成人物属性写进 `conditions.attributes` | `圣眷: { min: 30 }` / `清议: { min: 50 }` 这类条件取值走 `attributes[key] \|\| 0`，恒为 0 → **5 个纵欲线事件在任何存档里都不可能触发**，写了整篇文本却一行都看不到 | `gray/debauchery/{spy,gratitude,powersex}.ts`（改判 `gameState`；`政绩` 两处直接删除，保留同事件里更严的 `理政` 门，不为它新造别名） |
| `flags: { add: [...] }` 挂在**选项层**而不是 `effects` 里 | 引擎只读 `choice.effects.flags`，这一整段从没生效过 → `origin_*_done` 不置位（出身事件在整局里**反复触发**），而 `法理兼顾` / `孝义两全` 这类下游条件要用的 flag 也从未被授予 | `origin/{jinshen,moluo,shiwen}.ts`（9 个 c3 选项，搬进 `effects`） |
| 三个体检脚本自己崩了半年 | 见第一节 1.1：它们从 barrel 取已被删掉的 `allEndingEvents`，拿到 `undefined` 后 `TypeError: events is not iterable`。文档里指向这两条人工验收命令，其实一条都跑不了 | `scripts/{validate-events,audit-events,audit-narrative-quality}.ts`（已在上一提交修复并把 `scripts/*.ts` 纳入 `tsconfig.test.json`） |
| 检查器没人检查 | 只做"真实数据必须为 0"的断言，证明不了检查器抓得住坏数据 | `scripts/audit-event-shape.ts` 导出 `scanEventShape()`，`tests/unit/eventShape.silentFailures.test.ts` 既跑真实四个池（DEAD / NOOP / DROP / LINK 各 0 处），又喂一份人造坏事件把四类失效逐条抓出来 |
| 上一轮刚搭的类型守卫本身是坏的 | `tsconfig.test.json` 把 `scripts/*.ts` 纳入 include 之后，脚本里只要用一次 `fs` / `process` 就报 TS2307 / TS2580 —— 因为没有 `@types/node` | `package.json`（devDependency `@types/node`） |

现在的体检结论：**400 个事件，DEAD 0 / NOOP 0 / DROP 0 / LINK 0**，
另剩 11 处「结构」告警 —— 全是 `result.echo_2: ''` 这种空串历史遗留，不丢内容（见第五节第 7 条）。
flag 可达性另有一查（`npm run audit:flags`）：400 事件里 0 个因前置 flag 永不可得而选不中的死内容。

还有第三查 `npm run audit:dupkeys`（`scripts/audit-dup-keys.ts`，走 TypeScript AST）：
对象字面量里的**重复键**是 TS1117，属于语义错误，被 `@ts-nocheck` 整文件静音；
后果是后写的半块条件 / 效果**静默覆盖**前半块，而运行时对象里只留一个键，
所以从数据侧（`audit-event-shape.ts`）一点痕迹都看不出来 —— 只能回到源码去数。
当前 `src/` 的 100 个 `.ts` 文件里 **0 组**重复键。它暂时只做手动脚本，没接进 CI。

方法论记录（承接第六轮那条）：**数据和判定逻辑之间的"接线"必须被机器盯着**。
`@ts-nocheck` 是这个仓库最大的单一体检盲区 —— 它让 400 个事件、上万条数值
完全脱离类型系统。要么哪天真的给数据补上类型，要么就一直养着这个体检脚本。

### 第六轮：逻辑与数据缺陷专项

这一轮的主题是「**代码写了，但那条路径从来没被走到过**」。
上面几轮修的是崩溃与白屏，这一轮修的是**静默的错误** ——
不报错、不闪退，只是玩家永远看不到该看到的东西。
每条都先在 pristine HEAD 上跑回归用例确认它确实是缺陷（19 例里 9 例在改前直接失败），
再动手改。回归测试 `tests/unit/engine.regressionRound6.test.ts`。

| 缺陷 | 表现 | 位置 |
| --- | --- | --- |
| `conditions.random` 量纲不一致：判定按 0-1 小数写、数据按百分数给 | `random: 25`（"每月 25%"）不满足 `< 1`，概率门被整个跳过 → 该事件每月**必然**触发，频率是设计值的 4 倍 | `utils/eventConditions.ts` |
| 4 个党争事件从未并进任何事件池 | 引擎的 `withCooldown` 分支一直在处理 `'faction'` 类型，但正常游玩永远遇不到 —— 只有调试面板单独 import 了它 | `data/events/index.ts` |
| 15 个 `chain` 主线事件不在挑选范围内 | tier-1 的类型白名单漏了 `'chain'`，整条主线剧情不可达 | `hooks/useGameEngine.ts` |
| `effects.meritScore` 无人读取 | 数据里给事件配了政绩加成，引擎算完就丢，既不入账也不进存档 | `useGameEngine.ts` + `types/save.ts`（`meritBonus`，schema v4） |
| 结局分支在 `setGameState` **之前** return | 所有 `special.type='ending'` 的选项丢掉五方态度增量：属性、隐藏属性、flags 都写了，圣眷/士绅/民望停在原地，结局屏与史馆传略读到的是"改了一半"的局势 | `useGameEngine.ts` |
| 挂载路径给边界判定的 params 缺 `turn` / `currentYear` / `currentMonth` | 编译器注入的 `turn >= 36` 恒假；缺年份两键时 `compileConditions` 第 1)、2) 步直接 `return false`，所有带年份窗口的结局（甲申之变、殉国煤山）**读档进来永不触发** | `useGameEngine.ts` |
| 阈值结局在开局第一个月就能把人打死 | 寒门 `财帛=15`，开局事件「家书催银」第一个选项扣 20 → 财帛 0 → `bankrupt` 立刻达成；读档路径同样会重播 | `data/boundaryEvents.ts`（`THRESHOLD_ENDING_GRACE_TURNS = 12`，见第五节） |
| 存档里的 `currentEvent` / `pendingEvents` 不做规整 | 外部改坏或旧版本残留时，组件按下标访问 `choices[i].text` → ErrorBoundary 白屏。模糊测试 37 例崩 4 例，现 0 例 | `types/save.ts`（`normalizeEvent`） |
| 辞官二次确认排在写入**之后** | 点"取消"会留下一个半应用的抉择：属性、隐藏属性、flags、生平记录、连击统计全部生效，只有五方态度被丢掉；玩家重选一次又把属性加一遍。现把闸门提到任何写入之前，取消则什么都不发生 | `useGameEngine.ts`（`isResignEndingChoice`） |
| 破产结局用的是引擎里手抄的两句克隆 | `BoundaryEventManager` 注册的 `triggerable_bankrupt` 带着完整叙事（引文 / 处境 /「倾家荡产」回声），引擎却自己 new 了一个只有 description 的对象，那段结局回声从未显示过。现保留成就侧 id、换用注册版本的叙事 | `useGameEngine.ts`（`withEndingId`） |
| 撤销只还原属性与局势 | `lifeRecords` / `playerStats` / `meritScore` 不回滚，撤销一次等于白得一次成就进度；`undoCount` 也不计数 | `useGameEngine.ts`（快照在统计自增**之前**采集） |
| 同一个月能被推进两次 | 推进落地在 300ms 定时器里，而这段窗口 `canAdvance` 判为"可点" → 双击 / 连按 Space = 跳两个月、增龄两次、事件 id 重复写历史、`pendingEvents` 被覆盖 | `GameScreen.tsx` + `useGameEngine.ts`（`advanceInFlightRef`） |
| 结局屏已接管画面时快捷键仍生效 | `modalOpen` 清单漏了 `isGameOver` | `GameScreen.tsx` |
| 投骰弹窗开着时数字键穿透到背后面板 | 在弹窗结算前就选定事件，并消耗掉本局唯一一次投骰机会 | `EventDisplay.tsx` |
| 快捷键被"推进门"一起锁死 | `blocked: modalOpen \|\| !canAdvance` 一个开关管到底 → 面对读不懂的事件时按 H 调不出帮助、按 S 存不了档、按 A 打不开成就，恰好在最需要的时候 | `useGameShortcuts.ts`（拆出 `blockedAdvance`） |
| 「下一级需 X 分」用未经难度换算的标尺显示 | 判定比较的是 `baseScore / mult` 与 `minScore`，显示却直接用 `meritScore` → "显示 620/需 700，却已连升两级" | `GameScreen.tsx` |
| 死亡演出被结局屏盖住 | 殉国/自尽/处斩这类选项同时命中两条路径，`.death-ending-overlay` 只有 `z-index: 1000`，结局屏是 9999 → 玩家从来没见过专属死亡演出 | `DeathEnding.css` |
| 结局图鉴「查看详情」点了没反应 | portal 到 `document.body` 后仍用 `absolute` + `z-index: 10`，被本体 1100 压在后面 | `EndingCodex.css`（`fixed` / 1200） |
| 谋士对话每次流式刷新都强拉回底部 | `AIAdvisor` 的滚动监听 effect 依赖里没有 `isOpen`：组件关闭时 `return null`、容器不在 DOM，effect 第一行就 return，此后**永不再执行** | `AIAdvisor.tsx` |
| 帮助翻到第 8 页、关掉、再打开还停在第 8 页 | 教程组件常驻挂载，`isOpen` 只切渲染分支不卸载 → `currentStep` 跨开关保留 | `TutorialModal.tsx`（开→关→开时换 key 复位） |
| 一键永久删除玩家生成的丹青，无确认、无撤销 | 组件早就引入了 `useConfirm` 并渲染了 dialog，只是从来没调用 `confirm` | `EventImages.tsx` |
| 从标题屏读自动存档后，存档槽弹窗仍盖在游戏画面上 | `handleLoadAutosave` 少了 `setIsSaveSlotsOpen(false)`（`handleSelectSaveSlot` 有） | `App.tsx` |
| 首屏 46 个 JS 分片全部预取 | 见第一节 1.1，本轮把分片数降到 23（体积未变，省掉 23 次请求往返） | `vite.config.js` |

一条方法论记录：**判据要先确认"这条路径真的会被走到"**。
上面 `random` 量纲、`chain` 不可达、`factionEvents` 未登记、`meritScore` 无人读
四条，共同点是「数据和判定逻辑都写好了，中间缺一根线」。
这类缺陷 grep 是查不出来的 —— 得让数据反过来质问代码："你配的这个值，谁读了？"
`regressionRound6.test.ts` 里那几条断言正是这么写的：拿真实数据源当输入，
断言引擎**必须**对它做出反应。

### 第五轮：闪退专项

见上方「二点五」。新增回归测试 `tests/unit/save.crash.test.ts`（17 例）：

| 缺陷 | 回归测试 |
| --- | --- |
| `character` 缺 `attributes` → 渲染第一帧白屏 | `save.crash.test.ts`（normalizeAttributes 6 例 + migrateSave 6 例 + loadAutosave 4 例） |
| `migrateSave` 不判类型，character 是字符串时抛异常 | 同上 |
| 游戏内读档绕过迁移 | 同上（loadAutosave 是唯一入口） |
| 存档损坏无任何提示 | 人工验证（`tests/save-fuzz.mjs` 断言 alert 出现） |
| Electron 主进程无崩溃防护 | 人工验证（本机无法下载 Electron 二进制，未实机跑） |

### 第四轮：面向交付的整改

| 缺陷 | 回归测试 |
| --- | --- |
| **CI 跑 Node 20，`undici@8.11.2` 需要 ≥22.19** → 连续 3 次部署失败、Pages 静默停在 4 个提交之前 | `scripts/check-node-engine.cjs`（CI 第一步）+ 已验证部署恢复 |
| 5 个结局成就只补进游戏内、漏登记 Steam 映射表 | `desktop/smoke-test.cjs` §6b（直接解析源码逐条对拍） |
| 成就数 110 > Steam 上限 100 | `achievement.steamLimit.test.ts`（3 例） |
| 已删除的成就 id 残留在旧存档里，会让 collector / legendary_master 提前达成 | `achievement.steamLimit.test.ts`（5 例） |
| `ending_collection_15` 已删但测试仍在断言它解锁 | `achievement.endingCollection.test.ts`（改为断言"不再出现"） |
| 首次进入强制弹出 8 页教程 | `tests/smoke.mjs` 进游戏链路 + 人工确认 |
| `pickEvent` 里"最近 5 条"被误改为"全部已见"，会永久耗尽支线事件 | `noUnusedLocals` 报错时人工发现（已改回原语义） |
| `vitest.config.js` 无法 merge 回调形式的 `vite.config.js` | `npm run test:unit` 直接失败 |

### 第三轮：测试驱动修复 K-1 / K-7 / K-8

| 原编号 | 缺陷 | 回归测试 |
| --- | --- | --- |
| K-1a | 投骰链路把第二级定时器排在 `setState` 更新函数**内部** | `eventDisplay.dice.test.tsx`（StrictMode 用例） |
| **新发现** | 事件切换后，旧事件的投骰结算仍会落地 | 同上（切事件用例） |
| K-1b | `handleNextMonth` 的更新函数里带 4 处副作用 | `engine.strictMode.test.ts`（2 例） |
| K-7 | 人物志取"最早 8 条"关键事件，把后半生整段丢掉 | `endingSystem.keyRecords.test.ts`（3 例） |
| K-7 | 结局收藏成就统计单局 `eventHistory`，恒为 0；且 5 个结局没有对应成就 | `achievement.endingCollection.test.ts`（7 例） |
| K-7 | `random_player` 无达成入口，只能靠 `deadByDesign` 排除 | `eventDisplay.randomChoice.test.tsx`（4 例） |
| K-8 | 标题层级跳级（`h2→h4`）、两屏缺 `h1`、两条死 CSS 规则 | 构建 + 冒烟 + 人工看图 |

几个值得记录的细节：

- **K-1a / K-1b 为什么算真缺陷，而不只是"开发期噪音"**：
  React 的更新函数必须是纯的。StrictMode 在开发构建下会重复调用它，并发渲染下也可能重放。
  投骰那条路径的后果是 **`onChoice` 被调用两次** —— 它是永久生效的（属性扣减、人生记录
  写进存档），重复调用等于把同一个选择的后果应用两遍。`handleNextMonth` 那条则是
  事件 id 重复写进历史、年龄加两次、两个定时器互相抢事件。
  两个缺陷都用 StrictMode 稳定复现了出来（投骰：`expected 1, got 2`；
  推进月份：`eventHistory` 出现重复 id）。
- **K-1a 的重构顺带暴露了第二个缺陷**：把"排定时器"移出更新函数后，
  "切到下一个事件后旧结算仍会落地"这条用例立刻失败。此前它是**空过**的 ——
  因为二级定时器排在更新函数里，切事件把 `choice` 重置为 null 后更新函数提前返回，
  定时器根本没被排上。这属于"靠巧合掩盖"，不是有意设计的守卫。
  现在改为在事件切换时显式取消所有在飞的投骰定时器。
- **K-7 的第二个子项是本轮最有价值的发现**：把 `src/data` 与引擎里所有 `ending_*`
  事件 id 拉出来与成就对照，发现 **34 个结局里有 5 个没有对应成就**
  （`ending_debauchery_001` / `ending_scholar_martyr` / `ending_fugitive` /
  `ending_bankrupt` / `ending_demotion`）。后果是这 5 个结局**永远无法写进结局图鉴**，
  图鉴进度也就永远到不了 100%；而且「百味人生」要求 30 个，可收集的只有 29 个 ——
  数学上不可达。已补齐 5 个成就，并加了两条防回归断言：
  "每个结局事件都要有对应成就"与"可收集结局数 ≥ 最高档门槛"。
- **K-7 的第三个子项是补功能而非改判据**：`random_player`（随机选择 50 次）原本
  没有任何达成入口，只能标记 `deadByDesign` 排除在全收集判定之外。这轮在选项列表下方
  加了「听 天 由 命」按钮（只从**可选**的选项里随机挑，锁定项不会被选中），
  它同时是 `randomChoiceCount` 的唯一自增点。动机是让成就可达而不是删掉内容 ——
  计数、统计字段与成就定义本来就都在，缺的就是那个入口。
- **K-8 的边界**：`OriginSelect` 的 `h4` 一度被我误列入清单（基于 grep），
  实际它的结构是 `h2 → h3 → h4`，本来就连贯。真正的问题只有两处：
  取名/铨选两屏以 `h2` 作顶层标题（缺 `h1`），以及游戏界面的面板标题用 `h4`
  而同级面板用 `h3`。现在整棵树是连续的：
  取名 `h1→h2`、铨选 `h1→h2→h3`、游戏界面 `h1(事件)→h2(各面板)`。
  顺带删掉两条指向不存在元素的死 CSS 规则（`.desc-section h4` / `.history-panel h4`）。

### 第二轮：测试驱动修复 K-2 / K-3 / K-4

| 原编号 | 缺陷 | 回归测试 |
| --- | --- | --- |
| K-3 | 读档未恢复 `lifeRecords`；`playTime` 没有 setter、恒为 0 | `loadSaveRestore.test.ts`（2 例） |
| K-4 | 升迁/贬官判定依赖数组缺 4 个字段 | `engine.promotionDeps.test.ts`（2 例） |
| **新发现** | 降级理由持续存在时会重复累加贬官次数与生平记录 | `engine.promotionDeps.test.ts`（1 例） |
| K-2 | `crisis` 类临界事件只在挂载时检查一次 → 死内容 | `engine.boundary.test.ts`（2 例） |
| K-5 | 投骰定时器未清理（可观察行为本身是对的，见下） | `eventDisplay.dice.test.tsx`（7 例） |

- **K-3**：`playTimeRef` 原本是**从 state 反向同步**的，若把累计值写进 ref，
  下一次 state 变化就会把它冲掉。修复的关键是反转方向 —— ref 为准、state 只作 UI 镜像，
  并用 `getTotalPlayTime()`（累计值 + 未折算的当前区间）写存档，避免每次都丢几秒。
- **K-4**：刻意**没有**把 `character.rank` 加进依赖数组。rank 会被贬官/升官本身改写，
  加进去会形成「贬官 → rank 变 → 重新判定 → 再贬」的自激循环。
- **K-5 的结论需要更正**：原审计称"没有飞行中的并发保护"。实测下来
  `isRolling` 状态本身就是守卫（骰子区与底部按钮都会据此禁用/短路），
  React 也会丢弃已卸载组件的状态更新，所以**可观察行为本来就是正确的** ——
  7 个回归测试在修复前后都通过。真正剩下的是定时器卫生，已改为统一登记、卸载时清空。

### 第一轮：审计驱动修复

完整清单见 [STEAM_RELEASE.md](STEAM_RELEASE.md) 的 §2.4。摘要：

- 贬官机制因 `RANKS.findIndex` 缺少 `.reverse()` 而完全失效 —— 已修复
- 手动存档丢失正在进行的事件 —— 已修复
- 重开一局未重置角色与事件历史 —— 已修复
- `机敏值` / `忠诚值` 未定义导致 NaN 污染存档、条件判定前后矛盾 —— 已补为正式属性并加迁移
- `flags.any` / `none` / `all` 与 `conditions.rank` / `conditions.random` 未实现 —— 已实现
- 12 个成就读取未提供的上下文字段、1 个成就数学上不可达 —— 已修复
- 调试面板「幽灵模式」对全部玩家可见（剧透全部事件与结局）—— 一度按开关隐藏，
  **后经所有者决定改回默认常驻可见**（详见第五节「刻意保留的设定」）
- `localStorage` 配额耗尽时自动存档静默失败 —— 已改为明确提示
- 48 处 CSS 硬编码字体族绕过 fallback 链 —— 已统一为 CSS 变量
- `prefers-reduced-motion` 未重置 `animation-delay` —— 已修复
- `LifeReview` 380px 网格轨道导致所有手机横向溢出 —— 已修复
- `App.css` 整段重复 `TitleScreen.css`（含两处冲突的 `.title-quote`）—— 已删除
- 存档格式无版本号、无迁移 —— 已引入 `SAVE_SCHEMA_VERSION = 3`
- 仓库内 30 MB 开发过程产物 —— 已清理

---

## 四、测试基座本身踩到的坑

记录在 `tests/unit/README.md`，这里只列要点：

1. **Node 26 内置的实验性 `localStorage` 会覆盖 jsdom 的实现**。现象极具迷惑性：
   jsdom 明明加载成功（`window` / `document` / navigator 都正常，UA 也是 `jsdom/30.x`），
   但 `localStorage` 是 `undefined`，引擎一读存档就抛
   `Cannot read properties of undefined (reading 'getItem')`。
   已在 `setup.ts` 装符合 Storage 规范的内存实现（含 `length` 与 `key(i)`）。
2. **`Math.random` 必须固定**，否则事件挑选、掷骰、临界事件判定都会让用例随机失败。
3. **等待时间要覆盖引擎的调度定时器**。`handleNextMonth` 只在 300ms 的 `setTimeout`
   里才挑事件、写历史；`advanceMonths` 早先只等 30ms，导致针对"事件历史是否重复"
   的断言其实什么都没测到。
4. **`vi.runAllTimers()` 只跑一轮是不够的**。投骰的第二级定时器是在 `setState`
   更新函数里排的，而 React 要等 act 这一轮结束才执行更新函数 ——
   只跑一轮时第二级定时器还没排上，用例会**空过**。必须
   「跑定时器 → 让 React flush → 再跑」交替若干轮。

---

## 五、刻意保留的设定（不是遗漏，请勿"顺手修掉"）

### 1. 调试面板「幽灵模式」的默认值由构建模式决定

**现状**：`src/utils/debug.ts` 的兜底返回值不再是硬编码 `true`，
而是构建期注入的常量 `__DEBUG_PANEL_DEFAULT__`（`vite.config.js` 里 define）：

| 构建命令 | 用在哪 | 默认 |
| --- | --- | --- |
| `npm run build` | GitHub Pages 演示站、本地 preview | **开启** |
| `npm run build:steam` | Electron / Steam 发行物（`desktop:dist` 会自动先跑它） | **关闭** |

**为什么这么设计**：这个面板能改属性、跳年份，并直接浏览**全部事件与全部结局**
（含未解锁结局），对玩家是彻底剧透 —— 商业发行不允许默认暴露。
但它同时是项目所有者本人的开发/试玩工具，演示站上确实需要。

如果只用"改源码里那行 `return true`"的做法，会有两个真实风险：
忘了改回来就发行了剧透面板；或者反复切换时改错了方向。
**按构建模式区分**让两边都不需要改代码 —— 一条命令决定，且可被 CI 验证。

**逃生口**：`?debug=0` 隐藏（会记住），`?debug=1` 恢复，任何构建都有效。

**回归保护**：CI 会实跑一次 `npm run build:steam`；
`tests/unit/debugSwitch.test.ts` 钉住 `?debug=` 与 localStorage 的优先级。

### 2. `pickEvent` 里"最近 5 条"不能用 `seen` 集合替代

**现状**：判定支线事件"最近是否出现过"时用的是 `eventHistory.slice(-5)`，
而不是全部已触发历史。

**原因**：支线事件（情感线 / 权色线）**设计上就是可重复的** —— 玩家会反复遇到
同一段关系或同一桩买卖。若改成"排除全部已见"，支线会被永久耗尽。
本轮改造 `pickEvent` 性能时踩过这个坑，是 `noUnusedLocals` 报错
（`recent` 变量不再被使用）才暴露出来的。

**不要"顺手优化"掉那两处 `new Set(eventHistory.slice(-5))`。**

### 3. 阈值结局的 12 个月宽限期（`THRESHOLD_ENDING_GRACE_TURNS`）

**现状**：`src/data/boundaryEvents.ts` 里 8 个"数值归零即达成"的结局
（破产 / 病故 / 圣眷尽失 / 中官构陷 / 清议不容 / 士绅反叛 / 民变 / 道德沦丧），
判定都写成 `pastGrace(params) && <原条件>`，`pastGrace` 即 `gameState.turn >= 12`。

**为什么这么设计**：这条判定本身没问题，问题在于它在**开局第一个月**就会误杀。
寒门出身 `财帛 = 15`，而开局事件「家书催银」的第一个选项扣 20 两 ——
15 − 20 = 0，`bankrupt` 当场达成。玩家刚点下第一个选项就看见
「【结局】倾家荡产」，整局在 turn=1 结束。
挂载路径（读档进来）同样会立刻重播。
这类"阈值结局"的语义是**长期状态恶化到无法挽回**，不是"单个月份的瞬时读数"，
所以给一年宽限期是符合设计的：真要走投无路，12 个月后照样触发。

**刻意没有加宽限期的两条**：`serious_illness`（体质 1–19）是 `crisis` 而非 `ending`，
它是"重病缠身、需要立刻抉择"的玩法事件，本来就该随时出现。

**回归保护**：`engine.regressionRound6.test.ts` §八 钉住了
"turn < 12 时阈值不成立 / turn ≥ 12 时成立"两侧。

### 4. 结局分支之前必须先 `setGameState`

`useGameEngine.ts` 的 `handleChoice` 里，五方态度的 `setGameState`
排在 `special.type === 'ending'` 分支**之前**。这不是随手挪的：
结局屏和史馆传略都会读 `gameState`，若让结局分支先 return，
玩家看到的局势就是"属性改了、态度没改"的半成品。
`regressionRound6.test.ts` 用 `清议 +10` 的辞官选项钉住了这一点 ——
改之前拿到的是原值 50，改之后是 60。

### 5. 存档 schema 已到 v4，`currentEvent` 也走兜底

`SAVE_SCHEMA_VERSION = 4`：v4 新增 `meritBonus`，并把 `currentEvent` /
`pendingEvents` 纳入 `migrateSave` 的规整范围（`normalizeEvent`）。
**这条属于项目既有信条的延伸：兜底必须发生在数据层，不能指望每个组件自己判空。**
组件是直接用下标访问 `currentEvent.choices[i].text` 的，
一个被外部改坏的存档就能让它在渲染第一帧撞进 ErrorBoundary。

### 6. `manualChunks` 的年份分桶是刻意的粗粒度

`vite.config.js` 的 `historicalBucket`（4 年一片）与 `transitionBucket`（5 年一片）
取代了原先的"一年一片"。不要改回逐片 —— 那 46 个分片不会因为拆得更细而变少，
`events/index.ts` 是静态 import，首屏照样全量预取，多出来的只是 23 次请求往返。

### 7. 体检脚本剩下的三类噪音，是刻意不清理的

`npm run audit:shape` 目前仍报 11 处「结构」告警，全是同一形态：
`result.echo_2: ''`（散落在 historical_028 / 030 与 9 个 route_* 的 c3 选项）。
`echo` 里装的是完整回声文本，`echo_2` 是当初想写两段式回声留下的空键 ——
不丢任何内容，删它只是让 diff 变长，故保留；但测试把它钉成
"结构告警只允许是 echo_2、且不超过 11 处"，所以**新写一个错键名照样红**。

另两类同源噪音也不打算"顺手修掉"：216 个只写不读的 flag（见第一节 1.1），
以及引擎对未知键的宽容姿态 —— `conditions.gameState` 撞上不认识的键时，
比较的是 `undefined`，两侧都为 false，于是**静默跳过这条条件**而不是否决整个事件。
把它改成"未知键即否决"确实更符合"宁可少触发也别错触发"，但代价是
旧存档配新数据、或新数据配旧引擎时，一批事件会集体消失，而消失比提前触发更难被发现。
所以这里的取舍是：**引擎保持宽容，用 CI 里的体检脚本把错键名挡在数据层**
（与本仓库"兜底发生在数据层"的信条一致，见第五节第 5 条）。
