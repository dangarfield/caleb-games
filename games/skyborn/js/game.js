// Skyborn: main game. Flight, exploration, towers, champions, eggs, favours, camps, ring runs, saves.
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { mountWorld } from './skyborn-scene.js';
import { PLACES, WIND, SKY_ISLES, RIVER, weights, height, toWorld, toUV, placeY, place } from './skyborn-worldgen.js';
import { initCombat, BOSS, tagURL } from './combat.js';
import { vo, favVoice, stopVoice, voLine } from './voice.js';
import { initDeco } from './deco.js';
import { pillarMaterial } from './fx.js';
import { initScreens, DR, ORDER, RNAME, regionPlaces, regionPct } from './screens.js';
import { $, show, toast, banner, flash, sfx, wind, tickMusic, ensureAudio, setLevels, settings, storeReady, loadAll, saveAll, setMusic, setMusicHome, underwaterAudio } from './ui.js';

document.addEventListener('contextmenu', e => e.preventDefault());
globalThis.SKYBORN_GAME = true;
const GW = 144, GH = 75, RIDS = ['hearthvale', 'frostfang', 'stormcrown', 'cinder', 'reach'];
const NEXT = { hearthvale: ['Ember', 'cinder'], cinder: ['Storm', 'stormcrown'], stormcrown: ['Frost', 'frostfang'], frostfang: ['Tide', 'reach'], reach: ['Gold', 'sky'] };
const BARRIER = { cinder: 'Too hot! The lava field burns. Only a fire dragon can cross it.', frostfang: 'A blizzard wall! Only Frost can fly through.', stormcrown: 'The storm wall throws you back! You need Storm’s Lightning Dash.', reach: 'The sea is too wild out here. Tide can dive through it.', sky: 'The air is too thin up here. Only Gold can fly this high.' };
const fresh = () => ({ gems: 0, up: { wings: 0, armour: 0, breath: 0 }, dragons: ['Breeze'], dragon: 'Breeze', open: ['hearthvale'], lit: {}, roosts: {}, found: { aerie: true }, seen: { aerie: true }, favours: {}, champs: {}, camps: {}, rings: {}, fanfare: {}, fog: new Array(GW * GH).fill(0), pos: null, lastRoost: 'aerie', egg: null, ended: false });

// Favour portraits: add files to img/ and list them here, e.g. fav_bonfire: 'img/fav_bonfire.png'
const PORTRAITS = {};
const G = { portraits: PORTRAITS, GW, GH, menu: null, mode: 'loading', boy: 'Caleb', data: null, save: null, region: 'hearthvale', hearts: 4, invuln: 0, rollT: 0, slowmo: 0, carrying: false, quest: null, ring: null, campFight: null, nextFight: 25, stam: 100 };
let world, combat, scr, dirty = false;

// ---------- Places in world space ----------
const VTOP = { vista_oak: 112, vista_falls: 128, vista_bell: 110, vista_head: 12, vista_head2: 12 };
function perchOf(p) {
  const [x, z] = toWorld(p.u, p.v); let y = placeY(p);
  if (p.kind === 'tower') { const t = world.props.towers.reduce((b, t) => { const d = Math.hypot(t.x - x, t.z - z); return d < b[0] ? [d, t] : b; }, [1e9, null])[1]; if (t && Math.hypot(t.x - x, t.z - z) < 400) return new THREE.Vector3(t.x, t.top + 4, t.z); }
  if (p.kind === 'home') return world.props.aerieTop.clone().add(new THREE.Vector3(10, 6, -8));
  if (p.kind === 'nest') y += 16; else if (p.kind === 'roost') y += 32; else if (p.deck) y += p.deck + 3; else if (p.kind === 'vista') y += p.alt ? 4 : VTOP[p.id] ?? 112; else if (p.kind === 'landmark') y += 12; else if (p.kind === 'city') {
    // Perch on a high point outside the city (Kingsholm's wall is at 340 m), looking back at it.
    const R0 = p.id === 'kingsholm' ? 420 : 200; let best = null;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, px = x + Math.sin(a) * R0, pz = z + Math.cos(a) * R0, ph = world.groundAt(px, pz); if (ph < 4) continue; if (!best || ph > best[2]) best = [px, pz, ph]; }
    if (!best) best = [x + R0, z, Math.max(world.groundAt(x + R0, z), 0)];
    const v = new THREE.Vector3(best[0], best[2] + 40, best[1]); v.faceYaw = Math.atan2(x - best[0], z - best[1]); return v;
  }
  else if (['city', 'town', 'village', 'hamlet'].includes(p.kind)) y += 28;
  return new THREE.Vector3(x, y, z);
}
const PERCHABLE = ['tower', 'roost', 'vista', 'home', 'city', 'town', 'village', 'hamlet', 'nest', 'landmark'];
let SPOTS = [];

// ---------- Saves ----------
G.persist = () => { dirty = true; };
function flushSave() { if (!dirty || !G.data || G.debug) return; dirty = false; if (G.save && world) G.save.pos = [world.fly.pos.x, world.fly.pos.y, world.fly.pos.z, world.fly.yaw]; G.data.settings = { ...settings }; G.data.last = G.boy; saveAll(G.data); }
setInterval(flushSave, 2000); addEventListener('pagehide', () => { dirty = true; flushSave(); });
// Saddle upgrades are per dragon.
G.up = () => { const s = G.save; s.ups = s.ups || {}; return s.ups[s.dragon] || (s.ups[s.dragon] = { wings: 0, armour: 0, breath: 0 }); };
const maxHearts = () => 4 + G.up().armour;
const maxStam = () => 100 * (1 + 0.35 * G.up().wings);

// ---------- Boot ----------
(async () => {
  await storeReady();
  G.data = loadAll() || { Caleb: null, Ezra: null, last: 'Caleb', settings: { ...settings } };
  Object.assign(settings, G.data.settings || {}); G.boy = G.data.last || 'Caleb';
  world = await mountWorld($('world'), { view: 'game', tod: 'golden' });
  G.world = world; world.setMode('title'); world.setQuality(settings.fast); initMon();
  combat = initCombat(G); scr = initScreens(G); G.combat = combat; G.scr = scr; G.sfx = sfx; window.SKYBORN = G;
  G.onIncoming = name => toast(name + ' incoming! Look for the red “!”', 2600);
  const deco = initDeco(G); G.deco = deco; G.buildDeco = () => deco.build();
  SPOTS = PLACES.filter(p => PERCHABLE.includes(p.kind) && (p.kind !== 'landmark' || p.land)).map(p => ({ p, pos: perchOf(p) }));
  world.hooks.onFrame = frame; world.hooks.onUnderwater = on => { $('uwOverlay').classList.toggle('on', on); underwaterAudio(on); (on ? sfx.splashIn : sfx.splashOut)(); };
  world.hooks.onBump = () => { world.fly.stun = 0.3; (vo('combat-bonk', 1), flash)('Bonk!'); sfx.bonk(); };
  document.querySelectorAll('#todSeg button').forEach(b => b.onclick = () => { sfx.tap(); settings.todT = TOD_ORDER.indexOf(b.dataset.tod) * TOD_SEG; applyTOD(); G.persist(); });
  $('todLock').onclick = () => { sfx.tap(); settings.todLock = !settings.todLock; applyTOD(); G.persist(); };
  applyTOD(); show('loading', false); toTitle(); wireInput();
})();

// ---------- Performance monitor (P, or hold Fast mode in the pause menu) ----------
let stats, monInfo, monOn = false, draws = 0, monT = 0;
function initMon() {
  stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;top:64px;left:12px;z-index:9998;cursor:pointer;opacity:.9;display:none';
  monInfo = document.createElement('div');
  monInfo.style.cssText = 'position:fixed;top:118px;left:12px;z-index:9998;padding:3px 6px;background:rgba(0,0,16,.75);color:#0ff;font:600 11px/1.35 monospace;white-space:pre;pointer-events:none;display:none';
  document.body.append(stats.dom, monInfo);
  showMon(settings.mon);
}
function showMon(v) { monOn = !!v; stats.dom.style.display = monInfo.style.display = monOn ? 'block' : 'none'; }
G.toggleMon = () => { settings.mon = !monOn; showMon(settings.mon); G.persist(); };
addEventListener('keydown', e => { if ((e.key === 'p' || e.key === 'P') && !e.repeat) G.toggleMon(); });

