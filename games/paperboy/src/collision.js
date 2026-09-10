// Collision index for the level.
//
// Built once at load: every mesh is classified by name (ROLE_RULES), given a
// world-space AABB, and bucketed along X. A frame then only tests the few boxes
// in the boy's slice of the street instead of all ~600. The same index answers
// paper-vs-target. Dynamic obstacles go in `moving` and are tested in full,
// which is fine while there are only a handful.
import * as THREE from 'three';
import { BUCKET_SIZE, ROLES, ROLE_COLOURS, ROLE_RULES } from './config.js';

function match(name) {
    for (const [re, role] of ROLE_RULES) if (re.test(name)) return role;
    return 'ignore';
}

// glTF splits a multi-material Blender object into meshes named "Thing_1",
// "Thing_2"... so a rule anchored on the real name misses them. Classify the
// name as-is first (so "Jump_1", which legitimately ends in a digit, still
// matches), and only if that yields nothing try again without the suffix.
export function roleFor(name) {
    const role = match(name);
    if (role !== 'ignore') return role;
    const base = name.replace(/_\d+$/, '');
    return base === name ? 'ignore' : match(base);
}

const _box = new THREE.Box3();

export class Colliders {
    constructor() {
        this.all = [];
        this.moving = [];
        this.terrainMeshes = [];
        this.buckets = new Map();
        this.counts = {};
        this.debugGroup = null;
        // The player's own boxes — one per collision probe — drawn over the top
        // of the scene so they are actually visible against the road.
        this.playerBounds = [new THREE.Box3(), new THREE.Box3()];
        this.playerBoxes = null;
    }

    build(root) {
        root.updateMatrixWorld(true);

        // One collider per Blender object, not per glTF primitive: a mesh whose
        // name is its parent's plus "_N" is folded into the parent, and their
        // boxes are unioned. Keeps scoring, flaps and sign reveals 1:1 with the
        // objects in the .blend.
        const byOwner = new Map();
        root.traverse(obj => {
            if (!obj.isMesh) return;
            const parent = obj.parent;
            const folds = parent && parent !== root && parent.name
                && new RegExp(`^${parent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+$`).test(obj.name);
            const owner = folds ? parent : obj;
            const role = roleFor(owner.name);
            this.counts[role] = (this.counts[role] || 0) + 1;
            if (role === 'ignore') return;

            const spec = ROLES[role] || {};
            if (spec.ground) this.terrainMeshes.push(obj);
            if (spec.hidden) obj.visible = false;
            // Only the roles worth it cast: see ROLES.casts.
            if (spec.casts) obj.castShadow = true;

            _box.setFromObject(obj);
            const existing = byOwner.get(owner);
            if (existing) { existing.box.union(_box); existing.meshes.push(obj); return; }
            byOwner.set(owner, {
                name: owner.name, role, spec, mesh: owner, meshes: [obj],
                box: _box.clone(),
            });
        });

        for (const c of byOwner.values()) {
            // Some things are easier to hit with a paper than they are tall: a
            // target gets a second, stretched box for paper tests only. The
            // real box still decides what the boy rides into, so a taller
            // target does not become an invisible wall over a jump.
            c.hitBox = c.box;
            if (c.spec.hitScaleY) {
                c.hitBox = c.box.clone();
                c.hitBox.max.y = c.box.min.y + (c.box.max.y - c.box.min.y) * c.spec.hitScaleY;
            }
            c.centre = c.box.getCenter(new THREE.Vector3());
            c.scored = false;
            this.all.push(c);
            for (let b = Math.floor(c.box.min.x / BUCKET_SIZE); b <= Math.floor(c.box.max.x / BUCKET_SIZE); b++) {
                if (!this.buckets.has(b)) this.buckets.set(b, []);
                this.buckets.get(b).push(c);
            }
        }

        this.pairSignsToTargets();
        return this;
    }

    // Hide/show every mesh of a collider (a sign may be several primitives).
    setVisible(collider, on) { for (const m of collider.meshes) m.visible = on; }

