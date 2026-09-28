/* state.js — saves through ArcadeStore('buttons') → IndexedDB item calebArcadeData:buttons.
 * Per boy: best stars + best time per room, gags found (Button Book), on-ride photos. Room n is open when
 * room n-1 is cleared by that boy; the Big Dipper opens when he has cleared room 10. No difficulty.
 * Settings: who's playing, and the pause menu's "Make it easier" switch (stays on until switched off).
 * Guarded writes (gen + sid) so an old tab left open can't write over this one. */

const Store = window.ArcadeStore('buttons');
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0;

export const PIDS = ['Caleb', 'Ezra'];
const freshBoy = () => ({ rooms: {}, gags: [], photos: [] });
const fresh = () => ({ v: 1, boys: { Caleb: freshBoy(), Ezra: freshBoy() }, settings: { player: 'Caleb', easier: false } });

export const S = { data: fresh(), ok: true };

export function loadSave(cb) {
  Store.ready(() => {
    const d = Store.get();
    if (d && d.boys) {
      gen = d.gen || 0;
      const f = fresh();
      S.data = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, boys: {} };
      for (const p of PIDS) S.data.boys[p] = { ...freshBoy(), ...((d.boys || {})[p] || {}) };
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
export const flush = () => Store.flush && Store.flush();

export const boy = p => S.data.boys[p || S.data.settings.player];
export const rooms = p => boy(p).rooms;
export const roomOpen = (p, n) => n === 1 || !!rooms(p)[n - 1];
export const dipperOpen = p => !!rooms(p)[10];
export const totalStars = p => Object.values(rooms(p)).reduce((a, r) => a + r.s, 0);
export const totalTime = p => Object.values(rooms(p)).reduce((a, r) => a + r.t, 0);
export const roomsDone = p => Object.keys(rooms(p)).length;

/* returns true when it's a new best (more stars, or a faster time) */
export function recordRoom(p, n, stars, secs) {
  const R = rooms(p), prev = R[n];
  const nb = !prev || stars > prev.s || secs < prev.t;
  R[n] = { s: Math.max(prev ? prev.s : 0, stars), t: Math.min(prev ? prev.t : 1e9, secs) };
  save();
  return nb;
}
export function recordGag(p, id) {
  const g = boy(p).gags; if (g.includes(id)) return false;
  g.push(id); save(); return true;
}
export function recordPhoto(p) {
  boy(p).photos.push({ date: Date.now(), stars: totalStars(p), time: totalTime(p) });
  save();
}
export function setSetting(k, v) { S.data.settings[k] = v; save(); }
