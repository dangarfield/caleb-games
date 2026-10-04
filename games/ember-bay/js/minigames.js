// Blaze · Ember Bay minigames. createMinigame(id, host, ctx) builds the scene idle (for the intro preview), begin() starts play.
// ctx = { level: 0..2, win(), fail(tip), sfx }
import { THREE, stage, cityStage, chip, meter, pips, flame, spray, hydrant, box, cyl, sph, at, mat, icon, C, W, H } from './mg-kit.js';
import { C1 } from './mgc1.js';
import { C2 } from './mgc2.js';
const CB = { ...C1, ...C2 };
import { loadAnimals } from './city-assets.js';
import { B2, TIPS2 } from './minigames2.js';
import { B3, TIPS3 } from './minigames3.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const TIPS = {
  hose: 'Aim at the bottom of the flames and keep your finger down.',
  catch: 'Watch for the glowing window, then slide the cushion under it.',
  hydrant: 'Tap when the white line is inside the green part.',
  thaw: 'Tap really fast. Two fingers help!',
  check: 'Watch the whole pattern before you start tapping.',
  power: 'Drag each wire to the one that is the same colour.',
};
Object.assign(TIPS, TIPS2, TIPS3);
export const BUILT = ['hose', 'catch', 'hydrant', 'thaw', 'check', 'power', 'cat', 'drop', 'torch', 'line', 'smoke', 'hazard', 'sand', 'foam', 'pets', 'road', 'drone', 'race', 'heat', 'boat', 'heli', 'dispatch'];

const B = {};
const INDOOR = { torch: 1, smoke: 1, hazard: 1, heat: 1 };
const once = f => { let done = false; return (...a) => { if (!done) { done = true; f(...a); } }; };

