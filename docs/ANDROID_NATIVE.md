# 原生 Android 单机版（`android/`）

同一套《崇祯·宦海浮沉模拟器》的**原生**客户端：Kotlin + Jetpack Compose，**没有任何 WebView / Capacitor / Cordova / TWA / 网页套壳**，事件数据以 JSON 资源随包分发，运行时**不需要网络**（Manifest 不申请 `INTERNET`）。

## 与 Web 版的关系

- 玩法、事件、结局、门槛**同一份数据**：由 `scripts/export-native-data.ts` 从 `src/data/**` 导出到
  `android/app/src/main/assets/game-data.json`（494 事件 / 49 结局 / 8 出身 / 18 官阶 / 3 难度 / 58 边界事件）。
- 规则由 Kotlin 原生引擎实现（不是调 Web 代码），条件键、效果、发牌、官阶、结局、存档逐项对齐 Web 口径，
  Web 端与原生端的差异逐条登记在 `docs/native-engine.md`。
- 重新生成数据：`node .\node_modules\vite-node\vite-node.mjs scripts\export-native-data.ts`
  （校验：`… scripts\verify-native-data.ts`）。

## 工程结构

| 路径 | 用途 |
| --- | --- |
| `android/app/src/main/assets/game-data.json` | 导出的事件/出身/官阶/难度/结局/边界规则（3.75 MB） |
| `…/data/GameDataModels.kt`、`GameDataRepository.kt` | JSON 数据模型与启动时一次性解析缓存 |
| `…/engine/GameEngine.kt` | 引擎门面：开局、发牌推进、抉择结算、投骰、撤销、边界判定、存档桥接 |
| `…/engine/conditions/` | 条件求值：硬门（flags/origin/rank，不可投骰）优先，软门（体质/属性/态度/隐藏，可勉力一试）在后；结构化返回 `available / reasonCode / reasonText / difficulty / gap` |
| `…/engine/effects/` | 属性/隐藏/态度/flags 结算与上下限裁剪；`FailFallback` 对齐 Web 失败回音口径 |
| `…/engine/pools/` | 事件池：分层、权重、冷却、一次性、prelude 优先、固定种子可复现 |
| `…/engine/ranks/` | 政绩分、升迁门槛、15 条贬官判据（含宽限期） |
| `…/engine/boundary/BoundaryEngine.kt` | 边界判定：49 条结局 + 58 条边界事件，其中 22 条手写规则全部显式移植（`unportedCount = 0`） |
| `…/engine/save/` | 存档序列化（JSON、原子写）与槽位：自动 1 + 手动 3 |
| `…/ui/` | 原生 Compose 界面：标题 / 取名 / 选出身 / 牌桌（Web 式顶栏 + 中事件栏 + 可开合面板 + 可收起操作条）/ 结局 / 错误态 |
| `app/src/test/` | JVM 单测：条件、效果、发牌、边界、结局、撤销、投骰、存档、控制器流程 |

## 关键实现口径

- **硬门不可投骰**：`flags / origin / rank` 任一不满足直接锁定，`difficulty = null`，掷 6 也绕不过；
  只有体质/属性/态度/隐藏这类软条件才给「勉力一试」难度（例：`historical_009 c1` 要求没落世家，寒门局锁死）。
- **八条归零警告 + 贪墨预警**：维度 ≤0 且未持「归零警告·key」→ 先发 warning 卡（票由该卡选项自身写入）；
  持票之后才可能命中对应死线结局，**不许跳过 warning 直接死**。
- **三条党派结局年下限各自独立**：`faction_donglin_martyr` 1644 / `faction_tyrant_fall` 1637 / `faction_sacrifice` 1635；
  禁止用"叙事最小年"常量顶包。
- **可搁笔结局**：只摆牌不结算（`gameOver` 不置位），文案用逐格 `settle`。
- **存档**：每回合写自动档，原子替换；读档恢复姓名/出身/功名/年月/回合/属性/隐藏/flags/flagTurns/履历/当前事件。

## 手机尺寸适配与单栏抽屉（2026-11-17）

目标真机：**2772×1280、6.83 英寸**，横屏宽高比 **2.165:1**，与设计基准 844×390（2.164:1）同比例。
按 Android 密度换算后视口约为 844–924dp 宽、366–390dp 高；布局全部用 `dp/sp` 和约束，不写死像素。

- **手机默认单栏**：`MainArea` 只有 `maxHeight ≥ 600.dp` 才常驻左右栏；844/924dp 宽、366–390dp 高的手机
  上不再把能力栏、态度栏硬挤在事件两侧，事件卡独占整块宽度。
- **按需面板**：顶栏只留「国势 + 面板」；点「面板」从右侧弹出抽屉，页签为
  **能力 / 态度 / 卷宗**。面板宽为屏宽 64%，点遮罩、关闭按钮或系统返回键都会收起。
  `卷宗` 页签含票签、履历、结局图鉴；不再把三栏信息常驻在牌桌上。
- **底部操作条默认收起**：牌桌不再常驻四按钮底栏；右下角只留一个 44dp 的「操作」入口，
  点开才以浮层展开「标题 / 撤销 / 存档 / 进下月 / ×」，点遮罩、× 或系统返回键收起。
  事件区因此拿回约 56dp 高度。
- **三栏只给大屏**：≥600dp 高的平板/桌面仍按 Web 三栏骨架显示，侧栏宽 `maxWidth × 0.21`
  夹在 `170–230dp`；手机不再触发。
