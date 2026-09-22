// Waypoints Mapper — wiring.
import { TOOLS, WAYPOINTS, WAYPOINT_KEYS, drawWaypointIcon, levelColor,
  DECOR, DECOR_KEYS, drawDecorGlyph } from './palette.js';
import { Doc, blankMap, migrate, LAYERS, touch, autoLevelContours, DEFAULT_SMOOTHING, setSheet }
  from './state.js';
import { createSheet, DEFAULT_UNDERLAY } from './sheet.js';
import { Preview3D } from './preview3d.js';
import { HIKES, WEATHER, WEATHER_KEYS, roll as rollDie, nextHike, blankPlay } from './board.js';
import { blankCardPlay, cardScore } from './card.js';

const $ = (id) => document.getElementById(id);

// #sandbox opens a throwaway copy: nothing is restored, nothing is saved. Used
// for testing so a test run can never touch the real autosaved map. It reads the
// hash, not the query string — the dev server's clean-URL redirect drops a query
// string, and a flag that can silently fail is worse than no flag.
const SANDBOX = /(^|[#&?])sandbox\b/.test(location.hash) ||
  new URLSearchParams(location.search).has('sandbox');
const startMap = (!SANDBOX && Doc.restore()) || (() => {
  const m = blankMap();
  m.underlay.src = DEFAULT_UNDERLAY;
  return m;
})();
const doc = new Doc(startMap, !SANDBOX);
if (SANDBOX) document.title = 'SANDBOX — ' + document.title;

// Declared before the sheet is built: `loadIcons` fires its callback straight
// away when the images are already cached, and the swatches have to exist by then.
const wpSwatches = [];
const decorSwatches = [];

const ed = createSheet($('map2d'), doc, {
  onIcons: () => {
    for (const [k, c] of wpSwatches) paintWpSwatch(k, c);
    for (const [k, c] of decorSwatches) paintDecorSwatch(k, c);
  },
});
let view3d = null, autoTimer = null;
try {
  view3d = new Preview3D($('view3d'));
} catch (e) {
  $('view3d').replaceWith(Object.assign(document.createElement('div'),
    { className: 'note', textContent: '3D preview unavailable: ' + e.message }));
}

// ---------------------------------------------------------------- tools UI
const toolBox = $('tools');
TOOLS.forEach((t) => {
  const b = document.createElement('button');
  b.className = 'btn tool'; b.dataset.tool = t.id;
  b.innerHTML = `<span>${t.label}</span><kbd>${t.key.toUpperCase()}</kbd>`;
  b.onclick = () => { ed.setTool(t.id); syncUI(); };
  toolBox.appendChild(b);
});

const wpgrid = $('wpgrid');
function paintWpSwatch(k, c) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 68, 68);
  g.fillStyle = '#dfe7d8';                 // icons are ink on paper — give them paper
  g.beginPath(); g.roundRect(1, 1, 66, 66, 8); g.fill();
  g.translate(34, 48);           // the ring is the anchor, so it sits low in the box
  drawWaypointIcon(g, k, 30, { text: WAYPOINTS[k].field ? '' : null });
}
WAYPOINT_KEYS.forEach((k) => {
  const b = document.createElement('button');
  b.className = 'wpbtn'; b.dataset.wp = k; b.title = `${WAYPOINTS[k].label} (${WAYPOINTS[k].key})`;
  const c = document.createElement('canvas');
  c.width = c.height = 68;
  paintWpSwatch(k, c);
  wpSwatches.push([k, c]);
  b.appendChild(c);
  b.onclick = () => { ed.wpType = k; ed.setTool('waypoint'); syncUI(); };
  wpgrid.appendChild(b);
});

const decorgrid = $('decorgrid');
function paintDecorSwatch(k, c) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 68, 68);
  g.fillStyle = '#dfe7d8';
  g.beginPath(); g.roundRect(1, 1, 66, 66, 8); g.fill();
  g.translate(34, 57); g.scale(52, 52);            // marks stand on the baseline
  drawDecorGlyph(g, k, 0.9);
}
DECOR_KEYS.forEach((k) => {
  const b = document.createElement('button');
  b.className = 'wpbtn'; b.dataset.dec = k; b.title = `${DECOR[k].label} (${DECOR[k].key})`;
  const c = document.createElement('canvas');
  c.width = c.height = 68;
  paintDecorSwatch(k, c);
  decorSwatches.push([k, c]);
  b.appendChild(c);
  b.onclick = () => { ed.decorType = k; ed.setTool('decor'); syncUI(); };
  decorgrid.appendChild(b);
});



