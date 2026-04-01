# 实现日志 - v2.1

## 1. 实现概要

v2.1 版本的核心目标是**重构计分逻辑**并新增**计分展示面板 UI**，让玩家清晰感知每次消除的得分来源。主要变化如下：

- **新计分公式**：以「单方块」为粒度计分，公式为 `(基础分 + 基础分加成) × (基础倍率 + 倍率加成)`
- **基础倍率**：由本次消除涉及的方向数（横/竖/斜）决定（1~3），替代了原先混合 `size + combo` 的模糊逻辑
- **小丑牌效果重整**：所有小丑牌统一为「基础分加成」或「倍率加成」两类，移除旧的乘法类（×1.5、×2、×3）
- **连击不再影响分数**：`comboCounter` 仅用于触发「多米诺」的条件判断，不参与任何分数计算
- **计分展示面板**：右侧新增面板，每次消除后逐步动画展示方向判定、逐方块明细、总分汇总
- **移除旧浮动文字**：不再弹出 `chips × mult` 的浮动文字，全部由计分面板呈现

---

## 2. 修改文件清单

| 文件 | 类型 | 变更摘要 |
|------|------|---------|
| `config.js` | 修改 | 新增 `BASE_CHIP: 10`；修改 5 张小丑牌描述为加成类型 |
| `index.html` | 修改 | CSS 样式、HTML 结构、JS 逻辑全面更新（见下） |

---

## 3. 关键实现细节

### 3.1 `config.js` — 新增 BASE_CHIP & 小丑牌效果描述更新

```js
BASE_CHIP: 10   // 每个方块的基础分（新增）
```

小丑牌效果调整（desc 及注释更新）：

| 小丑牌 | 旧效果 | 新效果 |
|--------|--------|--------|
| 虚空之眼 | 最终计分 ×1.5 | 倍率加成 Mult +5 |
| 几何大师 | 最终计分 ×2 | 倍率加成 Mult +6（5连消及以上） |
| 多米诺   | 最终计分 ×3 | 倍率加成 Mult +8（连击数>=3） |

---

### 3.2 `findMatches` — 返回方向信息

原函数返回 `Array<{r,c}>`，v2.1 改为返回对象：

```js
{ cells: Array<{r,c}>, hasHorizontal: bool, hasVertical: bool, hasDiagonal: bool }
```

- `hasHorizontal`：本次匹配集合中包含水平方向的 4 连匹配
- `hasVertical`：包含垂直方向的 4 连匹配
- `hasDiagonal`：包含对角线方向（`\` 或 `/`）的 4 连匹配

调用方 `onCellClick` 和 `processMatches` 的递归调用均已同步更新。

---

### 3.3 `processMatches` — 新计分逻辑

**基础倍率计算：**

```js
const dirCount = (hasHorizontal ? 1 : 0) + (hasVertical ? 1 : 0) + (hasDiagonal ? 1 : 0);
const baseMult = Math.max(1, dirCount); // 1、2 或 3
```

**逐方块计分：**

```js
// 每个被消除的方块独立计算
const baseChip  = GAME_CONFIG.BASE_CHIP;  // 10
const totalChip = baseChip + chipBonus;   // 卡牌 Chips 加成
const totalMult = baseMult + multBonus;   // 卡牌 Mult 加成
const cellScore = totalChip * totalMult;
```

**小丑牌触发条件不变，效果改为加成：**

| 小丑牌 | 触发条件 | 新效果 |
|--------|--------|--------|
| 红莲之心 | 附在红色方块上被消除 | `multBonus += 3` |
| 海蓝宝石 | 附在蓝色方块上被消除 | `chipBonus += 50` |
| 翡翠之叶 | 附在绿色方块上被消除 | `multBonus += 4` |
| 黄金之风 | 附在黄色方块上被消除 | `chipBonus += 60` |
| 虚空之眼 | 附在紫色方块上被消除 | `multBonus += 5` |
| 几何大师 | size >= 5 时触发 | `multBonus += 6` |
| 多米诺   | comboCounter >= 3 时触发 | `multBonus += 8` |

**连击不再参与分数：** `comboCounter` 不加 mult，仅用于判断多米诺触发条件。

**一次消除总分：** 所有方块的 `cellScore` 累加后一次性加入 `score`。

---

### 3.4 计分展示面板 UI

**HTML 结构（`div.game-area` 横向 flex 布局）：**

```html
<div class="game-area">        <!-- display:flex; gap:20px; -->
  <div style="position:relative;">   <!-- 棋盘 + overlay -->
    <div class="board" id="board"></div>
    <!-- gameOverScreen, shopScreen -->
  </div>
  <div class="score-panel" id="scorePanel">   <!-- 右侧面板 -->
    <div class="sp-title">⚔ 消除计分详情</div>
    <div id="spDirection" ...></div>
    <hr id="spDivider">
    <div id="spRows"></div>
    <div class="sp-total" id="spTotal">
      本次消除：<span class="sp-total-num" id="spTotalNum">+0</span>
    </div>
  </div>
