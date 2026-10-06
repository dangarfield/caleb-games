// The hole: a discard in the ground shader (so things sink out of sight everywhere except through the
// opening), a dark inner wall, and a skinnable rim. Up to 4 holes share one uniform array.
import * as THREE from 'three';

export const MAX_HOLES = 4;
export const holeUniform = { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) };

// Shader patch shared by the ground, room shells and every batched object:
//  floorY: skip fragments inside any hole and below that height (ground, room floors, flat pads)
//  xray:   screen-door out anything standing between the camera and the player's hole, so tall
//          buildings never hide it (uFocus = player x, -, z, radius of the see-through tube)
export const xrayFocus = { value: new THREE.Vector4(0, 0, 0, 0) };
//  under:  hide any part of an object that is below ground level and not inside a hole's opening, i.e.
//          the bit that is 'inside the ground' past the hole's edge, so falling things never show through it
export function patchMat(material, { floorY = null, xray = false, under = false } = {}) {
  const key = 'kp-' + (floorY == null ? 'n' : floorY.toFixed(3)) + (xray ? 'x' : '') + (under ? 'u' : '');
  material.onBeforeCompile = sh => {
    sh.uniforms.uHoles = holeUniform; sh.uniforms.uFocus = xrayFocus;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKpW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 kpW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
  kpW = batchingMatrix * kpW;
  #endif
  #ifdef USE_INSTANCING
  kpW = instanceMatrix * kpW;
  #endif
  vKpW = (modelMatrix * kpW).xyz;`);
    let pre = '';
    if (floorY != null) pre += `if (vKpW.y < ${floorY.toFixed(3)}) { for (int i = 0; i < ${MAX_HOLES}; i++) { vec4 h = uHoles[i]; if (h.w > 0.5 && distance(vKpW.xz, h.xy) < h.z) discard; } }\n`;
    if (under) pre += `if (vKpW.y < -0.01) { bool kpIn = false; for (int i = 0; i < ${MAX_HOLES}; i++) { vec4 h = uHoles[i]; if (h.w > 0.5 && distance(vKpW.xz, h.xy) < h.z) kpIn = true; } if (!kpIn) discard; }\n`;
    if (xray) pre += `if (uFocus.w > 0.0 && vKpW.y > uFocus.y) { vec3 kb = vec3(uFocus.x, 0.0, uFocus.z), ab = kb - cameraPosition; float t = clamp(dot(vKpW - cameraPosition, ab) / dot(ab, ab), 0.0, 1.0); if (t < 0.97 && length(vKpW - (cameraPosition + ab * t)) < uFocus.w) discard; }\n`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vKpW;\nuniform vec4 uHoles[${MAX_HOLES}];\nuniform vec4 uFocus;`).replace('void main() {', 'void main() {\n' + pre);
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}
export const patchDiscard = (m, floorY = 0.05) => patchMat(m, { floorY });

function ringGeo(inner, outer, seg = 96, rep = 12) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * inner, 0, s * inner, c * outer, 0, s * outer); uv.push(i / seg * rep, 0, i / seg * rep, 1);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

function wallGeo() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 64, 6, true); g.translate(0, -0.5, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = Math.pow(1 + p.getY(i), 3); const v = 0.015 + 0.09 * t; col[i * 3] = v * 0.9; col[i * 3 + 1] = v * 0.82; col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const WALL = wallGeo(), WALL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
const FLOOR = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), FLOOR_MAT = new THREE.MeshBasicMaterial({ color: 0x050409 });
const RIM = ringGeo(0.99, 1.16), LIP = ringGeo(0.8, 1.0, 96, 1);

export { SKINS, skinTexture, skinPreview } from './skins.js';
import { skinById, skinTexture as stripTex, decalTexture, DECAL_K } from './skins.js';
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// a band round the inside of the shaft, top edge at ground level (teeth, waterfalls)
const BAND = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, -0.5, 0);

