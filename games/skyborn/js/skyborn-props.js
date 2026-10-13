// Emberreach set dressing: trees, clouds, landmarks, towers, air currents. Shares the worldgen heightmap.
import * as THREE from 'three';
import { height, weights, forestAt, toWorld, toUV, LANDMARKS, WIND, SKY_ISLES, LAKE, RIVER, hash2, SKY_ISLE_LIST } from './skyborn-worldgen.js';

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.85, metalness: o.m ?? 0, flatShading: o.flat ?? true, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide });
const H = (x, z) => { const [u, v] = toUV(x, z); return height(u, v); };
const L = id => { const l = LANDMARKS.find(m => m.id === id); const [x, z] = toWorld(l.u, l.v); return { x, z, y: H(x, z) }; };
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
function put(im, i, x, y, z, sx, sy, sz, ry = 0, rx = 0) { E.set(rx, ry, 0); Q.setFromEuler(E); M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)); im.setMatrixAt(i, M4); }
function rockify(g, amt) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = hash2(Math.round(x * 7 + y * 3), Math.round(z * 7 - y * 5)); p.setXYZ(i, x * (1 + (n - 0.5) * amt), y, z * (1 + (n - 0.5) * amt)); } g.computeVertexNormals(); return g; }

const ribbonMat = (col, op, vert = 0, freq = 140) => new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, col: { value: new THREE.Color(col) }, op: { value: op }, vert: { value: vert }, freq: { value: freq } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); \n#include <logdepthbuf_vertex>\n}',
  fragmentShader: '#include <logdepthbuf_pars_fragment>\nvarying vec2 vUv; uniform float t, op, vert, freq; uniform vec3 col; void main(){ \n#include <logdepthbuf_fragment>\n float along = mix(vUv.x, vUv.y, vert); float across = mix(vUv.y, vUv.x, vert); float s = fract(along*freq - t*1.2 + sin(across*18.0)*0.15); float a = smoothstep(0.0,0.5,s)*smoothstep(1.0,0.5,s); float e = vert > 0.5 ? sin(vUv.y*3.14159) : sin(vUv.y*3.14159); gl_FragColor = vec4(col, a*op*e); }'
});

