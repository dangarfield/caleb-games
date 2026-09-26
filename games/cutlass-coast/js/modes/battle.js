// battle.js — 1d: ship battle. Two ships, high orbit camera, broadsides, boarding, outcomes.
// Enter: {enemy} (world enemy object) or {enemy, afterDuel:true, duelWon:bool} (back from a boarding duel).
// Leaves: ctx.go('duel', {enemy, context:'boarding', returnTo:'battle', returnParams:{enemy, afterDuel:true}})
//         ctx.go('sail', {message, battle:type, defeated?}) after the outcome card (battle applies all results).
import * as THREE from 'three';
import { swipeSteer } from '../swipe.js';
import * as SIM from './battle-sim.js';
import * as OUT from './battle-outcome.js';

let ctx = null, root = null, B = null, scene = null, camera = null, world = null, offResize = null;
const hud = {};
const steer = { port: false, star: false, swipe: 0 };
let unSwipe = null;
const _cam = new THREE.Vector3(), _tgt = new THREE.Vector3(), _v = new THREE.Vector3(), _f = {}, _hit = {}, _c = {};

function onKey(e) {
  if (e.code === 'Space') e.preventDefault();
  if (!B || B.over) return;
  if (e.repeat && (e.code === 'Space' || e.code === 'KeyB')) return;
  const down = e.type === 'keydown';
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') steer.port = down;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') steer.star = down;
  else if (down && !e.repeat && ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
    const want = (e.code === 'KeyW' || e.code === 'ArrowUp') ? 'full' : 'battle';
    if (B.player.sail !== want) toggleSails();
  }
  else if (down && e.code === 'Space') { e.preventDefault(); playerFire(); }
  else if (down && e.code === 'KeyB' && B.boardable) startBoarding();
}

