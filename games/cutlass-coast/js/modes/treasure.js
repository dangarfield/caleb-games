// treasure.js — beach dig. params {questId}. Tap the sand to walk the captain, "Dig here" to dig (5 tries).
// Found → chest + sparkle, gold into the purse, quest done → ctx.go('sail', {message}). Out of digs → ctx.go('sail', {message}).
import * as THREE from 'three';
import { landmarkFor, questMapCanvas } from './treasure-maps.js';

const MAX_DIGS = 5, FIND_R = 3.6, WALK_SPEED = 5.5;
let ctx = null, root = null, scene = null, camera = null, sky = null, water = null, island = null, ground = null, fx = null;
let cap = null, sloop = null, chest = null, ring = null, ringMat = null, offTap = null, offResize = null;
let quest = null, pieces = null, lm = null, spot = null, target = null, digsLeft = MAX_DIGS, lastDist = null, busy = false, found = false, time = 0, chestT = -1;
let hud = {}, holes = [], coastR = null, sparkleT = 0, timers = [], arrowMats = [], mapBig = false;
const after = (sec, fn) => timers.push({ at: time + sec, fn }); // game-time timers (frame-rate independent of wall clock)
const tmp = new THREE.Vector3(), camTgt = new THREE.Vector3(), camPos = new THREE.Vector3();
const A0 = Math.PI / 2; // the beach we land on faces +z (toward the camera)

const mod = {
  enter(c, params = {}) {
    ctx = c; quest = ctx.world.questById(params.questId);
    { const k = ctx.state.career(), fr = k && k.mapFragments && k.mapFragments[params.questId]; pieces = Array.isArray(fr) ? fr.slice() : [true, true, true, true]; } // snapshot: finding the chest clears the pieces, but the map stays on screen
    digsLeft = MAX_DIGS; lastDist = null; busy = false; found = false; time = 0; chestT = -1; sparkleT = 0; holes = []; target = null; hud = {}; timers = []; arrowMats = []; mapBig = false;
    const car = ctx.state.career();
    if (!quest || !car) { ctx.go(car ? 'sail' : 'title', { message: "There's nothing to dig for here." }); return; }
    if (Array.isArray(car.treasuresFound) && car.treasuresFound.includes(quest.id)) { ctx.go('sail', { message: `You already dug up ${quest.name}.` }); return; }
    lm = landmarkFor(quest.id);
    buildScene(car);
    root = ctx.ui.mount('treasure', null);
    renderHud();
    offTap = ctx.engine.pointer.on({ tap: onTap });
    offResize = ctx.engine.onResize(onResize); onResize();
    ctx.audio.ambience(true);
    ctx.ui.toast('Tap the sand to walk. Dig when you think you are close.', { title: `Ashore: ${quest.area}`, ms: 3600 });
  },
  exit() {
    if (offTap) offTap(); if (offResize) offResize(); offTap = offResize = null;
    ctx && ctx.audio.ambience(false);
    if (fx) { try { fx.dispose(); } catch (e) {} }
    if (sky) { try { sky.dispose(); } catch (e) {} }
    if (water) { try { water.dispose(); } catch (e) {} }
    if (ringMat) ringMat.dispose();
    for (const m of arrowMats) m.dispose(); arrowMats = [];
    if (scene) for (const o of [...scene.children]) { try { if (typeof o.dispose === 'function') o.dispose(); else ctx.engine.disposeTree(o); if (o.parent) o.parent.remove(o); } catch (e) { console.error(e); } }
    scene = camera = sky = water = island = ground = fx = cap = sloop = chest = ring = ringMat = null; root = null; holes = [];
  },
  update(dt, t) {
    if (!scene) return;
    time += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (time >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    water.update(t); sky.update(camera);
    if (sloop) sloop.update(dt, { x: 0.3, z: 0.4 }, water, t);
    // walking
    if (target) {
      const dx = target.x - cap.position.x, dz = target.z - cap.position.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { target = null; ring.visible = false; if (found && chest) { cap.rotation.y = Math.atan2(chest.position.x - cap.position.x, chest.position.z - cap.position.z); cap.setAction('cheer'); } else cap.setAction('idle'); }
      else {
        const step = Math.min(d, WALK_SPEED * dt);
        cap.position.x += dx / d * step; cap.position.z += dz / d * step;
        const want = Math.atan2(dx, dz); let dr = want - cap.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        cap.rotation.y += dr * Math.min(1, dt * 12);
      }
    }
    cap.position.y = island.userData.heightAt(cap.position.x, cap.position.z);
    cap.update(dt);
    if (ring && ring.visible) { ring.rotation.z += dt * 1.5; const s = 1 + Math.sin(time * 6) * 0.08; ring.scale.set(s, s, s); }
    // chest rising out of the sand
    if (chestT >= 0 && chest) {
      chestT += dt;
      const gy = island.userData.heightAt(chest.position.x, chest.position.z);
      chest.position.y = gy - 0.9 + Math.min(1, chestT / 1.1) * 0.95;
      if (chestT > 1.2 && !chest.userData.opened) { chest.userData.opened = true; chest.setOpen(true); ctx.audio.play('coins'); }
      if (chest.userData.opened && chestT < 5) { sparkleT -= dt; if (sparkleT <= 0) { sparkleT = 0.18; tmp.set(chest.position.x, chest.position.y + 0.9, chest.position.z); fx.sparkle.spawn(tmp, { count: 8 }); } }
    }
    fx.update(dt);
    // camera follows from the sea side
    camTgt.set(cap.position.x, cap.position.y + 1, cap.position.z - 4);
    camPos.set(cap.position.x + 3, cap.position.y + 15, cap.position.z + 19);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 3));
    camera.lookAt(camTgt);
  },
};

