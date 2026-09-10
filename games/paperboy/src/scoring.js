// Scoring and hit reactions. Detection lives in collision.js; what a hit MEANS
// lives here, so the two can be retuned independently.
import * as THREE from 'three';
import { audio } from './audio.js';
import { PLAYER_FOOT_DROP, PLAYER_PROBE_OFFSET, PLAYER_RADIUS, RIDER_HEIGHT_LOCAL, state } from './config.js';

const FLAP_TIME = 0.32;      // seconds for a flap to swing up and shut
const TOPPLE_TIME = 0.55;    // seconds for a hay bale to go over
const TOPPLE_ANGLE = -Math.PI / 2 + 0.06;   // flat, leaning a touch past square
const _v = new THREE.Vector3();

// A private float32 copy of a mesh's geometry.
//
// Two reasons. The packed level quantises positions into normalised integers,
// and geometry.translate() on one of those writes floats into an int array and
// folds the object flat. And two objects can share a geometry, so translating
// in place would move both. Anything that edits geometry goes through here.
function ownFloatGeometry(mesh) {
    const src = mesh.geometry;
    const geo = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
        const attr = src.getAttribute(name);
        if (!attr) continue;
        const out = new Float32Array(attr.count * attr.itemSize);
        const v = new THREE.Vector3();
        for (let i = 0; i < attr.count; i++) {
            // fromBufferAttribute decodes normalised integers for us.
            v.fromBufferAttribute(attr, i);
            out[i * attr.itemSize] = v.x;
            if (attr.itemSize > 1) out[i * attr.itemSize + 1] = v.y;
            if (attr.itemSize > 2) out[i * attr.itemSize + 2] = v.z;
        }
        geo.setAttribute(name, new THREE.Float32BufferAttribute(out, attr.itemSize));
    }
    if (src.index) geo.setIndex(Array.from(src.index.array));
    geo.groups = src.groups.map(g => ({ ...g }));
    mesh.geometry = geo;
    return geo;
}

export class Scoring {
    constructor(colliders, papers, confetti = null) {
        this.colliders = colliders;
        this.papers = papers;
        this.confetti = confetti;
        this.flaps = [];       // { pivot, t } for doors currently open
        this.hinges = new Map();
        this.toppling = [];    // { pivot, t } for bales going over
        this.pivots = new Map();
        this.last = '';        // most recent event, for the HUD
        this.onCrash = null;   // set by main
        this.onPickup = null;  // a picked-up bundle refills his bag
    }

    add(points, label) {
        state.score += points;
        this.last = `${label} +${points}`;
    }

    // --- Papers reaching something ---
    checkPapers() {
        for (let i = this.papers.live.length - 1; i >= 0; i--) {
            const paper = this.papers.live[i];
            const p = paper.mesh.position;
            const hits = this.colliders.paperAt(p.x, p.z, 0.15, p.y - 0.2, p.y + 0.2,
                c => c.spec.paperPoints && !c.scored);

            // Mailboxes score on proximity rather than a strict hit — it only
            // has to land near the box.
            const near = this.colliders.paperAt(p.x, p.z, 1.0, p.y - 1.2, p.y + 1.2,
                c => c.spec.paperRadius && !c.scored);

            const hit = hits[0] || near.find(c => c.centre.distanceTo(p) <= c.spec.paperRadius);
            if (!hit) continue;

            hit.scored = true;
            this.add(hit.spec.paperPoints, hit.role);
            // The role names double as the sound names: window, mailbox,
            // target, haybale, npc.
            audio.play(hit.role);
            if (hit.spec.flap) this.shutFlap(hit);
            if (hit.spec.topple) this.topple(hit);
            if (hit.spec.revealSign) for (const s of hit.signs || []) this.colliders.setVisible(s, true);
            this.confetti?.burst(hit.centre);
            this.papers.remove(i);
        }
    }

