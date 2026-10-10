import { loadStatic, loadHazards, loadRoom, loadSkinned } from './assets.js';
import { Game, LIST_LEVELS, TIER_LABEL, KIND_LABEL } from './game.js';
import { SKINS, skinPreview } from './hole.js';
import { sfx } from './sfx.js';
import { initPhysics } from './physics.js';
import { initLod } from './lod.js';

const BASE = '../_shared/assets/';
const $ = id => document.getElementById(id);
const Store = ArcadeStore('kaiju-pothole');

// Two players, each with their own scores, wins, shapes and settings. Performance mode is shared.
const USERS = [{ id: 'ezra', name: 'Ezra' }, { id: 'caleb', name: 'Caleb' }];
const fresh = () => ({ stars: { list: {}, zen: 0 }, wins: { easy: 0, normal: 0, hard: 0 }, best: {}, zenBest: 0, zenRun: null, skin: 'black', shake: true, difficulty: 'easy', vol: { fx: 80, music: 80 }, eaten: {}, rims: ['black'] });
let root = { v: 3, user: 'ezra', users: {}, perf: false }, save = fresh();
// Hole shapes are won by eating things across every game (a long-running shopping list),
// or by finishing a Shopping level (one placeholder shape per level for now).
const rimDone = s => !!s.tasks && s.tasks.every(([k, n]) => (save.eaten[k] || 0) >= n);
const userName = () => (USERS.find(u => u.id === root.user) || USERS[0]).name;
function useUser(id) {
  root.user = id; save = root.users[id];
  sfx.setVolume('fx', save.vol.fx / 100); sfx.setVolume('music', save.vol.music / 100);
  if (game) game.shake = save.shake;
}