export default {
  enter(c, params = {}) {
    ctx = c; steer.port = steer.star = false;
    const career = ctx.state.career();
    if (!career) { ctx.go('title'); return; }
    const W = ctx.world;
    let enemy = params.enemy;
    if (!enemy) enemy = W.rollEncounter(Math.random, { x: career.position.x, z: career.position.z, enemySkill: ctx.state.modifiers().enemySkill });
    const afterDuel = !!params.afterDuel && typeof params.duelWon === 'boolean';
    B = newBattle(career, enemy, afterDuel);
    if (window.PLT_DEBUG) window.PLT_DEBUG.battle = () => ({ B, SIM, fire: playerFire, board: startBoarding, finish, steer, snap: () => frameCamera(1, 0), camera });
    buildScene();
    buildHud();
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    ctx.audio.ambience(true);
    if (afterDuel) {
      B.over = true; root.classList.add('bt-ended');
      if (params.duelWon) { B.enemy.sail = 'furl'; B.enemy.obj.setSailState('furl'); }
      B.later.push({ at: 0.9, fn: () => finish(params.duelWon ? 'capture' : 'defeat', { afterDuel: true }, true) });
    } else {
      const d = W.describeShip(enemy);
      ctx.ui.toast(enemy.villainId ? `${enemy.captain} commands her. Battle stations!` : `${d.note} Battle stations!`, { title: params.attacked ? `${enemy.name} attacks you!` : `${enemy.name} · ${cap(d.title)}`, ms: 3200 });
    }
  },
  exit() {
    if (unSwipe) { unSwipe(); unSwipe = null; }
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
    if (offResize) { offResize(); offResize = null; }
    if (hud.boardToast) { hud.boardToast.close(); hud.boardToast = null; }
    if (world) {
      try {
        world.fx.dispose(); world.pShip.dispose(); world.eShip.dispose(); world.sky.dispose(); world.water.dispose();
        world.swimGeo.dispose(); world.swimMat.dispose();
      } catch (e) { console.error(e); }
    }
    ctx.engine.clearView();
    world = null; scene = null; camera = null; B = null; root = null;
    for (const k in hud) delete hud[k];
  },
  update(dt, t) { if (B && world) tick(dt, t); },
  resume() { steer.port = steer.star = false; },
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- setup
function newBattle(career, enemy, afterDuel) {
  const S = ctx.state, W = ctx.world, mods = S.modifiers(career);
  const flag = S.flagship(career);
  const pCls = W.SHIP_CLASSES[flag.type] || W.SHIP_CLASSES.sloop, eCls = W.SHIP_CLASSES[enemy.type] || W.SHIP_CLASSES.sloop;
  const skill = Math.max(0.15, Math.min(1, (enemy.skill == null ? 0.7 : enemy.skill) * 0.7 + mods.enemySkill * 0.3));
  return {
    career, enemyData: enemy, mods, pCls, eCls, skill,
    speed: SIM.SPEED_SCALE[S.settings().battleSpeed] || 1,
    enemyDmgMult: 0.3 + mods.enemySkill * 0.7,
    t: 0, pending: [], later: [], over: false, shake: 0, surrenderT: 1.5, noContactT: 9, boardable: false, enemyBoardT: 0,
    hudT: 0, thudT: 0, warned: false, sinkFxT: 0, outcome: null, afterDuel,
    audio: ctx.audio,
  };
}

function buildScene() {
  const PLT = ctx.PLT, W = ctx.world, career = B.career, enemy = B.enemyData, flag = ctx.state.flagship(career);
  scene = new THREE.Scene();
  const sky = PLT.sky.create('day'); scene.add(sky.root);
  const water = PLT.water.create({ size: 520, segments: 64 }); scene.add(water.mesh);
  const fx = PLT.fx.create(scene); fx.cannonball.water = water;
  const pShip = PLT.ships.create(flag.type, { nation: career.nation, sailState: 'battle', seed: 7 });
  const eShip = PLT.ships.create(enemy.type, { nation: enemy.nation, sailState: 'full', seed: W.hash(String(enemy.id || enemy.name)) });
  scene.add(pShip, eShip);
  // little swimmers for a sinking crew (family-friendly: they swim for the boats)
  const swimGeo = new THREE.SphereGeometry(0.32, 8, 6), swimMat = new THREE.MeshStandardMaterial({ color: '#e8b48a', roughness: 0.8, flatShading: true });
  const swimmers = [];
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(swimGeo, swimMat); m.visible = false; scene.add(m); swimmers.push({ m, vx: 0, vz: 0, ph: Math.random() * 6 }); }
  world = { sky, water, fx, pShip, eShip, swimGeo, swimMat, swimmers };
  camera = new THREE.PerspectiveCamera(45, ctx.engine.aspect(), 1, 1500);
  ctx.engine.setView(scene, camera);
  unSwipe = swipeSteer(ctx.engine.canvas, v => { steer.swipe = v; });
  const setScale = () => fx.setPixelScale(ctx.engine.size.h * ctx.engine.renderer.getPixelRatio(), 45);
  setScale(); offResize = ctx.engine.onResize(setScale);

  // starting positions: enemy ~64 away, crossing; player has to turn to bring guns to bear
  const ang = Math.random() * Math.PI * 2, sep = B.afterDuel ? 0 : 64;
  let px = 0, pz = 0, ph = ang + 0.7, ex = Math.sin(ang) * sep, ez = Math.cos(ang) * sep, eh = ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  if (B.afterDuel) { // grappled side by side
    ph = ang; eh = ang; const pb = ctx.PLT.ships.TYPES[flag.type] ? ctx.PLT.ships.TYPES[flag.type].B : 3.2, eb = ctx.PLT.ships.TYPES[enemy.type] ? ctx.PLT.ships.TYPES[enemy.type].B : 3.2;
    const off = (pb + eb) * 0.5 + 0.6; ex = Math.cos(ang) * off; ez = -Math.sin(ang) * off;
  }
  const P = SIM.makeShipState(pShip, {
    isPlayer: true, cls: B.pCls, name: flag.name, nation: career.nation, type: flag.type, x: px, z: pz, h: ph, speed: B.afterDuel ? 0 : B.pCls.speed * 0.5,
    hull: flag.hull, hullMax: flag.hullMax, sails: flag.sails == null ? 100 : flag.sails, crew: career.crew, guns: flag.guns, sail: 'battle',
    speedMod: B.mods.sailSpeed * 1.2, reloadMod: B.mods.reload, // Dan: our ship is 20% quicker in battle
  });
  const E = SIM.makeShipState(eShip, {
    cls: B.eCls, name: enemy.name, kind: enemy.kind, nation: enemy.nation, type: enemy.type, x: ex, z: ez, h: eh, speed: B.afterDuel ? 0 : B.eCls.speed * 0.6,
    hull: enemy.hull == null ? B.eCls.hull : enemy.hull, hullMax: enemy.hullMax || B.eCls.hull, sails: enemy.sails == null ? 100 : enemy.sails, crew: enemy.crew, guns: enemy.guns || B.eCls.guns,
    skill: B.skill, sail: 'full', speedMod: ['merchant', 'treasure'].includes(enemy.kind) ? 0.9 : 1, // laden traders are a bit slower
  });
  E.villainId = enemy.villainId; E.crew0 = Math.max(E.crew, enemy.crew0 || 0) || 1;
  if (enemy.crew0) E.crew0 = enemy.crew0;
  B.player = P; B.enemy = E; B.ships = [P, E];
  B.fx = fx;
  B.onHit = onHit;
  B.crewMax = Math.max(P.crew, E.crew0, 1);
  for (const s of B.ships) { s.obj.setSailState(s.sail); refreshDamage(s); }
  // camera starts framed
  frameCamera(1, 0);
}

