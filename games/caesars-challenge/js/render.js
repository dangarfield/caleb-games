/* Caesar's Challenge — render.js  (LANE B)
 *
 * Every screen-level renderer + the particle pool. Canvas 2D only, everything
 * procedural (no image assets), no DOM reads, no window reads.
 *
 * PERF CONTRACT (the kids play on a low-powered tablet):
 *   - The whole static backdrop (base gradient, masonry, Colosseum arch,
 *     fluted columns, banners, torch sconces, vignette) is baked into ONE
 *     offscreen canvas, rebuilt ONLY in onResize()/setProvince().
 *   - drawBackground() = 1 drawImage + 2 additive fillRects (torch glow) +
 *     2 tiny flame paths + 2 batched mote fills. ~8 draw calls per frame.
 *   - Every gradient is created once (resize / province change) and reused.
 *     No gradient is ever created inside a per-frame or per-particle loop.
 *   - Level map: road geometry + stone sprites + a 1..100 number atlas are
 *     cached; off-screen milestones are culled.
 *   - fx: preallocated pool, HARD CAP 120, batched into ~5 fills, no
 *     shadowBlur and no per-particle save/restore.
 */

import {
  THEME, roundRect, fitText, carvedText, button, FONT_DISPLAY, FONT_UI,
  clamp, hash01, withAlpha, mix, shade, drawStar, starPath, leafPath,
  laurelWreath, eagleGlyph, romanize, plaque
} from './theme.js';

const TAU = Math.PI * 2;

/* Fallback province accents. Used ONLY when the caller does not hand us an
 * accent colour — render.js must never import levels.js. */
const PROV_ACCENT = ['#6c5ce7', '#00b894', '#0984e3', '#e17055', '#74b9ff',
  '#a29bfe', '#fdcb6e', '#ff7675', '#e84393', '#ffd32a'];

/* Trophy artifacts, one per province, in province order. */
const ARTIFACTS = [
  { id: 'laurel', name: 'Laurel Wreath' },
  { id: 'coin', name: 'Silver Denarius' },
  { id: 'amphora', name: 'Wine Amphora' },
  { id: 'gladius', name: 'Gladius' },
  { id: 'scroll', name: 'Secret Scroll' },
  { id: 'column', name: 'Marble Column' },
  { id: 'helmet', name: 'Legion Helmet' },
  { id: 'wheel', name: 'Chariot Wheel' },
  { id: 'eagle', name: 'Eagle Standard' },
  { id: 'crown', name: 'Caesar’s Crown' }
];

/* ------------------------------------------------------------------ */
/* module state                                                        */
/* ------------------------------------------------------------------ */
let _canvas = null, _ctx = null;
let _W = 0, _H = 0, _S = 0;

let bd = null, bdx = null;      // backdrop cache canvas
let bdDirty = true;

let provinceIdx = 0;
let isBossLvl = false;
let accent = PROV_ACCENT[0];

let G = {};                     // cached gradients
let L = {};                     // cached layout metrics
let motes = [];                 // ambient dust (analytic, stateless per frame)
let mapC = null;                // level-map geometry
let spriteCache = null;         // milestone sprites + 1..100 number atlas, keyed by radius

/* ------------------------------------------------------------------ */
/* init / resize / province                                            */
/* ------------------------------------------------------------------ */
export function initRender(canvas, ctx) {
  _canvas = canvas || null;
  _ctx = ctx || null;
  if (!bd) {
    bd = document.createElement('canvas');
    bdx = bd.getContext('2d');
  }
  if (canvas && canvas.width > 0 && canvas.height > 0) onResize(canvas.width, canvas.height);
}

export function onResize(W, H) {
  _W = Math.max(1, Math.round(W || 0));
  _H = Math.max(1, Math.round(H || 0));
  _S = Math.min(_W, _H);
  buildLayout();
  buildGradients();
  buildMotes();
  mapC = null;              // map geometry depends on size
  // Warm the milestone sprites + number atlas HERE rather than on the first map
  // frame: ~600 tiny fillText calls is a visible hitch on a slow tablet, and
  // load/orientation-change is a much better moment to pay it than screen entry.
  getMapSprites(stoneRadius());
  bdDirty = true;
}

function stoneRadius() { return Math.round(clamp(_S * 0.055, 22, 40)); }

/** x-inset that clears a flanking column (for content below the banner zone). */
function colInset() { return Math.round(L.colW + Math.max(8, _S * 0.014)); }
/** y below which the hanging banners no longer intrude. */
function bannerBottom() { return L.capH * 0.85 + L.bannerH; }
/** usable width for TITLES that sit inside the banner zone. */
function topSafeW() {
  return Math.max(_W * 0.5, _W - 2 * (L.colW * 1.02 + L.bannerW + Math.max(10, _S * 0.02)));
}

function getMapSprites(r) {
  if (spriteCache && spriteCache.r === r) return spriteCache;
  spriteCache = buildMapSprites(r);
  spriteCache.r = r;
  return spriteCache;
}

export function setProvince(provinceIndex, isBoss, accentColor) {
  const i = clamp(provinceIndex | 0, 0, 9);
  const nextAccent = accentColor || PROV_ACCENT[i];
  if (i === provinceIdx && !!isBoss === isBossLvl && nextAccent === accent) return;
  provinceIdx = i;
  isBossLvl = !!isBoss;
  accent = nextAccent;
  buildGradients();
  bdDirty = true;
}

function buildLayout() {
  const colW = Math.round(clamp(_S * 0.075, 22, 84));
  L = {
    colW: colW,
    capH: Math.round(colW * 1.05),
    baseH: Math.round(colW * 0.75),
    torchY: Math.round(_H * 0.30),
    torchR: Math.round(clamp(_S * 0.85, 190, 760)),
    bannerW: Math.round(colW * 0.86),
    bannerH: Math.round(clamp(_H * 0.20, 90, 260)),
    lx: colW * 0.5,
    rx: _W - colW * 0.5
  };
}

function buildGradients() {
  if (!_W || !_H) return;
  const g = {};
  const tc = mix('#ffb45e', accent, 0.42);        // torch tinted by province
  const tR = L.torchR;
  const mk = (cx, cy) => {
    const rg = bdx.createRadialGradient(cx, cy, 0, cx, cy, tR);
    rg.addColorStop(0.00, withAlpha(shade(tc, 0.55), 1));
    rg.addColorStop(0.07, withAlpha(shade(tc, 0.20), 0.85));
    rg.addColorStop(0.20, withAlpha(tc, 0.46));
    rg.addColorStop(0.45, withAlpha(shade(tc, -0.15), 0.20));
    rg.addColorStop(0.72, withAlpha(shade(tc, -0.35), 0.07));
    rg.addColorStop(1.00, withAlpha(shade(tc, -0.6), 0));
    return rg;
  };
  g.torchL = mk(L.lx, L.torchY);
  g.torchR = mk(L.rx, L.torchY);
  g.torchColor = tc;

  // boss crowd haze — one big warm radial, alpha modulated per frame
  const cg = bdx.createRadialGradient(_W * 0.5, _H * 0.18, _S * 0.05, _W * 0.5, _H * 0.35, _S * 1.05);
  cg.addColorStop(0, 'rgba(255,120,70,0.22)');
  cg.addColorStop(0.45, 'rgba(190,50,40,0.13)');
  cg.addColorStop(1, 'rgba(120,20,30,0)');
  g.crowd = cg;

  G = g;
}

function buildMotes() {
  const n = Math.round(clamp(_S / 22, 12, 26));
  motes = new Array(n);
  for (let i = 0; i < n; i++) {
    const side = i % 3;                              // 0 left, 1 right, 2 centre
    const bandW = Math.max(L.colW * 3.4, _W * 0.16);
    const x0 = side === 0 ? hash01(i, 1) * bandW
      : side === 1 ? _W - hash01(i, 2) * bandW
        : _W * 0.22 + hash01(i, 3) * _W * 0.56;
    motes[i] = {
      x0: x0,
      amp: 6 + hash01(i, 4) * (_S * 0.035),
      sw: 0.20 + hash01(i, 5) * 0.55,
      ph: hash01(i, 6) * TAU,
      vy: 5 + hash01(i, 7) * 16,
      off: hash01(i, 8) * (_H + 40),
      r: 1 + hash01(i, 9) * (_S > 700 ? 2.4 : 1.6),
      bright: side !== 2
    };
  }
}

/* ------------------------------------------------------------------ */
/* backdrop bake                                                       */
/* ------------------------------------------------------------------ */
function buildBackdrop() {
  if (!_W || !_H) return;
  if (!bd) { bd = document.createElement('canvas'); bdx = bd.getContext('2d'); }
  if (bd.width !== _W || bd.height !== _H) { bd.width = _W; bd.height = _H; }
  const g = bdx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, _W, _H);

  // 1. base 3-stop arcade gradient
  const bg = g.createLinearGradient(0, 0, 0, _H);
  bg.addColorStop(0, THEME.bgStops[0]);
  bg.addColorStop(0.52, THEME.bgStops[1]);
  bg.addColorStop(1, THEME.bgStops[2]);
  g.fillStyle = bg;
  g.fillRect(0, 0, _W, _H);

  // 2. masonry wall behind everything (very subtle)
  bakeMasonry(g);

  // 3. boss: Colosseum arcade silhouette + warm rim
  if (isBossLvl) bakeColosseum(g);

  // 4. floor plinth
  bakeFloor(g);

  // 5. fluted columns flanking the play area
  bakeColumn(g, 0);
  bakeColumn(g, 1);

  // 6. hanging province banners on the inner face of each column
  bakeBanner(g, 0);
  bakeBanner(g, 1);

  // 7. torch sconces (static bowl/bracket; the glow is per-frame)
  bakeSconce(g, L.lx, L.torchY);
  bakeSconce(g, L.rx, L.torchY);

  // 8. vignette
  const vg = g.createRadialGradient(_W * 0.5, _H * 0.45, _S * 0.20, _W * 0.5, _H * 0.5, _S * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = vg;
  g.fillRect(0, 0, _W, _H);

  bdDirty = false;
}

function bakeMasonry(g) {
  const bh = clamp(_S * 0.085, 26, 72);
  const bw = bh * 2.2;
  g.lineWidth = 1;
  for (let row = 0, y = 0; y < _H; row++, y += bh) {
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.beginPath();
    g.moveTo(0, Math.round(y) + 0.5);
    g.lineTo(_W, Math.round(y) + 0.5);
    g.stroke();
    const off = (row & 1) ? bw * 0.5 : 0;
    g.beginPath();
    for (let x = off; x < _W; x += bw) {
      g.moveTo(Math.round(x) + 0.5, y);
      g.lineTo(Math.round(x) + 0.5, y + bh);
    }
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.stroke();
  }
}

function bakeFloor(g) {
  const fy = _H - clamp(_H * 0.10, 40, 130);
  const fg = g.createLinearGradient(0, fy, 0, _H);
  fg.addColorStop(0, 'rgba(232,226,208,0.16)');
  fg.addColorStop(0.35, 'rgba(120,112,96,0.22)');
  fg.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = fg;
  g.fillRect(0, fy, _W, _H - fy);
  g.strokeStyle = 'rgba(232,226,208,0.22)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, fy + 1);
  g.lineTo(_W, fy + 1);
  g.stroke();
  // a few floor slab seams
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  const n = 6;
  for (let i = 1; i < n; i++) {
    const x = _W * (i / n);
    g.moveTo(x, fy + 2);
    g.lineTo(x + (x - _W / 2) * 0.10, _H);
  }
  g.stroke();
}

