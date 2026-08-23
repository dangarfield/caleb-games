// Boot, state, the frame loop, and the adaptive governor.
//
// THE FRAME LOOP IS THE POINT OF THIS FILE. It renders on demand:
//
//   build mode  - nothing moves, so nothing is drawn. A 300-domino table that is just
//                 sitting there costs one requestAnimationFrame callback and zero draw
//                 calls, which is why you can build on a cheap tablet at all.
//   run mode    - physics steps at a fixed 60 Hz (sim.js) and we redraw only while
//                 something is actually awake. When the last domino settles the loop
//                 goes quiet again by itself.
//
// Nothing inside frame() allocates: no vectors, no arrays, no closures, and no strings
// (the HUD is only touched when a number it displays has actually changed).

import {
  renderer, scene, camera, resize, setTable, setPixelRatio, setShadows, perf,
  startRing, selRing, ghost, ghostBox, eraseRing,
} from './env.js';
import * as orbit from './orbit.js';
import * as quality from './quality.js';
import * as storage from './storage.js';
import * as audio from './audio.js';
import * as sim from './sim.js';
import * as ui from './ui.js';
import * as tools from './tools.js';
import * as hist from './history.js';
import * as prog from './progression.js';
import { loadRapier, rapier, rapierReady, rapierError, rapierIsSimd } from './rapier.js';
import {
  freshLayout, serialise, deserialise, rebuildSurfaces, tableOf, dominoById, itemById, removeByIds,
} from './layout.js';
import { CHALLENGES, CH_BY_ID, startChallenge, checkGoal } from './challenges.js';
import { TABLES, TABLE_ORDER, SPACINGS, DOM_H, DOM_W } from './consts.js';
import { ITEMS } from './items-def.js';
import { stepConfetti, clearFx } from './fx.js';

const q = quality.profile();

// --- state ----------------------------------------------------------------
let playerId = null;
let save = null;
let earned = {};
let L = freshLayout();
let mode = 'build';
let budget = 60;
let govCap = Infinity;      // lowered only by the governor, never raised
let granted = [];           // items a challenge is lending you
let colour = 0;
let running = false;
let runClock = 0;
let quietTime = 0;
const QUIET = 1.1;          // seconds of measured stillness that ends a run
let settled = true;
let perfOn = false;
let dirty = true;
let autosaveTimer = 0;
let warnedNoStorage = false;    // the "this browser is not keeping anything" toast is once-only

function invalidate() { dirty = true; }

/**
 * The one place the domino budget is decided. A CHALLENGE lends you its own budget, and
 * that has to survive a run: this used to fall through to the sandbox budget the moment
 * endRun() called it, so challenge 4 (topple 150 of 200) silently dropped to 60/200 the
 * first time you pressed GO and the child got exactly one attempt per build.
 */
function recomputeBudget() {
  const ch = L && L.challenge ? CH_BY_ID[L.challenge] : null;
  budget = ch
    ? Math.min(ch.budget, q.dominoCap, govCap)
    : Math.min(prog.effectiveBudget(earned, q.dominoCap), govCap);
}

// ==========================================================================
// THE API ui.js READS AND CALLS BACK THROUGH
// ==========================================================================
const api = {
  state() {
    const p = playerId ? storage.PLAYERS.find(x => x.id === playerId) : null;
    return {
      playerName: p ? p.name : '',
      earned,
      challenges: save ? save.challenges : {},
      badges: prog.earnedCount(earned),
      stats: save ? save.stats : {},
      creations: save ? save.creations : {},
      slots: prog.tools(earned).slots,
      tools: prog.tools(earned),
      unlocked: prog.unlockSet(earned),
      granted,
      skins: prog.skinsFor(earned),
      surfaces: prog.surfacesFor(earned),
      tableTier: prog.tableTier(earned),
      table: L.table, surface: L.surface, spacing: L.spacing, skin: L.skin,
      colour,
      tool: tools.currentTool(), itemType: tools.currentItemType(),
      sel: tools.selection(),
      placed: L.dominoes.length, budget,
      running,
      perfOn, sound: !audio.isMuted(),
      otherQuality: quality.PROFILES[quality.otherLevel()].name,
      ctx: achCtx(),
    };
  },
  summary: (id) => storage.playerSummary(id),
  qualityText,
  aboutText,
  onPickPlayer: pickPlayer,
  onTool: (id) => { tools.setTool(id); hintForTool(id); },
  onItemType: (t) => { tools.setItemType(t); ui.renderPalette(); },
  // The rotation dial. Three calls, because one drag is one undo entry: grab, then any
  // number of live moves, then let go and bank it.
  onRotateStart: () => tools.beginRotate(),
  onRotateInput: (rad) => tools.setRotation(rad),
  onRotateEnd: () => tools.endRotate(),
  onUndo: doUndo,
  onRedo: doRedo,
  onGo: go,
  onBackToBuild: backToBuild,
  onAgain: again,
  onNew: clearTable,
  onUnlockAll: unlockEverything,      // DEBUG: unlock all
  onSave: saveCreation,
  onLoad: loadCreation,
  onDeleteSave: deleteCreation,
  onChallenge: beginChallenge,
  onGoal: showGoalAgain,
  onSetColour: (i) => { colour = i & 7; save.colour = colour; persist(); },
  onSetSpacing: (id) => {
    L.spacing = id; save.spacing = id; persist();
    ui.hint(SPACINGS[id].name + ' spacing — ' + SPACINGS[id].label + ' apart', 3000);
  },
  onSetSkin: (id) => {
    L.skin = id; save.skin = id;
    sim.refreshColours(L); invalidate(); persist();
  },
  onSetTable: setTableId,
  onSetSurface: (id) => {
    L.surface = id; save.surface = id;
    setTable(L.table, id); invalidate(); persist();
  },
  onQuality: switchQuality,
  onPerf: () => { perfOn = !perfOn; ui.setPerf('', perfOn); invalidate(); },
  onSound: () => {
    audio.setMuted(!audio.isMuted());
    storage.writeSetting('muted', audio.isMuted());
    if (!audio.isMuted()) audio.click();
  },
  onFit: () => { fitView(); invalidate(); },
  onTop: () => { orbit.setPreset(orbit.cam.ph > 0.4 ? 'top' : 'three'); invalidate(); },
};

