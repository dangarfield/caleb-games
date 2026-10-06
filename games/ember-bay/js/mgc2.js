// Blaze · Ember Bay minigames played inside the real town (part 2): cat road boat pets drone heli drop race.
import { THREE, chip, meter, pips, flame, spray, box, cyl, sph, at, mat, icon, C, W, H, faceFrame, towardRoad, roadFrame, waterFrame, driveButtons, isBuilding, put, once, sep } from './mg-kit.js';
import { loadPeople } from './city-assets.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const sizeOf = o => { const p = o.parent; if (p) p.remove(o); o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); if (p) p.add(o); return { b, s: b.getSize(new THREE.Vector3()) }; };
const fitTo = (o, len) => { const { s } = sizeOf(o); const m = Math.max(s.x, s.z); if (m > 0.01) o.scale.multiplyScalar(len / m); return o; };
const animal = (S, id, clip = 'Idle') => { const z = S.city.zoo, src = z && z.get && z.get(id); if (!src) return null; const o = SkeletonUtils.clone(src.scene); const mx = new THREE.AnimationMixer(o), c = src.clips.find(k => k.name === clip) || src.clips[0]; if (c) mx.clipAction(c).play(); o.userData.mx = mx; return o; };
const PEOPLE = ['person_casual_male', 'person_casual_female', 'person_casual2_male', 'person_casual3_female', 'person_worker_male', 'person_casual2_female', 'person_oldclassy_male'];
async function people(n, clip) { const P = await loadPeople('../_shared/assets/', PEOPLE); return Array.from({ length: n }, (_, i) => { const src = P.get(PEOPLE[i % PEOPLE.length]); const o = SkeletonUtils.clone(src.scene); const mx = new THREE.AnimationMixer(o); o.userData.mx = mx; o.userData.src = src; const c = src.clips.find(k => k.name === clip) || src.clips[0]; if (c) { const a = mx.clipAction(c); a.time = Math.random() * c.duration; a.play(); } return o; }); }
const playClip = (o, name) => { const src = o.userData.src, mx = o.userData.mx; if (!src || !mx) return; mx.stopAllAction(); const c = src.clips.find(k => k.name === name); if (c) mx.clipAction(c).play(); };
const bigPark = c3 => c3.city.blocks.find(b => b.zone === 'bigpark') || c3.city.blocks.find(b => /park/.test(b.template || '')) || { x: 0, z: 0, w: 60, d: 60, cx: 30, cz: 30 };
const pondOf = c3 => { const p = bigPark(c3); return c3.near(p.cx, p.cz, 90, i => /^water/.test(i.base))[0] || { x: p.cx, z: p.cz, w: 30, d: 20 }; };
// Engine placement for drive games: local (x,z) + local heading → real engine.
const placeEngine = (S, x, z, h = 0) => { const c = S.toCity(new THREE.Vector3(x, 0, z)); S.city.placeEngine(c.x, c.z, S.spot.yaw + h); };
const engLocal = S => { const e = S.city.engineObj(); return { p: S.worldToLocal(e.position), h: S.city.drive.h - S.spot.yaw, v: S.city.drive.v }; };
function keysPad(S) {
  const K = {};
  const mk = (parent, k, ic, w, h, isz) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;border-radius:18px;background:#1c1d1f;color:#f2f1ec;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:pointer`; b.innerHTML = icon(ic, isz); parent.appendChild(b);
    const set = on => { K[k] = on; b.style.background = on ? C.hv : '#1c1d1f'; b.style.color = on ? C.ink : '#f2f1ec'; };
    b.addEventListener('pointerdown', e => { if (!S.active || S.paused) return; e.preventDefault(); set(true); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => set(false))); };
  const left = S.div('position:absolute;left:28px;bottom:28px;display:flex;gap:14px;pointer-events:auto'), right = S.div('position:absolute;right:28px;bottom:28px;display:flex;flex-direction:column;gap:12px;pointer-events:auto');
  mk(left, 'l', 'arrow_left', 128, 128, 96); mk(left, 'r', 'arrow_right', 128, 128, 96); mk(right, 'f', 'arrow_drop_up', 128, 150, 120); mk(right, 'b', 'arrow_drop_down', 128, 96, 96);
  const km = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'f', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', KeyW: 'f', KeyS: 'b' };
  const kd = e => { if (km[e.code] && S.active) K[km[e.code]] = true; }, ku = e => { if (km[e.code]) K[km[e.code]] = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku); const prev = S.onDispose; S.onDispose = () => { prev && prev(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  return K;
}
const Wd = (S, v) => S.scene.localToWorld(v.clone());
const NOTFLAT = /^(road_|green_|parking|land|sand|park_|basketball|pg_pad)/;
const blockedAt = (S, lx, lz, pad = 1.2) => { const c = S.toCity(new THREE.Vector3(lx, 0, lz)); if (!S.city.isLand(c.x, c.z)) return true; return S.city.near(c.x, c.z, 25, i => !NOTFLAT.test(i.base)).some(b => b.dist < Math.max(b.w || 1, b.d || 1) / 2 + pad); };
const ring = (r, col = C.hv) => { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m; };

export const C2 = {};

// ---------- Cat Rescue: park the engine by a real tree, steer the ladder to the cat ----------
C2.cat = {
  at: (c3, ev) => { const t = c3.near(ev.x, ev.z, 40, i => /tree/.test(i.base) || /tree/.test(i.id))[0] || { x: ev.x, z: ev.z, h: 7, w: 4, d: 4 }; const r = towardRoad(c3, t.x, t.z); return { x: t.x, z: t.z, yaw: r.yaw, r: 20, tree: t, roadD: r.roadD }; },
  run: async (S, ctx) => {
    const L = ctx.level, t = S.spot.tree, th = Math.max(4.5, t.h || 7), cr = Math.max(1.2, Math.max(t.w || 3, t.d || 3) / 2), rd = Math.min(12, Math.max(5, (S.spot.roadD || 6) + 1.5));
    const hb = th * [0.55, 0.65, 0.72][L], reach = [0.9, 0.75, 0.6][L];
    S.clear(-9, 9, cr + 0.4, rd + 9);
    const branch = at(cyl(0.09, 0.14, cr + 0.9, '#6b4a2e', 8), 0.3, hb, (cr + 0.9) / 2); branch.rotation.x = Math.PI / 2; S.scene.add(branch);
    const cat = animal(S, 'animal_cat') || at(sph(0.25, '#e8923a'), 0, 0.25, 0); fitTo(cat, 0.95); cat.position.set(0.3, hb + 0.08, cr + 0.6); cat.rotation.y = 0.4; S.scene.add(cat);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: C.hv, transparent: true, depthTest: false })); halo.renderOrder = 20; halo.position.set(0.3, hb + 0.35, cr + 0.65); S.scene.add(halo);
    const eng = put(S, 'rg_firetruck', -3, 0, rd, Math.PI / 2) || new THREE.Group(); const { b } = sizeOf(eng);
    const base = new THREE.Vector3(b.min.x + 1.2, b.max.y + 0.15, rd);
    const lad = new THREE.Group(); lad.position.copy(base); S.scene.add(lad);
    const rails = new THREE.Group(); rails.add(at(box(0.08, 0.08, 1, '#c9ccd0'), -0.25, 0, 0.5), at(box(0.08, 0.08, 1, '#c9ccd0'), 0.25, 0, 0.5)); lad.add(rails);
    const rungs = new THREE.Group(); lad.add(rungs); for (let i = 0; i < 40; i++) rungs.add(at(box(0.5, 0.05, 0.05, '#c9ccd0'), 0, 0, i * 0.45));
    const tipM = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), new THREE.MeshBasicMaterial({ color: C.hv, depthTest: false, transparent: true, opacity: 0.9 })); tipM.renderOrder = 21; S.scene.add(tipM);
    const tip = base.clone().add(new THREE.Vector3(0.5, 1, -1)), want = tip.clone(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -cat.position.z);
    const aim = p => { const v = S.rayPlane(p.ndc, plane); if (v) want.copy(v); };
    S.on('down', aim); S.on('move', p => p.pressed && aim(p));
    S.camera.position.set(7.5, Math.max(4.5, hb * 0.85), rd + 11); S.camera.lookAt(-0.8, hb * 0.75, rd * 0.3);
    let hold = 0, saved = false;
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t2, act) => {
      cat.userData.mx && cat.userData.mx.update(dt); halo.lookAt(Wd(S, S.camera.position)); halo.scale.setScalar(1 + Math.sin(t2 * 5) * 0.12); halo.visible = !saved;
      if (act && !saved) { const d = want.clone().sub(tip), m = 3.2 * dt; if (d.length() > m) d.setLength(m); tip.add(d); if (tip.y < base.y + 0.3) tip.y = base.y + 0.3; }
      const v = tip.clone().sub(base), len = Math.min(18, v.length()); lad.lookAt(Wd(S, base.clone().add(v))); tipM.position.copy(base).addScaledVector(v.clone().normalize(), len); tipM.scale.setScalar(saved ? 0.001 : 1 + Math.sin(t2 * 6) * 0.12); rails.scale.z = len; rungs.children.forEach((r, i) => (r.visible = i * 0.45 < len));
      const dc = tip.distanceTo(cat.position.clone().add(new THREE.Vector3(0, 0.2, 0)));
      if (!act) return;
      if (!saved) { hold = dc < reach ? hold + dt : 0; if (hold > 0.7) { saved = true; ctx.sfx.good(); } }
      else { cat.position.lerp(tip.clone().add(new THREE.Vector3(0, 0.1, 0)), Math.min(1, dt * 6)); if (cat.position.distanceTo(tip) < 0.35) win(); }
      ch.set(`${icon('pets', 28, C.hv)}${saved ? 'Got it!' : dc < reach ? 'Hold it there…' : 'Drag the ladder to the cat' + sep + (Math.round(dc * 10) / 10) + ' m'}`);
    });
    return {};
  },
};

