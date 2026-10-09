import * as THREE from 'three';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { FX } from './fx.js';
import { RatSystem } from './rats.js';
import { NPCSystem } from './npcs.js';
import { Airport } from './airport.js';
import { Hazards } from './hazards.js';
import { Ambient } from './ambient.js';
import { Quests } from './quests.js';
import { CaneScene } from './caneScene.js';
import { Avatar } from './avatar.js';
import { submitRun } from './storage.js';
import { mat, OVERLAY_LAYER } from '../world/batcher.js';
import { POI, districtAt, DISTRICTS } from '../world/map.js';
import { makeSugarcane } from '../world/props.js';
import {
  DIFFICULTY, ITEMS, TIER_VALUE, TOOLS, ARMOR, BAG, PRICE, BIKE, WORKER, TREE, MILK, CANE,
  UMBRELLA, HAZARD, SAFE_RADIUS, RESPAWN_SEC, SPEEDRUN_SEC,
} from './config.js';

const STATION_RADIUS = 2.6;
const nearestSell = (x, z) => POI.sells.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));

// What 蔣寶 says while handing out milk, and how the kid answers.
const MILK_TALK = [
  ['同學有沒有看過《茉莉蓮》？', '是《芙莉蓮》啦！'],
  ['三年三班手工薯條，好吃喔！', '我們班賣的是珍奶…'],
  ['喝完鮮奶，大家來深蹲！', '一、二、三…腿好痠'],
  ['我們一起——開創⋯⋯未來！', '未來是什麼時候？'],
  ['一週一瓶，節節高升！', '一週才一瓶喔？'],
  ['想多喝一瓶？我們研議看看！', '研議是什麼意思？'],
];

