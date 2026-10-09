import * as THREE from 'three';
import { mat, overlay } from '../world/batcher.js';
import { POI } from '../world/map.js';
import { makeUmbrella } from '../world/props.js';
import { HAZARD, UMBRELLA } from './config.js';

// Smoking booth (locked in, then slowed), hot springs (something pulls you in and your loot
// is 泡湯), and the umbrellas of Wanhua that rats cannot bite under.

export class Hazards {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const sm = POI.smoking;
    this.booth = { x0: sm.x - 3.3, x1: sm.x + 3.3, z0: sm.z - 2.3, z1: sm.z + 2.4 };
    // sliding glass door that closes while you are inside
    this.door = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 0.15), mat(0xa9d3e4));
    this.door.position.set(sm.x + 7, 1.6, sm.z + 2.5);
    scene.add(this.door);
    this.doorCollider = { type: 'box', x: sm.x, z: sm.z + 2.5, hw: 3.6, hd: 0.2, disabled: true, seeThrough: true };
    game.grid.insert(this.doorCollider);

    // hands that reach out of the hot springs
    this.hands = POI.springs.map((s) => {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const hand = new THREE.Group();
        const armM = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), mat(0xe8b890));
        armM.position.y = 0.6;
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.14), mat(0xe8b890));
        palm.position.y = 1.3;
        for (let f = 0; f < 4; f++) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.08), mat(0xe8b890));
          finger.position.set(-0.12 + f * 0.08, 1.55, 0);
          hand.add(finger);
        }
        hand.add(armM, palm);
        const a = (i / 4) * Math.PI * 2;
        hand.position.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2);
        hand.rotation.set(0, -a, 0);
        g.add(hand);
      }
      g.position.set(s.x, -1.6, s.z);
      g.visible = false;
      scene.add(g);
      return g;
    });

    this.umbrellas = POI.umbrellaSpots.map((u) => {
      const m = makeUmbrella();
      m.position.set(u.x, 0, u.z);
      scene.add(m);
      return m;
    });
    this.shade = POI.umbrellaSpots.map((u) => {
      const ring = overlay(new THREE.Mesh(new THREE.RingGeometry(UMBRELLA.radius - 0.15, UMBRELLA.radius, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x3b7fc2, transparent: true, opacity: 0.35, depthWrite: false })));
      ring.position.set(u.x, 0.09, u.z);
      scene.add(ring);
      return ring;
    });
    this.steamClock = 0;
  }

  reset() {
    this.game.umbrellaCount = 2;
    this.refreshUmbrellas();
    this.springCd = 0;
    this.jailT = 0;
    this.doorCollider.disabled = true;
    this.hands.forEach((h) => (h.visible = false));
  }

  refreshUmbrellas() {
    const n = this.game.umbrellaCount;
    this.umbrellas.forEach((u, i) => (u.visible = i < n));
    this.shade.forEach((s, i) => (s.visible = i < n));
  }

  donate() {
    const g = this.game;
    if (g.umbrellaCount >= UMBRELLA.max) return false;
    g.umbrellaCount++;
    this.refreshUmbrellas();
    const u = POI.umbrellaSpots[g.umbrellaCount - 1];
    g.fx.burst('sparkle', u.x, 3, u.z, 16);
    return true;
  }

  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    const sm = POI.smoking;

    // umbrellas
    g.underUmbrella = false;
    for (let i = 0; i < g.umbrellaCount; i++) {
      const u = POI.umbrellaSpots[i];
      if (Math.hypot(p.x - u.x, p.z - u.z) < UMBRELLA.radius) g.underUmbrella = true;
    }

    // smoking booth
    const b = this.booth;
    const inside = p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;
    if (inside && g.status.jail <= 0 && this.jailT <= 0 && g.vulnerable()) {
      g.status.jail = HAZARD.smokeJail;
      this.jailT = HAZARD.smokeJail;
      g.flags.smoked = true;
      g.audio.sfx('jail');
      g.toast(`誤闖吸菸所！被關 ${HAZARD.smokeJail} 秒，出來會變慢`);
      g.unlock('smoke');
      this.doorCollider.disabled = false;
    }
    if (this.jailT > 0) {
      this.jailT -= dt;
      if (Math.random() < dt * 12) g.fx.burst('smoke', sm.x + (Math.random() - 0.5) * 5, 1.2 + Math.random(), sm.z + (Math.random() - 0.5) * 3, 1);
      if (this.jailT <= 0) {
        this.doorCollider.disabled = true;
        g.status.slow = HAZARD.smokeSlow;
        p.x = sm.x;
        p.z = sm.z + 4.5;
        this.jailT = -4; // short grace period so you can walk away
      }
    } else if (this.jailT < 0) {
      this.jailT = Math.min(0, this.jailT + dt);
    }
    const doorTarget = this.doorCollider.disabled ? sm.x + 7 : sm.x;
    this.door.position.x += (doorTarget - this.door.position.x) * Math.min(1, dt * 6);
    if (Math.random() < dt * 1.5) g.fx.burst('smoke', sm.x + (Math.random() - 0.5) * 4, 2.6, sm.z, 1);
    // incense from the temple burner
    const tp = POI.temple;
    if (Math.random() < dt * 3 && Math.hypot(p.x - tp.x, p.z - tp.z) < 90) g.fx.burst('smoke', tp.x + (Math.random() - 0.5) * 0.8, 2.6, tp.z + 6.5, 1, { scale: 0.7 });

    // hot springs
    this.springCd -= dt;
    this.steamClock -= dt;
    POI.springs.forEach((s, i) => {
      if (this.steamClock <= 0 && Math.hypot(p.x - s.x, p.z - s.z) < 120) {
        g.fx.burst('steam', s.x + (Math.random() - 0.5) * s.w, 0.7, s.z + (Math.random() - 0.5) * s.d, 1);
      }
      const near = Math.abs(p.x - s.x) < s.w / 2 + 1.6 && Math.abs(p.z - s.z) < s.d / 2 + 1.6;
      if (near && this.springCd <= 0 && g.status.spring <= 0 && g.vulnerable()) {
        g.status.spring = HAZARD.springHold;
        g.springTarget = { x: s.x, z: s.z, i };
        this.springCd = HAZARD.springCooldown;
        g.flags.soaked = true;
        g.audio.sfx('splash');
        g.fx.burst('water', p.x, 0.6, p.z, 20);
        const lost = g.loseItems(HAZARD.springLoss);
        g.toast(lost > 0 ? `被溫泉裡的手抓進去了！${lost} 個素材泡湯了` : '被溫泉裡的手抓進去了！還好背包是空的');
        g.unlock('soak');
      }
      const h = this.hands[i];
      const active = g.status.spring > 0 && g.springTarget?.i === i;
      h.visible = active || h.position.y > 0.45 - 1.5;
      const ty = active ? 0.4 : -1.6;
      h.position.y += (ty - h.position.y) * Math.min(1, dt * 5);
      if (h.position.y < -1.4 && !active) h.visible = false;
      h.rotation.y += dt * (active ? 2 : 0.5);
    });
    if (this.steamClock <= 0) this.steamClock = 0.25;
  }
}
