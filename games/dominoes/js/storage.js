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
//
// WHY THERE IS A PRUNE LADDER IN HERE. localStorage is ONE quota (~5 MB of UTF-16
// characters) shared by the whole origin — all 64 games — and `calebArcadeData` is
// one key holding all of them, so every save here rewrites the whole blob. When the
// origin is at its limit, `setItem` throws and NOTHING can be saved: not this game's
// creation, not any other game's progress. A child who has just built something must
// not lose it to that, so a refused write is retried after dropping data the game can
// regenerate — the autosaved table (`lastLayout`), other players' first — and a NAMED
// creation is never dropped to make room. If it still will not fit, the caller gets
// `false` plus `failKind()` ('full' vs 'off'), and reports it in words a child can act
// on rather than swallowing it.

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

/** This page's `dominoes` slice overlaid on whatever is on disk RIGHT NOW. */
function buildTree() {
  const mine = root().dominoes;
  const disk = readAll();
  const merged = Object.assign({}, disk);
  const dom = Object.assign({}, (disk.dominoes && typeof disk.dominoes === 'object') ? disk.dominoes : {});
  for (const k of dirty) dom[k] = mine[k];
  merged.dominoes = dom;
  return merged;
}

/**
 * One write attempt. True only if the bytes are genuinely on disk afterwards, which is
 * NOT the same as setItem not throwing: it can succeed and still leave nothing behind
 * (evicted quota, storage partitioned away), and that silent version is exactly the
 * "it was gone after a refresh" report. Never throws.
 */
function attempt(json) {
  try { localStorage.setItem(KEY, json); } catch (e) { return false; }
  try { return localStorage.getItem(KEY) === json; } catch (e) { return false; }
}

/**
 * Things we are willing to throw away to make a save fit, cheapest first. Each one
 * mutates BOTH the tree being written and the in-memory copy — otherwise the next
 * autosave puts the same bytes straight back and fails again. Named creations are
 * absent from this list on purpose: they are the child's work, and the game deletes
 * them only when the child asks it to.
 */
function pruneLadder(tree, meId) {
  const dom = tree.dominoes;
  const mine = root().dominoes;
  const steps = [];
  for (const p of PLAYERS) {
    if (p.id === meId) continue;
    steps.push(() => {                             // the OTHER brother's autosave first
      if (!dom[p.id] || !dom[p.id].lastLayout) return false;
      dom[p.id] = Object.assign({}, dom[p.id], { lastLayout: null });
      if (mine[p.id]) mine[p.id].lastLayout = null;
      dirty.add(p.id);
      return true;
    });
  }
  steps.push(() => {                               // then our own — the table is on screen
    if (!meId || !dom[meId] || !dom[meId].lastLayout) return false;
    dom[meId] = Object.assign({}, dom[meId], { lastLayout: null });
    if (mine[meId]) mine[meId].lastLayout = null;
    dirty.add(meId);
    return true;
  });
  return steps;
}

let lastWriteOk = true;
let lastFail = '';        // '' | 'full' | 'off'
let prunedForRoom = false;

function writeAll(meId) {
  const tree = buildTree();
  if (attempt(JSON.stringify(tree))) {
    lastWriteOk = true; lastFail = ''; return true;
  }
  // Refused. Make room from our own regenerable data and try again — one attempt per
  // rung, because the ladder is two or three steps long and each retry is a full
  // re-serialise of the shared blob.
  for (const step of pruneLadder(tree, meId)) {
    if (!step()) continue;
    if (attempt(JSON.stringify(tree))) {
      lastWriteOk = true; lastFail = ''; prunedForRoom = true; return true;
    }
  }
  // Still refused. Tell the difference between a browser that HAS storage and has run
  // out of it and one that will not store anything at all, because the two need
  // completely different sentences said to the player.
  const u = usage();
  lastFail = (u && u.total > 200000) ? 'full' : 'off';
  lastWriteOk = false;
  return false;
}

/** False if the most recent save did not reach the disk. main.js surfaces this. */
export function saveWorked() { return lastWriteOk; }
/** Why the last write failed: 'full' (quota) or 'off' (storage refused outright). */
export function failKind() { return lastFail; }
/** True once this session has had to drop an autosave to fit a save in. */
export function prunedToFit() { return prunedForRoom; }

/**
 * How much of the one shared quota is in use, in UTF-16 characters: `total` for the
 * whole origin (every game, every key) and `mine` for this game's slice. Reported to
 * the player when a save is refused, because "storage is full" is only actionable if
 * you can see that it is 63 other games filling it. null if storage is unreadable.
 */
export function usage() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      total += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch (e) { return null; }
  let mine = 0;
  try { mine = JSON.stringify(root().dominoes || {}).length; } catch (e) { mine = 0; }
  return { total, mine };
}

/**
 * Can this browser store anything at all, and if not, why? 'ok' | 'full' | 'off'. Called
 * once at boot so a child is told BEFORE building for an hour, not after — that was the
 * moment the game used to pick. A scratch key rather than KEY, so a browser that fails
 * the probe cannot damage what is already saved.
 */
export function probe() {
  let ok = false;
  try {
    localStorage.setItem('__dom_probe', '1');
    ok = localStorage.getItem('__dom_probe') === '1';
    localStorage.removeItem('__dom_probe');
  } catch (e) { ok = false; }
  if (ok) return 'ok';
  const u = usage();
  return (u && u.total > 200000) ? 'full' : 'off';
}

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
  return writeAll(playerId);
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
  return writeAll(r.dominoes.lastPlayer || null);
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
