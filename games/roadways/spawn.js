// Roadways v2.7 — the procedural generator.
//
// Owns WHEN and WHERE new buildings appear: irregular spawn times across the
// seven days of a week, house/destination placement with connection points and
// buffers, gradual colour introduction, and square -> circle destination upgrades.
//
// An OFFICE is an anatomy: the building proper (B), a DRIVEWAY (D — footprint
// tiles cars may drive through but road may not terminate on), and CONNECTION
// POINTS (C — the ONLY tiles a road may join, outside the footprint, open land).
// There are 12 variants (single 2x3, 3x2, and DOUBLE 3x4/4x3 offices that serve
// two colours at once) in net.js's OFFICE_VARIANTS table. A double office is
// legal from absolute day 5 onwards and only when two colours need a destination.
//
// A HOUSE is still simple: its one tile is its own gate and door.
//
// HOUSE SPAWN ANCHORS: each colour gets 4 anchor points SPREAD across the whole map
// (picked up front by farthest-point sampling against all anchors so far — its own
// AND other colours', the latter weighted weaker — so a colour doesn't clump and
// different colours don't share an area; fixed for the run). When spawning a house, we try
// anchors that are visible, sample tiles 0..5 tiles away, and fall back to the
// full random search only when that fails. This makes neighbourhoods form — the
// same four places per colour all run long, new anchors only come into play as
// the bounds expand, so the city genuinely sprawls instead of clustering every
// house ~6 tiles from its destination forever (which was measured: trip lengths
// 4.55s in week 1 to 5.12s in week 7 while the map area grew 5.2x).
//
// HOUSE FLOOR: every colour must have at least as many houses as `colorNeed` from
// demand.js says (the sum of its offices' ratings, which rise over the first ten
// days). This is checked every ~0.5s and shortfalls are made up with pinned
// 'chouse' entries, so the player is never asked for throughput the map cannot
// physically supply.
//
// ---------------------------------------------------------------------------
// DEMAND vs SUPPLY — the house rate, per colour (v2.8)
// ---------------------------------------------------------------------------
// Houses are NOT scheduled by the week any more. Each unlocked colour runs its own
// clock, and the clock's SPEED is that colour's demand-vs-supply ratio:
//
//   the pin queue is RISING       -> that colour's cars cannot keep up -> speed up
//   the pin queue is already deep -> same conclusion, from the level not the slope
//   cars sitting IDLE in driveways -> that colour is over-supplied     -> slow down
//
// Both the slope and the level are measured PER OFFICE of that colour, so a colour
// with four offices is not judged as if one building were drowning. `sim` samples
// the raw numbers (it owns the pins and the traffic) and hands them over in
// `update`'s `supply` argument; the POLICY — how much each signal is worth — lives
// here, because this is the module that owns when things spawn.
//
// The clock reads in NEUTRAL DAYS: speed warps dt rather than the interval, so
// HOUSE_DAYS stays the honest "how often at equilibrium" number.
//
// ---------------------------------------------------------------------------
// OFFICES — one every 3-5 days
// ---------------------------------------------------------------------------
// One office clock, independent of the week. Every OFFICE_DAYS_MIN..MAX in-game days
// it fires an office. WHICH colour: while the run holds fewer colours than the date's
// cap (`_colorCap` — one more colour per week, up to MAX_COLORS), it introduces the
// next NEW colour (ignoring the density ceiling because introducing the colour is the
// point); once that cap is reached it hands RELIEF to a RANDOM existing colour (`_pickDestColor`),
// capped by the office density ceiling so a mature board paces to the room it has. Either
// way the office may never open with no houses of its colour: the 'intro' and 'dest'
// entries check EVERY colour the new building serves — a double office serves two —
// and pin a retrying 'chouse' for any that has none.
//
// DOM-free: no window/document/canvas/audio/localStorage in here.
//
// ---------------------------------------------------------------------------
// SHAPE OF A WEEK
// ---------------------------------------------------------------------------
// `planWeek(week)` builds a small list of plan entries, each with a time in
// SECONDS from the start of the week. It is now a THIN week: the opening board and
// the weekly square->circle upgrade roll. Houses and offices come from their own
// clocks (above), which do not reset at the week boundary — a rate that restarted
// every Monday would undo the whole feedback loop.
//
// `update(dt, weekElapsed, day)` fires everything that is due (`day` is the
// absolute 1-based day, which the demand curve needs). If a spawn has no
// legal tile it is RESCHEDULED a couple of seconds later, never retried in a
// loop and never thrown — and every placement search is bounded, so a full map
// costs a bounded scan and then gives up.
//
// A brand new colour always arrives as a DESTINATION PLUS at least one matching
// HOUSE (plan kind 'intro'). If the house cannot be placed in the same instant,
// a dedicated pinned-colour house entry ('chouse') keeps retrying, so the
// invariant holds even on a cramped map.
//
// ---------------------------------------------------------------------------
// PERF (tablet target)
// ---------------------------------------------------------------------------
// `update` is called every frame but does no work beyond scanning <= ~16 plan
// entries, and returns a shared empty array when nothing spawned, so the common
// frame allocates nothing. Placement searches are random-sampled first (cheap,
// well distributed) and only fall back to a full bounds scan when sampling
// fails, which is the nearly-full-map case. Candidate records come from a pool.
// NO PERF NUMBER IN THIS FILE WAS MEASURED ON THE TABLET.

import { COLORS, DX, DY, T_EMPTY, R_OK, F_BUILD, F_GATE, makeRng, officeVariantsOfKind, officeVariant } from './net.js';
import { colorNeed } from './demand.js';

