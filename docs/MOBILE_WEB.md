# 手机横屏 Web 版（v0.5.0 第一版）

桌面浏览器走原版三栏布局；手机自动进入独立的横屏牌桌；`?mobile=1` 可强制预览，`?mobile=0` 可强制回桌面版。

## 入口规则（`src/mobile/detect.ts`）

1. `?mobile=1` → 手机版；`?mobile=0` → 桌面版（最高优先级，调试/验收用）。
2. 否则三条同时成立才判手机：移动 UA（iPhone / Android / Mobile 等）、`pointer: coarse`、视口短边 ≤ 520px。
3. 桌面 UA 一律不进手机版（防止桌面触屏设备误判）。

## 文件与用途

| 文件 | 用途 |
| --- | --- |
| `src/mobile/detect.ts` | 入口检测，只读浏览器特征，无副作用 |
| `src/mobile/MobileShell.tsx` | 横屏壳：竖屏遮罩、首次手势尝试全屏+`screen.orientation.lock('landscape')`（try/catch，失败给降级文案，不假装成功）、`body.mobile-applied` 作用域开关 |
| `src/mobile/MobileApp.tsx` | 阶段机：标题 → 取名 → 出身 → 牌桌；存档/难度/成就口径复用既有工具 |
| `src/mobile/MobileTitle.tsx` | 标题、开始、继续上次、难度三选 |
| `src/mobile/MobileNameSetup.tsx` | 姓/名/字/年岁同一排，籍贯 + 随机抽同排，两个按钮同排；不重复预览、返回键移到标题行 |
| `src/mobile/MobileOriginSetup.tsx` | 出身卡网格；默认只露名称/官阶/「详情·选此」，背景、标签、玩法与五围默认收起，属性用紧凑值块 |
| `src/mobile/MobileBoard.tsx` | 牌桌：顶部 HUD（六项朝堂状态 + 五项个人能力第二排 + 可开合人物面板）+ 中央事件区（**复用 `EventDisplay`**）+ 默认收起的底部操作条 + 结局/死亡/回顾宿主 |
| `src/mobile/mobile.css` | 全部选择器限定在 `.mobile-shell` / `.mobile-board` / `body.mobile-applied` 下，无全局覆盖 |
| `tests/mobile-web.mjs` | 入口四规则 + 牌桌最小可用性的浏览器冒烟（退出码即结论） |
| `tests/mobile-onboarding.mjs` | 标题/取名/出身三屏的几何断言 + 四张开局截图 |

## 复用与边界

- **复用**：`useGameEngine`（同一套引擎与事件数据）、`EventDisplay`（事件卡与抉择/结算/投骰，原样复用，只加 `.mobile-event-host` 作用域样式）、`data/origins`、`utils/naming`、存档与难度工具、结局/回顾组件。
- **不复制**：没有第二套玩法规则、没有第二套条件判定。
- **桌面零改动**：`src/App.css`、`src/components/*.css`、`src/components/GameScreen.tsx`、`src/components/EventDisplay.tsx` 均 0 改动；`src/App.tsx` 只新增入口检测、`MobileAppLazy` 懒加载与一段条件渲染分支，桌面 render 逐字未动。

## 懒加载边界

`MobileApp` 与桌面 `GameScreen` 同一条分包线：`const MobileAppLazy = lazy(() => import('./mobile/MobileApp'))`，只在 `detectMobileMode()` 为真时挂 `<Suspense>`。桌面标题屏不会因为手机版存在而预取游戏主包（`MobileApp-*.js` 是独立分片）。

## 手机重排：操作条可收起 + 正文字号缩小（2026-11-17）

- **底部操作条默认收起**：`.mobile-actionbar` 从常驻底栏改为绝对定位浮层；收起时不占底部空间，
  只在顶部 HUD 右侧渲染一个 44px 高的 `.mobile-hud__action`（「☰ 操作」+ 待办角标）。
  点开才从底部浮出「标题 / 撤销 / 存档 / 继续或进下月 / ×」，任一操作执行前先关闭浮层。
- **字号手机化**：覆盖只作用于 `.mobile-event-host`，桌面 `EventDisplay.css` 0 改动：
  正文 `.narrative-paragraph` 0.72rem / 1.5 行高（924dp 宽实测 13.0px），引语 0.74rem，
  事件标题 1.25rem，选项标题 0.78rem，选项说明 0.7rem。
