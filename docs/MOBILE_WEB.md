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
| `src/mobile/MobileShell.tsx` | 横屏壳：竖屏遮罩、全屏、`screen.orientation.lock('landscape')`（try/catch，失败给降级文案，不假装成功）、`body.mobile-applied` 作用域开关 |
| `src/mobile/MobileApp.tsx` | 阶段机：标题 → 取名 → 出身 → 牌桌；存档/难度/成就口径复用既有工具 |
| `src/mobile/MobileTitle.tsx` | 标题、开始、继续上次、难度三选 |
| `src/mobile/MobileNameSetup.tsx` | 姓/名/字/年岁/籍贯；字与籍贯复用 `utils/naming.ts`，不复制生成规则 |
| `src/mobile/MobileOriginSetup.tsx` | 出身卡网格，数据复用 `data/origins` |
| `src/mobile/MobileBoard.tsx` | 牌桌：顶部 HUD + 中央事件区（**复用 `EventDisplay`**）+ 底部操作条 + 结局/死亡/回顾宿主 |
| `src/mobile/mobile.css` | 全部选择器限定在 `.mobile-shell` / `.mobile-board` / `body.mobile-applied` 下，无全局覆盖 |
| `tests/mobile-web.mjs` | 入口四规则 + 牌桌最小可用性的浏览器冒烟（退出码即结论） |

## 复用与边界

- **复用**：`useGameEngine`（同一套引擎与事件数据）、`EventDisplay`（事件卡与抉择/结算/投骰，原样复用，只加 `.mobile-event-host` 作用域样式）、`data/origins`、`utils/naming`、存档与难度工具、结局/回顾组件。
- **不复制**：没有第二套玩法规则、没有第二套条件判定。
- **桌面零改动**：`src/App.css`、`src/components/*.css`、`src/components/GameScreen.tsx`、`src/components/EventDisplay.tsx` 均 0 改动；`src/App.tsx` 只新增入口检测、`MobileAppLazy` 懒加载与一段条件渲染分支，桌面 render 逐字未动。

## 懒加载边界

`MobileApp` 与桌面 `GameScreen` 同一条分包线：`const MobileAppLazy = lazy(() => import('./mobile/MobileApp'))`，只在 `detectMobileMode()` 为真时挂 `<Suspense>`。桌面标题屏不会因为手机版存在而预取游戏主包（`MobileApp-*.js` 是独立分片）。

## 已验证（本地 preview，844×390）

- 进入手机版、HUD 六项状态齐全、无横向溢出、底部操作条完整在视口内（y=322.2 + h=67.8 ≈ 390）、底部按钮最小边 50.8px（≥44）、可点抉择并出结算；
- 390×844 竖屏：只出"请旋转手机"遮罩，不渲染牌桌交互；
- `?mobile=1` + 1440×900：仍渲染手机版（强制预览生效）；无参数 + 1440×900：仍走桌面原版；
- 全程无 `console.error` / `pageerror`。

## 第一版未做（下轮迭代，不是缺陷隐藏）

- 侧边抽屉（属性五项隐藏值、路线/党争、履历、成就/图鉴入口）；
- 三档横屏像素级适配（932×430、740×360）；
- 骰子弹窗与各 portal 弹窗在窄高屏的观感；
- 视觉质感（牌桌纹理、卡面装饰）尚未打磨，当前是功能性骨架。

## 运行

```powershell
node .\node_modules\vite\bin\vite.js build
node .\node_modules\vite\bin\vite.js preview --port 4180
$env:BASE_URL="http://localhost:4180/"; node tests\mobile-web.mjs
```
