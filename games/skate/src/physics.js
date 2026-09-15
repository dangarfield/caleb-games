/* physics.js — what Godot's physics server used to do for us.
 *
 * The original skater is a CharacterBody3D with two ShapeCast3Ds: one pointing
 * down for the ground, one pointing along the direction of travel for walls,
 * and move_and_slide()/apply_floor_snap() underneath. None of that exists in
 * Three.js, so this file is the smallest honest replacement:
 *
 *   - the park's `_Col_*` meshes are flattened into one world-space triangle
 *     soup, each triangle tagged floor / pipe / wall exactly as the Godot
 *     import script tagged its StaticBody3D groups;
 *   - a uniform grid over that soup keeps every query to a handful of triangles;
 *   - `slide()` is collide-and-slide against a sphere, which is move_and_slide;
 *   - `probe()` is the downward ShapeCast, `sweepForward()` the forward one.
 *
 * Plus the pure-maths helpers out of skategame_helpers.gd, which port straight
 * across because both engines are right-handed with +Y up.
 */
import * as THREE from 'three';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
/* probe() flips a back-facing normal here; rayTriangle scribbles on _v1/_v2 */
const _pn = new THREE.Vector3();
const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3();
const _e0 = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
/* slide()/depenetrate() run inside each other, so they get their own scratch */
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _d3 = new THREE.Vector3();
/* sweepForward() keeps values alive ACROSS the probe() calls it makes, and probe
   and rayTriangle both scribble on _v1/_v2 — so it gets its own pair. */
const _f1 = new THREE.Vector3(), _f2 = new THREE.Vector3();

/* ---------------------------------------------------------------- helpers */

/** LibHelpers.forward_velocity — the part of v that lies in the ground plane */
export function forwardVelocity(v, up, out = new THREE.Vector3()) {
  return out.copy(v).addScaledVector(up, -v.dot(up));
}

/** LibHelpers.horizontal_velocity */
export function horizontalVelocity(v, out = new THREE.Vector3()) {
  return out.set(v.x, 0, v.z);
}

/**
 * LibHelpers.kill_orthogonal_velocity — the reason the board tracks instead of
 * skidding. Sideways velocity is cut to a tenth; forward and vertical are kept.
 */
export function killOrthogonalVelocity(obj, v, out = new THREE.Vector3()) {
  const bx = _e0.setFromMatrixColumn(obj.matrixWorld, 0);
  const by = _e1.setFromMatrixColumn(obj.matrixWorld, 1);
  const bz = _e2.setFromMatrixColumn(obj.matrixWorld, 2);
  return out.set(0, 0, 0)
    .addScaledVector(bz, v.dot(bz))
    .addScaledVector(bx, v.dot(bx) * 0.1)
    .addScaledVector(by, v.dot(by));
}


/**
 * LibHelpers.align — rotate a transform so its Y axis becomes newUp, keeping
 * as much of the heading as possible. This is what lets the skater run round
 * the inside of a bowl without the model twisting.
 */
export function alignUp(obj, newUp) {
  const cur = _e0.setFromMatrixColumn(obj.matrixWorld, 1);
  const target = _e1.copy(newUp).normalize();
  const d = cur.dot(target);
  if (d > 0.9999) return;
  let axis = _e2.copy(cur).cross(target);
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
  _q.setFromAxisAngle(axis.normalize(), Math.acos(Math.max(-1, Math.min(1, d))));
  obj.quaternion.premultiply(_q);
  obj.updateMatrixWorld(true);
}

/** LibHelpers.landed_perpendicular */
export function landedPerpendicular(fwdVel, fwdDir, threshold) {
  const dot = Math.abs(_v1.copy(fwdVel).normalize().dot(fwdDir));
  return { valid: dot >= threshold, dot };
}

/* ------------------------------------------------------------ the soup */

const GROUP_ORDER = { wall: 0, pipe: 1, floor: 2 };

