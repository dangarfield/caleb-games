/**
 * traffic.js — the car simulation for Roadways.
 *
 * Cars live at HOUSES and serve DESTINATIONS. A car sitting idle at its house
 * asks the demand broker for a matching-colour pin (`claim`), drives to that
 * destination, hands the pin in (`collect` — that is the score), and drives
 * home again. Colour classes are absolute: a red car only ever serves red.
 *
 * The whole point of the module is FRICTION. Roads are cheap, throughput is
 * not:
 *   - edge weight is len / speedFactor, so a √2 diagonal spends one road tile
 *     but 41% more time — the classic Mini Motorways trade;
 *   - a plain intersection is CONFLICT-LOCKED but costs a car that is cleared
 *     through it NOTHING: a car may cross at the same time as another only if
 *     their two paths through the junction do not cross, and if it is let through
 *     it goes at full speed. Opposing through-traffic on complementary sides
 *     flows freely; a turn that cuts across someone else's lane waits for them to
 *     clear. Waiting is the whole cost of a junction — there is no blanket
 *     slowdown for arriving at one;
 *   - a car SEES the junction coming: it brakes on the approach to the speed it
 *     will be allowed once across (a corner, not the junction itself), and brakes
 *     to a stop just short of the node when the crossing is blocked, so it
 *     arrives slow and queues instead of slamming to a halt on the tile centre;
 *   - a roundabout skips the conflict lock entirely (one-way ring) for a small
 *     velocity cost, which is exactly why it beats gridlock;
 *   - a traffic light lets one whole axis through and makes the other wait,
 *     alternating on directional pressure. Green still respects the conflict
 *     lock, so an unprotected turn across the oncoming lane gives way;
 *   - turning costs velocity in proportion to the turn angle;
 *   - edges are FIFO queues with a minimum gap and no overtaking, so a full
 *     edge blocks entry and queues back up through junctions. A queue that
 *     backs across several junctions is a gridlock cascade: emergent failure,
 *     not a bug. `gridlock` (0..1) is the HUD's window onto it.
 *
 * PERFORMANCE CONTRACT (the kids play on a low-powered tablet):
 *   - zero steady-state allocation in update(): cars are pooled, paths live in
 *     per-car Int32Arrays, Dijkstra uses stamped scratch typed arrays and an
 *     integer binary heap, edge occupancy is a flat Int32Array;
 *   - no per-frame sort anywhere;
 *   - pathfinding is amortised: a car only ever re-paths AT A NODE, never
 *     mid-edge, and only when it needs a new target, its next link has gone,
 *     or world.version moved and a small per-frame path budget allows it.
 *
 * BUILDINGS ARE ENTERED THROUGH A CONNECTION POINT AND A DRIVEWAY. A house is
 * still trivial: its one tile is gate and door both, and roads join it directly
 * from any of the 8 directions. An office is joined ONLY at a connection point —
 * a tile OUTSIDE its footprint (F_GATE, no F_BUILD, so as far as roads are
 * concerned it is open land) — and net.js wires that point down the office's
 * DRIVEWAY (F_DRIVE) with short kind:'drive' links to the parking bay that is
 * this colour's door. Routing rules:
 *   - a driveway tile is PUBLIC: any car may drive through it, calling here or
 *     not, so a double office's two-ended driveway is a real short cut;
 *   - every other footprint tile is a hard dead end, so no car ever cuts a
 *     corner through the building proper;
 *   - a two-ended office needs no multi-target search: the bay is the one target
 *     node and both connection points reach it along the lane, so a plain
 *     Dijkstra picks whichever end is actually cheaper/connected;
 *   - a drive hop is a car park, not a public junction, so it is exempt from the
 *     intersection/light/turn friction — but it is slow (KIND_SPEED).
 *
 * ERASED ROADS (ghosts). Every car REMEMBERS THE ROADS IT DROVE on its way out —
 * car.trail, a stack of undirected edge slots pushed as it goes and popped as it
 * retraces. An edge the player erases is flagged deleted at once (refunded, drawn
 * as a ghost, unroutable for everybody else) but it does not leave the graph while
 * a car still remembers it: it is that car's way home, and taking it away mid-trip
 * is exactly how cars used to end up stranded. So a ghost is passable for a car
 * that holds it in its trail and for nobody else, and it dies the moment the last
 * car that drove it has driven back along it (or has got home some other way, or
 * has been retired). Guaranteeing the trip ends is what bounds a ghost's life:
 * GHOST_GIVEUP lifts a car wedged mid-hop on one, LOST_GIVEUP lifts a car that
 * can no longer path home at all, and both clear the trail on the way.
 *
 * DOM-free. No window/document/canvas/audio/localStorage. Reads the World and
 * calls exactly one mutator on it: releaseGhost().
 */

import {
  DX, DY, DIR_LEN, OPP, F_BUILD, F_GATE, F_DRIVE,
  BAY_IN, BAY_MID, BAY_OUT
} from './net.js';

/* ============================ tuning ============================ */

const MAX_DT = 1 / 20;          // clamp: never integrate more than 50ms at once
const MAX_PATH = 128;           // nodes per path; longer routes are treated as none
const MAX_CARS = 260;           // hard fleet ceiling (sim has its own, lower one)
// Hops a car remembers as its way home (see car.trail). A round trip is normally
// well under this; a car that overruns it drops its OLDEST hop, so the roads it
// keeps alive are always the most recent ones — the ones it needs first.
const MAX_TRAIL = 96;

const GAP = 0.5;                // min centre-to-centre spacing along an edge (tiles)
const LANE = 0.16;              // lateral offset so opposing traffic doesn't overlap
const CROSS_CLEAR = 0.34;       // how far into the new link before a junction unlocks

const ACCEL = 4.0;              // tiles/s²
const BRAKE = 9.0;              // tiles/s²  emergency stop (queue, lost link)
const SOFT_BRAKE = 3.4;         // tiles/s²  the anticipated slow-down for a junction
const TURN_EASE = 11.0;         // heading lerp rate
/* How far either side of a node the corner is rounded, in tiles (see _lanePose).
 * Traffic drives LANE (0.16) to the right of the centre line, so the lane line the
 * car is on and the one it turns onto are two different lines and the node is where
 * they cross. Snapping from one to the other there made a car visibly step sideways
 * as it turned — the "snap on the inside corner". Instead both lines are extended
 * past the node and blended over this window, which puts the car on an arc through
 * the junction. 0.40 is about a car and a half of turning room, and is capped at
 * 0.45 of a link's length at each end so two corners can never overlap. */
const CORNER = 0.40;
/* The same idea for a car that is pulling AWAY from a standstill instead of turning
 * through a junction: parked at a house gate, or backed out of a lot space, it is
 * sitting off the lane line (up to 0.4 of a tile off it, and pointed elsewhere), so
 * putting it straight onto the line teleported it across the road — the same visible
 * snap, from the other cause. Its actual pose is blended into the lane line over this
 * much arc instead, so it merges out. Also capped to 0.45 of the link. */
const MERGE = 0.55;

// ---- approach behaviour: a car plans its deceleration against the FAR node of
// the link it is on, so it arrives at a junction already slow.
// Hold this far short of the node CENTRE. A car sprite is 0.46 tiles long and
// 0.30 wide, so anything less parks the waiting car on top of the traffic it is
// giving way to. This is the give-way line, and it costs a little throughput to
// pull away from — which is the point.
const STOP_LINE = 0.42;
const YIELD_LOOK = 1.35;        // tiles from the node before the yield check runs
// The approach check is a PREDICTION off cached data, and only the node itself
// can re-path a car. So once a car has been held long enough to look genuinely
// wedged rather than merely waiting its turn, stop trusting the prediction and
// let it creep onto the node, where the authoritative gate and the re-path valve
// both live. Anything shorter just parks waiting cars on top of the traffic they
// are giving way to. Mirrors STUCK_REPATH, which is declared further down.
const YIELD_HOLD = 9.0;
const JCAP = 4;                 // concurrent non-conflicting crossings per junction
// The last hop of a route ends ON the target node — your own door, or the shop's.
// So it is not a give-way and STOP_LINE must not apply: a car braking to exactly
// zero at the give-way line would halt half a tile short of its own house and
// never arrive. Park at a crawl instead, and let _finish stop the car dead.
const ARRIVE_HOME = 0.16;       // × baseSpeed, rolling into your own driveway
const ARRIVE_DEST = 0.4;        // × baseSpeed, pausing at a destination

// speed multiplier per link kind, indexed by KIND_*
const K_ROAD = 0, K_MOTORWAY = 1, K_BRIDGE = 2, K_DRIVE = 3;
const KIND_SPEED = [1.0, 2.75, 1.0, 0.55];

// Dijkstra weights (seconds-ish, comparable with len / speedFactor)
const W_INTERSECTION = 0.20;    // plain junction: the expected give-way wait, nothing else
const W_LIGHT = 0.14;           // signalled junction: protected, so cheaper than a free-for-all
const W_ROUND = 0.06;           // roundabout: cheapest, that's the whole selling point
const W_TURN = 0.55;            // × turn fraction (0 straight … 1 u-turn)
const W_CONGEST = 0.42;         // × cars already on the edge — route around jams

// Velocity kept through a node. A junction costs a car that is CLEARED THROUGH IT
// nothing: what costs time at a junction is waiting for a conflict, and that is
// already priced by the give-way. So going straight over a crossroads with nobody
// in the way is full speed, and the only thing that slows a car down is the corner
// itself — a little at 45°, more at 90°, most at a u-turn.
const V_TURN = 0.6;             // × turn fraction (0.25 per 45°), subtracted from 1
const V_ROUND = 0.8;            // ring tiles are tight, so circulating costs a little
const V_FLOOR = 0.16;           // clamp: a car always keeps *some* speed at a node

const LIGHT_MIN_GREEN = 2.6;
const LIGHT_MAX_GREEN = 7.5;

// Waiting your turn at a junction is not being jammed. `stuck` drives the red
// jam halo and the gridlock HUD heat, so it only latches once a car has been
// unable to move for longer than any normal give-way would take.
const STUCK_SOFT = 1.25;
const STUCK_REPATH = 9.0;       // seconds jammed before trying a different route
const STUCK_ABORT = 26.0;       // seconds jammed before giving up on the delivery
// A car stuck MID-HOP on a road that has been erased cannot re-path (re-paths only
// happen at a node) and cannot reverse, so if the far node never clears it would sit
// on a deleted road forever, keeping the ghost drawn. Long enough that an ordinary
// queue on a just-erased edge drains normally; short enough that the player is not
// staring at a road they deleted half a minute ago.
const GHOST_GIVEUP = 14.0;
// Failed attempts to path home before a car that is STILL holding erased roads open
// is lifted home instead. Each attempt is ~1.2-2.2s apart, so this is ~10-20s of
// genuinely no route. Without it a car marooned by an erase could keep the road it
// remembers on screen for the rest of the run.
const LOST_GIVEUP = 8;

const PARK_NOSE = 0.24;         // how far a parked car noses out along its road
const PARK_SIDE = 0.17;         // lateral offset so two cars at one house don't stack

