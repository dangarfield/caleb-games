// engine.js — renderer, RAF loop, current view (scene+camera), resize, canvas pointer helpers.
import * as THREE from 'three';

// Performance mode (low-power tablets): no MSAA, 1× resolution, 30 fps cap. Per device, so it lives in
// localStorage (read before the WebGL context exists — antialias can't change afterwards). ?perf=1 / ?perf=0 overrides.
const PERF_KEY = 'peg-leg-ted:perf';
export function readPerf() {
  try { const q = new URLSearchParams(location.search).get('perf'); if (q === '1' || q === '0') return q === '1'; } catch (e) {}
  try { return localStorage.getItem(PERF_KEY) === '1'; } catch (e) { return false; }
}
export function writePerf(on) { try { localStorage.setItem(PERF_KEY, on ? '1' : '0'); } catch (e) {} }
const prFor = perf => Math.min(window.devicePixelRatio || 1, perf ? 1 : 1.5);

export function createEngine(canvas) {
  let perf = readPerf();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !perf, powerPreference: 'high-performance' });
  renderer.setPixelRatio(prFor(perf));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;         // low-end tablets: no shadow maps (no mode casts shadows)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x10202f, 1);

  let scene = null, camera = null, tick = null, running = false, last = 0, time = 0;
  let frozen = false, dirty = true; // frozen = a full-screen menu is over a paused scene: keep the last frame, skip rendering
  const size = { w: 1, h: 1 };
  const resizeFns = new Set();

  function resize() {
    size.w = window.innerWidth; size.h = window.innerHeight;
    renderer.setSize(size.w, size.h, false); dirty = true;
    if (camera && camera.isPerspectiveCamera) { camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); }
    resizeFns.forEach(f => { try { f(size); } catch (e) { console.error(e); } });
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (perf && now - last < 1000 / 30 - 4) return;   // 30 fps cap in performance mode
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now; time += dt;
    if (tick) { try { tick(dt, time); } catch (e) { console.error(e); } }
    if (frozen && !dirty) return;
    dirty = false;
    if (scene && camera) renderer.render(scene, camera); else renderer.clear();
  }

  // ---- pointer helpers for the 3D canvas (#ui above it is pointer-events:none) ----
  const _v2 = new THREE.Vector2(), _ray = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
  const pointer = {
    /** Normalised device coords of a pointer event (Vector2, reused unless `out` given). */
    ndc(e, out = _v2) { const r = canvas.getBoundingClientRect(); return out.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); },
    /** Raycast from a pointer event into objects (recursive). Returns intersections. */
    raycast(e, objects, cam = camera) { if (!cam) return []; _ray.setFromCamera(pointer.ndc(e), cam); return _ray.intersectObjects(objects, true); },
    /** Where a pointer event hits the horizontal plane y = h (Vector3, reused) or null. */
    ground(e, h = 0, cam = camera) { if (!cam) return null; _ray.setFromCamera(pointer.ndc(e), cam); _plane.constant = -h; return _ray.ray.intersectPlane(_plane, _hit); },
    /** Listen on the canvas: {down, move, up, tap}. tap = short press without much movement. Returns unsubscribe. */
    on(h) {
      let sx = 0, sy = 0, st = 0, id = null;
      const dn = e => { id = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now(); h.down && h.down(e); };
      const mv = e => { h.move && h.move(e); };
      const up = e => { h.up && h.up(e); if (h.tap && e.pointerId === id && Math.hypot(e.clientX - sx, e.clientY - sy) < 18 && performance.now() - st < 500) h.tap(e); id = null; };
      canvas.addEventListener('pointerdown', dn); canvas.addEventListener('pointermove', mv); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      return () => { canvas.removeEventListener('pointerdown', dn); canvas.removeEventListener('pointermove', mv); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); };
    },
  };

  /** Dispose a subtree: calls .dispose() on objects that provide one (PLT factories), else disposes
   *  geometries. Materials/textures are disposed only if opts.materials (PLT materials are shared!). */
  function disposeTree(root, { materials = false } = {}) {
    if (!root) return;
    root.traverse(o => {
      if (o !== root && typeof o.dispose === 'function' && !o.isMesh) { try { o.dispose(); } catch (e) {} }
      if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
      if (materials && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map && m.map.dispose(); m.dispose(); });
    });
    if (root.parent) root.parent.remove(root);
  }

  return {
    THREE, renderer, canvas, size, pointer, disposeTree,
    get scene() { return scene; }, get camera() { return camera; }, get time() { return time; },
    get perf() { return perf; },
    /** Performance mode: resolution and the fps cap change now; anti-aliasing (and PLT's cheaper materials) on the next load. */
    setPerf(on) { perf = !!on; writePerf(perf); renderer.setPixelRatio(prFor(perf)); resize(); },
    /** Stop redrawing (the last frame stays on screen) while a menu covers a paused scene. */
    setFrozen(on) { frozen = !!on; dirty = true; },
    /** Set what is rendered. Mode owns the scene and disposes it on exit. */
    setView(s, c) { scene = s; camera = c; dirty = true; if (c && c.isPerspectiveCamera) { c.aspect = size.w / size.h; c.updateProjectionMatrix(); } },
    clearView() { scene = null; camera = null; },
    setTick(fn) { tick = fn; },
    onResize(fn) { resizeFns.add(fn); return () => resizeFns.delete(fn); },
    aspect: () => size.w / size.h,
    start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); },
    stop() { running = false; },
  };
}