function bakeColosseum(g) {
  const cx = _W * 0.5;
  const top = _H * 0.10;
  const bot = _H * 0.78;
  const hw = Math.min(_W * 0.46, (bot - top) * 0.95);

  // warm haze behind the stone
  const hg = g.createRadialGradient(cx, bot, hw * 0.1, cx, bot, hw * 1.5);
  hg.addColorStop(0, 'rgba(255,140,80,0.16)');
  hg.addColorStop(1, 'rgba(255,140,80,0)');
  g.fillStyle = hg;
  g.fillRect(0, 0, _W, _H);

  // outer shell silhouette
  g.fillStyle = 'rgba(28,16,42,0.80)';
  g.beginPath();
  g.moveTo(cx - hw, bot);
  g.lineTo(cx - hw, top + hw * 0.55);
  g.quadraticCurveTo(cx - hw, top, cx, top);
  g.quadraticCurveTo(cx + hw, top, cx + hw, top + hw * 0.55);
  g.lineTo(cx + hw, bot);
  g.closePath();
  g.fill();

  // three tiers of arcades, punched as lighter arches
  const tiers = 3;
  const tierH = (bot - (top + hw * 0.18)) / tiers;
  for (let ti = 0; ti < tiers; ti++) {
    const ty = top + hw * 0.18 + ti * tierH;
    const inset = hw * (0.06 + ti * 0.02);
    const span = (hw - inset) * 2;
    const cols = ti === 0 ? 5 : (ti === 1 ? 7 : 9);
    const aw = span / cols;
    const ah = tierH * 0.78;
    for (let i = 0; i < cols; i++) {
      const ax = cx - hw + inset + aw * (i + 0.5);
      const ry = ty + tierH * 0.10;
      g.fillStyle = ti === 2 ? 'rgba(255,170,110,0.10)' : 'rgba(255,190,120,0.13)';
      g.beginPath();
      g.moveTo(ax - aw * 0.30, ry + ah);
      g.lineTo(ax - aw * 0.30, ry + aw * 0.30);
      g.quadraticCurveTo(ax - aw * 0.30, ry, ax, ry);
      g.quadraticCurveTo(ax + aw * 0.30, ry, ax + aw * 0.30, ry + aw * 0.30);
      g.lineTo(ax + aw * 0.30, ry + ah);
      g.closePath();
      g.fill();
    }
    // cornice
    g.fillStyle = 'rgba(232,226,208,0.10)';
    g.fillRect(cx - hw, ty + tierH - Math.max(2, tierH * 0.055), hw * 2, Math.max(2, tierH * 0.055));
  }
  // rim light along the top curve
  g.strokeStyle = 'rgba(255,180,120,0.32)';
  g.lineWidth = Math.max(2, _S * 0.005);
  g.beginPath();
  g.moveTo(cx - hw, top + hw * 0.55);
  g.quadraticCurveTo(cx - hw, top, cx, top);
  g.quadraticCurveTo(cx + hw, top, cx + hw, top + hw * 0.55);
  g.stroke();
}

function bakeColumn(g, side) {
  const w = L.colW;
  const x = side === 0 ? 0 : _W - w;
  const capH = L.capH, baseH = L.baseH;

  // shaft marble gradient (dark edges, lit centre-left)
  const sg = g.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, '#4a4636');
  sg.addColorStop(0.16, '#b9b19a');
  sg.addColorStop(0.40, '#efe9d8');
  sg.addColorStop(0.72, '#c2baa2');
  sg.addColorStop(1, '#57523f');
  g.fillStyle = sg;
  g.fillRect(x, 0, w, _H);

  // flutes — vertical concave grooves
  const flutes = Math.max(3, Math.round(w / 9));
  const fw = w / flutes;
  g.lineWidth = Math.max(1, fw * 0.16);
  for (let i = 1; i < flutes; i++) {
    const fx = x + i * fw;
    g.strokeStyle = 'rgba(0,0,0,0.30)';
    g.beginPath();
    g.moveTo(fx, capH);
    g.lineTo(fx, _H - baseH);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.moveTo(fx + Math.max(1, fw * 0.22), capH);
    g.lineTo(fx + Math.max(1, fw * 0.22), _H - baseH);
    g.stroke();
  }

  // deterministic grain
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(90,80,60,0.22)';
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const gy = capH + hash01(side * 31 + i, 11) * (_H - capH - baseH);
    const gx = x + hash01(side * 31 + i, 12) * w;
    const gl = (0.2 + hash01(side * 31 + i, 13) * 0.7) * w * 0.6;
    g.moveTo(gx, gy);
    g.quadraticCurveTo(gx + gl * 0.5, gy + gl * 0.35, gx + gl * 0.2, gy + gl * 0.8);
  }
  g.stroke();

  // capital: echinus + abacus
  const ov = w * 0.22;
  const cg = g.createLinearGradient(x - ov, 0, x + w + ov, 0);
  cg.addColorStop(0, '#6b6552');
  cg.addColorStop(0.35, '#f3eddc');
  cg.addColorStop(0.75, '#c6bda4');
  cg.addColorStop(1, '#5c5644');
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(x - ov, 0);
  g.lineTo(x + w + ov, 0);
  g.lineTo(x + w + ov, capH * 0.52);
  g.quadraticCurveTo(x + w * 0.5, capH * 0.86, x - ov, capH * 0.52);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(x - ov, capH * 0.50, w + ov * 2, Math.max(2, capH * 0.06));
  // volute curls — open scrolls, not closed rings (rings read as bolt holes)
  g.strokeStyle = 'rgba(96,88,66,0.42)';
  g.lineWidth = Math.max(1.2, w * 0.04);
  g.beginPath();
  g.arc(x + w * 0.22, capH * 0.30, w * 0.12, Math.PI * 0.15, Math.PI * 1.7);
  g.stroke();
  g.beginPath();
  g.arc(x + w * 0.78, capH * 0.30, w * 0.12, Math.PI * 1.3, Math.PI * 0.85);
  g.stroke();
  // abacus fillet
  g.strokeStyle = 'rgba(255,255,255,0.20)';
  g.lineWidth = Math.max(1, w * 0.03);
  g.beginPath();
  g.moveTo(x - ov, capH * 0.13);
  g.lineTo(x + w + ov, capH * 0.13);
  g.stroke();

  // base blocks
  const bgr = g.createLinearGradient(x - ov, 0, x + w + ov, 0);
  bgr.addColorStop(0, '#5c5644');
  bgr.addColorStop(0.38, '#e6e0cd');
  bgr.addColorStop(1, '#4f4a39');
  g.fillStyle = bgr;
  g.fillRect(x - ov * 0.6, _H - baseH, w + ov * 1.2, baseH * 0.62);
  g.fillRect(x - ov, _H - baseH * 0.42, w + ov * 2, baseH * 0.42);
  g.fillStyle = 'rgba(0,0,0,0.30)';
  g.fillRect(x - ov * 0.6, _H - baseH, w + ov * 1.2, Math.max(2, baseH * 0.05));

  // inner edge shadow onto the play area
  const eg = side === 0
    ? g.createLinearGradient(x + w, 0, x + w + w * 0.9, 0)
    : g.createLinearGradient(x, 0, x - w * 0.9, 0);
  eg.addColorStop(0, 'rgba(0,0,0,0.42)');
  eg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = eg;
  if (side === 0) g.fillRect(x + w, 0, w * 0.9, _H);
  else g.fillRect(x - w * 0.9, 0, w * 0.9, _H);
}

function bakeBanner(g, side) {
  const bw = L.bannerW, bh = L.bannerH;
  const x = side === 0 ? L.colW * 1.02 : _W - L.colW * 1.02 - bw;
  const y = L.capH * 0.85;

  // rod
  g.fillStyle = '#8a7b52';
  g.fillRect(x - bw * 0.12, y - bh * 0.045, bw * 1.24, Math.max(2, bh * 0.035));

  // cloth
  const cg = g.createLinearGradient(x, y, x + bw, y + bh);
  cg.addColorStop(0, shade(accent, 0.25));
  cg.addColorStop(0.5, accent);
  cg.addColorStop(1, shade(accent, -0.45));
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + bw, y);
  g.lineTo(x + bw, y + bh * 0.86);
  g.lineTo(x + bw * 0.5, y + bh);
  g.lineTo(x, y + bh * 0.86);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,211,42,0.65)';
  g.lineWidth = Math.max(1.5, bw * 0.045);
  g.stroke();

  // emblem: province numeral, plus an eagle only when the cloth is wide enough
  // for it to read as a bird rather than a smudge.
  if (bw >= 64) {
    eagleGlyph(g, x + bw * 0.5, y + bh * 0.26, bw * 0.62, 'rgba(255,211,42,0.60)');
    carvedText(g, romanize(provinceIdx + 1), x + bw * 0.5, y + bh * 0.62,
      bh * 0.18, THEME.gold, { maxW: bw * 0.72 });
  } else {
    carvedText(g, romanize(provinceIdx + 1), x + bw * 0.5, y + bh * 0.42,
      bh * 0.20, THEME.gold, { maxW: bw * 0.78 });
  }

  // fringe
  g.fillStyle = 'rgba(255,211,42,0.55)';
  for (let i = 0; i < 5; i++) {
    const fx = x + bw * (0.14 + i * 0.18);
    g.beginPath();
    g.arc(fx, y + bh * 0.90 + Math.abs(i - 2) * bh * 0.02, bw * 0.035, 0, TAU);
    g.fill();
  }
}

function bakeSconce(g, cx, cy) {
  const s = clamp(_S * 0.035, 12, 34);
  g.fillStyle = '#3c3226';
  g.beginPath();
  g.moveTo(cx - s * 0.9, cy);
  g.quadraticCurveTo(cx, cy + s * 1.1, cx + s * 0.9, cy);
  g.lineTo(cx + s * 0.7, cy - s * 0.18);
  g.lineTo(cx - s * 0.7, cy - s * 0.18);
  g.closePath();
  g.fill();
  g.fillStyle = '#5c4c33';
  g.fillRect(cx - s * 1.0, cy - s * 0.28, s * 2.0, s * 0.20);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(cx - s * 0.16, cy + s * 0.5, s * 0.32, s * 1.5);
}

/* ------------------------------------------------------------------ */
/* drawBackground                                                      */
/* ------------------------------------------------------------------ */
function flick(t, ph) {
  return 0.60 + 0.17 * Math.sin(t * 7.3 + ph) + 0.11 * Math.sin(t * 3.1 + ph * 1.7)
    + 0.07 * Math.sin(t * 13.9 + ph * 0.6);
}

export function drawBackground(ctx, W, H, t) {
  if (W !== _W || H !== _H) onResize(W, H);
  if (bdDirty || !bd || bd.width !== _W) buildBackdrop();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bd, 0, 0);

  const tR = L.torchR;
  const fl = flick(t, 0), fr = flick(t, 2.4);

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(fl * 0.95, 0, 1);
  ctx.fillStyle = G.torchL;
  ctx.fillRect(L.lx - tR, L.torchY - tR, tR * 2, tR * 2);
  ctx.globalAlpha = clamp(fr * 0.95, 0, 1);
  ctx.fillStyle = G.torchR;
  ctx.fillRect(L.rx - tR, L.torchY - tR, tR * 2, tR * 2);
  if (isBossLvl) {
    ctx.globalAlpha = 0.55 + 0.12 * Math.sin(t * 1.15) + 0.06 * Math.sin(t * 2.7);
    ctx.fillStyle = G.crowd;
    ctx.fillRect(0, 0, _W, _H);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // flame cores — 2 tiny paths
  flame(ctx, L.lx, L.torchY, fl, t, 0);
  flame(ctx, L.rx, L.torchY, fr, t, 2.4);

  // dust motes — analytic (no per-frame state), batched into 2 fills
  const span = _H + 40;
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? withAlpha(G.torchColor, 0.80) : 'rgba(255,236,200,0.26)';
    ctx.beginPath();
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      if ((pass === 0) !== m.bright) continue;
      const y = _H + 20 - (((t * m.vy) + m.off) % span);
      const x = m.x0 + Math.sin(t * m.sw + m.ph) * m.amp;
      ctx.rect(x, y, m.r, m.r);
    }
    ctx.fill();
  }
}

