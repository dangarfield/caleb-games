// sail.js — 1b: open-sea sailing. Player ship (arcade physics), chase camera, HUD, wind compass,
// minimap + chart overlay, encounters (sightings, spyglass), towns, treasure sites, calendar.
import * as THREE from 'three';
import { createSeaWorld, VIEW_DIST } from './sail-world.js';
import { drawMinimap, openChart, relText, searchArea } from './sail-chart.js';
import { trackTarget, distText } from '../track.js';
import { swipeSteer } from '../swipe.js';

const SAIL_MULT = { full: 1, battle: 0.6, furl: 0.1 };
const SEA_SPEED = 1.5;                       // Dan: open-sea boats 50% faster, more arcadey
const SAIL_ORDER = ['furl', 'battle', 'full'];
const SIGHT_DIST = 215, SPAWN_DIST = 450, DESPAWN_DIST = 1150, MAX_AI = 2, ATTACK_DIST = 21; // halved (Dan)
const MORALE_COL = { Happy: '#9fd39a', Content: '#efe6d2', Grumbling: '#e3a95a', Mutinous: '#e07a6a' };

let ctx = null, W = null, S = null, root = null, sea = null, camera = null, player = null;
let hud = {}, chart = null, action = null, offResize = null, keyH = null;
let sailSetting = 'full';                    // remembered across visits this session
const steer = { port: false, star: false, key: 0, v: 0, swipe: 0 };
let unSwipe = null;
const P = { x: 0, z: 0, h: 0, v: 0, turnV: 0 };
const cam = { h: 0, x: 0, y: 0, z: 0, init: false };
let ai = [], encounterTimer = 0, wakeTimer = 0, hudTimer = 0, miniTimer = 0, groundCool = 0, lowMoraleCool = 0;
let townRing = null, treasureAsked = false, frozen = false, leaving = false, time = 0;
let navT = 0, navTgt = null, navArrivedKey = null, sinceEnter = 0;
// town rings are centred on the TOWN (not its harbour). The harbour sits ~74u off the town centre, so the
// prompt ring reaches ~40u past it; the bump ring is a little wider. Per town, so far-off harbours still fit.
const DIG_R = 30; // go-ashore-and-dig prompt distance (was 60)
const PROMPT_RING = 55, BUMP_PAD = 15, PILOT_RING = 110; // pilot slow-down reaches twice as far as the port prompt (Dan)
// prompt ring halved twice (Dan): towns sit ~14u inland, so a 55u ring round the town is reachable from the sea
const promptR = t => PROMPT_RING;
const bumpR = t => promptR(t) + BUMP_PAD;
/** The town whose ring we're nearest (distance measured from the town centre). → {town, dist, r, rb} */
function nearTown(x, z) {
  let best = null, bk = Infinity;
  for (const t of W.TOWNS) { const d = Math.hypot(t.x - x, t.z - z), r = promptR(t), k = d - r; if (k < bk) { bk = k; best = { town: t, dist: d, r, rb: r + BUMP_PAD }; } }
  return best;
}
let harbourSlow = false, debugRings = [], debugT = 0;
// pinch-to-zoom on the sea (remembered for the session); 1 = default chase view
const ZOOM_MIN = 0.6, ZOOM_MAX = 2.4;
let zoom = 1, zoomTgt = 1, unPinch = null;
const _v = new THREE.Vector3(), _look = new THREE.Vector3();

const mode = {
  enter(c, params = {}) {
    ctx = c; W = c.world; S = c.state;
    const career = S.career();
    if (!career) { ctx.go('title'); return; }
    reset();
    placePlayer(career, params);
    buildScene(career);
    buildHUD(career);
    career.location = { kind: 'sea', townId: nearestTownId() };
    ctx.audio.ambience && ctx.audio.ambience(true);
    // messages from the previous mode
    const msgs = [];
    if (params.fresh) msgs.push({ title: `Welcome aboard, Captain ${career.name}!`, text: 'Hold PORT or STARBOARD to steer. Tap the chart to see the whole Caribbean.' });
    if (params.defeated && !params.message) msgs.push({ title: 'Beaten, but still afloat', text: 'Your crew patched the ship and slipped away.' });
    if (params.message) msgs.push({ title: params.message });
    if (Array.isArray(params.messages)) for (const m of params.messages) msgs.push({ title: m });
    msgs.forEach((m, i) => setTimeout(() => { if (ctx && !leaving) ctx.ui.toast(m.text || '', { title: m.title, ms: 4200 }); }, 300 + i * 900));
    window.PLT_DEBUG && (window.PLT_DEBUG.sail = debugApi());
  },
  exit() {
    leaving = true;
    closeAction();
    if (chart) { chart.el.remove(); chart = null; }
    if (offResize) offResize(); offResize = null;
    if (keyH) { window.removeEventListener('keydown', keyH); window.removeEventListener('keyup', keyH); keyH = null; }
    if (unPinch) { unPinch(); unPinch = null; }
    if (unSwipe) { unSwipe(); unSwipe = null; }
    for (const s of ai) removeAI(s, true);
    ai = [];
    if (player) { try { player.dispose(); } catch (e) {} player = null; }
    if (sea) { try { sea.dispose(); } catch (e) { console.error(e); } sea = null; }
    ctx && ctx.audio.ambience && ctx.audio.ambience(false);
    root = null; camera = null; hud = {};
    if (window.PLT_DEBUG) delete window.PLT_DEBUG.sail;
  },
  suspend() { steer.port = steer.star = false; hud.port && hud.port.classList.remove('pressed'); hud.star && hud.star.classList.remove('pressed'); },
  resume() { const c = S.career(); if (!c) return; navT = 0; refreshHUD(c, true); refreshMinimap(c); },
  update(dt, t) {
    if (!sea || leaving) return;
    time = t;
    const c = S.career(); if (!c) return;
    if (!frozen) {
      sinceEnter += dt;
      stepPlayer(dt, c);
      stepAI(dt, c);
      if (leaving) return;
      stepCalendar(dt, c);
      if (leaving) return;
      checkTreasure(c); // treasure first: a dig site beats a nearby harbour
      checkTowns(c);
      stepEncounters(dt, c);
      if (leaving) return;
    }
    stepCamera(dt, frozen ? 0 : dt);
    sea.update(P.x, P.z, Math.sin(P.h), Math.cos(P.h), camera);
    sea.water.update(t);
    const wv = W.windVec(c.wind);
    player.update(dt, wv, sea.water, t);
    player.rotation.z += P.turnV * 0.1 * Math.min(1, P.v / 12); // lean into turns
    for (const s of ai) s.obj.update(dt, wv, sea.water, t);
    sea.fx.update(dt);
    // keep the save's position current (cheap)
    c.position.x = P.x; c.position.z = P.z; c.position.heading = P.h;
    stepNav(dt, c);
    stepDebug(dt, c);
    hudTimer -= dt; if (hudTimer <= 0) { hudTimer = 0.25; refreshHUD(c); }
    miniTimer -= dt; if (miniTimer <= 0) { miniTimer = 0.2; refreshMinimap(c); }
  },
};
export default mode;