/* ---- the park manoeuvre at an office bay --------------------------------------
 * A car reaching its bay does not just stop on the lane: the bays are angled, so it
 * swings 45 degrees out of the lane, drives straight up into the marked space
 * against the building, waits, and reverses back down the same line onto the lane.
 * That is a real dwell in the sim, not a drawing trick — the car keeps its place on
 * the lane while it is in there, so parking genuinely costs the driveway a beat,
 * which is what makes a double office's through-route slow.
 *
 * The car TURNS in rather than sliding across: the path is a cubic Bezier whose end
 * tangents are exactly the lane heading and the space's 45 degree axis, so it pulls
 * away along the lane, swings, and settles square in the space — then reverses back
 * down the same curve. A straight line between the two poses (which is what this used
 * to be) has the car crabbing sideways out of the lane, because the space it parks in
 * is very nearly beside the tile it stops on: there is only 0.26 of a tile between the
 * lane pose and the space's middle, almost all of it sideways. The bow is what buys
 * the manoeuvre its room.
 *
 * BAY_IN / BAY_MID / BAY_OUT come from net.js, which also bakes the space's centre
 * and slant onto each part, so this pose and the markings `_drawBays` paints cannot
 * disagree. The markings run from depth BAY_IN (the edge of the lane's asphalt) out to
 * BAY_OUT (just short of the wall at 0.69) and a car turned 45 degrees is 0.54 deep
 * corner to corner, which does not fit in 0.41 of forecourt — so BAY_MID is set by the
 * WALL rather than by the middle of the space: at 0.42 the deepest corner lands on
 * 0.689, right against the wall, and the tail corner hangs 0.10 back over the lane,
 * which is exactly what an angled bay looks like (and the car holds its place on the
 * lane anyway while it is in there). */
const PARK_DUR = 1.1;           // seconds, whole manoeuvre
/* Fractions of the manoeuvre spent turning in and backing out — most of it, so the
 * swing runs at about road speed. At 0.3 each the car covered the curve in a third of
 * a second, peaking near twice its cruising speed: continuous, but it darted. */
const PARK_IN = 0.42;
const PARK_OUT = 0.42;
/* Bezier handle length, as a fraction of the straight-line distance into the space,
 * and its floor and ceiling in tiles. Kept SHORT on purpose. The space is very nearly
 * beside the tile the car stops on, so the net travel along the lane is about zero
 * while both ends of the curve point forward along it — which means the path has to
 * double back on itself somewhere, and the longer the handles the further it swings.
 * At 0.40 the car noses 0.06 of a tile forward and eases 0.14 back as it turns in
 * (measured over all 12 variants); at 0.62 that grew to 0.11 forward and 0.21 back,
 * which starts to read as a shunt rather than a turn. */
const PARK_BOW = 0.40;
const PARK_BOW_MIN = 0.10, PARK_BOW_MAX = 0.20;
/* Arriving home is the same manoeuvre one way only: the car swings off the lane into
 * its spot beside the house and stays there. Quicker than a lot space because it is a
 * shorter swing (about 0.24 of a tile) and because a car getting home should not hold
 * up the road behind it. Without it the car simply appeared in its spot, a quarter of
 * a tile sideways, in one frame. */
const HOME_PARK_DUR = 0.5;

function kindCode(k) {
  if (k === 'road') return K_ROAD;
  if (k === 'motorway') return K_MOTORWAY;
  if (k === 'bridge') return K_BRIDGE;
  return K_DRIVE;
}

// scratch out-params for _lanePose, which runs for every moving car every frame
let _fx = 0, _fy = 0, _fa = 0;

/** Lerp `a` towards `b` by `w`, the short way round the circle. */
function lerpAng(a, b, w) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * w;
}

/** 0 (straight) … 1 (u-turn) for a heading change between two of the 8 dirs. */
function turnFrac(a, b) {
  if (a < 0 || b < 0) return 0;
  let d = (b - a) & 7;
  if (d > 4) d = 8 - d;
  return d * 0.25;
}

/** Which of the two light phases a dir belongs to. 0 = N/NE side, 1 = E/SE side. */
function axisOf(dir) {
  return ((dir & 3) < 2) ? 0 : 1;
}

/* ------------------------- junction conflicts -------------------------
 * A crossing is a CHORD across the junction. The car comes in on side
 * `a = OPP[arrivalDir]` and leaves on side `b`. Traffic drives on the right
 * (see the LANE offset in _tryDepart: `right` is +2 in dir index), so the two
 * ends of that chord are not on the side centres — they are nudged to the
 * driver's right. Doubling the 8 sides into 16 slots captures that: the lane a
 * car ARRIVES on sits at 2a - 1, the lane it LEAVES on sits at 2b + 1.
 *
 * Two crossings conflict iff their chords properly cross, which for chords of a
 * circle is just "do the endpoints interleave". That single test gives the whole
 * rulebook for free: N->S and S->N are the same chord and never conflict (the
 * complementary sides of the road), two right turns hug opposite corners and
 * never conflict, and a left turn cuts the oncoming chord so it always waits.
 */

/** Is slot x strictly inside the arc from s1 clockwise to s2 (16 slots)? */
function insideArc(s1, s2, x) {
  const span = (s2 - s1) & 15, off = (x - s1) & 15;
  return off > 0 && off < span;
}

/**
 * Do crossings a1->b1 and a2->b2 (side indices 0..7) cross inside the node?
 * BOTH interleavings are required, which is what makes the answer symmetric: two
 * chords that merely SHARE an end (two cars merging into the same exit lane) pass
 * one test and fail the other. That case is not a lock conflict — the exit link's
 * FIFO already refuses the second car for lack of room at its entrance.
 */
function conflicts(a1, b1, a2, b2) {
  const p = (2 * a1 - 1) & 15, q = (2 * b1 + 1) & 15;
  const r = (2 * a2 - 1) & 15, s = (2 * b2 + 1) & 15;
  return insideArc(p, q, r) !== insideArc(p, q, s) &&
         insideArc(r, s, p) !== insideArc(r, s, q);
}

/* ============================ Traffic ============================ */

export class Traffic {
  constructor(world, opts) {
    const o = opts || {};
    this.world = world;
    this.difficulty = (o.difficulty === 'easy') ? 'easy' : 'normal';

    // easy: quicker cars, a bigger re-path budget, gentler junctions
    const easy = this.difficulty === 'easy';
    this.baseSpeed = easy ? 2.45 : 2.05;
    this.pathBudget = easy ? 4 : 3;
    this.junctionCost = easy ? 0.8 : 1.0;

    this.cols = world.maxCols | 0;
    this.rows = world.maxRows | 0;
    const N = this.cols * this.rows;
    this.nodeCount = N;

    /** @type {Array<object>} live cars — render.js iterates this every frame */
    this.cars = [];
    this.gridlock = 0;

    // ---- pools & scratch (never reallocated in steady state) ----
    this._pool = [];
    this._nextId = 1;

    // undirected road-edge occupancy: (node * 4 + dirBucket), dirBucket 0..3 = N,NE,E,SE
    this._edgeOcc = new Int32Array(N * 4);
    // Same addressing: how many cars REMEMBER this edge as part of their way home.
    // An erased edge stays a ghost while either array is non-zero on its slot.
    this._edgeHold = new Int32Array(N * 4);
    // ordered FIFO per DIRECTED link: Map<linkKey, car[]>  (front of queue first)
    this._q = new Map();
    // Plain-junction occupancy: up to JCAP crossings per node, kept as parallel
    // flat arrays so a claim is a short scan of integers and never allocates.
    // _jMove holds ((a << 3) | b) + 1 — 0 means the slot is free.
    this._jMove = new Int32Array(N * JCAP);
    this._jCar = new Int32Array(N * JCAP);

    // Dijkstra scratch — stamped so we never clear the whole arrays
    this._dist = new Float32Array(N);
    this._prev = new Int32Array(N);
    this._pdir = new Int8Array(N);
    this._seen = new Int32Array(N);
    this._done = new Int32Array(N);
    this._epoch = 0;
    this._heapNode = new Int32Array(Math.max(64, N * 2));
    this._heapCost = new Float32Array(Math.max(64, N * 2));
    this._heapN = 0;
    this._revBuf = new Int32Array(MAX_PATH);

    this._linksA = [];   // Dijkstra's link scratch (pool keyed off this array)
    this._linksB = [];   // movement's link scratch — kept separate on purpose
    this._rDir = -1; this._rKind = 0; this._rLen = 0;   // _resolveAt's out-params

    // traffic-light phases, keyed by light id and mirrored per node for lookup
    this._lightById = new Map();
    this._lightByNode = new Map();
    this._lightVersion = -1;

    this._version = world.version | 0;
    this._time = 0;

    // id -> building, rebuilt only when world.version moves, so the per-car
    // "does my house/destination still exist?" check is O(1) every frame
    this._houseMap = new Map();
    this._destMap = new Map();
    this._mapVersion = -1;

    // the last demand broker we were handed, so aborts during clearAll() can
    // still give their claims back (requirement #3 has no escape hatches)
    this._demand = null;

    // debug/verification counters (mutated in place, never reallocated)
    this.stats = {
      claims: 0, releases: 0, collects: 0,
      paths: 0, pathFails: 0, ghostsReleased: 0, lifted: 0,
      spawned: 0, removed: 0, blocked: 0, moving: 0
    };
  }

  /* ====================== public: fleet ====================== */

  /**
   * Add a car to `house`. Returns the car, or null if the house is already at
   * maxCars (2) or the fleet cannot grow.
   */
  spawnCar(house) {
    const h = house;
    if (!h) return null;
    if (this.cars.length >= MAX_CARS) return null;

    const max = (h.maxCars | 0) > 0 ? (h.maxCars | 0) : 2;
    // the real car list is the authority; h.cars is a mirror we keep truthful
    let have = 0;
    for (let i = 0; i < this.cars.length; i++) if (this.cars[i].homeId === h.id) have++;
    if (have >= max) return null;
    if ((h.cars | 0) >= max) return null;

    const dx = (h.doorX === undefined) ? (h.x | 0) : (h.doorX | 0);
    const dy = (h.doorY === undefined) ? (h.y | 0) : (h.doorY | 0);
    if (!this.world.inBounds(dx, dy)) return null;

    const car = this._alloc();
    car.id = this._nextId++;
    car.color = h.color | 0;
    car.homeId = h.id;
    car.destId = -1;
    car.claimed = false;
    car.state = 'idle';
    car.carrying = false;
    car.stuck = false;
    car.atHome = true;
    car.node = dy * this.cols + dx;
    car.slot = have;                       // so two cars at one house don't overlap
    car.wait = 0.15 + Math.random() * 0.5;
    car.stuckT = 0;
    car.vel = 0;
    car.angle = 0;
    this._parkAt(car, dx, dy);      // sets x/y/angle from a real road off the gate

    this.cars.push(car);
    h.cars = (h.cars | 0) + 1;
    if (h.cars > max) h.cars = max;
    this.stats.spawned++;
    return car;
  }

