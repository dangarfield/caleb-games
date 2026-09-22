// Waypoints — the turn machine.
//
// `rules.js` answers questions about the map. This drives the game: whose turn
// it is, what the weather gave them, what a move did to their sheet, when a hike
// ends and whether they finished it somewhere that counts.
//
// It is pure in the sense that matters: no canvas, no DOM, no timers. Every
// function takes the game and returns the game changed, so a turn can be
// replayed, undone, or run in a test without a browser.
//
// Players are an array even though the first build is solo. The paper game rolls
// ONE die for the table and everybody moves on it, so a single-player state
// model would have to be torn up to add the second player.

import { HIKES, roll as ringRoll, nextHike } from '../mapper/board.js';
import { blankCardPlay, trackScore, cardScore } from '../mapper/card.js';
import { costRoute, routeTouches, journalScores, goalScore, reachable,
  meetsRiver } from './rules.js';

export const PHASES = ['goal', 'start', 'roll', 'move', 'journal', 'over'];

/** Which card track a waypoint type marks. Campsites mark nothing. */
const TRACK_OF = {
  bear: 'bear', rabbit: 'rabbit', bird: 'bird',
  mountain: 'mountain', lookout: 'lookout', gear: 'gear', trig: 'trig',
  campsite: null,
};

export function newGame(ix, opts = {}) {
  const names = opts.players && opts.players.length ? opts.players : ['Player 1'];
  return {
    difficulty: opts.difficulty === 'hard' ? 'hard' : 'easy',
    goal: opts.goal || null,
    phase: 'goal',
    // the shared weather ring: one position for the table, as on paper
    ring: { hike: 0, pos: -1, done: false },
    budget: 0,
    weather: null,
    turn: 0,
    players: names.map((name, i) => ({
      id: `p${i + 1}`, name,
      at: null,
      visited: [], photographed: [],
      water: 0,
      card: blankCardPlay(),
      actions: [],                       // { kind, used }
      waterUsed: 0,                      // bottles drunk, so the card can cross them off
      coated: false,                     // the coat is on, for this turn only
      seen: { lakes: [], woodland: [], bridges: [], squares: [] },
      hikes: [newHike()],
      journalUsed: [],                   // which entries have been scored
      missedCampsites: 0,
      lost: false,
    })),
    log: [],
  };
}

const newHike = () => ({ waypoints: [], squares: [], endedAtCampsite: false, journal: null });
const here = (p) => p.hikes[p.hikes.length - 1];
const say = (g, text) => { g.log.push({ turn: g.turn, text }); return g; };
const add = (arr, v) => { if (!arr.includes(v)) arr.push(v); };

// ---------------------------------------------------------------- setup

/** Choose the goal scored by everyone for the whole game. */
export function chooseGoal(g, goal) {
  if (g.phase !== 'goal') return g;
  g.goal = goal;
  // The goal is a thing you RING ON THE CARD, and the card is where a player
  // looks to remember which mission he is on. Setting it only on the game meant
  // the printed sheet never showed it — four identical rows, all game.
  for (const p of g.players) p.card.goal = goal;
  g.phase = 'start';
  return say(g, `Goal ${goal.toUpperCase()} chosen for the game.`);
}

/**
 * The d6 that picks the starting campsite.
 *
 * Everyone starts from the same one — it is the table's roll, not a player's.
 */
export function chooseStart(g, ix, d) {
  if (g.phase !== 'start') return g;
  const camp = ix.waypoints.find((w) => w.type === 'campsite' && w.number === d);
  if (!camp) return say(g, `No campsite ${d} on this map.`);
  for (const p of g.players) {
    p.at = camp.id;
    // The campsite you start from is not "visited" for the journal — journal
    // scoring ignores campsites entirely — but you may not go back to it.
    add(p.visited, camp.id);
  }
  g.phase = 'roll';
  return say(g, `Starting from campsite ${d}.`);
}