// ---------- Keyboard (desktop testing): R D F G or arrows steer; U soar, J breath, I dive, K flap, O roll ----------
const keys = {};
const STEER = { r: 'up', arrowup: 'up', f: 'down', arrowdown: 'down', d: 'left', arrowleft: 'left', g: 'right', arrowright: 'right' };
addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); if (STEER[k] || k === ' ') e.preventDefault();
  if (e.repeat || G.mode === 'loading') return; ensureAudio();
  if (STEER[k]) keys[STEER[k]] = true;
  if (G.mode !== 'play' || G.menu) return;
  if (k === 'k') { held.flap = true; $('btnFlap').classList.add('on'); onFlapPress(); }
  else if (k === 'i') { held.dive = true; $('btnDive').classList.add('on'); }
  else if (k === 'j') onBreath();
  else if (k === 'o') doRoll((keys.left ? -1 : keys.right ? 1 : stickS.x < 0 ? -1 : 1));
  else if (k === 'u') { if (!$('btnSoar').classList.contains('hidden')) $('btnSoar').click(); }
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || G.mode !== 'play') return; e.preventDefault();
  if (G.menu === 'pause') $('pResume').click();
  else if (G.menu === 'atlas') $('atlasClose').click();
  else if (G.menu === 'aerie') $('aerieClose').click();
  else if (!G.menu) scr.pause();
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (STEER[k]) keys[STEER[k]] = false;
  if (k === 'k') { held.flap = false; $('btnFlap').classList.remove('on'); }
  if (k === 'i') { held.dive = false; $('btnDive').classList.remove('on'); }
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; held.flap = held.dive = false; });
const keyX = () => (keys.right ? 1 : 0) - (keys.left ? 1 : 0), keyY = () => (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
function monTick(now) {
  if (!monOn) return;
  stats.update(); draws++;
  if (now - monT >= 1000) { const r = world.renderer.info.render, c = world.renderer.domElement; monInfo.textContent = `redraws ${draws}/s\n${r.calls} calls · ${Math.round(r.triangles / 1000)}k tris\n${c.width}×${c.height}`; draws = 0; monT = now; }
}

// ---------- Title ----------
// The Narrator reads the title story the first time you touch the title screen (audio can only start after a tap).
// Title voiceover and music wait until the page has loaded (G.mode leaves 'loading' when the title screen shows).
let titleTold = false;
addEventListener('pointerdown', () => { if (titleTold || G.mode !== 'title') return; titleTold = true; ensureAudio(); setTimeout(() => { if (G.mode === 'title') vo('title-story', 3); }, 150); }, true);
function toTitle() {
  flushSave(); G.mode = 'title'; world.setMode('title'); combat && combat.clear(); show('hud', false); show('title'); renderTitle();
}
G.toTitle = toTitle;
let confirmNew = false;
function renderTitle() {
  $('pCaleb').classList.toggle('on', G.boy === 'Caleb'); $('pEzra').classList.toggle('on', G.boy === 'Ezra');
  const s = G.data[G.boy]; confirmNew = false; $('newLbl').textContent = 'New flight';
  $('btnContinue').classList.toggle('hidden', !s);
  if (s) { const r = s.open[s.open.length - 1]; $('contSub').textContent = `${G.boy} · ${RNAME[r]} · ${s.dragons.length} dragon${s.dragons.length > 1 ? 's' : ''}`; }
}
$('pCaleb').onclick = () => { ensureAudio(); sfx.tap(); G.boy = 'Caleb'; renderTitle(); };
$('pEzra').onclick = () => { ensureAudio(); sfx.tap(); G.boy = 'Ezra'; renderTitle(); };
$('btnContinue').onclick = () => { ensureAudio(); start(false); };
$('btnNew').onclick = () => { ensureAudio(); if (G.data[G.boy] && !confirmNew) { confirmNew = true; $('newLbl').textContent = `Tap again to start over for ${G.boy}`; sfx.tap(); return; } start(true); };

function debugSave() {
  const s = fresh(), all = ['Breeze', 'Ember', 'Storm', 'Frost', 'Tide', 'Gold'];
  s.dragons = all.slice(); s.dragon = 'Ember'; s.open = ['hearthvale', 'cinder', 'stormcrown', 'frostfang', 'reach', 'sky']; s.gems = 99999;
  s.ups = {}; all.forEach(d => { s.ups[d] = { wings: 3, armour: 3, breath: 3 }; }); s.up = { wings: 3, armour: 3, breath: 3 };
  PLACES.forEach(p => { s.seen[p.id] = true; if (p.kind === 'roost' || p.kind === 'home') { s.roosts[p.id] = true; s.found[p.id] = true; } }); s.fog.fill(1);
  return s;
}
addEventListener('keydown', e => { if (e.key === '=' && G.mode === 'title' && !e.repeat) { ensureAudio(); start(false, debugSave()); } });
function start(isNew, preset) {
  stopVoice();
  G.debug = !!preset; show('debugTag', G.debug);
  if (!preset && (isNew || !G.data[G.boy])) G.data[G.boy] = fresh();
  G.save = preset || G.data[G.boy]; const s = G.save;
  if (s.egg && !s.egg.r) s.egg.r = Object.keys(NEXT).find(k => NEXT[k][1] === s.egg.opens) || null;
  if (!s.dragons.includes('Breeze')) s.dragons.unshift('Breeze');
  if (s.up && !s.ups) { s.ups = {}; s.dragons.forEach(d => { s.ups[d] = { ...s.up }; }); } s.deco = s.deco || {};
  if (G.deco) G.deco.build();
  if (!Array.isArray(s.fog) || s.fog.length !== GW * GH) s.fog = new Array(GW * GH).fill(0);
  G.mode = 'play'; show('title', false); show('hud'); world.setMode('game'); world.setDragon(s.dragon); applyDragon();
  G.hearts = maxHearts(); G.stam = maxStam(); G.carrying = !!s.egg && s.egg.carrying; G.quest = null; G.ring = null; G.campFight = null; G.nextFight = 25;
  const q = Object.entries(s.favours).find(([, v]) => v === 'active'); if (q) startQuest(place(q[0]), true);
  const f = world.fly; f.perch = null;
  if (s.pos) { f.pos.set(s.pos[0], s.pos[1], s.pos[2]); f.yaw = s.pos[3] || 0; } else land(SPOTS.find(o => o.p.id === 'aerie'), true);
  f.cam.copy(f.pos).add(new THREE.Vector3(-Math.sin(f.yaw) * 40, 14, -Math.cos(f.yaw) * 40));
  if (G._prevQuest && G._prevQuest !== G.quest) dropQuestMarker(G._prevQuest); G._prevQuest = G.quest;
  reveal(f.pos.x, f.pos.z, 1600); lastSafe.copy(f.pos); lastPos.copy(f.pos); Object.keys(pillars).forEach(k => { world.scene.remove(pillars[k]); delete pillars[k]; }); if (eggMesh) { world.scene.remove(eggMesh); eggMesh = null; } boss = null; bossHud(false); G.waypoint = s.waypoint ? place(s.waypoint) : null; G.persist();
  if (G.debug) setTimeout(() => banner('Debug flight', 'Everything unlocked. Nothing here is saved.', 4000), 600);
  else if (isNew) playIntro(() => setTimeout(() => banner('Emberreach', 'Fly anywhere. Find the Dragon Towers and light them!', 4500), 400));
}
// New flight: the story, one narrated line per page (intro-1…5). Auto-advances after each line; Next skips ahead, Skip ends it.
const INTRO = [
  'Long ago, dragons and riders flew together over Emberreach.',
  'Then the clouds rolled in. The Dragon Towers went cold, and the dragons fell asleep.',
  'Sky pirates took the winds, led by the Pirate King in his floating fortress.',
  'But one egg stayed warm. A young wind dragon called Breeze has hatched, and she has chosen you.',
  'Light the towers, wake the dragons, and set Emberreach free. Fly, rider!'
];
function playIntro(done) {
  G.menu = 'intro'; show('hud', false); show('intro'); let i = -1, token = 0, t = 0;
  const finish = () => { token++; clearTimeout(t); stopVoice(); show('intro', false); G.menu = null; show('hud'); done && done(); };
  const step = () => {
    i++; if (i >= INTRO.length) return finish();
    const my = ++token, last = i === INTRO.length - 1, el = $('introText'); clearTimeout(t);
    el.textContent = INTRO[i]; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    $('introStep').textContent = `${i + 1} / ${INTRO.length}`; $('introLbl').textContent = last ? 'Fly!' : 'Next'; $('introIcon').textContent = last ? 'flight_takeoff' : 'arrow_forward'; show('introSkip', !last);
    voLine('intro-' + (i + 1)).then(ok => { if (my !== token || last) return; t = setTimeout(() => { if (my === token) step(); }, ok ? 900 : 4500); });
  };
  $('introNext').onclick = () => { sfx.tap(); step(); };
  $('introSkip').onclick = () => { sfx.tap(); finish(); };
  step();
}
function applyDragon() { const s = G.save; $('breathIcon').textContent = DR[s.dragon].icon; world.fly.ceiling = s.open.includes('sky') ? 2900 : 2000; }
G.applyDragon = applyDragon;

// ---------- Input ----------
const stickS = { on: false, x: 0, y: 0 };
function wireInput() {
  const st = $('stick'), kb = $('knob');
  const at = e => { const r = st.getBoundingClientRect(), sc = r.width / st.offsetWidth; let x = (e.clientX - r.left - r.width / 2) / sc, y = (e.clientY - r.top - r.height / 2) / sc; const m = st.offsetWidth * 0.32, d = Math.hypot(x, y); if (d > m) { x *= m / d; y *= m / d; } stickS.x = x / m; stickS.y = y / m; kb.style.transform = `translate(${x}px,${y}px)`; };
  const zone = $('stickZone');
  // Floating stick: touch anywhere in the zone (bottom-left 42% × 42%) and it centres on that point (kept fully on screen), then you steer relative to that.
  // Works off the stick's on-screen rect, so it is right at any page scale (the #hud box itself has no height).
  let tx = 0, ty = 0;
  zone.onpointerdown = e => { ensureAudio(); zone.setPointerCapture(e.pointerId); stickS.on = true; st.classList.add('live');
    const r = st.getBoundingClientRect(), z = $('ui').getBoundingClientRect(), sc = r.width / st.offsetWidth, h = r.width / 2;
    const px = Math.max(z.left + h, Math.min(e.clientX, z.right - h)), py = Math.max(z.top + h, Math.min(e.clientY, z.bottom - h));
    tx += (px - (r.left + h)) / sc; ty += (py - (r.top + h)) / sc;
    st.style.transform = `translate(${tx}px,${ty}px)`; at(e); };
  zone.onpointermove = e => { if (stickS.on) at(e); };
  // Let go: the stick glides back to its home in the bottom-left corner.
  zone.onpointerup = zone.onpointercancel = () => { stickS.on = false; stickS.x = stickS.y = 0; kb.style.transform = ''; tx = ty = 0; st.style.transform = ''; st.classList.remove('live'); };
  const hold = (id, k) => { const b = $(id); b.onpointerdown = e => { ensureAudio(); e.preventDefault(); b.setPointerCapture(e.pointerId); held[k] = true; b.classList.add('on'); if (k === 'flap') onFlapPress(); }; b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => { held[k] = false; b.classList.remove('on'); }; };
  hold('btnFlap', 'flap'); hold('btnDive', 'dive');
  $('btnBreath').onpointerdown = e => { ensureAudio(); e.preventDefault(); onBreath(); };
  const sw = $('swipe'); let sx = null; sw.onpointerdown = e => { sx = e.clientX; }; sw.onpointerup = e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) doRoll(dx > 0 ? 1 : -1); };
  $('btnSoar').onclick = () => { sfx.tap(); if ($('btnSoar').classList.contains('ghost')) { (vo('find-soar', 1), flash)('Climb higher to Soar!', 1400); return; } world.fly.soar = !world.fly.soar; $('btnSoar').classList.toggle('on', world.fly.soar); };
  $('btnAction').onclick = () => { sfx.tap(); if (G.action) G.action(); };
  $('btnMap').onclick = () => { sfx.tap(); scr.openAtlas(); };
  let lastDodge = 1; $('btnDodge').onpointerdown = e => { ensureAudio(); e.preventDefault(); const dir = stickS.x < -0.2 || keys.left ? -1 : stickS.x > 0.2 || keys.right ? 1 : (lastDodge = -lastDodge); doRoll(dir); };
  $('btnInf').onclick = () => { sfx.tap(); settings.inf = !settings.inf; if (settings.inf) G.hearts = maxHearts(); toast(settings.inf ? 'Unlimited hearts: nothing can hurt you!' : 'Unlimited hearts off'); G.persist(); drawHud(); };
}
const held = { flap: false, dive: false };
let flapT = 0, breathCD = 0;
function onFlapPress() { if (world.fly.perch) { takeOff(); return; } sfx.flap(); flapT = 0.45; }
function doRoll(dir) { const f = world.fly; if (f.perch || G.menu) return; f.rollT = 0.55; f.rollDir = dir; G.rollT = 0.55; G.dodged = false; sfx.dodge(); }
function onBreath() {
  if (G.menu || G.mode !== 'play') return;
  if (G.carrying) { (vo('egg-nofire', 2), toast)('No fire while you carry the egg! Fly it home.'); return; }
  const f = world.fly;
  if (f.perch && G.perchAt && G.perchAt.p.kind === 'tower') { lightTower(G.perchAt.p); return; }
  if (breathCD > 0) return; breathCD = 0.28; combat.breathe();
  if (G.quest && G.quest.type === 'light' && f.pos.distanceTo(G.quest.pos) < 160) completeQuest();
}