// ---------------------------------------------------------------- the board
// The weather ring is the one part of the sheet you touch every turn: roll,
// count clockwise, circle what you land on, and the number there is everybody's
// movement points. It is data, so it is also editable — the values below were
// read off the printed sheet and are meant to be corrected.
let selSpace = null;

function boardPanel() {
  playPanel();
  spacePanel();
}

function playPanel() {
  const box = $('playBox'); if (!box) return;
  box.innerHTML = '';
  const m = doc.map, play = m.play, hk = HIKES[play.hike];
  const track = m.board.tracks[hk.side] || [];
  const at = play.pos >= 0 ? track[play.pos] : null;

  const head = document.createElement('div');
  head.className = 'note';
  head.textContent = play.done
    ? 'All four hikes walked. Reset to play again.'
    : `Hike ${play.hike + 1} of 4 — the ${hk.side} edge, space ${play.pos + 1} of ${track.length}.`;
  box.appendChild(head);

  const pts = document.createElement('div');
  pts.className = 'row';
  pts.innerHTML = `<label>Movement points</label><b class="val">${at ? at.n : '—'}</b>`;
  box.appendChild(pts);

  const row = document.createElement('div');
  row.className = 'row';
  const rollBtn = document.createElement('button');
  rollBtn.className = 'btn'; rollBtn.textContent = 'Roll d6';
  rollBtn.disabled = play.done;
  rollBtn.disabled = play.done || play.pos === track.length - 1;
  rollBtn.onclick = () => {
    const d = 1 + Math.floor(Math.random() * 6);
    let res;
    doc.edit('roll', (mm) => { res = rollDie(mm.board, mm.play, d); });
    lastRoll = { d, ...res };
    refresh(); ed.draw();
  };
  // Landing on the last space does not end the hike on the spot — the rules
  // make that turn the last one, so the walk still happens. Finishing is its
  // own step.
  if (!play.done && play.pos === track.length - 1) {
    const fin = document.createElement('button');
    fin.className = 'btn'; fin.textContent = play.hike < HIKES.length - 1 ? 'Finish hike \u2192' : 'Finish the game';
    fin.onclick = () => {
      doc.edit('finish hike', (mm) => { nextHike(mm.play); });
      lastRoll = null; refresh(); ed.draw();
    };
    row.appendChild(fin);
  }
  const reset = document.createElement('button');
  reset.className = 'btn'; reset.textContent = 'Reset';
  reset.onclick = () => {
    doc.edit('reset play', (mm) => { mm.play = { ...blankPlay(), card: blankCardPlay() }; });
    lastRoll = null; ed.cardBox = null; refresh(); ed.draw();
  };
  row.append(rollBtn, reset);
  box.appendChild(row);

  const sc = cardScore(m.card, m.play.card);
  const tot = document.createElement('div');
  tot.className = 'row';
  tot.innerHTML = `<label>Score</label><b class="val">${sc.total}</b>`;
  box.appendChild(tot);
  const brk = document.createElement('div');
  brk.className = 'note';
  brk.textContent = `Tracks ${sc.animals} · Gear ${sc.gear} · Journal ${sc.journal} · Goal ${sc.goal}` +
    ` · Water ${m.play.card.water}`;
  box.appendChild(brk);
  const hint = document.createElement('div');
  hint.className = 'note';
  hint.textContent = ed.cardBox
    ? 'Type digits to fill the selected box. Backspace clears, Esc lets go.'
    : 'On the card: click a space to circle it, again to cross it off. Click a box, then type.';
  box.appendChild(hint);

  if (lastRoll) {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = `Rolled ${lastRoll.d} — landed on ${lastRoll.points} movement points` +
      (lastRoll.end ? '. Last space on the edge — take this turn, then finish the hike.' : '.');
    box.appendChild(n);
  }
}
let lastRoll = null;

