// Shared arcade save file. Shape (matching the other games in the arcade):
//   localStorage['calebArcadeData'] = { ..., stoneSkip: { caleb: {...}, ezra: {...},
//                                                        lastPlayer: 'caleb' } }

import { ACHIEVEMENTS } from './progression.js';

const KEY = 'calebArcadeData';

export const PLAYERS = [
  { id: 'caleb', name: 'Caleb', avatar: '🧢' },
  { id: 'ezra', name: 'Ezra', avatar: '⭐' },
];

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function writeAll(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* full / private mode */ }
}

function blankStats() {
  return {
    throws: 0, totalSkips: 0, plunks: 0, perfects: 0,
    streak5: 0, bestStreak5: 0, roundBest: 0,
    lilyLands: 0, fishEaten: 0, postBounces: 0, beaconHits: 0, reedDoubles: 0,
    kinds: {}, specials: {}, spots: {}, buoys: {},
  };
}

function blank() {
  return {
    bestSkips: 0, bestDistance: 0, throws: 0,
    // the 12 lake-target achievements (see targets.js). Older saves called this
    // "challenges"; the concept is now just "achievements", so loadPlayer migrates.
    targets: {},
    seenTutorial: false, lastSpot: 'main',
    // phase 2: Skip Points economy, unlocks and the cosmetics/upgrades they set
    points: 0, owned: {}, achievements: {}, armLevel: 0,
    theme: 'day', trail: '', splash: '', hat: '',
    // phase 3: when each special stone was last claimed off the beach (epoch ms),
    // so its one-minute cooldown survives a reload instead of resetting.
    specialAt: {},
    stats: blankStats(),
  };
}

export function loadPlayer(id) {
  const all = readAll();
  const g = all.stoneSkip || {};
  const s = Object.assign(blank(), g[id] || {});
  // Saves written before phase 2 have no stats block, and a partial one (from a
  // future/older shape) must not leave holes the achievement checks would read.
  s.stats = Object.assign(blankStats(), s.stats || {});
  for (const k of ['kinds', 'specials', 'spots', 'buoys']) {
    if (!s.stats[k] || typeof s.stats[k] !== 'object') s.stats[k] = {};
  }
  for (const k of ['targets', 'owned', 'achievements', 'specialAt']) {
    if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  }
  // phase 3 migration: challenges and achievements are one concept now
  if (s.challenges && typeof s.challenges === 'object') {
    for (const k in s.challenges) if (s.challenges[k]) s.targets[k] = true;
    delete s.challenges;
  }
  delete s.stoneSel;              // special stones are no longer held/equipped
  if (typeof s.points !== 'number' || !isFinite(s.points)) s.points = 0;
  return s;
}

export function savePlayer(id, state) {
  const all = readAll();
  if (!all.stoneSkip) all.stoneSkip = {};
  all.stoneSkip[id] = state;
  all.stoneSkip.lastPlayer = id;
  writeAll(all);
}

export function lastPlayer() {
  const all = readAll();
  return (all.stoneSkip && all.stoneSkip.lastPlayer) || null;
}

export function playerSummary(id) {
  const s = loadPlayer(id);
  // Only achievements that still EXIST count: an old save may hold a retired id
  // (total1000 was removed), and "37 of 36 earned" on the player card is a bug.
  const live = new Set(ACHIEVEMENTS.map(a => a.id));
  const done = Object.keys(s.achievements || {}).filter(k => s.achievements[k] && live.has(k)).length;
  return {
    bestSkips: s.bestSkips || 0, bestDistance: s.bestDistance || 0, done,
    points: s.points || 0,
  };
}