// ---------------------------------------------------------------- HUD
function buildHud() {
  const { h, bar } = ctx.ui, W = ctx.world, P = B.player, E = B.enemy, enemy = B.enemyData;
  const side = (s, mine) => {
    const bars = {
      hull: bar({ label: 'Hull', color: mine ? '#7fbf7a' : '#d0685a' }),
      crew: bar({ label: 'Crew', color: '#8fb8de', max: B.crewMax }),
      sails: bar({ label: 'Sails', color: '#e8dcc0' }),
    };
    const sub = mine ? `${B.pCls.name} · ${s.guns} guns · ${B.pCls.cargo} t` : `${cap(W.describeShip(enemy).title)} · ${s.guns} guns · ${B.eCls.cargo} t`;
    return { bars, el: h('div', { class: 'bt-side' + (mine ? ' mine' : ' theirs') },
      h('div', { class: 'bt-name-row' }, h('span', { class: 'bt-name' }, s.name), h('span', { class: 'bt-class' }, sub)),
      bars.hull, bars.crew, bars.sails) };
  };
  const mine = side(P, true), theirs = side(E, false);
  hud.mine = mine.bars; hud.theirs = theirs.bars;
  hud.tip = h('div', { class: 'bt-tip' }, '');
  hud.windNeedle = h('div', { class: 'bt-wind-needle' });
  hud.windText = h('div', { class: 'bt-wind-text' }, '');
  hud.portBtn = h('button', { class: 'bt-steer', 'aria-label': 'Turn to port', onHold: [() => { steer.port = true; }, () => { steer.port = false; }] },
    h('span', { class: 'bt-steer-ico' }, '◀'));
  hud.starBtn = h('button', { class: 'bt-steer', 'aria-label': 'Turn to starboard', onHold: [() => { steer.star = true; }, () => { steer.star = false; }] },
    h('span', { class: 'bt-steer-ico' }, '▶'));
  hud.sailBtn = h('button', { class: 'bt-sails', onTap: toggleSails }, 'Sails: Battle');
  hud.fireSub = h('span', { class: 'bt-fire-sub' }, '');
  hud.fireRing = undefined; // fresh buttons: force the first HUD write
  hud.fire = h('button', { class: 'bt-fire', 'aria-label': 'Fire broadside', onHold: [playerFire, null] },
    h('div', { class: 'bt-fire-in' }, h('span', { class: 'bt-fire-lbl' }, 'FIRE'), hud.fireSub));
  hud.labels = h('div', { class: 'bt-labels' });
  hud.labelPool = []; for (let i = 0; i < 8; i++) { const l = h('div', { class: 'bt-hitlbl' }); hud.labels.append(l); hud.labelPool.push(l); }
  hud.labelIdx = 0;
  hud.card = h('div', { class: 'bt-card-wrap' });
  root = ctx.ui.mount('battle', [
    hud.labels,
    h('div', { class: 'bt-h2h' }, mine.el, h('div', { class: 'bt-vs' }, 'vs'), theirs.el),
    hud.tip,
    h('div', { class: 'bt-wind glass' }, h('div', { class: 'bt-wind-dial' }, hud.windNeedle), hud.windText),
    ctx.ui.menuButton(() => ctx.go('pause')),
    h('div', { class: 'dock-steer bt-controls' }, hud.portBtn, hud.starBtn),
    h('div', { class: 'dock-act bt-controls bt-act' }, hud.sailBtn, hud.fire),
    hud.card,
  ]);
  const w = B.career.wind, W2 = ctx.world;
  const bearingTo = (w.from + 180) % 360; // needle points where the wind blows (camera is north-up)
  hud.windNeedle.style.transform = `rotate(${bearingTo}deg)`;
  hud.windText.replaceChildren(h('div', { class: 'bt-wind-a' }, `Wind ${W2.compassName(w.from)}`), h('div', { class: 'bt-wind-b' }, W2.WIND_STRENGTHS[w.strength].name));
  updateHud(true);
}

