/* levels.js — what a park puts on top of its geometry.
 *
 * This used to hold three hand-built parks as well: the upstream project's two
 * debug levels (Bowlpark.glb, Warehouse.glb) and a street plaza assembled from
 * its quarter-pipe module. They were the scaffolding the port was built on, and
 * every mechanic they exercised is exercised better by a real THPS park, so the
 * level select is now the converted games and nothing else. What is left here
 * is LevelProps, which every level uses.
 */
import * as THREE from 'three';
import { makeBarrel, makeDeck, makeLetter, makeRays, makeZoneRing } from './props.js';

/* No hand-built parks any more — the level select is filled from
   assets/thps/levels.json. See src/thps.js. */
export const LEVELS = [];

export const LETTERS = ['S', 'K', 'A', 'T', 'E'];

/**
 * Everything a level puts on top of its geometry: the letters, the barrels and
 * the objective ring. Kept apart from the park itself so a retry can reset them
 * without rebuilding a single collider.
 */
export class LevelProps {
  /**
   * @param {World} world the park's collider soup — props are DROPPED onto it
   *   rather than positioned by hand. The level files then only have to say
   *   roughly where a barrel goes in plan; whether it lands on the flat, on a
   *   funbox or halfway up a bank is the park's business, and a barrel can
   *   never end up buried in geometry or hovering over a bowl.
   */
  constructor(def, scene, world) {
    this.def = def;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    const down = new THREE.Vector3(0, -1, 0);
    const from = new THREE.Vector3();
    const drop = (x, y, z, lift) => {
      if (world) {
        from.set(x, y + 9, z);
        const hit = world.probe(from, down, 40);
        if (hit) return new THREE.Vector3(x, hit.point.y + lift, z);
      }
      return new THREE.Vector3(x, y, z);
    };

    this.letters = (def.letters || []).map((p, i) => {
      const m = makeLetter(LETTERS[i]);
      /* a converted park's letters come out of the game's own item table and
         are placed exactly, floating where they float. Only guessed spots get
         dropped onto the ground. */
      m.position.copy(def.lettersExact
        ? new THREE.Vector3(p[0], p[1], p[2])
        : drop(p[0], p[1], p[2], 1.15));
      const rays = makeRays(0x5ab6ff, 0.85);
      rays.userData.base = 0.85;
      m.add(rays);
      this.root.add(m);
      return { mesh: m, home: m.position.clone(), taken: false, ch: LETTERS[i], rays };
    });

    /* The five golden decks — the THPS2 career levels' own five-of-a-kind,
       standing in for pilot wings, hall passes, tokens, cans and bells. Placed
       exactly where the game put them, so they float where they floated. */
    this.decks = (def.decks || []).map((p, i) => {
      const m = makeDeck();
      m.position.set(p[0], p[1], p[2]);
      const rays = makeRays(0x5ab6ff, 1.0);
      rays.userData.base = 1.0;
      m.add(rays);
      this.root.add(m);
      return { mesh: m, home: m.position.clone(), taken: false, i, rays };
    });

    this.barrels = (def.barrels || []).map((p) => {
      const m = makeBarrel(Math.random() < 0.5 ? 0xe4581d : 0x2f6fd0);
      m.position.copy(drop(p[0], p[1], p[2], 0));
      this.root.add(m);
      return { mesh: m, home: m.position.clone(), hit: false, t: 0, spin: 0, dir: new THREE.Vector3() };
    });

    this.zone = null;
    if (def.zone) {
      const ring = makeZoneRing(def.zone.radius);
      const at = drop(def.zone.at[0], def.zone.at[1], def.zone.at[2], 0.02);
      ring.position.copy(at);
      this.root.add(ring);
      this.zone = { mesh: ring, at, radius: def.zone.radius, label: def.zone.label };
    }
    this.time = 0;
  }

  reset() {
    for (const l of this.letters) {
      l.taken = false; l.mesh.visible = true; l.mesh.position.copy(l.home); l.mesh.scale.setScalar(1);
    }
    for (const d of this.decks) {
      d.taken = false; d.mesh.visible = true; d.mesh.position.copy(d.home); d.mesh.scale.setScalar(1);
    }
    for (const b of this.barrels) {
      b.hit = false; b.t = 0; b.mesh.position.copy(b.home);
      b.mesh.rotation.set(0, 0, 0); b.mesh.visible = true;
    }
  }

  /** Spin the letters and decks, keep knocked barrels tumbling, pulse the ring. */
  update(dt) {
    this.time += dt;
    for (const l of this.letters) {
      if (l.taken) continue;
      l.mesh.rotation.y += dt * 1.4;
      l.mesh.position.y = l.home.y + Math.sin(this.time * 2 + l.home.x) * 0.12;
      this._rays(l, dt, -1.0);
    }
    for (const d of this.decks) {
      if (d.taken) continue;
      d.mesh.rotation.y += dt * 1.1;
      d.mesh.position.y = d.home.y + Math.sin(this.time * 1.8 + d.i) * 0.14;
      this._rays(d, dt, -0.8);
    }
    for (const b of this.barrels) {
      if (!b.hit || b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt * 1.6);
      const e = 1 - (1 - b.t) * (1 - b.t);
      b.mesh.rotation.x = b.dir.z * e * Math.PI * 0.5;
      b.mesh.rotation.z = -b.dir.x * e * Math.PI * 0.5;
      b.mesh.position.addScaledVector(b.dir, dt * 2.4 * (1 - b.t));
      b.mesh.rotation.y += b.spin * dt * (1 - b.t);
    }
    if (this.zone) {
      const s = 1 + Math.sin(this.time * 2.4) * 0.03;
      this.zone.mesh.scale.set(s, 1, s);
    }
  }

  /* The beams turn against the item and breathe, so the pair never lines up
     twice and the pickup keeps catching your eye while you skate past it. */
  _rays(item, dt, speed) {
    const r = item.rays;
    if (!r) return;
    /* The beams are a child of the item, so this rides on top of the item's
       own spin. Turning them on all three axes at rates that do not divide
       into each other means the cross never repeats a pose: it tumbles, and
       every few seconds one beam swings straight at you and flares. That is
       what sells them as light rather than as four flat triangles. */
    r.rotation.y += dt * speed;
    r.rotation.x += dt * speed * 0.62;
    r.rotation.z += dt * speed * 0.37;
    const t = this.time * 3.1 + item.home.z;
    r.material.opacity = 0.75 + 0.25 * Math.sin(t);
    r.scale.setScalar(r.userData.base * (1 + 0.10 * Math.sin(t * 0.7)));
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
