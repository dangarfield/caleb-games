// game.js — Sus Guy Station: loop logic, input, UI wiring
import { THREE, loadMan, loadProps, loadHelp, Ls, R, Lm, UX, UZ, C, RECT, inR, canStand, ANOMALIES, FOCUS, tex, signCanvas, drawSign, buildStatic, buildMain, buildExit, disposeGroup } from './world.js';
import * as SFX from './audio.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = id => document.getElementById(id);
const PLAYERS = [{ id: 'caleb', name: 'Caleb', col: C.orange }, { id: 'ezra', name: 'Ezra', col: C.teal }];
const fmt = s => s == null ? '–:––' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- save (arcade-store, IndexedDB) ----------
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0, save = { players: { caleb: { done: 0, best: null }, ezra: { done: 0, best: null } }, last: null, music: 0.5, seen: {} };
const Store = typeof ArcadeStore === 'function' ? ArcadeStore('sus-guy-station') : { ready: cb => cb(), get: () => null, set() {}, conflict: () => null };
function persist() {
  if (Store.conflict()) return false;
  gen += 1; Store.set(null, Object.assign({}, save, { gen, sid: SID }), { guard: true }); return true;
}

// ---------- renderer & scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene(), fogCol = new THREE.Color(C.fog);
scene.background = fogCol; scene.fog = new THREE.Fog(fogCol, 30, 140);
const camera = new THREE.PerspectiveCamera(66, 1, 0.05, 120); camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(C.lamp, C.floor, 1.9); scene.add(hemi);
const dir = new THREE.DirectionalLight(C.lamp, 0.6); dir.position.set(0.6, 4, 2); scene.add(dir);
const signC = signCanvas(), signTex = tex(signC);
// three.js GlitchPass, only rendered through during a glitch, so normal frames cost nothing extra. Built up front and
// warmed at load (see compileAll and the boot code) so the first glitch doesn't stall compiling shaders
let composer = null, glitchPass = null, glitchUntil = 0;
function initComposer() {
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  glitchPass = new GlitchPass(); glitchPass.goWild = true; composer.addPass(glitchPass); composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
}
initComposer();
// precompile for the screen AND for the composer's render target: drawing into a render target needs different
// shader variants (linear output), so without the second pass every material recompiled on the first glitch frame
function compileAll() {
  renderer.compile(scene, camera);
  const rt = renderer.getRenderTarget(); renderer.setRenderTarget(composer.renderTarget1); renderer.compile(scene, camera); renderer.setRenderTarget(rt);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); } camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  document.documentElement.style.setProperty('--s', Math.min(innerWidth / 1333, innerHeight / 690));
}
addEventListener('resize', resize); resize();

// ---------- game state ----------
let mode = 'home', overlay = null, sel = null;
let count = 0, lapA = null, prevA = null, lapMode = 'lap', visitedM = false, normalStreak = 0, used = new Set();
let M = null, MP = null, timer = 0, t = 0, shownSign = -1, debugOn = false;
const p = { prevZ: 0, x: Ls - 1.2, z: 0, yaw: Math.PI / 2, pitch: 0, prevX: Ls - 1.2, bob: 0, stepAcc: 0, turn: 0 };
let walked = 0, turned = false, hintT = 0, rumbleT = 12, strummed = false, rattleT = 0;
const mLocal = (x, z) => ({ x: x - (Ls + R), z: z + R });

const nm = () => sel ? sel.name : '';
const buildLap = (id, exit, live) => exit ? buildExit() : buildMain(id, live, nm());
let M2 = null, planBack = { id: null, streak: 1 }, planFwd = { id: null, streak: 1 };
function rebuildM() {
  if (M) disposeGroup(M);
  M = buildLap(lapA, lapMode === 'exit', true);
  M.position.set(Ls + R, 0, -R); scene.add(M); strummed = false;
  compileAll();
}
// Passage past corner A. rotated: what a turn-back fold brings round (or the lap behind you after one).
// Not rotated: the lap you just walked, as seen behind you after keeping going.
function setMP(id, exit, rotated) {
  if (MP) disposeGroup(MP);
  MP = buildLap(id, exit, false);
  if (rotated) { MP.position.set(-R, 0, R); MP.rotation.y = Math.PI; } else MP.position.set(-R, 0, R + Lm);
  scene.add(MP); compileAll();
}
// Passage past the far corner: the real next lap if you keep going, already built, so nothing pops in.
function setM2() {
  if (M2) disposeGroup(M2);
  M2 = buildLap(planFwd.id, planFwd.exit, false); M2.position.set(UX + Ls + R, 0, UZ - R); scene.add(M2);
}
// Platform 5 is a safe spot: once you've reached it, a wrong call only sends you back to 5, not 0 (for the rest of this run)
const SAFE = 5;
const backTo = n => n >= SAFE ? SAFE : 0;
function plan() {
  if (lapMode === 'exit') planBack = planFwd = { id: null, streak: 0 };
  else { planBack = planNext(lapA ? count + 1 : backTo(count)); planFwd = planNext(lapA ? backTo(count) : count + 1); }
  setM2(); if (visitedM && lapMode === 'lap') setMP(planBack.id, planBack.exit, true);
  compileAll();
}
function setSign(n) { if (n !== shownSign) { drawSign(signC, n); signTex.needsUpdate = true; shownSign = n; } }

