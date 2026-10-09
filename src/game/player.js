import * as THREE from 'three';
import { resolveCircle, segmentBlocked } from '../core/physics.js';
import { WORLD } from '../world/map.js';

export class Player {
  constructor(camera, grid) {
    this.camera = camera;
    this.grid = grid;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.45;
    this.eye = 1.65;
    this.baseSpeed = 7;
    this.speedMult = 1;
    this.bob = 0;
    this.moving = 0;
    this.vel = new THREE.Vector3();
    this.thirdPerson = false;
    this.camDist = 4.2;
    this.curDist = 4.2;
    this.lookDir = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.sensitivity = 0.0024;
    camera.rotation.order = 'YXZ';
    this.viewModel = new THREE.Group();
    camera.add(this.viewModel);
  }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = -0.05;
  }

  // Third person: same orientation as first person, pulled back over the right shoulder.
  // Pulls in when a building would come between the camera and 蔣寶.
  placeChaseCamera(dt) {
    const cp = Math.cos(this.pitch);
    const dir = this.lookDir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const head = this.head.set(this.pos.x + rx * 0.55, 1.75, this.pos.z + rz * 0.55);
    let want = this.camDist;
    while (want > 1.2) {
      const cx = head.x - dir.x * want, cz = head.z - dir.z * want;
      if (!segmentBlocked(this.grid, this.pos.x, this.pos.z, cx, cz)) break;
      want -= 0.3;
    }
    // snap in instantly, ease back out
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 4);
    this.camera.position.copy(head).addScaledVector(dir, -this.curDist);
    this.camera.position.y = Math.max(0.45, this.camera.position.y);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, input, { frozen = false } = {}) {
    const look = input.consumeLook();
    this.yaw -= look.x * this.sensitivity;
    this.pitch -= look.y * this.sensitivity;
    this.pitch = Math.max(-1.35, Math.min(this.thirdPerson ? 0.75 : 1.2, this.pitch));

    const mv = frozen ? { x: 0, y: 0 } : input.moveVector();
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const speed = this.baseSpeed * this.speedMult;
    const vx = (mv.x * cos - mv.y * sin) * speed;
    const vz = (-mv.x * sin - mv.y * cos) * speed;
    this.vel.set(vx, 0, vz);
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    resolveCircle(this.grid, this.pos, this.radius);
    this.pos.x = Math.max(WORLD.x0 + 1, Math.min(WORLD.x1 - 1, this.pos.x));
    this.pos.z = Math.max(WORLD.z0 + 1, Math.min(WORLD.z1 - 1, this.pos.z));

    const m = Math.hypot(mv.x, mv.y);
    this.moving += (m - this.moving) * Math.min(1, dt * 10);
    this.bob += dt * (6 + 4 * this.speedMult) * this.moving;
    const bobY = Math.sin(this.bob * 2) * 0.05 * this.moving;

    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.thirdPerson) this.placeChaseCamera(dt);
    else this.camera.position.set(this.pos.x, this.eye + bobY, this.pos.z);
    this.viewModel.position.set(Math.sin(this.bob) * 0.02 * this.moving, bobY * 0.4, 0);
  }
}