function show(id) {
  for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === id);
  $('hud').classList.toggle('on', id === null || id === 'pause');
  $('dev').classList.toggle('ingame', id === null || id === 'pause');
  if (id === 'title' || id === 'modes' || id === 'levels' || id === 'skins') refreshMenus();
}
export const KIND_ICON = { prop: 'traffic-cone', tree: 'tree', vehicle: 'car', boat: 'sailboat', air: 'airplane-tilt', play: 'park', farm: 'cow', house: 'house', shop: 'storefront', tower: 'buildings', factory: 'factory', pad: 'road-horizon', hazard: 'fire', stadium: 'soccer-ball', harbour: 'anchor' };
const icon = (n, cls = '') => `<i class="ph-fill ph-${n}${cls ? ' ' + cls : ''}"></i>`;
const listMax = i => LIST_LEVELS[i].items.length, listStars = i => Math.min(save.stars.list[i] || 0, listMax(i));
const starStr = (n, of = 3) => icon('star').repeat(Math.min(n, of)) + icon('star', 'off').repeat(Math.max(0, of - n));
// Saves: IndexedDB through ArcadeStore (calebArcadeData:kaiju-pothole), stamped with which tab wrote it (sid) and a
// counter that only goes up (gen), so an old tab left open can't write over the one being played (knowledge/arcade-store.md).
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0, warnedConflict = false;
function persist() {
  if (Store.conflict()) {
    if (!warnedConflict && hooks.toast) { warnedConflict = true; hooks.toast('Kaiju Pothole is open in another tab - progress is saving there'); }
    return false;
  }
  gen += 1; root.gen = gen; root.sid = SID;
  Store.set(null, root, { guard: true });
  return true;
}
const RING = 2 * Math.PI * 19;
// locked shapes stay a surprise: a '?' disc instead of the picture
const drawSkin = (c, id) => { if (c.dataset.mystery) { const x = c.getContext('2d'), w = c.width; x.clearRect(0, 0, w, w); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, 7); x.fillStyle = '#d6d0c2'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#1E1B2E'; x.stroke(); x.fillStyle = '#1E1B2E'; x.font = `${Math.round(w * 0.55)}px Bungee, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', w / 2, w / 2 + w * 0.04); return; } skinPreview(c, id); };

let toastT = 0;
const hooks = {
  hud(s) {
    const t = $('timer'); if (s.time === Infinity) t.textContent = Math.round(s.pct * 100) + '%'; else { const v = Math.max(0, Math.ceil(s.time)); t.textContent = Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); t.classList.toggle('low', v <= 10); }
    $('sizeN').textContent = s.tier; $('tierName').textContent = TIER_LABEL[s.tier];
    $('ringFg').setAttribute('stroke-dashoffset', (RING * (1 - s.prog)).toFixed(1));
    $('score').style.display = s.mode === 'list' ? 'none' : ''; $('scoreN').textContent = s.score.toLocaleString();
    const side = $('side'); let html = '';
    if (s.goals) html = s.goals.map(g => `<div class="g${g.got >= g.n ? ' done' : ''}"><span>${icon(KIND_ICON[g.k] || 'circle')}${g.label}</span><span>${Math.min(g.got, g.n)}/${g.n}</span></div>`).join('');
    else if (s.rank) html = s.rank.map((h, i) => `<div class="g${h.isPlayer ? ' me' : ''}"><span><span style="color:${h.color || 'var(--ink)'}">●</span> ${i + 1}. ${h.isPlayer ? userName() : h.name}</span><span>${(h.r * 2).toFixed(1)} m</span></div>`).join('');
    else if (s.time === Infinity) html = `<div class="g"><span>Town eaten</span><span>${Math.round(s.pct * 100)}%</span></div>`;
    side.style.display = html ? '' : 'none'; if (side.innerHTML !== html) side.innerHTML = html;
  },
  toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600); },
  float(name, o) { const [x, y] = game.toScreen(o); const d = document.createElement('div'); d.className = 'float'; d.textContent = '+ ' + name; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); },
  joy() {},
  pause() {
    if (zenSave()) persist();
    if ($('pause').classList.contains('on')) return resume();
    game.paused = true; const zen = game.cfg.mode === 'zen';
    $('finishBtn').style.display = zen ? '' : 'none'; $('menuBtn').style.display = zen ? 'none' : '';
    $('volFx').value = save.vol.fx; $('volMusic').value = save.vol.music; toggles(); show('pause');
  },
  ate(kind) {
    save.eaten[kind] = (save.eaten[kind] || 0) + 1;
    for (const s of SKINS) if (s.tasks && !save.rims.includes(s.id) && rimDone(s)) { save.rims.push(s.id); persist(); sfx.tierUp(); hooks.toast('New hole shape: ' + s.name + '!'); }
  },
  end(res) { try { results(res); } catch (err) { console.error('results', err); show('results'); } },
};
let game, A, lastCfg;