const GOAL = 10;   // levels to get out
function planNext(cnt) {
  if (cnt >= GOAL) return { id: null, streak: 0, exit: true };
  // level 0 normal; 1 obvious; 2-6 random tier; 7-9 sneaky; 10 is the way out
  if (cnt === 0) return { id: null, streak: 1 };
  if (cnt !== 1 && normalStreak < 2 && Math.random() < 0.5) return { id: null, streak: normalStreak + 1 };
  const tier = cnt === 1 ? 'Obvious' : cnt >= 7 ? 'Sneaky' : ['Obvious', 'Noticeable', 'Sneaky'][Math.floor(Math.random() * 3)];
  let pool = ANOMALIES.filter(a => a.tier === tier && !used.has(a.id));
  if (!pool.length) pool = ANOMALIES.filter(a => !used.has(a.id));
  if (!pool.length) pool = ANOMALIES.filter(a => a.tier === tier);
  return { id: pool[Math.floor(Math.random() * pool.length)].id, streak: 0 };
}
function usePlan(pl) { normalStreak = pl.streak; if (pl.id) { if (used.size >= ANOMALIES.length) used.clear(); used.add(pl.id); } }

// photo of the change, taken from the old passage just before it is replaced
function snapshot(id) {
  const f = FOCUS[id]; if (!f || !M) return '';
  const ws = M.userData.walkers || [], keep = ws.map(b => [b.root.visible, b.root.position.z, b.root.rotation.y, b.root.position.x]);
  ws.forEach((b, i) => { b.root.visible = true; b.root.position.z = -12 - i * 0.2; if (b.lane != null) b.root.position.x = b.lane; b.root.rotation.y = id === 'A19' ? Math.PI : 0; b.root.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.opacity = 1; }); }); });
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 80);
  cam.position.copy(M.localToWorld(new THREE.Vector3(...f[1]))); cam.lookAt(M.localToWorld(new THREE.Vector3(...f[0])));
  const h = hemi.intensity; hemi.intensity = Math.max(h, 1.2);
  renderer.render(scene, cam); hemi.intensity = h;
  let url = ''; try { url = canvas.toDataURL('image/jpeg', 0.8); } catch (e) {}
  ws.forEach((b, i) => { [b.root.visible, b.root.position.z, b.root.rotation.y, b.root.position.x] = keep[i]; });  // he's still in view: put him back
  return url;
}

// The call is made when you leave the main passage: back into the first corner, or on into the far one.
// The sign only changes then, while it's out of sight, so seeing it never gives the answer away.
let committed = null;
function decide(turnedBack) {
  const had = lapA, correct = !!had === turnedBack, pl = turnedBack ? planBack : planFwd;
  let yay = null;
  if (correct) {
    count++; SFX.pass();
    if (count === SAFE && !safeShown) { safeShown = true; safeDue = true; }   // shown once the level-pass card (if any) is out of the way
    if (sel && !playedOnce()) { save.players[sel.id].played = true; persist(); }   // reached Platform 1: no more automatic How to play
    if (turnedBack && had && sel) {
      const s = save.players[sel.id]; s.found = s.found || {};
      if (!s.found[had]) { s.found[had] = true; persist(); yay = { img: snapshot(had), n: ANOMALIES.filter(a => s.found[a.id]).length }; }
    }
  } else {
    const reached = count, img = had ? snapshot(had) : '';
    count = backTo(count); SFX.fail().then(d => setTimeout(() => glitch(500), Math.max(0, d - 0.75) * 1000));   // glitch where level-fail's static builds (1.8-2.5 s)
    showOops(had, reached, img);
  }
  committed = { pl }; setSign(Math.min(count, GOAL)); updateDebug();
  if (yay) showYay(had, yay.img, yay.n); else if (safeDue) setTimeout(safeNote, 700);
}
// the "safe spot" note: once per run, when you first reach Platform 5. Small, clear words; fades away by itself.
let safeShown = false, safeDue = false, safeT = 0;
function safeNote() {
  safeDue = false; const n = $('safeNote'); clearTimeout(safeT);
  n.classList.add('show'); safeT = setTimeout(() => n.classList.remove('show'), 5500);
}
function safeNoteOff() { safeDue = false; clearTimeout(safeT); $('safeNote').classList.remove('show'); }
// geometry swap, out of sight: fold in the sign passage (turned back) or slide back one lap (kept going)
function swap(back) {
  const c = committed; committed = null;
  const had = lapA, wasExit = lapMode === 'exit';
  if (c) { usePlan(c.pl); lapMode = c.pl.exit ? 'exit' : 'lap'; lapA = c.pl.id; }
  setMP(had, wasExit, back);
  rebuildM(); visitedM = false; plan(); updateDebug();
}
// a brand-new find: the happy twin of the Oops card. Not shown for changes this player has found before.
function showYay(id, img, n) {
  overlay = 'yay'; ptrs.clear();
  const a = ANOMALIES.find(x => x.id === id);
  $('yayImg').classList.toggle('hidden', !img); if (img) $('yayImg').src = img;
  $('yayCard').style.gridTemplateColumns = img ? '324px 460px' : '620px';
  $('yayBig').textContent = a.say;
  $('yayCount').textContent = `That's ${n} of ${ANOMALIES.length} found. You're on Platform ${count} now!`;
  show('yay', '');
  const y = $('yay'); y.classList.remove('fadeUp'); void y.offsetWidth; y.classList.add('fadeUp');   // same quick fade-in as Oops (no glitch)
}
$('yayBtn').addEventListener('click', () => { overlay = null; show(null); if (safeDue) setTimeout(safeNote, 400); });
// the first lap, before you've reached the main passage: either way you go, it's still level 0
const atStart = () => lapMode === 'lap' && count === 0 && !lapA && !visitedM && !committed;
function transitions() {
  const mid = Ls / 2;
  if (lapMode === 'lap' && visitedM && !committed) {
    if (inR(RECT.C, p.x, p.z) && p.prevZ >= -R - Lm && p.z < -R - Lm) decide(false);
    else if (inR(RECT.M, p.x, p.z) || inR(RECT.B, p.x, p.z)) { if (p.prevZ <= -R - 0.5 && p.z > -R - 0.5) decide(true); }
    else if (inR(RECT.S, p.x, p.z) && p.prevX >= Ls && p.x < Ls) decide(true);   // spotted it from the corner and went straight back
  }
  if (inR(RECT.S, p.x, p.z) && p.prevX >= mid && p.x < mid) {          // middle of the sign passage, walking back: fold
    p.x = Ls - p.x; p.z = -p.z; p.yaw += Math.PI;
    if (committed) swap(true); else setMP(lapA, lapMode === 'exit', true);
  } else if (atStart() && inR(RECT.S, p.x, p.z) && p.prevX >= 0.6 && p.x < 0.6) {
    // turned round at the very start: fold you back into the sign passage facing the main passage, still level 0
    p.x = Ls - p.x; p.z = -p.z; p.yaw += Math.PI;
  } else if (inR(RECT.S2, p.x, p.z) && p.prevX < UX + mid && p.x >= UX + mid) {   // kept going: slide back one lap
    p.x -= UX; p.z -= UZ; swap(false);
  }
  if (!visitedM && ((inR(RECT.B, p.x, p.z) && p.x > Ls + 0.8) || inR(RECT.M, p.x, p.z))) { visitedM = true; if (lapMode === 'lap') setMP(planBack.id, planBack.exit, true); }
  p.prevX = p.x; p.prevZ = p.z;
}

