import * as THREE from 'three';
import { mergeColored } from '../world/batcher.js';

// Every person in the city is drawn through a handful of InstancedMeshes
// (torso, head, hair, two legs, accessories), so 100 NPCs cost ~8 draw calls.

const M = () => new THREE.Matrix4();
const lam = (opts = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...opts });

function torsoGeo() {
  return mergeColored([
    { geo: new THREE.BoxGeometry(0.62, 0.72, 0.36), color: 0xffffff, matrix: M().makeTranslation(0, 1.22, 0) },
    { geo: new THREE.BoxGeometry(0.16, 0.66, 0.2), color: 0xffffff, matrix: M().makeTranslation(-0.41, 1.24, 0).multiply(M().makeRotationZ(-0.08)) },
    { geo: new THREE.BoxGeometry(0.16, 0.66, 0.2), color: 0xffffff, matrix: M().makeTranslation(0.41, 1.24, 0).multiply(M().makeRotationZ(0.08)) },
    { geo: new THREE.BoxGeometry(0.14, 0.14, 0.16), color: 0xe8c0a0, matrix: M().makeTranslation(-0.43, 0.86, 0) },
    { geo: new THREE.BoxGeometry(0.14, 0.14, 0.16), color: 0xe8c0a0, matrix: M().makeTranslation(0.43, 0.86, 0) },
  ]);
}

function headGeo() {
  return mergeColored([
    { geo: new THREE.BoxGeometry(0.4, 0.42, 0.4), color: 0xffffff, matrix: M().makeTranslation(0, 1.82, 0) },
    { geo: new THREE.BoxGeometry(0.06, 0.06, 0.02), color: 0x2a2420, matrix: M().makeTranslation(-0.09, 1.86, 0.205) },
    { geo: new THREE.BoxGeometry(0.06, 0.06, 0.02), color: 0x2a2420, matrix: M().makeTranslation(0.09, 1.86, 0.205) },
  ]);
}

function hairGeo() {
  return mergeColored([
    { geo: new THREE.BoxGeometry(0.44, 0.14, 0.44), color: 0xffffff, matrix: M().makeTranslation(0, 2.06, 0) },
    { geo: new THREE.BoxGeometry(0.44, 0.3, 0.1), color: 0xffffff, matrix: M().makeTranslation(0, 1.92, -0.18) },
  ]);
}

function legGeo(side) {
  const g = mergeColored([
    { geo: new THREE.BoxGeometry(0.23, 0.8, 0.28), color: 0xffffff, matrix: M().makeTranslation(0, -0.4, 0) },
    { geo: new THREE.BoxGeometry(0.25, 0.1, 0.36), color: 0x3a3330, matrix: M().makeTranslation(0, -0.82, 0.04) },
  ]);
  g.translate(side * 0.13, 0, 0);
  return g;
}

const ACCESSORIES = {
  camera: () => mergeColored([
    { geo: new THREE.BoxGeometry(0.34, 0.26, 0.42), color: 0x2f2f34, matrix: M().makeTranslation(0.3, 1.78, 0.36) },
    { geo: new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8).rotateX(Math.PI / 2), color: 0x1e1e22, matrix: M().makeTranslation(0.3, 1.78, 0.68) },
  ]),
  hardhat: () => mergeColored([
    { geo: new THREE.SphereGeometry(0.27, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), color: 0xf2c230, matrix: M().makeTranslation(0, 2.06, 0) },
    { geo: new THREE.CylinderGeometry(0.33, 0.33, 0.04, 10), color: 0xf2c230, matrix: M().makeTranslation(0, 2.07, 0.03) },
  ]),
  yellowcap: () => mergeColored([
    { geo: new THREE.CylinderGeometry(0.25, 0.26, 0.14, 10), color: 0xf5d13a, matrix: M().makeTranslation(0, 2.12, 0) },
    { geo: new THREE.BoxGeometry(0.34, 0.03, 0.2), color: 0xf5d13a, matrix: M().makeTranslation(0, 2.06, 0.25) },
  ]),
  vest: () => mergeColored([
    { geo: new THREE.BoxGeometry(0.66, 0.5, 0.4), color: 0xf07a2a, matrix: M().makeTranslation(0, 1.3, 0) },
    { geo: new THREE.BoxGeometry(0.67, 0.07, 0.41), color: 0xf3f0d0, matrix: M().makeTranslation(0, 1.2, 0) },
  ]),
  crate: () => mergeColored([
    { geo: new THREE.BoxGeometry(0.6, 0.35, 0.4), color: 0x3b7fc2, matrix: M().makeTranslation(0, 1.05, 0.38) },
  ]),
  milk: () => mergeColored([
    { geo: new THREE.CylinderGeometry(0.07, 0.08, 0.26, 8), color: 0xf8f6ee, matrix: M().makeTranslation(0.43, 1.0, 0.12) },
    { geo: new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8), color: 0x3b7fc2, matrix: M().makeTranslation(0.43, 1.15, 0.12) },
  ]),
};