// ---------- Perching ----------
function land(spot, quiet) {
  const f = world.fly; f.perch = { pos: spot.pos.clone() }; if (spot.pos.faceYaw != null) { f.yaw = spot.pos.faceYaw; f.cam.copy(spot.pos).add(new THREE.Vector3(-Math.sin(f.yaw) * 38, 16, -Math.cos(f.yaw) * 38)); } f.soar = false; $('btnSoar').classList.remove('on'); G.perchAt = spot; const p = spot.p, s = G.save;
  if (!quiet) sfx.tap();
  if (p.kind === 'roost' && !s.roosts[p.id]) { s.roosts[p.id] = true; s.found[p.id] = true; sfx.light(); (vo('find-roost', 2), toast)('Roost beacon lit! You can fast-travel here.'); }
  if (p.kind === 'roost' || p.kind === 'home') s.lastRoost = p.id;
  if (p.id === 'sky_firstnest' && !s.found[p.id]) { s.found[p.id] = true; s.gems += 100; sfx.unlock(); (vo('find-firstnest', 3), banner)('The First Nest', 'Where the very first dragon hatched, long ago. +100 gems'); }
  if (p.kind === 'vista' && !s.found[p.id]) { s.found[p.id] = true; reveal(spot.pos.x, spot.pos.z, 3200); sfx.unlock(); (vo('find-vista', 2), banner)('What a view!', 'The clouds on your Atlas clear.'); }
  if (p.kind === 'tower' && !s.lit[p.id]) (vo('tower-land', 2), toast)('Breathe into the brazier!', 3000);
  if (p.kind === 'nest') { s.found[p.id] = true; nestStatus(p, true); }
  if (p.kind === 'home') { const fw = !quiet && G.deco.fireworks(); if (G.carrying) { setTimeout(hatchEgg, fw ? 5400 : 400); } else if (!quiet) { if (fw) { (vo('home-welcome', 2), toast)('Welcome home!'); setTimeout(() => { if (world.fly.perch && G.perchAt === spot && !G.menu) scr.openAerie(true); }, 5600); } else scr.openAerie(true); } }
  if (['city', 'town', 'village', 'hamlet'].includes(p.kind)) { s.found[p.id] = true; const fav = PLACES.find(q => q.kind === 'favour' && q.at === p.name && s.favours[q.id] !== 'done' && s.favours[q.id] !== 'active'); if (fav && !G.quest) scr.dialog(fav, () => startQuest(fav)); else if (!quiet) toast(p.name); }
  G.persist();
}
function takeOff() { const f = world.fly; if (!f.perch) return; f.perch = null; G.perchAt = null; f.pitch = 0.45; f.speed = 42; f.pos.y += 6; sfx.flap(); }
G.takeOff = takeOff;
G.travel = p => { const spot = SPOTS.find(o => o.p.id === p.id); if (!spot) return; combat.clear(); G.campFight = null; const f = world.fly; f.pos.copy(spot.pos); f.cam.copy(spot.pos).add(new THREE.Vector3(0, 20, -40)); land(spot, true); reveal(f.pos.x, f.pos.z, 1600); toast('Whoosh! ' + p.name); };

// ---------- Towers, champions, eggs ----------
const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const pillars = {};
function addPillar(id) { if (pillars[id]) return; const spot = SPOTS.find(o => o.p.id === id); if (!spot) return; const m = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 6000, 16, 1, true), pillarMat); m.position.copy(spot.pos).y += 3000; world.scene.add(m); pillars[id] = m; }
function lightTower(p) {
  const s = G.save; if (s.lit[p.id]) { (vo('tower-done', 2), toast)('This tower already burns bright.'); return; }
  s.lit[p.id] = true; s.found[p.id] = true; addPillar(p.id); sfx.light(); combat.breathe();
  const towers = PLACES.filter(q => q.kind === 'tower' && q.r === p.r), n = towers.filter(q => s.lit[q.id]).length;
  (vo(n === 3 ? 'tower-lit3' : 'tower-lit', 3), banner)(`Tower lit! ${n} of 3`, n === 3 ? 'The beams meet over the Egg Nest… something is waking!' : 'Find the other towers in ' + RNAME[p.r] + '.');
  G.persist();
}
let boss = null, eggMesh = null;
function checkChampion(dt) {
  const s = G.save, r = G.region; if (boss || s.champs[r] || !s.open.includes(r) || G.carrying) return;
  let ready = false, at;
  if (r === 'sky') { ready = true; at = place('sky_fortress'); }
  else { const towers = PLACES.filter(q => q.kind === 'tower' && q.r === r); ready = towers.length === 3 && towers.every(q => s.lit[q.id]); at = PLACES.find(q => q.kind === 'nest' && q.r === r); }
  if (!ready || !at) return;
  spawnChampion(r, at, false);
}
function champPos(r, at) { const [x, z] = toWorld(at.u, at.v); let gmax = placeY(at); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; gmax = Math.max(gmax, world.groundAt(x + Math.sin(a) * 300, z + Math.cos(a) * 300)); } return new THREE.Vector3(x, gmax + (r === 'sky' ? 60 : BOSS[r].r * 1.3 + 120), z); }
function spawnChampion(r, at, rematch) {
  const pos = champPos(r, at); if (!rematch && world.fly.pos.distanceTo(pos) > 1400) return;
  const d = BOSS[r]; G.rematch = rematch; boss = combat.spawn('boss', pos, { boss: d, group: 'boss' }); sfx.roar();
  vo(rematch ? 'champ-rematch' : 'champ-' + r, 3); banner(d.name, rematch ? 'Rematch! Show them who rules the sky.' : 'The champion of ' + RNAME[r] + '!'); bossHud(true); $('bossName').textContent = d.name; world.fly.soar = false;
}
function champAt(r) { return r === 'sky' ? place('sky_fortress') : PLACES.find(q => q.kind === 'nest' && q.r === r); }
function bossHud(on) { $('bossBar').classList.remove('hidden'); $('hud').classList.toggle('bossOn', on); }
function bossDown() {
  if (G.rematch) { G.rematch = false; bossHud(false); boss = null; combat.clear(); G.save.gems += 150; sfx.unlock(); (vo('champ-again', 3), banner)('Champion beaten again!', '+150 gems'); G.persist(); return; }
  const r = G.region, s = G.save; s.champs[r] = true; bossHud(false); const at = PLACES.find(q => q.kind === 'nest' && q.r === r); if (at) s.found[at.id] = true; boss = null; combat.clear();
  if (r === 'sky') { s.ended = true; s.fog.fill(1); (vo('ending', 3), banner)('Emberreach is free!', 'The Pirate King is beaten. Every sky is yours to fly.', 7000); sfx.unlock(); G.persist(); return; }
  const [x, z] = toWorld(at.u, at.v); s.egg = { r, kind: NEXT[r][0], opens: NEXT[r][1], pos: [x, placeY(at) + 12, z], carrying: false }; placeEgg(); (vo('egg-appear', 3), banner)('An egg!', 'Grab it from the nest, then fly it home to the Aerie.'); G.persist();
}
function placeEgg() { const e = G.save.egg; if (!e || e.carrying || eggMesh) return; eggMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14).scale(1, 1.3, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0c0, emissiveIntensity: 0.7 })); eggMesh.position.set(...e.pos); world.scene.add(eggMesh); }
function hatchEgg() {
  const e = G.save.egg; if (!e) return; G.carrying = false; G.save.egg = null;
  scr.hatch(e.kind, 'A new dragon', () => { const s = G.save; if (!s.dragons.includes(e.kind)) s.dragons.push(e.kind); if (!s.open.includes(e.opens)) s.open.push(e.opens); s.dragon = e.kind; world.setDragon(e.kind); applyDragon(); banner(e.kind + ' joins you!', RNAME[e.opens] + ' is open.'); G.persist(); });
}

