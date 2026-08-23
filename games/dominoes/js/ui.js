// All DOM. No Three.js, no Rapier, no physics — ui.js reads state through the `api`
// object main.js hands it and calls back out; it never reaches into the simulation.
//
// House style note: this is a DOM HUD rather than the arcade's usual canvas-drawn pill.
// That follows the 3D precedent in the repo (games/sea-glass): with a WebGL canvas there
// is no 2D context to draw a pill into, and a second overlay canvas would cost a
// full-screen composite every frame for the sake of some text. The pill is styled to
// match the canvas-drawn ones exactly.

import { PLAYERS } from './storage.js';
import { TOOLS } from './tools.js';
import { ITEMS, FAMILIES } from './items-def.js';
import { ACHIEVEMENTS } from './progression.js';
import { CHALLENGES } from './challenges.js';
import { icon, paintIcons } from './icons.js';
import { COLOURS, SKINS, SURFACES, SPACING_IDS, SPACINGS, TABLES, TABLE_ORDER } from './consts.js';

const $ = (id) => document.getElementById(id);
let api = null;

const el = {};
function cache() {
  const ids = ['boot', 'bootMsg', 'hud', 'hudDom', 'hudFell', 'hint', 'goal', 'toasts', 'perf',
    'palette', 'tray', 'bar', 'go', 'gogrp', 'runbar', 'btnUndo', 'btnRedo', 'undoN', 'redoN',
    'rotbar', 'rotTrack', 'rotKnob', 'rotVal',
    'btnStyle', 'btnChal', 'btnAchv', 'btnFit', 'btnTop', 'btnMenu', 'btnBuild', 'btnAgain',
    'scPlayers', 'playerRow', 'qualityNote', 'scMenu', 'menuWho', 'menuStats',
    'mnResume', 'mnNew', 'mnChal', 'mnAchv', 'mnSaves', 'mnHelp', 'mnSet', 'mnSwitch',
    'mnUnlock',                       // DEBUG: unlock all — see index.html #scMenu
    'scAchv', 'achvTitle', 'achvList', 'scChal', 'chalList',
    'scSaves', 'saveName', 'btnSave', 'saveNote', 'saveList', 'saveUsage',
    'scStyle', 'colourRow', 'spacingRow', 'spacingNote', 'skinRow', 'tableRow', 'surfRow',
    'scSet', 'setQuality', 'btnQuality', 'btnPerf', 'btnSound', 'setAbout',
    'scHelp', 'scResult', 'resTitle', 'resLine', 'resExtra', 'resBuild', 'resAgain'];
  for (const id of ids) el[id] = $(id);
}

