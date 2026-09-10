// The planner's 3D layer: draws the plan as coloured boxes with their waypoints
// and triggers, and lets them be dragged in the top-down view.
import * as THREE from 'three';
import { ENTITY_TYPES, RANGE, SPAWN_Y, state } from './config.js';
import { buildModel, disposeModel } from './models.js';

const WP_SIZE = 0.5;
const TRIGGER_SIZE = [0.3, 2.5, 0.3];
const SELECTED = 0xffffff;

const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SPAWN_Y);
const _pt = new THREE.Vector3();
const _ndc = new THREE.Vector2();

export class Planner {
    constructor(scene, plan, renderer) {
        this.scene = scene;
        this.plan = plan;
        this.renderer = renderer;
        this.group = new THREE.Group();
        this.group.name = 'planner';
        scene.add(this.group);
        this.handles = [];         // draggable meshes, tagged with what they move
        this.drag = null;
        this.pan = null;           // middle-button view pan
        this.camera = null;        // set to the plan camera while planning
        this.bindPointer(renderer.domElement);
        this.bindPan();
    }

    // --- drawing ---------------------------------------------------------
    refresh() {
        for (const child of [...this.group.children]) {
            disposeModel(child);
            this.group.remove(child);
        }
        this.handles.length = 0;

        for (const e of this.plan.entities) {
            const spec = ENTITY_TYPES[e.type];
            if (!spec) continue;
            const selected = e.id === this.plan.selectedId;

            // Same models the run uses, so what gets placed is what gets played.
            const body = buildModel(e.type, spec);
            body.position.set(e.spawn.x, e.spawn.y, e.spawn.z);
            body.rotation.y = THREE.MathUtils.degToRad(this.facing(e));
            body.userData = { entity: e, part: 'spawn' };
            this.group.add(body);
            this.handles.push(body);

            if (selected) {
                const edges = new THREE.Box3Helper(
                    new THREE.Box3().setFromObject(body), SELECTED);
                this.group.add(edges);
            }

            // Waypoints, and a line through them from the spawn.
            const pts = [new THREE.Vector3(e.spawn.x, SPAWN_Y + 0.05, e.spawn.z)];
            e.waypoints.forEach((w, i) => {
                const m = new THREE.Mesh(
                    new THREE.BoxGeometry(WP_SIZE, 0.12, WP_SIZE),
                    new THREE.MeshBasicMaterial({ color: selected ? SELECTED : spec.colour }));
                m.position.set(w.x, SPAWN_Y + 0.06, w.z);
                m.userData = { entity: e, part: 'waypoint', index: i };
                this.group.add(m);
                this.handles.push(m);
                pts.push(new THREE.Vector3(w.x, SPAWN_Y + 0.05, w.z));
            });
            if (e.repeat && pts.length > 2) pts.push(pts[0].clone());
            if (pts.length > 1) {
                this.group.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    new THREE.LineBasicMaterial({ color: selected ? SELECTED : spec.colour })));
            }