function reset() {
  steer.port = steer.star = false; steer.key = 0; steer.v = 0;
  ai = []; encounterTimer = 10 + Math.random() * 8; wakeTimer = 0; hudTimer = 0; miniTimer = 0; groundCool = 0; lowMoraleCool = 0;
  navT = 0; navTgt = null; navArrivedKey = null; sinceEnter = 0; harbourSlow = false; debugRings = []; debugT = 0;
  modsCache = null; townRing = null; treasureAsked = false; frozen = false; leaving = false; action = null; chart = null; cam.init = false;
}

// ---------------------------------------------------------------- setup
function placePlayer(c, params) {
  let pos = null;
  if (params.fromTown && W.townById(params.fromTown)) pos = exitPoint(W.townById(params.fromTown));
  else if (c.position && isFinite(c.position.x)) pos = { x: c.position.x, z: c.position.z, heading: c.position.heading || 0 };
  if (!pos) pos = W.departurePoint(W.HOME_PORT[c.nation] || 'portroyal');
  if (!isFinite(pos.heading)) pos.heading = 0;
  // an old save (or an edge-of-chart port) can't strand us outside the playable area
  pos.x = Math.max(W.EDGE + 40, Math.min(W.WORLD_W - W.EDGE - 40, pos.x)); pos.z = Math.max(W.EDGE + 40, Math.min(W.WORLD_H - W.EDGE - 40, pos.z));
  P.x = pos.x; P.z = pos.z; P.h = pos.heading; P.v = params.fromTown ? 6 : 0; P.turnV = 0;
  c.position = { x: P.x, z: P.z, heading: P.h };
  if (params.fromTown) townRing = params.fromTown; // don't re-prompt the town we just left
}
/** Leaving port: just outside the enter ring (Dan), in clear water, bow pointing out to sea. */
function exitPoint(t) {
  const d = promptR(t) + 10;
  for (let k = 0; k <= 15; k++) for (const sgn of k ? [1, -1] : [1]) {
    const a = t.seaDir + sgn * k * 0.2, x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
    if (W.inBounds(x, z, W.EDGE + 40) && W.coastDist(x, z) >= 14) return { x, z, heading: a };
  }
  return W.departurePoint(t); // cramped harbour: fall back to the old open-water spot
}
function buildScene(c) {
  const T = ctx.engine.THREE || THREE;
  sea = createSeaWorld(ctx, { x: P.x, z: P.z, career: c });
  // safety: never start on land
  if (sea.landAt(P.x, P.z) || sea.landAt(P.x + Math.sin(P.h) * 6, P.z + Math.cos(P.h) * 6)) {
    const nt = W.nearestTown(P.x, P.z); const d = W.departurePoint(nt.town, 170);
    P.x = d.x; P.z = d.z; P.h = d.heading;
  }
  const flag = S.flagship(c);
  player = ctx.PLT.ships.create(flag.type, { nation: c.nation, sailState: sailSetting, seed: 7 });
  player.name = 'player_ship';
  player.position.set(P.x, 0, P.z); player.rotation.y = P.h;
  player.setDamage(1 - flag.hull / flag.hullMax);
  sea.root.add(player);
  camera = new T.PerspectiveCamera(50, ctx.engine.aspect(), 0.5, 1800);
  ctx.engine.setView(sea.scene, camera);
  const setPx = () => sea && sea.fx.setPixelScale(ctx.engine.size.h * ctx.engine.renderer.getPixelRatio(), 50);
  setPx(); offResize = ctx.engine.onResize(setPx);
  stepCamera(0, 0);
  // keyboard (desktop, no UI hints): A/D or ←/→ steer, W/S or ↑/↓ raise/lower sails, Space = prompt's main button (else spyglass)
  keyH = e => {
    const k = e.code, d = e.type === 'keydown';
    if (k === 'Space') e.preventDefault();   // stop a focused button 'clicking' on Space
    if (k === 'ArrowLeft' || k === 'KeyA') { steer.key = d ? 1 : (steer.key === 1 ? 0 : steer.key); e.preventDefault(); return; }
    if (k === 'ArrowRight' || k === 'KeyD') { steer.key = d ? -1 : (steer.key === -1 ? 0 : steer.key); e.preventDefault(); return; }
    if (!d || e.repeat || frozen || leaving) return;
    if (k === 'KeyW' || k === 'ArrowUp' || k === 'KeyS' || k === 'ArrowDown') {
      const i = SAIL_ORDER.indexOf(sailSetting) + ((k === 'KeyW' || k === 'ArrowUp') ? 1 : -1);
      if (i >= 0 && i < SAIL_ORDER.length) setSail(SAIL_ORDER[i]);
      e.preventDefault();
    } else if (k === 'Space') {
      e.preventDefault();
      if (chart) return;
      if (action && action.actions && action.actions.length) {
        const a = action.actions.find(x => x.primary) || action.actions[0];
        try { action.handle.close(); } catch (err) {}
        a.onTap();
      } else useSpyglass();
    }
  };
  window.addEventListener('keydown', keyH); window.addEventListener('keyup', keyH);
  unPinch = pinchZoom(ctx.engine.canvas);
  unSwipe = swipeSteer(ctx.engine.canvas, v => { steer.swipe = v; });
}

