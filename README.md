# 崇祯 · 宦海浮沉模拟器

> 以明末崇祯朝（1628–1644）为舞台的文字向宦海人生模拟器。
> 从科举童生一路摸爬到朝堂大员，在党争、边患、天灾与流寇之间做出你的抉择，
> 最后由《青史》为你写下一卷。

<p>
  <a href="https://chenbenkong.github.io/chongzhen-game-fixed/">在线试玩</a> ·
  <a href="docs/STEAM_RELEASE.md">Steam 上架评估</a> ·
  <a href="docs/CODE_WIKI.md">代码结构</a> ·
  <a href="docs/事件设计指南.md">事件设计指南</a>
</p>

---

## 关于项目定位

本项目以 **Steam 商业发行的质量标准**为工程基准来打磨（可构建、可测试、可打包、
离线可运行、键盘可通关、存档可迁移）。

- ✅ 工程质量已对齐发布级要求，详见 **[docs/STEAM_RELEASE.md](docs/STEAM_RELEASE.md)**
- 📌 已知的遗留问题见 **[docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)**
- ⚠️ **内容合规**（成人向内容分级、非自愿性描写）需要项目所有者自行处置，
  这是上 Steam 的硬性阻断项，见 [docs/STEAM_RELEASE.md](docs/STEAM_RELEASE.md) §3.1

> **进入时不再有任何拦截**：早期版本有一道客户端口令门，早已删除；
> 首次进入时强制弹出的 8 页教程也已改为不自动弹出 ——
> 教程仍可随时按 `H` / `?` 打开（底栏的「问 帮助」按钮已隐藏），但不再是开局的前置步骤。
> 自动化测试与 CI 检查会守住这两点，防止回归。

---

## 项目简介

一款纯前端的历史题材角色扮演 / 人生模拟游戏（设计文档中的原名为「崇祯直聘」）。

游戏以真实的明末时间轴推进：从崇祯元年（1628）到崇祯十七年（1644），逐年逐月触发
历史事件与个人事件。玩家选定出身后取名、定字、择籍贯，先在科举体系里一级级考
（县试 → 府试 → 院试 → 乡试 → 会试 → 殿试），拿到功名后进入官场，在
**东林党 / 阉党 / 中间派**的党争夹缝中经营人际、处理政务、应对边关与灾荒，
同时被五种能力属性、五种隐藏心性、五方态度共同评判。

角色可能升迁、贬官、致仕、下狱乃至身死；国势也会随大势衰减。
游戏结束时会生成一份**生平回顾**与结局判定，收入八卷《结局图鉴》。

美术与排版走明式风格：深墨底（`#0A0807`）、羊皮纸色文字、金线点缀，
标题使用毛笔字体「马善政」，正文使用系统中文字体栈。

## 功能特性

### 角色与成长

- **八种出身**：寒门、缙绅、没落世家、诗文清望、胥吏、海商、罪臣之后、军户，各带不同初始属性、特色标签、专属支线与科举加成
- **取名系统**：姓名 + 表字（自动按姓名生成，可改）+ 籍贯（可填可随机）
- **科举系统**：六级考试 → 五等功名（童生 / 秀才 / 举人 / 贡士 / 进士）
- **官阶与政绩**：政绩分驱动升迁与**贬官**，记录升迁次数与贬官次数
- **三档难度**：简单 / 普通 / 困难，在标题屏选择，随存档保存

### 属性系统（全部 0–100）

| 分组 | 属性 |
| --- | --- |
| 个人能力 | 财帛、文韬、理政、武略、体质 |
| 隐藏心性 | 道德值、欲望值、野心值、**机敏值**、**忠诚值** |
| 五方态度 | 圣眷、中官、清议、士绅、民望（另有国势） |

- 党争状态独立建模：东林好感、阉党好感、公开立场、党争烈度
- 属性临界值会触发专门的「临界事件」
  （`boundaryEvents.ts` + `BoundaryEventManager`），详见
  [docs/属性临界值与游戏结束机制.md](docs/属性临界值与游戏结束机制.md)

### 事件系统

事件按类型分目录组织，规模较大（`src/data/events/`）：