- **触控**：顶栏入口 92.5×44.0px；展开后 5 个按钮最小边 44.0px；操作条固定 56px 高。
- **不挤压事件区**：操作条是 `position:absolute`，不参与 flex 高度分配；收起态没有任何底部覆盖，
  事件区拿到整块高度。

## 选项不再埋在正文底部（2026-11-17）

手机上事件正文一长，四个选项就被顶到屏外，玩家得反复下滑才能选。现在：

- 事件卡右上角固定「选项 N」入口：不随正文滚动，随时在顶部。
- 点开后把 `choices-section` 提升为全屏抉择面板，4 个选项一次看全，**844×390 实测无需任何滚动**；
  更多选项才在面板内部滚动，而不是让人先划过整篇叙事。
- **正文底部不再重复铺选项**：收起态 `choices-section` 为 `display:none`，正文读完直接点右上角「选项 N」。
- 选项仍复用 `EventDisplay` 原有卡片、锁定判定、骰子按钮与 `onChoice` 流程，逻辑零改动；只改手机上的位置。
- 事件标题下的「本月尚有 N 个事件待处理」重复行已删，数字保留在顶栏「操作」右侧角标。

## 人物面板：财帛等参数补回（2026-11-17）

手机 HUD 原先只放六项朝堂态度，个人能力整块缺失。现在：

- **默认收起**：顶栏「面板」按钮打开右侧抽屉，遮罩 / × 收起；点「操作」时面板自动关闭，两者不叠。
- **能力页**：复用桌面 `AttributePanel` 的数值逻辑，但手机作用域样式把它压成 **三列紧凑格子**，
  每格只留「名目 + 数值」，隐藏属性再加评语；横条、长轨道全部隐藏。含 **财帛 / 文韬 / 理政 / 武略 / 体质** 与
  **道德值 / 欲望值 / 野心值 / 机敏值 / 忠诚值**，10 项一屏装下。
- **态度页**：复用 `StatusPanel` 数据，同样压成三列格子；五方态度 + 国势六项一屏看完，
  国势不再画横向长条。
- **卷宗页**：`lifeRecords` 最近 30 条履历，标题 + 正文。
- **速览**：HUD 在六项朝堂状态下面新增第二排，完整排开 **财帛 / 文韬 / 理政 / 武略 / 体质**
  五项个人能力，数值直接取 `character.attributes`，与「圣眷」左对齐。原先身份栏的
  「财帛 N · 体质 N」文字速览已删除，避免重复占行。

## 开局三屏：取名 / 出身 / 标题紧凑化（2026-11-17）

- **取名屏**：标题「请赐名字」与右上角「← 返回」同排，不再单独占一行；
  姓 / 名 / 字 / 年岁四字段同一排（四列 grid），籍贯与「随机抽」同排，两个操作按钮同排。
  删掉重复的人物预览块，只保留缺项提示；输入框 38px、按钮 44px，`max-height:480px`
  时隐藏引语。924×426 实测 `.mobile-name` 的 `scrollHeight=clientHeight=426`，一屏填完。
- **出身屏**：8 张卡 `repeat(auto-fill,minmax(190px,1fr))`，收起态只显示名称、官阶/功名和
  「详情 / 选此出身」两个按钮；背景、标签、玩法风格、初始五围全部放进 `.mobile-origin-card__details`，
  默认隐藏。点「详情」才展开，`grid align-items:start` 保证别的卡不被撑高。
  属性改成「名目 + 数值」chip，两列紧凑排；原来的 `.mobile-origin-attr__bar/__fill` 横条已删。
  924×426 实测 8 张卡收起态最高 85px，整屏 `scrollHeight=clientHeight=426`，一屏看完。
- **标题屏**：难度三选从竖排三条改成横排三枚 44px 选项，说明只显示当前选中的一条；
  主操作按钮横向排列，标题降到 30px、间距收紧。924×426 实测一屏装下。
- **测试脚本**：新增 `tests/mobile-onboarding.mjs`，覆盖标题一屏、取名四字段一排且无重复预览、
  出身详情默认 0 展开、无属性横条、出身卡收起态 ≤100px、展开后五围 5 项、点「选此出身」进牌桌，
  并输出四张 `release/手机网页版-标题/取名/出身/出身详情-924x426.png`。

