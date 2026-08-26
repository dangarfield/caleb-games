// Roadways v2 — orchestrator.
//
// The shell (index.html) talks ONLY to this module. Sim owns:
//   the calendar (Mon..Sun weeks), pin generation AT DESTINATIONS, the destination
//   countdown timers (the whole failure mechanic), the demand broker handed to
//   Traffic, cars granted BY HOUSES, map expansion, the Sunday reward choice, the
//   inventory wallet, the score, and the event queue.
//
// DOM-free: no window/document/canvas/audio/storage in here.
//
// Perf notes (tablet target): `update` does not allocate at steady state —
// countdown timer objects are pooled per destination, the demand broker is built
// once, colour tallies live in typed arrays, and every per-frame pass over
// destinations/houses is a plain indexed loop. Event objects are the only
// per-frame garbage and they are emitted only when something actually happens.
// No perf number in this file was measured on the tablet.

import { World, COLORS, T_WATER, T_MOUNTAIN } from './net.js';
import { Generator } from './spawn.js';
import { Traffic } from './traffic.js';
import { absDay, intervalScale } from './demand.js';

const TILE_WATER = (typeof T_WATER === 'number') ? T_WATER : 2;
const TILE_MOUNTAIN = (typeof T_MOUNTAIN === 'number') ? T_MOUNTAIN : 3;
const COLOR_COUNT = Math.max(8, (COLORS && COLORS.length) | 0);

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SUNDAY = 6;

// The playable rect AND the camera both reveal from the opening rect to the full
// playable box over this many weeks, so the buildable area always matches what the
// zoom has uncovered. The shell imports this for its camera; the sim uses it to
// pace the bounds expansion (see `_expand`). One number, two consumers.
export const REVEAL_WEEKS = 7;

// Fallback grid, used only when no authored level is supplied (see `opts.map`).
const MAX_COLS = 40, MAX_ROWS = 28;
const START_COLS = 11, START_ROWS = 8;

const DT_MAX = 0.05;          // a backgrounded tab must not fast-forward a countdown
const MAX_EVENTS = 300;
const REFUND_FRACTION = 0.15; // a collected pin gives back 15% of the countdown total
const PIN_HARD_CAP = 60;      // sanity clamp above `cap`; you have already lost by then
const PIN_RATE = 0.8;         // global throttle on how fast pins appear: pins tick at this
                              // fraction of their otherwise-computed rate (0.8 = 20% slower /
                              // 25% longer intervals). Raise toward 1.0 to speed pins back up.
const FLEET_CAP = 56;         // tablet perf guard on total cars (NOT a measured limit)
const MAX_DEST_ID = 4096;     // size bound for the id->dest fast lookup

// Demand-vs-supply sampling. The interval is long enough that the pin slope is a
// real slope rather than one pin appearing, and that the fleet walk costs the
// tablet twice a second instead of sixty times. The time constant is a couple of
// pin intervals, so one collected pin cannot swing the house rate on its own.
const SUPPLY_INTERVAL = 0.5;  // seconds between samples
const SUPPLY_TAU = 6.0;       // seconds; EMA time constant on the pin slope

// World remover per infrastructure kind. The key is also the inventory key, so a
// refund is one lookup with no mapping table.
const UNBUILD = {
  lights: 'removeLight',
  motorway: 'removeMotorway',
  bridge: 'removeBridge',
  roundabout: 'removeRoundabout'
};

const DIFF = {
  easy: {
    dayLength: 12,
    capSquare: 8, capCircle: 10,
    countdown: 30,
    intervalSquare: 7.5, intervalCircle: 4.0,
    weeklyRoads: 20, startRoads: 40   // weekly down from 30; startRoads unchanged (opening board needs them)
  },
  normal: {
    dayLength: 9,
    capSquare: 6, capCircle: 8,
    countdown: 20,
    intervalSquare: 6.0, intervalCircle: 3.2,
    weeklyRoads: 10, startRoads: 30   // weekly down from 20; startRoads unchanged
  }
};

// mulberry32 — small seeded PRNG so a run is reproducible from its seed.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

// canAdd* return 0 for ok (contract) — tolerate a boolean implementation too.
function okReason(r) {
  return r === 0 || r === true;
}