// ---------- Hose Down ----------
B.hose = async (S, ctx) => {
  const L = ctx.level;
  S.camera.position.set(0, 3, 9.5); S.camera.lookAt(0, 1.1, 0);
  S.scene.add(at(box(40, 7, 1, '#e4dccb'), 0, 3.5, -5), at(box(40, 0.02, 7, '#5d6066'), 0, 0.01, -0.5));
  for (let i = -3; i <= 3; i++) S.scene.add(at(box(1.6, 1.8, 0.1, '#2c3a44'), i * 5, 4, -4.45));
  const T = new THREE.Group(); S.scene.add(T); let spots;
  if (L === 0) { T.add(at(cyl(0.65, 0.55, 1.3, '#3f6b3a'), 0, 0.65, 0), at(box(1.4, 0.12, 1.4, '#355a31'), 0, 1.36, 0), at(cyl(0.55, 0.45, 1.1, '#3b5f8a'), 1.8, 0.55, -0.4), at(box(1.6, 0.6, 1.2, '#8a6b4a'), -2, 0.3, 0.3)); spots = [[0, 1.4, 0, 1.1], [-0.4, 1.35, 0.3, 0.8], [0.45, 1.35, -0.2, 0.8]]; }
  else if (L === 1) { T.add(at(box(4.2, 0.9, 1.9, '#2f88c4'), 0, 0.75, 0), at(box(2.3, 0.8, 1.7, '#2a79b0'), -0.2, 1.6, 0));
    for (const [x, z] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]]) { const w = at(cyl(0.38, 0.38, 0.3, '#222'), x, 0.38, z); w.rotation.x = Math.PI / 2; T.add(w); }
    spots = [[1.5, 1.2, 0.3, 1], [-0.3, 2.0, 0, 1], [0.6, 1.25, 0.9, 0.8], [-1.6, 1.2, 0.5, 0.8], [0.2, 1.2, -0.7, 0.8]]; }
  else { T.add(at(sph(0.6, '#2c2d30'), 0, 1.0, 0), at(cyl(0.05, 0.05, 1, '#555'), 0.3, 0.5, 0.3), at(cyl(0.05, 0.05, 1, '#555'), -0.3, 0.5, 0.3), at(cyl(0.05, 0.05, 1, '#555'), 0, 0.5, -0.4), at(box(2.4, 2, 1.8, '#9b7b55'), -3, 1, -1.2), at(box(8, 1.2, 0.12, '#b08a5e'), 0, 0.6, -2.5));
    spots = [[0, 1.4, 0, 1], [-3, 2.1, -1, 1.1], [-2.2, 1.3, -0.3, 0.9], [-1.5, 1.1, -2.4, 0.8], [1.4, 1.1, -2.4, 0.8], [2.6, 1.1, -2.4, 0.8], [-3.8, 1.1, -0.3, 0.8]]; }
  const flames = spots.map(([x, y, z, s], i) => { const f = flame(s, i < 3); f.position.set(x, y, z); S.scene.add(f); f.userData.hitT = 0; return f; });
  const sp = spray(S, { from: new THREE.Vector3(0.9, 0.8, 8) });
  const targets = [T, ...S.scene.children.filter(o => o.isMesh)];
  const aim = p => { const h = S.pick(p.ndc, targets); sp.target.copy(h ? h.point : S.rayPlane(p.ndc, new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)) || sp.target); };
  S.on('down', p => { aim(p); sp.on = true; }); S.on('move', p => { if (sp.on) aim(p); }); S.on('up', () => (sp.on = false));
  let now = 0;
  sp.onHit = p => { for (const f of flames) { if (f.userData.hp <= 0) continue; const c = f.position.clone(); c.y += 0.5 * f.userData.size; if (c.distanceTo(p) < 0.85 * f.userData.size + 0.35) { f.userData.hp -= 0.05; f.userData.hitT = now; if (f.userData.hp <= 0) ctx.sfx.hiss(); } } };
  const cap = [30, 30, 32][L]; let water = 1, splashT = 0;
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    now = t; flames.forEach(f => f.userData.tick(t));
    if (!act) return;
    if (sp.on) { water -= dt / cap; if ((splashT -= dt) < 0) { ctx.sfx.splash(); splashT = 0.45; } }
    if (L === 2) flames.forEach(f => { if (f.userData.hp > 0 && t - f.userData.hitT > 1.5) f.userData.hp = Math.min(1, f.userData.hp + dt * 0.06); });
    const left = flames.filter(f => f.userData.hp > 0).length;
    ch.set(`${icon('local_fire_department', 28, '#ff7a1a')}${left} left<span style="width:1px;height:28px;background:#3b3c3f"></span>${icon('water_drop', 26, '#2f88c4')}${meter(water)}`);
    if (!left) { sp.on = false; win(); }
    else if (water <= 0) { sp.on = false; fail(); }
  });
  return {};
};

