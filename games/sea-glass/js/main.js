// Sea Glass — bootstrap, screen routing and the frame loop.

import * as THREE from 'three';
import * as audio from './audio.js';
import * as hud from './hud.js';
import * as moves from './moves.js';
import * as collection from './collection.js';
import * as assemble from './assemble.js';
import { renderer, perf, setPixelRatio, setShadows, resize as resizeRenderer } from './env.js';
import {
  scene as beachScene, camera as beachCamera, applyBeach, redress, frameCamera,
  updateScene, spawnBurst, setShadowsEnabled, debugCounts,
  resetZoom,
} from './scene-beach.js';
import { createWorld, step as stepPhysics, prewarm, bodyCount, awakeCount } from './physics.js';
import {
  initPebbles, generatePebbles, settlePebbles, settleTick, syncPebbles,
  meshes as pebbleMeshes, activityDebug, containPebbles, coverAlongRay,
} from './pebbles.js';
import {
  initFinds, spawnFinds, placeFindsByDepth, settleFinds, settleFindsTick,
  syncFinds, finds, removeFind, flyToHud, updateFlying, updateShine, pickDebug,
  isExposed, containFinds, hideExposedFinds,
} from './finds.js';
import { initDig, setDigEnabled } from './dig.js';
import { BEACH_BY_ID, BOTTLES, RARITY } from './data.js';
import { loadPlayer, savePlayer, lastPlayer, totalPieces, PLAYERS } from './storage.js';
import { evaluate, reconcile } from './unlocks.js';

// --- state ----------------------------------------------------------------
let mode = 'player';          // player | beach | combing | collection | unlocks
let playerId = null;
let save = null;
let beach = null;
let sessionFinds = 0;
let dirty = false;
let dirtyTimer = 0;
let time = 0;
let assembling = false;
let lastCombing = false;      // is there a live section to return to?
let lastBuildMs = 0;
let pendingBanners = [];
let autoCloseTimer = 0;
// A fresh stretch of beach is on a timer: without it, "comb further" is a slot
// machine you can pull as fast as you can tap.
//
// The timer is an absolute DEADLINE, not a counter that screens reset. Every path
// that hands out a fresh section — arriving at a beach, travelling to another one,
// pressing "comb further" — arms it, and nothing disarms it early. An earlier
// version stored the remaining seconds and zeroed them in startBeach(), so a trip
// to the beach list and straight back looked exactly like the cooldown re-arming
// itself the moment it expired.
const COMB_COOLDOWN = 30;
let combReadyAt = 0;
let lastCombShown = -1;

function combRemaining() {
  return Math.max(0, (combReadyAt - performance.now()) / 1000);
}
function armCombCooldown() {
  combReadyAt = performance.now() + COMB_COOLDOWN * 1000;
  hud.setCombAllFound(false);   // fresh section has pieces again
  syncCombButton(true);
}
/** Push the timer to the button. Cheap enough to call on entering a screen. */
function syncCombButton(force) {
  const r = combRemaining();
  const shown = Math.ceil(r);
  if (!force && shown === lastCombShown) return;
  lastCombShown = shown;
  hud.setCombCooldown(r, COMB_COOLDOWN);
}

// --- boot -----------------------------------------------------------------
createWorld();
initPebbles(beachScene);
initFinds(beachScene);
initDig(renderer.domElement, beachCamera, onTapFind);
audio.setEnabled(true);
frameCamera();
collection.frameCamera();
assemble.resize();

hud.renderPlayerCards(pickPlayer);
hud.showScreen('player');
setDigEnabled(false);

// --- persistence ----------------------------------------------------------
function markDirty() { dirty = true; }
function flush() {
  if (!dirty || !playerId) return;
  savePlayer(playerId, save);
  dirty = false;
}

// --- screens --------------------------------------------------------------
function pickPlayer(id) {
  audio.ensureAudio();
  audio.uiTap();
  playerId = id;
  save = loadPlayer(id);
  reconcile(save);
  markDirty();
  flush();
  goBeachSelect();
}

function goBeachSelect() {
  mode = 'beach';
  moves.endActiveEffects();
  setDigEnabled(false);
  audio.fadeAmbience(0.16, 1.2);
  const p = PLAYERS.find((x) => x.id === playerId);
  hud.renderBeachGrid(save, startBeach);
  hud.setBeachSubtitle(save, p ? p.name : '');
  hud.showScreen('beach');
  flush();
}