function qualityText() {
  const d = quality.detectionInfo();
  return 'Graphics: ' + quality.levelName() + ' (' + d.source + ')' +
    ' · up to ' + q.dominoCap + ' dominoes · ' + (perf.shadows ? 'shadows on' : 'shadows off') +
    ' · ' + (d.touch ? 'touch device' : 'mouse device') +
    ' · ' + (d.hardwareConcurrency || '?') + ' cores' +
    (d.deviceMemory ? ' · ' + d.deviceMemory + ' GB' : '') +
    ' · dpr ' + d.dpr.toFixed(1);
}

function aboutText() {
  return 'Domino Rally · three.js 0.170 · Rapier ' +
    (rapierReady() ? (rapierIsSimd() ? '0.20 SIMD' : '0.20 compat') : 'not loaded yet') +
    (!rapierReady() && rapierError() ? ' (' + rapierError() + ')' : '') +
    ' · physics runs at a fixed 60 Hz on every device.' +
    // CC BY 3.0 asks for credit, and the About line is the one place in the game that is
    // for exactly this. Both sets are inlined in js/icons.js; nothing is fetched.
    ' Icons: Lucide (ISC) and Game-icons.net (CC BY 3.0).';
}

// ==========================================================================
// BOOT
// ==========================================================================
function bootUp() {
  ui.init(api);
  ui.boot('Setting up the table…');
  audio.setMuted(!!storage.readSetting('muted', false));

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 140));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(); });
  window.addEventListener('pagehide', persistNow);
  window.addEventListener('keydown', onKey);

  tools.init({
    canvas: renderer.domElement,
    getLayout: () => L,
    getColour: () => colour,
    budgetLeft: () => budget - L.dominoes.length,
    apply: (cmd) => hist.apply(cmd),
    invalidate,
    onBudget: () => ui.hint('That is all ' + budget + ' dominoes! Rub some out, or win a bigger box.', 3400),
    onBlocked: () => ui.hint('Not enough room there.'),
    onPlaced: (n) => { if (save) save.stats.dominoesPlaced = (save.stats.dominoesPlaced || 0) + n; },
    onToolChange: () => { ui.renderPalette(); invalidate(); },
    onSelectionChange: (sel, rot) => {
      ui.setRotDial(rot);
      ui.renderPalette();        // the dial appears and disappears with the selection
      updateSelRing();
    },
    // LIVE rotation, on every pointermove of the dial. This deliberately does NOT go through
    // history or rebuildScene: it mutates the one piece and re-places the instances that piece
    // owns. A full sim.build() per frame would re-derive every part on the table and re-upload
    // the whole instance matrix buffer, which on a 300-domino table is the difference between a
    // dial that tracks a finger and one that trails it. Safe because build mode has no bodies.
    onRotateLive: (sel, rot) => {
      if (sel.kind === 'item') {
        const it = itemById(L, sel.id);
        if (!it) return;
        it.r = rot;
        // An item's rotation carries its placement surfaces and its blockers around with it,
        // so the answer to "may I put a domino here" changes as the dial turns.
        rebuildSurfaces(L);
        sim.refreshItemTransform(L, it);
      } else {
        // sim indexes dominoes by POSITION, not by id, so find the slot once rather than
        // looking the domino up by id and then searching for it again.
        let k = -1;
        for (let i = 0; i < L.dominoes.length; i++) if (L.dominoes[i].id === sel.id) { k = i; break; }
        if (k < 0) return;
        L.dominoes[k].r = rot;
        sim.refreshDominoTransform(L, k);
      }
      updateSelRing();
    },
    // Let go: bank the whole drag as one entry. The piece is already AT `to` from the live
    // pass, so cmdRotate's do() is a no-op the first time and undo() is what does the work.
    onRotateCommit: (sel, from, to) => {
      const target = sel.kind === 'item' ? itemById(L, sel.id) : dominoById(L, sel.id);
      if (!target) return;
      hist.apply(hist.cmdRotate(L, sel.kind, target, from, to));
    },
  });

  hist.onChange(onLayoutChanged);

  // Rapier is fetched in the background from here. Build mode needs no physics at all,
  // so the wasm only has to have arrived by the first GO — and if the network is slow,
  // go() awaits the same promise rather than starting a second download.
  loadRapier().then((R) => {
    if (!R) ui.toast('triangle-alert', 'Physics could not load', 'Building still works. Reload to try again.', false);
  });

  orbit.setBounds(tableOf(L));
  fitView();
  onResize();

  ui.renderPlayers();
  ui.bootDone();
  ui.show('scPlayers');
  requestAnimationFrame(frame);
}

