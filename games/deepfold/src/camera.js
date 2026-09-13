/* camera.js — orthographic view onto a flat world.
 *
 * The whole game is a collage lying on the XY plane, so there is no perspective
 * here at all: an orthographic camera keeps a piece of paper the same size
 * wherever it sits in z, which is what lets the parallax layers be *behind* the
 * play plane without being *smaller* than they were authored.
 *
 * The one fixed number is VIEW_HEIGHT. The visible play area is always 100
 * world units tall on every device; the width is whatever the aspect ratio
 * gives, so a wide phone sees further ahead than an iPad does. Everything else
 * in the game is written against that 100.
 */
import * as THREE from 'three';

export const VIEW_HEIGHT = 100;

/* z bands. Nothing enforces these — they are the shared agreement that stops
   the backdrop and the ship arguing about who is in front. */
export const Z = {
  BACK_FAR: -40, BACK_NEAR: -5,    // parallax layers
  PLAY: 0, PLAY_TOP: 5,            // ship, enemies, bullets, terrain
  FORE: 6, FORE_TOP: 10,           // foreground paper that passes over the play
};

export function createView(canvas, { background = 0x1f8fe8, maxPixelRatio = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  });
  renderer.setClearColor(background, 1);
  // No lights in the scene, so no tone mapping and no colour-space surprises:
  // the hex a piece asks for is the hex that lands on the screen.
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  // Frustum is set properly in resize(); these are placeholders.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  scene.add(camera);

  const view = {
    renderer, scene, camera,
    width: VIEW_HEIGHT, height: VIEW_HEIGHT, aspect: 1,
    rect: null,                  // cached canvas rect, see worldToScreen
    resize, render, setBackground, dispose,
  };

  function resize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    const aspect = w / h;
    // Cap DPR at 2. Beyond that an iPad is filling four times the pixels for a
    // difference nobody can see on flat colour with no texture detail.
    renderer.setPixelRatio(Math.min(maxPixelRatio, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);

    const halfH = VIEW_HEIGHT / 2;
    const halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW;
    camera.top = halfH; camera.bottom = -halfH;
    camera.near = 0.1; camera.far = 200;
    camera.updateProjectionMatrix();

    view.aspect = aspect;
    view.width = halfW * 2;
    view.height = VIEW_HEIGHT;
    view.rect = null;            // re-measured lazily by worldToScreen
    return view;
  }

  function render() { renderer.render(scene, camera); }

  function setBackground(hex) {
    renderer.setClearColor(hex, 1);
    scene.background.set(hex);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.removeEventListener('scroll', invalidateRect);
    renderer.dispose();
  }

  // Safari fires orientationchange before the new layout size is readable, so
  // resize once now and once on the next frame.
  function onResize() { resize(); requestAnimationFrame(resize); }
  function invalidateRect() { view.rect = null; }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  // Scrolling moves the canvas without resizing it, so the cached rect's
  // left/top go stale even though its width and height do not.
  window.addEventListener('scroll', invalidateRect, { passive: true });

  resize();
  return view;
}

/* Screen pixel position of a world point — used to pin HTML captions and a
 * charge meter to things in the scene without duplicating the projection maths
 * at every call site.
 *
 * Called once per tracked point per frame, so it allocates nothing and, more
 * importantly, does not measure the canvas. getBoundingClientRect can force a
 * synchronous layout, which is the expensive half of what this used to do; the
 * rect only changes when the canvas does, so it is cached and invalidated by
 * resize() instead.
 */
const _proj = new THREE.Vector3();

export function worldToScreen(view, x, y, z = 0, out = { x: 0, y: 0 }) {
  _proj.set(x, y, z).project(view.camera);
  const r = view.rect || (view.rect = view.renderer.domElement.getBoundingClientRect());
  out.x = r.left + (_proj.x * 0.5 + 0.5) * r.width;
  out.y = r.top + (-_proj.y * 0.5 + 0.5) * r.height;
  return out;
}