export function init(a) {
  api = a;
  cache();
  // The fixed chrome (back, menu, undo/redo, style, the two pane buttons) is written in
  // index.html, so it names its icon with data-icon and gets it filled in here.
  paintIcons(document);

  // Every pane's close button.
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => hideScreens()));
  // Tapping the dark surround closes a pane too — a kid should never feel trapped.
  document.querySelectorAll('.screen').forEach(s => {
    s.addEventListener('pointerdown', (e) => { if (e.target === s && s.id !== 'scPlayers') hideScreens(); });
  });

  el.goal.addEventListener('click', () => api.onGoal());
  el.btnUndo.addEventListener('click', () => api.onUndo());
  el.btnRedo.addEventListener('click', () => api.onRedo());
  initRotBar();
  el.btnStyle.addEventListener('click', () => { renderStyle(); show('scStyle'); });
  // Challenges and Badges are reachable from the bar AND from the menu. Two ways in is
  // the point: the bar is where a child will actually look, the menu stays a full index.
  el.btnChal.addEventListener('click', () => { renderChallenges(); show('scChal'); });
  el.btnAchv.addEventListener('click', () => { renderAchievements(); show('scAchv'); });
  el.btnFit.addEventListener('click', () => api.onFit());
  el.btnTop.addEventListener('click', () => api.onTop());
  el.btnMenu.addEventListener('click', () => { renderMenu(); show('scMenu'); });
  el.go.addEventListener('click', () => api.onGo());
  el.btnBuild.addEventListener('click', () => api.onBackToBuild());
  el.btnAgain.addEventListener('click', () => api.onAgain());
  el.resBuild.addEventListener('click', () => { hideScreens(); api.onBackToBuild(); });
  el.resAgain.addEventListener('click', () => { hideScreens(); api.onAgain(); });

  el.mnResume.addEventListener('click', () => hideScreens());
  el.mnNew.addEventListener('click', () => { hideScreens(); api.onNew(); });
  el.mnChal.addEventListener('click', () => { renderChallenges(); show('scChal'); });
  el.mnAchv.addEventListener('click', () => { renderAchievements(); show('scAchv'); });
  el.mnSaves.addEventListener('click', () => { renderSaves(); show('scSaves'); });
  el.mnHelp.addEventListener('click', () => show('scHelp'));
  el.mnSet.addEventListener('click', () => { renderSettings(); show('scSet'); });
  el.mnSwitch.addEventListener('click', () => { renderPlayers(); show('scPlayers'); });
  // DEBUG: unlock all. Closes the menu so the change is immediately visible on the table.
  el.mnUnlock.addEventListener('click', () => { hideScreens(); api.onUnlockAll(); });

  el.btnSave.addEventListener('click', doSave);
  el.saveName.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
  el.btnQuality.addEventListener('click', () => api.onQuality());
  el.btnPerf.addEventListener('click', () => { api.onPerf(); renderSettings(); });
  el.btnSound.addEventListener('click', () => { api.onSound(); renderSettings(); });

  buildPalette();
  buildTray();
  tidySeparators();
}

/** Called by main.js on resize/orientation change: the bar rewraps, so re-judge the breaks. */
export function relayoutBar() { tidySeparators(); }

// The rotation dial's row height, learned once at boot by showing it for a single layout and
// hiding it again. It has to be part of the reserved chrome (chromeInsets below) even when it
// is not on screen, because the alternative is a table that resizes every time the dial
// appears. Measuring beats hard-coding: the pill's height comes from three CSS tiers.
let dialRow = 0;
function measureDialRow() {
  const on = el.rotbar.classList.contains('show');
  if (!on) el.rotbar.classList.add('show');
  const h = el.rotbar.getBoundingClientRect().height;
  if (!on) el.rotbar.classList.remove('show');
  if (h > 0) dialRow = h + 8;                 // + the dock's row gap
}

/**
 * How many CSS pixels of canvas the chrome covers, top and bottom, for orbit.fit().
 *
 * Bottom is the bar plus the dial's row — NOT the Tricks tray, which is transient (it closes
 * the moment you pick a trick) and would otherwise make the table jump size on every open.
 * Top is the lowest edge of the three floating top-row elements.
 */
export function chromeInsets() {
  if (!dialRow) measureDialRow();
  let top = 0;
  for (const s of ['.back', '#hud', '#camrow']) {
    const e = document.querySelector(s);
    if (e) top = Math.max(top, e.getBoundingClientRect().bottom);
  }
  const bar = el.bar.getBoundingClientRect().height;
  return { top: Math.round(top) + 6, bottom: Math.round(bar + dialRow) };
}

// ==========================================================================
// SCREENS
// ==========================================================================
export function show(id) {
  hideScreens();
  if (el[id]) el[id].classList.add('show');
}
export function hideScreens() {
  document.querySelectorAll('.screen.show').forEach(s => s.classList.remove('show'));
}
export function anyScreenOpen() { return !!document.querySelector('.screen.show'); }

export function boot(msg) {
  if (msg) el.bootMsg.textContent = msg;
  el.boot.style.display = 'flex';
}
export function bootDone() { el.boot.style.display = 'none'; }

// ==========================================================================
// HUD
// ==========================================================================
export function setHud(placed, budget, fell, capped) {
  el.hudDom.textContent = placed + '/' + budget;
  el.hudDom.className = 'v' + (placed >= budget ? ' warn' : (capped ? ' gold' : ''));
  el.hudFell.textContent = fell;
}

