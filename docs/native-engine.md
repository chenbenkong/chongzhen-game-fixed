# 原生引擎实现说明（Android / Kotlin）

> 对应工程：`android/`，包名 `com.chenbenkong.chongzhen`。
> 引擎纯 JVM 实现，不调用任何 Web 代码；数据来自 `app/src/main/assets/game-data.json`。
> 本文记录条件键覆盖、发牌对齐点、结局优先级、贬官判据对照、未移植清单与已知差异。

## 1. 模块落点

| 层 | Kotlin 位置 | 职责 |
| --- | --- | --- |
| 数据模型 | `data/GameDataModels.kt` | kotlinx.serialization DTO，字段名与 JSON 严格对应；未知字段 `ignoreUnknownKeys` 忽略 |
| 数据缓存 | `data/GameDataRepository.kt` | 启动时一次性 parse 并缓存，热路径只读内存，不重复解析 3.9MB JSON |
| 条件求值 | `engine/conditions/ConditionEvaluator.kt` | 事件级 / 选项级条件求值；flags 各子键；random 概率门 |
| 效果结算 | `engine/effects/EffectApplier.kt` | 属性 / 隐藏属性 / 五方态度 / flags / 阵营好感 / 政绩加成 |
| 官阶政绩 | `engine/ranks/RankService.kt` | 政绩分、升迁、贬官 15 条判据 |
| 事件池 | `engine/pools/EventPool.kt` | 月度发牌分层、权重、冷却、一次性、prelude 优先、种子可复现 |
| 边界引擎 | `engine/boundary/BoundaryEngine.kt` | 结局 / 危机判定、可搁笔语义、自定义票规则、未移植登记 |
| 存档 | `engine/save/SaveFormat.kt` | 整局 JSON 序列化 / 反序列化 + 临时文件原子替换 |
| 门面编排 | `engine/GameEngine.kt` | 开局、抉择、推进月份、边界判定、存档桥接 |

## 2. 条件键覆盖表（以 JSON 实际出现键为准）

扫描方式：遍历 `events[].conditions` 与 `choices[].showConditions` 收集顶层键与 flags 子键。
JSON 实测顶层键集合：`age / attributes / flags / gameState / hidden / month / origin / random / rank / turn / year`。

### 2.1 顶层条件键

| 条件键 | 事件级口径 | 选项级口径 | Kotlin 实现 | 状态 |
| --- | --- | --- | --- | --- |
| `year` | 区间 min/max，当前年 | 同事件级 | `ConditionEvaluator.evaluate` | 已实现 |
| `month` | 区间 min/max，当前月 | 同事件级 | 同上 | 已实现 |
| `turn` | 区间 min/max，回合数 | 同事件级 | 同上 | 已实现 |
| `age` | 区间 min/max，角色年龄 | 同事件级 | 同上 | 已实现 |
| `rank` | 字符串或字符串数组，官阶命中其一 | 同事件级 | `coerceList` | 已实现 |
| `origin` | 字符串或字符串数组，出身命中其一 | 同事件级 | `coerceList` | 已实现 |
| `attributes` | 缺键按 0 | 缺键按 50 | 区间比较 | 已实现 |
| `hidden` | 缺键判假（不兜底数值） | 缺键按 50 | 区间比较 | 已实现 |
| `gameState` | 缺键按 0；跳过 currentYear/currentMonth/turn 钟表键 | 缺键按 50 | 区间比较 | 已实现 |
| `flags` | 见 2.2 | 同事件级 | `evalFlags` | 已实现 |
| `random` | `>1` 按百分数 /100，`≤1` 按小数；`≥1` 必开 | 同事件级 | `rollRandom` | 已实现 |

### 2.2 flags 子键（JSON 实测集合）