// any shape whose eating list is already complete gets awarded (e.g. counts from before the shapes changed)
function awardDone() { for (const s of SKINS) if (s.tasks && !save.rims.includes(s.id) && rimDone(s)) save.rims.push(s.id); }
function refreshMenus() {
  awardDone();
  $('modesTitle').textContent = 'Pick a game, ' + userName();
  const cur = SKINS.find(s => s.id === save.skin) || SKINS[0]; drawSkin($('curSkin'), cur.id); $('curSkinName').textContent = cur.name;
  $('st-rush').innerHTML = icon('trophy') + '&nbsp;High score: ' + (save.best.rush || 0).toLocaleString();
  const run = save.zenRun;
  $('zen-desc').textContent = run ? `Carry on! ${Math.round(run.pct * 100)}% of your town is gone.` : 'No clock. Eat the whole town!';
  $('st-zen').innerHTML = starStr(save.stars.zen) + '&nbsp;&nbsp;Best: ' + (save.zenBest || 0) + '%' + (run ? `<span class="clr" data-clear="zen" role="button">${icon('arrow-counter-clockwise')}New town</span>` : '');
  for (const d of ['easy', 'normal', 'hard']) $('w-' + d).textContent = save.wins[d] || 0;
  $('st-list').innerHTML = icon('star') + '&nbsp;' + LIST_LEVELS.reduce((a, _, i) => a + listStars(i), 0) + ' / ' + LIST_LEVELS.reduce((a, _, i) => a + listMax(i), 0);
  for (const b of $('diff').children) b.classList.toggle('on', b.dataset.d === save.difficulty);
  $('levelGrid').innerHTML = LIST_LEVELS.map((l, i) => {
    const open = LIST_LEVELS.slice(0, i).every((_, j) => save.stars.list[j] > 0), done = listStars(i) >= listMax(i), rim = SKINS.find(s => s.level === i);
    // every level wins a hole shape: shown on the card, greyed out until the level is finished
    return `<button class="lvl${done ? ' done' : ''}" data-level="${i}" ${open ? '' : 'disabled'}><span class="lv-top"><b>${open ? i + 1 : icon('lock-simple')}</b>${done ? '<span class="tick">' + icon('check-fat') + '</span>' : ''}</span><span class="lv-name">${l.name}</span><span class="lv-row"><span class="lgroups">${l.items.map(([k]) => icon(KIND_ICON[k] || 'circle')).join('')}</span>${rim ? `<canvas class="lv-rim" width="56" height="56" data-sw="${rim.id}"${done ? ` title="${rim.name}"` : ' data-mystery="1"'}></canvas>` : ''}</span></button>`;
  }).join('');
  for (const c of $('levelGrid').querySelectorAll('canvas')) drawSkin(c, c.dataset.sw);
  $('skinGrid').innerHTML = SKINS.map(s => {
    const won = s.free || save.rims.includes(s.id), tasks = s.tasks || [];
    const list = won ? '' : s.level != null ? `<div class="tasks"><div class="task"><span class="ico">${icon('list-checks')}Finish Shopping ${s.level + 1}</span></div></div>`
      : `<div class="tasks">${tasks.map(([k, n]) => { const got = Math.min(n, save.eaten[k] || 0); return `<div class="task${got >= n ? ' done' : ''}"><span class="ico">${icon(KIND_ICON[k] || 'circle')}${KIND_LABEL[k] || k}</span><span>${got}/${n}</span></div>`; }).join('')}</div>`;
    const state = won ? `<span class="state">${save.skin === s.id ? icon('check-circle') + 'Using this one' : icon('palette') + 'Tap to use'}</span>` : list;
    return `<button class="skin${save.skin === s.id ? ' sel' : ''}${won ? '' : ' locked'}" data-skin="${s.id}"${won ? '' : ' data-locked="1"'}><span class="sk-l"><canvas width="208" height="208" data-sw="${s.id}"${won ? '' : ' data-mystery="1"'}></canvas><span class="sk-n">${won ? s.name : icon('lock-simple') + '???'}</span></span>${state}</button>`;
  }).join('');
  for (const c of $('skinGrid').querySelectorAll('canvas')) drawSkin(c, c.dataset.sw);
}
// Picking a shape only restyles the cards in place: rebuilding the grid (refreshMenus) swaps every node out from
// under the scrolled panel and the scroll position jumps.
function markSkin() {
  for (const el of $('skinGrid').querySelectorAll('.skin:not(.locked)')) {
    const on = el.dataset.skin === save.skin, st = el.querySelector('.state');
    el.classList.toggle('sel', on);
    if (st) st.innerHTML = on ? icon('check-circle') + 'Using this one' : icon('palette') + 'Tap to use';
  }
}
function toggles() {
  $('shakeBtn').setAttribute('aria-checked', save.shake ? 'true' : 'false');
  $('perfBtn').setAttribute('aria-checked', root.perf ? 'true' : 'false');
}

