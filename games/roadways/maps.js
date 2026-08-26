/**
 * maps.js — authored level loader for Roadways.
 *
 * Levels are AUTHORED in an external editor and exported as a single bundle
 * (`maps.json`) holding many maps. This module turns that editor format into the
 * flat, typed-array form `World` wants, and NOTHING else: it is DOM-free apart
 * from the one `fetch` in `loadBundle`, so it can be unit-tested in Node.
 *
 * The bundle is data, not code. Adding a level is dropping a new export over
 * `maps.json` — no change in here, in net.js, or in the shell. That is the whole
 * point of the schema check below: if the editor's format moves on, we say so
 * loudly at load instead of silently compiling a map full of holes.
 *
 * ---- editor format (schema 'mm-map-bundle/1' / 'mm-map/3') -----------------
 *   { schema, exportedAt, maps: [ {
 *       schema, id, name,
 *       grid: { cols, rows },                 // the whole world grid
 *       image: {...},                         // reference art for the editor only
 *       layers: [ { name, color, cells: [[x, y, kind], ...] } ]
 *   } ] }
 *
 * Four layers are meaningful, matched by NAME (case-insensitive, substring):
 *   boundary   non-playable. Never buildable, and it bounds how far the camera
 *              will ever zoom out. A MASK, not a frame — it can be any shape.
 *   water      terrain. Blocks roads; bridgeable.
 *   mountain   terrain. Blocks roads; tunnelable.
 *   start      the opening playable rectangle. Authored as filled cells; we take
 *              their bounding box, so a sloppy edge does not matter.
 *
 * Boundary and terrain are INDEPENDENT, and compile to separate arrays. They have
 * to be: on Los Angeles two thirds of the water is drawn outside the boundary, and
 * a single "off-map wins" array would throw that ocean away — leaving the game with
 * nothing to draw off the coast, when drawing exactly that is the whole point of
 * the boundary layer being "where you zoom out to" rather than "where the map ends".
 *
 * The reference `image` block is editor furniture (it is the author's tracing art)
 * and is ignored here.
 *
 * `kind` is 'full' or one of 'nw' | 'ne' | 'se' | 'sw' — a corner half-tile the
 * author uses to shape a coastline against the reference image. Half-tiles are
 * FULL terrain for gameplay (see P_* note below); the corner survives only as a
 * hint the renderer uses to soften that tile's shoreline.
 */

import { P_WATER, P_MOUNTAIN, S_FULL, S_NW, S_NE, S_SE, S_SW } from './net.js';

export const BUNDLE_URL = './maps.json';

const BUNDLE_SCHEMA = 'mm-map-bundle/';
const MAP_SCHEMA = 'mm-map/';

const SHAPE_OF = { full: S_FULL, nw: S_NW, ne: S_NE, se: S_SE, sw: S_SW };

const MIN_DIM = 4;          // World's own floor; smaller is a broken export
const MAX_DIM = 512;        // 512x512 = 262k cells x ~10 layers — the sane ceiling

function major(schema, prefix) {
  return typeof schema === 'string' && schema.indexOf(prefix) === 0;
}

function layerNamed(map, want) {
  const list = Array.isArray(map.layers) ? map.layers : [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    const n = (l && typeof l.name === 'string') ? l.name.toLowerCase() : '';
    if (n.indexOf(want) >= 0) return l;
  }
  return null;
}

/**
 * Compile ONE editor map into World's input form.
 *
 * @returns {{
 *   id: string, name: string, cols: number, rows: number,
 *   plan: Uint8Array,      // P_* terrain per cell, row-major, cols wide
 *   out: Uint8Array,       // 1 = non-playable (boundary layer)
 *   shape: Uint8Array,     // S_* per cell — render hint only
 *   start: {x0,y0,x1,y1},  // opening playable rect
 *   playable: {x0,y0,x1,y1}, // bounding box of every non-boundary cell
 *   water: number, mountain: number,   // PLAYABLE terrain cells only
 *   terrain: 'water'|'mountain'
 * }}
 * @throws {Error} on anything the game cannot play
 */
