/* state.js — saves (IndexedDB via ArcadeStore, key calebArcadeData:crazy-golf) and the
 * progress maths the screens need. Stars are per boy per difficulty; gems, owned and
 * equipped items are per boy. Guarded writes (gen + sid) so an old tab can't win. */

import { PARS, WORLDS, SHOP, starsFor } from './data.js';

const Store = window.ArcadeStore('crazy-golf');
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0;

const E9 = () => Array(9).fill(null);
const NWORLDS = 8;
function freshDiff() { return { best: Array.from({ length: NWORLDS }, E9), rounds: Array(NWORLDS).fill(null) }; }
/* saves from before the four new worlds: pad the per-world arrays out */
function padDiff(d) { if (!d) return freshDiff(); while (d.best.length < NWORLDS) d.best.push(E9()); while (d.rounds.length < NWORLDS) d.rounds.push(null); return d; }
function freshProfile() {
  const owned = {}; for (const k of Object.keys(SHOP)) owned[k] = SHOP[k].filter(it => it.price === 0).map(it => it.id);
  return { gems: 0, aces: 0, owned, equipped: { balls: 'classic', putters: 'classic', flags: 'classic' },
    prog: { easy: freshDiff(), normal: freshDiff(), hard: freshDiff() } };
}
function fresh() {
  return { v: 1, profiles: { caleb: freshProfile(), ezra: freshProfile() },
    settings: { mode: 'solo', player: 'caleb', diff: 'normal', camSens: 3, projection: 'ortho' } };
}

export const S = { data: fresh(), ok: true };

export function loadSave(cb) {
  Store.ready(() => {
    const d = Store.get();
    if (d && d.profiles) {
      gen = d.gen || 0;
      const f = fresh();
      S.data = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}), diff: 'normal' } };
      for (const p of ['caleb', 'ezra']) {
        const pr = S.data.profiles[p] = { ...freshProfile(), ...(d.profiles[p] || {}) };
        for (const k of ['easy', 'normal', 'hard']) pr.prog[k] = padDiff(pr.prog[k]);
        // there's no difficulty choice any more: everything counts as Normal, so fold any Easy/Hard bests into it
        const nb = pr.prog.normal.best;
        for (const k of ['easy', 'hard']) pr.prog[k].best.forEach((row, w) => row.forEach((v, h) => { if (v != null && (nb[w][h] == null || v < nb[w][h])) nb[w][h] = v; }));
      }
    }
    cb();
  });
}
export function save() {
  if (Store.conflict && Store.conflict()) { S.ok = false; return false; }
  gen += 1;
  const { gen: _g, sid: _s, ...rest } = S.data;
  Store.set(null, { ...rest, gen, sid: SID }, { guard: true });
  return true;
}

export const prof = (pid) => S.data.profiles[pid];
export const diffProg = (pid, diff) => prof(pid).prog[diff || S.data.settings.diff];

export function worldStars(pid, w, diff) {
  const b = diffProg(pid, diff).best[w];
  return b.reduce((a, v, i) => a + starsFor(v, PARS[w][i]), 0);
}
export function totalStars(pid, diff) { return WORLDS.reduce((a, _, w) => a + worldStars(pid, w, diff), 0); }
export const worldOpen = (pid, w, diff) => totalStars(pid, diff) >= WORLDS[w].need;

/* record a finished hole; returns what changed for the result screen */
export function recordHole(pid, w, h, strokes, diff) {
  const d = diffProg(pid, diff), par = PARS[w][h];
  const oldBest = d.best[w][h], before = starsFor(oldBest, par);
  if (oldBest == null || strokes < oldBest) d.best[w][h] = strokes;
  const after = starsFor(d.best[w][h], par);
  return { newStars: after - before, best: d.best[w][h], wasBest: oldBest };
}
export function addGems(pid, n) { prof(pid).gems += n; }
/* "best scores": each boy's best on every hole of a world added up; null until all 9 have a score */
export function bestTotal(pid, w, diff) {
  const b = diffProg(pid, diff).best[w];
  return b.every(v => v != null) ? b.reduce((a, v) => a + v, 0) : null;
}

export function equippedItem(pid, cat) {
  const id = prof(pid).equipped[cat];
  return SHOP[cat].find(it => it.id === id) || SHOP[cat][0];
}
