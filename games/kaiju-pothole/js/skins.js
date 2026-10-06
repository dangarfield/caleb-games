// Hole shapes. Three kinds:
//  strip:  a tile repeated round the rim (solid colours and simple patterns)
//  decal:  a whole canvas drawn round the opening (ears, fins, teeth, horns...) that can reach past the rim
//  moving: decal layers that spin / flash / pulse, and optional trails left on the ground
// Decal canvases are S×S with the hole's edge at radius R0 (the plane is 2·r·DECAL_K wide).
import * as THREE from 'three';

export const DECAL_K = 1.6;
const S = 512, C = S / 2, R0 = S / (2 * DECAL_K), D = Math.PI / 180, INK = '#1E1B2E';
const P = (r, a) => [C + Math.cos(a) * r, C + Math.sin(a) * r];

// ---- the list (order = order on the Hole shapes screen) ----
export const SKINS = [
  { id: 'black', name: 'Black', kind: 'strip', solid: '#000000', plain: true, free: true },
  { id: 'blue', name: 'Blue', kind: 'strip', solid: '#3CB4E6', tasks: [['prop', 20]] },
  { id: 'red', name: 'Red', kind: 'strip', solid: '#FF6B4A', tasks: [['vehicle', 15]] },
  { id: 'asphalt', name: 'Asphalt', kind: 'strip', tasks: [['prop', 30], ['tree', 10]] },
  { id: 'stripes', name: 'Hazard Stripes', kind: 'strip', tasks: [['hazard', 15]] },
  { id: 'daisy', name: 'Daisy', kind: 'strip', tasks: [['tree', 40], ['play', 5]] },
  { id: 'checker', name: 'Checker', kind: 'strip', tasks: [['vehicle', 30]] },
  { id: 'neon', name: 'Neon', kind: 'strip', tasks: [['shop', 10], ['house', 10]] },
  { id: 'lava', name: 'Lava', kind: 'decal', tasks: [['tower', 5], ['factory', 10]], mouth: '#ff6a10', layers: [{ draw: 'lavaIn', inner: true }, { draw: 'lava' }, { draw: 'lavaGlow', add: true, pulse: 1, amp: 0.1 }], orbit: { draw: 'lavaBubble', mode: 'bubble', n: 12, size: 0.36, alpha: 0.45 } },
  { id: 'shark', name: 'Shark', kind: 'decal', level: 0, mouth: '#8a1828', layers: [{ wall: 'wTeethShark', h: 0.42, rep: 1 }, { draw: 'shark' }] },
  { id: 'cat', name: 'Cat', kind: 'decal', level: 1, mouth: '#8a1a24', layers: [{ wall: 'wFangsCat', h: 0.5, rep: 1 }, { draw: 'tongueIn', inner: true, depth: 0.22 }, { draw: 'cat' }] },
  { id: 'panda', name: 'Panda', kind: 'decal', level: 2, mouth: '#8a1a30', layers: [{ wall: 'wTeethPanda', h: 0.4, rep: 1 }, { draw: 'tongueIn', inner: true, depth: 0.22 }, { draw: 'panda' }] },
  { id: 'tiger', name: 'Tiger', kind: 'decal', level: 3, mouth: '#8a1a24', layers: [{ wall: 'wFangsTiger', h: 0.55, rep: 1 }, { draw: 'tongueIn', inner: true, depth: 0.22 }, { draw: 'tiger' }] },
  { id: 'pizza', name: 'Pizza', kind: 'decal', level: 4, layers: [{ draw: 'pizza' }] },
  { id: 'doughnut', name: 'Doughnut', kind: 'decal', level: 5, layers: [{ draw: 'doughnut' }] },
  { id: 'kaiju1', name: 'Kaiju Spikes', kind: 'decal', level: 6, mouth: '#2a6a2a', layers: [{ wall: 'wTeethKaiju', h: 0.42, rep: 1 }, { draw: 'kaiju1' }] },
  { id: 'kaiju2', name: 'Kaiju Horns', kind: 'decal', level: 7, mouth: '#5a2a8a', layers: [{ wall: 'wTeethKaiju', h: 0.42, rep: 1 }, { draw: 'tongueInPurple', inner: true, depth: 0.22 }, { draw: 'kaiju2' }] },
  { id: 'kaiju3', name: 'Kaiju Fangs', kind: 'decal', level: 8, mouth: '#a02a08', layers: [{ wall: 'wFangsKaiju', h: 0.6, rep: 1 }, { draw: 'kaiju3' }] },
  { id: 'fidget', name: 'Fidget Spinner', kind: 'decal', moving: true, level: 9, k: 2.3, layers: [{ draw: 'fidget', spin: 2, speedSpin: 0.4 }] },
  { id: 'police', name: 'Police Car', kind: 'decal', moving: true, level: 10, k: 2.1, layers: [{ draw: 'police' }, { draw: 'flashBlue', add: true, flash: 0 }, { draw: 'flashRed', add: true, flash: 1 }] },
  { id: 'whirlpool', name: 'Whirlpool', kind: 'decal', moving: true, level: 11, mouth: '#1a7aa8', layers: [{ wall: 'wFalls', h: 1.4, rep: 3, scroll: 0.35 }, { draw: 'whirlIn', inner: true, spin: -0.5, depth: 0.5 }, { draw: 'whirl', spin: -0.25 }, { draw: 'whirlShine', add: true, spin: 0.15, pulse: 1, amp: 0.25 }], trail: { draw: 'bubble', every: 0.9, life: 1.2, size: 0.22 }, orbit: { draw: 'ripple', mode: 'ripple', n: 3, size: 1 } },
  { id: 'heart', name: 'Love Heart', kind: 'decal', moving: true, level: 12, layers: [{ draw: 'heartRim' }], trail: { draw: 'heart', every: 0.6, life: 1.6, size: 0.4 } },
  { id: 'sandworm', name: 'Sandworm', kind: 'decal', moving: true, level: 13, mouth: '#6a3418', layers: [{ wall: 'wTeethSand', h: 0.36, rep: 1, spin: 0.25 }, { wall: 'wTeethSand2', h: 0.34, d: 0.42, rep: 1, spin: -0.35 }, { wall: 'wTeethSand', h: 0.32, d: 0.82, rep: 1, spin: 0.3 }, { draw: 'sandRim' }] },
  { id: 'blackhole', name: 'Black Hole', kind: 'decal', moving: true, level: 14, k: 1.9, mouth: '#3a1270', layers: [{ draw: 'bhIn', inner: true, spin: 0.7, depth: 0.3 }, { draw: 'bhRim' }, { draw: 'bhDisk', add: true, spin: 1.1, pulse: 1, amp: 0.15 }, { draw: 'mistA', spin: 0.35, add: true, pulse: 2, amp: 0.2 }], orbit: { draw: 'spark', n: 40, size: 0.12, spin: 1.1, add: true, reach: 2.2 } },
];
export const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

