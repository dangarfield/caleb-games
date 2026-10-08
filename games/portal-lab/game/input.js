// Touch / mouse-lock / keyboard / gyro input, audio blips, toasts, start & pause.
// Mixed into Game.prototype — every method runs with `this` = the Game.
import { Sfx } from './sfx.js';
export const Input = {
  audio() {
    if (!this.snd) this.snd = new Sfx();
    this.snd.resume(); this.snd.setVolumes(this.sfx ?? 1, this.musicVol ?? 0.6);
    if (this.wantMusic !== false) this.snd.music(true);
  },
  play(id, gain) { if (this.snd) this.snd.play(id, gain); },
  tone() {},
  toast(msg) { this.setState({ toastMsg: msg }); clearTimeout(this.toastT); this.toastT = setTimeout(() => this.setState({ toastMsg: '' }), 1800); },
  mouseLook(e) {
    if (this.state.screen !== 'play' || this.dead > 0) return;
    const el = this.touchRef.current, locked = document.pointerLockElement === el;
    if (!locked) return;
    const s = 0.0022 * (this.props.lookSpeed ?? 1);
    this.yaw -= (e.movementX || 0) * s; this.pitch = this.clamp(this.pitch - (e.movementY || 0) * s, -1.45, 1.45);
  },
  releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); },
  tDown(e) {
    if (this.state.screen !== 'play') return;
    this.audio();
    const el = e.currentTarget;
    if (e.pointerType === 'mouse') {
      if (!this.state.mouseUser) this.setState({ mouseUser: true });
      if (this.lockFailed) { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); this.ptrs[e.pointerId] = { lx: e.clientX, ly: e.clientY, moved: 0, drag: false, mouse: true, button: e.button }; return; }
      if (document.pointerLockElement !== el && !this.lockFailed) {
        try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => this.onLockErr()); } catch (err) { this.onLockErr(); }
        return;
      }
      e.preventDefault();
      if (e.button === 1) this.toggleGrab(); else this.fireAt(0, 0, e.button === 2 ? 'b' : 'a');
      return;
    }
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    const x = e.clientX, y = e.clientY;
    if (x < el.clientWidth * 0.42 && this.stickId == null) {
      this.stickId = e.pointerId; this.stickO = { x, y }; this.move.x = this.move.y = 0;
      const s = this.stickRef.current; if (s) { s.style.display = 'flex'; s.style.left = x - 105 + 'px'; s.style.top = y - 105 + 'px'; }
      const k = this.knobRef.current; if (k) k.style.transform = '';
      return;
    }
    this.ptrs[e.pointerId] = { lx: x, ly: y, moved: 0, drag: false };
  },
  tMove(e) {
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickO.x, dy = e.clientY - this.stickO.y, R = 90, l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
      this.move.x = (dx * k) / R; this.move.y = (-dy * k) / R;
      if (Math.hypot(this.move.x, this.move.y) < 0.15) this.move.x = this.move.y = 0;
      const kn = this.knobRef.current; if (kn) kn.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      return;
    }
    const q = this.ptrs[e.pointerId]; if (!q) return;
    const dx = e.clientX - q.lx, dy = e.clientY - q.ly; q.lx = e.clientX; q.ly = e.clientY; q.moved += Math.abs(dx) + Math.abs(dy);
    if (!q.drag && q.moved > 10) q.drag = true;
    if (!q.drag) return;
    const s = 0.0042 * (this.props.lookSpeed ?? 1);
    this.yaw -= dx * s; this.pitch = this.clamp(this.pitch - dy * s, -1.45, 1.45);
  },
  tUp(e) {
    if (e.pointerId === this.stickId) { this.stickId = null; this.move.x = this.move.y = 0; const s = this.stickRef.current; if (s) s.style.display = 'none'; return; }
    const q = this.ptrs[e.pointerId]; if (q) { delete this.ptrs[e.pointerId]; this.audio(); if (q.mouse && !q.drag && this.state.screen === 'play') { if (q.button === 1) this.toggleGrab(); else this.fireAt(0, 0, q.button === 2 ? 'b' : 'a'); } }
  },
  onKey(e, down) {
    // Move: R forward · F back · D left · G right (arrows also work)
    const k0 = e.key.toLowerCase();
    const dir = { r: 'w', f: 's', d: 'a', g: 'd', arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' }[k0];
    if (dir) this.keys[dir] = down;
    if (down && !e.repeat) {
      if (this.state.screen === 'play') {
        this.audio();
        if (k0 === ' ') this.jumpQ = 0.15;
        if (k0 === 'i') this.fireAt(0, 0, 'a');
        if (k0 === 'o') this.fireAt(0, 0, 'b');
        if (k0 === 't') this.toggleGrab();
        if (k0 === 'backspace') this.loadLevel(this.li);
        if (k0 === 'escape') this.pause(true);
      } else if (this.state.screen === 'paused' && k0 === 'escape') { this.pause(false); this.lockMouse(); }
      if (k0 === 'p' && !e.repeat) { this.showPerf = !this.showPerf; this.setState({ showPerf: this.showPerf }); }
    }
    if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'backspace'].includes(k0)) e.preventDefault();
  },
  motion(e) {
    if (!(this.props.gyro ?? false) || this.state.screen !== 'play') { this.lastMot = null; return; }
    const r = e.rotationRate; if (!r || r.alpha == null) return;
    const now = performance.now(), dt = this.lastMot ? Math.min(0.1, (now - this.lastMot) / 1000) : 0; this.lastMot = now; if (!dt) return;
    const raw = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0, a = ((raw % 360) + 360) % 360;
    let yr, pr;
    if (a === 90) { yr = r.beta; pr = -r.gamma; } else if (a === 270) { yr = -r.beta; pr = r.gamma; } else if (a === 180) { yr = -r.gamma; pr = -r.beta; } else { yr = r.gamma; pr = r.beta; }
    const k = Math.PI / 180;
    this.yaw += yr * k * dt; this.pitch = this.clamp(this.pitch + pr * k * dt, -1.45, 1.45);
  },
  lockMouse() {
    const el = this.touchRef.current;
    if (el && !this.lockFailed && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      this.setState({ mouseUser: true });
      try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => this.onLockErr()); } catch (err) { this.onLockErr(); }
    }
  },
  begin() {
    if (!this.T) return; this.audio(); this.elapsed = 0; this.portalCount = 0; this.setState({ screen: 'play', level: this.li }); this.lockMouse();
  },
  start(i) { if (!this.T) return; this.loadLevel(i); this.begin(); },
  pause(on) {
    if (on && this.state.screen === 'play') { this.releaseMouse(); this.setState({ screen: 'paused' }); }
    if (!on && this.state.screen === 'paused') this.setState({ screen: 'play' });
  },
};
