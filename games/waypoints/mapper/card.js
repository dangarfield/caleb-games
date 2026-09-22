// Waypoints — the score card printed below the map, as data.
//
// Everything under the title bar is a set of TRACKS you mark as you play, and a
// few boxes you write totals into. It is specified here rather than drawn, so a
// space can be circled, a value can change, and the scores at the bottom can be
// worked out from what is marked instead of being a picture of a form.
//
// Layout is in GRID-CELL UNITS, laid out below the weather ring, in fractions of
// the card's own width and height so the whole thing scales with the map.

import { drawIcon, iconAspect } from './icons.js';

export const CARD_H = 1.24;      // cells tall, under the title bar
export const TITLE_H = 0.2;

const INK = '#1b2733';
const PAPER = '#f4f2ea';
const PANEL = '#e6eaef';
const BLUE = '#2f5f8f';
const MARK = '#d4553c';
const GOLD = '#e0a92b';       // the mission you chose, on the card

// ---------------------------------------------------------------- the spec
// `v` is the value printed in a space; `act` is a special action you may use
// once the space is circled; a track of `kind: 'box'` is written into instead.
const circles = (...vals) => vals.map((v) => (typeof v === 'object' ? v : { v }));

export function blankCard() {
  return {
    series: 'WAYPOINTS EXPLORER SERIES MAP 01',
    name: 'WHISTLING WATER NATIONAL PARK',
    scaleKm: 5,
    tracks: [
      { id: 'bear',   icon: 'wp-bear',   score: 'highest',
        spaces: circles(1, { act: 'kayak' }, 4, 6, { act: 'kayak' }, 12, 16, 20, 25, 30) },
      { id: 'rabbit', icon: 'wp-rabbit', score: 'highest',
        spaces: circles(1, { act: 'coat' }, 4, 6, { act: 'coat' }, 12, 16, 20, 25, 30) },
      { id: 'bird',   icon: 'wp-bird',   score: 'highest',
        spaces: circles(1, { act: 'glider' }, 4, 6, { act: 'glider' }, 12, 16, 20, 25, 30) },
      { id: 'mountain', icon: 'wp-mountain', kind: 'box', score: 'sum',
        spaces: [{}, {}, {}, {}, { mult: 2 }, {}, {}, {}, {}, { mult: 3 }] },
      { id: 'lookout', icon: 'wp-lookout', score: 'fourOrFive',
        spaces: circles({ act: 'camera' }, { act: 'camera' }, { act: 'camera' },
                        { act: 'camera', v: 5 }, { act: 'camera', v: 15 }) },
      { id: 'gear',   icon: 'wp-gear',   score: 'fourOrFive',
        spaces: circles({ act: 'backpack' }, { act: 'backpack' }, { act: 'backpack' },
                        { act: 'backpack', v: 5 }, { act: 'backpack', v: 15 }) },
      { id: 'trig',   icon: 'wp-trig',   score: 'highest', spaces: circles(5, 11, 18, 26, 35) },
    ],
    // One journal entry is chosen per hike; the campsite doubles it.
    journal: [
      { id: 'j1', per: 1, of: 'different' },
      { id: 'j2', per: 2, of: 'one type' },
      { id: 'j3', per: 3, of: 'twice' },
      { id: 'j4', per: 1, of: '2 squares' },
    ],
    // One goal is chosen for the whole game.
    goals: [
      { id: 'a', per: 2, icon: 'lake',     label: 'Lakes',      all: 10 },
      { id: 'b', per: 2, icon: 'woodland', label: 'Woodland',   all: 10 },
      { id: 'c', per: 1, icon: null,       label: 'Grid squares', all: 10 },
      { id: 'd', per: 3, icon: 'bridge',   label: 'Bridges',    all: 10 },
    ],
    water: { cols: 5, rows: 4 },
  };
}

/** What has been marked on the card. Kept beside the play state. */
export function blankCardPlay() {
  return { marks: {}, boxes: {}, goal: null, water: 0 };
}