function startBeach(beachId) {
  audio.uiTap();
  audio.startAmbience();
  audio.fadeAmbience(0.55, 1.5);
  beach = BEACH_BY_ID[beachId];
  save.lastBeach = beachId;
  save.stats.visits++;
  applyBeach(beach);
  resetZoom();
  frameCamera();
  moves.resetMoves();
  sessionFinds = 0;
  buildSection();
  mode = 'combing';
  hud.showScreen('combing');
  setDigEnabled(true);
  hud.setTip('Swipe the pebbles aside &bull; tap a piece of glass to keep it', 5200);
  markDirty();
}

/** Build a fresh section: pieces first, pebbles on top, then settle it all. */
function buildSection() {
  const t0 = performance.now();
  moves.endActiveEffects();
  const rnd = Math.random;

  // Re-lay the border stones, the dry-sand scatter and the driftwood, so a new
  // section actually looks like a new patch of beach and not a reshuffled pile.
  redress(beach);
  spawnFinds(beach, save, rnd);
  // The pieces are on the floor now, so the stones can be aimed at them.
  generatePebbles(beach, rnd, finds
    .filter((f) => f.depth !== 'top')
    .map((f) => ({ x: f.body.position.x, z: f.body.position.z })));
  const contain = () => { containPebbles(); containFinds(); };
  prewarm(130, contain);
  settlePebbles();
  placeFindsByDepth();
  prewarm(45, contain);
  settlePebbles();
  settleFinds();
  buryExposedFinds(contain);

  perf.bodies = bodyCount();
  lastBuildMs = Math.round(performance.now() - t0);
  refreshHud();
  // Every fresh section starts the clock, however the player got it.
  armCombCooldown();
}

const _toCam = new THREE.Vector3();

/**
 * Anything that is supposed to be hidden but has a clear line to the camera gets
 * a stone slid over it. Two passes is enough in practice, and each pass is a
 * dozen physics steps — the cost lands in the section build, never in a frame.
 *
 * Without this the smaller stones the beaches use now leave enough gaps that most
 * of a section could be tapped without ever swiping, which makes the comb (the
 * actual game) optional.
 */
function buryExposedFinds(contain) {
  // First choice: put the piece somewhere that is already sheltered.
  hideExposedFinds(beachCamera, pebbleMeshes);
  prewarm(10, contain);
  settlePebbles();
  settleFinds();
  // Whatever is still in the open gets a stone slid over it instead.
  for (let pass = 0; pass < 2; pass++) {
    let movedPass = 0;
    for (const f of finds) {
      if (f.depth === 'top') continue;
      if (!isExposed(f, beachCamera, pebbleMeshes)) continue;
      _toCam.copy(beachCamera.position).sub(f.mesh.position).normalize();
      const others = finds.filter((o) => o !== f);
      if (coverAlongRay(f.body.position.x, f.body.position.y, f.body.position.z,
        _toCam, others)) movedPass++;
    }
    if (!movedPass) break;
    prewarm(16, contain);
    settlePebbles();
    settleFinds();
  }
}

function combFurther() {
  if (assembling) return;
  const left = combRemaining();
  if (left > 0) {
    audio.pebbleClink(0.02);
    hud.plainToast('The tide has not turned yet &mdash; ' + Math.ceil(left) + 's');
    syncCombButton(true);
    return;
  }
  audio.newSection();
  save.stats.sections++;
  buildSection();
  hud.plainToast('A fresh stretch of beach &mdash; ' + finds.length + ' things hidden here');
  markDirty();
}

function enterCollection() {
  audio.uiTap();
  mode = 'collection';
  setDigEnabled(false);
  audio.fadeAmbience(0.22, 1.0);
  collection.build(save, save.bottleMode, save.bottleStyle);
  collection.frameCamera();
  hud.renderCollectionTotals(save);
  hud.setPourLabel(save.bottleMode);
  hud.setBottleStyleLabel(save.bottleStyle);
  hud.showScreen('collection');
  // The bottom sheet's height is only measurable once the screen is actually up,
  // and the camera fits the shelf into the band above it — so re-fit next frame.
  requestAnimationFrame(() => collection.frameCamera());
}

function enterUnlocks() {
  audio.uiTap();
  mode = 'unlocks';
  setDigEnabled(false);
  hud.renderMilestones(save);
  hud.showScreen('unlocks');
}

