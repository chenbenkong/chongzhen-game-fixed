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
| `android/app/src/main/res/raw/bgm.mp3` | 原生 BGM，5,984,756 字节，MediaPlayer 循环播放 |
| `…/audio/BgmPlayer.kt` | 原生音频：默认开、循环、音频焦点、前后台暂停/恢复、偏好持久化 |
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
- **本局事件一次性**：`random / gray / character / national / faction / emotion`
  与历史、过渡事件统一按 `seenEventIds` 判重，本局已经播过的卡不会再因冷却到期而重演；
  危机卡走边界路径，触发时也写入历史（`BoundaryEngine.checkCrisis` 接收 `seenEventIds`）。
  Web 侧以 `eventHistory` 为唯一判据，两边同口径，读档后仍生效。
- **可搁笔结局**：只摆牌不结算（`gameOver` 不置位），文案用逐格 `settle`。
- **结局结算精简**：原生 `EndingScreen` 默认只留结局标题 / 品级 / 收束 / 功过·官至·历事三个数字；
  史馆传略、属性终值、青史留名、结局回顾收进「完整结算」，与 Web `GameOverScreen` 同口径。
- **重走人生回到触发结局的事件**：`GameController.retryEnding()` 用 `choose` 前保存的 `undoSnapshot`
  还原同一张事件卡，不再整局重开；同一事件只重选一次，重选后再次触发结局时按钮显示「重走人生 · 已锁」。
  结局屏「返回标题」统一改为「返回首页」。
- **存档**：每回合写自动档，原子替换；读档恢复姓名/出身/功名/年月/回合/属性/隐藏/flags/flagTurns/履历/当前事件。

## 手机尺寸适配与单栏抽屉（2026-11-17）

目标真机：**2772×1280、6.83 英寸**，横屏宽高比 **2.165:1**，与设计基准 844×390（2.164:1）同比例。
按 Android 密度换算后视口约为 844–924dp 宽、366–390dp 高；布局全部用 `dp/sp` 和约束，不写死像素。

- **手机默认单栏**：`MainArea` 只有 `maxHeight ≥ 600.dp` 才常驻左右栏；844/924dp 宽、366–390dp 高的手机
  上不再把能力栏、态度栏硬挤在事件两侧，事件卡独占整块宽度。
- **按需面板**：顶栏只留「国势 + 面板」；点「面板」从右侧弹出抽屉，页签为
  **能力 / 态度 / 卷宗**。面板宽为屏宽 64%，点遮罩、关闭按钮或系统返回键都会收起。
  **能力/态度页的属性改为三列紧凑格**，每格只显示名目与数值，不再画横条 Meter；
  五能力、五隐藏、五方态度 + 国势各占两行，基本一屏看完。
  `卷宗` 页签含票签、履历、结局图鉴；不再把三栏信息常驻在牌桌上。
- **财帛/体质速览**：顶栏「国势」左侧直接显示「财帛 N · 体质 N」；完整五能力与隐藏属性仍在
  「面板 → 能力」页。
- **抉择不埋底**：事件标题压成单行，右侧「选项 N」直接打开全屏抉择面板，选项卡片一次展示；
  **正文底部不再重复铺选项**，收起态只剩正文。待办数字只保留在顶栏「操作 N」角标，不再占事件区一行。
- **底部操作条默认收起**：牌桌不再常驻四按钮底栏；顶栏「面板」右侧只留一个 44dp 的「操作」入口，
  点开才以浮层展开「首页 / 撤销 / 存档 / 进下月 / ×」，点遮罩、× 或系统返回键收起。
  事件区因此拿回整块高度，收起态没有底部遮挡。
- **三栏只给大屏**：≥600dp 高的平板/桌面仍按 Web 三栏骨架显示，侧栏宽 `maxWidth × 0.21`
  夹在 `170–230dp`；手机不再触发。
