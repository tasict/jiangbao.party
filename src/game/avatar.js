import * as THREE from 'three';
import { mat } from '../world/batcher.js';
import { makeHero, makeSugarcane } from '../world/props.js';

// 蔣寶's body for third-person view: walks, faces where he is going (or what he is hitting),
// swings whichever tool he owns, and carries the sugarcane or the milk crate.

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function heldTools(axe) {
  const saw = new THREE.Group();
  saw.add(box(0.07, 0.16, 0.07, 0xc63d2c, 0, -0.06, 0));
  saw.add(box(0.03, 0.62, 0.14, 0xc9d0d4, 0, 0.3, 0.03));
  const chainsaw = new THREE.Group();
  chainsaw.add(box(0.18, 0.16, 0.28, 0xf07a2a, 0, 0, 0));
  chainsaw.add(box(0.04, 0.06, 0.55, 0xb8c0c6, 0, 0, 0.4));
  const digger = new THREE.Group();
  digger.add(box(0.07, 0.07, 1.1, 0xe8b42f, 0, 0, 0.45));
  digger.add(box(0.36, 0.22, 0.08, 0x6b6460, 0, -0.06, 1.0));
  digger.add(box(0.36, 0.05, 0.24, 0x6b6460, 0, -0.17, 1.1));
  for (const t of [saw, chainsaw, digger]) t.position.set(0, -0.72, 0.08);
  return [axe, saw, chainsaw, digger];
}

export class Avatar {
  constructor(game) {
    this.game = game;
    this.hero = makeHero();
    this.hero.visible = false;
    game.scene.add(this.hero);
    const u = this.hero.userData;
    this.tools = heldTools(u.axe);
    this.tools.slice(1).forEach((t) => u.armR.add(t));
    this.cane = makeSugarcane();
    this.cane.scale.setScalar(0.8);
    this.cane.position.set(0, -0.75, 0.12);
    u.armL.add(this.cane);
    this.crate = new THREE.Group();
    this.crate.add(box(0.62, 0.3, 0.42, 0x3b7fc2));
    for (let i = 0; i < 6; i++) this.crate.add(box(0.1, 0.22, 0.1, 0xf8f6ee, -0.2 + (i % 3) * 0.2, 0.22, -0.1 + Math.floor(i / 3) * 0.2));
    this.crate.position.set(0, 1.05, 0.48);
    this.hero.add(this.crate);
    this.yaw = Math.PI;
  }

  update(dt, show) {
    const g = this.game, p = g.player, u = this.hero.userData;
    this.hero.visible = show;
    if (!show) return;
    this.hero.position.set(p.pos.x, 0, p.pos.z);

    // face the target while hitting, otherwise the way he is walking
    let want = null;
    if (g.target && g.viewModel.swingT < 1) want = Math.atan2(g.target.x - p.pos.x, g.target.z - p.pos.z);
    else if (p.moving > 0.2 && (p.vel.x || p.vel.z)) want = Math.atan2(p.vel.x, p.vel.z);
    if (want !== null) {
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.hero.rotation.y = this.yaw;

    const walk = Math.sin(p.bob) * 0.7 * p.moving;
    u.legL.rotation.x = walk;
    u.legR.rotation.x = -walk;
    u.legs.rotation.x = 0;
    this.hero.position.y = Math.abs(Math.sin(p.bob)) * 0.05 * p.moving;

    const holding = g.holding;
    const tier = g.levels.tool;
    this.tools.forEach((t, i) => (t.visible = !holding && i === tier));
    this.cane.visible = holding === 'cane';
    this.crate.visible = holding === 'crate';
    this.crate.children.slice(1).forEach((b, i) => (b.visible = i < g.milk.bottles));

    const s = g.viewModel.swingT;
    const strike = s < 0.35 ? s / 0.35 : 1 - (s - 0.35) / 0.65;
    if (holding === 'crate') {
      u.armL.rotation.set(-1.3, 0, 0);
      u.armR.rotation.set(-1.3, 0, 0);
    } else {
      u.armL.rotation.set(holding === 'cane' ? -0.35 : -walk * 0.8, 0, 0);
      u.armR.rotation.set(holding ? walk * 0.8 : -0.3 - strike * 1.7 + walk * 0.4, 0, 0);
    }
    // knocked down: keel over until respawn
    this.hero.rotation.x = g.status.down > 0 ? -Math.PI / 2 * Math.min(1, (3 - g.status.down) * 3) : 0;
  }
}