// ---------- Waypoint: tap a "?" on the Atlas to follow it ----------
G.setWaypoint = p => { G.waypoint = p; G.save.waypoint = p ? p.id : null; G.persist(); if (p) { sfx.tap(); toast('Marked! Follow the blue “?” on your compass.'); } };
function updateWaypoint() {
  const p = G.waypoint; if (!p) return;
  const [x, z] = toWorld(p.u, p.v), d = Math.hypot(world.fly.pos.x - x, world.fly.pos.z - z), dy = world.fly.pos.y - placeY(p);
  if (G.save.found[p.id]) { G.setWaypoint(null); toast('You found it!'); return; }
  // Only "arrive" when you're actually near it, height included, so the marker keeps guiding you up or down.
  if (d < 120 && Math.abs(dy) < 160 && (!p.water || world.fly.pos.y < -6)) { G.setWaypoint(null); toast(p.kind === 'favour' ? `${p.name} is waiting. Land at ${p.at}!` : p.kind === 'ring' ? 'Fly through the green ring to start!' : ['tower', 'vista', 'roost', 'nest', 'home'].includes(p.kind) || p.land ? 'Here it is! Land on it.' : p.id === 'sky_whales' ? 'Fly alongside the Sky Whales!' : 'Here it is!'); }
  else if (d < 160 && !G._wpHint) { G._wpHint = true; toast(p.water && world.fly.pos.y > -6 ? 'It’s under the water! Hold Dive to swim down.' : ['tower', 'vista', 'roost', 'nest'].includes(p.kind) || p.land ? 'It’s right here. Land on it!' : dy < 0 ? 'It’s above you! Fly up.' : 'It’s below you! Fly down.', 2500); setTimeout(() => { G._wpHint = false; }, 4000); }
}

// ---------- Egg Nest status ----------
let nestNear = null;
function nestStatus(p, perched) {
  const s = G.save, towers = PLACES.filter(q => q.kind === 'tower' && q.r === p.r), lit = towers.filter(q => s.lit[q.id]).length;
  if (s.champs[p.r]) banner('The Egg Nest', 'Its champion is beaten. All is calm here now.');
  else if (lit < 3) { banner('The Egg Nest', `Light all 3 Dragon Towers in ${RNAME[p.r]} to wake its guardian. ${lit} of 3 lit.`, 4500); if (perched) setTimeout(() => toast('Tap the map to find the “?” spots: towers hide among them.', 3500), 1800); }
  else if (!boss) { (vo('nest-wake', 3), banner)('The guardian wakes!', 'Take off and fight!'); }
}
function updateNest() {
  const f = world.fly, p = PLACES.find(q => q.kind === 'nest' && q.r === G.region); if (!p) return;
  const [x, z] = toWorld(p.u, p.v), d = Math.hypot(f.pos.x - x, f.pos.z - z);
  if (d < 350 && nestNear !== p.id) { nestNear = p.id; G.save.seen[p.id] = true; if (!f.perch) nestStatus(p, false); }
  else if (d > 700 && nestNear === p.id) nestNear = null;
}

// ---------- Favours ----------
const FAVQ = { sky_fav1: ['whales', 'sky_whales', 'Fly with the Sky Whales for a while'], reach_fav2: ['visit', 'reach_bell', 'Find the old bell on the seabed'], fav_sheep: ['fight', 'millbrook', 'Pirates over the Millbrook sheep'], fav_lantern: ['visit', 'lighthouse_g', 'Carry the lantern to Gullcliff Light'], fav_balloon: ['visit', 'vista_oak', 'Find Pip’s balloon over Thornwood'], fav_bonfire: ['light', 'stones', 'Light the bonfire at Ninestones'] };
function questDef(f) {
  if (FAVQ[f.id]) return FAVQ[f.id];
  const r = f.r, n = f.id.slice(-1);
  const pick = k => (PLACES.find(q => q.r === r && q.kind === k) || place(r + '_city')).id;
  return n === '1' ? ['fight', r + '_city', f.quest] : n === '2' ? ['visit', pick('vista'), f.quest] : n === '3' ? ['fight', r + '_camp2', f.quest] : ['visit', r + '_ring1', f.quest];
}
function startQuest(f, resume) {
  const [type, tid, text] = questDef(f), t = place(tid) || place('aerie'), [x, z] = toWorld(t.u, t.v);
  G.quest = { id: f.id, type, text, pos: new THREE.Vector3(x, placeY(t), z), spawned: false, water: !!t.water }; G.save.favours[f.id] = 'active';
  G.quest.name = f.name; questMarker(G.quest, f); if (!resume) (vo('fav-start', 2), toast)('Favour started! Follow the gold “!”'); G.persist();
}
// A golden beam over every favour target, plus Pip's actual balloon caught over Thornwood.
function questMarker(q, f) {
  const m = new THREE.Group(); m.position.copy(q.pos);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 700, 20, 1, true).translate(0, 350, 0), pillarMaterial(0xffd060)); beam.material.uniforms.op.value = 0.75; m.add(beam);
  if (f.id === 'fav_balloon') {
    const bal = new THREE.Group(); bal.position.y = 150;
    const env = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 16).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0xff5a8a, emissive: 0x6a1030, emissiveIntensity: 0.5, roughness: 0.6 }));
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(9.1, 1.2, 8, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffe04a, emissive: 0x6a5010, emissiveIntensity: 0.5 }));
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a2e })); basket.position.y = -15;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 4), new THREE.MeshStandardMaterial({ color: 0xc8b088 })); rope.position.y = -12;
    bal.add(env, stripe, basket, rope); m.add(bal); m.userData.bal = bal; q.pos.y += 150;
  }
  world.scene.add(m); q.marker = m;
}
function dropQuestMarker(q) { if (q && q.marker) { world.scene.remove(q.marker); q.marker = null; } }
// Each favour-giver's own thank-you (matches the Text Lab).
const FAV_THANKS = {
  fav_sheep: 'Oh, thank you! My sheep are safe and sound!', fav_lantern: 'There she glows. Bless you, my dear.', fav_balloon: 'My balloon! You found it! You’re the best!', fav_bonfire: 'Ha ha! Look at that bonfire roar! Splendid work!',
  cinder_fav1: 'My hammer! Back where it belongs. Good on you.', cinder_fav2: 'Boom! Mine’s open! Cheers, young ’un!', cinder_fav3: 'Those balloons won’t be back in a hurry. Well done.', cinder_fav4: 'My goats! Every last one! Oh, you little star!',
  frostfang_fav1: 'The palace shines again. You have our thanks, rider.', frostfang_fav2: 'She floats! My boat floats! Thank you, thank you!', frostfang_fav3: 'Oh, there you are, little one! Thank you for bringing him back.', frostfang_fav4: 'Whoa, you’re fast! Okay… you win this time!',
  stormcrown_fav1: 'Three sparks, crackling and bright! Marvellous!', stormcrown_fav2: 'My bell. Hmph. Well… thank you. Very kind.', stormcrown_fav3: 'Delivered! Right on time! Brilliant!', stormcrown_fav4: 'Our kite! You got it! You got our kite!',
  reach_fav1: 'Safe past the grotto! A fine bit of flying, rider!', reach_fav2: 'Grandad’s bell! I can’t believe it! Thank you so much!', reach_fav3: 'The boats are coming home. You’ve done us proud.', reach_fav4: 'My pearls! Ha! Take that, you silly gulls!',
  sky_fav1: 'The whales sing again. The sky remembers your kindness.'
};
function completeQuest() { const q = G.quest; if (!q) return; dropQuestMarker(q); G.save.favours[q.id] = 'done'; G.save.found[q.id] = true; G.save.gems += 40; sfx.unlock(); (vo(favVoice(q.id) + '-thanks', 3), banner)('Favour done!', (FAV_THANKS[q.id] ? '“' + FAV_THANKS[q.id] + '” ' : 'Thank you, rider! ') + '+40 gems'); G.quest = null; G.persist(); }
function updateQuest() {
  const q = G.quest; if (!q) return; const d = world.fly.pos.distanceTo(q.pos), f = world.fly, flat = Math.hypot(f.pos.x - q.pos.x, f.pos.z - q.pos.z);
  if (q.marker) { const t = performance.now() / 1000; q.marker.children[0].material.uniforms.t.value = t; if (q.marker.userData.bal) { q.marker.userData.bal.position.y = 150 + Math.sin(t * 1.2) * 4; q.marker.userData.bal.rotation.y = t * 0.3; } }
  if (q.type === 'visit' && flat < 170 && Math.abs(f.pos.y - q.pos.y) < 260 && (!q.water || f.pos.y < -6)) completeQuest();
  if (q.type === 'whales') { const near = world.props.whales.reduce((b, wh) => wh.position.distanceTo(f.pos) < b.position.distanceTo(f.pos) ? wh : b); q.pos.copy(near.position); if (q.marker) q.marker.position.copy(near.position); q.k = (q.k || 0) + (near.position.distanceTo(f.pos) < 220 ? 1 / 60 : 0); if (q.k > 6) completeQuest(); }
  if (q.type === 'fight') { if (!q.spawned && d < 600) { q.spawned = true; combat.spawnGroup(G.region, q.pos.clone().setY(world.fly.pos.y), 'quest', 1); (vo('combat-here', 2), flash)('Here they come!'); } else if (q.spawned && !combat.alive('quest')) completeQuest(); }
}