export class Sim {
  constructor(opts) {
    const o = opts || {};
    this.difficulty = o.difficulty === 'easy' ? 'easy' : 'normal';
    this.seed = (o.seed === undefined || o.seed === null || !Number.isFinite(+o.seed))
      ? (Math.random() * 0xFFFFFFFF) >>> 0
      : (+o.seed >>> 0);
    this._rnd = makeRng(this.seed);

    const d = DIFF[this.difficulty];
    this.dayLength = d.dayLength;
    this.capSquare = d.capSquare;
    this.capCircle = d.capCircle;
    this.countdown = d.countdown;
    this.intervalSquare = d.intervalSquare;
    this.intervalCircle = d.intervalCircle;
    this.weeklyRoads = d.weeklyRoads;

    // An authored level (maps.js) supplies the grid, the opening rect and every
    // water/rock/off-map cell. Without one we fall back to the procedural map, so
    // the sim still runs headless in Node with no level file in reach.
    this.map = (o.map && o.map.plan) ? o.map : null;
    this.mapName = this.map ? this.map.name : '';

    // terrain flavour is picked per run and decides bridge vs tunnel rewards
    const terrain = this._rnd() < 0.5 ? 'water' : 'mountain';

    // World needs to ask traffic whether an edge is still needed by anybody — cars
    // driving it, or cars that remember it as their way home (ghost accounting) —
    // but Traffic needs the World first. One closure, built once, breaks the cycle.
    const self = this;
    this.world = new World({
      map: this.map,
      maxCols: MAX_COLS, maxRows: MAX_ROWS,
      startCols: START_COLS, startRows: START_ROWS,
      seed: this.seed, terrain,
      occupancyFn: function (x, y, dir) {
        const t = self.traffic;
        if (!t) return 0;
        const fn = (typeof t.edgeInUse === 'function') ? t.edgeInUse : t.carsOnEdge;
        if (typeof fn !== 'function') return 0;
        const n = fn.call(t, x, y, dir);
        return Number.isFinite(n) ? n : 0;
      }
    });
    this.terrain = (this.world && this.world.terrain) || terrain;

    this.traffic = new Traffic(this.world, { difficulty: this.difficulty });
    this.generator = new Generator(this.world, { seed: (this.seed ^ 0x9e3779b9) >>> 0, difficulty: this.difficulty });

    // --- run state ---
    this.score = 0;
    this.week = 1;
    this.dayIndex = 0;
    this.day = absDay(this.week, this.dayIndex);   // absolute day, 1-based (day 1 = Mon wk 1)
    this.dayLabel = DAY_NAMES[0];
    this.dayProgress = 0;
    this.weekProgress = 0;
    this.pressure = 0;
    this.gameOver = false;
    this.lostDestId = -1;
    this.pendingChoice = null;

    this.inventory = {
      roads: d.startRoads,
      motorway: 0,
      roundabout: 0,
      lights: 0,
      bridge: 0
    };

    // Road tally, so the weekly grant can answer "how many did they actually need?"
    // `roadsGranted` STARTS at the opening allowance — those tiles were given, so
    // spending them is not a deficit. Without this seed the first week always looks
    // 30-40 tiles short and every grant gets the maximum top-up for the whole run.
    this.stats = {
      roadsGranted: d.startRoads,
      roadsSpent: 0,
      buildingsSpawned: 0
    };

    this.events = [];

    // --- internals ---
    this._dayT = 0;
    this._weekElapsed = 0;
    this._destById = [];
    this._colorPins = new Int32Array(COLOR_COUNT);   // unclaimed pins per colour
    this._colorTrips = new Int32Array(COLOR_COUNT);  // completed trips per colour
    this._carCool = 0;       // spacing between second-car grants
    this._terrainKnown = false;
    this._terrainVer = -1;
    this._hasObstacle = false;
    this._roundKnown = false;
    this._roundVer = -1;
    this._roundFits = false;

    // --- demand vs supply, per colour ---
    // The raw numbers the generator's house clock runs on. Sim owns them because sim
    // owns the pins and the fleet; the POLICY (what each signal is worth) lives in
    // spawn.js. Allocated once, sampled on a fixed tick, never reallocated.
    this.supply = {
      pins: this._colorPins,                          // unclaimed pins, live
      trend: new Float32Array(COLOR_COUNT),           // smoothed pins/second, signed
      cars: new Int32Array(COLOR_COUNT),
      idle: new Int32Array(COLOR_COUNT)               // parked at home, nothing to do
    };
    this._supplyT = 0;
    this._pinsWere = new Int32Array(COLOR_COUNT);

    // demand broker — built once, handed to traffic.update every frame
    this._demand = {
      claim: function (color) { return self._claim(color); },
      release: function (destId) { return self._release(destId); },
      collect: function (destId) { return self._collect(destId); }
    };

    this._planWeek();
    // Nudge the generator so week-1 opening buildings land before the first frame.
    // Harmless if the Generator already seeded them in its own constructor.
    this._spawnTick(1e-4);
    this._syncDestState(0);
    this._syncProgress();
  }

  // ==================== events ====================

