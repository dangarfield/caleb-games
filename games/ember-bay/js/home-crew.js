// Character portraits: the home-screen crew (Caleb = Casual_Male, Ezra = Casual2_Male) and Chief Ember in the
// story (Cowboy_Male, head and shoulders via opts.bust). Idle unless selected, then Victory.
// One small WebGL renderer draws both characters and copies each frame into the two card canvases.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadPeople } from './city-assets.js';

export async function createCrew(getCanvases, ids = ['person_casual_male', 'person_casual2_male'], opts = {}) {
  const P = await loadPeople('../_shared/assets/', ids);
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.outputColorSpace = THREE.SRGBColorSpace; gl.setClearColor(0x000000, 0);
  const rigs = ids.map(id => {
    const src = P.get(id), scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#6d6e6b', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.8); sun.position.set(2, 4, 3); scene.add(sun);
    const o = SkeletonUtils.clone(src.scene); scene.add(o);
    const h = 1.75;
    const mx = new THREE.AnimationMixer(o), clip = n => src.clips.find(c => c.name === n);
    const idle = mx.clipAction(clip('Idle') || src.clips[0]), win = mx.clipAction(clip('Victory') || clip('Jump') || src.clips[0]);
    idle.play(); win.setEffectiveWeight(0); win.play();
    const cam = new THREE.PerspectiveCamera(30, 0.8, 0.1, 50);
    if (opts.bust) { cam.position.set(h * 0.12, h * 0.88, h * 1.15); cam.lookAt(0, h * 0.82, 0); } // head and shoulders, slightly to one side
    else { cam.position.set(0, h * 0.6, h * 2.55); cam.lookAt(0, h * 0.5, 0); }
    return { scene, o, mx, idle, win, cam, w: 0 };
  });
  let sel = -1, active = true, raf = 0, last = performance.now();
  const loop = now => {
    raf = requestAnimationFrame(loop); if (!active) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const cvs = getCanvases();
    rigs.forEach((r, i) => {
      const c = cvs[i]; if (!c || !c.clientWidth) return;
      const target = i === sel ? 1 : 0; r.w += (target - r.w) * Math.min(1, dt * 6); r.win.setEffectiveWeight(r.w); r.idle.setEffectiveWeight(1 - r.w); r.mx.update(dt);
      const pr = Math.min(2, devicePixelRatio || 1), W = Math.round(c.clientWidth * pr), H = Math.round(c.clientHeight * pr);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      gl.setSize(W, H, false); r.cam.aspect = W / H; r.cam.updateProjectionMatrix(); gl.render(r.scene, r.cam);
      const x = c.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(gl.domElement, 0, 0);
    });
  };
  raf = requestAnimationFrame(loop);
  return {
    setSel(i) { sel = i; },
    setActive(v) { active = !!v; },
    dispose() { cancelAnimationFrame(raf); gl.dispose(); gl.forceContextLoss && gl.forceContextLoss(); },
  };
}