// two fingers on the open sea pinch the camera in and out (mouse wheel does the same on desktop)
function pinchZoom(el) {
  const pts = new Map(); let d0 = 0, z0 = 1;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const clampZ = z => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  const down = e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = spread(); z0 = zoomTgt; } };
  const move = e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && !frozen) zoomTgt = clampZ(z0 * d0 / spread()); // fingers apart = closer
  };
  const up = e => { pts.delete(e.pointerId); if (pts.size === 2) { d0 = spread(); z0 = zoomTgt; } };
  const wheel = e => { if (frozen) return; e.preventDefault(); zoomTgt = clampZ(zoomTgt * Math.exp(e.deltaY * 0.0015)); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}

// ---------------------------------------------------------------- physics
let modsCache = null, modsT = 0;
function modsOf(c) { if (!modsCache || time - modsT > 1 || time < modsT) { modsCache = S.modifiers(c); modsT = time; } return modsCache; }
function classOf(type) { return W.SHIP_CLASSES[type] || W.SHIP_CLASSES.sloop; }
function stepPlayer(dt, c) {
  const flag = S.flagship(c), cls = classOf(flag.type), mods = modsOf(c);
  const wind = c.wind, wf = W.windFactor(P.h, wind), wm = W.WIND_STRENGTHS[wind.strength].mult;
  const sailHealth = 0.65 + 0.35 * Math.max(0, Math.min(1, (flag.sails == null ? 100 : flag.sails) / 100));
  let target = cls.speed * W.KNOT * SEA_SPEED * SAIL_MULT[sailSetting] * wf * wm * mods.sailSpeed * sailHealth;
  // harbour pilot: heading into a harbour ring, ease to half speed and shorten sail so you glide in instead of crunching
  const nt = nearTown(P.x, P.z);
  const inbound = nt && nt.dist < PILOT_RING && ((nt.town.x - P.x) * Math.sin(P.h) + (nt.town.z - P.z) * Math.cos(P.h)) > 0;
  if (inbound !== harbourSlow) { harbourSlow = inbound; if (player) player.setSailState(inbound ? 'battle' : sailSetting); if (inbound) ctx.ui.toast(`Easing sail for ${nt.town.name} harbour.`, { ms: 1800 }); }
  if (inbound) target = Math.min(target, cls.speed * W.KNOT * SEA_SPEED * 0.5);
  const accel = target > P.v ? 0.9 : 1.2;
  P.v += (target - P.v) * (1 - Math.exp(-dt * accel));
  // steering (smoothed so it feels weighty but responsive)
  const input = (steer.port ? 1 : 0) - (steer.star ? 1 : 0) + steer.key + (frozen ? 0 : steer.swipe);
  const want = Math.max(-1, Math.min(1, input));
  steer.v += (want - steer.v) * (1 - Math.exp(-dt * 7));
  const topV = cls.speed * W.KNOT * SEA_SPEED;
  const rate = cls.turn * (0.45 + 0.55 * Math.min(1, P.v / (topV * 0.45)));
  P.turnV = steer.v;
  P.h += steer.v * rate * dt;
  if (P.h > Math.PI) P.h -= Math.PI * 2; else if (P.h < -Math.PI) P.h += Math.PI * 2;
  // move, with coast collision at the bow
  const fx = Math.sin(P.h), fz = Math.cos(P.h), half = player.userData.halfLength || 5;
  const nx = P.x + fx * P.v * dt, nz = P.z + fz * P.v * dt;
  groundCool -= dt;
  const bowX = nx + fx * half, bowZ = nz + fz * half;
  const outside = !W.inBounds(nx, nz);
  if (outside) {
    if (P.v > 2 && groundCool <= 0) { groundCool = 4; ctx.ui.toast('Nothing but open ocean that way. The current carries you back towards the islands.', { title: 'Edge of the chart' }); }
    // allow any move that doesn't take us further out, and let a current nudge us back in — never stuck
    const out = (x, z) => Math.max(0, W.EDGE - x, W.EDGE - z, x - (W.WORLD_W - W.EDGE), z - (W.WORLD_H - W.EDGE));
    if (out(nx, nz) <= out(P.x, P.z)) { P.x = nx; P.z = nz; } else P.v *= 0.6;
    const cx = Math.max(W.EDGE + 1, Math.min(W.WORLD_W - W.EDGE - 1, P.x)), cz = Math.max(W.EDGE + 1, Math.min(W.WORLD_H - W.EDGE - 1, P.z));
    const k = Math.min(1, dt * 1.5); P.x += (cx - P.x) * k; P.z += (cz - P.z) * k;
    if (!W.inBounds(P.x, P.z)) { P.x += Math.sign(cx - P.x) * 6 * dt; P.z += Math.sign(cz - P.z) * 6 * dt; }
  } else if (sea.landAt(bowX, bowZ) || W.coastDist(bowX, bowZ) < -40) {
    runAground(c, flag);
    if (leaving) return; // bumped into a town and went ashore
  } else { P.x = nx; P.z = nz; }
  player.position.x = P.x; player.position.z = P.z; player.rotation.y = P.h;
  // wake
  wakeTimer -= dt;
  if (P.v > 2.5 && wakeTimer <= 0) {
    wakeTimer = 0.06;
    _v.set(P.x - fx * (half + 0.6), 0.15, P.z - fz * (half + 0.6));
    sea.fx.wake.spawn(_v, { count: P.v > 14 ? 3 : 2, size: 0.8 + P.v / 30 });
    if (P.v > 10 && Math.random() < 0.35) { _v.set(P.x + fx * half, 0.3, P.z + fz * half); sea.fx.wake.spawn(_v, { count: 2, size: 0.8, speed: 1.4 }); }
  }
}
function runAground(c, flag) {
  // bumping into a town's coast = sailing into its harbour (sneaking in if they're hostile)
  const nt = nearTown(P.x, P.z);
  if (nt && sinceEnter > 4 && !leaving && nt.dist < nt.rb && !nearDigSite(c, 75)) {
    P.v = 0;
    const t = W.townInfo(nt.town, c);
    ctx.audio.play('bell', { caption: 'Harbour bell' });
    go('port', isHostile(c, t.nation) ? { townId: nt.town.id, sneak: true } : { townId: nt.town.id });
    return;
  }
  const hit = P.v;
  P.v = 0;
  // nudge back out to sea along the coast normal
  const e = 3, gx = sea.shallowAt(P.x - e, P.z) - sea.shallowAt(P.x + e, P.z), gz = sea.shallowAt(P.x, P.z - e) - sea.shallowAt(P.x, P.z + e);
  const l = Math.hypot(gx, gz); if (l > 1e-4) { P.x += gx / l * 0.6; P.z += gz / l * 0.6; }
  if (hit > 3 && groundCool <= 0) {
    groundCool = 3;
    const dmg = Math.max(2, Math.round(hit * 0.35));
    flag.hull = Math.max(1, flag.hull - dmg);
    player.setDamage(1 - flag.hull / flag.hullMax);
    ctx.audio.play('thud', { caption: 'Crunch!' }); ctx.audio.play('creak', { caption: false });
    _v.set(P.x + Math.sin(P.h) * 5, 0.4, P.z + Math.cos(P.h) * 5); sea.fx.woodSplinters.spawn(_v); sea.fx.splash.spawn(_v, { count: 14 });
    ctx.ui.toast(`The hull took ${dmg} damage. Steer back into deep water.`, { title: 'Run aground!' });
  }
}

