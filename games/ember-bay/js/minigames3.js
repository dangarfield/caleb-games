// Blaze · Ember Bay minigames, batch 3: pets, road, drone, race, heat, boat, heli, dispatch.
import { THREE, chip, meter, pips, flame, spray, box, cyl, sph, at, mat, icon, C } from './mg-kit.js';
import { loadAnimals, loadPack } from './city-assets.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const TIPS3 = {
  pets: 'Drive slowly so the chicks can keep up.',
  road: 'Nudge each log from the side to roll it off the road.',
  drone: 'Stop right over the fire before you drop.',
  race: 'Go through every arch in order. Boost pads make you faster.',
  heat: 'Switch the heat camera on in short bursts to save battery.',
  boat: 'Slow down next to a crate, then tap the hook.',
  heli: 'Fill the bucket over the lake, then drop it right on the fire.',
  dispatch: 'Fire needs the engine, water needs the boat, stuck needs the ladder.',
};
const once = f => { let d = false; return (...a) => { if (!d) { d = true; f(...a); } }; };
const bar = '<span style="width:1px;height:28px;background:#3b3c3f"></span>';
const hearts = (n, of = 3) => `<span style="display:flex;gap:4px">${Array.from({ length: of }, (_, i) => icon(i < n ? 'close' : 'favorite', 24, i < n ? '#8b8c86' : C.red)).join('')}</span>`;

// Town-style drive buttons: steer bottom-left, go/reverse bottom-right. Arrow keys work too.
function driveControls(S, extra = []) {
  const K = {}, btns = [];
  const mk = (parent, k, ic, w, h, isz) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;border-radius:18px;background:#1c1d1f;color:#f2f1ec;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:pointer`; b.innerHTML = icon(ic, isz); parent.appendChild(b);
    const set = on => { K[k] = on; b.style.background = on ? C.hv : '#1c1d1f'; b.style.color = on ? C.ink : '#f2f1ec'; };
    b.addEventListener('pointerdown', e => { if (!S.active || S.paused) return; e.preventDefault(); set(true); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => set(false))); btns.push(b); return b; };
  const left = S.div('position:absolute;left:28px;bottom:28px;display:flex;gap:14px;pointer-events:auto'), right = S.div('position:absolute;right:28px;bottom:28px;display:flex;flex-direction:column;gap:12px;pointer-events:auto');
  mk(left, 'l', 'arrow_left', 128, 128, 96); mk(left, 'r', 'arrow_right', 128, 128, 96); mk(right, 'f', 'arrow_drop_up', 128, 150, 120); mk(right, 'b', 'arrow_drop_down', 128, 96, 96);
  const km = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'f', ArrowDown: 'b' };
  const kd = e => { if (km[e.code] && S.active) K[km[e.code]] = true; }, ku = e => { if (km[e.code]) K[km[e.code]] = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  S.onDispose = () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  return K;
}
function driveStep(o, st, K, dt, { top = 9, acc = 7, turn = 1.8 } = {}) {
  if (K.f) st.v = Math.min(top * (st.boost > 0 ? 1.6 : 1), st.v + acc * dt); else if (K.b) st.v = Math.max(-3, st.v - acc * 1.4 * dt); else st.v *= Math.pow(0.35, dt);
  st.h += ((K.l ? 1 : 0) - (K.r ? 1 : 0)) * turn * dt * Math.min(1, Math.abs(st.v) / 2.5) * Math.sign(st.v || 1);
  o.rotation.y = st.h; o.position.x += Math.sin(st.h) * st.v * dt; o.position.z += Math.cos(st.h) * st.v * dt;
}
function engineModel() { const g = new THREE.Group(); g.add(at(box(2, 1.2, 4.2, C.red), 0, 0.9, -0.2), at(box(2, 1.4, 1.4, C.red), 0, 1.0, 1.7), at(box(1.8, 0.6, 0.06, '#2c3a44'), 0, 1.35, 2.41), at(box(2.02, 0.16, 5.64, '#f2f1ec'), 0, 0.6, 0.2), at(box(0.5, 0.2, 0.4, '#3b6fe0'), 0.5, 1.8, 1.6), at(box(0.5, 0.2, 0.4, '#3b6fe0'), -0.5, 1.8, 1.6)); for (const [x, z] of [[-1, 1.5], [1, 1.5], [-1, -1.3], [1, -1.3]]) { const w = at(cyl(0.42, 0.42, 0.3, '#222'), x, 0.42, z); w.rotation.z = Math.PI / 2; g.add(w); } return g; }
function chaseCam(S, o, st, dt, back = 11, up = 6) { const fx = Math.sin(st.h), fz = Math.cos(st.h); const want = new THREE.Vector3(o.position.x - fx * back, up, o.position.z - fz * back); S.camera.position.lerp(want, Math.min(1, dt * 4)); S.camera.lookAt(o.position.x + fx * 4, 1, o.position.z + fz * 4); }
const treeAt = (x, z, s = 1) => { const g = new THREE.Group(); g.add(at(cyl(0.2 * s, 0.3 * s, 2 * s, '#7a5a3a', 8), 0, s, 0), at(sph(1.2 * s, '#4f8a3a', 8), 0, 2.6 * s, 0)); g.position.set(x, 0, z); return g; };