  /** Full reset: every claim handed back, every ghost settled, pools kept. */
  clearAll() {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      this._retire(this.cars[i], null, true);
    }
    this.cars.length = 0;
    this._edgeOcc.fill(0);
    this._edgeHold.fill(0);   // _retire cleared every trail; this is belt-and-braces
    this._jMove.fill(0);
    this._jCar.fill(0);
    // keep the queue arrays (they are pooled) but empty them
    const it = this._q.values();
    for (let e = it.next(); !e.done; e = it.next()) e.value.length = 0;
    this._lightById.clear();
    this._lightByNode.clear();
    this._lightVersion = -1;
    this.gridlock = 0;
    this._time = 0;
    const s = this.stats;
    s.claims = 0; s.releases = 0; s.collects = 0; s.paths = 0; s.pathFails = 0;
    s.ghostsReleased = 0; s.lifted = 0;
    s.spawned = 0; s.removed = 0; s.blocked = 0; s.moving = 0;
  }

  /**
   * Cars currently on the UNDIRECTED grid edge (x,y)->dir.
   * Direction-agnostic by construction: both addressings of an edge map to the
   * same slot.
   */
  carsOnEdge(x, y, dir) {
    const k = this._occKey(x | 0, y | 0, dir | 0);
    return k < 0 ? 0 : this._edgeOcc[k];
  }

  /**
   * How many cars would be hurt if this edge vanished RIGHT NOW: the ones driving
   * it plus the ones that remember it as their way home. This is net.js's
   * occupancyFn — a non-zero answer is what turns an erase into a ghost — and it
   * is the whole reason an erased road outlives the hop it was carrying.
   */
  edgeInUse(x, y, dir) {
    const k = this._occKey(x | 0, y | 0, dir | 0);
    return k < 0 ? 0 : this._edgeOcc[k] + this._edgeHold[k];
  }

  /* ====================== public: update ====================== */

  update(dt, demand) {
    let step = +dt;
    if (!(step > 0)) return;
    if (step > MAX_DT) step = MAX_DT;
    this._time += step;
    if (demand) this._demand = demand;

    const world = this.world;
    const versionMoved = (world.version | 0) !== this._version;
    if (versionMoved) this._version = world.version | 0;

    this._tickLights(step);

    let budget = this.pathBudget;
    let blocked = 0, moving = 0;
    const cars = this.cars;

    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];

      // a car whose house evaporated goes away (claim handed back first)
      if (versionMoved && !this._homeOf(car)) {
        this._retire(car, demand, true);
        cars[i] = cars[cars.length - 1];
        cars.pop();
        continue;
      }
      if (versionMoved) car.recheck = true;

      car.stuck = false;
      if (car.wait > 0) car.wait -= step;

      // Parked in a bay: it holds its place on the driveway (so parking really does
      // cost the lane a beat) but takes no decisions and runs no dynamics.
      if (car.parkT > 0) { this._parkStep(car, step); moving++; continue; }

      budget = this._think(car, demand, budget);
      budget = this._move(car, step, demand, budget);

      if (car.state !== 'idle') {
        moving++;
        if (car.stuck) blocked++;
      }
    }

    // gridlock: smoothed share of dispatched cars that are unable to move
    const inst = moving > 0 ? blocked / moving : 0;
    let g = this.gridlock + (inst - this.gridlock) * Math.min(1, step * 0.9);
    if (!(g >= 0)) g = 0; else if (g > 1) g = 1;
    this.gridlock = g;
    this.stats.blocked = blocked;
    this.stats.moving = moving;
  }

  /* ====================== decisions ====================== */

  /** Dispatch idle cars and repair broken plans. Returns the remaining budget. */
  _think(car, demand, budget) {
    // --- idle away from home: get back to the house ---
    if (car.state === 'idle' && !car.atHome) {
      if (car.wait > 0) return budget;
      if (budget <= 0) return budget;
      const h = this._homeOf(car);
      if (!h) return budget;
      const door = this._doorNode(h);
      if (car.node === door) {                 // already standing on it
        this._leaveLink(car);
        car.atHome = true;
        car.carrying = false;
        this._clearTrail(car);
        this._beginHomePark(car, door % this.cols, (door / this.cols) | 0);
        return budget;
      }
      if (this._path(car, door, h)) {
        car.state = 'toHome';
        car.stuckT = 0;
        car.lostTries = 0;
      } else if (this._stranded(car)) {
        // Nothing at all leaves this tile, so no amount of waiting will ever
        // produce a route: the road under the car stopped existing. A roundabout
        // dropped onto a crossroads does exactly this — its middle becomes an
        // island, and a car mid-hop into the centre lands on a node with no exits.
        // Lift it home rather than leaving it parked on the scenery forever.
        this._liftHome(car, demand);
      } else {
        // No route home right now — normally just wait, the player is mid-edit. But
        // a car that has kept trying this long and is STILL the only reason an
        // erased road is drawn has become the bug the player is complaining about,
        // so lift it and let those roads go.
        car.lostTries++;
        if (car.lostTries > LOST_GIVEUP && this._holdsGhost(car)) {
          this.stats.lifted++;
          this._liftHome(car, demand);
          return budget - 1;
        }
        this._offGhost(car);           // don't camp on a road that has been erased
        car.wait = 1.2 + Math.random();
      }
      return budget - 1;
    }

    // --- idle at home: ask for work ---
    if (car.state === 'idle') {
      if (car.wait > 0) return budget;
      if (budget <= 0) return budget;
      if (!demand || typeof demand.claim !== 'function') return budget;

      const id = demand.claim(car.color) | 0;
      if (id < 0) { car.wait = 0.35 + Math.random() * 0.45; return budget; }
      this.stats.claims++;

      const d = this._destById(id);
      if (!d) { this._giveBack(car, demand, id); car.wait = 0.6; return budget - 1; }

      car.destId = id;
      car.claimed = true;
      if (this._path(car, this._doorNode(d), d)) {
        car.state = 'toDest';
        car.carrying = false;
        car.atHome = false;
        car.stuckT = 0;
        return budget - 1;
      }
      // No route right now: hand the pin straight back so nothing leaks, and back
      // off properly. Claim-then-release thrash briefly inflates dest.claimed and
      // can starve a car that COULD have made the trip, so the retry is slow.
      this._release(car, demand);
      car.wait = 2.5 + Math.random() * 1.5;
      return budget - 1;
    }

    // --- en route: does the target still exist? ---
    if (car.recheck) {
      car.recheck = false;
      if (car.state === 'toDest') {
        const d = this._destById(car.destId);
        if (!d || this._doorNode(d) !== car.path[car.pathN - 1]) {
          this._release(car, demand);
          car.state = 'toHome';
          car.carrying = false;
          car.needPath = true;
        }
      } else if (car.state === 'toHome') {
        const h = this._homeOf(car);
        if (!h || this._doorNode(h) !== car.path[car.pathN - 1]) car.needPath = true;
      }
    }

    // A car wedged MID-HOP along a road the player erased is the one case the
    // re-path valves below cannot reach: re-paths only happen at a node, and the
    // node it is crawling towards is never going to clear (total deadlock, or the
    // rest of its route went with the erase). Left alone it keeps a deleted road
    // drawn on the map indefinitely — measured at 33 seconds. Lift it home.
    if (car.wedgeT > GHOST_GIVEUP && car.onLink && !car.atNode &&
        car.linkKind === K_ROAD) {
      const fx = car.linkFrom % this.cols, fy = (car.linkFrom / this.cols) | 0;
      if (this.world.isGhost(fx, fy, car.linkDir) && this._liftHome(car, demand)) {
        this.stats.lifted++;
        return budget;
      }
    }

    // --- jammed for a long time: try another route, then give up gracefully ---
    if (car.stuckT > STUCK_ABORT) {
      // a car wedged this long has no business holding an erased road open either
      this._offGhost(car);
      if (car.state === 'toDest') {
        this._release(car, demand);
        car.state = 'toHome';
        car.carrying = false;
      }
      car.needPath = true;
      car.stuckT = 0;
    } else if (car.stuckT > STUCK_REPATH && car.atNode) {
      car.needPath = true;
      car.stuckT = 0;
    }
    return budget;
  }

  /* ====================== movement ====================== */

  _move(car, dt, demand, budget) {
    if (car.state === 'idle') {
      car.vel = 0;
      return budget;
    }

    // a re-path is only ever taken AT A NODE, never mid-edge
    if (car.needPath && car.atNode) {
      if (budget <= 0) { this._stall(car, dt); return budget; }
      budget--;
      car.needPath = false;
      const tb = this._targetBuilding(car);
      const target = tb ? this._doorNode(tb) : -1;
      if (target < 0) { this._park(car, demand); return budget; }
      if (target === car.node) return this._finish(car, demand, budget);
      if (!this._path(car, target, tb)) { this._park(car, demand); return budget; }
    }

    // depart the node we are sitting at, if every gate is open
    if (car.atNode) {
      const ok = this._tryDepart(car, dt);
      if (!ok) {
        car.vel = Math.max(0, car.vel - BRAKE * dt);
        this._stall(car, dt);
        car.wedgeT += dt;
        this._pose(car, dt);
        return budget;
      }
    }

    if (car.linkLen <= 0) { this._pose(car, dt); return budget; }

    // ---- see the far node coming, and brake for it ----
    // Target the speed we will be ALLOWED across that node (a turn, a junction,
    // our own driveway), or zero if the crossing is currently blocked, and solve
    // v² = u² + 2as for the speed that still lets us get there smoothly.
    const remain = car.linkLen - car.s;
    let want = car.linkSpeed;
    let tgt = car.exitCap;
    let yielding = false;
    if (tgt < 0) tgt = want;
    if (remain < YIELD_LOOK && car.holdT < YIELD_HOLD) {
      // The plan was cached at link entry. If the player has edited the road since,
      // re-cut it before trusting it to hold a car still — this is the only place
      // a stale plan could ever matter, and it costs one lookahead per edit.
      if (car.planVer !== this._version) this._planApproach(car);
      if (this._mustYield(car)) { tgt = 0; yielding = true; car.holdT += dt; }
    }
    if (tgt < want) {
      // Only a GIVE-WAY stops short of the node. Braking for anything else — a
      // turn, a junction we are allowed through, our own driveway — aims at the
      // node itself, or the car would freeze a stop-line short of its target.
      const d = yielding ? remain - STOP_LINE : remain;
      const v = d <= 0 ? tgt : Math.sqrt(tgt * tgt + 2 * SOFT_BRAKE * d);
      if (v < want) want = v;
    }

    // ---- accelerate / brake ----
    if (car.vel < want) { car.vel += ACCEL * dt; if (car.vel > want) car.vel = want; }
    else if (car.vel > want) { car.vel -= BRAKE * dt; if (car.vel < want) car.vel = want; }

    let s = car.s + car.vel * dt;

    // ---- linear queueing: never pass the car ahead on this link ----
    const q = this._q.get(car.key);
    if (q !== undefined && q.length > 1) {
      const me = q.indexOf(car);
      if (me > 0) {
        const cap = q[me - 1].s - GAP;
        if (s > cap) {
          s = cap;
          if (s < car.s) s = car.s;            // never reverse
          if (car.vel > 0) car.vel *= 0.35;
        }
      }
    }

    if (s > car.linkLen) s = car.linkLen;
    if (s < car.s) s = car.s;

    const advanced = s - car.s;
    car.s = s;
    if (advanced < 1e-4) { this._stall(car, dt); car.wedgeT += dt; }
    else { car.stuckT = 0; car.wedgeT = 0; }

    // the junction mutex is handed back once we are clear of it
    if (car.lockNode >= 0 && s >= CROSS_CLEAR) this._unlock(car);

    if (s >= car.linkLen - 1e-6) {
      car.atNode = true;
      budget = this._arrive(car, demand, budget);
    }

    this._pose(car, dt);
    return budget;
  }

  /**
   * Reached the far node of the current link. NOTE: the car stays registered on
   * that link until it actually enters the next one, which is what makes queues
   * back up through junctions instead of cars stacking on a node.
   */
  _arrive(car, demand, budget) {
    car.pathI++;
    car.node = car.path[car.pathI];
    if (car.pathI < car.pathN - 1) return budget;   // more path to run
    return this._finish(car, demand, budget);
  }

  /** The car is standing on the last node of its route. Close the trip out. */
  _finish(car, demand, budget) {
    if (car.state === 'toDest') {
      const id = car.destId;
      const d = this._destById(id);
      if (car.claimed && demand && typeof demand.collect === 'function' && d) {
        demand.collect(id);
        this.stats.collects++;
      } else if (car.claimed) {
        // destination vanished between the last check and arrival — hand it back
        this._release(car, demand);
      }
      // Into the bay, before anything else: the pin is already collected (so the
      // demand side is untouched by this) but the car sits in the space for a beat
      // on its way to becoming a toHome car.
      this._beginPark(car, d);

      car.claimed = false;
      car.destId = -1;
      car.carrying = true;
      car.state = 'toHome';

      const h = this._homeOf(car);
      if (h && budget > 0 && this._path(car, this._doorNode(h), h)) {
        budget--;
      } else {
        car.needPath = true;
      }
      return budget;
    }

    // ---- home ----
    const h = this._homeOf(car);
    const door = h ? this._doorNode(h) : -1;
    if (car.node === door) {
      this._leaveLink(car);
      car.state = 'idle';
      car.atHome = true;
      car.carrying = false;
      car.vel = 0;
      car.wait = 0.25 + Math.random() * 0.5;
      // Home: the trip is over, so every road it was keeping alive can go.
      this._clearTrail(car);
      this._beginHomePark(car, car.node % this.cols, (car.node / this.cols) | 0);
      return budget;
    }
    // ended up somewhere that is not home (house moved / path truncated)
    this._leaveLink(car);
    car.state = 'idle';
    car.atHome = false;
    car.vel = 0;
    car.wait = 0.6 + Math.random() * 0.6;
    return budget;
  }

  /**
   * Try to leave the current node onto path[pathI+1]. Gates, in order:
   * link still legal → room at the far entrance → light phase → junction mutex.
   */
  _tryDepart(car, dt) {
    if (car.pathI >= car.pathN - 1) { car.needPath = true; return false; }

    const from = car.node;
    const to = car.path[car.pathI + 1];
    const fx = from % this.cols, fy = (from / this.cols) | 0;

    if (!this._resolve(car, fx, fy, to)) { car.needPath = true; return false; }

    const world = this.world;
    const dir = car.nDir, kind = car.nKind, len = car.nLen;
    const key = this._linkKey(from, dir, kind);

    // room at the entrance of the next link
    const q = this._q.get(key);
    if (q !== undefined && q.length > 0 && q[q.length - 1].s < GAP) return false;

    const round = world.inRoundabout(fx, fy) && world.roundaboutFlowDir(fx, fy) >= 0;
    const light = !round && world.hasLight(fx, fy);
    const plain = !round && !light && world.isIntersection(fx, fy);
    const motor = kind === K_MOTORWAY;
    // A drive hop is the car turning into its own destination, not crossing a
    // public junction: it never waits on the light, never takes the conflict
    // lock and never pays the velocity toll, even when the gate happens to be
    // a busy road corner. It still queues, so two cars can't share a driveway.
    const free = motor || kind === K_DRIVE;
    const frac = turnFrac(car.linkDir, dir);

    if (light && !free) {
      const st = this._lightByNode.get(from);
      if (st) {
        const mine = axisOf(car.linkDir >= 0 ? car.linkDir : dir);
        if (st.axis !== mine) {
          if (mine === 0) st.p0++; else st.p1++;
          return false;
        }
      }
    }

    // A green light protects opposing THROUGH traffic (N and S share a phase) but
    // not a turn across it, so a signalled junction still takes the conflict lock —
    // what the green buys you is not having to wait for the other axis at all.
    if ((plain || light) && !free) {
      // The side we came in on. A car that has just been spawned or re-pathed has
      // no arrival direction, so treat it as coming from the far side of its own
      // exit — the most conservative chord through the node.
      const a = OPP[car.linkDir >= 0 ? car.linkDir : dir];
      const slot = this._crossFree(from, a, dir, car.id);
      if (slot < 0) return false;
      this._claimCross(car, from, a, dir, slot);
    }

    /* Committed. Before any of the geometry is overwritten, keep the lane line we are
     * LEAVING: `_lanePose` blends it with the new one across the node so the car turns
     * through the corner instead of stepping sideways onto the new line.
     *
     * Only when the approach plan called this exact turn, because it is the plan that
     * drew the first half of the same corner (on the way in to this node) and the two
     * halves have to be built from the same pair of lines or they meet with a step.
     *
     * With no first half — the player edited the road mid-link, or this is the first hop
     * of a trip, or the car has just backed out of a lot space — the car is standing
     * somewhere that is NOT on the new lane line, so mode 2 blends from wherever it
     * actually is, along its actual heading, instead: it merges out rather than jumping
     * onto the line. The u-turn out of a driveway is the loud case, because there the
     * new line is a full 2*LANE across the road from the old one. */
    const turn = (car.onLink && car.linkLen > 0 && car.nnHave &&
      car.nnC > 0 && car.nnDir === dir);
    if (turn) {
      car.fillet = 1;
      car.pox = car.ox; car.poy = car.oy;
      car.pux = car.ux; car.puy = car.uy;
      car.pAng = car.tAngle;
      car.pC = car.nnC;
    } else {
      car.fillet = 2;
      car.pox = car.x - (fx + 0.5); car.poy = car.y - (fy + 0.5);
      car.pux = Math.cos(car.angle); car.puy = Math.sin(car.angle);
      car.pAng = car.angle;
      car.pC = Math.min(MERGE, (len > 0 ? len : 1) * 0.45);
      if (!(car.pox === car.pox) || !(car.poy === car.poy)) { car.fillet = 0; car.pC = 0; }
    }

    // swap edge registration atomically
    this._leaveLink(car);
    car.linkFrom = from;
    car.linkTo = to;
    car.linkDir = dir;
    car.linkKind = kind;
    car.linkLen = len > 0 ? len : 1;
    car.key = key;
    car.s = 0;
    car.atNode = false;

    // geometry, computed once per link
    const tx = to % this.cols, ty = (to / this.cols) | 0;
    car.ax = fx + 0.5; car.ay = fy + 0.5;
    car.bx = tx + 0.5; car.by = ty + 0.5;
    let vx = car.bx - car.ax, vy = car.by - car.ay;
    let h = Math.sqrt(vx * vx + vy * vy);
    if (!(h > 1e-6)) { vx = DX[dir]; vy = DY[dir]; h = Math.max(1e-6, Math.sqrt(vx * vx + vy * vy)); }
    car.ux = vx / h; car.uy = vy / h;   // unit forward, so the fillet can extend this
    car.ox = -car.uy * LANE;            // right-hand lane offset
    car.oy = car.ux * LANE;             // lane line = node + (ox,oy) + (ux,uy) * arc
    car.tAngle = Math.atan2(vy, vx);

    // ---- friction: the CORNER costs velocity; being at a junction does not ----
    // Straight on through a crossroads it was allowed into, a car keeps every bit
    // of its speed. `plain`/`light` still decide whether it may GO (above), but
    // they no longer scale how fast: a junction only ever costs a car time by
    // making it give way, and the give-way already prices that.
    let keep = 1;
    if (!free) {
      if (round) keep = V_ROUND;
      keep -= V_TURN * frac * this.junctionCost;
      if (keep < V_FLOOR) keep = V_FLOOR;
    }
    const cruise = this.baseSpeed * KIND_SPEED[kind];
    car.linkSpeed = cruise;
    const cap = cruise * keep;
    if (car.vel > cap) car.vel = cap;

    this._enterLink(car);
    // Look one node further ahead ONCE, here, so the per-frame approach check is
    // nothing but typed-array reads. Doing it per frame would mean a linksFrom
    // walk for every car on the map, every frame.
    car.holdT = 0;
    this._planApproach(car);
    return true;
  }

  /**
   * Work out, once per link entry, what waits at the FAR end of this link:
   *   - `exitCap`  the velocity the car will be allowed while crossing that node,
   *                so it can brake into it instead of being clamped after it;
   *   - `nnGate`/`nnA`/`nnB`/`nnKey` everything the per-frame yield check needs;
   *   - `nnDir` plus the next link's lane line (`nnOX/nnOY`, `nnUX/nnUY`, `nnAng`)
   *     and corner window `nnC`, so the car can START the turn before the node
   *     instead of snapping onto the new lane line when it gets there.
   * Cached data can go stale if the player edits the road mid-link. That is
   * harmless: this only shapes the APPROACH. The authoritative gate is still
   * _tryDepart at the node, which re-resolves from the live world.
   */
  _planApproach(car) {
    const world = this.world, cols = this.cols;
    const to = car.linkTo;
    const tx = to % cols, ty = (to / cols) | 0;
    car.nnGate = 0; car.nnKey = 0; car.nnHave = false; car.nnA = 0; car.nnB = 0;
    car.nnC = 0; car.nnDir = -1;
    car.planVer = this._version;

    // Last node of the route: the car is turning in somewhere. Coming home it
    // rolls in slower than it would pause at a shop — but never to a dead stop,
    // because the node it is braking for is the one it has to reach.
    const j = car.pathI + 2;
    if (j >= car.pathN) {
      car.exitCap = this.baseSpeed * (car.state === 'toHome' ? ARRIVE_HOME : ARRIVE_DEST);
      return;
    }
    if (!this._resolveAt(car, tx, ty, car.path[j])) {
      // no link there any more — it will re-path at the node, so arrive slow
      car.exitCap = this.baseSpeed * ARRIVE_DEST;
      return;
    }
    const nd = this._rDir, nk = this._rKind;
    const round = world.inRoundabout(tx, ty) && world.roundaboutFlowDir(tx, ty) >= 0;
    const light = !round && world.hasLight(tx, ty);
    const plain = !round && !light && world.isIntersection(tx, ty);
    const free = nk === K_MOTORWAY || nk === K_DRIVE;

    let keep = 1;
    if (!free) {
      if (round) keep = V_ROUND;
      keep -= V_TURN * turnFrac(car.linkDir, nd) * this.junctionCost;
      if (keep < V_FLOOR) keep = V_FLOOR;
    }
    car.exitCap = this.baseSpeed * KIND_SPEED[nk] * keep;

    car.nnHave = true;
    car.nnKey = this._linkKey(to, nd, nk);
    car.nnA = OPP[car.linkDir >= 0 ? car.linkDir : nd];
    car.nnB = nd;
    car.nnGate = free ? 0 : (plain ? 1 : (light ? 2 : 0));

    // the lane line of that next link, in the same form as this one's: it starts at
    // the node, offset to the driver's right, running along the unit direction
    const nn = car.path[j];
    let vx = (nn % cols) - tx, vy = ((nn / cols) | 0) - ty;
    let h = Math.sqrt(vx * vx + vy * vy);
    if (!(h > 1e-6)) { vx = DX[nd]; vy = DY[nd]; h = Math.max(1e-6, Math.sqrt(vx * vx + vy * vy)); }
    car.nnDir = nd;
    car.nnUX = vx / h; car.nnUY = vy / h;
    car.nnOX = -car.nnUY * LANE; car.nnOY = car.nnUX * LANE;
    car.nnAng = Math.atan2(vy, vx);
    // The corner is rounded over the same window on both sides of the node, and it may
    // not eat more than 0.45 of either link — a short link has two corners on it.
    const nl = this._rLen > 0 ? this._rLen : 1;
    const room = Math.min(car.linkLen, nl) * 0.45;
    car.nnC = Math.min(CORNER, room > 0 ? room : 0);
  }

  /**
   * Would the car be turned away if it reached the far node right now? Answering
   * this on the APPROACH is what makes a car slow down for an occupied junction
   * rather than sprinting to the tile centre and stopping dead.
   */
  _mustYield(car) {
    if (!car.nnHave) return false;
    // no room at the entrance of the next link — the queue is what backs up
    const q = this._q.get(car.nnKey);
    if (q !== undefined && q.length > 0 && q[q.length - 1].s < GAP) return true;
    const gate = car.nnGate;
    if (gate === 0) return false;
    if (gate === 2) {
      const st = this._lightByNode.get(car.linkTo);
      if (st && st.axis !== axisOf(car.linkDir >= 0 ? car.linkDir : car.nnB)) return true;
    }
    return this._crossFree(car.linkTo, car.nnA, car.nnB, car.id) < 0;
  }

  /**
   * Find the link from (fx,fy) that lands on node `to`, cheapest first.
   * Rejects ghost roads unless THIS car remembers driving the road, and enforces
   * roundabout one-way circulation. Copies the primitives out immediately —
   * net.js recycles the link objects on the next call with the same array.
   */
  _resolve(car, fx, fy, to) {
    if (!this._resolveAt(car, fx, fy, to)) return false;
    car.nDir = this._rDir; car.nKind = this._rKind; car.nLen = this._rLen;
    return true;
  }

  /**
   * The shared body of _resolve, writing to `_rDir`/`_rKind`/`_rLen` instead of a
   * car. The approach planner needs the SAME answer for the link after next, and
   * duplicating this logic is how the two would drift apart. `car` is only read to
   * decide whether an erased road is still open to it, and may be null.
   */
  _resolveAt(car, fx, fy, to) {
    const world = this.world, LB = this._linksB, cols = this.cols;
    const n = world.linksFrom(fx, fy, LB);
    const flow = world.roundaboutFlowDir(fx, fy);
    let bestW = Infinity, bestDir = -1, bestKind = 0, bestLen = 0;
    for (let i = 0; i < n; i++) {
      const L = LB[i];
      if (L.ny * cols + L.nx !== to) continue;
      const kc = kindCode(L.kind);
      if (kc === K_ROAD && L.ghost && !this._holdsEdge(car, fx, fy, L.dir)) continue;
      if (flow >= 0 && kc === K_ROAD && L.dir !== flow &&
          world.roundaboutFlowDir(L.nx, L.ny) >= 0) continue;
      const w = L.len / KIND_SPEED[kc];
      if (w < bestW) { bestW = w; bestDir = L.dir; bestKind = kc; bestLen = L.len; }
    }
    if (bestW === Infinity) return false;
    // A gate's drive link can span more than one tile (a corner gate to an
    // interior door), so its `dir` is only a bearing and may be absent. Fall
    // back to the bearing of the actual move so the link key, the lane offset
    // and the next turn cost all stay sane.
    if (!(bestDir >= 0 && bestDir <= 7)) {
      bestDir = this._bearing(fx, fy, to % cols, (to / cols) | 0);
      if (bestDir < 0) bestDir = 0;
    }
    this._rDir = bestDir; this._rKind = bestKind; this._rLen = bestLen;
    return true;
  }

  /** The 8-dir index whose step matches the sign of (bx-ax, by-ay), or -1. */
  _bearing(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const sy = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    for (let d = 0; d < 8; d++) if (DX[d] === sx && DY[d] === sy) return d;
    return -1;
  }

  /* ====================== traffic lights ====================== */

  _tickLights(dt) {
    const world = this.world;
    const list = world.lights;
    if (!list || list.length === 0) {
      if (this._lightByNode.size) { this._lightByNode.clear(); this._lightById.clear(); }
      return;
    }
    if (this._lightVersion !== this._version) {
      this._lightVersion = this._version;
      this._lightByNode.clear();
      for (let i = 0; i < list.length; i++) {
        const L = list[i];
        if (!L) continue;
        let st = this._lightById.get(L.id);
        if (st === undefined) {
          st = { axis: (L.id | 0) & 1, t: 0, p0: 0, p1: 0 };
          this._lightById.set(L.id, st);
        }
        this._lightByNode.set((L.y | 0) * this.cols + (L.x | 0), st);
        L.greenAxis = st.axis;
      }
    }
    for (let i = 0; i < list.length; i++) {
      const L = list[i];
      if (!L) continue;
      const st = this._lightById.get(L.id);
      if (st === undefined) continue;
      st.t += dt;
      const red = st.axis === 0 ? st.p1 : st.p0;
      const green = st.axis === 0 ? st.p0 : st.p1;
      const flip = st.t >= LIGHT_MAX_GREEN ||
        (st.t >= LIGHT_MIN_GREEN && red > 0 && red >= green);
      if (flip) {
        st.axis = st.axis === 0 ? 1 : 0;
        st.t = 0;
      }
      st.p0 = 0; st.p1 = 0;
      L.greenAxis = st.axis;      // render.js polls this optional field
    }
  }

  /* ====================== pathfinding ====================== */

  /**
   * Dijkstra over the link graph with the friction weights baked in, so routing
   * actually reflects the model: motorways win, diagonals cost time, junctions
   * and jams cost time. Node-only search with the turn penalty taken from the
   * settled predecessor's heading — a deliberate approximation that keeps the
   * state space at one entry per tile (tablet budget) and still ranks
   * orthogonal-vs-diagonal and motorway-vs-surface correctly.
   *
   * `tb` is the BUILDING whose door `target` is (may be omitted). It is what
   * lets a car drive onto that building's gate tiles while every other
   * building's footprint stays a dead end.
   *
   * Writes the node list into car.path. Returns true on success.
   */
  _path(car, target, tb) {
    // Paths are only ever built from the node a car is standing on. Nothing is
    // re-routed mid-edge, which is what keeps cars from teleporting.
    if (!car.atNode) return false;
    const src = car.node;
    if (src < 0 || target < 0 || src === target) return false;

    const world = this.world, cols = this.cols;
    const dist = this._dist, prev = this._prev, pdir = this._pdir;
    const seen = this._seen, done = this._done, LA = this._linksA;
    const ep = ++this._epoch;
    const jc = this.junctionCost;

    this._heapN = 0;
    dist[src] = 0; prev[src] = -1; pdir[src] = car.onLink ? car.linkDir : -1;
    seen[src] = ep; done[src] = 0;
    this._push(src, 0);

    let found = false, pops = 0;
    const popCap = this.nodeCount + 8;

    while (this._heapN > 0 && pops++ < popCap) {
      const u = this._pop();
      if (done[u] === ep) continue;
      done[u] = ep;
      if (u === target) { found = true; break; }

      const ux = u % cols, uy = (u / cols) | 0;

      // Footprint rule. A DRIVEWAY tile is public: any car may drive through an
      // office's lane whether or not it is calling there, which is what makes a
      // double office's through-driveway a genuine (slow) short cut. A GATE tile
      // is drivable too — roads terminate on it — but only the gates of the
      // building this trip is for (to get IN) or of the building the car is
      // standing in right now (to get OUT again). Everything else under a
      // building — the building proper, other buildings' doors — is a hard dead
      // end, so a car can never cut a corner through a shop or a house.
      if (u !== src) {
        const fl = world.tileFlags(ux, uy);
        if ((fl & F_BUILD) !== 0 && (fl & F_DRIVE) === 0) {
          if (!this._isGate(ux, uy, fl)) continue;
          const owner = (typeof world.gateOwner === 'function')
            ? world.gateOwner(ux, uy) : null;
          if (owner && owner !== tb && this._doorNode(owner) !== src) continue;
        }
      }

      const du = dist[u];
      const inDir = pdir[u];
      const flow = world.roundaboutFlowDir(ux, uy);
      const round = flow >= 0;
      const light = !round && world.hasLight(ux, uy);
      const plain = !round && !light && world.isIntersection(ux, uy);

      const n = world.linksFrom(ux, uy, LA);
      for (let i = 0; i < n; i++) {
        const L = LA[i];
        const kc = kindCode(L.kind);
        // An erased road is still this car's way home if it remembers driving it;
        // for every other car it does not exist.
        if (kc === K_ROAD && L.ghost && !this._holdsEdge(car, ux, uy, L.dir)) continue;
        const v = L.ny * cols + L.nx;
        if (done[v] === ep) continue;
        const dir = L.dir;
        if (round && kc === K_ROAD && dir !== flow &&
            world.roundaboutFlowDir(L.nx, L.ny) >= 0) continue;   // one-way ring

        let w = L.len / KIND_SPEED[kc];
        // motorways are grade-separated and a drive hop is your own driveway:
        // neither is a public junction, so neither pays junction/turn friction
        if (kc !== K_MOTORWAY && kc !== K_DRIVE) {
          if (plain) w += W_INTERSECTION * jc;
          else if (light) w += W_LIGHT * jc;
          else if (round) w += W_ROUND;
          if (inDir >= 0) w += W_TURN * turnFrac(inDir, dir) * jc;
          if (kc === K_ROAD) {
            const ok = this._occKey(ux, uy, dir);
            if (ok >= 0) {
              const occ = this._edgeOcc[ok];
              if (occ > 0) w += W_CONGEST * occ;
            }
          }
        }

        const nd = du + w;
        if (seen[v] !== ep || nd < dist[v]) {
          seen[v] = ep;
          dist[v] = nd;
          prev[v] = u;
          pdir[v] = dir;
          this._push(v, nd);
        }
      }
    }

    this.stats.paths++;
    if (!found) { this.stats.pathFails++; return false; }

    // reconstruct
    const rev = this._revBuf;
    let m = 0, at = target;
    while (at >= 0 && m < MAX_PATH) {
      rev[m++] = at;
      if (at === src) break;
      at = prev[at];
    }
    if (at !== src || m < 2) { this.stats.pathFails++; return false; }

    const path = car.path;
    for (let i = 0; i < m; i++) path[i] = rev[m - 1 - i];
    car.pathN = m;
    car.pathI = 0;
    car.needPath = false;

    // A car mid-edge keeps running that edge; its path starts at the far node,
    // so index 0 is where it is heading. Nothing is ever re-routed mid-edge.
    return true;
  }

  _push(node, cost) {
    let n = this._heapN;
    if (n >= this._heapNode.length) this._growHeap();
    const hn = this._heapNode, hc = this._heapCost;
    hn[n] = node; hc[n] = cost;
    this._heapN = n + 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hc[p] <= hc[n]) break;
      const tn = hn[p]; hn[p] = hn[n]; hn[n] = tn;
      const tc = hc[p]; hc[p] = hc[n]; hc[n] = tc;
      n = p;
    }
  }

  _pop() {
    const hn = this._heapNode, hc = this._heapCost;
    const top = hn[0];
    const n = --this._heapN;
    hn[0] = hn[n]; hc[0] = hc[n];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      if (l >= n) break;
      let c = l;
      if (r < n && hc[r] < hc[l]) c = r;
      if (hc[i] <= hc[c]) break;
      const tn = hn[i]; hn[i] = hn[c]; hn[c] = tn;
      const tc = hc[i]; hc[i] = hc[c]; hc[c] = tc;
      i = c;
    }
    return top;
  }

  _growHeap() {
    const cap = this._heapNode.length * 2;
    const hn = new Int32Array(cap); hn.set(this._heapNode);
    const hc = new Float32Array(cap); hc.set(this._heapCost);
    this._heapNode = hn; this._heapCost = hc;
  }

  /* ====================== occupancy & ghosts ====================== */

  /**
   * Canonical slot for an undirected grid edge. Dirs 4..7 are folded onto their
   * opposite from the other endpoint, so (x,y,dir) and (x+dx,y+dy,OPP[dir])
   * always hit the same slot. This is integration requirement #1.
   */
  _occKey(x, y, dir) {
    if (dir < 0 || dir > 7) return -1;
    let cx = x, cy = y, cd = dir;
    if (cd >= 4) { cx = x + DX[dir]; cy = y + DY[dir]; cd = OPP[dir]; }
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -1;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
    return (cy * this.cols + cx) * 4 + cd;
  }

  _linkKey(from, dir, kind) {
    return (from * 8 + dir) * 4 + kind;
  }

  _enterLink(car) {
    let q = this._q.get(car.key);
    if (q === undefined) { q = []; this._q.set(car.key, q); }
    q.push(car);
    car.onLink = true;
    car.occDropped = false;
    if (car.linkKind === K_ROAD) {
      const k = this._occKey(car.linkFrom % this.cols, (car.linkFrom / this.cols) | 0, car.linkDir);
      car.occKey = k;
      // Occupancy FIRST, then the trail: the pop below can release a ghost, and it
      // must never release the edge this car is at that moment driving onto.
      if (k >= 0) { this._edgeOcc[k]++; this._trailStep(car, k); }
    } else {
      car.occKey = -1;
    }
  }

  /**
   * Give up this car's share of its edge's occupancy, then see whether that was the
   * last reason an erased edge was still there.
   */
  _dropOcc(car) {
    const k = car.occKey;
    if (k < 0 || car.occDropped) return false;
    car.occDropped = true;
    const c = this._edgeOcc[k] - 1;
    this._edgeOcc[k] = c > 0 ? c : 0;
    this._maybeRelease(k);
    return true;
  }

  /**
   * An erased edge exists for exactly two reasons: a car is on it, or a car
   * remembers it as its way home. When the last of both goes, the edge finally
   * leaves the graph and stops being drawn. releaseGhost is idempotent (it clears
   * the ghost bit), so calling this from several places is safe.
   */
  _maybeRelease(k) {
    if (k < 0) return;
    if (this._edgeOcc[k] > 0 || this._edgeHold[k] > 0) return;
    // The slot is the canonical addressing of the undirected edge: bucket 0..3 is
    // the dir, and the node it came from is the lower-indexed end.
    const n = k >> 2, dir = k & 3;
    const x = n % this.cols, y = (n / this.cols) | 0;
    if (this.world.isGhost(x, y, dir) && this.world.releaseGhost(x, y, dir)) {
      this.stats.ghostsReleased++;
    }
  }

  /* ---------------------- the way home a car remembers ----------------------
   * car.trail is a ring-buffered STACK of undirected edge slots: the roads this
   * car has driven since it last stood at its own front door. Pushed on the way
   * out, popped the moment the car drives back along the same edge. While a slot
   * is in some car's trail its edge may be flagged deleted but cannot leave the
   * graph, and that car (only) may still route over it. This is what stops an
   * erase behind a car from cutting off its route home.
   */

  _trailTop(car) {
    return car.trailN > 0 ? car.trail[(car.trailHead + car.trailN - 1) % MAX_TRAIL] : -1;
  }

  /** One hop's worth of bookkeeping: retracing pops, anything else pushes. */
  _trailStep(car, k) {
    if (this._trailTop(car) === k) {      // driving back along the last road we took
      car.trailN--;
      this._dropHold(k);                  // the occupancy above keeps it alive until we're off
      return;
    }
    if (car.trailN >= MAX_TRAIL) {        // overran: forget the oldest hop instead
      const old = car.trail[car.trailHead];
      car.trailHead = (car.trailHead + 1) % MAX_TRAIL;
      car.trailN--;
      this._dropHold(old);
    }
    car.trail[(car.trailHead + car.trailN) % MAX_TRAIL] = k;
    car.trailN++;
    this._edgeHold[k]++;
  }

  _dropHold(k) {
    const c = this._edgeHold[k] - 1;
    this._edgeHold[k] = c > 0 ? c : 0;
    this._maybeRelease(k);
  }

  /**
   * The car is home (or gone): it needs none of those roads any more, so every
   * erased one among them can finally disappear. Called from every path that ends
   * a trip — arrival, park at the door, lift, retire — because a trail that is
   * never cleared is a ghost that never dies.
   */
  _clearTrail(car) {
    const n = car.trailN;
    car.trailN = 0;
    for (let i = 0; i < n; i++) {
      this._dropHold(car.trail[(car.trailHead + i) % MAX_TRAIL]);
    }
    car.trailHead = 0;
    car.lostTries = 0;
  }

  /** Does this car remember driving (x,y)->dir? Only asked about ghost edges. */
  _holdsEdge(car, x, y, dir) {
    if (!car || car.trailN <= 0) return false;
    const k = this._occKey(x, y, dir);
    if (k < 0) return false;
    for (let i = 0; i < car.trailN; i++) {
      if (car.trail[(car.trailHead + i) % MAX_TRAIL] === k) return true;
    }
    return false;
  }

  /** Is this car the reason some erased road is still on the map? */
  _holdsGhost(car) {
    const w = this.world;
    for (let i = 0; i < car.trailN; i++) {
      const k = car.trail[(car.trailHead + i) % MAX_TRAIL];
      const n = k >> 2;
      if (w.isGhost(n % this.cols, (n / this.cols) | 0, k & 3)) return true;
    }
    return false;
  }

  _leaveLink(car) {
    if (!car.onLink) return;
    const q = this._q.get(car.key);
    if (q !== undefined) {
      // shift-left by hand: Array.splice would allocate a result array on every
      // single link exit, which is the hottest event in the whole module
      const n = q.length;
      let i = 0;
      while (i < n && q[i] !== car) i++;
      if (i < n) {
        for (let j = i + 1; j < n; j++) q[j - 1] = q[j];
        q.length = n - 1;
      }
    }
    this._dropOcc(car);
    car.onLink = false;
    car.occKey = -1;
    car.occDropped = false;
    car.linkLen = 0;
  }

  /**
   * Is the crossing a->b of node `n` free right now? A slot held by this car
   * itself never blocks it (a car that re-departs the same node mid-crossing).
   * @returns {number} a free slot index to claim, or -1 if it must wait
   */
  _crossFree(n, a, b, carId) {
    const base = n * JCAP;
    let slot = -1;
    for (let i = 0; i < JCAP; i++) {
      const m = this._jMove[base + i];
      if (m === 0) { if (slot < 0) slot = base + i; continue; }
      if (this._jCar[base + i] === carId + 1) { slot = base + i; continue; }
      const code = m - 1;
      if (conflicts(a, b, (code >> 3) & 7, code & 7)) return -1;
    }
    // Every slot busy but nothing conflicting: still refuse. Four cars mid-node
    // is already more than a 1-tile junction can plausibly hold, and refusing is
    // the safe direction — it queues rather than overlapping sprites.
    return slot;
  }

  _claimCross(car, n, a, b, slot) {
    this._jMove[slot] = ((a << 3) | b) + 1;
    this._jCar[slot] = car.id + 1;
    car.lockNode = n;
    car.lockSlot = slot;
  }

  /**
   * The car did not move this frame. `stuckT` always accumulates (the re-path and
   * abort valves run off it), but the visible/measured `stuck` flag only latches
   * after STUCK_SOFT, so giving way at a junction is not painted as a jam.
   */
  _stall(car, dt) {
    car.stuckT += dt;
    if (car.stuckT > STUCK_SOFT) car.stuck = true;
  }

  _unlock(car) {
    const s = car.lockSlot;
    if (s >= 0 && this._jCar[s] === car.id + 1) {
      this._jMove[s] = 0;
      this._jCar[s] = 0;
    }
    car.lockNode = -1;
    car.lockSlot = -1;
  }

  /* ====================== claims ====================== */

  /** Hand a claim back. Safe to call when there is nothing to hand back. */
  _release(car, demand) {
    if (!car.claimed) { car.destId = -1; return; }
    car.claimed = false;
    const id = car.destId;
    car.destId = -1;
    const dm = demand || this._demand;
    if (id >= 0 && dm && typeof dm.release === 'function') {
      dm.release(id);
      this.stats.releases++;
    }
  }

  /** Hand back a claim we took but never attached to the car. */
  _giveBack(car, demand, id) {
    car.claimed = false;
    car.destId = -1;
    const dm = demand || this._demand;
    if (id >= 0 && dm && typeof dm.release === 'function') {
      dm.release(id);
      this.stats.releases++;
    }
  }

  /**
   * No route anywhere: give the pin back and idle where we stand (always on a
   * node, never mid-edge). A stranded car steps off an ERASED edge so it can finish
   * dying — parking on one forever would leave a deleted road drawn on the map.
   * On a live edge it keeps its slot and behaves like a stalled car.
   */
  _park(car, demand) {
    this._release(car, demand);
    car.state = 'idle';
    car.carrying = false;
    car.vel = 0;
    car.needPath = false;
    car.stuckT = 0;
    car.wait = 1.0 + Math.random() * 1.2;
    const h = this._homeOf(car);
    car.atHome = !!h && car.node === this._doorNode(h) && car.atNode;
    if (car.atHome) {
      this._leaveLink(car);
      this._clearTrail(car);
      this._parkAt(car, car.node % this.cols, (car.node / this.cols) | 0);
    } else {
      this._offGhost(car);
    }
    this._unlock(car);
    this._pose(car, 0.016);
  }

  /**
   * Is the car standing somewhere it can never drive out of? A node that emits
   * zero links is a dead end in the strictest sense — not congestion, not a
   * missing route, but no road at all. Only reachable if the map changed under
   * the car (an erase, or a roundabout island landing on its tile).
   */
  _stranded(car) {
    if (!car.atNode) return false;
    return this.world.linksFrom(car.node % this.cols, (car.node / this.cols) | 0, this._linksB) === 0;
  }

  /**
   * Put a car back on its own doorstep and idle it there. This is the escape hatch
   * for a car the MAP has made unrecoverable — standing on a tile with no links at
   * all, or wedged mid-hop along a road the player erased — never for one that is
   * merely queueing. It is visible teleportation, so it must stay rare: the
   * alternatives are a car parked on the scenery forever, or a deleted road that
   * cannot finish dying. Every side effect is settled (claim, link, junction lock).
   */
  _liftHome(car, demand) {
    const h = this._homeOf(car);
    if (!h) return false;
    const door = this._doorNode(h);
    this._release(car, demand);
    this._leaveLink(car);
    this._clearTrail(car);   // it is home by fiat, so it needs no way back
    this._unlock(car);
    car.node = door;
    car.atNode = true;
    car.state = 'idle';
    car.atHome = true;
    car.carrying = false;
    car.vel = 0;
    car.s = 0;
    car.linkLen = 0;
    car.pathN = 0;
    car.pathI = 0;
    car.needPath = false;
    car.recheck = false;
    car.stuckT = 0;
    car.wedgeT = 0;
    car.holdT = 0;
    car.wait = 0.4 + Math.random() * 0.6;
    this._parkAt(car, door % this.cols, (door / this.cols) | 0);
    return true;
  }

  /**
   * A car with nowhere to go steps OFF an erased (ghost) edge — it is standing on
   * the far node already, so nothing teleports and nothing is lost. That releases
   * the last reason the edge exists, so the road the player deleted stops being
   * drawn instead of lingering under a parked car.
   */
  _offGhost(car) {
    if (!car.onLink || !car.atNode || car.linkKind !== K_ROAD) return false;
    const fx = car.linkFrom % this.cols, fy = (car.linkFrom / this.cols) | 0;
    if (!this.world.isGhost(fx, fy, car.linkDir)) return false;
    this._leaveLink(car);
    return true;
  }

  /** Remove a car from the sim entirely, settling every side effect. */
  _retire(car, demand, silent) {
    this._release(car, demand);
    this._leaveLink(car);
    this._clearTrail(car);   // a car that no longer exists cannot need a way home
    this._unlock(car);
    const h = this._homeOf(car);
    if (h) {
      const c = (h.cars | 0) - 1;
      h.cars = c > 0 ? c : 0;
    }
    car.state = 'idle';
    car.pathN = 0;
    car.pathI = 0;
    this.stats.removed++;
    if (!silent) {
      const i = this.cars.indexOf(car);
      if (i >= 0) { this.cars[i] = this.cars[this.cars.length - 1]; this.cars.pop(); }
    }
    if (this._pool.length < MAX_CARS) this._pool.push(car);
  }

  /* ====================== small helpers ====================== */

  _alloc() {
    const c = this._pool.pop();
    if (c !== undefined) {
      c.onLink = false; c.occKey = -1; c.lockNode = -1; c.lockSlot = -1;
      c.atNode = true;
      c.linkLen = 0; c.linkDir = -1; c.linkKind = K_ROAD; c.s = 0;
      c.pathN = 0; c.pathI = 0; c.needPath = false; c.recheck = false;
      c.vel = 0; c.stuckT = 0; c.wedgeT = 0; c.wait = 0; c.occDropped = false;
      c.exitCap = -1; c.holdT = 0; c.nnHave = false; c.nnGate = 0;
      c.nnKey = 0; c.nnA = 0; c.nnB = 0; c.planVer = -1;
      // _retire cleared the holds before pooling, so only the indices need resetting
      c.trailHead = 0; c.trailN = 0; c.lostTries = 0;
      c.parkT = 0;
      return c;
    }
    return {
      id: 0, color: 0,
      x: 0, y: 0, angle: 0,
      state: 'idle', carrying: false, stuck: false,
      homeId: -1, destId: -1, claimed: false, atHome: true, slot: 0,
      // path
      path: new Int32Array(MAX_PATH), pathN: 0, pathI: 0,
      needPath: false, recheck: false,
      // the roads driven since leaving home: a ring-buffered stack of edge slots,
      // which is what keeps an erased road alive until this car is back off it
      trail: new Int32Array(MAX_TRAIL), trailHead: 0, trailN: 0, lostTries: 0,
      // current link
      node: 0, linkFrom: 0, linkTo: 0, linkDir: -1, linkKind: K_ROAD,
      linkLen: 0, linkSpeed: 0, s: 0, key: 0, occKey: -1,
      onLink: false, atNode: true, lockNode: -1, lockSlot: -1, occDropped: false,
      ax: 0, ay: 0, bx: 0, by: 0, ox: 0, oy: 0, ux: 1, uy: 0, tAngle: 0,
      // the lane line of the link BEHIND us, kept so _lanePose can round the corner
      // we have just turned; `fillet` is whether it is safe to (see _tryDepart)
      fillet: 0, pox: 0, poy: 0, pux: 1, puy: 0, pAng: 0, pC: 0,
      // dynamics
      vel: 0, wait: 0, stuckT: 0, wedgeT: 0,
      // the park manoeuvre: countdown, the pose on the lane, the pose in the space,
      // and the two handles of the curve that turns between them
      parkT: 0, parkHome: 0, laneX: 0, laneY: 0, laneA: 0, bayX: 0, bayY: 0, bayA: 0,
      pk1X: 0, pk1Y: 0, pk2X: 0, pk2Y: 0,
      // scratch for _resolve
      nDir: -1, nKind: 0, nLen: 0,
      // the approach plan for the FAR node of the current link (see _planApproach)
      exitCap: -1, holdT: 0,
      nnHave: false, nnGate: 0, nnKey: 0, nnA: 0, nnB: 0, planVer: -1,
      nnDir: -1, nnOX: 0, nnOY: 0, nnUX: 1, nnUY: 0, nnAng: 0, nnC: 0
    };
  }

  /**
   * Start the park manoeuvre: remember the pose on the lane, work out the pose in the
   * space, lay out the curve between them, and set the clock.
   *
   * `bayNX/bayNY` (out of the lane, towards this colour's own block), `bayTX/bayTY`
   * (along the lane, the way this colour's space is slanted) and `bayCX/bayCY` (the
   * centre of that space, on the lane's axis) are all baked onto the dest record by
   * net.js from the variant table, so there is no geometry to redo per arrival and the
   * markings `_drawBays` paints and this pose cannot disagree. The nose ends up along
   * the bisector of the two axes: 45 degrees, straight up the space.
   */
  _beginPark(car, d) {
    if (!d || !isFinite(d.bayNX) || !isFinite(d.bayNY)) return;
    const nx = d.bayNX, ny = d.bayNY;
    if (!nx && !ny) return;
    let tx = isFinite(d.bayTX) ? d.bayTX : 0, ty = isFinite(d.bayTY) ? d.bayTY : 0;
    // The lane pose comes from the same function that draws the lane, evaluated at the
    // end of the link just finished — exact, and not one frame stale like car.x/car.y,
    // and if that node happens to carry a corner fillet the manoeuvre starts on it.
    let lx = car.x, ly = car.y;
    if (car.onLink && car.linkLen > 0) {
      this._lanePose(car, car.linkLen);
      lx = _fx; ly = _fy;
    }
    if (!(lx === lx) || !(ly === ly)) return;
    car.laneX = lx; car.laneY = ly;
    // The heading it actually has on screen, not the link's ideal one: this is the pose
    // the manoeuvre has to grow out of and hand back, or there is a visible flick.
    car.laneA = isFinite(car.angle) ? car.angle : car.tAngle;
    /* Nose in the way we are already going. The baked slant assumes the car arrived
     * through the connection point NEAREST its space, which is what the router
     * normally picks; if the roads outside sent it in from the far end instead, using
     * the baked slant would have it hairpin 135 degrees on the spot, so mirror the
     * space and nose into it the other way. The car then sits across its markings
     * rather than square in them, which is much the lesser of the two evils. */
    if (tx * Math.cos(car.laneA) + ty * Math.sin(car.laneA) < 0) { tx = -tx; ty = -ty; }
    const cx = isFinite(d.bayCX) ? d.bayCX : d.doorX + 0.5;
    const cy = isFinite(d.bayCY) ? d.bayCY : d.doorY + 0.5;
    /* Where the car stands: BAY_MID out of the lane, and the along-lane offset that
     * goes with that depth. A space's centre line runs at 45 degrees, so from its
     * mouth (BAY_IN) it moves along the lane exactly as far as it moves out; the
     * markings are drawn spread either side of the space's centre, half the slant's
     * travel each way, so at depth BAY_MID the middle of the space sits
     * (BAY_MID - BAY_IN) - travel/2 along from that centre. */
    const along = (BAY_MID - BAY_IN) - (BAY_OUT - BAY_IN) / 2;
    car.bayX = cx + nx * BAY_MID + tx * along;
    car.bayY = cy + ny * BAY_MID + ty * along;
    car.bayA = Math.atan2(ny + ty, nx + tx);   // 45 deg into the space
    /* The curve: a cubic with one handle along the lane and one along the space's
     * axis, so the car pulls away straight, swings, and arrives square in the space —
     * a turn, not a slide. Handles of equal length keep it symmetric, which matters
     * because it is driven backwards on the way out. */
    const ddx = car.bayX - lx, ddy = car.bayY - ly;
    let hl = Math.sqrt(ddx * ddx + ddy * ddy) * PARK_BOW;
    if (!(hl > PARK_BOW_MIN)) hl = PARK_BOW_MIN;
    else if (hl > PARK_BOW_MAX) hl = PARK_BOW_MAX;
    car.pk1X = lx + Math.cos(car.laneA) * hl;
    car.pk1Y = ly + Math.sin(car.laneA) * hl;
    car.pk2X = car.bayX - Math.cos(car.bayA) * hl;
    car.pk2Y = car.bayY - Math.sin(car.bayA) * hl;
    car.parkT = PARK_DUR;
    car.parkHome = 0;
    car.vel = 0;
  }

  /**
   * One frame of the manoeuvre. Turn in, hold, back out — and end exactly back on
   * the lane pose so the normal departure path picks up seamlessly. The car is NOT
   * moving along any link while this runs, so stuck/wedge timers are held at zero:
   * a parked car is not a jammed one and must never be lifted home as one.
   *
   * The heading is turned steadily from the lane's to the space's rather than taken
   * from the curve's tangent: the path has to double back a little (see PARK_BOW), and
   * a tangent heading would have the car swivel where it does. Both ends still line up
   * exactly — the curve leaves along the lane and arrives along the space's axis — so
   * the last of the manoeuvre is a genuine drive up the bay, and the way out is the
   * same curve backwards, nose still forward, which is what reversing out of a bay is.
   */
  _parkStep(car, dt) {
    car.parkT -= dt;
    const done = car.parkT <= 0;
    const home = car.parkHome === 1;              // one-way: end in the spot, stay there
    let t = done ? 1 : 1 - car.parkT / (home ? HOME_PARK_DUR : PARK_DUR);
    let u;
    if (home) u = t;
    else if (t < PARK_IN) u = t / PARK_IN;
    else if (t < 1 - PARK_OUT) u = 1;
    else u = (1 - t) / PARK_OUT;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    u = u * u * (3 - 2 * u);                       // smoothstep: no jerk at either end
    const c = 1 - u;
    const b0 = c * c * c, b1 = 3 * c * c * u, b2 = 3 * c * u * u, b3 = u * u * u;
    const x = b0 * car.laneX + b1 * car.pk1X + b2 * car.pk2X + b3 * car.bayX;
    const y = b0 * car.laneY + b1 * car.pk1Y + b2 * car.pk2Y + b3 * car.bayY;
    if (x === x) car.x = x;
    if (y === y) car.y = y;
    const a = lerpAng(car.laneA, car.bayA, u);
    if (a === a) car.angle = a;
    car.vel = 0;
    car.stuckT = 0; car.wedgeT = 0; car.holdT = 0;
    if (done) {
      car.parkT = 0;
      if (home) {
        car.parkHome = 0;
        car.x = car.bayX; car.y = car.bayY; car.angle = car.bayA;
      } else {
        car.x = car.laneX; car.y = car.laneY; car.angle = car.laneA;
      }
    }
  }

  /**
   * Arriving home: swing off the lane into the spot beside the house instead of being
   * placed there. Same curve as a lot space, run once, and it ENDS in the spot — the
   * pose `_parkAt` would have snapped to, so an idle car still sits exactly where it
   * always did and `_parkAt` stays the truth for spawns and lifts.
   *
   * The parked heading is `_parkAt`'s (nose out along the road) or its reverse,
   * whichever the car is already closer to, so the swing is never more than a right
   * angle. Reversing into the spot and nosing into it look equally fine at this size;
   * spinning 180 degrees on the spot in half a second does not.
   */
  _beginHomePark(car, tx, ty) {
    const dir = this._parkDir(tx, ty);
    const dl = DIR_LEN[dir] > 0 ? DIR_LEN[dir] : 1;
    const ux = DX[dir] / dl, uy = DY[dir] / dl;
    const side = car.slot === 0 ? -PARK_SIDE : PARK_SIDE;
    const bx = tx + 0.5 + ux * PARK_NOSE - uy * side;
    const by = ty + 0.5 + uy * PARK_NOSE + ux * side;
    let ba = Math.atan2(uy, ux);
    const lx = car.x, ly = car.y;
    if (!(bx === bx) || !(by === by) || !(lx === lx) || !(ly === ly)) {
      this._parkAt(car, tx, ty);
      return;
    }
    const la = isFinite(car.angle) ? car.angle : ba;
    if (Math.cos(la - ba) < 0) ba += Math.PI;
    car.laneX = lx; car.laneY = ly; car.laneA = la;
    car.bayX = bx; car.bayY = by; car.bayA = ba;
    const ddx = bx - lx, ddy = by - ly;
    let hl = Math.sqrt(ddx * ddx + ddy * ddy) * PARK_BOW;
    if (!(hl > PARK_BOW_MIN)) hl = PARK_BOW_MIN;
    else if (hl > PARK_BOW_MAX) hl = PARK_BOW_MAX;
    car.pk1X = lx + Math.cos(la) * hl;
    car.pk1Y = ly + Math.sin(la) * hl;
    car.pk2X = bx - Math.cos(ba) * hl;
    car.pk2Y = by - Math.sin(ba) * hl;
    car.parkT = HOME_PARK_DUR;
    car.parkHome = 1;
    car.vel = 0;
  }

  /**
   * Where the car should be at arc `s` along its current link, and which way it should
   * be facing — the lane line, with both of its corners rounded. Writes `_fx/_fy/_fa`
   * (module scratch: this runs for every moving car, every frame).
   *
   * A lane line is `node + offset + unit * arc`, offset LANE to the driver's right. At
   * a node two of those lines cross at an angle, and jumping between them is what made
   * a turning car step sideways. So near a node both lines are extended straight
   * through it and crossfaded by a smoothstep of the signed arc:
   *
   *        w = smoothstep((t/C + 1)/2)        t = arc from the node, -C .. +C
   *        pos = (1-w) * inLine(t) + w * outLine(t)
   *
   * At the node itself w is exactly 0.5, so both halves of the corner agree on one
   * point (half way between the two lane lines — the inside of the turn); at t = +-C
   * the weight's slope is zero, so the arc leaves and rejoins the straight run without
   * a kink. The result is a fillet whose radius comes out of the lane offset itself:
   * gentle through a 45 degree bend, a proper sweep through 90, and a pivot through the
   * u-turn out of a driveway. The heading is crossfaded over the same window, which is
   * what stops the car from being briefly pointed across its own path.
   */
  _lanePose(car, s) {
    const len = car.linkLen > 0 ? car.linkLen : 1;
    let arc = s;
    if (!(arc >= 0)) arc = 0; else if (arc > len) arc = len;
    const u = arc / len;
    let x = car.ax + (car.bx - car.ax) * u + car.ox;
    let y = car.ay + (car.by - car.ay) * u + car.oy;
    let a = car.tAngle;
    // the corner behind us: the line we came in on, blended out. Mode 1 is a turn, so
    // that line runs THROUGH the node and the window is symmetric about it (w = 0.5 at
    // the node, which is what makes the two halves of one corner agree). Mode 2 is a
    // pull-away from a standstill: the line starts AT the car, so the window starts
    // there too and w runs 0 -> 1 over it.
    const ci = car.fillet ? car.pC : 0;
    if (ci > 0 && arc < ci) {
      const q = car.fillet === 2 ? arc / ci : (arc / ci + 1) * 0.5;
      const w = q * q * (3 - 2 * q);
      const px = car.ax + car.pox + car.pux * arc;
      const py = car.ay + car.poy + car.puy * arc;
      x += (1 - w) * (px - x);
      y += (1 - w) * (py - y);
      a = lerpAng(car.pAng, a, w);
    }
    // the corner ahead: the line we are about to turn onto, blended in early
    const co = car.nnHave ? car.nnC : 0;
    if (co > 0 && arc > len - co) {
      const t = arc - len;                       // negative up to 0 at the node
      const q = (t / co + 1) * 0.5;
      const w = q * q * (3 - 2 * q);
      const nx = car.bx + car.nnOX + car.nnUX * t;
      const ny = car.by + car.nnOY + car.nnUY * t;
      x += w * (nx - x);
      y += w * (ny - y);
      a = lerpAng(a, car.nnAng, w);
    }
    _fx = x; _fy = y; _fa = a;
  }

  /** Position + heading for the renderer. Tile centres, so x = tileX + 0.5. */
  _pose(car, dt) {
    if (car.parkT > 0) return;        // the park manoeuvre owns the pose while it runs
    if (car.onLink && car.linkLen > 0) {
      this._lanePose(car, car.s);
      if (_fx === _fx) car.x = _fx;
      if (_fy === _fy) car.y = _fy;
      // Ease the heading by the shortest angular delta. The target is already smooth
      // through a corner (_lanePose crossfades it), so this is only here to absorb the
      // one place a heading still changes in a single frame: a car pulling away with no
      // corner to round, out of a house or a parking bay.
      let d = _fa - car.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      let k = TURN_EASE * (dt > 0 ? dt : 0.016);
      if (k > 1) k = 1;
      const a = car.angle + d * k;
      if (a === a) car.angle = a;
    }
    if (!(car.x === car.x)) car.x = 0.5;
    if (!(car.y === car.y)) car.y = 0.5;
    if (!(car.angle === car.angle)) car.angle = 0;
  }

  /**
   * Park an idle car on its house's gate tile. There is no driveway tile any
   * more, so the heading comes from a road that is really joined to the gate:
   * the car noses OUT along that road (PARK_NOSE) and sits off-centre across it
   * (PARK_SIDE) so two cars at one house never overlap. Nosing out also keeps
   * the sprite half over the tile edge instead of buried in the middle of the
   * house — v1's "idle cars are invisible" bug. With no road joined yet the
   * fallback is dir 0, which is still a sane, non-NaN pose.
   */
  _parkAt(car, tx, ty) {
    car.parkT = 0; car.parkHome = 0;      // a snap cancels any manoeuvre in progress
    const dir = this._parkDir(tx, ty);
    const dl = DIR_LEN[dir] > 0 ? DIR_LEN[dir] : 1;
    const ux = DX[dir] / dl, uy = DY[dir] / dl;   // unit vector along the road
    const side = car.slot === 0 ? -PARK_SIDE : PARK_SIDE;
    const x = tx + 0.5 + ux * PARK_NOSE - uy * side;
    const y = ty + 0.5 + uy * PARK_NOSE + ux * side;
    if (x === x) car.x = x;
    if (y === y) car.y = y;
    const a = Math.atan2(uy, ux);
    if (a === a) car.angle = a;
  }

  /**
   * A direction off (x,y) that has a real road edge, orthogonals preferred (a
   * car square to the road reads better than one on a diagonal). O(1): at most
   * eight flag tests, and only ever on spawn/park, never per frame.
   */
  _parkDir(x, y) {
    const w = this.world;
    const em = w.edgeMask;
    let mask = -1;
    if (typeof em === 'function') mask = em.call(w, x, y) | 0;
    else if (em && em.length !== undefined) {
      const n = y * this.cols + x;
      mask = (n >= 0 && n < em.length) ? (em[n] | 0) : 0;
    }
    if (mask >= 0) {
      if (mask === 0) return 0;
      for (let d = 0; d < 8; d += 2) if (mask & (1 << d)) return d;
      for (let d = 1; d < 8; d += 2) if (mask & (1 << d)) return d;
      return 0;
    }
    if (typeof w.hasEdge === 'function') {
      for (let d = 0; d < 8; d += 2) if (w.hasEdge(x, y, d)) return d;
      for (let d = 1; d < 8; d += 2) if (w.hasEdge(x, y, d)) return d;
    }
    return 0;
  }

  /**
   * The tile a car arrives at / departs from for a building: its DOOR. For a
   * house that is the house tile itself (gate === door); for an office it is the
   * PARKING BAY — a driveway tile, one per colour, that the connection point's
   * drive links lead to. Deliveries are collected there, never on the road.
   */
  _doorNode(b) {
    const dx = (b.doorX === undefined) ? (b.x | 0) : (b.doorX | 0);
    const dy = (b.doorY === undefined) ? (b.y | 0) : (b.doorY | 0);
    return dy * this.cols + dx;
  }

  /**
   * Is (x,y) a gate? Flag test first (F_GATE, O(1)); world.isGate is only
   * consulted for footprint tiles that do not carry the bit, which keeps this
   * working even if net.js decides gates live behind the accessor alone. Never
   * scans world.dests.
   */
  _isGate(x, y, flags) {
    if ((flags & F_GATE) !== 0) return true;
    const w = this.world;
    return (typeof w.isGate === 'function') ? !!w.isGate(x, y) : false;
  }

  /** The building this car is currently driving to, or null if it has gone. */
  _targetBuilding(car) {
    if (car.state === 'toDest') return this._destById(car.destId);
    return this._homeOf(car);
  }

  _targetNode(car) {
    const b = this._targetBuilding(car);
    return b ? this._doorNode(b) : -1;
  }

  /**
   * Refresh the id -> building maps. Membership of world.houses / world.dests is
   * the authority (net.js never forgets an id, so byId alone cannot tell us a
   * building has been taken away).
   */
  _syncBuildings() {
    this._mapVersion = this.world.version | 0;
    const hm = this._houseMap, dm = this._destMap;
    hm.clear(); dm.clear();
    const hs = this.world.houses;
    if (hs) for (let i = 0; i < hs.length; i++) { const h = hs[i]; if (h) hm.set(h.id, h); }
    const ds = this.world.dests;
    if (ds) for (let i = 0; i < ds.length; i++) { const d = ds[i]; if (d) dm.set(d.id, d); }
  }

  /** The car's house, or null if it has gone. */
  _homeOf(car) {
    if (this._mapVersion !== (this.world.version | 0)) this._syncBuildings();
    const h = this._houseMap.get(car.homeId);
    return h === undefined ? null : h;
  }

  /** The claimed destination, or null if it has gone. */
  _destById(id) {
    if (id < 0) return null;
    if (this._mapVersion !== (this.world.version | 0)) this._syncBuildings();
    const d = this._destMap.get(id);
    return d === undefined ? null : d;
  }
}
