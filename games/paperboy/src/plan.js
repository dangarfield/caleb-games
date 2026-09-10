// The enemy plan: the placed entities, their movement, and persistence.
//
// A plan is a flat list of entities. Later these get grouped per level (7 days
// of the same level), so the shape here stays deliberately simple: one array
// that a level record can hold a copy of.
import { ENTITY_TYPES, SPAWN_Y } from './config.js';
import { readStore, writeStore } from './store.js';

let nextId = 1;

export function loadView() { return readStore().view || null; }

// Panning fires on every pointermove, so writing the view is debounced.
let viewTimer = null;
export function saveViewSoon(view) {
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => writeStore({ view }), 400);
}

export function saveViewNow(view) {
    clearTimeout(viewTimer);
    writeStore({ view });
}

export function makeEntity(type, x, z) {
    return {
        id: `e${nextId++}`,
        type,
        spawn: { x: +x.toFixed(2), y: SPAWN_Y, z: +z.toFixed(2) },
        dir: null,                            // degrees; null = face next waypoint
        // Movement starts when the player's X passes trigger.x. z is kept so the
        // trigger can be seen and dragged in the planner.
        trigger: { x: +(x - 20).toFixed(2), z: +z.toFixed(2) },
        repeat: false,
        waypoints: [],
    };
}

export class Plan {
    constructor() {
        this.entities = [];
        this.selectedId = null;
        this.onChange = null;      // set by the UI / 3D layer
    }

    changed() { this.save(); this.onChange?.(); }

    add(type, x, z) {
        const e = makeEntity(type, x, z);
        this.entities.push(e);
        this.selectedId = e.id;
        this.changed();
        return e;
    }

    remove(id) {
        this.entities = this.entities.filter(e => e.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        this.changed();
    }

    get(id) { return this.entities.find(e => e.id === id) || null; }
    get selected() { return this.get(this.selectedId); }

    select(id) { this.selectedId = id; this.onChange?.(); }

    addWaypoint(id) {
        const e = this.get(id);
        if (!e) return;
        const from = e.waypoints.at(-1) || e.spawn;
        e.waypoints.push({ x: +(from.x + 5).toFixed(2), z: +from.z.toFixed(2) });
        this.changed();
    }

    removeWaypoint(id, i) {
        const e = this.get(id);
        if (!e) return;
        e.waypoints.splice(i, 1);
        this.changed();
    }

    // --- persistence ---
    save() { writeStore({ plan: this.entities }); }

    load() {
        this.adopt(readStore().plan || []);
        return this;
    }

    // Take a list of entities from storage or a pasted file, dropping anything
    // whose type we no longer know about.
    adopt(list) {
        this.entities = list.filter(e => ENTITY_TYPES[e.type]).map(e => {
            // speed moved to the type table; drop it off older saved plans.
            const { speed, ...rest } = e;
            return {
                ...makeEntity(e.type, e.spawn?.x ?? 0, e.spawn?.z ?? 0),
                ...rest,
                spawn: { x: 0, y: SPAWN_Y, z: 0, ...e.spawn },
            };
        });
        for (const e of this.entities) {
            const n = Number(String(e.id).replace(/\D/g, ''));
            if (n >= nextId) nextId = n + 1;
        }
        this.selectedId = null;
        this.onChange?.();
    }

    toJSON() { return JSON.stringify({ plan: this.entities }, null, 2); }
}
