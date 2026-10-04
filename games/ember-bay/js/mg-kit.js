// Blaze · Ember Bay minigame kit: one small three.js stage per minigame, drawn on the 1333×690 game stage.
import * as THREE from 'three';
import { sfx } from './sfx.js';
export { THREE };
export const W = 1333, H = 690, INTRO_X = 620;
export const C = { hv: '#e5e043', red: '#d8362d', blue: '#2f88c4', ink: '#1c1d1f', chalk: '#f2f1ec', ink2: '#2c2d30' };
export const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const mk = (g, c) => { const m = new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c); m.castShadow = m.receiveShadow = true; return m; };
export const box = (w, h, d, c) => mk(new THREE.BoxGeometry(w, h, d), c);
export const cyl = (rt, rb, h, c, seg = 18) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), c);
export const sph = (r, c, seg = 16) => mk(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), c);
export const at = (o, x, y, z) => (o.position.set(x, y, z), o);
export const icon = (n, s = 28, col = '') => `<span style="font-family:'Material Symbols Sharp';font-size:${s}px;line-height:1;${col ? 'color:' + col : ''}">${n}</span>`;

export function stage(host, { bg = '#cfdde4', fov = 45, ground = '#8fb870', fog } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.setSize(W, H, false);
  const el = renderer.domElement; el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
  host.appendChild(el);
  const ui = document.createElement('div'); ui.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:Archivo,sans-serif;color:#f2f1ec;opacity:0;transition:opacity .3s'; host.appendChild(ui);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(bg); if (fog) scene.fog = new THREE.Fog(bg, fog[0], fog[1]);
  const hemi = new THREE.HemisphereLight('#ffffff', '#9a9585', 1.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 1.5); sun.position.set(-8, 14, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 }); scene.add(sun);
  if (ground) { const g = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat(ground)); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); }
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 500);
  const ticks = [], hand = { down: [], move: [], up: [] };
  let active = false, paused = false, raf = 0, last = performance.now(), t = 0;
  const S = {
    THREE, scene, camera, renderer, ui, sun, hemi, el,
    get active() { return active; }, get paused() { return paused; },
    setActive(v) { active = v; ui.style.opacity = v ? 1 : 0; },
    setPaused(v) { paused = v; },
    setFrame(f) { if (f === 'intro') camera.setViewOffset(W, H, -((INTRO_X + W) / 2 - W / 2), 0, W, H); else camera.clearViewOffset(); },
    onTick(f) { ticks.push(f); },
    on(k, f) { hand[k].push(f); },
    pick(ndc, objs) { ray.setFromCamera(ndc, camera); return ray.intersectObjects(objs, true)[0] || null; },
    rayPlane(ndc, plane) { ray.setFromCamera(ndc, camera); const v = new THREE.Vector3(); return ray.ray.intersectPlane(plane, v) ? v : null; },
    div(css, html = '') { const d = document.createElement('div'); d.style.cssText = css; d.innerHTML = html; ui.appendChild(d); return d; },
    dispose() { S.onDispose && S.onDispose(); cancelAnimationFrame(raf); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); el.remove(); ui.remove(); },
  };
  const ray = new THREE.Raycaster();
  const loop = now => {
    raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) { t += dt; for (const f of ticks) f(dt, t, active); }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  const P = e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H; return { x, y, ndc: new THREE.Vector2(x / W * 2 - 1, -(y / H) * 2 + 1), id: e.pointerId }; };
  el.addEventListener('pointerdown', e => { if (!active || paused) return; try { el.setPointerCapture(e.pointerId); } catch (_) {} hand.down.forEach(f => f(P(e))); });
  el.addEventListener('pointermove', e => { if (!active || paused) return; const p = P(e); p.pressed = e.buttons > 0 || e.pointerType === 'touch'; hand.move.forEach(f => f(p)); });
  const up = e => { if (!active) return; hand.up.forEach(f => f(P(e))); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return S;
}

