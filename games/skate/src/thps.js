/* thps.js — original Tony Hawk levels, converted and dropped in.
 *
 * `tools/thps2glb.py` turns a THPS1/THPS2 `.psx` (plus its `.trg`) into a glTF
 * using the same node-name convention the rest of this game reads:
 *
 *     X_Col_Floor / X_Col_Wall / X_Col_Pipe   collision, sorted by the
 *                                             original's own surface flags
 *     X_Rail_000...                           rails, chained out of the .trg
 *     X_Mesh                                  what you see, with the PS1's
 *                                             baked vertex lighting
 *
 * So nothing here parses a level format. All this module does is find out which
 * converted levels are present, wrap each one in the shape `LEVELS` uses, and
 * scatter the barrels and letters the arcade objectives need — the parks came
 * with neither, and hand-placing them per level is not a thing anyone should
 * have to do.
 *
 * No converted levels present is the normal case: the assets are not in the
 * repository (they are someone else's, and they are big), so the manifest 404s
 * and the level select simply shows the three built-in parks.
 */
import * as THREE from 'three';

/* Relative to the assets folder, the way main.js's asset() wants it. */
export const THPS_DIR = 'thps/';
/* Relative to the page, the way fetch() wants it. */
const MANIFEST = 'assets/thps/levels.json';

/**
 * @returns {Promise<Array>} one entry per converted level, or [] if the folder
 *   is not there. Never rejects: a missing manifest is the default state, not
 *   an error, and it must not stop the game booting.
 */
export async function loadThpsManifest() {
  try {
    const res = await fetch(MANIFEST, { cache: 'no-cache' });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.levels) ? json.levels : [];
  } catch (e) {
    return [];
  }
}

