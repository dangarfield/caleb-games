// Blaze · Ember Bay minigames played inside the real town (part 1): hose hydrant thaw sand catch power check foam.
// Each entry: at(c3, ev, level) → cityStage options; run(S, ctx) builds the game in local space (+z = camera side).
import { THREE, chip, meter, pips, flame, spray, box, cyl, sph, at, mat, icon, C, W, H, faceFrame, towardRoad, waterFrame, put, once, sep, isBuilding } from './mg-kit.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const sizeOf = o => { const p = o.parent; if (p) p.remove(o); o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); if (p) p.add(o); return { b, s: b.getSize(new THREE.Vector3()) }; };
const shake = el => el.animate([{ transform: el.style.transform + ' translateX(-10px)' }, { transform: el.style.transform + ' translateX(10px)' }, { transform: el.style.transform }], { duration: 220 });
const glow = (w, h, col = '#ffb347') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0 })); return m; };
export function stationFrame(c3) {
  const sp = c3.city.spawn; const f = faceFrame(c3, sp.x, sp.z, { r: 90, test: i => i.id === 'fb_fire_station' });
  return f;
}
export function hydrantModel(S) {
  const m = S.model('sp_hydrant'); if (!m) return null;
  const { s } = sizeOf(m); if (s.y < 0.6 || s.y > 1.6) m.scale.setScalar(1 / Math.max(0.01, s.y));
  const g = new THREE.Group(); g.add(m); return g;
}
const hideHydrants = S => S.hide((r, info) => /hydrant/.test(info.id) && Math.hypot(r[1] - S.spot.x, r[3] - S.spot.z) < 4);


