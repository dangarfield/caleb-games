import { buildGun } from './gun.js';
// Boxes, droppers, pads, round doors, moving platforms, gun pedestal and the sentry robot.
// Mixed into Game.prototype — every method runs with `this` = the Game.
export const Props = {
  // Round 3×3 door (from the reference): dark ring with a lit inlay, two thick white leaves with bracket notches, state lights.
  // Lights: amber while locked, lime when open; exit doors are lime from the start.
  doorTex() {
    const key = 'doorTex'; if (this.mat[key]) return this.mat[key];
    const T = this.T;
    const tex = this.canvasTex(512, (g, S) => {
      const P = (x, y) => [(x + 1) / 2 * S, (1 - y) / 2 * S];
      const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#F2F5F6'); grd.addColorStop(1, '#D3DADF'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#2B3438'; g.lineCap = 'round'; g.lineJoin = 'round';
      {
        for (const sx of [-1, 1]) {
          const pts = [[0.66, 0.6], [0.34, 0.3], [0.3, 0], [0.34, -0.3], [0.66, -0.6]].map(([x, y]) => P(sx * x, y));
          g.fillStyle = 'rgba(43,52,56,0.12)'; g.beginPath(); g.moveTo(...P(sx * 0.95, 0.6)); pts.forEach((q, i) => i ? (i === 2 ? g.quadraticCurveTo(...P(sx * 0.26, 0.15), ...q) : i === 3 ? g.quadraticCurveTo(...P(sx * 0.26, -0.15), ...q) : g.lineTo(...q)) : g.lineTo(...q)); g.lineTo(...P(sx * 0.95, -0.6)); g.closePath(); g.fill();
          g.lineWidth = 11; g.beginPath(); pts.forEach((q, i) => i ? (i === 2 ? g.quadraticCurveTo(...P(sx * 0.26, 0.15), ...q) : i === 3 ? g.quadraticCurveTo(...P(sx * 0.26, -0.15), ...q) : g.lineTo(...q)) : g.moveTo(...q)); g.stroke();
        }
      }
      g.lineWidth = 4; g.strokeStyle = 'rgba(43,52,56,0.55)'; g.beginPath(); g.moveTo(...P(0, 1)); g.lineTo(...P(0, -1)); g.stroke();
    });
    tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.repeat.set(0.5, 0.5); tex.offset.set(0.5, 0.5);
    this.mat[key] = new T.MeshBasicMaterial({ map: tex });
    return this.mat[key];
  },
  buildDoor(d) {
    const T = this.T, g = new T.Group(), [x, y, z] = d.cell;
    if (d.axis === 'x') g.position.set(x + 1.5, y + 1.5, z + 0.5); else { g.position.set(x + 0.5, y + 1.5, z + 1.5); g.rotation.y = Math.PI / 2; }
    g.scale.set(1.5, 1.5, 1);
    const DROP = -0.32, HR = 0.97, dy = -1 - DROP, hx = Math.sqrt(HR * HR - dy * dy);
    const sq = new T.Shape(); sq.moveTo(-1, -1); sq.lineTo(-hx, -1); sq.absarc(0, DROP, HR, Math.atan2(dy, -hx), Math.atan2(dy, hx), true); sq.lineTo(1, -1); sq.lineTo(1, 1); sq.lineTo(-1, 1); sq.closePath();
    const cg = new T.Group(); cg.position.y = DROP; g.add(cg);
    const plateGeo = new T.ShapeGeometry(sq, 40);
    { // UVs in world metres so the frame lines up with the 1 m metal panels; baked face shade like the voxel walls
      const pos = plateGeo.attributes.position, uv = plateGeo.attributes.uv, n = pos.count, col = new Float32Array(n * 3);
      const shade = Math.pow(d.axis === 'z' ? 0.86 : 0.76, 2.2);
      for (let i = 0; i < n; i++) { uv.setXY(i, (pos.getX(i) + 1) * 1.5, (pos.getY(i) + 1) * 1.5); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade; }
      plateGeo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    }
    const ringMat = new T.MeshBasicMaterial({ color: d.exit ? 0x2bf0d6 : 0xffb23f, fog: false });
    this.mat.doorRing = this.mat.doorRing || new T.MeshBasicMaterial({ color: 0x1a2124 });
    this.mat.doorPlate = this.mat.doorPlate || new T.MeshBasicMaterial({ map: this.mat[2].map, color: 0xa9b1bd });
    const tube = 0.11;
    for (const s of [1, -1]) {
      const pl = new T.Mesh(plateGeo, this.mat[2]); pl.position.z = 0.501 * s; if (s < 0) { pl.rotation.y = Math.PI; pl.scale.x = -1; } g.add(pl);
      const tor = new T.Mesh(new T.TorusGeometry(0.985, tube, 10, 64), this.mat.doorRing); tor.position.z = 0.5 * s; cg.add(tor);
      { const inl = new T.Mesh(new T.RingGeometry(0.965, 1.005, 64), ringMat); inl.position.z = (0.5 + tube + 0.002) * s; if (s < 0) inl.rotation.y = Math.PI; cg.add(inl); }
    }
    const inner = new T.Mesh(new T.CylinderGeometry(0.985, 0.985, 1.0, 64, 1, true), this.mat.doorRing); inner.rotation.x = Math.PI / 2; inner.material.side = T.DoubleSide; cg.add(inner);
    const LR = 0.93, LD = 0.9, face = this.doorTex();
    const half = (a0, a1) => { const s = new T.Shape(); s.moveTo(0, -LR); s.absarc(0, 0, LR, a0, a1, false); s.lineTo(0, LR); s.closePath(); return new T.ExtrudeGeometry(s, { depth: LD, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, -LD / 2); };
    const Lf = new T.Mesh(half(Math.PI / 2, Math.PI * 1.5), [face, this.mat.doorRing]), Rf = new T.Mesh(half(-Math.PI / 2, Math.PI / 2), [face, this.mat.doorRing]);
    const lights = (leaf, sx) => {
      const dot = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, LD + 0.02, 24, 1, false, sx > 0 ? 0 : Math.PI, Math.PI), ringMat); dot.rotation.x = Math.PI / 2; leaf.add(dot);
      const st = new T.Mesh(new T.BoxGeometry(0.24, 0.045, LD + 0.02), ringMat); st.position.x = sx * 0.6; leaf.add(st);
    };
    lights(Lf, -1); lights(Rf, 1);
    cg.add(Lf, Rf); this.levelGroup.add(g);
    if (d.exit && !d.noBack) {
      const neg = d.axis === 'x' ? this.type(x, y, z - 1) : this.type(x - 1, y, z);
      const back = neg === 1 || neg === 2 || neg === 5 ? -1 : 1;
      const disc = new T.CircleGeometry(0.97, 48);
      const dark = new T.Mesh(disc, this.mat.exitBack); dark.position.z = back * 0.495; dark.rotation.y = back > 0 ? Math.PI : 0; cg.add(dark);
      const glow = new T.Mesh(disc, this.mat.exitGlow); glow.position.z = back * 0.485; glow.rotation.y = dark.rotation.y; glow.renderOrder = 2; cg.add(glow);
      const ring = new T.Mesh(new T.RingGeometry(0.62, 0.68, 40), this.mat.exit); ring.position.z = back * 0.48; ring.rotation.y = dark.rotation.y; cg.add(ring);
    }
    const cells = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push(d.axis === 'x' ? [x + i, y + j, z] : [x, y + j, z + i]);
    // Threshold floor: a graphite sill across the opening, covering the cut-off base of the ring and leaves.
    const sill = new T.Mesh(new T.BoxGeometry(2, 0.02, 1.0), this.mat.doorRing); sill.position.y = -1 + 0.01; g.add(sill);
    for (const s of [1, -1]) { const lip = new T.Mesh(new T.BoxGeometry(2, 0.022, 0.03), ringMat); lip.position.set(0, -1 + 0.011, s * 0.47); g.add(lip); }
    const D = { g, L: Lf, R: Rf, ringMat, amt: 0, cells, exit: !!d.exit, floorY: y };
    if (!d.noBack) {
      // Cull everything outside the door's own 3×3 opening: nothing below the threshold, nothing past the sides (leaves slide into the wall and vanish).
      const P = (nx, ny, nz, c) => new T.Plane(new T.Vector3(nx, ny, nz), c);
      const planes = [P(0, 1, 0, -y)].concat(d.axis === 'x' ? [P(1, 0, 0, -x), P(-1, 0, 0, x + 3)] : [P(0, 0, 1, -z), P(0, 0, -1, z + 3)]);
      this.clipDoor(D, planes, [planes[0]]);
    }
    return D;
  },
  // Leaves get every plane (cut at the threshold and at the sides of the opening); the frame only gets frameP (threshold), so its ring stays round.
  clipDoor(D, planes, frameP) {
    const keep = [this.mat.exitGlow, this.mat.exitBack, this.mat.exit], caches = [new Map(), new Map()];
    const cl = (m, k) => { if (keep.includes(m)) return m; const ps = k ? planes : (frameP || planes), c = caches[k]; if (!c.has(m)) { const n = m.clone(); n.clippingPlanes = ps; c.set(m, n); } return c.get(m); };
    const leaf = new Set(); [D.L, D.R].forEach((l) => l && l.traverse((o) => leaf.add(o)));
    D.g.traverse((o) => { if (!o.isMesh) return; const k = leaf.has(o) ? 1 : 0; o.material = Array.isArray(o.material) ? o.material.map((m) => cl(m, k)) : cl(o.material, k); });
    const orig = D.ringMat; D.ringMats = [caches[0].get(orig), caches[1].get(orig)].filter(Boolean); D.ringMat = D.ringMats[0] || orig;
  },
  buildPlatform(s) {
    const T = this.T, w = s.size[0], dd = s.size[1], pts = s.path.map((q) => ({ x: q[0], y: q[1], z: q[2] }));
    const g = new T.Group();
    const slab = new T.Mesh(this.shadeBox(new T.BoxGeometry(w, 0.5, dd)), this.mat.platform); slab.position.y = -0.25; g.add(slab);
    const bandMat = new T.MeshBasicMaterial({ color: 0xffb23f, fog: false });
    const band = new T.Mesh(new T.BoxGeometry(w + 0.02, 0.07, dd + 0.02), bandMat); band.position.y = -0.27; g.add(band);
    g.position.set(pts[0].x, pts[0].y, pts[0].z); this.levelGroup.add(g);
    return { w, d: dd, pts, i: 0, dir: 1, wait: s.wait ?? 1, waitT: s.wait ?? 1, speed: s.speed || 2, powered: !!s.powered, x: pts[0].x, y: pts[0].y, z: pts[0].z, dx: 0, dy: 0, dz: 0, g, bandMat, moving: false };
  },
  platBox(q) { return [q.x - q.w / 2, q.y - 0.5, q.z - q.d / 2, q.x + q.w / 2, q.y, q.z + q.d / 2]; },
  updatePlatforms(dt) {
    if (!this.platforms.length) return;
    const riders = [this.pl, ...this.cubes.filter((c) => c !== this.held)];
    for (const q of this.platforms) {
      q.dx = q.dy = q.dz = 0; q.moving = false;
      if (q.pts.length < 2 || (q.powered && !this.padsAll)) continue;
      if (q.waitT > 0) { q.waitT -= dt; continue; }
      let ni = q.i + q.dir;
      if (ni < 0 || ni >= q.pts.length) { q.dir = -q.dir; ni = q.i + q.dir; }
      const t = q.pts[ni], vx = t.x - q.x, vy = t.y - q.y, vz = t.z - q.z, dist = Math.hypot(vx, vy, vz), stepL = q.speed * dt;
      const k = dist <= stepL || dist < 1e-6 ? 1 : stepL / dist;
      q.dx = vx * k; q.dy = vy * k; q.dz = vz * k; q.moving = true;
      const riding = riders.filter((e) => e.onGround && Math.abs(e.y - e.hh - q.y) < 0.08 && e.x + e.hw > q.x - q.w / 2 && e.x - e.hw < q.x + q.w / 2 && e.z + e.hw > q.z - q.d / 2 && e.z - e.hw < q.z + q.d / 2);
      q.x += q.dx; q.y += q.dy; q.z += q.dz;
      for (const e of riding) { e.x += q.dx; e.y += q.dy; e.z += q.dz; }
      if (k === 1) { q.i = ni; if (q.i === 0 || q.i === q.pts.length - 1) q.waitT = q.wait; }
    }
  },
  buildPad(p) {
    const T = this.T, g = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(0.66, 0.7, 0.08, 28), this.mat.dark); base.position.y = 0.04;
    const topMat = new T.MeshBasicMaterial({ color: 0xffb23f });
    const top = new T.Mesh(new T.CylinderGeometry(0.52, 0.52, 0.1, 28), topMat); top.position.y = 0.13;
    g.add(base, top); g.position.set(p[0], p[1], p[2]); this.levelGroup.add(g);
    return { x: p[0], y: p[1], z: p[2], top, topMat, down: false };
  },
  buildDropper(d) {
    const T = this.T, cy = this.dims[1] - 1, g = new T.Group();
    const tube = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 1.3, 20, 1, true), this.mat.tube); tube.position.y = -0.65;
    const lip = new T.Mesh(new T.TorusGeometry(0.56, 0.06, 6, 24), this.mat.amber); lip.rotation.x = Math.PI / 2; lip.position.y = -1.3;
    g.add(tube, lip); g.position.set(d.x, cy, d.z); this.levelGroup.add(g);
    return { x: d.x, y: cy - 1.0, z: d.z, trigger: d.trigger || null, wait: d.trigger ? -1 : 0.05, cube: null };
  },
  spawnCube(d) {
    if (!this.boxSeen) { this.boxSeen = true; this.setState({ boxSeen: true }); }
    const T = this.T, mesh = new T.Mesh(this.shadeBox(new T.BoxGeometry(0.7, 0.7, 0.7)), this.mat.crate);
    this.levelGroup.add(mesh);
    const c = { x: d.x, y: d.y, z: d.z, vx: 0, vy: 0, vz: 0, hw: 0.35, hh: 0.35, eye: 0, onGround: false, inPortal: null, d, mesh };
    this.cubes.push(c); d.cube = c; this.play('dropper');
  },
  removeCube(c, msg) {
    this.levelGroup.remove(c.mesh); c.mesh.geometry.dispose();
    this.cubes = this.cubes.filter((k) => k !== c); if (this.held === c) this.held = null;
    c.d.cube = null; c.d.wait = 0.8; if (msg) this.toast(msg);
  },
  buildPedestal(p, gives = 'blue') {
    const T = this.T, g = new T.Group(), both = gives === 'both';
    const base = new T.Mesh(new T.CylinderGeometry(0.32, 0.42, 0.9, 20), this.mat.dark); base.position.y = 0.45;
    const pinkMat = both ? new T.MeshBasicMaterial({ color: 0xff4fc8, fog: false }) : null;
    const gunM = buildGun(T, both ? 0xff4fc8 : 0x3b8cff), gun = new T.Group(); gunM.group.scale.setScalar(1.4); gunM.group.position.set(0, -0.08, -0.22); gun.add(gunM.group);
    gun.position.y = 1.25; g.add(base, gun);
    if (both) {
      const ring = new T.Mesh(new T.TorusGeometry(0.36, 0.035, 8, 32), pinkMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.92; g.add(ring);
      const glow = new T.Mesh(this.glowGeo, this.gmat.b); glow.scale.setScalar(0.55); glow.position.y = 1.25; glow.renderOrder = 2; gun.add(glow);
    }
    g.position.set(p[0], p[1], p[2]); this.levelGroup.add(g);
    return { x: p[0], y: p[1], z: p[2], g, gun };
  },
  buildTurret(t) {
    const T = this.T, root = new T.Group(), g = new T.Group(); root.add(g);
    const leg = new T.BoxGeometry(0.07, 0.6, 0.07);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, m = new T.Mesh(leg, this.mat.dark); m.position.set(Math.sin(a) * 0.2, 0.26, Math.cos(a) * 0.2); m.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4); g.add(m); }
    const bodyM = new T.Mesh(new T.CapsuleGeometry(0.26, 0.42, 4, 14), this.mat.botBody); bodyM.position.y = 0.78; g.add(bodyM);
    const cap = new T.Mesh(new T.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat.botTop); cap.position.y = 1.06; g.add(cap);
    const band = new T.Mesh(new T.CylinderGeometry(0.275, 0.275, 0.07, 18), this.mat.amber); band.position.y = 0.62; g.add(band);
    const eyeMat = new T.MeshBasicMaterial({ color: 0xff3b3b, fog: false });
    const eye = new T.Mesh(new T.SphereGeometry(0.075, 12, 8), eyeMat); eye.position.set(0, 0.86, 0.24); g.add(eye);
    root.position.set(t.x, 1, t.z); this.levelGroup.add(root);
    const laser = this.makeLine(0xff3b3b); this.levelGroup.add(laser);
    return { x: t.x, y: 1, z: t.z, yaw: t.yaw, cur: t.yaw, root, g, eyeMat, laser, lock: 0, tipped: false, tip: 0, tipDir: 1 };
  },
  grabTarget() {
    const p = this.pl, T = this.T, eye = new T.Vector3(p.x, p.y + this.K.EYE, p.z), f = this.fwdVec();
    let best = null, bd = Infinity;
    for (const c of this.cubes) {
      if (c === this.held) continue;
      const to = new T.Vector3(c.x, c.y, c.z).sub(eye), d = to.length();
      if (d > 2.4 || d >= bd) continue;
      if (to.clone().normalize().dot(f) < 0.7) continue;
      if (this.rayVox(eye, to.normalize(), d)) continue;
      best = c; bd = d;
    }
    return best;
  },
  toggleGrab() {
    if (this.state.screen !== 'play' || this.dead > 0) return;
    const c = this.held;
    if (c) {
      this.held = null; const f = this.fwdVec(), p = this.pl;
      c.vx = p.vx + f.x * 1.5; c.vy = p.vy + f.y * 1.5; c.vz = p.vz + f.z * 1.5; c.inPortal = null;
    } else { const t = this.grabTarget(); if (t) { this.held = t; this.play('grab'); } }
  },
  holdCube(c) {
    const p = this.pl, T = this.T, f = this.fwdVec(), eye = new T.Vector3(p.x, p.y + this.K.EYE, p.z), dist = 1.5;
    c.vx = c.vy = c.vz = 0;
    if (this.pair()) for (const [P, M] of [[this.portals.a, this.M_AB], [this.portals.b, this.M_BA]]) {
      const den = f.dot(P.n); if (den >= -0.05) continue;
      const t = P.c.clone().sub(eye).dot(P.n) / den; if (t <= 0 || t >= dist) continue;
      const hp = eye.clone().addScaledVector(f, t).sub(P.c);
      if (Math.abs(hp.dot(P.r)) > 0.5 || Math.abs(hp.dot(P.u)) > 1.0) continue;
      const tp = eye.clone().addScaledVector(f, dist).applyMatrix4(M);
      c.x = tp.x; c.y = tp.y; c.z = tp.z; c.inPortal = null; return;
    }
    c.inPortal = p.inPortal;
    for (let d = dist; d >= 0.55; d -= 0.1) { c.x = eye.x + f.x * d; c.y = eye.y + f.y * d; c.z = eye.z + f.z * d; if (!this.overlapsAny(c)) return; }
  },
  tipTurret(t, by) {
    t.tipped = true; t.lock = 0;
    const fx = Math.sin(t.cur), fz = Math.cos(t.cur);
    t.tipDir = (t.x - by.x) * fx + (t.z - by.z) * fz >= 0 ? 1 : -1;
    t.eyeMat.color.setHex(0x553333); t.laser.visible = false;
    this.play('sentryKnocked'); this.toast('Robot knocked over!');
  },
  blockedLOS(o, target) {
    const d = target.clone().sub(o), dist = d.length(); d.normalize();
    if (this.rayVox(o, d, dist)) return true;
    for (const c of this.cubes) if (this.rayBox(o, d, { x: c.x - c.hw, y: c.y - c.hh, z: c.z - c.hw }, { x: c.x + c.hw, y: c.y + c.hh, z: c.z + c.hw }) < dist) return true;
    for (const q of this.platforms) { const b = this.platBox(q); if (this.rayBox(o, d, { x: b[0], y: b[1], z: b[2] }, { x: b[3], y: b[4], z: b[5] }) < dist) return true; }
    if (this.paneHit(o, d, dist)) return true;
    return false;
  },
  updateTurrets(dt) {
    if (!this.turrets.length) { this.hurt = Math.max(0, this.hurt - dt * 0.35); return; }
    const T = this.T, p = this.pl; let firing = false;
    for (const t of this.turrets) {
      if (t.tipped) continue;
      const eye = new T.Vector3(t.x + Math.sin(t.cur) * 0.24, t.y + 0.86, t.z + Math.cos(t.cur) * 0.24);
      const tgt = new T.Vector3(p.x, p.y + 0.35, p.z), to = tgt.clone().sub(eye), dist = to.length();
      const hd = Math.hypot(to.x, to.z) || 1, cosA = (to.x * Math.sin(t.yaw) + to.z * Math.cos(t.yaw)) / hd;
      const sees = dist < 14 && cosA > Math.cos(0.61) && Math.abs(to.y) / dist < 0.7 && !this.blockedLOS(eye, tgt);
      t.lock = sees ? t.lock + dt : Math.max(0, t.lock - dt * 2);
      const aim = sees ? Math.atan2(to.x, to.z) : t.yaw;
      t.cur += (aim - t.cur) * Math.min(1, dt * 8);
      if (t.lock > 0.5 && sees) firing = true;
      if (sees && t.lock - dt <= 0.05 && t.lock > 0.05) this.play('sentrySpot');
    }
    if (firing) {
      this.hurt += dt * 0.9; this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = 0.99; this.play('sentryFire'); }
    } else this.hurt = Math.max(0, this.hurt - dt * 0.35);
    if (this.hurt >= 1 && !this.spotted) { this.spotted = true; this.hurt = 1; this.play('gotYou'); this.releaseMouse(); this.setState({ screen: 'spotted' }); }
  },
  updatePadsDoors() {
    const p = this.pl;
    if (this.exitDoors.length) {
      const near = this.exitDoors.some((d) => Math.hypot(p.x - d.g.position.x, p.z - d.g.position.z) < 3.5 && Math.abs(p.y - p.hh - d.floorY) < 2.5);
      if (near !== this.exitOpen) { this.exitOpen = near; this.play(near ? (this.exitEver ? 'doorOpen' : 'exitFirst') : 'doorClose'); if (near) this.exitEver = true; }
    }
    if (!this.pads.length) return;
    const ents = [this.pl, ...this.cubes.filter((c) => c !== this.held)];
    for (const pd of this.pads) pd.was = pd.down;
    for (const pd of this.pads) pd.down = ents.some((e) => Math.hypot(e.x - pd.x, e.z - pd.z) < 0.62 && e.y - e.hh < pd.y + 0.35 && e.y - e.hh > pd.y - 0.2)
      || this.platforms.some((q) => Math.abs(pd.x - q.x) < q.w / 2 + 0.1 && Math.abs(pd.z - q.z) < q.d / 2 + 0.1 && q.y - 0.5 < pd.y + 0.35 && q.y - 0.5 > pd.y - 0.2);
    for (const pd of this.pads) if (pd.down !== pd.was && this.elapsed > 0.2) this.play(pd.down ? 'padPress' : 'padRelease');
    let open = this.pads.every((pd) => pd.down);
    this.padsAll = open;
    if (!open && this.doorOpen) {
      const inDoor = (e) => this.doors.some((d) => d.cells.some((c) => e.x + e.hw > c[0] && e.x - e.hw < c[0] + 1 && e.y + e.hh > c[1] && e.y - e.hh < c[1] + 1 && e.z + e.hw > c[2] && e.z - e.hw < c[2] + 1));
      if (ents.some(inDoor)) open = true;
    }
    if (open !== this.doorOpen) { this.doorOpen = open; this.play(open ? 'doorOpen' : 'doorClose'); }
  },
  animateProps(dt) {
    const T = this.T;
    for (const c of this.cubes) { c.mesh.position.set(c.x, c.y, c.z); if (c === this.held) c.mesh.rotation.y = this.yaw; }
    for (const pd of this.pads) { pd.top.position.y = this.appr(pd.top.position.y, pd.down ? 0.07 : 0.13, dt * 0.6); pd.topMat.color.setHex(pd.down ? 0xa6ff4d : 0xffb23f); }
    for (const d of this.doors) {
      d.amt = this.appr(d.amt, this.doorOpen ? 1 : 0, dt * 2.5);
      d.L.position.x = -d.amt * 1.06; d.R.position.x = d.amt * 1.06;
      const rc = this.doorOpen ? 0xa6ff4d : 0xffb23f; (d.ringMats || [d.ringMat]).forEach((m) => m.color.setHex(rc));
    }
    for (const d of this.exitDoors) {
      d.amt = this.appr(d.amt, this.exitOpen ? 1 : 0, dt * 2.5);
      if (d.free) { const k = Math.max(0.001, 1 - d.amt); d.L.scale.x = d.R.scale.x = k; d.L.position.x = -0.93 * (1 - k); d.R.position.x = 0.93 * (1 - k); d.L.visible = d.R.visible = d.amt < 0.995; }
      else { d.L.position.x = -d.amt * 1.06; d.R.position.x = d.amt * 1.06; }
      if (d.face && this.pl) { const want = Math.atan2(this.pl.x - d.g.position.x, this.pl.z - d.g.position.z); let df = want - d.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); d.g.rotation.y += df * Math.min(1, dt * 4); }
    }
    for (const q of this.platforms) { q.g.position.set(q.x, q.y, q.z); q.bandMat.color.setHex(q.powered ? (q.moving ? 0xa6ff4d : 0xffb23f) : 0xffb23f); }
    if (this.pedestal) { const g = this.pedestal.gun; g.rotation.y += dt * 1.5; g.position.y = 1.25 + Math.sin(this.time * 2.5) * 0.06; }
    for (const t of this.turrets) {
      if (t.tipped) { t.tip = Math.min(1, t.tip + dt * 3); t.g.rotation.x = t.tipDir * t.tip * Math.PI / 2; t.g.position.y = t.tip * 0.28; t.root.rotation.y = t.cur; continue; }
      t.root.rotation.y = t.cur;
      const eye = new T.Vector3(t.x + Math.sin(t.cur) * 0.24, t.y + 0.86, t.z + Math.cos(t.cur) * 0.24);
      let end;
      if (t.lock > 0.05) end = new T.Vector3(this.pl.x, this.pl.y + 0.35, this.pl.z);
      else { const d = new T.Vector3(Math.sin(t.cur), 0, Math.cos(t.cur)), h = this.rayVox(eye, d, 20); end = h ? h.p : eye.clone().addScaledVector(d, 20); }
      this.setLine(t.laser, eye, end);
      t.laser.material.opacity = t.lock > 0.5 ? 0.6 + 0.4 * Math.sin(this.time * 40) : t.lock > 0.05 ? 0.9 : 0.55;
      t.eyeMat.color.setHex(t.lock > 0.5 ? 0xffffff : 0xff3b3b);
    }
    const warn = this.cycle && this.cycle.t < 1.2;
    for (const k of ['a', 'b']) this.gmat[k].opacity = warn && this.cycle.spec.c === k ? 0.25 + 0.6 * Math.abs(Math.sin(this.time * 10)) : 0.55;
    this.fieldTex.offset.set(this.time * 0.25, 0);
    if (this.hurtRef.current) this.hurtRef.current.style.opacity = Math.min(1, this.hurt * 1.1).toFixed(2);
  },
};
