import * as THREE from 'three';
import { makeHero } from '../world/props.js';
import { POI } from '../world/map.js';
import { TITLE, SUBTITLE } from './config.js';

// Opening cinematic: drone flyover of the basin, down to 蔣寶 waving in the Daan base,
// a round of 大家來深蹲 with the citizens around him, then behind him and into his head.

const DURATION = 12.8;
const H = new THREE.Vector3(POI.spawn.x, 0, POI.spawn.z);
const HEAD = new THREE.Vector3(H.x, 1.95, H.z);
const EYE = new THREE.Vector3(H.x, 1.65, H.z);
const CROWD_LOOK = new THREE.Vector3(H.x, 1.2, H.z + 1.4);

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

function orbit(a, r, h, out = new THREE.Vector3()) {
  return out.set(H.x + Math.sin(a) * r, h, H.z + Math.cos(a) * r);
}

const A_END = orbit(0.42, 7, 4);
const flyPos = new THREE.CatmullRomCurve3([
  new THREE.Vector3(90, 170, 230), new THREE.Vector3(30, 110, 140), new THREE.Vector3(-20, 52, 60), A_END,
]);
const flyLook = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-40, 0, -90), new THREE.Vector3(-40, 0, -45), new THREE.Vector3(-42, 0, -4), HEAD.clone(),
]);

// Citizens who squat along, beside and behind him (he faces north, the camera comes round to his front).
const CROWD = [[-2.4, 1.2], [2.4, 1.2], [-1.2, 2.6], [1.2, 2.6], [-3.8, 2.8], [3.8, 2.8]];
const SQUAT_START = 8.0, SQUAT_REP = 0.6, SQUAT_REPS = 3;

const CAPTIONS = [
  { from: 0.3, to: 4.7, cls: 'cap-title', html: `<div class="it-title">${TITLE}</div><div class="it-sub">— ${SUBTITLE} —</div>` },
  { from: 0.6, to: 4.7, cls: 'cap-line', html: '臺北市．某個秋天的晚上，福德宮晚宴開桌了' },
  { from: 5.3, to: 7.4, cls: 'cap-name', html: '<div class="it-k">主角</div><div class="it-name">蔣寶</div><div class="it-agenda">今日行程：福德宮晚宴 → 發鮮奶 → 松山機場（？）</div>' },
  { from: 7.5, to: 9.9, cls: 'cap-line cap-big', html: '大家來深蹲！' },
  { from: 11.2, to: 12.8, cls: 'cap-line', html: '出發！' },
];

// 0 → 1 → 0 for each squat rep, starting at `start`.
function squatAt(t, start) {
  const u = (t - start) / SQUAT_REP;
  if (u < 0 || u >= SQUAT_REPS) return 0;
  return Math.sin(Math.PI * (u % 1));
}

export class Intro {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.hero = makeHero();
    this.hero.visible = false;
    game.scene.add(this.hero);
    this.active = false;
    this.el = document.createElement('div');
    this.el.className = 'intro';
    this.el.innerHTML = `
      <div class="it-bar it-top"></div>
      <div class="it-bar it-bottom"></div>
      <div class="it-caps"></div>
      <button class="it-skip btn btn--small">略過 ▸▸</button>`;
    this.caps = this.el.querySelector('.it-caps');
    this.el.querySelector('.it-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    document.body.appendChild(this.el);
    this.tmpP = new THREE.Vector3();
    this.tmpT = new THREE.Vector3();
    this.tmpEnd = new THREE.Vector3();
  }

  play(onDone) {
    this.onDone = onDone;
    this.active = true;
    this.t = 0;
    this.fired = new Set();
    this.hero.visible = true;
    this.hero.position.copy(H);
    this.hero.rotation.set(0, Math.PI, 0);
    this.game.viewModel.root.visible = false;

    // borrow a few Daan pedestrians for the squat line-up
    this.crowd = this.game.npcs.peds.filter((p) => p.district === 'daan').slice(0, CROWD.length);
    this.crowd.forEach((p, i) => {
      Object.assign(p, { x: H.x + CROWD[i][0], z: H.z + CROWD[i][1], yaw: Math.PI, moving: 0, squat: 0, visible: true, introHold: true });
    });

    this.caps.innerHTML = CAPTIONS.map((c, i) => `<div class="it-cap ${c.cls}" data-i="${i}">${c.html}</div>`).join('');
    this.capEls = [...this.caps.children];
    this.el.style.display = 'block';
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.update(0);
  }

  skip() {
    if (!this.active || this.t < 0.3) return;
    this.finish();
  }

  releaseCrowd() {
    for (const p of this.crowd || []) {
      p.introHold = false;
      p.squat = 0;
      p.wait = 0;
      p.tx = p.x + (Math.random() - 0.5) * 40;
      p.tz = p.z + 10 + Math.random() * 25;
    }
  }

  finish() {
    this.active = false;
    this.hero.visible = false;
    this.releaseCrowd();
    this.game.viewModel.root.visible = true;
    this.el.classList.remove('on');
    setTimeout(() => { if (!this.active) this.el.style.display = 'none'; }, 400);
    this.game.fx.clear();
    this.onDone?.();
  }