// ---------------------------------------------------------------- camera
function stepCamera(dt, sdt) {
  const k = cam.init ? 1 - Math.exp(-dt * 2.2) : 1;
  let dh = P.h - cam.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  cam.h += dh * k;
  zoom += (zoomTgt - zoom) * (cam.init ? 1 - Math.exp(-dt * 8) : 1);
  const back = (38 + P.v * 0.25) * zoom, up = 12 * zoom + Math.max(0, zoom - 1) * 16; // zoomed out = a bit higher too
  const swing = P.turnV * 0.18; // swings out slightly with turns
  const ch = cam.h - swing;
  const tx = P.x - Math.sin(ch) * back, tz = P.z - Math.cos(ch) * back, ty = up;
  const kp = cam.init ? 1 - Math.exp(-dt * 4) : 1;
  cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp; cam.z += (tz - cam.z) * kp;
  cam.init = true;
  camera.position.set(cam.x, cam.y, cam.z);
  _look.set(P.x + Math.sin(P.h) * 6, 2, P.z + Math.cos(P.h) * 6);
  camera.lookAt(_look);
}

// ---------------------------------------------------------------- calendar
function stepCalendar(dt, c) {
  const ev = S.advanceDays(dt / W.SECONDS_PER_DAY, { atSea: true }, c);
  for (const e of ev) {
    if (e.type === 'forcedRetire') { leaving = true; ctx.go('retire', { forced: true }); return; }
    if (e.type === 'birthday') ctx.ui.toast(e.age >= 50 ? 'Your old bones ache on the night watch.' : 'The crew sings you a sea shanty.', { title: `Happy birthday! You are ${e.age}.`, ms: 3500 });
    else if (e.type === 'retirePrompt') ctx.ui.toast('You can retire from any friendly port.', { title: 'You are getting on in years', ms: 4200 });
    else if (e.type === 'health') ctx.ui.toast(`Your health is now ${e.to.toLowerCase()}.`, { title: 'Captain’s health' });
    else if (e.type === 'wind') { ctx.ui.toast(`The wind blows from the ${W.compassName(c.wind.from)} now.`, { title: `Wind change · ${W.WIND_STRENGTHS[c.wind.strength].name}` }); }
    else if (e.type === 'hungry') ctx.ui.toast(`Only ${ctx.ui.plural(S.foodDays(c), 'day')} of food left. Find a port to buy more.`, { title: 'Food is running low' });
    else if (e.type === 'starving') { ctx.ui.toast('The food is gone and the crew is angry. Make for a port!', { title: 'Out of food!', ms: 4500 }); ctx.audio.play('bell'); }
  }
  lowMoraleCool -= dt;
  if (c.morale < 20 && lowMoraleCool <= 0) {
    lowMoraleCool = 45;
    ctx.ui.moment('moment-mutiny-warning', { title: 'The crew is close to mutiny', text: c.food <= 0 ? 'Hungry sailors grumble about mutiny. Buy food in port!' : 'Buy them a round at a tavern to cheer them up.', ms: 5200 });
  }
}

// ---------------------------------------------------------------- action toast (one at a time)
function showAction(kind, key, title, text, actions) {
  closeAction();
  const my = { kind, key };
  const wrapped = actions.map(a => ({ ...a, onTap: () => { if (action === my) action = null; a.onTap && a.onTap(); } }));
  my.actions = wrapped;
  my.handle = ctx.ui.toast(text, { title, actions: wrapped, cls: 'sl-action' });
  action = my;
  return my;
}
function closeAction(kind) {
  if (!action) return;
  if (kind && action.kind !== kind) return;
  try { action.handle.close(); } catch (e) {}
  action = null;
}
function go(mode, params) { if (leaving) return; leaving = true; closeAction(); ctx.go(mode, params); }

// ---------------------------------------------------------------- towns
function isHostile(c, nation) {
  const rel = W.relation(c.nation, nation, c.relations);
  return rel === 'war' || (c.standing[nation] || 0) <= -30;
}
function checkTowns(c) {
  const nt = nearTown(P.x, P.z);
  if (!nt) return;
  const id = nt.town.id;
  if (townRing && (townRing !== id || nt.dist > nt.r + 25)) { closeAction('town'); townRing = null; }
  if (nt.dist < nt.r && townRing !== id && !(action && action.kind === 'treasure') && !nearDigSite(c, 75)) {
    townRing = id;
    const t = W.townInfo(nt.town, c), nat = W.NATIONS[t.nation];
    const title = `${t.name} (${nat.name})`;
    ctx.audio.play('bell', { caption: 'Harbour bell' });
    if (isHostile(c, t.nation)) {
      showAction('town', id, title, `${nat.adj} guns guard this harbour. They are ${relText(c, t.nation).toLowerCase()}, so you'll have to slip in quietly.`, [
        { label: 'Sneak In', primary: true, onTap: () => go('port', { townId: id, sneak: true }) },
        { label: 'Sail On' },
      ]);
    } else {
      showAction('town', id, title, t.nation === c.nation ? 'A friendly harbour flying your own flag.' : 'The harbour master waves you in.', [
        { label: 'Enter Port', primary: true, onTap: () => go('port', { townId: id }) },
        { label: 'Sail On' },
      ]);
    }
  }
  if (!townRing) c.location.townId = id;
}