// Top-centre status chip with the check stripe (matches the town HUD).
export function chip(S) {
  const d = S.div('position:absolute;top:28px;left:50%;transform:translateX(-50%);height:60px;border-radius:10px;overflow:hidden;background:#1c1d1f;display:flex;flex-direction:column;min-width:220px',
    '<div style="height:8px;flex-shrink:0;background:repeating-linear-gradient(90deg,#e5e043 0 24px,#d8362d 24px 48px)"></div><div style="flex:1;display:flex;align-items:center;justify-content:center;gap:14px;padding:0 20px;font-weight:800;font-size:22px;white-space:nowrap"></div>');
  const c = d.lastChild; let prev = '';
  return { set(h) { if (h !== prev) { c.innerHTML = h; prev = h; } }, el: d };
}
export const meter = (v, col = '#2f88c4', w = 120) => `<span style="display:inline-block;width:${w}px;height:12px;border-radius:6px;background:#3b3c3f;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(0, Math.min(1, v)) * 100}%;background:${col}"></span></span>`;
export const pips = (n, of, on = '#e5e043') => Array.from({ length: of }, (_, i) => `<span style="width:14px;height:14px;border-radius:3px;background:${i < n ? on : '#48494c'}"></span>`).join('');

// ---- particle fx (fire, smoke, water): soft point sprites, log-depth safe ----
const _tex = {};
function fxTex(kind) {
  if (_tex[kind]) return _tex[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.6})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); };
  if (kind === 'puff') { for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; blob(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20, 34, 0.5); } blob(64, 64, 44, 0.8); }
  else if (kind === 'drop') { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  else { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  return (_tex[kind] = new THREE.CanvasTexture(c));
}
const _v2 = new THREE.Vector2();
const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const ramp = (stops, k) => { for (let i = 1; i < stops.length; i++) if (k <= stops[i][0]) { const [k0, c0] = stops[i - 1], [k1, c1] = stops[i]; return lerp3(c0, c1, (k - k0) / Math.max(1e-6, k1 - k0)); } return stops[stops.length - 1][1]; };
function psys(N, kind, blending = THREE.NormalBlending) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1)); geo.setAttribute('col', new THREE.BufferAttribute(col, 4));
  const m = new THREE.ShaderMaterial({ uniforms: { map: { value: fxTex(kind) }, scale: { value: 500 } }, transparent: true, depthWrite: false, blending,
    vertexShader: '#include <common>\nuniform float scale; attribute float size; attribute vec4 col; varying vec4 vC;\n#include <logdepthbuf_pars_vertex>\nvoid main(){ vC = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv;\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: '#include <common>\nuniform sampler2D map; varying vec4 vC;\n#include <logdepthbuf_pars_fragment>\nvoid main(){\n#include <logdepthbuf_fragment>\nfloat a = vC.a * texture2D(map, gl_PointCoord).a; if (a < 0.004) discard; gl_FragColor = vec4(vC.rgb, a); }' });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.userData.shared = false;
  pts.onBeforeRender = (r, sc, cam) => { r.getDrawingBufferSize(_v2); m.uniforms.scale.value = cam.isPerspectiveCamera ? _v2.y / (2 * Math.tan(cam.fov * Math.PI / 360)) : _v2.y / 2; };
  const P = Array.from({ length: N }, () => ({ t: -1 }));
  return { pts, P, N, spawn() { return P.find(p => p.t < 0) || null; },
    write(i, x, y, z, s, c, a) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; size[i] = s; col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = a; },
    kill(i) { size[i] = 0; col[i * 4 + 3] = 0; },
    flush() { geo.attributes.position.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.col.needsUpdate = true; } };
}
const FIRE = [[0, rgb('#fff6c8')], [0.18, rgb('#ffd24a')], [0.45, rgb('#ff8a1a')], [0.75, rgb('#e2461f')], [1, rgb('#7a2414')]];
const SMOKE = [[0, rgb('#3b3a3a')], [1, rgb('#8e8d8b')]], STEAM = [[0, rgb('#f4f6f8')], [1, rgb('#c9d1d6')]];