/** Leaf sub-path that APPENDS to the current path (theme's leafPath calls
 *  beginPath, which silently discarded every leaf but the last in a batch). */
function leafInto(ctx, x, y, L, wid, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = x + c * L, ty = y + s * L;
  const nx = -s * wid, ny = c * wid;
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * L * 0.5 + nx, y + s * L * 0.5 + ny, tx, ty);
  ctx.quadraticCurveTo(x + c * L * 0.5 - nx, y + s * L * 0.5 - ny, x, y);
  ctx.closePath();
}

/** A laurel sprig: curved stem with paired leaves, pointing along `ang`. */
function laurelSprig(ctx, x, y, len, ang, col) {
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1.2, len * 0.045);
  ctx.beginPath();
  ctx.moveTo(x - c * len * 0.5, y - s * len * 0.5);
  ctx.quadraticCurveTo(x, y - len * 0.16, x + c * len * 0.5, y - s * len * 0.5);
  ctx.stroke();
  ctx.fillStyle = col;
  for (let i = 0; i < 4; i++) {
    const f = -0.5 + i * 0.33;
    const px = x + c * len * f, py = y - Math.abs(s) * len * 0.02 - len * 0.10 * (1 - Math.abs(f) * 1.4);
    const L = len * (0.26 - Math.abs(f) * 0.10);
    leafPath(ctx, px, py, L, L * 0.44, ang + 0.85);
    ctx.fill();
    leafPath(ctx, px, py, L, L * 0.44, ang - 0.85 - Math.PI);
    ctx.fill();
  }
}

function flame(ctx, cx, cy, f, t, ph) {
  const s = clamp(_S * 0.035, 12, 34);
  const h = s * (1.35 + 0.35 * Math.sin(t * 9.1 + ph)) * clamp(f, 0.6, 1.3);
  const w = s * (0.52 + 0.10 * Math.sin(t * 11.3 + ph * 2));
  ctx.fillStyle = withAlpha(G.torchColor, 0.85);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy + s * 0.15);
  ctx.quadraticCurveTo(cx - w * 0.7, cy - h * 0.6, cx, cy - h);
  ctx.quadraticCurveTo(cx + w * 0.7, cy - h * 0.6, cx + w, cy + s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,246,210,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, cy + s * 0.05);
  ctx.quadraticCurveTo(cx, cy - h * 0.55, cx + w * 0.42, cy + s * 0.05);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* HUD pill                                                            */
/* ------------------------------------------------------------------ */
export function drawHudPill(ctx, W, hud) {
  const h = hud || {};
  const HH = _H || 600;
  const pillH = Math.round(clamp(Math.min(W, HH) * 0.145, 64, 78));
  const pillW = Math.round(Math.min(W - 14, Math.max(300, Math.min(W, HH) * 1.25)));
  const px = Math.round((W - pillW) / 2);
  // the HTML back button lives at (12,12)-(~104,44): drop the pill below it if
  // the pill would reach into that corner.
  const py = px < 112 ? 50 : 12;
  // Hint zone occupies the pill's full height so the tap target is >= 64px on
  // its short axis (pillH is clamped to >= 64 above).
  const hintW = Math.max(64, Math.min(76, pillH));
  const hintRect = { x: px + pillW - hintW, y: py, w: hintW, h: pillH };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // body
  roundRect(ctx, px, py, pillW, pillH, 15);
  ctx.fillStyle = 'rgba(0,0,0,0.46)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  // marble top edge
  ctx.beginPath();
  ctx.moveTo(px + 14, py + 1.5);
  ctx.lineTo(px + pillW - 14, py + 1.5);
  ctx.strokeStyle = withAlpha(THEME.marble, 0.22);
  ctx.stroke();

  const cx0 = px + 12;
  const cx1 = hintRect.x - 8;
  const CW = Math.max(60, cx1 - cx0);
  const rowA = py + pillH * 0.31;
  const rowB = py + pillH * 0.70;

  /* --- row A: level (left, carved gold) + streak + score (right) --- */
  const lvlLabel = h.levelLabel != null ? String(h.levelLabel) : 'LEVEL I';
  carvedText(ctx, lvlLabel, cx0, rowA, pillH * 0.30, THEME.gold,
    { align: 'left', maxW: CW * 0.46 });

  const score = String(h.score != null ? h.score : 0);
  const scSize = fitText(ctx, score, CW * 0.34, pillH * 0.33, 'bold', FONT_UI);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(score, cx1 + 1, rowA + 1);
  ctx.fillStyle = THEME.gold;
  ctx.fillText(score, cx1, rowA);
  const scoreW = ctx.measureText(score).width;

  const streak = h.streak | 0;
  if (streak > 1) {
    const bw = Math.max(34, pillH * 0.52), bh = pillH * 0.30;
    const bx = cx1 - scoreW - 8 - bw, by = rowA - bh / 2;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = withAlpha(THEME.glow, 0.85);
    ctx.fill();
    fitText(ctx, '×' + streak, bw * 0.8, bh * 0.78, 'bold', FONT_UI);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#12123a';
    ctx.fillText('×' + streak, bx + bw / 2, by + bh / 2);
  }
  void scSize;

  /* --- row B: province, progress + sundial bars, mistake pips --- */
  const prov = h.provinceName ? String(h.provinceName) : '';
  if (prov) {
    fitText(ctx, prov.toUpperCase(), CW * 0.30, pillH * 0.20, 'bold', FONT_UI);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.sub;
    ctx.fillText(prov.toUpperCase(), cx0, rowB);
  }

  const nPips = clamp(h.maxMistakes != null ? h.maxMistakes | 0 : 3, 0, 5);
  const pipR = pillH * 0.085;
  const pipsW = nPips ? nPips * (pipR * 2 + 4) : 0;
  const barX = cx0 + CW * 0.33;
  const barW = Math.max(30, cx1 - pipsW - 6 - barX);
  const barH = Math.max(3, pillH * 0.055);

  // puzzle progress
  const total = Math.max(1, h.total | 0 || 1);
  const idx = clamp((h.index | 0), 0, total);
  roundRect(ctx, barX, rowB - barH - 2, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  if (idx > 0) {
    roundRect(ctx, barX, rowB - barH - 2, Math.max(barH, barW * (idx / total)), barH, barH / 2);
    ctx.fillStyle = THEME.glow;
    ctx.fill();
  }
  // sundial (time bonus window) directly beneath
  const sp = clamp(h.sundialPct != null ? h.sundialPct : 0, 0, 1);
  roundRect(ctx, barX, rowB + 3, barW, barH * 0.8, barH / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  if (sp > 0) {
    roundRect(ctx, barX, rowB + 3, Math.max(barH, barW * sp), barH * 0.8, barH / 2);
    ctx.fillStyle = sp < 0.25 ? THEME.danger : THEME.gold;
    ctx.fill();
  }
  // puzzle counter text over the bar
  const cnt = (idx) + '/' + total;
  fitText(ctx, cnt, barW * 0.5, pillH * 0.18, 'bold', FONT_UI);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(cnt, barX, rowB - barH - 5);

  // mistake pips = little shields, spent ones dark
  const spent = clamp(h.mistakes | 0, 0, nPips);
  for (let i = 0; i < nPips; i++) {
    const sx = cx1 - pipsW + i * (pipR * 2 + 4) + pipR + 2;
    shieldPip(ctx, sx, rowB, pipR, i < nPips - spent);
  }

  /* --- hint button (its own >=60px tap zone at the pill's right end) --- */
  const hintsLeft = h.hintsLeft != null ? h.hintsLeft | 0 : 0;
  const hcx = hintRect.x + hintRect.w / 2, hcy = hintRect.y + hintRect.h / 2;
  const hr = Math.min(hintRect.w, hintRect.h) * 0.44;
  ctx.beginPath();
  ctx.arc(hcx, hcy, hr, 0, TAU);
  ctx.fillStyle = hintsLeft > 0 ? withAlpha(THEME.accent, 0.85) : 'rgba(255,255,255,0.10)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, hr * 0.12);
  ctx.strokeStyle = hintsLeft > 0 ? withAlpha(THEME.gold, 0.9) : 'rgba(255,255,255,0.22)';
  ctx.stroke();
  scrollGlyph(ctx, hcx, hcy - hr * 0.06, hr * 1.15, hintsLeft > 0 ? THEME.marble : 'rgba(255,255,255,0.35)');
  fitText(ctx, String(hintsLeft), hr, hr * 0.9, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hintsLeft > 0 ? THEME.gold : 'rgba(255,255,255,0.4)';
  ctx.fillText(String(hintsLeft), hcx + hr * 0.62, hcy + hr * 0.66);

  ctx.restore();
  return { hintRect: hintRect, pillRect: { x: px, y: py, w: pillW, h: pillH } };
}

function shieldPip(ctx, cx, cy, r, alive) {
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy - r);
  ctx.lineTo(cx + r, cy + r * 0.25);
  ctx.quadraticCurveTo(cx + r, cy + r * 1.1, cx, cy + r * 1.35);
  ctx.quadraticCurveTo(cx - r, cy + r * 1.1, cx - r, cy + r * 0.25);
  ctx.closePath();
  ctx.fillStyle = alive ? withAlpha(THEME.gold, 0.92) : 'rgba(120,40,35,0.6)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = alive ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.18)';
  ctx.stroke();
}

function scrollGlyph(ctx, cx, cy, s, col) {
  ctx.fillStyle = col;
  roundRect(ctx, cx - s * 0.34, cy - s * 0.30, s * 0.68, s * 0.60, s * 0.10);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(cx - s * 0.22, cy - s * 0.18 + i * s * 0.17, s * 0.44, Math.max(1, s * 0.055));
  }
}

/* ------------------------------------------------------------------ */
/* mosaic (per-level reveal)                                           */
/* ------------------------------------------------------------------ */
const MOSAIC_PAL = ['#c0392b', '#d98b2b', '#e0c341', '#2e8b6f', '#2f6fb0', '#7a52c0', '#c96a9a'];

export function drawMosaic(ctx, rect, revealed, total, seed) {
  const n = Math.max(1, total | 0);
  const rw = rect.w, rh = rect.h;
  let cols = Math.max(2, Math.round(Math.sqrt(n * (rw / Math.max(1, rh)))));
  let rows = Math.ceil(n / cols);
  while (rows * cols - n >= cols && rows > 1) rows--;
  const ts = Math.floor(Math.min(rw / cols, rh / rows));
  const gw = ts * cols, gh = ts * rows;
  const ox = rect.x + (rw - gw) / 2, oy = rect.y + (rh - gh) / 2;
  const sd = (seed | 0) || 1;

  // frame
  roundRect(ctx, ox - ts * 0.22, oy - ts * 0.22, gw + ts * 0.44, gh + ts * 0.44, ts * 0.2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, ts * 0.07);
  ctx.strokeStyle = withAlpha(THEME.gold, 0.45);
  ctx.stroke();

  const rev = clamp(revealed | 0, 0, n);
  const lastRow = rows - 1;
  const lastCount = n - lastRow * cols;               // centre a ragged last row
  const lastShift = ((cols - lastCount) * ts) / 2;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = (i / cols) | 0;
    const x = ox + c * ts + (r === lastRow ? lastShift : 0), y = oy + r * ts;
    if (i < rev) {
      const base = MOSAIC_PAL[Math.floor(hash01(sd, i) * MOSAIC_PAL.length) % MOSAIC_PAL.length];
      // 2x2 tesserae with slight variance
      const h2 = ts / 2;
      for (let k = 0; k < 4; k++) {
        const v = (hash01(sd * 7 + i, k) - 0.5) * 0.34;
        ctx.fillStyle = shade(base, v);
        ctx.fillRect(x + (k & 1) * h2 + 1, y + ((k >> 1) & 1) * h2 + 1, h2 - 2, h2 - 2);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, ts - 3, ts - 3);
    }
  }
}