| 子键 | 语义 | 状态 |
| --- | --- | --- |
| `has` | 所列票全部持有（AND） | 已实现 |
| `notHas` | 所列票全部不得持有 | 已实现 |
| `any` | 所列票任一持有（OR） | 已实现 |
| `all` | 别名同 `has`（JSON 未出现，代码保留兼容） | 已实现 |
| `some` | 别名同 `any`（JSON 未出现，代码保留兼容） | 已实现 |
| `none` | 别名同 `notHas`（JSON 未出现，代码保留兼容） | 已实现 |
| `minCount` | 所列票命中数 ≥ `min` | 已实现 |
| `since` | 持有票且 `turn - flagTurns[票]` 落在区间；缺记录容错放行 | 已实现 |
| `sinceAny` | 列表任一票达标即开；一张都没有 → 关；有票缺记录 → 容错放行 | 已实现 |

### 2.3 JSON 未出现、本版不实现的键

`faction / degree / identity / wealth / tags / identityType` 等在条件顶层未出现；
`faction` 仅作为票名子串出现，阵营判定走边界引擎专用分支，不进通用条件求值器。

## 3. 效果（effects）覆盖表

| 效果键 | 处理口径 | 状态 |
| --- | --- | --- |
| `attributes` | 正增量乘难度 `attributeMultiplier`，出身修正后四舍五入，裁剪 0..100；旧名经 `ATTR_MAP` 归一 | 已实现 |
| `hidden` | 只认 `道德值 / 欲望值 / 野心值`，裁剪 0..100；未知键忽略 | 已实现 |
| `gameState` | 五方态度 + 国势，出身修正后裁剪 0..100；持「潜逃」票时正面圣眷不涨 | 已实现 |
| `flags.add` | 去重（含列表内部去重），记 `flagTurns = 当前 turn` | 已实现 |
| `flags.remove` | 退票连带删除 `flagTurns` 记录 | 已实现 |
| `special.ending` | 标记结局触发 | 已实现 |
| `meritScore` | 选项显式声明的政绩加成，累计进 `meritBonus` | 已实现 |
| 阵营好感同步 | 阉党路线 / 复社成员 / 东林死忠 / 叛徒 / 两面三刀 / 主和派 随票与态度涨跌同步 | 已实现 |

## 4. 发牌对齐点（对照 Web `findAllEventsForState`）

月度分层次序（`EventPool.drawMonth`）：

1. **prelude 前奏**：`type=transition` 且 `isPreEnding=true`，一次性，优先于本月其他主戏；
2. **历史 / chain 一次性**：`type=historical | chain`，未播过；
3. **普通过渡补位**：无历史卡也无前奏时，`type=transition` 未播过；
4. **末班车过渡**：条件年窗 / 月窗下月即关的过渡卡同月追加；
5. **random 冷却填充**：本月无主戏时按冷却表取 `type=random`；
6. **支线**：`emotion` 一次性；`gray/character/national/faction` 可重复带冷却；支线无放回最多 2 张。

权重口径：

- 主层：同剧情线 6、前缀匹配 3、其余 1；
- 支线：同剧情线 4、其余 1；
- 剧情线回溯最近 8 条历史，取最近一条带 storyline 的事件线；
- 冷却表：`random 8 / gray 6 / character 6 / national 6 / faction 6 / emotion 12` 个月；
- 随机源为可注入 seeded `Random(seed)`，同种子序列可复现（单测钉住 20 个月序列一致）。

## 5. 结局判定与优先级

- 边界条目按 `priority` 升序，先命中先返回；`handwrittenCheck` 与 `compiledConditions` 两类。
- `compiledConditions`：条件烘在事件自身 `conditions` 上（年/月兜底地板导出时已烘入），标准求值器判定；再叠加对应 `customRules`。
- 自定义规则 `ending_famous_minister`：清流票命中数 ≥ `cleanMin(2)`，或宰辅 / 外任额外票任一持有，两支并列 OR。
- **可搁笔结局**：`event.declinable=true` 或事件 id ∈ `endings.declinableEndingIds`；只摆牌不结算，`gameOver` 不置位。
- 结局配置 `category / tier / preludeEventId` 随事件模型保留。

### 5.1 三条党派结局时间下限（逐条对照 `unportableRules` 描述）

