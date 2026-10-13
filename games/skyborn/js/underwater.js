// Sunken Reach seabed set dressing: coral, kelp, rocks, fish, jellyfish, a few sunken houses and wrecks, the Lost Bell, bubbles.
import * as THREE from 'three';
import { height, weights, toWorld, place } from './skyborn-worldgen.js';

let sd = 4242; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.85, metalness: o.m ?? 0, flatShading: true, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide, transparent: !!o.t, opacity: o.op ?? 1 });
const B = { u0: 0.32, u1: 0.93, v0: 0.3, v1: 0.93 };
function seaSpot(minDepth = -12) { for (let a = 0; a < 40; a++) { const u = B.u0 + rnd() * (B.u1 - B.u0), v = B.v0 + rnd() * (B.v1 - B.v0), h = height(u, v); if (h < minDepth && weights(u, v)[4] > 0.5) { const [x, z] = toWorld(u, v); return [x, h, z]; } } return null; }

export function buildUnderwater(scene) {
  const root = new THREE.Group(); root.name = 'underwater'; scene.add(root);
  const put = (im, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => { E.set(rx, ry, rz); Q.setFromEuler(E); M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)); im.setMatrixAt(i, M4); };
  const uTime = { value: 0 };
  // Coral heads + branch coral
  const CORAL = [0xff6f91, 0xff9a5a, 0xb07cff, 0xffd25a, 0x5fd6c0, 0xff5a7a];
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std(0xffffff, { r: 0.7 }), 900);
  const branches = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 4, 5).translate(0, 2, 0), std(0xffffff, { r: 0.7 }), 700);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std(0x6a7a80), 260);
  let nh = 0, nb = 0, nr = 0;
  for (let a = 0; a < 2200; a++) { const s = seaSpot(); if (!s) continue; const [x, y, z] = s;
    if (nh < 900 && rnd() < 0.55) { const r = 1.5 + rnd() * 4; put(heads, nh, x, y + r * 0.3, z, r * 1.2, r * 0.8, r, rnd() * 6); heads.setColorAt(nh++, C.setHex(CORAL[(rnd() * CORAL.length) | 0])); }
    if (nb < 700 && rnd() < 0.5) { for (let k = 0; k < 3 && nb < 700; k++) { const sc = 0.8 + rnd() * 1.4; put(branches, nb, x + (rnd() - 0.5) * 6, y, z + (rnd() - 0.5) * 6, sc, sc * (0.8 + rnd()), sc, rnd() * 6, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6); branches.setColorAt(nb++, C.setHex(CORAL[(rnd() * CORAL.length) | 0])); } }
    if (nr < 260 && rnd() < 0.15) { const r = 2 + rnd() * 7; put(rocks, nr++, x, y + r * 0.2, z, r * 1.3, r * 0.7, r, rnd() * 6); } }
  heads.count = nh; branches.count = nb; rocks.count = nr;
  // Kelp that sways (shader bends the tops)
  const kelpMat = std(0x3f8a4a, { side: THREE.DoubleSide, r: 0.9 });
  kelpMat.onBeforeCompile = sh => { sh.uniforms.uTime = uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float kh = position.y * position.y; transformed.x += sin(uTime * 1.2 + instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.03) * kh * 0.35; transformed.z += cos(uTime * 0.9 + instanceMatrix[3].z * 0.04) * kh * 0.2;'); };
  const kelp = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 1, 1, 6).translate(0, 0.5, 0), kelpMat, 900); let nk = 0;
  for (let a = 0; a < 1600 && nk < 900; a++) { const s = seaSpot(-16); if (!s) continue; const [x, y, z] = s, n = 2 + ((rnd() * 4) | 0); for (let k = 0; k < n && nk < 900; k++) { const hgt = (-y) * (0.5 + rnd() * 0.4); put(kelp, nk++, x + (rnd() - 0.5) * 8, y, z + (rnd() - 0.5) * 8, 1 + rnd(), hgt, 1, rnd() * 6); } }
  kelp.count = nk;
  [heads, branches, rocks, kelp].forEach(m => { m.receiveShadow = true; root.add(m); });
  // Sunken houses (a few round the bell, the rest scattered) and wrecks
  const wall = std(0xb8b2a0), roof = std(0x4a7a80), wood = std(0x5a4030), bronze = std(0xc08a3a, { m: 0.6, r: 0.35, e: 0x3a2008, ei: 0.6 });
  const house = (x, z, s = 1) => { const y = height(...toUVxz(x, z)), g = new THREE.Group(); g.position.set(x, y - 1, z); g.rotation.set((rnd() - 0.5) * 0.25, rnd() * 6, (rnd() - 0.5) * 0.25);
    const w = new THREE.Mesh(new THREE.BoxGeometry(10 * s, 7 * s, 12 * s), wall); w.position.y = 3.5 * s; g.add(w);
    if (rnd() < 0.7) { const r = new THREE.Mesh(new THREE.CylinderGeometry(7 * s, 7 * s, 13 * s, 3).rotateX(-Math.PI / 2), roof); r.position.y = 9 * s; r.rotation.z = (rnd() - 0.5) * 0.4; g.add(r); }
    root.add(g); };
  const toUVxz = (x, z) => [x / 14400, z / 7500];
  const bell = place('reach_bell');
  if (bell) { const [bx, bz] = toWorld(bell.u, bell.v), by = height(bell.u, bell.v);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + rnd(), r = 40 + rnd() * 40; house(bx + Math.cos(a) * r, bz + Math.sin(a) * r, 0.8 + rnd() * 0.5); }
    const arch = new THREE.Group(); arch.position.set(bx, by, bz);
    [-1, 1].forEach(sx => { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 3), wall); p.position.set(sx * 7, 9, 0); arch.add(p); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(18, 2.5, 3.5), wall); beam.position.y = 18.5; arch.add(beam);
    const b = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [3.4, 0], [3.2, 0.6], [2.6, 2], [2.2, 4], [1.8, 5.6], [0.6, 6.2], [0, 6.3]].map(p => new THREE.Vector2(p[0], p[1])), 18), bronze); b.position.y = 10.5; arch.add(b);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.y = 13; arch.add(glow); arch.userData.glow = glow;
    root.add(arch); root.userData.bell = arch; }
  for (let i = 0; i < 9; i++) { const s = seaSpot(-25); if (s) house(s[0], s[2], 0.7 + rnd() * 0.6); }
  for (let i = 0; i < 7; i++) { const s = seaSpot(-25); if (!s) continue; const g = new THREE.Group(); g.position.set(s[0], s[1] + 2, s[2]); g.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6, 0.5 + rnd() * 0.5);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 32), wood); g.add(hull); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 22, 5), wood); mast.position.y = 12; mast.rotation.z = 0.3; g.add(mast); root.add(g); }
  // Fish schools and jellyfish
  const fishMat = std(0xffffff, { r: 0.5 }), FISH = [0xffb040, 0x5fc8ff, 0xff6f91, 0xf2f2f2, 0xffe04a];
  const schools = []; for (let i = 0; i < 16; i++) { const s = seaSpot(-20); if (s) schools.push({ c: new THREE.Vector3(s[0], s[1] * 0.5, s[2]), r: 14 + rnd() * 20, sp: 0.3 + rnd() * 0.4, ph: rnd() * 6, col: FISH[i % FISH.length], n: 10 + ((rnd() * 8) | 0) }); }
  const fishN = schools.reduce((a, s) => a + s.n, 0), fish = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 3, 5).rotateX(Math.PI / 2), fishMat, fishN); let fi = 0;
  schools.forEach(s => { s.i0 = fi; for (let k = 0; k < s.n; k++) fish.setColorAt(fi++, C.setHex(s.col)); }); fish.frustumCulled = false; root.add(fish);
  const jellyMat = new THREE.MeshBasicMaterial({ color: 0xc8a0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const jellies = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 12, 8, 0, 6.283, 0, 1.6), jellyMat, 60), jl = []; for (let i = 0; i < 60; i++) { const s = seaSpot(-14); if (s) jl.push([s[0], s[1] * (0.3 + rnd() * 0.5), s[2], rnd() * 6]); }
  jellies.count = jl.length; jellies.frustumCulled = false; root.add(jellies);
  // Bubbles from the dragon
  const bubMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.6, depthWrite: false }), bubs = [];
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bubMat); m.visible = false; root.add(m); bubs.push({ m, life: 0 }); }
  let bubT = 0; const center = new THREE.Vector3(...[toWorld(0.62, 0.62)[0], 0, toWorld(0.62, 0.62)[1]]);
  return { root, update(dt, t, cam, dragonPos, under, swimming) {
    uTime.value = t; if (cam.position.distanceTo(center) > 9000) { root.visible = false; return; } root.visible = true;
    for (const s of schools) for (let k = 0; k < s.n; k++) { const a = t * s.sp + s.ph + k * 0.35, y = s.c.y + Math.sin(a * 2 + k) * 3; put(fish, s.i0 + k, s.c.x + Math.cos(a) * s.r + Math.sin(k * 7) * 3, y, s.c.z + Math.sin(a) * s.r + Math.cos(k * 5) * 3, 1, 1, 1, -a); }
    fish.instanceMatrix.needsUpdate = true;
    jl.forEach((j, i) => { const p = 1 + Math.sin(t * 2 + j[3]) * 0.15; put(jellies, i, j[0], j[1] + Math.sin(t * 0.5 + j[3]) * 4, j[2], p, 1 / p, p); }); jellies.instanceMatrix.needsUpdate = true;
    if (root.userData.bell) root.userData.bell.userData.glow.material.opacity = 0.18 + Math.sin(t * 2) * 0.1;
    bubT -= dt; if (under && swimming && dragonPos && bubT <= 0) { bubT = 0.08; const b = bubs.find(o => o.life <= 0); if (b) { b.m.position.copy(dragonPos).add(V.set((rnd() - 0.5) * 4, 2, (rnd() - 0.5) * 4)); b.life = 2; b.m.visible = true; b.m.scale.setScalar(0.5 + rnd()); } }
    bubs.forEach(b => { if (b.life <= 0) return; b.life -= dt; b.m.position.y += 9 * dt; b.m.position.x += Math.sin(t * 6 + b.life * 5) * 0.05; if (b.life <= 0 || b.m.position.y > 0) { b.life = 0; b.m.visible = false; } });
  } };
}
