# 实现日志 - v2.3

## 1. 实现概要

v2.3 的核心目标是**关卡规则配置化**，将原本散落在主流程中的关卡参数（目标分、步数）抽离为独立的关卡配置表，同时新增"每关槽位上限"和"通关解锁小丑牌"两个关卡级配置，并在通关反馈界面展示新解锁内容。

主要完成了以下 6 项功能：

1. 在 `config.js` 中新增 `LEVEL_CONFIGS` 数组和 `getLevelConfig()` 辅助函数
2. `initGame()` 改为从关卡配置读取 `targetScore` 和 `moves`
3. 选牌界面按 `min(unlockedSlots, levelCfg.maxSlots)` 限制展示槽位
4. 通关时按 `unlockJokers` 配置解锁奖励牌进入可获得卡池，仅首次通关触发
5. 商店弹窗新增"新解锁小丑牌"展示区，复用现有卡牌视觉信息
6. 关卡推进（`onNextLevelClick`）适配配置化，对缺失配置有安全兜底

---

## 2. 修改文件清单

| 文件 | 改动性质 | 说明 |
|------|----------|------|
| `config.js` | 新增 + 修改 | 新增 `LEVEL_CONFIGS`、`getLevelConfig()`（含字段级兜底）、`BASE_JOKER_IDS` |
| `index.html` | 修改 | JS 逻辑多处修改，HTML 商店弹窗新增 `#shopUnlockSection` 节点 |

---

## 3. 关键实现细节

### 3.1 关卡配置结构（`config.js`）

新增 `LEVEL_CONFIGS` 数组，每个元素包含：

```js
{
    id: 1,            // 关卡编号（1-based）
    targetScore: 8000, // 本关目标分
    moves: 10,         // 本关总步数
    maxSlots: 0,       // 本关最大可用槽位数
    unlockJokers: ['joker-blue'] // 首次通关解锁的小丑牌 id 列表
}
```

`getLevelConfig(levelId)` 函数：
- 用 `Array.find` 按 id 查找配置
- **整关缺失**：返回安全兜底对象（按线性公式估算目标分），同时打印 `console.warn` 告警
- **字段漏配**：对找到的配置做字段级归一化，防止 `NaN` / `undefined` 流入主流程：
  - `targetScore`：非正数时用 `levelId * TARGET_SCORE_BASE` 兜底
  - `moves`：非正数时用 `INITIAL_MOVES` 兜底
  - `maxSlots`：非数字或负数时用 `MAX_SLOTS` 兜底
  - `unlockJokers`：非数组时用 `[]` 兜底

### 3.2 卡池可用性分层（`config.js`）

新增 `BASE_JOKER_IDS`，标记初始就可在商店购买的基础牌（无需通关解锁）：

```js
const BASE_JOKER_IDS = new Set(['joker-red']);
```

商店可售卡池 = `BASE_JOKER_IDS ∪ unlockedJokerIds`，再排除已拥有的牌。
奖励牌（`joker-blue` 等）在对应关卡首次通关前不会出现在商店。

### 3.3 关卡目标分和步数读取配置（`initGame`）

```js
const levelCfg = getLevelConfig(level);
moves = levelCfg.moves;
target = levelCfg.targetScore;
```

原来的 `level * GAME_CONFIG.TARGET_SCORE_BASE` 和 `GAME_CONFIG.INITIAL_MOVES` 硬编码已移除。

### 3.4 每关最大槽位限制

**选牌界面**（`renderSlotPicker`）：

```js
const levelCfg = getLevelConfig(level);
const effectiveSlots = Math.min(unlockedSlots, levelCfg.maxSlots);
// 只渲染 effectiveSlots 个槽位卡片
```

- 若 `effectiveSlots === 0` 且玩家已有解锁槽位，展示"本关不允许使用槽位"提示
- 超出 `maxSlots` 的槽位不渲染，其内容不参与本局

**槽位触发**（`autoAttachFromInventory`）：

```js
const effectiveSlotsCount = Math.min(slots.length, levelCfgForSlot.maxSlots);
for(let si = 0; si < effectiveSlotsCount; si++) { ... }
```

只遍历有效槽位范围，超出限制的槽位不触发。

**进入下一局**（`onNextLevelClick`）：

```js
const effectiveSlots = Math.min(unlockedSlots, levelCfg.maxSlots);
if(effectiveSlots > 0) { openSlotPicker(); } else { initGame(); }
```

本关 `maxSlots = 0` 时直接开局，不弹选牌界面。

### 3.5 通关解锁小丑牌语义（`checkGameState`）

**语义**：通关后奖励牌进入"可获得/可购买"卡池，**不直接自动送背包**。玩家需要在后续商店中花金币购买。

```js
if(!clearedLevelIds.has(currentLevelId)) {
    clearedLevelIds.add(currentLevelId);
    saveSetToStorage(LS_KEY_CLEARED_LEVELS, clearedLevelIds);

    rewardIds.forEach(jokerId => {
        if(!unlockedJokerIds.has(jokerId)) {
            unlockedJokerIds.add(jokerId);
            newlyUnlockedJokers.push(jokerDef);
        }
    });
    if(newlyUnlockedJokers.length > 0) {
        saveSetToStorage(LS_KEY_UNLOCKED_JOKERS, unlockedJokerIds);
    }
}
```

- 用 `clearedLevelIds` 防止重复通关重复发放
- 用 `unlockedJokerIds` 防止同一张牌通过不同关卡重复解锁
- 解锁后立即持久化到 `localStorage`

