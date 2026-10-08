// Voxel grid, level loading and greedy-free face meshing with baked AO.
// Mixed into Game.prototype — every method runs with `this` = the Game.
export const World = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  appr(v, t, a) { return v < t ? Math.min(t, v + a) : Math.max(t, v - a); },
  idx(x, y, z) { const [X, Y] = this.dims; return x + X * (y + Y * z); },
  type(x, y, z) { const [X, Y, Z] = this.dims; if (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z) return 2; return this.grid[this.idx(x, y, z)]; },
  blocks(t) { return t === 1 || t === 2 || t === 5 || (t === 4 && !this.doorOpen) || (t === 7 && !this.exitOpen); },
  loadLevel(i) {
    const L = this.LEVELS[i], [X, Y, Z] = L.size, K = this.K;
    this.loadToken = (this.loadToken || 0) + 1; if (this.hintLevel !== i) { this.hintLevel = i; this.hintCount = {}; } if (this.shots) this.clearShots();
    this.dims = [X, Y, Z]; const g = (this.grid = new Uint8Array(X * Y * Z));
    const f = (x0, y0, z0, x1, y1, z1, t) => { for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z) g[x + X * (y + Y * z)] = t; };
    f(0, 0, 0, X - 1, 0, Z - 1, 2); f(0, Y - 1, 0, X - 1, Y - 1, Z - 1, 2); f(0, 0, 0, 0, Y - 1, Z - 1, 2); f(X - 1, 0, 0, X - 1, Y - 1, Z - 1, 2); f(0, 0, 0, X - 1, Y - 1, 0, 2); f(0, 0, Z - 1, X - 1, Y - 1, Z - 1, 2);
    for (const b of L.fills) f(...b); this.li = i;
    for (const d of L.doors || []) { const [x, y, z] = d.cell; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const c = d.axis === 'x' ? [x + a, y + b, z] : [x, y + b, z + a]; f(c[0], c[1], c[2], c[0], c[1], c[2], d.exit ? 7 : 4); } }
    for (const k of ['a', 'b']) if (this.portals[k]) { this.scene.remove(this.portals[k].group); this.portals[k] = null; }
    while (this.levelGroup.children.length) { const o = this.levelGroup.children.pop(); o.traverse((m) => m.geometry && m.geometry.dispose()); }
    this.doorOpen = false; this.exitOpen = false; this.exitEver = false; this.padsAll = false; this.stepDist = 0;
    this.buildVoxels(L.fieldAxis || 'z'); this.buildPanes(L.panes);
    this.pl = { x: L.spawn[0], y: L.spawn[1] + K.HH, z: L.spawn[2], vx: 0, vy: 0, vz: 0, hw: K.HW, hh: K.HH, eye: K.EYE, onGround: false, inPortal: null, isPlayer: true };
    this.yaw = L.yaw; this.pitch = 0; this.dead = 0; this.won = false; this.spotted = false; this.jumpQ = 0; this.hurt = 0; this.wasInField = false;
    this.elapsed = 0; this.portalCount = 0;
    this.gun = L.gun || 'both'; if (this.state.gun !== this.gun) this.setState({ gun: this.gun });
    const allDoors = (L.doors || []).map((d) => this.buildDoor(d));
    this.doors = allDoors.filter((d) => !d.exit);
    this.exitDoors = allDoors.filter((d) => d.exit);
    if (this.exitDoors.length) { const d = this.exitDoors[0]; this.exitPos = { x: d.g.position.x, y: d.floorY, z: d.g.position.z }; }
    else this.buildExit(L.exit);
    this.platforms = (L.platforms || []).map((s) => this.buildPlatform(s));
    this.pads = (L.pads || []).map((p) => this.buildPad(p));
    this.cubes = []; this.held = null; this.boxSeen = false; if (this.state.boxSeen) this.setState({ boxSeen: false });
    this.droppers = (L.droppers || []).map((d) => this.buildDropper(d));
    this.turrets = (L.turrets || []).map((t) => this.buildTurret(t));
    this.pedestalGun = L.pedestalGun === 'both' ? 'both' : 'blue';
    this.pedestal = L.pedestal ? this.buildPedestal(L.pedestal, this.pedestalGun) : null;
    this.cycle = null;
    if (L.cycle) { this.cycle = { spec: L.cycle, idx: 0, t: L.cycle.period }; this.placeCycle(true); }
    this.preT = L.preDelay || 0;
    if (this.preT > 0) this.toast('A portal is opening…'); else this.placePre(true);
    this.updatePairs(); this.syncHave();
  },
  placePre(silent) {
    (this.LEVELS[this.li].portals || []).forEach((p) => { const P = this.makePortal(p.c, p.cell, p.n, p.u); P.anim = silent ? 1 : 0; this.setPortal(P, true, p.owner || 'level'); });
    this.updatePairs(); this.syncHave();
    if (!silent) this.play('hitPortal');
  },
  placeCycle(first) {
    const C = this.cycle, sp = C.spec.spots, o = this.portals[C.spec.c === 'a' ? 'b' : 'a'];
    for (let k = 0; k < sp.length; k++) {
      const s = sp[(C.idx + k) % sp.length];
      const clash = o && o.nArr.join() === s.n.join() && o.cells.some((c) => c.join() === s.cell.join() || c.join() === [s.cell[0] + s.u[0], s.cell[1] + s.u[1], s.cell[2] + s.u[2]].join());
      if (clash) continue;
      C.idx = (C.idx + k) % sp.length;
      const P = this.makePortal(C.spec.c, s.cell, s.n, s.u); P.anim = first ? 1 : 0;
      this.setPortal(P, false, 'level');
      if (!first) this.play('hitPortal', 0.7);
      return;
    }
  },
  buildVoxels(fieldAxis) {
    const T = this.T, [X, Y, Z] = this.dims, F = this.FACES;
    const solid = (x, y, z) => { const t = this.type(x, y, z); return t === 1 || t === 2 ? 1 : 0; };
    const oob = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z;
    const B = { 1: { p: [], u: [], c: [], i: [] }, 2: { p: [], u: [], c: [], i: [] }, 5: { p: [], u: [], c: [], i: [], m: [] } }, FL = { p: [], u: [], i: [] };
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
      const t = this.grid[this.idx(x, y, z)];
      if (t === 6) {
        const b = FL.p.length / 3;
        if (fieldAxis === 'x') FL.p.push(x + 0.5, y, z, x + 0.5, y, z + 1, x + 0.5, y + 1, z + 1, x + 0.5, y + 1, z);
        else FL.p.push(x, y, z + 0.5, x + 1, y, z + 0.5, x + 1, y + 1, z + 0.5, x, y + 1, z + 0.5);
        const u0 = fieldAxis === 'x' ? z : x; FL.u.push(u0, y, u0 + 1, y, u0 + 1, y + 1, u0, y + 1);
        FL.i.push(b, b + 1, b + 2, b, b + 2, b + 3); continue;
      }
      if (t !== 1 && t !== 2 && t !== 5) continue;
      for (const fc of F) {
        const fx = x + fc.n[0], fy = y + fc.n[1], fz = z + fc.n[2];
        if (oob(fx, fy, fz) || solid(fx, fy, fz)) continue;
        if (t === 5 && this.type(fx, fy, fz) === 5) continue;
        const bk = B[t], base = bk.p.length / 3;
        let gm = 0;
        if (t === 5) {
          const sides = [[0, 3, 1], [1, 2, 2], [0, 1, 4], [2, 3, 8]];
          for (const [k1, k2, bit] of sides) {
            const a = fc.t.find((ax) => fc.c[k1][ax] === fc.c[k2][ax]), sg = fc.c[k1][a] ? 1 : -1;
            const nc = [x, y, z]; nc[a] += sg;
            const nn = [nc[0] + fc.n[0], nc[1] + fc.n[1], nc[2] + fc.n[2]];
            const cont = this.type(nc[0], nc[1], nc[2]) === 5 && !oob(nn[0], nn[1], nn[2]) && !solid(nn[0], nn[1], nn[2]) && this.type(nn[0], nn[1], nn[2]) !== 5;
            if (!cont) gm |= bit;
          }
        }
        for (let k = 0; k < 4; k++) {
          const cr = fc.c[k];
          bk.p.push(x + cr[0], y + cr[1], z + cr[2]);
          if (t === 5) { bk.u.push(UV[k][0], UV[k][1]); bk.m.push(gm); continue; }
          bk.u.push(UV[k][0], UV[k][1]);
          const o1 = [0, 0, 0], o2 = [0, 0, 0]; o1[fc.t[0]] = cr[fc.t[0]] ? 1 : -1; o2[fc.t[1]] = cr[fc.t[1]] ? 1 : -1;
          const s1 = solid(fx + o1[0], fy + o1[1], fz + o1[2]), s2 = solid(fx + o2[0], fy + o2[1], fz + o2[2]);
          const s3 = solid(fx + o1[0] + o2[0], fy + o1[1] + o2[1], fz + o1[2] + o2[2]);
          const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
          const v = Math.pow(fc.s * (0.6 + 0.133 * ao), 2.2);
          bk.c.push(v, v, v);
        }
        bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const mk = (d, mat, colors, order) => {
      if (!d.p.length) return;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(d.p, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(d.u, 2));
      if (colors) geo.setAttribute('color', new T.Float32BufferAttribute(d.c, 3));
      geo.setIndex(d.i); geo.computeBoundingSphere();
      const m = new T.Mesh(geo, mat); if (order) m.renderOrder = order; this.levelGroup.add(m);
    };
    mk(B[1], this.mat[1], true); mk(B[2], this.mat[2], true); this.glassMesh(B[5]); mk(FL, this.mat.field, false, 4);
  },
  // Glass panes: thin sheets on a cell boundary. [x0,y0,z0,x1,y1,z1,"x"|"z","shoot"?,radius?] — "shoot" makes it shoot-through glass: a small round hole in the centre that shots and sentry beams pass through. Panes sit on cell edges; a shoot cell next to (or inside) a plain pane merges into one sheet with no seam. Axis: "x" = plane x=x0 spanning z0..z1+1, "z" = plane z=z0 spanning x0..x1+1; both span y0..y1+1.
  buildPanes(list) {
    // All panes are merged per plane: the bright border only appears where a cell has no pane neighbour in the same plane.
    // A "shoot" cell is the same glass with a round hole in its centre; a shoot cell always wins over a plain one in the same spot.
    const P = { p: [], u: [], i: [], m: [], h: [] }, boxes = [], th = 0.04, cells = new Map(), holes = [];
    const K = (ax, pl, a, y) => ax + pl + ',' + a + ',' + y;
    for (const s of list || []) {
      const [x0, y0, z0, x1, y1, z1, ax, kind, rad] = s, isX = ax === 'x', plane = isX ? x0 : z0, a0 = isX ? z0 : x0, a1 = isX ? z1 : x1;
      for (let y = y0; y <= y1; y++) for (let a = a0; a <= a1; a++) {
        const k = K(ax, plane, a, y), hr = kind === 'shoot' ? (rad || 0.3) : 0, prev = cells.get(k);
        if (prev && prev.hr && !hr) continue;
        const hc = isX ? [plane, y + 0.5, a + 0.5] : [a + 0.5, y + 0.5, plane];
        cells.set(k, { ax, plane, a, y, hr, hc });
      }
      boxes.push(isX ? [plane - th, y0, z0, plane + th, y1 + 1, z1 + 1] : [x0, y0, plane - th, x1 + 1, y1 + 1, plane + th]);
    }
    for (const c of cells.values()) {
      if (c.hr) holes.push({ c: c.hc, r: c.hr });
      const has = (da, dy) => cells.has(K(c.ax, c.plane, c.a + da, c.y + dy));
      const m = (has(-1, 0) ? 0 : 1) | (has(1, 0) ? 0 : 2) | (has(0, -1) ? 0 : 4) | (has(0, 1) ? 0 : 8), b = P.p.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const a = c.a + u, y = c.y + v;
        if (c.ax === 'x') P.p.push(c.plane, y, a); else P.p.push(a, y, c.plane);
        P.u.push(u, v); P.m.push(m); P.h.push(c.hc[0], c.hc[1], c.hc[2], c.hr);
      }
      P.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    this.paneBoxes = boxes; this.paneHoles = holes;
    return this.glassMesh(P);
  },
  glassMesh(d, mat) {
    const T = this.T; if (!d.p.length) return null;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(d.p, 3)); geo.setAttribute('guv', new T.Float32BufferAttribute(d.u, 2)); geo.setAttribute('gmask', new T.Float32BufferAttribute(d.m, 1));
    geo.setAttribute('ghole', new T.Float32BufferAttribute(d.h && d.h.length ? d.h : new Float32Array(d.m.length * 4), 4));
    geo.setIndex(d.i); geo.computeBoundingSphere();
    const mesh = new T.Mesh(geo, mat || this.mat.glass); mesh.renderOrder = 3; this.levelGroup.add(mesh); return mesh;
  },
  paneHit(o, d, max) {
    let best = 0;
    for (const b of this.paneBoxes || []) {
      const t = this.rayBox(o, d, { x: b[0], y: b[1], z: b[2] }, { x: b[3], y: b[4], z: b[5] });
      if (!(t > 0 && t < max && (!best || t < best))) continue;
      const hx = o.x + d.x * t, hy = o.y + d.y * t, hz = o.z + d.z * t;
      if ((this.paneHoles || []).some((q) => Math.hypot(hx - q.c[0], hy - q.c[1], hz - q.c[2]) < q.r)) continue;
      best = t;
    }
    return best;
  },
  buildExit(e) {
    // The exit is the lime round door, free-standing at the exit point. It opens as you walk up.
    const T = this.T, d = this.buildDoor({ cell: [0, 0, 0], axis: 'x', exit: true, noBack: true });
    d.g.position.set(e[0], e[1] + 1.5, e[2]); d.floorY = e[1];
    this.clipDoor(d, [new T.Plane(new T.Vector3(0, 1, 0), -e[1])]);
    const sp = this.LEVELS[this.li].spawn;
    d.g.rotation.y = e[3] != null ? e[3] : Math.atan2(sp[0] - e[0], sp[2] - e[2]);
    d.face = e[3] == null; d.g.scale.z = 0.24; d.cells = []; d.free = true;
    
    for (const [sx, sy, px, py] of [[2.02, 0.03, 0, 1], [2.02, 0.03, 0, -1], [0.03, 2.02, 1, 0], [0.03, 2.02, -1, 0]]) { const m = new T.Mesh(new T.BoxGeometry(sx, sy, 1.03), this.mat.frame); m.position.set(px, py, 0); d.g.add(m); }
    this.exitDoors = [d]; this.exitPos = { x: e[0], y: e[1], z: e[2] };
  },
};
