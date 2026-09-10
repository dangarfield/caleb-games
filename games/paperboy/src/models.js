// Procedural low-poly models for the placed entities.
//
// Every model is authored FACING +Z, because enemies.js sets rotation.y from
// atan2(dx, dz) — the same convention the boy uses (he faces +X at yaw 90).
//
// Anything that moves is a pivot Group with the visual mesh as its child, so
// the animation only ever touches one axis and never fights the mesh's own
// orientation. Pivots are collected into userData.parts:
//   wheels — rotated about X by distance travelled / radius
//   legs   — swung about X on a sine, offset by each pivot's own phase
//   judder — vibrated vertically on the clock (the jackhammer)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const mat = (c, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
const shade = (c, f) => new THREE.Color(c).multiplyScalar(f).getHex();

const SKIN = 0xf2c8a0;
const TYRE = 0x1c1c1e;
const METAL = 0x9fa8ad;

function box(w, h, d, m, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    return mesh;
}

function cyl(r, h, m, seg = 12) {
    return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
}

// A wheel: axle along X, so rolling forward is a rotation about X.
function wheel(parts, r, width, x, y, z, m = mat(TYRE, 0.9)) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const w = cyl(r, width, m);
    w.rotation.z = Math.PI / 2;
    pivot.add(w);
    pivot.userData.radius = r;
    parts.wheels.push(pivot);
    return pivot;
}

// A limb hanging from a hip/shoulder at (x, y, z).
function limb(parts, m, w, h, d, x, y, z, phase, swing = 0.5) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(box(w, h, d, m, 0, -h / 2, 0));
    pivot.userData.phase = phase;
    pivot.userData.swing = swing;
    parts.legs.push(pivot);
    return pivot;
}

function group(parts) {
    const g = new THREE.Group();
    g.userData.parts = parts;
    return g;
}

// --- builders ------------------------------------------------------------

// Quadruped. Length along Z, four swinging legs, tail.
function buildDog(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const body = mat(colour);
    const dark = mat(shade(colour, 0.75));
    g.add(box(0.30, 0.28, 0.72, body, 0, 0.40, 0));      // torso
    g.add(box(0.24, 0.24, 0.24, body, 0, 0.52, 0.42));   // head
    g.add(box(0.10, 0.08, 0.16, dark, 0, 0.46, 0.56));   // muzzle
    g.add(box(0.06, 0.12, 0.04, dark, -0.09, 0.66, 0.40));
    g.add(box(0.06, 0.12, 0.04, dark, 0.09, 0.66, 0.40));
    const tail = new THREE.Group();
    tail.position.set(0, 0.50, -0.36);
    tail.add(box(0.05, 0.05, 0.22, dark, 0, 0, -0.11));
    tail.userData.phase = 0;
    tail.userData.swing = 0.35;
    parts.legs.push(tail);                                // wags with the gait
    g.add(tail);
    const legM = mat(shade(colour, 0.85));
    for (const [x, z, ph] of [[-0.11, 0.26, 0], [0.11, 0.26, Math.PI],
                              [-0.11, -0.26, Math.PI], [0.11, -0.26, 0]]) {
        g.add(limb(parts, legM, 0.07, 0.26, 0.07, x, 0.28, z, ph, 0.45));
    }
    return g;
}

// Saloon car. Length along Z, four wheels.
function buildCar(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const body = mat(colour, 0.5);
    const glass = mat(0x9fd3e8, 0.25);
    g.add(box(1.80, 0.55, 4.20, body, 0, 0.62, 0));       // hull
    g.add(box(1.55, 0.45, 2.00, body, 0, 1.05, -0.20));   // cabin
    g.add(box(1.45, 0.30, 0.06, glass, 0, 1.08, 0.79));   // windscreen
    g.add(box(1.45, 0.30, 0.06, glass, 0, 1.08, -1.20));
    g.add(box(0.30, 0.16, 0.08, mat(0xfff3c4, 0.3), -0.62, 0.60, 2.08));
    g.add(box(0.30, 0.16, 0.08, mat(0xfff3c4, 0.3), 0.62, 0.60, 2.08));
    for (const [x, z] of [[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.35], [0.86, -1.35]]) {
        g.add(wheel(parts, 0.34, 0.24, x, 0.34, z));
    }
    return g;
}

