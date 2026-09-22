// Waypoints — the map palette. Everything you can put on a map lives here.
// Coordinates everywhere are in GRID-CELL UNITS: x in [0,cols], y in [0,rows].

import { drawIcon, iconAspect, CAMPSITE_NUM_BOX } from './icons.js';
export { loadIcons, drawIcon, iconAspect, iconPattern } from './icons.js';

export const GRID = { cols: 6, rows: 4 };

export const COLOR = {
  paper:   '#dfe7d8',
  surround:'#c3cbbd',   // the desk the sheet lies on, outside the board
  ink:     '#1c2530',
  contour: '#8d7f63',
  contourMajor: '#6d6047',
  water:   '#2f74b5',
  waterFill:'#7fb2dd',
  wood:    '#5f8f6d',
  woodFill:'#9dc2a4',
  salmon:  '#f0836c',
  grid:    '#2b4a72',
  sel:     '#6c5ce7',
  glow:    '#a29bfe',
  unfinished: '#d98324',   // a line with a loose end
  complete:   '#2fae66',   // the pulse when one closes
  noLevel:    '#b06a9e',   // drawn, but no height assigned yet
};

// ---------------------------------------------------------------- level colours
// A hypsometric ramp: the tint a level gets on the map and the colour that band
// of ground gets in 3D. Both views read from here so they always agree.
const LEVEL_STOPS = [
  [0,  [124, 163, 112]],   // bare sheet
  [1,  [150, 181, 108]],
  [2,  [186, 198, 106]],
  [3,  [216, 205, 108]],
  [4,  [227, 189,  99]],
  [5,  [222, 166,  90]],
  [6,  [210, 142,  84]],
  [7,  [194, 120,  80]],
  [8,  [173, 102,  80]],
  [9,  [153,  92,  84]],
  [10, [163, 125, 122]],
  [12, [238, 240, 243]],   // snow
];