// ---------- input ----------
const keys = {}, ptrs = new Map();
let firstPtr = null, downT = 0, moved = 0, lastUp = 0, lastShort = false, noWalk = false;
const canMove = () => mode === 'play' && !overlay;
// the Walk button (bottom left): walking only while it's held, so a finger on the screen is free to look around
const walkBtn = $('walkBtn'); let walkPtr = null;
function walkOff() { walkPtr = null; }
let walkDimT = 0;
function walkShow() {
  clearTimeout(walkDimT); walkBtn.classList.remove('hidden', 'in', 'dim'); void walkBtn.offsetWidth;
  walkBtn.classList.add('in'); walkDimT = setTimeout(() => walkBtn.classList.add('dim'), 10000);
}
function walkHide() { clearTimeout(walkDimT); walkBtn.classList.add('hidden'); walkBtn.classList.remove('in', 'dim'); walkOff(); }
walkBtn.addEventListener('pointerdown', e => {
  e.preventDefault(); SFX.ensureAudio(); if (!canMove()) return;
  try { walkBtn.setPointerCapture(e.pointerId); } catch (err) {}
  walkPtr = e.pointerId;
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => walkBtn.addEventListener(n, e => { if (e.pointerId === walkPtr) walkOff(); }));
function turnAround() { p.turn += Math.PI; turned = true; }
canvas.addEventListener('pointerdown', e => {
  SFX.ensureAudio(); if (!canMove()) return;
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.pointerType !== 'mouse' });
  const now = performance.now();
  if (ptrs.size === 1) {
    firstPtr = e.pointerId;
    if (now - lastUp < 320 && lastShort) { turnAround(); noWalk = true; }
    downT = now; moved = 0;
  }
});
canvas.addEventListener('pointermove', e => {
  const q = ptrs.get(e.pointerId); if (!q) return;
  const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (e.pointerId !== firstPtr || !canMove()) return;
  p.yaw -= dx * 0.005; p.pitch = Math.max(-0.45, Math.min(0.45, p.pitch - dy * 0.003)); moved += Math.abs(dx) + Math.abs(dy);
});
const up = e => {
  if (!ptrs.delete(e.pointerId)) return;
  if (!ptrs.size) { const now = performance.now(); lastShort = now - downT < 250 && moved < 14; lastUp = now; noWalk = false; firstPtr = null; }
};
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
document.addEventListener('contextmenu', e => e.preventDefault());
// keyboard is for debugging only and is never shown in the game
addEventListener('keydown', e => {
  if (e.target.id === 'dbgFilter') { if (e.key === 'Escape') e.target.blur(); return; }   // typing in the filter box isn't movement
  const k = e.key.toLowerCase(); keys[k] = true;
  if (k === 'escape') { if (dbgOpen) toggleDbg(false); else if (overlay === 'pause') resume(); else if (mode === 'play' && !overlay) pause(); }
  if (k === 'i' && mode !== 'win') openHowto();
  if (mode !== 'play') return;
  if (k === 'q') turnAround();
  if (k === 'p') toggleDbg();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; ptrs.clear(); });

