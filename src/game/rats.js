import * as THREE from 'three';
import { mergeColored } from '../world/batcher.js';
import { P } from '../world/palette.js';
import { makeRat, makeRatNest } from '../world/props.js';
import { resolveCircle } from '../core/physics.js';
import { DISTRICTS, POI, districtAt } from '../world/map.js';
import { RAT, RAT_TARGET, BIG_RAT_CHANCE, NEST } from './config.js';

const M = () => new THREE.Matrix4();

function ratGeometry() {
  const s = mergeColored([
    { geo: new THREE.IcosahedronGeometry(0.45, 1), color: P.rat, matrix: M().makeTranslation(0, 0.38, 0).multiply(M().makeScale(0.85, 0.7, 1.35)) },
    { geo: new THREE.ConeGeometry(0.28, 0.6, 7).rotateX(Math.PI / 2), color: P.rat, matrix: M().makeTranslation(0, 0.45, 0.78) },
    { geo: new THREE.SphereGeometry(0.07, 6, 4), color: P.ratPink, matrix: M().makeTranslation(0, 0.45, 1.08) },
    { geo: new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10).rotateX(Math.PI / 2), color: P.ratPink, matrix: M().makeTranslation(-0.2, 0.72, 0.6) },
    { geo: new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10).rotateX(Math.PI / 2), color: P.ratPink, matrix: M().makeTranslation(0.2, 0.72, 0.6) },
    { geo: new THREE.SphereGeometry(0.05, 6, 4), color: P.eye, matrix: M().makeTranslation(-0.13, 0.56, 0.9) },
    { geo: new THREE.SphereGeometry(0.05, 6, 4), color: P.eye, matrix: M().makeTranslation(0.13, 0.56, 0.9) },
    { geo: new THREE.TorusGeometry(0.5, 0.04, 4, 10, Math.PI * 0.9).rotateY(Math.PI / 2), color: P.ratPink, matrix: M().makeTranslation(0, 0.35, -0.95) },
    { geo: new THREE.BoxGeometry(0.08, 0.16, 0.08), color: P.ratPink, matrix: M().makeTranslation(-0.22, 0.08, 0.35) },
    { geo: new THREE.BoxGeometry(0.08, 0.16, 0.08), color: P.ratPink, matrix: M().makeTranslation(0.22, 0.08, 0.35) },
    { geo: new THREE.BoxGeometry(0.08, 0.16, 0.08), color: P.ratPink, matrix: M().makeTranslation(-0.22, 0.08, -0.35) },
    { geo: new THREE.BoxGeometry(0.08, 0.16, 0.08), color: P.ratPink, matrix: M().makeTranslation(0.22, 0.08, -0.35) },
  ]);
  return s;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const BIG_TINT = new THREE.Color(0.72, 0.68, 0.7);
const SMALL_TINT = new THREE.Color(1, 1, 1);
const HIT_TINT = new THREE.Color(1.6, 0.6, 0.55);

