/* main.js — Crazy Golf controller: screen flow, input, the frame loop, and the glue between
 * the Sim (physics.js), the diorama (scene.js) and the HTML screens (ui.js). */

import { Scene3D, STAGE_W, STAGE_H } from './scene.js';
import { buildWorld, Sim, BALL_R, DIFF } from './physics.js';
const StoreRef = () => window.ArcadeStore('crazy-golf');
import { HOLES, WORLD_IDS } from './holes.js';
import { PL, PIDS, WORLDS, PARS, SHOP, starsFor, resultType, CAP_OVER } from './data.js';
import { S, loadSave, save, prof, totalStars, worldOpen, recordHole, addGems, bestTotal, equippedItem } from './state.js';
import * as UI from './ui.js';
import { sfx } from './audio.js';
import { musicFor, musicState } from './music.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), elSky = $('sky'), elGl = $('gl'), elFog = $('fog'), elAim = $('aim'), elHud = $('hud'), elScreen = $('screen'), elToast = $('toast');
const settings = () => S.data.settings;
const E9 = () => Array(9).fill(null);
const MODALS = ['guide', 'shop', 'trophies'];
const SENS = [1.5, 2.5, 4, 6, 9];

const app = {
  screen: 'home', back: 'home', world: 0, hole: 0, cam: 'overhead',
  guideTab: 'hazards', shopTab: 'balls', shopSel: 0, trophyDiff: 'normal', shake: -1,
  round: null, lastResult: null, handoff: null, holeData: null, W: null, sim: null,
  strokes: 0, holeGems: 0, intro: 6, aim: null, dragging: false, pred: null, predAt: 0,
  live: true, loaded: null, finishing: false, holeDiff: 'normal',
  mode: () => settings().mode,
  lead: () => settings().player,
  other: (pid) => pid === 'caleb' ? 'ezra' : 'caleb',
  player() { return this.round ? this.round.order[this.round.turn] : this.lead(); },
  nextPlayerName() { return PL[this.other(this.player())].name; },
  thumb: (w) => thumbs[w] || '',
};
const thumbs = {};
const seenHoles = new Set();
let scene, scale = 1, timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

/* ---------------- layout ---------------- */
function fit() {
  scale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  const x = (innerWidth - STAGE_W * scale) / 2, y = (innerHeight - STAGE_H * scale) / 2;
  stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  if (scene) scene.setSize(STAGE_W, STAGE_H, Math.min(1.6, (devicePixelRatio || 1) * scale));
}
function stagePt(e) { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; }

/* ---------------- toast ---------------- */
let toastT = null;
function toast(msg) { elToast.innerHTML = UI.toastHTML(msg); clearTimeout(toastT); toastT = setTimeout(() => { elToast.innerHTML = ''; }, 1900); }

/* ---------------- 3D loading ---------------- */
function skins(pid) { return { ball: equippedItem(pid, 'balls'), putter: equippedItem(pid, 'putters'), flag: equippedItem(pid, 'flags'), cupR: DIFF[settings().diff].cupR }; }
function loadHole(w, h, pid, force) {
  const key = `${w}:${h}:${pid}:${settings().diff}:${JSON.stringify(prof(pid).equipped)}`;
  const hole = HOLES[WORLD_IDS[w]][h];
  app.holeData = hole;
  if (!force && app.loaded === key) return;
  app.W = buildWorld(hole);
  scene.load(WORLD_IDS[w], hole, app.W, { ...skins(pid), holeNum: h + 1 });
  app.loaded = key;
  setSky(WORLD_IDS[w]);
}
function setSky(id) { elSky.className = id ? 'sky-' + id : ''; elSky.innerHTML = UI.skyHTML(id); elFog.innerHTML = UI.fogHTML(id); }

/* ---------------- screens ---------------- */
function go(screen) {
  if (screen !== 'play') cancelAim();
  if (MODALS.includes(screen) && !MODALS.includes(app.screen)) app.back = app.screen;
  if (!['play', 'pause', 'result'].includes(screen)) clearTimers();
  app.screen = screen;
  if (screen === 'home') { app.round = null; menuScene(0, 0); }
  if (screen === 'holes') { menuScene(app.world, 0); later(() => { if (!thumbs[app.world]) { thumbs[app.world] = scene.snapshot(); if (app.screen === 'holes') render(); } }, 60); }
  render();
  const where = MODALS.includes(screen) ? app.back : screen;
  musicFor(WORLD_SCREENS.includes(where) ? WORLD_IDS[app.world] : null);
}
const WORLD_SCREENS = ['holes', 'intro', 'play', 'pause', 'result', 'scorecard', 'handoff'];
function menuScene(w, h) {
  loadHole(w, h, app.lead());
  app.sim = new Sim(app.W, { diff: settings().diff });
  scene.fly = null; Object.assign(scene.view, scene.fit, { mode: 'menu' }); scene.applyView();
}