// ---------- Clear the Road: push fallen logs off a real street with the real engine ----------
C2.road = {
  at: (c3, ev) => { const f = openRoad(c3, ev); return { x: f.x, z: f.z, yaw: f.yaw, r: 40, drive: true, len: f.len }; },
  run: async (S, ctx) => {
    const L = ctx.level, n = [3, 5, 7][L], len = S.spot.len || 40, z0 = -len / 2 + 10;
    S.hide((r, info) => { if (!/^(cc_|car|jeep|pickup|truck|tractor|sp_traffic)/.test(info.base) && !/^(cc_|car|jeep|pickup|truck)/.test(info.id)) return false; const l = S.toLocal(r[1], r[3]); return Math.abs(l.x) < 7 && l.z > -len / 2 - 14 && l.z < z0 + n * 7 + 10; });
    placeEngine(S, 0, -len / 2 - 6, 0);
    const logs = Array.from({ length: n }, (_, i) => {
      const g = new THREE.Group(), m = S.model('logs_a_v1'); if (m) { fitTo(m, 3); g.add(m); } else { const l = at(cyl(0.45, 0.5, 3, '#7a5a3a', 10), 0, 0.5, 0); l.rotation.z = Math.PI / 2; g.add(l); }
      g.position.set((Math.random() - 0.5) * 4, 0, z0 + i * 7); g.rotation.y = (Math.random() - 0.5) * 0.6; g.userData.v = new THREE.Vector3(); S.scene.add(g); return g;
    });
    driveButtons(S);
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      if (!act) return;
      const e = engLocal(S), fx = Math.sin(e.h), fz = Math.cos(e.h);
      for (const g of logs) {
        const dx = g.position.x - e.p.x, dz = g.position.z - e.p.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
        if (lz > 0 && lz < 5.2 && Math.abs(lx) < 2.2 && e.v > 0.3) { const push = e.v * 1.05, s = Math.sign(lx || 1); g.userData.v.set(fx * push + s * fz * 1.4, 0, fz * push - s * fx * 1.4); }
        g.position.addScaledVector(g.userData.v, dt); g.userData.v.multiplyScalar(Math.pow(0.12, dt)); g.rotation.y += g.userData.v.length() * dt * 0.3;
      }
      const off = logs.filter(g => Math.abs(g.position.x) > 6.2).length;
      ch.set(`${icon('forest', 28, C.hv)}<span style="display:flex;gap:6px">${pips(off, n)}</span>`);
      if (off >= n) win();
    });
    return {};
  },
};