function spacePanel() {
  const box = $('spaceBox'); if (!box) return;
  box.innerHTML = '';
  if (!selSpace) {
    box.innerHTML = '<div class="empty">Click a space on the board to change what it says.</div>';
    return;
  }
  const track = doc.map.board.tracks[selSpace.side];
  const sp = track && track[selSpace.i];
  if (!sp) { selSpace = null; return; }
  const title = document.createElement('div');
  title.className = 'note';
  title.textContent = `${selSpace.side} edge, space ${selSpace.i + 1} of ${track.length}`;
  box.appendChild(title);

  const r1 = document.createElement('div'); r1.className = 'row';
  const lab = document.createElement('label'); lab.textContent = 'Movement points';
  const num = document.createElement('input');
  num.type = 'number'; num.min = 0; num.max = 9; num.value = sp.n;
  num.oninput = () => {
    doc.edit('space value', (m) => { m.board.tracks[selSpace.side][selSpace.i].n = +num.value || 0; });
    ed.draw();
  };
  r1.append(lab, num); box.appendChild(r1);

  const r2 = document.createElement('div'); r2.className = 'row';
  const lab2 = document.createElement('label'); lab2.textContent = 'Weather';
  const sel = document.createElement('select');
  for (const k of WEATHER_KEYS) {
    const o = document.createElement('option');
    o.value = k; o.textContent = WEATHER[k].label; o.selected = k === sp.w;
    sel.appendChild(o);
  }
  sel.onchange = () => {
    doc.edit('space weather', (m) => { m.board.tracks[selSpace.side][selSpace.i].w = sel.value; });
    ed.draw();
  };
  r2.append(lab2, sel); box.appendChild(r2);

  const r3 = document.createElement('div'); r3.className = 'row';
  const jump = document.createElement('button');
  jump.className = 'btn'; jump.textContent = 'Play from here';
  jump.onclick = () => {
    const hi = HIKES.findIndex((h) => h.side === selSpace.side);
    doc.edit('set position', (m) => { m.play.hike = hi; m.play.pos = selSpace.i; m.play.done = false; });
    refresh(); ed.draw();
  };
  r3.append(jump); box.appendChild(r3);
}

