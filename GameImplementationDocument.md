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
- `board[][]`：8x8 的二维数组，存储每个格子的颜色字符串（如 `'c-red'`）或 `null`。
- `score`, `target`, `moves`, `gold`, `level`：数值状态。
- `activeJokers[]`：玩家当前已购买并在局内生效的小丑牌对象数组。
- `isProcessing`：**关键互斥锁 (Mutex)**。为防止玩家在动画播放期间疯狂点击导致状态机崩溃，所有异步流程（消除、掉落）期间该标志置为 `true`，拦截点击事件。

### 3.2 交互与自由互换 (Free Swap)
- **输入层**：通过 `onCellClick(r, c)` 处理点击。为了避免 DOM dataset 提取出的字符串导致严格相等 (`===`) 判断失败，坐标在传入时被强制转化为整数 `parseInt(r)`。
- **互换逻辑**：
  ```javascript
  // 无论是否匹配，只要相邻（含斜向四个对角线：Math.abs(sr - r) <= 1 && Math.abs(sc - c) <= 1）即可互换，并扣除一步 (模拟“弃牌/做牌”)
  [board[sr][sc], board[r][c]] = [board[r][c], board[sr][sc]];
  moves--;
  ```

### 3.3 消除判定算法 (Match Detection)
`findMatches()` 函数采用四遍扫描法遍历二维数组：
1. **横向扫描**：遍历每行，检查连续 3 个格子颜色是否相同。
2. **纵向扫描**：遍历每列，检查连续 3 个格子颜色是否相同。
3. **主对角线扫描 (\)**：检查左上到右下的连续 3 个格子。
4. **副对角线扫描 (/)**：检查左下到右上的连续 3 个格子。
5. **去重存储**：将匹配格子的坐标格式化为 `"r,c"` 字符串存入 `Set` 中，自动合并交叉点（如 L 型、X 型消除），最后还原为 `{r, c}` 对象数组。

### 3.4 异步时序控制 (Async Timing Control)
这是本项目最核心的工程难点。为了还原《小丑牌》那种“先触发特效 -> 再叠加数值 -> 最后爆分销毁”的节奏感，所有的视觉渲染和 DOM 操作必须阻塞 JS 主线程的逻辑执行。
- 引入 `sleep` Promise 包装器：
  ```javascript
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  ```
- 在 `processMatches()` 中使用 `await sleep(ms)` 强制等待 CSS 动画（如粒子飞行 `400ms`，赋能高亮 `400ms`，掉落回弹 `400ms`）播放完毕，再修改底层二维数组 `board`。

### 3.5 计分与小丑牌触发 (Score & Joker Eval)
在 `processMatches()` 内部：
1. **分组**：按颜色将匹配的方块归类。
2. **计算 Base**：`chips = size * 10`, `mult = size - 1 + comboCounter`。
3. **加法遍历 (Active Jokers)**：遍历 `activeJokers`，根据方块颜色或消除数量（如 `joker-geo` 的 4连消判定），将对应的数值加到 `chips` 或 `mult` 上。并记录被触发的小丑牌 ID `triggeredJokers`。
4. **乘法遍历**：再次遍历 `activeJokers`，处理 `joker-purple` 这种 `x1.5` 的最终得分乘法逻辑。

## 4. 高级动画实现：粒子系统 (Particle System)

### 4.1 二次贝塞尔曲线 (Quadratic Bezier)
为了让小丑牌发射的光球不那么死板，`spawnJokerParticle()` 放弃了 CSS `transition` 的直线运动，转而使用 `requestAnimationFrame` 配合贝塞尔曲线实现抛物线：
- **起点**：小丑牌 DOM 的中心 (`jRect.left + jRect.width / 2`)。
- **终点**：目标方块 DOM 的中心 (`rect.left + c * cellWidth ...`)。
- **控制点**：计算起点与终点的中点，并在 Y 轴上偏移 `-50px`（制造抛物线顶点），X 轴随机偏移 `±80px`（制造散布感）。
- **公式**：`B(t) = (1-t)² * P0 + 2(1-t)t * P1 + t² * P2`

### 4.2 动画组并行等待 (Promise.all)
当一次消除触发了多张小丑牌，且包含多个方块时，会产生大量粒子。
```javascript
let animPromises = [];
// 收集所有粒子动画的 Promise
triggeredJokers.forEach(jId => {
    group.forEach(cell => {
        animPromises.push(spawnJokerParticle(jId, cell.r, cell.c, color));
    });
});
// 阻塞主逻辑，直到所有粒子精准“砸中”方块
await Promise.all(animPromises);
// 随后给方块追加 .empowered 样式（赋能高亮发光）
```

## 5. 扩展与维护指南
- **新增小丑牌**：在 `config.js` 的 `JOKER_POOL` 中添加配置项，然后在 `index.html` 的 `processMatches()` 中对应的“加法遍历”或“乘法遍历”阶段加入它的逻辑判定。
- **修改掉落逻辑**：目前的重力掉落是在列上将 `null` 上方的元素下移，并在顶部生成新随机颜色。如果想加入特殊方块（如石头），需在此循环中跳过无法下落的类型。