// ---------- Camps ----------
function updateCamps() {
  const s = G.save, f = world.fly;
  if (G.campFight) { const c = G.campFight; if (!combat.alive('camp')) { if (c.wave < 3) { c.wave++; (vo('combat-wave', 2), flash)('Wave ' + c.wave + ' of 3!'); combat.spawnGroup(G.region, c.pos.clone().setY(f.pos.y), 'camp', c.wave); } else { s.camps[c.p.id] = Date.now(); s.found[c.p.id] = true; for (let i = 0; i < 15; i++) combat.dropLoot(f.pos, 'gem', 4); (vo('combat-campdone', 3), banner)('Camp cleared!', 'A big treasure chest bursts open!'); G.campFight = null; G.persist(); } } return; }
  if (boss || G.ring) return;
  for (const p of PLACES) { if (p.kind !== 'camp' || p.r !== G.region) continue; const t = s.camps[p.id]; if (t && Date.now() - t < 600000) continue;
    const [x, z] = toWorld(p.u, p.v), pos = new THREE.Vector3(x, placeY(p), z); if (Math.hypot(f.pos.x - x, f.pos.z - z) < 650) { G.campFight = { p, pos, wave: 1 }; banner(p.name, 'Raider camp! Clear 3 waves.'); combat.spawnGroup(G.region, pos.clone().setY(f.pos.y), 'camp', 1); f.soar = false; break; } }
}

// ---------- Ring runs ----------
const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd65a, emissive: 0xffb020, emissiveIntensity: 1.2 }), ringNext = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8ff, emissiveIntensity: 1.6 });
function ringPath(p) {
  const H = (x, z) => world.groundAt(x, z), pts = [];
  if (p.id === 'ring_gorge') { for (let i = 0; i < 12; i++) { const sI = 2 + i / 11 * 3, k = Math.floor(sI), t = sI - k, a = RIVER[k], b = RIVER[k + 1], [x, z] = toWorld(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); pts.push(new THREE.Vector3(x, 30 + Math.sin(i) * 10, z)); } return smoothCourse(pts, H); }
  const [x, z] = toWorld(p.u, p.v), y = p.alt ? placeY(p) + 20 : H(x, z), R = p.id === 'ring_roofs' ? [260, 220] : [380, 260];
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, rx = x + Math.cos(a) * R[0], rz = z + Math.sin(a) * R[1]; pts.push(new THREE.Vector3(rx, Math.max(H(rx, rz), y) + (p.id === 'ring_roofs' ? 70 : 40) + Math.sin(a * 2) * 20, rz)); }
  return smoothCourse(pts, H);
}
function smoothCourse(pts, H) {
  const K = 0.16, clear = 45, n = pts.length;
  for (let i = 0; i < n; i++) { let m = H(pts[i].x, pts[i].z); if (i < n - 1) for (let k = 1; k < 12; k++) { const t = k / 12; m = Math.max(m, H(pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].z + (pts[i + 1].z - pts[i].z) * t)); }
    if (i > 0) for (let k = 1; k < 12; k++) { const t = k / 12; m = Math.max(m, H(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t)); }
    pts[i].y = Math.max(pts[i].y, m + clear); }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].y = Math.max(pts[i].y, pts[i - 1].y - K * d); }
    for (let i = n - 2; i >= 0; i--) { const d = Math.hypot(pts[i].x - pts[i + 1].x, pts[i].z - pts[i + 1].z); pts[i].y = Math.max(pts[i].y, pts[i + 1].y - K * d); }
  }
  return pts;
}
// Start gates: the first ring of every course glows green with a beam; fly through it to start.
const gateMat = new THREE.MeshStandardMaterial({ color: 0x8affb0, emissive: 0x30e070, emissiveIntensity: 1.6 }), gates = {};
let gateHint = null;
function updateGates(dt, t) {
  const f = world.fly;
  for (const p of PLACES) {
    if (p.kind !== 'ring') continue;
    const [x, z] = toWorld(p.u, p.v), far = Math.hypot(x - f.pos.x, z - f.pos.z) > 3000 || !G.save.open.includes(p.r);
    let gt = gates[p.id];
    if (far) { if (gt) gt.g.visible = gt.ghost.visible = false; continue; }
    if (!gt) {
      const pts = ringPath(p), g = new THREE.Group(); g.position.copy(pts[0]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 2.8, 10, 40), gateMat); g.add(ring);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(25.5, 1.1, 8, 40), new THREE.MeshBasicMaterial({ color: 0xb8ffd0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(halo);
      const chev = []; for (let k = 0; k < 4; k++) { const sh = new THREE.Shape(); sh.moveTo(-9, 0); sh.lineTo(0, 7); sh.lineTo(9, 0); sh.lineTo(9, -4); sh.lineTo(0, 3); sh.lineTo(-9, -4); sh.closePath();
        const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0x8affb0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.rotation.x = Math.PI / 2; m.position.set(0, -10, -40 - k * 26); g.add(m); chev.push(m); }
      const ghost = new THREE.Group(), gm = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.22, depthWrite: false });
      pts.slice(1).forEach((v, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(18, 1, 6, 28), gm); r.position.copy(v); r.lookAt(pts[(i + 2) % pts.length]); ghost.add(r); }); world.scene.add(ghost);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 900, 20, 1, true).translate(0, 450, 0), pillarMaterial(0x6affa0)); beam.position.y = 22; beam.material.uniforms.op.value = 0.85; g.add(beam);
      g.lookAt(pts[1]); beam.quaternion.copy(g.quaternion).invert(); world.scene.add(g);
      gt = gates[p.id] = { g, ring, halo, beam, pts, chev, ghost };
    }
    const active = !G.ring && !boss && !G.campFight; gt.g.visible = gt.ghost.visible = active;
    if (active) gt.chev.forEach((c, k) => { c.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 5 - k * 0.9)); });
    if (!active) continue;
    gt.halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08); gt.beam.material.uniforms.t.value = t; gateMat.emissiveIntensity = 1.3 + Math.sin(t * 4) * 0.4;
    const d = f.pos.distanceTo(gt.pts[0]);
    if (d < 400 && gateHint !== p.id) { gateHint = p.id; vo('ring-gate'); toast(p.name + '! Fly through the green ring at the bottom of the beam to start the race.', 3600); }
    if (d < 28 && !f.perch) { startRing(p); return; }
  }
}
function startRing(p) {
  const pts = ringPath(p), meshes = pts.map((v, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(18, 2, 8, 32), i === 1 ? ringNext : ringMat); if (i === 0) m.visible = false; m.position.copy(v); const nx = pts[(i + 1) % pts.length]; m.lookAt(nx); world.scene.add(m); return m; });
  let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  G.ring = { p, pts, meshes, i: 1, t: 0, par: len / 38 }; sfx.unlock(); combat.clear(); $('hud').classList.add('ringOn'); world.fly.soar = false;
  const other = G.boy === 'Caleb' ? 'Ezra' : 'Caleb', ob = G.data[other] && G.data[other].rings[p.id];
  $('ringTargets').innerHTML = [['Gold', 1, 'oklch(0.86 0.15 88)'], ['Silver', 1.45, 'oklch(0.86 0.01 250)'], ['Bronze', 2.1, 'oklch(0.66 0.1 55)']].map(m => `<div><span class="dot" style="background:${m[2]}"></span><span>${m[0]}</span><span>${fmt(G.ring.par * m[1])}</span></div>`).join('') + (ob ? `<div style="color:oklch(0.85 0.09 235)"><span></span><span>${other}'s best</span><span>${fmt(ob)}</span></div>` : '');
  (vo('ring-go', 3), flash)('Go!'); gateHint = null;
}
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function endRing(done) {
  const R = G.ring; R.meshes.forEach(m => world.scene.remove(m)); G.ring = null; $('hud').classList.remove('ringOn');
  if (!done) return; const s = G.save, t = R.t, best = s.rings[R.p.id], medal = t <= R.par ? 'Gold' : t <= R.par * 1.45 ? 'Silver' : t <= R.par * 2.1 ? 'Bronze' : '';
  if (!best || t < best) s.rings[R.p.id] = t; s.found[R.p.id] = true; if (medal === 'Gold' && !s.colours) s.colours = []; if (medal) s.gems += { Gold: 50, Silver: 30, Bronze: 15 }[medal];
  const other = G.boy === 'Caleb' ? 'Ezra' : 'Caleb', ob = G.data[other] && G.data[other].rings[R.p.id];
  const rows = [['Your time', fmt(t) + (!best || t < best ? '  NEW BEST' : '')], ['Your best', fmt(Math.min(t, best || t))]]; if (ob) rows.push([other + "'s best", fmt(ob)]);
  sfx.unlock(); scr.result(R.p.name, medal, rows, () => toGate(R.p), () => {}); G.persist();
  vo(ob && t < ob ? 'ring-beatbro' : medal ? 'ring-' + medal.toLowerCase() : (!best || t < best) ? 'ring-best' : 'ring-done', 3);
}
function toGate(p) {
  const pts = ringPath(p), f = world.fly, dir = pts[1].clone().sub(pts[0]).normalize();
  f.perch = null; f.pos.copy(pts[0]).addScaledVector(dir, -160); f.yaw = Math.atan2(dir.x, dir.z); f.pitch = 0; f.speed = 40;
  f.cam.copy(f.pos).addScaledVector(dir, -40).y += 12; gateHint = null;
}
function updateRing(dt) {
  const R = G.ring; R.t += dt; $('ringTime').textContent = fmt(R.t); $('ringCount').textContent = `Ring ${R.i} / ${R.pts.length - 1}`; const rk = Math.round(world.fly.speed * 3.6); $('ringSpd').textContent = rk; $('ringSpd').parentElement.classList.toggle('fast', rk > 200);
  if (world.fly.pos.distanceTo(R.pts[R.i]) < 26) { sfx.ching(); R.meshes[R.i].visible = false; R.i++; if (R.i >= R.pts.length) return endRing(true); R.meshes[R.i].material = ringNext; }
  if (R.t > R.par * 4) { (vo('ring-timeout', 3), toast)('Ring run timed out.'); endRing(false); }
}