async function play(cfg) {
  lastCfg = cfg;
  if (cfg.mode === 'zen' && save.zenRun) cfg = { ...cfg, resume: save.zenRun }; // pick up the saved town sfx.unlock(); sfx.enter(); sfx.music({ rush: 'gobble', rivals: 'battle', list: 'shopping', zen: 'zen' }[cfg.mode] || 'gobble');
  show('loading'); $('loadMsg').textContent = cfg.mode === 'list' && LIST_LEVELS[cfg.level].room != null ? 'Knocking on the door…' : 'Digging in…'; $('bar').firstElementChild.style.width = '100%';
  await new Promise(r => setTimeout(r, 90)); // let the click sound and loading screen start before the heavy town build
  await game.start({ ...cfg, skin: devSkin || save.skin, difficulty: save.difficulty });
  show(null);
}
function resume() { game.paused = false; show(null); }
function toMenu() { game.showcase(); show('modes'); sfx.music('gobble'); }
function results(res) {
  const m = res.mode;
  const zenPct = Math.round((res.pct || 0) * 100), zenWas = save.zenBest || 0;
  if (m === 'zen') save.zenRun = null; // a finished Zen run starts a fresh town next time
  if (m === 'zen') { save.stars.zen = Math.max(save.stars.zen || 0, res.stars); save.zenBest = Math.max(zenWas, zenPct); } // Zen card: best % of the town eaten
  if (m === 'rivals' && res.place === 1) save.wins[save.difficulty] = (save.wins[save.difficulty] || 0) + 1;
  if (m === 'list') {
    save.stars.list[res.level] = Math.max(save.stars.list[res.level] || 0, res.stars);
    const rim = SKINS.find(s => s.level === res.level);
    if (rim && res.complete && !save.rims.includes(rim.id)) { save.rims.push(rim.id); res.newRim = rim; }
  }
  const key = m + (m === 'list' ? res.level : ''), best = save.best[key] || 0; save.best[key] = Math.max(best, res.score); persist();
  $('resTitle').textContent = m === 'rivals' ? (res.place === 1 ? 'You won!' : 'Place ' + res.place) : m === 'list' ? (res.complete ? 'List done!' : res.stars ? 'Nearly!' : 'Out of time!') : 'Gulp!';
  const showStars = m === 'list' || m === 'zen';
  $('resStars').style.display = showStars ? '' : 'none'; $('resStars').innerHTML = showStars ? starStr(res.stars, res.of || 3) : '';
  const lines = m === 'list' ? [res.stars + ' of ' + res.of + ' done'] : [`Score ${res.score.toLocaleString()}${res.score > best ? ' · new best!' : ''}`];
  if (m === 'rush' || m === 'rivals') lines.push('You got to size ' + res.tier + ': ' + TIER_LABEL[res.tier]);
  if (m === 'zen') lines.push(zenPct + '% of the town eaten' + (zenPct > zenWas ? ' · new best!' : ''));
  $('resText').innerHTML = lines.join('<br>');
  // what went down the hole, by kind
  const counts = Object.entries(res.counts || {}).sort((a, b) => b[1] - a[1]);
  $('resEaten').innerHTML = counts.map(([k, n]) => `<span title="${KIND_LABEL[k] || k}">${icon(KIND_ICON[k] || 'circle')}${n}</span>`).join('');
  // a newly won hole shape gets shown on the results card
  $('resRim').style.display = res.newRim ? '' : 'none';
  if (res.newRim) { drawSkin($('resRimCv'), res.newRim.id); $('resRimName').textContent = res.newRim.name; sfx.tierUp(); }
  $('nextBtn').style.display = m === 'list' && res.stars > 0 && res.level < LIST_LEVELS.length - 1 ? '' : 'none';
  show('results');
}