export function compileMap(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('map: not an object');
  if (!major(raw.schema, MAP_SCHEMA)) {
    throw new Error('map: unsupported schema ' + JSON.stringify(raw.schema));
  }
  const grid = raw.grid || {};
  const cols = grid.cols | 0, rows = grid.rows | 0;
  if (cols < MIN_DIM || rows < MIN_DIM || cols > MAX_DIM || rows > MAX_DIM) {
    throw new Error('map: grid ' + cols + 'x' + rows + ' out of range');
  }

  const n = cols * rows;
  const plan = new Uint8Array(n);      // P_LAND is 0 — no fill needed
  const out = new Uint8Array(n);
  const shape = new Uint8Array(n);
  const start = new Uint8Array(n);

  paintTerrain(layerNamed(raw, 'water'), P_WATER);
  paintTerrain(layerNamed(raw, 'mountain'), P_MOUNTAIN);
  paintMask(layerNamed(raw, 'boundary'), out);
  paintMask(layerNamed(raw, 'start'), start);

  function each(layer, fn) {
    if (!layer || !Array.isArray(layer.cells)) return;
    const cells = layer.cells;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      if (!c) continue;
      const x = c[0] | 0, y = c[1] | 0;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;   // export slop
      fn(y * cols + x, c[2]);
    }
  }
  function paintTerrain(layer, code) {
    each(layer, (i, kind) => {
      plan[i] = code;
      const s = SHAPE_OF[kind];
      if (s) shape[i] = s;
    });
  }
  function paintMask(layer, mask) { each(layer, (i) => { mask[i] = 1; }); }

  let water = 0, mountain = 0;
  let px0 = cols, py0 = rows, px1 = -1, py1 = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (out[i]) continue;
      const v = plan[i];
      // Counted inside the playable area only, because the count exists to answer
      // "is a span reward any use on this map" — an ocean the player can never
      // reach is not an obstacle, it is a backdrop.
      if (v === P_WATER) water++;
      else if (v === P_MOUNTAIN) mountain++;
      if (x < px0) px0 = x;
      if (x > px1) px1 = x;
      if (y < py0) py0 = y;
      if (y > py1) py1 = y;
    }
  }
  if (px1 < px0 || py1 < py0) throw new Error('map: every cell is boundary');

  const s = bbox(start, cols, rows);
  if (!s) throw new Error('map: no start layer — nowhere to begin');
  // Clamp the opening rect into the playable box. An author who nudges the start
  // rect a cell into the mask should get a playable board, not a run with a
  // permanently dead column down one side.
  s.x0 = Math.max(s.x0, px0); s.y0 = Math.max(s.y0, py0);
  s.x1 = Math.min(s.x1, px1); s.y1 = Math.min(s.y1, py1);
  if (s.x1 - s.x0 < 1 || s.y1 - s.y0 < 1) throw new Error('map: start rect is degenerate');

  return {
    id: String(raw.id || ''),
    name: String(raw.name || 'Unnamed'),
    cols: cols, rows: rows,
    plan: plan, out: out, shape: shape,
    start: s,
    playable: { x0: px0, y0: py0, x1: px1, y1: py1 },
    water: water, mountain: mountain,
    // One label per map, because it only ever names the SPAN reward ("bridge" vs
    // "tunnel"); the span itself crosses water and rock alike, so a mixed map is
    // playable either way and the commoner terrain gives the honester word.
    terrain: mountain > water ? 'mountain' : 'water'
  };
}

function bbox(mask, cols, rows) {
  let x0 = cols, y0 = rows, x1 = -1, y1 = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!mask[y * cols + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < x0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
}

/**
 * Compile a whole bundle. One bad map is SKIPPED, not fatal: the user edits this
 * file by hand between sessions, and a typo in level 7 must not cost them level 1.
 * @returns {{maps: Array<object>, errors: string[]}}
 */
export function compileBundle(raw) {
  const out = { maps: [], errors: [] };
  if (!raw || typeof raw !== 'object') {
    out.errors.push('bundle: not an object');
    return out;
  }
  if (!major(raw.schema, BUNDLE_SCHEMA)) {
    out.errors.push('bundle: unsupported schema ' + JSON.stringify(raw.schema));
    return out;
  }
  const list = Array.isArray(raw.maps) ? raw.maps : [];
  for (let i = 0; i < list.length; i++) {
    try {
      out.maps.push(compileMap(list[i]));
    } catch (e) {
      out.errors.push('map[' + i + ']: ' + (e && e.message ? e.message : e));
    }
  }
  if (!out.maps.length && !out.errors.length) out.errors.push('bundle: no maps');
  return out;
}

/**
 * Fetch + compile the bundle. NEVER throws: a missing or broken file returns
 * zero maps and the shell falls back to the procedural generator, so the game
 * still starts on a machine where maps.json did not ship.
 */
export async function loadBundle(url) {
  const u = url || BUNDLE_URL;
  try {
    const res = await fetch(u, { cache: 'no-cache' });
    if (!res.ok) return { maps: [], errors: [u + ': HTTP ' + res.status] };
    return compileBundle(await res.json());
  } catch (e) {
    return { maps: [], errors: [u + ': ' + (e && e.message ? e.message : e)] };
  }
}