export default mod;

// ---------------------------------------------------------------- scene
function coastRadius(a) { // interpolate the island's 48-point coast polygon
  const n = coastR.length, f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * n, i = Math.floor(f) % n, k = f - Math.floor(f);
  return coastR[i] * (1 - k) + coastR[(i + 1) % n] * k;
}
const at = (a, f) => { const r = coastRadius(a) * f; return { x: Math.cos(a) * r, z: Math.sin(a) * r }; };
function buildScene(car) {
  const PLT = ctx.PLT, W = ctx.world;
  scene = new THREE.Scene();
  sky = PLT.sky.create('day'); scene.add(sky.root);
  water = PLT.water.create({ size: 320, segments: 64 }); scene.add(water.mesh);
  const seed = W.hash(quest.id) % 900 + 11;
  island = PLT.terrain.island({ radius: 34, height: 7, seed, biome: 'jungle' });
  scene.add(island);
  ground = island.getObjectByName('ground');
  const palms = island.getObjectByName('palms'); if (palms) palms.visible = false; // we place our own so the landmark reads clearly
  coastR = island.userData.coast.map(([x, z]) => Math.hypot(x, z));
  water.setShallowMap((x, z) => island.userData.shallowAt(x, z));
  // landmark + treasure spot (spot offsets: x along the beach, z toward the sea)
  const la = A0 + 0.22, L = at(la, 0.8), n = { x: Math.cos(la), z: Math.sin(la) }, tng = { x: Math.sin(la), z: -Math.cos(la) };
  const sp = { x: L.x + tng.x * lm.spot.x + n.x * lm.spot.z, z: L.z + tng.z * lm.spot.x + n.z * lm.spot.z };
  const sa = Math.atan2(sp.z, sp.x), sr = Math.min(Math.hypot(sp.x, sp.z), coastRadius(sa) * 0.93);
  spot = { x: Math.cos(sa) * sr, z: Math.sin(sa) * sr };
  buildLandmark(L, n, tng);
  // decorative palms well away from the landmark
  const pp = PLT.props.palm(seed + 3), deco = new THREE.InstancedMesh(pp.geometry, PLT.materials.inst('vcolDouble'), 8); deco.name = 'decoPalms';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    const a = A0 + (i < 4 ? -1 : 1) * (1.25 + (i % 4) * 0.35), p = at(a, 0.8 - (i % 2) * 0.12);
    v.set(p.x, island.userData.heightAt(p.x, p.z) - 0.1, p.z); e.set(0, i * 1.7, 0); q.setFromEuler(e); s.setScalar(0.9 + (i % 3) * 0.15);
    deco.setMatrixAt(i, m4.compose(v, q, s));
  }
  deco.instanceMatrix.needsUpdate = true; deco.computeBoundingSphere(); scene.add(deco);
  // our sloop at anchor off the landing beach
  try { sloop = PLT.ships.create('sloop', { nation: car.nation, sailState: 'furl' }); const o = at(A0 - 0.45, 1.6); sloop.position.set(o.x, 0, o.z); sloop.rotation.y = 1.2; scene.add(sloop); } catch (err) { sloop = null; }
  // the captain lands on the beach, a little way from the landmark
  cap = PLT.characters.captain({ who: car.slot === 'ezra' ? 'ezra' : 'caleb', age: car.age });
  cap.setWeapon(null);
  const st = at(A0 - 0.2, 0.9); cap.position.set(st.x, island.userData.heightAt(st.x, st.z), st.z); cap.rotation.y = Math.PI;
  scene.add(cap);
  // tap-target ring
  ringMat = new THREE.MeshBasicMaterial({ color: '#f0d79a', transparent: true, opacity: 0.85, depthWrite: false });
  ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24, 1, 0, Math.PI * 1.7), ringMat); ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 3;
  const ringHolder = new THREE.Group(); ringHolder.add(ring); scene.add(ringHolder); ring.userData.holder = ringHolder;
  fx = PLT.fx.create(scene);
  window.PLT_DEBUG && (window.PLT_DEBUG.treasure = { spot, cap, get digsLeft() { return digsLeft; }, step: (n = 30) => { for (let i = 0; i < n; i++) mod.update(1 / 30, time + 1 / 30); } });
  camera = new THREE.PerspectiveCamera(50, ctx.engine.aspect(), 0.5, 1200);
  camera.position.set(cap.position.x + 3, cap.position.y + 15, cap.position.z + 19);
  camera.lookAt(cap.position.x, cap.position.y + 1.2, cap.position.z - 2.5);
  ctx.engine.setView(scene, camera);
}
function hAt(x, z) { return island.userData.heightAt(x, z); }
function buildLandmark(L, n, tng) {
  const PLT = ctx.PLT, g = new THREE.Group(); g.name = 'landmark';
  const stone = PLT.materials.get('stone'), white = PLT.materials.get('whitewash');
  const put = (mesh, x, z, y = 0) => { mesh.position.set(x, hAt(x, z) + y, z); g.add(mesh); return mesh; };
  if (lm.kind === 'palms3' || lm.kind === 'twistedPalm') {
    const pr = PLT.props.palm(lm.kind === 'palms3' ? 5 : 9);
    const offs = lm.kind === 'palms3' ? [[-1.6, 0], [0.4, -1.2], [1.8, 0.4]] : [[0, 0]];
    for (const [ox, oz] of offs) {
      const x = L.x + tng.x * ox + n.x * oz, z = L.z + tng.z * ox + n.z * oz;
      const m = put(new THREE.Mesh(pr.geometry, pr.material), x, z, -0.1);
      if (lm.kind === 'twistedPalm') { m.rotation.set(0.1, 2.4, 0.42); m.scale.setScalar(1.35); } else { m.rotation.y = ox * 2; m.scale.setScalar(1.15); }
    }
    g.userData.palmGeo = pr.geometry;
    if (lm.kind === 'twistedPalm') { // a few rocks around the spit
      for (let i = 0; i < 3; i++) { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + i * 0.15, 0), stone); put(rk, L.x + tng.x * (-2.5 + i * 2.6) - n.x * 1.5, L.z + tng.z * (-2.5 + i * 2.6) - n.z * 1.5, 0.1); }
    }
  }
  if (lm.extra === 'chapel') { // ruined chapel inland ("to the north")
    const cx = L.x - n.x * 8, cz = L.z - n.z * 8, ry = Math.atan2(n.x, n.z);
    const ch = new THREE.Group(); ch.rotation.y = ry;
    const box = (w, hh, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), stone); m.position.set(x, y + hh / 2, z); ch.add(m); };
    box(5, 3.2, 0.5, 0, 0, -2.4); box(0.5, 2.6, 5, -2.5, 0, 0); box(0.5, 1.4, 3, 2.5, 0, -1); box(1.6, 0.8, 0.5, -1.6, 0, 2.4);
    box(0.4, 1.6, 0.4, -0.7, 3.2, -2.4); box(0.4, 1.6, 0.4, 0.7, 3.2, -2.4); box(1.8, 0.4, 0.5, 0, 4.8, -2.4);
    ch.position.set(cx, hAt(cx, cz) - 0.2, cz); g.add(ch);
  }
  if (lm.kind === 'bellRock') {
    const pts = [[0, 0], [1.9, 0], [1.7, 0.4], [1.2, 1.2], [1.0, 2.2], [0.8, 2.8], [0.4, 3.1], [0, 3.15]].map(([x, y]) => new THREE.Vector2(x, y));
    const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 9), white); put(bell, L.x, L.z, -0.1);
  }
  if (lm.kind === 'stones2') {
    for (const ox of [-1.8, 1.8]) {
      const x = L.x + tng.x * ox, z = L.z + tng.z * ox;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), stone); m.scale.set(0.9, 2.6, 0.8); m.rotation.y = ox; put(m, x, z, 1.8);
    }
  }
  scene.add(g);
}

