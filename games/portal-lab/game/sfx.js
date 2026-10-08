// Portal Lab sound engine: every sound is synthesised live with Web Audio (no sample files), plus the music track.
// Defaults come from the Sound Lab; any settings tuned in Sound Lab.dc.html (localStorage 'portallab.soundlab') override them.
export class Sfx {
  GROUPS = [
    { code: '01', name: 'Player', items: [
      ['stepMetal', 'Footstep · metal', 'Most floors.', 60, 0, 2],
      ['stepPanel', 'Footstep · white panel', 'Softer, duller tap.', 55, 0, 2],
      ['stepGlass', 'Footstep · glass', 'Bright click with a tiny ring.', 50, 0, 2],
      ['stepPlatform', 'Footstep · platform / lift', 'Metal tap with a hollow clank.', 55, 0, 2],
      ['jump', 'Jump', 'Soft push-off.', 70, 0, 1.5],
      ['land', 'Land', 'Thud; the game plays it louder after long falls.', 80, 0, 1.5],
    ] },
    { code: '02', name: 'Portal gun', items: [
      ['fireBlue', 'Fire blue', 'Rising energy whoosh.', 80, 0, 1],
      ['firePink', 'Fire pink', 'The blue shot, pitched down. Pitch here is an offset from blue.', 80, -5, 1, true],
      ['hitPortal', 'Shot hits portal surface', 'The portal opens: a bright shoom with shimmer.', 80, 0, 0.5],
      ['hitFizzle', 'Shot hits non-portal surface', 'Dull fizzle on metal or glass.', 70, 0, 1],
      ['pickupGun', 'Pick up gun / unlock', 'Rising three-note chime.', 80, 0, 0],
    ] },
    { code: '03', name: 'Portals', items: [
      ['portalEnter', 'Enter / exit portal', 'Warp swoosh.', 75, 0, 1],
      ['flingRush', 'Fast fling rush', 'Rushing wind after a fast exit.', 70, 0, 1],
    ] },
    { code: '04', name: 'Boxes', items: [
      ['dropper', 'Dropper release', 'Clunk, then a hiss of air.', 75, 0, 1],
      ['grab', 'Grab box', 'Magnet click. No let-go sound.', 70, 0, 1],
      ['boxLand', 'Box lands', 'Heavy thud.', 80, 0, 2],
    ] },
    { code: '05', name: 'Actions', items: [
      ['padPress', 'Pad pressed', 'Click and a rising tone.', 75, 0, 0.5],
      ['padRelease', 'Pad released', 'Click and a falling tone.', 70, 0, 0.5],
      ['doorOpen', 'Door opens (incl. exit)', 'Lock clunk, then a mechanical slide.', 75, 0, 0.5],
      ['doorClose', 'Door closes (incl. exit)', 'Slide shut, then a lock clunk.', 75, 0, 0.5],
      ['exitFirst', 'Exit door opens (first time)', 'Door open plus a teal chime.', 80, 0, 0],
      ['levelComplete', 'Chamber cleared', 'Four-note fanfare with a sparkle.', 85, 0, 0],
    ] },
    { code: '06', name: 'Sentry', items: [
      ['sentrySpot', 'Spots you', 'Double alert beep.', 75, 0, 0],
      ['sentryFire', 'Firing', 'Rapid ticks while you take damage.', 65, 0, 0.5],
      ['sentryKnocked', 'Knocked over', 'Clatter and a power-down whine.', 80, 0, 1],
      ['gotYou', '"Sentry got you!" screen', 'Low hit as the screen appears.', 80, 0, 0],
      ['gotYouTick', 'Countdown tick', 'Plays once per second on that screen.', 60, 0, 0],
    ] },
    { code: '07', name: 'UI', items: [
      ['uiTap', 'Tap', 'Every button and hex.', 60, 0, 1],
      ['uiConfirm', 'Confirm / start chamber', 'Power-up chord on Tap to start.', 80, 0, 0],
    ] },
  ];
  BUSES = [['master', 'MASTER', 'Everything.', 80], ['sfx', 'SOUND EFFECTS', 'All game sounds below.', 85], ['music', 'MUSIC', 'portal-lab-theme', 60]];
  constructor() {
    this.S = { buses: {}, s: {} };
    let d = null; try { d = JSON.parse(localStorage.getItem('portallab.soundlab') || 'null'); } catch (e) {}
    for (const [k, , , def] of this.BUSES) this.S.buses[k] = d && d.buses && d.buses[k] != null ? d.buses[k] : def;
    for (const G of this.GROUPS) for (const [id, , , vol, pitch, rand] of G.items) { const o = d && d.s && d.s[id]; this.S.s[id] = { vol: o ? o.vol : vol, pitch: o ? o.pitch : pitch, rand: o ? o.rand : rand }; }
    this.vol = { sfx: 1, music: 0.6 };
    try {
      const ac = (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      this.mG = ac.createGain(); this.mG.connect(ac.destination);
      this.sG = ac.createGain(); this.sG.connect(this.mG);
      this.muG = ac.createGain(); this.muG.connect(this.mG);
      const n = ac.sampleRate, b = ac.createBuffer(1, n, n), c = b.getChannelData(0); for (let i = 0; i < n; i++) c[i] = Math.random() * 2 - 1; this.noiseBuf = b;
      this.apply();
    } catch (e) { this.ac = null; }
  }
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); }
  setVolumes(sfx, music) { this.vol.sfx = sfx; this.vol.music = music; this.apply(); }
  apply() {
    if (!this.ac) return; const B = this.S.buses, t = this.ac.currentTime;
    this.mG.gain.setTargetAtTime(B.master / 100, t, 0.02);
    this.sG.gain.setTargetAtTime((B.sfx / 100) * this.vol.sfx, t, 0.02);
    this.muG.gain.setTargetAtTime((B.music / 100) * this.vol.music, t, 0.05);
  }
  osc(out, type, f0, f1, t, dur, vol, att) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (att || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(out, t, dur, vol, type, f0, f1, Q, att) {
    const ac = this.ac, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = Q || 1;
    f.frequency.setValueAtTime(Math.max(20, f0), t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (att || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  SOUNDS = {
    stepMetal: (o, t, p) => { this.noise(o, t, 0.05, 0.5, 'bandpass', 2200 * p, 1600 * p, 3); this.osc(o, 'sine', 140 * p, 90 * p, t, 0.06, 0.35); },
    stepPanel: (o, t, p) => { this.noise(o, t, 0.05, 0.45, 'bandpass', 900 * p, 700 * p, 2); this.osc(o, 'sine', 110 * p, 80 * p, t, 0.07, 0.3); },
    stepGlass: (o, t, p) => { this.noise(o, t, 0.03, 0.4, 'highpass', 3500 * p, 3500 * p, 1); this.osc(o, 'sine', 2600 * p, 2500 * p, t, 0.14, 0.1); },
    stepPlatform: (o, t, p) => { this.SOUNDS.stepMetal(o, t, p); this.osc(o, 'triangle', 620 * p, 600 * p, t, 0.16, 0.08); },
    jump: (o, t, p) => { this.noise(o, t, 0.18, 0.35, 'bandpass', 500 * p, 1600 * p, 1.5, 0.02); this.osc(o, 'sine', 180 * p, 280 * p, t, 0.12, 0.2); },
    land: (o, t, p) => { this.osc(o, 'sine', 95 * p, 45 * p, t, 0.22, 0.6); this.noise(o, t, 0.12, 0.4, 'lowpass', 700 * p, 300 * p, 1); },
    fireBlue: (o, t, p) => { this.osc(o, 'triangle', 440 * p, 880 * p, t, 0.18, 0.35); this.noise(o, t, 0.2, 0.25, 'bandpass', 1200 * p, 4000 * p, 2); this.osc(o, 'sine', 110 * p, 220 * p, t, 0.15, 0.25); },
    firePink: (o, t, p) => this.SOUNDS.fireBlue(o, t, p),
    hitPortal: (o, t, p) => { this.osc(o, 'sine', 300 * p, 900 * p, t, 0.35, 0.35); [1, 1.5, 2].forEach((m) => this.osc(o, 'sine', 660 * p * m, 700 * p * m, t + 0.05, 0.45, 0.07, 0.03)); this.noise(o, t, 0.3, 0.2, 'bandpass', 800 * p, 3000 * p, 3); },
    hitFizzle: (o, t, p) => { this.osc(o, 'square', 120 * p, 80 * p, t, 0.18, 0.16); this.noise(o, t, 0.15, 0.3, 'lowpass', 900 * p, 300 * p, 1); },
    pickupGun: (o, t, p) => [440, 660, 880].forEach((f, i) => this.osc(o, 'triangle', f * p, f * p * 1.01, t + i * 0.09, 0.2, 0.3)),
    portalEnter: (o, t, p) => { this.osc(o, 'sine', 300 * p, 900 * p, t, 0.22, 0.35); this.noise(o, t, 0.25, 0.3, 'bandpass', 600 * p, 2500 * p, 2); },
    flingRush: (o, t, p) => { this.noise(o, t, 0.5, 0.45, 'bandpass', 300 * p, 2200 * p, 1.2, 0.15); this.noise(o, t + 0.45, 0.6, 0.35, 'bandpass', 2200 * p, 500 * p, 1.2, 0.02); },
    dropper: (o, t, p) => { this.osc(o, 'sine', 140 * p, 90 * p, t, 0.12, 0.5); this.noise(o, t, 0.05, 0.4, 'lowpass', 800 * p, 400 * p, 1); this.noise(o, t + 0.08, 0.45, 0.18, 'highpass', 3000 * p, 5000 * p, 0.7, 0.03); },
    grab: (o, t, p) => { this.osc(o, 'sine', 900 * p, 1400 * p, t, 0.06, 0.25); this.osc(o, 'triangle', 450 * p, 700 * p, t, 0.08, 0.15); },
    boxLand: (o, t, p) => { this.osc(o, 'sine', 75 * p, 40 * p, t, 0.26, 0.65); this.noise(o, t, 0.18, 0.45, 'lowpass', 500 * p, 200 * p, 1); },
    padPress: (o, t, p) => { this.noise(o, t, 0.03, 0.4, 'bandpass', 2000 * p, 2000 * p, 4); this.osc(o, 'triangle', 520 * p, 780 * p, t + 0.02, 0.2, 0.25); },
    padRelease: (o, t, p) => { this.noise(o, t, 0.03, 0.35, 'bandpass', 1800 * p, 1800 * p, 4); this.osc(o, 'triangle', 620 * p, 410 * p, t + 0.02, 0.2, 0.22); },
    doorOpen: (o, t, p) => { this.osc(o, 'sine', 90 * p, 60 * p, t, 0.1, 0.45); this.noise(o, t + 0.05, 0.5, 0.35, 'lowpass', 300 * p, 1200 * p, 2, 0.05); this.osc(o, 'sawtooth', 80 * p, 140 * p, t + 0.05, 0.45, 0.05, 0.05); },
    doorClose: (o, t, p) => { this.noise(o, t, 0.45, 0.35, 'lowpass', 1200 * p, 300 * p, 2, 0.05); this.osc(o, 'sawtooth', 140 * p, 80 * p, t, 0.42, 0.05, 0.05); this.osc(o, 'sine', 90 * p, 55 * p, t + 0.42, 0.12, 0.5); },
    exitFirst: (o, t, p) => { this.SOUNDS.doorOpen(o, t, p); [880, 1320].forEach((f, i) => this.osc(o, 'sine', f * p, f * p, t + 0.15 + i * 0.12, 0.9, 0.18)); },
    levelComplete: (o, t, p) => { [523, 659, 784, 1046].forEach((f, i) => this.osc(o, 'triangle', f * p, f * p * 1.01, t + i * 0.11, 0.32, 0.3)); this.osc(o, 'sine', 2093 * p, 2200 * p, t + 0.48, 0.5, 0.08); },
    sentrySpot: (o, t, p) => { this.osc(o, 'square', 880 * p, 880 * p, t, 0.07, 0.18); this.osc(o, 'square', 880 * p, 880 * p, t + 0.11, 0.07, 0.18); },
    sentryFire: (o, t, p) => { for (let i = 0; i < 9; i++) this.osc(o, 'square', 160 * p, 90 * p, t + i * 0.11, 0.06, 0.18); },
    sentryKnocked: (o, t, p) => { [0, 0.08, 0.17].forEach((d) => this.noise(o, t + d, 0.08, 0.4, 'bandpass', 1500 * p, 900 * p, 2)); this.osc(o, 'sawtooth', 500 * p, 110 * p, t, 0.6, 0.18); },
    gotYou: (o, t, p) => { this.osc(o, 'sawtooth', 220 * p, 70 * p, t, 0.6, 0.25); this.noise(o, t, 0.4, 0.35, 'lowpass', 1200 * p, 200 * p, 1); },
    gotYouTick: (o, t, p) => this.osc(o, 'sine', 660 * p, 660 * p, t, 0.12, 0.3),
    uiTap: (o, t, p) => { this.osc(o, 'sine', 1500 * p, 1300 * p, t, 0.035, 0.25); this.noise(o, t, 0.015, 0.18, 'highpass', 4000, 4000, 1); },
    uiConfirm: (o, t, p) => { this.osc(o, 'triangle', 220 * p, 440 * p, t, 0.35, 0.3, 0.02); [440, 554, 659].forEach((f) => this.osc(o, 'sine', f * p, f * p, t + 0.18, 0.55, 0.12, 0.02)); },
  };
  play(id, gain) {
    if (!this.ac || !this.SOUNDS[id] || this.vol.sfx <= 0) return;
    const s = this.S.s[id], t = this.ac.currentTime + 0.005;
    let semis = s.pitch + (Math.random() * 2 - 1) * s.rand;
    if (id === 'firePink') semis += this.S.s.fireBlue.pitch;
    const out = this.ac.createGain(); out.gain.value = (s.vol / 100) * (gain ?? 1); out.connect(this.sG);
    this.SOUNDS[id](out, t, Math.pow(2, semis / 12));
    setTimeout(() => out.disconnect(), 4000);
  }
  music(on, base) {
    if (!this.ac) return;
    if (on && !this.audioEl) {
      const a = (this.audioEl = new Audio()); a.loop = true; a.preload = 'auto';
      const root = base || './';
      a.src = a.canPlayType('audio/webm; codecs="opus"') || a.canPlayType('audio/webm') ? root + 'audio/portal-lab-theme.webm' : root + 'audio/portal-lab-theme.mp3';
      try { this.ac.createMediaElementSource(a).connect(this.muG); } catch (e) {}
    }
    if (!this.audioEl) return;
    if (on && this.audioEl.paused) this.audioEl.play().catch(() => {});
    if (!on && !this.audioEl.paused) this.audioEl.pause();
  }
  stop() { if (this.audioEl) this.audioEl.pause(); if (this.ac) this.ac.close(); }
}
