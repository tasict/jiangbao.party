import * as THREE from 'three';
import { mat } from '../world/batcher.js';
import { makeSugarcane } from '../world/props.js';

// What the player holds in first person: one of four tools, the sugarcane, or a milk crate.

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function arm(sleeve = 0xf4f0e6) {
  const g = new THREE.Group();
  g.add(box(0.12, 0.12, 0.14, 0xf0c8a0, 0, -0.18, 0));
  g.add(box(0.16, 0.16, 0.42, sleeve, 0.02, -0.24, 0.24));
  return g;
}

function makeAxe() {
  const g = new THREE.Group();
  g.add(box(0.06, 0.62, 0.06, 0x9a6a40));
  g.add(box(0.22, 0.14, 0.05, 0xb8c0c6, 0.08, 0.26, 0));
  g.add(box(0.04, 0.16, 0.055, 0xe4e8ea, 0.19, 0.26, 0));
  g.add(arm());
  return g;
}

function makeSaw() {
  const g = new THREE.Group();
  g.add(box(0.1, 0.22, 0.08, 0xc63d2c, 0, -0.08, 0));
  const blade = box(0.035, 0.75, 0.16, 0xc9d0d4, 0, 0.36, 0.02);
  g.add(blade);
  for (let i = 0; i < 9; i++) g.add(box(0.03, 0.05, 0.05, 0x9aa3ab, 0, 0.04 + i * 0.08, 0.11));
  g.add(arm());
  return g;
}

function makeChainsaw() {
  const g = new THREE.Group();
  g.add(box(0.26, 0.2, 0.36, 0xf07a2a, 0, 0, 0.05));
  g.add(box(0.27, 0.06, 0.2, 0x2f2f34, 0, 0.13, 0));
  g.add(box(0.05, 0.08, 0.7, 0xb8c0c6, 0, 0, -0.45));
  for (let i = 0; i < 8; i++) g.add(box(0.07, 0.03, 0.04, 0x3a3a3a, 0, 0.05, -0.15 - i * 0.085));
  g.add(box(0.03, 0.18, 0.03, 0x2f2f34, 0, 0.2, 0.12));
  g.add(arm(0xf07a2a));
  g.userData.vibrate = true;
  return g;
}

function makeExcavator() {
  const g = new THREE.Group();
  // the excavator arm reaches in from the lower right, bucket out front
  const boom = new THREE.Group();
  boom.add(box(0.14, 0.14, 1.1, 0xe8b42f, 0, 0, -0.55));
  boom.add(box(0.05, 0.05, 0.8, 0x6b6460, 0.09, 0.08, -0.45));
  const stick = new THREE.Group();
  stick.add(box(0.11, 0.11, 0.7, 0xe8b42f, 0, 0, -0.35));
  const bucket = new THREE.Group();
  bucket.add(box(0.42, 0.26, 0.1, 0x6b6460, 0, -0.08, 0));
  bucket.add(box(0.42, 0.05, 0.26, 0x6b6460, 0, -0.2, 0.1));
  for (let i = -2; i <= 2; i++) bucket.add(box(0.05, 0.07, 0.07, 0xc9d0d4, i * 0.085, -0.24, 0.24));
  bucket.position.set(0, 0, -0.7);
  stick.add(bucket);
  stick.position.set(0, 0, -1.1);
  stick.rotation.x = -0.9;
  boom.add(stick);
  boom.rotation.set(0.35, 0.25, 0);
  g.add(boom);
  g.userData.boom = boom;
  g.userData.bucket = bucket;
  return g;
}

function makeCrate() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.06, 0.42, 0x3b7fc2, 0, -0.12, 0));
  g.add(box(0.6, 0.22, 0.04, 0x3b7fc2, 0, 0, 0.2));
  g.add(box(0.6, 0.22, 0.04, 0x3b7fc2, 0, 0, -0.2));
  g.add(box(0.04, 0.22, 0.42, 0x3b7fc2, 0.3, 0, 0));
  g.add(box(0.04, 0.22, 0.42, 0x3b7fc2, -0.3, 0, 0));
  const bottles = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 8), mat(0xf8f6ee));
    const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 8), mat(0x3b7fc2));
    capM.position.y = 0.14;
    b.add(body, capM);
    b.position.set(-0.18 + (i % 3) * 0.18, 0.03, -0.09 + Math.floor(i / 3) * 0.18);
    g.add(b);
    bottles.push(b);
  }
  const l = arm(), r = arm();
  l.position.set(-0.32, 0.1, 0.1);
  r.position.set(0.32, 0.1, 0.1);
  g.add(l, r);
  g.userData.bottles = bottles;
  return g;
}

