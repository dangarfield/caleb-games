// <boulder-editor color="#f08a2c"> — route editor wall. Tap/drag to build a route. Emits bubbling 'editor' events
// {holds, starts, hasTop, selected}. Methods: setTool(t), setType(t), setColor(c), getRoute(), setRoute(r), clear(), scrollBy(m).
(function () {
  const base = document.baseURI;
  const LANE = 3.85, DIR_ROT = { left: Math.PI / 2, right: -Math.PI / 2, under: Math.PI }, DIRS = [null, 'left', 'right', 'under'];
  class BoulderEditor extends HTMLElement {
    static get observedAttributes() { return ['fast']; }
    attributeChangedCallback() { if (this.r) this.applyFast(); }
    applyFast() { const f = this.getAttribute('fast') === 'true'; this.r.setPixelRatio(f ? 1 : Math.min(devicePixelRatio, 1.5)); this.r.shadowMap.enabled = !f; this.r.setSize(this.clientWidth || 1, this.clientHeight || 1, false); }
    connectedCallback() {
      this.style.cssText += ';display:block;position:absolute;inset:0;overflow:hidden;touch-action:none';
      if (this._started) return; this._started = true;
      Promise.all([
        import('https://unpkg.com/three@0.160.0/build/three.module.js'),
        import(new URL('js/boulder-core.js', base).href),
        import(new URL('js/boulder-scene.js', base).href)
      ]).then(([T, C, S]) => this.init(T, C, S));
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); if (this.r) { this.r.dispose(); this.r.forceContextLoss(); this.r.domElement.remove(); } this._started = false; }
    emit() {
      const h = this.route.holds;
      this.dispatchEvent(new CustomEvent('editor', { bubbles: true, detail: { holds: h.length, starts: h.filter(x => x.start).length, hasTop: h.some(x => x.type === 'top'), selected: this.sel, route: this.getRoute() } }));
    }
    init(T, C, S) {
      Object.assign(this, { T, C, S });
      const r = this.r = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping;
      r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      this.appendChild(r.domElement);
      this.scene = new T.Scene(); this.env = S.addEnvironment(T, this.scene);
      this.cam = new T.PerspectiveCamera(45, 1, .1, 60);
      this.wall = S.buildWall(T, { holds: [], problems: [] });
      this.scene.add(this.wall.group);
      const lineMat = new T.MeshBasicMaterial({ color: '#f5f1e8', transparent: true, opacity: .35 });
      [-LANE, LANE].forEach(x => { const m = new T.Mesh(new T.BoxGeometry(.025, C.WALL.h, .005), lineMat); m.position.set(x, C.WALL.h / 2, .005); this.wall.group.add(m); });
      for (let y = 1; y < C.WALL.h; y++) { // metre marks
        const m = new T.Mesh(new T.BoxGeometry(.18, .02, .005), lineMat); m.position.set(-LANE - .12, y, .005); this.wall.group.add(m);
      }
      this.holdGroup = new T.Group(); this.wall.group.add(this.holdGroup);
      if (!this.route) { try { const a = JSON.parse(this.getAttribute('route') || 'null'); if (a && a.holds) this.route = a; } catch (err) {} }
      this.route = this.route || { holds: [], color: this.getAttribute('color') || '#f08a2c' };
      this.tool = this.tool || 'place'; this.type = this.type || 'jug'; this.sel = null;
      this.camY = 2; this.camYt = 2; this.camX = 0; this.camXt = 0;
      this.ray = new T.Raycaster();
      const cv = r.domElement;
      cv.addEventListener('pointerdown', e => this.down(e));
      cv.addEventListener('pointermove', e => this.move(e));
      cv.addEventListener('pointerup', e => this.up(e));
      cv.addEventListener('pointercancel', e => this.up(e));
      cv.addEventListener('wheel', e => { e.preventDefault(); if (e.shiftKey) this.panBy(e.deltaY * .004); else { this.scrollBy(-e.deltaY * .004); this.panBy(e.deltaX * .004); } }, { passive: false });
      const size = () => { const w = this.clientWidth || 1, h = this.clientHeight || 1; r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); };
      this._ro = new ResizeObserver(size); this._ro.observe(this); size();
      this.rebuild(); this.emit(); this.applyFast();
      let last = performance.now(); this._dirty = 3;
      let frame = 0;
      const loop = now => {
        const dt = Math.min(.05, (now - last) / 1000); last = now; frame++;
        const draw = Math.abs(this.camYt - this.camY) > .001 || Math.abs(this.camXt - this.camX) > .001 || this._dirty > 0 || this.ptr || frame % 3 === 0;
        if (this._dirty > 0) this._dirty--;
        this.camY += (this.camYt - this.camY) * Math.min(1, dt * 8); this.camX += (this.camXt - this.camX) * Math.min(1, dt * 8);
        const dist = Math.max(4.6, 2.3 / (Math.tan(22.5 * Math.PI / 180) * this.cam.aspect));
        this.cam.position.set(this.camX, this.camY + .2, dist); this.cam.lookAt(this.camX, this.camY, 0);
        this.env.key.target.position.set(this.camX, this.camY, 0); this.env.key.position.set(this.camX + 2, this.camY + 3.5, 6); this.env.fill.position.set(this.camX - 4, this.camY + .5, 4);
        if (this.selRing) this.selRing.rotation.z += dt;
        if (draw) r.render(this.scene, this.cam);
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    // ---------- API ----------
    setTool(t) { this.tool = t; this.sel = null; this.rebuild(); this.emit(); }
    setType(t) { this.type = t; }
    setColor(c) { if (!this.route) return; this.route.color = c; this.rebuild(); this.emit(); }
    panBy(m) { this.camXt = Math.max(-2.4, Math.min(2.4, this.camXt + m)); }
    scrollBy(m) { this.camYt = Math.max(1.2, Math.min(this.C ? this.C.WALL.h - 1.2 : 8.4, this.camYt + m)); }
    clear() { this.route.holds = []; this.sel = null; this.rebuild(); this.emit(); }
    getRoute() { return JSON.parse(JSON.stringify(this.route || { holds: [], color: '#f08a2c' })); }
    setRoute(rt) { this.route = JSON.parse(JSON.stringify(rt)); this.sel = null; if (this.T) { this.rebuild(); this.emit(); } }
    // ---------- geometry ----------
    toWall(e) {
      const T = this.T, rc = this.r.domElement.getBoundingClientRect();
      const ndc = new T.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.cam);
      const plane = new T.Plane(new T.Vector3(0, 0, 1), -.1), hit = new T.Vector3();
      return this.ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.y] : null;
    }
    pick(p) {
      let best = null, bd = Infinity;
      this.route.holds.forEach((h, i) => { const d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < this.C.HOLD[h.type].r + .08 && d < bd) { bd = d; best = i; } });
      return best;
    }
    fits(type, x, y, ignore) {
      const r = this.C.HOLD[type].r;
      if (Math.abs(x) > LANE - r || y < r + .1 || y > this.C.WALL.h - r - .15) return false;
      return this.route.holds.every((h, i) => i === ignore || Math.hypot(h.x - x, h.y - y) >= this.C.HOLD[h.type].r + r + this.C.GAP);
    }
    flash(msg) { this.dispatchEvent(new CustomEvent('editor-msg', { bubbles: true, detail: { msg } })); }
    // ---------- input ----------
    down(e) {
      const p = this.toWall(e); if (!p) return;
      try { this.r.domElement.setPointerCapture(e.pointerId); } catch (err) {}
      this.ptr = { x: e.clientX, y: e.clientY, p, hit: this.pick(p), moved: false, camY: this.camYt, camX: this.camXt };
      if (this.tool === 'move' && this.ptr.hit != null) { const h = this.route.holds[this.ptr.hit]; this.dragHold = { i: this.ptr.hit, ox: h.x, oy: h.y }; this.sel = this.ptr.hit; this.rebuild(); }
    }
    move(e) {
      if (!this.ptr) return;
      const dx = e.clientX - this.ptr.x, dy = e.clientY - this.ptr.y;
      if (Math.hypot(dx, dy) > 8) this.ptr.moved = true;
      if (this.dragHold) { const p = this.toWall(e); if (p) { const h = this.route.holds[this.dragHold.i]; h.x = Math.max(-LANE, Math.min(LANE, p[0])); h.y = Math.max(.15, Math.min(this.C.WALL.h - .2, p[1])); this.rebuild(); } return; }
      if (this.ptr.moved) { const mpp = (this.cam.position.z * 2 * Math.tan(22.5 * Math.PI / 180)) / (this.clientHeight || 1); this.camYt = this.ptr.camY; this.scrollBy(dy * mpp); this.camXt = this.ptr.camX; this.panBy(-dx * mpp); }
    }
    up(e) {
      const pt = this.ptr; this.ptr = null; if (!pt) return;
      if (this.dragHold) {
        const d = this.dragHold, h = this.route.holds[d.i]; this.dragHold = null;
        if (!this.fits(h.type, h.x, h.y, d.i)) { h.x = d.ox; h.y = d.oy; this.flash('Too close to another hold'); }
        this.rebuild(); this.emit(); return;
      }
      if (pt.moved) return;
      this.tap(pt.p, pt.hit);
    }
    tap(p, hit) {
      const H = this.route.holds, def = this.C.HOLD;
      switch (this.tool) {
        case 'place':
          if (hit != null) { this.sel = hit; break; }
          if (!this.fits(this.type, p[0], p[1])) { this.flash(Math.abs(p[0]) > LANE ? 'Keep holds between the chalk lines' : 'Too close to another hold'); return; }
          if (this.type === 'top') { const old = H.findIndex(h => h.type === 'top'); if (old >= 0) H.splice(old, 1); }
          H.push({ type: this.type, x: +p[0].toFixed(2), y: +p[1].toFixed(2), dir: null, jump: false, start: false }); this.sel = H.length - 1; break;
        case 'delete': if (hit != null) { H.splice(hit, 1); this.sel = null; } break;
        case 'start':
          if (hit == null) return;
          if (H[hit].type === 'top') { this.flash('The TOP can\'t be a start hold'); return; }
          if (!H[hit].start && H.filter(h => h.start).length >= 4) { this.flash('4 start holds max: 2 hands + 2 feet'); return; }
          H[hit].start = !H[hit].start; this.sel = hit; break;
        case 'turn':
          if (hit == null) return;
          if (!['crimp', 'pinch', 'jug', 'sloper'].includes(H[hit].type)) { this.flash('Only crimps, pinches, jugs and slopers can turn'); return; }
          H[hit].dir = DIRS[(DIRS.indexOf(H[hit].dir) + 1) % DIRS.length]; this.sel = hit; break;
        case 'jump':
          if (hit == null) return;
          if (!def[H[hit].type].hand || H[hit].type === 'top') { this.flash('Jump holds must be hand holds'); return; }
          H[hit].jump = !H[hit].jump; this.sel = hit; break;
        case 'move': if (hit != null) this.sel = hit; break;
      }
      this.rebuild(); this.emit();
    }
    // ---------- render ----------
    rebuild() {
      const { T, S, C } = this, g = this.holdGroup;
      while (g.children.length) { const o = g.children.pop(); o.traverse(m => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); }); }
      this._dirty = 2;
      this.selRing = null;
      this.route.holds.forEach((h, i) => {
        const col = h.type === 'top' ? C.TOP_COLOR : this.route.color, m = S.holdMesh(T, h.type, col), r = C.HOLD[h.type].r;
        m.position.set(h.x, h.y, 0);
        m.rotation.z = h.dir ? DIR_ROT[h.dir] : h.type === 'pinch' ? Math.PI / 2 : 0;
        if (h.dir) { const tick = new T.Mesh(new T.BoxGeometry(.1, .026, .03), new T.MeshStandardMaterial({ color: '#f5f1e8' })); tick.position.set(0, r * .72, .08); m.add(tick); }
        if (h.jump) { const halo = new T.Mesh(new T.TorusGeometry(r + .08, .014, 8, 40), new T.MeshStandardMaterial({ color: '#ffd32a', emissive: '#ffd32a', emissiveIntensity: .6 })); halo.position.z = .02; m.add(halo); }
        g.add(m); g.add(S.aoQuad(T, { ...h, r, rot: m.rotation.z }));
        if (h.start) { const tape = new T.Mesh(new T.BoxGeometry(.2, .05, .004), new T.MeshStandardMaterial({ color: '#f5f1e8' })); tape.position.set(h.x, h.y - r - .07, .003); g.add(tape); }
        if (i === this.sel) { const ring = new T.Mesh(new T.TorusGeometry(r + .13, .012, 6, 40, Math.PI * 1.6), new T.MeshBasicMaterial({ color: '#f5f1e8' })); ring.position.set(h.x, h.y, .06); g.add(ring); this.selRing = ring; }
      });
    }
  }
  if (!customElements.get('boulder-editor')) customElements.define('boulder-editor', BoulderEditor);
})();
