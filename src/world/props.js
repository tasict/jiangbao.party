import * as THREE from 'three';
import { P } from './palette.js';
import { mat } from './batcher.js';

const M4 = () => new THREE.Matrix4();
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

export function prismGeo(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

export function pyramidGeo(w, h) {
  const g = new THREE.ConeGeometry(w / Math.SQRT2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  return g;
}

// ---------- static pieces (baked into the batcher) ----------

// Taiwanese walk-up / office block: window bands, parapet, the odd rooftop water tank.
export function building(b, r, x, z, w, d, h, opts = {}) {
  const wall = opts.color ?? pick(P.walls, r);
  const ry = opts.ry ?? 0;
  const rotM = (lx, ly, lz) => M4().makeRotationY(ry).multiply(M4().makeTranslation(lx, ly, lz)).premultiply(M4().makeTranslation(x, 0, z));
  b.wash(() => {
    b.add(new THREE.BoxGeometry(w, h, d), wall, rotM(0, h / 2, 0));
    b.add(new THREE.BoxGeometry(w + 0.3, 0.6, 0.3), wall, rotM(0, h + 0.3, d / 2));
    b.add(new THREE.BoxGeometry(w + 0.3, 0.6, 0.3), wall, rotM(0, h + 0.3, -d / 2));
    b.add(new THREE.BoxGeometry(0.3, 0.6, d), wall, rotM(w / 2, h + 0.3, 0));
    b.add(new THREE.BoxGeometry(0.3, 0.6, d), wall, rotM(-w / 2, h + 0.3, 0));
  });
  const floors = Math.max(1, Math.floor(h / 3.2));
  const win = opts.window ?? P.window;
  for (let f = 0; f < floors; f++) {
    const y = 1.9 + f * 3.2;
    if (y > h - 0.8) break;
    b.add(new THREE.BoxGeometry(w * 0.86, 1.15, 0.12), win, rotM(0, y, d / 2 + 0.04));
    b.add(new THREE.BoxGeometry(w * 0.86, 1.15, 0.12), win, rotM(0, y, -d / 2 - 0.04));
    b.add(new THREE.BoxGeometry(0.12, 1.15, d * 0.82), win, rotM(w / 2 + 0.04, y, 0));
    b.add(new THREE.BoxGeometry(0.12, 1.15, d * 0.82), win, rotM(-w / 2 - 0.04, y, 0));
    // some of these window bands light up at night
    if (opts.lit) {
      const bands = [[0, y, d / 2 + 0.1, w * 0.84, 0.05], [0, y, -d / 2 - 0.1, w * 0.84, 0.05], [w / 2 + 0.1, y, 0, 0.05, d * 0.8], [-w / 2 - 0.1, y, 0, 0.05, d * 0.8]];
      bands.forEach(([lx, ly, lz, sw, sd], k) => {
        // hashed rather than drawn from r() so the city layout stays the same
        const hsh = Math.sin(x * 12.9898 + z * 78.233 + y * 37.719 + k * 4.13) * 43758.5453;
        if (hsh - Math.floor(hsh) < 0.38) opts.lit.push({ m: rotM(lx, ly, lz), sx: sw, sy: 1.0, sz: sd });
      });
    }
  }
  if (opts.tank ?? r() < 0.55) {
    const tx = (r() - 0.5) * w * 0.5, tz = (r() - 0.5) * d * 0.5;
    b.add(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), P.tank, rotM(tx, h + 2.0, tz));
    for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      b.add(new THREE.BoxGeometry(0.12, 1.2, 0.12), P.grille, rotM(tx + ox, h + 0.6, tz + oz));
    }
  }
  if (opts.shop) {
    // ground-floor shopfront: glass window under a two-tone stripe, like a convenience store
    const [c1, c2] = opts.shop;
    const fz = opts.shopBack ? -d / 2 - 0.08 : d / 2 + 0.08;
    b.add(new THREE.BoxGeometry(w * 0.9, 0.35, 0.18), c1, rotM(0, 3.0, fz));
    b.add(new THREE.BoxGeometry(w * 0.9, 0.2, 0.2), c2, rotM(0, 2.72, fz));
    b.add(new THREE.BoxGeometry(w * 0.8, 2.0, 0.14), P.glass, rotM(0, 1.25, fz));
  }
  if (opts.sign) {
    b.add(new THREE.BoxGeometry(0.25, Math.min(h * 0.6, 6), 1.2), opts.sign, rotM(w / 2 + 0.6, h * 0.55, d * 0.3));
  }
  return { type: 'box', x, z, hw: (ry ? Math.max(w, d) : w) / 2 + 0.2, hd: (ry ? Math.max(w, d) : d) / 2 + 0.2 };
}