// Upright person. swing sets how hard the limbs move.
function buildPerson(colour, { height = 1.75, swing = 0.55, hat = false } = {}) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const shirt = mat(colour);
    const trousers = mat(shade(colour, 0.6));
    const legLen = height * 0.45;
    const torsoH = height * 0.34;
    const torsoY = legLen + torsoH / 2;
    g.add(box(0.38, torsoH, 0.22, shirt, 0, torsoY, 0));
    g.add(box(0.22, 0.22, 0.22, mat(SKIN), 0, torsoY + torsoH / 2 + 0.11, 0));
    if (hat) g.add(box(0.26, 0.06, 0.26, mat(shade(colour, 1.2)), 0, torsoY + torsoH / 2 + 0.25, 0));
    g.add(limb(parts, trousers, 0.12, legLen, 0.14, -0.10, legLen, 0, 0, swing));
    g.add(limb(parts, trousers, 0.12, legLen, 0.14, 0.10, legLen, 0, Math.PI, swing));
    const armY = torsoY + torsoH / 2 - 0.04;
    g.add(limb(parts, shirt, 0.09, height * 0.30, 0.10, -0.23, armY, 0, Math.PI, swing * 0.8));
    g.add(limb(parts, shirt, 0.09, height * 0.30, 0.10, 0.23, armY, 0, 0, swing * 0.8));
    return g;
}

// Workman leaning on a breaker. Judders instead of walking.
function buildJackhammer(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const shirt = mat(colour);
    const rig = new THREE.Group();
    rig.add(box(0.38, 0.60, 0.24, shirt, 0, 1.20, 0));
    rig.add(box(0.22, 0.22, 0.22, mat(SKIN), 0, 1.61, 0));
    rig.add(box(0.26, 0.08, 0.26, mat(0xffd32a, 0.4), 0, 1.75, 0));   // hard hat
    rig.add(box(0.12, 0.80, 0.14, mat(shade(colour, 0.6)), -0.10, 0.40, 0));
    rig.add(box(0.12, 0.80, 0.14, mat(shade(colour, 0.6)), 0.10, 0.40, 0));
    rig.add(box(0.09, 0.50, 0.10, shirt, -0.22, 1.30, 0.14));
    rig.add(box(0.09, 0.50, 0.10, shirt, 0.22, 1.30, 0.14));
    rig.add(box(0.14, 1.00, 0.14, mat(METAL, 0.4), 0, 0.55, 0.28));   // breaker
    rig.add(box(0.08, 0.30, 0.08, mat(0x555b60, 0.5), 0, 0.10, 0.28));
    rig.userData.baseY = 0;
    parts.judder.push(rig);
    g.add(rig);
    return g;
}

// Small four-wheeled toy.
function buildRcCar(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    g.add(box(0.30, 0.10, 0.45, mat(colour, 0.45), 0, 0.14, 0));
    g.add(box(0.20, 0.07, 0.16, mat(shade(colour, 1.3), 0.3), 0, 0.22, -0.04));
    for (const [x, z] of [[-0.16, 0.15], [0.16, 0.15], [-0.16, -0.15], [0.16, -0.15]]) {
        g.add(wheel(parts, 0.09, 0.06, x, 0.09, z));
    }
    return g;
}

// Boy sitting cross-legged with a controller.
function buildRcBoy(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const shirt = mat(colour);
    g.add(box(0.36, 0.40, 0.24, shirt, 0, 0.42, 0));
    g.add(box(0.20, 0.20, 0.20, mat(SKIN), 0, 0.72, 0));
    g.add(box(0.34, 0.14, 0.20, mat(shade(colour, 0.6)), 0, 0.15, 0.10));  // folded legs
    g.add(box(0.12, 0.12, 0.34, mat(shade(colour, 0.6)), -0.12, 0.10, 0.22));
    g.add(box(0.12, 0.12, 0.34, mat(shade(colour, 0.6)), 0.12, 0.10, 0.22));
    g.add(box(0.08, 0.26, 0.09, shirt, -0.20, 0.46, 0.10));
    g.add(box(0.08, 0.26, 0.09, shirt, 0.20, 0.46, 0.10));
    g.add(box(0.20, 0.06, 0.12, mat(0x2f3640, 0.4), 0, 0.42, 0.22));       // controller
    g.add(box(0.02, 0.16, 0.02, mat(METAL, 0.3), 0.07, 0.52, 0.22));       // aerial
    return g;
}