| registryId | turn 下限 | 年份下限 | 其余硬条件 |
| --- | --- | --- | --- |
| `faction_donglin_martyr` | ≥ 36 | ≥ 1644 | 东林≥80、阉党≤20、持东林死忠或复社成员、清议≥60 |
| `faction_tyrant_fall` | ≥ 36 | ≥ 1637 | 阉党≥70、东林≤15、持叛徒且无阉党路线、道德值≤30（缺省 50） |
| `faction_sacrifice` | ≥ 36 | ≥ 1635 | 党争烈度≥90、\|东林−阉党\|<20、两派好感都 <40 |

> 修正记录：`faction_sacrifice` 初版误用 `constants.narrativeMinYear` 顶包，已改为固定 1635；
> 单测钉住 1634 不触发、1635 触发。

## 6. 贬官 15 条判据对照（Web `useGameEngine.ts:447-552` → Kotlin `RankService.checkDemotion`）

宽限期：`turn < DEMOTION_GRACE_TURNS(12)` 不判；持「潜逃」票不进考功名册。
15 条取最高 severity；severity ≥ 3 当场革职（identity=exiled），其余以 `previousScore` 档位为基准降 severity 级；新档须低于当前实际官阶才算真实贬官。

| # | Web 行号 | 判据 | severity | Kotlin 分支 |
| --- | --- | --- | --- | --- |
| 1 | 447-452 | 政绩分 < 当前官阶 minScore | 1 | `checkDemotion` 理由「政绩不佳」 |
| 2 | 453-463 | 道德值 ≤0 且持「归零警告·道德值」 | 3 | 理由「道德败坏」 |
| 3 | 464-469 | 圣眷 < 10 | 2 | 理由「帝心尽失」 |
| 4 | 470-475 | 理政 < 15 | 1 | 理由「政绩不佳」 |
| 5 | 476-492 | 贪墨暴露（财帛>70 且欲望>75 且道德<30）且持「革职预警·贪墨」 | 3 | `isCorruptExposed` + 理由「贪墨被查」 |
| 6 | 493-498 | 国势<25 且武略<30 且理政<40 | 2 | 理由「失职渎职」 |
| 7 | 499-504 | 文韬 < 25 | 1 | 理由「才疏学浅」 |
| 8 | 505-510 | 野心值>70 且圣眷<40 | 2 | 理由「结党营私」 |
| 9 | 511-516 | 士绅>75 且圣眷<25 | 2 | 理由「得罪权贵」 |
| 10 | 517-522 | 体质 < 15 | 2 | 理由「体弱多病」 |
| 11 | 523-528 | 财帛<15 且欲望>60 且道德<35 | 1 | 理由「财政亏空」 |
| 12 | 529-534 | 圣眷<30 且理政<40 | 1 | 理由「办事不力」 |
| 13 | 535-540 | 道德值<0 且清议>50 | 1 | 理由「清议不容」 |
| 14 | 541-546 | 民望<20 且圣眷<40 | 1 | 理由「言辞失当」 |
| 15 | 547-552 | previousScore − currentScore > 80 | 1 | 理由「政绩下滑」 |

## 7. 归零警告 → 死线结局链路

- 八条 `warn_zero_*` 危机：对应维度 ≤0 且身上还没有「归零警告·key」票 → 发警告卡；
  **判定里不手动 add flag**，flag 由警告事件自身选项结算写入，一生一次。
- 八条归零死线结局：过宽限期（turn≥12）+ 维度归零 + 已持对应警告票；`emperor_hate` 额外排除持「潜逃」票者。
- `warn_corruption`：turn≥12、未持「革职预警·贪墨」、财帛>70、欲望>75、道德<30（道德缺省 100）。
- 单测钉住：归零先出警告卡，持警告票后才出对应死线结局，不许跳过 warning 直接死。

## 8. 未移植清单

**当前未移植规则条数：0。** `unportableRules` 登记的 22 条手写闭包已全部在 Kotlin 显式移植：

- 8 归零死线：`bankrupt / death_illness / emperor_hate / eunuch_conspiracy / scholar_ostracism / gentry_rebellion / popular_uproar / moral_degeneracy`
- 2 低位危机：`serious_illness / inner_court_channel`
- 3 党派结局：`faction_donglin_martyr / faction_tyrant_fall / faction_sacrifice`
- 8 归零警告：`warn_zero_财帛/体质/圣眷/中官/清议/士绅/民望/道德值`
- 1 贪墨预警：`warn_corruption`