// Animated fire: rising flame particles, embers, smoke column, ground glow + flickering light.
// userData.hp 0..1 (lower = smaller; 0 = out, with a burst of steam). tick(t) kept for callers; it animates itself.
export function flame(size = 1, light = true, { smoke = true } = {}) {
  const g = new THREE.Group(), F = psys(64, 'soft'), E = psys(12, 'soft', THREE.AdditiveBlending), K = smoke ? psys(22, 'puff') : null;
  g.add(F.pts, E.pts); if (K) g.add(K.pts);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('soft'), color: '#ff8a2a', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.setScalar(2.4 * size); halo.position.y = 0.55 * size; g.add(halo);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1 * size, 20), new THREE.MeshBasicMaterial({ map: fxTex('soft'), color: '#ff7a1a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; g.add(pool);
  let L = null; if (light) { L = new THREE.PointLight('#ff8a2a', 1.6, 8 * size); L.position.y = 0.9 * size; g.add(L); }
  const seed = Math.random() * 100; let wasLive = true, last = 0, accF = 0, accE = 0, accK = 0, prevHp = 1, steamT = 0, burst = false;
  const wind = new THREE.Vector3(0.25, 0, -0.1);
  const step = () => {
    const now = performance.now() / 1000, dt = last ? Math.min(0.05, now - last) : 0.016; last = now;
    const hp = Math.max(0, g.userData.hp), live = hp > 0.02, k = 0.35 + 0.65 * hp, s = size * k;
    if (live && g.visible) sfx.fire(true); // crackle while any flame is burning on screen
    if (!live && wasLive && g.visible) sfx.steam(); // hiss as it goes out
    wasLive = live;
    if (hp < prevHp - 1e-4) steamT = 0.5; prevHp = hp; steamT -= dt;
    if (!live && !burst && K) { burst = true; for (let i = 0; i < 10; i++) { const p = K.spawn(); if (!p) break; Object.assign(p, { t: 0, dur: 1.6 + Math.random(), x: (Math.random() - 0.5) * size, y: 0.3 * size, z: (Math.random() - 0.5) * size, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.6, s0: 0.6 * size, s1: 2.4 * size, steam: true }); } }
    if (live) {
      accF += dt * 90 * (0.4 + 0.6 * hp); accE += dt * 9 * hp; accK += dt * (steamT > 0 ? 14 : 7) * (0.5 + 0.5 * hp);
      while (accF >= 1) { accF--; const p = F.spawn(); if (!p) break; const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.34 * s; Object.assign(p, { t: 0, dur: 0.4 + Math.random() * 0.45, x: Math.cos(a) * r, y: 0.05 * s, z: Math.sin(a) * r, vy: (1.8 + Math.random() * 1.4) * Math.sqrt(size), s0: (0.5 + Math.random() * 0.45) * s * (1.25 - r / (0.34 * s + 1e-6) * 0.5) }); }
      while (accE >= 1) { accE--; const p = E.spawn(); if (!p) break; Object.assign(p, { t: 0, dur: 0.9 + Math.random() * 0.8, x: (Math.random() - 0.5) * 0.5 * s, y: 0.3 * s, z: (Math.random() - 0.5) * 0.5 * s, vx: (Math.random() - 0.5) * 0.9, vy: (2.2 + Math.random() * 1.8) * Math.sqrt(size), vz: (Math.random() - 0.5) * 0.9, w: Math.random() * 6 }); }
      if (K) while (accK >= 1) { accK--; const p = K.spawn(); if (!p) break; const st = steamT > 0; Object.assign(p, { t: 0, dur: 1.8 + Math.random() * 1.2, x: (Math.random() - 0.5) * 0.4 * s, y: 1.05 * s, z: (Math.random() - 0.5) * 0.4 * s, vx: (Math.random() - 0.5) * 0.3, vy: (0.9 + Math.random() * 0.6) * Math.sqrt(size), vz: (Math.random() - 0.5) * 0.3, s0: 0.5 * s, s1: (1.8 + Math.random()) * s, steam: st }); }
    }
    let alive = 0;
    F.P.forEach((p, i) => { if (p.t < 0) return F.kill(i); p.t += dt; const q = p.t / p.dur; if (q >= 1) { p.t = -1; return F.kill(i); } alive++;
      p.y += p.vy * dt; p.x *= 1 - dt * 2.2; p.z *= 1 - dt * 2.2; const wob = Math.sin(now * 9 + p.y * 3 + seed) * 0.06 * size * q;
      F.write(i, p.x + wob + wind.x * q * size * 0.4, p.y, p.z + wind.z * q * size * 0.4, p.s0 * (1 - 0.75 * q), ramp(FIRE, q), q < 0.12 ? q / 0.12 : 1 - Math.pow((q - 0.12) / 0.88, 1.6)); });
    E.P.forEach((p, i) => { if (p.t < 0) return E.kill(i); p.t += dt; const q = p.t / p.dur; if (q >= 1) { p.t = -1; return E.kill(i); } alive++;
      p.x += (p.vx + Math.sin(now * 5 + p.w) * 0.4) * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - dt * 0.6;
      E.write(i, p.x, p.y, p.z, 0.09 * size, rgb('#ffc24a'), (1 - q) * (0.6 + 0.4 * Math.sin(now * 30 + p.w))); });
    if (K) K.P.forEach((p, i) => { if (p.t < 0) return K.kill(i); p.t += dt; const q = p.t / p.dur; if (q >= 1) { p.t = -1; return K.kill(i); } alive++;
      p.x += (p.vx + wind.x) * dt; p.y += p.vy * dt; p.z += (p.vz + wind.z) * dt; p.vy *= 1 - dt * 0.25;
      K.write(i, p.x, p.y, p.z, p.s0 + (p.s1 - p.s0) * q, ramp(p.steam ? STEAM : SMOKE, q), (q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85) * (p.steam ? 0.6 : 0.5)); });
    F.flush(); E.flush(); K && K.flush();
    const fl = 0.85 + 0.1 * Math.sin(now * 13 + seed) + 0.07 * Math.sin(now * 29 + seed * 2);
    halo.visible = pool.visible = live; halo.material.opacity = 0.4 * fl * k; halo.scale.setScalar(2.4 * s * fl); pool.scale.setScalar(k * fl);
    if (L) { L.visible = live; L.intensity = 1.7 * fl * k; }
    if (!live && !alive) g.visible = false;
  };
  F.pts.onBeforeRender = ((ob) => (r, sc, cam, ...rest) => { ob(r, sc, cam, ...rest); step(); })(F.pts.onBeforeRender);
  g.userData = { hp: 1, size, tick() { if (g.userData.hp > 0.02 && !g.visible) { g.visible = true; burst = false; } } };
  return g;
}

// Water jet: a stream of droplets along an arc from api.from to api.target, splashes + mist where it lands; api.onHit(point) per droplet.
export function spray(S, { from, color = '#8fd0f5', rate = 45, arc = 1.1 } = {}) {
  const J = psys(320, 'drop'), SP = psys(120, 'drop'), M = psys(40, 'puff'); S.scene.add(J.pts, SP.pts, M.pts);
  const api = { on: false, target: new THREE.Vector3(), onHit: null, from }, C0 = rgb('#ffffff'), C1 = rgb(color);
  let acc = 0; const R = Math.max(150, rate * 3);
  S.onTick(dt => {
    if (api.on) sfx.water(true); // spray loop while the hose is on
    if (api.on) { acc += dt * R; while (acc >= 1) { acc--; const p = J.spawn(); if (!p) break; const b = api.target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.45, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.45)), d = api.from.distanceTo(b);
      Object.assign(p, { t: 0, dur: Math.max(0.16, Math.min(0.7, d / 24)) * (0.92 + Math.random() * 0.16), a: api.from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06)), b, arc: arc * Math.min(1.6, d / 8) }); } }
    J.P.forEach((p, i) => { if (p.t < 0) return J.kill(i); p.t += dt; const k = p.t / p.dur;
      if (k >= 1) { p.t = -1; J.kill(i); api.onHit && api.onHit(p.b);
        for (let n = 0; n < 2; n++) { const q = SP.spawn(); if (!q) break; const a = Math.random() * 6.28, sp = 1.2 + Math.random() * 2; Object.assign(q, { t: 0, dur: 0.35 + Math.random() * 0.25, x: p.b.x, y: p.b.y, z: p.b.z, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * sp }); }
        if (Math.random() < 0.18) { const q = M.spawn(); if (q) Object.assign(q, { t: 0, dur: 0.6 + Math.random() * 0.4, x: p.b.x, y: p.b.y + 0.1, z: p.b.z }); }
        return; }
      const x = p.a.x + (p.b.x - p.a.x) * k, y = p.a.y + (p.b.y - p.a.y) * k + Math.sin(k * Math.PI) * p.arc, z = p.a.z + (p.b.z - p.a.z) * k;
      J.write(i, x, y, z, 0.07 + k * 0.3, lerp3(C0, C1, Math.min(1, 0.35 + k * 2)), 0.85 - k * 0.25); });
    SP.P.forEach((q, i) => { if (q.t < 0) return SP.kill(i); q.t += dt; const k = q.t / q.dur; if (k >= 1) { q.t = -1; return SP.kill(i); } q.vy -= 9.8 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; SP.write(i, q.x, q.y, q.z, 0.09, C1, 0.9 * (1 - k)); });
    M.P.forEach((q, i) => { if (q.t < 0) return M.kill(i); q.t += dt; const k = q.t / q.dur; if (k >= 1) { q.t = -1; return M.kill(i); } q.y += dt * 0.5; M.write(i, q.x, q.y, q.z, 0.5 + k * 1.3, C0, 0.35 * (1 - k)); });
    J.flush(); SP.flush(); M.flush();
  });
  return api;
}