/* ------------------------------------------------------------------ */
/* level map — the "Via Appia"                                         */
/* ------------------------------------------------------------------ */
function mapGeom(view) {
  const provinces = (view && view.provinces && view.provinces.length) ? view.provinces : null;
  const nProv = provinces ? provinces.length : 10;
  if (mapC && mapC.W === _W && mapC.H === _H && mapC.nProv === nProv) return mapC;

  const S = _S;
  const r = stoneRadius();
  const inset = colInset();
  // milestones must never sit under the flanking columns
  const margin = Math.round(Math.max(clamp(_W * 0.09, 26, 110), inset + r * 0.35));
  const usable = Math.max(r * 5, _W - margin * 2);
  const perRow = clamp(Math.floor(usable / (r * 2.95)), 2, 5);
  const cellW = usable / perRow;
  const rowH = r * 2.55;
  const bandHead = r * 2.15;
  const bandGap = r * 1.15;

  const btnH = Math.round(clamp(S * 0.135, 64, 78));
  const headerH = 12 + btnH + 10;

  // title block at the top of the SCROLLING content so the toolbar stays slim
  const titleH = Math.round(clamp(S * 0.20, 96, 170));

  const bands = [];
  const stones = [];
  let cy = titleH;
  for (let p = 0; p < nProv; p++) {
    const pr = provinces ? provinces[p] : null;
    const lv = (pr && pr.levels) ? pr.levels : [p * 10 + 1, p * 10 + 10];
    const from = lv[0] | 0, to = lv[1] | 0;
    const count = Math.max(1, to - from + 1);
    const rows = Math.ceil(count / perRow);
    const band = {
      p: p,
      numeral: (pr && pr.numeral) ? pr.numeral : romanize(p + 1),
      name: (pr && pr.name) ? pr.name : 'Provincia ' + romanize(p + 1),
      icon: (pr && pr.icon) ? pr.icon : '',
      accent: (pr && pr.accent) ? pr.accent : PROV_ACCENT[p % PROV_ACCENT.length],
      from: from, to: to,
      cy: cy, headH: bandHead, h: bandHead + rows * rowH
    };
    for (let k = 0; k < count; k++) {
      const row = Math.floor(k / perRow);
      const inRow = k % perRow;
      // serpentine, and flipped on odd provinces so the band-to-band connector
      // alternates sides instead of forming one straight stripe down the edge
      let col = (row % 2 === 0) ? inRow : (perRow - 1 - inRow);
      if (p & 1) col = perRow - 1 - col;
      const wob = Math.sin((from + k) * 1.37) * (cellW * 0.12);
      stones.push({
        level: from + k,
        p: p,
        x: margin + (col + 0.5) * cellW + wob,
        cy: cy + bandHead + (row + 0.5) * rowH
      });
    }
    cy += band.h + bandGap;
    bands.push(band);
  }
  const contentH = cy + r * 2;
  const viewH = Math.max(60, _H - headerH);

  // road geometry, cached in CONTENT space
  const pts = stones.map(s => ({ x: s.x, y: s.cy }));
  let road = null;
  if (typeof Path2D !== 'undefined' && pts.length > 1) {
    road = new Path2D();
    // start exactly at level 1's centre — any lead-in stub pokes out from under
    // the stone and reads as a stray dark hook near the band header
    road.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      road.quadraticCurveTo(a.x + (b.x - a.x) * 0.1, my, mx, my);
      road.quadraticCurveTo(b.x - (b.x - a.x) * 0.1, my, b.x, b.y);
    }
    const last = pts[pts.length - 1];
    road.lineTo(last.x, last.y + r * 2.2);
  }

  mapC = {
    W: _W, H: _H, nProv: nProv, r: r, margin: margin, inset: inset, perRow: perRow, cellW: cellW,
    rowH: rowH, headerH: headerH, btnH: btnH, titleH: titleH,
    bands: bands, stones: stones, pts: pts, road: road,
    contentH: contentH, maxScroll: Math.max(0, contentH - viewH + r),
    sprites: getMapSprites(r)
  };
  return mapC;
}

function buildMapSprites(r) {
  const sp = {};
  sp.open = stoneSprite(r, 'open');
  sp.done = stoneSprite(r, 'done');
  sp.locked = stoneSprite(r, 'locked');
  sp.starOn = starSprite(Math.max(4, r * 0.30), true);
  sp.starOff = starSprite(Math.max(4, r * 0.30), false);
  sp.lock = lockSprite(Math.max(8, r * 0.62));
  // Dark glyph on the light marble face — marble-on-marble was unreadable, and a
  // dark cut with a light lip below-right is what a real chiselled stone looks like.
  sp.numOpen = numberAtlas(r, '#463a22', false);
  sp.numLocked = numberAtlas(r, '#c3cbe6', true);
  return sp;
}

function stoneSprite(r, kind) {
  const pad = Math.ceil(r * 0.42);
  const s = Math.ceil(r * 2 + pad * 2);
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const cx = s / 2, cy = s / 2;

  const locked = kind === 'locked';
  const done = kind === 'done';

  // plinth behind the disc
  g.fillStyle = locked ? 'rgba(26,26,60,0.85)' : 'rgba(60,52,40,0.9)';
  g.beginPath();
  g.moveTo(cx - r * 0.72, cy + r * 0.62);
  g.lineTo(cx + r * 0.72, cy + r * 0.62);
  g.lineTo(cx + r * 0.95, cy + r * 1.18);
  g.lineTo(cx - r * 0.95, cy + r * 1.18);
  g.closePath();
  g.fill();

  // drop shadow
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.arc(cx, cy + r * 0.10, r, 0, TAU);
  g.fill();

  // disc face
  const rg = g.createRadialGradient(cx - r * 0.35, cy - r * 0.40, r * 0.12, cx, cy, r * 1.05);
  if (locked) {
    rg.addColorStop(0, '#6a708f');
    rg.addColorStop(0.6, '#454a6b');
    rg.addColorStop(1, '#252947');
  } else {
    rg.addColorStop(0, '#fbf6e6');
    rg.addColorStop(0.62, '#ddd5bd');
    rg.addColorStop(1, '#8c8470');
  }
  g.fillStyle = rg;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fill();

  // chiselled rim
  g.lineWidth = Math.max(2, r * 0.10);
  g.strokeStyle = done ? withAlpha(THEME.gold, 0.95)
    : (locked ? 'rgba(160,170,200,0.35)' : 'rgba(90,82,62,0.75)');
  g.beginPath();
  g.arc(cx, cy, r - g.lineWidth * 0.5, 0, TAU);
  g.stroke();
  // inner bevel
  g.lineWidth = Math.max(1, r * 0.05);
  g.strokeStyle = locked ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.arc(cx, cy, r * 0.86, Math.PI * 0.85, Math.PI * 1.85);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.arc(cx, cy, r * 0.86, Math.PI * -0.15, Math.PI * 0.85);
  g.stroke();

  // marble grain
  g.strokeStyle = locked ? 'rgba(20,20,50,0.25)' : 'rgba(120,108,84,0.28)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = hash01(i, kind.length) * TAU;
    const rr = r * (0.25 + hash01(i, 21) * 0.55);
    g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    g.lineTo(cx + Math.cos(a + 0.9) * rr * 1.15, cy + Math.sin(a + 0.9) * rr * 1.15);
  }
  g.stroke();

  if (locked) {
    g.fillStyle = 'rgba(10,10,40,0.35)';
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.fill();
  }
  return { c: c, s: s, off: s / 2 };
}

function starSprite(r, on) {
  const pad = Math.ceil(r * 0.6);
  const s = Math.ceil(r * 2 + pad * 2);
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  if (on) {
    starPath(g, s / 2, s / 2 + r * 0.06, r);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fill();
    starPath(g, s / 2, s / 2, r);
    const rg = g.createLinearGradient(0, s / 2 - r, 0, s / 2 + r);
    rg.addColorStop(0, '#fff3a8');
    rg.addColorStop(1, '#e0a106');
    g.fillStyle = rg;
    g.fill();
    g.lineWidth = Math.max(1, r * 0.16);
    g.strokeStyle = 'rgba(120,80,0,0.6)';
    g.stroke();
  } else {
    starPath(g, s / 2, s / 2, r);
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fill();
    g.lineWidth = Math.max(1, r * 0.16);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.stroke();
  }
  return { c: c, s: s, off: s / 2 };
}

function lockSprite(s) {
  const c = document.createElement('canvas');
  const S = Math.ceil(s * 1.6);
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const bw = s * 0.82, bh = s * 0.62;
  g.lineWidth = Math.max(2, s * 0.14);
  g.strokeStyle = 'rgba(232,226,208,0.85)';
  g.beginPath();
  g.arc(cx, cy - bh * 0.42, bw * 0.30, Math.PI, 0);
  g.stroke();
  roundRect(g, cx - bw / 2, cy - bh * 0.10, bw, bh, s * 0.10);
  g.fillStyle = 'rgba(232,226,208,0.88)';
  g.fill();
  g.fillStyle = 'rgba(40,38,60,0.9)';
  g.beginPath();
  g.arc(cx, cy + bh * 0.20, s * 0.10, 0, TAU);
  g.fill();
  g.fillRect(cx - s * 0.045, cy + bh * 0.20, s * 0.09, bh * 0.30);
  return { c: c, s: S, off: S / 2 };
}

function numberAtlas(r, col, locked) {
  const cw = Math.ceil(r * 1.55), ch = Math.ceil(r * 1.05);
  const c = document.createElement('canvas');
  c.width = cw * 10; c.height = ch * 10;
  const g = c.getContext('2d');
  for (let i = 0; i < 100; i++) {
    const x = (i % 10) * cw + cw / 2;
    const y = ((i / 10) | 0) * ch + ch / 2;
    carvedText(g, String(i + 1), x, y, ch * 0.74, col, {
      maxW: cw * 0.84,
      depth: 0.06,
      dark: locked ? 'rgba(0,0,0,0.55)' : 'rgba(40,30,14,0.55)',
      light: locked ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.85)'
    });
  }
  return { c: c, cw: cw, ch: ch };
}

