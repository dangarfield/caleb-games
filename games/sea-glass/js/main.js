// Sea Glass — bootstrap, screen routing and the frame loop.

import * as THREE from 'three';
import * as audio from './audio.js';
import * as hud from './hud.js';
import * as moves from './moves.js';
import * as collection from './collection.js';
import * as assemble from './assemble.js';
import {
  renderer, perf, setPixelRatio, setShadows, applyRenderQuality,
  resize as resizeRenderer,
} from './env.js';
import {
  scene as beachScene, camera as beachCamera, applyBeach, redress, frameCamera,
  updateScene, spawnBurst, setShadowsEnabled, debugCounts,
  resetZoom, PIT,
} from './scene-beach.js';
import {
  createWorld, step as stepPhysics, prewarm, bodyCount, awakeCount, maxAwake,
  applyPhysicsQuality, relaxPasses, stepHz, overlapStats,
  clampCounts, resetClampCounts, beachWorld, setMaxAwake, engine as beachEngine,
} from './physics.js';
import {
  initPebbles, generatePebbles, settlePebbles, settleTick, syncPebbles,
  meshes as pebbleMeshes, activityDebug, coverAlongRay, clearPebbles,
  applyPebbleQuality, pebbleMaterialType, pebbles, pileStats, swipeImpulse,
  colliderRatio, setColliderScale, localTopY, pileTopY,
} from './pebbles.js';
import { initEngine, activeEngine, engineInfo } from './phys.js';
import * as quality from './quality.js';
import {
  initFinds, spawnFinds, placeFindsByDepth, settleFinds, settleFindsTick,
  syncFinds, finds, removeFind, flyToHud, updateFlying, updateShine, pickDebug,
  isExposed, containFinds, hideExposedFinds, exposeTopFinds, liftToRakeReach,
  applyFindsQuality, clearFinds,
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
// How far the automatic frame governor has already stepped down. Declared up here
// because applyQuality() resets it, and that runs during boot.
let degradeStage = 0;
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

// --- quality profile ------------------------------------------------------
// One device-wide setting with two levels. The level itself is resolved inside
// quality.js at import time (URL override → saved choice → auto-detect), because
// env.js needs it before it builds the renderer. This is what PUSHES it into every
// system, and it is safe to call at any time: renderer settings and stone shading
// change on the next frame, body budgets on the next section build / collection.
function applyQuality() {
  applyRenderQuality();               // pixel ratio + shadow map
  setShadowsEnabled(perf.shadows);    // sun/border/scatter shadow casting
  applyPebbleQuality();               // PBR <-> Lambert stones, shadow flags
  applyFindsQuality();                // step-rate insurance on the glass too
  applyPhysicsQuality();              // step rate + solver (beach world)
  collection.applyQuality();          // step rate + solver (jar world)
  // The automatic governor's ladder is relative to the profile, so a flip starts
  // it again rather than leaving High stuck at Low's pixel ratio.
  degradeStage = 0;
  hud.setQualityLabel(quality.levelName());
}

/**
 * The two profiles run DIFFERENT physics backends (High: Rapier, Low: lphys), so a
 * flip may have to change engine as well as settings. A live mid-pile hand-over is
 * not attempted: slot indices belong to the world that issued them, so the honest
 * move is a clean rebuild — throw the stones and the glass away, build a fresh world
 * on the new backend, and re-rake the section. It is the same work as tapping "comb
 * further", and it only happens on the tap that actually changes engine.
 *
 * Returns true if the backend was swapped.
 */
async function swapEngineIfNeeded() {
  const want = quality.wantedEngine();
  if (want === activeEngine()) return false;
  // Loading Rapier's wasm the first time High is chosen. Nothing else is waiting on
  // it, and initEngine falls back to lphys rather than throwing if it cannot load.
  await initEngine(want);
  if (activeEngine() === beachEngine()) return false;   // fell back to what we had

  // Abandon a build in progress: it is driving the world we are about to throw away.
  // This has to happen BEFORE the world is released, or the next frame would resume a
  // generator that steps a disposed world — which on the Rapier backend is freed wasm.
  building = null;
  buildDoneTip = '';
  clearFinds();
  clearPebbles();
  createWorld();
  collection.ensureEngine();
  // The Quality button lives on the BEACH-SELECT bar, so the usual case is a toggle
  // with a live section parked in the background. Its stones and glass have just
  // been thrown away with the old world, and only the combing screen rebuilds
  // itself (below), so drop the "there is a section to go back to" flag — otherwise
  // backing out of the Collection would land on an empty pit.
  if (mode !== 'combing') lastCombing = false;
  return true;
}

async function toggleQuality() {
  audio.uiTap();
  quality.setLevel(quality.otherLevel(), true);
  // Shading and pixel ratio first, so a rebuilt pile is generated with the new
  // profile's stone tints already in place rather than being rescaled afterwards.
  applyQuality();
  const swapped = await swapEngineIfNeeded();
  if (swapped) {
    applyPhysicsQuality();            // the NEW world wants the profile pushed too
    if (mode === 'combing') buildSection();
  }
  hud.plainToast(quality.isLow()
    ? '<strong>Quality: Low</strong><br>Lighter stones, simpler physics &mdash; smoother on a slow tablet'
    : '<strong>Quality: High</strong><br>Full detail, full rigid-body stones');
}

// --- boot -----------------------------------------------------------------
// The physics backend has to be resolved BEFORE any world is built, because on High
// it is Rapier and that means fetching and instantiating a wasm module. This is the
// one await in the boot path; the loading overlay ("combing the beach…") is already
// on screen from index.html and is not removed until after this block, so the wait
// is covered. If the wasm cannot be fetched at all, initEngine falls back to lphys
// and the game boots exactly as the Low profile does — a missing CDN costs shading
// quality, never the game.
await initEngine(quality.wantedEngine());

createWorld();
// The jar world is created at module evaluation (it has no build step to wait for),
// which is necessarily before the await above resolved — so it may be on the wrong
// backend. It is empty at this point, so swapping it is free.
collection.ensureEngine();
initPebbles(beachScene);
initFinds(beachScene);
initDig(renderer.domElement, beachCamera, onTapFind);
audio.setEnabled(true);
frameCamera();
collection.frameCamera();
assemble.resize();
applyQuality();

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
  // Screen first, then build: on the Low profile the build spans several frames,
  // so the player watches the beach being raked instead of a frozen menu.
  mode = 'combing';
  hud.showScreen('combing');
  setDigEnabled(false);
  buildSection('Swipe the pebbles aside &bull; tap a piece of glass to keep it');
  markDirty();
}