// ---------- Catch! ----------
B.catch = async (S, ctx) => {
  const L = ctx.level;
  S.camera.position.set(0, 5.2, 17); S.camera.lookAt(0, 4.6, 0);
  S.scene.add(at(box(16, 13, 4, '#e2d6c2'), 0, 6.5, -3.5), at(box(16.4, 0.4, 4.4, '#b9ab94'), 0, 13.1, -3.5), at(box(40, 0.02, 8, '#9a9ca0'), 0, 0.01, 1));
  const WX = [-4.8, -1.6, 1.6, 4.8], WY = [4.2, 7.4, 10.6], wins = [];
  for (const y of WY) for (const x of WX) { const m = at(box(1.9, 2, 0.12, new THREE.MeshLambertMaterial({ color: '#2c3a44', emissive: '#000' })), x, y, -1.45); S.scene.add(m); wins.push(m); }
  const puffs = Array.from({ length: 8 }, (_, i) => { const p = at(sph(0.8 + Math.random() * 0.6, new THREE.MeshLambertMaterial({ color: '#8a8b88', transparent: true, opacity: 0.55 })), -6 + i * 1.7, 13.5, -3); p.castShadow = false; S.scene.add(p); return p; });
  const cush = new THREE.Group(); cush.add(at(box(3.4, 0.9, 2.4, C.hv), 0, 0.45, 0), at(box(3.44, 0.2, 2.44, C.red), 0, 0.8, 0)); cush.position.z = 1.2; S.scene.add(cush);
  let pigSrc = null; try { const z = await loadAnimals(); pigSrc = z.get('animal_pig'); } catch (e) {}
  const makePig = () => {
    if (pigSrc && pigSrc.scene) { const o = SkeletonUtils.clone(pigSrc.scene); o.traverse(m => m.isMesh && (m.castShadow = true)); return o; }
    const g = new THREE.Group(), pk = '#f0a8b0'; g.add(at(sph(0.55, pk), 0, 0.55, 0), at(sph(0.3, pk), 0, 0.7, 0.55), at(cyl(0.12, 0.12, 0.08, '#e58c98'), 0, 0.68, 0.85)); g.children[2].rotation.x = Math.PI / 2; return g;
  };
  let tx = 0; const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
  const move = p => { const v = S.rayPlane(p.ndc, plane); if (v) tx = Math.max(-6.5, Math.min(6.5, v.x)); };
  S.on('down', move); S.on('move', move);
  const need = 8, maxMiss = 3, every = [1.9, 1.4, 1.05][L], warn = [1, 0.75, 0.6][L], grav = [4.6, 5.4, 6.2][L];
  let caught = 0, miss = 0, spawnT = 1, pigs = [], started = 0;
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    puffs.forEach((p, i) => { p.position.y = 13.5 + ((t * 0.6 + i * 0.7) % 4); p.material.opacity = 0.55 * (1 - ((t * 0.6 + i * 0.7) % 4) / 4); });
    cush.position.x += (tx - cush.position.x) * Math.min(1, dt * 14);
    if (!act) return;
    if (caught + pigs.filter(p => !p.done).length < need && (spawnT -= dt) <= 0 && pigs.filter(p => !p.done).length < (L ? 2 : 1)) {
      spawnT = every * (0.8 + Math.random() * 0.4); const w = wins[Math.floor(Math.random() * wins.length)];
      pigs.push({ w, warn, o: null, vy: 0, done: false }); started++;
    }
    for (const p of pigs) {
      if (p.done && p.o) { p.o.position.x += dt * 3 * p.dir; p.fade -= dt; if (p.fade < 0) { S.scene.remove(p.o); p.o = null; } continue; }
      if (p.done) continue;
      if (p.warn > 0) { p.warn -= dt; p.w.material.emissive.set(Math.sin(t * 20) > 0 ? '#ff9a3c' : '#6a2a00'); if (p.warn <= 0) { p.w.material.emissive.set('#000'); p.o = makePig(); p.o.scale.setScalar(1.3); p.o.position.set(p.w.position.x, p.w.position.y - 0.6, -0.6); p.o.rotation.y = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); S.scene.add(p.o); } continue; }
      p.vy -= grav * dt; p.o.position.y += p.vy * dt; p.o.rotation.z = Math.sin(t * 8) * 0.35;
      if (p.o.position.y <= 1.0 && !p.judged) {
        p.judged = true;
        if (Math.abs(p.o.position.x - cush.position.x) < 1.9) { caught++; ctx.sfx.good(); p.vy = 5.5; p.bounced = true; }
        else { miss++; ctx.sfx.thud(); p.vy = 0; p.o.position.y = 0.1; p.done = true; p.dir = Math.sign(p.o.position.x) || 1; p.fade = 1.2; }
      }
      if (p.bounced && p.vy < 0 && p.o.position.y <= 1.0) { p.done = true; p.o.rotation.z = 0; p.o.position.y = 0.1; p.dir = cush.position.x > 0 ? -1 : 1; p.fade = 1.5; }
    }
    ch.set(`${icon('sports_handball', 28, C.hv)}${caught} / ${need}<span style="width:1px;height:28px;background:#3b3c3f"></span><span style="display:flex;gap:4px">${Array.from({ length: maxMiss }, (_, i) => icon(i < miss ? 'close' : 'favorite', 24, i < miss ? '#8b8c86' : C.red)).join('')}</span>`);
    if (caught >= need && pigs.every(p => p.done)) win();
    if (miss >= maxMiss) fail();
  });
  return {};
};

