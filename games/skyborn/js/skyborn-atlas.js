// Paints the parchment Atlas from the same heightmap the 3D world uses. bounds = { u0, u1, v0, v1 } (default whole world).
import { height, weights, colorAt, forestAt, lavaChannel, RIVER, WIND, LANDMARKS, PLACES, SKY_ISLES, LAKE, WORLD, hash2 } from './skyborn-worldgen.js';

const PARCH = [0.94, 0.9, 0.8];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function project(b, W, H) {
  const B = b || { u0: -1, u1: 1, v0: -1, v1: 1 };
  return { X: u => (u - B.u0) / (B.u1 - B.u0) * W, Y: v => (v - B.v0) / (B.v1 - B.v0) * H, U: x => B.u0 + x / W * (B.u1 - B.u0), V: y => B.v0 + y / H * (B.v1 - B.v0), B };
}

export function paintAtlas(cv, bounds, opts = {}) {
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d'), { X, Y, U, V, B } = project(bounds, W, H);
  const zoom = 2 / (B.u1 - B.u0);
  const s = 2, w = Math.ceil(W / s), h = Math.ceil(H / s), gw = w + 2;
  const g = new Float32Array(gw * (h + 2));
  for (let j = 0; j < h + 2; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = height(U((i - 1) * s), V((j - 1) * s));
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const oc = off.getContext('2d'), img = oc.createImageData(w, h), d = img.data;
  const mpp = (B.u1 - B.u0) / 2 * WORLD.W / w, band = Math.max(40, 220 / zoom);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j + 1) * gw + (i + 1), hv = g[k], u = U(i * s), v = V(j * s);
    const dx = (g[k + 1] - g[k - 1]) / (2 * mpp), dz = (g[k + gw] - g[k - gw]) / (2 * mpp);
    const slope = Math.hypot(dx, dz), ww = weights(u, v);
    let c;
    if (hv < 0) {
      c = mix([0.78, 0.86, 0.84], [0.5, 0.64, 0.7], Math.min(1, -hv / 60));
      if (ww[4] > 0.3 && hv > -25) c = mix(c, [0.62, 0.86, 0.82], 0.5);
      c = mix(c, PARCH, 0.25);
    } else {
      c = mix(colorAt(u, v, hv, slope, ww), PARCH, 0.3);
      const shade = Math.max(0.55, Math.min(1.3, 1 + (-dx * 0.8 - dz * 0.6) * 1.8));
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      const bd = Math.floor(hv / band);
      if (bd !== Math.floor(g[k + 1] / band) || bd !== Math.floor(g[k + gw] / band)) c = mix(c, [0.36, 0.28, 0.2], 0.2);
    }
    if ((hv >= 0) !== (g[k + 1] >= 0) || (hv >= 0) !== (g[k + gw] >= 0)) c = [0.3, 0.24, 0.18];
    const grain = 0.96 + 0.08 * hash2(i, j), o = (j * w + i) * 4;
    d[o] = Math.min(255, c[0] * 255 * grain); d[o + 1] = Math.min(255, c[1] * 255 * grain); d[o + 2] = Math.min(255, c[2] * 255 * grain); d[o + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, W, H);
  const at = (x, y) => g[(Math.min(h, Math.max(0, Math.round(y / s))) + 1) * gw + Math.min(w, Math.max(0, Math.round(x / s))) + 1];

  ctx.strokeStyle = 'rgba(70,95,110,0.45)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (let y = 8; y < H; y += 13) for (let x = 6; x < W; x += 17) {
    const jx = x + (hash2(x, y) - 0.5) * 10, jy = y + (hash2(y, x) - 0.5) * 6, hv = at(jx, jy);
    if (hv < -6 && hv > -40 && hash2(x * 3, y) > 0.45) { ctx.beginPath(); ctx.arc(jx, jy + 3, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  }
  ctx.lineJoin = 'round';
  const riverPath = () => { ctx.beginPath(); RIVER.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); };
  riverPath(); ctx.strokeStyle = 'rgba(60,90,110,0.55)'; ctx.lineWidth = 2 + 1.5 * zoom; ctx.stroke();
  riverPath(); ctx.strokeStyle = 'rgba(150,200,215,0.95)'; ctx.lineWidth = 1 + 1.2 * zoom; ctx.stroke();
  const rm = LAKE.r * WORLD.D / 2 * 0.85, lrx = rm / (WORLD.W / 2 * (B.u1 - B.u0)) * W, lry = rm / (WORLD.D / 2 * (B.v1 - B.v0)) * H;
  ctx.beginPath(); ctx.ellipse(X(LAKE.u), Y(LAKE.v), lrx, lry, 0, 0, 7);
  ctx.fillStyle = 'rgba(150,200,215,0.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(60,90,110,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();

  const step = 9;
  for (let y = 12; y < H - 10; y += step) for (let x = 10; x < W - 10; x += step) {
    const jx = x + (hash2(x, y * 7) - 0.5) * 7, jy = y + (hash2(y, x * 5) - 0.5) * 7, u = U(jx), v = V(jy), hv = at(jx, jy);
    if (hv < 10) continue;
    const ww = weights(u, v), f = forestAt(u, v, ww), thr = 0.56 * (ww[0] + ww[1] * 0.8);
    if (f > thr && f > 0.12 && (ww[1] < 0.5 || hv < 1000)) {
      const r = 2.6 + hash2(jx | 0, jy | 0) * 1.6;
      ctx.beginPath(); ctx.arc(jx, jy, r, 0, 7); ctx.fillStyle = ww[1] > 0.4 ? 'rgb(70,100,82)' : 'rgb(84,120,58)'; ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,25,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(jx, jy + r); ctx.lineTo(jx, jy + r + 2.5); ctx.stroke();
    }
  }
  const mt = zoom > 1.5 ? 260 : 750;
  for (let y = 16; y < H - 10; y += 26) for (let x = 14; x < W - 14; x += 30) {
    if (hash2(x * 11, y * 13) < 0.35) continue;
    const jx = x + (hash2(x, y + 3) - 0.5) * 12, jy = y + (hash2(y + 9, x) - 0.5) * 10, hv = at(jx, jy);
    if (hv < mt) continue;
    const ww = weights(U(jx), V(jy)), sz = Math.min(22, 8 + (hv - mt) / 110), snowy = ww[1] > 0.4 && hv > 900;
    ctx.beginPath(); ctx.moveTo(jx - sz * 0.75, jy + sz * 0.45); ctx.lineTo(jx, jy - sz * 0.6); ctx.lineTo(jx + sz * 0.75, jy + sz * 0.45); ctx.closePath();
    ctx.fillStyle = ww[3] > 0.4 ? 'rgb(92,72,64)' : ww[2] > 0.4 ? 'rgb(120,116,132)' : ww[0] > 0.5 ? 'rgb(150,170,110)' : 'rgb(170,155,128)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(jx, jy - sz * 0.6); ctx.lineTo(jx + sz * 0.75, jy + sz * 0.45); ctx.lineTo(jx + sz * 0.1, jy + sz * 0.45); ctx.closePath(); ctx.fillStyle = 'rgba(40,30,25,0.35)'; ctx.fill();
    if (snowy) { ctx.beginPath(); ctx.moveTo(jx - sz * 0.28, jy - sz * 0.15); ctx.lineTo(jx, jy - sz * 0.6); ctx.lineTo(jx + sz * 0.28, jy - sz * 0.15); ctx.closePath(); ctx.fillStyle = 'rgba(250,252,255,0.95)'; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(jx - sz * 0.75, jy + sz * 0.45); ctx.lineTo(jx, jy - sz * 0.6); ctx.lineTo(jx + sz * 0.75, jy + sz * 0.45); ctx.strokeStyle = 'rgba(50,38,28,0.8)'; ctx.lineWidth = 1.1; ctx.stroke();
  }
  ctx.save(); ctx.shadowColor = 'rgba(255,120,40,0.9)'; ctx.shadowBlur = 6;
  for (let y = 6; y < H; y += 4) for (let x = 6; x < W; x += 4) {
    const u = U(x), v = V(y), hv = at(x, y);
    if (hv > 0 && hv < 220 && weights(u, v)[3] > 0.45 && lavaChannel(u, v)) { ctx.fillStyle = 'rgba(245,120,45,0.9)'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
  }
  ctx.restore();
  PLACES.filter(p => ['city', 'town', 'village', 'hamlet'].includes(p.kind)).forEach(p => {
    const n = Math.round(6 + p.size * 40 * Math.min(2, zoom * 0.6)), rad = (6 + p.size * 26) * Math.min(2.2, zoom * 0.5);
    for (let i = 0; i < n; i++) { const a = hash2(i, p.u * 999 | 0) * 6.28, r = Math.sqrt(hash2(p.v * 999 | 0, i)) * rad; const x = X(p.u) + Math.cos(a) * r, y = Y(p.v) + Math.sin(a) * r * 0.8;
      ctx.fillStyle = i % 3 ? 'rgb(170,80,55)' : 'rgb(196,110,70)'; ctx.fillRect(x - 1.8, y - 1.4, 3.6, 2.8); ctx.strokeStyle = 'rgba(50,30,20,.6)'; ctx.lineWidth = 0.6; ctx.strokeRect(x - 1.8, y - 1.4, 3.6, 2.8); }
    if (p.kind === 'city') { ctx.beginPath(); ctx.arc(X(p.u), Y(p.v), rad * 0.85, 0, 7); ctx.strokeStyle = 'rgba(70,50,35,.85)'; ctx.lineWidth = 2; ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]); }
  });
  ctx.setLineDash([2, 7]); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(190,140,40,0.85)';
  WIND.forEach(pts => {
    ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (let i = 1; i < pts.length - 1; i++) { const mx = (X(pts[i][0]) + X(pts[i + 1][0])) / 2, my = (Y(pts[i][1]) + Y(pts[i + 1][1])) / 2; ctx.quadraticCurveTo(X(pts[i][0]), Y(pts[i][1]), mx, my); }
    const L = pts[pts.length - 1]; ctx.lineTo(X(L[0]), Y(L[1])); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(170,130,50,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(X(SKY_ISLES.u), Y(SKY_ISLES.v), 0.13 / (B.u1 - B.u0) * W, 0.1 / (B.v1 - B.v0) * H, 0, 0, 7); ctx.fillStyle = 'rgba(255,240,190,0.35)'; ctx.fill(); ctx.stroke(); ctx.restore();
  if (opts.frame === false) return { places: [] };
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(120,85,40,0)'); vg.addColorStop(1, 'rgba(110,75,35,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(70,50,30,0.7)'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, W - 16, H - 16); ctx.lineWidth = 1; ctx.strokeRect(14, 14, W - 28, H - 28);
  return { places: LANDMARKS.map(l => ({ ...l, x: X(l.u), y: Y(l.v) })) };
}