// A tyre on its edge: the whole body is the wheel.
function buildTire(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.35, 0);                  // torus outer radius = 0.26 + 0.09
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 8, 16), mat(colour, 0.9));
    // A torus is built in the XY plane, so its axle points along Z — that made
    // it roll sideways. Turn the axle to X, which is what rolling forward
    // (+Z, the way every model faces) needs.
    t.rotation.y = Math.PI / 2;
    pivot.add(t);
    const hub = cyl(0.10, 0.10, mat(METAL, 0.5));
    hub.rotation.z = Math.PI / 2;                    // axle along X, like the tyre
    pivot.add(hub);
    pivot.userData.radius = 0.35;
    parts.wheels.push(pivot);
    g.add(pivot);
    return g;
}

// Push mower: deck, handle, four small wheels, engine hum.
function buildLawnmower(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const body = mat(colour, 0.6);
    const deck = new THREE.Group();
    deck.add(box(0.60, 0.22, 0.50, body, 0, 0.22, 0));
    deck.add(box(0.26, 0.18, 0.24, mat(shade(colour, 0.6), 0.5), 0, 0.40, -0.02));
    deck.userData.baseY = 0;
    parts.judder.push(deck);                          // engine vibration
    g.add(deck);
    g.add(box(0.05, 0.05, 0.55, mat(METAL, 0.4), -0.24, 0.55, -0.30));
    g.add(box(0.05, 0.05, 0.55, mat(METAL, 0.4), 0.24, 0.55, -0.30));
    g.add(box(0.50, 0.05, 0.05, mat(METAL, 0.4), 0, 0.78, -0.55));
    for (const [x, z, r] of [[-0.28, 0.20, 0.10], [0.28, 0.20, 0.10],
                             [-0.28, -0.20, 0.13], [0.28, -0.20, 0.13]]) {
        g.add(wheel(parts, r, 0.06, x, r, z));
    }
    return g;
}

// Barrow: tray, single front wheel, two handles and two feet.
function buildWheelbarrow(colour, fallen = false) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const body = mat(colour, 0.6);
    const frame = new THREE.Group();
    frame.add(box(0.58, 0.28, 0.80, body, 0, 0.42, 0.05));            // tray
    frame.add(box(0.05, 0.05, 0.60, mat(METAL, 0.4), -0.24, 0.26, -0.45));
    frame.add(box(0.05, 0.05, 0.60, mat(METAL, 0.4), 0.24, 0.26, -0.45));
    frame.add(box(0.06, 0.22, 0.06, mat(METAL, 0.4), -0.22, 0.12, -0.28));
    frame.add(box(0.06, 0.22, 0.06, mat(METAL, 0.4), 0.22, 0.12, -0.28));
    g.add(frame);
    if (fallen) {
        // Tipped onto its side: nothing turns, and the wheel is off the ground.
        // Tipped over, then lifted so the tray rests on the road rather than
        // sinking through it.
        frame.rotation.z = Math.PI / 2.1;
        frame.position.set(0.18, 0.30, 0);
        const w = cyl(0.18, 0.08, mat(TYRE, 0.9));
        w.rotation.x = Math.PI / 2;
        w.position.set(-0.26, 0.18, 0.52);
        g.add(w);
    } else {
        g.add(wheel(parts, 0.18, 0.08, 0, 0.18, 0.52));
    }
    return g;
}

// Boombox with two cones.
function buildStereo(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    g.add(box(0.66, 0.32, 0.22, mat(colour, 0.6), 0, 0.20, 0));
    for (const x of [-0.19, 0.19]) {
        const c = cyl(0.10, 0.04, mat(0x2f3640, 0.7), 14);
        c.rotation.x = Math.PI / 2;
        c.position.set(x, 0.20, 0.12);
        g.add(c);
    }
    g.add(box(0.20, 0.10, 0.04, mat(0x1a1a1a, 0.5), 0, 0.20, 0.12));
    g.add(box(0.40, 0.04, 0.04, mat(METAL, 0.4), 0, 0.38, 0));        // handle
    return g;
}