    // The door is a loose box in the .blend with no hinge, so rotating it about
    // its own centre just spun it in place — it never looked like it opened.
    // Re-parent it under a pivot on its bottom rear edge, once, and swing that.
    // Re-parent a collider's meshes under a group standing on one bottom edge,
    // so rotating that group swings the thing about that edge.
    //
    // Two things in the way, both from how the level is exported. A loose box
    // has no pivot of its own, so rotating it turns it on the spot — that was
    // the mailbox door that never looked open. And most level objects have
    // their node at the world origin with the shape baked into the geometry
    // hundreds of units away, so a pivot alone flings them across the map —
    // that was the hay bale. So the geometry is moved onto the hinge first and
    // the mesh then placed at it; after that one rotation does the right thing
    // whichever kind of object it is. `edge(box)` picks the edge. Cached.
    pivotFor(target, edge) {
        if (this.pivots.has(target.name)) return this.pivots.get(target.name);

        const first = target.meshes[0];
        const parent = first?.parent;
        if (!parent) return null;

        const box = new THREE.Box3();
        for (const m of target.meshes) box.union(new THREE.Box3().setFromObject(m));
        const hinge = edge(box, _v).clone();

        const pivot = new THREE.Group();
        parent.add(pivot);
        pivot.position.copy(parent.worldToLocal(hinge.clone()));
        pivot.updateMatrixWorld(true);

        for (const m of target.meshes) {
            const local = m.worldToLocal(hinge.clone());
            ownFloatGeometry(m).translate(-local.x, -local.y, -local.z);
            pivot.add(m);
            m.position.set(0, 0, 0);   // its origin is the hinge now
        }
        this.pivots.set(target.name, pivot);
        return pivot;
    }

    // The flap is modelled hanging OPEN: a plate on the bottom front corner of
    // the box, angled down and forward at 45 degrees, waiting for a paper. So
    // it hinges on its top front edge, and the shut position is however far it
    // has to swing to stand straight up — flush against the front of the box.
    // Both are measured off the model rather than hard-coded, so a re-export
    // that changes the flap's angle still shuts it properly.
    hingeFor(flap) {
        const pivot = this.pivotFor(flap, (box, v) => v.set((box.min.x + box.max.x) / 2, box.max.y, box.min.z));
        if (!pivot) return null;
        if (pivot.userData.shutAngle === undefined) {
            const box = new THREE.Box3();
            for (const m of flap.meshes) box.union(new THREE.Box3().setFromObject(m));
            // Hinge to free edge, in the plane it swings in. Rotating by
            // atan2(-dz, dy) turns that direction to straight up.
            const dy = box.min.y - box.max.y;
            const dz = box.max.z - box.min.z;
            pivot.userData.shutAngle = Math.atan2(-dz, dy);
        }
        this.hinges.set(flap.name, pivot);
        return pivot;
    }

    // A delivered paper swings the flap up and it stays shut: that box is done.
    shutFlap(mailbox) {
        // Every part of one mailbox shares a name suffix; find its door.
        const suffix = mailbox.name.replace(/^Mailbox_(Body|Base|Flap|SUN_Text)/, '');
        const flap = this.colliders.all.find(c => c.name === `Mailbox_Flap${suffix}`);
        if (!flap) return;
        const pivot = this.hingeFor(flap);
        if (!pivot || pivot.userData.shut) return;
        if (this.flaps.some(f => f.pivot === pivot)) return;   // already swinging
        this.flaps.push({ pivot, t: 0, to: pivot.userData.shutAngle });
    }

    // A paper in the face knocks a bale flat. It hinges on its bottom far edge
    // and goes over away from the road, which is the way the paper was going.
    topple(bale) {
        const pivot = this.pivotFor(bale, (box, v) => v.set((box.min.x + box.max.x) / 2, box.min.y, box.min.z));
        if (!pivot || this.toppling.some(t => t.pivot === pivot)) return;
        if (pivot.userData.down) return;
        this.toppling.push({ pivot, t: 0 });
    }