// ---------------------------------------------------------------- inspector
function inspector() {
  const box = $('inspector'); box.innerHTML = '';
  const sh = ed.shapeOf(ed.sel);
  if (!sh) { box.innerHTML = '<div class="empty">Nothing selected. Pick something with the Select tool.</div>'; return; }
  const layer = ed.sel.layer;
  const add = (label, el) => {
    const r = document.createElement('div'); r.className = 'row';
    const l = document.createElement('label'); l.textContent = label;
    r.append(l, el); box.appendChild(r); return el;
  };
  const num = (label, key, step = 1, obj = sh) => {
    const i = document.createElement('input'); i.type = 'number'; i.step = step;
    i.value = obj[key] ?? '';
    i.onchange = () => { doc.edit(label, () => { obj[key] = i.value === '' ? null : +i.value; touch(obj); }); refresh(); };
    return add(label, i);
  };
  const head = document.createElement('div');
  head.className = 'note';
  head.textContent = `${layer.replace(/s$/, '')} · ${sh.id}`;
  box.appendChild(head);

  if (layer === 'contours' || layer === 'rivers') {
    box.appendChild(statusChip(sh, layer));
  }
  if (layer === 'contours') {
    // level, with the metres it means, front and centre
    const lr = document.createElement('div'); lr.className = 'lvlrow';
    const down = document.createElement('button'); down.className = 'btn'; down.textContent = '−';
    const big = document.createElement('span'); big.className = 'big';
    const up = document.createElement('button'); up.className = 'btn'; up.textContent = '+';
    const showLvl = () => {
      const w = doc.map.world;
      big.textContent = sh.level == null ? '—'
        : `${sh.level}  ·  ${w.baseElevation + sh.level * w.contourInterval} m`;
    };
    const step = (d) => { doc.edit('level', () => { sh.level = (sh.level | 0) + d; }); showLvl(); refresh(); };
    down.onclick = () => step(-1); up.onclick = () => step(1);
    showLvl();
    lr.append(down, big, up);
    const lab = document.createElement('div'); lab.className = 'note'; lab.textContent = 'Level';
    box.append(lab, lr);
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!sh.closed;
    cb.onchange = () => {
      doc.edit('closed', () => { sh.closed = cb.checked; sh.rev = (sh.rev | 0) + 1; touch(sh); });
      if (cb.checked) ed.flash(sh.id);
      refresh();
    };
    add('Closed ring', cb);
    // an edge-to-edge contour cuts the sheet in two; say which side is the hill
    if (!sh.closed && ed.isComplete(sh, 'contours')) {
      const flip = document.createElement('button');
      flip.className = 'btn'; flip.style.width = '100%';
      flip.textContent = sh.side === 'big' ? 'Raised side: larger ⇄' : 'Raised side: smaller ⇄';
      flip.onclick = () => {
        doc.edit('flip side', () => { sh.side = sh.side === 'big' ? 'small' : 'big'; });
        refresh(); scheduleBuild(true);
      };
      box.appendChild(flip);
    }
    box.appendChild(smoothingRow(sh));
  } else if (layer === 'rivers') {
    num('Width', 'width', 0.005);
    box.appendChild(smoothingRow(sh));
  } else if (layer === 'waypoints') {
    const sel = document.createElement('select');
    WAYPOINT_KEYS.forEach((k) => sel.add(new Option(WAYPOINTS[k].label, k, false, k === sh.type)));
    sel.onchange = () => { doc.edit('type', () => { sh.type = sel.value; }); refresh(); };
    add('Type', sel);
    const def = WAYPOINTS[sh.type];
    if (def.field) num(def.fieldLabel, def.field, def.field === 'height' ? 50 : 1);
    num('X', 'x', 0.01); num('Y', 'y', 0.01);
  } else if (layer === 'decor') {
    const sel = document.createElement('select');
    DECOR_KEYS.forEach((k) => sel.add(new Option(DECOR[k].label, k, false, k === sh.type)));
    sel.onchange = () => { doc.edit('type', () => { sh.type = sel.value; }); refresh(); };
    add('Type', sel);
    num('Spread', 'radius', 0.02);
    const n = document.createElement('div'); n.className = 'note';
    n.textContent = 'One point seeds an area. How thickly it fills is the map\u2019s '
      + 'Vegetation density, not a setting per placement.';
    box.appendChild(n);
  } else if (layer === 'places') {
    const t = document.createElement('input'); t.type = 'text'; t.value = sh.text || '';
    t.id = 'textField'; t.style.width = '150px'; t.spellcheck = false;
    t.oninput = () => { sh.text = t.value; ed.draw(); };
    t.onchange = () => { doc.edit('rename', () => { sh.text = t.value; }); };
    add('Text', t);

    const sizeRow = (label, key, min, max, step, fmt) => {
      const i = document.createElement('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = step;
      i.value = sh[key] ?? min;
      const v = document.createElement('span'); v.className = 'val'; v.textContent = fmt(+i.value);
      i.oninput = () => { sh[key] = +i.value; v.textContent = fmt(+i.value); ed.draw(); };
      i.onchange = () => doc.edit(label, () => { sh[key] = +i.value; });
      const r = document.createElement('div'); r.className = 'row';
      const l = document.createElement('label'); l.textContent = label;
      r.append(l, i, v); box.appendChild(r);
    };
    sizeRow('Size', 'size', 0.04, 0.5, 0.005, (v) => v.toFixed(3));
    sizeRow('Letter spacing', 'spacing', 0, 0.08, 0.002, (v) => v.toFixed(3));

    const a = document.createElement('input');
    a.type = 'range'; a.min = -90; a.max = 90; a.step = 1;
    a.value = Math.round(((sh.angle || 0) * 180) / Math.PI);
    const av = document.createElement('span'); av.className = 'val'; av.textContent = `${a.value}°`;
    a.oninput = () => { sh.angle = (+a.value * Math.PI) / 180; av.textContent = `${a.value}°`; ed.draw(); };
    a.onchange = () => doc.edit('rotate', () => {});
    const ar = document.createElement('div'); ar.className = 'row';
    const al = document.createElement('label'); al.textContent = 'Rotation';
    ar.append(al, a, av); box.appendChild(ar);

    const flat = document.createElement('button');
    flat.className = 'btn'; flat.textContent = 'Straighten';
    flat.style.width = '100%';
    flat.onclick = () => { doc.edit('rotate', () => { sh.angle = 0; }); refresh(); };
    box.appendChild(flat);

  } else if (layer === 'bridges') {
    num('X', 'x', 0.01); num('Y', 'y', 0.01);
    const a = document.createElement('input'); a.type = 'range'; a.min = -180; a.max = 180;
    a.value = Math.round(((sh.angle || 0) * 180) / Math.PI);
    a.oninput = () => { sh.angle = (+a.value * Math.PI) / 180; ed.draw(); };
    a.onchange = () => doc.edit('rotate', () => {});
    add('Angle', a);
  } else if (layer === 'lakes' || layer === 'woodland') {
    const n = document.createElement('div'); n.className = 'note';
    n.textContent = `${sh.pts.length} points${sh.surface != null ? ` · water at ${sh.surface} m` : ''}`;
    box.appendChild(n);
    box.appendChild(smoothingRow(sh));
  }

  if (ed.focusText && layer === 'places') {
    ed.focusText = false;
    requestAnimationFrame(() => { const f = $('textField'); if (f) { f.focus(); f.select(); } });
  }

  const bar = document.createElement('div'); bar.className = 'row'; bar.style.marginTop = '6px';
  const dup = document.createElement('button'); dup.className = 'btn'; dup.textContent = 'Duplicate';
  dup.onclick = () => { ed.duplicateSelected(); refresh(); };
  const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Delete';
  del.style.borderColor = 'var(--danger)';
  del.onclick = () => { ed.deleteSelected(); refresh(); };
  bar.append(dup, del); box.appendChild(bar);
}

function statusChip(sh, layer) {
  const done = ed.isComplete(sh, layer);
  const loose = ed.looseEnds(sh, layer).length;
  const d = document.createElement('div');
  d.className = `status ${done ? 'done' : 'open'}`;
  d.textContent = sh.closed ? '● Closed ring'
    : done ? (layer === 'rivers' ? '● Complete — both ends meet something'
                                 : '● Complete — edge to edge')
    : `○ Unfinished — ${loose} loose end${loose === 1 ? '' : 's'}`;
  const wrap = document.createElement('div'); wrap.style.margin = '2px 0 6px';
  wrap.appendChild(d);
  return wrap;
}

function smoothingRow(sh) {
  const r = document.createElement('div'); r.className = 'row';
  const l = document.createElement('label'); l.textContent = 'Smoothing';
  const i = document.createElement('input');
  i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.05;
  i.value = sh.smoothing == null ? DEFAULT_SMOOTHING : sh.smoothing;
  const v = document.createElement('span'); v.className = 'val'; v.textContent = (+i.value).toFixed(2);
  i.oninput = () => {
    sh.smoothing = +i.value; v.textContent = (+i.value).toFixed(2);
    touch(sh); ed.draw();
  };
  i.onchange = () => { doc.edit('smoothing', () => { sh.smoothing = +i.value; touch(sh); }); scheduleBuild(false); };
  r.append(l, i, v);
  return r;
}

// ---------------------------------------------------------------- layers + stats
const LAYER_LABEL = { contours: 'Contours', rivers: 'Rivers', lakes: 'Lakes',
  woodland: 'Woodland', bridges: 'Bridges', waypoints: 'Waypoints', decor: 'Decoration',
  places: 'Text' };
const hidden = new Set();
function layerList() {
  const box = $('layerList'); box.innerHTML = '';
  LAYERS.forEach((k) => {
    const l = document.createElement('label');
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !hidden.has(k);
    c.onchange = () => { c.checked ? hidden.delete(k) : hidden.add(k); applyHidden(); };
    l.append(c, document.createTextNode(`${LAYER_LABEL[k]} (${(doc.map[k] || []).length})`));
    box.appendChild(l);
  });
}
function applyHidden() {
  // hiding is a view concern: swap in empty arrays for the renderer only
  ed._hidden = hidden; ed.draw(); layerList();
}

function legend() {
  const box = $('legend'); if (!box) return;
  box.innerHTML = '';
  const m = doc.map, w = m.world;
  const counts = new Map([[0, 0]]);
  for (const c of (m.contours || [])) {
    if (c.level == null && c.height == null) continue;
    counts.set(c.level | 0, (counts.get(c.level | 0) || 0) + 1);
  }
  const levels = [...counts.keys()].sort((a, b) => a - b);
  for (const lv of levels) {
    const row = document.createElement('div');
    row.className = 'lvl';
    row.title = lv === 0 ? 'The bare sheet — every contour you draw sits above this'
      : 'Click to select the first contour at this level';
    const sw = document.createElement('i'); sw.style.background = levelColor(lv);
    const name = document.createElement('span');
    name.textContent = lv === 0 ? 'base' : `level ${lv}`;
    const met = document.createElement('span'); met.className = 'm';
    met.textContent = `${w.baseElevation + lv * w.contourInterval} m`;
    const n = document.createElement('b');
    n.textContent = lv === 0 ? '' : counts.get(lv);
    row.append(sw, name, met, n);
    row.onclick = () => {
      const hit = (m.contours || []).find((c) => (c.level | 0) === lv && c.level != null);
      if (hit) { ed.sel = { layer: 'contours', id: hit.id }; ed.setTool('select'); refresh(); }
    };
    box.appendChild(row);
  }
}

function stats() {
  const m = doc.map, box = $('stats'); box.innerHTML = '';
  const L = (k) => m[k] || [];          // a map saved before a layer existed has no array for it
  const counts = {};
  L('waypoints').forEach((w) => { counts[w.type] = (counts[w.type] || 0) + 1; });
  const pending = L('contours').filter((c) => c.level == null && c.height == null).length;
  const unfinished = L('contours').filter((c) => !ed.isComplete(c, 'contours')).length;
  const rows = [
    ['Grid squares', m.grid.cols * m.grid.rows],
    ['Contours', L('contours').length],
    ['— unfinished', unfinished],
    ['— without a level', pending],
    ['Lakes', L('lakes').length], ['Woodland', L('woodland').length],
    ['Bridges', L('bridges').length], ['River parts', L('rivers').length],
    ['— with a loose end', L('rivers').filter((r) => !ed.isComplete(r, 'rivers')).length],
    ['Decoration', L('decor').length],
    ...Object.keys(WAYPOINTS).map((k) => [WAYPOINTS[k].label, counts[k] || 0]),
  ];
  for (const [k, v] of rows) {
    const d = document.createElement('div'); d.className = 'stat';
    d.innerHTML = `<span>${k}</span><b>${v}</b>`; box.appendChild(d);
  }
}

// ---------------------------------------------------------------- world settings
function bindWorld() {
  const w = () => doc.map.world;
  const set = (key, v) => { doc.edit(key, (m) => { m.world[key] = v; }); scheduleBuild(true); };
  $('vex').oninput = (e) => { $('vexVal').textContent = e.target.value; };
  $('vex').onchange = (e) => set('verticalExaggeration', +e.target.value);
  $('ival').onchange = (e) => { set('contourInterval', +e.target.value); refresh(); };
  $('base').onchange = (e) => { set('baseElevation', +e.target.value); refresh(); };
  $('mpc').onchange = (e) => set('metresPerCell', +e.target.value);
  $('depth').onchange = (e) => set('waterDepth', +e.target.value);
  $('baseRun').oninput = (e) => { $('baseRunVal').textContent = (+e.target.value).toFixed(1); };
  $('baseRun').onchange = (e) => set('baseRun', +e.target.value);
  $('rdepth').onchange = (e) => set('riverDepth', +e.target.value);
  $('rbank').onchange = (e) => set('riverBank', +e.target.value);
  $('smooth').oninput = (e) => { $('smoothVal').textContent = (+e.target.value).toFixed(1); };
  $('smooth').onchange = (e) => set('smoothing', +e.target.value);
  $('vegDensity').oninput = (e) => { $('vegDensityVal').textContent = (+e.target.value).toFixed(2); };
  $('vegDensity').onchange = (e) => set('decorDensity', +e.target.value);
  $('forestDensity').oninput = (e) => { $('forestDensityVal').textContent = (+e.target.value).toFixed(2); };
  $('forestDensity').onchange = (e) => set('forestDensity', +e.target.value);
  // --- scale. A range that only changes how big something is drawn does not
  // need a solve, but it does need the scene rebuilt, and `set` already does that.
  const slider = (id, key, fmt) => {
    $(id).oninput = (e) => { $(id + 'Val').textContent = fmt(+e.target.value); };
    $(id).onchange = (e) => set(key, +e.target.value);
  };
  const two = (v) => v.toFixed(2), one = (v) => v.toFixed(1), int = (v) => String(v);
  $('figH').onchange = (e) => set('figureHeight', +e.target.value);
  slider('figX', 'figureScale', int);
  slider('scnX', 'sceneryScale', two);
  slider('covX', 'coverScale', two);
  slider('covD', 'coverDensity', one);
  slider('orbX', 'orbitBoost', int);

  $('res').oninput = (e) => { $('resVal').textContent = e.target.value; };
  $('res').onchange = () => scheduleBuild(true);
  $('autoBuild').onchange = () => scheduleBuild(false);
  const ww = w();
  $('vex').value = ww.verticalExaggeration; $('vexVal').textContent = ww.verticalExaggeration;
  $('ival').value = ww.contourInterval; $('base').value = ww.baseElevation;
  $('mpc').value = ww.metresPerCell; $('depth').value = ww.waterDepth;
  $('baseRun').value = ww.baseRun ?? 1; $('baseRunVal').textContent = (+$('baseRun').value).toFixed(1);
  $('rdepth').value = ww.riverDepth ?? 22; $('rbank').value = ww.riverBank ?? 14;
  $('smooth').value = ww.smoothing ?? 1; $('smoothVal').textContent = (+$('smooth').value).toFixed(1);
  $('vegDensity').value = ww.decorDensity ?? 1;
  $('vegDensityVal').textContent = (+$('vegDensity').value).toFixed(2);
  $('forestDensity').value = ww.forestDensity ?? 1;
  $('forestDensityVal').textContent = (+$('forestDensity').value).toFixed(2);
  $('figH').value = ww.figureHeight ?? 1.8;
  for (const [id, key, dflt, fmt] of [
    ['figX', 'figureScale', 1, int], ['scnX', 'sceneryScale', 1, two],
    ['covX', 'coverScale', 1, two], ['covD', 'coverDensity', 1.8, one],
    ['orbX', 'orbitBoost', 8, int],
  ]) { $(id).value = ww[key] ?? dflt; $(id + 'Val').textContent = fmt(+$(id).value); }
}

// ---------------------------------------------------------------- 3D build
function scheduleBuild(force) {
  if (!view3d) return;
  if (!$('autoBuild').checked && !force) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(build, 220);
}
function build() {
  if (!view3d) return;
  try {
    const r = view3d.rebuild(doc.map, +$('res').value);
    const tri = r.tris ? ` · ${(r.tris / 1e6).toFixed(1)}M tris` : '';
    $('build3d').textContent = `${r.ms} ms · ${Math.round(r.min)}–${Math.round(r.max)} m${tri}`;
  } catch (e) {
    $('build3d').textContent = 'build failed';
    console.error(e);
  }
}
$('rebuild').onclick = build;
$('frameBtn').onclick = () => { if (view3d) view3d.frame(); };
$('findHiker').onclick = () => { if (view3d) view3d.gotoHiker(); };
$('bands').onchange = (e) => { ed.showBands = e.target.checked; ed.draw(); };
$('lvlNums').onchange = (e) => { ed.showLevelNums = e.target.checked; ed.draw(); };
$('walkBtn').onclick = () => {
  if (!view3d) return;
  const on = !view3d.walk;
  const s = ed.shapeOf(ed.sel);
  view3d.setWalk(on, s && s.x != null ? { x: s.x, y: s.y } : null, +$('res').value);
  $('walkBtn').classList.toggle('on', on);
  $('hint3d').textContent = on
    ? 'Drag to look · wheel to walk forward'
    : 'Drag to orbit · shift-drag to pan · wheel to zoom · click the ground to send the hiker';
};

// ---------------------------------------------------------------- file IO
$('save').onclick = () => {
  const clean = JSON.parse(JSON.stringify(doc.map));
  for (const k of LAYERS) (clean[k] || []).forEach((s) => { delete s.rev; delete s._w; });
  const blob = new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.map.id || 'map'}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('open').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { doc.load(JSON.parse(await f.text())); } catch (err) { alert('Could not read that file: ' + err.message); }
  e.target.value = '';
};
$('newMap').onclick = () => {
  if (!confirm('Start a blank 6×4 map? Your current map is autosaved but will be replaced.')) return;
  const m = blankMap(); m.underlay.src = doc.map.underlay.src;
  doc.load(m);
};
$('prefill').onclick = async () => {
  try {
    const r = await fetch('assets/maps/map-01.json');
    if (!r.ok) throw new Error('no auto-traced draft found (assets/maps/map-01.json)');
    const m = migrate(await r.json());
    m.underlay.src = m.underlay.src || DEFAULT_UNDERLAY;
    doc.load(m);
  } catch (e) { alert(e.message); }
};
$('ulPick').onclick = () => $('imgInput').click();
$('imgInput').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const fr = new FileReader();
  fr.onload = () => { doc.edit('underlay', (m) => { m.underlay.src = fr.result; }); refresh(); };
  fr.readAsDataURL(f);
  e.target.value = '';
};
$('ulShow').onchange = (e) => { doc.map.underlay.visible = e.target.checked; ed.draw(); };
$('ulOpacity').oninput = (e) => {
  doc.map.underlay.opacity = +e.target.value / 100;
  $('ulVal').textContent = e.target.value; ed.draw();
};
$('mapName').onchange = (e) => doc.edit('name', (m) => { m.name = e.target.value; });