function refreshHud() {
  hud.updateHud({
    session: sessionFinds,
    left: finds.length,
    total: totalPieces(save) + save.ceramicFound,
    ceramicFound: (save.ceramics[beach.id] || []).length,
  });
}

// --- collecting -----------------------------------------------------------
const _hudTarget = new THREE.Vector3();

function hudTarget() {
  _hudTarget.set(0, 0.82, 0.5).unproject(beachCamera);
  _hudTarget.sub(beachCamera.position).normalize().multiplyScalar(1.5).add(beachCamera.position);
  return _hudTarget;
}

function onTapFind(f) {
  if (assembling) return;

  sessionFinds++;
  save.stats.totalFinds++;
  save.weight += f.grams;

  if (f.kind === 'glass') {
    save.glass[f.colourId] = (save.glass[f.colourId] || 0) + 1;
    audio.collect(f.rarity);
  } else {
    const list = save.ceramics[beach.id] || (save.ceramics[beach.id] = []);
    if (!list.includes(f.shardIndex)) list.push(f.shardIndex);
    save.ceramicFound++;
    audio.ceramicFind();
  }

  spawnBurst(f.mesh.position, f.hex, f.rarity === 'rare' ? 14 : 8);
  hud.toast(f);
  removeFind(f);
  flyToHud(f, hudTarget());

  const list = save.ceramics[beach.id] || [];
  const justCompleted = list.length >= 10 && !save.completed.includes(beach.id);
  if (justCompleted) save.completed.push(beach.id);

  const fired = evaluate(save);
  markDirty();
  refreshHud();

  // Nothing left buried here: don't make the player wait out the tide timer —
  // clear the comb cooldown at once and make it obvious the section is done.
  if (finds.length === 0) {
    combReadyAt = 0;
    hud.setCombAllFound(true);
    syncCombButton(true);
    hud.plainToast('You found everything here &mdash; comb further &rarr;');
  }

  if (justCompleted) {
    startAssemble();
    // Hold the unlock banners until the ceramic animation is done.
    pendingBanners = fired;
  } else {
    for (const m of fired) hud.queueUnlock(m);
  }
}

function startAssemble() {
  assembling = true;
  setDigEnabled(false);
  hud.el('assemble').classList.remove('hidden');
  hud.el('asTitle').textContent = beach.ceramic.name;
  hud.el('asSub').textContent = beach.ceramic.note;
  assemble.start(beach);
}

function endAssemble() {
  assembling = false;
  assemble.stop();
  hud.el('assemble').classList.add('hidden');
  if (mode === 'combing') setDigEnabled(true);
  for (const m of pendingBanners) hud.queueUnlock(m);
  pendingBanners = [];
  hud.renderBeachGrid(save, startBeach);
  flush();
}

// --- collection drag (tips the jars) --------------------------------------
{
  const canvas = renderer.domElement;
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'collection' || drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'collection' || !drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / Math.max(200, window.innerWidth * 0.5);
    const dy = (e.clientY - drag.y) / Math.max(200, window.innerHeight * 0.5);
    collection.setTiltTarget(dy * 0.7, -dx * 0.7);
  });
  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    collection.releaseTilt();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
}

// --- buttons --------------------------------------------------------------
hud.el('btnComb').addEventListener('click', combFurther);
hud.el('btnCollection').addEventListener('click', enterCollection);
hud.el('btnBeaches').addEventListener('click', () => { audio.uiTap(); goBeachSelect(); });
hud.el('btnMilestones').addEventListener('click', enterUnlocks);
hud.el('btnColBeaches').addEventListener('click', () => { audio.uiTap(); goBeachSelect(); });
hud.el('btnColMilestones').addEventListener('click', enterUnlocks);
hud.el('btnToCollection').addEventListener('click', enterCollection);
hud.el('btnToUnlocks').addEventListener('click', enterUnlocks);
hud.el('btnUnlocksBack').addEventListener('click', () => {
  audio.uiTap();
  goBeachSelect();
});
hud.el('btnColBack').addEventListener('click', () => {
  audio.uiTap();
  if (beach && lastCombing) {
    mode = 'combing';
    hud.showScreen('combing');
    setDigEnabled(!assembling);
    audio.fadeAmbience(0.55, 1.0);
    refreshHud();
    syncCombButton(true);
  } else {
    goBeachSelect();
  }
});
hud.el('btnPour').addEventListener('click', () => {
  audio.uiTap();
  save.bottleMode = save.bottleMode === 'mixed' ? 'separate' : 'mixed';
  collection.setMode(save, save.bottleMode);
  collection.frameCamera();
  hud.setPourLabel(save.bottleMode);
  markDirty();
});
hud.el('btnShake').addEventListener('click', () => collection.shake());
hud.el('btnBottleStyle').addEventListener('click', () => {
  audio.uiTap();
  const owned = BOTTLES.filter((b) => save.unlocked.bottles.includes(b.id));
  if (owned.length < 2) {
    hud.plainToast('Unlock more jars from the Milestones screen');
    return;
  }
  const i = owned.findIndex((b) => b.id === save.bottleStyle);
  save.bottleStyle = owned[(i + 1) % owned.length].id;
  collection.build(save, save.bottleMode, save.bottleStyle);
  collection.frameCamera();
  hud.setBottleStyleLabel(save.bottleStyle);
  markDirty();
});
hud.el('btnAssembleDone').addEventListener('click', endAssemble);

