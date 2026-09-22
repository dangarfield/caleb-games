// Waypoints — the printed sheet around the map, as data rather than a photo.
//
// The border is the WEATHER TRACK: four sides, one per hike, run clockwise. Each
// turn one player rolls a d6, every player counts that many spaces clockwise
// from the current point and circles the space reached, and the number in that
// space is the movement points everyone gets for the turn. A roll that would run
// past the end of the side circles the last space instead, and that turn is the
// last of the hike; play then moves to the next side.
//
// Mechanically only the NUMBER matters — the weather symbol is flavour, which is
// why the values are what the editor is built around and the symbols are a
// best-effort read of the printed sheet.
//
// Geometry is in GRID-CELL UNITS with the sheet's top-left at (0, 0), so the
// board sits in the same coordinates as everything on the map.

import { drawIcon, iconReady } from './icons.js';

export const SIDES = ['top', 'right', 'bottom', 'left'];

/** Clockwise: along the top, down the right, back along the bottom, up the left. */
export const HIKES = [
  { id: 'a', side: 'top',    label: '1' },
  { id: 'b', side: 'right',  label: '2' },
  { id: 'c', side: 'bottom', label: '3' },
  { id: 'd', side: 'left',   label: '4' },
];

export const WEATHER = {
  sun:   { label: 'Clear',         icon: 'w-sun' },
  cloud: { label: 'Sun and cloud', icon: 'w-cloud' },
  fog:   { label: 'Fog',           icon: 'w-fog' },
  rain:  { label: 'Rain',          icon: 'w-rain' },
  snow:  { label: 'Snow',          icon: 'w-snow' },
  dusk:  { label: 'Dusk',          icon: null },      // drawn, not printed anywhere else
};
export const WEATHER_KEYS = Object.keys(WEATHER);

// The four tracks read off Explorer Series Map 01, in the order they are walked.
// Each side totals 46 or 47 movement points, which is the check that the read is
// about right. Correct any space in the Board panel — this is only a seed.
const M01 = {
  top: [[2,'rain'],[3,'fog'],[5,'sun'],[1,'snow'],[2,'rain'],[4,'cloud'],[2,'rain'],[4,'cloud'],
        [3,'fog'],[3,'fog'],[4,'cloud'],[3,'fog'],[1,'snow'],[5,'sun'],[3,'fog'],[2,'dusk']],
  right:[[3,'fog'],[4,'cloud'],[2,'fog'],[1,'snow'],[4,'cloud'],[1,'snow'],[3,'fog'],[3,'fog'],
         [5,'sun'],[2,'fog'],[3,'fog'],[2,'fog'],[3,'fog'],[5,'sun'],[3,'fog'],[2,'dusk']],
  bottom:[[5,'sun'],[1,'snow'],[3,'fog'],[3,'fog'],[2,'rain'],[4,'cloud'],[2,'rain'],[1,'snow'],
          [4,'cloud'],[3,'fog'],[4,'cloud'],[5,'sun'],[2,'rain'],[3,'fog'],[3,'fog'],[2,'dusk']],
  left: [[3,'fog'],[2,'rain'],[5,'sun'],[3,'fog'],[3,'fog'],[2,'rain'],[1,'snow'],[3,'fog'],
         [5,'sun'],[3,'fog'],[3,'fog'],[2,'rain'],[4,'cloud'],[4,'cloud'],[1,'snow'],[2,'dusk']],
};

export function blankBoard() {
  return {
    visible: true,
    band: 0.22,          // thickness of the weather ring, in cell units
    tracks: Object.fromEntries(SIDES.map((s) =>
      [s, M01[s].map(([n, w]) => ({ n, w }))])),
  };
}

/** Fresh play state: nothing circled, first hike, not yet started. */
export function blankPlay() {
  return { hike: 0, pos: -1, done: false };
}

// ---------------------------------------------------------------- geometry
// The weather ring wraps the WHOLE sheet, not just the map: the left and right
// tracks run past the bottom of the map and down the side of the score card, and
// the bottom track sits under the card. `sheetH` is the printed height the ring
// has to contain, which is the map plus whatever is printed below it.
export function sheetH(map) {
  return map.grid.rows + (map.sheetBelow || 0);
}

/** The outer rectangle the board occupies, in cell units. */
export function boardRect(board, grid, below = 0) {
  const t = board.band;
  return { x: -t, y: -t, w: grid.cols + 2 * t, h: grid.rows + below + 2 * t };
}

/**
 * Where one space sits, as a plain rectangle.
 *
 * Nothing on the ring is rotated: a number you read sideways is a number you
 * misread. Only the ORDER of the spaces turns with the walk. Down the sides the
 * slot is tall and narrow, so the number sits above its weather rather than
 * beside it — `stack` says which way round.
 */