// every button click: ui-click. Starting a game (mode, level, again, next, restart) plays ui-click-enter-game instead (in play()).
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-mode]'); if (!t || t.closest('#dev')) return;
  if (t.dataset.d || !(t.dataset.mode || t.dataset.level || ['replayBtn', 'nextBtn', 'restartBtn'].includes(t.id))) { sfx.unlock(); sfx.tap(); }
}, true);
document.addEventListener('click', e => {
  // Zen card's "New town": tap twice (it asks "Sure?") so a stray tap can't throw a town away
  const clr = e.target.closest('[data-clear]');
  if (clr) {
    if (clr.dataset.sure) { save.zenRun = null; persist(); refreshMenus(); return; }
    clr.dataset.sure = '1'; clr.innerHTML = icon('warning') + 'Sure? Tap again'; setTimeout(() => { if (clr.isConnected) refreshMenus(); }, 3000);
    return;
  }
  const b = e.target.closest('button,[data-go],[data-mode]'); if (!b) return;
  if (b.dataset.user) { useUser(b.dataset.user); persist(); sfx.unlock(); show('modes'); return; }
  if (b.dataset.go) { sfx.unlock(); show(b.dataset.go); }
  if (b.dataset.mode) play({ mode: b.dataset.mode });
  if (b.dataset.level) play({ mode: 'list', level: +b.dataset.level });
  if (b.dataset.d) { save.difficulty = b.dataset.d; persist(); refreshMenus(); }
  if (b.dataset.skin && !b.dataset.locked) { save.skin = b.dataset.skin; persist(); markSkin(); }
});
$('shakeBtn').onclick = () => { save.shake = !save.shake; game.shake = save.shake; persist(); toggles(); };
$('perfBtn').onclick = () => { root.perf = !root.perf; game.setPerf(root.perf); persist(); toggles(); };
$('volFx').oninput = e => { save.vol.fx = +e.target.value; sfx.setVolume('fx', save.vol.fx / 100); };
$('volFx').onchange = () => { sfx.tap(); persist(); };
$('volMusic').oninput = e => { save.vol.music = +e.target.value; sfx.unlock(); sfx.setVolume('music', save.vol.music / 100); };
$('volMusic').onchange = () => persist(); // save once the slider is let go, not on every tick
addEventListener('pagehide', () => { if (Store.isReady()) { zenSave(); if (persist()) Store.flush(); } }); // keep this game's eaten counts when leaving mid-game
$('pauseBtn').onclick = () => hooks.pause();
$('resumeBtn').onclick = resume;
$('finishBtn').onclick = () => { game.paused = false; show(null); game.end(); };
$('restartBtn').onclick = () => { if (lastCfg && lastCfg.mode === 'zen') save.zenRun = null; play(lastCfg); }; // restarting Zen = a new town
// Zen progress survives a reload / restart: snapshot the town every few seconds and whenever the page goes away
function zenSave() { if (game && game.running && !game.done && game.cfg && game.cfg.mode === 'zen') { save.zenRun = game.snapshot(); return true; } return false; }
setInterval(() => { if (zenSave()) persist(); }, 5000);
$('menuBtn').onclick = $('resMenuBtn').onclick = toMenu;
$('replayBtn').onclick = () => play(lastCfg);
$('nextBtn').onclick = () => play({ mode: 'list', level: lastCfg.level + 1 });
// Testing: P also shows a hole-shape picker. It swaps the shape live (and for the next games this session)
// without unlocking it or touching the saved choice.
let devSkin = null, devIdx = -1;
// test controls only exist during a game (shown with P)
function devApply() { devSkin = devIdx < 0 ? null : SKINS[devIdx].id; $('devSkinName').textContent = devIdx < 0 ? 'Your own' : SKINS[devIdx].name; if (game && game.me && game.me.setSkin) game.me.setSkin(devSkin || save.skin); }
$('dev').addEventListener('click', e => {
  const b = e.target.closest('[data-dev]'); if (!b || !game || !game.running) return; e.stopPropagation();
  const k = b.dataset.dev, n = SKINS.length;
  if (k === 'prev') { devIdx = devIdx < 0 ? n - 1 : devIdx - 1; devApply(); }
  if (k === 'next') { devIdx = devIdx >= n - 1 ? -1 : devIdx + 1; devApply(); }
  if (k === 'own') { devIdx = -1; devApply(); }
  if (k === 'size') game.devSize(+b.dataset.n);
});
// P toggles a frame-rate readout (bottom left)
let fpsOn = false, fpsN = 0, fpsT = performance.now(), fpsLast = performance.now(), fpsWorst = 0;
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'p' && !e.repeat && !e.metaKey && !e.ctrlKey) { fpsOn = !fpsOn; $('dev').classList.toggle('on', fpsOn); fpsN = 0; fpsWorst = 0; fpsT = performance.now(); } });
(function fpsLoop(now) {
  if (fpsOn) {
    fpsN++; fpsWorst = Math.max(fpsWorst, now - fpsLast);
    if (now - fpsT >= 500) {
      const fps = fpsN * 1000 / (now - fpsT), i = game && game.renderer.info.render, P = game && game.world.phys;
      $('fps').textContent = Math.round(fps) + ' fps   worst ' + Math.round(fpsWorst) + ' ms' + (i ? '\n' + i.calls + ' draws   ' + Math.round(i.triangles / 1000) + 'k tris' : '') + (game ? '\nres ' + game.dpr + 'x' + (root.perf ? ' (performance)' : '') + (P ? '   physics ' + P.active.size : '') : '');
      fpsN = 0; fpsWorst = 0; fpsT = now;
    }
  }
  fpsLast = now; requestAnimationFrame(fpsLoop);
})(performance.now());
// browsers only allow sound after a tap: the first touch anywhere starts the Gobble theme on the home screen
// Audio may only start on a gesture that grants activation: pointerdown / touchstart don't on a touch screen,
// so listen on the ones that do (knowledge/audio-patterns.md). unlock() is cheap once the music is playing.
for (const ev of ['pointerup', 'click', 'touchend', 'keydown']) addEventListener(ev, () => sfx.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.running && !game.paused) hooks.pause(); });

