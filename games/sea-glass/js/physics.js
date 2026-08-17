// The cannon-es world for the combing pit: a hard static sand floor plus four
// invisible walls. Fixed timestep, clamped substeps, sleeping enabled — the
// whole perf plan rests on settled pebbles going to sleep and staying there.

import * as CANNON from 'cannon-es';
import { PIT } from './scene-beach.js';

export const FIXED_STEP = 1 / 60;
export const MAX_SUBSTEPS = 3;

export let world = null;
export let stoneMaterial = null;
export let groundMaterial = null;
export let wallMaterial = null;

export function createWorld() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 10;
  world.solver.tolerance = 0.002;
  world.allowSleep = true;

  groundMaterial = new CANNON.Material('sand');
  stoneMaterial = new CANNON.Material('stone');
  wallMaterial = new CANNON.Material('wall');

  // Hard, grippy sand: stones should stop dead rather than skitter about.
  // Soft, well-relaxed contacts: a dense sphere pile with stiff contacts pops
  // itself apart when a settled stone is put to sleep mid-overlap.
  const soft = { contactEquationStiffness: 4e6, contactEquationRelaxation: 4 };
  world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, stoneMaterial, {
    friction: 0.72, restitution: 0.0, ...soft,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(stoneMaterial, stoneMaterial, {
    friction: 0.52, restitution: 0.0, ...soft,
  }));
  // The walls, by contrast, are RIGID. A deep pile presses hard sideways, and a
  // soft wall contact let stones squeeze straight through and free-fall out of
  // the world. (pebbles.js also clamps positions, as a belt-and-braces measure.)
  world.addContactMaterial(new CANNON.ContactMaterial(wallMaterial, stoneMaterial, {
    friction: 0.28, restitution: 0.0,
    contactEquationStiffness: 1e8, contactEquationRelaxation: 3,
  }));
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0.0;
  world.defaultContactMaterial.contactEquationStiffness = 4e6;
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  // Floor as a thick box: a Plane is infinite and its SAP AABB is unhelpful.
  // Generously wide so that anything that does get out still lands on something.
  addStatic(0, -0.5, 0, PIT.w + 8, 1.0, PIT.d + 8, groundMaterial);

  // Invisible walls, sat just inside the border stones.
  const t = 0.4, h = PIT.wallH;
  addStatic(0, h / 2, -PIT.hd - t / 2, PIT.w + t * 2, h, t, wallMaterial);
  addStatic(0, h / 2, PIT.hd + t / 2, PIT.w + t * 2, h, t, wallMaterial);
  addStatic(-PIT.hw - t / 2, h / 2, 0, t, h, PIT.d + t * 2, wallMaterial);
  addStatic(PIT.hw + t / 2, h / 2, 0, t, h, PIT.d + t * 2, wallMaterial);

  return world;
}

function addStatic(x, y, z, w, h, d, mat) {
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    material: mat || groundMaterial,
  });
  body.position.set(x, y, z);
  world.addBody(body);
  return body;
}

/** Fixed-step advance. dt is clamped by the caller. */
export function step(dt) {
  if (world) world.step(FIXED_STEP, dt, MAX_SUBSTEPS);
}

/**
 * Run the sim forward without rendering, to settle a freshly built pile.
 * `perStep` runs after every step — that is where containment has to happen,
 * because this loop bypasses the frame loop entirely.
 */
export function prewarm(steps, perStep) {
  if (!world) return;
  const wasSleep = world.allowSleep;
  world.allowSleep = false;
  for (let i = 0; i < steps; i++) {
    world.step(FIXED_STEP);
    if (perStep) perStep();
  }
  world.allowSleep = wasSleep;
}

export function bodyCount() {
  return world ? world.bodies.length : 0;
}

export function awakeCount() {
  if (!world) return 0;
  let n = 0;
  for (const b of world.bodies) {
    if (b.type !== CANNON.Body.STATIC && b.sleepState !== CANNON.Body.SLEEPING) n++;
  }
  return n;
}

export function removeBody(body) {
  if (world && body) world.removeBody(body);
}