export function spaceRect(board, grid, side, i, below = 0) {
  const t = board.band;
  const n = board.tracks[side].length;
  if (!n) return null;
  const cols = grid.cols, H = grid.rows + below;
  if (side === 'top') {
    const len = cols / n;
    return { x: i * len, y: -t, w: len, h: t, stack: false };
  }
  if (side === 'bottom') {                       // walked right to left
    const len = cols / n;
    return { x: cols - (i + 1) * len, y: H, w: len, h: t, stack: false };
  }
  if (side === 'right') {
    const len = H / n;
    return { x: cols, y: i * len, w: t, h: len, stack: true };
  }
  const len = H / n;                             // left, walked bottom to top
  return { x: -t, y: H - (i + 1) * len, w: t, h: len, stack: true };
}

/**
 * One radius for every circle on the ring.
 *
 * The tall narrow side slots are tighter than the wide top and bottom ones, so
 * they set it for all four and the ring reads as one printed band.
 */
export function ringRadius(board, grid, below = 0) {
  const t = board.band;
  const H = grid.rows + below;
  const wide = grid.cols / (board.tracks.top.length || 1);
  const tall = H / (board.tracks.left.length || 1);
  return Math.min(wide * 0.23, t * 0.34, tall * 0.2);
}

/** The corner block a hike starts from. */
export function cornerRect(board, grid, side, below = 0) {
  const t = board.band;
  const cols = grid.cols, H = grid.rows + below;
  if (side === 'top')    return { x: -t,   y: -t, w: t, h: t, rot: 0 };
  if (side === 'right')  return { x: cols, y: -t, w: t, h: t, rot: Math.PI / 2 };
  if (side === 'bottom') return { x: cols, y: H,  w: t, h: t, rot: Math.PI };
  return { x: -t, y: H, w: t, h: t, rot: -Math.PI / 2 };
}

/** Which space is under this point, or null. */
export function hitBoard(board, grid, x, y, below = 0) {
  for (const side of SIDES) {
    const n = board.tracks[side].length;
    for (let i = 0; i < n; i++) {
      const r = spaceRect(board, grid, side, i, below);
      if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { side, i };
    }
  }
  return null;
}

// ---------------------------------------------------------------- play
/**
 * One roll of the d6.
 *
 * Counts `roll` spaces clockwise. A roll that would run past the end of the side
 * stops on the last space, which per the rules makes this the final turn of the
 * hike. Returns what the turn is worth and whether the hike just ended.
 */
export function roll(board, play, d) {
  const side = HIKES[play.hike].side;
  const n = board.tracks[side].length;
  const last = n - 1;
  const to = Math.min(last, play.pos + d);
  play.pos = to;
  const space = board.tracks[side][to];
  const end = to === last;
  return { side, index: to, points: space ? space.n : 0, weather: space ? space.w : null, end };
}

/** Move on to the next side. The fourth hike ends the game. */
export function nextHike(play) {
  if (play.hike >= HIKES.length - 1) { play.done = true; return false; }
  play.hike++; play.pos = -1;
  return true;
}

/** Has this space been circled? Everything up to the marker on a walked side. */
export function isCircled(play, sideIndex, i) {
  if (sideIndex < play.hike) return true;
  if (sideIndex > play.hike) return false;
  return i <= play.pos;
}

// ---------------------------------------------------------------- drawing
/** The dusk mark: a low sun over the horizon. Nothing in the rules PDF draws it. */
function drawDusk(ctx, h, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = h * 0.09;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(0, h * 0.06, h * 0.24, Math.PI, 0); ctx.stroke();
  for (let k = -2; k <= 2; k++) {
    const a = Math.PI * (0.5 + k * 0.19);
    const x = Math.cos(a + Math.PI), y = -Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x * h * 0.33, h * 0.06 - Math.abs(y) * h * 0.33);
    ctx.lineTo(x * h * 0.46, h * 0.06 - Math.abs(y) * h * 0.46);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-h * 0.42, h * 0.16); ctx.lineTo(h * 0.42, h * 0.16);
  ctx.moveTo(-h * 0.30, h * 0.34); ctx.lineTo(h * 0.30, h * 0.34);
  ctx.stroke();
  ctx.restore();
}

const INK = '#1b2733';
const BOARD_PAPER = '#f4f2ea';
const BOARD_EDGE = '#16202b';
const MARK = '#d4553c';
const ARROW = '#2f5f8f';   // every corner arrow, whichever way it points

/**
 * Draw the whole board: the paper it is printed on, the four weather tracks, the
 * corner blocks, and whatever has been circled so far.
 *
 * Sizes are in cell units, so the board scales with the map like everything else.
 */
