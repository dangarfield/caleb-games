// <boulder-wall overhang="12" motion="true" route="0" character="caleb" look='{}'> — title backdrop: Caleb/Ezra climbing a solved route on loop.
// <boulder-climber mode="wall|stand|portrait" character="caleb" look='{"tee":"#..."}' wave="true" spin="true"> — character views.
(function () {
  const base = document.baseURI;
  const deps = () => Promise.all([
    import('https://unpkg.com/three@0.160.0/build/three.module.js'),
    import(new URL('js/boulder-core.js', base).href),
    import(new URL('js/boulder-scene.js', base).href)
  ]);
  function renderer(T, el) {
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping;
    r.domElement.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(r.domElement); return r;
  }
  function fit(el, r, cam) {
    const size = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(el); size();
    el._vis = true;
    el._io = new IntersectionObserver(es => { el._vis = es[es.length - 1].isIntersecting; }, { rootMargin: '200px' }); el._io.observe(el);
    return ro;
  }
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function applyFast(el, r) { const f = el.getAttribute('fast') === 'true'; r.setPixelRatio(f ? 1 : Math.min(devicePixelRatio, el._dprCap || 1.5)); r.shadowMap.enabled = !f; r.setSize(el.clientWidth || 1, el.clientHeight || 1, false); }
  function readLook(el, S) {
    let over = {}; try { over = JSON.parse(el.getAttribute('look') || '{}'); } catch (e) {}
    return S.lookFor(el.getAttribute('character') || 'caleb', over);
  }

  class BoulderWall extends HTMLElement {
    static get observedAttributes() { return ['overhang', 'route', 'character', 'look', 'fast']; }
    connectedCallback() {
      this.style.cssText += ';display:block;position:absolute;inset:0;overflow:hidden';
      if (this._started) return; this._started = true;
      deps().then(([T, C, S]) => this.init(T, C, S));
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); const r = this.r || this._r; if (r) { r.dispose(); r.forceContextLoss(); r.domElement.remove(); } this._started = false; }
    attributeChangedCallback(n) {
      if (!this.wallRoot) return;
      if (n === 'fast') { applyFast(this, this.r); return; }
      this.wallRoot.rotation.x = (+(this.getAttribute('overhang') ?? 12)) * Math.PI / 180;
      if (n === 'route') this.setRoute();
      if (n === 'character' || n === 'look') this.S.applyLook(this.pip, readLook(this, this.S));
    }
    setRoute() {
      const { C, S } = this, pi = Math.max(0, Math.min(2, +(this.getAttribute('route') ?? 0)));
      this.pi = pi; this.path = C.solutionStates(this.layout, pi); this.k = 0; this.hold = 0;
      S.focusRoute(this.wall, this.layout, pi, .3);
      this.setState(this.path[0], true);
    }
    setState(s, snap) {
      const { C, S, layout } = this, t = C.targetsFor(s, layout.holds);
      this.Pt = C.solve(t).p;
      this.goal = {}; for (const l of C.LIMBS) this.goal[l] = s[l] == null ? S.danglePoint(l, this.Pt) : [t[l][0], t[l][1], S.surfaceZ(layout.holds[s[l]].type)];
      if (snap) { this.P = this.Pt.slice(); this.ends = JSON.parse(JSON.stringify(this.goal)); }
    }
    init(T, C, S) {
      Object.assign(this, { T, C, S });
      this.r = renderer(T, this);
      this.scene = new T.Scene(); this.env = S.addEnvironment(T, this.scene);
      this.cam = new T.PerspectiveCamera(42, 1, .1, 60);
      this.layout = C.buildLayout();
      this.wall = S.buildWall(T, this.layout);
      this.wallRoot = new T.Group(); this.wallRoot.add(this.wall.group); this.scene.add(this.wallRoot);
      this.pip = S.makeClimber(T, readLook(this, S)); this.wall.group.add(this.pip.root);
      this.attributeChangedCallback(); this.setRoute();
      this._ro = fit(this, this.r, this.cam); applyFast(this, this.r);
      let last = performance.now(), t = 0;
      const loop = now => {
        this._raf = requestAnimationFrame(loop);
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        if (!this._vis) return;
        const moving = this.getAttribute('motion') !== 'false' && !still();
        if (moving) {
          t += dt; this.hold += dt;
          if (this.hold > (this.k === this.path.length - 1 ? 2.6 : .8)) {
            this.hold = 0; this.k = (this.k + 1) % this.path.length;
            this.setState(this.path[this.k], this.k === 0);
          }
        } else if (this.k !== Math.floor(this.path.length / 2)) { this.k = Math.floor(this.path.length / 2); this.setState(this.path[this.k], true); }
        const a = moving ? Math.min(1, dt * 6) : 1;
        this.P[0] += (this.Pt[0] - this.P[0]) * a * .6; this.P[1] += (this.Pt[1] - this.P[1]) * a * .6;
        for (const l of C.LIMBS) for (let i = 0; i < 3; i++) this.ends[l][i] += (this.goal[l][i] - this.ends[l][i]) * a;
        S.poseClimber(T, this.pip, this.P, this.ends);
        const g = this.wall.group, focus = g.localToWorld(new T.Vector3(this.P[0] + (+(this.getAttribute('offset') ?? -1.25)), this.P[1] + .4, 0));
        const want = focus.clone().add(new T.Vector3(Math.sin(t * .15) * .3, .2, 5));
        if (!this.camFocus || this.k === 0 && this.hold === 0) { this.camFocus = focus.clone(); this.cam.position.copy(want); }
        this.camFocus.lerp(focus, Math.min(1, dt * 1.5)); this.cam.position.lerp(want, Math.min(1, dt * 1.5));
        this.cam.lookAt(this.camFocus);
        this.env.key.target.position.copy(this.camFocus); this.env.key.position.copy(this.camFocus).add(new T.Vector3(2, 3.5, 6)); this.env.fill.position.copy(this.camFocus).add(new T.Vector3(-4, .5, 4));
        this.r.render(this.scene, this.cam);
      };
      this._raf = requestAnimationFrame(loop);
    }
  }

  class BoulderClimber extends HTMLElement {
    static get observedAttributes() { return ['character', 'look', 'fast']; }
    connectedCallback() {
      this.style.cssText += ';display:block;position:absolute;inset:0;overflow:hidden';
      if (this._started) return; this._started = true;
      deps().then(([T, C, S]) => this.init(T, C, S));
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); const r = this.r || this._r; if (r) { r.dispose(); r.forceContextLoss(); r.domElement.remove(); } this._started = false; }
    attributeChangedCallback(n) { if (n === 'fast') { this._r && applyFast(this, this._r); return; } if (this.pip) this.S.applyLook(this.pip, readLook(this, this.S)); }
    init(T, C, S) {
      this.S = S;
      const mode = this.getAttribute('mode') || 'wall';
      this._dprCap = 1.25;
      const r = this._r = renderer(T, this), scene = new T.Scene(), env = S.addEnvironment(T, scene);
      scene.fog = null;
      if (this.getAttribute('bg')) scene.background = new T.Color(this.getAttribute('bg'));
      const cam = new T.PerspectiveCamera(mode === 'portrait' ? 26 : 32, 1, .1, 60);
      const panel = new T.Mesh(new T.BoxGeometry(mode === 'wall' ? 2.4 : 6, mode === 'wall' ? 3.2 : 4, .12), new T.MeshStandardMaterial({ map: S.plainPly(T), roughness: .9 }));
      panel.position.set(0, mode === 'wall' ? 1.6 : 2, -.06); panel.receiveShadow = true; scene.add(panel);
      const pip = this.pip = S.makeClimber(T, readLook(this, S)); scene.add(pip.root);
      let poses;
      if (mode === 'wall') {
        const holds = [[-.32, 1.95], [.3, 1.62], [-.18, .32], [.24, .55], [.36, 2.25]];
        holds.forEach(([x, y]) => { const m = S.holdMesh(T, 'jug', '#5fcf7a'); m.position.set(x, y, 0); scene.add(m); });
        poses = t => {
          const k = Math.floor(t / 1.8) % 2;
          return k ? { P: [.06, 1.12], ends: { LH: [-.32, 1.95, .09], RH: [.36, 2.25, .09], LF: [-.18, .32, .09], RF: [.24, .55, .09] } }
                   : { P: [0, 1.02], ends: { LH: [-.32, 1.95, .09], RH: [.3, 1.62, .09], LF: [-.18, .32, .09], RF: [.24, .55, .09] } };
        };
      } else {
        const pivot = this.pivot = new T.Group(); pivot.position.z = .9; pivot.rotation.y = Math.PI; scene.add(pivot);
        pivot.add(pip.root); pip.root.position.z = -S.BODY_Z;
        const wave = this.getAttribute('wave') === 'true';
        poses = t => {
          const b = Math.sin(t * 2.2) * .012, Z = S.BODY_Z + .04;
          const rh = wave ? [.4 + Math.sin(t * 6) * .07, 1.86 + b, Z + .06] : [.3, .86 + b, Z];
          return { P: [0, .92 + b], ends: { LH: [-.3, .86 + b, Z], RH: rh, LF: [-.14, .05, S.BODY_Z], RF: [.14, .05, S.BODY_Z] } };
        };
      }
      const p0 = poses(0), P = p0.P.slice(), ends = JSON.parse(JSON.stringify(p0.ends));
      this._ro = fit(this, r, cam); applyFast(this, r);
      let last = performance.now(), t = 0;
      const loop = now => {
        this._raf = requestAnimationFrame(loop);
        if (now - last < 32) return; // characters only need ~30 fps
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        if (!this._vis) return;
        if (!still()) t += dt;
        const goal = poses(t), a = Math.min(1, dt * 6);
        P[0] += (goal.P[0] - P[0]) * a; P[1] += (goal.P[1] - P[1]) * a;
        for (const l in ends) for (let i = 0; i < 3; i++) ends[l][i] += (goal.ends[l][i] - ends[l][i]) * a;
        S.poseClimber(T, pip, P, ends);
        if (this.pivot) { const tgt = this.getAttribute('view') === 'back' ? 0 : Math.PI; this.pivot.rotation.y += (tgt - this.pivot.rotation.y) * Math.min(1, dt * 5); }
        if (mode === 'wall') {
          const ang = Math.sin(t * .35) * .55;
          cam.position.set(Math.sin(ang) * 5.4, 1.5, Math.cos(ang) * 5.4); cam.lookAt(0, 1.3, .2);
        } else if (mode === 'portrait') {
          const ang = Math.sin(t * .4) * .12;
          cam.position.set(Math.sin(ang) * 3, 1.5, .9 + Math.cos(ang) * 3); cam.lookAt(0, 1.38, .9);
        } else {
          const spin = this.getAttribute('spin') !== 'false', ang = spin ? Math.sin(t * .45) * .6 : .25;
          cam.position.set(Math.sin(ang) * 3.9, 1.2, .9 + Math.cos(ang) * 3.9); cam.lookAt(0, .98, .9);
        }
        env.key.target.position.set(0, 1.2, .9); env.key.position.set(1.5, 4.5, 6.5); env.fill.position.set(-3, 1.6, 5);
        r.render(scene, cam);
      };
      this._raf = requestAnimationFrame(loop);
    }
  }

  // <boulder-duo look-a='{}' look-b='{}' wave="a|b"> — Caleb and Ezra in ONE WebGL view; the page frames each half with CSS.
  class BoulderDuo extends HTMLElement {
    static get observedAttributes() { return ['look-a', 'look-b', 'fast']; }
    connectedCallback() {
      this.style.cssText += ';display:block;position:absolute;inset:0;overflow:hidden';
      if (this._started) return; this._started = true;
      deps().then(([T, C, S]) => this.init(T, C, S));
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); if (this._r) { this._r.dispose(); this._r.forceContextLoss(); this._r.domElement.remove(); } this._started = false; }
    lookOf(k) { let o = {}; try { o = JSON.parse(this.getAttribute('look-' + k) || '{}'); } catch (e) {} return this.S.lookFor(k === 'a' ? 'caleb' : 'ezra', o); }
    attributeChangedCallback(n) {
      if (!this.duo) return;
      if (n === 'fast') { applyFast(this, this._r); return; }
      this.S.applyLook(this.duo[n === 'look-a' ? 0 : 1].pip, this.lookOf(n.slice(-1)));
    }
    init(T, C, S) {
      this.S = S; this._dprCap = 1.25;
      const r = this._r = renderer(T, this), scene = new T.Scene(), env = S.addEnvironment(T, scene);
      scene.fog = null;
      const cam = new T.PerspectiveCamera(26, 1, .1, 60);
      const panel = new T.Mesh(new T.BoxGeometry(8, 4, .12), new T.MeshStandardMaterial({ map: S.plainPly(T), roughness: .9 }));
      panel.position.set(0, 2, -.06); panel.receiveShadow = true; scene.add(panel);
      this.duo = ['a', 'b'].map(k => {
        const pip = S.makeClimber(T, this.lookOf(k)), pv = new T.Group();
        pv.position.z = .9; pv.rotation.y = Math.PI; scene.add(pv); pv.add(pip.root); pip.root.position.z = -S.BODY_Z;
        return { k, pip, pv, P: [0, .92], ends: null };
      });
      this._ro = fit(this, r, cam); applyFast(this, r);
      let last = performance.now(), t = 0;
      const Z = S.BODY_Z + .04;
      const pose = (tt, wave) => {
        const b = Math.sin(tt * 2.2) * .012;
        return { P: [0, .92 + b], ends: { LH: [-.3, .86 + b, Z], RH: wave ? [.4 + Math.sin(tt * 6) * .07, 1.86 + b, Z + .06] : [.3, .86 + b, Z], LF: [-.14, .05, S.BODY_Z], RF: [.14, .05, S.BODY_Z] } };
      };
      const loop = now => {
        this._raf = requestAnimationFrame(loop);
        if (now - last < 32 || !this._vis) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        if (!still()) t += dt;
        const D = 3, halfW = D * Math.tan(13 * Math.PI / 180) * cam.aspect, wave = this.getAttribute('wave');
        this.duo.forEach((d, i) => {
          const goal = pose(t + i * 1.7, wave === d.k), a = Math.min(1, dt * 6);
          if (!d.ends) { d.P = goal.P.slice(); d.ends = JSON.parse(JSON.stringify(goal.ends)); }
          d.P[0] += (goal.P[0] - d.P[0]) * a; d.P[1] += (goal.P[1] - d.P[1]) * a;
          for (const l in d.ends) for (let j = 0; j < 3; j++) d.ends[l][j] += (goal.ends[l][j] - d.ends[l][j]) * a;
          S.poseClimber(T, d.pip, d.P, d.ends);
          d.pv.position.x = (i ? 1 : -1) * halfW / 2;
          d.pv.rotation.y = Math.PI + Math.sin(t * .4 + i) * .12;
        });
        cam.position.set(0, 1.5, .9 + D); cam.lookAt(0, 1.38, .9);
        env.key.target.position.set(0, 1.2, .9); env.key.position.set(1.5, 4.5, 6.5); env.fill.position.set(-3, 1.6, 5);
        r.render(scene, cam);
      };
      this._raf = requestAnimationFrame(loop);
    }
  }
  if (!customElements.get('boulder-duo')) customElements.define('boulder-duo', BoulderDuo);
  if (!customElements.get('boulder-wall')) customElements.define('boulder-wall', BoulderWall);
  if (!customElements.get('boulder-climber')) customElements.define('boulder-climber', BoulderClimber);
})();