| 目录 | 内容 |
| --- | --- |
| `historical/` | 1628–1644 逐年历史事件 + 历史人物事件 |
| `transition/` | 逐年过渡事件、序章、路线引导、1644 关键节点 |
| `gray/` | 灰色抉择事件（道德灰区的两难选择） |
| `emotion/` | 情感线事件（妻妾、红颜） |
| `origin/` | 出身专属事件 |
| `faction/` | 派系事件 |
| `ending/` | 结局事件 |

- 事件带条件判定（`eventConditions.ts`）、骰点动画与多分支后果
- 15 条故事线可推进：东林风云、边关狼烟、忠烈千秋、贪墨风云、林泉隐逸、
  商海浮沉、家业绵延、悬壶济世、中兴之梦、异闻怪谭、红颜相伴、灰色地带、
  权谋之术、天崩地坼、烟火人间

### 结局与档案

- **结局图鉴**按八卷分类收藏：仕林卷、忠烈卷、隐逸卷、贰臣卷、浮沉卷、朝局卷、个志卷、异闻卷
- **生平回顾**汇总出生、科举、升迁、贬官、婚姻、抉择、死亡等 `LifeRecord`
- **成就系统**内置 **100 个**成就定义 —— 正好卡在 Steam 单 App 的成就上限内，
  游戏内定义与 `desktop/steam.cjs` 的映射表由 `npm run check:steam` 逐条对拍
- **死亡结局**独立呈现

### 系统与体验

- **存档**：3 个手动槽 + 独立自动存档槽，带格式版本号与自动迁移
  （`SAVE_SCHEMA_VERSION`，旧存档读到即升级）
- **存档失败不再静默**：写入失败（配额满）与读取失败（存档损坏）都会在屏幕
  右上角给出可读提示，而不是只往 console 里写一条日志 ——
  写失败时自动存档可能没存上，读失败时「继续上次游戏」按钮会消失，
  这两种以前都会被玩家当成"闪退 / 丢档"。
- **读档不会白屏**：`migrateSave` 对 `character` 的**每一个**字段都做兜底
  （含 `attributes` 与 `hidden`），任何畸形存档要么被安全拒绝、要么被修复，
  不会在渲染第一帧抛异常。详见 [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) 二点五。
- **排版基准**：全局字号由 `html { font-size }` 统一控制（当前 **18px**），
  各组件用 rem 排版，改这一个值即可整体缩放。实测事件正文 **17.1px**、
  选项标题 **17.6px**、选项描述 **15.8px**（此前分别为 12.8 / 13.6 / 12px）
- **版面吃满视口**：主玩法是"状态栏 / 剧情线 / 事件区 / 操作栏」的定高骨架，
  事件区与侧栏各自内部滚动 —— 消除了此前 1440×900 下页面底部 183px 的空档，
  也保证「进 下 月」在任何桌面分辨率下都无需滚动即可点击
- **BGM**：内置背景音乐，带上下文、开关与加载失败提示
- **新手教程 / 帮助**：`TutorialModal`，可由标题屏或游戏内随时打开，
  **首次进入不再自动弹出**
- **错误边界**：崩溃时给出可操作的恢复界面，而不是白屏
- **移动端适配**：`viewport-fit=cover` + `env(safe-area-inset-*)`，
  覆盖 218px 到 1920px 共 13 档视口 × 标题屏/主玩法两屏的布局回归测试
- **可访问性**：所有对话框统一使用 `useModal` 钩子
  （`role="dialog"` / `aria-modal` / ESC / Tab 焦点环 / 焦点归还 / 滚动锁定），
  核心玩法可纯键盘完成，事件与结算通过 `aria-live` 播报
- **无障碍偏好**：完整支持 `prefers-reduced-motion`（含 `animation-delay`）
  与 `prefers-contrast`
- **PWA**：可安装，含 maskable 图标与 manifest
- **首屏兜底**：启动占位层独立于 `#root`，并带 20 秒失败兜底界面
- **听天由命**：选项列表下方的随机选择入口，从**可选**的选项中随机挑一个
  （锁定项不会被选中），供选择困难时使用