export const B3 = {};

// ---------- Pet Parade: collect the chicks, lead them to the hen ----------
B3.pets = async (S, ctx) => {
  const L = ctx.level, n = [4, 5, 6][L], limit = [120, 110, 100][L], scare = [9, 8, 7][L];
  S.scene.add(at(new THREE.Mesh(new THREE.CircleGeometry(7, 24), mat('#4d8fc0')), 12, 0.03, 10)); S.scene.children.at(-1).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = 24 + Math.random() * 12; S.scene.add(treeAt(Math.cos(a) * r, Math.sin(a) * r, 0.9 + Math.random() * 0.5)); }
  const nest = at(new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 32), new THREE.MeshBasicMaterial({ color: C.hv })), -14, 0.05, -12); nest.rotation.x = -Math.PI / 2; S.scene.add(nest);
  let zoo = null; try { zoo = await loadAnimals(); } catch (e) {}
  const clone = (id, fb) => { const src = zoo && zoo.get(id); if (src && src.scene) { const o = SkeletonUtils.clone(src.scene); o.traverse(m => m.isMesh && (m.castShadow = true)); return o; } return fb(); };
  const hen = clone('animal_hen', () => sph(0.3, '#f2f1ec')); hen.scale.setScalar(3); hen.position.set(-14, 0, -12); S.scene.add(hen);
  const eng = engineModel(); eng.position.set(0, 0, -4); S.scene.add(eng); const st = { v: 0, h: 0 };
  const chicks = Array.from({ length: n }, (_, i) => { const o = clone('animal_chick', () => at(sph(0.15, C.hv), 0, 0.15, 0)); o.scale.setScalar(4.5); const a = i / n * 6.28 + 0.4, r = 9 + Math.random() * 7; o.position.set(Math.cos(a) * r + 4, 0, Math.sin(a) * r + 4); o.userData.home = o.position.clone(); S.scene.add(o); return o; });
  const K = driveControls(S), trail = [], line = [];
  let time = limit, fast = 0, homeN = 0;
  S.camera.position.set(0, 8, -16);
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    chicks.forEach((c, i) => { if (!line.includes(c) && !c.userData.home2) c.position.y = Math.abs(Math.sin(t * 5 + i)) * 0.12; });
    hen.rotation.y = Math.sin(t) * 0.5;
    if (!act) { chaseCam(S, eng, st, dt); return; }
    driveStep(eng, st, K, dt, { top: 11 }); chaseCam(S, eng, st, dt);
    trail.unshift(eng.position.clone()); if (trail.length > 600) trail.pop();
    for (const c of chicks) if (!line.includes(c) && !c.userData.home2 && c.position.distanceTo(eng.position) < 4) { line.push(c); ctx.sfx.good(); }
    line.forEach((c, i) => { const p = trail[Math.min(trail.length - 1, 14 + i * 9)]; if (p) { c.position.lerp(new THREE.Vector3(p.x, 0, p.z), Math.min(1, dt * 8)); c.lookAt(p.x, 0, p.z); } });
    fast = Math.abs(st.v) > scare ? fast + dt : 0;
    if (fast > 1 && line.length) { const c = line.pop(); c.position.copy(c.userData.home); ctx.sfx.bad(); fast = 0; }
    if (eng.position.distanceTo(nest.position) < 4 && line.length) { line.splice(0).forEach((c, i) => { c.userData.home2 = true; c.position.set(-14 + Math.cos(i) * 1.6, 0, -12 + Math.sin(i) * 1.6); homeN++; }); ctx.sfx.win(); }
    time -= dt;
    ch.set(`${icon('flutter_dash', 28, C.hv)}${homeN} / ${n} home${bar}${icon('group', 26)}${line.length}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (homeN >= n) win(); else if (time <= 0) fail();
  });
  return {};
};

// ---------- Clear the Road: push the logs off with the engine ----------
B3.road = async (S, ctx) => {
  const L = ctx.level, n = [3, 5, 7][L], limit = [45, 50, 55][L];
  S.scene.add(at(box(10, 0.05, 200, '#4c4e53'), 0, 0.02, 0)); for (let z = -90; z < 90; z += 6) S.scene.add(at(box(0.2, 0.06, 2.5, '#f2f1ec'), 0, 0.04, z));
  for (let z = -80; z < 80; z += 7) { S.scene.add(treeAt(-9 - Math.random() * 4, z, 1 + Math.random() * 0.4), treeAt(9 + Math.random() * 4, z + 3, 1 + Math.random() * 0.4)); }
  const logs = Array.from({ length: n }, (_, i) => { const g = new THREE.Group(), l = at(cyl(0.45, 0.5, 2.6, '#7a5a3a', 10), 0, 0.5, 0); l.rotation.z = Math.PI / 2; g.add(l, at(sph(0.5, '#4f8a3a', 6), 1.4, 0.7, 0)); g.position.set((Math.random() - 0.5) * 5, 0, 10 + i * 7); g.rotation.y = (Math.random() - 0.5) * 0.6; g.userData.v = new THREE.Vector3(); S.scene.add(g); return g; });
  const eng = engineModel(); S.scene.add(eng); const st = { v: 0, h: 0 }; const K = driveControls(S);
  let time = limit;
  S.camera.position.set(0, 7, -12);
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    if (!act) { chaseCam(S, eng, st, dt); return; }
    driveStep(eng, st, K, dt, { top: 8 }); chaseCam(S, eng, st, dt);
    eng.position.x = Math.max(-7, Math.min(7, eng.position.x));
    const fx = Math.sin(st.h), fz = Math.cos(st.h);
    for (const g of logs) {
      const dx = g.position.x - eng.position.x, dz = g.position.z - eng.position.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
      if (lz > 0 && lz < 3.6 && Math.abs(lx) < 1.9 && st.v > 0.3) { const push = st.v * 1.05; g.userData.v.set(fx * push + Math.sign(lx || 1) * fz * 1.2, 0, fz * push - Math.sign(lx || 1) * fx * 1.2); if (Math.abs(st.v) > 1) ctx.sfx.thud && (g.userData.snd = (g.userData.snd || 0) + dt); }
      g.position.addScaledVector(g.userData.v, dt); g.userData.v.multiplyScalar(Math.pow(0.12, dt)); g.children[0].rotation.x += g.userData.v.length() * dt;
    }
    const off = logs.filter(g => Math.abs(g.position.x) > 5.4).length;
    time -= dt;
    ch.set(`${icon('forest', 28, C.hv)}<span style="display:flex;gap:6px">${pips(off, n)}</span>${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (off >= n) win(); else if (time <= 0) fail();
  });
  return {};
};