function toggleSails() {
  if (!B || B.over) return;
  const P = B.player; P.sail = P.sail === 'battle' ? 'full' : 'battle';
  P.obj.setSailState(P.sail);
  hud.sailBtn.textContent = P.sail === 'battle' ? 'Sails: Battle' : 'Sails: Full';
  ctx.audio.play('creak', { caption: false });
}

function playerFire() {
  if (!B || B.over) return;
  const P = B.player;
  SIM.facing(P, B.enemy, _f);
  if (!SIM.fireBroadside(B, P, _f.side)) { hud.fire.classList.add('bt-nope'); setTimeout(() => hud.fire && hud.fire.classList.remove('bt-nope'), 250); }
}

const ringBg = (p, on, off) => `conic-gradient(${on} 0 ${(p * 100).toFixed(1)}%, ${off} ${(p * 100).toFixed(1)}% 100%)`;
function updateHud(full) {
  const P = B.player, E = B.enemy;
  SIM.facing(P, E, _f);
  const side = _f.side, name = s => (s === 'L' ? 'Port' : 'Starboard');
  // the fire button fills with the reload of whichever side faces the enemy
  const rf = P.reload[side];
  // only touch the DOM when something visible changed (the reload ring moves in 2% steps)
  const ring = rf > 0 ? Math.round((1 - rf / P.reloadTime) * 50) : -1;
  if (ring !== hud.fireRing) {
    const was = hud.fireRing; hud.fireRing = ring;
    if ((was >= 0) !== (ring >= 0) || was === undefined) { hud.fireSub.textContent = ring >= 0 ? 'reloading' : ''; hud.fire.classList.toggle('loading', ring >= 0); }
    hud.fire.style.background = ring >= 0 ? ringBg(ring / 50, '#f0d79a', 'rgba(255,255,255,.14)') : '';
  }
  if (!full && B.hudT > 0) return;
  B.hudT = 0.1;
  const pct = (v, m) => Math.max(0, Math.round(v / m * 100));
  hud.mine.hull.set(pct(P.hull, P.hullMax), pct(P.hull, P.hullMax) + '%');
  hud.mine.crew.set(P.crew, String(Math.round(P.crew)));
  hud.mine.sails.set(P.sails, Math.round(P.sails) + '%');
  hud.theirs.hull.set(pct(E.hull, E.hullMax), pct(E.hull, E.hullMax) + '%');
  hud.theirs.crew.set(E.crew, String(Math.round(E.crew)));
  hud.theirs.sails.set(E.sails, Math.round(E.sails) + '%');
  // tip line
  let tip = '';
  const d = _f.dist;
  if (B.over) tip = '';
  else if (d > SIM.WARN_DIST) tip = E.ai.mode === 'flee' ? "She's getting away! Full sails!" : 'Nearly clear of the enemy';
  else if (d > SIM.MAX_RANGE) tip = E.ai.mode === 'flee' ? "She's running! Chase her down" : 'Out of range. Close in!';
  else if (_f.align < 0.8) tip = 'Turn to bring a broadside to bear';
  else if (rf > 0) tip = `Reloading the ${name(side).toLowerCase()} guns…`;
  else tip = 'Guns bear! FIRE!';
  if (hud.tipText !== tip) { hud.tipText = tip; hud.tip.textContent = tip; hud.tip.classList.toggle('hot', tip === 'Guns bear! FIRE!'); hud.tip.style.display = tip ? '' : 'none'; }
}

function hitLabel(pos, text, cls) {
  const l = hud.labelPool[hud.labelIdx]; hud.labelIdx = (hud.labelIdx + 1) % hud.labelPool.length;
  _v.copy(pos).project(camera);
  if (_v.z > 1) return;
  const r = ctx.engine.canvas.getBoundingClientRect();
  const p = ctx.ui.toStage(r.left + (_v.x + 1) / 2 * r.width, r.top + (1 - _v.y) / 2 * r.height);
  l.textContent = text; l.className = 'bt-hitlbl ' + cls;
  l.style.left = p.x + 'px'; l.style.top = p.y + 'px';
  void l.offsetWidth; l.classList.add('go');
}

