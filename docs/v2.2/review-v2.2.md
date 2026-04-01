# 代码评审报告 - v2.2

**评审人**：技术负责人  
**评审日期**：2025-07-15  
**评审文件**：`config.js`、`index.html`  
**参照文档**：`changelog-v2.2.md`、`implementation-v2.2.md`

---

## 一、总体评价

v2.2 版本的实现质量整体**良好**，核心功能（槽位系统、多效果叠加、开局选牌、商店槽位商品）均已按策划文档落地，`joker → jokers` 数组迁移彻底无残留。但存在若干**逻辑偏差**和**潜在 bug**，需要在合并前修复。

**综合评分：78 / 100**

---

## 二、逐项评审

### ✅ 评审项 1：代码是否严格遵循策划变更日志？有无臆想功能？

**评分：9 / 10**

| 检查点 | 结果 | 说明 |
|--------|------|------|
| 4 项 config 新增 | ✅ 通过 | `SLOT_TRIGGER_CHANCE`、`MAX_SLOTS`、`SLOT_COSTS`、`MAX_JOKERS_PER_CELL` 值均正确 |
| 槽位基本规则（0~3 个，价格递增） | ✅ 通过 | |
| 开局选牌界面 | ✅ 通过 | |
| 商店槽位商品 | ✅ 通过 | |
| 计分面板多卡牌展示 | ✅ 通过 | |
| 手动附着保留 | ✅ 通过 | |
| 无臆想功能 | ✅ 通过 | 未发现策划文档以外的额外功能 |

**发现 1 个偏差（⚠️ 中等）**：

> **`onNextLevelClick()` 跳转条件与策划不一致**
>
> - **策划文档**（changelog 第 44 行）：「如果玩家有已解锁的槽位，弹出选牌界面；如果没有槽位（0 个），跳过此界面直接进入关卡」
> - **实际代码**（第 1963 行）：`if(unlockedSlots > 0 && inventory.length > 0)`
> - **问题**：代码额外增加了 `inventory.length > 0` 条件。策划文档**没有**说"背包为空时跳过选牌界面"，只说"没有槽位时跳过"。虽然背包为空时选牌界面确实无牌可选，但：
>   1. 玩家仍应看到自己的槽位配置（上一局的记忆）
>   2. 已装入槽位的牌应该继续展示，玩家可能需要卸下
>   3. 策划未授权这个优化跳过
> - **风险**：低。当背包为空且槽位有牌时，无法进入选牌界面查看/管理已装配的槽位。
> - **建议**：改为 `if(unlockedSlots > 0)` 以严格遵循策划。

---

### ✅ 评审项 2：joker → jokers 数组迁移是否完整？

**评分：10 / 10**

通过正则 `cellData\.joker[^s]` 和 `cell\.joker[^s]` 全局搜索确认：**0 个残留**。

| 位置 | 状态 |
|------|------|
| `initGame()` 棋盘生成 | ✅ `jokers: []` |
| `processMatches()` 下落填充 | ✅ `jokers: []` |
| `renderBoard()` 徽章渲染 | ✅ `cellData.jokers.forEach(...)` |
| `attachJokerToCell()` 手动附着 | ✅ `cell.jokers.push(...)` |
| `autoAttachFromInventory()` 自动附着 | ✅ `cell.jokers.push(...)` |
| `processMatches()` 计分逻辑 | ✅ `cellData.jokers.forEach(...)` |
| `processMatches()` 粒子特效 | ✅ `cellData.jokers.forEach(...)` |
| 交换注释（第 1287 行） | ⚠️ 注释仍写 `// 交换整个 cell 数据（color + joker）`，应改为 `jokers` |

> 注释不影响逻辑，但应保持一致性。

---

### ⚠️ 评审项 3：槽位触发逻辑是否正确（30% 概率、不消耗、受上限限制）？

**评分：8 / 10**

