// Runtime for the planned entities: spawns them, walks them along their
// waypoints once triggered, and registers them as dynamic colliders so the
// existing collision and scoring passes treat them like anything else.
import * as THREE from 'three';
import { ENTITY_TYPES, state } from './config.js';
import { animateModel, buildModel, disposeModel } from './models.js';

const ARRIVE = 0.15;      // how close counts as reaching a waypoint

export class Enemies {
    constructor(scene, colliders) {
        this.scene = scene;
        this.colliders = colliders;
        this.live = [];
        this.time = 0;
    }

    // Build live copies from the plan. Called when a run starts.
    spawn(plan) {
        this.clear();
        for (const def of plan.entities) {
            const spec = ENTITY_TYPES[def.type];
            if (!spec) continue;

            // Models are authored standing on y = 0, so the spawn height is
            // the model's base rather than its centre.
            const mesh = buildModel(def.type, spec);
            mesh.position.set(def.spawn.x, def.spawn.y, def.spawn.z);
            this.scene.add(mesh);

            // The route: spawn -> waypoints, returning to spawn if it repeats.
            const route = def.waypoints.map(w => new THREE.Vector3(w.x, mesh.position.y, w.z));
            if (def.repeat && route.length) route.push(new THREE.Vector3(def.spawn.x, mesh.position.y, def.spawn.z));

            const collider = {
                name: `${spec.label} ${def.id}`,
                role: def.type,
                spec: { solid: spec.solid, paperPoints: spec.paperPoints, playerPoints: spec.playerPoints },
                mesh, meshes: [mesh], scored: false,
                box: new THREE.Box3().setFromObject(mesh),
                centre: mesh.position.clone(),
            };
            this.colliders.moving.push(collider);

            const e = { def, spec, mesh, collider, route, i: 0, moving: false };
            // speed comes from spec (the type), read live so slider changes apply
            this.face(e);
            this.live.push(e);
        }
    }

    clear() {
        for (const e of this.live) {
            this.scene.remove(e.mesh);
            disposeModel(e.mesh);
        }
        this.live.length = 0;
        this.colliders.moving.length = 0;
    }

    // An unset direction looks along the next leg of the route.
    face(e) {
        if (e.def.dir !== null && e.def.dir !== undefined) {
            e.mesh.rotation.y = THREE.MathUtils.degToRad(e.def.dir);
            return;
        }
        const t = e.route[e.i];
        if (!t) return;
        e.mesh.rotation.y = Math.atan2(t.x - e.mesh.position.x, t.z - e.mesh.position.z);
    }

    update(dt, playerX) {
        this.time += dt;
        for (const e of this.live) {
            let travelled = 0;
            if (!e.moving && playerX >= e.def.trigger.x) {
                e.moving = true;
                this.face(e);
            }

            if (e.moving && e.route.length) {
                const target = e.route[e.i];
                if (target) {
                    const dx = target.x - e.mesh.position.x;
                    const dz = target.z - e.mesh.position.z;
                    const d = Math.hypot(dx, dz);
                    if (d <= ARRIVE) {
                        e.i++;
                        if (e.i >= e.route.length) e.i = e.def.repeat ? 0 : e.route.length;
                        this.face(e);
                    } else {
                        const step = Math.min(d, (e.spec.speed ?? 0) * dt);
                        travelled = step;
                        e.mesh.position.x += (dx / d) * step;
                        e.mesh.position.z += (dz / d) * step;
                        if (e.def.dir === null || e.def.dir === undefined) {
                            e.mesh.rotation.y = Math.atan2(dx, dz);
                        }
                    }
                }
            }

            // Wheels and legs run off distance travelled, so they stop when it
            // stops; the judder runs off the clock.
            animateModel(e.mesh, travelled, this.time);

            // Keep the collider in step with the mesh.
            e.collider.box.setFromObject(e.mesh);
            e.collider.centre.copy(e.mesh.position);
        }
    }
}