// ---------------------------------------------------------------- battle events
function onHit(target, shooter, zone, pos) {
  // broadside damage grows sub-linearly with guns so a big ship is dangerous but a sloop can still survive a few volleys
  const balls = shooter ? Math.max(1, shooter.anchors.L.length) : 4;
  const mult = (shooter && shooter.isPlayer ? 1.25 : B.enemyDmgMult) / Math.pow(Math.max(1, balls / 4), 0.7);
  SIM.applyHit(target, zone, mult, _hit);
  B.fx.woodSplinters.spawn(pos, { count: zone === 'hull' ? 16 : 7 });
  if (zone === 'hull') B.fx.cannonSmoke.spawn(pos, { count: 2, size: 0.6 });
  if (B.thudT <= 0) { ctx.audio.play('thud', { caption: target.isPlayer ? 'We are hit!' : 'A hit!' }); B.thudT = 0.35; }
  if (target.isPlayer) { B.shake = Math.max(B.shake, 0.7); hitLabel(pos, zone === 'hull' ? 'Hit!' : 'Rigging!', 'ouch'); }
  else hitLabel(pos, zone === 'hull' ? (_hit.hull > 4 ? 'Great shot!' : 'Hit!') : 'Sails!', 'good');
  refreshDamage(target);
}
function refreshDamage(s) {
  const d = Math.max(0, Math.min(1, (1 - s.hull / s.hullMax) * 0.65 + (1 - s.sails / 100) * 0.45));
  if (Math.abs(d - s.dmgVis) > 0.04 || (d === 0 && s.dmgVis !== 0)) { s.dmgVis = d; s.obj.setDamage(d); }
}

function syncToCareer() {
  const c = B.career, f = ctx.state.flagship(c), P = B.player, E = B.enemy, e = B.enemyData;
  if (f) { f.hull = Math.max(1, Math.round(P.hull)); f.sails = Math.max(10, Math.round(P.sails)); }
  c.crew = Math.max(1, Math.round(P.crew));
  e.hull = Math.max(1, Math.round(E.hull)); e.sails = Math.round(E.sails); e.crew = Math.max(1, Math.round(E.crew)); e.crew0 = E.crew0;
}

function startBoarding() {
  if (!B || B.over) return;
  B.over = true;
  if (hud.boardToast) { hud.boardToast.close(); hud.boardToast = null; }
  syncToCareer();
  ctx.audio.play('clash', { caption: 'Grappling hooks fly!' });
  const enemy = B.enemyData;
  ctx.go('duel', { enemy, context: 'boarding', returnTo: 'battle', returnParams: { enemy, afterDuel: true } });
}

/** End the battle: animate, then show the outcome card. */
function finish(type, data = {}, immediate) {
  if (B.outcome) return;
  B.over = true; B.outcome = { type, data };
  root.classList.add('bt-ended');
  if (hud.boardToast) { hud.boardToast.close(); hud.boardToast = null; }
  if (!B.afterDuel) syncToCareer();
  let delay = immediate ? 0 : 0.8;
  const E = B.enemy, P = B.player, e = B.enemyData;
  if (type === 'sink') {
    E.sinking = true; delay = 3.4; launchSwimmers(E);
    ctx.audio.play('splash', { caption: `${E.name} is sinking` }); ctx.audio.play('cheer');
  } else if (type === 'defeat' && data.sunk) {
    P.sinking = true; delay = 3.2; launchSwimmers(P);
    ctx.audio.play('splash', { caption: 'Abandon ship!' });
  } else if (type === 'capture') {
    E.sail = 'furl'; E.obj.setSailState('furl');
    if (data.surrendered) { ctx.ui.toast(`Her crew throw down their weapons.`, { title: `${e.name} strikes her colours!`, ms: 2400 }); delay = 1.8; }
    ctx.audio.play('cheer');
  } else if (type === 'defeat') {
    P.sail = 'furl'; P.obj.setSailState('furl');
  }
  B.later.push({ at: B.t + delay, fn: showCard });
}

function launchSwimmers(s) {
  world.swimmers.forEach((w, i) => {
    const a = i / world.swimmers.length * Math.PI * 2 + Math.random() * 0.4, r = s.beam * 0.6 + Math.random();
    w.m.position.set(s.x + Math.sin(a) * r, 0, s.z + Math.cos(a) * r); w.m.visible = true;
    const sp = 1.2 + Math.random() * 1.2; w.vx = Math.sin(a) * sp; w.vz = Math.cos(a) * sp;
  });
}