export class Game {
  constructor({ engine, input, world, grid, hud, achievements, audio }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.input = input;
    this.world = world;
    this.grid = grid;
    this.hud = hud;
    this.ach = achievements;
    this.audio = audio;
    this.diff = DIFFICULTY.normal;

    this.player = new Player(this.camera, grid);
    this.viewModel = new ViewModel(this.player.viewModel);
    this.fx = new FX(this.scene, this.camera, OVERLAY_LAYER);
    this.time = 0;
    this.milk = { delivered: 0, bottles: 0, allowance: 1, week: MILK.weekSec, topped: false };
    this.levels = { tool: 0, armor: 0, bag: 0, price: 0, bike: 0 };
    this.status = {};
    this.flags = {};
    this.stats = {};
    this.bag = [];
    this.umbrellaCount = 2;

    this.rats = new RatSystem(this);
    this.npcs = new NPCSystem(this);
    this.airport = new Airport(this);
    this.hazards = new Hazards(this);
    this.ambient = new Ambient(this);
    this.quests = new Quests(this);

    this.caneScene = new CaneScene(this);
    this.avatar = new Avatar(this);

    this.caneProp = makeSugarcane();
    this.caneProp.visible = false;
    this.scene.add(this.caneProp);

    // ground pickups for when the backpack is full
    this.pickups = [];
    this.pickupGeo = {
      wood: new THREE.CylinderGeometry(0.16, 0.16, 0.7, 7).rotateZ(Math.PI / 2),
      tail: new THREE.TorusGeometry(0.18, 0.05, 4, 8, Math.PI * 1.4),
      bigtail: new THREE.TorusGeometry(0.28, 0.07, 4, 8, Math.PI * 1.4),
    };
    this.pickupMat = { wood: mat(0x9a6a40), tail: mat(0xeaa3a0), bigtail: mat(0xd88a88) };

    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0xf2c230, fog: false }));
    this.marker.scale.set(1, 1.6, 1);
    this.marker.layers.set(OVERLAY_LAYER);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.objective = { title: '', text: '', target: null };
    this.watchers = 0;

    this.animTrees = new Set();
    this.running = false;
    this.paused = false;
    this.musicMode = 'title';
    this.musicCandidate = 'title';
    this.musicHold = 0;
  }

  // ---------------------------------------------------------------- run lifecycle

  newRun(diffKey, name) {
    this.diff = DIFFICULTY[diffKey] || DIFFICULTY.normal;
    this.name = name;
    this.time = 0;
    this.running = true;
    this.paused = false;
    this.finished = false;
    this.cinematic = false;
    this.money = 0;
    this.bag = [];
    this.levels = { tool: 0, armor: 0, bag: 0, price: 0, bike: 0 };
    this.workers = 0;
    this.hpMax = this.diff.hpMax;
    this.hp = this.hpMax;
    this.status = { poison: 0, slow: 0, haste: 0, shame: 0, jail: 0, spring: 0, down: 0 };
    this.knock = { x: 0, z: 0 };
    this.blessed = false;
    this.holding = null;
    this.milk = { delivered: 0, bottles: 0, allowance: 1, week: MILK.weekSec, topped: false };
    this.stats = { trees: 0, rats: 0, nests: 0, earned: 0, deaths: 0, spotted: 0, sold: 0 };
    this.flags = {};
    this.umbrellaCount = 2;
    this.attackCd = 0;
    this.sellCd = 0;
    this.sellRun = 0;
    this.selling = false;
    this.station = null;
    this.menu = null;
    this.target = null;
    this.stepPhase = 0;

    for (const t of this.world.trees.trees) {
      t.maxHp = Math.max(2, Math.round(TREE.hp[t.type] * t.scale));
      Object.assign(t, { alive: true, hp: t.maxHp, fall: 0, shake: 0, claimed: false, regrowAt: 0 });
      this.world.trees.writeMatrices(t);
    }
    this.world.trees.finalize();
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups.length = 0;
    this.caneProp.visible = false;

    this.fx.clear();
    this.rats.reset();
    this.npcs.reset();
    this.airport.reset();
    this.hazards.reset();
    this.ambient.reset();
    this.quests.reset();
    this.player.spawn(POI.spawn.x, POI.spawn.z, 0);
    this.viewModel.setTier(0);
    this.viewModel.setHolding(null);
    this.ach.startSession();
    this.setMusic('explore', true);
    // the story opens on the night of the temple banquet
    this.dawn = null;
    this.dawnAt = 0;
    this.engine.setNight(1);
  }

  quit() {
    this.running = false;
    this.paused = false;
  }

  // ---------------------------------------------------------------- helpers used by subsystems

  inSafeZone(x, z) {
    for (const s of this.world.safeZones) if (Math.hypot(x - s.x, z - s.z) < SAFE_RADIUS) return true;
    return false;
  }

  vulnerable() {
    return this.running && !this.cinematic && !this.finished && this.status.down <= 0 && this.status.jail <= 0 && this.status.spring <= 0;
  }

  canAct() {
    return this.vulnerable();
  }

  bagCap() {
    return BAG[this.levels.bag].cap;
  }

  bagFull() {
    return this.bag.length >= this.bagCap();
  }

  cost(base) {
    return Math.round(base * this.diff.costMult);
  }

  toast(text) {
    this.hud.toast(text);
  }

  unlock(id) {
    const def = this.ach.unlock(id);
    if (def) {
      this.hud.trophy(def);
      this.audio.sfx('gift', { volume: 0.7 });
    }
  }

  setMusic(mode, force = false) {
    if (force) {
      this.musicMode = mode;
      this.musicCandidate = mode;
      this.audio.setMusic(mode);
    }
  }

  addMoney(n, x, y, z) {
    n = Math.round(n);
    this.money += n;
    this.stats.earned += n;
    if (x !== undefined) this.fx.text(`+$${n}`, x, y, z, 'money');
  }

  itemValue(type, district) {
    return ITEMS[type].base * TIER_VALUE[DISTRICTS[district]?.tier ?? 1];
  }

  // Bigger trees are worth more: size² puts the smallest at ~0.7x and the biggest at ~2x.
  treeValueMult(t) {
    return t.scale * t.scale;
  }

  treeLabel(t) {
    return t.scale >= 1.2 ? '大樹' : t.scale <= 0.95 ? '小樹' : '樹';
  }

  // Rough sale price of a tree right now, for the crosshair label.
  treeWorth(t) {
    const per = this.itemValue('wood', districtAt(t.x, t.z)) * this.treeValueMult(t);
    return Math.round(per * TREE.wood[t.type] * PRICE[this.levels.price].mult);
  }

  gainItem(type, district, x, z, count = 1, mult = 1) {
    const value = this.itemValue(type, district) * mult;
    let dropped = 0;
    for (let i = 0; i < count; i++) {
      if (!this.bagFull()) this.bag.push({ type, value });
      else {
        this.spawnPickup(type, value, x + (Math.random() - 0.5) * 1.5, z + (Math.random() - 0.5) * 1.5);
        dropped++;
      }
    }
    if (count - dropped > 0) {
      this.fx.text(`+${count - dropped} ${ITEMS[type].name}`, x, 1.6, z, 'item', 0.9);
      this.audio.sfx('pickup', { volume: 0.4, pitch: 1 + Math.random() * 0.2 });
    }
    if (dropped && !this.fullWarned) {
      this.fullWarned = true;
      this.toast('背包滿了！素材先留在地上，賣完再回來撿');
    }
    if (!this.bagFull()) this.fullWarned = false;
  }

  spawnPickup(type, value, x, z) {
    const mesh = new THREE.Mesh(this.pickupGeo[type], this.pickupMat[type]);
    mesh.position.set(x, 0.2, z);
    mesh.rotation.y = Math.random() * 6;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.pickups.push({ mesh, type, value, x, z });
    if (this.pickups.length > 80) this.scene.remove(this.pickups.shift().mesh);
  }

  loseItems(frac) {
    const n = Math.min(this.bag.length, Math.ceil(this.bag.length * frac));
    for (let i = 0; i < n; i++) this.bag.splice(Math.floor(Math.random() * this.bag.length), 1);
    return n;
  }

  hurt(dmg, poison = 0, { raw = false } = {}) {
    if (!this.vulnerable()) return;
    const armor = ARMOR[this.levels.armor];
    const d = raw ? dmg : dmg * this.diff.biteMult * (1 - armor.reduce);
    this.hp -= d;
    if (poison > 0) this.status.poison = Math.max(this.status.poison, poison * (1 - (armor.poisonResist || 0)) * 2.2);
    this.engine.pencil.flash(poison > 0 ? 0x7fd06a : 0xff5a4a, raw ? 0.5 : 0.75);
    this.fx.shake(0.12, 0.2);
    if (!raw) this.audio.sfx('hurt', { volume: 0.6 });
    if (this.hp <= 0) this.knockDown();
  }

  knockDown() {
    this.hp = 0;
    this.status.down = RESPAWN_SEC;
    this.status.poison = 0;
    this.stats.deaths++;
    const lost = this.loseItems(0.5);
    this.audio.sfx('down');
    this.hud.down(true, lost);
  }

  respawn() {
    this.hp = this.hpMax;
    this.status.slow = 0;
    this.player.spawn(POI.spawn.x, POI.spawn.z, 0);
    this.hud.down(false);
  }

  jetBlast(dt, side) {
    if (!this.vulnerable()) return;
    if (side) this.knock.z += side * HAZARD.jetPush * dt * 4;
    else this.knock.x += HAZARD.jetPush * dt * 3;
    this.hurt(HAZARD.jetDps * dt, 0, { raw: true });
    this.fx.shake(0.25, 0.2);
    if (!this.flags.jet) {
      this.flags.jet = true;
      this.toast('被噴射氣流吹飛了！');
      this.unlock('jet');
    }
  }

  // ---------------------------------------------------------------- story events

  onStage(stage) {
    this.audio.sfx('quest');
    // the sugarcane business is done: cut to the next morning for the milk round
    if (stage === 'milk_go') this.dawnAt = this.time + 1.6;
    if (stage === 'airport') {
      this.airport.openGate();
      this.hud.headline('松山機場遷移計畫啟動', '機場大門打開了！機庫要電鋸、航廈和塔台要怪手才拆得動');
    }
  }

  giveCane() {
    this.holding = 'cane';
    this.viewModel.setHolding('cane');
    this.npcs.keeper.gave = true;
    this.audio.sfx('gift');
    this.hud.dialog('福德宮董事長', '蔣寶辛苦了！這支甘蔗送你，祝你節節高升！');
    this.quests.advance('cane_drop');
    setTimeout(() => this.toast('拿著甘蔗不能攻擊。記者在看，找個沒人的地方處理掉吧'), 2600);
  }

  tryDropCane() {
    const p = this.player.pos;
    const who = this.npcs.seenBy(p.x, p.z);
    if (who.length) {
      this.stats.spotted++;
      this.status.shame = CANE.shameSec;
      this.audio.sfx('shutter');
      setTimeout(() => this.audio.sfx('boo'), 250);
      this.npcs.onSpotted(who);
      const reporter = who.some((w) => w.role === 'reporter');
      this.engine.pencil.flash(0xffffff, 1);
      // the temple chairman brings it back in a short cutscene, then the papers run the story
      this.caneScene.play(this.stats.spotted, () => {
        this.hud.headline(reporter ? '獨家｜蔣寶當街棄蔗？' : '爆料｜路人拍到蔣寶丟甘蔗', `福德宮董事長把甘蔗送回來了…收購價打 ${CANE.shamePrice * 10} 折 ${CANE.shameSec} 秒`);
      });
      if (this.stats.spotted >= 3) this.unlock('headline');
      return;
    }
    this.holding = null;
    this.viewModel.setHolding(null);
    const f = this.player.forward();
    this.caneProp.position.set(p.x + f.x * 0.8, 0.1, p.z + f.z * 0.8);
    this.caneProp.rotation.set(Math.PI / 2, 0, this.player.yaw);
    this.caneProp.visible = true;
    this.audio.sfx('drop');
    this.toast('神不知鬼不覺，甘蔗處理掉了');
    if (this.stats.spotted === 0) this.unlock('stealth');
    this.flags.caneDropped = true;
    this.quests.advance('milk_go');
  }

  enshrineCane() {
    this.holding = null;
    this.viewModel.setHolding(null);
    this.blessed = true;
    this.caneProp.position.set(POI.altar.x - 1.0, 1.0, POI.altar.z - 1.7);
    this.caneProp.rotation.set(0, 0, 0.12);
    this.caneProp.visible = true;
    this.audio.sfx('help');
    this.fx.burst('sparkle', POI.altar.x, 2, POI.altar.z - 1.5, 24);
    this.hud.headline('甘蔗的祝福', `甘蔗供起來了，節節高升！攻擊速度永久 ×${CANE.buff}`);
    this.unlock('blessed');
    this.quests.advance('milk_go');
  }

  takeCrate() {
    this.holding = 'crate';
    this.milk.bottles = MILK.crate;
    this.viewModel.setHolding('crate');
    this.viewModel.setBottles(MILK.crate);
    this.audio.sfx('pickup');
    if (this.quests.stage === 'milk_go') {
      this.quests.advance('milk_give');
      this.milk.week = MILK.weekSec;
      this.toast(`學生每人每週限領 ${this.milk.allowance} 瓶，一週 ${MILK.weekSec} 秒`);
    }
  }

  giveMilk(kid) {
    this.milk.bottles--;
    this.milk.delivered++;
    // one line at a time so each gag can be read, even when the kids swarm
    if (this.time - (this.milk.talkAt ?? -9) > 2.6) {
      this.milk.talkAt = this.time;
      const [line, reply] = MILK_TALK[(this.milk.talks = (this.milk.talks ?? -1) + 1) % MILK_TALK.length];
      this.hud.dialog('蔣寶', line);
      setTimeout(() => this.fx.text(reply, kid.x, 1.9, kid.z, 'say', 2.2), 750);
    } else {
      this.fx.text('謝謝蔣寶！', kid.x, 1.9, kid.z, 'say', 1.4);
    }
    this.viewModel.setBottles(this.milk.bottles);
    this.audio.sfx('milk');
    this.fx.burst('milk', kid.x, 1.2, kid.z, 8);
    if (this.milk.delivered >= MILK.needed) {
      this.holding = null;
      this.viewModel.setHolding(null);
      if (!this.milk.topped) this.unlock('onebottle');
      this.quests.advance('airport');
      return;
    }
    if (this.milk.bottles <= 0) {
      this.holding = null;
      this.viewModel.setHolding(null);
      this.toast('這箱發完了！回鮮奶車再搬一箱');
    }
  }

  helpGranny() {
    this.npcs.helpGranny();
    this.addMoney(HAZARD.grannyReward, POI.granny.x, 2, POI.granny.z);
    this.hp = this.hpMax;
    this.status.poison = 0;
    this.audio.sfx('help');
    this.fx.text('少年仔，多謝喔！', POI.granny.x, 2.2, POI.granny.z, 'say', 2.4);
    this.unlock('granny');
  }

  grannyIgnored() {
    this.flags.grannyFlame = true;
    this.status.shame = CANE.shameSec;
    this.audio.sfx('boo');
    this.hud.headline('快訊｜阿婆倒地 蔣寶視而不見？', `網友炎上中，收購價打 ${CANE.shamePrice * 10} 折 ${CANE.shameSec} 秒`);
    this.unlock('flame');
  }

  workerFelled(t) {
    this.fellTree(t, false);
    const v = WORKER.treeValue * this.treeValueMult(t) * PRICE[this.levels.price].mult;
    this.money += Math.round(v);
    this.stats.earned += Math.round(v);
    if (Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z) < 25) this.fx.text(`+$${Math.round(v)}`, t.x, 3, t.z, 'money');
  }

  onBlockDown(b) {
    if (this.airport.remaining() === 0) this.victory();
    else this.toast(`${b.label}拆掉了！還剩 ${this.airport.remaining()} 棟`);
  }

  victory() {
    this.finished = true;
    this.quests.stage = 'done';
    this.audio.sfx('victory');
    this.setMusic('victory', true);
    this.unlock('clear');
    if (this.diff.key === 'hell') this.unlock('hell');
    if (this.diff.key === 'normal' && this.time < SPEEDRUN_SEC) this.unlock('speedrun');
    if (this.stats.deaths === 0) this.unlock('nodeath');
    if (this.stats.spotted === 0 && !this.flags.soaked && !this.flags.smoked && !this.flags.usedUmbrella) this.unlock('clean');
    const entry = { name: this.name, time: Math.round(this.time * 10) / 10, deaths: this.stats.deaths, date: Date.now() };
    const rank = submitRun(this.diff.key, entry);
    setTimeout(() => this.hud.result(this, rank, entry), 2600);
  }

  // ---------------------------------------------------------------- trees

  hitTree(t, dmg) {
    t.hp -= dmg;
    t.shake = 0.35;
    this.animTrees.add(t);
    this.fx.burst('chips', t.x, 1.2, t.z, 5);
    if (Math.random() < 0.5) this.fx.burst('leaves', t.x, 3.6 * t.scale, t.z, 3, { jitter: 2 });
    if (t.hp <= 0) this.fellTree(t, true);
  }

  fellTree(t, byPlayer) {
    t.alive = false;
    t.fall = 0.001;
    t.regrowAt = this.time + TREE.regrow;
    this.animTrees.add(t);
    this.stats.trees++;
    if (Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z) < 40) this.audio.sfx('tree', { volume: byPlayer ? 0.8 : 0.3 });
    this.fx.burst('leaves', t.x, 3 * t.scale, t.z, 10, { jitter: 2.5 });
    if (byPlayer) {
      this.flags.choppedTree = true;
      this.gainItem('wood', districtAt(t.x, t.z), t.x, t.z, TREE.wood[t.type], this.treeValueMult(t));
    }
    if (this.stats.trees >= 150) this.unlock('lumber');
  }

  updateTrees(dt) {
    const tf = this.world.trees;
    for (const t of this.animTrees) {
      if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
      if (t.fall > 0) {
        t.fall += dt * 2.2 * (1 + t.fall);
        if (t.fall > 1.5) t.fall = 0;
      }
      tf.writeMatrices(t);
      if (t.shake <= 0 && t.fall <= 0) this.animTrees.delete(t);
    }
    // regrow a few out of sight each frame
    if (Math.random() < 0.2) {
      const px = this.player.pos.x, pz = this.player.pos.z;
      for (const t of tf.trees) {
        if (!t.alive && t.fall <= 0 && this.time >= t.regrowAt && Math.hypot(t.x - px, t.z - pz) > 14) {
          t.alive = true;
          t.hp = t.maxHp;
          tf.writeMatrices(t);
        }
      }
    }
    if (tf.dirty) tf.finalize();
  }

  // ---------------------------------------------------------------- combat

  attackSpeed() {
    return (this.status.haste > 0 ? 1.5 : 1) * (this.blessed ? CANE.buff : 1);
  }

  findTarget(range) {
    const p = this.player.pos;
    const f = this.player.forward();
    let best = null, bestScore = Infinity;
    const consider = (kind, ref, cx, cz, dist, priority) => {
      if (dist > range) return;
      const dx = cx - p.x, dz = cz - p.z, d = Math.hypot(dx, dz) || 1;
      const cos = (dx * f.x + dz * f.z) / d;
      if (dist > 1.0 && cos < 0.42) return;
      const score = dist + (1 - cos) * 2.5 - priority;
      if (score < bestScore) {
        bestScore = score;
        best = { kind, ref, x: cx, z: cz };
      }
    };
    for (const r of this.rats.rats) {
      const d = Math.hypot(r.x - p.x, r.z - p.z) - r.radius;
      if (d < range + 1) consider('rat', r, r.x, r.z, Math.max(0, d), 3);
    }
    const k = this.rats.king;
    if (k.alive) consider('king', k, k.x, k.z, Math.max(0, Math.hypot(k.x - p.x, k.z - p.z) - k.radius), 3);
    for (const n of this.rats.nests) {
      if (n.alive) consider('nest', n, n.x, n.z, Math.max(0, Math.hypot(n.x - p.x, n.z - p.z) - n.radius), 1.5);
    }
    if (p.z < -50) {
      for (const b of this.airport.blocks) {
        if (!b.alive) continue;
        const d = this.airport.distanceTo(b, p.x, p.z);
        const cx = Math.max(b.x - b.hw, Math.min(p.x, b.x + b.hw)), cz = Math.max(b.z - b.hd, Math.min(p.z, b.z + b.hd));
        consider('block', b, b.kind === 'tower' ? b.x : cx, b.kind === 'tower' ? b.z : cz, d, 1);
      }
    }
    for (const c of this.grid.query(p.x, p.z, range + 1, this._q || (this._q = []))) {
      const t = c.tree;
      if (!t || !t.alive) continue;
      consider('tree', t, t.x, t.z, Math.max(0, Math.hypot(t.x - p.x, t.z - p.z) - t.radius), 0);
    }
    return best;
  }

  updateCombat(dt) {
    this.attackCd -= dt * this.attackSpeed();
    if (this.holding || !this.canAct()) {
      this.target = null;
      return;
    }
    const tool = TOOLS[this.levels.tool];
    const t = this.findTarget(tool.range);
    this.target = t;
    if (!t || this.attackCd > 0) return;
    this.attackCd = tool.interval;
    this.viewModel.swing(tool.interval / this.attackSpeed());
    const dmg = tool.dmg;
    let landed = true;
    switch (t.kind) {
      case 'rat': this.rats.damageRat(t.ref, dmg); break;
      case 'king': this.rats.damageKing(dmg); break;
      case 'nest': this.rats.damageNest(t.ref, dmg); break;
      case 'tree': this.hitTree(t.ref, dmg); break;
      case 'block': landed = this.airport.hit(t.ref, dmg, this.levels.tool); break;
      default:
    }
    if (landed) {
      this.audio.sfx(t.kind === 'rat' || t.kind === 'king' ? 'hit' : tool.sfx, { volume: 0.7, pitch: 0.9 + Math.random() * 0.2 });
      this.fx.shake(this.levels.tool === 3 ? 0.2 : 0.05, 0.1);
    }
  }

  // ---------------------------------------------------------------- stations

  stationAt(x, z) {
    if (POI.sells.some((p) => Math.hypot(x - p.x, z - p.z) < STATION_RADIUS)) return 'sell';
    for (const key of ['recruit', 'altar', 'shop', 'toolShop', 'milk', 'donation']) {
      if (Math.hypot(x - POI[key].x, z - POI[key].z) < STATION_RADIUS) return key;
    }
    return null;
  }

  buildMenu(key) {
    const L = this.levels, c = (b) => this.cost(b);
    const next = (table, lvl) => table[lvl + 1];
    switch (key) {
      case 'sell': {
        const shame = this.status.shame > 0 ? `（炎上中，收購價打 ${CANE.shamePrice * 10} 折）` : '';
        const p = this.player.pos;
        const busy = nearestSell(p.x, p.z) === POI.sell ? '排隊的市民一個一個跟你買…' : '老闆一件一件幫你收…';
        return { title: '收購攤', note: this.bag.length ? `${busy}${shame}` : `背包是空的。砍樹、打老鼠拿素材再來${shame}`, options: [] };
      }
      case 'recruit': {
        const full = this.workers >= WORKER.max;
        const cost = c(WORKER.baseCost * WORKER.growth ** this.workers);
        return {
          title: '招聘站', note: '工人會自己去大安森林公園砍樹賺錢，機場開了會去幫忙拆',
          options: [{ id: 'worker', label: full ? '工人請滿了' : `請一位工人（${this.workers}/${WORKER.max}）`, cost: full ? null : cost, disabled: full }],
        };
      }
      case 'shop': {
        const b = next(BAG, L.bag), p = next(PRICE, L.price), k = next(BIKE, L.bike);
        return {
          title: '商店', note: '背包、收購價、代步工具',
          options: [
            { id: 'bag', label: b ? `背包擴充 ${BAG[L.bag].cap} → ${b.cap} 格` : `背包已是最大（${BAG[L.bag].cap} 格）`, cost: b ? c(b.cost) : null, disabled: !b },
            { id: 'price', label: p ? `收購價 ×${PRICE[L.price].mult} → ×${p.mult}` : `收購價已是最高（×${PRICE[L.price].mult}）`, cost: p ? c(p.cost) : null, disabled: !p },
            { id: 'bike', label: k ? `${k.name}（移動速度 ×${k.mult}）` : `已經騎${BIKE[L.bike].name}了`, cost: k ? c(k.cost) : null, disabled: !k },
          ],
        };
      }
      case 'toolShop': {
        const t = next(TOOLS, L.tool), a = next(ARMOR, L.armor);
        return {
          title: '工具場', note: `目前：${TOOLS[L.tool].name}、${ARMOR[L.armor].name}`,
          options: [
            { id: 'tool', label: t ? `升級成「${t.name}」（傷害 ${t.dmg}）` : '工具已經是怪手了', cost: t ? c(t.cost) : null, disabled: !t },
            { id: 'armor', label: a ? `換上「${a.name}」（被咬傷害 −${Math.round(a.reduce * 100)}%）` : '護具已經是最好的了', cost: a ? c(a.cost) : null, disabled: !a },
          ],
        };
      }
      case 'altar':
        return { title: '神明桌', note: this.blessed ? '甘蔗供在這裡，保佑你節節高升' : '把董事長送的甘蔗扛回來，可以供在這裡', options: [] };
      case 'milk': {
        const stage = this.quests.index();
        const opts = [];
        if (stage < 2) return { title: '鮮奶車', note: '還不是發鮮奶的時候（先處理甘蔗）', options: [] };
        if (stage > 3) return { title: '鮮奶車', note: '鮮奶都發完了，謝謝蔣寶！', options: [] };
        if (this.holding === 'crate') opts.push({ id: 'return', label: '把箱子放回去' });
        else opts.push({ id: 'crate', label: `搬一箱鮮奶（${MILK.crate} 瓶）`, disabled: !!this.holding });
        opts.push(this.milk.topped
          ? { id: 'topup', label: '已加碼：每人每週兩瓶', disabled: true }
          : { id: 'topup', label: '加碼！每人每週改發兩瓶', cost: c(MILK.extraCost) });
        return { title: '鮮奶車', note: `已發 ${this.milk.delivered}/${MILK.needed} 瓶`, options: opts };
      }
      case 'donation': {
        const full = this.umbrellaCount >= UMBRELLA.max;
        return {
          title: '遮陽傘捐款箱', note: `躲在遮陽傘下老鼠咬不到你（${this.umbrellaCount}/${UMBRELLA.max} 把）`,
          options: [{ id: 'donate', label: full ? '遮陽傘已經撐滿了' : '捐款撐一把新的遮陽傘', cost: full ? null : c(UMBRELLA.cost), disabled: full }],
        };
      }
      default:
        return null;
    }
  }

  choose(id) {
    const key = this.station;
    if (!key || !this.menu) return;
    const opt = this.menu.options.find((o) => o.id === id);
    if (!opt || opt.disabled) return;
    if (opt.cost != null && this.money < opt.cost) {
      this.audio.sfx('denied');
      this.toast(`錢不夠，還差 $${opt.cost - this.money}`);
      return;
    }
    if (opt.cost != null) this.money -= opt.cost;
    const L = this.levels;
    switch (id) {
      case 'worker':
        this.workers++;
        this.npcs.hireWorker();
        this.audio.sfx('buy');
        this.toast('工人上工了！');
        if (this.workers >= WORKER.max) this.unlock('crew');
        break;
      case 'bag': L.bag++; this.audio.sfx('upgrade'); this.toast(`背包變成 ${BAG[L.bag].cap} 格`); break;
      case 'price': L.price++; this.audio.sfx('upgrade'); this.toast(`收購價 ×${PRICE[L.price].mult}`); break;
      case 'bike': L.bike++; this.audio.sfx('upgrade'); this.toast(`騎上${BIKE[L.bike].name}了！`); break;
      case 'tool':
        L.tool++;
        this.viewModel.setTier(L.tool);
        this.audio.sfx('upgrade');
        this.toast(`換上「${TOOLS[L.tool].name}」！`);
        if (L.tool === 3) this.unlock('excavator');
        break;
      case 'armor': L.armor++; this.audio.sfx('upgrade'); this.toast(`換上「${ARMOR[L.armor].name}」`); break;
      case 'crate': this.takeCrate(); break;
      case 'return':
        this.holding = null;
        this.viewModel.setHolding(null);
        this.audio.sfx('drop');
        break;
      case 'topup':
        this.milk.topped = true;
        this.milk.allowance = 2;
        this.audio.sfx('upgrade');
        this.toast('加碼成功！每人每週兩瓶');
        this.unlock('topup');
        break;
      case 'donate':
        this.hazards.donate();
        this.audio.sfx('coin');
        this.toast('感謝捐款！新的遮陽傘撐起來了');
        if (this.umbrellaCount >= UMBRELLA.max) this.unlock('umbrella');
        break;
      default:
    }
    this.menu = this.buildMenu(key);
  }

  updateStations(dt) {
    const p = this.player.pos;
    const key = this.canAct() ? this.stationAt(p.x, p.z) : null;
    if (key !== this.station) {
      this.station = key;
      if (key === 'sell') this.sellRun = 0;
      if (key) this.audio.sfx('click', { volume: 0.4 });
    }
    this.menu = key ? this.buildMenu(key) : null;

    this.selling = false;
    if (key === 'sell' && this.bag.length) {
      this.selling = true;
      this.sellCd -= dt;
      const mult = PRICE[this.levels.price].mult * (this.status.shame > 0 ? CANE.shamePrice : 1);
      let batch = 0;
      while (this.sellCd <= 0 && this.bag.length) {
        const item = this.bag.pop();
        const v = Math.max(1, Math.round(item.value * mult));
        this.money += v;
        this.stats.earned += v;
        this.stats.sold++;
        this.sellRun += v;
        batch += v;
        this.sellCd += 0.11;
      }
      if (batch) {
        const s = nearestSell(p.x, p.z);
        const q = s === POI.sell ? this.npcs.queue[Math.floor(Math.random() * this.npcs.queue.length)] : { x: s.x, z: s.z - 4 };
        this.fx.text(`+$${batch}`, q.x, 2.2, q.z, 'money', 0.8);
        this.audio.sfx('coin', { volume: 0.35, pitch: 1 + Math.random() * 0.3 });
      }
      if (!this.bag.length) {
        this.audio.sfx('sell');
        this.toast(`全部賣完，賺了 $${this.sellRun}`);
        this.sellRun = 0;
      }
    }
    if (key === 'altar' && this.holding === 'cane') this.enshrineCane();
  }

  // Context action on E / the action button.
  currentAction() {
    if (!this.canAct()) return null;
    const p = this.player.pos;
    const gr = this.npcs.granny;
    if (gr.state === 'down' && Math.hypot(p.x - gr.x, p.z - gr.z) < 3.5) return { id: 'granny', label: '扶阿婆起來' };
    if (this.holding === 'cane' && this.station !== 'altar') return { id: 'dropCane', label: '偷偷丟掉甘蔗' };
    return null;
  }

  doAction() {
    const a = this.currentAction();
    if (!a) return;
    if (a.id === 'granny') this.helpGranny();
    else if (a.id === 'dropCane') this.tryDropCane();
  }

  // ---------------------------------------------------------------- night → morning

  updateDawn(dt) {
    if (this.dawnAt && this.time >= this.dawnAt && !this.cinematic) {
      this.dawnAt = 0;
      this.dawn = { t: 0, lit: false };
      this.cinematic = true;
      this.hud.dawnCard('隔天早上', '7:30・金滑國小，生生喝鮮奶的日子');
      this.audio.sfx('help', { volume: 0.6 });
    }
    if (!this.dawn) return;
    this.dawn.t += dt;
    if (!this.dawn.lit && this.dawn.t > 1.1) {
      this.dawn.lit = true;
      this.engine.setNight(0);
    }
    if (this.dawn.t > 2.9) {
      this.dawn = null;
      this.cinematic = false;
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    if (!this.running) return;
    const input = this.input;
    if (this.paused) return;
    this.updateDawn(dt);
    if (this.cinematic) {
      // the city keeps living while the intro camera flies; the clock has not started yet
      this.rats.update(dt);
      this.npcs.update(dt);
      this.ambient.update(dt);
      this.airport.update(dt);
      this.updateTrees(dt);
      this.fx.update(dt);
      this.avatar.update(dt, false);
      return;
    }

    const S = this.status;
    if (!this.finished) this.time += dt;
    for (const k of Object.keys(S)) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);

    // movement
    const p = this.player.pos;
    if (S.spring > 0 && this.springTarget) {
      p.x += (this.springTarget.x - p.x) * Math.min(1, dt * 3);
      p.z += (this.springTarget.z - p.z) * Math.min(1, dt * 3);
    }
    if (this.knock.x || this.knock.z) {
      p.x += this.knock.x * dt;
      p.z += this.knock.z * dt;
      this.knock.x *= Math.max(0, 1 - dt * 3);
      this.knock.z *= Math.max(0, 1 - dt * 3);
      if (Math.abs(this.knock.x) + Math.abs(this.knock.z) < 0.1) this.knock.x = this.knock.z = 0;
    }
    const frozen = S.jail > 0 || S.spring > 0 || S.down > 0 || this.finished;
    this.player.speedMult = BIKE[this.levels.bike].mult * (S.slow > 0 ? HAZARD.smokeSlowMult : 1) * (this.holding === 'crate' ? 0.9 : 1);
    this.player.update(dt, input, { frozen });
    const phase = Math.floor(this.player.bob / Math.PI);
    if (phase !== this.stepPhase) {
      this.stepPhase = phase;
      if (this.player.moving > 0.4) this.audio.step(this.levels.bike ? 0.4 : 0.8);
    }
    this.engine.followSun(p.x, p.z);

    // health
    if (S.poison > 0 && this.vulnerable()) {
      this.hp -= 2.4 * dt;
      if (this.hp <= 0) this.knockDown();
    }
    if (this.inSafeZone(p.x, p.z) && this.hp > 0 && this.hp < this.hpMax) this.hp = Math.min(this.hpMax, this.hp + 10 * dt);
    if (S.down <= 0 && this.hp <= 0 && this.stats.deaths > 0) this.respawn();

    // world
    this.rats.update(dt);
    this.npcs.update(dt);
    this.airport.update(dt);
    this.hazards.update(dt);
    this.ambient.update(dt);
    this.updateTrees(dt);

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      it.mesh.rotation.y += dt;
      if (!this.bagFull() && Math.hypot(it.x - p.x, it.z - p.z) < 1.8) {
        this.bag.push({ type: it.type, value: it.value });
        this.scene.remove(it.mesh);
        this.pickups.splice(i, 1);
        this.audio.sfx('pickup', { volume: 0.4 });
      }
    }

    // story triggers
    if (this.quests.stage === 'cane_go' && !this.holding && this.canAct()) {
      const k = this.npcs.keeper;
      if (Math.hypot(p.x - k.x, p.z - k.z) < 3.4) this.giveCane();
    }
    this.updateStations(dt);
    if (input.wasPressed('e') || input.wasPressed('f')) this.doAction();
    for (const [i, key] of ['1', '2', '3', '4'].entries()) {
      if (input.wasPressed(key) && this.menu?.options[i]) this.choose(this.menu.options[i].id);
    }
    this.updateCombat(dt);

    // live achievements
    if (this.stats.rats >= 80) this.unlock('ratcatcher');

    this.objective = this.quests.objective();
    this.watchers = this.holding === 'cane' ? this.npcs.seenBy(p.x, p.z).length : 0;
    const tg = this.objective.target;
    this.marker.visible = !!tg && !this.finished && Math.hypot(tg.x - p.x, tg.z - p.z) > 5;
    if (tg) {
      this.marker.position.set(tg.x, 7 + Math.sin(this.time * 2.5) * 0.5, tg.z);
      this.marker.rotation.y += dt * 2;
    }

    this.viewModel.update(dt, this.player.moving);
    const third = this.player.thirdPerson;
    this.viewModel.root.visible = !third;
    this.avatar.update(dt, third);
    this.fx.update(dt);
    this.updateMusic(dt);
  }

  updateMusic(dt) {
    let mode = 'explore';
    const p = this.player.pos;
    if (this.finished) mode = 'victory';
    else if (this.holding === 'cane') mode = 'stealth';
    else if (this.airport.open && p.z < -56 && p.x > 54) mode = 'airport';
    else if (this.rats.rats.some((r) => r.chasing && Math.hypot(r.x - p.x, r.z - p.z) < 14) || (this.rats.king.alive && Math.hypot(this.rats.king.x - p.x, this.rats.king.z - p.z) < 22)) mode = 'danger';
    if (mode !== this.musicCandidate) {
      this.musicCandidate = mode;
      this.musicHold = 0;
    }
    this.musicHold += dt;
    const need = mode === 'danger' ? 0.3 : mode === 'explore' ? 2.5 : 0.5;
    if (this.musicHold > need && mode !== this.musicMode) {
      this.musicMode = mode;
      this.audio.setMusic(mode);
    }
  }
}