function onResize() {
  resize();
  ui.relayoutBar();
  // The bar rewraps to a different number of rows at different widths, so how much canvas the
  // chrome covers is a function of the viewport. Tell the camera before the next fit, but do
  // NOT refit here: a resize should not throw away a pan the child chose.
  const ins = ui.chromeInsets();
  orbit.setInsets(ins.top, ins.bottom);
  invalidate();
}

/** Frame the table into the part of the screen the chrome is not sitting on. */
function fitView() {
  const ins = ui.chromeInsets();
  orbit.setInsets(ins.top, ins.bottom);
  orbit.fit();
}

function pickPlayer(id) {
  playerId = id;
  save = storage.loadPlayer(id);
  earned = save.achievements;
  colour = (save.colour | 0) & 7;
  granted = [];
  recomputeBudget();

  let next = null;
  if (save.lastLayout) {
    try { next = deserialise(save.lastLayout); } catch (e) { next = null; }
  }
  L = next || freshLayout(prog.tableFor(earned), save.surface, save.spacing, save.skin);

  // Clamp anything a stale save remembers but this player has not earned.
  L.challenge = null;
  const dropped = conformLayout();
  ui.setGoal('');

  hist.clearHistory();
  applyTable();
  rebuildScene();
  tools.setMode('build');
  tools.setTool('line');
  ui.hideScreens();
  storage.savePlayer(playerId, save);

  if (!save.seenIntro) {
    save.seenIntro = true;
    persistNow();
    ui.show('scHelp');
  } else if (dropped) {
    ui.hint(dropped + ' piece' + (dropped === 1 ? '' : 's') +
      ' would not fit on your table any more, so ' + (dropped === 1 ? 'it' : 'they') +
      ' came off.', 4200);
  } else {
    ui.hint('Drag one finger to lay dominoes. Two fingers spin the camera.', 4600);
  }
}

/**
 * Bring a layout that has just come off disk into line with what this player owns, and
 * drop anything the resulting table can no longer hold. THE ORDER MATTERS: the base
 * placement surface IS the table rectangle, so rebuildSurfaces has to run after the table
 * has been clamped, and the prune has to run after that.
 *
 * This used to be open-coded in two places that disagreed: pickPlayer clamped and
 * rebuilt but never pruned, and loadCreation clamped and did neither — so loading a
 * Huge-table creation as a player who only owns Small left a stale full-size surface
 * rectangle (you could place dominoes in mid-air off the edge) plus a scatter of pieces
 * beyond the kerb that could be neither reached nor rubbed out. One function now, called
 * by both, matching what setTableId already did for a live table change.
 *
 * @returns the number of pieces removed.
 */
function conformLayout() {
  if (TABLE_ORDER.indexOf(L.table) > prog.tableTier(earned)) L.table = prog.tableFor(earned);
  if (!prog.surfacesFor(earned).includes(L.surface)) L.surface = 'felt';
  if (!prog.skinsFor(earned).includes(L.skin)) L.skin = 'plain';
  if (!prog.tools(earned).spacing) L.spacing = 'normal';
  rebuildSurfaces(L);

  const t = TABLES[L.table] || TABLES.small;
  const mx = t.w / 2 - 0.015, mz = t.d / 2 - 0.015;
  const dIds = [], iIds = [];
  for (const d of L.dominoes) if (Math.abs(d.x) > mx || Math.abs(d.z) > mz) dIds.push(d.id);
  for (const it of L.items) {
    // A type this build has never heard of: a save written before the Bowling Ball was
    // removed still contains one. Everything downstream already skips it (sim.build,
    // rebuildSurfaces, itemCost all test `ITEMS[type]` first), which is exactly the problem
    // — it would render nothing, collide with nothing and block nothing, while still
    // counting against the budget and being impossible to rub out. Drop it on load.
    if (!ITEMS[it.type]) { iIds.push(it.id); continue; }
    if (!it.locked && (Math.abs(it.x) > mx || Math.abs(it.z) > mz)) iIds.push(it.id);
  }
  const n = dIds.length + iIds.length;
  // Straight through the model, not through history: a load is the start of a new
  // history, so there is nothing here for undo to be usefully "before".
  if (n) removeByIds(L, dIds, iIds);
  return n;
}