// Fire hydrant made of primitives (red, UK-ish pillar style), origin at the base.
export function hydrant() {
  const g = new THREE.Group(), red = mat('#c9302a');
  g.add(at(cyl(0.26, 0.3, 0.9, red), 0, 0.45, 0), at(cyl(0.34, 0.34, 0.08, red), 0, 0.04, 0), at(sph(0.27, red), 0, 0.92, 0), at(cyl(0.06, 0.06, 0.12, '#8a8f94'), 0, 1.2, 0));
  const out = at(cyl(0.11, 0.11, 0.3, red), 0.33, 0.62, 0); out.rotation.z = Math.PI / 2; g.add(out);
  const cap = at(cyl(0.1, 0.1, 0.18, red), -0.3, 0.62, 0); cap.rotation.z = Math.PI / 2; g.add(cap);
  return g;
}

// ---------- Minigames inside the real town ----------
// cityStage borrows the town renderer: S.scene is a local Group at the play spot (local +z = towards the camera side),
// S.camera is a local camera the kit copies onto the town camera every frame. drive:true hands the camera to the town's chase cam.
export function cityStage(host, c3, opts = {}) {
  const { x, z, yaw = 0, r = 30, drive = false, fov = 45 } = opts;
  const o = c3.mgBegin({ x, z, r, drive });
  c3.setPaused(false);
  const root = new THREE.Group(); root.position.copy(o); root.rotation.y = yaw; c3.scene.add(root); root.updateMatrixWorld(true);
  const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:0;touch-action:none'; host.appendChild(el);
  const ui = document.createElement('div'); ui.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:Archivo,sans-serif;color:#f2f1ec;opacity:0;transition:opacity .3s'; host.appendChild(ui);
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.25, 1200), real = c3.camera, ray = new THREE.Raycaster(), inv = new THREE.Matrix4();
  const ticks = [], hand = { down: [], move: [], up: [] }, spinners = [];
  let active = false, paused = false, t = 0, frameMode = 'full';
  const sync = () => {
    if (drive) return;
    root.updateMatrixWorld(); cam.updateMatrixWorld();
    real.position.copy(cam.position).applyMatrix4(root.matrixWorld); real.quaternion.copy(root.quaternion).multiply(cam.quaternion);
    if (real.fov !== cam.fov) { real.fov = cam.fov; real.updateProjectionMatrix(); }
    real.updateMatrixWorld();
  };
  c3.setMgHook(dt => { if (!paused) { t += dt; for (const sp of spinners) sp.o.rotation[sp.axis] += dt * sp.speed; for (const f of ticks) f(dt, t, active); } sync(); });
  const O0 = c3.W(0, 0);
  const S = {
    THREE, scene: root, camera: cam, ui, el, sun: c3.sun, hemi: c3.hemi, city: c3, drive, spot: opts,
    get active() { return active; }, get paused() { return paused; },
    setActive(v) { active = v; ui.style.opacity = v ? 1 : 0; },
    setPaused(v) { paused = v; c3.setPaused(v); },
    setFrame(f) { frameMode = f; if (f === 'intro') real.setViewOffset(W, H, -((INTRO_X + W) / 2 - W / 2), 0, W, H); else real.clearViewOffset(); real.updateProjectionMatrix(); },
    onTick(f) { ticks.push(f); }, on(k, f) { hand[k].push(f); },
    pick(ndc, objs) { sync(); ray.setFromCamera(ndc, real); return ray.intersectObjects(objs, true)[0] || null; },
    rayPlane(ndc, plane) { sync(); ray.setFromCamera(ndc, real); inv.copy(root.matrixWorld).invert(); const rr = ray.ray.clone().applyMatrix4(inv), v = new THREE.Vector3(); return rr.intersectPlane(plane, v) ? v : null; },
    div(css, html = '') { const d = document.createElement('div'); d.style.cssText = css; d.innerHTML = html; ui.appendChild(d); return d; },
    // city <-> local
    toLocal(cx, cz, y = 0) { const v = new THREE.Vector3(cx - (-O0.x), y, cz - (-O0.z)); return root.worldToLocal(v); },
    toCity(v) { const w = root.localToWorld(v.clone()); return { x: w.x - O0.x, z: w.z - O0.z, y: w.y }; },
    worldToLocal(v) { return root.worldToLocal(v.clone()); },
    model(id, shadow = true) { const g = c3.model(id, shadow); if (g) g.traverse(m => m.userData.spin && spinners.push({ o: m, axis: m.userData.spin.axis || 'y', speed: m.userData.spin.speed || 20 })); return g; },
    hide(test) { return c3.hideWhere(test); },
    // hide town props inside a local-space box (x0..x1, z0..z1); keep = regex of bases to leave alone
    clear(x0, x1, z0, z1, keep = /^(road_|green_|parking|land|sand|water|park_|basketball)/, grow = 0, skip = null) {
      return c3.hideWhere((r, info) => { if (keep.test(info.base) || keep.test(info.id) || (skip && skip(r))) return false; const l = S.toLocal(r[1], r[3]), g = Math.min(grow, Math.hypot(info.w * r[5], info.d * r[7]) / 2); return l.x > x0 - g && l.x < x1 + g && l.z > z0 - g && l.z < z1 + g; });
    },
    dispose() {
      S.onDispose && S.onDispose(); c3.setMgHook(null);
      root.traverse(q => { if (q.geometry && !q.userData.shared) q.geometry.dispose(); });
      c3.scene.remove(root); c3.mgEnd(); c3.setPaused(true); el.remove(); ui.remove();
    },
  };
  const P = e => { const rc = el.getBoundingClientRect(), px = (e.clientX - rc.left) / rc.width * W, py = (e.clientY - rc.top) / rc.height * H; return { x: px, y: py, ndc: new THREE.Vector2(px / W * 2 - 1, -(py / H) * 2 + 1), id: e.pointerId }; };
  el.addEventListener('pointerdown', e => { if (!active || paused) return; try { el.setPointerCapture(e.pointerId); } catch (_) {} hand.down.forEach(f => f(P(e))); });
  el.addEventListener('pointermove', e => { if (!active || paused) return; const p = P(e); p.pressed = e.buttons > 0 || e.pointerType === 'touch'; hand.move.forEach(f => f(p)); });
  const up = e => { if (!active) return; hand.up.forEach(f => f(P(e))); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return S;
}