// ---------------------------------------------------------------- the turn

/** Roll the weather. One die for the table; the space reached is everyone's budget. */
export function rollWeather(g, board, d) {
  if (g.phase !== 'roll') return g;
  const r = ringRoll(board, g.ring, d);
  g.budget = r.points;
  g.weather = r.weather;
  g.lastSpace = r;
  g.phase = 'move';
  g.turn++;
  return say(g, `Rolled ${d}: ${r.points} movement points (${r.weather}).`);
}

/** How many points this player has to spend, water included. */
/**
 * What you have to spend this turn.
 *
 * `spendWater` is taken as given: the caller has already worked out how many
 * bottles are actually available, and that is not always the number in your
 * pack — a lake on the route fills one as you pass it, and that bottle is
 * drinkable on the same leg. Clamping to `p.water` a second time here quietly
 * threw those away, so water found on a route could never help pay for it.
 */
export function budgetFor(g, p, spendWater = 0) {
  // The coat is a choice, not a windfall. It used to apply itself the moment the
  // weather was mean and you happened to own one, which made "use the coat" a
  // button that could only ever lie — the three points were already in the
  // number before you pressed it.
  return g.budget + Math.max(0, spendWater) + (p.coated ? 3 : 0);
}

/**
 * Put the coat on: three more points, on a day that gave you two or fewer.
 *
 * A backpack will stand in for one, which is what `useAction` falls back to.
 */
export function wearCoat(g, p) {
  if (g.phase !== 'move') return { ok: false, why: 'not while you are walking' };
  if (p.coated) return { ok: false, why: 'you are already wearing it' };
  if (g.budget > 2) return { ok: false, why: 'save it for a meaner day' };
  if (!useAction(p, 'coat')) return { ok: false, why: 'no coat' };
  p.coated = true;
  say(g, `${p.name} put the coat on.`);
  return { ok: true };
}

/** What a spare backpack can stand in for. The rules name three, and not the camera. */
const BACKPACK_IS = new Set(['glider', 'coat', 'kayak']);

export const hasAction = (p, kind) =>
  p.actions.some((a) => !a.used
    && (a.kind === kind || (a.kind === 'backpack' && BACKPACK_IS.has(kind))));

function useAction(p, kind) {
  const a = p.actions.find((x) => !x.used && x.kind === kind)
    || (BACKPACK_IS.has(kind) ? p.actions.find((x) => !x.used && x.kind === 'backpack') : null);
  if (a) a.used = true;
  return !!a;
}

/**
 * Can this player legally take this route to this waypoint, and what does it cost?
 *
 * The one place a move is judged. The UI calls it on every pointer-move while a
 * route is being dragged, so what the meter says and what `commitMove` allows
 * can never disagree.
 */
export function checkMove(g, ix, p, route, toId, opts = {}) {
  // A lake you are about to walk past fills a bottle, and a bottle in your hand
  // is a bottle you can drink. Counting it only after the move was committed
  // meant the water you found on a route was never available to pay for that
  // route — which is not how carrying water works.
  const fill = routeTouches(ix, route).lakes
    .filter((id) => !p.seen.lakes.includes(id)).length;
  const carrying = p.water + fill;
  const spend = Math.max(0, Math.min(opts.water || 0, carrying));
  const budget = budgetFor(g, p, spend);
  const to = ix.byId.get(toId);
  // A kayak only helps if you have one and the line you drew actually reaches
  // the water. Asked for without either, the route is costed on foot.
  const kayak = !!opts.kayak && hasAction(p, 'kayak') && meetsRiver(ix, route);
  const r = costRoute(ix, route, { from: p.at, to: toId, kayak });

  let why = null;
  if (!to) why = 'that is not a waypoint';
  else if (opts.kayak && !hasAction(p, 'kayak')) why = 'you have no kayak';
  else if (opts.kayak && !meetsRiver(ix, route)) why = 'that route never meets the river';
  else if (r.blocked) why = { water: 'you cannot walk in the water',
    river: 'you can only cross the river at a bridge',
    waypoint: 'you cannot pass through another waypoint' }[r.blocked.reason];
  else if (p.visited.includes(toId)) why = 'you have been there already';
  else if (p.photographed.includes(toId)) why = 'you photographed that one';
  else if (r.cost > budget) why = `costs ${r.cost}, you have ${budget}`;

  return { ok: !why, why, cost: r.cost, budget, spend, kayak, fill, carrying,
    crossings: r.crossings, bridges: r.bridges, blocked: r.blocked, to };
}