function applyTable() {
  setTable(L.table, L.surface);
  orbit.setBounds(tableOf(L));
  fitView();
  invalidate();
}

function setTableId(id) {
  if (TABLE_ORDER.indexOf(id) > prog.tableTier(earned)) return;
  if (id === L.table) return;
  const shrinking = TABLE_ORDER.indexOf(id) < TABLE_ORDER.indexOf(L.table);
  L.table = id;
  rebuildSurfaces(L);
  if (shrinking) {
    // Anything now past the edge of a SMALLER table would be unreachable and
    // un-erasable, so it comes off — as one undoable step.
    const t = TABLES[id];
    const mx = t.w / 2 - 0.015, mz = t.d / 2 - 0.015;
    const dIds = [], iIds = [];
    for (const d of L.dominoes) if (Math.abs(d.x) > mx || Math.abs(d.z) > mz) dIds.push(d.id);
    for (const it of L.items) if (!it.locked && (Math.abs(it.x) > mx || Math.abs(it.z) > mz)) iIds.push(it.id);
    const n = dIds.length + iIds.length;
    if (n) {
      hist.apply(hist.cmdRemove(L, dIds, iIds, 'clearing the edges'));
      ui.hint('Moved to the ' + TABLES[id].name + ' table — ' + n +
        ' piece' + (n === 1 ? '' : 's') + ' came off the edge.', 3600);
    }
  }
  applyTable();
  rebuildScene();
  persistNow();
}

// ==========================================================================
// SCENE REBUILD (build mode creates no physics world at all)
// ==========================================================================
function rebuildScene() {
  clearFx();
  const res = sim.build(L, null);
  if (res.overflow) {
    ui.toast('triangle-alert', 'That is more than this tablet can draw', 'Some pieces are hidden.', false);
  }
  updateStartRing();
  // After a rebuild the selected piece may be gone — undone, erased, or on a table that just
  // shrank — so this is also where a stale ring gets dropped.
  if (!validateSelection()) updateSelRing();
  updateHud();
  ui.setUndo(hist.undoDepth(), hist.redoDepth());
  ui.renderPalette();
  invalidate();
}

function updateStartRing() {
  const d = (mode === 'build' && L.startId !== null) ? dominoById(L, L.startId) : null;
  if (!d) { startRing.visible = false; return; }
  startRing.position.set(d.x, d.y + 0.0035, d.z);
  startRing.visible = true;
}

/**
 * Drop the selection if the piece it names no longer exists. Returns true if it cleared it,
 * because clearSelection() already refreshes the ring and the dial through onSelectionChange
 * and the caller must not do it twice.
 */
function validateSelection() {
  const sel = tools.selection();
  if (!sel) return false;
  const alive = sel.kind === 'item' ? itemById(L, sel.id) : dominoById(L, sel.id);
  if (alive) return false;
  tools.clearSelection();
  return true;
}

/**
 * The blue ring under whatever the dial will turn. Sits 0.2 mm above the gold start ring so
 * that when one domino is both the first AND the selected one, you see both rings rather than
 * a flickering fight between two coplanar quads.
 *
 * The ring is a unit circle, scaled here: a domino wants something just wider than itself,
 * a Tower wants something the size of its footprint.
 */
function updateSelRing() {
  const sel = mode === 'build' ? tools.selection() : null;
  if (!sel) { selRing.visible = false; return; }
  let x, y, z, r;
  if (sel.kind === 'item') {
    const it = itemById(L, sel.id);
    if (!it) { selRing.visible = false; return; }
    const def = ITEMS[it.type];
    x = it.x; y = 0; z = it.z;
    r = (def && def.foot ? def.foot : 0.05) * 1.5;
  } else {
    const d = dominoById(L, sel.id);
    if (!d) { selRing.visible = false; return; }
    x = d.x; y = d.y; z = d.z;
    r = DOM_W * 1.3;
  }
  selRing.position.set(x, y + 0.0037, z);
  selRing.scale.set(r, r, 1);
  selRing.visible = true;
}

let hudPlaced = -1, hudFell = -1, hudBudget = -1;
function updateHud() {
  const fell = sim.run.fell;
  // The BUDGET is part of the memo. It used to be left out, so starting a challenge on an
  // empty table (0 placed, 0 fallen — both unchanged) skipped the update entirely and the
  // HUD still read "0/60" from the sandbox until the first domino landed.
  if (hudPlaced === L.dominoes.length && hudFell === fell && hudBudget === budget) return;
  hudPlaced = L.dominoes.length;
  hudFell = fell;
  hudBudget = budget;
  ui.setHud(hudPlaced, budget, fell, prog.budgetIsCapped(earned, q.dominoCap));
}