// --- section build --------------------------------------------------------
// A section build is a few hundred physics steps over the whole pile: on a capable
// device that is one ~150ms block nobody notices, but it is exactly the hitch the
// user reports on ENTERING a beach on a weak tablet.
//
// So the build is written as a GENERATOR that yields at safe points, and it is
// driven two ways:
//   * High — drained in one go, byte for byte the old synchronous behaviour.
//   * Low  — pumped from the frame loop in ~6ms slices, with a "raking the
//     beach…" tip up and digging disabled while it runs. The pile visibly settles
//     instead of the tab freezing.
// The FIRST slice always runs synchronously, so finds.length and the HUD are
// correct the instant the caller returns.
let building = null;         // live generator, or null
let buildAccMs = 0;          // main-thread ms actually spent building
let buildDoneTip = '';

const BUILD_SLICE_MS = 6;

function* sectionBuilder() {
  const q = quality.profile();
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
  // The instance matrices still hold the LAST section's layout, so push the new
  // one before anything can render a half-built beach.
  syncPebbles(true);
  syncFinds();
  refreshHud();
  // Every fresh section starts the clock, however the player got it.
  armCombCooldown();
  yield;

  // The stones need no containment call of their own any more: the pit floor and
  // the rim are a clamp inside the step itself (physics.js clampBeach). This is
  // only the finds' "flung somewhere unreachable" rescue.
  const contain = () => { containFinds(); };
  yield* warm(q.prewarmMain, contain, q);
  settlePebbles();
  placeFindsByDepth();
  yield* warm(q.prewarmDepth, contain, q);
  settlePebbles();
  settleFinds();
  yield* buryExposedFinds(contain, q);
}

/**
 * `steps` physics steps, in chunks. On High `chunk` is 0, which means "all of it,
 * no yield" — the generator then behaves exactly like the old straight-line code.
 */