for (const btn of document.querySelectorAll('.move-btn')) {
  btn.addEventListener('click', () => {
    const id = btn.dataset.move;
    if (!save.unlocked.moves.includes(id)) {
      hud.plainToast('Locked &mdash; check the Milestones screen');
      return;
    }
    if (!moves.use(id, beachCamera, save)) {
      audio.pebbleClink(0.02);
      return;
    }
    if (id === 'radar') hud.setTip('Radar: the rings mark glass still buried', 3200);
    if (id === 'torch') hud.setTip('Shine: the glass glows through the stones', 3200);
    if (id === 'wave') hud.setTip('Wave wash: the water rolls the pebbles back', 3200);
  });
}

// --- resize ---------------------------------------------------------------
function onResize() {
  resizeRenderer();
  frameCamera();
  if (save) {
    // Button labels shorten on narrow screens, which changes the height of the
    // collection's button row — so relabel BEFORE the camera measures the band.
    hud.setPourLabel(save.bottleMode);
    hud.setBottleStyleLabel(save.bottleStyle);
  }
  collection.frameCamera();
  assemble.resize();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

// --- frame loop -----------------------------------------------------------
let last = performance.now();
let uiTimer = 0;
let frameAcc = 0, frameCount = 0, fpsAcc = 0, fpsCount = 0;
let degradeStage = 0;
let awake = 0;              // pebbles still simulating
let msPhysics = 0;          // smoothed cost of step + settle + sync
let msRender = 0;           // smoothed cost of renderer.render

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  time += dt;

  audio.updateAmbience(dt);

  dirtyTimer += dt;
  if (dirtyTimer > 1.5) { dirtyTimer = 0; flush(); }

  // The comb timer runs on every screen — nobody should have to sit and watch it.
  // The deadline is absolute, so this only has to redraw the button when the
  // whole second it displays changes.
  uiTimer += dt;
  if (uiTimer > 0.2) {
    uiTimer = 0;
    syncCombButton(false);
  }

  let drew = false;
  if (mode === 'combing') {
    lastCombing = true;
    const tPhys = performance.now();
    stepPhysics(dt);
    awake = settleTick(dt);          // force-park anything that has stopped
    settleFindsTick(dt);
    containPebbles();                // nothing escapes the pit and free-falls
    containFinds();
    syncPebbles(false);
    syncFinds();
    msPhysics = msPhysics * 0.9 + (performance.now() - tPhys) * 0.1;
    updateFlying(dt);
    moves.update(dt, time);
    updateShine(dt, time);
    updateScene(dt);
    hud.updateMoveButtons(save, dt);
    const tDraw = performance.now();
    renderer.render(beachScene, beachCamera);
    msRender = msRender * 0.9 + (performance.now() - tDraw) * 0.1;
    drew = true;
  } else if (mode === 'collection') {
    collection.update(dt);
    renderer.render(collection.scene, collection.camera);
    drew = true;
  }

  if (assembling) {
    assemble.update(dt);
    if (!drew) { renderer.render(beachScene, beachCamera); drew = true; }
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(assemble.scene, assemble.camera);
    renderer.autoClear = true;
  }

  // --- perf governor + readout -------------------------------------------
  if (drew) {
    frameAcc += dt; frameCount++;
    fpsAcc += dt; fpsCount++;
    if (frameCount >= 90) {
      const avg = frameAcc / frameCount;
      if (avg > 0.027) {
        if (degradeStage === 0 && perf.pixelRatio > 1.05) {
          setPixelRatio(Math.max(1.0, perf.pixelRatio - 0.35));
        } else if (degradeStage <= 1 && perf.shadows) {
          setShadows(false); setShadowsEnabled(false); degradeStage = 2;
        } else if (degradeStage <= 2 && perf.pixelRatio > 0.85) {
          setPixelRatio(0.85); degradeStage = 3;
        } else if (degradeStage <= 3 && perf.bodyBudget > 0.6) {
          // Next section gets a lighter pile rather than a stuttery one.
          perf.bodyBudget = 0.62; degradeStage = 4;
        }
      }
      frameAcc = 0; frameCount = 0;
    }
    if (fpsCount >= 30) {
      perf.fps = Math.round(fpsCount / fpsAcc);
      perf.drawCalls = renderer.info.render.calls;
      hud.setPerf(
        `${perf.fps}fps · ${perf.drawCalls}dc · ${bodyCount()}b (${awakeCount()} awake) · ` +
        `phys ${msPhysics.toFixed(1)}ms · draw ${msRender.toFixed(1)}ms · ` +
        `px${perf.pixelRatio.toFixed(2)}${perf.shadows ? '' : ' noshadow'} · build ${lastBuildMs}ms`
      );
      fpsAcc = 0; fpsCount = 0;
    }
  }

  if (assembling && !assemble.isRunning()) {
    // Animation finished; the "Lovely" button is what closes the overlay, but
    // auto-close after a beat so nobody gets stuck.
    if (!autoCloseTimer) autoCloseTimer = setTimeout(() => {
      autoCloseTimer = 0;
      if (assembling) endAssemble();
    }, 4000);
  }
}

