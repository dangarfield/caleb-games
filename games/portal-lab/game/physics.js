// Fixed-step AABB physics shared by player and boxes, portal transit and teleport.
// Mixed into Game.prototype — every method runs with `this` = the Game.
export const Physics = {
  half(v, e) { return Math.abs(v.x) * e.hw + Math.abs(v.y) * e.hh + Math.abs(v.z) * e.hw; },
  pair() { return this.portals.a && this.portals.b; },
  solidFor(x, y, z, e) {
    if (!this.blocks(this.type(x, y, z))) return false;
    const Q = e.inPortal;
    if (Q) {
      const rx = x + 0.5 - Q.c.x, ry = y + 0.5 - Q.c.y, rz = z + 0.5 - Q.c.z;
      if (rx * Q.n.x + ry * Q.n.y + rz * Q.n.z < 0 && Math.abs(rx * Q.r.x + ry * Q.r.y + rz * Q.r.z) < 0.5 && Math.abs(rx * Q.u.x + ry * Q.u.y + rz * Q.u.z) < 1.0) return false;
    }
    return true;
  },
  boxesFor(e) {
    const out = [];
    for (const t of this.turrets) out.push(t.tipped ? [t.x - 0.5, t.y, t.z - 0.5, t.x + 0.5, t.y + 0.55, t.z + 0.5, t] : [t.x - 0.3, t.y, t.z - 0.3, t.x + 0.3, t.y + 1.15, t.z + 0.3, t]);
    const p = this.pl;
    for (const c of this.cubes) if (c !== e && c !== this.held) out.push([c.x - c.hw, c.y - c.hh, c.z - c.hw, c.x + c.hw, c.y + c.hh, c.z + c.hw, null]);
    for (const q of this.platforms) { const b = this.platBox(q); b.push(null); out.push(b); }
    for (const b of this.paneBoxes || []) out.push([b[0], b[1], b[2], b[3], b[4], b[5], null]);
    if (e !== p) out.push([p.x - p.hw, p.y - p.hh, p.z - p.hw, p.x + p.hw, p.y + p.hh, p.z + p.hw, null]);
    return out;
  },
  collide(e, a) {
    for (let it = 0; it < 4; it++) {
      const mn = [e.x - e.hw, e.y - e.hh, e.z - e.hw], mx = [e.x + e.hw, e.y + e.hh, e.z + e.hw];
      let lo = null, hi = null, tag = null;
      outer: for (let y = Math.floor(mn[1]); y <= Math.floor(mx[1] - 1e-6); y++) for (let z = Math.floor(mn[2]); z <= Math.floor(mx[2] - 1e-6); z++) for (let x = Math.floor(mn[0]); x <= Math.floor(mx[0] - 1e-6); x++)
        if (this.solidFor(x, y, z, e)) { lo = [x, y, z]; hi = [x + 1, y + 1, z + 1]; break outer; }
      if (!lo) for (const b of this.boxesFor(e)) if (mn[0] < b[3] && mx[0] > b[0] && mn[1] < b[4] && mx[1] > b[1] && mn[2] < b[5] && mx[2] > b[2]) { lo = [b[0], b[1], b[2]]; hi = [b[3], b[4], b[5]]; tag = b[6]; break; }
      if (!lo) return;
      const key = a === 0 ? 'x' : a === 1 ? 'y' : 'z', vk = 'v' + key, half = a === 1 ? e.hh : e.hw, mid = (lo[a] + hi[a]) / 2;
      const speed = Math.hypot(e.vx, e.vy, e.vz);
      if (a !== 1 && (e.lastGround || e.onGround) && e.vy <= 0.01) {
        const rise = hi[1] - (e.y - e.hh);
        if (rise > 0 && rise <= 0.55) { const oy = e.y; e.y = hi[1] + e.hh + 1e-3; if (!this.overlapsAny(e)) { e.onGround = true; continue; } e.y = oy; }
      }
      if (e[vk] > 0 || (e[vk] === 0 && e[key] < mid)) e[key] = lo[a] - half - 1e-4;
      else { e[key] = hi[a] + half + 1e-4; if (a === 1) e.onGround = true; }
      e[vk] = 0;
      if (tag && !tag.tipped && (e.isPlayer || speed > 2.5)) this.tipTurret(tag, e);
    }
  },
  overlapsAny(e) {
    const mn = [e.x - e.hw, e.y - e.hh, e.z - e.hw], mx = [e.x + e.hw, e.y + e.hh, e.z + e.hw];
    for (let y = Math.floor(mn[1]); y <= Math.floor(mx[1] - 1e-6); y++) for (let z = Math.floor(mn[2]); z <= Math.floor(mx[2] - 1e-6); z++) for (let x = Math.floor(mn[0]); x <= Math.floor(mx[0] - 1e-6); x++) if (this.solidFor(x, y, z, e)) return true;
    for (const t of this.turrets) if (mn[0] < t.x + 0.3 && mx[0] > t.x - 0.3 && mn[1] < t.y + 1.15 && mx[1] > t.y && mn[2] < t.z + 0.3 && mx[2] > t.z - 0.3) return true;
    for (const q of this.platforms) { const b = this.platBox(q); if (mn[0] < b[3] && mx[0] > b[0] && mn[1] < b[4] && mx[1] > b[1] && mn[2] < b[5] && mx[2] > b[2]) return true; }
    for (const b of this.paneBoxes || []) if (mn[0] < b[3] && mx[0] > b[0] && mn[1] < b[4] && mx[1] > b[1] && mn[2] < b[5] && mx[2] > b[2]) return true;
    return false;
  },
  touches(e, ty) {
    for (let y = Math.floor(e.y - e.hh + 0.05); y <= Math.floor(e.y + e.hh - 0.05); y++) for (let z = Math.floor(e.z - e.hw + 0.05); z <= Math.floor(e.z + e.hw - 0.05); z++) for (let x = Math.floor(e.x - e.hw + 0.05); x <= Math.floor(e.x + e.hw - 0.05); x++) if (this.type(x, y, z) === ty) return true;
    return false;
  },
  eyeDist(e, Q) { return (e.x - Q.c.x) * Q.n.x + (e.y + e.eye - Q.c.y) * Q.n.y + (e.z - Q.c.z) * Q.n.z; },
  updateInPortal(e) {
    // Only count as 'in' a portal from its front side (or while already passing through it), never from behind the wall.
    const prev = e.inPortal; e.inPortal = null; if (!this.pair()) return;
    for (const Q of [this.portals.a, this.portals.b]) {
      const rx = e.x - Q.c.x, ry = e.y - Q.c.y, rz = e.z - Q.c.z;
      const dn = rx * Q.n.x + ry * Q.n.y + rz * Q.n.z, dr = rx * Q.r.x + ry * Q.r.y + rz * Q.r.z, du = rx * Q.u.x + ry * Q.u.y + rz * Q.u.z;
      if (dn - this.half(Q.n, e) <= 0.15 && (dn > -0.05 || (prev === Q && dn > -2.2)) && Math.abs(dr) + this.half(Q.r, e) <= 0.56 && Math.abs(du) + this.half(Q.u, e) <= 1.06) { e.inPortal = Q; return; }
    }
  },
  funnel(e, h) {
    if (!this.pair()) return;
    for (const Q of [this.portals.a, this.portals.b]) {
      const rx = e.x - Q.c.x, ry = e.y - Q.c.y, rz = e.z - Q.c.z;
      // Falling assist: a falling player within 4 blocks above a floor portal is drawn quickly into the hole.
      if (e.isPlayer && Q.n.y > 0.5 && e.vy < -1.5) {
        const feet = ry - e.hh, fr = rx * Q.r.x + rz * Q.r.z, fu = rx * Q.u.x + rz * Q.u.z;
        if (feet > -0.2 && feet <= 4 && Math.abs(fr) <= 1.75 && Math.abs(fu) <= 2.25) {
          const kk = Math.min(1, 12 * h), lim = 1 - this.half(Q.u, e) - 0.05, eu = fu - Math.max(-lim, Math.min(lim, fu));
          const ox = e.x, oz = e.z;
          e.x -= (Q.r.x * fr + Q.u.x * eu) * kk; e.z -= (Q.r.z * fr + Q.u.z * eu) * kk;
          if (this.overlapsAny(e)) { e.x = ox; e.z = oz; }
          else {
            const vr = e.vx * Q.r.x + e.vz * Q.r.z, vu = e.vx * Q.u.x + e.vz * Q.u.z;
            e.vx -= Q.r.x * vr * kk; e.vz -= Q.r.z * vr * kk;
            if (eu) { e.vx -= Q.u.x * vu * kk; e.vz -= Q.u.z * vu * kk; }
            continue;
          }
        }
      }
      const dn = rx * Q.n.x + ry * Q.n.y + rz * Q.n.z; if (dn < -0.2 || dn > 2.5) continue;
      if (e.vx * Q.n.x + e.vy * Q.n.y + e.vz * Q.n.z > -0.5) continue;
      const dr = rx * Q.r.x + ry * Q.r.y + rz * Q.r.z, du = rx * Q.u.x + ry * Q.u.y + rz * Q.u.z;
      if (Math.abs(dr) > 1.0 || Math.abs(du) > 1.8) continue;
      const k = Math.min(1, 7 * h);
      e.x -= Q.r.x * dr * k; e.y -= Q.r.y * dr * k; e.z -= Q.r.z * dr * k;
      if (Q.n.y !== 0) { const lim = 1 - this.half(Q.u, e) - 0.02; if (Math.abs(du) > lim) { const d = (du - Math.sign(du) * lim) * k; e.x -= Q.u.x * d; e.z -= Q.u.z * d; } }
    }
  },
  moveBody(e, dt) {
    for (const k of ['vx', 'vy', 'vz']) { const v = e[k]; e[k] = Number.isFinite(v) ? (v > 60 ? 60 : v < -60 ? -60 : v) : 0; }
    if (!Number.isFinite(e.x + e.y + e.z)) { const sp = this.LEVELS[this.li].spawn; e.x = sp[0]; e.y = sp[1] + e.hh; e.z = sp[2]; e.vx = e.vy = e.vz = 0; e.inPortal = null; }
    const n = Math.min(40, Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy), Math.abs(e.vz)) * dt / 0.15)));
    e.lastGround = e.onGround; e.onGround = false;
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      this.funnel(e, h); this.updateInPortal(e);
      const Q = e.inPortal, e0 = Q ? this.eyeDist(e, Q) : 0;
      e.x += e.vx * h; this.collide(e, 0);
      e.y += e.vy * h; this.collide(e, 1);
      e.z += e.vz * h; this.collide(e, 2);
      if (Q && e0 >= 0 && this.eyeDist(e, Q) < 0) this.teleport(e, Q);
    }
  },
  fwdVec() { const T = this.T, y = this.yaw, q = this.pitch; return new T.Vector3(-Math.sin(y) * Math.cos(q), Math.sin(q), -Math.cos(y) * Math.cos(q)); },
  upVec() { const T = this.T, y = this.yaw, q = this.pitch; return new T.Vector3(Math.sin(y) * Math.sin(q), Math.cos(q), Math.cos(y) * Math.sin(q)); },
  teleport(e, A) {
    const T = this.T, B = A === this.portals.a ? this.portals.b : this.portals.a, M = A === this.portals.a ? this.M_AB : this.M_BA;
    const m3 = this.v.m3.setFromMatrix4(M);
    const eye = new T.Vector3(e.x, e.y + e.eye, e.z).applyMatrix4(M);
    const vel = new T.Vector3(e.vx, e.vy, e.vz).applyMatrix3(m3);
    let f = null;
    if (e.isPlayer) {
      f = this.fwdVec().applyMatrix3(m3); const u = this.upVec().applyMatrix3(m3);
      this.pitch = this.clamp(Math.asin(this.clamp(f.y, -1, 1)), -1.4, 1.4);
      this.yaw = Math.abs(f.y) < 0.92 ? Math.atan2(-f.x, -f.z) : f.y > 0 ? Math.atan2(u.x, u.z) : Math.atan2(-u.x, -u.z);
    }
    const c = eye.clone(); c.y -= e.eye;
    const rel = c.clone().sub(B.c), dn = rel.dot(B.n);
    const lr = Math.max(0, 0.5 - this.half(B.r, e) - 0.01), lu = Math.max(0, 1 - this.half(B.u, e) - 0.01);
    const dr = this.clamp(rel.dot(B.r), -lr, lr), du = this.clamp(rel.dot(B.u), -lu, lu);
    c.copy(B.c).addScaledVector(B.r, dr).addScaledVector(B.u, du).addScaledVector(B.n, dn);
    const ed = (c.x - B.c.x) * B.n.x + (c.y + e.eye - B.c.y) * B.n.y + (c.z - B.c.z) * B.n.z;
    if (ed < 0.01) c.addScaledVector(B.n, 0.01 - ed);
    e.x = c.x; e.y = c.y; e.z = c.z;
    const minOut = B.n.y > 0.5 ? (e.isPlayer ? 8.5 : 6) : 2, vo = vel.dot(B.n);
    if (vo < minOut) vel.addScaledVector(B.n, minOut - vo);
    if (f && B.n.y > 0.5) { const hf = new T.Vector3(f.x, 0, f.z); if (hf.lengthSq() > 1e-4) vel.addScaledVector(hf.normalize(), 1.5); }
    e.vx = vel.x; e.vy = vel.y; e.vz = vel.z; e.inPortal = B; e.onGround = false;
    this.play('portalEnter', e.isPlayer ? 1 : 0.6);
    if (e.isPlayer && vel.length() > 9) this.play('flingRush', Math.min(1.3, vel.length() / 14));
  },
  step(dt) {
    const p = this.pl, K = this.K;
    if (this.won || this.spotted) return;
    if (this.dead > 0) { this.dead -= dt; if (this.dead <= 0) { this.loadLevel(this.li); } return; }
    this.elapsed += dt;
    this.updatePlatforms(dt);
    if (this.preT > 0) { this.preT -= dt; if (this.preT <= 0) this.placePre(false); }
    if (this.cycle) { const C = this.cycle; C.t -= dt; if (C.t <= 0) { C.idx = (C.idx + 1) % C.spec.spots.length; this.placeCycle(false); C.t = C.spec.period; } }
    let mx = this.move.x + (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0), mz = this.move.y + (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0);
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
    if (p.onGround) { p.vx = this.appr(p.vx, wx * K.WALK, K.GACC * dt); p.vz = this.appr(p.vz, wz * K.WALK, K.GACC * dt); }
    else if (ml > 0.05) {
      if (Math.hypot(p.vx, p.vz) <= K.WALK * 1.05) { p.vx = this.appr(p.vx, wx * K.WALK, K.AACC * dt); p.vz = this.appr(p.vz, wz * K.WALK, K.AACC * dt); }
      else { p.vx += wx * K.AACC * 0.4 * dt; p.vz += wz * K.AACC * 0.4 * dt; }
    }
    this.coyote = p.onGround ? 0.1 : this.coyote - dt; this.jumpQ -= dt;
    if (this.jumpQ > 0 && this.coyote > 0) { p.vy = K.JUMP; this.jumpQ = 0; this.coyote = 0; this.play('jump'); }
    p.vy = Math.max(p.vy - K.G * dt, -K.TERM);
    const g0 = p.onGround, vy0 = p.vy;
    this.moveBody(p, dt);
    if (p.onGround && !g0 && vy0 < -3) this.play('land', Math.min(1.4, 0.35 + -vy0 / 12));
    if (p.onGround) {
      this.stepDist = (this.stepDist || 0) + Math.hypot(p.vx, p.vz) * dt;
      if (this.stepDist > 1.7) { this.stepDist = 0; this.play(this.stepSurface(p)); }
    } else this.stepDist = 1.2;
    for (const d of this.droppers) {
      if (d.cube) continue;
      if (d.wait === -1) { if (Math.hypot(p.x - d.trigger.x, p.z - d.trigger.z) < d.trigger.r) d.wait = 0.05; continue; }
      d.wait -= dt; if (d.wait <= 0) this.spawnCube(d);
    }
    for (const c of this.cubes.slice()) {
      if (c === this.held) this.holdCube(c);
      else {
        c.vy = Math.max(c.vy - K.G * dt, -K.TERM);
        if (c.onGround) { c.vx = this.appr(c.vx, 0, 14 * dt); c.vz = this.appr(c.vz, 0, 14 * dt); }
        this.padAssist(c, dt);
        const cg0 = c.onGround, cvy0 = c.vy;
        this.moveBody(c, dt);
        if (c.onGround && !cg0 && cvy0 < -2.5) this.play('boxLand', Math.min(1.3, 0.3 + -cvy0 / 12));
      }
      if (this.touches(c, 6)) this.removeCube(c, 'The clean field fizzled the box');
      else if (c.y < -6) this.removeCube(c, 'Box lost, a new one is coming');
    }
    const inField = this.touches(p, 6);
    if (inField && !this.wasInField) this.clearPlayerPortals();
    this.wasInField = inField;
    if (this.pedestal) {
      const pd = this.pedestal;
      if (Math.abs(p.x - pd.x) < 0.9 && Math.abs(p.z - pd.z) < 0.9 && Math.abs(p.y - K.HH - pd.y) < 0.6) {
        const rank = { none: 0, blue: 1, both: 2 }, before = this.gun || 'none', gives = this.pedestalGun || 'blue';
        const next = (rank[gives] || 0) > (rank[before] || 0) ? gives : before;
        this.levelGroup.remove(pd.g); this.pedestal = null; this.gun = next; this.setState({ gun: next, gunUp: next !== before });
        if (next === 'both' && before === 'blue') { this.toast('Pink portal unlocked!'); this.play('pickupGun'); }
        else if (next !== before) { this.toast(next === 'both' ? 'Got the portal gun! Blue and pink portals' : 'Got the portal gun! It makes blue portals'); this.play('pickupGun'); }
      }
    }
    this.updatePadsDoors();
    this.updateTurrets(dt);
    if (this.dead > 0) return;
    if (this.spotted) return;
    if (p.y < -6) { this.dead = 0.5; this.toast('Back to the start'); this.play('land'); return; }
    const ex = this.exitPos;
    if (Math.abs(p.x - ex.x) < 0.6 && Math.abs(p.z - ex.z) < 0.6 && Math.abs(p.y - K.HH - ex.y) < 0.4) {
      this.won = true; this.play('levelComplete');
      const result = { li: this.li, time: this.elapsed, portals: this.portalCount };
      setTimeout(() => { this.releaseMouse(); this.setState({ screen: 'cleared', result }); }, 350);
    }
  },
  stepSurface(p) {
    const fy = p.y - p.hh;
    for (const q of this.platforms || []) if (Math.abs(fy - q.y) < 0.08 && Math.abs(p.x - q.x) < q.w / 2 + p.hw && Math.abs(p.z - q.z) < q.d / 2 + p.hw) return 'stepPlatform';
    const t = this.type(Math.floor(p.x), Math.floor(fy - 0.05), Math.floor(p.z));
    if ((this.paneBoxes || []).some((b) => b[4] - b[1] < 0.2 && Math.abs(b[4] - fy) < 0.1 && p.x > b[0] && p.x < b[3] && p.z > b[2] && p.z < b[5])) return 'stepGlass';
    return t === 1 ? 'stepPanel' : t === 5 ? 'stepGlass' : 'stepMetal';
  },
  // Pad assist: a falling box within 3 blocks above a pressure pad (and ~1.5 m sideways) is drawn onto the pad's centre.
  padAssist(c, dt) {
    if (c.vy > -1 || !this.pads || !this.pads.length) return;
    for (const pd of this.pads) {
      const h = c.y - c.hh - pd.y, dx = pd.x - c.x, dz = pd.z - c.z, d = Math.hypot(dx, dz);
      if (h < 0 || h > 3 || d > 1.5 || d < 0.02) continue;
      const k = Math.min(1, 10 * dt), ox = c.x, oz = c.z;
      c.x += dx * k; c.z += dz * k;
      if (this.overlapsAny(c)) { c.x = ox; c.z = oz; continue; }
      c.vx -= c.vx * k; c.vz -= c.vz * k;
      return;
    }
  }
};