// ---------------------------------------------------------------- treasure
/** Are we close to the marked treasure's dig site? (then harbours never grab us) */
function nearDigSite(c, r) {
  const area = searchArea(c); if (!area) return false;
  const q = area.quest;
  return Math.min(Math.hypot(q.site.x - P.x, q.site.z - P.z), Math.hypot(q.site.beach.x - P.x, q.site.beach.z - P.z)) < r;
}
function checkTreasure(c) {
  const area = searchArea(c);
  if (!area) { treasureAsked = false; return; }
  const q = area.quest;
  const d = Math.min(Math.hypot(q.site.x - P.x, q.site.z - P.z) - 12, Math.hypot(q.site.beach.x - P.x, q.site.beach.z - P.z));
  if (d < DIG_R && !treasureAsked && (!action || action.kind === 'town')) {
    if (action) closeAction('town');
    treasureAsked = true;
    showAction('treasure', q.id, 'Go ashore and dig?', `This looks like the place on your map: ${q.name}.`, [
      { label: 'Dig!', primary: true, onTap: () => go('treasure', { questId: q.id }) },
      { label: 'Not now' },
    ]);
  } else if (d > DIG_R * 2.3) { treasureAsked = false; closeAction('treasure'); }
}

// ---------------------------------------------------------------- encounters
function aggressive(c, e) {
  if (e.villainId || e.kind === 'pirate') return true;
  if (e.kind === 'warship' || e.kind === 'privateer') return isHostile(c, e.nation);
  return false;
}
function spawnPoint() {
  for (let k = 0; k < 24; k++) {
    const a = P.h + (Math.random() * 2 - 1) * (k < 12 ? 1.2 : Math.PI), d = SPAWN_DIST + Math.random() * 60;
    const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
    if (x < 40 || z < 40 || x > W.WORLD_W - 40 || z > W.WORLD_H - 40) continue;
    if (W.coastDist(x, z) > 35 && !sea.landAt(x, z)) return { x, z };
  }
  return null;
}
function rollEnemy(c) {
  const mods = modsOf(c);
  // villains roam near their haunts (and occasionally anywhere)
  const free = W.VILLAINS.filter(v => !(c.villainsCaught || []).includes(v.id));
  const near = free.filter(v => { const t = W.townById(v.haunt); return t && Math.hypot(t.x - P.x, t.z - P.z) < 900; });
  if (free.length && Math.random() < (near.length ? 0.22 : 0.05)) return W.villainShip(W.pick(Math.random, near.length ? near : free));
  return W.rollEncounter(Math.random, { x: P.x, z: P.z, enemySkill: mods.enemySkill });
}
function spawnEncounter(c, enemy) {
  const p = spawnPoint(); if (!p) return null;
  const e = enemy || rollEnemy(c);
  const obj = ctx.PLT.ships.create(e.type, { nation: e.nation, sailState: 'full', seed: W.hash(e.id) });
  obj.name = 'ai_ship';
  const agg = aggressive(c, e);
  // passers aim for a point beside the player's course, then carry on
  const side = Math.random() < 0.5 ? -1 : 1, lead = 120 + Math.random() * 120;
  const tx = P.x + Math.sin(P.h) * lead + Math.cos(P.h) * side * (70 + Math.random() * 90), tz = P.z + Math.cos(P.h) * lead - Math.sin(P.h) * side * (70 + Math.random() * 90);
  const s = { enemy: e, obj, x: p.x, z: p.z, h: Math.atan2(tx - p.x, tz - p.z), v: 0, agg, tx, tz, passed: false, sighted: false, ignored: false, avoid: 0 };
  s.v = classOf(e.type).speed * W.KNOT * SEA_SPEED * 0.6;
  obj.position.set(s.x, 0, s.z); obj.rotation.y = s.h;
  sea.root.add(obj);
  ai.push(s);
  return s;
}
function removeAI(s, quiet) {
  if (action && action.kind === 'sight' && action.key === s.enemy.id) closeAction();
  try { s.obj.dispose(); } catch (e) {}
  if (s.obj.parent) s.obj.parent.remove(s.obj);
  if (!quiet) ai.splice(ai.indexOf(s), 1);
}
function stepEncounters(dt, c) {
  encounterTimer -= dt;
  if (encounterTimer <= 0) {
    encounterTimer = 18 + Math.random() * 20;
    if (ai.length < MAX_AI && !townRing) spawnEncounter(c);
  }
}
function stepAI(dt, c) {
  const wind = c.wind;
  for (let i = ai.length - 1; i >= 0; i--) {
    const s = ai[i], cls = classOf(s.enemy.type);
    const dx = P.x - s.x, dz = P.z - s.z, dist = Math.hypot(dx, dz);
    if (dist > DESPAWN_DIST) { removeAI(s); continue; }
    // where to go
    let gx, gz;
    if (s.agg && !s.ignoredLong) { gx = P.x + Math.sin(P.h) * P.v * 1.5; gz = P.z + Math.cos(P.h) * P.v * 1.5; }
    else {
      if (!s.passed && Math.hypot(s.tx - s.x, s.tz - s.z) < 50) s.passed = true;
      if (s.passed) { gx = s.x + Math.sin(s.h) * 100; gz = s.z + Math.cos(s.h) * 100; } else { gx = s.tx; gz = s.tz; }
    }
    let want = Math.atan2(gx - s.x, gz - s.z);
    // land avoidance: probe ahead, swing toward the freer side
    const fx = Math.sin(s.h), fz = Math.cos(s.h);
    if (sea.landAt(s.x + fx * 45, s.z + fz * 45) || W.coastDist(s.x + fx * 45, s.z + fz * 45) < 6) {
      const l = W.coastDist(s.x + Math.sin(s.h + 0.7) * 45, s.z + Math.cos(s.h + 0.7) * 45), r = W.coastDist(s.x + Math.sin(s.h - 0.7) * 45, s.z + Math.cos(s.h - 0.7) * 45);
      s.avoid = l > r ? 1 : -1; s.avoidT = 1.2;
    }
    if (s.avoidT > 0) { s.avoidT -= dt; want = s.h + s.avoid * 1.2; }
    let dh = want - s.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    const tr = cls.turn * 0.75;
    s.h += Math.max(-tr * dt, Math.min(tr * dt, dh));
    const tv = cls.speed * W.KNOT * SEA_SPEED * (s.agg ? 0.85 : 0.7) * Math.max(0.55, W.windFactor(s.h, wind));
    s.v += (tv - s.v) * (1 - Math.exp(-dt * 0.6));
    const nx = s.x + Math.sin(s.h) * s.v * dt, nz = s.z + Math.cos(s.h) * s.v * dt;
    if (!sea.landAt(nx + Math.sin(s.h) * 6, nz + Math.cos(s.h) * 6)) { s.x = nx; s.z = nz; } else { s.v *= 0.3; s.avoidT = 1.5; s.avoid = s.avoid || 1; }
    s.obj.position.x = s.x; s.obj.position.z = s.z; s.obj.rotation.y = s.h;
    s.obj.visible = dist < VIEW_DIST;
    // sighting
    if (!s.sighted && dist < SIGHT_DIST) { s.sighted = true; sighting(c, s, false); }
    // pirates who catch you force a fight
    if (s.agg && dist < ATTACK_DIST) { ctx.audio.play('cannon'); go('battle', { enemy: s.enemy, attacked: true }); return; }
  }
}
function dirText(s) { return W.compassWord(W.bearingOf(s.x - P.x, s.z - P.z)); }
function shipTitle(s) {
  const e = s.enemy;
  if (e.villainId) return `${e.captain} aboard the ${e.name}`;
  return W.describeShip(e).title;
}
function sighting(c, s, viaGlass) {
  if (action && (action.kind === 'town' || action.kind === 'treasure')) return;
  const e = s.enemy, d = W.describeShip(e);
  const title = `Sail ho! ${cap(shipTitle(s))} to the ${dirText(s)}`;
  let text = d.note;
  if (viaGlass) text = `${kindLabel(e)} · ${W.NATIONS[e.nation].name} · ${W.SHIP_CLASSES[e.type].name} · about ${e.crew} crew and ${e.guns} guns. ${Math.round(Math.hypot(s.x - P.x, s.z - P.z) / 10) * 10} yards away.`;
  ctx.audio.play('bell', { caption: 'Sail ho!' });
  showAction('sight', e.id, title, text, [
    { label: 'Approach', primary: true, onTap: () => go('battle', { enemy: e }) },
    { label: 'Ignore', onTap: () => { s.ignored = true; if (s.agg && !e.villainId && Math.random() < 0.5) s.ignoredLong = true; } },
  ]);
}
const KIND_LABEL = { merchant: 'Merchant', warship: 'Warship', pirate: 'Pirate', privateer: 'Privateer', treasure: 'Treasure ship', smuggler: 'Smuggler' };
const kindLabel = e => (e.villainId ? 'Notorious pirate' : KIND_LABEL[e.kind] || 'Ship');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function useSpyglass() {
  const c = S.career(); if (!c) return;
  let best = null, bd = VIEW_DIST - 100;
  for (const s of ai) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } }
  ctx.audio.play('click', { caption: false });
  if (!best) { ctx.ui.toast('Nothing but sea and sky in every direction.', { title: 'Spyglass' }); return; }
  best.sighted = true;
  sighting(c, best, true);
}