/** What this route would earn, before it is taken. Drives the yellow on the map. */
export function previewMove(g, ix, p, route, toId, opts = {}) {
  const t = routeTouches(ix, route);
  const to = ix.byId.get(toId);
  const chk = checkMove(g, ix, p, route, toId, opts);
  return {
    ...chk,
    lakes: t.lakes.filter((id) => !p.seen.lakes.includes(id)),
    woodland: t.woodland.filter((id) => !p.seen.woodland.includes(id)),
    bridges: (chk.bridges || []).filter((id) => !p.seen.bridges.includes(id)),
    squares: t.squares,
    track: to ? TRACK_OF[to.type] : null,
  };
}

/**
 * Take the move.
 *
 * Order matters and follows the printed turn: you arrive, you mark the waypoint
 * you arrived at, and THEN the features your route passed through pay out. A
 * woodland that fills the last space on a track has to do it after the arrival
 * has had its space.
 */
export function commitMove(g, ix, board, p, route, toId, opts = {}) {
  const chk = checkMove(g, ix, p, route, toId, opts);
  if (!chk.ok) return { ok: false, why: chk.why };
  p.coated = false;                          // one turn's worth of coat

  if (chk.kayak) useAction(p, 'kayak');

  const to = chk.to;
  p.at = toId;
  add(p.visited, toId);
  const hk = here(p);
  add(hk.waypoints, toId);

  const t = routeTouches(ix, route);
  for (const s of t.squares) { add(hk.squares, s); add(p.seen.squares, s); }
  for (const id of chk.bridges) add(p.seen.bridges, id);

  const earned = [];
  // 1. the waypoint you arrived at
  const track = TRACK_OF[to.type];
  if (track === 'mountain') {
    earned.push(writeMountain(ix, p, to));
  } else if (track) {
    earned.push(markTrack(ix, p, track));
  }
  // 2. then the features the route went through, once each, ever. The lakes
  //    come BEFORE the drinking: you fill up as you pass, and what you drink on
  //    this leg can be what you just filled.
  for (const id of t.lakes) {
    if (p.seen.lakes.includes(id)) continue;
    add(p.seen.lakes, id);
    gainWater(ix, p, 1);
  }
  if (chk.spend) {
    p.water -= chk.spend; p.waterUsed = (p.waterUsed || 0) + chk.spend;
    syncWater(p);
  }
  const woods = t.woodland.filter((id) => !p.seen.woodland.includes(id));
  for (const id of woods) add(p.seen.woodland, id);

  const got = earned.filter(Boolean).flatMap((e) => e.actions || []);
  for (const kind of got) p.actions.push({ kind, used: false });

  say(g, `${p.name} moved to ${to.type} for ${chk.cost}.`);
  // A woodland lets you pick which of three tracks it marks, so the turn is not
  // finished until the player has chosen — the UI asks, then calls markTrack.
  return { ok: true, cost: chk.cost, arrived: to, woodland: woods, earned: got };
}

/** Rest: no route, one water. Also what happens when nothing is reachable. */
export function rest(g, ix, p) {
  gainWater(ix, p, 1);
  return say(g, `${p.name} rested and took on water.`);
}

