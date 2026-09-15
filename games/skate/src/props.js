/* props.js — the things the goals are made of.
 *
 * The upstream project has one prop, a traffic cone, so barrels and the
 * S-K-A-T-E letters are built here out of primitives rather than imported. They
 * are deliberately blocky and flat-shaded to sit next to the original's
 * low-poly park instead of on top of it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ----------------------------------------------------------- gradients ---
 * A pickup painted one flat colour dies against a park that is mostly flat
 * colour too. Baking a ramp into the vertex colours costs nothing at runtime,
 * needs no texture, and gives every face a light end and a dark end — which is
 * what makes the thing look lit from somewhere rather than printed.
 *
 * @param {THREE.BufferGeometry} geo  gains a COLOR attribute, in place
 * @param {number} top     colour at the high end of the axis
 * @param {number} bottom  colour at the low end
 * @param {string} axis    'y' by default; 'x' runs it along the length
 */
function gradient(geo, top, bottom, axis = 'y') {
  const pos = geo.getAttribute('position');
  const a = { x: 0, y: 1, z: 2 }[axis];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getComponent(i, a);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = (hi - lo) || 1;
  const hot = new THREE.Color(top), cold = new THREE.Color(bottom), c = new THREE.Color();
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    /* eased, so the bright end holds a while before it falls away */
    const t = (pos.getComponent(i, a) - lo) / span;
    c.copy(cold).lerp(hot, t * t * (3 - 2 * t));
    out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

/* --------------------------------------------------------------- barrels */

/* one geometry each, reused by every barrel in every park — so they are marked
   shared and a level teardown steps over them */
const BARREL_BODY = new THREE.CylinderGeometry(0.34, 0.34, 0.92, 16, 1);
const BARREL_RING = new THREE.TorusGeometry(0.35, 0.035, 6, 18).rotateX(Math.PI / 2);
const BARREL_LID = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16);
for (const g of [BARREL_BODY, BARREL_RING, BARREL_LID]) g.userData.shared = true;

/* Two meshes, not five. A barrel was a body, two hoops and a lid, and eight of
   them in a park was forty draw calls for something the size of a bin — more
   than the whole level costs now. The hoops and the lid share a colour, so they
   share a geometry; the body keeps its own because it does not. */
const BARREL_TRIM = mergeGeometries([
  BARREL_RING.clone().translate(0, 0.28, 0),
  BARREL_RING.clone().translate(0, 0.64, 0),
  BARREL_LID.clone().translate(0, 0.93, 0)
]);
BARREL_TRIM.userData.shared = true;

export function makeBarrel(colour = 0xe4581d) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BARREL_BODY, new THREE.MeshStandardMaterial({
    color: colour, roughness: 0.6, metalness: 0.15
  }));
  body.position.y = 0.46;
  body.castShadow = false; body.receiveShadow = true;
  g.add(body);

  const trim = new THREE.Mesh(BARREL_TRIM, new THREE.MeshStandardMaterial({
    color: 0xe9e9ee, roughness: 0.45, metalness: 0.3
  }));
  trim.castShadow = false;
  g.add(trim);
  return g;
}

/* ---------------------------------------------------------- S K A T E ---
 * Blocky letters assembled from boxes: five bars is enough for every glyph in
 * the word, an angular K included, and it reads at a distance far better than
 * a thin extruded outline would.
 * Each entry is [cx, cy, w, h, rotation] in a 0.7 x 1.0 box centred on origin.
 */
const BAR = 0.155;
const GLYPH = {
  S: [
    [0, 0.42, 0.7, BAR, 0], [-0.27, 0.22, BAR, 0.42, 0], [0, 0, 0.7, BAR, 0],
    [0.27, -0.22, BAR, 0.42, 0], [0, -0.42, 0.7, BAR, 0]
  ],
  K: [
    [-0.27, 0, BAR, 1.0, 0], [0.08, 0.24, BAR, 0.62, -0.72], [0.08, -0.24, BAR, 0.62, 0.72]
  ],
  A: [
    [-0.27, -0.06, BAR, 0.88, 0], [0.27, -0.06, BAR, 0.88, 0],
    [0, 0.42, 0.7, BAR, 0], [0, 0.02, 0.7, BAR, 0]
  ],
  T: [
    [0, 0.42, 0.7, BAR, 0], [0, -0.08, BAR, 1.0, 0]
  ],
  E: [
    [-0.27, 0, BAR, 1.0, 0], [0.02, 0.42, 0.62, BAR, 0],
    [0, 0, 0.56, BAR, 0], [0.02, -0.42, 0.62, BAR, 0]
  ]
};