const DIFF = {
  easy: {
    dayLength: 12,
    tilesPerHouse: 6,     // density ceiling — a SAFETY NET, not the rate (see below)
    houseDays: 2.8        // equilibrium cadence of ONE colour's house clock, in days
  },
  normal: {
    dayLength: 9,
    tilesPerHouse: 5,
    houseDays: 3.2
  }
};
// tilesPerHouse was 11/13 under the weekly schedule and had to come down, because
// measured it was the thing setting the house rate, not the clock: with the feedback
// loop pinned at SPEED_MAX the board produced 16 houses in 21 days, and pinned at
// SPEED_MIN it produced 15. The ceiling was answering, not the demand signal. At 5 a
// drowning colour can actually be relieved (the clock wants ~2 houses/day against a
// 47-house ceiling by week 4), and the real backstops are the ones that mean
// something: sim's FLEET_CAP for the tablet, and losing the run for the player.
// Easy and Normal share the 3-5 day office cadence deliberately: Easy's day is 12s
// against Normal's 9s, so the same number of days is already a third more real time
// to wire the new office up.

const START_COLORS = 1;          // the run opens on ONE office and its houses; more colours arrive on the clock
const MAX_COLORS = 5;            // the run tops out at 5 colours (of the 8 defined); the office clock introduces them one per firing, then relieves existing colours
const MIN_GAP = 0.9;              // seconds between two scheduled spawns

// --- the per-colour house clock (see DEMAND vs SUPPLY above) ---
// The equilibrium cadence itself is per difficulty (DIFF.houseDays); everything
// below is the shape of the feedback loop and is shared.
const HOUSE_JITTER = 0.4;         // +-20% so two colours never lock into step
const OVERSPAWN = 1.25;           // target ~25% MORE houses than raw demand needs, then hold
                                  // (eventually consistent): the house clock fills to this and
                                  // stops placing, instead of trickling on to the density ceiling.
const SPEED_MIN = 0.35;           // heavily over-supplied: ~9 days per house
const SPEED_MAX = 3.0;            // drowning: ~1 day per house
const TREND_UP = 1.4;             // weight on "the queue is growing"
const LEVEL_UP = 0.6;             // weight on "the queue is already deep"
const IDLE_DOWN = 0.7;            // weight on "cars are parked doing nothing"
const TREND_REF = 0.10;           // pins/second/office that counts as full-tilt growth.
                                  // A day-1 square emits ~1 pin per 6s = 0.17/s, so
                                  // 0.10 is "losing badly", not "losing slightly".
const BACKLOG_REF = 4;            // unclaimed pins per office that counts as deep

// --- the office clock ---
const OFFICE_DAYS_MIN = 3;        // an office every 3-5 in-game days
const OFFICE_DAYS_MAX = 5;
const OFFICE_LAST_WEEK = 14;      // after this week no more offices spawn — the demand ramp is
                                  // done, so only houses spawn from here (to serve what exists)
const TILES_PER_OFFICE = 18;      // density ceiling for offices (a NEW COLOUR ignores it).
                                  // A safety net, not the rate. Measured over 8 seeds: at 24
                                  // it BOUND (8.7-day gaps against a clock asking for 3-5);
                                  // at 18 and at 14 the results were byte-identical, so from
                                  // 18 down the binding constraint is GEOMETRY — whether a
                                  // footprint actually fits — which is the honest limiter and
                                  // balances itself as the board grows.
const NO_ROOM_DELAY = 2.0;        // seconds before a clock that found no room looks again
const OFFICE_WAIT_HOLD = 3.0;     // in-game days the house clocks will hold station for an
                                  // office still hunting for room (see _houseClocks)
const SAMPLE_TRIES = 220;         // random probes before falling back to a full scan
const KEEP_BEST = 10;             // candidates kept from the sampling pass
const RETRY_DELAY = 1.6;
const MAX_TRIES = 6;
const MAX_TRIES_PINNED = 24;      // the colour-invariant entry tries much harder
const DOUBLE_DAY = 5;             // absolute day 5 (Friday of week 1): double offices become legal
const DOUBLE_PROB_BASE = 0.30;    // chance of ATTEMPTING a double once it is legal
const DOUBLE_PROB_MAX = 0.55;     // ...rising with the day, but capped: an unbounded
                                  // ramp hits 1.0 by day 65 and every late office
                                  // becomes a double, which measured 13 doubles to
                                  // 4 singles by week 16. Doubles are a treat.
const FLOOR_CHECK_INTERVAL = 0.5; // seconds between house-floor checks

const EMPTY = [];                 // returned when nothing spawned; never mutated