let hintTimer = 0;
export function hint(text, ms) {
  clearTimeout(hintTimer);
  if (!text) { el.hint.classList.remove('show'); return; }
  el.hint.textContent = text;
  el.hint.classList.add('show');
  hintTimer = setTimeout(() => el.hint.classList.remove('show'), ms || 2600);
}

/**
 * The challenge goal chip. It stays on screen for the whole challenge, and tapping it
 * re-reads the goal and the hint — a hint that has faded used to be gone for good, which
 * is no use to a child who has just spent two minutes building.
 */
export function setGoal(text, iconName) {
  // innerHTML, because the chip carries the challenge's own icon: it used to be a glyph
  // glued onto the front of the string, which printed the icon's NAME once icons stopped
  // being characters. The text is still escaped.
  el.goal.innerHTML = !text ? ''
    : (iconName ? '<span class="ic">' + icon(iconName) + '</span>' : '') + esc(text);
  el.goal.classList.toggle('show', !!text);
}

export function setPerf(text, on) {
  el.perf.classList.toggle('show', !!on);
  if (on) el.perf.textContent = text;
}

export function setRunMode(running) {
  el.runbar.classList.toggle('show', running);
  // One bar holds every build control, so one display toggle hides all of them —
  // GO included, since the run bar carries its own "Again".
  el.bar.style.display = running ? 'none' : '';
  el.tray.classList.toggle('show', !running && trayOpen && api.state().tool === 'item');
  if (running) el.rotbar.classList.remove('show');
}

export function setUndo(u, r) {
  el.btnUndo.disabled = !u;
  el.btnRedo.disabled = !r;
  el.undoN.textContent = u ? u : '';
  el.redoN.textContent = r ? r : '';
}

// ==========================================================================
// THE ROTATION DIAL
// ==========================================================================
// Hand-rolled from pointer events rather than an <input type="range">, for three reasons
// that all matter on the target tablet:
//   * `touch-action: none` on the body is inherited, and a native range's thumb drag is a
//     UA touch behaviour. Owning the gesture means it cannot be disabled out from under us.
//   * a 44 px thumb is a two-line CSS job here and a vendor-pseudo-element fight there.
//   * a tap anywhere on the track should JUMP to that angle, which a range only does after
//     the platform decides it should.
//
// The dial is 0..360 degrees left to right. It snaps to eighths of a turn within 3 degrees,
// because "straight" and "square to the last one" are the two angles a child actually wants
// most of the time and a bare pixel-to-radian mapping makes them unhittable.
const TAU = Math.PI * 2;
const SNAP = TAU / 8;
const SNAP_TOL = 0.052;          // 3 degrees
let rotDragging = false;

function initRotBar() {
  const at = (e) => {
    const r = el.rotTrack.getBoundingClientRect();
    let t = (e.clientX - r.left) / (r.width || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let a = t * TAU;
    const n = Math.round(a / SNAP) * SNAP;
    if (Math.abs(a - n) < SNAP_TOL) a = n;
    return a % TAU;
  };
  el.rotbar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rotDragging = true;
    try { el.rotbar.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    api.onRotateStart();
    const a = at(e);
    setRotDial(a);
    api.onRotateInput(a);
  });
  el.rotbar.addEventListener('pointermove', (e) => {
    if (!rotDragging) return;
    e.preventDefault();
    const a = at(e);
    setRotDial(a);
    api.onRotateInput(a);
  });
  const end = () => {
    if (!rotDragging) return;
    rotDragging = false;
    api.onRotateEnd();
  };
  el.rotbar.addEventListener('pointerup', end);
  el.rotbar.addEventListener('pointercancel', end);
}

/** Move the knob to an angle in radians. Display only — it never calls back into tools. */
export function setRotDial(rad) {
  const t = (((rad % TAU) + TAU) % TAU) / TAU;
  el.rotKnob.style.left = (t * 100) + '%';
  el.rotVal.textContent = Math.round(t * 360) + '°';
}

