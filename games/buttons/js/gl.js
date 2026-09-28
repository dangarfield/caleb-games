/* gl.js — one WebGL renderer shared by every room, the inspect close-up excepted, and the Big Dipper ride.
 * Low-power tablets run out of WebGL contexts if a new renderer is made per room, so there is one canvas
 * that moves between hosts. Pixel ratio is capped (MAX_PR) and a quality governor drops shadows and the
 * pixel ratio once if the first couple of seconds of a scene run slow. Add ?hq to the URL to switch it off. */
import * as THREE from 'three';

export const STAGE_W = 1333, STAGE_H = 690, MAX_PR = 1.5;
/* stencil: true — the window portals in rooms 9 and 10 need it (three r163+ turned it off by default) */
let R = null, PR = 1, low = false;
const HQ = /[?&]hq\b/.test(location.search);

export function setPixelRatio(pr) { PR = Math.max(.75, Math.min(MAX_PR, pr)); if (R && !low) R.setPixelRatio(PR); }
export function getRenderer(host) {
  if (!R) {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.setPixelRatio(low ? 1 : PR); R.setSize(STAGE_W, STAGE_H, false);
    R.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
  }
  R.setClearColor(0x000000, 0);
  if (host && R.domElement.parentNode !== host) host.appendChild(R.domElement);
  return R;
}
export function detach() { if (R && R.domElement.parentNode) R.domElement.parentNode.removeChild(R.domElement); }
export const isLow = () => low;

/* frame-time governor: call tick() every frame; returns true once, on the frame it decides to go low */
export function governor() {
  let n = 0, t0 = 0, done = HQ || low;
  return function tick(now) {
    if (done) return false;
    if (n === 0) t0 = now;
    if (++n < 90) return false;
    done = true;
    const fps = 89 / ((now - t0) / 1000);
    if (fps < 36) { low = true; if (R) R.setPixelRatio(1); console.info('[buttons] slow device (' + fps.toFixed(0) + ' fps): shadows off, pixel ratio 1'); return true; }
    return false;
  };
}

/* free everything a scene put on the GPU (geometry, materials, textures) */
export function disposeScene(scene) {
  const seen = new Set();
  scene.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (seen.has(m)) continue; seen.add(m);
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      m.dispose();
    }
  });
  if (scene.background && scene.background.isTexture) scene.background.dispose();
  if (R) R.renderLists.dispose();
}