// ---------------------------------------------------------------- HUD
// a little open book, drawn in SVG so it matches the gold-on-navy chrome
function logIcon(h) {
  const svg = h('svg', { viewBox: '0 0 32 32', width: 30, height: 30, 'aria-hidden': 'true' });
  svg.innerHTML = '<path d="M16 8c-3-2-7-2.6-11-2v18c4-.6 8 0 11 2 3-2 7-2.6 11-2V6c-4-.6-8 0-11 2z" fill="none" stroke="#f0d79a" stroke-width="2.2" stroke-linejoin="round"/>'
    + '<path d="M16 8v18" stroke="#f0d79a" stroke-width="2"/><path d="M8.5 11.5c2-.3 3.8 0 5 .7M8.5 15.5c2-.3 3.8 0 5 .7M18.5 12.2c1.2-.7 3-1 5-.7M18.5 16.2c1.2-.7 3-1 5-.7" stroke="#d9b36a" stroke-width="1.5" stroke-linecap="round"/>';
  return svg;
}
function buildHUD(c) {
  const { h } = ctx.ui;
  const t = (cls, txt) => h('div', { class: cls }, txt || '');
  hud.name = t('sl-name'); hud.sub = t('sl-sub'); hud.date = t('sl-date'); hud.loc = t('sl-loc');
  hud.morale = h('span', { class: 'sl-morale' });
  hud.windL = t('sl-wind'); hud.headL = t('sl-head');
  hud.needle = h('div', { class: 'sl-needle' }); hud.bow = h('div', { class: 'sl-bow' });
  hud.chips = {
    gold: ctx.ui.chip({ k: 'gold', v: '0', c: '#e0b44f' }), food: ctx.ui.chip({ k: 'food', v: '0', c: '#9fd39a' }),
    guns: ctx.ui.chip({ k: 'guns', v: '0', c: '#c4ccd6' }), ships: ctx.ui.chip({ k: 'ships', v: '1', c: '#d0685a' }),
  };
  hud.mini = h('canvas', { class: 'sl-mini-canvas', width: 356, height: 256 });
  hud.navArrow = h('div', { class: 'sl-nav-arrow' }); hud.navName = t('sl-nav-name'); hud.navSub = t('sl-nav-sub');
  hud.nav = h('button', { class: 'sl-nav glass', 'aria-label': 'Tracked quest', onTap: () => { if (!leaving) ctx.go('log', { tab: 'maps' }); } },
    h('div', { class: 'sl-nav-dial' }, hud.navArrow), h('div', { class: 'sl-col' }, hud.navName, hud.navSub));
  hud.port = h('button', { class: 'sl-steer sl-port', 'aria-label': 'Steer to port', onHold: [() => { steer.port = true; }, () => { steer.port = false; }] },
    h('span', { class: 'sl-arrow' }, '◀'));
  hud.star = h('button', { class: 'sl-steer sl-star', 'aria-label': 'Steer to starboard', onHold: [() => { steer.star = true; }, () => { steer.star = false; }] },
    h('span', { class: 'sl-arrow' }, '▶'));
  hud.sails = {};
  const sailBtn = (id, label) => (hud.sails[id] = h('button', { class: 'sl-sail-opt', dataset: { id }, onTap: () => setSail(id) }, label));
  root = ctx.ui.mount('sail', [
    // ship status stays in the header; wind + the tracked quest stack in a slim column against the left edge
    h('div', { class: 'sl-card glass' },
      h('div', { class: 'sl-avatar' }, (c.name || 'C').charAt(0)),
      h('div', { class: 'sl-col' }, hud.name, hud.sub),
      h('div', { class: 'sl-div' }),
      h('div', { class: 'sl-col' }, hud.date, hud.loc)),
    h('div', { class: 'sl-side' },
      h('div', { class: 'sl-compass' },
        h('div', { class: 'sl-dial' }, h('div', { class: 'sl-n' }, 'N'), hud.bow, hud.needle, h('div', { class: 'sl-hub' })),
        h('div', { class: 'sl-col' }, hud.windL, hud.headL)),
      hud.nav),
    hud.debug = h('div', { class: 'sl-debug' }),
    h('div', { class: 'sl-chips' }, hud.chips.gold, hud.chips.food, hud.chips.guns, hud.chips.ships),
    ctx.ui.menuButton(() => { if (!leaving) ctx.go('pause'); }),
    h('button', { class: 'sl-logbtn', 'aria-label': "Captain's Log", onTap: () => { if (!leaving) ctx.go('log', {}); } }, logIcon(h)),
    h('button', { class: 'sl-mini', 'aria-label': 'Open the chart', onTap: showChart }, hud.mini, h('span', { class: 'sl-mini-tag' }, 'Tap to open')),
    h('div', { class: 'dock-steer sl-steer-dock' }, hud.port, hud.star),
    h('div', { class: 'dock-act sl-act-dock' },
      h('div', { class: 'sl-sails' }, h('div', { class: 'sl-sails-k' }, 'SAILS'), sailBtn('full', 'Full'), sailBtn('battle', 'Battle'), sailBtn('furl', 'Furl'))),
  ]);
  setSail(sailSetting, true);
  refreshHUD(c, true);
  refreshMinimap(c);
}
function setSail(id, quiet) {
  sailSetting = id;
  for (const k in hud.sails) hud.sails[k].classList.toggle('on', k === id);
  if (player) player.setSailState(id);
  if (!quiet) ctx.audio.play('creak', { caption: id === 'furl' ? 'Sails furled' : id === 'battle' ? 'Battle sails' : 'Full sail' });
}
const set = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
function refreshHUD(c, force) {
  if (!root) return;
  const flag = S.flagship(c), cls = classOf(flag.type), ml = S.moraleLabel(c.morale);
  set(hud.name, flag.name);
  if (force || hud._crew !== c.crew || hud._ml !== ml || hud._cls !== cls.name || hud._guns !== flag.guns) {
    hud._crew = c.crew; hud._ml = ml; hud._cls = cls.name; hud._guns = flag.guns;
    hud.sub.replaceChildren(`${cls.name} · ${S.flagship(c).guns} guns · ${cls.cargo} t · ${c.crew} crew · `, Object.assign(hud.morale, { textContent: ml }));
    hud.morale.style.color = MORALE_COL[ml] || '#efe6d2';
  }
  set(hud.date, S.fmtDate(c.date));
  set(hud.loc, W.placeName(P.x, P.z));
  const bearingFrom = c.wind.from, wf = W.windFactor(P.h, c.wind);
  set(hud.windL, `Wind ${W.compassName(bearingFrom)} · ${W.WIND_STRENGTHS[c.wind.strength].name}`);
  const kn = Math.round(P.v / W.KNOT * 10) / 10;
  set(hud.headL, `Heading ${W.compassName(W.headingToBearing(P.h))} · ${kn < 1 && P.v > 0.05 ? kn.toFixed(1) : Math.round(kn)} knots${wf < 0.65 && sailSetting !== 'furl' ? ' · into the wind' : ''}`);
  hud.headL.classList.toggle('slow', wf < 0.4);
  hud.needle.style.transform = `rotate(${(bearingFrom + 180) % 360}deg)`; // arrow shows where the wind blows
  hud.bow.style.transform = `rotate(${W.headingToBearing(P.h)}deg)`;
  hud.chips.gold.set(ctx.ui.fmt(c.gold));
  hud.chips.food.set(ctx.ui.fmt(c.food));
  hud.chips.food.classList.toggle('low', S.foodDays(c) < 5);
  hud.chips.guns.set(String(c.fleet.reduce((s, f) => s + (f.guns || 0), 0)));
  hud.chips.ships.set(String(c.fleet.length));
}
// ---------------------------------------------------------------- debug: harbour rings + distances (Settings → Show distances)
function debugOn() { return S.settings().debug === true; } // testing aid, off (no setting any more); flip in state.js to bring it back
function ringLine(r, color, opacity, width = 2.4) {
  // a flat dashed ring lying on the sea (WebGL lines are only 1px, too thin to see)
  const N = Math.max(24, Math.round(r / 6)), pos = [], idx = [], hw = width / 2;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = a0 + Math.PI * 2 / N * 0.55, b = pos.length / 3;
    for (const a of [a0, a1]) { const sx = Math.sin(a), cz = Math.cos(a); pos.push(sx * (r - hw), 0, cz * (r - hw), sx * (r + hw), 0, cz * (r + hw)); }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const l = new THREE.Mesh(g, m); l.renderOrder = 5; l.frustumCulled = false; return l;
}
function stepDebug(dt, c) {
  const on = debugOn();
  if (hud.debug) hud.debug.classList.toggle('on', on);
  debugT -= dt; if (debugT > 0) return; debugT = 0.25;
  // rings at harbours within view: gold = harbour prompt + half-speed zone, faint = bump-into-coast-enters-port zone
  if (on) {
    for (const t of W.TOWNS) {
      const near = Math.hypot(t.x - P.x, t.z - P.z) < 1100;
      let d = debugRings.find(x => x.id === t.id);
      if (near && !d) {
        const grp = new THREE.Group(); grp.position.set(t.x, 1.4, t.z);
        grp.add(ringLine(promptR(t), 0xf0d79a, 0.9, 3), ringLine(bumpR(t), 0xffffff, 0.5, 2));
        sea.root.add(grp); d = { id: t.id, grp }; debugRings.push(d);
      } else if (!near && d) { disposeRing(d); debugRings = debugRings.filter(x => x !== d); }
    }
  } else if (debugRings.length) { debugRings.forEach(disposeRing); debugRings = []; }
  if (!on || !hud.debug) return;
  const nt = nearTown(P.x, P.z), lines = [];
  if (nt) lines.push(`${nt.town.name}: ${Math.round(nt.dist)} from town · prompt < ${Math.round(nt.r)} · bump < ${Math.round(nt.rb)}${harbourSlow ? ' · SLOW' : ''}`);
  for (const s of ai) {
    const d = Math.round(Math.hypot(s.x - P.x, s.z - P.z));
    lines.push(`${s.enemy.name} (${s.enemy.kind}): ${d} · seen < ${SIGHT_DIST}${s.agg ? ` · attacks < ${ATTACK_DIST}` : ''}${s.sighted ? ' · sighted' : ''}`);
  }
  const area = searchArea(c);
  if (area) lines.push(`Dig site: ${Math.round(Math.min(Math.hypot(area.quest.site.x - P.x, area.quest.site.z - P.z) - 12, Math.hypot(area.quest.site.beach.x - P.x, area.quest.site.beach.z - P.z)))} · dig < ${DIG_R}`);
  hud.debug.replaceChildren(...lines.map(t => ctx.ui.h('div', null, t)));
}
function disposeRing(d) { d.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); d.grp.removeFromParent(); }