function* warm(steps, contain, q) {
  const chunk = q.chunkedBuild ? Math.max(1, q.buildChunk) : steps;
  for (let done = 0; done < steps; done += chunk) {
    prewarm(Math.min(chunk, steps - done), contain);
    if (q.chunkedBuild) {
      // Keep the visible pile in step with the sim while it settles on screen.
      syncPebbles(true);
      syncFinds();
      yield;
    }
  }
}

const _toCam = new THREE.Vector3();

/**
 * Anything that is supposed to be hidden but has a clear line to the camera gets a
 * stone slid over it — a section you can tap clean without combing is not the game.
 * Two passes on either profile, and the loop breaks as soon as a pass finds nothing
 * left in the open, which on a 252-stone pile is usually the first one.
 */
function* buryExposedFinds(contain, q) {
  // First choice: put the piece somewhere that is already sheltered.
  hideExposedFinds(beachCamera, pebbleMeshes);
  yield* warm(q.buryFirst, contain, q);
  settlePebbles();
  settleFinds();
  // Whatever is still in the open gets a stone slid over it instead.
  for (let pass = 0; pass < q.buryPasses; pass++) {
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
    yield* warm(q.buryPass, contain, q);
    settlePebbles();
    settleFinds();
  }
  // The pile is parked now, so its surface is final: bring anything that has ended
  // up deeper than a comb can reach back up to one course under the surface. This
  // has to be the last thing that touches a buried piece, because it is the
  // settling itself that sifts them out of reach.
  liftToRakeReach(beachCamera, pebbleMeshes);
  // Last of all, with the pile parked: make sure the one piece that is supposed to
  // be visible really is. Nothing runs after this, so nothing can re-bury it.
  exposeTopFinds(beachCamera, pebbleMeshes);
  syncFinds();
}

/**
 * Kick off a section build. `tip` is shown when it finishes (a build that spans
 * frames must not announce itself before the beach exists).
 */
function buildSection(tip) {
  // Abandon anything already in flight FIRST. A live generator is holding the world
  // this build is about to re-lay — resuming it afterwards would step a pile that no
  // longer exists, and on the Rapier backend that means calling into the physics world
  // from two places at once.
  building = null;
  buildDoneTip = tip || '';
  const gen = sectionBuilder();
  const t0 = performance.now();
  gen.next();                       // the unavoidable synchronous part
  buildAccMs = performance.now() - t0;

  if (quality.profile().chunkedBuild) {
    building = gen;
    setDigEnabled(false);
    hud.setTip('Raking the beach&hellip;', 0);
  } else {
    while (!gen.next().done) { /* drain */ }
    buildAccMs = performance.now() - t0;
    finishBuild();
  }
}

/**
 * Spend a slice of this frame on the build in progress.
 *
 * `building` is re-read every iteration: a slice can trigger something that abandons
 * the build (a quality flip that swapped the physics backend, another buildSection),
 * and resuming the old generator after that would drive a world that has been thrown
 * away. A generator that throws is dropped rather than retried every frame, which is
 * the difference between one bad section and a permanently wedged game.
 */
function pumpBuild() {
  const t0 = performance.now();
  try {
    do {
      if (!building || building.next().done) { building = null; break; }
    } while (performance.now() - t0 < BUILD_SLICE_MS);
  } catch (e) {
    console.warn('[sea-glass] section build failed', e);
    building = null;
  }
  buildAccMs += performance.now() - t0;
  if (!building) finishBuild();
}

function finishBuild() {
  perf.bodies = bodyCount();
  lastBuildMs = Math.round(buildAccMs);
  refreshHud();
  if (mode === 'combing' && !assembling) setDigEnabled(true);
  if (buildDoneTip) {
    hud.setTip(buildDoneTip, 5200);
    buildDoneTip = '';
  } else {
    hud.clearTip();
  }
}