// P: debug menu — pick this lap's change and the lap count
const ORDER = [null, ...ANOMALIES.map(a => a.id)];
let dbgOpen = false;
function setLap(id) { committed = null; if (count >= GOAL) count = GOAL - 1; lapMode = 'lap'; lapA = id; if (id) used.add(id); rebuildM(); plan(); setSign(count); updateDebug(); }
function setCount(n) {
  committed = null; count = n;
  if (n >= GOAL) { lapMode = 'exit'; lapA = null; rebuildM(); }
  else if (lapMode === 'exit') { lapMode = 'lap'; rebuildM(); }
  plan(); setSign(count); updateDebug();
}
function toggleDbg(force) {
  dbgOpen = force ?? !dbgOpen; $('dbg').classList.toggle('hidden', !dbgOpen);
  if (dbgOpen) { debugOn = true; ptrs.clear(); }
  updateDebug();
}
function renderDbg() {
  if (!dbgOpen) return;
  $('dbgCount').innerHTML = Array.from({ length: GOAL + 1 }, (_, i) => `<button data-c="${i}" class="${i === count ? 'on' : ''}">${i}</button>`).join('');
  $('dbgList').innerHTML = ORDER.map(id => {
    const a = ANOMALIES.find(x => x.id === id), on = lapMode === 'lap' && lapA === id;
    return `<button data-a="${id || ''}" class="${on ? 'on' : ''}">${a ? `<b>${a.id}</b> <i>${a.tier}</i> ${a.say}` : '<b>Normal</b> no change'}</button>`;
  }).join('');
  filterDbg();
}
// filter box: matches the id, the tier or the words, e.g. "a2", "sneaky", "sus guy"
function filterDbg() {
  const q = $('dbgFilter').value.trim().toLowerCase();
  $('dbgList').querySelectorAll('button').forEach(b => b.classList.toggle('hidden', !!q && !b.textContent.toLowerCase().includes(q)));
}
$('dbgFilter').addEventListener('input', filterDbg);
$('dbg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.c != null) setCount(+b.dataset.c); else if (b.dataset.a != null) setLap(b.dataset.a || null);
});
function updateDebug() {
  const el = $('debug'); renderDbg();
  if (!debugOn || mode !== 'play') return el.classList.add('hidden');
  const a = ANOMALIES.find(x => x.id === lapA);
  el.textContent = `DEBUG  lap ${count}  ·  ${lapMode === 'exit' ? 'EXIT' : a ? `${a.id} ${a.tier}: ${a.say}` : 'normal (no change)'}`;
  el.classList.remove('hidden');
}

