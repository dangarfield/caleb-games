// Pedestrians for the 3D town: walk the pavements along the road graph, jump clear of the fire engine, then walk back and carry on.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadPeople } from './city-assets.js';

const O = 6.0, Y0 = 0.1, CLEAR = 1.7;
const DIRS = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }, BACK = { E: 'W', W: 'E', S: 'N', N: 'S' };

export async function createPedestrians(c, root, { count = 45, near = null, off, rnd = Math.random } = {}) {
  const adj = new Map();
  for (const s of c.segs || []) {
    if (s.bridge) continue;
    const add = (n, m) => { const d = m.x > n.x ? 'E' : m.x < n.x ? 'W' : m.z > n.z ? 'S' : 'N'; (adj.get(n.id) || adj.set(n.id, []).get(n.id)).push({ to: m, d }); };
    add(s.a, s.b); add(s.b, s.a);
  }
  const segs = (c.segs || []).filter(s => !s.bridge && s.L > 30);
  if (!segs.length) return null;
  const list = (await (await fetch('../_shared/assets/people/index.json')).json()).filter(e => e.street).map(e => e.id);
  const pick = [...list].sort(() => rnd() - 0.5).slice(0, 12);
  const lib = await loadPeople('../_shared/assets/', pick);
  const W = (x, z) => new THREE.Vector3(x - off.x, Y0, z - off.z);
  const corner = (n, qx, qz) => W(n.x + qx * O, n.z + qz * O);
  const peds = [];

  function plan(p) {
    const opts = adj.get(p.node.id) || [];
    let ch = opts.filter(o => o.d !== BACK[p.lastD]); if (!ch.length) ch = opts;
    if (!ch.length) return;
    const e = ch[Math.floor(rnd() * ch.length)], [dx, dz] = DIRS[e.d];
    if (dx) { if (p.qx !== dx) p.path.push(corner(p.node, dx, p.qz)); p.qx = -dx; }
    else { if (p.qz !== dz) p.path.push(corner(p.node, p.qx, dz)); p.qz = -dz; }
    p.path.push(corner(e.to, p.qx, p.qz)); p.node = e.to; p.lastD = e.d;
  }
  const play = (p, act, fade = 0.15) => { if (p.cur === act) return; act.reset().play(); if (p.cur) p.cur.crossFadeTo(act, fade, false); p.cur = act; };

  const nearSegs = near ? segs.filter(s => Math.hypot(s.a.x - near.x, s.a.z - near.z) < 260) : [];
  for (let i = 0; i < count; i++) {
    const pool = nearSegs.length && i < count * 0.4 ? nearSegs : segs;
    const s = pool[Math.floor(rnd() * pool.length)], id = pick[i % pick.length], src = lib.get(id); if (!src) continue;
    const o = SkeletonUtils.clone(src.scene); o.traverse(m => { if (m.isMesh) m.castShadow = false; }); root.add(o);
    const mx = new THREE.AnimationMixer(o), clip = n => src.clips.find(k => k.name === n);
    const walk = mx.clipAction(clip('Walk') || src.clips[0]), idle = mx.clipAction(clip('Idle') || src.clips[0]), jump = mx.clipAction(clip('Jump') || clip('Roll') || src.clips[0]);
    jump.setLoop(THREE.LoopOnce, 1); jump.clampWhenFinished = true;
    const speed = 1.1 + rnd() * 0.5; walk.timeScale = speed / 1.3;
    const fwd = rnd() < 0.5, from = fwd ? s.a : s.b, to = fwd ? s.b : s.a, d = to.x > from.x ? 'E' : to.x < from.x ? 'W' : to.z > from.z ? 'S' : 'N';
    const side = rnd() < 0.5 ? -1 : 1, [dx, dz] = DIRS[d];
    const p = { o, mx, walk, idle, jump, cur: null, speed, node: to, lastD: d, qx: dx ? -dx : side, qz: dz ? -dz : side, path: [], state: 'walk', t: 0 };
    const a = corner(from, dx ? dx : side, dz ? dz : side), b = corner(to, p.qx, p.qz);
    o.position.lerpVectors(a, b, 0.1 + rnd() * 0.8); p.path.push(b);
    play(p, walk, 0); walk.time = rnd() * walk.getClip().duration;
    peds.push(p);
  }

  const v = new THREE.Vector3(), f = new THREE.Vector3(), r = new THREE.Vector3();
  function update(dt, { fast = false, camera, engine, moving, vel, heading, hw = 1.3, hl = 4.2 }) {
    if (moving) { const sg = Math.sign(vel) || 1; f.set(Math.sin(heading) * sg, 0, Math.cos(heading) * sg); r.set(f.z, 0, -f.x); }
    for (let pi = 0; pi < peds.length; pi++) { const p = peds[pi];
      if (fast && pi % 3) { p.o.visible = false; continue; } // Fast mode: a third of the pedestrians
      const pos = p.o.position;
      if (moving && p.state !== 'jump') {
        v.subVectors(pos, engine.position); v.y = 0;
        const ahead = v.dot(f), lat = v.dot(r), win = hl + Math.max(8, Math.abs(vel) * 1.3);
        if (ahead > -hl - 0.5 && ahead < win && Math.abs(lat) < hw + CLEAR - 0.2) {
          const side = Math.sign(lat) || (Math.random() < 0.5 ? -1 : 1), n = r.clone().multiplyScalar(side);
          if (p.state === 'walk') p.home = pos.clone();
          p.state = 'jump'; p.t = 0; p.from = pos.clone(); p.to = pos.clone().addScaledVector(n, Math.max(1.4, hw + CLEAR - Math.abs(lat)) * 1.5);
          p.o.rotation.y = Math.atan2(n.x, n.z);
          p.dur = Math.min(1.1, Math.max(0.55, p.jump.getClip().duration * 0.9)); p.jump.timeScale = p.jump.getClip().duration / (p.dur / 0.9);
          play(p, p.jump, 0.08);
        }
      }
      if (p.state === 'jump') {
        p.t += dt; const k = Math.min(1, p.t / p.dur), e = 1 - Math.pow(1 - k, 3);
        pos.lerpVectors(p.from, p.to, e);
        if (k >= 1) { p.state = 'wait'; p.t = 0; play(p, p.idle, 0.2); }
      } else if (p.state === 'wait') {
        p.t += dt;
        const gone = !moving || engine.position.distanceTo(pos) > hl + 6;
        if (p.t > 0.8 && gone) { p.state = 'walk'; p.path.unshift(p.home); play(p, p.walk); }
      } else {
        if (!p.path.length) plan(p);
        const tgt = p.path[0];
        if (tgt) {
          v.subVectors(tgt, pos); v.y = 0; const dist = v.length(), step = p.speed * dt;
          if (dist <= step) { pos.copy(tgt); p.path.shift(); }
          else { pos.addScaledVector(v, step / dist); const want = Math.atan2(v.x, v.z); let dr = want - p.o.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.o.rotation.y += dr * Math.min(1, dt * 10); }
        }
      }
      if (moving) { // hard guarantee: never inside the engine's footprint
        v.subVectors(pos, engine.position); v.y = 0; const ahead = v.dot(f), lat = v.dot(r);
        if (Math.abs(ahead) < hl + 0.3 && Math.abs(lat) < hw + 0.3) pos.addScaledVector(r, (Math.sign(lat) || 1) * (hw + 0.3) - lat);
      }
      const vis = camera.position.distanceToSquared(pos) < (fast ? 80 : 200) ** 2;
      p.o.visible = vis; if (vis) p.mx.update(dt);
    }
  }
  return { peds, update, count: peds.length };
}
