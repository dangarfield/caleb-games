// Kaiju Pothole core: renderer, camera, input, holes (player + rivals), modes, scoring.
import * as THREE from 'three';
import { World, kindOf, tierOf, TIER_MAX } from './world.js';
import { LOD } from './lod.js';
import { Hole, xrayFocus } from './hole.js';
import { Critters } from './critters.js';
import { Phys } from './physics.js';
import { sfx } from './sfx.js';

export const TIER_LABEL = ['', 'Street bits', 'Benches & bikes', 'Cars & trees', 'Buses & boats', 'Houses & shops', 'Skyscrapers!'];
export const KIND_LABEL = { prop: 'Street bits', tree: 'Trees & bushes', vehicle: 'Cars & vans', boat: 'Boats', air: 'Flying things', play: 'Playground bits', farm: 'Farm stuff', house: 'Houses', shop: 'Shops', tower: 'Tower blocks', factory: 'Factory bits', pad: 'Parks & car parks', hazard: 'Fire hazards', stadium: 'Stadium', harbour: 'Jetties' };
export const RIVALS = [{ name: 'Rusty', color: '#FF6B4A' }, { name: 'Gloopy', color: '#7ED957' }, { name: 'Big Nibbles', color: '#8C6CFF' }];
// Rival bots, per difficulty (all relative to the player):
//  speed: top speed vs the player's   sight: how far (m) they look for food / holes
//  grow:  share of what they eat that actually grows them (the player always gets 1)
//  think: seconds between decisions (slower = more wasted moves)   wander: chance a decision is a random stroll
//  chase: how much bigger than you a bot must be before it hunts you   bite: share of your growth lost when gobbled
export const DIFF = {
  easy: { speed: 0.75, sight: 14, grow: 0.5, think: [1.0, 1.6], wander: 0.35, chase: 1.6, bite: 0.15 },
  normal: { speed: 0.85, sight: 20, grow: 0.6, think: [0.7, 1.1], wander: 0.2, chase: 1.4, bite: 0.2 },
  hard: { speed: 0.95, sight: 28, grow: 0.75, think: [0.5, 0.8], wander: 0.1, chase: 1.25, bite: 0.3 },
};
const ROOMS = ['room_kitchen', 'room_yellow_lounge', 'room_yellow_bedroom', 'room_office', 'room_pink_sitting', 'room_dining', 'room_blue_bedroom', 'room_brown_lounge', 'room_kitchen_diner'];
let visits = 0; // each House Call visit moves on to another room, so all nine get used
export const LIST_LEVELS = [
  { name: 'Tidy the streets', items: [['prop', 12], ['tree', 4]] },
  { name: 'Car park clear-out', items: [['prop', 10], ['vehicle', 6]] },
  { name: 'Park life', items: [['tree', 10], ['play', 3], ['vehicle', 4]] },
  { name: 'Down by the harbour', items: [['vehicle', 8], ['boat', 4]] },
  { name: 'Farm fun', items: [['farm', 6], ['tree', 8]] },
  { name: 'Moving day', items: [['vehicle', 10], ['house', 2], ['air', 1]] },
  { name: 'Factory floor', items: [['factory', 6], ['vehicle', 8]] },
  { name: 'Big appetite', items: [['shop', 3], ['house', 3], ['tower', 1]] },
  { name: 'Hazard Sweep: high street', hazards: 6, items: [['hazard', 6]] },
  { name: 'Hazard Sweep: all over', hazards: 10, items: [['hazard', 10], ['vehicle', 4]] },
  { name: 'Hazard Sweep: the lot', hazards: 15, items: [['hazard', 15]] },
  { name: 'House Call: first visit', room: 0, items: [['hazard', 15]] },
  { name: 'House Call: tidy-up', room: 1, items: [['hazard', 15], ['vehicle', 8]] },
  { name: 'House Call: big clear-out', room: 2, items: [['hazard', 15], ['prop', 20]] },
  { name: 'House Call: last stop', room: 3, items: [['hazard', 15], ['tree', 6], ['house', 2]] },
];