  _push(ev) {
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ==================== calendar ====================

  _syncProgress() {
    const p = this.dayLength > 0 ? this._dayT / this.dayLength : 0;
    const dp = p < 0 ? 0 : (p > 1 ? 1 : p);
    this.dayProgress = Number.isFinite(dp) ? dp : 0;
    const wp = (this.dayIndex + this.dayProgress) / 7;
    this.weekProgress = Number.isFinite(wp) ? (wp > 1 ? 1 : wp) : 0;
  }

  _planWeek() {
    if (this.generator && typeof this.generator.planWeek === 'function') {
      try { this.generator.planWeek(this.week); } catch (e) { /* generator hiccup must not kill the run */ }
    }
  }

  _expand() {
    const w = this.world;
    if (!w || typeof w.expandTo !== 'function') return;
    const b = w.bounds;
    if (!b) return;
    const sb = w.startBounds || b, mb = w.maxBounds;
    if (!mb) return;
    const x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1;
    // Reveal the buildable rect from the opening rect to the full playable box over
    // REVEAL_WEEKS weeks, in step with the camera zoom — so tiles become playable as
    // they come on screen. This runs EVERY frame (not once a week): `p` is continuous
    // (week + weekProgress), and expandTo is grow-only and no-ops until a whole new
    // tile band is crossed, so the cost is a cheap check most frames and a reveal only
    // when a ring actually appears. p = 1 at the end of week 7 → the whole map is
    // buildable. Rounded OUTWARD; expandTo only ever grows, so it is safe.
    let p = ((this.week - 1) + (+this.weekProgress || 0)) / REVEAL_WEEKS;
    p = p < 0 ? 0 : (p > 1 ? 1 : p);
    const tx0 = Math.floor(sb.x0 + (mb.x0 - sb.x0) * p);
    const ty0 = Math.floor(sb.y0 + (mb.y0 - sb.y0) * p);
    const tx1 = Math.ceil(sb.x1 + (mb.x1 - sb.x1) * p);
    const ty1 = Math.ceil(sb.y1 + (mb.y1 - sb.y1) * p);
    let nb = null;
    try { nb = w.expandTo(tx0, ty0, tx1, ty1); } catch (e) { return; }
    if (!nb) nb = w.bounds;
    if (!nb) return;
    if (nb.x0 === x0 && nb.y0 === y0 && nb.x1 === x1 && nb.y1 === y1) return; // nothing new revealed
    this._terrainVer = -1;
    this._roundVer = -1;
    this._push({ type: 'expand', bounds: { x0: nb.x0, y0: nb.y0, x1: nb.x1, y1: nb.y1 } });
  }

  // Returns true if the frame should stop here (a reward choice opened).
  _advanceTime(dt) {
    this._dayT += dt;
    this._weekElapsed += dt;
    let guard = 0;
    while (this._dayT >= this.dayLength && guard++ < 8) {
      this._dayT -= this.dayLength;
      if (this.dayIndex >= SUNDAY) {
        // Sunday finished: a brand new week begins on Monday 00:00
        this.dayIndex = 0;
        this.dayLabel = DAY_NAMES[0];
        this.week++;
        this.day = absDay(this.week, this.dayIndex);
        this._weekElapsed = this._dayT;
        this._push({ type: 'day', dayIndex: 0, dayLabel: DAY_NAMES[0] });
        this._push({ type: 'week', week: this.week });
        this._planWeek();   // the bounds reveal is continuous now — see _expand(), called every frame
      } else {
        this.dayIndex++;
        this.day = absDay(this.week, this.dayIndex);
        this.dayLabel = DAY_NAMES[this.dayIndex];
        this._push({ type: 'day', dayIndex: this.dayIndex, dayLabel: this.dayLabel });
        if (this.dayIndex === SUNDAY) {
          this._openChoice();
          this._syncProgress();
          return true;
        }
      }
    }
    this._syncProgress();
    return false;
  }

  // ==================== destinations: pins + countdown ====================

  _initDest(d) {
    d.pins = 0;
    d.claimed = 0;
    d.timer = null;
    d._shape = d.shape === 'circle' ? 'circle' : 'square';
    d.cap = d._shape === 'circle' ? this.capCircle : this.capSquare;
    d._timerPool = { left: 0, total: this.countdown };  // pooled: no per-frame alloc
    d._jit = 0.85 + this._rnd() * 0.3;                  // desync so dests never pulse together
    d._t = this._rnd() * 1.5;
    this._rollNext(d);
    const id = d.id | 0;
    if (id >= 0 && id < MAX_DEST_ID) this._destById[id] = d;
  }

  // Squares tick like a metronome. Circles are faster AND volatile: mostly quick
  // bursts with occasional lulls, mean interval ~= intervalCircle.
  // DEMAND RISES: the base interval is scaled by the day's demand multiplier. Before
  // this, per-office demand was frozen at its week-1 value forever, so all growth came
  // from the COUNT of offices, which stops when colours run out. Measured consequence:
  // demand only overtook throughput around week 19-20 (~21 min) on Normal and NEVER on
  // Easy. This is the fix for "the game is far too easy".
  _rollNext(d) {
    let n;
    if (d._shape === 'circle') {
      const base = this.intervalCircle * d._jit;
      n = (this._rnd() < 0.6)
        ? base * (0.15 + this._rnd() * 0.35)   // burst
        : base * (1.4 + this._rnd() * 1.2);    // lull
    } else {
      n = this.intervalSquare * d._jit;
    }
    // Apply the day's demand scale: 1.0 on day 1 (nothing changes), 0.6 by day 10.
    // A double office's half starts at 1.2 (slightly slower), falling to 0.8 by day 10.
    const scale = intervalScale(d._shape, !!d.isHalf, this.day);
    n *= scale;
    n /= PIN_RATE;                          // global rate throttle (0.8 => longer interval => fewer pins)
    d._next = (n > 0.08) ? n : 0.08;
  }

  _findDest(id) {
    const i = id | 0;
    if (i >= 0 && i < MAX_DEST_ID) {
      const d = this._destById[i];
      if (d && d.id === id) return d;
    }
    const dests = this.world.dests;
    if (!dests) return null;
    for (let k = 0; k < dests.length; k++) if (dests[k].id === id) return dests[k];
    return null;
  }

  _startTimer(d) {
    const t = d._timerPool;
    t.total = this.countdown;
    t.left = this.countdown;
    d.timer = t;
    // Use centre of d.half for a double office, d.x/d.y for a single office.
    const px = d.half ? d.half.x + d.half.w / 2 : d.x;
    const py = d.half ? d.half.y + d.half.h / 2 : d.y;
    this._push({ type: 'timerStart', destId: d.id, x: px, y: py });
  }

  _endTimer(d) {
    d.timer = null;
    d._timerPool.left = 0;
    const px = d.half ? d.half.x + d.half.w / 2 : d.x;
    const py = d.half ? d.half.y + d.half.h / 2 : d.y;
    this._push({ type: 'timerEnd', destId: d.id, x: px, y: py });
  }

  _lose(d) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.lostDestId = d.id;
    this.pressure = 1;
    if (d.timer) d.timer.left = 0;
    const px = d.half ? d.half.x + d.half.w / 2 : d.x;
    const py = d.half ? d.half.y + d.half.h / 2 : d.y;
    this._push({ type: 'gameover', destId: d.id, x: px, y: py });
  }

