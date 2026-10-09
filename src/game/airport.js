import * as THREE from 'three';
import { mat, overlay, washGeometry } from '../world/batcher.js';
import { P } from '../world/palette.js';
import { POI } from '../world/map.js';
import { makeControlTower, makeHangar, makePlane } from '../world/props.js';
import { AIRPORT, TOOLS, HAZARD } from './config.js';

// Songshan Airport: demolishable blocks (five terminal sections, tower, two hangars),
// a gate that opens once the milk is handed out, and a plane that takes off every so often.

const TERMINAL = { x: 160, z: -78, w: 70, d: 22, h: 12 };
const TOWER = { x: 232, z: -96 };
const HANGARS = [{ x: 80, z: -96 }, { x: 104, z: -96 }];
// parked nose-in at the back of the terminal, tails towards the runway
const PARKED = [{ x: 145, z: -104 }, { x: 178, z: -104 }];

function terminalSection(w, d, h, i, n) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(P.terminal));
  body.position.y = h / 2;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.45, d + 0.3), mat(P.terminalGlass));
  glass.position.y = h * 0.55;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 6), mat(0xd0d6da));
  roof.position.y = h + 0.4;
  g.add(body, glass, roof);
  if (i === Math.floor(n / 2)) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#2f4a6a';
    ctx.font = '900 54px "PingFang TC", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('臺北松山機場', 256, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshLambertMaterial({ map: tex }));
    sign.position.set(0, h - 1.4, d / 2 + 0.2);
    g.add(sign);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function rubble(x, z, w, d, scale = 1) {
  const g = new THREE.Group();
  const cols = [0xc7c2b8, 0xa9a49c, 0xb8b2a8, 0x86b5cf];
  for (let i = 0; i < Math.round(10 * scale); i++) {
    const s = (0.8 + Math.random() * 1.8) * scale;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(cols[i % cols.length]));
    m.position.set(x + (Math.random() - 0.5) * w, s * 0.4, z + (Math.random() - 0.5) * d);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export class Airport {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.blocks = [];
    this.rubble = new THREE.Group();
    this.scene.add(this.rubble);

    const n = 5, sw = TERMINAL.w / n;
    for (let i = 0; i < n; i++) {
      const x = TERMINAL.x - TERMINAL.w / 2 + sw * (i + 0.5);
      this.addBlock('terminal', terminalSection(sw, TERMINAL.d, TERMINAL.h, i, n), x, TERMINAL.z, sw / 2, TERMINAL.d / 2, TERMINAL.h);
    }
    this.addBlock('tower', makeControlTower(), TOWER.x, TOWER.z, 2.9, 2.9, 38);
    for (const h of HANGARS) this.addBlock('hangar', makeHangar(), h.x, h.z, 9, 15, 9);

    for (const p of PARKED) {
      const m = makePlane();
      m.position.set(p.x, 0, p.z);
      m.rotation.y = -Math.PI / 2;
      this.group.add(m);
      game.grid.insert({ type: 'box', x: p.x, z: p.z - 1, hw: 3, hd: 12, seeThrough: true });
    }

    // the jet that takes off: runs east to west along the runway
    this.jet = makePlane();
    this.jet.visible = false;
    this.scene.add(this.jet);
    this.blastZone = overlay(new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.25, depthWrite: false, fog: false })));
    this.blastZone.visible = false;
    this.scene.add(this.blastZone);

    // gate barrier
    this.gate = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 0.3), mat(0xd8392b));
    bar.position.set(6, 1.1, 0);
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 0.32), mat(0xf4f0e6));
      stripe.position.set(1.5 + i * 3, 1.1, 0);
      this.gate.add(stripe);
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), mat(0x4f4a46));
    post.position.set(0, 0.7, 0);
    this.gate.add(bar, post);
    this.gate.position.set(POI.airportGate.x - 6, 0, -56);
    this.scene.add(this.gate);
    this.gateCollider = { type: 'box', x: POI.airportGate.x, z: -56, hw: 6.2, hd: 0.5 };
    game.grid.insert(this.gateCollider);
  }

  addBlock(kind, mesh, x, z, hw, hd, h) {
    const def = AIRPORT[kind];
    // big airport buildings are painted as watercolour wash; the terminal's name board stays pencil
    mesh.traverse((o) => { if (o.isMesh && !o.material.map) { o.geometry = washGeometry(o.geometry.clone()); } });
    mesh.position.set(x, 0, z);
    this.group.add(mesh);
    const collider = { type: kind === 'tower' ? 'circle' : 'box', x, z, hw, hd, r: hw, airport: true };
    this.game.grid.insert(collider);
    const b = { kind, label: def.label, tier: def.tier, mesh, x, z, hw, hd, h, collider, hp: def.hp, max: def.hp, alive: true, collapse: 0, hit: 0, warnAt: -9 };
    this.blocks.push(b);
    return b;
  }

  reset() {
    this.open = false;
    this.rubble.clear();
    for (const b of this.blocks) {
      Object.assign(b, { hp: b.max, alive: true, collapse: 0, hit: 0 });
      b.mesh.visible = true;
      b.mesh.position.set(b.x, 0, b.z);
      b.mesh.rotation.set(0, 0, 0);
      b.mesh.scale.set(1, 1, 1);
      b.collider.disabled = false;
    }
    this.gate.rotation.set(0, 0, 0);
    this.gateCollider.disabled = false;
    this.gateLift = 0;
    this.jetClock = 8;
    this.jetState = 'idle';
    this.jet.visible = false;
    this.blastZone.visible = false;
  }

  openGate() {
    this.open = true;
  }

  remaining() {
    return this.blocks.filter((b) => b.alive).length;
  }

  nearestStanding(x, z, maxTier = 99) {
    let best = null, bd = 1e9;
    for (const b of this.blocks) {
      if (!b.alive || b.tier > maxTier) continue;
      const d = this.distanceTo(b, x, z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  distanceTo(b, x, z) {
    if (b.kind === 'tower') return Math.max(0, Math.hypot(x - b.x, z - b.z) - b.hw);
    const dx = Math.max(0, Math.abs(x - b.x) - b.hw);
    const dz = Math.max(0, Math.abs(z - b.z) - b.hd);
    return Math.hypot(dx, dz);
  }

  // Player hit. Returns false when the tool is too weak.
  hit(b, dmg, tier) {
    const g = this.game;
    if (!this.open) {
      if (g.time - b.warnAt > 2) {
        b.warnAt = g.time;
        g.toast('機場大門還沒開，先把鮮奶發完');
        g.audio.sfx('denied');
      }
      return false;
    }
    if (tier < b.tier) {
      if (g.time - b.warnAt > 2) {
        b.warnAt = g.time;
        g.toast(`${b.label}太硬了，要「${TOOLS[b.tier].name}」才拆得動`);
        g.audio.sfx('denied');
      }
      return false;
    }
    this.damage(b, dmg);
    return true;
  }

  damage(b, dmg, { worker = false } = {}) {
    if (!b.alive) return;
    const g = this.game;
    b.hp -= dmg;
    b.hit = Math.max(b.hit, worker ? 0.05 : 0.18);
    if (!worker) {
      const px = g.player.pos.x, pz = g.player.pos.z;
      const cx = Math.max(b.x - b.hw, Math.min(px, b.x + b.hw));
      const cz = Math.max(b.z - b.hd, Math.min(pz, b.z + b.hd));
      g.fx.burst('debris', cx, 1.5 + Math.random() * 2, cz, 4);
      g.fx.burst('dust', cx, 1, cz, 2);
    } else if (Math.random() < dmg * 0.6) {
      g.fx.burst('dust', b.x + (Math.random() - 0.5) * b.hw * 2, 0.6, b.z + b.hd, 1);
    }
    if (b.hp <= 0) this.collapse(b);
  }

  collapse(b) {
    const g = this.game;
    b.alive = false;
    b.collapse = 0.0001;
    b.collider.disabled = true;
    g.audio.sfx('collapse');
    g.fx.shake(0.5, 0.8);
    for (let i = 0; i < 6; i++) g.fx.burst('bigdust', b.x + (Math.random() - 0.5) * b.hw * 2, 1 + Math.random() * 3, b.z + (Math.random() - 0.5) * b.hd * 2, 3);
    g.fx.burst('debris', b.x, b.h * 0.4, b.z, 24, { spread: 1.5 });
    this.rubble.add(rubble(b.x, b.z, b.hw * 1.6, b.hd * 1.6, b.kind === 'tower' ? 0.8 : 1.2));
    g.addMoney(AIRPORT[b.kind].reward, b.x, 4, b.z);
    g.onBlockDown(b);
  }

  update(dt) {
    const g = this.game;
    // gate swings up once opened
    if (this.open && this.gateLift < 1) {
      this.gateLift = Math.min(1, this.gateLift + dt * 0.6);
      this.gate.rotation.z = this.gateLift * 1.4;
      if (this.gateLift > 0.5) this.gateCollider.disabled = true;
    }
    for (const b of this.blocks) {
      if (b.alive) {
        b.hit = Math.max(0, b.hit - dt);
        const s = b.hit > 0 ? 0.12 : 0;
        b.mesh.position.x = b.x + (Math.random() - 0.5) * s;
        b.mesh.position.z = b.z + (Math.random() - 0.5) * s;
        // visibly lean and sag as damage accumulates
        const dmg = 1 - b.hp / b.max;
        b.mesh.rotation.z = dmg * 0.04 * (b.kind === 'tower' ? 2 : 1);
        b.mesh.scale.y = 1 - dmg * 0.12;
      } else if (b.collapse > 0 && b.collapse < 1) {
        b.collapse = Math.min(1, b.collapse + dt / 1.6);
        const t = b.collapse;
        b.mesh.position.y = -t * t * b.h;
        b.mesh.rotation.z = t * (b.kind === 'tower' ? 0.9 : 0.15);
        if (t >= 1) b.mesh.visible = false;
      }
    }
    if (this.open) this.updateJet(dt);
  }

  updateJet(dt) {
    const g = this.game;
    const rw = POI.runway;
    this.jetClock -= dt;
    const px = g.player.pos.x, pz = g.player.pos.z;
    const nearAirport = pz < -50;
    if (this.jetState === 'idle' && this.jetClock <= 3) {
      this.jetState = 'warn';
      this.jet.visible = true;
      this.jet.position.set(rw.x1 - 6, 0, rw.z);
      this.jet.rotation.set(0, Math.PI, 0);
      this.jetSpeed = 0;
      if (nearAirport) {
        g.audio.sfx('warning', { volume: 0.7 });
        g.toast('飛機準備起飛！離跑道遠一點');
      }
    }
    if (this.jetState === 'warn' && this.jetClock <= 0) {
      this.jetState = 'roll';
      if (nearAirport) g.audio.sfx('jet');
    }
    if (this.jetState === 'warn' || this.jetState === 'roll') {
      const j = this.jet.position;
      if (this.jetState === 'roll') {
        this.jetSpeed = Math.min(70, this.jetSpeed + dt * 16);
        j.x -= this.jetSpeed * dt;
        if (j.x < 140) {
          j.y += (j.x < 140 ? 1 : 0) * this.jetSpeed * 0.25 * dt;
          this.jet.rotation.z = -Math.min(0.25, (140 - j.x) * 0.004);
        }
        if (j.x < -60 || j.y > 80) {
          this.jetState = 'idle';
          this.jetClock = AIRPORT.jetEvery;
          this.jet.visible = false;
          this.blastZone.visible = false;
          return;
        }
      }
      // blast zone trails behind the engines (east of the jet) while it is low
      const len = 46, wid = 20;
      const bx = j.x + 13 + len / 2;
      this.blastZone.visible = j.y < 6;
      this.blastZone.position.set(bx, 0.1, rw.z);
      this.blastZone.scale.set(len, 1, wid);
      this.blastZone.material.opacity = this.jetState === 'roll' ? 0.32 : 0.15 + Math.sin(g.time * 10) * 0.08;
      if (this.jetState === 'roll' && j.y < 6) {
        const inBlast = px > j.x + 12 && px < j.x + 13 + len && Math.abs(pz - rw.z) < wid / 2;
        const onPlane = Math.abs(px - j.x) < 12 && Math.abs(pz - rw.z) < 12;
        if (inBlast || onPlane) g.jetBlast(dt, onPlane ? Math.sign(pz - rw.z || 1) : 0);
      }
    }
  }
}
