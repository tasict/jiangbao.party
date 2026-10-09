import * as THREE from 'three';
import { StaticBatcher } from './batcher.js';
import { P, DISTRICT_TINT } from './palette.js';
import {
  building, road, temple, banquetTable, stall, smokingBooth, hotSpring, landmarkTower, sign,
  streetLamp, scooter, youbikeStation, bench, trashCan, cone, vendingMachine, pottedPlant,
  lanterns, school, milkTruck, donationBox, planter, logPile, fountain, garbagePile, flagPole,
} from './props.js';
import { mergeColored } from './batcher.js';
import { TreeField } from './trees.js';

// x = east, z = south (north is -z). Units are metres.
// Laid out like the real city: 北投 up north, 中山 and 松山 across the middle, and
// 萬華, 大安, 信義 along the south. The north-east corner is the Keelung River and the
// Neihu hills, which can't be entered.
export const DISTRICTS = {
  daan: { name: '大安', rect: [-130, -50, 50, 150], tier: 1 },
  zhongshan: { name: '中山', rect: [-270, -160, 50, -50], tier: 1 },
  xinyi: { name: '信義', rect: [50, -50, 270, 150], tier: 2 },
  beitou: { name: '北投', rect: [-270, -270, 50, -160], tier: 3 },
  wanhua: { name: '萬華', rect: [-270, -50, -130, 150], tier: 4 },
  songshan: { name: '松山', rect: [50, -160, 270, -50], tier: 5 },
};
export const WORLD = { x0: -270, z0: -270, x1: 270, z1: 150 };

// Buy-back stalls: the main one at the Daan base, plus one each in 北投, 萬華 and 信義 so a
// full bag can be sold near where it filled up.
const SELLS = [
  { x: -72, z: -14, label: '收購攤' },
  { x: -36, z: -194, label: '收購攤' },
  { x: -158, z: 4, label: '收購攤' },
  { x: 96, z: 34, label: '收購攤' },
];

export const POI = {
  spawn: { x: -42, z: 4 },
  sell: SELLS[0],
  sells: SELLS,
  recruit: { x: -14, z: -14, label: '招聘站' },
  altar: { x: -42, z: -30, label: '神明桌' },
  shop: { x: 118, z: 4, label: '商店' },
  toolShop: { x: -60, z: -214, label: '工具場' },
  milk: { x: 8, z: -70, label: '鮮奶車' },
  donation: { x: -193, z: -30, label: '遮陽傘捐款箱' },
  temple: { x: -40, z: -122, label: '福德宮' },
  banquet: { x: -40, z: -96 },
  keeper: { x: -40, z: -104 },
  school: { x: 25, z: -142 },
  playground: { x0: 9, z0: -124, x1: 43, z1: -88 },
  smoking: { x: 160, z: 70, label: '吸菸所' },
  springs: [{ x: -150, z: -228, w: 22, d: 16 }, { x: -112, z: -196, w: 16, d: 12 }],
  umbrellaSpots: [
    { x: -205, z: -12 }, { x: -186, z: 6 }, { x: -214, z: 16 }, { x: -178, z: -16 },
    { x: -196, z: 24 }, { x: -222, z: -4 }, { x: -168, z: 12 }, { x: -200, z: -26 },
  ],
  granny: { x: -168, z: 92 },
  nests: [
    { x: -256, z: 8 }, { x: -146, z: 62 }, { x: -244, z: 62 }, { x: -150, z: 128 },
    { x: -206, z: 118 }, { x: -70, z: -252 }, { x: -200, z: -200 }, { x: 236, z: 122 },
  ],
  ratKing: { x: -248, z: 132 },
  airportGate: { x: 160, z: -52 },
  runway: { x0: 62, x1: 266, z: -139, w: 30 },
};

