import * as THREE from 'three';
import { Crowd, walkTowards, faceTowards } from './crowd.js';
import { segmentBlocked, resolveCircle } from '../core/physics.js';
import { DISTRICTS, POI } from '../world/map.js';
import { overlay } from '../world/batcher.js';
import { makeChairman } from '../world/props.js';
import { MILK, WORKER } from './config.js';

const SHIRTS = [0x4a7fc0, 0xc63d2c, 0x4c9255, 0xe8b42f, 0x8a5a9a, 0xf4f0e6, 0xe6bba2, 0x3a3a44, 0x8fb6a8, 0xd9c2d6];
const PANTS = [0x3d3d48, 0x2f2a28, 0x5a6a7a, 0x6b5a4a, 0x2e3a5a];
const HAIRS = [0x2e2622, 0x1e1a18, 0x4a3426, 0x6b5a4a, 0x9a9a9a];
const SKINS = [0xf0c8a0, 0xe8b890, 0xd9a878, 0xf3d2b0];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const KID_LINES_DONE = ['這週領過了啦～', '下週再來！', '我已經喝完了！'];
const PED_BOO = ['欸那不是…', '拍到了拍到了', '甘蔗咧？', '嘖嘖'];

function sectorGeo(fov) {
  const g = new THREE.CircleGeometry(1, 20, -fov / 2, fov);
  g.rotateX(-Math.PI / 2);
  return g;
}

export class NPCSystem {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.crowd = new Crowd(scene, 170);
    this.all = [];
    this.peds = [];
    this.guests = [];
    this.reporters = [];
    this.kids = [];
    this.queue = [];
    this.workers = [];
    this.clerks = [];