/* Biggest a floor collision triangle may be before dropUndrawnFloors cuts it up
   to judge it in pieces. Four square metres is two paces across: fine enough to
   find the overhanging corner of a plate, coarse enough that an ordinary park
   is left alone. */
const SPLIT_AREA = 4.0;
const SPLIT_DEPTH = 12;      // a backstop on the recursion, never normally reached

/* How close drawn geometry has to be, in plan and in height, for a piece of
   floor collision to count as smoothing it rather than hanging in the air. */
const FLOOR_SUPPORT_H = 1.3;
const FLOOR_SUPPORT_V = 1.6;

export class World {
  constructor() {
    this.tris = [];         // {a,b,c,n,group,ride,pane,dead}
    /* pane id -> its triangle OBJECTS. References rather than indices on
       purpose: dropUndrawnFloors rebuilds this.tris, and an index list would
       quietly start pointing at somebody else's geometry. */
    this.panes = new Map();
    this.cell = 3.0;
    this.grid = new Map();
    this.min = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.apron = null;      // see setApron
  }

  /**
   * The park is a slab: past its edges there is nothing, and in the original you
   * ride off, fall, and respawn. Here the ground is drawn continuing outwards,
   * so it has to BE there — a plate of ground that is only real outside the
   * park's own footprint, where the park's triangles take over.
   *
   * It is a plane rather than geometry on purpose: one quad big enough to matter
   * would land in thousands of broadphase cells, where two comparisons do the
   * same job exactly.
   */
  setApron(y, box, group = 'floor') {
    this.apron = { y, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, group };
  }

  /** true where the apron is the ground — i.e. off the edge of the park */
  _onApron(x, z) {
    const a = this.apron;
    return !!a && (x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1);
  }

  /**
   * Add a mesh's triangles, in world space, tagged with a group.
   * `only` restricts it to a list of triangle start indices, which is how one
   * box can be floor on its lid and wall down its sides.
   */
  addMesh(mesh, group, only = null, ride = false, pane = null) {
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;
    for (let k = 0; k < (only ? only.length : count / 3); k++) {
      const i = only ? only[k] : k * 3;
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      const a = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      const n = new THREE.Vector3().subVectors(b, a).cross(_v1.subVectors(c, a));
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      const tri = { a, b, c, n, group, ride, pane, dead: false };
      if (pane !== null) {
        let list = this.panes.get(pane);
        if (!list) { list = []; this.panes.set(pane, list); }
        list.push(tri);
      }
      this.tris.push(tri);
    }
  }

  /**
   * Take a pane out of the world.
   *
   * The triangles stay in the array and stay in the broadphase — rebuilding the
   * grid mid-run for one window would cost more than every glass check in the
   * park put together — they are just marked dead, and every query steps over
   * them. A dead triangle is a hole you can ride through.
   *
   * @returns {boolean} true the first time; false if it was already broken,
   *   which is what stops one hit registering as five.
   */
  killPane(id) {
    const list = this.panes.get(id);
    if (!list || !list.length) return false;
    if (list[0].dead) return false;
    for (const t of list) t.dead = true;
    return true;
  }

  /** Put one back, for a restart. */
  revivePane(id) {
    const list = this.panes.get(id);
    if (!list) return;
    for (const t of list) t.dead = false;
  }