/** Is this player stuck — nothing affordable, even spending everything? */
export function mustRest(g, ix, p) {
  return reachable(ix, p.at, budgetFor(g, p, p.water), new Set([...p.visited, ...p.photographed]))
    .length === 0;
}

// ---------------------------------------------------------------- the sheet

/** Circle the next space on a track. Returns the specials that space carried. */
export function markTrack(ix, p, trackId) {
  const track = ix.map.card.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const next = track.spaces.findIndex((_, i) => !p.card.marks[`${trackId}:${i}`]);
  if (next < 0) return null;                    // the track is full
  p.card.marks[`${trackId}:${next}`] = 1;
  const sp = track.spaces[next];
  return { track: trackId, index: next, actions: sp.act ? [sp.act] : [] };
}

/**
 * What a mountain is worth on the track.
 *
 * The rules say to write "the UNDERLINED number of the Mountain's height" — not
 * the height. On the printed map a 800 m summit has its leading digit
 * underlined, so what goes in the box is 8. Writing 800 instead makes the
 * mountain track worth more than the rest of the sheet put together: a test game
 * scored 1235, of which the mountains were nearly all of it.
 *
 * `wp.value` wins if the map sets one, so a map whose heights are not round
 * hundreds can say what to write.
 */
export function mountainValue(wp) {
  if (wp.value != null) return wp.value;
  const h = wp.height || 0;
  return h >= 100 ? Math.round(h / 100) : h;
}

/**
 * A mountain writes a number in the next box, not a circle.
 *
 * A box marked x2 or x3 multiplies the number that goes IN it, which is why the
 * multiplier is applied here and the scoring just sums the boxes.
 */
export function writeMountain(ix, p, wp) {
  const track = ix.map.card.tracks.find((t) => t.id === 'mountain');
  const next = track.spaces.findIndex((_, i) => p.card.boxes[`mountain:${i}`] == null);
  if (next < 0) return null;
  const sp = track.spaces[next];
  p.card.boxes[`mountain:${next}`] = mountainValue(wp) * (sp.mult || 1);
  return { track: 'mountain', index: next, actions: [] };
}

/** Water is a track with a fixed number of spaces; a full one takes no more. */
/**
 * Put the card's copy of the water back in step.
 *
 * The printed sheet draws its bottles from `p.card`, not from `p`: a bottle you
 * are carrying is a circle and a bottle you have drunk is a circle with a cross
 * through it. `p.card.waterUsed` was never written by anything, so the crosses
 * never appeared and the circles never came off — the card said he still had
 * every bottle he had ever found.
 */
export function syncWater(p) {
  p.card.water = p.water;
  p.card.waterUsed = p.waterUsed || 0;
}

export function gainWater(ix, p, n = 1) {
  const cap = ix.map.card.water.cols * ix.map.card.water.rows;
  p.water = Math.min(cap, p.water + n);
  syncWater(p);
  return p.water;
}

/**
 * The glider: off the top of a mountain to somewhere close by.
 *
 * You have to be standing ON a mountain — the height you just wrote is what
 * launches you — and you land at a waypoint that is not itself a mountain, in
 * this grid square or one touching it. You come down where you land, so it is a
 * move as well as a mark; what it is not is a walk, so nothing you pass over on
 * the way counts. No lakes, no woodland, no lines crossed.
 */
