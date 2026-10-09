// Game title and every balance number live here, so tuning is one file.

export const TITLE = '蔣寶大冒險';
export const SUBTITLE = '甘蔗的祝福';
export const TAGLINE = '丟掉甘蔗、發完鮮奶、拆了松山機場，看誰最快';

export const DIFFICULTY = {
  normal: { key: 'normal', label: '普通', hpMax: 100, biteMult: 1, spawnMult: 1, costMult: 1, notes: ['血量 100', '老鼠看到你才會追', '升級原價'] },
  hell: { key: 'hell', label: '地獄', hpMax: 70, biteMult: 1.6, spawnMult: 1.6, costMult: 1.5, notes: ['血量 70', '老鼠咬更痛、生更快', '升級貴 1.5 倍'] },
};

export const ITEMS = {
  wood: { name: '木頭', base: 6 },
  tail: { name: '鼠尾', base: 6 },
  bigtail: { name: '大鼠尾', base: 15 },
};

// drop value multiplier per district tier (大安/中山 → 信義 → 北投 → 萬華 / 松山)
export const TIER_VALUE = [1, 1, 1.6, 2.3, 3.2, 3.2];

export const TOOLS = [
  { name: '斧頭', dmg: 1, interval: 0.5, range: 2.7, cost: 0, sfx: 'chop' },
  { name: '大鋸子', dmg: 2, interval: 0.42, range: 2.9, cost: 90, sfx: 'chop' },
  { name: '電鋸', dmg: 3.2, interval: 0.18, range: 3.0, cost: 320, sfx: 'saw' },
  { name: '怪手', dmg: 15, interval: 0.6, range: 4.6, cost: 1100, sfx: 'dig' },
];

export const ARMOR = [
  { name: '便服', reduce: 0, cost: 0 },
  { name: '工地安全帽', reduce: 0.2, cost: 60 },
  { name: '反光背心', reduce: 0.4, cost: 200 },
  { name: '防咬裝', reduce: 0.6, cost: 550, poisonResist: 0.5 },
];

export const BAG = [
  { cap: 12, cost: 0 },
  { cap: 24, cost: 50 },
  { cap: 40, cost: 160 },
  { cap: 70, cost: 420 },
];

export const PRICE = [
  { mult: 1, cost: 0 },
  { mult: 1.3, cost: 80 },
  { mult: 1.7, cost: 260 },
  { mult: 2.2, cost: 650 },
];

export const BIKE = [
  { name: '走路', mult: 1, cost: 0 },
  { name: 'YouBike', mult: 1.3, cost: 120 },
  { name: '電動 YouBike', mult: 1.6, cost: 420 },
];

export const WORKER = { baseCost: 60, growth: 1.45, max: 8, chopTime: 5, treeValue: 12, demolishDps: 1.5 };

export const TREE = { hp: { round: 3, pine: 4 }, wood: { round: 2, pine: 3 }, regrow: 80 };

export const RAT = {
  small: { hp: 2, dmg: 4, speed: 4.4, aggro: 9, drop: 'tail', poison: 0 },
  big: { hp: 7, dmg: 7, speed: 3.8, aggro: 13, drop: 'bigtail', poison: 3 },
  king: { hp: 180, dmg: 16, speed: 3.4, aggro: 18, poison: 5, reward: 500 },
};
export const RAT_TARGET = { daan: 5, zhongshan: 5, xinyi: 9, beitou: 12, wanhua: 18, songshan: 8 };
export const BIG_RAT_CHANCE = { daan: 0, zhongshan: 0.05, xinyi: 0.12, beitou: 0.2, wanhua: 0.35, songshan: 0.3 };

export const NEST = { hp: 14, reward: 40, haste: { mult: 1.5, sec: 12 }, regrow: 90 };

export const MILK = { needed: 12, crate: 6, weekSec: 45, extraCost: 150 };

export const CANE = { shameSec: 45, shamePrice: 0.7, buff: 1.15 };

export const AIRPORT = {
  hangar: { hp: 110, tier: 2, reward: 120, label: '機庫' },
  terminal: { hp: 130, tier: 3, reward: 90, label: '航廈' },
  tower: { hp: 320, tier: 3, reward: 300, label: '塔台' },
  jetEvery: 26,
};

export const UMBRELLA = { cost: 100, max: 8, radius: 2.7 };

export const HAZARD = {
  smokeJail: 5, smokeSlow: 8, smokeSlowMult: 0.55,
  springHold: 4, springLoss: 0.35, springCooldown: 20,
  grannyRadius: 7, grannyHelp: 1.8, grannyFlame: 22, grannyReward: 60,
  jetDps: 10, jetPush: 26,
};

export const SAFE_RADIUS = 8;
export const RESPAWN_SEC = 3;
export const SPEEDRUN_SEC = 600;

export const NICKNAMES = [
  '甘蔗俠', '鮮奶小隊長', '怪手駕駛', '松機拆除員', '里長伯', 'YouBike 騎士',
  '鼠輩剋星', '福德正神信徒', '路過的記者', '收購攤常客', '溫泉愛好者', '萬華夜貓',
];
