/* Dino Park — the low-poly world (Three.js), carried over from the Claude Design handoff (research/design/dino-world.js).
   Arcade changes are marked ARCADE: tablet budget (pixel ratio, shadow map), shop treats (balloons, statue, arch,
   fireworks), shop dino colours (skins), and a couple of extra events for the sound effects.
   Original header: Dino Park — shared low-poly world. Registers <dino-world> (live park) and <dp-icon> (rendered icons).
   Loads three.js on demand. Commands: element methods, or window 'dp:cmd'. Events: window 'dp:world'. */
(function () {
  if (window.__DP_LOADED) return; window.__DP_LOADED = true;
  const URL3 = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  let T = null;
  const ready = import(URL3).then(m => (T = m));

  // ---------------- data
  const DINOS = {
    stompy:   { name: 'Stompy',   species: 'Triceratops',   col: '#5aa3d6', belly: '#f3e4bd', accent: '#f6c54a', eats: 'leaf', pen: 'small', sneak: 1, taps: 2, size: .85, speed: 1.6, budget: 700 },
    zippy:    { name: 'Zippy',    species: 'Velociraptor',  col: '#f08a3c', belly: '#ffe2b8', accent: '#7a52d0', eats: 'meat', pen: 'small', sneak: 5, taps: 1, size: .8,  speed: 3.2, budget: 600 },
    longneck: { name: 'Longneck', species: 'Brachiosaurus', col: '#9bcf55', belly: '#eef3c4', accent: '#5a9e3a', eats: 'leaf', pen: 'big',   sneak: 1, taps: 3, size: .72, speed: 1.2, budget: 800 },
    flappy:   { name: 'Flappy',   species: 'Pteranodon',    col: '#ee7fb0', belly: '#ffe3ee', accent: '#ffcf4a', eats: 'fish', pen: 'small', sneak: 4, taps: 1, size: .85, speed: 2.6, budget: 500 },
    spike:    { name: 'Spike',    species: 'Stegosaurus',   col: '#8b72d8', belly: '#ece3fb', accent: '#ffb347', eats: 'leaf', pen: 'small', sneak: 3, taps: 2, size: .85, speed: 1.4, budget: 750 },
    rexy:     { name: 'Rexy',     species: 'T-Rex',         col: '#46b36e', belly: '#f5ecc8', accent: '#2f8a52', eats: 'meat', pen: 'big',   sneak: 2, taps: 3, size: .8,  speed: 1.9, budget: 900 },
    tank:     { name: 'Tank',     species: 'Ankylosaurus',  col: '#d6a445', belly: '#f6e3b4', accent: '#8a5a3b', eats: 'leaf', pen: 'small', sneak: 1, taps: 3, size: .85, speed: 1.1, budget: 750 },
    horns:    { name: 'Horns',    species: 'Styracosaurus', col: '#e0604f', belly: '#ffe0cf', accent: '#ffd166', eats: 'leaf', pen: 'small', sneak: 2, taps: 2, size: .85, speed: 1.5, budget: 750 },
    honk:     { name: 'Honk',     species: 'Parasaurolophus', col: '#4fbfb0', belly: '#e2f7f1', accent: '#ff8a5c', eats: 'leaf', pen: 'small', sneak: 3, taps: 2, size: .85, speed: 2.0, budget: 650 },
    bonk:     { name: 'Bonk',     species: 'Pachycephalosaurus', col: '#6f8fe0', belly: '#e6ecff', accent: '#f7b55a', eats: 'leaf', pen: 'small', sneak: 3, taps: 2, size: .9, speed: 2.2, budget: 600 },
    sail:     { name: 'Sail',     species: 'Spinosaurus',   col: '#2f7fa8', belly: '#dff1f8', accent: '#ff9e6b', eats: 'fish', pen: 'big',   sneak: 2, taps: 3, size: .8,  speed: 1.7, budget: 900 },
    frilly:   { name: 'Frilly',   species: 'Dilophosaurus', col: '#f2cf45', belly: '#fff6d6', accent: '#e0503f', eats: 'meat', pen: 'small', sneak: 4, taps: 1, size: .85, speed: 2.8, budget: 650 },
    tiny:     { name: 'Tiny',     species: 'Compsognathus', col: '#6ccf8e', belly: '#e8fbef', accent: '#3b8f5a', eats: 'meat', pen: 'small', sneak: 5, taps: 1, size: 1,   speed: 3.4, budget: 400 },
    dash:     { name: 'Dash',     species: 'Gallimimus',    col: '#c78ce0', belly: '#f6e8fc', accent: '#ffcf4a', eats: 'leaf', pen: 'small', sneak: 4, taps: 1, size: .85, speed: 3.6, budget: 550 },
    thumbs:   { name: 'Thumbs',   species: 'Iguanodon',     col: '#b5895e', belly: '#f3e2c8', accent: '#6e4f33', eats: 'leaf', pen: 'big',   sneak: 2, taps: 2, size: .8,  speed: 1.6, budget: 750 },
    chompy:   { name: 'Chompy',   species: 'Allosaurus',    col: '#d6567a', belly: '#ffe2e6', accent: '#8b2f4a', eats: 'meat', pen: 'big',   sneak: 3, taps: 3, size: .8,  speed: 2.0, budget: 850 },
  };
  const RATES = { stompy: [.9, .8], zippy: [1.1, 1.5], longneck: [1.2, .7], flappy: [1, 1.2], spike: [1.5, .9], rexy: [1.1, 1.1], tank: [.8, .8], horns: [1, 1], honk: [.9, 1.2], bonk: [.9, 1.4], sail: [1.3, 1], frilly: [1, 1.3], tiny: [1.2, 1.6], dash: [.9, 1.5], thumbs: [1, .9], chompy: [1.3, 1.1] };
  Object.keys(RATES).forEach(k => { DINOS[k].hr = RATES[k][0]; DINOS[k].fr = RATES[k][1]; });
  const SKINS = {
    sunny:  { col: '#f5b841', belly: '#fff1c9', accent: '#e0693a' },
    sunset: { col: '#ff6f7d', belly: '#ffe0d6', accent: '#ffc34a' },
    starry: { col: '#5b6fd6', belly: '#e9ecff', accent: '#ffe27a' },
    gold:   { col: '#e8b93a', belly: '#fbe7a6', accent: '#c9901c', metal: true },
    // ARCADE: a colour for every other dino
    candy:  { col: '#ff8fc8', belly: '#ffe6f2', accent: '#8b5cf6' },
    ocean:  { col: '#3fa7d6', belly: '#dff3fb', accent: '#ffd166' },
    cherry: { col: '#e8505b', belly: '#ffe1e1', accent: '#ffd166' },
    minty:  { col: '#5fd3b0', belly: '#e6fbf4', accent: '#ff8a5c' },
    magma:  { col: '#4a4250', belly: '#ffb07a', accent: '#ff6a2e' },
    neon:   { col: '#8bdc3c', belly: '#f3ffd9', accent: '#ff4fa3' },
    frost:  { col: '#e3eaf3', belly: '#ffffff', accent: '#6f9fd6' },
    dusk:   { col: '#ff8a4c', belly: '#fff0d9', accent: '#b24bd6' },
    berry:  { col: '#8a5bd6', belly: '#efe6ff', accent: '#ffcf4a' },
    rocket: { col: '#ff5a3c', belly: '#fff0e6', accent: '#ffd23c' },
    jungle: { col: '#3f9a4a', belly: '#e5f6d9', accent: '#f2c23b' },
    sky:    { col: '#4bb4e6', belly: '#e6f6ff', accent: '#ffffff' },
  };
  const PARKS = {
    jungle:  { ground: '#86c45e', ground2: '#7dbb57', edge: '#6aac4c', hill: '#5f9e45', path: '#f3dfb2', path2: '#ead3a0', rock: '#9aa79b', rock2: '#80907f', tree: ['#4fa34a', '#63b84f', '#3f8f45'], trunk: '#8a5a3b', water: '#56c3e8', sky: '#bfe6d6', hemiS: '#f1fff6', hemiG: '#6b8f4e', pen: '#a6d06f', kind: 'lolly' },
    volcano: { ground: '#e6b77e', ground2: '#dcaa6e', edge: '#4a4450', hill: '#3e3843', path: '#f7e8c8', path2: '#eedcb4', rock: '#4f4855', rock2: '#3a343f', tree: ['#62b848', '#7fcb52', '#4fa243'], trunk: '#9a6a44', water: '#43c1d6', sky: '#ffd8b5', hemiS: '#fff2e4', hemiG: '#7a5a48', pen: '#cfa46b', kind: 'palm', lava: '#ff7a2e' },
    snowy:   { ground: '#eef4f8', ground2: '#e3ecf3', edge: '#d6e3ee', hill: '#c9d8e6', path: '#f3dcb8', path2: '#e9cfa6', rock: '#a3b6c8', rock2: '#8ea3b8', tree: ['#3f8f6e', '#4c9e7b', '#357f61'], trunk: '#7a5236', water: '#a7dcf2', sky: '#d6eaf8', hemiS: '#f6fbff', hemiG: '#9fb4c8', pen: '#dfeaf2', kind: 'pine' },
    desert:  { ground: '#ecc98f', ground2: '#e4bf82', edge: '#d9a466', hill: '#cf8a52', path: '#fff3dc', path2: '#f7e6c4', rock: '#c96f42', rock2: '#a95a34', tree: ['#5fae5a', '#76be66', '#4f9c4c'], trunk: '#8a5a3b', water: '#4fc3e0', sky: '#ffe6c7', hemiS: '#fff4e2', hemiG: '#9a6a44', pen: '#e9cf98', kind: 'cactus' },
    beach:   { ground: '#f3dca6', ground2: '#ecd296', edge: '#f5e3b3', hill: '#8fcb66', path: '#c98a55', path2: '#b97a48', rock: '#b9b2a6', rock2: '#9d968a', tree: ['#5fb84a', '#7ccb55', '#4ea744'], trunk: '#9a6a44', water: '#35bfe0', sky: '#c4ebfb', hemiS: '#f2fbff', hemiG: '#b8a070', pen: '#bfe08a', kind: 'palm' },
  };
  const PEN_STYLES = {
    log:   { post: '#9b6440', rail: '#c98a55', cap: '#7a4b2e' },
    stone: { post: '#a8a39a', rail: '#c4bfb4', cap: '#8d877d', chunky: true },
    lava:  { post: '#3e3842', rail: '#57505c', cap: '#ff7a2e', glow: true, chunky: true },
    ice:   { post: '#aee0f5', rail: '#dff4fd', cap: '#ffffff' },
  };
  const PIECES = { vc: { w: 4, d: 3 }, lookout: { w: 1, d: 1 }, pen: { w: 4, d: 4 }, pen_s: { w: 3, d: 3 }, pen_b: { w: 4, d: 3 }, icecream: { w: 2, d: 2 }, burger: { w: 2, d: 2 }, toilet: { w: 2, d: 1 }, fountain: { w: 2, d: 2 }, tree: { w: 1, d: 1 }, bin: { w: 1, d: 1 }, balloons: { w: 1, d: 1 }, statue: { w: 2, d: 2 } };  // ARCADE: treats
  const GW = 26, GH = 15, GX = 12, GZ = 14;
  const PARK_DINOS = {
    jungle:  { A: 'stompy', B: null, C: 'zippy', D: null, E: 'tiny' },
    volcano: { A: 'stompy', B: 'longneck', C: 'zippy', D: null, E: 'spike' },
    snowy:   { A: 'spike', B: 'rexy', C: 'zippy', D: null, E: 'bonk', F: 'flappy' },
    desert:  { A: 'tank', B: 'thumbs', C: 'frilly', D: null, E: 'horns' },
    beach:   { A: 'honk', B: 'sail', C: 'chompy', D: null, E: 'dash' },
  };
  window.DinoPark = Object.assign(window.DinoPark || {}, { DINOS, SKINS, PARKS, PIECES, ready });

  // ---------------- helpers
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
  const rr = (a, b) => a + rnd() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const back = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function h3(x, y, z, s) {
    const a = Math.round(x * 997), b = Math.round(y * 991), c = Math.round(z * 983);
    const f = n => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + n * 4.1 + s * 1.7) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
    return [f(1), f(2), f(3)];
  }
  const gc = new Map();
  const cg = (k, f) => { let g = gc.get(k); if (!g) { g = f(); gc.set(k, g); } return g; };
  function facet(geo, jit, seed) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (jit) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = h3(x, y, z, seed || 1); p.setXYZ(i, x + h[0] * jit, y + h[1] * jit, z + h[2] * jit); } }
    g.computeVertexNormals(); return g;
  }
  const G = {
    ico: (d = 1, j = 0, s = 1) => cg(`i${d}_${j}_${s}`, () => facet(new T.IcosahedronGeometry(1, d), j, s)),
    dode: (j = 0, s = 1) => cg(`d${j}_${s}`, () => facet(new T.DodecahedronGeometry(1, 0), j, s)),
    cyl: (a, b, h, n = 6) => cg(`c${a}_${b}_${h}_${n}`, () => facet(new T.CylinderGeometry(a, b, h, n))),
    cone: (r, h, n = 6) => cg(`k${r}_${h}_${n}`, () => facet(new T.ConeGeometry(r, h, n))),
    box: (w, h, d) => cg(`b${w}_${h}_${d}`, () => facet(new T.BoxGeometry(w, h, d))),
    half: (top, n = 8) => cg(`h${top}_${n}`, () => facet(new T.SphereGeometry(1, n, 4, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2))),
    torus: (r, t, rs, ts, arc = Math.PI * 2) => cg(`t${r}_${t}_${rs}_${ts}_${arc}`, () => facet(new T.TorusGeometry(r, t, rs, ts, arc))),
  };
  const mc = new Map();
  function M(c, o) {
    const k = c + (o ? JSON.stringify(o) : ''); let m = mc.get(k);
    if (!m) { m = new T.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: .82, metalness: 0 }, o || {})); mc.set(k, m); }
    return m;
  }
  function mesh(par, geo, col, p, s, r) {
    const m = new T.Mesh(geo, typeof col === 'string' ? M(col) : col);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (s != null) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
    if (r) m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = true; m.receiveShadow = true; par.add(m); return m;
  }
  function grp(par, p, r) { const g = new T.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); if (par) par.add(g); return g; }
  function shade(hex, amt) { const c = new T.Color(hex); c.lerp(new T.Color(amt > 0 ? '#ffffff' : '#000000'), Math.abs(amt)); return '#' + c.getHexString(); }
  const PI = Math.PI;

  // ---------------- dinos
  function eyes(P, head, x, y, z, r) {
    for (const sx of [-1, 1]) {
      const e = grp(head, [sx * x, y, z]);
      mesh(e, G.ico(1), '#ffffff', [0, 0, 0], r);
      mesh(e, G.ico(1), '#2b2320', [sx * r * .08, r * .05, r * .55], r * .62);
      mesh(e, G.ico(0), '#ffffff', [sx * r * .1 + r * .12, r * .3, r * 1.05], r * .2);
      P.eyes.push(e);
    }
  }
  function leg(par, p, len, r, col, foot) {
    const piv = grp(par, p);
    mesh(piv, G.cyl(r * .85, r, len, 6), col, [0, -len / 2, 0]);
    mesh(piv, G.ico(0), foot || col, [0, -len + r * .15, r * .35], [r * 1.25, r * .6, r * 1.55]);
    return piv;
  }
  function tail(P, par, p, n, len, r, col) {
    let pp = par, pos = p;
    for (let i = 0; i < n; i++) {
      const piv = grp(pp, pos); const rr0 = r * (1 - i / n * .75);
      mesh(piv, G.cyl(rr0, rr0 * .72, len, 6), col, [0, 0, -len / 2], 1, [PI / 2, 0, 0]);
      P.tail.push(piv); pp = piv; pos = [0, 0, -len * .88];
    }
  }
  const BUILD = {
    stompy(root, P, c) {
      const B = grp(root, [0, .62, 0]); P.body = B;
      P.bodyMesh = mesh(B, G.ico(1, .06, 2), c.col, [0, 0, 0], [.56, .46, .72]);
      mesh(B, G.ico(1), c.belly, [0, -.13, .1], [.46, .33, .58]);
      for (let i = 0; i < 3; i++) mesh(B, G.ico(0), c.dark, [(i - 1) * .2, .38, -.1 - i * .08], [.1, .06, .1]);
      const H = grp(B, [0, .1, .6]); P.head = H;
      mesh(H, G.ico(1, .05, 3), c.col, [0, 0, .18], [.36, .31, .37]);
      mesh(H, G.ico(1), c.col, [0, -.06, .46], [.2, .17, .2]);
      mesh(H, G.cone(.08, .16, 5), '#f4e3b8', [0, -.05, .66], 1, [PI / 2, 0, 0]);
      mesh(H, G.cyl(.5, .5, .08, 9), c.acc, [0, .24, -.02], [1, 1, .9], [PI / 2 - .35, 0, 0]);
      for (let i = 0; i < 5; i++) { const a = PI * (.15 + i * .175); mesh(H, G.ico(0), c.belly, [Math.cos(a) * .48, .24 + Math.sin(a) * .44, -.14], .07); }
      for (const sx of [-1, 1]) mesh(H, G.cone(.06, .3, 5), '#fff3d2', [sx * .15, .25, .33], 1, [.95, 0, sx * -.2]);
      mesh(H, G.cone(.05, .14, 5), '#fff3d2', [0, .07, .56], 1, [.5, 0, 0]);
      eyes(P, H, .2, .08, .4, .11);
      const J = grp(H, [0, -.14, .32]); P.jaw = J;
      mesh(J, G.ico(1), c.belly, [0, -.02, .12], [.17, .07, .19]);
      P.legs = [[-1, .38], [1, .38], [-1, -.36], [1, -.36]].map(([sx, z]) => leg(B, [sx * .3, -.12, z], .5, .12, c.col, c.dark));
      P.quad = true;
      tail(P, B, [0, .05, -.62], 3, .28, .16, c.col);
      P.hat = [H, [0, .38, .1], .9];
    },
    zippy(root, P, c) {
      const B = grp(root, [0, .62, 0]); P.body = B; P.lean = .12;
      P.bodyMesh = mesh(B, G.ico(1, .05, 4), c.col, [0, 0, 0], [.3, .3, .48]);
      mesh(B, G.ico(1), c.belly, [0, -.1, .1], [.22, .2, .36]);
      for (let i = 0; i < 3; i++) mesh(B, G.ico(0), c.acc, [0, .27 - i * .01, .15 - i * .18], [.2, .05, .06]);
      const H = grp(B, [0, .2, .36]); P.head = H;
      mesh(H, G.ico(1, .04, 5), c.col, [0, .12, .12], [.22, .2, .28]);
      mesh(H, G.ico(1), c.col, [0, .06, .36], [.16, .11, .2]);
      mesh(H, G.ico(0), c.acc, [0, .3, .05], [.06, .07, .16]);
      eyes(P, H, .13, .18, .24, .09);
      const J = grp(H, [0, 0, .26]); P.jaw = J;
      mesh(J, G.ico(1), c.belly, [0, -.02, .1], [.13, .05, .17]);
      P.legs = [-1, 1].map(sx => { const l = leg(B, [sx * .16, -.08, -.02], .54, .085, c.col, c.dark); mesh(l, G.ico(1), c.col, [0, -.08, 0], [.13, .2, .17]); return l; });
      P.arms = [-1, 1].map(sx => { const a = grp(B, [sx * .19, 0, .3], [.9, 0, 0]); mesh(a, G.cyl(.04, .035, .18, 5), c.col, [0, -.09, 0]); return a; });
      tail(P, B, [0, .05, -.42], 4, .26, .12, c.col);
      P.hat = [H, [0, .34, .1], .7];
    },
    longneck(root, P, c) {
      const B = grp(root, [0, 1.25, 0]); P.body = B;
      P.bodyMesh = mesh(B, G.ico(1, .05, 6), c.col, [0, 0, 0], [.85, .72, 1.15]);
      mesh(B, G.ico(1), c.belly, [0, -.25, .1], [.7, .45, .95]);
      for (let i = 0; i < 4; i++) mesh(B, G.ico(0), c.dark, [(i % 2 ? .3 : -.25), .62, .4 - i * .3], [.16, .06, .16]);
      P.neck = []; let par = B, pos = [0, .35, .8];
      for (let i = 0; i < 4; i++) {
        const n = grp(par, pos, [i === 0 ? .55 : .06, 0, 0]); const r0 = .27 - i * .03;
        mesh(n, G.cyl(r0 * .85, r0, .52, 6), c.col, [0, .26, 0]);
        P.neck.push(n); par = n; pos = [0, .48, 0];
      }
      const H = grp(par, [0, .5, 0], [-.7, 0, 0]); P.head = H;
      mesh(H, G.ico(1, .04, 7), c.col, [0, .05, .12], [.28, .24, .36]);
      mesh(H, G.ico(1), c.col, [0, 0, .38], [.2, .15, .18]);
      eyes(P, H, .19, .12, .22, .1);
      const J = grp(H, [0, -.1, .3]); P.jaw = J;
      mesh(J, G.ico(1), c.belly, [0, -.02, .08], [.16, .05, .14]);
      P.legs = [[-1, .6], [1, .6], [-1, -.6], [1, -.6]].map(([sx, z]) => leg(B, [sx * .48, -.3, z], .95, .2, c.col, c.dark));
      P.quad = true;
      tail(P, B, [0, .05, -1.05], 4, .5, .3, c.col);
      P.hat = [H, [0, .3, .1], 1];
    },
    flappy(root, P, c) {
      const B = grp(root, [0, .52, 0]); P.body = B; P.flyer = true;
      P.bodyMesh = mesh(B, G.ico(1, .04, 8), c.col, [0, 0, 0], [.27, .26, .36]);
      mesh(B, G.ico(1), c.belly, [0, -.08, .08], [.2, .18, .26]);
      const H = grp(B, [0, .24, .26]); P.head = H;
      mesh(H, G.ico(1, .04, 9), c.col, [0, .05, .06], [.2, .19, .22]);
      mesh(H, G.cone(.08, .42, 6), c.acc, [0, .0, .42], [1, 1, .7], [PI / 2, 0, 0]);
      mesh(H, G.cone(.07, .34, 5), c.col, [0, .2, -.18], 1, [-2.3, 0, 0]);
      eyes(P, H, .13, .1, .17, .085);
      const J = grp(H, [0, -.05, .2]); P.jaw = J;
      mesh(J, G.cone(.05, .3, 5), shade(c.acc, -.1), [0, -.02, .15], [1, 1, .6], [PI / 2, 0, 0]);
      P.wings = [-1, 1].map(sx => {
        const w = grp(B, [sx * .22, .1, 0]);
        mesh(w, G.box(.62, .04, .42), shade(c.c, .12), [sx * .3, 0, 0]);
        const o = grp(w, [sx * .6, 0, 0]); w.userData.outer = o;
        mesh(o, G.box(.56, .035, .3), shade(c.c, .25), [sx * .26, 0, -.04]);
        mesh(o, G.ico(0), c.acc, [sx * .54, 0, -.04], [.06, .03, .1]);
        return w;
      });
      P.legs = [-1, 1].map(sx => leg(B, [sx * .1, -.2, -.05], .3, .05, c.acc, c.acc));
      tail(P, B, [0, 0, -.34], 2, .16, .07, c.col);
      P.hat = [H, [0, .28, .02], .7];
    },
    spike(root, P, c) {
      const B = grp(root, [0, .6, 0]); P.body = B;
      P.bodyMesh = mesh(B, G.ico(1, .06, 10), c.col, [0, 0, 0], [.5, .48, .78]);
      mesh(B, G.ico(1), c.belly, [0, -.16, .08], [.4, .3, .6]);
      [[.55, .09, .15], [.28, .13, .2], [-.02, .15, .23], [-.32, .13, .2], [-.58, .09, .15]].forEach(([z, s, h], i) => {
        const y = .43 * Math.sqrt(Math.max(0, 1 - (z / .8) ** 2));
        mesh(B, G.ico(1, .04, 11 + i), c.acc, [0, y + h * .55, z], [.06, h, s * 1.2]);
      });
      const H = grp(B, [0, -.06, .72]); P.head = H;
      mesh(H, G.ico(1, .05, 12), c.col, [0, 0, .12], [.22, .2, .27]);
      mesh(H, G.ico(1), c.col, [0, -.05, .3], [.15, .12, .14]);
      eyes(P, H, .13, .07, .25, .085);
      P.brows = [-1, 1].map(sx => mesh(H, G.box(.12, .03, .04), shade(c.c, -.35), [sx * .13, .17, .3], 1, [0, 0, sx * .35]));
      const J = grp(H, [0, -.12, .2]); P.jaw = J;
      mesh(J, G.ico(1), c.belly, [0, -.01, .1], [.13, .05, .13]);
      P.legs = [[-1, .42], [1, .42], [-1, -.4], [1, -.4]].map(([sx, z]) => leg(B, [sx * .28, -.15, z], .45, .11, c.col, c.dark));
      P.quad = true;
      tail(P, B, [0, .05, -.72], 3, .3, .16, c.col);
      const last = P.tail[2];
      for (const sx of [-1, 1]) for (const z of [-.12, -.26]) mesh(last, G.cone(.045, .2, 5), '#fff3d2', [sx * .1, .06, z], 1, [0, 0, sx * -1.1]);
      P.hat = [H, [0, .24, .1], .75];
    },
    rexy(root, P, c) {
      const B = grp(root, [0, 1.12, 0]); P.body = B; P.lean = .22;
      P.bodyMesh = mesh(B, G.ico(1, .05, 13), c.col, [0, 0, 0], [.52, .58, .7]);
      mesh(B, G.ico(1), c.belly, [0, -.08, .22], [.4, .45, .45]);
      for (let i = 0; i < 4; i++) mesh(B, G.ico(0), c.dark, [0, .5 - i * .08, -.1 - i * .15], [.14, .06, .1]);
      const H = grp(B, [0, .52, .4]); P.head = H;
      mesh(H, G.ico(1, .04, 14), c.col, [0, .1, .2], [.46, .4, .5]);
      mesh(H, G.ico(1), c.col, [0, .02, .55], [.36, .2, .3]);
      for (const sx of [-1, 1]) mesh(H, G.ico(0), c.dark, [sx * .12, .12, .8], .04);
      eyes(P, H, .28, .26, .4, .14);
      const J = grp(H, [0, -.1, .32]); P.jaw = J;
      mesh(J, G.ico(1), c.belly, [0, -.05, .2], [.33, .1, .36]);
      mesh(J, G.ico(1), '#ff8aa2', [0, .02, .2], [.22, .04, .26]);
      P.arms = [-1, 1].map(sx => { const a = grp(B, [sx * .4, 0, .4], [1.1, 0, sx * -.3]); mesh(a, G.cyl(.06, .05, .24, 5), c.col, [0, -.12, 0]); mesh(a, G.ico(0), c.col, [0, -.26, 0], .07); return a; });
      P.legs = [-1, 1].map(sx => { const l = leg(B, [sx * .32, -.28, -.05], .84, .13, c.col, c.dark); mesh(l, G.ico(1), c.col, [0, -.12, 0], [.24, .36, .3]); return l; });
      tail(P, B, [0, -.1, -.62], 4, .4, .3, c.col);
      P.tail[0].rotation.x = -.35;
      P.hat = [H, [0, .5, .12], 1.2];
    },
  };
  function bipedB(root, P, c, o) {
    const b = o.b, h = o.h, sn = o.snout || 1, lr = o.legR || .09;
    const B = grp(root, [0, o.y, 0]); P.body = B; P.lean = o.lean || 0;
    P.bodyMesh = mesh(B, G.ico(1, .05, o.seed), c.col, [0, 0, 0], b);
    mesh(B, G.ico(1), c.belly, [0, -b[1] * .22, b[2] * .22], [b[0] * .78, b[1] * .74, b[2] * .7]);
    let hp = B, hpos = [0, b[1] * .55, b[2] * .78];
    if (o.neck) { P.neck = []; const N = o.neck; for (let i = 0; i < N.n; i++) { const n = grp(hp, hpos, [i === 0 ? N.tilt : .06, 0, 0]); mesh(n, G.cyl(N.r * .85, N.r, N.len, 6), c.col, [0, N.len / 2, 0]); P.neck.push(n); hp = n; hpos = [0, N.len * .92, 0]; } }
    const H = grp(hp, hpos, o.neck ? [-(o.neck.tilt + .06 * (o.neck.n - 1)), 0, 0] : null); P.head = H;
    mesh(H, G.ico(1, .04, o.seed + 1), c.col, [0, h[1] * .4, h[2] * .35], h);
    mesh(H, G.ico(1), c.col, [0, h[1] * .1, h[2] * (.9 + .35 * sn)], [h[0] * .72, h[1] * .55, h[2] * .6 * sn]);
    eyes(P, H, h[0] * .6, h[1] * .72, h[2] * .8, o.eye || h[0] * .45);
    const J = grp(H, [0, -h[1] * .1, h[2] * .8]); P.jaw = J;
    mesh(J, G.ico(1), c.belly, [0, -.02, h[2] * .4 * sn], [h[0] * .6, h[1] * .2, h[2] * .55 * sn]);
    const legLen = o.y - b[1] * .3;
    P.legs = [-1, 1].map(sx => { const l = leg(B, [sx * b[0] * .55, -b[1] * .3, -b[2] * .05], legLen, lr, c.col, c.dark); mesh(l, G.ico(1), c.col, [0, -legLen * .15, 0], [lr * 1.8, legLen * .3, lr * 2.1]); return l; });
    if (o.arms !== false) { const as = o.armS || 1; P.arms = [-1, 1].map(sx => { const a = grp(B, [sx * b[0] * .72, 0, b[2] * .6], [1, 0, sx * -.3]); mesh(a, G.cyl(.045 * as, .04 * as, .2 * as, 5), c.col, [0, -.1 * as, 0]); return a; }); }
    tail(P, B, [0, 0, -b[2] * .88], o.tail[0], o.tail[1], o.tail[2], c.col);
    P.hat = [H, [0, h[1] * .92, h[2] * .3], h[0] * 3.3];
    return { B, H, J };
  }
  function quadB(root, P, c, o) {
    const b = o.b, h = o.h;
    const B = grp(root, [0, o.y, 0]); P.body = B;
    P.bodyMesh = mesh(B, G.ico(1, .06, o.seed), c.col, [0, 0, 0], b);
    mesh(B, G.ico(1), c.belly, [0, -b[1] * .28, b[2] * .1], [b[0] * .82, b[1] * .7, b[2] * .8]);
    const H = grp(B, [0, o.hy ?? b[1] * .15, b[2] * .82]); P.head = H;
    mesh(H, G.ico(1, .05, o.seed + 1), c.col, [0, 0, h[2] * .5], h);
    mesh(H, G.ico(1), c.col, [0, -h[1] * .2, h[2] * 1.25], [h[0] * .62, h[1] * .6, h[2] * .55]);
    eyes(P, H, h[0] * .58, h[1] * .28, h[2] * .95, o.eye || h[0] * .34);
    const J = grp(H, [0, -h[1] * .45, h[2] * 1.0]); P.jaw = J;
    mesh(J, G.ico(1), c.belly, [0, -.02, h[2] * .35], [h[0] * .5, h[1] * .2, h[2] * .45]);
    const legLen = o.y - b[1] * .3;
    P.legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => leg(B, [sx * b[0] * .58, -b[1] * .3, sz * b[2] * .55], legLen, o.legR || .12, c.col, c.dark));
    P.quad = true;
    tail(P, B, [0, .02, -b[2] * .9], o.tail[0], o.tail[1], o.tail[2], c.col);
    P.hat = [H, [0, h[1] * .9, h[2] * .45], h[0] * 3];
    return { B, H, J };
  }
  Object.assign(BUILD, {
    tank(root, P, c) { const { B } = quadB(root, P, c, { seed: 40, y: .44, b: [.62, .34, .82], h: [.26, .18, .26], legR: .12, tail: [3, .3, .16] });
      for (const x of [-1, 0, 1]) for (const z of [.45, .12, -.22, -.52]) { const px = x * .3, y = .34 * Math.sqrt(Math.max(0, 1 - (px / .62) ** 2 - (z / .82) ** 2)); mesh(B, G.ico(0), c.acc, [px, y + .02, z], [.11, .06, .11]); }
      for (const sx of [-1, 1]) for (const z of [.3, -.1, -.45]) mesh(B, G.ico(1), '#fff3d2', [sx * .6, .02, z], .07);
      mesh(P.tail[2], G.ico(1, .06, 4), c.acc, [0, 0, -.3], [.2, .14, .18]); },
    horns(root, P, c) { const { H } = quadB(root, P, c, { seed: 42, y: .6, b: [.55, .45, .72], h: [.34, .3, .36], tail: [3, .28, .16] });
      mesh(H, G.cyl(.5, .5, .08, 9), c.acc, [0, .26, .05], [1, 1, .9], [PI / 2 - .4, 0, 0]);
      for (let i = 0; i < 6; i++) { const a = PI * (.1 + i * .16); mesh(H, G.cone(.06, .24, 5), '#fff3d2', [Math.cos(a) * .5, .28 + Math.sin(a) * .46, -.06], 1, [-.3, 0, a - PI / 2]); }
      mesh(H, G.cone(.08, .32, 5), '#fff3d2', [0, .06, .72], 1, [.5, 0, 0]); },
    honk(root, P, c) { const { H } = bipedB(root, P, c, { seed: 44, y: .8, b: [.36, .38, .58], h: [.2, .18, .26], lean: .25, snout: 1.25, tail: [4, .3, .14], legR: .1 });
      mesh(H, G.cyl(.06, .075, .75, 6), c.acc, [0, .38, -.12], 1, [-1.05, 0, 0]); mesh(H, G.ico(1), c.acc, [0, .58, -.44], .075);
      mesh(H, G.ico(1), c.belly, [0, .02, .52], [.16, .05, .16]); },
    bonk(root, P, c) { const { H } = bipedB(root, P, c, { seed: 46, y: .62, b: [.3, .32, .44], h: [.22, .22, .24], lean: .1, tail: [3, .24, .12] });
      mesh(H, G.ico(1, .03, 7), c.acc, [0, .26, .06], [.25, .2, .25]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; mesh(H, G.ico(0), c.belly, [Math.cos(a) * .22, .14, .06 + Math.sin(a) * .22], .045); } },
    sail(root, P, c) { const { B } = bipedB(root, P, c, { seed: 48, y: 1.0, b: [.44, .46, .78], h: [.24, .2, .3], snout: 1.7, lean: .32, tail: [4, .36, .22], legR: .12 });
      mesh(B, G.cyl(.55, .55, .06, 11), c.acc, [0, .46, -.05], [1, .9, 1.2], [0, 0, PI / 2]); },
    frilly(root, P, c) { const { H } = bipedB(root, P, c, { seed: 50, y: .62, b: [.28, .28, .46], h: [.2, .18, .26], lean: .15, tail: [4, .26, .11], legR: .085 });
      for (const sx of [-1, 1]) mesh(H, G.ico(1, .03, 8), c.acc, [sx * .07, .32, .12], [.03, .12, .2], [0, 0, sx * .25]);
      const f = grp(H, [0, .08, .02]); mesh(f, G.cyl(.36, .36, .03, 10), c.acc, [0, 0, 0], 1, [PI / 2, 0, 0]); for (let i = 0; i < 7; i++) { const a = PI * (i / 6); mesh(f, G.ico(0), c.belly, [Math.cos(a) * .34, Math.sin(a) * .34 - .05, -.02], .04); } P.frill = f; },
    tiny(root, P, c) { bipedB(root, P, c, { seed: 52, y: .36, b: [.16, .16, .26], h: [.13, .12, .16], eye: .075, lean: .15, tail: [4, .16, .07], legR: .045 }); },
    dash(root, P, c) { const { H } = bipedB(root, P, c, { seed: 54, y: .88, b: [.26, .26, .38], h: [.13, .12, .16], snout: 1.2, neck: { n: 3, len: .26, r: .08, tilt: .35 }, legR: .065, tail: [4, .24, .09], lean: .1 });
      mesh(H, G.cone(.06, .18, 5), c.acc, [0, .03, .38], [1, 1, .7], [PI / 2, 0, 0]); },
    thumbs(root, P, c) { bipedB(root, P, c, { seed: 56, y: .85, b: [.42, .44, .62], h: [.22, .2, .3], snout: 1.1, lean: .3, tail: [4, .34, .18], legR: .12, armS: 1.6 });
      P.arms.forEach(a => mesh(a, G.cone(.04, .12, 5), '#fff3d2', [0, -.34, .04], 1, [-.4, 0, 0])); },
    chompy(root, P, c) { const { H } = bipedB(root, P, c, { seed: 58, y: 1.0, b: [.44, .46, .66], h: [.34, .28, .4], lean: .3, tail: [4, .36, .24], legR: .12, eye: .13 });
      for (const sx of [-1, 1]) mesh(H, G.ico(0), c.acc, [sx * .2, .36, .32], [.08, .05, .1]);
      mesh(P.jaw, G.ico(1), '#ff8aa2', [0, .03, .2], [.18, .03, .2]); },
  });
  function buildDino(id, o = {}) {
    const base = DINOS[id]; const sk = (o.skin && SKINS[o.skin]) || {};
    const c0 = sk.col || base.col;
    const c = { c: c0, col: sk.metal ? M(c0, { metalness: .55, roughness: .35 }) : c0, belly: sk.belly || base.belly, acc: sk.accent || base.accent, dark: shade(c0, -.22) };
    const g = new T.Group(); const P = { legs: [], tail: [], wings: [], arms: [], eyes: [] };
    const root = grp(g); P.root = root;
    BUILD[id](root, P, c);
    if (o.woolly) {
      const wc = shade(c0, .65); const bm = P.bodyMesh;
      mesh(P.body, G.ico(1, .16, 21), wc, [bm.position.x, bm.position.y + bm.scale.y * .14, bm.position.z - .02], [bm.scale.x * 1.1, bm.scale.y * .92, bm.scale.z * 1.05]);
      const [hp, pos, s] = P.hat; const hat = grp(hp, pos);
      mesh(hat, G.cone(.2 * s, .3 * s, 7), '#e8554e', [0, .1 * s, 0]);
      mesh(hat, G.cyl(.21 * s, .22 * s, .07 * s, 7), '#ffffff', [0, -.04 * s, 0]);
      mesh(hat, G.ico(1), '#ffffff', [0, .28 * s, 0], .07 * s);
    }
    g.userData = { id, P };
    return g;
  }
  function animDino(d, t, state) {
    const P = d.userData.P;
    let legA = 0, bob = 0, headX = 0, jaw = .04, tailY = Math.sin(t * 2) * .15, tailX = 0, lean = 0, hop = 0, wing = -.25 + Math.sin(t * 2) * .05, shake = 0;
    switch (state) {
      case 'idle': bob = Math.sin(t * 2) * .015; headX = Math.sin(t * .9) * .08; break;
      case 'walk': legA = Math.sin(t * 7) * .45; bob = Math.abs(Math.sin(t * 7)) * .04; tailY = Math.sin(t * 3.5) * .25; wing = Math.sin(t * 5) * .4; break;
      case 'run': legA = Math.sin(t * 15) * .8; bob = Math.abs(Math.sin(t * 15)) * .07; lean = .14; tailY = Math.sin(t * 7) * .3; tailX = .15; jaw = .35; headX = -.15; wing = Math.sin(t * 13) * .75; break;
      case 'hungry': headX = .42 + Math.sin(t * 1.5) * .04; tailX = -.28; jaw = .02; bob = Math.sin(t * 1.2) * .01; wing = -.5; break;
      case 'eat': headX = .55 + Math.abs(Math.sin(t * 8)) * .12; jaw = Math.abs(Math.sin(t * 8)) * .3; tailY = Math.sin(t * 6) * .3; break;
      case 'happy': hop = Math.max(0, Math.sin(t * 7)) * .2; legA = Math.sin(t * 7) * .25; headX = -.25; jaw = .38; tailY = Math.sin(t * 12) * .45; tailX = .2; wing = Math.sin(t * 11) * .8; break;
      case 'roar': headX = -.6; jaw = .8; lean = -.12; tailY = Math.sin(t * 4) * .15; tailX = .25; shake = Math.sin(t * 40) * .025; wing = .6; break;
      case 'held': legA = Math.sin(t * 20) * .5; shake = Math.sin(t * 25) * .05; jaw = .3; headX = -.1; wing = Math.sin(t * 20) * .4; break;
    }
    P.root.position.y = bob + hop; P.root.rotation.z = shake;
    if (P.quad) { P.legs[0].rotation.x = legA; P.legs[1].rotation.x = -legA; P.legs[2].rotation.x = -legA; P.legs[3].rotation.x = legA; }
    else if (P.legs.length) { P.legs[0].rotation.x = legA; P.legs[1].rotation.x = -legA; }
    P.head.rotation.x = (P.headBase = P.headBase ?? P.head.rotation.x) + headX;
    if (P.jaw) P.jaw.rotation.x = jaw;
    P.tail.forEach((p, i) => { p.rotation.y = tailY * (i + 1) * .45; if (i > 0 || !p.userData.bx) { p.userData.bx = p.userData.bx ?? p.rotation.x; } p.rotation.x = p.userData.bx + tailX * (i === 0 ? 1 : .35); });
    P.body.rotation.x = (P.lean || 0) + lean;
    if (P.wings.length) { P.wings[0].rotation.z = -wing; P.wings[1].rotation.z = wing; P.wings.forEach(w => { w.userData.outer.rotation.z = (w === P.wings[0] ? -1 : 1) * wing * .5; }); }
    if (P.frill) P.frill.scale.setScalar(state === 'run' || state === 'happy' || state === 'roar' ? 1 : .45);
    if (P.brows) P.brows.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * (state === 'hungry' ? -.45 : .35); });
    const blink = (t % 3.7) < .12 ? .15 : 1; P.eyes.forEach(e => { e.scale.y = blink; });
  }

  // ---------------- pieces & props
  function buildEgg(id) {
    const col = DINOS[id] ? DINOS[id].col : '#9bcf55';
    const g = new T.Group(); const inner = grp(g, [0, .26, 0]);
    const top = grp(inner); const bot = grp(inner);
    mesh(top, G.half(true, 8), '#fff4dc', [0, 0, 0], [.26, .36, .26]);
    mesh(bot, G.half(false, 8), '#fff4dc', [0, 0, 0], [.26, .26, .26]);
    [[.2, .18, .08], [-.12, .25, .13], [.05, .08, -.23], [-.2, .05, -.1]].forEach(([x, y, z]) => mesh(top, G.ico(0), col, [x, y, z], .065));
    [[.18, -.1, .12], [-.17, -.12, -.1]].forEach(([x, y, z]) => mesh(bot, G.ico(0), col, [x, y, z], .06));
    return { g, inner, top, bot };
  }
  function buildNet(handle) {
    const g = new T.Group();
    // ARCADE: no translucent dome skin — just the net itself (Dan)
    mesh(g, G.torus(.62, .06, 4, 12), '#ff8a3d', [0, 0, 0], 1, [PI / 2, 0, 0]);
    mesh(g, G.torus(.53, .025, 3, 12), '#f3e2bd', [0, .25, 0], 1, [PI / 2, 0, 0]);
    mesh(g, G.torus(.32, .025, 3, 10), '#f3e2bd', [0, .42, 0], 1, [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) mesh(g, G.torus(.5, .022, 3, 10, PI), '#f3e2bd', [0, 0, 0], [1.24, 1, 1.24], [0, i * PI / 4, 0]);
    if (handle) mesh(g, G.cyl(.05, .05, 1.1, 6), '#a0673f', [.9, -.35, 0], 1, [0, 0, 1.1]);
    return g;
  }
  function buildTree(th, s = 1) {
    const g = new T.Group(); const k = th.kind;
    if (k === 'palm') {
      let y = 0; for (let i = 0; i < 4; i++) { mesh(g, G.cyl(.07, .09, .28, 5), th.trunk, [i * .03, y + .14, 0], 1, [0, 0, -.08]); y += .26; }
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; const l = grp(g, [.12, y, 0], [0, a, 0]); mesh(l, G.box(.14, .03, .62), th.tree[i % 2], [0, -.08, .3], 1, [.35, 0, 0]); }
      mesh(g, G.ico(0), '#8a5a3b', [.18, y - .08, .06], .07); mesh(g, G.ico(0), '#8a5a3b', [.08, y - .1, -.07], .07);
    } else if (k === 'cactus') {
      mesh(g, G.cyl(.13, .15, .85, 7), th.tree[0], [0, .42, 0]); mesh(g, G.ico(1), th.tree[0], [0, .85, 0], [.13, .1, .13]);
      for (const [sx, y, h] of [[-1, .45, .28], [1, .6, .22]]) { mesh(g, G.cyl(.07, .07, .18, 6), th.tree[1], [sx * .17, y, 0], 1, [0, 0, PI / 2]); mesh(g, G.cyl(.07, .07, h, 6), th.tree[1], [sx * .26, y + h / 2, 0]); mesh(g, G.ico(1), th.tree[1], [sx * .26, y + h, 0], .07); }
      mesh(g, G.ico(0), '#ff8fb1', [0, .96, 0], .07);
    } else if (k === 'pine') {
      mesh(g, G.cyl(.07, .09, .25, 5), th.trunk, [0, .12, 0]);
      [[.46, .5, .45], [.36, .44, .78], [.25, .38, 1.06]].forEach(([r, h, y], i) => { mesh(g, G.cone(r, h, 7), th.tree[i % 2], [0, y, 0]); mesh(g, G.cone(r * .55, h * .4, 7), '#ffffff', [0, y + h * .32, 0]); });
    } else {
      mesh(g, G.cyl(.07, .1, .55, 5), th.trunk, [0, .27, 0]);
      mesh(g, G.ico(1, .08, Math.floor(s * 7)), th.tree[0], [0, .85, 0], .42);
      mesh(g, G.ico(1, .06, 3), th.tree[1], [.2, .62, .12], .24);
    }
    g.scale.setScalar(s); return g;
  }
  function buildFlowers(par, n, spread) {
    const cols = ['#ff8fb1', '#ffd54a', '#ffffff', '#b58cf0', '#ff7a5c'];
    for (let i = 0; i < n; i++) { const x = rr(-spread, spread), z = rr(-spread, spread); mesh(par, G.cyl(.015, .015, .14, 3), '#4f9a3f', [x, .07, z]); mesh(par, G.ico(0), cols[i % 5], [x, .16, z], .06); }
  }
  function stall(g, body, sA, sB) {
    mesh(g, G.box(1.6, .62, 1.0), body, [0, .31, 0]);
    mesh(g, G.box(1.7, .07, 1.1), '#ffffff', [0, .65, .02]);
    mesh(g, G.box(1.6, .95, .12), shade(body, -.08), [0, .95, -.44]);
    for (const sx of [-1, 1]) mesh(g, G.cyl(.04, .04, .95, 5), '#ffffff', [sx * .76, 1.1, .46]);
    for (let i = 0; i < 6; i++) mesh(g, G.box(.28, .06, .8), i % 2 ? sB : sA, [-.7 + i * .28, 1.46, .08], 1, [.3, 0, 0]);
    for (let i = 0; i < 6; i++) mesh(g, G.half(false, 6), i % 2 ? sB : sA, [-.7 + i * .28, 1.33, .5], [.14, .12, .06]);
    for (let i = 0; i < 3; i++) mesh(g, G.box(.34, .4, .02), i % 2 ? '#ffffff' : sA, [-.5 + i * .5, .34, .51]);
  }
  function buildPiece(type, o = {}) {
    const th = PARKS[o.theme || 'jungle']; const g = new T.Group(); g.userData.type = type;
    if (/^pen/.test(type)) {
      const w = o.w || (type === 'pen_s' ? 3 : 4), d = o.d || 3; const st = PEN_STYLES[o.style || 'log'];
      const big = w * d >= 16, fh = big ? 1.55 : 1;
      const gm = mesh(g, G.box(w - .1, .06, d - .1), th.pen, [0, .03, 0]); gm.castShadow = false;
      const hw = w / 2 - .12, hd = d / 2 - .12;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      const postGeo = st.chunky ? G.box(.17, .62 * fh, .17) : G.cyl(.07, .08, .6 * fh, 6);
      const capM = st.glow ? M(st.cap, { emissive: st.cap, emissiveIntensity: .8 }) : st.cap;
      const railM = st.glow || st.post === '#aee0f5' ? M(st.rail, { roughness: .4 }) : st.rail;
      for (let e = 0; e < 4; e++) {
        const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
        const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / .8);
        for (let i = 0; i <= n; i++) {
          const t0 = i / n, x = lerp(ax, bx, t0), z = lerp(az, bz, t0);
          const gate = e === 2 && Math.abs(t0 - .5) * len < .5;
          if (i < n) {
            const t1 = (i + 1) / n, mid = (t0 + t1) / 2;
            if (!(e === 2 && Math.abs(mid - .5) * len < .5)) {
              const mx = lerp(ax, bx, mid), mz = lerp(az, bz, mid), ang = Math.atan2(bz - az, bx - ax);
              for (const y of st.chunky ? [.3 * fh] : big ? [.25, .55, .85] : [.22, .44]) mesh(g, G.box(len / n + .02, st.chunky ? .34 * fh : .07, st.chunky ? .12 : .05), railM, [mx, y, mz], 1, [0, -ang, 0]);
            }
          }
          if (!gate) { mesh(g, postGeo, st.post, [x, .3 * fh, z]); mesh(g, G.ico(0), capM, [x, .64 * fh, z], .09); }
        }
      }
      if (big) {
        for (const sx of [-1, 1]) { mesh(g, G.box(.26, 1.9, .26), st.post, [sx * .6, .95, hd]); mesh(g, G.box(.34, .12, .34), capM, [sx * .6, 1.92, hd]); }
        mesh(g, G.box(1.5, .3, .16), '#3b2f2a', [0, 1.75, hd]); mesh(g, G.box(1.3, .2, .05), '#ffc93c', [0, 1.75, hd + .09]);
        for (const [cx, cz] of corners) { mesh(g, G.cyl(.05, .06, 1.9, 5), '#6e6a64', [cx, .95, cz]); mesh(g, G.ico(1), M('#fff1a8', { emissive: '#ffd96b', emissiveIntensity: .7 }), [cx, 1.95, cz], .12); }
      } else for (const sx of [-1, 1]) { mesh(g, G.cyl(.09, .1, .9, 6), st.post, [sx * .55, .45, hd]); mesh(g, G.ico(1), capM, [sx * .55, .95, hd], .12); }
      if (o.lagoon) {
        const wm = mesh(g, G.box(w - .5, .08, d - .9), M(th.water, { roughness: .15, emissive: th.water, emissiveIntensity: .1 }), [0, .06, -.2]); wm.castShadow = false;
        mesh(g, G.ico(1, .08, 9), '#f3dca6', [-w / 2 + 1.2, .05, -d / 2 + 1], [.8, .18, .6]); mesh(g, G.dode(.1, 4), th.rock, [w / 2 - 1, .2, -d / 2 + .8], [.4, .3, .35]);
      } else {
        mesh(g, G.box(.7, .1, .35), '#8a5a3b', [-hw + .55, .1, -hd + .4]);
        mesh(g, G.box(.6, .06, .28), '#7cc85a', [-hw + .55, .17, -hd + .4]);
        mesh(g, G.dode(.1, 3), th.rock, [hw - .5, .15, -hd + .45], [.3, .22, .26]);
        mesh(g, G.ico(1, .06, 5), th.tree[1], [hw - .35, .15, hd - .5], .2);
        if (big) {
          mesh(g, G.cyl(.7, .75, .06, 9), M(th.water, { roughness: .2 }), [hw - 1.1, .07, -hd + 1.1]).castShadow = false;
          const t1 = buildTree(th, 1.15); t1.position.set(-hw + .7, 0, hd - .9); g.add(t1); const t2 = buildTree(th, .9); t2.position.set(w * .12, 0, -hd + .6); g.add(t2);
          mesh(g, G.dode(.12, 6), th.rock2, [-w * .1, .2, hd * .2], [.45, .3, .4]);
        }
      }
      if (o.dome) {
        const ico = new T.IcosahedronGeometry(1, 1); const eg = new T.EdgesGeometry(ico); const pa = eg.attributes.position; const bm = M('#e8eef2', { metalness: .3, roughness: .5 });
        const rx = w / 2 - .15, rz = d / 2 - .15, ry = Math.min(w, d) * .6, up = new T.Vector3(0, 1, 0);
        for (let i = 0; i < pa.count; i += 2) {
          const a = new T.Vector3(pa.getX(i) * rx, pa.getY(i) * ry, pa.getZ(i) * rz), b = new T.Vector3(pa.getX(i + 1) * rx, pa.getY(i + 1) * ry, pa.getZ(i + 1) * rz);
          if (a.y < -.01 || b.y < -.01) continue;
          const dir = b.clone().sub(a); const L = dir.length(); const m = new T.Mesh(G.cyl(.035, .035, 1, 4), bm); m.scale.set(1, L, 1); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(up, dir.normalize()); m.castShadow = true; g.add(m);
        }
        ico.dispose(); eg.dispose();
      }
      g.userData.w = w; g.userData.d = d;
    } else if (type === 'vc') {
      mesh(g, G.box(3.7, .9, 2.5), '#f4efe6', [0, .45, 0]);
      mesh(g, G.box(3.72, .34, 2.52), M('#7fd0e8', { roughness: .2, emissive: '#2a7f99', emissiveIntensity: .15 }), [0, .72, 0]);
      mesh(g, G.box(3.95, .12, 2.75), '#58b84f', [0, .98, 0]);
      mesh(g, G.half(true, 10), M('#bfe8f5', { roughness: .2 }), [0, 1.02, -.15], [1.15, 1, 1.05]);
      mesh(g, G.ico(1), '#ffc93c', [0, 2.08, -.15], .15);
      mesh(g, G.box(2.3, .5, .12), '#fff6e3', [0, 1.3, 1.25]);
      const sgn = new T.Mesh(new T.PlaneGeometry(2.1, .38), new T.MeshBasicMaterial({ map: signTex() })); sgn.position.set(0, 1.3, 1.32); g.add(sgn);
      mesh(g, G.box(1, .6, .05), '#2b5f86', [0, .3, 1.27]); mesh(g, G.box(1.4, .08, .35), '#e9e1d2', [0, .04, 1.4]);
      [[-1.75, '#ff6b5b'], [1.75, '#4bb4e6']].forEach(([x, c]) => { mesh(g, G.cyl(.03, .03, 2.1, 4), '#ffffff', [x, 1.05, 1.2]); mesh(g, G.box(.4, .24, .02), c, [x + .2, 1.95, 1.2]); });
    } else if (type === 'lookout') {
      for (const [x, z] of [[-.3, -.3], [.3, -.3], [.3, .3], [-.3, .3]]) mesh(g, G.cyl(.04, .05, 1.6, 5), '#9b6440', [x, .8, z]);
      mesh(g, G.box(.85, .08, .85), '#c98a55', [0, 1.6, 0]);
      for (const [x, z, a] of [[0, -.4, 0], [0, .4, 0], [-.4, 0, PI / 2], [.4, 0, PI / 2]]) mesh(g, G.box(.82, .06, .04), '#c98a55', [x, 1.85, z], 1, [0, a, 0]);
      for (const [x, z] of [[-.38, -.38], [.38, -.38], [.38, .38], [-.38, .38]]) mesh(g, G.cyl(.025, .025, .7, 4), '#9b6440', [x, 1.95, z]);
      mesh(g, G.cone(.62, .42, 4), '#58b84f', [0, 2.48, 0], 1, [0, PI / 4, 0]);
      mesh(g, G.ico(1), '#ff6b5b', [.15, 1.78, .1], .08);
    } else if (type === 'icecream') {
      stall(g, '#ffe7ef', '#ff8fb1', '#ffffff');
      mesh(g, G.cone(.2, .5, 7), '#e7b169', [0, 1.78, .05], 1, [PI, 0, 0]);
      mesh(g, G.ico(1), '#ff8fb1', [0, 2.08, .05], .22); mesh(g, G.ico(1), '#9be3c3', [.04, 2.3, .05], .17); mesh(g, G.ico(0), '#e8454e', [.04, 2.47, .05], .05);
    } else if (type === 'burger') {
      stall(g, '#fff0c9', '#ff6b5b', '#ffffff');
      const y = 1.66;
      mesh(g, G.cyl(.32, .28, .1, 9), '#e8a04e', [0, y, .05]); mesh(g, G.cyl(.36, .36, .03, 9), '#7cc85a', [0, y + .07, .05]);
      mesh(g, G.cyl(.34, .34, .09, 9), '#7a4a2e', [0, y + .13, .05]); mesh(g, G.box(.5, .03, .5), '#ffd54a', [0, y + .19, .05], 1, [0, .78, 0]);
      mesh(g, G.half(true, 9), '#f0ab55', [0, y + .2, .05], [.34, .24, .34]);
    } else if (type === 'toilet') {
      mesh(g, G.box(1.8, .9, .8), '#a9d9f2', [0, .45, 0]);
      mesh(g, G.cyl(.55, .55, 2.0, 3), '#5bb85f', [0, 1.16, 0], 1, [-PI / 2, 0, PI / 2]);
      mesh(g, G.box(.5, .68, .05), '#4b8fe0', [-.45, .36, .41]); mesh(g, G.box(.5, .68, .05), '#ff8fb1', [.45, .36, .41]);
      for (const sx of [-1, 1]) mesh(g, G.cyl(.09, .09, .03, 8), '#ffffff', [sx * .45, .56, .44], 1, [PI / 2, 0, 0]);
    } else if (type === 'fountain') {
      mesh(g, G.cyl(.95, 1, .32, 8), '#cfc7b8', [0, .16, 0]);
      mesh(g, G.cyl(.84, .84, .06, 8), M(th.water, { roughness: .25 }), [0, .3, 0]);
      mesh(g, G.cyl(.14, .2, .62, 6), '#cfc7b8', [0, .55, 0]);
      mesh(g, G.cyl(.38, .18, .14, 8), '#cfc7b8', [0, .9, 0]);
      mesh(g, G.cyl(.32, .32, .04, 8), M(th.water, { roughness: .25 }), [0, .97, 0]);
      mesh(g, G.ico(1), M(th.water, { roughness: .25 }), [0, 1.12, 0], .1);
      g.userData.drops = [];
      for (let i = 0; i < 8; i++) { const m = mesh(g, G.ico(0), M('#dff6ff', { roughness: .2 }), [0, 1, 0], .055); m.castShadow = false; g.userData.drops.push({ m, a: i / 8 * PI * 2, o: i / 8 }); }
    } else if (type === 'tree') {
      g.add(buildTree(th, 1)); buildFlowers(g, 4, .38);
    } else if (type === 'bin') {
      mesh(g, G.cyl(.16, .13, .38, 7), '#4caf50', [0, .19, 0]);
      const lid = grp(g, [0, .41, 0]); mesh(lid, G.cyl(.19, .19, .05, 7), '#2f7d3b'); mesh(lid, G.box(.12, .04, .04), '#2f7d3b', [0, .04, 0]);
      const junk = grp(g, [0, .44, 0]); mesh(junk, G.ico(0), '#ffffff', [.05, 0, 0], .08); mesh(junk, G.cyl(.04, .04, .1, 6), '#ff6b5b', [-.06, .02, .03], 1, [0, 0, 1.2]);
      junk.visible = !!o.full; if (o.full) { lid.rotation.z = .6; lid.position.x = .1; }
      g.userData.lid = lid; g.userData.junk = junk;
    } else if (type === 'balloons') {  // ARCADE: shop treat — a balloon cart
      mesh(g, G.box(.62, .34, .44), '#c98a55', [0, .3, 0]); mesh(g, G.box(.68, .06, .5), '#ff6b5b', [0, .5, 0]);
      for (const sx of [-1, 1]) mesh(g, G.cyl(.1, .1, .06, 8), '#3b2f2a', [sx * .24, .1, .24], 1, [0, 0, PI / 2]);
      ['#ff6b5b', '#4bb4e6', '#ffc93c', '#8b72d8', '#58b84f'].forEach((c, i) => { const a = i / 5 * PI * 2, x = Math.cos(a) * .22, z = Math.sin(a) * .16, y = 1.35 + (i % 2) * .22; mesh(g, G.cyl(.008, .008, y - .5, 3), '#ffffff', [x / 2, (y + .5) / 2, z / 2]); mesh(g, G.ico(1), c, [x, y, z], [.17, .2, .17]); });
    } else if (type === 'statue') {  // ARCADE: shop treat — a golden Rexy on a plinth
      mesh(g, G.cyl(.9, 1, .3, 8), '#cfc7b8', [0, .15, 0]); mesh(g, G.cyl(.72, .8, .3, 8), '#e9e1d2', [0, .45, 0]);
      const r = buildDino('rexy', { skin: 'gold' }); animDino(r, .3, 'roar'); r.scale.setScalar(.95); r.position.y = .6; g.add(r);
      buildFlowers(g, 5, .95);
    } else if (type === 'gate') {
      for (const sx of [-1, 1]) { mesh(g, G.cyl(.26, .3, 1.9, 6), '#c98a55', [sx * 1.3, .95, 0]); mesh(g, G.ico(1, .06, 4), '#58b84f', [sx * 1.3, 2.05, 0], .38); }
      mesh(g, G.box(2.9, .5, .28), '#a0673f', [0, 1.75, 0]);
      const sm = new T.MeshBasicMaterial({ map: signTex() });
      const s = new T.Mesh(new T.PlaneGeometry(2.4, .42), sm); s.position.set(0, 1.75, .15); g.add(s);
      mesh(g, G.ico(1, .06, 6), '#6cc05a', [0, 2.12, 0], [.4, .22, .25]);
    }
    return g;
  }
  let _sign;
  function signTex() {
    if (_sign) return _sign;
    const c = document.createElement('canvas'); c.width = 512; c.height = 90; const x = c.getContext('2d');
    x.fillStyle = '#fff6e3'; x.beginPath(); x.roundRect(4, 4, 504, 82, 30); x.fill();
    x.fillStyle = '#2f7d3b'; x.font = '700 60px Fredoka, "Arial Rounded MT Bold", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('DINO PARK', 256, 48);
    _sign = new T.CanvasTexture(c); _sign.colorSpace = T.SRGBColorSpace; return _sign;
  }
  function buildFood(kind) {
    const g = new T.Group();
    if (kind === 'meat') { mesh(g, G.ico(1, .06, 3), '#c96a3f', [0, .2, 0], [.26, .2, .2], [0, 0, .3]); mesh(g, G.cyl(.05, .05, .3, 6), '#fff3dc', [.26, .1, 0], 1, [0, 0, 1.2]); mesh(g, G.ico(1), '#fff3dc', [.4, .04, 0], .08); mesh(g, G.ico(1), '#fff3dc', [.38, .08, .06], .07); }
    else if (kind === 'fish') { mesh(g, G.ico(1, .04, 2), '#7fb8e6', [0, .15, 0], [.3, .14, .1]); mesh(g, G.cone(.14, .18, 4), '#5a9fd6', [-.34, .15, 0], [1, 1, .4], [0, 0, PI / 2]); mesh(g, G.ico(0), '#2b2320', [.18, .19, .08], .03); }
    else { for (let i = 0; i < 3; i++) { const l = grp(g, [0, .06, 0], [0, i * 2.1, 0]); mesh(l, G.ico(1, .05, 7 + i), i === 1 ? '#7cc85a' : '#5bb350', [0, .1, .16], [.12, .05, .24], [.4, 0, 0]); } mesh(g, G.cyl(.02, .03, .2, 4), '#4f8a3a', [0, .1, 0]); }
    return g;
  }
  function buildJeep(i) {
    const g = new T.Group(); const body = ['#e0b95c', '#d9a24a'][i % 2];
    mesh(g, G.box(.62, .32, 1.05), body, [0, .36, 0]); mesh(g, G.box(.64, .08, 1.07), '#3f8f45', [0, .42, 0]);
    mesh(g, G.box(.58, .2, .32), shade(body, -.08), [0, .6, .32]);
    for (const [x, z] of [[-.28, -.4], [.28, -.4], [.28, .1], [-.28, .1]]) mesh(g, G.cyl(.02, .02, .45, 4), '#3b2f2a', [x, .75, z]);
    mesh(g, G.box(.64, .05, .62), '#3f8f45', [0, .98, -.15]);
    for (const [x, z] of [[-.33, -.34], [.33, -.34], [-.33, .34], [.33, .34]]) mesh(g, G.cyl(.15, .15, .12, 8), '#3b2f2a', [x, .15, z], 1, [0, 0, PI / 2]);
    const skins = ['#f7d2b0', '#b9805a', '#e7b48a']; [[-.14, -.2], [.14, -.2], [0, .1]].forEach(([x, z], k) => mesh(g, G.ico(1), skins[(k + i) % 3], [x, .74, z], .1));
    const lm = M('#fff1a8', { emissive: '#ffd96b', emissiveIntensity: .6 }); mesh(g, G.ico(0), lm, [-.2, .42, .53], .05); mesh(g, G.ico(0), lm, [.2, .42, .53], .05);
    return g;
  }
  function buildTrain(front) {
    const g = new T.Group();
    mesh(g, G.box(.62, .5, 1.3), '#ffffff', [0, .25, 0]); mesh(g, G.box(.64, .2, 1.1), '#2b5f86', [0, .36, 0]); mesh(g, G.box(.64, .08, 1.32), '#58b84f', [0, .05, 0]);
    if (front) { mesh(g, G.half(true, 8), '#ffffff', [0, .12, .65], [.31, .3, .35], [PI / 2, 0, 0]); mesh(g, G.box(.3, .12, .05), '#ffc93c', [0, .15, .98]); }
    return g;
  }
  function buildBall() { const g = new T.Group(); mesh(g, G.half(true, 8), '#ff6b5b', [0, .2, 0], .2); mesh(g, G.half(false, 8), '#ffffff', [0, .2, 0], .2); mesh(g, G.torus(.2, .03, 3, 10), '#ffc93c', [0, .2, 0], 1, [PI / 2, 0, 0]); return g; }
  function buildVisitor(i) {
    const shirts = ['#ff6b5b', '#4bb4e6', '#ffc93c', '#b58cf0', '#58b84f', '#ff8fb1', '#ff9d3c'];
    const skins = ['#f7d2b0', '#e7b48a', '#b9805a', '#8a5a3b', '#f1c9a0'];
    const hairs = ['#3b2f2a', '#7a4b2e', '#e8b64a', '#1f1a18', '#b5552f'];
    const g = new T.Group(); const P = {};
    P.legs = [-1, 1].map(sx => { const l = grp(g, [sx * .07, .26, 0]); mesh(l, G.cyl(.05, .045, .26, 5), '#3f4f7a', [0, -.13, 0]); return l; });
    const sc = shirts[i % shirts.length];
    mesh(g, G.cyl(.13, .16, .32, 6), sc, [0, .42, 0]);
    P.arms = [-1, 1].map(sx => { const a = grp(g, [sx * .17, .54, 0]); mesh(a, G.cyl(.04, .035, .24, 5), sc, [0, -.12, 0]); return a; });
    const head = grp(g, [0, .72, 0]); P.head = head;
    mesh(head, G.ico(1), skins[i % skins.length], [0, 0, 0], .15);
    mesh(head, G.ico(1), hairs[(i * 3) % hairs.length], [0, .06, -.03], [.16, .11, .15]);
    if (i % 3 === 0) { mesh(head, G.cyl(.1, .15, .08, 7), shirts[(i + 3) % shirts.length], [0, .13, 0]); }
    if (i % 4 === 1) { const b = grp(g, [.22, .5, 0]); mesh(b, G.cyl(.006, .006, .7, 3), '#ffffff', [0, .35, 0]); mesh(b, G.ico(1), shirts[(i + 2) % shirts.length], [0, .8, 0], [.14, .17, .14]); }
    g.userData.P = P; return g;
  }

  // ---------------- icon renderer (one shared WebGL context)
  const Icons = { r: null, cache: new Map(), q: [], busy: false };
  function iconSetup() {
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.outputColorSpace = T.SRGBColorSpace;
    const s = new T.Scene();
    s.add(new T.HemisphereLight('#fff8ee', '#8a7a66', 1.3));
    const d = new T.DirectionalLight('#fff1dc', 2.0); d.position.set(3, 6, 5); s.add(d);
    const f = new T.DirectionalLight('#cfe6ff', .6); f.position.set(-5, 2, -2); s.add(f);
    Icons.r = r; Icons.s = s; Icons.cam = new T.PerspectiveCamera(24, 1, .05, 100);
    Icons.sil = new T.MeshBasicMaterial({ color: '#3d4f44' });
  }
  function iconObject(type, name, q) {
    const pose = q.get('pose') || 'idle';
    if (type === 'dino') {
      const d = buildDino(name, { woolly: q.has('woolly'), skin: q.get('skin') });
      const st = { idle: 'idle', happy: 'happy', hungry: 'hungry', escaped: 'run', roar: 'roar' }[pose] || 'idle';
      animDino(d, parseFloat(q.get('t') || ({ happy: .22, escaped: .1, roar: .3 }[pose] || 0)), st);
      if (pose === 'happy') d.userData.P.root.position.y = 0;
      if (q.get('stand')) { const g = new T.Group(); g.add(d); mesh(g, G.cyl(1.1, 1.2, .16, 8), q.get('stand'), [0, -.08, 0]); if (q.get('skin') === 'gold') { d.position.y = .2; mesh(g, G.cyl(.9, 1, .3, 8), '#cfc7b8', [0, .07, 0]); } return g; }
      return d;
    }
    if (type === 'piece') return buildPiece(name, { theme: q.get('theme') || 'jungle', style: q.get('style'), full: q.has('full') });
    if (type === 'food') return buildFood(name);
    if (type === 'item') {
      const g = new T.Group();
      if (name === 'egg') { g.add(buildEgg(q.get('dino') || 'stompy').g); }
      else if (name === 'goldegg') { const e = buildEgg('stompy'); e.g.traverse(m => { if (m.isMesh) m.material = M('#f2c23b', { metalness: .5, roughness: .35 }); }); e.g.position.y = .22; g.add(e.g); mesh(g, G.cyl(.34, .4, .22, 8), '#58b84f', [0, .11, 0]); }
      else if (name === 'net') g.add(buildNet(true));
      else if (name === 'coin') { mesh(g, G.cyl(.5, .5, .14, 12), M('#ffc93c', { metalness: .3, roughness: .45 }), [0, 0, 0], 1, [PI / 2, 0, 0]); mesh(g, G.cyl(.36, .36, .16, 12), M('#ffdb6e', { metalness: .3, roughness: .45 }), [0, 0, 0], 1, [PI / 2, 0, 0]); }
      else if (name === 'star') {
        const s = new T.Shape(); for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, r0 = i % 2 ? .44 : 1; const x = Math.cos(a) * r0, y = Math.sin(a) * r0; i ? s.lineTo(x, y) : s.moveTo(x, y); }
        const geo = cg('star', () => { const e = new T.ExtrudeGeometry(s, { depth: .22, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 1 }); e.center(); return facet(e); });
        mesh(g, geo, M('#ffc93c', { metalness: .2, roughness: .5 }));
      }
      else if (name === 'smiley' || name === 'visitor') {
        const mood = q.get('mood') || 'happy'; const fc = { happy: '#ffd54a', okay: '#f2dda4', sad: '#9cc7e8' }[mood];
        let head = g;
        if (name === 'visitor') { const v = buildVisitor(+(q.get('i') || 1)); g.add(v); head = v.userData.P.head; head.scale.setScalar(1.7); head.position.y = .8; }
        else mesh(g, G.ico(1), fc, [0, 0, 0], .5);
        const k = name === 'visitor' ? .31 : 1, zf = name === 'visitor' ? 1.08 : 1;
        for (const sx of [-1, 1]) mesh(head, G.ico(0), '#3b2f2a', [sx * .17 * k, .1 * k, .45 * k * zf], .075 * k);
        if (mood === 'okay') mesh(head, G.box(.26 * k, .05 * k, .05 * k), '#3b2f2a', [0, -.14 * k, .47 * k * zf]);
        else mesh(head, G.torus(.16 * k, .04 * k, 3, 8, PI), '#3b2f2a', [0, (mood === 'happy' ? -.08 : -.24) * k, .45 * k * zf], 1, [0, 0, mood === 'happy' ? PI : 0]);
        if (name === 'visitor') { head.rotation.y = 0; }
      }
      else if (name === 'clock') { mesh(g, G.cyl(.5, .5, .14, 12), '#4bb4e6', [0, 0, 0], 1, [PI / 2, 0, 0]); mesh(g, G.cyl(.4, .4, .16, 12), '#ffffff', [0, 0, 0], 1, [PI / 2, 0, 0]); mesh(g, G.box(.06, .3, .04), '#3b2f2a', [0, .12, .1]); mesh(g, G.box(.22, .06, .04), '#3b2f2a', [.09, 0, .1]); mesh(g, G.ico(1), '#ffc93c', [0, .6, 0], .1); }
      else if (name === 'bin-full') g.add(buildPiece('bin', { full: true }));
      else if (name === 'jar') {
        mesh(g, G.cyl(.42, .42, .9, 9), new T.MeshStandardMaterial({ color: '#d8f0f7', transparent: true, opacity: .45, roughness: .15, flatShading: true, depthWrite: false }), [0, .45, 0]);
        for (let i = 0; i < 5; i++) mesh(g, G.cyl(.3, .3, .08, 10), M('#ffc93c', { metalness: .3, roughness: .45 }), [(i % 2) * .05, .06 + i * .09, 0], 1, [.1 * (i % 3), 0, 0]);
        mesh(g, G.cyl(.46, .46, .12, 9), '#ff6b5b', [0, .94, 0]);
      }
      else if (name === 'balloons') { const c = ['#ff6b5b', '#4bb4e6', '#ffc93c']; c.forEach((cc, i) => { const x = (i - 1) * .32; mesh(g, G.cyl(.01, .01, .9, 3), '#ffffff', [x * .4, .45, 0], 1, [0, 0, -x * .4]); mesh(g, G.ico(1), cc, [x, 1.0 + (i % 2) * .15, 0], [.24, .28, .24]); }); mesh(g, G.box(.5, .25, .35), '#c98a55', [0, .12, 0]); }
      else if (name === 'arch') { mesh(g, G.torus(.7, .09, 5, 10, PI), '#58b84f', [0, .1, 0]); const c = ['#ff8fb1', '#ffd54a', '#ffffff', '#b58cf0']; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI; mesh(g, G.ico(0), c[i % 4], [Math.cos(a) * .7, .1 + Math.sin(a) * .7, .08], .1); } }
      else if (name === 'fireworks') { const c = ['#ff6b5b', '#ffc93c', '#4bb4e6']; c.forEach((cc, j) => { const cx = (j - 1) * .7, cy = .6 + (j % 2) * .45; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; mesh(g, G.ico(0), cc, [cx + Math.cos(a) * .3, cy + Math.sin(a) * .3, 0], .07); } mesh(g, G.ico(1), '#ffffff', [cx, cy, 0], .07); }); }
      else if (name === 'ball') g.add(buildBall());
      else if (name === 'lock') { mesh(g, G.box(.8, .6, .3), '#b8a78f', [0, 0, 0]); mesh(g, G.torus(.26, .07, 4, 8, PI), '#8f8069', [0, .3, 0]); mesh(g, G.ico(0), '#6b5d4c', [0, 0, .16], .08); }
      return g;
    }
    if (type === 'land') {
      const th = PARKS[name]; const g = new T.Group();
      mesh(g, G.cyl(1.3, 1.05, .5, 7), shade(th.edge, -.1), [0, -.25, 0]);
      const top = mesh(g, G.cyl(1.3, 1.3, .12, 7), th.ground, [0, .03, 0]);
      if (name === 'jungle') { mesh(g, G.dode(.12, 2), th.rock, [-.35, .5, -.45], [.65, .6, .45]); mesh(g, G.box(.3, .9, .08), M(th.water, { emissive: th.water, emissiveIntensity: .25 }), [-.3, .45, -.02]); mesh(g, G.cyl(.4, .4, .05, 8), M(th.water), [-.25, .1, .25]); const t1 = buildTree(th, .95); t1.position.set(.55, 0, .1); g.add(t1); const t2 = buildTree(th, .7); t2.position.set(.3, 0, .6); g.add(t2); }
      if (name === 'volcano') { const v = mesh(g, cg('volc-s', () => facet(new T.ConeGeometry(.9, 1.2, 8, 2), .06, 3)), th.rock, [-.1, .66, -.2]); mesh(g, G.cyl(.25, .3, .08, 8), M(th.lava, { emissive: th.lava, emissiveIntensity: .9 }), [-.1, 1.22, -.2]); mesh(g, G.ico(1, .1, 3), '#efe9e4', [-.05, 1.55, -.2], .22); mesh(g, G.ico(1, .1, 4), '#efe9e4', [.12, 1.8, -.25], .17); const t1 = buildTree(th, .8); t1.position.set(.75, 0, .4); g.add(t1); }
      if (name === 'snowy') { mesh(g, cg('mtn-s', () => facet(new T.ConeGeometry(.8, 1.4, 7, 2), .05, 5)), th.rock, [-.3, .75, -.25]); mesh(g, G.cone(.36, .45, 7), '#ffffff', [-.3, 1.26, -.25]); mesh(g, G.cone(.55, .9, 7), th.rock2, [.45, .5, -.35]); mesh(g, G.cone(.25, .3, 7), '#ffffff', [.45, .84, -.35]); const t1 = buildTree(th, .7); t1.position.set(.55, 0, .45); g.add(t1); }
      if (name === 'desert') { mesh(g, cg('mesa-s', () => facet(new T.CylinderGeometry(.55, .7, .8, 7), .05, 4)), th.rock, [-.35, .46, -.3]); mesh(g, G.cyl(.56, .56, .08, 7), shade(th.rock, .15), [-.35, .88, -.3]); mesh(g, cg('mesa-s2', () => facet(new T.CylinderGeometry(.3, .4, .5, 6), .04, 5)), th.rock2, [.35, .3, -.45]); const t1 = buildTree(th, 1); t1.position.set(.5, 0, .35); g.add(t1); }
      if (name === 'beach') { mesh(g, G.cyl(.7, .75, .06, 9), M(th.water, { roughness: .2 }), [-.35, .09, -.3]); const lh = grp(g, [.5, 0, -.4]); for (let i = 0; i < 4; i++) mesh(lh, G.cyl(.16 - i * .02, .18 - i * .02, .25, 8), i % 2 ? '#ffffff' : '#ff6b5b', [0, .12 + i * .25, 0]); mesh(lh, G.cone(.16, .2, 8), '#3b2f2a', [0, 1.1, 0]); mesh(lh, G.ico(1), M('#ffe27a', { emissive: '#ffe27a', emissiveIntensity: .6 }), [0, .98, 0], .09); const t1 = buildTree(th, .8); t1.position.set(-.1, 0, .45); g.add(t1); }
      return g;
    }
    return new T.Group();
  }
  const VIEWS = { q: [.95, .55, 1.25], front: [0, .12, 1], side: [-1, .12, 0], back: [0, .3, -1], top: [.6, 1.1, 1] };
  function renderIcon(key) {
    const [path, qs] = key.split('?'); const q = new URLSearchParams(qs || ''); const [type, name] = path.split('/');
    const size = +(q.get('size') || 256);
    const r = Icons.r; r.setSize(size, size, false);
    const obj = iconObject(type, name, q); Icons.s.add(obj);
    obj.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(obj); const sph = box.getBoundingSphere(new T.Sphere());
    const v = VIEWS[q.get('view') || (type === 'item' && /coin|star|clock|smiley|fireworks|arch|lock/.test(name) ? 'front' : type === 'piece' || type === 'land' ? 'top' : 'q')];
    const dir = new T.Vector3(...v).normalize();
    const cam = Icons.cam; const dist = sph.radius / Math.sin(cam.fov * PI / 360) * (+(q.get('pad') || 1.02));
    cam.position.copy(sph.center).addScaledVector(dir, dist); cam.lookAt(sph.center); cam.near = dist * .2; cam.far = dist * 3; cam.updateProjectionMatrix();
    Icons.s.overrideMaterial = q.has('sil') ? Icons.sil : null;
    r.setClearColor(0x000000, 0); r.render(Icons.s, cam);
    const url = r.domElement.toDataURL('image/png');
    Icons.s.remove(obj); Icons.s.overrideMaterial = null;
    obj.userData.tris = countTris(obj);
    return { url, tris: obj.userData.tris };
  }
  function countTris(o) { let n = 0; o.traverse(m => { if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); }
  function getIcon(key) {
    let p = Icons.cache.get(key); if (p) return p;
    p = new Promise(res => { Icons.q.push({ key, res }); pump(); }); Icons.cache.set(key, p); return p;
  }
  function pump() {
    if (Icons.busy) return; Icons.busy = true;
    ready.then(() => requestAnimationFrame(() => {
      if (!Icons.r) iconSetup();
      const n = Icons.q.splice(0, 5);
      n.forEach(({ key, res }) => { try { res(renderIcon(key)); } catch (e) { console.warn('dp-icon', key, e); res({ url: '', tris: 0 }); } });
      Icons.busy = false; if (Icons.q.length) pump();
    }));
  }
  window.DinoPark.getIcon = getIcon;

  class DPIcon extends HTMLElement {
    static get observedAttributes() { return ['kind']; }
    connectedCallback() {
      if (!this.img) {
        this.style.display = 'block'; if (!this.style.width) this.style.width = '100%'; if (!this.style.height) this.style.height = '100%';
        this.img = document.createElement('img'); this.img.alt = ''; this.img.draggable = false;
        Object.assign(this.img.style, { width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: 0, transition: 'opacity .25s', pointerEvents: 'none' });
        this.appendChild(this.img);
      }
      this._load();
    }
    attributeChangedCallback() { if (this.img) this._load(); }
    get kind() { return this.getAttribute('kind'); }
    set kind(v) { if (v != null) this.setAttribute('kind', v); }
    _load() { const k = this.getAttribute('kind'); if (!k || k === this._k) return; this._k = k; getIcon(k).then(r => { if (this._k === k) { this.img.src = r.url; this.img.style.opacity = 1; this.dataset.tris = r.tris; this.dispatchEvent(new CustomEvent('dp-tris', { bubbles: true, detail: r.tris })); } }); }
  }
  if (!customElements.get('dp-icon')) customElements.define('dp-icon', DPIcon);

  // ---------------- overlay HTML bits
  const FACES = {
    happy: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10.5" fill="#FFD54A" stroke="#fff" stroke-width="2.5"/><circle cx="8.6" cy="10" r="1.6" fill="#3B2F2A"/><circle cx="15.4" cy="10" r="1.6" fill="#3B2F2A"/><path d="M7.6 13.8 Q12 18.4 16.4 13.8" stroke="#3B2F2A" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    okay: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10.5" fill="#F2DDA4" stroke="#fff" stroke-width="2.5"/><circle cx="8.6" cy="10" r="1.6" fill="#3B2F2A"/><circle cx="15.4" cy="10" r="1.6" fill="#3B2F2A"/><path d="M8.5 15.2 L15.5 15.2" stroke="#3B2F2A" stroke-width="2" stroke-linecap="round"/></svg>',
    sad: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10.5" fill="#9CC7E8" stroke="#fff" stroke-width="2.5"/><circle cx="8.6" cy="10" r="1.6" fill="#3B2F2A"/><circle cx="15.4" cy="10" r="1.6" fill="#3B2F2A"/><path d="M8 17 Q12 13.4 16 17" stroke="#3B2F2A" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    giggle: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10.5" fill="#FFD54A" stroke="#fff" stroke-width="2.5"/><path d="M6.8 10 Q8.6 8 10.4 10 M13.6 10 Q15.4 8 17.2 10" stroke="#3B2F2A" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="12" cy="15.2" rx="3.2" ry="2.6" fill="#3B2F2A"/></svg>',
  };
  const REMOVE_SVG = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M6 6 L18 18 M18 6 L6 18" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>';
  function el(tag, style, html) { const e = document.createElement(tag); Object.assign(e.style, style); if (html) e.innerHTML = html; return e; }

  // ---------------- the live world
  const PEN = (slot, x, z, fx, fz, side, extra) => { const sw = side === 'e' || side === 'w'; return { t: 'pen', x, z, side, slot, dims: Object.assign({ w: sw ? fz : fx, d: sw ? fx : fz }, extra || {}) }; };
  function mkLayout(o) {
    const paths = [], seen = new Set();
    [[GX, 11, GX, GZ]].concat(o.paths).forEach(([x1, z1, x2, z2]) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) { const k = x + ',' + z; if (!seen.has(k)) { seen.add(k); paths.push([x, z]); } } });
    const pieces = [{ t: 'vc', x: 11, z: 8, side: 's' }, { t: 'icecream', x: 10, z: 12, side: 'e' }, { t: 'burger', x: 13, z: 12, side: 'w' }]
      .concat(o.pieces, (o.looks || []).map(([x, z]) => ({ t: 'lookout', x, z })), (o.trees || []).map(([x, z]) => ({ t: 'tree', x, z })), (o.bins || []).map(([x, z]) => ({ t: 'bin', x, z })));
    return Object.assign({}, o, { paths, pieces });
  }
  const LAYOUTS = {
    jungle: mkLayout({ name: 'River Valley',
      water: [[0, 0, 3, 9], [0, 9, 4, 2]],
      paths: [[4, 11, 22, 11], [5, 6, 5, 11], [19, 6, 19, 11], [5, 6, 19, 6]],
      pieces: [PEN('A', 5, 2, 4, 4, 's'), PEN('B', 10, 1, 6, 5, 's'), PEN('C', 16, 2, 4, 4, 's'), PEN('D', 6, 7, 4, 3, 'w'), PEN('E', 20, 7, 4, 3, 'w'), { t: 'toilet', x: 3, z: 12, side: 'n' }, { t: 'fountain', x: 7, z: 12 }],
      looks: [[4, 6], [20, 6]], bins: [[6, 10], [18, 10], [16, 12]],
      trees: [[4, 1], [9, 1], [22, 2], [23, 4], [25, 6], [25, 9], [15, 9], [17, 9], [21, 13], [23, 12], [16, 13], [2, 13], [5, 13], [9, 14], [15, 14], [4, 4], [21, 0]],
      jeep: [[4, 0], [24, 0], [24, 10]] }),
    volcano: mkLayout({ name: 'Lava Ridge',
      lava: [[0, 6, 4, 3], [22, 4, 4, 3]],
      paths: [[5, 11, 20, 11], [5, 2, 5, 11], [20, 1, 20, 11], [5, 6, 20, 6]],
      pieces: [PEN('A', 1, 1, 4, 4, 'e'), PEN('B', 8, 1, 8, 5, 's'), PEN('C', 21, 0, 4, 4, 'w'), PEN('D', 1, 9, 4, 3, 'e'), PEN('E', 21, 8, 4, 3, 'w'), { t: 'toilet', x: 6, z: 12, side: 'n' }, { t: 'fountain', x: 16, z: 12 }],
      looks: [[6, 5], [19, 5]], bins: [[6, 10], [19, 10]],
      trees: [[7, 1], [16, 1], [17, 3], [18, 5], [2, 13], [4, 13], [8, 14], [18, 13], [22, 13], [24, 12], [25, 1], [0, 13], [9, 9], [16, 9]],
      mono: [[3, 12.8], [3, 5.3], [22, 5.3], [22, 12.8]] }),
    desert: mkLayout({ name: 'Canyon Rim',
      rock: [[0, 0, 3, 4], [7, 0, 2, 4], [16, 0, 2, 4], [22, 0, 4, 5]], water: [[8, 7, 2, 3]],
      paths: [[3, 11, 22, 11], [3, 5, 3, 11], [22, 5, 22, 11], [3, 5, 22, 5]],
      pieces: [PEN('A', 3, 1, 4, 4, 's'), PEN('B', 9, 1, 7, 4, 's'), PEN('C', 18, 1, 4, 4, 's'), PEN('D', 4, 7, 4, 3, 'w'), PEN('E', 18, 7, 4, 3, 'e'), { t: 'toilet', x: 5, z: 12, side: 'n' }, { t: 'fountain', x: 16, z: 12 }],
      looks: [[8, 6], [16, 6]], bins: [[4, 10], [21, 10]],
      trees: [[1, 5], [1, 8], [0, 12], [2, 13], [8, 13], [10, 7], [15, 9], [17, 9], [23, 12], [25, 8], [25, 10], [20, 13], [0, 10]],
      jeep: [[24, 6], [24, 13]] }),
    beach: mkLayout({ name: 'Coral Lagoon',
      water: [[8, 7, 2, 2]],
      paths: [[3, 11, 22, 11], [3, 5, 3, 11], [22, 5, 22, 11], [3, 5, 22, 5]],
      pieces: [PEN('A', 3, 1, 4, 4, 's'), PEN('B', 8, 0, 8, 5, 's', { lagoon: true }), PEN('C', 17, 1, 5, 4, 's'), PEN('D', 4, 7, 4, 3, 'w'), PEN('E', 18, 7, 4, 3, 'e'), { t: 'toilet', x: 5, z: 12, side: 'n' }, { t: 'fountain', x: 16, z: 12 }],
      looks: [[7, 6], [16, 6]], bins: [[4, 10], [21, 10]],
      trees: [[1, 2], [0, 6], [1, 9], [2, 13], [7, 13], [17, 13], [21, 13], [24, 12], [24, 3], [23, 8], [16, 1], [0, 12]],
      mono: [[7.2, 5.6], [16.4, 5.6], [16.4, -1.8], [7.2, -1.8]] }),
    snowy: mkLayout({ name: 'Frozen Summit',
      ice: [[1, 6, 4, 4]],
      paths: [[3, 11, 22, 11], [6, 5, 6, 11], [22, 5, 22, 11], [2, 5, 22, 5]],
      pieces: [PEN('A', 2, 1, 4, 4, 's'), PEN('B', 7, 0, 7, 5, 's'), PEN('C', 14, 1, 4, 4, 's'), PEN('F', 18, 0, 5, 5, 's', { dome: true }), PEN('D', 7, 7, 4, 3, 'w'), PEN('E', 18, 7, 4, 3, 'e'), { t: 'toilet', x: 4, z: 12, side: 'n' }, { t: 'fountain', x: 16, z: 12 }],
      looks: [[15, 6], [1, 5]], bins: [[5, 10], [21, 10]],
      trees: [[0, 1], [1, 11], [0, 3], [24, 2], [24, 6], [23, 9], [24, 12], [2, 13], [7, 13], [18, 13], [21, 13], [16, 9], [0, 9]],
      mono: [[1.5, 12.8], [1.5, 5.8], [23, 5.8], [23, 12.8]] }),
  };
  const LAYOUT = (() => {
    const k = (x, z) => x + ',' + z; const s = new Set();
    for (let x = 3; x <= 16; x++) { s.add(k(x, 3)); s.add(k(x, 8)); }
    for (let z = 3; z <= 8; z++) { s.add(k(3, z)); s.add(k(16, z)); }
    for (let z = 8; z <= 11; z++) s.add(k(9, z));
    return {
      paths: [...s].map(v => v.split(',').map(Number)),
      pieces: [
        { type: 'pen_s', gx: 4, gz: 0, side: 's', slot: 'A' }, { type: 'pen_b', gx: 8, gz: 0, side: 's', slot: 'B' },
        { type: 'pen_s', gx: 13, gz: 0, side: 's', slot: 'C' }, { type: 'pen_s', gx: 17, gz: 4, side: 'w', slot: 'D' },
        { type: 'icecream', gx: 5, gz: 6, side: 's' }, { type: 'fountain', gx: 9, gz: 4, side: 's' }, { type: 'burger', gx: 13, gz: 6, side: 's' },
        { type: 'toilet', gx: 2, gz: 5, side: 'e' },
        { type: 'tree', gx: 4, gz: 4 }, { type: 'tree', gx: 7, gz: 4 }, { type: 'tree', gx: 12, gz: 4 }, { type: 'tree', gx: 15, gz: 5 }, { type: 'tree', gx: 0, gz: 1 },
        { type: 'tree', gx: 1, gz: 10 }, { type: 'tree', gx: 12, gz: 10 }, { type: 'tree', gx: 6, gz: 10 }, { type: 'tree', gx: 18, gz: 10 },
        { type: 'bin', gx: 7, gz: 7 }, { type: 'bin', gx: 10, gz: 9 },
      ],
    };
  })();
  const SIDE_ROT = { s: 0, n: PI, e: PI / 2, w: -PI / 2 };
  const cellX = gx => gx - GW / 2 + .5, cellZ = gz => gz - GH / 2 + .5;

  class DinoWorld extends HTMLElement {
    static get observedAttributes() { return ['park', 'mode', 'preset', 'difficulty', 'egg', 'cameo']; }
    constructor() { super(); this.cfg = { park: 'jungle', mode: 'play', preset: '', difficulty: 'normal', egg: 'spike', cameo: 'right', ticket: 2 }; this._q = []; }
    connectedCallback() {
      for (const a of DinoWorld.observedAttributes) { const v = this.getAttribute(a); if (v) this.cfg[a] = v; }
      if (this.renderer) { this._running = true; this._loop(); return; }
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none' });
      this.canvas = el('canvas', { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }); this.appendChild(this.canvas);
      this.ov = el('div', { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' }); this.appendChild(this.ov);
      this._onCmd = e => { const d = e.detail || {}; if (typeof this[d.fn] === 'function') this[d.fn](...(d.args || [])); };
      window.addEventListener('dp:cmd', this._onCmd);
      ready.then(() => this._setup());
    }
    disconnectedCallback() { this._running = false; cancelAnimationFrame(this._raf); }
    attributeChangedCallback(n, o, v) { if (v != null && v !== o) this.configure({ [n]: v }); }
    _when(fn) { if (this.world) fn(); else this._q.push(fn); }
    emit(type, data) {
      if (type === 'coins' && data) data = Object.assign({}, data, { amount: Math.round(data.amount * (this.cfg.coinMult ?? 1.5)) }); window.dispatchEvent(new CustomEvent('dp:world', { detail: Object.assign({ type, world: this }, data || {}) })); }

    // ---- public API
    configure(c) {
      const prev = Object.assign({}, this.cfg); Object.assign(this.cfg, c);
      this._when(() => {
        if ((c.park && c.park !== this._builtPark) || (c.penStyle && c.penStyle !== this._builtPen) || (c.skins && JSON.stringify(c.skins) !== this._builtSkins) || (c.treats && c.treats.join() !== this._builtTreats) || (c.residents && c.residents.join() !== this._builtRes)) this.build();
        else if (c.preset !== undefined && c.preset !== prev.preset) this.build();
        if (c.mode || c.cameo) this._applyMode();
      });
    }
    setPaused(b) { this.paused = !!b; }
    resetDay() { this._when(() => this.build()); }
    select(type) { this._when(() => this._select(type)); }
    escape(id) { this._when(() => { const d = this.dinos.find(x => x.id === id && !x.escaped) || this.dinos.find(x => !x.escaped && !x.hatching); if (d) this._escape(d); }); }
    autoHatch(id) { this._when(() => { const pen = this.pieces.find(p => p.isPen && !p.dino && !p.hatch); if (pen) this._startHatch(pen, id || this.cfg.egg); }); }
    celebrate() { this._when(() => this._celebrate()); }
    fireworks() { this._when(() => { this.fw = { t: 0, lb: -1 }; }); }  // ARCADE: Fireworks treat on the result screen
    releaseFocus() { this.focus = null; }
    focusDino(id) { this._when(() => { const d = this.dinos.find(x => x.id === id); if (d) this.focus = { tgt: d.g.position.clone(), obj: d.g, k: .6, until: this.t + 2.4 }; }); }
    hungry(id) { this._when(() => { const d = this.dinos.find(x => x.id === id) || this.dinos[0]; if (d && !d.hungry && !d.escaped) this._makeHungry(d); }); }

    _setup() {
      const r = this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));  // ARCADE: low-power tablet budget (was 1.75) r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.outputColorSpace = T.SRGBColorSpace;
      this.scene = new T.Scene(); this.cam = new T.PerspectiveCamera(36, 1.93, .1, 220); this.scene.add(this.cam);
      this.hemi = new T.HemisphereLight('#fff', '#888', 1.15); this.scene.add(this.hemi);
      const sun = this.sun = new T.DirectionalLight('#fff0d8', 2.1); sun.position.set(9, 16, 8); sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 17, bottom: -17, near: 1, far: 70 }); sun.shadow.mapSize.set(1536, 1536);  /* ARCADE: was 2048 */ sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
      this.scene.add(sun); this.scene.add(sun.target);
      this.camPos = new T.Vector3(0, 15, 13); this.camTgt = new T.Vector3(0, 0, 1); this.pan = new T.Vector2();
      this.t = 0; this.clock = new T.Clock();
      this._resize(); new ResizeObserver(() => this._resize()).observe(this);
      this._bindPointer();
      this.build();
      this._running = true; this._loop();
      const q = this._q; this._q = []; q.forEach(f => f());
    }
    _resize() {
      const w = this.clientWidth, h = this.clientHeight; if (!w || !h || !this.renderer) return;
      this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.W = w; this.H = h;
    }

    // ---- build park
    build() {
      const th = this.th = PARKS[this.cfg.park] || PARKS.jungle; this._builtPark = this.cfg.park; this._builtPen = this.cfg.penStyle || 'log'; this._builtSkins = JSON.stringify(this.cfg.skins || {}); this._builtTreats = (this.cfg.treats || []).join(); this._builtRes = (this.cfg.residents || []).join(); this.penPerk = { log: 1, stone: .85, lava: .75, ice: .7 }[this._builtPen] || 1; seedN = 12345;
      if (this.world) { this.scene.remove(this.world); this.terrainGeo && this.terrainGeo.dispose(); }
      this.ov.innerHTML = ''; this.tags = new Set();
      this.world = grp(this.scene);
      this.scene.background = new T.Color(th.sky); this.scene.fog = new T.Fog(th.sky, 44, 95);
      this.hemi.color.set(th.hemiS); this.hemi.groundColor.set(th.hemiG);
      this.anims = []; this.parts = []; this.trail = []; this.nets = []; this.foam = this.smoke = this.snow = this.waves = null;
      this._terrain(th); this._landmarks(th); this._scatter(th);
      this.occ = new Array(GW * GH).fill(null); this.pathTiles = new Map();
      const L = this.L = LAYOUTS[this.cfg.park] || LAYOUTS.jungle;
      (L.water || []).forEach(r => this._area(r, 'water')); (L.ice || []).forEach(r => this._area(r, 'ice')); (L.lava || []).forEach(r => this._area(r, 'lava')); (L.rock || []).forEach(r => this._area(r, 'rock'));
      L.paths.forEach(([x, z]) => this._addPath(x, z, false));
      this.pieces = []; this.dinos = [];
      const woolly = this.cfg.park === 'snowy';
      L.pieces.forEach(p => this._addPiece(p.t, p.x, p.z, p.side, false, p.slot, p.dims));
      this._transport(L); this._perimeter();
      const gate = buildPiece('gate', { theme: this.cfg.park }); gate.scale.setScalar(1.25); gate.position.set(cellX(GX), 0, cellZ(GZ) + .15); this.world.add(gate);
      if ((this.cfg.treats || []).includes('arch')) {  // ARCADE: Flower Arch treat, over the gate
        const a = grp(this.world, [cellX(GX), 0, cellZ(GZ) + .75]); mesh(a, G.torus(1.9, .12, 5, 12, PI), '#58b84f', [0, .2, 0]);
        const fc = ['#ff8fb1', '#ffd54a', '#ffffff', '#b58cf0']; for (let i = 0; i <= 12; i++) { const an = i / 12 * PI; mesh(a, G.ico(0), fc[i % 4], [Math.cos(an) * 1.9, .2 + Math.sin(an) * 1.9, .12], .16); }
      }
      if (Array.isArray(this.cfg.residents)) {  // ARCADE: the game says who lives here; big dinos get the big pens, and a pen is kept
        // free for today's egg (the biggest one when the egg is a big dino)
        const pens = this.pieces.filter(p => p.isPen).sort((a, b) => b.fw * b.fd - a.fw * a.fd);
        const eggBig = DINOS[this.cfg.egg] && DINOS[this.cfg.egg].pen === 'big'; if (eggBig) pens.shift(); else pens.pop();
        const rs = this.cfg.residents.slice(0, pens.length).sort((a, b) => (DINOS[b].pen === 'big') - (DINOS[a].pen === 'big'));
        rs.forEach((id, i) => this._addDino(id, pens[i], woolly));
      } else {
        const pd = PARK_DINOS[this.cfg.park] || PARK_DINOS.jungle;
        this.pieces.filter(p => p.isPen).forEach(p => { const id = pd[p.slot]; if (id) this._addDino(id, p, woolly); });
      }
      this.bins = this.pieces.filter(p => p.type === 'bin');
      this.bins.forEach((b, i) => { b.fill = i === 0 ? .45 : 0; });
      this.visitors = []; this.spawnT = 0; this.escapee = null; this.focus = null; this.selecting = null; this.spots = []; this.cele = null;
      this.statsT = 0; this.happySeen = 0; this.evT = rr(28, 40);
      this.dinos.forEach((d, i) => { d.hunger = [.42, .18, .3, .08][i] ?? .1; d.fun = [.1, .38, .05, .22][i] ?? .1; });
      this._cameo();
      for (let i = 0; i < 13; i++) this._spawnVisitor(true);
      const sc = this.cfg.preset;
      if (sc === 'hungry') { this._makeHungry(this.dinos[0]); this.bins[0].fill = 1; setTimeout(() => this._select('icecream'), 50); }
      if (sc === 'escape') { const z = this.dinos.find(d => d.id === 'zippy') || this.dinos[2]; if (z) { this._escape(z, true); } }
      if (sc === 'hatch') { this._startHatch(this.pieces.find(p => p.slot === 'D'), 'flappy', true); }
      this._applyMode(true);
      this.emit('built', { park: this.cfg.park, dinos: this.dinos.map(d => d.id) });
    }
    _terrain(th) {
      const geo = new T.PlaneGeometry(92, 64, 46, 32); geo.rotateX(-PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const dx = Math.max(0, Math.abs(x) - (GW / 2 + 1)), dzb = Math.max(0, -z - (GH / 2 + 1.3)), dzf = Math.max(0, z - (GH / 2 + 1.3));
        const n = h3(x, 0, z, 3);
        let y = 0; const dd = Math.max(dx, dzb);
        if (dd > 0) y = Math.min(1, dd / 4) * (1.2 + dd * .45 + n[0] * .7);
        if (dzf > 0 && dx <= 0) y = n[1] * .08 - Math.min(1, dzf / 3) * .15;
        if (this.cfg.park === 'beach' && dzb > .8 && dzb >= dx) y = -.5 - Math.min(1, dzb / 3) * .4;
        p.setY(i, Math.min(y, 7.5));
      }
      const g = geo.toNonIndexed(); const pos = g.attributes.position; const cols = new Float32Array(pos.count * 3);
      const cA = new T.Color(th.ground), cB = new T.Color(th.ground2), cE = new T.Color(th.edge), cH = new T.Color(th.hill), cR = new T.Color(th.rock), tmp = new T.Color();
      for (let f = 0; f < pos.count; f += 3) {
        let ax = 0, ay = 0, az = 0; for (let k = 0; k < 3; k++) { ax += pos.getX(f + k); ay += pos.getY(f + k); az += pos.getZ(f + k); } ax /= 3; ay /= 3; az /= 3;
        const inside = Math.abs(ax) < GW / 2 + .6 && az > -(GH / 2 + 1) && az < GH / 2 + 1.3;
        const r = h3(ax, 1, az, 9)[0];
        if (inside) tmp.copy(r > 0 ? cA : cB);
        else if (ay > 3.8) tmp.copy(this.cfg.park === 'snowy' ? new T.Color('#ffffff') : cR);
        else if (ay > .9) tmp.copy(cH).lerp(cR, clamp((ay - .9) / 4, 0, .6));
        else tmp.copy(cE).lerp(cH, clamp(ay, 0, 1) * .5 + (r > 0 ? .08 : 0));
        for (let k = 0; k < 3; k++) { cols[(f + k) * 3] = tmp.r; cols[(f + k) * 3 + 1] = tmp.g; cols[(f + k) * 3 + 2] = tmp.b; }
      }
      g.setAttribute('color', new T.BufferAttribute(cols, 3)); g.computeVertexNormals(); geo.dispose();
      this.terrainGeo = g;
      const m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .95 })); m.receiveShadow = true; this.world.add(m);
    }
    _landmarks(th) {
      const W = this.world, park = this.cfg.park; const n0 = W.children.length;
      this._landmarks2(th, W, park);
      W.children.slice(n0).forEach(o => { o.position.x *= 1.22; o.position.z = o.position.z * 1.18 - .6; });
      if (this.waves) this.waves.forEach(w => { w.z = w.m.position.z; });
    }
    _landmarks2(th, W, park) {
      if (park === 'jungle') {
        [[-14, 2.2, -11, 3.2], [-10.5, 1.6, -11.6, 2.6], [-12, 4.2, -12.5, 2.8], [-8, 1, -10.6, 1.8]].forEach(([x, y, z, s], i) => mesh(W, G.dode(.14, 20 + i), i % 2 ? th.rock : th.rock2, [x, y, z], [s, s * .9, s * .8]));
        const wf = mesh(W, G.box(1.7, 5.2, .25), M(th.water, { emissive: th.water, emissiveIntensity: .35, roughness: .2 }), [-11.8, 2.4, -9.9]); wf.castShadow = false;
        mesh(W, G.cyl(2.6, 2.8, .12, 10), M(th.water, { roughness: .2 }), [-11.6, .03, -8.2]).castShadow = false;
        this.foam = []; for (let i = 0; i < 8; i++) { const f = mesh(W, G.ico(0), '#ffffff', [-11.8, 4, -9.7], .16); f.castShadow = false; this.foam.push({ m: f, o: i / 8 }); }
        [[-13.5, -7.5], [-9.4, -7.4], [-12, -6.7]].forEach(([x, z], i) => mesh(W, G.dode(.1, 30 + i), th.rock, [x, .2, z], [.6, .4, .5]));
      }
      if (park === 'volcano') {
        const v = mesh(W, cg('volc', () => facet(new T.ConeGeometry(7, 7, 11, 3), .35, 7)), '#4a4450', [12.5, 3.2, -13]);
        mesh(W, G.cyl(1.7, 2.1, .4, 11), M(th.lava, { emissive: th.lava, emissiveIntensity: 1 }), [12.5, 6.75, -13]).castShadow = false;
        mesh(W, G.box(.5, 4.2, .2), M(th.lava, { emissive: th.lava, emissiveIntensity: .9 }), [11.1, 4.4, -9.9], 1, [-.72, .25, .5]).castShadow = false;
        this.smoke = []; for (let i = 0; i < 8; i++) { const m = new T.Mesh(G.ico(1, .12, i), new T.MeshStandardMaterial({ color: '#efe9e4', flatShading: true, transparent: true, opacity: .9 })); m.position.set(12.5, 7, -13); W.add(m); this.smoke.push({ m, o: i / 8 }); }
        [[-14, -10], [-9, -11.5]].forEach(([x, z], i) => mesh(W, G.dode(.14, 40 + i), th.rock, [x, 1.4, z], [2.6, 2, 2]));
        mesh(W, G.cyl(3, 3.2, .1, 10), M(th.water, { roughness: .2 }), [-15, .05, 3]).castShadow = false;
      }
      if (park === 'desert') {
        [[-12, -12, 3.2, 4.5], [-4, -15, 4, 5.5], [8, -14, 3.6, 4], [15, -9, 2.6, 3.2]].forEach(([x, z, r, h], i) => { mesh(W, cg('mesa' + i, () => facet(new T.CylinderGeometry(r, r * 1.2, h, 8, 2), .25, 80 + i)), i % 2 ? th.rock : th.rock2, [x, h / 2 - .3, z]); mesh(W, cg('mesat' + i, () => facet(new T.CylinderGeometry(r * 1.02, r * 1.02, .3, 8), .1, 90 + i)), shade(th.rock, .2), [x, h - .3, z]); });
        mesh(W, G.cyl(2.2, 2.4, .1, 10), M(th.water, { roughness: .2 }), [-15, .05, 2.5]).castShadow = false;
        [[-16.5, 1], [-13.5, 4.2]].forEach(([x, z]) => { const p = buildTree(PARKS.beach, 1.3); p.position.set(x, 0, z); W.add(p); });
      }
      if (park === 'beach') {
        const sea = mesh(W, G.box(90, .1, 30), M(th.water, { roughness: .15, emissive: th.water, emissiveIntensity: .12 }), [0, -.02, -19]); sea.castShadow = false;
        this.waves = []; for (let i = 0; i < 14; i++) { const m = mesh(W, G.box(rr(1, 2.4), .06, .18), '#ffffff', [rr(-20, 20), .05, rr(-12, -9)]); m.castShadow = false; this.waves.push({ m, o: rnd() * 6, z: m.position.z }); }
        const lh = grp(W, [13, 0, -10.5]); mesh(lh, G.dode(.12, 5), th.rock, [0, .4, 0], [1.8, 1, 1.6]); for (let i = 0; i < 5; i++) mesh(lh, G.cyl(.62 - i * .06, .68 - i * .06, .8, 9), i % 2 ? '#ffffff' : '#ff6b5b', [0, 1.3 + i * .8, 0]); mesh(lh, G.cyl(.5, .5, .5, 9), M('#ffe27a', { emissive: '#ffe27a', emissiveIntensity: .7 }), [0, 5.35, 0]); mesh(lh, G.cone(.62, .7, 9), '#3b2f2a', [0, 5.95, 0]);
        [[-13, -8], [-9, -8.6], [9, -8.2]].forEach(([x, z], i) => mesh(W, G.dode(.12, 95 + i), th.rock, [x, .1, z], [.8, .5, .7]));
      }
      if (park === 'snowy') {
        [[-9, -18, 7, 8], [3, -20, 8.5, 10], [15, -17, 6.5, 8], [-18, -12, 5, 6]].forEach(([x, z, r, h], i) => { mesh(W, cg('mtn' + i, () => facet(new T.ConeGeometry(r, h, 9, 2), .3, 50 + i)), th.rock, [x, h / 2 - .5, z]); mesh(W, cg('cap' + i, () => facet(new T.ConeGeometry(r * .42, h * .42, 9, 1), .12, 60 + i)), '#ffffff', [x, h - .5 - h * .21 + .05, z]); });
        mesh(W, G.cyl(2.4, 2.6, .1, 10), M('#cfeefc', { roughness: .15 }), [-14.5, .04, 2]).castShadow = false;
        this.snow = []; for (let i = 0; i < 70; i++) { const m = mesh(W, G.ico(0), '#ffffff', [rr(-16, 16), rr(0, 12), rr(-10, 10)], rr(.04, .08)); m.castShadow = false; this.snow.push({ m, s: rr(.6, 1.2) }); }
      }
    }
    _scatter(th) {
      for (let i = 0; i < 70; i++) {
        let x = rr(-28, 28), z = rr(-19, 13);
        if (Math.abs(x) < GW / 2 + 1.3 && z > -(GH / 2 + 1.8)) continue;
        if (z > GH / 2 + 1 && Math.abs(x) < GW / 2 + 4) continue;
        if (this.cfg.park === 'beach' && z < -(GH / 2 + 1.5)) continue;
        const t = buildTree(th, rr(.9, 1.6)); t.position.set(x, 0, z); t.rotation.y = rr(0, 6);
        const dx = Math.max(0, Math.abs(x) - (GW / 2 + 1)), dz = Math.max(0, -z - (GH / 2 + 1.3)); const d = Math.max(dx, dz);
        t.position.y = d > 0 ? Math.min(1, d / 4) * (1.2 + d * .45) * .8 : 0; this.world.add(t);
      }
      for (let i = 0; i < 20; i++) { const x = rr(-17, 17), z = rr(-10, 10); if (Math.abs(x) < GW / 2 + .6 && z > -(GH / 2 + .8) && z < GH / 2 + .8) continue; mesh(this.world, G.dode(.12, 70 + i), th.rock, [x, .1, z], [rr(.3, .7), rr(.2, .45), rr(.3, .6)]); }
    }
    _cell(x, z) { return (x < 0 || z < 0 || x >= GW || z >= GH) ? undefined : this.occ[z * GW + x]; }
    _setCell(x, z, v) { this.occ[z * GW + x] = v; }
    _area([x, z, w, d], kind) {
      const th = this.th; for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) if (this._cell(i, j) === null) this._setCell(i, j, kind);
      const cx = x + w / 2 - GW / 2, cz = z + d / 2 - GH / 2;
      if (kind === 'water' || kind === 'ice') {
        const m = mesh(this.world, G.box(w - .08, .1, d - .08), M(kind === 'ice' ? '#e3f4fb' : th.water, { roughness: kind === 'ice' ? .08 : .18, emissive: kind === 'ice' ? '#bfe3f2' : th.water, emissiveIntensity: .12 }), [cx, .02, cz]); m.castShadow = false;
        for (let i = 0; i < (w + d) * 1.5; i++) { const e = rnd() * 4 | 0, t = rnd(); const px = e < 2 ? cx - w / 2 + t * w : cx + (e === 2 ? -w / 2 : w / 2), pz = e < 2 ? cz + (e === 0 ? -d / 2 : d / 2) : cz - d / 2 + t * d; mesh(this.world, G.dode(.1, 100 + i), kind === 'ice' ? '#ffffff' : th.rock, [px, .06, pz], [rr(.15, .28), rr(.08, .16), rr(.15, .28)]); }
      } else if (kind === 'lava') {
        const m = mesh(this.world, G.box(w - .1, .1, d - .1), M(th.lava || '#ff7a2e', { emissive: th.lava || '#ff7a2e', emissiveIntensity: .9 }), [cx, .02, cz]); m.castShadow = false;
        for (let i = 0; i < (w + d) * 1.6; i++) { const px = cx + rr(-w / 2, w / 2), pz = cz + rr(-d / 2, d / 2); mesh(this.world, G.dode(.12, 110 + i), rnd() < .5 ? th.rock : th.rock2, [px, .1, pz], [rr(.2, .4), rr(.1, .25), rr(.2, .4)]); }
      } else if (kind === 'rock') {
        for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) { const h = rr(.9, 1.8); mesh(this.world, G.dode(.14, 120 + i * 7 + j), (i + j) % 2 ? th.rock : th.rock2, [cellX(i), h * .45, cellZ(j)], [.62, h * .55, .62]); }
      }
    }
    _poly(pts, closed) {
      const P = pts.map(([x, z]) => new T.Vector3(x - GW / 2 + .5, 0, z - GH / 2 + .5)); if (closed) P.push(P[0].clone());
      const segs = []; let tot = 0; for (let i = 0; i < P.length - 1; i++) { const len = P[i].distanceTo(P[i + 1]); segs.push({ a: P[i], b: P[i + 1], len, s: tot }); tot += len; }
      return { segs, tot, closed };
    }
    _at(pl, s) { s = pl.closed ? ((s % pl.tot) + pl.tot) % pl.tot : clamp(s, 0, pl.tot); const sg = pl.segs.find(q => s <= q.s + q.len) || pl.segs[pl.segs.length - 1]; const k = (s - sg.s) / sg.len; const p = sg.a.clone().lerp(sg.b, k); const dir = sg.b.clone().sub(sg.a).normalize(); return { p, dir }; }
    _transport(L) {
      this.jeeps = []; this.trains = [];
      if (L.jeep) {
        for (let i = 0; i < L.jeep.length - 1; i++) { const [x1, z1] = L.jeep[i], [x2, z2] = L.jeep[i + 1]; const n = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1)); for (let k = 0; k <= n; k++) { const x = Math.round(x1 + (x2 - x1) * k / n), z = Math.round(z1 + (z2 - z1) * k / n); if (this._cell(x, z) === null) { this._setCell(x, z, 'track'); const m = mesh(this.world, G.box(.98, .05, .98), shade(this.th.path2, -.22), [cellX(x), .025, cellZ(z)]); m.castShadow = false; } } }
        const pl = this._poly(L.jeep, false);
        for (let i = 0; i < 2; i++) { const g = buildJeep(i); this.world.add(g); this.jeeps.push({ g, pl, s: i * pl.tot * .55, dir: i ? -1 : 1, wait: 0 }); }
      }
      if (L.mono) {
        const pl = this._poly(L.mono, true), H = 2.5;
        for (let s = 0; s < pl.tot; s += 3.4) { const { p } = this._at(pl, s); const gx = Math.floor(p.x + GW / 2), gz = Math.floor(p.z + GH / 2); const c = this._cell(gx, gz); if (c && c !== 'path' && c !== 'water') continue; mesh(this.world, G.cyl(.07, .1, H, 6), '#dcd6cc', [p.x, H / 2, p.z]); mesh(this.world, G.box(.3, .1, .3), '#c9c2b6', [p.x, H - .03, p.z]); }
        pl.segs.forEach(sg => { const m = sg.a.clone().add(sg.b).multiplyScalar(.5); mesh(this.world, G.box(.2, .12, sg.len + .1), '#f4f1ea', [m.x, H + .06, m.z], 1, [0, Math.atan2(sg.b.x - sg.a.x, sg.b.z - sg.a.z), 0]); });
        const cars = []; for (let i = 0; i < 3; i++) { const g = buildTrain(i === 0); this.world.add(g); cars.push(g); }
        this.trains.push({ pl, s: 0, cars, H });
      }
    }
    _perimeter() {
      const hx = GW / 2 + .35, hz = GH / 2 + .35, post = G.cyl(.08, .1, .8, 5), rail = '#b98450', pc = '#8a5a3b';
      const run = (a, b, gap) => { const len = a.distanceTo(b), n = Math.ceil(len / 1.6); for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); if (gap != null && Math.abs(p.x - gap) < 2.2) continue; mesh(this.world, post, pc, [p.x, .4, p.z]); if (i < n) { const q = a.clone().lerp(b, (i + .5) / n); if (gap != null && Math.abs(q.x - gap) < 2.2) continue; for (const y of [.3, .6]) mesh(this.world, G.box(.05, .06, len / n), rail, [q.x, y, q.z], 1, [0, Math.atan2(b.x - a.x, b.z - a.z), 0]); } } };
      const V = (x, z) => new T.Vector3(x, 0, z);
      run(V(-hx, -hz), V(hx, -hz)); run(V(-hx, -hz), V(-hx, hz)); run(V(hx, -hz), V(hx, hz)); run(V(-hx, hz), V(hx, hz), cellX(GX));
    }
    _addPath(x, z, anim) {
      if (this._cell(x, z) === 'path') return;
      if (this._cell(x, z) === 'water') { this._setCell(x, z, 'path'); mesh(this.world, G.box(1, .12, .98), '#c98a55', [cellX(x), .14, cellZ(z)]); for (const sx of [-.45, .45]) mesh(this.world, G.box(.06, .25, .98), '#9b6440', [cellX(x) + sx, .32, cellZ(z)]); return; }
      this._setCell(x, z, 'path');
      const alt = (x + z) % 2 === 0;
      const m = mesh(this.world, G.box(.98, .08, .98), alt ? this.th.path : this.th.path2, [cellX(x), .04, cellZ(z)]); m.castShadow = false;
      this.pathTiles.set(x + ',' + z, m);
      if (anim) this._pop(m, .35, Math.hypot(x, z) * 0);
    }
    _foot(type, side) { const f = PIECES[type]; return (side === 'e' || side === 'w') ? [f.d, f.w] : [f.w, f.d]; }
    _entrances(p) {
      const out = []; const { gx, gz, fw, fd, side } = p;
      if (!side || !/pen|icecream|burger|toilet|vc/.test(p.type)) return out;
      if (side === 's') for (let x = gx; x < gx + fw; x++) out.push([x, gz + fd]);
      if (side === 'n') for (let x = gx; x < gx + fw; x++) out.push([x, gz - 1]);
      if (side === 'e') for (let z = gz; z < gz + fd; z++) out.push([gx + fw, z]);
      if (side === 'w') for (let z = gz; z < gz + fd; z++) out.push([gx - 1, z]);
      return out;
    }
    _addPiece(type, gx, gz, side, anim, slot, dims) {
      const [fw, fd] = dims ? ((side === 'e' || side === 'w') ? [dims.d, dims.w] : [dims.w, dims.d]) : this._foot(type, side);
      const g = buildPiece(type, Object.assign({ theme: this.cfg.park, style: this.cfg.penStyle || 'log' }, dims || {}));
      g.position.set(gx + fw / 2 - GW / 2, 0, gz + fd / 2 - GH / 2); g.rotation.y = SIDE_ROT[side || 's'];
      if (type === 'tree' || type === 'bin') g.rotation.y = rr(-.5, .5);
      this.world.add(g);
      const p = { type, gx, gz, fw, fd, side, g, slot, isPen: /pen/.test(type), removable: true, placed: anim };
      p.center = new T.Vector3(g.position.x, 0, g.position.z);
      for (let x = gx; x < gx + fw; x++) for (let z = gz; z < gz + fd; z++) this._setCell(x, z, p);
      this.pieces.push(p);
      if (type === 'bin') { p.fill = 0; }
      if (anim) { this._pop(g, .55); this._dust(p.center, Math.max(fw, fd)); }
      return p;
    }
    _addDino(id, pen, woolly, anim) {
      const g = buildDino(id, { woolly, skin: (this.cfg.skins || {})[id] }); const s = DINOS[id].size * 1.2 * (pen.fw * pen.fd >= 12 ? 1 : .92); g.scale.setScalar(s);
      const d = { id, g, pen, state: 'idle', t: rr(0, 5), home: pen.center.clone(), pos: pen.center.clone(), tgt: pen.center.clone(), wait: rr(1, 3), hungry: false, s, hunger: .05, fun: .05 };
      const bb = new T.Box3().setFromObject(g); d.h = bb.max.y - bb.min.y;
      g.position.copy(d.pos); this.world.add(g); pen.dino = d; this.dinos.push(d);
      if (anim) this._pop(g, .5);
      return d;
    }
    _cameo() {
      if (this.cameoG) this.cam.remove(this.cameoG);
      const c = this.cameoG = grp(this.cam, [3.6, -2.25, -6.2], [0, -1.05, 0]);
      const r = buildDino('rexy', { woolly: this.cfg.park === 'snowy', skin: (this.cfg.skins || {}).rexy }); c.add(r); this.cameoDino = r; c.visible = false;
    }
    _applyMode(first) {
      const m = this.cfg.mode; this.cameoG.visible = m === 'home';
      const mid = this.cfg.cameo === 'mid'; this.cameoBase = mid ? [.12, -2.85, -6.2, 0] : [3.55, -2.25, -6.2, -1.05]; this.cameoG.rotation.y = this.cameoBase[3];
      this.ov.style.display = (m === 'home' || m === 'idle') ? 'none' : 'block';
      if (m !== 'play') this._clearSpots();
      if (m === 'result' || m === 'home') { this.focus = null; if (this.escapee) this._catch(this.escapee); this.nets.forEach(n => this.world.remove(n.g)); this.nets = []; }
      if (m === 'result') this.ov.style.display = 'none';
      if (m !== 'result' && this.cele) { this.world.remove(this.cele.g); this.cele = null; }
      if (m !== 'result') this.fw = null;
      if (m === 'idle') { this._running = false; cancelAnimationFrame(this._raf); } else if (!this._running) { this._running = true; this._loop(); }
    }

    // ---- selection & placement
    _clearSpots() { (this.spots || []).forEach(s => { this.world.remove(s.g); }); this.spots = []; if (this.arrow) { this.arrow.el.remove(); this.tags.delete(this.arrow); this.arrow = null; } this.selecting = null; }
    _select(type) {
      this._clearSpots(); this._hideRemove(); if (!type) return;
      this.selecting = type; let spots = [];
      if (type === 'egg') spots = this.pieces.filter(p => p.isPen && !p.dino && !p.hatch).map(p => ({ gx: p.gx, gz: p.gz, fw: p.fw, fd: p.fd, pen: p }));
      else spots = this._findSpots(type);
      spots.forEach((s, i) => {
        const g = grp(this.world, [s.gx + s.fw / 2 - GW / 2, 0, s.gz + s.fd / 2 - GH / 2]);
        const mat = new T.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: .5, depthWrite: false });
        const pad = new T.Mesh(G.box(s.fw - .12, .06, s.fd - .12), mat); pad.position.y = .1; g.add(pad);
        const edgeM = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .95 });
        const w = s.fw, d = s.fd;
        [[0, -d / 2 + .06, w - .1, .1], [0, d / 2 - .06, w - .1, .1], [-w / 2 + .06, 0, .1, d - .1], [w / 2 - .06, 0, .1, d - .1]].forEach(([x, z, a, b]) => { const e = new T.Mesh(G.box(1, 1, 1), edgeM); e.scale.set(a, .08, b); e.position.set(x, .13, z); g.add(e); });
        if (type !== 'egg') {
          const ghost = buildPiece(type, { theme: this.cfg.park }); ghost.rotation.y = SIDE_ROT[s.side || 's'];
          const gm = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .38, depthWrite: false });
          ghost.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; } }); g.add(ghost);
        }
        s.g = g; s.mat = mat; s.ph = i * .7; this._pop(g, .35, i * .08);
      });
      this.spots = spots;
      if (spots[0]) {
        const e = el('div', { position: 'absolute', left: '0', top: '0', width: '0', height: '0' }, '<div style="position:absolute;left:-22px;top:-54px;width:44px;height:44px;border-radius:50%;background:#58B84F;border:4px solid #fff;box-shadow:0 5px 0 rgba(47,125,59,.5);display:flex;align-items:center;justify-content:center"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 4 V18 M5 12 L12 19 L19 12" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>');
        this.ov.appendChild(e); const s0 = spots[0];
        this.arrow = { el: e, pos: () => new T.Vector3(s0.g.position.x, 1.9 + Math.abs(Math.sin(this.t * 4)) * .35, s0.g.position.z) };
        this.tags.add(this.arrow);
      }
    }
    _entry(gx, gz, fw, fd, side) { return side === 'n' ? [gx + Math.floor(fw / 2), gz - 1] : side === 'e' ? [gx + fw, gz + Math.floor(fd / 2)] : side === 'w' ? [gx - 1, gz + Math.floor(fd / 2)] : [gx + Math.floor(fw / 2), gz + fd]; }
    _free(c) { return c === null || (c && c.type === 'tree' && !c.placed); }
    _findSpots(type) {
      const sided = /pen|icecream|burger|toilet/.test(type); const sides = sided ? ['s', 'e', 'w', 'n'] : [null]; const cands = [];
      for (const side of sides) {
        const [fw, fd] = this._foot(type, side || 's');
        for (let gz = 0; gz <= GH - fd; gz++) for (let gx = 0; gx <= GW - fw; gx++) {
          let ok = true, trees = 0; for (let x = gx; x < gx + fw && ok; x++) for (let z = gz; z < gz + fd; z++) { const c = this._cell(x, z); if (!this._free(c)) { ok = false; break; } if (c) trees++; }
          if (!ok) continue;
          let dist;
          if (side) { const [ex, ez] = this._entry(gx, gz, fw, fd, side); const ce = this._cell(ex, ez); if (ce === undefined || (ce !== null && ce !== 'path')) continue; const r = this._bfs(ex, ez); if (!r) continue; dist = r.length - 1; }
          else { dist = 9; for (let x = gx - 1; x <= gx + fw; x++) for (let z = gz - 1; z <= gz + fd; z++) if (this._cell(x, z) === 'path') dist = 0; }
          if (dist > 5) continue;
          cands.push({ gx, gz, fw, fd, side, dist, trees, cx: gx + fw / 2, cz: gz + fd / 2, pen: null });
        }
      }
      cands.sort((a, b) => (a.dist + a.trees * 1.5 + (a.side && a.side !== 's' ? .6 : 0)) - (b.dist + b.trees * 1.5 + (b.side && b.side !== 's' ? .6 : 0)) || Math.abs(a.cx - GW / 2) - Math.abs(b.cx - GW / 2));
      const out = [];
      for (const c of cands) { if (out.length >= 4) break; if (out.every(o => Math.hypot(o.cx - c.cx, o.cz - c.cz) > Math.max(c.fw, c.fd) + 1.5)) out.push(c); }
      if (!out.length) this.emit('nospace', { piece: type });
      return out;
    }
    _bfs(sx, sz) {
      const key = (x, z) => z * GW + x; const prev = new Map(); const q = [[sx, sz]]; prev.set(key(sx, sz), null);
      while (q.length) {
        const [x, z] = q.shift();
        if (this._cell(x, z) === 'path') { const out = []; let k = key(x, z); while (k != null) { out.push([k % GW, Math.floor(k / GW)]); k = prev.get(k); } return out.reverse(); }
        if (prev.size > 400) break;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; const c = this._cell(nx, nz); if (c === undefined || prev.has(key(nx, nz))) continue; if (c !== null && c !== 'path') continue; prev.set(key(nx, nz), key(x, z)); q.push([nx, nz]); }
      }
      return null;
    }
    _placeAt(spot) {
      const type = this.selecting;
      if (type === 'egg') { this._clearSpots(); this._startHatch(spot.pen, this.cfg.egg); this.emit('placed', { piece: 'egg' }); return; }
      for (let x = spot.gx; x < spot.gx + spot.fw; x++) for (let z = spot.gz; z < spot.gz + spot.fd; z++) { const c = this._cell(x, z); if (c && c.type === 'tree') this._remove(c, true); }
      const p = this._addPiece(type, spot.gx, spot.gz, spot.side, true);
      if (spot.side) { const [ex, ez] = this._entry(spot.gx, spot.gz, spot.fw, spot.fd, spot.side); const route = this._bfs(ex, ez) || []; route.forEach(([x, z], i) => { if (this._cell(x, z) === null) setTimeout(() => this._addPath(x, z, true), 120 + i * 110); }); }
      this._clearSpots(); this.emit('placed', { piece: type });
    }

    // ---- remove bubble
    _showRemove(p) {
      this._hideRemove();
      const e = el('div', { position: 'absolute', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'auto' });
      const b = el('div', { position: 'absolute', left: '-34px', top: '-78px', width: '68px', height: '68px', borderRadius: '50%', background: '#FF6B5B', border: '4px solid #fff', boxShadow: '0 6px 0 rgba(150,50,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0)', transition: 'transform .3s cubic-bezier(.3,1.7,.5,1)', cursor: 'pointer' }, REMOVE_SVG);
      e.appendChild(b); this.ov.appendChild(e); requestAnimationFrame(() => { b.style.transform = 'scale(1)'; });
      const h = p.type === 'pen_s' || p.type === 'pen_b' ? 1.2 : /icecream|burger/.test(p.type) ? 2.6 : 1.3;
      const tag = { el: e, pos: () => new T.Vector3(p.center.x, h, p.center.z) }; this.tags.add(tag); this.removeTag = tag;
      b.addEventListener('pointerdown', ev => { ev.stopPropagation(); this._remove(p); });
      clearTimeout(this._rmT); this._rmT = setTimeout(() => this._hideRemove(), 3200);
    }
    _hideRemove() { if (this.removeTag) { this.removeTag.el.remove(); this.tags.delete(this.removeTag); this.removeTag = null; } }
    _remove(p, silent) {
      this._hideRemove();
      for (let x = p.gx; x < p.gx + p.fw; x++) for (let z = p.gz; z < p.gz + p.fd; z++) this._setCell(x, z, null);
      this.pieces = this.pieces.filter(q => q !== p); this.bins = this.bins.filter(q => q !== p);
      if (p.bubble) this._killTag(p.bubble);
      this._dust(p.center, p.fw); const g = p.g; const t0 = this.t;
      this.anims.push({ f: t => { const k = clamp((t - t0) / .3, 0, 1); g.scale.setScalar(1 - ease(k)); if (k >= 1) { this.world.remove(g); return true; } } });
      if (!silent) this.emit('removed', { piece: p.type });
    }

    // ---- bubbles / tags
    _bubble(anchor, icon, onTap, ring) {
      const e = el('div', { position: 'absolute', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'auto' });
      const b = el('div', { position: 'absolute', left: '-38px', top: '-92px', width: '76px', height: '76px', borderRadius: '50%', background: '#FFF6E3', border: '4px solid ' + (ring || '#fff'), boxShadow: '0 6px 0 rgba(59,47,42,.28), 0 10px 22px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0)', transition: 'transform .35s cubic-bezier(.3,1.7,.5,1)', cursor: 'pointer' });
      const tail = el('div', { position: 'absolute', left: '50%', bottom: '-11px', width: '18px', height: '18px', marginLeft: '-9px', background: '#FFF6E3', transform: 'rotate(45deg)', borderRight: '4px solid ' + (ring || '#fff'), borderBottom: '4px solid ' + (ring || '#fff'), borderRadius: '0 0 5px 0' });
      const img = el('img', { width: '54px', height: '54px', position: 'relative', pointerEvents: 'none' }); img.draggable = false;
      getIcon(icon).then(r => { img.src = r.url; });
      b.appendChild(tail); b.appendChild(img); e.appendChild(b); this.ov.appendChild(e);
      requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transform = 'scale(1)'; }));
      const tag = { el: e, inner: b, pos: anchor, bob: true };
      b.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (tag.dead) return; tag.dead = true; b.style.transition = 'transform .18s ease-in'; b.style.transform = 'scale(1.35)'; setTimeout(() => this._killTag(tag), 160); onTap(); });
      this.tags.add(tag); return tag;
    }
    _killTag(tag) { if (!tag) return; tag.el.remove(); this.tags.delete(tag); }
    _coinPop(pos, amt) {
      amt = Math.round(amt * (this.cfg.coinMult ?? 1.5));
      const e = el('div', { position: 'absolute', left: '0', top: '0', width: '0', height: '0' }, `<div style="position:absolute;left:-30px;top:-20px;display:flex;align-items:center;gap:3px;font:700 20px Fredoka, sans-serif;color:#fff;text-shadow:0 2px 0 #b07a12, 0 0 6px rgba(0,0,0,.25);transition:transform 1.1s ease-out, opacity 1.1s ease-in;white-space:nowrap"><span style="width:20px;height:20px;border-radius:50%;background:#FFC93C;border:3px solid #fff;display:inline-block;box-sizing:border-box"></span>+${amt}</div>`);
      this.ov.appendChild(e); const inner = e.firstChild; const p = pos.clone();
      const tag = { el: e, pos: () => p }; this.tags.add(tag);
      requestAnimationFrame(() => requestAnimationFrame(() => { inner.style.transform = 'translateY(-46px)'; inner.style.opacity = 0; }));
      setTimeout(() => this._killTag(tag), 1150);
    }
    _faceTag(v) {
      const e = el('div', { position: 'absolute', left: '0', top: '0', width: '0', height: '0' });
      const f = el('div', { position: 'absolute', left: '-13px', top: '-30px', width: '26px', height: '26px', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.18))', transition: 'transform .25s cubic-bezier(.3,1.7,.5,1)' }, FACES.okay);
      e.appendChild(f); this.ov.appendChild(e); v.faceEl = f; v.faceKey = 'okay';
      const tag = { el: e, pos: () => new T.Vector3(v.g.position.x, 1.05, v.g.position.z) }; this.tags.add(tag); v.tag = tag;
    }
    _pips(d) {
      if (d.pipTag) this._killTag(d.pipTag);
      const n = DINOS[d.id].taps;
      const e = el('div', { position: 'absolute', left: '0', top: '0', width: '0', height: '0' });
      const row = el('div', { position: 'absolute', left: (-n * 13 - 6) + 'px', top: '-40px', display: 'flex', gap: '6px', padding: '5px 7px', borderRadius: '99px', background: 'rgba(59,47,42,.55)' });
      d.pipEls = []; for (let i = 0; i < n; i++) { const p = el('div', { width: '16px', height: '16px', borderRadius: '50%', background: '#FFC93C', border: '3px solid #fff', boxSizing: 'border-box', transition: 'transform .2s, background .2s' }); row.appendChild(p); d.pipEls.push(p); }
      const mk = el('div', { position: 'absolute', left: '-24px', top: '-100px', width: '48px', height: '48px', borderRadius: '50%', background: '#FF6B5B', border: '4px solid #fff', boxSizing: 'border-box', boxShadow: '0 5px 0 rgba(150,50,40,.45), 0 0 24px 6px rgba(255,107,91,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 30px Fredoka, sans-serif', color: '#fff' }, '!');
      e.appendChild(mk); if (n > 1) e.appendChild(row); this.ov.appendChild(e);
      d.pipTag = { el: e, bob: true, pos: () => new T.Vector3(d.g.position.x, d.g.position.y + d.h * d.s + .5, d.g.position.z) }; this.tags.add(d.pipTag);
    }

    // ---- dinos: hunger, escape, net, hatch
    _dAnchor(d) { return () => new T.Vector3(d.g.position.x, d.g.position.y + d.h * d.s + .35, d.g.position.z); }
    _makeHungry(d) {
      if (!d || d.bubble || d.escaped || d.hatching) return;
      d.hunger = Math.max(d.hunger || 0, .62); this._needBubble(d, 'food');
    }
    _needBubble(d, kind) { d.need = kind; d.hungry = true; d.bubble = this._bubble(this._dAnchor(d), kind === 'food' ? 'food/' + DINOS[d.id].eats : 'item/ball', () => kind === 'food' ? this._feed(d) : this._play(d)); }
    _play(d) {
      d.hungry = false; d.bubble = null; d.fun = 0; d.happyT = 2.8;
      const b = buildBall(); b.scale.setScalar(1.3); this.world.add(b); const t0 = this.t, c = d.g.position.clone();
      this.anims.push({ f: t => { const k = t - t0; b.position.set(c.x + Math.cos(k * 3) * .9, Math.abs(Math.sin(k * 7)) * .8, c.z + Math.sin(k * 3) * .6); b.rotation.x += .2; if (k > 2.4) { const s = clamp((k - 2.4) / .3, 0, 1); b.scale.setScalar(1.3 * (1 - s)); if (s >= 1) { this.world.remove(b); return true; } } } });
      this.visitors.forEach(v => { if (v.g.position.distanceTo(d.g.position) < 5) v.mood = Math.min(1, v.mood + .12); });
      this._coinPop(d.g.position.clone().setY(d.h * d.s + .4), 3); this.emit('coins', { amount: 3 });
      this.emit('fixed', { kind: 'fun', dino: d.id });
    }
    _feed(d) {
      d.hungry = false; d.bubble = null; d.eatT = 1.6; d.happyT = 3.4; d.hunger = 0; d.fun = Math.max(0, (d.fun || 0) - .1);
      const f = buildFood(DINOS[d.id].eats); const fwd = new T.Vector3(Math.sin(d.g.rotation.y), 0, Math.cos(d.g.rotation.y));
      f.position.copy(d.g.position).addScaledVector(fwd, .5 * d.s + .25); f.position.y = 0; this.world.add(f); this._pop(f, .3);
      const t0 = this.t; this.anims.push({ f: t => { if (t - t0 > 1.6) { const k = clamp((t - t0 - 1.6) / .3, 0, 1); f.scale.setScalar(1 - k); if (k >= 1) { this.world.remove(f); return true; } } } });
      this.visitors.forEach(v => { if (v.g.position.distanceTo(d.g.position) < 5) v.mood = Math.min(1, v.mood + .12); });
      this._coinPop(d.g.position.clone().setY(d.h * d.s + .4), 5); this.emit('coins', { amount: 5 });
      this.emit('fixed', { kind: 'food', dino: d.id });
    }
    _escape(d, instant, reason) {
      if (this.escapee || d.escaped || d.hatching) return;
      if (d.bubble) { this._killTag(d.bubble); d.bubble = null; } d.hungry = false;
      d.escaped = true; this.escapee = d; d.hits = DINOS[d.id].taps; d.leap = 0;
      const p = d.pen; const ent = this._entrances(p)[Math.floor(p.fw / 2)] || [p.gx, p.gz + p.fd];
      d.leapFrom = d.g.position.clone(); d.leapTo = new T.Vector3(cellX(ent[0]), 0, cellZ(ent[1]) + .3); d.leapT = 0;
      d.wanderTgt = null; d.stole = false; d.trailT = 0;
      this._pips(d);
      const ring = new T.Mesh(G.torus(.75, .07, 3, 20), new T.MeshBasicMaterial({ color: '#ff6b5b', transparent: true, opacity: .9, depthWrite: false })); ring.rotation.x = PI / 2; this.world.add(ring); d.ring = ring;
      if (instant) { d.leapT = 1; d.g.position.copy(d.leapTo); for (let i = 0; i < 26; i++) this._stepEscapee(d, 1 / 30); }
      this.emit('escaped', { dino: d.id, name: DINOS[d.id].name, taps: d.hits, reason: reason || 'got out' });
    }
    _randomBreakout() {
      const pool = this.dinos.filter(d => !d.escaped && !d.hatching && !d.held); if (!pool.length) return;
      const tot = pool.reduce((a, d) => a + DINOS[d.id].sneak + 1, 0); let r = rnd() * tot, d = pool[0]; for (const x of pool) { r -= DINOS[x.id].sneak + 1; if (r <= 0) { d = x; break; } }
      const R = d.g.userData.P.flyer ? ['flew over the fence', 'spotted a fish', 'went for a fly'] : ['dug under the fence', 'found the gate open', 'jumped the fence', 'smelled ice cream', 'wriggled out', 'wants to meet everyone'];
      this._burst(d.g.position.clone().setY(.4), 12, ['#c9a06a', '#8a5a3b', '#ffffff'], 3);
      this._escape(d, false, R[Math.floor(rnd() * R.length)]);
    }
    _nextWander(d) {
      const stalls = this.pieces.filter(p => /icecream|burger|fountain/.test(p.type));
      if (!d.stole && stalls.length && rnd() < .7) { const s = stalls[Math.floor(rnd() * stalls.length)]; return new T.Vector3(s.center.x + rr(-.5, .5), 0, s.center.z + s.fd / 2 + .7); }
      const v = this.visitors[Math.floor(rnd() * this.visitors.length)];
      if (v && rnd() < .5) return v.g.position.clone();
      return new T.Vector3(rr(-11, 11), 0, rr(-4, 5.5));
    }
    _stepEscapee(d, dt) {
      if (d.leapT < 1) {
        d.leapT = Math.min(1, d.leapT + dt / .7); const k = ease(d.leapT);
        d.g.position.lerpVectors(d.leapFrom, d.leapTo, k); d.g.position.y = Math.sin(d.leapT * PI) * 1.6;
        d.g.rotation.y = Math.atan2(d.leapTo.x - d.leapFrom.x, d.leapTo.z - d.leapFrom.z); return;
      }
      if (d.held) return;
      if (!d.wanderTgt || d.g.position.distanceTo(d.wanderTgt) < .5) {
        if (d.wanderTgt && !d.stole) { const ic = this.pieces.find(p => p.type === 'icecream' && p.center.distanceTo(d.g.position) < 2.6); if (ic && d.userData !== 1) { this._steal(d); } }
        d.wanderTgt = this._nextWander(d);
      }
      const dir = d.wanderTgt.clone().sub(d.g.position); dir.y = 0; const L = dir.length();
      const sp = DINOS[d.id].speed * (this.cfg.difficulty === 'easy' ? .72 : 1) * (d.dash > 0 ? 1.8 : 1) * (this.cfg.mode === 'play' || this.cfg.preset ? 1 : .6);
      if (L > .01) { dir.multiplyScalar(1 / L); d.g.position.addScaledVector(dir, Math.min(L, sp * dt)); const a = Math.atan2(dir.x, dir.z); let da = a - d.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); d.g.rotation.y += da * Math.min(1, dt * 8); }
      d.g.position.x = clamp(d.g.position.x, -12.5, 12.5); d.g.position.z = clamp(d.g.position.z, -7, 7);
      d.g.position.y = d.g.userData.P.flyer ? 1.3 + Math.sin(this.t * 3) * .25 : 0;
      d.dash = Math.max(0, (d.dash || 0) - dt);
      d.trailT += dt; if (d.trailT > .22) { d.trailT = 0; this._dot(d.g.position); }
    }
    _steal(d) {
      d.stole = true; const P = d.g.userData.P; const at = P.jaw || P.head;
      const c = grp(at, [0, .05, .35]); mesh(c, G.cone(.07, .2, 6), '#e7b169', [0, 0, 0], 1, [PI, 0, 0]); mesh(c, G.ico(1), '#ff8fb1', [0, .14, 0], .09);
      c.scale.setScalar(1 / (d.s * .9)); d.cone = c;
    }
    _dot(p) {
      let m = this.trail.find(t => t.life <= 0);
      if (!m) { if (this.trail.length > 36) return; const mm = new T.Mesh(G.cyl(.09, .09, .02, 8), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, depthWrite: false })); this.world.add(mm); m = { m: mm, life: 0 }; this.trail.push(m); }
      m.m.position.set(p.x, .1, p.z); m.life = 3.2; m.m.visible = true;
    }
    _throwNet(d) {
      const start = new T.Vector3(0, -1.1, .2).unproject(this.cam);
      const net = buildNet(false); net.scale.setScalar(.6); net.position.copy(start); this.world.add(net);
      const n = { g: net, t: 0, from: start, d }; this.nets.push(n);
      this.emit('net', {});
    }
    _stepNet(n, dt) {
      const d = n.d; n.t += dt / .42;
      if (n.t < 1) {
        const to = d.g.position.clone(); to.y += d.h * d.s * .5;
        n.g.position.lerpVectors(n.from, to, ease(n.t)); n.g.position.y += Math.sin(n.t * PI) * 2.2;
        n.g.rotation.x = n.t * PI * 2; n.g.rotation.z = n.t * PI * .5; n.g.scale.setScalar(.6 + n.t * d.s * 1.1);
        return false;
      }
      if (!n.hit) {
        n.hit = true; d.hits--; n.g.rotation.set(0, 0, 0);  // ARCADE: dome up (was flipped, so it landed upside down)
        if (d.pipEls) d.pipEls.forEach((p, i) => { if (i >= d.hits) { p.style.background = 'rgba(255,255,255,.35)'; p.style.transform = 'scale(.8)'; } });
        this._burst(d.g.position.clone().setY(d.h * d.s), 10, ['#ffffff', '#ffc93c'], 3);
        if (d.hits > 0) { d.dash = 1.1; d.wanderTgt = this._nextWander(d); this.emit('net-hit', { left: d.hits, dino: d.id }); }
        else { d.held = 1.1; this.emit('net-hit', { left: 0, dino: d.id }); }
      }
      if (d.hits > 0 || !d.escaped) { const k = clamp(n.t - 1, 0, .4) / .4; n.g.scale.setScalar((.6 + d.s * 1.1) * (1 - k)); return k >= 1; }
      n.g.position.copy(d.g.position); n.g.position.y = d.g.position.y; n.g.rotation.set(0, 0, 0); n.g.scale.setScalar(Math.min(3.4, Math.max(d.s * 1.9, d.h * 2.1)));  // ARCADE: the net sits over the dino like a dome
      return false;
    }
    _catch(d) {
      this._burst(d.g.position.clone().setY(.6), 22, ['#ffffff', '#ffc93c', '#58b84f', '#4bb4e6'], 4.5);
      this.nets.filter(n => n.d === d).forEach(n => this.world.remove(n.g)); this.nets = this.nets.filter(n => n.d !== d);
      if (d.pipTag) this._killTag(d.pipTag); d.pipTag = null;
      if (d.cone) { d.cone.parent.remove(d.cone); d.cone = null; }
      d.escaped = false; d.held = 0; this.escapee = null;
      d.pos.copy(d.home); d.g.position.copy(d.home); d.g.position.y = 2.5; d.dropT = 0; d.tgt.copy(d.home);
      d.happyT = 3; d.hunger = .1; d.fun = .1; if (d.ring) { this.world.remove(d.ring); d.ring = null; }
      this.emit('caught', { dino: d.id, name: DINOS[d.id].name });
    }
    _startHatch(pen, id, loop) {
      if (!pen) return; const e = buildEgg(id); e.g.position.copy(pen.center); e.g.position.y = 3.2; this.world.add(e.g);
      pen.hatch = { e, t: 0, id, loop, popped: false };
      if (!loop) this.focus = { tgt: pen.center.clone().setY(.4), k: .42, until: this.t + 7 };
      this.emit('hatch-start', { dino: id, name: DINOS[id].name });
    }
    _stepHatch(pen, dt) {
      const h = pen.hatch; h.t += dt; const t = h.t, e = h.e;
      if (t < .7) { const k = t / .7; e.g.position.y = 3.2 * (1 - k * k); if (k > .98 && !h.landed) { h.landed = 1; this._dust(pen.center, 1); this.emit('egg-land', {}); } }
      else if (t < 2.5) { e.g.position.y = 0; const k = (t - .7) / 1.8; e.inner.rotation.z = Math.sin(t * (10 + k * 14)) * (.06 + k * .3); e.inner.position.y = .26 + Math.abs(Math.sin(t * 12)) * k * .08; }
      else if (t < 3) { e.inner.rotation.z = Math.sin(t * 50) * .08; e.top.position.y = Math.abs(Math.sin(t * 40)) * .03; if (!h.chips) { h.chips = 1; this.emit('hatch-crack', { dino: h.id }); this._burst(pen.center.clone().setY(.5), 8, ['#fff4dc', DINOS[h.id].col], 2); } }
      else if (!h.popped) {
        h.popped = true; e.inner.rotation.z = 0;
        this._burst(pen.center.clone().setY(.6), 30, ['#ff6b5b', '#ffc93c', '#4bb4e6', '#58b84f', '#ff8fb1', '#ffffff'], 5);
        const d = this._addDino(h.id, pen, this.cfg.park === 'snowy'); d.g.scale.setScalar(.01); d.hatchT = 0; d.hatching = true; d.happyT = 3.5; d.hunger = 0; d.fun = 0; h.d = d;
        h.topV = new T.Vector3(rr(-1, 1), 5, rr(-1, 1));
        this.emit('hatched', { dino: h.id, name: DINOS[h.id].name, species: DINOS[h.id].species });
      } else {
        const k = t - 3; e.top.position.addScaledVector(h.topV, dt); h.topV.y -= 12 * dt; e.top.rotation.x += dt * 8; e.top.scale.setScalar(Math.max(0, 1 - k * 1.2));
        e.bot.scale.setScalar(Math.max(0, 1 - k * 1.5));
        const d = h.d; const s = d.s * back(clamp(k / .5, 0, 1)); d.g.scale.setScalar(Math.max(.01, s));
        if (k > 1.2) { this.world.remove(e.g); d.hatching = false; pen.hatch = null;
          if (h.loop) setTimeout(() => { if (!this.world) return; this.world.remove(d.g); this.dinos = this.dinos.filter(x => x !== d); pen.dino = null; this._startHatch(pen, h.id, true); }, 3500);
        }
      }
    }
    _celebrate() {
      if (this.cele) return;
      const g = buildDino('rexy', { woolly: this.cfg.park === 'snowy', skin: (this.cfg.skins || {}).rexy }); g.scale.setScalar(1.25); g.position.set(5.4, 0, 3.6); g.rotation.y = -.5; this.world.add(g); this._pop(g, .5);
      this.cele = { g, t: 0 };
    }

    // ---- visitors
    _spawnVisitor(pre) {
      const i = this.visitors.length + Math.floor(rnd() * 20);
      const g = buildVisitor(i); const paths = this.L.paths;
      let c = pre ? paths[Math.floor(rnd() * paths.length)] : [GX, GZ];
      const v = { g, cx: c[0], cz: c[1], px: c[0], pz: c[1], nx: c[0], nz: c[1], k: 1, mood: Math.min(1, rr(.45, .7) + ((this.cfg.treats || []).includes('arch') ? .1 : 0)), life: rr(45, 75), stop: 0, sp: rr(1.1, 1.5), seen: false, flee: 0 };
      g.position.set(cellX(c[0]) + rr(-.2, .2), 0, cellZ(c[1]) + rr(-.2, .2)); v.off = [rr(-.22, .22), rr(-.22, .22)];
      this.world.add(g); this.visitors.push(v); this._faceTag(v);
      if (!pre && this.cfg.mode === 'play') { const tk = +(this.cfg.ticket || 2); this._coinPop(new T.Vector3(cellX(GX), 1.4, cellZ(GZ)), tk); this.emit('coins', { amount: tk, ticket: true }); }
    }
    _stepVisitor(v, dt) {
      const P = v.g.userData.P;
      if (v.stop > 0) { v.stop -= dt; P.legs.forEach(l => l.rotation.x = 0); return; }
      const sp = v.sp * (v.flee > 0 ? 2.4 : 1);
      v.k += dt * sp;
      if (v.k >= 1) {
        v.k = 0; v.px = v.nx; v.pz = v.nz; v.life -= 1;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [v.px + dx, v.pz + dz]).filter(([x, z]) => this._cell(x, z) === 'path');
        let opts = nb.filter(([x, z]) => !(x === v.cx && z === v.cz)); if (!opts.length) opts = nb;
        if (v.flee > 0 && this.escapee) { const e = this.escapee.g.position; opts.sort((a, b) => Math.hypot(cellX(b[0]) - e.x, cellZ(b[1]) - e.z) - Math.hypot(cellX(a[0]) - e.x, cellZ(a[1]) - e.z)); }
        else if (v.life < 0) { opts.sort((a, b) => Math.hypot(a[0] - GX, a[1] - GZ) - Math.hypot(b[0] - GX, b[1] - GZ)); if (v.px === GX && v.pz === GZ) { v.gone = true; return; } }
        const pick = (v.flee > 0 || v.life < 0) ? opts[0] : opts[Math.floor(rnd() * opts.length)];
        v.cx = v.px; v.cz = v.pz; if (pick) { v.nx = pick[0]; v.nz = pick[1]; }
        this._visitorArrive(v);
      }
      const x = lerp(cellX(v.px), cellX(v.nx), v.k) + v.off[0], z = lerp(cellZ(v.pz), cellZ(v.nz), v.k) + v.off[1];
      const dx = x - v.g.position.x, dz = z - v.g.position.z; if (Math.abs(dx) + Math.abs(dz) > .001) v.g.rotation.y = Math.atan2(dx, dz);
      v.g.position.x = x; v.g.position.z = z;
      const ph = this.t * 9 * sp / 1.2 + v.off[0] * 20; P.legs[0].rotation.x = Math.sin(ph) * .6; P.legs[1].rotation.x = -Math.sin(ph) * .6;
      P.arms[0].rotation.x = -Math.sin(ph) * .5 + (v.flee > 0 ? -2.6 : 0); P.arms[1].rotation.x = Math.sin(ph) * .5 + (v.flee > 0 ? -2.6 : 0);
      v.g.position.y = Math.abs(Math.sin(ph)) * .04;
    }
    _visitorArrive(v) {
      const near = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = this._cell(v.px + dx, v.pz + dz); if (c && c !== 'path') near.push(c); }
      for (const p of near) {
        if ((p.type === 'icecream' || p.type === 'burger') && rnd() < (this.cfg.stallChance ?? .3) && !(v.lastBuy > this.t - (this.cfg.buyCooldown ?? 25)) && this.cfg.mode !== 'home') { v.lastBuy = this.t; v.stop = 1.6; v.mood = Math.min(1, v.mood + .2); const amt = p.type === 'burger' ? 8 : 6; this._coinPop(v.g.position.clone().setY(1.2), amt); this.emit('coins', { amount: amt }); }
        if (p.type === 'toilet' && rnd() < .3) { v.stop = 1.2; v.mood = Math.min(1, v.mood + .08); }
        if (p.isPen && p.dino && !p.dino.escaped) { v.mood = clamp(v.mood + (p.dino.hungry ? -.08 : .1), 0, 1); if (rnd() < .3) v.stop = 1; }
        if (p.type === 'fountain' || p.type === 'tree') v.mood = Math.min(1, v.mood + .04);
        if (p.type === 'vc' && rnd() < (this.cfg.stallChance ?? .3) && !(v.lastBuy > this.t - (this.cfg.buyCooldown ?? 25)) && this.cfg.mode !== 'home') { v.lastBuy = this.t; v.stop = 1.8; v.mood = Math.min(1, v.mood + .15); this._coinPop(v.g.position.clone().setY(1.2), 4); this.emit('coins', { amount: 4 }); }
        if (p.type === 'balloons') { v.mood = Math.min(1, v.mood + .12); if (rnd() < .3) v.stop = 1; }  // ARCADE
        if (p.type === 'statue') { v.mood = Math.min(1, v.mood + .2); if (rnd() < .5) v.stop = 1.4; }  // ARCADE
        if (p.type === 'lookout') { v.mood = Math.min(1, v.mood + .1); if (rnd() < .4) v.stop = 1.2; }
        if (p.type === 'bin' && p.fill >= 1) v.mood = Math.max(0, v.mood - .12);
      }
    }
    _setFace(v, key) { if (v.faceKey === key) return; v.faceKey = key; v.faceEl.innerHTML = FACES[key]; v.faceEl.style.transform = 'scale(1.4)'; setTimeout(() => { if (v.faceEl) v.faceEl.style.transform = 'scale(1)'; }, 180); }

    // ---- fx
    _pop(o, dur, delay = 0) { const s = o.scale.clone(); o.scale.setScalar(.001); const t0 = this.t + delay; this.anims.push({ f: t => { if (t < t0) return; const k = clamp((t - t0) / dur, 0, 1); o.scale.copy(s).multiplyScalar(Math.max(.001, back(k))); return k >= 1; } }); }
    _dust(c, n) { this._burst(new T.Vector3(c.x, .2, c.z), 6 + n * 3, ['#fff6e3', '#e9dcc0'], 2.2, .12); }
    _burst(p, n, cols, sp, sz = .09) {
      for (let i = 0; i < n; i++) { const m = mesh(this.world, G.ico(0), cols[i % cols.length], [p.x, p.y, p.z], sz * rr(.7, 1.3)); m.castShadow = false; this.parts.push({ m, v: new T.Vector3(rr(-1, 1), rr(.6, 1.6), rr(-1, 1)).multiplyScalar(sp), life: rr(.7, 1.2), r: new T.Vector3(rr(-8, 8), rr(-8, 8), 0) }); }
    }

    // ---- input
    _bindPointer() {
      let down = null;
      this.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, pan: this.pan.clone(), drag: false }; });
      window.addEventListener('pointermove', e => {
        if (!down || this.cfg.mode !== 'play') return; const r = this.getBoundingClientRect(); const sc = this.W / r.width;
        const dx = (e.clientX - down.x) * sc, dy = (e.clientY - down.y) * sc;
        if (!down.drag && Math.hypot(dx, dy) > 12) down.drag = true;
        if (down.drag) { this.pan.set(clamp(down.pan.x - dx * .025, -4, 4), clamp(down.pan.y - dy * .035, -2.5, 2.5)); }
      });
      window.addEventListener('pointerup', e => { if (!down) return; const d = down; down = null; if (!d.drag) this._tap(e.clientX, e.clientY); });
    }
    _tap(cx, cy) {
      if (this.paused || !this.world || (this.cfg.mode !== 'play' && !this.cfg.preset)) return;
      const r = this.getBoundingClientRect(); const nx = (cx - r.left) / r.width * 2 - 1, ny = -((cy - r.top) / r.height) * 2 + 1;
      const px = (nx + 1) / 2 * this.W, py = (1 - ny) / 2 * this.H;
      if (this.escapee && !this.escapee.held) {
        const d = this.escapee; const v = d.g.position.clone(); v.y += d.h * d.s * .5; v.project(this.cam);
        const sx = (v.x + 1) / 2 * this.W, sy = (1 - v.y) / 2 * this.H;
        if (Math.hypot(sx - px, sy - py) < 95 + d.s * 30) { if (!this.nets.some(n => n.d === d && !n.hit)) this._throwNet(d); return; }
      }
      const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(nx, ny), this.cam);
      const hit = new T.Vector3(); ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), hit);
      if (!hit) return;
      const gx = Math.floor(hit.x + GW / 2), gz = Math.floor(hit.z + GH / 2);
      if (this.selecting) {
        let best = null, bd = 1e9;
        for (const s of this.spots) { const cx2 = s.gx + s.fw / 2 - GW / 2, cz2 = s.gz + s.fd / 2 - GH / 2; const dd = Math.hypot(hit.x - cx2, hit.z - cz2); const inside = gx >= s.gx - 1 && gx < s.gx + s.fw + 1 && gz >= s.gz - 1 && gz < s.gz + s.fd + 1; if (inside && dd < bd) { bd = dd; best = s; } }
        if (best) this._placeAt(best);
        return;
      }
      // tap a dino in its pen = happy hop; tap a piece = remove bubble
      for (const d of this.dinos) { if (d.escaped) continue; const v = d.g.position.clone(); v.y += d.h * d.s * .5; v.project(this.cam); const sx = (v.x + 1) / 2 * this.W, sy = (1 - v.y) / 2 * this.H; if (Math.hypot(sx - px, sy - py) < 40 + d.s * 25) { d.happyT = 1.6; this.emit('pet', { dino: d.id }); return; } }
      const c = this._cell(gx, gz);
      this._hideRemove();
    }

    // ---- frame
    _loop() {
      if (!this._running) return;
      this._raf = requestAnimationFrame(() => this._loop());
      const dt = Math.min(.05, this.clock.getDelta());
      if (!this.world) return;
      if (!this.paused) this._update(dt);
      this._camera(dt);
      this.renderer.render(this.scene, this.cam);
      this._tags();
    }
    _update(dt) {
      this.t += dt; const t = this.t, mode = this.cfg.mode, live = mode === 'play';
      this.anims = this.anims.filter(a => !a.f(t));
      this.parts = this.parts.filter(p => { p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < .05) { p.m.position.y = .05; p.v.multiplyScalar(.5); p.v.y = Math.abs(p.v.y) * .3; } p.m.rotation.x += p.r.x * dt; p.m.rotation.y += p.r.y * dt; if (p.life < .3) p.m.scale.multiplyScalar(.9); if (p.life <= 0) { this.world.remove(p.m); return false; } return true; });
      this.trail.forEach(d => { if (d.life > 0) { d.life -= dt; d.m.material.opacity = clamp(d.life / 1.5, 0, .85); if (d.life <= 0) d.m.visible = false; } });
      this.pieces.forEach(p => { if (p.g.userData.drops) p.g.userData.drops.forEach(dr => { const k = (t * .9 + dr.o) % 1; dr.m.position.set(Math.cos(dr.a) * k * .7, 1.12 + k * .5 - k * k * 1.3, Math.sin(dr.a) * k * .7); }); });
      if (this.foam) this.foam.forEach(f => { const k = (t * .5 + f.o) % 1; f.m.position.set(-14.4 + Math.sin(f.o * 20) * .6, 4.9 - k * 4.9, -12.05); f.m.scale.setScalar(.12 + k * .12); });
      if (this.smoke) this.smoke.forEach(s => { const k = (t * .12 + s.o) % 1; s.m.position.set(15.25 + Math.sin(k * 5 + s.o * 9) * 1.2 + k * 2, 7 + k * 7, -15.9 + k * 1.5); s.m.scale.setScalar(.6 + k * 1.8); s.m.material.opacity = .85 * (1 - k); });
      (this.jeeps || []).forEach(j => { if (j.wait > 0) { j.wait -= dt; return; } j.s += dt * 2.1 * j.dir; if (j.s >= j.pl.tot || j.s <= 0) { j.s = clamp(j.s, 0, j.pl.tot); j.dir *= -1; j.wait = 1.2; } const { p, dir } = this._at(j.pl, j.s); j.g.position.set(p.x, Math.abs(Math.sin(t * 9)) * .03, p.z); j.g.rotation.y = lerpAngle(j.g.rotation.y, Math.atan2(dir.x * j.dir, dir.z * j.dir), dt * 6); });
      (this.trains || []).forEach(tr => { tr.s += dt * 3.2; tr.cars.forEach((c, i) => { const { p, dir } = this._at(tr.pl, tr.s - i * 1.45); c.position.set(p.x, tr.H + .12, p.z); c.scale.setScalar(.8); c.rotation.y = Math.atan2(dir.x, dir.z); }); });
      if (this.waves) this.waves.forEach(w => { w.m.position.z = w.z + Math.sin(t * .8 + w.o) * .45; });
      if (this.snow) this.snow.forEach(s => { s.m.position.y -= dt * s.s; s.m.position.x += Math.sin(t + s.s * 9) * dt * .3; if (s.m.position.y < 0) s.m.position.y = 12; });
      (this.spots || []).forEach(s => { s.mat.opacity = .35 + (Math.sin(t * 5 + s.ph) * .5 + .5) * .4; });
      // dinos
      for (const d of this.dinos) {
        d.t += dt;
        if (d.hatching && d.hatchT != null) { animDino(d.g, d.t, 'happy'); continue; }
        if (d.escaped) {
          this._stepEscapee(d, dt);
          if (d.ring) { d.ring.position.set(d.g.position.x, .12, d.g.position.z); d.ring.scale.setScalar((1 + Math.sin(this.t * 8) * .12) * (.8 + d.s * .8)); }
          if (d.held) { d.held -= dt; animDino(d.g, d.t, 'held'); if (d.held <= 0) this._catch(d); }
          else animDino(d.g, d.t, d.leapT < 1 ? 'happy' : 'run');
          continue;
        }
        if (d.dropT != null) { d.dropT += dt; const k = clamp(d.dropT / .5, 0, 1); d.g.position.y = 2.5 * (1 - k * k); if (k >= 1) d.dropT = null; }
        let st = 'idle';
        if (d.eatT > 0) { d.eatT -= dt; st = 'eat'; }
        else if (d.hungry) st = 'hungry';
        else if (d.happyT > 0) { d.happyT -= dt; st = 'happy'; }
        else {
          const dist = d.pos.distanceTo(d.tgt);
          if (dist > .05) { st = 'walk'; const dir = d.tgt.clone().sub(d.pos).normalize(); d.pos.addScaledVector(dir, Math.min(dist, dt * .7)); d.g.rotation.y = lerpAngle(d.g.rotation.y, Math.atan2(dir.x, dir.z), dt * 5); }
          else { d.wait -= dt; if (d.wait < 0) { const p = d.pen; const mx = p.fw / 2 - .8, mz = p.fd / 2 - .8; d.tgt.set(p.center.x + rr(-mx, mx), 0, p.center.z + rr(-mz, mz)); d.wait = rr(1.5, 4); } }
        }
        if (d.dropT == null) { d.g.position.x = d.pos.x; d.g.position.z = d.pos.z; d.g.position.y = d.g.userData.P.flyer && st !== 'eat' && st !== 'hungry' ? .5 + Math.sin(d.t * 2) * .12 : 0; }
        animDino(d.g, d.t, st === 'walk' && d.g.userData.P.flyer ? 'run' : st);
        if (live && !this.cfg.preset) {
          if (!d.hatching) {
            if (Math.max(d.hunger, d.fun) >= 1 && !this.escapee) { this._escape(d, false, d.hunger >= d.fun ? 'got too hungry' : 'got bored'); }
            const kk = (this.cfg.difficulty === 'easy' ? .7 : 1) * (this.penPerk || 1);
            d.hunger = Math.min(1, d.hunger + dt / 42 * (DINOS[d.id].hr || 1) * kk); d.fun = Math.min(1, d.fun + dt / 55 * (DINOS[d.id].fr || 1) * kk);
            if (!d.bubble && !(d.eatT > 0) && !(d.happyT > 0)) { if (d.hunger >= .55) this._needBubble(d, 'food'); else if (d.fun >= .55) this._needBubble(d, 'fun'); }
            if (d.bubble) { const u = (d.need === 'food' ? d.hunger : d.fun) > .82; if (u !== d.bubble.urgent) { d.bubble.urgent = u; d.bubble.inner.style.borderColor = u ? '#FF6B5B' : '#fff'; } }
            if (Math.max(d.hunger, d.fun) >= 1 && !this.escapee) this._escape(d);
          }
        }
      }
      this.pieces.forEach(p => { if (p.hatch) this._stepHatch(p, dt); });
      if (live && !this.cfg.preset && !this.escapee) { this.evT -= dt; if (this.evT <= 0) { this._randomBreakout(); this.evT = rr(45, 85) * (this.cfg.difficulty === 'easy' ? 1.4 : 1); } }
      this.nets = this.nets.filter(n => { const done = this._stepNet(n, dt); if (done) this.world.remove(n.g); return !done; });
      // bins
      if (live && !this.cfg.preset) this.bins.forEach(b => { if (b.fill < 1) { b.fill += dt / 32; if (b.fill >= 1) this._binFull(b); } });
      if (this.cfg.preset === 'hungry') this.bins.forEach(b => { if (b.fill >= 1 && !b.bubble) this._binFull(b); });
      // visitors
      if (mode !== 'idle') {
        this.spawnT -= dt; if (this.spawnT < 0 && this.visitors.length < Math.min(30, 8 + 3 * this.dinos.length)) { this._spawnVisitor(false); this.spawnT = Math.max(1, 3.3 - this.dinos.length * .22) * rr(.8, 1.2); }
        const esc = this.escapee && this.escapee.leapT >= 1 ? this.escapee.g.position : null;
        this.visitors = this.visitors.filter(v => {
          if (esc && v.g.position.distanceTo(esc) < 3.2) { v.flee = 1.2; v.mood = Math.max(0, v.mood - dt * .05); } else v.flee = Math.max(0, v.flee - dt);
          this._stepVisitor(v, dt);
          if (!esc) v.mood = clamp(v.mood + dt * .004, 0, 1);
          const key = v.flee > 0 ? 'giggle' : v.mood >= .66 ? 'happy' : v.mood >= .36 ? 'okay' : 'sad'; this._setFace(v, key);
          if (v.mood >= .66 && !v.seen) { v.seen = true; this.happySeen++; }
          if (v.gone) { this.world.remove(v.g); this._killTag(v.tag); return false; }
          return true;
        });
      }
      this.statsT -= dt;
      if (this.statsT < 0) { this.statsT = .5; const n = this.visitors.length; const avg = n ? this.visitors.reduce((a, v) => a + v.mood, 0) / n : .6; this.emit('stats', { avg, happyCount: this.happySeen, visitors: n }); this.emit('needs', { list: this.dinos.filter(d => !d.hatching).map(d => ({ id: d.id, hunger: d.hunger, fun: d.fun, need: d.bubble ? d.need : null, escaped: !!d.escaped })), emptyPens: this.pieces.filter(p => p.isPen && !p.dino && !p.hatch).length, fullBins: this.bins.filter(b => b.fill >= 1).length, visitors: this.visitors.length }); }
      // cameo & celebration
      if (this.cameoG.visible && this.cameoBase) { const c = this.cameoG, b = this.cameoBase; const w = Math.sin(t * .6); if (b[3]) { c.position.set(b[0] + w * .18, b[1], b[2]); c.rotation.z = .08 + w * .05; } else { c.position.set(b[0], b[1] + w * .12, b[2]); c.rotation.z = Math.sin(t * .45) * .06; } animDino(this.cameoDino, t, (t % 9) < 1.4 ? 'happy' : 'idle'); this.cameoDino.userData.P.head.rotation.z = Math.sin(t * .8) * .15; }
      if (this.fw) { this.fw.t += dt; const b = Math.floor(this.fw.t / .45); if (b !== this.fw.lb && this.fw.t < 6) { this.fw.lb = b; const c = [['#ff6b5b', '#ffc93c'], ['#4bb4e6', '#ffffff'], ['#58b84f', '#ff8fb1'], ['#8b72d8', '#ffc93c']][b % 4]; this._burst(new T.Vector3(rr(-9, 9), rr(5, 8), rr(-6, 0)), 26, c, 5.5, .12); this.emit('firework', {}); } if (this.fw.t > 6.5) this.fw = null; }
      if (this.cele) { this.cele.t += dt; const k = this.cele.t % 3; animDino(this.cele.g, this.cele.t, k < 1.4 ? 'roar' : 'happy'); if (Math.floor(this.cele.t / .7) !== this.cele.lb && this.cele.t < 6) { this.cele.lb = Math.floor(this.cele.t / .7); this._burst(new T.Vector3(rr(-6, 8), rr(2, 4), rr(-2, 3)), 16, ['#ff6b5b', '#ffc93c', '#4bb4e6', '#58b84f', '#ff8fb1'], 4); } }
    }
    _binFull(b) {
      if (b.bubble) return; const L = b.g.userData.lid; L.rotation.z = .6; L.position.x = .1; b.g.userData.junk.visible = true;
      b.bubble = this._bubble(() => new T.Vector3(b.center.x, 1.0, b.center.z), 'item/bin-full', () => { b.bubble = null; b.fill = 0; L.rotation.z = 0; L.position.x = 0; b.g.userData.junk.visible = false; this._burst(b.center.clone().setY(.5), 8, ['#ffffff', '#58b84f'], 2); this.visitors.forEach(v => { if (v.g.position.distanceTo(b.center) < 4) v.mood = Math.min(1, v.mood + .08); }); this.emit('fixed', { kind: 'bin' }); });
    }
    _camera(dt) {
      const m = this.cfg.mode, t = this.t; const pos = new T.Vector3(), tgt = new T.Vector3();
      if (m === 'home') { const a = Math.sin(t * .07) * .32; tgt.set(0, 0, -.6); pos.set(Math.sin(a) * 19.5, 12, Math.cos(a) * 19.5); }
      else if (m === 'result') { const a = Math.sin(t * .08) * .12; tgt.set(1.8, 0, 1.4); pos.set(tgt.x + Math.sin(a) * 16.5, 15.5, tgt.z + Math.cos(a) * 16.5); }
      else { tgt.set(this.pan.x, 0, 2.3 + this.pan.y); pos.set(tgt.x, 22.5, tgt.z + 15.4); }
      if (this.cfg.preset && m !== 'home') { tgt.set(0, 0, -.3); pos.set(0, 15, 18.6); }
      if (this.focus) { if (this.t > this.focus.until) this.focus = null; else { const off = pos.clone().sub(tgt).multiplyScalar(this.focus.k); if (this.focus.obj) this.focus.tgt.copy(this.focus.obj.position).setY(.4); tgt.copy(this.focus.tgt); pos.copy(tgt).add(off); } }
      const k = this._camInit ? 1 - Math.exp(-dt * 3) : 1; this._camInit = true;
      this.camPos.lerp(pos, k); this.camTgt.lerp(tgt, k);
      this.cam.position.copy(this.camPos); this.cam.lookAt(this.camTgt);
    }
    _tags() {
      if (!this.tags.size || this.ov.style.display === 'none') return; const v = new T.Vector3();
      this.cam.updateMatrixWorld();
      for (const tg of this.tags) {
        v.copy(tg.pos()); v.project(this.cam);
        if (v.z > 1) { tg.el.style.display = 'none'; continue; } tg.el.style.display = '';
        const x = (v.x + 1) / 2 * this.W, y = (1 - v.y) / 2 * this.H + (tg.bob ? Math.sin(this.t * 3.2) * 4 : 0);
        tg.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)` + (tg.urgent ? ` rotate(${(Math.sin(this.t * 22) * 9).toFixed(1)}deg)` : '');
      }
    }
  }
  function lerpAngle(a, b, k) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); }
  ['park', 'mode', 'preset', 'difficulty', 'egg', 'cameo'].forEach(k => Object.defineProperty(DinoWorld.prototype, k, { get() { return this.cfg[k]; }, set(v) { if (v != null && v !== this.cfg[k]) this.configure({ [k]: v }); }, configurable: true }));
  if (!customElements.get('dino-world')) customElements.define('dino-world', DinoWorld);
})();