requestAnimationFrame(frame);

// Preload one player's data so the cards show real numbers, then reveal.
const lp = lastPlayer();
if (lp) loadPlayer(lp);
hud.renderPlayerCards(pickPlayer);
setTimeout(() => hud.hideLoading(), 120);

window.addEventListener('pagehide', flush);
window.addEventListener('beforeunload', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

// Small debug hooks — handy on a tablet where there is no console.
window.__sgFindScreenPositions = () => finds.map((f) => {
  const v = f.mesh.position.clone().project(beachCamera);
  return {
    x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
    y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    kind: f.kind, colour: f.colourId || ('shard' + f.shardIndex), rarity: f.rarity,
  };
});

window.__sgProbe = (x, y) => pickDebug(
  new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1),
  beachCamera, pebbleMeshes);

window.__sgCam = () => debugCounts();
window.__sgSave = () => save;
window.__sgMoves = () => JSON.parse(JSON.stringify(moves.state));

// Drag a ceramic shard to the surface and hand back its screen position, so the
// 10-shard assemble path can be exercised without grinding out ten sections.
window.__sgForceCeramic = () => {
  const f = finds.find((x) => x.kind === 'ceramic');
  if (!f) return null;
  f.body.position.y = 0.62;
  f.body.velocity.setZero();
  f.body.wakeUp();
  for (let i = 0; i < 30; i++) stepPhysics(1 / 60);
  syncFinds();
  const v = f.mesh.position.clone().project(beachCamera);
  return {
    x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
    y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    shard: f.shardIndex,
  };
};

window.__sgFinds = () => finds.map((f) => ({
  kind: f.kind, colour: f.colourId || 'shard' + f.shardIndex, surface: !!f.surface,
  y: +f.mesh.position.y.toFixed(3), r: +f.radius.toFixed(3),
  exposed: isExposed(f, beachCamera, pebbleMeshes),
}));

window.seaGlassDebug = () => ({
  fps: perf.fps, drawCalls: perf.drawCalls, bodies: bodyCount(),
  awake: awakeCount(), awakePebbles: awake,
  msPhysics: +msPhysics.toFixed(2), msRender: +msRender.toFixed(2),
  pixelRatio: perf.pixelRatio, shadows: perf.shadows,
  bodyBudget: perf.bodyBudget, buildMs: lastBuildMs,
  activity: activityDebug(),
  finds: finds.length,
  exposed: finds.filter((f) => isExposed(f, beachCamera, pebbleMeshes)).length,
  exposedBuried: finds.filter((f) => f.depth !== 'top'
    && isExposed(f, beachCamera, pebbleMeshes)).length,
  collectionBodies: collection.bodyCount(),
  collection: collection.debugInfo(),
  beach: debugCounts(),
  combCd: +combRemaining().toFixed(1),
  rarities: Object.keys(RARITY),
});