export function glide(g, ix, p, wpId) {
  const w = ix.byId.get(wpId);
  const from = ix.byId.get(p.at);
  if (!w || !from) return { ok: false, why: 'no such waypoint' };
  if (from.type !== 'mountain') return { ok: false, why: 'you have to launch off a mountain' };
  if (w.type === 'mountain') return { ok: false, why: 'you cannot glide onto another mountain' };
  if (p.visited.includes(wpId) || p.photographed.includes(wpId)) {
    return { ok: false, why: 'already been there' };
  }
  // "An adjacent square", where the camera says "orthogonally adjacent" — so a
  // glide reaches the corners a photograph does not.
  const sq = (a) => [Math.floor(a.x), Math.floor(a.y)];
  const [ax, ay] = sq(from), [bx, by] = sq(w);
  if (Math.abs(ax - bx) > 1 || Math.abs(ay - by) > 1) {
    return { ok: false, why: 'too far — this square or one touching it' };
  }
  if (!useAction(p, 'glider')) return { ok: false, why: 'no glider' };

  add(p.visited, wpId);
  const hk = here(p);
  add(hk.waypoints, wpId);
  // The square you LAND in counts; the ones you sailed over do not.
  add(hk.squares, by * ix.cols + bx);
  add(p.seen.squares, by * ix.cols + bx);
  p.at = wpId;
  const track = TRACK_OF[w.type];
  const got = track === 'mountain' ? writeMountain(ix, p, w) : track ? markTrack(ix, p, track) : null;
  for (const kind of (got && got.actions) || []) p.actions.push({ kind, used: false });
  say(g, `${p.name} glided to a ${w.type}.`);
  return { ok: true, marked: got, to: w };
}

/**
 * Where a glider could take you from here.
 *
 * The panel needs this to decide whether to offer the button at all: a glider in
 * your pack while you are standing in a bog is not a choice, it is a tease.
 */
export function glideTargets(g, ix, p) {
  const from = ix.byId.get(p.at);
  if (!from || from.type !== 'mountain' || !hasAction(p, 'glider')) return [];
  const [ax, ay] = [Math.floor(from.x), Math.floor(from.y)];
  return ix.waypoints.filter((w) => w.type !== 'mountain'
    && !p.visited.includes(w.id) && !p.photographed.includes(w.id)
    && Math.abs(Math.floor(w.x) - ax) <= 1 && Math.abs(Math.floor(w.y) - ay) <= 1);
}

/**
 * The camera: mark a waypoint you did not walk to.
 *
 * It has to be in the same grid square as one of yours or orthogonally next to
 * it, and once photographed it can never be visited.
 */
/**
 * Everywhere a photograph could be taken from where you are standing.
 *
 * "A waypoint that you haven't visited in the same grid square or an
 * orthogonally adjacent grid square" — so the square you are in and the four
 * touching it, corners excluded. The glider reaches the corners; the camera
 * does not, and that difference is in the printed rules rather than in anyone's
 * idea of what ought to be fair.
 */
export function photoTargets(g, ix, p) {
  const from = ix.byId.get(p.at);
  if (!from || !hasAction(p, 'camera')) return [];
  const [ax, ay] = [Math.floor(from.x), Math.floor(from.y)];
  return ix.waypoints.filter((w) => w.id !== p.at
    && !p.visited.includes(w.id) && !p.photographed.includes(w.id)
    && Math.abs(Math.floor(w.x) - ax) + Math.abs(Math.floor(w.y) - ay) <= 1);
}

export function photograph(g, ix, p, wpId) {
  const w = ix.byId.get(wpId);
  const from = ix.byId.get(p.at);
  if (!w || !from) return { ok: false, why: 'no such waypoint' };
  if (p.visited.includes(wpId) || p.photographed.includes(wpId)) {
    return { ok: false, why: 'already been there' };
  }
  const sq = (a) => [Math.floor(a.x), Math.floor(a.y)];
  const [ax, ay] = sq(from), [bx, by] = sq(w);
  const d = Math.abs(ax - bx) + Math.abs(ay - by);
  if (d > 1) return { ok: false, why: 'too far — same square or one next to it' };
  if (!useAction(p, 'camera')) return { ok: false, why: 'no camera' };

  add(p.photographed, wpId);
  const track = TRACK_OF[w.type];
  const got = track === 'mountain' ? writeMountain(ix, p, w) : track ? markTrack(ix, p, track) : null;
  for (const kind of (got && got.actions) || []) p.actions.push({ kind, used: false });
  say(g, `${p.name} photographed a ${w.type}.`);
  return { ok: true, marked: got };
}