// ---------------------------------------------------------------- scoring
/** The points a track is worth from what is circled on it. */
export function trackScore(track, play) {
  const on = (i) => (play.marks[`${track.id}:${i}`] || 0) > 0;
  if (track.kind === 'box') {
    let sum = 0;
    track.spaces.forEach((_, i) => { sum += +(play.boxes[`${track.id}:${i}`] || 0); });
    return sum;
  }
  if (track.score === 'fourOrFive') {
    const n = track.spaces.filter((_, i) => on(i)).length;
    return n >= 5 ? 15 : n >= 4 ? 5 : 0;
  }
  let best = 0;                                       // 'highest'
  track.spaces.forEach((sp, i) => { if (on(i) && sp.v != null && sp.v > best) best = sp.v; });
  return best;
}

/** The four figures on the SCORE row, and their sum. */
export function cardScore(card, play) {
  const t = (id) => {
    const tr = card.tracks.find((x) => x.id === id);
    return tr ? trackScore(tr, play) : 0;
  };
  const animals = t('bear') + t('rabbit') + t('bird') + t('mountain');
  const gear = t('lookout') + t('gear') + t('trig');
  let journal = 0;
  card.journal.forEach((j, i) => { journal += +(play.boxes[`journal:${i}`] || 0); });
  const goal = +(play.boxes['goal:total'] || 0);
  return { animals, gear, journal, goal, total: animals + gear + journal + goal };
}

// ---------------------------------------------------------------- layout
// The card sits INSIDE the weather ring, under the title bar, spanning the map's
// width. Everything is a fraction of the card's own rect, so it holds together
// at any size.
//
// Two rules keep it looking printed rather than generated: every row is the same
// height across every column, and every circle on the card is the same size —
// worked out once from the tightest row and the tightest column, then used
// everywhere, so a ten-space track and a five-space track carry the same marks.
// One radius for every circle means the narrowest grid sets it for all of them,
// so the water column is given room to hold circles the size of the tracks'
// rather than squeezing the whole card down to bottle size.
const COL = { tracksR: 0.40, gearR: 0.625, journalR: 0.758, goalR: 0.872 };
const TOP_H = 0.76;                       // of the card, above the score row
const ROWS = 4;

export function cardRect(map) {
  const g = map.grid;
  return { x: 0, y: g.rows + TITLE_H, w: g.cols, h: CARD_H };
}
export function titleRect(map) {
  const g = map.grid;
  return { x: 0, y: g.rows, w: g.cols, h: TITLE_H };
}
/** How much is printed below the map, for the weather ring to wrap. */
export function cardBelow(map) {
  return map.card ? TITLE_H + CARD_H : 0;
}

const GROUPS = [
  { ids: ['bear', 'rabbit', 'bird', 'mountain'], a: 0, b: COL.tracksR },
  { ids: ['lookout', 'gear', 'trig'],            a: COL.tracksR, b: COL.gearR },
];

/**
 * Every hit region on the card, in map coordinates.
 *
 * Built the same way it is drawn, from one pass over the spec, so what you can
 * click and what you can see can never drift apart.
 */