function combFurther() {
  if (assembling || building) return;
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
// toggleQuality is async (it may have to load Rapier's wasm), and an unhandled
// rejection in a click handler is a silent dead button, so it is caught here.
hud.el('btnQuality').addEventListener('click', () => {
  toggleQuality().catch((e) => {
    console.warn('[sea-glass] quality toggle failed', e);
    hud.plainToast('<strong>Could not switch quality</strong><br>Try again in a moment');
  });
});
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
  hud.setQualityLabel(quality.levelName());
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

  // A section build in progress owns the physics world — stepping it from here as
  // well would fight the prewarm and settle the pile mid-drop. It is pumped
  // whatever screen we are on, so wandering off to the beach list does not leave a
  // half-built section behind.
  if (building) pumpBuild();

  let drew = false;
  if (mode === 'combing') {
    lastCombing = true;
    const tPhys = performance.now();
    if (!building) {
      // Frozen pile: stepPhysics returns immediately, settleTick has nothing to
      // park, and syncPebbles writes no matrices. A settled beach costs a couple
      // of loop iterations over ~130 slots and nothing else.
      stepPhysics(dt);
      awake = settleTick(dt);        // force-park anything that has stopped
      settleFindsTick(dt);
      containFinds();                // a shard flung out of reach comes back
      syncPebbles(false);
      syncFinds();
    }
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
        } else if (degradeStage <= 3) {
          // Last resort: shrink the AWAKE SET. Thinning the pile would buy nothing
          // — a frozen stone is not simulated, hashed or uploaded — whereas halving
          // how many stones may move at once halves the per-frame physics directly.
          setMaxAwake(Math.round(maxAwake() * 0.5)); degradeStage = 4;
        }
      }
      frameAcc = 0; frameCount = 0;
    }
    if (fpsCount >= 30) {
      perf.fps = Math.round(fpsCount / fpsAcc);
      perf.drawCalls = renderer.info.render.calls;
      hud.setPerf(
        `${quality.currentLevel()}/${activeEngine()} · ${perf.fps}fps · ${perf.drawCalls}dc · ` +
        `${bodyCount()}b (${awakeCount()}/${maxAwake()} awake) · ` +
        `phys ${msPhysics.toFixed(1)}ms · draw ${msRender.toFixed(1)}ms · ` +
        `px${perf.pixelRatio.toFixed(2)}${perf.shadows ? '' : ' noshadow'} · ` +
        `${stepHz()}hz x${relaxPasses()} · build ${lastBuildMs}ms`
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

/**
 * Which physics is actually running. There is no wasm to wait for any more: the
 * beach and the jar are both the game's own position-based relaxation (js/lphys.js),
 * so three.js is the only external dependency left.
 */
window.__sgPhysicsEngine = () => ({
  engine: 'lphys (built-in position-based relaxation)',
  external: ['three'],
  beachStepHz: stepHz(),
  beachRelaxPasses: relaxPasses(),
  beachMaxAwake: maxAwake(),
  collectionStepHz: collection.stepHz(),
  collectionRelaxPasses: collection.relaxPasses(),
});

window.__sgCam = () => debugCounts();
window.__sgSave = () => save;
window.__sgMoves = () => JSON.parse(JSON.stringify(moves.state));

// Drag a ceramic shard to the surface and hand back its screen position, so the
// 10-shard assemble path can be exercised without grinding out ten sections.
window.__sgForceCeramic = () => {
  const f = finds.find((x) => x.kind === 'ceramic');
  if (!f) return null;
  f.body.place(f.body.position.x, 0.62, f.body.position.z);
  f.body.wakeUp();
  for (let i = 0; i < 30; i++) prewarm(1, containFinds);
  syncFinds();
  const v = f.mesh.position.clone().project(beachCamera);
  return {
    x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
    y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    shard: f.shardIndex,
  };
};

/**
 * Full state of every piece: where it is, how it is lying (tilt from flat, in
 * degrees) and whether it is visible. `tilt` is the one worth watching — a flat
 * shard standing on its edge in the shingle looks like a bug even when the physics
 * is behaving.
 */
window.__sgFindDump = () => finds.map((f) => {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(f.mesh.quaternion);
  return {
    kind: f.kind, depth: f.depth,
    x: +f.mesh.position.x.toFixed(3), y: +f.mesh.position.y.toFixed(3),
    z: +f.mesh.position.z.toFixed(3),
    halfY: +f.halfY.toFixed(3), r: +f.radius.toFixed(3),
    tiltDeg: Math.round(Math.acos(Math.min(1, Math.abs(up.y))) * 57.2958),
    exposed: isExposed(f, beachCamera, pebbleMeshes),
    awake: !f.body.frozen,
  };
});

window.__sgFinds = () => finds.map((f) => ({
  kind: f.kind, colour: f.colourId || 'shard' + f.shardIndex, surface: !!f.surface,
  y: +f.mesh.position.y.toFixed(3), r: +f.radius.toFixed(3),
  exposed: isExposed(f, beachCamera, pebbleMeshes),
}));

// Force a level from the console / a test without touching the UI. Async, because
// switching to High switches the physics BACKEND, which may mean loading wasm and
// rebuilding the section (see toggleQuality).
window.__sgSetQuality = async (level) => {
  quality.setLevel(level, true);
  applyQuality();
  if (await swapEngineIfNeeded()) {
    applyPhysicsQuality();
    if (mode === 'combing') buildSection();
  }
  return window.__sgQuality();
};

/** Which backend is live, and why (Rapier load failures show up here). */
window.__sgEngine = () => ({
  ...engineInfo(),
  beach: beachEngine(),
  collection: collection.engine(),
  hardWalls: !!(beachWorld() && beachWorld().hardWalls),
});

window.__sgQuality = () => ({
  level: quality.currentLevel(),
  engine: activeEngine(),
  beachEngine: beachEngine(),
  collectionEngine: collection.engine(),
  detect: quality.detectionInfo(),
  pebbleBodies: pebbles.length,
  pebbleMaterial: pebbleMaterialType(),
  pixelRatio: perf.pixelRatio,
  shadowMapEnabled: renderer.shadowMap.enabled,
  shadows: perf.shadows,
  stepHz: stepHz(),
  relaxPasses: relaxPasses(),
  maxAwake: maxAwake(),
  awake: awakeCount(),
  collectionStepHz: collection.stepHz(),
  collectionRelaxPasses: collection.relaxPasses(),
  collectionBodies: collection.bodyCount(),
  buildMs: lastBuildMs,
  building: !!building,
  finds: finds.length,
  hiddenFinds: finds.filter((f) => !isExposed(f, beachCamera, pebbleMeshes)).length,
});

/**
 * Is the pile holding up? (See pebbles.pileStats.) The step rate is the thing most
 * likely to break this, so it is worth being able to ask at any moment.
 */
window.__sgPile = () => pileStats();

/** Height of the stone surface immediately around a point — see pebbles.localTopY. */
window.__sgLocalTop = (x, z, reach) => localTopY(x, z, reach || 0.2);

/**
 * Where to put the finger to comb over the world point (x, z).
 *
 * NOT the same as projecting the piece itself: a stroke is intersected with the
 * plane at pileTopY (dig.js), so aiming at a piece buried half a metre down lands
 * the stroke tens of centimetres away from it — which is exactly how a test can
 * conclude "raking does nothing" when the rake never went over the piece.
 */
window.__sgDigAim = (x, z) => {
  const v = new THREE.Vector3(x, pileTopY(), z).project(beachCamera);
  return {
    x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
    y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
  };
};

/**
 * How much overlap is left in the pile, plus the collider-to-stone ratio. This is
 * the honest measure of whether the relaxation is keeping up: a pile that is quietly
 * interpenetrating shows up as a large `maxPen` (a fraction of the pair's combined
 * radius), and a pile that is holding its shape sits near zero.
 */
window.__sgContacts = () => ({
  collider: colliderRatio(),
  stones: pebbles.length,
  overlaps: overlapStats(),
});

/**
 * How often the containment clamp has actually had to move something. The rim and
 * the floor ARE this clamp now, so `side` and `floor` tick up whenever the pile is
 * pressed against an edge — but `high` should stay at zero, because that counter
 * only fires when something has been flung clean out of the world.
 */
window.__sgClamps = () => clampCounts();
window.__sgResetClamps = () => { resetClampCounts(); return clampCounts(); };

/**
 * The pebble InstancedMeshes themselves, so a test can watch `instanceMatrix
 * .needsUpdate`. That flag is the whole "no idle uploads" claim: with the pile
 * frozen it must never be set, and three clears it after each upload — so a probe
 * that samples once per frame and never sees it true is the proof.
 */
window.__sgPebbleMeshes = pebbleMeshes;

/**
 * The raw beach world, so a probe can drive `stepOnce()` in a tight loop with no
 * renderer in the way and watch the JS heap. That is how the "zero allocation in
 * the hot loop" claim gets measured rather than asserted.
 */
window.__sgWorld = () => beachWorld();
window.__sgJarMeshes = () => collection.debugMeshes();

/** Hide the movable stones, to compare the painted bed with the pile it sits in. */
window.__sgShowPebbles = (on) => {
  for (const m of pebbleMeshes) m.visible = on !== false;
  return pebbleMeshes.map((m) => m.visible);
};

/**
 * Rebuild the pile at a different collider-to-stone ratio. Tuning tool only — the
 * shipped ratio is the constant in pebbles.js (and `?cs=` on the URL).
 */
window.__sgSetColliderScale = (s) => {
  setColliderScale(s);
  buildSection();
  return colliderRatio();
};

/**
 * Rake the whole pit hard, `passes` times, stepping between strokes, and report the
 * WORST pile state seen at any point. This is the 30Hz stability test: a pile that is
 * going to sag or fall through the floor does it while it is being thrown about, not
 * while it sits still.
 */
window.__sgStress = (passes) => {
  if (!beach || building) return null;
  const n = passes || 8;
  const h = 1 / stepHz();
  resetClampCounts();   // so the reported clamp count belongs to THIS rake
  let woke = 0;
  const worst = { floorPen: 0, sunk: 0, through: 0, outside: 0, minCentreY: 9 };
  const look = () => {
    const s = pileStats();
    if (s.floorPen > worst.floorPen) worst.floorPen = s.floorPen;
    if (s.sunk > worst.sunk) worst.sunk = s.sunk;
    if (s.through > worst.through) worst.through = s.through;
    if (s.outside > worst.outside) worst.outside = s.outside;
    if (s.minCentreY < worst.minCentreY) worst.minCentreY = s.minCentreY;
  };
  for (let k = 0; k < n; k++) {
    // Alternate long strokes across the pit, so every stone gets hit.
    const t = (k + 0.5) / n;
    const a = -PIT.hd * 0.85 + t * PIT.d * 0.85;
    const flip = k % 2 ? 1 : -1;
    woke += swipeImpulse(-PIT.hw * 0.8 * flip, a, PIT.hw * 0.8 * flip, -a, 0.42, 2.4);
    for (let i = 0; i < 20; i++) {
      prewarm(1, containFinds);
      settleTick(h);
      settleFindsTick(h);
      look();
    }
  }
  // ...and let it come to rest. The awake count reaching 0 here is the whole
  // point of the scheme: if it does not, the pile never stops costing anything.
  for (let i = 0; i < 120; i++) {
    prewarm(1, containFinds);
    settleTick(h);
    look();
  }
  syncPebbles(true);
  syncFinds();
  return {
    passes: n, stepHz: stepHz(), relaxPasses: relaxPasses(),
    wokenPerStroke: Math.round(woke / n), maxAwake: maxAwake(),
    awakeAfterSettle: awakeCount(),
    worst, settled: pileStats(),
    clamps: clampCounts(), overlaps: overlapStats(),
  };
};

/** Rebuild the current section and report what it cost on the main thread. */
window.__sgRebuild = () => {
  if (!beach) return null;
  const t0 = performance.now();
  buildSection();
  const sync = performance.now() - t0;
  return { syncMs: +sync.toFixed(1), chunked: !!building };
};

window.seaGlassDebug = () => ({
  quality: quality.currentLevel(),
  qualitySource: quality.levelSource(),
  beachId: beach ? beach.id : null,
  onBeachScreen: !document.getElementById('screen-beach').classList.contains('hidden'),
  fps: perf.fps, drawCalls: perf.drawCalls, bodies: bodyCount(),
  pebbleBodies: pebbles.length, pebbleMaterial: pebbleMaterialType(),
  stepHz: stepHz(), relaxPasses: relaxPasses(),
  collider: colliderRatio(),
  awake: awakeCount(), awakePebbles: awake, maxAwake: maxAwake(),
  msPhysics: +msPhysics.toFixed(2), msRender: +msRender.toFixed(2),
  pixelRatio: perf.pixelRatio, shadows: perf.shadows,
  shadowMapEnabled: renderer.shadowMap.enabled,
  bodyBudget: perf.bodyBudget, buildMs: lastBuildMs, building: !!building,
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