// ---------- "?" light pillars: a soft beam over undiscovered spots within 500 m ----------
const QP = []; let qpGeo = null;
function updatePillars(dt, t) {
  const s = G.save, f = world.fly; if (!qpGeo) qpGeo = new THREE.CylinderGeometry(7, 7, 420, 20, 1, true).translate(0, 210, 0);
  const near = [];
  for (const p of PLACES) {
    if (s.found[p.id] || !s.seen[p.id] || p.kind === 'favour' || p.kind === 'tower' || p.kind === 'champion' || p.kind === 'ring' || (p.alt && !s.open.includes('sky'))) continue;
    const [x, z] = toWorld(p.u, p.v), d = Math.hypot(x - f.pos.x, z - f.pos.z); if (d < 520) near.push([d, p, x, z]);
  }
  near.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < 6; i++) {
    let q = QP[i]; if (!q) { q = QP[i] = new THREE.Mesh(qpGeo, pillarMaterial(0xd49aff)); q.frustumCulled = false; world.scene.add(q); }
    const n = near[i]; if (!n) { q.material.uniforms.op.value = Math.max(0, q.material.uniforms.op.value - dt); q.visible = q.material.uniforms.op.value > 0; continue; }
    const want = Math.min(1, (520 - n[0]) / 220) * 0.55; q.visible = true; q.position.set(n[2], placeY(n[1]) - 6, n[3]);
    const u = q.material.uniforms; u.op.value += (want - u.op.value) * Math.min(1, dt * 3); u.t.value = t;
    if (G.waypoint && G.waypoint.id === n[1].id) u.col.value.setHex(0x7fc8ff); else u.col.value.setHex(0xd49aff);
  }
}

// ---------- Fog + discovery ----------
function reveal(x, z, rad) {
  const s = G.save, [u, v] = toUV(x, z), ci = (u + 1) / 2 * GW, cj = (v + 1) / 2 * GH, ri = rad / (28800 / GW), rj = rad / (15000 / GH);
  for (let j = Math.floor(cj - rj); j <= Math.ceil(cj + rj); j++) for (let i = Math.floor(ci - ri); i <= Math.ceil(ci + ri); i++) { if (i < 0 || j < 0 || i >= GW || j >= GH) continue; if (((i - ci) / ri) ** 2 + ((j - cj) / rj) ** 2 <= 1) s.fog[j * GW + i] = 1; }
}
function discover() {
  const s = G.save, f = world.fly;
  for (const p of PLACES) {
    const [x, z] = toWorld(p.u, p.v), d = Math.hypot(f.pos.x - x, f.pos.z - z);
    if (d < 1300 && !s.seen[p.id] && p.kind !== 'champion') { s.seen[p.id] = true; if (['city', 'town', 'landmark'].includes(p.kind) && d > 600) (vo('find-spotted', 1), toast)('Spotted: ' + p.name); }
    if (s.found[p.id]) continue;
    const wet = !p.water || f.pos.y < -6;
    if (p.water && !wet && d < 90 && !(G._wetHint || (G._wetHint = {}))[p.id]) { G._wetHint[p.id] = 1; vo(s.dragon === 'Tide' ? 'find-glint' : 'find-glintno'); toast(s.dragon === 'Tide' ? 'Something glints under the waves! Hold Dive to swim down.' : 'Something glints under the waves… only Tide can dive this deep.', 3200); }
    if (!wet) continue;
    if (p.kind === 'chest' && d < 60 && Math.abs(f.pos.y - placeY(p)) < 90) { s.found[p.id] = true; s.gems += 25; sfx.ching(); (vo('find-chest', 2), banner)('Hidden chest!', '+25 gems'); }
    else if (p.kind === 'statue' && d < 70) { s.found[p.id] = true; const n = PLACES.filter(q => q.kind === 'statue' && q.r === p.r && s.found[q.id]).length; sfx.light(); const tot = PLACES.filter(q => q.kind === 'statue' && q.r === p.r).length; (vo(n === tot ? 'find-statues' : 'find-statue', 2), toast)(`Dragon statue ${n} of ${tot}: “The old riders flew here.”`, 3000); if (n === tot) { s.gems += 80; banner(`All ${tot} statues!`, '+80 gems'); } }
    else if (p.id === 'sky_whales') { if (world.props.whales.some(wh => wh.position.distanceTo(f.pos) < 220)) { s.found[p.id] = true; s.gems += 50; sfx.unlock(); (vo('find-whales', 3), banner)('Sky Whales!', 'They sing as you fly beside them. +50 gems'); } }
    else if (p.land) { /* found by landing on it */ }
    else if (['city', 'town', 'village', 'hamlet', 'landmark', 'secret'].includes(p.kind) && d < 320) { s.found[p.id] = true; (vo('find-discovered', 1), toast)('Discovered: ' + p.name); }
    else if (p.kind === 'ring' && d < 220 && !G.ring) { /* offered via action button */ }
  }
  RIDS.concat(['sky']).forEach(r => { if (s.open.includes(r) && regionPct(s, r) >= 90) regionPlaces(r).forEach(p => { if (!s.found[p.id] && !s.seen[p.id]) { s.seen[p.id] = true; if (!s.hinted) { s.hinted = 1; (vo('find-almost', 2), toast)('Almost done! The last places are marked “?” on your Atlas.', 3500); } } }); });
  RIDS.concat(['sky']).forEach(r => { if (!s.fanfare[r] && s.open.includes(r) && regionPct(s, r) >= 100) { s.fanfare[r] = true; s.gems += 200; scr.fanfare(r, ['Landmarks', 'Dragon Towers', 'Chests', 'Camps cleared', 'Ring Runs', 'Favours', 'Champion beaten']); } });
  G.persist();
}

// ---------- Combat hooks ----------
let chingT = 0;
G.collect = (kind, val) => { const now = performance.now(); if (kind === 'gem') { G.save.gems += val; if (now - chingT > 70) { sfx.ching(); chingT = now; } } else { G.hearts = Math.min(maxHearts(), G.hearts + 1); sfx.ching(); } G.persist(); };
// A whole group gone: Info line + a victory sting. Camps and champions keep their own messages.
G.onKill = e => {
  if (e === boss) { bossDown(); return; }
  if (e.group === 'boss' || e.group === 'camp') return;
  if (!combat.alive(e.group)) { const n = (G.killCount = (G.killCount || 0) + 1); flash(['Sky cleared!', 'All gone!', 'Victory!', 'Nice flying!'][n % 4], 1600); vo('combat-clear' + (1 + (n % 4))); sfx.cleared(); }
};
G.hurt = () => {
  if (settings.inf) { world.fly.shake = 0.3; return; }
  if (G.hearts <= 0 || G.pendingCrash || G.menu === 'crash') return;
  G.hearts--; G.invuln = 1.3; world.fly.shake = 0.6; sfx.hurt(); (vo(G.hearts === 1 ? 'combat-lowhp' : 'combat-ouch', 1), flash)('Ouch!', 600);
  if (G.hearts <= 0) G.pendingCrash = () => {
    const s = G.save, loss = Math.min(30, Math.floor(s.gems * 0.15)); s.gems -= loss; combat.clear(); boss = null; bossHud(false); G.campFight = null; if (G.ring) endRing(false);
    if (G.quest && G.quest.type === 'fight') G.quest.spawned = false;
    const home = place(s.lastRoost) || place('aerie');
    const f = world.fly; f.input.x = f.input.y = 0; held.flap = held.dive = false; f.soar = false;
    scr.crash(`You crash-landed at ${home.name}.`, loss, () => { G.hearts = maxHearts(); G.invuln = 2; f.frozen = null; G.travel(home); G.persist(); });
  };
};