function makeHeldCane() {
  const g = new THREE.Group();
  const cane = makeSugarcane();
  cane.scale.setScalar(0.75);
  cane.position.set(0, -0.6, 0);
  cane.rotation.set(-0.2, 0, 0.12);
  g.add(cane);
  const a = arm();
  a.position.set(0, 0.05, 0);
  g.add(a);
  return g;
}

const REST = {
  tool: { pos: new THREE.Vector3(0.3, -0.3, -0.5), rot: new THREE.Euler(0.25, -0.3, -0.15), scale: 0.55 },
  excavator: { pos: new THREE.Vector3(0.42, -0.42, -0.25), rot: new THREE.Euler(0, 0, 0), scale: 0.6 },
  cane: { pos: new THREE.Vector3(0.36, -0.42, -0.5), rot: new THREE.Euler(0.25, -0.25, -0.7), scale: 0.42 },
  crate: { pos: new THREE.Vector3(0, -0.36, -0.55), rot: new THREE.Euler(0.35, 0, 0), scale: 0.6 },
};

export class ViewModel {
  constructor(parent) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.tools = [makeAxe(), makeSaw(), makeChainsaw(), makeExcavator()];
    this.cane = makeHeldCane();
    this.crate = makeCrate();
    for (const m of [...this.tools, this.cane, this.crate]) {
      m.visible = false;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      this.root.add(m);
    }
    this.tier = 0;
    this.holding = null;
    this.swingT = 1;
    this.swingDur = 0.25;
    this.time = 0;
    this.lower = 0;
    this.refresh();
  }

  setTier(tier) {
    this.tier = tier;
    this.refresh();
  }

  setHolding(kind) {
    this.holding = kind;
    this.lower = 1;
    this.refresh();
  }

  setBottles(n) {
    this.crate.userData.bottles.forEach((b, i) => (b.visible = i < n));
  }

  refresh() {
    this.tools.forEach((t, i) => (t.visible = !this.holding && i === this.tier));
    this.cane.visible = this.holding === 'cane';
    this.crate.visible = this.holding === 'crate';
  }

  active() {
    if (this.holding === 'cane') return [this.cane, REST.cane];
    if (this.holding === 'crate') return [this.crate, REST.crate];
    return [this.tools[this.tier], this.tier === 3 ? REST.excavator : REST.tool];
  }

  swing(interval) {
    this.swingDur = Math.min(0.32, Math.max(0.12, interval * 0.8));
    this.swingT = 0;
  }

  update(dt, moving) {
    this.time += dt;
    this.swingT = Math.min(1, this.swingT + dt / this.swingDur);
    this.lower = Math.max(0, this.lower - dt * 4);
    const [m, rest] = this.active();
    const s = this.swingT;
    // fast strike, slower recovery
    const strike = s < 0.35 ? s / 0.35 : 1 - (s - 0.35) / 0.65;
    const sway = Math.sin(this.time * 1.6) * 0.01 + Math.sin(this.time * 7) * 0.012 * moving;
    m.scale.setScalar(rest.scale);
    m.position.copy(rest.pos);
    m.position.y += sway - this.lower * 0.4;
    m.rotation.copy(rest.rot);
    if (this.holding) return;
    if (this.tier === 3) {
      const boom = m.userData.boom;
      boom.rotation.x = 0.35 - strike * 0.5;
      m.userData.bucket.rotation.x = strike * 1.1;
    } else if (this.tier === 2) {
      m.position.z -= strike * 0.12;
      m.rotation.x -= strike * 0.3;
      m.position.x += (Math.random() - 0.5) * 0.008;
      m.position.y += (Math.random() - 0.5) * 0.008;
    } else {
      m.rotation.x -= strike * 1.1;
      m.rotation.z += strike * 0.25;
      m.position.y += strike * 0.04;
      m.position.z -= strike * 0.1;
    }
  }
}