function render() {
  const s = app.screen;
  const canvasOn = ['home', 'holes', 'intro', 'play', 'pause', 'result', 'scorecard'].includes(s);
  elGl.classList.toggle('hidden', !canvasOn); elSky.classList.toggle('hidden', !canvasOn); elFog.classList.toggle('hidden', !canvasOn);
  elGl.classList.toggle('blur', ['holes', 'scorecard', 'pause', 'result'].includes(s));
  app.live = ['home', 'intro', 'play'].includes(s);
  if (['holes', 'scorecard', 'pause', 'result'].includes(s)) scene.render();
  elHud.classList.toggle('hidden', s !== 'play');
  let html = '';
  switch (s) {
    case 'home': html = UI.home(app); break;
    case 'map': html = UI.map(app); break;
    case 'holes': html = UI.holes(app); break;
    case 'intro': html = UI.intro(app); break;
    case 'pause': html = UI.pause(app); break;
    case 'result': html = UI.result(app); break;
    case 'scorecard': html = UI.scorecard(app); break;
    case 'handoff': html = UI.handoff(app); break;
    case 'guide': html = UI.guide(app); break;
    case 'shop': html = UI.shop(app); break;
    case 'trophies': html = UI.trophies(app); break;
  }
  // settings taps re-render the same screen: don't replay its entrance animations
  elScreen.classList.toggle('same', s === lastRendered && ['pause', 'home', 'shop', 'guide', 'trophies'].includes(s));
  lastRendered = s;
  elScreen.innerHTML = html;
}
let lastRendered = null;

/* ---------------- round flow ---------------- */
function startRound(w, h) {
  const lead = app.lead(), order = app.mode() === 'pnp' ? [lead, app.other(lead)] : [lead];
  const z = () => Object.fromEntries(order.map(p => [p, 0]));
  app.round = { world: w, diff: settings().diff, order, turn: 0, scores: Object.fromEntries(order.map(p => [p, E9()])), hdiff: Object.fromEntries(order.map(p => [p, E9()])), hgems: Object.fromEntries(order.map(p => [p, E9()])), gems: z(), stars: z(), bests: {}, bestAt: Object.fromEntries(order.map(p => [p, bestTotal(p, w, settings().diff)])), start: h };
  app.world = w; app.hole = h;
  enterIntro();
}
function enterIntro() {
  loadHole(app.world, app.hole, app.player());
  app.sim = new Sim(app.W, { diff: settings().diff });
  app.cam = app.cam || 'overhead'; scene.setMode('overhead'); scene.flyIn();
  go('intro');
}
function startPlay() {
  clearTimers(); cancelAim();
  loadHole(app.world, app.hole, app.player());
  app.holeDiff = settings().diff;
  app.sim = new Sim(app.W, { diff: app.holeDiff });
  app.strokes = 0; app.holeGems = 0; app.finishing = false;
  scene.fly = null; scene.setMode(app.cam); scene.camSmooth = SENS[settings().camSens - 1];
  elHud.innerHTML = UI.hud(app);
  const key = `${app.world}:${app.hole}`;
  if (seenHoles.has(key)) setIntro(6);
  else {
    setIntro(0);
    [[1, 350], [2, 1150], [3, 1950], [5, 2750], [6, 4950]].forEach(([k, t]) => later(() => { if (app.screen === 'play' && app.intro < 6) setIntro(k); }, t));
  }
  go('play');
}
function setIntro(k) {
  app.intro = k;
  const vis = (id, step, off) => { const el = $(id); if (!el) return; const on = k >= step; el.style.opacity = on ? 1 : 0; el.style.transform = on ? 'none' : off; el.style.pointerEvents = on ? '' : 'none'; };
  const lab = (id, step, base) => { const el = $(id); if (!el) return; const on = k === step; el.classList.toggle('off0', !on); el.style.transform = (base || '') + (on ? ' scale(1)' : ' scale(.5)'); };
  vis('hPill', 1, 'translateY(-110px)'); vis('bPause', 2, 'scale(0)'); vis('bCam', 3, 'scale(0)');
  lab('lPill', 1, 'translateX(-50%)'); lab('lPause', 2); lab('lCam', 3);
  if ([1, 2, 3].includes(k)) sfx.pop();
  const hint = $('hHint');
  if (hint) {
    if (k === 5) {
      const b = app.sim.b, [sx, sy] = scene.toScreen(b.x, b.y, b.z);
      hint.className = ''; hint.innerHTML = `<div class="finger" style="left:${sx - 32}px;top:${sy - 32}px"></div><div class="hintpop" style="left:${sx - 150}px;top:${sy - 120}px">Pull back, then let go!</div>`;
    } else { hint.className = 'hidden'; hint.innerHTML = ''; }
  }
}
function updatePill() {
  const s = $('hStrokes'), g = $('hGems');
  if (s) s.textContent = app.strokes;
  if (g) g.textContent = prof(app.player()).gems + app.holeGems;
}