    // Each Sign250_*_BG sits ~0.76 from exactly one Target_target.NNN, so pair
    // by proximity rather than parsing the index out of the name.
    pairSignsToTargets() {
        const signs = this.all.filter(c => c.role === 'sign');
        const targets = this.all.filter(c => c.role === 'target');
        this.signsPaired = 0;
        for (const sign of signs) {
            let best = null, bestD = 1.5;
            for (const t of targets) {
                const d = sign.centre.distanceTo(t.centre);
                if (d < bestD) { bestD = d; best = t; }
            }
            if (!best) continue;
            // A sign is a board AND a number, so a target owns a list.
            (best.signs ||= []).push(sign);
            best.sign = best.signs[0];      // kept for anything reading one
            this.setVisible(sign, false);   // hidden until its target is hit
            this.signsPaired++;
        }
    }

    // Colliders whose bucket overlaps [x - pad, x + pad].
    near(x, pad = 2) {
        const out = [];
        for (let b = Math.floor((x - pad) / BUCKET_SIZE); b <= Math.floor((x + pad) / BUCKET_SIZE); b++) {
            const list = this.buckets.get(b);
            if (list) for (const c of list) out.push(c);
        }
        return out;
    }

    // Everything whose box the point (x, z) sits inside horizontally, and whose
    // vertical span overlaps [yMin, yMax]. `test` filters by role/spec.
    // `boxKey` picks which box to test: the true one, or a role's stretched
    // paper-catching one.
    at(x, z, r, yMin, yMax, test, boxKey = 'box') {
        const hits = [];
        for (const c of this.near(x, r + 2)) {
            if (test && !test(c)) continue;
            const b = c[boxKey] || c.box;
            if (x + r < b.min.x || x - r > b.max.x) continue;
            if (z + r < b.min.z || z - r > b.max.z) continue;
            if (yMax < b.min.y || yMin > b.max.y) continue;
            hits.push(c);
        }
        for (const c of this.moving) {
            if (test && !test(c)) continue;
            const b = c[boxKey] || c.box;
            if (x + r < b.min.x || x - r > b.max.x) continue;
            if (z + r < b.min.z || z - r > b.max.z) continue;
            if (yMax < b.min.y || yMin > b.max.y) continue;
            hits.push(c);
        }
        return hits;
    }

    // The ramp his wheels are on, if any. Tested as a box overlap rather than a
    // height sample: the ramps that guard the rivers are a metre wide, and a
    // single ray at his centre made hitting one a coin toss.
    rampAt(x, z, r) {
        for (const c of this.near(x, r + 2)) {
            if (!c.spec.ramp) continue;
            const b = c.box;
            if (x + r < b.min.x || x - r > b.max.x) continue;
            if (z + r < b.min.z || z - r > b.max.z) continue;
            return c;
        }
        return null;
    }

    // Papers test the stretched boxes; everything else the true ones.
    paperAt(x, z, r, yMin, yMax, test) { return this.at(x, z, r, yMin, yMax, test, 'hitBox'); }
    solidAt(x, z, r, yMin, yMax) { return this.at(x, z, r, yMin, yMax, c => c.spec.solid); }
    hazardAt(x, z, r = 0) { return this.at(x, z, r, -5, 5, c => c.spec.fatal)[0] || null; }
    pickupAt(x, z, r, yMin, yMax) { return this.at(x, z, r, yMin, yMax, c => c.spec.playerPoints); }

    // --- Debug boxes, coloured by role ---
    // Keep the player's debug boxes on his collision probes. Box3Helper reads
    // its Box3 during updateMatrixWorld, so mutating the box is enough.
    setPlayerBounds(i, x, z, r, bottom, top) {
        const b = this.playerBounds[i];
        if (!b) return;
        b.min.set(x - r, bottom, z - r);
        b.max.set(x + r, top, z + r);
    }

    setDebug(scene, on) {
        if (on && !this.playerBoxes) {
            this.playerBoxes = this.playerBounds.map(b => {
                const h = new THREE.Box3Helper(b, 0x00ffff);
                // Drawn on top of everything: a hairline wireframe buried in
                // the road is no use as a debug aid.
                h.material.depthTest = false;
                h.material.depthWrite = false;
                h.renderOrder = 999;
                scene.add(h);
                return h;
            });
        }
        if (this.playerBoxes) for (const h of this.playerBoxes) h.visible = on;

        if (on && !this.debugGroup) {
            this.debugGroup = new THREE.Group();
            for (const c of this.all) {
                if (c.role === 'terrain') continue;   // too many, and not interesting
                const h = new THREE.Box3Helper(c.box, ROLE_COLOURS[c.role] || 0xffffff);
                this.debugGroup.add(h);
            }
            scene.add(this.debugGroup);
        }
        if (this.debugGroup) this.debugGroup.visible = on;
    }
}