// ---------- Hydrant Hookup ----------
B.hydrant = async (S, ctx) => {
  const L = ctx.level;
  S.camera.position.set(0.5, 1.25, 3.1); S.camera.lookAt(0.2, 0.7, 0);
  S.scene.add(at(box(10, 0.1, 4, '#b7b4ab'), 0, 0.05, 0), at(box(10, 0.18, 0.3, '#8f8c84'), 0, 0.09, 2.1), at(box(10, 4, 0.2, '#d8cdb8'), 0, 2, -1.5));
  const hy = hydrant(); S.scene.add(hy);
  const coup = new THREE.Group(); coup.position.set(0.52, 0.62, 0); coup.rotation.z = Math.PI / 2;
  coup.add(cyl(0.15, 0.15, 0.12, '#c8a24a'), at(box(0.36, 0.06, 0.06, '#b08c38'), 0, 0.02, 0)); S.scene.add(coup);
  const hose = at(cyl(0.1, 0.1, 3, '#b9322b'), 2.1, 0.62, 0); hose.rotation.z = Math.PI / 2; S.scene.add(hose);
  const bar = S.div('position:absolute;left:50%;bottom:56px;transform:translateX(-50%);width:640px;height:56px;border-radius:12px;background:#1c1d1f;padding:8px;box-sizing:border-box');
  bar.innerHTML = '<div style="position:relative;width:100%;height:100%;border-radius:8px;background:#3b3c3f;overflow:hidden"><div data-z style="position:absolute;top:0;bottom:0;background:#4caf50"></div><div data-m style="position:absolute;top:-4px;bottom:-4px;width:8px;margin-left:-4px;border-radius:3px;background:#f2f1ec"></div></div>';
  const zone = bar.querySelector('[data-z]'), mark = bar.querySelector('[data-m]');
  const spd = [0.55, 0.75, 0.95][L], widths = [[0.3, 0.24, 0.18], [0.24, 0.19, 0.14], [0.2, 0.15, 0.11]][L];
  let p = 0, dir = 1, locks = 0, miss = 0, z0 = 0.4, spin = 0, shake = 0;
  const place = () => { const w = widths[Math.min(locks, 2)]; z0 = 0.05 + Math.random() * (0.9 - w); zone.style.left = z0 * 100 + '%'; zone.style.width = w * 100 + '%'; };
  place();
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.on('down', () => {
    const w = widths[Math.min(locks, 2)];
    if (p >= z0 && p <= z0 + w) { locks++; ctx.sfx.good(); ctx.sfx.thud(); spin += Math.PI * 2 / 3; if (locks < 3) place(); }
    else { miss++; ctx.sfx.bad(); shake = 0.3; }
  });
  S.onTick((dt, t, act) => {
    coup.rotation.x += (spin - coup.rotation.x) * Math.min(1, dt * 10);
    if (shake > 0) { shake -= dt; bar.style.transform = `translateX(calc(-50% + ${Math.sin(t * 60) * 8}px))`; } else bar.style.transform = 'translateX(-50%)';
    if (!act || locks >= 3) { if (act && locks >= 3) win(); return; }
    p += dir * spd * dt * (1 + locks * 0.15); if (p > 1) { p = 1; dir = -1; } if (p < 0) { p = 0; dir = 1; }
    mark.style.left = p * 100 + '%';
    ch.set(`${icon('plumbing', 28, C.hv)}<span style="display:flex;gap:6px">${pips(locks, 3)}</span><span style="width:1px;height:28px;background:#3b3c3f"></span><span style="display:flex;gap:4px">${Array.from({ length: 3 }, (_, i) => icon(i < miss ? 'close' : 'favorite', 24, i < miss ? '#8b8c86' : C.red)).join('')}</span>`);
    if (miss >= 3) fail();
  });
  return {};
};