function finish(pickup) {
  if (app.finishing === 'done') return; app.finishing = 'done';
  const pid = app.player(), w = app.world, h = app.hole, par = PARS[w][h], strokes = app.strokes;
  const type = resultType(strokes, par, pickup), stars = starsFor(strokes, par);
  const gems = app.holeGems + stars + (type === 'hio' ? 10 : 0);
  const rec = recordHole(pid, w, h, strokes, app.holeDiff);
  addGems(pid, gems); if (type === 'hio') prof(pid).aces += 1;
  if (app.round) {
    const R = app.round;
    R.scores[pid][h] = strokes; R.hdiff[pid][h] = app.holeDiff; R.hgems[pid][h] = gems;
    R.gems[pid] = R.hgems[pid].reduce((a, v) => a + (v || 0), 0); R.stars[pid] += rec.newStars;
  }
  if (!save()) toast('Another Crazy Golf tab is open, so this one can\'t save');
  seenHoles.add(`${w}:${h}`);
  app.lastResult = { type, strokes, par, stars, gems, newStars: rec.newStars };
  go('result');
  if (type === 'hio') sfx.fanfare();
  else { (stars >= 2 ? sfx.good : sfx.meh)(); for (let k = 0; k < stars; k++) setTimeout(() => sfx.star(k), 500 + k * 280); }
}
function nextHole() {
  const R = app.round, h = app.hole;
  if (!R) { go('map'); return; }
  if (R.order.length === 1) {
    if (h >= 8) return endRound();
    app.hole = h + 1; enterIntro(); return;
  }
  const [a, b] = R.order;
  if (R.turn === 0) { app.handoff = { from: a, to: b, hole: h, newHole: false, turn: 1 }; go('handoff'); }
  else if (h >= 8) endRound();
  else { app.handoff = { from: b, to: a, hole: h + 1, newHole: true, turn: 0 }; go('handoff'); }
}
function endRound() {
  const R = app.round;
  for (const pid of R.order) {
    R.bests[pid] = { old: R.bestAt[pid], now: bestTotal(pid, R.world, R.diff) };
  }
  save();
  menuScene(app.world, 8);
  go('scorecard');
  sfx.good();
}