$('undo').onclick = () => doc.undo();
$('redo').onclick = () => doc.redo();
$('fit').onclick = () => ed.fit();

// ---------------------------------------------------------------- keys
window.addEventListener('keydown', (e) => {
  if (/input|textarea|select/i.test(e.target.tagName)) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault(); e.shiftKey ? doc.redo() : doc.undo(); return;
  }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); $('save').click(); return; }
  if (!mod) {
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (t) { ed.setTool(t.id); syncUI(); e.preventDefault(); return; }
    const wk = WAYPOINT_KEYS.find((k) => WAYPOINTS[k].key === e.key);
    if (wk) { ed.wpType = wk; ed.setTool('waypoint'); syncUI(); e.preventDefault(); return; }
    const dk = DECOR_KEYS.find((k) => DECOR[k].key === e.key);
    if (dk) { ed.decorType = dk; ed.setTool('decor'); syncUI(); e.preventDefault(); return; }
  }
  if (ed.key(e)) { e.preventDefault(); syncUI(); }
});
$('map2d').addEventListener('pointermove', (e) => {
  const p = ed.eventPos(e);
  const cell = `${String.fromCharCode(65 + Math.max(0, Math.min(doc.map.grid.cols - 1, Math.floor(p[0]))))}${Math.max(1, Math.min(doc.map.grid.rows, Math.floor(p[1]) + 1))}`;
  $('coords').textContent = `${p[0].toFixed(2)}, ${p[1].toFixed(2)}  ·  square ${cell}`;
});