// ---------------------------------------------------------------- end of a hike

/** Did the roll land on the last space of this side? */
export const hikeOver = (g, board) =>
  g.ring.pos >= board.tracks[HIKES[g.ring.hike].side].length - 1;

/** Close the hike: mark where everyone stopped, and ask for a journal entry. */
export function endHike(g, ix) {
  for (const p of g.players) {
    const at = ix.byId.get(p.at);
    here(p).endedAtCampsite = !!at && at.type === 'campsite';
  }
  g.phase = 'journal';
  return say(g, 'End of the hike — choose a journal entry.');
}

/** The four entries with their scores, and whether each is still available. */
export function journalOptions(g, ix, p) {
  const s = journalScores(here(p), ix);
  const dbl = here(p).endedAtCampsite ? 2 : 1;
  return ['j1', 'j2', 'j3', 'j4'].map((k) => ({
    id: k, score: s[k] * dbl, doubled: dbl === 2, used: p.journalUsed.includes(k),
  }));
}

/**
 * Score one journal entry for this hike.
 *
 * You must choose one every hike even if it scores nothing, and you can never
 * choose the same one twice — which is why a zero entry is still a legal pick.
 */
export function chooseJournal(g, ix, p, which) {
  if (p.journalUsed.includes(which)) return { ok: false, why: 'already scored that one' };
  const opt = journalOptions(g, ix, p).find((o) => o.id === which);
  if (!opt) return { ok: false, why: 'no such entry' };
  p.journalUsed.push(which);
  here(p).journal = { which, score: opt.score };
  const slot = ix.map.card.journal.findIndex((j) => j.id === which);
  if (slot >= 0) p.card.boxes[`journal:${slot}`] = opt.score;
  say(g, `${p.name} scored ${opt.score} for the journal.`);
  return { ok: true, score: opt.score };
}

/**
 * Move on to the next side, or end the game.
 *
 * The solo requirement is counted here rather than at the end, so a player can
 * be told they have used up their one miss while it still matters.
 */
export function advanceHike(g, ix, board) {
  for (const p of g.players) {
    if (!here(p).endedAtCampsite) p.missedCampsites++;
    const allowed = g.difficulty === 'hard' ? 0 : 1;
    if (p.missedCampsites > allowed) p.lost = true;
  }
  if (!nextHike(g.ring)) {
    g.phase = 'over';
    return finish(g, ix);
  }
  for (const p of g.players) { gainWater(ix, p, 2); p.hikes.push(newHike()); }
  g.phase = 'roll';
  return say(g, `Hike ${g.ring.hike + 1}. Everyone takes on 2 water.`);
}

// ---------------------------------------------------------------- the score

/** Everything on the score row, plus the goal worked out from the map. */
export function score(g, ix, p) {
  const card = ix.map.card;
  const base = cardScore(card, p.card);
  const goal = goalScore(ix, g.goal, p.seen);
  // The card's goal box is whatever the chosen goal came to, so the printed
  // total and this one are the same number.
  p.card.boxes['goal:total'] = goal.score;
  const tracks = {};
  for (const t of card.tracks) tracks[t.id] = trackScore(t, p.card);
  return {
    ...cardScore(card, p.card),
    tracks,
    goal: goal.score, goalDetail: goal,
    journal: base.journal,
    lost: p.lost,
  };
}

function finish(g, ix) {
  g.results = g.players.map((p) => ({ id: p.id, name: p.name, ...score(g, ix, p) }))
    .sort((a, b) => (a.lost - b.lost) || (b.total - a.total));
  const won = g.results.filter((r) => !r.lost);
  say(g, won.length ? `Game over. ${won[0].name} scored ${won[0].total}.`
    : 'Game over — the campsite requirement was not met.');
  return g;
}