- **统一推进入口**：底部主按钮**不再是死 UI**。此前它只在 `!currentEvent` 时可点，
  而几乎每个月都会生成事件，实测正常游玩 120 步它的可点状态出现 **0** 次 ——
  玩家看到的是一个长期灰掉、看起来像坏了的主按钮，必然当成 bug。
  现在按真实语义判断：

  | 当前状态 | 主按钮 | 行为 |
  | --- | --- | --- |
  | 无事件 | `进 下 月`（可点） | 进入下一个月 |
  | 有事件、**未抉择** | `进 下 月`（禁用） | 必须先做抉择，否则等于可以跳过 |
  | 有事件、已抉择 | `下 一 件`（可点） | 处理下一个待办事件 |

  未抉择时按钮旁常驻显示原因「请先在事件面板中做出选择」。
  措辞刻意不说"点『继 续』"—— 因为此刻那个按钮**还不存在**
  （它只在结果态渲染），早期版本正因为这句不准确的提示，
  让人误以为界面缺了个按钮。
- **键盘快捷键**（`useGameShortcuts` + `isTypingTarget`）：
  `1–9` 选选项、`Space`/`Enter` 推进、`S` 存档、`A` 成就、`H`/`?` 帮助。
  选项左侧常驻序号徽标，快捷键与"点第几个"始终对应，不会按错。
  三道闸门保证不误触：**正在输入**（取名/填 Key/富文本 `contenteditable`）、
  **弹窗打开**、**结算中/幽灵模式**时不响应游戏快捷键，
  也不拦截 `Ctrl`/`Alt`/`Meta` 组合。
  此前 README 声称"核心玩法可纯键盘完成"，实际只有 Tab + Enter，
  事件一多就得按几十次 Tab。
- **调试面板「幽灵模式」**：状态栏右上角的入口，可改属性、跳年份，
  并浏览全部事件与全部结局。默认值由**构建模式**决定：
  - `npm run build`（GitHub Pages 演示站、本地开发）→ **默认开启**
  - `npm run build:steam`（Electron / Steam 发行物）→ **默认关闭**

  两者都不需要改代码，也不会出现"忘了改回来"的事故。
  另外 `?debug=0` / `?debug=1` 可临时覆盖（会记住选择）。

### AI 增强（可选，需自备 API Key）

- **谋士对谈**（`AIAdvisor` + `services/aiService.ts`）：把当前年月、身份、
  属性、局势摘要作为上下文交给大模型，扮演谋士与你商议
- **场景插图生成**（`ImageGenerator` + `services/imageService.ts` +
  `eventPromptGenerator.ts`）：为事件自动生成配图提示词并调用文生图接口
- Key 读取优先级：`localStorage.chongzhen_ai_apikey` → 构建期环境变量
  `VITE_AI_API_KEY`；未配置时相关入口不可用，**主线游戏完全不受影响**

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 18（StrictMode） |
| 语言 | TypeScript 5（`strict` + `noUnusedLocals`） |
| 构建 | Vite 5 + `@vitejs/plugin-react` |
| 样式 | 原生 CSS（CSS 变量主题，按组件拆分 `.css`） |
| 压缩优化 | terser + lightningcss |
| 字体 | `@fontsource/ma-shan-zheng` 自托管（子集化 woff2，离线可用） |
| 持久化 | `localStorage`（带 schema 版本与迁移） |
| 桌面端 | Electron + electron-builder（见 `desktop/`） |
| Steam 接入 | steamworks.js，带完整 mock 驱动（无 AppID 也能跑） |
| 测试 | vitest（**90 例**）+ Playwright（真实 Chromium 冒烟、9 档视口 × 两屏布局回归、崩溃压力、存档模糊、内存检查） |
| 部署 | GitHub Actions → GitHub Pages |

## 目录结构