export class Game {
  constructor(canvas, A, hooks) {
    this.A = A; this.hooks = hooks; this.shake = true;
    const shots = /[?&]shots/.test(location.search), touch = matchMedia('(pointer: coarse)').matches;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: shots, powerPreference: 'high-performance' });
    // Pixel ratio starts at 1.5 max and adapts to the frame rate (see quality()).
    this.dprMax = Math.min(2, devicePixelRatio); this.dprMin = Math.min(1, this.dprMax); this.dpr = this.dprMax; this.ft = 16; this.qT = 0;
    r.setPixelRatio(this.dpr); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color('#bfe6f7'); s.fog = new THREE.Fog('#bfe6f7', 150, 420);
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.5, 700);
    s.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.25));
    const sun = this.sun = new THREE.DirectionalLight(0xfff2dd, 1.7); sun.castShadow = true; const sm = this.shadowMap = touch ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; s.add(sun, sun.target);
    this.world = new World(s, A.models); this.world.maxTex = r.capabilities.maxTextureSize; this.world.maxAniso = r.capabilities.getMaxAnisotropy(); this.critters = new Critters(s); this.critters.camera = this.cam;
    this.holes = []; this.input = { x: 0, z: 0 }; this.keys = {}; this.running = false; this.paused = false;
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); this.wave.position.y = 0.05; s.add(this.wave);
    this.resize(); addEventListener('resize', () => this.resize());
    this.bindInput(canvas);
    this.clock = new THREE.Clock(); this.time = 0; this.camPos = new THREE.Vector3(0, 40, 40); this.shakeT = 0;
    this.renderer.setAnimationLoop(() => this.frame());
  }
  // Performance mode (shared by both players): native-or-lower resolution, no sun shadows.
  setPerf(on) { this.perf = on; this.dprMax = on ? 1 : Math.min(2, devicePixelRatio); this.dprMin = Math.min(on ? 0.75 : 1, this.dprMax); this.dpr = this.dprMax; this.renderer.setPixelRatio(this.dpr); this.resize(); this.sun.castShadow = !on; }
  // testing: jump the player's hole to the start of size n
  devSize(n) { if (!this.me || !this.me.isPlayer) return; const u = this.indoor ? 0.14 : 1, T = [1.2, 2.5, 5, 9, 16, 28], r = n <= 1 ? this.r0 : Math.min(this.indoor ? 2.4 : 18, T[n - 1] * 1.1 / 1.9 * u * 1.001); this.me.eaten = Math.max(0, (r * r - this.r0 * this.r0) * Math.PI / 0.5); this.me.r = r; }
  // 0..1 progress from the current size level to the next (1 at the top size)
  progress(h) { const u = this.indoor ? 0.14 : 1, T = [1.2, 2.5, 5, 9, 16, 28], t = this.capTier(h); if (t >= 6) { const lo = T[5] * 1.1 / 1.9 * u, hi = this.indoor ? 2.4 : 18; return Math.max(0, Math.min(1, (h.r - lo) / (hi - lo))); } const rr = x => x * 1.1 / 1.9 * u, lo = Math.max(t === 1 ? this.r0 : 0, rr(T[t - 1])), hi = rr(T[t]); return Math.max(0, Math.min(1, (h.r - lo) / (hi - lo))); }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  bindInput(el) {
    const joy = this.hooks.joy; let id = null, ox = 0, oy = 0;
    el.addEventListener('pointerdown', e => { if (!this.running || this.paused) return; id = e.pointerId; ox = e.clientX; oy = e.clientY; el.setPointerCapture(id); joy && joy(true, ox, oy, 0, 0); sfx.unlock(); });
    el.addEventListener('pointermove', e => { if (e.pointerId !== id) return; let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy), max = 70; if (l > max) { ox += dx * (1 - max / l); oy += dy * (1 - max / l); dx = e.clientX - ox; dy = e.clientY - oy; } this.input.x = dx / max; this.input.z = dy / max; joy && joy(true, ox, oy, dx, dy); });
    const up = e => { if (e.pointerId !== id) return; id = null; this.input.x = this.input.z = 0; joy && joy(false); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; if (e.key === 'Escape' && this.running) this.hooks.pause(); });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }

  async start(cfg) {
    this.cfg = cfg; this.running = false; this.paused = false;
    this.holes.forEach(h => h.remove(this.scene)); this.holes = []; this.critters.clear();
    const lvl = cfg.mode === 'list' ? LIST_LEVELS[cfg.level] : null; this.lvl = lvl;
    this.indoor = !!(lvl && lvl.room != null);
    if (this.indoor) {
      const room = await this.A.room(ROOMS[(lvl.room + visits * 4) % ROOMS.length]); visits++; this.roomName = room.name;
      this.world.buildRoom(room, this.A.hazards, 11 + cfg.level, this.renderer);
      this.scene.fog.color.set('#2b2162'); this.scene.background.set('#2b2162');
    } else {
      const hz = lvl && lvl.hazards ? Object.values(this.A.hazards).slice(0, lvl.hazards) : [];
      // Zen keeps its seed so a saved run (cfg.resume) rebuilds exactly the same town
      this.seed = cfg.mode === 'list' ? 20 + cfg.level : cfg.resume ? cfg.resume.seed : 7 + Math.floor(Math.random() * 1000);
      this.world.buildTown(this.seed, (w, R) => {
        const spots = w.blocks.filter(b => b.type !== 'harbour' && b.type !== 'stadium' && b.type !== 'plaza');
        hz.forEach(m => { const b = spots[Math.floor(R() * spots.length)], [x, z] = w.edgePoint(b, 1.2, R); w.add(m, x, z, R() * 6, 1); });
      });
      this.scene.fog.color.set('#bfe6f7'); this.scene.background.set('#bfe6f7');
    }
    this.cam.far = 0;
    const W = this.world, b = W.bounds;
    W.phys = new Phys(W, this.indoor ? 0.1 : 1);
    this.r0 = this.indoor ? 0.14 : 1.2;
    const st = this.indoor && W.start ? W.start : this.townStart();
    const me = this.addHole(0, cfg.skin, null, st[0], st[1]); me.isPlayer = true; me.name = 'You'; this.me = me;
    if (cfg.mode === 'rivals') RIVALS.forEach((rv, i) => { const a = i / 3 * Math.PI * 2 + 0.5, d = (b.maxX - b.minX) * 0.3; const h = this.addHole(i + 1, null, rv.color, Math.cos(a) * d, Math.sin(a) * d); h.name = rv.name; h.color = rv.color; h.bot = { t: 0, tx: h.x, tz: h.z }; });
    this.spawnCritters();
    this.timeLeft = cfg.mode === 'zen' ? Infinity : lvl ? 600 : 120;
    this.counts = {}; this.score = 0; this.tier = this.capTier(me); this.lastTick = 99; this.done = false;
    if (cfg.resume) this.restore(cfg.resume);
    this.goals = lvl ? lvl.items.map(([k, n]) => ({ k, n: Math.min(n, W.remaining(o => (o.m.hazard ? 'hazard' : kindOf(o.m)) === k)), got: 0, label: KIND_LABEL[k] })).filter(g => g.n > 0) : null;
    this.camPos.set(me.x, 20, me.z + 20); this.zoom = 1; this.idle = false;
    this.running = true; this.hud(); sfx.start(); if (this.indoor) this.hooks.toast('House Call: ' + this.roomName);
  }
  // Zen save: which objects are gone (their index in world.objs: the same seed builds the same list), plus the hole.
  snapshot() {
    const W = this.world, me = this.me, gone = [];
    W.objs.forEach((o, i) => { if (o.state === 3) gone.push(i); });
    return { v: 1, seed: this.seed, gone, eaten: me.eaten, score: this.score, counts: { ...this.counts }, x: +me.x.toFixed(2), z: +me.z.toFixed(2), pct: W.eatenArea / (W.totalArea || 1) };
  }
  restore(s) {
    const W = this.world, me = this.me;
    for (const i of s.gone || []) { const o = W.objs[i]; if (!o || o.state === 3) continue; o.state = 3; if (o.eatable) W.eatenArea += o.area; W.unbucket(o); W.write(o); }
    me.eaten = s.eaten || 0; me.r = this.radiusFor(me);
    if (Number.isFinite(s.x) && Number.isFinite(s.z)) { me.x = s.x; me.z = s.z; }
    this.score = s.score || 0; this.counts = { ...(s.counts || {}) }; this.tier = this.capTier(me);
  }
  addHole(slot, skin, solid, x, z) {
    const h = new Hole(this.scene, slot, skin || 'black', solid); h.x = x; h.z = z; h.eaten = 0; h.r = this.r0; h.vx = 0; h.vz = 0; h.inv = 0; h.dead = 0;
    h.onEat = o => this.ate(h, o); h.onStart = o => { if (h.isPlayer && o.fr > h.r * 0.3) h.pulse = 1; };
    this.holes.push(h); return h;
  }
  spawnCritters() {
    const C = this.critters, P = this.A.people, An = this.A.animals; if (!P && !An) return;
    const get = (L, id) => L && L.get(id), anyP = () => P && P.list.length ? P.get(P.list[Math.floor(Math.random() * P.list.length)].id) : null;
    if (this.indoor) { const b = this.world.bounds, area = { x: b.minX, z: b.minZ, w: b.maxX - b.minX, d: b.maxZ - b.minZ }; for (const id of ['animal_cat', 'animal_pug', 'animal_chick', 'animal_chick']) C.spawn(get(An, id), area.x + Math.random() * area.w, area.z + Math.random() * area.d, area); return; }
    const Wd = this.world;
    for (const bl of Wd.blocks) {
      const pave = { ...bl, pick: () => Wd.edgePoint(bl, 1.3) }, inner = { ...bl, pick: () => Wd.pointIn(bl) }, at = a => a.pick();
      const sp = (src, area) => { if (!src) return; const [x, z] = at(area); C.spawn(src, x, z, area); };
      if (['shops', 'houses', 'park', 'tower', 'station', 'plaza', 'harbour'].includes(bl.type) && Math.random() < 0.8) sp(anyP(), pave);
      if (bl.type === 'farm') for (const id of ['animal_cow', 'animal_horse', 'animal_sheep', 'animal_pig', 'animal_llama', 'animal_zebra', 'animal_hen', 'animal_chick']) sp(get(An, id), inner);
      if (bl.type === 'park' || bl.type === 'plaza') { sp(get(An, 'animal_pug'), inner); sp(anyP(), inner); }
      if (bl.type === 'houses' && Math.random() < 0.4) sp(get(An, 'animal_cat'), inner);
    }
  }
  // start on a pavement near the middle of town, never in the river, the sea or on the roundabout
  townStart() {
    const P = this.world.plan; let best = [-6, 6], bd = 1e9;
    for (const l of this.world.blocks) { if (l.type === 'plaza') continue; const [x, z] = this.world.edgePoint(l, -2.5); const d = Math.hypot(x, z); if (d < bd && !P.blocked(x, z, 3)) { bd = d; best = [x, z]; } }
    return best;
  }

  radiusFor(h) { return Math.min(this.indoor ? 2.4 : 18, Math.sqrt(this.r0 * this.r0 + h.eaten * 0.5 / Math.PI)); }
  // size N = every band up to N now fits whole (the fit test goes by the diagonal, ~1.1× the longest side)
  capTier(h) { const cap = h.r * 1.9 / 1.1 / (this.indoor ? 0.14 : 1); return Math.max(1, [1.2, 2.5, 5, 9, 16, 28].filter(t => t <= cap).length); }
  ate(h, o) {
    h.eaten += o.area * (h.isPlayer || !this.cfg.difficulty ? 1 : (DIFF[this.cfg.difficulty] || DIFF.easy).grow);
    if (!h.isPlayer) return;
    const t = tierOf(Math.max(o.m.w, o.m.d) * o.s / (this.indoor ? 0.14 : 1));
    sfx.gulp(t, o.id); this.score += Math.round(o.area * (this.indoor ? 400 : 10)) + 1;
    if (t >= 4 && this.shake) this.shakeT = Math.min(0.5, 0.15 + t * 0.05);
    if (o.fr > h.r * 0.35) this.hooks.float(o.m.name, o);
    const kind = o.m.hazard ? 'hazard' : kindOf(o.m); this.counts[kind] = (this.counts[kind] || 0) + 1; this.hooks.ate && this.hooks.ate(kind);
    if (this.goals) { const g = this.goals.find(g => g.k === kind && g.got < g.n); if (g) { g.got++; if (g.got === g.n) sfx.listItem(); } }
  }
  holeVsHole() {
    for (const a of this.holes) for (const b of this.holes) {
      if (a === b || !a.active || !b.active || b.inv > 0 || a.r < b.r * 1.2) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.r - b.r * 0.3) {
        const D = DIFF[this.cfg.difficulty] || DIFF.easy, lost = b.eaten * (b.isPlayer ? D.bite : 0.3); b.eaten -= lost; a.eaten += (lost + b.r * b.r) * (a.isPlayer ? 1 : D.grow); b.active = false; b.dead = 3;
        if (b.isPlayer) { sfx.eaten(); this.hooks.toast(a.name + ' gobbled you! Back in 3…'); } else if (a.isPlayer) { sfx.gotRival(); this.hooks.toast('You gobbled ' + b.name + '!'); }
      }
    }
  }
  respawn(h) {
    const bd = this.world.bounds; let best = null, bd2 = -1;
    for (let i = 0; i < 12; i++) { const x = bd.minX + 20 + Math.random() * (bd.maxX - bd.minX - 40), z = bd.minZ + 20 + Math.random() * (bd.maxZ - bd.minZ - 40); const d = Math.min(...this.holes.filter(o => o !== h && o.active).map(o => Math.hypot(o.x - x, o.z - z) - o.r)); if (d > bd2) { bd2 = d; best = [x, z]; } }
    h.x = best[0]; h.z = best[1]; h.active = true; h.inv = 2;
  }
  botThink(h, dt) {
    const B = h.bot, D = DIFF[this.cfg.difficulty] || DIFF.easy; B.t -= dt;
    if (B.t <= 0) {
      B.t = D.think[0] + Math.random() * (D.think[1] - D.think[0]); let best = null, score = 0;
      if (Math.random() < D.wander) { const bd = this.world.bounds; B.tx = h.x + (Math.random() - 0.5) * 40; B.tz = h.z + (Math.random() - 0.5) * 40; B.tx = Math.max(bd.minX, Math.min(bd.maxX, B.tx)); B.tz = Math.max(bd.minZ, Math.min(bd.maxZ, B.tz)); best = 'wander'; }
      if (best !== 'wander') for (const o of this.holes) { if (o === h || !o.active) continue; const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (o.r > h.r * 1.2 && d < o.r + 10) { B.tx = h.x + (h.x - o.x) * 3; B.tz = h.z + (h.z - o.z) * 3; best = 'flee'; break; }
        if (h.r > o.r * (o.isPlayer ? D.chase : 1.25) && o.inv <= 0 && d < D.sight) { const sc = 50 / (d + 1); if (sc > score) { score = sc; B.tx = o.x; B.tz = o.z; best = o; } } }
      if (best !== 'flee' && best !== 'wander') for (const o of this.world.near(h.x, h.z, D.sight)) { if (o.state || !o.eatable || o.fd > h.r * 0.95) continue; const d = Math.hypot(o.x - h.x, o.z - h.z), sc = o.area / (d + 2); if (sc > score) { score = sc; B.tx = o.x; B.tz = o.z; best = o; } }
      if (!best) { const bd = this.world.bounds; B.tx = bd.minX + Math.random() * (bd.maxX - bd.minX); B.tz = bd.minZ + Math.random() * (bd.maxZ - bd.minZ); B.t = 2; }
    }
    const dx = B.tx - h.x, dz = B.tz - h.z, l = Math.hypot(dx, dz) || 1, v = Math.min(1, l / 2);
    return [dx / l * v * D.speed, dz / l * v * D.speed];
  }
  speedFor(h) { return (this.indoor ? 1.1 : 6.5) * Math.pow(h.r / this.r0, 0.4); }

  frame() {
    const raw = this.clock.getDelta(), dt = Math.min(0.05, raw);
    if (this.running && !this.paused) this.step(dt);
    else if (!this.running && this.world.objs.length) {
      const me = !this.idle && this.me, range = me ? 40 + me.r * 10 : 1e9; // behind the results card only animate the crowd near the hole
      this.critters.update(dt, [], { x: me ? me.x : this.camPos.x, z: me ? me.z : this.camPos.z, range }, this.world.bounds, () => {}, this.world);
      if (this.idle) { xrayFocus.value.w = 0; if (this.cam.far !== 360) { this.cam.far = 360; this.cam.near = 1; this.cam.updateProjectionMatrix(); this.scene.fog.near = 120; this.scene.fog.far = 330; } this.spin += dt * 0.04; const d = 105; this.cam.position.set(Math.cos(this.spin) * d, 62, Math.sin(this.spin) * d); this.cam.lookAt(0, 0, 0); this.sun.position.set(80, 200, 60); this.sun.target.position.set(0, 0, 0); const sh = this.sun.shadow.camera; sh.left = sh.bottom = -200; sh.right = sh.top = 200; sh.far = 500; sh.updateProjectionMatrix(); }
    }
    this.world.lod(this.cam, this.perf, this.idle); this.shadowZoom();
    this.renderer.render(this.scene, this.cam);
    this.quality(raw);
  }
  // Zoomed right out: buildings-only shadows on a small shadow map (lod.js LOD.shadowFarD / shadowFarMap).
  shadowZoom() {
    const d = this.idle ? 1e3 : this.camD || 0, far = LOD.farShadows ? d > LOD.shadowNearD : d > LOD.shadowFarD;
    if (far === this._farSh && this.world.farShadows === far) return;
    this._farSh = far; LOD.farShadows = far; this.world.shadowMode(far);
    const n = far ? LOD.shadowFarMap : this.shadowMap, sh = this.sun.shadow;
    if (sh.mapSize.x !== n) { sh.mapSize.set(n, n); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  }
  // Adaptive resolution: drop the pixel ratio in steps while frames run long, creep back up when there's headroom.
  quality(raw) {
    if (document.hidden || raw > 0.25) return;
    this.ft = this.ft * 0.94 + raw * 1000 * 0.06; this.qT += raw;
    if (this.qT < 1.5) return; this.qT = 0;
    let d = this.dpr; if (this.ft > 30 && d > this.dprMin) d = Math.max(this.dprMin, d - 0.25); else if (this.ft < 18 && d < this.dprMax) d = Math.min(this.dprMax, d + 0.25);
    if (d !== this.dpr) { this.dpr = d; this.renderer.setPixelRatio(d); this.resize(); }
  }
  step(dt) {
    this.time += dt; const W = this.world, b = W.bounds, outro = this.outro != null;
    // outro: the clock has run out; everything keeps falling for a moment, then the results show
    if (outro) { this.outro -= dt; if (this.outro <= 0) { this.outro = null; this.running = false; this.critters.cheer(); const res = this.result; this.result = null; this.hooks.end(res); return; } }
    let ix = outro ? 0 : this.input.x, iz = outro ? 0 : this.input.z; const k = outro ? {} : this.keys;
    if (k.arrowleft || k.a) ix -= 1; if (k.arrowright || k.d) ix += 1; if (k.arrowup || k.w) iz -= 1; if (k.arrowdown || k.s) iz += 1;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    for (const h of this.holes) {
      if (!h.active) { h.dead -= dt; if (h.dead <= 0) this.respawn(h); h.update(dt); continue; }
      const [mx, mz] = h.isPlayer ? [ix, iz] : outro ? [0, 0] : this.botThink(h, dt), sp = this.speedFor(h);
      h.vx += (mx * sp - h.vx) * Math.min(1, dt * 8); h.vz += (mz * sp - h.vz) * Math.min(1, dt * 8);
      h.x = Math.max(b.minX + h.r * 0.5, Math.min(b.maxX - h.r * 0.5, h.x + h.vx * dt)); h.z = Math.max(b.minZ + h.r * 0.5, Math.min(b.maxZ - h.r * 0.5, h.z + h.vz * dt));
      const target = this.radiusFor(h); h.r += (target - h.r) * Math.min(1, dt * 4);
      if (h.inv > 0) { h.inv -= dt; h.setFlicker(Math.floor(h.inv * 10) % 2 !== 0); } else h.setFlicker(false);
      h.update(dt);
    }
    if (this.cfg.mode === 'rivals') this.holeVsHole();
    W.update(dt, this.holes, this.time);
    const me = this.me, range = 30 + me.r * 14;
    this.critters.update(dt, this.holes, { x: me.x, z: me.z, range }, b, (s) => sfx.critter(s), W);
    const t = this.capTier(me); if (t > this.tier) { this.tier = t; sfx.tierUp(); this.hooks.toast('Size ' + t + ': ' + TIER_LABEL[t]); this.wave.userData.t = 0; }
    this.fxWave(dt);
    this.camera(dt);
    if (this.timeLeft !== Infinity && !outro) { this.timeLeft = Math.max(0, this.timeLeft - dt); const s = Math.ceil(this.timeLeft); if (s <= 5 && s !== this.lastTick && s >= 0) { this.lastTick = s; sfx.tick(s === 0); } }
    this.hud();
    const pct = W.eatenArea / W.totalArea;
    if (!outro && this.timeLeft <= 0 || !outro && (this.goals && this.goals.length && this.goals.every(g => g.got >= g.n)) || (this.cfg.mode === 'zen' && pct >= 0.98)) this.end();
  }
  fxWave(dt) {
    const w = this.wave, u = w.userData; if (u.t == null) return; u.t += dt;
    const s = this.me.r * (1.1 + u.t * 4); w.scale.set(s, 1, s); w.position.x = this.me.x; w.position.z = this.me.z; w.material.opacity = Math.max(0, 0.9 - u.t * 1.5); if (u.t > 0.7) u.t = null;
  }
  camera(dt) {
    const me = this.me, D = this.camD = (this.indoor ? 2.2 : 13) + me.r * (this.indoor ? 10 : 12), tgt = new THREE.Vector3(me.x + me.vx * 0.25, D * 0.88, me.z + D * 0.62 + me.vz * 0.25);
    // tight near/far = no depth fighting; fog hides the far clip so the town just fades out
    if (Math.abs(this.cam.far - D * 7) > D * 0.5) { this.cam.far = D * 7; this.cam.near = Math.max(0.02, D * 0.04); this.cam.updateProjectionMatrix(); const f = this.scene.fog; f.near = this.indoor ? D * 8 : D * 3.2; f.far = this.indoor ? D * 14 : D * 6.8; }
    xrayFocus.value.w = 0;
    this.camPos.lerp(tgt, Math.min(1, dt * 3)); this.cam.position.copy(this.camPos);
    if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shakeT * me.r * 0.25; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    this.cam.lookAt(this.camPos.x, 0, this.camPos.z - D * 0.62);
    const sh = this.sun.shadow.camera, ext = D * 1.1; if (sh.right !== ext) { sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.near = 0.1; sh.far = D * 6 + 50; sh.updateProjectionMatrix(); }
    const tx = ext * 2 / this.sun.shadow.mapSize.x, sx = Math.round(me.x / tx) * tx, sz = Math.round(me.z / tx) * tx; // snap to shadow texels: no shimmer
    this.sun.position.set(sx + D * 0.8, D * 2.2 + 20, sz + D * 0.5); this.sun.target.position.set(sx, 0, sz);
  }
  rank() { return [...this.holes].sort((a, b) => b.eaten - a.eaten); }
  hud() { this.hooks.hud({ mode: this.cfg.mode, prog: this.progress(this.me), time: this.timeLeft, tier: this.capTier(this.me), r: this.me.r, score: this.score, goals: this.goals, pct: this.world.eatenArea / (this.world.totalArea || 1), rank: this.cfg.mode === 'rivals' ? this.rank() : null }); }
  end() {
    if (this.done) return; this.done = true; this.input.x = this.input.z = 0;
    const m = this.cfg.mode, res = { mode: m, level: this.cfg.level, counts: { ...this.counts }, score: this.score, tier: this.capTier(this.me), pct: this.world.eatenArea / this.world.totalArea };
    if (m === 'rush') res.stars = res.tier >= 6 ? 3 : res.tier >= 5 ? 2 : res.tier >= 3 ? 1 : 0;
    if (m === 'rivals') { res.place = this.rank().indexOf(this.me) + 1; res.stars = Math.max(0, 4 - res.place); }
    res.of = 3;
    // Shopping List: one star per group on the list that you finish (groups the town couldn't supply count as done)
    if (m === 'list') { const all = this.lvl.items.length, done = this.goals.filter(g => g.got >= g.n).length + (all - this.goals.length); res.stars = done; res.of = all; res.complete = done === all; }
    if (m === 'zen') res.stars = res.pct >= 0.7 ? 3 : res.pct >= 0.4 ? 2 : res.pct >= 0.15 ? 1 : 0; // Dan: 15 / 40 / 70%
    if (res.stars) sfx.fanfare();
    this.result = res; this.outro = this.running ? 0.9 : 0; if (!this.running || this.paused) { this.paused = false; this.running = true; }
  }
  toScreen(o) { const v = new THREE.Vector3(o.x, (o.h || 1), o.z).project(this.cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }
  // idle flyover behind the menus
  showcase() {
    this.running = false; this.idle = true; this.spin = this.spin || 0.6;
    this.holes.forEach(h => h.remove(this.scene)); this.holes = []; this.critters.clear();
    this.world.buildTown(7); this.scene.fog.color.set('#bfe6f7'); this.scene.background.set('#bfe6f7'); this.cam.far = 0;
    this.indoor = false; this.spawnCritters();
  }
}
