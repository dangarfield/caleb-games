// The level surface: what is under a given point. Collision work belongs here too.
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

function visible(obj) {
    for (let o = obj; o; o = o.parent) if (o.visible === false) return false;
    return true;
}

export class Terrain {
    constructor() {
        this.root = null;
        // Only meshes classified as ridable ground. Before this the ray hit
        // mailboxes and house floors, so the boy climbed the scenery.
        this.meshes = null;
    }

    set(root, meshes = null) {
        this.root = root;
        this.meshes = meshes;
    }

    // Nearest surface below (x, z). Returns the raycast hit (point, object,
    // distance) or null. `from` is how far above to start the ray.
    surfaceAt(x, z, from = 30) {
        if (!this.root) return null;
        _origin.set(x, from, z);
        _ray.set(_origin, DOWN);
        _ray.near = 0;
        _ray.far = from + 50;
        // Three's raycaster does not skip hidden objects, so filter them out —
        // otherwise the hidden panorama plane counts as ground.
        const hits = this.meshes
            ? _ray.intersectObjects(this.meshes, false)
            : _ray.intersectObject(this.root, true);
        for (const hit of hits) {
            if (visible(hit.object)) return hit;
        }
        return null;
    }

    heightAt(x, z) {
        const hit = this.surfaceAt(x, z);
        return hit ? hit.point.y : null;
    }
}
