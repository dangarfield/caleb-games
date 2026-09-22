// Waypoints — walking the route you drew.
//
// Drawing a line on the map is planning; this is the doing. The route is already
// costed and already legal — that was settled on the paper — so nothing here
// decides anything. It paints the line on the ground, points an arrow at where
// you are going, moves the walker, and tells you what you pass.
//
// The one rule it enforces is that you arrive where you planned to: the sticks
// steer, but the turn only ends when he reaches the place the route ended at.

import * as THREE from 'three';
import { stepBlocked } from './rules.js';
import { clipFor } from './views.js';
import { makePin, sizePins } from './pins.js';

/**
 * A person walking: 1.4 m/s, which is what it is. It was ninety for a while, on
 * the reasoning that the park is fifteen kilometres across and nobody wants to
 * wait; what that felt like was flying.
 */
const PACE = { walk: 1.4 };

/**
 * Fast is not a speed — it is a promise about time.
 *
 * Ten seconds to the next thing worth stopping at, whatever the distance. A
 * stretch of empty moor and a hop between two lakes both take ten seconds, which
 * means the walk is paced by what is IN it rather than by how big the park is.
 * A speed cannot do that: the park is fifteen kilometres across and the
 * interesting bits are not evenly spread through it.
 *
 * Never slower than walking, because a stop ten metres away does not want
 * drawing out to ten seconds.
 */
const FAST_SECS = 10;

/** What counts as somewhere worth arriving at. A contour line does not. */
const STOP_KINDS = new Set(['lake', 'wood', 'bridge']);
/** ...and of those, the ones he actually stops walking for. */
const PAUSE_KINDS = new Set(['lake', 'wood']);
/** How close counts as arrived, in cells. */
// How close counts as there. A twentieth of a cell was a hundred and twenty-five
// metres: he stopped in the next field and the game said he had arrived. This is
// ten metres, and he is then stood exactly on the point — the waypoint is a place
// on the map, and standing near it is not standing on it.
const ARRIVE = 0.004;
/** How close to a crossing before it is called out, in cells. */
const CALL = 0.03;

const lerp = (a, b, t) => a + (b - a) * t;

/** Distance along a polyline to the point on it nearest `p`. */
function alongAt(line, p) {
  let run = 0, best = { d: Infinity, s: 0 };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len = Math.hypot(vx, vy) || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (len * len)));
    const x = a[0] + t * vx, y = a[1] + t * vy;
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < best.d) best = { d, s: run + t * len };
    run += len;
  }
  return best;
}

/** Total length of a polyline, in cells. */
function lengthOf(line) {
  let n = 0;
  for (let i = 0; i + 1 < line.length; i++) n += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return n;
}

/**
 * The same line, with a point every `step` cells.
 *
 * The route the rules costed can be two points five kilometres apart, and a
 * ribbon built from two points is one flat quad that cuts straight through every
 * hill between them — which is exactly what it did, and what it looked like was
 * nothing at all, because the hill was in front of it.
 */
function resample(line, step) {
  const out = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  out.push(line[line.length - 1].slice());
  return out;
}

/** The point `s` cells along a polyline. */
function at(line, s) {
  let run = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    if (run + len >= s) {
      const t = (s - run) / len;
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    }
    run += len;
  }
  return line[line.length - 1].slice();
}

export class Walk {
  /**
   * @param o.v3      the Preview3D whose world he walks in
   * @param o.ix      the indexed map, for what he passes
   * @param o.line    the route, smoothed, in cell units
   * @param o.to      the waypoint he is walking to
   * @param o.plan    what the route earns, from `previewMove`
   * @param o.onNote  called with a note when he passes something
   * @param o.onArrive called once, when he gets there
   */
  constructor(o) {
    Object.assign(this, o);
    this.group = new THREE.Group();
    this.v3.scene.add(this.group);
    this.total = lengthOf(this.line);
    this.done = 0;                       // how far along he is, in cells
    this.arrived = false;

    // Everything worth saying on the way, in the order he will meet it. Worked
    // out once, from the route the rules already costed, so the walk cannot
    // disagree with the sum.
    this.beats = this._beats().sort((a, b) => a.s - b.s);
    this.next = 0;
    // The places Fast aims at. Crossing a contour is worth a word as you pass
    // it; it is not somewhere you were going.
    this.stops = this.beats.filter((b) => STOP_KINDS.has(b.kind)).map((b) => b.s);
    this.stops.push(this.total);

    this._paint();
    const p0 = this.line[0];
    this.v3.hiker.x = p0[0]; this.v3.hiker.y = p0[1]; this.v3.hiker.to = null;
    const p1 = at(this.line, Math.min(0.02, this.total));
    this.v3.hiker.yaw = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
  }

