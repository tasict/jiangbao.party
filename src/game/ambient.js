import * as THREE from 'three';
import { mergeColored } from '../world/batcher.js';
import { POI } from '../world/map.js';

// Life on the streets: pigeon flocks that scatter when you walk up, and cars and
// yellow taxis looping the avenues (they brake for you, and shove you if you insist).

const M = () => new THREE.Matrix4();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpP = new THREE.Vector3();

function pigeonGeo() {
  return mergeColored([
    { geo: new THREE.IcosahedronGeometry(0.16, 0), color: 0x9aa0a8, matrix: M().makeScale(0.9, 0.8, 1.3) },
    { geo: new THREE.IcosahedronGeometry(0.09, 0), color: 0x6f8a8a, matrix: M().makeTranslation(0, 0.12, 0.17) },
    { geo: new THREE.ConeGeometry(0.03, 0.08, 4).rotateX(Math.PI / 2), color: 0xe8a040, matrix: M().makeTranslation(0, 0.11, 0.28) },
    { geo: new THREE.BoxGeometry(0.42, 0.02, 0.14), color: 0x8a9098, matrix: M().makeTranslation(0, 0.04, -0.02) },
  ]);
}

function carGeo(color, taxi) {
  const parts = [
    { geo: new THREE.BoxGeometry(1.9, 0.8, 4.2), color, matrix: M().makeTranslation(0, 0.75, 0) },
    { geo: new THREE.BoxGeometry(1.7, 0.7, 2.2), color, matrix: M().makeTranslation(0, 1.5, -0.2) },
    { geo: new THREE.BoxGeometry(1.72, 0.5, 2.0), color: 0x86b5cf, matrix: M().makeTranslation(0, 1.52, -0.2) },
    { geo: new THREE.BoxGeometry(0.4, 0.2, 0.05), color: 0xf3e3a0, matrix: M().makeTranslation(-0.6, 0.85, 2.11) },
    { geo: new THREE.BoxGeometry(0.4, 0.2, 0.05), color: 0xf3e3a0, matrix: M().makeTranslation(0.6, 0.85, 2.11) },
    { geo: new THREE.BoxGeometry(0.4, 0.18, 0.05), color: 0xd8392b, matrix: M().makeTranslation(-0.6, 0.85, -2.11) },
    { geo: new THREE.BoxGeometry(0.4, 0.18, 0.05), color: 0xd8392b, matrix: M().makeTranslation(0.6, 0.85, -2.11) },
  ];
  for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10).rotateZ(Math.PI / 2), color: 0x2a2a2a, matrix: M().makeTranslation(wx, 0.38, wz) });
  }
  if (taxi) parts.push({ geo: new THREE.BoxGeometry(0.7, 0.22, 0.3), color: 0xf4f0e6, matrix: M().makeTranslation(0, 1.97, -0.2) });
  return mergeColored(parts);
}

// Closed loops along the avenues (x, z waypoints), driven clockwise.
const LOOPS = [
  [[-127, -157], [47, -157], [47, -53], [-127, -53]],
  [[-133, -163], [-133, -47], [53, -47], [53, -163]],
  [[53, -47], [157, -47], [157, 43], [53, 43]],
];

export class Ambient {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const flocks = [
      { x: -42, z: -6, n: 10 }, { x: POI.banquet.x, z: POI.banquet.z + 26, n: 8 }, { x: -196, z: 30, n: 12 },
      { x: 120, z: 22, n: 8 }, { x: -60, z: -200, n: 6 }, { x: -39, z: 70, n: 9 },
    ];
    this.birds = [];
    for (const f of flocks) {
      for (let i = 0; i < f.n; i++) {
        this.birds.push({ hx: f.x + (Math.random() - 0.5) * 8, hz: f.z + (Math.random() - 0.5) * 8, x: 0, z: 0, y: 0, yaw: Math.random() * 6, state: 'peck', t: Math.random() * 3, vx: 0, vz: 0, vy: 0, flap: 0 });
      }
    }
    this.birdMesh = new THREE.InstancedMesh(pigeonGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.birds.length);
    this.birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.birdMesh.castShadow = true;
    this.birdMesh.frustumCulled = false;
    scene.add(this.birdMesh);

    const palette = [[0xf2c230, true], [0xf2c230, true], [0xe8e2d4, false], [0xc63d2c, false], [0x3b7fc2, false], [0x4f4a46, false], [0xf2c230, true], [0x8fb6a8, false]];
    this.cars = [];
    palette.forEach(([color, taxi], i) => {
      const loop = LOOPS[i % LOOPS.length];
      const mesh = new THREE.Mesh(carGeo(color, taxi), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      mesh.castShadow = true;
      scene.add(mesh);
      const car = { mesh, loop, seg: Math.floor(i / LOOPS.length) * 2, t: Math.random(), speed: 9 + Math.random() * 4, cur: 0, x: 0, z: 0, yaw: 0, honk: 0 };
      this.cars.push(car);
    });
    this.collider = this.cars.map((c) => ({ type: 'circle', x: 0, z: 0, r: 0 }));
  }

  reset() {
    for (const b of this.birds) {
      Object.assign(b, { x: b.hx, z: b.hz, y: 0, state: 'peck', t: Math.random() * 3 });
    }
  }

