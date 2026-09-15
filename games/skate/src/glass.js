/* glass.js — the windows, and putting a board through them.
 *
 * There is no "breakable" bit in a THPS level file. The game keeps that in its
 * own object tables and the disc indexes those by hashed name, with no
 * filenames to read, so the level is the only witness available. What the level
 * does say: in the Warehouse the four windows have surface flag 0x0191, every
 * one of them, and nothing else in that park carries it. tools/thps2glb.py
 * takes that flag, groups the faces into sheets — by touching corners, and by
 * object, because three glazed walls meeting at a corner are three windows and
 * not one — and writes each sheet out as its own `_Glass_NNN` node.
 *
 * This file is what happens to one afterwards: it is solid until you arrive
 * fast enough, and then it is not there any more.
 */
import * as THREE from 'three';
import { GLASS as G } from './config.js';

const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();

/** A triangle's three corners, in world space, out of a mesh. */
function worldTris(mesh) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const out = [];
  for (let i = 0; i < n; i += 3) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const j = idx ? idx.getX(i + k) : i + k;
      tri.push(new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(mesh.matrixWorld));
    }
    out.push(tri);
  }
  return out;
}

export class Glass {
  /**
   * @param {THREE.Scene} scene
   * @param {object} sfx  the noise-maker, for the crack
   */
  constructor(scene, sfx) {
    this.scene = scene;
    this.sfx = sfx;
    this.world = null;
    this.panes = [];
    this.onBreak = null;      // (pane) => void, for score and a toast

    /* ONE mesh for every shard in the park, ever.
     *
     * A pane breaking into forty pieces is forty things to draw, and the levels
     * that have glass have five or six panes. Rather than build and throw away
     * geometry per break, there is a single pool: live shards write their
     * corners into it each frame and dead ones collapse to a point, which costs
     * nothing to rasterise and saves rebuilding the buffer. */
    this.shards = [];
    const geo = new THREE.BufferGeometry();
    this.buf = new Float32Array(G.POOL * 9);
    geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3));
    /* Unlit on purpose. A shard of glass is only ever visible as a glint —
       there is nothing to shade — and the parks these appear in are dim
       interiors, so a lit material turned forty pieces of flying glass into
       forty dark specks against a bright doorway. */
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xdcf1fb, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false
    }));
    this.mesh.frustumCulled = false;   // the corners move without the bounds knowing
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.name = 'GlassShards';
    scene.add(this.mesh);
  }

  /** Point at a freshly loaded park. Safe to call with a park that has none. */
  setLevel(world, panes) {
    this.world = world;
    this.panes = (panes || []).map((p) => ({
      id: p.id, mesh: p.mesh, tris: worldTris(p.mesh), broken: false
    }));
    this.reset();
  }

  /** Put every window back — a fresh run gets fresh glass. */
  reset() {
    for (const p of this.panes) {
      p.broken = false;
      p.mesh.visible = true;
      if (this.world) this.world.revivePane(p.id);
    }
    this.shards.length = 0;
    this.buf.fill(0);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = false;
  }

  /**
   * Called on the fixed step, BEFORE the skater moves.
   *
   * The test is a ray along the way he is travelling, as long as this step's
   * travel plus a board: if the pane is what he is about to be stopped by, it
   * stops being there first and he carries on through the hole. Doing it after
   * the move instead would cost a frame of him standing on the window.
   *
   * @returns {number} panes broken this step
   */
  check(ctrl, dt) {
    if (!this.panes.length || !this.world) return 0;
    const vel = ctrl.velocity;
    const speed = vel.length();
    if (speed < G.MIN_SPEED) return 0;
    _dir.copy(vel).divideScalar(speed);
    /* from the chest, not the feet: the Warehouse's windows start six metres up
       and you meet them mid-air, board first but body behind it */
    _from.copy(ctrl.body.position).addScaledVector(ctrl.up_direction, G.EYE);
    const hit = this.world.probe(_from, _dir, speed * dt + G.REACH);
    if (!hit || hit.pane === null || hit.pane === undefined) return 0;
    return this.break(hit.pane, vel) ? 1 : 0;
  }

  /**
   * Smash one pane.
   * @returns {boolean} false if it was already gone
   */
  break(id, vel) {
    const pane = this.panes.find((p) => p.id === id);
    if (!pane || pane.broken) return false;
    if (!this.world.killPane(id)) return false;
    pane.broken = true;
    pane.mesh.visible = false;
    this._spawn(pane, vel);
    this.sfx?.smash();
    if (this.onBreak) this.onBreak(pane);
    return true;
  }

  /* Scatter the pieces.
   *
   * Shards come off the pane itself rather than out of a generic puff: a point
   * picked inside one of its real triangles, so the cloud has the window's shape
   * and sits in the window's plane. They carry a third of whatever was travelling
   * through them, which is what makes a fast hit spray forwards and a slow one
   * just drop out of the frame. */
  _spawn(pane, vel) {
    const n = Math.min(G.SHARDS, G.POOL - this.shards.length);
    for (let i = 0; i < n; i++) {
      const tri = pane.tris[(Math.random() * pane.tris.length) | 0];
      let u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const p = new THREE.Vector3().copy(tri[0])
        .addScaledVector(_p.copy(tri[1]).sub(tri[0]), u)
        .addScaledVector(_p.copy(tri[2]).sub(tri[0]), v);
      this.shards.push({
        p,
        v: new THREE.Vector3(
          vel.x * G.CARRY + (Math.random() - 0.5) * G.SPRAY,
          vel.y * G.CARRY + Math.random() * G.LIFT,
          vel.z * G.CARRY + (Math.random() - 0.5) * G.SPRAY
        ),
        q: new THREE.Quaternion().random(),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12
        ),
        size: G.SIZE * (0.5 + Math.random()),
        life: G.LIFE * (0.7 + Math.random() * 0.6)
      });
    }
    this.mesh.visible = true;
  }

  /** Frame time, not fixed step — the pieces are decoration. */
  update(dt) {
    if (!this.shards.length) return;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) { this.shards.splice(i, 1); continue; }
      s.v.y -= G.GRAVITY * dt;
      s.p.addScaledVector(s.v, dt);
      _q.set(s.spin.x * dt * 0.5, s.spin.y * dt * 0.5, s.spin.z * dt * 0.5, 1).normalize();
      s.q.multiply(_q);
    }
    this._writeBuffer();
    if (!this.shards.length) this.mesh.visible = false;
  }

  /* Three corners each, straight into the shared buffer. Anything past the live
     count collapses to the origin, which draws as nothing. */
  _writeBuffer() {
    const b = this.buf;
    const CORNERS = [[0, 0.9], [-0.8, -0.5], [0.8, -0.5]];
    for (let i = 0; i < G.POOL; i++) {
      const o = i * 9;
      const s = this.shards[i];
      if (!s) { b[o] = b[o + 1] = b[o + 2] = 0; b.fill(0, o, o + 9); continue; }
      _m.makeRotationFromQuaternion(s.q);
      for (let k = 0; k < 3; k++) {
        _p.set(CORNERS[k][0] * s.size, CORNERS[k][1] * s.size, 0).applyMatrix4(_m).add(s.p);
        b[o + k * 3] = _p.x; b[o + k * 3 + 1] = _p.y; b[o + k * 3 + 2] = _p.z;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  /** How many are left, for the HUD or a goal. */
  remaining() { return this.panes.filter((p) => !p.broken).length; }
  total() { return this.panes.length; }
}