  _beats() {
    const out = [];
    for (const c of (this.plan && this.plan.crossings) || []) {
      out.push({ s: alongAt(this.line, [c.x, c.y]).s, kind: c.kind === 'grid' ? 'grid' : 'line', done: false });
    }
    for (const id of (this.plan && this.plan.bridges) || []) {
      const b = this.ix.bridges.find((x) => x.id === id);
      if (b) out.push({ s: alongAt(this.line, [b.x, b.y]).s, kind: 'bridge', what: 'bridge', done: false });
    }
    for (const id of (this.plan && this.plan.lakes) || []) {
      const l = this.ix.lakes.find((x) => x.id === id);
      if (l) { const n = this._nearestOn(l.pts); out.push({ ...n, id, kind: 'lake', done: false }); }
    }
    for (const id of (this.plan && this.plan.woodland) || []) {
      const w = this.ix.woods.find((x) => x.id === id);
      if (w) { const n = this._nearestOn(w.pts); out.push({ ...n, id, kind: 'wood', done: false }); }
    }
    return out;
  }

  /**
   * Where along the route this shape is closest, and the point on the shape
   * itself — the route's distance is when he gets there, the shape's point is
   * what the camera should be looking at when he does.
   */
  _nearestOn(pts) {
    let best = { d: Infinity, s: 0, at: pts[0] };
    for (const q of pts) {
      const a = alongAt(this.line, q);
      if (a.d < best.d) best = { d: a.d, s: a.s, at: q };
    }
    return { s: best.s, at: best.at };
  }

  // ------------------------------------------------------------- the picture
  /**
   * The path on the ground and the arrow over his head.
   *
   * A ribbon rather than a line, because a one-pixel line disappears the moment
   * the ground tilts away from you, and this is the thing he is supposed to be
   * following.
   */
  _paint() {
    const v3 = this.v3;
    const m = v3.map.world.metresPerCell || 2500;
    // Thirty metres across was tried first, on the theory that a five kilometre
    // route has to read from a distance. It does not: the camera is nine metres
    // behind him, and at nine metres a thirty metre path is the whole screen
    // painted gold. What carries the distance is the chevron and the post.
    // Half a metre of paint, laid ON the ground rather than floating over it.
    // Three metres was a road; a metre and a bit is a line someone has walked.
    const wide = 0.55 / m;
    const lift = 0.25 / m;

    // DASHES, not a painted road. Three metres across and a stride between the
    // dashes: it reads as the route he drew on the map rather than as a motorway
    // laid across the park, and it is the same dotted line the plan was drawn
    // with, which is the point — this IS that line, on the ground.
    const walked = resample(this.line, 4 / m);
    const verts = [], idx = [];
    let quad = 0;
    for (let i = 0; i + 1 < walked.length; i++) {
      if (i % 3 === 2) continue;                  // eight metres of dash, four of gap
      const p = walked[i], q = walked[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
      const nx = (-dy / d) * wide, ny = (dx / d) * wide;
      const yp = v3.h(p[0], p[1]) + lift, yq = v3.h(q[0], q[1]) + lift;
      verts.push(p[0] + nx, yp, p[1] + ny, p[0] - nx, yp, p[1] - ny,
                 q[0] + nx, yq, q[1] + ny, q[0] - nx, yq, q[1] - ny);
      const k = quad * 4;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      quad++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    // DoubleSide, because a ribbon laid over a hillside faces whichever way the
    // ground does and half of it would otherwise be drawn from behind — which
    // is to say, not drawn.
    this.path = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xf2c230, transparent: true, opacity: 0.9, depthWrite: false,
      side: THREE.DoubleSide }));
    this.path.renderOrder = 3;
    this.path.frustumCulled = false;
    this.group.add(this.path);