  // Startle every pigeon near a point into the air.
  scare(x, z, r) {
    for (const b of this.birds) {
      if (b.state !== 'peck' || Math.hypot(b.x - x, b.z - z) > r) continue;
      const a = Math.atan2(b.z - z, b.x - x) + (Math.random() - 0.5) * 1.2;
      b.state = 'fly';
      b.vx = Math.cos(a) * (5 + Math.random() * 3);
      b.vz = Math.sin(a) * (5 + Math.random() * 3);
      b.vy = 4 + Math.random() * 2;
      b.t = 4 + Math.random() * 3;
    }
    this.game.audio.sfx('pickup', { pitch: 1.8, volume: 0.35 });
  }

  update(dt) {
    const g = this.game;
    const px = g.player.pos.x, pz = g.player.pos.z;

    this.birds.forEach((b, i) => {
      const d = Math.hypot(px - b.x, pz - b.z);
      if (b.state === 'peck') {
        b.t -= dt;
        if (b.t <= 0) {
          b.t = 0.5 + Math.random() * 2;
          b.yaw += (Math.random() - 0.5) * 2;
          b.x += Math.sin(b.yaw) * 0.3;
          b.z += Math.cos(b.yaw) * 0.3;
        }
        if (d < 5.5) {
          b.state = 'fly';
          const a = Math.atan2(b.z - pz, b.x - px) + (Math.random() - 0.5) * 1.2;
          b.vx = Math.cos(a) * (5 + Math.random() * 3);
          b.vz = Math.sin(a) * (5 + Math.random() * 3);
          b.vy = 4 + Math.random() * 2;
          b.t = 4 + Math.random() * 3;
          if (i % 4 === 0 && d < 30) g.audio.sfx('pickup', { pitch: 1.8, volume: 0.25 });
        }
      } else if (b.state === 'fly') {
        b.t -= dt;
        b.flap += dt * 30;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y += b.vy * dt;
        b.vy = Math.max(-0.5, b.vy - dt * 1.5);
        b.yaw = Math.atan2(b.vx, b.vz);
        if (b.t <= 0) b.state = 'return';
      } else {
        const dx = b.hx - b.x, dz = b.hz - b.z, dd = Math.hypot(dx, dz);
        b.flap += dt * 24;
        b.x += (dx / (dd || 1)) * Math.min(dd, 7 * dt);
        b.z += (dz / (dd || 1)) * Math.min(dd, 7 * dt);
        b.y += (Math.min(dd * 0.4, 8) - b.y) * Math.min(1, dt * 2);
        b.yaw = Math.atan2(dx, dz);
        if (dd < 0.5 && Math.hypot(px - b.hx, pz - b.hz) > 9) {
          b.state = 'peck';
          b.y = 0;
        }
      }
      const flying = b.state !== 'peck';
      tmpE.set(b.state === 'peck' ? Math.max(0, Math.sin(g.time * 3 + i)) * 0.5 : 0, b.yaw, flying ? Math.sin(b.flap) * 0.25 : 0);
      tmpQ.setFromEuler(tmpE);
      tmpS.set(flying ? 1 + Math.abs(Math.sin(b.flap)) * 0.6 : 1, 1, 1);
      tmpP.set(b.x, b.y + 0.12, b.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.birdMesh.setMatrixAt(i, tmpM);
    });
    this.birdMesh.instanceMatrix.needsUpdate = true;

    for (const c of this.cars) {
      const a = c.loop[c.seg % c.loop.length], b = c.loop[(c.seg + 1) % c.loop.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const x = a[0] + (b[0] - a[0]) * c.t, z = a[1] + (b[1] - a[1]) * c.t;
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      // brake if the player is standing in the lane ahead
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = px - x, rz = pz - z;
      const ahead = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
      const blocked = ahead > 0 && ahead < 9 && side < 2.2;
      const target = blocked ? 0 : c.speed;
      c.cur += (target - c.cur) * Math.min(1, dt * (blocked ? 6 : 1.5));
      if (blocked && c.honk <= 0 && Math.hypot(rx, rz) < 30) {
        c.honk = 3;
        g.audio.sfx('warning', { volume: 0.2, pitch: 2.2 });
      }
      c.honk -= dt;
      c.t += (c.cur * dt) / len;
      if (c.t >= 1) {
        c.t = 0;
        c.seg++;
      }
      // ease the turn at corners
      let ry = yaw;
      if (c.t < 0.06) {
        const pa = c.loop[(c.seg - 1 + c.loop.length) % c.loop.length];
        const prevYaw = Math.atan2(a[0] - pa[0], a[1] - pa[1]);
        let dy = yaw - prevYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        ry = prevYaw + dy * (c.t / 0.06);
      }
      c.x = x; c.z = z;
      c.mesh.position.set(x, 0, z);
      c.mesh.rotation.y = ry;
      // shove the player out of the way
      const dd = Math.hypot(rx, rz);
      if (dd < 2.4 && Math.abs(ahead) < 2.6 && side < 1.4) {
        const push = (2.4 - dd) / (dd || 1);
        g.player.pos.x += rx * push;
        g.player.pos.z += rz * push;
      }
    }
  }
}