若后续新增无法移植的规则，`BoundaryEngine.unportedRules` 会显式登记 `registryId / reason` 并计数，禁止静默返回 false。

## 9. 存档

- `schemaVersion = 4`，与 Web `SaveData` 口径对齐；含角色 / 朝堂 / 履历 / 当前事件 / 待办队列 / 剧情线 / 政绩加成 / 政绩分 / 上回合政绩分 / 身份 / 难度。
- 写入：先写同目录临时文件，再原子替换目标文件；读档解析失败返回 null，不抛半截状态。
- 迁移分支占位：旧版本号升级逻辑留待后续，当前只做版本号落盘与缺键兜底。

## 10. 已知与 Web 的差异 / 未对齐项

1. **民望裁剪区间**：Web 部分路径民望理论区间 −100..100；原生 `gameState` 统一裁 0..100，未放开负向区间。
2. **failEffects / 投骰（已接线）**：可勉力一试的软门选项投 1..6，点数 ≥ difficulty 走原 effects/result；失败优先 `failEffects/failResult`，缺失时由 `FailFallback.deriveFailEffects` 按成功效果反推、`generateFailEcho` 生成同口径失败回音。硬门（出身/官阶/经历票/概率）永不掷骰。
3. **成就统计 / 履历流水**：`PlayerStats` 仅落 `eventCount`；成就判定、lifeRecords 裁剪未移植。悔棋（撤销）已在引擎内实现（见 11.8 注），但 Web 的「悔棋次数」计数本身未单独记录。
4. **多槽位存档（已实现）**：1 自动槽 + 3 手动槽，同目录不同文件名（`SaveSlots`）；跨标签序号守卫未移植。
5. **危机冷却表**：`serious_illness / inner_court_channel` 概率门 0.3 + 冷却 8 个月；警告类确定性触发，不走概率门。
6. **真机运行未验证**：本机无设备，APK 仅通过构建与 aapt 静态校验。

## 11. UI 接口清单（供 Compose 牌桌接线，字段以代码现状为准）

> 引擎不持有 Android UI；Compose 层持有一个 `GameEngine` 实例，状态变化后重新读取其公开属性即可。
> 数据就绪：`GameDataRepository.isLoaded()` / `GameDataRepository.get()`；Application 已在后台线程 prime。

### 11.1 构造与开局

```kotlin
val engine = GameEngine(data: GameData, seed: Long = 0L)
engine.newGame(
    playerName: String,
    originType: String,      // 取 data.origins[].type
    degree: String,           // 出身默认功名：origin.initialDegree（进士 / 举人）
    difficultyId: String,     // 取 data.difficulties[].id：easy / normal / hard
    bonusAttributes: Map<String, Double> = emptyMap()
)
```

- 开局后 `engine.currentEvent` 即第一张牌；`engine.state` 为整局状态。
- 静态选项表：
  - `data.origins: List<OriginConfig>`：`type / name / initialDegree / background / initialAttributes / initialGameState / features / playStyle`；
  - `data.difficulties: List<DifficultyConfig>`：`id / name / description`；
  - `data.ranks: List<RankConfig>`：`level / name / minScore / type`；
  - `data.storylines`、`data.flagGateLabels`、`data.flagMemoirs`、`data.endings.endingIds / declinableEndingIds`。

### 11.2 画面读取（HUD / 事件卡 / 抽屉）

| UI 区域 | 读取路径 |
| --- | --- |
| 年号 / 月 / 回合 | `state.court.currentYear`、`state.court.currentMonth`、`state.court.turn` |
| 姓名 / 年龄 / 出身 / 功名 / 官阶 | `state.character.name / age / origin / degree / rank` |
| 六项态度 | `state.court.圣眷 / 中官 / 清议 / 士绅 / 民望 / 国势` |
| 显性属性 | `state.character.attributes`（财帛 / 文韬 / 理政 / 武略 / 体质） |
| 隐藏属性 | `state.character.hidden`（道德值 / 欲望值 / 野心值） |
| 政绩分 / 上回合政绩 / 政绩加成 | `state.meritScore`、`state.previousMeritScore`、`state.meritBonus` |
| 阵营 / 党争 | `state.character.faction.东林好感 / 阉党好感 / 立场 / 党争烈度` |
| 经历票 | `state.character.flags`；持票回合 `state.character.flagTurns` |
| 履历（倒序由 UI 反转） | `state.character.history: List<String>`，每条「年月：事件 - 选项」 |
| 身份 | `state.identityType`（official / exiled / civilian） |

