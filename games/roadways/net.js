// Roadways v2 — the world: grid, terrain, playable bounds + radial expansion,
// road EDGES, infrastructure, buildings, ghost tiles, and the graph queries that
// traffic pathfinds over.
//
// DOM-free: no window/document/canvas/audio/localStorage in here.
//
// ---------------------------------------------------------------------------
// THE MENTAL MODEL (read this before touching anything)
// ---------------------------------------------------------------------------
// A road is an UNDIRECTED EDGE BETWEEN TWO ADJACENT TILES, not tile occupancy.
// One grid step of drawing = one edge = 1 road tile of resource, orthogonal or
// diagonal alike. There are 8 directions. A tile "has road" if any edge touches
// it.
//
// Every edge is stored TWICE: bit `dir` on the tile, bit `OPP[dir]` on the
// neighbour. That symmetry is an INVARIANT. A desynced mask breaks pathfinding
// in a way that is miserable to debug, so every mutation goes through
// `_setBit`/`_clearBit`, which always touch both halves.
//
// Diagonals may not scissor: a diagonal edge is refused (reason 4) when the
// opposing diagonal across the same 2x2 block already exists. Nor may a diagonal
// cut a CORNER: it is refused when either SHOULDER tile of its 2x2 block is solid
// — an office body or driveway (reason 5), water or mountain (reason 2) — because
// the edge runs exactly through the point those two tiles share. A house is the one
// exemption; see canAddEdge for why.
//
// ---------------------------------------------------------------------------
// CONNECTION MODEL (v2.7 — offices have a driveway and a connection point)
// ---------------------------------------------------------------------------
// A HOUSE is still the simple case: its single tile is its own gate and its own
// door, and a road edge may terminate on it from any of the 8 directions.
//
// An OFFICE is an anatomy, laid out by the variant table below:
//
//     B  the building proper. Road may NOT touch it. Cars may not drive over it.
//     D  the DRIVEWAY — footprint tiles (F_BUILD | F_DRIVE) where cars park. Road
//        may NOT terminate on one, but ANY car may DRIVE THROUGH one, whether or
//        not it is calling here. A double office's driveway runs right through the
//        building with a connection point at each end, so it is a genuine (slow)
//        short cut, exactly like a real car park you can cut across.
//     C  the CONNECTION POINT — the ONLY tile a road may join (F_GATE). It sits
//        OUTSIDE the footprint and does not count towards the building's size; it
//        is otherwise ordinary land, so road may also pass straight through it.
//
//   1a/1b  2x3 single office, driveway along the bottom, C beside it
//   1c/1d  the same mirrored (driveway along the top)
//   2a..2d 3x2 single office, driveway down one short side, C above or below it
//   3a..3d 3x4 (or 4x3) DOUBLE office: two colours, one shared driveway, TWO
//          connection points at the driveway's two ends
//
// Each COLOUR of an office has a door — the driveway bay its cars park in — and
// `linksFrom` wires C <-> driveway <-> driveway with cheap 'drive' links, single
// file and orthogonal only. A road edge is refused when it touches a building
// tile that is not a connection point, or when BOTH ends are the same building.
//
// A double office is registered as TWO dest records (one per colour) that share
// one footprint, one driveway and one pair of connection points. Both are in
// `world.dests` so sim's per-destination pin machinery needs no special case;
// `d.parts` on the primary lists them, `d.complex` on each points back, and
// `d.half` is the B-block that colour occupies. A single office is its own
// complex with one part, so callers never have to branch.
//
// ---------------------------------------------------------------------------
// PERF (tablet target)
// ---------------------------------------------------------------------------
// Grid layers are typed arrays allocated ONCE at maxCols x maxRows. The hot
// queries — linksFrom, hasEdge, tileAt, isIntersection, inRoundabout — allocate
// nothing. `linksFrom` fills a caller-supplied array from a per-array object
// pool, so a Dijkstra expansion loop produces zero garbage. Intersection degree
// is an O(1) typed-array lookup, not a loop. Every per-tile boolean that the
// hot path needs lives in one `flags` byte so the common case is a single load.
// NO PERF NUMBER IN THIS FILE WAS MEASURED ON THE TABLET.

// ---------------------------------------------------------------------------
// Shared geometry (contract)
// ---------------------------------------------------------------------------
export const DX = [0, 1, 1, 1, 0, -1, -1, -1];   // dir 0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW
export const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
export const DIR_LEN = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];
export const OPP = [4, 5, 6, 7, 0, 1, 2, 3];

export const T_OUT = 0, T_EMPTY = 1, T_WATER = 2, T_MOUNTAIN = 3,
  T_HOUSE = 4, T_DEST = 5;

// Terrain PLAN codes, one per cell of the whole grid, decided before the first
// frame and uncovered a ring at a time by `_reveal`. Deliberately NOT the T_*
// codes: P_LAND must be 0 so a fresh Uint8Array is already "all land", and the
// procedural generator's `plan[i] === 0` free-cell test keeps working unchanged.
// `_planLut` maps these to tiles — the procedural path has one terrain type per
// run, an authored map can mix them.
//
// Playability is a SEPARATE array (`_outMask`), not a fourth code here. A cell can
// be both ocean and off-map, and the renderer needs both facts: the mask says the
// player will never own it, the plan says to draw sea there rather than a void.
export const P_LAND = 0, P_WATER = 1, P_MOUNTAIN = 2;

// Corner hint on a terrain cell: the author drew only that quarter-diagonal of the
// tile, shaping a coastline against their reference art. The tile is FULL terrain
// as far as every rule is concerned — half a buildable tile is not a thing the
// road grid, the footprint checks or the pathfinder could express — so this is
// purely a hint the renderer uses to soften the shoreline. S_FULL is 0, so a
// fresh Uint8Array already means "no corner anywhere".
export const S_FULL = 0, S_NW = 1, S_NE = 2, S_SE = 3, S_SW = 4;

// index IS the colour class. Order per contract:
// red, yellow, blue, green, purple, pink, lightblue, orange
export const COLORS = [
  '#ff5d5d', // 0 red
  '#ffd43b', // 1 yellow
  '#3d6ef5', // 2 blue
  '#5fd35f', // 3 green
  '#b45cf0', // 4 purple
  '#ff7fc4', // 5 pink
  '#4fd6e8', // 6 lightblue
  '#ff9330'  // 7 orange
];

// Reason codes. 0..6 are the contract's codes; 7 is an ADDITIVE code used only
// by the canAdd* infrastructure validators for "geometry/precondition wrong"
// (too close, not collinear, not a junction). canAddEdge never returns 7, and
// sim only tests `reason === 0`, so this is backwards compatible.
export const R_OK = 0, R_OOB = 1, R_TERRAIN = 2, R_EXISTS = 3, R_CROSS = 4,
  R_BUILDING = 5, R_INFRA = 6, R_GEOMETRY = 7;

// Per-tile flag bits (exported so the renderer can cheaply ask "is this special?").
export const F_PEG = 1;         // a motorway peg sits here
export const F_BRIDGE_END = 2;  // a bridge/tunnel mouth sits here
export const F_LIGHT = 4;       // traffic light
export const F_ROUND = 8;       // one of a roundabout's 9 tiles
export const F_DRIVE = 16;      // a DRIVEWAY tile of an office (also F_BUILD): road
                                // may not terminate on it, but any car may drive
                                // through it. (Unused in v2.1-v2.6; live again.)
export const F_BUILD = 32;      // part of a building footprint
export const F_GATE = 64;       // a tile a road edge may terminate on. A house's own
                                // tile, or an office's off-footprint CONNECTION POINT
                                // (which is F_GATE WITHOUT F_BUILD).

// (dy+1)*3 + (dx+1) -> dir index, -1 for (0,0)
const DIR_OF_LUT = [7, 0, 1, 6, -1, 2, 5, 4, 3];
// Same index -> the one-way flow dir for a roundabout ring tile, -1 at the centre
// (which is an island nothing drives over). The 8 ring tiles form a single cycle:
// NW -> W -> SW -> S -> SE -> E -> NE -> N -> NW.
// COUNTER-clockwise, because cars drive on the right: circulating anticlockwise
// puts a car's right-hand side on the OUTSIDE of the ring, so it keeps the island
// on its left and its lane offset hugs the outer kerb instead of the island.
const ROUND_FLOW = [4, 6, 6, 4, -1, 0, 2, 2, 0];

/** Direction index for a unit-ish step, or -1 if it is not one of the 8 steps. */
export function dirOf(dx, dy) {
  if (dx < -1 || dx > 1 || dy < -1 || dy > 1) return -1;
  return DIR_OF_LUT[(dy + 1) * 3 + (dx + 1)];
}

// mulberry32 — small seeded PRNG. The module never calls bare Math.random except
// to pick a default seed, so a run is reproducible from its seed alone.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZERO_OCC = function () { return 0; };

const TERRAIN_MIN = 0.07;   // organic blobs cover roughly 7..11% of revealed tiles
const TERRAIN_SPAN = 0.04;
const MOTORWAY_MIN_SEP = 4; // pegs must be at least this far apart (Euclidean)
const DRIVE_LEN = 1;        // cost of one driveway hop (a slow interior manoeuvre)

/* The car park on an office's forecourt, in tiles, measured out from the drive
 * lane's CENTRE line. Exported because the markings (render.js) and the park
 * manoeuvre (traffic.js) must read the same numbers or the car parks outside its
 * own space.
 *   BAY_IN   the mouth of a space — the edge of the lane's own asphalt (LANE_W/2)
 *   BAY_OUT  the head of a space, just short of the wall: the block's edge is half
 *            a tile out and the building is inset 0.19 inside that, so the wall
 *            stands at 0.69
 *   BAY_MID  where a parked car's CENTRE sits. Set by the WALL, not by the middle
 *            of the space: a 0.46x0.30 car turned 45 degrees is 0.54 deep and
 *            there are only 0.41 tiles of forecourt, so it has to overhang, and
 *            hanging back over the lane is what an angled bay looks like. At 0.42
 *            its deepest corner lands on 0.689 and its tail hangs 0.10 over. */
export const BAY_IN = 0.25;
export const BAY_OUT = 0.66;
export const BAY_MID = 0.42;
/* Marked spaces per lot, spread along the WHOLE driveway rather than one per
 * colour. A 45 degree space's side lines travel (BAY_OUT - BAY_IN) along the lane
 * as they run out to the wall, so a bank of N needs N*pitch plus that travel to
 * fit: pitch = (strip - travel) / N. Across the slant a space is pitch/sqrt2 —
 * 0.375 of a tile for a 0.30-wide car on a single, 0.363 on a double. Tight, which
 * is the point. */
export const LOT_SPACES = 3;
export const LOT_SPACES_DBL = 7;

