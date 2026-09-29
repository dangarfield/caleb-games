// Summer Champs: the player's saves, in IndexedDB through arcade-store.js (knowledge/arcade-store.md).
// One item, calebArcadeData:summer-champs = { player, sound, kit:{caleb,ezra}, rec:{caleb,ezra}, perf, padsRight }.
// main.js waits for Store.ready() before any game module loads, so every get() here is synchronous.
//
// The anim editor's own keys (sc.animPatch.live, sc.animEditor.v2) stay in localStorage on purpose:
// they are written only by tools/anim-editor.html on Dan's desktop and are tiny.
const Store = window.ArcadeStore('summer-champs');
let data = null;
const load = () => (data = data || Store.get() || {});

/** SAVE.get('rec.caleb', {...}) style dotted paths, same names the design used for localStorage. */
export const SAVE = {
  get(k, d){ const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), load()); return v === undefined ? d : v; },
  set(k, v){
    const parts = k.split('.'), last = parts.pop(); let o = load();
    for (const p of parts) o = (o[p] && typeof o[p] === 'object') ? o[p] : (o[p] = {});
    o[last] = v; Store.set(null, data);
  },
  flush(){ Store.flush(); },
};
export const storeReady = cb => Store.ready(cb);
