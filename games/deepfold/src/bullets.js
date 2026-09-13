/* bullets.js — every projectile in the game, pooled, in six draw calls.
 *
 * There are three kinds of shot (player, pod, enemy) and each is drawn as two
 * InstancedMeshes: a near-white rim sheet and the coloured fill on top of it.
 * That is the same trick every actor in designs.js uses to stay legible over a
 * field of contours, done the cheap way — an instanced quad per bullet rather
 * than a Group per bullet. A screen with a hundred and fifty shots on it costs
 * six draws and allocates nothing.
 *
 * Dead instances are parked at zero scale rather than removed. The pool never
 * grows, the instance count never changes, and `update` touches only the live
 * ones.
 *
 * The Wave Cannon beam is here too but is not a pool: there is one beam, it is
 * one stretched mesh, and it pierces — so instead of a hit list it carries a
 * `stamp` that goes up on every fire, and an enemy records the last stamp that
 * hit it. That is how a piercing beam damages twenty enemies once each without
 * allocating a set.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { roundRectShape, polyShape } from './paper.js';
import { ramp, RIM, GOLD } from './palette.js';

function instLayer(shape, color, max, z, opts = {}) {
  const geo = new THREE.ShapeGeometry(shape, opts.curveSegments || 4);
  const mat = new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    depthWrite: opts.depthWrite !== false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.position.z = z;
  mesh.count = max;
  return mesh;
}

export function createBullets(scene, { rampName = 'STAGE1' } = {}) {
  const group = new THREE.Group();
  if (scene) scene.add(group);

  const B = CFG.bullets;

  /* Silhouettes. The player's shot is a lozenge pointing +x; the pod's is the
     same shape a touch shorter; an enemy shot is a blunt diamond, so the two
     sides never read as the same object flying the other way. */
  const playerShape = roundRectShape(B.playerSize * 1.9, B.playerSize * 0.62, B.playerSize * 0.3);
  const podShape = roundRectShape(B.podSize * 1.5, B.podSize * 0.66, B.podSize * 0.32);
  const enemyShape = polyShape([
    [B.enemySize, 0], [0, B.enemySize * 0.72],
    [-B.enemySize * 0.8, 0], [0, -B.enemySize * 0.72],
  ]);
  const rimPad = 0.55;
  const playerRimShape = roundRectShape(B.playerSize * 1.9 + rimPad * 2, B.playerSize * 0.62 + rimPad * 2, B.playerSize * 0.4);
  const podRimShape = roundRectShape(B.podSize * 1.5 + rimPad * 2, B.podSize * 0.66 + rimPad * 2, B.podSize * 0.42);
  const enemyRimShape = polyShape([
    [B.enemySize + rimPad, 0], [0, B.enemySize * 0.72 + rimPad],
    [-B.enemySize * 0.8 - rimPad, 0], [0, -B.enemySize * 0.72 - rimPad],
  ]);

  const kinds = {
    player: {
      arr: makePool(B.playerMax),
      rim: instLayer(playerRimShape, RIM, B.playerMax, 2.4),
      fill: instLayer(playerShape, ramp(rampName, 0.02).getHex(), B.playerMax, 2.5),
      radius: 1.6,
    },
    pod: {
      arr: makePool(B.podMax),
      rim: instLayer(podRimShape, RIM, B.podMax, 2.4),
      fill: instLayer(podShape, GOLD, B.podMax, 2.5),
      radius: 1.5,
    },
    enemy: {
      arr: makePool(B.enemyMax),
      rim: instLayer(enemyRimShape, RIM, B.enemyMax, 2.2),
      fill: instLayer(enemyShape, ramp(rampName, 0.95).getHex(), B.enemyMax, 2.3),
      radius: B.enemyRadius,
    },
  };
  for (const k in kinds) { group.add(kinds[k].rim); group.add(kinds[k].fill); }

  function makePool(n) {
    const a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, life: 0, dmg: 1, spent: false, home: 0 };
    return a;
  }

  /* ------------------------------------------------------- matrix writing */

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const ZAXIS = new THREE.Vector3(0, 0, 1);
  const ZERO = new THREE.Vector3();
  const IDENT = new THREE.Quaternion();
  const NOTHING = new THREE.Vector3(0, 0, 0);

  function writeAll(kind) {
    const { arr, rim, fill } = kind;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (!b.alive) {
        m4.compose(ZERO, IDENT, NOTHING);
      } else {
        pos.set(b.x, b.y, 0);
        quat.setFromAxisAngle(ZAXIS, b.rot);
        scl.set(1, 1, 1);
        m4.compose(pos, quat, scl);
      }
      rim.setMatrixAt(i, m4);
      fill.setMatrixAt(i, m4);
    }
    rim.instanceMatrix.needsUpdate = true;
    fill.instanceMatrix.needsUpdate = true;
  }

  /* -------------------------------------------------------------- spawning */

  function spawn(kind, x, y, vx, vy, dmg) {
    const arr = kinds[kind].arr;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (b.alive) continue;
      b.alive = true;
      b.x = x; b.y = y; b.vx = vx; b.vy = vy;
      b.rot = Math.atan2(vy, vx);
      b.life = 4.5;
      b.dmg = dmg === undefined ? 1 : dmg;
      // `spent` means "this shot has already sunk into a boss hull"; see the
      // pass-through rule in main.js. Reset it or a recycled bullet arrives
      // having already used itself up.
      b.spent = false;
      b.home = 0;
      return b;
    }
    return null;                 // pool full: the shot is simply not taken
  }

  const api = {
    group,
    player: kinds.player.arr,
    pod: kinds.pod.arr,
    enemy: kinds.enemy.arr,
    radius: { player: kinds.player.radius, pod: kinds.pod.radius, enemy: kinds.enemy.radius },
    firePlayer: (x, y, vx, vy, dmg) => spawn('player', x, y, vx, vy, dmg),
    firePod: (x, y, vx, vy, dmg) => spawn('pod', x, y, vx, vy, dmg),
    fireEnemy: (x, y, vx, vy, dmg) => spawn('enemy', x, y, vx, vy, dmg),
    update, clear, dispose, beam: null, fireBeam, killEnemyShot,
  };

  /* --------------------------------------------------------------- the beam */

  const beamShape = roundRectShape(1, 1, 0.28);
  const beamGeo = new THREE.ShapeGeometry(beamShape, 4);
  const beamCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: RIM, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide,
  }));
  const beamGlow = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: ramp(rampName, 0.08).getHex(), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
  }));
  beamCore.position.z = 3.2;
  beamGlow.position.z = 3.0;
  beamCore.visible = beamGlow.visible = false;
  beamCore.frustumCulled = beamGlow.frustumCulled = false;
  group.add(beamGlow); group.add(beamCore);

  const beam = {
    active: false, life: 0, max: 1, y: 0, x0: 0, len: 0,
    height: 0, damage: 0, stamp: 0,
  };
  api.beam = beam;

  function fireBeam(x, y, charge, reachX) {
    const c = Math.min(1, Math.max(0, charge));
    beam.active = true;
    beam.max = CFG.charge.life;
    beam.life = beam.max;
    beam.y = y;
    beam.x0 = x;
    beam.len = Math.max(20, reachX - x);
    beam.height = CFG.charge.height + (CFG.charge.heightFull - CFG.charge.height) * c;
    beam.damage = CFG.charge.damage + (CFG.charge.damageFull - CFG.charge.damage) * c;
    beam.stamp++;
    return beam;
  }

  function updateBeam(dt) {
    if (!beam.active) {
      if (beamCore.visible) beamCore.visible = beamGlow.visible = false;
      return;
    }
    beam.life -= dt;
    if (beam.life <= 0) {
      beam.active = false;
      beamCore.visible = beamGlow.visible = false;
      return;
    }
    const k = beam.life / beam.max;                 // 1 -> 0
    // It punches out at full height and thins as it fades, which reads as the
    // beam being spent rather than simply being deleted.
    const h = beam.height * (0.35 + 0.65 * k);
    beamGlow.visible = beamCore.visible = true;
    beamGlow.scale.set(beam.len, h, 1);
    beamGlow.position.x = beam.x0 + beam.len * 0.5;
    beamGlow.position.y = beam.y;
    beamGlow.material.opacity = 0.75 * k;
    beamCore.scale.set(beam.len, h * 0.42, 1);
    beamCore.position.x = beamGlow.position.x;
    beamCore.position.y = beam.y;
    beamCore.material.opacity = 0.95 * k;
  }

  /* ----------------------------------------------------------------- frame */

  /* `ship` is optional and only used by homing shots — the `seeds` pattern.
     A seed steers its velocity toward the player at `home` radians a second,
     which is slow enough to outrun and slow enough to put the pod in front
     of, and fast enough that ignoring it is a decision. */
  function update(dt, bounds, ship) {
    const left = bounds.left, right = bounds.right, top = bounds.top, bottom = bounds.bottom;
    for (const name in kinds) {
      const arr = kinds[name].arr;
      let dirty = false;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b.alive) continue;
        dirty = true;
        if (b.home && ship) {
          const want = Math.atan2(ship.y - b.y, ship.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = Math.max(-b.home * dt, Math.min(b.home * dt, d));
          cur += step;
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur) * sp;
          b.vy = Math.sin(cur) * sp;
          b.rot = cur;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < left || b.x > right || b.y < bottom || b.y > top) b.alive = false;
      }
      if (dirty || kinds[name].wasDirty) writeAll(kinds[name]);
      kinds[name].wasDirty = dirty;
    }
    updateBeam(dt);
  }

  /* The Force pod eats enemy fire; so does a SHIELD. Both call this. */
  function killEnemyShot(b) { b.alive = false; }

  function clear() {
    for (const name in kinds) {
      const arr = kinds[name].arr;
      for (let i = 0; i < arr.length; i++) arr[i].alive = false;
      writeAll(kinds[name]);
    }
    beam.active = false;
    beamCore.visible = beamGlow.visible = false;
  }

  function dispose() {
    for (const name in kinds) {
      kinds[name].rim.geometry.dispose(); kinds[name].rim.material.dispose(); kinds[name].rim.dispose();
      kinds[name].fill.geometry.dispose(); kinds[name].fill.material.dispose(); kinds[name].fill.dispose();
    }
    beamGeo.dispose();
    beamCore.material.dispose(); beamGlow.material.dispose();
    if (group.parent) group.parent.remove(group);
  }

  clear();
  return api;
}
