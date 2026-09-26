// sail-chart.js — the parchment chart: a cached static map of the Caribbean, the HUD minimap
// and the full-screen chart overlay (towns by nation, player marker, treasure search area).
import * as W from '../world.js';
import { isTracked, setTrack } from '../track.js';

const CS = 0.25;                      // static chart pixels per world unit (1000 × 750)
const CW = W.WORLD_W * CS, CH = W.WORLD_H * CS;
let staticChart = null;

const INK = '#3a2c1c', INK_M = '#6b5638';
const SEA = '#e3d3a8', SHALLOW = '#cfd8b6', LAND = '#c9a96a', LAND_ARID = '#d3b47a';

/** Cached canvas with sea, graticule, islands and sea names (no towns or ships). */
export function chartImage() {
  if (staticChart) return staticChart;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(CW / 2, CH * 0.4, 50, CW / 2, CH / 2, CW * 0.7);
  grad.addColorStop(0, '#f1e5c6'); grad.addColorStop(1, SEA);
  g.fillStyle = grad; g.fillRect(0, 0, CW, CH);
  // graticule
  g.strokeStyle = 'rgba(107,86,56,.16)'; g.lineWidth = 1;
  for (let x = 0; x <= W.WORLD_W; x += 500) { g.beginPath(); g.moveTo(x * CS, 0); g.lineTo(x * CS, CH); g.stroke(); }
  for (let z = 0; z <= W.WORLD_H; z += 500) { g.beginPath(); g.moveTo(0, z * CS); g.lineTo(CW, z * CS); g.stroke(); }
  // shallows halo, then a coast outline (strokes first → union outline), then land fill
  g.fillStyle = SHALLOW;
  for (const b of W.ISLANDS) { g.beginPath(); g.arc(b.cx * CS, b.cz * CS, (b.r + 22) * CS, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 2.6;
  for (const b of W.ISLANDS) { g.beginPath(); g.arc(b.cx * CS, b.cz * CS, b.r * CS, 0, Math.PI * 2); g.stroke(); }
  for (const b of W.ISLANDS) { g.fillStyle = b.biome === 'arid' ? LAND_ARID : LAND; g.beginPath(); g.arc(b.cx * CS, b.cz * CS, b.r * CS - 1, 0, Math.PI * 2); g.fill(); }
  // a little hatching on land
  g.strokeStyle = 'rgba(90,110,50,.25)'; g.lineWidth = 1;
  for (const b of W.ISLANDS) for (let k = 0; k < Math.max(1, b.r / 30); k++) {
    const a = (b.seed * 7 + k * 2.3), rr = b.r * 0.5 * CS, x = b.cx * CS + Math.cos(a) * rr * (k % 2 ? 0.4 : 0.8), y = b.cz * CS + Math.sin(a) * rr * 0.6;
    g.beginPath(); g.moveTo(x - 4, y + 2); g.lineTo(x, y - 3); g.lineTo(x + 4, y + 2); g.stroke();
  }
  // sea names
  g.fillStyle = 'rgba(107,86,56,.55)'; g.textAlign = 'center';
  g.font = 'italic 600 22px "EB Garamond", Georgia, serif';
  g.fillText('Caribbean Sea', 2350 * CS, 1950 * CS);
  g.fillText('Gulf of Mexico', 700 * CS, 700 * CS);
  g.fillText('Atlantic Ocean', 3350 * CS, 700 * CS);
  // land and region names — everything the game mentions can be found here
  for (const l of W.CHART_LABELS) {
    const lines = l.text.split('|'), land = l.kind === 'land';
    g.font = land ? '700 11px Cinzel, "EB Garamond", serif' : 'italic 600 15px "EB Garamond", Georgia, serif';
    g.fillStyle = land ? 'rgba(58,44,28,.72)' : 'rgba(107,86,56,.6)';
    if ('letterSpacing' in g) g.letterSpacing = land ? '2px' : '0.5px';
    g.strokeStyle = 'rgba(241,229,198,.85)'; g.lineWidth = 3; g.lineJoin = 'round';
    lines.forEach((t, i) => { const tx = land ? t.toUpperCase() : t, y = l.z * CS + (i - (lines.length - 1) / 2) * 16; g.strokeText(tx, l.x * CS, y); g.fillText(tx, l.x * CS, y); });
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  // compass rose
  const rx = CW - 70, ry = CH - 80;
  g.strokeStyle = INK_M; g.fillStyle = INK_M; g.lineWidth = 1.5;
  g.beginPath(); g.arc(rx, ry, 34, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(rx + Math.sin(a) * 40, ry - Math.cos(a) * 40); g.lineTo(rx + Math.sin(a + 0.5) * 9, ry - Math.cos(a + 0.5) * 9); g.lineTo(rx + Math.sin(a - 0.5) * 9, ry - Math.cos(a - 0.5) * 9); g.closePath(); g.fill(); }
  g.font = '700 14px Cinzel, serif'; g.fillStyle = INK; g.fillText('N', rx, ry - 44);
  // border
  g.strokeStyle = 'rgba(58,44,28,.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, CW - 3, CH - 3);
  staticChart = c;
  return c;
}

function drawShip(g, x, y, heading, size, fill) {
  // heading: forward = (sin h, cos h) in (x,z) → canvas (x, y) same orientation
  const fx = Math.sin(heading), fy = Math.cos(heading), px = -fy, py = fx;
  g.beginPath();
  g.moveTo(x + fx * size, y + fy * size);
  g.lineTo(x - fx * size * 0.7 + px * size * 0.6, y - fy * size * 0.7 + py * size * 0.6);
  g.lineTo(x - fx * size * 0.35, y - fy * size * 0.35);
  g.lineTo(x - fx * size * 0.7 - px * size * 0.6, y - fy * size * 0.7 - py * size * 0.6);
  g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
}

/** Treasure search area for the marked quest (only when ≥ 3 fragments) → {x, z, r, quest} | null */
export function searchArea(career) {
  if (!career || !career.markedQuest) return null;
  const q = W.questById(career.markedQuest); if (!q) return null;
  if ((career.treasuresFound || []).includes(q.id)) return null;
  const frags = (career.mapFragments && career.mapFragments[q.id] || []).filter(Boolean).length;
  if (frags < 3) return null;
  const hsh = W.hash(q.id), off = frags >= 4 ? 0 : 45; // all four pieces → exact
  const a = (hsh % 360) * Math.PI / 180;
  return { x: q.site.x + Math.cos(a) * off, z: q.site.z + Math.sin(a) * off, r: frags >= 4 ? 60 : 110, quest: q, frags };
}

/**
 * Minimap: draws a window of the chart around the player into a canvas.
 * opts = { x, z, heading, span (world units wide), ships:[{x,z}], career }
 */
export function drawMinimap(canvas, { x, z, heading, span = 1100, ships = [], career, target = null }) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const img = chartImage(), k = w / span, spanZ = h / k;
  const sx = (x - span / 2) * CS, sy = (z - spanZ / 2) * CS;
  g.fillStyle = SEA; g.fillRect(0, 0, w, h);
  g.drawImage(img, sx, sy, span * CS, spanZ * CS, 0, 0, w, h);
  const toX = wx => (wx - x) * k + w / 2, toY = wz => (wz - z) * k + h / 2;
  const area = searchArea(career);
  if (area) { g.setLineDash([5, 4]); g.strokeStyle = '#b3372c'; g.lineWidth = 2; g.beginPath(); g.arc(toX(area.x), toY(area.z), area.r * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  for (const t0 of W.TOWNS) {
    const tx = toX(t0.x), ty = toY(t0.z); if (tx < -10 || ty < -10 || tx > w + 10 || ty > h + 10) continue;
    const t = W.townInfo(t0, career);
    g.fillStyle = W.NATIONS[t.nation].color; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(tx, ty, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  for (const s of ships) { g.fillStyle = s.color || '#10202f'; g.beginPath(); g.arc(toX(s.x), toY(s.z), 5, 0, Math.PI * 2); g.fill(); }
  if (target) { // tracked quest: a gold star, or an arrow on the edge when it's off the minimap
    let tx = toX(target.x), ty = toY(target.z);
    const inside = tx > 10 && ty > 10 && tx < w - 10 && ty < h - 10;
    if (!inside) { const dx = tx - w / 2, dy = ty - h / 2, k2 = Math.min((w / 2 - 14) / Math.abs(dx || 1e-6), (h / 2 - 14) / Math.abs(dy || 1e-6)); tx = w / 2 + dx * k2; ty = h / 2 + dy * k2; }
    drawStar(g, tx, ty, inside ? 11 : 8);
  }
  drawShip(g, w / 2, h / 2, heading, 13, '#b3372c');
}
function drawStar(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = '#e9c77f'; g.strokeStyle = '#3a2c1c'; g.lineWidth = 2; g.fill(); g.stroke();
}

/**
 * Full chart overlay inside the sail mode's root. Returns { el, close(), redraw() }.
 * opts = { ui, career, player:{x,z,heading}, onClose }
 */
export function openChart(parent, { ui, career, player, onClose, target = null }) {
  const { h } = ui;
  const DW = 760, DH = 570; // display size of the map canvas
  const canvas = h('canvas', { class: 'sl-chart-canvas', width: DW * 2, height: DH * 2, style: { width: DW + 'px', height: DH + 'px' } });
  const info = h('div', { class: 'sl-chart-info' });
  let selected = null;
  const close = () => { el.remove(); onClose && onClose(); };
  const area = searchArea(career);
  const mq = career.markedQuest && W.questById(career.markedQuest);
  const legend = h('div', { class: 'sl-chart-legend' },
    W.NATION_IDS.map(n => h('div', { class: 'sl-leg-row' }, h('span', { class: 'sl-leg-dot', style: { background: W.NATIONS[n].color } }), W.NATIONS[n].name,
      h('span', { class: 'sl-leg-rel' }, relText(career, n)))));
  const questNote = mq ? h('div', { class: 'sl-chart-quest' + (area ? ' on' : '') },
    h('div', { class: 'label-caps' }, 'MARKED TREASURE'),
    h('div', { class: 'sl-cq-name' }, mq.name),
    h('div', { class: 'sl-cq-sub' }, area ? `Search inside the red circle: ${mq.area}. Sail close and go ashore to dig.` : 'Find at least 3 pieces of this map to mark where to dig.')) : null;
  const el = h('div', { class: 'sl-chart-back blocker' },
    h('div', { class: 'navy-frame sl-chart' },
      h('div', { class: 'parchment sl-chart-in' },
        h('div', { class: 'sl-chart-map' }, canvas),
        h('div', { class: 'sl-chart-side' },
          h('div', { class: 'sl-chart-head' },
            h('div', { class: 'sl-chart-title' }, 'Chart of the Caribbean'),
            h('button', { class: 'x-btn sl-chart-close', 'aria-label': 'Close chart', onTap: close }, '✕')),
          h('div', { class: 'sl-chart-you' }, `You are here: ${W.placeName(player.x, player.z)}`),
          info, questNote,
          h('div', { class: 'label-caps' }, 'HOW EACH NATION SEES YOU'), legend,
          h('div', { class: 'sl-chart-tip' }, 'Tap a town to see who holds it.')))));
  parent.append(el);

  const kx = DW * 2 / W.WORLD_W, ky = DH * 2 / W.WORLD_H;
  function redraw() {
    const g = canvas.getContext('2d');
    g.drawImage(chartImage(), 0, 0, canvas.width, canvas.height);
    if (area) {
      g.setLineDash([10, 7]); g.strokeStyle = '#b3372c'; g.lineWidth = 4;
      g.beginPath(); g.arc(area.x * kx, area.z * ky, Math.max(18, area.r * kx), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.font = '800 30px Cinzel, serif'; g.fillStyle = '#b3372c'; g.textAlign = 'center'; g.fillText('✕', area.x * kx, area.z * ky + 10);
    }
    g.textAlign = 'center';
    for (const t0 of W.TOWNS) {
      const t = W.townInfo(t0, career), x = t0.x * kx, y = t0.z * ky, sel = selected && selected.id === t0.id;
      g.fillStyle = W.NATIONS[t.nation].color; g.strokeStyle = sel ? '#f0d79a' : '#fff'; g.lineWidth = sel ? 6 : 3;
      g.beginPath(); g.arc(x, y, sel ? 13 : 9, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = (sel ? '700 22px' : '600 18px') + ' "EB Garamond", Georgia, serif';
      g.lineWidth = 4; g.strokeStyle = 'rgba(241,229,198,.85)'; g.strokeText(t0.name, x, y - 16); g.fillStyle = INK; g.fillText(t0.name, x, y - 16);
    }
    if (target) {
      drawStar(g, target.x * kx, target.z * ky, 22);
      g.font = '700 22px Cinzel, serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = 'rgba(241,229,198,.9)';
      g.strokeText(target.name, target.x * kx, target.z * ky + 44); g.fillStyle = '#7d5a24'; g.fillText(target.name, target.x * kx, target.z * ky + 44);
    }
    drawShip(g, player.x * kx, player.z * ky, player.heading, 20, '#b3372c');
  }
  function showTown(t0) {
    selected = t0;
    const t = W.townInfo(t0, career), n = W.NATIONS[t.nation];
    info.replaceChildren(
      h('div', { class: 'sl-ti-row' }, h('span', { class: 'flag-sm', style: { background: n.color } }), h('span', { class: 'sl-ti-name' }, t0.name)),
      h('div', { class: 'sl-ti-sub' }, `${n.adj} colony · ${W.WEALTH_LABEL[t.wealth] || ''} · ${W.isleName(t0.isle)}`),
      h('div', { class: 'sl-ti-rel' }, relText(career, t.nation)),
      h('button', { class: (isTracked(career, 'town', t0.id) ? 'ink-btn' : 'gold-btn') + ' sm sl-ti-track', onTap: () => {
        if (isTracked(career, 'town', t0.id)) { setTrack(career, null); ui.toast('The arrow is off your compass.', { title: 'Stopped tracking' }); }
        else { setTrack(career, 'town', t0.id); ui.toast(`Follow the gold arrow to ${t0.name}.`, { title: 'Tracking on your compass' }); }
        showTown(t0);
      } }, isTracked(career, 'town', t0.id) ? '➤ Tracking ✓' : `➤ Track ${t0.name}`));
    info.classList.add('on');
    redraw();
  }
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width * canvas.width, cy = (e.clientY - r.top) / r.height * canvas.height;
    let best = null, bd = 60; // canvas px (2× display) — generous for fingers
    for (const t0 of W.TOWNS) { const d = Math.hypot(t0.x * kx - cx, t0.z * ky - cy); if (d < bd) { bd = d; best = t0; } }
    if (best) showTown(best);
  });
  redraw();
  return { el, close, redraw, showTown };
}

function relText(career, n) {
  if (!career) return '';
  if (n === career.nation) return 'Your nation';
  const rel = W.relation(career.nation, n, career.relations), st = career.standing[n] || 0;
  if (rel === 'war') return 'At war with you';
  if (st <= -30) return 'Hostile to you';
  if (st >= 30) return 'Friendly';
  return 'Neutral';
}
export { relText };