    // Where he is heading: the same marker the park uses everywhere else, with
    // the place's own printed icon on it. It was a hundred and forty metres of
    // gold pole, which could be seen over a hill and looked like scaffolding.
    // A marker held at a constant size on the screen is visible from just as far
    // away and is the thing he is walking TO rather than a stick near it.
    const end = this.line[this.line.length - 1];
    const wp = this.to || { id: 'end', type: 'campsite', x: end[0], y: end[1] };
    this.pins = new THREE.Group();
    this.pins.add(makePin({ ...wp, x: end[0], y: end[1] }, 'pick', v3.h(end[0], end[1])));
    this.group.add(this.pins);
    this.post = this.pins;                          // what the stops hide and show

    // Which way to go is told by a compass at the top of the SCREEN, not by a
    // lump of geometry in the park. A thing in the world has to be big enough to
    // see from the camera, and anything that big is in the way of the thing it
    // is pointing at.
  }

  /**
   * Hold the marker at a constant size on the screen.
   *
   * The camera rides about nine metres behind him, so the distance from the
   * CAMERA to the marker is his distance to it plus that — near enough, and it
   * saves the walk having to know where the camera is.
   */
  _sizePin() {
    if (!this.pins) return;
    const m = this.v3.map.world.metresPerCell || 2500;
    const end = this.line[this.line.length - 1];
    const d = Math.hypot(end[0] - this.v3.hiker.x, end[1] - this.v3.hiker.y) + 9 / m;
    // Smaller than the map-side pins. Those are tapped; this one is only looked
    // at, and a marker sized for tapping stands so far off the ground that at a
    // kilometre and a half it floats up behind the compass chip.
    sizePins(this.pins, d * 0.7);
  }

  /** Dim the part he has already walked, so the path shows progress. */
  _trim() {
    // Opacity over the whole ribbon rather than per-vertex: the ribbon is one
    // draw and this runs every frame.
    const left = 1 - this.done / Math.max(this.total, 1e-6);
    this.path.material.opacity = 0.35 + 0.5 * left;
  }

  // ------------------------------------------------------------- the walking
  /**
   * One frame.
   *
   * `input` is `{ x, y }` from the left stick in camera space, plus `auto` and
   * `fast`. Under autopilot he walks the line; by hand he goes where he is
   * pushed, and the line is only a suggestion — which is the point of being
   * allowed to walk it yourself.
   */
  update(dt, input, camYaw) {
    if (this.arrived || this.paused) return;
    const v3 = this.v3, p = v3.hiker;
    const m = v3.map.world.metresPerCell || 2500;
    const mps = input.auto && input.fast ? this._hurry(m) : PACE.walk;
    const pace = mps / m;                                       // cells a second
    let moved = 0;

    if (input.auto) {
      this.done = Math.min(this.total, this.done + pace * dt);
      const q = at(this.line, this.done);
      moved = Math.hypot(q[0] - p.x, q[1] - p.y);
      if (moved > 1e-6) p.yaw = Math.atan2(q[0] - p.x, q[1] - p.y);
      p.x = q[0]; p.y = q[1];
    } else {
      const mag = Math.hypot(input.x, input.y);
      if (mag > 0.08) {
        // Forward and back along the way the camera is facing, left and right
        // ACROSS it. The stick does not turn him — the right stick does that.
        //
        // The camera's right is `forward x up`, which for a heading of `y` is
        // (-cos y, sin y), not (cos y, -sin y): the first version had D stepping
        // to the camera's left, which is a mirror nobody can play through.
        const fwd = -input.y, side = input.x;
        const vx = Math.sin(camYaw) * fwd - Math.cos(camYaw) * side;
        const vy = Math.cos(camYaw) * fwd + Math.sin(camYaw) * side;
        const len = Math.hypot(vx, vy) || 1;
        const step = pace * dt * Math.min(1, mag);
        const [nx, ny] = v3.clampToSheet(p.x + (vx / len) * step, p.y + (vy / len) * step);
        // He faces where you are LOOKING, not where his feet are going. Turning
        // him to face his own movement is what made strafing look like turning:
        // he swung sideways and the camera swung after him, and the two together
        // are indistinguishable from a turn.
        p.yaw = camYaw;
        // He may steer anywhere the pencil was allowed to go, and nowhere else:
        // he cannot swim a lake and he cannot ford the river. Turning on the
        // spot is still allowed, so being stopped by water is not being stuck.
        const stop = stepBlocked(this.ix, [p.x, p.y], [nx, ny]);
        if (stop) { this._refuse(stop); }
        else {
          p.x = nx; p.y = ny;
          moved = step;
          this.done = Math.max(this.done, alongAt(this.line, [p.x, p.y]).s);
        }
      }
    }

    if (v3.character) {
      if (moved > 1e-6) {
        const [clip, rate] = clipFor(input, mps);
        v3.character.play(clip, rate);
      } else if (v3.character.clip !== 'idle') v3.character.play('idle');
    }

    this._trim();
    this._sizePin();
    this._callOut();

    const end = this.line[this.line.length - 1];
    if (Math.hypot(p.x - end[0], p.y - end[1]) <= ARRIVE) {
      // Stand ON it. Whatever the last step was, the last step ends here.
      p.x = end[0]; p.y = end[1];
      this.done = this.total;
      v3._placeHiker && v3._placeHiker();
      this.arrived = true;
      this.onNote && this.onNote({ kind: 'arrive', what: this.to && this.to.type });
      this.onArrive && this.onArrive();
    }
  }

  /**
   * How fast to go to reach the next stop in ten seconds.
   *
   * Worked out ONCE per leg, not every frame. Recomputing "what is left, divided
   * by ten" sixty times a second is Zeno's arrow: the remaining distance decays
   * exponentially and he never quite arrives. The first run took sixty-five
   * seconds to cover a leg that was supposed to take ten.
   */
  _hurry(m) {
    const next = this.stops.find((s) => s > this.done + 1e-6);
    const target = next == null ? this.total : next;
    if (this._leg !== target) {
      this._leg = target;
      this._legMps = Math.max(PACE.walk, ((target - this.done) * m) / FAST_SECS);
    }
    return this._legMps;
  }

  /**
   * Which way, and how far — for the compass at the top of the screen.
   *
   * The bearing is to the next bit of PATH, not to the destination: on a route
   * that bends round a hill, pointing at the end would send him over the hill.
   */
  bearing() {
    const p = this.v3.hiker;
    const ahead = at(this.line, Math.min(this.total, this.done + 0.05));
    const end = this.line[this.line.length - 1];
    return {
      to: Math.atan2(ahead[0] - p.x, ahead[1] - p.y),
      metres: Math.hypot(end[0] - p.x, end[1] - p.y) * (this.v3.map.world.metresPerCell || 2500),
    };
  }

  /**
   * Tell him why he has stopped — but not forty times a second.
   *
   * A child walking into a river holds the stick there, and the note has to
   * arrive once and mean something rather than becoming a wall of text.
   */
  _refuse(why) {
    const now = performance.now();
    if (now - (this._said || 0) < 2500) return;
    this._said = now;
    this.onNote && this.onNote({ kind: why === 'water' ? 'nowater' : 'noford' });
  }

  /**
   * Anything he has just walked past — and anything he should stop for.
   *
   * A ridge crossed is a note and he keeps going. A lake or a wood is a place he
   * is standing in: he stops, something happens, and the walk waits. Waiting is
   * the whole point — the water and the animals were the two best moments in the
   * game and both of them slid by underfoot while he marched on.
   */
  _callOut() {
    while (this.next < this.beats.length && this.beats[this.next].s <= this.done + CALL) {
      const b = this.beats[this.next++];
      if (b.done) continue;
      b.done = true;
      if (PAUSE_KINDS.has(b.kind) && this.onStop) {
        this.paused = true;
        this.v3.character && this.v3.character.play('idle');
        this.onStop(b, () => { this.paused = false; });
        return;                      // one stop at a time
      }
      this.onNote && this.onNote(b);
    }
  }

  /** How far through, 0 to 1 — for the phone's little bar. */
  get progress() { return Math.max(0, Math.min(1, this.done / Math.max(this.total, 1e-6))); }

  stop() {
    this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    this.v3.scene.remove(this.group);
  }
}

export const _test = { alongAt, lengthOf, at };