  // One pass over destinations: lazy init, shape upgrades, pin generation,
  // countdown depletion, pressure, and the per-colour unclaimed-pin tally.
  _syncDestState(dt) {
    const dests = this.world.dests;
    const pins = this._colorPins;
    pins.fill(0);
    let worst = 0;
    if (!dests || dests.length === 0) { this.pressure = 0; return; }

    for (let i = 0; i < dests.length; i++) {
      const d = dests[i];
      if (d.cap === undefined || d._timerPool === undefined) this._initDest(d);

      // square -> circle upgrade (detected from World state, whoever flipped it)
      const shape = d.shape === 'circle' ? 'circle' : 'square';
      if (shape !== d._shape) {
        d._shape = shape;
        d.cap = shape === 'circle' ? this.capCircle : this.capSquare;
        this._rollNext(d);
        const px = d.half ? d.half.x + d.half.w / 2 : d.x;
        const py = d.half ? d.half.y + d.half.h / 2 : d.y;
        this._push({ type: 'upgrade', destId: d.id, x: px, y: py });
      }

      if (dt > 0) {
        d._t += dt;
        if (d._t >= d._next) {
          d._t -= d._next;
          if (d._t > d._next * 4) d._t = 0;   // never bank a huge backlog
          this._rollNext(d);
          if (d.pins < PIN_HARD_CAP) {
            d.pins++;
            const px = d.half ? d.half.x + d.half.w / 2 : d.x;
            const py = d.half ? d.half.y + d.half.h / 2 : d.y;
            this._push({ type: 'pin', destId: d.id, x: px, y: py, color: d.color });
          }
        }
      }

      // the countdown: it exists only while pins >= cap
      if (d.pins >= d.cap) {
        if (!d.timer) this._startTimer(d);
        else if (dt > 0) {
          d.timer.left -= dt;
          if (!(d.timer.left > 0)) {
            d.timer.left = 0;
            this._lose(d);
            return;
          }
        }
      } else if (d.timer) {
        this._endTimer(d);
      }

      if (d.claimed > d.pins) d.claimed = d.pins;
      if (d.claimed < 0) d.claimed = 0;

      if (d.timer && d.timer.total > 0) {
        const used = 1 - d.timer.left / d.timer.total;
        if (used > worst) worst = used;
      }
      const c = d.color | 0;
      if (c >= 0 && c < pins.length) {
        const free = d.pins - d.claimed;
        if (free > 0) pins[c] += free;
      }
    }
    this.pressure = worst < 0 ? 0 : (worst > 1 ? 1 : worst);
  }

  // ==================== demand broker ====================