export function cardRegions(map) {
  const card = map.card;
  if (!card) return [];
  const r = cardRect(map);
  const out = [];
  const pad = r.h * 0.05;
  const top = r.y + pad, bodyH = r.h * TOP_H - pad;
  const rowH = bodyH / ROWS;

  // Every box on the card is the same size, and every block's boxes stack in one
  // column, so the eye can run down a column and across the score row.
  const boxW = r.w * 0.052, boxH = rowH * 0.72;
  const boxY = (row) => top + row * rowH + (rowH - boxH) / 2;

  // -- one radius for every circle on the card
  let rad = rowH * 0.40;
  for (const gp of GROUPS) {
    const x0 = r.x + r.w * gp.a + pad, x1 = r.x + r.w * gp.b;
    const iconW = (x1 - x0) * 0.075;
    for (const id of gp.ids) {
      const tk = card.tracks.find((t) => t.id === id);
      if (!tk || tk.kind === 'box') continue;
      rad = Math.min(rad, ((x1 - boxW - pad) - (x0 + iconW)) / tk.spaces.length * 0.46);
    }
  }
  const wx0 = r.x + r.w * COL.goalR + pad * 0.5, wx1 = r.x + r.w - pad;
  rad = Math.min(rad, (wx1 - wx0) / card.water.cols * 0.46,
                      bodyH / card.water.rows * 0.46);

  const stacks = [];            // where each block's total column sits

  // -- the four type tracks, then the three gear tracks
  for (const gp of GROUPS) {
    const gx0 = r.x + r.w * gp.a + pad, gx1 = r.x + r.w * gp.b;
    const iconW = (gx1 - gx0) * 0.075;
    const totX = gx1 - boxW - pad * 0.5;
    gp.ids.forEach((id, ri) => {
      const track = card.tracks.find((x) => x.id === id);
      if (!track) return;
      const y = top + ri * rowH;
      const x0 = gx0 + iconW, x1 = totX - pad * 0.4;
      const n = track.spaces.length;
      const cw = (x1 - x0) / n;
      out.push({ kind: 'icon', icon: track.icon, x: gx0, y, w: iconW, h: rowH });
      // the rule the row is strung along, from the animal to its total
      out.push({ kind: 'rule', x: gx0 + iconW * 0.55, y: y + rowH / 2,
        w: totX - (gx0 + iconW * 0.55) });
      track.spaces.forEach((sp, i) => {
        out.push({ kind: track.kind === 'box' ? 'box' : 'space', track: track.id, i, sp, rad,
          x: x0 + i * cw, y: y + rowH * 0.12, w: cw, h: rowH * 0.76,
          key: `${track.id}:${i}` });
      });
      out.push({ kind: 'total', track: track.id, x: totX, y: boxY(ri), w: boxW, h: boxH });
    });
    // the column the block's totals run down, on to the score row
    stacks.push({ part: gp.ids[0] === 'bear' ? 'animals' : 'gear',
      cx: totX + boxW / 2, from: boxY(0) + boxH, to: boxY(gp.ids.length - 1) });
  }

  // -- journal: one entry chosen per hike, doubled if you camp
  const jx0 = r.x + r.w * COL.gearR, jx1 = r.x + r.w * COL.journalR;
  const jTot = jx1 - boxW - pad * 0.5;
  out.push({ kind: 'spine', text: 'JOURNAL · 1 PER DAY', x: jx0, y: top, w: (jx1 - jx0) * 0.11, h: bodyH });
  card.journal.forEach((j, i) => {
    out.push({ kind: 'journal', i, j, x: jx0 + (jx1 - jx0) * 0.14, y: top + i * rowH + rowH * 0.12,
      w: jTot - pad * 0.4 - (jx0 + (jx1 - jx0) * 0.14), h: rowH * 0.76 });
    out.push({ kind: 'box', key: `journal:${i}`, x: jTot, y: boxY(i), w: boxW, h: boxH });
  });
  stacks.push({ part: 'journal', cx: jTot + boxW / 2, from: boxY(0) + boxH, to: boxY(3) });

  // -- goals: one for the whole game
  const gx0 = r.x + r.w * COL.journalR, gx1 = r.x + r.w * COL.goalR;
  out.push({ kind: 'spine', text: 'GOAL · 1 PER GAME', x: gx0, y: top, w: (gx1 - gx0) * 0.17, h: bodyH });
  card.goals.forEach((g, i) => {
    out.push({ kind: 'goal', i, g, x: gx0 + (gx1 - gx0) * 0.22, y: top + i * rowH + rowH * 0.12,
      w: (gx1 - gx0) * 0.74, h: rowH * 0.76 });
  });
  stacks.push({ part: 'goal', cx: gx1 - boxW / 2 - pad * 0.5, from: top + 3 * rowH + rowH * 0.88, to: null });

  // -- the water you carry
  const { cols: wc, rows: wr } = card.water;
  const cw = (wx1 - wx0) / wc, ch = bodyH / wr;
  for (let j = 0; j < wr; j++) for (let i = 0; i < wc; i++) {
    out.push({ kind: 'water', n: j * wc + i, rad, x: wx0 + i * cw, y: top + j * ch, w: cw, h: ch });
  }

  // -- the score row: each block's cumulative sits directly under its column,
  // joined to it by a line, and the + + + = run along the row between them
  const sy = r.y + r.h * TOP_H + pad * 0.3, sh = r.h - (r.h * TOP_H) - pad * 1.3;
  const sbH = Math.min(boxH, sh);
  const sbY = sy + (sh - sbH) / 2;
  const totalCx = (wx0 + wx1) / 2;

  out.push({ kind: 'key', x: r.x + pad, y: sy, w: stacks[0].cx - boxW - r.x - pad * 2, h: sh });

  const cells = stacks.map((st) => ({ part: st.part, cx: st.cx }));
  cells.push({ part: 'total', cx: totalCx });
  cells.forEach((c, i) => {
    const w = c.part === 'total' ? boxW * 1.5 : boxW;
    out.push({ kind: 'score', part: c.part, key: c.part === 'goal' ? 'goal:total' : undefined,
      x: c.cx - w / 2, y: sbY, w, h: sbH });
    if (i) {
      const prev = cells[i - 1];
      const pw = prev.part === 'total' ? boxW * 1.5 : boxW;
      out.push({ kind: 'oper', sym: c.part === 'total' ? '=' : '+',
        x0: prev.cx + pw / 2, x1: c.cx - w / 2, y: sbY + sbH / 2 });
    }
  });
  // the line joining each block's totals to its cumulative below
  for (const st of stacks) {
    out.push({ kind: 'vrule', x: st.cx, y0: st.from, y1: sbY });
    if (st.to != null) out.push({ kind: 'vrule', x: st.cx, y0: st.from, y1: st.to });
  }
  return out;
}