// ---------------------------------------------------------------- tracked quest arrow
function liveShips() { const out = []; for (const s of ai) if (s.enemy.villainId && s.obj.visible) out.push({ x: s.x, z: s.z, villainId: s.enemy.villainId }); return out; }
function stepNav(dt, c) {
  if (!hud.nav) return;
  navT -= dt;
  if (navT <= 0) {
    navT = 0.25;
    navTgt = trackTarget(c, liveShips());
    hud.nav.classList.toggle('on', !!navTgt);
    if (navTgt) {
      const d = Math.hypot(navTgt.x - P.x, navTgt.z - P.z);
      set(hud.navName, navTgt.name);
      set(hud.navSub, `${cap1(navTgt.where)} · ${distText(d)}`);
      const key = c.track.type + ':' + c.track.id;
      if (d < 90 && navArrivedKey !== key) {
        navArrivedKey = key;
        ctx.ui.toast(c.track.type === 'treasure' ? 'Sail close to the beach and go ashore to dig.' : c.track.type === 'villain' ? 'Keep your spyglass handy — he could be anywhere nearby.' : 'Enter the port to bring them home.', { title: `You've reached ${navTgt.where.replace(/^(near|held in) /, '')}!` });
      } else if (d > 160 && navArrivedKey === key) navArrivedKey = null;
    }
  }
  if (navTgt) {
    // the chase camera looks along the bow, so "up" on screen is straight ahead; + heading turns to port (left)
    let rel = Math.atan2(navTgt.x - P.x, navTgt.z - P.z) - P.h;
    while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    hud.navArrow.style.transform = `rotate(${(-rel).toFixed(3)}rad)`;
  }
}
const cap1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
function refreshMinimap(c) {
  if (!hud.mini) return;
  const ships = [];
  for (const s of ai) if (s.sighted && s.obj.visible) ships.push({ x: s.x, z: s.z, color: s.agg ? '#b3372c' : '#10202f' });
  drawMinimap(hud.mini, { x: P.x, z: P.z, heading: P.h, span: 1100, ships, career: c, target: navTgt });
}
function showChart() {
  if (chart || leaving) return;
  const c = S.career();
  frozen = true; steer.port = steer.star = false;
  closeAction(); townRing = null; treasureAsked = false; // re-prompt after the chart closes
  chart = openChart(root, { ui: ctx.ui, career: c, player: { x: P.x, z: P.z, heading: P.h }, target: trackTarget(c, liveShips()), onClose: () => { chart = null; frozen = false; } });
}