// ---------- Hydrant Thaw ----------
B.thaw = async (S, ctx) => {
  const L = ctx.level;
  S.scene.background = new THREE.Color('#dfe8ee');
  S.camera.position.set(0, 1.3, 3.4); S.camera.lookAt(0, 0.7, 0);
  S.scene.add(at(box(12, 0.3, 6, '#f4f7f8'), 0, 0.02, 0), at(box(12, 4, 0.2, '#c9d3d8'), 0, 2, -1.6));
  for (let i = 0; i < 9; i++) S.scene.add(at(sph(0.3 + Math.random() * 0.4, '#ffffff', 10), -4 + i, 0.2, -1 + Math.random() * 0.6));
  S.scene.add(hydrant());
  const ice = at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshLambertMaterial({ color: '#cfeaf7', transparent: true, opacity: 0.8, flatShading: true })), 0, 0.62, 0); ice.scale.set(1, 1.15, 1); S.scene.add(ice);
  const sp = spray(S, { from: new THREE.Vector3(0.45, 0.62, 0), rate: 60, arc: 0.4 }); sp.target.set(2.2, 0.1, 0.4);
  const per = [0.075, 0.062, 0.052][L], decay = [0.03, 0.05, 0.07][L], limit = [14, 12, 10][L];
  let heat = 0, time = limit, done = false;
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.on('down', p => { if (done) return; heat = Math.min(1, heat + per); ctx.sfx.tap(); const r = S.div(`position:absolute;left:${p.x - 30}px;top:${p.y - 30}px;width:60px;height:60px;border-radius:50%;border:5px solid #ff8a2a;box-sizing:border-box;transition:transform .35s,opacity .35s`); requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = 0; }); setTimeout(() => r.remove(), 400); });
  S.onTick((dt, t, act) => {
    const k = 1 - heat * 0.75; ice.scale.set(k, k * 1.15, k); ice.material.opacity = 0.2 + 0.6 * (1 - heat); ice.visible = heat < 0.999;
    if (!act) return;
    if (!done) { heat = Math.max(0, heat - decay * dt); time -= dt; }
    if (heat >= 1 && !done) { done = true; sp.on = true; ctx.sfx.splash(); setTimeout(() => win(), 900); }
    ch.set(`${icon('ac_unit', 28, '#8fd0f5')}${meter(heat, '#ff8a2a', 160)}<span style="width:1px;height:28px;background:#3b3c3f"></span>${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (time <= 0 && !done) fail();
  });
  return {};
};

// ---------- Truck Check ----------
B.check = async (S, ctx) => {
  const L = ctx.level;
  S.camera.position.set(6.5, 3.2, 7.5); S.camera.lookAt(0, 1.3, 0);
  S.scene.add(at(box(30, 0.02, 20, '#a8a59d'), 0, 0.01, 0), at(box(30, 8, 0.4, '#d9d2c4'), 0, 4, -4));
  const red = '#d8362d', T = new THREE.Group(); S.scene.add(T);
  T.add(at(box(6, 1.8, 2.4, red), -0.4, 1.4, 0), at(box(2, 2.3, 2.4, red), 2.6, 1.65, 0), at(box(0.05, 0.9, 2.1, '#2c3a44'), 3.61, 2.2, 0), at(box(5.6, 0.12, 0.5, '#c0c4c8'), -0.6, 2.4, 0.5), at(box(5.6, 0.12, 0.5, '#c0c4c8'), -0.6, 2.4, -0.5), at(box(6, 0.18, 2.44, '#f2f1ec'), -0.4, 1.0, 0));
  for (const [x, z] of [[-2.4, 1.2], [0.4, 1.2], [2.6, 1.2], [-2.4, -1.2], [0.4, -1.2], [2.6, -1.2]]) { const w = at(cyl(0.5, 0.5, 0.35, '#222'), x, 0.5, z); w.rotation.x = Math.PI / 2; T.add(w); }
  const glow = (c, w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c, emissive: '#000' }));
  const parts = [
    { key: 'lights', icon: 'e911_emergency', f: 988, meshes: [at(glow('#3b6fe0', 0.35, 0.25, 0.5), 2.4, 2.95, 0.6), at(glow('#3b6fe0', 0.35, 0.25, 0.5), 2.4, 2.95, -0.6)], on: '#6fa0ff' },
    { key: 'head', icon: 'flashlight_on', f: 659, meshes: [at(glow('#f5f2d0', 0.08, 0.3, 0.45), 3.62, 1.0, 0.8), at(glow('#f5f2d0', 0.08, 0.3, 0.45), 3.62, 1.0, -0.8)], on: '#fff7b0' },
    { key: 'horn', icon: 'campaign', f: 392, meshes: [at(glow('#8a8f94', 0.3, 0.3, 0.3), 3.3, 2.95, 0)], on: C.hv },
    { key: 'siren', icon: 'notifications_active', f: 523, meshes: [at(glow('#8a8f94', 0.12, 0.35, 0.8), 3.66, 0.62, 0)], on: '#ff6a5a' },
  ];
  parts.forEach(p => p.meshes.forEach(m => T.add(m)));
  const bar = S.div('position:absolute;left:50%;bottom:32px;transform:translateX(-50%);display:flex;gap:16px;pointer-events:auto');
  const btns = parts.map((p, i) => { const b = document.createElement('div'); b.style.cssText = 'width:120px;height:120px;border-radius:18px;background:#1c1d1f;color:#f2f1ec;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none;transition:background .08s'; b.innerHTML = icon(p.icon, 60); bar.appendChild(b); b.addEventListener('pointerdown', () => press(i)); return b; });
  const flash = (i, ms = 380) => { const p = parts[i]; p.meshes.forEach(m => m.material.emissive.set(p.on)); btns[i].style.background = C.hv; btns[i].style.color = C.ink; if (p.key === 'horn') ctx.sfx.horn(); else tone(p.f); setTimeout(() => { p.meshes.forEach(m => m.material.emissive.set('#000')); btns[i].style.background = '#1c1d1f'; btns[i].style.color = '#f2f1ec'; }, ms); };
  let AC = null; const tone = f => { try { AC = AC || new AudioContext(); const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.18, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.35); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.4); } catch (e) {} };
  const goal = [4, 5, 6][L]; let seq = [], inp = [], showing = false, mistakes = 0, round = 0;
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  const show = () => { showing = true; inp = []; seq.forEach((k, j) => setTimeout(() => flash(k), 500 + j * 620)); setTimeout(() => (showing = false), 500 + seq.length * 620); };
  const next = () => { if (seq.length >= goal) return win(); seq.push(Math.floor(Math.random() * 4)); if (seq.length < 2) seq.push(Math.floor(Math.random() * 4)); round = seq.length; show(); };
  function press(i) {
    if (!S.active || S.paused || showing) return;
    flash(i, 220); inp.push(i);
    if (inp[inp.length - 1] !== seq[inp.length - 1]) { mistakes++; ctx.sfx.bad(); if (mistakes >= 3) return fail(); setTimeout(show, 700); return; }
    if (inp.length === seq.length) { ctx.sfx.good(); setTimeout(next, 700); }
  }
  S.onTick((dt, t, act) => { if (act) ch.set(`${icon(showing ? 'visibility' : 'touch_app', 28, C.hv)}${showing ? 'Watch' : 'Your turn'}<span style="width:1px;height:28px;background:#3b3c3f"></span><span style="display:flex;gap:6px">${pips(Math.max(0, round - 1), goal)}</span>`); });
  return { begin() { bar.style.pointerEvents = 'auto'; next(); } };
};

// ---------- Power Off ----------
B.power = async (S, ctx) => {
  const L = ctx.level;
  S.camera.position.set(0, 1.6, 4); S.camera.lookAt(0, 1.5, 0);
  S.scene.add(at(box(12, 5, 0.2, '#cfd3d6'), 0, 2.5, -0.6), at(box(3.2, 2.4, 0.4, '#8f969c'), 0, 1.6, -0.3));
  const lever = at(box(0.25, 0.8, 0.25, C.red), 1.9, 1.7, -0.2); S.scene.add(lever, at(box(0.5, 1.1, 0.2, '#555a5f'), 1.9, 1.6, -0.35));
  const bulb = new THREE.PointLight('#fff2c0', 2, 8); bulb.position.set(0, 3.4, 1); S.scene.add(bulb);
  const COLS = ['#d8362d', '#e5e043', '#2f88c4', '#4caf50', '#f2f1ec'].slice(0, [3, 4, 5][L]);
  const n = COLS.length, right = COLS.map((c, i) => i).sort(() => Math.random() - 0.5);
  const bw = 720, bh = 440, board = S.div(`position:absolute;left:50%;top:120px;transform:translateX(-50%);width:${bw}px;height:${bh}px;border-radius:16px;background:rgba(28,29,31,.92);pointer-events:auto;touch-action:none`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', bw); svg.setAttribute('height', bh); svg.style.cssText = 'position:absolute;inset:0'; board.appendChild(svg);
  const Y = i => 60 + i * ((bh - 120) / Math.max(1, n - 1)), LX = 90, RX = bw - 90;
  const dot = (x, y, c) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:${x - 30}px;top:${y - 30}px;width:60px;height:60px;border-radius:50%;background:${c};border:5px solid #1c1d1f;box-shadow:0 0 0 3px #48494c;box-sizing:border-box`; board.appendChild(d); return d; };
  COLS.forEach((c, i) => dot(LX, Y(i), c)); right.forEach((ci, j) => dot(RX, Y(j), COLS[ci]));
  const line = (c, x1, y1, x2, y2) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'path'); l.setAttribute('stroke', c); l.setAttribute('stroke-width', 14); l.setAttribute('fill', 'none'); l.setAttribute('stroke-linecap', 'round'); svg.appendChild(l); const set = (a, b) => l.setAttribute('d', `M${x1} ${y1} C${x1 + 180} ${y1} ${a - 180} ${b} ${a} ${b}`); set(x2, y2); return { l, set }; };
  const done = new Set(); let drag = null, wrong = 0, sw = null;
  const loc = e => { const r = board.getBoundingClientRect(), k = bw / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  const win = once(ctx.win), fail = once(ctx.fail);
  board.addEventListener('pointerdown', e => { if (!S.active || S.paused) return; const p = loc(e); const i = COLS.findIndex((c, i) => !done.has(i) && Math.hypot(p.x - LX, p.y - Y(i)) < 44); if (i < 0) return; board.setPointerCapture(e.pointerId); drag = { i, ln: line(COLS[i], LX, Y(i), p.x, p.y) }; });
  board.addEventListener('pointermove', e => { if (drag) { const p = loc(e); drag.ln.set(p.x, p.y); } });
  board.addEventListener('pointerup', e => {
    if (!drag) return; const p = loc(e), j = right.findIndex((ci, j) => Math.hypot(p.x - RX, p.y - Y(j)) < 48);
    if (j >= 0 && right[j] === drag.i) { drag.ln.set(RX, Y(j)); done.add(drag.i); ctx.sfx.good(); if (done.size === n) showSwitch(); }
    else { drag.ln.l.remove(); if (j >= 0) { wrong++; ctx.sfx.bad(); board.animate([{ transform: 'translateX(-50%) translateX(-10px)' }, { transform: 'translateX(-50%) translateX(10px)' }, { transform: 'translateX(-50%)' }], { duration: 250 }); if (wrong >= 3) fail(); } }
    drag = null;
  });
  const showSwitch = () => { sw = S.div(`position:absolute;left:50%;bottom:36px;transform:translateX(-50%);height:96px;padding:0 40px 0 24px;border-radius:14px;background:${C.hv};color:${C.ink};display:flex;align-items:center;gap:12px;font-weight:900;font-stretch:125%;font-size:32px;text-transform:uppercase;pointer-events:auto;cursor:pointer;box-shadow:0 0 0 8px rgba(229,224,67,.35)`, icon('power_settings_new', 50) + 'Switch off'); sw.addEventListener('pointerdown', () => { if (!S.active || S.paused) return; ctx.sfx.thud(); sw.remove(); off = true; }); };
  let off = false, offT = 0;
  const ch = chip(S);
  S.onTick((dt, t, act) => {
    if (off) { offT += dt; lever.rotation.x = Math.min(1, offT * 4) * -1.2; lever.position.y = 1.7 - Math.min(1, offT * 4) * 0.3; bulb.intensity = Math.max(0, 2 - offT * 6); S.hemi.intensity = Math.max(0.5, 1.3 - offT * 3); if (offT > 0.8) win(); }
    else bulb.intensity = 1.6 + Math.sin(t * 30) * 0.3 * Math.random();
    if (act) ch.set(`${icon('cable', 28, C.hv)}<span style="display:flex;gap:6px">${pips(done.size, n)}</span><span style="width:1px;height:28px;background:#3b3c3f"></span><span style="display:flex;gap:4px">${Array.from({ length: 3 }, (_, i) => icon(i < wrong ? 'close' : 'favorite', 24, i < wrong ? '#8b8c86' : C.red)).join('')}</span>`);
  });
  return {};
};