| 检查点 | 结果 | 说明 |
|--------|------|------|
| 30% 概率判定 | ✅ 正确 | `Math.random() >= 0.3` 即 70% 跳过，30% 继续 |
| 不消耗槽位牌 | ✅ 正确 | 触发后 `slots[i]` 未修改 |
| 受 `MAX_JOKERS_PER_CELL` 上限限制 | ✅ 正确 | `cell.jokers.length >= maxPerCell` 时跳过 |
| 每个槽位每次消除最多触发一次 | ✅ 正确 | for 循环每个 slot 最多执行一次 push |
| 颜色类牌只匹配对应颜色方块 | ✅ 正确 | `if(slotJoker.color && cell.color !== slotJoker.color) continue` |

**发现 1 个问题（⚠️ 中等）**：

> **槽位触发时机问题：槽位触发未考虑第一阶段（背包自动附着）已增加的 jokers 数量**
>
> - 第一阶段背包自动附着后，某些方块的 `jokers.length` 已经增加了（因为执行了 `board[tgt.r][tgt.c].jokers.push(...)`）
> - 但第二阶段槽位触发时，重新遍历棋盘检查 `cell.jokers.length >= maxPerCell`，这**已经**包含了第一阶段 push 的效果
> - 所以第二阶段的上限检查是**正确的**（因为 push 是直接修改 board 数据的）
> - ✅ 此项实际无问题，撤回。

**发现 1 个问题（⚠️ 低）**：

> **槽位触发的飞行动画 `fromEl` 不够准确**
>
> - 策划文档第 87 行：「槽位触发时：槽位卡牌闪烁 + 粒子飞向目标方块」
> - 实际代码（第 1036-1037 行）：`const invEl = document.getElementById('inv-' + att.joker.id)`，即粒子始终从**背包卡牌 DOM** 飞出
> - **问题**：应该从**槽位 DOM** 飞出才符合策划的"槽位卡牌闪烁"描述，但游戏进入关卡后并没有槽位 DOM 在界面上显示（选牌界面已关闭），所以从背包飞出是合理的替代方案
> - **风险**：低，视觉差异微小
> - **建议**：可在后续版本中添加 HUD 中的槽位小图标作为粒子源

---

### ✅ 评审项 4：方块多效果叠加计分是否正确？

**评分：9 / 10**

| 检查点 | 结果 |
|--------|------|
| 多张卡牌 chipBonus 独立累加 | ✅ `chipBonus += thisChip` |
| 多张卡牌 multBonus 独立累加 | ✅ `multBonus += thisMult` |
| 公式 `(baseChip + chipBonus) × (baseMult + multBonus)` | ✅ 正确 |
| 方块上限 3 张 | ✅ `MAX_JOKERS_PER_CELL = 3` |

**发现 1 个问题（⚠️ 中等）**：

> **手动附着的重复检查逻辑 vs 自动附着/槽位触发的无重复检查不一致**
>
> - **手动附着** `attachJokerToCell()`（第 1145 行）：`cell.jokers.some(j => j.id === attachingJoker.id)` → 同种牌不能重复附着
> - **自动附着** `autoAttachFromInventory()` 第一阶段（第 990 行）：无重复检查 → 如果背包有多张同种牌（目前 `addToInventory` 不允许，但 `count` 字段暗示可叠加），理论上可能同种牌附着到同一方块
> - **槽位触发** 第二阶段（第 1024 行）：无重复检查 → 如果多个槽位装了同一张牌，且触发后随机命中同一方块，就会出现同种牌重复附着
> - **策划文档没有明确说明**是否允许同种牌重复附着到同一方块。手动附着做了限制，但自动附着和槽位触发没做。
> - **风险**：中等。可能导致玩家通过"3 个槽位放同一张牌"的策略，让同一方块叠加 3 张相同效果（如 3 张红莲之心 → +9 倍率），这可能是策划未预期的。
> - **建议**：统一规则——要么全部允许重复，要么全部禁止。建议在槽位触发中增加 `cell.jokers.some(j => j.id === slotJoker.id)` 检查，与手动附着保持一致。

---

### ✅ 评审项 5：商店槽位商品是否正确？

**评分：10 / 10**