    const add = (role, opts, extra = {}) => {
      const p = this.crowd.add({
        shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIRS), skin: pick(SKINS), ...opts,
      });
      Object.assign(p, { role, range: 15, fov: 1.9, ...extra });
      this.all.push(p);
      return p;
    };

    // pedestrians spread by district
    const pedCounts = { daan: 8, zhongshan: 10, xinyi: 8, wanhua: 6, beitou: 4 };
    for (const [key, n] of Object.entries(pedCounts)) {
      for (let i = 0; i < n; i++) this.peds.push(add('ped', {}, { district: key, speed: 1.2 + Math.random() * 0.6 }));
    }
    // banquet guests seated round the tables
    for (let t = 0; t < 6; t++) {
      const tx = POI.banquet.x - 15 + (t % 3) * 15;
      const tz = POI.banquet.z + Math.floor(t / 3) * 9;
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2 + t;
        this.guests.push(add('guest', { pose: 'sit' }, { seatX: tx + Math.cos(a) * 2.0, seatZ: tz + Math.sin(a) * 2.0, tableX: tx, tableZ: tz, phase: Math.random() * 6, range: 13 }));
      }
    }
    // the temple chairman hands out the sugarcane. The crowd entry keeps him in the vision and
    // facing logic; what you see is the dedicated model (glasses, temple vest, cane in hand).
    this.keeper = add('keeper', { scale: 0.0001 }, { range: 12 });
    this.chairman = makeChairman();
    scene.add(this.chairman);

    for (let i = 0; i < 3; i++) {
      this.reporters.push(add('reporter', { shirt: [0x3b7fc2, 0x4c9255, 0xe8b42f][i], pants: 0x3a3a44, accessories: ['camera'] }, {
        homeX: POI.banquet.x - 14 + i * 14, homeZ: POI.banquet.z + 20, range: 26, fov: 1.75, speed: 5.4,
      }));
    }
    for (let i = 0; i < 8; i++) {
      this.kids.push(add('kid', { shirt: 0xf6f4ee, pants: 0x2e3a5a, scale: 0.66, accessories: ['yellowcap', 'milk'] }, { range: 11, speed: 1.8 + Math.random() * 0.8, got: 0 }));
    }
    const qBase = POI.sell;
    for (let i = 0; i < 4; i++) {
      this.queue.push(add('queue', {}, { qx: qBase.x + 3 + i * 1.4, qz: qBase.z + 2.5 + i * 1.3 }));
    }
    for (let i = 0; i < WORKER.max; i++) {
      this.workers.push(add('worker', { shirt: 0x6b7a8a, pants: 0x3d3d48, accessories: ['vest', 'hardhat'] }, { hired: false, speed: 4.6 }));
    }
    for (const key of ['sell', 'recruit', 'shop', 'toolShop']) {
      const p = POI[key];
      this.clerks.push(add('clerk', { shirt: key === 'toolShop' ? 0x8a5a3b : pick(SHIRTS) }, { homeX: p.x, homeZ: p.z - 5.6, range: 10 }));
    }
    this.granny = add('granny', { shirt: 0xd9c2d6, pants: 0x6b5a7a, hair: 0xe6e6e6, pose: 'lie' }, { range: 0 });

    // vision cones, only shown while you are holding the sugarcane
    this.coneGeo = new Map();
    this.cones = [];
    // cones share one height and write depth with a strict depth test, so overlaps never stack up
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xf6dc8a, transparent: true, opacity: 0.1, depthFunc: THREE.LessDepth, fog: false });
    const coneMatHot = new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.22, depthFunc: THREE.LessDepth, fog: false });
    this.coneMats = [coneMat, coneMatHot];
    this.coneGroup = overlay(new THREE.Group());
    scene.add(this.coneGroup);
  }

  reset() {
    const g = this.game;
    for (const p of this.peds) {
      const pt = this.randomPoint(p.district);
      Object.assign(p, { x: pt.x, z: pt.z, tx: pt.x, tz: pt.z, visible: true, wait: Math.random() * 3, introHold: false, squat: 0 });
    }
    for (const p of this.guests) Object.assign(p, { x: p.seatX, z: p.seatZ, yaw: Math.atan2(p.tableX - p.seatX, p.tableZ - p.seatZ) });
    Object.assign(this.keeper, { x: POI.keeper.x, z: POI.keeper.z, yaw: 0, gave: false });
    this.chairman.userData.cane.visible = true;
    for (const p of this.reporters) Object.assign(p, { x: p.homeX, z: p.homeZ, yaw: Math.PI, state: 'idle', lastX: 0, lastZ: 0, look: 0 });
    const pg = POI.playground;
    for (const k of this.kids) {
      Object.assign(k, { x: pg.x0 + Math.random() * (pg.x1 - pg.x0), z: pg.z0 + Math.random() * (pg.z1 - pg.z0), got: 0, wait: 0, saidAt: -99 });
      k.tx = k.x; k.tz = k.z;
      this.crowd.setAccessoryVisible(k, 'milk', false);
    }
    for (const q of this.queue) Object.assign(q, { x: q.qx, z: q.qz, yaw: Math.atan2(POI.sell.x - q.qx, POI.sell.z - q.qz) });
    for (const w of this.workers) Object.assign(w, { hired: false, visible: false, state: 'idle', tree: null, block: null, chop: 0 });
    for (const c of this.clerks) Object.assign(c, { x: c.homeX, z: c.homeZ, yaw: 0 });
    Object.assign(this.granny, { x: POI.granny.x, z: POI.granny.z, yaw: 0.4, pose: 'lie', state: 'down', helpT: 0, noticed: false, visible: true });
    this.coneGroup.clear();
    this.cones.length = 0;
    this.weekNotice = 0;
    g.milk.week = 0;
  }

  randomPoint(district) {
    const [x0, z0, x1, z1] = DISTRICTS[district].rect;
    for (let t = 0; t < 30; t++) {
      const x = x0 + 6 + Math.random() * (x1 - x0 - 12);
      const z = z0 + 6 + Math.random() * (z1 - z0 - 12);
      if (this.game.world.free(x, z, 1.2) || this.game.world.onRoad(x, z)) return { x, z };
    }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }

  hireWorker() {
    const w = this.workers.find((x) => !x.hired);
    if (!w) return false;
    Object.assign(w, { hired: true, visible: true, x: POI.recruit.x + 2, z: POI.recruit.z + 2, state: 'seek', tree: null, block: null });
    return true;
  }

  // ---- vision
  sees(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > p.range) return false;
    if (d > 1.5) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const cos = (dx * fx + dz * fz) / d;
      if (cos < Math.cos(p.fov / 2)) return false;
    }
    return !segmentBlocked(this.game.grid, p.x, p.z, x, z);
  }

  // Who can see this spot right now (nearest first).
  seenBy(x, z) {
    const out = [];
    for (const p of this.all) {
      if (!p.visible || p.range <= 0) continue;
      if (p.role === 'worker' && !p.hired) continue;
      if (p.role === 'granny' && p.pose === 'lie') continue;
      if (this.sees(p, x, z)) out.push(p);
    }
    return out;
  }

  onSpotted(who) {
    const g = this.game;
    for (const p of who.slice(0, 4)) {
      g.fx.text(p.role === 'reporter' ? '喀嚓！' : pick(PED_BOO), p.x, 2.5, p.z, 'say', 2);
      if (p.role === 'reporter') g.fx.burst('sparkle', p.x, 1.9, p.z, 6);
    }
    for (const r of this.reporters) {
      r.state = 'follow';
      r.lastX = g.player.pos.x;
      r.lastZ = g.player.pos.z;
    }
  }

  // ---- per-frame
  update(dt) {
    const g = this.game;
    const px = g.player.pos.x, pz = g.player.pos.z;
    const resolve = (p) => resolveCircle(g.grid, p, 0.35);
    const stealth = g.holding === 'cane';
    const t = g.time;

    for (const p of this.peds) {
      if (p.introHold || Math.hypot(p.x - px, p.z - pz) > 160) continue;
      if (p.wait > 0) {
        p.wait -= dt;
        p.moving *= 0.9;
        continue;
      }
      const arrived = walkTowards(p, p.tx, p.tz, p.speed, dt, resolve);
      if (arrived || p.stuck > 1.2) {
        const pt = this.randomPoint(p.district);
        p.tx = pt.x;
        p.tz = pt.z;
        p.wait = 1 + Math.random() * 4;
        p.stuck = 0;
      }
    }

    for (const p of this.guests) {
      // chatting guests glance around the banquet
      const base = Math.atan2(p.tableX - p.seatX, p.tableZ - p.seatZ);
      p.yaw = base + Math.sin(t * 0.45 + p.phase) * 1.3;
    }

    const k = this.keeper;
    const dk = Math.hypot(px - k.x, pz - k.z);
    if (dk < 10) faceTowards(k, px, pz, dt, 4);
    else k.yaw = 0;
    const ch = this.chairman;
    ch.position.set(k.x, 0, k.z);
    ch.rotation.y = k.yaw;
    ch.userData.cane.visible = !k.gave;
    // he walks over to return the cane in the cutscene, so he is not at the banquet meanwhile
    ch.visible = !g.caneScene?.active;

    this.updateReporters(dt, stealth, resolve);
    this.updateKids(dt, resolve);
    this.updateWorkers(dt, resolve);
    this.updateGranny(dt);

    for (const c of this.clerks) {
      if (Math.hypot(px - c.x, pz - c.z) < 12) faceTowards(c, px, pz, dt, 3);
    }
    // queue buyers bob when the stall is busy
    const selling = g.selling;
    this.queue.forEach((q, i) => {
      q.hop = selling ? Math.max(0, Math.sin(t * 9 - i * 0.9)) * 0.18 : 0;
      faceTowards(q, px, pz, dt, 3);
    });

    this.updateCones(stealth);
    this.crowd.update();
  }

  updateReporters(dt, stealth, resolve) {
    const g = this.game;
    const px = g.player.pos.x, pz = g.player.pos.z;
    for (const r of this.reporters) {
      if (stealth && this.sees(r, px, pz)) {
        r.state = 'follow';
        r.lastX = px;
        r.lastZ = pz;
      }
      if (!stealth && r.state !== 'idle') r.state = 'return';
      const d = Math.hypot(px - r.x, pz - r.z);
      switch (r.state) {
        case 'follow': {
          if (d > 7) walkTowards(r, px, pz, r.speed, dt, resolve);
          else { faceTowards(r, px, pz, dt, 8); r.moving *= 0.85; }
          if (!this.sees(r, px, pz) && !(d < 4)) r.state = 'search';
          break;
        }
        case 'search': {
          if (walkTowards(r, r.lastX, r.lastZ, r.speed * 0.8, dt, resolve) || r.stuck > 1.5) {
            r.state = 'look';
            r.look = 3.5;
          }
          break;
        }
        case 'look': {
          r.look -= dt;
          r.yaw += dt * 1.6;
          r.moving *= 0.85;
          if (r.look <= 0) r.state = 'return';
          break;
        }
        case 'return': {
          if (walkTowards(r, r.homeX, r.homeZ, 3, dt, resolve) || r.stuck > 3) {
            r.state = 'idle';
            r.stuck = 0;
          }
          break;
        }
        default: {
          r.x += (r.homeX - r.x) * Math.min(1, dt);
          r.z += (r.homeZ - r.z) * Math.min(1, dt);
          faceTowards(r, POI.temple.x, POI.temple.z, dt, 2);
          r.moving *= 0.9;
        }
      }
    }
  }

  updateKids(dt, resolve) {
    const g = this.game;
    const px = g.player.pos.x, pz = g.player.pos.z;
    const pg = POI.playground;
    const carrying = g.holding === 'crate' && g.milk.bottles > 0;
    const active = g.quests.stage === 'milk_give';
    if (active) {
      g.milk.week -= dt;
      if (g.milk.week <= 0) {
        g.milk.week = MILK.weekSec;
        for (const k of this.kids) {
          k.got = 0;
          this.crowd.setAccessoryVisible(k, 'milk', false);
        }
        if (g.milk.delivered > 0) {
          g.toast('新的一週！學生又可以領鮮奶了');
          g.audio.sfx('quest', { volume: 0.5 });
        }
      }
    }
    for (const k of this.kids) {
      const d = Math.hypot(px - k.x, pz - k.z);
      const wants = carrying && k.got < g.milk.allowance && d < 16;
      if (wants) {
        walkTowards(k, px, pz, 3.6, dt, resolve);
        k.x = Math.max(pg.x0 - 8, Math.min(pg.x1 + 8, k.x));
        k.z = Math.max(pg.z0 - 6, Math.min(pg.z1 + 22, k.z));
      } else if (k.wait > 0) {
        k.wait -= dt;
        k.moving *= 0.85;
      } else if (walkTowards(k, k.tx, k.tz, k.speed, dt, resolve) || k.stuck > 1) {
        k.tx = pg.x0 + Math.random() * (pg.x1 - pg.x0);
        k.tz = pg.z0 + Math.random() * (pg.z1 - pg.z0);
        k.wait = Math.random() * 2;
      }
      k.hop = Math.max(0, (k.hop || 0) - dt * 1.5);
      if (d < 2.4 && g.holding === 'crate' && active) {
        if (k.got < g.milk.allowance && g.milk.bottles > 0) {
          k.got++;
          g.giveMilk(k);
          k.hop = 0.5;
          this.crowd.setAccessoryVisible(k, 'milk', true);
          k.saidAt = g.time;
        } else if (k.got >= g.milk.allowance && g.time - k.saidAt > 4) {
          g.fx.text(pick(KID_LINES_DONE), k.x, 1.9, k.z, 'say', 1.8);
          k.saidAt = g.time;
        }
      }
    }
  }

  updateWorkers(dt, resolve) {
    const g = this.game;
    const trees = g.world.trees.trees;
    for (const w of this.workers) {
      if (!w.hired) continue;
      if (g.airport.open && g.airport.remaining() > 0 && w.state !== 'demolish' && w.state !== 'toAirport') {
        if (w.tree) w.tree.claimed = false;
        w.tree = null;
        w.state = 'toAirport';
      }
      switch (w.state) {
        case 'seek': {
          let best = null, bd = 1e9;
          for (const t of trees) {
            if (!t.alive || t.claimed || t.fall > 0) continue;
            if (t.x < -118 || t.x > 40 || t.z < 30 || t.z > 146) continue;
            const d = Math.hypot(t.x - w.x, t.z - w.z);
            if (d < bd) { bd = d; best = t; }
          }
          if (best) {
            best.claimed = true;
            w.tree = best;
            w.state = 'walk';
          }
          break;
        }
        case 'walk': {
          const t = w.tree;
          if (!t.alive) { t.claimed = false; w.state = 'seek'; break; }
          const dx = w.x - t.x, dz = w.z - t.z, d = Math.hypot(dx, dz) || 1;
          if (walkTowards(w, t.x + (dx / d) * 1.4, t.z + (dz / d) * 1.4, w.speed, dt, resolve) || w.stuck > 2) {
            w.state = 'chop';
            w.chop = WORKER.chopTime;
            w.stuck = 0;
          }
          break;
        }
        case 'chop': {
          const t = w.tree;
          faceTowards(w, t.x, t.z, dt);
          w.chop -= dt;
          w.hop = Math.max(0, Math.sin(g.time * 8)) * 0.1;
          if (Math.floor((w.chop + dt) * 2) !== Math.floor(w.chop * 2)) {
            t.shake = 0.3;
            if (Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) < 30) g.audio.sfx('chop', { volume: 0.25 });
          }
          if (w.chop <= 0) {
            t.claimed = false;
            if (t.alive) g.workerFelled(t);
            w.hop = 0;
            w.state = 'seek';
          }
          break;
        }
        case 'toAirport': {
          const b = g.airport.nearestStanding(w.x, w.z);
          if (!b) { w.state = 'seek'; break; }
          w.block = b;
          const tx = b.x + (w.i % 3 - 1) * 4, tz = b.z + b.hd + 2.5 + (w.i % 2) * 1.5;
          if (walkTowards(w, tx, tz, w.speed * 1.3, dt, resolve) || w.stuck > 3) {
            w.state = 'demolish';
            w.stuck = 0;
          }
          break;
        }
        case 'demolish': {
          const b = w.block;
          if (!b || !b.alive) { w.state = 'toAirport'; break; }
          faceTowards(w, b.x, b.z, dt);
          w.hop = Math.max(0, Math.sin(g.time * 7 + w.i)) * 0.12;
          g.airport.damage(b, WORKER.demolishDps * dt, { worker: true });
          break;
        }
        default:
          w.state = 'seek';
      }
    }
  }

  updateGranny(dt) {
    const g = this.game, gr = this.granny;
    if (gr.state === 'gone') return;
    const d = Math.hypot(g.player.pos.x - gr.x, g.player.pos.z - gr.z);
    if (gr.state === 'down') {
      if (d < 7) gr.noticed = true;
      if (gr.noticed && d > 22 && !g.flags.grannyFlame) {
        g.grannyIgnored();
        gr.state = 'leaving';
        gr.pose = 'stand';
      }
    } else if (gr.state === 'leaving') {
      walkTowards(gr, POI.granny.x + 6, POI.granny.z - 30, 0.9, dt);
      if (Math.hypot(gr.x - POI.granny.x, gr.z - POI.granny.z) > 25) {
        gr.state = 'gone';
        gr.visible = false;
      }
    } else if (gr.state === 'helped') {
      gr.pose = 'stand';
      faceTowards(gr, g.player.pos.x, g.player.pos.z, dt, 3);
      gr.helpT -= dt;
      if (gr.helpT <= 0) gr.state = 'leaving';
    }
  }

  helpGranny() {
    const gr = this.granny;
    gr.state = 'helped';
    gr.pose = 'stand';
    gr.helpT = 3;
  }

  updateCones(stealth) {
    const g = this.game;
    const px = g.player.pos.x, pz = g.player.pos.z;
    if (!stealth) {
      if (this.cones.length) {
        this.coneGroup.clear();
        this.cones.length = 0;
      }
      return;
    }
    const shown = this.all.filter((p) => p.visible && p.range > 0 && !(p.role === 'worker' && !p.hired) && !(p.role === 'granny')
      && Math.hypot(p.x - px, p.z - pz) < p.range + 18);
    // hot cones first so they win the depth test where cones overlap
    const hot = new Set(shown.filter((p) => this.sees(p, px, pz)));
    shown.sort((a, b) => hot.has(b) - hot.has(a));
    while (this.cones.length < shown.length) {
      const m = new THREE.Mesh(sectorGeo(1.9), this.coneMats[0]);
      m.layers.set(1);
      this.coneGroup.add(m);
      this.cones.push(m);
    }
    this.cones.forEach((m, i) => {
      const p = shown[i];
      m.visible = !!p;
      if (!p) return;
      if (!this.coneGeo.has(p.fov)) this.coneGeo.set(p.fov, sectorGeo(p.fov));
      m.geometry = this.coneGeo.get(p.fov);
      m.position.set(p.x, 0.09, p.z);
      m.scale.set(p.range, 1, p.range);
      m.rotation.y = p.yaw - Math.PI / 2;
      m.material = hot.has(p) ? this.coneMats[1] : this.coneMats[0];
      m.renderOrder = hot.has(p) ? 1 : 2;
    });
  }
}
