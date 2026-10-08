// Portal placement, validity, aim check and recursive-free portal rendering (oblique clip).
// Mixed into Game.prototype — every method runs with `this` = the Game.
export const Portals = {
  makePortal(color, c0, n, u) {
    const T = this.T, N = new T.Vector3(...n), U = new T.Vector3(...u), Rv = new T.Vector3().crossVectors(U, N);
    const c1 = [c0[0] + u[0], c0[1] + u[1], c0[2] + u[2]];
    const c = new T.Vector3(c0[0] + 0.5 + n[0] * 0.5 + u[0] * 0.5, c0[1] + 0.5 + n[1] * 0.5 + u[1] * 0.5, c0[2] + 0.5 + n[2] * 0.5 + u[2] * 0.5);
    const mat = new T.Matrix4().makeBasis(Rv, U, N).setPosition(c);
    return { color, cells: [c0, c1], nArr: n, n: N, u: U, r: Rv, c, mat, inv: mat.clone().invert(), sphere: new T.Sphere(c, 1.2), anim: 0 };
  },
  detachPortal(old) {
    this.scene.remove(old.group);
    for (const e of [this.pl, ...this.cubes]) if (e && e.inPortal === old) e.inPortal = null;
  },
  setPortal(P, silent, owner) {
    const T = this.T, old = this.portals[P.color];
    if (old) this.detachPortal(old);
    P.owner = owner || 'player';
    const g = new T.Group(); g.matrixAutoUpdate = false;
    g.matrix.makeTranslation(P.n.x * 0.004, P.n.y * 0.004, P.n.z * 0.004).multiply(P.mat);
    const inner = new T.Group();
    const surf = new T.Mesh(this.ellGeo, this.fmat[P.color]);
    const rim = new T.Mesh(this.rimGeo, this.rmat[P.color]); rim.position.z = 0.002;
    const glow = new T.Mesh(this.glowGeo, this.gmat[P.color]); glow.position.z = 0.01; glow.renderOrder = 2;
    inner.add(surf, rim, glow);
    const near = new T.Mesh(this.nearGeo, this.nmat[P.color]); near.visible = false; near.renderOrder = 10;
    g.add(inner, near); g.updateMatrixWorld(true);
    Object.assign(P, { group: g, inner, surf, near, glow });
    inner.scale.setScalar(P.anim || 0.01);
    this.scene.add(g); this.portals[P.color] = P;
    if (!silent) { this.updatePairs(); this.syncHave(); }
  },
  clearPlayerPortals() {
    let any = false;
    for (const k of ['a', 'b']) { const P = this.portals[k]; if (P && P.owner === 'player') { this.detachPortal(P); this.portals[k] = null; any = true; } }
    if (any) { this.syncHave(); this.toast('The clean field cleared your portals'); }
  },
  updatePairs() {
    const A = this.portals.a, B = this.portals.b;
    if (A && B) { this.M_AB = B.mat.clone().multiply(this.rotY).multiply(A.inv); this.M_BA = A.mat.clone().multiply(this.rotY).multiply(B.inv); }
  },
  syncHave() { const a = !!this.portals.a, b = !!this.portals.b; if (a !== this.state.haveA || b !== this.state.haveB) this.setState({ haveA: a, haveB: b }); },
  rayVox(o, d, max) {
    const p = [Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)], dv = [d.x, d.y, d.z], ov = [o.x, o.y, o.z];
    const st = dv.map((v) => (v > 0 ? 1 : -1)), tD = dv.map((v) => (v ? Math.abs(1 / v) : Infinity));
    const tM = dv.map((v, a) => (v ? (v > 0 ? p[a] + 1 - ov[a] : ov[a] - p[a]) * tD[a] : Infinity));
    for (let i = 0; i < 400; i++) {
      const a = tM[0] < tM[1] ? (tM[0] < tM[2] ? 0 : 2) : tM[1] < tM[2] ? 1 : 2;
      const t = tM[a]; if (t > max) return null;
      p[a] += st[a]; tM[a] += tD[a];
      const ty = this.type(p[0], p[1], p[2]);
      if (this.blocks(ty)) { const n = [0, 0, 0]; n[a] = -st[a]; return { cell: p.slice(), n, t, type: ty, p: new this.T.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) }; }
    }
    return null;
  },
  rayBox(o, d, mn, mx) {
    let t0 = 0, t1 = Infinity;
    for (const k of ['x', 'y', 'z']) {
      const inv = 1 / d[k]; let a = (mn[k] - o[k]) * inv, b = (mx[k] - o[k]) * inv;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity;
    }
    return t0;
  },
  validPortal(color, c0, n, u) {
    for (let i = 0; i < 2; i++) {
      const c = [c0[0] + u[0] * i, c0[1] + u[1] * i, c0[2] + u[2] * i];
      if (this.type(...c) !== 1 || this.type(c[0] + n[0], c[1] + n[1], c[2] + n[2]) !== 0) return false;
      if (n[1] !== 0 && this.type(c[0] + 2 * n[0], c[1] + 2 * n[1], c[2] + 2 * n[2]) !== 0) return false;
    }
    const o = this.portals[color === 'a' ? 'b' : 'a'];
    if (o && o.nArr.join() === n.join()) {
      const mine = [c0.join(), [c0[0] + u[0], c0[1] + u[1], c0[2] + u[2]].join()];
      if (o.cells.some((oc) => mine.includes(oc.join()))) return false;
    }
    return true;
  },
  tryPlace(color, hit, fwd) {
    if (hit.type === 5) return { fail: 'glass' };
    if (hit.type !== 1) return { fail: 'metal' };
    const n = hit.n;
    const u = n[1] === 0 ? [0, 1, 0] : Math.abs(fwd.x) > Math.abs(fwd.z) ? [Math.sign(fwd.x) || 1, 0, 0] : [0, 0, Math.sign(fwd.z) || 1];
    const r = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
    const cands = [];
    for (const f of [-2, -1, 0, 1]) for (const l of [-1, 0, 1]) {
      const c0 = [0, 1, 2].map((a) => hit.cell[a] + u[a] * f + r[a] * l);
      const cx = c0[0] + 0.5 + n[0] * 0.5 + u[0] * 0.5, cy = c0[1] + 0.5 + n[1] * 0.5 + u[1] * 0.5, cz = c0[2] + 0.5 + n[2] * 0.5 + u[2] * 0.5;
      let d = Math.hypot(cx - hit.p.x, cy - hit.p.y, cz - hit.p.z);
      if (n[1] === 0) { const t = this.type(c0[0] + n[0], c0[1] - 1, c0[2] + n[2]); if (t === 1 || t === 2) d -= 0.4; }
      cands.push({ c0, d });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) { if (c.d > 1.8) break; if (this.validPortal(color, c.c0, n, u)) return { portal: this.makePortal(color, c.c0, n, u) }; }
    return { fail: 'room' };
  },
  fireAt(nx, ny, color) {
    if (this.state.screen !== 'play' || this.dead > 0 || !this.T) return;
    if (this.gun === 'none') return;
    if (this.gun === 'blue' && color === 'b') return;
    const T = this.T, cam = this.camera; cam.updateMatrixWorld();
    const o = cam.position.clone(), d = new T.Vector3(nx, ny, 0.5).unproject(cam).sub(o).normalize();
    const fwd = cam.getWorldDirection(new T.Vector3());
    let hit = this.rayVox(o, d, 80);
    const plat = this.platHit(o, d, hit ? hit.t : 80);
    if (plat) hit = { p: o.clone().addScaledVector(d, plat), t: plat, type: 'platform' };
    const pane = this.paneHit(o, d, hit ? hit.t : 80);
    if (pane) hit = { p: o.clone().addScaledVector(d, pane), t: pane, type: 5 };
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), down = new T.Vector3(0, -1, 0).applyQuaternion(cam.quaternion);
    const g0 = o.clone().addScaledVector(right, 0.22).addScaledVector(down, 0.2).addScaledVector(fwd, 0.3);
    const end = hit ? hit.p.clone() : o.clone().addScaledVector(d, 40);
    const res = !hit ? null : hit.type === 'platform' ? { fail: 'platform' } : this.tryPlace(color, hit, fwd);
    this.play(color === 'a' ? 'fireBlue' : 'firePink'); this.lastFired = color;
    this.launchShot(color, g0, end, res);
  },
  // Portal shot: a swirling ball of energy that flies to the wall; the portal opens when it lands.
  makeShot(c) {
    const T = this.T;
    if (!this.shotRes) {
      const map = this.gmat.a.map, add = { transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false };
      this.shotRes = { ring: new T.TorusGeometry(0.15, 0.013, 6, 36), m: {} };
      for (const k of ['a', 'b']) this.shotRes.m[k] = {
        core: new T.SpriteMaterial(Object.assign({ map, color: 0xffffff }, add)),
        halo: new T.SpriteMaterial(Object.assign({ map, color: this.COL[k], opacity: 0.9 }, add)),
        ring: new T.MeshBasicMaterial(Object.assign({ color: this.COL[k], opacity: 0.95 }, add)),
        trail: new T.SpriteMaterial(Object.assign({ map, color: this.COL[k], opacity: 0.5 }, add)),
      };
    }
    const M = this.shotRes.m[c], g = new T.Group();
    const halo = new T.Sprite(M.halo); halo.scale.setScalar(0.6);
    const core = new T.Sprite(M.core); core.scale.setScalar(0.2);
    const r1 = new T.Mesh(this.shotRes.ring, M.ring), r2 = new T.Mesh(this.shotRes.ring, M.ring); r2.scale.setScalar(0.78);
    g.add(halo, core, r1, r2);
    const trail = [];
    for (let i = 0; i < 6; i++) { const sp = new T.Sprite(M.trail.clone()); sp.scale.setScalar(0.42 - i * 0.05); sp.visible = false; trail.push(sp); this.scene.add(sp); }
    return { g, halo, core, r1, r2, trail };
  },
  launchShot(color, from, to, res) {
    const sh = this.makeShot(color), dist = from.distanceTo(to);
    sh.g.position.copy(from); this.scene.add(sh.g);
    (this.shots || (this.shots = [])).push(Object.assign(sh, { from: from.clone(), to: to.clone(), t: 0, dur: Math.min(0.45, Math.max(0.07, dist / 40)), res, color, token: this.loadToken, hist: [] }));
  },
  updateShots(dt) {
    if (!this.shots || !this.shots.length) return;
    for (const s of this.shots.slice()) {
      if (s.burst) { s.bt += dt; const k = s.bt / 0.26; s.g.scale.setScalar(1 + k * 2.4); s.core.visible = k < 0.5; if (k >= 1) this.endShot(s); continue; }
      s.t += dt; const k = Math.min(1, s.t / s.dur);
      s.g.position.lerpVectors(s.from, s.to, k);
      const tm = this.time;
      s.r1.rotation.set(tm * 9, tm * 13, 0); s.r2.rotation.set(-tm * 11, 0, tm * 15);
      s.halo.scale.setScalar(0.6 + Math.sin(tm * 40) * 0.07); s.halo.material.rotation = tm * 6;
      s.hist.unshift(s.g.position.clone()); if (s.hist.length > 12) s.hist.pop();
      s.trail.forEach((sp, i) => { const q = s.hist[i * 2 + 1]; if (q) { sp.visible = true; sp.position.copy(q); sp.material.opacity = 0.45 * (1 - i / 6); } });
      if (k >= 1) this.landShot(s);
    }
  },
  landShot(s) {
    s.burst = true; s.bt = 0; s.r1.visible = s.r2.visible = false; s.trail.forEach((sp) => (sp.visible = false));
    if (s.token !== this.loadToken || !s.res) return;
    const P = s.res.portal;
    if (P && this.validPortal(s.color, P.cells[0], P.nArr, [P.u.x, P.u.y, P.u.z])) {
      this.portalCount = (this.portalCount || 0) + 1; this.setPortal(P, false, 'player');
      this.play('hitPortal');
    } else {
      const f = P ? 'room' : s.res.fail;
      this.play('hitFizzle');
      const msg = f === 'glass' ? 'Portals can\'t go through glass' : f === 'platform' ? 'Portals don\'t stick to platforms' : f === 'metal' ? 'Portals only stick to white panels' : 'No room for a portal there';
      this.hintCount = this.hintCount || {};
      if ((this.hintCount[msg] = (this.hintCount[msg] || 0) + 1) <= 2) this.toast(msg);
    }
  },
  endShot(s) {
    this.scene.remove(s.g); s.trail.forEach((sp) => { this.scene.remove(sp); sp.material.dispose(); });
    this.shots = this.shots.filter((x) => x !== s);
  },
  clearShots() { (this.shots || []).slice().forEach((s) => this.endShot(s)); this.shots = []; },
  platHit(o, d, max) {
    let best = 0;
    for (const q of this.platforms || []) { const b = this.platBox(q), t = this.rayBox(o, d, { x: b[0], y: b[1], z: b[2] }, { x: b[3], y: b[4], z: b[5] }); if (t > 0 && t < max && (!best || t < best)) best = t; }
    return best;
  },
  aimCheck() {
    if (this.state.screen !== 'play' || !this.T) return;
    if ((this._aimN = (this._aimN || 0) + 1) % 3) return;
    const cam = this.camera; cam.updateMatrixWorld();
    const d = cam.getWorldDirection(this.v.aimD || (this.v.aimD = new this.T.Vector3()));
    const hit = this.rayVox(cam.position, d, 80);
    const ok = !!(hit && hit.type === 1 && !this.platHit(cam.position, d, hit.t) && !this.paneHit(cam.position, d, hit.t) && this.tryPlace('a', hit, d).portal);
    const pads = this.pads.length ? this.pads.filter((p) => p.down).length + '/' + this.pads.length : '';
    if (ok !== this.state.aimOK || pads !== this.state.pads) this.setState({ aimOK: ok, pads });
  },
  oblique(cam, n, pt) {
    const pl = this.v.plane.setFromNormalAndCoplanarPoint(n, pt).applyMatrix4(cam.matrixWorldInverse);
    const c = this.v.c4.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant), m = cam.projectionMatrix.elements;
    const q = this.v.q4.set((Math.sign(c.x) + m[8]) / m[0], (Math.sign(c.y) + m[9]) / m[5], -1, (1 + m[10]) / m[14]);
    c.multiplyScalar(2 / c.dot(q));
    m[2] = c.x; m[6] = c.y; m[10] = c.z + 1; m[14] = c.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  },
  render() {
    const R = this.renderer, cam = this.camera, A = this.portals.a, B = this.portals.b, vc = this.vcam;
    R.info.reset(); this.passes = 0;
    cam.updateMatrixWorld(true);
    const ok = !!(A && B);
    for (const P of [A, B]) if (P) { P.surf.material = this.fmat[P.color]; P.near.visible = false; P.surf.visible = true; P.glow.visible = true; }
    if (ok) {
      this.v.fr.setFromProjectionMatrix(this.v.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      this.frameN = (this.frameN || 0) + 1;
      const vis = [A, B].filter((P) => this.v.t.copy(cam.position).sub(P.c).dot(P.n) > 0 && this.v.fr.intersectsSphere(P.sphere));
      const only = this.altPortals && vis.length === 2 && A.rtReady && B.rtReady ? vis[this.frameN % 2] : null;
      for (const [P, Q, M] of [[A, B, this.M_AB], [B, A, this.M_BA]]) {
        const t = this.v.t.copy(cam.position).sub(P.c);
        if (t.dot(P.n) <= 0 || !this.v.fr.intersectsSphere(P.sphere)) { P.skip = true; continue; }
        if (only && P !== only) { P.skip = false; continue; }
        P.skip = false;
        vc.matrixWorld.multiplyMatrices(M, cam.matrixWorld);
        vc.matrixWorld.decompose(vc.position, vc.quaternion, vc.scale);
        vc.updateMatrixWorld(true);
        vc.projectionMatrix.copy(cam.projectionMatrix);
        this.oblique(vc, Q.n, Q.c);
        Q.group.visible = false;
        R.setRenderTarget(this.rt[P.color]); R.clear(); R.render(this.scene, vc);
        Q.group.visible = true; this.passes++; P.rtReady = true;
      }
      for (const P of [A, B]) {
        if (P.skip) continue;
        const rel = this.v.t.copy(cam.position).sub(P.c), dn = rel.dot(P.n);
        const isNear = dn > -0.05 && dn < 0.5 && Math.abs(rel.dot(P.r)) < 0.5 && Math.abs(rel.dot(P.u)) < 1.0;
        P.surf.material = this.pmat[P.color]; P.near.visible = isNear; P.surf.visible = !isNear; P.glow.visible = !isNear;
      }
    }
    R.setRenderTarget(null); R.render(this.scene, cam);
  },
};
