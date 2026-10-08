// Renderer setup helpers, canvas textures, materials and quality scaling.
// Mixed into Game.prototype — every method runs with `this` = the Game.
export const Assets = {
  makeLine(color) {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(6), 3));
    const l = new T.Line(g, new T.LineBasicMaterial({ color, transparent: true, opacity: 1, fog: false })); l.frustumCulled = false; return l;
  },
  setLine(l, a, b) { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; },
  canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
    const t = new this.T.CanvasTexture(c); t.colorSpace = this.T.SRGBColorSpace; t.anisotropy = 4; return t;
  },
  shadeBox(geo) {
    const T = this.T, sh = [0.86, 0.86, 1, 0.6, 0.76, 0.76], n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = Math.pow(sh[Math.floor(i / 4)] ?? 1, 2.2); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return geo;
  },
  makeAssets() {
    const T = this.T;
    const panel = this.canvasTex(128, (g, s) => { g.fillStyle = '#E6EAF2'; g.fillRect(0, 0, s, s); g.strokeStyle = '#B7BFD0'; g.lineWidth = 4; g.strokeRect(3, 3, s - 6, s - 6); g.fillStyle = '#C9D0DC'; [[14, 14], [114, 14], [14, 114], [114, 114]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }); });
    const metal = this.metalTex = this.canvasTex(128, (g, s) => { g.fillStyle = '#394155'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 6; for (let k = -s; k < s * 2; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - s, s); g.stroke(); } g.strokeStyle = '#262C3B'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6); });
    metal.wrapS = metal.wrapT = T.RepeatWrapping;
    const field = this.canvasTex(128, (g, s) => { g.clearRect(0, 0, s, s); for (let x = 0; x < s; x += 8) { g.fillStyle = `rgba(190,225,255,${0.25 + 0.5 * Math.random()})`; g.fillRect(x, 0, 3, s); } });
    field.wrapS = field.wrapT = T.RepeatWrapping; this.fieldTex = field;
    const glow = this.canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
    const swirl = (hex) => this.canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2); r.addColorStop(0, '#0b0e18'); r.addColorStop(0.6, '#1a2236'); r.addColorStop(1, hex); g.fillStyle = r; g.fillRect(0, 0, s, s); });
    const crate = this.canvasTex(128, (g, s) => { g.fillStyle = '#c4cad6'; g.fillRect(0, 0, s, s); g.strokeStyle = '#7d8699'; g.lineWidth = 8; g.strokeRect(10, 10, s - 20, s - 20); g.fillStyle = '#FFB23F'; [[0, 0], [s - 26, 0], [0, s - 26], [s - 26, s - 26]].forEach(([x, y]) => g.fillRect(x, y, 26, 26)); g.strokeStyle = '#5b6377'; g.lineWidth = 7; g.beginPath(); g.arc(s / 2, s / 2, 22, 0, 7); g.stroke(); });
    const leaf = this.canvasTex(128, (g, s) => { g.fillStyle = '#d3d7df'; g.fillRect(0, 0, s, s); g.fillStyle = '#FFB23F'; for (let k = 0; k < 6; k++) g.fillRect(0, 10 + k * 20, s, 6); });
    const leafExit = this.canvasTex(128, (g, s) => { g.fillStyle = '#d3d7df'; g.fillRect(0, 0, s, s); g.fillStyle = '#2BF0D6'; for (let k = 0; k < 6; k++) g.fillRect(0, 10 + k * 20, s, 6); });
    for (const t of [leaf, leafExit]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(0.55, 0.55); }
    this.mat = {
      1: new T.MeshBasicMaterial({ map: panel, vertexColors: true }),
      2: new T.MeshBasicMaterial({ map: metal, vertexColors: true }),
      // Glass: one continuous world-space hatch, plus a bright border only on edges flagged in gmask (1 left · 2 right · 4 bottom · 8 top).
      glass: new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: 'attribute vec2 guv;\nattribute float gmask;\nattribute vec4 ghole;\nvarying vec4 vH;\nvarying vec2 vUv;\nvarying float vMask;\nvarying vec3 vW;\nvoid main(){ vUv = guv; vMask = gmask; vH = ghole; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'varying vec2 vUv;\nvarying float vMask;\nvarying vec3 vW;\nvarying vec4 vH;\nfloat bit(float m, float b){ return mod(floor(m / b + 0.01), 2.0); }\nvoid main(){\n  float s = (vW.x + vW.y + vW.z) * 6.0; float fw = max(fwidth(s), 1e-4);\n  float line = (1.0 - clamp(abs(fract(s) - 0.5) / fw - 0.5, 0.0, 1.0)) * (1.0 - smoothstep(0.15, 0.4, fw));\n  float w = 0.045, e = 0.0;\n  if (bit(vMask, 1.0) > 0.5 && vUv.x < w) e = 1.0;\n  if (bit(vMask, 2.0) > 0.5 && vUv.x > 1.0 - w) e = 1.0;\n  if (bit(vMask, 4.0) > 0.5 && vUv.y < w) e = 1.0;\n  if (bit(vMask, 8.0) > 0.5 && vUv.y > 1.0 - w) e = 1.0;\n  if (vH.w > 0.0) { float hd = distance(vW, vH.xyz); if (hd < vH.w) discard; if (hd < vH.w + 0.035) e = 1.0; }\n  gl_FragColor = vec4(0.608, 1.0, 0.941, max(0.07 + 0.05 * line, e * 0.95));\n  #include <colorspace_fragment>\n}',
      }),
      field: new T.MeshBasicMaterial({ map: field, color: 0xbfe1ff, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, fog: false }),
      exit: new T.MeshBasicMaterial({ color: 0x2bf0d6 }),
      exitGlow: new T.MeshBasicMaterial({ color: 0x2bf0d6, transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }),
      exitBack: new T.MeshBasicMaterial({ color: 0x0a1b1f, side: T.DoubleSide }),
      crate: new T.MeshBasicMaterial({ map: crate, vertexColors: true }),
      platform: new T.MeshBasicMaterial({ map: metal, vertexColors: true, color: 0xb8c4c6 }),
      dark: new T.MeshBasicMaterial({ color: 0x2c3242 }),
      frame: new T.MeshBasicMaterial({ color: 0x59627a, side: T.DoubleSide }),
      leaf: new T.MeshBasicMaterial({ map: leaf, side: T.DoubleSide }),
      leafExit: new T.MeshBasicMaterial({ map: leafExit, side: T.DoubleSide }),
      tube: new T.MeshBasicMaterial({ color: 0x3a4152, side: T.DoubleSide }),
      amber: new T.MeshBasicMaterial({ color: 0xffb23f }),
      botBody: new T.MeshBasicMaterial({ color: 0x3d4660 }),
      botTop: new T.MeshBasicMaterial({ color: 0x56617f }),
      gunBody: new T.MeshBasicMaterial({ color: 0xeef1f6 }),
      gunTip: new T.MeshBasicMaterial({ color: 0x3fc3ff, fog: false }),
    };
    this.pmat = {}; this.nmat = {}; this.fmat = {}; this.rmat = {}; this.gmat = {};
    for (const k of ['a', 'b']) {
      this.pmat[k] = this.portalShader(this.rt[k], false);
      this.nmat[k] = this.portalShader(this.rt[k], true);
      this.fmat[k] = new T.MeshBasicMaterial({ map: swirl(this.HEX[k]) });
      this.rmat[k] = new T.MeshBasicMaterial({ color: this.COL[k], fog: false });
      this.gmat[k] = new T.MeshBasicMaterial({ map: glow, color: this.COL[k], transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    }
    const ell = (a, b) => { const s = new T.Shape(); s.absellipse(0, 0, a, b, 0, Math.PI * 2, false, 0); return s; };
    this.ellGeo = new T.ShapeGeometry(ell(0.46, 0.96), 40);
    const ring = ell(0.5, 1.0); const hole = new T.Path(); hole.absellipse(0, 0, 0.44, 0.94, 0, Math.PI * 2, true, 0); ring.holes.push(hole);
    this.rimGeo = new T.ShapeGeometry(ring, 40);
    this.glowGeo = new T.PlaneGeometry(1.7, 2.7);
    this.nearGeo = new T.BoxGeometry(1.0, 2.0, 1.0).translate(0, 0, -0.5);
  },
  portalShader(rt, near) {
    const T = this.T;
    return new T.ShaderMaterial({
      uniforms: { map: { value: rt.texture }, res: { value: new T.Vector2(1, 1) } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map;\nuniform vec2 res;\nvoid main(){\n  gl_FragColor = texture2D(map, gl_FragCoord.xy / res);\n  #include <colorspace_fragment>\n}',
      side: near ? T.BackSide : T.FrontSide, depthTest: !near, depthWrite: !near,
    });
  },
  applyQuality(force) {
    const q = this.props.quality ?? 'Auto';
    if (!force && q === this.qMode) return;
    this.qMode = q; const dpr = window.devicePixelRatio || 1;
    this.maxPr = Math.min(dpr, 2);
    const low = q === 'Low';
    this.pr = low ? Math.min(dpr, 0.85) : q === 'High' ? this.maxPr : Math.min(dpr, 1.5);
    this.portalScale = low ? 0.4 : 1;
    // Portal views match the main view (full size, 4× MSAA) except in performance mode (0.4×, no smoothing).
    const samples = low ? 0 : 4;
    if (this.rt) for (const k of ['a', 'b']) if (this.rt[k].samples !== samples) { this.rt[k].samples = samples; this.rt[k].dispose(); }
    // Performance mode: nearer fog and draw distance (less to draw in every portal view) and portal views alternate frames.
    this.altPortals = low;
    if (this.scene && this.scene.fog) { this.scene.fog.near = low ? 14 : 22; this.scene.fog.far = low ? 38 : 60; }
    for (const c of [this.camera, this.vcam]) if (c) { c.far = low ? 42 : 120; c.updateProjectionMatrix(); }
    this.doResize();
  },
  doResize() {
    const R = this.renderer, el = this.mountRef.current; if (!R || !el) return;
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    R.setPixelRatio(this.pr || 1); R.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const b = R.getDrawingBufferSize(this.v.buf);
    for (const k of ['a', 'b']) {
      this.rt[k].setSize(Math.max(16, Math.round(b.x * this.portalScale)), Math.max(16, Math.round(b.y * this.portalScale)));
      this.pmat[k].uniforms.res.value.set(b.x, b.y); this.nmat[k].uniforms.res.value.set(b.x, b.y);
    }
  },
};