(async function boot() {
  await new Promise(r => Store.ready(r));
  const old = Store.get();
  if (old) gen = old.gen || 0; // carry on counting from what is stored
  if (old && old.v >= 2) root = { ...root, ...old }; else if (old) root.legacy = old; // the first single-player save is kept, not used
  root.users = root.users || {};
  for (const u of USERS) {
    const f = fresh(), s = root.users[u.id] || {};
    if ((root.v || 2) < 3) { s.difficulty = 'easy'; s.vol = { fx: 80, music: 80 }; } // new defaults
    root.users[u.id] = { ...f, ...s, stars: { ...f.stars, ...(s.stars || {}) }, wins: { ...f.wins, ...(s.wins || {}) }, vol: { ...f.vol, ...(s.vol || {}) } };
  }
  // hole shapes v2: Black is the free default; the old Shop rim placeholders become that level's new shape
  for (const u of Object.values(root.users)) {
    u.rims = [...new Set((u.rims || []).map(id => { const m = /^shop(\d+)$/.exec(id); return m ? (SKINS.find(s => s.level === +m[1] - 1) || {}).id : id; }).filter(id => id && SKINS.some(s => s.id === id)).concat('black'))];
    if (!SKINS.some(s => s.id === u.skin) || !u.rims.includes(u.skin)) u.skin = 'black';
  }
  root.v = 3; if (!root.users[root.user]) root.user = 'ezra';
  useUser(root.user);
  const bar = $('bar').firstElementChild; let n = 0; const step = () => { n++; bar.style.width = Math.min(95, n / 13 * 100) + '%'; };
  try {
    const [models, hazards, animals] = await Promise.all([loadStatic(BASE, step), loadHazards(BASE).then(h => (step(), h)), loadSkinned(BASE, 'animals').then(a => (step(), a)), initPhysics(), initLod()]);
    A = { models, hazards, animals, people: null, room: id => loadRoom(BASE, id) };
    window.__kp = A;
    game = new Game($('gl'), A, hooks); game.shake = save.shake; game.setPerf(!!root.perf); window.__game = game;
    game.showcase(); show('title');
    loadSkinned(BASE, 'people').then(p => { A.people = p; if (game.idle) game.showcase(); });
  } catch (err) { console.error(String(err && err.stack || err)); window.__err = String(err && err.stack || err); $('loadMsg').textContent = 'The pothole is stuck. Try reloading.'; }
})();