// ---------------------------------------------------------------- input
function onTap(e) {
  if (busy || found || !scene) return;
  const hits = ctx.engine.pointer.raycast(e, [ground], camera);
  if (!hits.length) return;
  const p = hits[0].point;
  const a = Math.atan2(p.z, p.x), r = Math.min(Math.hypot(p.x, p.z), coastRadius(a) * 0.95);
  target = { x: Math.cos(a) * r, z: Math.sin(a) * r };
  const holder = ring.userData.holder; holder.position.set(target.x, hAt(target.x, target.z) + 0.08, target.z); ring.visible = true;
  cap.setAction('walk');
}
function onResize() { if (fx && fx.setPixelScale) fx.setPixelScale(ctx.engine.size.h * ctx.engine.renderer.getPixelRatio(), 50); }

// ---------------------------------------------------------------- dig
function dig() {
  if (busy || found) return;
  busy = true; target = null; ring.visible = false; cap.setAction('idle');
  const fwd = { x: Math.sin(cap.rotation.y), z: Math.cos(cap.rotation.y) };
  const px = cap.position.x + fwd.x * 0.9, pz = cap.position.z + fwd.z * 0.9;
  ctx.audio.play('dig');
  cap.setAction('strikeLow', { restart: true });
  let n = 0; cap.onActionEnd = () => { if (++n < 2 && !found) cap.setAction('strikeLow', { restart: true }); };
  tmp.set(px, hAt(px, pz) + 0.2, pz); fx.splash.spawn(tmp, { color: '#e8d49a', count: 18, speed: 4 });
  after(0.45, () => { tmp.set(px, hAt(px, pz) + 0.2, pz); fx.splash.spawn(tmp, { color: '#e8d49a', count: 14, speed: 3.5 }); ctx.audio.play('dig', { caption: false }); });
  after(1.0, () => finishDig(px, pz));
}
function finishDig(px, pz) {
  const d = Math.hypot(px - spot.x, pz - spot.z);
  digsLeft--;
  if (d <= FIND_R) { foundIt(px, pz); return; }
  const hole = ctx.PLT.props.digSite(); hole.scale.setScalar(0.55); hole.position.set(px, hAt(px, pz) - 0.02, pz); scene.add(hole); holes.push(hole);
  const near = d < 7 ? "Very hot! It's right nearby." : d < 12 ? 'Hot! You are close.' : d < 20 ? 'Warm. Keep looking around here.' : d < 30 ? 'Cool. The treasure is further off.' : 'Cold. Nothing like this place on the map.';
  const trend = lastDist == null ? 'Nothing here…' : d < lastDist - 0.5 ? 'Warmer!' : d > lastDist + 0.5 ? 'Colder…' : 'About the same…';
  dowse(px, pz, d);
  lastDist = d; busy = false; cap.onActionEnd = null;
  if (digsLeft <= 0) { giveUp(); return; }
  ctx.ui.toast(`${near} ${digsLeft} ${digsLeft === 1 ? 'dig' : 'digs'} left.`, { title: trend, ms: 3200 });
  renderHud();
}
function foundIt(px, pz) {
  found = true; busy = true; cap.onActionEnd = null;
  const S = ctx.state, c = S.career(), q = quest;
  // the chest comes up where you dug; the captain hops aside (toward the camera) so you can see it
  chest = ctx.PLT.props.chest({ open: false }); chest.scale.setScalar(1.4);
  chest.position.set(px, hAt(px, pz) - 0.9, pz); chest.rotation.y = Math.atan2(camera.position.x - px, camera.position.z - pz);
  const pit = ctx.PLT.props.digSite(); pit.scale.setScalar(0.7); pit.position.set(px, hAt(px, pz) - 0.02, pz); scene.add(pit); holes.push(pit);
  scene.add(chest); chestT = 0;
  const side = { x: Math.cos(cap.rotation.y), z: -Math.sin(cap.rotation.y) };
  const tx = px + side.x * 2.2 + 0.9, tz = pz + side.z * 2.2 + 1.2, ta = Math.atan2(tz, tx), tr = Math.min(Math.hypot(tx, tz), coastRadius(ta) * 0.95);
  target = { x: Math.cos(ta) * tr, z: Math.sin(ta) * tr }; cap.setAction('walk');
  ctx.audio.play('fanfare');
  // apply the reward now (saved on the next ctx.go)
  c.gold += q.gold;
  if (Array.isArray(c.treasuresFound)) { if (!c.treasuresFound.includes(q.id)) c.treasuresFound.push(q.id); } else c.treasuresFound = (+c.treasuresFound || 0) + 1;
  if (c.mapFragments) c.mapFragments[q.id] = [false, false, false, false];
  if (c.markedQuest === q.id) c.markedQuest = null;
  S.addFame(6, c);
  S.addLog(`Dug up ${q.name} on the ${q.area.replace(/^(\w)/, m => m.toLowerCase())}. ${ctx.ui.fmt(q.gold)} gold!`, c);
  ctx.save();
  after(3.4, () => { if (root) renderResult(true); });
  renderHud();
}
function giveUp() {
  busy = true; cap.setAction('idle');
  renderResult(false);
}
function leave(ok) {
  const q = quest, msg = ok ? `You dug up ${q.name}! ${ctx.ui.fmt(q.gold)} gold is in the ship's purse.` : `No luck on the beach. Look at the map pieces again: ${lm.label} mark the spot.`;
  if (!ok) ctx.state.addLog(`Dug for ${q.name} but found only sand.`);
  ctx.go('sail', { message: msg });
}