export function buildProps(scene) {
  const anim = [], root = new THREE.Group(); scene.add(root);
  const stone = std(0xb3a58c), darkStone = std(0x7d7364), wood = std(0x7a5532), white = std(0xf1ece2), roofRed = std(0xa8452f), rock = std(0x8a7f70);
  const glowMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  const broadG = new THREE.IcosahedronGeometry(5.5, 0); broadG.translate(0, 8, 0);

  // Clouds
  const puffG = new THREE.IcosahedronGeometry(1, 1), cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.18 });
  const clouds = new THREE.InstancedMesh(puffG, cloudMat, 2600); let nc = 0;
  const cloud = (x, y, z, size, puffs) => { for (let i = 0; i < puffs && nc < 2600; i++) { const r = size * (0.45 + rnd() * 0.55); put(clouds, nc++, x + (rnd() - 0.5) * size * 2.6, y + (rnd() - 0.3) * size * 0.5, z + (rnd() - 0.5) * size * 1.4, r * 1.25, r * 0.8, r); } };
  for (let i = 0; i < 230; i++) { const [x, z] = toWorld(rnd() * 2.2 - 1.1, rnd() * 2.2 - 1.1); cloud(x, 1100 + rnd() * 700, z, 90 + rnd() * 140, 8); }
  const [sx0, sz0] = toWorld(SKY_ISLES.u, SKY_ISLES.v);
  for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, r = 600 + rnd() * 2600; cloud(sx0 + Math.cos(a) * r * 1.4, SKY_ISLES.alt - 380 + rnd() * 80, sz0 + Math.sin(a) * r * 0.7, 160 + rnd() * 160, 9); }
  clouds.count = nc; root.add(clouds);
  const storm = new THREE.InstancedMesh(puffG, new THREE.MeshLambertMaterial({ color: 0x4a4858, flatShading: true }), 900); let ns = 0;
  for (let i = 0; i < 95 && ns < 890; i++) { const [x, z] = toWorld(0.35 + rnd() * 0.65, -1 + rnd() * 0.8); for (let k = 0; k < 9; k++) { const r = 160 + rnd() * 200; put(storm, ns++, x + (rnd() - 0.5) * 700, 1900 + rnd() * 200, z + (rnd() - 0.5) * 400, r * 1.4, r * 0.6, r); } }
  storm.count = ns; root.add(storm);
  anim.push(t => { clouds.position.x = Math.sin(t * 0.02) * 200; });

  // Dragon towers
  const towers = [];
  const tower = (x, z, lit, base = H(x, z), hgt = 46) => {
    if (globalThis.SKYBORN_GAME) lit = false;
    const g = new THREE.Group(); g.position.set(x, base, z);
    g.add(new THREE.Mesh(rockify(new THREE.CylinderGeometry(6, 7.5, hgt, 10, 4), 0.08), stone));
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 2.4), stone); const a = i / 8 * 6.28; b.position.set(Math.cos(a) * 6, hgt / 2 + 1.5, Math.sin(a) * 6); g.add(b); }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 1.6, 3, 10), darkStone); bowl.position.y = hgt / 2 + 3; g.add(bowl);
    if (lit) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 8), new THREE.MeshBasicMaterial({ color: 0xffc24a })); flame.position.y = hgt / 2 + 7; g.add(flame);
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 6000, 16, 1, true), glowMat(0xffd27a)); p1.position.y = hgt / 2 + 3000; g.add(p1);
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 6000, 12, 1, true), glowMat(0xfff1c8)); p2.position.y = hgt / 2 + 3000; p2.material.opacity = 0.55; g.add(p2);
      anim.push(t => { flame.scale.set(1, 1 + Math.sin(t * 9 + x) * 0.15, 1); p1.material.opacity = 0.24 + Math.sin(t * 1.7 + z) * 0.06; });
    } else {
      const wisp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xcfeaff })); const halo = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 10), glowMat(0x9fd2ff));
      g.add(wisp); g.add(halo); anim.push(t => { const y = hgt / 2 + 9 + Math.sin(t * 1.5) * 2; wisp.position.y = halo.position.y = y; halo.scale.setScalar(1 + Math.sin(t * 2.3) * 0.2); });
    }
    g.traverse(o => { if (o.isMesh && !o.material.blending) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.top = base + hgt / 2 + 3; g.userData.anim = true; towers.push({ x, z, top: base + hgt / 2 + 4, g }); root.add(g); return g;
  };

  // The Aerie
  const aer = L('aerie'), spireH = 240;
  const spire = new THREE.Mesh(rockify(new THREE.CylinderGeometry(26, 52, spireH, 11, 10), 0.22), rock); spire.position.set(aer.x, aer.y + spireH / 2 - 10, aer.z); spire.castShadow = spire.receiveShadow = true; root.add(spire);
  const topY = aer.y + spireH - 10;
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(34, 30, 8, 14), stone); plat.position.set(aer.x, topY + 4, aer.z); root.add(plat);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 1, 14), std(0x86ad52)); grass.position.set(aer.x, topY + 8.4, aer.z); root.add(grass);
  const nest = new THREE.Mesh(new THREE.TorusGeometry(11, 3.6, 8, 18), std(0x9b7a45)); nest.rotation.x = Math.PI / 2; nest.position.set(aer.x + 8, topY + 10, aer.z - 6); root.add(nest);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 12), white); hut.position.set(aer.x - 12, topY + 13.5, aer.z + 8); root.add(hut);
  const hutRoof = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 16, 3), roofRed); hutRoof.rotation.z = Math.PI / 2; hutRoof.position.set(aer.x - 12, topY + 21, aer.z + 8); root.add(hutRoof);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * 6.28 + 0.4, px = aer.x + Math.cos(a) * 30, pz = aer.z + Math.sin(a) * 30;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 5), wood); pole.position.set(px, topY + 21, pz); root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(10, 5, 6, 1), std(i % 2 ? 0xd9502e : 0xf2b84a, { side: THREE.DoubleSide, flat: false })); flag.userData.anim = true; flag.position.set(px + 5, topY + 31, pz); root.add(flag);
    const base = Float32Array.from(flag.geometry.attributes.position.array);
    anim.push(t => { const p = flag.geometry.attributes.position; for (let k = 0; k < p.count; k++) { const bx = base[k * 3] + 5; p.setZ(k, Math.sin(t * 5 + bx * 0.6 + i) * 0.5 * bx / 10); } p.needsUpdate = true; });
  }
  [spire, plat, hut, hutRoof, nest].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

  // Old Kingsbridge
  const kb = L('tower_bridge'), rdx = (RIVER[3][0] - RIVER[2][0]) * 2400, rdz = (RIVER[3][1] - RIVER[2][1]) * 1250, rang = Math.atan2(rdx, rdz);
  const shp = new THREE.Shape(); shp.moveTo(-120, 0); shp.lineTo(120, 0); shp.lineTo(120, 56); shp.lineTo(-120, 56); shp.closePath();
  [-70, 0, 70].forEach(cx => { const hole = new THREE.Path(); hole.moveTo(cx - 26, -1); hole.lineTo(cx + 26, -1); hole.lineTo(cx + 26, 22); hole.absarc(cx, 22, 26, 0, Math.PI, false); hole.lineTo(cx - 26, -1); shp.holes.push(hole); });
  const bridge = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 16, bevelEnabled: false }), stone);
  bridge.geometry.translate(0, 0, -8); bridge.position.set(kb.x, -8, kb.z); bridge.rotation.y = rang + Math.PI / 2; bridge.castShadow = bridge.receiveShadow = true; root.add(bridge);
  tower(kb.x + Math.cos(rang) * 150, kb.z - Math.sin(rang) * 150, true);

  // Castle Isle
  const [lx, lz] = toWorld(LAKE.u, LAKE.v), ly = 12;
  [[0, -34, 70, 6], [0, 34, 70, 6], [-34, 0, 6, 70], [34, 0, 6, 70]].forEach((w, i) => { const hh = [16, 10, 14, 7][i]; const m = new THREE.Mesh(new THREE.BoxGeometry(w[2], hh, w[3]), stone); m.position.set(lx + w[0], ly + hh / 2, lz + w[1]); m.castShadow = true; root.add(m); });
  [[-34, -34, 30], [34, -34, 22], [-34, 34, 18], [34, 34, 34]].forEach(c => { const m = new THREE.Mesh(rockify(new THREE.CylinderGeometry(7, 8, c[2], 10), 0.06), stone); m.position.set(lx + c[0], ly + c[2] / 2, lz + c[1]); m.castShadow = true; root.add(m); });
  tower(lx, lz, true, ly, 64);

  const ss = L('seastack'); const stack = new THREE.Mesh(rockify(new THREE.CylinderGeometry(20, 30, 110, 9, 5), 0.2), rock); stack.position.set(ss.x, 40, ss.z); stack.castShadow = true; root.add(stack);
  tower(ss.x, ss.z, false, 95);

  // Cinder Peaks: lava, ash plume, the Bone Field
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff5a14, emissiveIntensity: 1.4, roughness: 0.6, flatShading: true });
  const [c0x, c0z] = toWorld(-1, 0.1), [c1x, c1z] = toWorld(-0.2, 1);
  const lg = new THREE.PlaneGeometry(c1x - c0x, c1z - c0z, 90, 70); lg.rotateX(-Math.PI / 2); lg.translate((c0x + c1x) / 2, 0, (c0z + c1z) / 2);
  { const lp = lg.attributes.position; for (let i = 0; i < lp.count; i++) { const hh = H(lp.getX(i), lp.getZ(i)); lp.setY(i, hh > 120 ? 135 : hh - 10); } lg.computeVertexNormals(); }
  const lava = new THREE.Mesh(lg, lavaMat); root.add(lava);
  anim.push(t => { lavaMat.emissiveIntensity = 1.25 + Math.sin(t * 1.3) * 0.25; });
  const vf = L('furnace'), ashMat = new THREE.MeshLambertMaterial({ color: 0x6b625c, flatShading: true, transparent: true, opacity: 0.85 }), ash = [];
  for (let i = 0; i < 16; i++) { const p = new THREE.Mesh(puffG, ashMat); root.add(p); ash.push(p); }
  anim.push(t => ash.forEach((p, i) => { const k = ((t * 0.05 + i / 16) % 1); p.position.set(vf.x + Math.sin(i * 2.1) * 90 * k + k * 600, 1300 + k * 1500, vf.z + Math.cos(i * 1.7) * 90 * k); p.scale.setScalar(50 + k * 220); }));
  const bf = L('bones'), bone = std(0xeee4cc, { r: 0.7 });
  for (let i = 0; i < 14; i++) { const x = bf.x - 90 + i * 13, z = bf.z + Math.sin(i * 0.4) * 10, y = H(x, z); const vtb = new THREE.Mesh(new THREE.SphereGeometry(4.5 - i * 0.18, 8, 6), bone); vtb.position.set(x, y + 3, z); root.add(vtb);
    if (i > 2 && i < 11) [-1, 1].forEach(s => { const rib = new THREE.Mesh(new THREE.TorusGeometry(15 - Math.abs(i - 6), 1.5, 6, 12, Math.PI * 0.8), bone); rib.position.set(x, y + 2, z); rib.rotation.set(0, Math.PI / 2, s > 0 ? 0.2 : Math.PI - 0.2); root.add(rib); }); }
  const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(14, 0), bone); skull.position.set(bf.x + 100, H(bf.x + 100, bf.z) + 8, bf.z); skull.scale.set(1.6, 0.8, 1); root.add(skull);

  // Frostfang: Glacier Palace
  const gp = L('palace'), ice = std(0xbfe2f5, { r: 0.15, t: true, op: 0.88, e: 0x5aa0c8, ei: 0.25 });
  [[0, 0, 16, 120], [40, 18, 10, 80], [-38, 22, 10, 90], [20, -36, 9, 70], [-22, -30, 8, 60]].forEach(p => { const x = gp.x + p[0], z = gp.z + p[1], y = H(gp.x, gp.z); const c = new THREE.Mesh(new THREE.CylinderGeometry(p[2] * 0.8, p[2], p[3], 7), ice); c.position.set(x, y + p[3] / 2, z); const s = new THREE.Mesh(new THREE.ConeGeometry(p[2] * 1.1, p[3] * 0.5, 7), ice); s.position.set(x, y + p[3] * 1.25, z); root.add(c, s); });

  // Stormcrown: floating rocks, Lightning Rod Spire, lightning
  const fr = [], frRock = std(0x5b5866), frTop = std(0x5f6e52);
  for (let i = 0; i < 34; i++) { const [x, z] = toWorld(0.36 + rnd() * 0.56, -0.86 + rnd() * 0.66), r = 60 + rnd() * 130, g = new THREE.Group();
    const c = new THREE.Mesh(rockify(new THREE.ConeGeometry(r, r * 1.8, 7, 3), 0.25), frRock); c.rotation.x = Math.PI; g.add(c);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r, 3, 7), frTop); top.position.y = r * 0.9; g.add(top);
    const by = H(x, z) + 250 + rnd() * 600; g.userData.anim = true; g.position.set(x, by, z); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); root.add(g); fr.push([g, by, rnd() * 6]); }
  anim.push(t => fr.forEach(([g, by, ph]) => { g.position.y = by + Math.sin(t * 0.5 + ph) * 6; g.rotation.y = t * 0.02 + ph; }));
  const sp = L('spire'), spr = new THREE.Mesh(rockify(new THREE.ConeGeometry(70, 1300, 8, 6), 0.2), frRock); spr.position.set(sp.x, sp.y + 630, sp.z); root.add(spr);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 6), std(0xc0c4cc, { m: 0.4, r: 0.3 })); rod.position.set(sp.x, sp.y + 1300, sp.z); root.add(rod);
  const boltMat = new THREE.LineBasicMaterial({ color: 0xe6eaff, transparent: true, opacity: 0, fog: false });
  const bpts = []; let by2 = sp.y + 1330; for (let i = 0; i < 9; i++) { bpts.push(new THREE.Vector3(sp.x + (rnd() - 0.5) * 40, by2, sp.z + (rnd() - 0.5) * 40)); by2 += 60; }
  const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bpts), boltMat); root.add(bolt);
  anim.push(t => { const f = (t % 4.3); boltMat.opacity = f < 0.12 || (f > 0.2 && f < 0.28) ? 1 : 0; });

  // Sunken Reach: sea stacks, lighthouse, arch, wrecks
  for (let i = 0, n = 0; i < 400 && n < 14; i++) { const [x, z] = toWorld(0.3 + rnd() * 0.7, 0.3 + rnd() * 0.7); if (H(x, z) > -6) continue; n++; const hh = 40 + rnd() * 60, st = new THREE.Mesh(rockify(new THREE.CylinderGeometry(9 + rnd() * 6, 14 + rnd() * 8, hh, 8, 4), 0.25), rock); st.position.set(x, hh / 2 - 8, z); st.castShadow = true; const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 2, 8), std(0x86b85a)); cap.position.set(x, hh - 8, z); root.add(st, cap); }
  const lh = L('lighthouse'), lhy = Math.max(lh.y, 2);
  for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(5.5 - i * 0.4, 6 - i * 0.4, 9, 12), i % 2 ? std(0xc23b2c) : white); seg.position.set(lh.x, lhy + 4.5 + i * 9, lh.z); seg.castShadow = true; root.add(seg); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0b0 })); lamp.position.set(lh.x, lhy + 49, lh.z); root.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(18, 260, 16, 1, true), glowMat(0xfff2c0)); beam.geometry.translate(0, -130, 0); beam.rotation.z = Math.PI / 2; const bg = new THREE.Group(); bg.position.copy(lamp.position); bg.add(beam); root.add(bg);
  anim.push(t => { bg.rotation.y = t * 0.8; });
  const ar = L('arch'), arch = new THREE.Mesh(rockify(new THREE.TorusGeometry(60, 15, 8, 18, Math.PI), 0.18), rock); arch.position.set(ar.x, -12, ar.z); arch.rotation.y = 0.5; arch.castShadow = true; root.add(arch);
  const wr = L('wrecks');
  for (let i = 0; i < 4; i++) { const x = wr.x + (rnd() - 0.5) * 180, z = wr.z + (rnd() - 0.5) * 120, g = new THREE.Group(); g.position.set(x, -2, z); g.rotation.set(0.3 * (rnd() - 0.5), rnd() * 6, 0.35); const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 34), wood); g.add(hull); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 26, 5), wood); mast.position.y = 14; mast.rotation.z = 0.4; g.add(mast); root.add(g); }

  // Sky Isles
  const isleRock = std(0xa3907a), isleTop = std(0x8cc25a), fall = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const isles = SKY_ISLE_LIST;
  isles.forEach((p, i) => { const g = new THREE.Group(), r = p[2]; g.userData.anim = true; g.position.set(sx0 + p[0] * 1.6, SKY_ISLES.alt + p[3], sz0 + p[1]);
    const c = new THREE.Mesh(rockify(new THREE.ConeGeometry(r, r * 1.6, 9, 4), 0.25), isleRock); c.rotation.x = Math.PI; c.position.y = -r * 0.8; g.add(c);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 6, 12), isleTop); g.add(top);
    if (i < 4) { const f = new THREE.Mesh(new THREE.PlaneGeometry(18, 900), fall); f.position.set(r * 0.92, -450, 0); f.rotation.y = Math.PI / 2; g.add(f); }
    for (let k = 0; k < r / 9; k++) { const a = rnd() * 6.28, d = rnd() * r * 0.75, tr = new THREE.Mesh(broadG, std(0x6fa548)); tr.position.set(Math.cos(a) * d, 2, Math.sin(a) * d); g.add(tr); }
    g.traverse(o => { if (o.isMesh && o.material !== fall) o.castShadow = true; }); root.add(g);
    if (i === 0) { const gold = std(0xe2b64a, { m: 0.3, r: 0.4 }); [[0, 0, 26, 140], [60, 36, 15, 92], [-56, 40, 15, 100], [20, -60, 13, 80], [-30, -50, 11, 70]].forEach(q => { const tw = new THREE.Mesh(new THREE.CylinderGeometry(q[2] * 0.9, q[2], q[3], 10), white); tw.position.set(q[0], q[3] / 2 + 3, q[1]); const rf = new THREE.Mesh(new THREE.ConeGeometry(q[2] * 1.2, q[3] * 0.45, 10), gold); rf.position.set(q[0], q[3] + 3 + q[3] * 0.22, q[1]); g.add(tw, rf); }); }
  });
  const whaleMat = std(0xe9e4f6, { flat: false, r: 0.9, e: 0xb8b0d8, ei: 0.2 }), whales = [];
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(), b = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), whaleMat); g.userData.anim = true; b.scale.set(60, 46, 160); g.add(b);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), whaleMat); tail.scale.set(80, 7, 26); tail.position.z = -160; g.add(tail); root.add(g); whales.push(g); }
  anim.push(t => whales.forEach((g, i) => { const a = t * 0.03 + i * 2.1; g.position.set(sx0 + Math.cos(a) * 2400, SKY_ISLES.alt + 200 + i * 80, sz0 + Math.sin(a) * 1300); g.rotation.y = -a; }));

  // Wind streams & thermals
  WIND.forEach((pts, i) => { const curve = new THREE.CatmullRomCurve3(pts.map(([u, v], k) => { const [x, z] = toWorld(u, v); return new THREE.Vector3(x, Math.max(height(u, v), 0) + 260 + (i === 4 ? k * 1000 : 0), z); }), false);
    const m = ribbonMat(0xfff4d8, 0.22, 0, 260), tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 9, 8, false), m); root.add(tube); anim.push(t => { m.uniforms.t.value = t; }); });
  const thermal = (x, z, base) => { const m = ribbonMat(0xfff6dc, 0.1, 1, 9); const c = new THREE.Mesh(new THREE.CylinderGeometry(70, 60, 1200, 20, 1, true), m); c.position.set(x, base + 600, z); root.add(c); anim.push(t => { m.uniforms.t.value = t * 0.5; }); };
  thermal(vf.x, vf.z, 1500);

  return { root, clouds, storm, whales, towers, thermal, ribbonMat, tower, update: t => anim.forEach(f => f(t)), aerieTop: new THREE.Vector3(aer.x, topY + 9, aer.z) };
}