// ---------- screens ----------
const screens = ['home', 'howto', 'pause', 'oops', 'yay', 'finds', 'win'];
function show(name, veil = '') {
  walkOff();   // any screen change lets go of Walk, so it can't stick on behind a menu
  screens.forEach(s => $(s).classList.toggle('hidden', s !== name));
  $('veil').className = veil; $('veil').classList.toggle('hidden', !name);
}
function renderHome() {
  $('cards').innerHTML = PLAYERS.map(pl => {
    const s = save.players[pl.id] || { done: 0, best: null }, nf = ANOMALIES.filter(a => s.found && s.found[a.id]).length;
    return `<button class="pcard${sel && sel.id === pl.id ? ' sel' : ''}" data-p="${pl.id}">
      <div style="display:flex;align-items:center;gap:16px"><div class="av" style="background:${pl.col}">${pl.name[0]}</div><div style="display:flex;flex-direction:column;gap:4px"><div class="nm">${pl.name}</div><div class="me">✓ Me!</div></div></div>
      <div class="stats"><div><small>Finished</small><strong>${s.done}</strong></div><div><small>Best time</small><strong class="${s.best == null ? 'none' : ''}">${fmt(s.best)}</strong></div><div style="grid-column:1 / -1"><small>Things found</small><div style="display:flex;align-items:center;gap:12px;margin-top:4px"><div style="flex:1;height:14px;border-radius:999px;background:#D9CCB4;overflow:hidden"><div style="height:100%;width:${nf / ANOMALIES.length * 100}%;background:#1F6F78"></div></div><b style="font-size:26px;font-weight:900;font-variant-numeric:tabular-nums">${nf} / ${ANOMALIES.length}</b></div></div></div></button>`;
  }).join('');
  const b = $('playBtn'); b.classList.toggle('off', !sel); b.textContent = sel ? `Play as ${sel.name} ▸` : 'Tap your name first';
  $('findsBtn').classList.toggle('hidden', !sel);
}
$('cards').addEventListener('click', e => {
  const c = e.target.closest('.pcard'); if (!c) return;
  SFX.ensureAudio(); sel = PLAYERS.find(x => x.id === c.dataset.p); renderHome();
});
function goHome() {
  nightTime();
  mode = 'home'; overlay = null; show('home', 'home'); renderHome();
  $('hud').classList.add('hidden'); $('pauseBtn').classList.add('hidden'); walkHide(); safeNoteOff(); $('hint').classList.add('hidden'); $('debug').classList.add('hidden');
  toggleDbg(false);
  count = 0; lapMode = 'lap'; lapA = null; visitedM = false; committed = null; rebuildM(); plan(); setSign(0);
  p.x = Ls + R; p.z = -R - 1.5; p.yaw = 0; p.pitch = 0;
}
function startRun() {
  nightTime();
  save.last = sel.id; persist();
  $('hudAv').textContent = sel.name[0]; $('hudAv').style.background = sel.col; $('hudName').textContent = sel.name;
  safeShown = false; safeNoteOff();
  count = 0; lapMode = 'lap'; used.clear(); normalStreak = 1; lapA = null; visitedM = false; committed = null;
  rebuildM(); setMP(null, false, true); plan(); setSign(0); updateDebug();
  Object.assign(p, { x: 1.5, z: 0, yaw: -Math.PI / 2, pitch: 0, prevX: 1.5, prevZ: 0, turn: 0 });
  timer = 0; walked = 0; turned = false; hintT = 0; mode = 'play'; overlay = null; show(null);
  $('hud').classList.remove('hidden'); $('pauseBtn').classList.remove('hidden'); walkShow();
  const h = $('hint'); h.classList.remove('hidden', 'fade');
  SFX.startAmbience();
}
// screen glitch: a short burst of shifted colour and torn bars over everything
function glitch(ms = 220) { if (!composer) initComposer(); glitchUntil = Math.max(glitchUntil, performance.now() + ms); }
const glitching = () => performance.now() < glitchUntil;
// the black curtain: faded by the frame loop, and see-through during a glitch so the glitched picture bursts through
const curtain = { from: 0, to: 0, t0: 0, ms: 1 };
function fadeCurtain(to, secs) { curtain.from = curtainK(); curtain.to = to; curtain.t0 = performance.now(); curtain.ms = Math.max(1, secs * 1000); }
function curtainK() { const k = Math.min(1, (performance.now() - curtain.t0) / curtain.ms); return curtain.from + (curtain.to - curtain.from) * (curtain.to < curtain.from ? 1 - (1 - k) * (1 - k) : k); }
// intro: the intro-transition sound plays while the screen slowly goes black, glitching at the three glitch moments in the sound;
// then the run starts under the black and the picture, the world sounds and the music all fade back in together
let introOn = false;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function beginRun() {
  if (introOn) return; introOn = true; overlay = 'intro'; ptrs.clear();
  const bo = $('blackout'); bo.style.pointerEvents = 'auto';
  // the UI fades away first, so only the 3D view is left to glitch (GlitchPass only reaches the 3D view)
  const ui = [$('ui'), $('backBtn')];
  ui.forEach(e => { e.style.transition = 'opacity .6s ease-in'; e.style.opacity = 0; });
  const r = await SFX.cue('intro'), dur = r ? r.dur : 2.6;
  // intro-transition.mp3: three bursts after drop-outs, measured at 2.00, 2.20 and 2.42 s (each about 0.12 s)
  const gl = [[2.0, 130], [2.2, 130], [2.42, 140]];
  fadeCurtain(1, dur);
  gl.forEach(([t, ms]) => setTimeout(() => glitch(ms), t * 1000));
  await wait(dur * 1000 + 150);
  SFX.fadeWorld(0, 0); startRun();
  await wait(250);
  fadeCurtain(0, 1.8); bo.style.pointerEvents = 'none';
  ui.forEach(e => { e.style.transition = 'opacity 1.8s ease-out'; e.style.opacity = 1; });
  SFX.fadeWorld(1, 1.8);   // the music keeps playing throughout
  introOn = false;
  // first time for this player: How to play appears once the first level has loaded (until they reach Platform 1)
  if (!playedOnce()) { await wait(900); if (mode === 'play' && !overlay) openHowto(false); }
}
$('playBtn').addEventListener('click', () => {
  if (!sel) return; SFX.ensureAudio();
  if (worldReady) beginRun(); else { $('playBtn').textContent = 'Getting ready…'; worldP.then(() => storeP).then(() => requestAnimationFrame(() => beginRun())); }
});
let howtoStarts = false;
const playedOnce = () => !!(sel && save.players[sel.id] && (save.players[sel.id].played || save.players[sel.id].done > 0));
function openHowto(starts) {
  howtoStarts = !!starts; overlay = 'howto'; show('howto', ''); ptrs.clear();
}
$('infoBtn').addEventListener('click', () => { SFX.ensureAudio(); openHowto(false); });
// Things I found: per-player list of changes they've turned back on. Only shown when asked for.
let findsFrom = null;
// the thing to look at for each change: [tile label, "Look at ..." phrase]
const OBJ = {
  A01: ['Lights out', 'the lights'], A02: ['Flashing light', 'the lights'], A03: ['Missing light', 'the lights'], A04: ['Wall lines', 'the lines on the wall'],
  A05: ['Seaside picture', 'the seaside picture'], A06: ['Dinosaur', 'the dinosaur picture'], A07: ['How to play', 'the How to play poster'], A08: ['Pictures', 'the pictures'],
  A09: ['Open door', 'the staff door'], A10: ['Cupboard door', 'the cupboard door'], A11: ['Extra grate', 'the floor grates'], A12: ['Guitar', 'the guitar'],
  A13: ['Fire extinguisher', 'the fire extinguisher'], A14: ['Backwards clock', 'the clock'], A15: ['Help Point', 'the Help Point'], A16: ['Camera watching', 'the camera'],
  A17: ['Teddy', 'the teddy'], A18: ['Balloons', 'the bin'], A19: ['Sus Guy backwards', 'Sus Guy'], A20: ['Sus Guy stops', 'Sus Guy'], A21: ['Two Sus Guys', 'Sus Guy'],
  A22: ['Giant Sus Guy', 'Sus Guy'], A23: ['Sandals', "Sus Guy's sandals"], A24: ['Water', 'the floor'], A25: ['Clock hand', 'the clock'], A26: ['Door sign', 'the staff door'],
  A27: ['Umbrella picture', 'the umbrella picture'], A28: ['Camera moved', 'the camera'], A29: ['Turned grate', 'the floor grates'], A30: ['Cleaner door', 'the cleaner door'],
  A31: ['Square clock', 'the clock'], A32: ['Bin moved', 'the bin']
};
// live preview: its own small renderer and scene, showing the passage with that one change, moving as it does in the game
let fpR = null, fpScene = null, fpCam = null, fpHemi = null, fpDir = null, fpG = null, fpId = undefined, fpT = 0, fpLook = new THREE.Vector3();
function fpInit() {
  fpR = new THREE.WebGLRenderer({ canvas: $('fpCanvas'), antialias: true }); fpR.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  fpScene = new THREE.Scene(); fpScene.background = new THREE.Color(C.fog); fpScene.fog = new THREE.Fog(C.fog, 30, 140);
  fpHemi = new THREE.HemisphereLight(C.lamp, C.floor, 1.9); fpDir = new THREE.DirectionalLight(C.lamp, 0.6); fpDir.position.set(0.6, 4, 2); fpScene.add(fpHemi, fpDir);
  fpCam = new THREE.PerspectiveCamera(55, 1, 0.05, 80);
}
function fpBuild(id) {
  if (fpG) disposeGroup(fpG);
  fpG = buildMain(id, true, nm()); fpScene.add(fpG); fpT = 0;
  // Sus Guy starts part-way down the passage, already walking towards you
  (fpG.userData.walkers || []).forEach(b => { b.leg = 1; b.head = 0; b.root.position.set(b.lane, 0, -18); b.root.rotation.y = id === 'A19' ? Math.PI : 0; });
  const f = FOCUS[id] || [[0, 1.6, -20], [0.3, 1.6, -4]]; fpLook.set(...f[0]);
  fpHemi.intensity = id === 'A01' ? 0.12 : 1.9; fpDir.intensity = fpHemi.intensity * 0.32;
}
function fpShow(id) {
  fpId = id; if (!fpR) fpInit();
  const wrap = $('fpWrap'); fpR.setSize(wrap.clientWidth, wrap.clientHeight, false); fpCam.aspect = wrap.clientWidth / wrap.clientHeight; fpCam.updateProjectionMatrix();
  fpBuild(id);
  const a = id && ANOMALIES.find(x => x.id === id);
  $('fpEmpty').classList.toggle('hidden', !!a); $('fpObj').classList.toggle('hidden', !a);
  $('fpSay').textContent = a ? a.say : '';
  if (a) $('fpObj').textContent = 'Look at ' + OBJ[id][1];
  $('findsGrid').querySelectorAll('.ftile.on').forEach(t => t.classList.toggle('cur', t.dataset.a === id));
}
function fpFrame(dt) {
  if (!fpR || !fpG || overlay !== 'finds') return;
  fpT += dt;
  const f = FOCUS[fpId] || [[0, 1.6, -20], [0.3, 1.6, -4]], ws = (fpG.userData.walkers || []).filter(b => b.root.visible);
  fpCam.position.set(f[1][0] + Math.sin(fpT * 0.5) * 0.18, f[1][1] + Math.sin(fpT * 0.8) * 0.03, f[1][2]);
  const SUS = /^A(19|2[0-3])$/.test(fpId), tgt = SUS && ws.length ? ws[0].root.position.clone().setY(1.25 * ws[0].root.scale.y) : new THREE.Vector3(...f[0]);
  if (fpId === 'A23' && SUS && ws.length) tgt.setY(0.1);
  fpLook.lerp(tgt, Math.min(1, dt * 4)); fpCam.lookAt(fpLook);
  fpG.userData.update(dt, t, { x: fpCam.position.x, z: fpCam.position.z, world: fpCam.position });
  if (fpG.userData.walkers && fpG.userData.walkers.length && (!ws.length || fpT > 26)) fpBuild(fpId);   // he's walked past: send him round again
  fpR.render(fpScene, fpCam);
}
function fpClose() { if (fpG) { disposeGroup(fpG); fpG = null; } fpId = undefined; }
function openFinds() {
  if (!sel) return;
  findsFrom = overlay; overlay = 'finds'; ptrs.clear();
  const found = (save.players[sel.id] && save.players[sel.id].found) || {}, list = ANOMALIES.filter(a => found[a.id]), n = list.length;
  $('findsTitle').textContent = `Things ${sel.name} found`;
  $('findsCount').textContent = `${n} of ${ANOMALIES.length}`;
  $('findsBar').style.width = (n / ANOMALIES.length * 100) + '%';
  $('findsGrid').innerHTML = ANOMALIES.map(a => found[a.id]
    ? `<button class="ftile on" data-a="${a.id}">${OBJ[a.id][0]}</button>`
    : `<div class="ftile off">?</div>`).join('');
  show('finds', '');
  fpShow(n ? list[list.length - 1].id : null);
}
$('findsGrid').addEventListener('click', e => { const b = e.target.closest('.ftile.on'); if (b) fpShow(b.dataset.a); });
$('findsBtn').addEventListener('click', () => { SFX.ensureAudio(); if (worldReady) openFinds(); else worldP.then(() => storeP).then(() => requestAnimationFrame(openFinds)); });   // its pictures are 3D snapshots
$('findsBack').addEventListener('click', () => {
  overlay = null; fpClose();
  if (findsFrom === 'pause') pause(); else if (findsFrom === 'win') { overlay = 'win'; show('win', 'clear'); }
  else if (mode === 'play') show(null); else show('home', 'home');
});
$('howtoOk').addEventListener('click', () => {
 
  if (howtoStarts) { save.seen[sel.id] = true; beginRun(); return; }
  overlay = null;
  if (mode === 'play') show(null); else show('home', 'home');
});
function pause() {
  overlay = 'pause'; ptrs.clear(); $('pauseInfo').textContent = `${sel.name} · ${fmt(timer)} · Lap ${count}`; show('pause', '');
}
function resume() { overlay = null; show(null); }
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('pHow').addEventListener('click', () => openHowto(false));
$('pRestart').addEventListener('click', startRun);
$('pHome').addEventListener('click', goHome);
// two sliders: sounds (all effects) and music (the theme tune)
const sndVol = $('sndVol'), musVol = $('musVol'), theme = $('theme');
const MUSIC_LEVEL = 0.25;   // 0.5 background level x 0.5 (about -6dB) because the file isn't pre-quietened
const paint = el => el.style.setProperty('--v', el.value + '%');
let musicK = 1;   // fade factor (the intro dips the music)
const setMusicVol = v => { theme.volume = Math.min(1, MUSIC_LEVEL * v * musicK * SFX.level('music')); };
function fadeMusic(to, secs) { const from = musicK, t0 = performance.now(); (function f() { const k = Math.min(1, (performance.now() - t0) / Math.max(1, secs * 1000)); musicK = from + (to - from) * k; setMusicVol(save.music ?? 0.8); if (k < 1) requestAnimationFrame(f); })(); }
sndVol.addEventListener('input', () => { const v = sndVol.value / 100; paint(sndVol); SFX.ensureAudio(); SFX.setVolume(v); save.volume = v; persist(); });
musVol.addEventListener('input', () => { const v = musVol.value / 100; paint(musVol); setMusicVol(v); save.music = v; persist(); });
// theme music: armed on the events that grant activation (pointerdown/touchstart don't on touch), stays armed until it really plays
(function music() {
  const EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  let playing = false;
  const arm = () => EVENTS.forEach(e => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach(e => document.removeEventListener(e, start, true));
  function start() {
    if (playing) return;
    setMusicVol(save.music ?? 0.8);
    let pr; try { pr = theme.play(); } catch (e) { return; }
    if (pr && pr.then) pr.then(() => { playing = true; disarm(); }, () => {}); else { playing = true; disarm(); }
  }
  document.addEventListener('visibilitychange', () => { if (!playing) return; if (document.hidden) theme.pause(); else theme.play().catch(() => {}); });
  arm();
})();
function showOops(had, reached, img) {
  overlay = 'oops'; ptrs.clear(); safeNoteOff();
  const a = ANOMALIES.find(x => x.id === had), hd = $('oopsHd');
  hd.style.background = a ? C.orange : C.teal; hd.style.color = a ? C.ink : C.cream;
  $('oopsImg').classList.toggle('hidden', !(a && img)); if (a && img) $('oopsImg').src = img;
  $('oopsCard').style.gridTemplateColumns = a && img ? '324px 460px' : '620px';
  $('oopsLead').classList.toggle('hidden', !a); $('oopsLead').textContent = 'You missed it!';
  $('oopsBig').textContent = a ? a.say : 'Nothing was different.';
  $('oopsHd').textContent = `Oops! Back to ${count}`;
  const got = count === SAFE ? `You were on Platform ${reached}. Platform 5 is a safe spot! ` : reached > 0 ? `You got to Platform ${reached}. ` : '';
  $('oopsSmall').textContent = a ? `${got}Have another go!` : `It was all the same, so keep going next time. ${got}`;
  show('oops', '');
  glitch(260);                                   // a glitch the moment it appears (another comes near the end of the fail sound)
  const o = $('oops'); o.classList.remove('fadeUp'); void o.offsetWidth; o.classList.add('fadeUp');   // and the card fades in quickly
}
$('oopsBtn').addEventListener('click', () => { overlay = null; show(null); });
function win() {
  mode = 'win'; overlay = 'win';
  const s = save.players[sel.id]; const prev = s.best; s.done += 1;
  const best = prev == null || timer < prev; if (best) s.best = timer; persist();
  $('winTimes').innerHTML = best
    ? `<div style="display:flex;align-items:center;gap:14px"><div style="font-size:68px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums">${fmt(timer)}</div><div style="background:#F3B33D;font-size:22px;font-weight:900;padding:6px 16px;border-radius:999px;border:3px solid #1E1E1E">Your best ever!</div></div>`
    : `<div style="display:grid;grid-template-columns:auto auto;justify-content:start;column-gap:40px"><div style="font-size:20px;font-weight:800">Your time</div><div style="font-size:20px;font-weight:800">Your best</div><div style="font-size:60px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums">${fmt(timer)}</div><div style="font-size:60px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;color:#F6EEDC">${fmt(s.best)}</div></div>`;
  $('winLine').textContent = `${sel.name} has finished ${s.done} time${s.done === 1 ? '' : 's'}.`;
  $('hud').classList.add('hidden'); $('pauseBtn').classList.add('hidden'); walkHide(); safeNoteOff(); $('hint').classList.add('hidden');
  show('win', 'clear');
}
$('winAgain').addEventListener('click', startRun);
$('winHome').addEventListener('click', goHome);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play' && !overlay) pause();
  SFX.suspendAll(document.hidden);
});