// Areas where the block generator must not place buildings.
const RESERVED = [
  [-118, -46, 40, 26], // daan base plaza
  [-118, 30, 40, 146], // daan forest park
  [-80, -146, 0, -66], // temple + banquet
  [2, -152, 46, -62], // school
  [86, -34, 156, 40], // xinyi shop plaza
  [140, 50, 180, 90], // smoking booth
  [176, 32, 228, 88], // landmark tower
  [-96, -248, -24, -184], // tool shop plaza
  [-176, -248, -92, -180], // hot springs
  [-236, -44, -150, 40], // wanhua umbrella plaza
  [-190, 76, -146, 108], // granny alley
  [-268, 108, -224, 148], // rat king corner
  [54, -268, 268, -54], // airport
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// City blocks fill the areas between the main avenues. These are fixed rather than taken
// from the district rects, so the seeded street plan stays put when a border moves.
const BLOCK_AREAS = [
  [-130, -50, 50, 150], [-130, -160, 50, -50], [50, -50, 270, 150], [-270, -270, 50, -160], [-270, -160, -130, 150],
];

const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

export function districtAt(x, z) {
  for (const [key, d] of Object.entries(DISTRICTS)) {
    const [x0, z0, x1, z1] = d.rect;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return key;
  }
  return 'daan';
}

const SHOP_STRIPES = [[0x4c9255, 0xf07a2a], [0x3b7fc2, 0xf4f0e6], [0xc63d2c, 0xe8b42f], [0x8a5a9a, 0xf4f0e6]];

export function buildWorld(scene) {
  const r = rng(20261008);
  const b = new StaticBatcher();
  const colliders = [];
  const roads = [];
  const solid = (c) => (colliders.push(c), c);
  // light sources that glow at night: lamp heads, lanterns, and lit window bands
  const lights = { lamps: [], lanterns: [], windows: [] };
  const lanternPoints = (x0, z0, x1, z1, n) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      lights.lanterns.push({ x: x0 + (x1 - x0) * t, y: 3.9 - Math.sin(t * Math.PI) * 0.8 - 0.3, z: z0 + (z1 - z0) * t });
    }
  };

  // ground per district, plus a paper margin so the horizon fades out instead of ending in a cliff
  b.wash(() => {
    for (const [key, d] of Object.entries(DISTRICTS)) {
      const [x0, z0, x1, z1] = d.rect;
      b.box(x1 - x0, 0.1, z1 - z0, DISTRICT_TINT[key], (x0 + x1) / 2, -0.05, (z0 + z1) / 2);
    }
    b.box(1400, 0.1, 1400, 0xd6dcc4, 0, -0.2, 0);
  });

  const avenues = [
    [WORLD.x0, -50, WORLD.x1, -50, 12],
    [WORLD.x0, -160, 50, -160, 12],
    [-130, WORLD.z0, -130, WORLD.z1, 12],
    [50, WORLD.z0, 50, WORLD.z1, 12],
    [-270, 46, -130, 46, 9],
    [50, 46, 270, 46, 9],
    [-40, -160, -40, -146, 9],
    [160, -50, 160, 150, 9],
    [-270, -220, -130, -220, 9],
  ];
  for (const [x0, z0, x1, z1, w] of avenues) {
    road(b, x0, z0, x1, z1, w);
    roads.push([Math.min(x0, x1) - w / 2 - 2, Math.min(z0, z1) - w / 2 - 2, Math.max(x0, x1) + w / 2 + 2, Math.max(z0, z1) + w / 2 + 2]);
  }
  const onRoad = (x, z, pad = 0) => roads.some((q) => x > q[0] - pad && x < q[2] + pad && z > q[1] - pad && z < q[3] + pad);

  // street lamps down both sides of every avenue, skipping intersections
  for (const [x0, z0, x1, z1, w] of avenues) {
    const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    for (let t = 8; t < len - 4; t += 26) {
      for (const side of [-1, 1]) {
        const off = side * (w / 2 + 1.0);
        const x = horizontal ? Math.min(x0, x1) + t : x0 + off;
        const z = horizontal ? z0 + off : Math.min(z0, z1) + t;
        const crossing = roads.some((q) => {
          const vertical = q[3] - q[1] > q[2] - q[0];
          return horizontal ? vertical && x > q[0] - 1 && x < q[2] + 1 : !vertical && z > q[1] - 1 && z < q[3] + 1;
        });
        if (crossing) continue;
        const ry = horizontal ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2);
        streetLamp(b, x, z, ry);
        lights.lamps.push({ x: x + Math.sin(ry) * 1.3, y: 5.3, z: z + Math.cos(ry) * 1.3 });
        solid({ type: 'circle', x, z, r: 0.2, seeThrough: true });
      }
    }
  }

  // daan base plaza paving and the forest park
  b.wash(() => {
    b.box(156, 0.1, 70, 0xdcdad3, -39, 0.0, -8);
    b.box(156, 0.12, 114, P.grass, -39, 0.02, 88);
    b.box(150, 0.14, 4, P.parkPath, -39, 0.04, 88);
    b.box(4, 0.14, 108, P.parkPath, -39, 0.04, 88);
    b.add(new THREE.CylinderGeometry(9, 9, 0.16, 24), P.water, new THREE.Matrix4().makeTranslation(-39, 0.05, 88));
  });
  solid({ type: 'circle', x: -39, z: 88, r: 8.5, seeThrough: true });
  for (let i = 0; i < 10; i++) {
    const bx = -110 + i * 15;
    if (Math.abs(bx + 39) < 6) continue;
    bench(b, bx, 85, 0);
    trashCan(b, bx + 2, 85.5);
  }
  for (let i = 0; i < 6; i++) bench(b, -36, 40 + i * 17, -Math.PI / 2);

  // ---- city blocks
  const blockSize = 28;
  for (const [x0, z0, x1, z1] of BLOCK_AREAS) {
    for (let bx = x0 + 10; bx + blockSize <= x1 - 6; bx += blockSize + 8) {
      for (let bz = z0 + 10; bz + blockSize <= z1 - 6; bz += blockSize + 8) {
        const cell = [bx, bz, bx + blockSize, bz + blockSize];
        if (RESERVED.some((q) => overlaps(cell, q)) || roads.some((q) => overlaps(cell, q))) continue;
        const key = districtAt(bx + blockSize / 2, bz + blockSize / 2);
        const tall = key === 'xinyi' ? 2.4 : key === 'zhongshan' ? 1.3 : key === 'wanhua' ? 0.75 : key === 'beitou' ? 0.7 : 1.0;
        const dense = key === 'zhongshan' || key === 'wanhua' || key === 'xinyi';
        if (r() < 0.12) continue; // the odd empty lot keeps the grid from feeling stamped
        const split = r();
        const lots = split < 0.25 ? [[0, 0, 1, 1]]
          : split < 0.55 ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]]
            : [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
        for (const [u0, v0, u1, v1] of lots) {
          const lw = (u1 - u0) * blockSize - 3;
          const ld = (v1 - v0) * blockSize - 3;
          const cx = bx + ((u0 + u1) / 2) * blockSize;
          const cz = bz + ((v0 + v1) / 2) * blockSize;
          const h = (6 + r() * 14) * tall;
          const front = v1 === 1 ? 1 : -1;
          const shop = r() < (dense ? 0.4 : 0.2) ? SHOP_STRIPES[Math.floor(r() * SHOP_STRIPES.length)] : null;
          solid(building(b, r, cx, cz, lw, ld, h, {
            shop, shopBack: front < 0, lit: lights.windows,
            sign: r() < 0.25 ? [0xd94a3a, 0x3b7fc2, 0xe8b42f, 0x4c9255][Math.floor(r() * 4)] : null,
          }));
          // a row of parked scooters on the pavement in front
          if (r() < (dense ? 0.55 : 0.25)) {
            const n = 3 + Math.floor(r() * 5);
            const sz = cz + front * (ld / 2 + 1.4);
            for (let i = 0; i < n; i++) {
              const sx = cx - (n - 1) * 0.45 + i * 0.9;
              scooter(b, r, sx, sz, (front > 0 ? 0 : Math.PI) + (r() - 0.5) * 0.2);
            }
            solid({ type: 'box', x: cx, z: sz, hw: n * 0.45 + 0.1, hd: 0.7, seeThrough: true });
          }
        }
      }
    }
  }

  // ---- landmarks
  solid(landmarkTower(b, 202, 60));
  solid(temple(b, POI.temple.x, POI.temple.z));
  for (let i = 0; i < 6; i++) {
    const tx = POI.banquet.x - 15 + (i % 3) * 15;
    const tz = POI.banquet.z + Math.floor(i / 3) * 9;
    solid({ ...banquetTable(b, tx, tz), seeThrough: true });
  }
  lanterns(b, POI.banquet.x - 22, POI.banquet.z - 4, POI.banquet.x + 22, POI.banquet.z - 4, 12);
  lanterns(b, POI.banquet.x - 22, POI.banquet.z + 14, POI.banquet.x + 22, POI.banquet.z + 14, 12);
  lanternPoints(POI.banquet.x - 22, POI.banquet.z - 4, POI.banquet.x + 22, POI.banquet.z - 4, 12);
  lanternPoints(POI.banquet.x - 22, POI.banquet.z + 14, POI.banquet.x + 22, POI.banquet.z + 14, 12);
  for (const px of [-8, 8]) pottedPlant(b, POI.temple.x + px, POI.temple.z + 9);

  b.wash(() => school(b, POI.school.x, POI.school.z));
  solid({ type: 'box', x: POI.school.x, z: POI.school.z, hw: 20.3, hd: 5.4 });
  milkTruck(b, POI.milk.x - 6, POI.milk.z - 4, Math.PI / 2);
  solid({ type: 'box', x: POI.milk.x - 6, z: POI.milk.z - 4, hw: 3.6, hd: 1.4 });

  // ---- stations: stall + gold circle + sign board
  const stalls = [
    ...POI.sells.map((p) => ['sell', p, [P.awningA, P.awningB]]),
    ['recruit', POI.recruit, [0x3b7fc2, P.awningB]],
    ['shop', POI.shop, [0x4c9255, P.awningB]],
    ['toolShop', POI.toolShop, [0x8a5a3b, 0xe8b42f]],
  ];
  for (const [key, p, cols] of stalls) {
    const c = stall(b, p.x, p.z - 4, 0, cols);
    solid({ type: 'box', x: c.x, z: c.z, hw: c.hw, hd: c.hd });
    vendingMachine(b, p.x + 4.6, p.z - 5.2, 0, [0xc63d2c, 0x3b7fc2, 0x4c9255][key.length % 3]);
    solid({ type: 'box', x: p.x + 4.6, z: p.z - 5.2, hw: 0.6, hd: 0.5 });
    trashCan(b, p.x - 4.4, p.z - 3);
  }
  b.box(3.2, 1.0, 1.4, P.templeRed, POI.altar.x, 0.5, POI.altar.z - 1.6);
  b.box(0.6, 0.9, 0.6, P.gold, POI.altar.x, 1.45, POI.altar.z - 1.8);
  b.add(new THREE.CylinderGeometry(0.25, 0.2, 0.3, 8), 0x8b6a3a, new THREE.Matrix4().makeTranslation(POI.altar.x + 1.0, 1.15, POI.altar.z - 1.5));
  solid({ type: 'box', x: POI.altar.x, z: POI.altar.z - 1.6, hw: 1.8, hd: 0.9 });
  donationBox(b, POI.donation.x, POI.donation.z - 1.6);
  solid({ type: 'box', x: POI.donation.x, z: POI.donation.z - 1.6, hw: 0.7, hd: 0.5 });
  const stations = [...POI.sells.map((p) => ['sell', p]), ...['recruit', 'altar', 'shop', 'toolShop', 'milk', 'donation'].map((k) => [k, POI[k]])];
  for (const [key, p] of stations) {
    b.add(new THREE.CylinderGeometry(2.4, 2.4, 0.06, 28), 0xf2d27a, new THREE.Matrix4().makeTranslation(p.x, 0.15, p.z));
    const s = sign(p.label, { w: Math.max(4.4, p.label.length * 1.3), h: 1.5 });
    const back = key === 'altar' || key === 'donation' ? 3.6 : 7.4;
    s.position.set(p.x, 0, p.z - back);
    if (key === 'milk') s.position.set(p.x + 3.5, 0, p.z - 1);
    scene.add(s);
  }

  // youbike stations and cones as street dressing
  for (const [x, z, ry] of [[-100, -40, 0], [100, 22, 0], [-14, -58, 0], [-146, -58, Math.PI / 2], [-34, -172, 0], [150, 30, Math.PI / 2]]) {
    youbikeStation(b, x, z, ry, 6);
    solid({ type: 'box', x, z, hw: ry ? 1 : 3.6, hd: ry ? 3.6 : 1, seeThrough: true });
  }
  for (let i = 0; i < 8; i++) cone(b, POI.airportGate.x - 9 + i * 2.6, -46.5);

  smokingBooth(b, POI.smoking.x, POI.smoking.z);
  solid({ type: 'box', x: POI.smoking.x, z: POI.smoking.z - 2.5, hw: 3.6, hd: 0.2, seeThrough: true });
  solid({ type: 'box', x: POI.smoking.x - 3.5, z: POI.smoking.z, hw: 0.2, hd: 2.6, seeThrough: true });
  solid({ type: 'box', x: POI.smoking.x + 3.5, z: POI.smoking.z, hw: 0.2, hd: 2.6, seeThrough: true });
  for (const s of POI.springs) hotSpring(b, s.x, s.z, s.w, s.d);

  // ---- airport ground: apron, grass, runway, perimeter fence
  const rw = POI.runway;
  b.wash(() => {
    b.box(214, 0.12, 102, 0xbfcf9a, 161, 0.0, -107);
    b.box(180, 0.14, 60, P.concrete, 160, 0.02, -90);
    b.box(rw.x1 - rw.x0, 0.16, rw.w, P.runway, (rw.x0 + rw.x1) / 2, 0.04, rw.z);
    b.box(16, 0.15, 30, P.runway, 214, 0.03, -110);
  });
  for (let x = rw.x0 + 10; x < rw.x1 - 10; x += 12) b.box(6, 0.04, 0.6, P.white, x, 0.14, rw.z);
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    b.box(10, 0.04, 1.2, P.white, rw.x0 + 8, 0.14, rw.z + i * 2.4);
    b.box(10, 0.04, 1.2, P.white, rw.x1 - 8, 0.14, rw.z + i * 2.4);
  }
  for (let x = rw.x0; x <= rw.x1; x += 10) {
    for (const side of [-1, 1]) b.box(0.3, 0.3, 0.3, 0xf3e3a0, x, 0.2, rw.z + side * (rw.w / 2 + 0.6));
  }
  b.add(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), P.steel, new THREE.Matrix4().makeTranslation(258, 3, -118));
  b.add(new THREE.ConeGeometry(0.45, 2.4, 8, 1, true).rotateZ(Math.PI / 2), 0xf07a2a, new THREE.Matrix4().makeTranslation(256.8, 5.8, -118));
  for (let x = 59; x < 266; x += 4) {
    if (Math.abs(x + 2 - POI.airportGate.x) < 8) continue;
    b.box(0.15, 2.4, 0.15, P.steel, x, 1.2, -56);
    b.box(4, 0.1, 0.08, P.steel, x + 2, 2.2, -56);
    b.box(4, 0.1, 0.08, P.steel, x + 2, 1.2, -56);
  }
  solid({ type: 'box', x: (59 + POI.airportGate.x - 6) / 2, z: -56, hw: (POI.airportGate.x - 6 - 59) / 2, hd: 0.4, seeThrough: true });
  solid({ type: 'box', x: (POI.airportGate.x + 6 + 266) / 2, z: -56, hw: (266 - POI.airportGate.x - 6) / 2, hd: 0.4, seeThrough: true });
  // the airport stays sealed on its other sides; the x = 59 line also keeps 北投 off the river
  solid({ type: 'box', x: 268, z: -160, hw: 2, hd: 110, seeThrough: true });
  solid({ type: 'box', x: 59, z: -163, hw: 0.6, hd: 107, seeThrough: true });
  solid({ type: 'box', x: 163.5, z: -158, hw: 104.5, hd: 0.4, seeThrough: true });
  for (let z = -158; z < -58; z += 4) {
    b.box(0.15, 2.4, 0.15, P.steel, 59, 1.2, z);
    b.box(0.08, 0.1, 4, P.steel, 59, 2.2, z + 2);
    b.box(0.08, 0.1, 4, P.steel, 59, 1.2, z + 2);
  }
  for (let x = 59; x < 266; x += 4) {
    b.box(0.15, 2.4, 0.15, P.steel, x, 1.2, -158);
    b.box(4, 0.1, 0.08, P.steel, x + 2, 2.2, -158);
    b.box(4, 0.1, 0.08, P.steel, x + 2, 1.2, -158);
  }

  // ---- north-east: the Keelung River bends round the airport, with the Neihu hills beyond
  b.wash(() => {
    b.box(226, 0.1, 110, 0xb5c79c, 167, -0.05, -215);
    b.box(231, 0.1, 20, 0x8cc4d4, 174.5, 0.0, -174);
    b.box(22, 0.1, 140, 0x8cc4d4, 73, 0.0, -234);
    b.box(1, 1.2, 110, 0xb8b2a6, 59.5, 0.6, -215);
    for (const [x, z, rad, h, col, ry] of [
      [130, -240, 36, 18, 0xa7bfa0, 0.4], [196, -250, 46, 26, 0x9db7a7, 1.3], [252, -226, 32, 15, 0xb2c4a6, 2.2],
    ]) {
      const g = new THREE.ConeGeometry(rad, h, 7, 1).translate(0, h / 2 - 2, 0);
      b.add(g, col, new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeScale(1, 1, 0.8)));
    }
  });

  // ---- district signs at the entrances
  const signs = [
    ['大安區', -24, -40, 0],
    ['中山區', -52, -150, 0],
    ['信義區', 62, 10, Math.PI / 2],
    ['北投區', -60, -168, Math.PI],
    ['萬華區', -140, 30, -Math.PI / 2],
    ['松山機場', POI.airportGate.x + 13, -48, 0],
    ['金滑國小', POI.school.x, POI.school.z + 7],
  ];
  for (const [text, x, z, ry] of signs) {
    const s = sign(text, { w: Math.max(6, text.length * 1.4), h: 1.8 });
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    scene.add(s);
  }

  // ---- set dressing for the open plazas
  // daan base: planters, flags
  for (const px of [-110, -96, 10, 24]) planter(b, px, -40, 6, 1.4);
  for (const px of [-60, -50, -34, -24]) planter(b, px, 22, 4, 1.2);
  flagPole(b, POI.altar.x - 4, POI.altar.z - 3, 0xc63d2c);
  flagPole(b, POI.altar.x + 4, POI.altar.z - 3, 0x3b7fc2);
  for (const c of [[-110, -40, 3, 0.7], [-96, -40, 3, 0.7], [10, -40, 3, 0.7], [24, -40, 3, 0.7]]) solid({ type: 'box', x: c[0], z: c[1], hw: c[2], hd: c[3], seeThrough: true });
  // wanhua night market round the umbrella plaza
  const marketCols = [[0xe25b45, 0xf6efe0], [0xe8b42f, 0xc63d2c], [0x4c9255, 0xf6efe0], [0x3b7fc2, 0xf6efe0], [0xd94a8a, 0xf6efe0]];
  for (let i = 0; i < 7; i++) {
    const sx = -228 + i * 11;
    const c = stall(b, sx, -36, 0, marketCols[i % marketCols.length]);
    solid({ type: 'box', x: c.x, z: c.z, hw: c.hw, hd: c.hd });
  }
  for (let i = 0; i < 6; i++) {
    const sx = -226 + i * 12;
    stall(b, sx, 32, Math.PI, marketCols[(i + 2) % marketCols.length]);
    solid({ type: 'box', x: sx, z: 32.6, hw: 3.2, hd: 1.8 });
  }
  lanterns(b, -232, -30, -160, -30, 16);
  lanterns(b, -232, 26, -160, 26, 16);
  lanternPoints(-232, -30, -160, -30, 16);
  lanternPoints(-232, 26, -160, 26, 16);
  // rat king's lair: rubbish and a broken wall
  for (const [gx, gz] of [[-262, 116], [-256, 142], [-236, 144], [-264, 130], [-230, 112]]) garbagePile(b, r, gx, gz, 6);
  for (let i = 0; i < 5; i++) b.box(4, 2 - (i % 2) * 0.8, 0.5, 0xb8ab94, -244 + i * 4.2, 1, 106, (r() - 0.5) * 0.1);
  solid({ type: 'box', x: -235.6, z: 106, hw: 10.5, hd: 0.4 });
  // tool shop yard
  logPile(b, POI.toolShop.x - 10, POI.toolShop.z - 4, 0.2);
  logPile(b, POI.toolShop.x + 11, POI.toolShop.z - 3, -0.3);
  solid({ type: 'box', x: POI.toolShop.x - 10, z: POI.toolShop.z - 4, hw: 1.8, hd: 1.4 });
  solid({ type: 'box', x: POI.toolShop.x + 11, z: POI.toolShop.z - 3, hw: 1.8, hd: 1.4 });
  // xinyi plaza fountain
  fountain(b, 136, 22);
  solid({ type: 'circle', x: 136, z: 22, r: 4.3, seeThrough: true });
  for (const px of [96, 110, 140]) planter(b, px, -26, 6, 1.4);

  const staticMesh = b.build();
  scene.add(staticMesh);
  scene.add(backdrop(r));

  // ---- trees
  const trees = new TreeField(scene);
  const free = (x, z, pad = 2) => {
    if (colliders.some((c) => (c.type === 'box'
      ? Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad
      : Math.hypot(x - c.x, z - c.z) < c.r + pad))) return false;
    if (onRoad(x, z)) return false;
    return !RESERVED.slice(2).some((q) => x > q[0] && x < q[2] && z > q[1] && z < q[3]);
  };
  const scatter = (rect, n, opts) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 40) {
      tries++;
      const x = rect[0] + r() * (rect[2] - rect[0]);
      const z = rect[1] + r() * (rect[3] - rect[1]);
      if (!free(x, z, 2.5)) continue;
      if (trees.trees.some((t) => Math.abs(t.x - x) < 3.2 && Math.abs(t.z - z) < 3.2)) continue;
      trees.add(x, z, { r, scale: 0.85 + r() * 0.5, ...opts });
      placed++;
    }
  };
  let parkTries = 0;
  while (trees.trees.length < 230 && parkTries++ < 6000) {
    const x = -114 + r() * 150, z = 34 + r() * 108;
    if (Math.abs(x + 39) < 4 || Math.abs(z - 88) < 4 || Math.hypot(x + 39, z - 88) < 12) continue;
    if (Math.abs(x + 36) < 3) continue;
    if (trees.trees.some((t) => Math.abs(t.x - x) < 3.4 && Math.abs(t.z - z) < 3.4)) continue;
    trees.add(x, z, { r, scale: 0.9 + r() * 0.5 });
  }
  scatter([-268, -268, 48, -162], 230, { type: 'pine' });
  scatter([-128, -158, 48, -52], 45);
  scatter([52, -48, 268, 148], 70);
  scatter([-268, -158, -132, 148], 60);
  trees.finalize();

  const safeZones = [...POI.sells, ...['recruit', 'altar', 'shop', 'toolShop', 'milk'].map((k) => POI[k])].map((p) => ({ x: p.x, z: p.z, r: 9 }));

  return { staticMesh, colliders, trees, safeZones, roads, onRoad, free, rng: r, lights };
}