export function levelRGB(level) {
  const lv = Math.max(0, Math.min(12, level == null ? 0 : level));
  let a = LEVEL_STOPS[0], b = LEVEL_STOPS[LEVEL_STOPS.length - 1];
  for (let i = 0; i < LEVEL_STOPS.length - 1; i++) {
    if (lv >= LEVEL_STOPS[i][0] && lv <= LEVEL_STOPS[i + 1][0]) { a = LEVEL_STOPS[i]; b = LEVEL_STOPS[i + 1]; break; }
  }
  const t = b[0] === a[0] ? 0 : (lv - a[0]) / (b[0] - a[0]);
  return [0, 1, 2].map((k) => Math.round(a[1][k] + (b[1][k] - a[1][k]) * t));
}
export function levelColor(level, alpha = 1) {
  const [r, g, b] = levelRGB(level);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
/** A darker relative of the level's tint, for the contour line itself. */
export function levelInk(level) {
  const [r, g, b] = levelRGB(level);
  return `rgb(${Math.round(r * 0.52)},${Math.round(g * 0.44)},${Math.round(b * 0.40)})`;
}

// ---------------------------------------------------------------- waypoints
export const WAYPOINTS = {
  bear:     { label:'Bear',      key:'1', track:'bear',   color:'#12161c' },
  rabbit:   { label:'Rabbit',    key:'2', track:'rabbit', color:'#12161c' },
  bird:     { label:'Bird',      key:'3', track:'bird',   color:'#12161c' },
  trig:     { label:'Trig Point',key:'4', track:'trig',   color:'#16233a' },
  mountain: { label:'Mountain',  key:'5', track:'mountain',color:'#12161c', field:'height', fieldLabel:'Height (m)', fieldDefault:500 },
  lookout:  { label:'Lookout',   key:'6', track:'lookout',color:'#12161c' },
  gear:     { label:'Gear',      key:'7', track:'gear',   color:'#12161c' },
  campsite: { label:'Campsite',  key:'8', track:null,     color:'#f0836c', field:'number', fieldLabel:'Number', fieldDefault:1 },
};
export const WAYPOINT_KEYS = Object.keys(WAYPOINTS);

// ---------------------------------------------------------------- decoration
// A decoration is one point that says "this sort of thing grows around here".
// It is never drawn where you put it: both views scatter it over a radius, from
// the same seed, so the flat map and the terrain agree without being literal.
// `count` is the base number at density 1; the map's Vegetation density scales
// all three together, so a placement never carries its own density.
// `icon` names the traced artwork in icons/. All three marks come from the map.
// `scale` sizes the mark against ICON_H.decor: grass is a tuft, a tree is a tree.
export const DECOR = {
  grass: { label: 'Grass',       key: 'z', ink: '#5f8447', wash: '#9dbd77', count: 22, radius: 0.30, icon: 'dec-grass', scale: 0.25 },
  pine:  { label: 'Pine trees',  key: 'x', ink: '#2f5c39', wash: '#6f9c72', count: 12, radius: 0.26, icon: 'dec-pine',  scale: 0.5 },
  bushy: { label: 'Bushy trees', key: 'c', ink: '#416f38', wash: '#86ad78', count: 10, radius: 0.26, icon: 'dec-bushy', scale: 0.5 },
};

/** How tall a decoration's mark draws, given the map's base decoration height. */
export const decorH = (type, base) => base * ((DECOR[type] || DECOR.grass).scale ?? 1);
export const DECOR_KEYS = Object.keys(DECOR);

/**
 * Deterministic scatter for a decoration, in cell units. Same points every time.
 *
 * `opts.count` overrides the type's base number (the map's density setting does
 * this). `opts.reject(x, y)` drops a candidate — used to keep plants out of the
 * water. Candidates are oversampled so a stand beside a lake still fills out.
 */
export function decorPoints(dec, opts = {}) {
  const def = DECOR[dec.type] || DECOR.grass;
  const n = Math.max(1, Math.round(opts.count ?? def.count));
  const r = dec.radius ?? def.radius;
  let h = 2166136261;
  for (let i = 0; i < (dec.id || '').length; i++) {
    h ^= dec.id.charCodeAt(i); h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const reject = opts.reject;
  const out = [];
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;               // even spread, not centre-heavy
    const x = dec.x + Math.cos(a) * d;
    const y = dec.y + Math.sin(a) * d * 0.82;
    const sc = 0.75 + rnd() * 0.5;
    if (reject && reject(x, y)) continue;
    out.push([x, y, sc]);
  }
  return out;
}

/**
 * One decoration mark, standing on (0,0), `h` tall in the current units.
 *
 * Bushy uses the printed clover tree. The fir and the grass tufts are drawn to
 * match the marks on the map — they keep their shape at any zoom, which a
 * bitmap of a 15-pixel photo detail never would.
 */
export function drawDecorGlyph(ctx, type, h, scale = 1, halo = false) {
  const s = h * scale;
  const def = DECOR[type] || DECOR.grass;
  if (def.icon) {
    if (drawIcon(ctx, def.icon, 0, 0, s, { anchor: 'bottom', color: def.ink })) return;
  }
  ctx.save();
  ctx.lineCap = 'round';
  if (halo) {
    // a pale outline so the mark reads over the traced photo underneath
    ctx.save();
    ctx.strokeStyle = 'rgba(247,250,240,0.8)'; ctx.lineWidth = s * 0.3;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    decorPath(ctx, type, s); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = def.ink;
  ctx.lineWidth = s * 0.12; ctx.lineJoin = 'round';
  decorPath(ctx, type, s); ctx.stroke();
  ctx.restore();
}

function decorPath(ctx, type, s) {
  ctx.beginPath();
  if (type === 'pine') {
    // the map's fir: a trunk with three tiers of drooping branches
    ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.95);
    for (const [y, w] of [[0.22, 0.38], [0.46, 0.30], [0.68, 0.20]]) {
      ctx.moveTo(-s * w, -s * (y - 0.06));
      ctx.lineTo(0, -s * (y + 0.16));
      ctx.lineTo(s * w, -s * (y - 0.06));
    }
  } else if (type === 'bushy') {
    // fallback while the traced tree is still loading
    ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.4);
    ctx.moveTo(s * 0.34, -s * 0.66); ctx.arc(0, -s * 0.66, s * 0.34, 0, 6.2832);
  } else {
    // the map's grass: three short tufts, the middle one tallest
    ctx.moveTo(-s * 0.30, 0); ctx.quadraticCurveTo(-s * 0.40, -s * 0.34, -s * 0.22, -s * 0.56);
    ctx.moveTo(0, 0); ctx.quadraticCurveTo(-s * 0.06, -s * 0.42, s * 0.04, -s * 0.80);
    ctx.moveTo(s * 0.30, 0); ctx.quadraticCurveTo(s * 0.40, -s * 0.34, s * 0.22, -s * 0.56);
  }
}