function nearestTownId() { const nt = W.nearestTown(P.x, P.z); return nt ? nt.town.id : null; }

// ---------------------------------------------------------------- test hooks
function debugApi() {
  return {
    get P() { return P; }, get ai() { return ai; }, get sea() { return sea; }, get camera() { return camera; }, get action() { return action && { kind: action.kind, key: action.key }; },
    teleport(x, z, h = P.h) { P.x = x; P.z = z; P.h = h; cam.init = false; },
    spawn(kind) {
      const c = S.career();
      const e = kind ? W.makeShip(Math.random, { kind, nation: kind === 'pirate' ? 'pirate' : 'spain', type: kind === 'treasure' ? 'galleon' : 'fluyt', note: 'Test ship' }) : null;
      const s = spawnEncounter(c, e); return s ? { x: s.x, z: s.z, id: s.enemy.id } : null;
    },
    bringClose(i = 0) { const s = ai[i]; if (!s) return false; s.x = P.x + Math.sin(P.h) * 150; s.z = P.z + Math.cos(P.h) * 150; return true; },
    chart: showChart, spyglass: useSpyglass, setSail,
    /** fast-forward the simulation (tests: swiftshader renders ~1 fps) */
    sim(sec, dt = 0.05) { for (let k = 0; k < sec / dt && sea && !leaving; k++) mode.update(dt, time + dt); },
  };
}