- **强横屏**：Manifest `android:screenOrientation="sensorLandscape"`，
  `MainActivity.onCreate` / `onResume` 再设 `SCREEN_ORIENTATION_SENSOR_LANDSCAPE`。
  正常 Android 上应用请求的方向优先于系统「自动旋转」开关，用户把手机锁在竖屏也不会
  把牌桌转成竖屏；`sensorLandscape` 允许左右两个横屏方向。
- **字号按手机收一档**：事件描述 12.5sp / 19sp 行高，引语 12.5sp / 18sp，选项正文
  12.5sp / 17sp，选项说明 12sp / 16sp；事件标题 22sp，侧栏标签 11.5sp。不再用桌面 14sp 正文硬塞。
- **触控目标**：操作条按钮 ≥44dp，顶栏「操作」入口 ≥44dp，标题屏 / 操作条音乐开关 44dp，
  抉择卡 ≥46dp；横屏短边只有约 366dp，不做 56dp 大按钮堆叠。
- **系统栏 / 挖孔**：`MainActivity` 隐藏 systemBars、`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`；
  `ScreenRoot` 的渐变铺满整屏，内容再让 `safeDrawing`，横屏挖孔侧不会留黑竖条。
- **视觉对齐 Web**：墨黑 `#0A0806` / 面板 `#161210→#0D0A08` / 旧金 `#C5A55A` / 宣纸 `#F5E6C8` /
  细线 `#2A2015`；系统衬线字体（宋体族）；面板 3dp 方角、1dp 金线；按钮暗底金边，不用朱砂圆角块。
- **字体风险**：不打包字体文件，依赖系统 `serif` 的 CJK 字面；没有 CJK 衬线字体的设备会回退到系统默认字，
  真机字形未验证（本机无设备/AVD）。
- **系统级例外**：标准 Android 的 Activity 方向请求会覆盖系统竖屏锁；个别 ROM 若提供
  「锁定当前应用方向」这类系统级开关，应用无法绕过，只能由用户关闭该开关。原生 APK 本身不做任何
  依赖系统设置的降级。

## 开局三屏紧凑化（2026-11-17）

- `NameSetupScreen.kt`：标题「请赐名字」与右上角「← 返回」同一 `Box` 行；姓/名/字/年岁四个
  `OutlinedTextField` 同一 `Row`（各 `weight(1f)`）；籍贯与「随机抽」同一行；「随机取名 / 定此名字」
  同一行。删除重复的人物预览块和底部返回键；根布局 `verticalScroll` 仅作窄屏兜底，844/924dp
  宽、366–390dp 高可一屏填完。
- `OriginSelectScreen.kt`：不再用 `LazyVerticalGrid`（同排最高的卡会把其余卡拉成整行高）。
  改为 `Column(verticalScroll)` + 每 4 张一 `Row`，卡片 `weight(1f)` 按自身内容取高；8 张卡默认
  只露名称、官阶和「详情 / 选此」两个 44dp 按钮。背景、标签、玩法风格、初始五围收进
  `if (expanded)` 的详情区；五围是 3 列紧凑值块（名目 + 数值），`AttrRow` 横条已删。
- `TitleScreen.kt`：难度三选从竖排三张带说明的卡改为横排三枚 44dp `DifficultyChip`，
  说明只显示当前选中一条；标题 36sp→28sp，外边距 28dp→18/10dp，按钮与图鉴入口同宽居中；
  存档预览压成单行 11sp。
- 校验：`testDebugUnitTest` **12 个套件 / 53 个用例 / 0 失败**；`assembleDebug` 成功；
  新 APK **18,880,144 字节**，SHA-256
  `F8AFC959356B8D4C720CB05F13048BC2E7F6E1C47C066ABF416FBA575767DFCF`。
- 未验证：本机无真机/AVD，上述三屏的真机触控与字形仍只能静态编译通过，不能宣称已看过实机效果。

## 结算只显示已选选项与回音（2026-11-17）