export function drawBoard(ctx, map, play, opts = {}) {
  const board = map.board;
  if (!board || !board.visible) return;
  const grid = map.grid;
  const below = opts.below || 0;
  const t = board.band;
  const r = boardRect(board, grid, below);

  ctx.save();
  // the sheet the whole thing is printed on
  ctx.fillStyle = BOARD_EDGE;
  ctx.fillRect(r.x - t * 0.14, r.y - t * 0.14, r.w + t * 0.28, r.h + t * 0.28);
  ctx.fillStyle = BOARD_PAPER;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  const hover = opts.hover;
  const rad = ringRadius(board, grid, below);
  for (let hi = 0; hi < HIKES.length; hi++) {
    const { side, label } = HIKES[hi];
    const track = board.tracks[side] || [];
    for (let i = 0; i < track.length; i++) {
      const box = spaceRect(board, grid, side, i, below);
      if (!box) continue;
      const on = hover && hover.side === side && hover.i === i;
      drawSpace(ctx, box, track[i], {
        circled: isCircled(play, hi, i),
        current: play.hike === hi && play.pos === i,
        flash: play.flash,
        hover: on,
      }, rad);
    }
    // Before the first roll of a hike there is no space to point at, so the
    // corner you are about to set off from is what flashes instead.
    drawCorner(ctx, cornerRect(board, grid, side, below), label, play.hike === hi,
      play.flash && play.hike === hi && play.pos < 0);
  }
  ctx.restore();
}

function drawSpace(ctx, box, space, state, rad) {
  if (!space) return;
  const { x, y, w, h } = box;
  ctx.save();
  ctx.fillStyle = state.hover ? '#e8ecdf' : BOARD_PAPER;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(27,39,51,0.55)';
  ctx.lineWidth = Math.min(w, h) * 0.035;
  ctx.strokeRect(x, y, w, h);

  // The number you get for the turn, in the circle you cross off, and the
  // weather beside it (wide slots) or under it (the tall slots down the sides).
  const nx = box.stack ? x + w / 2 : x + w * 0.27;
  const ny = box.stack ? y + h * 0.29 : y + h / 2;
  const ix = box.stack ? x + w / 2 : x + w * 0.70;
  const iy = box.stack ? y + h * 0.71 : y + h / 2;
  const ih = rad * 2.0;

  ctx.strokeStyle = INK; ctx.lineWidth = rad * 0.16;
  ctx.beginPath(); ctx.arc(nx, ny, rad, 0, 7); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `700 ${rad * 1.32}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(space.n), nx, ny);

  if (space.w === 'dusk') {
    ctx.save(); ctx.translate(ix, iy); drawDusk(ctx, ih, INK); ctx.restore();
  } else {
    const name = (WEATHER[space.w] || WEATHER.sun).icon;
    if (!drawIcon(ctx, name, ix, iy, ih, { color: INK })) {
      ctx.beginPath(); ctx.arc(ix, iy, ih * 0.3, 0, 7); ctx.stroke();
    }
  }

  if (state.circled) {
    ctx.strokeStyle = MARK; ctx.lineWidth = rad * 0.24;
    ctx.beginPath(); ctx.ellipse(nx, ny, rad * 1.5, rad * 1.42, 0.18, 0, 7); ctx.stroke();
  }
  if (state.current) {
    // Where you are on the track, as opposed to everywhere you have BEEN. The
    // circles say where you have been; a filled block says where you are, so a
    // roll that skips four spaces leaves no doubt which one is live.
    ctx.strokeStyle = MARK; ctx.lineWidth = Math.min(w, h) * 0.07;
    const m = Math.min(w, h) * 0.05;
    if (state.flash) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#ffe89a';
      ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
      ctx.restore();
      ctx.lineWidth = Math.min(w, h) * 0.11;
    }
    ctx.strokeRect(x + m, y + m, w - 2 * m, h - 2 * m);
  }
  ctx.restore();
}

function drawCorner(ctx, c, label, active, flash) {
  ctx.save();
  // The arrow is the same colour on all four corners — only its direction
  // changes. Which hike is live is shown by tinting the block behind it, not by
  // recolouring the arrow, so the four read as one set.
  ctx.fillStyle = flash ? '#ffe89a' : active ? '#f7e3d6' : BOARD_PAPER;
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = flash ? MARK : 'rgba(27,39,51,0.55)';
  ctx.lineWidth = c.h * (flash ? 0.09 : 0.035);
  ctx.strokeRect(c.x, c.y, c.w, c.h);

  const cx = c.x + c.w / 2, cy = c.y + c.h / 2, s = c.h;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(c.rot);
  ctx.fillStyle = ARROW;
  ctx.beginPath();
  ctx.moveTo(-s * 0.10, -s * 0.26); ctx.lineTo(s * 0.30, 0); ctx.lineTo(-s * 0.10, s * 0.26);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // the hike number stays upright whichever way the arrow points
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${s * 0.26}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, cx + Math.cos(c.rot) * s * 0.02, cy + Math.sin(c.rot) * s * 0.02);
  ctx.restore();
}