const WHITE = new THREE.Color('#FFFDF6');
let daylight = false;
function nightTime() { if (daylight) { daylight = false; SFX.toDaylight(false, 0.4); } SFX.setStepFade(1); }
// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  if (mode === 'play' && overlay !== 'pause' && overlay !== 'howto' && overlay !== 'finds' && overlay !== 'yay') {
    timer += dt; const tt = $('timer'); const s = fmt(timer); if (tt.textContent !== s) tt.textContent = s;
  }
  if (canMove()) {
    if (p.turn) { const s = Math.sign(p.turn) * Math.min(Math.abs(p.turn), dt * 7); p.yaw += s; p.turn -= s; if (Math.abs(p.turn) < 1e-4) p.turn = 0; }
    if (keys.arrowleft) p.yaw += dt * 1.8; if (keys.arrowright) p.yaw -= dt * 1.8;
    let v = 0, sv = 0;
    if (walkPtr !== null || keys.r || keys.arrowup) v = 2.7;
    if (keys.f || keys.arrowdown) v = -1.8;
    if (keys.d) sv -= 2.1; if (keys.g) sv += 2.1;
    if (v || sv) {
      const fx = (-Math.sin(p.yaw) * v + Math.cos(p.yaw) * sv) * dt, fz = (-Math.cos(p.yaw) * v - Math.sin(p.yaw) * sv) * dt;
      if (canStand(p.x + fx, p.z + fz)) { p.x += fx; p.z += fz; } else if (canStand(p.x + fx, p.z)) p.x += fx; else if (canStand(p.x, p.z + fz)) p.z += fz;
      const d = Math.hypot(fx, fz); walked += d; p.stepAcc += d; p.bob += d * 5.2;
      if (p.stepAcc > 1.35) { p.stepAcc = 0; SFX.step(); }   // one step every 0.5 s at walking speed (2.7 m/s), the recording's own pace
    }
    transitions();
    hintT += dt; if (hintT > 10 || (walked > 4 && turned)) $('hint').classList.add('fade');
    rumbleT -= dt; if (rumbleT < 0) { rumbleT = 28 + Math.random() * 10; SFX.rumble(); }
  }
  if (mode === 'home') { p.yaw = Math.sin(t * 0.15) * 0.12; p.pitch = 0; }
  const lp = mLocal(p.x, p.z);
  const pl = { x: lp.x, z: lp.z, world: camera.position };
  fpFrame(dt);
  if (M) {
    M.userData.update(dt, t, pl);
    const ws = M.children.find(o => o.userData && o.userData.rattle);
    if (ws && mode === 'play') { rattleT -= dt; if (rattleT < 0) { rattleT = 0.16; SFX.rattle(); } }
  }
  const dark = lapA === 'A01' && lapMode === 'lap' && (inR(RECT.M, p.x, p.z) || inR(RECT.C, p.x, p.z));
  hemi.intensity += ((dark ? 0.12 : 1.9) - hemi.intensity) * Math.min(1, dt * 4);
  dir.intensity = hemi.intensity * 0.32;
  // passing the 10 sign: the hum crossfades into birdsong over 2 s
  if (lapMode === 'exit' && !daylight && mode === 'play' && ((inR(RECT.S, p.x, p.z) && p.x > Ls / 2 + 0.5) || inR(RECT.B, p.x, p.z) || inR(RECT.M, p.x, p.z))) { daylight = true; SFX.toDaylight(true, 2); }
  // the way out: the light grows as you walk to the stairs and climb them, until it's all white, then the win screen
  let climb = 0, glow = 0;
  if (lapMode === 'exit' && inR(RECT.M, p.x, p.z)) {
    const d = -R - p.z; glow = Math.max(0, Math.min(1, d / 8.6));   // starts the moment you step into the way-out passage climb = Math.max(0, Math.min(1.4, (d - 6) / 0.45 * 0.2));
    scene.fog.color.set(C.fog).lerp(WHITE, glow); scene.fog.near = 30 - 28 * glow; scene.fog.far = 140 - 128 * glow;
    if (mode === 'play' && glow >= 1) win();
    SFX.setStepFade(1 - glow);
  } else if (mode !== 'win') { scene.fog.color.set(C.fog); scene.fog.near = 30; scene.fog.far = 140; }
  const wo = $('whiteout'), wk = mode === 'win' ? 1 : Math.max(0, (glow - 0.15) / 0.85), wop = String(+Math.pow(wk, 1.3).toFixed(3)); if (wo.style.opacity !== wop) wo.style.opacity = wop;
  hemi.intensity += glow * 2.4 * Math.min(1, dt * 4);
  camera.position.set(p.x, 1.6 + climb + Math.sin(p.bob) * 0.025, p.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  const ck = curtainK(), gl = glitching(), bo = $('blackout'), op = String(gl ? ck * 0.3 : ck); if (bo.style.opacity !== op) bo.style.opacity = op;
  const r0 = performance.now(); if (gl) composer.render(); else renderer.render(scene, camera); adapt(performance.now() - r0);
}
// drop the 3D resolution on slow devices so the UI (which is DOM) stays responsive
let pr = Math.min(devicePixelRatio || 1, 1.5), slow = 0;
function adapt(ms) {
  slow = slow * 0.9 + ms * 0.1;
  if ((ms > 120 || slow > 28) && pr > 0.35) { pr = Math.max(0.35, pr * (ms > 120 ? 0.5 : 0.8)); renderer.setPixelRatio(pr); resize(); slow = 0; }
}

