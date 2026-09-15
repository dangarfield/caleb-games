/* audio.js — the original ships no sound at all, so this is the one place the
 * port adds rather than copies.
 *
 * Two layers, and the second one is optional. Underneath there is a synthesised
 * set that needs no files at all: a rolling rumble whose filter opens with
 * speed, a pop on the ollie, a bright metallic hiss while grinding, a thump on
 * landing, glass. On top, if assets/audio/ is there, real recordings for the
 * four that carry the feel — riding, grinding, the jump and the crash. The
 * recordings win where they exist and the synth covers whatever is missing, so
 * the game sounds like something either way and nothing 404s in a park.
 *
 * All five live end to end in ONE file — assets/audio/sfx.ogg, about 28 kB for
 * the lot — with assets/audio/sounds.json saying where each one sits inside
 * it. One request, one decode, one buffer, and the looping two loop within
 * that buffer: an AudioBufferSourceNode takes a loopStart and a loopEnd and
 * neither has to be an end of the file. The repeat is then the browser's job
 * and comes out sample-exact instead of something this file has to schedule.
 *
 * tools/build_sfx.py makes the pair out of the clipper's wavs.
 */
const PACK_DIR = 'audio/';   // main.js's asset() puts 'assets/' in front
/* Below this fraction of top speed the wheels are stopped, not slow. */
const ROLL_FLOOR = 0.035;
const PACK = ['ride', 'grind', 'jump', 'land', 'crash',
              'trick', 'pickup', 'objective', 'smash'];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.roll = null;
    this.pack = null;        // name -> { buffer, loop, loopStart, loopEnd }
    this.voices = null;      // the two looping voices, built on first use
  }

  /**
   * Look for the recorded set. Safe to call before or after resume(), and safe
   * to never call: a missing folder leaves this.pack null and the synth does
   * all the work.
   *
   * @param {function} asset maps a name to a URL, the way main.js does it
   */
  async loadPack(asset = (p) => p) {
    let meta, buffer;
    try {
      const res = await fetch(asset(PACK_DIR + 'sounds.json'), { cache: 'no-cache' });
      if (!res.ok) return false;
      meta = await res.json();

      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!this.ctx) this.resume();
      if (!this.ctx) return false;

      const audio = await fetch(asset(PACK_DIR + 'sfx.ogg'), { cache: 'no-cache' });
      if (!audio.ok) return false;
      /* Vorbis is not universal — if this browser cannot decode it the whole
         pack is off and the synthesised set carries on, which is the same
         thing that happens when the folder is not there at all. */
      buffer = await this.ctx.decodeAudioData(await audio.arrayBuffer());
    } catch (e) { return false; }

    const pack = {};
    for (const name of PACK) {
      const m = meta[name];
      if (!m) continue;
      pack[name] = {
        buffer,
        offset: m.offset || 0,
        duration: m.duration || (buffer.duration - (m.offset || 0)),
        loop: !!m.loop,
        loopStart: m.loopStart || 0,
        loopEnd: m.loopEnd || buffer.duration
      };
    }
    if (!Object.keys(pack).length) return false;
    this.pack = pack;
    return true;
  }

  /**
   * The two looping voices, each running all the time with its gain at zero
   * until it is wanted. Starting a source costs a frame and cannot be undone,
   * so they are started once and mixed rather than started per grind.
   */
  _buildVoices() {
    if (this.voices || !this.pack || !this.ctx) return;
    const make = (clip) => {
      if (!clip) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = clip.buffer;
      src.loop = true;
      src.loopStart = clip.loopStart;
      src.loopEnd = clip.loopEnd;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.master);
      /* start where this sound sits in the file, not at the top of it */
      src.start(0, clip.offset);
      return { src, g };
    };
    this.voices = { ride: make(this.pack.ride), grind: make(this.pack.grind) };
  }

  /** fire one of the recorded one-shots; false if there isn't one */
  _shot(name, vol = 0.9, rate = 1) {
    const clip = this.pack && this.pack[name];
    if (!clip || !this.ctx || !this.on) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    /* one slice of the shared buffer, and it stops at the end of its slice
       rather than running on into whatever was packed after it */
    src.start(0, clip.offset, clip.duration);
    return true;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._buildRoll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * Stop the world making noise while the game is paused.
   *
   * The rolling rumble is a looping source with a gain that is only ever
   * written from the play loop, so pausing left it humming at whatever it was
   * doing when you hit the button — which is exactly the moment you are most
   * likely to be reading a menu. Suspending the context stops everything
   * dead, tails included, and costs nothing to undo.
   */
  setPaused(paused) {
    if (!this.ctx) return;
    if (paused) {
      if (this.ctx.state === 'running') this.ctx.suspend();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _noiseBuffer(seconds = 2) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _buildRoll() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(3);
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.roll = { src, bp, g };
  }

  /**
   * Called every frame: speed 0..1, grinding flips the timbre.
   *
   * The level has to reach ZERO, and it has to reach it at a standstill rather
   * than merely getting quiet. A rolling loop held at a quarter volume under a
   * stationary skater is not a quiet rumble, it is a second sound in the room
   * that never goes away — on the menu especially, where nobody is moving at
   * all. So there is a speed below which the wheels are simply not turning.
   */
  rolling(speed, grinding, airborne) {
    if (!this.ctx || !this.on) return;
    const still = speed < ROLL_FLOOR;

    if (this.pack) {
      this._buildVoices();
      const v = this.voices;
      const t = this.ctx.currentTime;
      /* from nothing at a standstill, not from a quarter */
      const level = (airborne || still) ? 0
        : Math.min(1, (speed - ROLL_FLOOR) / (1 - ROLL_FLOOR) * 0.9 + 0.1);
      /* the two never both play: grinding is grinding */
      if (v.ride) {
        v.ride.g.gain.setTargetAtTime(grinding ? 0 : level * 0.5, t, 0.08);
        /* a touch faster when he is moving, which is what a wheel does */
        v.ride.src.playbackRate.setTargetAtTime(0.82 + speed * 0.4, t, 0.12);
      }
      if (v.grind) {
        v.grind.g.gain.setTargetAtTime(grinding && !airborne ? level * 0.6 : 0, t, 0.05);
        v.grind.src.playbackRate.setTargetAtTime(0.9 + speed * 0.3, t, 0.1);
      }
      /* whichever of the two is missing falls through to the synth rumble */
      if (v.ride && v.grind) { this.roll.g.gain.setTargetAtTime(0, t, 0.08); return; }
    }

    const r = this.roll;
    const target = (airborne || still) ? 0.0 : Math.min(0.22, speed * 0.22);
    r.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    r.bp.frequency.setTargetAtTime(grinding ? 1400 + speed * 900 : 160 + speed * 420, this.ctx.currentTime, 0.06);
    r.bp.Q.setTargetAtTime(grinding ? 7 : 1.2, this.ctx.currentTime, 0.06);
  }

  _blip(freq, dur, type = 'square', vol = 0.18, slideTo = null) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  pop() {
    /* a little variety so twenty ollies in a row are not one sound twenty
       times — the recording is the same, the speed is not */
    if (this._shot('jump', 0.8, 0.94 + Math.random() * 0.12)) return;
    this._blip(320, 0.11, 'square', 0.16, 700);
  }
  land() {
    if (this._shot('land', 0.85, 0.95 + Math.random() * 0.1)) return;
    this._blip(90, 0.14, 'sine', 0.3, 45); this._thump();
  }
  bail() {
    if (this._shot('crash', 0.9, 0.96 + Math.random() * 0.08)) return;
    this._blip(240, 0.45, 'sawtooth', 0.2, 50); this._thump();
  }
  /* The three little events, each with its own sound, because they mean
     different things: a trick banked, a thing collected, a goal finished.
     Each falls back to a synth blip until there is a recording for it. */

  /** every trick that banks points — fires a lot, so it stays short */
  trick() {
    if (this._shot('trick', 0.55, 0.97 + Math.random() * 0.06)) return;
    this._blip(660, 0.07, 'triangle', 0.11, 990);
  }

  /** a SKATE letter or a golden deck */
  pickup() {
    if (this._shot('pickup', 0.8)) return;
    this._blip(880, 0.1, 'triangle', 0.15, 1320);
  }

  /** an objective ticked off — two notes, so it lands as an ending */
  objective() {
    if (this._shot('objective', 0.9)) return;
    this._blip(740, 0.1, 'triangle', 0.15);
    setTimeout(() => this._blip(1110, 0.18, 'triangle', 0.15), 95);
  }

  /** A window going. A short bright crack, then the bits landing after it. */
  smash() {
    if (this._shot('smash', 0.9, 0.96 + Math.random() * 0.08)) return;
    if (!this.ctx) return;
    this._blip(2400, 0.07, 'square', 0.1, 900);
    const t = this.ctx.currentTime;
    /* the tinkle: noise through a high band-pass, tailing off over half a
       second, which is about how long the pieces take to stop bouncing */
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuffer(0.7);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t); s.stop(t + 0.7);
  }

  _thump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuffer(0.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(lp).connect(g).connect(this.master);
    s.start(t); s.stop(t + 0.2);
  }

  setEnabled(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.5 : 0;
  }
}