function onLayoutChanged() {
  rebuildScene();
  scheduleAutosave();
}

function doUndo() {
  const c = hist.undo();
  if (c) { audio.undoBlip(); ui.hint('Undid ' + c.label); }
  else ui.hint('Nothing left to undo');
}
function doRedo() {
  const c = hist.redo();
  if (c) { audio.redoBlip(); ui.hint('Put back ' + c.label); }
  else ui.hint('Nothing to put back');
}

function clearTable() {
  if (!L.dominoes.length && !L.items.some(i => !i.locked)) {
    ui.hint('The table is already empty');
    return;
  }
  hist.apply(hist.cmdClearAll(L));
  audio.erase();
  ui.hint('Cleared — tap undo if that was a mistake', 3200);
}

// --- autosave -------------------------------------------------------------
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(persistNow, 1200);
}
function persist() { scheduleAutosave(); }
function persistNow() {
  clearTimeout(autosaveTimer);
  if (!save || !playerId) return;
  // A challenge layout is never written over the sandbox you were building.
  if (!L.challenge) save.lastLayout = serialise(L);
  // Say so ONCE, the first time a write does not land: better to learn now than after
  // an hour of building. Silence here is what made "it was gone after a refresh" a
  // mystery rather than a message.
  if (!storage.savePlayer(playerId, save) && !warnedNoStorage) {
    warnedNoStorage = true;
    ui.toast('triangle-alert', 'This browser is not keeping your table',
      'Storage may be full, or private browsing is on', true);
  }
}

// ==========================================================================
// NAMED SAVE SLOTS
// ==========================================================================
function saveCreation(name) {
  const slots = prog.tools(earned).slots;
  if (!save.creations[name] && Object.keys(save.creations).length >= slots) {
    ui.setSaveHint('All ' + slots + ' slots are full — delete one, or reuse a name.');
    return;
  }
  const had = Object.prototype.hasOwnProperty.call(save.creations, name);
  const prev = save.creations[name];
  save.creations[name] = serialise(L);
  save.stats.saveCount = (save.stats.saveCount || 0) + 1;
  // A save that never reached the disk must not report success, and must not be left
  // sitting in the list either — a name you can see but that is not stored is exactly
  // what "it was gone after a refresh" looks like from the child's side.
  if (!storage.savePlayer(playerId, save)) {
    if (had) save.creations[name] = prev; else delete save.creations[name];
    save.stats.saveCount -= 1;
    ui.setSaveHint('This browser would not let the game save. Its storage may be full, ' +
      'or private browsing is on.');
    ui.toast('triangle-alert', 'Could not save “' + name + '”',
      'The browser refused to store it', true);
    return;
  }
  audio.chime(880);
  ui.toast('save', 'Saved “' + name + '”', L.dominoes.length + ' dominoes', false);
  settleNow();
}

function loadCreation(name) {
  const raw = save.creations[name];
  if (!raw) return;
  let next = null;
  try { next = deserialise(raw); } catch (e) { next = null; }
  if (!next) { ui.toast('triangle-alert', 'That creation could not be read', '', false); return; }
  L = next;
  L.challenge = null;
  granted = [];
  const dropped = conformLayout();
  ui.setGoal('');
  recomputeBudget();
  hist.clearHistory();
  applyTable();
  rebuildScene();
  ui.hint(dropped
    ? 'Loaded “' + name + '” — ' + dropped + ' piece' + (dropped === 1 ? '' : 's') +
      ' did not fit on your table.'
    : 'Loaded “' + name + '”', dropped ? 4200 : 2600);
}

function deleteCreation(name) {
  delete save.creations[name];
  storage.savePlayer(playerId, save);
  audio.erase();
}

// ==========================================================================
// CHALLENGES
// ==========================================================================
function beginChallenge(id) {
  const c = CH_BY_ID[id];
  if (!c) return;
  const next = startChallenge(id);
  if (!next) return;
  persistNow();                 // keep the sandbox before switching away from it
  L = next;
  rebuildSurfaces(L);
  granted = c.grant.slice();
  recomputeBudget();            // L.challenge is set, so this picks up the lent budget
  hist.clearHistory();
  applyTable();
  rebuildScene();
  tools.setMode('build');
  tools.setTool('line');
  ui.setGoal(c.n + '. ' + c.name + ' — tap to read the goal again', c.icon);
  ui.toast(c.icon, c.n + '. ' + c.name, c.goalText, true);
  ui.hint(c.hint, 7000);
}

