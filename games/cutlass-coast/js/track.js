// track.js — "point me there": one tracked target per career (career.track = {type, id}).
// Set from the Captain's Log (Quests tab); the sailing HUD shows an arrow + distance to it.
import * as W from './world.js';
import { searchArea } from './modes/sail-chart.js';

const LEAGUE = 25; // world units per league (display only)

/** Can this quest row be tracked right now? → { ok, why } */
export function canTrack(c, type, id) {
  if (type === 'town') return W.townById(id) ? { ok: true } : { ok: false, why: '' };
  if (type === 'villain') {
    const got = Array.isArray(c.villainsCaught) && c.villainsCaught.includes(id);
    return got ? { ok: false, why: 'Already caught' } : { ok: true };
  }
  if (type === 'family') {
    const f = (c.family || []).find(x => x.id === id);
    if (!f || f.found) return { ok: false, why: 'Already home' };
    return f.clues >= 4 && W.townById(f.townId) ? { ok: true } : { ok: false, why: 'Needs all 4 clues' };
  }
  if (type === 'treasure') {
    if ((c.treasuresFound || []).includes(id)) return { ok: false, why: 'Already dug up' };
    const n = ((c.mapFragments && c.mapFragments[id]) || []).filter(Boolean).length;
    return n >= 3 ? { ok: true } : { ok: false, why: 'Needs 3 pieces' };
  }
  return { ok: false, why: '' };
}

export const isTracked = (c, type, id) => !!(c.track && c.track.type === type && c.track.id === id);

export function setTrack(c, type, id) {
  c.track = type ? { type, id } : null;
  // one idea, not two: tracking a treasure map also marks its search circle on the chart; tracking anything else
  // (or stopping) clears the mark
  c.markedQuest = type === 'treasure' ? id : null;
}

/**
 * Where the tracked target is. → { x, z, name, where } or null (and clears a finished track).
 * live: optional [{x, z, villainId}] ships in view — a tracked villain's real ship beats his haunt.
 */
export function trackTarget(c, live = []) {
  const t = c && c.track; if (!t) return null;
  if (!canTrack(c, t.type, t.id).ok) { c.track = null; return null; }
  if (t.type === 'town') {
    const town = W.townById(t.id);
    return town && { x: town.harbour.x, z: town.harbour.z, name: town.name, where: `${W.NATIONS[W.townInfo(town, c).nation].adj} port` };
  }
  if (t.type === 'villain') {
    const v = W.VILLAINS.find(x => x.id === t.id); if (!v) return null;
    const s = live.find(x => x.villainId === v.id);
    if (s) return { x: s.x, z: s.z, name: v.name, where: `the ${v.shipName} is in sight!`, live: true };
    const town = W.townById(v.haunt);
    return town && { x: town.harbour.x, z: town.harbour.z, name: v.name, where: `near ${town.name}` };
  }
  if (t.type === 'family') {
    const f = c.family.find(x => x.id === t.id), town = W.townById(f.townId);
    return town && { x: town.harbour.x, z: town.harbour.z, name: f.name, where: `held in ${town.name}` };
  }
  if (t.type === 'treasure') {
    const q = W.questById(t.id); if (!q) return null;
    const prev = c.markedQuest; c.markedQuest = t.id;
    const a = searchArea(c); c.markedQuest = prev;
    return a && { x: a.x, z: a.z, name: q.name, where: q.area, r: a.r };
  }
  return null;
}

/** Distance text, e.g. "38 leagues" / "close by". */
export function distText(d) {
  if (d < 90) return 'right here';
  const l = Math.max(1, Math.round(d / LEAGUE));
  return `${l} ${l === 1 ? 'league' : 'leagues'}`;
}