| 检查点 | 结果 |
|--------|------|
| 根据 `unlockedSlots` 展示下一个槽位 | ✅ `slotIndex = unlockedSlots` |
| 价格取自 `SLOT_COSTS[slotIndex]` | ✅ |
| 购满 3 个后不再显示 | ✅ `if(unlockedSlots < MAX_SLOTS)` |
| 与小丑牌并列展示 | ✅ 追加到 `shopItemsContainer` |
| 紫色边框视觉区分 | ✅ `.slot-shop-item` CSS |
| 购买逻辑（扣金币、解锁槽位） | ✅ `buySlot()` |

无问题。

---

### ⚠️ 评审项 6：开局选牌界面功能是否完整？

**评分：7 / 10**

| 检查点 | 结果 |
|--------|------|
| 展示时机（有槽位时弹出） | ⚠️ 见评审项 1 的偏差 |
| 顶部显示已解锁槽位 | ✅ |
| 下方显示背包所有小丑牌 | ✅ |
| 点击背包牌 → 点击空槽位 → 装入 | ✅ |
| 点击已装牌的槽位 → 退回背包 | ✅ |
| 每个槽位只能装 1 张牌 | ✅ |
| 同一张牌可装入多个槽位 | ✅ 策划明确允许 |
| "开始挑战"按钮 | ✅ |
| 选牌记忆（上局配置保留） | ✅ `slots` 是全局变量 |

**发现 2 个问题**：

> **问题 1（⚠️ 中等）：策划说"没有槽位（0个），跳过此界面"，但未考虑 resetGameFull 的流程**
>
> - `resetGameFull()` 中先调用 `renderInventory()` 再调用 `initGame()`，这是直接进入游戏
> - 这意味着新游戏开始时永远不会弹选牌界面（因为 `unlockedSlots = 0`），这符合策划
> - ✅ 此项无问题

> **问题 2（🐛 Bug）：选牌界面的"退回背包"操作只清空 `slots[i] = null`，但没有真正"退回"任何东西**
>
> - 观察代码第 2009-2011 行：点击已装牌的槽位 → `slots[i] = null` → 重新渲染
> - 因为槽位中的牌只是**引用**背包中已有的牌（不是从背包移走的），所以"退回"只是概念上的
> - 这个行为实际上**是正确的**——牌始终在背包中，槽位只是引用
> - ✅ 此项无问题

> **问题 3（⚠️ 中等）：`resetGameFull()` 时 `slots` 被清空，但如果后续购买了新槽位并配置了牌，再调用 `resetGameFull()` 重新开始后仍会给一张初始红莲之心——这里 `slots` 和 `unlockedSlots` 都正确重置了**
>
> - ✅ 此项无问题

**实际发现的问题（⚠️ 低）**：

> **问题 A：选牌界面没有无槽位时的空状态提示**
>
> 当 `unlockedSlots = 0` 时不会弹出选牌界面，所以这不是问题。但如果 `unlockedSlots > 0 && inventory.length === 0`（有槽位但背包为空），也不会弹出。如果按前述建议将条件改为 `unlockedSlots > 0`，则需要处理背包为空的展示。

---

### ✅ 评审项 7：计分面板多卡牌展示是否正确？

**评分：9 / 10**

| 检查点 | 结果 |
|--------|------|
| chipBonus 部分：按 joker 分别展示 `+N ♦名称` | ✅ |
| multBonus 部分：按 joker 分别展示 `+N ♥名称` | ✅ |
| 颜色高亮 CSS 类 | ✅ `jokerToBonusClass()` |
| 无卡牌时简化展示 | ✅ 只显示 `基础分 10` / `倍率 1` |

**发现 1 个问题（⚠️ 低）**：

> **面板展示格式与策划示例略有差异**
>
> - 策划示例：`🟥 (10 +50 ♦海蓝宝石) × (2 +3 ♥红莲之心 +5 ◉虚空之眼) = 600`
> - 实际代码生成的格式（无卡牌触发时）：`🟥 基础分 10 × 倍率 1 = 10`
> - 策划示例中即使只有基础值也用括号包裹，而实际代码在无卡牌时不用括号
> - **风险**：极低，纯展示差异，不影响功能