/** The goal chip was tapped: say the whole thing again, goal and hint. */
function showGoalAgain() {
  const c = L.challenge ? CH_BY_ID[L.challenge] : null;
  if (!c) { ui.setGoal(''); return; }
  audio.click();
  ui.toast(c.icon, c.goalText, c.hint, true);
}

// ==========================================================================
// GO / RUN
// ==========================================================================
let goPending = false;
async function go() {
  if (running || goPending) return;
  if (!L.dominoes.length) { ui.hint('Draw a line of dominoes first!'); return; }
  if (!rapier()) {
    goPending = true;
    ui.boot('Loading the physics engine…');
    const got = await loadRapier();
    ui.bootDone();
    goPending = false;
    if (!got) {
      ui.toast('triangle-alert', 'Physics could not load', 'Check the connection and reload.', false);
      return;
    }
  }
  startRun();
}

function startRun() {
  tools.abandon();
  tools.setMode('run');
  ghost.count = 0;
  ghostBox.visible = false;
  eraseRing.visible = false;
  startRing.visible = false;
  selRing.visible = false;
  clearFx();

  const res = sim.build(L, rapier());
  if (res.overflow) ui.toast('triangle-alert', 'Too many pieces for this tablet', 'Some are missing from this run.', false);

  let idx = 0;
  for (let i = 0; i < L.dominoes.length; i++) if (L.dominoes[i].id === L.startId) { idx = i; break; }

  mode = 'run';
  running = true;
  settled = false;
  runClock = 0;
  quietTime = 0;
  hudFell = -1;
  ui.setRunMode(true);
  audio.ensureAudio();
  audio.go();
  sim.tapStart(idx);
  invalidate();
}

function backToBuild() {
  running = false;
  settled = true;
  mode = 'build';
  clearFx();
  // Freeing the world here is what makes "back to build" free: no bodies, no stepping,
  // and the authoritative layout was never touched by the run.
  sim.destroyWorld();
  tools.setMode('build');
  ui.setRunMode(false);
  ui.hideScreens();
  hudFell = -1;
  rebuildScene();
}

function again() {
  ui.hideScreens();
  startRun();
}

/** The run has stopped moving (or hit the time cap): score it. */
function endRun() {
  if (settled) return;
  settled = true;
  running = false;
  const r = sim.run;

  prog.foldStats(save.stats, r);

  // The challenge flag is set before achievements settle, so ch1..ch4 can be awarded
  // in the same pass as everything else.
  let cleared = false;
  if (L.challenge && checkGoal(L, r)) {
    if (!save.challenges[L.challenge]) cleared = true;
    save.challenges[L.challenge] = 1;
  }

  const fresh = prog.settleAchievements(earned, achCtx());
  recomputeBudget();
  storage.savePlayer(playerId, save);

  const total = L.dominoes.length;
  const pct = total ? Math.round((r.fell / total) * 100) : 0;
  let title = 'Nice one!';
  if (pct >= 100) title = 'Every single one!';
  else if (pct >= 90) title = 'Almost perfect!';
  else if (pct < 25) title = 'Hmm — it stopped early';
  if (cleared) title = 'Challenge complete!';

  let extra = '';
  if (r.bells) extra += '<p class="note">🔔 ' + r.bells + ' note' + (r.bells === 1 ? '' : 's') + ' played</p>';
  if (r.itemCount) extra += '<p class="note">✨ ' + r.itemCount + ' trick' + (r.itemCount === 1 ? '' : 's') + ' went off</p>';
  if (r.bestBallKnock) extra += '<p class="note">🎳 one ball took out ' + r.bestBallKnock + '</p>';
  if (r.colours >= 3) extra += '<p class="note">🌈 ' + r.colours + ' colours fell</p>';
  if (pct > 0 && pct < 60) {
    const c = coachFailure(r, total);
    if (c) extra += '<p class="note warn">' + c + '</p>';
  }
  if (L.challenge && !save.challenges[L.challenge]) {
    extra += '<p class="note warn">' + CH_BY_ID[L.challenge].hint + '</p>';
  }
  if (fresh.length) extra += '<p class="note gold">🏅 ' + fresh.map(a => a.name).join(', ') + '</p>';

  ui.showResult({
    title,
    line: r.fell + ' of ' + total + ' fell (' + pct + '%) in ' + r.seconds.toFixed(1) + 's',
    extra,
  });

  if (cleared) {
    audio.fanfare();
    ui.toast(CH_BY_ID[L.challenge].icon, 'Challenge complete!', CH_BY_ID[L.challenge].name, true);
  } else if (pct >= 90 && total >= 10) {
    audio.fanfare();
  }
  for (const a of fresh) ui.toast(a.icon, a.name, 'Unlocked: ' + a.gives, true);
  if (fresh.length) setTimeout(() => audio.achievement(), 300);

  ui.renderPalette();
  updateHud();
  invalidate();
}

