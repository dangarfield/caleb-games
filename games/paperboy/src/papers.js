// Thrown papers. Spawn at a world position, travel -Z (the rider's left).
import * as THREE from 'three';
import { state } from './config.js';

const GEO = new THREE.BoxGeometry(0.3, 0.09, 0.09);
const MAT = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.9 });
const MAX_TRAVEL = 40;   // units before it is culled
const MAX_AGE = 12;      // seconds before it is culled

export class Papers {
    constructor(scene) {
        this.scene = scene;
        this.live = [];
    }

    spawn(worldPos, direction) {
        const mesh = new THREE.Mesh(GEO, MAT);
        mesh.castShadow = true;
        mesh.position.copy(worldPos);
        this.scene.add(mesh);
        const dir = direction ? direction.clone().normalize() : new THREE.Vector3(0, 0, -1);
        this.live.push({ mesh, dir, from: worldPos.clone(), age: 0 });
        return mesh;
    }

    update(dt) {
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            p.age += dt;
            p.mesh.position.addScaledVector(p.dir, state.throwSpeed * dt);
            p.mesh.rotation.x += dt * 6;
            if (p.age > MAX_AGE || p.from.distanceTo(p.mesh.position) > MAX_TRAVEL) {
                this.scene.remove(p.mesh);
                this.live.splice(i, 1);
            }
        }
    }

    // Remove one paper by index (used when it scores).
    remove(i) {
        this.scene.remove(this.live[i].mesh);
        this.live.splice(i, 1);
    }

    clear() {
        for (const p of this.live) this.scene.remove(p.mesh);
        this.live.length = 0;
    }
}
