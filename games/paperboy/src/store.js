// The one saved blob for the game.
//
// Everything the game remembers — the enemy plan, the planner's view, the boys'
// progress — shares a single localStorage item under the arcade's key, so every
// write has to merge into what is already there rather than replace it.
//
// (The arcade's newer convention is IndexedDB via arcade-store.js. This is a
// research build and its saves are prototype data; moving it is a job for when
// it graduates to games/paperboy/index.html.)
import { STORE_KEY } from './config.js';

export function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
    catch { return {}; }
}

export function writeStore(patch) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...patch })); }
    catch (err) { console.warn('Could not write saved data:', err.message); }
}