/**
 * How many disconnected GROUPS the layout is in. Two dominoes belong to the same group if
 * one could physically topple onto the other: within its own height, on the same level.
 * A chain can only ever knock over the group it starts in, so a count above one is the
 * single most common real reason a run stops early — and unlike a guess, it is checkable.
 *
 * O(n^2) with an early exit, run at most once per finished run (never per frame), on at
 * most 500 dominoes. Measured under 2 ms at 500.
 */
function clusterCount() {
  const d = L.dominoes, n = d.length;
  if (n < 2) return n;
  const reach2 = (DOM_H * 0.95) * (DOM_H * 0.95);
  const dy = DOM_H * 0.6;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let clusters = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    if (++clusters > 2) break;          // "more than one" is all the advice needs
    let top = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const a = d[stack[--top]];
      for (let j = 0; j < n; j++) {
        if (seen[j]) continue;
        const b = d[j];
        if (Math.abs(a.y - b.y) > dy) continue;
        const ddx = a.x - b.x, ddz = a.z - b.z;
        if (ddx * ddx + ddz * ddz <= reach2) { seen[j] = 1; stack[top++] = j; }
      }
    }
  }
  return clusters;
}

/**
 * One line of honest advice when most of the run did not fall.
 *
 * The old version blamed the SPACING for every result under 60% and told the child to
 * switch to Tight. That was wrong twice over: the spacing dial is hard-clamped to the band
 * that is measured to topple 200/200 (consts.js), so spacing is essentially never the
 * cause — and the dial itself is locked until Round the Bend, i.e. it pointed the
 * beginners most likely to see the message at a feature they did not have. This diagnoses
 * first, and only ever names something the player can actually do.
 */
function coachFailure(r, total) {
  if (total < 4) return '';
  if (clusterCount() > 1) {
    return 'Your dominoes are in more than one separate group, and a falling domino can ' +
      'only reach one less than its own height away. Draw over the gap to join them up — ' +
      'or, if a trick is meant to carry the chain across, line it up with both ends.';
  }
  if (r.fell <= 3) {
    return 'It stopped almost straight away. The gold ring shows which domino gets ' +
      'tipped: pick Start and tap the one at the END of your line, then press GO.';
  }
  if (prog.tools(earned).arc) {
    return 'Look at where it stopped and add a domino or two right there. Sharp corners ' +
      'are the usual culprit — the Arc tool turns far more reliably than two lines meeting.';
  }
  return 'Look at where it stopped and add a domino or two right there, or rub that bit ' +
    'out and draw it again.';
}

/** Settle achievements outside a run (Architect fires on saving, not on toppling). */
function settleNow() {
  const fresh = prog.settleAchievements(earned, achCtx());
  if (!fresh.length) return;
  recomputeBudget();
  storage.savePlayer(playerId, save);
  for (const a of fresh) ui.toast(a.icon, a.name, 'Unlocked: ' + a.gives, true);
  audio.achievement();
  ui.renderPalette();
  updateHud();
}

// ===================== DEBUG: UNLOCK ALL =====================
// Temporary, and meant to be deleted. To remove it: delete this function and the
// `onUnlockAll` entry in the api object above, then the block in index.html's #scMenu and
// the `mnUnlock` id + listener in ui.js. Nothing else refers to it.
//
// It is one loop because progression.js has no owned-items list: `earned` is the only
// state, and tableFor / upgradeBudget / tools / surfacesFor / skinsFor are all pure
// functions OF it. Flip every badge on and the whole ladder opens at once, correctly, with
// nothing to keep in step. The challenge flags go on too, so the ch1..ch7 badges stay true
// to what save.challenges says rather than claiming a puzzle was cleared when it was not.
function unlockEverything() {
  for (const a of prog.ACHIEVEMENTS) earned[a.id] = 1;
  for (const c of CHALLENGES) save.challenges[c.id] = 1;
  recomputeBudget();
  storage.savePlayer(playerId, save);
  ui.renderPalette();
  updateHud();
  audio.achievement();
  ui.toast('gi-trophy', 'Everything unlocked',
    prog.ACH_COUNT + ' badges, every table and every trick. Debug switch.', true);
}
// =================== end DEBUG: UNLOCK ALL ===================

// One reused context object: settleAchievements runs after every single run.
const _ctx = { run: sim.run, stats: {}, challenges: {}, dominoCap: q.dominoCap };
function achCtx() {
  _ctx.run = sim.run;
  _ctx.stats = save ? save.stats : {};
  _ctx.challenges = save ? save.challenges : {};
  return _ctx;
}