// ---------------------------------------------------------------- dowsing arrow (like Bone Village's treasure sensor)
// Each empty hole leaves a coloured arrow on the sand pointing roughly at the treasure: blue = cold, red = hot.
// The closer you dig, the truer the arrow points.
function heatColor(d) { return d < 7 ? '#e0402a' : d < 12 ? '#f08030' : d < 20 ? '#f0c040' : d < 30 ? '#8cc8e8' : '#5a86c8'; }
function dowse(px, pz, d) {
  const wobble = (d < 7 ? 8 : d < 12 ? 16 : d < 20 ? 28 : 45) * Math.PI / 180;
  const a = Math.atan2(spot.x - px, spot.z - pz) + (Math.random() * 2 - 1) * wobble; // direction to the treasure, a bit fuzzy
  const sh = new THREE.Shape();
  sh.moveTo(0, 2.6); sh.lineTo(0.9, 1.3); sh.lineTo(0.32, 1.3); sh.lineTo(0.32, 0.3); sh.lineTo(-0.32, 0.3); sh.lineTo(-0.32, 1.3); sh.lineTo(-0.9, 1.3); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); // lies flat, pointing −z
  const mat = new THREE.MeshBasicMaterial({ color: heatColor(d), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
  arrowMats.push(mat);
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 4;
  const g = new THREE.Group(); g.add(m);
  // a heat-coloured ring round the hole too, so each dig reads at a glance
  const rg = new THREE.RingGeometry(1.1, 1.5, 28); rg.rotateX(-Math.PI / 2);
  const ringM = new THREE.Mesh(rg, mat); ringM.renderOrder = 4; g.add(ringM);
  m.position.set(0, 0, 0); m.scale.setScalar(1.7);
  g.position.set(px, hAt(px, pz) + 0.12, pz); g.rotation.y = Math.atan2(-Math.sin(a), -Math.cos(a));
  scene.add(g); holes.push(g);
}

// ---------------------------------------------------------------- the treasure map (your pieces), like the sailing minimap
function mapPanel() {
  const { h } = ctx.ui, c = ctx.state.career(), have = pieces || (c.mapFragments && c.mapFragments[quest.id]) || [true, true, true, true];
  const full = questMapCanvas(quest.id), W2 = full.width / 2, H2 = full.height / 2;
  const cv = h('canvas', { class: 'tr-map-canvas', width: full.width, height: full.height });
  const g = cv.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * W2, y = Math.floor(i / 2) * H2;
    if (have[i]) g.drawImage(full, x, y, W2, H2, x, y, W2, H2);
    else { g.fillStyle = '#2a2016'; g.fillRect(x, y, W2, H2); g.fillStyle = 'rgba(240,215,154,.5)'; g.font = '700 30px Cinzel, serif'; g.textAlign = 'center'; g.fillText('missing', x + W2 / 2, y + H2 / 2 + 10); }
  }
  g.strokeStyle = 'rgba(58,44,28,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(W2, 0); g.lineTo(W2, full.height); g.moveTo(0, H2); g.lineTo(full.width, H2); g.stroke();
  return h('button', { class: 'tr-map' + (mapBig ? ' big' : ''), 'aria-label': 'Your treasure map', onTap: () => { mapBig = !mapBig; renderHud(); } },
    cv, h('span', { class: 'tr-map-tag' }, mapBig ? 'Tap to close' : 'Your map · tap to enlarge'));
}

