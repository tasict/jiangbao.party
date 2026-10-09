// Flat-world collision: player and creatures are circles on the XZ plane,
// buildings are axis-aligned boxes, trees and towers are circles.

export class ColliderGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
  }

  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  bounds(c) {
    if (c.type === 'box') return [c.x - c.hw, c.z - c.hd, c.x + c.hw, c.z + c.hd];
    return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  }

  insert(c) {
    const [x0, z0, x1, z1] = this.bounds(c);
    const s = this.cell;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this.key(ix, iz);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(c);
      }
    }
  }

  query(x, z, r, out = []) {
    out.length = 0;
    const s = this.cell;
    const seen = new Set();
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (seen.has(c)) continue;
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }
}

const tmp = [];

// Pushes a circle out of every solid collider it overlaps. Returns the corrected position.
export function resolveCircle(grid, pos, radius) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of grid.query(pos.x, pos.z, radius + 1, tmp)) {
      if (c.disabled || (c.tree && !c.tree.alive)) continue;
      if (c.type === 'box') {
        const cx = Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
        const cz = Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * radius;
            pos.z = cz + (dz / d) * radius;
          } else {
            // centre is inside the box: leave by the nearest face
            const px = c.hw - Math.abs(pos.x - c.x), pz = c.hd - Math.abs(pos.z - c.z);
            if (px < pz) pos.x = c.x + Math.sign(pos.x - c.x || 1) * (c.hw + radius);
            else pos.z = c.z + Math.sign(pos.z - c.z || 1) * (c.hd + radius);
          }
          moved = true;
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return pos;
}

// Line-of-sight test against boxes only (used by NPC vision). Slab test per box.
export function segmentBlocked(grid, ax, az, bx, bz) {
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
  const minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
  const r = Math.max(maxX - minX, maxZ - minZ) / 2 + 1;
  for (const c of grid.query((ax + bx) / 2, (az + bz) / 2, r, tmp)) {
    if (c.type !== 'box' || c.disabled || c.seeThrough) continue;
    if (c.x + c.hw < minX || c.x - c.hw > maxX || c.z + c.hd < minZ || c.z - c.hd > maxZ) continue;
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    const slabs = [[dx, ax, c.x - c.hw, c.x + c.hw], [dz, az, c.z - c.hd, c.z + c.hd]];
    let hit = true;
    for (const [d, o, lo, hi] of slabs) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { hit = false; break; }
      } else {
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}