const LETTER_DEPTH = 0.17;

export function makeLetter(ch, colour = 0x2f7de0) {
  const spec = GLYPH[ch.toUpperCase()];
  const g = new THREE.Group();
  /* Polished, not painted: a pickup should catch the light and read from the
     other side of the park. The ramp goes from a pale sky at the top of the
     glyph down into a deep blue at its feet, which stops five identical
     letters looking like five identical letters. */
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.16, metalness: 0.35,
    emissive: new THREE.Color(colour).multiplyScalar(0.30)
  });
  /* the bars are one geometry — five boxes a letter, five letters a park, and
     every one of them was a draw call of its own */
  const bars = spec.map(([cx, cy, w, h, rot]) => {
    const box = new THREE.BoxGeometry(w, h, LETTER_DEPTH);
    if (rot) box.rotateZ(rot);
    return box.translate(cx, cy, 0);
  });
  const pale = new THREE.Color(colour).lerp(new THREE.Color(0xcdefff), 0.55);
  const deep = new THREE.Color(colour).multiplyScalar(0.42);
  const m = new THREE.Mesh(gradient(mergeGeometries(bars), pale, deep, 'y'), mat);
  m.castShadow = false;
  g.add(m);
  g.userData.letter = ch.toUpperCase();
  return g;
}


/* ------------------------------------------------------------ gold deck ---
 * The THPS2 career levels each hid five of something — pilot wings, hall
 * passes, subway tokens, spray cans, liberty bells. One shape for all five
 * parks is a better arcade than five one-offs nobody recognises, and a golden
 * deck is the one object every skater already wants. Built from primitives
 * like the barrels and the letters: the real thing is in the game's own item
 * file, which is not ours to ship.
 *
 * Proportions are a real deck — 1.6 long, 0.4 wide at 2x park scale — with the
 * nose and tail kicked up so it reads as a board and not a plank.
 */
const DECK_LEN = 1.5, DECK_W = 0.40, DECK_T = 0.06;

function deckGeometry() {
  /* The silhouette first, in plan: a long rounded lozenge pinched slightly at
     the waist, which is what makes a board look like a board and not a plank.
     Extruding that beats stacking boxes — one smooth outline, rounded ends,
     and the bevel gives the edge something to catch the light on. */
  const hl = DECK_LEN / 2, hw = DECK_W / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hl + 0.18, hw);
  shape.quadraticCurveTo(0, hw * 0.86, hl - 0.18, hw);
  shape.quadraticCurveTo(hl, hw, hl, 0);
  shape.quadraticCurveTo(hl, -hw, hl - 0.18, -hw);
  shape.quadraticCurveTo(0, -hw * 0.86, -hl + 0.18, -hw);
  shape.quadraticCurveTo(-hl, -hw, -hl, 0);
  shape.quadraticCurveTo(-hl, hw, -hl + 0.18, hw);

  const board = new THREE.ExtrudeGeometry(shape, {
    depth: DECK_T, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.014,
    bevelSegments: 2, curveSegments: 8
  });
  /* extrude builds in XY and grows along +Z; stand it up so the deck lies in
     the XZ plane with its thickness in Y, the way a board sits on the floor */
  board.rotateX(-Math.PI / 2).translate(0, -DECK_T / 2, 0);

  const parts = [board];
  for (const end of [1, -1]) {
    parts.push(new THREE.BoxGeometry(0.12, 0.1, DECK_W * 0.78)
      .translate(end * DECK_LEN * 0.29, -0.085, 0));
    for (const side of [1, -1]) {
      parts.push(new THREE.CylinderGeometry(0.08, 0.08, 0.075, 10)
        .rotateX(Math.PI / 2)
        .translate(end * DECK_LEN * 0.29, -0.125, side * DECK_W * 0.46));
    }
  }
  /* ExtrudeGeometry comes back non-indexed and the boxes and cylinders come
     back indexed; mergeGeometries refuses the mix, so flatten them all. */
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()));
  /* pale, almost-white gold along the nose falling to a deep amber at the
     tail — it is stood on end in the park, so the ramp runs top to bottom */
  gradient(g, 0xffdf6b, 0x8a4205, 'x');
  g.userData.shared = true;
  return g;
}