```
chongzhen-game/
├── index.html                    # 入口：启动占位层、PWA/SEO 元信息（无口令门）
├── src/
│   ├── main.tsx / App.tsx        # 应用入口 / 顶层流程（标题→取名→择出身→主玩法）
│   ├── App.css / index.css / theme.css
│   ├── assets/                   # 随包美术资源（由 Vite 加 hash 输出）
│   ├── components/               # 约 30 个组件（各配同名 CSS）
│   │   ├── TitleScreen / NameInput / OriginSelect      # 开局流程
│   │   ├── GameScreen / EventDisplay / ActionBar       # 主玩法
│   │   ├── AttributePanel / StatusBar / StatusPanel / StorylineBar
│   │   ├── SaveSlotsModal / SaveNotification           # 存档
│   │   ├── AchievementPanel / AchievementUnlock        # 成就
│   │   ├── EndingCodex / GameOverScreen / DeathEnding / LifeReview
│   │   ├── AIAdvisor / ImageGenerator                  # AI 功能（懒加载）
│   │   ├── BGM / BGMContext / DiceAnimation / Icon
│   │   └── TutorialModal / CheatMode / ErrorBoundary / ConfirmDialog ...
│   ├── data/
│   │   ├── events/               # 事件库：historical/transition/gray/emotion/origin/faction/ending
│   │   ├── origins.ts            # 八种出身
│   │   ├── storylines.ts         # 15 条故事线
│   │   ├── boundaryEvents.ts     # 属性临界事件
│   │   └── boundaryEventCompiler.ts
│   ├── hooks/
│   │   ├── useGameEngine.ts      # 核心游戏引擎（回合推进、事件调度、结算、存档）
│   │   ├── useModal.ts           # 统一的对话框无障碍行为
│   │   └── useConfirm.tsx
│   ├── services/
│   │   ├── aiService.ts / imageService.ts / imageStorage.ts
│   │   ├── eventPromptGenerator.ts / BoundaryEventManager.ts
│   │   └── desktopBridge.ts      # 桌面端（Electron/Steam）桥接
│   ├── types/                    # game / event / save / achievement / difficulty / boundaryEvent
│   └── utils/                    # endingSystem / eventConditions / naming / constants
│                                 # version / debug / motion / performance
├── public/
│   ├── bgm.mp3                   # 背景音乐（⚠️ 商用授权待确认）
│   ├── icons/                    # PWA 图标（脚本生成，见 scripts/generate-icons.py）
│   ├── manifest.webmanifest
│   ├── og-image.png              # 社交分享卡（1200×630）
│   ├── robots.txt / sitemap.xml
├── desktop/                      # Electron + Steamworks（独立子工程，见其 README）
├── tests/
│   ├── unit/                     # vitest 单元测试（引擎行为契约）+ 测试助手与 jsdom 环境兜底
│   ├── smoke.mjs / layout.mjs    # Playwright 冒烟与 9 档视口布局回归（独立子工程）
│   └── font-check.mjs            # 自托管字体分片加载诊断
├── scripts/
│   ├── audit-events.ts           # 事件审计
│   ├── audit-narrative-quality.ts
│   ├── validate-events.ts        # 事件校验
│   ├── generate-icons.py         # PWA 图标生成（仅依赖 Pillow）
│   ├── verify_bgm*.{py,cjs}
│   └── legacy/                   # 历史内容迁移脚本（保留以追溯）
├── docs/
│   ├── STEAM_RELEASE.md          # ★ Steam 上架评估与阻断项
│   ├── CODE_WIKI.md              # 代码结构说明
│   ├── 事件设计指南.md
│   ├── 属性临界值与游戏结束机制.md
│   ├── 崇祯直聘_完整游戏设计文档_V3_属性系统统一版.md
│   └── events_with_echo.md / 灰色事件完整回音文档.txt
└── .github/workflows/deploy.yml  # Pages 自动部署
```

## 本地运行

**前置要求：** Node.js **22.22.2 以上**（CI 使用 Node 24）

> 为什么下限这么高：单元测试依赖链是 jsdom@30 → undici@8.11.2，
> 后者会执行 
equire('node:worker_threads').markAsUncloneable，
> 而该 API 自 **Node 22.19** 才存在。在更早的 Node 上它是 undefined，
> 于是加载期直接抛 TypeError: webidl.util.markAsUncloneable is not a function，
> 整步测试失败。
>
> 这不是理论风险：2026-10-03 之后连续三次部署就是这样失败的，
> 导致 GitHub Pages 静默停留在旧版本。
> 跑 
pm run check:node 可以在本地立刻发现版本不满足。