// ---------- River Rescue: steer the real boat, pull swimmers aboard ----------
C2.boat = {
  at: (c3, ev) => { const w = waterFrame(c3, ev.x, ev.z); return { x: ev.x, z: ev.z, yaw: w.yaw, r: 60 }; },
  run: async (S, ctx) => {
    const L = ctx.level, n = [3, 4, 5][L], c3 = S.city, wet = (x, z) => { const c = S.toCity(new THREE.Vector3(x, 0, z)); return !c3.isLand(c.x, c.z); };
    let sz = 6; while (sz < 60 && !wet(0, sz)) sz += 2; sz += 4;
    const boat = new THREE.Group(), bm = S.model('bt_speed_boat'); if (bm) { fitTo(bm, 5.5); const { s } = sizeOf(bm); if (s.x > s.z) bm.rotation.y = Math.PI / 2; boat.add(bm); } else boat.add(at(box(2, 0.7, 4.4, C.red), 0, 0.3, 0));
    boat.position.set(0, -0.5, sz); S.scene.add(boat);
    const swim = await people(n, 'Victory');
    swim.forEach((o, i) => { let x, z; for (let k = 0; k < 40; k++) { x = (Math.random() - 0.5) * 50; z = sz + 14 + Math.random() * (24 + L * 10); if (wet(x, z) && !swim.slice(0, i).some(q => Math.hypot(q.position.x - x, q.position.z - z) < 8)) break; } o.position.set(x, -1.85, z); o.rotation.y = Math.random() * 6.28; const rg = ring(1.1, '#ffffff'); rg.position.set(x, -0.62, z); o.userData.ring = rg; S.scene.add(o, rg); });
    const st = { v: 0, h: 0 }, K = keysPad(S);
    const hook = S.div(`position:absolute;left:50%;bottom:40px;transform:translateX(-50%);height:96px;padding:0 34px 0 20px;border-radius:14px;background:#48494c;color:#8b8c86;display:flex;align-items:center;gap:10px;font-weight:900;font-stretch:125%;font-size:28px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('support', 44) + 'Rescue');
    let got = 0; const seats = [[-0.5, -1.2], [0.5, -1.2], [-0.5, -2], [0.5, -2], [0, -0.4]];
    const nearS = () => swim.find(o => !o.userData.saved && Math.hypot(o.position.x - boat.position.x, o.position.z - boat.position.z) < 5);
    hook.addEventListener('pointerdown', () => { if (!S.active || S.paused) return; const o = nearS(); if (o && Math.abs(st.v) < 4.5) { o.userData.saved = true; o.userData.ring.visible = false; S.scene.remove(o); boat.add(o); const s = seats[got % seats.length]; o.position.set(s[0], 0.25, s[1]); o.rotation.set(0, 0, 0); playClip(o, 'Idle'); got++; ctx.sfx.good(); } else ctx.sfx.bad(); });
    const ch = chip(S), win = once(ctx.win), cam = S.camera; cam.position.set(0, 7, sz - 12);
    S.onTick((dt, t, act) => {
      swim.forEach((o, i) => { o.userData.mx.update(dt); if (!o.userData.saved) { o.position.y = -1.85 + Math.sin(t * 2 + i) * 0.08; o.userData.ring.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.15); } });
      boat.position.y = -0.5 + Math.sin(t * 2.4) * 0.06; boat.rotation.z = Math.sin(t * 1.7) * 0.03;
      if (act) {
        if (K.f) st.v = Math.min(10, st.v + 5 * dt); else if (K.b) st.v = Math.max(-3, st.v - 7 * dt); else st.v *= Math.pow(0.35, dt);
        st.h += ((K.l ? 1 : 0) - (K.r ? 1 : 0)) * 1.4 * dt * Math.min(1, Math.abs(st.v) / 2) * Math.sign(st.v || 1);
        boat.rotation.y = st.h; const nx = boat.position.x + Math.sin(st.h) * st.v * dt, nz = boat.position.z + Math.cos(st.h) * st.v * dt;
        if (wet(nx + Math.sin(st.h) * 2.5, nz + Math.cos(st.h) * 2.5)) { boat.position.x = nx; boat.position.z = nz; } else { st.v = -st.v * 0.3; ctx.sfx.thud(); }
      }
      const fx = Math.sin(st.h), fz = Math.cos(st.h); cam.position.lerp(new THREE.Vector3(boat.position.x - fx * 12, 7, boat.position.z - fz * 12), Math.min(1, dt * 3)); cam.lookAt(boat.position.x + fx * 5, 0, boat.position.z + fz * 5);
      if (!act) return;
      const o = nearS(), ok = o && Math.abs(st.v) < 4.5; hook.style.background = ok ? C.hv : '#48494c'; hook.style.color = ok ? C.ink : '#8b8c86';
      ch.set(`${icon('support', 28, C.hv)}${got} / ${n} safe`);
      if (got >= n) win();
    });
    return {};
  },
};

// ---------- Pet Parade: gather the chicks in the big park and lead them to the hen ----------
C2.pets = {
  at: (c3, ev, L) => { const p = bigPark(c3), zc = [p.z + 36, p.cz + 20, p.z + p.d - 30][L]; return { x: p.cx, z: zc, yaw: 0, r: 45, drive: true, park: p }; },
  run: async (S, ctx) => {
    const L = ctx.level, n = [4, 5, 6][L], scare = [11, 10, 9][L], pond = pondOf(S.city), pl = S.toLocal(pond.x, pond.z);
    const p = S.spot.park, west = S.toLocal(p.x - 6, S.spot.z);
    placeEngine(S, west.x, west.z, Math.PI / 2);
    let NX = 14, NZ = 10; for (let k = 0; k < 60 && blockedAt(S, NX, NZ, 3.5); k++) { const a = k * 2.4, r = 6 + k * 0.8; NX = Math.cos(a) * r; NZ = Math.sin(a) * r; }
    const nest = ring(3.2); nest.position.set(NX, 0.06, NZ); S.scene.add(nest);
    const hen = animal(S, 'animal_hen') || at(sph(0.3, '#f2f1ec'), 0, 0.3, 0); fitTo(hen, 1.1); hen.position.set(NX, 0, NZ); S.scene.add(hen);
    const chicks = Array.from({ length: n }, (_, i) => { const o = animal(S, 'animal_chick') || at(sph(0.15, C.hv), 0, 0.15, 0); fitTo(o, 0.55); let x, z; for (let k = 0; k < 40; k++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 22; x = Math.cos(a) * r; z = Math.sin(a) * r; if (Math.hypot(x - pl.x, z - pl.z) > 18 && Math.hypot(x - NX, z - NZ) > 8 && !blockedAt(S, x, z)) break; } o.position.set(x, 0, z); o.userData.home = o.position.clone(); const rg = ring(0.8); rg.position.set(x, 0.05, z); o.userData.ring = rg; S.scene.add(o, rg); return o; });
    driveButtons(S);
    const trail = [], line = []; let fast = 0, homeN = 0;
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      chicks.forEach((c, i) => { if (!line.includes(c) && !c.userData.home2) { c.position.y = Math.abs(Math.sin(t * 5 + i)) * 0.12; c.userData.ring.visible = true; c.userData.ring.position.set(c.position.x, 0.05, c.position.z); } else c.userData.ring.visible = false; });
      hen.rotation.y = Math.sin(t) * 0.5; nest.material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
      if (!act) return;
      const e = engLocal(S), hl = (S.city.engDim().hl || 4.2) + 1.6; if (!trail.length || trail[0].distanceTo(e.p) > 0.3) trail.unshift(e.p.clone()); if (trail.length > 500) trail.pop();
      for (const c of chicks) if (!line.includes(c) && !c.userData.home2 && Math.hypot(c.position.x - e.p.x, c.position.z - e.p.z) < 5) { line.push(c); ctx.sfx.good(); }
      line.forEach((c, i) => { const q = trail[Math.round((hl + i * 1.3) / 0.3)]; if (q) { const tg = new THREE.Vector3(q.x, 0, q.z); if (c.position.distanceTo(tg) > 0.05) c.lookAt(Wd(S, tg)); c.position.lerp(tg, Math.min(1, dt * 6)); c.position.y = Math.abs(Math.sin(t * 9 + i)) * 0.08; } });
      fast = Math.abs(e.v) > scare ? fast + dt : 0;
      if (fast > 1 && line.length) { const c = line.pop(); c.position.copy(c.userData.home); ctx.sfx.bad(); fast = 0; }
      if (Math.hypot(e.p.x - NX, e.p.z - NZ) < 7 && line.length) { line.splice(0).forEach(c => { c.userData.home2 = true; c.position.set(NX + Math.cos(homeN * 1.3) * 1.6, 0, NZ + Math.sin(homeN * 1.3) * 1.6); homeN++; }); ctx.sfx.win(); }
      ch.set(`${icon('flutter_dash', 28, C.hv)}${homeN} / ${n} home${sep}${icon('group', 26)}${line.length}${fast > 0.2 ? sep + icon('speed', 26, C.red) + 'Slow down!' : ''}`);
      if (homeN >= n) win();
    });
    return {};
  },
};

// A spot among low houses (no tall blocks close by), nearest the call.
function smallTown(c3, ev) {
  const all = c3.near(ev.x, ev.z, 5000, i => isBuilding(i, 3)); let best = null;
  for (const b of all) { if (b.top > 10) continue; const around = all.filter(q => Math.hypot(q.x - b.x, q.z - b.z) < 32); if (all.some(q => q.top > 14 && Math.hypot(q.x - b.x, q.z - b.z) < 45)) continue; const small = around.filter(q => q.top <= 10).length, sc = small * 10 - b.dist * 0.02; if (small >= 5 && (!best || sc > best.sc)) best = { sc, x: b.x, z: b.z }; }
  return best || { x: ev.x, z: ev.z };
}
// A long straight road with nothing built right beside it, preferring one by the big park.
function openRoad(c3, ev) {
  const P = bigPark(c3), segs = (c3.city.segs || []).filter(q => !q.bridge && (q.v ? q.d : q.w) >= 34); let best = null;
  for (const q of segs) { const len = q.v ? q.d : q.w, cx = q.x + q.w / 2, cz = q.z + q.d / 2; let hits = 0;
    for (let k = -2; k <= 2; k++) { const px = q.v ? cx : cx + k * len / 5, pz = q.v ? cz + k * len / 5 : cz; hits += c3.near(px, pz, 13, i => isBuilding(i, 2.5)).length; }
    const sc = hits * 100 + Math.hypot(cx - P.cx, cz - P.cz) * 0.1; if (!best || sc < best.sc) best = { sc, q }; }
  if (!best) return roadFrame(c3, ev.x, ev.z); const q = best.q;
  return { x: q.x + q.w / 2, z: q.z + q.d / 2, yaw: q.v ? 0 : Math.PI / 2, len: q.v ? q.d : q.w, seg: q };
}
// Rooftops near a spot (local coords), for the drone.
function roofs(S, r = 45) { return S.city.near(S.spot.x, S.spot.z, r, i => isBuilding(i, 4)).filter(b => b.top < 45).map(b => { const l = S.toLocal(b.x, b.z); return { ...b, lx: l.x, lz: l.z, lyaw: b.yaw - S.spot.yaw }; }); }
const roofAt = (list, x, z) => { let y = 0; for (const b of list) { const dx = x - b.lx, dz = z - b.lz, cs = Math.cos(b.lyaw), sn = Math.sin(b.lyaw), lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) y = Math.max(y, b.top); } return y; };

// ---------- Drone Drop: fly the real drone over real rooftops ----------
C2.drone = {
  at: (c3, ev) => { const p = smallTown(c3, ev); return { x: p.x, z: p.z, yaw: 0, r: 50 }; },
  run: async (S, ctx) => {
    const L = ctx.level, R = roofs(S).filter(b => b.top < 14), n = [3, 4, 5][L];
    const pick = []; for (const lim of [16, 22, 30, 45]) { for (const b of R) if (pick.length < n && Math.hypot(b.lx, b.lz) < lim && !pick.includes(b) && !pick.some(q => Math.hypot(q.lx - b.lx, q.lz - b.lz) < 8)) pick.push(b); if (pick.length >= n) break; }
    while (pick.length < n) pick.push({ lx: (Math.random() - 0.5) * 24, lz: (Math.random() - 0.5) * 24, top: 0, w: 4, d: 4 });
    const fx0 = Math.min(...pick.map(b => b.lx)), fx1 = Math.max(...pick.map(b => b.lx)), fz0 = Math.min(...pick.map(b => b.lz)), fz1 = Math.max(...pick.map(b => b.lz)), fcx = (fx0 + fx1) / 2, fcz = (fz0 + fz1) / 2, ext = Math.max(fx1 - fx0, (fz1 - fz0) * 1.6, 12);
    const fires = pick.map(b => { const f = flame(2.2, true); f.position.set(b.lx, b.top + 0.1, b.lz); S.scene.add(f); return f; });
    const alt = Math.min(50, Math.max(...pick.map(b => b.top)) + 9), camH = Math.max(alt + 24, ...S.city.near(S.spot.x, S.spot.z, 70, i => isBuilding(i, 4)).map(b => b.top + 16));
    const dr = new THREE.Group(), dm = S.model('dr_drone'); if (dm) { fitTo(dm, 2.6); dr.add(dm); } else dr.add(box(1, 0.3, 1, '#f2f1ec')); dr.position.set(fcx, alt, fz1 + 6); S.scene.add(dr);
    const mark = ring(1.2); S.scene.add(mark);
    let vd = Math.max(camH - alt, ext * 1.1 + 10); const pts = [...pick.map(b => new THREE.Vector3(b.lx, b.top + 1.5, b.lz)), new THREE.Vector3(fcx, alt, fz1 + 6)];
    for (let k = 0; k < 30; k++) { S.camera.position.set(fcx, alt + vd, fcz + 3 + vd * 0.55); S.camera.lookAt(fcx, alt * 0.4, fcz + 3); S.camera.updateMatrixWorld(); if (pts.every(p => { const q = p.clone().project(S.camera); return Math.abs(q.x) < 0.8 && q.y < 0.7 && q.y > -0.8; })) break; vd *= 1.08; }
    const want = dr.position.clone(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -alt);
    const aim = p => { const v = S.rayPlane(p.ndc, plane); if (v) want.set(Math.max(fx0 - 8, Math.min(fx1 + 8, v.x)), alt, Math.max(fz0 - 8, Math.min(fz1 + 8, v.z))); };
    S.on('down', aim); S.on('move', p => p.pressed && aim(p));
    const drops = [];
    const btn = S.div(`position:absolute;right:40px;bottom:40px;width:150px;height:150px;border-radius:22px;background:${C.blue};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900;font-size:20px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('water_drop', 70) + 'Drop');
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); if (!S.active || S.paused) return; const b = at(sph(0.5, '#8fd0f5'), dr.position.x, dr.position.y - 0.5, dr.position.z); S.scene.add(b); drops.push({ b, vy: 0 }); ctx.sfx.tap(); });
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      fires.forEach(f => f.userData.tick(t));
      mark.position.set(dr.position.x, roofAt(R, dr.position.x, dr.position.z) + 0.08, dr.position.z); mark.material.opacity = 0.6 + Math.sin(t * 6) * 0.3;
      dr.position.y = alt + Math.sin(t * 2) * 0.3;
      if (!act) return;
      const d = want.clone().sub(dr.position); d.y = 0; const m = 10 * dt; if (d.length() > m) d.setLength(m); dr.position.add(d); dr.rotation.z = -d.x / Math.max(1e-3, m) * 0.15; dr.rotation.x = d.z / Math.max(1e-3, m) * 0.15;
      for (const q of drops) { if (q.done) continue; q.vy -= 20 * dt; q.b.position.y += q.vy * dt; const gy = roofAt(R, q.b.position.x, q.b.position.z);
        if (q.b.position.y <= gy + 0.3) { q.done = true; q.b.visible = false; ctx.sfx.splash(); for (const f of fires) if (f.userData.hp > 0 && Math.hypot(f.position.x - q.b.position.x, f.position.z - q.b.position.z) < 2.6 && Math.abs(f.position.y - gy) < 1.5) { f.userData.hp = 0; ctx.sfx.hiss(); } } }
      const out = fires.filter(f => f.userData.hp <= 0).length;
      ch.set(`${icon('local_fire_department', 28, '#ff7a1a')}${n - out} left`);
      if (out >= n) win();
    });
    return {};
  },
};