// Rooftops seen from above, for drone + heli.
function rooftops(S) { const roofs = []; for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const h = 3 + Math.random() * 5, b = at(box(6, h, 6, ['#d9cbb3', '#c9b8a0', '#e3d9c8', '#b9a992'][(i + j + 4) % 4]), i * 9, h / 2, j * 9); S.scene.add(b); roofs.push({ x: i * 9, z: j * 9, y: h }); } return roofs; }
function flyer(kind) { const g = new THREE.Group(); if (kind === 'drone') { g.add(at(box(0.9, 0.25, 0.9, '#f2f1ec'), 0, 0, 0)); for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) g.add(at(cyl(0.45, 0.45, 0.04, '#8a8f94', 12), x, 0.18, z)); } else { g.add(at(box(1.6, 1.4, 3.4, C.red), 0, 0, 0), at(box(0.4, 0.4, 3, C.red), 0, 0.3, -3), at(box(7, 0.06, 0.4, '#555'), 0, 0.9, 0)); } return g; }
function flyBy(S, o, target, dt, sp) { const d = target.clone().sub(o.position); d.y = 0; const m = sp * dt; if (d.length() > m) d.setLength(m); o.position.add(d); o.rotation.z = -d.x / dt / sp * 0.2; o.rotation.x = d.z / dt / sp * 0.2; }