/** The region under a map point, or null. Later regions win: boxes over panels. */
export function hitCard(map, x, y) {
  const rs = cardRegions(map);
  for (let i = rs.length - 1; i >= 0; i--) {
    const r = rs[i];
    if (!r.key && r.kind !== 'water' && r.kind !== 'goal' && r.kind !== 'space') continue;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

// ---------------------------------------------------------------- started?
/**
 * Has anyone touched this card?
 *
 * A blank card shows blank boxes, not zeros: a printed sheet has nothing written
 * on it until you write something, and a grid of 0s reads as a score of nothing
 * rather than as a game not yet begun.
 */
export function cardStarted(play) {
  if (!play) return false;
  if (play.goal || play.water) return true;
  for (const k in play.marks) if (play.marks[k]) return true;
  for (const k in play.boxes) if (play.boxes[k] !== '' && play.boxes[k] != null) return true;
  return false;
}

/** Has anything been marked or written on this one track? */
export function trackStarted(track, play) {
  for (let i = 0; i < track.spaces.length; i++) {
    if (play.marks[`${track.id}:${i}`]) return true;
    const b = play.boxes[`${track.id}:${i}`];
    if (b !== '' && b != null) return true;
  }
  return false;
}

// ---------------------------------------------------------------- drawing
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** A small grid-square symbol. The rules use it but the PDF never draws it alone. */
function drawGridSq(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.09;
  ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
  ctx.beginPath();
  ctx.moveTo(cx - s / 6, cy - s / 2); ctx.lineTo(cx - s / 6, cy + s / 2);
  ctx.moveTo(cx + s / 6, cy - s / 2); ctx.lineTo(cx + s / 6, cy + s / 2);
  ctx.stroke();
  ctx.restore();
}

export function drawCard(ctx, map, play, opts = {}) {
  const card = map.card;
  if (!card || !map.board || !map.board.visible) return;
  const cp = play.card || blankCardPlay();
  const tr = titleRect(map), r = cardRect(map);

  ctx.save();
  // title bar
  ctx.fillStyle = '#16202b';
  ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
  ctx.fillStyle = '#f2efe6';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${tr.h * 0.30}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${tr.h * 0.05}px`;
  ctx.fillText(card.series, tr.x + tr.h * 0.5, tr.y + tr.h / 2);
  ctx.font = `700 ${tr.h * 0.52}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = `${tr.h * 0.14}px`;
  ctx.fillText(card.name, tr.x + tr.w * 0.52, tr.y + tr.h / 2);
  ctx.letterSpacing = '0px';
  // the scale bar
  const sbx = tr.x + tr.w - tr.h * 4.2, sby = tr.y + tr.h / 2;
  ctx.strokeStyle = '#f2efe6'; ctx.lineWidth = tr.h * 0.05;
  ctx.beginPath();
  ctx.moveTo(sbx, sby); ctx.lineTo(sbx + tr.h * 2.6, sby);
  for (const t of [0, 0.5, 1]) {
    const x = sbx + tr.h * 2.6 * t;
    ctx.moveTo(x, sby - tr.h * 0.16); ctx.lineTo(x, sby + tr.h * 0.16);
  }
  ctx.stroke();
  ctx.font = `600 ${tr.h * 0.26}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'right'; ctx.fillText('0', sbx - tr.h * 0.2, sby);
  ctx.textAlign = 'left'; ctx.fillText(`${card.scaleKm}km`, sbx + tr.h * 2.8, sby);

  // the card itself
  ctx.fillStyle = PAPER;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = PANEL;
  ctx.fillRect(r.x, r.y + r.h * TOP_H, r.w, r.h * (1 - TOP_H));

  const score = cardScore(card, cp);
  const started = cardStarted(cp);
  const hov = opts.hover;
  const regions = cardRegions(map);
  const BEHIND = { rule: 1, vrule: 1, oper: 1 };
  for (const g of regions) if (BEHIND[g.kind]) drawRegion(ctx, g, card, cp, score, hov, opts.selected, started);
  for (const g of regions) if (!BEHIND[g.kind]) drawRegion(ctx, g, card, cp, score, hov, opts.selected, started);
  ctx.restore();
}

function drawRegion(ctx, g, card, cp, score, hov, selected, started) {
  const on = hov && hov.kind === g.kind && hov.key === g.key && hov.i === g.i &&
             hov.track === g.track && hov.n === g.n;
  switch (g.kind) {
    case 'icon':
      drawIcon(ctx, g.icon, g.x + g.w * 0.5, g.y + g.h * 0.5, g.h * 0.62, { color: INK });
      break;

    case 'space': {
      const rad = g.rad;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
      // the space itself
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
      ctx.strokeStyle = on ? BLUE : 'rgba(27,39,51,0.7)';
      ctx.lineWidth = rad * 0.1;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.stroke();
      // A space can carry a special action AND a value. The action sits behind,
      // sized to fit the circle by WIDTH as well as height (the camera is half
      // again as wide as it is tall), so the NUMBER can stay dead centre.
      if (g.sp.act) {
        const h = Math.min(rad * 1.3, rad * 1.7 / iconAspect(g.sp.act));
        drawIcon(ctx, g.sp.act, cx, cy, h, { color: BLUE, alpha: g.sp.v != null ? 0.32 : 1 });
      }
      if (g.sp.v != null) {
        ctx.fillStyle = INK;
        ctx.font = `700 ${rad * 0.95}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(g.sp.v), cx, cy, rad * 1.6);
      }
      mark(ctx, cp.marks[g.key] || 0, cx, cy, rad * 1.2);
      break;
    }

    case 'rule':
      // the line the row is strung along, behind everything on it
      ctx.strokeStyle = 'rgba(27,39,51,0.32)';
      ctx.lineWidth = 0.0035;
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + g.w, g.y); ctx.stroke();
      break;

    case 'vrule':
      // a block's totals run down one column to the cumulative on the score row
      ctx.strokeStyle = 'rgba(27,39,51,0.32)';
      ctx.lineWidth = 0.0035;
      ctx.beginPath(); ctx.moveTo(g.x, g.y0); ctx.lineTo(g.x, g.y1); ctx.stroke();
      break;

    case 'oper': {
      // the + + + = that join the cumulative boxes along the score row
      ctx.strokeStyle = 'rgba(27,39,51,0.32)';
      ctx.lineWidth = 0.0035;
      const mid = (g.x0 + g.x1) / 2, sz = (g.x1 - g.x0);
      const gap = Math.min(sz * 0.3, 0.05);
      ctx.beginPath();
      ctx.moveTo(g.x0, g.y); ctx.lineTo(mid - gap, g.y);
      ctx.moveTo(mid + gap, g.y); ctx.lineTo(g.x1, g.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(27,39,51,0.7)';
      ctx.font = `700 ${Math.min(sz * 0.42, 0.07)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.sym, mid, g.y);
      break;
    }

    case 'box': {
      const sel = selected === g.key;
      ctx.fillStyle = sel ? '#fff8e6' : '#fdfcf7';
      roundRect(ctx, g.x + g.w * 0.08, g.y, g.w * 0.84, g.h, g.h * 0.1); ctx.fill();
      ctx.strokeStyle = sel ? MARK : on ? BLUE : 'rgba(27,39,51,0.55)';
      ctx.lineWidth = g.h * (sel ? 0.075 : 0.045); ctx.stroke();
      const v = cp.boxes[g.key];
      if (v != null && v !== '') {
        ctx.fillStyle = INK;
        ctx.font = `700 ${g.h * 0.5}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), g.x + g.w / 2, g.y + g.h / 2);
      }
      if (g.sp && g.sp.mult) {
        ctx.fillStyle = 'rgba(27,39,51,0.45)';
        ctx.font = `700 ${g.h * 0.3}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`x${g.sp.mult}`, g.x + g.w / 2, g.y + g.h * 0.99);
      }
      break;
    }

    case 'total': {
      const tk = card.tracks.find((t) => t.id === g.track);
      ctx.fillStyle = '#fdfcf7';
      roundRect(ctx, g.x, g.y, g.w, g.h, g.h * 0.1); ctx.fill();
      ctx.strokeStyle = 'rgba(27,39,51,0.55)'; ctx.lineWidth = g.h * 0.045; ctx.stroke();
      if (trackStarted(tk, cp)) {
        ctx.fillStyle = INK;
        ctx.font = `700 ${g.h * 0.52}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(trackScore(tk, cp)), g.x + g.w / 2, g.y + g.h / 2);
      }
      break;
    }

    case 'spine': {
      // One rotated line, not two: the section and how often it scores read as a
      // single label down the edge of the block.
      const pw = g.w * 0.62, px = g.x + g.w - pw;
      ctx.fillStyle = BLUE;
      roundRect(ctx, px, g.y + g.h * 0.06, pw, g.h * 0.88, pw * 0.5); ctx.fill();
      ctx.save();
      ctx.translate(px + pw / 2, g.y + g.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${pw * 0.52}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.letterSpacing = `${pw * 0.08}px`;
      ctx.fillText(g.text, 0, 0, g.h * 0.9);
      ctx.letterSpacing = '0px';
      ctx.restore();
      break;
    }

    case 'journal': {
      ctx.fillStyle = '#fdfcf7';
      roundRect(ctx, g.x, g.y, g.w, g.h, g.h * 0.45); ctx.fill();
      ctx.strokeStyle = 'rgba(27,39,51,0.4)'; ctx.lineWidth = g.h * 0.05; ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `700 ${g.h * 0.44}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${g.j.per}/ ${g.j.of}`, g.x + g.h * 0.3, g.y + g.h * 0.52, g.w - g.h * 1.25);
      // the campsite doubles the entry, so it rides at the end of the row
      drawIcon(ctx, 'wp-campsite', g.x + g.w - g.h * 0.62, g.y + g.h * 0.5, g.h * 0.78);
      ctx.fillStyle = 'rgba(27,39,51,0.75)';
      ctx.font = `700 ${g.h * 0.34}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText('x2', g.x + g.w - g.h * 0.3, g.y + g.h * 0.54);
      break;
    }

    case 'goal': {
      const picked = cp.goal === g.g.id;
      // Once a mission is chosen the other three are not options any more, so
      // they step back: the one you are playing is ringed in gold and the rest
      // fade. A row of four identical boxes with one slightly different border
      // is not an answer to "which one am I doing?".
      const spent = !!cp.goal && !picked;
      ctx.save();
      if (spent) ctx.globalAlpha *= 0.4;
      ctx.fillStyle = picked ? '#fff6e2' : '#fdfcf7';
      roundRect(ctx, g.x, g.y, g.w, g.h, g.h * 0.45); ctx.fill();
      ctx.strokeStyle = picked ? GOLD : on ? BLUE : 'rgba(27,39,51,0.4)';
      ctx.lineWidth = g.h * (picked ? 0.11 : 0.05); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `700 ${g.h * 0.38}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      // Lay the row out from measured widths rather than guessed offsets: the
      // "2/" was running under the symbol it belongs to.
      const lead = `${g.g.id}) ${g.g.per}/`;
      const lx = g.x + g.h * 0.18;
      ctx.fillText(lead, lx, g.y + g.h / 2);
      const iw = g.h * 0.72;
      const ix = lx + ctx.measureText(lead).width + iw * 0.55;
      if (g.g.icon) drawIcon(ctx, g.g.icon, ix, g.y + g.h / 2, iw);
      else drawGridSq(ctx, ix, g.y + g.h / 2, iw * 0.7, INK);
      ctx.font = `700 ${g.h * 0.32}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(`+${g.g.all}`, ix + iw * 0.6, g.y + g.h / 2,
        Math.max(0.01, g.x + g.w - g.h * 0.16 - (ix + iw * 0.6)));
      ctx.restore();
      break;
    }

    case 'water': {
      // A bottle is a space like any other: the card draws the circle, the icon
      // is the bare glyph. It was cut with its printed ring baked in, which gave
      // every bottle a double circle and no way to size the two apart.
      // Two numbers, not one: what you are carrying and what you have drunk.
      // A bottle you HAVE is circled and ready; a bottle you have drunk is
      // circled and crossed out. The old version crossed off the ones you were
      // still carrying, which read as exactly backwards.
      const drunk = cp.waterUsed || 0;
      const got = (cp.water || 0) + drunk;
      const rad = g.rad;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
      ctx.strokeStyle = on ? BLUE : 'rgba(27,39,51,0.7)';
      ctx.lineWidth = rad * 0.1;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.stroke();
      const h = Math.min(rad * 1.3, rad * 1.7 / iconAspect('water'));
      drawIcon(ctx, 'water', cx, cy, h, { color: INK });
      mark(ctx, g.n < drunk ? 2 : g.n < got ? 1 : 0, cx, cy, rad * 1.2);
      break;
    }

    case 'key': {
      ctx.fillStyle = 'rgba(27,39,51,0.75)';
      ctx.font = `700 ${g.h * 0.34}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('KEY', g.x, g.y + g.h / 2);
      const acts = ['kayak', 'glider', 'coat', 'camera', 'backpack'];
      const step = (g.w - g.h * 1.4) / acts.length;
      acts.forEach((a, i) => {
        drawIcon(ctx, a, g.x + g.h * 1.4 + step * (i + 0.5), g.y + g.h / 2, g.h * 0.62, { color: BLUE });
      });
      break;
    }

    case 'score': {
      const sel = g.key && selected === g.key;
      ctx.fillStyle = sel ? '#fff8e6' : '#fdfcf7';
      roundRect(ctx, g.x, g.y, g.w, g.h, g.h * 0.12); ctx.fill();
      ctx.strokeStyle = sel ? MARK : g.part === 'total' ? INK : on ? BLUE : 'rgba(27,39,51,0.55)';
      ctx.lineWidth = g.h * (g.part === 'total' || sel ? 0.09 : 0.05); ctx.stroke();
      if (started) {
        ctx.fillStyle = INK;
        ctx.font = `700 ${g.h * 0.5}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(score[g.part]), g.x + g.w / 2, g.y + g.h / 2);
      }
      break;
    }
  }
}

/** A plain cross, for water you have drunk. */

/** 1 = circled, 2 = circled and crossed out, meaning the action has been used. */
function mark(ctx, state, cx, cy, rad) {
  if (!state) return;
  ctx.save();
  ctx.strokeStyle = MARK; ctx.lineWidth = rad * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * 0.96, 0.2, 0, 7); ctx.stroke();
  if (state > 1) {
    ctx.beginPath();
    ctx.moveTo(cx - rad * 0.72, cy - rad * 0.72); ctx.lineTo(cx + rad * 0.72, cy + rad * 0.72);
    ctx.moveTo(cx + rad * 0.72, cy - rad * 0.72); ctx.lineTo(cx - rad * 0.72, cy + rad * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}
