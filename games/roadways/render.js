/* ============================================================================
 * Roadways v2 — render.js  (lane D)
 * All canvas drawing for the world, plus the camera transform and the shared
 * drawing primitives the shell (index.html) uses for its HUD / palette / overlays.
 *
 * Ownership split (see docs/.plans/game-roadways.plan.md):
 *   render.js  -> camera math, cached terrain + road layers, world entities,
 *                 previews, and reusable primitives (rr, glyphs, fontFor, shade).
 *   index.html -> camera *control*, HUD pill, tool palette, reward cards,
 *                 pause / game-over, particles, audio, input, loop.
 *
 * This module is DOM-light: it needs a 2D context and `document.createElement`
 * for its two offscreen layers. It never touches sim/world/traffic state — it
 * only reads.
 *
 * PERF NOTES (target: a low-powered tablet)
 *  - devicePixelRatio is capped at 2 by the shell and passed in here.
 *  - Two offscreen layers (terrain, roads) are drawn ONCE at a fixed scale and
 *    blitted with a scaled drawImage, so a continuously-zooming camera never
 *    forces a re-render. See `_pickCacheTs` for the pixel budget.
 *  - No shadowBlur anywhere in the play path (glows are stacked alpha strokes).
 *  - Font strings are memoised in `fontFor`, so a zooming camera builds at most
 *    one string per integer pixel size, not one per frame.
 * ==========================================================================*/

import * as NET from './net.js';

/* --------------------------------------------------------------------------
 * Contract constants. Imported as a namespace on purpose: a missing named
 * export becomes `undefined` instead of a hard module-link error, so the game
 * still boots (with fallbacks) if net.js drifts.
 * ------------------------------------------------------------------------*/
// The eight tiles of a roundabout ring, in ring order starting at the NW corner.
// Odd indices are the four orthogonal tiles (the arms and the one-way arrows).
const RING8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

const FALLBACK_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const FALLBACK_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

export const DX = ok8(NET.DX) ? NET.DX : FALLBACK_DX;
export const DY = ok8(NET.DY) ? NET.DY : FALLBACK_DY;
export const DIR_LEN = ok8(NET.DIR_LEN) ? NET.DIR_LEN
  : [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];
export const OPP = ok8(NET.OPP) ? NET.OPP : [4, 5, 6, 7, 0, 1, 2, 3];

export const T_OUT      = numOr(NET.T_OUT, 0);
export const T_EMPTY    = numOr(NET.T_EMPTY, 1);
export const T_WATER    = numOr(NET.T_WATER, 2);
export const T_MOUNTAIN = numOr(NET.T_MOUNTAIN, 3);
export const T_HOUSE    = numOr(NET.T_HOUSE, 4);
export const T_DEST     = numOr(NET.T_DEST, 5);

// Corner hint on an authored terrain cell (see net.js S_*). Index by the hint to
// get the corner DIAGONALLY OPPOSITE it — the dry side of a drawn coastline.
const S_NW = numOr(NET.S_NW, 1), S_NE = numOr(NET.S_NE, 2),
      S_SE = numOr(NET.S_SE, 3), S_SW = numOr(NET.S_SW, 4);
/** Path the right-triangle occupying one corner half of a tile. Does not fill. */
function cornerTri(g, px, py, ts, corner) {
  const x1 = px + ts, y1 = py + ts;
  g.beginPath();
  if (corner === S_NW)      { g.moveTo(px, py); g.lineTo(x1, py); g.lineTo(px, y1); }
  else if (corner === S_NE) { g.moveTo(x1, py); g.lineTo(x1, y1); g.lineTo(px, py); }
  else if (corner === S_SE) { g.moveTo(x1, y1); g.lineTo(px, y1); g.lineTo(x1, py); }
  else                      { g.moveTo(px, y1); g.lineTo(px, py); g.lineTo(x1, y1); }
  g.closePath();
}

/** Add the hypotenuse of corner `corner`'s triangle — the diagonal coastline — to an OPEN path. */
function cornerDiagInto(g, px, py, ts, corner) {
  const x1 = px + ts, y1 = py + ts;
  // S_NW / S_SE share the anti-diagonal (NE-SW); S_NE / S_SW share the main diagonal (NW-SE).
  if (corner === S_NW || corner === S_SE) { g.moveTo(x1, py); g.lineTo(px, y1); }
  else { g.moveTo(px, py); g.lineTo(x1, y1); }
}

// order: red, yellow, blue, green, purple, pink, lightblue, orange
const FALLBACK_COLORS = ['#ff5252', '#ffd93b', '#4d8bff', '#4ade5f',
                         '#a259ff', '#ff6fc4', '#48dbe6', '#ff9f2e'];
export const COLORS = (Array.isArray(NET.COLORS) && NET.COLORS.length >= 5)
  ? NET.COLORS.slice() : FALLBACK_COLORS;

function ok8(a) { return Array.isArray(a) && a.length === 8; }
function numOr(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

/* --------------------------------------------------------------------------
 * Theme
 * ------------------------------------------------------------------------*/
export const COL = {
  bg0: '#0a0a2e', bg1: '#141452', bg2: '#1a1a6e',
  accent: '#6c5ce7', glow: '#a29bfe', sub: '#a0c4ff', gold: '#ffd32a',
  danger: '#e74c3c', warn: '#ff9f2e',
  landA: '#17352a', landB: '#1c4033', landEdge: 'rgba(255,255,255,0.05)',
  water: '#123a63', waterHi: 'rgba(120,196,255,0.22)', shore: 'rgba(160,220,255,0.32)',
  rock: '#2b2a45', rockHi: 'rgba(200,205,235,0.20)', ridge: 'rgba(255,255,255,0.10)',
  offmap: 'rgba(6,6,26,0.5)',   // wash over land the boundary layer says is not yours
  casing: '#2f3350', asphalt: '#767d99', asphaltHi: '#8d95b4',
  // An office's forecourt. One shade darker than `asphalt` so the drive lane
  // still reads as the bit cars use, but from the same family and with the road's
  // own casing, so lot -> lane -> road is one continuous paved surface.
  lot: '#5c6480',
  dash: 'rgba(255,255,255,0.5)',
  mway: '#c9d2ee', mwayInk: '#3b4270',
  ink: 'rgba(10,10,40,0.85)'
};

/* --------------------------------------------------------------------------
 * Small math / colour helpers
 * ------------------------------------------------------------------------*/
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }

