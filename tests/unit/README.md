# 单元测试

对核心游戏引擎（`src/hooks/useGameEngine.ts`，约 1900 行）做行为契约测试。
这一层的价值在于：引擎是整个游戏里最复杂、最缺少结构性保护的部分，
而它承载了读档、升迁/贬官、临界事件、存档往返这些"错了玩家一定会察觉"的逻辑。

```bash
npm run test:unit          # 跑一次
npm run test:unit:watch    # 监听
npm run typecheck:test     # 连 src 一起做类型检查
```

## 文件组织

| 路径 | 作用 |
| --- | --- |
| `setup.ts` | 测试环境准备。见下方"两个环境坑" |
| `helpers/gameEngine.ts` | 构造存档/角色/状态 + 渲染引擎 + 推进回合的工具 |
| `harness.test.ts` | 基座自检。**这个文件挂了，下面所有结论都不可信** |
| `engine.*.test.ts` | 针对具体缺陷的回归测试 |
| `eventDisplay.*.test.tsx` | 组件级测试 |
| `layout.*.test.ts` | **CSS 源码层**守卫（`helpers/cssRules.ts` 直接扫选择器与声明）。 |

CI 里没有浏览器、jsdom 也不算 flex 盒，所以布局缺陷分两层钉：
真实几何由 `tests/choices-visibility.mjs` 与 `tests/modals-reachability.mjs` 在本地量，
CI 只守**成因**（哪条声明必须存在、哪条不许无条件覆盖）。新增一个全屏遮罩时必须往
`layout.modalScroll.test.ts` 的 `ROWS` 登记它的范式，否则那条"遮罩都要在册"的元约束会直接红。

## 两个环境坑（已在 setup.ts 中处理，不必重复踩）

### 1. Node 26 的内置 `localStorage` 会覆盖 jsdom 的实现

Node 22+ 引入了实验性的 Web Storage 全局，Node 26 默认开启。它在 `globalThis` 上定义了
`localStorage` 的取值器，而在没有传 `--localstorage-file` 时该取值器返回 `undefined`。

结果非常具有迷惑性：jsdom **确实**加载成功了（`window` / `document` / `navigator` 都正常，
user agent 也是 `jsdom/30.x`），但 `localStorage` 是 `undefined`，
引擎一读存档就抛 `Cannot read properties of undefined (reading 'getItem')`。

`setup.ts` 装了一个符合 Storage 规范的内存实现（含 `length` 与 `key(i)`，
因为 `ErrorBoundary` 的全量清理逻辑真的会用到），并挂到 `globalThis` 与 `window` 上。
没有用 Node 启动参数来解决，是因为 `--no-experimental-webstorage` 在 Node 20 上不存在，
而 CI 跑的是 Node 20。

### 2. `Math.random` 必须固定

引擎在挑选事件、掷骰、临界事件判定里都用 `Math.random`。`setup.ts` 在每个用例前把它
固定为 `0.5`。需要走某个概率分支时自行覆盖，例如让 `Math.random() < 0.3` 成立：

```ts
vi.spyOn(Math, 'random').mockReturnValue(0.1)
```

每个用例结束后 `vi.restoreAllMocks()` 会自动还原。

## 写测试时的注意事项

- **用 helper，别手搓存档对象**。`makeSaveData` / `makeCharacter` / `makeGameState`
  已经把 40 多个字段的默认值准备好了，传 partial 覆盖你要改的部分即可。
- **`act` 边界**：所有会触发 setState 的调用都要包在 `act` 里，
  helper 的 `flush()` 与 `advanceMonths()` 已经处理了这点。
- **假定时器**：如果用了 `vi.useFakeTimers()`，务必在用例结束前 `vi.useRealTimers()`，
  否则会拖垮后续用例。
- **宁可写弱一点但诚实的测试，也不要写会随机失败的测试**。做不到确定性就在报告里说明。
