# 原生数据格式速查（game-data.json）

> 由 `scripts/export-native-data.ts` 从 `src/` 只读导出；校验见 `scripts/verify-native-data.ts`。
> 本文件是字段速查，完整语义以源码为准。当前快照：事件 494 / 结局 49 / 边界 58。

## 顶层字段

| 字段 | 说明 |
| --- | --- |
| `meta` | 导出元信息：schemaVersion、sourceVersion、counts、dedup（去重前后条数）、strippedFunctions（剥离的函数字段清单） |
| `constants` | 开局年、叙事地板年/月数、宽限期、潜逃/贪墨警告 flag、贪墨暴露阈值、归零维度表、平凡生活排除票 |
| `defaults` | `attributes` / `hidden` 初始默认值 |
| `origins` | 出身数组（initialAttributes / initialDegree / initialGameState 等原样保留） |
| `difficulties` | 难度配置数组；`defaultDifficulty` 为默认难度键 |
| `ranks` | 官阶表（name / minScore / 品级等，同 `RANKS`） |
| `storylines` | 剧情线注册表（key/name/intro/iconName/tone） |
| `flagMemoirs` | 履历文案：`{flag, line, group}` |
| `flagGateLabels` | 选项锁缺票人话标签：`{flag, label}` |
| `endings` | `aliasMap`（旧 id 别名）、`declinableEndingIds`（可搁笔结局）、`endingIds` |
| `events` | 全部事件（去重后），`origin: pool | ending`，`sources` 标注来源 |
| `boundaryEvents` | 边界规则登记：`registryId / priority / type / eventId / rule / kotlinSpecial` |
| `customRules` | 闭包条件的声明式登记（当前 1 条：ending_famous_minister） |
| `unportableRules` | 手写 `check` 闭包登记：`registryId / eventId / description / fields / reason / source`，需 Kotlin 专用实现 |

## 事件（events[]）字段

`id / title / description / type / narrative / conditions / choices / endingConfig / isPreEnding / linksToEndingId / storyline / declinable` 等原样保留；`choices[]` 含 `id / text / quote / description / effects / failEffects / showConditions / result / resultDescription / failResult / failResultDescription / storyline`。结局文案（含搁笔选项 `c_decline` 的 settle 文案）已烘进对应抉择的 `result` / `resultDescription`。

## 规则落点

- `rule.kind = compiledConditions`：标准条件求值器按 `event.conditions` 判定（年/月/turn/age/属性/隐藏/状态/出身/官阶/flags 各子键）。
- `rule.kind = handwrittenCheck`：原始 `check` 是手写闭包，语义与字段见同 `registryId` 的 `unportableRules` 条目，**不可**直接用标准 conditions 求值器跑。
- `customRules[0]`：清流票命中 ≥2 或宰辅/外任票任一，OR；票单与基数在 `params`。