// ---------- not built yet: a finish button so progress still moves ----------
const soon = async (S, ctx) => {
  S.camera.position.set(0, 2, 6); S.camera.lookAt(0, 1, 0);
  S.scene.add(at(box(3, 2, 0.2, C.hv), 0, 1.4, 0), at(cyl(0.06, 0.06, 1, '#555'), -1.2, 0.5, 0), at(cyl(0.06, 0.06, 1, '#555'), 1.2, 0.5, 0));
  const b = S.div(`position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:18px;pointer-events:auto`, `<div style="height:60px;padding:0 22px;border-radius:10px;background:#1c1d1f;display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px">${icon('construction', 30, C.hv)}Being built</div><div data-f style="height:88px;padding:0 36px 0 24px;border-radius:14px;background:${C.hv};color:${C.ink};display:flex;align-items:center;gap:10px;font-weight:900;font-stretch:125%;font-size:30px;text-transform:uppercase;cursor:pointer">${icon('check', 44)}Finish</div>`);
  b.querySelector('[data-f]').addEventListener('pointerdown', () => S.active && ctx.win());
  return {};
};

// Game-specific sounds on top of the shared sfx: what a "good" moment sounds like in each rescue game,
// and the vehicle loop for the flying / boat games (only while the game is running, not paused).
const GOOD = { catch: 'boing', cat: 'meow', torch: 'chick', pets: 'chick' };
const VEHICLE = { heli: 'rotors', drone: 'drone', boat: 'boat' };