// The Taipei basin beyond the playable city: Tamsui River to the west, hills all round
// (Yangmingshan behind 北投 to the north), and a skyline of blocks so the edge is not a void.
function backdrop(r) {
  const M = () => new THREE.Matrix4();
  const parts = [];
  // river
  parts.push({ geo: new THREE.BoxGeometry(34, 0.1, 520), color: 0x8cc4d4, matrix: M().makeTranslation(-292, -0.05, -60) });
  parts.push({ geo: new THREE.BoxGeometry(4, 1.2, 520), color: 0xb8b2a6, matrix: M().makeTranslation(-273, 0.6, -60) });
  // distant skyline blocks to the south and east
  for (let i = 0; i < 70; i++) {
    const side = i % 2;
    const x = side ? 290 + r() * 120 : -260 + r() * 560;
    const z = side ? -260 + r() * 440 : 175 + r() * 110;
    const w = 12 + r() * 18, d = 12 + r() * 18, h = 8 + r() * 30;
    const col = [0xd8d2c4, 0xc9d1d6, 0xe0cdb8, 0xc8cbb8][Math.floor(r() * 4)];
    parts.push({ geo: new THREE.BoxGeometry(w, h, d), color: col, matrix: M().makeTranslation(x, h / 2, z) });
  }
  const city = new THREE.Mesh(mergeColored(parts, 1), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  city.receiveShadow = true;
  // ring of hills (Yangmingshan to the north is the biggest)
  const hills = [];
  const ring = [
    [-420, -520, 260, 150], [-60, -560, 300, 190], [320, -520, 260, 160], [600, -260, 220, 120],
    [620, 120, 220, 110], [380, 420, 240, 120], [-20, 460, 260, 110], [-400, 420, 240, 120],
    [-620, 140, 220, 120], [-640, -220, 240, 140], [200, -640, 260, 170], [-260, -650, 240, 150],
  ];
  for (const [x, z, rad, h] of ring) {
    const g = new THREE.ConeGeometry(rad, h, 7, 1);
    g.translate(0, h / 2 - 4, 0);
    const col = [0xa7bfa0, 0x9db7a7, 0xb2c4a6, 0xa2b9b0][Math.floor(r() * 4)];
    hills.push({ geo: g, color: col, matrix: M().makeTranslation(x, 0, z).multiply(M().makeRotationY(r() * 3)).multiply(M().makeScale(1, 1, 0.7 + r() * 0.5)) });
  }
  const hillMesh = new THREE.Mesh(mergeColored(hills, 1), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
  const g = new THREE.Group();
  g.add(city, hillMesh);
  return g;
}