/**
 * The dial is on screen exactly when there is something for it to turn: a selected piece, or
 * a one-domino / trick placement whose preview it steers. It is deliberately NOT shown for
 * Line and Arc, where the angle comes from the direction you dragged and a dial would be a
 * second, contradicting answer to the same question.
 */
function renderRotBar(s) {
  const show = !s.running && (!!s.sel || s.tool === 'single' || s.tool === 'item');
  el.rotbar.classList.toggle('show', show);
}

// ==========================================================================
// PALETTE + TRAY
// ==========================================================================
function buildPalette() {
  el.palette.innerHTML = '';
  el.gogrp.querySelectorAll('.tool').forEach(b => b.remove());
  let grp = null;
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = t.id;
    b.innerHTML = '<span class="ic">' + icon(t.icon) + '</span><span class="nm">' + t.name + '</span>';
    b.addEventListener('click', () => {
      if (b.classList.contains('locked')) { hint('Keep playing to unlock ' + t.name + '!'); return; }
      // Tapping Tricks always opens the drawer, including when Tricks is already the tool —
      // that re-tap is how you go back and swap which trick you are holding.
      if (t.id === 'item') trayOpen = true;
      api.onTool(t.id);
    });
    // The 'go' group does not live in the palette at all: "which domino goes first" is a
    // question about the run, so First sits beside GO, past the last break, where a child
    // looks when they are done building rather than while they are building.
    if (t.grp === 'go') { el.gogrp.insertBefore(b, el.go); continue; }
    // A vertical break wherever the group changes inside the palette: Look + Move + Select
    // (the camera and the selection) are one group, everything that builds is the next.
    if (grp !== null && t.grp !== grp) {
      const s = document.createElement('span');
      s.className = 'vsep';
      el.palette.appendChild(s);
    }
    grp = t.grp;
    el.palette.appendChild(b);
  }
}

/**
 * Hide any group divider that has been stranded at the start or the end of a wrapped row,
 * where it reads as a stray tick mark against the edge of the bar rather than as a break
 * between two groups.
 *
 * `visibility`, not `display`: hiding the box would reflow the bar, which could change the
 * wrapping, which could strand a different divider — a loop. Keeping the box means the
 * geometry this decision was made from stays true.
 */
function tidySeparators() {
  const seps = el.bar.querySelectorAll('.vsep');
  if (!seps.length) return;
  // Every control in the bar, in visual order, with the divider positions marked.
  const items = [];
  const walk = (node) => {
    for (const c of node.children) {
      if (c.classList.contains('grp')) { walk(c); continue; }
      if (c.offsetParent === null && !c.classList.contains('vsep')) continue;
      if (c.style.display === 'none') continue;
      items.push(c);
    }
  };
  walk(el.bar);
  for (const s of seps) s.style.visibility = '';
  const row = (e) => Math.round(e.getBoundingClientRect().top);
  for (let i = 0; i < items.length; i++) {
    const c = items[i];
    if (!c.classList.contains('vsep')) continue;
    const prev = items[i - 1], next = items[i + 1];
    const stranded = !prev || !next || row(prev) !== row(c) || row(next) !== row(c);
    if (stranded) c.style.visibility = 'hidden';
  }
}

// The Tricks drawer is now a latch, not a mirror of the tool: Tricks opens it, picking a trick
// closes it, and leaving the tool closes it too. See the pick handler for why.
let trayOpen = false;

/** Called when the Tricks tool is chosen, including when it is re-chosen to swap tricks. */
export function openTray() { trayOpen = true; }

/**
 * The tray reads as the LADDER, in the order a child unlocks it: the three free tricks
 * first, then one rung per achievement, in the achievement table's own order. Family
 * (the old grouping) is only the tie-break inside a rung, because grouping by it put
 * locked Gadgets ahead of tricks the child had already earned — the drawer told you
 * about things you could not use before things you could.
 */