// ---------------------------------------------------------------- sync
function syncUI() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === ed.tool));
  document.querySelectorAll('[data-wp]').forEach((b) =>
    b.classList.toggle('on', ed.tool === 'waypoint' && b.dataset.wp === ed.wpType));
  document.querySelectorAll('[data-dec]').forEach((b) =>
    b.classList.toggle('on', ed.tool === 'decor' && b.dataset.dec === ed.decorType));
  $('wpPalette').style.opacity = ed.tool === 'waypoint' ? 1 : 0.45;
  $('decorPalette').style.opacity = ed.tool === 'decor' ? 1 : 0.45;
  const t = TOOLS.find((x) => x.id === ed.tool);
  $('hint').textContent = t ? t.hint : '';
  $('undo').disabled = !doc.undoStack.length; $('redo').disabled = !doc.redoStack.length;
}
function refresh() {
  const sel = ed.shapeOf(ed.sel);
  if (sel && ed.sel.layer === 'contours' && sel.level != null) ed.contourLevel = sel.level;
  ed.draw(); syncUI(); inspector(); legend(); stats(); layerList(); boardPanel(); scheduleBuild(false);
}
ed.onChange = refresh;
doc.on(() => {
  setSheet(doc.map.grid.cols, doc.map.grid.rows);
  $('mapName').value = doc.map.name || '';
  ed.setUnderlay(doc.map.underlay.src);
  $('boardShow').checked = doc.map.board.visible !== false;
  boardPanel();
  $('ulOpacity').value = Math.round(doc.map.underlay.opacity * 100);
  $('ulVal').textContent = $('ulOpacity').value;
  refresh();
});

