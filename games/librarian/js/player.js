import * as THREE from 'three';
import { getFloorBounds, getFloorHeightAt, clampToWalkable } from './library.js';

const MOVE_SPEED = 5;
const SPRINT_SPEED = 9;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.6;
const GRAVITY = 18;
const JUMP_SPEED = 7;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.camera.position.set(0, PLAYER_HEIGHT, 2);

    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.feetY = 0;
    this.grounded = true;

    this.keys = {};
    this.isLocked = false;
    this.carrying = [];
    this.maxCarry = 3;
    this.skillPoints = 0;

    this.abilities = {
      insight: { unlocked: true, cooldown: 0, maxCooldown: 15 },
      sort: { unlocked: true, cooldown: 0, maxCooldown: 5 },
      guide: { unlocked: true, cooldown: 0, maxCooldown: 10 },
    };

    this.setupControls();
  }

  setupControls() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= e.movementX * MOUSE_SENSITIVITY;
      this.euler.x -= e.movementY * MOUSE_SENSITIVITY;
      this.euler.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    });
  }

  lock() {
    this.isLocked = true;
  }

  unlock() {
    this.isLocked = false;
  }

  update(dt) {
    if (!this.isLocked) return;

    const speed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? SPRINT_SPEED : MOVE_SPEED;

    this.direction.set(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) this.direction.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) this.direction.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.direction.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) this.direction.x += 1;

    if (this.direction.length() > 0) {
      this.direction.normalize();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      right.y = 0;
      right.normalize();

      this.velocity.copy(forward.multiplyScalar(-this.direction.z))
        .add(right.multiplyScalar(this.direction.x))
        .normalize()
        .multiplyScalar(speed * dt);

      this.camera.position.x += this.velocity.x;
      this.camera.position.z += this.velocity.z;
    }

    // Jump
    if ((this.keys['Space']) && this.grounded) {
      this.verticalVelocity = JUMP_SPEED;
      this.grounded = false;
    }

    // Gravity
    this.verticalVelocity -= GRAVITY * dt;
    this.feetY += this.verticalVelocity * dt;

    // Floor collision
    const floorY = getFloorHeightAt(this.camera.position.x, this.camera.position.z, this.feetY);
    if (this.feetY <= floorY) {
      this.feetY = floorY;
      this.verticalVelocity = 0;
      this.grounded = true;
    }

    this.camera.position.y = this.feetY + PLAYER_HEIGHT;

    // Stair collision (block side entry)
    const clamped = clampToWalkable(this.camera.position.x, this.camera.position.z, this.feetY);
    this.camera.position.x = clamped.x;
    this.camera.position.z = clamped.z;

    // Bounds
    const bounds = getFloorBounds();
    this.camera.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.camera.position.x));
    this.camera.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.camera.position.z));

    Object.keys(this.abilities).forEach(key => {
      if (this.abilities[key].cooldown > 0) {
        this.abilities[key].cooldown -= dt;
        if (this.abilities[key].cooldown < 0) this.abilities[key].cooldown = 0;
      }
    });
  }

  canPickUp() {
    return this.carrying.length < this.maxCarry;
  }

  pickUp(book) {
    if (this.canPickUp()) {
      this.carrying.unshift(book);
      return true;
    }
    return false;
  }

  dropBook() {
    if (this.carrying.length > 0) {
      return this.carrying.shift();
    }
    return null;
  }

  getTopBook() {
    return this.carrying.length > 0 ? this.carrying[0] : null;
  }

  cycleBooks() {
    if (this.carrying.length < 2) return;
    this.carrying.push(this.carrying.shift());
  }

  sortBooks() {
    this.carrying.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.series !== b.series) return a.series.localeCompare(b.series);
      return a.volume - b.volume;
    });
  }

  getPosition() {
    return this.camera.position.clone();
  }

  getLookDirection() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    return dir;
  }
}
