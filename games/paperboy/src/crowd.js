// The crowd in the bleachers at the finish.
//
// Every fan is the same handful of boxes, so the whole stand is drawn as a few
// InstancedMeshes — one per body part — rather than a mesh per limb. That took
// the finish from ~110 draw calls to about eight, which is the difference
// between fine and not fine on a tablet.
//
// Seats are found by raycasting onto the CrowdStand itself, so they sit on
// whatever the model's steps actually are rather than on numbers copied out of
// Blender, and the seating is seeded so a reload puts the same crowd back.
//
// Fans face -X, back down the track towards the finish line, and every part is
// authored that way, so nothing here rotates them. Cheering builds as the boy
// comes up the track: a lazy sway when nobody is coming, arms overhead and
// hopping when he is on his way in, plus confetti over the stand.
import * as THREE from 'three';
import { quality } from './quality.js';

const SHIRTS = [0xff5f56, 0x4aa3ff, 0xffd32a, 0x2ecc71, 0x9b59b6, 0xff7ad9, 0xf0f0f0, 0xff6f3c];
const SKINS = [0xf2c8a0, 0xd9a06b, 0x8d5a34, 0xffe0bd];
const SKIP = 0.22;              // seats left empty, so it reads as a crowd
const SEAT_GAP = 1.05;          // along the stand, in world units
const SEAT_FORWARD = 0.34;      // how far up the tread a seated fan perches
const CHEER_FROM = 90;          // how far out he has to be before they warm up
const IDLE_BEYOND = 150;        // past this they are off screen: don't animate
const CONFETTI_IDLE = 1.4;      // seconds between pops when nothing is happening
const CONFETTI_CHEER = 0.22;
const FINISH_FALLBACK = 449;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const shade = (c, f) => new THREE.Color(c).multiplyScalar(f);

// Deterministic, so a reload puts the same crowd in the same seats.
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// The parts, in the fan's own space. Every one is a box, so one geometry per
// part serves every fan; the colour is per instance.
//
// Seated: backside on the deck, thighs over the edge, shins hanging in FRONT of
// the step's riser (any further back and they are inside the step).
// Arms are built pointing UP from the shoulder, so rotation.x = PI hangs one by
// the side and 0 holds it overhead — one number from bored to cheering.
const PARTS = {
    seatBody:   { geo: () => box(0.32, 0.16, 0.42), at: [-0.12, 0.14, 0], tint: 0.55, pose: 'seated' },
    seatThighL: { geo: () => box(0.40, 0.14, 0.14), at: [-0.36, 0.11, -0.09], tint: 0.55, pose: 'seated' },
    seatThighR: { geo: () => box(0.40, 0.14, 0.14), at: [-0.36, 0.11, 0.09], tint: 0.55, pose: 'seated' },
    seatShinL:  { geo: () => box(0.13, 0.42, 0.14), at: [-0.54, -0.17, -0.09], tint: 0.55, pose: 'seated' },
    seatShinR:  { geo: () => box(0.13, 0.42, 0.14), at: [-0.54, -0.17, 0.09], tint: 0.55, pose: 'seated' },
    seatTorso:  { geo: () => box(0.22, 0.50, 0.34), at: [0, 0.46, 0], tint: 1, pose: 'seated' },
    standLegL:  { geo: () => box(0.13, 0.74, 0.14), at: [0, 0.37, -0.09], tint: 0.55, pose: 'standing' },
    standLegR:  { geo: () => box(0.13, 0.74, 0.14), at: [0, 0.37, 0.09], tint: 0.55, pose: 'standing' },
    standTorso: { geo: () => box(0.22, 0.54, 0.36), at: [0, 1.01, 0], tint: 1, pose: 'standing' },
};

const HEAD = { geo: () => box(0.20, 0.20, 0.20), seated: 0.81, standing: 1.38 };
const CAP = { geo: () => box(0.24, 0.06, 0.26), seated: 0.93, standing: 1.50 };
const ARM = { geo: () => box(0.09, 0.42, 0.09), seated: 0.62, standing: 1.18, reach: 0.19 };

const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
const _at = new THREE.Vector3();