```bash
npm install          # 安装依赖
npm run check:node   # 校验 Node 版本是否满足依赖的 engines 要求
npm run dev          # 启动开发服务器（http://localhost:5173）
npm run typecheck    # 仅做类型检查
npm run build        # 类型检查 + 生产构建（输出到 dist/，调试面板默认开启）
npm run build:steam  # 发行构建（同上，但调试面板默认关闭）
npm run preview      # 本地预览构建产物（http://localhost:4173）
```

### 运行测试

测试分两层，互不依赖。

#### 1. 单元测试（vitest + jsdom）—— 秒级，CI 必跑

覆盖核心游戏引擎（`useGameEngine`，约 1900 行）的行为契约：读档恢复、升迁/贬官判定、
临界事件调度、存档往返等。

```bash
npm run test:unit          # 跑一次
npm run test:unit:watch    # 监听模式
npm run typecheck:test     # 单独检查 src + tests/unit 的类型
```

> 环境提示：Node 22+ 内置了实验性的 `localStorage` 全局，Node 26 默认开启，
> 且在没有 `--localstorage-file` 时返回 `undefined`，会把 jsdom 的实现覆盖掉，
> 表现为引擎一读存档就抛 `Cannot read properties of undefined (reading 'getItem')`。
> `tests/unit/setup.ts` 已装了一个符合 Storage 规范的内存实现来兜底，
> 因此不需要额外传 Node 启动参数。

#### 2. 端到端测试（Playwright + 真实 Chromium）—— 独立子工程

放在 `tests/` 下自成一体，这样 GitHub Pages 的 CI 不必下载浏览器。

```bash
# 终端 1：构建并起预览服务
npm run build
npm run preview

# 终端 2
cd tests
npm install
npx playwright install chromium   # 首次需要下载浏览器
npm test                          # 冒烟：口令门移除 / 启动 / 字体 / 难度 / 开局 / 存档 / 无报错
npm run test:layout               # 9 档视口 × 标题屏+主玩法：横向溢出 / 关键控件是否在视口内
node font-check.mjs               # 自托管字体的分片按需加载诊断
node store-assets.mjs             # 生成 Steam 商店页物料到 store-assets/
```

根目录也有等价脚本：`npm run test:e2e` / `test:layout` / `test:crash` / `test:fuzz` / `test:mem`。

**三个稳定性脚本**（排查"闪退"时加的，可重复执行）：

| 脚本 | 查什么 |
| --- | --- |
| `npm run test:crash` | 乱按压力测试：三连击选项与推进、结算中点别的、反复开关每个弹窗、存档往返、**localStorage 写满后继续玩**、中途刷新。判定口径：未捕获异常 / ErrorBoundary / 白屏 |
| `npm run test:fuzz` | **37 个畸形存档**逐一加载（缺字段、null、字符串、超长、含已删除的成就 id、非法 JSON）。曾经抓出读档白屏 |
| `npm run test:mem` | 60 次弹窗开关后的堆占用；不同长度 `eventHistory` 下的帧间隔 |
| `npm run test:deadend` | **死锁检查**：每次状态转换后断言至少存在一个可推进入口（选项 / 骰子 / 继续 / 下月）。曾用它确认「所有选项锁定」的事件有骰子兜底，不会卡死 |
| `npm run test:ux` | **交互契约**（13 项）：主按钮三种状态的可用性与文案、禁用提示不得指向不存在的按钮、数字键能选选项、Space 能推进、底栏无重复的「丹青」入口而事件面板内仍有、序号徽标存在、输入框内数字键不被截走、纯键盘连玩 40 步无死锁、全程 0 未捕获错误 |

也可以直接对着线上地址跑：

```bash
cd tests && BASE_URL=https://chenbenkong.github.io/chongzhen-game-fixed/ npm test
```

### Steam 相关检查

```bash
npm run check:steam    # 成就映射表与 achievement.ts 逐条对拍 + 不超过 Steam 上限 100
```

这一项抓到过一个真实缺陷：曾有 5 个结局成就只补进了游戏内、漏了 Steam 侧登记，
而当时的断言只比对两个手写常量（都是 105），完全看不出来。
现在改为直接解析源码对拍，三种漂移（缺、多、数量超限）都会失败。

### 生成 Steam 商店页物料