  // Pick the neediest destination of `color` that still has an unclaimed pin.
  // Active countdowns win; among equals the longest queue wins.
  _claim(color) {
    const dests = this.world.dests;
    if (!dests || dests.length === 0) return -1;
    const c = color | 0;
    let best = null, bestScore = -1;
    for (let i = 0; i < dests.length; i++) {
      const d = dests[i];
      if ((d.color | 0) !== c) continue;
      if (d.cap === undefined) continue;
      const free = d.pins - d.claimed;
      if (free <= 0) continue;
      let score = free;
      if (d.timer && d.timer.total > 0) {
        score += 1000 + (1 - d.timer.left / d.timer.total) * 100;
      }
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (!best) return -1;
    best.claimed++;
    return best.id;
  }

  _release(destId) {
    const d = this._findDest(destId);
    if (!d) return false;
    if (d.claimed > 0) d.claimed--;
    else d.claimed = 0;
    return true;
  }

  _collect(destId) {
    const d = this._findDest(destId);
    if (!d || d.cap === undefined) return false;
    // the arriving car always gives its reservation back, pin or no pin
    if (d.claimed > 0) d.claimed--;
    if (d.pins <= 0) return false;

    d.pins--;
    if (d.claimed > d.pins) d.claimed = d.pins;
    this.score++;
    const c = d.color | 0;
    if (c >= 0 && c < this._colorTrips.length) this._colorTrips[c]++;

    // collecting under a live countdown buys time back
    if (d.timer && d.timer.total > 0) {
      const back = d.timer.total * REFUND_FRACTION;
      let left = d.timer.left + back;
      if (left > d.timer.total) left = d.timer.total;
      d.timer.left = left;
    }

    const px = d.half ? d.half.x + d.half.w / 2 : d.x;
    const py = d.half ? d.half.y + d.half.h / 2 : d.y;
    this._push({ type: 'collect', destId: d.id, x: px, y: py, color: d.color });
    this._push({ type: 'trip', x: px, y: py, color: d.color, score: this.score });

    if (d.pins < d.cap && d.timer) this._endTimer(d);
    return true;
  }

  // ==================== spawning + cars ====================

  /**
   * Sample the per-colour demand-vs-supply numbers the house clock runs on.
   *
   * On a FIXED tick, not every frame, for two reasons: a slope measured over one
   * 60fps frame is a single pin appearing and disappearing (pure noise), and the
   * fleet walk is O(cars) which the tablet should not pay 60 times a second.
   *
   * The slope is an exponential moving average with a time constant, so it is
   * frame-rate independent and does not spike on one collected pin. The idle count
   * is deliberately NOT smoothed: the house clock integrates over in-game DAYS, so
   * the integration is the smoothing, and a second EMA would only add lag.
   */
  _sampleSupply(dt) {
    this._supplyT += dt;
    if (this._supplyT < SUPPLY_INTERVAL) return;
    const st = this._supplyT;
    this._supplyT = 0;
    const s = this.supply;
    const pins = this._colorPins;          // s.pins IS this array; already up to date
    const k = 1 - Math.exp(-st / SUPPLY_TAU);
    for (let c = 0; c < COLOR_COUNT; c++) {
      const rate = (pins[c] - this._pinsWere[c]) / st;
      s.trend[c] += (rate - s.trend[c]) * k;
      this._pinsWere[c] = pins[c];
      s.cars[c] = 0;
      s.idle[c] = 0;
    }
    const cars = this.traffic && this.traffic.cars;
    if (!cars) return;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car) continue;
      const c = car.color | 0;
      if (c < 0 || c >= COLOR_COUNT) continue;
      s.cars[c]++;
      // "Sitting in a driveway": home, at rest, and not carrying anything. This is
      // the only brake on the house rate, so it has to mean genuinely spare
      // capacity — a car mid-trip or waiting in a queue is doing its job.
      if (car.state === 'idle' && car.atHome) s.idle[c]++;
    }
  }

  _spawnTick(dt) {
    const g = this.generator;
    if (!g || typeof g.update !== 'function') return;
    let out = null;
    try { out = g.update(dt, this._weekElapsed, this.day, this.supply); } catch (e) { return; }
    if (!out || !out.length) return;
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      if (!s) continue;
      if (s.kind === 'upgrade') {
        // apply it if the generator only *reported* the intent; the dest pass
        // detects the shape change and emits the 'upgrade' event.
        const d = this._findDest(s.id);
        if (d && d.shape !== 'circle' && typeof this.world.upgradeDest === 'function') {
          try { this.world.upgradeDest(s.id); } catch (e) { /* ignore */ }
        }
        continue;
      }
      if (s.kind === 'house' || s.kind === 'dest') {
        this._push({ type: 'spawn', kind: s.kind, x: s.x, y: s.y, color: s.color });
        this.stats.buildingsSpawned++;
      }
    }
  }

  _fleetSize() {
    const cars = this.traffic && this.traffic.cars;
    return cars ? cars.length : 0;
  }

  _grantCar(h, have) {
    if (this._fleetSize() >= FLEET_CAP) { h._carT = 5; return false; }
    let car = null;
    try { car = this.traffic.spawnCar(h); } catch (e) { car = null; }
    if (!car) { h._carT = 2.5; return false; }
    h._granted = have + 1;
    if ((h.cars | 0) <= have) h.cars = have + 1;   // idempotent whoever counted
    this._carCool = 2.5;
    this._push({ type: 'carAdded', houseId: h.id, x: h.x, y: h.y });
    return true;
  }

  // Cars come from houses (max 2 each). First car arrives shortly after the house
  // does; the second has to be earned by the colour actually running trips while
  // pins pile up. There is no "extra car" reward — that was removed deliberately.
  _tickHouses(dt) {
    const houses = this.world.houses;
    if (!houses || houses.length === 0) return;
    if (this._carCool > 0) this._carCool -= dt;

    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      if (h._carT === undefined) {
        h._carT = 1.0 + this._rnd() * 1.5;
        h._granted = 0;
        h._age = 0;
      }
      h._age += dt;
      const max = (h.maxCars | 0) > 0 ? (h.maxCars | 0) : 2;
      const have = Math.max(h.cars | 0, h._granted | 0);
      if (have >= max) continue;
      if (h._carT > 0) { h._carT -= dt; continue; }

      if (have === 0) {
        this._grantCar(h, 0);
        continue;
      }
      // second car: demand has to justify it, and it must not eat the headroom a
      // newly spawned house needs for its FIRST car
      if (this._carCool > 0) continue;
      if (this._fleetSize() >= FLEET_CAP * 0.75) { h._carT = 4; continue; }
      const c = h.color | 0;
      const trips = (c >= 0 && c < this._colorTrips.length) ? this._colorTrips[c] : 0;
      const waiting = (c >= 0 && c < this._colorPins.length) ? this._colorPins[c] : 0;
      if (h._age > 18 && trips >= 3 && waiting >= 2) this._grantCar(h, have);
      else h._carT = 2.0;
    }
  }

  // ==================== player actions ====================

  // `deny` fires ONLY when the move was legal and the wallet was empty. Terrain,
  // buildings, an existing edge and a scissoring diagonal are all silent falses —
  // buzzing at those made drawing a junction feel broken in v1.
  _deny(x, y, dir, reason) {
    this._push({ type: 'deny', x: x | 0, y: y | 0, dir: dir === undefined ? -1 : (dir | 0), reason });
  }

  tryRoad(x, y, dir) {
    if (this.gameOver || this.pendingChoice) return false;
    const w = this.world;
    const px = x | 0, py = y | 0, pd = dir | 0;
    let reason;
    try { reason = w.canAddEdge(px, py, pd); } catch (e) { return false; }
    if (!okReason(reason)) return false;                       // silent: not a legal move
    // A house's single DRIVE is FREE and does not touch the wallet. Laying a new one
    // in a different direction replaces the old (which ghosts if a car still needs it,
    // exactly like an erase behind a moving car). Everything else costs one road tile.
    const free = (typeof w.touchesHouse === 'function') && w.touchesHouse(px, py, pd);
    if (free) {
      if (typeof w.clearHouseDrivesExcept === 'function') w.clearHouseDrivesExcept(px, py, pd);
    } else if (this.inventory.roads <= 0) {
      // A dying edge (erased, still carrying its cars) bills like any other tile: the
      // erase already refunded, so the wallet is square and the player never has to
      // reason about which roads are "still theirs".
      this._deny(px, py, pd, 'roads'); return false;
    }
    try { w.addEdge(px, py, pd); } catch (e) { return false; }   // revives a dying edge
    let live = true;
    if (typeof w.hasEdge === 'function') {
      try { live = !!w.hasEdge(px, py, pd); } catch (e) { live = true; }
    }
    if (!live) return false;                                    // world refused after all
    if (!free) { this.inventory.roads--; this.stats.roadsSpent++; }
    this._push({ type: 'road', x: px, y: py, dir: pd });
    return true;
  }

  /**
   * Erase is free and ALWAYS refunds the tile immediately, whether or not cars are
   * on it. An edge that any car still NEEDS does not vanish — it becomes a "ghost":
   * deleted as far as everyone else is concerned (unroutable, unenterable) but still
   * drawn, and still drivable by the cars that remember driving it, because it is
   * their way home. It leaves the map when the last of them has driven back along it
   * or otherwise got home. That is the ghost's ONLY job: no car stranded by an erase.
   *
   * The refund used to be deferred until the edge died. That made the wallet behave
   * differently depending on traffic the player cannot see — and now that a ghost can
   * outlive a whole round trip, deferring it would be indefensible.
   * @returns {false|'removed'|'ghost'} 'ghost' = refunded, still on screen for now
   */
  tryErase(x, y, dir) {
    if (this.gameOver || this.pendingChoice) return false;
    const px = x | 0, py = y | 0, pd = dir | 0;
    // A house drive was free to lay, so erasing it must NOT refund a road tile — else
    // draw-drive / erase-drive would farm the wallet.
    const free = (typeof this.world.touchesHouse === 'function') && this.world.touchesHouse(px, py, pd);
    let r;
    try { r = this.world.removeEdge(px, py, pd); } catch (e) { return false; }
    if (r !== 'removed' && r !== 'ghost') return false;
    if (!free) {
      this.inventory.roads++;
      // An erase refunds the tile, so it un-spends it too. Without this a player who
      // fidgets — draw, erase, redraw — farms a permanent top-up out of the tally.
      if (this.stats.roadsSpent > 0) this.stats.roadsSpent--;
    }
    if (r === 'removed') {
      this._push({ type: 'erase', x: px, y: py, dir: pd });
      return 'removed';
    }
    // The road is still visible, so the wallet ping is the only feedback that the
    // erase landed — hence 'refund' as well as the ghost flash (a free drive skips
    // the refund, since nothing was returned to the wallet).
    this._push({ type: 'ghost', x: px, y: py, dir: pd });
    if (!free) this._push({ type: 'refund', x: px, y: py, dir: pd });
    return 'ghost';
  }

  /**
   * Erase the infrastructure sitting on a tile and put the item back in the
   * wallet. Infrastructure is layered OVER the road, so this leaves the edges
   * underneath alone — the shell tries this first and falls back to erasing road.
   * @returns {false|'lights'|'motorway'|'bridge'|'roundabout'} what was removed
   */
  tryEraseInfra(x, y) {
    if (this.gameOver || this.pendingChoice) return false;
    const w = this.world;
    if (typeof w.infraAt !== 'function') return false;
    let hit = null;
    try { hit = w.infraAt(x | 0, y | 0); } catch (e) { return false; }
    if (!hit || !hit.obj) return false;
    const fn = UNBUILD[hit.kind];
    if (!fn || typeof w[fn] !== 'function') return false;
    let gone = false;
    try { gone = !!w[fn](hit.obj); } catch (e) { return false; }
    if (!gone) return false;
    // `kind` doubles as the inventory key, so the refund needs no mapping.
    this.inventory[hit.kind] = (this.inventory[hit.kind] | 0) + 1;
    this._push({
      type: 'uninfra',
      kind: hit.kind === 'bridge' ? (this.terrain === 'mountain' ? 'tunnel' : 'bridge') : hit.kind,
      x: x | 0, y: y | 0
    });
    return hit.kind;
  }

  // Shared shape for the four infrastructure placements. `listName` lets us confirm
  // success from World state instead of trusting an undocumented return value.
  _tryInfra(kind, invKey, listName, checkFn, addFn, args, x, y) {
    if (this.gameOver || this.pendingChoice) return false;
    const w = this.world;
    if (typeof w[checkFn] !== 'function' || typeof w[addFn] !== 'function') return false;
    let reason;
    try { reason = w[checkFn].apply(w, args); } catch (e) { return false; }
    if (!okReason(reason)) return false;                       // silent
    if ((this.inventory[invKey] | 0) <= 0) { this._deny(x, y, -1, invKey); return false; }
    const list = w[listName];
    const before = list ? list.length : -1;
    try { w[addFn].apply(w, args); } catch (e) { return false; }
    const after = w[listName] ? w[listName].length : -1;
    if (before >= 0 && after >= 0 && after <= before) return false;   // nothing was added
    this.inventory[invKey]--;
    this._push({ type: 'infra', kind, x: x | 0, y: y | 0 });
    return true;
  }

  tryMotorway(ax, ay, bx, by) {
    return this._tryInfra('motorway', 'motorway', 'motorways', 'canAddMotorway', 'addMotorway',
      [ax | 0, ay | 0, bx | 0, by | 0], ax, ay);
  }

  tryRoundabout(cx, cy) {
    return this._tryInfra('roundabout', 'roundabout', 'roundabouts', 'canAddRoundabout', 'addRoundabout',
      [cx | 0, cy | 0], cx, cy);
  }

  tryLight(x, y) {
    return this._tryInfra('lights', 'lights', 'lights', 'canAddLight', 'addLight',
      [x | 0, y | 0], x, y);
  }

  tryBridge(ax, ay, bx, by) {
    return this._tryInfra(this.terrain === 'mountain' ? 'tunnel' : 'bridge', 'bridge', 'bridges',
      'canAddBridge', 'addBridge', [ax | 0, ay | 0, bx | 0, by | 0], ax, ay);
  }

  // ==================== Sunday reward ====================

  // Is there any water/mountain inside the playable rect? No obstacle -> never
  // offer a bridge/tunnel the player cannot use.
  _mapHasObstacle() {
    const w = this.world;
    if (!w || typeof w.tileAt !== 'function' || !w.bounds) return false;
    if (this._terrainVer === w.version && this._terrainKnown) return this._hasObstacle;
    const b = w.bounds;
    let found = false;
    for (let y = b.y0; y <= b.y1 && !found; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const t = w.tileAt(x, y);
        if (t === TILE_WATER || t === TILE_MOUNTAIN) { found = true; break; }
      }
    }
    this._hasObstacle = found;
    this._terrainKnown = true;
    this._terrainVer = w.version;
    return found;
  }

  // Is there ANYWHERE a roundabout would currently go? Same rule as the bridge gate
  // above, and it matters more: a roundabout eats a 3x3 block clear of buildings,
  // terrain, gates and other infrastructure, AND wants three roads entering it. The
  // playable rect starts at 11x8 with two offices, several houses and some water in
  // it, so in week one there is often not one legal tile on the whole map — and the
  // roundabout was in the very first Sunday pool. Taking that card cost the player a
  // week's reward for an item they could never put down.
  _roundaboutFits() {
    const w = this.world;
    if (!w || typeof w.canAddRoundabout !== 'function' || !w.bounds) return false;
    if (this._roundVer === w.version && this._roundKnown) return this._roundFits;
    const b = w.bounds;
    let found = false;
    for (let y = b.y0; y <= b.y1 && !found; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        let r;
        try { r = w.canAddRoundabout(x, y); } catch (e) { r = 1; }
        if (r === 0) { found = true; break; }
      }
    }
    this._roundFits = found;
    this._roundKnown = true;
    this._roundVer = w.version;
    return found;
  }

  // Fresh objects every week: cheap (twice per week) and the shell can safely hold
  // on to a card while it animates without it mutating under its feet.
  _makeOption(item, roads) {
    const opt = { roads: roads, item: item, count: 0, label: '', icon: '', desc: '' };
    if (item === null) {
      opt.count = 0;
      opt.label = 'Road Bonanza';
      opt.icon = '🛣️';
      opt.desc = '+' + roads + ' road tiles';
      return opt;
    }
    if (item === 'lights') {
      opt.count = 2;
      opt.label = 'Traffic Lights';
      opt.icon = '🚦';
    } else if (item === 'motorway') {
      opt.count = 1;
      opt.label = 'Motorway';
      opt.icon = '🛤️';
    } else if (item === 'roundabout') {
      opt.count = 1;
      opt.label = 'Roundabout';
      opt.icon = '🔄';
    } else if (item === 'tunnel') {
      opt.count = 1;
      opt.label = 'Tunnel';
      opt.icon = '🚇';
    } else {
      opt.count = 1;
      opt.label = 'Bridge';
      opt.icon = '🌉';
    }
    const plural = opt.count > 1 ? (opt.count + ' ' + opt.label.toLowerCase()) : ('a ' + opt.label.toLowerCase());
    opt.desc = '+' + roads + ' roads & ' + plural;
    return opt;
  }

  // Two options, always. Every option carries a baseline road batch; sometimes one
  // of the two is a big raw batch with no item at all.
  _rollOptions() {
    const base = this.weeklyRoads;
    const big = Math.round(base * 1.8);   // down from 2.2
    const pool = ['motorway'];
    if (this._mapHasObstacle()) pool.push(this.terrain === 'mountain' ? 'tunnel' : 'bridge');

    // pick two distinct items
    let a = pool[(this._rnd() * pool.length) | 0];
    let b = a;
    let guard = 0;
    while (b === a && guard++ < 24) b = pool[(this._rnd() * pool.length) | 0];

    const optA = this._makeOption(a, base);
    // occasionally the second card is a big raw road batch instead of an item
    const optB = (this._rnd() < 0.22 || b === a)
      ? this._makeOption(null, big)
      : this._makeOption(b, base);

    return (this._rnd() < 0.5) ? [optB, optA] : [optA, optB];
  }

  _openChoice() {
    this.pendingChoice = { week: this.week, options: this._rollOptions() };
  }

  choose(index) {
    const pc = this.pendingChoice;
    if (!pc) return false;
    const opts = pc.options;
    this.pendingChoice = null;
    if (!opts || !opts.length) return false;
    let i = index | 0;
    if (i < 0) i = 0;
    if (i >= opts.length) i = opts.length - 1;
    const opt = opts[i];
    if (!opt) return false;

    let roads = num(opt.roads, 0) | 0;
    // Sparse-grant top-up: if the player is consuming roads faster than they're granted,
    // add up to +6 tiles. Formula: for every 10 roads in deficit, add 1 road (max +6).
    // Normal base is 10, so 10..16; Easy base is 20, so 20..26 (never back to 30).
    const deficit = this.stats.roadsSpent - this.stats.roadsGranted;
    const topUp = (deficit > 0) ? Math.min(6, Math.floor(deficit / 10)) : 0;
    roads += topUp;

    this.inventory.roads += roads;
    this.stats.roadsGranted += roads;

    const count = num(opt.count, 0) | 0;
    if (opt.item === 'motorway') this.inventory.motorway += count;
    else if (opt.item === 'roundabout') this.inventory.roundabout += count;
    else if (opt.item === 'lights') this.inventory.lights += count;
    else if (opt.item === 'bridge' || opt.item === 'tunnel') this.inventory.bridge += count;
    return true;
  }

  // ==================== update ====================

  update(dt) {
    if (this.gameOver || this.pendingChoice) return;   // strict no-op
    let step = +dt;
    if (!(step > 0)) return;                           // NaN / null / undefined / 0 / negative
    if (step > DT_MAX) step = DT_MAX;                  // also catches Infinity

    if (this._advanceTime(step)) return;               // a reward choice opened

    this._expand();                                    // continuously reveal newly-uncovered tiles
    this._spawnTick(step);
    this._syncDestState(step);
    if (this.gameOver) return;

    // After _syncDestState, because that is what refills _colorPins — sampling
    // before it would read the queue one frame stale. The generator therefore
    // acts on the previous sample, which on a 0.5s tick is not worth caring about.
    this._sampleSupply(step);

    if (this.traffic && typeof this.traffic.update === 'function') {
      this.traffic.update(step, this._demand);
    }
    this._tickHouses(step);
  }
}

export default Sim;
