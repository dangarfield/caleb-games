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
/* How far into a song "back" stops meaning the previous song and starts
   meaning the beginning of this one. Every music player does this, and it is
   the difference between back being useful and back being a way to lose the
   song you were enjoying. */
const RESTART_AFTER = 5;   // seconds

export class Music {
  /**
   * @param {function} asset turns 'music/x.ogg' into a real URL
   * @param {object} [opts] onTrack(title) whenever the song changes
   */
  constructor(asset, opts = {}) {
    this.asset = asset;
    this.onTrack = opts.onTrack || (() => {});
    /* fires when going back becomes possible or stops being possible, so the
       button can show it rather than quietly doing nothing */
    this.onCanBack = opts.onCanBack || (() => {});
    /* fires the first time sound actually comes out, which is the only honest
       signal that the browser has let us start */
    this.onPlaying = opts.onPlaying || (() => {});
    this.onTrouble = opts.onTrouble || (() => {});
    this._couldBack = null;
    this._misses = 0;          // tracks that failed to load, in a row
    this._wanted = false;      // a gesture arrived before the manifest did
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
      /* Ask before we start rather than finding out twelve failures later.
         This is the one that catches Safari: Web Audio will happily DECODE an
         Ogg for the sound effects, while <audio> refuses to stream the same
         container — so the effects can be working fine and the music silent. */
      const probe = document.createElement('audio');
      const ext = ((this.tracks[0] || {}).file || '').split('.').pop();
      const type = ext === 'ogg' ? 'audio/ogg; codecs=opus'
                 : ext === 'm4a' ? 'audio/mp4; codecs=mp4a.40.2'
                 : ext === 'webm' ? 'audio/webm; codecs=opus' : '';
      this.playable = !type || !!probe.canPlayType(type);
      if (!this.playable) {
        this.onTrouble('this browser will not play ' + type);
        return false;
      }
    } catch (e) {
      this.tracks = [];
    }
    /* somebody already clicked while we were fetching */
    if (this.tracks.length && this._wanted) { this._wanted = false; this.start(); }
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
    /* A file that will not load should be stepped over — but if NOTHING will
       load, stepping over it just burns through all twelve in a second and
       deals again, which looks exactly like the playlist restarting itself.
       So give up after one full pass and say so. */
    el.addEventListener('error', () => {
      if (!this.started) return;
      this._misses++;
      if (this._misses >= this.tracks.length) {
        this.started = false;
        this._pushState();
        this.onTrouble('cannot play ' + (this.el && this.el.src || '').split('/').pop());
        return;
      }
      this._step(1);
    });
    /* sound is genuinely coming out: stop counting failures, and tell whoever
       is still waiting for a gesture that they can stop listening */
    el.addEventListener('playing', () => {
      this._misses = 0;
      this.onPlaying();
    });
    /* roughly four times a second while playing — cheap, and the only thing
       that can tell us we have crossed the line where back means restart */
    el.addEventListener('timeupdate', () => this._pushState());
    this.el = el;
    return el;
  }

  /* A slider is linear and hearing is not: halfway down a linear slider is
     still most of the loudness. Squaring gives the travel a natural taper. */
  _gain() { return Math.max(0, Math.min(1, this.volume)) ** 2; }

  /**
   * Begin, on the first gesture the browser will accept audio from.
   *
   * This gets called again on every gesture until sound actually comes out,
   * because a browser can refuse the first one or two. So it must be safe to
   * call repeatedly: if an order has already been dealt, retry the song we are
   * on rather than dealing a new one. Reshuffling on every retry was what made
   * pressing next look like it was starting a whole new playlist.
   */
  start() {
    /* The gesture can easily land before the manifest has finished loading —
       the listener goes on immediately, the fetch takes a moment. Remember
       that it happened and start the moment there is something to play,
       rather than making them press twice. The browser keeps the activation,
       so a play() a beat later is still allowed. */
    if (!this.tracks.length) { this._wanted = true; return; }
    if (this.started && this.playing) return;
    this.started = true;
    if (!this.order.length) { this._shuffle(); this._step(1); return; }
    const el = this._audio();
    if (!el.src) { this._step(1); return; }
    const p = el.play();
    if (p && p.catch) p.catch((err) => this._refused(err));
  }

  /** play() said no. Only an autoplay block means we have to stand down. */
  _refused(err) {
    if (err && err.name === 'NotAllowedError') {
      this.started = false;
      this._pushState();
    }
  }

  /**
   * Move along the shuffled order and play what we land on.
   *
   * Forward off the end draws a new order. Backward off the start wraps to the
   * end of the one we are in rather than trying to resurrect the order before
   * it, which is not kept — going back further than the current shuffle is not
   * a thing anyone is actually asking for.
   */
  _step(dir) {
    if (!this.tracks.length) return;
    this.at += dir;
    if (this.at >= this.order.length) { this._shuffle(); this.at = 0; }
    else if (this.at < 0) this.at = this.order.length - 1;
    const t = this.tracks[this.order[this.at]];
    const el = this._audio();
    this._cancelFade();
    el.volume = this._gain();
    el.src = this.asset('music/' + t.file);
    const p = el.play();
    /* Two very different failures arrive down the same pipe here.
       NotAllowedError means the browser refused to make a sound because it has
       not seen a gesture it trusts — the right answer is to stand down and let
       the next gesture start us. Everything else, and AbortError in
       particular, means WE interrupted the load by changing src, which is
       exactly what skipping does: pressing skip twice quickly used to trip
       this, clear `started`, and make the following press reshuffle the whole
       running order out from under you. */
    if (p && p.catch) p.catch((err) => this._refused(err));
    this.onTrack(t.title);
    this._pushState();
  }

  next() { this._step(1); }

  /** Back to the top of this song, or to the one before it. */
  restart() {
    const el = this.el;
    if (!el) return;
    this._cancelFade();
    el.volume = this._gain();
    el.currentTime = 0;
    el.play().catch(() => {});
    this.onTrack(this.title);
    this._pushState();
  }

  /** how far into the current song we are, in seconds */
  get elapsed() { return this.el ? this.el.currentTime || 0 : 0; }

  /**
   * Is there anywhere for "back" to go?
   *
   * On the first song of a shuffle there is no song before it — the order that
   * came before was thrown away and is not coming back. But a few seconds in,
   * back stops meaning the previous song and starts meaning the top of this
   * one, which is always somewhere to go. So this flips partway through the
   * first track, which is why it is pushed out on a signal rather than read
   * once.
   */
  get canGoBack() {
    if (!this.started) return false;
    return this.at > 0 || this.elapsed > RESTART_AFTER;
  }

  _pushState() {
    const ok = this.canGoBack;
    if (ok === this._couldBack) return;
    this._couldBack = ok;
    this.onCanBack(ok);
  }

  /** Skip: duck it out first, or the cut lands like a mistake. */
  skip() { this._leave(() => this._step(1)); }

  /**
   * Back. Within the first few seconds this means the previous song; after
   * that it means the start of this one — pressing it twice quickly is how you
   * get to the previous song from halfway through.
   */
  back() {
    if (!this.started) { this.start(); return; }
    if (!this.canGoBack) return;
    /* restarting is instant: a fade before jumping to the top of the song you
       are already listening to just feels slow */
    if (this.elapsed > RESTART_AFTER) { this.restart(); return; }
    this._leave(() => this._step(-1));
  }

  /** fade whatever is playing down to nothing, then do `then` */
  _leave(then) {
    if (!this.started) { this.start(); return; }
    const el = this.el;
    if (!el || el.paused) { then(); return; }
    const step = el.volume / Math.max(1, FADE * 60);
    this._cancelFade();
    this._fade = setInterval(() => {
      el.volume = Math.max(0, el.volume - step);
      if (el.volume <= 0.001) { this._cancelFade(); then(); }
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