const DECK = deckGeometry();

export function makeDeck(colour = 0xffffff) {
  const g = new THREE.Group();
  /* Gold with nothing to reflect is just brown, and the park has no
     environment map — so this is mostly-metal with the shine carried by a
     strong emissive and a tight roughness rather than by reflections. */
  const m = new THREE.Mesh(DECK, new THREE.MeshStandardMaterial({
    color: colour, vertexColors: true, roughness: 0.16, metalness: 0.35,
    emissive: new THREE.Color(0xffb300).multiplyScalar(0.20)
  }));
  /* on its tail and turning, the way a pickup wants to be seen */
  m.rotation.z = Math.PI * 0.5;
  m.position.y = DECK_LEN * 0.25;
  m.castShadow = false;
  g.add(m);
  g.userData.deck = true;
  return g;
}

/* ------------------------------------------------------------- god rays ---
 * Four blue beams standing out of a pickup, turning slowly the other way to
 * the thing itself. The original marks its collectables this way and it is
 * what makes one readable from across a park: the item is small, the light
 * around it is not.
 *
 * Additive, unlit, depth-write off, and one shared geometry — four tapered
 * quads crossed through the centre, so from any angle at least two of them
 * are edge-on and two are broad, which is what gives the turn its flicker.
 */
const RAY_LEN = 2.4, RAY_W = 1.05;   /* half again on what it was */

const RAY = (() => {
  const quads = [];
  for (let i = 0; i < 4; i++) {   /* four, as the original has */
    /* a triangle fanning out from the middle: wide at the tip, pinched at the
       origin, so it looks like light leaving the object rather than a blade */
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, RAY_LEN, RAY_W * 0.5, 0, RAY_LEN, -RAY_W * 0.5, 0
    ], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 1, 1, 0], 2));
    geo.setIndex([0, 1, 2]);
    geo.rotateX(Math.PI / 2);
    geo.rotateY(i * Math.PI / 2);
    quads.push(geo);
  }
  const g = mergeGeometries(quads);
  g.userData.shared = true;
  return g;
})();

/* One texture for every ray in the game: bright at the root, gone by the tip,
   so the beam fades out instead of ending in a hard edge. */
const RAY_MAP = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.30, 'rgba(215,238,255,0.72)');
  grad.addColorStop(0.65, 'rgba(150,205,255,0.28)');
  grad.addColorStop(1, 'rgba(120,180,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 8);
  const t = new THREE.CanvasTexture(c);
  t.userData = { shared: true };
  return t;
})();

/**
 * @param {number} colour the beams' tint
 * @param {number} scale  how far they reach, 1 = 1.5 m
 */
export function makeRays(colour = 0x5ab6ff, scale = 1) {
  const m = new THREE.Mesh(RAY, new THREE.MeshBasicMaterial({
    color: colour, map: RAY_MAP, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  }));
  m.scale.setScalar(scale);
  m.renderOrder = 3;
  m.userData.rays = true;
  return m;
}

/* ------------------------------------------------------------ trick zone */

/**
 * A ring on the ground that says "do something here". THPS marks its objectives
 * on the level itself rather than on a minimap, and so does this.
 */
export function makeZoneRing(radius, colour = 0x6c5ce7) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.18, radius, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  );
  ring.position.y = 0.03;
  g.add(ring);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.18, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.13, side: THREE.DoubleSide })
  );
  inner.position.y = 0.025;
  g.add(inner);
  g.userData.ring = ring;
  return g;
}

/* ------------------------------------------------------------ ledge/box */

/** A skateable block: flat top, solid sides, and a grindable edge along it. */