function trayOrder() {
  const rung = {};
  ACHIEVEMENTS.forEach((a, i) => { rung[a.id] = i; });
  const ids = Object.keys(ITEMS).filter(id => !ITEMS[id].hidden);
  return ids.map((id, i) => {
    const def = ITEMS[id];
    return {
      id,
      // `unlock: null` (the free tricks) sorts before every rung. An unlock key that is not
      // in the table at all sorts last rather than first, so a typo shows up as a tile at the
      // end of the drawer instead of quietly claiming to be free.
      r: def.unlock == null ? -1 : (rung[def.unlock] === undefined ? 99 : rung[def.unlock]),
      f: Math.max(0, FAMILIES.indexOf(def.family)),
      i,
    };
  }).sort((a, b) => (a.r - b.r) || (a.f - b.f) || (a.i - b.i)).map(x => x.id);
}

function buildTray() {
  el.tray.innerHTML = '';
  for (const id of trayOrder()) {
    const def = ITEMS[id];
    const b = document.createElement('button');
    b.className = 'trayitem';
    b.dataset.item = id;
    b.innerHTML = '<span class="ic">' + icon(def.icon) + '</span><span class="nm">' + def.name + '</span>';
    b.addEventListener('click', () => {
      if (b.classList.contains('locked')) { hint(def.name + ' is still locked'); return; }
      api.onItemType(id);
      // Picked: shut the drawer. It is 119 px of the screen at 900x700 and 174 px at 430x800,
      // sitting over exactly the front strip of the table you now have to tap — a tap there
      // used to select a different trick instead of placing the one you chose. Tricks opens
      // it, a pick closes it, the table is clear while you aim.
      trayOpen = false;
      renderPalette();
      hint(def.desc, 3200);
    });
    el.tray.appendChild(b);
  }
}

/** Reflect tool availability + selection. Called whenever unlocks or the tool change. */
export function renderPalette() {
  const s = api.state();
  // The whole bar, not just the palette: First is a tool tile that lives beside GO.
  el.bar.querySelectorAll('.tool[data-tool]').forEach(b => {
    const t = TOOLS.find(x => x.id === b.dataset.tool);
    const locked = !!(t.needs && !s.tools[t.needs]);
    b.classList.toggle('locked', locked);
    b.classList.toggle('on', b.dataset.tool === s.tool);
  });
  if (s.tool !== 'item') trayOpen = false;
  el.tray.classList.toggle('show', trayOpen && s.tool === 'item' && !s.running);
  renderRotBar(s);
  tidySeparators();
  el.tray.querySelectorAll('.trayitem').forEach(b => {
    const def = ITEMS[b.dataset.item];
    const locked = !!(def.unlock && !s.unlocked.has(def.unlock)) && !s.granted.includes(b.dataset.item);
    b.classList.toggle('locked', locked);
    b.classList.toggle('on', b.dataset.item === s.itemType);
  });
}

// ==========================================================================
// TOASTS  (staggered so three unlocks at once are readable, not a stack)
// ==========================================================================
const toastQ = [];
let toastBusy = false;