const tmpM = new THREE.Matrix4();
const tmpBase = new THREE.Matrix4();
const tmpLeg = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export class Crowd {
  constructor(scene, capacity = 160) {
    this.capacity = capacity;
    this.people = [];
    const make = (geo) => {
      const m = new THREE.InstancedMesh(geo, lam({ vertexColors: true }), capacity);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    this.torso = make(torsoGeo());
    this.head = make(headGeo());
    this.hair = make(hairGeo());
    this.legL = make(legGeo(-1));
    this.legR = make(legGeo(1));
    this.acc = {};
    for (const [k, f] of Object.entries(ACCESSORIES)) this.acc[k] = make(f());
    this.accCount = Object.fromEntries(Object.keys(ACCESSORIES).map((k) => [k, 0]));
  }

  add({ x = 0, z = 0, yaw = 0, shirt = 0x4a7fc0, pants = 0x3d3d48, skin = 0xf0c8a0, hair = 0x2e2622, scale = 1, accessories = [], pose = 'stand' } = {}) {
    const i = this.people.length;
    if (i >= this.capacity) throw new Error('crowd full');
    const p = {
      i, x, z, y: 0, yaw, scale, pose, walk: 0, moving: 0, visible: true, hop: 0, accessories: {},
      shirt, pants, skin, hair,
    };
    for (const a of accessories) p.accessories[a] = this.accCount[a]++;
    this.people.push(p);
    for (const m of [this.torso, this.head, this.hair, this.legL, this.legR]) m.count = this.people.length;
    for (const [k, m] of Object.entries(this.acc)) m.count = this.accCount[k];
    this.recolor(p);
    return p;
  }

  recolor(p) {
    this.torso.setColorAt(p.i, tmpC.set(p.shirt));
    this.head.setColorAt(p.i, tmpC.set(p.skin));
    this.hair.setColorAt(p.i, tmpC.set(p.hair));
    this.legL.setColorAt(p.i, tmpC.set(p.pants));
    this.legR.setColorAt(p.i, tmpC.set(p.pants));
    for (const m of [this.torso, this.head, this.hair, this.legL, this.legR]) m.instanceColor.needsUpdate = true;
  }

  setAccessoryVisible(p, name, on) {
    p.hiddenAcc = p.hiddenAcc || {};
    p.hiddenAcc[name] = !on;
  }

  update() {
    for (const p of this.people) {
      if (!p.visible) {
        for (const m of [this.torso, this.head, this.hair, this.legL, this.legR]) m.setMatrixAt(p.i, HIDE);
        for (const [k, idx] of Object.entries(p.accessories)) this.acc[k].setMatrixAt(idx, HIDE);
        continue;
      }
      const bob = Math.abs(Math.sin(p.walk)) * 0.05 * p.moving;
      const sit = p.pose === 'sit';
      const lie = p.pose === 'lie';
      const sq = p.squat || 0;
      tmpP.set(p.x, p.y + bob + p.hop + (sit ? -0.4 * p.scale : 0) + (lie ? 0.25 : 0) - sq * 0.42 * p.scale, p.z);
      tmpE.set(lie ? -Math.PI / 2 : 0, p.yaw, 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(p.scale);
      tmpBase.compose(tmpP, tmpQ, tmpS);
      if (lie) tmpBase.multiply(tmpM.makeTranslation(0, -1.0, 0));

      this.torso.setMatrixAt(p.i, tmpBase);
      this.head.setMatrixAt(p.i, tmpBase);
      this.hair.setMatrixAt(p.i, tmpBase);
      const swing = sit ? -Math.PI / 2 : sq > 0.01 ? -1.2 * sq : Math.sin(p.walk) * 0.6 * p.moving;
      tmpLeg.copy(tmpBase).multiply(tmpM.makeTranslation(0, 0.86, 0)).multiply(tmpM.makeRotationX(sit ? swing : swing));
      this.legL.setMatrixAt(p.i, tmpLeg);
      tmpLeg.copy(tmpBase).multiply(tmpM.makeTranslation(0, 0.86, 0)).multiply(tmpM.makeRotationX(sit || sq > 0.01 ? swing : -swing));
      this.legR.setMatrixAt(p.i, tmpLeg);
      for (const [k, idx] of Object.entries(p.accessories)) {
        this.acc[k].setMatrixAt(idx, p.hiddenAcc?.[k] ? HIDE : tmpBase);
      }
    }
    for (const m of [this.torso, this.head, this.hair, this.legL, this.legR]) m.instanceMatrix.needsUpdate = true;
    for (const m of Object.values(this.acc)) m.instanceMatrix.needsUpdate = true;
  }
}

// Simple walker: steer towards a target, sliding along obstacles.
export function walkTowards(p, tx, tz, speed, dt, resolve) {
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) {
    p.moving += (0 - p.moving) * Math.min(1, dt * 8);
    return true;
  }
  const step = Math.min(d, speed * dt);
  const ox = p.x, oz = p.z;
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  if (resolve) resolve(p);
  const moved = Math.hypot(p.x - ox, p.z - oz);
  p.stuck = moved < step * 0.3 ? (p.stuck || 0) + dt : 0;
  const targetYaw = Math.atan2(dx, dz);
  let dy = targetYaw - p.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  p.yaw += dy * Math.min(1, dt * 8);
  p.moving += (1 - p.moving) * Math.min(1, dt * 8);
  p.walk += dt * speed * 2.6;
  return false;
}

export function faceTowards(p, tx, tz, dt, rate = 6) {
  const targetYaw = Math.atan2(tx - p.x, tz - p.z);
  let dy = targetYaw - p.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  p.yaw += dy * Math.min(1, dt * rate);
}