  /** Called once, after every collider is in. */
  build() {
    this.grid.clear();
    const box = new THREE.Box3();
    for (let t = 0; t < this.tris.length; t++) {
      const tri = this.tris[t];
      box.makeEmpty().expandByPoint(tri.a).expandByPoint(tri.b).expandByPoint(tri.c);
      const x0 = Math.floor(box.min.x / this.cell), x1 = Math.floor(box.max.x / this.cell);
      const y0 = Math.floor(box.min.y / this.cell), y1 = Math.floor(box.max.y / this.cell);
      const z0 = Math.floor(box.min.z / this.cell), z1 = Math.floor(box.max.z / this.cell);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) {
            const k = x + ',' + y + ',' + z;
            let list = this.grid.get(k);
            if (!list) { list = []; this.grid.set(k, list); }
            list.push(t);
          }
    }
  }

  _near(center, radius, out) {
    out.length = 0;
    const seen = out._seen || (out._seen = new Set());
    seen.clear();
    const x0 = Math.floor((center.x - radius) / this.cell), x1 = Math.floor((center.x + radius) / this.cell);
    const y0 = Math.floor((center.y - radius) / this.cell), y1 = Math.floor((center.y + radius) / this.cell);
    const z0 = Math.floor((center.z - radius) / this.cell), z1 = Math.floor((center.z + radius) / this.cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const list = this.grid.get(x + ',' + y + ',' + z);
          if (!list) continue;
          for (let i = 0; i < list.length; i++) if (!seen.has(list[i])) { seen.add(list[i]); out.push(list[i]); }
        }
    return out;
  }

  /**
   * Godot: move_and_slide. Move the sphere by `delta`, sub-stepped so nothing
   * is tunnelled through, pushing out of anything it ends up inside and
   * removing the velocity that drove it in.
   */
  slide(pos, vel, dt, radius, feetOffset) {
    const move = _s1.copy(vel).multiplyScalar(dt);
    const dist = move.length();
    /* keep every sub-step shorter than the sphere's radius, so a thin surface
       always ends the step overlapped rather than passed clean through */
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
    const step = _s2.copy(move).divideScalar(steps);
    const hits = [];
    for (let s = 0; s < steps; s++) {
      pos.add(step);
      const res = this.depenetrate(pos, radius, feetOffset);
      for (const h of res) {
        hits.push(h);
        const into = vel.dot(h.normal);
        if (into < 0) vel.addScaledVector(h.normal, -into);
      }
    }
    return hits;
  }

  /**
   * Push a sphere (centred `feetOffset` above `pos`) out of the soup.
   *
   * THE ONE-SIDED SURFACE PROBLEM. This park's floor is a plane of ZERO
   * thickness (`BowlparkGround_Col_Floor` is 1e-05 deep) and its bowl is a
   * shell, so there is no "inside" to be pushed out of. Resolving along the
   * closest-point direction — the obvious thing, and correct for a solid — sends
   * a sphere that has ended up a hair behind the floor further DOWN, and the
   * skater drops out of the world.
   *
   * Every collider here is authored with its normal facing the play space: all
   * 894 floor triangles have n.y = 1, no pipe triangle points downwards, and the
   * walls are vertical. So the sign of the distance to the triangle's PLANE says
   * which side we are on, and anything behind a floor or a pipe is put back in
   * front of it along the normal instead. Walls keep the closest-point push;
   * they are two-sided fences and being shoved out of one is harmless.
   */
  depenetrate(pos, radius, feetOffset, iterations = 3) {
    const c = _d3.set(0, 0, 0);
    const out = [];
    const cand = this._cand || (this._cand = []);
    for (let it = 0; it < iterations; it++) {
      c.copy(pos).addScaledVector(feetOffset, radius);
      this._near(c, radius, cand);
      let moved = false;
      for (let i = 0; i < cand.length; i++) {
        const tri = this.tris[cand[i]];
        if (tri.dead) continue;
        const p = closestPointOnTriangle(c, tri.a, tri.b, tri.c, _d1);
        const d = _d2.copy(c).sub(p);
        const len = d.length();
        if (len >= radius) continue;

        const signed = c.dot(tri.n) - tri.a.dot(tri.n);
        let push, normal;
        /* ...but only for a surface that does not face DOWN. A level that draws
           its ground from both sides - Roswell's bowl floor, two storeys of the
           Mall - ends up with two collision triangles in the same place
           pointing opposite ways. Rescue both and they fight: the up-facing one
           lifts the sphere 0.7 m out through its front, the down-facing one
           shoves it straight back through, and the skater vibrates through the
           floor for as long as they stand on that spot. Measured on Roswell,
           389 crossings of a single triangle in 30 s of riding.

           A downward-facing triangle is a ceiling, and nobody rides the
           underside of one, so it gets the ordinary closest-point push instead
           and loses the ability to drag anyone under the world. Vertical
           surfaces are unaffected: anything shallower than 0.3 is already a
           wall, which never got the rescue in the first place. */
        if (signed < 0 && tri.group !== 'wall' && tri.n.y > -0.05) {
          /* behind a one-sided surface — climb back out through its face */
          push = radius - signed;          // signed is negative, so this exceeds radius
          normal = tri.n;
        } else {
          if (len < 1e-6) continue;        // exactly on the face, no direction to use
          push = radius - len;
          normal = d.divideScalar(len);
        }
        pos.addScaledVector(normal, push);
        out.push({ normal: normal.clone(), group: tri.group, ride: tri.ride,
                   pane: tri.pane, depth: push });
        moved = true;
      }
      /* the flat ground beyond the park */
      if (this.apron && this._onApron(c.x, c.z)) {
        const gap = c.y - this.apron.y;
        if (gap < radius) {
          pos.y += radius - gap;
          out.push({ normal: new THREE.Vector3(0, 1, 0), group: this.apron.group, depth: radius - gap });
          moved = true;
        }
      }
      if (!moved) break;
    }
    return out;
  }

  /**
   * Throw away the floor you cannot see.
   *
   * A THPS level carries collision the game never draws. Most of it is a barrier
   * penning you into the skateable part, and the converter drops those; the flat
   * ones it keeps on purpose, because they are usually smoothed collision laid
   * over stepped or fiddly geometry — a ramp over a staircase — and riding those
   * is better than bumping down every step.
   *
   * But some of them are not over anything. They are plates hanging in mid-air,
   * left over from whatever the level's authors used them for, and riding one is
   * riding on nothing at all. Measured: the School has 27,879 square metres of
   * ridable surface with no geometry drawn anywhere near it, including single
   * triangles of 2,564 square metres twenty-one metres up. New York has 28,955.
   * That is the "skating on air" Dan found in School II.
   *
   * The rule is the difference between the two cases: smoothing sits ON the
   * thing it smooths, so there is drawn geometry within arm's reach of it. A
   * plate in the air has none. Walls and transitions are left alone — you can
   * only stand on something flat, and dropping a wall you cannot see would put
   * back the invisible barriers that were the first thing to go.
   */
  dropUndrawnFloors(drawn, hReach = FLOOR_SUPPORT_H, vReach = FLOOR_SUPPORT_V) {
    if (!drawn || !drawn.size) return 0;
    const cell = 1.5;
    const n = Math.ceil(Math.max(hReach, vReach) / cell);
    /* IN A COLUMN, not in a sphere.
     *
     * "Is there anything drawn within two metres" counted the WALL the plate is
     * bolted to. That is how the Mall's balcony survived: a sheet of collision
     * sticking out of a wall into thin air, every sample within arm's reach of
     * the wall behind it, so the whole thing read as supported and you could
     * stand in the air a couple of metres out from the brickwork.
     *
     * A floor collider earns its place by smoothing something that is DRAWN
     * under or over it — a ramp over a staircase — so that is what the test
     * asks: near in plan, near in height, which a wall running past the edge is
     * not. */
    const seen = (p) => {
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
      for (let dx = -n; dx <= n; dx++)
        for (let dy = -n; dy <= n; dy++)
          for (let dz = -n; dz <= n; dz++) {
            const l = drawn.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
            if (!l) continue;
            for (let i = 0; i < l.length; i += 3) {
              if (Math.abs(l[i + 1] - p.y) > vReach) continue;
              const ex = l[i] - p.x, ez = l[i + 2] - p.z;
              if (ex * ex + ez * ez < hReach * hReach) return true;
            }
          }
      return false;
    };
    /* Sample the triangle, don't spot-check it. One test at the centroid is
       enough for the ordinary case, where a collision triangle is a couple of
       metres across — but the School's plates are single triangles of 2,564
       square metres, and both the centroid and the corners of one of those land
       near SOMETHING. So the number of samples follows the area, spread evenly
       across the face, and a triangle survives only if most of it has something
       drawn under or over it. */
    const ab = _g1, ac = _g2;
    const sample = (t) => {
      ab.subVectors(t.b, t.a); ac.subVectors(t.c, t.a);
      const area = _v3.crossVectors(ab, ac).length() * 0.5;
      const n = Math.max(2, Math.min(6, Math.round(Math.sqrt(area / 3))));
      let hit = 0, total = 0;
      for (let i = 0; i <= n; i++) {
        for (let j = 0; i + j <= n; j++) {
          const u = (i + 0.33) / (n + 1), v = (j + 0.33) / (n + 1);
          _v1.copy(t.a).addScaledVector(ab, u).addScaledVector(ac, v);
          total++;
          if (seen(_v1)) hit++;
        }
      }
      return { hit, total, area };
    };

    const keep = [];
    let dropped = 0;

    /* ...AND ONLY CUT UP THE ONES THAT DISAGREE WITH THEMSELVES.
     *
     * Keeping or dropping a whole triangle is fine while a triangle is a couple
     * of metres across. It is useless on a plate: the Mall has a single floor
     * triangle of 610 square metres, most of it lying over the shopping level
     * where it smooths the steps, and one corner hanging in the air over the
     * walkway. Most of it was supported, so all of it was kept, and that corner
     * is a piece of ground you can stand on in mid-air.
     *
     * So a triangle whose samples all agree — all supported, or none — is
     * settled where it stands, which is nearly all of them and costs nothing. A
     * triangle that is supported in some places and not others is halved along
     * its longest edge and the two halves asked the same question, down to
     * SPLIT_AREA. The part doing a job stays, the overhang goes, and the extra
     * triangles are spent only along the edges where the answer actually
     * changes. */
    const judge = (t, depth) => {
      const { hit, total, area } = sample(t);
      if (hit === total) { keep.push(t); return; }
      if (hit === 0) { dropped++; return; }
      if (area <= SPLIT_AREA || depth >= SPLIT_DEPTH) {
        if (hit * 2 >= total) keep.push(t); else dropped++;
        return;
      }
      /* halve the longest edge, which keeps the pieces from going needle-thin */
      const lab = t.a.distanceToSquared(t.b);
      const lbc = t.b.distanceToSquared(t.c);
      const lca = t.c.distanceToSquared(t.a);
      let p, q, r;
      if (lab >= lbc && lab >= lca) { p = t.a; q = t.b; r = t.c; }
      else if (lbc >= lca) { p = t.b; q = t.c; r = t.a; }
      else { p = t.c; q = t.a; r = t.b; }
      const mid = new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5);
      const half = (x, y, z) => ({ a: x, b: y, c: z, n: t.n, group: t.group,
                                   ride: t.ride, pane: t.pane, dead: t.dead });
      judge(half(p, mid, r), depth + 1);
      judge(half(mid, q, r), depth + 1);
    };

    for (const t of this.tris) {
      /* Either way up. A plate facing DOWN is still something you stand on:
         nothing rescues a sphere that ends up behind a ceiling, so it gets the
         ordinary push back out and the push is upwards — which is how the Mall
         kept a second invisible sheet a metre under the first one, and Dan was
         standing on that one, not the one this filter had already dealt with.
         A ceiling the level actually draws has drawn geometry right there and
         is kept exactly as before. */
      if (t.group === 'wall' || Math.abs(t.n.y) <= 0.6) { keep.push(t); continue; }
      judge(t, 0);
    }
    this.tris = keep;
    /* the panes point at triangle objects, and a pane is never a floor, so
       nothing above has touched them — but the grid is now wrong either way */
    return dropped;
  }

  /**
   * Godot: the downward ShapeCast3D. A short ray under the feet; returns the
   * nearest hit with its normal and group, or null.
   */
  probe(pos, dir, maxDist, radius = 0) {
    const cand = this._cand2 || (this._cand2 = []);
    const mid = _v1.copy(pos).addScaledVector(dir, maxDist * 0.5);
    this._near(mid, maxDist * 0.5 + radius + 0.4, cand);
    let best = null, bestT = maxDist;
    for (let i = 0; i < cand.length; i++) {
      const tri = this.tris[cand[i]];
      if (tri.dead) continue;
      const t = rayTriangle(pos, dir, tri, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        /* Face the normal back at whoever cast the ray. The triangle test is
           two-sided on purpose, and a level that draws its ground from both
           sides has two coincident triangles pointing opposite ways, so which
           one a ray reports is a coin toss. Report the ceiling twin and the
           ground check refuses it — SHAPE_COL_DOT wants the surface within 60
           degrees of the way the skater is standing, and this one is 180 out —
           so the skater stands on a floor the game thinks is not there and
           freezes mid-air. It happened twice in six rides round Roswell. */
        const n = tri.n.dot(dir) > 0 ? _pn.copy(tri.n).negate() : tri.n;
        best = { distance: t, normal: n.clone(), group: tri.group, ride: tri.ride,
                 pane: tri.pane,
                 point: new THREE.Vector3().copy(pos).addScaledVector(dir, t) };
      }
    }
    if (this.apron && dir.y < -1e-6) {
      const t = (pos.y - this.apron.y) / -dir.y;
      if (t >= 0 && t < bestT) {
        const px = pos.x + dir.x * t, pz = pos.z + dir.z * t;
        if (this._onApron(px, pz)) {
          best = {
            distance: t, normal: new THREE.Vector3(0, 1, 0), group: this.apron.group,
            point: new THREE.Vector3(px, this.apron.y, pz)
          };
        }
      }
    }
    return best;
  }

  /** The forward ShapeCast: three rays fanned out at board height. */
  sweepForward(pos, dir, up, maxDist) {
    if (dir.lengthSq() < 1e-8) return [];
    const hits = [];
    const base = _f1.copy(pos).addScaledVector(up, 0.35);
    const side = _f2.copy(dir).cross(up).normalize();
    for (const off of [-0.22, 0, 0.22]) {
      const from = new THREE.Vector3().copy(base).addScaledVector(side, off);
      const h = this.probe(from, dir, maxDist);
      if (h) hits.push(h);
    }
    hits.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);
    return hits;
  }
}

/* ------------------------------------------------------------ primitives */

export function closestPointOnTriangle(p, a, b, c, out) {
  const ab = _e0.subVectors(b, a);
  const ac = _e1.subVectors(c, a);
  const ap = _e2.subVectors(p, a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  const bp = out.subVectors(p, b);
  const d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));

  const cp = out.subVectors(p, c);
  const d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return out.copy(b).addScaledVector(_e0.subVectors(c, b), w);
  }
  const denom = 1 / (va + vb + vc);
  return out.copy(a).addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom);
}

/* Möller–Trumbore, two-sided (the park's collision meshes are single-sided
   planes in places and we want to be stopped by them either way). */
export function rayTriangle(origin, dir, tri, maxT) {
  const e1 = _e0.subVectors(tri.b, tri.a);
  const e2 = _e1.subVectors(tri.c, tri.a);
  const pv = _v2.copy(dir).cross(e2);
  const det = e1.dot(pv);
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const tv = _e2.subVectors(origin, tri.a);
  const u = tv.dot(pv) * inv;
  if (u < 0 || u > 1) return null;
  const qv = tv.cross(e1);
  const v = dir.dot(qv) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = e2.dot(qv) * inv;
  if (t < 0 || t > maxT) return null;
  return t;
}
