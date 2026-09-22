// Waypoints — high scores, in the arcade's shared localStorage item.
//
// Scores are kept per PLAYER and per DIFFICULTY, because "best ever" across two
// boys and two difficulties is a number nobody can be proud of.
//
// `#sandbox` in the URL makes the whole thing a no-op, so a test can play a
// hundred games without writing a single one into the real table.

const KEY = 'calebArcadeData';
const GAME = 'waypoints';
const sandbox = () => typeof location !== 'undefined' && location.hash.includes('sandbox');

function all() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

// The session's copy is the source of truth while the page is open, and
// localStorage is where it is mirrored. That distinction is what makes
// `#sandbox` mean "do not persist" rather than "do not work": a sandboxed game
// adds walkers and files scores exactly like a real one, and none of it
// survives the reload.
let cache = null;
function get() {
  if (!cache) {
    const d = all()[GAME] || {};
    cache = { players: d.players || [], scores: d.scores || {}, last: d.last || null };
  }
  return cache;
}

export function loadState() {
  const s = get();
  return { players: [...s.players], scores: s.scores, last: s.last };
}

function save(next) {
  cache = next;
  if (sandbox()) return;
  try {
    const d = all();
    d[GAME] = next;
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* private window, or storage full */ }
}

export function addPlayer(name) {
  const s = loadState();
  const clean = String(name || '').trim().slice(0, 16);
  if (!clean) return s;
  if (!s.players.includes(clean)) s.players.push(clean);
  s.last = clean;
  save(s);
  return s;
}

export function removePlayer(name) {
  const s = loadState();
  s.players = s.players.filter((p) => p !== name);
  delete s.scores[name];
  if (s.last === name) s.last = s.players[0] || null;
  save(s);
  return s;
}

export function rememberPlayer(name) {
  const s = loadState();
  s.last = name; save(s); return s;
}

/** File a finished game. Losses are recorded too — they just never top the table. */
export function record(name, difficulty, total, lost) {
  const s = loadState();
  const by = (s.scores[name] = s.scores[name] || {});
  const row = (by[difficulty] = by[difficulty] || { best: 0, games: 0, wins: 0 });
  row.games++;
  if (!lost) { row.wins++; if (total > row.best) row.best = total; }
  save(s);
  return s;
}

/** The table: every player's best at this difficulty, best first. */
export function table(difficulty) {
  const s = loadState();
  return s.players
    .map((p) => ({ name: p, ...((s.scores[p] || {})[difficulty] || { best: 0, games: 0, wins: 0 }) }))
    .sort((a, b) => b.best - a.best);
}
