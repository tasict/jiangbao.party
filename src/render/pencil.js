import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { makeHatchTexture, makeNoiseTexture, makePaperTexture } from './textures.js';
import { OVERLAY_LAYER } from '../world/batcher.js';

// Colored-pencil look in one composite pass:
//   1. scene colour -> half-float target (with depth texture)
//   2. scene normals -> second target via overrideMaterial
//   3. full-screen shader: wobbly graphite outlines from depth+normal edges,
//      pigment laid down with paper tooth and directional strokes, cross-hatching in shadow.
// Noise offsets only advance on a "boil" tick so the drawing jitters like hand-drawn animation.

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tHatch;
uniform sampler2D tNoise;
uniform sampler2D tPaper;
uniform vec2 uResolution;
uniform vec2 uSeed;
uniform float uNear;
uniform float uFar;
uniform float uLineWidth;
uniform float uPixelScale;
uniform float uEdgeFadeNear;
uniform float uEdgeFadeFar;
uniform vec3 uFlash;
uniform float uFlashAmount;
uniform mat4 uInvProj;
uniform float uNight;
uniform mat4 uCamWorld;
varying vec2 vUv;

float linearDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float invDepth(vec2 uv) {
  return 1.0 / linearDepth(texture2D(tDepth, uv).r);
}

float edgeAt(vec2 uv) {
  vec2 px = uLineWidth / uResolution;
  vec3 nl = texture2D(tNormal, uv - vec2(px.x, 0.0)).rgb;
  vec3 nr = texture2D(tNormal, uv + vec2(px.x, 0.0)).rgb;
  vec3 nu = texture2D(tNormal, uv + vec2(0.0, px.y)).rgb;
  vec3 nd = texture2D(tNormal, uv - vec2(0.0, px.y)).rgb;
  float en = length(nl - nr) + length(nu - nd);

  // Laplacian of 1/z is zero on any plane, so ground seen at grazing angles stays clean.
  float w0 = invDepth(uv);
  float wl = invDepth(uv - vec2(px.x, 0.0));
  float wr = invDepth(uv + vec2(px.x, 0.0));
  float wu = invDepth(uv + vec2(0.0, px.y));
  float wd = invDepth(uv - vec2(0.0, px.y));
  float lap = (abs(wl + wr - 2.0 * w0) + abs(wu + wd - 2.0 * w0)) / max(w0, 1e-6);

  return max(smoothstep(0.06, 0.22, lap), smoothstep(0.38, 0.85, en));
}