export function drawLevelMap(ctx, W, H, t, view) {
  if (W !== _W || H !== _H) onResize(W, H);
  const v = view || {};
  const prog = v.progress || {};
  const starsMap = prog.stars || {};
  const unlocked = Math.max(1, prog.unlocked | 0 || 1);

  drawBackground(ctx, W, H, t);

  const m = mapGeom(v);
  const r = m.r;
  const scrollY = clamp(v.scrollY || 0, 0, m.maxScroll);
  const off = m.headerH - scrollY;
  const sp = m.sprites;

  let totalStars = 0;
  for (const k in starsMap) totalStars += starsMap[k] | 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, m.headerH, W, H - m.headerH);
  ctx.clip();
  ctx.translate(0, off);

  /* --- title block (scrolls away) --- */
  if (m.titleH + off > 0 && off < H) {
    const ty = m.titleH * 0.42;
    const safe = topSafeW();
    const tw = carvedText(ctx, 'VIA APPIA', W / 2, ty, m.titleH * 0.32, THEME.marble,
      { maxW: safe * 0.74, glow: withAlpha(THEME.glow, 0.5) });
    // laurel sprigs FLANKING the title (a wreath behind it crosses the glyphs)
    const half = ctx.measureText('VIA APPIA').width / 2;
    const sg = Math.min(m.titleH * 0.26, (safe / 2 - half) * 0.9);
    if (sg > 8) {
      laurelSprig(ctx, W / 2 - half - sg * 0.5, ty, sg, Math.PI, withAlpha(THEME.gold, 0.75));
      laurelSprig(ctx, W / 2 + half + sg * 0.5, ty, sg, 0, withAlpha(THEME.gold, 0.75));
    }
    void tw;
    const line = 'The road to Rome · ' + totalStars + '/300 stars';
    fitText(ctx, line, safe * 0.9, m.titleH * 0.15, 'bold', FONT_UI);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.sub;
    ctx.fillText(line, W / 2, m.titleH * 0.78);
  }

  /* --- road (3 strokes of one cached Path2D) --- */
  if (m.road) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(18,14,26,0.85)';
    ctx.lineWidth = r * 1.55;
    ctx.stroke(m.road);
    ctx.strokeStyle = '#6d5f4b';
    ctx.lineWidth = r * 1.18;
    ctx.stroke(m.road);
    ctx.setLineDash([r * 0.55, r * 0.30]);
    ctx.strokeStyle = 'rgba(30,24,18,0.30)';
    ctx.lineWidth = r * 1.18;
    ctx.stroke(m.road);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,232,190,0.16)';
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke(m.road);
  }

  /* --- province bands (culled) --- */
  for (let i = 0; i < m.bands.length; i++) {
    const b = m.bands[i];
    const top = b.cy + off, bot = b.cy + b.h + off;
    if (bot < m.headerH - 20 || top > H + 20) continue;
    const ix = m.inset, iw = W - m.inset * 2;
    // faint territory tint
    ctx.fillStyle = withAlpha(b.accent, 0.055);
    ctx.fillRect(ix, b.cy, iw, b.h);
    // header strip
    const hy = b.cy + b.headH * 0.42;
    ctx.fillStyle = withAlpha(b.accent, 0.24);
    ctx.fillRect(ix, b.cy + b.headH * 0.06, iw, b.headH * 0.72);
    ctx.fillStyle = withAlpha(b.accent, 0.9);
    ctx.fillRect(ix, b.cy + b.headH * 0.06, Math.max(4, r * 0.18), b.headH * 0.72);
    let bStars = 0;
    for (let lv = b.from; lv <= b.to; lv++) bStars += starsMap[lv] | 0;
    const labX = ix + r * 0.5;
    carvedText(ctx, b.numeral, labX, hy, b.headH * 0.42, THEME.gold,
      { align: 'left', maxW: r * 2.2 });
    const nm = (b.icon ? b.icon + ' ' : '') + String(b.name).toUpperCase();
    const st = bStars + '/' + ((b.to - b.from + 1) * 3);
    fitText(ctx, st, iw * 0.22, b.headH * 0.24, 'bold', FONT_UI);
    const stW = ctx.measureText(st).width;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = withAlpha(THEME.gold, 0.9);
    ctx.fillText(st, W - ix - r * 0.4, hy);
    const nmX = labX + r * 2.4;
    fitText(ctx, nm, Math.max(40, W - ix - r * 0.4 - stW - 10 - nmX), b.headH * 0.27, 'bold', FONT_UI);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(nm, nmX + 1, hy + 1);
    ctx.fillStyle = THEME.marble;
    ctx.fillText(nm, nmX, hy);
  }

  /* --- milestones (culled) --- */
  const nodes = [];
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
  for (let i = 0; i < m.stones.length; i++) {
    const s = m.stones[i];
    const sy = s.cy + off;
    if (sy < m.headerH - r * 2.4 || sy > H + r * 2.4) continue;
    const lv = s.level;
    const isLocked = lv > unlocked;
    const stars = starsMap[lv] | 0;
    const played = stars > 0;
    const band = m.bands[s.p];

    const spr = isLocked ? sp.locked : (played ? sp.done : sp.open);
    ctx.drawImage(spr.c, s.x - spr.off, s.cy - spr.off);

    // province tint wash on the disc
    ctx.beginPath();
    ctx.arc(s.x, s.cy, r * 0.94, 0, TAU);
    ctx.fillStyle = withAlpha(band.accent, isLocked ? 0.10 : 0.14);
    ctx.fill();

    if (isLocked) {
      ctx.drawImage(sp.lock.c, s.x - sp.lock.off, s.cy - sp.lock.off);
    } else {
      const atlas = sp.numOpen;
      const ci = lv - 1;
      ctx.drawImage(atlas.c, (ci % 10) * atlas.cw, ((ci / 10) | 0) * atlas.ch, atlas.cw, atlas.ch,
        s.x - atlas.cw / 2, s.cy - r * 0.30 - atlas.ch / 2, atlas.cw, atlas.ch);
      // stars
      const sw = sp.starOn.s * 0.72;
      for (let k = 0; k < 3; k++) {
        const spr2 = k < stars ? sp.starOn : sp.starOff;
        ctx.drawImage(spr2.c, s.x + (k - 1) * sw - spr2.off, s.cy + r * 0.40 - spr2.off);
      }
    }

    // the next level to play pulses
    if (lv === unlocked && !isLocked) {
      ctx.lineWidth = Math.max(2, r * 0.10);
      ctx.strokeStyle = withAlpha(THEME.gold, 0.35 + 0.5 * pulse);
      ctx.beginPath();
      ctx.arc(s.x, s.cy, r * (1.12 + pulse * 0.14), 0, TAU);
      ctx.stroke();
    }
    nodes.push({ level: lv, x: s.x, y: sy, r: r * 1.12 });
  }
  ctx.restore();

  /* --- fixed toolbar on top --- */
  const tb = m.headerH;
  const fg = ctx.createLinearGradient(0, 0, 0, tb + 18);
  fg.addColorStop(0, 'rgba(6,6,26,0.96)');
  fg.addColorStop(0.75, 'rgba(6,6,26,0.88)');
  fg.addColorStop(1, 'rgba(6,6,26,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, W, tb + 18);
  ctx.fillStyle = withAlpha(THEME.marble, 0.22);
  ctx.fillRect(0, tb - 2, W, 2);

  const btnH = m.btnH;
  const gap = 8;
  const leftX = 108;                       // clears the HTML back button
  const avail = W - leftX - 10 - gap;
  const pw = Math.max(84, Math.min(230, avail * 0.5));
  const tw = Math.max(84, Math.min(230, avail - pw));
  const profileRect = { x: leftX, y: 12, w: pw, h: btnH };
  const trophyRect = { x: W - 10 - tw, y: 12, w: tw, h: btnH };

  button(ctx, profileRect, v.profileName ? String(v.profileName) : 'Scribe',
    { kind: 'ghost', sub: '★ ' + totalStars, size: btnH * 0.34 });
  button(ctx, trophyRect, 'Trophies', { kind: 'gold', sub: 'Room of Spoils', size: btnH * 0.32 });

  /* --- scroll indicator --- */
  if (m.maxScroll > 4) {
    const trackY = tb + 8, trackH = H - tb - 20;
    const kh = Math.max(28, trackH * (trackH / (trackH + m.maxScroll)));
    const ky = trackY + (trackH - kh) * (scrollY / m.maxScroll);
    roundRect(ctx, W - 7, trackY, 4, trackH, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    roundRect(ctx, W - 7, ky, 4, kh, 2);
    ctx.fillStyle = withAlpha(THEME.glow, 0.7);
    ctx.fill();
  }

  return { nodes: nodes, maxScroll: m.maxScroll, profileRect: profileRect, trophyRect: trophyRect };
}

/* ------------------------------------------------------------------ */
/* shared panel + button layout helpers                                */
/* ------------------------------------------------------------------ */
function panel(ctx, W, H, alpha, tint) {
  ctx.fillStyle = 'rgba(4,4,20,' + (0.62 * alpha).toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W * 0.94, 600);
  const ph = Math.min(H * 0.94, 760);
  const px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.globalAlpha = alpha;
  plaque(ctx, px, py, pw, ph, {
    r: Math.min(pw, ph) * 0.06,
    fill: 'rgba(12,10,40,0.90)',
    stroke: withAlpha(tint || THEME.gold, 0.55),
    innerStroke: 'rgba(0,0,0,0.45)'
  });
  // marble cornice
  ctx.fillStyle = withAlpha(THEME.marble, 0.14);
  ctx.fillRect(px + pw * 0.06, py + ph * 0.035, pw * 0.88, Math.max(2, ph * 0.006));
  ctx.globalAlpha = 1;
  return { x: px, y: py, w: pw, h: ph };
}

/** Lay out n buttons inside (x,w) at areaTop..areaTop+areaH. Row when wide. */
function buttonSlots(x, w, areaTop, areaH, n, primaryFirst) {
  const bh = Math.round(clamp(areaH * (n > 2 ? 0.46 : 0.44), 64, 78));
  const gap = Math.max(8, w * 0.03);
  const out = [];
  const wideEnough = (w - gap * (n - 1)) / n >= 116;
  if (wideEnough) {
    const bw = (w - gap * (n - 1)) / n;
    const y = areaTop + (areaH - bh) / 2;
    for (let i = 0; i < n; i++) out.push({ x: x + i * (bw + gap), y: y, w: bw, h: bh });
  } else if (n === 3 && primaryFirst) {
    const y0 = areaTop + (areaH - bh * 2 - gap) / 2;
    out.push({ x: x, y: y0, w: w, h: bh });
    const bw = (w - gap) / 2;
    out.push({ x: x, y: y0 + bh + gap, w: bw, h: bh });
    out.push({ x: x + bw + gap, y: y0 + bh + gap, w: bw, h: bh });
  } else {
    const th = n * bh + (n - 1) * gap;
    const y0 = areaTop + (areaH - th) / 2;
    for (let i = 0; i < n; i++) out.push({ x: x, y: y0 + i * (bh + gap), w: w, h: bh });
  }
  return out;
}

/* Analytic laurel-leaf shower — deterministic from `at`, no state, ~24 leaves,
 * 2 fills total. (fx.laurel() is the interactive burst; this is the ambience.) */