---

### 🐛 评审项 8：潜在 Bug（边界条件、null 检查等）

**评分：7 / 10**

#### Bug 1（🐛 严重）：`buySlot()` 存在重复购买的竞态风险

```js
function buySlot(slotIndex, cost, element) {
    if(unlockedSlots >= GAME_CONFIG.MAX_SLOTS) return;
    if(gold < cost) { ... }
    gold -= cost;
    unlockedSlots++;
    slots.push(null);
    element.classList.add('sold');
    ...
}
```

- **问题**：`slotIndex` 参数是闭包捕获的值，但 `unlockedSlots` 是全局变量。如果玩家快速双击槽位商品按钮，第一次点击使 `unlockedSlots` 从 0 变为 1，第二次点击仍然用 `slotIndex=0`、`cost=10` 的参数，但 `unlockedSlots` 已经是 1 了——此时 guard `unlockedSlots >= MAX_SLOTS` 不会拦截，导致以第一个槽位的价格（10 金币）购买了第二个槽位（应该 30 金币）。
- **影响**：玩家可以用 10 金币买到应该 30 金币的槽位。
- **修复建议**：在 `buySlot()` 内部重新从 `unlockedSlots` 读取实际应该支付的价格：
  ```js
  function buySlot(slotIndex, cost, element) {
      if(unlockedSlots >= GAME_CONFIG.MAX_SLOTS) return;
      const actualCost = GAME_CONFIG.SLOT_COSTS[unlockedSlots];
      if(gold < actualCost) { ... }
      gold -= actualCost;
      ...
  }
  ```
  或者在购买成功后重新渲染整个商店。

#### Bug 2（🐛 中等）：`autoAttachFromInventory()` 第一阶段的 `cellJokerCount` 只防超量但不防同种重复

- 第一阶段中（第 959-992 行），背包中的每张牌依次寻找候选方块并 push
- `cellJokerCount` 只追踪方块上的附着总数（上限检查），但没有检查该方块是否已有同种牌
- 当前 `addToInventory()` 不允许背包中有重复牌（第 1156-1157 行），所以不会出问题
- **但如果未来允许背包有多张同种牌**（`count` 字段暗示了这种可能），此处就是隐患
- **建议**：添加防御性重复检查

#### Bug 3（🐛 低）：计分面板中 `chipStr` 在无卡牌时显示 `基础分 10`，有卡牌时显示 `(10 +50 ◆海蓝宝石)`——两种格式混合

- 当一个方块有 chipBonus 但无 multBonus（或反之），括号的有无不一致
- 例如：`🟥 (10 +50 ◆海蓝宝石) × 倍率 1 = 60`——左边有括号右边没有
- 虽然功能正确，但阅读体验略怪

#### Bug 4（🐛 低）：粒子动画中 `endY` 计算包含 `window.scrollY` 但 `particle` 使用 `position: absolute`

- `spawnAutoAttachParticle()`（第 1052 行）：`endY = rect.top + toR * cellWidth + cellWidth / 2 + window.scrollY`
- 粒子元素被 `appendChild` 到 `document.body`
- `position: absolute` 相对于最近的定位祖先（body），如果 body 没有 `position: relative`，则相对于初始包含块
- 当页面内容超出一屏需要滚动时，`window.scrollY` 偏移可能导致粒子位置不准确
- **风险**：当前游戏界面通常不超过一屏，影响极低
- **建议**：改用 `position: fixed` 并去掉 `scrollY`，或确保 body 设置 `position: relative`

#### Bug 5（⚠️ 注意）：商店关闭逻辑中未处理选牌界面打开后的 `shopScreen` 显隐

- `onNextLevelClick()` 调用 `openSlotPicker()` 但未先关闭 `shopScreen`
- `closeSlotPicker()` 调用 `initGame()`，而 `initGame()` 中第 760 行 `shopScreen.style.display = 'none'` 负责关闭
- 所以流程是：商店打开 → 点击下一局 → 选牌界面弹出（叠在商店上方，z-index 500 > 210）→ 点击开始挑战 → `initGame()` 关闭商店
- **实际无 bug**：因为 z-index 保证了选牌界面在最上层，商店虽在底下但不可见
- ✅ 此项无问题