// ---------------------------------------------------------------- outcome card
function showCard() {
  const { h } = ctx.ui;
  const o = B.outcome, e = B.enemyData;
  let addFleet = false, first = true, swapIndex = null, choosing = false;
  const W = ctx.world;
  const crewOk = o.type === 'capture' ? OUT.canCrewPrize(W, B.career, e) : null;
  const data = () => Object.assign({ enemy: e, addFleet, swapIndex: addFleet ? null : swapIndex }, o.data);
  const full = o.type === 'capture' && B.career.fleet.length >= OUT.MAX_FLEET;
  const eCls = W.SHIP_CLASSES[e.type] || W.SHIP_CLASSES.sloop;
  // the illustration for how it ended (none when the enemy got away: the escape art shows YOUR ship running)
  const outcomePic = () => ({ capture: 'moment-prize-taken', sink: 'moment-ship-sunk', defeat: 'moment-defeat' })[o.type] || (o.type === 'escape' && o.data.who === 'player' ? 'moment-escape' : null);
  const render = () => {
    const preview = OUT.apply(ctx, structuredClone(B.career), o.type, data());
    const good = o.type === 'capture' || o.type === 'sink' || (o.type === 'escape' && o.data.who === 'player');
    hud.card.replaceChildren(h('div', { class: 'navy-frame bt-card' + (good ? ' win' : ' lose') + (first ? ' first' : '') },
      h('div', { class: 'parchment bt-card-in' },
        outcomePic() && !choosing ? h('div', { class: 'bt-card-pic', style: { backgroundImage: `url(${ctx.ui.imgUrl(outcomePic())})` } }) : null,
        h('div', { class: 'bt-card-kicker label-caps' }, o.type === 'capture' ? 'VICTORY' : o.type === 'sink' ? 'VICTORY' : o.type === 'escape' ? 'THE CHASE IS OVER' : 'DEFEAT'),
        h('div', { class: 'bt-card-title' }, preview.title),
        h('div', { class: 'bt-card-sub' }, preview.sub),
        preview.lines.length ? h('div', { class: 'bt-card-lines' }, preview.lines.filter(([k]) => o.type !== 'capture' || (k !== 'Prize ship' && k !== 'Swapped')).map(([k, v, cls]) => h('div', { class: 'bt-card-line' }, h('span', null, k), h('b', { class: cls || '' }, v)))) : null,
        preview.notes.length ? h('div', { class: 'bt-card-notes' }, preview.notes.map(n => h('p', null, n))) : null,
        choosing ? h('div', { class: 'bt-swap' },
          h('div', { class: 'label-caps' }, `Tap a ship to give up for ${e.name} — ${eCls.name} · ${e.guns || eCls.guns} guns · ${eCls.cargo} t`),
          h('div', { class: 'bt-swap-list' }, B.career.fleet.map((s, i) => { const k = W.SHIP_CLASSES[s.type] || W.SHIP_CLASSES.sloop;
            return h('button', { class: 'ink-btn bt-swap-ship' + (swapIndex === i ? ' on' : ''), onTap: () => onContinue(Object.assign(data(), { addFleet: false, swapIndex: i })) },
              h('b', null, s.name, i === 0 ? h('i', { class: 'bt-flag-tag' }, 'Flagship') : null), h('span', null, `${k.name} · ${s.guns} guns · ${k.cargo} t`)); }))) : null,
        h('div', { class: 'bt-card-btns' },
          o.type === 'capture'
            // capture: the choice IS the continue — pick what happens to her and you sail on
            ? h('div', { class: 'bt-card-choice' },
                full
                  ? h('button', { class: choosing ? 'ink-btn' : 'gold-btn', onTap: () => { choosing = !choosing; render(); } }, choosing ? 'Cancel swap' : 'Swap one of mine for her')
                  : h('button', { class: 'gold-btn', disabled: !crewOk.ok, onTap: () => onContinue(Object.assign(data(), { addFleet: true, swapIndex: null })) }, 'Add her to my fleet'),
                h('button', { class: 'ink-btn', onTap: () => onContinue(Object.assign(data(), { addFleet: false, swapIndex: null })) }, 'Let her go'),
                !full && !crewOk.ok ? h('span', { class: 'bt-card-why' }, crewOk.why) : full ? h('span', { class: 'bt-card-why' }, choosing ? 'If the hold shrinks, any cargo that no longer fits goes over the side.' : `Your fleet is full (${OUT.MAX_FLEET} ships).`) : null)
            : h('button', { class: 'gold-btn bt-continue', onTap: () => onContinue(data()) }, 'Continue')))));
  };
  render(); first = false;
  if (o.type === 'capture' || o.type === 'sink') ctx.audio.play('coins', { caption: false });
}

