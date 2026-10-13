// Skyborn combat: roaming enemies, champions, projectiles, auto-aim breath, loot.
import * as THREE from 'three';
import { buildPirateBalloon, buildWyvern, buildHarpy, buildIceSpirit, buildSeaSerpent, buildFlagship, buildIronDrake, buildFrostWyrm, buildStormTitan, buildKraken, buildSkyFortress } from './skyborn-bestiary.js';
import { buildGriffinKnight } from './skyborn-models.js';
import { sfx, flash } from './ui.js';
import { vo } from './voice.js';
import { initFx } from './fx.js';

export const DEF = {
  balloon: { build: buildPirateBalloon, s: 3, hp: 3, r: 24, gems: 10, beh: 'balloon', aimY: 15 },
  griffin: { build: buildGriffinKnight, s: 3.2, hp: 3, r: 14, gems: 12, beh: 'griffin' },
  wyvern: { build: buildWyvern, s: 2.2, hp: 1, r: 11, gems: 5, beh: 'wyvern' },
  harpy: { build: buildHarpy, s: 4.5, hp: 2, r: 11, gems: 8, beh: 'harpy' },
  spirit: { build: buildIceSpirit, s: 5, hp: 2, r: 12, gems: 9, beh: 'spirit' },
  serpent: { build: () => buildSeaSerpent(), s: 3.5, hp: 4, r: 20, gems: 14, beh: 'serpent' }
};
export const BOSS = {
  hearthvale: { build: buildFlagship, s: 2.4, hp: 40, r: 70, beh: 'balloon', name: "Captain Gale's Flagship", add: 'balloon', volley: 5, aimY: 30 },
  cinder: { build: buildIronDrake, s: 2.2, hp: 50, r: 40, beh: 'griffin', name: 'The Iron Drake', add: 'wyvern', fire: true },
  frostfang: { build: buildFrostWyrm, s: 2.2, hp: 60, r: 50, beh: 'wyrm', name: 'The Frost Wyrm', add: 'spirit' },
  stormcrown: { build: buildStormTitan, s: 7, hp: 70, r: 60, beh: 'titan', name: 'The Storm Titan', add: 'harpy' },
  reach: { build: buildKraken, s: 7, hp: 80, r: 60, beh: 'kraken', name: 'The Kraken', add: 'serpent' },
  sky: { build: buildSkyFortress, s: 5, hp: 120, r: 90, beh: 'balloon', name: "Pirate King's Sky Fortress", add: 'griffin', volley: 7, aimY: 40 }
};
export const MIX = {
  hearthvale: [['balloon', 2, 4], ['griffin', 1, 2]], cinder: [['wyvern', 3, 5], ['balloon', 2, 3]], frostfang: [['spirit', 2, 3], ['griffin', 1, 2]],
  stormcrown: [['harpy', 2, 4], ['balloon', 2, 3]], reach: [['serpent', 1, 2], ['balloon', 2, 3]], sky: [['griffin', 2, 3], ['harpy', 2, 3], ['balloon', 2, 3]]
};
export const TIER = { hearthvale: 0, cinder: 1, stormcrown: 2, frostfang: 3, reach: 4, sky: 5 };
const BREATH = { Breeze: 0xc8f8e0, Ember: 0xff8a30, Frost: 0xbfe8ff, Storm: 0x9fd8ff, Tide: 0x5fe6d6, Gold: 0xfff0a0 };