// ---------- Drone Drop: fly over the fire and drop water ----------
B3.drone = async (S, ctx) => {
  const L = ctx.level, n = [3, 4, 5][L], balloons = [7, 8, 9][L];
  S.camera.position.set(0, 34, 16); S.camera.lookAt(0, 0, 1);
  const roofs = rooftops(S).sort(() => Math.random() - 0.5), fires = roofs.slice(0, n).map((r, i) => { const f = flame(1.6, i < 2); f.position.set(r.x + (Math.random() - 0.5) * 3, r.y, r.z + (Math.random() - 0.5) * 3); S.scene.add(f); return f; });
  const dr = flyer('drone'); dr.position.set(0, 12, 12); S.scene.add(dr);
  const shadow = at(new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3 })), 0, 0.2, 0); shadow.rotation.x = -Math.PI / 2; S.scene.add(shadow);
  const want = dr.position.clone(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -12);
  S.on('down', p => { const v = S.rayPlane(p.ndc, plane); if (v) want.copy(v); }); S.on('move', p => { if (p.pressed) { const v = S.rayPlane(p.ndc, plane); if (v) want.copy(v); } });
  const drops = []; let left = balloons;
  const btn = S.div(`position:absolute;right:40px;bottom:40px;width:150px;height:150px;border-radius:22px;background:${C.blue};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900;font-size:20px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('water_drop', 70) + 'Drop');
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); if (!S.active || S.paused || left <= 0) return; left--; const b = at(sph(0.45, '#8fd0f5'), dr.position.x, dr.position.y - 0.4, dr.position.z); S.scene.add(b); drops.push({ b, vy: 0 }); ctx.sfx.tap(); });
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    fires.forEach(f => f.userData.tick(t)); dr.children.slice(1).forEach(r => (r.rotation.y += dt * 30));
    const roofY = (x, z) => { const r = roofs.find(r => Math.abs(r.x - x) < 3 && Math.abs(r.z - z) < 3); return r ? r.y : 0; };
    shadow.position.set(dr.position.x, roofY(dr.position.x, dr.position.z) + 0.05, dr.position.z);
    if (!act) { dr.position.y = 12 + Math.sin(t * 2) * 0.3; return; }
    flyBy(S, dr, want, dt, 9); dr.position.y = 12 + Math.sin(t * 2) * 0.3;
    for (const d of drops) { if (d.done) continue; d.vy -= 20 * dt; d.b.position.y += d.vy * dt; const gy = roofY(d.b.position.x, d.b.position.z);
      if (d.b.position.y <= gy + 0.3) { d.done = true; d.b.visible = false; ctx.sfx.splash(); for (const f of fires) if (f.userData.hp > 0 && Math.hypot(f.position.x - d.b.position.x, f.position.z - d.b.position.z) < 2.2) { f.userData.hp = 0; ctx.sfx.hiss(); } } }
    const out = fires.filter(f => f.userData.hp <= 0).length;
    ch.set(`${icon('local_fire_department', 28, '#ff7a1a')}${n - out} left${bar}${icon('water_drop', 26, '#8fd0f5')}${left}`);
    if (out >= n) win(); else if (left <= 0 && drops.every(d => d.done)) fail();
  });
  return {};
};

// ---------- Race to Rescue: through every arch before the clock runs out ----------
B3.race = async (S, ctx) => {
  const L = ctx.level, N = [6, 8, 10][L], limit = [50, 55, 58][L];
  const pts = []; let x = 0, z = 0, h = 0; for (let i = 0; i < N; i++) { h += (Math.random() - 0.5) * 1.3; x += Math.sin(h) * 26; z += Math.cos(h) * 26; pts.push({ x, z, h }); }
  const arches = pts.map((p, i) => { const g = new THREE.Group(), col = i === N - 1 ? C.red : C.hv; g.add(at(box(0.5, 4, 0.5, col), -4, 2, 0), at(box(0.5, 4, 0.5, col), 4, 2, 0), at(box(8.5, 0.8, 0.3, col), 0, 4.2, 0)); g.position.set(p.x, 0, p.z); g.rotation.y = p.h; S.scene.add(g); return g; });
  pts.forEach((p, i) => { if (i % 2 === 1) { const pad = at(box(3, 0.08, 4, '#38c8f0'), 0, 0.05, 0); const q = pts[i - 1]; pad.position.set((p.x + q.x) / 2, 0.05, (p.z + q.z) / 2); pad.rotation.y = p.h; pad.userData.boost = true; S.scene.add(pad); p.pad = pad; } });
  for (let i = 0; i < 60; i++) S.scene.add(treeAt((Math.random() - 0.5) * 320, (Math.random() - 0.1) * 300, 1));
  const eng = engineModel(); S.scene.add(eng); const st = { v: 0, h: 0, boost: 0 }; const K = driveControls(S);
  let next = 0, time = limit;
  S.camera.position.set(0, 7, -12);
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    arches.forEach((a, i) => (a.visible = i >= next));
    if (!act) { chaseCam(S, eng, st, dt, 12, 7); return; }
    st.boost -= dt; driveStep(eng, st, K, dt, { top: 13, acc: 8 }); chaseCam(S, eng, st, dt, 12, 7);
    pts.forEach(p => { if (p.pad && Math.hypot(p.pad.position.x - eng.position.x, p.pad.position.z - eng.position.z) < 2.5 && st.boost <= 0) { st.boost = 1.5; ctx.sfx.good(); } });
    const p = pts[next]; if (p && Math.hypot(p.x - eng.position.x, p.z - eng.position.z) < 5) { next++; ctx.sfx.tap(); }
    time -= dt;
    ch.set(`${icon('flag', 28, C.hv)}${next} / ${N}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s${st.boost > 0 ? bar + icon('bolt', 26, '#38c8f0') : ''}`);
    if (next >= N) win(); else if (time <= 0) fail();
  });
  return {};
};

// ---------- Heat Seeker: thermal camera through the walls ----------
B3.heat = async (S, ctx) => {
  const L = ctx.level, batt = [20, 15, 12][L];
  const id = ['room_kitchen', 'room_office', 'room_dining'][L], P = await loadPack('interiors', '../_shared/assets/', [id]), r = P.get(id).clone(true); S.scene.add(r);
  const bb = new THREE.Box3().setFromObject(r), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  S.camera.position.set(c.x + sz.x * 0.2, 7.5, c.z + sz.z * 1.05); S.camera.lookAt(c.x, 0.6, c.z);
  S.scene.fog = new THREE.FogExp2('#7a7b78', 0.12); S.scene.background = new THREE.Color('#6d6e6b');
  const person = new THREE.Group(), hot = new THREE.MeshBasicMaterial({ color: '#ff6a2a', depthTest: false, transparent: true, opacity: 0 });
  person.add(at(cyl(0.2, 0.22, 0.8, hot, 10), 0, 0.4, 0), at(sph(0.2, hot), 0, 0.95, 0)); person.renderOrder = 10;
  person.position.set(bb.min.x + sz.x * (0.15 + Math.random() * 0.7), 0, bb.min.z + sz.z * (0.15 + Math.random() * 0.4)); S.scene.add(person);
  const orig = new Map(), cold = new THREE.MeshBasicMaterial({ color: '#1b2a6b' });
  r.traverse(o => o.isMesh && orig.set(o, o.material));
  let on = false, power = batt, found = false;
  const tog = S.div(`position:absolute;right:40px;bottom:40px;width:150px;height:150px;border-radius:22px;background:#1c1d1f;color:#f2f1ec;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900;font-size:18px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('thermostat', 70) + 'Heat cam');
  const setOn = v => { on = v && power > 0; tog.style.background = on ? C.hv : '#1c1d1f'; tog.style.color = on ? C.ink : '#f2f1ec'; r.traverse(o => o.isMesh && (o.material = on ? cold : orig.get(o))); S.scene.fog.density = on ? 0 : 0.12; S.scene.background.set(on ? '#0a0f2a' : '#6d6e6b'); };
  tog.addEventListener('pointerdown', e => { e.stopPropagation(); if (S.active && !S.paused) { setOn(!on); ctx.sfx.tap(); } });
  S.on('down', p => { const h = S.pick(p.ndc, [person]); if (h && (on || hot.opacity > 0.4)) { found = true; ctx.sfx.good(); } else { const v = S.rayPlane(p.ndc, new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5)); if (v && v.distanceTo(person.position) < 0.9 && on) { found = true; ctx.sfx.good(); } } });
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    hot.opacity = on ? 0.75 + Math.sin(t * 6) * 0.2 : 0;
    if (!act) return;
    if (on) { power -= dt; if (power <= 0) setOn(false); } else power = Math.min(batt, power + dt * 0.6);
    ch.set(`${icon('person_search', 28, C.hv)}${found ? 'Found!' : 'Find them'}${bar}${icon('battery_charging_full', 26)}${meter(power / batt, C.hv, 120)}`);
    if (found) win();
  });
  return {};
};

