import { DISTRICTS, WORLD, POI } from '../world/map.js';
import { DISTRICT_TINT } from '../world/palette.js';

// Hand-drawn style map of the city: small in the corner, full-size when expanded.

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const LANDMARKS = [
  { key: 'sell', icon: '$', color: '#c63d2c' },
  { key: 'recruit', icon: '工', color: '#3b7fc2' },
  { key: 'altar', icon: '神', color: '#c63d2c' },
  { key: 'shop', icon: '商', color: '#4c9255' },
  { key: 'toolShop', icon: '具', color: '#8a5a3b' },
  { key: 'milk', icon: '奶', color: '#3b7fc2' },
  { key: 'donation', icon: '傘', color: '#c63d2c' },
];

function jitter(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647 - 0.5);
  };
}

export class Minimap {
  constructor(canvas, bigCanvas) {
    this.canvas = canvas;
    this.big = bigCanvas;
    this.cache = new Map();
  }

  // Static base drawn once per size.
  base(w, h, labels) {
    const key = `${w}x${h}x${labels}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const sx = w / (WORLD.x1 - WORLD.x0), sz = h / (WORLD.z1 - WORLD.z0);
    const X = (x) => (x - WORLD.x0) * sx, Z = (z) => (z - WORLD.z0) * sz;
    const r = jitter(7);
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(0, 0, w, h);
    for (const [k, d] of Object.entries(DISTRICTS)) {
      const [x0, z0, x1, z1] = d.rect;
      ctx.fillStyle = hex(DISTRICT_TINT[k]);
      ctx.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    }
    // park, airport, runway
    ctx.fillStyle = '#a9cf7c';
    ctx.fillRect(X(-117), Z(31), X(39) - X(-117), Z(145) - Z(31));
    ctx.fillStyle = '#8cc9d8';
    ctx.beginPath();
    ctx.arc(X(-39), Z(88), 9 * sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c3d1a0';
    ctx.fillRect(X(54), Z(-268), X(268) - X(54), Z(-54) - Z(-268));
    ctx.fillStyle = '#8f8b86';
    const rw = POI.runway;
    ctx.fillRect(X(rw.x0), Z(rw.z - rw.w / 2), X(rw.x1) - X(rw.x0), rw.w * sz);
    ctx.fillStyle = '#d9dee2';
    ctx.fillRect(X(125), Z(-99), 70 * sx, 22 * sz);
    // roads as doubled pencil lines
    const roads = [
      [WORLD.x0, -50, WORLD.x1, -50], [WORLD.x0, -160, 50, -160], [-130, WORLD.z0, -130, WORLD.z1], [50, WORLD.z0, 50, WORLD.z1],
      [-270, 46, -130, 46], [50, 46, 270, 46], [160, -50, 160, 150], [-270, -220, -130, -220],
    ];
    ctx.strokeStyle = 'rgba(120,112,100,0.85)';
    ctx.lineCap = 'round';
    for (const [x0, z0, x1, z1] of roads) {
      for (let k = 0; k < 2; k++) {
        ctx.lineWidth = Math.max(1.5, 10 * sx) * (k ? 0.5 : 1);
        ctx.beginPath();
        ctx.moveTo(X(x0) + r() * 1.5, Z(z0) + r() * 1.5);
        ctx.lineTo(X(x1) + r() * 1.5, Z(z1) + r() * 1.5);
        ctx.stroke();
      }
    }
    // district borders
    ctx.strokeStyle = 'rgba(51,48,46,0.55)';
    ctx.lineWidth = 1;
    for (const d of Object.values(DISTRICTS)) {
      const [x0, z0, x1, z1] = d.rect;
      ctx.strokeRect(X(x0) + r(), Z(z0) + r(), X(x1) - X(x0), Z(z1) - Z(z0));
    }
    // district names
    ctx.fillStyle = 'rgba(51,48,46,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(10, Math.round(w / 15));
    ctx.font = `700 ${fs}px "LXGW WenKai TC", "PingFang TC", sans-serif`;
    const namePos = { daan: [5, 134], zhongshan: [-98, -72], xinyi: [218, 128], beitou: [-210, -250], wanhua: [-205, -110], songshan: [160, -178] };
    for (const [k, d] of Object.entries(DISTRICTS)) {
      const [nx, nz] = namePos[k];
      ctx.fillText(d.name, X(nx), Z(nz));
    }
    if (labels) {
      ctx.font = `${Math.round(fs * 0.62)}px "LXGW WenKai TC", "PingFang TC", sans-serif`;
      const extra = [
        ['福德宮', POI.temple.x - 6, POI.temple.z - 14], ['國小', POI.school.x, POI.school.z - 10], ['吸菸所', POI.smoking.x, POI.smoking.z + 9],
        ['溫泉', -132, -244], ['老鼠王', POI.ratKing.x + 6, POI.ratKing.z - 10], ['夜市・遮陽傘', -196, 12], ['阿婆', POI.granny.x, POI.granny.z + 9],
        ['塔台', 236, -124], ['航廈', 160, -104], ['森林公園', -39, 66],
      ];
      for (const [t, x, z] of extra) ctx.fillText(t, X(x), Z(z));
    }
    this.cache.set(key, c);
    return c;
  }

  draw(ctx, w, h, game, { labels = false, objective = null, time = 0 } = {}) {
    ctx.drawImage(this.base(w, h, labels), 0, 0);
    const sx = w / (WORLD.x1 - WORLD.x0), sz = h / (WORLD.z1 - WORLD.z0);
    const X = (x) => (x - WORLD.x0) * sx, Z = (z) => (z - WORLD.z0) * sz;
    const small = !labels;
    const iconR = small ? Math.max(5, w * 0.03) : w * 0.018;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of LANDMARKS) {
      const p = POI[l.key];
      ctx.fillStyle = '#f6efe0';
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), iconR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = l.color;
      ctx.font = `700 ${Math.round(iconR * 1.3)}px "PingFang TC", sans-serif`;
      ctx.fillText(l.icon, X(p.x), Z(p.z) + 0.5);
      if (labels) {
        ctx.fillStyle = 'rgba(51,48,46,0.8)';
        ctx.font = `${Math.round(iconR * 1.2)}px "LXGW WenKai TC", "PingFang TC", sans-serif`;
        ctx.fillText(p.label, X(p.x), Z(p.z) + iconR * 2.1);
      }
    }
    // airport gate
    if (game.airport) {
      ctx.fillStyle = game.airport.open ? '#4c9255' : '#c63d2c';
      ctx.fillRect(X(POI.airportGate.x) - 6 * sx, Z(-56) - 1.5, 12 * sx, 3);
    }
    if (objective?.target) {
      const t = objective.target;
      const pulse = 1 + Math.sin(time * 6) * 0.25;
      ctx.save();
      ctx.translate(X(t.x), Z(t.z));
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#f2c230';
      ctx.strokeStyle = '#7a5a10';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const R = iconR * 1.2;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? R * 0.45 : R;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // player arrow
    const p = game.player.pos;
    ctx.save();
    ctx.translate(X(p.x), Z(p.z));
    ctx.rotate(-game.player.yaw);
    const a = small ? Math.max(6, w * 0.04) : w * 0.02;
    ctx.fillStyle = '#d8392b';
    ctx.strokeStyle = '#33302e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -a);
    ctx.lineTo(a * 0.7, a * 0.8);
    ctx.lineTo(0, a * 0.35);
    ctx.lineTo(-a * 0.7, a * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