// ---------------------------------------------------------------------------
// OFFICE VARIANTS — the whole anatomy of every destination, in one table
// ---------------------------------------------------------------------------
// All coordinates are LOCAL to the footprint origin (x,y). `drive` is ordered
// along the driveway. `conns` may be negative or >= w/h: a connection point is
// OUTSIDE the footprint by definition. `halves` are the B-blocks, one per colour.
// `bays` indexes into `drive`: the tile that colour's cars park in — the far end
// for a dead-end driveway (pull right in), the inner tile for a through one (keep
// the mouths clear).
//
//   1a  _BB_   1b  _BB_   1c  _DDC   1d  CDD_
//       _BB_       _BB_       _BB_       _BB_
//       _DDC       CDD_       _BB_       _BB_
//
//   2a  _DBB_  2b  _C___  2c  _BBD_  2d  ___C_
//       _DBB_      _DBB_      _BBD_      _BBD_
//       _C___      _DBB_      ___C_      _BBD_
//
//   3a  _C___  3b  ___C_  3c  _1122_  3d  CDDDDC
//       _D11_      _11D_      _1122_      _1122_
//       _D11_      _11D_      CDDDDC      _1122_
//       _D22_      _22D_
//       _D22_      _22D_
//       _C___      ___C_
export const OFFICE_VARIANTS = [
  { id: '1a', kind: 1, w: 2, h: 3, dbl: false, drive: [[0, 2], [1, 2]], conns: [[2, 2]], halves: [[0, 0, 2, 2]], bays: [0] },
  { id: '1b', kind: 1, w: 2, h: 3, dbl: false, drive: [[0, 2], [1, 2]], conns: [[-1, 2]], halves: [[0, 0, 2, 2]], bays: [1] },
  { id: '1c', kind: 1, w: 2, h: 3, dbl: false, drive: [[0, 0], [1, 0]], conns: [[2, 0]], halves: [[0, 1, 2, 2]], bays: [0] },
  { id: '1d', kind: 1, w: 2, h: 3, dbl: false, drive: [[0, 0], [1, 0]], conns: [[-1, 0]], halves: [[0, 1, 2, 2]], bays: [1] },

  { id: '2a', kind: 2, w: 3, h: 2, dbl: false, drive: [[0, 0], [0, 1]], conns: [[0, 2]], halves: [[1, 0, 2, 2]], bays: [0] },
  { id: '2b', kind: 2, w: 3, h: 2, dbl: false, drive: [[0, 0], [0, 1]], conns: [[0, -1]], halves: [[1, 0, 2, 2]], bays: [1] },
  { id: '2c', kind: 2, w: 3, h: 2, dbl: false, drive: [[2, 0], [2, 1]], conns: [[2, 2]], halves: [[0, 0, 2, 2]], bays: [0] },
  { id: '2d', kind: 2, w: 3, h: 2, dbl: false, drive: [[2, 0], [2, 1]], conns: [[2, -1]], halves: [[0, 0, 2, 2]], bays: [1] },

  { id: '3a', kind: 3, w: 3, h: 4, dbl: true, drive: [[0, 0], [0, 1], [0, 2], [0, 3]], conns: [[0, -1], [0, 4]], halves: [[1, 0, 2, 2], [1, 2, 2, 2]], bays: [1, 2] },
  { id: '3b', kind: 3, w: 3, h: 4, dbl: true, drive: [[2, 0], [2, 1], [2, 2], [2, 3]], conns: [[2, -1], [2, 4]], halves: [[0, 0, 2, 2], [0, 2, 2, 2]], bays: [1, 2] },
  { id: '3c', kind: 3, w: 4, h: 3, dbl: true, drive: [[0, 2], [1, 2], [2, 2], [3, 2]], conns: [[-1, 2], [4, 2]], halves: [[0, 0, 2, 2], [2, 0, 2, 2]], bays: [1, 2] },
  { id: '3d', kind: 3, w: 4, h: 3, dbl: true, drive: [[0, 0], [1, 0], [2, 0], [3, 0]], conns: [[-1, 0], [4, 0]], halves: [[0, 1, 2, 2], [2, 1, 2, 2]], bays: [1, 2] }
];

const VARIANT_BY_ID = new Map();
for (let i = 0; i < OFFICE_VARIANTS.length; i++) {
  VARIANT_BY_ID.set(OFFICE_VARIANTS[i].id, OFFICE_VARIANTS[i]);
}

/** The variant record for an id ('1a'..'3d'), or null. Never mutate the result. */
export function officeVariant(id) {
  return VARIANT_BY_ID.get(String(id)) || null;
}

/** Every variant of one kind (1 = 2x3, 2 = 3x2, 3 = double). Fresh array. */
export function officeVariantsOfKind(kind) {
  const k = kind | 0, out = [];
  for (let i = 0; i < OFFICE_VARIANTS.length; i++) {
    if (OFFICE_VARIANTS[i].kind === k) out.push(OFFICE_VARIANTS[i]);
  }
  return out;
}

export class World {
  /**
   * @param {object} opts
   *   map                   an AUTHORED level from maps.js (see `_loadMap`). When
   *                         given it wins outright over maxCols/maxRows/startCols/
   *                         startRows/terrain: the grid, the opening rect, the
   *                         water and rock, and which cells are off-map entirely
   *                         all come from the level file, and the procedural
   *                         terrain generator does not run at all.
   *   maxCols, maxRows      grid allocation (default 40x28)
   *   startCols, startRows  initial playable rect, centred in the grid (default 11x8)
   *   seed                  uint32; defaults to a random seed
   *   terrain               'water' | 'mountain' — decides bridge vs tunnel rewards
   *   occupancyFn(x,y,dir)  -> how many cars still need that edge (on it, or
   *                         remembering it as their way home). REQUIRED for ghost
   *                         tiles to work. World does not know about cars, so sim
   *                         must wire traffic's `edgeInUse` in here (or later, via
   *                         setOccupancyFn — Traffic needs World first, so the
   *                         closure-now / traffic-later shape is expected).
   *                         Defaults to () => 0, which makes every erase an
   *                         immediate 'removed' and ghosts unreachable.
   */
  constructor(opts) {
    const o = opts || {};
    const map = (o.map && o.map.plan && o.map.cols > 0) ? o.map : null;
    this.map = map;
    this.authored = !!map;
    this.maxCols = map ? map.cols : Math.max(4, o.maxCols | 0 || 40);
    this.maxRows = map ? map.rows : Math.max(4, o.maxRows | 0 || 28);
    const n = this.maxCols * this.maxRows;

    this.seed = (o.seed === undefined || o.seed === null || !Number.isFinite(o.seed))
      ? ((Math.random() * 0x100000000) >>> 0)
      : (o.seed >>> 0);
    this._rng = makeRng(this.seed);

    this.terrain = map ? map.terrain
      : (o.terrain === 'mountain' ? 'mountain'
        : (o.terrain === 'water' ? 'water' : (this._rng() < 0.5 ? 'water' : 'mountain')));
    this._terrainTile = this.terrain === 'water' ? T_WATER : T_MOUNTAIN;
    // P_* -> T_*. Procedural runs use codes 0/1 only, so P_WATER doubles as "the
    // one terrain type this run picked"; an authored map addresses all four.
    this._planLut = map
      ? [T_EMPTY, T_WATER, T_MOUNTAIN]
      : [T_EMPTY, this._terrainTile, T_MOUNTAIN];

    this.occupancyFn = typeof o.occupancyFn === 'function' ? o.occupancyFn : ZERO_OCC;

    // --- grid layers, allocated once ---
    this.tiles = new Uint8Array(n);        // T_* ; T_OUT until revealed
    this.edges = new Uint8Array(n);        // 8-bit mask: live | ghost edges
    this.ghosts = new Uint8Array(n);       // 8-bit mask: subset of `edges` that is ghost
    this.flags = new Uint8Array(n);        // F_* bits
    this._deg = new Uint8Array(n);         // live (non-ghost) edge degree per tile
    this._buildAt = new Int32Array(n);     // building id + 1, 0 = none
    this._roundAt = new Int32Array(n);     // roundabout id + 1
    this._scratch = new Uint8Array(n);     // terrain generation workspace (always cleared)
    this._terrainPlan = new Uint8Array(n); // P_* per tile, decided up front
    this._terrainShape = new Uint8Array(n);// S_* corner hint (authored maps only)
    this._outMask = new Uint8Array(n);     // 1 = never playable (authored boundary)

    this.version = 0;
    this._liveEdges = 0;
    this._terrainCount = 0;

    // --- buildings / infrastructure ---
    this.houses = [];
    this.dests = [];
    this.motorways = [];
    this.roundabouts = [];
    this.lights = [];
    this.bridges = [];
    this._byId = new Map();
    this._nextId = 1;         // sim indexes dests by id into a 4096 table — stay small
    this._nextInfraId = 1;

    // --- ghost bookkeeping ---
    this._ghostList = [];
    this._ghostIndex = new Map();

    // --- reusable workspaces (never returned to callers except where documented) ---
    this._band = [];
    this._frontier = [];
    this._pools = new WeakMap();

    // --- initial bounds, and the ceiling the bounds may ever grow to ---
    if (map) {
      // Authored: the opening rect and the playable extent are both drawn, and the
      // extent is a BOX round an irregular mask. The bounds stay rectangular (the
      // whole expansion mechanic assumes that) and the mask does the shaping —
      // off-map cells inside the rect simply reveal as T_OUT and stay unbuildable.
      const s = map.start, p = map.playable;
      this.bounds = { x0: s.x0 | 0, y0: s.y0 | 0, x1: s.x1 | 0, y1: s.y1 | 0 };
      this.maxBounds = { x0: p.x0 | 0, y0: p.y0 | 0, x1: p.x1 | 0, y1: p.y1 | 0 };
      this._loadMap(map);
    } else {
      const sc = Math.max(2, Math.min(startOr(o.startCols, 11), this.maxCols));
      const sr = Math.max(2, Math.min(startOr(o.startRows, 8), this.maxRows));
      const x0 = ((this.maxCols - sc) / 2) | 0;
      const y0 = ((this.maxRows - sr) / 2) | 0;
      this.bounds = { x0: x0, y0: y0, x1: x0 + sc - 1, y1: y0 + sr - 1 };
      this.maxBounds = { x0: 0, y0: 0, x1: this.maxCols - 1, y1: this.maxRows - 1 };
      this._planTerrain();        // the WHOLE map's water/mountain, before anything is seen
      this._thinTerrain(this.bounds, 0.12);   // ...but never drown the opening board
    }
    this._reveal(this.bounds, null);
    // The opening playable rect, kept so the reveal can interpolate from it to
    // `maxBounds` (see `expandTo` / sim's timed reveal).
    this.startBounds = { x0: this.bounds.x0, y0: this.bounds.y0, x1: this.bounds.x1, y1: this.bounds.y1 };
  }

  /**
   * Copy an authored level's plan in wholesale. No thinning: the author placed
   * that water on purpose, including any inside the opening rect, and quietly
   * deleting a coastline they drew would make the editor lie about the level.
   */
  _loadMap(map) {
    const plan = map.plan, shape = map.shape, out = map.out;
    const n = Math.min(this._terrainPlan.length, plan.length);
    for (let i = 0; i < n; i++) {
      const v = plan[i];
      this._terrainPlan[i] = v;
      if (v === P_WATER || v === P_MOUNTAIN) this._terrainCount++;
    }
    if (shape) this._terrainShape.set(shape.subarray(0, n));
    if (out) this._outMask.set(out.subarray(0, n));
  }

  /** Late-bind the car-occupancy oracle (Traffic is built after World). */
  setOccupancyFn(fn) {
    this.occupancyFn = typeof fn === 'function' ? fn : ZERO_OCC;
  }