export function road(b, x0, z0, x1, z1, width) {
  b.wash(() => roadParts(b, x0, z0, x1, z1, width));
}

function roadParts(b, x0, z0, x1, z1, width) {
  const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = horizontal ? len : width, d = horizontal ? width : len;
  b.box(w + 3, 0.06, d + 3, P.sidewalk, cx, 0.03, cz);
  b.box(w, 0.1, d, P.road, cx, 0.05, cz);
  const dashes = Math.floor(len / 6);
  for (let i = 0; i < dashes; i++) {
    const t = -len / 2 + 3 + i * 6;
    if (horizontal) b.box(2.4, 0.04, 0.25, P.roadLine, cx + t, 0.12, cz);
    else b.box(0.25, 0.04, 2.4, P.roadLine, cx, 0.12, cz + t);
  }
}

// 福德宮: platform, red hall, columns and the swallow-tail ridge.
export function temple(b, x, z, ry = 0) {
  const T = (lx, ly, lz, extra) => {
    const m = M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
    return extra ? m.multiply(extra) : m;
  };
  b.wash(() => {
    b.add(new THREE.BoxGeometry(20, 1.0, 15), P.templeStone, T(0, 0.5, 0));
    b.add(new THREE.BoxGeometry(6, 0.5, 3), P.templeStone, T(0, 0.25, 9));
    b.add(new THREE.BoxGeometry(16, 5.5, 9), P.templeRed, T(0, 3.75, -1.5));
  });
  b.add(new THREE.BoxGeometry(4, 3.5, 0.3), 0x5a2a20, T(0, 2.75, 3.05));
  for (const px of [-7, -3.5, 3.5, 7]) b.add(new THREE.CylinderGeometry(0.35, 0.4, 5.5, 8), P.templeRed, T(px, 3.75, 4.8));
  // eaves and main roof
  b.add(new THREE.BoxGeometry(19, 0.4, 13.5), P.templeRoof, T(0, 6.7, 0));
  b.add(prismGeo(12.5, 3.2, 17).rotateY(Math.PI / 2), P.templeRoof, T(0, 6.9, 0));
  // ridge with upturned swallow tails
  b.add(new THREE.BoxGeometry(14, 0.6, 0.6), P.templeRidge, T(0, 10.2, 0));
  b.add(new THREE.BoxGeometry(3.4, 0.5, 0.5), P.templeRidge, T(-8.0, 10.9, 0, M4().makeRotationZ(-0.55)));
  b.add(new THREE.BoxGeometry(3.4, 0.5, 0.5), P.templeRidge, T(8.0, 10.9, 0, M4().makeRotationZ(0.55)));
  b.add(new THREE.SphereGeometry(0.7, 8, 6), P.gold, T(0, 11.0, 0));
  // incense burner out front
  b.add(new THREE.CylinderGeometry(1.0, 0.8, 1.2, 8), 0x8b6a3a, T(0, 1.6, 6.5));
  b.add(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 8), 0x8b6a3a, T(0, 2.3, 6.5));
  return { type: 'box', x, z: z - 1.5, hw: 10.2, hd: 6.2 };
}

export function banquetTable(b, x, z) {
  b.add(new THREE.CylinderGeometry(1.4, 1.5, 0.9, 12), P.cloth, M4().makeTranslation(x, 0.45, z));
  b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 8), P.white, M4().makeTranslation(x, 1.0, z));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 6), P.stool, M4().makeTranslation(x + Math.cos(a) * 2.0, 0.25, z + Math.sin(a) * 2.0));
  }
  return { type: 'circle', x, z, r: 1.6 };
}

// Market stall with striped awning; used for the buy-back stand and shops.
export function stall(b, x, z, ry = 0, colors = [P.awningA, P.awningB]) {
  const T = (lx, ly, lz, extra) => {
    const m = M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
    return extra ? m.multiply(extra) : m;
  };
  b.add(new THREE.BoxGeometry(6, 1.1, 1.6), P.counter, T(0, 0.55, 0));
  b.add(new THREE.BoxGeometry(6, 2.6, 0.3), P.counter, T(0, 1.3, -2.2));
  for (const px of [-2.9, 2.9]) {
    b.add(new THREE.BoxGeometry(0.18, 3.2, 0.18), P.steel, T(px, 1.6, 0.9));
    b.add(new THREE.BoxGeometry(0.18, 3.2, 0.18), P.steel, T(px, 1.6, -2.1));
  }
  for (let i = 0; i < 6; i++) {
    b.add(new THREE.BoxGeometry(1.0, 0.12, 3.6), colors[i % 2], T(-2.5 + i, 3.35, -0.6, M4().makeRotationX(-0.22)));
  }
  return { type: 'box', x, z: z - 0.6, hw: 3.2, hd: 1.8, ry };
}

