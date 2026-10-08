// Portal Lab 3D — engine entry. Load with: const { Game } = await import('./game/game.js')
// new Game({ refs, levels, getProps, onState }).boot()
import { World } from './world.js';
import { Assets } from './assets.js';
import { Props } from './props.js';
import { Portals } from './portals.js';
import { Physics } from './physics.js';
import { Input } from './input.js';
import { buildCharacter } from './character.js';
import { buildGun } from './gun.js';

export class Game {
  constructor({ refs, levels, getProps, onState }) {
    Object.assign(this, {"K":{"G":18,"JUMP":6.5,"WALK":4.5,"GACC":40,"AACC":10,"TERM":30,"HW":0.3,"HH":0.85,"EYE":0.7,"STEP":0.008333333333333333},"COL":{"a":3902719,"b":16732104},"HEX":{"a":"#3B8CFF","b":"#FF4FC8"},"FACES":[{"n":[1,0,0],"t":[1,2],"s":0.86,"c":[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]},{"n":[-1,0,0],"t":[1,2],"s":0.86,"c":[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},{"n":[0,1,0],"t":[0,2],"s":1,"c":[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},{"n":[0,-1,0],"t":[0,2],"s":0.62,"c":[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},{"n":[0,0,1],"t":[0,1],"s":0.76,"c":[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},{"n":[0,0,-1],"t":[0,1],"s":0.76,"c":[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]}],"move":{"x":0,"y":0},"keys":{},"ptrs":{},"stickId":null,"yaw":0,"pitch":0,"jumpQ":0,"coyote":0,"hurt":0,"acc":0,"time":0,"passes":0,"fAcc":0,"fN":0,"cpuAcc":0,"slowN":0,"fastN":0,"ema":0,"beepT":0,"cubes":[],"pads":[],"doors":[],"droppers":[],"turrets":[],"held":null});
    this.state = {"screen":"loading","level":0,"haveA":false,"haveB":false,"toastMsg":"","cleared":[],"stats":"","err":"","gyroOK":false,"canGrab":false,"holding":false,"gun":"both","aimOK":false,"pads":""};
    Object.assign(this, refs);
    this.LEVELS = levels; this.getProps = getProps; this.onState = onState;
    for (const k of ["frame","tDown","tMove","tUp"]) this[k] = this[k].bind(this);
  }
  get props() { return (this.getProps && this.getProps()) || {}; }
  setState(p) { Object.assign(this.state, p); if (this.onState) this.onState(p); }
  init() {
    const T = this.T;
    const R = (this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    R.info.autoReset = false; R.localClippingEnabled = true;
    R.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    this.mountRef.current.appendChild(R.domElement);
    const S = (this.scene = new T.Scene());
    S.background = new T.Color(0x02080a); S.fog = new T.Fog(0x02080a, 22, 60);
    this.camera = new T.PerspectiveCamera(75, 1, 0.05, 120); this.camera.rotation.order = 'YXZ';
    this.vcam = new T.PerspectiveCamera(75, 1, 0.05, 120); this.vcam.layers.enable(1);
    this.rt = { a: new T.WebGLRenderTarget(16, 16, { samples: 4 }), b: new T.WebGLRenderTarget(16, 16, { samples: 4 }) };
    this.v = { buf: new T.Vector2(), plane: new T.Plane(), c4: new T.Vector4(), q4: new T.Vector4(), m3: new T.Matrix3(), fr: new T.Frustum(), pm: new T.Matrix4(), t: new T.Vector3() };
    this.rotY = new T.Matrix4().makeRotationY(Math.PI);
    this.makeAssets();
    this.levelGroup = new T.Group(); S.add(this.levelGroup);
    this.char = buildCharacter(T); this.heldGun = buildGun(T);
    const body = (this.body = this.char.group);
    body.traverse((o) => o.layers.set(1)); S.add(body);
    this.portals = { a: null, b: null };
    this.resize = () => this.doResize(); window.addEventListener('resize', this.resize);
    const map = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
    this.kd = (e) => this.onKey(e, true, map); this.ku = (e) => this.onKey(e, false, map);
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
    this.onMotion = (e) => this.motion(e); window.addEventListener('devicemotion', this.onMotion);
    this.onLock = () => { const locked = document.pointerLockElement === this.touchRef.current; if (locked) this.lockOK = true; this.setState({ locked }); if (!locked && this.lockOK && this.state.screen === 'play') this.pause(true); };
    this.onLockErr = () => { if (this.lockOK) return; this.lockFailed = true; this.setState({ lockFailed: true }); };
    this.onMouse = (e) => this.mouseLook(e);
    document.addEventListener('pointerlockchange', this.onLock); document.addEventListener('pointerlockerror', this.onLockErr);
    document.addEventListener('mousemove', this.onMouse);
    this.loadLevel(0);
    this.applyQuality(true);
    this.setState({ screen: 'home' });
    this.raf = requestAnimationFrame(this.frame);
  }
  perf(dt, cpu) {
    this.fAcc += dt; this.fN++; this.cpuAcc += cpu; this.ema = this.ema ? this.ema * 0.95 + dt * 0.05 : dt;
    if (this.fAcc < 0.5) return;
    if (this.qMode === 'Auto') {
      if (this.ema > 0.0195) { this.slowN++; this.fastN = 0; } else if (this.ema < 0.0135) { this.fastN++; this.slowN = 0; } else { this.slowN = this.fastN = 0; }
      if (this.slowN >= 2 && this.pr > (this.qMode === 'Low' ? 0.6 : 0.75)) { this.pr -= 0.25; this.slowN = 0; this.doResize(); }
      if (this.fastN >= 6 && this.pr < this.maxPr) { this.pr = Math.min(this.maxPr, this.pr + 0.25); this.fastN = 0; this.doResize(); }
    }
    if (this.props.showStats || this.showPerf) {
      const b = this.renderer.getDrawingBufferSize(this.v.buf), info = this.renderer.info.render;
      const fps = Math.round(this.fN / this.fAcc);
      const txt = `${fps} fps · ${(this.cpuAcc / this.fN).toFixed(1)} ms render CPU · ${info.calls} draws · ${this.passes} portal passes · ${b.x}×${b.y} (×${this.pr.toFixed(2)}) · portal tex ×${this.portalScale}`;
      const pi = { fps, ms: (this.cpuAcc / this.fN).toFixed(1), draws: info.calls, passes: this.passes, res: b.x + '×' + b.y, scale: this.pr.toFixed(2), tex: this.portalScale, mode: this.qMode === 'Low' ? 'PERFORMANCE' : this.qMode.toUpperCase() };
      if (txt !== this.state.stats) this.setState({ stats: txt, perfInfo: pi });
    }
    this.fAcc = 0; this.fN = 0; this.cpuAcc = 0;
  }
  frame(ts) {
    this.raf = requestAnimationFrame(this.frame);
    const now = ts / 1000, dt = Math.min(0.05, this.last ? now - this.last : 0.016); this.last = now; this.time += dt;
    this.applyQuality(false);
    if (this.state.screen === 'play') {
      this.acc += dt; let n = 0;
      while (this.acc >= this.K.STEP && n < 10) { this.step(this.K.STEP); this.acc -= this.K.STEP; n++; }
      if (n >= 10) this.acc = 0;
    } else { this.acc = 0; if (this.state.screen === 'home' || this.state.screen === 'chambers') this.yaw += dt * 0.08; }
    const p = this.pl;
    this.camera.position.set(p.x, p.y + this.K.EYE, p.z); this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.body.position.set(p.x, p.y - this.K.HH, p.z); this.body.rotation.y = this.yaw + Math.PI;
    const hasGun = this.gun && this.gun !== 'none';
    if (hasGun !== this.bodyHasGun) { this.bodyHasGun = hasGun; this.char.setGun(hasGun ? this.heldGun.group : null); this.body.traverse((o) => o.layers.set(1)); }
    this.heldGun.setCore(this.lastFired === 'b' ? 0xff4fc8 : 0x3b8cff);
    this.char.update(dt, this.state.screen === 'play' ? Math.hypot(p.vx, p.vz) : 0, !p.onGround);
    for (const k of ['a', 'b']) { const P = this.portals[k]; if (P && P.anim < 1) { P.anim = Math.min(1, P.anim + dt * 6); const e = 1 - Math.pow(1 - P.anim, 3); P.inner.scale.setScalar(Math.max(0.01, e)); } }
    this.mat.exitGlow.opacity = 0.22 + 0.14 * Math.sin(this.time * 4);
    if (this.state.screen === 'play') this.updateShots(dt);
    this.animateProps(dt);
    const holding = !!this.held, canGrab = holding || (this.state.screen === 'play' && !!this.grabTarget());
    if (holding !== this.state.holding || canGrab !== this.state.canGrab) this.setState({ holding, canGrab });
    this.aimCheck(); const t0 = performance.now(); this.render(); this.perf(dt, performance.now() - t0);
  }
  boot() {
    this.noCtx = (e) => e.preventDefault();
    document.addEventListener('contextmenu', this.noCtx);
    import('https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js')
      .then((T) => { this.T = T; this.init(); })
      .catch((e) => this.setState({ err: 'Could not load three.js: ' + e.message }));
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('contextmenu', this.noCtx);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
    window.removeEventListener('devicemotion', this.onMotion);
    document.removeEventListener('pointerlockchange', this.onLock); document.removeEventListener('pointerlockerror', this.onLockErr);
    document.removeEventListener('mousemove', this.onMouse);
    if (document.pointerLockElement) document.exitPointerLock();
    clearTimeout(this.toastT);
    if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
  }
}
Object.assign(Game.prototype, World, Assets, Props, Portals, Physics, Input);