---

## 三、问题汇总表

| # | 严重级别 | 类型 | 描述 | 位置 |
|---|----------|------|------|------|
| 1 | 🐛 严重 | 逻辑 Bug | `buySlot()` 闭包参数导致快速双击可以低价购买高级槽位 | `index.html:1928` |
| 2 | ⚠️ 中等 | 策划偏差 | `onNextLevelClick()` 多加了 `inventory.length > 0` 条件，与策划不符 | `index.html:1963` |
| 3 | ⚠️ 中等 | 逻辑不一致 | 手动附着禁止同种牌重复，但槽位触发/自动附着不禁止，规则不统一 | `index.html:999-1026` |
| 4 | ⚠️ 低 | 注释过时 | 交换逻辑注释仍写 `color + joker` 应改为 `color + jokers` | `index.html:1287` |
| 5 | ⚠️ 低 | 视觉偏差 | 槽位触发的粒子从背包飞出而非从"槽位"飞出 | `index.html:1036` |
| 6 | ⚠️ 低 | 展示差异 | 计分面板有/无卡牌时括号格式不一致 | `index.html:1674-1699` |
| 7 | 💡 建议 | 健壮性 | `autoAttachFromInventory` 第一阶段应添加同种牌重复检查 | `index.html:959-992` |
| 8 | 💡 建议 | 健壮性 | 粒子动画应使用 `position: fixed` 以避免滚动偏移问题 | `index.html:1047-1126` |

---

## 四、各模块评分明细

| 评审项 | 满分 | 得分 | 说明 |
|--------|------|------|------|
| 1. 遵循策划变更日志 | 10 | 9 | `onNextLevelClick` 条件偏差 |
| 2. joker→jokers 迁移完整性 | 10 | 10 | 完美，零残留 |
| 3. 槽位触发逻辑 | 15 | 12 | 核心正确，重复检查不一致 |
| 4. 多效果叠加计分 | 15 | 14 | 计分公式正确，面板格式小瑕疵 |
| 5. 商店槽位商品 | 10 | 8 | 功能完整，但 `buySlot` 有竞态 Bug |
| 6. 开局选牌界面 | 15 | 13 | 功能完整，展示时机条件偏差 |
| 7. 计分面板多卡牌展示 | 10 | 9 | 格式基本正确，括号不一致 |
| 8. 潜在 Bug | 15 | 12 | 发现 1 个严重 Bug + 若干小问题 |
| **总计** | **100** | **78** | |

---

## 五、结论与建议

### 必须修复（合并前）

1. **`buySlot()` 竞态 Bug**：在函数内部从 `unlockedSlots` 实时读取 `SLOT_COSTS`，不要依赖闭包参数的 `cost`。或者购买成功后调用 `openShop()` 重新渲染整个商店。
2. **`onNextLevelClick()` 条件修正**：去掉 `inventory.length > 0`，改为 `if(unlockedSlots > 0)`。

### 建议修复（可在下一迭代处理）

3. 统一手动附着与自动附着/槽位触发的同种牌重复规则。
4. 更新第 1287 行的过时注释。
5. 计分面板括号格式统一。

### 代码质量总评

- **架构**：保持单文件结构，逻辑清晰，函数职责明确
- **可读性**：注释详尽，变量命名规范
- **迁移完整性**：`joker → jokers` 迁移非常彻底，值得肯定
- **CSS/HTML**：选牌界面样式完整，交互自然
- **测试建议**：建议增加以下手动测试用例：
  - 快速双击槽位购买按钮
  - 3 个槽位装同一张牌 → 消除 → 观察是否同方块出现 3 张相同效果
  - 有槽位但背包为空时点击"进入下一局"

---

*评审完毕。请程序员针对上述 #1、#2 两项必须修复的问题提交修复后重新提测。*
