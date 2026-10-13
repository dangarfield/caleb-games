// Aerie decorations bought with gems. Rebuilt whenever one is bought; placed on the Aerie platform (radius ~30).
import * as THREE from 'three';
import { buildDragon } from './skyborn-bestiary.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.8, metalness: o.m ?? 0, flatShading: true, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide });
const placed = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const DRC = { Breeze: 0x6fbf7a, Ember: 0xe2602a, Frost: 0xbfe0f5, Storm: 0x6a3f9a, Tide: 0x2f9a8e, Gold: 0xe2b64a };

export function initDeco(G) {
  const world = G.world, top = world.props.aerieTop, root = new THREE.Group(); root.position.copy(top); world.scene.add(root);
  let anim = [], t0 = performance.now();
  const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  function build() {
    root.clear(); anim = []; const d = G.save.deco || {}, y = 0;
    if (d.flowers) { const box = std(0x7a5532), cols = [0xff6a8a, 0xffd04a, 0xffffff, 0xb06aff, 0xff8a3a];
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + 0.2, [x, z] = at(a, 27); const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -a;
        g.add(placed(new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 1.6), box), 0, 0.7, 0));
        for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), std(cols[(i + k) % 5])); f.position.set(-2 + k * 0.8, 1.7 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6); g.add(f); }
        root.add(g); } }
    if (d.topiary) { const leaf = std(0x4f8a3a); [[-0.9, 22], [2.2, 22], [3.9, 20]].forEach(([a, r]) => { const [x, z] = at(a, r), g = new THREE.Group(); g.position.set(x, y, z);
        g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.4, 8), std(0x9a6a4a)), 0, 0.7, 0));
        [[0, 3, 0, 1.8], [0, 4.6, 1.4, 1.1], [0, 5.4, 2.4, 0.7], [0, 3.4, -1.8, 1.0], [0, 3.6, -3.0, 0.6]].forEach(b => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(b[3], 1), leaf); m.position.set(b[0], b[1], b[2]); g.add(m); });
        [-1, 1].forEach(s => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 4), leaf); w.position.set(s * 1.6, 4, 0); w.rotation.z = s * 1.1; g.add(w); });
        g.rotation.y = a; root.add(g); }); }
    if (d.bunting) { const cols = [0xff4a4a, 0xffd04a, 0x4ab0ff, 0x6fdc6a, 0xff8ad0];
      for (let i = 0; i < 4; i++) { const a0 = i / 4 * 6.283 + 0.4, a1 = a0 + 6.283 / 4, [x0, z0] = at(a0, 30), [x1, z1] = at(a1, 30);
        for (let k = 1; k < 12; k++) { const t = k / 12, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yy = y + 30 - Math.sin(t * Math.PI) * 5; const f = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 3), std(cols[k % 5], { side: THREE.DoubleSide })); f.position.set(x, yy - 1, z); f.rotation.x = Math.PI; root.add(f); anim.push(tt => { f.rotation.z = Math.sin(tt * 3 + k + i) * 0.25; }); } } }
    if (d.lanterns) { const glowM = std(0xffd890, { e: 0xffa040, ei: 1.6 });
      for (let i = 0; i < 4; i++) { const a0 = i / 4 * 6.283 + 1.2, a1 = a0 + 6.283 / 4, [x0, z0] = at(a0, 24), [x1, z1] = at(a1, 24);
        for (let k = 1; k < 7; k++) { const t = k / 7, l = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), glowM); l.position.set(x0 + (x1 - x0) * t, y + 18 - Math.sin(t * Math.PI) * 3, z0 + (z1 - z0) * t); root.add(l); } }
      anim.push(tt => { glowM.emissiveIntensity = 1.4 + Math.sin(tt * 4) * 0.25; }); }
    if (d.banners) { G.save.dragons.forEach((n, i) => { const a = Math.PI + (i - (G.save.dragons.length - 1) / 2) * 0.35, [x, z] = at(a, 31), g = new THREE.Group(); g.position.set(x, y, z);
        g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 22, 6), std(0x5a3a22)), 0, 11, 0));
        const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 9, 1, 4), std(DRC[n] || 0xffffff, { side: THREE.DoubleSide })); b.position.set(0, 16, 0.5); g.add(b);
        const em = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), std(0xfff4d8, { side: THREE.DoubleSide })); em.position.set(0, 17, 0.55); g.add(em);
        g.rotation.y = -a + Math.PI / 2; root.add(g); anim.push(tt => { b.rotation.y = Math.sin(tt * 1.5 + i) * 0.2; }); }); }
    if (d.vane) { const g = new THREE.Group(); g.position.set(-12, 21 + 6, 8); g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), std(0x3a3a40, { m: 0.5 })), 0, 2.5, 0));
      const v = new THREE.Group(); v.position.y = 5; const dr = buildDragon('Gold', { noRider: true }); dr.scale.setScalar(0.6); dr.traverse(o => { if (o.isMesh) o.material = std(0xd4a845, { m: 0.6, r: 0.3 }); }); v.add(dr); g.add(v); root.add(g); anim.push(tt => { v.rotation.y = Math.sin(tt * 0.4) * 2.5; }); }
    if (d.fountain) { const st = std(0xbab0a0), wat = std(0x7fd6ff, { e: 0x3a9ac8, ei: 0.4 }), g = new THREE.Group(); g.position.set(14, y, 10);
      g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 1.6, 16), st), 0, 0.8, 0)); g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.3, 16), wat), 0, 1.5, 0));
      g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 4, 8), st), 0, 3, 0)); g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(2, 1.2, 0.8, 12), st), 0, 5, 0));
      const drops = []; for (let k = 0; k < 16; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), wat); g.add(m); drops.push([m, Math.random()]); }
      anim.push(tt => drops.forEach(([m, o], k) => { const p = (tt * 0.8 + o) % 1, a = k / 16 * 6.283; m.position.set(Math.cos(a) * p * 3.6, 5.6 + p * 2.6 - p * p * 6, Math.sin(a) * p * 3.6); })); root.add(g); }
    if (d.statue) { const dr = buildDragon('Ember', { noRider: true }); dr.userData.update(0, { pose: 'perch' }); const gold = std(0xf0c24a, { m: 0.65, r: 0.25 }); dr.traverse(o => { if (o.isMesh) o.material = gold; });
      dr.scale.setScalar(2.4); dr.position.set(-16, y + 4.2, -12); dr.rotation.y = 0.8; root.add(dr); root.add(placed(new THREE.Mesh(new THREE.BoxGeometry(9, 3, 9), std(0x8e8270)), -16, y + 1.5, -12)); }
    if (d.treasure) { const g = new THREE.Group(); g.position.set(6, y, -18); const gold = std(0xf0c24a, { m: 0.6, r: 0.3 });
      g.add(placed(new THREE.Mesh(new THREE.SphereGeometry(4, 14, 8, 0, 6.283, 0, 1.4), gold), 0, -0.6, 0));
      const gc = [0xff4a6a, 0x4ad8ff, 0x6aff8a, 0xb06aff]; for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), std(gc[k % 4], { e: gc[k % 4], ei: 0.3 })); const a = Math.random() * 6.283, r = Math.random() * 3; m.position.set(Math.cos(a) * r, 1.2 + Math.random() * 1.6, Math.sin(a) * r); g.add(m); }
      const chest = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.4), std(0x7a5532)); chest.position.set(3.5, 1.1, 1.5); g.add(chest); root.add(g); }
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  // Fireworks when landing home (only if bought): rockets rise in front of the camera and burst into glowing stars.
  const GLOW = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const spr = (c, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.scale.setScalar(s); return m; };
  const sparks = [], rockets = [];
  function fireworks() {
    if (!(G.save.deco || {}).fireworks) return false;
    world.fly.showCam = 1; clearTimeout(fireworks._t); fireworks._t = setTimeout(() => { world.fly.showCam = 0; }, 5200);
    const cam = world.camera, fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const COLS = [0xff5a5a, 0xffd04a, 0x6ab8ff, 0x8aff8a, 0xff8ad0, 0xffffff, 0xc89aff];
    for (let b = 0; b < 8; b++) setTimeout(() => {
      const from = top.clone().addScaledVector(side, (Math.random() - 0.5) * 40).add(new THREE.Vector3(0, 6, 0));
      const to = top.clone().addScaledVector(fwd, 30 + Math.random() * 60).addScaledVector(side, (Math.random() - 0.5) * 170); to.y = top.y + 70 + Math.random() * 70;
      const r = spr(0xfff0c0, 4); r.position.copy(from); world.scene.add(r); rockets.push({ m: r, from, to, t: 0, dur: 0.9 + Math.random() * 0.3, c: COLS[(Math.random() * COLS.length) | 0], c2: COLS[(Math.random() * COLS.length) | 0] });
      G.sfx && G.sfx.flap && G.sfx.flap();
    }, b * 380 + Math.random() * 150);
    return true;
  }
  function burst(p, c, c2) {
    for (let k = 0; k < 70; k++) { const m = spr(k % 3 ? c : c2, 3.2 + Math.random() * 2); m.position.copy(p); const v = new THREE.Vector3().randomDirection().multiplyScalar(26 + Math.random() * 14); world.scene.add(m); sparks.push({ m, v, life: 1.6 + Math.random() * 0.6, max: 2.2, trail: 0 }); }
    const flashS = spr(0xffffff, 60); flashS.position.copy(p); world.scene.add(flashS); sparks.push({ m: flashS, v: new THREE.Vector3(), life: 0.25, max: 0.25, flash: true });
    G.sfx && G.sfx.boom && G.sfx.boom();
  }
  function update(dt) {
    const tt = (performance.now() - t0) / 1000; anim.forEach(f => f(tt));
    for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.t += dt / r.dur; const k = Math.min(1, r.t), e = 1 - Math.pow(1 - k, 2); r.m.position.lerpVectors(r.from, r.to, e); r.m.position.x += Math.sin(k * 12) * 1.5;
      if (Math.random() < 0.8) { const t = spr(0xffc070, 2.2); t.position.copy(r.m.position); world.scene.add(t); sparks.push({ m: t, v: new THREE.Vector3((Math.random() - 0.5) * 3, -4, (Math.random() - 0.5) * 3), life: 0.5, max: 0.5 }); }
      if (k >= 1) { world.scene.remove(r.m); rockets.splice(i, 1); burst(r.to, r.c, r.c2); } }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; if (!s.flash) { s.v.y -= 9 * dt; s.v.multiplyScalar(0.975); s.m.position.addScaledVector(s.v, dt); }
      const a = Math.max(0, s.life / s.max); s.m.material.opacity = s.flash ? a * 0.8 : Math.min(1, a * 1.4) * (0.75 + Math.random() * 0.25); if (s.life <= 0) { world.scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); } }
  }
  return { build, update, fireworks };
}
