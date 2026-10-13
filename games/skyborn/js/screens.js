// Skyborn overlay screens: Atlas, Aerie, hatch, favour dialog, pause, crash, ring results, 100% fanfare.
import { PLACES, REGION_BOUNDS, toWorld, toUV, weights } from './skyborn-worldgen.js';
import { paintAtlas, project } from './skyborn-atlas.js';
import { $, show, sfx, settings, setLevels, ensureAudio } from './ui.js';
import { vo, favVoice } from './voice.js';
import * as THREE from 'three';
import { buildDragon } from './skyborn-bestiary.js';

// Hatch cinematic: the new dragon bursts out of the egg, swoops round the camera and settles into a hero pose.
let HR = null;
function hatchStage() {
  if (HR) return HR;
  const cv = document.getElementById('hatchCv'), r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1333 / 690, 0.1, 100); cam.position.set(0, 1, 12); cam.lookAt(0, 0.6, 0);
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x40304a, 1.6)); const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-4, 6, 8); scene.add(key); const rim = new THREE.DirectionalLight(0x9fd8ff, 1.6); rim.position.set(6, 3, -6); scene.add(rim);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  HR = { r, scene, cam, glowTex, dragon: null, sparks: [], raf: 0 };
  const fit = () => { const w = cv.clientWidth || 1333, h = cv.clientHeight || 690; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(cv); fit(); return HR;
}

export const DR = {
  Breeze: { c: 'oklch(0.74 0.12 150)', c2: 'oklch(0.55 0.11 160)', glow: 'oklch(0.62 0.1 160)', power: 'Quick and nimble, but too young for the lava’s heat', breath: 'Gusts of wind', opens: 'Hearthvale', icon: 'air' },
  Ember: { c: 'oklch(0.7 0.17 42)', c2: 'oklch(0.52 0.17 30)', glow: 'oklch(0.6 0.18 40)', power: 'Heat-proof: fly right over lava', breath: 'Fireballs', opens: 'Cinder Peaks', icon: 'local_fire_department' },
  Frost: { c: 'oklch(0.9 0.05 230)', c2: 'oklch(0.66 0.1 235)', glow: 'oklch(0.62 0.12 235)', power: 'Blizzard-proof: fly straight through the snow wall', breath: 'Ice shards', opens: 'Frostfang Heights', icon: 'ac_unit' },
  Storm: { c: 'oklch(0.6 0.16 300)', c2: 'oklch(0.4 0.15 290)', glow: 'oklch(0.5 0.17 290)', power: 'Lightning Dash: smash through storm walls', breath: 'Lightning arc', opens: 'Stormcrown', icon: 'bolt' },
  Tide: { c: 'oklch(0.76 0.11 180)', c2: 'oklch(0.52 0.1 165)', glow: 'oklch(0.55 0.11 185)', power: 'Dive underwater and swim', breath: 'Water jet', opens: 'Sunken Reach', icon: 'water_drop' },
  Gold: { c: 'oklch(0.88 0.13 88)', c2: 'oklch(0.66 0.14 70)', glow: 'oklch(0.7 0.15 75)', power: 'Fly higher than any dragon, up to the Sky Isles', breath: 'Sunbeam', opens: 'the Sky Isles', icon: 'wb_sunny' }
};
export const ORDER = ['Breeze', 'Ember', 'Storm', 'Frost', 'Tide', 'Gold'];
export const RNAME = { hearthvale: 'Hearthvale', cinder: 'Cinder Peaks', frostfang: 'Frostfang', stormcrown: 'Stormcrown', reach: 'Sunken Reach', sky: 'Sky Isles', world: 'Emberreach' };
const UPS = [['wings', 'Wings', 'More stamina', 'air'], ['armour', 'Armour', 'One more heart', 'shield'], ['breath', 'Breath', 'Stronger breath', 'local_fire_department']], COST = [60, 120, 200];
const VIS = { home: ['home', 'radial-gradient(circle at 35% 30%,oklch(0.82 0.16 65),oklch(0.62 0.2 36))', 40], city: ['fort', 'oklch(0.42 0.06 55)', 32], town: ['holiday_village', 'oklch(0.48 0.06 55)', 28], village: ['cottage', 'oklch(0.52 0.06 55)', 24], hamlet: ['cottage', 'oklch(0.58 0.05 60)', 22],
  roost: ['flight_land', 'oklch(0.68 0.13 235)', 32], tower: ['castle', 'radial-gradient(circle,oklch(0.94 0.13 90),oklch(0.78 0.16 70))', 32], camp: ['flag', 'oklch(0.6 0.19 28)', 28], vista: ['landscape', 'oklch(0.6 0.1 170)', 26], statue: ['auto_awesome', 'oklch(0.62 0.03 70)', 22],
  chest: ['inventory_2', 'oklch(0.55 0.09 60)', 22], favour: ['priority_high', 'oklch(0.82 0.16 85)', 26], ring: ['trip_origin', 'oklch(0.78 0.15 85)', 26], nest: ['egg', 'oklch(0.8 0.08 230)', 28], champion: ['skull', 'oklch(0.45 0.12 25)', 28], landmark: ['star', 'oklch(0.6 0.08 80)', 20] };