当前事件 `engine.currentEvent: GameEvent?`：

- `id / title / description / type / storyline`；
- `narrative: EventNarrative?`：`speaker.name / speaker.title / quote / background / situation`；
- `choices: List<EventChoice>`；
- `endingConfig: EndingConfig?`：`category / tier / preludeEventId`；
- `isPreEnding / linksToEndingId / declinable`。

### 11.3 选项可用性判定（结构化：开 / 锁 + 原因 + 难度）

```kotlin
val ctx = ConditionContext.from(engine.state.court, engine.state.character)
val avail: ChoiceAvailability = ConditionEvaluator.evaluateChoiceDetailed(
    choice, ctx, engine.random, gateLabels = engine.gateLabels()
)
// 布尔简写：ConditionEvaluator.evaluateChoice(choice, ctx, engine.random)
```

`ChoiceAvailability` 字段：

| 字段 | 含义 |
| --- | --- |
| `available` | 是否可点 |
| `reasonCode` | 机读原因码（可用为 `ok`），见下 |
| `reasonText` | 中文可读原因，直接给 UI 展示 |
| `conditionType` | 大类：stamina / attribute / gameState / hidden / flag / origin / rank / random |
| `conditionKey` | 命中的具体键（文韬 / 圣眷 / 票名…） |
| `difficulty` | 投骰难度 1..6；**硬门为 null**（不可勉力一试） |
| `gap` | 还差多少（数值门）；不可量化为 null |

原因码常量（`ChoiceAvailability.CODE_*`）：`ok / stamina_insufficient / attr_insufficient / attr_excessive / state_insufficient / state_excessive / hidden_insufficient / hidden_excessive / flag_missing / flag_forbidden / flag_too_new / origin_denied / rank_denied / random_roll`。

**判定顺序（硬门优先，不可被骰子绕过）**：先判硬门 `flags → origin → rank`，任一失败立即返回锁定且 `difficulty=null`；硬门全过后再判软门 `体质 → attributes → gameState → hidden`，这些才给 `difficulty`；最后概率门 `random`（不可投骰）。`difficulty != null` 只出现在软门失败上。

- 体质门：`staminaRequired > 0` 且 `attributes["体质"] < staminaRequired`；`staminaBonus` 为体质加成字段，模型已保留。
- 人话标签可查 `data.flagGateLabels`（`flag → line`）；概率门由引擎掷骰，UI 不自行抛随机数。
- 选项文案字段：`text / quote / description / storyline`；失败分支文案 `failResultDescription / failResult`。

### 11.4 抉择结算

```kotlin
// diceRoll 测试可显式指定点数；缺省由引擎随机源掷 1..6。
val outcome: ChoiceOutcome? = engine.chooseChoice(choiceId: String, diceRoll: Int? = null)
// ChoiceOutcome(
//   choiceId: String,
//   applied: AppliedEffects,
//   resultTitle: String?,
//   resultEcho: String?,
//   endingHit: BoundaryHit?,
//   diceRoll: Int? = null,        // 本次投骰点数；未走投骰为 null
//   diceSuccess: Boolean? = null, // 投骰成败；未走投骰为 null
//   usedFailEffects: Boolean = false // 是否走了失败分支（failEffects 或反推兜底）
// )
```

- 硬门（出身/官阶/经历票/概率）失败：`chooseChoice` 直接返回 `null`，不掷骰。
- 软门失败：掷骰 `1..6`，`roll >= difficulty` 成功走原 `effects/result`；失败优先 `failEffects/failResult`，缺失走反推兜底；`usedFailEffects=true`。

`AppliedEffects`（结算面板 chips 直接用，差值已裁过上下限、只含非零项）：