```bash
npm run build && npm run preview      # 终端 1
cd tests && node store-assets.mjs     # 终端 2
```

按 Steamworks 后台的精确尺寸产出胶囊图、页面背景、库页面横幅与 5 张 1920×1080 截图，
并生成 `store-assets/README-STORE.md` 说明每张图对应后台哪个栏位。
产物已 gitignore（8.8 MB 二进制，可随时重新生成）。

> ⚠️ 这些是**尺寸合规的占位物料**，用于先把后台配置流程跑通。
> 正式发行前请美术重做封面与截图 —— 商店页首图直接决定点击率。

### 桌面版（Electron）

```bash
npm run desktop:install  # 安装 desktop/ 的依赖
npm run desktop:dev      # 开发运行
npm run desktop:dist     # 产出安装包（Windows NSIS / Linux AppImage / macOS dmg）
```

`desktop:dist` 会先自动执行 `npm run build:steam`（`predist` 钩子），
所以发行物里「幽灵模式」调试面板**默认关闭** —— 它能浏览全部结局（含未解锁剧透），
商业发行不允许默认暴露。演示站用普通 `npm run build`，面板默认开启。

详见 [desktop/README.md](desktop/README.md)。**注意：安装包尚未在真实机器上产出并验收过。**

### 重新生成 PWA 图标

```bash
python scripts/generate-icons.py
```

仅依赖 Pillow，会自动从候选列表里挑选可用的中文字体。

### 配置 AI 功能（可选）

两种方式任选其一：

1. **运行时配置**：在游戏内「谋士对谈」面板填入 API Key，会存到
   `localStorage.chongzhen_ai_apikey`
2. **构建期注入**：根目录新建 `.env.local`

```bash
echo "VITE_AI_API_KEY=你的_API_KEY" > .env.local
```

> 不配置也能完整通关，仅「谋士对谈」与「场景插图生成」不可用。

## 在线演示

https://chenbenkong.github.io/chongzhen-game-fixed/

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会执行构建并发布到 Pages；
AI Key 通过仓库 Secret `VITE_AI_API_KEY` 注入（未设置则线上 AI 功能不可用）。

> 本仓库是 [chenbenkong/chongzhen-game](https://github.com/chenbenkong/chongzhen-game)
> 的修复分支：原仓库保持只读、未接收任何推送。
> 六轮缺陷整改的完整清单（含每条缺陷的表现与回归测试）见
> [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)。

## 说明 / 备注

- **纯前端单机游戏**：没有服务端与账号系统，进度全部存在浏览器 `localStorage`。
  清理浏览器数据或换设备会丢失存档。桌面版提供了文件存档接口，但**游戏内尚未接入**。
- **进入时没有任何拦截**：客户端口令门已删除；首次进入强制弹出的教程
  也已改为不自动弹出（见 `useGameEngine` 里 `showTutorial` 处的注释）。
  两者都有自动化测试防止回归。
- **调试面板「幽灵模式」**：默认值由构建模式决定 —— 演示站开启、发行物关闭，
  无需改代码。`?debug=0` / `?debug=1` 可临时覆盖。
- **成就数 100**：正好等于 Steam 单 App 上限。原来是 110 个（且其中 5 个漏了
  Steam 侧登记），裁剪过程与理由见 `achievement.ts` 里 `RETIRED_ACHIEVEMENT_IDS`。
- **AI 功能会消耗第三方额度**：谋士对谈与插图生成依赖外部 OpenAI 兼容接口。
  插图生成单次通常需要 30–120 秒（客户端超时设为 120s）。
- **历史内容以叙事为主**：事件基于明末史实改编，但为了游戏性做了简化与虚构，
  不应作为史料参考。
- **字体**：标题字体随包自托管；正文使用系统中文衬线栈，不拉取网络字体，
  离线与首次渲染表现都更好。
- **内容分级**：项目包含成人向内容，**且含非自愿性描写**。
  这是上 Steam 的硬性阻断项，必须先处置 —— 见
  [docs/STEAM_RELEASE.md](docs/STEAM_RELEASE.md) §3.1。

## 许可

代码部分未声明开源许可。**第三方素材（背景音乐、美术）的授权状态需要项目所有者确认**
后才能用于任何形式的商业发行。
