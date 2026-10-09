import { POI } from '../world/map.js';
import { MILK, TOOLS } from './config.js';

// Main storyline: sugarcane → fresh milk → Songshan Airport.
const ORDER = ['cane_go', 'cane_drop', 'milk_go', 'milk_give', 'airport', 'done'];

export class Quests {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.stage = 'cane_go';
  }

  index() {
    return ORDER.indexOf(this.stage);
  }

  advance(to) {
    if (ORDER.indexOf(to) <= this.index()) return;
    this.stage = to;
    this.game.onStage(to);
  }

  objective() {
    const g = this.game;
    const P = (k) => ({ x: POI[k].x, z: POI[k].z, label: POI[k].label });
    let o;
    switch (this.stage) {
      case 'cane_go':
        o = { title: '甘蔗的祝福', text: '到中山福德宮的晚宴，董事長有東西要給你', target: { x: POI.keeper.x, z: POI.keeper.z, label: '董事長' } };
        break;
      case 'cane_drop':
        o = { title: '處理甘蔗', text: '找個沒人看見的地方丟掉，或扛回大安神明桌供起來', target: P('altar'), stealth: true };
        break;
      case 'milk_go':
        o = { title: '生生喝鮮奶', text: '到金滑國小門口的鮮奶車搬一箱鮮奶', target: P('milk') };
        break;
      case 'milk_give': {
        const m = g.milk;
        const carrying = g.holding === 'crate' && m.bottles > 0;
        o = {
          title: '生生喝鮮奶',
          text: `發給學生 ${m.delivered}/${MILK.needed} 瓶，每人每週限 ${m.allowance} 瓶`,
          progress: m.delivered / MILK.needed,
          target: carrying ? { x: (POI.playground.x0 + POI.playground.x1) / 2, z: (POI.playground.z0 + POI.playground.z1) / 2, label: '操場' } : P('milk'),
          week: m.week,
        };
        if (!carrying) o.text += g.holding === 'crate' ? '（這箱發完了，回鮮奶車再搬）' : '（先去鮮奶車搬一箱）';
        break;
      }
      case 'airport': {
        const a = g.airport;
        const left = a.blocks.filter((b) => b.alive);
        const need = Math.min(...left.map((b) => b.tier));
        const tier = g.levels.tool;
        if (tier < need) {
          o = { title: '拆掉松山機場', text: `工具不夠力：至少要「${TOOLS[need].name}」，先去北投工具場升級`, target: P('toolShop') };
        } else {
          const b = a.nearestStanding(g.player.pos.x, g.player.pos.z, tier);
          const hard = left.some((x) => x.tier > tier);
          o = {
            title: '拆掉松山機場',
            text: `還剩 ${left.length} 棟。${hard ? `航廈和塔台要「${TOOLS[3].name}」` : '全部都拆得動了，衝！'}`,
            progress: 1 - left.length / a.blocks.length,
            target: b ? { x: b.x, z: b.z + (b.kind === 'terminal' ? b.hd : 0), label: b.label } : null,
          };
        }
        break;
      }
      default:
        o = { title: '完成！', text: '松山機場拆光了', target: null };
    }
    if (g.bagFull() && !g.holding && this.stage !== 'done') {
      o.hint = '背包滿了！回大安收購攤賣掉';
      o.target = P('sell');
    }
    return o;
  }
}