            // Trigger post: movement starts when the player's X passes this.
            const trig = new THREE.Mesh(
                new THREE.BoxGeometry(...TRIGGER_SIZE),
                new THREE.MeshBasicMaterial({ color: selected ? SELECTED : 0x6c5ce7 }));
            trig.position.set(e.trigger.x, SPAWN_Y + TRIGGER_SIZE[1] / 2, e.trigger.z);
            trig.userData = { entity: e, part: 'trigger' };
            this.group.add(trig);
            this.handles.push(trig);
        }

        // Picking happens on pointerdown, which can land before the next render.
        // Without this the fresh handles still have identity world matrices and
        // every click misses.
        this.group.updateMatrixWorld(true);
    }

    // Degrees. An unset direction faces the first waypoint, per the spec.
    facing(e) {
        if (e.dir !== null && e.dir !== undefined) return e.dir;
        const w = e.waypoints[0];
        if (!w) return 90;
        return THREE.MathUtils.radToDeg(Math.atan2(w.x - e.spawn.x, w.z - e.spawn.z));
    }

    setVisible(on) { this.group.visible = on; }

    // --- dragging --------------------------------------------------------
    // Panning the view along X. Two gestures, because a middle button does not
    // exist on a trackpad or a Magic Mouse:
    //   * middle-button drag anywhere
    //   * left-drag on empty space (nothing under the cursor to move)
    //
    // Bound on window in the capture phase, and to BOTH pointer and mouse
    // events, deliberately: a canvas-level listener only fires if the real
    // event hit-tests to the canvas, and some setups deliver a middle button
    // through the mouse events but not the pointer ones. Duplicate calls are
    // harmless — they set the same values.
    bindPan() {
        const onDown = ev => {
            // Kept for diagnosis: __pb.planner.lastPointer shows what arrived.
            this.lastPointer = {
                type: ev.type, button: ev.button, buttons: ev.buttons,
                target: ev.target?.id || ev.target?.tagName, planner: state.planner,
            };
            if (!state.planner) return;

            const middle = ev.button === 1 || (ev.buttons & 4);
            const left = ev.button === 0 || (ev.buttons & 1);
            // Left only pans when the press misses every handle, so dragging an
            // entity still wins over panning.
            const leftOnEmpty = left && !middle
                && ev.target === this.renderer.domElement
                && !this.pick(ev);
            if (!middle && !leftOnEmpty) return;

            // Remember which button has to stay down for the pan to continue.
            this.pan = { clientX: ev.clientX, fromX: state.plannerX, mask: middle ? 4 : 1 };
            if (middle) ev.preventDefault();   // and no Windows autoscroll
        };

        const onMove = ev => {
            if (!this.pan) return;
            if (!(ev.buttons & this.pan.mask)) { this.pan = null; return; }   // released
            // Orthographic, so world units per pixel is constant. A hidden or
            // not-yet-laid-out canvas reports 0 height, which would turn one
            // pixel into tens of world units.
            const h = this.renderer.domElement.clientHeight || 0;
            const perPixel = state.plannerHeight / Math.max(64, h);
            const dx = (ev.clientX - this.pan.clientX) * perPixel;
            state.plannerX = Math.min(RANGE.worldX[1],
                Math.max(RANGE.worldX[0], this.pan.fromX - dx));
        };

        const onUp = () => { this.pan = null; };

        for (const [down, move, up] of [['pointerdown', 'pointermove', 'pointerup'],
                                        ['mousedown', 'mousemove', 'mouseup']]) {
            addEventListener(down, onDown, true);
            addEventListener(move, onMove, true);
            addEventListener(up, onUp, true);
        }
        addEventListener('blur', onUp);
    }

    bindPointer(dom) {
        dom.addEventListener('pointerdown', ev => {
            if (!state.planner || !this.camera) return;
            if (ev.button !== 0) return;           // left button drags entities
            const hit = this.pick(ev);
            if (!hit) return;
            const { entity, part, index } = hit.object.userData;
            this.plan.select(entity.id);
            this.drag = { entity, part, index };
            dom.setPointerCapture(ev.pointerId);
            ev.preventDefault();
        });

        dom.addEventListener('pointermove', ev => {
            if (!this.drag || !this.camera) return;
            const p = this.worldAt(ev);
            if (!p) return;
            const { entity, part, index } = this.drag;
            const target = part === 'spawn' ? entity.spawn
                : part === 'trigger' ? entity.trigger
                : entity.waypoints[index];
            if (!target) return;
            target.x = +p.x.toFixed(2);
            target.z = +p.z.toFixed(2);
            this.plan.changed();
        });

        const end = ev => {
            if (!this.drag) return;
            this.drag = null;
            try { dom.releasePointerCapture?.(ev.pointerId); } catch { /* not captured */ }
        };
        dom.addEventListener('pointerup', end);
        dom.addEventListener('pointercancel', end);
    }

    // Handles are Groups now, so the ray has to go recursive and the hit walked
    // back up to whichever handle owns it.
    pick(ev) {
        const r = this.renderer.domElement.getBoundingClientRect();
        _ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
                 -((ev.clientY - r.top) / r.height) * 2 + 1);
        _ray.setFromCamera(_ndc, this.camera);
        const hit = _ray.intersectObjects(this.handles, true)[0];
        if (!hit) return null;
        for (let o = hit.object; o; o = o.parent) {
            if (o.userData?.entity) return { ...hit, object: o };
        }
        return null;
    }

    // Pointer position on the ground plane, for dragging.
    worldAt(ev) {
        const r = this.renderer.domElement.getBoundingClientRect();
        _ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
                 -((ev.clientY - r.top) / r.height) * 2 + 1);
        _ray.setFromCamera(_ndc, this.camera);
        return _ray.ray.intersectPlane(_plane, _pt) ? _pt : null;
    }
}