// Kid on a trike: two rear wheels, one front, pedalling legs.
function buildTrike(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const frame = mat(colour, 0.5);
    g.add(box(0.14, 0.08, 0.60, frame, 0, 0.34, 0));
    g.add(box(0.30, 0.06, 0.20, frame, 0, 0.42, -0.20));              // seat
    g.add(box(0.36, 0.04, 0.04, mat(METAL, 0.4), 0, 0.62, 0.24));     // bars
    const shirt = mat(shade(colour, 1.15));
    g.add(box(0.28, 0.34, 0.20, shirt, 0, 0.62, -0.18));
    g.add(box(0.19, 0.19, 0.19, mat(SKIN), 0, 0.86, -0.18));
    g.add(limb(parts, mat(shade(colour, 0.6)), 0.09, 0.30, 0.10, -0.10, 0.48, -0.04, 0, 0.6));
    g.add(limb(parts, mat(shade(colour, 0.6)), 0.09, 0.30, 0.10, 0.10, 0.48, -0.04, Math.PI, 0.6));
    g.add(wheel(parts, 0.20, 0.07, 0, 0.20, 0.34));
    g.add(wheel(parts, 0.14, 0.06, -0.22, 0.14, -0.30));
    g.add(wheel(parts, 0.14, 0.06, 0.22, 0.14, -0.30));
    return g;
}

// Unicyclist: one big wheel, pedalling legs, arms out for balance.
function buildUnicyclist(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const shirt = mat(colour);
    g.add(wheel(parts, 0.34, 0.07, 0, 0.34, 0));
    g.add(box(0.06, 0.58, 0.06, mat(METAL, 0.4), 0, 0.72, 0));        // seat post
    g.add(box(0.24, 0.06, 0.18, mat(0x2f3640, 0.6), 0, 1.04, 0));     // saddle
    g.add(box(0.34, 0.46, 0.20, shirt, 0, 1.32, 0));
    g.add(box(0.20, 0.20, 0.20, mat(SKIN), 0, 1.65, 0));
    g.add(limb(parts, shirt, 0.08, 0.36, 0.09, -0.24, 1.50, 0, Math.PI, 0.35));
    g.add(limb(parts, shirt, 0.08, 0.36, 0.09, 0.24, 1.50, 0, 0, 0.35));
    g.add(limb(parts, mat(shade(colour, 0.6)), 0.09, 0.40, 0.10, -0.11, 1.06, 0, 0, 0.7));
    g.add(limb(parts, mat(shade(colour, 0.6)), 0.09, 0.40, 0.10, 0.11, 1.06, 0, Math.PI, 0.7));
    return g;
}

// A bundle of papers.
function buildPapers(colour) {
    const parts = { wheels: [], legs: [], judder: [] };
    const g = group(parts);
    const paper = mat(0xf2efe4, 0.9);
    g.add(box(0.42, 0.10, 0.30, paper, 0, 0.05, 0));
    g.add(box(0.38, 0.08, 0.26, paper, 0.02, 0.14, 0.02));
    g.add(box(0.34, 0.06, 0.24, paper, -0.02, 0.21, -0.02));
    g.add(box(0.06, 0.24, 0.32, mat(colour, 0.6), 0, 0.12, 0));       // band
    return g;
}

const BUILDERS = {
    dog: s => buildDog(s.colour),
    dog2: s => buildDog(s.colour),
    car: s => buildCar(s.colour),
    car2: s => buildCar(s.colour),
    runningMan: s => buildPerson(s.colour, { height: 1.75, swing: 0.65 }),
    pedestrian: s => buildPerson(s.colour, { height: 1.70, swing: 0.32, hat: true }),
    jackhammer: s => buildJackhammer(s.colour),
    rcCar: s => buildRcCar(s.colour),
    rcBoy: s => buildRcBoy(s.colour),
    tire: s => buildTire(s.colour),
    lawnmower: s => buildLawnmower(s.colour),
    wheelbarrow: s => buildWheelbarrow(s.colour, false),
    barrowDown: s => buildWheelbarrow(s.colour, true),
    stereo: s => buildStereo(s.colour),
    trike: s => buildTrike(s.colour),
    unicyclist: s => buildUnicyclist(s.colour),
    papers: s => buildPapers(s.colour),
};

