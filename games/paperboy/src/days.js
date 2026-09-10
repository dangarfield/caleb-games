// The seven days' obstacle plans, generated once by tools/make-days.mjs.
//
// Monday is the smallest set and each day keeps the one before and adds seven
// more, so the week builds and every replay of a day is the same day. The
// planner still edits its own plan in the saved blob; play uses these files.
import { DAYS } from './config.js';

let loaded = null;

export function loadDays() {
    if (loaded) return loaded;
    loaded = Promise.all(DAYS.map((_, i) =>
        // Resolved against this module, so it does not matter what path the
        // page itself is served from.
        fetch(new URL(`./plans/day${i + 1}.json`, import.meta.url))
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`day${i + 1}: ${r.status}`))))
            .then(d => ({ label: d.label, entities: d.plan }))
            .catch(err => { console.warn('Could not load a day plan:', err.message); return null; })));
    return loaded;
}