export function smokingBooth(b, x, z) {
  b.box(7, 0.2, 5, P.concrete, x, 0.1, z);
  b.box(7, 3, 0.15, P.glass, x, 1.6, z - 2.5);
  b.box(0.15, 3, 5, P.glass, x - 3.5, 1.6, z);
  b.box(0.15, 3, 5, P.glass, x + 3.5, 1.6, z);
  b.box(7.4, 0.25, 5.4, P.steel, x, 3.2, z);
  b.box(0.8, 1.0, 0.8, P.steel, x, 0.6, z - 1.2);
}

export function hotSpring(b, x, z, w, d) {
  b.box(w + 1.2, 0.5, d + 1.2, P.stone, x, 0.25, z);
  b.box(w, 0.08, d, P.water, x, 0.52, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.25, 0), P.stone, M4().makeTranslation(x + Math.cos(a) * (w / 2 + 0.6), 0.6, z + Math.sin(a) * (d / 2 + 0.6)));
  }
}

// A Taipei 101 style landmark, readable from anywhere on the map.
export function landmarkTower(b, x, z) {
  const prev = b.style;
  b.style = 1;
  b.box(26, 6, 26, 0xc9d3cc, x, 3, z);
  b.box(16, 26, 16, 0x9fc0b4, x, 19, z);
  let y = 32;
  for (let i = 0; i < 8; i++) {
    const g = new THREE.CylinderGeometry(10, 7.2, 9, 4, 1);
    g.rotateY(Math.PI / 4);
    b.add(g, i % 2 ? 0x8fb6a8 : 0x9fc0b4, M4().makeTranslation(x, y + 4.5, z));
    y += 9;
  }
  b.add(new THREE.CylinderGeometry(3, 5, 8, 4).rotateY(Math.PI / 4), 0x8fb6a8, M4().makeTranslation(x, y + 4, z));
  b.add(new THREE.CylinderGeometry(0.4, 0.6, 22, 6), P.steel, M4().makeTranslation(x, y + 19, z));
  b.style = prev;
  return { type: 'box', x, z, hw: 13.2, hd: 13.2 };
}

