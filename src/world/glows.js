import * as THREE from 'three';
import { OVERLAY_LAYER } from './batcher.js';

// Night lights: lamp bulbs and their halos, warm pools of light on the pavement,
// glowing lanterns, and lit window bands. All fade with the engine's night value.

const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();

function instanced(geo, mat, points, place) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, points.length));
  points.forEach((p, i) => {
    place(p, tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
  });
  mesh.count = points.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.layers.set(OVERLAY_LAYER);
  mesh.renderOrder = 3;
  return mesh;
}

export class Glows {
  constructor(scene, lights) {
    this.group = new THREE.Group();
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true });
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc66a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true });
    this.mats = { bulbMat, haloMat, poolMat, lanternMat, windowMat };

    const id = (p, P, Q, S, s = 1) => { P.set(p.x, p.y, p.z); Q.identity(); S.setScalar(s); };
    this.group.add(instanced(new THREE.SphereGeometry(0.32, 8, 6), bulbMat, lights.lamps, (p, P, Q, S) => id(p, P, Q, S)));
    this.group.add(instanced(new THREE.SphereGeometry(1.4, 10, 8), haloMat, lights.lamps, (p, P, Q, S) => id(p, P, Q, S)));
    this.group.add(instanced(new THREE.CircleGeometry(4.2, 20).rotateX(-Math.PI / 2), poolMat, lights.lamps, (p, P, Q, S) => {
      P.set(p.x, 0.11, p.z);
      Q.identity();
      S.setScalar(1);
    }));
    this.group.add(instanced(new THREE.SphereGeometry(0.75, 8, 6), lanternMat, lights.lanterns, (p, P, Q, S) => id(p, P, Q, S)));
    this.group.add(instanced(new THREE.BoxGeometry(1, 1, 1), windowMat, lights.windows, (w, P, Q, S) => {
      w.m.decompose(P, Q, S);
      S.set(w.sx, w.sy, w.sz);
    }));
    this.group.traverse((o) => { o.frustumCulled = false; o.castShadow = false; });
    scene.add(this.group);
    this.setNight(0);
  }

  setNight(n) {
    const m = this.mats;
    this.group.visible = n > 0.02;
    m.bulbMat.opacity = n;
    m.haloMat.opacity = 0.32 * n;
    m.poolMat.opacity = 0.2 * n;
    m.lanternMat.opacity = 0.45 * n;
    m.windowMat.opacity = 0.9 * n;
  }
}