// Real windows on a building face: raycast the facade on a grid; keep patches that are recessed or glass-coloured
// (darker/bluer than the wall). Returns [{x, y, w, h}] in the face frame (x along the face, y up) + facade offset fz.
const _px = new Map();
function texel(hit) {
  const m = hit.object.material, map = m && m.map; if (!map || !map.image || !hit.uv) return m && m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1];
  let d = _px.get(map.uuid); if (!d) { const im = map.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); d = { w: c.width, h: c.height, px: g.getImageData(0, 0, c.width, c.height).data }; _px.set(map.uuid, d); }
  const u = ((hit.uv.x % 1) + 1) % 1, v = ((hit.uv.y % 1) + 1) % 1, x = Math.min(d.w - 1, Math.floor(u * d.w)), y = Math.min(d.h - 1, Math.floor((map.flipY ? 1 - v : v) * d.h)), i = (y * d.w + x) * 4;
  const k = m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1]; return [d.px[i] / 255 * k[0], d.px[i + 1] / 255 * k[1], d.px[i + 2] / 255 * k[2]];
}
// Rasterise a model's outward faces onto a grid per side (+x, -x, +z, -z in model space) and find window patches.
const _fw = new Map();
function sideWindows(c3, id, sc, step = 0.25) {
  const key = id + '|' + sc.map(v => v.toFixed(3)).join(','); if (_fw.has(key)) return _fw.get(key);
  const m = c3.model(id, false), out = []; if (!m) { _fw.set(key, out); return out; }
  m.updateMatrixWorld(true); const tris = [], A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), S3 = new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]), M = new THREE.Matrix4();
  m.traverse(o => { if (!o.isMesh) return; M.multiplyMatrices(S3, o.matrixWorld); const P = o.geometry.attributes.position, U = o.geometry.attributes.uv, I = o.geometry.index, n = I ? I.count : P.count;
    for (let k = 0; k < n; k += 3) { const ix = I ? [I.getX(k), I.getX(k + 1), I.getX(k + 2)] : [k, k + 1, k + 2]; const p = ix.map(i => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(M)); const uv = U ? ix.map(i => new THREE.Vector2().fromBufferAttribute(U, i)) : null; tris.push({ p, uv, mat: o.material }); } });
  const box = new THREE.Box3(); tris.forEach(t => t.p.forEach(v => box.expandByPoint(v)));
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ux = nz, uz = -nx, u0 = Math.min(box.min.x * ux + box.min.z * uz, box.max.x * ux + box.max.z * uz), u1 = Math.max(box.min.x * ux + box.min.z * uz, box.max.x * ux + box.max.z * uz);
    const W = Math.max(1, Math.ceil((u1 - u0) / step)), Hh = Math.max(1, Math.ceil((box.max.y - box.min.y) / step)), dep = new Float32Array(W * Hh).fill(-1e9), col = new Array(W * Hh);
    for (const t of tris) { const [p0, p1, p2] = t.p; A.subVectors(p1, p0); B.subVectors(p2, p0); Cc.crossVectors(A, B); const L = Cc.length(); if (L < 1e-9 || (Cc.x * nx + Cc.z * nz) / L < 0.3) continue;
      const q = t.p.map(v => [(v.x * ux + v.z * uz - u0) / step, (v.y - box.min.y) / step, v.x * nx + v.z * nz]);
      const i0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]))), i1 = Math.min(W - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0]))), j0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]))), j1 = Math.min(Hh - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
      const den = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]); if (Math.abs(den) < 1e-9) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = i + 0.5, y = j + 0.5, w0 = ((q[1][1] - q[2][1]) * (x - q[2][0]) + (q[2][0] - q[1][0]) * (y - q[2][1])) / den, w1 = ((q[2][1] - q[0][1]) * (x - q[2][0]) + (q[0][0] - q[2][0]) * (y - q[2][1])) / den, w2 = 1 - w0 - w1; if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const d = w0 * q[0][2] + w1 * q[1][2] + w2 * q[2][2], k = j * W + i; if (d <= dep[k]) continue; dep[k] = d;
        col[k] = t.uv ? texel({ object: { material: t.mat }, uv: new THREE.Vector2(w0 * t.uv[0].x + w1 * t.uv[1].x + w2 * t.uv[2].x, w0 * t.uv[0].y + w1 * t.uv[1].y + w2 * t.uv[2].y) }) : texel({ object: { material: t.mat } }); } }
    const cells = []; for (let k = 0; k < W * Hh; k++) cells.push(dep[k] > -1e8 ? { d: dep[k], c: col[k] } : null);
    const hits = cells.filter(Boolean); if (hits.length < 40) continue;
    const mode = arr => { const f = new Map(); arr.forEach(v => f.set(v, (f.get(v) || 0) + 1)); return +[...f].sort((p, q) => q[1] - p[1])[0][0]; };
    const dm = mode(hits.map(q => Math.round(q.d * 25) / 25)), ck = c => c.map(v => Math.round(v * 8)).join(','), cf = new Map(); hits.forEach(q => { if (Math.abs(q.d - dm) < 0.1) cf.set(ck(q.c), (cf.get(ck(q.c)) || 0) + 1); });
    const wk = [...cf].sort((p, q) => q[1] - p[1])[0][0].split(',').map(v => v / 8), lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], wl = lum(wk);
    const isWin = q => q && Math.abs(q.d - dm) < 1.2 && (q.d < dm - 0.04 || (Math.hypot(q.c[0] - wk[0], q.c[1] - wk[1], q.c[2] - wk[2]) > 0.2 && (lum(q.c) < wl - 0.08 || (q.c[2] > q.c[0] + 0.08 && q.c[2] > wk[2] + 0.05))));
    const Wn = cells.map(isWin), seen = new Uint8Array(Wn.length), wins = [];
    for (let s0 = 0; s0 < Wn.length; s0++) { if (!Wn[s0] || seen[s0]) continue; const st = [s0]; seen[s0] = 1; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, cnt = 0;
      while (st.length) { const k = st.pop(), i = k % W, j = Math.floor(k / W); cnt++; x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= W || b2 >= Hh) continue; const q = b2 * W + a2; if (Wn[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
      const w = (x1 - x0 + 1) * step, h = (y1 - y0 + 1) * step; if (w < 0.25 || h < 0.25 || w > 4.2 || h > 3.6 || cnt / ((x1 - x0 + 1) * (y1 - y0 + 1)) < 0.45) continue;
      wins.push({ u: u0 + (x0 + x1 + 1) / 2 * step, y: box.min.y + (y0 + y1 + 1) / 2 * step, w, h }); }
    const bx = wins.map(w => ({ x0: w.u - w.w / 2, x1: w.u + w.w / 2, y0: w.y - w.h / 2, y1: w.y + w.h / 2 }));
    for (let again = true; again;) { again = false; for (let i = 0; i < bx.length && !again; i++) for (let j = i + 1; j < bx.length; j++) { const A2 = bx[i], B2 = bx[j], ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0), oy = ov(A2.y0, A2.y1, B2.y0, B2.y1), ox = ov(A2.x0, A2.x1, B2.x0, B2.x1);
      if ((oy > 0.5 * Math.min(A2.y1 - A2.y0, B2.y1 - B2.y0) && ox > -0.4) || (ox > 0.5 * Math.min(A2.x1 - A2.x0, B2.x1 - B2.x0) && oy > -0.4)) { const M2 = { x0: Math.min(A2.x0, B2.x0), x1: Math.max(A2.x1, B2.x1), y0: Math.min(A2.y0, B2.y0), y1: Math.max(A2.y1, B2.y1) }; if (M2.x1 - M2.x0 > 3.2 || M2.y1 - M2.y0 > 3) continue; bx[i] = M2; bx.splice(j, 1); again = true; break; } } }
    out.push({ n: [nx, nz], dm, wins: bx.filter(q => q.x1 - q.x0 >= 0.6 && q.y1 - q.y0 >= 0.8).map(q => ({ u: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2, w: q.x1 - q.x0, h: q.y1 - q.y0 })) });
  }
  _fw.set(key, out); return out;
}
// Best window-covered face near (x,z) that looks out onto open ground. Frame sits on the real facade; wins in frame coords.
export function windowFace(c3, x, z, { minH = 9, r = 110, n = 8 } = {}) {
  let best = null;
  for (const b of c3.near(x, z, r, i => isBuilding(i, minH)).slice(0, n)) {
    const row = c3.city.inst[b.ii]; if (!row || row.length !== 8) continue; const cs = Math.cos(row[4]), sn = Math.sin(row[4]);
    for (const sd of sideWindows(c3, b.id, [row[5], row[6], row[7]])) {
      const up = sd.wins.filter(w => w.y + row[2] > 3.2 && w.y + row[2] < 13); if (up.length < 4) continue;
      const uc = (Math.min(...up.map(w => w.u)) + Math.max(...up.map(w => w.u))) / 2, [nx, nz] = sd.n, ux = nz, uz = -nx;
      const px = nx * sd.dm + ux * uc, pz = nz * sd.dm + uz * uc, wx = row[1] + px * cs + pz * sn, wz = row[3] - px * sn + pz * cs, nwx = nx * cs + nz * sn, nwz = -nx * sn + nz * cs;
      if (c3.near(wx + nwx * 14, wz + nwz * 14, 8, i => isBuilding(i, 3)).length) continue;
      let wins = up.map(w => ({ x: w.u - uc, y: w.y + row[2], w: w.w, h: w.h })).filter(w => Math.abs(w.x) < 8);
      if (wins.length < 4) continue; const sc = wins.length * 10 - b.dist * 0.05;
      if (!best || sc > best.sc) best = { sc, x: wx, z: wz, yaw: Math.atan2(nwx, nwz), wins, fw: Math.max(...wins.map(w => Math.abs(w.x) * 2 + w.w)) + 2, h: b.top, b };
    }
  }
  return best;
}

export const C1 = {};

