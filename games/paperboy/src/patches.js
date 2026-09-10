// Fixes for gaps in paper-level.glb, applied to the loaded scene at load time.
//
// These edit the level's own meshes rather than adding objects alongside them,
// so the patched geometry keeps the material, normals and lighting of what it
// continues. Each patch probes first and does nothing once the .blend covers
// the ground itself, so it retires quietly when the model is fixed.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const _ray = new THREE.Raycaster();

// The road slab stops dead at x 174.875, but section 2's houses run on to x 203
// and its pavement to x 212.25, with the dirt course picking up at 221.25 — so
// the last stretch of the second street has no tarmac under it at all. A stray
// lane-width sliver (z 1.5..2.0) is all that reaches beyond, out to x 193.6.
//
// Fix: pull the far edge of the road's last segment out to where the dirt
// starts and drop the sliver. Stretching the existing faces works because the
// slab is untextured and flat-shaded along its length — the extra road is the
// same faces as the road before it, so there is no seam and no material to match.
const ROAD = {
    endsAt: 174.875,        // world x of the slab's far edge
    extendTo: 221.25,       // world x where Cube.005 takes over
    probe: { x: 195, z: 6 },
    // The slab's top is cut into bands along z. One of them, the gutter strip
    // at z 0..1, is notched out every so often to seat a drain — and the last
    // 2 units of road (172.875..174.875) is one of those notches, for Drain_6.
    // So the gutter has nothing to stretch: clone its last full segment into
    // the new stretch instead, leaving the drain's hole where it is.
    gutter: { z0: 0, z1: 1, endsAt: 172.875 },
    surfaceY: -0.001,
    eps: 0.01,
};

// Junction paint. Each crossing carries the same five yellow markings — two
// bars across the mouth and three dashes down the side road — as a
// "road-line-1a..1e" set centred on the crossing. Section 2's far junction, the
// one that leads onto the dirt course, never got a set. Clone the last one along
// to it rather than modelling new bars, so the paint is identical.
const PAINT = {
    centre: 216.75,       // midway between the pavement slabs at that junction
    prefix: 'road-line',
    // Nothing painted beyond here means the junction is still bare.
    bareBeyond: 200,
};

// A red 1.75m dummy stood next to the pavement at x -221 as a size reference
// while the level was modelled. It is already excluded from collisions by
// ROLE_RULES; this takes it out of the picture as well.
const SCALE_DUMMY = /^ScaleHuman/;

function findMesh(root, name) {
    let found = null;
    root.traverse(o => {
        if (!found && o.isMesh && (o.name === name || o.name.replace(/_\d+$/, '') === name)) found = o;
    });
    return found;
}

// Is there any surface under this point? Straight down, against one mesh only,
// so nothing else in the scene can mask the hole.
function hits(mesh, x, z) {
    _ray.set(new THREE.Vector3(x, 20, z), DOWN);
    _ray.near = 0;
    _ray.far = 60;
    return _ray.intersectObject(mesh, true).length > 0;
}

// Pull a mesh's triangles out into plain arrays so they can be edited and added
// to independently. Non-indexed — the slab is a few hundred faces, so the
// duplicated vertices cost nothing.
function readTriangles(geometry) {
    const src = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = src.getAttribute('position');
    const nor = src.getAttribute('normal');
    const out = [];
    for (let t = 0; t < pos.count; t += 3) {
        const tri = { p: [], n: [] };
        for (let k = 0; k < 3; k++) {
            // fromBufferAttribute decodes normalised integers; getX would hand
            // back the raw int, which in the packed level is a -127..127 normal.
            tri.p.push(new THREE.Vector3().fromBufferAttribute(pos, t + k));
            tri.n.push(nor ? new THREE.Vector3().fromBufferAttribute(nor, t + k) : null);
        }
        out.push(tri);
    }
    if (src !== geometry) src.dispose();
    return { tris: out, hasNormals: !!nor };
}