## 结算不再重播正文（2026-11-17）

点完选项进入 `.event-display.show-result` 后，只保留：
- `.selected-choice`：刚点的选项文本与说明；
- 结果评价、属性/状态增减；
- `.echo-box`：回音；
- 底部继续按钮。

`.event-header` 和 `.narrative-section`（人物引语、背景正文、处境提示）在手机作用域内
`display:none`，不再把整篇事件正文重播一遍。桌面 `EventDisplay.css` 仍按原样显示，一行未改。

`tests/mobile-web.mjs` 新增四条断言：结算无正文、无事件标题、已选选项可见、回音框存在；
截图见 `release/手机网页版-结算-924x426.png`。

## 强制横屏（2026-11-17）

- **PWA manifest**：`public/manifest.webmanifest` 的 `orientation` 已从 `any` 改为 `landscape`；
  安装为 PWA 后从桌面启动，系统会按 manifest 以横屏打开。
- **浏览器内 best-effort**：`MobileShell` 在首次用户手势时尝试「全屏 + `screen.orientation.lock('landscape')`」，
  竖屏遮罩上仍保留显式「全屏并锁定横屏」按钮；失败只提示，不阻塞游戏。
- **能力边界（必须说明）**：普通浏览器标签页无法绕过手机系统的竖屏锁定。`screen.orientation.lock`
  在 Android Chrome 通常要求 fullscreen + 用户手势，iOS Safari 不支持；PWA 安装后的 manifest 方向
  才由系统接管。因此网页版不能像原生 APK 一样承诺「绝对不受系统锁定影响」；原生 APK 已在应用层
  强制 `sensorLandscape`，不依赖系统自动旋转设置。

## 已验证（本地 preview，844×390）

- 进入手机版、HUD 六项状态齐全、PWA manifest 为 `orientation: landscape`、无横向溢出；
- HUD 六项状态齐全，第二排完整显示「财帛/文韬/理政/武略/体质」五项，且几何断言确认
  该排在「圣眷」正下方、左边缘对齐；点「面板」可打开人物面板，能力页含五项 +
  道德值/欲望值/野心值/机敏值/忠诚值；**属性横条可见数为 0，10 项格子单格 ≤32px，
  能力页 scrollHeight=clientHeight=297，一屏无需下滑**；态度页状态横条与国势轨道均为 0；
- 事件标题区压成单行 h=27px；「选项 N」入口 79×44px；收起态正文底部不再显示选项；
  点开后抉择面板 0,0 844×390，scroll=client=390，四个选项无需下滑即可看全；关闭后入口恢复；
- 底部操作条默认不出现；顶部 HUD 右侧有「☰ 操作」入口 92.5×44.0px（≥44）；点开后操作条
  在视口内（y=326.0 + h=56.0 ≈ 390），5 个按钮最小边 44.0px；点「×」后操作条消失；
- 正文 `.narrative-paragraph` 实测 13.0px（≤14px）；
- **开局三屏（924×426）**：标题/取名/出身三屏均 `scrollHeight=clientHeight`，取名四字段同一排、
  无重复预览；出身详情默认 0 展开、无属性横条、收起态最高 85px；展开后五围齐全；点「选此出身」进牌桌；
- 可点抉择并出结算；
- 390×844 竖屏：只出"请旋转手机"遮罩，不渲染牌桌交互；
- `?mobile=1` + 1440×900：仍渲染手机版（强制预览生效）；无参数 + 1440×900：仍走桌面原版；
- 全程无 `console.error` / `pageerror`。

## 后续可迭代（不是缺陷隐藏）

- 三档横屏像素级适配（932×430、740×360）；
- 骰子弹窗与各 portal 弹窗在窄高屏的观感；
- 视觉纹理与卡面装饰继续打磨。

## 运行

```powershell
node .\node_modules\vite\bin\vite.js build
node .\node_modules\vite\bin\vite.js preview --port 4180
$env:BASE_URL="http://localhost:4180/"; node tests\mobile-web.mjs
$env:BASE_URL="http://localhost:4180/"; node tests\mobile-onboarding.mjs
```
