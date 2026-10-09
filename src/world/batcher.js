import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Bakes many static pieces into vertex-coloured meshes, one per spatial chunk,
// so the whole city is a few dozen frustum-culled draw calls.
export class StaticBatcher {
  constructor(chunkSize = 90) {
    this.chunkSize = chunkSize;
    this.chunks = new Map();
    this.tmpColor = new THREE.Color();
    // 1 = watercolour wash (big flat areas), 0 = coloured pencil; read by the outline pass
    this.style = 0;
    this.tmpBox = new THREE.Box3();
    this.tmpV = new THREE.Vector3();
  }

  add(geometry, color, matrix) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    this.tmpColor.set(color);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = this.tmpColor.r;
      colors[i * 3 + 1] = this.tmpColor.g;
      colors[i * 3 + 2] = this.tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aStyle', new THREE.BufferAttribute(new Float32Array(n).fill(this.style), 1));
    g.computeBoundingBox();
    g.boundingBox.getCenter(this.tmpV);
    const s = this.chunkSize;
    const key = `${Math.floor(this.tmpV.x / s)},${Math.floor(this.tmpV.z / s)}`;
    let list = this.chunks.get(key);
    if (!list) this.chunks.set(key, (list = []));
    list.push(g);
    return this;
  }

  // Run `fn` with everything it adds painted as watercolour wash.
  wash(fn) {
    const prev = this.style;
    this.style = 1;
    fn();
    this.style = prev;
    return this;
  }

  box(w, h, d, color, x, y, z, ry = 0) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    return this.add(new THREE.BoxGeometry(w, h, d), color, m);
  }

  build({ castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const list of this.chunks.values()) {
      const geo = mergeGeometries(list, false);
      list.forEach((p) => p.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.chunks.clear();
    return group;
  }
}

export function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

// Objects on this layer are drawn in colour but skipped by the outline pass
// (particles, ground markers, translucent cones).
export const OVERLAY_LAYER = 1;
export function overlay(obj) {
  obj.traverse((o) => o.layers.set(OVERLAY_LAYER));
  return obj;
}

// Merge a handful of coloured parts into one geometry (for instanced creatures and props).
export function mergeColored(parts, style = 0) {
  const b = new StaticBatcher(1e9);
  b.style = style;
  for (const { geo, color, matrix } of parts) b.add(geo, color, matrix);
  const list = [...b.chunks.values()].flat();
  const g = mergeGeometries(list, false);
  list.forEach((p) => p.dispose());
  return g;
}

// Mark a standalone geometry as watercolour wash.
export function washGeometry(geo) {
  geo.setAttribute('aStyle', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1), 1));
  return geo;
}