    // Every flap hanging open again, for a new day.
    resetFlaps() {
        for (const pivot of this.hinges.values()) {
            pivot.rotation.x = 0;
            pivot.userData.shut = false;
        }
        this.flaps.length = 0;
    }

    // --- The boy running into things ---
    checkPlayer(player) {
        if (!state.collisions || state.crashed || !state.riding) return;
        const p = state.boyPosition;
        const top = p.y + RIDER_HEIGHT_LOCAL * state.boyScale;
        // Start the box just below his wheels, not above them: grates and
        // manhole covers sit flush with the road (y -0.06..0.05) and a floor of
        // p.y + 0.1 sailed straight over them.
        const bottom = p.y - PLAYER_FOOT_DROP;

        // Two probes along his heading, front and back of the bike.
        const yaw = THREE.MathUtils.degToRad(state.boyRotationY);
        const fx = Math.sin(yaw) * PLAYER_PROBE_OFFSET;
        const fz = Math.cos(yaw) * PLAYER_PROBE_OFFSET;
        const probes = [[p.x + fx, p.z + fz], [p.x - fx, p.z - fz]];

        for (const [px, pz] of probes) {
            for (const c of this.colliders.pickupAt(px, pz, PLAYER_RADIUS, bottom, top)) {
                if (c.scored) continue;
                c.scored = true;
                this.add(c.spec.playerPoints, 'pickup');
                audio.play('pickup');
                this.colliders.setVisible(c, false);
                this.confetti?.burst(c.centre);
                this.onPickup?.(c);
            }
        }

        // Picking things up still counts during the post-continue grace, but
        // nothing can knock him off.
        if (state.invuln > 0) return;

        // Falling in the river: hazards are not ridable ground, so there is no
        // surface under him over the water — the bridge decks are. Airborne is
        // exempt, or the ramps that exist to jump the river would always kill him.
        const hazard = this.colliders.hazardAt(p.x, p.z);
        if (hazard && player.groundY === null && !player.airborne) {
            return this.crash(`fell in ${hazard.name}`);
        }

        for (const [px, pz] of probes) {
            const solid = this.colliders.solidAt(px, pz, PLAYER_RADIUS, bottom, top);
            if (solid.length) return this.crash(`hit ${solid[0].name}`);
        }
    }

    crash(why) {
        // With crashing off the player reports it instead (deduped), so don't
        // stamp the raw reason over that message every frame.
        if (state.crashEnabled) this.last = why;
        this.onCrash?.(why);
    }

    update(dt, player) {
        this.checkPapers();
        this.checkPlayer(player);
        for (let i = this.toppling.length - 1; i >= 0; i--) {
            const b = this.toppling[i];
            b.t += dt;
            const k = Math.min(1, b.t / TOPPLE_TIME);
            // Slow at the tip, quick once it is past the balance point.
            b.pivot.rotation.x = TOPPLE_ANGLE * k * k;
            if (k >= 1) {
                b.pivot.userData.down = true;
                this.toppling.splice(i, 1);
            }
        }
        for (let i = this.flaps.length - 1; i >= 0; i--) {
            const f = this.flaps[i];
            f.t += dt;
            const k = Math.min(1, f.t / FLAP_TIME);
            f.pivot.rotation.x = f.to * k * (2 - k);   // quick, then settles
            if (k >= 1) {
                f.pivot.userData.shut = true;          // and it stays up
                this.flaps.splice(i, 1);
            }
        }
    }

    // keepScore: a new day re-arms every target but carries the run's score.
    reset({ keepScore = false } = {}) {
        if (!keepScore) state.score = 0;
        this.last = '';
        this.resetFlaps();
        for (const pivot of this.pivots.values()) {
            pivot.rotation.x = 0;
            pivot.userData.down = false;
        }
        this.toppling.length = 0;
        this.confetti?.clear();
        for (const c of this.colliders.all) {
            if (!c.scored) continue;
            c.scored = false;
            if (c.spec.playerPoints) this.colliders.setVisible(c, true);
            for (const s of c.signs || []) this.colliders.setVisible(s, false);
        }
    }
}