export class Generator {
  /**
   * @param {import('./net.js').World} world
   * @param {object} opts { seed, difficulty, dayLength? }
   *   dayLength defaults to the difficulty table (easy 12s, normal 9s) and only
   *   needs passing if sim ever diverges from it.
   */
  constructor(world, opts) {
    const o = opts || {};
    this.world = world;
    this.difficulty = o.difficulty === 'easy' ? 'easy' : 'normal';
    const d = DIFF[this.difficulty];
    this.dayLength = Number.isFinite(o.dayLength) && o.dayLength > 0 ? o.dayLength : d.dayLength;
    this.weekLength = this.dayLength * 7;

    this.seed = (o.seed === undefined || o.seed === null || !Number.isFinite(o.seed))
      ? ((Math.random() * 0x100000000) >>> 0)
      : (o.seed >>> 0);
    this._rng = makeRng(this.seed);

    this.colorsUnlocked = 0;
    this.week = 0;
    this.day = 1;

    this._plan = [];
    this._planPool = [];
    this._t = 0;

    // reusable placement scratch
    this._cands = [];
    this._nCand = 0;
    this._candPool = [];
    this._elig = [];

    this._born = new Map();                            // destId -> week it appeared
    this._colorHouses = new Int32Array(COLORS.length);
    this._colorDests = new Int32Array(COLORS.length);

    // house floor checking
    this._floorTimer = 0;
    this._floorPending = new Uint8Array(COLORS.length);  // 1 = a floor-shortfall chouse is pending

    // the clocks. Deliberately NOT reset by planWeek: a demand-driven rate that
    // restarted every Monday would be a weekly schedule wearing a disguise.
    this._houseT = new Float32Array(COLORS.length);      // seconds of NEUTRAL time left
    this._officeT = 0;
    this._officeOut = 0;                                 // 1 while an office is outstanding
    this._officeDests = 0;                               // world.dests.length when armed
    this._officeWait = 0;                                // seconds it has been outstanding
    this._supply = null;                                 // sim's per-colour snapshot
    this._rollOffice();

    // house spawn anchors: 4 per colour, across the WHOLE grid, fixed for the run.
    // They are SPREAD OUT by farthest-point sampling against EVERY anchor placed so
    // far, across all colours — so a colour's neighbourhoods don't clump AND different
    // colours don't all land in the same area (no r/g/b on top of each other). Same-
    // colour spacing counts full; OTHER-colour spacing counts less (W_OTHER), so the
    // colours still interleave — pushed apart, not perfectly segregated.
    const MC = this.world.maxCols, MR = this.world.maxRows, tiles = this.world.tiles;
    const W_OTHER = 0.35;
    const sampleEmpty = () => {
      let ax = (this._rng() * MC) | 0, ay = (this._rng() * MR) | 0;
      for (let t = 0; t < 8; t++) {   // prefer open land, a few tries, no hard loop
        const tx = (this._rng() * MC) | 0, ty = (this._rng() * MR) | 0;
        if (tiles[ty * MC + tx] === T_EMPTY) { ax = tx; ay = ty; break; }
      }
      return { x: ax, y: ay };
    };
    const placed = [];   // every anchor chosen so far, tagged with its colour
    this._anchors = [];
    for (let c = 0; c < COLORS.length; c++) {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        let best = null, bestScore = -1;
        const tries = placed.length ? 16 : 1;   // the very first anchor is free
        for (let s = 0; s < tries; s++) {
          const cand = sampleEmpty();
          let score = Infinity;                  // distance to the NEAREST existing anchor
          for (let j = 0; j < placed.length; j++) {
            const a = placed[j];
            const dx = cand.x - a.x, dy = cand.y - a.y;
            let eff = dx * dx + dy * dy;
            if (a.c !== c) eff /= W_OTHER;        // other-colour anchors repel more weakly
            if (eff < score) score = eff;
          }
          if (score > bestScore) { bestScore = score; best = cand; }
        }
        best.c = c;
        pts.push(best);
        placed.push(best);
      }
      this._anchors.push(pts);
    }
  }

  // =========================================================================
  // planning
  // =========================================================================

  _entry(n) {
    let e = this._planPool[n];
    if (e === undefined) {
      e = { t: 0, kind: 'house', color: -1, tries: 0, done: false, maxTries: MAX_TRIES };
      this._planPool[n] = e;
    }
    return e;
  }

  _add(kind, t, color, maxTries) {
    const e = this._entry(this._plan.length);
    e.kind = kind;
    e.t = t;
    e.color = color === undefined ? -1 : color;
    e.tries = 0;
    e.done = false;
    e.maxTries = maxTries === undefined ? MAX_TRIES : maxTries;
    this._plan.push(e);
    return e;
  }

  /**
   * Choose irregular spawn times across the week's seven days.
   * @param {number} week 1-based
   * @returns {Array} the plan (live internal array — read only)
   */
  planWeek(week) {
    const w = Math.max(1, week | 0);
    this.week = w;
    this._t = 0;
    const plan = this._plan;
    plan.length = 0;
    const W = this.weekLength;

    // Clearing the plan drops any 'chouse' that had not fired yet, so the pending
    // flags have to go with it or the floor check would believe a shortfall was
    // already being handled and never re-raise it.
    this._floorPending.fill(0);

    // --- the opening board ---
    if (w <= 1 && this.colorsUnlocked < START_COLORS) {
      // One 'seed' entry at t=0, not two 'intro's: sim nudges the generator with a
      // 1e-4 tick before the first frame and expects the opening board to exist,
      // and on an 11x8 board the first house can otherwise squat the only spot
      // left for the second destination. 'seed' claims BOTH destinations first.
      this._add('seed', 0, -1, MAX_TRIES_PINNED);
    }

    // Houses and offices are NOT planned here any more — see the clocks in update().

    // --- a square destination may mature into a circle ---
    if (w >= 3 && this._rng() < 0.55) {
      this._add('upgrade', (0.15 + this._rng() * 0.78) * W, -1, 2);
    }

    plan.sort(byTime);
    // keep spawns from landing on the same instant
    for (let i = 1; i < plan.length; i++) {
      if (plan[i].t - plan[i - 1].t < MIN_GAP) plan[i].t = plan[i - 1].t + MIN_GAP;
    }
    return plan;
  }

  // =========================================================================
  // firing
  // =========================================================================

  /**
   * @param {number} dtSeconds
   * @param {number} weekElapsed seconds since the start of the current week
   * @param {number} day absolute 1-based day (Mon of week 1 = 1)
   * @param {object} [supply] sim's per-colour demand-vs-supply snapshot — typed
   *   arrays indexed by colour: `pins` (unclaimed now), `trend` (smoothed pins per
   *   second, signed), `cars`, `idle` (cars parked at home with nothing to do).
   *   Omit it and every colour is treated as neutral, so the generator still runs
   *   standalone (which is how its tests drive it).
   * @returns {Array} [{ kind:'house'|'dest'|'upgrade', id, x, y, color }] — a fresh
   *   array when something spawned, otherwise a shared empty array (do not mutate).
   */
  update(dtSeconds, weekElapsed, day, supply) {
    if (this.week === 0) this.planWeek(1);   // defensive: never require planWeek first
    let dt = dtSeconds;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.25) dt = 0.25;
    this._t += dt;
    const now = Number.isFinite(weekElapsed) ? weekElapsed : this._t;
    if (supply) this._supply = supply;

    // store the day for demand curve queries
    if (Number.isFinite(day) && day >= 1) this.day = day | 0;

    // house floor check: once every ~0.5s, verify each unlocked colour has enough
    // houses to sustain its offices, schedule a pinned chouse entry if short
    this._floorTimer += dt;
    if (this._floorTimer >= FLOOR_CHECK_INTERVAL) {
      this._floorTimer = 0;
      for (let c = 0; c < this.colorsUnlocked; c++) {
        const need = colorNeed(this.world.dests, c, this.day);
        const have = this._colorHouses[c];
        if (have < need && this._floorPending[c] === 0) {
          this._add('chouse', now + 0.8, c, MAX_TRIES_PINNED);
          this._floorPending[c] = 1;
        }
      }
    }

    let out = this._houseClocks(dt);
    out = this._officeClock(dt, now, out);

    const plan = this._plan;
    for (let i = 0; i < plan.length; i++) {
      const e = plan[i];
      if (e.done || e.t > now) continue;
      out = this._fire(e, now, out);
    }
    return out === null ? EMPTY : out;
  }

  // =========================================================================
  // the clocks
  // =========================================================================

  /**
   * How fast this colour's house clock should run, from its demand-vs-supply
   * signal. 1 is equilibrium. See DEMAND vs SUPPLY at the top of the file.
   */
  _houseSpeed(c) {
    const s = this._supply;
    if (!s) return 1;
    // Everything is judged PER OFFICE. A colour with four offices legitimately
    // holds four times the queue, and without this a mature colour would look
    // permanently desperate and spawn houses until the map was full of them.
    const per = this._colorDests[c] > 0 ? this._colorDests[c] : 1;
    const trend = (s.trend ? s.trend[c] : 0) / per;
    const backlog = (s.pins ? s.pins[c] : 0) / per;
    const cars = s.cars ? (s.cars[c] | 0) : 0;
    const idleFrac = cars > 0 ? (s.idle ? (s.idle[c] | 0) : 0) / cars : 0;
    let sp = 1
      + TREND_UP * clamp01(trend / TREND_REF)
      + LEVEL_UP * clamp01(backlog / BACKLOG_REF)
      - IDLE_DOWN * clamp01(idleFrac);
    // A shrinking queue is its own evidence of over-supply, and it is the signal
    // that arrives FIRST — before the cars have had time to sit still long enough
    // to look idle. Without it the rate only came down after the map was full.
    if (trend < 0) sp -= TREND_UP * 0.5 * clamp01(-trend / TREND_REF);
    if (!(sp > SPEED_MIN)) return SPEED_MIN;
    return sp > SPEED_MAX ? SPEED_MAX : sp;
  }

  /** Every unlocked colour with somewhere to drive to runs its own house clock. */
  _houseClocks(dt) {
    let out = null;
    if (dt <= 0) return out;
    // Houses HOLD STATION for an office that cannot find room. A house is 1x1 and an
    // office is a 6-12 tile rectangle, so an unrestrained house clock cheerfully fills
    // in every gap an office needed — measured in the browser on an unserved run, 42
    // scattered houses on a growing board pushed the first relief office out to day 21
    // against a clock asking for 3-5. Houses are DERIVED from demand; the office
    // cadence is the authored beat, so the office wins the tie.
    //
    // Bounded on purpose. An outstanding office on a genuinely full board would
    // otherwise stop houses for the rest of the run, so the hold expires after
    // OFFICE_WAIT_HOLD days and the town carries on without its workplace.
    if (this._officeOut) {
      this._officeWait += dt;
      if (this._officeWait < OFFICE_WAIT_HOLD * this.dayLength) return out;
    }
    const budget = this._houseBudget();
    for (let c = 0; c < this.colorsUnlocked; c++) {
      // A colour with no office gets no houses: a car with nowhere to drive is dead
      // weight the player still has to route around.
      if (this._colorDests[c] <= 0) { this._houseT[c] = 0; continue; }
      // Speed warps TIME, not the interval, so HOUSE_DAYS stays readable as the
      // equilibrium cadence and a colour that flips between fast and slow mid-wait
      // keeps the progress it had already made.
      const speed = this._houseSpeed(c);
      this._houseT[c] -= dt * speed;
      if (this._houseT[c] > 0) continue;
      this._rollHouse(c);
      // The ~25% overspawn target is where a colour that is KEEPING UP settles: once it
      // is at target AND not under pressure (its demand clock is at or below the
      // equilibrium rate), hold — tick but place nothing. But a colour that is genuinely
      // BEHIND (speed above equilibrium: queue rising or deep) keeps spawning PAST the
      // target, up to the density ceiling, so it can actually catch up. The rating is
      // only an estimate of how many houses an office needs; on a big, congested map the
      // real number is higher, and this is what lets supply find it.
      if (speed <= 1.05 && this._colorHouses[c] >= this._houseTarget(c)) continue;
      // The map is the real difficulty curve: at the density ceiling the spawn is
      // dropped rather than packing the board solid. New rings raise the ceiling.
      if (this.world.houses.length >= budget) continue;
      const h = this._placeHouse(c);
      if (h) {
        this._colorHouses[c]++;
        out = push(out, 'house', h.id, h.x, h.y, c);
      } else {
        this._houseT[c] = NO_ROOM_DELAY;    // no room this instant; look again soon
      }
    }
    return out;
  }

  _rollHouse(c) {
    const jit = 1 - HOUSE_JITTER / 2 + this._rng() * HOUSE_JITTER;
    this._houseT[c] = DIFF[this.difficulty].houseDays * this.dayLength * jit;
  }

  _rollOffice() {
    const days = OFFICE_DAYS_MIN + this._rng() * (OFFICE_DAYS_MAX - OFFICE_DAYS_MIN);
    this._officeT = days * this.dayLength;
  }

  /**
   * One office every 3-5 in-game days. It either introduces the next colour or
   * relieves the existing colour with the most houses per office. Both cases go
   * through the plan ('intro'/'dest') rather than placing inline, so they inherit
   * the bounded-retry machinery instead of duplicating it.
   *
   * An office that cannot find room stays OUTSTANDING rather than being dropped.
   * Measured on the 11x8 opening board: the first office fired on time at day ~4.6,
   * burned all six retries against a board that already held two offices and their
   * driveways, and gave up — the next one did not appear until day 9. A 3x2 footprint
   * simply does not always fit, and silently losing the spawn is the wrong answer to
   * that. So: while one is outstanding the cadence clock does NOT run, and if its
   * plan entry dies (retries exhausted, or planWeek cleared the plan under it) it is
   * re-armed. Outstanding-not-queued is the important half — a cramped board paces
   * offices to the room it has, instead of banking four of them and dumping the lot
   * the moment a new ring opens.
   */
  _officeClock(dt, now, out) {
    if (dt <= 0) return out;
    if (this._officeOut) {
      // Landing is detected from the world rather than from the plan entry: entries
      // are POOLED BY PLAN INDEX, so a remembered reference can quietly become
      // somebody else's entry after planWeek clears and refills the plan.
      if (this.world.dests.length > this._officeDests) {
        this._officeOut = 0;
        this._officeWait = 0;
        this._rollOffice();
      } else if (!this._officeLive()) {
        this._armOffice(now);
      }
      return out;
    }
    this._officeT -= dt;
    if (this._officeT > 0) return out;
    // Buildings are DONE after week OFFICE_LAST_WEEK: the demand ramp has finished by
    // then, so from here only HOUSES spawn (to serve the buildings that exist). The
    // clock keeps ticking harmlessly but never places another office.
    if (this.week > OFFICE_LAST_WEEK) { this._rollOffice(); return out; }
    // An office spawns every OFFICE_DAYS_MIN..MAX days, full stop. WHICH colour it is
    // is decided in _armOffice: a NEW colour while the run holds fewer than the
    // date-capped number (`_colorCap`, ~one more colour per week up to MAX_COLORS) —
    // that ignores the density ceiling because introducing the colour is the point —
    // otherwise a RELIEF office for a RANDOM existing colour, which DOES respect the
    // ceiling, so a mature board paces offices to the room it actually has.
    const wantNewColour = this.colorsUnlocked < this._colorCap();
    if (!wantNewColour && this.world.dests.length >= this._officeBudget()) {
      this._rollOffice();                 // board at its office ceiling; look again next cadence
      return out;
    }
    this._officeWait = 0;                 // a FRESH fire; the house hold starts now
    this._armOffice(now);
    return out;
  }

  /** Is there still a live office entry in the plan? */
  _officeLive() {
    const plan = this._plan;
    for (let i = 0; i < plan.length; i++) {
      const e = plan[i];
      if (!e.done && (e.kind === 'dest' || e.kind === 'intro')) return true;
    }
    return false;
  }

  // Note this deliberately does NOT touch _officeWait: re-arming a dead plan entry is
  // the same outstanding office continuing to hunt, and resetting the wait here would
  // let the house hold renew itself forever. Only a fresh fire zeroes it.
  _armOffice(now) {
    this._officeDests = this.world.dests.length;
    this._officeOut = 1;
    // Prioritise a NEW colour until the date-capped count is reached, then a relief
    // 'dest' for a random already-unlocked colour (see _pickDestColor).
    const kind = this.colorsUnlocked < this._colorCap() ? 'intro' : 'dest';
    this._add(kind, now, -1, MAX_TRIES_PINNED);
  }

  /**
   * How many DISTINCT colours may exist by now — one more per week, capped at
   * MAX_COLORS: week 1 -> 1, week 2 -> 2, ... week 5 -> 5, and 5 thereafter. The
   * office clock introduces new colours up to this, then relieves existing ones.
   */
  _colorCap() {
    const hard = MAX_COLORS < COLORS.length ? MAX_COLORS : COLORS.length;
    const byDate = this.week | 0;
    return byDate < 1 ? 1 : (byDate > hard ? hard : byDate);
  }

  // Offices get a density ceiling of their own. A NEW COLOUR is exempt (checked by
  // the caller): the colour schedule is a promise, and an office is how it is kept.
  _officeBudget() {
    const b = this.world.bounds;
    const tiles = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    const n = Math.floor(tiles / TILES_PER_OFFICE);
    return n < START_COLORS ? START_COLORS : n;
  }

  _retry(e, now) {
    e.tries++;
    if (e.tries >= e.maxTries) { e.done = true; return; }
    e.t = now + RETRY_DELAY + this._rng() * 2.4;
  }

  _fire(e, now, out) {
    const k = e.kind;

    if (k === 'seed') {
      // Opening board: claim every starting destination BEFORE any house, so a
      // house can never squat the last legal footprint on a cramped 11x8 map.
      const first = this.colorsUnlocked;
      for (let c = first; c < START_COLORS; c++) {
        const d = this._placeDest(c);
        if (!d) break;
        this.colorsUnlocked = c + 1;
        this._born.set(d.id, this.week);
        out = push(out, 'dest', d.id, d.x, d.y, c);
      }
      if (this.colorsUnlocked === first) { this._retry(e, now); return out; }
      // Place houses up to the FLOOR for each starting colour (demand.js rating)
      for (let c = first; c < this.colorsUnlocked; c++) {
        const need = colorNeed(this.world.dests, c, this.day);
        for (let n = this._colorHouses[c]; n < need; n++) {
          const h = this._placeHouse(c);
          if (h) {
            this._colorHouses[c]++;
            out = push(out, 'house', h.id, h.x, h.y, c);
          } else {
            this._add('chouse', now + 1.0, c, MAX_TRIES_PINNED);
            this._floorPending[c] = 1;
            break;
          }
        }
      }
      e.done = true;
      // whatever is still missing arrives as a normal introduction shortly after
      if (this.colorsUnlocked < START_COLORS) this._add('intro', now + 2.0, -1, MAX_TRIES_PINNED);
      return out;
    }

    if (k === 'intro') {
      const c = this.colorsUnlocked;
      if (c >= COLORS.length) { e.done = true; return out; }
      const dest = this._placeDest(c);
      if (!dest) { this._retry(e, now); return out; }
      e.done = true;
      this.colorsUnlocked = c + 1;
      this._born.set(dest.id, this.week);
      out = push(out, 'dest', dest.id, dest.x, dest.y, c);
      // the matching house is part of the same arrival
      out = this._seedHouses(dest, now, out);
      return out;
    }

    if (k === 'chouse') {
      const h = this._placeHouse(e.color);
      if (!h) { this._retry(e, now); return out; }
      e.done = true;
      this._colorHouses[e.color]++;
      this._floorPending[e.color] = 0;
      return push(out, 'house', h.id, h.x, h.y, e.color);
    }

    if (k === 'dest') {
      const c = this._pickDestColor();
      if (c < 0) { this._retry(e, now); return out; }
      const d = this._placeDest(c);
      if (!d) { this._retry(e, now); return out; }
      e.done = true;
      this._born.set(d.id, this.week);
      out = push(out, 'dest', d.id, d.x, d.y, c);
      return this._seedHouses(d, now, out);
    }

    if (k === 'upgrade') {
      const d = this._pickUpgrade();
      if (!d) { e.done = true; return out; }   // nothing eligible: drop it, no retry
      e.done = true;
      this.world.upgradeDest(d.id);
      return push(out, 'upgrade', d.id, d.x, d.y, d.color);
    }

    e.done = true;
    return out;
  }

  // =========================================================================
  // colour choice
  // =========================================================================

  // How many houses the currently revealed map can carry. Scales with the
  // playable rect, so the ceiling rises every time sim expands the bounds.
  // Colour-introduction houses ignore this — the dest+house invariant wins.
  _houseBudget() {
    const b = this.world.bounds;
    const tiles = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    const n = Math.floor(tiles / DIFF[this.difficulty].tilesPerHouse);
    return n < 4 ? 4 : n;
  }

  // How many houses this colour should settle at: ~25% above its raw demand rating
  // (see OVERSPAWN). The house clock fills to this and then holds; the hard floor
  // (colorNeed with no overshoot) still guarantees the bare minimum underneath it.
  _houseTarget(c) {
    return colorNeed(this.world.dests, c, this.day, OVERSPAWN);
  }

  /**
   * An office may never open with no houses of its colour. Called for every new
   * office, and it walks `parts` rather than trusting the colour that was ASKED
   * for: a double office serves two, and the partner half can perfectly well be a
   * colour that has an office but no houses left standing.
   */
  _seedHouses(dest, now, out) {
    const parts = dest.parts;
    const n = parts ? parts.length : 1;
    for (let k = 0; k < n; k++) {
      const c = (parts ? parts[k].color : dest.color) | 0;
      if (c < 0 || c >= COLORS.length) continue;
      if (this._colorHouses[c] > 0) continue;
      const h = this._placeHouse(c);
      if (h) {
        this._colorHouses[c]++;
        out = push(out, 'house', h.id, h.x, h.y, c);
      } else if (this._floorPending[c] === 0) {
        // No room this instant. Pin a hard-retrying entry so the colour still ends
        // up with a house — the invariant is the promise, not this one attempt.
        this._add('chouse', now + 1.0, c, MAX_TRIES_PINNED);
        this._floorPending[c] = 1;
      }
    }
    return out;
  }

  // The colour with the most houses per destination needs relief.
  // A relief office (one placed once the date-capped colour count is reached) takes a
  // RANDOM colour from those already unlocked — so the colours keep mixing rather than
  // always feeding the same one.
  _pickDestColor() {
    const n = this.colorsUnlocked | 0;
    if (n <= 0) return -1;
    return (this._rng() * n) | 0;
  }

  // A square that has stood for a couple of weeks may become a circle (faster,
  // volatile pin generation). Picked at fire time so the choice reflects reality.
  _pickUpgrade() {
    const dests = this.world.dests;
    const elig = this._elig;
    elig.length = 0;
    for (let i = 0; i < dests.length; i++) {
      const d = dests[i];
      if (d.shape === 'circle') continue;
      const born = this._born.get(d.id);
      if (born === undefined || this.week - born < 2) continue;
      elig.push(d);
    }
    if (elig.length === 0) return null;
    const pick = elig[(this._rng() * elig.length) | 0];
    elig.length = 0;
    return pick;
  }

  // =========================================================================
  // placement — destinations
  // =========================================================================

  _cand() {
    let o = this._candPool[this._nCand];
    if (o === undefined) {
      o = { x: 0, y: 0, w: 0, h: 0, g0x: 0, g0y: 0, g1x: 0, g1y: 0, ng: 0, score: 0 };
      this._candPool[this._nCand] = o;
    }
    this._nCand++;
    return o;
  }

  /**
   * Place an office, chosen from the 12 variants: single 2x3 (kind 1), 3x2 (kind 2),
   * or DOUBLE 3x4/4x3 (kind 3, two colours, only legal from day 5 onwards). The new
   * connection-point model: road joins at C tiles outside the footprint, cars drive
   * through a driveway lane inside.
   * @param {number} color the colour to place for (a caller may ask for one colour
   *   but get a double office that serves two)
   * @returns {object|null} the PRIMARY dest record, or null when the map has no room
   */
  _placeDest(color) {
    const w = this.world;
    const b = w.bounds;
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;

    if (bw < 2 || bh < 2) return null;

    // --- decide the office KIND (1, 2, or 3), then pick a variant of that kind ---
    let kind = 0;
    let colors = [color];
    const dblLegal = this.day >= DOUBLE_DAY && this.colorsUnlocked >= 2;
    const dblProb = Math.min(DOUBLE_PROB_MAX, DOUBLE_PROB_BASE + (this.day - DOUBLE_DAY) * 0.01);
    if (dblLegal && this._rng() < dblProb) {
      // Attempt a double office. The colour we were ASKED for always gets one of
      // the two halves — an 'intro' entry advances `colorsUnlocked` on the
      // strength of this call, so handing the building to two other colours would
      // unlock a colour with no destination at all. The partner is the neediest
      // OTHER unlocked colour that already has somewhere to drive to.
      let partner = -1, bestW = -1;
      for (let c = 0; c < this.colorsUnlocked; c++) {
        if (c === color || this._colorDests[c] <= 0) continue;
        const wgt = (this._colorHouses[c] + 1) / (this._colorDests[c] + 1) * (0.7 + this._rng() * 0.6);
        if (wgt > bestW) { bestW = wgt; partner = c; }
      }
      if (partner >= 0) {
        kind = 3;
        colors = [color, partner];
      }
    }
    if (kind === 0) {
      // single office: pick kind 1 or 2 at random
      kind = this._rng() < 0.5 ? 1 : 2;
    }

    let d = this._tryKind(kind, colors);
    if (d) return d;

    // The chosen kind did not fit ANYWHERE — so fall back to the SINGLE kinds before
    // giving up. A footprint is not fungible: the 3x4 double is twice the area of a
    // 2x3, and on a board that already holds two offices it is routinely the only one
    // with nowhere to go. Refusing the whole office because the dice said "double" is
    // how a 3-5 day cadence quietly became 8 (measured on the 11x8 opening board).
    // Only ever DOWN to a single, never up to a double: a double is a difficulty beat
    // gated on DOUBLE_DAY and a willing partner, not a consolation prize. `[color]` is
    // rebuilt rather than reusing `colors`, whose second entry would otherwise leave a
    // single office claiming two colours.
    if (kind !== 1) { d = this._tryKind(1, [color]); if (d) return d; }
    if (kind !== 2) { d = this._tryKind(2, [color]); if (d) return d; }
    return null;
  }

  /**
   * Try to site one office of a single KIND. Two passes: random probes scored for
   * openness, then an exhaustive scan of every variant at every position, so a null
   * return means the kind genuinely does not fit rather than the dice being unlucky.
   */
  _tryKind(kind, colors) {
    const w = this.world;
    const b = w.bounds;
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    this._nCand = 0;
    const cands = this._cands;
    cands.length = 0;

    const variants = officeVariantsOfKind(kind);
    if (variants.length === 0) return null;
    for (let i = variants.length - 1; i > 0; i--) {
      const j = (this._rng() * (i + 1)) | 0;
      const t = variants[i]; variants[i] = variants[j]; variants[j] = t;
    }

    // pass 1: random probes, keep the best handful
    for (let t = 0; t < SAMPLE_TRIES && cands.length < KEEP_BEST; t++) {
      const v = variants[(this._rng() * variants.length) | 0];
      if (bw < v.w || bh < v.h) continue;
      const x = b.x0 + ((this._rng() * (bw - v.w + 1)) | 0);
      const y = b.y0 + ((this._rng() * (bh - v.h + 1)) | 0);
      if (w.canPlaceOffice(v, x, y) !== R_OK) continue;
      const c = this._cand();
      c.x = x; c.y = y; c.w = v.w; c.h = v.h;
      const connOpen = this._connOpenness(v, x, y);
      if (connOpen < 0) { this._nCand--; continue; }   // no connection point is reachable
      c.score = this._destScore(x, y, v.w, v.h, colors[0]) + connOpen;
      c.ng = 0;  // variant id stored in the pooled object for pass 2
      c.g0x = variants.indexOf(v);  // hack: store the variant index in g0x
      cands.push(c);
    }

    if (cands.length > 0) {
      let best = cands[0];
      for (let i = 1; i < cands.length; i++) if (cands[i].score > best.score) best = cands[i];
      const v = variants[best.g0x];
      const d = w.addDest({ x: best.x, y: best.y, variant: v.id, colors: colors, shape: 'square' });
      if (d) { this._countDest(d); return d; }
    }

    // pass 2: exhaustive bounded scan, try every variant at every position
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      for (let y = b.y0; y + v.h - 1 <= b.y1; y++) {
        for (let x = b.x0; x + v.w - 1 <= b.x1; x++) {
          if (w.canPlaceOffice(v, x, y) !== R_OK) continue;
          if (this._connOpenness(v, x, y) < 0) continue;
          const d = w.addDest({ x: x, y: y, variant: v.id, colors: colors, shape: 'square' });
          if (d) { this._countDest(d); return d; }
        }
      }
    }
    return null;
  }

  // One office may serve one colour or two, so `_placeDest` owns the whole
  // per-colour tally and its callers must NOT add to it — counting a double
  // office's requested colour twice would tell `_pickDestColor` that colour is
  // well served when it is not.
  _countDest(d) {
    const parts = d.parts;
    if (parts) for (let k = 0; k < parts.length; k++) this._colorDests[parts[k].color | 0]++;
    else this._colorDests[d.color | 0]++;
  }

  // Spread destinations out and keep them off the very rim of the map. A double
  // office appears twice in world.dests (one entry per colour); skip non-primary
  // parts so distance measurements are not duplicated.
  _destScore(x, y, fw, fh, color) {
    const w = this.world, b = w.bounds;
    const cx = x + fw * 0.5, cy = y + fh * 0.5;
    let near = 99;
    const dests = w.dests;
    for (let i = 0; i < dests.length; i++) {
      const d = dests[i];
      if (d.complex !== d) continue;    // skip non-primary parts
      const ddx = (d.x + d.w * 0.5) - cx, ddy = (d.y + d.h * 0.5) - cy;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < near) near = dist;
    }
    if (near > 14) near = 14;
    const mx = (b.x0 + b.x1 + 1) * 0.5, my = (b.y0 + b.y1 + 1) * 0.5;
    const fromMid = Math.sqrt((cx - mx) * (cx - mx) + (cy - my) * (cy - my));
    return near * 0.6 - fromMid * 0.16 + this._rng() * 2.5;
  }

  /**
   * Connection-point openness: count road-capable tiles in the 8-neighbourhood of
   * each connection point, with a bonus if road already reaches one. Return -1 if
   * NO connection point has any open neighbour (an office no road can ever touch
   * is dead weight). This replaces the old gate-score idea.
   */
  _connOpenness(v, x, y) {
    const w = this.world;
    let total = 0;
    let anyOpen = false;
    for (let k = 0; k < v.conns.length; k++) {
      const cx = x + v.conns[k][0], cy = y + v.conns[k][1];
      let open = 0, road = 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx >= x && nx < x + v.w && ny >= y && ny < y + v.h) continue;  // inside footprint
        if (!w.inBounds(nx, ny)) continue;
        if (w.tileAt(nx, ny) !== T_EMPTY) continue;
        open++;
        if (w.edgeMask(nx, ny) !== 0) road++;
      }
      if (open > 0) anyOpen = true;
      total += open + (road > 0 ? 2.5 : 0);
    }
    if (!anyOpen) return -1;
    return total * 0.4 + this._rng() * 1.5;
  }


  // =========================================================================
  // placement — houses
  // =========================================================================

  /**
   * Place a 1x1 house. The house tile IS its gate, so all placement has to prove
   * is that a road can reach it: at least one of its EIGHT neighbours must be
   * road-capable land. Anchors drive clustering: each colour has 4 fixed points
   * across the whole map; we try visible anchors first, sampling tiles 0..5 away,
   * and only fall back to the full random search when that fails.
   * @returns {object|null}
   */
  _placeHouse(color) {
    const w = this.world;
    const b = w.bounds;
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    this._nCand = 0;
    const cands = this._cands;
    cands.length = 0;

    // --- anchor-based sampling: neighbourhoods form around the anchors ---
    const anchors = this._anchors[color];
    const visible = [];
    for (let k = 0; k < anchors.length; k++) {
      const a = anchors[k];
      if (a.x >= b.x0 && a.x <= b.x1 && a.y >= b.y0 && a.y <= b.y1) visible.push(a);
    }
    if (visible.length > 0) {
      const anchor = visible[(this._rng() * visible.length) | 0];
      const dist = (this._rng() * 6) | 0;   // 0..5 tiles away
      for (let t = 0; t < 60; t++) {
        const angle = this._rng() * Math.PI * 2;
        const r = dist + this._rng() * 1.5;
        const x = (anchor.x + r * Math.cos(angle)) | 0;
        const y = (anchor.y + r * Math.sin(angle)) | 0;
        if (w.canPlaceHouse(x, y) !== R_OK) continue;
        if (this._houseAccess(x, y) <= 0) continue;
        const h = w.addHouse({ x: x, y: y, color: color });
        if (h) return h;
      }
    }

    // --- random sampling fallback, as before ---
    for (let t = 0; t < SAMPLE_TRIES && cands.length < KEEP_BEST; t++) {
      const x = b.x0 + ((this._rng() * bw) | 0);
      const y = b.y0 + ((this._rng() * bh) | 0);
      if (w.canPlaceHouse(x, y) !== R_OK) continue;
      const acc = this._houseAccess(x, y);
      if (acc <= 0) continue;                       // no road could ever reach it
      const c = this._cand();
      c.x = x; c.y = y; c.w = 1; c.h = 1; c.ng = 0;
      c.score = this._houseScore(x, y, acc);
      cands.push(c);
    }

    if (cands.length > 0) {
      let best = cands[0];
      for (let i = 1; i < cands.length; i++) if (cands[i].score > best.score) best = cands[i];
      const h = w.addHouse({ x: best.x, y: best.y, color: color });
      if (h) return h;
    }

    // Exhaustive fallback, bounded by the playable rect so a genuinely full map
    // returns null instead of spinning. Pass 0 still insists on road access;
    // pass 1 takes anything legal rather than starve a colour of its house.
    for (let pass = 0; pass < 2; pass++) {
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = b.x0; x <= b.x1; x++) {
          if (w.canPlaceHouse(x, y) !== R_OK) continue;
          if (pass === 0 && this._houseAccess(x, y) <= 0) continue;
          const h = w.addHouse({ x: x, y: y, color: color });
          if (h) return h;
        }
      }
    }
    return null;
  }

  // Road-capable tiles in the 8-neighbourhood — a house is joined directly, from
  // any direction, so this is exactly its accessibility. Also counts how many of
  // those already carry road, folded in by the caller.
  _houseAccess(x, y) {
    const w = this.world;
    let open = 0;
    for (let d = 0; d < 8; d++) {
      if (w.tileAt(x + DX[d], y + DY[d]) === T_EMPTY) open++;
    }
    return open;
  }

  _houseScore(x, y, acc) {
    const w = this.world;
    let s = this._rng() * 2.0;
    // breathing room to build into, and a bonus for landing next to existing road
    s += (acc > 4 ? 4 : acc) * 0.3;
    for (let d = 0; d < 8; d++) {
      if (w.edgeMask(x + DX[d], y + DY[d]) !== 0) { s += 1.5; break; }
    }
    // let neighbourhoods form, but do not weld houses into a solid block
    let crowd = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (!w.inBounds(nx, ny)) continue;
        if ((w.flags[w.idx(nx, ny)] & F_BUILD) !== 0) crowd++;
      }
    }
    if (crowd > 3) s -= (crowd - 3) * 0.5;
    return s;
  }
}

function byTime(a, b) { return a.t - b.t; }

function clamp01(v) {
  return Number.isFinite(v) ? (v < 0 ? 0 : (v > 1 ? 1 : v)) : 0;
}

function push(out, kind, id, x, y, color) {
  if (out === null) out = [];
  out.push({ kind: kind, id: id, x: x, y: y, color: color });
  return out;
}
