import * as THREE from 'three';
import { overlay } from '../world/batcher.js';

// Particles (wood chips, dust, smoke, steam, sparkles) as one instanced mesh,
// plus DOM floating text projected from world space.

const PRESETS = {
  chips: { color: [0xb07a4a, 0x8a5a3b, 0xd8b07a], size: [0.08, 0.16], speed: [2, 5], up: [2, 5], life: [0.5, 0.9], gravity: 14, grow: 0 },
  leaves: { color: [0x5aa04a, 0x86bd52, 0x4c9255], size: [0.1, 0.18], speed: [1, 3], up: [1, 3], life: [0.9, 1.6], gravity: 3, grow: 0 },
  dust: { color: [0xd8cdb6, 0xc9bda5, 0xe6dccb], size: [0.3, 0.6], speed: [0.5, 2], up: [0.3, 1.2], life: [0.7, 1.3], gravity: -0.3, grow: 1.6 },
  bigdust: { color: [0xd8cdb6, 0xc9bda5, 0xb8ab94], size: [1.2, 2.4], speed: [2, 6], up: [1, 3], life: [1.4, 2.4], gravity: -0.4, grow: 1.4 },
  smoke: { color: [0xb9b5ae, 0xa8a49e, 0xcfcac2], size: [0.25, 0.45], speed: [0.1, 0.4], up: [0.6, 1.2], life: [1.6, 2.6], gravity: -0.2, grow: 1.2 },
  steam: { color: [0xf4f2ec, 0xe8ecef], size: [0.4, 0.8], speed: [0.1, 0.5], up: [0.8, 1.5], life: [2, 3], gravity: -0.15, grow: 1.0 },
  poof: { color: [0x8d817a, 0xa59a92, 0xd8cdb6], size: [0.2, 0.35], speed: [1.5, 3], up: [1, 2.5], life: [0.4, 0.7], gravity: 2, grow: 0.8 },
  sparkle: { color: [0xf2c230, 0xffe28a, 0xffffff], size: [0.06, 0.12], speed: [1, 3], up: [2, 4], life: [0.5, 0.9], gravity: 4, grow: 0 },
  milk: { color: [0xffffff, 0xf4f8ff], size: [0.06, 0.1], speed: [1, 2], up: [2, 3], life: [0.4, 0.7], gravity: 8, grow: 0 },
  water: { color: [0x8cc9d8, 0xbfe3ec, 0xffffff], size: [0.1, 0.2], speed: [1, 3], up: [3, 6], life: [0.6, 1], gravity: 12, grow: 0 },
  debris: { color: [0xc7c2b8, 0xa9a49c, 0x86b5cf, 0xe2e7ea], size: [0.3, 0.7], speed: [3, 8], up: [3, 8], life: [1, 1.8], gravity: 16, grow: 0 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export class FX {
  constructor(scene, camera, layer) {
    this.camera = camera;
    this.layer = layer;
    this.cap = 600;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.cap; i++) {
      this.mesh.setMatrixAt(i, HIDE);
      this.mesh.setColorAt(i, tmpC.set(0xffffff));
    }
    overlay(this.mesh);
    scene.add(this.mesh);
    this.parts = [];
    this.free = [];
    for (let i = this.cap - 1; i >= 0; i--) this.free.push(i);
    this.texts = [];
    this.shakeAmt = 0;
    this.shakeTime = 0;
  }

  burst(kind, x, y, z, n = 8, opts = {}) {
    const p = PRESETS[kind];
    if (!p) return;
    for (let k = 0; k < n; k++) {
      const i = this.free.pop();
      if (i === undefined) return;
      const a = Math.random() * Math.PI * 2;
      const sp = rand(...p.speed) * (opts.spread ?? 1);
      const part = {
        i, x: x + (opts.jitter ? (Math.random() - 0.5) * opts.jitter : 0), y, z: z + (opts.jitter ? (Math.random() - 0.5) * opts.jitter : 0),
        vx: Math.cos(a) * sp + (opts.vx || 0), vy: rand(...p.up), vz: Math.sin(a) * sp + (opts.vz || 0),
        life: 0, max: rand(...p.life), size: rand(...p.size) * (opts.scale ?? 1), gravity: p.gravity, grow: p.grow,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 10,
      };
      this.mesh.setColorAt(i, tmpC.set(p.color[Math.floor(Math.random() * p.color.length)]));
      this.parts.push(part);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  shake(amount, time = 0.25) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  // Floating text, e.g. "+$12" or a speech bubble. kind: 'money' | 'dmg' | 'say' | 'warn'
  text(str, x, y, z, kind = 'money', life = 1.2) {
    const el = document.createElement('div');
    el.className = `float-text float-${kind}`;
    el.textContent = str;
    document.getElementById('floaters').appendChild(el);
    this.texts.push({ el, x, y, z, life: 0, max: life, rise: kind === 'say' ? 0.25 : 1.4 });
    if (this.texts.length > 40) {
      const t = this.texts.shift();
      t.el.remove();
    }
  }

  clear() {
    for (const p of this.parts) {
      this.mesh.setMatrixAt(p.i, HIDE);
      this.free.push(p.i);
    }
    this.parts.length = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const t of this.texts) t.el.remove();
    this.texts.length = 0;
  }

  update(dt) {
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life += dt;
      if (p.life >= p.max) {
        this.mesh.setMatrixAt(p.i, HIDE);
        this.free.push(p.i);
        this.parts.splice(k, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05 && p.gravity > 0) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rx += p.spin * dt;
      const t = p.life / p.max;
      const s = p.size * (1 + p.grow * t) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
      tmpE.set(p.rx, p.ry + p.rx * 0.5, 0);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(Math.max(0.0001, s));
      tmpP.set(p.x, p.y, p.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(p.i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    const cam = this.camera;
    const w = innerWidth, h = innerHeight;
    for (let k = this.texts.length - 1; k >= 0; k--) {
      const t = this.texts[k];
      t.life += dt;
      if (t.life >= t.max) {
        t.el.remove();
        this.texts.splice(k, 1);
        continue;
      }
      tmpP.set(t.x, t.y + t.life * t.rise, t.z).project(cam);
      if (tmpP.z > 1 || tmpP.z < -1) {
        t.el.style.display = 'none';
        continue;
      }
      t.el.style.display = '';
      const sx = (tmpP.x * 0.5 + 0.5) * w, sy = (-tmpP.y * 0.5 + 0.5) * h;
      const fade = t.life > t.max * 0.7 ? 1 - (t.life - t.max * 0.7) / (t.max * 0.3) : 1;
      t.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      t.el.style.opacity = fade;
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmt * Math.max(0, this.shakeTime) * 4;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmt = 0;
    }
  }
}