export class RatSystem {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.cap = 160;
    this.mesh = new THREE.InstancedMesh(ratGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.cap);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.cap; i++) {
      this.mesh.setMatrixAt(i, HIDE);
      this.mesh.setColorAt(i, SMALL_TINT);
    }
    scene.add(this.mesh);
    this.rats = [];
    this.freeIdx = [];
    for (let i = this.cap - 1; i >= 0; i--) this.freeIdx.push(i);

    this.king = { obj: makeRat('king'), x: POI.ratKing.x, z: POI.ratKing.z, yaw: 0.6, hp: RAT.king.hp, max: RAT.king.hp, alive: true, biteCd: 0, hit: 0, walk: 0, radius: 1.8 };
    scene.add(this.king.obj);

    this.nests = POI.nests.map((n) => {
      const obj = makeRatNest();
      obj.position.set(n.x, 0, n.z);
      scene.add(obj);
      return { obj, x: n.x, z: n.z, hp: NEST.hp, max: NEST.hp, alive: true, regrowAt: 0, hit: 0, radius: 1.9, district: districtAt(n.x, n.z) };
    });
    this.spawnClock = 0;
  }

  reset() {
    for (const r of this.rats) this.mesh.setMatrixAt(r.i, HIDE), this.freeIdx.push(r.i);
    this.rats.length = 0;
    const k = this.king;
    Object.assign(k, { x: POI.ratKing.x, z: POI.ratKing.z, hp: RAT.king.hp * this.game.diff.spawnMult ** 0.5, alive: true, biteCd: 0, hit: 0 });
    k.max = k.hp;
    k.obj.visible = true;
    k.obj.rotation.set(0, 0.6, 0);
    for (const n of this.nests) {
      Object.assign(n, { hp: NEST.hp, alive: true, regrowAt: 0, hit: 0 });
      n.obj.visible = true;
      n.obj.scale.setScalar(1);
    }
    // seed the map so it is not empty on the first frame
    for (const key of Object.keys(RAT_TARGET)) {
      if (key === 'songshan') continue;
      for (let i = 0; i < Math.round(RAT_TARGET[key] * 0.7); i++) this.spawnIn(key, true);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  countIn(key) {
    let n = 0;
    for (const r of this.rats) if (r.district === key) n++;
    return n;
  }

  spawnIn(key, anywhere = false, near = null) {
    const idx = this.freeIdx.pop();
    if (idx === undefined) return null;
    const g = this.game;
    const [x0, z0, x1, z1] = DISTRICTS[key].rect;
    let x, z, ok = false;
    for (let t = 0; t < 20 && !ok; t++) {
      if (near) {
        const a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * 3;
        x = near.x + Math.cos(a) * d;
        z = near.z + Math.sin(a) * d;
      } else {
        x = x0 + 4 + Math.random() * (x1 - x0 - 8);
        z = z0 + 4 + Math.random() * (z1 - z0 - 8);
      }
      if (!g.world.free(x, z, 0.8) && !near) continue;
      if (g.inSafeZone(x, z)) continue;
      if (!anywhere && Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 22) continue;
      if (key === 'songshan' && (z < -154 || z > -60 || x < 60 || x > 262)) continue;
      ok = true;
    }
    if (!ok) {
      this.freeIdx.push(idx);
      return null;
    }
    const kind = Math.random() < BIG_RAT_CHANCE[key] ? 'big' : 'small';
    const def = RAT[kind];
    const rat = {
      i: idx, x, z, yaw: Math.random() * 6.28, kind, def, hp: def.hp, alive: true, district: key,
      homeX: x, homeZ: z, wx: x, wz: z, wanderT: 0, biteCd: 0.5, hit: 0, walk: Math.random() * 6, chasing: false,
      radius: kind === 'big' ? 0.65 : 0.42, scale: kind === 'big' ? 1.7 : 1,
    };
    this.mesh.setColorAt(idx, kind === 'big' ? BIG_TINT : SMALL_TINT);
    this.mesh.instanceColor.needsUpdate = true;
    this.rats.push(rat);
    return rat;
  }

  damageRat(rat, dmg) {
    rat.hp -= dmg;
    rat.hit = 0.15;
    rat.chasing = true;
    const g = this.game;
    g.fx.burst('poof', rat.x, 0.5, rat.z, 3);
    if (rat.hp <= 0) this.killRat(rat);
    else g.audio.sfx('squeak', { pitch: rat.kind === 'big' ? 0.7 : 1 + Math.random() * 0.2, volume: 0.7 });
  }

  killRat(rat) {
    const g = this.game;
    rat.alive = false;
    this.mesh.setMatrixAt(rat.i, HIDE);
    this.freeIdx.push(rat.i);
    this.rats.splice(this.rats.indexOf(rat), 1);
    g.fx.burst('poof', rat.x, 0.4, rat.z, 10);
    g.audio.sfx('ratDie', { pitch: rat.kind === 'big' ? 0.75 : 1 });
    g.stats.rats++;
    g.gainItem(rat.def.drop, rat.district, rat.x, rat.z);
  }

  damageNest(nest, dmg) {
    const g = this.game;
    nest.hp -= dmg;
    nest.hit = 0.2;
    g.fx.burst('chips', nest.x, 1, nest.z, 4);
    if (nest.hp <= 0) {
      nest.alive = false;
      nest.regrowAt = g.time + NEST.regrow;
      g.fx.burst('bigdust', nest.x, 0.8, nest.z, 8);
      g.fx.burst('chips', nest.x, 1, nest.z, 14);
      g.audio.sfx('nest');
      g.addMoney(NEST.reward, nest.x, 2, nest.z);
      g.status.haste = NEST.haste.sec;
      g.stats.nests++;
      g.toast(`拆掉鼠窩！＋$${NEST.reward}，攻擊速度 ×${NEST.haste.mult}（${NEST.haste.sec} 秒）`);
      // whoever was inside comes out angry
      for (let i = 0; i < 2; i++) {
        const r = this.spawnIn(nest.district, true, nest);
        if (r) r.chasing = true;
      }
    }
  }

  damageKing(dmg) {
    const k = this.king, g = this.game;
    k.hp -= dmg;
    k.hit = 0.15;
    g.audio.sfx('squeak', { pitch: 0.45, volume: 0.9 });
    if (k.hp <= 0 && k.alive) {
      k.alive = false;
      g.fx.burst('bigdust', k.x, 1, k.z, 14);
      g.fx.burst('sparkle', k.x, 2, k.z, 30);
      g.audio.sfx('cheer');
      g.addMoney(RAT.king.reward, k.x, 3, k.z);
      g.flags.king = true;
      g.toast('復活的老鼠王又倒下了！');
      g.unlock('king');
    }
  }

  // Returns true if this rat may bite the player right now.
  canBite() {
    const g = this.game;
    if (g.underUmbrella) {
      g.flags.usedUmbrella = true;
      return false;
    }
    return !g.inSafeZone(g.player.pos.x, g.player.pos.z) && g.vulnerable();
  }

  update(dt) {
    const g = this.game;
    const px = g.player.pos.x, pz = g.player.pos.z;
    const safe = g.inSafeZone(px, pz);
    const mult = g.diff.spawnMult;

    // spawning
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      this.spawnClock = 1.2 / mult;
      for (const key of Object.keys(RAT_TARGET)) {
        if (key === 'songshan' && !g.airport.open) continue;
        if (this.countIn(key) < RAT_TARGET[key] * mult) {
          const nests = this.nests.filter((n) => n.alive && n.district === key);
          const near = nests.length && Math.random() < 0.6 ? nests[Math.floor(Math.random() * nests.length)] : null;
          if (near && Math.hypot(near.x - px, near.z - pz) < 14) continue;
          this.spawnIn(key, false, near);
        }
      }
    }

    for (const n of this.nests) {
      if (!n.alive && g.time >= n.regrowAt) {
        n.alive = true;
        n.hp = n.max;
      }
      n.hit = Math.max(0, n.hit - dt);
      n.obj.visible = n.alive;
      n.obj.position.x = n.x + (n.hit > 0 ? (Math.random() - 0.5) * 0.2 : 0);
    }

    for (const r of this.rats) {
      const dx = px - r.x, dz = pz - r.z;
      const d = Math.hypot(dx, dz);
      if (d > 140) continue;
      r.biteCd -= dt;
      r.hit = Math.max(0, r.hit - dt);
      const aggro = r.def.aggro * (g.diff.key === 'hell' ? 1.3 : 1);
      if (!safe && g.vulnerable() && (d < aggro || (r.chasing && d < aggro * 2))) r.chasing = true;
      else if (d > aggro * 2.2 || safe || !g.vulnerable()) r.chasing = false;

      let tx, tz, speed;
      if (r.chasing) {
        tx = px; tz = pz; speed = r.def.speed * (r.hit > 0 ? 0.3 : 1);
        if (g.underUmbrella && d < 4.5) {
          // circle just outside the umbrella's shade
          const a = Math.atan2(r.z - pz, r.x - px) + dt * 1.5;
          tx = px + Math.cos(a) * 3.6;
          tz = pz + Math.sin(a) * 3.6;
        }
      } else {
        r.wanderT -= dt;
        if (r.wanderT <= 0) {
          r.wanderT = 2 + Math.random() * 4;
          r.wx = r.homeX + (Math.random() - 0.5) * 16;
          r.wz = r.homeZ + (Math.random() - 0.5) * 16;
        }
        tx = r.wx; tz = r.wz; speed = 1.4;
      }
      const mx = tx - r.x, mz = tz - r.z;
      const md = Math.hypot(mx, mz);
      const stopAt = r.chasing ? 0.9 + r.radius : 0.3;
      if (md > stopAt) {
        const step = Math.min(md - stopAt, speed * dt);
        r.x += (mx / md) * step;
        r.z += (mz / md) * step;
        r.walk += dt * speed * 4;
        r.yaw = Math.atan2(mx, mz);
      } else if (r.chasing) {
        r.yaw = Math.atan2(dx, dz);
      }
      resolveCircle(g.grid, r, r.radius);
      // rats will not step into safe circles
      for (const s of g.world.safeZones) {
        const sx = r.x - s.x, sz = r.z - s.z, sd = Math.hypot(sx, sz);
        if (sd < s.r) {
          r.x = s.x + (sx / (sd || 1)) * s.r;
          r.z = s.z + (sz / (sd || 1)) * s.r;
        }
      }
      if (r.chasing && d < 1.25 + r.radius && r.biteCd <= 0) {
        r.biteCd = 1.0;
        if (this.canBite()) {
          g.hurt(r.def.dmg, r.def.poison);
          g.audio.sfx('bite', { pitch: r.kind === 'big' ? 0.8 : 1.1 });
        }
      }

      const hop = Math.abs(Math.sin(r.walk)) * 0.08;
      tmpE.set(0, r.yaw, Math.sin(r.walk) * 0.08);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(r.scale * (r.hit > 0 ? 1.12 : 1));
      tmpP.set(r.x, hop, r.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(r.i, tmpM);
      if (r.hit > 0 || r.wasHit) {
        this.mesh.setColorAt(r.i, r.hit > 0 ? HIT_TINT : (r.kind === 'big' ? BIG_TINT : SMALL_TINT));
        this.mesh.instanceColor.needsUpdate = true;
        r.wasHit = r.hit > 0;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.updateKing(dt, px, pz, safe);
  }

  updateKing(dt, px, pz, safe) {
    const k = this.king, g = this.game;
    k.obj.visible = k.alive;
    if (!k.alive) return;
    k.biteCd -= dt;
    k.hit = Math.max(0, k.hit - dt);
    const d = Math.hypot(px - k.x, pz - k.z);
    const home = POI.ratKing;
    const leash = Math.hypot(k.x - home.x, k.z - home.z);
    let tx = home.x, tz = home.z, speed = 2;
    if (!safe && g.vulnerable() && d < RAT.king.aggro && Math.hypot(px - home.x, pz - home.z) < 45) {
      tx = px; tz = pz; speed = RAT.king.speed;
    }
    const mx = tx - k.x, mz = tz - k.z, md = Math.hypot(mx, mz);
    if (md > 2.6 && leash < 48) {
      const step = Math.min(md - 2.6, speed * dt);
      k.x += (mx / md) * step;
      k.z += (mz / md) * step;
      k.walk += dt * speed * 2.5;
      k.yaw = Math.atan2(mx, mz);
    }
    resolveCircle(g.grid, k, k.radius);
    if (d < 3.4 && k.biteCd <= 0) {
      k.biteCd = 1.4;
      if (this.canBite()) {
        g.hurt(RAT.king.dmg, RAT.king.poison);
        g.status.slow = Math.max(g.status.slow, 3);
        g.audio.sfx('bite', { pitch: 0.55 });
        g.fx.shake(0.3);
      }
    }
    k.obj.position.set(k.x + (k.hit > 0 ? (Math.random() - 0.5) * 0.3 : 0), Math.abs(Math.sin(k.walk)) * 0.15, k.z);
    k.obj.rotation.y = k.yaw;
  }
}