// ---------- Main frame ----------
const windPts = WIND.map(c => { const out = []; for (let i = 0; i < c.length - 1; i++) for (let k = 0; k < 8; k++) { const t = k / 8, u = c[i][0] + (c[i + 1][0] - c[i][0]) * t, v = c[i][1] + (c[i + 1][1] - c[i][1]) * t, [x, z] = toWorld(u, v); out.push([x, z, u, v]); } return out; });
let slow = 0, hudT = 0, discT = 0, lastSafe = new THREE.Vector3(), barrierT = 0, regenT = 0, calmT = 0, fps = 0, fpsN = 0, fpsT = 0, lastPos = new THREE.Vector3(), regionShown = '';
// Time of day: 5 min each of golden → midday → golden → dusk, with a 2 min crossfade between. The pause menu can jump or lock it.
const TOD_ORDER = ['golden', 'day', 'golden', 'dusk'], TOD_HOLD = 300, TOD_FADE = 120, TOD_SEG = TOD_HOLD + TOD_FADE;
function todState(t) { const n = TOD_ORDER.length, i = Math.floor(t / TOD_SEG) % n, l = t % TOD_SEG, k = l < TOD_HOLD ? 0 : (l - TOD_HOLD) / TOD_FADE; return { a: TOD_ORDER[i], b: TOD_ORDER[(i + 1) % n], k: k * k * (3 - 2 * k), now: k < 0.5 ? TOD_ORDER[i] : TOD_ORDER[(i + 1) % n] }; }
function applyTOD() { const st = todState(settings.todT || 0); world.setTOD(st.a, st.b, st.k); document.querySelectorAll('#todSeg button').forEach(b => b.classList.toggle('on', b.dataset.tod === st.now)); $('todLock').classList.toggle('on', !!settings.todLock); $('todLock').querySelector('.ms').textContent = settings.todLock ? 'lock' : 'lock_open'; }
let todApplyT = 0;
function frame(dt, t) {
  tickMusic(); if (G.mode !== 'play') setMusic('title', false); else { setMusicHome(G.region); setMusic(G.region, !!(G.ring || boss || G.campFight || (combat && combat.alive()))); } if (G.deco) G.deco.update(dt); monTick(performance.now());
  if (G.mode === 'play' && !G.menu && !settings.todLock) settings.todT = (settings.todT || 0) + dt;
  todApplyT -= dt; if (todApplyT <= 0 && world) { todApplyT = 0.5; applyTOD(); }
  if (G.pendingCrash) { const pc = G.pendingCrash; G.pendingCrash = null; pc(); }
  if (G.mode !== 'play') { wind(0, true); return; }
  const f = world.fly, s = G.save;
  f.vel = (f.vel || new THREE.Vector3()).copy(f.pos).sub(lastPos).divideScalar(Math.max(dt, 0.001)); lastPos.copy(f.pos);
  if (G.menu) { wind(0, true); f.input.x = f.input.y = 0; f.input.flap = f.input.dive = false; if (!f.perch) { f.frozen = f.frozen || f.pos.clone(); f.pos.copy(f.frozen); } return; }
  f.frozen = null;
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
  // input → flight
  const ms = maxStam(); const flapping = held.flap && G.stam > 1 && !f.perch;
  G.stam = Math.max(0, Math.min(ms, G.stam + (flapping ? -28 : f.perch ? 45 : 14) * dt));
  f.input.x = stickS.on ? stickS.x : keyX(); f.input.y = stickS.on ? stickS.y : keyY();
  if (!stickS.on) $('knob').style.transform = (keyX() || keyY()) ? `translate(${keyX() * 54}px,${keyY() * 54}px)` : ''; f.input.flap = flapping; f.input.dive = held.dive && !f.perch;
  if (flapping) { flapT -= dt; if (flapT <= 0) { sfx.flap(); flapT = 0.45; } }
  const g = world.groundAt(f.pos.x, f.pos.z), agl = f.pos.y - Math.max(g, 0);
  f.canSwim = s.dragon === 'Tide';
  G.invuln = Math.max(0, G.invuln - dt); G.rollT = Math.max(0, G.rollT - dt); breathCD -= dt;
  // wind streams
  let inWind = false; if (!f.soar && !f.perch) for (const c of windPts) for (const w of c) { if (Math.abs(w[0] - f.pos.x) < 90 && Math.abs(w[1] - f.pos.z) < 90 && Math.abs(f.pos.y - (Math.max(height(w[2], w[3]), 0) + 260)) < 90) { inWind = true; break; } }
  if (inWind && !f.boost) (vo('find-wind', 1), toast)('Wind stream! Wheee!'); f.boost = inWind ? 70 : Math.max(0, (f.boost || 0) - 40 * dt);
  // region + barriers
  const [u, v] = toUV(f.pos.x, f.pos.z), w = weights(u, v), ri = w.indexOf(Math.max(...w));
  let region = RIDS[ri]; const sd = Math.hypot((u - SKY_ISLES.u) * 1.92, v - SKY_ISLES.v); if (f.pos.y > 1650 && sd < 0.32) region = 'sky';
  const locked = !s.open.includes(region) && (region === 'sky' || w[ri] > 0.62);
  if (locked) { f.pos.copy(lastSafe); f.yaw += Math.PI * 0.85; f.speed = 30; f.shake = 0.4; f.soar = false; if (barrierT <= 0) { toast(BARRIER[region], 3200); vo('barrier-' + region, 3); sfx.boom(); barrierT = 3.5; } } else { lastSafe.copy(f.pos); G.region = region; }
  barrierT -= dt;
  if (G.region !== regionShown) { regionShown = G.region; const el = $('regionName'); el.textContent = RNAME[G.region]; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); vo('region-' + ['hearthvale', 'cinder', 'stormcrown', 'frostfang', 'reach', 'sky'].indexOf(G.region)); }
  // soar
  const enemiesNear = combat.alive();
  if (f.soar && (agl < 200 || enemiesNear)) { f.soar = false; $('btnSoar').classList.remove('on'); if (enemiesNear) (vo('combat-enemies', 1), flash)('Enemies!'); }
  // Soar: a faded "ghost" below 350 m whose ring fills as you climb; it lights up and pulses once when you're high enough.
  { const b = $('btnSoar'), avail = !enemiesNear && !f.perch && !G.ring, ready = agl > 350 || f.soar;
    b.classList.toggle('hidden', !avail && !f.soar); b.classList.toggle('ghost', avail && !ready);
    b.style.setProperty('--fill', Math.max(0, Math.min(1, agl / 350)).toFixed(3));
    if (ready && avail && !G._soarReady) { G._soarReady = true; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); vo('find-soargo', 1); } if (!ready) G._soarReady = false; }
  // egg
  if (s.egg && !s.egg.carrying) { placeEgg(); if (eggMesh) { eggMesh.rotation.y += dt; if (f.pos.distanceTo(eggMesh.position) < 45) { world.scene.remove(eggMesh); eggMesh = null; s.egg.carrying = true; G.carrying = true; sfx.unlock(); (vo('egg-got', 3), banner)('Got the egg!', 'Fly it home to the Aerie! Raiders will chase you.'); G.nextFight = 6; G.persist(); } } }
  if (G.carrying && f.pos.distanceTo(world.props.aerieTop) < 260 && !G.menu) hatchEgg();
  // encounters
  if (!f.perch && !G.ring && !boss && !G.campFight && !enemiesNear && s.open.includes(G.region)) { G.nextFight -= dt * (G.carrying ? 2 : 1); if (G.nextFight <= 0) { G.nextFight = (G.carrying ? 14 : 30) + Math.random() * 30; combat.spawnGroup(G.region, f.pos, 'roam', G.carrying ? 1 : 0); } }
  combat.update(dt);
  if (boss) { $('bossFill').style.width = Math.max(0, boss.hp / boss.max * 100) + '%'; $('bossPhase').textContent = 'Phase ' + Math.min(3, 1 + Math.floor((1 - boss.hp / boss.max) * 3)) + ' of 3'; if (f.pos.distanceTo(boss.m.position) > 2600) { combat.clear(); boss = null; bossHud(false); G.rematch = false; (vo('champ-left', 2), toast)('The champion waits at its nest.'); } }
  checkChampion(dt); updateCamps(); updateQuest(); updateWaypoint(); updateNest(); updatePillars(dt, t); updateGates(dt, t); if (G.ring) updateRing(dt);
  // hearts regen
  calmT = enemiesNear ? 0 : calmT + dt; regenT += dt;
  if (regenT > (f.perch ? 2.5 : 10) && (calmT > 6 || f.perch) && G.hearts < maxHearts()) { regenT = 0; G.hearts++; }
  // periodic
  discT += dt; if (discT > 0.5) { discT = 0; reveal(f.pos.x, f.pos.z, f.soar ? 1800 : 1000); discover(); }
  // action button
  G.action = null; let act = null;
  const cAt = !boss && !G.ring && !G.carrying && s.champs[G.region] && champAt(G.region);
  if (cAt && Math.hypot(...toWorld(cAt.u, cAt.v).map((c, i) => c - (i ? f.pos.z : f.pos.x))) < 500) { act = ['swords', 'REMATCH']; G.action = () => { if (f.perch) takeOff(); spawnChampion(G.region, cAt, true); }; }
  else if (!f.perch && !G.ring && !boss) {
    { let best = null, bd = 130; for (const sp of SPOTS) { if (sp.p.alt && !s.open.includes('sky')) continue; const d = Math.hypot(sp.pos.x - f.pos.x, sp.pos.z - f.pos.z); if (d < bd + (['city', 'town'].includes(sp.p.kind) ? 110 : 0) && (f.pos.y - sp.pos.y) < 150 && (f.pos.y - sp.pos.y) > -60) { bd = d; best = sp; } } if (best) { act = ['flight_land', 'LAND']; G.action = () => land(best); } }
  } else if (f.perch && G.perchAt && G.perchAt.p.kind === 'roost') { act = ['pets', 'DRAGONS']; G.action = () => scr.openAerie(false); }
  else if (f.perch && G.perchAt && G.perchAt.p.kind === 'home') { act = ['home', 'AERIE']; G.action = () => scr.openAerie(true); }
  show('btnAction', !!act); if (act) { $('actIcon').textContent = act[0]; $('actLbl').textContent = act[1]; }
  $('flapIcon').textContent = f.perch ? 'flight_takeoff' : 'keyboard_double_arrow_up'; $('flapLbl').textContent = f.perch ? 'TAKE OFF' : 'FLAP';
  $('btnBreath').classList.toggle('off', G.carrying); $('btnBreath').classList.toggle('glow', !!(f.perch && G.perchAt && G.perchAt.p.kind === 'tower' && !s.lit[G.perchAt.p.id]));
  ['stick', 'stickZone', 'btnDive', 'btnDodge'].forEach(id => $(id).classList.toggle('hidden', !!f.perch));
  wind(f.perch ? 0 : f.speed); $('speedLines').style.opacity = f.soar ? 0.85 : held.dive || f.boost > 20 ? 0.7 : 0;
  hudT += dt; if (hudT > 0.1) { hudT = 0; drawHud(); }
  Object.keys(s.lit).forEach(addPillar);
}