// ---------- Hose Down: spray every flame on a real shopfront ----------
C1.hose = {
  at: (c3, ev) => { const f = faceFrame(c3, ev.x, ev.z, { minH: 3.5, maxH: 40 }); return { x: f.x, z: f.z, yaw: f.yaw, r: 22, face: f }; },
  run: async (S, ctx) => {
    const L = ctx.level, n = 6 + 2 * L, f = S.spot.face, hw = Math.min(f.fw / 2 - 1, 8), top = Math.min(f.h - 1, 8);
    S.clear(-hw - 5, hw + 5, 0.3, 16);
    S.camera.position.set(1.5, 2.3, 12.5); S.camera.lookAt(0, Math.min(top, 6) * 0.45, 0);
    put(S, 'rg_firetruck', -hw - 1.5, 0, 7.5, Math.PI / 2 + 0.25);
    const flames = [];
    for (let i = 0; i < n; i++) {
      const ground = i % 3 === 2, sz = 1 + Math.random() * 0.6, fl = flame(sz, i < 4);
      let x, y; for (let k = 0; k < 30; k++) { x = -hw + Math.random() * hw * 2; y = ground ? 0 : 0.6 + Math.random() * Math.max(0.5, top - 1.4); if (!flames.some(o => Math.hypot(o.position.x - x, o.position.y - y) < 1.8)) break; }
      fl.position.set(x, y, ground ? 1.2 + Math.random() * 2 : 0.35); fl.userData.hitT = 0; S.scene.add(fl); flames.push(fl);
    }
    const sp = spray(S, { from: new THREE.Vector3(-hw + 0.8, 1.3, 8.2), rate: 55, arc: 0.9 }), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.4);
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15);
    const aim = p => { const w = S.rayPlane(p.ndc, plane), g = S.rayPlane(p.ndc, floor); let v = g && g.z > 0.4 && g.z < 11 ? g : w; if (!v) return;
      let best = null, bd = 1e9; for (const fl of flames) { if (fl.userData.hp <= 0) continue; const c = fl.position.clone(); c.y += 0.5 * fl.userData.size; for (const q of [w, g]) { if (!q) continue; const d = c.distanceTo(q); if (d < 1.3 * fl.userData.size + 0.5 && d < bd) { bd = d; best = c; } } }
      sp.target.copy(best || v); };
    S.on('down', p => { aim(p); sp.on = true; }); S.on('move', p => { if (sp.on) aim(p); }); S.on('up', () => (sp.on = false));
    let now = 0, splashT = 0;
    sp.onHit = p => { for (const fl of flames) { if (fl.userData.hp <= 0) continue; const c = fl.position.clone(); c.y += 0.5 * fl.userData.size; if (c.distanceTo(p) < 0.9 * fl.userData.size + 0.4) { fl.userData.hp -= 0.07; fl.userData.hitT = now; if (fl.userData.hp <= 0) ctx.sfx.hiss(); } } };
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      now = t; flames.forEach(fl => fl.userData.tick(t)); if (!act) return;
      if (sp.on && (splashT -= dt) < 0) { ctx.sfx.splash(); splashT = 0.45; }
      if (L === 2) flames.forEach(fl => { if (fl.userData.hp > 0 && t - fl.userData.hitT > 2) fl.userData.hp = Math.min(1, fl.userData.hp + dt * 0.05); });
      const left = flames.filter(fl => fl.userData.hp > 0).length;
      ch.set(`${icon('local_fire_department', 28, '#ff7a1a')}${left} left`);
      if (!left) { sp.on = false; win(); }
    });
    return {};
  },
};

// ---------- Hydrant Hookup: tap on green to turn the coupling ----------
C1.hydrant = {
  at: (c3, ev) => { const t = towardRoad(c3, ev.x, ev.z); return { x: ev.x, z: ev.z, yaw: t.yaw, r: 8 }; },
  run: async (S, ctx) => {
    const L = ctx.level, need = 6 + 2 * L; hideHydrants(S); S.clear(-3, 3, -3, 4);
    const hy = hydrantModel(S) || new THREE.Group(); S.scene.add(hy);
    const { b } = sizeOf(hy), hh = b.max.y, ox = b.max.x;
    const coup = new THREE.Group(); coup.position.set(ox + 0.08, hh * 0.55, 0); coup.rotation.z = Math.PI / 2;
    coup.add(cyl(0.12, 0.12, 0.12, '#c8a24a'), at(box(0.3, 0.05, 0.05, '#b08c38'), 0, 0.02, 0)); S.scene.add(coup);
    const hose = at(cyl(0.08, 0.08, 2.4, '#b9322b'), ox + 1.3, hh * 0.55, 0.3); hose.rotation.z = Math.PI / 2; hose.rotation.y = -0.25; S.scene.add(hose);
    S.camera.position.set(0.5, hh * 1.15 + 0.2, 2.4); S.camera.lookAt(ox * 0.6, hh * 0.5, 0);
    const bar = S.div('position:absolute;left:50%;bottom:56px;transform:translateX(-50%);width:640px;height:56px;border-radius:12px;background:#1c1d1f;padding:8px;box-sizing:border-box');
    bar.innerHTML = '<div style="position:relative;width:100%;height:100%;border-radius:8px;background:#3b3c3f;overflow:hidden"><div data-z style="position:absolute;top:0;bottom:0;background:#4caf50"></div><div data-m style="position:absolute;top:-4px;bottom:-4px;width:8px;margin-left:-4px;border-radius:4px;background:#f2f1ec"></div></div>';
    const zone = bar.querySelector('[data-z]'), mark = bar.querySelector('[data-m]');
    let p = 0, dir = 1, locks = 0, z0 = 0, spin = 0, jig = 0;
    const width = () => Math.max(0.1, [0.28, 0.22, 0.18][L] - locks * 0.012);
    const place = () => { const w = width(); z0 = 0.05 + Math.random() * (0.9 - w); zone.style.left = z0 * 100 + '%'; zone.style.width = w * 100 + '%'; };
    place();
    const ch = chip(S), win = once(ctx.win);
    S.on('down', () => {
      if (locks >= need) return; const w = width();
      if (p >= z0 && p <= z0 + w) { locks++; ctx.sfx.good(); spin += Math.PI * 2 / 3; if (locks < need) place(); else setTimeout(win, 500); }
      else { ctx.sfx.bad(); jig = 0.3; shake(bar); }
    });
    S.onTick((dt, t, act) => {
      coup.rotation.x += (spin - coup.rotation.x) * Math.min(1, dt * 10); jig = Math.max(0, jig - dt); coup.position.y = hh * 0.55 + Math.sin(t * 60) * jig * 0.03;
      if (!act) return;
      p += dir * [0.5, 0.65, 0.8][L] * dt * (1 + locks * 0.06); if (p > 1) { p = 1; dir = -1; } if (p < 0) { p = 0; dir = 1; }
      mark.style.left = p * 100 + '%';
      ch.set(`${icon('plumbing', 28, C.hv)}<span style="display:flex;gap:6px">${pips(locks, need)}</span>`);
    });
    return {};
  },
};