// ---------------------------------------------------------------- tools
export const TOOLS = [
  { id:'select',   label:'Select',    key:'v', hint:'Drag shapes and points. Alt-click a point to delete it.' },
  { id:'contour',  label:'Contour',   key:'c', hint:'Click to lay points. Enter finishes — end near the start to close the ring. Esc cancels. [ and ] change level.' },
  { id:'river',    label:'River',     key:'r', hint:'Click along the watercourse. Enter finishes.' },
  { id:'lake',     label:'Lake',      key:'l', hint:'Click round the shore. Enter closes.' },
  { id:'woodland', label:'Woodland',  key:'w', hint:'Click round the wood. Enter closes.' },
  { id:'waypoint', label:'Waypoint',  key:'q', hint:'Pick a type below, then click to place.' },
  { id:'bridge',   label:'Bridge',    key:'b', hint:'Click where the river is crossable.' },
  { id:'decor',    label:'Decoration',key:'d', hint:'Pick grass, pine or bushy below, then click. It seeds an area, not a single plant.' },
  { id:'label',    label:'Text',      key:'t', hint:'Click to drop a label, then type the name and set its size and angle.' },
];

// ---------------------------------------------------------------- icon drawing
// The symbols are the printed ones, cropped out of the rules PDF — see
// icons.js. Everything below sizes them in whatever units the caller is in, so
// the map editor can draw them in grid-cell units and let them scale with zoom.


/** The artwork each waypoint type uses. */
export const WAYPOINT_ICON = {
  bear: 'wp-bear', rabbit: 'wp-rabbit', bird: 'wp-bird', trig: 'wp-trig',
  mountain: 'wp-mountain', lookout: 'wp-lookout', gear: 'wp-gear', campsite: 'wp-campsite',
};

// Heights in GRID-CELL UNITS, for drawing inside the map transform. One cell is
// 2.5 km of park, so 0.15 of a cell is a symbol about the size of the printed one.
export const ICON_H = {
  waypoint: 0.15,
  bridge:   0.085,
  feature:  0.14,     // the lake and woodland roundel, as one tile of the fill
  decor:    0.119,    // scaled per type by DECOR[].scale
};

// A lake and a wood are FILLED with their own symbol rather than labelled by one.
// The artwork is square (see icons/_work), so `size` is both the symbol's scale
// and the tile pitch: copies butt together with no gap.
export const FEATURE_TILE = { size: 0.2, alpha: 0.62 };
export const FEATURE_FILL = { lakes: 'lake-tile', woodland: 'woodland-tile' };

// Per-type size relative to ICON_H.waypoint. The ring below the symbol stays the
// same size whatever this is, because the ring is the waypoint.
export const ICON_SCALE = { campsite: 1.15, mountain: 0.5 };

/**
 * Draw a waypoint anchored on its RING — (0, 0) is the orange circle you cross
 * off, which is the waypoint's actual position on the ground. The symbol stands
 * on top of it. `h` is the standard waypoint height in the current units; the
 * symbol may be drawn smaller (see ICON_SCALE) without moving anything else.
 *
 * `opts.text` is the mountain's height or the campsite's number.
 */
export function drawWaypointIcon(ctx, type, h, opts = {}) {
  const def = WAYPOINTS[type];
  if (!def) return;
  const name = WAYPOINT_ICON[type];
  const art = h * (ICON_SCALE[type] || 1);
  const foot = -h * 0.30;                       // symbols stand on this line
  const drawn = drawIcon(ctx, name, 0, foot, art, { anchor: 'bottom', color: opts.color || null });

  if (type === 'campsite' && opts.text != null && opts.text !== '') {
    // The numeral goes back into the space it was lifted out of. Its height and
    // vertical place come from that space; horizontally it is centred on the
    // flame rather than on the hole, which the print set a little to the left.
    const [, by, , bh] = CAMPSITE_NUM_BOX;
    ctx.save();
    ctx.fillStyle = COLOR.paper;
    ctx.font = `700 ${bh * art * 1.16}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.text), 0, foot - art + (by + bh / 2) * art);
    ctx.restore();
  }

  if (opts.space !== false) {
    ctx.save();
    ctx.lineWidth = h * 0.07; ctx.strokeStyle = COLOR.salmon; ctx.fillStyle = '#f6d9d1';
    ctx.beginPath(); ctx.arc(0, 0, h * 0.2, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  if (type === 'mountain' && opts.text != null && opts.text !== '') {
    const y = opts.space === false ? foot + h * 0.12 : h * 0.36;
    ctx.save();
    ctx.fillStyle = COLOR.ink;
    ctx.font = `700 ${h * 0.42}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = h * 0.12; ctx.strokeStyle = 'rgba(223,231,216,0.92)'; ctx.lineJoin = 'round';
    ctx.strokeText(`${opts.text}m`, 0, y);
    ctx.fillText(`${opts.text}m`, 0, y);
    ctx.restore();
  }
  return drawn;
}

/** The box a waypoint occupies above and below its ring, for hit rings. */
export function waypointExtent(h) {
  return { top: -h * (0.30 + 1.15), bottom: h * 0.75 };
}
