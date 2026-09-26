// treasure-maps.js — shared by log (Maps tab fragment art) and treasure (beach dig).
// Each treasure quest has a LANDMARK that matches its blurb. The map art draws it; the dig scene builds it in 3D.
import { hash, rng as makeRng } from '../world.js';

/** Landmark per quest id. spot = where the chest is, relative to the landmark (x east, z south, beach units). */
export const LANDMARKS = {
  silverfleet: { kind: 'palms3', label: 'three palms', extra: 'chapel', clue: 'Dig beside the three palms, south of the ruined chapel.', spot: { x: 0, z: 3.2 } },
  bishopbells: { kind: 'bellRock', label: 'the white bell rock', clue: 'Dig in the sand in front of the white rock shaped like a bell.', spot: { x: 0.5, z: 3.4 } },
  crownhoard: { kind: 'twistedPalm', label: 'the lone twisted palm', clue: 'Dig at the foot of the lone twisted palm on the sandy spit.', spot: { x: 2.4, z: 2.2 } },
  suncoins: { kind: 'stones2', label: 'the two lookout stones', clue: 'Dig between the two lookout stones below the hill.', spot: { x: 0, z: 1.5 } },
};
export const landmarkFor = id => LANDMARKS[id] || LANDMARKS.silverfleet;

const INK = '#3a2c1c';
/**
 * Draw the whole treasure map for a quest into a 2D context (w×h). Procedural coastline from the quest id.
 * Pieces are quadrants: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
 */
