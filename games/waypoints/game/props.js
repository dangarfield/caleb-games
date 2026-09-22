// Waypoints — stand-ins, until the real models arrive.
//
// Every one of these is a handful of boxes and spheres with a flat colour. They
// are here so the MOMENTS can be built and felt — a bear appearing in a clearing,
// a box you kneel at, a kayak on the water — without waiting on artwork. Each is
// one small function returning a Group a metre or so tall, so swapping in a real
// model later means deleting a function and loading a file in its place.
//
// They are deliberately not clever. A rounded low-poly animal drawn in code is a
// worse bear than a bad model and a much worse use of an afternoon.

import * as THREE from 'three';

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
const ball = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(c));

const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };

/** A bear: heavy, dark, low to the ground. About 1.4 m at the shoulder. */
function bear() {
  const g = new THREE.Group();
  const fur = 0x3a2b22;
  g.add(put(box(0.75, 0.62, 1.30, fur), 0, 0.72, 0));
  g.add(put(ball(0.30, fur), 0, 0.92, 0.78));                 // head
  g.add(put(ball(0.09, fur), -0.17, 1.14, 0.74));             // ears
  g.add(put(ball(0.09, fur), 0.17, 1.14, 0.74));
  g.add(put(box(0.14, 0.12, 0.22, 0x1d1510), 0, 0.86, 1.02)); // muzzle
  for (const [x, z] of [[-0.26, 0.45], [0.26, 0.45], [-0.26, -0.45], [0.26, -0.45]]) {
    g.add(put(box(0.20, 0.44, 0.24, fur), x, 0.22, z));
  }
  return g;
}

/** A rabbit: small, pale, ears up. */
function rabbit() {
  const g = new THREE.Group();
  const fur = 0xbfae97;
  g.add(put(box(0.20, 0.20, 0.34, fur), 0, 0.20, 0));
  g.add(put(ball(0.11, fur), 0, 0.33, 0.20));
  g.add(put(box(0.05, 0.22, 0.02, fur), -0.05, 0.50, 0.19));  // ears
  g.add(put(box(0.05, 0.22, 0.02, fur), 0.05, 0.50, 0.19));
  g.add(put(ball(0.07, 0xf0ece4), 0, 0.20, -0.20));           // tail
  return g;
}

/** A bird: perched, wings folded. */
function bird() {
  const g = new THREE.Group();
  const feather = 0x2b3a4a;
  g.add(put(ball(0.13, feather), 0, 0.30, 0));
  const body = put(ball(0.11, feather), 0, 0.30, 0); body.scale.set(1, 0.9, 1.6);
  g.add(body);
  g.add(put(ball(0.09, feather), 0, 0.44, 0.13));             // head
  g.add(put(box(0.04, 0.04, 0.10, 0xd8a13a), 0, 0.44, 0.24)); // beak
  const tail = put(box(0.10, 0.03, 0.26, feather), 0, 0.30, -0.26);
  tail.rotation.x = 0.25; g.add(tail);
  for (const x of [-0.06, 0.06]) g.add(put(box(0.02, 0.14, 0.02, 0xd8a13a), x, 0.11, 0.02));
  return g;
}

/** A kayak: a hull and a paddle, on the water. */
function kayak() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 2.2, 4, 10), mat(0xd8663a));
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.55);
  g.add(put(hull, 0, 0.26, 0));
  g.add(put(box(0.46, 0.06, 0.62, 0x2b3a4a), 0, 0.42, 0));    // cockpit
  const pad = put(box(0.05, 0.05, 2.3, 0x39424c), 0, 0.72, 0);
  pad.rotation.y = 0.5; g.add(pad);
  for (const z of [-1.05, 1.05]) g.add(put(box(0.30, 0.04, 0.16, 0xe8ecef), 0, 0.72, z));
  return g;
}

/** A glider: a wing, a keel and a seat. */
function glider() {
  const g = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 3), mat(0xe8ecef));
  wing.rotation.x = -Math.PI / 2;
  wing.scale.set(1, 1, 0.22);
  g.add(put(wing, 0, 1.5, 0));
  g.add(put(box(0.08, 0.08, 3.2, 0x39424c), 0, 1.44, 0));
  g.add(put(box(0.36, 0.5, 0.5, 0xd8663a), 0, 1.05, 0.2));    // the pilot's seat
  return g;
}

/** The box of gear: a crate with a lid, sitting on the ground. */
function crate() {
  const g = new THREE.Group();
  g.add(put(box(0.86, 0.56, 0.64, 0x8a6a42), 0, 0.28, 0));
  const lid = put(box(0.92, 0.10, 0.70, 0x6f5233), 0, 0.60, -0.24);
  lid.rotation.x = -0.6; g.add(lid);                          // thrown open
  for (const x of [-0.44, 0.44]) g.add(put(box(0.04, 0.58, 0.66, 0x5d4529), x, 0.28, 0));
  g.add(put(box(0.90, 0.06, 0.66, 0xd8a13a), 0, 0.33, 0));    // a band round it
  return g;
}

const MAKERS = { bear, rabbit, bird, kayak, glider, crate };

/**
 * A prop, sized in metres and placed on the ground.
 *
 * The park is fifteen kilometres across and measured in cells, so everything
 * here is built at true metres and then scaled — a bear modelled in cell units
 * would be four hundred metres long, which is a bear nobody wants to meet.
 */
export function makeProp(kind, metresPerCell) {
  const make = MAKERS[kind];
  if (!make) return null;
  const g = make();
  g.scale.setScalar(1 / (metresPerCell || 2500));
  g.traverse((o) => { o.frustumCulled = false; });
  g.userData.prop = kind;
  return g;
}

export const PROPS = Object.keys(MAKERS);