export async function createMinigame(id, host, ctx) {
  Object.assign(B, B2, B3);
  if (GOOD[id]) { const base = ctx.sfx, k = GOOD[id]; ctx = { ...ctx, sfx: Object.assign(Object.create(base), { good: () => base[k]() }) }; }
  const cg = CB[id] && ctx.c3 && ctx.c3.city ? CB[id] : null;
  const S = cg ? cityStage(host, ctx.c3, cg.at(ctx.c3, ctx.ev || ctx.c3.city.spawn, ctx.level)) : stage(host, INDOOR[id] ? { ground: null, bg: '#2a2b2e' } : id === 'dispatch' ? { ground: null, bg: '#bfc6cb' } : id === 'boat' ? { ground: '#8fb870', bg: '#cfdde4' } : id === 'foam' ? { ground: '#9a9ca0', bg: '#bfc6cb' } : id === 'thaw' ? { ground: '#f4f7f8', bg: '#dfe8ee' } : id === 'power' || id === 'check' ? { ground: null, bg: '#bfc6cb' } : {});
  if (!cg && ctx.c3) S.model = mid => ctx.c3.model(mid);
  if (VEHICLE[id]) S.onTick(() => { if (S.active) ctx.sfx.amb(VEHICLE[id]); });
  S.setFrame('intro');
  if (window.__mgDebug) window.__mgS = S;
  let g; try { g = await (cg ? cg.run : (B[id] || soon))(S, ctx); } catch (e) { S.dispose(); throw e; }
  return {
    begin() { S.setFrame('full'); S.setActive(true); g.begin && g.begin(); if (id === 'cat') setTimeout(() => ctx.sfx.meow(), 500); if (id === 'dispatch') ctx.sfx.radio(); },
    setPaused: v => S.setPaused(v),
    stop() { S.dispose(); },
  };
}
