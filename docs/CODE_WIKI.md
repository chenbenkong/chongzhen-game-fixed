# 崇祯直聘 — Code Wiki

> **项目名称**：崇祯直聘 — 官场沉浮模拟器
> **版本**：v0.2.0 Alpha
> **技术栈**：React 18 + TypeScript + Vite 5
> **项目类型**：单页面 Web 文字策略游戏

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [技术栈与依赖](#3-技术栈与依赖)
4. [目录结构](#4-目录结构)
5. [核心类型系统](#5-核心类型系统)
6. [主要模块职责](#6-主要模块职责)
7. [关键组件说明](#7-关键组件说明)
8. [事件系统](#8-事件系统)
9. [游戏核心逻辑](#9-游戏核心逻辑)
10. [数据层](#10-数据层)
11. [模块依赖关系](#11-模块依赖关系)
12. [项目运行与构建](#12-项目运行与构建)
13. [存档系统](#13-存档系统)

---

## 1. 项目概述

**崇祯直聘**是一款以明末崇祯年间（1628—1644）为背景的文字策略模拟游戏。玩家扮演一名新科进士，从正七品知县起步，在风雨飘摇的明末官场中做出抉择，经历历史事件、党争漩涡、军事危机和道德考验，最终走向不同的结局。

游戏的核心循环为：**查看事件 → 做出选择 → 属性变化 → 推进时间 → 触发新事件**，直到触发结局条件。

### 核心特色

- **历史事件驱动**：基于真实明末历史（1628—1644）设计事件链
- **多维度属性系统**：五大能力 + 三大隐藏属性 + 五方态度
- **丰富的事件类型**：历史事件、地方治理、情感线、灰色选择、派系斗争
- **多结局系统**：基于属性边界触发和叙事条件触发的双重结局机制
- **官职晋升体系**：18级明朝官制，政绩分驱动的升贬系统

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        App (根组件)                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ 标题画面  │→│ 姓名输入     │→│ 出身选择              │  │
│  └──────────┘  └──────────────┘  └───────────┬───────────┘  │
│                                              ↓              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   GameScreen (核心游戏界面)              ││
│  │  ┌──────────┐ ┌──────────────┐ ┌─────────────────────┐ ││
│  │  │ 左侧栏   │ │  中央事件区   │ │ 右侧栏              │ ││
│  │  │ 属性面板  │ │ EventDisplay │ │ 五方态度面板         │ ││
│  │  │ 官职面板  │ │              │ │ 国势面板             │ ││
│  │  │ 政绩面板  │ │              │ │                     │ ││
│  │  └──────────┘ └──────────────┘ └─────────────────────┘ ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │              ActionBar (操作栏)                      │││
│  │  │  [下一月] [家族] [人物] [存档]                       │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  弹窗层：RelationshipModal / FamilyPanel / CheatMode /       │
│         LifeReview / DeathEnding / SaveNotification /        │
│         ConfirmDialog / GameOverScreen                       │
└─────────────────────────────────────────────────────────────┘
```

### 数据流架构

```
用户选择 → handleChoice() → 更新 Character + GameState
                              ↓
                     检查边界事件 (BoundaryEventManager)
                              ↓
                     检查叙事结局 (checkNarrativeEndings)
                              ↓
                     检查升官/贬官 (checkPromotion / checkDemotion)
                              ↓
                     推进时间 → 触发新事件 (findAvailableEvent)
```

---

## 3. 技术栈与依赖

### 运行时依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| react | ^18.2.0 | UI 框架 |
| react-dom | ^18.2.0 | React DOM 渲染 |

### 开发依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| typescript | ^5.2.2 | 类型系统 |
| vite | ^5.0.8 | 构建工具 |
| @vitejs/plugin-react | ^4.2.1 | Vite React 插件 |
| @types/react | ^18.2.43 | React 类型定义 |
| @types/react-dom | ^18.2.17 | React DOM 类型定义 |

### TypeScript 配置

- **编译目标**：ES2020
- **模块系统**：ESNext
- **JSX**：react-jsx
- **严格模式**：开启
- **模块解析**：bundler

---

## 4. 目录结构

```
chongzhen-game/
├── index.html                    # 入口 HTML
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── tsconfig.node.json            # Node 环境 TS 配置
├── vite.config.ts                # Vite 构建配置
├── dist/                         # 构建输出
├── docs/                         # 设计文档
├── scripts/                      # 辅助脚本
└── src/
    ├── main.tsx                  # 应用入口
    ├── App.tsx                   # 根组件（游戏流程控制）
    ├── App.css                   # 全局样式
    ├── index.css                 # 基础样式
    ├── types/                    # 类型定义
    │   ├── game.ts               # 游戏核心类型
    │   ├── event.ts              # 事件系统类型
    │   └── boundaryEvent.ts      # 边界事件类型
    ├── data/                     # 游戏数据
    │   ├── origins.ts            # 出身数据
    │   ├── ranks.ts              # 官职体系
    │   ├── characters.ts         # 历史人物
    │   ├── examQuestions.ts      # 科举题目
    │   ├── boundaryEvents.ts     # 边界事件定义与注册
    │   ├── events/               # 事件数据目录
    │   │   ├── index.ts          # 事件汇总入口
    │   │   ├── types.ts          # 事件集合类型
    │   │   ├── historical/       # 历史事件（按年份）
    │   │   ├── transition/       # 过渡事件
    │   │   ├── local/            # 地方治理事件
    │   │   ├── character/        # 人物专属事件
    │   │   ├── emotion/          # 情感线事件
    │   │   ├── gray/             # 灰色选择事件
    │   │   ├── ending/           # 结局事件
    │   │   ├── faction/          # 派系事件
    │   │   └── nationalFortune.ts # 国运事件
    │   ├── events_endgame.ts     # 终局事件
    │   └── events_new_nodes.ts   # 新增事件节点
    ├── services/                 # 服务层
    │   └── BoundaryEventManager.ts # 边界事件管理器
    └── components/               # UI 组件
        ├── GameScreen.tsx        # 核心游戏界面
        ├── StatusBar.tsx         # 状态栏
        ├── AttributePanel.tsx    # 属性面板
        ├── StatusPanel.tsx       # 五方态度面板
        ├── EventDisplay.tsx      # 事件展示
        ├── ActionBar.tsx         # 操作栏
        ├── GameOverScreen.tsx    # 游戏结束界面
        ├── NameInput.tsx         # 姓名输入
        ├── OriginSelect.tsx      # 出身选择
        ├── DiceAnimation.tsx     # 骰子动画
        ├── CheatMode.tsx         # 作弊/调试模式
        ├── LifeReview.tsx        # 生平回顾
        ├── DeathEnding.tsx       # 死亡结局
        └── SaveNotification.tsx  # 存档通知
```

---

## 5. 核心类型系统

### 5.1 角色属性 ([game.ts](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/types/game.ts))

#### Attributes — 五大能力（0-100）

| 属性 | 说明 |
|------|------|
| 财帛 | 财富资源（抽象值，不等同银两） |
| 文韬 | 文学才华、谋略 |
| 理政 | 政务处理能力 |
| 武略 | 军事指挥能力 |
| 体质 | 身体健康 |

#### HiddenAttributes — 三大隐藏属性（0-100）

| 属性 | 说明 | 档位评价 |
|------|------|----------|
| 道德值 | 品德操守 | >75君子 / >50正直 / >25常人 / ≤25小人 |
| 欲望值 | 欲望程度 | >75强烈 / >50一般 / >25淡泊 / ≤25清心 |
| 野心值 | 权力野心 | >75勃勃 / >50有 / >25微 / ≤25无 |

#### GameStateValues — 五方态度 + 时间（0-100）

| 属性 | 说明 | 档位评价 |
|------|------|----------|
| 圣眷 | 皇帝态度 | >75圣宠 / >50受宠 / >25平常 / ≤25失宠 |
| 中官 | 宦官态度 | >75心腹 / >50亲近 / >25中立 / ≤25敌视 |
| 清议 | 清流评价 | >75东林 / >50清流 / >25孤立 / ≤25孤立 |
| 士绅 | 士绅态度 | >75拥戴 / >50支持 / >25中立 / ≤25反对 |
| 民望 | 百姓评价 | >75爱戴 / >50称颂 / >25平淡 / ≤25怨声 |
| 国势 | 大明国运 | 随时间自动衰减 |

#### FactionState — 派系状态

| 属性 | 说明 |
|------|------|
| 东林好感 | 东林党对玩家评价（0-100） |
| 阉党好感 | 阉党/权贵集团对玩家评价（0-100） |
| 立场 | 当前公开立场：东林/阉党/中间/未定 |
| 党争烈度 | 朝堂党争激烈程度（0-100） |

#### Character — 角色完整数据

```typescript
interface Character {
  name: string
  age: number
  origin: OriginType              // 出身
  rank: string                    // 官职
  degree: DegreeType              // 功名
  attributes: Attributes          // 五大能力
  hidden: HiddenAttributes        // 三大隐藏属性
  flags: string[]                 // 标记系统
  history: string[]               // 历史记录
  wives: Wife[]                   // 妻妾
  lovers: Lover[]                 // 恋人
  examHistory: ExamRecord[]       // 科举记录
  promotionCount: number          // 升迁次数
  demotionCount: number           // 贬官次数
  faction: FactionState           // 派系状态
}
```

### 5.2 事件系统类型 ([event.ts](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/types/event.ts))

#### GameEvent — 游戏事件

```typescript
interface GameEvent {
  id: string
  title: string
  description: string
  narrative?: EventNarrative       // 叙事结构
  conditions: EventConditions      // 触发条件
  choices: EventChoice[]           // 选项列表
  type: EventType                  // 事件类型
  endingConfig?: EndingConfig      // 结局配置
}
```

#### EventChoice — 事件选项

```typescript
interface EventChoice {
  id: string
  text: string
  quote?: string                   // 选项引言
  description?: string             // 选项描述
  showConditions?: EventConditions // 显示条件
  effects: EventEffects            // 效果
  result?: ChoiceResult            // 选择结果
  check?: DiceCheck                // 骰子检定
  staminaCost?: number             // 体质消耗
  staminaBonus?: number            // 体质奖励
}
```

#### EventType — 事件类型枚举

| 类型 | 说明 |
|------|------|
| normal | 普通事件（只触发一次） |
| historical | 历史事件（只触发一次，优先级最高） |
| random | 随机事件（可重复触发） |
| chain | 链式事件 |
| ending | 结局事件 |
| transition | 过渡事件（只触发一次） |
| gray | 灰色选择事件 |
| emotion | 情感线事件 |
| character | 人物专属事件 |
| national | 国运事件 |
| faction | 派系事件 |

#### EventConditions — 事件触发条件

```typescript
interface EventConditions {
  year?: { min?: number; max?: number }
  month?: { min?: number; max?: number }
  rank?: string | string[]
  origin?: string | string[]
  attributes?: LegacyAttributeConditions   // 属性条件
  hidden?: Partial<Record<keyof HiddenAttributes, { min?: number; max?: number }>>
  gameState?: LegacyGameStateConditions    // 状态条件
  flags?: { has?: string[]; notHas?: string[] }
  charactersAlive?: string[]
  charactersDead?: string[]
  random?: number
}
```

#### EventEffects — 事件效果

```typescript
interface EventEffects {
  attributes?: LegacyAttributes            // 属性变化
  hidden?: Partial<Record<keyof HiddenAttributes, number>>
  gameState?: LegacyGameState              // 状态变化
  flags?: { add?: string[]; remove?: string[] }
  nextEvents?: string[]                    // 后续事件
  special?: { type: 'death' | 'promotion' | 'imprisonment' | 'exile' | 'ending'; value: string }
  meritScore?: number                      // 政绩分变化
}
```

### 5.3 边界事件类型 ([boundaryEvent.ts](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/types/boundaryEvent.ts))

```typescript
interface BoundaryEvent {
  id: string
  priority: number                         // 优先级（数字越小越优先）
  check: (params: BoundaryEventCheckParams) => boolean  // 检查函数
  event: GameEvent                         // 触发的事件
  type: 'ending' | 'crisis'               // 类型
}
```

---

## 6. 主要模块职责

### 6.1 App.tsx — 游戏流程控制器

**职责**：管理游戏阶段流转（标题 → 姓名输入 → 出身选择 → 游戏进行），处理存档读取与删除。

**关键状态**：

| 状态 | 类型 | 说明 |
|------|------|------|
| phase | GamePhase | 当前游戏阶段 |
| playerName | string | 玩家姓名 |
| selectedOrigin | OriginType | 选择的出身 |
| finalDegree | DegreeType | 最终功名 |
| finalAttributes | Attributes | 初始属性 |
| loadSaveData | SaveData | 读取的存档数据 |
| hasSave | boolean | 是否有存档 |

### 6.2 GameScreen.tsx — 核心游戏逻辑

**职责**：游戏核心逻辑处理，包括事件触发、选择处理、属性计算、升官贬官、存档等。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `createInitialCharacter()` | 根据出身创建初始角色 |
| `checkEventConditions()` | 检查事件触发条件 |
| `findAvailableEvent()` | 查找当前可触发的事件 |
| `handleChoice()` | 处理玩家选择，更新所有属性 |
| `handleNextMonth()` | 推进到下一个月 |
| `handleContinue()` | 事件结束后继续 |
| `handleUndo()` | 撤销上一次选择 |
| `handleSave()` | 保存游戏到 localStorage |
| `checkBoundary()` | 检查边界事件 |
| `checkNarrativeEndings()` | 检查叙事结局 |
| `calculateMeritScore()` | 计算政绩分 |
| `checkPromotion()` | 检查是否升官 |
| `checkDemotion()` | 检查是否贬官 |
| `generateLifeSummary()` | 生成生平总结 |

### 6.3 BoundaryEventManager.ts — 边界事件管理器

**职责**：注册和检查边界事件（属性归零等极端情况触发的结局/危机事件）。

**关键方法**：

| 方法 | 说明 |
|------|------|
| `register(event)` | 注册单个边界事件 |
| `registerBatch(events)` | 批量注册边界事件 |
| `check(params)` | 按优先级检查所有边界事件 |
| `checkByType(params, type)` | 按类型检查边界事件 |
| `getAll()` | 获取所有已注册事件 |
| `get(id)` | 按 ID 获取事件 |

---

## 7. 关键组件说明

### 7.1 游戏界面组件

| 组件 | 文件 | 职责 |
|------|------|------|
| StatusBar | [StatusBar.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/StatusBar.tsx) | 顶部状态栏，显示时间、国势、角色姓名/年龄/官职/出身/功名，含幽灵模式入口 |
| AttributePanel | [AttributePanel.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/AttributePanel.tsx) | 左侧属性面板，条形图展示五大能力和三大隐藏属性 |
| StatusPanel | [StatusPanel.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/StatusPanel.tsx) | 右侧五方态度面板，显示圣眷/中官/清议/士绅/民望及国势 |
| EventDisplay | [EventDisplay.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/EventDisplay.tsx) | 中央事件展示区，包含叙事、选项、骰子检定、结果展示 |
| ActionBar | [ActionBar.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/ActionBar.tsx) | 底部操作栏，提供下一月/存档按钮 |

### 7.2 流程控制组件

| 组件 | 文件 | 职责 |
|------|------|------|
| NameInput | [NameInput.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/NameInput.tsx) | 姓名输入界面，支持手动输入和随机生成 |
| OriginSelect | [OriginSelect.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/OriginSelect.tsx) | 出身选择界面，展示八种出身及其初始属性 |

### 7.3 弹窗与辅助组件

| 组件 | 文件 | 职责 |
|------|------|------|
| GameOverScreen | [GameOverScreen.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/GameOverScreen.tsx) | 游戏结束界面，显示结局、历史评价、生平数据 |
| LifeReview | [LifeReview.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/LifeReview.tsx) | 生平回顾界面，时间线+总结+成就评价 |
| DeathEnding | [DeathEnding.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/DeathEnding.tsx) | 死亡结局界面，展示结局类型和回音 |
| CheatMode | [CheatMode.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/CheatMode.tsx) | 幽灵模式调试界面，查看事件/结局/模拟结果 |
| DiceAnimation | [DiceAnimation.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/DiceAnimation.tsx) | 骰子动画组件，展示检定过程 |
| SaveNotification | [SaveNotification.tsx](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/components/SaveNotification.tsx) | 存档成功通知弹窗 |

---

## 8. 事件系统

### 8.1 事件触发优先级

```
1. 边界事件 (BoundaryEventManager)  — 属性归零等极端情况
2. 叙事结局 (checkNarrativeEndings) — 基于属性条件的结局
3. 历史事件 (type: 'historical')    — 按年份触发，只触发一次
4. 过渡事件 (type: 'transition')    — 只触发一次
5. 随机事件 (type: 'random')        — 可重复触发，避免近期重复
6. 普通事件 (type: 'normal')        — 只触发一次
```

### 8.2 边界事件

边界事件在属性达到极端值时自动触发，优先级最高：

| ID | 优先级 | 触发条件 | 类型 |
|----|--------|----------|------|
| bankrupt | 1 | 财帛 ≤ 0 | ending |
| death_illness | 2 | 体质 ≤ 0 | ending |
| emperor_hate | 3 | 圣眷 ≤ 0 | ending |
| eunuch_conspiracy | 4 | 中官 ≤ 0 | ending |
| scholar_ostracism | 5 | 清议 ≤ 0 | ending |
| gentry_rebellion | 6 | 士绅 ≤ 0 | ending |
| popular_uproar | 7 | 民望 ≤ 0 | ending |
| moral_degeneracy | 8 | 道德值 ≤ 0 | ending |
| serious_illness | 10 | 体质 < 20 且 > 0 | crisis |
| faction_donglin_martyr | 15 | 东林好感≥80 且 阉党好感≤20 且 有东林flag | ending |
| faction_tyrant_fall | 16 | 阉党好感≥70 且 东林好感≤15 且 有叛徒flag | ending |
| faction_sacrifice | 17 | 党争烈度≥90 且 两派好感均低 | ending |

### 8.3 事件数据分类

```
events/
├── historical/          # 历史事件（按年份 1628-1644）
│   ├── 1628.ts          # 崇祯元年事件
│   ├── 1629.ts          # 己巳之变等
│   ├── 1630.ts          # 袁崇焕凌迟等
│   ├── ...
│   └── 1644.ts          # 甲申之变
├── transition/          # 过渡事件
│   └── 1628.ts
├── local/               # 地方治理事件
│   ├── judicial.ts      # 司法事件
│   ├── fiscal.ts        # 财政事件
│   ├── education.ts     # 教化事件
│   └── military.ts      # 军事事件
├── character/           # 人物专属事件
│   ├── wenTiren.ts      # 温体仁事件链
│   ├── yuanChonghuan.ts # 袁崇焕事件链
│   ├── eunuchs.ts       # 太监事件链
│   ├── qianQianyi.ts    # 钱谦益事件链
│   ├── shiKefa.ts       # 史可法事件链
│   └── wuSangui.ts      # 吴三桂事件链
├── emotion/             # 情感线事件
│   ├── wife.ts          # 正妻线
│   ├── concubine.ts     # 妾室线
│   ├── soulmate.ts      # 知己线
│   └── core.ts          # 核心情感事件
├── gray/                # 灰色选择事件
│   └── debauchery/      # 荒淫线
│       ├── seduction.ts # 诱惑事件
│       ├── trap.ts      # 陷阱事件
│       ├── spy.ts       # 间谍事件
│       └── ...          # 其他灰色事件
├── ending/              # 结局事件
│   ├── endings.ts       # 主线结局
│   └── debauchery/      # 荒淫结局
├── faction/             # 派系事件
└── nationalFortune.ts   # 国运事件
```

### 8.4 骰子检定系统

部分选项包含骰子检定（DiceCheck），需要通过属性检定才能成功：

```typescript
interface DiceCheck {
  attribute: string      // 检定属性
  difficulty: number     // 难度值
  reason: string         // 检定原因
  penaltyEffect?: EventEffects  // 失败惩罚
}
```

检定逻辑：`属性值 + 随机(1-100) >= 难度值` 则成功，否则触发惩罚效果。

---

## 9. 游戏核心逻辑

### 9.1 官职晋升体系

游戏采用 18 级明朝官制，以政绩分驱动升贬：

| 等级 | 官职 | 最低政绩分 |
|------|------|-----------|
| 1 | 从九品·司狱 | 0 |
| 2 | 正九品·主簿 | 50 |
| 3 | 从八品·县丞 | 100 |
| 4 | 正八品·照磨 | 150 |
| 5 | 从七品·判官 | 200 |
| 6 | 正七品·知县 | 250 |
| 7 | 从六品·通判 | 320 |
| 8 | 正六品·同知 | 390 |
| 9 | 从五品·知州 | 460 |
| 10 | 正五品·郎中 | 530 |
| 11 | 从四品·少卿 | 600 |
| 12 | 正四品·知府 | 670 |
| 13 | 从三品·侍郎 | 740 |
| 14 | 正三品·大理寺卿 | 810 |
| 15 | 从二品·布政使 | 880 |
| 16 | 正二品·尚书 | 950 |
| 17 | 从一品·少师 | 1020 |
| 18 | 正一品·太师 | 1100 |

### 9.2 政绩分计算

```typescript
function calculateMeritScore(character, gameState, baseScore = 280, eventType?, isImportant?): number {
  let score = baseScore
  // 学历加分：进士+60，举人+30
  // 属性影响：理政×1.5 + 文韬×0.8 + 武略×0.4
  // 态度影响：圣眷×1.0 + 民望×0.8
  // 重要事件额外+80
  return Math.floor(score)
}
```

### 9.3 贬官触发条件

贬官检查基于多个条件，按严重程度分级：

| 严重度 | 条件 | 示例 |
|--------|------|------|
| 3（革职） | 道德值<20 / 欲望>80且财帛>80 | 道德败坏/贪墨被查 |
| 2（降级） | 圣眷<10 / 野心>70且圣眷<40 | 帝心尽失/结党营私 |
| 1（降级） | 政绩分不足 / 体质<20 / 文韬<25 | 政绩不佳/体弱多病 |

### 9.4 国势衰减

国势随时间自动衰减，模拟明末国运衰退：

| 年份 | 每月衰减 |
|------|----------|
| 1636年前 | 0 |
| 1636-1639 | -1 |
| 1640-1642 | -2 |
| 1643年后 | -3 |

### 9.5 出身系统

八种出身影响初始属性和游戏特性：

| 出身 | 特点 | 核心加成 |
|------|------|----------|
| 寒门 | 高文韬低财帛，清议敏感 | 文韬+15%考试加成 |
| 缙绅 | 高财帛高理政，党争敏感 | 人脉网络初始3关系 |
| 没落世家 | 高武略高体质，文官歧视 | 军事事件+20%成功率 |
| 诗文清望 | 最高文韬，清流路线 | 文章/弹劾+25%成功率 |
| 胥吏 | 举人实缺，理政最高、文韬与清议最低 | 理政+15%、中官+15%，文韬-10%、清议-20% |
| 海商 | 财帛最高，士绅厚、圣心防 | 财帛+20%、士绅+15%，清议-20%、圣眷-10% |
| 罪臣之后 | 圣眷最低、清议高于士绅，一纸旧案随身 | 文韬+10%、清议+15%，圣眷-20%、士绅-10% |
| 军户 | 武略与体质最高，清议最难挣 | 武略+15%、体质+10%，清议-15% |

---

## 10. 数据层

### 10.1 历史人物数据 ([characters.ts](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/data/characters.ts))

游戏包含 55+ 位历史人物，分为 7 大类：

| 类别 | 人物数 | 代表人物 |
|------|--------|----------|
| 皇帝与皇室 | 6 | 崇祯帝、周皇后、太子朱慈烺 |
| 内阁与六部 | 9 | 温体仁、周延儒、杨嗣昌、史可法 |
| 军事将领 | 15 | 袁崇焕、吴三桂、洪承畴、孙传庭 |
| 言官与清流 | 7 | 钱谦益、刘宗周、张溥 |
| 太监 | 4 | 王德化、曹化淳、高起潜 |
| 农民军领袖 | 6 | 李自成、张献忠 |
| 清朝方面 | 8 | 皇太极、多尔衮 |

**关键查询函数**：

| 函数 | 说明 |
|------|------|
| `getCharacterById(id)` | 按 ID 获取人物 |
| `getCharactersByCategory(category)` | 按类别筛选 |
| `getCharactersByFaction(faction)` | 按派系筛选 |
| `getAliveCharacters(year)` | 获取某年存活人物 |
| `getInteractableCharacters(year)` | 获取可互动人物 |
| `getRelationLevel(relation)` | 获取关系等级描述 |
| `canInteractWith(character, relation, attrs)` | 判断是否可互动 |
| `getInteractCost(action)` | 获取互动消耗 |
| `getInteractResult(action, success)` | 获取互动结果描述 |

### 10.2 官职体系数据 ([ranks.ts](file:///c:/Users/moli/Desktop/Trae/chongzhen-game/src/data/ranks.ts))

完整的明朝官职体系，包含地方/中央/军事/言官/翰林院共 25+ 个官职。

**关键查询函数**：

| 函数 | 说明 |
|------|------|
| `getRankInfo(rankId)` | 获取官职信息 |
| `getLocalRanks()` | 获取所有地方官职 |
| `getPromotionOptions(currentRank)` | 获取可晋升路径 |
| `getRankDisplay(rankId)` | 获取品级显示文本 |
| `canPromote(currentRank, targetRank, attrs, state, flags, degree)` | 晋升条件检查 |

---

## 11. 模块依赖关系

### 11.1 组件依赖图

```
App
├── NameInput
├── OriginSelect
├── GameScreen
│   ├── StatusBar
│   ├── AttributePanel
│   ├── StatusPanel
│   ├── EventDisplay
│   │   └── DiceAnimation
│   ├── ActionBar
│   ├── GameOverScreen
│   ├── CheatMode
│   ├── LifeReview
│   ├── DeathEnding
│   └── SaveNotification
```

### 11.2 数据依赖图

```
GameScreen
├── data/events/index.ts          ← 所有事件汇总入口
│   ├── data/events/historical/   ← 历史事件
│   ├── data/events/transition/   ← 过渡事件
│   ├── data/events/local/        ← 地方治理事件
│   ├── data/events/character/    ← 人物专属事件
│   ├── data/events/emotion/      ← 情感线事件
│   ├── data/events/gray/         ← 灰色选择事件
│   ├── data/events/ending/       # 结局事件
│   │   └── data/boundaryEvents.ts ← 边界事件（结局子集）
│   └── data/events/faction/      # 派系事件
├── data/origins.ts               ← 出身数据
├── data/ranks.ts                 ← 官职体系
├── data/characters.ts            ← 历史人物
├── services/BoundaryEventManager.ts ← 边界事件管理器
└── types/                        ← 类型定义
    ├── game.ts
    ├── event.ts
    └── boundaryEvent.ts
```

### 11.3 属性名映射（旧→新兼容）

游戏经历了属性系统重构，保留了旧属性名到新属性名的映射：

| 旧属性名 | 新属性名 |
|----------|----------|
| 文辩 | 文韬 |
| 朝政 | 理政 |
| 帝心 | 圣眷 |
| 国势（状态） | 中官 |
| 派系立场 | 清议 |
| 百姓口碑 | 民望 |

---

## 12. 项目运行与构建

### 12.1 开发环境启动

```bash
cd chongzhen-game
npm install
npm run dev
```

启动后访问 Vite 开发服务器（默认 `http://localhost:5173`）。

### 12.2 构建生产版本

```bash
npm run build
```

构建流程：`tsc`（TypeScript 类型检查）→ `vite build`（打包输出到 `dist/`）。

### 12.3 预览生产版本

```bash
npm run preview
```

### 12.4 NPM Scripts

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | TypeScript 检查 + Vite 构建 |
| `npm run preview` | 预览构建结果 |

---

## 13. 存档系统

### 13.1 存档机制

- **存储方式**：`localStorage`，键名 `chongzhen_save`
- **存档数量**：仅支持单个存档位
- **自动检测**：启动时自动检测是否有存档

### 13.2 存档数据结构

```typescript
interface SaveData {
  character: Character        // 角色数据
  gameState: GameStateValues  // 游戏状态
  eventHistory: string[]      // 事件历史
  origin: OriginType          // 出身
  degree: DegreeType          // 功名
  playerName: string          // 玩家姓名
  identityType?: IdentityType // 身份类型
  lifeRecords?: LifeRecord[]  // 生平记录
  savedAt: string             // 存档时间（ISO 格式）
}
```

### 13.3 存档序列化说明

存档通过 `JSON.stringify` 序列化全部游戏数据为字符串，读档时再 `JSON.parse` 还原。所有事件、属性、状态都会跟随存档槽位一起保存。

> 注：本版本未引入 `Map` / `Set` 等不可 JSON 序列化的数据结构，无需做 Map 转换。

### 13.4 旧存档兼容

读档时自动将旧属性名映射到新属性名，确保旧版本存档可以正常加载。