/* A repeatable shuffle, so a level's barrels are in the same places tomorrow. */
function seeded(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

/**
 * Pick spots for props. THPS parks are rooms, not open ground, so a random
 * point in the bounding box is usually inside a wall or over a pit — but
 * LevelProps drops every prop straight down onto the collision anyway, so the
 * only thing that has to be true here is that the point is over floor. That is
 * what the probe is for.
 *
 * @param {World} world the park's colliders
 * @param {THREE.Box3} box its extent
 * @param {number} n how many points to find
 * @param {function} rnd seeded random
 */
function scatter(world, box, n, rnd) {
  const out = [];
  const from = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const span = new THREE.Vector3().subVectors(box.max, box.min);
  /* Keep to the middle 80%: the outer rim of a THPS level is its skybox walls */
  for (let tries = 0; tries < n * 400 && out.length < n; tries++) {
    const x = box.min.x + span.x * (0.1 + rnd() * 0.8);
    const z = box.min.z + span.z * (0.1 + rnd() * 0.8);
    from.set(x, box.max.y + 2, z);
    const hit = world.probe(from, down, span.y + 8);
    if (!hit || hit.group !== 'floor') continue;
    if (hit.normal.y < 0.8) continue;                     // not a bank or a wall
    if (out.some((p) => (p[0] - x) ** 2 + (p[2] - z) ** 2 < 36)) continue;
    out.push([x, hit.point.y + 0.05, z]);
  }
  return out;
}

/**
 * The height of the first thing under (x, z) that would actually hold him up.
 *
 * Dropping onto whatever a single ray finds is not enough. A THPS level carries
 * sheets of undrawn collision, and the parts of one that survive the filters are
 * slivers — catch a ray on one and the spawn is set on a ledge the width of a
 * board that he immediately slides off, which is a run that starts with a four
 * metre fall. So ask four more rays a board's width out: real ground answers
 * with the same height, a sliver answers with whatever is underneath it. If the
 * surface does not convince, carry on down from just below it and ask again.
 *
 * @returns {number|null} the height, or null if there is nothing down there
 */
function standableUnder(world, x, z, topY, drop = 40) {
  const from = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  let y = topY;
  for (let tries = 0; tries < 8; tries++) {
    const hit = world.probe(from.set(x, y, z), down, drop);
    if (!hit) return null;
    let agree = 0;
    for (const [dx, dz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
      const h = world.probe(from.set(x + dx, y, z + dz), down, drop);
      if (h && Math.abs(h.point.y - hit.point.y) < 0.4) agree++;
    }
    if (agree >= 3 && hit.normal.y > 0.5) return hit.point.y;
    y = hit.point.y - 0.3;
  }
  return null;
}

/**
 * Where a golden deck goes for a park whose five-of-a-kind is level geometry.
 *
 * The converter hands over a point and the way the object faces; 'at' and
 * 'above' are already final, and 'front' has to pick a side. A sign is a board
 * with two faces and only one of them has a floor in front of it, so both are
 * tried: the winner is the side with room to skate and something to land on.
 *
 * @param {World} world the park's colliders
 * @param {number[]} spot [x, y, z, nx, nz] from extras.deckspots
 * @param {string} place 'at' | 'above' | 'front'
 */
const DECK_STANDOFF = 1.6;
const DECK_FLOAT = 1.3;     // how high a 'front' deck hangs over the ground

function placeDeck(world, spot, place) {
  const [x, y, z, nx, nz] = spot;
  if (place !== 'front' || !world) return [x, y, z];
  const from = new THREE.Vector3(x, y, z);
  const dir = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  let best = null, bestScore = -Infinity;
  for (const sgn of [1, -1]) {
    dir.set(nx * sgn, 0, nz * sgn);
    if (dir.lengthSq() < 1e-6) continue;
    dir.normalize();
    const wall = world.probe(from, dir, 6);
    const clear = wall ? wall.distance : 6;
    const at = [x + dir.x * DECK_STANDOFF, y, z + dir.z * DECK_STANDOFF];
    const floor = world.probe(new THREE.Vector3(at[0], at[1] + 0.4, at[2]), down, 25);
    /* Standing a deck off the face of a thing keeps its height, which is fine
       on the flat and wrong on a hill: Downhill Jam's valves sit on banks and
       the deck ended up ten metres over the course. So if there is ground
       close under the chosen point, sit on that instead — and if there is not,
       it is over a drop and the original height is the better answer. */
    if (floor && at[1] - floor.point.y > DECK_FLOAT) at[1] = floor.point.y + DECK_FLOAT;
    const score = Math.min(clear, 6) + (floor ? 5 : 0);
    if (score > bestScore) { bestScore = score; best = at; }
  }
  return best || [x, y, z];
}

/**
 * Everything the level select and `_loadLevel` need, in the same shape as an
 * entry of `LEVELS`.
 *
 * @param {object} entry manifest entry: { file, name, blurb, rails, spawn }
 */
/* The two THPS2 bonus parks are a pair of empty boxes with a handful of ramps —
   they were never a level, they were an unlock reward — so they are not offered.
   The converter still builds them; this is only about what the menu shows. */
const NOT_OFFERED = new Set(['t2_b1.glb', 't2_b2.glb']);

export function offerLevel(entry) {
  return !!entry && !!entry.file && !NOT_OFFERED.has(entry.file.toLowerCase());
}

/* The order the games put them in, which is the order they unlock in and the
   order anyone who played them remembers. Alphabetical was a filing cabinet.
   Career order, first to last, competition levels included where they fall.
     THPS1: Warehouse, School, Mall, Skate Park*, Downtown, Downhill Jam,
            Burnside*, Streets, Roswell*
     THPS2: Hangar, School II, Marseille*, New York, Venice Beach,
            Skatestreet*, Philadelphia, Bullring*, Skate Heaven
   (* competition) */
const CAREER = [
  'skware.glb', 'skschl.glb', 'skmall.glb', 'skvans.glb', 'skdown.glb',
  'skjam.glb', 'skburn.glb', 'sksf.glb', 'skros.glb',
  't2_han.glb', 't2_sl2.glb', 't2_mar.glb', 't2_ny.glb', 't2_ven.glb',
  't2_ss.glb', 't2_ph.glb', 't2_bul.glb', 't2_hvn.glb'
];

/** Where a park sits in its game, or last if it is one we do not know. */
export function careerRank(entry) {
  const i = CAREER.indexOf((entry.file || '').toLowerCase());
  return i < 0 ? CAREER.length : i;
}

export function thpsLevelDef(entry) {
  const id = 'thps-' + entry.file.replace(/\.glb$/i, '').toLowerCase();
  return {
    id,
    name: entry.name || entry.file,
    blurb: entry.blurb || 'Converted from the original game.',
    icon: '📼',
    game: entry.game || null,
    order: careerRank(entry),
    thps: entry,
    /* filled in by prepare(), once the geometry is on the screen and we can
       measure it — a converted level's floor height is not knowable up front */
    apronY: 0,
    spawn: { pos: [0, 1, 0], heading: 0 },
    letters: [], decks: [], barrels: [],
    goals: [
      { id: 'score', type: 'score', target: 35000, label: 'Score 35,000 in one run' },
      { id: 'skate', type: 'letters', label: 'Collect S-K-A-T-E' },
      { id: 'decks', type: 'decks', target: 5, label: 'Collect 5 golden decks' },
      { id: 'combo', type: 'combo', target: 6, label: 'Land a 6-trick combo' },
      { id: 'grind', type: 'grind', target: 80, label: 'Grind 80 m of rail' },
      { id: 'air', type: 'air', target: 1.5, label: 'Stay in the air for 1.5 s' }
    ]
  };
}

/**
 * Called once the glTF is in the Level: works out where the skater starts and
 * where the props go, and writes them back onto the def so LevelProps and
 * _respawn find them exactly where they would on a hand-authored park.
 *
 * @param {object} def   from thpsLevelDef
 * @param {Level} level  already populated
 * @param {object} extras the glTF scene's userData.thps, if any
 */
export function prepareThpsLevel(def, level, extras) {
  const box = new THREE.Box3().setFromObject(level.root);
  const rnd = seeded(def.id);

  /* Spawn: the original's first Restart node if the .trg gave us one, dropped
     onto the floor so a slightly-off Y cannot start the run mid-fall. */
  let pos = null;
  if (extras && Array.isArray(extras.spawn)) pos = new THREE.Vector3().fromArray(extras.spawn);
  if (!pos || !box.containsPoint(pos)) {
    const p = scatter(level.world, box, 1, rnd)[0];
    pos = p ? new THREE.Vector3(p[0], p[1], p[2]) : box.getCenter(new THREE.Vector3());
  }
  const y = standableUnder(level.world, pos.x, pos.z, pos.y + 4);
  def.spawn = { pos: [pos.x, y === null ? pos.y : y + 0.15, pos.z], heading: 0 };

  /* Which way to face.
   *
   * The obvious answer — point at the nearest rail — puts you nose-first into a
   * wall on half these levels, because the nearest rail is often on the other
   * side of one. So: sweep the horizon, keep the directions with a clear run
   * ahead, and among those prefer whichever has a rail down it. Open road first,
   * something to skate at second.
   */
  const eye = new THREE.Vector3(pos.x, def.spawn.pos[1] + 0.6, pos.z);
  const dir = new THREE.Vector3();
  const REACH = 25;
  let bestHeading = 0, bestScore = -Infinity;
  for (let i = 0; i < 24; i++) {
    const h = (i / 24) * Math.PI * 2;
    dir.set(Math.sin(h), 0, Math.cos(h));
    const hit = level.world.probe(eye, dir, REACH);
    const clear = hit ? hit.distance : REACH;
    if (clear < 4) continue;                     // nose against a wall
    let bonus = 0;
    for (const path of level.paths) {
      const p = path.points[0];
      const along = (p.x - pos.x) * dir.x + (p.z - pos.z) * dir.z;
      if (along < 2 || along > REACH * 1.6) continue;
      const off = Math.abs((p.x - pos.x) * dir.z - (p.z - pos.z) * dir.x);
      if (off < 6) bonus = Math.max(bonus, 10 - off);
    }
    const score = clear + bonus;
    if (score > bestScore) { bestScore = score; bestHeading = h; }
  }
  def.spawn.heading = bestHeading;

  /* The letters and the decks, straight out of the park's own item table.
   *
   * The .trg's type-5 table is the park's item list: a position and an id
   * each. Six ids appear exactly once in every level with a career — 4, 5, 6,
   * 10, 15 and 16 — and in no competition level at all, which is exactly
   * where S-K-A-T-E and the secret tape are and are not. Dan checked five of
   * them against the Hangar by eye and they land within a metre, so:
   *
   *   5, 4, 6, 15, 10  ->  S, K, A, T, E — Dan's order, read off the Hangar
   *   33               ->  the level's five-of-a-kind. THPS2 gave each career
   *                        park its own — pilot wings in the Hangar, hall
   *                        passes in School II, subway tokens, spray cans,
   *                        liberty bells. One shape reads better across five
   *                        parks than five one-offs, so all of them are golden
   *                        decks here.
   *   16               ->  the secret tape, and everything else is cash —
   *                        neither has anything to collect it with yet, so
   *                        nothing is placed on them
   *
   * The nine parks with no item table are the competition levels and the
   * three made-up ones. A comp park has no letters and no tape because it is
   * not that kind of park: you get one run and a score. So they get no
   * letters at all, and the score goal doubles into an EPIC SCORE instead.
   */
  const SKATE_IDS = [5, 4, 6, 15, 10];
  const DECK_ID = 33;
  const loot = Array.isArray(extras && extras.items) ? extras.items : [];
  const byId = new Map();
  for (const it of loot) if (!byId.has(it[3])) byId.set(it[3], it);
  const real = SKATE_IDS.map((id) => byId.get(id)).filter(Boolean);

  /* THPS1's five-of-a-kind are boxes, tables, directories, signs and cop
     cars — level geometry, not item nodes, so the converter finds them by
     object index and hands over a position each. THPS2's are id 33. */
  const spots = Array.isArray(extras && extras.deckspots) ? extras.deckspots : [];
  if (spots.length === 5) {
    const place = (extras && extras.deckplace) || 'at';
    def.decks = spots.map((sp) => placeDeck(level.world, sp, place));
  }

  if (real.length === 5) {
    def.letters = real.map((p) => [p[0], p[1], p[2]]);
    /* these are the game's own coordinates, so they are not to be dropped onto
       the floor: half of them are deliberately up in the air */
    def.lettersExact = true;
    const decks = loot.filter((it) => it[3] === DECK_ID);
    if (decks.length === 5 && def.decks.length !== 5) {
      def.decks = decks.map((p) => [p[0], p[1], p[2]]);
    }
  } else {
    def.letters = [];
    def.comp = true;
  }

  /* Nothing scatters barrels any more. They were a stand-in for the item spots
     back when nobody knew what the item table meant, and now that the letters
     and the decks come out of it there is nothing left for them to stand in
     for. makeBarrel and the rest of the machinery are still here, so putting
     something on the leftover cash spots later is a one-line change. */
  def.barrels = [];

  def.apronY = box.min.y;

  /* Objectives have to match what the level can actually offer.
   *
   * Windows still smash, and still pay — there is just no goal asking you to
   * clear a park of them, because hunting the last pane in the Mall was a
   * chore rather than a run. */
  /* Only the five THPS2 career parks carry the five-of-a-kind. */
  if (def.decks.length !== 5) def.goals = def.goals.filter((g) => g.id !== 'decks');

  if (def.letters.length < 5) {
    def.goals = def.goals.filter((g) => g.id !== 'skate');
    const scoreGoal = def.goals.find((g) => g.id === 'score');
    if (scoreGoal) {
      scoreGoal.target *= 2;
      scoreGoal.label = `EPIC SCORE — ${scoreGoal.target.toLocaleString('en-GB')} in one run`;
    }
  }
  if (!level.paths.length) def.goals = def.goals.filter((g) => g.id !== 'grind');
  return def;
}
