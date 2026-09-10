// Who is playing, and what they have done before.
//
// One record per boy: the furthest day he has reached and his best score. Those
// are the two things the home menu shows, and the only things a finished run
// leaves behind.
import { PLAYERS } from './config.js';
import { readStore, writeStore } from './store.js';

const blank = () => ({ bestDay: 0, highScore: 0, runs: 0 });

export function loadProfiles() {
    const saved = readStore().profiles || {};
    const out = {};
    for (const name of PLAYERS) out[name] = { ...blank(), ...saved[name] };
    return out;
}

// Merge one boy's record; never touches the other's, or anything else in the blob.
export function saveProfile(name, patch) {
    const all = loadProfiles();
    all[name] = { ...all[name], ...patch };
    writeStore({ profiles: all });
    return all;
}

// What a finished run leaves behind: a best is only ever raised.
export function recordRun(name, { score, day }) {
    const before = loadProfiles()[name] || blank();
    return saveProfile(name, {
        highScore: Math.max(before.highScore, Math.round(score)),
        bestDay: Math.max(before.bestDay, day),
        runs: before.runs + 1,
    });
}
