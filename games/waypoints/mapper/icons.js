// Waypoints — the real artwork, lifted straight out of the rules PDF.
//
// Every symbol in ../assets/icons/ is black-on-transparent: the alpha channel carries
// the original ink, so a mid-grey in the print (the bridge deck, the lake's
// waves) comes through as half-alpha and still reads correctly when the icon is
// re-coloured. Nothing here is re-drawn by hand.
//
// Icons draw in whatever units the current canvas transform is in. The map
// editor calls these inside the map transform, so a symbol's height is given in
// GRID-CELL UNITS and it grows and shrinks with the zoom, exactly like the
// contours under it.

// Resolved against THIS module, not the page: a bare '../assets/icons/' would resolve
// against the document URL and land in games/icons/ instead.
const DIR = new URL('../assets/icons/', import.meta.url).href;

export const ICON_FILES = [
  'wp-bear', 'wp-rabbit', 'wp-bird', 'wp-trig', 'wp-mountain',
  'wp-lookout', 'wp-gear', 'wp-campsite',
  'lake', 'woodland', 'lake-tile', 'woodland-tile', 'tree', 'bridge', 'water',
  'dec-grass', 'dec-pine', 'dec-bushy',
  'w-sun', 'w-cloud', 'w-fog', 'w-rain', 'w-snow',
  'camera', 'glider', 'coat', 'kayak', 'backpack',
];

// Where the numeral sat inside the campsite flame before it was filled in, as a
// fraction of the icon box. The campsite number is printed back into it.
export const CAMPSITE_NUM_BOX = [0.402, 0.2797, 0.1275, 0.2657];

// Bump when the artwork changes: an icon is served with far-future caching, and
// a browser that already has the old bytes will not ask again on a soft reload.
const ICON_VERSION = '6';

const imgs = new Map();      // name -> HTMLImageElement
const ready = new Set();     // names whose load event has actually fired
const tints = new Map();     // "name|#rgb" -> canvas
const patterns = new Map();  // "name|alpha" -> { pat, px }
let pending = 0;
const waiters = [];

/** Kick off loading. `cb` fires once every icon has arrived (or failed). */
export function loadIcons(cb) {
  if (cb) waiters.push(cb);
  if (imgs.size) { if (!pending) flush(); return; }
  for (const name of ICON_FILES) {
    const im = new Image();
    pending++;
    im.onload = () => { ready.add(name); done(); };
    im.onerror = done;
    im.src = `${DIR}${name}.png?v=${ICON_VERSION}`;
    imgs.set(name, im);
  }
}
function done() { if (--pending === 0) flush(); }
function flush() {
  // Anything derived before every image had landed was derived from an image
  // with no pixels yet. Throw it away rather than keep a cached wrong answer.
  tints.clear(); patterns.clear();
  const w = waiters.splice(0); for (const f of w) f();
}

/**
 * Has this icon's `load` event fired?
 *
 * NOT the same as `naturalWidth > 0`: a decoding image reports its size from the
 * header while it still has no pixels, and drawing it then is what produced
 * solid colour blocks. `drawImage` of a zero-pixel source is a no-op, and a
 * no-op does not composite — so a `destination-in` that was meant to cut the
 * icon out of a filled rectangle left the whole rectangle behind, and the
 * result was cached. Only the load event means there are pixels to draw.
 */
export function iconReady(name) { return ready.has(name); }

/** The icon's aspect ratio (width / height), or 1 before it has loaded. */
export function iconAspect(name) {
  const im = imgs.get(name);
  return ready.has(name) && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1;
}

// Re-colouring: fill a scratch canvas with the colour, then keep only where the
// icon has ink. Cached, because this runs for every symbol on every repaint.
function tinted(name, color) {
  const key = `${name}|${color}`;
  const hit = tints.get(key);
  if (hit) return hit;
  if (!ready.has(name)) return null;
  const im = imgs.get(name);
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(im, 0, 0);
  tints.set(key, c);
  return c;
}

/**
 * Draw an icon centred on (cx, cy), `h` tall in the current units.
 *
 *   opts.color   re-colour the ink (default: leave the original black/greys)
 *   opts.angle   radians, clockwise
 *   opts.anchor  'center' (default) or 'bottom' — sit the icon on the point
 *   opts.alpha
 */
export function drawIcon(ctx, name, cx, cy, h, opts = {}) {
  if (!ready.has(name)) return false;
  const im = imgs.get(name);
  const src = opts.color ? (tinted(name, opts.color) || im) : im;
  const w = h * (im.naturalWidth / im.naturalHeight);
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.translate(cx, cy);
  if (opts.angle) ctx.rotate(opts.angle);
  ctx.drawImage(src, -w / 2, opts.anchor === 'bottom' ? -h : -h / 2, w, h);
  ctx.restore();
  return true;
}

/** The icon's box, in the same units, for laying text out against it. */
export function iconBox(name, h) {
  return { w: h * iconAspect(name), h };
}

// ---------------------------------------------------------------- tiled fills
// A lake and a wood are filled with their own symbol. The tile artwork is SQUARE
// — the roundel's own tone carried out to the corners — so one copy fills the
// pattern cell exactly and tiles butt together with no seam and no gaps.

/**
 * A repeating fill of `name`, for use inside the map transform. One tile is
 * `size` across in the current units.
 */
export function iconPattern(ctx, name, size, alpha = 1) {
  if (!ready.has(name)) return null;
  const im = imgs.get(name);
  const key = `${name}|${alpha}`;
  let hit = patterns.get(key);
  if (!hit) {
    const px = 160;                                // tile resolution, device px
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.globalAlpha = alpha;
    g.drawImage(im, 0, 0, px, px);
    const pat = ctx.createPattern(c, 'repeat');
    if (!pat) return null;
    hit = { pat, px };
    patterns.set(key, hit);
  }
  hit.pat.setTransform(new DOMMatrix().scale(size / hit.px));
  return hit.pat;
}