function laurelShower(ctx, W, H, at) {
  const n = 30;
  const S = Math.min(W, H);
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass ? 'rgba(122,170,90,0.85)' : 'rgba(214,238,158,0.9)';
    ctx.beginPath();
    for (let i = pass; i < n; i += 2) {
      const sp = 40 + hash01(i, 41) * 90;
      const y = ((at * sp + hash01(i, 42) * H * 1.4) % (H + 60)) - 30;
      const x = hash01(i, 43) * W + Math.sin(at * (0.7 + hash01(i, 44)) + i) * (W * 0.04);
      const L = S * (0.016 + hash01(i, 45) * 0.016);
      leafInto(ctx, x, y, L, L * 0.42, at * (1.1 + hash01(i, 46) * 1.6) + i);
    }
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ */
/* level complete                                                      */
/* ------------------------------------------------------------------ */
export function drawLevelComplete(ctx, W, H, t, res) {
  if (W !== _W || H !== _H) onResize(W, H);
  const r = res || {};
  const at = r.t != null ? r.t : t;
  const stars = clamp(r.stars | 0, 0, 3);
  const a = clamp(at * 2.6, 0, 1);

  drawBackground(ctx, W, H, t);
  const p = panel(ctx, W, H, a, THEME.gold);

  const cx = p.x + p.w / 2;
  const title = r.isBoss ? 'TRIVMPHVS' : 'VICTORIA';
  carvedText(ctx, title, cx, p.y + p.h * 0.13, p.h * 0.115, THEME.gold, {
    maxW: p.w * 0.82,
    glow: withAlpha(THEME.gold, 0.75),
    glowBlur: Math.max(18, p.h * 0.06)
  });
  const lvl = 'LEVEL ' + romanize(r.level | 0 || 1) + (r.isBoss ? ' · THE COLOSSEVM' : '');
  fitText(ctx, lvl, p.w * 0.8, p.h * 0.042, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.sub;
  ctx.fillText(lvl, cx, p.y + p.h * 0.215);

  /* stars pop in sequence */
  const sr = Math.min(p.w * 0.115, p.h * 0.085);
  const starY = p.y + p.h * 0.345;
  // one gradient for all three stars — never build gradients inside a loop
  const starGrad = ctx.createLinearGradient(0, starY - sr, 0, starY + sr);
  starGrad.addColorStop(0, '#fff5b0');
  starGrad.addColorStop(1, '#e5a505');
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * sr * 2.7;
    const y = starY;
    const on = i < stars;
    const t0 = 0.25 + i * 0.32;
    let k = clamp((at - t0) / 0.28, 0, 1);
    if (!on) k = 1;
    // overshoot ease
    const sc = on ? (k < 1 ? 0.4 + 1.0 * k + 0.35 * Math.sin(k * Math.PI) : 1) : 1;
    if (on && k <= 0) continue;
    if (on) {
      starPath(ctx, x, y, sr * sc);
      ctx.fillStyle = withAlpha(THEME.gold, 0.22 + 0.3 * (1 - k));
      ctx.fill();
      starPath(ctx, x, y, sr * 0.86 * sc);
      ctx.fillStyle = starGrad;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, sr * 0.09);
      ctx.strokeStyle = 'rgba(110,70,0,0.55)';
      ctx.stroke();
    } else {
      starPath(ctx, x, y, sr * 0.86);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, sr * 0.09);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.stroke();
    }
  }

  /* score */
  const sc = String(r.score != null ? r.score : 0);
  carvedText(ctx, sc, cx, p.y + p.h * 0.50, p.h * 0.095, THEME.gold, { maxW: p.w * 0.7 });
  const bestLine = r.newBest ? 'NEW BEST!' : ('Best  ' + (r.best != null ? r.best : sc));
  fitText(ctx, bestLine, p.w * 0.7, p.h * 0.038, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = r.newBest ? THEME.gold : 'rgba(255,255,255,0.7)';
  ctx.fillText(bestLine, cx, p.y + p.h * 0.585);

  /* artifact ribbon */
  const art = normalizeArtifact(r.artifact);
  if (art) {
    const rw = p.w * 0.78, rh = p.h * 0.10;
    const rx = cx - rw / 2, ry = p.y + p.h * 0.635;
    roundRect(ctx, rx, ry, rw, rh, rh * 0.3);
    ctx.fillStyle = 'rgba(255,211,42,0.12)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(THEME.gold, 0.5);
    ctx.stroke();
    drawArtifact(ctx, art.index, rx + rh * 0.62, ry + rh / 2, rh * 0.78, false);
    fitText(ctx, 'Artifact earned: ' + art.name, rw - rh * 1.5, rh * 0.34, 'bold', FONT_UI);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.marble;
    ctx.fillText('Artifact earned: ' + art.name, rx + rh * 1.2, ry + rh / 2);
  }

  /* buttons */
  const areaTop = p.y + p.h * (art ? 0.755 : 0.71);
  const areaH = p.y + p.h * 0.965 - areaTop;
  const slots = buttonSlots(p.x + p.w * 0.09, p.w * 0.82, areaTop, areaH, 3, true);
  const nextEnabled = !(r.level >= 100) && r.nextLocked !== true;
  button(ctx, slots[0], nextEnabled ? 'Next Level' : 'Campaign Complete',
    { kind: 'gold', enabled: nextEnabled });
  button(ctx, slots[1], 'Retry', { kind: 'ghost' });
  button(ctx, slots[2], 'Map', { kind: 'ghost' });

  // confetti LAST so it falls in front of the plaque (behind it, the dim
  // overlay swallowed it entirely)
  laurelShower(ctx, W, H, at);

  return { nextRect: slots[0], retryRect: slots[1], mapRect: slots[2] };
}

/* ------------------------------------------------------------------ */
/* level failed — never harsh, never "you lost the game"               */
/* ------------------------------------------------------------------ */
const FAIL_LINES = [
  'Even Caesar lost a battle. Sharpen your chisel.',
  'The scrolls await a steadier hand.',
  'Rome was not built in one attempt.',
  'A scribe learns more from a slip than a triumph.'
];

export function drawLevelFailed(ctx, W, H, t, res) {
  if (W !== _W || H !== _H) onResize(W, H);
  const r = res || {};
  const at = r.t != null ? r.t : t;
  const a = clamp(at * 2.6, 0, 1);

  drawBackground(ctx, W, H, t);
  const p = panel(ctx, W, H, a, THEME.danger);
  const cx = p.x + p.w / 2;

  carvedText(ctx, 'THE SENATE', cx, p.y + p.h * 0.155, p.h * 0.075, THEME.marble,
    { maxW: p.w * 0.7 });
  // senate motif: a downturned laurel to each side of the title (behind the
  // glyphs it read as red claws)
  {
    const half = ctx.measureText('THE SENATE').width / 2;
    const sg = Math.min(p.h * 0.06, (p.w * 0.42 - half) * 0.9);
    if (sg > 8) {
      laurelSprig(ctx, cx - half - sg * 0.7, p.y + p.h * 0.155, sg, Math.PI, 'rgba(231,76,60,0.65)');
      laurelSprig(ctx, cx + half + sg * 0.7, p.y + p.h * 0.155, sg, 0, 'rgba(231,76,60,0.65)');
    }
  }
  carvedText(ctx, 'IS NOT IMPRESSED', cx, p.y + p.h * 0.245, p.h * 0.068, THEME.danger,
    { maxW: p.w * 0.8, glow: withAlpha(THEME.danger, 0.5) });

  const line = FAIL_LINES[Math.abs((r.level | 0)) % FAIL_LINES.length];
  fitText(ctx, line, p.w * 0.84, p.h * 0.040, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(line, cx, p.y + p.h * 0.345);

  // how far they got
  const got = (r.solved != null && r.total != null)
    ? ('You carved ' + r.solved + ' of ' + r.total + ' tablets')
    : 'Level ' + romanize(r.level | 0 || 1) + ' stands unfinished';
  fitText(ctx, got, p.w * 0.8, p.h * 0.042, 'bold', FONT_UI);
  ctx.fillStyle = THEME.sub;
  ctx.fillText(got, cx, p.y + p.h * 0.43);

  if (r.total) {
    drawMosaic(ctx, { x: cx - p.w * 0.30, y: p.y + p.h * 0.48, w: p.w * 0.60, h: p.h * 0.20 },
      r.solved | 0, r.total | 0, (r.level | 0) || 1);
  }

  const teach = r.teach ? String(r.teach) : 'Tip: a smaller letter before a bigger one means take it away. IX = 10 − 1 = 9.';
  fitText(ctx, teach, p.w * 0.86, p.h * 0.034, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(teach, cx, p.y + p.h * 0.735);

  const areaTop = p.y + p.h * 0.775;
  const areaH = p.y + p.h * 0.96 - areaTop;
  const slots = buttonSlots(p.x + p.w * 0.12, p.w * 0.76, areaTop, areaH, 2, false);
  button(ctx, slots[0], 'Try Again', { kind: 'gold' });
  button(ctx, slots[1], 'Map', { kind: 'ghost' });

  return { retryRect: slots[0], mapRect: slots[1] };
}

/* ------------------------------------------------------------------ */
/* profile select — two legion standards                               */
/* ------------------------------------------------------------------ */
function normalizeProfiles(profiles) {
  const out = [];
  if (Array.isArray(profiles)) {
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i] || {};
      out.push(mkProfile(p.key || p.id || ('p' + i), p));
    }
  } else if (profiles && typeof profiles === 'object') {
    const keys = Object.keys(profiles);
    for (let i = 0; i < keys.length; i++) out.push(mkProfile(keys[i], profiles[keys[i]] || {}));
  }
  if (!out.length) {
    out.push(mkProfile('caleb', {}));
    out.push(mkProfile('ezra', {}));
  }
  return out;
}
function mkProfile(key, p) {
  let stars = 0;
  if (typeof p.stars === 'number') stars = p.stars;
  else if (p.stars && typeof p.stars === 'object') { for (const k in p.stars) stars += p.stars[k] | 0; }
  const name = p.name || (String(key).charAt(0).toUpperCase() + String(key).slice(1));
  return {
    key: key, name: name, stars: stars,
    unlocked: Math.max(1, p.unlocked | 0 || 1),
    trophies: (p.trophies && p.trophies.length) | 0
  };
}

export function drawProfileSelect(ctx, W, H, t, profiles) {
  if (W !== _W || H !== _H) onResize(W, H);
  const list = normalizeProfiles(profiles);
  drawBackground(ctx, W, H, t);

  const S = Math.min(W, H);
  const safe = topSafeW();
  const titleY = Math.max(H * 0.12, 74);
  carvedText(ctx, "CAESAR'S CHALLENGE", W / 2, titleY, S * 0.085, THEME.gold, {
    maxW: safe * 0.94, glow: withAlpha(THEME.glow, 0.6), glowBlur: Math.max(16, S * 0.05)
  });
  fitText(ctx, 'Which scribe reports for duty?', safe * 0.94, S * 0.036, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.sub;
  ctx.fillText('Which scribe reports for duty?', W / 2, titleY + S * 0.085);

  const n = list.length;
  const top = titleY + S * 0.14;
  const bottom = H - Math.max(24, H * 0.06);
  const areaH = bottom - top;
  const row = W > H * 1.05 || W >= 620;
  const rects = [];
  if (row) {
    const gap = Math.max(14, W * 0.035);
    const cw = Math.min((W * 0.86 - gap * (n - 1)) / n, S * 0.62);
    const ch = Math.min(areaH * 0.94, cw * 1.42);
    const totalW = cw * n + gap * (n - 1);
    const x0 = (W - totalW) / 2;
    const y = top + (areaH - ch) / 2;
    for (let i = 0; i < n; i++) rects.push({ x: x0 + i * (cw + gap), y: y, w: cw, h: ch });
  } else {
    const gap = Math.max(12, H * 0.022);
    const ch = Math.max(96, Math.min((areaH - gap * (n - 1)) / n, areaH * 0.46));
    const cw = Math.min(W * 0.86, 480);
    const y0 = top + (areaH - (ch * n + gap * (n - 1))) / 2;
    for (let i = 0; i < n; i++) rects.push({ x: (W - cw) / 2, y: y0 + i * (ch + gap), w: cw, h: ch });
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    drawStandard(ctx, rects[i], list[i], t, i);
    out.push({ key: list[i].key, rect: rects[i] });
  }
  return { rects: out };
}

/* shield gradients cached in LOCAL space (0..h) — the card bobs every frame, so
 * building them at absolute y would mean a new gradient per card per frame */
const _shieldGrad = new Map();
function shieldGrad(ctx, col, h) {
  const key = col + '|' + Math.round(h);
  let g = _shieldGrad.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(col, 0.18));
    g.addColorStop(0.55, shade(col, -0.30));
    g.addColorStop(1, shade(col, -0.55));
    if (_shieldGrad.size > 16) _shieldGrad.clear();
    _shieldGrad.set(key, g);
  }
  return g;
}

function drawStandard(ctx, rc, p, t, i) {
  const col = i === 0 ? THEME.accent : '#00b894';
  const bob = Math.sin(t * 1.4 + i * 1.7) * Math.min(4, rc.h * 0.012);
  const x = rc.x, y = rc.y + bob, w = rc.w, h = rc.h;

  // shield body — drawn inside a translate so the cached local-space gradient
  // (0..h) lines up wherever the card is bobbing this frame
  ctx.save();
  ctx.translate(0, y);
  roundRect(ctx, x, 0, w, h, Math.min(w, h) * 0.10);
  ctx.fillStyle = shieldGrad(ctx, col, h);
  ctx.fill();
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.022);
  ctx.strokeStyle = withAlpha(THEME.gold, 0.75);
  ctx.stroke();
  ctx.restore();
  // inner border
  const pad = Math.min(w, h) * 0.055;
  roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, Math.min(w, h) * 0.07);
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.010);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
  // shield boss FIRST, then the eagle on top of it
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.27, Math.min(w, h) * 0.11, 0, TAU);
  ctx.fillStyle = withAlpha(THEME.marble, 0.22);
  ctx.fill();
  eagleGlyph(ctx, x + w / 2, y + h * 0.26, w * 0.52, withAlpha(THEME.gold, 0.9));

  carvedText(ctx, p.name, x + w / 2, y + h * 0.55, h * 0.15, THEME.marble, { maxW: w * 0.82 });

  // stats
  const sy = y + h * 0.72;
  const sr = Math.min(w, h) * 0.055;
  drawStar(ctx, x + w * 0.5 - sr * 3.0, sy, sr, THEME.gold, 'rgba(80,50,0,0.5)');
  fitText(ctx, String(p.stars), w * 0.3, h * 0.11, 'bold', FONT_UI);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.gold;
  ctx.fillText(String(p.stars), x + w * 0.5 - sr * 1.7, sy);

  const lab = p.stars > 0 ? ('Level ' + romanize(p.unlocked)) : 'New scribe';
  fitText(ctx, lab, w * 0.8, h * 0.085, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(lab, x + w / 2, y + h * 0.86);
}

