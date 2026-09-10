// Confetti: one InstancedMesh for the lot.
//
// It used to be a mesh and a cloned material per piece, which at the finish —
// where the crowd throws handfuls — was over a hundred draw calls on its own.
// Now every piece lives in one instanced mesh: 1 draw call however many are in
// the air, and no per-piece material to allocate or dispose.
//
// A piece dies by shrinking rather than fading, because opacity belongs to the
// material (shared by all instances) while scale is per instance.
import * as THREE from 'three';
import { quality } from './quality.js';

const COLOURS = [0xffd32a, 0xff7ad9, 0x00d2a0, 0x6c5ce7, 0xff6f3c, 0xffffff]
    .map(c => new THREE.Color(c));

const PIECES = 16;
const LIFE = 1.1;          // seconds
const GRAVITY = 6;
const MAX_LIVE = 220;      // the pool; older pieces are recycled past this
const SIZE = 0.07;

const DEFAULTS = { pieces: PIECES, life: LIFE, up: 2.2, upVary: 1.6, out: 0.6, outVary: 1.2, scale: 1 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export class Confetti {
    constructor(scene) {
        this.scene = scene;
        this.live = [];
        this.mesh = new THREE.InstancedMesh(
            new THREE.PlaneGeometry(SIZE, SIZE * 0.7),
            new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
            MAX_LIVE);
        this.mesh.name = 'Confetti';
        this.mesh.frustumCulled = false;   // pieces move every frame
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.mesh.count = 0;
        scene.add(this.mesh);
    }

    burst(at, opts) {
        const o = opts ? { ...DEFAULTS, ...opts } : DEFAULTS;
        const wanted = Math.max(1, Math.round(o.pieces * quality.preset.confetti));
        for (let i = 0; i < wanted; i++) {
            if (this.live.length >= MAX_LIVE) this.live.shift();
            const a = Math.random() * Math.PI * 2;
            const out = o.out + Math.random() * o.outVary;
            this.live.push({
                pos: at.clone(),
                vel: new THREE.Vector3(Math.cos(a) * out, o.up + Math.random() * o.upVary, Math.sin(a) * out),
                spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
                rot: new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
                colour: COLOURS[(Math.random() * COLOURS.length) | 0],
                size: o.scale,
                age: 0,
                life: o.life,
            });
        }
    }

    update(dt) {
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            p.age += dt;
            if (p.age >= p.life) { this.live.splice(i, 1); continue; }
            p.vel.y -= GRAVITY * dt;
            p.pos.addScaledVector(p.vel, dt);
            p.rot.x += p.spin.x * dt;
            p.rot.y += p.spin.y * dt;
            p.rot.z += p.spin.z * dt;
        }
        this.write();
    }

    write() {
        const n = Math.min(this.live.length, MAX_LIVE);
        for (let i = 0; i < n; i++) {
            const p = this.live[i];
            // Shrink away over the last third of its life.
            const left = 1 - p.age / p.life;
            const k = p.size * Math.min(1, left * 3);
            _m.compose(p.pos, _q.setFromEuler(_e.copy(p.rot)), _s.set(k, k, k));
            this.mesh.setMatrixAt(i, _m);
            this.mesh.setColorAt(i, p.colour);
        }
        this.mesh.count = n;
        if (n) {
            this.mesh.instanceMatrix.needsUpdate = true;
            if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        }
    }

    clear() {
        this.live.length = 0;
        this.mesh.count = 0;
    }
}
