// Pooled particle effects: expanding ripple rings, splash droplets, sand puffs
// and celebration confetti. Everything is pre-allocated (no per-frame garbage)
// and drawn in three draw calls.

import * as THREE from 'three';
import { clamp } from './util.js';
import { surfaceY } from './world/water.js';

const RING_POOL = 30;
const DROPS = 260;
const CONFETTI = 150;
const MOTES = 110;                 // cosmetic flight trail

// Cosmetic trails (bought in the shop). Each one is the same pooled instanced
// mesh with different colours / rise / spacing, so a trail costs no draw calls.
const TRAILS = {
  rainbow: { rise: 0.6, life: 0.85, size: 1.0, every: 0.9, hue: true, color: 0xffffff },
  sparkle: { rise: 1.4, life: 0.6, size: 0.8, every: 0.55, twinkle: true, color: 0xffe680 },
  bubble: { rise: 2.1, life: 1.1, size: 1.15, every: 1.1, color: 0xcfefff },
  rune: { rise: 0.9, life: 1.3, size: 1.05, every: 1.3, color: 0xb69cff },
};

export function createFx(scene) {
  const group = new THREE.Group();
  group.name = 'fx';
  scene.add(group);

  // --- ripple rings ---------------------------------------------------------
  const ringGeo = new THREE.RingGeometry(0.86, 1.0, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < RING_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(ringGeo, mat);
    m.visible = false;
    m.renderOrder = 3;
    group.add(m);
    rings.push({ m, mat, life: 0, dur: 1, from: 0.5, to: 4, strength: 1 });
  }
  let ringNext = 0;

  // --- droplets -------------------------------------------------------------
  // UNLIT on purpose. These used to be MeshLambertMaterial, and the daylight rig
  // adds up to ~1.7x irradiance (hemi 0.95 + sun 0.85), so a lit droplet
  // multiplied its cosmetic tint straight past 1.0 and clamped to white: the gold
  // and rainbow splashes were in the buffer but invisible on screen. Basic keeps
  // the colour the player bought; `vertexColors` is still needed so three.js
  // defines USE_COLOR and the per-instance colour reaches the fragment shader,
  // and `fog: false` stops a distant splash fading into the sky colour.
  const dropGeo = new THREE.IcosahedronGeometry(0.105, 0);
  dropGeo.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(dropGeo.attributes.position.count * 3).fill(1), 3));
  const dropMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true, fog: false,
  });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, DROPS);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DROPS * 3).fill(1), 3);
  drops.frustumCulled = false;
  drops.count = DROPS;
  group.add(drops);
  const dropState = [];
  for (let i = 0; i < DROPS; i++) dropState.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 });
  let dropNext = 0;

  // --- trail motes ----------------------------------------------------------
  const moteGeo = new THREE.IcosahedronGeometry(0.11, 0);
  moteGeo.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(moteGeo.attributes.position.count * 3).fill(1), 3));
  const moteMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
  });
  const motes = new THREE.InstancedMesh(moteGeo, moteMat, MOTES);
  motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  motes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MOTES * 3).fill(1), 3);
  motes.frustumCulled = false;
  motes.renderOrder = 3;
  group.add(motes);
  const moteState = [];
  // dur 0 = free slot (see update)
  for (let i = 0; i < MOTES; i++) moteState.push({ life: 0, dur: 0, x: 0, y: 0, z: 0, rise: 0, s: 1, tw: 0 });
  let moteNext = 0;
  let trailKind = '';
  let trailAcc = 0;
  let hue = 0;

  // splash tint: '' = plain water, otherwise a cosmetic colour
  const SPLASH_PLAIN = 0xf2fbff;    // sunlit spray
  const PUFF_SAND = 0xe0cda6;       // dry-land dust, never the splash cosmetic
  let splashHex = SPLASH_PLAIN;
  let splashRainbow = false;

  // --- confetti -------------------------------------------------------------
  const confGeo = new THREE.PlaneGeometry(0.3, 0.42);
  // white vertex colours so per-instance colours multiply through in every
  // three.js build (USE_COLOR + USE_INSTANCING_COLOR)
  confGeo.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(confGeo.attributes.position.count * 3).fill(1), 3));
  const confMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true });
  const conf = new THREE.InstancedMesh(confGeo, confMat, CONFETTI);
  conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  conf.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CONFETTI * 3), 3);
  conf.frustumCulled = false;
  group.add(conf);
  const confState = [];
  for (let i = 0; i < CONFETTI; i++) {
    confState.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sp: 1 });
  }
  let confNext = 0;

  const dummy = new THREE.Object3D();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < DROPS; i++) drops.setMatrixAt(i, HIDDEN);
  for (let i = 0; i < CONFETTI; i++) conf.setMatrixAt(i, HIDDEN);
  for (let i = 0; i < MOTES; i++) motes.setMatrixAt(i, HIDDEN);
  drops.instanceMatrix.needsUpdate = true;
  conf.instanceMatrix.needsUpdate = true;
  motes.instanceMatrix.needsUpdate = true;

  const tmpColor = new THREE.Color();

  // --- emitters -------------------------------------------------------------
  function ripple(x, z, to = 4, strength = 1, dur = 1.0) {
    const r = rings[ringNext++ % RING_POOL];
    r.m.visible = true;
    r.m.position.set(x, 0.035, z);
    r.life = 0; r.dur = dur; r.from = 0.35; r.to = to; r.strength = clamp(strength, 0.1, 1);
    r.m.scale.setScalar(r.from);
    r.mat.opacity = 0.5 * r.strength;
  }

  /** One droplet. `hex` overrides the splash cosmetic (dry-land dust uses it). */
  function drop(x, y, z, vx, vy, vz, s, hex) {
    const i = dropNext++ % DROPS;
    const d = dropState[i];
    d.life = 0.62 + Math.random() * 0.5;
    d.x = x; d.y = y; d.z = z;
    d.vx = vx; d.vy = vy; d.vz = vz;
    d.s = s;
    if (hex) tmpColor.setHex(hex);
    else if (splashRainbow) tmpColor.setHSL(Math.random(), 0.95, 0.55);
    else tmpColor.setHex(splashHex);
    // unlit droplets would otherwise be one flat colour, so each gets a little
    // brightness of its own — cheaper than shading and it survives any tint
    const k = 0.82 + Math.random() * 0.18;
    drops.instanceColor.setXYZ(i, tmpColor.r * k, tmpColor.g * k, tmpColor.b * k);
    drops.instanceColor.needsUpdate = true;
  }

  /** Cosmetic splash colour. hex = 0 / null restores plain water. */
  function setSplash(hex, rainbow = false) {
    splashHex = hex || SPLASH_PLAIN;
    splashRainbow = !!rainbow;
  }

  /** Verification only: the tint in force right now. */
  function splashTint() { return { hex: splashHex, rainbow: splashRainbow }; }

  /** Cosmetic flight trail: '' = none, else a key of TRAILS. */
  function setTrail(kind) { trailKind = TRAILS[kind] ? kind : ''; trailAcc = 0; }

  function mote(x, y, z, cfg) {
    const i = moteNext++ % MOTES;
    const m = moteState[i];
    m.life = 0; m.dur = cfg.life * (0.8 + Math.random() * 0.4);
    m.x = x + (Math.random() - 0.5) * 0.35;
    m.y = y + (Math.random() - 0.5) * 0.3;
    m.z = z + (Math.random() - 0.5) * 0.35;
    m.rise = cfg.rise * (0.6 + Math.random() * 0.8);
    m.s = cfg.size * (0.6 + Math.random() * 0.7);
    m.tw = cfg.twinkle ? 1 : 0;
    if (cfg.hue) { hue = (hue + 0.07) % 1; tmpColor.setHSL(hue, 0.9, 0.6); }
    else tmpColor.setHex(cfg.color);
    motes.instanceColor.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    motes.instanceColor.needsUpdate = true;
  }

  /**
   * Called every frame while a stone is in the air. Emission is spaced by
   * DISTANCE, not time, so a fast stone leaves the same-looking ribbon as a
   * slow one and the pool never floods.
   */
  function emitTrail(x, y, z, travelled) {
    if (!trailKind) return;
    const cfg = TRAILS[trailKind];
    trailAcc += travelled;
    let guard = 6;
    while (trailAcc >= cfg.every && guard-- > 0) {
      trailAcc -= cfg.every;
      mote(x, y, z, cfg);
    }
    if (trailAcc > cfg.every * 8) trailAcc = 0;
  }

  /** Skip / entry splash. dirX,dirZ = travel direction so spray goes forwards. */
  function splash(x, z, strength = 0.6, dirX = 0, dirZ = 1, t = 0) {
    const s = clamp(strength, 0.1, 1);
    ripple(x, z, 1.8 + 5.2 * s, s, 0.85 + 0.5 * s);
    if (s > 0.45) ripple(x, z, 1.1 + 2.4 * s, s * 0.7, 0.6);
    // a bought splash throws a bit more spray, so the colour you paid for reads
    // from the shore instead of being three pixels of gold
    const tinted = splashRainbow || splashHex !== SPLASH_PLAIN;
    const n = Math.round((3 + 9 * s) * (tinted ? 1.45 : 1));
    const y0 = surfaceY(x, z, t, 3) + 0.05;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + 3.4 * s) * (0.5 + Math.random());
      drop(
        x, y0, z,
        Math.cos(a) * sp * 0.5 + dirX * sp * 0.85,
        (1.6 + 3.6 * s) * (0.55 + Math.random() * 0.7),
        Math.sin(a) * sp * 0.5 + dirZ * sp * 0.85,
        0.6 + Math.random() * 0.8
      );
    }
  }

  /** Final sink. */
  function plunk(x, z, strength = 0.7, t = 0) {
    const s = clamp(strength, 0.2, 1);
    ripple(x, z, 3.2 + 5 * s, s, 1.5);
    ripple(x, z, 1.6 + 2.4 * s, s * 0.8, 1.0);
    const y0 = surfaceY(x, z, t, 3);
    for (let i = 0; i < Math.round(6 + 10 * s); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + 2.2 * s) * (0.4 + Math.random());
      drop(x, y0, z, Math.cos(a) * sp, (2.4 + 3.4 * s) * (0.6 + Math.random() * 0.6), Math.sin(a) * sp,
        0.7 + Math.random() * 0.9);
    }
  }

  /** Dry-land thud: sand / dust coloured droplets. */
  function puff(x, y, z, strength = 0.6) {
    for (let i = 0; i < Math.round(5 + 8 * strength); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 * (0.4 + Math.random()) * (0.5 + strength);
      drop(x, y + 0.1, z, Math.cos(a) * sp, 1.4 + Math.random() * 1.8, Math.sin(a) * sp,
        0.8 + Math.random(), PUFF_SAND);
    }
  }

  const PARTY = [0xffd32a, 0x6c5ce7, 0xa29bfe, 0x3aa7ff, 0xff7ab6, 0x53e6a0];
  function celebrate(x, y, z, count = 70) {
    for (let i = 0; i < count; i++) {
      const c = confState[confNext++ % CONFETTI];
      c.life = 1.6 + Math.random() * 1.4;
      c.x = x + (Math.random() - 0.5) * 1.2;
      c.y = y + Math.random() * 0.8;
      c.z = z + (Math.random() - 0.5) * 1.2;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp;
      c.vy = 4.5 + Math.random() * 5.5;
      c.rx = Math.random() * 6; c.ry = Math.random() * 6; c.rz = Math.random() * 6;
      c.sp = 0.8 + Math.random() * 1.4;
      const idx = (confNext - 1) % CONFETTI;
      tmpColor.setHex(PARTY[(Math.random() * PARTY.length) | 0]);
      conf.instanceColor.setXYZ(idx, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    conf.instanceColor.needsUpdate = true;
  }

  // --- update ---------------------------------------------------------------
  function update(dt, t) {
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.life += dt;
      const u = r.life / r.dur;
      if (u >= 1) { r.m.visible = false; r.mat.opacity = 0; continue; }
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - u, 2.2));
      r.m.scale.set(s, 1, s);
      r.mat.opacity = 0.5 * r.strength * (1 - u) * (1 - u);
      r.m.position.y = 0.035 + surfaceY(r.m.position.x, r.m.position.z, t, 3);
    }

    let anyDrop = false;
    for (let i = 0; i < DROPS; i++) {
      const d = dropState[i];
      if (d.life <= 0) continue;
      anyDrop = true;
      d.life -= dt;
      d.vy -= 15 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.life <= 0 || d.y < -0.05) {
        d.life = 0;
        drops.setMatrixAt(i, HIDDEN);
        continue;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.setScalar(d.s * clamp(d.life * 2.2, 0.25, 1));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    }
    if (anyDrop) drops.instanceMatrix.needsUpdate = true;

    let anyMote = false;
    for (let i = 0; i < MOTES; i++) {
      const m = moteState[i];
      if (m.dur <= 0) continue;
      anyMote = true;
      m.life += dt;
      const u = m.life / m.dur;
      if (u >= 1) { m.dur = 0; motes.setMatrixAt(i, HIDDEN); continue; }
      m.y += m.rise * dt;
      dummy.position.set(m.x, m.y, m.z);
      dummy.rotation.set(m.life * 2.2, m.life * 3.1, 0);
      const tw = m.tw ? 0.6 + 0.4 * Math.sin(m.life * 26) : 1;
      dummy.scale.setScalar(m.s * (1 - u * u) * tw);
      dummy.updateMatrix();
      motes.setMatrixAt(i, dummy.matrix);
    }
    if (anyMote) motes.instanceMatrix.needsUpdate = true;

    let anyConf = false;
    for (let i = 0; i < CONFETTI; i++) {
      const c = confState[i];
      if (c.life <= 0) continue;
      anyConf = true;
      c.life -= dt;
      c.vy -= 9 * dt;
      c.vx *= 0.985; c.vz *= 0.985;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.life <= 0) { c.life = 0; conf.setMatrixAt(i, HIDDEN); continue; }
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(c.rx += dt * 3.1, c.ry += dt * 4.2, c.rz += dt * 2.3);
      dummy.scale.setScalar(c.sp * clamp(c.life, 0.2, 1));
      dummy.updateMatrix();
      conf.setMatrixAt(i, dummy.matrix);
    }
    if (anyConf) conf.instanceMatrix.needsUpdate = true;
  }

  return {
    group, ripple, splash, plunk, puff, celebrate, update,
    setSplash, setTrail, emitTrail, splashTint,
    get trail() { return trailKind; },
  };
}