// ---------- Heli Bucket: fill at the big-park pond, put out tree fires ----------
C2.heli = {
  at: c3 => { const p = pondOf(c3); return { x: p.x, z: p.z, yaw: 0, r: 70 }; },
  run: async (S, ctx) => {
    const L = ctx.level, n = [3, 4, 5][L], hits = [1, 2, 2][L], pond = pondOf(S.city), pr = Math.max(8, Math.min(pond.w || 20, pond.d || 20) / 2);
    S.hide((r, info) => info.id === 'hc_helicopter' && Math.hypot(r[1] - S.spot.x, r[3] - S.spot.z) < 120);
    const trees = S.city.near(S.spot.x, S.spot.z, 75, i => /tree/.test(i.base) || /tree/.test(i.id)).filter(t => t.dist > 24);
    const pick = []; for (const t of trees.sort(() => Math.random() - 0.5)) if (pick.length < n && !pick.some(q => Math.hypot(q.x - t.x, q.z - t.z) < 18)) pick.push(t);
    const fires = pick.map(t => { const l = S.toLocal(t.x, t.z), f = flame(3, true); f.position.set(l.x, Math.max(1, (t.top || 6) * 0.55), l.z); f.userData.hits = 0; S.scene.add(f); return f; });
    while (fires.length < n) { const f = flame(3, true); f.position.set((Math.random() - 0.5) * 80, 0, 30 + Math.random() * 30); f.userData.hits = 0; S.scene.add(f); fires.push(f); }
    const alt = 22, heli = new THREE.Group(), hm = S.model('hc_helicopter'); if (hm) { fitTo(hm, 11); heli.add(hm); } else heli.add(box(1.6, 1.4, 3.4, C.red)); heli.position.set(0, alt, 16); S.scene.add(heli);
    const bucket = at(cyl(0.8, 0.6, 1.1, C.red, 14), 0, alt - 6, 16), rope = cyl(0.04, 0.04, 1, '#333', 4); S.scene.add(bucket, rope);
    const want = heli.position.clone(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -alt);
    const aim = p => { const v = S.rayPlane(p.ndc, plane); if (v) want.set(Math.max(-90, Math.min(90, v.x)), alt, Math.max(-90, Math.min(90, v.z))); };
    S.on('down', aim); S.on('move', p => p.pressed && aim(p));
    let full = 0, dropT = 0;
    const btn = S.div(`position:absolute;right:40px;bottom:40px;width:150px;height:150px;border-radius:22px;background:#48494c;color:#8b8c86;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900;font-size:20px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('water_drop', 70) + 'Drop');
    const sp = spray(S, { from: new THREE.Vector3(), rate: 110, arc: 0 });
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); if (!S.active || S.paused || full < 1) return; full = 0; dropT = 0.9; sp.on = true; ctx.sfx.splash();
      for (const f of fires) if (f.userData.hp > 0 && Math.hypot(f.position.x - bucket.position.x, f.position.z - bucket.position.z) < 5.5) { f.userData.hits++; f.userData.hp = 1 - f.userData.hits / hits; if (f.userData.hp <= 0) ctx.sfx.hiss(); } });
    const cam = S.camera; cam.position.set(0, alt + 38, 52);
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      fires.forEach(f => f.userData.tick(t));
      bucket.position.lerp(new THREE.Vector3(heli.position.x, heli.position.y - 7, heli.position.z), Math.min(1, dt * 3));
      rope.position.copy(heli.position).add(bucket.position).multiplyScalar(0.5); rope.scale.y = heli.position.distanceTo(bucket.position); rope.lookAt(Wd(S, bucket.position)); rope.rotateX(Math.PI / 2);
      dropT -= dt; sp.on = dropT > 0; sp.from.copy(bucket.position); sp.target.set(bucket.position.x, 0, bucket.position.z);
      cam.position.lerp(new THREE.Vector3(heli.position.x * 0.8, alt + 38, heli.position.z + 44), Math.min(1, dt * 2)); cam.lookAt(heli.position.x * 0.9, 0, heli.position.z - 6);
      if (!act) return;
      const d = want.clone().sub(heli.position); d.y = 0; const m = 12 * dt; if (d.length() > m) d.setLength(m); heli.position.add(d); if (d.lengthSq() > 1e-4) heli.rotation.y += (Math.atan2(d.x, d.z) - heli.rotation.y) * Math.min(1, dt * 3);
      if (Math.hypot(bucket.position.x, bucket.position.z) < pr && full < 1) { full = Math.min(1, full + dt / 1.5); if (full >= 1) ctx.sfx.good(); }
      btn.style.background = full >= 1 ? C.blue : '#48494c'; btn.style.color = full >= 1 ? '#fff' : '#8b8c86';
      const left = fires.filter(f => f.userData.hp > 0).length;
      ch.set(`${icon('local_fire_department', 28, '#ff7a1a')}${left} left${sep}${icon('water_drop', 26, '#8fd0f5')}${meter(full, C.blue, 110)}${full < 1 ? sep + icon('water', 24) + 'Fill at the pond' : ''}`);
      if (!left) win();
    });
    return {};
  },
};

// ---------- Supply Drop: pull back the launcher, fling the kit to a stranded walker ----------
C2.drop = {
  at: (c3, ev, L) => { if (L === 1) { const br = (c3.city.segs || []).filter(q => q.bridge).sort((a, b) => Math.hypot(a.x + a.w / 2 - ev.x, a.z + a.d / 2 - ev.z) - Math.hypot(b.x + b.w / 2 - ev.x, b.z + b.d / 2 - ev.z))[0]; if (br) { const x = br.x + br.w / 2, z = br.z + br.d / 2, a = br.v ? (c3.isLand(x + 30, z) ? -Math.PI / 2 : Math.PI / 2) : (c3.isLand(x, z + 30) ? Math.PI : 0); return { x, z, yaw: a, r: 35, bridge: true, halfW: (br.v ? br.w : br.d) / 2 }; } } const w = waterFrame(c3, ev.x, ev.z); return { x: ev.x, z: ev.z, yaw: w.yaw, r: 35 }; },
  run: async (S, ctx) => {
    const L = ctx.level, c3 = S.city, wet = (x, z) => { const c = S.toCity(new THREE.Vector3(x, 0, z)); return !c3.isLand(c.x, c.z); };
    let wz = 2; while (wz < 40 && !wet(0, wz)) wz += 1;
    const BR = !!S.spot.bridge, gy = BR ? -c3.deckY(S.spot.x, S.spot.z) : 0;
    const cz = BR ? Math.max(0, (S.spot.halfW || 5) - 1.6) : Math.max(0, wz - 3), dist = [14, 18, 22][L], iz = cz + dist, wind = [0, 1.4, -2.4][L];
    if (!BR) S.clear(-6, 6, -8, cz + 3);
    const isle = at(cyl(4.2, 5, 0.9, '#e3cf9a', 28), 0, gy - 0.45, iz); S.scene.add(isle);
    const mat0 = ring(1.6, C.red); mat0.position.set(0.8, gy + 0.02, iz); S.scene.add(mat0); const mat1 = ring(0.8, '#ffffff'); mat1.position.set(0.8, gy + 0.03, iz); S.scene.add(mat1);
    const [walker] = await people(1, 'Victory'); walker.position.set(-1.4, gy, iz + 0.6); walker.rotation.y = Math.PI; S.scene.add(walker);
    const cat = new THREE.Group(); cat.add(at(box(1.6, 0.4, 2.2, '#5a3d2a'), 0, 0.2, 0), at(box(0.12, 1.4, 0.12, '#5a3d2a'), -0.5, 1, 0.6), at(box(0.12, 1.4, 0.12, '#5a3d2a'), 0.5, 1, 0.6)); cat.position.set(0, 0, cz); S.scene.add(cat);
    const cup = new THREE.Vector3(0, 1.55, cz + 0.6);
    const kit = new THREE.Group(); kit.add(box(0.6, 0.45, 0.45, C.red), at(box(0.62, 0.1, 0.3, '#ffffff'), 0, 0, 0), at(box(0.12, 0.47, 0.3, '#ffffff'), 0, 0, 0)); kit.position.copy(cup); S.scene.add(kit);
    const DOTS = 26, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: C.hv }), DOTS); dots.frustumCulled = false; S.scene.add(dots); const d4 = new THREE.Object3D();
    if (BR) { S.camera.position.set(0, 4.6, cz - 5.5); S.camera.lookAt(0, gy * 0.6, cz + dist * 0.7); } else { S.camera.position.set(0, 3.4, cz - 7.5); S.camera.lookAt(0, 0.8, cz + dist * 0.6); }
    // pull handle + bands
    const pr = (v) => { const w = S.toCity(v); return v; };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.cssText = 'position:absolute;inset:0;pointer-events:none'; S.ui.appendChild(svg);
    const band = [0, 1].map(() => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('stroke', '#c9322b'); l.setAttribute('stroke-width', 8); l.setAttribute('stroke-linecap', 'round'); svg.appendChild(l); return l; });
    const knob = S.div(`position:absolute;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;background:${C.hv};color:${C.ink};display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;font-size:15px;text-transform:uppercase;pointer-events:auto;cursor:grab;touch-action:none;box-shadow:0 0 0 6px rgba(229,224,67,.35)`, icon('pan_tool', 44) + '<span data-p>Pull</span>');
    const hint = S.div('position:absolute;display:flex;flex-direction:column;align-items:center;gap:0;color:#f2f1ec;pointer-events:none;opacity:.9', icon('keyboard_double_arrow_down', 48));
    const pLab = knob.querySelector('[data-p]');
    const proj = v => { const w = S.scene.localToWorld(v.clone()).project(c3.camera); return { x: (w.x + 1) / 2 * W, y: (1 - w.y) / 2 * H }; };
    let pull = null, home = null, flying = null, tries = 0;
    const setBands = (hx, hy) => { const a = proj(new THREE.Vector3(-0.5, 1.7, cz + 0.6)), b = proj(new THREE.Vector3(0.5, 1.7, cz + 0.6)); band[0].setAttribute('x1', a.x); band[0].setAttribute('y1', a.y); band[1].setAttribute('x1', b.x); band[1].setAttribute('y1', b.y); band.forEach(l => { l.setAttribute('x2', hx); l.setAttribute('y2', hy); }); };
    const launchV = (dx, dy) => { const power = Math.max(0, Math.min(1, dy / 220)), aimA = dx / 320, v = 7 + power * 12.5, e = Math.PI / 4; return { power, vel: new THREE.Vector3(Math.sin(aimA) * v * Math.cos(e), v * Math.sin(e), Math.cos(aimA) * v * Math.cos(e)) }; };
    const simulate = (vel, useWind) => { const pts = [], p = cup.clone(), v = vel.clone(); for (let i = 0; i < 400 && p.y > gy; i++) { v.y -= 9.8 / 60; if (useWind) v.x += wind / 60; p.addScaledVector(v, 1 / 60); if (i % 4 === 0) pts.push(p.clone()); } return pts; };
    const showDots = pts => { for (let i = 0; i < DOTS; i++) { const q = pts[i]; if (q) { d4.position.copy(q); d4.scale.setScalar(1); } else d4.scale.setScalar(0); d4.updateMatrix(); dots.setMatrixAt(i, d4.matrix); } dots.instanceMatrix.needsUpdate = true; };
    showDots([]);
    const loc = e => { const r = S.el.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
    knob.addEventListener('pointerdown', e => { if (!S.active || S.paused || flying) return; try { knob.setPointerCapture(e.pointerId); } catch (_) {} pull = { x0: home.x, y0: home.y }; ctx.sfx.tap(); });
    knob.addEventListener('pointermove', e => { if (!pull) return; const p = loc(e), dx = p.x - pull.x0, dy = Math.max(0, p.y - pull.y0); knob.style.left = pull.x0 + dx + 'px'; knob.style.top = pull.y0 + Math.min(dy, 240) + 'px'; const lv = launchV(dx, dy); pLab.textContent = Math.round(lv.power * 100) + '%'; showDots(simulate(lv.vel, false).slice(0, L === 2 ? 8 : DOTS)); pull.dx = dx; pull.dy = dy; });
    const release = () => { if (!pull) return; const { dx = 0, dy = 0 } = pull; pull = null; showDots([]); pLab.textContent = 'Pull'; if (dy < 20) return; flying = { v: launchV(dx, dy).vel }; kit.position.copy(cup); ctx.sfx.thud(); tries++; };
    knob.addEventListener('pointerup', release); knob.addEventListener('pointercancel', release);
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      walker.userData.mx.update(dt);
      const hp = proj(cup); if (!home) home = { x: hp.x, y: hp.y + 30 };
      home.x = hp.x; home.y = hp.y + 30;
      if (!pull) { knob.style.left = home.x + 'px'; knob.style.top = home.y + 'px'; }
      const kx = parseFloat(knob.style.left) || home.x, ky = parseFloat(knob.style.top) || home.y; setBands(kx, ky - 20);
      hint.style.left = home.x - 24 + 'px'; hint.style.top = home.y + 64 + 'px'; hint.style.opacity = pull || flying ? 0 : 0.5 + Math.sin(t * 4) * 0.4; hint.style.transform = `translateY(${Math.sin(t * 4) * 6}px)`;
      mat0.material.opacity = 0.7 + Math.sin(t * 5) * 0.25;
      if (!flying) { if (!pull) kit.position.copy(cup); else kit.position.set(cup.x - (pull.dx || 0) / 400, cup.y, cup.z - Math.min(pull.dy || 0, 240) / 160); }
      if (flying && act) {
        flying.v.y -= 9.8 * dt; flying.v.x += wind * dt; kit.position.addScaledVector(flying.v, dt); kit.rotation.x += dt * 4;
        if (kit.position.y <= gy + 0.25) {
          const onIsle = Math.hypot(kit.position.x, kit.position.z - iz) < 4.4, onMat = Math.hypot(kit.position.x - 0.8, kit.position.z - iz) < 1.9;
          if (onMat) { flying = null; kit.position.y = gy + 0.25; kit.rotation.set(0, 0, 0); ctx.sfx.good(); playClip(walker, 'PickUp'); win(); }
          else if (onIsle && kit.position.y > gy) { flying.v.multiplyScalar(0.2); flying.v.y = 0; kit.position.y = gy + 0.25; ctx.sfx.thud(); setTimeout(() => (flying = null), 500); }
          else if (kit.position.y < gy - 0.6 || !onIsle) { ctx.sfx.splash(); flying = null; }
        }
      }
      if (act) ch.set(`${icon('medical_services', 28, C.hv)}Hit the red mat${wind ? sep + icon(wind > 0 ? 'west' : 'east', 26) + 'Wind' : ''}`);
    });
    return {};
  },
};

// ---------- Race to Rescue: drive the real engine to the call ----------
C2.race = {
  at: (c3, ev) => { const f = roadFrame(c3, ev.x, ev.z); return { x: f.x, z: f.z, yaw: f.yaw, r: 40, drive: true }; },
  run: async (S, ctx) => {
    const L = ctx.level, c3 = S.city, lo = 170 + L * 90, hi = 280 + L * 110;
    const segs = c3.city.segs.filter(s => { const d = Math.hypot(s.x + s.w / 2 - S.spot.x, s.z + s.d / 2 - S.spot.z); return d > lo && d < hi; });
    const g = segs[Math.floor(Math.random() * segs.length)] || c3.city.segs[0], gx = g.x + g.w / 2, gz = g.z + g.d / 2, gl = S.toLocal(gx, gz);
    placeEngine(S, 0, 0, 0);
    const goal = new THREE.Group(); goal.position.copy(gl); goal.rotation.y = g.v ? -S.spot.yaw : Math.PI / 2 - S.spot.yaw; S.scene.add(goal);
    goal.add(at(box(0.5, 6, 0.5, C.red), -6, 3, 0), at(box(0.5, 6, 0.5, C.red), 6, 3, 0), at(box(12.5, 1.2, 0.3, C.hv), 0, 6.2, 0));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 80, 20, 1, true), new THREE.MeshBasicMaterial({ color: C.hv, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 40; goal.add(beam);
    const pad = ring(6); pad.position.y = 0.08; goal.add(pad);
    driveButtons(S);
    const ch = chip(S), win = once(ctx.win);
    S.onTick((dt, t, act) => {
      beam.material.opacity = 0.18 + Math.sin(t * 3) * 0.08; pad.material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
      if (!act) return;
      const e = engLocal(S), dx = gl.x - e.p.x, dz = gl.z - e.p.z, d = Math.hypot(dx, dz), rel = Math.atan2(dx, dz) - e.h;
      ch.set(`<span style="display:inline-flex;transform:rotate(${-rel}rad)">${icon('navigation', 30, C.hv)}</span>${Math.round(d)} m`);
      if (d < 9) win();
    });
    return {};
  },
};
