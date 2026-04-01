# 实现日志 - v2.2

## 概述

v2.2 引入小丑牌槽位系统，增加开局选牌环节、概率触发机制、方块多效果叠加，以及商店槽位商品。所有变更严格按照 `changelog-v2.2.md` 执行，不添加策划未要求的功能。

---

## 变更文件

| 文件 | 变更类型 |
|------|----------|
| `config.js` | 新增配置项 |
| `index.html` | CSS 新增 + HTML 新增 + JS 全面修改 |

---

## 详细实现记录

### 1. `config.js` 新增配置项

在 `GAME_CONFIG` 对象末尾新增四个字段：

```js
SLOT_TRIGGER_CHANCE: 0.3,        // 槽位触发概率
MAX_SLOTS: 3,                    // 最大槽位数量
SLOT_COSTS: [10, 30, 90],        // 槽位购买价格（索引对应第1/2/3个槽位）
MAX_JOKERS_PER_CELL: 3           // 单方块最多叠加的小丑牌数量
```

### 2. 槽位数据模型（JS 变量）

在全局变量区新增：

```js
let slots = [];           // slots[i] = null | jokerObject，记录各槽位装入的牌
let unlockedSlots = 0;    // 已解锁槽位数，与 slots.length 保持同步
let pickerSelectedJoker = null;  // 选牌界面中当前选中的背包牌
```

- `resetGameFull()` 中重置 `slots = []`，`unlockedSlots = 0`。
- 购买槽位（`buySlot()`）时执行 `unlockedSlots++; slots.push(null)`。

### 3. `board[r][c].joker` → `board[r][c].jokers` 数组（影响面最大）

**改动覆盖范围：**

| 位置 | 旧代码 | 新代码 |
|------|--------|--------|
| `initGame()` 棋盘生成 | `joker: null` | `jokers: []` |
| `processMatches()` 下落填充 | `joker: null` | `jokers: []` |
| `renderBoard()` 徽章渲染 | `if(cellData.joker)` 渲染单个徽章 | `cellData.jokers.forEach(...)` 渲染多个徽章 |
| `attachJokerToCell()` 手动附着 | `cell.joker = {...}` | `cell.jokers.push({...})` |
| `autoAttachFromInventory()` 自动附着 | `cell.joker = {...}` | `cell.jokers.push({...})` |
| `processMatches()` 粒子特效判断 | `cellData.joker` | `cellData.jokers.forEach(...)` |
| `processMatches()` 计分逻辑 | `const joker = cellData.joker` | `cellData.jokers.forEach(joker => {...})` |

**全局搜索验证**：执行正则 `board\[.*\]\[.*\]\.joker[^s]` 返回 0 个结果，确认无遗留旧引用。

### 4. `renderBoard()` 多徽章渲染

从右上角向左依次排列多个徽章，每个徽章占用 22px（20px 宽 + 2px 间距）：

```js
jokers.forEach((joker, idx) => {
    const badge = document.createElement('div');
    badge.className = `joker-badge ${getJokerBadgeClass(joker)}`;
    badge.innerText = getJokerBadgeText(joker);
    badge.style.right = `${-4 + idx * 22}px`;  // 第0个最右，依次向左
    badge.style.top = '-4px';
    cell.appendChild(badge);
});
```

### 5. `attachJokerToCell()` 手动附着

改为 push 到 `jokers` 数组，增加两个限制：
- **上限检查**：`cell.jokers.length >= MAX_JOKERS_PER_CELL` 时拒绝附着
- **重复检查**：`cell.jokers.some(j => j.id === attachingJoker.id)` 时拒绝附着

### 6. `autoAttachFromInventory()` 完整重写

分两个阶段：

**第一阶段：背包自动附着（适配多效果上限）**
- 候选方块筛选改为：`cell.jokers.length < maxPerCell`（有空位）
- 使用 `cellJokerCount` 对象追踪本次已分配数，防止同一方块超量附着
- 每张背包牌随机附着一个方块（逻辑与原版一致，但用 push 代替赋值）

**第二阶段：槽位触发（v2.2 新增）**
- 遍历 `slots` 数组，对每个非空槽位独立判定 `SLOT_TRIGGER_CHANCE`（30%）
- 触发后在所有符合条件且未满上限的方块中随机选一个，执行 `jokers.push({...slotJoker})`
- 槽位中的牌**不消耗**（slots[i] 保持不变）
- 触发动画复用 `spawnAutoAttachParticle()`，fromEl 指向背包中同名牌的 DOM 元素