/* ---------------- aiming ---------------- */
function ballScreen() { const b = app.sim.b; return scene.toScreen(b.x, BALL_R, b.z); }
function onDown(e) {
  if (e.target.closest('[data-act]')) return;
  if (app.screen !== 'play' || !app.sim || app.sim.mode !== 'rest' || app.finishing) return;
  const p = stagePt(e), bs = ballScreen();
  if (app.intro < 6) { clearTimers(); setIntro(6); }
  if (app.dragging) return;                       // a second finger never takes over
  if (Math.hypot(p[0] - bs[0], p[1] - bs[1]) < 130) {
    app.dragging = true; app.pointerId = e.pointerId; try { elHud.setPointerCapture(e.pointerId); } catch (_) {}
    updateAim(p);
  }
}
function onMove(e) { if (app.dragging && e.pointerId === app.pointerId) updateAim(stagePt(e)); }
function onUp(e) {
  if (!app.dragging || (e && e.pointerId !== app.pointerId)) return;
  app.dragging = false;
  const a = app.aim; cancelAim();
  if (!a || a.power < 0.12) return;
  if (app.sim.shoot(a.dx, a.dz, a.power)) {
    app.strokes += 1; updatePill();
    scene.swingPutter(app.sim, a);
    sfx.putt(a.power);
    seenHoles.add(`${app.world}:${app.hole}`);
  }
}
function updateAim(p) {
  const b = app.sim.b, bs = ballScreen();
  const px = bs[0] - p[0], py = bs[1] - p[1], len = Math.hypot(px, py), power = Math.min(len / 200, 1);
  const g = scene.ground(p[0], p[1]);
  let dx, dz;
  if (g) { dx = b.x - g[0]; dz = b.z - g[1]; } else { dx = px; dz = py; }
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  app.aim = { dx, dz, power, fx: p[0], fy: p[1], len };
  const now = performance.now();
  if (now - app.predAt > 40) {
    app.predAt = now;
    app.pred = app.sim.predict(dx, dz, power, 40);
  }
}
function cancelAim() { app.aim = null; app.pred = null; app.dragging = false; elAim.innerHTML = ''; }
function drawAim() {
  const a = app.aim;
  if (!a || app.screen !== 'play') { if (elAim.innerHTML) elAim.innerHTML = ''; return; }
  const [bx, by] = ballScreen(), power = a.power;
  const color = power < .35 ? '#8BD94A' : power < .7 ? '#FFC93C' : power < .95 ? '#FF9F43' : '#FF6B57';
  const word = power < .35 ? 'Gentle' : power < .7 ? 'Medium' : power < .95 ? 'Strong!' : 'MAX!';
  // path dots sampled along the predicted roll
  let dots = '';
  const P = app.pred;
  if (P && P.length > 1) {
    const n = DIFF[app.holeDiff].dots, seg = []; let L = 0;
    for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); L += d; }
    for (let i = 0; i < n; i++) {
      let want = L * (i + 1) / 12, k = 0; while (k < seg.length && want > seg[k]) { want -= seg[k]; k++; }
      if (k >= seg.length) break;
      const u = want / (seg[k] || 1), x = P[k][0] + (P[k + 1][0] - P[k][0]) * u, z = P[k][1] + (P[k + 1][1] - P[k][1]) * u;
      const [sx, sy] = scene.toScreen(x, BALL_R, z), r = 9 - i * .35;
      dots += `<circle cx="${sx}" cy="${sy}" r="${r - 1.5}" fill="#FFF6E4" stroke="#0B3640" stroke-width="3" opacity="${1 - i / 14}"/>`;
    }
  }
  const C = 2 * Math.PI * 58, track = C * .75;
  const svg = `<svg width="1333" height="690" style="position:absolute;left:0;top:0;overflow:visible">${dots}
    <line x1="${bx}" y1="${by}" x2="${a.fx}" y2="${a.fy}" stroke="#0B3640" stroke-width="14" stroke-linecap="round"/>
    <line x1="${bx}" y1="${by}" x2="${a.fx}" y2="${a.fy}" stroke="#FFF6E4" stroke-width="8" stroke-dasharray="14 10" stroke-linecap="round"/>
    <circle cx="${bx}" cy="${by}" r="58" fill="none" stroke="#0B3640" stroke-width="22" stroke-linecap="round" stroke-dasharray="${track} ${C}" transform="rotate(135 ${bx} ${by})" opacity=".55"/>
    <circle cx="${bx}" cy="${by}" r="58" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${Math.max(.1, track * power)} ${C}" transform="rotate(135 ${bx} ${by})"/>
    <circle cx="${a.fx}" cy="${a.fy}" r="34" fill="none" stroke="#0B3640" stroke-width="4"/>
    <circle cx="${a.fx}" cy="${a.fy}" r="29.5" fill="rgba(255,246,228,.35)" stroke="#FFF6E4" stroke-width="5"/></svg>
    <div class="powerword" style="left:${bx - 80}px;top:${by - 118}px"><span style="background:${color}">${word}</span></div>`;
  elAim.innerHTML = svg;
}