// One material for every merged model in the game: the colours ride along in
// the geometry as vertex colours, so 80 obstacles share one material and one
// shader state instead of one each.
const MERGED_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

// Fold everything that does not move into a single mesh.
//
// A model is a dozen small boxes, and each one was its own draw call — 80
// obstacles on Sunday came to hundreds. The boxes that never move relative to
// the body are baked into one vertex-coloured geometry; each animated pivot
// (wheels, legs, judder) is merged the same way but kept separate, because it
// has to keep turning on its own.
function mergeGroup(target, parent = target) {
    const geos = [];
    const kill = [];
    target.updateMatrixWorld(true);
    target.traverse(o => {
        if (!o.isMesh) return;
        // A mesh under a nested pivot belongs to that pivot, not to this group.
        for (let p = o.parent; p && p !== target; p = p.parent) if (p.userData.isPivot) return;
        const geo = o.geometry.clone();
        // Into the group's own space.
        geo.applyMatrix4(target.matrixWorld.clone().invert().multiply(o.matrixWorld));
        const colour = new THREE.Color().copy(o.material.color);
        const count = geo.getAttribute('position').count;
        const rgb = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) rgb.set([colour.r, colour.g, colour.b], i * 3);
        geo.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
        for (const attr of Object.keys(geo.attributes)) {
            if (attr !== 'position' && attr !== 'normal' && attr !== 'color') geo.deleteAttribute(attr);
        }
        geos.push(geo);
        kill.push(o);
    });
    if (geos.length < 2) {
        for (const g of geos) g.dispose();
        return null;
    }
    for (const o of kill) {
        o.removeFromParent();
        o.geometry.dispose();
    }
    const merged = new THREE.Mesh(mergeGeometries(geos, false), MERGED_MATERIAL);
    for (const g of geos) g.dispose();
    merged.castShadow = true;
    merged.receiveShadow = true;
    target.add(merged);
    return merged;
}

function mergeModel(root) {
    const parts = root.userData.parts || {};
    const pivots = [...(parts.wheels || []), ...(parts.legs || []), ...(parts.judder || [])];
    for (const p of pivots) p.userData.isPivot = true;
    for (const p of pivots) mergeGroup(p);
    mergeGroup(root);
    return root;
}

// Build a model for a type. Falls back to a plain coloured box so a new type
// works before it has a builder.
export function buildModel(type, spec) {
    const make = BUILDERS[type];
    const g = make ? make(spec) : (() => {
        const parts = { wheels: [], legs: [], judder: [] };
        const f = group(parts);
        f.add(box(...spec.size, mat(spec.colour), 0, spec.size[1] / 2, 0));
        return f;
    })();
    // Variants share a builder (both dogs, both cars), so a scale keeps their
    // silhouettes apart.
    if (spec.modelScale) g.scale.setScalar(spec.modelScale);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return mergeModel(g);
}

// Advance a model's animation. `travelled` is metres moved since the last call,
// `time` is a running clock for things that move while standing still.
export function animateModel(model, travelled, time) {
    const parts = model.userData.parts;
    if (!parts) return;
    for (const w of parts.wheels) w.rotation.x += travelled / w.userData.radius;
    if (parts.legs.length) {
        // Gait is driven by distance, so it stays in step with the speed and
        // stops dead when the thing stops.
        const phase = model.userData.gait = (model.userData.gait || 0) + travelled * 2.6;
        for (const l of parts.legs) {
            l.rotation.x = Math.sin(phase + l.userData.phase) * l.userData.swing;
        }
    }
    for (const j of parts.judder) {
        j.position.y = j.userData.baseY + Math.sin(time * 46) * 0.012;
        j.rotation.z = Math.sin(time * 39) * 0.01;
    }
}

export function disposeModel(model) {
    model.traverse(o => {
        o.geometry?.dispose();
        // MERGED_MATERIAL is shared by every merged model, so it stays.
        if (o.material === MERGED_MATERIAL) return;
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material?.dispose?.();
    });
}