// ---------------------------------------------------------------- HUD
function renderHud() {
  const { h } = ctx.ui;
  const pips = Array.from({ length: MAX_DIGS }, (_, i) => h('span', { class: 'tr-pip' + (i < digsLeft ? ' on' : '') }));
  root.replaceChildren(
    ctx.ui.menuButton(() => ctx.go('pause')),
    h('div', { class: 'glass tr-card' },
      h('div', { class: 'tr-q' }, quest.name),
      h('div', { class: 'tr-clue' }, lm.clue)),
    h('div', { class: 'glass tr-digs' }, h('span', { class: 'tr-digs-k' }, 'Digs left'), h('div', { class: 'tr-pips' }, pips)),
    mapPanel(),
    h('div', { class: 'dock-act tr-dock' },
      h('button', { class: 'navy-btn tr-leave', onTap: async () => { if (busy) return; if (await ctx.ui.confirm({ title: 'Back to the ship?', text: 'You can come back and dig again later.', ok: 'Back to ship', cancel: 'Keep digging' })) leave(false); } }, 'Back to ship'),
      h('button', { class: 'gold-btn tr-dig', disabled: busy || found, onTap: dig }, h('span', { class: 'tr-shovel', html: SHOVEL }), 'Dig here')));
}
const SHOVEL = '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M20 4 L28 12 L25 15 L22 12 L13 21 L15 23 L10 28 Q6 30 4 28 Q2 26 4 22 L9 17 L11 19 L20 10 L17 7Z" fill="#2a1c0a"/></svg>';
function renderResult(ok) {
  const { h, fmt } = ctx.ui;
  const card = h('div', { class: 'dialog-back tr-result-back' },
    h('div', { class: 'navy-frame tr-result' },
      h('div', { class: 'parchment tr-result-in' },
        ok ? h('div', { class: 'tr-r-pic', style: { backgroundImage: `url(${ctx.ui.imgUrl('moment-treasure-' + quest.id)})` } }) : null,
        h('div', { class: 'tr-r-h' }, ok ? 'Treasure!' : 'Only sand…'),
        h('div', { class: 'tr-r-t' }, ok ? `You dug up ${quest.name}. ${fmt(quest.gold)} gold goes into the ship's purse, and every tavern will be telling the tale.`
          : `Your crew is worn out and the tide is coming in. The map pieces say to look near ${lm.label}. Your map is safe, so you can try again another day.`),
        ok ? h('div', { class: 'tr-r-gold' }, `+ ${fmt(quest.gold)} gold`) : null,
        h('div', { class: 'dialog-btns' }, h('button', { class: 'gold-btn', onTap: () => leave(ok) }, 'Back to the ship')))));
  root.append(card);
}
