import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { ColliderGrid } from './core/physics.js';
import { buildWorld } from './world/map.js';
import { Glows } from './world/glows.js';
import { Game } from './game/game.js';
import { Intro } from './game/intro.js';
import { POI } from './world/map.js';
import { Achievements } from './game/achievements.js';
import { audio } from './game/audio.js';
import { loadSettings, save } from './game/storage.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { PhotoBooth, flash, sharePhoto, savePhoto } from './ui/photo.js';

const canvas = document.getElementById('view');
const engine = new Engine(canvas);
const input = new Input(canvas, document.getElementById('joystick'));
const world = buildWorld(engine.scene);
const glows = new Glows(engine.scene, world.lights);
engine.onNight = (n) => glows.setNight(n);
glows.setNight(engine.night);
const grid = new ColliderGrid(16);
for (const c of world.colliders) grid.insert(c);
for (const t of world.trees.trees) grid.insert({ type: 'circle', x: t.x, z: t.z, r: t.radius, tree: t });

const settings = loadSettings();
const achievements = new Achievements();

let game;
const hud = new HUD(document.getElementById('ui'), {
  onPause: () => togglePause(),
  onMapToggle: () => {},
  onPhoto: () => takePhoto(),
});
game = new Game({ engine, input, world, grid, hud, achievements, audio });

const screens = new Screens(document.getElementById('screens'), {
  click: () => audio.sfx('click', { volume: 0.5 }),
  start: (diff, name) => startRun(diff, name),
  resume: () => resume(),
  quit: () => goHome(),
  home: () => goHome(),
  getSettings: () => settings,
  setSetting: (k, v) => {
    settings[k] = v;
    save('settings', settings);
    applySettings();
  },
});

function applySettings() {
  audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  game.player.sensitivity = 0.0024 * settings.sensitivity;
  game.player.thirdPerson = settings.view === 'third';
  const low = settings.quality === 'low';
  engine.setQuality(low ? 'low' : 'high');
}
applySettings();

const isTouch = () => input.isTouch;

function lockPointer() {
  // re-locking right after an unlock can be refused; a click on the canvas locks it again
  if (!isTouch()) canvas.requestPointerLock?.()?.catch?.(() => {});
}

const intro = new Intro(game);

function startRun(diff, name) {
  audio.unlock();
  screens.clear();
  game.newRun(diff, name);
  lockPointer();
  game.cinematic = true;
  hud.hide();
  input.enabled = false;
  intro.play(beginPlay);
}

// After the intro: hand the camera to the player and start the clock.
function beginPlay() {
  game.cinematic = false;
  game.time = 0;
  game.player.spawn(POI.spawn.x, POI.spawn.z, 0);
  hud.show();
  input.enabled = true;
  input.keys.clear();
  input.consumeLook();
  if (!isTouch()) hud.toast(document.pointerLockElement ? 'Esc 暫停，1–4 選商店選項' : '點一下畫面鎖定滑鼠，Esc 暫停');
}

// any key, click or tap skips the intro
addEventListener('keydown', () => { intro.skip(); game.caneScene.skip(); });
addEventListener('pointerdown', () => { intro.skip(); game.caneScene.skip(); });

function togglePause() {
  if (!game.running || game.finished) return;
  if (game.paused) resume();
  else pause();
}

function pause() {
  if (!game.running || game.finished || game.paused || game.cinematic) return;
  game.paused = true;
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  screens.pause();
}

function resume() {
  game.paused = false;
  input.enabled = true;
  input.keys.clear();
  screens.clear();
  lockPointer();
}

// Snap the next rendered frame, then pause on a preview with share / save.
const photo = new PhotoBooth(canvas);
let photoUrl = null;
function takePhoto() {
  if (!game.running || game.paused || game.finished || game.cinematic || photo.pending) return;
  audio.sfx('shutter');
  flash();
  photo.request((blob) => {
    if (!blob || !game.running || game.finished) return;
    game.paused = true;
    input.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.toggleMap(false);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    const mobile = isTouch();
    screens.photo(photoUrl, {
      mobile,
      share: () => sharePhoto(blob, { mobile }),
      save: () => savePhoto(blob),
      close: () => resume(),
    });
  });
}

function goHome() {
  game.quit();
  engine.setNight(0);
  hud.hide();
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.setMusic('title');
  screens.title();
}

// Losing pointer lock (Esc) mid-run means the player wants out: pause.
input.onLockChange = (locked) => {
  if (!locked && (intro.active || game.caneScene.active)) {
    intro.skip();
    game.caneScene.skip();
    return;
  }
  if (!locked && game.running && !game.paused && !game.finished && !hud.bigOpen) pause();
};

game.hud.result = (g, rank, entry) => {
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.hide();
  screens.result(g, rank, entry, achievements.session);
};

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (game.cinematic) return;
  if (k === 'm' && game.running && !game.paused) hud.toggleMap();
  if (k === 'c' && game.running && !game.paused) takePhoto();
  if (k === 'v' && game.running && !game.paused) {
    settings.view = settings.view === 'third' ? 'first' : 'third';
    save('settings', settings);
    applySettings();
    hud.toast(settings.view === 'third' ? '第三人稱視角' : '第一人稱視角');
  }
  if ((k === 'p' || k === 'escape') && game.running && !game.finished) {
    if (game.paused && k === 'escape') resume();
    else if (k === 'p') togglePause();
  }
});
addEventListener('pointerdown', () => audio.unlock(), { once: true });
addEventListener('keydown', () => audio.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// ---- attract mode camera for the title screen: a slow drift over the city
function attract(t) {
  const cam = engine.camera;
  const a = t * 0.04;
  cam.position.set(-30 + Math.cos(a) * 70, 26, -60 + Math.sin(a) * 70);
  cam.lookAt(-30, 4, -60);
  engine.followSun(-30, -60);
}

// debug camera for screenshots: ?cam=x,z,yaw,pitch
const params = new URLSearchParams(location.search);
const camParam = params.get('cam');
if (camParam) {
  const [x, z, yaw, pitch] = camParam.split(',').map(Number);
  game.newRun('normal', 'debug');
  game.player.spawn(x, z, yaw);
  game.player.pitch = pitch || 0;
  hud.show();
  input.enabled = true;
} else {
  game.newRun('normal', '');
  game.quit();
  engine.setNight(0);
  audio.setMusic('title');
  screens.title();
}

let last = performance.now();
let clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  requestAnimationFrame(frame);
  try {
    if (game.running) {
      game.update(dt);
      if (intro.active) intro.update(dt);
      else if (game.caneScene.active) game.caneScene.update(dt);
      else if (!game.paused) hud.update(game, dt);
    } else {
      attract(clock);
      game.ambient.update(dt);
      game.npcs.update(dt);
      game.rats.update(dt);
    }
  } catch (err) {
    // keep the loop alive; one bad frame should not freeze the game
    console.error(err);
  }
  engine.render(dt);
  photo.afterRender();
  input.endFrame();
}
requestAnimationFrame(frame);
window.__game = game;