function writeTriangles(mesh, tris, hasNormals) {
    const p = [];
    const n = [];
    for (const tri of tris) {
        for (let k = 0; k < 3; k++) {
            p.push(tri.p[k].x, tri.p[k].y, tri.p[k].z);
            if (hasNormals) n.push(tri.n[k].x, tri.n[k].y, tri.n[k].z);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    if (hasNormals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = geo;
}

function extendRoad(root) {
    const road = findMesh(root, 'Road');
    if (!road) return null;
    if (hits(road, ROAD.probe.x, ROAD.probe.z)) return null;   // modelled after all

    // Work in the mesh's own space. Its node sits at x 89, and in the packed
    // level that space is scaled too (quantised attributes carry a node scale),
    // so the tolerance has to be converted along with the coordinates rather
    // than assumed to be in world units.
    road.updateWorldMatrix(true, false);
    const toLocal = new THREE.Matrix4().copy(road.matrixWorld).invert();
    const localX = wx => new THREE.Vector3(wx, 0, 0).applyMatrix4(toLocal).x;
    const localZ = wz => new THREE.Vector3(0, 0, wz).applyMatrix4(toLocal).z;
    const scale = Math.abs(localX(1) - localX(0)) || 1;   // local units per world unit
    const eps = ROAD.eps * scale;
    const end = localX(ROAD.endsAt);
    const target = localX(ROAD.extendTo);
    const gutterEnd = localX(ROAD.gutter.endsAt);
    const y = new THREE.Vector3(0, ROAD.surfaceY, 0).applyMatrix4(toLocal).y;
    const gz0 = localZ(ROAD.gutter.z0);
    const gz1 = localZ(ROAD.gutter.z1);
    const yEps = eps;   // the surface test is in the same space
    const { tris, hasNormals } = readTriangles(road.geometry);

    const kept = [];
    const added = [];
    let dropped = 0;
    for (const tri of tris) {
        const xs = tri.p.map(v => v.x);
        const min = Math.min(...xs);
        const max = Math.max(...xs);
        // Anything living entirely past the end is the leftover sliver.
        if (min > end - eps && max > end + eps) { dropped++; continue; }

        // The gutter band's last full segment gets copied into the stretch,
        // squeezed to sit between the drain notch and the new end.
        const zs = tri.p.map(v => v.z);
        const inGutter = tri.p.every(v => v.y > y - yEps && v.y < y + yEps)
            && Math.min(...zs) > gz0 - eps
            && Math.max(...zs) < gz1 + eps;
        if (inGutter && Math.abs(max - gutterEnd) < eps && min < gutterEnd - eps) {
            const copy = {
                p: tri.p.map(v => v.clone()),
                n: tri.n.map(v => (v ? v.clone() : null)),
            };
            for (const v of copy.p) v.x = Math.abs(v.x - max) < eps ? target : end;
            added.push(copy);
        }

        // Everything on the end edge — top faces, underside, side walls and the
        // end cap — moves out together, which stretches the last segment.
        for (const v of tri.p) if (v.x > end - eps) v.x = target;
        kept.push(tri);
    }

    writeTriangles(road, kept.concat(added), hasNormals);
    return { dropped, added: added.length };
}

function paintJunction(root) {
    const lines = [];
    root.traverse(o => { if (o.isMesh && o.name.startsWith(PAINT.prefix)) lines.push(o); });
    if (!lines.length) return null;

    const box = new THREE.Box3();
    if (lines.some(o => box.setFromObject(o).min.x > PAINT.bareBeyond)) return null;   // already painted

    // The set nearest the course is the one to copy: group by centre x and take
    // the largest. They are flat quads, so a box centre is exact enough.
    let source = [];
    let sourceX = -Infinity;
    const centres = new Map();
    for (const o of lines) {
        const cx = +box.setFromObject(o).getCenter(new THREE.Vector3()).x.toFixed(2);
        // Bars and dashes of one set share a centre only in x, so bucket loosely.
        const key = Math.round(cx / 4);
        if (!centres.has(key)) centres.set(key, []);
        centres.get(key).push(o);
    }
    for (const [key, set] of centres) {
        if (key * 4 > sourceX) { sourceX = key * 4; source = set; }
    }
    if (!source.length) return null;

    box.makeEmpty();
    for (const o of source) box.union(new THREE.Box3().setFromObject(o));
    const delta = PAINT.centre - box.getCenter(new THREE.Vector3()).x;

    let n = 0;
    for (const o of source) {
        const copy = o.clone();
        copy.name = `${PAINT.prefix}-junction-4-${n++}`;   // still ignored by ROLE_RULES
        copy.position.x += delta;
        (o.parent || root).add(copy);
    }
    return { count: n, delta: +delta.toFixed(2) };
}

function hideScaleDummy(root) {
    let n = 0;
    root.traverse(o => {
        if (o.isMesh && SCALE_DUMMY.test(o.name) && o.visible) { o.visible = false; n++; }
    });
    return n ? { count: n } : null;
}

// Call once the level is in the scene and before anything indexes it, so the
// patched geometry is what the collider and terrain raycasts see.
export function patchLevel(root) {
    const applied = [];
    const road = extendRoad(root);
    if (road) {
        applied.push(`road stretched to x ${ROAD.extendTo}`
            + ` (${road.dropped} stray faces dropped, ${road.added} gutter faces added)`);
    }
    const paint = paintJunction(root);
    if (paint) applied.push(`junction paint copied to x ${PAINT.centre} (${paint.count} markings)`);
    const dummy = hideScaleDummy(root);
    if (dummy) applied.push(`scale dummy hidden (${dummy.count} mesh)`);
    if (applied.length) console.log('Level patches applied:', applied.join(', '));
    return applied;
}