// ---------- River Rescue: steer the boat, hook the crates ----------
B3.boat = async (S, ctx) => {
  const L = ctx.level, n = [4, 5, 6][L], limit = [110, 100, 90][L];
  const water = at(box(60, 0.4, 400, new THREE.MeshLambertMaterial({ color: '#3f86b8' })), 0, 0.1, 0); S.scene.add(water, at(box(12, 1.2, 400, '#8fb870'), -36, 0.6, 0), at(box(12, 1.2, 400, '#8fb870'), 36, 0.6, 0));
  for (let z = -150; z < 150; z += 12) S.scene.add(treeAt(-34, z, 1.1), treeAt(34, z + 6, 1.1));
  const boat = new THREE.Group(); boat.add(at(box(2, 0.7, 4.4, C.red), 0, 0.55, 0), at(box(1.6, 0.9, 1.2, '#f2f1ec'), 0, 1.3, -0.3), at(box(2.05, 0.15, 4.45, C.hv), 0, 0.85, 0)); S.scene.add(boat);
  const crates = Array.from({ length: n }, (_, i) => { const c = at(box(1.1, 0.8, 1.1, '#c49a5a'), (Math.random() - 0.5) * 40, 0.5, 18 + i * 22 + Math.random() * 8); S.scene.add(c); return c; });
  const rocks = Array.from({ length: 4 + L * 3 }, () => { const r = at(sph(1.1, '#8a8f94', 7), (Math.random() - 0.5) * 44, 0.2, 10 + Math.random() * (n * 22)); S.scene.add(r); return r; });
  const st = { v: 0, h: 0 }; const K = driveControls(S);
  const hook = S.div(`position:absolute;left:50%;bottom:40px;transform:translateX(-50%);height:96px;padding:0 34px 0 20px;border-radius:14px;background:#48494c;color:#8b8c86;display:flex;align-items:center;gap:10px;font-weight:900;font-stretch:125%;font-size:28px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('anchor', 44) + 'Hook');
  let got = 0, time = limit, bumps = 0, bumpT = 0;
  const nearC = () => crates.find(c => c.visible && c.position.distanceTo(boat.position) < 3.6);
  hook.addEventListener('pointerdown', () => { if (!S.active || S.paused) return; const c = nearC(); if (c && Math.abs(st.v) < 4) { c.visible = false; got++; ctx.sfx.good(); } else ctx.sfx.bad(); });
  S.camera.position.set(0, 8, -12);
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    crates.forEach((c, i) => { c.position.y = 0.45 + Math.sin(t * 2 + i) * 0.12; c.rotation.z = Math.sin(t * 1.5 + i) * 0.1; });
    boat.position.y = Math.sin(t * 2.4) * 0.06; boat.rotation.z = Math.sin(t * 1.7) * 0.03;
    if (!act) { chaseCam(S, boat, st, dt, 12, 7); return; }
    driveStep(boat, st, K, dt, { top: 10, acc: 5, turn: 1.4 }); boat.position.x = Math.max(-27, Math.min(27, boat.position.x)); chaseCam(S, boat, st, dt, 12, 7);
    bumpT -= dt; for (const r of rocks) if (r.position.distanceTo(new THREE.Vector3(boat.position.x, 0.2, boat.position.z)) < 2.4 && bumpT <= 0) { bumps++; bumpT = 1.2; st.v = -st.v * 0.4; ctx.sfx.thud(); }
    const c = nearC(), ok = c && Math.abs(st.v) < 4; hook.style.background = ok ? C.hv : '#48494c'; hook.style.color = ok ? C.ink : '#8b8c86';
    time -= dt;
    ch.set(`${icon('inventory_2', 28, C.hv)}${got} / ${n}${bar}${hearts(bumps)}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (got >= n) win(); else if (time <= 0 || bumps >= 3) fail();
  });
  return {};
};

