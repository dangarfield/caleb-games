// Sound: one mp3 for the theme, everything else made on the fly.
//
// The arcade's convention is Web Audio for effects and no sample files
// (knowledge/audio-patterns.md), which suits this game: a dozen short sounds
// that cost nothing to ship and can be retuned by editing numbers. The theme is
// the one thing that has to be a file — games/paperboy/audio/theme.mp3.
//
// Browsers refuse to start audio before the person has interacted, so nothing
// is created and nothing is played until unlock() is called from a real
// gesture; every call before that only records what should happen next.
//
// There is no mute control: sound is part of the game. The theme starts by
// itself on the first touch or key press.

const MUSIC_VOLUME = 0.34;      // under the effects: it is a backing track
const SFX_VOLUME = 0.5;
const REPEAT_GAP = 0.04;        // seconds before the same sound may fire again

let ctx = null;
let master = null;
let music = null;
let gestured = false;           // has the person touched the page yet?
let wanted = false;             // should the theme be playing?
const lastAt = new Map();

const now = () => (ctx ? ctx.currentTime : 0);

function ensure() {
    if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = SFX_VOLUME;
    master.connect(ctx.destination);
    return ctx;
}

// --- the building blocks ---------------------------------------------------

// A tone, optionally sweeping to a second frequency.
function tone(freq, dur, { type = 'sine', vol = 0.6, to = null, at = 0, attack = 0.005 } = {}) {
    if (!ctx) return;
    const t = now() + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
}

// Filtered noise: scrapes, thumps, glass, tyres.
function noise(dur, { vol = 0.4, freq = 900, q = 1, type = 'bandpass', at = 0, to = null } = {}) {
    if (!ctx) return;
    const t = now() + at;
    const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
}

const chord = (freqs, dur, opts = {}) =>
    freqs.forEach((f, i) => tone(f, dur, { ...opts, at: (opts.at || 0) + i * (opts.spread ?? 0.07) }));

// --- the sounds ------------------------------------------------------------
// Named for what happens, not for how they are made.
const SOUNDS = {
    // A paper leaving his hand.
    throw: () => {
        noise(0.16, { vol: 0.22, freq: 1800, to: 500, q: 0.7 });
        tone(420, 0.14, { type: 'triangle', vol: 0.12, to: 900 });
    },
    // Through a window: glass, then the pane falling in.
    window: () => {
        noise(0.05, { vol: 0.3, freq: 5200, q: 2 });
        chord([2400, 3200, 4100], 0.22, { type: 'triangle', vol: 0.16, spread: 0.035 });
        noise(0.22, { vol: 0.12, freq: 3000, to: 1200, q: 1.5, at: 0.06 });
    },
    // In the box: the tin clank of the flap, then the delivery chime.
    mailbox: () => {
        noise(0.07, { vol: 0.3, freq: 2600, q: 3 });
        tone(180, 0.1, { type: 'square', vol: 0.14, to: 120 });
        chord([784, 1046, 1318], 0.4, { type: 'sine', vol: 0.3, spread: 0.075 });
    },
    // Dead centre of a target: a board thud and a rising flourish.
    target: () => {
        noise(0.1, { vol: 0.35, freq: 400, to: 160, q: 0.8 });
        chord([523, 659, 784, 1046], 0.45, { type: 'triangle', vol: 0.26, spread: 0.06 });
    },
    // A bale: dull, dusty, no ring to it at all.
    haybale: () => {
        noise(0.26, { vol: 0.36, freq: 320, to: 120, q: 0.6, type: 'lowpass' });
        tone(120, 0.16, { type: 'sine', vol: 0.18, to: 70 });
    },
    // Catching someone on the round.
    npc: () => {
        tone(300, 0.14, { type: 'sawtooth', vol: 0.22, to: 150 });
        noise(0.12, { vol: 0.2, freq: 900, to: 400 });
    },
    // A fresh bundle of papers.
    pickup: () => chord([523, 659, 784], 0.3, { type: 'sine', vol: 0.28, spread: 0.06 }),
    // Off the pedals.
    jump: () => tone(300, 0.22, { type: 'triangle', vol: 0.2, to: 760 }),
    land: () => {
        noise(0.12, { vol: 0.24, freq: 260, to: 110, q: 0.7, type: 'lowpass' });
        tone(110, 0.1, { type: 'sine', vol: 0.14, to: 70 });
    },
    // Bike, boy and papers all over the pavement.
    crash: () => {
        noise(0.34, { vol: 0.45, freq: 1400, to: 200, q: 0.6 });
        tone(340, 0.4, { type: 'sawtooth', vol: 0.22, to: 80 });
        noise(0.2, { vol: 0.2, freq: 3000, q: 4, at: 0.12 });     // spokes rattling
    },
    // Trigger pulled on an empty bag.
    nopapers: () => {
        tone(220, 0.05, { type: 'square', vol: 0.12 });
        tone(180, 0.05, { type: 'square', vol: 0.12, at: 0.08 });
    },
    // Get ready, and go.
    ready: () => chord([440, 554], 0.24, { type: 'triangle', vol: 0.2, spread: 0.12 }),
    go: () => tone(880, 0.3, { type: 'triangle', vol: 0.26, to: 1320 }),
    // Day finished.
    dayDone: () => chord([523, 659, 784, 1046, 1318], 0.6, { type: 'triangle', vol: 0.24, spread: 0.11 }),
    // Out of lives.
    gameOver: () => chord([440, 349, 262], 0.7, { type: 'sine', vol: 0.26, spread: 0.18 }),
    // Back on the bike.
    respawn: () => chord([392, 523, 659], 0.28, { type: 'triangle', vol: 0.22, spread: 0.05 }),
    // Any button.
    click: () => tone(660, 0.06, { type: 'square', vol: 0.1 }),
};

export const audio = {
    // Called from the first real gesture; safe to call repeatedly. Until this
    // has run the browser would refuse anything we started, so it is also the
    // moment the theme is allowed to begin.
    unlock() {
        gestured = true;
        ensure();
        if (wanted) this.music(true);
    },

    play(name) {
        if (!SOUNDS[name]) return;
        if (!ensure()) return;
        const t = now();
        if (t - (lastAt.get(name) ?? -9) < REPEAT_GAP) return;
        lastAt.set(name, t);
        SOUNDS[name]();
    },

    // The theme. An <audio> element rather than a decoded buffer: 118 seconds of
    // stereo would be tens of megabytes in memory, and this streams.
    //
    // Called before the first gesture this only remembers that the theme is
    // wanted — calling play() that early earns a console warning and nothing
    // else, so unlock() is what actually starts it.
    music(on) {
        wanted = on;
        if (!on) { music?.pause(); return; }
        if (!gestured) return;
        if (!music) {
            music = new Audio(new URL('../audio/theme.mp3', import.meta.url).href);
            music.loop = true;
            music.volume = MUSIC_VOLUME;
            music.preload = 'auto';
        }
        music.play().catch(() => {});
    },

    // What the sound system is actually doing, for the console.
    info() {
        return {
            context: ctx ? ctx.state : 'not created',
            gestured,
            themeWanted: wanted,
            theme: music
                ? {
                    playing: !music.paused,
                    at: +music.currentTime.toFixed(1),
                    volume: music.volume,
                    // 4 = enough buffered to play through, 0 = nothing yet.
                    ready: music.readyState,
                    network: music.networkState,
                    error: music.error ? music.error.code : null,
                }
                : null,
            sounds: Object.keys(SOUNDS),
        };
    },
};