function onContinue(data) {
  if (!B || B.left) return; B.left = true;
  const o = B.outcome;
  const res = OUT.apply(ctx, B.career, o.type, data);
  ctx.state.advanceDays(0.5, { atSea: true });
  const params = { message: res.message, battle: o.type };
  if (o.type === 'defeat') params.defeated = true;
  ctx.go('sail', params);
}

// ---------------------------------------------------------------- frame loop
function tick(dt, t) {
  const W = ctx.world, P = B.player, E = B.enemy, wind = B.career.wind, windV = W.windVec(wind);
  const sdt = dt * B.speed;
  B.t += sdt; B.hudT -= dt; B.thudT -= dt;
  world.water.update(t);
  // timed callbacks
  for (let i = B.later.length - 1; i >= 0; i--) if (B.later[i].at <= B.t) { const f = B.later[i].fn; B.later.splice(i, 1); f(); }

  if (!B.over) P.rudderIn = Math.max(-1, Math.min(1, (steer.port ? 1 : 0) - (steer.star ? 1 : 0) + steer.swipe)); else P.rudderIn = 0;
  if (!B.afterDuel) {
    SIM.aiStep(B, E, P, sdt, W, wind);
    SIM.stepShip(P, sdt, W, wind); SIM.stepShip(E, sdt, W, wind);
    SIM.contactStep(B, _c);
    if (_c.rammed && !B.over) {
      const dmg = Math.min(8, _c.rammed * 0.9);
      P.hull = Math.max(0, P.hull - dmg * (E.hullMax / (P.hullMax + E.hullMax)) * 1.4); E.hull = Math.max(0, E.hull - dmg * (P.hullMax / (P.hullMax + E.hullMax)) * 1.4);
      ctx.audio.play('thud', { caption: 'Crunch! The hulls collide' }); B.shake = 0.9; refreshDamage(P); refreshDamage(E);
    }
  }
  for (const s of B.ships) {
    s.obj.position.x = s.x; s.obj.position.z = s.z; s.obj.rotation.y = s.h;
    s.obj.update(dt, windV, world.water, t);
    if (s.sinking && s.sinkP < 1) {
      s.sinkP = Math.min(1, s.sinkP + sdt / 4.2); s.obj.sink(s.sinkP);
    }
  }
  // sinking FX + swimmers
  B.sinkFxT -= sdt;
  for (const s of B.ships) if (s.sinking && s.sinkP < 1 && B.sinkFxT <= 0) {
    _v.set(s.x + (Math.random() - 0.5) * s.beam, 1.5, s.z + (Math.random() - 0.5) * s.half); B.fx.cannonSmoke.spawn(_v, { count: 3, size: 1.2 });
    _v.set(s.x, 0.2, s.z); B.fx.sinkBubbles.spawn(_v, { count: 6, radius: s.half * 0.5 });
  }
  if (B.sinkFxT <= 0) B.sinkFxT = 0.14;
  for (const w of world.swimmers) if (w.m.visible) {
    w.m.position.x += w.vx * sdt; w.m.position.z += w.vz * sdt; w.ph += dt * 5;
    w.m.position.y = world.water.getHeight(w.m.position.x, w.m.position.z, t) + 0.05 + Math.sin(w.ph) * 0.06;
  }

  // broadsides + cannonballs (substep so fast balls can't tunnel through hulls)
  SIM.stepPending(B);
  const n = Math.max(1, Math.ceil(sdt / 0.03));
  for (let i = 0; i < n; i++) { B.fx.update(sdt / n); SIM.hitTests(B); }

  if (!B.over) checkOutcome(dt);
  frameCamera(dt, t);
  world.sky.update(camera);
  // water follows the camera target (snapped to the grid so waves don't swim)
  const g = 520 / 64; world.water.mesh.position.x = Math.round(_tgt.x / g) * g; world.water.mesh.position.z = Math.round(_tgt.z / g) * g;
  updateHud(false);
}