export const regionPlaces = r => PLACES.filter(p => p.r === r && p.kind !== 'champion');
// The region's champion counts as one more item, and 100% always needs it beaten.
export function regionPct(save, r) {
  const ps = regionPlaces(r), hasChamp = PLACES.some(p => p.r === r && p.kind === 'champion'), total = ps.length + (hasChamp ? 1 : 0); if (!total) return 0;
  const beaten = hasChamp && save.champs && save.champs[r], got = ps.filter(p => save.found[p.id]).length + (beaten ? 1 : 0), pct = Math.round(got / total * 100);
  return hasChamp && !beaten ? Math.min(99, pct) : pct;
}

export function initScreens(G) {
  const cache = {}; const VW = 1333, VH = 690, view = { cu: 0, cv: 0, z: 1 }; let WORLDIMG = null, FOGIMG = null, markEls = [], raf = 0, dragged = false;
  const GW = G.GW, GH = G.GH, RIDS = ['hearthvale', 'frostfang', 'stormcrown', 'cinder', 'reach'];
  const bounds = () => { const s = 1 / view.z; return { u0: view.cu - s, u1: view.cu + s, v0: view.cv - s, v1: view.cv + s }; };
  function clampView() { view.z = Math.min(5, Math.max(1, view.z)); const m = 1 - 1 / view.z + 0.04; view.cu = Math.max(-m, Math.min(m, view.cu)); view.cv = Math.max(-m, Math.min(m, view.cv)); }
  const paintImg = (B, w = VW, h = VH) => { const off = document.createElement('canvas'); off.width = w; off.height = h; paintAtlas(off, B, { frame: false }); return off; };
  function paintFog() {
    const W = 1440, H = 750, cv = FOGIMG || document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgb(236,231,222)'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { const x = (i * 97) % W, y = (i * 53) % H, r = 30 + (i % 7) * 10, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
    c.globalCompositeOperation = 'destination-out'; const cw = W / GW * 1.5;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (G.save.fog[j * GW + i]) { const x = (i + 0.5) / GW * W, y = (j + 0.5) / GH * H, g = c.createRadialGradient(x, y, cw * 0.2, x, y, cw); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - cw, y - cw, cw * 2, cw * 2); }
    c.globalCompositeOperation = 'source-over'; FOGIMG = cv;
  }
  const blitWorld = (c, img, B) => { const W = img.width, H = img.height; c.drawImage(img, (B.u0 + 1) / 2 * W, (B.v0 + 1) / 2 * H, (B.u1 - B.u0) / 2 * W, (B.v1 - B.v0) / 2 * H, 0, 0, VW, VH); };
  let queued = null;
  function needRegion(r) { if (cache[r] || queued) return; queued = r; setTimeout(() => { cache[r] = paintImg(REGION_BOUNDS[r]); queued = null; render(); }, 60); }
  function render() {
    raf = 0; const c = $('atlasCv').getContext('2d'), B = bounds(), { X, Y } = project(B, VW, VH);
    c.fillStyle = 'rgb(233,223,201)'; c.fillRect(0, 0, VW, VH);
    if (WORLDIMG) blitWorld(c, WORLDIMG, B);
    if (view.z > 1.25) { c.save(); c.globalAlpha = Math.min(1, (view.z - 1.25) / 0.5);
      for (const r of Object.keys(REGION_BOUNDS)) { const R = REGION_BOUNDS[r]; if (R.u1 < B.u0 || R.u0 > B.u1 || R.v1 < B.v0 || R.v0 > B.v1) continue; if (!cache[r]) { needRegion(r); continue; } const x0 = X(R.u0), y0 = Y(R.v0); c.drawImage(cache[r], x0, y0, X(R.u1) - x0, Y(R.v1) - y0); }
      c.restore(); }
    if (FOGIMG) blitWorld(c, FOGIMG, B);
    const vg = c.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VW * 0.62); vg.addColorStop(0, 'rgba(120,85,40,0)'); vg.addColorStop(1, 'rgba(110,75,35,0.4)'); c.fillStyle = vg; c.fillRect(0, 0, VW, VH);
    c.strokeStyle = 'rgba(70,50,30,0.7)'; c.lineWidth = 3; c.strokeRect(8, 8, VW - 16, VH - 16); c.lineWidth = 1; c.strokeRect(14, 14, VW - 28, VH - 28);
    placeMarks(X, Y, B); header();
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  function header() {
    let r, pct;
    if (view.z < 1.45) { r = 'world'; pct = Math.round(RIDS.reduce((a, k) => a + regionPct(G.save, k), 0) / 5); }
    else { const w = weights(view.cu, view.cv); r = RIDS[w.indexOf(Math.max(...w))]; if (view.cv < -0.4 && Math.abs(view.cu) < 0.3 && G.save.open.includes('sky')) r = 'sky'; pct = regionPct(G.save, r); }
    $('atlasRegion').textContent = RNAME[r] + (r !== 'world' && !G.save.open.includes(r) ? ' 🔒' : ''); $('atlasPct').textContent = pct + '%';
    $('atlasRing').style.background = `conic-gradient(oklch(0.62 0.12 135) ${pct * 3.6}deg,oklch(0.85 0.03 85) 0deg)`;
  }
  const RLAB = { hearthvale: [0.06, 0.3], frostfang: [-0.64, -0.5], stormcrown: [0.5, -0.52], cinder: [-0.64, 0.6], reach: [0.5, 0.62], sky: [0, -0.6] };
  function buildMarks() {
    const box = $('atlasMarks'); box.innerHTML = ''; markEls = [];
    Object.entries(RLAB).forEach(([r, [u, v]]) => { const el = document.createElement('div'); el.className = 'm rl'; const open = G.save.open.includes(r); el.innerHTML = `<span class="rname">${RNAME[r]}</span>${open ? '' : '<span class="rlock"><span class="ms">lock</span>locked</span>'}`; box.appendChild(el); markEls.push({ el, u, v, tier: 'region' }); });
    PLACES.forEach(p => {
      if (p.kind === 'champion') return;
      const seen = G.save.seen[p.id], found = G.save.found[p.id]; if (!seen && !found) return;
      const v = VIS[p.kind] || VIS.landmark, q = !found, lit = p.kind === 'tower' ? G.save.lit[p.id] : p.kind === 'roost' ? G.save.roosts[p.id] : true;
      if (p.kind === 'favour' && G.save.favours[p.id] === 'done') return;
      const el = document.createElement('div'); el.className = 'm';
      const sz = q ? 28 : v[2], bg = q ? 'oklch(0.6 0.2 320)' : lit ? v[1] : 'oklch(0.85 0.03 85)';
      if (q) el.classList.add('q');
      el.innerHTML = `<span class="d" style="width:${sz}px;height:${sz}px;background:${bg};${p.kind === 'tower' && lit ? 'color:oklch(0.3 0.05 50);box-shadow:0 0 0 2px oklch(0.35 0.05 55),0 0 20px oklch(0.85 0.16 80)' : ''}">${q ? '?' : `<span class="ms" style="font-size:${Math.round(sz * 0.6)}px">${v[0]}</span>`}</span>` + (!q && ['city', 'town', 'village', 'hamlet', 'home', 'roost', 'tower', 'landmark', 'camp'].includes(p.kind) ? `<span class="l ${['city', 'town', 'home'].includes(p.kind) ? 'set' : ''}">${p.name}</span>` : '');
      if (p.kind === 'nest' && !q && PLACES.filter(t => t.kind === 'tower' && t.r === p.r).every(t => G.save.lit[t.id]) && (!G.save.champs[p.r] || (G.save.egg && G.save.egg.r === p.r))) { el.classList.add('nestGlow'); el.insertAdjacentHTML('afterbegin', `<span class="npulse" style="width:${sz}px;height:${sz}px"></span><span class="npulse n2" style="width:${sz}px;height:${sz}px"></span>`); }
      if (q) { if (G.waypoint && G.waypoint.id === p.id) el.querySelector('.d').classList.add('way'); el.querySelector('.d').onclick = () => { G.setWaypoint(G.waypoint && G.waypoint.id === p.id ? null : p); buildMarks(); render(); }; }
      else if (p.kind === 'roost' && G.save.roosts[p.id] || p.kind === 'home') el.querySelector('.d').onclick = () => { sfx.tap(); const t = $('atlasToast'); t.innerHTML = `<span>Fly to ${p.name}?</span><button class="primary"><span class="ms">flight</span><b>Fly there</b></button><button class="ghost dark"><b>Stay</b></button>`; show('atlasToast'); t.children[1].onclick = () => { show('atlasToast', false); closeAtlas(); G.travel(p); }; t.children[2].onclick = () => show('atlasToast', false); };
      const big = ['city', 'town', 'home', 'nest'].includes(p.kind) || (G.waypoint && G.waypoint.id === p.id);
      box.appendChild(el); markEls.push({ el, u: p.u, v: p.v, tier: big ? 'big' : 'small', label: el.querySelector('.l') });
    });
    const [pu, pv] = toUV(G.world.fly.pos.x, G.world.fly.pos.z), me = document.createElement('div'); me.className = 'm you';
    me.innerHTML = `<span class="pulse"></span><span class="pulse p2"></span><span class="me"><span class="ms" style="transform:rotate(${(180 - G.world.fly.yaw * 180 / Math.PI).toFixed(0)}deg)">navigation</span></span>`; box.prepend(me); markEls.push({ el: me, u: pu, v: pv, tier: 'me' });
  }
  function placeMarks(X, Y) {
    const z = view.z, world = z < 1.45;
    for (const m of markEls) {
      const x = X(m.u), y = Y(m.v), inView = x > -60 && y > -60 && x < VW + 60 && y < VH + 60;
      const vis = inView && (m.tier === 'me' || m.tier === 'big' || (m.tier === 'region' ? z < 1.75 : !world));
      m.el.style.display = vis ? '' : 'none'; if (!vis) continue;
      m.el.style.left = (x / VW * 100).toFixed(3) + '%'; m.el.style.top = (y / VH * 100).toFixed(3) + '%';
      if (m.tier === 'region') m.el.style.opacity = world ? 1 : Math.max(0, (1.75 - z) / 0.3);
      if (m.label) m.label.style.display = z < 1.7 && !m.label.classList.contains('set') ? 'none' : '';
    }
  }
  // Drag to pan, pinch / wheel to zoom
  const pts = new Map(); let last = null, startD = 0, startZ = 1, downAt = null;
  const toPx = (x, y) => { const r = $('atlas').getBoundingClientRect(); return [(x - r.left) / r.width * VW, (y - r.top) / r.height * VH]; };
  function zoomAt(px, py, nz) { const s0 = 1 / view.z, u = view.cu - s0 + px / VW * 2 * s0, v = view.cv - s0 + py / VH * 2 * s0; view.z = nz; clampView(); const s1 = 1 / view.z; view.cu = u - (px / VW * 2 - 1) * s1; view.cv = v - (py / VH * 2 - 1) * s1; clampView(); schedule(); }
  const atlasEl = $('atlas');
  atlasEl.addEventListener('pointerdown', e => {
    if (e.target.closest('#atlasClose,#atlasToast')) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) { dragged = false; downAt = [e.clientX, e.clientY]; }
    last = null; if (pts.size === 2) { const [a, b] = [...pts.values()]; startD = Math.hypot(a[0] - b[0], a[1] - b[1]); startZ = view.z; }
  });
  addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || G.menu !== 'atlas') return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) dragged = true;
    const vals = [...pts.values()], cx = vals.reduce((a, p) => a + p[0], 0) / vals.length, cy = vals.reduce((a, p) => a + p[1], 0) / vals.length;
    if (last) { const r = atlasEl.getBoundingClientRect(), s = 1 / view.z; view.cu -= (cx - last[0]) / r.width * 2 * s; view.cv -= (cy - last[1]) / r.height * 2 * s; clampView(); schedule(); }
    if (pts.size === 2 && startD > 0) { const [a, b] = vals, d = Math.hypot(a[0] - b[0], a[1] - b[1]), [px, py] = toPx(cx, cy); zoomAt(px, py, startZ * d / startD); }
    last = [cx, cy];
  });
  const up = e => { pts.delete(e.pointerId); last = null; if (pts.size < 2) startD = 0; };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  atlasEl.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  atlasEl.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = toPx(e.clientX, e.clientY); zoomAt(px, py, view.z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function openView(r) { const R = REGION_BOUNDS[r] || REGION_BOUNDS.hearthvale; view.cu = (R.u0 + R.u1) / 2; view.cv = (R.v0 + R.v1) / 2; view.z = 2 / Math.max(R.u1 - R.u0, R.v1 - R.v0); clampView(); }
  // Atlas key
  const KEY = [
    ['You are here', '<span class="d" style="background:oklch(0.62 0.2 36);border-color:#fff;outline:1.5px solid oklch(0.35 0.05 55)"><span class="ms">navigation</span></span>'],
    ['Unexplored · tap it', '<span class="d" style="background:oklch(0.6 0.2 320);border-color:#fff;outline:1.5px solid oklch(0.45 0.18 320)">?</span>'],
    ['Following', '<span class="d" style="background:oklch(0.68 0.13 235);border-color:#fff;outline:1.5px solid oklch(0.35 0.05 55)">?</span>'],
    ['Favour', '<span class="d" style="background:oklch(0.82 0.16 85);color:#2a1a20">!</span>'],
    null, 'Places',
    ['The Aerie', 'home'], ['City or town', 'city'], ['Village', 'village'], ['Roost · tap to fly', 'roost'], ['Roost, not lit', 'roost', true],
    null, 'Things to do',
    ['Tower, lit', 'tower'], ['Tower, not lit', 'tower', true], ['Egg Nest', 'nest'], ['Raider camp', 'camp'], ['Ring Run', 'ring'], ['Vista', 'vista'], ['Chest', 'chest'], ['Dragon statue', 'statue'],
    ['Wind stream', '<span class="line"></span>']
  ];
  KEY.unshift('Key');
  function buildKey() {
    $('atlasKey').innerHTML = KEY.map(k => {
      if (k === null) return '';
      if (typeof k === 'string') return `<h4>${k}</h4>`;
      const [label, v, off] = k; let icon = v;
      if (VIS[v]) { const vv = VIS[v]; icon = `<span class="d" style="background:${off ? 'oklch(0.85 0.03 85)' : vv[1]};color:${off ? 'oklch(0.45 0.06 55)' : v === 'tower' ? 'oklch(0.3 0.05 50)' : '#fff'}"><span class="ms">${vv[0]}</span></span>`; }
      return `<span class="k">${icon}<span>${label}</span></span>`;
    }).join('');
  }
  $('atlasKeyBtn').onclick = () => { sfx.tap(); if (!$('atlasKey').innerHTML) buildKey(); const on = $('atlasKey').classList.toggle('hidden') === false; $('atlasKeyBtn').classList.toggle('on', on); };
  function openAtlas() {
    if (!$('atlasKey').innerHTML) buildKey(); show('atlasKey'); const hint = $('atlasZoomHint'); hint.classList.remove('fade'); clearTimeout(hint._t); hint._t = setTimeout(() => hint.classList.add('fade'), 5000); G.menu = 'atlas'; show('atlas'); show('hud', false); show('atlasToast', false);
    const r0 = G.region || 'hearthvale', r = G.save.open.includes(r0) ? r0 : 'hearthvale'; openView(r);
    paintFog(); buildMarks();
    if (!WORLDIMG || !cache[r]) { const c = $('atlasCv').getContext('2d'); c.fillStyle = '#e9dfc9'; c.fillRect(0, 0, VW, VH); c.fillStyle = '#5a4a3a'; c.font = "900 28px 'Cinzel Decorative'"; c.textAlign = 'center'; c.fillText('Unrolling the map…', VW / 2, VH / 2);
      setTimeout(() => { if (!WORLDIMG) WORLDIMG = paintImg(null); if (!cache[r]) cache[r] = paintImg(REGION_BOUNDS[r]); render(); }, 40); }
    else render();
  }
  function closeAtlas() { show('atlas', false); show('atlasToast', false); G.menu = null; show('hud'); }
  $('atlasClose').onclick = () => { sfx.tap(); closeAtlas(); };

  // Aerie / roost roster
  let aerieFull = true, aTab = 'Saddle';
  const DECO = [['flowers', 'Flower boxes', 'Bright blooms round the edge', 'local_florist', 60], ['topiary', 'Dragon hedges', 'Bushes clipped like dragons', 'park', 90], ['bunting', 'Bunting', 'Strings of little flags', 'celebration', 110],
    ['lanterns', 'Lantern strings', 'Glowing lanterns at night', 'light', 140], ['banners', 'Dragon banners', 'One for every dragon you own', 'flag', 160], ['vane', 'Dragon weathervane', 'Spins on the hut roof', 'air', 180],
    ['fountain', 'Fountain', 'A splashing stone fountain', 'water_drop', 260], ['statue', 'Golden dragon statue', 'Shines in the sun', 'emoji_events', 380], ['treasure', 'Treasure hoard', 'A heap of gold and gems', 'savings', 500], ['fireworks', 'Fireworks', 'A show every time you land home', 'auto_awesome', 650]];
  function eggStyle(el, kind) { const d = DR[kind]; el.style.background = `radial-gradient(circle, rgba(255,255,255,0.45) 2.5px, transparent 3.5px) 0 0 / 26px 30px, radial-gradient(circle at 35% 28%, #fff 0%, ${d.c} 38%, ${d.c2} 100%)`; }
  function renderAerie() {
    const s = G.save; $('aGems').textContent = s.gems; $('aerieTitle').textContent = aerieFull ? 'The Aerie' : 'Roost';
    $('roster').innerHTML = ''; ORDER.forEach(n => { const own = s.dragons.includes(n), sel = s.dragon === n, d = DR[n], b = document.createElement('button');
      b.className = 'drow' + (sel ? ' sel' : ''); b.innerHTML = `<span class="sw" style="background:${own ? d.c : 'rgba(255,255,255,.12)'};box-shadow:0 0 0 3px ${sel ? 'oklch(0.8 0.15 65)' : 'rgba(255,255,255,.18)'}">${own ? '' : '?'}</span><span><b>${own ? n : '???'}</b><small>${own ? d.power : 'Not hatched yet'}</small></span>${sel ? '<span class="tag">Riding</span>' : own ? '' : '<span class="ms" style="margin-left:auto;opacity:.5">lock</span>'}`;
      b.onclick = () => { if (!own) return; sfx.tap(); s.dragon = n; G.world.setDragon(n); G.applyDragon(); G.persist(); renderAerie(); }; $('roster').appendChild(b); });
    $('ups').innerHTML = aerieFull ? '' : '<p style="font:700 16px/1.4 Nunito;opacity:.8">Saddle upgrades are at the Aerie.</p>';
    $('saddleTabs').classList.toggle('hidden', !aerieFull);
    $('saddleTabs').innerHTML = ['Saddle', 'Decorate'].map(t => `<button class="${aTab === t ? 'on' : ''}" data-t="${t}">${t === 'Saddle' ? s.dragon + "'s saddle" : 'Decorate the Aerie'}</button>`).join('');
    $('saddleTabs').querySelectorAll('button').forEach(b => b.onclick = () => { sfx.tap(); aTab = b.dataset.t; renderAerie(); });
    if (aerieFull && aTab === 'Decorate') { DECO.forEach(([k, name, fx, ic, cost]) => { const own = !!(s.deco || {})[k], can = !own && s.gems >= cost, r = document.createElement('div'); r.className = 'urow';
      r.innerHTML = `<span class="ic"><span class="ms">${ic}</span></span><span><b>${name}</b><small>${fx}</small></span><button class="${own ? 'own' : can ? '' : 'no'}">${own && k === 'fireworks' ? '<span class="ms" style="font-size:20px">play_arrow</span>Watch' : own ? '<span class="ms" style="font-size:20px">check</span>' : `<span class="ms" style="font-size:20px">diamond</span>${cost}`}</button>`;
      r.querySelector('button').onclick = () => { if (own && k === 'fireworks') { sfx.tap(); show('aerie', false); G.menu = null; show('hud'); G.deco.fireworks(); setTimeout(() => { if (!G.menu && G.world.fly.perch) openAerie(true); }, 5800); return; } if (!can) return; s.gems -= cost; s.deco = s.deco || {}; s.deco[k] = true; sfx.unlock(); G.buildDeco && G.buildDeco(); G.persist(); renderAerie(); }; $('ups').appendChild(r); }); }
    else if (aerieFull) UPS.forEach(([k, name, fx, ic]) => { const up = G.up(), lv = up[k], max = lv >= 3, cost = COST[lv], can = !max && s.gems >= cost, r = document.createElement('div'); r.className = 'urow';
      r.innerHTML = `<span class="ic"><span class="ms">${ic}</span></span><span><b>${name}</b><small>${fx}</small><span class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span></span><button class="${can ? '' : 'no'}">${max ? 'Max' : `<span class="ms" style="font-size:20px">diamond</span>${cost}`}</button>`;
      r.querySelector('button').onclick = () => { if (!can) return; s.gems -= cost; G.up()[k]++; sfx.ching(); G.applyDragon(); G.persist(); renderAerie(); }; $('ups').appendChild(r); });
    const next = ORDER.find(n => !s.dragons.includes(n)); if (next) eggStyle($('aEgg'), next);
    $('aEgg').style.opacity = G.carrying ? 1 : 0.35; $('nestCap').innerHTML = eggStep(s);
  }
  // Spell out the next step towards the next egg.
  function eggStep(s) {
    const ORD = ['hearthvale', 'cinder', 'stormcrown', 'frostfang', 'reach', 'sky'], HATCH = { hearthvale: 'Ember', cinder: 'Storm', stormcrown: 'Frost', frostfang: 'Tide', reach: 'Gold' };
    const line = (a, b) => `${a}${b ? `<small style="display:block;font:700 15px/1.35 Nunito;opacity:.85;margin-top:6px">${b}</small>` : ''}`;
    if (s.egg) { const rn = RNAME[s.egg.r] || 'the region'; return s.egg.carrying || G.carrying ? line('Your egg is warm!', 'Fly it home and land at the Aerie to hatch it.') : line(`An egg waits in ${rn}!`, `Fly to the Egg Nest in ${rn} and grab it.`); }
    const r = ORD.find((k, n) => s.open.includes(k) && ORD[n + 1] && !s.open.includes(ORD[n + 1]));
    if (!r) return s.champs.sky ? line('Every dragon has hatched.', 'Emberreach is free. Fly anywhere you like!') : line('Every dragon has hatched.', 'Fly Gold up to the Sky Isles and beat the Pirate King!');
    const towers = PLACES.filter(p => p.kind === 'tower' && p.r === r), lit = towers.filter(p => s.lit[p.id]).length, who = HATCH[r];
    if (lit < towers.length) return line('The next egg', `Light the Dragon Towers in ${RNAME[r]}: ${lit} of ${towers.length} lit.`);
    if (!s.champs[r]) return line('The next egg', `All ${towers.length} towers lit! Beat the champion at the Egg Nest in ${RNAME[r]}.`);
    return line('The next egg', `Grab the egg from the Egg Nest in ${RNAME[r]}.`);
  }
  function openAerie(full = true) { aerieFull = full; G.menu = 'aerie'; show('aerie'); show('hud', false); renderAerie(); }
  $('aerieClose').onclick = () => { sfx.tap(); show('aerie', false); G.menu = null; show('hud'); G.takeOff(); };

  // Hatch (cinematic)
  function hatch(kind, title, onDone) {
    G.menu = 'hatch'; show('hatch'); show('hud', false); const d = DR[kind], egg = $('hatchEgg'), card = $('hatchCard'); let taps = 0;
    $('hatch').style.setProperty('--glow', d.glow); $('hatch').style.setProperty('--dc', d.c);
    egg.style.setProperty('--egg', `radial-gradient(circle, rgba(255,255,255,0.45) 2.5px, transparent 3.5px) 0 0 / 26px 30px, radial-gradient(circle at 35% 28%, #fff 0%, ${d.c} 38%, ${d.c2} 100%)`);
    egg.className = ''; egg.style.opacity = 1; card.classList.remove('show'); $('hatchCap').textContent = 'Tap the egg!'; vo('hatch-tap', 3);
    $('hName').textContent = kind; $('hPower').textContent = d.power; $('hBreath').textContent = 'Breath: ' + d.breath; $('hOpens').textContent = 'Opens ' + d.opens; $('hFlyLbl').textContent = 'Fly with ' + kind;
    card.querySelector('.kick').lastChild.textContent = title || 'A new dragon';
    egg.onclick = () => { if (taps >= 3) return; taps++; sfx.crack(); egg.style.transform = `rotate(${taps % 2 ? 14 : -14}deg)`; setTimeout(() => { egg.style.transform = 'rotate(0deg)'; }, 160);
      $('hatchCap').textContent = taps === 1 ? 'It wobbled! Again!' : taps === 2 ? 'Crack…' : 'Crack!'; vo(taps === 1 ? 'hatch-wobble' : taps === 2 ? 'hatch-crack1' : 'hatch-crack2', 3);
      if (taps === 3) { egg.classList.add('crack'); sfx.unlock(); setTimeout(() => { egg.style.opacity = 0; $('hatchCap').textContent = ''; }, 500); emerge(kind, () => { card.classList.add('show'); vo('hatch-' + kind.toLowerCase(), 3); }); } };
    $('hFly').onclick = () => { sfx.tap(); stopStage(); show('hatch', false); G.menu = null; show('hud'); onDone && onDone(); };
  }
  function stopStage() { if (!HR) return; cancelAnimationFrame(HR.raf); HR.raf = 0; if (HR.dragon) HR.scene.remove(HR.dragon); HR.dragon = null; HR.sparks.forEach(s => HR.scene.remove(s.m)); HR.sparks = []; HR.r.clear(); }
  function emerge(kind, onCard) {
    const S = hatchStage(); stopStage();
    const d = buildDragon(kind, { noRider: true }), base = 0.42; d.scale.setScalar(0.01); S.scene.add(d); S.dragon = d;
    const egg = new THREE.Vector3(0, 0.75, 0), hero = new THREE.Vector3(3.9, 0.15, 0.5);
    const path = new THREE.CatmullRomCurve3([egg.clone(), new THREE.Vector3(-1.2, 2.2, 2.5), new THREE.Vector3(-3.4, 1.4, 5.5), new THREE.Vector3(0.6, -0.4, 6.5), new THREE.Vector3(4.6, 1.8, 2.6), hero.clone()]);
    const sm = new THREE.SpriteMaterial({ map: S.glowTex, color: new THREE.Color({ Breeze: 0x8af0b0, Ember: 0xff9a40, Frost: 0x9fd8ff, Storm: 0xb89aff, Tide: 0x6fe6d6, Gold: 0xffe08a }[kind] || 0xffffff), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 46; i++) { const m = new THREE.Sprite(sm.clone()); m.position.copy(egg); const v = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 4); m.scale.setScalar(0.3 + Math.random() * 0.5); S.scene.add(m); S.sparks.push({ m, v, life: 1 + Math.random() * 0.8 }); }
    let t0 = performance.now(), last = t0, carded = false; const look = new THREE.Vector3(), P = new THREE.Vector3();
    const tick = now => {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (t < 0.7) { const k = t / 0.7; d.scale.setScalar(base * (0.05 + 0.95 * (1 - Math.pow(1 - k, 3)))); d.position.copy(egg); d.rotation.set(0, k * Math.PI * 2, 0); d.userData.update(t, { flap: 1 }); }
      else if (t < 3.4) { const k = Math.min(1, (t - 0.7) / 2.7), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; path.getPointAt(e, P); path.getPointAt(Math.min(1, e + 0.02), look); d.scale.setScalar(base); d.position.copy(P); if (e < 0.99) d.lookAt(look); d.rotateZ(Math.sin(t * 2) * 0.35); d.userData.update(t, { flap: 1 }); }
      else { d.position.set(hero.x, hero.y + Math.sin(t * 1.6) * 0.12, hero.z); d.rotation.set(0.05, -0.75 + Math.sin(t * 0.5) * 0.08, 0); d.userData.update(t, { flap: 0.35 }); }
      if (!carded && t > 2.6) { carded = true; onCard(); }
      for (let i = S.sparks.length - 1; i >= 0; i--) { const s = S.sparks[i]; s.life -= dt; s.m.position.addScaledVector(s.v, dt); s.v.multiplyScalar(0.96); s.m.material.opacity = Math.max(0, s.life); if (s.life <= 0) { S.scene.remove(s.m); S.sparks.splice(i, 1); } }
      S.r.render(S.scene, S.cam); S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }

  // Favour dialog
  function dialog(f, onYes) { vo(favVoice(f.id), 3);
    G.menu = 'dialog'; show('dialog'); $('dlgName').textContent = f.name; $('dlgAt').textContent = f.at || ''; $('dlgText').textContent = '“' + f.quest + '”'; $('dlgReward').textContent = 'Reward: 40 gems';
    const img = $('dlgImg'), src = (G.portraits || {})[f.id]; img.style.display = src ? '' : 'none'; if (src) img.src = src;
    $('dlgYes').onclick = () => { sfx.unlock(); show('dialog', false); G.menu = null; onYes(); };
    $('dlgNo').onclick = () => { sfx.tap(); show('dialog', false); G.menu = null; };
  }

  // Pause
  const syncPause = () => { $('sfx').value = settings.sfx; $('mus').value = settings.mus; $('sfxL').textContent = settings.sfx || 'Off'; $('musL').textContent = settings.mus || 'Off'; $('vox').value = settings.voice ?? 90; $('voxL').textContent = (settings.voice ?? 90) || 'Off'; $('fastSw').classList.toggle('on', settings.fast); };
  function pause() { G.menu = 'pause'; show('pause'); syncPause(); }
  $('pauseBtn').onclick = () => { sfx.tap(); pause(); };
  $('pResume').onclick = () => { sfx.tap(); show('pause', false); G.menu = null; };
  $('pause').addEventListener('click', e => { if (e.target === $('pause')) $('pResume').click(); });
  $('pAtlas').onclick = () => { show('pause', false); openAtlas(); };
  $('pTitle').onclick = () => { show('pause', false); G.menu = null; G.toTitle(); };
  $('sfx').oninput = e => { settings.sfx = +e.target.value; ensureAudio(); setLevels(); syncPause(); sfx.tap(); };
  $('vox').oninput = e => { settings.voice = +e.target.value; ensureAudio(); syncPause(); };
  $('vox').onchange = () => G.persist();
  $('mus').oninput = e => { settings.mus = +e.target.value; ensureAudio(); setLevels(); syncPause(); };
  ['sfx', 'mus'].forEach(id => $(id).onchange = () => G.persist());
  let held = false, ht = 0; const row = $('fastRow');
  row.onpointerdown = () => { clearTimeout(ht); held = false; ht = setTimeout(() => { held = true; G.toggleMon(); }, 600); };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => row.addEventListener(ev, () => clearTimeout(ht)));
  row.onclick = () => { if (held) { held = false; return; } settings.fast = !settings.fast; G.world.setQuality(settings.fast); syncPause(); G.persist(); };

  function crash(text, loss, onGo) { vo('combat-crash', 3); G.menu = 'crash'; show('crash'); $('crashText').textContent = text; $('crashLoss').textContent = loss ? '−' + loss + ' gems dropped' : 'No gems lost'; $('crashGo').onclick = () => { show('crash', false); G.menu = null; onGo(); }; }
  function result(name, medal, rows, onAgain, onOn) {
    G.menu = 'result'; show('result'); $('rName').textContent = name; $('rMedal').textContent = medal ? medal + '!' : 'Finished!';
    const col = { Gold: 'oklch(0.86 0.15 88)', Silver: 'oklch(0.86 0.01 250)', Bronze: 'oklch(0.66 0.1 55)' }[medal] || 'oklch(0.6 0.03 70)';
    $('medal').style.background = `radial-gradient(circle at 35% 30%,#fff8e0,${col})`; $('rMedal').style.color = col;
    $('rRows').innerHTML = rows.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    $('rAgain').onclick = () => { show('result', false); G.menu = null; onAgain(); }; $('rOn').onclick = () => { show('result', false); G.menu = null; onOn(); };
  }
  function fanfare(r, list) { G.menu = 'fanfare'; show('fanfare'); sfx.unlock(); vo('fanfare', 3); $('fRegion').textContent = RNAME[r]; $('fList').innerHTML = list.map(l => `<span><span class="ms">check_circle</span>${l}</span>`).join(''); $('fOk').onclick = () => { show('fanfare', false); G.menu = null; }; }
  return { openAtlas, closeAtlas, openAerie, renderAerie, hatch, dialog, pause, crash, result, fanfare, syncPause };
}