// ---------- Hydrant Thaw: tap tap tap to melt the ice ----------
C1.thaw = {
  at: (c3, ev) => { const t = towardRoad(c3, ev.x, ev.z); return { x: ev.x, z: ev.z, yaw: t.yaw, r: 8 }; },
  run: async (S, ctx) => {
    const L = ctx.level, need = 20 + 6 * L; hideHydrants(S); S.clear(-3, 3, -3, 4);
    const hy = hydrantModel(S) || new THREE.Group(); S.scene.add(hy);
    const { b } = sizeOf(hy), hh = b.max.y;
    const snow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28), new THREE.MeshLambertMaterial({ color: '#f4f8fb' })); snow.rotation.x = -Math.PI / 2; snow.position.y = 0.03; S.scene.add(snow);
    const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#bfe6f7', transparent: true, opacity: 0.8 })); ice.scale.set(0.55, hh * 0.62, 0.55); ice.position.y = hh * 0.5; S.scene.add(ice);
    const sp = spray(S, { from: new THREE.Vector3(0, hh + 0.05, 0), rate: 80, arc: 1.4 }); sp.target.set(1.4, 0, 1.2);
    S.camera.position.set(0.3, hh + 0.45, 2.6); S.camera.lookAt(0, hh * 0.5, 0);
    let taps = 0, done = false; const ch = chip(S), win = once(ctx.win);
    S.on('down', p => {
      if (done) return; taps++; ctx.sfx.tap();
      const r = S.div(`position:absolute;left:${p.x - 30}px;top:${p.y - 30}px;width:60px;height:60px;border-radius:50%;border:4px solid #ff8a2a;box-sizing:border-box;transition:transform .35s,opacity .35s`); requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = 0; }); setTimeout(() => r.remove(), 400);
      if (taps >= need) { done = true; ice.visible = false; sp.on = true; ctx.sfx.splash(); setTimeout(win, 1100); }
    });
    S.onTick((dt, t) => {
      const k = 1 - taps / need; if (!done) { ice.scale.set(0.2 + 0.35 * k, hh * (0.2 + 0.42 * k), 0.2 + 0.35 * k); ice.material.opacity = 0.35 + 0.45 * k; ice.rotation.y = Math.sin(t * 40) * 0.02 * (taps % 2); }
      if (S.active) ch.set(`${icon('ac_unit', 28, '#8fd0f5')}${meter(taps / need, '#ff8a2a', 180)}`);
    });
    return {};
  },
};

// ---------- Sandbag Wall: drag bags into the gaps along the river ----------
C1.sand = {
  at: (c3, ev) => { const w = waterFrame(c3, ev.x, ev.z), sx = Math.sin(w.yaw), sz = Math.cos(w.yaw); let d = 0; while (d < 40 && c3.isLand(ev.x + sx * d, ev.z + sz * d)) d += 1; d = Math.max(0, d - 3.5); let bx = 0; const br = (c3.city.segs || []).find(q => q.bridge && ev.x > q.x - 18 && ev.x < q.x + q.w + 18 && Math.abs(sx) < 0.5); if (br) bx = (ev.x < br.x + br.w / 2 ? br.x - 18 : br.x + br.w + 18) - ev.x; return { x: ev.x + bx + sx * d, z: ev.z + sz * d, yaw: w.yaw + Math.PI, r: 12 }; },
  run: async (S, ctx) => {
    const L = ctx.level, cols = [5, 6, 7][L], rows = 2, BW = 0.74, BH = 0.26;
    S.clear(-6, 6, -6, 4);
    S.camera.position.set(0.4, 3, 4.8); S.camera.lookAt(0, 0.2, -1.6);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshLambertMaterial({ color: '#3f86b8', transparent: true, opacity: 0.85 })); water.rotation.x = -Math.PI / 2; water.position.set(0, -0.3, -17.5); S.scene.add(water);
    const slots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * BW + (r ? BW / 2 * 0 : 0), y = BH / 2 + r * BH;
      const g = new THREE.Mesh(new THREE.BoxGeometry(BW * 0.94, BH * 0.9, 0.44), new THREE.MeshBasicMaterial({ color: C.hv, transparent: true, opacity: 0.35, depthWrite: false })); g.position.set(x, y, -1.6); S.scene.add(g);
      slots.push({ x, y, r, g, full: false });
    }
    const bag = () => { const m = S.model('sb_sandbag'); if (m) { const { s } = sizeOf(m); m.scale.setScalar(BW / Math.max(0.1, s.x)); return m; } return box(BW * 0.95, BH * 0.95, 0.44, '#c9b27c'); };
    const pile = new THREE.Group(); pile.position.set(2.6, 0, 0.4); S.scene.add(pile);
    for (let i = 0; i < 6; i++) { const m = bag(); m.position.set((i % 3) * 0.5 - 0.5, Math.floor(i / 3) * BH, (i % 2) * 0.2); m.rotation.y = 0.3 * (i % 2); pile.add(m); }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4); let held = null;
    S.on('down', p => { if (S.pick(p.ndc, [pile])) { held = bag(); S.scene.add(held); const v = S.rayPlane(p.ndc, plane); if (v) held.position.copy(v); ctx.sfx.tap(); } });
    S.on('move', p => { if (!held) return; const v = S.rayPlane(p.ndc, plane); if (v) held.position.copy(v); });
    S.on('up', () => {
      if (!held) return;
      const open = slots.filter(s => !s.full && (s.r === 0 || slots.some(q => q.r === 0 && q.full && Math.abs(q.x - s.x) < 0.1)));
      const s = open.sort((a, b) => Math.hypot(a.x - held.position.x, -1.6 - held.position.z) - Math.hypot(b.x - held.position.x, -1.6 - held.position.z))[0];
      if (s && Math.hypot(s.x - held.position.x, -1.6 - held.position.z) < 1.1) { held.position.set(s.x, s.y - BH / 2, -1.6); held.rotation.y = 0; s.full = true; s.g.visible = false; ctx.sfx.thud(); }
      else { S.scene.remove(held); ctx.sfx.bad(); }
      held = null;
    });
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      const n = slots.filter(s => s.full).length;
      slots.forEach(s => { if (!s.full) s.g.material.opacity = 0.25 + 0.2 * Math.sin(t * 5); });
      water.position.y = -0.3 + Math.min(0.45, t * 0.01) + Math.sin(t * 1.6) * 0.03;
      if (!act) return;
      ch.set(`${icon('waves', 28, '#8fd0f5')}${n} / ${slots.length}`);
      if (n === slots.length) win();
    });
    return {};
  },
};

