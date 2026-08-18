// Shared-arcade persistence. Everything lives under
// calebArcadeData.seaGlass.<player>, plus a tiny bit of top-level state.

import { GLASS_IDS, BEACHES, STARTING_BEACHES } from './data.js';

const KEY = 'calebArcadeData';
export const PLAYERS = [
  { id: 'caleb', name: 'Caleb', avatar: '\u{1F9D2}' },
  { id: 'ezra', name: 'Ezra', avatar: '\u{1F476}' },
];

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function writeAll(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { /* private mode / full quota — play on without saving */ }
}

function freshPlayer() {
  const glass = {};
  for (const id of GLASS_IDS) glass[id] = 0;
  const ceramics = {};
  for (const b of BEACHES) ceramics[b.id] = [];
  return {
    glass,
    weight: 0,          // grams
    ceramics,           // beachId -> array of found shard indices (0..9)
    ceramicFound: 0,    // total shards ever found
    completed: [],      // beachIds whose 10-shard set is done
    unlocked: {
      beaches: STARTING_BEACHES.slice(),
      bottles: ['jamjar'],
      moves: [],
      titles: [],
    },
    milestones: [],     // ids already awarded
    stats: { sections: 0, visits: 0, bestSection: 0, totalFinds: 0 },
    bottleMode: 'separate',
    bottleStyle: 'jamjar',
    lastBeach: 'pebbleCove',
  };
}

/** Fill in anything a previous version did not have. Mutates + returns s. */
function migrate(s) {
  const base = freshPlayer();
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  for (const id of GLASS_IDS) if (typeof s.glass[id] !== 'number') s.glass[id] = 0;
  for (const b of BEACHES) if (!Array.isArray(s.ceramics[b.id])) s.ceramics[b.id] = [];
  for (const k of Object.keys(base.unlocked)) {
    if (!Array.isArray(s.unlocked[k])) s.unlocked[k] = base.unlocked[k].slice();
  }
  for (const id of STARTING_BEACHES) {
    if (!s.unlocked.beaches.includes(id)) s.unlocked.beaches.push(id);
  }
  if (!s.unlocked.bottles.includes('jamjar')) s.unlocked.bottles.push('jamjar');
  for (const k of Object.keys(base.stats)) {
    if (typeof s.stats[k] !== 'number') s.stats[k] = base.stats[k];
  }
  return s;
}

let cachedRoot = null;

function root() {
  if (!cachedRoot) {
    cachedRoot = readAll();
    if (!cachedRoot.seaGlass) cachedRoot.seaGlass = {};
  }
  return cachedRoot;
}

export function loadPlayer(playerId) {
  const sg = root().seaGlass;
  if (!sg[playerId]) sg[playerId] = freshPlayer();
  return migrate(sg[playerId]);
}

export function savePlayer(playerId, save) {
  const r = root();
  r.seaGlass[playerId] = save;
  r.seaGlass.lastPlayer = playerId;
  writeAll(r);
}

export function lastPlayer() {
  return root().seaGlass.lastPlayer || null;
}

/**
 * Device-wide settings (currently just the quality level) live NEXT TO the player
 * saves at calebArcadeData.seaGlass.<key>, not inside a player — the tablet is
 * slow for Caleb and Ezra alike.
 *
 * They deliberately go through the same cached root object as the saves: writing
 * localStorage behind storage.js's back would be silently undone by the next
 * savePlayer, which rewrites the whole cached tree.
 */
export function readSetting(k, dflt) {
  const v = root().seaGlass[k];
  return v === undefined ? dflt : v;
}
export function writeSetting(k, v) {
  const r = root();
  r.seaGlass[k] = v;
  writeAll(r);
}

export function playerSummary(playerId) {
  const sg = root().seaGlass;
  if (!sg[playerId]) return { pieces: 0, weight: 0, ceramics: 0 };
  const s = migrate(sg[playerId]);
  let pieces = 0;
  for (const id of GLASS_IDS) pieces += s.glass[id] || 0;
  return { pieces, weight: Math.round(s.weight), ceramics: s.completed.length };
}

// There is no mute button: the sound is part of the game and the tablet has a
// volume rocker, so nothing here persists an audio preference.

// --- derived stats (used by HUD, collection, milestones) --------------------

export function totalPieces(s) {
  let n = 0;
  for (const id of GLASS_IDS) n += s.glass[id] || 0;
  return n;
}
export function coloursFound(s) {
  let n = 0;
  for (const id of GLASS_IDS) if ((s.glass[id] || 0) > 0) n++;
  return n;
}