function checkOutcome(dt) {
  const P = B.player, E = B.enemy;
  if (E.hull <= 0) return finish('sink');
  if (P.hull <= 0) return finish('defeat', { sunk: true });
  if (E.crew <= 0) return finish('capture', { surrendered: true });
  if (P.crew <= 0) return finish('defeat', {});
  B.surrenderT -= dt;
  if (B.surrenderT <= 0) { B.surrenderT = 1.5; if (SIM.wantsSurrender(E, P)) return finish('capture', { surrendered: true }); }
  // escape
  const dx = E.x - P.x, dz = E.z - P.z, d = Math.hypot(dx, dz);
  if (d > SIM.ESCAPE_DIST) {
    const nx = dx / d, nz = dz / d, eAway = E.vx * nx + E.vz * nz, pAway = -(P.vx * nx + P.vz * nz);
    return finish('escape', { who: eAway >= pAway ? 'enemy' : 'player' });
  }
  if (d > SIM.WARN_DIST && !B.warned) { B.warned = true; ctx.audio.say(E.ai.mode === 'flee' ? "Lookout: She's slipping away!" : 'Lookout: We are drawing clear!'); }
  if (d < SIM.WARN_DIST - 15) B.warned = false;
  // boarding: hulls touching at low relative speed
  B.boardable = _c.contact && _c.relSpeed < SIM.BOARD_REL;
  if (B.boardable) {
    B.noContactT = 0;
    if (!hud.boardToast) {
      hud.boardToast = ctx.ui.toast(`Your ${Math.round(P.crew)} crew against their ${Math.round(E.crew)}`, { title: 'Close enough to board', cls: 'bt-board', actions: [{ label: 'Grapple & Board', primary: true, onTap: () => { hud.boardToast = null; startBoarding(); } }] });
      ctx.audio.play('bell', { caption: 'Close enough to board!' });
    }
    if (E.ai.boarding) {
      B.enemyBoardT += dt;
      if (B.enemyBoardT > 1.6 && !B.enemyBoarding) {
        B.enemyBoarding = true;
        ctx.ui.toast('Draw your sword, captain!', { title: "They're boarding us!", ms: 1600 });
        B.later.push({ at: B.t + 1.3, fn: () => { if (!B.over) startBoarding(); } });
      }
    }
  } else {
    B.enemyBoardT = 0;
    B.noContactT += dt;
    if (hud.boardToast && B.noContactT > 0.8) { hud.boardToast.close(); hud.boardToast = null; }
  }
}

function frameCamera(dt, t) {
  const P = B.player, E = B.enemy;
  const mx = (P.x + E.x) / 2, mz = (P.z + E.z) / 2;
  // fit both ships. At this pitch the ground seen below the top bar spans ≈ ±0.33·D north/south of the
  // look point (perspective: near half is short, far half is hidden by the bar); horizontally ≈ ±0.75·D.
  const D = Math.max(56, Math.min(270, Math.max((Math.abs(P.z - E.z) + 28) / 0.62, (Math.abs(P.x - E.x) + 46) / 1.5)));
  const k = dt >= 1 ? 1 : 1 - Math.exp(-dt * 2.2);
  // _tgt is shared between battles: snap it on the first frame, and never let a NaN stick
  // (a NaN left over from the last fight blanked the whole screen for every fight after it)
  if (!Number.isFinite(mx) || !Number.isFinite(mz)) return;
  if (dt >= 1 || !Number.isFinite(_tgt.x) || !Number.isFinite(_tgt.z)) { _tgt.x = mx; _tgt.z = mz; }
  else { _tgt.x += (mx - _tgt.x) * k; _tgt.z += (mz - _tgt.z) * k; }
  if (!Number.isFinite(B.camD)) B.camD = null;
  B.camD = B.camD == null ? D : B.camD + (D - B.camD) * k;
  const pitch = 1.0 + Math.sin(t * 0.05) * 0.03, yaw = Math.sin(t * 0.04) * 0.06; // slow high orbit drift
  _cam.set(_tgt.x + Math.sin(yaw) * Math.cos(pitch) * B.camD, Math.sin(pitch) * B.camD, _tgt.z + Math.cos(yaw) * Math.cos(pitch) * B.camD);
  if (B.shake > 0) { const s = B.shake * 0.6; _cam.x += (Math.random() - 0.5) * s; _cam.y += (Math.random() - 0.5) * s; _cam.z += (Math.random() - 0.5) * s; B.shake = Math.max(0, B.shake - dt * 2.2); }
  camera.position.copy(_cam);
  _v.set(_tgt.x, 0, _tgt.z + B.camD * 0.03); // look a touch south so the far ship clears the top bar
  camera.lookAt(_v);
}