// ---------- boot ----------
buildStatic(scene, signTex);
// The player cards come straight from the save, so they're drawn the moment the store is read. The 3D world
// (font for the canvas signs, then man / props / help point, about 4 MB) loads alongside and is swapped in
// behind the home screen when it's ready; a Play tap before then waits for it rather than doing nothing.
let worldReady = false;
const fontsP = document.fonts ? Promise.race([document.fonts.load('900 30px Gabarito'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
const worldP = Promise.all([fontsP, loadMan(), loadProps(), loadHelp()]);
const storeP = new Promise(res => Store.ready(() => {
  const d = Store.get(); if (d) { gen = d.gen || 0; save = Object.assign(save, d); save.players = Object.assign({ caleb: { done: 0, best: null }, ezra: { done: 0, best: null } }, d.players || {}); save.seen = d.seen || {}; }
  sel = PLAYERS.find(x => x.id === save.last) || null;
  const vol = save.volume ?? 0.8, mv = save.music ?? 0.8; sndVol.value = Math.round(vol * 100); musVol.value = Math.round(mv * 100); paint(sndVol); paint(musVol); SFX.setVolume(vol); setMusicVol(mv);
  renderHome(); res();
}));
Promise.all([worldP, storeP]).then(() => {
  setMP(null, false, false); drawSign(signC, 0); signTex.needsUpdate = true; shownSign = 0;
  // draw one frame through the glitch pipeline now, so its shaders compile and its textures upload while
  // the game loads; left to the first glitch, the compile ate most of that first (short) glitch
  composer.render();
  worldReady = true;
  if (mode === 'home' && !overlay) goHome(); else renderHome();
  requestAnimationFrame(frame);
});