// ---------- Catch!: pigs jump from a real tower block ----------
C1.catch = {
  at: (c3, ev) => { const w = windowFace(c3, ev.x, ev.z) || windowFace(c3, ev.x, ev.z, { r: 300, n: 30 }) || windowFace(c3, ev.x, ev.z, { r: 400, n: 60, minH: 6 }); if (w) return { x: w.x, z: w.z, yaw: w.yaw, r: 30, face: w, wins: w.wins, fz: 0 }; const f = faceFrame(c3, ev.x, ev.z, { minH: 9, r: 70 }); return { x: f.x, z: f.z, yaw: f.yaw, r: 30, face: f }; },
  run: async (S, ctx) => {
    const L = ctx.level, f = S.spot.face, real = S.spot.wins || null, fz = S.spot.fz || 0;
    const hw = real ? Math.max(3, ...real.map(w => Math.abs(w.x) + w.w / 2)) : Math.min(f.fw / 2 - 1.5, 7), ncol = Math.max(3, Math.min(5, Math.floor(hw * 2 / 2.8)));
    const rowsY = real ? [...new Set(real.map(w => Math.round(w.y * 2) / 2))].sort((a, b) => a - b) : [4.5, 7.5, 10.5].filter(y => y < f.h - 1.5); if (!rowsY.length) rowsY.push(Math.max(2.5, f.h * 0.6));
    const camZ = Math.max(24, rowsY[rowsY.length - 1] * 2.3);
    const fb = f.b; S.clear(-hw - 4, hw + 4, 1.5, camZ + 3, undefined, 14, fb ? r => Math.abs(r[1] - fb.x) < 0.3 && Math.abs(r[3] - fb.z) < 0.3 : null);
    S.camera.position.set(0, 5, camZ); S.camera.lookAt(0, rowsY[rowsY.length - 1] * 0.5, 0);
    const wins = []; if (real) real.forEach(w => { const g = glow(w.w + 0.1, w.h + 0.1); g.position.set(w.x, w.y, fz + 0.06); g.userData.h = w.h; S.scene.add(g); wins.push(g); });
    else rowsY.forEach(y => { for (let c = 0; c < ncol; c++) { const x = ncol === 1 ? 0 : -hw + c * (hw * 2 / (ncol - 1)); const g = glow(1.4, 1.5); g.position.set(x, y, 0.2); g.userData.h = 1.5; S.scene.add(g); wins.push(g); } });
    const cush = new THREE.Group(); cush.add(at(box(3.4, 0.8, 2.6, C.red), 0, 0.4, 0), at(box(3.5, 0.12, 2.7, C.hv), 0, 0.82, 0)); cush.position.set(0, 0, 3); S.scene.add(cush);
    let zoo = null; try { zoo = await S.city.zoo; } catch (e) {}
    const pigSrc = zoo && zoo.get && zoo.get('animal_pig');
    const makePig = () => { if (pigSrc) { const o = SkeletonUtils.clone(pigSrc.scene); const mx = new THREE.AnimationMixer(o), cl = pigSrc.clips.find(c => c.name === 'Jump') || pigSrc.clips[0]; if (cl) mx.clipAction(cl).play(); o.userData.mx = mx; return o; } const g = new THREE.Group(); g.add(at(sph(0.5, '#f2a6b4'), 0, 0.5, 0)); return g; };
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), move = p => { const v = S.rayPlane(p.ndc, plane); if (v) cush.userData.want = Math.max(-hw - 1, Math.min(hw + 1, v.x)); };
    S.on('down', move); S.on('move', p => p.pressed && move(p));
    const need = 8, maxMiss = 3, every = [1.4, 1.05, 0.8][L], warn = [0.9, 0.7, 0.55][L], grav = [7, 8.5, 10][L];
    let caught = 0, miss = 0, spawnT = 1, pigs = [];
    const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
    S.onTick((dt, t, act) => {
      if (cush.userData.want !== undefined) cush.position.x += (cush.userData.want - cush.position.x) * Math.min(1, dt * 14);
      wins.forEach(w => (w.material.opacity = Math.max(0, w.material.opacity - dt * 1.5)));
      for (const p of pigs) { p.o.userData.mx && p.o.userData.mx.update(dt); }
      if (!act) return;
      spawnT -= dt;
      if (spawnT <= 0 && caught + pigs.filter(p => !p.done).length < need) {
        spawnT = every * (0.8 + Math.random() * 0.4); const w = wins[Math.floor(Math.random() * wins.length)]; w.material.opacity = 0.95; ctx.sfx.oink();
        const o = makePig(); o.position.set(w.position.x, w.position.y - w.userData.h / 2 + 0.05, fz + 0.7); o.visible = false; S.scene.add(o);
        pigs.push({ o, vy: 0, wait: warn, x0: w.position.x });
      }
      for (const p of pigs) {
        if (p.done) { if (p.fade > 0) { p.fade -= dt; p.o.position.z += dt * 2; if (p.fade <= 0) S.scene.remove(p.o); } continue; }
        if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) p.o.visible = true; continue; }
        p.vy -= grav * dt; p.o.position.y += p.vy * dt; p.o.position.z = Math.min(3, p.o.position.z + dt * 1.6); p.o.rotation.x += dt * 2;
        if (!p.judged && p.o.position.y <= 1.0) {
          p.judged = true;
          if (Math.abs(p.o.position.x - cush.position.x) < 2) { caught++; ctx.sfx.good(); p.vy = 5; p.bounced = true; }
          else { miss++; ctx.sfx.thud(); p.done = true; p.o.position.y = 0; p.o.rotation.x = 0; p.fade = 1.2; }
        }
        if (p.bounced && p.vy < 0 && p.o.position.y <= 1.0) { p.done = true; p.o.position.y = 0.85; p.o.rotation.x = 0; p.fade = 1.4; }
      }
      ch.set(`${icon('sports_handball', 28, C.hv)}${caught} / ${need}${sep}<span style="display:flex;gap:4px">${Array.from({ length: maxMiss }, (_, i) => icon(i < miss ? 'close' : 'favorite', 24, i < miss ? '#8b8c86' : C.red)).join('')}</span>`);
      if (caught >= need && pigs.every(p => p.done)) win();
      if (miss >= maxMiss) fail();
    });
    return {};
  },
};