### 7. 计分逻辑多效果累加

```js
// 遍历该方块上所有 jokers，各自判定是否触发，触发则累加 chipBonus / multBonus
jokers.forEach(joker => {
    let thisChip = 0, thisMult = 0, active = false;
    // ... 颜色类/几何/多米诺判定 ...
    if(active) {
        chipBonus += thisChip;
        multBonus += thisMult;
        jokersForPanel.push({ joker, chipBonus: thisChip, multBonus: thisMult });
    }
});
```

panelRows 中的 `joker` 字段改为 `jokers` 数组（`[{ joker, chipBonus, multBonus }]`）。

### 8. 计分面板多卡牌展示

`showScorePanel()` 中，按 chipBonus 和 multBonus 分别过滤有效卡牌，构建带颜色高亮的片段：

```
🟥 (10 +50 ◆海蓝宝石) × (1 +3 ♥红莲之心 +5 ◉虚空之眼) = 240
```

每张触发的卡牌独立显示名称和数值，颜色高亮保持不变。

### 9. 商店新增槽位商品

在 `openShop()` 末尾判断 `unlockedSlots < MAX_SLOTS`，若满足则注入槽位商品 DOM：
- 样式类 `slot-shop-item`（紫色边框 `#7c4dff`）区分视觉
- 价格取自 `GAME_CONFIG.SLOT_COSTS[unlockedSlots]`
- 购买逻辑在独立函数 `buySlot()` 中处理

### 10. 商店"进入下一局"按钮

将 `onclick="initGame()"` 改为 `onclick="onNextLevelClick()"`：

```js
function onNextLevelClick() {
    if(unlockedSlots > 0 && inventory.length > 0) {
        openSlotPicker();   // 有槽位且有背包牌 → 弹出选牌界面
    } else {
        initGame();         // 无槽位或背包为空 → 直接进入关卡
    }
}
```

### 11. 开局选牌界面

**HTML**：新增 `#slotPickerOverlay` 全屏遮罩 + `.slot-picker-panel` 面板，包含：
- 标题 + 操作提示
- `#slotPickerSlots`：槽位行（由 JS 注入）
- `#slotPickerInventory`：背包牌行（由 JS 注入）
- "开始挑战 ▶" 按钮（`onclick="closeSlotPicker()"`）

**CSS**：新增 `.slot-picker-panel`、`.slot-card`、`.picker-joker-card` 等样式，槽位在选中牌时显示脉冲高亮（复用 `attachPulse` 动画）。

**JS 逻辑**：
- `openSlotPicker()`：重置 `pickerSelectedJoker`，渲染后显示遮罩
- `closeSlotPicker()`：隐藏遮罩，调用 `initGame()`
- `renderSlotPicker()`：
  - 槽位行：空槽位在 `pickerSelectedJoker` 非空时显示高亮，点击装入；有牌槽位点击退回
  - 背包行：点击牌切换 `pickerSelectedJoker`，再点击空槽位装入
  - 同一张牌可以装入多个槽位（策划文档明确允许）
- **选牌记忆**：`slots` 是全局持久变量，从商店离开后配置默认保留；玩家可在选牌界面调整

---

## 验证结果

| 验证项 | 结果 |
|--------|------|
| JS 语法（node Function 构造器解析） | ✅ 通过 |
| config.js 语法（node require） | ✅ 通过 |
| Lint 检查（index.html） | ✅ 0 错误 0 警告 |
| Lint 检查（config.js） | ✅ 0 错误 0 警告 |
| `board[r][c].joker` 旧引用残留检查 | ✅ 0 个残留 |
| 浏览器预览（localhost:8888） | ✅ 正常加载 |

---

## 不变的部分（已验证未动）

- 计分公式：`(基础分 + chipBonus) × (baseMult + multBonus)` ✅
- 基础倍率判定逻辑（被移动方块交叉点方向数） ✅
- 通关/失败判定逻辑 ✅
- 金币基础奖励和步数奖励 ✅
- 小丑牌永久持有机制 ✅
- 背包渲染 `renderInventory()` ✅
- 附着模式 `startAttachMode()` / `cancelAttachMode()` ✅
