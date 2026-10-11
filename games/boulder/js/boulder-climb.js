// <boulder-climb overhang="8" difficulty="1" reach="true"> — playable Boulder demo. Emits bubbling 'boulder' events
// {type:'start'|'tick'|'grab'|'move'|'slip'|'falling'|'fall'|'top', ...}. Methods: load(i), retry(), setPaused(b).
(function () {
  const base = document.baseURI;
  class BoulderClimb extends HTMLElement {
    static get observedAttributes() { return ['overhang', 'character', 'look', 'infinite', 'fast']; }
    connectedCallback() {
      this.style.cssText += ';display:block;position:absolute;inset:0;overflow:hidden;touch-action:none';
      if (this._started) return; this._started = true;
      Promise.all([
        import('https://unpkg.com/three@0.160.0/build/three.module.js'),
        import(new URL('js/boulder-core.js', base).href),
        import(new URL('js/boulder-scene.js', base).href)
      ]).then(([T, C, S]) => this.init(T, C, S));
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); if (this.r) { this.r.dispose(); this.r.forceContextLoss(); this.r.domElement.remove(); this.ui && this.ui.remove(); } this._started = false; }
    attributeChangedCallback(n) {
      if (this.wallRoot) this.wallRoot.rotation.x = (+(this.getAttribute('overhang') ?? 8)) * Math.PI / 180;
      if (this.pip && (n === 'character' || n === 'look')) this.S.applyLook(this.pip, this.look());
      if (n === 'fast' && this.r) this.applyFast();
      if (n === 'infinite' && this.getAttribute('infinite') === 'true' && this.status === 'climb') this.practice = true;
    }
    applyFast() {
      const f = this.getAttribute('fast') === 'true';
      this.r.setPixelRatio(f ? 1 : Math.min(devicePixelRatio, 1.5)); this.r.shadowMap.enabled = !f;
      this.scene && this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      this._ro && this.r.setSize(this.clientWidth || 1, this.clientHeight || 1, false);
    }
    look() { let o = {}; try { o = JSON.parse(this.getAttribute('look') || '{}'); } catch (e) {} return this.S.lookFor(this.getAttribute('character') || 'caleb', o); }
    emit(type, d) { this.dispatchEvent(new CustomEvent('boulder', { bubbles: true, composed: true, detail: Object.assign({ type }, d) })); }

    init(T, C, S) {
      Object.assign(this, { T, C, S });
      const r = this.r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.scene = new T.Scene(); this.env = S.addEnvironment(T, this.scene);
      this.cam = new T.PerspectiveCamera(45, 1, .1, 50);
      let custom = null; try { custom = JSON.parse(this.getAttribute('custom') || 'null'); } catch (e) {}
      if (custom) { this.walls = [{ problems: [custom] }]; this.cat = [{ wall: 0, slot: 0, grade: custom.grade, name: custom.name, tech: null, k: 1, intro: false, index: 0, count: 1 }]; }
      else this.cat = C.catalog();
      this.wallRoot = new T.Group(); this.scene.add(this.wallRoot);
      this.attributeChangedCallback();
      this.pip = S.makeClimber(T, this.look());
      this.setWall(0);
      this.attempts = {}; this.mode = {}; this.applyFast();
      S.ensureFonts();
      this.buildOverlay();
      const cv = r.domElement;
      cv.addEventListener('pointerdown', e => this.down(e));
      cv.addEventListener('pointermove', e => this.move(e));
      cv.addEventListener('pointerup', e => this.up(e));
      cv.addEventListener('pointercancel', e => this.up(e));
      this.ray = new T.Raycaster();
      const size = () => { const w = this.clientWidth || 1, h = this.clientHeight || 1; r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.W = w; this.H = h; };
      this._ro = new ResizeObserver(size); this._ro.observe(this); size();
      this.load(+(this.getAttribute('problem') || 0));
      let last = performance.now(), tickT = 0;
      let frame = 0;
      const loop = now => {
        const dt = Math.min(.05, (now - last) / 1000); last = now; frame++;
        const busy = this.drag || this.status === 'falling' || Math.abs(this.vel[0]) + Math.abs(this.vel[1]) > .02 || this.snapCam;
        this._skip = this.paused ? frame % 4 !== 0 : !busy && frame % 2 !== 0;
        this.step(dt, now);
        if ((tickT += dt) > .2) { tickT = 0; if (this.status === 'climb') this.emit('tick', this.info()); }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    buildOverlay() {
      const ui = this.ui = document.createElement('div');
      ui.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
      this.appendChild(ui);
      this.markers = Array.from({ length: 16 }, () => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:0;top:0;border-radius:50%;box-sizing:border-box;display:none;border:3px dashed rgba(245,241,232,.92);box-shadow:0 0 0 2px rgba(20,16,13,.35);transition:background .12s';
        const lab = document.createElement('div');
        lab.style.cssText = "position:absolute;left:50%;bottom:100%;margin-bottom:4px;transform:translateX(-50%);display:none;align-items:center;gap:3px;padding:4px 7px;border-radius:7px;background:#14100d;color:#f5f1e8;font:400 14px/1 'Lilita One',sans-serif;white-space:nowrap;letter-spacing:.03em";
        d.appendChild(lab); d._lab = lab;
        ui.appendChild(d); return d;
      });
      const tag = this.topTag = document.createElement('div');
      tag.style.cssText = 'position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;will-change:transform';
      tag.innerHTML = "<div style=\"background:#ffd32a;color:#14100d;font:400 22px/1 'Lilita One',sans-serif;letter-spacing:.04em;padding:6px 12px 5px;border-radius:6px;box-shadow:0 4px 0 rgba(0,0,0,.3)\">TOP</div><div data-sub style=\"background:#14100d;color:#f5f1e8;font:800 12px/1 'Segoe UI',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:5px 8px;border-radius:6px;white-space:nowrap\">Both hands here</div>";
      ui.appendChild(tag); this.topSub = tag.querySelector('[data-sub]');
      this.rings = {};
      for (const l of this.C.LIMBS) {
        const hand = l[1] === 'H';
        const w = document.createElement('div'); w.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;will-change:transform';
        const out = document.createElement('div'); out.style.cssText = 'position:absolute;width:66px;height:66px;left:-33px;top:-33px;border-radius:50%;box-sizing:border-box;border:2px solid rgba(20,16,13,.55);transition:transform .15s,box-shadow .15s';
        const ring = document.createElement('div'); ring.style.cssText = 'position:absolute;width:62px;height:62px;left:-31px;top:-31px;border-radius:50%;-webkit-mask:radial-gradient(circle,transparent 22px,#000 23px);mask:radial-gradient(circle,transparent 22px,#000 23px);transition:transform .15s';
        const chip = document.createElement('div'); chip.textContent = l;
        chip.style.cssText = `position:absolute;left:0;top:${hand ? -60 : 40}px;transform:translateX(-50%);opacity:.1;transition:opacity .25s ease,background .2s;background:#14100d;color:#f5f1e8;font:400 14px/1 'Lilita One',sans-serif;letter-spacing:.03em;padding:4px 7px 3px;border-radius:6px;white-space:nowrap;transition:background .2s`;
        const dot = document.createElement('div'); dot.style.cssText = 'position:absolute;width:22px;height:22px;left:-11px;top:-11px;border-radius:50%;background:#f5f1e8;border:3px solid #14100d;box-sizing:border-box;display:none';
        const badge = document.createElement('div'); badge.style.cssText = "position:absolute;left:9px;top:-36px;width:28px;height:28px;border-radius:50%;display:none;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);font-family:'Material Symbols Rounded';font-size:20px;line-height:1;font-weight:600;letter-spacing:normal;text-transform:none;white-space:nowrap";
        w.append(out, ring, dot, chip, badge); ui.appendChild(w);
        this.rings[l] = { w, out, ring, chip, dot, badge };
      }
    }

    setWall(wi) {
      if (this.wallIndex === wi) return;
      if (this.wall) { this.wallRoot.remove(this.wall.group); this.wall.group.remove(this.pip.root); this.S.disposeWall(this.wall); }
      this.layout = this.C.buildLayout(wi, this.walls); this.wall = this.S.buildWall(this.T, this.layout);
      this.wallRoot.add(this.wall.group); this.wall.group.add(this.pip.root); this.wallIndex = wi;
    }
    info() {
      return { problem: this.ci, time: this.time, moves: this.moves, holds: this.touched.size, stamina: { ...this.st }, status: this.status };
    }
    load(i) {
      const { C, S } = this; i = Math.max(0, Math.min(this.cat.length - 1, i | 0));
      const c = this.cat[i]; this.setWall(c.wall);
      const layout = this.layout, pi = c.slot, p = layout.problems[pi];
      this.ci = i; this.pi = pi; this.state = { ...p.start }; this.jumps = new Map();
      this.st = { LH: 1, RH: 1, LF: 1, RF: 1 };
      Object.assign(this, { time: 0, moves: 0, slips: 0, started: false, status: 'climb', drag: null, reach: [], hoverHold: null, paused: false, slipFlash: {}, mode: {}, practice: this.getAttribute('infinite') === 'true' });
      this.touched = new Set();
      this.attempts[i] = (this.attempts[i] || 0) + 1;
      const t = C.targetsFor(this.state, layout.holds);
      this.Pt = C.solve(t).p; this.P = this.Pt.slice(); this.vel = [0, 0];
      this.ends = {}; for (const l of C.LIMBS) this.ends[l] = this.endFor(l, t);
      S.focusRoute(this.wall, layout, pi);
      this.snapCam = true;
      this.emit('start', { problem: i, name: p.name, grade: p.grade, color: p.color, colorName: p.colorName, par: p.par, attempt: this.attempts[i], k: c.k, gradeCount: c.count, report: p.report,
        intro: c.intro ? Object.assign({ key: c.tech }, C.TECH[c.tech]) : null, catalog: this.cat.map(x => ({ index: x.index, grade: x.grade, k: x.k, name: x.name })) });
    }
    retry() { this.load(this.ci); }
    setPaused(b) { this.paused = !!b; if (b) this.drag = null; }

    endFor(l, t) {
      const id = this.state[l];
      if (id != null && t[l]) return [t[l][0], t[l][1], this.S.surfaceZ(this.layout.holds[id].type)];
      return this.S.danglePoint(l, this.P);
    }
    toWall(e) {
      const T = this.T, rc = this.r.domElement.getBoundingClientRect();
      const ndc = new T.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.cam);
      const g = this.wall.group, n = new T.Vector3(0, 0, 1).applyQuaternion(this.wallRoot.quaternion);
      const plane = new T.Plane().setFromNormalAndCoplanarPoint(n, g.localToWorld(new T.Vector3(0, 0, .12)));
      const hit = new T.Vector3(); if (!this.ray.ray.intersectPlane(plane, hit)) return null;
      g.worldToLocal(hit); return [hit.x, hit.y];
    }
    nearLimb(e) {
      const rc = this.r.domElement.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
      let best = null, bd = 60;
      for (const l in this.ringPos || {}) { const p = this.ringPos[l], d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = l; } }
      return best;
    }
    down(e) {
      if (this.status !== 'climb' || this.paused) return;
      const l = this.nearLimb(e); if (!l) return;
      const { C, layout } = this;
      try { this.r.domElement.setPointerCapture(e.pointerId); } catch (err) {}
      this.drag = l; this.prevHold = this.state[l]; this.state[l] = null;
      this.ptr = this.toWall(e) || this.ends[l].slice(0, 2);
      const H = layout.holds, s0 = { ...this.state, [l]: this.prevHold }, v0 = this.prevHold != null ? C.validState(s0, H, {}) : null;
      this.reach = []; this.jumps = new Map();
      for (const id of layout.problems[this.pi].holdIds) {
        if (id === this.prevHold || !C.canUse(l, id, this.state, layout, this.pi)) continue;
        if (C.validState({ ...this.state, [l]: id }, H, {})) this.reach.push(id);
        else if (v0) { const land = C.dynoLanding(s0, l, id, H, v0.p, {}); if (land) { this.reach.push(id); this.jumps.set(id, land); } }
      }
      this.started = true;
      this.r.domElement.style.cursor = 'grabbing';
      this.emit('grab', { limb: l });
    }
    move(e) {
      if (this.drag) { const p = this.toWall(e); if (p) this.ptr = p; return; }
      if (this.status === 'climb' && !this.paused) this.r.domElement.style.cursor = this.nearLimb(e) ? 'grab' : 'default';
    }
    up() {
      const l = this.drag; if (!l) return;
      const { C, layout } = this, cand = this.hoverHold;
      this.drag = null; this.reach = []; this.hoverHold = null; this.r.domElement.style.cursor = 'default';
      const jumpsNow = this.jumps; this.jumps = new Map(); if (cand != null && jumpsNow.get(cand)) this.jumps = jumpsNow;
      if (cand != null) {
        const land = this.jumps.get(cand);
        if (land) { Object.assign(this.state, land); this.vel[1] += 3.2; this.st[l] = Math.max(.2, this.st[l] - .15); this.emit('jump', { limb: l, feetCut: land.LF == null }); }
        else this.state[l] = cand;
        this.moves++;
        if (!layout.problems[this.pi].startIds.includes(cand)) this.touched.add(cand);
        this.emit('move', this.info());
        const top = layout.problems[this.pi].top;
        if (this.state.LH === top && this.state.RH === top) return this.topOut();
      } else if (this.prevHold != null) {
        // let go near the old hold = put it back; let go in the air = shake it out
        const h = layout.holds[this.prevHold], e = this.ends[l];
        if (Math.hypot(h.x - e[0], h.y - e[1]) < .4 && C.canUse(l, this.prevHold, this.state, layout, this.pi) && C.validState({ ...this.state, [l]: this.prevHold }, layout.holds, {})) this.state[l] = this.prevHold;
      }
      this.checkFall();
    }
    handsOn() { return (this.state.LH != null) + (this.state.RH != null); }
    checkFall() { if (this.status === 'climb' && this.handsOn() === 0 && !(this.drag && this.drag[1] === 'H')) this.fall(); }
    slip(l) {
      this.state[l] = null; this.st[l] = 0; this.slips++; this.slipFlash[l] = 1.2;
      this.emit('slip', { limb: l, name: this.C.LIMB_NAMES[l] });
      this.checkFall();
    }
    fall() {
      this.status = 'falling'; this.drag = null; this.reach = [];
      for (const l of this.C.LIMBS) this.state[l] = null;
      this.vel = [this.vel[0] * .5, 0];
      this.emit('falling', {});
    }
    topOut() {
      this.status = 'top';
      const par = this.layout.problems[this.pi].par;
      const pr = !!this.practice, stars = { moves: !pr && this.moves <= par.moves, time: !pr && this.time <= par.time, holds: !pr && this.touched.size <= par.holds };
      this.emit('top', Object.assign(this.info(), { par, stars, practice: pr, flash: !pr && this.attempts[this.ci] === 1 && this.slips === 0 }));
    }

    stamina(dt) {
      const { C, layout } = this, H = layout.holds, HOLD = C.HOLD;
      let hands = 0, feet = 0, rest = false;
      for (const l of C.LIMBS) { const id = this.state[l]; if (id == null) continue; C.isHand(l) ? hands++ : feet++; if (HOLD[H[id].type].rest) rest = true; }
      const crossed = this.state.LH != null && this.state.RH != null && H[this.state.LH].x > H[this.state.RH].x + .04;
      const feetF = [1.8, 1.2, .8][feet], diff = +(this.getAttribute('difficulty') || 1), inf = this.getAttribute('infinite') === 'true';
      if (inf) this.practice = true;
      this.mode = {};
      for (const l of C.LIMBS) {
        const id = this.state[l];
        if (id == null) { // shake out: a free hand gets strong again fast (the other hand works twice as hard meanwhile)
          if (this.st[l] < 1) this.mode[l] = 'shake';
          this.st[l] = Math.min(1, this.st[l] + (C.isHand(l) ? .5 : .25) * dt); continue;
        }
        const def = HOLD[H[id].type];
        let rate = C.isHand(l) ? def.drain * (hands === 2 ? .5 : 1) * feetF * (crossed ? C.CROSS_DRAIN : 1) : (def.footDrain ?? def.drain * .35) * (hands ? 1 : 2);
        rate *= diff;
        if (rest) rate -= .06;
        if (def.rest) rate = -.08;
        if (C.isHand(l) && H[id].type === 'jug' && hands === 2 && feet === 2) rate = -.05; // safe jug: rest here
        if (rate < 0 && this.st[l] < 1) this.mode[l] = 'rest';
        if (inf && rate > 0) rate = 0;
        if (rate > 0 && this.st[l] <= .1) rate *= .2; // safety buffer: last 10% drains at a fifth of the speed
        const before = this.st[l];
        this.st[l] = Math.max(0, Math.min(1, this.st[l] - rate * dt));
        if (before > .2 && this.st[l] <= .2 && C.isHand(l)) this.emit('lowgrip', { limb: l });
        if (this.st[l] <= 0) this.slip(l);
      }
    }

    step(dt, now) {
      if (!this.layout) return;
      const { T, C, S, layout } = this;
      const live = this.status === 'climb' && !this.paused;
      if (live) { if (this.started) this.time += dt; this.stamina(dt); }
      const t = C.targetsFor(this.state, layout.holds);
      if (this.status === 'falling') {
        this.vel[1] -= 9.8 * dt; this.P[0] += this.vel[0] * dt; this.P[1] += this.vel[1] * dt;
        if (this.P[1] <= .95) { this.P[1] = .95; this.vel = [0, 0]; this.status = 'fallen'; this.emit('fall', { slips: this.slips }); }
      } else if (this.status !== 'fallen') {
        if (this.drag && this.ptr) t[this.drag] = this.ptr;
        this.Pt = C.solve(t, this.drag, this.Pt).p;
        if (this.drag) delete t[this.drag];
        // springy body: chases the solved pose, swings and settles
        const k = 48, c = 9;
        this.vel[0] += ((this.Pt[0] - this.P[0]) * k - this.vel[0] * c) * dt;
        this.vel[1] += ((this.Pt[1] - this.P[1]) * k - this.vel[1] * c) * dt;
        this.P[0] += this.vel[0] * dt; this.P[1] += this.vel[1] * dt;
        for (let i = 0; i < 4; i++) for (const l of C.LIMBS) {
          const q = t[l]; if (!q || this.state[l] == null) continue;
          const o = C.BODY.off[l], R = C.isHand(l) ? C.BODY.arm : C.BODY.leg;
          const dx = q[0] - this.P[0] - o[0], dy = q[1] - this.P[1] - o[1], d = Math.hypot(dx, dy);
          if (d > R) { this.P[0] += dx / d * (d - R); this.P[1] += dy / d * (d - R); }
        }
      }
      for (const l of C.LIMBS) {
        let goal, rate = 14;
        if (this.drag === l && this.ptr) {
          const o = C.BODY.off[l], R = C.isHand(l) ? C.BODY.arm : C.BODY.leg, rx = this.P[0] + o[0], ry = this.P[1] + o[1];
          let dx = this.ptr[0] - rx, dy = this.ptr[1] - ry; const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          goal = [rx + dx, ry + dy, .16]; rate = 30;
        } else {
          goal = this.endFor(l, t);
          if (this.mode[l] === 'shake' && this.state[l] == null && C.isHand(l)) { goal[0] += Math.sin(now * .035) * .06; goal[1] += Math.cos(now * .07) * .025; }
        }
        const e = this.ends[l], a = Math.min(1, rate * dt);
        for (let i = 0; i < 3; i++) e[i] += (goal[i] - e[i]) * a;
      }
      S.poseClimber(T, this.pip, this.P, this.ends);
      this.hoverHold = null;
      if (this.drag) {
        const e = this.ends[this.drag]; let bd = Infinity;
        for (const id of this.reach) { const h = layout.holds[id], q = this.jumps.has(id) && this.ptr ? this.ptr : e, d = Math.hypot(h.x - q[0], h.y - q[1]); if (d < h.r + .18 && d < bd) { bd = d; this.hoverHold = id; } }
      }
      const g = this.wall.group, topY = layout.holds[layout.problems[this.pi].top].y, nearTop = Math.max(0, Math.min(1, (2.8 - (topY - this.P[1])) / 1.2)),
        focus = g.localToWorld(new T.Vector3(this.P[0], this.P[1] + .65 + nearTop * .55, 0));
      const dist = Math.max(4.3, 1.15 / (Math.tan(22.5 * Math.PI / 180) * this.cam.aspect));
      this.camT = (this.camT || 0) + dt;
      const want = focus.clone().add(new T.Vector3(Math.sin(this.camT * .21) * .42, .25 + Math.sin(this.camT * .13) * .06, dist));
      if (this.snapCam) { this.cam.position.copy(want); this.camFocus = focus.clone(); this.snapCam = false; }
      this.cam.position.lerp(want, Math.min(1, dt * 3)); this.camFocus.lerp(focus, Math.min(1, dt * 3));
      this.cam.lookAt(this.camFocus);
      this.env.key.target.position.copy(this.camFocus); this.env.key.position.copy(this.camFocus).add(new T.Vector3(2, 3.5, 6)); this.env.fill.position.copy(this.camFocus).add(new T.Vector3(-4, .5, 4));
      if (!this._skip) this.r.render(this.scene, this.cam);
      this.drawOverlay(dt, now);
    }

    drawOverlay(dt, now) {

      const { T, C, layout } = this, g = this.wall.group, W = this.W, H = this.H;
      const proj = (x, y, z) => { const v = g.localToWorld(new T.Vector3(x, y, z)).project(this.cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
      this.ringPos = {};
      const hide = this.status === 'fallen' || this.status === 'falling' || this.getAttribute('rings') === 'false', dots = this.getAttribute('hud') === 'dots';
      for (const l of C.LIMBS) {
        const R = this.rings[l], e = this.ends[l], p = proj(e[0], e[1], e[2]);
        this.ringPos[l] = p;
        R.w.style.transform = `translate(${p.x}px,${p.y}px)`;
        R.w.style.opacity = hide ? 0 : 1;
        R.ring.style.display = R.out.style.display = dots ? 'none' : 'block'; R.dot.style.display = dots ? 'block' : 'none';
        R.chip.style.top = dots ? (l[1] === 'H' ? '-40px' : '20px') : (l[1] === 'H' ? '-60px' : '40px');
        const s = this.st[l], col = s > .5 ? '#5fd38a' : s > .2 ? '#f7c23c' : '#ff5a4e';
        R.ring.style.background = `conic-gradient(${col} 0 ${(s * 100).toFixed(1)}%, rgba(20,16,13,.45) 0)`;
        const dragging = this.drag === l, low = s <= .2 && this.state[l] != null;
        R.ring.style.opacity = low ? (.5 + .5 * Math.abs(Math.sin(now * .009))).toFixed(2) : 1;
        R.out.style.transform = R.ring.style.transform = dragging ? 'scale(1.14)' : 'scale(1)';
        R.out.style.boxShadow = dragging ? '0 0 0 4px rgba(245,241,232,.9)' : 'none';
        const md = dragging || hide ? null : this.mode[l];
        if (md === 'shake') { R.ring.style.transform = `translateX(${(Math.sin(now * .05) * 2.5).toFixed(1)}px)`; R.badge.textContent = 'add'; R.badge.style.background = '#f5f1e8'; R.badge.style.color = '#14100d'; }
        else if (md === 'rest') { R.badge.textContent = 'add'; R.badge.style.background = '#5fd38a'; R.badge.style.color = '#14100d'; }
        R.badge.style.display = md && !dots ? 'flex' : 'none';
        const flash = this.slipFlash[l] > 0;
        if (flash) { this.slipFlash[l] -= dt; R.chip.style.background = '#ff5a4e'; } else R.chip.style.background = '#14100d';
        const chipOp = this.drag || flash ? '1' : '.1'; if (R.chip.style.opacity !== chipOp) R.chip.style.opacity = chipOp;
      }
      { const top = layout.problems[this.pi].top, h = layout.holds[top], p = proj(h.x, h.y + h.r + .2, .1);
        const n = (this.state.LH === top) + (this.state.RH === top);
        const side = p.y < 200, c = proj(h.x, h.y, .1);
        this.topTag.style.transform = side ? `translate(${c.x + 70}px,${c.y}px) translate(0,-50%)` : `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;
        this.topTag.style.opacity = this.status === 'climb' && this.getAttribute('rings') !== 'false' ? 1 : 0;
        this.topSub.textContent = n === 1 ? 'Match it! 1 of 2 hands' : 'Both hands here';
        this.topSub.style.background = n === 1 ? '#ff5a4e' : '#14100d';
        this.topSub.style.color = n === 1 ? '#14100d' : '#f5f1e8';
        this.topSub.style.transform = n === 1 ? `scale(${1 + .06 * Math.abs(Math.sin(now * .008))})` : 'none'; }
      const show = this.getAttribute('reach') !== 'false';
      this.markers.forEach((m, i) => {
        const id = this.reach[i];
        if (!this.drag || id == null || !show) { m.style.display = 'none'; return; }
        const h = layout.holds[id], c = proj(h.x, h.y, .1), ed = proj(h.x + h.r, h.y, .1);
        const d = Math.max(40, Math.hypot(ed.x - c.x, ed.y - c.y) * 2 + 18), hov = id === this.hoverHold;
        m.style.display = 'block'; m.style.width = m.style.height = d + 'px';
        m.style.transform = `translate(${c.x - d / 2}px,${c.y - d / 2}px)`;
        const jump = this.jumps.has(id);
        m.style.borderStyle = hov || jump ? 'solid' : 'dashed';
        m.style.borderColor = jump ? '#ffd32a' : 'rgba(245,241,232,.92)';
        m.style.background = hov ? (jump ? 'rgba(255,211,42,.25)' : 'rgba(245,241,232,.22)') : 'transparent';
        const ICON = n => "<span style=\"font-family:'Material Symbols Rounded';font-size:16px;line-height:1;font-weight:600;letter-spacing:normal;text-transform:none\">" + n + '</span>';
        const lab = jump ? ICON('keyboard_double_arrow_up') + 'JUMP!' : h.dir ? ICON({ left: 'arrow_back', right: 'arrow_forward', under: 'arrow_upward' }[h.dir]) + 'LEAN' : '';
        if (m._labHtml !== lab) { m._lab.innerHTML = lab; m._labHtml = lab; }
        m._lab.style.display = lab ? 'flex' : 'none';
        m._lab.style.background = jump ? '#ffd32a' : '#14100d'; m._lab.style.color = jump ? '#14100d' : '#f5f1e8';
      });
    }
  }
  if (!customElements.get('boulder-climb')) customElements.define('boulder-climb', BoulderClimb);
})();