// ---------- Heli Bucket: fill over the lake, drop on the fire ----------
B3.heli = async (S, ctx) => {
  const L = ctx.level, n = [1, 2, 3][L], hp = [1, 2, 2][L], limit = [120, 120, 110][L];
  S.camera.position.set(0, 42, 24); S.camera.lookAt(0, 0, 2);
  const lake = at(new THREE.Mesh(new THREE.CircleGeometry(8, 28), mat('#3f86b8')), -20, 0.04, 6); lake.rotation.x = -Math.PI / 2; S.scene.add(lake);
  for (let i = 0; i < 40; i++) S.scene.add(treeAt(8 + Math.random() * 30, -16 + Math.random() * 34, 1 + Math.random() * 0.5));
  const fires = Array.from({ length: n }, (_, i) => { const f = flame(2.4, true); f.position.set(14 + i * 8, 0, -4 + (i % 2) * 10); f.userData.hp = 1; f.userData.max = hp; f.userData.hits = 0; S.scene.add(f); return f; });
  const heli = flyer('heli'); heli.position.set(-6, 14, 12); S.scene.add(heli);
  const bucket = at(cyl(0.6, 0.45, 0.9, C.red, 12), 0, 0, 0), rope = at(cyl(0.03, 0.03, 5, '#333', 4), 0, 0, 0); S.scene.add(bucket, rope);
  const want = heli.position.clone(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -14);
  S.on('down', p => { const v = S.rayPlane(p.ndc, plane); if (v) want.copy(v); }); S.on('move', p => { if (p.pressed) { const v = S.rayPlane(p.ndc, plane); if (v) want.copy(v); } });
  let full = 0, time = limit, dropT = 0;
  const btn = S.div(`position:absolute;right:40px;bottom:40px;width:150px;height:150px;border-radius:22px;background:#48494c;color:#8b8c86;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900;font-size:20px;text-transform:uppercase;pointer-events:auto;cursor:pointer`, icon('water_drop', 70) + 'Drop');
  const sp = spray(S, { from: new THREE.Vector3(), rate: 90, arc: 0 });
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); if (!S.active || S.paused || full < 1) return; full = 0; dropT = 0.8; sp.from.copy(bucket.position); sp.target.set(bucket.position.x, 0, bucket.position.z); sp.on = true; ctx.sfx.splash();
    for (const f of fires) if (f.userData.hp > 0 && Math.hypot(f.position.x - bucket.position.x, f.position.z - bucket.position.z) < 3.5) { f.userData.hits++; f.userData.hp = 1 - f.userData.hits / f.userData.max; if (f.userData.hp <= 0) ctx.sfx.hiss(); } });
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    fires.forEach(f => f.userData.tick(t)); heli.children[2].rotation.y += dt * 25;
    bucket.position.lerp(new THREE.Vector3(heli.position.x, heli.position.y - 5.5, heli.position.z), Math.min(1, dt * 3)); rope.position.copy(heli.position).add(bucket.position).multiplyScalar(0.5); rope.lookAt(bucket.position); rope.rotateX(Math.PI / 2);
    dropT -= dt; if (dropT <= 0) sp.on = false; else { sp.from.copy(bucket.position); sp.target.set(bucket.position.x, 0, bucket.position.z); }
    if (!act) return;
    flyBy(S, heli, want, dt, 8);
    if (lake.position.distanceTo(new THREE.Vector3(bucket.position.x, 0.04, bucket.position.z)) < 7 && full < 1) { full = Math.min(1, full + dt / 1.5); if (full >= 1) ctx.sfx.good(); }
    btn.style.background = full >= 1 ? C.blue : '#48494c'; btn.style.color = full >= 1 ? '#fff' : '#8b8c86';
    const left = fires.filter(f => f.userData.hp > 0).length;
    time -= dt;
    ch.set(`${icon('local_fire_department', 28, '#ff7a1a')}${left} left${bar}${icon('water_drop', 26, '#8fd0f5')}${meter(full, C.blue, 110)}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (!left) win(); else if (time <= 0) fail();
  });
  return {};
};

// ---------- Dispatch: drag the right vehicle onto each call ----------
B3.dispatch = async (S, ctx) => {
  const L = ctx.level, need = [6, 8, 10][L], every = [3.2, 2.6, 2.1][L];
  S.camera.position.set(0, 12, 6); S.camera.lookAt(0, 0, 0);
  S.scene.add(at(box(22, 0.6, 12, '#5a3d2a'), 0, 0.3, 0));
  const TYPES = [{ need: 'engine', icon: 'local_fire_department', col: C.red }, { need: 'boat', icon: 'water', col: C.blue }, { need: 'ladder', icon: 'pets', col: C.hv }];
  const VEH = [{ id: 'engine', icon: 'fire_truck', col: C.red }, { id: 'ladder', icon: 'stairs', col: C.hv }, { id: 'boat', icon: 'directions_boat', col: C.blue }];
  const bw = 900, bh = 470, board = S.div(`position:absolute;left:50%;top:104px;transform:translateX(-50%);width:${bw}px;height:${bh}px;border-radius:16px;background:#e4e2da;border:3px solid #1c1d1f;overflow:hidden;pointer-events:auto;touch-action:none`);
  board.innerHTML = `<div style="position:absolute;left:0;right:0;top:58%;height:44px;background:#8fc3de"></div><div style="position:absolute;left:30%;top:0;bottom:0;width:14px;background:#fff"></div><div style="position:absolute;left:66%;top:0;bottom:0;width:14px;background:#fff"></div><div style="position:absolute;left:0;right:0;top:28%;height:14px;background:#fff"></div><div style="position:absolute;left:0;right:0;top:84%;height:14px;background:#fff"></div>`;
  const dock = S.div('position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:16px;pointer-events:auto');
  VEH.forEach(v => { const d = document.createElement('div'); d.style.cssText = `width:104px;height:84px;border-radius:14px;background:#1c1d1f;color:${v.col};display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none`; d.innerHTML = icon(v.icon, 54); d.addEventListener('pointerdown', e => startDrag(e, v)); dock.appendChild(d); });
  const calls = []; let sent = 0, wrong = 0, spawnT = 0.5, drag = null;
  const spawn = () => { const t = TYPES[Math.floor(Math.random() * 3)], x = 60 + Math.random() * (bw - 120), y = 50 + Math.random() * (bh - 100); const el = document.createElement('div'); el.style.cssText = `position:absolute;left:${x - 34}px;top:${y - 34}px;width:68px;height:68px;border-radius:12px;background:${t.col};color:${t.col === C.hv ? C.ink : '#fff'};border:3px solid #1c1d1f;display:flex;align-items:center;justify-content:center;box-sizing:border-box`; el.innerHTML = icon(t.icon, 40); board.appendChild(el); calls.push({ t, x, y, el }); ctx.sfx.tap(); };
  function startDrag(e, v) { if (!S.active || S.paused) return; e.preventDefault(); const g = document.createElement('div'); g.style.cssText = `position:fixed;left:0;top:0;width:80px;height:66px;border-radius:12px;background:#1c1d1f;color:${v.col};display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:99;transform:translate(-50%,-50%)`; g.innerHTML = icon(v.icon, 44); document.body.appendChild(g); drag = { v, g }; move(e); addEventListener('pointermove', move); addEventListener('pointerup', end, { once: true }); }
  function move(e) { if (drag) { drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; } }
  function end(e) {
    removeEventListener('pointermove', move); if (!drag) return; drag.g.remove();
    const r = board.getBoundingClientRect(), k = bw / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    const c = calls.find(c => Math.hypot(c.x - x, c.y - y) < 60);
    if (c) { if (c.t.need === drag.v.id) { sent++; ctx.sfx.good(); c.el.remove(); calls.splice(calls.indexOf(c), 1); } else { wrong++; ctx.sfx.bad(); c.el.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 250 }); } }
    drag = null;
  }
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    calls.forEach(c => (c.el.style.opacity = 0.75 + Math.sin(t * 8) * 0.25));
    if (!act) return;
    spawnT -= dt; if (spawnT <= 0 && calls.length < 4 && sent + calls.length < need) { spawn(); spawnT = every; }
    ch.set(`${icon('map', 28, C.hv)}<span style="display:flex;gap:6px">${pips(sent, need)}</span>${bar}${hearts(wrong)}`);
    if (sent >= need) win(); else if (wrong >= 3) fail();
  });
  return {};
};
