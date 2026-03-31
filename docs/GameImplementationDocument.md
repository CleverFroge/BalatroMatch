# 《消除小丑牌》(Balatro Match) 技术实现文档

## 1. 架构与技术栈
本项目采用极简的纯前端技术栈，便于快速迭代和分发：
- **核心语言**：HTML5, CSS3, Vanilla JavaScript (ES6+)。
- **无外部依赖**：未使用任何前端框架（如 React/Vue）或游戏引擎（如 Phaser/PixiJS），保证了原型的轻量级和透明度。
- **本地服务**：使用 Node.js 的 `serve` 工具（`npx serve -p 8888`）提供本地静态 HTTP 服务，解决直接双击 HTML 文件可能带来的 CORS 或模块加载限制。

## 2. 文件结构与职责
项目主要由三个文件构成，实现了逻辑与配置的解耦：

### 2.1 `index.html` (视图与主逻辑)
- **DOM 结构**：定义了游戏面板（Header、Jokers区域、8x8棋盘）、结算 UI（GameOver、Shop）。
- **CSS 动效系统**：利用 `@keyframes` 实现了游戏的核心视觉反馈（消除、掉落、选中、粒子飞行）。
- **游戏主循环**：通过 `initGame`, `onCellClick`, `processMatches`, `checkGameState` 控制游戏状态流转。

### 2.2 `config.js` (静态配置与数值)
- **`GAME_CONFIG`**：统一定义游戏的基础常量（行列数 `ROWS/COLS`、颜色池 `COLORS`、初始步数 `INITIAL_MOVES`、目标分基数 `TARGET_SCORE_BASE` 等）。
- **`JOKER_POOL`**：定义小丑牌的卡池字典。每个对象包含 `id`, `name`, `desc` (HTML 描述), `cost` (金币价格) 以及触发所需的 `color` 或 `type` 属性。

### 2.3 `server.js` (历史遗留/可选)
- 早期用于起 Node 服务器的文件，现已被更稳定的 `npx serve` 替代，但作为备用方案保留。

## 3. 核心机制的代码实现

### 3.1 状态管理
游戏的所有实时状态均维护在全局变量中：
- `board[][]`：8x8 的二维数组，每个格子存储 `{ color: 'c-red', joker: null | jokerObject }` 对象。`color` 为方块颜色，`joker` 为附着的小丑牌对象（可为 `null`）。
- `score`, `target`, `moves`, `gold`, `level`：数值状态。
- `inventory[]`：玩家的小丑牌**背包**，存储为 `[{ joker: jokerObject, count: number }]` 数组，支持同种小丑牌叠加。
- `attachMode`：**附着模式标志**。当玩家从背包选择一张小丑牌后进入附着模式，此时点击棋盘方块会将小丑牌附着上去，而非进行正常的选择/互换操作。
- `attachingJoker`：当前正在附着的小丑牌对象引用。
- `isProcessing`：**关键互斥锁 (Mutex)**。为防止玩家在动画播放期间疯狂点击导致状态机崩溃，所有异步流程（消除、掉落）期间该标志置为 `true`，拦截点击事件。

### 3.2 交互与自由互换 (Free Swap) / 附着模式
- **输入层**：通过 `onCellClick(r, c)` 处理点击。为了避免 DOM dataset 提取出的字符串导致严格相等 (`===`) 判断失败，坐标在传入时被强制转化为整数 `parseInt(r)`。
- **附着模式拦截**：若 `attachMode === true`，点击方块会调用 `attachJokerToCell(r, c)` 将当前选中的小丑牌附着到该方块上，而非进行互换操作。
- **互换逻辑**：
  ```javascript
  // 交换整个 cell 数据对象（color + joker 一起移动），附着的小丑牌随方块一起被交换
  [board[sr][sc], board[r][c]] = [board[r][c], board[sr][sc]];
  moves--;
  ```

### 3.3 消除判定算法 (Match Detection)
`findMatches()` 函数采用四遍扫描法遍历二维数组：
1. **横向扫描**：遍历每行，检查连续 4 个格子的 `color` 属性是否相同。
2. **纵向扫描**：遍历每列，检查连续 4 个格子的 `color` 属性是否相同。
3. **主对角线扫描 (\)**：检查左上到右下的连续 4 个格子。
4. **副对角线扫描 (/)**：检查左下到右上的连续 4 个格子。
5. **去重存储**：将匹配格子的坐标格式化为 `"r,c"` 字符串存入 `Set` 中，自动合并交叉点（如 L 型、X 型消除），最后还原为 `{r, c}` 对象数组。

> **注意**：由于 `board[r][c]` 现在是 `{ color, joker }` 对象，匹配判定通过 `board[r][c].color` 访问颜色属性，并增加了 `null` 检查以防止空格子访问错误。

