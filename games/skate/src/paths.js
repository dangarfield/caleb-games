/* paths.js — the rails.
 *
 * In the original a rail is a Blender polyline exported into the glTF as a
 * LINES primitive, which Godot's park_import.gd turns into a Path3D/Curve3D and
 * grinds are then pure curve arithmetic: sample_baked(offset), a tangent, an up
 * vector, a baked length. Godot's Curve3D is doing arc-length work for free, so
 * this file rebuilds that much of it and nothing more.
 *
 * A PathCurve is a polyline with a baked cumulative-length table. Offsets are in
 * metres along the rail, exactly like Godot's, which lets every ported line of
 * grind/lip/pipe code keep its numbers.
 */
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class PathCurve {
  /** @param {THREE.Vector3[]} points already in world space, in order */
  constructor(points, name = '') {
    this.name = name;
    this.points = points;
    this.closed = points.length > 2 &&
      points[0].distanceTo(points[points.length - 1]) < 0.05;
    if (this.closed) this.points = points.slice(0, -1);

    /* cumulative arc length at each vertex */
    const n = this.points.length;
    this.acc = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const nx = this.points[(i + 1) % n];
      const seg = (i === n - 1 && !this.closed) ? 0 : this.points[i].distanceTo(nx);
      this.acc[i + 1] = this.acc[i] + seg;
    }
    this.length = this.acc[n];

    /* Godot's Curve3D bakes an up vector per point by parallel-transporting a
       frame along the curve, so a rail that climbs the bank of a bowl leans the
       skater into it. Same thing here: start from world up made perpendicular
       to the first segment, then rotate it by whatever rotates each tangent
       into the next. */
    this.ups = this._bakeUpVectors();

    const box = new THREE.Box3().setFromPoints(this.points);
    this.center = box.getCenter(new THREE.Vector3());
    this.radius = box.getSize(new THREE.Vector3()).length() * 0.5 + 1.0;
  }

  _bakeUpVectors() {
    const n = this.points.length;
    const seg = (i) => new THREE.Vector3()
      .subVectors(this.points[(i + 1) % n], this.points[i % n]).normalize();
    const ups = [];
    let t = seg(0);
    if (t.lengthSq() < 0.5) t = new THREE.Vector3(0, 0, 1);
    let up = new THREE.Vector3(0, 1, 0);
    up.addScaledVector(t, -up.dot(t));
    if (up.lengthSq() < 1e-6) up.set(1, 0, 0).addScaledVector(t, -t.x);
    up.normalize();
    ups.push(up.clone());
    const q = new THREE.Quaternion();
    const last = this.closed ? n : n - 1;
    for (let i = 1; i <= last; i++) {
      const next = seg(i % n);
      if (next.lengthSq() > 0.5) {
        q.setFromUnitVectors(t, next);
        up.applyQuaternion(q).normalize();
        t = next;
      }
      if (ups.length < n) ups.push(up.clone());
    }
    while (ups.length < n) ups.push(up.clone());
    /* a rail is grindable from above, so never hand back an "up" that points
       into the ground — that would stand the skater on their head */
    for (const u of ups) if (u.y < 0) u.multiplyScalar(-1);
    return ups;
  }

  /* Vertex index and local t for an offset in metres. */
  _locate(offset) {
    const n = this.points.length;
    let o = offset;
    if (this.closed) o = ((o % this.length) + this.length) % this.length;
    else o = Math.max(0, Math.min(this.length, o));
    let lo = 0, hi = n;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.acc[mid] <= o) lo = mid; else hi = mid;
    }
    const segLen = this.acc[lo + 1] - this.acc[lo];
    const t = segLen > 1e-6 ? (o - this.acc[lo]) / segLen : 0;
    return { i: lo, t, n };
  }

  /** Godot: curve.sample_baked(offset, true) in global space */
  sample(offset, out = new THREE.Vector3()) {
    const { i, t, n } = this._locate(offset);
    const a = this.points[i % n];
    const b = this.points[(i + 1) % n];
    return out.copy(a).lerp(b, t);
  }

  /** Godot: LibHelpers.get_path_tangent — flattened to horizontal, normalised */
  tangent(offset, out = new THREE.Vector3()) {
    const { i, n } = this._locate(offset);
    const a = this.points[i % n];
    const b = this.points[(i + 1) % n];
    out.copy(b).sub(a);
    out.y = 0;
    if (out.lengthSq() < 1e-9) {
      const c = this.points[(i + 2) % n];
      out.copy(c).sub(a); out.y = 0;
    }
    return out.normalize();
  }

  /** The 3D direction of the rail here, height included — used to sit on it. */
  slope(offset, out = new THREE.Vector3()) {
    const { i, n } = this._locate(offset);
    return out.copy(this.points[(i + 1) % n]).sub(this.points[i % n]).normalize();
  }

  /** Godot: curve.sample_baked_up_vector(offset) */
  up(offset, out = new THREE.Vector3()) {
    const { i, t, n } = this._locate(offset);
    return out.copy(this.ups[i % n]).lerp(this.ups[(i + 1) % n], t).normalize();
  }

  /** Godot: curve.get_closest_offset(local_pos) */
  closestOffset(pos) {
    const n = this.points.length;
    let best = 0, bestD = Infinity;
    const last = this.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = this.points[i], b = this.points[(i + 1) % n];
      _a.copy(b).sub(a);
      const len2 = _a.lengthSq();
      let t = len2 > 1e-9 ? _b.copy(pos).sub(a).dot(_a) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      _b.copy(a).addScaledVector(_a, t);
      const d = _b.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = this.acc[i] + t * (this.acc[i + 1] - this.acc[i]); }
    }
    this.lastDistance = Math.sqrt(bestD);
    return best;
  }

  /** Godot: LibHelpers.get_stick_curve — are we clear of both ends? */
  stick(offset, threshold) {
    if (this.closed) return true;
    return offset > threshold && offset < this.length - threshold;
  }

  /** Godot: LibHelpers.wrap_curve */
  wrap(offset) {
    if (!this.closed) return offset;
    return ((offset % this.length) + this.length) % this.length;
  }
}

/**
 * Godot: LibHelpers.get_closest_path — the nearest rail whose bounding sphere
 * we are inside. The original used an Area3D on the player and the "rampRail"
 * group; a distance test over a handful of rails is the same answer for less.
 */
export function closestPath(paths, pos, reach = 2.2) {
  let best = null, bestD = Infinity;
  for (const p of paths) {
    if (pos.distanceTo(p.center) > p.radius + reach) continue;
    p.closestOffset(pos);
    if (p.lastDistance < bestD && p.lastDistance < reach) { bestD = p.lastDistance; best = p; }
  }
  return best;
}
