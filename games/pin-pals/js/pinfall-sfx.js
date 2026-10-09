/* pinfall-sfx.js — every Pin Pals sound. Recorded sounds live in sfx/; the tension hum is generated.
   Shared by the game (index.html) and the Sound lab (sound-lab.html) so both play exactly the same thing.

   const fx = PinfallSFX.create(ctx, sfxBus, musicBus, cfg)
   cfg = { fx: { <id>: { gain: 1, pitch: 0 } }, mix: { balance: 0 } }
     gain   multiplies that sound's volume (0–2)
     pitch  random pitch spread in semitones: every play picks a new offset within ±pitch (0 = always the same)
     balance −1 = all music … 0 = even … +1 = all effects (a crossfade between the two buses)
   Recorded files are auto-trimmed: leading silence is skipped so every sound starts on its attack.
   Settings are stored with ArcadeStore('pinfall-sound') and read by the game at start-up. */
(function () {
  const BASE = 'sfx/';
  const LIST = [
    { id: 'tick',      group: 'Aiming',          name: 'Board tick',       desc: 'Each board while dragging the ball sideways', files: ['board-tick.webm'] },
    { id: 'tock',      group: 'Aiming',          name: 'Ready tock',       desc: 'When the ring turns brass (Ready)', files: ['ready-tock.webm'] },
    { id: 'tension',   group: 'Aiming',          name: 'Tension hum',      desc: 'Low wobble when you hold past the Ready window', loop: true },
    { id: 'roll',      group: 'Rolling',         name: 'Ball roll',        desc: 'Loops while the ball rolls; volume follows speed', files: ['ball-roll.webm'], loop: true },
    { id: 'swipe',     group: 'Rolling',         name: 'Steer swipe',      desc: 'Each spin swipe', files: ['steer-swipe.webm'] },
    { id: 'gutter',    group: 'Rolling',         name: 'Gutter',           desc: 'Ball drops into the gutter', files: ['gutter-hit-and-fall.webm'] },
    { id: 'pinFirst',  group: 'Pins',            name: 'Pin hit (first)',  desc: 'The ball\u2019s first contact, only when 4+ pins are standing; one of three at random (otherwise Pin hit (repeat))', files: ['pin-hit-many.webm', 'pin-hit-many2.webm', 'pin-hit-many3.webm'] },
    { id: 'pinRepeat', group: 'Pins',            name: 'Pin hit (repeat)', desc: 'Every later knock: pin on pin, pin on floor, gutter or back wall', files: ['pin-hit-one.webm'] },
    { id: 'strike',    group: 'Results',         name: 'Strike / spare',   desc: 'On a strike or a spare (same sound)', files: ['strike-spare.webm'] },
    { id: 'cheer',     group: 'Results',         name: 'Cheer',            desc: 'Plays together with Strike / spare', files: ['cheer.webm'] },
    { id: 'blip',      group: 'Menus & buttons', name: 'Button tap',       desc: 'Most taps: lockers, lane picker, pause, shop tiles', files: ['ui-tap.webm'] },
    { id: 'go',        group: 'Menus & buttons', name: 'Play / Done tap',  desc: 'Play, Continue, Play together, Resume, Rematch, Done', files: ['ui-tap-play-done.webm'] },
    { id: 'spend',     group: 'Menus & buttons', name: 'Spend coins',      desc: 'Buying a ball in the shop', files: ['ui-spend-money.webm'] },
  ];
  const GROUPS = ['Aiming', 'Rolling', 'Pins', 'Results', 'Menus & buttons'];
  const MUSIC = [
    { id: 'maple', name: 'Maple Alley', file: 'music/pinfall-maple.webm' },
    { id: 'cosmic', name: 'Neon Galaxy', file: 'music/pinfall-cosmic.webm' },
    { id: 'metal', name: 'Riff Arena', file: 'music/pinfall-metal.webm' },
  ];
  // the tuned mix (from the Sound lab) is the default for everyone
  const TUNED = {"fx":{"tick":{"gain":0.54,"pitch":0.5},"tock":{"gain":0.61,"pitch":0},"tension":{"gain":1,"pitch":0},"roll":{"gain":2,"pitch":6},"swipe":{"gain":0.77,"pitch":6},"gutter":{"gain":1,"pitch":6},"pinFirst":{"gain":1,"pitch":0.5},"pinRepeat":{"gain":0.71,"pitch":1.5},"strike":{"gain":0.84,"pitch":0},"cheer":{"gain":0.61,"pitch":0.5},"blip":{"gain":1,"pitch":0},"go":{"gain":1,"pitch":0},"spend":{"gain":1.64,"pitch":0}},"mix":{"balance":0}};
  const defaults = () => JSON.parse(JSON.stringify(TUNED));

  function create(ctx, sfxOut, musicOut, cfg) {
    cfg = merge(defaults(), cfg || {});
    const fxBus = ctx.createGain(), muBus = ctx.createGain();
    fxBus.connect(sfxOut); muBus.connect(musicOut || sfxOut);
    const bufs = {}, trim = {};
    let rollN = null, tensN = null, lastRep = 0, repCount = 0, muted = false;
    // load + find each file's first audible sample (−34 dB) so playback skips the silence
    LIST.forEach(e => (e.files || []).forEach(f => {
      fetch(BASE + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => ctx.decodeAudioData(b)).then(buf => {
        bufs[f] = buf; const d = buf.getChannelData(0); let i = 0; while (i < d.length && Math.abs(d[i]) < 0.02) i++;
        trim[f] = Math.max(0, i / buf.sampleRate - 0.004);
      }).catch(() => {});
    }));
    const G = id => (cfg.fx[id] ? cfg.fx[id].gain : 1);
    const R = id => { const p = cfg.fx[id] ? Math.abs(cfg.fx[id].pitch) : 0; return Math.pow(2, ((Math.random() * 2 - 1) * p) / 12); };
    function applyMix() {
      const a = (Math.max(-1, Math.min(1, cfg.mix.balance)) + 1) / 2;
      fxBus.gain.value = Math.min(1, Math.sin(a * Math.PI / 2) * Math.SQRT2);
      muBus.gain.value = Math.min(1, Math.cos(a * Math.PI / 2) * Math.SQRT2);
    }
    applyMix();
    function sample(id, vol = 1, opts = {}) {
      if (muted) return null;
      const e = LIST.find(x => x.id === id); if (!e || !e.files) return null;
      const f = e.files[(Math.random() * e.files.length) | 0], buf = bufs[f]; if (!buf) return null;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf; s.playbackRate.value = R(id) * (opts.rate || 1); g.gain.value = vol * G(id);
      s.connect(g);
      let out = g; if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); out = p; }
      out.connect(fxBus);
      if (opts.loop) { s.loop = true; s.loopStart = trim[f] || 0; s.loopEnd = buf.duration; }
      s.start(ctx.currentTime, trim[f] || 0);
      return { s, g };
    }
    const api = {
      LIST, cfg, musicInput: muBus,
      set mute(v) { muted = !!v; }, get mute() { return muted; },
      setCfg(c) { cfg = merge(defaults(), c || {}); api.cfg = cfg; applyMix(); },
      applyMix,
      tick() { sample('tick', 0.7); },
      tock() { sample('tock'); },
      swipe(dir = 1) { sample('swipe', 1, { pan: dir * 0.5 }); },
      gutter() { sample('gutter'); },
      pinFirst() { sample('pinFirst'); },
      pinRepeat(v = 2) {        // capped at 10 per second so a busy deck doesn't turn to noise
        const now = performance.now();
        if (now - lastRep > 1000) { lastRep = now; repCount = 0; }
        if (++repCount > 10) return;
        sample('pinRepeat', Math.min(1, 0.25 + v * 0.18), { pan: (Math.random() - 0.5) * 0.6 });
      },
      strike() { sample('strike'); sample('cheer'); },
      spare() { sample('strike'); sample('cheer'); },
      cheer() { sample('cheer'); },
      blip() { sample('blip', 0.8); },
      go() { sample('go'); },
      spend() { sample('spend'); },
      startRoll() {
        if (rollN || muted) return;
        rollN = sample('roll', 0, { loop: true });
      },
      updateRoll(speed, dry, onLane) {
        if (!rollN) return;
        const t = ctx.currentTime;
        rollN.g.gain.setTargetAtTime((onLane ? Math.min(1, speed / 7) : speed / 14) * G('roll'), t, 0.06);
        rollN.s.playbackRate.setTargetAtTime(0.85 + Math.min(speed, 9) * 0.03, t, 0.1);
      },
      stopRoll() {
        if (!rollN) return; const n = rollN; rollN = null;
        n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); setTimeout(() => { try { n.s.stop(); } catch (e) {} }, 500);
      },
      setTension(x) {
        if (!tensN && x > 0.01 && !muted) {
          const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = 110 * R('tension'); lfo.frequency.value = 4; lg.gain.value = 6; g.gain.value = 0;
          lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(fxBus); o.start(); lfo.start(); tensN = { o, lfo, g };
        }
        if (tensN) {
          tensN.g.gain.setTargetAtTime(x * 0.05 * G('tension'), ctx.currentTime, 0.05);
          if (x <= 0.01) { const n = tensN; tensN = null; setTimeout(() => { try { n.o.stop(); n.lfo.stop(); } catch (e) {} }, 300); }
        }
      },
    };
    return api;
  }
  function merge(a, b) {
    if (b.mix) a.mix.balance = b.mix.balance ?? a.mix.balance;
    if (b.fx) Object.keys(b.fx).forEach(k => { if (a.fx[k]) a.fx[k] = Object.assign(a.fx[k], b.fx[k]); });
    return a;
  }
  window.PinfallSFX = { create, LIST, GROUPS, MUSIC, defaults };
})();
