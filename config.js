// 游戏基础配置
const GAME_CONFIG = {
    ROWS: 8,                         // 棋盘行数
    COLS: 8,                         // 棋盘列数
    COLORS: ['c-red', 'c-blue', 'c-green', 'c-yellow', 'c-purple'], // 游戏中可能出现的方块颜色/元素
    MAX_JOKERS: 5,                   // 玩家最多可同时拥有的小丑牌数量上限
    INITIAL_MOVES: 10,               // 每局初始提供的可用步数 (Hands)
    TARGET_SCORE_BASE: 8000,         // 第一关的目标分数 (后续关卡为 关卡数 × 该基础分)
    BASE_REWARD: 5,                  // 每次通关后给予的基础金币奖励
    MOVE_REWARD_MULTIPLIER: 2,       // 剩余步数转化为金币的倍数 (例如剩余2步，则额外奖励2×2=4金币)
    BASE_CHIP: 10                    // 每个方块的基础分
};

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