/* ------------------------------------------------------------------ */
/* trophy room                                                         */
/* ------------------------------------------------------------------ */
function ownedHas(owned, i) {
  if (!owned) return false;
  const id = ARTIFACTS[i].id;
  if (Array.isArray(owned)) {
    for (let k = 0; k < owned.length; k++) {
      const o = owned[k];
      if (o === i || o === i + 1 || o === id) return true;
      if (o && typeof o === 'object' && (o.id === id || o.index === i)) return true;
    }
    return false;
  }
  if (typeof owned.has === 'function') return owned.has(i) || owned.has(id);
  if (typeof owned === 'object') return !!(owned[i] || owned[id]);
  if (typeof owned === 'number') return i < owned;
  return false;
}

function normalizeArtifact(a) {
  if (a == null) return null;
  if (typeof a === 'number') {
    const i = clamp(a | 0, 0, ARTIFACTS.length - 1);
    return { index: i, name: ARTIFACTS[i].name };
  }
  if (typeof a === 'string') {
    for (let i = 0; i < ARTIFACTS.length; i++) {
      if (ARTIFACTS[i].id === a || ARTIFACTS[i].name === a) return { index: i, name: ARTIFACTS[i].name };
    }
    return { index: clamp(provinceIdx, 0, 9), name: a };
  }
  if (typeof a === 'object') {
    const i = a.index != null ? clamp(a.index | 0, 0, 9) : clamp(provinceIdx, 0, 9);
    return { index: i, name: a.name || ARTIFACTS[i].name };
  }
  return null;
}