  once(key, t, fn) {
    if (this.t >= t && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    const t = this.t;
    const P = this.tmpP, T = this.tmpT;
    let hideHero = false;

    if (t < 5) {
      const u = ease(span(t, 0, 5));
      flyPos.getPoint(u, P);
      flyLook.getPoint(u, T);
    } else if (t < 7.4) {
      const u = ease(span(t, 5, 7.4));
      orbit(lerp(0.42, Math.PI, u), lerp(7, 3.3, u), lerp(4, 2.15, u), P);
      T.copy(HEAD);
    } else if (t < 9.9) {
      // pull back so everyone squatting fits in frame
      const u = ease(span(t, 7.4, 8.2));
      orbit(Math.PI, lerp(3.3, 8, u), lerp(2.15, 3.0, u), P);
      T.copy(HEAD).lerp(CROWD_LOOK, u);
    } else if (t < 11.4) {
      const u = ease(span(t, 9.9, 11.4));
      orbit(lerp(Math.PI, Math.PI * 2, u), lerp(8, 2.4, u), lerp(3.0, 1.95, u), P);
      T.copy(CROWD_LOOK).lerp(HEAD, u);
    } else {
      const u = ease(span(t, 11.4, DURATION));
      if (g.player.thirdPerson) {
        // settle on the chase camera: behind him, over the right shoulder
        orbit(Math.PI * 2, 2.4, 1.95, P).lerp(this.tmpEnd.set(H.x + 0.55, 1.75 + 0.2, H.z + 4.2), u);
        T.set(H.x + 0.55 * u, lerp(HEAD.y, 1.6, u), lerp(HEAD.z, H.z - 12, u));
      } else {
        orbit(Math.PI * 2, 2.4, 1.95, P).lerp(EYE, u);
        T.set(H.x, lerp(HEAD.y, EYE.y - 0.6, u), lerp(HEAD.z, H.z - 12, u));
        hideHero = u > 0.5;
      }
    }
    this.camera.position.copy(P);
    this.camera.lookAt(T);
    g.engine.followSun(T.x, T.z);

    // 蔣寶 himself: breathing, glancing at the camera, a wave, then three squats
    const hero = this.hero, parts = hero.userData;
    hero.visible = !hideHero;
    const sq = squatAt(t, SQUAT_START);
    hero.position.y = -0.42 * sq;
    parts.legs.rotation.x = -1.2 * sq;
    parts.head.position.y = 1.66 + Math.sin(t * 2.2) * 0.012;
    const dx = P.x - H.x, dz = P.z - H.z;
    const look = t > 5 && t < 11.4 ? Math.max(-0.9, Math.min(0.9, Math.atan2(-dx, -dz))) : 0;
    parts.head.rotation.y += (look - parts.head.rotation.y) * Math.min(1, dt * 4);
    const waving = span(t, 5.6, 6.0) * (1 - span(t, 7.0, 7.4));
    // the free arm is on the camera's side while the shot orbits round to his front
    parts.armL.rotation.set(-1.4 * sq, 0, -waving * (2.6 + Math.sin(t * 11) * 0.35));
    parts.armR.rotation.set(-1.4 * sq + Math.sin(t * 2.2) * 0.04, 0, 0);

    // the citizens squat along, each a beat late
    this.crowd.forEach((p, i) => {
      if (p.introHold) p.squat = squatAt(t, SQUAT_START + 0.05 + i * 0.03);
    });

    this.once('birds', 5.3, () => g.ambient.scare(H.x, H.z, 18));
    this.once('name', 5.3, () => g.audio.sfx('gift', { volume: 0.6 }));
    this.once('say', 5.9, () => g.fx.text('今天也要節節高升！', H.x, 2.75, H.z, 'say', 1.4));
    this.once('squat', 7.4, () => {
      g.fx.text('大家來深蹲！', H.x, 2.75, H.z, 'say', 2.2);
      g.audio.sfx('quest', { volume: 0.5 });
    });
    for (let r = 0; r < SQUAT_REPS; r++) {
      this.once(`rep${r}`, SQUAT_START + r * SQUAT_REP + SQUAT_REP / 2, () => {
        const p = this.crowd[(r * 2 + 1) % this.crowd.length];
        if (p) g.fx.text(['一！', '二！', '三！'][r], p.x, 2.3, p.z, 'say', 0.7);
        g.audio.sfx('step', { volume: 0.7, pitch: 0.8 });
      });
    }
    this.once('disperse', 9.9, () => {
      const p = this.crowd[4];
      if (p) g.fx.text('腿好痠…', p.x, 2.3, p.z, 'say', 1.4);
      this.releaseCrowd();
    });
    this.once('go', 11.2, () => g.audio.sfx('quest', { volume: 0.6 }));

    this.capEls.forEach((el, i) => {
      const c = CAPTIONS[i];
      el.classList.toggle('show', t >= c.from && t < c.to);
    });

    if (t >= DURATION) this.finish();
  }
}
