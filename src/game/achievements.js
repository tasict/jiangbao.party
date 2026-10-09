import { load, save } from './storage.js';

// Trophies. `hidden` ones show as ？？？ until earned.
export const ACHIEVEMENTS = [
  { id: 'master', tier: 'gold', name: '甘蔗的祝福', desc: '取得其他全部獎盃' },
  { id: 'clear', tier: 'gold', name: '跑道清空', desc: '拆完松山機場' },
  { id: 'hell', tier: 'gold', name: '地獄塔台', desc: '地獄模式拆完松山機場' },
  { id: 'speedrun', tier: 'gold', name: '十分鐘市政', desc: '普通模式 10 分鐘內通關' },
  { id: 'nodeath', tier: 'gold', name: '毫髮無傷', desc: '一局都沒倒下就通關' },
  { id: 'clean', tier: 'gold', name: '清清白白', desc: '沒被拍到、沒泡湯、沒進吸菸所、沒靠遮陽傘就通關' },
  { id: 'king', tier: 'gold', name: '老鼠王再起', desc: '打倒萬華角落復活的老鼠王' },
  { id: 'stealth', tier: 'silver', name: '神不知鬼不覺', desc: '一次都沒被看到就把甘蔗丟掉' },
  { id: 'blessed', tier: 'silver', name: '節節高升', desc: '把甘蔗帶回神明桌供起來' },
  { id: 'onebottle', tier: 'silver', name: '一週一瓶', desc: '沒有加碼就把鮮奶發完' },
  { id: 'topup', tier: 'silver', name: '加碼不手軟', desc: '把鮮奶加碼到每週兩瓶' },
  { id: 'excavator', tier: 'silver', name: '怪手駕到', desc: '工具升級到怪手' },
  { id: 'ratcatcher', tier: 'silver', name: '滅鼠隊長', desc: '一局打倒 80 隻老鼠' },
  { id: 'crew', tier: 'silver', name: '全員出動', desc: '請滿 8 位工人' },
  { id: 'umbrella', tier: 'silver', name: '撐起一片天', desc: '捐款撐滿 8 把遮陽傘' },
  { id: 'granny', tier: 'silver', name: '扶阿婆過日子', desc: '扶起躺在地上的阿婆' },
  { id: 'headline', tier: 'bronze', name: '頭條常客', desc: '丟甘蔗被拍到 3 次', hidden: true },
  { id: 'flame', tier: 'bronze', name: '視而不見', desc: '無視倒地的阿婆，被罵上新聞', hidden: true },
  { id: 'soak', tier: 'bronze', name: '素材泡湯', desc: '被北投溫泉裡的手抓進去', hidden: true },
  { id: 'smoke', tier: 'bronze', name: '室內禁菸', desc: '誤闖信義吸菸所被關', hidden: true },
  { id: 'lumber', tier: 'bronze', name: '民怨沖天', desc: '一局砍倒 150 棵樹', hidden: true },
  { id: 'jet', tier: 'bronze', name: '噴射氣流', desc: '被起飛的飛機吹飛', hidden: true },
];

export class Achievements {
  constructor() {
    this.earned = new Set(load('achievements', []));
    this.session = [];
  }

  has(id) {
    return this.earned.has(id);
  }

  // Returns the definition if newly earned, otherwise null.
  unlock(id) {
    if (this.earned.has(id)) return null;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return null;
    this.earned.add(id);
    this.session.push(def);
    const others = ACHIEVEMENTS.filter((a) => a.id !== 'master');
    if (!this.earned.has('master') && others.every((a) => this.earned.has(a.id))) {
      this.earned.add('master');
      this.session.push(ACHIEVEMENTS[0]);
    }
    save('achievements', [...this.earned]);
    return def;
  }

  startSession() {
    this.session = [];
  }
}