// ---------- HUD ----------
const proj = new THREE.Vector3();
// Keep the compass centred unless it would touch "← Games" or the hearts pill; then slide/shrink it with a fixed gap.
function layoutTop() {
  const hud = $('hud').getBoundingClientRect(); if (!hud.width) return;
  const GAP = 12, back = $('backBtn').getBoundingClientRect(), pill = $('statPill').getBoundingClientRect();
  const gp = $('gemPill'); gp.style.left = (back.right - hud.left + GAP) + 'px'; const gemR = gp.getBoundingClientRect().right;
  const minL = gemR - hud.left + GAP, maxR = pill.left - hud.left - GAP, W = Math.max(360, Math.min(600, maxR - minL));
  let left = hud.width / 2 - W / 2; if (left + W > maxR) left = maxR - W; if (left < minL) left = minL;
  const cx = left + W / 2;
  for (const id of ['compass', 'bossBar']) { const el = $(id); el.style.left = left + 'px'; el.style.width = W + 'px'; el.style.marginLeft = '0px'; }
  $('caret').style.left = cx + 'px';
}
addEventListener('resize', layoutTop);
function drawHud() {
  layoutTop();
  const s = G.save, f = world.fly, W = innerWidth, H = innerHeight;
  $('gems').textContent = s.gems; const mh = maxHearts();
  const kmh = Math.round((f.perch ? 0 : f.speed) * 3.6);
  $('spd').textContent = kmh; $('spdBox').classList.toggle('fast', kmh > 200);
  $('alt').textContent = Math.max(0, Math.round(f.pos.y - Math.max(world.groundAt(f.pos.x, f.pos.z), 0)));
  $('btnInf').classList.toggle('on', !!settings.inf); $('hearts').classList.toggle('inf', !!settings.inf);
  $('hearts').innerHTML = settings.inf ? '<span class="ms">favorite</span><span class="ms" style="font-size:22px">all_inclusive</span>' : Array.from({ length: mh }, (_, i) => `<span class="ms ${i < G.hearts ? '' : 'off'}">favorite</span>`).join('');
  $('gems').textContent = s.gems > 9999 ? (s.gems / 1000).toFixed(s.gems > 99999 ? 0 : 1) + 'k' : s.gems;
  $('ring').style.background = `conic-gradient(oklch(0.86 0.12 210) ${(G.stam / maxStam() * 360).toFixed(0)}deg, rgba(255,255,255,0.18) 0deg)`;
  // compass
  const items = [];
  const bearing = (x, z) => { let a = Math.atan2(x - f.pos.x, z - f.pos.z) - f.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); return -a; };
  [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].forEach(([l, dx, dz]) => items.push([bearing(f.pos.x + dx * 1e5, f.pos.z + dz * 1e5), `<span style="left:{x}px">${l}</span>`]));
  for (const p of PLACES) { if (s.found[p.id] || !s.seen[p.id] || p.kind === 'favour') continue; const [x, z] = toWorld(p.u, p.v); if (Math.hypot(x - f.pos.x, z - f.pos.z) > 2600) continue; items.push([bearing(x, z), `<span class="poi" style="left:{x}px">?</span>`]); }
  const wp = G.waypoint ? toWorld(G.waypoint.u, G.waypoint.v) : null;
  if (G.quest) items.push([bearing(G.quest.pos.x, G.quest.pos.z), `<span class="poi fav" style="left:{x}px">!</span>`]);
  if (wp) items.push([bearing(wp[0], wp[1]), `<span class="poi way" style="left:{x}px">?</span>`]);
  const km = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m';
  const row = (cls, mark, title, sub, x, z) => { const b = bearing(x, z), d = Math.hypot(x - f.pos.x, z - f.pos.z); return `<div class="trk ${cls}"><span class="bang">${mark}</span><span class="col grow"><b>${title}</b><small>${sub}</small></span><span class="dist"><span class="ms arrow" style="transform:rotate(${(b * 180 / Math.PI).toFixed(0)}deg)">navigation</span><b>${km(d)}</b></span></div>`; };
  let trk = '';
  if (G.quest) trk += row('fav', '!', G.quest.name || 'Favour', G.quest.text, G.quest.pos.x, G.quest.pos.z);
  if (wp) trk += row('way', '?', 'Something to discover', RNAME[G.waypoint.r] || '', wp[0], wp[1]);
  if (G.carrying) trk += row('home', '<span class="ms" style="font-size:18px">home</span>', 'Fly the egg home', 'The Aerie', world.props.aerieTop.x, world.props.aerieTop.z);
  $('questTrack').innerHTML = trk; show('questTrack', !!trk);
  if (G.carrying) items.push([bearing(world.props.aerieTop.x, world.props.aerieTop.z), `<span class="poi home ms" style="left:{x}px;font-size:16px;line-height:18px">home</span>`]);
  if (s.egg && !s.egg.carrying) items.push([bearing(s.egg.pos[0], s.egg.pos[2]), `<span class="poi ms" style="left:{x}px;font-size:16px;line-height:18px">egg</span>`]);
  const cw = $('compassStrip').clientWidth || 424, ch = cw / 2; $('compassStrip').innerHTML = items.filter(i => Math.abs(i[0]) < Math.PI / 2).map(i => i[1].replace('{x}', (ch + i[0] / (Math.PI / 2) * (ch - 12)).toFixed(0))).join('');
  // reticle + edge alerts
  const tgt = combat.nearest(); const ret = $('reticle');
  if (tgt && !G.carrying) { proj.copy(tgt.m.position).project(world.camera); if (proj.z < 1) { ret.style.left = ((proj.x + 1) / 2 * W) + 'px'; ret.style.top = ((1 - proj.y) / 2 * H) + 'px'; show('reticle'); } else show('reticle', false); } else show('reticle', false);
  let edges = ''; for (const e of combat.enemies) { if (!e.alive || e.sub) continue; proj.copy(e.m.position).project(world.camera); const off = proj.z > 1 || Math.abs(proj.x) > 1 || Math.abs(proj.y) > 1; if (!off || e.m.position.distanceTo(f.pos) > 800) continue; let x = proj.x, y = proj.y; if (proj.z > 1) { x = -x; y = -y; } const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x /= m; y /= m; const ang = Math.atan2(-y, x) * 180 / Math.PI + 90, warn = (e.warnK || 0) > 0.3; edges += `<div class="edge${warn ? ' warn' : ''}" style="left:${((x * 0.9 + 1) / 2 * W).toFixed(0)}px;top:${((1 - y * 0.85) / 2 * H).toFixed(0)}px"><img src="${tagURL()}" alt="" style="transform:rotate(${ang.toFixed(0)}deg)"></div>`; }
  $('edges').innerHTML = edges;
}