function hexRGB(h) {
  let s = String(h || '#ffffff').replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** amt > 0 lightens toward white, amt < 0 darkens toward black. */
export function shade(hex, amt) {
  const c = hexRGB(hex), t = amt < 0 ? 0 : 255, k = Math.abs(amt);
  const f = (v) => Math.round(v + (t - v) * k);
  return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
}
export function withAlpha(hex, a) {
  const c = hexRGB(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1) + ')';
}

const FONT_FAMILY = '"Segoe UI",system-ui,sans-serif';
const _fontCache = new Map();
/** Memoised font string builder — a zooming camera must not concat per frame. */
export function fontFor(px, bold) {
  const size = clamp(Math.round(px) || 10, 6, 200);
  const key = bold ? (size + 1000) : size;
  let s = _fontCache.get(key);
  if (s === undefined) {
    s = (bold ? 'bold ' : '') + size + 'px ' + FONT_FAMILY;
    _fontCache.set(key, s);
  }
  return s;
}

/** Rounded-rect path via arcTo (Path2D.roundRect is not safe on old tablets). */
export function rrPath(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
export function rr(g, x, y, w, h, r) { g.beginPath(); rrPath(g, x, y, w, h, r); }

// Scratch for `unionOfHalves` — read immediately by the caller, never held, so one
// object serves every office and the draw loop stays allocation-free.
const _ubox = { x: 0, y: 0, w: 1, h: 1 };

/**
 * The tile rect covering every coloured block of an office, i.e. the footprint
 * minus its driveway. For a single office that is just its one half; for a double
 * it is the two halves together, which is the silhouette the building is drawn as.
 * @returns {{x:number,y:number,w:number,h:number}} shared scratch — copy if kept
 */
export function unionOfHalves(d) {
  const parts = d && d.parts;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (parts && parts.length) {
    for (let k = 0; k < parts.length; k++) {
      const hb = parts[k] && parts[k].half;
      if (!hb) continue;
      if (hb.x < x0) x0 = hb.x;
      if (hb.y < y0) y0 = hb.y;
      if (hb.x + hb.w > x1) x1 = hb.x + hb.w;
      if (hb.y + hb.h > y1) y1 = hb.y + hb.h;
    }
  }
  if (!isFinite(x0)) {
    const hb = (d && d.half) || d;
    x0 = hb.x; y0 = hb.y; x1 = hb.x + (hb.w | 0); y1 = hb.y + (hb.h | 0);
  }
  _ubox.x = x0; _ubox.y = y0;
  _ubox.w = Math.max(1, x1 - x0); _ubox.h = Math.max(1, y1 - y0);
  return _ubox;
}

/* setLineDash copies its argument, so these two scratch arrays let the per-frame
 * passes set a dash pattern without allocating. Module-level on purpose. */
const _dash2 = [0, 0];
const _dashOff = [];

function hash2(x, y) {
  let h = ((x | 0) * 73856093) ^ ((y | 0) * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* --------------------------------------------------------------------------
 * Colour classes — 8 of them, each with a fixed light/dark pair so the same
 * class reads the same everywhere.
 *
 * There used to be a per-class emblem (circle/triangle/square/…) stamped on
 * every house gable and office roof, as a second channel behind hue. It was
 * cut: at tablet zoom the shapes are small dark blobs that read as debris on
 * the roof, and they were competing with the doorway and the pin queue for the
 * same few pixels. Hue plus the pin queue carries it.
 * ------------------------------------------------------------------------*/
export const CLASS = COLORS.map((hex) => ({
  hex: hex,
  fill: hex,
  light: shade(hex, 0.42),
  dark: shade(hex, -0.42),
  deep: shade(hex, -0.62)
}));
export function cls(i) {
  const n = (i | 0);
  return CLASS[((n % CLASS.length) + CLASS.length) % CLASS.length] || CLASS[0];
}

/* ==========================================================================
 * Camera — the headline feature.
 *
 * Screen = (world - centre) * ts + viewportCentre, with `world` in TILE units
 * (tile centres at x+0.5). Every projection and every hit test goes through
 * this one pair of functions so the inverse can never drift.
 *
 * Easing is exponential decay toward the target with a time constant, which is
 * frame-rate independent (k = 1 - e^(-dt/tau)) — never a per-frame fraction.
 * Zoom eases in LOG space so 2.4x -> 1x feels like a constant-rate zoom.
 * ==========================================================================*/
export const REVEAL_TAU = 1.02;   // ~4s to settle (e^-3.9 ≈ 2%)
export const REVEAL_ZOOM = 2.4;   // opening crop multiplier

export class Camera {
  constructor() {
    this.ts = 32; this.cx = 0; this.cy = 0;              // live
    this.tTs = 32; this.tCx = 0; this.tCy = 0;           // target
    this.logTs = Math.log(32); this.logTarget = Math.log(32);
    this.vx = 0; this.vy = 0;                            // viewport centre, css px
    this.vw = 0; this.vh = 0;                            // viewport size, css px
    this.tau = REVEAL_TAU;
    this.settled = true;
  }

  /** Set the on-screen rectangle the world is drawn into (css px). */
  setView(x, y, w, h) {
    this.vw = Math.max(1, w); this.vh = Math.max(1, h);
    this.vx = x + this.vw / 2; this.vy = y + this.vh / 2;
  }

  /** Tile size that fits `bounds` into the current view rect. */
  fitFor(bounds, pad) {
    const b = bounds || { x0: 0, y0: 0, x1: 10, y1: 7 };
    return this.fitForSize((b.x1 | 0) - (b.x0 | 0) + 1, (b.y1 | 0) - (b.y0 | 0) + 1, pad);
  }

  /**
   * Tile size that fits a cols x rows rectangle. FRACTIONAL sizes are meaningful
   * and are not rounded: the shell aims at the playable area grown by a fraction
   * of a ring so the zoom creeps out continuously through the week, and rounding
   * here would turn that creep back into the one-per-week jump it replaced.
   */
  fitForSize(cols, rows, pad) {
    const c = Math.max(1, numOr(cols, 1));
    const r = Math.max(1, numOr(rows, 1));
    const p = (pad == null ? 10 : pad) * 2;
    const ts = Math.min((this.vw - p) / c, (this.vh - p) / r);
    return clamp(isFinite(ts) ? ts : 24, 6, 96);
  }

  /** Aim the camera; the ease does the rest. */
  setTarget(ts, cx, cy) {
    this.tTs = clamp(numOr(ts, this.tTs), 4, 160);
    this.tCx = numOr(cx, this.tCx);
    this.tCy = numOr(cy, this.tCy);
    this.logTarget = Math.log(this.tTs);
    this.settled = false;
  }

  /** Jump straight to the target (used once, when a run starts). */
  snap() {
    this.ts = this.tTs; this.logTs = this.logTarget;
    this.cx = this.tCx; this.cy = this.tCy;
    this.settled = true;
  }

  /** Frame-rate independent ease. dt in seconds. */
  update(dt) {
    const d = clamp(numOr(dt, 0), 0, 0.25);
    if (d <= 0) return;
    const k = 1 - Math.exp(-d / this.tau);
    this.logTs += (this.logTarget - this.logTs) * k;
    this.cx += (this.tCx - this.cx) * k;
    this.cy += (this.tCy - this.cy) * k;
    this.ts = Math.exp(this.logTs);
    if (!isFinite(this.ts) || this.ts <= 0) { this.ts = this.tTs; this.logTs = this.logTarget; }
    const zoomClose = Math.abs(this.logTarget - this.logTs) < 0.002;
    const panClose = Math.abs(this.tCx - this.cx) < 0.01 && Math.abs(this.tCy - this.cy) < 0.01;
    this.settled = zoomClose && panClose;
    if (this.settled) { this.logTs = this.logTarget; this.ts = this.tTs; this.cx = this.tCx; this.cy = this.tCy; }
  }

  /* --- projection (world tile units -> css px) --- */
  toX(wx) { return this.vx + (wx - this.cx) * this.ts; }
  toY(wy) { return this.vy + (wy - this.cy) * this.ts; }
  /* --- inverse (css px -> world tile units) --- */
  toWX(sx) { return (sx - this.vx) / this.ts + this.cx; }
  toWY(sy) { return (sy - this.vy) / this.ts + this.cy; }
  /** Integer tile under a screen point. */
  tileX(sx) { return Math.floor(this.toWX(sx)); }
  tileY(sy) { return Math.floor(this.toWY(sy)); }
}

/* ==========================================================================
 * Renderer
 * ==========================================================================*/
const CACHE_MAX_PX = 2400;   // offscreen layer budget per axis (tablet-friendly)
const OVERSAMPLE = 1.3;      // cache a little larger than the fit so the
                             // zoomed-in reveal is not obviously soft
const CACHE_STEP = 4;        // cache tile sizes snap to this ladder — see _pickCacheTs
export const SMALL_TS = 32;  // below this, pin pips become a numeral

/* A house is a 1x1 sprite that only ever differs by colour class, so all eight
 * are drawn ONCE into an atlas and blitted. The body went from a two-tone
 * rounded square to a pitched-roof cottage with a gable, a door and windows —
 * about eight canvas ops — and a busy map carries ~100 houses, so drawing them
 * live would have cost ~800 ops a frame on a tablet. Blitting costs 100.
 * Fixed scale, scaled on blit, exactly like the terrain and road layers. */
const SPRITE_TS = 96;        // logical px per house sprite in the atlas
const SPRITE_PAD = 12;       // room for the drop shadow, which leaves the tile

/* The office drive lane, in tiles, and the kerb round it. These are not free
 * numbers: they are EXACTLY the road's own two strokes (`_paintRoads` draws
 * casing at 0.68 of a tile and asphalt at 0.50, both round-capped). Matching
 * them is what makes the join at a connection point invisible — same asphalt
 * width, same kerb width, and a cap radius of 0.25 centred on the connection
 * point, which is where the road's own round cap and junction pad already sit.
 * A lane even slightly wider left a visible step in the kerb at the mouth. */
const LANE_W = 0.50;              // asphalt width  == road asphalt
const LANE_KERB = 0.18;           // stroke width, so 0.50 + 0.18 == road casing

/* How far a parking space reaches out of the lane, from the lane's centre line.
 * Baked in net.js and read from there because traffic.js parks a car in the middle
 * of this same shape — one owner for the geometry, three readers. In every variant
 * the coloured block's edge is exactly half a tile from the lane centre and the
 * building is inset 0.19 inside that, so the forecourt wall stands at 0.69 and the
 * space stops just short of it. */
const BAY_IN = numOr(NET.BAY_IN, LANE_W / 2);     // the mouth: the lane's asphalt edge
const BAY_OUT = numOr(NET.BAY_OUT, 0.66);         // the head: just short of the wall

const _lane = { x: 0, y: 0, w: 0, h: 0 };    // scratch: _laneRect
const _slice = { x: 0, y: 0, w: 0, h: 0 };   // scratch: _halfSlice

export class Renderer {
  constructor(ctx, cam) {
    this.ctx = ctx;
    this.cam = cam;
    this.W = 0; this.H = 0; this.dpr = 1;
    this.terCv = document.createElement('canvas');
    this.terCtx = this.terCv.getContext('2d');
    this.roadCv = document.createElement('canvas');
    this.roadCtx = this.roadCv.getContext('2d');
    // The SURROUND: the whole authored map plus a margin, painted once per world
    // and blitted under everything. It is what makes "still render the other stuff
    // to the screen edge" true — the ocean and the hills carry on past the
    // playable rect instead of stopping at a hard line in mid-air.
    this.surCv = document.createElement('canvas');
    this.surCtx = this.surCv.getContext('2d');
    this._surWorld = null;                        // identity of the painted world
    this._surRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this._surTs = 0;
    this.terrainDirty = true;
    this.roadDirty = true;
    this.cacheTs = 0; this.cacheDpr = 1;
    this.lb = { x0: 0, y0: 0, x1: 0, y1: 0 };  // layer bounds
    this.lastVersion = -1;
    this.lastGhosts = -1;
    this.lastTerrain = '';
    this.time = 0;
    this._links = [];
    this._grad = null; this._gradH = -1;
    this.houseCv = null;      // lazy: the 8-colour house atlas, built on first use
  }

  /* ---------------- house sprite atlas ---------------- */
  /**
   * One row of eight cottages, one per colour class, at a fixed scale. Built on
   * first draw and never rebuilt: it carries no zoom- or count-dependent detail,
   * so the car pips stay live in `_drawHouseMarks`.
   */
  _buildHouseAtlas() {
    const n = CLASS.length;
    const cell = SPRITE_TS + SPRITE_PAD * 2;
    const cv = document.createElement('canvas');
    cv.width = cell * n; cv.height = cell;
    const g = cv.getContext('2d');
    if (!g) return null;
    for (let i = 0; i < n; i++) this._paintHouse(g, CLASS[i], i * cell + SPRITE_PAD, SPRITE_PAD);
    this.houseCell = cell;
    return cv;
  }

  /**
   * One house, drawn into a SPRITE_TS box at (ox,oy). It is the SQUARE OFFICE shape,
   * no roof: a solid body with a darker facade band across the bottom carrying the
   * same office glazing and door, extruded down-right for a side and a shadow. The
   * body stays wide enough (0.72 of the tile) to cover the road stub that runs to the
   * tile centre underneath it — the house sitting ON the road IS the join.
   */
  _paintHouse(g, c, ox, oy) {
    const S = SPRITE_TS;
    const bw = S * 0.72, bh = S * 0.72;
    const bx = ox + (S - bw) / 2, by = oy + (S - bh) / 2;
    const ex = bw * 0.10, ey = bw * 0.08;             // extrusion: the near side, down-right
    const rad = bw * 0.12;
    const ts = bw;                                    // proportions for the shared office helpers
    const cxm = bx + bw / 2;                          // vertical centre
    const peakY = by - bw * 0.12;                     // the top-centre point, skewed up a little

    // The body silhouette: a box with ROUNDED BOTTOM corners and a top edge that
    // rises to a shallow peak at the centre. Reused (optionally offset) for the
    // shadow, the near side and the keyline so they can never disagree.
    const body = (dx, dy) => {
      g.beginPath();
      g.moveTo(bx + dx, by + dy);                     // top-left corner
      g.lineTo(cxm + dx, peakY + dy);                 // up to the raised centre
      g.lineTo(bx + bw + dx, by + dy);                // top-right corner
      g.lineTo(bx + bw + dx, by + bh - rad + dy);     // right side
      g.arcTo(bx + bw + dx, by + bh + dy, bx + bw - rad + dx, by + bh + dy, rad);
      g.lineTo(bx + rad + dx, by + bh + dy);          // bottom
      g.arcTo(bx + dx, by + bh + dy, bx + dx, by + bh - rad + dy, rad);
      g.closePath();
    };

    // 1. soft shadow, down-right
    g.fillStyle = 'rgba(0,0,0,0.30)';
    body(ex * 1.8, ey * 1.8); g.fill();

    // 2. the near side, peeking out down-right, in the deep shade
    g.fillStyle = c.deep;
    body(ex, ey); g.fill();

    // 3. the body, then the top split vertically and a darker facade band across the
    //    bottom. Clipped to the body so everything respects the corners and the peak.
    g.fillStyle = c.fill;
    body(0, 0); g.fill();
    g.save();
    body(0, 0); g.clip();
    const facH = Math.max(3, bh * 0.42);
    const fy = by + bh - facH;
    // the top (above the facade), split at the centre and following the raised peak:
    // left the lighter body colour, right the darker shade.
    g.fillStyle = c.fill;
    g.beginPath();
    g.moveTo(bx, by); g.lineTo(cxm, peakY); g.lineTo(cxm, fy); g.lineTo(bx, fy);
    g.closePath(); g.fill();
    g.fillStyle = c.dark;
    g.beginPath();
    g.moveTo(cxm, peakY); g.lineTo(bx + bw, by); g.lineTo(bx + bw, fy); g.lineTo(cxm, fy);
    g.closePath(); g.fill();
    // the facade band across the bottom, darker, with a lit parapet edge
    g.fillStyle = c.dark;
    g.fillRect(bx, fy, bw, facH);
    g.fillStyle = withAlpha('#ffffff', 0.22);                 // parapet edge
    g.fillRect(bx, fy, bw, Math.max(1, ts * 0.025));
    // 4. windows + door on the facade — the office glazing (one dark glass strip with
    //    light mullions and a lit sill) and the office door.
    this._drawWindows(g, bx, fy, bw, facH, ts);
    this._drawEntrance(g, { x: bx, y: by, w: bw, h: bh }, 0.5, facH, ts);
    g.restore();

    // 5. white keyline round the body
    g.strokeStyle = 'rgba(255,255,255,0.62)';
    g.lineWidth = Math.max(1.5, bw * 0.045);
    g.lineJoin = 'round';
    body(0, 0); g.stroke();
  }

  setViewport(W, H, dpr) {
    this.W = W; this.H = H; this.dpr = clamp(dpr, 1, 2);
    this.terrainDirty = true; this.roadDirty = true;
    this._surWorld = null;      // the margin is sized off the viewport
    this._grad = null;
  }
  markTerrain() { this.terrainDirty = true; }
  markRoads() { this.roadDirty = true; }
  // The surround is deliberately NOT invalidated here: it covers the whole grid,
  // so growing the playable rect changes nothing in it.
  markAll() { this.terrainDirty = true; this.roadDirty = true; }

  /* ---------------- background ---------------- */
  drawBackground() {
    const g = this.ctx;
    if (!this._grad || this._gradH !== this.H) {
      const gr = g.createLinearGradient(0, 0, 0, Math.max(1, this.H));
      gr.addColorStop(0, COL.bg0); gr.addColorStop(0.55, COL.bg1); gr.addColorStop(1, COL.bg2);
      this._grad = gr; this._gradH = this.H;
    }
    g.fillStyle = this._grad;
    g.fillRect(0, 0, this.W, this.H);
  }

  /* ---------------- cache management ---------------- */
  _boundsChanged(b) {
    const l = this.lb;
    return l.x0 !== (b.x0 | 0) || l.y0 !== (b.y0 | 0) ||
           l.x1 !== (b.x1 | 0) || l.y1 !== (b.y1 | 0);
  }
  _pickCacheTs(cols, rows) {
    // Quantised to a CACHE_STEP ladder. The camera target now creeps out
    // continuously all week rather than jumping once, so an unquantised `want`
    // would land on a new value almost every road edit and rebuild BOTH offscreen
    // layers each time. The ladder means an edit rebuilds the road layer only,
    // which is the cheap one, and the terrain layer is re-rasterised a handful of
    // times per week instead. Cost is at most CACHE_STEP px of crispness.
    let want = clamp(Math.round(this.cam.tTs * OVERSAMPLE / CACHE_STEP) * CACHE_STEP, 8, 72);
    let dpr = this.dpr;
    for (let guard = 0; guard < 24; guard++) {
      if (cols * want * dpr <= CACHE_MAX_PX && rows * want * dpr <= CACHE_MAX_PX) break;
      if (dpr > 1) dpr = 1;
      else want = Math.max(6, Math.floor(want * 0.85));
      if (want <= 6) break;
    }
    return { ts: want, dpr: dpr };
  }
  _syncCache(world) {
    const b = world.bounds || { x0: 0, y0: 0, x1: 10, y1: 7 };
    const version = world.version | 0;
    const terrain = String(world.terrain || '');
    if (this._boundsChanged(b) || terrain !== this.lastTerrain) {
      this.lb = { x0: b.x0 | 0, y0: b.y0 | 0, x1: b.x1 | 0, y1: b.y1 | 0 };
      this.lastTerrain = terrain;
      this.terrainDirty = true; this.roadDirty = true;
    }
    if (version !== this.lastVersion) { this.roadDirty = true; this.lastVersion = version; }
    // Belt-and-braces: if world.version does not bump on ghost create/release,
    // the ghost count still forces a road-layer rebuild.
    const gl = (typeof world.ghostList === 'function') ? world.ghostList() : null;
    const gn = (gl && gl.length) | 0;
    if (gn !== this.lastGhosts) { this.roadDirty = true; this.lastGhosts = gn; }

    const cols = this.lb.x1 - this.lb.x0 + 1, rows = this.lb.y1 - this.lb.y0 + 1;
    if (this.terrainDirty || this.roadDirty) {
      const pick = this._pickCacheTs(cols, rows);
      if (pick.ts !== this.cacheTs || pick.dpr !== this.cacheDpr) {
        this.cacheTs = pick.ts; this.cacheDpr = pick.dpr;
        this.terrainDirty = true; this.roadDirty = true;
      }
      const pw = Math.max(1, Math.round(cols * this.cacheTs * this.cacheDpr));
      const ph = Math.max(1, Math.round(rows * this.cacheTs * this.cacheDpr));
      if (this.terrainDirty) {
        this.terCv.width = pw; this.terCv.height = ph;
        this._paintTerrain(world);
        this.terrainDirty = false;
      }
      if (this.roadDirty) {
        this.roadCv.width = pw; this.roadCv.height = ph;
        this._paintRoads(world);
        this.roadDirty = false;
      }
    }
  }

  /* ---------------- terrain layer (rebuilt on resize/expand/terrain) ------ */
  _paintTerrain(world) {
    const live = (typeof world.tileAt === 'function')
      ? (x, y) => world.tileAt(x, y)
      : () => T_EMPTY;
    const planned = (typeof world.planTileAt === 'function')
      ? (x, y) => world.planTileAt(x, y)
      : () => T_EMPTY;
    // Inside the rect, T_OUT means the boundary layer masked this cell (nothing
    // else can be T_OUT here). Draw its real terrain and let the wash say it is
    // not the player's, rather than drawing a hole where the ocean should be.
    const tileAt = (x, y) => {
      const t = live(x, y);
      return t === T_OUT ? planned(x, y) : t;
    };
    const outAt = (x, y) => (live(x, y) === T_OUT ? 1 : 0);
    // grid = false: the plot grid is no longer baked into the terrain. It is drawn
    // live over the buildable rect only while the player is dragging a tool — see
    // `_drawBuildGrid`.
    this._paintTerrainInto(this.terCtx, world, this.lb, this.cacheTs, this.cacheDpr,
      tileAt, outAt, false);
  }

  /* ---------------- the surround: everything OUTSIDE the playable rect ----
   * Same painter, fed the PLANNED terrain (revealed or not) over the whole grid
   * plus a margin, and blitted dimmed underneath the crisp layer. Two reasons it
   * is its own cache and not part of the terrain layer:
   *  - it never changes. The plan is fixed at construction, so this rasterises
   *    once per world instead of once per expansion.
   *  - it is background. It can afford a coarse tile size and dpr 1, which keeps
   *    a 74x55-cell bitmap well inside the tablet's texture budget, where
   *    painting it at the terrain layer's crispness would not be.
   * Authored maps only: a procedural run has no authored surround to show, and
   * pre-rendering its unrevealed terrain would give away the expansions.
   * ---------------------------------------------------------------------- */
  _syncSurround(world) {
    if (!world.authored || typeof world.planTileAt !== 'function') return false;
    if (this._surWorld === world) return this.surCv.width > 1;
    this._surWorld = world;

    const mc = world.maxCols | 0, mr = world.maxRows | 0;
    // Margin: enough cells that at the most zoomed-OUT the camera will ever go
    // (the whole of maxBounds, plus the shell's padding) the bitmap still reaches
    // both screen edges. Derived, not guessed: at that zoom one tile is `ts` px,
    // so the viewport is vw/ts cells wide and we need half the overhang each side.
    const mb = world.maxBounds || { x0: 0, y0: 0, x1: mc - 1, y1: mr - 1 };
    const outTs = this.cam.fitForSize(mb.x1 - mb.x0 + 1, mb.y1 - mb.y0 + 1, 16);
    const mx = Math.ceil(Math.max(0, this.W / Math.max(1, outTs) - mc) / 2) + 2;
    const my = Math.ceil(Math.max(0, this.H / Math.max(1, outTs) - mr) / 2) + 2;
    const m = clamp(Math.max(mx, my), 2, 40);
    const r = this._surRect;
    r.x0 = -m; r.y0 = -m; r.x1 = mc - 1 + m; r.y1 = mr - 1 + m;

    const cols = r.x1 - r.x0 + 1, rows = r.y1 - r.y0 + 1;
    // Fit the bitmap to the same pixel budget as the other layers, at dpr 1.
    let ts = Math.floor(CACHE_MAX_PX / Math.max(cols, rows));
    ts = clamp(ts, 4, 20);
    this._surTs = ts;
    this.surCv.width = Math.max(1, cols * ts);
    this.surCv.height = Math.max(1, rows * ts);
    const planAt = (x, y) => world.planTileAt(x, y);
    const outAt = (typeof world.planOutAt === 'function')
      ? (x, y) => world.planOutAt(x, y)
      : () => 0;
    this._paintTerrainInto(this.surCtx, world, r, ts, 1, planAt, outAt, false);
    return true;
  }

  /**
   * The one terrain painter. `tileFn(x,y)` decides what TERRAIN is at a cell — live
   * tiles for the playable layer, the plan for the surround — `outFn(x,y)` whether
   * the cell is off-map, and `grid` draws the plot lines, which only the playable
   * layer wants.
   */
  _paintTerrainInto(g, world, l, ts, dpr, tileFn, outFn, grid) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = l.x1 - l.x0 + 1, rows = l.y1 - l.y0 + 1;
    g.clearRect(0, 0, cols * ts, rows * ts);

    const isRock = String(world.terrain || '') === 'mountain';
    const tileAt = tileFn;
    const shapeAt = (typeof world.planShapeAt === 'function')
      ? (x, y) => world.planShapeAt(x, y)
      : () => 0;

    // 1. land base (checkerboard by hash so it is not flat)
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        const px = (x - l.x0) * ts, py = (y - l.y0) * ts;
        const t = tileAt(x, y);
        const blocked = (t === T_WATER || t === T_MOUNTAIN);
        // A FULL water/mountain tile gets no land base. A DIAGONAL tile (one with a
        // corner shape) does: only its shape-corner half is terrain, so the other
        // half must show green — the terrain triangle is painted over the top in step 3.
        if (blocked && !shapeAt(x, y)) continue;
        g.fillStyle = (hash2(x, y) > 0.5) ? COL.landA : COL.landB;
        g.fillRect(px, py, ts + 1, ts + 1);
      }
    }
    // 2. plot grid — faint, only when the cache is big enough to show it
    if (grid && ts >= 14) {
      g.strokeStyle = COL.landEdge; g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= cols; x++) { g.moveTo(x * ts + 0.5, 0); g.lineTo(x * ts + 0.5, rows * ts); }
      for (let y = 0; y <= rows; y++) { g.moveTo(0, y * ts + 0.5); g.lineTo(cols * ts, y * ts + 0.5); }
      g.stroke();
    }
    // 3. blocked terrain: water pools or mountain rock
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        const t = tileAt(x, y);
        if (t !== T_WATER && t !== T_MOUNTAIN) continue;
        const px = (x - l.x0) * ts, py = (y - l.y0) * ts;
        const s = shapeAt(x, y);
        g.fillStyle = (t === T_WATER) ? COL.water : COL.rock;
        // A corner-shape tile is a DIAGONAL: fill only the shape's corner-half with
        // terrain; the land base painted in step 1 shows through the other half. A
        // full tile (s === 0) fills edge to edge as before. The tile is still wholly
        // unbuildable — this is presentation only.
        if (s) { cornerTri(g, px, py, ts, s); g.fill(); }
        else { g.fillRect(px, py, ts + 1, ts + 1); }
      }
    }
    // 4. soft shoreline / ridge: one pass along every blocked→open boundary
    const sw = Math.max(1.5, ts * 0.11);
    g.lineWidth = sw; g.lineCap = 'round';
    g.strokeStyle = isRock ? COL.ridge : COL.shore;
    g.beginPath();
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        const t = tileAt(x, y);
        if (t !== T_WATER && t !== T_MOUNTAIN) continue;
        const px = (x - l.x0) * ts, py = (y - l.y0) * ts, in2 = sw * 0.5;
        const nT = tileAt(x, y - 1), sT = tileAt(x, y + 1);
        const wT = tileAt(x - 1, y), eT = tileAt(x + 1, y);
        const open = (v) => (v !== T_WATER && v !== T_MOUNTAIN);
        // On a corner-shape tile only the two edges touching the terrain half are
        // real coast; the other two are land and must not get a shore line. On a full
        // tile (s === 0) every edge is a water edge, so this reduces to the old logic.
        const s = shapeAt(x, y);
        const wN = !s || s === S_NW || s === S_NE;
        const wS = !s || s === S_SE || s === S_SW;
        const wW = !s || s === S_NW || s === S_SW;
        const wE = !s || s === S_NE || s === S_SE;
        if (wN && open(nT)) { g.moveTo(px + in2, py + in2); g.lineTo(px + ts - in2, py + in2); }
        if (wS && open(sT)) { g.moveTo(px + in2, py + ts - in2); g.lineTo(px + ts - in2, py + ts - in2); }
        if (wW && open(wT)) { g.moveTo(px + in2, py + in2); g.lineTo(px + in2, py + ts - in2); }
        if (wE && open(eT)) { g.moveTo(px + ts - in2, py + in2); g.lineTo(px + ts - in2, py + ts - in2); }
        if (s) cornerDiagInto(g, px, py, ts, s);   // the diagonal coastline within the tile itself
      }
    }
    g.stroke();
    // 5. texture: ripples on water, ridge triangles on rock
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        const t = tileAt(x, y);
        if (t !== T_WATER && t !== T_MOUNTAIN) continue;
        const px = (x - l.x0) * ts, py = (y - l.y0) * ts;
        const h = hash2(x, y);
        // On a diagonal tile, clip the texture to the terrain half so ripples/ridges
        // never spill onto the green side.
        const s = shapeAt(x, y);
        if (s) { g.save(); cornerTri(g, px, py, ts, s); g.clip(); }
        if (t === T_WATER) {
          if (ts >= 12) {
            g.strokeStyle = COL.waterHi;
            g.lineWidth = Math.max(1, ts * 0.06);
            g.beginPath();
            const wy = py + ts * (0.28 + h * 0.4);
            g.moveTo(px + ts * 0.18, wy); g.lineTo(px + ts * 0.62, wy);
            g.moveTo(px + ts * (0.4 + h * 0.2), wy + ts * 0.22);
            g.lineTo(px + ts * (0.82), wy + ts * 0.22);
            g.stroke();
          }
        } else {
          g.fillStyle = COL.rockHi;
          g.beginPath();
          g.moveTo(px + ts * (0.2 + h * 0.2), py + ts * 0.82);
          g.lineTo(px + ts * (0.45 + h * 0.1), py + ts * 0.2);
          g.lineTo(px + ts * 0.86, py + ts * 0.82);
          g.closePath(); g.fill();
        }
        if (s) g.restore();
      }
    }
    // NB: boundary / off-map cells are drawn as their real terrain above and are
    // NOT washed dark. They are scenery whose only jobs are to fill the screen
    // beyond the playable box and to cap how far the camera zooms out — the player
    // never sees a "darkened boundary". `outFn` is retained in the signature for
    // callers that still pass it, but nothing here darkens on it any more.
  }

  /* ---------------- road layer (rebuilt on world.version) ---------------- */
  _paintRoads(world) {
    const g = this.roadCtx, ts = this.cacheTs, l = this.lb;
    g.setTransform(this.cacheDpr, 0, 0, this.cacheDpr, 0, 0);
    const cols = l.x1 - l.x0 + 1, rows = l.y1 - l.y0 + 1;
    g.clearRect(0, 0, cols * ts, rows * ts);
    const cx = (x) => (x - l.x0 + 0.5) * ts;
    const cy = (y) => (y - l.y0 + 0.5) * ts;

    const hasEdge = (x, y, d) => (typeof world.hasEdge === 'function' ? !!world.hasEdge(x, y, d) : false);
    const isGhost = (x, y, d) => (typeof world.isGhost === 'function' ? !!world.isGhost(x, y, d) : false);
    const maskAt = (x, y) => (typeof world.edgeMask === 'function' ? (world.edgeMask(x, y) | 0) : 0);
    const island = typeof world.isRoundCentre === 'function'
      ? (x, y) => world.isRoundCentre(x, y) : null;

    // Collect live edges once. dirs 0..3 only: each undirected edge is visited
    // exactly once from its lower-left-ish endpoint.
    // NOTE: gate tiles are NOT filtered out here, and that is load-bearing. An
    // edge that terminates on a building's gate is drawn to that tile's CENTRE,
    // exactly like any other, so the asphalt runs UNDER the footprint instead of
    // stopping at its edge. The buildings are drawn after this layer is blitted,
    // so the road visibly disappears beneath the house/office — which is the
    // whole join effect, with nothing painted back on top.
    const segs = [];
    let anyTile = false;
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        const m = maskAt(x, y);
        if (m) anyTile = true;
        for (let d = 0; d < 4; d++) {
          if (!(m & (1 << d)) && !hasEdge(x, y, d)) continue;
          if (isGhost(x, y, d)) continue;      // ghosts are drawn live, not cached
          // Road the player drew before a roundabout landed on top of it survives
          // in the mask but is no longer drivable, so it must not be drawn either
          // — otherwise it reads as a road running onto the island.
          if (island !== null && (island(x, y) || island(x + DX[d], y + DY[d]))) continue;
          segs.push(x, y, x + DX[d], y + DY[d]);
        }
      }
    }
    if (!segs.length && !anyTile) return;

    const stroke = (w, colour, cap) => {
      g.lineWidth = Math.max(1, w); g.strokeStyle = colour;
      g.lineCap = cap || 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        g.moveTo(cx(segs[i]), cy(segs[i + 1]));
        g.lineTo(cx(segs[i + 2]), cy(segs[i + 3]));
      }
      g.stroke();
    };

    // casing -> asphalt -> junction pads -> dashes
    stroke(ts * 0.68, COL.casing);
    stroke(ts * 0.50, COL.asphalt);

    // junction pads smooth the 8-way joins and mark intersections
    g.fillStyle = COL.asphalt;
    g.beginPath();
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        if (!maskAt(x, y)) continue;
        if (island !== null && island(x, y)) continue;
        g.moveTo(cx(x) + ts * 0.25, cy(y));
        g.arc(cx(x), cy(y), ts * 0.25, 0, Math.PI * 2);
      }
    }
    g.fill();

    if (ts >= 18) {
      g.setLineDash([Math.max(2, ts * 0.16), Math.max(2, ts * 0.2)]);
      stroke(Math.max(1, ts * 0.05), COL.dash, 'butt');
      g.setLineDash([]);
      // intersection collars — a subtle lighter ring so junctions read as junctions
      if (typeof world.isIntersection === 'function') {
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.lineWidth = Math.max(1, ts * 0.05);
        g.beginPath();
        for (let y = l.y0; y <= l.y1; y++) {
          for (let x = l.x0; x <= l.x1; x++) {
            if (!maskAt(x, y) || !world.isIntersection(x, y)) continue;
            if (island !== null && island(x, y)) continue;
            g.moveTo(cx(x) + ts * 0.28, cy(y));
            g.arc(cx(x), cy(y), ts * 0.28, 0, Math.PI * 2);
          }
        }
        g.stroke();
      }
    }

    this._paintRoundabouts(g, world, ts, cx, cy);
    this._paintBridges(g, world, ts, cx, cy);
    // Motorways are NOT baked into the road layer — they are ELEVATED. They are drawn
    // live in drawWorld, on top of houses/roads/ground-cars (see `_drawMotorways`).
  }

  _paintRoundabouts(g, world, ts, cx, cy) {
    const list = world.roundabouts;
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r || !isFinite(r.cx) || !isFinite(r.cy)) continue;
      const px = cx(r.cx), py = cy(r.cy);

      // The ring the cars drive is the eight tiles AROUND the centre, so paint
      // that octagon rather than a circle: a circle wide enough to reach the
      // corner tiles (1.41 tiles out) would have to spill outside the 3x3, and a
      // circle that fits leaves the corners driving on grass.
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k < RING8.length; k++) {
        const X = cx(r.cx + RING8[k][0]), Y = cy(r.cy + RING8[k][1]);
        if (k === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.closePath();
      g.strokeStyle = COL.casing; g.lineWidth = ts * 0.9; g.stroke();
      g.strokeStyle = COL.asphalt; g.lineWidth = ts * 0.72; g.stroke();

      // the island: big enough to cover the whole centre tile, small enough to
      // stay clear of the asphalt's inner kerb
      const isle = ts * 0.6;
      g.fillStyle = COL.landB;
      g.beginPath(); g.arc(px, py, isle, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = Math.max(1, ts * 0.06);
      g.beginPath(); g.arc(px, py, isle, 0, Math.PI * 2); g.stroke();

      // One-way arrows, one per orthogonal ring tile, pointing along the flow the
      // world actually enforces — so the sign can never contradict the traffic.
      if (typeof world.roundaboutFlowDir === 'function') {
        g.fillStyle = 'rgba(255,255,255,0.72)';
        for (let k = 1; k < RING8.length; k += 2) {
          const tx = r.cx + RING8[k][0], ty = r.cy + RING8[k][1];
          const d = world.roundaboutFlowDir(tx, ty);
          if (!(typeof d === 'number' && d >= 0)) continue;
          arrowHead(g, cx(tx), cy(ty), Math.atan2(DY[d], DX[d]), ts * 0.3);
        }
      }
    }
  }

  _paintBridges(g, world, ts, cx, cy) {
    const list = world.bridges;
    if (!Array.isArray(list)) return;
    const tunnel = String(world.terrain || '') === 'mountain';
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || !isFinite(b.ax) || !isFinite(b.ay) || !isFinite(b.bx) || !isFinite(b.by)) continue;
      const x0 = cx(b.ax), y0 = cy(b.ay), x1 = cx(b.bx), y1 = cy(b.by);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
      const half = ts * 0.34;
      // deck
      g.lineCap = 'butt';
      g.strokeStyle = tunnel ? '#1b1a2e' : COL.casing;
      g.lineWidth = ts * 0.74; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = tunnel ? '#3b3a58' : COL.asphalt;
      g.lineWidth = ts * 0.52; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      // rails (bridge) or portal arcs (tunnel)
      if (!tunnel) {
        g.strokeStyle = '#d8def5'; g.lineWidth = Math.max(1, ts * 0.08);
        g.beginPath();
        g.moveTo(x0 + nx * half, y0 + ny * half); g.lineTo(x1 + nx * half, y1 + ny * half);
        g.moveTo(x0 - nx * half, y0 - ny * half); g.lineTo(x1 - nx * half, y1 - ny * half);
        g.stroke();
      } else {
        g.strokeStyle = '#9aa2c8'; g.lineWidth = Math.max(1, ts * 0.1);
        for (const p of [[x0, y0, ang], [x1, y1, ang + Math.PI]]) {
          g.beginPath();
          g.arc(p[0], p[1], ts * 0.36, p[2] - Math.PI / 2, p[2] + Math.PI / 2);
          g.stroke();
        }
        g.setLineDash([Math.max(2, ts * 0.2), Math.max(2, ts * 0.22)]);
        g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = Math.max(1, ts * 0.05);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.setLineDash([]);
      }
      g.lineCap = 'round';
    }
  }

  // Live, elevated motorway pass (drawWorld) — the same painter as the cached layers
  // used, but fed the CAMERA transform (tile centres at x+0.5) so it lands on top of
  // the buildings instead of baked under them.
  _drawMotorways(world) {
    const cam = this.cam;
    this._paintMotorways(this.ctx, world, cam.ts,
      (x) => cam.toX(x + 0.5), (y) => cam.toY(y + 0.5));
  }

  _paintMotorways(g, world, ts, cx, cy) {
    const list = world.motorways;
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || !isFinite(m.ax) || !isFinite(m.ay) || !isFinite(m.bx) || !isFinite(m.by)) continue;
      const x0 = cx(m.ax), y0 = cy(m.ay), x1 = cx(m.bx), y1 = cy(m.by);
      const drop = ts * 0.18;   // airspace: the link floats above its shadow
      // shadow on the ground
      g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = ts * 0.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0 + drop); g.lineTo(x1, y1 + drop); g.stroke();
      // elevated deck
      g.strokeStyle = COL.mwayInk; g.lineWidth = ts * 0.56;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = COL.mway; g.lineWidth = ts * 0.4;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      // gold centre dashes = "fast"
      g.setLineDash([Math.max(3, ts * 0.34), Math.max(3, ts * 0.26)]);
      g.strokeStyle = COL.gold; g.lineWidth = Math.max(1, ts * 0.08);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.setLineDash([]);
      // the two pegs (ramps)
      for (const p of [[x0, y0], [x1, y1]]) {
        g.fillStyle = COL.mwayInk;
        rr(g, p[0] - ts * 0.42, p[1] - ts * 0.42, ts * 0.84, ts * 0.84, ts * 0.2); g.fill();
        g.fillStyle = COL.mway;
        rr(g, p[0] - ts * 0.32, p[1] - ts * 0.32, ts * 0.64, ts * 0.64, ts * 0.16); g.fill();
        g.fillStyle = COL.gold;
        g.beginPath(); g.arc(p[0], p[1], ts * 0.12, 0, Math.PI * 2); g.fill();
      }
    }
  }

  /* ==========================================================================
   * The per-frame world pass.
   * `ui` carries the shell's input state:
   *   { time, tool, hover:{x,y,ok}, pegA, pegTo, pegOk, erasing, eraseGhost,
   *     flashes:[{x,y,t,bad}] }
   * ========================================================================*/
  drawWorld(sim, ui) {
    const g = this.ctx, cam = this.cam;
    const world = sim && sim.world;
    if (!world) return;
    this.time = (ui && ui.time) || 0;
    this._syncCache(world);

    const l = this.lb, ts = cam.ts;
    const cols = l.x1 - l.x0 + 1, rows = l.y1 - l.y0 + 1;
    const dx = cam.toX(l.x0), dy = cam.toY(l.y0);
    const dw = cols * ts, dh = rows * ts;

    // Land base: paint the whole max grid as open ground so the area outside the
    // current playable rect reads as grass, not the dark page background. There is
    // no frame and no "not yours yet" darkening — the buildable rect is shown only
    // by the drag-time grid.
    const mb = world.maxBounds ||
      { x0: 0, y0: 0, x1: (world.maxCols | 0) - 1, y1: (world.maxRows | 0) - 1 };
    {
      const bx = cam.toX(mb.x0), by = cam.toY(mb.y0);
      const bw = (mb.x1 - mb.x0 + 1) * ts, bh = (mb.y1 - mb.y0 + 1) * ts;
      g.fillStyle = COL.landA;
      g.fillRect(bx, by, bw, bh);
    }

    // The surround, under everything: the map's scenery carried out past the
    // playable rect to the screen edge, so the world does not end in a hard line
    // with nothing behind it. Drawn at full strength (no dim) so the ground beyond
    // the playable rect is not a darkened boundary.
    if (this._syncSurround(world)) {
      const r = this._surRect;
      const sx = cam.toX(r.x0), sy = cam.toY(r.y0);
      const sw2 = (r.x1 - r.x0 + 1) * ts, sh2 = (r.y1 - r.y0 + 1) * ts;
      g.drawImage(this.surCv, 0, 0, this.surCv.width, this.surCv.height, sx, sy, sw2, sh2);
    }

    // cached layers, blitted with the live camera scale
    if (this.terCv.width > 1 && dw > 0 && dh > 0) {
      g.drawImage(this.terCv, 0, 0, this.terCv.width, this.terCv.height, dx, dy, dw, dh);
    }

    // The playable area is no longer outlined by a frame or a "future extent"
    // dashed box, and the plot grid is not baked into the terrain: the map reads
    // as open land until the player picks up a tool. While a drag is live the grid
    // of buildable spaces is drawn here, on the ground under the roads and
    // buildings, so it guides placement without cluttering the resting map.
    if (ui && ui.dragging) this._drawBuildGrid(world);

    if (this.roadCv.width > 1 && dw > 0 && dh > 0) {
      g.drawImage(this.roadCv, 0, 0, this.roadCv.width, this.roadCv.height, dx, dy, dw, dh);
    }

    this._drawGhosts(world);
    this._drawLights(world);
    // Buildings sit ON TOP of the road layer, so a road that runs into a gate
    // tile slides under the house/office instead of being capped by it. Cars
    // standing on a footprint tile (the gate->door drive link) go under with it,
    // otherwise they'd drive visibly across the roof for a few tenths of a second.
    this._drawCars(sim, world, 'under');
    this._drawHouses(world);
    this._drawHouseMarks(world);
    this._drawDests(sim, world);      // lot + drive lane + building, once per office
    this._drawGateHints(world);       // only "a road can land here" on free gates
    this._drawCars(sim, world, 'ground');
    // Motorways are ELEVATED: their deck is drawn ON TOP of houses, roads and the
    // ground cars, and the cars crossing a span are drawn on top of the deck.
    this._drawMotorways(world);
    this._drawCars(sim, world, 'mway');
    this._drawTimers(world);          // on top: the failure clock must never hide
    if (ui) this._drawPreview(sim, world, ui);
  }

  /* ---- ghosts: erased and already refunded, still carrying their last cars.
     Pulsing and translucent so it reads as "going", not as road you still own. ---- */
  _drawGhosts(world) {
    if (typeof world.ghostList !== 'function') return;
    const list = world.ghostList();
    if (!list || !list.length) return;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    const pulse = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 4));
    g.save();
    g.globalAlpha = pulse;
    g.lineCap = 'round';
    g.strokeStyle = COL.asphaltHi; g.lineWidth = Math.max(1, ts * 0.44);
    g.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !isFinite(e.x) || !isFinite(e.y)) continue;
      const d = e.dir | 0;
      g.moveTo(cam.toX(e.x + 0.5), cam.toY(e.y + 0.5));
      g.lineTo(cam.toX(e.x + DX[d] + 0.5), cam.toY(e.y + DY[d] + 0.5));
    }
    g.stroke();
    g.setLineDash([Math.max(2, ts * 0.16), Math.max(2, ts * 0.16)]);
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, ts * 0.06);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  /* ---- traffic lights: housing + current green axis ---- */
  _drawLights(world) {
    const list = world.lights;
    if (!Array.isArray(list) || !list.length) return;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    for (let i = 0; i < list.length; i++) {
      const L = list[i];
      if (!L || !isFinite(L.x) || !isFinite(L.y)) continue;
      const px = cam.toX(L.x + 0.5), py = cam.toY(L.y + 0.5);
      const r = ts * 0.3;
      g.fillStyle = '#12122a';
      rr(g, px - r, py - r, r * 2, r * 2, r * 0.4); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1;
      rr(g, px - r, py - r, r * 2, r * 2, r * 0.4); g.stroke();
      const axis = greenAxis(L, this.time);
      const bar = r * 0.72, thick = Math.max(2, r * 0.34);
      g.fillStyle = '#2ecc71';
      if (axis === 0) g.fillRect(px - thick / 2, py - bar, thick, bar * 2);
      else g.fillRect(px - bar, py - thick / 2, bar * 2, thick);
      g.fillStyle = 'rgba(231,76,60,0.85)';
      if (axis === 0) g.fillRect(px - bar, py - thick / 2, bar * 2, thick * 0.5);
      else g.fillRect(px - thick / 2, py - bar, thick * 0.5, bar * 2);
    }
  }

  /* ---- houses: 1x1, class colour, car pips ----
   * The house tile IS its own gate, so roads run into this footprint from any of
   * the 8 sides. The join needs no drawing here: the road layer is blitted before
   * this pass, so the asphalt passes UNDER the body. Never a stub off the block.
   */
  _drawHouses(world) {
    const list = world.houses;
    if (!Array.isArray(list) || !list.length) return;
    if (!this.houseCv) this.houseCv = this._buildHouseAtlas();
    const atlas = this.houseCv;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    // The sprite box is one tile plus the shadow margin, so the cottage lands at
    // the same size the live version drew and the shadow may spill as designed.
    const cell = this.houseCell, pad = SPRITE_TS ? (SPRITE_PAD / SPRITE_TS) : 0;
    const dstS = ts * (1 + pad * 2), off = ts * pad;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h || !isFinite(h.x) || !isFinite(h.y)) continue;
      const px = cam.toX(h.x), py = cam.toY(h.y);
      if (px + ts < -ts || py + ts < -ts || px > this.W + ts || py > this.H + ts) continue;
      if (atlas) {
        const k = ((h.color | 0) % CLASS.length + CLASS.length) % CLASS.length;
        g.drawImage(atlas, k * cell, 0, cell, cell, px - off, py - off, dstS, dstS);
      } else {
        // Atlas unavailable (no 2D context on the offscreen canvas): fall back to
        // a flat block rather than drawing nothing at all.
        const c = cls(h.color), inset = ts * 0.12;
        g.fillStyle = c.fill;
        rr(g, px + inset, py + inset, ts - inset * 2, ts - inset * 2, ts * 0.16); g.fill();
      }
      // The car pips are drawn by `_drawHouseMarks`, AFTER the gate aprons: a
      // house is 1x1, so a driveway coming in from the south would otherwise
      // bury the one cue the kid reads off the tile (cars waiting).
    }
  }

  /** Car pips, painted over the gate apron like road markings. */
  _drawHouseMarks(world) {
    const list = world.houses;
    if (!Array.isArray(list) || !list.length) return;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    if (ts < 26) return;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h || !isFinite(h.x) || !isFinite(h.y)) continue;
      const px = cam.toX(h.x), py = cam.toY(h.y);
      if (px + ts < -ts || py + ts < -ts || px > this.W + ts || py > this.H + ts) continue;
      // Cars waiting, on the drive below the house — over the road asphalt on
      // purpose, like a road marking, so a 1x1 house has room for the cue at all.
      const cars = clamp(h.cars | 0, 0, 4), maxC = Math.max(1, h.maxCars | 0 || 2);
      const pr = ts * 0.055, gap = pr * 3;
      for (let k = 0; k < maxC; k++) {
        const cxp = px + ts / 2 + (k - (maxC - 1) / 2) * gap;
        g.fillStyle = k < cars ? '#ffffff' : 'rgba(255,255,255,0.22)';
        g.beginPath(); g.arc(cxp, py + ts * 0.925, pr, 0, Math.PI * 2); g.fill();
      }
    }
  }

  /* ---- destinations: a paved lot with a building standing on it ----
   * The whole property is ONE surface: the forecourt over the footprint, the drive
   * lane along the driveway tiles, and the lane's rounded ends landing exactly on
   * the connection-point centres, which is where the road layer's asphalt already
   * stops. So lot -> lane -> connection point -> road is a single continuous piece
   * of paving with one kerb around the outside and no seam anywhere.
   *
   * The building is drawn ON that lot, inset so a margin of forecourt shows all
   * round, and extruded down-right so it has a side and a shadow rather than
   * reading as a flat coloured rectangle.
   *
   * One office is drawn ONCE, by its primary part. A double office's two colours
   * are two records in `world.dests` sharing one footprint, and drawing per record
   * meant the shared lot was painted twice and — worse — each half applied its own
   * urgency lift, so a double office with one colour in trouble visibly tore in
   * half. The office now lifts as one building by the worst of its parts.
   */
  _drawDests(sim, world) {
    const list = world.dests;
    if (!Array.isArray(list) || !list.length) return;
    const cam = this.cam, ts = cam.ts;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d || !isFinite(d.x) || !isFinite(d.y)) continue;
      if (d.complex && d.complex !== d) continue;         // secondary half: drawn with its primary
      const w = Math.max(1, d.w | 0), h = Math.max(1, d.h | 0);
      const px = cam.toX(d.x), py = cam.toY(d.y);
      if (px + w * ts < -ts * 2 || py + h * ts < -ts * 2 ||
          px > this.W + ts * 2 || py > this.H + ts * 2) continue;
      this._drawOffice(d, ts, world);
    }
  }

  /** The urgency breathe, taken over every colour in the office: worst wins. */
  _officeLift(d, ts) {
    const parts = d.parts || [d];
    let lift = 0;
    for (let k = 0; k < parts.length; k++) {
      const t = parts[k] && parts[k].timer;
      if (!t || !(t.total > 0)) continue;
      const frac = clamp(t.left / t.total, 0, 1);
      if (frac >= 0.5) continue;
      const v = (1 - frac) * ts * 0.05 * (0.5 + 0.5 * Math.sin(this.time * 8));
      if (v > lift) lift = v;
    }
    return lift;
  }

  _drawOffice(d, ts, world) {
    const g = this.ctx, cam = this.cam;
    const parts = d.parts || [d];
    const lift = this._officeLift(d, ts);

    g.save();
    if (lift) g.translate(0, -lift);

    this._drawLot(g, d, cam, ts);
    this._repairJoins(g, d, world, cam, ts);
    this._drawBays(g, d, cam, ts);

    // --- the building: one silhouette, one or two coloured faces --------------
    const circle = (d.shape === 'circle');
    const inset = ts * 0.19;                    // margin of forecourt around the block
    const ubx = unionOfHalves(d);
    const ub = { x: ubx.x, y: ubx.y, w: ubx.w, h: ubx.h };   // scratch is reused below
    const ux = cam.toX(ub.x) + inset, uy = cam.toY(ub.y) + inset;
    const uw = ub.w * ts - inset * 2, uh = ub.h * ts - inset * 2;
    const rad = circle ? Math.min(uw, uh) / 2 : ts * 0.13;
    const ex = ts * 0.055, ey = ts * 0.075;     // extrusion: the block's near side
    /* The facade: the bottom third of a block, in shade, carrying the window row.
     * This is the thing that turns a flat coloured tile into a building.
     *
     * It lives INSIDE the block rather than hanging below it, because every variant
     * puts its driveway hard against one edge of the footprint, so an overhang
     * would land on the drive lane.
     *
     * EVERY colour gets its own facade, at the bottom of its own slice — not one
     * shared band across the union. On a side-by-side double the two slices share a
     * bottom edge, so that comes out as one continuous facade anyway; on a stacked
     * double it comes out as two storeys, which is what a two-unit complex is. One
     * shared band left the back half a flat plate with nothing on it. */
    const facOf = (sh) => Math.max(3, Math.min(sh * 0.32, ts * 0.62));

    // shadow, cast down-right past the extrusion and onto the forecourt
    g.fillStyle = 'rgba(0,0,0,0.32)';
    rr(g, ux + ex * 2.4, uy + ey * 2.4, uw, uh, rad); g.fill();

    // the near side, peeking out down-right. Each colour extrudes in its own deep
    // shade, so on a double it is the lower/right colour whose side you see.
    g.save();
    rr(g, ux + ex, uy + ey, uw, uh, rad); g.clip();
    for (let k = 0; k < parts.length; k++) {
      const s = this._halfSlice(parts[k], ub, ux, uy, uw, uh, ts);
      g.fillStyle = cls(parts[k].color).deep;
      g.fillRect(s.x + ex, s.y + ey, s.w, s.h);
    }
    g.restore();

    // roof + facade, per colour, clipped to the silhouette so a half never pokes
    // out of a rounded corner and the two halves abut with no gap. A circle gets
    // the same treatment and comes out a drum: elliptical roof, curved facade.
    g.save();
    rr(g, ux, uy, uw, uh, rad); g.clip();
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k], s = this._halfSlice(p, ub, ux, uy, uw, uh, ts);
      const c = cls(p.color);
      const fh2 = facOf(s.h), fy = s.y + s.h - fh2;
      g.fillStyle = c.fill;                                       // the roof
      g.fillRect(s.x, s.y, s.w, s.h);
      g.fillStyle = c.dark;                                       // the facade
      g.fillRect(s.x, fy, s.w, fh2);
      g.fillStyle = withAlpha('#ffffff', 0.22);                   // parapet edge
      g.fillRect(s.x, fy, s.w, Math.max(1, ts * 0.025));
      if (ts >= 22) this._drawWindows(g, s.x, fy, s.w, fh2, ts);
    }
    g.restore();

    // the seam between two colours, then one keyline round the whole building
    if (parts.length > 1) {
      g.strokeStyle = 'rgba(0,0,0,0.34)';
      g.lineWidth = Math.max(1, ts * 0.035);
      for (let k = 1; k < parts.length; k++) {
        const hb = parts[k].half;
        if (!hb) continue;
        g.beginPath();
        if (hb.x > ub.x) { const sx = cam.toX(hb.x); g.moveTo(sx, uy); g.lineTo(sx, uy + uh); }
        else { const sy = cam.toY(hb.y); g.moveTo(ux, sy); g.lineTo(ux + uw, sy); }
        g.stroke();
      }
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1.2, ts * 0.045);
    rr(g, ux, uy, uw, uh, rad); g.stroke();

    // the front door, in the facade, at the end of it the cars come in from.
    // Clipped to the silhouette like the roof is, so a door near a rounded corner
    // (or anywhere on a rotunda) is cut by the wall rather than poking out of it.
    if (ts >= 20) {
      g.save();
      rr(g, ux, uy, uw, uh, rad); g.clip();
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k], s = this._halfSlice(p, ub, ux, uy, uw, uh, ts);
        this._drawEntrance(g, s, this._entranceFrac(p, circle), facOf(s.h), ts);
      }
      g.restore();
    }

    // The pin queue, per colour, on the ROOF of that colour's own block. Never on
    // the facade: the windows live there, and a pin over a window row stops
    // reading as a person waiting and starts reading as noise. It used to be
    // pushed to one end to make room for the class emblem; with the emblem gone
    // the roof is its own, so it sits centred and can be as big as the roof allows.
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k], c = cls(p.color);
      const s = this._halfSlice(p, ub, ux, uy, uw, uh, ts);
      const roofH = Math.max(ts * 0.35, s.h - facOf(s.h));
      this._drawPins(g, p, c, s.x + s.w * 0.14, s.y, s.w * 0.72, roofH, ts);
    }
    g.restore();
  }

  /**
   * Where this colour's front door sits along its facade, as a 0..1 fraction of the
   * slice's width.
   *
   * It is ALWAYS the facade. This projection only draws a block's bottom edge as a
   * wall, so putting the door in whichever wall the bay actually touches — which is
   * what the first version did — drew it on the roof's far edge on every variant
   * whose driveway runs along the top (1c, 1d, 2b, 2d, 3a, 3b): a dark rounded
   * rectangle sitting on the roof with nothing to explain it.
   *
   * Horizontally it goes to the end the cars come in from, from the bay normal baked
   * in net.js: a lane beside the block puts the door hard against that side, a lane
   * above or below it puts the door over the bay's own tile.
   */
  _entranceFrac(p, circle) {
    // A rotunda's facade is a curve, so anything off-centre falls outside the
    // silhouette at door height. The centre is the only honest answer.
    if (circle || !p) return 0.5;
    if (p.bayNX) return p.bayNX > 0 ? 0.2 : 0.8;      // bayN points INTO the block
    const hb = p.half || p;
    if (!isFinite(p.doorX) || !hb || !(hb.w > 0)) return 0.5;
    return clamp((p.doorX + 0.5 - hb.x) / hb.w, 0.2, 0.8);
  }

  /**
   * The glazing on a facade band: ONE continuous dark glass strip divided by thin
   * light mullions, plus a lit sill under it.
   *
   * Not a row of pale rounded rectangles — that was the first version and it read
   * as a row of grey teeth stuck on the wall rather than as windows, because the
   * panes were light-on-dark at a size where each one was a solid blob. Glass is
   * darker than the wall it is set into and the bright bits are the frames, so
   * inverting it is what makes it read. Three fills, no per-pane path.
   */
  _drawWindows(g, x, y, w, h, ts) {
    const pad = Math.min(ts * 0.1, w * 0.12);
    const gx = x + pad, gw = w - pad * 2;
    if (gw <= 1) return;
    // High in the band on purpose: the bottom of the facade belongs to the doorway.
    const gy = y + h * 0.18, gh = Math.max(2, h * 0.42);
    g.fillStyle = 'rgba(10,10,40,0.45)';
    g.fillRect(gx, gy, gw, gh);
    const lw = Math.max(1, ts * 0.028);
    g.fillStyle = 'rgba(255,255,255,0.26)';
    g.fillRect(gx, gy + gh, gw, lw);                       // sill
    const n = clamp(Math.round(gw / (ts * 0.3)), 1, 10);   // mullions
    for (let k = 1; k < n; k++) g.fillRect(gx + gw * k / n - lw / 2, gy, lw, gh);
  }

  /**
   * One colour's slice of the building silhouette, in screen px. A half's own
   * edges are snapped to the silhouette's inset edges where they coincide with it,
   * so the two halves fill the shape edge to edge instead of each keeping its own
   * margin (which drew two boxes that happen to touch).
   * @returns {{x:number,y:number,w:number,h:number}} shared scratch — copy if kept
   */
  _halfSlice(p, ub, ux, uy, uw, uh, ts) {
    const cam = this.cam;
    const hb = (p && p.half) || p;
    const hx = hb.x | 0, hy = hb.y | 0;
    const hw = Math.max(1, hb.w | 0), hh = Math.max(1, hb.h | 0);
    const l = (hx === ub.x) ? ux : cam.toX(hx);
    const t = (hy === ub.y) ? uy : cam.toY(hy);
    const r2 = (hx + hw === ub.x + ub.w) ? ux + uw : cam.toX(hx + hw);
    const b2 = (hy + hh === ub.y + ub.h) ? uy + uh : cam.toY(hy + hh);
    _slice.x = l; _slice.y = t; _slice.w = r2 - l; _slice.h = b2 - t;
    return _slice;
  }

  /**
   * The front door: a dark opening standing on the ground at the bottom of this
   * colour's facade band.
   *
   * Dark, like the doors on the houses, because that is the one value that reads as
   * an opening against every one of the eight class colours — the first version
   * filled it with the forecourt grey and it looked like a smudge. It stands ON the
   * bottom edge rather than floating in the band: a door with wall under it reads as
   * a window.
   *
   * @param {{x:number,y:number,w:number,h:number}} s  this colour's block, screen px
   * @param {number} frac   where along the facade, 0..1 (see _entranceFrac)
   * @param {number} facH   this colour's facade band height
   */
  _drawEntrance(g, s, frac, facH, ts) {
    const w = Math.min(s.w * 0.24, ts * 0.4);
    const h = Math.min(facH * 0.62, s.h * 0.3);
    if (!(w > 1.5) || !(h > 1.5)) return;
    const m = ts * 0.1;                          // clear of the rounded corners
    const x = clamp(s.x + s.w * frac - w / 2, s.x + m, s.x + s.w - m - w);
    const y = s.y + s.h - h;
    g.fillStyle = 'rgba(10,10,40,0.8)';
    rr(g, x, y, w, h, Math.min(w, h) * 0.3); g.fill();
    // lintel: a light edge along the top, so the opening reads as recessed rather
    // than as a dark sticker laid on the wall
    g.fillStyle = 'rgba(255,255,255,0.34)';
    g.fillRect(x, y, w, Math.max(1, ts * 0.028));
  }

  /**
   * The lot's outline as the CURRENT path: footprint + drive lane, as one path so it
   * fills as one surface.
   *   - a rounded rect over the whole footprint (the lot)
   *   - a rounded lane along the driveway, its ends centred on the connection
   *     points, which is exactly where a road's asphalt stops
   *
   * Shared by the paint pass and by `_drawBays`, which clips to it so an angled bay
   * against the edge of the lot is cut off by the kerb instead of spilling onto grass.
   * @returns {{x:number,y:number,w:number,h:number}|null} the lane rect (scratch)
   */
  _lotPath(g, d, cam, ts) {
    const px = cam.toX(d.x), py = cam.toY(d.y);
    const pw = Math.max(1, d.w | 0) * ts, ph = Math.max(1, d.h | 0) * ts;
    const lane = this._laneRect(d);
    g.beginPath();
    rrPath(g, px, py, pw, ph, ts * 0.16);
    if (lane) rrPath(g, lane.x, lane.y, lane.w, lane.h, Math.min(lane.w, lane.h) / 2);
    return lane;
  }

  /**
   * Paint the lot. Stroking the union first and filling it after paints a kerb round
   * the outside only: every internal seam's stroke is inside the union, so the fill
   * covers it.
   */
  _drawLot(g, d, cam, ts) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    const lane = this._lotPath(g, d, cam, ts);
    const lr = lane ? Math.min(lane.w, lane.h) / 2 : 0;
    g.strokeStyle = COL.casing;
    g.lineWidth = Math.max(1.5, ts * LANE_KERB);
    g.stroke();
    g.fillStyle = COL.lot;
    g.fill();

    // the lane itself, a shade lighter: this is the bit cars use, and it is the
    // same asphalt as the road it runs out to meet
    if (lane) {
      g.fillStyle = COL.asphalt;
      rr(g, lane.x, lane.y, lane.w, lane.h, lr); g.fill();
    }
  }

  /**
   * Re-lay the road's asphalt across a connection point, so the lot's kerb does not
   * cut the road in half.
   *
   * The road layer looks seamless because it is painted in two GLOBAL passes: every
   * segment's casing first, then every segment's asphalt on top. No casing ever ends
   * up over asphalt, which is why one road meeting another has no dark line across
   * the join. The lot cannot join that party — it is drawn per-office, after the road
   * layer is already blitted — so its kerb (a ring 0.25..0.34 tiles out from the
   * connection point) lands on top of the road it is supposed to meet.
   *
   * Fix: finish the sandwich locally. For every direction out of the connection point
   * that actually carries a road, stroke that road's asphalt again, at the road's own
   * width, from the connection point outwards. The kerb survives on the flanks — as
   * casing does at a road T-junction — and the road runs straight through.
   *
   * Half a tile of reach is deliberate: it more than covers the 0.34 ring, and with a
   * round cap it stops inside the neighbouring tile, which by definition has road
   * asphalt of its own there (we only draw where an edge exists), so this can never
   * paint over a house or another lot.
   */
  _repairJoins(g, d, world, cam, ts) {
    const cn = d.conns;
    if (!world || !Array.isArray(cn) || !cn.length) return;
    const mask = typeof world.edgeMask === 'function';
    const has = typeof world.hasEdge === 'function';
    if (!mask && !has) return;
    const reach = ts * 0.5;
    g.strokeStyle = COL.asphalt;
    g.lineWidth = Math.max(1, ts * LANE_W);
    g.lineCap = 'round';
    g.beginPath();
    let any = false;
    for (let i = 0; i < cn.length; i++) {
      const c = cn[i];
      if (!c || !isFinite(c.x) || !isFinite(c.y)) continue;
      const m = mask ? (world.edgeMask(c.x, c.y) | 0) : 0;
      if (!m && !has) continue;                           // unroaded: keep its kerb
      const cx = cam.toX(c.x + 0.5), cy = cam.toY(c.y + 0.5);
      for (let dir = 0; dir < 8; dir++) {
        if (!(m & (1 << dir)) && !(has && world.hasEdge(c.x, c.y, dir))) continue;
        const dx = DX[dir], dy = DY[dir];
        const il = 1 / Math.sqrt(dx * dx + dy * dy);      // diagonals are longer
        g.moveTo(cx, cy);
        g.lineTo(cx + dx * il * reach, cy + dy * il * reach);
        any = true;
      }
    }
    if (any) g.stroke();
  }

  /**
   * The drive lane in screen px: the bounding box of every driveway tile centre
   * AND every connection-point centre, inflated by half the lane width. In every
   * office variant those tiles are collinear, so this is always a straight lane
   * whose rounded caps land on the connection points.
   * @returns {{x:number,y:number,w:number,h:number}|null} shared scratch
   */
  _laneRect(d) {
    const cam = this.cam, ts = cam.ts;
    const dr = d.drive, cn = d.conns;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (t) => {
      if (!t || !isFinite(t.x) || !isFinite(t.y)) return;
      const cx = t.x + 0.5, cy = t.y + 0.5;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
    };
    if (Array.isArray(dr)) for (let k = 0; k < dr.length; k++) add(dr[k]);
    if (Array.isArray(cn)) for (let k = 0; k < cn.length; k++) add(cn[k]);
    if (!isFinite(x0)) return null;
    const hw = LANE_W / 2;
    _lane.x = cam.toX(x0 - hw); _lane.y = cam.toY(y0 - hw);
    _lane.w = (x1 - x0 + LANE_W) * ts; _lane.h = (y1 - y0 + LANE_W) * ts;
    return _lane;
  }

  /**
   * The lot's car park: a BANK of marked spaces down the whole driveway — three on a
   * single office, seven on a double — each one the strip of forecourt between the
   * lane's asphalt and the wall, bounded by the two white lines a car park paints
   * between bays, and slanted at 45 degrees to the lane.
   *
   * The bank is baked in net.js (`d.lot`), because the slant of the space a car parks
   * in has to be the same number traffic drives along. Each space leans away from the
   * connection point nearest it, so a single reads as one uniform rank and a double as
   * a herringbone that meets in the middle — the way its two colours arrive.
   *
   * Drawn as ONE fill and ONE stroke over all N subpaths, deliberately: neighbouring
   * spaces share a side line, and two strokes at 0.34 alpha over each other would
   * make every internal line twice as bright as the two at the ends.
   */
  _drawBays(g, d, cam, ts) {
    if (ts < 14) return;
    const lot = d.lot;
    if (!lot || !Array.isArray(lot.spaces) || !lot.spaces.length) return;
    if (!isFinite(lot.cx) || !isFinite(lot.cy) || !isFinite(lot.pitch)) return;
    /* Depth: from the edge of the lane's asphalt out to the building's wall. It starts
     * ON the asphalt edge, not clear of a kerb, because every variant's driveway tiles
     * are INSIDE its footprint — so the lane has no kerb along its sides at all, only
     * round its ends — and a space this shallow needs every fraction of a tile it can
     * get: a 0.46-long car at 45 degrees spans 0.54 of depth, and there are only 0.41
     * of forecourt. Something has to overhang, and it is better to hang into the lane
     * (which is what an angled bay looks like) than through the wall. */
    const inr = BAY_IN, out = BAY_OUT;
    const run = out - inr;                           // the slant's travel along the lane
    const lead = run / 2;  // the slant is spread EITHER SIDE of the space's centre
                           // rather than running forward from it, which is what keeps
                           // the end spaces on the lot: net.js pitches the bank on the
                           // same assumption.
    const half = lot.pitch / 2;                      // half a space, along the lane
    const ltx = lot.tx, lty = lot.ty;
    const bx = cam.toX(lot.cx), by = cam.toY(lot.cy);  // the strip's centre, in px
    // Clipped to the lot, so no future variant can spill its markings onto the grass.
    g.save();
    this._lotPath(g, d, cam, ts);
    g.clip();
    /* A side line, in the lane's own frame: `o` is its offset along the strip from the
     * strip's centre and `sp.s` is which way the space leans, so the line runs from
     * (o - s*lead) at the mouth to (o + s*lead) at the wall — 45 degrees, leaning with
     * the traffic. Both the fill and the stroke are laid out from this one function so
     * the paint cannot come apart from itself. */
    const mouthX = (o, sp) => bx + ts * (ltx * (o - sp.s * lead) + sp.nx * inr);
    const mouthY = (o, sp) => by + ts * (lty * (o - sp.s * lead) + sp.ny * inr);
    const wallX = (o, sp) => bx + ts * (ltx * (o + sp.s * lead) + sp.nx * out);
    const wallY = (o, sp) => by + ts * (lty * (o + sp.s * lead) + sp.ny * out);
    const okSpace = (sp) => !!sp && isFinite(sp.a) && isFinite(sp.nx) && isFinite(sp.ny);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.beginPath();
    for (let i = 0; i < lot.spaces.length; i++) {
      const sp = lot.spaces[i];
      if (!okSpace(sp)) continue;
      const lo = sp.a - half, hi = sp.a + half;
      g.moveTo(mouthX(lo, sp), mouthY(lo, sp));
      g.lineTo(wallX(lo, sp), wallY(lo, sp));
      g.lineTo(wallX(hi, sp), wallY(hi, sp));
      g.lineTo(mouthX(hi, sp), mouthY(hi, sp));
      g.closePath();
    }
    g.fill();                                        // one fill: overlaps composite once
    // and the side lines: space i's upper line IS space i+1's lower line, so draw it
    // once — unless the lean flips between them (the middle of a double), where the two
    // are different lines and both belong.
    g.strokeStyle = 'rgba(255,255,255,0.34)';
    g.lineWidth = Math.max(1, ts * 0.03);
    g.lineCap = 'butt';
    g.beginPath();
    for (let i = 0; i < lot.spaces.length; i++) {
      const sp = lot.spaces[i];
      if (!okSpace(sp)) continue;
      const nxt = lot.spaces[i + 1];
      const lo = sp.a - half, hi = sp.a + half;
      g.moveTo(mouthX(lo, sp), mouthY(lo, sp)); g.lineTo(wallX(lo, sp), wallY(lo, sp));
      if (!okSpace(nxt) || nxt.s !== sp.s) {
        g.moveTo(mouthX(hi, sp), mouthY(hi, sp)); g.lineTo(wallX(hi, sp), wallY(hi, sp));
      }
    }
    g.stroke();
    g.restore();
  }

  /* ==========================================================================
   * Free-gate hints — "a road can land here".
   *
   * Roads terminate on gate tiles that are part of the footprint, from any of the
   * 8 directions, and the cached road layer already draws those edges all the way
   * to the gate tile's centre. Because that layer is blitted BEFORE the buildings,
   * the last half tile passes UNDER the coloured body, which is exactly the join
   * we want: the road slides beneath the house/office rather than being capped by
   * it. Nothing is painted back on top — an earlier version drew a casing+asphalt
   * apron over the body and it read as a road on the roof.
   *
   * What IS drawn on top is the inverse: a gate with NO road attached gets a faint
   * dashed ring, so the two legal corners of a 3x2 and the single corner of a 2x3
   * are discoverable before you connect them. That is the informational job the
   * deleted navigation arrows used to do, without a marker outside the block.
   *
   * Connectivity is `world.edgeMask(gate) !== 0` — O(1), no scanning. Costs one
   * fill + one stroke for the whole map and allocates nothing. Lives on the live
   * layer because it must sit above per-frame building art, and is pure
   * ts-relative geometry so it stays correct at every zoom step of the camera.
   * ========================================================================*/
  _drawGateHints(world) {
    if (!world) return;
    const g = this.ctx, ts = this.cam.ts;
    if (ts < 14) return;          // below this the ring is sub-pixel noise
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    this._joinPaths(world);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.38)';
    g.lineWidth = Math.max(1, ts * 0.04);
    _dash2[0] = _dash2[1] = Math.max(2, ts * 0.14);
    g.setLineDash(_dash2);
    g.stroke();
    g.setLineDash(_dashOff);
  }

  /** Adds a ring to the current path for every gate with no road on it yet. */
  _joinPaths(world) {
    const hs = world.houses, ds = world.dests;
    if (Array.isArray(hs)) {
      for (let i = 0; i < hs.length; i++) this._joinBuilding(world, hs[i], true);
    }
    if (Array.isArray(ds)) {
      for (let i = 0; i < ds.length; i++) this._joinBuilding(world, ds[i], false);
    }
  }

  _joinBuilding(world, b, isHouse) {
    if (!b || !isFinite(b.x) || !isFinite(b.y)) return;
    const cam = this.cam, ts = cam.ts;
    const bw = Math.max(1, b.w | 0), bh = Math.max(1, b.h | 0);
    const px = cam.toX(b.x), py = cam.toY(b.y);
    if (px + bw * ts < -ts || py + bh * ts < -ts ||
        px > this.W + ts || py > this.H + ts) return;

    const gl = b.gates;
    if (Array.isArray(gl)) {
      for (let k = 0; k < gl.length; k++) {
        const t = gl[k];
        if (!t || !isFinite(t.x) || !isFinite(t.y)) continue;
        this._joinTile(world, t.x | 0, t.y | 0);
      }
      return;
    }
    // Drift guard: no gate list on this building. A house is its own gate; for a
    // bigger footprint ask the world, and if it cannot say, draw no hint rather
    // than guess a legal corner wrong.
    if (isHouse) { this._joinTile(world, b.x | 0, b.y | 0); return; }
    if (typeof world.isGate !== 'function') return;
    const x0 = b.x | 0, y0 = b.y | 0;
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        if (world.isGate(x, y)) this._joinTile(world, x, y);
      }
    }
  }

  _joinTile(world, tx, ty) {
    // A gate that already carries road needs no hint — the asphalt running under
    // the building is the join, and it is drawn by the cached road layer.
    const m = (typeof world.edgeMask === 'function') ? (world.edgeMask(tx, ty) | 0) : 0;
    if (m) return;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    const cxp = cam.toX(tx + 0.5), cyp = cam.toY(ty + 0.5);
    const r = ts * 0.2;
    g.moveTo(cxp + r, cyp);
    g.arc(cxp, cyp, r, 0, Math.PI * 2);
  }

  /**
   * Pin queue. The pip is sized to fit CAPACITY, not to fit the current count, so
   * one waiting person is one small pip and not a pip blown up to fill the whole
   * box — at a glance the number of people is the only thing that changes, and a box
   * that looks full IS full. (Fitting to the count was the v2 bug: two pins looked
   * barely different from one, because both filled the space.)
   *
   * Degrades on purpose: v1 shipped pip clusters that turned into an unreadable
   * smudge in portrait, so below SMALL_TS — or once the queue is over capacity or
   * over 9, or whenever the pip would be under ~2.6px — this draws one pin glyph
   * plus a numeral instead. The pip grid is aspect-aware, so the 2x3 (tall)
   * destinations stack their pips instead of squashing them into a row.
   */
  _drawPins(g, d, c, x, y, w, h, ts) {
    const pins = clamp(d.pins | 0, 0, 999);
    if (pins <= 0 || w <= 0 || h <= 0) return;
    const cap = Math.max(1, d.cap | 0 || 8);
    const colour = pins >= cap ? COL.danger : '#ffffff';

    // The grid the pips would need if this destination were FULL. Everything below
    // is drawn at that scale whatever the count actually is.
    const slots = clamp(cap, 1, 9);
    let bestR = 0, bestCols = 1;
    for (let cols = 1; cols <= slots; cols++) {
      const rows = Math.ceil(slots / cols);
      const r = Math.min(w / (cols * 2.7), h / (rows * 2.9));
      if (r > bestR) { bestR = r; bestCols = cols; }
    }
    if (bestCols > pins) bestCols = pins;    // a short queue still centres its row

    if (ts >= SMALL_TS && pins <= slots && bestR >= 2.6) {
      const rows = Math.ceil(pins / bestCols);
      for (let i = 0; i < pins; i++) {
        const r0 = Math.floor(i / bestCols), cc = i % bestCols;
        const inRow = Math.min(bestCols, pins - r0 * bestCols);
        const cxp = x + w / 2 + (cc - (inRow - 1) / 2) * bestR * 2.7;
        const cyp = y + h / 2 + (r0 - (rows - 1) / 2) * bestR * 2.9;
        pinGlyph(g, cxp, cyp, bestR, colour);
      }
    } else {
      const fs = clamp(Math.min(w * 0.4, h * 0.5), 9, 26);
      const pr = fs * 0.34;
      pinGlyph(g, x + w * 0.26, y + h / 2, pr, colour);
      g.font = fontFor(fs, true);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = colour;
      g.fillText('×' + pins, x + w * 0.26 + pr * 1.5, y + h / 2);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
  }

  /**
   * Radial countdown rings — the failure clock. Drawn last so nothing can
   * cover them, and escalating gold -> orange -> red with a widening,
   * pulsing ring as the time drains.
   */
  _drawTimers(world) {
    const list = world.dests;
    if (!Array.isArray(list) || !list.length) return;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d || !d.timer) continue;
      const total = +d.timer.total, left = +d.timer.left;
      if (!isFinite(total) || total <= 0 || !isFinite(left)) continue;
      const frac = clamp(left / total, 0, 1);
      // The clock belongs to ONE COLOUR, so it is sized and centred on that
      // colour's block — not on the whole footprint. On a double office the
      // footprint is 3x4, and a ring drawn from that swallows both halves and the
      // shared driveway, hiding the very pins it is warning about.
      const box = d.half || d;
      const w = Math.max(1, box.w | 0), h = Math.max(1, box.h | 0);
      const px = cam.toX(box.x + w / 2), py = cam.toY(box.y + h / 2);
      const R = Math.max(9, Math.min(w, h) * ts * 0.52);
      const colr = frac > 0.5 ? COL.gold : (frac > 0.25 ? COL.warn : COL.danger);
      const lw = Math.max(3, R * (0.16 + (1 - frac) * 0.14));
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (frac > 0.25 ? 5 : 11));

      // track
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = lw + 2;
      g.beginPath(); g.arc(px, py, R, 0, Math.PI * 2); g.stroke();
      // halo (alpha stack, not shadowBlur)
      g.strokeStyle = withAlpha(colr, 0.18 + 0.22 * pulse);
      g.lineWidth = lw + 6;
      g.beginPath(); g.arc(px, py, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.stroke();
      // the arc itself
      g.strokeStyle = colr; g.lineWidth = lw; g.lineCap = 'round';
      g.beginPath(); g.arc(px, py, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.stroke();
      g.lineCap = 'butt';
      // seconds remaining, once it is genuinely scary
      if (frac <= 0.5 && R >= 16) {
        g.font = fontFor(R * 0.6, true);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.beginPath(); g.arc(px, py, R * 0.52, 0, Math.PI * 2); g.fill();
        g.fillStyle = colr;
        g.fillText(String(Math.max(0, Math.ceil(left))), px, py + R * 0.03);
      }
    }
  }

  /* ---- cars ---- */
  /**
   * @param inside  true  -> only cars standing on a building footprint (drawn
   *                         before the buildings, so they pass under the roof)
   *                false -> only cars out on open road.
   * Two passes over the array is cheaper than sorting, and the pass that finds
   * nothing costs one `buildingAt` per car.
   */
  // `pass` picks which layer of cars to draw:
  //   'under'  — cars whose tile is a HOUSE (drawn beneath the house sprite)
  //   'ground' — everyone else on the ground (roads, driveways, office lots)
  //   'mway'   — cars crossing a MOTORWAY span (drawn ABOVE the elevated deck)
  // The three passes bracket the buildings and the motorway deck in drawWorld.
  _drawCars(sim, world, pass) {
    const traffic = sim && sim.traffic;
    const cars = traffic && traffic.cars;
    if (!Array.isArray(cars) || !cars.length) return;
    const at = (world && typeof world.buildingAt === 'function') ? world : null;
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    const L = Math.max(4, ts * 0.46), Wd = Math.max(3, ts * 0.3);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || !isFinite(c.x) || !isFinite(c.y)) continue;
      // Under-the-roof pass or on-top pass? ANY car whose tile is a HOUSE goes under
      // it — at all times, parked or moving — so a car is only ever seen out on the
      // road or its drive, never sitting on the roof. Waiting cars are still shown by
      // the pips in _drawHouseMarks, so hiding the sprite under the house loses no cue.
      //
      // Nothing on an office goes under, and the test is the tile type rather than
      // buildingAt() for exactly that reason: an office's CONNECTION POINT is open
      // land, but buildingAt() still answers with the office (it owns the tile so
      // traffic can ask "same building?"), so a car turning in off the road vanished
      // under the lot plate at the very moment the join is meant to read. A car on
      // the driveway or in its bay must stay on top too — the whole office is a
      // paved surface _drawDests paints over the road layer.
      const tx = Math.floor(c.x), ty = Math.floor(c.y);
      const onHouse = (at && typeof at.tileAt === 'function') ? at.tileAt(tx, ty) === T_HOUSE : false;
      // K_MOTORWAY === 1 in traffic.js: a car carries `linkKind` for the span it is on.
      const onMway = !onHouse && (c.linkKind | 0) === 1;
      const layer = onHouse ? 'under' : (onMway ? 'mway' : 'ground');
      if (layer !== pass) continue;
      const px = cam.toX(c.x), py = cam.toY(c.y);
      if (px < -ts || py < -ts || px > this.W + ts || py > this.H + ts) continue;

      // The pose is whatever traffic set, full stop — including the park manoeuvre
      // at a bay, which traffic drives because it is a real dwell in the sim, not a
      // drawing trick. (It used to be faked here by snapping the angle 45° to the
      // lane, which skewed a car that was still driving down the middle of it.)
      const ang = isFinite(c.angle) ? c.angle : 0;

      const k = cls(c.color);
      g.save();
      g.translate(px, py);
      g.rotate(ang);
      // one path, filled then stroked — the dark outline keeps the colour class
      // legible on grey asphalt for half the canvas ops of a second shape.
      if (ts >= 11) rr(g, -L / 2, -Wd / 2, L, Wd, Wd * 0.4);
      else { g.beginPath(); g.rect(-L / 2, -Wd / 2, L, Wd); }
      g.fillStyle = c.stuck ? shade(k.hex, -0.25) : k.fill;
      g.fill();
      g.strokeStyle = 'rgba(6,6,20,0.9)';
      g.lineWidth = Math.max(1, ts * 0.05);
      g.stroke();
      if (ts >= 16) {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(L * 0.1, -Wd * 0.34, Math.max(1, L * 0.16), Wd * 0.68);
      }
      if (c.carrying) {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(-L * 0.16, 0, Math.max(1.2, Wd * 0.24), 0, Math.PI * 2); g.fill();
      }
      // The jam cue is a flashing halo. Below ts 14 there is no room for it, so
      // the darkened body (above) carries the meaning instead.
      if (c.stuck && ts >= 14) {
        g.strokeStyle = withAlpha(COL.danger, 0.5 + 0.5 * Math.sin(this.time * 9));
        g.lineWidth = Math.max(1, ts * 0.045);
        rr(g, -L / 2, -Wd / 2, L, Wd, Wd * 0.4); g.stroke();
      }
      g.restore();
    }
  }

  /* ---- input previews ---- */
  /* ---- the grid of buildable spaces, shown only while a drag is live ----
   * Replaces the always-on playable-bounds frame and the baked plot grid: at rest
   * the map is clean open land, and the moment the player starts dragging a tool
   * the buildable rect lights up as a grid so they can see the spaces they have.
   * Empty (buildable) land gets a faint wash; blocked land (water, hill, a
   * building) is left alone so it reads as "not a space". */
  _drawBuildGrid(world) {
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    const b = world && world.bounds;
    if (!b || ts < 6) return;
    const x0 = b.x0 | 0, y0 = b.y0 | 0, x1 = b.x1 | 0, y1 = b.y1 | 0;
    const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
    const ox = cam.toX(x0), oy = cam.toY(y0);
    const w = cols * ts, h = rows * ts;

    // faint wash over the empty, buildable tiles
    if (typeof world.tileAt === 'function') {
      g.globalAlpha = 0.07;
      g.fillStyle = COL.glow;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (world.tileAt(x, y) !== T_EMPTY) continue;
          g.fillRect(cam.toX(x), cam.toY(y), ts, ts);
        }
      }
      g.globalAlpha = 1;
    }

    // grid lines across the whole buildable rect
    g.strokeStyle = 'rgba(162,155,254,0.30)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= cols; i++) { const px = ox + i * ts + 0.5; g.moveTo(px, oy); g.lineTo(px, oy + h); }
    for (let j = 0; j <= rows; j++) { const py = oy + j * ts + 0.5; g.moveTo(ox, py); g.lineTo(ox + w, py); }
    g.stroke();
  }

  _drawPreview(sim, world, ui) {
    const g = this.ctx, cam = this.cam, ts = cam.ts;
    const tile = (x, y, colour, alpha) => {
      g.globalAlpha = alpha == null ? 1 : alpha;
      g.strokeStyle = colour; g.lineWidth = Math.max(2, ts * 0.08);
      g.strokeRect(cam.toX(x) + 1, cam.toY(y) + 1, ts - 2, ts - 2);
      g.globalAlpha = 1;
    };

    // flashes (denied action / ghost explainer)
    const fl = ui.flashes;
    if (Array.isArray(fl)) {
      for (let i = 0; i < fl.length; i++) {
        const f = fl[i];
        if (!f || !isFinite(f.x) || !isFinite(f.y)) continue;
        const a = clamp(f.t, 0, 1);
        g.globalAlpha = a * 0.8;
        g.fillStyle = f.bad ? COL.danger : COL.glow;
        g.fillRect(cam.toX(f.x), cam.toY(f.y), ts, ts);
        g.globalAlpha = 1;
      }
    }

    // Where the selected one-off item would actually fit. Drawn BEFORE the hover
    // block, which returns early when there is no hover at all — and there never is
    // on a tablet, which is exactly where a player most needs telling.
    const sp = ui.spots;
    if (sp && sp.length && (ui.tool === 'roundabout' || ui.tool === 'lights')) {
      const r = ts * (ui.tool === 'roundabout' ? 0.34 : 0.17);
      g.globalAlpha = 0.55 + 0.25 * Math.sin((ui.time || 0) * 4);
      // gold, not glow: glow is within a shade of the asphalt, and every one of these
      // markers sits ON a road, so a pale ring read as more road furniture.
      g.strokeStyle = COL.gold;
      g.lineWidth = Math.max(1.5, ts * 0.07);
      // dashed, because a solid gold ring is already the "this lot wants cars" ring
      // round a destination. A dashed one reads as an invitation, not a state.
      g.setLineDash([Math.max(3, ts * 0.16), Math.max(3, ts * 0.13)]);
      g.beginPath();
      for (let i = 0; i + 1 < sp.length; i += 2) {
        const px = cam.toX(sp[i] + 0.5), py = cam.toY(sp[i + 1] + 0.5);
        g.moveTo(px + r, py);
        g.arc(px, py, r, 0, Math.PI * 2);
      }
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }

    const hv = ui.hover;
    if (!hv || hv.on === false || !isFinite(hv.x) || !isFinite(hv.y)) return;
    const ok = !!hv.ok;
    const good = COL.glow, bad = COL.danger;

    if (ui.tool === 'roundabout') {
      const s = ts * 3;
      g.globalAlpha = 0.9;
      g.strokeStyle = ok ? good : bad; g.lineWidth = Math.max(2, ts * 0.08);
      g.strokeRect(cam.toX(hv.x - 1) + 1, cam.toY(hv.y - 1) + 1, s - 2, s - 2);
      g.globalAlpha = 0.18; g.fillStyle = ok ? good : bad;
      g.fillRect(cam.toX(hv.x - 1), cam.toY(hv.y - 1), s, s);
      g.globalAlpha = 1;
    } else if (ui.tool === 'motorway' || ui.tool === 'bridge') {
      if (ui.pegA && isFinite(ui.pegA.x)) {
        // live preview from peg A to the finger
        const ax = cam.toX(ui.pegA.x + 0.5), ay = cam.toY(ui.pegA.y + 0.5);
        const bxp = cam.toX(hv.x + 0.5), byp = cam.toY(hv.y + 0.5);
        g.globalAlpha = 0.8;
        g.strokeStyle = ui.pegOk ? good : bad;
        g.lineWidth = Math.max(3, ts * 0.28);
        g.setLineDash([Math.max(4, ts * 0.3), Math.max(4, ts * 0.24)]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bxp, byp); g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        tile(ui.pegA.x, ui.pegA.y, COL.gold, 1);
        tile(hv.x, hv.y, ui.pegOk ? good : bad, 1);
      } else {
        tile(hv.x, hv.y, ok ? good : bad, 0.95);
      }
    } else if (ui.tool === 'eraser') {
      g.globalAlpha = 0.22; g.fillStyle = COL.danger;
      g.fillRect(cam.toX(hv.x), cam.toY(hv.y), ts, ts);
      g.globalAlpha = 1;
      tile(hv.x, hv.y, COL.danger, 1);
    } else {
      tile(hv.x, hv.y, ok ? good : bad, 0.9);
    }
  }
}