export function drawTrophyRoom(ctx, W, H, t, owned) {
  if (W !== _W || H !== _H) onResize(W, H);
  drawBackground(ctx, W, H, t);
  const S = Math.min(W, H);

  ctx.fillStyle = 'rgba(4,4,20,0.55)';
  ctx.fillRect(0, 0, W, H);

  const safe = topSafeW();
  const titleY = Math.max(H * 0.10, 66);
  carvedText(ctx, 'ROOM OF SPOILS', W / 2, titleY, S * 0.072, THEME.gold,
    { maxW: safe * 0.94, glow: withAlpha(THEME.gold, 0.5) });

  let count = 0;
  for (let i = 0; i < ARTIFACTS.length; i++) if (ownedHas(owned, i)) count++;
  const sub = count + ' of ' + ARTIFACTS.length + ' artifacts recovered';
  fitText(ctx, sub, safe * 0.94, S * 0.032, 'bold', FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.sub;
  ctx.fillText(sub, W / 2, titleY + S * 0.062);

  const btnH = Math.round(clamp(S * 0.13, 64, 78));
  const backRect = {
    x: (W - Math.min(W * 0.7, 300)) / 2,
    y: H - btnH - Math.max(12, H * 0.028),
    w: Math.min(W * 0.7, 300), h: btnH
  };

  const top = titleY + S * 0.10;
  const bottom = backRect.y - Math.max(10, H * 0.02);
  const areaH = Math.max(80, bottom - top);
  const cols = W >= H ? 5 : (W < 400 ? 2 : 3);
  const rows = Math.ceil(ARTIFACTS.length / cols);
  // the top row sits inside the banner zone, so keep the whole grid inside the
  // safe width; niches are translucent and banners would bleed through
  const gridW = Math.min(W * 0.94, Math.max(safe, W - colInset() * 2));
  const cw = gridW / cols;
  const ch = areaH / rows;
  const ox = (W - cw * cols) / 2;
  const lastRow = rows - 1;
  const lastShift = ((cols * rows - ARTIFACTS.length) * cw) / 2;

  for (let i = 0; i < ARTIFACTS.length; i++) {
    const c = i % cols, rw = (i / cols) | 0;
    const x = ox + c * cw + (rw === lastRow ? lastShift : 0), y = top + rw * ch;
    const has = ownedHas(owned, i);
    // niche
    roundRect(ctx, x + cw * 0.06, y + ch * 0.04, cw * 0.88, ch * 0.80, cw * 0.10);
    ctx.fillStyle = has ? 'rgba(232,226,208,0.10)' : 'rgba(0,0,0,0.30)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = has ? withAlpha(THEME.gold, 0.45) : 'rgba(255,255,255,0.10)';
    ctx.stroke();
    // shelf
    ctx.fillStyle = 'rgba(232,226,208,0.18)';
    ctx.fillRect(x + cw * 0.04, y + ch * 0.84, cw * 0.92, Math.max(2, ch * 0.03));

    const size = Math.min(cw * 0.52, ch * 0.46);
    drawArtifact(ctx, i, x + cw / 2, y + ch * 0.44, size, !has);
    if (has) {
      // gentle sheen
      ctx.globalAlpha = 0.20 + 0.12 * Math.sin(t * 1.5 + i);
      drawArtifact(ctx, i, x + cw / 2, y + ch * 0.44, size * 1.06, false);
      ctx.globalAlpha = 1;
    }
    const nm = has ? ARTIFACTS[i].name : 'Locked';
    fitText(ctx, nm, cw * 0.86, ch * 0.13, 'bold', FONT_UI);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = has ? THEME.marble : 'rgba(255,255,255,0.35)';
    ctx.fillText(nm, x + cw / 2, y + ch * 0.94);
    // province numeral tag
    fitText(ctx, romanize(i + 1), cw * 0.2, ch * 0.11, 'bold', FONT_DISPLAY);
    ctx.fillStyle = withAlpha(THEME.gold, has ? 0.8 : 0.25);
    ctx.fillText(romanize(i + 1), x + cw * 0.15, y + ch * 0.14);
  }

  button(ctx, backRect, 'Back to the Road', { kind: 'ghost' });
  return { backRect: backRect };
}

/* --- 10 procedural artifacts ------------------------------------- */
function drawArtifact(ctx, idx, cx, cy, s, silhouette) {
  // silhouettes must still read as a SHAPE, not a hole in the shelf
  const main = silhouette ? '#33336e' : '#e8c15a';
  const dark = silhouette ? '#262657' : '#8a6a1c';
  const lite = silhouette ? '#3d3d80' : '#fff0b8';
  const i = clamp(idx | 0, 0, 9);
  switch (i) {
    case 0: // laurel wreath
      laurelWreath(ctx, cx, cy + s * 0.05, s * 0.42, silhouette ? main : '#7fbf5a', true);
      if (!silhouette) {
        laurelWreath(ctx, cx, cy + s * 0.05, s * 0.42 * 0.92, 'rgba(200,240,160,0.55)', true);
      }
      break;
    case 1: { // denarius coin
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.42, 0, TAU);
      ctx.fillStyle = silhouette ? main : '#d9d3c0';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.strokeStyle = dark;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.32, 0, TAU);
      ctx.stroke();
      if (!silhouette) carvedText(ctx, 'X', cx, cy, s * 0.36, '#6d6552', {});
      break;
    }
    case 2: { // amphora
      ctx.fillStyle = silhouette ? main : '#b8632f';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.06, cy - s * 0.44);
      ctx.lineTo(cx + s * 0.06, cy - s * 0.44);
      ctx.lineTo(cx + s * 0.08, cy - s * 0.22);
      ctx.quadraticCurveTo(cx + s * 0.34, cy - s * 0.02, cx + s * 0.20, cy + s * 0.30);
      ctx.lineTo(cx + s * 0.07, cy + s * 0.44);
      ctx.lineTo(cx - s * 0.07, cy + s * 0.44);
      ctx.lineTo(cx - s * 0.20, cy + s * 0.30);
      ctx.quadraticCurveTo(cx - s * 0.34, cy - s * 0.02, cx - s * 0.08, cy - s * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.arc(cx - s * 0.16, cy - s * 0.14, s * 0.13, -0.6, 2.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.16, cy - s * 0.14, s * 0.13, Math.PI + 0.9, Math.PI - 0.6, true);
      ctx.stroke();
      if (!silhouette) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(cx - s * 0.24, cy + s * 0.04, s * 0.48, s * 0.06);
      }
      break;
    }
    case 3: { // gladius
      ctx.fillStyle = silhouette ? main : '#cdd3dd';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.46);
      ctx.lineTo(cx + s * 0.075, cy - s * 0.34);
      ctx.lineTo(cx + s * 0.055, cy + s * 0.10);
      ctx.lineTo(cx - s * 0.055, cy + s * 0.10);
      ctx.lineTo(cx - s * 0.075, cy - s * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = silhouette ? main : '#b8892f';
      ctx.fillRect(cx - s * 0.22, cy + s * 0.10, s * 0.44, s * 0.08);
      ctx.fillRect(cx - s * 0.05, cy + s * 0.18, s * 0.10, s * 0.20);
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.42, s * 0.075, 0, TAU);
      ctx.fill();
      if (!silhouette) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.42);
        ctx.lineTo(cx, cy + s * 0.08);
        ctx.stroke();
      }
      break;
    }
    case 4: { // scroll
      ctx.fillStyle = silhouette ? main : '#e8dfc0';
      ctx.fillRect(cx - s * 0.30, cy - s * 0.24, s * 0.60, s * 0.48);
      ctx.fillStyle = silhouette ? dark : '#b8a878';
      ctx.beginPath();
      ctx.arc(cx - s * 0.32, cy, s * 0.10, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.32, cy, s * 0.10, 0, TAU);
      ctx.fill();
      if (!silhouette) {
        ctx.fillStyle = 'rgba(90,70,40,0.6)';
        for (let k = 0; k < 3; k++) ctx.fillRect(cx - s * 0.22, cy - s * 0.13 + k * s * 0.13, s * 0.44, Math.max(1, s * 0.035));
      }
      break;
    }
    case 5: { // column
      ctx.fillStyle = silhouette ? main : '#ece5d2';
      ctx.fillRect(cx - s * 0.26, cy - s * 0.44, s * 0.52, s * 0.10);
      ctx.fillRect(cx - s * 0.30, cy + s * 0.34, s * 0.60, s * 0.11);
      ctx.fillRect(cx - s * 0.17, cy - s * 0.34, s * 0.34, s * 0.68);
      if (!silhouette) {
        ctx.strokeStyle = 'rgba(110,100,78,0.6)';
        ctx.lineWidth = Math.max(1, s * 0.022);
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(cx + k * s * 0.09, cy - s * 0.31);
          ctx.lineTo(cx + k * s * 0.09, cy + s * 0.31);
        }
        ctx.stroke();
      }
      break;
    }
    case 6: { // legion helmet
      ctx.fillStyle = silhouette ? main : '#b3922f';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.32, Math.PI, 0);
      ctx.lineTo(cx + s * 0.32, cy + s * 0.10);
      ctx.lineTo(cx + s * 0.16, cy + s * 0.30);
      ctx.lineTo(cx - s * 0.16, cy + s * 0.30);
      ctx.lineTo(cx - s * 0.32, cy + s * 0.10);
      ctx.closePath();
      ctx.fill();
      // crest
      ctx.fillStyle = silhouette ? main : '#b0342a';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05, cy - s * 0.30);
      ctx.quadraticCurveTo(cx, cy - s * 0.56, cx + s * 0.05, cy - s * 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = silhouette ? main : '#d24a38';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05, cy - s * 0.32);
      ctx.quadraticCurveTo(cx + s * 0.22, cy - s * 0.52, cx + s * 0.30, cy - s * 0.18);
      ctx.quadraticCurveTo(cx + s * 0.10, cy - s * 0.34, cx + s * 0.02, cy - s * 0.30);
      ctx.closePath();
      ctx.fill();
      if (!silhouette) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(cx - s * 0.34, cy + s * 0.02, s * 0.68, Math.max(1.5, s * 0.05));
      }
      break;
    }
    case 7: { // chariot wheel
      ctx.lineWidth = Math.max(2, s * 0.075);
      ctx.strokeStyle = silhouette ? main : '#8a6a34';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.40, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        ctx.moveTo(cx + Math.cos(a) * s * 0.10, cy + Math.sin(a) * s * 0.10);
        ctx.lineTo(cx + Math.cos(a) * s * 0.37, cy + Math.sin(a) * s * 0.37);
      }
      ctx.stroke();
      ctx.fillStyle = silhouette ? main : '#c8a94e';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.11, 0, TAU);
      ctx.fill();
      break;
    }
    case 8: { // eagle standard
      ctx.fillStyle = silhouette ? main : '#8a7b52';
      ctx.fillRect(cx - s * 0.03, cy - s * 0.10, s * 0.06, s * 0.55);
      eagleGlyph(ctx, cx, cy - s * 0.18, s * 0.66, silhouette ? main : '#e8c15a');
      ctx.fillStyle = silhouette ? main : '#c0392b';
      ctx.fillRect(cx - s * 0.20, cy + s * 0.12, s * 0.40, s * 0.13);
      if (!silhouette) {
        fitText(ctx, 'SPQR', s * 0.34, s * 0.11, 'bold', FONT_DISPLAY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = THEME.gold;
        ctx.fillText('SPQR', cx, cy + s * 0.19);
      }
      break;
    }
    default: { // caesar's crown
      ctx.fillStyle = silhouette ? main : '#e8c15a';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.36, cy + s * 0.22);
      ctx.lineTo(cx - s * 0.30, cy - s * 0.16);
      ctx.lineTo(cx - s * 0.15, cy + s * 0.02);
      ctx.lineTo(cx, cy - s * 0.30);
      ctx.lineTo(cx + s * 0.15, cy + s * 0.02);
      ctx.lineTo(cx + s * 0.30, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.36, cy + s * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = silhouette ? dark : '#b3922f';
      ctx.fillRect(cx - s * 0.38, cy + s * 0.22, s * 0.76, s * 0.13);
      if (!silhouette) {
        ctx.fillStyle = '#c0392b';
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.arc(cx + k * s * 0.20, cy + s * 0.285, s * 0.045, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = lite;
        ctx.beginPath();
        ctx.arc(cx, cy - s * 0.24, s * 0.05, 0, TAU);
        ctx.fill();
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* boss rival gauge — two chariots racing                              */
/* ------------------------------------------------------------------ */
export function drawBossRival(ctx, rect, t, rival) {
  const rv = rival || {};
  const you = clamp(rv.selfPct != null ? rv.selfPct : (rv.you != null ? rv.you : (rv.playerPct || 0)), 0, 1);
  const them = clamp(rv.pct != null ? rv.pct : 0, 0, 1);
  const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
  const pad = Math.max(6, h * 0.10);
  const laneH = (h - pad * 3) / 2;
  const trackX = x + pad + Math.min(w * 0.20, 78);
  // reserve room on the right for the finish line + the leader's laurel
  const trackW = Math.max(30, x + w - pad - trackX - h * 0.50);

  // arena floor
  roundRect(ctx, x, y, w, h, Math.min(h * 0.22, 16));
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = withAlpha(THEME.danger, 0.45);
  ctx.stroke();

  const labels = ['YOU', (rv.name ? String(rv.name) : 'RIVAL').toUpperCase()];
  const cols = [THEME.gold, THEME.danger];
  const vals = [you, them];

  for (let i = 0; i < 2; i++) {
    const ly = y + pad + i * (laneH + pad);
    // lane
    roundRect(ctx, trackX, ly + laneH * 0.30, trackW, laneH * 0.40, laneH * 0.20);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    roundRect(ctx, trackX, ly + laneH * 0.30, Math.max(2, trackW * vals[i]), laneH * 0.40, laneH * 0.20);
    ctx.fillStyle = withAlpha(cols[i], 0.55);
    ctx.fill();
    // label
    fitText(ctx, labels[i], trackX - x - pad - 4, laneH * 0.52, 'bold', FONT_UI);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cols[i];
    ctx.fillText(labels[i], x + pad, ly + laneH * 0.5);
    // chariot marker
    chariot(ctx, trackX + trackW * vals[i], ly + laneH * 0.5, laneH * 0.86, cols[i], t + i * 1.3);
  }

  // finish line
  const fx2 = trackX + trackW;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = 0; k < 4; k++) {
    ctx.fillRect(fx2 + (k & 1) * 3, y + pad + k * (h - pad * 2) / 4, 3, (h - pad * 2) / 4);
  }
  // who leads
  const lead = rv.lead != null ? rv.lead : (you >= them ? 'you' : 'rival');
  const winning = (lead === 'you' || lead === true || lead === 0);
  laurelWreath(ctx, fx2 + h * 0.16, y + pad + (winning ? 0 : (laneH + pad)) + laneH * 0.5,
    laneH * 0.34, withAlpha(winning ? THEME.gold : THEME.danger, 0.8), true);
}

function chariot(ctx, cx, cy, s, col, t) {
  const wob = Math.sin(t * 12) * s * 0.04;
  // body
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.34, cy + wob - s * 0.10);
  ctx.lineTo(cx + s * 0.20, cy + wob - s * 0.14);
  ctx.lineTo(cx + s * 0.26, cy + wob + s * 0.16);
  ctx.lineTo(cx - s * 0.30, cy + wob + s * 0.16);
  ctx.closePath();
  ctx.fill();
  // wheel
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.4, s * 0.07);
  ctx.beginPath();
  ctx.arc(cx - s * 0.05, cy + s * 0.20 + wob, s * 0.22, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  const a = t * 7;
  for (let k = 0; k < 3; k++) {
    const ang = a + k * (Math.PI / 1.5);
    ctx.moveTo(cx - s * 0.05 - Math.cos(ang) * s * 0.20, cy + s * 0.20 + wob - Math.sin(ang) * s * 0.20);
    ctx.lineTo(cx - s * 0.05 + Math.cos(ang) * s * 0.20, cy + s * 0.20 + wob + Math.sin(ang) * s * 0.20);
  }
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.stroke();
  // driver plume
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.02, cy + wob - s * 0.26, s * 0.10, 0, TAU);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* fx — preallocated particle pool, HARD CAP 120                       */
/* ------------------------------------------------------------------ */
const FX_CAP = 120;
const K_SPARK = 0, K_LEAF = 1, K_DUST = 2;
const pool = new Array(FX_CAP);
for (let i = 0; i < FX_CAP; i++) {
  pool[i] = { live: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1, rot: 0, vr: 0, c: 0 };
}
let poolCursor = 0;

function alloc() {
  for (let i = 0; i < FX_CAP; i++) {
    const p = pool[poolCursor];
    poolCursor = (poolCursor + 1) % FX_CAP;
    if (!p.live) return p;
  }
  // all live: recycle the one we land on (bounded, never grows)
  const p = pool[poolCursor];
  poolCursor = (poolCursor + 1) % FX_CAP;
  return p;
}

export const fx = {
  /** gold chisel sparks at (x,y) */
  spark(x, y, n) {
    const N = clamp(n | 0 || 12, 1, 40);
    for (let i = 0; i < N; i++) {
      const p = alloc();
      const a = -Math.PI / 2 + (hash01(i, (x | 0) + (y | 0)) - 0.5) * 2.6;
      const sp = 90 + hash01(i, 77) * 320;
      p.live = true; p.k = K_SPARK;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.max = p.life = 0.32 + hash01(i, 78) * 0.34;
      p.s = 1.6 + hash01(i, 79) * 2.4;
      p.c = i & 1;
      p.rot = 0; p.vr = 0;
    }
  },
  /** laurel-leaf confetti across the top of the screen */
  laurel(W, H) {
    const N = 34;
    for (let i = 0; i < N; i++) {
      const p = alloc();
      p.live = true; p.k = K_LEAF;
      p.x = hash01(i, 51) * W;
      p.y = -20 - hash01(i, 52) * H * 0.35;
      p.vx = (hash01(i, 53) - 0.5) * 60;
      p.vy = 70 + hash01(i, 54) * 120;
      p.max = p.life = 2.6 + hash01(i, 55) * 1.8;
      p.s = 7 + hash01(i, 56) * 9;
      p.rot = hash01(i, 57) * TAU;
      p.vr = (hash01(i, 58) - 0.5) * 3.4;
      p.c = i & 1;
    }
  },
  /** slow warm dust motes (ambient burst; the backdrop has its own) */
  dust(W, H) {
    const N = 20;
    for (let i = 0; i < N; i++) {
      const p = alloc();
      p.live = true; p.k = K_DUST;
      p.x = hash01(i, 61) * W;
      p.y = hash01(i, 62) * H;
      p.vx = (hash01(i, 63) - 0.5) * 12;
      p.vy = -6 - hash01(i, 64) * 14;
      p.max = p.life = 3 + hash01(i, 65) * 4;
      p.s = 1 + hash01(i, 66) * 2;
      p.rot = 0; p.vr = 0; p.c = 0;
    }
  },
  update(dt) {
    const d = clamp(dt || 0, 0, 0.05);
    for (let i = 0; i < FX_CAP; i++) {
      const p = pool[i];
      if (!p.live) continue;
      p.life -= d;
      if (p.life <= 0) { p.live = false; continue; }
      if (p.k === K_SPARK) {
        p.vy += 900 * d;
        p.vx *= 0.96;
      } else if (p.k === K_LEAF) {
        p.vx += Math.sin(p.life * 3 + p.rot) * 26 * d;
        p.vy += 60 * d;
        if (p.vy > 190) p.vy = 190;
        p.rot += p.vr * d;
      }
      p.x += p.vx * d;
      p.y += p.vy * d;
    }
  },
  /** ~5 batched fills total. No shadowBlur, no per-particle save/restore. */
  draw(ctx) {
    // sparks (2 colour groups, quads)
    for (let c = 0; c < 2; c++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < FX_CAP; i++) {
        const p = pool[i];
        if (!p.live || p.k !== K_SPARK || p.c !== c) continue;
        const f = p.life / p.max;
        const s = p.s * (0.35 + f * 0.65);
        ctx.rect(p.x - s * 0.5, p.y - s * 0.5, s, s * 1.7);
        any = true;
      }
      if (any) {
        ctx.fillStyle = c ? 'rgba(255,248,205,0.95)' : withAlpha(THEME.gold, 0.9);
        ctx.fill();
      }
    }
    // leaves (2 colour groups, rotated quads computed by hand)
    for (let c = 0; c < 2; c++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < FX_CAP; i++) {
        const p = pool[i];
        if (!p.live || p.k !== K_LEAF || p.c !== c) continue;
        leafInto(ctx, p.x, p.y, p.s, p.s * 0.42, p.rot);
        any = true;
      }
      if (any) {
        ctx.fillStyle = c ? 'rgba(122,170,90,0.85)' : 'rgba(206,232,150,0.9)';
        ctx.fill();
      }
    }
    // dust (one fill)
    let anyD = false;
    ctx.beginPath();
    for (let i = 0; i < FX_CAP; i++) {
      const p = pool[i];
      if (!p.live || p.k !== K_DUST) continue;
      ctx.rect(p.x, p.y, p.s, p.s);
      anyD = true;
    }
    if (anyD) {
      ctx.fillStyle = 'rgba(255,232,190,0.35)';
      ctx.fill();
    }
  },
  clear() {
    for (let i = 0; i < FX_CAP; i++) pool[i].live = false;
  },
  /** live count — handy for the perf harness / debugging */
  count() {
    let n = 0;
    for (let i = 0; i < FX_CAP; i++) if (pool[i].live) n++;
    return n;
  }
};