- **强横屏**：Manifest `android:screenOrientation="sensorLandscape"`，
  `MainActivity.onCreate` / `onResume` 再设 `SCREEN_ORIENTATION_SENSOR_LANDSCAPE`。
  正常 Android 上应用请求的方向优先于系统「自动旋转」开关，用户把手机锁在竖屏也不会
  把牌桌转成竖屏；`sensorLandscape` 允许左右两个横屏方向。
- **字号按手机收一档**：事件描述 12.5sp / 19sp 行高，引语 12.5sp / 18sp，选项正文
  12.5sp / 17sp，选项说明 12sp / 16sp；事件标题 22sp，侧栏标签 11.5sp。不再用桌面 14sp 正文硬塞。
- **触控目标**：操作条按钮 ≥44dp，浮动「操作」入口 ≥44dp，抉择卡 ≥46dp；横屏短边只有约 366dp，
  不做 56dp 大按钮堆叠。
- **系统栏 / 挖孔**：`MainActivity` 隐藏 systemBars、`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`；
  `ScreenRoot` 的渐变铺满整屏，内容再让 `safeDrawing`，横屏挖孔侧不会留黑竖条。
- **视觉对齐 Web**：墨黑 `#0A0806` / 面板 `#161210→#0D0A08` / 旧金 `#C5A55A` / 宣纸 `#F5E6C8` /
  细线 `#2A2015`；系统衬线字体（宋体族）；面板 3dp 方角、1dp 金线；按钮暗底金边，不用朱砂圆角块。
- **字体风险**：不打包字体文件，依赖系统 `serif` 的 CJK 字面；没有 CJK 衬线字体的设备会回退到系统默认字，
  真机字形未验证（本机无设备/AVD）。
- **系统级例外**：标准 Android 的 Activity 方向请求会覆盖系统竖屏锁；个别 ROM 若提供
  「锁定当前应用方向」这类系统级开关，应用无法绕过，只能由用户关闭该开关。原生 APK 本身不做任何
  依赖系统设置的降级。

## 构建

```powershell
# cwd = android/
& "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\bin\java.exe" `
  -cp "C:\Users\cckj\gradle-8.9\lib\*" org.gradle.launcher.GradleMain `
  assembleDebug --no-daemon --stacktrace
```

- `local.properties` 需写 `sdk.dir=C\:\\Users\\cckj\\Android\\Sdk`；该文件已在 `android/.gitignore` 里忽略。
- 工具链：AGP 8.7.3 / Kotlin 2.0.21 / Compose BOM 2024.10.01 / Gradle 8.9 / JDK 21。
- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`。

> 本机沙箱禁止 spawn `cmd.exe`，所以 **`gradle.bat` / `gradlew.bat` / `sdkmanager.bat` 都不要直接跑**，
> 一律用上面的 `java -cp … org.gradle.launcher.GradleMain` 形式。也不要开多个 Gradle 并发
> （会互删构建目录，制造 `ClassNotFoundException` 的假红）。

## 校验

```powershell
& "C:\Users\cckj\Android\Sdk\build-tools\35.0.0\aapt.exe" dump badging <apk>   # 横屏 + 权限（应无 INTERNET）
& "C:\Users\cckj\Android\Sdk\build-tools\35.0.0\aapt.exe" list <apk>          # 应含 assets/game-data.json
```

包名 `com.chenbenkong.chongzhen`，minSdk 26 / target 35，`screenOrientation="sensorLandscape"`（aapt 值 0x6），
`MainActivity` 运行时再次请求同一方向；权限只有 1 条 AndroidX 内部权限（`…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`），**无 `INTERNET` / 无 `ACCESS_NETWORK_STATE`**。

## 本轮实测（2026-11-17）

- `testDebugUnitTest`：**12 个套件 / 53 个用例 / 0 失败**（含 `DiceBranchTest` 的路线硬门、`BoardControllerTest` 的开局→抉择→进下月→存档读档全链路）。
- `assembleDebug`：`app-debug.apk` **11,461,475 字节**，SHA-256 `E56C9902284459731BCF794DFF200AD44DCF61ACBE3B479074FC47FC8FEA614C`，
  debug v2 签名有效（`CN=Android Debug`）。
- APK 静态复核：`screenOrientation=0x6`（sensorLandscape）；`assets/game-data.json` **3,927,111 字节**在位；
  APK 内没有 HTML/网页资源；源码里没有 WebView / Capacitor / Cordova / TWA / `loadUrl` 引用；无 `INTERNET`。
- 未验证项：真机安装、启动、强制横屏实际表现、面板抽屉触控、操作条浮层与遮罩触控、存档落盘
  （本机 `adb devices` 为空，SDK 无 emulator/AVD）。

## 未验证 / 已知缺口

- **真机安装与运行：未验证**。本机无连接设备、SDK 内无 emulator 目录，安装/启动/触控手感/字体渲染都未经真机确认。
- 结局图鉴已用 SharedPreferences（`chongzhen_codex`）跨局持久化；Web 端的完整成就面板 / 事件图鉴条目未移植，原生抽屉只列已达成结局。
- `lifeRecords` 裁剪、跨标签序号守卫、悔棋次数计数未移植。
- 首版**不含**：AI 参谋、AI 配图、作弊面板（依赖联网/调试，按设计不纳入单机 APK）。