export function drawQuestMap(g, w, h, questId) {
  const r = makeRng(hash(questId) + 77);
  // parchment wash
  const bg = g.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.5, w * 0.7);
  bg.addColorStop(0, '#efe0bb'); bg.addColorStop(1, '#d6bf8e');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // sea wave marks
  g.strokeStyle = 'rgba(40,90,110,.35)'; g.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 6, x + 16, y); g.quadraticCurveTo(x + 24, y + 6, x + 32, y); g.stroke();
  }
  // coastline: land fills the upper/right area, a bay near the centre-bottom
  const cx = w * 0.52, cy = h * 0.36, R = Math.min(w, h) * 0.33;
  const ph = [r() * 6, r() * 6, r() * 6];
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    let rr = R * (1 + 0.16 * Math.sin(a * 3 + ph[0]) + 0.08 * Math.sin(a * 7 + ph[1]) + 0.05 * Math.sin(a * 13 + ph[2]));
    const bay = Math.exp(-Math.pow((a - Math.PI / 2) / 0.35, 2)); rr *= 1 - 0.28 * bay; // a bay facing south
    pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr]);
  }
  const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // shallows halo
  g.save(); path(); g.strokeStyle = 'rgba(70,160,170,.28)'; g.lineWidth = 22; g.stroke(); g.restore();
  // land
  path(); g.fillStyle = '#cdb27a'; g.fill();
  g.save(); path(); g.clip();
  g.strokeStyle = 'rgba(90,120,60,.22)'; g.lineWidth = 1.5;
  for (let y = -h; y < h * 2; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.5); g.stroke(); }
  // hills
  g.fillStyle = 'rgba(90,70,40,.5)';
  for (let i = 0; i < 5; i++) { const x = cx + (r() - 0.5) * R * 1.6, y = cy - R * 0.3 + (r() - 0.5) * R * 0.5; g.beginPath(); g.moveTo(x - 14, y + 8); g.lineTo(x, y - 10); g.lineTo(x + 14, y + 8); g.fill(); }
  g.restore();
  path(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  // beach dots along the bay
  const bayX = cx, bayY = cy + R * 0.72;
  g.fillStyle = 'rgba(120,90,40,.55)';
  for (let i = 0; i < 40; i++) { const a = Math.PI / 2 + (r() - 0.5) * 1.2, d = R * (0.62 + r() * 0.12); g.fillRect(cx + Math.cos(a) * d * 1.25, cy + Math.sin(a) * d, 2, 2); }
  // landmark + X
  const lm = landmarkFor(questId), lx = bayX + (r() - 0.5) * w * 0.12, ly = bayY - 30;
  drawLandmark(g, lm.kind, lx, ly);
  if (lm.extra === 'chapel') drawChapel(g, lx + 6, ly - 58);
  const sx = lx + lm.spot.x * 7, sy = ly + lm.spot.z * 7 + 6;
  g.strokeStyle = '#a3261c'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(sx - 10, sy - 10); g.lineTo(sx + 10, sy + 10); g.moveTo(sx + 10, sy - 10); g.lineTo(sx - 10, sy + 10); g.stroke();
  // dotted path from the sea
  g.setLineDash([4, 7]); g.lineWidth = 2; g.strokeStyle = 'rgba(163,38,28,.7)';
  g.beginPath(); g.moveTo(w * 0.15, h * 0.95); g.quadraticCurveTo(w * 0.3, h * 0.72, sx - 14, sy + 10); g.stroke(); g.setLineDash([]);
  // compass rose (top-left piece) and a ship (bottom-right piece)
  drawCompass(g, w * 0.13, h * 0.16, Math.min(w, h) * 0.08);
  drawShip(g, w * 0.82, h * 0.86);
  // border
  g.strokeStyle = 'rgba(58,44,28,.6)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
}
function drawPalm(g, x, y, s = 1, lean = 0.3) {
  g.strokeStyle = '#5a3f22'; g.lineWidth = 3 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6 * lean * s, y - 14 * s, x + 10 * lean * s, y - 26 * s); g.stroke();
  const tx = x + 10 * lean * s, ty = y - 26 * s;
  g.strokeStyle = '#3f6b35'; g.lineWidth = 3 * s;
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * 8 * s, ty + Math.sin(a) * 3 * s - 6 * s, tx + Math.cos(a) * 14 * s, ty + Math.abs(Math.sin(a)) * 4 * s + 2 * s); g.stroke(); }
}
function drawChapel(g, x, y) {
  g.fillStyle = '#b9ad98'; g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 14, y + 12); g.lineTo(x - 14, y - 4); g.lineTo(x - 4, y - 12); g.lineTo(x + 2, y - 6); g.lineTo(x + 6, y - 9); g.lineTo(x + 14, y - 2); g.lineTo(x + 14, y + 12); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 4, y - 12); g.lineTo(x - 4, y - 22); g.moveTo(x - 8, y - 18); g.lineTo(x, y - 18); g.stroke();
  g.fillStyle = INK; g.fillRect(x - 3, y + 2, 6, 10);
}
function drawLandmark(g, kind, x, y) {
  if (kind === 'palms3') { drawPalm(g, x - 12, y, 1, 0.2); drawPalm(g, x + 2, y - 6, 1.1, -0.2); drawPalm(g, x + 14, y + 2, 0.95, 0.5); }
  else if (kind === 'twistedPalm') {
    g.fillStyle = '#e6d19a'; g.beginPath(); g.ellipse(x + 8, y + 6, 34, 10, -0.3, 0, 7); g.fill();
    g.strokeStyle = '#5a3f22'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 4); g.bezierCurveTo(x + 14, y - 4, x - 12, y - 16, x + 6, y - 28); g.stroke();
    drawPalm(g, x + 6, y - 2, 0.001, 0); // fronds only (tiny trunk)
    g.strokeStyle = '#3f6b35'; g.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.moveTo(x + 6, y - 28); g.lineTo(x + 6 + Math.cos(a) * 13, y - 26 + Math.abs(Math.sin(a)) * 5); g.stroke(); }
  } else if (kind === 'bellRock') {
    g.fillStyle = '#f7f3ea'; g.strokeStyle = INK; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x - 16, y + 8); g.quadraticCurveTo(x - 14, y - 4, x - 9, y - 10); g.quadraticCurveTo(x - 8, y - 24, x, y - 24); g.quadraticCurveTo(x + 8, y - 24, x + 9, y - 10); g.quadraticCurveTo(x + 14, y - 4, x + 16, y + 8); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(x, y + 9, 3, 0, 7); g.fillStyle = INK; g.fill();
  } else if (kind === 'stones2') {
    g.fillStyle = 'rgba(90,70,40,.35)'; g.beginPath(); g.moveTo(x - 40, y - 4); g.quadraticCurveTo(x, y - 46, x + 40, y - 4); g.fill();
    g.fillStyle = '#9d927f'; g.strokeStyle = INK; g.lineWidth = 2;
    for (const dx of [-12, 12]) { g.beginPath(); g.moveTo(x + dx - 5, y + 6); g.lineTo(x + dx - 4, y - 16); g.lineTo(x + dx + 1, y - 20); g.lineTo(x + dx + 5, y - 14); g.lineTo(x + dx + 5, y + 6); g.closePath(); g.fill(); g.stroke(); }
    g.strokeStyle = '#c9a24e'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 34, 6, 0, 7); g.stroke();
  }
}
function drawCompass(g, x, y, s) {
  g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, s, 0, 7); g.stroke();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 - Math.PI / 2;
    g.beginPath(); g.moveTo(x + Math.cos(a) * s * 1.3, y + Math.sin(a) * s * 1.3);
    g.lineTo(x + Math.cos(a + 0.5) * s * 0.3, y + Math.sin(a + 0.5) * s * 0.3); g.lineTo(x + Math.cos(a - 0.5) * s * 0.3, y + Math.sin(a - 0.5) * s * 0.3); g.closePath();
    if (k === 0) { g.fillStyle = '#a3261c'; g.fill(); g.fillStyle = INK; } else g.fill();
  }
  g.font = `bold ${Math.round(s * 0.7)}px Georgia, serif`; g.textAlign = 'center'; g.fillText('N', x, y - s * 1.45);
}
function drawShip(g, x, y) {
  g.strokeStyle = INK; g.fillStyle = '#8a6038'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 22, y); g.lineTo(x + 22, y); g.lineTo(x + 14, y + 9); g.lineTo(x - 16, y + 9); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 30); g.stroke();
  g.fillStyle = '#f4ebd4'; g.beginPath(); g.moveTo(x + 1, y - 28); g.quadraticCurveTo(x + 18, y - 16, x + 1, y - 4); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 1, y - 26); g.quadraticCurveTo(x - 14, y - 16, x - 1, y - 6); g.closePath(); g.fill(); g.stroke();
}

const mapCache = new Map();
/** A cached full-map canvas for a quest. */
export function questMapCanvas(questId, w = 640, h = 520) {
  const key = questId + w + 'x' + h;
  if (mapCache.has(key)) return mapCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  drawQuestMap(c.getContext('2d'), w, h, questId);
  mapCache.set(key, c); return c;
}
/** Canvas element showing piece i (quadrant) of the quest map, with a torn-edge feel. */
export function pieceCanvas(questId, i) {
  const full = questMapCanvas(questId), pw = full.width / 2, ph = full.height / 2;
  const c = document.createElement('canvas'); c.width = pw; c.height = ph; c.className = 'lg-piece-art';
  const g = c.getContext('2d');
  g.drawImage(full, (i % 2) * pw, Math.floor(i / 2) * ph, pw, ph, 0, 0, pw, ph);
  // ragged shade at the torn edges
  const r = makeRng(hash(questId) + i * 31);
  g.fillStyle = 'rgba(120,80,30,.25)';
  for (let k = 0; k < 40; k++) { const t = r(); g.fillRect(t * pw, r() < 0.5 ? 0 : ph - 3, 6, 3); g.fillRect(r() < 0.5 ? 0 : pw - 3, t * ph, 3, 6); }
  return c;
}
