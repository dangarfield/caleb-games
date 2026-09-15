/* music.js — the soundtrack, on shuffle.
 *
 * Twelve songs about Ezra and Caleb, played in a random order that reshuffles
 * when it runs out, with a skip button and a volume that is remembered.
 *
 * This deliberately does NOT go through the Web Audio graph that audio.js
 * builds for the sound effects. Those are short, are triggered dozens of times
 * a second and have to be sample accurate, so they are decoded whole into
 * memory. A song is three minutes long: decoding one would cost about thirty
 * megabytes of RAM and a visible stall. A plain <audio> element streams it
 * instead, starts on the first few kilobytes, and costs nothing to keep
 * around. The two systems share nothing but the speakers.
 */

const FADE = 0.45;         // seconds to fade out under a skip, so it is not a cut

export class Music {
  /**
   * @param {function} asset turns 'music/x.ogg' into a real URL
   * @param {object} [opts] onTrack(title) whenever the song changes
   */
  constructor(asset, opts = {}) {
    this.asset = asset;
    this.onTrack = opts.onTrack || (() => {});
    this.tracks = [];
    this.order = [];
    this.at = -1;
    this.volume = 0.8;
    this.started = false;
    this.el = null;
    this._fade = 0;
  }

  /** read the manifest; harmless if there is no music installed */
  async load() {
    try {
      const r = await fetch(this.asset('music/music.json'), { cache: 'force-cache' });
      if (!r.ok) return false;
      const j = await r.json();
      this.tracks = (j && j.tracks) || [];
    } catch (e) {
      this.tracks = [];
    }
    return this.tracks.length > 0;
  }

  get title() {
    const t = this.tracks[this.order[this.at]];
    return t ? t.title : '';
  }
  get playing() { return !!(this.el && !this.el.paused); }
  get count() { return this.tracks.length; }

  /**
   * A fresh random order.
   *
   * Reshuffling the moment the list runs out can put the same song either side
   * of the join, which of all the orders a shuffle can produce is the one that
   * sounds broken. So the new order never opens with the song that just
   * finished.
   */
  _shuffle() {
    const last = this.order.length ? this.order[this.order.length - 1] : -1;
    const a = this.tracks.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.length > 1 && a[0] === last) [a[0], a[1]] = [a[1], a[0]];
    this.order = a;
    this.at = -1;
  }

  _audio() {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = 'auto';
    el.volume = this._gain();
    /* one song at a time, and the next one follows on its own */
    el.addEventListener('ended', () => this.next());
    /* a missing or unplayable file must not end the party */
    el.addEventListener('error', () => { if (this.started) this.next(); });
    this.el = el;
    return el;
  }

  /* A slider is linear and hearing is not: halfway down a linear slider is
     still most of the loudness. Squaring gives the travel a natural taper. */
  _gain() { return Math.max(0, Math.min(1, this.volume)) ** 2; }

  /** Begin, on the first gesture the browser will accept audio from. */
  start() {
    if (this.started || !this.tracks.length) return;
    this.started = true;
    this._shuffle();
    this.next();
  }

  next() {
    if (!this.tracks.length) return;
    this.at++;
    if (this.at >= this.order.length) this._shuffle(), this.at = 0;
    const t = this.tracks[this.order[this.at]];
    const el = this._audio();
    this._cancelFade();
    el.volume = this._gain();
    el.src = this.asset('music/' + t.file);
    const p = el.play();
    /* Autoplay can still be refused — the gesture may not have counted. Say
       nothing and let the next gesture try again, rather than throwing. */
    if (p && p.catch) p.catch(() => { this.started = false; });
    this.onTrack(t.title);
  }

  /** Skip: duck it out first, or the cut lands like a mistake. */
  skip() {
    if (!this.started) { this.start(); return; }
    const el = this.el;
    if (!el || el.paused) { this.next(); return; }
    const from = el.volume, step = from / Math.max(1, FADE * 60);
    this._cancelFade();
    this._fade = setInterval(() => {
      el.volume = Math.max(0, el.volume - step);
      if (el.volume <= 0.001) { this._cancelFade(); this.next(); }
    }, 1000 / 60);
  }

  _cancelFade() { if (this._fade) { clearInterval(this._fade); this._fade = 0; } }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._cancelFade();
    if (this.el) this.el.volume = this._gain();
  }

  /** Stop or resume the music itself — separate from pausing the game. */
  setPlaying(on) {
    if (!this.el) { if (on) this.start(); return; }
    if (on) { this.el.volume = this._gain(); this.el.play().catch(() => {}); }
    else this.el.pause();
  }

  toggle() { this.setPlaying(!this.playing); }
}