export function toast(icon, title, sub, gold) {
  toastQ.push({ icon, title, sub, gold });
  if (!toastBusy) pumpToasts();
}
function pumpToasts() {
  const t = toastQ.shift();
  if (!t) { toastBusy = false; return; }
  toastBusy = true;
  const d = document.createElement('div');
  d.className = 'toast' + (t.gold ? ' gold' : '');
  d.innerHTML = '<span class="ic">' + icon(t.icon) + '</span><span><div class="tt">' +
    esc(t.title) + '</div>' + (t.sub ? '<div class="ts">' + esc(t.sub) + '</div>' : '') + '</span>';
  el.toasts.appendChild(d);
  setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 320); }, 2600);
  setTimeout(pumpToasts, 1000);
}
function esc(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ==========================================================================
// PLAYERS
// ==========================================================================
export function renderPlayers() {
  el.playerRow.innerHTML = '';
  for (const p of PLAYERS) {
    const s = api.summary(p.id);
    const b = document.createElement('button');
    b.className = 'pcard';
    b.innerHTML = '<div class="big">' + p.avatar + '</div><div class="nm">' + p.name + '</div>' +
      '<div class="sub">' + s.achievements + ' of ' + ACHIEVEMENTS.length + ' badges<br>' +
      'best run ' + s.best + '</div>';
    b.addEventListener('click', () => api.onPickPlayer(p.id));
    el.playerRow.appendChild(b);
  }
  el.qualityNote.textContent = api.qualityText();
}

export function renderMenu() {
  const s = api.state();
  el.menuWho.textContent = s.playerName + "'s table";
  el.menuStats.textContent = s.badges + ' of ' + ACHIEVEMENTS.length + ' badges · best run ' +
    s.stats.bestRun + ' · ' + s.stats.runs + ' runs · ' +
    s.placed + ' of ' + s.budget + ' dominoes on the table';
}

// ==========================================================================
// ACHIEVEMENTS
// ==========================================================================
export function renderAchievements() {
  const s = api.state();
  el.achvTitle.textContent = 'Achievements — ' + s.badges + '/' + ACHIEVEMENTS.length;
  el.achvList.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const got = !!s.earned[a.id];
    const d = document.createElement('div');
    d.className = 'ach' + (got ? ' got' : '');
    let desc = a.desc;
    if (a.target) desc += ' (' + a.target(s.ctx) + ')';
    let prog = '';
    if (!got) {
      let p = 0;
      try { p = Math.max(0, Math.min(1, a.prog(s.ctx) || 0)); } catch (e) { p = 0; }
      prog = '<div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div>';
    }
    d.innerHTML = '<span class="ic">' + icon(a.icon) + '</span><span style="flex:1">' +
      '<div class="nm">' + esc(a.name) + '</div>' +
      '<div class="ds">' + esc(desc) + '</div>' +
      '<div class="gv">' + (got ? '✓ ' : '') + esc(a.gives) + '</div>' + prog + '</span>';
    el.achvList.appendChild(d);
  }
}

// ==========================================================================
// CHALLENGES
// ==========================================================================
export function renderChallenges() {
  const s = api.state();
  el.chalList.innerHTML = '';
  for (const c of CHALLENGES) {
    const done = !!s.challenges[c.id];
    const b = document.createElement('button');
    b.className = 'chcard' + (done ? ' done' : '');
    b.innerHTML = '<span class="ic">' + icon(c.icon) + '</span><span style="flex:1">' +
      '<div class="nm">' + c.n + '. ' + esc(c.name) + (done ? ' ✓' : '') + '</div>' +
      '<div class="ds">' + esc(c.brief) + '</div></span>';
    b.addEventListener('click', () => { hideScreens(); api.onChallenge(c.id); });
    el.chalList.appendChild(b);
  }
}

// ==========================================================================
// SAVES  (named slots, the games/race-maker pattern)
// ==========================================================================
function doSave() {
  const name = el.saveName.value.trim().slice(0, 30);
  if (!name) { el.saveNote.textContent = 'Give it a name first.'; return; }
  api.onSave(name);
  el.saveName.value = '';
  renderSaves();
}

export function renderSaves() {
  const s = api.state();
  const names = Object.keys(s.creations);
  el.saveNote.textContent = pendingHint || (names.length + ' of ' + s.slots + ' slots used' +
    (names.length >= s.slots ? ' — saving now replaces the oldest name you type over.' : ''));
  pendingHint = '';
  // Small, permanent, and the reason a "it would not save" report is answerable next time:
  // the one shared localStorage quota is 64 games wide, so the interesting number is not
  // ours, it is the total.
  if (el.saveUsage) el.saveUsage.textContent = api.storageText();
  el.saveList.innerHTML = '';
  if (!names.length) {
    el.saveList.innerHTML = '<p class="note">Nothing saved yet. Build something and give it a name.</p>';
    return;
  }
  for (const n of names) {
    const c = s.creations[n];
    const nd = c && c.d ? c.d.length : 0;
    const ni = c && c.i ? c.i.length : 0;
    const row = document.createElement('div');
    row.className = 'slot';
    row.innerHTML = '<span class="nm">' + esc(n) + '</span><span class="mt">' + nd +
      ' dominoes' + (ni ? ', ' + ni + ' tricks' : '') + '</span>';
    const load = document.createElement('button');
    load.className = 'btn sm pri';
    load.textContent = 'Load';
    load.addEventListener('click', () => { hideScreens(); api.onLoad(n); });
    const del = document.createElement('button');
    del.className = 'btn sm dgr';
    del.textContent = '✕';
    del.addEventListener('click', () => { api.onDeleteSave(n); renderSaves(); });
    row.appendChild(load);
    row.appendChild(del);
    el.saveList.appendChild(row);
  }
}