  /**
   * Planning the whole map at once means the OPENING rect can lose a coin flip and
   * come up a third water, which is not a difficulty curve, it is a dead run. Thin
   * the plan inside `rect` back to `maxFrac`, chipping tiles off at random. Only
   * ever called before anything is revealed or built, and only on a PROCEDURAL
   * world — an authored level's opening rect is the author's problem, and the
   * `!== 0` test below would happily chip holes in an off-map mask.
   */
  _thinTerrain(rect, maxFrac) {
    const cols = this.maxCols;
    const plan = this._terrainPlan;
    const tiles = (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1);
    const allow = Math.floor(tiles * maxFrac);
    const hits = this._band;
    hits.length = 0;
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = y * cols + x;
        if (plan[i] !== 0) hits.push(i);
      }
    }
    for (let n = hits.length; n > allow; n--) {
      const pick = (this._rng() * n) | 0;
      plan[hits[pick]] = 0;
      this._terrainCount--;
      hits[pick] = hits[n - 1];
    }
    hits.length = 0;
  }

  // =========================================================================
  // bounds, tiles, terrain
  // =========================================================================

  idx(x, y) { return y * this.maxCols + x; }

  inBounds(x, y) {
    const b = this.bounds;
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  tileAt(x, y) {
    const b = this.bounds;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return T_OUT;
    return this.tiles[y * this.maxCols + x];
  }

  /** T_EMPTY only. Roads live ON T_EMPTY tiles, so a road tile is still buildable. */
  isBuildable(x, y) {
    return this.tileAt(x, y) === T_EMPTY;
  }

  /**
   * Grow the playable rect by `rings` on all four sides, clamped to `maxBounds`,
   * and generate terrain ONLY in the newly revealed band. Already-revealed
   * terrain and every existing road/building is untouched.
   *
   * The clamp is PER SIDE, so an authored map whose start rect sits against one
   * edge keeps growing in the directions that still have room — Los Angeles opens
   * out to the east and south for twenty weeks after north and west have maxed.
   * @returns {{x0:number,y0:number,x1:number,y1:number}} the live bounds object
   */
  expandBounds(rings) {
    const r = Math.max(0, rings | 0);
    if (r === 0) return this.bounds;
    const b = this.bounds, mb = this.maxBounds;
    const old = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    b.x0 = Math.max(mb.x0, b.x0 - r);
    b.y0 = Math.max(mb.y0, b.y0 - r);
    b.x1 = Math.min(mb.x1, b.x1 + r);
    b.y1 = Math.min(mb.y1, b.y1 + r);
    if (b.x0 === old.x0 && b.y0 === old.y0 && b.x1 === old.x1 && b.y1 === old.y1) {
      return this.bounds;   // already maxed out — no version bump, nothing changed
    }
    this._reveal(b, old);
    this.version++;
    return this.bounds;
  }

  /**
   * Grow the playable rect to cover `target` (clamped to `maxBounds`), revealing
   * the newly included band. Growth ONLY — each side moves outward or stays put, so
   * a rounding wobble in a timed reveal can never take tiles (or the roads/buildings
   * on them) away. Reveals and bumps `version` iff something actually changed.
   * @returns {{x0:number,y0:number,x1:number,y1:number}} the live bounds object
   */
  expandTo(x0, y0, x1, y1) {
    const b = this.bounds, mb = this.maxBounds;
    const nx0 = Math.max(mb.x0, Math.min(b.x0, x0 | 0));
    const ny0 = Math.max(mb.y0, Math.min(b.y0, y0 | 0));
    const nx1 = Math.min(mb.x1, Math.max(b.x1, x1 | 0));
    const ny1 = Math.min(mb.y1, Math.max(b.y1, y1 | 0));
    if (nx0 === b.x0 && ny0 === b.y0 && nx1 === b.x1 && ny1 === b.y1) return this.bounds;
    const old = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    b.x0 = nx0; b.y0 = ny0; b.x1 = nx1; b.y1 = ny1;
    this._reveal(b, old);
    this.version++;
    return this.bounds;
  }

  /**
   * Mark every tile in `nb` that is not in `ob` as revealed land, taking its
   * water/mountain from the plan laid down at construction. Revealing NEVER
   * invents terrain: the map's rivers and mountains were decided for the whole
   * grid before the first frame, so a range that runs off the visible edge is
   * still there, unchanged, when the bounds reach it.
   */
  _reveal(nb, ob) {
    const cols = this.maxCols;
    const plan = this._terrainPlan;
    const mask = this._outMask;
    const lut = this._planLut;
    for (let y = nb.y0; y <= nb.y1; y++) {
      const inOldRow = ob && y >= ob.y0 && y <= ob.y1;
      for (let x = nb.x0; x <= nb.x1; x++) {
        if (inOldRow && x >= ob.x0 && x <= ob.x1) continue;   // already revealed
        const i = y * cols + x;
        // Off-map cells inside the rect reveal as T_OUT and stay that way forever,
        // which every rule already reads as "not yours" (canAddEdge -> R_OOB,
        // isBuildable -> false), so an irregular boundary needs no new checks.
        this.tiles[i] = mask[i] ? T_OUT : lut[plan[i]];
      }
    }
  }

  /** Clamp a coordinate into the grid. See `planTileAt` for why. */
  _clampIdx(x, y) {
    const cx = x < 0 ? 0 : (x > this.maxCols - 1 ? this.maxCols - 1 : x | 0);
    const cy = y < 0 ? 0 : (y > this.maxRows - 1 ? this.maxRows - 1 : y | 0);
    return cy * this.maxCols + cx;
  }

  /**
   * The planned TERRAIN at (x,y) — water, rock or land — whether or not the cell
   * has been revealed and whether or not it is playable, with the coordinate
   * CLAMPED into the grid. This is the renderer's view of the world outside the
   * playable rect, and the clamp makes the edge row/column repeat outwards so the
   * ocean runs off the screen instead of stopping in mid-air.
   *
   * It deliberately ignores the off-map mask: on Los Angeles most of the Pacific is
   * outside the boundary, and the player is meant to SEE it. `planOutAt` is the
   * separate question. Gameplay must use neither — `tileAt` is the only truth.
   */
  planTileAt(x, y) {
    return this._planLut[this._terrainPlan[this._clampIdx(x, y)]];
  }

  /** 1 if (x,y) is off-map (never playable), clamped like planTileAt. */
  planOutAt(x, y) {
    return this._outMask[this._clampIdx(x, y)];
  }

  /** S_* corner hint for the planned terrain at (x,y), clamped like planTileAt. */
  planShapeAt(x, y) {
    return this._terrainShape[this._clampIdx(x, y)];
  }

  /** True only for a pristine tile: empty land, no edges, no flags. */
  _virgin(i) {
    return this.tiles[i] === T_EMPTY && this.edges[i] === 0 && this.flags[i] === 0;
  }

  // Organic blobs of the map's terrain type across the ENTIRE grid, run ONCE at
  // construction into `_terrainPlan` — nothing is revealed yet and nothing is
  // built, so the generator is free to sprawl a blob over the whole map and let
  // `_reveal` uncover it a ring at a time. Density is 7..11% of every tile the
  // map will ever have.
  _planTerrain() {
    const cols = this.maxCols, rows = this.maxRows;
    const total = cols * rows;
    const plan = this._terrainPlan;
    const frac = TERRAIN_MIN + this._rng() * TERRAIN_SPAN;
    let need = Math.round(total * frac);
    if (need <= 0) return;

    const frontier = this._frontier;
    let guard = 2000;
    while (need > 0 && guard-- > 0) {
      // find a seed; give up after a bounded search so a saturated map cannot hang
      let seed = -1;
      for (let t = 0; t < 24; t++) {
        const c = (this._rng() * total) | 0;
        if (plan[c] === 0) { seed = c; break; }
      }
      if (seed < 0) break;

      // Bigger blobs than the old per-band generator could afford: a range or a
      // lake now gets to be map-scale instead of ring-scale.
      let size = 4 + ((this._rng() * 14) | 0);
      if (size > need) size = need;
      frontier.length = 0;
      frontier.push(seed);
      let placed = 0;
      while (placed < size && frontier.length > 0) {
        const pick = (this._rng() * frontier.length) | 0;
        const ci = frontier[pick];
        frontier[pick] = frontier[frontier.length - 1];
        frontier.length--;
        if (plan[ci] !== 0) continue;
        plan[ci] = 1;      // slot 1 of _planLut = whichever terrain this run drew
        placed++; need--; this._terrainCount++;
        if (need <= 0) break;
        const cx = ci % cols, cy = (ci / cols) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX[d], ny = cy + DY[d];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (plan[ni] === 0) frontier.push(ni);
        }
      }
    }
    frontier.length = 0;
  }

  // =========================================================================
  // road edges
  // =========================================================================

  /** 8-bit mask of every road link leaving this tile (live AND ghost). */
  edgeMask(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.edges[y * this.maxCols + x];
  }

  /** 8-bit mask of the ghost subset — for the renderer's translucent pass. */
  ghostMask(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.ghosts[y * this.maxCols + x];
  }

  /** 8-bit mask of the live (traversable-by-new-paths) subset. */
  liveMask(x, y) {
    if (!this.inBounds(x, y)) return 0;
    const i = y * this.maxCols + x;
    return this.edges[i] & ~this.ghosts[i];
  }

  /** True if an edge exists at all, live or ghost. */
  hasEdge(x, y, dir) {
    if (dir < 0 || dir > 7 || !this.inBounds(x, y)) return false;
    return (this.edges[y * this.maxCols + x] & (1 << dir)) !== 0;
  }

  isGhost(x, y, dir) {
    if (dir < 0 || dir > 7 || !this.inBounds(x, y)) return false;
    return (this.ghosts[y * this.maxCols + x] & (1 << dir)) !== 0;
  }

  /** True if (x,y) is a house tile. Lets the shell reason about drives without the enum. */
  isHouseTile(x, y) {
    if (!this.inBounds(x, y)) return false;
    return this.tiles[y * this.maxCols + x] === T_HOUSE;
  }

  /**
   * True if either endpoint of edge (x,y,dir) is a HOUSE tile. Such an edge is that
   * house's DRIVE: sim lays it for FREE (it does not cost a road tile) and a house
   * may hold only ONE — see `clearHouseDrivesExcept`.
   */
  touchesHouse(x, y, dir) {
    if (dir < 0 || dir > 7 || !this.inBounds(x, y)) return false;
    const nx = x + DX[dir], ny = y + DY[dir];
    if (!this.inBounds(nx, ny)) return false;
    const cols = this.maxCols;
    return this.tiles[y * cols + x] === T_HOUSE || this.tiles[ny * cols + nx] === T_HOUSE;
  }

  /**
   * A house has exactly one drive. Before laying edge (x,y,dir), tear up any OTHER
   * live edge on whichever endpoint(s) are houses, so dragging a drive in a new
   * direction replaces the old one. `removeEdge` ghosts an old drive a car is still
   * driving home along, so a replaced drive behaves like any other still-needed road.
   * Call BEFORE addEdge.
   */
  clearHouseDrivesExcept(x, y, dir) {
    if (dir < 0 || dir > 7 || !this.inBounds(x, y)) return;
    const cols = this.maxCols;
    const nx = x + DX[dir], ny = y + DY[dir];
    if (this.tiles[y * cols + x] === T_HOUSE) this._clearDriveExcept(x, y, dir);
    if (this.inBounds(nx, ny) && this.tiles[ny * cols + nx] === T_HOUSE) {
      this._clearDriveExcept(nx, ny, OPP[dir]);
    }
  }
  _clearDriveExcept(hx, hy, keepDir) {
    const i = hy * this.maxCols + hx;
    const live = this.edges[i] & ~this.ghosts[i];
    for (let d = 0; d < 8; d++) {
      if (d === keepDir) continue;
      if ((live & (1 << d)) !== 0) this.removeEdge(hx, hy, d);
    }
  }

  /**
   * @returns {number} 0 if the edge may be laid, else a REASON code.
   * A ghost edge reports 0: a ghost is dead weight, not an obstacle, so drawing
   * over one revives it (see addEdge).
   */
  canAddEdge(x, y, dir) {
    if (dir < 0 || dir > 7) return R_OOB;
    if (!this.inBounds(x, y)) return R_OOB;
    const nx = x + DX[dir], ny = y + DY[dir];
    if (!this.inBounds(nx, ny)) return R_OOB;

    const cols = this.maxCols;
    const i = y * cols + x, j = ny * cols + nx;
    const bit = 1 << dir;
    if ((this.edges[i] & bit) !== 0 && (this.ghosts[i] & bit) === 0) return R_EXISTS;

    // Nothing terminates on a roundabout's island — a road there would be paid
    // for, hidden under the painted middle, and never driven on.
    if (this.isRoundCentre(x, y) || this.isRoundCentre(nx, ny)) return R_INFRA;

    const ta = this.tiles[i], tb = this.tiles[j];
    const ba = ta === T_HOUSE || ta === T_DEST;
    const bb = tb === T_HOUSE || tb === T_DEST;
    if (ba || bb) {
      // A road may only land on a building at one of its GATE tiles, but it may
      // land there from any of the 8 dirs.
      if (ba && (this.flags[i] & F_GATE) === 0) return R_BUILDING;
      if (bb && (this.flags[j] & F_GATE) === 0) return R_BUILDING;
      // ...and an edge must always have at least one end on open land. Both ends
      // inside ONE building would run a road through the footprint (the 3x2's two
      // gates are the case that cares). Both ends in DIFFERENT buildings is out
      // too: a gate's only interior link is its own door, so gate->door->far-gate
      // would drive a car straight through a shop or a house. Every building keeps
      // at least one road-capable neighbour, so nothing is stranded by this.
      if (ba && bb) return R_BUILDING;
    }
    // An in-bounds T_OUT tile is a cell an authored level masked off. Reported as
    // R_OOB, not R_TERRAIN: it is outside the city, not an obstacle a bridge could
    // span, and the shell's denial flash says the right thing for each.
    if (ta === T_OUT || tb === T_OUT) return R_OOB;
    // Water/mountain needs a bridge/tunnel, not a road edge. Reported as terrain
    // (code 2) rather than code 6 because code 2 is the more specific answer;
    // canAddEdge therefore never returns 6.
    if (!ba && ta !== T_EMPTY) return R_TERRAIN;
    if (!bb && tb !== T_EMPTY) return R_TERRAIN;

    if ((dir & 1) === 1) {
      // Diagonal: it may not CUT A CORNER. The edge passes exactly through the point
      // where its two SHOULDER tiles (nx,y) and (x,ny) meet, so anything solid on
      // either one is something the road is drawn straight across. Both ends being
      // legal is not enough — that was the bug: a corner-cutter's endpoints are both
      // perfectly ordinary open land.
      // Solid means an office body, an office DRIVEWAY (the "lot" — a diagonal off the
      // connection point must not clip its corner either; the C tile has other
      // diagonals and all its orthogonals, so the office is still joinable), water and
      // mountain. Water and mountain answer R_TERRAIN rather than R_BUILDING so the
      // refusal names the right thing.
      // The ONE exemption is a HOUSE: a single tile that joins from all eight
      // directions, so a diagonal past its corner reads as a road going by a cottage
      // rather than through it. Note a house also carries F_BUILD, which is why none of
      // this can be a flag test.
      const sa = y * cols + nx, sb = ny * cols + x;
      const qa = this.tiles[sa], qb = this.tiles[sb];
      if (qa === T_WATER || qa === T_MOUNTAIN || qb === T_WATER || qb === T_MOUNTAIN) {
        return R_TERRAIN;
      }
      if (qa === T_DEST || qb === T_DEST) return R_BUILDING;
      // Refuse too if the opposing diagonal of the same 2x2 block is live.
      // Block corners: (x,y), (nx,y), (x,ny), (nx,ny). The opposing diagonal runs
      // (nx,y) -> (x,ny).
      const od = dirOf(x - nx, ny - y);
      if (od >= 0) {
        const k = y * cols + nx;
        const ob = 1 << od;
        if ((this.edges[k] & ob) !== 0 && (this.ghosts[k] & ob) === 0) return R_CROSS;
      }
    }
    return R_OK;
  }

  /**
   * Lay an edge. Validates geometry (so the mask can never desync) but NOT the
   * budget — sim owns the wallet.
   * @returns {boolean}
   */
  addEdge(x, y, dir) {
    if (this.canAddEdge(x, y, dir) !== R_OK) return false;
    const cols = this.maxCols;
    const nx = x + DX[dir], ny = y + DY[dir];
    const i = y * cols + x, j = ny * cols + nx;
    const bit = 1 << dir, obit = 1 << OPP[dir];
    const wasGhost = (this.ghosts[i] & bit) !== 0;

    this.edges[i] |= bit;
    this.edges[j] |= obit;
    this.ghosts[i] &= ~bit;
    this.ghosts[j] &= ~obit;
    if (wasGhost) this._forgetGhost(x, y, dir);

    this._deg[i]++;
    this._deg[j]++;
    this._liveEdges++;
    this.version++;
    return true;
  }

  /**
   * Erase an edge.
   * @returns {'removed'|'ghost'|false} 'ghost' when some car still NEEDS it (that is
   * whatever occupancyFn counts: cars driving it, and cars that remember driving it
   * as their way home). The edge stays in the graph, drawn, and drivable only by
   * those cars — linksFrom flags it `ghost:true` and traffic lets exactly the cars
   * that remember it through — but counts as dead for isIntersection/edgeCount and
   * canAddEdge, so the player may redraw straight over it. It DOES still hold its
   * tiles against a new building (canPlaceHouse/canPlaceDest test the raw edge mask),
   * which is deliberate: nothing may be built on a tile a car is still driving
   * through. Both outcomes refund the tile in sim: 'ghost' is about not stranding
   * cars, not about the money. Already-ghost edges return false: nothing changes, so
   * an erase dragged twice cannot refund it twice.
   */
  removeEdge(x, y, dir) {
    if (dir < 0 || dir > 7 || !this.inBounds(x, y)) return false;
    const cols = this.maxCols;
    const i = y * cols + x;
    const bit = 1 << dir;
    if ((this.edges[i] & bit) === 0) return false;
    if ((this.ghosts[i] & bit) !== 0) return false;   // already a ghost

    const nx = x + DX[dir], ny = y + DY[dir];
    const j = ny * cols + nx;
    const obit = 1 << OPP[dir];

    let occ = 0;
    try {
      occ = (this.occupancyFn(x, y, dir) | 0) + (this.occupancyFn(nx, ny, OPP[dir]) | 0);
    } catch (e) { occ = 0; }

    // the edge stops being live either way
    this._deg[i]--;
    this._deg[j]--;
    this._liveEdges--;
    this.version++;

    if (occ > 0) {
      this.ghosts[i] |= bit;
      this.ghosts[j] |= obit;
      this._rememberGhost(x, y, dir);
      return 'ghost';
    }
    this.edges[i] &= ~bit;
    this.edges[j] &= ~obit;
    return 'removed';
  }

  /**
   * Finalise a ghost — traffic calls this when the last car vacates. The edge
   * leaves the graph entirely and stops being drawn. No money is involved: the
   * erase that created the ghost already refunded the tile.
   * @returns {boolean}
   */
  releaseGhost(x, y, dir) {
    if (dir < 0 || dir > 7 || !this.inBounds(x, y)) return false;
    const cols = this.maxCols;
    const i = y * cols + x;
    const bit = 1 << dir;
    if ((this.ghosts[i] & bit) === 0) return false;
    const nx = x + DX[dir], ny = y + DY[dir];
    const j = ny * cols + nx;
    const obit = 1 << OPP[dir];
    this.ghosts[i] &= ~bit;
    this.ghosts[j] &= ~obit;
    this.edges[i] &= ~bit;
    this.edges[j] &= ~obit;
    this._forgetGhost(x, y, dir);
    this.version++;
    return true;
  }

  /** [{x,y,dir}] for rendering. Live internal array — read it, never mutate it. */
  ghostList() { return this._ghostList; }

  /** Total live (non-ghost) edges. Counts each undirected edge once. */
  edgeCount() { return this._liveEdges; }

  // Ghost list entries are stored in a canonical orientation (dir < 4) so either
  // end of an edge finds the same record.
  _ghostKey(x, y, dir) {
    if (dir >= 4) {
      x += DX[dir]; y += DY[dir]; dir = OPP[dir];
    }
    return (y * this.maxCols + x) * 8 + dir;
  }

  _rememberGhost(x, y, dir) {
    const key = this._ghostKey(x, y, dir);
    if (this._ghostIndex.has(key)) return;
    this._ghostIndex.set(key, this._ghostList.length);
    this._ghostList.push({ x: x, y: y, dir: dir });
  }

  _forgetGhost(x, y, dir) {
    const key = this._ghostKey(x, y, dir);
    const at = this._ghostIndex.get(key);
    if (at === undefined) return;
    const list = this._ghostList;
    const last = list.length - 1;
    if (at !== last) {
      list[at] = list[last];
      this._ghostIndex.set(this._ghostKey(list[at].x, list[at].y, list[at].dir), at);
    }
    list.length = last;
    this._ghostIndex.delete(key);
  }

  // =========================================================================
  // buildings
  // =========================================================================

  /** @returns {object|null} the house or dest occupying this tile. */
  buildingAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    const id = this._buildAt[y * this.maxCols + x];
    if (id === 0) return null;
    return this._byId.get(id - 1) || null;
  }

  byId(id) { return this._byId.get(id) || null; }

  /** O(1): may a road edge terminate on this tile's building here? */
  isGate(x, y) {
    if (!this.inBounds(x, y)) return false;
    return (this.flags[y * this.maxCols + x] & F_GATE) !== 0;
  }

  /** The building this gate belongs to, or null when the tile is not a gate. */
  gateOwner(x, y) {
    if (!this.isGate(x, y)) return null;
    return this.buildingAt(x, y);
  }

  /** A 1x1 house needs a pristine tile that is not inside a destination's buffer. */
  canPlaceHouse(x, y) {
    if (!this.inBounds(x, y)) return R_OOB;
    const i = y * this.maxCols + x;
    const t = this.tiles[i];
    if (t === T_HOUSE || t === T_DEST) return R_BUILDING;
    if (t !== T_EMPTY) return R_TERRAIN;
    if (this.edges[i] !== 0) return R_EXISTS;      // never bulldoze roads
    if (this.flags[i] !== 0) return R_INFRA;       // light / roundabout / peg / gate
    // keep the "no building within 1 tile of a destination footprint" invariant
    // true forever, not just at the moment the destination was placed
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const b = this.buildingAt(x + dx, y + dy);
        if (b && b.w !== undefined) return R_BUILDING;
      }
    }
    return R_OK;
  }

  /** w x h footprint of pristine tiles plus a 1-tile buffer clear of other buildings. */
  canPlaceDest(x, y, w, h) {
    w = w | 0; h = h | 0;
    if (w < 1 || h < 1) return R_GEOMETRY;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!this.inBounds(xx, yy)) return R_OOB;
        const i = yy * this.maxCols + xx;
        const t = this.tiles[i];
        if (t === T_HOUSE || t === T_DEST) return R_BUILDING;
        if (t !== T_EMPTY) return R_TERRAIN;
        if (this.edges[i] !== 0) return R_EXISTS;
        if (this.flags[i] !== 0) return R_INFRA;
      }
    }
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
        if (!this.inBounds(xx, yy)) continue;      // outside bounds is a fine buffer
        if ((this.flags[yy * this.maxCols + xx] & F_BUILD) !== 0) return R_BUILDING;
      }
    }
    return R_OK;
  }

  /**
   * @param {object} spec {x, y, color}
   *   A house is its own gate and its own door: roads join the house tile itself,
   *   from any of the 8 dirs. No driveway tile, no orientation to choose.
   * @returns {object|null} the house
   */
  addHouse(spec) {
    const x = spec.x | 0, y = spec.y | 0;
    if (this.canPlaceHouse(x, y) !== R_OK) return null;
    const id = this._nextId++;
    const h = {
      id: id, x: x, y: y,
      color: spec.color | 0,
      gates: [{ x: x, y: y }],
      doorX: x, doorY: y,
      cars: 0, maxCars: 2
    };
    const i = y * this.maxCols + x;
    this.tiles[i] = T_HOUSE;
    this.flags[i] |= F_BUILD | F_GATE;
    this._buildAt[i] = id + 1;
    this.houses.push(h);
    this._byId.set(id, h);
    this.version++;
    return h;
  }

  /**
   * Could an office of this variant stand with its footprint origin at (x,y)?
   * Two tests: the footprint itself (pristine tiles plus the 1-tile buffer, via
   * canPlaceDest) and every CONNECTION POINT, which lives outside the footprint
   * and must be pristine open land — the office's only road frontage cannot start
   * life buried under a road, a light or another building.
   * @returns {number} an R_* reason code; R_OK means yes
   */
  canPlaceOffice(variantId, x, y) {
    const v = (typeof variantId === 'object' && variantId) ? variantId : officeVariant(variantId);
    if (!v) return R_GEOMETRY;
    const fx = x | 0, fy = y | 0;
    const r = this.canPlaceDest(fx, fy, v.w, v.h);
    if (r !== R_OK) return r;
    const cols = this.maxCols;
    for (let k = 0; k < v.conns.length; k++) {
      const cxx = fx + v.conns[k][0], cyy = fy + v.conns[k][1];
      if (!this.inBounds(cxx, cyy)) return R_OOB;
      const i = cyy * cols + cxx;
      if (this.tiles[i] !== T_EMPTY) return this.tiles[i] === T_OUT ? R_OOB : R_TERRAIN;
      if (this.edges[i] !== 0) return R_EXISTS;
      if (this.flags[i] !== 0) return R_INFRA;
      if (this._buildAt[i] !== 0) return R_BUILDING;
    }
    return R_OK;
  }

  /** Variants that match a legacy w x h request, in a shuffled order. */
  _fittingVariants(w, h) {
    const out = [];
    for (let i = 0; i < OFFICE_VARIANTS.length; i++) {
      const v = OFFICE_VARIANTS[i];
      if (v.dbl) continue;                     // a double needs two colours named
      if (v.w === w && v.h === h) out.push(v);
    }
    for (let i = out.length - 1; i > 0; i--) {
      const j = (this._rng() * (i + 1)) | 0;
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /**
   * Place an office.
   * @param {object} spec {x, y, variant, colors|color, shapes|shape, w, h}
   *   `variant` is an id from OFFICE_VARIANTS ('1a'..'3d') and decides the whole
   *   anatomy: footprint, driveway, connection points, parking bays. `w`/`h` are
   *   accepted instead for older callers, which then get a random single-colour
   *   variant of that size. A double variant takes TWO colours (`colors`); given
   *   one, both halves take it.
   * @returns {object|null} the PRIMARY dest record. A double office also pushed a
   *   second record for its other colour — read `.parts` for both.
   */
  addDest(spec) {
    const x = spec.x | 0, y = spec.y | 0;
    const list = spec.variant
      ? [officeVariant(spec.variant)]
      : this._fittingVariants(spec.w | 0, spec.h | 0);
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!v) continue;
      if (this.canPlaceOffice(v, x, y) !== R_OK) continue;
      return this._buildOffice(v, x, y, spec);
    }
    return null;
  }

  /** Commit a validated office to the grid. Callers must have checked placement. */
  _buildOffice(v, x, y, spec) {
    const cols = this.maxCols;

    // shared geometry, absolute — one array per office, handed to every part
    const drive = [];
    for (let k = 0; k < v.drive.length; k++) {
      drive.push({ x: x + v.drive[k][0], y: y + v.drive[k][1] });
    }
    const conns = [];
    for (let k = 0; k < v.conns.length; k++) {
      conns.push({ x: x + v.conns[k][0], y: y + v.conns[k][1] });
    }

    const cs = Array.isArray(spec.colors) && spec.colors.length ? spec.colors : [spec.color | 0];
    const ss = Array.isArray(spec.shapes) && spec.shapes.length ? spec.shapes : null;
    const parts = [];
    for (let k = 0; k < v.halves.length; k++) {
      const hh = v.halves[k];
      const bay = v.drive[v.bays[k]];
      const shp = ss ? ss[k % ss.length] : spec.shape;
      parts.push({
        id: this._nextId++,
        x: x, y: y, w: v.w, h: v.h,               // the WHOLE footprint, on every part
        variant: v.id,
        color: cs[k % cs.length] | 0,
        shape: shp === 'circle' ? 'circle' : 'square',
        isHalf: !!v.dbl,                          // demand.js rates a half differently
        slot: k,
        half: { x: x + hh[0], y: y + hh[1], w: hh[2], h: hh[3] },
        doorX: x + bay[0], doorY: y + bay[1],     // the parking bay, a driveway tile
        drive: drive, conns: conns,
        gates: conns,                             // compat alias: roads join here
        parts: parts,
        complex: null
      });
    }
    for (let k = 0; k < parts.length; k++) parts[k].complex = parts[0];

    /* The car park: two axes, a bank of marked spaces, and one space per colour.
     *
     *   bayN — the drive lane's normal, signed towards that colour's own block. The
     *          driveway tile is ON the lane, so a space is the strip of forecourt
     *          between the lane's kerb and the wall, and this is "out of the lane".
     *   bayT — along the lane, AWAY from the nearest connection point: the direction
     *          a car is already travelling when it arrives, because the only way in
     *          is through a connection point. An angled space has to lean the way the
     *          traffic goes or you cannot nose into it — leaning it the other way
     *          (which an earlier version did, to keep the markings clear of the lot's
     *          edge) made the car swing 135 degrees on the spot instead of 45. The
     *          markings are clipped to the lot instead.
     *
     * A space is at 45 degrees: its axis is the bisector (bayN + bayT)/sqrt2, the
     * line a car noses in along and reverses back out along.
     *
     * The lot holds a BANK of spaces, not one per colour: LOT_SPACES across a
     * single's 2-tile driveway, LOT_SPACES_DBL across a double's 4-tile one, evenly
     * pitched and inset half a slant's travel at each end so nothing hangs off the
     * lot. Each space leans away from ITS OWN nearest connection point, so a single
     * (one point, at one end) comes out as a uniform bank and a double (one at each
     * end) as a herringbone meeting in the middle — which is how the two colours'
     * cars actually arrive. Each colour then takes the space nearest its own bay tile
     * and inherits that space's lean, so the paint and the parked car cannot disagree.
     *
     * Baked here, once, because it is pure variant geometry and the renderer (the
     * markings, and which end of the facade the door goes in) and traffic (the park
     * manoeuvre) must both read the same answer. */
    const last = v.drive.length - 1;
    let lx = 0, ly = 0;
    if (last > 0) { lx = v.drive[last][0] - v.drive[0][0]; ly = v.drive[last][1] - v.drive[0][1]; }
    const ll = Math.sqrt(lx * lx + ly * ly) || 1;
    const tx = lx / ll, ty = ly / ll;               // lane forward, drive[0] -> far end
    const nx = -ty, ny = tx;                        // lane normal
    // along-lane coordinate: tiles from the MIDDLE of the drive strip, signed along t
    const alongOf = (px, py) =>
      (px - v.drive[0][0]) * tx + (py - v.drive[0][1]) * ty - last / 2;
    const connA = [];
    for (let j = 0; j < v.conns.length; j++) connA.push(alongOf(v.conns[j][0], v.conns[j][1]));
    // which way a space at `a` leans: away from whichever connection point is nearest
    const leanAt = (a) => {
      let near = Infinity, cp = 0;
      for (let j = 0; j < connA.length; j++) {
        const gap = Math.abs(a - connA[j]);
        if (gap < near) { near = gap; cp = connA[j]; }
      }
      const dv = a - cp;
      return dv > 1e-6 ? 1 : (dv < -1e-6 ? -1 : (a <= 0 ? 1 : -1));
    };
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k], hb = p.half;
      let dot = (hb.x + hb.w / 2 - (p.doorX + 0.5)) * nx + (hb.y + hb.h / 2 - (p.doorY + 0.5)) * ny;
      // A block centred on the lane (never happens in the shipped table, but a new
      // variant could) gives no answer, so the two colours take opposite sides.
      if (Math.abs(dot) < 0.2) dot = k ? 1 : -1;
      const s = dot > 0 ? 1 : -1;
      p.bayNX = nx * s; p.bayNY = ny * s;
      p.bayAlong = alongOf(v.drive[v.bays[k] | 0][0], v.drive[v.bays[k] | 0][1]);
    }
    const band = last + 1;                          // tiles of driveway = the bank's room
    const travel = BAY_OUT - BAY_IN;                // how far a 45 degree side line runs
    const count = v.dbl ? LOT_SPACES_DBL : LOT_SPACES;
    const pitch = (band - travel) / count;
    const scx = x + (v.drive[0][0] + v.drive[last][0]) / 2 + 0.5;   // strip centre, world
    const scy = y + (v.drive[0][1] + v.drive[last][1]) / 2 + 0.5;
    const spaces = [];
    for (let k = 0; k < count; k++) {
      const a = -band / 2 + travel / 2 + pitch * (k + 0.5);
      // the colour whose bay tile is nearest owns this space and lends it its normal,
      // so a future variant with its two blocks on opposite sides still works out
      let own = parts[0], od = Infinity;
      for (let j = 0; j < parts.length; j++) {
        const dd = Math.abs(a - parts[j].bayAlong);
        if (dd < od) { od = dd; own = parts[j]; }
      }
      spaces.push({ a: a, s: leanAt(a), nx: own.bayNX, ny: own.bayNY });
    }
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      let bi = 0, bd = Infinity;
      for (let j = 0; j < count; j++) {
        const dd = Math.abs(spaces[j].a - p.bayAlong);
        if (dd < bd) { bd = dd; bi = j; }
      }
      const sp = spaces[bi];
      p.baySlot = bi;
      p.bayTX = tx * sp.s; p.bayTY = ty * sp.s;     // the lean of its OWN space
      p.bayCX = scx + tx * sp.a;                    // that space's centre, on the lane axis
      p.bayCY = scy + ty * sp.a;
    }
    // the whole bank hangs off the PRIMARY part, which is the one the renderer draws
    parts[0].lot = { tx: tx, ty: ty, cx: scx, cy: scy, pitch: pitch, spaces: spaces };

    // Every tile of the complex is owned by the PRIMARY part, so buildingAt() has
    // one answer per tile and traffic's "same building" tests stay trivial. Which
    // colour a tile belongs to is geometry (`half`), not ownership.
    const owner = parts[0].id + 1;
    for (let yy = y; yy < y + v.h; yy++) {
      for (let xx = x; xx < x + v.w; xx++) {
        const i = yy * cols + xx;
        this.tiles[i] = T_DEST;
        this.flags[i] |= F_BUILD;
        this._buildAt[i] = owner;
      }
    }
    for (let k = 0; k < drive.length; k++) {
      this.flags[drive[k].y * cols + drive[k].x] |= F_DRIVE;
    }
    for (let k = 0; k < conns.length; k++) {
      const i = conns[k].y * cols + conns[k].x;
      this.flags[i] |= F_GATE;         // F_GATE WITHOUT F_BUILD: open land, joinable
      this._buildAt[i] = owner;
    }

    for (let k = 0; k < parts.length; k++) {
      this.dests.push(parts[k]);
      this._byId.set(parts[k].id, parts[k]);
    }
    this.version++;
    return parts[0];
  }

  /** O(1): is this a driveway tile — drivable by anyone, joinable by nobody? */
  isDriveway(x, y) {
    if (!this.inBounds(x, y)) return false;
    return (this.flags[y * this.maxCols + x] & F_DRIVE) !== 0;
  }

  /** 'square' -> 'circle'. Footprint unchanged. @returns {boolean} */
  upgradeDest(id) {
    const d = this._byId.get(id | 0);
    if (!d || d.w === undefined) return false;
    if (d.shape === 'circle') return false;
    d.shape = 'circle';
    this.version++;
    return true;
  }

  // =========================================================================
  // infrastructure — World validates and stores; sim owns the counts
  // =========================================================================

  /** Peg tile must be inside bounds and road-capable (T_EMPTY, roads welcome). */
  _pegOk(x, y) {
    if (!this.inBounds(x, y)) return R_OOB;
    const t = this.tiles[y * this.maxCols + x];
    if (t === T_HOUSE || t === T_DEST) return R_BUILDING;
    if (t !== T_EMPTY) return R_TERRAIN;
    if (this.isRoundCentre(x, y)) return R_INFRA;   // the island connects to nothing
    return R_OK;
  }

  canAddMotorway(ax, ay, bx, by) {
    let r = this._pegOk(ax, ay); if (r !== R_OK) return r;
    r = this._pegOk(bx, by); if (r !== R_OK) return r;
    const dx = bx - ax, dy = by - ay;
    if (Math.sqrt(dx * dx + dy * dy) < MOTORWAY_MIN_SEP) return R_GEOMETRY;
    const list = this.motorways;
    for (let k = 0; k < list.length; k++) {
      const m = list[k];
      if ((m.ax === ax && m.ay === ay && m.bx === bx && m.by === by) ||
        (m.ax === bx && m.ay === by && m.bx === ax && m.by === ay)) return R_EXISTS;
    }
    return R_OK;
  }

  addMotorway(ax, ay, bx, by) {
    if (this.canAddMotorway(ax, ay, bx, by) !== R_OK) return null;
    const m = { id: this._nextInfraId++, ax: ax | 0, ay: ay | 0, bx: bx | 0, by: by | 0 };
    this.flags[m.ay * this.maxCols + m.ax] |= F_PEG;
    this.flags[m.by * this.maxCols + m.bx] |= F_PEG;
    this.motorways.push(m);
    this.version++;
    return m;
  }

  canAddRoundabout(cx, cy) {
    const cols = this.maxCols;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!this.inBounds(x, y)) return R_OOB;
        const i = y * cols + x;
        const t = this.tiles[i];
        if (t === T_HOUSE || t === T_DEST) return R_BUILDING;
        if (t !== T_EMPTY) return R_TERRAIN;
        // An office's CONNECTION POINT is open land (T_EMPTY, F_GATE without
        // F_BUILD), so the building test above misses it — and a ring tile only
        // emits its one-way circulation link, which would cut the office off the
        // network for as long as the roundabout sat there.
        if ((this.flags[i] & F_GATE) !== 0) return R_BUILDING;
        if ((this.flags[i] & (F_ROUND | F_LIGHT)) !== 0) return R_EXISTS;
        // A span ending on what would become the island would be orphaned: the
        // island emits no links at all.
        if (dx === 0 && dy === 0 && (this.flags[i] & (F_PEG | F_BRIDGE_END)) !== 0) return R_INFRA;
      }
    }
    // It has to be worth building: >= 3 roads must ENTER the 3x3 from outside, which
    // is what an ARM is. Counting every live edge-end inside the block instead (the
    // first cut) let a plain straight road qualify — three of its ends are inside —
    // so the tool offered a roundabout in the middle of a road that has nothing to
    // give way to, and once the legal spots were painted on the map that carpeted it.
    let touching = 0;
    for (let dy = -1; dy <= 1 && touching < 3; dy++) {
      for (let dx = -1; dx <= 1 && touching < 3; dx++) {
        const x = cx + dx, y = cy + dy;
        const i = y * cols + x;
        const live = this.edges[i] & ~this.ghosts[i];
        if (live === 0) continue;
        for (let d = 0; d < 8; d++) {
          if ((live & (1 << d)) === 0) continue;
          const nx = x + DX[d], ny = y + DY[d];
          // internal edges are the ring's own business, not an arm
          if (nx >= cx - 1 && nx <= cx + 1 && ny >= cy - 1 && ny <= cy + 1) continue;
          touching++;
          if (touching >= 3) break;
        }
      }
    }
    if (touching < 3) return R_GEOMETRY;
    return R_OK;
  }

  addRoundabout(cx, cy) {
    if (this.canAddRoundabout(cx, cy) !== R_OK) return null;
    const r = { id: this._nextInfraId++, cx: cx | 0, cy: cy | 0 };
    // `_roundAt` stores the ARRAY INDEX + 1, so removeRoundabout has to reindex
    // whatever follows the hole it makes.
    const slot = this.roundabouts.length;
    this.roundabouts.push(r);
    const cols = this.maxCols;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = (cy + dy) * cols + (cx + dx);
        this.flags[i] |= F_ROUND;
        this._roundAt[i] = slot + 1;        // index+1 so flow lookup is O(1)
      }
    }
    this.version++;
    return r;
  }

  canAddLight(x, y) {
    if (!this.inBounds(x, y)) return R_OOB;
    const i = y * this.maxCols + x;
    if ((this.flags[i] & F_LIGHT) !== 0) return R_EXISTS;
    if ((this.flags[i] & F_ROUND) !== 0) return R_EXISTS;   // a roundabout already yields
    // A gate can carry three road edges and so look like a junction, but no
    // infrastructure ever sits on a footprint.
    if ((this.flags[i] & F_BUILD) !== 0) return R_BUILDING;
    if (this._deg[i] <= 2) return R_GEOMETRY;               // not an intersection
    return R_OK;
  }

  addLight(x, y) {
    if (this.canAddLight(x, y) !== R_OK) return null;
    // `greenAxis` is part of the light's public shape: 0 = the horizontal axis is
    // green, 1 = vertical. World only declares and seeds it — Traffic owns the
    // phase and rewrites it each tick, and render.js draws whichever axis it says,
    // so the light you see is always the light the cars are actually obeying.
    const l = { id: this._nextInfraId++, x: x | 0, y: y | 0, greenAxis: 0 };
    this.flags[l.y * this.maxCols + l.x] |= F_LIGHT;
    this.lights.push(l);
    this.version++;
    return l;
  }

  /**
   * A bridge/tunnel spans unbuildable terrain: both mouths on land, collinear
   * along one of the 8 dirs, and ONLY water/mountain strictly between them.
   * Any length is legal.
   */
  canAddBridge(ax, ay, bx, by) {
    if (!this.inBounds(ax, ay) || !this.inBounds(bx, by)) return R_OOB;
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return R_GEOMETRY;
    if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return R_GEOMETRY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps < 2) return R_GEOMETRY;   // nothing in between to span
    const dir = dirOf(Math.sign(dx), Math.sign(dy));
    if (dir < 0) return R_GEOMETRY;

    const ta = this.tileAt(ax, ay), tb = this.tileAt(bx, by);
    if (ta === T_HOUSE || ta === T_DEST || tb === T_HOUSE || tb === T_DEST) return R_BUILDING;
    if (ta !== T_EMPTY || tb !== T_EMPTY) return R_TERRAIN;   // mouths must be land
    if (this.isRoundCentre(ax, ay) || this.isRoundCentre(bx, by)) return R_INFRA;

    for (let s = 1; s < steps; s++) {
      const t = this.tileAt(ax + DX[dir] * s, ay + DY[dir] * s);
      if (t !== T_WATER && t !== T_MOUNTAIN) return R_TERRAIN;
    }
    const list = this.bridges;
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if ((b.ax === ax && b.ay === ay && b.bx === bx && b.by === by) ||
        (b.ax === bx && b.ay === by && b.bx === ax && b.by === ay)) return R_EXISTS;
    }
    return R_OK;
  }

  addBridge(ax, ay, bx, by) {
    if (this.canAddBridge(ax, ay, bx, by) !== R_OK) return null;
    const dir = dirOf(Math.sign(bx - ax), Math.sign(by - ay));
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const b = {
      id: this._nextInfraId++,
      ax: ax | 0, ay: ay | 0, bx: bx | 0, by: by | 0,
      dir: dir,
      len: steps                     // INTEGER grid steps (rendering); traversal
    };                               // cost is steps * DIR_LEN[dir], see linksFrom
    this.flags[b.ay * this.maxCols + b.ax] |= F_BRIDGE_END;
    this.flags[b.by * this.maxCols + b.bx] |= F_BRIDGE_END;
    this.bridges.push(b);
    this.version++;
    return b;
  }

  // ---- removal. Infrastructure is layered OVER the road, so removing a piece
  // never touches the edges underneath. There is no ghost stage: a car already
  // committed to a span has its geometry cached (see traffic's _tryDepart) and
  // finishes the hop, and `linksFrom` stops offering the span immediately, so no
  // new traversal can start on it.

  /** Index of the span in `list` with an end on (x,y), or -1. */
  _spanIndexAt(list, x, y) {
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if ((s.ax === x && s.ay === y) || (s.bx === x && s.by === y)) return k;
    }
    return -1;
  }

  /** Drop `bit` from (x,y) unless a span still left in `list` also ends there. */
  _releaseSpanFlag(list, x, y, bit) {
    if (this._spanIndexAt(list, x, y) >= 0) return;      // shared with another span
    this.flags[y * this.maxCols + x] &= ~bit;
  }

  /**
   * The infrastructure on a tile, topmost first: a light, then a motorway peg,
   * then a bridge/tunnel mouth, then a roundabout ring tile.
   * @returns {{kind:'lights'|'motorway'|'bridge'|'roundabout', obj:object}|null}
   *          `kind` doubles as the sim inventory key.
   */
  infraAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    const i = y * this.maxCols + x, f = this.flags[i];
    if (f === 0) return null;
    if ((f & F_LIGHT) !== 0) {
      for (let k = 0; k < this.lights.length; k++) {
        const l = this.lights[k];
        if (l.x === x && l.y === y) return { kind: 'lights', obj: l };
      }
    }
    if ((f & F_PEG) !== 0) {
      const k = this._spanIndexAt(this.motorways, x, y);
      if (k >= 0) return { kind: 'motorway', obj: this.motorways[k] };
    }
    if ((f & F_BRIDGE_END) !== 0) {
      const k = this._spanIndexAt(this.bridges, x, y);
      if (k >= 0) return { kind: 'bridge', obj: this.bridges[k] };
    }
    if ((f & F_ROUND) !== 0) {
      const slot = this._roundAt[i];
      if (slot > 0 && this.roundabouts[slot - 1]) {
        return { kind: 'roundabout', obj: this.roundabouts[slot - 1] };
      }
    }
    return null;
  }

  removeMotorway(m) {
    const k = this.motorways.indexOf(m);
    if (k < 0) return false;
    this.motorways.splice(k, 1);
    this._releaseSpanFlag(this.motorways, m.ax, m.ay, F_PEG);
    this._releaseSpanFlag(this.motorways, m.bx, m.by, F_PEG);
    this.version++;
    return true;
  }

  removeBridge(b) {
    const k = this.bridges.indexOf(b);
    if (k < 0) return false;
    this.bridges.splice(k, 1);
    this._releaseSpanFlag(this.bridges, b.ax, b.ay, F_BRIDGE_END);
    this._releaseSpanFlag(this.bridges, b.bx, b.by, F_BRIDGE_END);
    this.version++;
    return true;
  }

  removeLight(l) {
    const k = this.lights.indexOf(l);
    if (k < 0) return false;
    this.lights.splice(k, 1);
    // A light is 1x1 and canAddLight refuses a tile that already has one, so the
    // flag cannot be shared.
    this.flags[l.y * this.maxCols + l.x] &= ~F_LIGHT;
    this.version++;
    return true;
  }

  removeRoundabout(r) {
    const list = this.roundabouts;
    const k = list.indexOf(r);
    if (k < 0) return false;
    const cols = this.maxCols;
    // roundabouts may not overlap, so all nine tiles are ours to clear
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = (r.cy + dy) * cols + (r.cx + dx);
        this.flags[i] &= ~F_ROUND;
        this._roundAt[i] = 0;
      }
    }
    list.splice(k, 1);
    // `_roundAt` holds index+1, so everything after the hole has shifted down.
    for (let s = k; s < list.length; s++) {
      const q = list[s];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) this._roundAt[(q.cy + dy) * cols + (q.cx + dx)] = s + 1;
      }
    }
    this.version++;
    return true;
  }

  // =========================================================================
  // graph queries for traffic — HOT PATH, allocate nothing
  // =========================================================================

  _poolFor(out) {
    let p = this._pools.get(out);
    if (p === undefined) { p = []; this._pools.set(out, p); }
    return p;
  }

  _emit(out, pool, n, nx, ny, dir, len, kind, ghost) {
    let o = pool[n];
    if (o === undefined) {
      o = { nx: 0, ny: 0, dir: 0, len: 0, kind: 'road', ghost: false };
      pool[n] = o;
    }
    o.nx = nx; o.ny = ny; o.dir = dir; o.len = len; o.kind = kind; o.ghost = ghost;
    out[n] = o;
    return n + 1;
  }

  /**
   * Fill `out` with every traversable link leaving (x,y):
   *   { nx, ny, dir, len, kind, ghost }
   *   kind 'road'     — a grid edge; len = DIR_LEN[dir]. Ghost edges ARE returned
   *                     (committed cars may finish them) with ghost:true, so
   *                     traffic must never route a NEW path over one.
   *   kind 'motorway' — airspace between this tile and the other peg; len is the
   *                     Euclidean tile distance between the pegs.
   *   kind 'bridge'   — the span; len is the Euclidean length (steps * DIR_LEN).
   *   kind 'drive'    — between one of a building's GATE tiles and its door tile
   *                     (both directions); len 1. A house has none: its gate and
   *                     its door are the same tile.
   *
   * `out.length` is set to the link count. Zero allocation after warm-up: the
   * link objects come from a pool keyed off `out`, so reusing one scratch array
   * per Dijkstra makes this garbage-free.
   * @returns {number} the link count (same as out.length)
   */
  linksFrom(x, y, out) {
    const pool = this._poolFor(out);
    let n = 0;
    if (!this.inBounds(x, y)) { out.length = 0; return 0; }
    const cols = this.maxCols;
    const i = y * cols + x;
    const f = this.flags[i];

    // ---- roundabout: the ring is a road the player never has to draw ----
    // A roundabout only earns its keep if it actually circulates, so the 8 ring
    // tiles are wired into a one-way cycle here rather than requiring the player
    // to trace a circle by hand. The centre is an ISLAND: it emits nothing and
    // nothing emits into it, which is what stops cars driving over the painted
    // middle. Road the player had already drawn under the island survives in the
    // mask untouched — it is merely ignored — so removing the roundabout hands
    // the original crossroads straight back.
    const ring = (f & F_ROUND) !== 0;
    let flow = -1;
    if (ring) {
      flow = this.roundaboutFlowDir(x, y);
      if (flow < 0) { out.length = 0; return 0; }        // standing on the island
    }

    const mask = this.edges[i];
    if (mask !== 0) {
      const gm = this.ghosts[i];
      for (let d = 0; d < 8; d++) {
        const bit = 1 << d;
        if ((mask & bit) === 0) continue;
        const nx = x + DX[d], ny = y + DY[d];
        // only a roundabout tile can be adjacent to that roundabout's centre
        if (ring && this.isRoundCentre(nx, ny)) continue;
        n = this._emit(out, pool, n, nx, ny, d, DIR_LEN[d], 'road', (gm & bit) !== 0);
      }
    }
    if (flow >= 0) {
      // Emit the ring hop unless a LIVE edge already carries it (a ghost does not
      // count — a new traversal may not use one, and the ring must never break).
      const rb = 1 << flow;
      if ((mask & rb) === 0 || (this.ghosts[i] & rb) !== 0) {
        n = this._emit(out, pool, n, x + DX[flow], y + DY[flow], flow, DIR_LEN[flow], 'road', false);
      }
    }

    if (f !== 0) {
      if ((f & F_PEG) !== 0) {
        const list = this.motorways;
        for (let k = 0; k < list.length; k++) {
          const m = list[k];
          let ox = -1, oy = -1;
          if (m.ax === x && m.ay === y) { ox = m.bx; oy = m.by; }
          else if (m.bx === x && m.by === y) { ox = m.ax; oy = m.ay; }
          if (ox < 0) continue;
          const ddx = ox - x, ddy = oy - y;
          n = this._emit(out, pool, n, ox, oy, dirOf(Math.sign(ddx), Math.sign(ddy)),
            Math.sqrt(ddx * ddx + ddy * ddy), 'motorway', false);
        }
      }
      if ((f & F_BRIDGE_END) !== 0) {
        const list = this.bridges;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          let ox = -1, oy = -1, dir = -1;
          if (b.ax === x && b.ay === y) { ox = b.bx; oy = b.by; dir = b.dir; }
          else if (b.bx === x && b.by === y) { ox = b.ax; oy = b.ay; dir = OPP[b.dir]; }
          if (ox < 0) continue;
          n = this._emit(out, pool, n, ox, oy, dir, b.len * DIR_LEN[b.dir], 'bridge', false);
        }
      }
      // The office's internal lane. A CONNECTION POINT (F_GATE without F_BUILD) and
      // a DRIVEWAY tile (F_DRIVE) wire to their orthogonal neighbours belonging to
      // the same office — so the lane is single file, cannot be cut across
      // diagonally, and runs C -> driveway -> ... -> driveway -> C. Nothing else
      // under a footprint is wired at all, and a house needs no wiring: its one
      // tile is gate and door both, so its road edges are the whole story.
      const isConn = (f & F_GATE) !== 0 && (f & F_BUILD) === 0;
      if (isConn || (f & F_DRIVE) !== 0) {
        const owner = this._buildAt[i];
        if (owner !== 0) {
          for (let d = 0; d < 8; d += 2) {          // orthogonal dirs only
            const nx = x + DX[d], ny = y + DY[d];
            if (!this.inBounds(nx, ny)) continue;
            const j = ny * this.maxCols + nx;
            if (this._buildAt[j] !== owner) continue;
            const nf = this.flags[j];
            const nDrive = (nf & F_DRIVE) !== 0;
            // C to C direct would tunnel through the building; one end must be lane
            if (!nDrive && (f & F_DRIVE) === 0) continue;
            if (!nDrive && (nf & F_GATE) === 0) continue;
            n = this._emit(out, pool, n, nx, ny, d, DRIVE_LEN, 'drive', false);
          }
        }
      }
    }

    out.length = n;
    return n;
  }

  /** More than 2 LIVE edges touch this tile. Ghosts do not count. */
  isIntersection(x, y) {
    if (!this.inBounds(x, y)) return false;
    return this._deg[y * this.maxCols + x] > 2;
  }

  /** Live edge degree of a tile — cheap input for traffic's turn/penalty maths. */
  degree(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this._deg[y * this.maxCols + x];
  }

  /** F_* bits for a tile (0 outside bounds) — one load instead of six queries. */
  tileFlags(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.flags[y * this.maxCols + x];
  }

  hasLight(x, y) {
    if (!this.inBounds(x, y)) return false;
    return (this.flags[y * this.maxCols + x] & F_LIGHT) !== 0;
  }

  inRoundabout(x, y) {
    if (!this.inBounds(x, y)) return false;
    return (this.flags[y * this.maxCols + x] & F_ROUND) !== 0;
  }

  /**
   * Is this the ISLAND at the middle of a roundabout? Nothing drives over it and
   * nothing may terminate on it. A round tile with no flow dir is the centre by
   * definition, so this is a flag test plus one lookup.
   */
  isRoundCentre(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.maxCols + x;
    if ((this.flags[i] & F_ROUND) === 0) return false;
    return this.roundaboutFlowDir(x, y) < 0;
  }

  /** One-way circulation dir for a roundabout ring tile, else -1. */
  roundaboutFlowDir(x, y) {
    if (!this.inBounds(x, y)) return -1;
    const i = y * this.maxCols + x;
    const slot = this._roundAt[i];
    if (slot === 0) return -1;
    const r = this.roundabouts[slot - 1];
    if (!r) return -1;
    const dx = x - r.cx, dy = y - r.cy;
    if (dx < -1 || dx > 1 || dy < -1 || dy > 1) return -1;
    return ROUND_FLOW[(dy + 1) * 3 + (dx + 1)];
  }

  // =========================================================================
  // debug / test helper
  // =========================================================================

  /**
   * Verify the invariants this module promises. Returns an array of problem
   * strings — empty means healthy. Cheap enough for a dev overlay, not called
   * from the game loop.
   */
  audit() {
    const bad = [];
    const cols = this.maxCols, rows = this.maxRows;
    let live = 0, ghosts = 0, gateFlags = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const m = this.edges[i], g = this.ghosts[i];
        if ((g & ~m) !== 0) bad.push('ghost bit without edge bit at ' + x + ',' + y);
        let deg = 0;
        for (let d = 0; d < 8; d++) {
          const bit = 1 << d;
          if ((m & bit) === 0) continue;
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
            bad.push('edge leaves the grid at ' + x + ',' + y + ' dir ' + d);
            continue;
          }
          const j = ny * cols + nx;
          const obit = 1 << OPP[d];
          if ((this.edges[j] & obit) === 0) {
            bad.push('ASYMMETRIC edge ' + x + ',' + y + ' dir ' + d);
          }
          if (((g & bit) !== 0) !== ((this.ghosts[j] & obit) !== 0)) {
            bad.push('ASYMMETRIC ghost ' + x + ',' + y + ' dir ' + d);
          }
          if ((g & bit) === 0) deg++;
          // exactly one of {d, OPP[d]} is < 4, so this counts each undirected
          // edge exactly once
          if (d < 4) { if ((g & bit) === 0) live++; else ghosts++; }
        }
        if (deg !== this._deg[i]) {
          bad.push('degree desync at ' + x + ',' + y + ' (' + this._deg[i] + ' vs ' + deg + ')');
        }
        // roads live on empty land, or terminate on a gate tile of a footprint
        if (m !== 0 && this.tiles[i] !== T_EMPTY && (this.flags[i] & F_GATE) === 0) {
          bad.push('edge on non-empty non-gate tile at ' + x + ',' + y);
        }
        const fl = this.flags[i];
        if ((fl & F_GATE) !== 0) {
          gateFlags++;
          // a house's own tile, or an office's connection point — which is open
          // land OUTSIDE the footprint, so it must NOT carry F_BUILD
          const isHouse = this.tiles[i] === T_HOUSE;
          if (isHouse !== ((fl & F_BUILD) !== 0)) {
            bad.push('gate/footprint mismatch at ' + x + ',' + y);
          }
          if (!isHouse && this.tiles[i] !== T_EMPTY) {
            bad.push('connection point is not open land at ' + x + ',' + y);
          }
          if (this._buildAt[i] === 0) bad.push('gate owns no building at ' + x + ',' + y);
        }
        if ((fl & F_DRIVE) !== 0) {
          if ((fl & F_BUILD) === 0) bad.push('driveway outside a footprint at ' + x + ',' + y);
          if ((fl & F_GATE) !== 0) bad.push('driveway doubling as a gate at ' + x + ',' + y);
          if (this.tiles[i] !== T_DEST) bad.push('driveway tile is not a dest at ' + x + ',' + y);
        }
      }
    }
    if (live !== this._liveEdges) {
      bad.push('live edge count desync (' + this._liveEdges + ' vs ' + live + ')');
    }
    if (ghosts !== this._ghostList.length) {
      bad.push('ghost list desync (' + this._ghostList.length + ' vs ' + ghosts + ')');
    }
    // no diagonal scissors
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const a = (this.liveMask(x, y) & (1 << 3)) !== 0;          // (x,y)->(x+1,y+1)
        const b = (this.liveMask(x + 1, y) & (1 << 5)) !== 0;      // (x+1,y)->(x,y+1)
        if (a && b) bad.push('scissored diagonals in block ' + x + ',' + y);
      }
    }
    // every dest footprint tile resolves to the dest
    for (let k = 0; k < this.dests.length; k++) {
      const d = this.dests[k];
      // every tile of a complex resolves to its PRIMARY part, so a double office's
      // two colours never disagree about who owns the driveway they share
      for (let yy = d.y; yy < d.y + d.h; yy++) {
        for (let xx = d.x; xx < d.x + d.w; xx++) {
          if (this.buildingAt(xx, yy) !== d.complex) bad.push('dest ' + d.id + ' unresolved at ' + xx + ',' + yy);
          if (this.tileAt(xx, yy) !== T_DEST) bad.push('dest ' + d.id + ' tile wrong at ' + xx + ',' + yy);
        }
      }
    }
    for (let k = 0; k < this.houses.length; k++) {
      const h = this.houses[k];
      if (this.buildingAt(h.x, h.y) !== h) bad.push('house ' + h.id + ' unresolved');
      if (this.tileAt(h.x, h.y) !== T_HOUSE) bad.push('house ' + h.id + ' tile wrong');
    }

    // --- connection point / driveway / door invariants (v2.7 connection model) ---
    let gateTotal = 0;
    for (let k = 0; k < this.houses.length; k++) {
      const h = this.houses[k];
      gateTotal++;
      if (!h.gates || h.gates.length !== 1) { bad.push('house ' + h.id + ' wants exactly one gate'); continue; }
      if (h.gates[0].x !== h.x || h.gates[0].y !== h.y) bad.push('house ' + h.id + ' gate is not its own tile');
      if (h.doorX !== h.x || h.doorY !== h.y) bad.push('house ' + h.id + ' door is not its own tile');
      if ((this.tileFlags(h.x, h.y) & F_GATE) === 0) bad.push('house ' + h.id + ' lacks F_GATE');
    }
    for (let k = 0; k < this.dests.length; k++) {
      const d = this.dests[k];
      const v = officeVariant(d.variant);
      if (!v) { bad.push('dest ' + d.id + ' has no known variant (' + d.variant + ')'); continue; }
      if (d.w !== v.w || d.h !== v.h) bad.push('dest ' + d.id + ' footprint disagrees with variant ' + v.id);
      if (!d.complex || d.complex.parts.indexOf(d) < 0) bad.push('dest ' + d.id + ' is not in its own complex');
      if (d.parts.length !== v.halves.length) bad.push('dest ' + d.id + ' wants ' + v.halves.length + ' parts, has ' + d.parts.length);
      if (!!d.isHalf !== !!v.dbl) bad.push('dest ' + d.id + ' isHalf disagrees with variant ' + v.id);

      // the door is a driveway tile of THIS office
      if (!this.isDriveway(d.doorX, d.doorY)) bad.push('door of ' + d.id + ' is not a driveway tile');
      if (this.buildingAt(d.doorX, d.doorY) !== d.complex) bad.push('door of ' + d.id + ' belongs to another office');

      // shared geometry is literally shared, not copied per part
      if (d.gates !== d.conns) bad.push('dest ' + d.id + ' gates/conns alias broken');
      if (d.complex !== d && (d.conns !== d.complex.conns || d.drive !== d.complex.drive)) {
        bad.push('dest ' + d.id + ' does not share its complex geometry');
      }
      if (d.complex !== d) continue;        // count and check the shared parts once

      if (d.drive.length !== v.drive.length) bad.push('office ' + d.id + ' driveway length wrong');
      for (let g = 0; g < d.drive.length; g++) {
        const t = d.drive[g];
        if (!this.isDriveway(t.x, t.y)) bad.push('office ' + d.id + ' driveway tile lacks F_DRIVE');
        if (this.buildingAt(t.x, t.y) !== d) bad.push('office ' + d.id + ' driveway tile is not its own');
      }
      if (d.conns.length !== v.conns.length) bad.push('office ' + d.id + ' connection point count wrong');
      gateTotal += d.conns.length;
      for (let g = 0; g < d.conns.length; g++) {
        const c = d.conns[g];
        if ((this.tileFlags(c.x, c.y) & F_GATE) === 0) bad.push('connection point of ' + d.id + ' lacks F_GATE');
        if ((this.tileFlags(c.x, c.y) & F_BUILD) !== 0) bad.push('connection point of ' + d.id + ' is inside the footprint');
        if (this.buildingAt(c.x, c.y) !== d) bad.push('connection point of ' + d.id + ' is not owned by it');
        // it has to actually reach the lane, orthogonally, or the office is an island
        let touch = 0;
        for (let dd = 0; dd < 8; dd += 2) {
          const nx = c.x + DX[dd], ny = c.y + DY[dd];
          if (this.isDriveway(nx, ny) && this.buildingAt(nx, ny) === d) touch++;
        }
        if (touch !== 1) bad.push('connection point of ' + d.id + ' touches ' + touch + ' driveway tiles, wants 1');
      }
    }
    if (gateTotal !== gateFlags) {
      bad.push('F_GATE count desync (' + gateFlags + ' flagged vs ' + gateTotal + ' listed)');
    }

    // --- infrastructure flags must agree with the lists (removal maintains both) ---
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, f = this.flags[i];
        if ((f & F_PEG) !== 0 && this._spanIndexAt(this.motorways, x, y) < 0) {
          bad.push('orphan F_PEG at ' + x + ',' + y);
        }
        if ((f & F_BRIDGE_END) !== 0 && this._spanIndexAt(this.bridges, x, y) < 0) {
          bad.push('orphan F_BRIDGE_END at ' + x + ',' + y);
        }
        if ((f & F_LIGHT) !== 0) {
          let found = false;
          for (let k = 0; k < this.lights.length; k++) {
            if (this.lights[k].x === x && this.lights[k].y === y) { found = true; break; }
          }
          if (!found) bad.push('orphan F_LIGHT at ' + x + ',' + y);
        }
        const slot = this._roundAt[i];
        if (((f & F_ROUND) !== 0) !== (slot > 0)) {
          bad.push('F_ROUND / _roundAt disagree at ' + x + ',' + y);
        }
        if (slot > 0) {
          const r = this.roundabouts[slot - 1];
          if (!r || Math.abs(r.cx - x) > 1 || Math.abs(r.cy - y) > 1) {
            bad.push('_roundAt at ' + x + ',' + y + ' points at the wrong roundabout');
          }
        }
      }
    }
    for (let k = 0; k < this.motorways.length; k++) {
      const m = this.motorways[k];
      if ((this.tileFlags(m.ax, m.ay) & F_PEG) === 0 ||
        (this.tileFlags(m.bx, m.by) & F_PEG) === 0) bad.push('motorway ' + m.id + ' lost a peg flag');
    }
    for (let k = 0; k < this.bridges.length; k++) {
      const b = this.bridges[k];
      if ((this.tileFlags(b.ax, b.ay) & F_BRIDGE_END) === 0 ||
        (this.tileFlags(b.bx, b.by) & F_BRIDGE_END) === 0) bad.push('bridge ' + b.id + ' lost a mouth flag');
    }
    for (let k = 0; k < this.lights.length; k++) {
      const l = this.lights[k];
      if ((this.tileFlags(l.x, l.y) & F_LIGHT) === 0) bad.push('light ' + l.id + ' lost its flag');
    }
    // Every roundabout must circulate: following the flow from any ring tile has
    // to walk all 8 of them and come back. A broken ring is a car trap.
    const rl = new Array(1);
    for (let k = 0; k < this.roundabouts.length; k++) {
      const r = this.roundabouts[k];
      if (!r) continue;
      let x = r.cx, y = r.cy - 1, hops = 0, ok = true;
      for (; hops < 8; hops++) {
        const d = this.roundaboutFlowDir(x, y);
        if (d < 0) { ok = false; break; }
        // the flow hop must actually be offered as a link
        let has = false;
        this.linksFrom(x, y, rl);
        for (let q = 0; q < rl.length; q++) {
          if (rl[q].nx === x + DX[d] && rl[q].ny === y + DY[d] && !rl[q].ghost) { has = true; break; }
        }
        if (!has) { ok = false; break; }
        x += DX[d]; y += DY[d];
        if (this._roundAt[y * cols + x] !== k + 1) { ok = false; break; }
      }
      if (!ok || x !== r.cx || y !== r.cy - 1) bad.push('roundabout ' + r.id + ' ring does not circulate');
      if (!this.isRoundCentre(r.cx, r.cy)) bad.push('roundabout ' + r.id + ' has no island');
      if (this.linksFrom(r.cx, r.cy, rl) !== 0) bad.push('roundabout ' + r.id + ' island is drivable');
    }
    return bad;
  }
}

function startOr(v, dflt) {
  return Number.isFinite(v) && v > 0 ? (v | 0) : dflt;
}