- `OutcomeView` 新增 `choiceText / choiceDescription`，由 `GameController` 用
  `lastOutcome.choiceId` 从当前事件选项中取回，不另存一份文案。
- `EventColumn` 在 `state.outcomeVisible && state.outcome != null` 时**不再渲染 `EventCard`**，
  直接把 `OutcomePanel` 拉满中栏；事件正文、人物引语、处境提示和事件标题都不再重播。
- `OutcomePanel` 顶部显示「你 选 了」+ 选项文本 + 选项说明，其后是结果评价、属性/状态增减、
  票签与回音，最后是「继 续」。`testDebugUnitTest` 12 套件 / 53 用例 / 0 失败。

## 原生 BGM（2026-11-17）

原生 APK 之前**完全没有音频资源与播放器**，所以牌桌再完整也没有音乐。现在：

- `public/bgm.mp3` 复制为 `android/app/src/main/res/raw/bgm.mp3`，由 `MediaPlayer` 读
  `R.raw.bgm`，`isLooping=true`、音量 0.4；不联网、不申请 `INTERNET`。
- `BgmPlayer.kt`：默认开；`attach()` 在 `MainActivity.onCreate` 初始化，`onResume()`
  续播、`onPause()` 暂停并让出音频焦点、`isFinishing` 时 `release()`；申请
  `AUDIOFOCUS_GAIN`（usage=game / contentType=music），临时丢失暂停、duck 时降音量。
- `TitleScreen.kt` 的开始/继续按钮旁、`BoardScreen.kt` 底部操作条（默认收起）各放
  一枚 44dp 的「乐 / 静」开关；开关写 `SharedPreferences("chongzhen").bgm_on`，
  下次启动沿用，默认仍是开。
- 代价：APK 从 11.47 MB 增到 **18,880,144 字节**（含 5.98 MB 音频与更新后的事件数据），仍无 WebView、
  无网络依赖。
- **未验证**：本机无真机/AVD，MediaPlayer 的真实出声、音频焦点在 ROM 上的表现
  只能静态编译 + APK 资源在位确认，不能宣称实机听过。

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
- `assembleDebug`：`app-debug.apk` **18,880,144 字节**，SHA-256 `F8AFC959356B8D4C720CB05F13048BC2E7F6E1C47C066ABF416FBA575767DFCF`，
  复制到 `release/崇祯直聘-0.5.0-debug.apk`；
  debug v2 签名有效（`CN=Android Debug`）。
- APK 静态复核：`screenOrientation=0x6`（sensorLandscape）；`assets/game-data.json` **3,927,505 字节**、
  `res/raw/bgm.mp3` **5,984,756 字节**在位；APK 内没有 HTML/网页资源；源码里没有 WebView / Capacitor /
  Cordova / TWA / `loadUrl` 引用；无 `INTERNET`。
- 换皮事件互斥：`GameEvent.exclusiveGroup` 已同步到 Kotlin 模型与 `EventPool`；历史 id
  反查同组，抽支线时同批也只允许一张。《下属献妻》/《县丞献妻》《秦淮画舫》/《盐商画舫》
  两组的 `exclusiveGroup` 已进入 `game-data.json`。
- 未验证项：真机安装、启动、强制横屏实际表现、面板抽屉触控、操作条浮层与遮罩触控、存档落盘
  （本机 `adb devices` 为空，SDK 无 emulator/AVD）。

## 未验证 / 已知缺口

- **真机安装与运行：未验证**。本机无连接设备、SDK 内无 emulator 目录，安装/启动/触控手感/字体渲染都未经真机确认。
- 结局图鉴已用 SharedPreferences（`chongzhen_codex`）跨局持久化；Web 端的完整成就面板 / 事件图鉴条目未移植，原生抽屉只列已达成结局。
- `lifeRecords` 裁剪、跨标签序号守卫、悔棋次数计数未移植。
- 首版**不含**：AI 参谋、AI 配图、作弊面板（依赖联网/调试，按设计不纳入单机 APK）。