void main() {
  vec2 uv = vUv;
  vec2 pp = uv * uResolution / uPixelScale;   // css-pixel coords keep stroke size stable across DPR
  vec4 nz = texture2D(tNoise, uv * 1.7 + uSeed);
  vec4 nz2 = texture2D(tNoise, uv * 5.3 - uSeed * 1.3);

  float d0 = texture2D(tDepth, uv).r;
  float lz = linearDepth(d0);
  float sky = step(800.0, lz);

  // --- graphite outline: two offset passes give the doubled, searching line of a quick sketch
  vec2 wob = (nz.rg - 0.5) * 3.2 * uPixelScale / uResolution;
  float e1 = edgeAt(uv + wob);
  float e2 = edgeAt(uv - wob * 1.6 + vec2(0.8, -0.5) * uPixelScale / uResolution);
  float fade = 1.0 - smoothstep(uEdgeFadeNear, uEdgeFadeFar, lz);
  float lineTooth = texture2D(tHatch, rot(pp / 150.0, 0.35) + uSeed * 2.0).r;
  float line = max(e1, e2 * 0.5) * fade * (0.45 + 0.7 * lineTooth);

  // --- colour, slightly misregistered against the outline
  vec2 cuv = uv + (nz2.rg - 0.5) * 4.0 * uPixelScale / uResolution;
  vec3 lin = texture2D(tColor, cuv).rgb;
  vec3 c = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  // pencils are more saturated than the flat render once multiplied over paper
  c = clamp(mix(vec3(lum), c, 1.15), 0.0, 1.0);

  // stroke direction follows the surface: each face gets one of a few hand directions
  vec3 nrm = texture2D(tNormal, cuv).rgb * 2.0 - 1.0;
  float nlen = length(nrm.xy);
  float ang = nlen > 0.35 ? atan(nrm.y, nrm.x) + 1.5708 : 0.95;
  ang = floor(ang / 0.5236 + 0.5) * 0.5236;
  ang = mix(ang, 0.12, sky);

  vec3 paper = texture2D(tPaper, pp / 512.0).rgb;
  // at night the bare paper between strokes reads as dusk blue, not white
  paper *= mix(vec3(1.0), vec3(0.46, 0.5, 0.66), uNight);
  float tooth = texture2D(tPaper, pp / 61.0 + uSeed * 0.37).r;
  tooth = (tooth - 0.92) / 0.08;                       // paper grain normalised to ~0..1

  float s1 = texture2D(tHatch, rot(pp / 230.0, ang) + uSeed).r;
  float s2 = texture2D(tHatch, rot(pp / 170.0, ang - 0.15) + uSeed * 1.7 + 0.5).r;
  float strokes = max(s1, s2 * 0.8);

  float pressure = 0.22 + (1.0 - lum) * 0.62 + sat * 0.28;

  // sky: pale blue laid on lightly, clouds left as bare paper (fixed in world space)
  vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec4 vdir = uInvProj * ndc;
  vec3 ray = normalize((uCamWorld * vec4(vdir.xyz / vdir.w, 0.0)).xyz);
  vec2 cloudUv = ray.xz / max(ray.y + 0.08, 0.02) * 0.18;
  float cloud = texture2D(tNoise, cloudUv * 0.35).r * 0.65 + texture2D(tNoise, cloudUv * 0.9 + 0.3).g * 0.35;
  cloud = smoothstep(0.56, 0.68, cloud) * smoothstep(0.0, 0.12, ray.y) * smoothstep(0.8, 0.5, ray.y);
  float skyPressure = (0.5 + smoothstep(0.0, 0.5, ray.y) * 0.4) * (1.0 - cloud * (1.0 - uNight * 0.55));
  pressure = mix(pressure, skyPressure, sky);

  // ragged unfinished border, like colouring that stops short of the page edge
  vec2 cen = uv - 0.5;
  float border = length(cen * vec2(1.0, 0.8)) + (nz.b - 0.5) * 0.12;
  pressure *= 1.0 - smoothstep(0.58, 0.76, border);

  float cover = smoothstep(0.08, 0.62, pressure + strokes * 0.62 - tooth * 0.42 - 0.08);
  cover = clamp(cover, 0.0, 1.0);
  vec3 pigment = mix(paper, paper * c, cover);
  // cloud outlines: a faint grey pencil contour around the bare-paper clouds
  float cloudEdge = smoothstep(0.012, 0.0, abs(texture2D(tNoise, cloudUv * 0.35).r * 0.65 + texture2D(tNoise, cloudUv * 0.9 + 0.3).g * 0.35 - 0.565));
  pigment = mix(pigment, pigment * 0.86, cloudEdge * sky * smoothstep(0.02, 0.15, ray.y) * smoothstep(0.8, 0.5, ray.y) * (0.5 + lineTooth * 0.5));

  // --- graphite hatching in the shadows, crossing at an angle to the colour strokes
  float shade = 1.0 - lum - uNight * 0.24;
  float h1 = texture2D(tHatch, rot(pp / 200.0, ang) + uSeed * 1.3 + 0.21).r;
  float h2 = texture2D(tHatch, rot(pp / 200.0, ang - 1.4) + uSeed * 2.1 + 0.63).r;
  float h3 = texture2D(tHatch, rot(pp / 160.0, ang + 0.8) + uSeed * 0.7 + 0.37).r;
  float hatch = smoothstep(0.42, 0.62, shade) * h1
              + smoothstep(0.58, 0.78, shade) * h2
              + smoothstep(0.74, 0.92, shade) * h3;
  hatch *= (1.0 - sky) * (1.0 - smoothstep(0.58, 0.76, border));
  // shadows layered with a cool violet pencil rather than plain grey
  pigment *= mix(vec3(1.0), vec3(0.58, 0.56, 0.74), clamp(hatch, 0.0, 1.0) * 0.85);

  // --- watercolour wash for the big flat areas (ground, walls, sky, hills):
  // solid pigment with soft blooms and granulation, darker where the wash pooled at an edge.
  // Not tied to the boil seed, so washes stay still while the pencil lines jitter.
  float washMask = texture2D(tNormal, cuv).a;
  float bloom = texture2D(tNoise, uv * 1.2 + vec2(0.13, 0.71)).r * 0.6 + texture2D(tNoise, uv * 3.3 + vec2(0.41, 0.27)).g * 0.4;
  float density = 0.86 + (bloom - 0.5) * 0.32;
  density *= 1.0 - cloud * sky * (0.9 - uNight * 0.45);
  density *= 1.0 - smoothstep(0.58, 0.76, border);
  vec3 washC = clamp(mix(vec3(lum), c, 1.08), 0.0, 1.0);
  vec3 wash = mix(paper, paper * washC, clamp(density, 0.0, 1.0));
  float gran = (texture2D(tPaper, pp / 37.0).r - 0.92) / 0.08;
  wash *= 0.95 + 0.05 * gran;
  float pooled = max(e1, e2 * 0.5) * fade;   // reuse the outline edges, no extra samples
  wash *= 1.0 - pooled * 0.16;
  pigment = mix(pigment, wash, washMask);

  vec3 graphite = vec3(0.20, 0.19, 0.22);
  float lineAmt = clamp(line * 1.15, 0.0, 1.0) * mix(0.9, 0.75, washMask);
  vec3 outc = mix(pigment, graphite, lineAmt);

  // night: a cool wash over the page and a scatter of stars fixed to the sky
  outc *= mix(vec3(1.0), vec3(0.74, 0.79, 1.0), uNight * 0.55);
  vec2 sp = ray.xz / max(ray.y, 0.06) * 55.0;
  vec2 cell = floor(sp);
  float star = step(0.986, hash12(cell)) * smoothstep(0.14, 0.02, length(fract(sp) - 0.5));
  star *= sky * uNight * smoothstep(0.06, 0.3, ray.y) * (1.0 - cloud) * (0.6 + 0.4 * lineTooth);
  outc = mix(outc, vec3(1.0, 0.96, 0.82), star);

  // hit / damage flash drawn as a coloured scribble over the page
  float flashStroke = texture2D(tHatch, rot(pp / 70.0, -0.5) + uSeed * 3.1).r;
  float vign = smoothstep(0.25, 0.75, length(cen));
  outc = mix(outc, outc * uFlash, uFlashAmount * vign * (0.4 + flashStroke * 0.8));

  gl_FragColor = vec4(outc, 1.0);
}
`;

export class PencilPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    // The outline pass also records, in alpha, whether a surface is painted as a watercolour
    // wash (aStyle = 1: ground, walls, sky) or drawn in coloured pencil (no attribute: everything else).
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.normalMaterial.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aStyle;\nvarying float vStyle;')
        .replace('void main() {', 'void main() {\n\tvStyle = aStyle;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vStyle;\nvoid main() {')
        .replace(/#ifdef OPAQUE[\s\S]*?#endif/, 'gl_FragColor.a = vStyle;');
    };
    this.boilInterval = 0.12;
    this.boilClock = 0;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.colorTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.normalTarget = new THREE.WebGLRenderTarget(size.x, size.y);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        tHatch: { value: makeHatchTexture() },
        tNoise: { value: makeNoiseTexture() },
        tPaper: { value: makePaperTexture() },
        uResolution: { value: size.clone() },
        uSeed: { value: new THREE.Vector2() },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uLineWidth: { value: renderer.getPixelRatio() * 1.4 },
        uPixelScale: { value: renderer.getPixelRatio() },
        uEdgeFadeNear: { value: 70 },
        uEdgeFadeFar: { value: 160 },
        uFlash: { value: new THREE.Color(1, 0.35, 0.3) },
        uFlashAmount: { value: 0 },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uNight: { value: 0 },
      },
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.colorTarget.setSize(size.x, size.y);
    this.normalTarget.setSize(size.x, size.y);
    this.material.uniforms.uResolution.value.copy(size);
    this.material.uniforms.uLineWidth.value = this.renderer.getPixelRatio() * 1.4;
    this.material.uniforms.uPixelScale.value = this.renderer.getPixelRatio();
  }

  flash(color, amount) {
    this.material.uniforms.uFlash.value.set(color);
    this.material.uniforms.uFlashAmount.value = Math.max(this.material.uniforms.uFlashAmount.value, amount);
  }

  render(dt) {
    const { renderer, scene, camera } = this;
    const u = this.material.uniforms;

    this.boilClock += dt;
    if (this.boilClock >= this.boilInterval) {
      this.boilClock = 0;
      u.uSeed.value.set(Math.random(), Math.random());
    }
    u.uFlashAmount.value = Math.max(0, u.uFlashAmount.value - dt * 2.2);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    camera.updateMatrixWorld();
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);

    camera.layers.enable(OVERLAY_LAYER);
    renderer.setRenderTarget(this.colorTarget);
    renderer.render(scene, camera);
    camera.layers.disable(OVERLAY_LAYER);

    const bg = scene.background;
    const fog = scene.fog;
    const shadows = renderer.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMaterial;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.normalTarget);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;
    renderer.shadowMap.autoUpdate = shadows;
    camera.layers.enable(OVERLAY_LAYER);

    renderer.setRenderTarget(null);
    this.quad.render(renderer);
  }
}