// ==========================================================================
// STYLE
// ==========================================================================
export function renderStyle() {
  const s = api.state();

  el.colourRow.innerHTML = '';
  COLOURS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i === s.colour ? ' on' : '');
    b.style.background = '#' + c.hex.toString(16).padStart(6, '0');
    b.title = c.name;
    b.addEventListener('click', () => { api.onSetColour(i); renderStyle(); });
    el.colourRow.appendChild(b);
  });

  el.spacingNote.textContent = s.tools.spacing ? '' : '(unlock with Round the Bend)';
  el.spacingRow.innerHTML = '';
  for (const id of SPACING_IDS) {
    const sp = SPACINGS[id];
    const b = document.createElement('button');
    b.className = 'btn sm' + (id === s.spacing ? ' pri' : '');
    b.innerHTML = sp.name + ' <span class="sup">' + sp.label + '</span>';
    b.disabled = !s.tools.spacing && id !== 'normal';
    b.addEventListener('click', () => { api.onSetSpacing(id); renderStyle(); });
    el.spacingRow.appendChild(b);
  }

  el.skinRow.innerHTML = '';
  for (const id in SKINS) {
    const ok = s.skins.includes(id);
    const b = document.createElement('button');
    b.className = 'btn sm' + (id === s.skin ? ' pri' : '');
    b.textContent = SKINS[id].name;
    b.disabled = !ok;
    b.addEventListener('click', () => { api.onSetSkin(id); renderStyle(); });
    el.skinRow.appendChild(b);
  }

  el.tableRow.innerHTML = '';
  for (const id of TABLE_ORDER) {
    const ok = TABLE_ORDER.indexOf(id) <= s.tableTier;
    const b = document.createElement('button');
    b.className = 'btn sm' + (id === s.table ? ' pri' : '');
    b.textContent = TABLES[id].name;
    b.disabled = !ok;
    b.addEventListener('click', () => { api.onSetTable(id); renderStyle(); });
    el.tableRow.appendChild(b);
  }

  el.surfRow.innerHTML = '';
  for (const id in SURFACES) {
    const ok = s.surfaces.includes(id);
    const b = document.createElement('button');
    b.className = 'btn sm' + (id === s.surface ? ' pri' : '');
    b.textContent = SURFACES[id].name;
    b.disabled = !ok;
    b.addEventListener('click', () => { api.onSetSurface(id); renderStyle(); });
    el.surfRow.appendChild(b);
  }
}

// ==========================================================================
// SETTINGS
// ==========================================================================
export function renderSettings() {
  const s = api.state();
  el.setQuality.textContent = api.qualityText();
  el.btnQuality.textContent = 'Switch to ' + s.otherQuality + ' quality';
  el.btnPerf.textContent = s.perfOn ? 'Hide frame counter' : 'Show frame counter';
  el.btnSound.textContent = 'Sound: ' + (s.sound ? 'on' : 'off');
  el.setAbout.textContent = api.aboutText();
}

// ==========================================================================
// RESULT
// ==========================================================================
export function showResult(r) {
  el.resTitle.textContent = r.title;
  el.resLine.textContent = r.line;
  el.resExtra.innerHTML = r.extra || '';
  show('scResult');
}

// doSave() re-renders the list straight after the save, which would wipe a hint set
// during it (the slots-full message and the storage-refused message both landed here
// and were never seen). So a hint survives exactly one render.
let pendingHint = '';
export function setSaveHint(text) { pendingHint = text; el.saveNote.textContent = text; }