// ---- strip textures (128×32 tile) ----
const stripCache = {};
export function skinTexture(id, solid) {
  const sk = SKINS.find(s => s.id === id); if (!solid && sk && sk.solid) solid = sk.solid;
  const key = id + (solid || ''); if (stripCache[key]) return stripCache[key];
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
  const dots = (bg, fg, r) => { x.fillStyle = bg; x.fillRect(0, 0, 128, 32); x.fillStyle = fg; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(16 + i * 32, i % 2 ? 10 : 22, r, 0, 7); x.fill(); } };
  if (solid && sk && sk.plain) { x.fillStyle = solid; x.fillRect(0, 0, 128, 32); }
  else if (solid) { x.fillStyle = solid; x.fillRect(0, 0, 128, 32); x.fillStyle = INK; x.fillRect(0, 0, 128, 6); x.fillRect(0, 29, 128, 3); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(0, 20, 128, 6); }
  else if (id === 'asphalt') { x.fillStyle = '#4a4560'; x.fillRect(0, 0, 128, 32); x.fillStyle = INK; x.fillRect(0, 0, 128, 8); x.strokeStyle = '#8f88a6'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(10, 8); x.lineTo(20, 18); x.lineTo(14, 30); x.moveTo(70, 8); x.lineTo(84, 18); x.lineTo(80, 28); x.moveTo(110, 8); x.lineTo(104, 22); x.stroke(); x.fillStyle = INK; x.fillRect(0, 29, 128, 3); }
  else if (id === 'stripes') { x.fillStyle = '#FFC93C'; x.fillRect(0, 0, 128, 32); x.fillStyle = INK; for (let i = -2; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, 32); x.lineTo(i * 32 + 16, 32); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0); x.fill(); } }
  else if (id === 'lava') { const g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, '#ff3d1f'); g.addColorStop(1, '#ffb21f'); x.fillStyle = g; x.fillRect(0, 0, 128, 32); x.fillStyle = '#7a1405'; for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(12 + i * 26, 8 + (i % 3) * 7, 7, 4, 0, 0, 7); x.fill(); } }
  else if (id === 'daisy') { dots('#7ED957', '#ffffff', 6); x.fillStyle = '#FFC93C'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(16 + i * 32, i % 2 ? 10 : 22, 2.5, 0, 7); x.fill(); } }
  else if (id === 'checker') { for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? INK : '#ffffff'; x.fillRect(i * 16, j * 16, 16, 16); } }
  else if (id === 'neon') { x.fillStyle = '#16102e'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#ff3df0'; x.fillRect(0, 6, 128, 5); x.fillStyle = '#3dfff2'; x.fillRect(0, 20, 128, 5); }
  else { x.fillStyle = '#4a4560'; x.fillRect(0, 0, 128, 32); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (stripCache[key] = t);
}

// ---- decal drawing ----
function ring(x, r1, r2, fill) { x.beginPath(); x.arc(C, C, r2, 0, Math.PI * 2); x.arc(C, C, r1, 0, Math.PI * 2, true); x.fillStyle = fill; x.fill(); }
function circle(x, r, lw = 5, col = INK) { x.beginPath(); x.arc(C, C, r, 0, Math.PI * 2); x.strokeStyle = col; x.lineWidth = lw; x.stroke(); }
function poly(x, pts, fill, lw = 4) { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fillStyle = fill; x.fill(); if (lw) { x.strokeStyle = INK; x.lineWidth = lw; x.lineJoin = 'round'; x.stroke(); } }
function teeth(x, n, rIn, len, off = 0, col = '#ffffff', w = 0.8) { for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2, hw = Math.PI / n * w; poly(x, [P(rIn, a - hw), P(rIn, a + hw), P(rIn - len, a)], col, 3); } }
function spikes(x, n, rB, len, col, off = 0, w = 0.55) { for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2, hw = Math.PI / n * w; poly(x, [P(rB, a - hw), P(rB + len, a), P(rB, a + hw)], col, 3); } }
function ear(x, a, col, inner, tip) { poly(x, [P(178, a - 17 * D), P(252, a), P(178, a + 17 * D)], col, 5); if (inner) poly(x, [P(190, a - 9 * D), P(232, a), P(190, a + 9 * D)], inner, 0); if (tip) poly(x, [P(228, a - 5 * D), P(252, a), P(228, a + 5 * D)], tip, 0); }
function heartPath(x, cx, cy, s) { x.beginPath(); x.moveTo(cx, cy + s * 0.35); x.bezierCurveTo(cx + s * 1.1, cy - s * 0.45, cx + s * 0.45, cy - s * 1.15, cx, cy - s * 0.45); x.bezierCurveTo(cx - s * 0.45, cy - s * 1.15, cx - s * 1.1, cy - s * 0.45, cx, cy + s * 0.35); x.closePath(); }
function spiral(x, arms, rA, rB, sweep, col, lw, alpha, blur = 0) {
  x.save(); x.globalAlpha = alpha; x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; if (blur) { x.shadowBlur = blur; x.shadowColor = col; }
  for (let k = 0; k < arms; k++) { x.beginPath(); for (let t = 0; t <= 1.0001; t += 0.05) { const [px, py] = P(rA + (rB - rA) * t, k / arms * Math.PI * 2 + t * sweep); t ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
  x.restore();
}
const rimEdge = (x, r2) => { circle(x, R0, 5); circle(x, r2, 5); };
// a face: a disc shifted up (forehead) with the mouth cut out
function face(x, col, rad = 212, up = 16) { x.beginPath(); x.arc(C, C - up, rad, 0, Math.PI * 2); x.arc(C, C, R0, 0, Math.PI * 2, true); x.fillStyle = col; x.fill(); x.strokeStyle = INK; x.lineWidth = 5; x.beginPath(); x.arc(C, C - up, rad, 0, Math.PI * 2); x.stroke(); circle(x, R0, 5); }
function eye(x, cx, cy, s, iris) { x.save(); x.translate(cx, cy);
  if (iris) { x.beginPath(); x.ellipse(0, 0, s, s * 1.15, 0, 0, 7); x.fillStyle = iris; x.fill(); x.strokeStyle = INK; x.lineWidth = 4; x.stroke(); x.beginPath(); x.ellipse(0, 0, s * 0.3, s * 0.9, 0, 0, 7); x.fillStyle = INK; x.fill(); }
  else { x.beginPath(); x.ellipse(0, 0, s, s * 1.1, 0, 0, 7); x.fillStyle = INK; x.fill(); }
  x.beginPath(); x.arc(-s * 0.32, -s * 0.38, s * 0.32, 0, 7); x.fillStyle = '#ffffff'; x.fill(); x.restore(); }
function nose(x, cx, cy, w, col) { poly(x, [[cx - w, cy - w * 0.5], [cx + w, cy - w * 0.5], [cx, cy + w * 0.6]], col, 3); }
function inMouth(x, fn) { x.save(); x.beginPath(); x.arc(C, C, R0 - 1, 0, Math.PI * 2); x.clip(); fn(); x.restore(); }
function fang(x, cx, w, len, up) { const y0 = up ? C + Math.sqrt(R0 * R0 - (cx - C) ** 2) : C - Math.sqrt(R0 * R0 - (cx - C) ** 2); const d = up ? -1 : 1; poly(x, [[cx - w, y0 - d * 8], [cx + w, y0 - d * 8], [cx, y0 + d * len]], '#ffffff', 3); }
function tongue(x, col = '#FF8FA3') { inMouth(x, () => { x.beginPath(); x.ellipse(C, C + R0 - 30, 66, 54, 0, 0, 7); x.fillStyle = col; x.fill(); x.strokeStyle = INK; x.lineWidth = 4; x.stroke(); x.beginPath(); x.moveTo(C, C + R0 - 66); x.lineTo(C, C + R0 - 20); x.strokeStyle = '#D9607A'; x.lineWidth = 4; x.stroke(); }); }
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const DRAW = {
  shark(x) {
    poly(x, [P(196, -110 * D), P(254, -70 * D), P(196, -74 * D)], '#6F879D', 5);
    face(x, '#8FA6BA', 206, 10);
    x.beginPath(); x.arc(C, C + 6, 200, 0.15 * Math.PI, 0.85 * Math.PI); x.arc(C, C, R0 + 2, 0.85 * Math.PI, 0.15 * Math.PI, true); x.fillStyle = '#D6E2EC'; x.fill();
    x.strokeStyle = INK; x.lineWidth = 4; for (const sg of [-1, 1]) for (const k of [0, 1, 2]) { const a = (sg < 0 ? 180 : 0) + sg * (12 + k * 9); x.beginPath(); x.moveTo(...P(176, a * D)); x.lineTo(...P(196, (a + sg * 4) * D)); x.stroke(); }
    eye(x, C - 118, C - 132, 12); eye(x, C + 118, C - 132, 12); circle(x, R0, 5);
  },
  sharkIn(x) { inMouth(x, () => { teeth(x, 20, R0 + 2, 40); teeth(x, 16, R0 - 34, 26, 0.18, '#F1F4F7'); }); },
  cat(x) {
    ear(x, -130 * D, '#FF9F45', '#FFB4C8'); ear(x, -50 * D, '#FF9F45', '#FFB4C8');
    face(x, '#FF9F45');
    x.fillStyle = '#E2761F'; for (const dx of [-26, 0, 26]) { x.beginPath(); x.moveTo(C + dx - 9, C - 226); x.lineTo(C + dx + 9, C - 226); x.lineTo(C + dx, C - 190); x.closePath(); x.fill(); }
    x.strokeStyle = '#E2761F'; x.lineWidth = 8; x.lineCap = 'round'; for (const sg of [-1, 1]) for (const k of [0, 1]) { const a = (sg < 0 ? 180 : 0) + sg * (-8 + k * 16); x.beginPath(); x.moveTo(...P(172, a * D)); x.lineTo(...P(194, a * D)); x.stroke(); }
    eye(x, C - 58, C - 190, 13); eye(x, C + 58, C - 190, 13); nose(x, C, C - 172, 11, '#FF8FA3');
    x.strokeStyle = INK; x.lineWidth = 3.5; for (const sg of [-1, 1]) for (const k of [-1, 0, 1]) { const [x1, y1] = P(204, ((sg < 0 ? 180 : 0) - k * 8 * sg) * D); x.beginPath(); x.moveTo(x1, y1); x.lineTo(x1 + sg * 44, y1 - k * 12); x.stroke(); }
  },
  tongueIn(x) { tongue(x); },
  tongueInPurple(x) { tongue(x, '#C76BFF'); },
  panda(x) {
    for (const a of [-134, -46]) { const [ex, ey] = P(214, a * D); x.beginPath(); x.arc(ex, ey - 8, 42, 0, 7); x.fillStyle = '#2b2738'; x.fill(); x.strokeStyle = INK; x.lineWidth = 5; x.stroke(); }
    face(x, '#F7F5EE');
    for (const sg of [-1, 1]) { x.save(); x.translate(C + sg * 64, C - 186); x.rotate(sg * 0.5); x.beginPath(); x.ellipse(0, 0, 30, 22, 0, 0, 7); x.fillStyle = '#2b2738'; x.fill(); x.restore(); eye(x, C + sg * 64, C - 188, 11, '#ffffff'); }
    x.beginPath(); x.ellipse(C, C - 170, 15, 10, 0, 0, 7); x.fillStyle = '#2b2738'; x.fill();
  },
  pandaIn(x) { inMouth(x, () => { for (const sg of [-1, 1]) { x.fillStyle = '#ffffff'; x.strokeStyle = INK; x.lineWidth = 3; x.beginPath(); x.roundRect(C + sg * 22 - 15, C - R0 - 4, 30, 34, 6); x.fill(); x.stroke(); } }); tongue(x); },
  tiger(x) {
    ear(x, -130 * D, '#FF8A1F', '#ffffff', INK); ear(x, -50 * D, '#FF8A1F', '#ffffff', INK);
    face(x, '#FF8A1F');
    // stripes: mirrored pairs, clipped to the face so they line up with its edge
    x.save(); x.beginPath(); x.arc(C, C - 16, 210, 0, Math.PI * 2); x.arc(C, C, R0 + 6, 0, Math.PI * 2, true); x.clip('evenodd');
    for (const a of [168, 192, 146, 214, 124]) for (const sg of [1, -1]) { const ang = (sg > 0 ? a : 180 - a) * D, w = 6 * D; poly(x, [P(250, ang - w), P(250, ang + w), P(186, ang + w * 0.15), P(186, ang - w * 0.15)], INK, 0); }
    x.restore(); x.beginPath(); x.arc(C, C - 16, 212, 0, Math.PI * 2); x.strokeStyle = INK; x.lineWidth = 5; x.stroke();
    x.fillStyle = INK; for (const dx of [-24, 0, 24]) { x.beginPath(); x.moveTo(C + dx - 7, C - 228); x.lineTo(C + dx + 7, C - 228); x.lineTo(C + dx, C - 200); x.closePath(); x.fill(); }
    x.beginPath(); x.ellipse(C, C - 168, 56, 18, 0, 0, 7); x.fillStyle = '#ffffff'; x.fill();
    eye(x, C - 62, C - 192, 14, '#B6E05A'); eye(x, C + 62, C - 192, 14, '#B6E05A'); nose(x, C, C - 172, 12, '#FF8FA3');
  },
  tigerIn(x) { inMouth(x, () => { fang(x, C - 64, 14, 46); fang(x, C + 64, 14, 46); fang(x, C - 40, 10, 26, true); fang(x, C + 40, 10, 26, true); }); tongue(x); },
  pizza(x) {
    ring(x, 192, 238, '#D9963F'); seed = 7; x.fillStyle = '#B87830'; for (let i = 0; i < 40; i++) { const [px, py] = P(200 + rnd() * 30, rnd() * Math.PI * 2); x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill(); }
    ring(x, 228, 238, '#C88430');
    ring(x, R0, 192, '#FFD45C');
    for (let i = 0; i < 9; i++) { const [px, py] = P(176, i / 9 * Math.PI * 2 + 0.2); x.beginPath(); x.arc(px, py, 11, 0, 7); x.fillStyle = '#D9412B'; x.fill(); x.strokeStyle = INK; x.lineWidth = 2; x.stroke(); }
    circle(x, R0, 5); circle(x, 192, 3); circle(x, 238, 5);
  },
  doughnut(x) {
    ring(x, 190, 212, '#E2B27A');
    x.beginPath(); for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2, [px, py] = P(198 + 7 * Math.sin(a * 9), a); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.arc(C, C, R0, 0, Math.PI * 2, true); x.fillStyle = '#FF7AC8'; x.fill();
    seed = 3; const cols = ['#ffffff', '#FFD84A', '#3CB4E6', '#7ED957', '#8C6CFF'];
    for (let i = 0; i < 44; i++) { const a = rnd() * Math.PI * 2, [px, py] = P(168 + rnd() * 26, a); x.save(); x.translate(px, py); x.rotate(rnd() * 3); x.fillStyle = cols[i % 5]; x.fillRect(-6, -2, 12, 4); x.restore(); }
    circle(x, R0, 5); circle(x, 212, 5);
  },
  kaiju1(x) {
    spikes(x, 16, 188, 44, '#C8F07A');
    ring(x, R0, 194, '#3E9B4F');
    x.strokeStyle = '#2E7A3C'; x.lineWidth = 3; for (const [r, n, o] of [[172, 22, 0], [186, 26, 0.12]]) for (let i = 0; i < n; i++) { const [px, py] = P(r, o + i / n * Math.PI * 2); x.beginPath(); x.arc(px, py, 7, 0, Math.PI * 2); x.stroke(); }
    rimEdge(x, 194);
    eye(x, C - 92, C - 172, 14, '#FFD84A'); eye(x, C + 92, C - 172, 14, '#FFD84A');
  },
  kaijuIn1(x) { inMouth(x, () => { teeth(x, 16, R0 + 2, 34, 0, '#F4F0DC'); teeth(x, 12, R0 - 30, 22, 0.25, '#E8E2C4'); }); },
  kaiju2(x) {
    for (const s of [-1, 1]) { const a = (-90 + s * 32) * D, [b1x, b1y] = P(186, a - 9 * D), [b2x, b2y] = P(186, a + 9 * D), [tx, ty] = P(262, a + s * 22 * D), [cx, cy] = P(236, a - s * 8 * D);
      x.beginPath(); x.moveTo(b1x, b1y); x.quadraticCurveTo(cx, cy, tx, ty); x.quadraticCurveTo(cx + s * 10, cy + 16, b2x, b2y); x.closePath(); x.fillStyle = '#F4E9C8'; x.fill(); x.strokeStyle = INK; x.lineWidth = 5; x.stroke(); }
    ring(x, R0, 194, '#7B4FC8'); x.fillStyle = '#5E3AA3'; for (let i = 0; i < 12; i++) { const [px, py] = P(178, i / 12 * Math.PI * 2 + 0.26); x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); }
    rimEdge(x, 194);
    eye(x, C - 64, C - 178, 13, '#FF5CA8'); eye(x, C + 64, C - 178, 13, '#FF5CA8');
  },
  kaijuIn2(x) { inMouth(x, () => { teeth(x, 14, R0 + 2, 36); }); tongue(x, '#C76BFF'); },
  kaiju3(x) {
    seed = 11; for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, l = 20 + rnd() * 18; poly(x, [P(190, a - 6 * D), P(190 + l, a + 2 * D), P(190, a + 6 * D)], '#FF9F1F', 0); poly(x, [P(190, a - 3 * D), P(190 + l * 0.6, a + 1 * D), P(190, a + 3 * D)], '#FFD84A', 0); }
    ring(x, R0, 196, '#3A1414');
    x.strokeStyle = '#FF6B1F'; x.lineWidth = 3; x.shadowBlur = 8; x.shadowColor = '#FF6B1F';
    for (let i = 0; i < 10; i++) { let a = i / 10 * Math.PI * 2 + rnd() * 0.3, r = 166; x.beginPath(); x.moveTo(...P(r, a)); for (let k = 0; k < 3; k++) { r += 8; a += (rnd() - 0.5) * 0.12; x.lineTo(...P(r, a)); } x.stroke(); }
    x.shadowBlur = 0; rimEdge(x, 196);
    x.save(); x.shadowBlur = 16; x.shadowColor = '#FFB21F'; eye(x, C - 70, C - 180, 14, '#FFD84A'); eye(x, C + 70, C - 180, 14, '#FFD84A'); x.restore();
  },
  kaijuIn3(x) { inMouth(x, () => { teeth(x, 16, R0 + 2, 16); for (const a of [-104, -76, 76, 104]) { const r = a * D, hw = 8 * D; poly(x, [P(R0 + 4, r - hw), P(R0 + 4, r + hw), P(R0 - 56, r)], '#ffffff', 3); } }); },
  lava(x) {
    seed = 21;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + rnd() * 0.2, rr = 200 + rnd() * 14; const [px, py] = P(rr, a); x.beginPath(); x.arc(px, py, 10 + rnd() * 8, 0, 7); x.fillStyle = '#FF7A1A'; x.fill(); }
    ring(x, R0, 202, '#2a1c1c');
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + rnd() * 0.1, r1 = 170 + rnd() * 8, r2 = 192 + rnd() * 8, w = 0.08 + rnd() * 0.06; x.beginPath(); x.moveTo(...P(r1, a)); x.lineTo(...P(r2, a + w * 0.3)); x.lineTo(...P(r2 - 4, a + w)); x.lineTo(...P(r1 + 2, a + w * 0.8)); x.closePath(); x.fillStyle = i % 2 ? '#3d2a28' : '#4a3430'; x.fill(); }
    x.save(); x.strokeStyle = '#FF8A1F'; x.lineWidth = 4; x.shadowBlur = 12; x.shadowColor = '#FF5A00'; x.lineCap = 'round';
    for (let i = 0; i < 20; i++) { let a = i / 20 * Math.PI * 2 + rnd() * 0.15, rr = R0 + 4; x.beginPath(); x.moveTo(...P(rr, a)); for (let k = 0; k < 4; k++) { rr += 9; a += (rnd() - 0.5) * 0.14; x.lineTo(...P(rr, a)); } x.stroke(); }
    x.restore();
    const g = x.createRadialGradient(C, C, R0 - 4, C, C, R0 + 22); g.addColorStop(0, 'rgba(255,230,120,1)'); g.addColorStop(0.45, 'rgba(255,120,20,0.9)'); g.addColorStop(1, 'rgba(255,90,0,0)');
    x.beginPath(); x.arc(C, C, R0 + 22, 0, 7); x.arc(C, C, R0, 0, 7, true); x.fillStyle = g; x.fill();
    circle(x, 202, 5);
  },
  lavaGlow(x) { const g = x.createRadialGradient(C, C, R0, C, C, 250); g.addColorStop(0, 'rgba(255,140,30,0.55)'); g.addColorStop(0.5, 'rgba(255,80,0,0.18)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(C, C, 250, 0, 7); x.arc(C, C, R0, 0, 7, true); x.fill(); },
  lavaIn(x) { inMouth(x, () => { const g = x.createRadialGradient(C, C, R0 * 0.3, C, C, R0); g.addColorStop(0, 'rgba(255,90,0,0)'); g.addColorStop(0.7, 'rgba(255,120,20,0.55)'); g.addColorStop(1, 'rgba(255,220,110,0.95)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }); },
  fidget(x) {
    // three big lobes with see-through centres (drawn on a wider canvas: k 2.3)
    for (let k = 0; k < 3; k++) { const [px, py] = P(238, -90 * D + k * 120 * D); x.beginPath(); x.arc(px, py, 74, 0, Math.PI * 2); x.arc(px, py, 34, 0, Math.PI * 2, true); x.fillStyle = '#3CB4E6'; x.fill(); x.strokeStyle = INK; x.lineWidth = 6; x.beginPath(); x.arc(px, py, 74, 0, 7); x.stroke(); x.beginPath(); x.arc(px, py, 34, 0, 7); x.stroke(); }
    ring(x, R0, 198, '#3CB4E6'); rimEdge(x, 198);
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 6; for (let k = 0; k < 3; k++) { const [px, py] = P(238, -90 * D + k * 120 * D); x.beginPath(); x.arc(px, py, 56, 3.6, 4.6); x.stroke(); }
  },
  police(x) {
    const n = 24; for (let i = 0; i < n; i++) for (const [r1, r2, o] of [[R0, 178, 0], [178, 196, 1]]) { const a1 = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2; x.beginPath(); x.arc(C, C, r2, a1, a2); x.arc(C, C, r1, a2, a1, true); x.closePath(); x.fillStyle = (i + o) % 2 ? '#2E5BD8' : '#FFD84A'; x.fill(); }
    rimEdge(x, 196);
    for (const [a, col] of [[180, '#5b7cff'], [0, '#ff5b5b']]) { const [px, py] = P(222, a * D); x.beginPath(); x.roundRect(px - 18, py - 26, 36, 52, 10); x.fillStyle = col; x.fill(); x.strokeStyle = INK; x.lineWidth = 5; x.stroke(); }
  },
  flashBlue(x) { glow(x, 180, '91,124,255'); },
  flashRed(x) { glow(x, 0, '255,80,80'); },
  whirlIn(x) { inMouth(x, () => { const g = x.createRadialGradient(C, C, 10, C, C, R0); g.addColorStop(0, 'rgba(8,40,70,0.85)'); g.addColorStop(1, 'rgba(60,180,230,0.25)'); x.fillStyle = g; x.fillRect(0, 0, S, S); spiral(x, 3, R0 - 10, 50, 1.6, '#d8f6ff', 4, 0.3); }); },
  whirlShine(x) { seed = 12; for (let i = 0; i < 26; i++) { const [px, py] = P(166 + rnd() * 28, rnd() * Math.PI * 2); x.beginPath(); x.ellipse(px, py, 7 + rnd() * 6, 2.5, rnd() * 3, 0, 7); x.fillStyle = 'rgba(255,255,255,0.55)'; x.fill(); } },
  bhIn(x) { inMouth(x, () => { const g = x.createRadialGradient(C, C, 0, C, C, R0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.65, 'rgba(30,8,60,0.92)'); g.addColorStop(1, 'rgba(140,108,255,0.55)'); x.fillStyle = g; x.fillRect(0, 0, S, S); spiral(x, 2, R0, 20, 2.4, '#b49cff', 6, 0.35, 10); }); },
  bhDisk(x) { x.save(); x.shadowBlur = 20; x.shadowColor = '#ffd0ff'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(C, C, 168 + i * 8, i * 1.3, i * 1.3 + 4.2); x.strokeStyle = i === 1 ? 'rgba(255,240,255,0.9)' : 'rgba(255,170,240,0.7)'; x.lineWidth = 5 - i; x.stroke(); } x.restore(); },
  whirl(x) { const g = x.createRadialGradient(C, C, R0, C, C, 198); g.addColorStop(0, '#1E6E9C'); g.addColorStop(1, '#4FC8E6'); x.beginPath(); x.arc(C, C, 198, 0, 7); x.arc(C, C, R0, 0, 7, true); x.fillStyle = g; x.fill(); x.beginPath(); for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2, [px, py] = P(198 + 4 * Math.sin(a * 14), a); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.strokeStyle = '#ffffff'; x.lineWidth = 5; x.stroke(); circle(x, R0, 4, 'rgba(255,255,255,0.9)'); },
  heartRim(x) { ring(x, R0, 194, '#FF7AC8'); for (let i = 0; i < 10; i++) { const [px, py] = P(177, i / 10 * Math.PI * 2); heartPath(x, px, py + 3, 10); x.fillStyle = '#ffffff'; x.fill(); } rimEdge(x, 194); },
  sandRim(x) { ring(x, R0, 198, '#E8C77E'); seed = 5; x.fillStyle = '#C9A55A'; for (let i = 0; i < 40; i++) { const [px, py] = P(166 + rnd() * 28, rnd() * Math.PI * 2); x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill(); } ring(x, R0 - 4, R0 + 4, '#B07A4F'); rimEdge(x, 198); },
  teethA(x) { inMouth(x, () => { teeth(x, 18, R0 + 2, 34, 0, '#FFF6DE'); teeth(x, 14, 116, 26, 0.2, '#FFF6DE'); }); },
  teethB(x) { inMouth(x, () => { teeth(x, 12, 142, 22, 0.1, '#F1E3C0'); teeth(x, 9, 86, 20, 0.35, '#F1E3C0'); }); },
  bhRim(x) { ring(x, R0, 190, '#1a1030'); x.save(); x.shadowBlur = 18; x.shadowColor = '#8C6CFF'; circle(x, 190, 5, '#8C6CFF'); x.restore(); circle(x, R0, 5); },
  mistA(x) { spiral(x, 3, 240, 150, 1.4, '#8C6CFF', 22, 0.22, 24); },
  mistB(x) { spiral(x, 3, 236, 140, -1.5, '#FF7AC8', 16, 0.28, 20); },
};
function glow(x, deg, rgb) { const [px, py] = P(222, deg * D), g = x.createRadialGradient(px, py, 4, px, py, 92); g.addColorStop(0, `rgba(${rgb},0.95)`); g.addColorStop(0.35, `rgba(${rgb},0.45)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.beginPath(); x.arc(px, py, 92, 0, 7); x.fill(); }

// trail sprites (128×128)
const SPRITE = {
  bubble(x) { x.beginPath(); x.arc(64, 64, 44, 0, 7); x.fillStyle = 'rgba(255,255,255,0.75)'; x.fill(); x.strokeStyle = '#9fe3f2'; x.lineWidth = 8; x.stroke(); x.beginPath(); x.arc(48, 48, 10, 0, 7); x.fillStyle = '#ffffff'; x.fill(); },
  heart(x) { heartPath(x, 64, 76, 54); x.fillStyle = '#FF5C93'; x.fill(); x.strokeStyle = INK; x.lineWidth = 7; x.stroke(); },
  lavaBubble(x) { const g = x.createRadialGradient(54, 50, 4, 64, 64, 50); g.addColorStop(0, '#FFF2B0'); g.addColorStop(0.5, '#FFB13A'); g.addColorStop(1, '#E2550A'); x.beginPath(); x.arc(64, 64, 46, 0, 7); x.fillStyle = g; x.fill(); x.strokeStyle = '#7a2a08'; x.lineWidth = 5; x.stroke(); x.beginPath(); x.arc(48, 46, 10, 0, 7); x.fillStyle = 'rgba(255,255,255,0.8)'; x.fill(); },
  ripple(x) { x.beginPath(); x.arc(64, 64, 58, 0, 7); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; x.stroke(); x.beginPath(); x.arc(64, 64, 52, 0, 7); x.strokeStyle = 'rgba(160,230,250,0.6)'; x.lineWidth = 2; x.stroke(); },
  spark(x) { const g = x.createRadialGradient(64, 64, 0, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(200,170,255,0.9)'); g.addColorStop(1, 'rgba(140,108,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); },
  droplet(x) { x.beginPath(); x.arc(64, 64, 34, 0, 7); x.fillStyle = 'rgba(255,255,255,0.9)'; x.fill(); x.strokeStyle = '#9fe3f2'; x.lineWidth = 8; x.stroke(); },
};

// Wall bands: a strip wrapped round the INSIDE of the shaft (u=0.5 is the far wall, the one you see).
// Drawn on WW×WH with the top edge at the ground.
const WW = 1024, WH = 256;
function wTeeth(x, n, len, col = '#ffffff', w = 0.8, from = 0, to = 1) { for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; if (u < from || u > to) continue; const cx = u * WW, hw = WW / n / 2 * w; poly(x, [[cx - hw, -4], [cx + hw, -4], [cx, len]], col, 4); } }
function wFang(x, u, w, len) { const cx = u * WW; poly(x, [[cx - w, -4], [cx + w, -4], [cx, len]], '#ffffff', 5); }
const WALL = {
  wTeethShark(x) { wTeeth(x, 26, 110); },
  wFangsCat(x) { wFang(x, 0.45, 26, 150); wFang(x, 0.55, 26, 150); },
  wTeethPanda(x) { x.fillStyle = '#ffffff'; x.strokeStyle = INK; x.lineWidth = 5; for (const u of [0.47, 0.53]) { x.beginPath(); x.roundRect(u * WW - 28, -10, 56, 96, 12); x.fill(); x.stroke(); } },
  wFangsTiger(x) { wFang(x, 0.43, 30, 190); wFang(x, 0.57, 30, 190); wTeeth(x, 40, 40, '#ffffff', 0.7, 0.38, 0.62); },
  wTeethKaiju(x) { wTeeth(x, 22, 120, '#F4F0DC'); },
  wFangsKaiju(x) { wTeeth(x, 30, 50, '#ffffff'); for (const u of [0.42, 0.58, 0.08, 0.92]) wFang(x, u, 30, 220); },
  wTeethSand(x) { wTeeth(x, 30, 150, '#FFF6DE', 0.85); },
  wTeethSand2(x) { wTeeth(x, 24, 130, '#F1E3C0', 0.85); },
  wFalls(x) { seed = 9; for (let i = 0; i < 70; i++) { const px = rnd() * WW, len = 40 + rnd() * 140, y = rnd() * WH; const g = x.createLinearGradient(0, y, 0, y + len); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(220,248,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px, y, 3 + rnd() * 5, len); x.fillRect(px, y - WH, 3 + rnd() * 5, len); } x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(0, 0, WW, 10); },
};
const decalCache = {};
export function decalCanvas(name, k = DECAL_K) {
  const key = name + '@' + k; if (decalCache[key]) return decalCache[key];
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (WALL[name]) { c.width = WW; c.height = WH; WALL[name](x); }
  else if (SPRITE[name]) { c.width = c.height = 128; SPRITE[name](x); }
  else { c.width = c.height = S; if (k !== DECAL_K) { const f = DECAL_K / k; x.translate(C, C); x.scale(f, f); x.translate(-C, -C); } DRAW[name](x); }
  return (decalCache[key] = c);
}
const texCache = {};
export function decalTexture(name, k = DECAL_K) {
  const key = name + '@' + k; if (texCache[key]) return texCache[key];
  const t = new THREE.CanvasTexture(decalCanvas(name, k)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (WALL[name]) { t.wrapS = THREE.RepeatWrapping; t.wrapT = name === 'wFalls' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.generateMipmaps = name === 'wFalls'; if (!t.generateMipmaps) t.minFilter = THREE.LinearFilter; }
  return (texCache[key] = t);
}

const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; };
// Menu preview: the hole as it looks in-game (one still frame for moving shapes).
export function skinPreview(cv, id) {
  const sk = skinById(id), x = cv.getContext('2d'), w = cv.width; x.clearRect(0, 0, w, w);
  if (sk.kind === 'strip') {
    x.fillStyle = x.createPattern(skinTexture(id).image, 'repeat'); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 1, 0, 7); x.fill();
    x.fillStyle = INK; x.beginPath(); x.arc(w / 2, w / 2, w * 0.33, 0, 7); x.fill(); return;
  }
  const k = sk.k || DECAL_K;
  x.fillStyle = sk.mouth ? shade(sk.mouth, 0.35) : '#0b0912'; x.beginPath(); x.arc(w / 2, w / 2, w / (2 * k), 0, 7); x.fill();
  for (const L of sk.layers) { if (!L.draw) continue; x.globalCompositeOperation = L.add ? 'lighter' : 'source-over'; x.drawImage(decalCanvas(L.draw, k), 0, 0, w, w); }
  x.globalCompositeOperation = 'source-over';
}