// ---------------------------------------------------------------- go
addEventListener('resize', () => { ed.draw(); view3d && view3d.resize(); });
ed.setUnderlay(doc.map.underlay.src);
$('boardShow').checked = doc.map.board.visible !== false;
$('boardShow').onchange = (e) => {
  doc.edit('board', (m) => { m.board.visible = e.target.checked; });
  ed.draw();
};
$('bandW').value = Math.round(doc.map.board.band * 100);
$('bandVal').textContent = doc.map.board.band.toFixed(2);
$('bandW').oninput = (e) => {
  const v = +e.target.value / 100;
  $('bandVal').textContent = v.toFixed(2);
  doc.edit('track depth', (m) => { m.board.band = v; });
  ed.draw();
};
ed.onBoardClick = (hit) => { selSpace = hit; boardPanel(); ed.draw(); };

// ---------------------------------------------------------------- the card
// Circling a space, crossing it out once the action is spent, choosing a goal,
// drinking water: all of it is a click on the card itself rather than a form in
// the sidebar, because that is where you look while you play.
ed.onCardClick = (g) => {
  if (g.kind === 'space') {
    doc.edit('mark', (m) => {
      const at = m.play.card.marks[g.key] || 0;
      m.play.card.marks[g.key] = (at + 1) % 3;      // none -> circled -> used
    });
  } else if (g.kind === 'water') {
    // clicking a bottle drinks down to it, or puts one back if it was the last
    doc.edit('water', (m) => {
      m.play.card.water = m.play.card.water === g.n + 1 ? g.n : g.n + 1;
    });
  } else if (g.kind === 'goal') {
    doc.edit('goal', (m) => {
      m.play.card.goal = m.play.card.goal === g.g.id ? null : g.g.id;
    });
  } else if (g.key) {
    ed.cardBox = ed.cardBox === g.key ? null : g.key;    // boxes and the goal total
  }
  refresh(); ed.draw();
};