export class Crowd {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'CrowdFans';
        this.fans = [];
        this.parts = [];       // { mesh, part, pose, fans: [] }
        this.time = 0;
        this.popIn = 0;
        this.finishX = FINISH_FALLBACK;
        this.cheer = 0;
        this.fill = 1;
        quality.onChange(preset => this.setFill(preset.crowd));
    }

    // Seat fans on every CrowdStand in the level. Returns how many were placed.
    build(root) {
        const stands = [];
        let finish = null;
        root.traverse(o => {
            if (!o.isMesh) return;
            if (o.name.startsWith('CrowdStand')) stands.push(o);
            if (!finish && o.name.startsWith('FinishLine')) finish = o;
        });
        if (finish) {
            this.finishX = new THREE.Box3().setFromObject(finish).getCenter(new THREE.Vector3()).x;
        }
        if (!stands.length) return 0;

        const ray = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const rand = rng(20260909);

        for (const stand of stands) {
            const bounds = new THREE.Box3().setFromObject(stand);
            const rows = Math.max(1, Math.round(bounds.max.x - bounds.min.x));   // steps are a unit deep
            for (let r = 0; r < rows; r++) {
                const rowX = bounds.min.x + r;
                const seats = Math.floor((bounds.max.z - bounds.min.z) / SEAT_GAP);
                const inset = (bounds.max.z - bounds.min.z - (seats - 1) * SEAT_GAP) / 2;
                for (let s = 0; s < seats; s++) {
                    if (rand() < SKIP) continue;
                    const z = bounds.min.z + inset + s * SEAT_GAP + (rand() - 0.5) * 0.2;
                    // Back rows are where people stand up; the front stays seated.
                    const seated = r < rows - 2 ? rand() < 0.78 : rand() < 0.35;
                    const x = rowX + (seated ? SEAT_FORWARD : 0.5);
                    ray.set(new THREE.Vector3(x, bounds.max.y + 4, z), down);
                    ray.near = 0;
                    ray.far = 20;
                    const hit = ray.intersectObject(stand, false)[0];
                    if (!hit) continue;

                    const shirt = new THREE.Color(SHIRTS[(rand() * SHIRTS.length) | 0]);
                    this.fans.push({
                        pose: seated ? 'seated' : 'standing',
                        seated,
                        at: new THREE.Vector3(x, hit.point.y, z),
                        baseY: hit.point.y,
                        shirt,
                        trousers: shade(shirt, 0.55),
                        skin: new THREE.Color(SKINS[(rand() * SKINS.length) | 0]),
                        cap: rand() < 0.35 ? shade(shirt, 1.25) : null,
                        phase: rand() * Math.PI * 2,
                        rate: 2.2 + rand() * 1.8,
                        hop: seated ? 0.035 : 0.085 + rand() * 0.05,
                        // filled in per frame
                        y: hit.point.y,
                        sway: 0,
                        armL: Math.PI,
                        armR: -Math.PI,
                    });
                }
            }
        }
        if (!this.fans.length) return 0;

        this.buildParts();
        this.setFill(quality.preset.crowd);
        this.scene.add(this.group);
        return this.fans.length;
    }

    // One InstancedMesh per part, holding only the fans that have that part.
    buildParts() {
        // Shared: the crowd is in shade behind the finish and never casts.
        const material = () => new THREE.MeshStandardMaterial({ roughness: 0.8 });
        const add = (name, geo, fans, colourOf, place) => {
            if (!fans.length) return;
            const mesh = new THREE.InstancedMesh(geo, material(), fans.length);
            mesh.name = `Crowd_${name}`;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = true;
            fans.forEach((fan, i) => mesh.setColorAt(i, colourOf(fan)));
            this.group.add(mesh);
            this.parts.push({ mesh, fans, place });
        };

        for (const [name, part] of Object.entries(PARTS)) {
            const fans = this.fans.filter(f => f.pose === part.pose);
            add(name, part.geo(), fans,
                f => (part.tint === 1 ? f.shirt : f.trousers),
                (fan, m) => {
                    _pos.set(fan.at.x + part.at[0], fan.y + part.at[1], fan.at.z + part.at[2]);
                    m.compose(_pos, _q.setFromEuler(_e.set(0, fan.sway, 0)), _one);
                });
        }

        add('head', HEAD.geo(), this.fans, f => f.skin, (fan, m) => {
            _pos.set(fan.at.x, fan.y + HEAD[fan.pose], fan.at.z);
            m.compose(_pos, _q.setFromEuler(_e.set(0, fan.sway, 0)), _one);
        });
        add('cap', CAP.geo(), this.fans.filter(f => f.cap), f => f.cap, (fan, m) => {
            _pos.set(fan.at.x, fan.y + CAP[fan.pose], fan.at.z);
            m.compose(_pos, _q.setFromEuler(_e.set(0, fan.sway, 0)), _one);
        });
        // Arms pivot at the shoulder, so the box is offset along its own +Y and
        // the rotation is applied about the shoulder point.
        for (const [name, side, angle] of [['armL', -1, 'armL'], ['armR', 1, 'armR']]) {
            add(name, ARM.geo(), this.fans, f => f.shirt, (fan, m) => {
                const rot = _e.set(fan[angle], 0, 0);
                _q.setFromEuler(rot);
                _pos.set(0, ARM.reach, 0).applyQuaternion(_q);
                _pos.add(_at.set(fan.at.x, fan.y + ARM[fan.pose], fan.at.z + side * 0.2));
                m.compose(_pos, _q, _one);
            });
        }
    }

    // Low detail thins the stand rather than emptying it.
    setFill(fraction) {
        this.fill = Math.max(0.1, Math.min(1, fraction || 1));
        for (const part of this.parts) {
            part.mesh.count = Math.max(1, Math.round(part.fans.length * this.fill));
        }
        this.write();
    }

    setVisible(on) { this.group.visible = on; }

    write() {
        for (const part of this.parts) {
            const n = part.mesh.count;
            for (let i = 0; i < n; i++) {
                part.place(part.fans[i], _m);
                part.mesh.setMatrixAt(i, _m);
            }
            part.mesh.instanceMatrix.needsUpdate = true;
            if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
        }
    }

    // `confetti` is the shared burst pool; `atX` is wherever the view is looking
    // — the boy while riding, the slider in the planner — and decides how
    // excited they are.
    update(dt, atX, confetti) {
        if (!this.fans.length || !this.group.visible) return;

        const away = this.finishX - atX;
        // Nothing to see from down the street: skip the whole crowd rather than
        // animate it and throw confetti nobody is looking at.
        if (away > IDLE_BEYOND) { this.cheer = 0; return; }
        this.time += dt;

        // Warm up as he closes on the line and stay up once he is past it.
        const target = away < 0 ? 1 : Math.max(0, Math.min(1, 1 - away / CHEER_FROM));
        this.cheer += (target - this.cheer) * Math.min(1, dt * 1.5);
        const excited = 0.35 + this.cheer * 0.65;
        const lift = Math.PI * (1 - this.cheer) + 0.12;

        for (const fan of this.fans) {
            const t = this.time * fan.rate * excited + fan.phase;
            const s = Math.sin(t);
            fan.y = fan.baseY + Math.max(0, s) * fan.hop * excited;
            fan.sway = Math.sin(t * 0.5) * 0.09 * excited;
            fan.armL = lift + s * 0.5 * (0.35 + this.cheer);
            fan.armR = -lift - s * 0.5 * (0.35 + this.cheer);
        }
        this.write();

        if (!confetti || away > CHEER_FROM) return;
        this.popIn -= dt;
        if (this.popIn <= 0) {
            this.popIn = CONFETTI_IDLE - (CONFETTI_IDLE - CONFETTI_CHEER) * this.cheer;
            const fan = this.fans[(Math.random() * this.fans.length) | 0];
            const at = fan.at.clone();
            at.y = fan.y + (fan.seated ? 1.1 : 1.7);
            confetti.burst(at, {
                pieces: 6 + Math.round(this.cheer * 10),
                life: 2.8,
                up: 2.6 + this.cheer * 1.8,
                upVary: 1.4,
                out: 0.4,
                outVary: 1.2,
                // Seen across the stand rather than a couple of units away, so
                // the pieces have to be bigger to read.
                scale: 3,
            });
        }
    }
}