### 3.6 解锁进度跨 run 持久化（`localStorage`）

新增两个 localStorage key 常量和工具函数：

```js
const LS_KEY_UNLOCKED_JOKERS = 'bm_unlockedJokerIds';
const LS_KEY_CLEARED_LEVELS  = 'bm_clearedLevelIds';

function loadSetFromStorage(key) { /* JSON.parse + 安全兜底 */ }
function saveSetToStorage(key, set) { /* JSON.stringify + try/catch */ }
```

- 页面初始化时从 `localStorage` 恢复两个 Set
- `resetGameFull()`（New Run）**不再清空**这两个 Set
- 安全兜底：首次进入（无数据）、数据损坏（parse 失败）、类型异常均返回空 Set

### 3.7 通关弹窗展示新解锁卡牌（`openShop`）

HTML 中新增 `<div id="shopUnlockSection">` 节点，位于商店标题和商品列表之间。

`openShop(newlyUnlockedJokers = [])` 接收新解锁列表：
- 有新解锁：渲染卡牌卡片（复用徽章符号、颜色、名称、描述等现有视觉信息），显示该区域
- 无新解锁（空列表或已领过）：隐藏该区域，不显示

### 3.8 安全兜底

`getLevelConfig` 对超出配置范围的关卡返回兜底对象，同时对已存在但字段漏配的关卡做字段级归一化，保证 `initGame`、`renderSlotPicker`、`autoAttachFromInventory` 等所有读取关卡配置的地方不会因 `undefined` / `NaN` 报错。

---

## 4. v2.3 评审修复记录（post-review patch）

根据 v2.3 评审结论（`review-v2.3.md`），修复了以下 4 个阻塞问题：

### 修复 1：奖励牌真正锁定（P0）

**问题**：商店从整个 `JOKER_POOL` 中售卖，未解锁奖励牌可提前购买。

**修复**：
- `config.js` 新增 `BASE_JOKER_IDS`，标记初始可售基础牌
- `openShop()` 中商店可售集合改为 `BASE_JOKER_IDS ∪ unlockedJokerIds`，再排除已拥有牌
- 奖励牌在对应关卡首次通关前不出现在商店

### 修复 2：解锁进度跨 run 保留（P0）

**问题**：`resetGameFull()` 清空 `unlockedJokerIds` 和 `clearedLevelIds`，重开即丢。

**修复**：
- 两个 Set 改用 `localStorage` 持久化（`bm_unlockedJokerIds`、`bm_clearedLevelIds`）
- 页面初始化时从 `localStorage` 安全读取恢复
- `resetGameFull()` 中移除对两个 Set 的清空操作
- 通关时立即写入 `localStorage`

### 修复 3：通关解锁语义正确（P0）

**问题**：通关后直接 `addToInventory`，奖励牌自动送背包，语义为"赠送"而非"解锁"。

**修复**：
- 通关后仅将 id 加入 `unlockedJokerIds`，不调用 `addToInventory`
- 新解锁的牌进入可购买卡池，玩家在后续商店中花金币购买
- 通关弹窗提示"新解锁了哪些牌"，语义清晰

### 修复 4：字段级兜底（P2）

**问题**：`getLevelConfig()` 只兜底"整关缺失"，字段漏配时返回 `undefined`，导致 `Math.min(x, undefined) = NaN`。

**修复**：
- `getLevelConfig()` 对找到的配置做字段级归一化
- `targetScore`、`moves`、`maxSlots`、`unlockJokers` 均有独立默认值兜底
- 整关缺失时新增 `console.warn` 告警，方便开发期发现漏配

---

## 5. 验证方法

### 语法验证

```bash
node --check config.js
# 提取 index.html 中的脚本后验证
node --check /tmp/index_scripts_v23.js
```

### 功能验证步骤

1. **关卡配置读取**
   - 启动游戏，确认第 1 关目标分显示 `8000`，步数显示 `10`
   - 通关进入第 2 关，确认目标分变为 `16000`，步数仍为 `10`

2. **每关槽位上限**
   - 在商店购买槽位 #1（花费 $10）
   - 通关第 1 关（`maxSlots = 0`）进入商店，点击"进入下一局"
   - 预期：直接开局，不弹选牌界面（第 1 关 `maxSlots = 0`）
   - 通关第 2 关（`maxSlots = 1`）进入商店，点击"进入下一局"
   - 预期：弹出选牌界面，只显示 1 个槽位

3. **商店卡池锁定验证**
   - 新游戏第 1 关商店，预期只出现"红莲之心"（`joker-red`，基础牌）
   - 通关第 1 关后，商店出现"新解锁小丑牌"提示，显示"海蓝宝石"
   - 此时商店商品中可出现"海蓝宝石"供购买
   - 重开（New Run）后，"海蓝宝石"仍可在商店购买（解锁进度保留）

4. **解锁进度保留验证**
   - 通关第 1 关后，点击"重新开始"（New Run）
   - 预期：`clearedLevelIds` 和 `unlockedJokerIds` 仍然保留
   - 再次通关第 1 关，商店弹窗不再出现"新解锁"提示（已解锁过）
   - 刷新页面后，解锁进度依然保留

5. **字段兜底验证**
   - 在浏览器控制台执行 `getLevelConfig(999)` 确认返回兜底对象而非报错
   - 控制台应出现 `[getLevelConfig] 关卡 999 未配置，使用兜底估算值` 告警
