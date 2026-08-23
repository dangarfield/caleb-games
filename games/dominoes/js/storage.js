// Shared-arcade persistence. Everything lives under calebArcadeData.dominoes:
//
//   dominoes.<playerId>   per-player save (achievements, stats, named creations)
//   dominoes.quality      DEVICE setting  (see quality.js)
//   dominoes.lastPlayer   who played last
//
// Device settings deliberately go through the same cached root object as the player
// saves: writing localStorage behind this module's back would be silently undone by
// the next savePlayer(). Every write re-reads the key and overlays only the sub-keys
// THIS page changed, so the other 63 games (and a second tab) survive; and every
// write is read back, so a save that did not land is reported instead of ignored.

const KEY = 'calebArcadeData';

export const PLAYERS = [
  { id: 'caleb', name: 'Caleb', avatar: '\u{1F9D2}' },
  { id: 'ezra', name: 'Ezra', avatar: '\u{1F476}' },
];

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) { return {}; }
}

// Which `dominoes.*` sub-keys this page has actually changed. Everything else is
// re-read from disk on every write, so a second tab, the arcade hub's settings
// panel, or another of the 64 games cannot be clobbered by our boot-time snapshot
// — and cannot clobber us either.
const dirty = new Set();

/** True only if the bytes are genuinely ON DISK afterwards. Never throws. */
let lastWriteOk = true;
function writeAll() {
  const mine = root().dominoes;
  let json = '';
  try {
    const disk = readAll();                       // whatever is there RIGHT NOW
    const merged = Object.assign({}, disk);
    const dom = Object.assign({}, (disk.dominoes && typeof disk.dominoes === 'object') ? disk.dominoes : {});
    for (const k of dirty) dom[k] = mine[k];
    merged.dominoes = dom;
    json = JSON.stringify(merged);
    localStorage.setItem(KEY, json);
  } catch (e) {
    // Private mode, a disabled-storage setting, or a full quota. The child must be
    // told rather than left thinking the save worked, so this is not swallowed.
    lastWriteOk = false;
    return false;
  }
  // Verify. setItem can succeed and still leave nothing behind (evicted quota,
  // storage partitioned away), which is exactly the "it was gone after a refresh"
  // report — a silent failure is the one failure mode a save must never have.
  let back = null;
  try { back = localStorage.getItem(KEY); } catch (e) { back = null; }
  lastWriteOk = back === json;
  return lastWriteOk;
}

/** False if the most recent save did not reach the disk. main.js surfaces this. */
export function saveWorked() { return lastWriteOk; }

function freshStats() {
  return {
    runs: 0,            // how many times GO was pressed
    bestRun: 0,         // most dominoes toppled in one run
    totalFallen: 0,     // lifetime
    bestBallKnock: 0,   // most dominoes credited to one ball hit
    maxColours: 0,      // most distinct colours toppled in one run
    maxChain: 0,        // most DIFFERENT trick items triggered in one run
    saveCount: 0,       // creations saved (ever, not current count)
    dominoesPlaced: 0,
  };
}

function freshPlayer() {
  return {
    // Achievements are the ONLY currency: every unlock is DERIVED from this map
    // (progression.js unlockedSet), so there is no separate `owned` list that could
    // drift out of step and nothing to "reconcile" on load.
    achievements: {},
    challenges: {},     // id -> true, cleared challenges
    stats: freshStats(),
    creations: {},      // name -> layout JSON  (named slots, race-maker pattern)
    lastLayout: null,   // autosave of the table you were building
    spacing: 'normal',
    colour: 0,
    skin: 'plain',
    surface: 'felt',
    seenIntro: false,
  };
}

/** Fill in anything a previous version did not have. Mutates + returns s. */
function migrate(s) {
  const base = freshPlayer();
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
  if (!s.challenges || typeof s.challenges !== 'object') s.challenges = {};
  if (!s.creations || typeof s.creations !== 'object') s.creations = {};
  const bs = freshStats();
  if (!s.stats || typeof s.stats !== 'object') s.stats = bs;
  for (const k of Object.keys(bs)) if (typeof s.stats[k] !== 'number') s.stats[k] = bs[k];
  return s;
}

let cachedRoot = null;
function root() {
  if (!cachedRoot) {
    cachedRoot = readAll();
    // A truthy non-object here (some other version, or a hand-edited key) would make
    // every `r.dominoes[id] = save` a silent no-op that still writes cleanly.
    const d = cachedRoot.dominoes;
    if (!d || typeof d !== 'object' || Array.isArray(d)) cachedRoot.dominoes = {};
  }
  return cachedRoot;
}

export function loadPlayer(playerId) {
  const d = root().dominoes;
  if (!d[playerId]) d[playerId] = freshPlayer();
  return migrate(d[playerId]);
}

export function savePlayer(playerId, save) {
  const r = root();
  r.dominoes[playerId] = save;
  r.dominoes.lastPlayer = playerId;
  dirty.add(playerId);
  dirty.add('lastPlayer');
  return writeAll();
}

export function lastPlayer() { return root().dominoes.lastPlayer || null; }

/** Device-wide settings live NEXT TO the player saves, not inside one. */
export function readSetting(k, dflt) {
  const v = root().dominoes[k];
  return v === undefined ? dflt : v;
}
export function writeSetting(k, v) {
  const r = root();
  r.dominoes[k] = v;
  dirty.add(k);
  return writeAll();
}

/** Small summary for the player-select cards. */
export function playerSummary(playerId) {
  const d = root().dominoes;
  if (!d[playerId]) return { achievements: 0, best: 0, creations: 0 };
  const s = migrate(d[playerId]);
  return {
    achievements: Object.keys(s.achievements).length,
    best: s.stats.bestRun || 0,
    creations: Object.keys(s.creations).length,
  };
}