export class Hole {
  constructor(scene, slot, skin = 'black', solid = null) {
    this.scene = scene; this.slot = slot; this.r = 1; this.x = 0; this.z = 0; this.active = true; this.t = 0;
    this.group = new THREE.Group();
    this.wallMat = WALL_MAT.clone(); this.floorMat = FLOOR_MAT.clone();
    this.wall = new THREE.Mesh(WALL, this.wallMat); this.floor = new THREE.Mesh(FLOOR, this.floorMat);
    this.rimMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    this.rim = new THREE.Mesh(RIM, this.rimMat); this.rim.position.y = 0.06; this.rim.renderOrder = 2;
    this.lip = new THREE.Mesh(LIP, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); this.lip.position.y = -0.01;
    this.group.add(this.wall, this.floor, this.rim, this.lip);
    scene.add(this.group);
    this.pulse = 0; this.layers = []; this.trail = null; this.parts = []; this.orbit = null; this.orbs = []; this.px = 0; this.pz = 0; this.trailAcc = 0; this.dir = [0, 1];
    this.setSkin(skin, solid);
  }
  setSkin(id, solid) {
    for (const L of this.layers) { this.group.remove(L.mesh); L.mesh.material.dispose(); }
    for (const p of this.orbs) { this.group.remove(p.mesh); p.mesh.material.dispose(); }
    this.layers = []; this.trail = null; this.orbit = null; this.orbs = [];
    const sk = solid ? null : skinById(id);
    // the inside of the hole: a mouth colour for creature / special shapes, plain dark otherwise
    if (sk && sk.mouth) { this.wallMat.color.set(sk.mouth).multiplyScalar(6); this.floorMat.color.set(sk.mouth).multiplyScalar(0.12); } else { this.wallMat.color.set(0xffffff); this.floorMat.color.set(0x050409); }
    if (!sk || sk.kind === 'strip') { this.rim.visible = true; this.rimMat.map = stripTex(sk ? sk.id : id, solid); this.rimMat.needsUpdate = true; return; }
    this.rim.visible = false;
    let inner = 0, outer = 0; this.k = sk.k || DECAL_K;
    sk.layers.forEach(L => {
      if (L.wall) {
        let map = decalTexture(L.wall); if (L.scroll || (L.rep || 1) !== 1) { map = map.clone(); map.needsUpdate = true; map.repeat.set(L.rep || 1, 1); }
        const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: -1 });
        const mesh = new THREE.Mesh(BAND, mat); mesh.renderOrder = 1; this.group.add(mesh); this.layers.push({ ...L, mesh, band: true }); return;
      }
      const mat = new THREE.MeshBasicMaterial({ map: decalTexture(L.draw, this.k), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: L.add ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: !L.inner, polygonOffsetFactor: -2 - outer });
      const mesh = new THREE.Mesh(PLANE, mat);
      // inner layers (teeth, tongues, swirls) sit just below the ground, so they're seen down inside the hole
      const depth = L.inner ? (L.depth != null ? L.depth : 0.07 + inner * 0.05) : 0; if (L.inner) inner++; if (!L.inner) mesh.position.y = 0.06 + outer++ * 0.004;
      mesh.renderOrder = L.inner ? 1 : 2 + outer;
      this.group.add(mesh); this.layers.push({ ...L, mesh, depth });
    });
    if (sk.trail) this.trail = sk.trail;
    if (sk.orbit) { this.orbit = sk.orbit; for (let i = 0; i < sk.orbit.n; i++) { const mat = new THREE.MeshBasicMaterial({ map: decalTexture(sk.orbit.draw), transparent: true, depthWrite: false, blending: sk.orbit.add ? THREE.AdditiveBlending : THREE.NormalBlending }); const mesh = new THREE.Mesh(PLANE, mat); mesh.renderOrder = 3; mesh.position.y = 0.08; this.group.add(mesh); this.orbs.push({ mesh, a: Math.random() * Math.PI * 2, f: 1 + Math.random() * 0.7 }); } }
  }
  // invulnerability blink: hide whichever rim this skin uses
  setFlicker(off) { if (this.layers.length) { this.rim.visible = false; for (const L of this.layers) L.mesh.visible = !off; } else this.rim.visible = !off; }
  spawnTrail() {
    const T = this.trail; let p = this.parts.find(q => q.life <= 0);
    if (!p) { if (this.parts.length >= 28) return; const mat = new THREE.MeshBasicMaterial({ map: decalTexture(T.draw), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); p = { mesh: new THREE.Mesh(PLANE, mat), life: 0 }; p.mesh.renderOrder = 1; this.scene.add(p.mesh); this.parts.push(p); }
    const j = (Math.random() - 0.5) * this.r * 0.6, [dx, dz] = this.dir;
    p.mesh.position.set(this.x - dx * this.r * 1.15 - dz * j, 0.05, this.z - dz * this.r * 1.15 + dx * j);
    p.mesh.rotation.y = Math.random() * 0.6 - 0.3 + Math.atan2(dx, dz) + Math.PI; p.max = p.life = T.life; p.size = this.r * T.size * (0.8 + Math.random() * 0.4);
  }
  update(dt) {
    this.t += dt; this.pulse = Math.max(0, this.pulse - dt * 3);
    const r = this.r * (1 + 0.06 * Math.sin(this.pulse * 9) * this.pulse), depth = Math.max(4, r * 3.5);
    const mx = this.x - this.px, mz = this.z - this.pz, moved = Math.hypot(mx, mz), speed = dt > 0 ? moved / dt : 0;
    if (moved > 1e-4) this.dir = [mx / moved, mz / moved]; this.px = this.x; this.pz = this.z;
    this.group.position.set(this.x, 0, this.z);
    this.wall.scale.set(r, depth, r); this.floor.scale.set(r, 1, r); this.floor.position.y = -depth + 0.01;
    this.rim.scale.set(r, 1, r); this.lip.scale.set(r, 1, r);
    this.rim.rotation.y += dt * 0.15;
    const w = 2 * r * (this.k || DECAL_K);
    for (const L of this.layers) {
      if (L.band) { L.mesh.scale.set(r * 0.965, (L.h || 0.4) * r, r * 0.965); L.mesh.position.y = -(L.d || 0) * r; if (L.scroll) L.mesh.material.map.offset.y = (L.mesh.material.map.offset.y + dt * L.scroll) % 1; }
      else { L.mesh.scale.set(w, 1, w); if (L.inner) L.mesh.position.y = -L.depth * r; }
      if (L.spin) L.mesh.rotation.y += (L.spin + (L.speedSpin ? speed / Math.max(0.5, r) * L.speedSpin : 0)) * dt;
      if (L.flash != null) L.mesh.material.opacity = Math.floor(this.t * 5) % 2 === L.flash ? 1 : 0.08;
      if (L.pulse) { const a = L.amp != null ? L.amp : 0.35; L.mesh.material.opacity = 1 - a + a * Math.sin(this.t * (1.2 + L.pulse * 0.5) + L.pulse); }
    }
    // orbiting bits (black hole sparks, whirlpool droplets) spiral in toward the opening and start again
    if (this.orbit) { const O = this.orbit, mode = O.mode || 'spiral', reach = O.reach || 1.75;
      for (const p of this.orbs) {
        if (mode === 'ripple') { // rings spreading out from the opening
          p.t = (p.t == null ? Math.random() : p.t) + dt * 0.35; if (p.t > 1) p.t -= 1;
          const s = r * 2 * (1.02 + p.t * 0.7); p.mesh.position.set(0, 0.07, 0); p.mesh.scale.set(s, 1, s); p.mesh.material.opacity = 0.7 * (1 - p.t) * Math.min(1, p.t * 6); continue;
        }
        if (mode === 'bubble') { // blobs that swell and pop round the rim, drifting slowly
          if (p.t == null || p.t > p.life) { p.t = 0; p.life = 1.8 + Math.random() * 2; p.a = Math.random() * Math.PI * 2; p.f = Math.sqrt(Math.random()) * 0.78; p.z = 0.6 + Math.random() * 0.6; }
          p.t += dt; p.a += dt * 0.08; const u = p.t / p.life, grow = Math.min(1, u * 2.2), s = r * O.size * p.z * (0.35 + 0.65 * grow) * (u > 0.85 ? 1 + (u - 0.85) * 2 : 1);
          p.mesh.position.set(Math.cos(p.a) * r * p.f, 0.08, Math.sin(p.a) * r * p.f); p.mesh.scale.set(s, 1, s); p.mesh.material.opacity = (O.alpha || 1) * (u > 0.85 ? Math.max(0, 1 - (u - 0.85) / 0.15) : Math.min(1, u * 6)); continue;
        }
        if (p.sz == null) { p.sz = 0.5 + Math.random() * 0.9; p.f = 0.85 + Math.random() * (reach - 0.85); }
        p.f -= dt * 0.3; if (p.f < 0.85) { p.f = reach; p.a = Math.random() * Math.PI * 2; p.sz = 0.5 + Math.random() * 0.9; }
        p.a += O.spin * dt / p.f; const k = Math.min(1, (reach - p.f) * 3, (p.f - 0.85) * 4), s = r * O.size * p.sz * (0.6 + p.f * 0.3);
        p.mesh.position.x = Math.cos(p.a) * r * p.f; p.mesh.position.z = Math.sin(p.a) * r * p.f; p.mesh.scale.set(s, 1, s); p.mesh.material.opacity = k;
      } }
    if (this.trail && this.active && moved < r * 2) { this.trailAcc += moved; if (this.trailAcc > this.trail.every * r) { this.trailAcc = 0; this.spawnTrail(); } }
    for (const p of this.parts) { if (p.life <= 0) { p.mesh.visible = false; continue; } p.life -= dt; const k = Math.max(0, p.life / p.max); p.mesh.visible = true; p.mesh.material.opacity = k; const s = p.size * (0.7 + 0.3 * k); p.mesh.scale.set(s, 1, s); }
    this.group.visible = this.active;
    holeUniform.value[this.slot].set(this.x, this.z, this.active ? r : 0, this.active ? 1 : 0);
  }
  remove(scene) { scene.remove(this.group); for (const p of this.parts) { scene.remove(p.mesh); p.mesh.material.dispose(); } this.parts = []; holeUniform.value[this.slot].set(0, 0, 0, 0); }
}