const FLAT = /^(road_|green_|parking|land|sand|water|park_|basketball|pg_pad)/;
const SMALL = /^(tree|cc_|car|jeep|pickup|truck|tractor|bt_|rg_|hc_|dr_|sp_(hydrant|street|traffic|bench|fence|cone|coffee_shop_chair|grass_fence|big_tree|fir_tree|cube_tree|roof_helipad)|fence|bench|barrel|pallet|logs|mailbox|streetsign|sb_|pt_|pg_|lr_|hb_|cratebox|wall|tablechair|airballoon|bus|billboard|traffic|lamp|dumpster|wheelbarrow|lawnmower|gate|sign)/;
export const isBuilding = (info, minH = 3) => !FLAT.test(info.base) && !SMALL.test(info.base) && !SMALL.test(info.id) && info.h >= minH;

// Nearest building face to (x,z): returns a frame on the face (local -z = into the building) + face size.
export function faceFrame(c3, x, z, { minH = 3, minW = 5, r = 60, maxH = 1e9, test } = {}) {
  let best = null;
  for (const b of c3.near(x, z, r, info => (test ? test(info) : isBuilding(info, minH)))) {
    if (b.h > maxH) continue;
    const dx = x - b.x, dz = z - b.z, cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, hw = b.w / 2, hd = b.d / 2;
    const xf = Math.abs(lx) - hw > Math.abs(lz) - hd, fw = xf ? b.d : b.w; if (fw < minW) continue;
    const nl = xf ? [Math.sign(lx) || 1, 0] : [0, Math.sign(lz) || 1], cl = xf ? [nl[0] * hw, 0] : [0, nl[1] * hd];
    const gap = Math.max(Math.abs(lx) - hw, Math.abs(lz) - hd);
    if (best && gap >= best.gap) continue;
    const w = (a, c) => [a * cs + c * sn, -a * sn + c * cs], n = w(nl[0], nl[1]), cc = w(cl[0], cl[1]);
    best = { gap, x: b.x + cc[0], z: b.z + cc[1], yaw: Math.atan2(n[0], n[1]), fw, h: b.top, depth: xf ? b.w : b.d, b };
  }
  return best || { x, z, yaw: 0, fw: 10, h: 8, depth: 10, b: null };
}
// Road segment nearest (x,z): frame at its centre, local +z along the road.
export function roadFrame(c3, x, z) {
  const segs = ((c3.city && c3.city.segs) || []).filter(s => !s.bridge); let best = null, bd = 1e9;
  for (const s of segs) { const cx = s.x + s.w / 2, cz = s.z + s.d / 2, d = Math.hypot(cx - x, cz - z); if (d < bd) { bd = d; best = s; } }
  if (!best) return { x, z, yaw: 0, len: 40 };
  return { x: best.x + best.w / 2, z: best.z + best.d / 2, yaw: best.v ? 0 : Math.PI / 2, len: best.v ? best.d : best.w, seg: best };
}
// Frame at (x,z) whose +z points at the nearest road (camera stands on the road side).
export function towardRoad(c3, x, z) {
  const segs = (c3.city && c3.city.segs) || []; let bp = null, bd = 1e9;
  for (const s of segs) { const px = Math.max(s.x, Math.min(s.x + s.w, x)), pz = Math.max(s.z, Math.min(s.z + s.d, z)), d = Math.hypot(px - x, pz - z); if (d > 0.5 && d < bd) { bd = d; bp = [px, pz]; } }
  return { x, z, yaw: bp ? Math.atan2(bp[0] - x, bp[1] - z) : 0, roadD: bd };
}
// Frame at (x,z) whose +z points out over open water.
export function waterFrame(c3, x, z) {
  let best = null;
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a); let wet = 0; for (const d of [15, 25, 40, 60]) if (!c3.isLand(x + sx * d, z + sz * d)) wet++; if (!best || wet > best.wet) best = { wet, a }; }
  return { x, z, yaw: best ? best.a : 0 };
}
// Drive buttons that steer the real fire engine (arrow keys already work in the town).
export function driveButtons(S) {
  const c3 = S.city, btns = [];
  const mk = (parent, k, ic, w, h, isz) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;border-radius:18px;background:#1c1d1f;color:#f2f1ec;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:pointer`; b.innerHTML = icon(ic, isz); parent.appendChild(b);
    const set = on => { c3.setKey(k, on); b.style.background = on ? C.hv : '#1c1d1f'; b.style.color = on ? C.ink : '#f2f1ec'; };
    b.addEventListener('pointerdown', e => { if (!S.active || S.paused) return; e.preventDefault(); set(true); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => set(false))); btns.push(b); return b; };
  const left = S.div('position:absolute;left:28px;bottom:28px;display:flex;gap:14px;pointer-events:auto'), right = S.div('position:absolute;right:28px;bottom:28px;display:flex;flex-direction:column;gap:12px;pointer-events:auto');
  mk(left, 'l', 'arrow_left', 128, 128, 96); mk(left, 'r', 'arrow_right', 128, 128, 96); mk(right, 'f', 'arrow_drop_up', 128, 150, 120); mk(right, 'b', 'arrow_drop_down', 128, 96, 96);
  return btns;
}
// A clone of a town model, placed at a local position.
export const put = (S, id, x, y, z, yaw = 0, s = 1) => { const m = S.model(id); if (!m) return null; m.position.set(x, y, z); m.rotation.y = yaw; if (s !== 1) m.scale.setScalar(s); S.scene.add(m); return m; };
export const once = f => { let d = false; return (...a) => { if (!d) { d = true; f(...a); } }; };
export const sep = '<span style="width:1px;height:28px;background:#3b3c3f"></span>';