</div>
```

**展示节奏（`showScorePanel` 函数）：**

1. 面板设为 `visible`（opacity: 0 → 1）
2. **+0ms**：方向判定行出现（CSS transition 淡入 + 上移）
3. **+300ms**：逐方块明细依次弹出（每行间隔 150ms，CSS transition 淡入 + 左移）
4. 所有行完成后：总分行出现（scale 动画）+ 总分数字 `bounce` 弹跳动画
5. **+2500ms**：面板触发 `fadeout`（opacity → 0，600ms 过渡）

**高亮色映射（有卡牌加成时对应颜色高亮）：**

| 颜色/类型 | CSS 类 | 颜色 |
|---------|--------|------|
| c-red | sp-bonus-red | `#ff8a80` |
| c-blue | sp-bonus-blue | `#82b1ff` |
| c-green | sp-bonus-green | `#b9f6ca` |
| c-yellow | sp-bonus-yellow | `#ffe57f` |
| c-purple | sp-bonus-purple | `#ea80fc` |
| shape（几何大师）| sp-bonus-shape | `#ff80ab` |
| combo（多米诺）| sp-bonus-combo | `#80d8ff` |

---

### 3.5 移除浮动文字

- 删除了 `.floating-text` CSS 样式及 `@keyframes floatUpAndFade`
- 删除了 `showFloatingText` 函数
- `processMatches` 中对 `showFloatingText` 的调用改为 `showScorePanel(...)`

---

### 3.6 不变部分确认

以下功能**未做任何修改**：

- 小丑牌自动附着机制（`autoAttachFromInventory`）
- 小丑牌永久持有（`addToInventory`）
- 商店购买机制（`openShop`、`buyItem`）
- 通关/失败判定（`checkGameState`）
- 金币奖励机制（`BASE_REWARD`、`MOVE_REWARD_MULTIPLIER`）
- 手动附着模式（`startAttachMode`、`cancelAttachMode`、`attachJokerToCell`）
- 棋盘初始化与无匹配验证
- 粒子特效动画（`spawnCellParticle`、`spawnAutoAttachParticle`）

---

## 4. 测试验证方法

### 4.1 基础倍率验证

| 操作 | 预期方向判定 | 预期基础倍率 |
|------|------------|------------|
| 仅触发横向4连 | `横向 → 基础倍率 ×1` | 1 |
| 同时触发横向+竖向 | `横向 + 竖向 → 基础倍率 ×2` | 2 |
| 同时触发横向+竖向+斜向 | `横向 + 竖向 + 斜向 → 基础倍率 ×3` | 3 |

**验证方法：** 触发消除后，观察右侧面板第一行的方向标签与倍率显示是否一致。

### 4.2 单方块计分验证

**无卡牌：** 基础 `10 × 1 = 10`（单方向时），面板显示 `🟥 基础分 10 × 倍率 1 = 10`

**有倍率加成（红莲之心 Mult+3）附在红色方块上，单方向消除：**
- 面板应显示：`🟥 基础分 10 × (1 +3 ♥红莲之心) = 40`

**有基础分加成（海蓝宝石 Chips+50）附在蓝色方块上，双方向消除：**
- 面板应显示：`🟦 (10 +50 ◆海蓝宝石) × 倍率 2 = 120`

### 4.3 连击不影响分数验证

连续消除（comboCounter = 2、3、4...），观察面板中的基础倍率只由方向数决定，不随 comboCounter 增加。

### 4.4 多米诺触发验证

comboCounter >= 3 时触发多米诺，面板中挂有多米诺的方块行应出现蓝色高亮 `+8 ⚡多米诺`。

### 4.5 几何大师触发验证

消除 5 个及以上同色方块时触发几何大师，面板中挂有几何大师的方块行应出现粉色高亮 `+6 ▲几何大师`。

### 4.6 JS 语法验证

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [];
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while((m = re.exec(html)) !== null) { scripts.push(m[1]); }
new Function(scripts.join('\n'));
console.log('✅ 语法正确');
"
```

运行结果：`✅ config.js 语法正确` + `✅ index.html 内联 JS 语法正确`
