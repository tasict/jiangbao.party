import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { P } from './palette.js';

// Smooth normals for the outline pass (no line on every facet) while the colour pass stays faceted.
function smooth(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo);
  g.computeVertexNormals();
  return g;
}

const TYPES = {
  round: () => {
    const g = smooth(new THREE.IcosahedronGeometry(1.7, 1));
    g.scale(1, 0.9, 1);
    g.translate(0, 3.6, 0);
    return g;
  },
  pine: () => {
    const a = new THREE.ConeGeometry(1.7, 2.6, 7);
    a.translate(0, 3.0, 0);
    const g = smooth(a);
    return g;
  },
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const ZERO = new THREE.Vector3(0, 0, 0);

export class TreeField {
  constructor(scene, capacity = 1400) {
    this.trees = [];
    this.capacity = capacity;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6);
    trunkGeo.translate(0, 1.3, 0);
    const lam = (opts) => new THREE.MeshLambertMaterial({ flatShading: true, ...opts });
    this.trunks = new THREE.InstancedMesh(trunkGeo, lam({ color: P.trunk }), capacity);
    this.canopy = {
      round: new THREE.InstancedMesh(TYPES.round(), lam({ color: 0xffffff }), capacity),
      pine: new THREE.InstancedMesh(TYPES.pine(), lam({ color: 0xffffff }), capacity),
    };
    const stumpGeo = new THREE.CylinderGeometry(0.34, 0.4, 0.45, 6);
    stumpGeo.translate(0, 0.22, 0);
    this.stumps = new THREE.InstancedMesh(stumpGeo, lam({ color: P.stump }), capacity);
    for (const m of [this.trunks, this.canopy.round, this.canopy.pine, this.stumps]) {
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }
    this.counts = { round: 0, pine: 0 };
  }

  add(x, z, { type = 'round', scale = 1, color, r = Math.random } = {}) {
    if (this.trees.length >= this.capacity) return null;
    const idx = this.trees.length;
    const cIdx = this.counts[type]++;
    const tree = {
      id: idx, x, z, type, scale, cIdx,
      rot: r() * Math.PI * 2,
      alive: true, shake: 0, fall: 0,
      radius: 0.5 * scale,
    };
    this.trees.push(tree);
    this.trunks.count = this.trees.length;
    this.stumps.count = this.trees.length;
    this.canopy[type].count = this.counts[type];
    const leaf = color ?? P.leaf[Math.floor(r() * P.leaf.length)];
    this.canopy[type].setColorAt(cIdx, tmpC.set(leaf));
    this.writeMatrices(tree);
    return tree;
  }

  writeMatrices(t) {
    const shakeX = Math.sin(t.shake * 40) * t.shake * 0.25;
    tmpQ.setFromEuler(new THREE.Euler(shakeX + t.fall, t.rot, shakeX * 0.5));
    tmpP.set(t.x, 0, t.z);
    if (t.alive || t.fall > 0) {
      tmpS.setScalar(t.scale);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.trunks.setMatrixAt(t.id, tmpM);
      this.canopy[t.type].setMatrixAt(t.cIdx, tmpM);
      tmpM.compose(tmpP, tmpQ, ZERO);
      this.stumps.setMatrixAt(t.id, tmpM);
    } else {
      tmpM.compose(tmpP, tmpQ, ZERO);
      this.trunks.setMatrixAt(t.id, tmpM);
      this.canopy[t.type].setMatrixAt(t.cIdx, tmpM);
      tmpS.setScalar(t.scale);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.stumps.setMatrixAt(t.id, tmpM);
    }
    this.dirty = true;
  }

  finalize() {
    for (const m of [this.trunks, this.canopy.round, this.canopy.pine, this.stumps]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.dirty = false;
  }
}
