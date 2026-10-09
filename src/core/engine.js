import * as THREE from 'three';
import { PencilPipeline } from '../render/pencil.js';
import { P } from '../world/palette.js';

// Lighting for the two times of day the story uses: the banquet night and the next morning.
const LOOKS = {
  day: {
    skyTop: P.sky, skyHorizon: P.fog, fog: P.fog, fogNear: 90, fogFar: 340,
    hemiSky: 0xfff4dc, hemiGround: 0x8f8a7c, hemi: 1.45,
    sun: 0xfff1d6, sunI: 3.1, sunOffset: [60, 110, 40],
  },
  night: {
    skyTop: 0x1c2747, skyHorizon: 0x545c7f, fog: 0x3c4463, fogNear: 50, fogFar: 240,
    hemiSky: 0x8a9ac8, hemiGround: 0x34323f, hemi: 1.4,
    sun: 0xb8c8ff, sunI: 1.5, sunOffset: [-50, 95, 60],
  },
};

// Renderer, camera, lights, sky and the pencil pipeline.
export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(P.fog, 90, 340);
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 1200);
    this.scene.add(this.camera);

    const hemi = new THREE.HemisphereLight(0xfff4dc, 0x8f8a7c, 1.45);
    this.hemi = hemi;
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -55;
    sc.right = sc.top = 55;
    sc.near = 10;
    sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sunOffset = new THREE.Vector3(60, 110, 40);
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.makeSky());
    this.pencil = new PencilPipeline(this.renderer, this.scene, this.camera);
    this.night = -1;
    this.setNight(0);

    addEventListener('resize', () => this.resize());
  }

  makeSky() {
    const geo = new THREE.SphereGeometry(900, 24, 12);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    sky.onBeforeRender = (r, s, cam) => sky.position.copy(cam.position);
    this.sky = sky;
    return sky;
  }

  paintSky(top, horizon) {
    const geo = this.sky.geometry;
    const pos = geo.attributes.position, col = geo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / 900);
      c.copy(horizon).lerp(top, Math.pow(t, 0.55));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // 0 = day, 1 = night; anything between blends the two looks.
  setNight(n) {
    if (n === this.night) return;
    this.night = n;
    const d = LOOKS.day, k = LOOKS.night;
    const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), n);
    const lerp = (a, b) => a + (b - a) * n;
    this.paintSky(mix(d.skyTop, k.skyTop), mix(d.skyHorizon, k.skyHorizon));
    this.scene.fog.color.copy(mix(d.fog, k.fog));
    this.scene.fog.near = lerp(d.fogNear, k.fogNear);
    this.scene.fog.far = lerp(d.fogFar, k.fogFar);
    this.hemi.color.copy(mix(d.hemiSky, k.hemiSky));
    this.hemi.groundColor.copy(mix(d.hemiGround, k.hemiGround));
    this.hemi.intensity = lerp(d.hemi, k.hemi);
    this.sun.color.copy(mix(d.sun, k.sun));
    this.sun.intensity = lerp(d.sunI, k.sunI);
    this.sunOffset.set(lerp(d.sunOffset[0], k.sunOffset[0]), lerp(d.sunOffset[1], k.sunOffset[1]), lerp(d.sunOffset[2], k.sunOffset[2]));
    this.pencil.material.uniforms.uNight.value = n;
    this.onNight?.(n);
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q !== 'low';
    this.resize();
  }

  resize() {
    this.renderer.setPixelRatio(this.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.pencil.setSize();
  }

  followSun(x, z) {
    // snap to a coarse grid so shadow edges do not swim as the player walks
    const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4;
    this.sun.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z);
    this.sun.target.position.set(sx, 0, sz);
  }

  render(dt) {
    this.pencil.render(dt);
  }
}
