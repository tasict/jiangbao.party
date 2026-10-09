import * as THREE from 'three';
import { makeHero, makeChairman } from '../world/props.js';
import { segmentBlocked } from '../core/physics.js';

// Cutscene when 蔣寶 is caught dumping the sugarcane: the temple chairman walks up,
// hands it back, and reminds him how long it has been since his last visit.

const DURATION = 7.4;
const OPENERS = ['蔣寶，你的甘蔗掉了。', '蔣寶，甘蔗又掉了喔？', '這支甘蔗，跟你很有緣捏。'];
const REPLIES = ['啊…謝謝董事長…', '我、我最近比較忙…', '……'];

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export class CaneScene {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.hero = makeHero();
    this.chair = makeChairman();
    this.hero.visible = this.chair.visible = false;
    game.scene.add(this.hero, this.chair);
    // the cane changes hands halfway through
    this.heroCane = this.chair.userData.cane.clone();
    this.heroCane.position.set(0, -0.75, 0.12);
    this.heroCane.visible = false;
    this.hero.userData.armL.add(this.heroCane);
    this.active = false;

    this.el = document.createElement('div');
    this.el.className = 'intro';
    this.el.innerHTML = `
      <div class="it-bar it-top"></div>
      <div class="it-bar it-bottom"></div>
      <div class="it-caps">
        <div class="it-cap cap-dialog" data-k="d1"></div>
        <div class="it-cap cap-line cap-big cap-sting" data-k="big">……你已經三年沒來了。</div>
        <div class="it-cap cap-dialog" data-k="d2"></div>
      </div>
      <button class="it-skip btn btn--small">略過 ▸▸</button>`;
    this.caps = Object.fromEntries([...this.el.querySelectorAll('[data-k]')].map((e) => [e.dataset.k, e]));
    this.el.querySelector('.it-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    document.body.appendChild(this.el);

    this.fromP = new THREE.Vector3();
    this.fromQ = new THREE.Quaternion();
    // a camera, not a plain Object3D: lookAt aims a camera's -Z at the target
    this.tmpO = new THREE.PerspectiveCamera();
    this.tmpP = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
  }

  // Camera pose looking from `pos` at `look`.
  pose(pos, look) {
    this.tmpO.position.copy(pos);
    this.tmpO.lookAt(look);
    return { p: pos.clone(), q: this.tmpO.quaternion.clone() };
  }

  play(count, onDone) {
    const g = this.game;
    this.onDone = onDone;
    this.active = true;
    this.t = 0;
    this.fired = new Set();
    g.cinematic = true;
    g.hud.hide();
    g.viewModel.root.visible = false;

    const P = g.player.pos.clone();
    const yaw = g.player.yaw;
    const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    // the chairman walks in from whichever side has a clear line to 蔣寶
    const dirs = [F, R, R.clone().negate(), F.clone().negate()];
    let D = F;
    for (const d of dirs) {
      const s = P.clone().addScaledVector(d, 6.5);
      if (!segmentBlocked(g.grid, P.x, P.z, s.x, s.z) && (g.world.free(s.x, s.z, 0.5) || g.world.onRoad(s.x, s.z))) {
        D = d;
        break;
      }
    }
    this.P = P;
    this.D = D;
    this.start = P.clone().addScaledVector(D, 6.5);
    this.stop = P.clone().addScaledVector(D, 1.5);

    this.hero.position.copy(P);
    this.hero.rotation.set(0, Math.atan2(D.x, D.z), 0);
    this.hero.visible = true;
    this.heroCane.visible = false;
    this.chair.position.copy(this.start);
    this.chair.rotation.set(0, Math.atan2(-D.x, -D.z), 0);
    this.chair.userData.cane.visible = true;
    this.chair.visible = true;

    // shots: side two-shot, then over 蔣寶's shoulder onto the chairman
    const mid = P.clone().addScaledVector(D, 0.75).setY(1.55);
    const side = new THREE.Vector3(D.z, 0, -D.x);
    let cam = null;
    for (const [s, dist] of [[side, 4.4], [side.clone().negate(), 4.4], [side, 2.6], [side.clone().negate(), 2.6]]) {
      const c = mid.clone().addScaledVector(s, dist).setY(1.9);
      if (!segmentBlocked(g.grid, mid.x, mid.z, c.x, c.z)) { cam = c; this.side = s; break; }
    }
    if (!cam) { cam = mid.clone().addScaledVector(side, 2.4).setY(1.9); this.side = side; }
    this.twoShot = this.pose(cam, mid);
    const shoulder = P.clone().addScaledVector(D, 0.1).addScaledVector(this.side, 0.75).setY(1.9);
    this.closeUp = this.pose(shoulder, this.stop.clone().setY(1.95));
    this.fromP.copy(this.camera.position);
    this.fromQ.copy(this.camera.quaternion);
    // end where the gameplay camera was, first or third person
    this.endPose = { p: this.fromP.clone(), q: this.fromQ.clone() };

    this.caps.d1.innerHTML = `<b>福德宮董事長</b>${OPENERS[Math.min(count - 1, OPENERS.length - 1)]}`;
    this.caps.d2.innerHTML = `<b>蔣寶</b>${REPLIES[(count - 1) % REPLIES.length]}`;
    Object.values(this.caps).forEach((c) => c.classList.remove('show'));
    this.el.style.display = 'block';
    requestAnimationFrame(() => this.el.classList.add('on'));
  }

  skip() {
    if (!this.active || this.t < 0.3) return;
    this.finish();
  }

  finish() {
    const g = this.game;
    this.active = false;
    this.hero.visible = this.chair.visible = false;
    g.cinematic = false;
    g.viewModel.root.visible = true;
    g.hud.show();
    this.el.classList.remove('on');
    setTimeout(() => { if (!this.active) this.el.style.display = 'none'; }, 400);
    this.onDone?.();
  }

  once(key, t, fn) {
    if (this.t >= t && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }

  blend(a, b, u) {
    this.camera.position.lerpVectors(a.p, b.p, u);
    this.camera.quaternion.slerpQuaternions(a.q, b.q, u);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    const t = this.t;
    const from = { p: this.fromP, q: this.fromQ };

    if (t < 0.7) this.blend(from, this.twoShot, ease(span(t, 0, 0.7)));
    else if (t < 3.8) this.blend(this.twoShot, this.twoShot, 0);
    else if (t < 5.0) this.blend(this.twoShot, this.closeUp, ease(span(t, 3.8, 4.4)));
    else if (t < 6.6) this.blend(this.closeUp, this.twoShot, ease(span(t, 5.0, 5.6)));
    else this.blend(this.twoShot, this.endPose, ease(span(t, 6.6, DURATION)));
    g.engine.followSun(this.P.x, this.P.z);

    // the chairman walks up, stops, and holds the cane out
    const c = this.chair.userData;
    const walk = span(t, 0.2, 2.2);
    this.chair.position.lerpVectors(this.start, this.stop, 1 - (1 - walk) ** 2);
    const stepping = walk > 0 && walk < 1;
    const swing = stepping ? Math.sin(t * 9) * 0.5 : 0;
    c.legL.rotation.x = swing;
    c.legR.rotation.x = -swing;
    this.chair.position.y = stepping ? Math.abs(Math.sin(t * 9)) * 0.04 : 0;
    const offer = span(t, 4.9, 5.3) * (1 - span(t, 6.0, 6.5));
    c.armR.rotation.x = -1.2 * offer;
    c.head.rotation.x = t > 4.0 && t < 6.0 ? 0.12 : 0;

    // 蔣寶 takes it back, sheepishly
    const h = this.hero.userData;
    const took = t >= 5.4;
    c.cane.visible = !took;
    this.heroCane.visible = took;
    h.armL.rotation.x = took ? -0.5 * (1 - span(t, 5.6, 6.4)) : -1.0 * span(t, 5.0, 5.4);
    h.head.rotation.x = t > 5.6 ? 0.15 : 0;
    h.head.position.y = 1.66 + Math.sin(t * 2.2) * 0.01;

    this.once('step', 0.3, () => g.audio.sfx('step', { volume: 0.4 }));
    this.once('d1', 2.3, () => this.caps.d1.classList.add('show'));
    this.once('d1x', 3.8, () => this.caps.d1.classList.remove('show'));
    this.once('big', 4.0, () => {
      this.caps.big.classList.add('show');
      g.audio.sfx('down', { volume: 0.5 });
    });
    this.once('bigx', 6.0, () => this.caps.big.classList.remove('show'));
    this.once('give', 5.4, () => g.audio.sfx('gift', { volume: 0.5 }));
    this.once('d2', 5.6, () => this.caps.d2.classList.add('show'));
    this.once('d2x', 7.0, () => this.caps.d2.classList.remove('show'));

    if (t >= DURATION) this.finish();
  }
}