/* ---------------- sim events ---------------- */
let lastWall = 0;
function handle(events) {
  const sim = app.sim;
  for (const e of events) {
    switch (e.type) {
      case 'wall': if (performance.now() - lastWall > 60) { sfx.wall(e.v); lastWall = performance.now(); } break;
      case 'bumper': sfx.bumper(); scene.hitBumper(e.h); break;
      case 'splash':
        if (e.kind === 'choc') { sfx.gloop(); scene.burst(e.x, 0.1, e.z, '#7A4A2A', 16, 2.6); toast('Chocolate splat! Try again'); }
        else if (e.kind === 'quick') { sfx.sinkSand(); scene.burst(e.x, 0.1, e.z, '#D9B77A', 14, 1.8); toast('Sucked into the quicksand! Try again'); }
        else if (e.kind === 'lava') { sfx.sizzle(); scene.burst(e.x, 0.1, e.z, '#FF8A2A', 16, 3); toast('Too hot! Try again'); }
        else { sfx.splash(); scene.burst(e.x, 0.1, e.z, '#7FD3EE', 18, 3.2); toast('Splash! Try again'); }
        break;
      case 'fall': sfx.fall(); toast('Whoops, it fell! Try again'); break;
      case 'penalty': break;   // the ball goes back where it was, with no extra stroke (Dan: no penalty)
      case 'portal': sfx.portal(); scene.burst(sim.b.x, 0.6, sim.b.z, '#FF5FD2', 12, 2); break;
      case 'portalOut': sfx.portalOut(); scene.burst(sim.b.x, 0.6, sim.b.z, '#4FF0E0', 12, 2); break;
      case 'idol': sfx.idol(); break;
      case 'idolOut': sfx.portalOut(); scene.burst(sim.b.x, 0.3, sim.b.z, '#C6BA9E', 10, 2); break;
      case 'cannonIn': sfx.cannonIn(); break;
      case 'boom': sfx.boom(); scene.kickCannon(); scene.burst(sim.b.x, 1.2, sim.b.z, '#E8E4DC', 16, 2.4, 1, 0.16); break;
      case 'land': sfx.land(); scene.burst(sim.b.x, 0.1, sim.b.z, '#F3D59C', 10, 1.6); break;
      case 'loop': sfx.loop(); break;
      case 'loopFail': sfx.loopFail(); toast('Hit it harder for the loop!'); break;
      case 'vine': sfx.vine(); break;
      case 'spook': sfx.spook(); break;
      case 'bonk': sfx.bonk(); break;
      case 'sweep': sfx.whack(); break;
      case 'ghostPass': sfx.ghostPass(); toast('Whoosh! Straight through!'); break;
      case 'gem': sfx.gem(); app.holeGems += 1; updatePill(); break;
      case 'lip': sfx.lip(); break;
      case 'sink': sfx.sink(); { const c = app.W.cup; scene.burst(c[0], 0.3, c[1], '#FFC93C', 22, 3.2); } break;
      case 'sunk': app.finishing = true; later(() => finish(false), 750); break;
      case 'rest':
        if (!app.finishing && app.strokes >= app.holeData.par + CAP_OVER && sim.mode === 'rest') {
          app.finishing = true; toast('Stroke cap! Ball picked up'); later(() => finish(true), 1300);
        }
        break;
    }
  }
}