### 3.4 异步时序控制 (Async Timing Control)
这是本项目最核心的工程难点。为了还原《小丑牌》那种"先触发特效 -> 再叠加数值 -> 最后爆分销毁"的节奏感，所有的视觉渲染和 DOM 操作必须阻塞 JS 主线程的逻辑执行。
- 引入 `sleep` Promise 包装器：
  ```javascript
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  ```
- 在 `processMatches()` 中使用 `await sleep(ms)` 强制等待 CSS 动画（如粒子飞行 `400ms`，赋能高亮 `400ms`，掉落回弹 `400ms`）播放完毕，再修改底层二维数组 `board`。

### 3.5 计分与小丑牌触发 (Score & Joker Eval) — 附着触发机制
在 `processMatches()` 内部：
1. **分组**：按颜色将匹配的方块归类。
2. **计算 Base**：`chips = size * 10`, `mult = size - 1 + comboCounter`。
3. **逐方块扫描附着 (Per-Cell Joker Check)**：遍历被消除的每个方块，检查其 `joker` 属性。如果存在附着的小丑牌且触发条件满足（颜色匹配 / 消除数量达标 / 连击数达标），则将其效果加到 `chips` 或 `mult` 上，并记录触发信息用于播放特效。
4. **乘法阶段**：对所有触发的小丑牌执行最终得分乘法（如 `joker-purple` 的 `x1.5`、`joker-geo` 的 `x2`）。
5. **消耗机制**：当方块被消除时，附着在其上的小丑牌同时被销毁（随 `board[r][c] = null` 一起清除）。

## 4. 高级动画实现：粒子系统 (Particle System)

### 4.1 附着标记渲染
在 `renderBoard()` 中，若 `cellData.joker` 非空，则在方块 DOM 内追加一个 `.joker-badge` 子元素。不同小丑牌类型通过 `getJokerBadgeClass()` 获取对应的颜色类名（如 `badge-red`、`badge-shape`），通过 `getJokerBadgeText()` 获取对应的符号文字（如 ♥、▲、⚡）。

### 4.2 二次贝塞尔曲线 (Quadratic Bezier)
为了让触发特效不那么死板，`spawnCellParticle()` 使用 `requestAnimationFrame` 配合贝塞尔曲线实现抛物线粒子飞行：
- **起点**：附着了小丑牌的方块中心。
- **终点**：同组其他被消除方块的中心。
- **控制点**：计算起点与终点的中点，并在 Y 轴上取较小值再偏移 `-30px`（制造弧线），X 轴随机偏移 `±40px`（制造散布感）。
- **公式**：`B(t) = (1-t)² * P0 + 2(1-t)t * P1 + t² * P2`

### 4.3 动画组并行等待 (Promise.all)
当一次消除触发了多个附着方块的小丑牌时，会产生大量粒子。
```javascript
let animPromises = [];
// 从附着方块发射粒子到消除组的每个其他方块
triggeredJokerCells.forEach(tc => {
    group.forEach(cell => {
        if(cell.r !== tc.r || cell.c !== tc.c) {
            animPromises.push(spawnCellParticle(tc.r, tc.c, cell.r, cell.c, color));
        }
    });
});
// 阻塞主逻辑，直到所有粒子精准"砸中"方块
await Promise.all(animPromises);
// 随后给方块追加 .empowered 样式（赋能高亮发光）
```

### 4.4 附着模式交互
- 玩家点击背包中的小丑牌 → 调用 `startAttachMode(joker)`，设置 `attachMode = true`。
- 棋盘显示 `.attach-mode` 样式（粉红色边框），所有方块添加 `.attach-target` 类（脉动动画提示）。
- 顶部出现粉红色横幅 `.attach-banner` 提示"点击方块以附着"。
- 点击方块 → `attachJokerToCell(r, c)` 将小丑牌绑定到 `board[r][c].joker`，从背包扣除一张。若该方块已有其他小丑牌则先退回背包。

## 5. 扩展与维护指南
- **新增小丑牌**：在 `config.js` 的 `JOKER_POOL` 中添加配置项，然后在 `index.html` 的 `processMatches()` 中逐方块扫描阶段加入它的触发判定逻辑，以及在 `getJokerBadgeClass()` / `getJokerBadgeText()` 中添加对应的徽章样式和符号。
- **修改掉落逻辑**：重力掉落时将 `null` 上方的元素下移，并在顶部生成新的 `{ color, joker: null }` 对象。新生成的方块不会携带小丑牌。如果想加入特殊方块（如石头），需在此循环中跳过无法下落的类型。
- **附着机制扩展**：当前每个方块最多附着 1 张小丑牌（替换旧的）。未来可考虑多槽位附着或"小丑牌融合"等进阶机制。