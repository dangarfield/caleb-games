// Fish. Bought once in the shop ("See The Fish"), after which they swim about
// under the surface — and every so often one leaps and swallows a stone in
// mid-flight, which is the single silliest thing in the game.
//
// Cheap on purpose: two InstancedMeshes (bodies + tails) share one transform per
// fish, so the whole shoal is 2 draw calls plus 2 for the leaping fish.

import * as THREE from 'three';
import { TAU, clamp, mulberry32 } from '../util.js';
import { LAKE, lakeRadius } from './layout.js';
import { depthAt } from './heightfield.js';

const COUNT = 18;
const COLORS = [0xff9b54, 0xf2c14e, 0x8ecae6, 0xb08bbb, 0xe07a5f, 0x7fb069];

export function createFish(scene) {
  const group = new THREE.Group();
  group.name = 'fish';
  group.visible = false;                 // until the unlock is bought
  scene.add(group);

  const rnd = mulberry32(90210);

  // A fish points down +x. Body and tail are separate instanced meshes sharing
  // the same per-fish matrix, with the tail offset baked into its geometry.
  const bodyGeo = new THREE.SphereGeometry(1, 7, 5);
  bodyGeo.scale(0.62, 0.3, 0.22);
  const tailGeo = new THREE.ConeGeometry(0.26, 0.42, 4);
  tailGeo.rotateZ(Math.PI / 2);
  tailGeo.translate(-0.74, 0, 0);

  const mat = () => new THREE.MeshLambertMaterial({
    color: 0xffffff, flatShading: true,
    // Drawn AFTER the lake surface (which no longer writes depth) so the fish
    // read as shapes under the water instead of being painted over by it.
    transparent: true, opacity: 0.62, depthWrite: false,
  });
  const bodyMat = mat(), tailMat = mat();

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, COUNT);
  const tails = new THREE.InstancedMesh(tailGeo, tailMat, COUNT);
  for (const m of [bodies, tails]) {
    m.frustumCulled = false;
    m.renderOrder = 2;
    group.add(m);
  }

  const fish = [];
  for (let i = 0; i < COUNT; i++) {
    const p = randomSpot(rnd);
    fish.push({
      x: p.x, z: p.z, y: -0.5 - rnd() * 0.9,
      dir: rnd() * TAU, speed: 0.9 + rnd() * 1.1,
      size: 0.7 + rnd() * 0.9, turn: 0, phase: rnd() * TAU,
      colour: new THREE.Color(COLORS[i % COLORS.length]),
    });
    bodies.setColorAt(i, fish[i].colour);
    tails.setColorAt(i, fish[i].colour);
  }
  bodies.instanceColor.needsUpdate = true;
  tails.instanceColor.needsUpdate = true;

  function randomSpot(r) {
    for (let tries = 0; tries < 40; tries++) {
      const a = r() * TAU;
      const rad = lakeRadius(a) * (0.15 + r() * 0.8);
      const x = LAKE.cx + Math.cos(a) * rad, z = LAKE.cz + Math.sin(a) * rad;
      const d = depthAt(x, z);
      if (d > 1.4 && d < 8) return { x, z };
    }
    return { x: LAKE.cx, z: LAKE.cz };
  }

  // ---- the leaping fish (one at a time) -----------------------------------
  const leaper = new THREE.Group();
  leaper.visible = false;
  const leapBody = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xff9b54, flatShading: true }));
  const leapTail = new THREE.Mesh(tailGeo, new THREE.MeshLambertMaterial({ color: 0xffb37a, flatShading: true }));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x14142c }));
  eye.position.set(0.4, 0.1, 0.14);
  leaper.add(leapBody, leapTail, eye);
  leaper.scale.setScalar(2.2);
  group.add(leaper);
  // The leaping fish is above the water, so it is solid and always visible —
  // even before the unlock is bought the group is hidden, so this is safe.
  let leap = null;

  const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(),
    eul = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();

  let hungry = false;         // is a fish looking for a stone this throw?
  let targetSkip = 3;
  let ate = false;

  /**
   * Called at launch. `chance` is 0 when the unlock is not owned.
   * A hungry throw picks which skip the fish will go for, so the leap always
   * happens at a bounce (which is where the stone is visible and low).
   */
  function armThrow(chance) {
    hungry = Math.random() < chance;
    targetSkip = 2 + Math.floor(Math.random() * 4);
    ate = false;
    leap = null;
    leaper.visible = false;
  }

  /** Physics-substep probe: does a fish swallow the stone right now? */
  function probe(s, events) {
    if (!hungry || ate || !group.visible) return;
    if (s.skips < targetSkip) return;
    if (s.vy > 0 || s.y > 0.55) return;             // catch it on the way down
    if (depthAt(s.x, s.z) < 1.2) return;            // needs real water to leap from
    ate = true;
    hungry = false;
    s.stopRequest = 'fish';
    startLeap(s.x, s.z, s.vx, s.vz);
    events.push({ type: 'fishLeap', x: s.x, y: 0, z: s.z });
  }

  function startLeap(x, z, vx, vz) {
    const l = Math.hypot(vx, vz) || 1;
    leap = {
      x, z, dirX: vx / l, dirZ: vz / l, t: 0, dur: 1.15, h: 2.3,
    };
    leaper.visible = true;
  }

  function update(dt, t) {
    if (!group.visible) return;
    for (let i = 0; i < COUNT; i++) {
      const f = fish[i];
      // wander: slow heading drift, turn away from the shallows
      f.turn += (Math.sin(t * 0.6 + f.phase) * 0.5 - f.turn) * dt;
      f.dir += f.turn * dt * 1.6;
      const nx = f.x + Math.cos(f.dir) * f.speed * dt;
      const nz = f.z + Math.sin(f.dir) * f.speed * dt;
      if (depthAt(nx, nz) > 1.1) { f.x = nx; f.z = nz; }
      else f.dir += 1.9 * dt + 0.6;
      const wig = Math.sin(t * 6 + f.phase) * 0.22;
      pos.set(f.x, f.y + Math.sin(t * 0.9 + f.phase) * 0.12, f.z);
      // geometry points down +x; rotating by -dir about Y aims it along (cos,sin)
      eul.set(0, -f.dir, wig * 0.35);
      quat.setFromEuler(eul);
      scl.setScalar(f.size);
      mtx.compose(pos, quat, scl);
      bodies.setMatrixAt(i, mtx);
      tails.setMatrixAt(i, mtx);
    }
    bodies.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;

    if (leap) {
      leap.t += dt;
      const u = clamp(leap.t / leap.dur, 0, 1);
      const y = Math.sin(u * Math.PI) * leap.h - 0.3;
      const along = (u - 0.35) * 5.2;
      leaper.position.set(leap.x + leap.dirX * along, y, leap.z + leap.dirZ * along);
      leaper.rotation.set(0, -Math.atan2(leap.dirZ, leap.dirX), Math.cos(u * Math.PI) * 0.9);
      if (u >= 1) { leap = null; leaper.visible = false; }
    }
  }

  return {
    group,
    setVisible(v) { group.visible = !!v; },
    get visible() { return group.visible; },
    armThrow, probe, update,
    /** where the leap ends, so main.js can splash there */
    get leaping() { return !!leap; },
  };
}