// ---------- Power Off: match the wires in a fuse box on a real wall ----------
C1.power = {
  at: (c3, ev) => { const f = faceFrame(c3, ev.x, ev.z, { minH: 3 }); return { x: f.x, z: f.z, yaw: f.yaw, r: 10, face: f }; },
  run: async (S, ctx) => {
    const L = ctx.level; S.clear(-3, 3, 0.2, 5);
    const boxM = at(box(1.3, 1.6, 0.3, '#8f969c'), 0, 1.6, 0.18), door = at(box(1.3, 1.6, 0.05, '#a7adb2'), -1.3, 1.6, 0.35); door.rotation.y = -1.9; door.position.set(-0.75, 1.6, 0.9);
    const sign = at(box(0.4, 0.4, 0.02, C.hv), 0, 2.2, 0.34); sign.rotation.z = Math.PI / 4;
    const lever = at(box(0.12, 0.4, 0.12, C.red), 0.45, 1.7, 0.4); S.scene.add(boxM, door, sign, lever);
    const bulb = new THREE.PointLight('#ffd27a', 1.6, 5); bulb.position.set(0, 1.9, 0.7); S.scene.add(bulb);
    S.camera.position.set(0, 1.75, 3.6); S.camera.lookAt(0, 1.6, 0);
    const ALL = ['#d8362d', '#e5e043', '#2f88c4', '#4caf50', '#f2f1ec', '#ff8a1a', '#8e5bd8', '#f27cb4', '#38c8f0', '#8a5a36'];
    const COLS = ALL.slice(0, 6 + 2 * L), n = COLS.length, right = COLS.map((c, i) => i).sort(() => Math.random() - 0.5);
    const bw = 720, bh = n > 8 ? 560 : 500, ds = n > 8 ? 42 : 50, board = S.div(`position:absolute;left:50%;top:${(H - bh) / 2 + 10}px;transform:translateX(-50%);width:${bw}px;height:${bh}px;border-radius:16px;background:rgba(28,29,31,.92);pointer-events:auto;touch-action:none`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', bw); svg.setAttribute('height', bh); svg.style.cssText = 'position:absolute;inset:0'; board.appendChild(svg);
    const Y = i => 40 + i * ((bh - 80) / Math.max(1, n - 1)), LX = 90, RX = bw - 90;
    const dot = (x, y, c) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:${x - ds / 2}px;top:${y - ds / 2}px;width:${ds}px;height:${ds}px;border-radius:50%;background:${c};border:4px solid #1c1d1f;box-sizing:border-box;box-shadow:0 0 0 3px #48494c`; board.appendChild(d); };
    COLS.forEach((c, i) => dot(LX, Y(i), c)); right.forEach((ci, j) => dot(RX, Y(j), COLS[ci]));
    const line = (c, x1, y1) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'path'); l.setAttribute('stroke', c); l.setAttribute('stroke-width', 12); l.setAttribute('fill', 'none'); l.setAttribute('stroke-linecap', 'round'); svg.appendChild(l); const o = { l, set(x2, y2) { l.setAttribute('d', `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`); } }; o.set(x1, y1); return o; };
    const done = new Set(); let drag = null, sw = null, off = false, offT = 0;
    const loc = e => { const r = board.getBoundingClientRect(), k = bw / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
    const win = once(ctx.win);
    board.addEventListener('pointerdown', e => { if (!S.active || S.paused) return; const p = loc(e); const i = COLS.findIndex((c, i) => !done.has(i) && Math.hypot(p.x - LX, p.y - Y(i)) < ds * 0.8); if (i < 0) return; try { board.setPointerCapture(e.pointerId); } catch (_) {} drag = { i, ln: line(COLS[i], LX, Y(i)) }; ctx.sfx.tap(); });
    board.addEventListener('pointermove', e => { if (drag) { const p = loc(e); drag.ln.set(p.x, p.y); } });
    board.addEventListener('pointerup', e => {
      if (!drag) return; const p = loc(e), j = right.findIndex((ci, j) => Math.hypot(p.x - RX, p.y - Y(j)) < ds * 0.85);
      if (j >= 0 && right[j] === drag.i) { drag.ln.set(RX, Y(j)); done.add(drag.i); ctx.sfx.good(); if (done.size === n) showSwitch(); }
      else { drag.ln.l.remove(); if (j >= 0) { ctx.sfx.bad(); shake(board); } }
      drag = null;
    });
    const showSwitch = () => { board.style.opacity = 0.35; board.style.pointerEvents = 'none'; sw = S.div(`position:absolute;left:50%;bottom:36px;transform:translateX(-50%);height:96px;padding:0 40px 0 24px;border-radius:14px;background:${C.hv};color:${C.ink};display:flex;align-items:center;gap:12px;font-weight:900;font-stretch:125%;font-size:32px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('power_settings_new', 52) + 'Power off'); sw.addEventListener('pointerdown', () => { if (off) return; off = true; ctx.sfx.thud(); sw.remove(); setTimeout(win, 900); }); };
    const ch = chip(S);
    S.onTick((dt, t, act) => {
      if (off) { offT += dt; lever.rotation.x = Math.min(1, offT * 4) * -1.2; bulb.intensity = Math.max(0, 1.6 - offT * 6); }
      else bulb.intensity = 1.2 + Math.sin(t * 30) * 0.3 * Math.random();
      if (act) ch.set(`${icon('cable', 28, C.hv)}<span style="display:flex;gap:6px">${pips(done.size, n)}</span>`);
    });
    return {};
  },
};

// ---------- Truck Check: repeat the pattern on the real fire engine at the station ----------
C1.check = {
  at: c3 => { const t = c3.near(c3.city.spawn.x, c3.city.spawn.z, 60, i => i.id === 'rg_firetruck')[0] || { x: c3.city.spawn.x, z: c3.city.spawn.z - 14 }; return { x: t.x, z: t.z, yaw: 0, r: 14 }; },
  run: async (S, ctx) => {
    const L = ctx.level, goal = 6 + 2 * L;
    S.hide((r, info) => info.id === 'rg_firetruck' && Math.hypot(r[1] - S.spot.x, r[3] - S.spot.z) < 2);
    const T = put(S, 'rg_firetruck', 0, 0, 0, Math.PI / 2) || new THREE.Group(); const { b } = sizeOf(T);
    const zs = b.max.z; T.updateMatrixWorld(true);
    const byMat = re => { const out = []; T.traverse(m => { if (m.isMesh && re.test(m.material.name || '')) { m.material = m.material.clone(); m.material.emissive = new THREE.Color('#000'); out.push(m); } }); return out; };
    const part = (key, ic, col, on, re, f) => { const meshes = byMat(re), bx = new THREE.Box3(); meshes.forEach(m => bx.expandByObject(m)); const L = new THREE.PointLight(on, 0, 4); if (!bx.isEmpty()) S.scene.worldToLocal(bx.getCenter(L.position)); S.scene.add(L); return { key, ic, col, on, meshes, f, L }; };
    const parts = [
      part('siren', 'emergency', '#3b6fe0', '#6f9bff', /flashers|siren/i, 523),
      part('head', 'highlight', '#f2f1ec', '#fff6d0', /headlights/i, 392),
      part('rear', 'warning', C.red, '#ff3a2a', /rear lights/i, 659),
      part('wheels', 'tire_repair', '#b9b8b2', '#ffe27a', /^(wheels|tires)$/i, 784),
    ].filter(p => p.meshes.length);
    S.clear(-7, 7, -4, 10);
    { const Lx = b.max.x - b.min.x, cx = (b.min.x + b.max.x) / 2; S.camera.position.set(cx + Lx * 0.45, Math.max(3.2, b.max.y * 1.05), zs + Lx * 1.05); S.camera.lookAt(cx + Lx * 0.08, b.max.y * 0.42, (b.min.z + b.max.z) / 2); }
    const bar = S.div('position:absolute;left:50%;bottom:32px;transform:translateX(-50%);display:flex;gap:16px;pointer-events:none');
    const btns = parts.map((p, i) => { const d = document.createElement('div'); d.style.cssText = `width:120px;height:120px;border-radius:18px;background:#1c1d1f;color:${p.col};display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none`; d.innerHTML = icon(p.ic, 64); d.addEventListener('pointerdown', () => press(i)); bar.appendChild(d); return d; });
    let AC = null; const tone = fq => { try { AC = AC || new AudioContext(); const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = fq; g.gain.setValueAtTime(0.18, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.35); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.36); } catch (e) {} };
    const flash = (i, ms = 380) => { const p = parts[i]; p.meshes.forEach(m => m.material.emissive.set(p.on)); p.L.intensity = 6; btns[i].style.background = C.hv; btns[i].style.color = C.ink; tone(p.f); setTimeout(() => { p.meshes.forEach(m => m.material.emissive.set('#000')); p.L.intensity = 0; btns[i].style.background = '#1c1d1f'; btns[i].style.color = p.col; }, ms); };
    let seq = [], inp = [], showing = false;
    const ch = chip(S), win = once(ctx.win);
    const show = () => { showing = true; inp = []; seq.forEach((k, j) => setTimeout(() => flash(k), 600 + j * 640)); setTimeout(() => (showing = false), 600 + seq.length * 640); };
    const next = () => { if (seq.length >= goal) return win(); seq.push(Math.floor(Math.random() * parts.length)); if (seq.length < 2) seq.push(Math.floor(Math.random() * parts.length)); show(); };
    function press(i) {
      if (!S.active || S.paused || showing) return; flash(i, 220); inp.push(i);
      if (inp[inp.length - 1] !== seq[inp.length - 1]) { ctx.sfx.bad(); shake(bar); setTimeout(show, 800); return; }
      if (inp.length === seq.length) { ctx.sfx.good(); setTimeout(next, 700); }
    }
    S.onTick((dt, t, act) => { if (act) ch.set(`${icon(showing ? 'visibility' : 'touch_app', 28, C.hv)}${showing ? 'Watch' : 'Your turn'}${sep}<span style="display:flex;gap:6px">${pips(Math.max(0, seq.length - 1), goal - 1)}</span>`); });
    return { begin() { bar.style.pointerEvents = 'auto'; next(); } };
  },
};

// ---------- Foam Mixer: match the colour on a table outside the station ----------
C1.foam = {
  at: c3 => { const f = stationFrame(c3); return { x: f.x, z: f.z, yaw: f.yaw, r: 10 }; },
  run: async (S, ctx) => {
    const L = ctx.level, TZ = 5;
    S.clear(-3, 3, TZ - 2, TZ + 5);
    const wood = mat('#8a5a36'); S.scene.add(at(box(2.4, 0.08, 1.2, wood), 0, 0.92, TZ)); for (const [x, z] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) S.scene.add(at(box(0.08, 0.9, 0.08, wood), x, 0.45, TZ + z));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' })); tank.position.set(0.55, 1.26, TZ); S.scene.add(tank, at(cyl(0.3, 0.3, 0.05, '#48494c'), 0.55, 1.58, TZ), at(cyl(0.3, 0.3, 0.05, '#48494c'), 0.55, 0.96, TZ));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); card.position.set(-0.55, 1.35, TZ - 0.1); S.scene.add(card, at(box(0.66, 0.66, 0.03, '#1c1d1f'), -0.55, 1.35, TZ - 0.13), at(box(0.05, 0.5, 0.05, '#1c1d1f'), -0.55, 1.0, TZ - 0.13));
    ['#d8362d', '#4caf50', '#2f88c4'].forEach((c, i) => S.scene.add(at(cyl(0.1, 0.1, 0.16, c), -0.3 + i * 0.28, 1.04, TZ + 0.4)));
    S.camera.position.set(-0.2, 1.95, TZ + 3.6); S.camera.lookAt(0, 1.2, TZ);
    const opts = [[0, 2, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]][L]; let T;
    for (let k = 0; k < 200; k++) { T = [0, 0, 0].map(() => opts[Math.floor(Math.random() * opts.length)]); const nz = T.filter(v => v > 0).length, dist = new Set(T).size; if (nz >= 2 && dist >= [2, 2, 3][L] && !(L === 0 && T.every(v => v === 0 || v === 4))) break; }
    const V = [0, 0, 0], hex = a => '#' + a.map(v => Math.round(v / 4 * 255).toString(16).padStart(2, '0')).join('');
    card.material.color.set(hex(T));
    const panel = S.div('position:absolute;right:40px;top:110px;width:430px;padding:20px;border-radius:16px;background:#1c1d1f;display:flex;flex-direction:column;gap:14px;pointer-events:auto');
    const sw = document.createElement('div'); sw.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px'; sw.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:16px;text-transform:uppercase">${icon('flag', 22)}Target<div style="height:70px;border-radius:10px;background:${hex(T)};border:3px solid #48494c"></div></div><div style="display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:16px;text-transform:uppercase">${icon('science', 22)}Your mix<div data-mix style="height:70px;border-radius:10px;background:#000;border:3px solid #48494c"></div></div>`; panel.appendChild(sw);
    const mixEl = sw.querySelector('[data-mix]'), CH = [['#d8362d', 'R'], ['#4caf50', 'G'], ['#2f88c4', 'B']], cells = [];
    CH.forEach(([c], ci) => { const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:8px'; cells[ci] = []; for (let v = 0; v <= 4; v++) { const d = document.createElement('div'); d.style.cssText = `height:56px;border-radius:10px;cursor:pointer;border:3px solid transparent;box-sizing:border-box;background:${c};opacity:${0.18 + v * 0.2}`; d.addEventListener('pointerdown', () => { if (!S.active || S.paused) return; V[ci] = v; ctx.sfx.tap(); upd(); }); row.appendChild(d); cells[ci].push(d); } panel.appendChild(row); });
    const mixB = document.createElement('div'); mixB.style.cssText = `height:72px;border-radius:12px;background:${C.hv};color:${C.ink};display:flex;align-items:center;justify-content:center;gap:10px;font-weight:900;font-stretch:125%;font-size:28px;text-transform:uppercase;cursor:pointer`; mixB.innerHTML = icon('water_drop', 40) + 'Spray'; panel.appendChild(mixB);
    const upd = () => { tank.material.color.set(hex(V)); mixEl.style.background = hex(V); cells.forEach((r, ci) => r.forEach((d, v) => (d.style.borderColor = v === V[ci] ? '#f2f1ec' : 'transparent'))); };
    upd();
    const sp = spray(S, { from: new THREE.Vector3(0.55, 1.6, TZ), color: '#ffffff', rate: 60, arc: 0.6 }); sp.target.set(1.6, 1.3, TZ + 1.5);
    const win = once(ctx.win);
    mixB.addEventListener('pointerdown', () => {
      if (!S.active || S.paused) return; sp.on = true; ctx.sfx.splash(); setTimeout(() => (sp.on = false), 700);
      if (V.every((v, i) => v === T[i])) { ctx.sfx.good(); setTimeout(win, 800); }
      else { ctx.sfx.bad(); shake(panel); if (L === 0) cells.forEach((r, ci) => { if (V[ci] !== T[ci]) r[V[ci]].animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 400 }); }); }
    });
    const ch = chip(S);
    S.onTick((dt, t, act) => { if (act) ch.set(`${icon('palette', 28, C.hv)}Match the colour`); });
    return {};
  },
};
