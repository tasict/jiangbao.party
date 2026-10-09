import * as THREE from 'three';

// All pencil textures are drawn on canvases at startup, so the game ships without image assets.

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

function toTexture(canvas, { repeat = true, srgb = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Draws a stroke and its wrapped copies so the texture tiles seamlessly.
function wrapDraw(ctx, size, draw) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(ox, oy);
      draw();
      ctx.restore();
    }
  }
}

// Horizontal pencil strokes on transparent black: red channel = stroke darkness.
// The shader rotates the lookup to get hatching in any direction.
export function makeHatchTexture(size = 256, seed = 7) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const r = rng(seed);
  ctx.lineCap = 'round';
  const count = 520;
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 14 + r() * 46;
    const tilt = (r() - 0.5) * 0.18;
    const w = 0.7 + r() * 1.3;
    const a = 0.35 + r() * 0.65;
    const v = Math.floor(255 * a);
    wrapDraw(ctx, size, () => {
      const g = ctx.createLinearGradient(x, y, x + len, y + len * tilt);
      g.addColorStop(0, `rgba(${v},${v},${v},0)`);
      g.addColorStop(0.15, `rgba(${v},${v},${v},1)`);
      g.addColorStop(0.8, `rgba(${v},${v},${v},1)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.globalCompositeOperation = 'lighten';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.5, y + len * tilt * 0.5 + (r() - 0.5) * 2, x + len, y + len * tilt);
      ctx.stroke();
    });
  }
  return toTexture(c);
}

// Smooth tileable value noise, 3 octaves packed in RGB for cheap wobble lookups.
export function makeNoiseTexture(size = 256, seed = 3) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = rng(seed);
  const octaves = [8, 16, 32].map((cells) => {
    const grid = new Float32Array(cells * cells).map(() => r());
    return { cells, grid };
  });
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = ({ cells, grid }, x, y) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const g = (ix, iy) => grid[((iy % cells) + cells) % cells * cells + (((ix % cells) + cells) % cells)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i] = sample(octaves[0], x, y) * 255;
      img.data[i + 1] = sample(octaves[1], x, y) * 255;
      img.data[i + 2] = sample(octaves[2], x, y) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// Warm drawing paper: fine grain plus a few long fibres.
export function makePaperTexture(size = 512, seed = 11) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = r();
    const grain = 236 + n * 19;
    img.data[i * 4] = grain + 2;
    img.data[i * 4 + 1] = grain - 1;
    img.data[i * 4 + 2] = grain - 9;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#7a6a50';
  for (let i = 0; i < 260; i++) {
    const x = r() * size, y = r() * size;
    const a = r() * Math.PI * 2;
    const len = 6 + r() * 26;
    wrapDraw(ctx, size, () => {
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  // Soft blotches give the sheet some unevenness.
  ctx.globalAlpha = 0.035;
  for (let i = 0; i < 40; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 70;
    wrapDraw(ctx, size, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, '#8a7350');
      g.addColorStop(1, 'rgba(138,115,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    });
  }
  return toTexture(c);
}