/* ---------------- taps ---------------- */
const ACT = {
  go: (arg) => { if (arg === 'map' && ['pause', 'result'].includes(app.screen)) app.round = null; go(arg); },
  closeModal: () => { const b = app.back || 'home'; if (b === 'play') go('pause'); else go(b); },
  setMode: (v) => { settings().mode = v; save(); render(); },
  setDiff: (v) => { settings().diff = v; save(); render(); },
  pickPlayer: (id) => { settings().player = id; app.loaded = null; save(); if (app.screen === 'home') menuScene(0, 0); render(); },
  world: (i) => {
    i = +i;
    if (!worldOpen(app.lead(), i)) {
      const need = WORLDS[i].need - totalStars(app.lead());
      app.shake = i; render(); sfx.nope(); toast(`Earn ${need} more stars to open ${WORLDS[i].name}`);
      setTimeout(() => { app.shake = -1; if (app.screen === 'map') render(); }, 450); return;
    }
    app.world = i; go('holes');
  },
  pickHole: (i) => startRound(app.world, +i),
  startPlay: () => startPlay(),
  pause: () => { if (app.finishing) return; clearTimers(); if (app.intro < 6) setIntro(6); cancelAim(); go('pause'); },
  resume: () => { go('play'); },
  restartHole: () => { if (app.round && app.round.order.length > 1) return; startPlay(); },
  cam: () => {
    app.cam = app.cam === 'overhead' ? 'behind' : 'overhead'; scene.setMode(app.cam);
    const el = $('bCam'); if (el) el.innerHTML = UI.rb('cam', app.cam === 'overhead' ? 'camTop' : 'camBehind', { size: 76, isz: 40, bg: '#0F5A63', fg: '#FFF6E4', label: app.cam === 'overhead' ? 'Overhead' : 'Behind', lblStyle: 'font-size:18px' });
    toast(app.cam === 'overhead' ? 'Overhead view' : 'Behind-the-ball view');
  },
  sens: (d) => { settings().camSens = Math.max(1, Math.min(5, settings().camSens + +d)); scene.camSmooth = SENS[settings().camSens - 1]; save(); render(); },
  setProjection: (v) => { settings().projection = v; scene.setProjection(v); save(); render(); toast(v === 'persp' ? '3D view' : 'Flat view'); },
  sensTo: (k) => { settings().camSens = +k; scene.camSmooth = SENS[+k - 1]; save(); render(); },
  nextHole: () => nextHole(),
  handoffGo: () => { const h = app.handoff; app.round.turn = h.turn; app.hole = h.hole; enterIntro(); },
  againCourse: () => startRound(app.world, 0),
  guideTab: (v) => { app.guideTab = v; render(); },
  shopTab: (v) => { app.shopTab = v; app.shopSel = 0; render(); },
  shopSel: (i) => { app.shopSel = +i; render(); },
  shopAct: () => {
    const pid = app.lead(), P = prof(pid), tab = app.shopTab, it = SHOP[tab][app.shopSel];
    if (P.equipped[tab] === it.id) return;
    if (P.owned[tab].includes(it.id)) { P.equipped[tab] = it.id; save(); toast(`Now using ${it.name}!`); sfx.pop(); }
    else if (P.gems < it.price) { sfx.nope(); toast(`You need ${it.price - P.gems} more gems`); return; }
    else { P.gems -= it.price; P.owned[tab].push(it.id); P.equipped[tab] = it.id; save(); sfx.buy(); toast(`${it.name} is yours!`); }
    app.loaded = null; render();
  },
  trophyDiff: (v) => { app.trophyDiff = v; render(); },
};
function onTap(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const f = ACT[el.dataset.act]; if (!f) return;
  e.stopPropagation();
  if (el.dataset.act !== 'cam') sfx.tap();
  f(el.dataset.arg);
}

/* ---------------- frame loop ---------------- */
let last = performance.now();
const perf = { n: 0, t: 0 };
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const sim = app.sim;
  if (sim && (app.screen === 'play' || app.screen === 'intro' || app.screen === 'home')) {
    const ev = sim.update(dt);
    if (app.screen === 'play') handle(ev);
  }
  if (app.screen === 'play' && !scene.low && !location.search.includes('hq')) {       // weak tablet? drop shadows + resolution once
    perf.n++; perf.t += dt;
    if (perf.n === 120) { if (perf.t / perf.n > 1 / 38) scene.lowQuality(); }
  }
  if (app.live) {
    scene.update(dt, sim, sim ? sim.hz : 1, { aim: app.screen === 'play' ? app.aim : null, showRing: app.screen === 'play' && !app.aim });
    drawAim();
  }
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
function boot() {
  scene = new Scene3D(elGl);
  scene.setProjection(settings().projection);
  fit(); addEventListener('resize', fit);
  elHud.addEventListener('pointerdown', onDown);
  elHud.addEventListener('pointermove', onMove);
  elHud.addEventListener('pointerup', onUp);
  elHud.addEventListener('pointercancel', (e) => { if (e.pointerId === app.pointerId) cancelAim(); });
  stage.addEventListener('click', onTap);
  stage.addEventListener('scroll', () => { stage.scrollLeft = 0; stage.scrollTop = 0; });
  elScreen.addEventListener('scroll', () => { elScreen.scrollLeft = 0; elScreen.scrollTop = 0; });
  const flush = () => { save(); try { StoreRef().flush(); } catch (_) {} };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  addEventListener('pagehide', flush);
  document.getElementById('backBtn').addEventListener('click', flush);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  app.trophyDiff = settings().diff;
  go('home');
  requestAnimationFrame(frame);
  window.__cg = { app, scene, S, ACT, finish, nextHole, startRound, go, musicState };        // handy for desktop debugging
}
loadSave(boot);