// A selected box takes digits straight from the keyboard — no field to find.
addEventListener('keydown', (e) => {
  if (!ed.cardBox) return;
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  const key = ed.cardBox;
  if (/^[0-9]$/.test(e.key)) {
    doc.edit('write', (m) => {
      const cur = String(m.play.card.boxes[key] ?? '');
      m.play.card.boxes[key] = +(cur.length < 4 ? cur + e.key : e.key);
    });
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    doc.edit('write', (m) => {
      const cur = String(m.play.card.boxes[key] ?? '');
      const next = cur.slice(0, -1);
      if (next) m.play.card.boxes[key] = +next; else delete m.play.card.boxes[key];
    });
  } else if (e.key === 'Escape' || e.key === 'Enter') {
    ed.cardBox = null;
  } else return;
  e.preventDefault();
  refresh(); ed.draw();
});

boardPanel();
$('mapName').value = doc.map.name || '';
$('ulOpacity').value = Math.round(doc.map.underlay.opacity * 100);
$('ulVal').textContent = $('ulOpacity').value;
setSheet(doc.map.grid.cols, doc.map.grid.rows);
// handy from the console; autoLevel() sets every closed ring's level from its nesting
window.wp = {
  doc, ed, view3d, build, refresh,
  autoLevel: () => { const r = doc.edit('auto-level', (m) => autoLevelContours(m)); refresh(); build(); return r; },
};
bindWorld();
ed.fit();
requestAnimationFrame(() => { view3d && view3d.resize(); build(); });
refresh();
