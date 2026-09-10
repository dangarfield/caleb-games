// Detail level, and what it costs.
//
// One dial with two settings, because what matters on a weak tablet is not a
// slider — it is whether the GPU draws the scene twice (shadows) at four times
// the pixels (retina). `high` is the desktop look; `low` drops the second pass
// and the extra pixels.
//
// Antialiasing is the exception: it is fixed when the WebGL context is created,
// so it follows the SAVED level and a change takes effect on the next load.
// Everything else applies immediately.
import { readStore, writeStore } from './store.js';

export const PRESETS = {
    high: {
        label: 'High',
        pixelRatio: 1.5,      // was min(dpr, 2) — a retina tablet drew 4x the pixels
        antialias: true,
        shadows: true,
        shadowMapSize: 1024,  // was 2048
        // Only used where the view sits still (the planner). A stale shadow
        // under a moving rider trails visibly behind the bike and reads as
        // broken animation, so play refreshes the map every frame.
        shadowEveryN: 4,
        crowd: 1,             // how much of the stand is filled
        confetti: 1,          // how much of a burst is thrown
    },
    low: {
        label: 'Low',
        pixelRatio: 1,
        antialias: false,
        shadows: false,      // and with no shadows the cadence is moot
        shadowMapSize: 512,
        shadowEveryN: 4,
        crowd: 0.55,
        confetti: 0.5,
    },
};

// Nothing saved means "start high and drop if the frames say so"; the auto
// check runs once and then stops asking.
const saved = readStore().quality;
let name = PRESETS[saved] ? saved : 'high';
let autoAllowed = !PRESETS[saved];

export const quality = {
    get name() { return name; },
    get preset() { return PRESETS[name]; },
    listeners: [],
    onChange(fn) { this.listeners.push(fn); fn(PRESETS[name], name); },
    set(next, { remember = true, auto = false } = {}) {
        if (!PRESETS[next] || next === name) return false;
        name = next;
        if (!auto) autoAllowed = false;
        if (remember) writeStore({ quality: next });
        for (const fn of this.listeners) fn(PRESETS[name], name);
        return true;
    },
    // Called once from the loop with a measured average frame time.
    autoCheck(msPerFrame) {
        if (!autoAllowed) return false;
        autoAllowed = false;
        if (msPerFrame <= 22) return false;
        console.log(`Frames averaging ${msPerFrame.toFixed(1)}ms — dropping to low detail`);
        return this.set('low', { auto: true });
    },
};
