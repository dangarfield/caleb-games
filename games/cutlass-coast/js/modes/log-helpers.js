// log-helpers.js — small shared helpers for the log and retirement screens (fame label, counts, wife name).

/** Fame 0..100 → label */
export function fameLabel(f) { return f >= 80 ? 'Legendary' : f >= 60 ? 'Famous' : f >= 40 ? 'Notorious' : f >= 25 ? 'Respected' : f >= 10 ? 'Known' : 'Unknown'; }
/** Count helper: career fields may be arrays (ids) or numbers. */
export const countOf = v => (Array.isArray(v) ? v.length : +v || 0);
/** Wife display name (string or {name}). */
export const wifeName = w => (!w ? '' : typeof w === 'string' ? w : w.name || 'his sweetheart');