export function sign(text, { w = 6, h = 2, bg = '#f6efe0', fg = '#3a3330', border = '#c63d2c' } = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.fillStyle = fg;
  ctx.font = `900 ${Math.round(c.height * 0.5)}px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), [
    mat(0x8a6a4a), mat(0x8a6a4a), mat(0x8a6a4a), mat(0x8a6a4a),
    new THREE.MeshLambertMaterial({ map: tex }), mat(0x8a6a4a),
  ]);
  const g = new THREE.Group();
  board.position.y = h / 2 + 2.2;
  g.add(board);
  for (const px of [-w / 2 + 0.4, w / 2 - 0.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), mat(0x8a6a4a));
    post.position.set(px, 1.2, 0);
    g.add(post);
  }
  return g;
}

// ---------- dynamic pieces ----------

export function makeRat(kind = 'small') {
  const g = new THREE.Group();
  const s = kind === 'king' ? 3.2 : kind === 'big' ? 1.7 : 1;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), mat(kind === 'small' ? P.rat : P.ratBig));
  body.scale.set(0.85, 0.7, 1.35);
  body.position.y = 0.38;
  g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 7), mat(kind === 'small' ? P.rat : P.ratBig));
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.45, 0.78);
  g.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(P.ratPink));
  nose.position.set(0, 0.45, 1.08);
  g.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10), mat(P.ratPink));
    ear.rotation.x = Math.PI / 2;
    ear.position.set(sx * 0.2, 0.72, 0.6);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(kind === 'big' || kind === 'king' ? 0xd23a2a : P.eye));
    eye.position.set(sx * 0.13, 0.56, 0.9);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 10, Math.PI * 0.9), mat(P.ratPink));
  tail.rotation.set(0, Math.PI / 2, 0);
  tail.position.set(0, 0.35, -0.95);
  g.add(tail);
  if (kind === 'king') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 6, 1, true), mat(P.gold, { side: THREE.DoubleSide }));
    crown.position.set(0, 0.88, 0.45);
    g.add(crown);
  }
  g.scale.setScalar(s);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.body = body;
  g.userData.tail = tail;
  return g;
}

export function makeRatNest() {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), mat(0x9a7a55));
  mound.scale.set(1.2, 0.6, 1.2);
  mound.position.y = 0.6;
  g.add(mound);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.8), mat(0x6e5236));
    stick.position.set(Math.cos(a) * 1.4, 0.7 + (i % 2) * 0.3, Math.sin(a) * 1.4);
    stick.rotation.set(0.3 * (i % 3), a, 0.4);
    g.add(stick);
  }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), mat(0x2a2220));
  hole.position.set(0, 0.75, 1.55);
  hole.rotation.x = -0.4;
  g.add(hole);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeHuman({ shirt = 0x4a7fc0, pants = 0x3d3d48, skin = 0xf0c8a0, hair = 0x2e2622, hat = null } = {}) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.3), mat(pants));
  legs.position.y = 0.43;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), mat(shirt));
  torso.position.y = 1.22;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), mat(skin));
  head.position.y = 1.82;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), mat(hair));
  hairM.position.y = 2.06;
  g.add(hairM);
  if (hat) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10), mat(hat));
    h.position.y = 2.14;
    g.add(h);
  }
  const armGeo = new THREE.BoxGeometry(0.16, 0.66, 0.2);
  const armL = new THREE.Mesh(armGeo, mat(shirt));
  const armR = new THREE.Mesh(armGeo, mat(shirt));
  armL.geometry.translate(0, -0.3, 0);
  armL.position.set(-0.41, 1.55, 0);
  armR.position.set(0.41, 1.55, 0);
  g.add(armL, armR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.parts = { legs, torso, head, armL, armR };
  return g;
}

export function makeReporterCamera() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.42), mat(0x2f2f34));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8), mat(0x1e1e22));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.32;
  g.add(body, lens);
  return g;
}

export function makeSugarcane() {
  const g = new THREE.Group();
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.3, 7), mat(P.cane));
    seg.position.y = i * 0.32 + 0.15;
    seg.rotation.y = i * 0.4;
    g.add(seg);
    const node = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 7), mat(P.caneNode));
    node.position.y = i * 0.32 + 0.31;
    g.add(node);
  }
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.02), mat(P.caneLeaf));
    leaf.geometry.translate(0, 0.45, 0);
    leaf.position.y = segs * 0.32;
    leaf.rotation.set(0.5 + (i % 2) * 0.3, (i / 5) * Math.PI * 2, 0.3);
    g.add(leaf);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeUmbrella() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), mat(P.steel));
  pole.position.y = 1.4;
  g.add(pole);
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.ConeGeometry(2.6, 0.9, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), mat(i % 2 ? P.umbrellaA : P.umbrellaB, { side: THREE.DoubleSide }));
    seg.position.y = 3.1;
    g.add(seg);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.25, 8), mat(P.steel));
  base.position.y = 0.12;
  g.add(base);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Airport pieces are separate meshes because they get torn down during play.
export function makeTerminal(w = 70, d = 22, h = 12) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(P.terminal));
  body.position.y = h / 2;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.45, d + 0.3), mat(P.terminalGlass));
  glass.position.y = h * 0.55;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 0.8, d + 6), mat(0xd0d6da));
  roof.position.y = h + 0.4;
  g.add(body, glass, roof);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function makeControlTower() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 30, 8), mat(P.tower));
  shaft.position.y = 15;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 4.5, 8), mat(P.terminalGlass));
  cab.position.y = 32.2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 1, 8), mat(P.tower));
  cap.position.y = 35;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 5), mat(0xd04a3a));
  mast.position.y = 38.5;
  g.add(shaft, cab, cap, mast);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeHangar(len = 30, r = 9) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, len, 12, 1, false, -Math.PI / 2, Math.PI);
  geo.rotateX(-Math.PI / 2);
  const arch = new THREE.Mesh(geo, mat(P.hangar, { side: THREE.DoubleSide }));
  const back = new THREE.Mesh(new THREE.CircleGeometry(r, 12, 0, Math.PI), mat(0xa9b0b4));
  back.position.z = -len / 2;
  g.add(arch, back);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makePlane() {
  const g = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 22, 10), mat(P.plane));
  fus.rotation.z = Math.PI / 2;
  fus.position.y = 3;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(P.plane));
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(11, 3, 0);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 10), mat(P.plane));
  tailCone.rotation.z = Math.PI / 2;
  tailCone.position.set(-13, 3, 0);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 24), mat(P.plane));
  wing.position.set(0, 2.6, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.3), mat(P.planeTail));
  fin.position.set(-12.5, 5.5, 0);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 8), mat(P.plane));
  stab.position.set(-13, 3.4, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 2.9), mat(P.planeTail));
  stripe.position.set(0, 3.2, 0);
  g.add(fus, nose, tailCone, wing, fin, stab, stripe);
  for (const sz of [-5, 5]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 8), mat(0xc8ccd0));
    eng.rotation.z = Math.PI / 2;
    eng.position.set(1, 1.8, sz);
    g.add(eng);
  }
  const gear = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), mat(0x444444));
  gear.position.set(6, 0.8, 0);
  g.add(gear);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- street furniture and details ----------

export function streetLamp(b, x, z, ry = 0) {
  const T = (lx, ly, lz) => M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
  b.add(new THREE.CylinderGeometry(0.09, 0.13, 5.6, 6), 0x5f6b70, T(0, 2.8, 0));
  b.add(new THREE.BoxGeometry(0.1, 0.1, 1.4), 0x5f6b70, T(0, 5.5, 0.65));
  b.add(new THREE.BoxGeometry(0.5, 0.22, 0.7), 0xf3e3a0, T(0, 5.35, 1.3));
}

const SCOOTER_COLORS = [0xe8e2d4, 0xc63d2c, 0x3b7fc2, 0x2f2f34, 0x8fb6a8, 0xe8b42f, 0xd9c2d6];
export function scooter(b, r, x, z, ry = 0) {
  const col = pick(SCOOTER_COLORS, r);
  const T = (lx, ly, lz, extra) => {
    const m = M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
    return extra ? m.multiply(extra) : m;
  };
  b.add(new THREE.BoxGeometry(0.5, 0.35, 1.3), col, T(0, 0.5, 0));
  b.add(new THREE.BoxGeometry(0.42, 0.18, 0.62), 0x2a2622, T(0, 0.78, -0.2));
  b.add(new THREE.BoxGeometry(0.48, 0.75, 0.16), col, T(0, 0.75, 0.62, M4().makeRotationX(-0.25)));
  b.add(new THREE.BoxGeometry(0.62, 0.06, 0.06), 0x3a3a3a, T(0, 1.18, 0.6));
  for (const wz of [-0.5, 0.58]) b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8).rotateZ(Math.PI / 2), 0x2a2a2a, T(0, 0.22, wz));
}

export function youbikeStation(b, x, z, ry = 0, n = 6) {
  const T = (lx, ly, lz, extra) => {
    const m = M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
    return extra ? m.multiply(extra) : m;
  };
  b.add(new THREE.BoxGeometry(0.5, 1.8, 0.4), 0xe8b42f, T(-n * 0.45 - 0.6, 0.9, 0));
  b.add(new THREE.BoxGeometry(0.4, 0.3, 0.42), 0x2f2f34, T(-n * 0.45 - 0.6, 1.5, 0.05));
  for (let i = 0; i < n; i++) {
    const bx = -n * 0.45 + i * 0.9 + 0.45;
    b.add(new THREE.BoxGeometry(0.12, 0.7, 0.12), 0x7a7a7a, T(bx, 0.35, -0.7));
    b.add(new THREE.BoxGeometry(0.08, 0.08, 1.2), 0xf0a830, T(bx, 0.7, 0));
    b.add(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0xf0a830, T(bx, 0.85, 0.45));
    b.add(new THREE.BoxGeometry(0.4, 0.06, 0.06), 0x333333, T(bx, 1.1, 0.45));
    b.add(new THREE.BoxGeometry(0.16, 0.06, 0.3), 0x333333, T(bx, 0.95, -0.3));
    for (const wz of [-0.5, 0.5]) b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10).rotateZ(Math.PI / 2), 0x333333, T(bx, 0.32, wz));
  }
}

export function bench(b, x, z, ry = 0) {
  const T = (lx, ly, lz) => M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
  b.add(new THREE.BoxGeometry(1.8, 0.08, 0.5), 0xa9774f, T(0, 0.48, 0));
  b.add(new THREE.BoxGeometry(1.8, 0.4, 0.08), 0xa9774f, T(0, 0.8, -0.24));
  for (const lx of [-0.75, 0.75]) b.add(new THREE.BoxGeometry(0.08, 0.48, 0.44), 0x4f4a46, T(lx, 0.24, 0));
}

export function trashCan(b, x, z) {
  b.add(new THREE.CylinderGeometry(0.32, 0.28, 0.9, 8), 0x4c9255, M4().makeTranslation(x, 0.45, z));
  b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8), 0x3a7044, M4().makeTranslation(x, 0.94, z));
}

export function cone(b, x, z) {
  b.add(new THREE.ConeGeometry(0.22, 0.7, 8), 0xf07a2a, M4().makeTranslation(x, 0.35, z));
  b.add(new THREE.BoxGeometry(0.5, 0.05, 0.5), 0xf07a2a, M4().makeTranslation(x, 0.03, z));
}

export function vendingMachine(b, x, z, ry = 0, color = 0xc63d2c) {
  const T = (lx, ly, lz) => M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
  b.add(new THREE.BoxGeometry(1.0, 1.9, 0.8), color, T(0, 0.95, 0));
  b.add(new THREE.BoxGeometry(0.75, 0.9, 0.05), P.glass, T(0, 1.25, 0.41));
}

export function pottedPlant(b, x, z) {
  b.add(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 8), 0xb5643a, M4().makeTranslation(x, 0.25, z));
  b.add(new THREE.IcosahedronGeometry(0.45, 0), 0x5aa04a, M4().makeTranslation(x, 0.85, z));
}

// String of red lanterns between two posts.
export function lanterns(b, x0, z0, x1, z1, n = 8) {
  for (const [px, pz] of [[x0, z0], [x1, z1]]) b.add(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 6), 0x6b4a32, M4().makeTranslation(px, 2.1, pz));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const y = 3.9 - Math.sin(t * Math.PI) * 0.8;
    b.add(new THREE.SphereGeometry(0.28, 8, 6), 0xd8392b, M4().makeTranslation(x, y - 0.3, z).multiply(M4().makeScale(1, 1.25, 1)));
    b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 6), P.gold, M4().makeTranslation(x, y + 0.02, z));
  }
}

export function school(b, x, z) {
  // main teaching block, three floors with a corridor band
  b.box(40, 11, 10, 0xf0e2c4, x, 5.5, z);
  for (let f = 0; f < 3; f++) {
    b.box(40.2, 0.35, 10.2, 0xd38b5d, x, 3.6 + f * 3.6, z);
    b.box(36, 1.3, 0.12, P.window, x, 1.9 + f * 3.6, z + 5.06);
  }
  b.box(41, 0.6, 11, 0xd38b5d, x, 11.3, z);
  b.box(6, 3.2, 0.4, 0xd38b5d, x, 13.2, z + 4.6);
  // running track and field
  b.add(new THREE.CylinderGeometry(19, 19, 0.12, 32).scale(1, 1, 0.65), 0xd06a4f, M4().makeTranslation(x, 0.03, z + 36));
  b.add(new THREE.CylinderGeometry(15.5, 15.5, 0.14, 32).scale(1, 1, 0.6), 0x9cc76a, M4().makeTranslation(x, 0.05, z + 36));
  // flagpole and goal
  b.add(new THREE.CylinderGeometry(0.08, 0.1, 9, 6), P.steel, M4().makeTranslation(x - 18, 4.5, z + 14));
  b.box(1.6, 1.0, 0.05, 0x3b7fc2, x - 17.1, 8.3, z + 14);
  for (const gx of [-3, 3]) b.box(0.12, 2.2, 0.12, P.white, x + gx, 1.1, z + 50);
  b.box(6.2, 0.12, 0.12, P.white, x, 2.2, z + 50);
}

export function milkTruck(b, x, z, ry = 0) {
  const T = (lx, ly, lz) => M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
  b.add(new THREE.BoxGeometry(2.4, 2.6, 4.4), 0xf6f2e8, T(0, 1.8, -0.8));
  b.add(new THREE.BoxGeometry(2.4, 0.5, 4.4), 0x3b7fc2, T(0, 1.2, -0.8));
  b.add(new THREE.BoxGeometry(2.3, 1.9, 1.8), 0x3b7fc2, T(0, 1.45, 2.3));
  b.add(new THREE.BoxGeometry(2.0, 0.8, 0.05), P.glass, T(0, 1.95, 3.21));
  for (const [wx, wz] of [[-1.15, -2.2], [1.15, -2.2], [-1.15, 2.3], [1.15, 2.3]]) {
    b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2), 0x2a2a2a, T(wx, 0.45, wz));
  }
  // crates stacked at the back
  for (let i = 0; i < 3; i++) b.add(new THREE.BoxGeometry(0.9, 0.5, 0.7), i % 2 ? 0x3b7fc2 : 0xe8e2d4, T(-0.6 + i * 0.6, 0.25 + (i === 1 ? 0.5 : 0), -3.6));
}

export function donationBox(b, x, z) {
  b.box(1.1, 1.1, 0.8, 0xc63d2c, x, 0.55, z);
  b.box(0.6, 0.06, 0.12, 0x2a2220, x, 1.12, z);
  b.box(0.14, 2.4, 0.14, 0x6b4a32, x - 0.9, 1.2, z);
}

export function planter(b, x, z, w = 3, d = 1.2, flowers = [0xe25b45, 0xf2c230, 0xd9c2d6]) {
  b.box(w, 0.6, d, 0xb9a98e, x, 0.3, z);
  b.box(w - 0.2, 0.1, d - 0.2, 0x6b5a3a, x, 0.62, z);
  const n = Math.max(2, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    const fx = x - w / 2 + 0.3 + (i * (w - 0.6)) / Math.max(1, n - 1);
    b.add(new THREE.IcosahedronGeometry(0.28, 0), i % 2 ? 0x5aa04a : flowers[i % flowers.length], M4().makeTranslation(fx, 0.85, z + ((i % 3) - 1) * 0.2));
  }
}

export function logPile(b, x, z, ry = 0) {
  const T = (lx, ly, lz) => M4().makeTranslation(x, 0, z).multiply(M4().makeRotationY(ry)).multiply(M4().makeTranslation(lx, ly, lz));
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      b.add(new THREE.CylinderGeometry(0.28, 0.28, 3, 8).rotateZ(Math.PI / 2), k++ % 2 ? 0x9a6a40 : 0xa9774f, T(0, 0.28 + row * 0.5, -0.9 + i * 0.6 + row * 0.3));
    }
  }
}

export function fountain(b, x, z) {
  b.add(new THREE.CylinderGeometry(4, 4.2, 0.7, 20), 0xc9c2b4, M4().makeTranslation(x, 0.35, z));
  b.add(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 20), P.water, M4().makeTranslation(x, 0.68, z));
  b.add(new THREE.CylinderGeometry(0.4, 0.6, 2, 8), 0xc9c2b4, M4().makeTranslation(x, 1.3, z));
  b.add(new THREE.CylinderGeometry(1.4, 1.2, 0.3, 12), 0xc9c2b4, M4().makeTranslation(x, 2.3, z));
  b.add(new THREE.CylinderGeometry(1.2, 1.2, 0.06, 12), P.water, M4().makeTranslation(x, 2.46, z));
}

export function garbagePile(b, r, x, z, n = 7) {
  const cols = [0x2f3a34, 0x3a3a44, 0x4c5a48, 0x8a7a5a, 0x2a2a2a];
  for (let i = 0; i < n; i++) {
    const s = 0.4 + r() * 0.5;
    b.add(new THREE.IcosahedronGeometry(s, 0), cols[i % cols.length], M4().makeTranslation(x + (r() - 0.5) * 3, s * 0.7, z + (r() - 0.5) * 3).multiply(M4().makeScale(1, 0.8, 1)));
  }
  b.box(0.9, 0.7, 0.7, 0x9a7a55, x + 1.6, 0.35, z - 1.2, r() * 2);
}

export function flagPole(b, x, z, color = 0xc63d2c) {
  b.add(new THREE.CylinderGeometry(0.07, 0.09, 7, 6), P.steel, M4().makeTranslation(x, 3.5, z));
  b.box(1.6, 1.0, 0.05, color, x + 0.85, 6.3, z);
}

// 蔣寶: navy suit, white shirt, blue tie, neat side-parted hair, big friendly head,
// hand axe in one hand, the other free to wave. Parts are exposed for the intro animation.
export function makeHero() {
  const suit = 0x2b3a55, trousers = 0x26324a, skin = 0xf0c8a0, hair = 0x1a1614;
  const B = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    return m;
  };
  const g = new THREE.Group();
  // legs pivot at the hip: the whole pair for squats, each leg for walking
  const legs = new THREE.Group();
  legs.position.y = 0.88;
  const leg = (sx) => {
    const l = new THREE.Group();
    l.position.x = sx;
    l.add(B(0.25, 0.84, 0.3, trousers, 0, -0.42, 0));
    l.add(B(0.27, 0.1, 0.4, 0x1e1a18, 0, -0.83, 0.05));
    legs.add(l);
    return l;
  };
  const legL = leg(-0.14), legR = leg(0.14);
  g.add(legs);
  // jacket, shirt, tie
  g.add(B(0.68, 0.78, 0.4, suit, 0, 1.26, 0));
  g.add(B(0.2, 0.5, 0.02, 0xf6f4ee, 0, 1.42, 0.205));
  g.add(B(0.08, 0.42, 0.03, 0x3b7fc2, 0, 1.38, 0.215));
  g.add(B(0.12, 0.07, 0.035, 0x3b7fc2, 0, 1.62, 0.215));
  g.add(B(0.7, 0.06, 0.41, 0x1f2a40, 0, 0.9, 0));
  // arms pivot at the shoulder
  const arm = (side) => {
    const a = new THREE.Group();
    a.add(B(0.17, 0.66, 0.22, suit, 0, -0.33, 0));
    a.add(B(0.15, 0.14, 0.17, skin, 0, -0.72, 0));
    a.position.set(side * 0.43, 1.6, 0);
    return a;
  };
  const armL = arm(-1), armR = arm(1);
  // hand axe in the left hand
  const axe = new THREE.Group();
  axe.add(B(0.05, 0.6, 0.05, 0x9a6a40, 0, -0.1, 0));
  axe.add(B(0.05, 0.12, 0.2, 0xb8c0c6, 0, 0.16, 0.08));
  axe.position.set(0, -0.72, 0.08);
  axe.rotation.x = 0.3;
  armR.add(axe);
  g.add(armL, armR);
  // head (a little oversized, caricature style)
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(B(0.48, 0.5, 0.46, skin, 0, 0.27, 0));
  for (const sx of [-1, 1]) {
    head.add(B(0.06, 0.12, 0.08, skin, sx * 0.26, 0.25, 0));
    head.add(B(0.07, 0.07, 0.02, 0x221c18, sx * 0.11, 0.3, 0.235));
    head.add(B(0.12, 0.03, 0.02, 0x221c18, sx * 0.11, 0.38, 0.235));
    head.add(B(0.07, 0.04, 0.015, 0xeaa3a0, sx * 0.17, 0.2, 0.232));
    head.add(B(0.04, 0.03, 0.02, 0x8a3a30, sx * 0.075, 0.155, 0.235));
  }
  head.add(B(0.12, 0.03, 0.02, 0x8a3a30, 0, 0.135, 0.235));
  // neat side-parted hair with a swept fringe
  head.add(B(0.52, 0.12, 0.5, hair, 0, 0.56, -0.01));
  head.add(B(0.3, 0.07, 0.5, hair, 0.11, 0.64, -0.01));
  head.add(B(0.52, 0.28, 0.08, hair, 0, 0.42, -0.23));
  for (const sx of [-1, 1]) head.add(B(0.05, 0.22, 0.4, hair, sx * 0.26, 0.42, -0.04));
  const fringe = B(0.36, 0.08, 0.06, hair, 0.06, 0.5, 0.23);
  fringe.rotation.z = -0.18;
  head.add(fringe);
  g.add(head);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, armL, armR, legs, legL, legR, axe };
  return g;
}

// 福德宮董事長: grey hair, glasses, maroon temple vest over a white shirt, holding the returned sugarcane.
export function makeChairman() {
  const vest = 0x8a2a2a, shirt = 0xf4f0e6, trousers = 0x3a3330, skin = 0xe8b890, hair = 0xc9c9c9;
  const B = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    return m;
  };
  const g = new THREE.Group();
  const leg = (sx) => {
    const l = new THREE.Group();
    l.position.set(sx, 0.86, 0);
    l.add(B(0.24, 0.82, 0.28, trousers, 0, -0.41, 0));
    l.add(B(0.26, 0.1, 0.38, 0x2a2420, 0, -0.81, 0.05));
    return l;
  };
  const legL = leg(-0.13), legR = leg(0.13);
  g.add(legL, legR);
  g.add(B(0.64, 0.76, 0.38, shirt, 0, 1.24, 0));
  g.add(B(0.66, 0.6, 0.4, vest, 0, 1.3, 0));
  g.add(B(0.06, 0.6, 0.41, 0xe8b42f, -0.12, 1.3, 0.005));
  g.add(B(0.06, 0.6, 0.41, 0xe8b42f, 0.12, 1.3, 0.005));
  const arm = (side) => {
    const a = new THREE.Group();
    a.add(B(0.16, 0.64, 0.2, shirt, 0, -0.32, 0));
    a.add(B(0.14, 0.13, 0.16, skin, 0, -0.7, 0));
    a.position.set(side * 0.41, 1.58, 0);
    return a;
  };
  const armL = arm(-1), armR = arm(1);
  g.add(armL, armR);
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  head.add(B(0.44, 0.46, 0.42, skin, 0, 0.25, 0));
  head.add(B(0.48, 0.1, 0.46, hair, 0, 0.5, -0.01));
  head.add(B(0.48, 0.26, 0.08, hair, 0, 0.38, -0.2));
  for (const sx of [-1, 1]) {
    head.add(B(0.05, 0.2, 0.36, hair, sx * 0.24, 0.36, -0.03));
    head.add(B(0.12, 0.08, 0.02, 0x2a2a2a, sx * 0.1, 0.29, 0.215));
    head.add(B(0.09, 0.05, 0.022, 0xbfdcec, sx * 0.1, 0.29, 0.218));
    head.add(B(0.1, 0.025, 0.02, hair, sx * 0.1, 0.37, 0.215));
  }
  head.add(B(0.08, 0.02, 0.02, 0x2a2a2a, 0, 0.3, 0.215));
  head.add(B(0.14, 0.025, 0.02, 0x7a3a30, 0, 0.13, 0.215));
  g.add(head);
  const cane = makeSugarcane();
  cane.scale.setScalar(0.8);
  cane.position.set(0, -0.75, 0.12);
  cane.rotation.x = 0.15;
  armR.add(cane);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, armL, armR, legL, legR, cane };
  return g;
}