// ==========================================================================
// FRAME
// ==========================================================================
let last = 0;
let fpsAcc = 0, fpsN = 0, drawMs = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
  last = now;
  audio.audioFrame();

  let need = dirty;

  if (running) {
    runClock += dt;
    const s = sim.step(dt);
    if (s === sim.STEP_MOVED) { need = true; quietTime = 0; }
    else if (s === sim.STEP_STILL) quietTime += dt;
    // Note what is NOT used here: Rapier's active-body count. An untouched standing
    // domino can sit in the active set indefinitely, so "no active bodies" never
    // arrives and the result screen never shows. Measured stillness is the only signal
    // that means what it says. QUIET is generous because a chain often has a beat of
    // stillness between one section finishing and the next being reached.
    if (quietTime > QUIET && runClock > 1.2) endRun();
    // Hard stop, so a marble circling a Huge table for ever cannot hold the result
    // screen hostage.
    if (running && runClock > 45) endRun();
  }
  if (stepConfetti(dt)) need = true;
  if (orbit.updateCamera()) need = true;

  if (!need) return;
  dirty = false;

  const t0 = performance.now();
  renderer.render(scene, camera);
  drawMs = performance.now() - t0;

  fpsAcc += dt; fpsN++;
  governor(dt * 1000);

  if (running) updateHud();

  if (perfOn && fpsN >= 20) {
    ui.setPerf(
      'fps   ' + (fpsN / fpsAcc).toFixed(0) + '\n' +
      'draw  ' + drawMs.toFixed(2) + ' ms\n' +
      'phys  ' + perf.msPhys.toFixed(2) + ' ms\n' +
      'awake ' + perf.awake + '\n' +
      'park  ' + sim.parkedCount() + '\n' +
      'parts ' + sim.partCount() + '\n' +
      'calls ' + renderer.info.render.calls + '\n' +
      'pr    ' + perf.pixelRatio.toFixed(2) + (perf.shadows ? ' +sh' : '') + '\n' +
      'tier  ' + quality.levelName() + (govStep ? ' -' + govStep : ''), true);
    fpsAcc = 0; fpsN = 0;
  }
}

// --- the adaptive governor ------------------------------------------------
// One ladder, one direction. Every 90 RENDERED frames, if the average interval is over
// 27 ms (~37 fps) we give one thing up. It never climbs back: oscillating between two
// quality levels looks far worse than sitting at the lower one, and a child does not
// want to watch the picture pulse.
const LADDER = [
  () => { if (perf.pixelRatio > 1.0) { setPixelRatio(1.0); return 'sharpness'; } return null; },
  () => { if (perf.shadows) { setShadows(false); return 'shadows'; } return null; },
  () => { if (perf.pixelRatio > 0.85) { setPixelRatio(0.85); return 'sharpness'; } return null; },
  () => {
    perf.dominoCap = Math.max(80, Math.round(perf.dominoCap * 0.7));
    govCap = perf.dominoCap;
    recomputeBudget();
    updateHud();
    return 'the domino limit';
  },
];
let govStep = 0, govFrames = 0, govAcc = 0;

function governor(frameMs) {
  govAcc += frameMs;
  if (++govFrames < 90) return;
  const avg = govAcc / govFrames;
  govAcc = 0; govFrames = 0;
  if (avg <= 27) return;
  while (govStep < LADDER.length) {
    const what = LADDER[govStep++]();
    if (what) {
      ui.toast('turtle', 'Turning down ' + what, 'Keeping it smooth on this tablet.', false);
      invalidate();
      return;
    }
  }
}

function switchQuality() {
  quality.setLevel(quality.otherLevel(), true);
  persistNow();
  // The profile is baked into the renderer, the materials and the instance capacities
  // at module load, so the only honest way to change it is a reload.
  location.reload();
}

// ==========================================================================
// KEYBOARD (desktop testing, and a bonus for whoever finds it)
// ==========================================================================
function onKey(e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const k = (e.key || '').toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
  if (ui.anyScreenOpen()) { if (k === 'escape') ui.hideScreens(); return; }
  if (!playerId) return;
  if (k === ' ' || k === 'enter') { e.preventDefault(); running ? backToBuild() : go(); return; }
  if (k === 'escape') { ui.renderMenu(); ui.show('scMenu'); return; }
  if (running) return;
  if (k === 'f') api.onFit();
  else if (k === 't') api.onTop();
  else if (k === 'u') doUndo();
  else if (k === 'r') doRedo();
  // X still turns things, now by a quarter turn per press: the dial is the touch control and
  // this is the desktop shortcut for the same one angle. One press is one undo entry, same as
  // one drag of the dial.
  else if (k === 'x') nudgeRotation(Math.PI / 2);
  else if (k >= '1' && k <= '9') {
    const t = tools.TOOLS[+k - 1];
    if (t && !(t.needs && !prog.tools(earned)[t.needs])) api.onTool(t.id);
  }
}

/** Turn by `delta`, going through the same begin/set/end the dial uses so undo behaves. */
function nudgeRotation(delta) {
  tools.beginRotate();
  tools.setRotation(tools.currentItemRot() + delta);
  ui.setRotDial(tools.currentItemRot());
  tools.endRotate();
}

function hintForTool(id) {
  const t = tools.TOOLS.find(x => x.id === id);
  if (t) ui.hint(t.tip);
}

bootUp();