/* --------------------------------------------------------------------------
 * shared glyphs (also used by the shell's palette / cards)
 * ------------------------------------------------------------------------*/
export function arrowHead(g, x, y, ang, size) {
  const s = Math.max(2, size);
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath();
  g.moveTo(s * 0.5, 0); g.lineTo(-s * 0.4, s * 0.4); g.lineTo(-s * 0.15, 0);
  g.lineTo(-s * 0.4, -s * 0.4); g.closePath(); g.fill();
  g.restore();
}
export function pinGlyph(g, cx, cy, r, colour) {
  const rr2 = Math.max(1.2, r);
  g.fillStyle = colour || '#fff';
  g.beginPath();
  g.arc(cx, cy - rr2 * 0.25, rr2 * 0.75, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(cx - rr2 * 0.32, cy + rr2 * 0.2);
  g.lineTo(cx + rr2 * 0.32, cy + rr2 * 0.2);
  g.lineTo(cx, cy + rr2 * 1.15);
  g.closePath(); g.fill();
}
export function roadGlyph(g, cx, cy, r, colour) {
  g.strokeStyle = colour || '#fff';
  g.lineCap = 'round';
  g.lineWidth = Math.max(2, r * 0.62);
  g.beginPath(); g.moveTo(cx - r * 0.8, cy + r * 0.7); g.lineTo(cx + r * 0.8, cy - r * 0.7); g.stroke();
  g.strokeStyle = 'rgba(20,20,50,0.75)';
  g.lineWidth = Math.max(1, r * 0.12);
  g.setLineDash([Math.max(2, r * 0.24), Math.max(2, r * 0.24)]);
  g.beginPath(); g.moveTo(cx - r * 0.8, cy + r * 0.7); g.lineTo(cx + r * 0.8, cy - r * 0.7); g.stroke();
  g.setLineDash([]);
}
export function eraserGlyph(g, cx, cy, r, colour) {
  g.save(); g.translate(cx, cy); g.rotate(-0.5);
  g.fillStyle = colour || '#fff';
  rr(g, -r * 0.75, -r * 0.5, r * 1.5, r, r * 0.22); g.fill();
  g.fillStyle = 'rgba(20,20,50,0.55)';
  rr(g, -r * 0.75, -r * 0.5, r * 0.6, r, r * 0.22); g.fill();
  g.restore();
}
export function motorwayGlyph(g, cx, cy, r, colour) {
  g.strokeStyle = colour || '#fff'; g.lineCap = 'round';
  g.lineWidth = Math.max(2, r * 0.34);
  g.beginPath(); g.moveTo(cx - r * 0.85, cy + r * 0.5); g.lineTo(cx + r * 0.85, cy - r * 0.5); g.stroke();
  g.strokeStyle = COL.gold; g.lineWidth = Math.max(1, r * 0.12);
  g.setLineDash([Math.max(2, r * 0.3), Math.max(2, r * 0.22)]);
  g.beginPath(); g.moveTo(cx - r * 0.85, cy + r * 0.5); g.lineTo(cx + r * 0.85, cy - r * 0.5); g.stroke();
  g.setLineDash([]);
  g.fillStyle = colour || '#fff';
  g.beginPath(); g.arc(cx - r * 0.85, cy + r * 0.5, r * 0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + r * 0.85, cy - r * 0.5, r * 0.2, 0, Math.PI * 2); g.fill();
}
export function roundaboutGlyph(g, cx, cy, r, colour) {
  g.strokeStyle = colour || '#fff';
  g.lineWidth = Math.max(2, r * 0.3);
  g.beginPath(); g.arc(cx, cy, r * 0.6, 0, Math.PI * 1.55); g.stroke();
  g.fillStyle = colour || '#fff';
  arrowHead(g, cx + r * 0.6, cy - r * 0.05, -Math.PI / 2, r * 0.55);
}
export function lightsGlyph(g, cx, cy, r, colour) {
  g.fillStyle = 'rgba(10,10,30,0.8)';
  rr(g, cx - r * 0.42, cy - r * 0.85, r * 0.84, r * 1.7, r * 0.24); g.fill();
  g.strokeStyle = colour || '#fff'; g.lineWidth = Math.max(1, r * 0.12);
  rr(g, cx - r * 0.42, cy - r * 0.85, r * 0.84, r * 1.7, r * 0.24); g.stroke();
  const rad = r * 0.2;
  g.fillStyle = COL.danger;
  g.beginPath(); g.arc(cx, cy - r * 0.48, rad, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,211,42,0.4)';
  g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2ecc71';
  g.beginPath(); g.arc(cx, cy + r * 0.48, rad, 0, Math.PI * 2); g.fill();
}
export function bridgeGlyph(g, cx, cy, r, colour, tunnel) {
  g.strokeStyle = colour || '#fff'; g.lineCap = 'butt';
  if (tunnel) {
    g.lineWidth = Math.max(2, r * 0.2);
    g.beginPath(); g.arc(cx, cy + r * 0.45, r * 0.75, Math.PI, 0); g.stroke();
    g.fillStyle = 'rgba(10,10,30,0.85)';
    g.beginPath(); g.arc(cx, cy + r * 0.45, r * 0.55, Math.PI, 0); g.fill();
    g.fillStyle = colour || '#fff';
    g.fillRect(cx - r * 0.85, cy + r * 0.45, r * 1.7, Math.max(2, r * 0.16));
  } else {
    g.lineWidth = Math.max(2, r * 0.18);
    g.beginPath(); g.moveTo(cx - r * 0.9, cy - r * 0.2); g.lineTo(cx + r * 0.9, cy - r * 0.2); g.stroke();
    g.beginPath();
    g.moveTo(cx - r * 0.9, cy + r * 0.55);
    g.quadraticCurveTo(cx, cy - r * 0.85, cx + r * 0.9, cy + r * 0.55);
    g.stroke();
    g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath();
    g.moveTo(cx - r * 0.45, cy - r * 0.2); g.lineTo(cx - r * 0.45, cy + r * 0.1);
    g.moveTo(cx + r * 0.45, cy - r * 0.2); g.lineTo(cx + r * 0.45, cy + r * 0.1);
    g.stroke();
  }
  g.lineCap = 'round';
}
export function tripGlyph(g, cx, cy, r, colour) {
  g.fillStyle = colour || '#fff';
  rr(g, cx - r * 0.9, cy - r * 0.4, r * 1.8, r * 0.8, r * 0.32); g.fill();
  g.fillStyle = 'rgba(10,10,30,0.7)';
  g.beginPath(); g.arc(cx - r * 0.45, cy + r * 0.42, r * 0.26, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + r * 0.45, cy + r * 0.42, r * 0.26, 0, Math.PI * 2); g.fill();
}

/**
 * Current green axis for a traffic light: 0 = N/S, 1 = E/W.
 * CONTRACT GAP: `world.lights` entries are specified as `{id,x,y}` only, so the
 * live green axis is not exposed. We read any of the optional fields traffic.js
 * might add; failing that we fall back to a purely COSMETIC 6s alternation so
 * the tile still reads as "a signalled junction that alternates".
 */
export function greenAxis(L, time) {
  if (typeof L.greenAxis === 'number') return L.greenAxis > 0 ? 1 : 0;
  if (typeof L.axis === 'number') return L.axis > 0 ? 1 : 0;
  if (typeof L.green === 'boolean') return L.green ? 1 : 0;
  if (typeof L.greenDir === 'number' && L.greenDir >= 0) return (L.greenDir % 4 === 0) ? 0 : 1;
  const phase = ((L.id | 0) % 2) * 3;
  return (Math.floor((time + phase) / 3) % 2) === 0 ? 0 : 1;
}