var TAG_URL = '';
function tagTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  x.beginPath(); x.moveTo(32, 60); x.lineTo(10, 22); x.quadraticCurveTo(32, 4, 54, 22); x.closePath(); x.fillStyle = '#ff4a3a'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#fff'; x.font = '900 26px Nunito, sans-serif'; x.textAlign = 'center'; x.fillText('!', 32, 40);
  TAG_URL = cv.toDataURL(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const tagURL = () => TAG_URL;
const TAGMAT = new THREE.SpriteMaterial({ map: tagTexture(), depthTest: false, fog: false, transparent: true }), BARBG = new THREE.SpriteMaterial({ color: 0x1a1018, opacity: 0.7, transparent: true, depthTest: false, fog: false }), BARFG = new THREE.SpriteMaterial({ color: 0x5aff6a, depthTest: false, fog: false });
export function initCombat(G) {
  const { world } = G, scene = world.scene;
  const enemies = [], shots = [], loot = [], strikes = [], fx = initFx(scene);
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), P = () => world.fly.pos;
  const shotGeo = new THREE.IcosahedronGeometry(2.2, 1), gemGeo = new THREE.OctahedronGeometry(2.2), heartGeo = new THREE.SphereGeometry(2.2, 12, 8);
  const mat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x6ff0e6, emissive: 0x2fb8b0, emissiveIntensity: 0.8 }), heartMat = new THREE.MeshStandardMaterial({ color: 0xff4a5a, emissive: 0xc0203a, emissiveIntensity: 0.7 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4 }), feather = mat(0xc89aff), icicle = mat(0xcfeaff), water = mat(0x6fd6ff), fireM = mat(0xff7a30);

  const proj = new THREE.Vector3(), HIT = new THREE.Color(1, 0.72, 0.4);
  function placeAhead(m, clear, dist) {
    const f = world.fly, x = f.pos.x + Math.sin(f.yaw) * dist, z = f.pos.z + Math.cos(f.yaw) * dist;
    let g = 0; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g = Math.max(g, world.groundAt(x + Math.sin(a) * clear, z + Math.cos(a) * clear)); }
    m.position.set(x, Math.max(f.pos.y + 40, g + clear), z);
  }
  function spawn(type, pos, opts = {}) {
    // Wrap each model so its own idle bob (which animates the model root) can't fight the enemy's world position.
    const d = opts.boss || DEF[type], inner = d.build(), m = new THREE.Group(); m.add(inner); m.userData.update = (t, st) => inner.userData.update && inner.userData.update(t, st);
    const tier = TIER[G.region] || 0;
    m.scale.multiplyScalar(d.s); m.position.copy(pos); scene.add(m);
    const hp = Math.round(opts.boss ? d.hp : d.hp * (1 + tier * 0.4));
    const e = { type, d, m, hp, max: hp, alive: true, t: Math.random() * 6, fireT: 2 + Math.random() * 2, st: 'circle', stT: 3 + Math.random() * 2, ang: Math.random() * 6.28, boss: !!opts.boss, group: opts.group, slow: 0, sub: false, vel: new THREE.Vector3() };
    e.home = pos.clone(); e.base = m.scale.x; e.mats = [];
    m.traverse(o => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); e.mats.push([o.material, o.material.emissive.clone(), o.material.emissiveIntensity]); } });
    if (!opts.boss) { const tag = new THREE.Group(), mk = new THREE.Sprite(TAGMAT.clone()), bg = new THREE.Sprite(BARBG), fill = new THREE.Sprite(BARFG.clone());
      mk.center.set(0.5, 0); bg.center.set(0.5, 0.5); fill.center.set(0.5, 0.5); bg.position.y = fill.position.y = -0.18;
      bg.scale.set(1, 0.14, 1); fill.scale.set(1, 0.1, 1); tag.add(mk, bg, fill); scene.add(tag); e.tag = tag; e.fill = fill; e.tagH = new THREE.Box3().setFromObject(m).max.y - m.position.y; }
    enemies.push(e); return e;
  }
  const NAMES = { balloon: 'Pirate balloons', griffin: 'Griffin knights', wyvern: 'Wild wyverns', harpy: 'Harpies', spirit: 'Ice spirits', serpent: 'A sea serpent' };
  function spawnGroup(region, center, group, extra = 0) {
    setTimeout(() => { flash('Incoming!', 1400); sfx.alarm && (sfx.alarm(), vo('combat-incoming', 1)); G.onIncoming && G.onIncoming(NAMES[last] || 'Enemies'); }, 0); let last;
    const mix = MIX[region] || MIX.hearthvale, pick = mix[(Math.random() * mix.length) | 0], n = pick[1] + ((Math.random() * (pick[2] - pick[1] + 1)) | 0) + extra;
    const yaw = world.fly.yaw + (Math.random() - 0.5) * 2;
    last = pick[0];
    for (let i = 0; i < n; i++) { const a = yaw + (i - n / 2) * 0.25, r = 380 + Math.random() * 120; tmp.set(center.x + Math.sin(a) * r, Math.max(center.y + (Math.random() - 0.3) * 60, world.groundAt(center.x, center.z) + 60), center.z + Math.cos(a) * r); spawn(pick[0], tmp.clone(), { group }); }
    return pick[0];
  }
  function fire(from, to, speed, m, dmg = 1, grav = 0, spread = 0) {
    const fk = m === iron ? 'cannon' : m === feather ? 'feather' : m === icicle ? 'ice' : m === water ? 'water' : 'fire';
    const s = fx.projectile(fk); s.position.copy(from); fx.muzzle(from, fk); const T = from.distanceTo(to) / speed;
    const aim = to.clone().addScaledVector(world.fly.vel || tmp.set(0, 0, 0), T);
    const v = aim.sub(from).divideScalar(Math.max(T, 0.1)); v.y += 0.5 * grav * T;
    if (spread) v.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    scene.add(s); shots.push({ s, v, grav, life: 6, dmg, hostile: true, fk });
  }
  function hitPlayer(dmg, kind) {
    if (G.invuln > 0) return;
    if (G.rollT > 0) { if (!G.dodged) { G.dodged = true; flash('Perfect dodge!'); sfx.dodge(); G.slowmo = 0.45; const t = nearest(); if (t) damage(t, 1); } return; }
    G.hurt(dmg, kind);
  }
  function nearest(cone = 0.6, max = 520) {
    world.ember.getWorldDirection(fwd); let best = null, bd = 1e9;
    for (const e of enemies) { if (!e.alive || e.sub) continue; tmp.copy(e.m.position).sub(P()); const d = tmp.length(); if (d > max) continue; const dot = tmp.normalize().dot(fwd); if (dot < cone) continue; const sc = d * (1.6 - dot); if (sc < bd) { bd = sc; best = e; } }
    return best;
  }
  function damage(e, dmg) {
    if (!e.alive) return; e.hp -= dmg; sfx.hit(); e.flash = 0.22;
    if (e.hp <= 0) {
      e.alive = false; e.dead = 1.8; sfx.pop(); fx.burst(e.m.position, e.boss ? 'Gold' : 'Ember', e.boss ? 60 : 30, e.boss ? 3 : 1.6); G.onKill && G.onKill(e);
      const n = Math.max(2, Math.round((e.boss ? 60 : e.d.gems) / 4));
      for (let i = 0; i < n; i++) dropLoot(e.m.position, 'gem', e.boss ? 6 : 4);
      if (Math.random() < 0.18) dropLoot(e.m.position, 'heart');
    }
  }
  function dropLoot(p, kind, val = 4) { const m = new THREE.Mesh(kind === 'gem' ? gemGeo : heartGeo, kind === 'gem' ? gemMat : heartMat); m.position.copy(p).add(tmp.set((Math.random() - 0.5) * 30, (Math.random() - 0.2) * 20, (Math.random() - 0.5) * 30)); scene.add(m); loot.push({ m, kind, val, v: new THREE.Vector3((Math.random() - 0.5) * 20, 10, (Math.random() - 0.5) * 20), life: 30 }); }
  function breathe() {
    const kind = G.save.dragon, t = nearest(); world.ember.getWorldDirection(fwd);
    const dmg = 1 + G.up().breath * 0.35, mouth = P().clone().addScaledVector(fwd, 14); mouth.y += 3;
    sfx.breath(kind); fx.muzzle(mouth, kind);
    if (kind === 'Storm') {
      const end = t ? t.m.position.clone() : mouth.clone().addScaledVector(fwd, 260); fx.arc(mouth, end, 'Storm');
      if (t) { damage(t, dmg); enemies.filter(o => o !== t && o.alive && !o.sub && o.m.position.distanceTo(t.m.position) < 240).slice(0, 2).forEach(o => { fx.arc(t.m.position, o.m.position, 'Storm'); damage(o, dmg * 0.7); }); }
      return;
    }
    if (kind === 'Gold' && t && t.m.position.distanceTo(P()) < 420) { fx.beam(mouth, t.m.position); fx.burst(t.m.position, 'Gold', 26, 1.4); damage(t, dmg * 1.2); enemies.filter(o => o !== t && o.alive && !o.sub && o.m.position.distanceTo(t.m.position) < 160).forEach(o => damage(o, dmg * 0.6)); return; }
    const n = kind === 'Tide' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const s = fx.projectile(kind); s.position.copy(mouth).addScaledVector(fwd, -i * 8); scene.add(s);
      shots.push({ s, v: fwd.clone().multiplyScalar((kind === 'Frost' ? 230 : 180) + world.fly.speed), grav: 0, life: 2.4, dmg: dmg / n * (kind === 'Tide' ? 1.3 : 1), hostile: false, target: t, kind, fk: kind });
    }
  }
  function update(dt) {
    const p = P(), now = performance.now();
    for (const e of enemies) {
      e.t += dt; const m = e.m, beh = e.d.beh, sp = e.slow > 0 ? 0.4 : 1; e.slow -= dt;
      if (m.userData.update) m.userData.update(e.t, { flap: 0.8 });
      if (e.tag) { const show = e.alive && !e.sub; e.tag.visible = show; if (show) { const d = m.position.distanceTo(world.camera.position), s = Math.min(60, Math.max(6, d * 0.035)); e.tag.position.set(m.position.x, m.position.y + e.tagH + 4 + s * 0.15, m.position.z); const warn = e.st === 'charge' || (e.fireT < 0.9 && m.position.distanceTo(p) < 750), mk = e.tag.children[0]; e.warnK = Math.max(0, Math.min(1, (e.warnK || 0) + (warn ? dt * 6 : -dt * 4)));
        mk.material.color.setRGB(1, 1 - e.warnK * 0.15, 1 - e.warnK * 0.75); mk.scale.setScalar(1 + e.warnK * (0.35 + 0.25 * Math.sin(e.t * 22)));
        e.tag.scale.setScalar(s); e.fill.scale.x = Math.max(0.02, e.hp / e.max); e.fill.center.x = 0.5 / e.fill.scale.x; e.fill.material.color.setHSL(0.33 * e.hp / e.max, 0.85, 0.5); e.tag.children[1].visible = e.fill.visible = e.hp < e.max; } }
      if (!e.alive) { e.dead -= dt; if (e.tag && e.dead < 1.7) { scene.remove(e.tag); e.tag = null; } m.position.y -= (40 + (1.8 - e.dead) * 60) * dt; m.rotation.z += dt * 3; m.rotation.x += dt * 2; if (e.dead <= 0) { scene.remove(m); e.gone = true; } continue; }
      if (e.flash > 0 || e.flashOn) {
        e.flash = Math.max(0, e.flash - dt); const k = e.flash / 0.22, kk = k * k; e.flashOn = k > 0;
        for (const [mt, em, ei] of e.mats) { mt.emissive.copy(em).lerp(HIT, kk); mt.emissiveIntensity = ei + kk * 1.1; }
        m.scale.setScalar(e.base * (1 + Math.sin(k * Math.PI) * 0.07));
      }
      const dist = m.position.distanceTo(p), toP = tmp.copy(p).sub(m.position).normalize();
      if (beh === 'balloon') {
        // Stay in the player's forward arc so big ships are actually on screen instead of trailing behind.
        let want;
        if (e.boss) { e.ang += dt * 0.12 * sp; const c0 = e.home; want = new THREE.Vector3(c0.x + Math.sin(e.ang) * 340, Math.max(c0.y, p.y + 30), c0.z + Math.cos(e.ang) * 340); m.position.lerp(want, Math.min(1, dt * 0.5)); }
        else { e.ang += dt * 0.15; want = new THREE.Vector3(p.x + Math.sin(e.ang) * 190, p.y + 30, p.z + Math.cos(e.ang) * 190); m.position.lerp(want, Math.min(1, dt * 0.12 * sp)); } m.lookAt(p.x, m.position.y, p.z);
        e.fireT -= dt; if (e.fireT <= 0 && dist < 650) { e.fireT = e.boss ? 2.4 : 3.6; const n = e.d.volley || 1; for (let i = 0; i < n; i++) fire(m.position.clone().add(new THREE.Vector3(0, e.d.aimY || 10, 0)), p, 70, iron, 1, 18, (i - (n - 1) / 2) * 0.08); }
      } else if (beh === 'griffin') {
        e.stT -= dt;
        if (e.st === 'circle') { e.ang += dt * 0.9 * sp; const want = new THREE.Vector3(p.x + Math.sin(e.ang) * 170, p.y + 20 + Math.sin(e.t) * 20, p.z + Math.cos(e.ang) * 170); m.position.lerp(want, Math.min(1, dt * 1.2 * sp)); m.lookAt(want); if (e.stT <= 0) { e.st = 'charge'; e.stT = 2.6; e.vel.copy(toP).multiplyScalar(e.boss ? 95 : 85); if (e.d.fire) fire(m.position.clone(), p, 90, fireM); } }
        else { m.position.addScaledVector(e.vel, dt * sp); m.lookAt(tmp.copy(m.position).add(e.vel)); if (dist < (e.boss ? 40 : 18)) { hitPlayer(1, 'charge'); e.stT = 0; } if (e.stT <= 0) { e.st = 'circle'; e.stT = 3 + Math.random() * 2; e.ang = Math.atan2(m.position.x - p.x, m.position.z - p.z); } }
      } else if (beh === 'wyvern') {
        e.ang += dt * 1.9 * sp; const r = 45 + Math.sin(e.t * 1.7) * 15, want = new THREE.Vector3(p.x + Math.sin(e.ang) * r, p.y + Math.sin(e.t * 2.3) * 14, p.z + Math.cos(e.ang) * r);
        m.position.lerp(want, Math.min(1, dt * 2.4 * sp)); m.lookAt(want); e.fireT -= dt; if (e.fireT <= 0 && dist < 60) { e.fireT = 2 + Math.random() * 1.5; hitPlayer(1, 'bite'); }
      } else if (beh === 'harpy') {
        // Harpies hold a wide arc out in front and a little above you (so they're on screen), then swoop past now and then.
        const yaw = world.fly.yaw; e.stT -= dt;
        if (e.st !== 'swoop') { const arc = yaw + Math.sin(e.t * 0.45 + e.ang) * 0.9, want = new THREE.Vector3(p.x + Math.sin(arc) * 170, p.y + 40 + Math.sin(e.t * 1.3) * 12, p.z + Math.cos(arc) * 170);
          m.position.lerp(want, Math.min(1, dt * 1.4 * sp)); m.lookAt(p); if (e.stT <= 0 && dist < 400) { e.st = 'swoop'; e.stT = 2.2; e.vel.copy(p).add(new THREE.Vector3(Math.sin(yaw) * 30, 4, Math.cos(yaw) * 30)).sub(m.position).normalize().multiplyScalar(110); } }
        else { m.position.addScaledVector(e.vel, dt * sp); m.lookAt(tmp.copy(m.position).add(e.vel)); if (dist < 16) { hitPlayer(1, 'claw'); e.stT = 0; } if (e.stT <= 0) { e.st = 'circle'; e.stT = 5 + Math.random() * 3; } }
        e.fireT -= dt; if (e.fireT <= 0 && e.st !== 'swoop') { e.fireT = 4.2; for (let i = -2; i <= 2; i++) fire(m.position.clone(), p, 75, feather, 1, 0, i * 0.12); }
      } else if (beh === 'spirit') {
        e.fireT -= dt; if (e.fireT <= 0) { e.fireT = 3.2; const a = Math.random() * 6.28; m.position.set(p.x + Math.sin(a) * 160, p.y + 20 + Math.random() * 40, p.z + Math.cos(a) * 160); setTimeout(() => { if (e.alive) for (let i = -1; i <= 1; i++) fire(m.position.clone(), P(), 95, icicle, 1, 0, i * 0.06); }, 600); }
        m.lookAt(p);
      } else if (beh === 'serpent' || beh === 'kraken' || beh === 'wyrm') {
        const g = world.groundAt(p.x, p.z), low = p.y - Math.max(g, 0) < (e.boss ? 260 : 130), wet = beh === 'wyrm' ? true : g <= 0;
        e.sub = !(low && wet); e.subT = e.sub ? (e.subT || 0) + dt : 0;
        if (!e.boss && e.subT > 8) { e.alive = false; e.gone = true; scene.remove(m); if (e.tag) { scene.remove(e.tag); e.tag = null; } continue; } const base = beh === 'wyrm' ? Math.max(g, 0) : 0;
        const want = new THREE.Vector3(p.x + Math.sin(e.ang) * 90, e.sub ? base - 60 : base + (e.boss ? 40 : 18), p.z + Math.cos(e.ang) * 90);
        e.ang += dt * 0.4; m.position.lerp(want, Math.min(1, dt * 1.5)); m.lookAt(p.x, m.position.y + 10, p.z);
        e.fireT -= dt; if (e.fireT <= 0 && !e.sub) { e.fireT = e.boss ? 1.6 : 2.2; fire(m.position.clone().add(new THREE.Vector3(0, 20, 0)), p, 85, beh === 'wyrm' ? icicle : water, 1, 8); }
      } else if (beh === 'titan') {
        e.ang += dt * 0.2; const want = new THREE.Vector3(p.x + Math.sin(e.ang) * 300, p.y + 150, p.z + Math.cos(e.ang) * 300); m.position.lerp(want, Math.min(1, dt * 0.5)); m.lookAt(p);
        e.fireT -= dt; if (e.fireT <= 0) { e.fireT = 2.6; const mark = new THREE.Mesh(new THREE.RingGeometry(18, 26, 32), mat(0xbfe4ff)); mark.position.copy(p); mark.lookAt(m.position); scene.add(mark); strikes.push({ mark, at: p.clone(), t: 1.1 }); }
      }
      if (!e.sub) {
        const clear = e.boss ? e.d.r * 1.3 : e.d.r + 8, gy = Math.max(world.groundAt(m.position.x, m.position.z), 0) + clear;
        if (m.position.y < gy - clear * 0.5) m.position.y = gy; else if (m.position.y < gy) m.position.y += (gy - m.position.y) * Math.min(1, dt * 6);
      }
      // Watchdog: a champion that is off screen, buried or far away for a few seconds is moved back in front of the player.
      if (e.boss) {
        proj.copy(m.position).project(world.camera);
        const onScreen = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1, buried = !e.sub && m.position.y < Math.max(world.groundAt(m.position.x, m.position.z), 0);
        const stray = m.position.distanceTo(e.home) > 1200;
        if (buried || stray || !isFinite(m.position.x + m.position.y + m.position.z)) { m.position.copy(e.home); e.lost = 0; }
      }
      if (e.boss && e.d.add && e.hp < e.max * (1 - (e.adds || 0) * 0.33 - 0.33) && (e.adds || 0) < 2) { e.adds = (e.adds || 0) + 1; for (let i = 0; i < 2; i++) spawn(e.d.add, m.position.clone().add(new THREE.Vector3((i - 0.5) * 80, 20, 0)), { group: e.group }); (flash('Reinforcements!'), vo('champ-reinforce', 2)); }
    }
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1);
    for (let i = strikes.length - 1; i >= 0; i--) { const s = strikes[i]; if (!s) continue; s.t -= dt; s.mark.material.opacity = 0.4 + Math.sin(now / 60) * 0.4; if (s.t <= 0) { scene.remove(s.mark); strikes.splice(strikes.indexOf(s), 1); sfx.boom(); if (p.distanceTo(s.at) < 30) hitPlayer(1, 'lightning'); } }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; if (!s) continue; s.life -= dt;
      if (!s.hostile && s.target && s.target.alive) { tmp.copy(s.target.m.position).sub(s.s.position).normalize().multiplyScalar(s.v.length()); s.v.lerp(tmp, Math.min(1, dt * 5)); }
      s.v.y -= (s.grav || 0) * dt; s.s.position.addScaledVector(s.v, dt); fx.trail(s.s, s.v, dt);
      let done = s.life <= 0;
      if (s.hostile) { if (s.s.position.distanceTo(p) < 9) { hitPlayer(s.dmg, 'shot'); done = true; fx.burst(s.s.position, s.fk, 14, 0.8); } else if (s.s.position.y < world.groundAt(s.s.position.x, s.s.position.z)) { done = true; fx.burst(s.s.position, s.fk, 10, 0.7); } }
      else for (const e of enemies) { if (!e.alive || e.sub) continue; if (s.s.position.distanceTo(e.m.position) < e.d.r * (e.boss ? 1 : 1.2)) {
        damage(e, s.dmg); done = true; fx.burst(s.s.position, s.fk || s.kind, 16, 1);
        if (s.kind === 'Frost') e.slow = 2.5;
        if (s.kind === 'Tide') e.m.position.addScaledVector(s.v.clone().normalize(), 40);
        if (s.kind === 'Gold') enemies.filter(o => o !== e && o.alive && o.m.position.distanceTo(e.m.position) < 220).slice(0, 2).forEach(o => damage(o, s.dmg * 0.6));
        break; } }
      if (done) { scene.remove(s.s); const k = shots.indexOf(s); if (k >= 0) shots.splice(k, 1); }
    }
    fx.update(dt);
    for (let i = loot.length - 1; i >= 0; i--) {
      // Auto-collect: loot bursts out, hangs for a moment, then homes in on the rider wherever they are.
      const l = loot[i]; if (!l) continue; l.age = (l.age || 0) + dt; l.m.rotation.y += dt * 3; const d = l.m.position.distanceTo(p);
      if (l.age < 0.45) { l.v.multiplyScalar(0.92); }
      else { const sp = 160 + l.age * 260 + world.fly.speed; tmp.copy(p).sub(l.m.position).normalize().multiplyScalar(sp); l.v.lerp(tmp, Math.min(1, dt * (3 + l.age * 4))); }
      l.m.position.addScaledVector(l.v, dt);
      if (d < 14 || l.age > 6) { scene.remove(l.m); loot.splice(i, 1); G.collect(l.kind, l.val); }
    }
  }
  const alive = group => enemies.some(e => e.alive && (group == null || e.group === group));
  const clear = () => { enemies.forEach(e => { scene.remove(e.m); if (e.tag) scene.remove(e.tag); }); shots.forEach(s => scene.remove(s.s)); strikes.forEach(s => scene.remove(s.mark)); enemies.length = shots.length = strikes.length = 0; };
  return { spawn, spawnGroup, breathe, update, nearest, alive, clear, enemies, dropLoot };
}
