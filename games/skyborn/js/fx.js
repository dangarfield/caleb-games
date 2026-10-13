// Skyborn FX: soft glow sprites, trails, impact bursts and lightning arcs for breath and enemy shots.
import * as THREE from 'three';

function glowTex(inner = 0.0, soft = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(Math.max(0.05, inner), 'rgba(255,255,255,0.9)'); r.addColorStop(soft, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 6; i++) { const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 10 + Math.random() * 12, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const STYLE = {
  Breeze: { core: 0xffffff, glow: 0xb8f0d8, trail: [0xeafff4, 0x9fe8d0], size: 7, burst: [0xffffff, 0xb8f0d8] },
  Ember: { core: 0xfff2b0, glow: 0xff7a1a, trail: [0xffb040, 0xff4a10], smoke: 0x5a3a30, size: 9, burst: [0xffd060, 0xff5a10] },
  Frost: { core: 0xffffff, glow: 0x7fd0ff, trail: [0xe8f8ff, 0x8fd8ff], size: 7, burst: [0xffffff, 0x9fe0ff], shard: true },
  Storm: { core: 0xffffff, glow: 0x8fc8ff, trail: [0xe0f0ff, 0x7fb8ff], size: 6, burst: [0xffffff, 0x9fd0ff] },
  Tide: { core: 0xe8ffff, glow: 0x3fd6e6, trail: [0xbff8ff, 0x3fc4d6], size: 8, burst: [0xe8ffff, 0x3fc4d6] },
  Gold: { core: 0xffffff, glow: 0xffd060, trail: [0xfff4c0, 0xffb830], size: 14, burst: [0xffffff, 0xffd060], rays: true },
  cannon: { core: 0x2a2a30, glow: 0xff6a1a, trail: [0xffd070, 0xff4a10], smoke: 0x9a948e, size: 4.6, burst: [0xffe9a0, 0xff5a10], dark: true },
  feather: { core: 0xd8b0ff, glow: 0xa060ff, trail: [0xe8d0ff, 0x9a60e0], size: 5, burst: [0xf0e0ff, 0xa070ff], feather: true },
  ice: { core: 0xffffff, glow: 0x7fd0ff, trail: [0xe8f8ff, 0x8fd8ff], size: 5, burst: [0xffffff, 0x9fe0ff], shard: true },
  water: { core: 0xe8ffff, glow: 0x3fb8e6, trail: [0xbff0ff, 0x3fa4d6], size: 6, burst: [0xe8ffff, 0x3fa4d6] },
  fire: { core: 0xfff2b0, glow: 0xff5a10, trail: [0xffa030, 0xff3a10], smoke: 0x4a2a20, size: 8, burst: [0xffd060, 0xff4a10] }
};

export function initFx(scene) {
  const GLOW = glowTex(0.08, 0.45), SOFT = glowTex(0, 0.3), SMOKE = smokeTex();
  const pool = [], live = [], arcs = [];
  const tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
  function sprite() { let s = pool.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })); } s.visible = true; scene.add(s); return s; }
  function emit(pos, o) {
    const s = sprite(), m = s.material; m.map = o.tex || GLOW; m.blending = o.normal ? THREE.NormalBlending : THREE.AdditiveBlending; m.needsUpdate = true;
    m.color.setHex(o.c0); m.opacity = o.op ?? 1; m.rotation = Math.random() * 6.28; s.position.copy(pos); s.scale.setScalar(o.s0);
    live.push({ s, v: o.v ? o.v.clone() : new THREE.Vector3(), life: o.life, max: o.life, s0: o.s0, s1: o.s1 ?? o.s0 * 0.2, c0: o.c0, c1: o.c1 ?? o.c0, op: o.op ?? 1, drag: o.drag ?? 0.9, rise: o.rise ?? 0, spin: (Math.random() - 0.5) * 4 });
  }
  const rv = (k = 1) => tmpV.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);

  // A projectile's look: a bright core + big soft glow, plus a shard / feather mesh when needed.
  function projectile(kind) {
    const st = STYLE[kind] || STYLE.Ember, g = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: st.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: st.dark ? 0.42 : 0.9 }));
    glow.scale.setScalar(st.size * (st.dark ? 2.6 : 3.2)); g.add(glow);
    if (st.shard) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.6, 0.6, 3.2), new THREE.MeshBasicMaterial({ color: st.core, transparent: true, opacity: 0.95 })); m.scale.setScalar(st.size * 0.45); g.add(m); g.userData.orient = true; }
    else if (st.feather) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 4), new THREE.MeshBasicMaterial({ color: st.core, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })); m.scale.setScalar(st.size * 0.55); g.add(m); g.userData.spin = m; }
    else if (st.dark) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x4a4a56, roughness: 0.32, metalness: 0.25, emissive: 0x3a1404, emissiveIntensity: 1 })); m.scale.setScalar(st.size * 0.7); m.renderOrder = 2; g.add(m);
      const hot = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffd070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); hot.scale.setScalar(st.size * 0.7); g.add(hot); g.userData.hot = hot;
      const warn = new THREE.Mesh(new THREE.RingGeometry(st.size * 1.25, st.size * 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); g.add(warn); g.userData.warn = warn;
    }
    else { const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: st.core, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); core.scale.setScalar(st.size * 1.1); g.add(core); }
    if (st.rays) { const r = new THREE.Mesh(new THREE.RingGeometry(st.size * 0.9, st.size * 1.4, 24), new THREE.MeshBasicMaterial({ color: st.glow, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })); g.add(r); g.userData.ring = r; }
    g.userData.kind = kind; g.userData.acc = 0;
    return g;
  }
  function trail(obj, vel, dt) {
    const kind = obj.userData.kind, st = STYLE[kind] || STYLE.Ember;
    if (obj.userData.orient && vel.lengthSq() > 1) obj.children[1].lookAt(tmpV.copy(obj.position).add(vel));
    if (obj.userData.spin) obj.userData.spin.rotation.z += dt * 14;
    if (obj.userData.ring) { obj.userData.ring.lookAt(tmpV.copy(obj.position).sub(vel)); obj.userData.ring.rotation.z += dt * 3; }
    obj.children[0].material.rotation += dt * 3;
    if (obj.userData.hot) { const k = 0.7 + Math.random() * 0.6; obj.userData.hot.scale.setScalar(st.size * 0.8 * k); obj.userData.hot.material.opacity = 0.6 + Math.random() * 0.4; if (vel.lengthSq() > 1) obj.userData.hot.position.copy(vel).normalize().multiplyScalar(-st.size * 0.75); }
    if (obj.userData.warn) { obj.userData.warn.lookAt(tmpV.copy(obj.position).sub(vel)); obj.userData.warn.material.opacity = 0.25 + 0.25 * Math.sin(performance.now() / 90); }
    obj.userData.acc += dt; const every = st.dark ? 0.022 : 0.018;
    while (obj.userData.acc > every) {
      obj.userData.acc -= every;
      if (st.dark) {
        emit(tmpV.copy(obj.position).add(rv(st.size * 0.3)), { c0: st.trail[0], c1: st.trail[1], s0: st.size * (0.7 + Math.random() * 0.5), s1: st.size * 0.1, life: 0.25 + Math.random() * 0.2, v: rv(14), op: 1 });
        emit(tmpV.copy(obj.position).add(rv(st.size * 0.5)), { c0: 0xd8d2cc, c1: st.smoke, s0: st.size * 1.4, s1: st.size * (4 + Math.random() * 2), life: 1.1 + Math.random() * 0.6, v: rv(5), rise: 5, op: 0.55, tex: SMOKE, normal: true });
        continue;
      }
      emit(tmpV.copy(obj.position).add(rv(st.size * 0.4)), { c0: st.trail[0], c1: st.trail[1], s0: st.size * (0.8 + Math.random() * 0.6), s1: st.size * 0.15, life: 0.35 + Math.random() * 0.25, v: rv(6), op: 0.9, tex: GLOW });
      if (st.smoke && Math.random() < 0.35) emit(tmpV.copy(obj.position), { c0: st.smoke, s0: st.size * 1.2, s1: st.size * 3.2, life: 0.9, v: rv(4), rise: 6, op: 0.35, tex: SMOKE, normal: true });
    }
  }
  function burst(pos, kind, n = 18, scale = 1) {
    const st = STYLE[kind] || STYLE.Ember;
    emit(pos, { c0: st.burst[0], c1: st.burst[1], s0: st.size * 5 * scale, s1: st.size * 7 * scale, life: 0.25, op: 1, tex: SOFT });
    for (let i = 0; i < n; i++) { const v = rv(1).normalize().multiplyScalar((40 + Math.random() * 70) * scale); emit(pos, { c0: st.burst[0], c1: st.burst[1], s0: st.size * (0.6 + Math.random() * 0.7) * scale, s1: 0.5, life: 0.45 + Math.random() * 0.4, v, drag: 0.88 }); }
    if (st.smoke || st.dark) for (let i = 0; i < 6; i++) emit(tmpV.copy(pos).add(rv(st.size * 2)), { c0: st.smoke || 0x8a8078, s0: st.size * 2, s1: st.size * 6 * scale, life: 1.2, v: rv(10), rise: 8, op: 0.45, tex: SMOKE, normal: true });
  }
  function muzzle(pos, kind) {
    const st = STYLE[kind] || STYLE.Ember;
    if (st.dark) { emit(pos, { c0: 0xfff0b0, c1: 0xff5a10, s0: st.size * 5, s1: st.size * 7, life: 0.22, tex: SOFT }); for (let i = 0; i < 8; i++) emit(tmpV.copy(pos).add(rv(st.size * 2)), { c0: 0xe8e2dc, c1: st.smoke, s0: st.size * 2, s1: st.size * 7, life: 1.4, v: rv(18), rise: 6, op: 0.6, tex: SMOKE, normal: true }); return; }
    emit(pos, { c0: st.core, c1: st.glow, s0: st.size * 2.6, s1: st.size * 4, life: 0.18, tex: SOFT });
  }
  const arcMat = new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  function arc(a, b, kind = 'Storm') {
    const pts = [], n = 14, d = a.distanceTo(b), side = new THREE.Vector3();
    for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(b, t); if (i && i < n) p.add(side.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(d * 0.08 * Math.sin(t * Math.PI))); pts.push(p); }
    for (let k = 0; k < 2; k++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(k ? pts.map(p => p.clone().add(rv(4))) : pts), arcMat.clone()); scene.add(l); arcs.push({ l, life: 0.22 }); }
    pts.forEach((p, i) => { if (i % 2 === 0) emit(p, { c0: 0xffffff, c1: 0x7fb8ff, s0: 9, s1: 2, life: 0.25, tex: SOFT }); });
    burst(b, kind, 12, 0.8);
  }
  function beam(a, b) {
    const d = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, d, 12, 1, true).translate(0, d / 2, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(a); m.lookAt(b); scene.add(m); arcs.push({ l: m, life: 0.3 });
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]; p.life -= dt; if (p.life <= 0) { scene.remove(p.s); p.s.visible = false; pool.push(p.s); live.splice(i, 1); continue; }
      const k = 1 - p.life / p.max; p.v.multiplyScalar(Math.pow(p.drag, dt * 10)); p.v.y += p.rise * dt; p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k); p.s.material.opacity = p.op * (1 - k * k); p.s.material.color.setHex(p.c0).lerp(tmpC.setHex(p.c1), k); p.s.material.rotation += p.spin * dt;
    }
    for (let i = arcs.length - 1; i >= 0; i--) { const a = arcs[i]; a.life -= dt; a.l.material.opacity = Math.max(0, a.life / 0.22) * (Math.random() * 0.5 + 0.5); if (a.life <= 0) { scene.remove(a.l); a.l.geometry.dispose(); arcs.splice(i, 1); } }
  }
  return { projectile, trail, burst, muzzle, arc, beam, update };
}

// Soft light pillar over an undiscovered "?" spot.
export function pillarMaterial(color = 0xc08aff) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, op: { value: 0 }, t: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; \n#include <logdepthbuf_vertex>\n}',
    fragmentShader: '#include <logdepthbuf_pars_fragment>\nvarying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform vec3 col; uniform float op, t; void main(){ \n#include <logdepthbuf_fragment>\n float edge = pow(abs(dot(vN, vV)), 1.6); float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y)); float shimmer = 0.75 + 0.25 * sin(vUv.y * 40.0 - t * 3.0); gl_FragColor = vec4(col, edge * fade * shimmer * op); }'
  });
}