- `attributes: Map<String, Double>` 属性增减；
- `gameState: Map<String, Double>` 态度增减；
- `hidden: Map<String, Double>` 隐藏属性增减；
- `addedFlags: List<String>` / `removedFlags: List<String>`；
- `meritBonus: Double`、`endingTriggered: Boolean`。

结算文案：`outcome.resultTitle`、`outcome.resultEcho`；标签 `choice.result.tags`、回音 `choice.result.echo`；失败分支 `choice.failResult`。抉择后 `engine.lastOutcome` 保留最近一次结算。

### 11.5 推进月份 / 发牌

- `engine.advanceMonth()`：日历 +1 月（跨年进位）→ 年龄 +1/12 → 危机判定 → 结局判定 → 发下一张牌；`gameOver` 时空转。
- `engine.drawInitial()`：重抽开局第一张牌（一般只在开局调用）。
- 事件未抉择时是否可进下月：由 UI 依据「当前事件是否已出结算 / `lastOutcome` 是否对应当前事件」禁用；引擎 `advanceMonth` 不校验未抉择。

### 11.6 结局命中与可搁笔状态

- `engine.activeEnding: BoundaryHit?`：`registryId / eventId / event: GameEvent? / ported / declinable / unportedReason`。
- `state.gameOver: Boolean`：**非搁笔**结局结算后置 true；**可搁笔**结局 `declinable=true` 且 `gameOver=false`，只摆牌。
- 结局屏数据：`activeEnding.event` 的 `title / description / narrative / choices`；品级大类 `event.endingConfig.category / tier`；结局 id `activeEnding.eventId`。
- 搁笔选项在结局事件 `choices` 内（`c_decline`），其 settle 文案烘在 `choice.result / resultDescription`。
- 死亡 / 危机覆盖层一律用 `activeEnding` / `lastCrisis` 提供的引擎事件，UI 不自造文案。

### 11.7 存档 / 读档

```kotlin
val save: SaveData = engine.toSaveData()
// Path 与 File 两种重载都提供；写盘走临时文件 + 原子替换。
SaveSerializer.writeAtomic(target: Path, save) -> Boolean
SaveSerializer.writeAtomic(file: File, save) -> Boolean
val restored: SaveData? = SaveSerializer.read(target: Path)  // 或 read(file: File)
engine.restore(restored)
```

- 槽位登记 `SaveSlots`：`AUTO="auto"`、`MANUAL_1/2/3="manual1/2/3"`，`SaveSlots.all` 顺序即 UI 展示顺序；文件名 `SaveSlots.fileName(slot) = "save-$slot.json"`，同目录不同文件。
- 落盘目录由 Activity 传 app 私有目录（`filesDir`）；自动槽每回合写一次，手动槽由 UI 触发。
- 启动续玩：`SaveSerializer.read(...)` 非空 → `engine.restore(...)`；解析失败返回 null，不抛半截状态。
- **悔棋栈不持久化**：`restore()` 后撤销栈清空。
- `SaveData` 字段：`schemaVersion / savedAt / playerName / origin / degree / identityType / difficulty / character / gameState / eventHistory / currentEventId / pendingEventIds / lastTurnById / meritBonus / meritScore / previousMeritScore`。

### 11.8 引擎侧能力状态与残留缺口

已在引擎内实现（本轮收口）：

1. **撤销（悔棋）**：`engine.canUndo(): Boolean`、`engine.undo(): Boolean`。每次抉择前压一份深拷贝快照（序列化往返），撤销恢复到抉择前；支持连续多步（栈顶 20 步）。**撤销栈不持久化**：读档 / 新局后清空。
2. **锁闭原因结构化**：见 11.3 `evaluateChoiceDetailed`，原因码 / 中文文案 / 难度 / 差距逐条返回。
3. **failEffects / 投骰失败分支**：见 11.4，失败优先 failEffects，缺失走反推兜底。
4. **多槽位手动存档**：见 11.7，1 自动 + 3 手动槽。

残留缺口（未实现，UI 需自行兜底或登记）：

5. **结局图鉴解锁记录**：`endings.endingIds` 全量清单可用；已解锁记录（成就统计）未移植，引擎不保存「看过哪些结局」。
