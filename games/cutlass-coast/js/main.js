// main.js — boot, mode registry and navigation.
// ctx = { engine, state, ui, audio, PLT, world, go, back, save, mode, stack }
import { createEngine } from './engine.js';
import * as state from './state.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import * as world from './world.js';

let PLT = null;
try { ({ PLT } = await import('./plt-assets.js')); } catch (e) { console.error('plt-assets.js failed to load — 3D backdrops disabled', e); }

// Every mode lives at js/modes/<name>.js and default-exports { enter(ctx, params), exit(), update(dt, t), suspend?(), resume?(result) }.
const MODE_NAMES = ['title', 'sail', 'port', 'battle', 'duel', 'log', 'retire', 'pause', 'treasure'];
const OVERLAYS = new Set(['pause', 'log']);          // pushed on top; ctx.back(result) returns to the caller
const registry = {};

const engine = createEngine(document.getElementById('gl'));
const stack = []; // [{ name, mod, params }]
let navigating = false; const queue = [];

const ctx = {
  engine, state, ui, audio, PLT, world,
  go, back, save,
  get mode() { return stack.length ? stack[stack.length - 1].name : null; },
  get stack() { return stack.map(s => s.name); },
};

const BATTLE_MODES = new Set(['battle', 'duel']);
function isOverlay(name, mod) { return mod.overlay != null ? !!mod.overlay : OVERLAYS.has(name); }
function markMode() {
  const top = stack[stack.length - 1];
  document.body.dataset.mode = top ? top.name : '';
  // music (Dan): the battle theme for ship battles and every sword fight (boarding, sneak-in guards), right
  // through their victory/outcome cards; the normal theme everywhere else. Overlays (pause, log) keep what's under them.
  const base = stack.filter(e => !isOverlay(e.name, e.mod)).pop();
  if (base) audio.theme(BATTLE_MODES.has(base.name) ? 'battle' : 'normal');
  // pause / log freeze the mode beneath them, so its 3D doesn't need redrawing every frame
  engine.setFrozen(!!top && top !== base);
  // arcade convention: #backBtn (top-left) shows in every mode; modes keep that ~150×70 zone clear
}
function exitTop() {
  const e = stack.pop();
  try { e.mod.exit && e.mod.exit(); } catch (err) { console.error(`[${e.name}] exit`, err); }
  ui.unmount(e.name);
}

/** Go to a mode. Overlay modes (pause, log) stack on top of the current one; others replace everything. Autosaves. */
function go(name, params = {}) {
  if (navigating) { queue.push([name, params]); return; }
  const mod = registry[name];
  if (!mod) { console.error('Unknown mode', name); return; }
  navigating = true;
  try {
    if (isOverlay(name, mod) && stack.length) {
      const under = stack[stack.length - 1];
      try { under.mod.suspend && under.mod.suspend(); } catch (err) { console.error(err); }
    } else {
      while (stack.length) exitTop();
      engine.clearView();
    }
    save();
    stack.push({ name, mod, params });
    markMode();
    try { mod.enter(ctx, params); } catch (err) { console.error(`[${name}] enter`, err); ui.toast('Something went wrong opening ' + name + '.', { title: 'Oops' }); }
  } finally { navigating = false; }
  if (queue.length) { const [n, p] = queue.shift(); go(n, p); }
}
/** Close the top overlay and return to the mode beneath it (calls its resume(result)). */
function back(result) {
  const top = stack[stack.length - 1];
  if (!top || stack.length < 2 || !isOverlay(top.name, top.mod)) { go('title'); return; }
  exitTop();
  markMode();
  save();
  const under = stack[stack.length - 1];
  try { under.mod.resume && under.mod.resume(result); } catch (err) { console.error(err); }
}
let warned = false;
/** Save now. Returns false (and warns once) if another tab owns the save. */
function save() {
  const ok = state.save();
  if (!ok && !warned) { warned = true; ui.toast('Close the other Cutlass Coast tab, then reload this one.', { title: 'Another tab is playing', ms: 6000 }); }
  return ok;
}

engine.setTick((dt, t) => {
  const top = stack[stack.length - 1];
  if (top && top.mod.update) top.mod.update(dt, t);
  if (state.career() && top && top.name !== 'title') state.autosave(30000); // periodic autosave while playing
});

// back button: flush the save on the way out
document.getElementById('backBtn').addEventListener('pointerdown', () => { state.save(); state.flush(); });
// press-and-hold is a game control here, never the browser's right-click / long-press menu
document.addEventListener('contextmenu', e => e.preventDefault());
// Esc = pause (and Esc again = resume). Only over a playing mode, never on the title screen.
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.repeat) return;
  const m = ctx.mode;
  if (m === 'pause') { ctx.back(); return; }
  if (m === 'log') { ctx.back(); return; }
  if (m && m !== 'title' && m !== 'retire' && ctx.state.career()) ctx.go('pause');
});
document.addEventListener('selectstart', e => { if (!e.target.closest || !e.target.closest('input, textarea')) e.preventDefault(); });

state.ready(async () => {
  state.load();
  ui.init({ settings: state.settings, onClick: () => audio.play('click') });
  ui.applySettings(state.settings());
  audio.init({ settings: state.settings(), caption: ui.caption });
  const loaded = await Promise.allSettled(MODE_NAMES.map(n => import(`./modes/${n}.js`)));
  loaded.forEach((r, i) => { if (r.status === 'fulfilled') registry[MODE_NAMES[i]] = r.value.default; else console.error(`mode ${MODE_NAMES[i]} failed to load`, r.reason); });
  engine.start();
  go('title');
});

window.PLT_DEBUG = { ctx };
