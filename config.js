// 游戏基础配置
const GAME_CONFIG = {
    ROWS: 8,                         // 棋盘行数
    COLS: 8,                         // 棋盘列数
    COLORS: ['c-red', 'c-blue', 'c-green', 'c-yellow', 'c-purple'], // 游戏中可能出现的方块颜色/元素
    MAX_JOKERS: 5,                   // 玩家最多可同时拥有的小丑牌数量上限
    INITIAL_MOVES: 10,               // 每局初始提供的可用步数 (Hands)（被关卡配置覆盖）
    TARGET_SCORE_BASE: 8000,         // 兜底目标分（被关卡配置覆盖）
    BASE_REWARD: 5,                  // 每次通关后给予的基础金币奖励
    MOVE_REWARD_MULTIPLIER: 2,       // 剩余步数转化为金币的倍数 (例如剩余2步，则额外奖励2×2=4金币)
    BASE_CHIP: 10,                   // 每个方块的基础分
    SLOT_TRIGGER_CHANCE: 0.3,        // 槽位触发概率（每次消除时每个有牌槽位的触发概率）
    MAX_SLOTS: 3,                    // 最大槽位数量
    SLOT_COSTS: [10, 30, 90],        // 槽位购买价格（按序号对应第1/2/3个槽位）
    MAX_JOKERS_PER_CELL: 3           // 单个方块最多叠加的小丑牌数量
};

// ========== 关卡配置 ==========
// 每个关卡的核心参数集中管理，后续新增关卡只需在此追加，无需改动主流程逻辑
// targetScore : 本关目标分
// moves       : 本关总步数
// maxSlots    : 本关允许使用的最大卡牌槽位数（实际可用 = min(已解锁槽位数, maxSlots)）
// unlockJokers: 首次通关后解锁的小丑牌 id 列表
const LEVEL_CONFIGS = [
    {
        id: 1,
        targetScore: 8000,
        moves: 10,
        maxSlots: 0,
        unlockJokers: ['joker-blue']
    },
    {
        id: 2,
        targetScore: 16000,
        moves: 10,
        maxSlots: 1,
        unlockJokers: ['joker-green']
    },
    {
        id: 3,
        targetScore: 28000,
        moves: 12,
        maxSlots: 1,
        unlockJokers: ['joker-yellow']
    },
    {
        id: 4,
        targetScore: 45000,
        moves: 12,
        maxSlots: 2,
        unlockJokers: ['joker-geo']
    },
    {
        id: 5,
        targetScore: 70000,
        moves: 14,
        maxSlots: 2,
        unlockJokers: ['joker-purple']
    },
    {
        id: 6,
        targetScore: 100000,
        moves: 14,
        maxSlots: 3,
        unlockJokers: ['joker-combo']
    }
];

/**
 * 根据关卡编号（1-based）获取关卡配置，缺失时返回安全兜底配置。
 * 同时对找到的配置做字段级归一化，防止漏配字段导致 NaN / undefined。
 * @param {number} levelId
 * @returns {object}
 */
function getLevelConfig(levelId) {
    const raw = LEVEL_CONFIGS.find(c => c.id === levelId);
    if (!raw) {
        // 整关缺失：按线性公式估算，打印告警方便开发期发现漏配
        console.warn(`[getLevelConfig] 关卡 ${levelId} 未配置，使用兜底估算值`);
        return {
            id: levelId,
            targetScore: levelId * GAME_CONFIG.TARGET_SCORE_BASE,
            moves: GAME_CONFIG.INITIAL_MOVES,
            maxSlots: GAME_CONFIG.MAX_SLOTS,
            unlockJokers: []
        };
    }
    // 字段级归一化：防止某个字段漏配导致 NaN / undefined 流入主流程
    return {
        id: raw.id,
        targetScore: (typeof raw.targetScore === 'number' && raw.targetScore > 0)
            ? raw.targetScore
            : levelId * GAME_CONFIG.TARGET_SCORE_BASE,
        moves: (typeof raw.moves === 'number' && raw.moves > 0)
            ? raw.moves
            : GAME_CONFIG.INITIAL_MOVES,
        maxSlots: (typeof raw.maxSlots === 'number' && raw.maxSlots >= 0)
            ? raw.maxSlots
            : GAME_CONFIG.MAX_SLOTS,
        unlockJokers: Array.isArray(raw.unlockJokers) ? raw.unlockJokers : []
    };
}

// ========== 卡池可用性分层 ==========
// BASE_JOKER_IDS：游戏初始就可以在商店中购买的基础牌（无需通关解锁）
// 其余牌（奖励牌）只有在对应关卡首次通关后才进入可获得卡池
const BASE_JOKER_IDS = new Set(['joker-red']);

// 小丑牌卡池配置
const JOKER_POOL = [
    { id: 'joker-red',    name: '红莲之心', desc: '消除红色方块时<br>倍率加成 (Mult) +3',  cost: 5,  color: 'c-red'    },
    { id: 'joker-blue',   name: '海蓝宝石', desc: '消除蓝色方块时<br>基础分加成 (Chips) +50', cost: 5,  color: 'c-blue'   },
    { id: 'joker-green',  name: '翡翠之叶', desc: '消除绿色方块时<br>倍率加成 (Mult) +4',  cost: 6,  color: 'c-green'  },
    { id: 'joker-yellow', name: '黄金之风', desc: '消除黄色方块时<br>基础分加成 (Chips) +60', cost: 6,  color: 'c-yellow' },
    { id: 'joker-purple', name: '虚空之眼', desc: '消除紫色方块时<br>倍率加成 (Mult) +5',  cost: 10, color: 'c-purple' },
    { id: 'joker-geo',    name: '几何大师', desc: '达成5连消及以上时<br>倍率加成 (Mult) +6', cost: 8,  type: 'shape'    },
    { id: 'joker-combo',  name: '多米诺',   desc: '连击数>=3时<br>倍率加成 (Mult) +8',    cost: 12, type: 'combo'     }
];
